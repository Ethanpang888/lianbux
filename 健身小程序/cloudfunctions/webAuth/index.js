// cloudfunctions/webAuth/index.js —— 网页版账号体系：邮箱验证码登录 + 玩家编号分配 + 恢复码
//
// 设计要点（都是踩过坑才这么定的）：
//   1. **双入口**：既能被 CloudBase Web SDK 调用（event.action），也能被「HTTP 访问服务」调用
//      （event.httpMethod + event.body）。网站走 HTTP：域名固定、自带跨域、不依赖任何前端 SDK。
//   2. **验证码只存哈希**（HMAC），库被拖走也换不来能登录的码。
//   3. **登录态是我们自己签的 token**（HMAC-SHA256，30 天），无状态校验不查库。
//   4. **玩家编号用乐观锁原子分配**（counters 集合 CAS 重试），不会两人拿到同号。
//   5. **uid 由邮箱确定性推导**，同一邮箱永远同一份档案，重复登录不会建两个号。
//   6. **恢复码用"编号 + 恢复码"找回**（参考竞品做法），只显示一次、只存哈希。
//
// 环境变量（云函数配置里填）：
//   AUTH_SECRET      必填，随便一串长随机字符。**不填就直接拒绝服务**（避免用默认密钥裸奔）
//   CLOUD_ENV        云开发环境 ID（默认见下）
//   SENDER_EMAIL     发件 QQ 邮箱
//   SENDER_AUTH_CODE 该邮箱的授权码（非登录密码）
//   ALLOW_ORIGIN     允许的跨域来源，默认 '*'（上线后建议改成你的域名）
//   DEV_FIXED_CODE   ⛔ 已废弃并禁用：设了会直接拒绝服务（旧版可固定验证码，是安全后门）

const cloud = require('wx-server-sdk')
const nodemailer = require('nodemailer')
const K = require('./lib/authkit.js')

const ENV = process.env.CLOUD_ENV || 'cloud1-d7gtp1mv1bfcc25df'
cloud.init({ env: ENV })
const db = cloud.database()

const COL = {
  users: 'webusers',
  codes: 'weblogin_codes',
  counters: 'counters',
  checkins: 'webcheckins'
}

// ───────────────────────── 小工具 ─────────────────────────

function secret() {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) throw new Error('AUTH_SECRET_MISSING')
  return s
}

function nowMs() { return Date.now() }

/** 统一返回体（HTTP 入口会再包一层 statusCode/headers） */
function ok(data) { return Object.assign({ ok: true }, data || {}) }
function fail(code, extra) { return Object.assign({ ok: false, code }, extra || {}) }

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SENDER_EMAIL, pass: process.env.SENDER_AUTH_CODE }
  })
}

function getOne(collection, id) {
  return db.collection(collection).doc(id).get()
    .then(r => (r && r.data) || null)
    .catch(() => null)     // 不存在时 CloudBase 会抛错，统一当 null
}

/**
 * 写入一条记录：`set` 本身就是 upsert 语义（不存在则创建、存在则替换）。
 *
 * ⚠️ 千万不要再写成 `.catch(() => add({ _id: id, ... }))` 那种"降级"：
 *   ① 如果 data 里带了 `_id`（比如刚 getOne 读出来的整条记录原样写回），
 *      set 会报 `-501007 invalid parameters`（云开发禁止 data 含 _id/_openid）；
 *   ② catch 把这个真实错误吞掉后降级到 add，而那条 `_id` 明明存在 →
 *      再撞主键报 `E11000 duplicate key error`。
 *   两个错误叠在一起，根因（_id）完全被掩盖 —— 2026-09-22 用户注册时就是这么炸的。
 *   清洗统一走 K.stripReserved()，别再手写。
 */
function upsert(collection, id, data) {
  return db.collection(collection).doc(id).set({ data: K.stripReserved(data) })
}

// ───────────────────────── 玩家编号：乐观锁分配 ─────────────────────────

/**
 * 取下一个玩家编号（全局唯一、原子）。
 * 用「只有 seq 还是我刚读到的值时才写入」的 CAS 重试，避免并发下重号。
 */
async function allocPlayerNo() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = await getOne(COL.counters, 'playerSeq')
    const seq = cur ? cur.seq : null
    const step = K.allocStep(seq, !!cur)
    if (step.action === 'create') {
      // 首次：把计数器建起来，第一个注册的人拿 #0001
      try {
        await db.collection(COL.counters).add({ data: { _id: 'playerSeq', seq: 1 } })
        return 1
      } catch (e) { continue }        // 别人抢先建了，重来
    }
    const res = await db.collection(COL.counters)
      .where({ _id: 'playerSeq', seq: step.expect })
      .update({ data: { seq: step.next } })
      .catch(() => null)
    const updated = res && res.stats && res.stats.updated
    if (updated === 1) return step.next
  }
  throw new Error('PLAYER_NO_BUSY')
}

// ───────────────────────── 发验证码 ─────────────────────────

