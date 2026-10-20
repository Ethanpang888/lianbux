// cloudfunctions/webApi/index.js —— 网页版数据接口（鉴权 = webAuth 签发的 token）
//
// 核心原则：**服务端权威**。
//   客户端只提交"我干了什么"（训练记录 / 档案 / 饮食偏移），
//   EXP、等级、徽章、连续天数**一律由服务端用同一套引擎重算**，客户端算的只用于即时反馈。
//   否则改一下浏览器内存就能刷满级。
//
// 入口与 webAuth 一致：SDK 调用（event.action）与 HTTP 访问服务（event.httpMethod）双兼容。
//
// 环境变量：AUTH_SECRET（必填）、CLOUD_ENV、ALLOW_ORIGIN

const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const K = require('./lib/authkit.js')
const gamify = require('./lib/gamify.js')
const journal = require('./lib/journal.js')
const cardioLog=require('./lib/cardio.js')
const calc = require('./lib/calc.js')
const kb = require('./lib/kb.js')
const progression=require('./lib/progression.js')
const macro = require('./lib/macro.js')
const cultivation = require('./lib/cultivation.js')

const ENV = process.env.CLOUD_ENV || 'cloud1-d7gtp1mv1bfcc25df'
cloud.init({ env: ENV })
const db = cloud.database()
const _ = db.command

const COL = { users: 'webusers', checkins: 'webcheckins', board: 'rankrows', links: 'links', codes: 'bindcodes', mpUsers: 'users', mpCheckins: 'checkins' }

// ───────────────────────── 小工具 ─────────────────────────

function secret() {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) throw new Error('AUTH_SECRET_MISSING')
  return s
}
function ok(data) { return Object.assign({ ok: true }, data || {}) }
function fail(code, extra) { return Object.assign({ ok: false, code }, extra || {}) }

function bjDateStr(d) {
  const now = d || new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const b = new Date(utc + 8 * 3600000)
  const p = x => String(x).padStart(2, '0')
  return b.getFullYear() + '-' + p(b.getMonth() + 1) + '-' + p(b.getDate())
}
function weekKeyOf(dateStr) {
  const d = new Date((dateStr || bjDateStr()) + 'T00:00:00')
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day + 3)
  const firstThu = new Date(d.getFullYear(), 0, 4)
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7)
  return d.getFullYear() + '-W' + String(week).padStart(2, '0')
}

async function getOne(collection, id) {
  return db.collection(collection).doc(id).get().then(r => (r && r.data) || null).catch(() => null)
}
/**
 * 写入一条记录（set = 不存在则创建、存在则替换）。
 * ⚠️ data 里绝不能含 `_id`/`_openid`（云开发会报 -501007），统一交给 K.stripReserved()。
 *    别写成 `.catch(() => add(...))` —— 真实错误会被吞掉、只剩一个误导性的主键冲突。
 */
async function setDoc(collection, id, data) {
  return db.collection(collection).doc(id).set({ data: K.stripReserved(data) })
}

/** 鉴权：从 event.token 解出 uid + 取用户；返回 { user } 或 { err } */
async function auth(event) {
  const p = K.verifyToken(event && event.token, secret(), Date.now())
  if (!p) return { err: fail('AUTH_EXPIRED') }
  const user = await getOne(COL.users, p.uid)
  if (!user) return { err: fail('NO_USER') }
  return { user, uid: p.uid }
}

/** 返回给前端的用户数据（剔除服务端字段） */
function publicUser(u) {
  if (!u) return null
  return {
    uid: u.uid, email: u.email, playerNo: u.playerNo,
    profile: u.profile, plan: u.plan, dietState: u.dietState,
    gamify: u.gamify, privacy: u.privacy, member: u.member,
    subscribed: u.subscribed, emailSub: u.emailSub, createdAt: u.createdAt
  }
}

// ───────────────────────── 读状态 ─────────────────────────

async function getState(event, uid, user) {
  const snap = await db.collection(COL.checkins)
    .where({ uid }).orderBy('date', 'desc').limit(90).get()
    .catch(() => ({ data: [] }))
  const checkins = (snap.data || []).map(c => {
    const o = Object.assign({}, c)
    delete o._id; delete o.uid
    return o
  }).reverse()
  return ok({
    user: publicUser(user),
    playerNoText: K.fmtPlayerNo(user.playerNo),
    founding: K.isFounding(user.playerNo),
    checkins
  })
}

// ───────────────────────── 写档案 ─────────────────────────

/**
 * 只允许改这几个白名单字段；gamify.exp 之类一律不接受客户端写入。
 * ⚠️ **member / gamify 绝不能进这个数组** —— 会员与会话数据一旦可写就等于白送，
 *    会员只能由 redeem（或将来的支付回调）写。test-auth 有静态断言挡回归。
 */
const WRITABLE = ['profile', 'plan', 'dietState', 'privacy', 'emailSub', 'subscribed', 'nick',
  // 2026-10-17：计划库/秘籍快照/破境展示位（数据层新字段，非会员非会话）
  'savedPlans', 'activeSavedId', 'lastPlanBackup', 'breakShown']

async function putState(event, uid, user) {
  const patch = event.patch || {}
  const applied = []
  for (const k of WRITABLE) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      // 简单校验：不允许塞超大对象（防止把库撑爆）
      if (JSON.stringify(patch[k] || null).length > 200000) return fail('TOO_LARGE', { field: k })
      user[k] = patch[k]; applied.push(k)
    }
  }
  if (!applied.length) return fail('NOTHING_TO_UPDATE')
  user.lastSeenAt = Date.now()
  await setDoc(COL.users, uid, user)
  return ok({ applied, user: publicUser(user) })
}

// ───────────────────────── 打卡（服务端权威结算 EXP）─────────────────────────

const ROLE_OK = ['主项', '辅助', '孤立', '核心', '热身', '其他']

/**
 * 日志入库前的规范化。空内容返回 undefined（不写这个字段）。
 * ⚠️ journal.normalize 会把 photos 一起带出来 —— 这里显式剔除，
 *    照片永远不上云（产品红线：手机照片带 GPS/人脸，上传等于自找合规麻烦）。
 */
function noteOf(raw) {
  if (!raw) return undefined
  const src = (typeof raw === 'object') ? raw : { text: String(raw) }
  const n = journal.normalize(src)
  if (!journal.hasContent(n)) return undefined
  return { text: n.text, subject: n.subject, tag: n.tag, at: Number(n.at) || Date.now() }
}

