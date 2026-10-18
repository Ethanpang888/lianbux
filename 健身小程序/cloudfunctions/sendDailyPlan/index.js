// cloudfunctions/sendDailyPlan/index.js
// 每天 08:00（北京时间）定时触发：给所有「已订阅」用户发送「今日训练 + 饮食目标 + 今天吃什么」邮件。
//
// 内容渲染已抽到 ./lib/email-html.js（纯函数，可单独预览/测试）；本文件只管取用户、算日期、发信。
//
// 凭据通过 CloudBase 云函数环境变量注入（不要在代码里硬编码）：
//   CLOUD_ENV        —— 云开发环境 ID（默认见下）
//   SENDER_EMAIL     —— 发件 QQ 邮箱，如 123456@qq.com
//   SENDER_AUTH_CODE —— 该 QQ 邮箱的「授权码」（非登录密码）
//   SMTP_HOST        —— 默认 smtp.qq.com
//   SMTP_PORT        —— 默认 465（SSL）
//
// 部署后右键 config.json → 上传触发器 才会生效。

const cloud = require('wx-server-sdk')
const nodemailer = require('nodemailer')
const mail = require('./lib/email-html.js')

const ENV = process.env.CLOUD_ENV || 'cloud1-d7gtp1mv1bfcc25df'
cloud.init({ env: ENV })

// —— 北京时间（UTC+8）日期，避免云函数运行时是 UTC 导致「今天」漂移 ——
function bjDate() {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  return new Date(utcMs + 8 * 3600000)
}
function bjDateStr() {
  const b = bjDate()
  const y = b.getFullYear()
  const m = String(b.getMonth() + 1).padStart(2, '0')
  const d = String(b.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
// 「年内第几天」：给配菜用，保证同一天收到的菜单一致、隔天会换
function bjDaySeed() {
  const b = bjDate()
  const start = new Date(b.getFullYear(), 0, 0)
  return Math.floor((b - start) / 86400000)
}
function addDaysStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00+08:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function sendOne(transporter, to, subject, html, text) {
  return transporter.sendMail({
    from: '"练不虚Gym" <' + process.env.SENDER_EMAIL + '>',
    to, subject, text, html
  })
}

exports.main = async (event = {}) => {
  const today = bjDateStr()
  const seed = bjDaySeed()

  const senderEmail = process.env.SENDER_EMAIL
  const authCode = process.env.SENDER_AUTH_CODE
  if (!senderEmail || !authCode) {
    return { ok: false, error: '未配置 SENDER_EMAIL / SENDER_AUTH_CODE 环境变量' }
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: true,
    auth: { user: senderEmail, pass: authCode }
  })

  const db = cloud.database()
  let users = []
  try {
    const res = await db.collection('users').where({ subscribed: true }).limit(1000).get()
    users = res.data || []
  } catch (e) {
    return { ok: false, error: '查询订阅用户失败：' + ((e && e.message) || e) }
  }

  // 预演 / 单用户测试：event.test=true 且 event.openid 时只处理该用户
  if (event.test && event.openid) {
    users = users.filter(u => u._openid === event.openid || u._id === event.openid)
  }

  // —— 两种发送模式（北京时间的钟点决定）——
  // 08:00（daily0800 触发）：发「今天」的执行提醒 —— 2026-10-18 用户拍板：每日邮件整体收归完整版权益，免费用户不再发
  // 21:00（preview2100 触发）：发「明天预告 + 买菜清单」——只发会员
  const hour = bjDate().getHours()
  const previewMode = event.preview === true || hour >= 18   // event.preview 供云端测试手动触发

  const isMemberUser = u => {
    const mm = u.member || {}
    return !!mm.level && (!mm.expiresAt || mm.expiresAt >= today)
  }
  let targets = users.filter(u => u.email && u.subscribed && isMemberUser(u))
  if (!targets.length) {
    return {
      ok: true, sent: 0, skipped: users.length, mode: previewMode ? 'preview' : 'daily',
      note: previewMode ? '无需要明日预告的会员' : '无已订阅且有邮箱的用户'
    }
  }

  // 预告模式：内容整体用「明天」的日期与菜单种子
  const tomorrowStr = addDaysStr(today, 1)
  const contentDate = previewMode ? tomorrowStr : today
  const contentSeed = previewMode ? seed + 1 : seed
  const subject = previewMode
    ? '练不虚Gym · 明日预告 + 买菜清单（' + tomorrowStr + '）'
    : '练不虚Gym · 今日计划（' + today + '）'
  const isSunday = bjDate().getDay() === 0 && !previewMode
  // —— 第一步：本地组装每个人的邮件内容（快，不占 SMTP 时间）——
  const payloads = []
  for (const u of targets) {
    const profile = u.profile || {}
    const plan = u.plan || null
    const dietState = u.dietState || {}
    const home = plan ? !!plan.home : false

    // —— 会员判定：member.level 存在且未过期 ——
    const m = u.member || {}
    const isMember = !!m.level && (!m.expiresAt || m.expiresAt >= today)

    const todaySec = mail.buildTodaySection(plan, profile, home, contentDate)
    const dietSec = mail.buildDietSection(profile, dietState)
    // 菜谱模式（配好菜三餐）是会员权益：非会员无论 App 里选什么，邮件一律按「只给克数」发
    const menuSec = mail.buildMenuSection(profile, dietState, contentSeed, isMember)
    // 周日给会员追加「每周复盘」（打卡率/体重趋势/睡眠 + 调整建议）
    let weeklySec = null
    if (isMember && isSunday && !event.dryRun) {
      try {
        weeklySec = await mail.buildWeeklySection(u._openid || u._id, today, db)
      } catch (e) { weeklySec = null }
    }
    // 预告模式：追加买菜清单
    let shopSec = null
    if (previewMode) {
      try { shopSec = mail.buildShoppingListSection(profile, dietState, contentSeed) } catch (e) { shopSec = null }
    }
    const html = mail.buildHtml(contentDate, todaySec, dietSec, menuSec, weeklySec, shopSec)
    const text = mail.buildText(contentDate, todaySec, dietSec, menuSec, weeklySec, shopSec)

    payloads.push({
      openid: u._openid || u._id, email: u.email, subject, html, text,
      title: todaySec.title, dietMode: profile.dietMode || 'simple',
      member: isMember ? (m.level + '·至' + (m.expiresAt || '长期')) : 'free'
    })
  }

  // —— 干跑：只返回内容不发送 ——
  if (event.dryRun) {
    return { ok: true, mode: previewMode ? 'preview' : 'daily', date: today, total: payloads.length, details: payloads }
  }

  // —— 第二步：分批并发发送（每批 5 封同时发）——
  // 串行 1.4s/封 20 秒只能发 ~13 封；并发后同样的时间发 5 倍，60 秒超时可到 150-200 封
  const CHUNK = 5
  const results = []
  for (let i = 0; i < payloads.length; i += CHUNK) {
    const batch = payloads.slice(i, i + CHUNK)
    const settled = await Promise.all(batch.map(p =>
      sendOne(transporter, p.email, p.subject, p.html, p.text)
        .then(() => ({ openid: p.openid, email: p.email, status: 'sent' }))
        .catch(e => ({ openid: p.openid, email: p.email, status: 'failed', error: (e && e.message) || String(e) }))
    ))
    results.push(...settled)
  }

  const sent = results.filter(r => r.status === 'sent').length
  const failed = results.filter(r => r.status === 'failed').length
  return { ok: true, date: today, mode: previewMode ? 'preview' : 'daily', total: payloads.length, sent, failed, details: results }
}
