// tools/exdb-backfill.js
// 补齐 exercises-data.js 中 "gif": [] 的条目：按动作名映射 free-exercise-db 的 id，
// 下载并压缩两帧到 subpkgs/exlib/assets/ex/<id>/，再写回 gif 字段。
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'utils', 'exercises-data.js')
const OUT = path.join(ROOT, 'subpkgs', 'exlib', 'assets', 'ex')
const BACKUP = path.join(ROOT, 'utils', 'exercises-data.js.bak-localize')
const REPO = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises'

// 已知映射（俯立臂曲伸 从备份的 CDN url 解析）
const MAP = {
  '绳索下拉男': 'Reverse_Grip_Triceps_Pushdown',
  '锤式弯举': 'Alternate_Hammer_Curl',
  '俯立臂曲伸': 'Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench',
  '臂弯举': 'Barbell_Curl',
  '斜托臂弯举': 'Incline_Dumbbell_Curl',
}
function idFromBackup(name) {
  if (!fs.existsSync(BACKUP)) return null
  const s = fs.readFileSync(BACKUP, 'utf8')
  const i = s.indexOf('"name": "' + name + '"')
  if (i < 0) return null
  const block = s.slice(i, i + 600)
  const m = block.match(/exercises\/([^/"]+)\/\d+\.jpg/)
  return m ? m[1] : null
}

function compress(file) {
  try {
    execFileSync('sips', ['-Z', '300', '-s', 'format', 'jpeg',
      '-s', 'formatOptions', '45', file], { stdio: 'ignore' })
    return true
  } catch (e) { return false }
}
async function fetchTo(url, dest) {
  const res = await fetch(url)
  if (!res.ok) return false
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 500) return false
  fs.writeFileSync(dest, buf); return true
}

async function main() {
  let src = fs.readFileSync(DATA, 'utf8')
  // 找出所有 "name": "...", 紧跟 "gif": [] 的条目
  const re = /("name":\s*"([^"]+)"[\s\S]*?)"gif":\s*\[\]/g
  let m, todo = []
  while ((m = re.exec(src))) todo.push(m[2])
  console.log('空 gif 动作：', todo)

  let done = 0, fail = 0
  for (const name of todo) {
    let id = MAP[name] || idFromBackup(name)
    if (!id) { console.log('跳过(无id映射):', name); fail++; continue }
    const dir = path.join(OUT, id)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    let frames = []
    for (const f of ['0', '1']) {
      const dest = path.join(dir, f + '.jpg')
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 500) {
        const ok = await fetchTo(`${REPO}/${id}/${f}.jpg`, dest)
        if (ok && compress(dest)) {} else { if (fs.existsSync(dest)) fs.unlinkSync(dest); continue }
      }
      frames.push(`/subpkgs/exlib/assets/ex/${id}/${f}.jpg`)
    }
    if (frames.length === 0) { console.log('下载失败:', name); fail++; continue }
    // 写回该 name 对应的 "gif": []
    const idx = src.indexOf(`"name": "${name}"`)
    const gi = src.indexOf('"gif": []', idx)
    if (gi >= 0) {
      src = src.slice(0, gi) + '"gif": ' + JSON.stringify(frames) + src.slice(gi + '"gif": []'.length)
      done++
    }
  }
  fs.writeFileSync(DATA, src)
  console.log(`补齐完成：成功 ${done}，失败 ${fail}`)
  console.log('剩余空 gif：', (src.match(/"gif":\s*\[\]/g) || []).length)
}
main().catch(e => { console.error(e); process.exit(1) })
