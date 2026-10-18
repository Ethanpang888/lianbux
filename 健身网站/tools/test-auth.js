#!/usr/bin/env node
/**
 * tools/test-auth.js —— 账号体系纯逻辑回归测试（纯 Node，零依赖）
 * 跑法：node tools/test-auth.js
 *
 * 这一层是安全要害，重点测「不该通过的必须通不过」：
 *   token 伪造/过期/换密钥、验证码过期/已用/错满锁定、发码限流边界、编号分配。
 */
const path = require('path')
const K = require('../shared/authkit.js')
const ROOT = path.join(__dirname, '..')

let pass = 0, fail = 0
const failures = []
function ok(cond, name, extra) {
  if (cond) { pass++; return }
  fail++; failures.push(name + (extra ? '  → ' + extra : ''))
}
function section(t) { console.log('\n── ' + t + ' ──') }

const SECRET = 'test-secret-abcdefghijklmnop'
const T0 = 1760000000000   // 固定时间基准，避免测试依赖真实时钟

// ── 1. 邮箱 ──
section('1. 邮箱归一与校验')
{
  ok(K.normEmail('  AbC@QQ.COM ') === 'abc@qq.com', '去空格 + 转小写', K.normEmail('  AbC@QQ.COM '))
  ok(K.validEmail('a@b.co') === true, '正常邮箱通过')
  ok(K.validEmail('774727700@qq.com') === true, '用户自己的邮箱通过')
  ok(K.validEmail('a@b') === false, '没有顶级域 → 拒绝')
  ok(K.validEmail('a b@c.com') === false, '含空格 → 拒绝')
  ok(K.validEmail('@c.com') === false, '没有用户名 → 拒绝')
  ok(K.validEmail('') === false && K.validEmail(null) === false, '空值 → 拒绝（不抛错）')
  ok(K.normEmail(null) === '', 'null 归一为空串（不抛错）')
}

// ── 2. 验证码 ──
section('2. 验证码生成')
{
  const c = K.genCode()
  ok(/^\d{6}$/.test(c), '默认 6 位纯数字', c)
  const cs = new Set()
  for (let i = 0; i < 200; i++) cs.add(K.genCode())
  ok(cs.size > 180, '200 次生成几乎不重复（随机性正常）', '唯一 ' + cs.size + ' 个')
  // 早期实现把随机缓存了一次，会导致每一位相同 —— 加一条防回归
  let allSame = 0
  for (let i = 0; i < 50; i++) {
    const s = K.genCode()
    if (new Set(s.split('')).size < 3) allSame++
  }
  ok(allSame < 12, '不会退化成"各位数字几乎相同"', '异常样本 ' + allSame + '/50')
  k_rand()
}
function k_rand() {
  // 注入确定性随机，验证可测性
  let i = 0
  K.setRand(() => [0.1, 0.5, 0.9][i++ % 3])
  ok(K.genCode(3) === '159', '注入随机后输出可预测（便于测试）', K.genCode(3))
  K.setRand(null)
}

// ── 3. 恢复码 ──
section('3. 恢复码')
{
  const r = K.genRecoveryCode()
  ok(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(r), '格式 4-4-4 且不含易混字符', r)
  ok(!/[01OIL]/.test(r), '不含 0/1/O/I/L（抄写不歧义）', r)
  ok(K.normRecoveryCode(r) === K.normRecoveryCode(r.toLowerCase()), '大小写不敏感', K.normRecoveryCode(r))
  ok(K.normRecoveryCode('  k7m4 9qx2 ') === 'K7M49QX2', '去掉空格/连字符', K.normRecoveryCode('  k7m4 9qx2 '))
  const set = new Set()
  for (let i = 0; i < 300; i++) set.add(K.genRecoveryCode())
  ok(set.size === 300, '300 次生成不重复', String(set.size))
}

// ── 4. 哈希与 uid ──
section('4. 哈希确定性')
{
  const h1 = K.hashCode('a@b.com', '123456', SECRET)
  const h2 = K.hashCode('A@B.COM', '123456', SECRET)
  ok(h1 === h2, '同一邮箱不同大小写 → 同一哈希（要先归一）')
  ok(K.hashCode('a@b.com', '123456', SECRET) !== K.hashCode('a@b.com', '123457', SECRET), '不同验证码 → 不同哈希')
  ok(K.hashCode('a@b.com', '123456', SECRET) !== K.hashCode('a@b.com', '123456', SECRET + 'x'), '不同密钥 → 不同哈希')
  ok(h1.length === 64, 'sha256 hex 长度 64', String(h1.length))
  ok(!/^\d{6}$/.test(h1), '库里存的不是明文验证码')

  ok(K.uidOf('a@b.com', SECRET) === K.uidOf('A@B.COM', SECRET), '同一邮箱 → 同一 uid（重复登录不会建两个号）')
  ok(K.uidOf('a@b.com', SECRET) !== K.uidOf('c@d.com', SECRET), '不同邮箱 → 不同 uid')
  ok(K.uidOf('a@b.com', SECRET) !== K.uidOf('a@b.com', SECRET + 'x'), '换密钥 → 不同 uid')
  ok(/^u[0-9a-f]{23}$/.test(K.uidOf('a@b.com', SECRET)), 'uid 形如 u+23位十六进制', K.uidOf('a@b.com', SECRET))
}