function sanitizeCheckin(raw, uid) {
  if (!raw || typeof raw !== 'object') return null
  const date = String(raw.date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  // 日期合理性：不能是未来、也不能早于 2020（防乱写刷连击）
  const today = bjDateStr()
  if (date > today) return null
  if (date < '2020-01-01') return null

  const exs = Array.isArray(raw.exercises) ? raw.exercises.slice(0, 30) : []
  const exercises = exs.map(e => ({
    oid:String((e&&e.oid)||'').slice(0,100),
    target:progression.cleanTarget(e&&e.target),progressReady:!!(e&&e.progressReady),
    name: String((e && e.name) || '').slice(0, 40),
    role: ROLE_OK.indexOf(e && e.role) >= 0 ? e.role : '其他',
    sets: String((e && e.sets) || '').slice(0, 20),
    log: (Array.isArray(e && e.log) ? e.log : []).slice(0, 12).map(s => ({
      weight: Math.max(0, Math.min(1000, Number(s && s.weight) || 0)),
      reps: Math.max(0, Math.min(200, Number(s && s.reps) || 0)),
      done: !!(s && s.done),type:s&&s.type==='warmup'?'warmup':'work'
    }))
  }))

  const dietLog = (Array.isArray(raw.dietLog) ? raw.dietLog : []).slice(0, 80).map(d => ({
    name: String((d && d.name) || '').slice(0, 30),
    grams: Math.max(0, Math.min(5000, Number(d && d.grams) || 0)),
    kcal: Math.max(0, Math.min(5000, Number(d && d.kcal) || 0)),
    protein: Math.max(0, Math.min(500, Number(d && d.protein) || 0)),
    carbs: Math.max(0, Math.min(1000, Number(d && d.carbs) || 0)),
    fat: Math.max(0, Math.min(500, Number(d && d.fat) || 0)),
    fiber: Math.max(0, Math.min(200, Number(d && d.fiber) || 0))
  }))

  return {
    date,
    ...(Object.prototype.hasOwnProperty.call(raw,'cardio')?{cardio:cardioLog.clean(raw.cardio)}:{}),
    trained: !!raw.trained,
    exercises,
    dietLog,
    waterMl: Math.max(0, Math.min(10000, Number(raw.waterMl) || 0)),
    sleepHours: Math.max(0, Math.min(24, Number(raw.sleepHours) || 0)),
    weight: (Number(raw.weight) > 20 && Number(raw.weight) < 400) ? Number(raw.weight) : 0,
    // 日志：只存「文字 / 标题 / 主题」，**照片字段有意丢掉**（照片只留在用户本机）。
    // 规范化统一走 shared/journal.js，避免两边各写一套规则。
    note: noteOf(raw.note),
    updatedAt: Date.now()
  }
}

async function upsertCheckin(event, uid, user) {
  const ck = sanitizeCheckin(event.checkin, uid)
  if (!ck) return fail('BAD_CHECKIN')

  const id = uid + '_' + ck.date
  const prev = await getOne(COL.checkins, id)
  // Older clients do not submit cardio; their strength/meal saves must preserve it.
  if (!Object.prototype.hasOwnProperty.call(ck,'cardio') && prev && prev.cardio) ck.cardio=cardioLog.clean(prev.cardio)

  const profile = user.profile || {}
  const dietState = user.dietState || {}
  const adj = macro.combinedAdj(dietState)
  let targets = { kcal: 0, protein: 0 }
  try {
    const e = calc.energyPlan(profile, adj)
    targets = { kcal: e.kcal, protein: e.protein }
  } catch (err) { /* 档案不全时按 0，不阻塞打卡 */ }

  // 幂等由 gamify 内部处理（caps 记的是「当日原始值高水位」，重复提交差额为 0），
  // 所以这里不需要传上一版记录。
  const badgesBefore = ((user.gamify || {}).badges || []).map(b => b.k)

  const r = gamify.calcCheckinExp({
    user: user,
    checkin: ck,
    prevCheckin: prev,             // 上一版打卡（增量语义：同日补记不漏、重复保存不双计）
    profile: profile,
    targets: targets,
    today: bjDateStr(),
    weekKey: weekKeyOf(ck.date),
    isFirstToday: !prev,           // 当天首份提交（生活项/连续推进）
    firstTrainOfDay: !prev || (!!ck.trained && !prev.trained),   // 当天首次有效训练提交（训练类累计）
    hour: new Date().getHours()
  })

  // 结算后的 gamify 状态写回用户
  user.gamify = Object.assign({}, user.gamify || {}, {
    exp: r.exp, level: r.level, badges: r.badges, streak: r.streak,
    caps: r.caps, weekTask: r.weekTask, counters: r.counters
  })
  user.lastSeenAt = Date.now()

  await setDoc(COL.checkins, id, Object.assign({ uid }, ck))
  await setDoc(COL.users, uid, user)

  // 双端互通：该网站账号绑定了小程序 → 这条打卡镜像到 checkins（_openid 让小程序端能查到）
  try {
    const link = await getLinkByWebUid(uid)
    if (link) {
      const mpOpenid = String(link._id || '').replace(/^mp-/, '')
      if (mpOpenid) {
        await db.collection(COL.mpCheckins).doc('mp-' + mpOpenid + '_' + ck.date)
          .set({ data: webCkToMp(Object.assign({}, ck, { dayIndex: (ck.dayIndex || 0), dietOk: !!(ck.dietOk) }), mpOpenid) })
          .catch(() => null)
      }
    }
  } catch (e) { /* 镜像失败不阻塞网站打卡 */ }

  const newBadges = (r.badges || []).filter(b => badgesBefore.indexOf(b.k) < 0)

  return ok({
    gained: r.gained,
    exp: r.exp,
    level: r.level,
    leveledUp: r.leveledUp,
    levelInfo: r.levelInfo,
    breakdown: r.breakdown,
    newBadges: newBadges,
    caps: r.caps,
    streak: r.streak,
    gamify: user.gamify
  })
}

async function listCheckins(event, uid) {
  const limit = Math.min(120, Math.max(1, Number(event.limit) || 60))
  const snap = await db.collection(COL.checkins)
    .where({ uid }).orderBy('date', 'desc').limit(limit).get()
    .catch(() => ({ data: [] }))
  return ok({ checkins: (snap.data || []).map(c => {
    const o = Object.assign({}, c); delete o._id; delete o.uid; return o
  }).reverse() })
}

// ───────────────────────── 排行榜（全国 / 同城 · 网站与小程序同榜）─────────────────────────

/**
 * 2026-10-17 起：榜源 = 共享集合 rankrows，两个生态同榜。
 *   网站行 _id='web-<uid>'   （gamify 由云端结算写入，最权威）
 *   小程序行 _id='mp-<openid>'（每次读榜时服务端重放该 openid 的 checkins 现算，防客户端伪造）
 * 只吐能公开的字段：昵称、玩家编号、城市、三个榜的数值。**绝不返回 email / 体重体脂。**
 */

function weekStartOf(today) {
  const d = new Date(today + 'T00:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 网站用户 → 榜行（gamify 云端结算，原样引用） */
async function webBoardUpsert(uid, user) {
  if (!user) return
  await db.collection(COL.board).doc('web-' + uid).set({ data: {
    src: 'web', uid: uid,
    nick: String(user.nick || '练友').slice(0, 12),
    city: (user.profile || {}).city || '',
    playerNo: user.playerNo || 0,
    gamify: user.gamify || { exp: 0, streak: { cur: 0 }, weekTask: { volume: 0 } },
    updatedAt: Date.now()
  } }).catch(() => null)
}

/** 小程序用户 → 榜行（服务端重放 checkins：exp/连续用 cultivation，本周容量现算） */
async function mpBoardUpsert(openid) {
  const user = await getOne('users', openid)
  if (!user) return
  let checkins = []
  try {
    const snap = await db.collection('checkins').where({ _openid: openid }).orderBy('date', 'desc').limit(365).get()
    checkins = ((snap && snap.data) || []).reverse()
  } catch (e) { /* 读不了就按空算 */ }
  let sum = null
  try { sum = cultivation.summarize(checkins, user.profile || {}) } catch (e) { sum = null }
  // 本周容量（克）：本周一起、完成组的 重量×次数 之和（与网站 weekTask.volume 同口径）
  const ws = weekStartOf(new Date().toISOString().slice(0, 10))
  let volume = 0
  checkins.filter(c => c.date >= ws && c.trained).forEach(c => {
    ;(c.exercises || []).forEach(e => (e.log || []).forEach(s => {
      if (s.done) volume += (Number(s.weight) || 0) * (Number(s.reps) || 0)
    }))
  })
  await db.collection(COL.board).doc('mp-' + openid).set({ data: {
    src: 'mp', uid: 'mp-' + openid,
    nick: String((user.profile || {}).nickname || '练友').slice(0, 12),
    city: (user.profile || {}).city || '',
    playerNo: user.playerNo || 0,
    gamify: {
      exp: sum ? sum.exp : 0,
      streak: { cur: sum ? sum.streak.cur : 0, best: sum ? sum.streak.best : 0 },
      weekTask: { volume: volume }
    },
    updatedAt: Date.now()
  } }).catch(() => null)
}

async function leaderboard(event, uid, webUser, mpOpenid) {
  const board = ['level', 'streak', 'volume'].indexOf(event.board) >= 0 ? event.board : 'level'
  const scope = event.scope === 'city' ? 'city' : 'all'
  const city = gamify.normCity(event.city || '')
  const limit = Math.min(100, Math.max(5, Number(event.limit) || 50))

  // 选了同城榜但没设城市 → 直接返回空，不要"顺带"把全国数据当同城发出去
  if (scope === 'city' && !city) {
    return ok({ list: [], me: null, myRank: null, total: 0, scope: scope, city: '', board: board, thin: true })
  }

  // ① caller 自己那行先刷新进共享榜（服务端算，客户端改不了）
  try {
    if (mpOpenid) await mpBoardUpsert(mpOpenid)
    else await webBoardUpsert(uid, webUser)
  } catch (e) { /* 刷不动就不刷，榜照出 */ }

  // ② 首次启用：共享榜还是空的 → 把网站存量用户灌进去（一次性，之后靠各自 upsert 保持新鲜）
  try {
    const cnt = await db.collection(COL.board).count()
    if (!(cnt.total > 0)) {
      const snap = await db.collection(COL.users).limit(500).get().catch(() => ({ data: [] }))
      for (const r of (snap.data || [])) {
        await db.collection(COL.board).doc('web-' + r._id).set({ data: {
          src: 'web', uid: r._id,
          nick: String(r.nick || '练友').slice(0, 12),
          city: (r.profile || {}).city || '',
          playerNo: r.playerNo || 0,
          gamify: r.gamify || { exp: 0, streak: { cur: 0 }, weekTask: { volume: 0 } },
          updatedAt: Date.now()
        } }).catch(() => null)
      }
    }
  } catch (e) { /* 灌库失败不阻塞读榜 */ }

  // ③ 从共享榜聚合（网站 + 小程序同池）
  let rows = []
  const snap = await db.collection(COL.board).limit(500).get().catch(() => ({ data: [] }))
  rows = (snap.data || []).map(r => ({ uid: r.uid, nick: r.nick, city: r.city, playerNo: r.playerNo, gamify: r.gamify || {} }))

  const me = mpOpenid ? ('mp-' + mpOpenid) : uid
  const res = gamify.rankBoard(rows, { scope: scope, city: city, board: board, me: me, limit: limit })
  // 端标：📱 小程序 / 🌐 网站（rankBoard 输出不含 src，按 uid 补）
  const srcMap = {}
  ;(snap.data || []).forEach(r => { if (r.uid) srcMap[r.uid] = r.src || '' })
  ;(res.list || []).forEach(x => { x.src = srcMap[x.uid] || '' })
  if (res.me) res.me.src = srcMap[res.me.uid] || ''
  return ok(res)
}

// ───────────────────────── 注销（合规：真删）─────────────────────────

async function deleteAccount(event, uid, user) {
  // 防误触：必须显式传 confirm:'DELETE'
  if (event.confirm !== 'DELETE') return fail('NEED_CONFIRM')
  const snap = await db.collection(COL.checkins).where({ uid }).limit(500).get().catch(() => ({ data: [] }))
  for (const c of (snap.data || [])) {
    await db.collection(COL.checkins).doc(c._id).remove().catch(() => null)
  }
  await db.collection(COL.users).doc(uid).remove().catch(() => null)
  return ok({ deleted: true })
}

// ───────────────────────── 会员与订单（支付的地基）─────────────────────────
//
// 为什么必须放服务端：会员状态只要客户端能写，改一下浏览器内存就白嫖了。
//   所以 `member` **不在 putState 的 WRITABLE 白名单里** —— 只有这里的核销能写它。
//   前端也拿不到任何口令明文：码表只存指纹。
//
// ⚠️ 现在真能用的只有「激活码核销」。真实支付通道（微信支付）需要商户号 + 主体资质，
//    接进来时只需补两段：① 下单 ② 支付回调验签后调 grantMember。
//    **权益发放逻辑（grantMember）不用改** —— 这样将来换通道只动一小块。
//
// 集合 weborders：每一次权益发放都落一条（兑换/支付），用于去重与对账。

const COL_ORDERS = 'weborders'   // 审计流水（可选集合）
const COL_CODES = 'webcodes'     // 零售激活码（发码接口写入；首次发码自动建集合）
const CODE_SALT = 'qing-plan-2026'

/**
 * 激活码表 —— 只存指纹，明文不落代码（前端更看不到）。
 * 加码/换码：node tools/gen-code.js "新口令" pro 365
 */
const CODES = [
  { h: '3ecf8200f1edc65cf6118d5c', level: 'pro', days: 3650, note: '完整版 · 长期码' },
  { h: '8020636a96423dcc2cbebd5d', level: 'coach', days: 30, note: '完整版 + AI 顾问 · 30 天' }
]
const LEVEL_RANK = { '': 0, pro: 1, coach: 2 }

function codeHash(plain) {
  return require('crypto').createHash('sha256')
    .update(String(plain || '').trim().toLowerCase() + '|' + CODE_SALT)
    .digest('hex').slice(0, 24)
}

/**
 * 发放会员权益 —— **唯一入口**（兑换码与将来的支付回调都走这里）。
 * 续期：在现有到期时间上往后加，不覆盖不重算；
 * 等级不降级：coach 还没过期时兑 pro 码，不会把自己降下来。
 */
async function grantMember(uid, user, opt, col, writer) {
  const cur = (user && user.member) || {}
  const from = Math.max(Date.now(), Date.parse(cur.expiresAt || '') || 0)
  const days = Math.max(1, Number(opt.days) || 30)
  const alive = (Date.parse(cur.expiresAt || '') || 0) > Date.now()
  const level = (alive && (LEVEL_RANK[cur.level] || 0) > (LEVEL_RANK[opt.level] || 0))
    ? cur.level : opt.level
  user.member = {
    level: level,
    expiresAt: new Date(from + days * 86400000).toISOString(),
    since: cur.since || new Date().toISOString().slice(0, 10)
  }
  user.lastSeenAt = Date.now()
  if(writer)await writer(user);else await setDoc(col || COL.users, uid, user)
  return user.member
}

/** 兑换激活码。码有两个来源：① 云函数内置码表 ② webcodes 里的零售码（发码接口生成，一次一用） */
async function redeem(event, uid, user, col) {
  const code = String((event && event.code) || '').trim()
  if (!code) return fail('CODE_EMPTY')
  if (code.length > 64) return fail('CODE_INVALID')
  const h = codeHash(code)

  // 来源①：内置码（改码走 tools/gen-code.js，需要重新部署）
  const hit = CODES.filter(c => c.h === h)[0]
  let grant = hit ? { level: hit.level, days: hit.days } : null
  let retail = null

  // 来源②：零售码（issueCode 生成、库里只存指纹、一次一用）
  if (!grant) {
    const r = await db.collection(COL_CODES).where({ hash: h }).limit(1).get()
      .catch(() => ({ data: [] }))
    const c = (r.data || [])[0]
    if (c) {
      if (c.used) return fail('CODE_REDEEMED')
      grant = { level: c.level, days: c.days }
      retail = c
    }
  }
  if (!grant) return fail('CODE_INVALID')

  // 去重记录写在 **user 文档**里（这个文档一定存在），不依赖额外集合 ——
  // 否则「集合没建 → 去重静默失效 → 同一个码反复兑」，等于把期限刷成无限。
  const used = Object.assign({}, user.redeemed || {})
  if (used[h]) return fail('CODE_REDEEMED')

  // 只有「内置码的总次数上限」才需要全库计数；集合没建时这里查不到，只是不限制
  if (hit && hit.maxUses) {
    const all = await db.collection(COL_ORDERS)
      .where({ codeHash: h }).count().catch(() => ({ total: 0 }))
    if ((all.total || 0) >= hit.maxUses) return fail('CODE_EXHAUSTED')
  }

  // Claim a retail code and grant its entitlement in the same transaction.
  // Re-read the user in the transaction: concurrent redemptions cannot erase another grant.
  let result
  try {
    result=await db.runTransaction(async tx=>{
      const ref=tx.collection(col||COL.users).doc(uid),snap=await ref.get(),fresh=snap.data||{}
      const redeemed=Object.assign({},fresh.redeemed||{})
      if(redeemed[h])throw new Error('CODE_REDEEMED')
      if(retail){const codeRef=tx.collection(COL_CODES).doc(retail._id),c=await codeRef.get();if(!c.data||c.data.used)throw new Error('CODE_REDEEMED');await codeRef.update({data:{used:true,usedBy:uid,usedAt:Date.now()}})}
      redeemed[h]=Date.now();fresh.redeemed=redeemed
      const save=async value=>{const clean=Object.assign({},value);delete clean._id;delete clean._openid;await ref.update({data:clean})}
      if(grant.level==='plus'){fresh.plus={since:new Date().toISOString().slice(0,10)};await save(fresh)}
      else if(grant.level==='p12'){fresh.plan12={since:new Date().toISOString().slice(0,10),goal:['增肌','减脂','增肌减脂','塑形'].includes(event.goal)?event.goal:''};await save(fresh)}
      else await grantMember(uid,fresh,{level:grant.level,days:grant.days},col,save)
      return {member:fresh.member||{level:'',expiresAt:''},plus:fresh.plus||null,plan12:fresh.plan12||null}
    })
  }catch(e){if(e.message==='CODE_REDEEMED')return fail('CODE_REDEEMED');throw e}
  await db.collection(COL_ORDERS).add({data:{uid,codeHash:h,level:grant.level,days:grant.days,kind:'redeem',at:Date.now()}}).catch(e=>console.error('order write failed',e))
  return ok(result)
}

// ── 发码（管理员接口）：本地 CLI 一条命令出码，不用重新部署 ──
// 鉴权 = K.adminVerify（AUTH_SECRET 的 HMAC）；这两个 action 在 handle 里**不走用户登录**
//（CLI 没有用户 token），只认管理签名 —— 密钥本身不上网。

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'   // 去掉易混淆的 0/O/1/I/L

function genRetailCode() {
  let s = ''
  for (let i = 0; i < 8; i++) {
    s += CODE_ALPHABET[require('crypto').randomBytes(1)[0] % CODE_ALPHABET.length]
  }
  return 'QING-' + s.slice(0, 4) + '-' + s.slice(4)
}

/** 集合不存在就创建（幂等；控制台不手动建也行） */
async function ensureCollection(name) {
  try { await db.createCollection(name) } catch (e) { /* 已存在 / 无权限，忽略 */ }
}

/** 生成零售激活码：明文只在返回里出现一次，库里只存指纹 */

// ───── 虚拟支付（个人主体，2026-10-20 官方文档接入）─────
// 环境变量：VP_OFFER_ID（虚拟支付→基本配置）、VP_APP_KEY（现网AppKey）、WX_APP_SECRET（mp后台→开发设置→AppSecret）
// 商品映射（与 MP 后台「道具管理」一一对应，价格单位=分）
const VP_OFFER_ID = (process.env.VP_OFFER_ID || '').trim()
const VP_APP_KEY = (process.env.VP_APP_KEY || '').trim()
const WX_APP_SECRET = (process.env.WX_APP_SECRET || '').trim()
const VP_PRODUCTS = {
  pro_m: { cents: 1990, level: 'pro', days: 30, name: '完整版月卡' },
  pro_q: { cents: 4990, level: 'pro', days: 90, name: '完整版季卡' },
  pro_h: { cents: 8900, level: 'pro', days: 182, name: '完整版半年卡' },
  pro_y: { cents: 16800, level: 'pro', days: 365, name: '完整版年卡' },
  plus1: { cents: 9900, level: 'plus', days: 9999, name: '进阶包' },
  p12: { cents: 3990, level: 'p12', days: 84, name: '十二周计划' }
}
function vpPaySig(uri, body) {
  return crypto.createHmac('sha256', VP_APP_KEY).update(uri + '&' + body).digest('hex')
}
function vpSignature(body, sessionKey) {
  return crypto.createHmac('sha256', sessionKey).update(body).digest('hex')
}
function vpXmlGet(xml, tag) {
  const m = new RegExp('<' + tag + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + tag + '>').exec(xml || '')
  return m ? m[1].trim() : ''
}
/** code2Session：code → { openid, session_key } */
function vpCode2Session(code) {
  const wxCtx = cloud.getWXContext() || {}
  const appid = process.env.WX_APPID || (wxCtx.APPID || '')
  const url = 'https://api.weixin.qq.com/sns/jscode2session?appid=' + appid + '&secret=' + encodeURIComponent(WX_APP_SECRET) +
    '&js_code=' + encodeURIComponent(code) + '&grant_type=authorization_code'
  return new Promise((resolve, reject) => {
    require('https').get(url, r => {
      let d = ''
      r.on('data', c => d += c)
      r.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}
/** 发货（幂等：wx_order_id 去重）——统一走 grantMember，会员/进阶包/12周全兼容 */
async function vpDeliver(db, openid, outTradeNo, wxOrderId, productId, qty) {
  const prod = VP_PRODUCTS[productId]
  if (!prod) return { ok: false, error: '未知道具 ' + productId }
  const oCol = db.collection('vporders')
  // 幂等：同一 wx_order_id 只发一次
  const dup = await oCol.where({ wxOrderId: wxOrderId, shipped: true }).limit(1).get()
  if (dup.data && dup.data.length) return { ok: true, dup: true }
  const uid = openid
  let user = null
  try { user = (await db.collection(COL.users).doc(uid).get()).data } catch (e) {}
  if (!user) return { ok: false, error: '用户不存在' }
  await grantMember(uid, user, { level: prod.level, days: prod.days * (qty || 1) }, COL.users)
  await oCol.doc(outTradeNo).update({ data: { status: 'shipped', wxOrderId: wxOrderId, shippedAt: Date.now() } })
  return { ok: true }
}
/** 下单：{productId, code(wx.login)} → payData */
async function vpOrder(event) {
  if (!VP_OFFER_ID || !VP_APP_KEY) return { ok: false, error: '虚拟支付未配置（VP_OFFER_ID/VP_APP_KEY）' }
  const prod = VP_PRODUCTS[String(event.productId || '')]
  if (!prod) return { ok: false, error: '未知商品' }
  if (!WX_APP_SECRET) return { ok: false, error: 'WX_APP_SECRET 未配置' }
  const sess = await vpCode2Session(String(event.code || ''))
  if (!sess || !sess.openid || !sess.session_key) return { ok: false, error: '登录态换取失败（code 无效或过期，重试即可）' }
  const openid = sess.openid
  const outTradeNo = 'T' + Date.now() + Math.floor(Math.random() * 900 + 100)
  const signData = JSON.stringify({
    offerId: VP_OFFER_ID,
    buyQuantity: 1,
    env: 0,
    currencyType: 'CNY',
    productId: String(event.productId),
    goodsPrice: prod.cents,
    outTradeNo: outTradeNo,
    attach: openid
  })
  const paySig = vpPaySig('requestVirtualPayment', signData)
  const signature = vpSignature(signData, sess.session_key)
  try {
    await db.collection('vporders').doc(outTradeNo).set({
      data: { openid, productId: event.productId, cents: prod.cents, status: 'pending', createdAt: Date.now() }
    })
  } catch (e) { return { ok: false, error: '订单写入失败：' + e.message } }
  return ok({
    payData: {
      signData: signData,
      paySig: paySig,
      signature: signature,
      mode: 'short_series_goods'
    },
    outTradeNo: outTradeNo
  })
}
/** 发货推送接收（兼容 HTTP XML / 云函数消息两种形态）+ GET 验证（echostr） */
async function vpNotify(event) {
  // GET 验证（mp 后台配置 URL 时的服务器校验）：需环境变量 VP_TOKEN 与后台一致
  const q = event.queryStringParameters || event.query || {}
  const echostr = event.echostr || q.echostr
  if (event.httpMethod === 'GET' || (echostr && !event.body)) {
    const sig = event.signature || q.signature, ts = event.timestamp || q.timestamp, nonce = event.nonce || q.nonce
    const token = (process.env.VP_TOKEN || '').trim()
    const want = crypto.createHash('sha1').update([token, ts, nonce].sort().join('')).digest('hex')
    if (!token || want !== sig) return { statusCode: 403, body: 'fail' }
    return { statusCode: 200, body: String(echostr || '') }
  }
  const raw = event.body || event.xml || ''
  const outTradeNo = vpXmlGet(raw, 'OutTradeNo')
  const wxOrderId = vpXmlGet(raw, 'MchOrderNo')
  const openid = vpXmlGet(raw, 'OpenId')
  const productId = vpXmlGet(raw, 'ProductId')
  const qty = Number(vpXmlGet(raw, 'Quantity')) || 1
  const evt = vpXmlGet(raw, 'Event')
  if (evt !== 'xpay_goods_deliver_notify' || !outTradeNo) return { statusCode: 200, body: '<xml><ErrCode>0</ErrCode></xml>' }
  try {
    const r = await vpDeliver(db, openid, outTradeNo, wxOrderId, productId, qty)
    if (!r.ok) return { statusCode: 200, body: '<xml><ErrCode>1</ErrCode><ErrMsg><![CDATA[' + (r.error || 'fail') + ']]></ErrMsg></xml>' }
  } catch (e) {
    return { statusCode: 200, body: '<xml><ErrCode>1</ErrCode><ErrMsg><![CDATA[' + e.message + ']]></ErrMsg></xml>' }
  }
  return { statusCode: 200, body: '<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>' }
}
/** 兜底查单：前端 success 后调用 —— 对本人 pending 订单逐单调 query_order，已支付即发货 */
async function vpCheck(event) {
  if (!VP_OFFER_ID || !VP_APP_KEY) return { ok: false, error: '虚拟支付未配置' }
  const openid = (cloud.getWXContext() || {}).OPENID
  if (!openid) return { ok: false, error: 'NO_USER' }
  const pend = await db.collection('vporders').where({ openid: openid, status: 'pending' }).orderBy('createdAt', 'desc').limit(5).get()
  let done = 0
  for (const o of (pend.data || [])) {
    const body = JSON.stringify({ openid: openid, env: 0, order_id: o._id })
    const paySig = vpPaySig('/xpay/query_order', body)
    const r = await new Promise((resolve, reject) => {
      const req = require('https').request({
        hostname: 'api.weixin.qq.com', path: '/xpay/query_order',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'pay_sig': paySig }
      }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)) })
      req.on('error', reject); req.write(body); req.end()
    })
    try {
      const j = JSON.parse(r)
      if (j && j.order && (j.order.status === 'PAYED' || j.order.pay_status === 'PAYED' || j.order.status === 'SUCCESS')) {
        await vpDeliver(db, openid, o._id, j.order.wx_order_id || ('Q' + o._id), o.productId, 1)
        done++
      }
    } catch (e) {}
  }
  return ok({ done: done })
}

async function issueCode(event) {
  const level = ['pro', 'coach', 'plus', 'p12'].indexOf(event.level) >= 0 ? event.level : 'pro'
  const days = Math.max(1, Math.min(3650, Number(event.days) || 30))
  const count = Math.max(1, Math.min(50, Number(event.count) || 1))
  const note = String(event.note || '').slice(0, 100)
  await ensureCollection(COL_CODES)
  const out = []
  for (let i = 0; i < count; i++) {
    let code = ''
    for (let tries = 0; tries < 5 && !code; tries++) {
      const cand = genRetailCode()
      const dup = await db.collection(COL_CODES).where({ hash: codeHash(cand) }).limit(1).get()
        .catch(() => ({ data: [] }))
      if (!(dup.data || []).length) code = cand
    }
    if (!code) return fail('CODE_GEN_FAIL')
    await db.collection(COL_CODES).add({
      data: { hash: codeHash(code), level: level, days: days, used: false, usedBy: '', usedAt: 0, note: note, at: Date.now() }
    })
    out.push(code)
  }
  return ok({ codes: out, level: level, days: days })
}

/** 最近发出的码（只给状态不给明文 —— 明文没入库，拖库也泄不出去） */
async function listCodes(event) {
  const snap = await db.collection(COL_CODES).orderBy('at', 'desc').limit(50).get()
    .catch(() => ({ data: [] }))
  return ok({ codes: (snap.data || []).map(c => ({
    fp: String(c.hash || '').slice(0, 6),
    level: c.level, days: c.days, used: !!c.used, note: c.note || '',
    usedBy: c.usedBy || '', at: c.at
  })) })
}

/** 运营统计（管理员签名保护）：网站 + 小程序的用户 / 打卡 / 活跃 / 会员。
 *  只返回聚合数字，不含任何个人数据。 */
async function adminStats() {
  const _ = db.command
  const week = Date.now() - 7 * 86400000
  const cnt = (col, where) => (where
    ? db.collection(col).where(where).count()
    : db.collection(col).count()).catch(() => ({ total: 0 }))
  const [webUsers, miniUsers, webCheckins, miniCheckins, webActive, webMembers] = await Promise.all([
    cnt(COL.users),
    cnt('users'),
    cnt(COL.checkins),
    cnt('checkins'),
    cnt(COL.users, { lastSeenAt: _.gt(week) }),
    cnt(COL.users, { 'member.level': _.neq('') })
  ])
  return ok({
    web: { users: webUsers.total || 0, active7d: webActive.total || 0, members: webMembers.total || 0, checkins: webCheckins.total || 0 },
    mini: { users: miniUsers.total || 0, checkins: miniCheckins.total || 0 },
    at: Date.now()
  })
}

// ───────────────────────── AI 顾问（GLM 免费模型 · 规则引擎管数字、模型管解释） ─────────────────────────
//
// 选型（2026-10-14）：智谱 GLM-4.7-Flash —— 免费文本模型、200K 上下文。
//   Key 放云函数环境变量 AI_API_KEY（用户注册 open.bigmodel.cn 免费拿）。
//   模型名可用 AI_MODEL 覆盖（默认 glm-4.7-flash）。
//
// 配额设计（用户问"免费的还要限吗"）：要留，原因不是钱——
//   ① 免费 key 是**账号级限速**：所有人共用一个 key 撞同一个并发池，一个人刷爆全员排队；
//   ② 将来换付费模型时成本闸门已经在了。
//   档位：会员（pro/plus/p12）每天 20 次；免费用户每天 3 次尝鲜。

const AI_KB = require('./lib/ai-kb.js')
const https = require('https')

// 免费模型降级链（用户 2026-10-14 拍板：4.7 限流先退 4.5，再不行才到 4.0）——全是免费档
const AI_MODELS = (process.env.AI_MODELS ||
  'glm-4.7-flash,glm-4.5-flash,glm-4-flash-250414').split(',').map(s => s.trim()).filter(Boolean)
const AI_DAILY_MEMBER = 20
const AI_DAILY_FREE = 3

/** Node16 没有全局 fetch，用 https 模块封装一个带超时的 POST */
function httpsPostJSON(host, path, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body))
    const req = https.request({
      hostname: host, path: path, method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      }, headers || {}),
      timeout: timeoutMs || 50000
    }, res => {
      let chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        try { resolve({ status: res.statusCode, json: JSON.parse(text) }) }
        catch (e) { resolve({ status: res.statusCode, json: null, text: text.slice(0, 500) }) }
      })
    })
    req.on('timeout', () => { req.destroy(new Error('AI_TIMEOUT')) })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