async function sendCode(email) {
  const e = K.normEmail(email)
  if (!K.validEmail(e)) return fail('BAD_EMAIL')

  const rec = await getOne(COL.codes, e)
  const gate = K.canSendCode(rec, nowMs())
  if (!gate.ok) return fail(gate.code, { waitMs: gate.waitMs })

  // ⚠️ 安全红线：这里曾经允许用环境变量 DEV_FIXED_CODE 固定验证码做本地联调。
  //    只要那个变量被误设，验证码就变成固定值，知道它的人可以登录**任意**账号。
  //    现在改成 fail-closed：一旦检测到该变量，直接拒绝服务，绝不"降级为固定码"。
  if (process.env.DEV_FIXED_CODE) throw new Error('DEV_FIXED_CODE_FORBIDDEN')
  const code = K.genCode()
  const inWindow = rec && rec.windowStartAt && (nowMs() - rec.windowStartAt <= 3600 * 1000)

  await upsert(COL.codes, e, {
    email: e,
    codeHash: K.hashCode(e, code, secret()),
    expAt: nowMs() + K.AUTH.codeTtlMs,
    tries: 0,
    usedAt: 0,
    banUntil: (rec && rec.banUntil > nowMs()) ? rec.banUntil : 0,
    lastSentAt: nowMs(),
    sentCount: (inWindow ? (rec.sentCount || 0) : 0) + 1,
    windowStartAt: inWindow ? rec.windowStartAt : nowMs()
  })

  const subject = '练不虚 Gym · 登录验证码'
  const html =
    '<div style="max-width:520px;margin:0 auto;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#222">' +
    '<div style="background:#0e9f6e;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">' +
    '<b style="font-size:17px">练不虚 Gym</b>' +
    '<div style="font-size:12px;opacity:.9;margin-top:3px">登录验证码</div></div>' +
    '<div style="background:#fff;padding:20px;border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px">' +
    '<div style="font-size:13px;color:#555;margin-bottom:10px">你的验证码是（10 分钟内有效）：</div>' +
    '<div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#0b7d56;' +
    'font-family:ui-monospace,Menlo,monospace;padding:10px 0">' + code + '</div>' +
    '<div style="font-size:12px;color:#999;margin-top:12px">' +
    '如果不是你本人操作，忽略这封邮件即可，账号不会有任何变化。</div>' +
    '</div></div>'

  // 没配 SMTP 时（本地联调）直接把码返回，方便测试；生产环境必须配好邮件
  const canMail = process.env.SENDER_EMAIL && process.env.SENDER_AUTH_CODE
  if (!canMail) {
    return ok({ sent: false, warn: 'SMTP_NOT_CONFIGURED', devCode: code })
  }
  await transporter().sendMail({
    from: '"练不虚Gym" <' + process.env.SENDER_EMAIL + '>',
    to: e, subject, html
  })
  return ok({ sent: true, waitMs: K.AUTH.resendCooldownMs })
}

// ───────────────────────── 校验验证码 → 建号/登录 ─────────────────────────

async function verify(email, code) {
  const e = K.normEmail(email)
  if (!K.validEmail(e)) return fail('BAD_EMAIL')

  const rec = await getOne(COL.codes, e)
  const r = K.checkCode(rec, e, code, secret(), nowMs())
  if (!r.ok) {
    // 记错误次数；错满就锁一段时间
    if (rec) {
      await upsert(COL.codes, e, Object.assign({}, rec, {
        tries: (rec.tries || 0) + 1,
        banUntil: r.banMs ? nowMs() + r.banMs : (rec.banUntil || 0)
      }))
    }
    return fail(r.code, { triesLeft: r.triesLeft, banMs: r.banMs })
  }

  // 用掉这次验证码（一次性）
  await upsert(COL.codes, e, Object.assign({}, rec, { usedAt: nowMs() }))

  const uid = K.uidOf(e, secret())
  let user = await getOne(COL.users, uid)
  let isNew = false
  let recoveryCode = ''

  if (!user) {
    const playerNo = await allocPlayerNo()
    recoveryCode = K.genRecoveryCode()
    user = {
      _id: uid,
      uid,
      email: e,
      playerNo,
      recoveryHash: K.hashCode(e, K.normRecoveryCode(recoveryCode), secret()),
      profile: null, plan: null,
      dietState: { carbAdj: 0, proteinAdj: 0, macro: { kcalAdj: 0 }, history: [] },
      gamify: {
        exp: 0, level: 1, badges: [],
        streak: { cur: 0, best: 0, lastDate: '', tierGiven: [] },
        caps: { date: '', trainRaw: 0, lifeRaw: 0, pushRaw: 0 },
        weekTask: { week: '', sessions: 0, sleepDays: 0, weights: 0, proteinDays: 0, paid: [] },
        counters: { sessions: 0, volume: 0 }
      },
      privacy: { showOnRank: true },
      member: { level: '', expiresAt: '' },
      emailSub: '',
      subscribed: false,
      createdAt: nowMs(),
      lastSeenAt: nowMs()
    }
    isNew = true
  } else {
    user.lastSeenAt = nowMs()
  }

  // 存库（不要把 recoveryHash 之外的东西写回来；密码类字段只在内部分支出现）
  const toSave = Object.assign({}, user)
  await upsert(COL.users, uid, toSave)

  const token = K.signToken({ uid, pn: user.playerNo, em: e }, secret(), nowMs())
  return ok({
    token,
    isNew,
    playerNo: user.playerNo,
    playerNoText: K.fmtPlayerNo(user.playerNo),
    founding: K.isFounding(user.playerNo),
    // 恢复码只在「首次注册」这一瞬间返回，之后再也拿不到
    recoveryCode: recoveryCode || undefined,
    user: publicUser(user)
  })
}