// ── 5. token 签发与校验 ──
section('5. 登录态 token')
{
  const t = K.signToken({ uid: 'u123', pn: 7 }, SECRET, T0)
  ok(t.split('.').length === 2, 'token 是 payload.signature 两段', t.slice(0, 30))
  const p = K.verifyToken(t, SECRET, T0 + 1000)
  ok(p && p.uid === 'u123' && p.pn === 7, '正常 token 校验通过并取回 payload', JSON.stringify(p))
  ok(p.exp === T0 + K.AUTH.tokenTtlMs, '带 30 天有效期', String(p.exp - p.iat))
  ok(typeof p.iat === 'number', '带签发时间')

  ok(K.verifyToken(t, SECRET, T0 + K.AUTH.tokenTtlMs + 1) === null, '过期 → 拒绝')
  ok(K.verifyToken(t, SECRET, T0 + K.AUTH.tokenTtlMs - 1) !== null, '未过期 → 通过（边界）')
  ok(K.verifyToken(t, 'another-secret-xxxxxxxx', T0 + 1000) === null, '★ 换密钥伪造 → 拒绝')
  ok(K.verifyToken(t, SECRET + '', T0 + 1000) !== null, '同密钥仍通过')

  // 篡改 payload（把编号改成创始人）
  const parts = t.split('.')
  const evil = K.b64url(JSON.stringify({ uid: 'u123', pn: 1, iat: T0, exp: T0 + 1e12 })) + '.' + parts[1]
  ok(K.verifyToken(evil, SECRET, T0 + 1000) === null, '★ 篡改 payload（改成 #0001）→ 拒绝')
  // 篡改签名
  ok(K.verifyToken(parts[0] + '.' + parts[1].slice(0, -1) + 'X', SECRET, T0 + 1000) === null, '★ 篡改签名 → 拒绝')

  ok(K.verifyToken('', SECRET, T0) === null, '空 token → null')
  ok(K.verifyToken(null, SECRET, T0) === null, 'null → null')
  ok(K.verifyToken('abc', SECRET, T0) === null, '格式错（没有点）→ null')
  ok(K.verifyToken('a.b.c', SECRET, T0) === null, '格式错（三段）→ null')
  ok(K.verifyToken(parts[0] + '.', SECRET, T0) === null, '签名段为空 → null')

  // 到期时间被改大也没用（签名覆盖整个 payload）
  const longExp = K.signToken({ uid: 'u1', pn: 2 }, SECRET, T0)
  ok(K.verifyToken(longExp, SECRET, T0 + 40 * 24 * 3600 * 1000) === null, '40 天后过期', '')
}

// ── 6. 发码限流 ──
section('6. 发码限流')
{
  ok(K.canSendCode(null, T0).ok === true, '首次发码 → 允许')
  ok(K.canSendCode({}, T0).ok === true, '空记录 → 允许')
  ok(K.canSendCode({ lastSentAt: T0 - 30 * 1000 }, T0).ok === false, '30 秒内重发 → 拦（60s 冷却）')
  const r1 = K.canSendCode({ lastSentAt: T0 - 30 * 1000 }, T0)
  ok(r1.code === 'RATE_LIMIT' && r1.waitMs === 30 * 1000, '给出还需等多久', String(r1.waitMs))
  ok(K.canSendCode({ lastSentAt: T0 - 61 * 1000 }, T0).ok === true, '超过 60 秒 → 允许')

  const inWin = { lastSentAt: T0 - 61 * 1000, sentCount: 4, windowStartAt: T0 - 600 * 1000 }
  ok(K.canSendCode(inWin, T0).ok === true, '1 小时内第 5 封 → 允许')
  const atCap = { lastSentAt: T0 - 61 * 1000, sentCount: 5, windowStartAt: T0 - 600 * 1000 }
  ok(K.canSendCode(atCap, T0).ok === false, '1 小时内第 6 封 → 拦')
  const expiredWin = { lastSentAt: T0 - 61 * 1000, sentCount: 5, windowStartAt: T0 - 61 * 60 * 1000 }
  ok(K.canSendCode(expiredWin, T0).ok === true, '窗口过期（>1 小时）→ 计数重置，允许')

  ok(K.canSendCode({ banUntil: T0 + 60 * 1000 }, T0).ok === false, '锁定期内 → 拦')
  ok(K.canSendCode({ banUntil: T0 + 60 * 1000 }, T0).code === 'LOCKED', '返回 LOCKED 便于前端提示')
  ok(K.canSendCode({ banUntil: T0 - 1 }, T0).ok === true, '锁定期已过 → 允许')
}