/** 拼用户上下文：档案 + 目标 + 今天课表 + 体重趋势。数字全部引擎算好，模型不许猜。 */
function aiUserContext(user, checkins) {
  const p = user.profile || {}
  const lines = []
  if (p.weight) lines.push('体重 ' + p.weight + 'kg')
  if (p.height) lines.push('身高 ' + p.height + 'cm')
  if (p.goal) lines.push('目标 ' + p.goal)
  if (p.exp) lines.push('经验 ' + p.exp)
  if (p.age) lines.push('年龄 ' + p.age)
  const plan = user.plan || {}
  if (plan.split && kb.METHOD && kb.METHOD.SPLITS && kb.METHOD.SPLITS[plan.split]) {
    lines.push('训练分化 ' + kb.METHOD.SPLITS[plan.split].name)
  }
  try {
    const mac = calc.energyPlan(p)
    if (mac && mac.kcal) lines.push('每日热量目标 ' + Math.round(mac.targetKcal || mac.kcal) + ' kcal' +
      (mac.protein ? '、蛋白 ' + Math.round(mac.protein) + 'g' : '') +
      (mac.carb ? '、碳水 ' + Math.round(mac.carb) + 'g' : '') +
      (mac.fat ? '、脂肪 ' + Math.round(mac.fat) + 'g' : ''))
  } catch (e) { /* 算不出就不给 */ }
  try {
    const today = bjDateStr()
    const idx = calc.dayIndexFromStart(plan.cycleStart || today, today)
    const day = kb.dayContent(plan, Math.max(0, idx), p, !!plan.home)
    if (day && day.exercises) {
      lines.push('今天课表「' + day.focus + '」：' + day.exercises.map(x => x.name + ' ' + x.sets).join('、'))
    }
  } catch (e) { /* 没计划就略 */ }
  try {
    const wt = calc.weightTrend(checkins, p, 14)
    if (wt && wt.enough) lines.push('近两周体重变化 ' + (wt.delta > 0 ? '+' : '') + wt.delta + 'kg（约 ' + wt.perWeek + 'kg/周）')
    else if (wt && wt.points && wt.points.length) {
      lines.push('最近体重：' + wt.points.slice(-3).map(x => x.date + ' ' + x.w + 'kg').join('、'))
    }
  } catch (e) { /* 打卡少就略 */ }
  // 近 14 天打卡摘要：练了几次 / 完成率 / 睡眠 / 饮水 —— 让模型引用真实行为数据（2026-10-16 导师升级）
  try {
    const today2 = bjDateStr()
    const recent = checkins.filter(c => c.date >= shiftDateStr(today2, -13) && c.date <= today2)
    const trained = recent.filter(c => c.trained)
    if (recent.length) {
      const s14 = ['近14天：训练 ' + trained.length + ' 次']
      if (trained.length) {
        let doneN = 0, totalN = 0
        trained.forEach(c => (c.exercises || []).forEach(e => (e.log || []).forEach(s => { totalN++; if (s.done) doneN++ })))
        if (totalN) s14.push('组完成率 ' + Math.round(doneN / totalN * 100) + '%')
      }
      const sl = recent.filter(c => Number(c.sleepHours) > 0)
      if (sl.length) s14.push('平均睡眠 ' + FmtRound1(sl.reduce((a, c) => a + Number(c.sleepHours), 0) / sl.length) + 'h')
      const wa = recent.filter(c => Number(c.waterMl) > 0)
      if (wa.length) s14.push('日均饮水 ' + Math.round(wa.reduce((a, c) => a + Number(c.waterMl), 0) / wa.length) + 'ml')
      lines.push(s14.join('，'))
    }
  } catch (e) { /* 摘要算不出就略 */ }
  return lines.length ? '【用户档案（数字以这里为准，不要自己另算）】\n' + lines.join('；') : ''
}

