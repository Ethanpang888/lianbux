// utils/kb.js —— 知识库内容底座（计划模板 / 动作库 / 学习卡 / 食物表）
const EX = require('./exercises-data.js')

// 部位 / 器械 / 难度 选项（动作库筛选）
const PARTS = [
  { code: 'chest', name: '胸部' }, { code: 'back', name: '背部' },
  { code: 'shoulder', name: '肩部' }, { code: 'arm', name: '手臂' },
  { code: 'abs', name: '腹部' }, { code: 'leg', name: '腿部' },
  { code: 'hip', name: '臀腿' }
]
// 注意：本文件是「动作库页专用」的旧版 kb（只用到 PARTS/EQUIP/LEVELS/getExercises 4 个 API），
// 不参与计划生成链路，因此不与 utils/kb.js 全量同步。改动计划引擎请改 utils/kb.js。
const EQUIP = ['无器械', '哑铃', '杠铃', '绳索', '弹力带', '壶铃', '器械', '瑞士球']
const LEVELS = ['新手', '进阶', '熟练']

function getExercises(filter) {
  return EX.filter(e =>
    (!filter.part || e.part === filter.part) &&
    (!filter.equipment || e.equipment === filter.equipment) &&
    (!filter.level || e.level === filter.level)
  )
}

// 按部位分组，供计划生成取用
const POOL = {}
PARTS.forEach(p => { POOL[p.code] = EX.filter(e => e.part === p.code) })

// —— 动作精选：按「复合优先 + 模式平衡 + 难度/器械适配」挑，而非取文件前N ——
const COMPOUND = ['深蹲','硬拉','卧推','推举','划船','引体','下拉','腿举','箭步','臀桥','臀推','俯卧撑','臂屈伸','挺举','高翻','分腿蹲']
const ISOLATION = ['飞鸟','夹胸','弯举','侧平举','前平举','后束','卷腹','提踵','下压','面拉','耸肩','手腕','伸展','拉伸','踢腿','后踢']
function patternOf(name) {
  const n = name || ''
  if (/深蹲|箭步|腿举|保加利亚|分腿蹲|跳蹲/.test(n)) return 'squat'
  if (/硬拉|臀桥|臀推|早安|罗马尼亚/.test(n)) return 'hinge'
  if (/卧推|长凳推举|俯卧撑|推胸|胸部推举/.test(n)) return 'push_h'
  if (/肩部推举|肩上推|阿诺德|借力推|肩推/.test(n)) return 'push_v'
  if (/引体|背阔下拉|下拉/.test(n)) return 'pull_v'
  if (/划船/.test(n)) return 'pull_h'
  if (/弯举/.test(n)) return 'curl'
  if (/臂屈伸|下压/.test(n)) return 'tri'
  if (/侧平举|前平举|面拉|后束|飞鸟|夹胸/.test(n)) return 'delts'
  if (/卷腹|仰卧起坐|平板|俄罗斯|抬腿|举腿|登山|核心/.test(n)) return 'core'
  if (/提踵/.test(n)) return 'calf'
  if (/耸肩/.test(n)) return 'trap'
  return 'other'
}
const FOCUS_PATTERNS = {
  push: ['push_h','push_v','delts','tri'],
  pull: ['pull_v','pull_h','curl','trap'],
  leg:  ['squat','hinge','calf'],
  chest:['push_h','delts','tri'],
  back: ['pull_v','pull_h','trap'],
  shoulder: ['push_v','delts'],
  arm:  ['curl','tri'],
  core: ['core'],
  full: null
}
function rankExercises(part, profile, home, allow) {
  let arr = POOL[part] || []
  if (home) arr = arr.filter(e => e.equipment === '无器械')
  const exp = profile.exp || '新手'
  return arr.map(e => {
    const n = e.name || ''
    let score = 0
    const pattern = patternOf(n)
    if (COMPOUND.some(k => n.indexOf(k) >= 0)) score += 10
    if (ISOLATION.some(k => n.indexOf(k) >= 0)) score -= 4
    if (n.indexOf('/') >= 0) score -= 5
    if (allow && allow.indexOf(pattern) < 0) score -= 18
    if (exp === '新手') {
      if (['无器械','哑铃','器械','绳索'].indexOf(e.equipment) >= 0) score += 3
      if (e.equipment === '杠铃' || e.equipment === '壶铃') score -= 5
      if (e.level === '新手') score += 2
    } else if (exp === '进阶') {
      if (e.equipment === '杠铃' || e.equipment === '壶铃') score += 2
    } else {
      if (e.equipment === '杠铃') score += 3
      if (e.level === '熟练') score += 2
    }
    return { e, score, pattern }
  }).sort((a, b) => b.score - a.score)
}
function pickBalanced(ranked, n) {
  const picked = []
  const pat = {}
  const work = ranked.slice()
  while (picked.length < n && work.length) {
    let bestIdx = 0, bestKey = -Infinity
    for (let i = 0; i < work.length; i++) {
      const w = work[i].score - (pat[work[i].pattern] || 0) * 3
      if (w > bestKey) { bestKey = w; bestIdx = i }
    }
    const chosen = work.splice(bestIdx, 1)[0]
    picked.push(chosen.e)
    pat[chosen.pattern] = (pat[chosen.pattern] || 0) + 1
  }
  return picked
}

