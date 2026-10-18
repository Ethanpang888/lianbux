/**
 * shared/authkit.js —— 账号体系的**纯逻辑**（唯一真相源）
 *
 * 为什么单独拆出来：这一层全是「给定输入就有确定输出」的判断，
 * 最容易写错、也最值得测（token 能不能被伪造、限流边界、编号分配是否原子）。
 * 云函数 `webAuth` 只负责「读库、写库、发邮件」，把判断都委托到这里。
 *
 * ⚠️ 只跑在 Node（云函数 / 测试），不进浏览器包：
 *    - 签名需要 crypto
 *    - 密钥绝不能出现在前端
 */

// ───────────────────────── 参数表 ─────────────────────────

const AUTH = {
  codeLength: 6,           // 验证码位数
  codeTtlMs: 10 * 60 * 1000,      // 验证码 10 分钟有效
  resendCooldownMs: 60 * 1000,    // 同一邮箱 60 秒内只能发一次
  maxSendsPerHour: 5,             // 同一邮箱每小时最多 5 封
  maxVerifyTries: 5,              // 验证码最多试 5 次
  lockMs: 15 * 60 * 1000,         // 错满 5 次锁 15 分钟
  tokenTtlMs: 30 * 24 * 3600 * 1000,   // 登录态 30 天
  recoveryCodeLen: 12,            // 恢复码长度（去掉易混字符后）
  playerNoPad: 4
}

// 恢复码不用 0/O/1/I/L 这些容易抄错的字符
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

// ───────────────────────── 邮箱校验与归一 ─────────────────────────

function normEmail(s) {
  return String(s == null ? '' : s).trim().toLowerCase()
}

/** 简易但够用的邮箱校验（不追求 RFC 完备，别把自己人挡在门外） */
function validEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(normEmail(s))
}

// ───────────────────────── 验证码 ─────────────────────────

/** 生成 n 位数字验证码（用 crypto 随机，别用 Math.random） */
function genCode(len, rand) {
  const n = len || AUTH.codeLength
  const r = rand || defaultRand
  let out = ''
  for (let i = 0; i < n; i++) out += String(Math.floor(r() * 10))
  return out
}

/** 生成恢复码，形如 K7M4-9QX2-P3WD */
function genRecoveryCode(len, rand) {
  const n = len || AUTH.recoveryCodeLen
  const r = rand || defaultRand
  let s = ''
  for (let i = 0; i < n; i++) s += RECOVERY_ALPHABET[Math.floor(r() * RECOVERY_ALPHABET.length)]
  return s.replace(/(.{4})(?=.)/g, '$1-')
}

function normRecoveryCode(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^0-9A-Z]/g, '')
}

let _rand = null
function defaultRand() {
  if (_rand) return _rand()                 // 测试注入的确定性随机
  // ⚠️ 每次都取新随机（早期写成缓存一次会退化成"所有位数相同"）
  return require('crypto').randomBytes(4).readUInt32BE(0) / 4294967296
}
function setRand(fn) { _rand = fn }          // 测试注入用；传 null 恢复真随机

// ───────────────────────── 哈希 / 签名 ─────────────────────────

function sha256hex(s) {
  return require('crypto').createHash('sha256').update(String(s)).digest('hex')
}

function hmacHex(s, secret) {
  return require('crypto').createHmac('sha256', String(secret)).update(String(s)).digest('hex')
}

/** 验证码只存哈希：即使库被拖走，也拿不到能直接用的码 */
function hashCode(email, code, secret) {
  return hmacHex(normEmail(email) + '|' + String(code), secret)
}

/** 用邮箱确定性推出 uid：同一邮箱永远同一份档案，重复登录不会建两个号 */
function uidOf(email, secret) {
  return 'u' + sha256hex(normEmail(email) + '|uid|' + secret).slice(0, 23)
}