/** 北京日期字符串往前/后推 n 天（YYYY-MM-DD） */
function shiftDateStr(ds, n) {
  const d = new Date(ds + 'T12:00:00+08:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function FmtRound1(x) { return Math.round(x * 10) / 10 }

async function aiChat(event, uid, user, checkinsIn, usersCol) {
  const key = process.env.AI_API_KEY
  if (!key) return fail('AI_NOT_CONFIGURED')
  const USERS_COL = usersCol || COL.users
  // —— 配额：按北京时间日重置；会员/免费双档 ——
  const today = bjDateStr()
  const mon = today.slice(0, 7)
  const q = user.aiQuota || {}
  const dayN = q.day === today ? (q.dayN || 0) : 0
  const isMember = user.member && user.member.level && ['pro', 'plus', 'p12'].indexOf(user.member.level) >= 0
  const cap = isMember ? AI_DAILY_MEMBER : AI_DAILY_FREE
  // —— 输入：只收最近 10 条（省 token + 防注入刷长度） ——
  const msgs = Array.isArray(event.messages) ? event.messages : []
  const clean = msgs.slice(-10)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
  if (!clean.length || clean[clean.length - 1].role !== 'user') return fail('AI_EMPTY')
  // —— 第一层：routine 语录缓存（0 成本、不耗配额；伤病/提问不拦，走大模型详细答）——
  // 放在配额检查之前：打卡打卡类反馈不该被「今日次数用完」挡住
  const quote = AI_KB.routineQuote(clean[clean.length - 1].content)
  if (quote) return ok({ text: quote, quota: { used: dayN, cap: cap, member: !!isMember }, cached: true })
  if (dayN >= cap) return fail('AI_QUOTA', { quota: { used: dayN, cap: cap } })
  // 近 30 次打卡（体重趋势用，weightTrend 至少要 2 次才够）；小程序通道由外部传入
  let checkins = checkinsIn
  if (!Array.isArray(checkins)) {
    try {
      const snap = await db.collection(COL.checkins).where({ uid }).orderBy('date', 'desc').limit(30).get()
      checkins = ((snap && snap.data) || []).reverse()
    } catch (e) { checkins = [] }
  }
  const system = [AI_KB.PERSONA, AI_KB.KB, aiUserContext(user, checkins)].filter(Boolean).join('\n\n')
  const mkBody = model => ({
    model: model,
    messages: [{ role: 'system', content: system }].concat(clean),
    temperature: 0.7,
    max_tokens: 2000    // 2026-10-16 导师升级：教练式结构化回复需要余量（1200 时长答被截断）
  })
  // 降级链：4.7 → 4.5 → 4.0，被限流（429/1305/1113）就换下一个，全免费
  let res = null
  try {
    for (let i = 0; i < AI_MODELS.length; i++) {
      res = await httpsPostJSON('open.bigmodel.cn', '/api/paas/v4/chat/completions',
        { 'Authorization': 'Bearer ' + key }, mkBody(AI_MODELS[i]), 40000)
      const upCode = res.json && res.json.error && res.json.error.code
      if (res.status === 429 || upCode === '1305' || upCode === '1113') continue   // 限流 → 下一个
      break
    }
  } catch (e) {
    return fail(String((e && e.message) === 'AI_TIMEOUT' ? 'AI_TIMEOUT' : 'AI_NETWORK'))
  }
  if (res.status !== 200 || !res.json || !res.json.choices || !res.json.choices[0]) {
    console.error('ai upstream', res.status, (res.json && res.json.error && res.json.error.code) || res.text || '')
    return fail(res.status === 429 ? 'AI_RATE' : 'AI_UPSTREAM')
  }
  const text = String(res.json.choices[0].message && res.json.choices[0].message.content || '').slice(0, 4000)
  // —— 配额写入（失败不影响回答） ——
  try {
    await db.collection(USERS_COL).doc(uid).update({
      data: { aiQuota: { day: today, dayN: dayN + 1, mon: mon, monN: (q.mon === mon ? (q.monN || 0) : 0) + 1 } }
    })
  } catch (e) { console.error('ai quota write failed', e) }
  return ok({ text: text, quota: { used: dayN + 1, cap: cap, member: !!isMember } })
}

/**
 * 自助退订。合规上必须有这条路 —— 只能开通不能取消，本身就是问题。
 * 立即失效（不搞"到期不续"那套含糊语义，用户点了就该马上生效）。
 */
async function cancelMember(event, uid, user, col) {
  user.member = { level: '', expiresAt: '' }
  user.lastSeenAt = Date.now()
  await setDoc(col||COL.users, uid, user)
  await db.collection(COL_ORDERS).add({
    data: { uid: uid, kind: 'cancel', at: Date.now() }
  }).catch(e => console.error('order write failed', e))
  return ok({ member: user.member })
}

// ───────────────────────── 两端账号绑定 + 打卡数据互通（2026-10-17）─────────────────────────
//
// 用户诉求：小程序记的训练，网站也能看；网站记的，小程序也有 —— 两端数据互通。
// 做法：不统一账号体系（网站是邮箱 token、小程序是 openid，动不了），而是「绑定 + 镜像」：
//   ① 网站生成 6 位绑定码（5 分钟有效）→ 小程序输入 → links 集合挂上钩
//   ② 绑定瞬间：两端存量打卡**双向全量回填**（按 date 幂等，一天一条，不重复）
//   ③ 之后每次打卡：upsertCheckin（网站侧）自动镜像到 checkins；mpSyncCheckin（小程序侧）
//      把当天打卡镜像到 webcheckins。后保存的赢（upsert 语义）。
// 隐私：镜像只带训练/饮食/睡眠/体重/备注，互不带 email / openid 明文进对方集合。

function toWebNote(n) { return typeof n === 'string' ? { text: n } : (n || undefined) }
function toMpNote(n) { return typeof n === 'object' && n ? (n.text || '') : String(n || '') }
function bjToday() { return bjDateStr() }

async function getLinkByWebUid(webUid) {
  const snap = await db.collection(COL.links).where({ webUid }).limit(1).get().catch(() => ({ data: [] }))
  return (snap.data || [])[0] || null
}
async function getLinkByMp(openid) {
  return getOne(COL.links, 'mp-' + openid)
}

/** 小程序打卡 doc → 网站 shape（note 字符串→对象；不带 _openid） */
function mpCkToWeb(c, webUid) {
  return {
    uid: webUid, date: c.date,cardio:cardioLog.clean(c.cardio),
    trained: !!c.trained,
    exercises: (c.exercises || []).map(e => ({
      oid:String(e.oid||'').slice(0,100),target:progression.cleanTarget(e.target),progressReady:!!e.progressReady,
      name: e.name, role: e.role || '其他', sets: e.sets || '',
      log: (e.log || []).map(s => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0, done:!!s.done,type:s.type==='warmup'?'warmup':'work' }))
    })),
    dietLog: (c.dietLog || []).map(d => ({ name: d.name, grams: Number(d.grams) || 0, kcal: Number(d.kcal) || 0, protein: Number(d.protein) || 0, carbs: Number(d.carbs) || 0, fat: Number(d.fat) || 0, fiber: Number(d.fiber) || 0 })),
    waterMl: Number(c.waterMl) || 0,
    sleepHours: Number(c.sleepHours) || 0,
    weight: Number(c.weight) || 0,
    note: toWebNote(c.note),
    dayIndex: Number(c.dayIndex) || 0,
    dietOk: !!c.dietOk,
    src: 'mp', updatedAt: Date.now()
  }
}

