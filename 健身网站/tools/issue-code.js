#!/usr/bin/env node
/* tools/issue-code.js —— 给买家发开通码：一条命令，**不用重新部署**
 *
 * 流程（路线 1 · 个人收款码 + 人工发码）：
 *   买家扫码付款 → 你跑这条命令 → 把打出来的码发给买家 → 买家在网站「开通」里输入。
 *   码由云端核销（只存指纹、一次一用），所以发出去立刻就能用。
 *
 * 用法：
 *   node tools/issue-code.js pro 30                     # 1 个「完整版」30 天码
 *   node tools/issue-code.js coach 30 --count 5         # 一次出 5 个
 *   node tools/issue-code.js pro 365 --note "微信订单88" # 备注订单号，方便对账
 *   node tools/issue-code.js --list                     # 看最近发的码（只显示状态，不显示明文）
 *
 * 密钥（三选一，优先级从高到低）：
 *   1. --secret <AUTH_SECRET>
 *   2. 环境变量 AUTH_SECRET
 *   3. 文件 健身网站/.auth-secret（把密钥单独放一行；这文件别提交、别外发）
 *   没配过的话：./tools/tcb.sh fn detail webApi -e cloud1-d7gtp1mv1bfcc25df 看「环境变量」那一行。
 *
 * ⚠️ 这里的 adminSign 算法必须与 shared/authkit.js 的 adminSign 一致（test-auth 有静态比对）。
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const GATEWAY = process.env.API_URL ||
  'https://cloud1-d7gtp1mv1bfcc25df-1469515685.ap-shanghai.app.tcloudbase.com/api'
// ⚠️ 买家要打开的是**网站**，不是 API 网关 —— 两个域名长得像，千万别混（话术里用的是这个）
const SITE = process.env.SITE_URL ||
  'https://c289b837374c4dfc8f14d386d2e36a02.app.workbuddy.host'
const SECRET_FILE = path.join(__dirname, '..', '.auth-secret')

function adminSign(secret, tag, ts) {
  return crypto.createHmac('sha256', String(secret))
    .update('issue:' + tag + ':' + ts).digest('hex').slice(0, 32)
}

function loadSecret(explicit) {
  if (explicit) return explicit
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET
  try {
    const s = fs.readFileSync(SECRET_FILE, 'utf8').trim()
    if (s) return s
  } catch (e) { /* 没有这个文件 */ }
  return ''
}

function usage() {
  console.log('用法：node tools/issue-code.js <pro|coach> <天数> [--count N] [--note 备注]')
  console.log('      node tools/issue-code.js --list')
  process.exit(1)
}

async function call(payload) {
  const res = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  let r = null
  try { r = await res.json() } catch (e) { r = null }
  if (!r) { console.error('❌ 服务器没有返回 JSON（HTTP ' + res.status + '）'); process.exit(1) }
  return r
}

async function main() {
  const argv = process.argv.slice(2)
  let secret = null, list = false
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--secret') secret = argv[++i]
    else if (argv[i] === '--list') list = true
    else rest.push(argv[i])
  }
  const key = loadSecret(secret)
  if (!key) {
    console.error('❌ 没找到 AUTH_SECRET。三选一：--secret xxx / 环境变量 / 文件 .auth-secret')
    console.error('   （密钥在 ./tools/tcb.sh fn detail webApi -e cloud1-d7gtp1mv1bfcc25df 的「环境变量」里）')
    process.exit(1)
  }
  const ts = Date.now()
  const sig = adminSign(key, 'issue', ts)

  if (list) {
    const r = await call({ action: 'listCodes', ts, sig })
    if (!r.ok) { console.error('❌ ' + (r.code || 'SERVER')); process.exit(1) }
    if (!r.codes.length) { console.log('（还没有发过码）'); return }
    console.log('最近 ' + r.codes.length + ' 个码（fp = 指纹前 6 位，用于对账）：')
    r.codes.forEach(c => console.log(
      '  ' + c.fp + '  ' + (c.level === 'coach' ? '完整版+AI' : '完整版  ') +
      '  ' + c.days + ' 天  ' + (c.used ? '✅ 已用' : '　未用') +
      (c.note ? '  备注:' + c.note : '')))
    return
  }

  const level = rest[0]
  if (['pro', 'coach', 'plus', 'p12'].indexOf(level) < 0) usage()
  const days = (level === 'plus' || level === 'p12') ? 9999 : Number(rest[1])
  if (level !== 'plus' && level !== 'p12' && (!days || days < 1)) usage()
  let count = 1, note = ''
  const ci = argv.indexOf('--count')
  if (ci >= 0) count = Number(argv[ci + 1]) || 1
  const ni = argv.indexOf('--note')
  if (ni >= 0) note = argv[ni + 1] || ''

  const r = await call({ action: 'issueCode', ts, sig, level, days, count, note })
  if (!r.ok) {
    console.error('❌ 发码失败：' + (r.code || 'SERVER'))
    if (r.code === 'NOT_ADMIN') console.error('   管理签名不对 —— 密钥是不是复制错了？')
    process.exit(1)
  }
  const name = r.level === 'coach' ? '完整版 + AI 顾问' : r.level === 'plus' ? '进阶包（买断）' : r.level === 'p12' ? '十二周计划（单份）' : '完整版'
  console.log('✅ 生成 ' + r.codes.length + ' 个「' + name + '」码' +
    (r.level === 'plus' || r.level === 'p12' ? '' : '（' + r.days + ' 天）') + (note ? ' · ' + note : ''))
  console.log('')
  r.codes.forEach(c => console.log('   ' + c))
  console.log('')
  console.log('⚠️ 码没存明文，关了窗口就找不回来 —— 现在就复制走。')
  console.log('')
  console.log('─── 给买家的发货话术（整段复制即可）───')
  r.codes.forEach(c => console.log('你的开通码：' + c))
  console.log('使用：打开 ' + SITE + ' （手机浏览器也行）')
  console.log('注册/登录后 → 「我的」→「完整版」→ 输入开通码 → 点「开通」')
  console.log('（一个码只能激活一个账号，请勿外传）')
  console.log('────────────────────────────────────')
}

main().catch(e => { console.error('❌ ' + ((e && e.message) || e)); process.exit(1) })
