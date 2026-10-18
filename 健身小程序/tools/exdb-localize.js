// tools/exdb-localize.js
// 目的：把 exercises-data.js 里引用的 jsDelivr 双帧图，全部下载并压缩到本地
//       assets/ex/<id>/0.jpg、1.jpg，然后把 gif 字段改成本地相对路径（保留原文件结构）。
// 原因：jsDelivr 是境外域名、无 ICP 备案，微信小程序真机 downloadFile 白名单加不进去
//       → 真机永远不显示图。打进包里最稳（图为公有领域 Unlicense，可商用）。
// 用法：node tools/exdb-localize.js
// 依赖：Node 18+（自带 fetch）+ macOS 自带 sips 做压缩。

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'utils', 'exercises-data.js')
const OUT = path.join(ROOT, 'assets', 'ex')
const REPO = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'
const MAXW = 300
const QUALITY = 45

const EX = require(DATA)
function idsOf(ex) {
  const arr = Array.isArray(ex.gif) ? ex.gif : (ex.gif ? [ex.gif] : [])
  const ids = arr.map(u => {
    const m = String(u).match(/exercises\/([^/]+)\/(\d+)\.jpg/)
    return m ? { id: m[1], frame: m[2] } : null
  }).filter(Boolean)
  // 去重
  const seen = new Set(); const uniq = []
  ids.forEach(o => { const k = o.id + o.frame; if (!seen.has(k)) { seen.add(k); uniq.push(o) } })
  return uniq
}

function compress(file) {
  try {
    execFileSync('sips', ['-Z', String(MAXW), '-s', 'format', 'jpeg',
      '-s', 'formatOptions', String(QUALITY), file], { stdio: 'ignore' })
    return true
  } catch (e) { return false }
}

async function fetchTo(url, dest) {
  const res = await fetch(url)
  if (!res.ok) return false
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 500) return false
  fs.writeFileSync(dest, buf)
  return true
}

async function main() {
  const LIMIT = parseInt(process.env.LIMIT || '0', 10) // 0 = 全部
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

  const need = new Map()
  const scope = LIMIT ? EX.slice(0, LIMIT) : EX
  scope.forEach(ex => idsOf(ex).forEach(({ id, frame }) => {
    if (!need.has(id)) need.set(id, new Set())
    need.get(id).add(frame)
  }))
  console.log(`需要 ${need.size} 个动作的本地图${LIMIT ? `（小批量验证，仅前 ${LIMIT} 条动作）` : ''}`)

  let ok = 0, fail = 0, skip = 0
  const bad = []
  for (const [id, frames] of need) {
    const dir = path.join(OUT, id)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    for (const f of frames) {
      const dest = path.join(dir, `${f}.jpg`)
      if (fs.existsSync(dest) && fs.statSync(dest).size > 500) { skip++; continue }
      const got = await fetchTo(`${REPO}/${id}/${f}.jpg`, dest)
      if (got && compress(dest)) { ok++ }
      else { fail++; bad.push(`${id}/${f}`); if (fs.existsSync(dest)) fs.unlinkSync(dest) }
    }
  }
  console.log(`下载压缩：新增 ${ok}，已存在 ${skip}，失败 ${fail}`)
  if (bad.length) console.log('失败项：', bad.slice(0, 20).join(', '))

  // 精准替换每个 "gif": [...] 字段的值，保留原文件其余结构
  let src = fs.readFileSync(DATA, 'utf8')
  fs.writeFileSync(DATA + '.bak-localize', src)
  let replaced = 0, dropped = 0
  src = src.replace(/"gif":\s*\[[\s\S]*?\]/g, (m) => {
    const ex = EX[replaced]
    const ids = idsOf(ex)
    const local = ids
      .filter(({ id, frame }) => fs.existsSync(path.join(OUT, id, `${frame}.jpg`)))
      .map(({ id, frame }) => `/assets/ex/${id}/${frame}.jpg`)
    replaced++
    if (LIMIT && replaced > LIMIT) return m // 小批量验证时不动剩余条目
    if (!local.length) { dropped++; return '"gif": []' }
    return '"gif": ' + JSON.stringify(local)
  })

  fs.writeFileSync(DATA, src)
  console.log(`gif 改本地路径：${replaced} 条；无图 ${dropped} 条`)
  console.log('本地图目录体积：', execFileSync('du', ['-sh', OUT]).toString().trim())
  console.log('源码体积：', execFileSync('du', ['-sh', ROOT + '/utils']).toString().trim())
}

main().catch(e => { console.error(e); process.exit(1) })