/** 网站打卡 doc → 小程序 shape（note 对象→字符串；带 _openid 让客户端能查到） */
function webCkToMp(c, openid) {
  return {
    _openid: openid, date: c.date,cardio:cardioLog.clean(c.cardio),
    trained: !!c.trained,
    exercises: (c.exercises || []).map(e => ({
      oid:String(e.oid||'').slice(0,100),target:progression.cleanTarget(e.target),progressReady:!!e.progressReady,
      name: e.name, role: e.role || '其他', sets: e.sets || '',
      log: (e.log || []).map(s => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0, done:!!s.done,type:s.type==='warmup'?'warmup':'work' }))
    })),
    dietLog: (c.dietLog || []).map(d => ({ name: d.name, grams: Number(d.grams) || 0, kcal: Number(d.kcal) || 0, protein: Number(d.protein) || 0, carbs: Number(d.carbs) || 0, fat: Number(d.fat) || 0, fiber: Number(d.fiber) || 0 })),
    waterMl: Number(c.waterMl) || 0,
    sleepHours: Number(c.sleepHours) || 0,
    weight: Number(c.weight) || 0,
    note: toMpNote(c.note),
    dayIndex: Number(c.dayIndex) || 0,
    dietOk: !!c.dietOk,
    updatedAt: Date.now()
  }
}

