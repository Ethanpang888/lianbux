// 把 gif 数组从「多帧(含 1b..6b)」回退为 [0.jpg, 1.jpg] 两真帧
const fs = require('fs')
const DATA = 'utils/exercises-data.js'
let s = fs.readFileSync(DATA, 'utf8')
let n = 0
s = s.replace(/"gif":\s*\[([^\]]*)\]/g, (m, inner) => {
  if (!inner.includes('.jpg')) return m           // 空数组保持
  const urls = (inner.match(/"[^"]+\.jpg"/g) || [])
  if (urls.length < 2) return m
  n++
  return `"gif": [${urls[0]}, ${urls[urls.length - 1]}]`
})
fs.writeFileSync(DATA, s)
console.log('已回退', n, '条 gif 数组为 [0.jpg, 1.jpg]')
