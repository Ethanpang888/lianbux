#!/usr/bin/env node
/**
 * tools/check-deploy.js —— 部署前自检
 *
 * 跑法：cd 健身网站 && node tools/check-deploy.js
 *
 * 它检查的是「**本机这边**有没有准备好」，检查不了云上的事（那要你点）。
 * 目的：让你在点「上传并部署」之前就知道会不会缺文件，别传上去才发现 Cannot find module。
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const KB = path.resolve(ROOT, '..', '健身小程序')
const CF = path.join(KB, 'cloudfunctions')

let bad = 0, warn = 0
const line = (s) => console.log(s)
const ok = (s) => line('  ✅ ' + s)
const no = (s) => { bad++; line('  ❌ ' + s) }
const wr = (s) => { warn++; line('  ⚠️  ' + s) }
const sec = (s) => line('\n── ' + s + ' ──')

const exists = p => { try { fs.accessSync(p); return true } catch (e) { return false } }
const md5 = p => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex')

line('═'.repeat(60))
line('  部署前自检（只查本机，云上的要你自己点）')
line('═'.repeat(60))

// ── 1. 云函数目录在不在 ──
sec('1. 云函数目录')
const fns = ['webAuth', 'webApi']
fns.forEach(f => {
  const d = path.join(CF, f)
  if (!exists(path.join(d, 'index.js'))) return no(f + '/index.js 不存在')
  if (!exists(path.join(d, 'package.json'))) return no(f + '/package.json 不存在（云端装依赖要靠它）')
  ok(f + ' 目录完整')
})

// ── 2. 依赖文件齐不齐（漏了就会报 Cannot find module）──
sec('2. 云函数依赖文件（最容易漏）')
// webApi 直接 require 的 7 个 + kb.js 自己还会 require 的（传递依赖）
const WEBAPI_NEED = ['authkit.js', 'gamify.js', 'journal.js', 'calc.js', 'kb.js', 'macro.js',
  // 下面是 kb.js 间接依赖，漏了就报错
  'diet.js', 'method.js', 'recipes-data.js', 'exercises-data.js']
const WEBAUTH_NEED = ['authkit.js']

const miss = (dir, need) => need.filter(f => !exists(path.join(dir, f)))
const m1 = miss(path.join(CF, 'webApi', 'lib'), WEBAPI_NEED)
const m2 = miss(path.join(CF, 'webAuth', 'lib'), WEBAUTH_NEED)
if (m1.length) no('webApi/lib 缺：' + m1.join(', ') + '　→ 先跑 node build/sync-engine.js --write')
else ok('webApi/lib 的 ' + WEBAPI_NEED.length + ' 个依赖文件都在')
if (m2.length) no('webAuth/lib 缺：' + m2.join(', '))
else ok('webAuth/lib 的依赖文件都在')

// ── 3. 三份引擎副本一致吗（不一致说明有人改了一处没同步）──
sec('3. 引擎副本一致性（门禁）')
const UTILS = path.join(KB, 'utils')
const same = ['method.js', 'kb.js', 'calc.js', 'diet.js', 'recipes-data.js', 'exercises-data.js',
  'gamify.js', 'macro.js', 'journal.js']
let drift = []
same.forEach(f => {
  const src = [path.join(UTILS, f), path.join(ROOT, 'shared', f)].find(exists)
  if (!src) return
  const a = md5(src)
  ;[path.join(CF, 'webApi', 'lib', f), path.join(CF, 'sendDailyPlan', 'lib', f)]
    .filter(exists).forEach(t => { if (md5(t) !== a) drift.push(path.relative(KB, t)) })
  const wa = path.join(CF, 'webAuth', 'lib', f)
  if (exists(wa) && md5(wa) !== a) drift.push(path.relative(KB, wa))
})
if (drift.length) {
  no('以下副本与源文件不一致：\n       ' + drift.join('\n       '))
  line('     → 修复：node build/sync-engine.js --write')
  line('       然后手工补邮件链路：cp 健身小程序/utils/kb.js 健身小程序/cloudfunctions/sendDailyPlan/lib/kb.js')
} else ok('utils / shared / 三份云函数副本 MD5 全部一致')

// ── 4. 前端地址配好了吗 ──
sec('4. 前端接口地址')
const cfg = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8')
const env = (cfg.match(/ENV:\s*'([^']+)'/) || [])[1] || ''
const host = (cfg.match(/API_HOST:\s*'([^']+)'/) || [])[1] || ''
if (!host) no('src/config.js 里 API_HOST 是空的 → 网站会一直停在演示模式')
else {
  ok('环境 ID：' + env)
  ok('接口域名：' + host)
  line('     部署完请用浏览器打开下面两个地址自检：')
  line('       ' + host + '/auth?action=ping')
  line('       ' + host + '/api?action=ping')
  line('     期望看到 {"ok":true,"pong":true,"svc":"webAuth"} 这种')
}

// ── 5. 要填的环境变量（照抄） ──
sec('5. 你要在控制台填的环境变量')
line('  webAuth 填 3 个：')
line('    AUTH_SECRET       = （见 健身网站/docs/我要做什么-手把手版.md 第 4 步）')
line('    SENDER_EMAIL      = 你发验证码用的 QQ 邮箱')
line('    SENDER_AUTH_CODE  = 那个邮箱的 16 位授权码（不是密码）')
line('  webApi 填 1 个：')
line('    AUTH_SECRET       = 必须和 webAuth 一模一样')
line('  ⛔ 绝对不要填 DEV_FIXED_CODE —— 那会让验证码变成固定值，谁都能登录别人账号')

// ── 6. 数据库集合（提醒） ──
sec('6. 数据库集合（控制台手动建）')
line('  webusers / weblogin_codes / webcheckins / counters')
line('  weborders（可选 · 开通/取消的审计流水；不建也不影响权益发放，权限同样选最严的那档）')
line('  权限一律选「仅管理端可读写」。⛔ 别选「所有用户可读」（等于公开所有人邮箱）')

// ── 汇总 ──
line('\n' + '═'.repeat(60))
if (bad) {
  line('  ❌ 有 ' + bad + ' 处必须先修，修完再点「上传并部署」')
} else if (warn) {
  line('  ⚠️  本机没问题，但有 ' + warn + ' 处提醒')
} else {
  line('  ✅ 本机全部就绪，可以开始点了（云上的步骤见 docs/我要做什么-手把手版.md）')
}
line('═'.repeat(60))
process.exit(bad ? 1 : 0)
