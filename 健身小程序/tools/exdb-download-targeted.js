// tools/exdb-download-targeted.js
// 只下载 exdb-map.json 里用到的公有领域动作图（避免拉全部 873 张）
// 用法：node tools/exdb-download-targeted.js
const fs = require('fs')
const path = require('path')

const REPO = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main'
const OUT = path.join(__dirname, '..', 'assets', 'exdb')
const MAP = require('../exdb-map.json')

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  console.log('拉取 exercises.json ...')
  const res = await fetch(`${REPO}/dist/exercises.json`)
  const list = await res.json()
  const byId = Object.fromEntries(list.map(e => [e.id, e]))

  const ids = [...new Set(Object.values(MAP))]
  console.log(`需下载 ${ids.length} 张（去重后）...`)

  let ok = 0, fail = 0
  for (const id of ids) {
    const ex = byId[id]
    const imgRel = (ex && ex.images && ex.images[0]) || `${id}/0.jpg`
    const url = `${REPO}/exercises/${imgRel}`
    try {
      const r = await fetch(url)
      if (!r.ok) { console.log('  缺失:', id, r.status); fail++; continue }
      const buf = Buffer.from(await r.arrayBuffer())
      fs.writeFileSync(path.join(OUT, id + '.jpg'), buf)
      ok++
    } catch (e) { console.log('  失败:', id, e.message); fail++ }
  }
  console.log(`完成：成功 ${ok}，失败 ${fail}`)
  console.log(`图片目录：assets/exdb/ （${ok} 张），下一步上传到 CloudBase Storage 的 exgif/ 目录`)
}
main().catch(e => { console.error(e); process.exit(1) })