// ── 7. 验证码校验 ──
section('7. 验证码校验')
{
  const good = {
    codeHash: K.hashCode('a@b.com', '123456', SECRET),
    expAt: T0 + 5 * 60 * 1000, tries: 0, usedAt: 0, banUntil: 0
  }
  ok(K.checkCode(good, 'a@b.com', '123456', SECRET, T0).ok === true, '正确验证码 → 通过')
  ok(K.checkCode(good, 'A@B.COM', '123456', SECRET, T0).ok === true, '邮箱大小写不影响')

  const wrong = K.checkCode(good, 'a@b.com', '654321', SECRET, T0)
  ok(wrong.ok === false && wrong.code === 'CODE_WRONG', '错误验证码 → CODE_WRONG')
  ok(wrong.triesLeft === 4, '剩余次数递减（4）', String(wrong.triesLeft))
  const wrong2 = K.checkCode(Object.assign({}, good, { tries: 4 }), 'a@b.com', '000000', SECRET, T0)
  ok(wrong2.banMs === K.AUTH.lockMs, '★ 错满 5 次 → 锁定 15 分钟', String(wrong2.banMs))

  ok(K.checkCode(good, 'a@b.com', '123456', SECRET, T0 + 11 * 60 * 1000).code === 'CODE_EXPIRED', '11 分钟后过期')
  ok(K.checkCode(Object.assign({}, good, { usedAt: T0 }), 'a@b.com', '123456', SECRET, T0).code === 'CODE_USED', '★ 验证码一次性（用过即废）')
  ok(K.checkCode(Object.assign({}, good, { banUntil: T0 + 1000 }), 'a@b.com', '123456', SECRET, T0).code === 'LOCKED', '锁定中即使码对也拒绝')
  ok(K.checkCode(Object.assign({}, good, { tries: 5 }), 'a@b.com', '123456', SECRET, T0).code === 'LOCKED', '次数已满 → 锁')
  ok(K.checkCode({}, 'a@b.com', '123456', SECRET, T0).code === 'NO_CODE', '没申请过验证码 → NO_CODE')
  ok(K.checkCode(good, 'a@b.com', 'abcdef', SECRET, T0).code === 'CODE_WRONG', '非数字输入 → 当错误处理（不崩）')
  ok(K.checkCode(good, 'a@b.com', '', SECRET, T0).code === 'CODE_WRONG', '空输入 → 错误')
  ok(K.checkCode(good, 'a@b.com', '12345', SECRET, T0).code === 'CODE_WRONG', '位数不足 → 错误')
}

// ── 8. 玩家编号 ──
section('8. 玩家编号')
{
  ok(K.fmtPlayerNo(1) === '#0001', '第 1 位 → #0001', K.fmtPlayerNo(1))
  ok(K.fmtPlayerNo(100) === '#0100', '第 100 位 → #0100')
  ok(K.fmtPlayerNo(12345) === '#12345', '超 4 位不截断')
  ok(K.fmtPlayerNo(0) === '#----', '未分配 → 占位符（不出现 undefined）')
  ok(K.isFounding(1) === true && K.isFounding(100) === true, '1–100 是创始玩家（含边界）')
  ok(K.isFounding(101) === false && K.isFounding(0) === false, '101 位之后不是 / 未分配不是')

  const a = K.allocStep(null, false)
  ok(a.action === 'create' && a.next === 1, '★ 计数器不存在 → 创建并返回 1（第一个注册的人是 #0001）', JSON.stringify(a))
  const b = K.allocStep(7, true)
  ok(b.action === 'cas' && b.expect === 7 && b.next === 8, '★ 乐观锁：只有 seq 还是 7 时才写成 8', JSON.stringify(b))
}

