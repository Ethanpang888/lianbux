#!/usr/bin/env node
/* tools/admin-stats.js —— 看运营数字：网站 + 小程序的用户 / 打卡 / 活跃 / 会员
 *
 * 用法：node tools/admin-stats.js [--secret <AUTH_SECRET>]
 * 密钥来源同 issue-code.js：--secret / 环境变量 AUTH_SECRET / 文件 .auth-secret
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const GATEWAY = process.env.API_URL ||
  'https://cloud1-d7gtp1mv1bfcc25df-1469515685.ap-shanghai.app.tcloudbase.com/api'
const SECRET_FILE = path.join(__dirname, '..', '.auth-secret')

function adminSign(secret, tag, ts) {
  return crypto.createHmac('sha256', String(secret))
    .update('issue:' + tag + ':' + ts).digest('hex').slice(0, 32)
}

function loadSecret(explicit) {
  if (explicit) return explicit
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET
  try { const s = fs.readFileSync(SECRET_FILE, 'utf8').trim(); if (s) return s } catch (e) {}
  return ''
}

async function call(payload) {
  const res = await fetch(GATEWAY, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  })
  let r = null
  try { r = await res.json() } catch (e) {}
  if (!r) { console.error('❌ 服务器没有返回 JSON'); process.exit(1) }
  return r
}

async function main() {
  const argv = process.argv.slice(2)
  let secret = null
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--secret') secret = argv[++i]
  const key = loadSecret(secret)
  if (!key) { console.error('❌ 没找到 AUTH_SECRET（--secret / 环境变量 / .auth-secret 三选一）'); process.exit(1) }
  const ts = Date.now()
  const r = await call({ action: 'adminStats', ts, sig: adminSign(key, 'issue', ts) })
  if (!r.ok) { console.error('❌ ' + (r.code || 'SERVER')); process.exit(1) }

  const w = r.web, m = r.mini
  console.log('')
  console.log('════ 练不虚 · 运营数字（' + new Date(r.at).toLocaleString('zh-CN') + '）════')
  console.log('')
  console.log('【网站】')
  console.log('  注册用户      ' + w.users)
  console.log('  近 7 天活跃   ' + w.active7d)
  console.log('  付费会员      ' + w.members)
  console.log('  打卡总数      ' + w.checkins)
  console.log('【小程序（微信端）】')
  console.log('  用户          ' + m.users)
  console.log('  打卡总数      ' + m.checkins)
  console.log('')
  console.log('  合计用户      ' + (w.users + m.users) + '（网站 ' + w.users + ' + 小程序 ' + m.users + '）')
  console.log('')
}

main().catch(e => { console.error('❌ ' + ((e && e.message) || e)); process.exit(1) })