/** 返回给前端的用户数据（剔除只该留在服务端的字段） */
function publicUser(u) {
  if (!u) return null
  return {
    uid: u.uid, email: u.email, playerNo: u.playerNo,
    profile: u.profile, plan: u.plan, dietState: u.dietState,
    gamify: u.gamify, privacy: u.privacy, member: u.member,
    subscribed: u.subscribed, emailSub: u.emailSub,
    createdAt: u.createdAt
  }
}

// ───────────────────────── 登录态 ─────────────────────────

async function me(token) {
  const p = K.verifyToken(token, secret(), nowMs())
  if (!p) return fail('AUTH_EXPIRED')
  const user = await getOne(COL.users, p.uid)
  if (!user) return fail('NO_USER')
  return ok({ user: publicUser(user), playerNoText: K.fmtPlayerNo(user.playerNo) })
}

/** 用「玩家编号 + 恢复码」找回账号（换手机/清缓存后） */
async function recover(playerNo, recoveryCode, email) {
  const no = Number(String(playerNo == null ? '' : playerNo).replace(/[^\d]/g, ''))
  if (!no) return fail('BAD_PARAM')
  const snap = await db.collection(COL.users).where({ playerNo: no }).limit(1).get()
  const u = snap && snap.data && snap.data[0]
  if (!u) return fail('RECOVER_FAILED')
  const hash = K.hashCode(u.email, K.normRecoveryCode(recoveryCode), secret())
  if (hash !== u.recoveryHash) return fail('RECOVER_FAILED')
  // 找回成功 → 签发新的登录态；若用户给了新邮箱，就换绑
  let target = u
  if (email && K.validEmail(email) && K.normEmail(email) !== u.email) {
    return fail('EMAIL_REBIND_TODO')   // 换绑要走单独流程（防止拿旧恢复码劫持）
  }
  target.lastSeenAt = nowMs()
  await upsert(COL.users, target.uid, target)
  const token = K.signToken({ uid: target.uid, pn: target.playerNo, em: target.email }, secret(), nowMs())
  return ok({ token, playerNo: target.playerNo, playerNoText: K.fmtPlayerNo(target.playerNo), user: publicUser(target) })
}

/** 换一个恢复码（旧码作废），返回新码 */
async function resetRecovery(token) {
  const p = K.verifyToken(token, secret(), nowMs())
  if (!p) return fail('AUTH_EXPIRED')
  const u = await getOne(COL.users, p.uid)
  if (!u) return fail('NO_USER')
  const code = K.genRecoveryCode()
  u.recoveryHash = K.hashCode(u.email, K.normRecoveryCode(code), secret())
  await upsert(COL.users, u.uid, u)
  return ok({ recoveryCode: code })
}

// ───────────────────────── 入口 ─────────────────────────

const ROUTES = { sendCode, verify, me, recover, resetRecovery, ping: async () => ok({ pong: true, svc: 'webAuth' }) }

function csv(v) { return Array.isArray(v) ? v.join(', ') : v }

async function handle(event) {
  const action = String((event && event.action) || '').trim()
  switch (action) {
    case 'sendCode': return sendCode(event.email)
    case 'verify': return verify(event.email, event.code)
    case 'me': return me(event.token)
    case 'recover': return recover(event.playerNo, event.recoveryCode, event.email)
    case 'resetRecovery': return resetRecovery(event.token)
    case 'ping': return ok({ pong: true, svc: 'webAuth' })
    default: return fail('BAD_ACTION')
  }
}

/**
 * 双入口：
 *   · CloudBase Web SDK 调用 → event = { action, ... }，直接返回 result
 *   · HTTP 访问服务调用 → event = { httpMethod, headers, body }，包一层 HTTP 响应 + CORS
 */
exports.main = async (event, context) => {
  const isHttp = !!(event && (event.httpMethod || event.headers || event.isBase64Encoded))
  try {
    const payload = isHttp ? parseHttpBody(event) : event
    if (isHttp && payload.action === 'options') return httpRes(204, '')
    const result = await handle(payload)
    return isHttp ? httpRes(200, JSON.stringify(result)) : result
  } catch (e) {
    const msg = (e && e.message) || ''
    const code = (msg === 'AUTH_SECRET_MISSING' || msg === 'DEV_FIXED_CODE_FORBIDDEN')
      ? 'SERVER_MISCONFIG' : 'SERVER'
    const result = fail(code, { msg: (e && e.message) || String(e) })
    if (isHttp) return httpRes(200, JSON.stringify(result))
    return result
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