/** 绑定瞬间：双向全量回填（按 date 幂等；已存在的不覆盖，避免踩掉对方刚记的） */
async function backfillBoth(openid, webUid) {
  let mpN = 0, webN = 0
  const mpAll = await db.collection(COL.mpCheckins).where({ _openid: openid }).limit(365).get().catch(() => ({ data: [] }))
  for (const c of (mpAll.data || [])) {
    const id = webUid + '_' + c.date
    const prev = await getOne(COL.checkins, id)
    if (prev) continue
    await setDoc(COL.checkins, id, mpCkToWeb(c, webUid))
    mpN++
  }
  const webAll = await db.collection(COL.checkins).where({ uid: webUid }).limit(365).get().catch(() => ({ data: [] }))
  for (const c of (webAll.data || [])) {
    const dup = await db.collection(COL.mpCheckins).where({ _openid: openid, date: c.date }).limit(1).get().catch(() => ({ data: [] }))
    if ((dup.data || []).length) continue
    await db.collection(COL.mpCheckins).doc('mp-' + openid + '_' + c.date)
      .set({ data: webCkToMp(c, openid) }).catch(() => null)
    webN++
  }
  return { mpToWeb: mpN, webToMp: webN }
}

/** 网站生成绑定码（5 分钟有效） */
async function bindStart(event, uid, user) {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  await db.collection(COL.codes).doc(code).set({ data: { uid: uid, exp: Date.now() + 5 * 60 * 1000 } }).catch(() => null)
  return ok({ code: code, expiresIn: 300 })
}

