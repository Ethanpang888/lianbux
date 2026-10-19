#!/usr/bin/env node
/**
 * build/sync-engine.js —— 引擎副本同步与漂移校验
 *
 * 唯一真相源：
 *   健身小程序/utils/{method,kb,calc,diet,recipes-data,exercises-data}.js
 *   健身网站/shared/gamify.js
 *
 * 用法：
 *   node build/sync-engine.js --check   只校验（默认），不一致 exit 1
 *   node build/sync-engine.js --write   复制到 cloudfunctions/webApi/lib/
 *
 * 规则（与项目既有纪律一致）：
 *   · sendDailyPlan/lib/* 是【线上邮件链路】的副本 —— 只校验，绝不覆盖
 *   · webApi/lib/* 是新建网站的副本 —— 可以 --write 覆盖
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')                       // 健身网站/
const KB = path.resolve(ROOT, '..', '健身小程序')                 // 健身小程序/
const UTILS = path.join(KB, 'utils')
const MAIL_LIB = path.join(KB, 'cloudfunctions', 'sendDailyPlan', 'lib')
const WEBAPI_LIB = path.join(KB, 'cloudfunctions', 'webApi', 'lib')
const WEBAUTH_LIB = path.join(KB, 'cloudfunctions', 'webAuth', 'lib')

// 网页端需要的引擎文件（email-html.js 是邮件专用，不进 webApi）
const ENGINE_FILES = ['progression.js','method.js', 'kb.js', 'calc.js', 'diet.js', 'recipes-data.js', 'exercises-data.js']

const md5 = f => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')
const exists = f => { try { fs.accessSync(f); return true } catch (e) { return false } }

function buildList() {
  const list = []
  ENGINE_FILES.forEach(f => list.push({ name: f, src: path.join(UTILS, f), target: 'engine' }))
  list.push({ name: 'gamify.js', src: path.join(ROOT, 'shared', 'gamify.js'), target: 'both' })
  list.push({ name: 'macro.js', src: path.join(ROOT, 'shared', 'macro.js'), target: 'both' })
  list.push({ name: 'journal.js', src: path.join(ROOT, 'shared', 'journal.js'), target: 'both' })
  // 账号体系的纯逻辑：只进 webAuth（不进邮件链路，也不进浏览器包）
  // ⚠️ 必须是 'both' 不是 'auth' —— webApi/index.js 也 require('./lib/authkit.js')（验 token 用）。
  //    早先只写进 webAuth/lib，导致 webApi 上传后必然报 Cannot find module './lib/authkit.js'。
  //    'both' 不会把它塞进 sendDailyPlan（邮件链路不需要它）。
  list.push({ name: 'authkit.js', src: path.join(ROOT, 'shared', 'authkit.js'), target: 'both' })
  return list
}

function main() {
  const write = process.argv.includes('--write')
  const list = buildList()
  let drift = 0

  console.log('═'.repeat(78))
  console.log('  引擎同步校验（健身小程序/utils → 云函数副本）')
  console.log('═'.repeat(78))
  console.log('  文件'.padEnd(24) + 'utils MD5'.padEnd(12) + 'sendDailyPlan'.padEnd(16) + 'webApi'.padEnd(12) + 'webAuth')
  console.log('─'.repeat(90))

  list.forEach(item => {
    if (!exists(item.src)) { console.log('  ❌ 源文件缺失：' + item.src); drift++; return }
    const srcMd5 = md5(item.src).slice(0, 8)
    const wantMail = item.target === 'engine'                       // 只有引擎文件进邮件链路
    const wantWeb = item.target === 'engine' || item.target === 'both'
    const wantAuth = item.target === 'auth' || item.target === 'both'
    let mailMd5 = '—', webMd5 = '—', authMd5 = '—'

    if (wantMail) {
      const mailPath = path.join(MAIL_LIB, item.name)
      if (exists(mailPath)) {
        mailMd5 = md5(mailPath).slice(0, 8)
        if (mailMd5 !== srcMd5) { mailMd5 += ' ⚠️'; drift++ }
      } else { mailMd5 = '（缺失）'; drift++ }
    }
    if (wantWeb) {
      const webPath = path.join(WEBAPI_LIB, item.name)
      if (exists(webPath)) {
        webMd5 = md5(webPath).slice(0, 8)
        if (webMd5 !== srcMd5) { webMd5 += ' ⚠️'; if (!write) drift++ }
      } else {
        webMd5 = exists(WEBAPI_LIB) ? '（缺失）' : '（未生成）'
        if (exists(WEBAPI_LIB) && !write) drift++
      }
    }
    if (wantAuth) {
      const authPath = path.join(WEBAUTH_LIB, item.name)
      if (exists(authPath)) {
        authMd5 = md5(authPath).slice(0, 8)
        if (authMd5 !== srcMd5) { authMd5 += ' ⚠️'; if (!write) drift++ }
      } else {
        authMd5 = exists(WEBAUTH_LIB) ? '（缺失）' : '（未生成）'
        if (exists(WEBAUTH_LIB) && !write) drift++
      }
    }
    console.log('  ' + item.name.padEnd(22) + srcMd5.padEnd(12) + mailMd5.padEnd(16) +
      webMd5.padEnd(12) + authMd5)
  })

  console.log('─'.repeat(90))

  if (write) {
    fs.mkdirSync(WEBAPI_LIB, { recursive: true })
    fs.mkdirSync(WEBAUTH_LIB, { recursive: true })
    list.forEach(item => {
      if (item.target === 'engine' || item.target === 'both') {
        fs.copyFileSync(item.src, path.join(WEBAPI_LIB, item.name))
      }
      if (item.target === 'auth' || item.target === 'both') {
        fs.copyFileSync(item.src, path.join(WEBAUTH_LIB, item.name))
      }
    })
    console.log('  ✅ 已写入 ' + WEBAPI_LIB + ' 与 ' + WEBAUTH_LIB)
    console.log('  ⚠️ sendDailyPlan/lib 是线上邮件链路，只校验不覆盖')
    return
  }

  if (drift) {
    console.log('  ❌ 存在 ' + drift + ' 处漂移（⚠️ 标记处「每次构建前必须核对」）')
    console.log('     若确认是 utils 侧的新改动，执行：node build/sync-engine.js --write')
    process.exit(1)
  }
  console.log('  ✅ 全部一致（utils 与两份副本 MD5 相同）')
}

main()
