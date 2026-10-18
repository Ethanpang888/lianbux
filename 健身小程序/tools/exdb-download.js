// tools/exdb-download.js
// 从 free-exercise-db（公有领域 / Unlicense）批量下载动作演示图到 assets/exdb/
// 用法：node tools/exdb-download.js
// 依赖：Node 18+（自带 fetch）。无需安装任何包。
//
// 说明：
// - 这些图片版权为公有领域，可商用、可修改、可署名或不署名（最安全来源）。
// - 图片是静态 JPG（非 GIF 动画），用于展示动作形态足够；真机/发布必须上传到 CloudBase Storage 并替换为 https URL（见《GIF替换与上传指南.md》）。
// - 本脚本只下载，不强制把每个图对应到中文名；中文名映射在 exdb-map.json 里维护（见指南）。

const fs = require('fs')
const path = require('path')

const REPO = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main'
const OUT = path.join(__dirname, '..', 'assets', 'exdb')

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  console.log('拉取 exercises.json ...')
  const res = await fetch(`${REPO}/dist/exercises.json`)
  const list = await res.json()
  console.log(`共 ${list.length} 个动作，开始下载第 1 张演示图 ...`)

  const manifest = []
  let ok = 0, fail = 0
  for (const ex of list) {
    const id = ex.id
    const imgRel = (ex.images && ex.images[0]) || null
    if (!imgRel) { fail++; continue }
    const url = `${REPO}/exercises/${imgRel}`
    try {
      const r = await fetch(url)
      if (!r.ok) { fail++; continue }
      const buf = Buffer.from(await r.arrayBuffer())
      // 用动作 id 作文件名，空格转下划线，避免中文/特殊字符问题
      const file = path.join(OUT, id.replace(/\s+/g, '_') + '.jpg')
      fs.writeFileSync(file, buf)
      manifest.push({ id, file: 'assets/exdb/' + id.replace(/\s+/g, '_') + '.jpg', name: ex.name, force: ex.force, level: ex.level, equipment: ex.equipment, primaryMuscles: ex.primaryMuscles })
      ok++
      if (ok % 50 === 0) console.log(`  ...已下载 ${ok}`)
    } catch (e) { fail++ }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`完成：成功 ${ok}，失败 ${fail}`)
  console.log(`清单已写入 assets/exdb/manifest.json`)
  console.log(`下一步：把 assets/exdb/ 整个文件夹上传到 CloudBase Storage 的 exgif/ 目录，再用 exdb-map.json 把中文动作名映射到这些文件名，最后批量替换为 https URL。`)
}

main().catch(e => { console.error(e); process.exit(1) })
