#!/usr/bin/env node
/**
 * build/build.js —— 生成 dist/index.html 与 dist/app.js
 *
 * · template/app.html 里的三个占位符注入 script 标签
 * · src/ 下所有文件按固定顺序拼接成 dist/app.js（不用 ESM，避免 file:// CORS 问题）
 * · dist/ 是唯一部署产物目录
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')
const DIST = path.join(ROOT, 'dist')

// 拼接顺序：工具 → 状态 → 网络 → 组件 → 页面 → 启动
const ORDER = [
  'fmt.js',
  'config.js',
  'vendor/qrcode.min.js',
  'store.js',
  'api.js',
  'router.js',
  'components/tabbar.js',
  'components/ui.js',
  'components/journal.js',
  'pages/login.js',
  'pages/home.js',
  'pages/training-flow.js',
  'pages/today.js',
  'pages/diet.js',
  'pages/records.js',
  'pages/me.js',
  'pages/badges.js',
  'pages/growth.js',
  'pages/rank.js',
  'pages/onboard.js',
  'pages/pro.js',
  'pages/coach.js',
  'pages/ai.js',
  'pages/foundations.js',
  'pages/secret.js',
  'pages/plus.js',
  'pages/plan.js',
  'pages/plan12.js',
  'pages/exlib.js',
  'pages/poster.js',
  'pages/breakthrough.js',
  'pages/precheck.js',
  'app.js'
]

const hashOf = buf => crypto.createHash('md5').update(buf).digest('hex').slice(0, 8)

/** 清掉上一轮带哈希的产物（先写新的再删旧的，避免中间态找不到文件） */
function sweepOld(dir, pattern, keep) {
  for (const f of fs.readdirSync(dir)) {
    if (pattern.test(f) && f !== keep) { try { fs.unlinkSync(path.join(dir, f)) } catch (e) {} }
  }
}

function main() {
  fs.mkdirSync(DIST, { recursive: true })

  // 1) app.js
  const chunks = []
  ORDER.forEach(rel => {
    const f = path.join(SRC, rel)
    if (!fs.existsSync(f)) { console.log('   （跳过缺失文件 ' + rel + '）'); return }
    chunks.push('/* ===== src/' + rel + ' ===== */')
    chunks.push(fs.readFileSync(f, 'utf8').replace(/^\s*export\s+/gm, ''))
    chunks.push('')
  })
  const appBuf = Buffer.from(chunks.join('\n'))
  fs.writeFileSync(path.join(DIST, 'app.js'), appBuf)                 // 原名保留：给工具/测试用
  const appName = 'app.' + hashOf(appBuf) + '.js'
  fs.writeFileSync(path.join(DIST, appName), appBuf)                  // 带哈希：线上用
  sweepOld(DIST, /^app\.[0-9a-f]{8}\.js$/, appName)

  // 2) engine.js → 同样出一份带哈希的
  //    为什么要带哈希：静态托管/CDN 会按文件名缓存，**同名覆盖不生效**（2026-09-23 实测：
  //    同一目录重复部署后线上仍是旧文件）。文件名一变，缓存就必然失效。
  let engineName = 'engine.js'
  const engPath = path.join(DIST, 'engine.js')
  if (fs.existsSync(engPath)) {
    const engBuf = fs.readFileSync(engPath)
    engineName = 'engine.' + hashOf(engBuf) + '.js'
    fs.writeFileSync(path.join(DIST, engineName), engBuf)
    sweepOld(DIST, /^engine\.[0-9a-f]{8}\.js$/, engineName)
  }

  // 3) index.html（引用带哈希的文件名）
  const tpl = fs.readFileSync(path.join(ROOT, 'template', 'app.html'), 'utf8')
  const html = tpl
    .replace('</style>', fs.readFileSync(path.join(ROOT, 'template', 'redesign.css'), 'utf8') + '\n</style>')
    .replace('<!--__ENGINE__-->', '<script src="' + engineName + '"></script>')
    .replace('<!--__APP__-->', '<script src="' + appName + '"></script>')
  fs.writeFileSync(path.join(DIST, 'index.html'), html)

  // 3) 静态素材：assets/ → dist/assets/（角色形象等）
  const ASSETS = path.join(ROOT, 'assets')
  let assetN = 0
  if (fs.existsSync(ASSETS)) {
    const walk = (dir, rel) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const src = path.join(dir, e.name)
        const dstRel = path.join(rel, e.name)
        const dst = path.join(DIST, 'assets', dstRel)
        if (e.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); walk(src, dstRel) }
        else {
          fs.mkdirSync(path.dirname(dst), { recursive: true })
          fs.copyFileSync(src, dst)
          assetN++
        }
      }
    }
    fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true })
    walk(ASSETS, '')
  }
  console.log('✅ dist/assets     ' + assetN + ' 个素材文件')

  const size = f => Math.round(fs.statSync(path.join(DIST, f)).size / 1024)

  // 桌面计算器的网页版（手机也能打开）：源文件 = 健身网站/calc.html（由 tools/sync-foods-to-calc.js 与引擎食物库同步）
  const calcSrc = path.join(ROOT, 'calc.html')
  if (fs.existsSync(calcSrc)) {
    fs.copyFileSync(calcSrc, path.join(DIST, 'calc.html'))
    console.log('✅ dist/calc.html  ' + size('calc.html') + ' KB  （计算器 · 手机可用）')
  }
  console.log('✅ dist/index.html ' + size('index.html') + ' KB')
  console.log('✅ dist/app.js     ' + size('app.js') + ' KB  → 线上用 ' + appName)
  if (engineName !== 'engine.js') console.log('✅ dist/' + engineName + '  （engine.js 的哈希副本）')
  const total = size('index.html') + size('app.js') + (fs.existsSync(path.join(DIST, 'engine.js')) ? size('engine.js') : 0)
  console.log('   首屏合计（含 engine.js）：' + total + ' KB' + (total > 400 ? '  ⚠️ 超预算 400KB' : '  ✅ 在 400KB 预算内'))
}

main()
