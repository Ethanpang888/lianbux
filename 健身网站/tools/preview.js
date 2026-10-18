#!/usr/bin/env node
/**
 * tools/preview.js —— 零依赖静态服务器（本地预览 dist/）
 * 用法：node tools/preview.js [端口]   默认 5173
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', 'dist')
const PORT = Number(process.argv[2]) || 5173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm'
}

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/' || p === '') p = '/index.html'
  const file = path.join(ROOT, p)
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return }
  fs.readFile(file, (err, buf) => {
    if (err) {
      // SPA：未知路径回落到 index.html
      fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); res.end('not found'); return }
        res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(html)
      })
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(buf)
  })
}).listen(PORT, () => {
  console.log('▶ 本地预览：http://localhost:' + PORT)
  console.log('  目录：' + ROOT)
})
