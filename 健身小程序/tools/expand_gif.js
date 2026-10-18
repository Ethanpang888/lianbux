#!/usr/bin/env node
// 动态重建 exercises-data.js 里每个动作的 gif 数组：
// 根据本地目录里实际存在的中间帧(1b.jpg,2b.jpg,...)数量，
// 组装成 [0.jpg, 1b..Nb, 1.jpg]。幂等、不依赖写死的帧数。
const fs = require('fs')
const path = require('path')
const DATA = 'utils/exercises-data.js'

let src = fs.readFileSync(DATA, 'utf8')
src = src.replace(/"gif":\s*\[([^\]]*)\]/g, (m, inner) => {
  const first = inner.match(/"([^"]+\/0\.jpg)"/)
  if (!first) return m
  const dir = path.dirname(first[1])                 // 如 /subpkgs/exlib/assets/ex/ID
  const localDir = path.join('.', dir)               // 相对项目根，回到真实文件系统
  if (!fs.existsSync(localDir)) return m
  const mids = fs.readdirSync(localDir)
    .filter(f => /^\d+b\.jpg$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))
  const arr = [
    first[1],
    ...mids.map(f => path.join(dir, f).split(path.sep).join('/')),
    path.join(dir, '1.jpg').split(path.sep).join('/')
  ]
  return '"gif": ' + JSON.stringify(arr)
})
fs.writeFileSync(DATA, src)
console.log('gif 数组已按本地中间帧动态重建')