// ── 9. 综合场景 ──
section('9. 端到端场景（纯逻辑串一遍）')
{
  // 用户注册：发码 → 校验 → 建号 → 签 token → 后续请求带 token
  const email = 'New@QQ.com'
  let rec = { lastSentAt: T0 - 120 * 1000, sentCount: 1, windowStartAt: T0 - 120 * 1000 }
  ok(K.canSendCode(rec, T0).ok === true, '① 发码放行')
  const code = '482913'
  rec = { codeHash: K.hashCode(email, code, SECRET), expAt: T0 + 600 * 1000, tries: 0, usedAt: 0, banUntil: 0 }
  ok(K.checkCode(rec, email, code, SECRET, T0 + 30 * 1000).ok === true, '② 用户 30 秒内输入验证码 → 通过')
  const token = K.signToken({ uid: K.uidOf(email, SECRET), pn: 1, em: K.normEmail(email) }, SECRET, T0)
  const p = K.verifyToken(token, SECRET, T0 + 3600 * 1000)
  ok(p && p.pn === 1 && K.isFounding(p.pn), '③ 拿到 #0001 创始玩家身份', JSON.stringify(p))
  // 攻击者拿到 token 后想改成 #9999 —— 签名挡住
  const forged = K.b64url(JSON.stringify({ uid: p.uid, pn: 9999, iat: p.iat, exp: p.exp })) + '.' + token.split('.')[1]
  ok(K.verifyToken(forged, SECRET, T0 + 3600 * 1000) === null, '④ 篡改编号被签名挡住')
}

// ─────────────────────────────────────────────
//  写库安全（踩过的坑，必须锁住）
// ─────────────────────────────────────────────
const fs = require('fs')
const CF = path.join(ROOT, '..', '健身小程序', 'cloudfunctions')
const readCF = f => fs.readFileSync(path.join(CF, f), 'utf-8')

