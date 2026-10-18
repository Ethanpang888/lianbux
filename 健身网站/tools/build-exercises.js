#!/usr/bin/env node
/* tools/build-exercises.js —— 动作库全量扩容管道（一次性 + 可重跑）
 *
 * 数据源：free-exercise-db（https://github.com/yuhonas/free-exercise-db）
 *         协议 Unlicense（公有领域）—— 商用零限制，可改可分发。
 * 图片：直接走 jsDelivr CDN（cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/...），
 *       不下载不转存 —— URL 自带 /exercises/{oid}/，kb.extractOid 天然兼容。
 *
 * 规则：
 *   1. 现有 250 个动作：原样保留在前（name/part/gif/oid 全部不动 → 老计划零影响）
 *   2. 新增动作：inPlan:false —— 不进计划生成池（防拉伸/奥举动作污染正式计划），
 *      只进「动作库浏览」（exlib 页）
 *   3. 中文名：词表组合翻译（器械前缀 + 姿势/变体 + 核心动作词）；翻不出的保留英文原名
 *   4. points 留空 —— 要领翻译分批做（本轮不硬翻英文句子，宁缺毋滥）
 *
 * 运行：node tools/build-exercises.js   （需要网络拉 free-exercise-db 的 exercises.json）
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const DATA_OUT = path.join(__dirname, '..', '..', '健身小程序', 'utils', 'exercises-data.js')
const FEDB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/'

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' ' + url))
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

// ───── 译名词表（覆盖 free-exercise-db 命名规律；组合顺序：器械 + 姿势 + 核心）─────
const EQUIP = {
  barbell: '杠铃', dumbbell: '哑铃', cable: '绳索', machine: '器械', kettlebell: '壶铃',
  band: '弹力带', 'body weight': '自重', none: '自重', 'e-z curl bar': 'EZ杆',
  'foam roll': '泡沫轴', 'medicine ball': '药球', 'smith machine': '史密斯机', other: '',
  kettlebells: '壶铃', 'body only': '自重', bands: '弹力带', 'exercise balls': '瑞士球', 'exercise ball': '瑞士球',
  'sled machine': '雪橇机', 'lever machine': '器械', cable: '绳索', none: '自重', other: '其他'
}
const POS = {
  incline: '上斜', decline: '下斜', 'flat bench': '平板', seated: '坐姿', standing: '站姿',
  lying: '仰卧', prone: '俯卧', supine: '仰卧', 'side-lying': '侧卧', kneeling: '跪姿',
  'single-leg': '单腿', 'single-arm': '单臂', alternating: '交替', assisted: '辅助',
  weighted: '负重', close: '窄距', wide: '宽距', reverse: '反向', 'overhead': '过头',
  bent: '俯身', suspension: '悬挂', lever: '器械', sled: '雪橇', 'v-bar': 'V把'
}
const CORE = {
  'bench press': '卧推', squat: '深蹲', 'deadlift': '硬拉', curl: '弯举', press: '推举',
  row: '划船', fly: '飞鸟', 'chest dip': '双杠臂屈伸', dip: '臂屈伸', extension: '屈伸',
  raise: '平举', shrug: '耸肩', pullover: '仰卧上拉', pulldown: '下拉',
  'push-up': '俯卧撑', 'pushup': '俯卧撑', 'pull-up': '引体向上', 'pullup': '引体向上',
  'chin-up': '反手引体', lunge: '弓步', 'step-up': '登阶', plank: '平板支撑',
  crunch: '卷腹', 'sit-up': '仰卧起坐', 'leg raise': '举腿', 'calf raise': '提踵',
  'hip thrust': '臀推', 'good morning': '早安式', clean: '高翻', snatch: '抓举',
  jerk: '挺举', swing: '甩摆', 'getup': '起立', 'get-up': '起立', 'leg curl': '腿弯举',
  'leg extension': '腿屈伸', 'lateral raise': '侧平举', 'front raise': '前平举',
  'kickback': '后踢', 'pull-through': '跨拉', 'pull through': '跨拉', 'face pull': '面拉',
  'calf press': '提踵', 'calf': '小腿', 'upright row': '直立划船',
  'mountain climber': '登山跑', burpee: '波比跳', lunge: '弓步', skip: '跳步',
  'inverted row': '反向划船', 'muscle up': '双力臂', 'hip abduction': '髋外展',
  'hip adduction': '髋内收', 'torso rotation': '转体', twist: '转体', 'hyperextension': '山羊挺身',
  'rear delt row': '后束划船', 'pelvic tilt': '骨盆后倾', 'situp': '仰卧起坐',
  'wall slide': '靠墙滑动', 'stretch': '拉伸', 'chest stretch': '胸部拉伸',
  'shoulder stretch': '肩部拉伸', 'quad stretch': '股四头拉伸', 'hamstring stretch': '腘绳肌拉伸',
  'calf stretch': '小腿拉伸', 'back stretch': '背部拉伸', 'hip stretch': '髋部拉伸',
  'arm stretch': '手臂拉伸', 'neck stretch': '颈部拉伸', 'full body': '全身',
  jump: '跳跃', toss: '抛掷', throw: '投掷', run: '跑', sprint: '冲刺', walk: '走',
  'crocodile': '鳄鱼式', 'cobra': '眼镜蛇式', 'cat': '猫式', 'bridge': '桥式',
  'dead bug': '死虫式', 'bird dog': '鸟狗式', 'clam': '蚌式', 'pipe': '管道',
  'core': '核心', 'warm': '热身', 'v-up': 'V字两头起', 'flutter': '打水',
  'scissor': '剪刀腿', 'hollow': '空心体', 'superman': '超人式', 'leg press': '腿举',
  'hack squat': '哈克深蹲', 'biceps': '二头', 'triceps': '三头', 'bear crawl': '熊爬',
  'incline': '上斜', 'decline': '下斜', 'shoulder press': '肩推', 'chest press': '推胸'
}

// 英文名 → 中文名
function zhName(en) {
  let s = ' ' + en.toLowerCase().replace(/[-_]/g, ' ') + ' '
  let equip = '', pos = ''
  for (const [k, v] of Object.entries(EQUIP)) {
    if (s.indexOf(' ' + k + ' ') >= 0) { equip = v; s = s.replace(' ' + k + ' ', ' '); break }
  }
  for (const [k, v] of Object.entries(POS)) {
    if (s.indexOf(' ' + k + ' ') >= 0 || s.indexOf(' ' + k + '-') >= 0) { pos = v; s = s.replace(new RegExp(' ?' + k + '[ -]?', 'i'), ' '); break }
  }
  let core = ''
  const entries = Object.entries(CORE).sort((a, b) => b[0].length - a[0].length)
  for (const [k, v] of entries) {
    if (s.indexOf(k) >= 0) { core = v; break }
  }
  if (!core) return ''   // 翻不出 → 保留英文原名
  return (equip ? equip : '') + (pos ? pos : '') + core
}

// category / primaryMuscles → part（与现有 250 的 part 体系一致；非力量类给独立 part）
const MUSCLE_PART = {
  chest: 'chest', 'serratus anterior': 'chest', 'upper back': 'back', 'lats': 'back',
  'middle back': 'back', 'lower back': 'back', 'traps': 'back', 'neck': 'neck',
  shoulders: 'shoulder', biceps: 'arm', triceps: 'arm', forearms: 'arm',
  quadriceps: 'leg', hamstrings: 'leg', calves: 'leg', 'glutes': 'hip',
  'adductors': 'hip', 'abductors': 'hip', abdominals: 'abs', 'abductors': 'hip', lats: 'back'
}
const CAT_PART = {
  stretching: ['stretch', '拉伸'], plyometrics: ['plyo', '爆发力'],
  powerlifting: ['power', '力量举'], strongman: ['power', '力量举'],
  'olympic weightlifting': ['power', '奥举'], cardio: ['cardio', '有氧']
}
const LVL = { beginner: '新手', intermediate: '进阶', expert: '熟练' }

async function main() {
  console.log('拉取 free-exercise-db 全量数据…')
  const all = await fetchJson(FEDB_URL)
  console.log('  全量 ' + all.length + ' 个')

  const curAll = require(DATA_OUT)
  // 幂等：只把「精选池」（无 src 标记的）当基准 —— 之前追加过的补齐动作先剔除，重跑不叠加
  const cur = curAll.filter(x => x.src !== 'free-exercise-db (Unlicense)')
  console.log('  精选池 ' + cur.length + ' 个（文件里共 ' + curAll.length + '，剔除上轮补齐 ' + (curAll.length - cur.length) + '）')
  const have = new Set(cur.map(x => {
    const m = /ex\/([^/]+)\//.exec((x.gif && x.gif[0]) || '')
    return m ? m[1] : null
  }).filter(Boolean))

  const added = []
  let noZh = 0, noImg = 0
  for (const x of all) {
    if (have.has(x.name)) continue
    const imgs = (x.images || []).map(p => CDN + encodeURI(p))
    if (!imgs.length) { noImg++; continue }
    const name = zhName(x.name) || x.name
    if (!zhName(x.name)) noZh++
    let part = 'misc', partName = '其他'
    if (x.category === 'strength' || x.category === 'powerlifting') {
      const mu = (x.primaryMuscles || [])[0] || ''
      if (MUSCLE_PART[mu]) { part = MUSCLE_PART[mu] }
      else { part = CAT_PART[x.category] ? CAT_PART[x.category][0] : 'misc' }
    }
    const cp = CAT_PART[x.category]
    if (cp) { part = cp[0]; partName = cp[1] }
    else if (part !== 'misc') {
      const PN = { chest: '胸部', back: '背部', shoulder: '肩部', arm: '手臂', leg: '腿部', abs: '腹肌', hip: '髋臀', neck: '颈部' }
      partName = PN[part] || partName
    }
    added.push({
      name: name,
      en: x.name,
      part: part,
      partName: partName,
      equipment: EQUIP[x.equipment] || x.equipment || '',
      level: LVL[x.level] || '',
      gif: imgs,
      sets: '',
      points: '',
      inPlan: false,
      src: 'free-exercise-db (Unlicense)'
    })
  }
  console.log('  增量 ' + added.length + ' 个（无图剔除 ' + noImg + '，英文保留 ' + noZh + '）')

  const merged = cur.concat(added)
  const byPart = {}
  merged.forEach(x => { byPart[x.partName] = (byPart[x.partName] || 0) + 1 })
  console.log('  合计 ' + merged.length + ' 个；分布：' + JSON.stringify(byPart))

  const banner = '/* exercises-data.js —— 动作库（自动生成 + 手工精选）\n' +
    ' * 前 ' + cur.length + ' 条 = 精选池（inPlan 默认开，参与计划生成）\n' +
    ' * 其余 = free-exercise-db (Unlicense) 全量补齐（inPlan:false，只进动作库浏览，不进计划）\n' +
    ' * 重建：node tools/build-exercises.js\n' +
    ' * ⚠️ 改动须同步三副本：健身小程序 utils、网站 shared、云函数 lib 目录（跑 tools/sync-engine.js --check）\n */\n'
  fs.writeFileSync(DATA_OUT, banner + 'module.exports = ' + JSON.stringify(merged, null, 2) + '\n')
  console.log('✅ 已写入 ' + DATA_OUT)
}

main().catch(e => { console.error('❌ ' + e.message); process.exit(1) })