// focus → 取哪些部位、各取几个动作
const FOCUS_SCHEME = {
  full: [{part:'leg',n:1},{part:'chest',n:1},{part:'back',n:1},{part:'shoulder',n:1},{part:'arm',n:1},{part:'abs',n:1}],
  push: [{part:'chest',n:2},{part:'shoulder',n:2},{part:'arm',n:1}],
  pull: [{part:'back',n:3},{part:'arm',n:2}],
  leg: [{part:'leg',n:3},{part:'hip',n:2}],
  chest: [{part:'chest',n:6}],
  back: [{part:'back',n:6}],
  shoulder: [{part:'shoulder',n:5}],
  arm: [{part:'arm',n:5}],
  core: [{part:'abs',n:4}]
}
const FOCUS_NAME = {
  full: '全身', push: '推', pull: '拉', leg: '腿', chest: '胸',
  back: '背', shoulder: '肩', arm: '手臂', core: '核心'
}

function setsFor(profile) {
  const { goal, exp } = profile
  if (goal === '增肌') return exp === '新手' ? '3×10-12' : '4×8-12'
  if (goal === '减脂') return exp === '熟练' ? '4×15' : '3×15'
  return '3×12' // 塑形
}

// 从 gif 地址提取 free-exercise-db 的 oid（动作稳定标识）
function extractOid(gif) {
  const url = (Array.isArray(gif) ? gif[0] : gif) || ''
  const m = String(url).match(/\/exercises\/([^/]+)\//) ||
            String(url).match(/\/ex\/([^/]+)\//) ||
            String(url).match(/\/assets\/exdb\/([^/]+)\.jpg$/) ||
            String(url).match(/\/assets\/gif\/([^/]+)\.gif$/i)
  return m ? m[1] : ''
}

// 生成某 focus 的训练动作（只存 oid，渲染时实时查 kb.EX，改名/换图不空白）
function buildExercises(focus, profile, home) {
  const scheme = FOCUS_SCHEME[focus] || [{part:'chest', n:1}]
  const sets = setsFor(profile)
  const out = []
  scheme.forEach(({part, n}) => {
    const allow = FOCUS_PATTERNS[focus] || null
    const ranked = rankExercises(part, profile, home, allow)
    if (!ranked.length) return
    pickBalanced(ranked, n).forEach(e => {
      out.push({ oid: extractOid(e.gif), name: e.name, sets, equipment: e.equipment, part: e.partName })
    })
  })
  return out
}

// ===== 分化方案 × 频率模式（无限循环，不预生成死数组）=====
const SPLITS = {
  full:  { key:'full',  name:'全身循环', foci:['full'],
    basis:'新手神经适应期，全身循环每周多练，降低受伤风险、契合30-50岁忙人（参考黑教练入门课）。' },
  ppl:   { key:'ppl',   name:'推拉腿(三分化)', foci:['push','pull','leg'],
    basis:'按推/拉/腿拆分，对有一定训练基础者效率更高（参考范特西《三分化训练法则》）。' },
  cpbsl: { key:'cpbsl', name:'胸背肩腿(四分化)', foci:['chest','back','shoulder','leg'],
    basis:'胸→背→肩→腿四分化，单部位容量更高、恢复更好（参考李诚明分化思路）。' },
  five:  { key:'five',  name:'五分化', foci:['chest','back','shoulder','arm','leg'],
    basis:'胸→背→肩→手臂→腿五分化，单部位更高容量，适合训练熟练者。' }
}

// 连续循环：训练 slots 依次取 foci，再补 rest
function expandCycle(foci, train, rest) {
  const micro = []
  for (let i = 0; i < train; i++) micro.push(foci[i % foci.length])
  for (let i = 0; i < rest; i++) micro.push('rest')
  return micro
}
// 每周固定：7天数组（训练 slots 均匀分布）
function buildWeek(foci, trainDays) {
  const micro = new Array(7).fill('rest')
  const gap = 7 / trainDays
  let fi = 0
  for (let i = 0; i < 7; i++) {
    if (i % gap < 1 && fi < trainDays) { micro[i] = foci[fi % foci.length]; fi++ }
  }
  for (let i = 0; i < 7 && fi < trainDays; i++) {
    if (micro[i] === 'rest') { micro[i] = foci[fi % foci.length]; fi++ }
  }
  return micro
}
const FREQ = {
  w3: { name:'每周3练', kind:'week', train:3 },
  w4: { name:'每周4练', kind:'week', train:4 },
  w5: { name:'每周5练', kind:'week', train:5 },
  w6: { name:'每周6练', kind:'week', train:6 },
  c3: { name:'练3休1', kind:'cycle', train:3, rest:1 },
  c4: { name:'练4休1', kind:'cycle', train:4, rest:1 },
  c5: { name:'练5休2', kind:'cycle', train:5, rest:2 }
}
const FREQ_DEFAULT = FREQ.w3
function microFor(splitKey, freqKey) {
  const sp = SPLITS[splitKey] || SPLITS.full
  const fr = FREQ[freqKey] || FREQ_DEFAULT
  if (fr.kind === 'cycle') return expandCycle(sp.foci, fr.train, fr.rest)
  return buildWeek(sp.foci, fr.train)
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultSplit(exp) {
  return exp === '新手' ? 'full' : exp === '进阶' ? 'ppl' : 'cpbsl'
}
function defaultFreq(splitKey, profile) {
  const dpw = Math.min(6, Math.max(3, profile.days || 3))
  if (dpw >= 6) return 'w6'
  if (dpw >= 5) return 'w5'
  if (dpw >= 4) return 'w4'
  return 'w3'
}

// 生成计划（无限循环模型：只存 micro + 起始日，渲染时按需算当天）
function generatePlan(profile, opts) {
  opts = opts || {}
  const splitKey = opts.split || defaultSplit(profile.exp)
  const freqKey = opts.freq || defaultFreq(splitKey, profile)
  const home = !!opts.home
  const sp = SPLITS[splitKey]; const fr = FREQ[freqKey]
  const micro = microFor(splitKey, freqKey)
  const trainCount = micro.filter(x => x !== 'rest').length
  const basis = `根据你的测评（${profile.gender}，${profile.age}岁，${profile.weight}kg，目标${profile.goal}，经验${profile.exp}），采用「${sp.name} · ${fr.name}」。${sp.basis}` + (home ? ' 本计划仅含无器械动作，居家/无健身房场景一张瑜伽垫即可完成。' : '')
  return {
    split: splitKey, freq: freqKey,
    template: splitKey, templateName: sp.name + ' · ' + fr.name,
    micro, microName: fr.name,
    slotExercises: {},            // 用户对某训练日类型(循环槽位)增删的自定义动作，循环生效
    cycleStart: todayStr(), home, goal: profile.goal,
    daysPerWeek: trainCount, basis
  }
}

// 计算某一天（0基 dayIndex）的内容；无限循环：micro[dayIndex % micro.length]
function buildDay(plan, dayIndex, profile, home) {
  const micro = plan.micro
  if (!micro || !micro.length) return { type: 'rest', focus: '休息日', note: '', slot: 0 }
  const slot = ((dayIndex % micro.length) + micro.length) % micro.length
  const f = micro[slot]
  if (f === 'rest' || !f) {
    return { type: 'rest', focus: '休息日', note: '散步/拉伸/筋膜放松，恢复也是训练的一部分。', slot }
  }
  let exercises = buildExercises(f, profile, home)
  const extra = (plan.slotExercises && plan.slotExercises[String(slot)]) || []
  exercises = exercises.concat(extra.map(e => ({
    oid: e.oid || '', name: e.name, sets: e.sets || '3×12',
    equipment: e.equipment || '', custom: true
  })))
  return { type: 'train', focus: FOCUS_NAME[f] || f, slot, exercises }
}

// 统一取某天内容：兼容旧 plan.days 与新模式
function dayContent(plan, dayIndex, profile, home) {
  if (plan.micro) return buildDay(plan, dayIndex, profile, home)
  if (plan.days && plan.days[dayIndex]) return plan.days[dayIndex]
  return { type: 'rest', focus: '休息日', note: '' }
}

// 一次性迁移：旧 plan.days（28天固定）格式 → 新 micro 无限循环格式。
// 保留 cycleStart 让「今天」位置连续；旧逐日自定义动作极少，迁移时丢弃并重建。
function migratePlan(profile, plan) {
  if (!plan) return null
  if (plan.micro && plan.micro.length) return plan // 已是新格式
  if (!profile) return plan // 无 profile 无法重建，保留原样
  const np = generatePlan(profile, { home: !!plan.home })
  np.cycleStart = plan.cycleStart || todayStr()
  np.slotExercises = {}
  return np
}

// 28 天「每天学一点」（取自中外文献/赛普常识/康复方案，真实可学）
const LEARN = [
  { day: 1, tag: '减脂', title: '减脂的本质是热量缺口', summary: '不是戒主食，而是吃进去<消耗。', full: '减脂的铁律只有一条：持续的热量缺口。App 根据你的体重、身高、年龄和每周训练量算出每日总消耗（TDEE），再按目标给出热量目标。建议缺口设在 300-500 大卡/天，这样既掉脂肪又保肌肉；节食过猛会掉代谢、反弹更快，且对 30-50 岁人群并不安全。', action: '' },
  { day: 2, tag: '营养', title: '蛋白质是减脂增肌的底线', summary: '每公斤体重 1.6-2.2 克。', full: '蛋白质能保护肌肉、延长饱腹感，并且消化吸收本身就要消耗热量。目标：每公斤体重 1.6-2.2 克，分摊到 3-4 餐。优质来源：鸡蛋、鸡胸、鱼、虾、瘦牛肉、豆腐、乳清蛋白。App 已按你的体重算出每日蛋白克数，尽量吃够，这是计划有效的地基。', action: '' },
  { day: 3, tag: '训练', title: '渐进超负荷', summary: '训练要越来越难，肌肉才会长。', full: '肌肉适应现有负荷后就不会再进步。渐进超负荷有三种简单做法：① 同一动作下次加重 2.5-5%；② 次数从 10 次提到 12 次再加重；③ 组数从 3 组加到 4 组。App 让你每次训练记录重量和次数，这些数据就是下周突破的基准。', action: '深蹲跳' },
  { day: 4, tag: '误区', title: '局部减脂不存在', summary: '没有「练腹就瘦肚子」。', full: '脂肪是全身性代谢的，练腹只能让腹肌变厚，并不能定向燃烧腹部脂肪。想瘦腰，核心是全身热量缺口 + 力量训练保肌肉 + 日常多走动。腹肌是「露出来」的，不是单纯「练出来」的。把卷腹当成核心训练，而不是减脂训练。', action: '' },
  { day: 5, tag: '恢复', title: '睡眠决定恢复', summary: '睡不够，训练和饮食都打折。', full: '生长激素和肌肉修复主要在深睡期完成。连续缺觉会升高皮质醇、降低睾酮、增加对高糖食物的渴望。目标 7-9 小时，训练日尽量 11 点前入睡。如果只能睡 6 小时，当天训练重量降 10-15%，避免过度透支。', action: '' },
  { day: 6, tag: '营养', title: '碳水不是敌人', summary: '它是训练燃料，也是恢复资源。', full: '低碳短期掉秤快，但大部分是水分和肌糖原，力量会明显下降。建议：训练前 1-2 小时吃 30-50 克慢碳（燕麦、红薯、全麦）；训练后 30-60 分钟补充蛋白+快碳（香蕉、米饭）。粗粮占一半，细粮不拒绝，总量才是关键。', action: '' },
  { day: 7, tag: '康复', title: '拉伸与放松', summary: '训练后静态拉伸，练前动态热身。', full: '练前做 5 分钟动态热身（摆腿、肩环绕、猫牛式），让关节润滑、肌肉升温；练后对当天训练部位做 15-30 秒静态拉伸，每个动作 2 组。休息日可用泡沫轴滚压大腿前侧、臀部和上背，降低僵硬和受伤风险。', action: '' },
  { day: 8, tag: '减脂', title: 'NEAT 是被低估的消耗', summary: '日常多动，比一次运动更狠。', full: 'NEAT（非运动性活动产热）包括走路、站、做家务、爬楼梯。同样体重的人，NEAT 每天可差 300-500 大卡，一个月就是 1-2 公斤脂肪。量化目标：每天 8000 步以上，能站不坐，接电话时走动。', action: '' },
  { day: 9, tag: '训练', title: '动作质量>重量', summary: '先标准，再加重；宁轻勿假。', full: '代偿和甩重量会让关节承受额外压力，同时练不到目标肌群。标准比重量重要：全程控制、关节稳定、呼吸配合。不确定动作时，点开动作库看 GIF 对照，或先用空杆/徒手做两组找感觉。', action: '宽距俯卧撑' },
  { day: 10, tag: '误区', title: '体重≠胖瘦', summary: '围度、力量、照片比秤更诚实。', full: '力量训练初期体重可能不降甚至微涨，因为肌肉储水和糖原增加，但腰围在变小、衣服变松。建议每周同一时间量腰围、臀围、体重，并拍正面/侧面照。趋势比单天数字重要，别被秤绑架情绪。', action: '' },
  { day: 11, tag: '营养', title: '膳食纤维要够', summary: '蔬菜每餐要有，饱腹又稳血糖。', full: '膳食纤维增加饱腹感、平稳血糖、维护肠道菌群。成年人建议每天 25-35 克。简单做法：每餐半盘蔬菜（西兰花、菠菜、菌菇、绿叶菜），主食里加杂粮或薯类，零食用水果替代饼干。', action: '' },
  { day: 12, tag: '训练', title: '复合动作优先', summary: '深蹲、硬拉、推举类动作效率最高。', full: '复合动作一次调动多个大肌群，消耗热量高、对激素水平刺激强，增肌减脂都高效。每次训练先练复合动作（如深蹲、俯卧撑、划船、推举），再练孤立动作收尾。训练时间有限时，只做复合动作也比只练二头弯举有价值。', action: '屈腿硬拉正面' },
  { day: 13, tag: '恢复', title: '训练频率与分化', summary: '每块肌肉每周练 2 次左右较优。', full: '新手适合全身循环，每周 3 练就能刺激全身；进阶可用推/拉/腿三分化，每部位每周 1.5-2 次；熟练者用五分化，单部位容量更高但频率降低。关键是同一部位酸痛未消时不要硬练，恢复跟不上，分化再高级也没用。', action: '' },
  { day: 14, tag: '平台期', title: '平台期怎么破', summary: '身体会适应，调整即可。', full: '体重或力量卡住超过 2 周，先查三件事：① 饮食是否松懈；② 睡眠/压力是否变差；③ 训练是否一直原地踏步。破法：把热量再降 100-200 大卡、每天多走 2000 步、给动作换顺序、或安排一周「减载周」降量 40% 让身体恢复。', action: '' },
  { day: 15, tag: '营养', title: '喝水也影响减脂', summary: '每天 30-35 毫升/公斤体重。', full: '缺水会让大脑把口渴误判为饥饿，还会降低代谢和运动表现。建议按体重喝水：每公斤 30-35 毫升/天，训练出汗多时额外补充。判断标准：尿液呈淡黄色。别等口渴才喝，那时已经轻微脱水。', action: '' },
  { day: 16, tag: '训练', title: '离心控制更增肌', summary: '放下比举起慢，增肌效果更好。', full: '肌肉在拉长阶段（离心）承受的机械张力最大， hypertrophy 刺激主要来自这里。建议节奏：举起 1 秒、顶峰停顿 0-1 秒、放下 2-3 秒。例如深蹲蹲下用 3 秒，站起用 1 秒。控制离心还能减少关节冲击。', action: '绳索下拉男' },
  { day: 17, tag: '误区', title: '女生不会练成金刚', summary: '女性睾酮只有男性约 1/10。', full: '正常力量训练不会让女生变「壮」，反而会让线条更紧致、臀更翘、腰更细。女性增肌难度大得多，需要多年系统训练和较高睾酮水平。担心练壮而不敢上重量的，通常反而是减脂塑形最慢的。', action: '' },
  { day: 18, tag: '康复', title: '腰背保护原则', summary: '髋发力，核心收紧，脊柱中立。', full: '深蹲、硬拉、划船时弯腰代偿是腰伤的主因。正确做法：想象胸挺向天花板、腹式呼吸绷紧核心、用腿和臀主导发力，脊柱保持中立。如果动作中出现刺痛或麻木，立刻停止，不要忍痛完成。', action: '' },
  { day: 19, tag: '减脂', title: '欺骗餐不是放纵餐', summary: '一顿别吃回一周缺口。', full: '长期低热量饮食会让瘦素下降、代谢减慢，一顿合理的欺骗餐可以缓解心理和生理压力。原则：一周一次、控制在 +500 大卡以内、当天蛋白质仍要吃够、第二天正常回归计划即可，不用「赎罪式」节食。', action: '' },
  { day: 20, tag: '营养', title: '训练前后怎么吃', summary: '前碳水供能，后蛋白+碳水恢复。', full: '训练前 1-2 小时吃少量易消化碳水（香蕉、全麦面包、燕麦），避免空腹低血糖；训练后 30-60 分钟内补充 20-40 克蛋白质 + 30-60 克碳水（鸡胸+米饭、蛋白粉+香蕉），帮助肌肉修复和糖原恢复。普通人无需复杂补剂。', action: '' },
  { day: 21, tag: '训练', title: '呼吸模式', summary: '用力呼气，还原吸气，别乱憋气。', full: '一般原则：发力阶段（推起、站起、拉起）呼气，还原阶段吸气。大重量时短暂的瓦氏呼吸（憋气）可以提供腹内压保护脊柱，但高血压、青光眼、中老年人群应避免。日常训练保持自然呼吸节奏即可。', action: '哑铃推举' },
  { day: 22, tag: '恢复', title: '主动恢复', summary: '休息日也别完全躺平。', full: '完全不动反而会让肌肉更僵硬、恢复更慢。休息日建议：散步 30 分钟、轻瑜伽、拉伸、泡沫轴放松，或游泳。心率保持在最大心率的 50-60%，微微出汗但不累即可。', action: '' },
  { day: 23, tag: '误区', title: '出汗≠燃脂', summary: '汗是散热，不是脂肪在燃烧。', full: '裹保鲜膜、穿暴汗服只是逼身体多出汗，掉的是水分，喝几口水就回来。燃脂看的是总热量缺口、运动强度和持续时间，不是出汗多少。出汗多只能说明热或汗腺发达。', action: '' },
  { day: 24, tag: '营养', title: '读懂食品标签', summary: '先看每 100 克，再看配料表。', full: '对比同类食品时，优先看每 100 克的蛋白质、脂肪、碳水化合物和钠。配料表按含量排序，前三位如果是白砂糖、植物油、氢化植物油，通常不是好选择。「无糖」不等于低热量，也可能高脂肪。', action: '' },
  { day: 25, tag: '训练', title: '记录就是进步', summary: '不记录，等于没发生。', full: '力量训练的效果藏在数据里：这次比上次多举了多少、体重趋势如何、腰围变化多少。App 的训练记录和体重曲线就是帮你判断计划是否有效、何时需要调整的依据。坚持记满 28 天，你会对自己的身体有全新认知。', action: '平板推举杠铃' },
  { day: 26, tag: '康复', title: '关节不适的信号', summary: '刺痛停，酸痛可练。', full: '延后性肌肉酸痛（DOMS）是训练后 24-72 小时的酸胀、按压痛，这是正常的，可以继续训练其他部位。但如果是关节深处的刺痛、锐痛、麻木、活动受限，必须立刻停止并就医。分不清时，宁可休息一天。', action: '' },
  { day: 27, tag: '减脂', title: '围度比体重重要', summary: '量腰围、拍照片，趋势比数字诚实。', full: '体重受水分、盐分、肠道内容物影响，单日波动 1-2 公斤很正常。更可靠的指标：每周同一时间量腰围（肚脐水平）、臀围、大腿围，并拍同光线、同角度照片。腰围下降，说明内脏脂肪和皮下脂肪都在减少。', action: '' },
  { day: 28, tag: '总结', title: '28天只是开始', summary: '习惯 > 速成。', full: '28 天的价值不是让你彻底变身，而是帮你建立「训练+记录+饮食」的闭环习惯。接下来可以：换成进阶模板、在复合动作上加重、把中医体质辨识接入计划、或加入周期性有氧。坚持下去，身体会在 3 个月、6 个月、1 年后给你持续回馈。', action: '' }
]

// 常见食物（饮食记录参考，每100g 营养；fat=脂肪g, carbs=碳水g, fiber=膳食纤维g）
const FOODS = [
  { name: '鸡胸肉', kcal: 133, protein: 24, fat: 5, carbs: 0, fiber: 0 },
  { name: '鸡蛋', kcal: 144, protein: 13, fat: 9, carbs: 1.1, fiber: 0 },
  { name: '牛肉(瘦)', kcal: 125, protein: 26, fat: 4, carbs: 0, fiber: 0 },
  { name: '三文鱼', kcal: 208, protein: 20, fat: 13, carbs: 0, fiber: 0 },
  { name: '米饭(熟)', kcal: 116, protein: 2.6, fat: 0.3, carbs: 25.9, fiber: 0.3 },
  { name: '燕麦', kcal: 389, protein: 17, fat: 7, carbs: 66, fiber: 10 },
  { name: '红薯', kcal: 99, protein: 1.1, fat: 0.2, carbs: 23, fiber: 3 },
  { name: '西兰花', kcal: 34, protein: 2.8, fat: 0.4, carbs: 7, fiber: 2.6 },
  { name: '豆腐', kcal: 76, protein: 8, fat: 4.5, carbs: 1.9, fiber: 0.4 },
  { name: '牛奶', kcal: 54, protein: 3.4, fat: 3.2, carbs: 5, fiber: 0 },
  { name: '香蕉', kcal: 93, protein: 1.4, fat: 0.2, carbs: 22, fiber: 2.6 },
  { name: '苹果', kcal: 52, protein: 0.3, fat: 0.2, carbs: 14, fiber: 2.4 },
  { name: '全麦面包', kcal: 246, protein: 9, fat: 3.2, carbs: 49, fiber: 6 },
  { name: '蛋白粉(乳清)', kcal: 400, protein: 80, fat: 6, carbs: 8, fiber: 0 },
  { name: '羊肉(瘦)', kcal: 134, protein: 19, fat: 6.3, carbs: 0, fiber: 0 },
  { name: '鸭肉(瘦)', kcal: 135, protein: 18, fat: 6.4, carbs: 0, fiber: 0 },
  { name: '猪肉(瘦)', kcal: 143, protein: 20, fat: 6.2, carbs: 1.5, fiber: 0 },
  { name: '虾', kcal: 93, protein: 18.6, fat: 0.8, carbs: 1, fiber: 0 },
  { name: '鳕鱼', kcal: 88, protein: 20, fat: 0.7, carbs: 0, fiber: 0 },
  { name: '面条(熟)', kcal: 110, protein: 4, fat: 0.4, carbs: 25, fiber: 1 },
  { name: '馒头', kcal: 223, protein: 7, fat: 1.1, carbs: 47, fiber: 1.3 },
  { name: '糙米饭(熟)', kcal: 112, protein: 2.6, fat: 0.9, carbs: 23, fiber: 1.8 },
  { name: '玉米(鲜)', kcal: 106, protein: 4, fat: 1.2, carbs: 22, fiber: 2.4 },
  { name: '南瓜', kcal: 26, protein: 1, fat: 0.1, carbs: 6, fiber: 0.5 },
  { name: '土豆(蒸)', kcal: 77, protein: 2, fat: 0.1, carbs: 17, fiber: 2 },
  { name: '胡萝卜', kcal: 41, protein: 0.9, fat: 0.2, carbs: 10, fiber: 2.8 },
  { name: '菠菜', kcal: 23, protein: 2.9, fat: 0.4, carbs: 3.6, fiber: 2.2 },
  { name: '番茄', kcal: 18, protein: 0.9, fat: 0.2, carbs: 3.9, fiber: 1.2 },
  { name: '黄瓜', kcal: 16, protein: 0.8, fat: 0.2, carbs: 2.9, fiber: 0.5 },
  { name: '酸奶(原味)', kcal: 72, protein: 3.3, fat: 3.5, carbs: 4.7, fiber: 0 },
  { name: '奶酪', kcal: 328, protein: 25, fat: 24, carbs: 3.5, fiber: 0 },
  { name: '花生', kcal: 567, protein: 25, fat: 49, carbs: 16, fiber: 8 },
  { name: '牛油果', kcal: 160, protein: 2, fat: 15, carbs: 9, fiber: 7 },
  { name: '黑豆(熟)', kcal: 132, protein: 8.9, fat: 0.5, carbs: 24, fiber: 8.5 }
]

// 食物名称智能匹配（用于「牛肉 100g」类自由输入自动带营养 / 搜索兜底）
const FOOD_ALIAS = {
  '牛肉': '牛肉(瘦)', '牛里脊': '牛肉(瘦)', '牛排': '牛肉(瘦)',
  '鸡胸': '鸡胸肉', '鸡腿': '鸡腿肉', '猪肉': '猪肉(瘦)', '瘦猪肉': '猪肉(瘦)',
  '羊肉': '羊肉(瘦)', '鸭肉': '鸭肉(瘦)', '酸奶': '酸奶(原味)', '乳清蛋白': '蛋白粉(乳清)',
  '白米饭': '米饭(熟)', '米饭': '米饭(熟)', '糙米': '糙米饭(熟)', '燕麦片': '燕麦'
}
function matchFood(name) {
  if (!name) return null
  const n = String(name).trim()
  const exact = FOODS.find(f => f.name === n)
  if (exact) return exact
  if (FOOD_ALIAS[n]) {
    const hit = FOODS.find(f => f.name === FOOD_ALIAS[n])
    if (hit) return hit
  }
  for (const f of FOODS) {
    if (f.name.indexOf(n) >= 0 || n.indexOf(f.name) >= 0) return f
  }
  return null
}

// 动作检索别名：库里“卧推”写作“凳推举/长凳推举”，需别名才能被搜到
const EX_ALIAS = {
  '卧推': ['卧推', '凳推举', '长凳推举', '胸部推举'],
  '推举': ['推举'],
  '飞鸟': ['飞鸟'],
  '夹胸': ['夹胸', '胸部挤压'],
  '划船': ['划船'],
  '下拉': ['下拉', '背阔'],
  '引体': ['引体', '引体向上'],
  '硬拉': ['硬拉'],
  '深蹲': ['深蹲'],
  '腿举': ['腿举'],
  '箭步': ['箭步', '弓步'],
  '弯举': ['弯举', '肱二头肌'],
  '臂屈伸': ['臂屈伸', '肱三头肌'],
  '下压': ['下压'],
  '耸肩': ['耸肩'],
  '卷腹': ['卷腹', '俄罗斯转体'],
  '侧平举': ['侧平举', '前平举'],
  '提踵': ['提踵', '小腿'],
  '臀': ['臀', '臀桥', '臀推'],
  '俯卧撑': ['俯卧撑'],
  '后束': ['后束']
}
function searchEx(q) {
  q = (q || '').trim()
  if (!q) return []
  const active = Object.keys(EX_ALIAS).filter(k => q.indexOf(k) >= 0)
  const pool = active.length
    ? EX.filter(e => active.every(k => EX_ALIAS[k].some(frag => e.name.indexOf(frag) >= 0)))
    : EX.filter(e => e.name.indexOf(q) >= 0)
  return pool.slice(0, 15)
}
function searchFood(q) {
  q = (q || '').trim()
  if (!q) return []
  return FOODS.filter(f =>
    f.name.indexOf(q) >= 0 ||
    Object.keys(FOOD_ALIAS).some(k => q.indexOf(k) >= 0 && f.name === FOOD_ALIAS[k])
  ).slice(0, 12)
}

module.exports = {
  EX, PARTS, EQUIP, LEVELS, getExercises, SPLITS, FREQ, FOCUS_NAME, buildExercises,
  generatePlan, buildDay, dayContent, migratePlan, LEARN, FOODS, matchFood, searchEx, searchFood
}