/** 小程序确认绑定（输码）→ 挂钩 + 双向回填 */
async function bindConfirm(openid) {
  // event 里带 code —— 走专用签名（见 handle 分支）
  return null
}

async function bindConfirmDo(openid, code) {
  const c = String(code || '').trim()
  if (!/^\d{6}$/.test(c)) return fail('BAD_CODE')
  const row = await getOne(COL.codes, c)
  if (!row || !(row.exp > Date.now())) return fail('CODE_EXPIRED')
  const webUid = row.uid
  const webUser = await getOne(COL.users, webUid)
  if (!webUser) return fail('WEB_USER_MISSING')
  await db.collection(COL.codes).doc(c).remove().catch(() => null)
  await setDoc(COL.links, 'mp-' + openid, { webUid: webUid, at: Date.now() })
  const backfill = await backfillBoth(openid, webUid).catch(() => ({ mpToWeb: 0, webToMp: 0 }))
  return ok({
    bound: true,
    webNick: String(webUser.nick || '练友').slice(0, 12),
    backfill: backfill
  })
}

/** 小程序侧：查绑定状态 / 解绑 / 推送当天打卡镜像 */
async function mpBindStatus(openid) {
  const link = await getLinkByMp(openid)
  if (!link) return ok({ bound: false })
  const webUser = await getOne(COL.users, link.webUid)
  return ok({ bound: true, webNick: String((webUser || {}).nick || '练友').slice(0, 12) })
}

async function mpUnbind(openid) {
  await db.collection(COL.links).doc('mp-' + openid).remove().catch(() => null)
  return ok({ bound: false })
}