function b64url(s) {
  return Buffer.from(String(s), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(t + '==='.slice((t.length + 3) % 4), 'base64').toString('utf8')
}

/** 签发登录态：payload + HMAC 签名（服务端无状态校验，不查库） */
function signToken(payload, secret, nowMs) {
  const now = Number(nowMs) || Date.now()
  const body = Object.assign({}, payload, { iat: now, exp: now + AUTH.tokenTtlMs })
  const p = b64url(JSON.stringify(body))
  return p + '.' + b64url(hmacHex(p, secret))
}

/** 校验登录态；返回 payload 或 null（篡改、过期、格式错都返回 null） */
function verifyToken(token, secret, nowMs) {
  const now = Number(nowMs) || Date.now()
  const parts = String(token || '').split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const [p, sig] = parts
  const expect = b64url(hmacHex(p, secret))
  // 等长比较 + 逐字符累积差异，避免时序侧信道
  if (sig.length !== expect.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i)
  if (diff !== 0) return null
  let body
  try { body = JSON.parse(b64urlDecode(p)) } catch (e) { return null }
  if (!body || typeof body !== 'object') return null
  if (!body.exp || body.exp < now) return null
  return body
}

// ───────────────────────── 限流（纯函数，方便测边界） ─────────────────────────

/**
 * 能不能给这个邮箱发码？
 * @param {Object} rec  上一次发送记录 { lastSentAt, sentCount, windowStartAt }
 * @param {Number} nowMs
 * @returns {{ok:boolean, code?:string, waitMs?:number}}
 */
function canSendCode(rec, nowMs) {
  const now = Number(nowMs) || Date.now()
  const r = rec || {}
  if (r.banUntil && r.banUntil > now) return { ok: false, code: 'LOCKED', waitMs: r.banUntil - now }
  if (r.lastSentAt && now - r.lastSentAt < AUTH.resendCooldownMs) {
    return { ok: false, code: 'RATE_LIMIT', waitMs: AUTH.resendCooldownMs - (now - r.lastSentAt) }
  }
  // 滑动窗口：超过 1 小时就重置计数
  let count = Number(r.sentCount) || 0
  if (!r.windowStartAt || now - r.windowStartAt > 3600 * 1000) count = 0
  if (count >= AUTH.maxSendsPerHour) {
    const wait = r.windowStartAt ? (3600 * 1000 - (now - r.windowStartAt)) : 3600 * 1000
    return { ok: false, code: 'RATE_LIMIT', waitMs: Math.max(0, wait) }
  }
  return { ok: true }
}

/** 校验验证码：返回 { ok, code?, triesLeft?, banMs? } */
function checkCode(rec, email, input, secret, nowMs) {
  const now = Number(nowMs) || Date.now()
  const r = rec || {}
  const input2 = String(input == null ? '' : input).trim()
  if (r.banUntil && r.banUntil > now) return { ok: false, code: 'LOCKED', banMs: r.banUntil - now }
  if (!r.codeHash) return { ok: false, code: 'NO_CODE' }
  if (r.usedAt) return { ok: false, code: 'CODE_USED' }
  if (!r.expAt || r.expAt < now) return { ok: false, code: 'CODE_EXPIRED' }
  const tries = Number(r.tries) || 0
  if (tries >= AUTH.maxVerifyTries) return { ok: false, code: 'LOCKED', banMs: AUTH.lockMs }
  if (!/^\d{4,8}$/.test(input2)) return { ok: false, code: 'CODE_WRONG', triesLeft: AUTH.maxVerifyTries - tries - 1 }
  if (hashCode(email, input2, secret) !== r.codeHash) {
    const left = AUTH.maxVerifyTries - tries - 1
    return { ok: false, code: 'CODE_WRONG', triesLeft: left, banMs: left <= 0 ? AUTH.lockMs : 0 }
  }
  return { ok: true }
}

// ───────────────────────── 玩家编号 ─────────────────────────

function fmtPlayerNo(no) {
  const n = Number(no) || 0
  if (n <= 0) return '#' + '-'.repeat(AUTH.playerNoPad)
  return '#' + String(n).padStart(AUTH.playerNoPad, '0')
}

/** 这个是「创始玩家」吗（前 100 位） */
function isFounding(no) { return Number(no) > 0 && Number(no) <= 100 }

/**
 * 编号分配的**重试决策**（把库操作抽掉，只留判断，方便测）。
 * 思路：乐观锁 —— 读出当前 seq，尝试"只有 seq 还是旧值时"才写。
 * 返回要执行的动作，由调用方拿去操作数据库。
 */
function allocStep(cur, found) {
  if (!found || cur == null) return { action: 'create', next: 1 }
  return { action: 'cas', expect: Number(cur), next: Number(cur) + 1 }
}

/**
 * 写库前的清洗：剥掉云开发的**保留字段**。
 *
 * ⚠️ 这条是踩过的坑，务必保留：
 *   `doc(id).set({ data })` 与 `update({ data })` 的 **data 里绝不能有 `_id` / `_openid`**，
 *   否则云开发直接报 `-501007 invalid parameters`（官方口径：data 字段内不能包含 _id 或 _openid）。
 *
 *   典型翻车路径：先 `getOne()` 读到整条记录（**含 `_id`**），改几个字段后原样写回 →
 *   set 报错 → 如果外面写了 `.catch(() => add(...))` 以为是"不存在才新建"，
 *   就会降级成 add，而 `_id` 明明存在 → 撞主键报 `E11000 duplicate key error`。
 *   两个错叠在一起，真实原因（_id）完全被掩盖，2026-09-22 用户注册时就是这么炸的。
 *
 * @param {object} data 待写入的字段
 * @returns {object} 去掉保留字段后的新对象（不修改入参）
 */
function stripReserved(data) {
  const o = Object.assign({}, data || {})
  delete o._id
  delete o._openid
  return o
}

// ───────── 管理操作签名（发码等管理员接口用）─────────
// 本地 CLI 与云函数都持有 AUTH_SECRET，但**密钥本身不上网**：
// 请求只带 { ts, sig }，sig = HMAC(secret, 'issue:<tag>:<ts>') 前 32 位，默认 5 分钟内有效。
// 本地 tools/issue-code.js 里有一份同样的算法 —— 两处必须一致（test-auth 有静态比对）。
function adminSign(secret, tag, ts) {
  return hmacHex('issue:' + tag + ':' + ts, secret).slice(0, 32)
}
/** 常量时间比对 + 时效窗口；通过返回 true */
function adminVerify(secret, tag, ts, sig, windowMs) {
  const t = Number(ts)
  if (!t || Math.abs(Date.now() - t) > (windowMs || 5 * 60000)) return false
  const a = Buffer.from(adminSign(secret, tag, t))
  const b = Buffer.from(String(sig || ''))
  return a.length === b.length && require('crypto').timingSafeEqual(a, b)
}

module.exports = {
  AUTH, RECOVERY_ALPHABET,
  normEmail, validEmail,
  genCode, genRecoveryCode, normRecoveryCode,
  sha256hex, hmacHex, hashCode, uidOf,
  b64url, b64urlDecode, signToken, verifyToken,
  canSendCode, checkCode,
  adminSign, adminVerify,
  fmtPlayerNo, isFounding, allocStep,
  stripReserved,
  setRand
}