section('10. 写库前必须剥掉保留字段（_id / _openid）')
{
  // ① 纯函数行为
  const dirty = { _id: 'a@b.com', _openid: 'oX', email: 'a@b.com', seq: 3 }
  const clean = K.stripReserved(dirty)
  ok(clean._id === undefined && clean._openid === undefined, '剥掉 _id 与 _openid')
  ok(clean.email === 'a@b.com' && clean.seq === 3, '业务字段原样保留')
  ok(dirty._id === 'a@b.com', '不修改入参（纯函数）')
  ok(typeof K.stripReserved() === 'object', '空入参安全')
  ok(Object.keys(K.stripReserved({})).length === 0, '空对象返回空对象')
  ok(K.stripReserved({ _id: 1 })._id === undefined, '只有 _id 时返回空对象')

  // ② 云函数源码里不允许出现「裸传 data」（会报 -501007 的那个写法）
  const files = ['webAuth/index.js', 'webApi/index.js']
  files.forEach(f => {
    const src = readCF(f)
    const bare = /\.set\(\{\s*data\s*\}\)/.test(src) || /\.update\(\{\s*data\s*\}\)/.test(src)
    ok(!bare, f + ' 没有裸传 set/update({ data })（必须经 stripReserved）')
    const hasStrip = /K\.stripReserved\(/.test(src)
    ok(hasStrip, f + ' 写入前调用了 K.stripReserved')
  })

  // ③ 不允许再出现「catch 后降级 add」这种掩盖真实错误的写法
  files.forEach(f => {
    const src = readCF(f)
    const fallback = /\.set\([\s\S]{0,120}?\.catch\(\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]{0,200}?\.add\(/.test(src)
    ok(!fallback, f + ' 没有「set 失败就降级 add」的写法（会掩盖真实错误）')
  })

  // ③-b 会员字段绝不能进客户端可写白名单（否则改一下浏览器内存就白嫖）
  {
    const src = readCF('webApi/index.js')
    const m = src.match(/const WRITABLE = \[([^\]]*)\]/)
    const list = m ? m[1] : ''
    ok(!!m, 'webApi 里有 WRITABLE 白名单')
    ok(!!m && !/member/.test(list), '★ member 不在可写白名单（会员只能由服务端发放）')
    ok(!!m && !/gamify/.test(list), '★ gamify 不在可写白名单（EXP 只能服务端结算）')
    ok(/async function grantMember/.test(src), '权益发放收敛到唯一入口 grantMember')
    ok(/case 'redeem':/.test(src), '有兑换接口')
    ok(/case 'cancelMember':/.test(src), '有自助退订接口（不能只有开通没有取消）')

    // 前端不该再持有任何口令
    const proSrc = fs.readFileSync(path.join(ROOT, 'shared', 'pro.js'), 'utf-8')
    ok(!/CODE_HASH/.test(proSrc) && !/function checkCode/.test(proSrc),
      '★ 前端 shared/pro.js 里不再有口令与哈希')

    const authSrc2 = readCF('webAuth/index.js')
    ok(/member:\s*\{\s*level:\s*''/.test(authSrc2), '注册时 member 初始为未开通')
  }

  // ⑥ 管理签名（发码接口的鉴权）
  {
    ok(K.adminSign('s3cret', 'issue', 123) === K.adminSign('s3cret', 'issue', 123), 'adminSign 可复现')
    ok(K.adminSign('s3cret', 'issue', 123) !== K.adminSign('other', 'issue', 123), '密钥不同 → 签名不同')
    ok(K.adminSign('s3cret', 'issue', 123) !== K.adminSign('s3cret', 'list', 123), 'tag 不同 → 签名不同')
    const ts = Date.now()
    ok(K.adminVerify('s3cret', 'issue', ts, K.adminSign('s3cret', 'issue', ts)) === true, '正确签名 → 通过')
    ok(K.adminVerify('s3cret', 'issue', ts, K.adminSign('s3cret', 'issue', ts - 1)) === false, '时间戳被换过 → 拒绝')
    ok(K.adminVerify('s3cret', 'issue', ts - 10 * 60000, K.adminSign('s3cret', 'issue', ts - 10 * 60000)) === false, '超过时效窗口 → 拒绝')
    ok(K.adminVerify('s3cret', 'issue', ts, K.adminSign('wrong', 'issue', ts)) === false, '密钥不对 → 拒绝')
    ok(K.adminVerify('s3cret', 'issue', ts, '') === false, '空签名 → 拒绝')
    ok(K.adminVerify('s3cret', 'issue', 'abc', 'x') === false, '时间戳非数字 → 拒绝')
  }

  // ⑦ 发码链路的静态检查（issueCode 必须验签；CLI 与 authkit 的签名构造必须一致）
  {
    const api = readCF('webApi/index.js')
    ok(/action === 'issueCode'\s*\|\|\s*action === 'listCodes'/.test(api), '管理员接口在用户登录之前分流')
    ok(/K\.adminVerify\(secret\(\), 'issue'/.test(api), '★ 发码接口必须验管理签名（否则谁都能发码）')
    ok(/COL_CODES\s*=\s*'webcodes'/.test(api), '零售码存 webcodes')
    ok(/used:\s*true/.test(api), '零售码兑换后立即作废（一次一用）')

    const cli = fs.readFileSync(path.join(ROOT, 'tools', 'issue-code.js'), 'utf8')
    const kit = fs.readFileSync(path.join(ROOT, 'shared', 'authkit.js'), 'utf8')
    const pat = /'issue:'\s*\+\s*tag\s*\+\s*':'\s*\+\s*ts/
    ok(/createHmac\('sha256'/.test(cli), 'CLI 用 HMAC 签名')
    ok(pat.test(cli) && pat.test(kit), '★ CLI 与 authkit 的签名串构造一致（两处真相会被这里抓住）')
  }

  // ④ 调试后门必须处于禁用状态（设了要拒绝服务，而不是"变成固定码"）
  const authSrc = readCF('webAuth/index.js')
  ok(!/const code = process\.env\.DEV_FIXED_CODE \|\|/.test(authSrc),
    '不再用「DEV_FIXED_CODE || 随机码」这种降级写法')
  ok(/if \(process\.env\.DEV_FIXED_CODE\)\s*throw/.test(authSrc),
    '检测到 DEV_FIXED_CODE 直接拒绝服务（fail-closed）')
  ok(/DEV_FIXED_CODE_FORBIDDEN/.test(authSrc), '该后门有独立错误标识')
  ok(/DEV_FIXED_CODE_FORBIDDEN/.test(authSrc) && /SERVER_MISCONFIG/.test(authSrc),
    '后门触发时返回「服务未正确配置」而不是含糊的服务器错误')

  // ⑤ 三份 authkit 副本必须一致（本地改完没同步 = 线上行为跟测试不一致）
  const src = fs.readFileSync(path.join(ROOT, 'shared', 'authkit.js'), 'utf-8')
  const copies = ['webAuth/lib/authkit.js', 'webApi/lib/authkit.js']
  copies.forEach(c => {
    let same = true
    try { same = fs.readFileSync(path.join(CF, c), 'utf-8') === src } catch (e) { same = false }
    ok(same, c + ' 与 shared/authkit.js 完全一致')
  })
}

console.log('\n' + '═'.repeat(56))
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail) { console.log('\n  失败明细：'); failures.forEach(f => console.log('   · ' + f)) }
console.log('═'.repeat(56))
process.exit(fail ? 1 : 0)