async function mpSyncCheckin(openid, date) {
  const link = await getLinkByMp(openid)
  if (!link) return ok({ mirrored: false, reason: 'NOT_BOUND' })
  const d = String(date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail('BAD_DATE')
  const snap = await db.collection(COL.mpCheckins).where({ _openid: openid, date: d }).limit(1).get().catch(() => ({ data: [] }))
  const c = (snap.data || [])[0]
  if (!c) return ok({ mirrored: false, reason: 'NO_LOCAL_CHECKIN' })
  await setDoc(COL.checkins, link.webUid + '_' + d, mpCkToWeb(c, link.webUid))
  return ok({ mirrored: true })
}



// ───────────────────────── 收徒邀请（裂变，2026-10-17）─────────────────────────
// 规则：每人一个稳定邀请码；新用户注册时填码 → 双方各得 3 天完整版（grantMember 现成，服务端权威）。
// 合规：奖励挂在「注册填码」动作，不挂在分享行为上（微信允许的标准邀请模式；分享按钮不挂奖励）。
const INVITE_DAYS = 3
function randCode() {
  return 'LB' + require('crypto').randomBytes(4).toString('hex').toUpperCase().slice(0, 6)
}
async function ensureInviteCode(col, uid, user) {
  if (user && user.inviteCode) return user.inviteCode
  for (let i = 0; i < 5; i++) {
    const code = randCode()
    let taken = false
    for (const c of [COL.users, 'users']) {
      try {
        const snap = await db.collection(c).where({ inviteCode: code }).limit(1).get()
        if (((snap && snap.data) || []).length) { taken = true; break }
      } catch (e) {}
    }
    if (taken) continue
    await setDoc(col, uid, Object.assign({}, user, { inviteCode: code }))
    return code
  }
  return (user && user.inviteCode) || ''
}
async function findInviter(code) {
  const c = String(code || '').trim().toUpperCase()
  if (!/^LB[A-Z0-9]{6}$/.test(c)) return null
  for (const col of [COL.users, 'users']) {
    try {
      const snap = await db.collection(col).where({ inviteCode: c }).limit(1).get()
      const hit = ((snap && snap.data) || [])[0]
      if (hit) return { col: col, uid: hit._id || '', user: hit, nick: ((hit.profile || {}).nickname || '练友') }
    } catch (e) {}
  }
  return null
}
async function bindInviteDo(callerCol, callerUid, callerUser, code) {
  const c = String(code || '').trim().toUpperCase()
  if (!c) return fail('CODE_EMPTY')
  if (callerUser && callerUser.inviter) return fail('ALREADY_BOUND')
  const inv = await findInviter(c)
  if (!inv) return fail('CODE_INVALID')
  if (inv.uid === callerUid) return fail('SELF_INVITE')
  // 幂等：一个新人只认一个师傅（invites 文档 id 定死，重复绑定直接拒）
  try {
    await db.collection('invites').doc('inv_' + callerUid).get()
    return fail('ALREADY_BOUND')
  } catch (e) { /* 不存在才能绑 */ }
  const m1 = await grantMember(inv.uid, inv.user, { level: 'pro', days: INVITE_DAYS }, inv.col)
  const cu = Object.assign({}, callerUser, { inviter: { uid: inv.uid, code: c, at: new Date().toISOString() } })
  const m2 = await grantMember(callerUid, cu, { level: 'pro', days: INVITE_DAYS }, callerCol)
  await db.collection('invites').doc('inv_' + callerUid).set({
    data: { inviterUid: inv.uid, inviterSrc: inv.col, newbieUid: callerUid, at: new Date().toISOString(), days: INVITE_DAYS }
  })
  return ok({ bound: true, inviterNick: inv.nick, member: m2 })
}
async function myInvitesDo(uid) {
  let list = []
  try {
    const snap = await db.collection('invites').where({ inviterUid: uid }).orderBy('at', 'desc').limit(100).get()
    list = ((snap && snap.data) || []).map(x => ({ at: x.at }))
  } catch (e) {}
  return ok({ count: list.length, list: list })
}

async function handle(event) {
  const action = String((event && event.action) || '').trim()
  if (action === 'ping') return ok({ pong: true, svc: 'webApi' })
  // 虚拟支付：下单/查单走 SDK 或 HTTP；发货推送/URL 验证走 HTTP 网关（POST XML / GET echostr）
  if (action === 'vp_order') return vpOrder(event)
  if (action === 'vp_check') return vpCheck(event)
  if (action === 'vp_verify' || action === 'vp_notify') return vpNotify(event)
  // 小程序 AI 通道：callFunction 自带 openid（无法伪造），不走网站 token、用小程序自己的集合。
  // HTTP 网关调用时 getWXContext 无 OPENID → 直接 NO_USER，不用担心被公网伪造。
  if (action === 'mpAiChat') {    const wxCtx = cloud.getWXContext()
    const uid = wxCtx && wxCtx.OPENID
    if (!uid) return fail('NO_USER')
    const user = await getOne('users', uid)
    if (!user) return fail('NO_USER')
    let checkins = []
    try {
      const snap = await db.collection('checkins').where({ _openid: uid }).orderBy('date', 'desc').limit(30).get()
      checkins = ((snap && snap.data) || []).reverse()
    } catch (e) { /* 打卡读不了就空着 */ }
    return aiChat(event, uid, user, checkins, 'users')
  }
  // Mini-program entitlement requests trust only the OPENID injected by CloudBase.
  if(['mpEntitlements','mpRedeem','mpCancelMember'].includes(action)){
    const openid=(cloud.getWXContext()||{}).OPENID
    if(!openid)return fail('NO_USER')
    const link=await getLinkByMp(openid),col=link?COL.users:'users',uid=link?link.webUid:openid,user=await getOne(col,uid)
    if(!user)return fail('NO_USER')
    if(action==='mpRedeem')return redeem(event,uid,user,col)
    if(action==='mpCancelMember')return cancelMember(event,uid,user,col)
    return ok({member:user.member||null,plus:user.plus||null,plan12:user.plan12||null,playerNo:user.playerNo||0,bound:!!link})
  }
  // 小程序排行榜通道：与网站同榜（rankrows 共享池）。callFunction 自带 openid，无法伪造。
  if (action === 'mpBoard') {
    const wxCtx = cloud.getWXContext()
    const openid = wxCtx && wxCtx.OPENID
    if (!openid) return fail('NO_USER')
    return leaderboard(event, 'mp-' + openid, null, openid)
  }
  // 小程序绑定互通通道：绑定网站账号 + 打卡双向镜像。openid 由 callFunction 注入，无法伪造。
  if (action === 'mpBindConfirm' || action === 'mpBindStatus' || action === 'mpUnbind' || action === 'mpSyncCheckin' ||
      action === 'mpInviteCode' || action === 'mpBindInvite' || action === 'mpMyInvites') {
    const wxCtx = cloud.getWXContext()
    const openid = wxCtx && wxCtx.OPENID
    if (!openid) return fail('NO_USER')
    if (action === 'mpInviteCode' || action === 'mpBindInvite' || action === 'mpMyInvites') {
      const user = await getOne('users', openid)
      if (!user) return fail('NO_USER')
      if (action === 'mpInviteCode') return ok({ code: await ensureInviteCode('users', openid, user) })
      if (action === 'mpMyInvites') return myInvitesDo(openid)
      return bindInviteDo('users', openid, user, event.code)
    }
    if (action === 'mpBindConfirm') return bindConfirmDo(openid, event.code)
    if (action === 'mpBindStatus') return mpBindStatus(openid)
    if (action === 'mpUnbind') return mpUnbind(openid)
    return mpSyncCheckin(openid, event.date)
  }
  // 管理员接口：不走用户登录（CLI 没有用户 token），只认管理签名（AUTH_SECRET 不上网）
  if (action === 'issueCode' || action === 'listCodes' || action === 'adminStats') {
    if (!K.adminVerify(secret(), 'issue', event.ts, event.sig)) return fail('NOT_ADMIN')
    if (action === 'adminStats') return adminStats()
    return action === 'issueCode' ? issueCode(event) : listCodes(event)
  }
  const a = await auth(event)
  if (a.err) return a.err
  switch (action) {
    case 'getState': return getState(event, a.uid, a.user)
    case 'putState': return putState(event, a.uid, a.user)
    case 'upsertCheckin': return upsertCheckin(event, a.uid, a.user)
    case 'listCheckins': return listCheckins(event, a.uid)
    case 'leaderboard': return leaderboard(event, a.uid, a.user, null)
    case 'bindStart': return bindStart(event, a.uid, a.user)
    case 'deleteAccount': return deleteAccount(event, a.uid, a.user)
    case 'redeem': return redeem(event, a.uid, a.user)
    case 'cancelMember': return cancelMember(event, a.uid, a.user)
    case 'aiChat': return aiChat(event, a.uid, a.user)
    case 'inviteCode': return ok({ code: await ensureInviteCode(COL.users, a.uid, a.user) })
    case 'myInvites': return myInvitesDo(a.uid)
    case 'bindInvite': return bindInviteDo(COL.users, a.uid, a.user, event.code)
    default: return fail('BAD_ACTION')
  }
}

exports.main = async (event, context) => {
  const isHttp = !!(event && (event.httpMethod || event.headers || event.isBase64Encoded))
  try {
    const payload = isHttp ? parseHttpBody(event) : event
    if (isHttp && payload.action === 'options') return httpRes(204, '')
    const result = await handle(payload)
    return isHttp ? httpRes(200, JSON.stringify(result)) : result
  } catch (e) {
    const code = (e && e.message) === 'AUTH_SECRET_MISSING' ? 'SERVER_MISCONFIG' : 'SERVER'
    const result = fail(code, { msg: (e && e.message) || String(e) })
    return isHttp ? httpRes(200, JSON.stringify(result)) : result
  }
}

function parseHttpBody(event) {
  let body = event.body
  if (event.isBase64Encoded && body) body = Buffer.from(body, 'base64').toString('utf8')
  if (!body) return Object.assign({}, event.queryStringParameters || {})
  try {
    const o = JSON.parse(body)
    return (o && typeof o === 'object') ? o : {}
  } catch (e) {
    return Object.assign({}, event.queryStringParameters || {})
  }
}

function httpRes(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store'
    },
    body
  }
}
