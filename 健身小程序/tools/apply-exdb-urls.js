// tools/apply-exdb-urls.js
// 把 utils/exercises-data.js 里本地 gif 路径（/assets/exdb/<id>.jpg）
// 批量替换为 jsDelivr CDN 的公开 URL（free-exercise-db 公有领域 / Unlicense）
//
// URL 格式：
//   https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/<id>/0.jpg
//
// 说明：
//   - 不再依赖 CloudBase Storage 付费权限，直接引用 GitHub 上的公有领域图
//   - 脚本会先把 utils/exercises-data.js 备份成 utils/exercises-data.js.bak，再覆盖写回
//   - 演练模式：node tools/apply-exdb-urls.js --test   （不写文件，只打印样例）

const fs = require('fs')
const path = require('path')

const DATA = path.join(__dirname, '..', 'utils', 'exercises-data.js')
const BASE_URL = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises'

function build() {
  const data = require(DATA)
  const out = data.map(e => {
    if (e.gif && e.gif.indexOf('/assets/exdb/') === 0) {
      const id = e.gif.split('/').pop().replace(/\.jpg$/i, '')
      return Object.assign({}, e, { gif: `${BASE_URL}/${id}/0.jpg` })
    }
    return e
  })
  const changed = out.filter(e => e.gif && e.gif.indexOf(BASE_URL) > -1)
  return { out, changed }
}

const arg = process.argv[2]
if (arg === '--test') {
  const { out, changed } = build()
  console.log('演练：将把 /assets/exdb/<id>.jpg 替换为 jsDelivr CDN URL（前 5 条）：')
  out.slice(0, 5).forEach(e => console.log(`  ${e.name} -> ${e.gif}`))
  console.log(`总计 ${out.length} 条，将被替换 ${changed.length} 条`)
  console.log('（演练结束，未修改文件）')
  process.exit(0)
}

// 真实执行
const { out, changed } = build()
fs.copyFileSync(DATA, DATA + '.bak')
const header = `// 自动生成：free-exercise-db（公有领域 / Unlicense）\n// gif 已替换为 jsDelivr CDN 公开 URL（${changed.length} 张）。\nmodule.exports = `
fs.writeFileSync(DATA, header + JSON.stringify(out, null, 2) + '\n')
console.log(`已重写 utils/exercises-data.js（原文件备份为 .bak）`)
console.log(`替换 ${changed.length} 条为 jsDelivr URL。`)
