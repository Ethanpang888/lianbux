// utils/kb.js —— 知识库内容底座（计划引擎 / 动作库 / 学习卡 / 食物表）
// 计划编排的方法论来源见 utils/method.js（唯一真相源：原文/推演均有标注）
const EX = require('./exercises-data.js')
const METHOD = require('./method.js')

// 计划结构版本号：改动「编排/动作选取/组次」逻辑时必须 +1，
// 否则老用户云端已存的 plan.micro 会被 migratePlan 直接放行、永远停留在旧算法。
// 4（2026-10-14）：大重量复合动作（深蹲/卧推/硬拉/腿举/推举）组间休息 180→240 秒
const PLAN_SCHEMA = 5

// 部位 / 器械 / 难度 选项（动作库筛选）
const PARTS = [
  { code: 'chest', name: '胸部' }, { code: 'back', name: '背部' },
  { code: 'shoulder', name: '肩部' }, { code: 'arm', name: '手臂' },
  { code: 'abs', name: '腹部' }, { code: 'leg', name: '腿部' },
  { code: 'hip', name: '臀腿' }
]
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
// inPlan:false = 全量补齐的动作（free-exercise-db），只进动作库浏览、不进计划生成池
// （2026-10-13 扩容 1112 个：数据扩展不得改变老用户的计划生成结果）
PARTS.forEach(p => { POOL[p.code] = EX.filter(e => e.part === p.code && e.inPlan !== false) })

// —— 动作精选：按「复合优先 + 模式平衡 + 难度/器械适配」挑，而非取文件前N ——
// 复合动作（主项，应优先安排）
const COMPOUND = ['深蹲','硬拉','卧推','推举','划船','引体','下拉','腿举','箭步','臀桥','臀推','俯卧撑','臂屈伸','挺举','高翻','分腿蹲']
// 孤立动作（降权，作为容量补充）
const ISOLATION = ['飞鸟','夹胸','弯举','侧平举','前平举','后束','卷腹','提踵','下压','面拉','耸肩','手腕','伸展','拉伸','踢腿','后踢']
// 动作模式识别（判断顺序 = 优先级，新命中先返回）
// ⚠️ 顺序敏感：下方注释标了「必须先于」的几条不能调换，否则会误判（详见回归测试）
function patternOf(name) {
  const n = name || ''
  if (/深蹲|箭步|腿举|保加利亚|分腿蹲|跳蹲|哈克/.test(n)) return 'squat'
  if (/硬拉|臀桥|臀推|臀冲|早安|罗马尼亚|挺身|背伸展|超人|后倾/.test(n)) return 'hinge'
  if (/腿弯举/.test(n)) return 'legcurl'                          // 必须先于 /弯举/（否则腿弯举被当成二头）
  if (/卧推|长凳推举|俯卧撑|推胸|胸部推举|胸部臂屈伸/.test(n)) return 'push_h' // 「胸部臂屈伸」库里标在 part=chest，名称含"臂屈伸"会被误判成三头
  if (/面拉|反向飞鸟|反向蝴蝶机|后束|后三角|俯身飞鸟/.test(n)) return 'rear_delt' // 必须先于 划船/delts（否则反向飞鸟被当成胸部飞鸟）
  if (/上斜下压|直臂下压/.test(n)) return 'pull_v'                 // 必须先于 /下压/（否则背阔下压被当成三头）
  if (/肩部推举|肩上推|阿诺德|借力推|肩推|倒立/.test(n)) return 'push_v'
  if (/引体|背阔下拉|下拉/.test(n)) return 'pull_v'
  if (/划船/.test(n)) return 'pull_h'
  if (/弯举/.test(n)) return 'curl'
  if (/臂屈伸|下压|肱三头|窄握|窄距/.test(n)) return 'tri'
  if (/侧平举|前平举|飞鸟|夹胸|挤压/.test(n)) return 'delts'
  if (/卷腹|仰卧起坐|俄罗斯|抬腿|举腿|登山|核心|收腹|雨刷|折刀|健腹轮/.test(n)) return 'core'
  if (/平板/.test(n) && !/推举|卧推|长凳/.test(n)) return 'core'     // 排除「平板推举」类脏数据
  if (/提踵|小腿/.test(n)) return 'calf'
  if (/耸肩|斜方/.test(n)) return 'trap'
  return 'other'
}
// 各 focus 允许的动作模式（门禁：避免把拉类塞进推日、推类塞进拉日）
// 注意：这里**不放 'core'** —— 腹部动作由 buildExercises 单独以 allow:['core'] 追加，
// 若把 'core' 放进非腹部 focus，part=leg/back 里那几条 core 动作（登山者/举腿等）会抢占正式动作名额。
const FOCUS_PATTERNS = {
  // 三分化
  push: ['push_h', 'push_v', 'delts', 'tri'],
  pull: ['pull_v', 'pull_h', 'trap', 'rear_delt', 'curl'],
  leg:  ['squat', 'hinge', 'calf', 'legcurl'],
  // 四分化
  chest: ['push_h', 'delts', 'tri'],
  back:  ['pull_v', 'pull_h', 'trap', 'rear_delt'],
  shoulder: ['push_v', 'delts', 'rear_delt'],
  legs: ['squat', 'hinge', 'calf', 'legcurl'],
  // 五分化
  f_chest: ['push_h', 'delts', 'tri'],
  f_back: ['pull_v', 'pull_h', 'trap', 'rear_delt'],
  f_shoulder: ['push_v', 'delts', 'rear_delt', 'trap'],
  f_arm: ['curl', 'tri'],
  f_leg: ['squat', 'hinge', 'calf', 'legcurl'],
  // 其他
  arm:  ['curl', 'tri'],
  core: ['core'],
  full: null
}
// 给每个候选动作打分（复合加权、按经验适配器械/难度、偏离 focus 模式则降权），并标注模式
// 场景策略（用户拍板 2026-09-15）：
// · 健身房：器械动作为主，不推荐徒手动作（仅当某部位器械池耗尽时才兜底，如腹部多为徒手）
// · 居家：徒手为主，但哑铃/弹力带这类简单器械也可以推荐
// · mainstream：健身房里推主流动作（杠铃卧推/深蹲/高位下拉…），偏门动作不推
const HOME_EQUIP_BONUS = { '无器械': 30, '哑铃': 12, '弹力带': 10 }   // 其余器械 −30 仅兜底
function rankExercises(part, profile, home, allow) {
  const arr = POOL[part] || []
  const exp = profile.exp || '新手'
  return arr.map(e => {
    const n = e.name || ''
    let score = 0
    const pattern = patternOf(n)
    if (COMPOUND.some(k => n.indexOf(k) >= 0)) score += 10
    if (ISOLATION.some(k => n.indexOf(k) >= 0)) score -= 4
    if (n.indexOf('/') >= 0) score -= 5 // 脏数据（带"/"的拼凑名）降权
    if (allow && allow.indexOf(pattern) < 0) score -= 18 // 与当日训练方向不符（如推日出现划船），仅同方向池耗尽才兜底
    if (home) {
      score += (HOME_EQUIP_BONUS[e.equipment] !== undefined) ? HOME_EQUIP_BONUS[e.equipment] : -60
    } else {
      // 健身房：徒手大幅降权（器械池耗尽才兜底）；主流动作加权
      if (e.equipment === '无器械') score -= 20
      if (e.mainstream) score += 6
    }
    if (exp === '新手') {
      if (['哑铃','器械','绳索'].indexOf(e.equipment) >= 0) score += 3
      if (e.equipment === '杠铃' || e.equipment === '壶铃') score -= 5
      if (e.level === '新手') score += 2
    } else if (exp === '进阶') {
      if (e.equipment === '杠铃' || e.equipment === '壶铃') score += 2
    } else { // 熟练
      if (e.equipment === '杠铃') score += 3
      if (e.level === '熟练') score += 2
    }
    // 女性默认路径（2026-10-18 用户拍板）：不做杠铃卧推/深蹲那套男性主项 —— 固定器械/哑铃优先，
    // 臀腿肩背小幅加权（女性主要诉求），胸保持原有配额但选器械版本。仅影响新排计划（PLAN_SCHEMA 5 起重排）。
    if ((profile || {}).gender === '女') {
      if (e.equipment === '杠铃' || e.equipment === '壶铃') score -= 35
      if (['器械','哑铃','绳索'].indexOf(e.equipment) >= 0) score += 6
      const pn = e.partName || ''
      if (/臀|腿|下肢/.test(pn)) score += 4
      if (/肩|背/.test(pn)) score += 3
    }
    return { e, score, pattern }
  }).sort((a, b) => b.score - a.score)
}
// 贪心挑选 n 个，同一模式过度重复时降权，保证部位内动作多样性
// used：跨条目共享的「已选动作」集合。必须由调用方在同一次 buildExercises 内贯穿传入，
// 否则当 scheme 里同一 part 出现两次（如「腿×3 + 腿×1(小腿/腘绳)」）会挑出重复动作。
function pickBalanced(ranked, n, used) {
  const picked = []
  const pat = {}
  const work = (ranked || []).filter(x => !(used && used.has(x.e.name)))
  while (picked.length < n && work.length) {
    let bestIdx = 0, bestKey = -Infinity
    for (let i = 0; i < work.length; i++) {
      const w = work[i].score - (pat[work[i].pattern] || 0) * 3
      if (w > bestKey) { bestKey = w; bestIdx = i }
    }
    const chosen = work.splice(bestIdx, 1)[0]
    picked.push(chosen.e)
    pat[chosen.pattern] = (pat[chosen.pattern] || 0) + 1
    if (used) used.add(chosen.e.name)
  }
  return picked
}

// 训练日的「部位组合编排」已迁到 utils/method.js 的 METHOD.DAYS。
// 旧版这里是一张与分化无关的全局映射（focus→部位），导致「四分化胸日」和「五分化胸日」完全相同、
// 且所有分化都排不进腹部 —— 已废弃。如需改编排，请改 method.js，不要在这里加回。
const FOCUS_SCHEME_DEPRECATED = true
const FOCUS_NAME = {
  full: '全身', push: '推', pull: '拉', leg: '腿', chest: '胸',
  back: '背', shoulder: '肩', arm: '手臂', core: '核心'
}
// 并入 method.js 的训练日名称（四分化/五分化新增的 legs / f_* 等键在这里补齐）
Object.keys(METHOD.DAYS).forEach(k => { FOCUS_NAME[k] = METHOD.DAYS[k].name || METHOD.DAYS[k].short || k })

// 组×次数：按「目标 × 经验 × 动作角色」逐动作给（旧版是整天共用一个字符串）
// 主项还按计划周次走线性递进阶梯（method.js 的 MAIN_LADDER）
function setsFor(profile, role, week) {
  const p = profile || {}
  return METHOD.setsOf(p.goal || '塑形', p.exp || '新手', role || '辅助', week)
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

// 生成某个训练日的动作（方法论驱动）
//   · 部位组合编排来自 METHOD.DAYS[focusKey]（推=胸+肩中束+三头 / 拉=背+后束+二头 …）
//   · 组次与组间休息按「动作角色」逐动作给（主项/辅助/孤立/核心），主项按周次递进
//   · 训练日若没自带腹部动作，在末尾统一追加（method.js 的 absCountOf）
//   · 只存 oid，图/要领渲染时实时查 kb.EX（改动作库不会裂图）
function buildExercises(focusKey, profile, home, week, seed) {
  seed = seed || 0
  const day = METHOD.dayOf(focusKey)
  let parts = day ? day.parts : null
  if (!parts) {
    // 兜底：method.js 里没有这个 focus
    parts = (focusKey === 'core')
      ? [{ part: 'abs', picks: [{ pattern: 'core', n: 4 }] }]
      : [{ part: 'chest', picks: [{ pattern: 'push_h', n: 3 }] }]
  }
  const used = new Set()
  const out = []
  const put = (e, role, extra) => {
    const item = {
      oid: extractOid(e.gif), name: e.name, part: e.partName,
      pattern: patternOf(e.name), role,
      sets: setsFor(profile, role, week),
      rest: METHOD.restOf(role, e.name), rpe: METHOD.rpeOf(role),
      equipment: e.equipment
    }
    // 居家「真兜底」标记：哑铃/弹力带本就是居家可选（用户拍板），只有更重的器械才算兜底
    if (home && ['无器械','哑铃','弹力带'].indexOf(e.equipment) < 0) item.homeFallback = true
    out.push(Object.assign(item, extra || {}))
  }
  parts.forEach(({ part, n, allow, picks }) => {
    if (!part) return
    const gate = allow || FOCUS_PATTERNS[focusKey] || null
    // 配额写法（推荐）：picks:[{pattern,n}]；兼容简写：n + allow
    let quotas = picks
    if (!quotas) {
      if (!n) return
      quotas = [{ pattern: (allow && allow.length === 1) ? allow[0] : '', n }]
    }
    quotas.forEach(q => {
      const qn = q.n
      if (!qn) return
      const want = q.pattern
      let ranked = rankExercises(part, profile, home, want ? [want] : gate)
      // 指定了模式就严格要求该模式（池子里有该模式的动作时），避免配额被别的模式吃掉
      if (want) {
        const strict = ranked.filter(x => x.pattern === want)
        if (strict.length) ranked = strict
      }
      if (!ranked.length) return
      pickBalanced(ranked, qn, used).forEach(e => {
        const pt = patternOf(e.name)
        // 当天第一个动作 = 主项（占主项递进阶梯与最长休息）；其余按模式判孤立/辅助
        const role = out.length === 0 ? '主项' : METHOD.roleOfPattern(pt)
        put(e, role, { pattern: pt })
      })
    })
  })
  // 腹部：原文要求每日必带；自带腹部的训练日（ABS_PRESET / parts 含 abs）不重复追加
  const absN = METHOD.absCountOf(focusKey)
  if (absN > 0) {
    let rankedAbs = rankExercises('abs', profile, home, ['core'])
    if (seed && rankedAbs.length > 1) {
      // 质量层轮转：取分数最好的若干条（max−10 以内），按天序轮着选。
      // pickBalanced 按分数贪心，旋转数组无效，所以用「层内降权」实现确定性轮转。
      const maxS = rankedAbs[0].score
      const tier = rankedAbs.filter(r => r.score >= maxS - 10)
      const off = seed % tier.length
      rankedAbs = rankedAbs.map(r => {
        const ti = tier.indexOf(r)
        return (ti >= 0 && ti !== off) ? { e: r.e, score: r.score - 25, pattern: r.pattern } : r
      })
    }
    pickBalanced(rankedAbs, absN, used).forEach(e => {
      put(e, '核心', { pattern: 'core', sets: METHOD.CORE.sets })
    })
  }
  return out
}

// ===== 分化方案 × 频率模式（无限循环，不预生成死数组）=====
// ===== 分化方案（真身在 method.js，这里只做形状适配供页面取用）=====
// freq 必须是 FREQ 的合法键：旧版 enrollProgram 写死 'program'（非法），
// 导致「选了精选课表再换分化」会静默退回每周3练。
const SPLITS = {}
Object.keys(METHOD.SPLITS).forEach(k => {
  const s = METHOD.SPLITS[k]
  SPLITS[k] = {
    key: k, name: s.name, foci: s.foci.slice(),
    freq: s.freq, level: s.level, src: s.src, basis: s.basis
  }
})

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
  w2: { name:'每周2练', kind:'week', train:2 },
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
  // 2026-10-18 线上复查修复：days=2 以前被 clamp 到 3 → 计划实际排 3 练与用户选择矛盾；现在有 w2 档
  const dpw = Math.min(6, Math.max(2, profile.days || 3))
  if (dpw >= 6) return 'w6'
  if (dpw >= 5) return 'w5'
  if (dpw >= 4) return 'w4'
  if (dpw >= 3) return 'w3'
  return 'w2'
}

// 生成计划（无限循环模型：只存 micro + 起始日，渲染时按需算当天）
function generatePlan(profile, opts) {
  opts = opts || {}
  const splitKey = SPLITS[opts.split] ? opts.split : defaultSplit(profile.exp)
  const freqKey = FREQ[opts.freq] ? opts.freq : defaultFreq(splitKey, profile)
  const home = !!opts.home
  const sp = SPLITS[splitKey]; const fr = FREQ[freqKey] || FREQ_DEFAULT
  const micro = microFor(splitKey, freqKey)
  const trainCount = micro.filter(x => x !== 'rest').length
  const basis = `根据你的测评（${profile.gender}，${profile.age}岁，${profile.weight}kg，目标${profile.goal}，经验${profile.exp}），采用「${sp.name} · ${fr.name}」。${sp.basis}` + (home ? ' 本计划以徒手动作为主，搭配哑铃/弹力带（如你有这些小器械，体验更完整）。' : ' 本计划以健身房主流动作为主（杠铃/器械/绳索），少数图片待补不影响跟练。')
  return {
    schema: PLAN_SCHEMA,                       // 结构版本：migratePlan 靠它判断是否需要重排
    split: splitKey, freq: freqKey, src: sp.src,
    template: splitKey, templateName: sp.name + ' · ' + fr.name,
    micro, microName: fr.name,
    foci: sp.foci.slice(),                     // 训练日顺序，buildDay 按「全局训练序号」取模
    slotExercises: {},            // 用户对某训练日类型(循环槽位)增删的自定义动作，循环生效
    cycleStart: todayStr(), home, goal: profile.goal,
    dietMode: opts.dietMode || (profile && profile.dietMode) || 'simple',
    daysPerWeek: trainCount, basis
  }
}

// 热身清单：优先取 method.js 里该训练日的热身
function buildWarmup(focusKey) {
  const d = METHOD.dayOf(focusKey)
  const items = (d && d.warmup && d.warmup.length) ? d.warmup.slice() : ['动态热身 5min（摆腿/肩环绕/猫牛式）']
  return { minutes: 8, items }
}
// 是否减载周（方法论的 everyWeeks）
function isDeloadWeek(week) {
  const every = METHOD.DELOAD.everyWeeks || 4
  return week > 0 && week % every === 0
}

// 计算某一天（0基 dayIndex）的内容；无限循环：micro[dayIndex % micro.length]
// ⚠️ focusKey 由 plan.foci 按「全局训练序号」取模决定，不能直接用 micro[slot] 的字符串：
// micro 是 7 天定长且无限循环，低频分化（如「四分化 + 每周3练」）会永远循环不到后面的部位。
function buildDay(plan, dayIndex, profile, home) {
  const micro = plan.micro
  if (!micro || !micro.length) return { type: 'rest', focus: '休息日', note: '', slot: 0 }
  const slot = ((dayIndex % micro.length) + micro.length) % micro.length
  const f = micro[slot]
  const trainLen = micro.filter(x => x !== 'rest').length || 1
  const cycle = Math.floor(dayIndex / micro.length)
  const week = cycle + 1
  let seq = cycle * trainLen + micro.slice(0, slot).filter(x => x !== 'rest').length
  const foci = (plan.foci && plan.foci.length) ? plan.foci : null
  if (foci && foci.length) seq = ((seq % foci.length) + foci.length) % foci.length

  const isRest = (!f) || f === 'rest' || (typeof f === 'object' && f.type === 'rest')
  if (isRest) {
    return { type: 'rest', focus: '休息日', slot, week, focusKey: 'rest',
      note: '散步/拉伸/筋膜放松，恢复也是训练的一部分。' }
  }

  // —— 固定课表：micro 单元已预置动作（object），直接用，不再重排 ——
  if (typeof f === 'object' && f.exercises) {
    const fk = f.focusKey || ''
    const wk = f.week || week
    const exercises = (f.exercises || []).map(e => ({
      oid: e.oid || '', name: e.name, sets: e.sets,
      role: e.role || '辅助', pattern: e.pattern || '',
      rest: e.rest || METHOD.restOf(e.role || '辅助', e.name),
      rpe: e.rpe || METHOD.rpeOf(e.role || '辅助'),
      equipment: e.equipment || '', part: e.part || ''
    }))
    const extra = (plan.slotExercises && plan.slotExercises[String(slot)]) || []
    extra.forEach(e => exercises.push({
      oid: e.oid || '', name: e.name, sets: e.sets || '3×12',
      role: '辅助', pattern: '', rest: METHOD.restOf('辅助'), rpe: METHOD.rpeOf('辅助'),
      equipment: e.equipment || '', custom: true
    }))
    return {
      type: 'train', focus: f.focus || FOCUS_NAME[fk] || '训练', focusKey: fk,
      slot, week: wk, deload: !!f.deload,
      src: (METHOD.dayOf(fk) || {}).src || plan.src || METHOD.SRC.TUI,
      warmup: f.warmup || buildWarmup(fk),
      cardio: f.cardio || METHOD.CARDIO,
      exercises
    }
  }

  // —— 智能生成：focusKey 由全局训练序号决定（修低频分化漏部位）——
  const focusKey = foci ? foci[seq] : f

  // ── 递进与减载 ──
  // 1) 减载周**不参与递进**：否则它会把阶梯那一级顶掉（第 4 轮本该是 4×6，
  //    但刚好撞上减载周 → 用户永远练不到 4×6 那一级）。
  // 2) 减载周：正式组数按 DELOAD.setsFactor 降下来。
  //    ⚠️ 语义陷阱：reduceSets(sets, pct) 的 pct 是「**减少**的比例」，
  //       而 DELOAD.setsFactor = 0.6 指的是「**保留** 60%」→ 必须传 1 - 0.6。
  const everyWk = (METHOD.DELOAD && METHOD.DELOAD.everyWeeks) || 4
  const deload = isDeloadWeek(week)
  const effWeek = week - Math.floor(week / everyWk)      // 扣掉已过的减载周
  let exercises = buildExercises(focusKey, profile, home, effWeek, slot)
  if (deload) {
    const cut = 1 - ((METHOD.DELOAD && METHOD.DELOAD.setsFactor) || 0.6)
    exercises = exercises.map(e => Object.assign({}, e, { sets: reduceSets(e.sets, cut) }))
  }

  const extra = (plan.slotExercises && plan.slotExercises[String(slot)]) || []
  extra.forEach(e => exercises.push({
    oid: e.oid || '', name: e.name, sets: e.sets || '3×12',
    role: '辅助', pattern: '', rest: METHOD.restOf('辅助'), rpe: METHOD.rpeOf('辅助'),
    equipment: e.equipment || '', custom: true
  }))
  return {
    type: 'train', focus: FOCUS_NAME[focusKey] || focusKey, focusKey,
    slot, week, deload: isDeloadWeek(week),
    src: (METHOD.dayOf(focusKey) || {}).src || METHOD.SRC.TUI,
    warmup: buildWarmup(focusKey),
    cardio: METHOD.CARDIO,
    exercises
  }
}

// 统一取某天内容：兼容旧 plan.days 与新模式
// 临时停练只插入日历休息日，不改变周期起点、训练顺序与历史。
function schedulePosition(plan, calendarIndex) {
  let removed=0
  const pauses=(plan.schedulePauses||[]).slice().sort((a,b)=>a.at-b.at)
  for(const p of pauses){
    if(!Number.isInteger(p.at)||!Number.isInteger(p.days)||p.days<=0)continue
    if(calendarIndex<p.at)break
    if(calendarIndex<p.at+p.days)return {paused:true,index:p.at-removed,pause:p}
    removed+=p.days
  }
  return {paused:false,index:calendarIndex-removed}
}
function postponePlan(plan, fromDate, days) {
  if(!plan||!plan.cycleStart||!plan.micro)throw new Error('先建立训练计划')
  if(!Number.isInteger(days)||days<1||days>30)throw new Error('顺延天数需为1–30天')
  const parse=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d))throw new Error('日期无效');const x=new Date(d+'T00:00:00Z');if(!Number.isFinite(x.getTime())||x.toISOString().slice(0,10)!==d)throw new Error('日期无效');return x.getTime()}
  const at=Math.round((parse(fromDate)-parse(plan.cycleStart))/86400000)
  if(at<0)throw new Error('不能早于计划开始日期')
  const pauses=(plan.schedulePauses||[]).slice()
  if(pauses.some(p=>at<p.at+p.days&&at+days>p.at))throw new Error('这些日期已经安排临时休息，请先撤销或选择其他日期')
  pauses.push({at,days,fromDate,id:Date.now()+'_'+Math.random()})
  return Object.assign({},plan,{schedulePauses:pauses})
}

function dayContent(plan, dayIndex, profile, home) {
  const pos=schedulePosition(plan,dayIndex)
  if(pos.paused)return {type:'rest',focus:'临时休息',note:'训练已顺延，恢复后接着原顺序练',paused:true,exercises:[]}
  dayIndex=pos.index
  if (plan.micro) return buildDay(plan, dayIndex, profile, home)
  if (plan.days && plan.days[dayIndex]) return plan.days[dayIndex]
  return { type: 'rest', focus: '休息日', note: '' }
}

// 一次性迁移/结构升级。
// 注意：旧版只要 plan.micro 存在就直接 return，导致改了编排逻辑后老用户永远用不上新算法。
// 现在用 plan.schema 版本号判断：版本不符就重排，并**保留用户的选择**（分化/频率/场景/饮食模式/周期起点/自定义动作）。
function migratePlan(profile, plan) {
  if (!plan) return null
  if (plan.schema === PLAN_SCHEMA && plan.micro && plan.micro.length) return plan
  if (!profile) return plan // 无 profile 无法重建，保留原样

  // 情形一：旧 plan.days（28天固定数组）→ 新格式
  if (!plan.micro || !plan.micro.length) {
    const np = generatePlan(profile, { home: !!plan.home })
    np.cycleStart = plan.cycleStart || todayStr()
    np.slotExercises = {}
    return np
  }

  // 情形二：已是 micro 格式，但结构版本落后 → 重排，保留用户选择
  let np
  if (plan.program) {
    // 用户在跟精选课表：按原课表重新固化，不要降级成智能生成
    np = enrollProgram(plan.program, profile, !!plan.home)
  } else {
    np = generatePlan(profile, {
      split: plan.split, freq: plan.freq, home: !!plan.home, dietMode: plan.dietMode
    })
  }
  np.cycleStart = plan.cycleStart || todayStr()
  np.slotExercises = plan.slotExercises || {}
  np.schedulePauses = plan.schedulePauses || []
  return np
}

// ===== 精选固定课表（真人方法论 · 周期化 · 选了即固定跟练，不再随机重排）=====
// 减载周：把每组组数降约 40%（如 3×10 → 2×10），让身体恢复后再进阶
/**
 * 减少组数。
 * @param {string} setsStr '4×8' 这种
 * @param {number} pct **减少的比例**（0.4 = 减掉 40%，即保留 60%）
 *   注意别和 DELOAD.setsFactor(0.6 = 保留 60%) 搞混 —— 传之前要 1 - setsFactor。
 */
function reduceSets(setsStr, pct) {
  const m = String(setsStr).match(/^(\d+)\s*[×xX]\s*(\d+)/)
  if (!m) return setsStr
  const s = Math.max(1, Math.round(parseInt(m[1]) * (1 - pct)))
  return `${s}×${m[2]}`
}

const PROGRAMS = [
  {
    key: 'fb4', name: '新手全身·4周', weeks: 4, level: '新手', split: 'full',
    perWeek: ['full', 'rest', 'full', 'rest', 'full', 'rest', 'rest'],
    deload: [4],
    basis: '每周3练全身循环，4周打基础；第4周为减载周（容量降约40%），让身体恢复后再进阶。动作以复合动作为主，降低受伤风险，适合零基础/回归训练者。'
  },
  {
    key: 'ppl8', name: '进阶三分化·8周', weeks: 8, level: '进阶', split: 'ppl',
    perWeek: ['push', 'pull', 'rest', 'leg', 'push', 'pull', 'rest'],
    deload: [4, 8],
    basis: '推/拉/腿每周5练，8周容量渐进；第4、8周为减载周。适合有3个月以上训练基础、想系统增肌减脂者。'
  },
  {
    key: 'five12', name: '熟练五分化·12周', weeks: 12, level: '熟练', split: 'five',
    perWeek: ['chest', 'back', 'rest', 'shoulder', 'arm', 'rest', 'leg'],
    deload: [4, 8, 12],
    basis: '胸→背→肩→手臂→腿五分化每周5练，12周周期化进阶；第4、8、12周为减载周。适合训练熟练、追求单部位容量的进阶者。'
  }
]

// 把一份课表定义展开成固定 micro（含减载周），动作一次性 build 后固化
// 传入周次 wk，让组次走主项递进阶梯；减载周只降正式组，热身与核心不减（原文：超时先砍辅助组数）
function buildProgramMicro(prog, profile, home) {
  const micro = []
  const deloadPct = 1 - (METHOD.DELOAD.setsFactor || 0.6)
  for (let wk = 1; wk <= prog.weeks; wk++) {
    const deload = (prog.deload && prog.deload.indexOf(wk) >= 0) || isDeloadWeek(wk)
    prog.perWeek.forEach(day => {
      if (day === 'rest') { micro.push('rest'); return }
      const ex = buildExercises(day, profile, home, wk)
      if (deload) {
        ex.forEach(e => {
          if (e.role === '核心') return
          e.sets = reduceSets(e.sets, deloadPct)
        })
      }
      micro.push({
        type: 'train', focus: FOCUS_NAME[day] || day, focusKey: day,
        week: wk, deload, warmup: buildWarmup(day), cardio: METHOD.CARDIO,
        exercises: ex
      })
    })
  }
  return micro
}

// 报名精选课表：返回一份「固化」计划（micro 为预置动作，渲染时不再重排）
function enrollProgram(key, profile, home) {
  const prog = PROGRAMS.find(p => p.key === key) || PROGRAMS[0]
  const splitKey = prog.split
  const home_ = !!home
  const micro = buildProgramMicro(prog, profile, home_)
  const perWeekTrain = prog.perWeek.filter(d => d !== 'rest').length
  const sp = SPLITS[splitKey] || SPLITS.ppl
  return {
    schema: PLAN_SCHEMA,
    program: prog.key, programName: prog.name,
    split: splitKey,
    freq: (sp && sp.freq) || 'w3',   // ⚠️ 必须是合法 FREQ 键（旧版写死 'program'，会让换分化静默退回每周3练）
    src: (sp && sp.src) || METHOD.SRC.TUI,
    template: splitKey, templateName: prog.name,
    micro, microName: prog.name,
    foci: (sp && sp.foci) ? sp.foci.slice() : null,
    slotExercises: {},
    cycleStart: todayStr(), home: home_, goal: profile.goal,
    dietMode: (profile && profile.dietMode) || 'simple',
    daysPerWeek: perWeekTrain, basis: prog.basis
  }
}

function programList() {
  return PROGRAMS.map(p => ({ key: p.key, name: p.name, weeks: p.weeks, level: p.level, basis: p.basis }))
}

// 分化 / 频率清单：供测评页与计划页派生，避免页面里各硬编码一份（旧版 splitList/freqList 写死在页面里）
function splitList() {
  return Object.keys(SPLITS).map(k => ({
    key: k, name: SPLITS[k].name, level: SPLITS[k].level,
    src: SPLITS[k].src, basis: SPLITS[k].basis, freq: SPLITS[k].freq,
    daysPerWeek: (FREQ[SPLITS[k].freq] || FREQ_DEFAULT).train
  }))
}
function freqList() {
  return Object.keys(FREQ).map(k => ({
    key: k, name: FREQ[k].name, kind: FREQ[k].kind, train: FREQ[k].train
  }))
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
  { name: '白菜', kcal: 17, protein: 1.5, fat: 0.2, carbs: 2.4, fiber: 0.9 },
  { name: '冬瓜', kcal: 12, protein: 0.4, fat: 0.2, carbs: 2.6, fiber: 0.7 },
  { name: '豆芽', kcal: 18, protein: 1.7, fat: 0.1, carbs: 3.2, fiber: 0.8 },
  { name: '茄子', kcal: 23, protein: 1.1, fat: 0.2, carbs: 4.9, fiber: 1.3 },
  { name: '洋葱', kcal: 40, protein: 1.1, fat: 0.2, carbs: 8.1, fiber: 0.9 },
  { name: '口蘑', kcal: 24, protein: 3.3, fat: 0.2, carbs: 4.1, fiber: 1.6 },
  { name: '油麦菜', kcal: 15, protein: 1.4, fat: 0.4, carbs: 2.1, fiber: 0.6 },
  { name: '韭菜', kcal: 26, protein: 2.4, fat: 0.4, carbs: 4.6, fiber: 1.4 },
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
  { name: '黑豆(熟)', kcal: 132, protein: 8.9, fat: 0.5, carbs: 24, fiber: 8.5 },
  // —— 扩容（2026-09-16 用户要求：蛋白/碳水/脂肪点选项翻倍）——
  // 蛋白类
  { name: '龙利鱼', kcal: 83, protein: 18, fat: 1.5, carbs: 0, fiber: 0 },
  { name: '黄花鱼', kcal: 97, protein: 18.4, fat: 2.5, carbs: 0.2, fiber: 0 },
  { name: '鱿鱼', kcal: 84, protein: 17.9, fat: 1.5, carbs: 0, fiber: 0 },
  { name: '扇贝', kcal: 60, protein: 11.2, fat: 0.8, carbs: 2.4, fiber: 0 },
  { name: '鸡蛋白', kcal: 52, protein: 11, fat: 0.2, carbs: 0.8, fiber: 0 },
  { name: '脱脂牛奶', kcal: 35, protein: 3.4, fat: 0.1, carbs: 5, fiber: 0 },
  { name: '希腊酸奶(无糖)', kcal: 59, protein: 10, fat: 0.4, carbs: 3.6, fiber: 0 },
  { name: '毛豆', kcal: 123, protein: 13, fat: 5, carbs: 6.5, fiber: 4 },
  { name: '豆腐干', kcal: 147, protein: 16, fat: 6, carbs: 4.5, fiber: 0.8 },
  { name: '鹰嘴豆(熟)', kcal: 164, protein: 8.9, fat: 2.6, carbs: 27, fiber: 7.6 },
  { name: '猪里脊', kcal: 155, protein: 21, fat: 6, carbs: 0.7, fiber: 0 },
  { name: '鸭胸肉(去皮)', kcal: 140, protein: 20, fat: 6, carbs: 0, fiber: 0 },
  // 主食类
  { name: '紫薯', kcal: 82, protein: 2.3, fat: 0.3, carbs: 16.5, fiber: 2 },
  { name: '山药', kcal: 57, protein: 1.9, fat: 0.2, carbs: 11.6, fiber: 0.8 },
  { name: '藜麦(熟)', kcal: 120, protein: 4.4, fat: 1.9, carbs: 21.3, fiber: 2.8 },
  { name: '意面(熟)', kcal: 158, protein: 5.8, fat: 0.9, carbs: 26, fiber: 1.8 },
  { name: '红豆(熟)', kcal: 128, protein: 7.8, fat: 0.5, carbs: 20, fiber: 6.4 },
  { name: '绿豆(熟)', kcal: 105, protein: 7, fat: 0.4, carbs: 19, fiber: 5.2 },
  { name: '芋头', kcal: 81, protein: 2.2, fat: 0.2, carbs: 17.5, fiber: 1 },
  // 脂肪坚果类
  { name: '核桃', kcal: 646, protein: 15, fat: 65, carbs: 9.6, fiber: 6.7 },
  { name: '杏仁', kcal: 579, protein: 21, fat: 50, carbs: 19, fiber: 10.9 },
  { name: '腰果', kcal: 559, protein: 17, fat: 44, carbs: 30, fiber: 3.3 },
  { name: '花生酱', kcal: 588, protein: 25, fat: 50, carbs: 19, fiber: 6 },
  { name: '亚麻籽', kcal: 534, protein: 18, fat: 42, carbs: 29, fiber: 27 },
  { name: '白芝麻', kcal: 556, protein: 19, fat: 46, carbs: 16, fiber: 11.8 },
  { name: '黑巧克力(85%)', kcal: 598, protein: 7.8, fat: 43, carbs: 34, fiber: 11 },
  // 水果类
  { name: '橙子', kcal: 48, protein: 0.9, fat: 0.2, carbs: 11.1, fiber: 2.4 },
  { name: '猕猴桃', kcal: 61, protein: 0.8, fat: 0.5, carbs: 14.7, fiber: 3 },
  { name: '葡萄', kcal: 45, protein: 0.5, fat: 0.3, carbs: 10.6, fiber: 0.4 },
  { name: '火龙果', kcal: 55, protein: 1.1, fat: 0.2, carbs: 13, fiber: 1.6 },
  // 蔬菜类
  { name: '芦笋', kcal: 19, protein: 2.2, fat: 0.1, carbs: 3, fiber: 1.9 },
  { name: '秋葵', kcal: 37, protein: 2, fat: 0.2, carbs: 7.3, fiber: 3.2 },
  // —— 做菜谱（炒菜/家常菜）需要的食材，同时也让用户在食物搜索里能搜到 ——
  { name: '食用油', kcal: 899, protein: 0, fat: 99.9, carbs: 0, fiber: 0 },
  { name: '芹菜', kcal: 20, protein: 1.2, fat: 0.2, carbs: 3.9, fiber: 1.6 },
  { name: '青椒', kcal: 22, protein: 1, fat: 0.2, carbs: 5.4, fiber: 1.4 },
  { name: '香菇', kcal: 26, protein: 2.2, fat: 0.3, carbs: 5.2, fiber: 3.3 },
  { name: '鸡腿肉', kcal: 181, protein: 16, fat: 13, carbs: 0, fiber: 0 },
  { name: '荞麦面(熟)', kcal: 100, protein: 3.4, fat: 0.5, carbs: 21, fiber: 2 },
  { name: '娃娃菜', kcal: 13, protein: 1.5, fat: 0.1, carbs: 2.4, fiber: 1 },
  { name: '生菜', kcal: 15, protein: 1.4, fat: 0.2, carbs: 2.9, fiber: 1.3 },
  { name: '蒜', kcal: 128, protein: 4.5, fat: 0.2, carbs: 27, fiber: 1.1 },
  { name: '姜', kcal: 46, protein: 1.3, fat: 0.6, carbs: 10, fiber: 2.7 },
  { name: '豆腐皮', kcal: 409, protein: 44, fat: 17, carbs: 19, fiber: 2 },
  { name: '燕麦片', kcal: 389, protein: 17, fat: 7, carbs: 66, fiber: 10 },
  { name: '蓝莓', kcal: 57, protein: 0.7, fat: 0.3, carbs: 14, fiber: 2.4 },
  { name: '南瓜子', kcal: 566, protein: 30, fat: 49, carbs: 11, fiber: 6 },

  // ——— 以下为扩充库（1148 条）———
  // 来源：数值摘录自《中国食物成分表 标准版（第6版）》"能量和食物一般营养成分"部分
  //   （经开源项目 Sanotsu/china-food-composition-data 的 OCR 整理数据核对。
  //     食物成分数值属客观事实；此处中文命名、别名、分类与字段结构为本项目自行编写。）
  // 另补 9 条：原 OCR 数据未覆盖到、但日常真会记录的东西（进口坚果 / 生米 / 糖 / 可乐），
  //   逐条来源见 tools/build-foods.py 里的 MANUAL 常量。
  // 口径：每 100g 可食部。**米饭=熟重、稻米=生重** —— 称生米搜「稻米/生米」，盛饭搜「米饭」。
  // 重新生成：python3 tools/build-foods.py --write
  { name: '丁桂鱼', kcal: 157, protein: 29.7, fat: 4.2, carbs: 0.2, fiber: 0, cat: '蛋白', alias: ['生丁桂鱼'] },
  { name: '丁香鱼(干)', kcal: 196, protein: 37.5, fat: 3.1, carbs: 4.6, fiber: 0, cat: '蛋白', alias: ['生丁香鱼(干)'] },
  { name: '丁香鱼(香辣味)', kcal: 403, protein: 19.0, fat: 28.2, carbs: 18.3, fiber: 0, cat: '蛋白', alias: ['生丁香鱼(香辣味)'] },
  { name: '三明治火腿', kcal: 115, protein: 12.5, fat: 4.5, carbs: 6.1, fiber: 0, cat: '蛋白', alias: ['生三明治火腿'] },
  { name: '东方对虾', kcal: 84, protein: 18.3, fat: 0.5, carbs: 1.6, fiber: 0, cat: '蛋白', alias: ['中国对虾', '生东方对虾'] },
  { name: '乌鱼蛋', kcal: 66, protein: 14.1, fat: 1.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生乌鱼蛋'] },
  { name: '乌鳢', kcal: 85, protein: 18.5, fat: 1.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['黑鱼', '乌鱼', '生鱼', '生乌鳢'] },
  { name: '乌鳢(野生)', kcal: 105, protein: 19.9, fat: 2.3, carbs: 1.1, fiber: 0, cat: '蛋白', alias: ['黑鱼', '乌鱼', '生鱼', '生乌鳢(野生)'] },
  { name: '九节虾(鲜)', kcal: 90, protein: 21.4, fat: 0.1, carbs: 0.8, fiber: 0, cat: '蛋白', alias: ['生九节虾(鲜)'] },
  { name: '乳酪(中脂软酪)', kcal: 180, protein: 9.2, fat: 14.5, carbs: 3.1, fiber: 0, cat: '蛋白' },
  { name: '乳酪(全脂软酪)', kcal: 313, protein: 8.6, fat: 31.0, carbs: 0.0, fiber: 0, cat: '蛋白' },
  { name: '乳酪(羊乳酪)', kcal: 250, protein: 15.6, fat: 20.2, carbs: 1.5, fiber: 0, cat: '蛋白' },
  { name: '乳鸽', kcal: 352, protein: 11.3, fat: 34.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生乳鸽'] },
  { name: '乳鸽(红烧)', kcal: 255, protein: 16.9, fat: 20.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生乳鸽(红烧)'] },
  { name: '人乳', kcal: 65, protein: 1.3, fat: 3.4, carbs: 7.4, fiber: 0, cat: '蛋白' },
  { name: '人乳(成熟乳)', kcal: 70, protein: 1.2, fat: 4.4, carbs: 6.5, fiber: 0, cat: '蛋白' },
  { name: '低脂奶酪', kcal: 241, protein: 21.6, fat: 11.6, carbs: 12.6, fiber: 0, cat: '蛋白' },
  { name: '儿童肠', kcal: 290, protein: 13.1, fat: 19.6, carbs: 15.3, fiber: 0, cat: '蛋白', alias: ['生儿童肠'] },
  { name: '兔肉', kcal: 102, protein: 19.7, fat: 2.2, carbs: 0.9, fiber: 0, cat: '蛋白', alias: ['生兔肉'] },
  { name: '兔肉(野)', kcal: 84, protein: 16.6, fat: 2.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生兔肉(野)'] },
  { name: '全脂甜炼乳(雀巢)', kcal: 380, protein: 7.5, fat: 10.0, carbs: 64.9, fiber: 0, cat: '蛋白' },
  { name: '公麻鸭', kcal: 360, protein: 14.3, fat: 30.9, carbs: 6.1, fiber: 0, cat: '蛋白', alias: ['生公麻鸭'] },
  { name: '六角螺(鲜)', kcal: 118, protein: 23.5, fat: 0.5, carbs: 4.8, fiber: 0, cat: '蛋白', alias: ['生六角螺(鲜)'] },
  { name: '凤尾鱼(熟)', kcal: 520, protein: 23.5, fat: 43.0, carbs: 9.7, fiber: 0, cat: '蛋白', alias: ['生凤尾鱼(熟)'] },
  { name: '刺泡鱼', kcal: 94, protein: 23.0, fat: 0.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['刺鲍鱼', '生刺泡鱼'] },
  { name: '北京填鸭', kcal: 425, protein: 9.3, fat: 41.3, carbs: 3.9, fiber: 0, cat: '蛋白', alias: ['生北京填鸭'] },
  { name: '北京烤鸭', kcal: 436, protein: 16.6, fat: 38.4, carbs: 6.0, fiber: 0, cat: '蛋白', alias: ['生北京烤鸭'] },
  { name: '北极虾', kcal: 132, protein: 14.9, fat: 1.2, carbs: 15.4, fiber: 0, cat: '蛋白', alias: ['生北极虾'] },
  { name: '千张', kcal: 262, protein: 24.5, fat: 16.0, carbs: 5.5, fiber: 1.0, cat: '蛋白', alias: ['百页'] },
  { name: '午餐肉(北京)', kcal: 229, protein: 9.4, fat: 15.9, carbs: 12.0, fiber: 0, cat: '蛋白', alias: ['生午餐肉(北京)'] },
  { name: '午餐肚', kcal: 181, protein: 9.3, fat: 0.5, carbs: 34.7, fiber: 0, cat: '蛋白', alias: ['生午餐肚'] },
  { name: '午餐肠', kcal: 261, protein: 2.9, fat: 16.6, carbs: 24.9, fiber: 0, cat: '蛋白', alias: ['生午餐肠'] },
  { name: '午餐鱼(香辣味)', kcal: 383, protein: 24.4, fat: 30.2, carbs: 3.3, fiber: 0, cat: '蛋白', alias: ['生午餐鱼(香辣味)'] },
  { name: '华青鸡', kcal: 158, protein: 19.6, fat: 8.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生华青鸡'] },
  { name: '南美白对虾', kcal: 83, protein: 19.4, fat: 0.2, carbs: 0.8, fiber: 0, cat: '蛋白', alias: ['生南美白对虾'] },
  { name: '卤煮鸡', kcal: 212, protein: 29.4, fat: 7.9, carbs: 5.8, fiber: 0, cat: '蛋白', alias: ['生卤煮鸡'] },
  { name: '卤猪杂', kcal: 186, protein: 24.6, fat: 4.8, carbs: 11.0, fiber: 0, cat: '蛋白', alias: ['生卤猪杂'] },
  { name: '叉烧肉', kcal: 196, protein: 20.9, fat: 9.8, carbs: 6.0, fiber: 0, cat: '蛋白', alias: ['生叉烧肉'] },
  { name: '口头鱼', kcal: 134, protein: 19.6, fat: 4.2, carbs: 4.5, fiber: 0, cat: '蛋白', alias: ['生口头鱼'] },
  { name: '口虾蛄', kcal: 82, protein: 14.8, fat: 1.7, carbs: 1.8, fiber: 0, cat: '蛋白', alias: ['皮皮虾', '生口虾蛄'] },
  { name: '咖哩牛肉干', kcal: 326, protein: 45.9, fat: 2.7, carbs: 29.5, fiber: 0, cat: '蛋白', alias: ['生咖哩牛肉干'] },
  { name: '咸肉', kcal: 390, protein: 16.5, fat: 36.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生咸肉'] },
  { name: '回头鱼', kcal: 107, protein: 14.5, fat: 5.3, carbs: 0.4, fiber: 0, cat: '蛋白', alias: ['生回头鱼'] },
  { name: '基围虾', kcal: 101, protein: 18.2, fat: 1.4, carbs: 3.9, fiber: 0, cat: '蛋白', alias: ['生基围虾'] },
  { name: '堤鱼', kcal: 191, protein: 17.6, fat: 12.8, carbs: 1.3, fiber: 0, cat: '蛋白', alias: ['生堤鱼'] },
  { name: '塘水虾', kcal: 96, protein: 21.2, fat: 1.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['草虾', '生塘水虾'] },
  { name: '墨鱼(干)', kcal: 313, protein: 71.6, fat: 1.1, carbs: 4.2, fiber: 0, cat: '蛋白', alias: ['生墨鱼(干)'] },
  { name: '墨鱼丸', kcal: 128, protein: 13.4, fat: 4.7, carbs: 8.0, fiber: 4.0, cat: '蛋白', alias: ['生墨鱼丸'] },
  { name: '墨鱼圈', kcal: 72, protein: 13.0, fat: 2.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生墨鱼圈'] },
  { name: '大肉肠', kcal: 273, protein: 12.0, fat: 22.9, carbs: 4.6, fiber: 0, cat: '蛋白', alias: ['生大肉肠'] },
  { name: '大腊肠', kcal: 267, protein: 12.9, fat: 20.1, carbs: 8.6, fiber: 0, cat: '蛋白', alias: ['生大腊肠'] },
  { name: '大菱鲆鱼(鲜)', kcal: 81, protein: 17.0, fat: 1.1, carbs: 0.7, fiber: 0, cat: '蛋白', alias: ['多宝鱼', '生大菱鲆鱼(鲜)'] },
  { name: '大闸蟹(母)', kcal: 156, protein: 21.0, fat: 7.7, carbs: 0.6, fiber: 0, cat: '蛋白', alias: ['生大闸蟹(母)'] },
  { name: '太仓肉松', kcal: 316, protein: 38.6, fat: 8.3, carbs: 21.6, fiber: 0, cat: '蛋白', alias: ['生太仓肉松'] },
  { name: '奶油', kcal: 879, protein: 0.7, fat: 97.0, carbs: 0.9, fiber: 0, cat: '蛋白' },
  { name: '奶油(焦克)', kcal: 447, protein: 3.0, fat: 48.3, carbs: 0.0, fiber: 0, cat: '蛋白' },
  { name: '奶油(食品工业)', kcal: 504, protein: 1.1, fat: 55.5, carbs: 0.0, fiber: 0, cat: '蛋白' },
  { name: '奶渣', kcal: 381, protein: 44.4, fat: 4.2, carbs: 41.3, fiber: 0, cat: '蛋白' },
  { name: '奶片', kcal: 472, protein: 13.3, fat: 20.2, carbs: 59.3, fiber: 0, cat: '蛋白' },
  { name: '奶疙瘩', kcal: 426, protein: 55.1, fat: 15.0, carbs: 17.7, fiber: 0, cat: '蛋白', alias: ['奶酪干', '干酸奶'] },
  { name: '奶皮子', kcal: 460, protein: 12.2, fat: 42.9, carbs: 6.3, fiber: 0, cat: '蛋白' },
  { name: '奶豆腐(脱脂)', kcal: 343, protein: 53.7, fat: 2.5, carbs: 26.5, fiber: 0, cat: '蛋白' },
  { name: '奶豆腐(鲜)', kcal: 305, protein: 46.2, fat: 7.8, carbs: 12.5, fiber: 0, cat: '蛋白' },
  { name: '奶酪(百嘉儿童干酪条)', kcal: 272, protein: 25.0, fat: 18.4, carbs: 1.5, fiber: 0, cat: '蛋白' },
  { name: '对虾', kcal: 93, protein: 18.6, fat: 0.8, carbs: 2.8, fiber: 0, cat: '蛋白', alias: ['生对虾'] },
  { name: '尖嘴白', kcal: 137, protein: 22.7, fat: 3.3, carbs: 4.1, fiber: 0, cat: '蛋白', alias: ['生尖嘴白'] },
  { name: '尖嘴鱼(雅江冷水鱼)', kcal: 107, protein: 17.1, fat: 2.2, carbs: 4.6, fiber: 0, cat: '蛋白', alias: ['生尖嘴鱼(雅江冷水鱼)'] },
  { name: '山羊肉(生)', kcal: 293, protein: 8.7, fat: 24.5, carbs: 9.4, fiber: 0, cat: '蛋白', alias: ['生山羊肉(生)'] },
  { name: '山羊肉(酱)', kcal: 272, protein: 25.4, fat: 13.7, carbs: 11.8, fiber: 0, cat: '蛋白', alias: ['生山羊肉(酱)'] },
  { name: '带鱼', kcal: 127, protein: 17.7, fat: 4.9, carbs: 3.1, fiber: 0, cat: '蛋白', alias: ['白带鱼', '刀鱼', '生带鱼'] },
  { name: '带鱼(切段)', kcal: 108, protein: 17.6, fat: 4.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生带鱼(切段)'] },
  { name: '广东香肠', kcal: 433, protein: 18.0, fat: 37.3, carbs: 6.4, fiber: 0, cat: '蛋白', alias: ['生广东香肠'] },
  { name: '扇贝(干)', kcal: 264, protein: 55.6, fat: 2.4, carbs: 5.1, fiber: 0, cat: '蛋白', alias: ['干贝', '生扇贝(干)'] },
  { name: '扇贝(鲜)', kcal: 60, protein: 11.1, fat: 0.6, carbs: 2.6, fiber: 0, cat: '蛋白', alias: ['生扇贝(鲜)'] },
  { name: '扒猪脸', kcal: 347, protein: 18.8, fat: 29.6, carbs: 1.4, fiber: 0, cat: '蛋白', alias: ['生扒猪脸'] },
  { name: '扒鸡', kcal: 217, protein: 29.6, fat: 11.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生扒鸡'] },
  { name: '扒鸡(五香脱骨)', kcal: 206, protein: 23.4, fat: 10.8, carbs: 3.8, fiber: 0, cat: '蛋白', alias: ['生扒鸡(五香脱骨)'] },
  { name: '抗浪鱼', kcal: 174, protein: 16.6, fat: 11.0, carbs: 2.1, fiber: 0, cat: '蛋白', alias: ['生抗浪鱼'] },
  { name: '文蛤(鲜)', kcal: 56, protein: 9.2, fat: 0.7, carbs: 3.2, fiber: 0, cat: '蛋白', alias: ['生文蛤(鲜)'] },
  { name: '文蛤丸', kcal: 211, protein: 16.2, fat: 9.2, carbs: 15.8, fiber: 0, cat: '蛋白', alias: ['生文蛤丸'] },
  { name: '斑节对虾', kcal: 103, protein: 18.6, fat: 0.8, carbs: 5.4, fiber: 0, cat: '蛋白', alias: ['草虾', '生斑节对虾'] },
  { name: '斑鳠', kcal: 135, protein: 16.8, fat: 7.3, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['剑骨鱼', '生斑鳠'] },
  { name: '方腿', kcal: 117, protein: 16.2, fat: 5.0, carbs: 1.9, fiber: 0, cat: '蛋白', alias: ['生方腿'] },
  { name: '明虾', kcal: 85, protein: 13.4, fat: 1.8, carbs: 3.8, fiber: 0, cat: '蛋白', alias: ['生明虾'] },
  { name: '曲拉', kcal: 356, protein: 39.1, fat: 2.9, carbs: 43.4, fiber: 0, cat: '蛋白' },
  { name: '松江肠', kcal: 402, protein: 12.3, fat: 26.5, carbs: 28.5, fiber: 0, cat: '蛋白', alias: ['生松江肠'] },
  { name: '松花蛋(鸡蛋)', kcal: 178, protein: 14.8, fat: 10.6, carbs: 5.8, fiber: 0, cat: '蛋白' },
  { name: '松花蛋(鸭蛋)', kcal: 171, protein: 14.2, fat: 10.7, carbs: 4.5, fiber: 0, cat: '蛋白', alias: ['皮蛋'] },
  { name: '枝竹', kcal: 478, protein: 44.4, fat: 24.7, carbs: 20.8, fiber: 2.7, cat: '蛋白' },
  { name: '梅童鱼', kcal: 121, protein: 18.9, fat: 5.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['大头仔鱼', '丁珠鱼', '生梅童鱼'] },
  { name: '梅花参(泡发)', kcal: 73, protein: 11.7, fat: 0.9, carbs: 4.5, fiber: 0, cat: '蛋白', alias: ['生梅花参(泡发)'] },
  { name: '梭子蟹', kcal: 95, protein: 15.9, fat: 3.1, carbs: 0.9, fiber: 0, cat: '蛋白', alias: ['生梭子蟹'] },
  { name: '棒棒鱼(雅江冷水鱼)', kcal: 118, protein: 27.1, fat: 1.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生棒棒鱼(雅江冷水鱼)'] },
  { name: '棘参(鲜)', kcal: 21, protein: 4.1, fat: 0.0, carbs: 1.2, fiber: 0, cat: '蛋白', alias: ['生棘参(鲜)'] },
  { name: '母鸡(一年内)', kcal: 256, protein: 20.3, fat: 16.8, carbs: 5.8, fiber: 0, cat: '蛋白', alias: ['生母鸡(一年内)'] },
  { name: '母麻鸭', kcal: 461, protein: 13.0, fat: 44.8, carbs: 1.4, fiber: 0, cat: '蛋白', alias: ['生母麻鸭'] },
  { name: '毛蛋', kcal: 176, protein: 14.2, fat: 13.2, carbs: 0.0, fiber: 0, cat: '蛋白' },
  { name: '江虾', kcal: 87, protein: 10.3, fat: 0.9, carbs: 9.3, fiber: 0, cat: '蛋白', alias: ['沼虾', '生江虾'] },
  { name: '沙丁鱼', kcal: 89, protein: 19.8, fat: 1.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['沙鲻', '生沙丁鱼'] },
  { name: '沙丁鱼(油浸)', kcal: 220, protein: 23.3, fat: 14.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生沙丁鱼(油浸)'] },
  { name: '沙丁鱼(盐水浸)', kcal: 172, protein: 21.5, fat: 9.6, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生沙丁鱼(盐水浸)'] },
  { name: '沙钻鱼', kcal: 84, protein: 18.4, fat: 0.6, carbs: 1.2, fiber: 0, cat: '蛋白', alias: ['多鳞鱚', '沙梭鱼', '麦穗鱼', '生沙钻鱼'] },
  { name: '沙鸡', kcal: 147, protein: 20.0, fat: 6.7, carbs: 1.6, fiber: 0, cat: '蛋白', alias: ['生沙鸡'] },
  { name: '河虾', kcal: 87, protein: 16.4, fat: 2.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生河虾'] },
  { name: '河蚌', kcal: 54, protein: 10.9, fat: 0.8, carbs: 0.7, fiber: 0, cat: '蛋白', alias: ['生河蚌'] },
  { name: '河蚬', kcal: 47, protein: 7.0, fat: 1.4, carbs: 1.7, fiber: 0, cat: '蛋白', alias: ['蚬子', '生河蚬'] },
  { name: '河蟹', kcal: 103, protein: 17.5, fat: 2.6, carbs: 2.3, fiber: 0, cat: '蛋白', alias: ['生河蟹'] },
  { name: '油抒', kcal: 145, protein: 15.9, fat: 9.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['香梭鱼', '生油抒'] },
  { name: '油豆腐', kcal: 245, protein: 17.0, fat: 17.6, carbs: 4.9, fiber: 0.6, cat: '蛋白' },
  { name: '泥蚶', kcal: 71, protein: 10.0, fat: 0.8, carbs: 6.0, fiber: 0, cat: '蛋白', alias: ['血蚶', '珠蚶', '生泥蚶'] },
  { name: '泥鳅', kcal: 96, protein: 17.9, fat: 2.0, carbs: 1.7, fiber: 0, cat: '蛋白', alias: ['生泥鳅'] },
  { name: '海参', kcal: 78, protein: 16.5, fat: 0.2, carbs: 2.5, fiber: 0, cat: '蛋白', alias: ['生海参'] },
  { name: '海参(干)', kcal: 262, protein: 50.2, fat: 4.8, carbs: 4.5, fiber: 0, cat: '蛋白', alias: ['生海参(干)'] },
  { name: '海参(水浸)', kcal: 25, protein: 6.0, fat: 0.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生海参(水浸)'] },
  { name: '海虾', kcal: 79, protein: 16.8, fat: 0.6, carbs: 1.5, fiber: 0, cat: '蛋白', alias: ['生海虾'] },
  { name: '海蚌', kcal: 42, protein: 9.5, fat: 0.3, carbs: 0.2, fiber: 0, cat: '蛋白', alias: ['西施舌', '生海蚌'] },
  { name: '海蚌(鲜)', kcal: 51, protein: 6.9, fat: 0.2, carbs: 5.5, fiber: 0, cat: '蛋白', alias: ['生海蚌(鲜)'] },
  { name: '海蜇头', kcal: 74, protein: 6.0, fat: 0.3, carbs: 11.8, fiber: 0, cat: '蛋白', alias: ['生海蜇头'] },
  { name: '海蜇皮', kcal: 33, protein: 3.7, fat: 0.3, carbs: 3.8, fiber: 0, cat: '蛋白', alias: ['生海蜇皮'] },
  { name: '海螺肉(干)', kcal: 295, protein: 65.7, fat: 0.5, carbs: 7.0, fiber: 0, cat: '蛋白', alias: ['生海螺肉(干)'] },
  { name: '海蟹', kcal: 95, protein: 13.8, fat: 2.3, carbs: 4.7, fiber: 0, cat: '蛋白', alias: ['生海蟹'] },
  { name: '海蟹(公)', kcal: 85, protein: 18.0, fat: 0.3, carbs: 2.5, fiber: 0, cat: '蛋白', alias: ['生海蟹(公)'] },
  { name: '海蟹(小)', kcal: 81, protein: 14.2, fat: 1.1, carbs: 3.6, fiber: 0, cat: '蛋白', alias: ['生海蟹(小)'] },
  { name: '海蟹(母)', kcal: 64, protein: 14.2, fat: 0.3, carbs: 1.2, fiber: 0, cat: '蛋白', alias: ['生海蟹(母)'] },
  { name: '海鲈鱼(鲜)', kcal: 112, protein: 19.5, fat: 3.6, carbs: 0.4, fiber: 0, cat: '蛋白', alias: ['生海鲈鱼(鲜)'] },
  { name: '海鲫鱼', kcal: 206, protein: 17.0, fat: 13.7, carbs: 3.6, fiber: 0, cat: '蛋白', alias: ['九九鱼', '生海鲫鱼'] },
  { name: '海鳗', kcal: 122, protein: 18.8, fat: 5.0, carbs: 0.5, fiber: 0, cat: '蛋白', alias: ['鲫勾', '生海鳗'] },
  { name: '海鸭蛋', kcal: 243, protein: 12.7, fat: 13.8, carbs: 16.9, fiber: 0, cat: '蛋白' },
  { name: '湟鱼', kcal: 124, protein: 17.1, fat: 3.2, carbs: 6.7, fiber: 0, cat: '蛋白', alias: ['裸鲤鱼', '生湟鱼'] },
  { name: '火腿肉(藏香猪)', kcal: 503, protein: 29.1, fat: 40.7, carbs: 5.0, fiber: 0, cat: '蛋白', alias: ['生火腿肉(藏香猪)'] },
  { name: '火腿肠', kcal: 212, protein: 14.0, fat: 10.4, carbs: 15.6, fiber: 0, cat: '蛋白', alias: ['生火腿肠'] },
  { name: '火腿肠(圆腿)', kcal: 139, protein: 18.4, fat: 6.5, carbs: 1.6, fiber: 0, cat: '蛋白', alias: ['生火腿肠(圆腿)'] },
  { name: '火腿肠(小泥肠)', kcal: 295, protein: 11.3, fat: 26.3, carbs: 3.2, fiber: 0, cat: '蛋白', alias: ['生火腿肠(小泥肠)'] },
  { name: '火腿肠(小红肠)', kcal: 280, protein: 11.8, fat: 23.2, carbs: 6.0, fiber: 0, cat: '蛋白', alias: ['生火腿肠(小红肠)'] },
  { name: '炸素虾', kcal: 582, protein: 27.6, fat: 44.4, carbs: 19.3, fiber: 2.7, cat: '蛋白' },
  { name: '炸鸡块', kcal: 279, protein: 20.3, fat: 17.3, carbs: 10.5, fiber: 0, cat: '蛋白', alias: ['肯德基', '生炸鸡块'] },
  { name: '烤鸡', kcal: 265, protein: 28.1, fat: 16.9, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生烤鸡'] },
  { name: '烤麸', kcal: 121, protein: 20.4, fat: 0.3, carbs: 9.3, fiber: 0.2, cat: '蛋白' },
  { name: '烧羊肉(五香)', kcal: 183, protein: 33.6, fat: 5.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生烧羊肉(五香)'] },
  { name: '烧鹅', kcal: 289, protein: 19.7, fat: 21.5, carbs: 4.2, fiber: 0, cat: '蛋白', alias: ['生烧鹅'] },
  { name: '热狗肠', kcal: 307, protein: 13.2, fat: 25.2, carbs: 6.9, fiber: 0, cat: '蛋白', alias: ['生热狗肠'] },
  { name: '牛大肠', kcal: 66, protein: 11.0, fat: 2.3, carbs: 0.4, fiber: 0, cat: '蛋白', alias: ['生牛大肠'] },
  { name: '牛心', kcal: 106, protein: 15.4, fat: 3.5, carbs: 3.1, fiber: 0, cat: '蛋白', alias: ['生牛心'] },
  { name: '牛百叶(黑)', kcal: 70, protein: 13.2, fat: 1.9, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生牛百叶(黑)'] },
  { name: '牛肉(前腱)', kcal: 113, protein: 20.3, fat: 1.3, carbs: 5.1, fiber: 0, cat: '蛋白', alias: ['生牛肉(前腱)'] },
  { name: '牛肉(前腿)', kcal: 105, protein: 19.2, fat: 1.8, carbs: 2.9, fiber: 0, cat: '蛋白', alias: ['生牛肉(前腿)'] },
  { name: '牛肉(后腱)', kcal: 98, protein: 20.1, fat: 1.0, carbs: 2.2, fiber: 0, cat: '蛋白', alias: ['生牛肉(后腱)'] },
  { name: '牛肉(后腿)', kcal: 106, protein: 20.9, fat: 2.0, carbs: 1.1, fiber: 0, cat: '蛋白', alias: ['生牛肉(后腿)'] },
  { name: '牛肉(小腿肉)', kcal: 122, protein: 23.0, fat: 3.3, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['牛展', '牛腱子', '生牛肉(小腿肉)'] },
  { name: '牛肉(清香)', kcal: 200, protein: 25.8, fat: 10.7, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生牛肉(清香)'] },
  { name: '牛肉(肋条)', kcal: 123, protein: 18.6, fat: 5.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生牛肉(肋条)'] },
  { name: '牛肉(股内肉)', kcal: 119, protein: 22.8, fat: 2.9, carbs: 0.4, fiber: 0, cat: '蛋白', alias: ['针扒', '米龙', '黄瓜条', '生牛肉(股内肉)'] },
  { name: '牛肉(肩部肉)', kcal: 342, protein: 14.1, fat: 31.7, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['肩肉', '生牛肉(肩部肉)'] },
  { name: '牛肉(背部肉)', kcal: 193, protein: 17.4, fat: 12.4, carbs: 3.0, fiber: 0, cat: '蛋白', alias: ['上脑', '生牛肉(背部肉)'] },
  { name: '牛肉(胸部肉)', kcal: 326, protein: 16.6, fat: 28.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['牛胸', '生牛肉(胸部肉)'] },
  { name: '牛肉(腹部肉)', kcal: 332, protein: 17.1, fat: 29.3, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['牛腩', '生牛肉(腹部肉)'] },
  { name: '牛肉(膝圆肉)', kcal: 106, protein: 22.4, fat: 1.8, carbs: 0.1, fiber: 0, cat: '蛋白', alias: ['和尚头', '生牛肉(膝圆肉)'] },
  { name: '牛肉(臀部肉)', kcal: 117, protein: 22.6, fat: 2.6, carbs: 0.9, fiber: 0, cat: '蛋白', alias: ['紫盖', '白板', '生牛肉(臀部肉)'] },
  { name: '牛肉(里脊肉)', kcal: 107, protein: 22.2, fat: 0.9, carbs: 2.4, fiber: 0, cat: '蛋白', alias: ['牛柳', '生牛肉(里脊肉)'] },
  { name: '牛肉干', kcal: 550, protein: 45.6, fat: 40.0, carbs: 1.9, fiber: 0, cat: '蛋白', alias: ['生牛肉干'] },
  { name: '牛肉松', kcal: 445, protein: 8.2, fat: 15.7, carbs: 67.7, fiber: 0, cat: '蛋白', alias: ['生牛肉松'] },
  { name: '牛肚', kcal: 72, protein: 14.5, fat: 1.6, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生牛肚'] },
  { name: '牛肝', kcal: 139, protein: 19.8, fat: 3.9, carbs: 6.2, fiber: 0, cat: '蛋白', alias: ['生牛肝'] },
  { name: '牛肺', kcal: 95, protein: 16.5, fat: 2.5, carbs: 1.5, fiber: 0, cat: '蛋白', alias: ['生牛肺'] },
  { name: '牛肾', kcal: 94, protein: 15.6, fat: 2.4, carbs: 2.6, fiber: 0, cat: '蛋白', alias: ['生牛肾'] },
  { name: '牛脑', kcal: 149, protein: 12.5, fat: 11.0, carbs: 0.1, fiber: 0, cat: '蛋白', alias: ['生牛脑'] },
  { name: '牛腱子(香叶)', kcal: 205, protein: 35.6, fat: 5.5, carbs: 3.2, fiber: 0, cat: '蛋白', alias: ['生牛腱子(香叶)'] },
  { name: '牛舌', kcal: 196, protein: 17.0, fat: 13.3, carbs: 2.0, fiber: 0, cat: '蛋白', alias: ['生牛舌'] },
  { name: '牛角江珧蛤(鲜)', kcal: 49, protein: 7.1, fat: 0.5, carbs: 4.0, fiber: 0, cat: '蛋白', alias: ['长带子', '生牛角江珧蛤(鲜)'] },
  { name: '牛蹄筋(泡发)', kcal: 25, protein: 6.0, fat: 0.0, carbs: 0.2, fiber: 0, cat: '蛋白', alias: ['生牛蹄筋(泡发)'] },
  { name: '牛蹄筋(熟)', kcal: 147, protein: 35.2, fat: 0.6, carbs: 0.1, fiber: 0, cat: '蛋白', alias: ['生牛蹄筋(熟)'] },
  { name: '牛蹄筋(生)', kcal: 151, protein: 34.1, fat: 0.5, carbs: 2.6, fiber: 0, cat: '蛋白', alias: ['生牛蹄筋(生)'] },
  { name: '牡蛎', kcal: 73, protein: 5.3, fat: 2.1, carbs: 8.2, fiber: 0, cat: '蛋白', alias: ['海蛎子', '生牡蛎'] },
  { name: '牦牛肉', kcal: 119, protein: 23.1, fat: 1.4, carbs: 3.4, fiber: 0, cat: '蛋白', alias: ['生牦牛肉'] },
  { name: '狗母鱼', kcal: 100, protein: 16.7, fat: 2.3, carbs: 3.0, fiber: 0, cat: '蛋白', alias: ['大头狗母鱼', '生狗母鱼'] },
  { name: '猪大排', kcal: 264, protein: 18.3, fat: 20.4, carbs: 1.7, fiber: 0, cat: '蛋白', alias: ['生猪大排'] },
  { name: '猪大肠', kcal: 196, protein: 6.9, fat: 18.7, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪大肠'] },
  { name: '猪头皮', kcal: 499, protein: 11.8, fat: 44.6, carbs: 12.7, fiber: 0, cat: '蛋白', alias: ['生猪头皮'] },
  { name: '猪小排(杜长大猪)', kcal: 295, protein: 16.8, fat: 25.3, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪小排(杜长大猪)'] },
  { name: '猪小排(良杂猪)', kcal: 351, protein: 14.1, fat: 32.7, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪小排(良杂猪)'] },
  { name: '猪小肠', kcal: 65, protein: 10.0, fat: 2.0, carbs: 1.7, fiber: 0, cat: '蛋白', alias: ['生猪小肠'] },
  { name: '猪心', kcal: 119, protein: 16.6, fat: 5.3, carbs: 1.1, fiber: 0, cat: '蛋白', alias: ['生猪心'] },
  { name: '猪皮', kcal: 363, protein: 27.4, fat: 28.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪皮'] },
  { name: '猪耳', kcal: 176, protein: 19.1, fat: 11.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪耳'] },
  { name: '猪肉(前肘)', kcal: 287, protein: 17.3, fat: 22.9, carbs: 2.9, fiber: 0, cat: '蛋白', alias: ['生猪肉(前肘)'] },
  { name: '猪肉(后肘)', kcal: 320, protein: 17.0, fat: 28.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪肉(后肘)'] },
  { name: '猪肉(后臀尖)', kcal: 336, protein: 14.6, fat: 30.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪肉(后臀尖)'] },
  { name: '猪肉(奶脯)', kcal: 349, protein: 7.7, fat: 35.3, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['软五花', '猪夹心', '生猪肉(奶脯)'] },
  { name: '猪肉(奶面)', kcal: 339, protein: 13.6, fat: 30.6, carbs: 2.2, fiber: 0, cat: '蛋白', alias: ['硬五花', '生猪肉(奶面)'] },
  { name: '猪肉(清蒸)', kcal: 198, protein: 18.4, fat: 13.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪肉(清蒸)'] },
  { name: '猪肉(猪脖)', kcal: 577, protein: 8.0, fat: 60.5, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪肉(猪脖)'] },
  { name: '猪肉(肋条肉)', kcal: 568, protein: 9.3, fat: 59.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪肉(肋条肉)'] },
  { name: '猪肉(腿)', kcal: 190, protein: 17.9, fat: 12.8, carbs: 0.8, fiber: 0, cat: '蛋白', alias: ['生猪肉(腿)'] },
  { name: '猪肉(里脊)', kcal: 150, protein: 19.6, fat: 7.9, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪肉(里脊)'] },
  { name: '猪肉脯', kcal: 378, protein: 28.0, fat: 8.8, carbs: 46.6, fiber: 0, cat: '蛋白', alias: ['生猪肉脯'] },
  { name: '猪肘棒', kcal: 248, protein: 16.5, fat: 16.0, carbs: 9.4, fiber: 0, cat: '蛋白', alias: ['生猪肘棒'] },
  { name: '猪肘棒(熟)', kcal: 314, protein: 21.3, fat: 24.5, carbs: 2.1, fiber: 0, cat: '蛋白', alias: ['生猪肘棒(熟)'] },
  { name: '猪肚', kcal: 110, protein: 15.2, fat: 5.1, carbs: 0.7, fiber: 0, cat: '蛋白', alias: ['生猪肚'] },
  { name: '猪肝', kcal: 126, protein: 19.2, fat: 4.7, carbs: 1.8, fiber: 0, cat: '蛋白', alias: ['生猪肝'] },
  { name: '猪肝(卤煮)', kcal: 203, protein: 26.4, fat: 8.3, carbs: 5.6, fiber: 0, cat: '蛋白', alias: ['生猪肝(卤煮)'] },
  { name: '猪肺', kcal: 84, protein: 12.2, fat: 3.9, carbs: 0.1, fiber: 0, cat: '蛋白', alias: ['生猪肺'] },
  { name: '猪脑', kcal: 131, protein: 10.8, fat: 9.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪脑'] },
  { name: '猪脾', kcal: 94, protein: 13.2, fat: 3.2, carbs: 3.1, fiber: 0, cat: '蛋白', alias: ['生猪脾'] },
  { name: '猪腿肉(藏香猪)', kcal: 268, protein: 17.5, fat: 19.2, carbs: 6.3, fiber: 0, cat: '蛋白', alias: ['生猪腿肉(藏香猪)'] },
  { name: '猪舌', kcal: 184, protein: 18.1, fat: 12.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['口条', '生猪舌'] },
  { name: '猪血', kcal: 55, protein: 12.2, fat: 0.3, carbs: 0.9, fiber: 0, cat: '蛋白', alias: ['生猪血'] },
  { name: '猪蹄', kcal: 260, protein: 22.6, fat: 18.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生猪蹄'] },
  { name: '猪蹄(熟)', kcal: 260, protein: 23.6, fat: 17.0, carbs: 3.2, fiber: 0, cat: '蛋白', alias: ['生猪蹄(熟)'] },
  { name: '猪蹄筋', kcal: 156, protein: 35.3, fat: 1.4, carbs: 0.5, fiber: 0, cat: '蛋白', alias: ['生猪蹄筋'] },
  { name: '猪里脊(熏烤小里脊)', kcal: 153, protein: 17.7, fat: 3.9, carbs: 11.8, fiber: 0, cat: '蛋白', alias: ['生猪里脊(熏烤小里脊)'] },
  { name: '琼海虾', kcal: 56, protein: 8.9, fat: 1.8, carbs: 0.9, fiber: 0, cat: '蛋白', alias: ['生琼海虾'] },
  { name: '瓦罐鸡汤(汤)', kcal: 27, protein: 1.3, fat: 2.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生瓦罐鸡汤(汤)'] },
  { name: '瓦罐鸡汤(肉)', kcal: 190, protein: 20.9, fat: 9.5, carbs: 5.2, fiber: 0, cat: '蛋白', alias: ['生瓦罐鸡汤(肉)'] },
  { name: '生蚝', kcal: 57, protein: 10.9, fat: 1.5, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生生蚝'] },
  { name: '田螺', kcal: 60, protein: 11.0, fat: 0.2, carbs: 3.6, fiber: 0, cat: '蛋白', alias: ['生田螺'] },
  { name: '甲鱼蛋', kcal: 128, protein: 12.5, fat: 7.3, carbs: 3.0, fiber: 0, cat: '蛋白', alias: ['生甲鱼蛋'] },
  { name: '白姑鱼', kcal: 150, protein: 19.1, fat: 8.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['白米子（鱼）', '生白姑鱼'] },
  { name: '白条鱼(裸鱼)', kcal: 103, protein: 16.6, fat: 3.3, carbs: 1.6, fiber: 0, cat: '蛋白', alias: ['生白条鱼(裸鱼)'] },
  { name: '白米虾', kcal: 81, protein: 17.3, fat: 0.4, carbs: 2.0, fiber: 0, cat: '蛋白', alias: ['水虾米', '生白米虾'] },
  { name: '盐水鸭(熟)', kcal: 313, protein: 16.6, fat: 26.1, carbs: 2.8, fiber: 0, cat: '蛋白', alias: ['生盐水鸭(熟)'] },
  { name: '石斑鱼(红石斑鱼)', kcal: 90, protein: 19.9, fat: 0.4, carbs: 1.6, fiber: 0, cat: '蛋白', alias: ['生石斑鱼(红石斑鱼)'] },
  { name: '石斑鱼(老虎斑)', kcal: 130, protein: 20.2, fat: 4.3, carbs: 2.7, fiber: 0, cat: '蛋白', alias: ['生石斑鱼(老虎斑)'] },
  { name: '石斑鱼(花石斑鱼)', kcal: 95, protein: 20.2, fat: 0.8, carbs: 1.7, fiber: 0, cat: '蛋白', alias: ['生石斑鱼(花石斑鱼)'] },
  { name: '石斑鱼(黑石斑鱼)', kcal: 95, protein: 20.2, fat: 1.2, carbs: 0.9, fiber: 0, cat: '蛋白', alias: ['生石斑鱼(黑石斑鱼)'] },
  { name: '石螺', kcal: 90, protein: 12.8, fat: 0.7, carbs: 8.2, fiber: 0, cat: '蛋白', alias: ['生石螺'] },
  { name: '硬质干酪', kcal: 411, protein: 24.9, fat: 34.5, carbs: 0.1, fiber: 0, cat: '蛋白' },
  { name: '福建式肉松', kcal: 493, protein: 25.1, fat: 26.0, carbs: 39.7, fiber: 0, cat: '蛋白', alias: ['生福建式肉松'] },
  { name: '章鱼', kcal: 135, protein: 18.9, fat: 0.4, carbs: 14.0, fiber: 0, cat: '蛋白', alias: ['八爪鱼', '生章鱼'] },
  { name: '章鱼(章鱼肉)', kcal: 52, protein: 10.6, fat: 0.4, carbs: 1.4, fiber: 0, cat: '蛋白', alias: ['八爪鱼', '生章鱼(章鱼肉)'] },
  { name: '童子鸡(熟)', kcal: 226, protein: 15.8, fat: 18.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生童子鸡(熟)'] },
  { name: '笠鱼', kcal: 97, protein: 22.2, fat: 0.5, carbs: 0.9, fiber: 0, cat: '蛋白', alias: ['生笠鱼'] },
  { name: '箭鱼(炸)', kcal: 271, protein: 20.8, fat: 16.1, carbs: 10.7, fiber: 0, cat: '蛋白', alias: ['生箭鱼(炸)'] },
  { name: '素什锦', kcal: 177, protein: 14.0, fat: 10.2, carbs: 8.3, fiber: 2.0, cat: '蛋白' },
  { name: '素大肠', kcal: 155, protein: 18.1, fat: 3.6, carbs: 13.0, fiber: 1.0, cat: '蛋白' },
  { name: '素火腿', kcal: 213, protein: 19.1, fat: 13.2, carbs: 4.8, fiber: 0.9, cat: '蛋白' },
  { name: '素鸡', kcal: 194, protein: 16.5, fat: 12.5, carbs: 4.2, fiber: 0.9, cat: '蛋白' },
  { name: '素鸡丝卷', kcal: 197, protein: 11.2, fat: 13.7, carbs: 10.1, fiber: 5.6, cat: '蛋白' },
  { name: '紫青低纹鮨(冰鲜)', kcal: 150, protein: 20.5, fat: 7.2, carbs: 0.8, fiber: 0, cat: '蛋白', alias: ['生紫青低纹鮨(冰鲜)'] },
  { name: '红娘鱼', kcal: 105, protein: 18.0, fat: 2.8, carbs: 1.9, fiber: 0, cat: '蛋白', alias: ['翼红娘鱼', '生红娘鱼'] },
  { name: '红果肠', kcal: 260, protein: 10.2, fat: 15.3, carbs: 20.3, fiber: 0, cat: '蛋白', alias: ['生红果肠'] },
  { name: '红螺', kcal: 119, protein: 20.2, fat: 0.9, carbs: 7.6, fiber: 0, cat: '蛋白', alias: ['生红螺'] },
  { name: '红鳍笛鲷', kcal: 134, protein: 20.1, fat: 4.8, carbs: 2.7, fiber: 0, cat: '蛋白', alias: ['红鱼', '生红鳍笛鲷'] },
  { name: '绿鳍马面鲀', kcal: 83, protein: 18.1, fat: 0.6, carbs: 1.2, fiber: 0, cat: '蛋白', alias: ['面包鱼', '橡皮鱼', '生绿鳍马面鲀'] },
  { name: '缢蛏(鲜)', kcal: 73, protein: 8.6, fat: 1.8, carbs: 5.6, fiber: 0, cat: '蛋白', alias: ['生缢蛏(鲜)'] },
  { name: '罗氏沼虾', kcal: 91, protein: 20.6, fat: 0.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生罗氏沼虾'] },
  { name: '罗非鱼', kcal: 98, protein: 18.4, fat: 1.5, carbs: 2.8, fiber: 0, cat: '蛋白', alias: ['生罗非鱼'] },
  { name: '罗非鱼(莫桑比克)', kcal: 77, protein: 16.0, fat: 1.0, carbs: 1.0, fiber: 0, cat: '蛋白', alias: ['非洲黑鲫鱼', '生罗非鱼(莫桑比克)'] },
  { name: '羊乳', kcal: 59, protein: 1.5, fat: 3.5, carbs: 5.4, fiber: 0, cat: '蛋白' },
  { name: '羊大肠', kcal: 75, protein: 13.4, fat: 2.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生羊大肠'] },
  { name: '羊心', kcal: 113, protein: 13.8, fat: 5.5, carbs: 2.0, fiber: 0, cat: '蛋白', alias: ['生羊心'] },
  { name: '羊肉(上脑)', kcal: 94, protein: 19.0, fat: 2.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生羊肉(上脑)'] },
  { name: '羊肉(冻)', kcal: 285, protein: 12.6, fat: 24.4, carbs: 3.8, fiber: 0, cat: '蛋白', alias: ['生羊肉(冻)'] },
  { name: '羊肉(前腿)', kcal: 97, protein: 19.8, fat: 2.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生羊肉(前腿)'] },
  { name: '羊肉(后腿)', kcal: 111, protein: 20.6, fat: 3.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生羊肉(后腿)'] },
  { name: '羊肉(熟)', kcal: 217, protein: 23.2, fat: 13.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生羊肉(熟)'] },
  { name: '羊肉(羊肉手抓)', kcal: 188, protein: 27.3, fat: 8.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生羊肉(羊肉手抓)'] },
  { name: '羊肉(胸脯)', kcal: 133, protein: 19.4, fat: 6.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生羊肉(胸脯)'] },
  { name: '羊肉(腰窝)', kcal: 135, protein: 18.9, fat: 6.6, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生羊肉(腰窝)'] },
  { name: '羊肉(里脊)', kcal: 103, protein: 20.5, fat: 1.6, carbs: 1.6, fiber: 0, cat: '蛋白', alias: ['生羊肉(里脊)'] },
  { name: '羊肉(青羊)', kcal: 99, protein: 21.3, fat: 1.1, carbs: 1.0, fiber: 0, cat: '蛋白', alias: ['生羊肉(青羊)'] },
  { name: '羊肉(颈)', kcal: 135, protein: 21.3, fat: 4.6, carbs: 2.2, fiber: 0, cat: '蛋白', alias: ['生羊肉(颈)'] },
  { name: '羊肉串(炸)', kcal: 217, protein: 18.3, fat: 11.5, carbs: 10.0, fiber: 0, cat: '蛋白', alias: ['生羊肉串(炸)'] },
  { name: '羊肉串(烤)', kcal: 206, protein: 26.0, fat: 10.3, carbs: 2.4, fiber: 0, cat: '蛋白', alias: ['生羊肉串(烤)'] },
  { name: '羊肉串(生)', kcal: 118, protein: 13.0, fat: 4.8, carbs: 5.6, fiber: 0, cat: '蛋白', alias: ['生羊肉串(生)'] },
  { name: '羊肉串(电烤)', kcal: 234, protein: 26.4, fat: 11.6, carbs: 6.0, fiber: 0, cat: '蛋白', alias: ['生羊肉串(电烤)'] },
  { name: '羊肉干', kcal: 588, protein: 28.2, fat: 46.7, carbs: 13.7, fiber: 0, cat: '蛋白', alias: ['生羊肉干'] },
  { name: '羊肉片', kcal: 118, protein: 18.0, fat: 4.0, carbs: 2.4, fiber: 0, cat: '蛋白', alias: ['生羊肉片'] },
  { name: '羊肚', kcal: 87, protein: 12.2, fat: 3.4, carbs: 1.8, fiber: 0, cat: '蛋白', alias: ['生羊肚'] },
  { name: '羊肝', kcal: 134, protein: 17.9, fat: 3.6, carbs: 7.4, fiber: 0, cat: '蛋白', alias: ['生羊肝'] },
  { name: '羊肺', kcal: 96, protein: 16.2, fat: 2.4, carbs: 2.5, fiber: 0, cat: '蛋白', alias: ['生羊肺'] },
  { name: '羊肾', kcal: 96, protein: 16.6, fat: 2.8, carbs: 1.0, fiber: 0, cat: '蛋白', alias: ['生羊肾'] },
  { name: '羊脑', kcal: 142, protein: 11.3, fat: 10.7, carbs: 0.1, fiber: 0, cat: '蛋白', alias: ['生羊脑'] },
  { name: '羊舌', kcal: 225, protein: 19.4, fat: 14.2, carbs: 4.8, fiber: 0, cat: '蛋白', alias: ['生羊舌'] },
  { name: '羊血', kcal: 57, protein: 6.8, fat: 0.2, carbs: 6.9, fiber: 0, cat: '蛋白', alias: ['生羊血'] },
  { name: '羊蹄筋(泡发)', kcal: 41, protein: 8.4, fat: 0.0, carbs: 1.9, fiber: 0, cat: '蛋白', alias: ['生羊蹄筋(泡发)'] },
  { name: '羊蹄筋(生)', kcal: 159, protein: 34.3, fat: 2.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生羊蹄筋(生)'] },
  { name: '翘嘴红鲌(鲜)', kcal: 123, protein: 18.1, fat: 5.6, carbs: 0.1, fiber: 0, cat: '蛋白', alias: ['生翘嘴红鲌(鲜)'] },
  { name: '老年保健肉松', kcal: 458, protein: 35.8, fat: 20.5, carbs: 32.5, fiber: 0, cat: '蛋白', alias: ['生老年保健肉松'] },
  { name: '肉酥', kcal: 509, protein: 30.7, fat: 27.1, carbs: 35.5, fiber: 0, cat: '蛋白', alias: ['生肉酥'] },
  { name: '肉鸡(肥)', kcal: 389, protein: 16.7, fat: 35.4, carbs: 0.9, fiber: 0, cat: '蛋白', alias: ['生肉鸡(肥)'] },
  { name: '胡子鱼(雅江冷水鱼)', kcal: 99, protein: 17.4, fat: 1.3, carbs: 4.4, fiber: 0, cat: '蛋白', alias: ['生胡子鱼(雅江冷水鱼)'] },
  { name: '胡子鲇', kcal: 146, protein: 15.4, fat: 8.0, carbs: 3.1, fiber: 0, cat: '蛋白', alias: ['塘虱（鱼）', '生胡子鲇'] },
  { name: '胭脂鱼(养殖)', kcal: 162, protein: 38.8, fat: 0.6, carbs: 0.4, fiber: 0, cat: '蛋白', alias: ['生胭脂鱼(养殖)'] },
  { name: '脆皮肠', kcal: 302, protein: 16.6, fat: 24.0, carbs: 4.8, fiber: 0, cat: '蛋白', alias: ['生脆皮肠'] },
  { name: '脱脂甜炼乳', kcal: 275, protein: 10.3, fat: 0.2, carbs: 58.0, fiber: 0, cat: '蛋白' },
  { name: '腊羊肉', kcal: 246, protein: 26.1, fat: 10.6, carbs: 11.5, fiber: 0, cat: '蛋白', alias: ['生腊羊肉'] },
  { name: '腊肉(培根)', kcal: 181, protein: 22.3, fat: 9.0, carbs: 2.6, fiber: 0, cat: '蛋白', alias: ['生腊肉(培根)'] },
  { name: '腊肠', kcal: 584, protein: 22.0, fat: 48.3, carbs: 15.3, fiber: 0, cat: '蛋白', alias: ['生腊肠'] },
  { name: '腊鹅', kcal: 410, protein: 24.6, fat: 21.5, carbs: 29.6, fiber: 0, cat: '蛋白', alias: ['生腊鹅'] },
  { name: '腐竹', kcal: 461, protein: 44.6, fat: 21.7, carbs: 22.3, fiber: 1.0, cat: '蛋白' },
  { name: '舌鳎', kcal: 83, protein: 17.7, fat: 1.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['花纹舌头', '舌头鱼', '生舌鳎'] },
  { name: '花骨鱼', kcal: 155, protein: 25.8, fat: 5.6, carbs: 0.4, fiber: 0, cat: '蛋白', alias: ['生花骨鱼'] },
  { name: '苏眉鱼', kcal: 70, protein: 16.5, fat: 0.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生苏眉鱼'] },
  { name: '茶肠', kcal: 329, protein: 9.0, fat: 29.6, carbs: 6.7, fiber: 0, cat: '蛋白', alias: ['生茶肠'] },
  { name: '草鱼', kcal: 113, protein: 16.6, fat: 5.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生草鱼'] },
  { name: '草鱼(熏)', kcal: 283, protein: 24.0, fat: 16.5, carbs: 9.6, fiber: 0, cat: '蛋白', alias: ['生草鱼(熏)'] },
  { name: '荷包蛋(油煎)', kcal: 195, protein: 13.5, fat: 15.0, carbs: 1.4, fiber: 0, cat: '蛋白' },
  { name: '荷包蛋(煮)', kcal: 155, protein: 12.3, fat: 11.7, carbs: 0.2, fiber: 0, cat: '蛋白' },
  { name: '蒜肠', kcal: 309, protein: 7.5, fat: 25.4, carbs: 12.7, fiber: 0, cat: '蛋白', alias: ['生蒜肠'] },
  { name: '蓝鳃太阳鱼', kcal: 93, protein: 17.8, fat: 2.3, carbs: 0.3, fiber: 0, cat: '蛋白', alias: ['生蓝鳃太阳鱼'] },
  { name: '虾仁', kcal: 199, protein: 20.8, fat: 0.6, carbs: 27.7, fiber: 0, cat: '蛋白', alias: ['生虾仁'] },
  { name: '虾仁(红)', kcal: 48, protein: 10.4, fat: 0.7, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生虾仁(红)'] },
  { name: '虾仁肉丸', kcal: 152, protein: 4.6, fat: 7.4, carbs: 16.7, fiber: 0, cat: '蛋白', alias: ['生虾仁肉丸'] },
  { name: '虾皮', kcal: 153, protein: 30.7, fat: 2.2, carbs: 2.5, fiber: 0, cat: '蛋白', alias: ['生虾皮'] },
  { name: '虾米', kcal: 198, protein: 43.7, fat: 2.6, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['海米', '虾仁', '生虾米'] },
  { name: '虾脑酱', kcal: 100, protein: 15.2, fat: 4.3, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生虾脑酱'] },
  { name: '虾虎', kcal: 81, protein: 11.6, fat: 1.7, carbs: 4.8, fiber: 0, cat: '蛋白', alias: ['生虾虎'] },
  { name: '虾酱', kcal: 112, protein: 10.8, fat: 7.6, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生虾酱'] },
  { name: '蛇鲻', kcal: 122, protein: 20.8, fat: 4.2, carbs: 0.3, fiber: 0, cat: '蛋白', alias: ['沙梭鱼', '生蛇鲻'] },
  { name: '蛋清肠', kcal: 278, protein: 12.5, fat: 22.8, carbs: 5.8, fiber: 0, cat: '蛋白', alias: ['生蛋清肠'] },
  { name: '蛏子', kcal: 40, protein: 7.3, fat: 0.3, carbs: 2.1, fiber: 0, cat: '蛋白', alias: ['生蛏子'] },
  { name: '蛏子(焯)', kcal: 67, protein: 13.5, fat: 0.9, carbs: 1.1, fiber: 0, cat: '蛋白', alias: ['生蛏子(焯)'] },
  { name: '蛏干', kcal: 340, protein: 46.5, fat: 4.9, carbs: 27.4, fiber: 0, cat: '蛋白', alias: ['蛏子缢', '蛏青子', '生蛏干'] },
  { name: '蛤蜊', kcal: 62, protein: 10.1, fat: 1.1, carbs: 2.8, fiber: 0, cat: '蛋白', alias: ['生蛤蜊'] },
  { name: '蛤蜊(杂色蛤蜊)', kcal: 53, protein: 7.5, fat: 2.2, carbs: 0.7, fiber: 0, cat: '蛋白', alias: ['生蛤蜊(杂色蛤蜊)'] },
  { name: '蛤蜊(毛蛤蜊)', kcal: 97, protein: 15.0, fat: 1.0, carbs: 7.1, fiber: 0, cat: '蛋白', alias: ['生蛤蜊(毛蛤蜊)'] },
  { name: '蛤蜊(沙蛤蜊)', kcal: 56, protein: 8.9, fat: 1.9, carbs: 0.8, fiber: 0, cat: '蛋白', alias: ['生蛤蜊(沙蛤蜊)'] },
  { name: '蛤蜊(秋蛤蜊)', kcal: 89, protein: 15.6, fat: 0.7, carbs: 5.0, fiber: 0, cat: '蛋白', alias: ['生蛤蜊(秋蛤蜊)'] },
  { name: '蛤蜊(花蛤蜊)', kcal: 45, protein: 7.7, fat: 0.6, carbs: 2.2, fiber: 0, cat: '蛋白', alias: ['生蛤蜊(花蛤蜊)'] },
  { name: '蝲蛄', kcal: 77, protein: 16.0, fat: 1.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['刺蛄', '大头虾', '生蝲蛄'] },
  { name: '螯虾', kcal: 93, protein: 14.8, fat: 3.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生螯虾'] },
  { name: '螺', kcal: 100, protein: 15.7, fat: 1.2, carbs: 6.6, fiber: 0, cat: '蛋白', alias: ['生螺'] },
  { name: '螺蛳', kcal: 59, protein: 7.5, fat: 0.6, carbs: 6.0, fiber: 0, cat: '蛋白', alias: ['生螺蛳'] },
  { name: '蟹肉', kcal: 62, protein: 11.6, fat: 1.2, carbs: 1.1, fiber: 0, cat: '蛋白', alias: ['生蟹肉'] },
  { name: '蟹足棒', kcal: 123, protein: 9.0, fat: 0.6, carbs: 20.5, fiber: 0, cat: '蛋白', alias: ['生蟹足棒'] },
  { name: '血蚶(鲜)', kcal: 51, protein: 8.2, fat: 0.5, carbs: 3.3, fiber: 0, cat: '蛋白', alias: ['生血蚶(鲜)'] },
  { name: '豆奶', kcal: 30, protein: 2.4, fat: 1.5, carbs: 1.8, fiber: 0, cat: '蛋白', alias: ['豆乳'] },
  { name: '豆汁(生)', kcal: 10, protein: 0.9, fat: 0.1, carbs: 1.4, fiber: 0.1, cat: '蛋白' },
  { name: '豆浆', kcal: 31, protein: 3.0, fat: 1.6, carbs: 1.2, fiber: 0, cat: '蛋白' },
  { name: '豆浆(甜)', kcal: 34, protein: 2.4, fat: 0.5, carbs: 4.9, fiber: 0.1, cat: '蛋白' },
  { name: '豆浆粉', kcal: 426, protein: 19.7, fat: 9.4, carbs: 66.8, fiber: 2.2, cat: '蛋白' },
  { name: '豆肝尖', kcal: 203, protein: 17.2, fat: 12.0, carbs: 9.4, fiber: 5.7, cat: '蛋白' },
  { name: '豆腐(内酯)', kcal: 50, protein: 5.0, fat: 1.9, carbs: 3.3, fiber: 0.4, cat: '蛋白' },
  { name: '豆腐(北豆腐)', kcal: 116, protein: 9.2, fat: 8.1, carbs: 3.0, fiber: 0, cat: '蛋白' },
  { name: '豆腐(南豆腐)', kcal: 87, protein: 5.7, fat: 5.8, carbs: 3.9, fiber: 0, cat: '蛋白' },
  { name: '豆腐丝', kcal: 203, protein: 21.5, fat: 10.5, carbs: 6.2, fiber: 1.1, cat: '蛋白' },
  { name: '豆腐丝(干)', kcal: 451, protein: 57.7, fat: 22.8, carbs: 3.7, fiber: 0, cat: '蛋白' },
  { name: '豆腐丝(油)', kcal: 304, protein: 24.2, fat: 17.1, carbs: 14.5, fiber: 2.2, cat: '蛋白' },
  { name: '豆腐卷', kcal: 203, protein: 17.9, fat: 11.6, carbs: 7.2, fiber: 1.0, cat: '蛋白' },
  { name: '豆腐干(卤干)', kcal: 339, protein: 14.5, fat: 16.7, carbs: 33.4, fiber: 1.6, cat: '蛋白' },
  { name: '豆腐干(小香干)', kcal: 174, protein: 17.9, fat: 9.1, carbs: 5.4, fiber: 0.4, cat: '蛋白' },
  { name: '豆腐干(熏干)', kcal: 154, protein: 15.8, fat: 6.2, carbs: 8.8, fiber: 0.3, cat: '蛋白' },
  { name: '豆腐干(臭干)', kcal: 99, protein: 10.2, fat: 4.6, carbs: 4.5, fiber: 0.4, cat: '蛋白' },
  { name: '豆腐干(菜干)', kcal: 137, protein: 13.4, fat: 7.1, carbs: 5.0, fiber: 0.3, cat: '蛋白' },
  { name: '豆腐干(蒲包干)', kcal: 135, protein: 12.1, fat: 5.7, carbs: 8.9, fiber: 0, cat: '蛋白' },
  { name: '豆腐干(酱油干)', kcal: 157, protein: 14.9, fat: 9.1, carbs: 4.0, fiber: 0.3, cat: '蛋白' },
  { name: '豆腐干(香干)', kcal: 152, protein: 15.8, fat: 7.8, carbs: 5.1, fiber: 0.8, cat: '蛋白' },
  { name: '豆腐脑', kcal: 15, protein: 1.9, fat: 0.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['老豆腐'] },
  { name: '豆腐花', kcal: 401, protein: 10.0, fat: 2.6, carbs: 84.3, fiber: 0, cat: '蛋白', alias: ['豆腐粉'] },
  { name: '贻贝(干)', kcal: 355, protein: 47.8, fat: 9.3, carbs: 20.1, fiber: 0, cat: '蛋白', alias: ['淡菜', '壳菜', '生贻贝(干)'] },
  { name: '贻贝(鲜)', kcal: 80, protein: 11.4, fat: 1.7, carbs: 4.7, fiber: 0, cat: '蛋白', alias: ['淡菜', '壳菜', '生贻贝(鲜)'] },
  { name: '赤眼鳟', kcal: 109, protein: 18.1, fat: 4.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['金目鱼', '生赤眼鳟'] },
  { name: '赤贝', kcal: 61, protein: 13.9, fat: 0.6, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生赤贝'] },
  { name: '酥油', kcal: 860, protein: 1.5, fat: 94.4, carbs: 1.1, fiber: 0, cat: '蛋白' },
  { name: '酥油茶(原味)', kcal: 465, protein: 3.0, fat: 17.7, carbs: 73.3, fiber: 0, cat: '蛋白' },
  { name: '酱排骨', kcal: 366, protein: 21.7, fat: 26.7, carbs: 9.6, fiber: 0, cat: '蛋白', alias: ['生酱排骨'] },
  { name: '酱汁肉', kcal: 549, protein: 15.5, fat: 50.4, carbs: 8.4, fiber: 0, cat: '蛋白', alias: ['生酱汁肉'] },
  { name: '酱牛肉', kcal: 246, protein: 31.4, fat: 11.9, carbs: 3.2, fiber: 0, cat: '蛋白', alias: ['生酱牛肉'] },
  { name: '酱肘子', kcal: 202, protein: 29.6, fat: 8.5, carbs: 1.8, fiber: 0, cat: '蛋白', alias: ['生酱肘子'] },
  { name: '酱鸭', kcal: 266, protein: 18.9, fat: 18.4, carbs: 6.3, fiber: 0, cat: '蛋白', alias: ['生酱鸭'] },
  { name: '酸奶', kcal: 70, protein: 3.2, fat: 1.9, carbs: 10.0, fiber: 0, cat: '蛋白' },
  { name: '酸奶(低脂)', kcal: 64, protein: 2.7, fat: 1.9, carbs: 9.0, fiber: 0, cat: '蛋白' },
  { name: '酸奶(果料)', kcal: 67, protein: 3.1, fat: 1.4, carbs: 10.4, fiber: 0, cat: '蛋白' },
  { name: '酸奶(果粒)', kcal: 98, protein: 3.3, fat: 2.9, carbs: 14.6, fiber: 0, cat: '蛋白' },
  { name: '酸奶(脱脂)', kcal: 57, protein: 3.3, fat: 0.4, carbs: 10.0, fiber: 0, cat: '蛋白' },
  { name: '酸奶(调味)', kcal: 88, protein: 3.0, fat: 3.2, carbs: 11.9, fiber: 0, cat: '蛋白' },
  { name: '酸奶(高蛋白)', kcal: 62, protein: 3.2, fat: 2.2, carbs: 7.3, fiber: 0, cat: '蛋白' },
  { name: '酸奶疙瘩(新鲜)', kcal: 275, protein: 18.6, fat: 16.8, carbs: 12.4, fiber: 0, cat: '蛋白' },
  { name: '酸豆奶', kcal: 67, protein: 2.2, fat: 1.2, carbs: 11.8, fiber: 0, cat: '蛋白' },
  { name: '酸酪蛋', kcal: 443, protein: 40.4, fat: 20.4, carbs: 24.4, fiber: 0, cat: '蛋白' },
  { name: '野山鸡', kcal: 126, protein: 20.4, fat: 2.0, carbs: 6.6, fiber: 0, cat: '蛋白', alias: ['生野山鸡'] },
  { name: '金华火腿', kcal: 318, protein: 16.4, fat: 28.0, carbs: 0.1, fiber: 0, cat: '蛋白', alias: ['生金华火腿'] },
  { name: '金枪鱼(油浸)', kcal: 189, protein: 27.1, fat: 9.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生金枪鱼(油浸)'] },
  { name: '金枪鱼(盐水浸)', kcal: 99, protein: 23.5, fat: 0.6, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生金枪鱼(盐水浸)'] },
  { name: '金枪鱼肉', kcal: 102, protein: 23.7, fat: 0.3, carbs: 1.1, fiber: 0, cat: '蛋白', alias: ['生金枪鱼肉'] },
  { name: '金线鱼', kcal: 101, protein: 18.6, fat: 2.9, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['红三鱼', '生金线鱼'] },
  { name: '金鰉鱼', kcal: 99, protein: 18.7, fat: 2.7, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生金鰉鱼'] },
  { name: '钳鱼', kcal: 212, protein: 29.2, fat: 10.3, carbs: 0.7, fiber: 0, cat: '蛋白', alias: ['生钳鱼'] },
  { name: '银蚶', kcal: 71, protein: 12.2, fat: 1.4, carbs: 2.3, fiber: 0, cat: '蛋白', alias: ['蚶子', '生银蚶'] },
  { name: '银鱼', kcal: 105, protein: 17.2, fat: 4.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['面条鱼', '生银鱼'] },
  { name: '锯缘青蟹', kcal: 80, protein: 14.6, fat: 1.6, carbs: 1.7, fiber: 0, cat: '蛋白', alias: ['青蟹', '生锯缘青蟹'] },
  { name: '长毛对虾', kcal: 90, protein: 18.5, fat: 0.4, carbs: 3.0, fiber: 0, cat: '蛋白', alias: ['大虾', '白露虾', '生长毛对虾'] },
  { name: '雅鱼', kcal: 131, protein: 26.5, fat: 2.7, carbs: 0.1, fiber: 0, cat: '蛋白', alias: ['生雅鱼'] },
  { name: '青虾', kcal: 100, protein: 23.8, fat: 0.4, carbs: 0.2, fiber: 0, cat: '蛋白', alias: ['生青虾'] },
  { name: '青衣(孔雀绿色)', kcal: 82, protein: 19.2, fat: 0.3, carbs: 0.6, fiber: 0, cat: '蛋白', alias: ['生青衣(孔雀绿色)'] },
  { name: '青衣(红色)', kcal: 84, protein: 20.1, fat: 0.3, carbs: 0.2, fiber: 0, cat: '蛋白', alias: ['生青衣(红色)'] },
  { name: '青豆(干)', kcal: 398, protein: 34.5, fat: 16.0, carbs: 35.4, fiber: 12.6, cat: '蛋白', alias: ['青大豆'] },
  { name: '青鱼', kcal: 118, protein: 20.1, fat: 4.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['青皮鱼', '青鳞鱼', '青混', '生青鱼'] },
  { name: '颚针鱼', kcal: 180, protein: 20.2, fat: 10.4, carbs: 1.4, fiber: 0, cat: '蛋白', alias: ['针量鱼', '生颚针鱼'] },
  { name: '风干肉(藏香猪)', kcal: 598, protein: 27.1, fat: 53.6, carbs: 1.7, fiber: 0, cat: '蛋白', alias: ['生风干肉(藏香猪)'] },
  { name: '风干肠', kcal: 283, protein: 12.4, fat: 23.3, carbs: 5.9, fiber: 0, cat: '蛋白', alias: ['生风干肠'] },
  { name: '香海螺', kcal: 163, protein: 22.7, fat: 3.5, carbs: 10.1, fiber: 0, cat: '蛋白', alias: ['生香海螺'] },
  { name: '香肠', kcal: 508, protein: 24.1, fat: 40.7, carbs: 11.2, fiber: 0, cat: '蛋白', alias: ['生香肠'] },
  { name: '骆驼掌', kcal: 310, protein: 72.8, fat: 2.0, carbs: 0.3, fiber: 0, cat: '蛋白', alias: ['生骆驼掌'] },
  { name: '骆驼蹄', kcal: 116, protein: 25.6, fat: 1.4, carbs: 0.2, fiber: 0, cat: '蛋白', alias: ['生骆驼蹄'] },
  { name: '鮟鱇鱼', kcal: 60, protein: 13.7, fat: 0.6, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生鮟鱇鱼'] },
  { name: '鮰鱼', kcal: 143, protein: 14.8, fat: 4.5, carbs: 10.8, fiber: 0, cat: '蛋白', alias: ['生鮰鱼'] },
  { name: '鮸鱼', kcal: 89, protein: 20.2, fat: 0.9, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['鳘鱼', '生鮸鱼'] },
  { name: '鱼丸', kcal: 107, protein: 11.1, fat: 1.3, carbs: 12.7, fiber: 0, cat: '蛋白', alias: ['生鱼丸'] },
  { name: '鱼奇油', kcal: 47, protein: 11.2, fat: 0.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['鱼露', '虾油', '生鱼奇油'] },
  { name: '鱼子酱', kcal: 201, protein: 9.6, fat: 7.1, carbs: 24.7, fiber: 0, cat: '蛋白', alias: ['生鱼子酱'] },
  { name: '鱼排', kcal: 160, protein: 10.1, fat: 2.4, carbs: 24.5, fiber: 0, cat: '蛋白', alias: ['生鱼排'] },
  { name: '鱼片干', kcal: 303, protein: 46.1, fat: 3.4, carbs: 22.0, fiber: 0, cat: '蛋白', alias: ['生鱼片干'] },
  { name: '鱿鱼(水浸)', kcal: 75, protein: 17.0, fat: 0.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生鱿鱼(水浸)'] },
  { name: '鲅鱼', kcal: 121, protein: 21.2, fat: 3.1, carbs: 2.1, fiber: 0, cat: '蛋白', alias: ['马鲛鱼', '燕鲅鱼', '巴鱼', '生鲅鱼'] },
  { name: '鲅鱼(咸)', kcal: 157, protein: 23.3, fat: 1.6, carbs: 12.4, fiber: 0, cat: '蛋白', alias: ['咸马胶', '生鲅鱼(咸)'] },
  { name: '鲅鱼肉', kcal: 102, protein: 23.7, fat: 0.3, carbs: 1.0, fiber: 0, cat: '蛋白', alias: ['马鲛鱼肉', '生鲅鱼肉'] },
  { name: '鲆', kcal: 112, protein: 20.8, fat: 3.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['片口鱼', '比目鱼', '生鲆'] },
  { name: '鲇鱼', kcal: 103, protein: 17.3, fat: 3.7, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['胡子鲇', '鲢胡', '旺虾', '生鲇鱼'] },
  { name: '鲈鱼', kcal: 105, protein: 18.6, fat: 3.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['鲈花', '生鲈鱼'] },
  { name: '鲍鱼', kcal: 84, protein: 12.6, fat: 0.8, carbs: 6.6, fiber: 0, cat: '蛋白', alias: ['杂色鲍', '生鲍鱼'] },
  { name: '鲍鱼(干)', kcal: 322, protein: 54.1, fat: 5.6, carbs: 13.7, fiber: 0, cat: '蛋白', alias: ['生鲍鱼(干)'] },
  { name: '鲍鱼(皱纹鲍)', kcal: 75, protein: 13.7, fat: 0.1, carbs: 4.8, fiber: 0, cat: '蛋白', alias: ['生鲍鱼(皱纹鲍)'] },
  { name: '鲐鱼', kcal: 155, protein: 19.9, fat: 7.4, carbs: 2.2, fiber: 0, cat: '蛋白', alias: ['青鲐鱼', '鲐巴鱼', '青砖鱼', '生鲐鱼'] },
  { name: '鲑鱼', kcal: 139, protein: 17.2, fat: 7.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['大马哈鱼', '三文鱼', '生鲑鱼'] },
  { name: '鲑鱼籽酱', kcal: 252, protein: 10.9, fat: 16.8, carbs: 14.4, fiber: 0, cat: '蛋白', alias: ['大马哈鱼籽酱', '三文鱼籽酱', '生鲑鱼籽酱'] },
  { name: '鲒花', kcal: 117, protein: 15.6, fat: 6.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生鲒花'] },
  { name: '鲚鱼(大)', kcal: 106, protein: 13.2, fat: 5.5, carbs: 0.8, fiber: 0, cat: '蛋白', alias: ['大凤尾鱼', '生鲚鱼(大)'] },
  { name: '鲚鱼(小)', kcal: 124, protein: 15.5, fat: 5.1, carbs: 4.0, fiber: 0, cat: '蛋白', alias: ['小凤尾鱼', '生鲚鱼(小)'] },
  { name: '鲜贝', kcal: 77, protein: 15.7, fat: 0.5, carbs: 2.5, fiber: 0, cat: '蛋白', alias: ['生鲜贝'] },
  { name: '鲜驴奶', kcal: 33, protein: 0.4, fat: 0.6, carbs: 6.5, fiber: 0, cat: '蛋白' },
  { name: '鲜驴奶(冻)', kcal: 41, protein: 0.5, fat: 1.2, carbs: 7.0, fiber: 0, cat: '蛋白' },
  { name: '鲜驼奶', kcal: 72, protein: 3.7, fat: 3.5, carbs: 6.5, fiber: 0, cat: '蛋白' },
  { name: '鲜驼奶(冻)', kcal: 86, protein: 3.6, fat: 3.5, carbs: 9.9, fiber: 0, cat: '蛋白' },
  { name: '鲟鱼', kcal: 100, protein: 23.4, fat: 0.4, carbs: 0.6, fiber: 0, cat: '蛋白', alias: ['生鲟鱼'] },
  { name: '鲢鱼', kcal: 104, protein: 17.8, fat: 3.6, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['白鲢', '胖子', '连子鱼', '生鲢鱼'] },
  { name: '鲤鱼', kcal: 109, protein: 17.6, fat: 4.1, carbs: 0.5, fiber: 0, cat: '蛋白', alias: ['鲤拐子', '生鲤鱼'] },
  { name: '鲥鱼', kcal: 189, protein: 20.8, fat: 11.3, carbs: 0.9, fiber: 0, cat: '蛋白', alias: ['生鲥鱼'] },
  { name: '鲫鱼', kcal: 108, protein: 17.1, fat: 2.7, carbs: 3.8, fiber: 0, cat: '蛋白', alias: ['喜头鱼', '海附鱼', '生鲫鱼'] },
  { name: '鲭鱼', kcal: 413, protein: 14.4, fat: 39.4, carbs: 0.2, fiber: 0, cat: '蛋白', alias: ['生鲭鱼'] },
  { name: '鲭鱼(炸)', kcal: 550, protein: 17.2, fat: 53.4, carbs: 0.1, fiber: 0, cat: '蛋白', alias: ['生鲭鱼(炸)'] },
  { name: '鲭鱼(煮)', kcal: 372, protein: 14.9, fat: 34.5, carbs: 0.4, fiber: 0, cat: '蛋白', alias: ['生鲭鱼(煮)'] },
  { name: '鲭鱼(蒸)', kcal: 390, protein: 14.6, fat: 36.5, carbs: 0.7, fiber: 0, cat: '蛋白', alias: ['生鲭鱼(蒸)'] },
  { name: '鲮鱼', kcal: 95, protein: 18.4, fat: 2.1, carbs: 0.7, fiber: 0, cat: '蛋白', alias: ['雪鲮', '生鲮鱼'] },
  { name: '鲳鱼(银鲳鱼)', kcal: 140, protein: 18.5, fat: 7.3, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['平鱼', '生鲳鱼(银鲳鱼)'] },
  { name: '鲷', kcal: 106, protein: 17.9, fat: 2.6, carbs: 2.7, fiber: 0, cat: '蛋白', alias: ['黑鲷', '铜盆鱼', '大目鱼', '生鲷'] },
  { name: '鲹鱼', kcal: 124, protein: 18.5, fat: 3.4, carbs: 4.8, fiber: 0, cat: '蛋白', alias: ['蓝圆鲹', '边鱼', '生鲹鱼'] },
  { name: '鲻鱼', kcal: 119, protein: 18.9, fat: 4.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['白眼棱鱼', '生鲻鱼'] },
  { name: '鲽', kcal: 107, protein: 21.1, fat: 2.3, carbs: 0.5, fiber: 0, cat: '蛋白', alias: ['比目鱼', '凸眼鱼', '生鲽'] },
  { name: '鳊鱼', kcal: 135, protein: 18.3, fat: 6.3, carbs: 1.2, fiber: 0, cat: '蛋白', alias: ['鲂鱼', '武昌鱼', '生鳊鱼'] },
  { name: '鳐鱼', kcal: 90, protein: 20.8, fat: 0.7, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['夫鱼', '生鳐鱼'] },
  { name: '鳓鱼', kcal: 159, protein: 20.7, fat: 8.5, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['快鱼', '力鱼', '生鳓鱼'] },
  { name: '鳕鱼(炸)', kcal: 241, protein: 12.4, fat: 14.3, carbs: 15.6, fiber: 0, cat: '蛋白', alias: ['生鳕鱼(炸)'] },
  { name: '鳕鱼(烤)', kcal: 96, protein: 21.4, fat: 1.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生鳕鱼(烤)'] },
  { name: '鳗鱼(红烧)', kcal: 211, protein: 21.3, fat: 9.8, carbs: 9.5, fiber: 0, cat: '蛋白', alias: ['生鳗鱼(红烧)'] },
  { name: '鳗鲡', kcal: 181, protein: 18.6, fat: 10.8, carbs: 2.3, fiber: 0, cat: '蛋白', alias: ['鳗鱼', '河鳗', '生鳗鲡'] },
  { name: '鳙鱼', kcal: 100, protein: 15.3, fat: 2.2, carbs: 4.7, fiber: 0, cat: '蛋白', alias: ['胖头鱼', '摆佳鱼', '花鲢鱼', '生鳙鱼'] },
  { name: '鳜鱼', kcal: 117, protein: 19.9, fat: 4.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['桂鱼', '花鲫鱼', '生鳜鱼'] },
  { name: '鳟鱼', kcal: 99, protein: 18.6, fat: 2.6, carbs: 0.2, fiber: 0, cat: '蛋白', alias: ['红鳟鱼', '生鳟鱼'] },
  { name: '鳡鱼', kcal: 114, protein: 17.5, fat: 4.3, carbs: 1.2, fiber: 0, cat: '蛋白', alias: ['猴鱼', '生鳡鱼'] },
  { name: '鸡', kcal: 145, protein: 20.3, fat: 6.7, carbs: 0.9, fiber: 0, cat: '蛋白', alias: ['生鸡'] },
  { name: '鸡(乌骨鸡)', kcal: 111, protein: 22.3, fat: 2.3, carbs: 0.3, fiber: 0, cat: '蛋白', alias: ['生鸡(乌骨鸡)'] },
  { name: '鸡块(带浆粉)', kcal: 206, protein: 12.2, fat: 9.1, carbs: 18.8, fiber: 0, cat: '蛋白', alias: ['生鸡块(带浆粉)'] },
  { name: '鸡心', kcal: 172, protein: 15.9, fat: 11.8, carbs: 0.6, fiber: 0, cat: '蛋白', alias: ['生鸡心'] },
  { name: '鸡爪', kcal: 254, protein: 23.9, fat: 16.4, carbs: 2.7, fiber: 0, cat: '蛋白', alias: ['生鸡爪'] },
  { name: '鸡翅', kcal: 202, protein: 19.0, fat: 11.5, carbs: 5.5, fiber: 0, cat: '蛋白', alias: ['生鸡翅'] },
  { name: '鸡肉松', kcal: 440, protein: 7.2, fat: 16.4, carbs: 65.8, fiber: 0, cat: '蛋白', alias: ['生鸡肉松'] },
  { name: '鸡肝', kcal: 121, protein: 16.6, fat: 4.8, carbs: 2.8, fiber: 0, cat: '蛋白', alias: ['生鸡肝'] },
  { name: '鸡肝(肉鸡)', kcal: 121, protein: 16.7, fat: 4.5, carbs: 3.5, fiber: 0, cat: '蛋白', alias: ['生鸡肝(肉鸡)'] },
  { name: '鸡肫', kcal: 118, protein: 19.2, fat: 2.8, carbs: 4.0, fiber: 0, cat: '蛋白', alias: ['鸡胗', '生鸡肫'] },
  { name: '鸡胸脯肉', kcal: 118, protein: 24.6, fat: 1.9, carbs: 0.6, fiber: 0, cat: '蛋白', alias: ['生鸡胸脯肉'] },
  { name: '鸡腿', kcal: 146, protein: 20.2, fat: 7.2, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生鸡腿'] },
  { name: '鸡蛋(土鸡)', kcal: 138, protein: 14.4, fat: 6.4, carbs: 5.6, fiber: 0, cat: '蛋白' },
  { name: '鸡蛋(煮)', kcal: 143, protein: 12.1, fat: 10.5, carbs: 0.1, fiber: 0, cat: '蛋白' },
  { name: '鸡蛋(白皮)', kcal: 138, protein: 12.7, fat: 9.0, carbs: 1.5, fiber: 0, cat: '蛋白' },
  { name: '鸡蛋(红皮)', kcal: 143, protein: 12.2, fat: 10.5, carbs: 0.0, fiber: 0, cat: '蛋白' },
  { name: '鸡蛋(藏鸡蛋)', kcal: 162, protein: 12.6, fat: 11.3, carbs: 2.4, fiber: 0, cat: '蛋白' },
  { name: '鸡蛋白(乌骨鸡)', kcal: 44, protein: 9.8, fat: 0.1, carbs: 1.0, fiber: 0, cat: '蛋白' },
  { name: '鸡蛋粉', kcal: 545, protein: 43.4, fat: 36.2, carbs: 11.3, fiber: 0, cat: '蛋白', alias: ['全蛋粉'] },
  { name: '鸡蛋黄', kcal: 328, protein: 15.2, fat: 28.2, carbs: 3.4, fiber: 0, cat: '蛋白' },
  { name: '鸡蛋黄(乌骨鸡)', kcal: 263, protein: 15.2, fat: 19.9, carbs: 5.7, fiber: 0, cat: '蛋白' },
  { name: '鸡蛋黄粉', kcal: 644, protein: 31.6, fat: 55.1, carbs: 5.3, fiber: 0, cat: '蛋白' },
  { name: '鸡血', kcal: 49, protein: 7.8, fat: 0.2, carbs: 4.1, fiber: 0, cat: '蛋白', alias: ['生鸡血'] },
  { name: '鸭', kcal: 240, protein: 15.5, fat: 19.7, carbs: 0.2, fiber: 0, cat: '蛋白', alias: ['生鸭'] },
  { name: '鸭心', kcal: 143, protein: 12.8, fat: 8.9, carbs: 2.9, fiber: 0, cat: '蛋白', alias: ['生鸭心'] },
  { name: '鸭掌', kcal: 150, protein: 26.9, fat: 1.9, carbs: 6.2, fiber: 0, cat: '蛋白', alias: ['生鸭掌'] },
  { name: '鸭皮', kcal: 538, protein: 6.5, fat: 50.2, carbs: 15.1, fiber: 0, cat: '蛋白', alias: ['生鸭皮'] },
  { name: '鸭翅', kcal: 146, protein: 16.5, fat: 6.1, carbs: 6.3, fiber: 0, cat: '蛋白', alias: ['生鸭翅'] },
  { name: '鸭肝', kcal: 128, protein: 14.5, fat: 7.5, carbs: 0.5, fiber: 0, cat: '蛋白', alias: ['生鸭肝'] },
  { name: '鸭肝(公麻鸭)', kcal: 136, protein: 14.7, fat: 4.1, carbs: 10.1, fiber: 0, cat: '蛋白', alias: ['生鸭肝(公麻鸭)'] },
  { name: '鸭肝(母麻鸭)', kcal: 113, protein: 16.8, fat: 2.5, carbs: 5.9, fiber: 0, cat: '蛋白', alias: ['生鸭肝(母麻鸭)'] },
  { name: '鸭肠', kcal: 129, protein: 14.2, fat: 7.8, carbs: 0.4, fiber: 0, cat: '蛋白', alias: ['生鸭肠'] },
  { name: '鸭肫', kcal: 92, protein: 17.9, fat: 1.3, carbs: 2.1, fiber: 0, cat: '蛋白', alias: ['生鸭肫'] },
  { name: '鸭肫(公麻鸭)', kcal: 112, protein: 19.8, fat: 1.2, carbs: 5.4, fiber: 0, cat: '蛋白', alias: ['生鸭肫(公麻鸭)'] },
  { name: '鸭肫(母麻鸭)', kcal: 126, protein: 20.4, fat: 4.2, carbs: 1.6, fiber: 0, cat: '蛋白', alias: ['生鸭肫(母麻鸭)'] },
  { name: '鸭胰', kcal: 117, protein: 21.7, fat: 2.9, carbs: 1.0, fiber: 0, cat: '蛋白', alias: ['生鸭胰'] },
  { name: '鸭胸脯肉', kcal: 90, protein: 15.0, fat: 1.5, carbs: 4.0, fiber: 0, cat: '蛋白', alias: ['生鸭胸脯肉'] },
  { name: '鸭舌', kcal: 245, protein: 16.6, fat: 19.7, carbs: 0.4, fiber: 0, cat: '蛋白', alias: ['鸭条', '生鸭舌'] },
  { name: '鸭蛋', kcal: 180, protein: 12.6, fat: 13.0, carbs: 3.1, fiber: 0, cat: '蛋白' },
  { name: '鸭蛋黄', kcal: 378, protein: 14.5, fat: 33.8, carbs: 4.0, fiber: 0, cat: '蛋白' },
  { name: '鸭血(公麻鸭)', kcal: 56, protein: 13.2, fat: 0.4, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生鸭血(公麻鸭)'] },
  { name: '鸭血(母麻鸭)', kcal: 55, protein: 13.1, fat: 0.3, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生鸭血(母麻鸭)'] },
  { name: '鸭血(白鸭)', kcal: 108, protein: 13.6, fat: 0.4, carbs: 12.4, fiber: 0, cat: '蛋白', alias: ['生鸭血(白鸭)'] },
  { name: '鸭豉片', kcal: 603, protein: 18.3, fat: 56.1, carbs: 6.1, fiber: 0, cat: '蛋白', alias: ['生鸭豉片'] },
  { name: '鸽', kcal: 201, protein: 16.5, fat: 14.2, carbs: 1.7, fiber: 0, cat: '蛋白', alias: ['生鸽'] },
  { name: '鹅', kcal: 251, protein: 17.9, fat: 19.9, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生鹅'] },
  { name: '鹅肝', kcal: 129, protein: 15.2, fat: 3.4, carbs: 9.3, fiber: 0, cat: '蛋白', alias: ['生鹅肝'] },
  { name: '鹅肫', kcal: 100, protein: 19.6, fat: 1.9, carbs: 1.1, fiber: 0, cat: '蛋白', alias: ['生鹅肫'] },
  { name: '鹅蛋', kcal: 196, protein: 11.1, fat: 15.6, carbs: 2.8, fiber: 0, cat: '蛋白' },
  { name: '鹅蛋(煮)', kcal: 177, protein: 12.7, fat: 13.6, carbs: 1.0, fiber: 0, cat: '蛋白' },
  { name: '鹅蛋黄', kcal: 324, protein: 15.5, fat: 26.4, carbs: 6.2, fiber: 0, cat: '蛋白' },
  { name: '鹅血', kcal: 74, protein: 18.6, fat: 0.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生鹅血'] },
  { name: '鹌鹑', kcal: 110, protein: 20.2, fat: 3.1, carbs: 0.2, fiber: 0, cat: '蛋白', alias: ['生鹌鹑'] },
  { name: '鹌鹑蛋', kcal: 160, protein: 12.8, fat: 11.1, carbs: 2.1, fiber: 0, cat: '蛋白' },
  { name: '黄姑鱼', kcal: 137, protein: 18.4, fat: 7.0, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['黄婆鸡', '生黄姑鱼'] },
  { name: '黄姑鱼(鲜)', kcal: 88, protein: 14.7, fat: 0.7, carbs: 5.6, fiber: 0, cat: '蛋白', alias: ['生黄姑鱼(鲜)'] },
  { name: '黄油', kcal: 888, protein: 1.4, fat: 98.0, carbs: 0.0, fiber: 0, cat: '蛋白' },
  { name: '黄油渣', kcal: 599, protein: 11.1, fat: 43.8, carbs: 40.0, fiber: 0, cat: '蛋白' },
  { name: '黄螺', kcal: 106, protein: 19.8, fat: 1.0, carbs: 4.5, fiber: 0, cat: '蛋白', alias: ['东风螺', '生黄螺'] },
  { name: '黄豆', kcal: 390, protein: 35.0, fat: 16.0, carbs: 34.2, fiber: 15.5, cat: '蛋白', alias: ['大豆'] },
  { name: '黄豆粉', kcal: 432, protein: 32.7, fat: 18.3, carbs: 37.6, fiber: 7.0, cat: '蛋白' },
  { name: '黄颡鱼', kcal: 124, protein: 17.8, fat: 2.7, carbs: 7.1, fiber: 0, cat: '蛋白', alias: ['戈牙鱼', '黄鳍鱼', '生黄颡鱼'] },
  { name: '黄鱼(大黄花鱼)', kcal: 97, protein: 17.7, fat: 2.5, carbs: 0.8, fiber: 0, cat: '蛋白', alias: ['生黄鱼(大黄花鱼)'] },
  { name: '黄鱼(小黄花鱼)', kcal: 114, protein: 17.0, fat: 5.1, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生黄鱼(小黄花鱼)'] },
  { name: '黄鲂', kcal: 81, protein: 18.5, fat: 0.5, carbs: 0.6, fiber: 0, cat: '蛋白', alias: ['赤虹', '老板鱼', '生黄鲂'] },
  { name: '黄鳝', kcal: 89, protein: 18.0, fat: 1.4, carbs: 1.2, fiber: 0, cat: '蛋白', alias: ['鳝鱼', '生黄鳝'] },
  { name: '黄鳝丝', kcal: 69, protein: 15.4, fat: 0.8, carbs: 0.0, fiber: 0, cat: '蛋白', alias: ['生黄鳝丝'] },
  { name: '黑豆(干)', kcal: 401, protein: 36.0, fat: 15.9, carbs: 33.6, fiber: 10.2, cat: '蛋白', alias: ['黑大豆'] },
  { name: '龙虾', kcal: 90, protein: 18.9, fat: 1.1, carbs: 1.0, fiber: 0, cat: '蛋白', alias: ['生龙虾'] },
  { name: '乳牛肝菌(干)', kcal: 264, protein: 15.3, fat: 2.8, carbs: 66.0, fiber: 0, cat: '主食', alias: ['粘盖牛肝菌', '松树菌'] },
  { name: '五谷香', kcal: 378, protein: 9.9, fat: 2.6, carbs: 78.9, fiber: 0.5, cat: '主食' },
  { name: '优糯米', kcal: 345, protein: 9.0, fat: 1.0, carbs: 75.3, fiber: 0.6, cat: '主食' },
  { name: '元蘑(干)', kcal: 245, protein: 12.3, fat: 1.5, carbs: 70.3, fiber: 0, cat: '主食', alias: ['亚侧耳', '冬蘑', '黄蘑'] },
  { name: '冬菇(干)', kcal: 277, protein: 17.8, fat: 1.3, carbs: 64.6, fiber: 32.3, cat: '主食', alias: ['毛柄金线菌'] },
  { name: '南瓜粉', kcal: 343, protein: 7.1, fat: 2.1, carbs: 79.6, fiber: 11.5, cat: '主食' },
  { name: '发菜(干)', kcal: 259, protein: 20.2, fat: 0.5, carbs: 60.8, fiber: 35.0, cat: '主食', alias: ['仙菜'] },
  { name: '口蘑(白蘑)', kcal: 277, protein: 38.7, fat: 3.3, carbs: 31.6, fiber: 17.2, cat: '主食' },
  { name: '大红菇(干)', kcal: 263, protein: 24.4, fat: 2.8, carbs: 50.9, fiber: 31.6, cat: '主食', alias: ['草质红菇'] },
  { name: '大蒜(脱水)', kcal: 348, protein: 13.2, fat: 0.3, carbs: 75.4, fiber: 4.5, cat: '主食' },
  { name: '大麦', kcal: 327, protein: 10.2, fat: 1.4, carbs: 73.3, fiber: 9.9, cat: '主食', alias: ['元麦'] },
  { name: '大黄米', kcal: 356, protein: 13.6, fat: 2.7, carbs: 71.1, fiber: 3.5, cat: '主食', alias: ['黍子'] },
  { name: '姜(干)', kcal: 308, protein: 9.1, fat: 5.7, carbs: 64.0, fiber: 17.7, cat: '主食' },
  { name: '小米', kcal: 361, protein: 9.0, fat: 3.1, carbs: 75.1, fiber: 1.6, cat: '主食' },
  { name: '小米(黄)', kcal: 364, protein: 8.9, fat: 3.0, carbs: 77.7, fiber: 0, cat: '主食' },
  { name: '小米粥', kcal: 46, protein: 1.4, fat: 0.7, carbs: 8.4, fiber: 0, cat: '主食' },
  { name: '小米面', kcal: 357, protein: 7.2, fat: 2.1, carbs: 77.7, fiber: 0.7, cat: '主食' },
  { name: '小豆粥', kcal: 62, protein: 1.2, fat: 0.4, carbs: 13.7, fiber: 0.6, cat: '主食' },
  { name: '小麦', kcal: 338, protein: 11.9, fat: 1.3, carbs: 75.2, fiber: 10.8, cat: '主食' },
  { name: '小麦粉', kcal: 359, protein: 12.4, fat: 1.7, carbs: 74.1, fiber: 0.8, cat: '主食' },
  { name: '小麦粉(富强粉、特一粉)', kcal: 362, protein: 12.3, fat: 1.5, carbs: 74.9, fiber: 0, cat: '主食' },
  { name: '小麦粉(标准粉)', kcal: 362, protein: 15.7, fat: 2.5, carbs: 70.9, fiber: 0, cat: '主食' },
  { name: '小麦粉(特二粉)', kcal: 352, protein: 10.4, fat: 1.1, carbs: 75.9, fiber: 1.6, cat: '主食' },
  { name: '小麦粉(特制)', kcal: 366, protein: 13.3, fat: 2.2, carbs: 73.5, fiber: 0.3, cat: '主食' },
  { name: '小麦胚粉', kcal: 403, protein: 36.4, fat: 10.1, carbs: 44.5, fiber: 5.6, cat: '主食' },
  { name: '山药(干)', kcal: 327, protein: 9.4, fat: 1.0, carbs: 70.8, fiber: 1.4, cat: '主食' },
  { name: '扁豆(干)', kcal: 339, protein: 25.3, fat: 0.4, carbs: 61.9, fiber: 6.5, cat: '主食' },
  { name: '挂面', kcal: 353, protein: 11.4, fat: 0.9, carbs: 75.1, fiber: 0.9, cat: '主食' },
  { name: '挂面(富强粉)', kcal: 363, protein: 13.0, fat: 1.5, carbs: 74.7, fiber: 0, cat: '主食' },
  { name: '挂面(标准粉)', kcal: 348, protein: 10.1, fat: 0.7, carbs: 76.0, fiber: 1.6, cat: '主食' },
  { name: '挂面(精制龙须面)', kcal: 348, protein: 11.2, fat: 0.5, carbs: 74.7, fiber: 0.2, cat: '主食' },
  { name: '早籼', kcal: 361, protein: 9.9, fat: 2.2, carbs: 76.2, fiber: 1.4, cat: '主食' },
  { name: '早籼(标一)', kcal: 352, protein: 8.8, fat: 1.0, carbs: 77.2, fiber: 0.4, cat: '主食' },
  { name: '早籼(标二)', kcal: 346, protein: 9.5, fat: 1.0, carbs: 75.1, fiber: 0.5, cat: '主食' },
  { name: '早籼(特等)', kcal: 347, protein: 9.1, fat: 0.6, carbs: 76.7, fiber: 0.7, cat: '主食' },
  { name: '早糯谷', kcal: 360, protein: 7.1, fat: 3.2, carbs: 77.0, fiber: 2.8, cat: '主食' },
  { name: '晚籼(标一)', kcal: 346, protein: 7.9, fat: 0.7, carbs: 77.3, fiber: 0.5, cat: '主食' },
  { name: '晚籼(标二)', kcal: 344, protein: 8.6, fat: 0.8, carbs: 75.7, fiber: 0.4, cat: '主食' },
  { name: '晚籼(特等)', kcal: 342, protein: 8.1, fat: 0.3, carbs: 76.9, fiber: 0.2, cat: '主食' },
  { name: '普中红蘑(干)', kcal: 263, protein: 18.4, fat: 0.7, carbs: 58.1, fiber: 24.6, cat: '主食' },
  { name: '木耳(干)', kcal: 265, protein: 12.1, fat: 1.5, carbs: 65.6, fiber: 29.9, cat: '主食', alias: ['黑木耳', '云耳'] },
  { name: '木薯', kcal: 119, protein: 2.1, fat: 0.3, carbs: 27.8, fiber: 1.6, cat: '主食' },
  { name: '木豆(干)', kcal: 348, protein: 19.8, fat: 4.5, carbs: 58.8, fiber: 3.7, cat: '主食', alias: ['扭豆', '豆蓉'] },
  { name: '松蘑(干)', kcal: 207, protein: 20.3, fat: 3.2, carbs: 48.2, fiber: 47.8, cat: '主食', alias: ['松口蘑', '松茸'] },
  { name: '栗子', kcal: 186, protein: 4.4, fat: 1.6, carbs: 39.6, fiber: 2.0, cat: '主食', alias: ['板栗'] },
  { name: '栗子(干)', kcal: 348, protein: 5.3, fat: 1.7, carbs: 78.4, fiber: 1.2, cat: '主食', alias: ['板栗'] },
  { name: '栗子(熟)', kcal: 214, protein: 4.8, fat: 1.5, carbs: 46.0, fiber: 1.2, cat: '主食', alias: ['板栗'] },
  { name: '栗子(鲜)', kcal: 188, protein: 4.2, fat: 0.7, carbs: 42.2, fiber: 1.7, cat: '主食', alias: ['板栗'] },
  { name: '栗子仁(熟)', kcal: 194, protein: 4.5, fat: 1.5, carbs: 45.7, fiber: 0, cat: '主食' },
  { name: '榛蘑(干)', kcal: 329, protein: 17.7, fat: 10.8, carbs: 54.6, fiber: 0, cat: '主食', alias: ['小蜜环菌'] },
  { name: '橡实', kcal: 233, protein: 4.0, fat: 2.0, carbs: 50.5, fiber: 1.3, cat: '主食', alias: ['橡子', '青冈子'] },
  { name: '水面筋', kcal: 142, protein: 23.5, fat: 0.1, carbs: 12.3, fiber: 0.9, cat: '主食' },
  { name: '河粉', kcal: 359, protein: 7.7, fat: 1.5, carbs: 79.2, fiber: 0, cat: '主食' },
  { name: '油条', kcal: 388, protein: 6.9, fat: 17.6, carbs: 51.0, fiber: 0.9, cat: '主食' },
  { name: '油菜(脱水)', kcal: 316, protein: 7.6, fat: 0.6, carbs: 74.3, fiber: 8.6, cat: '主食' },
  { name: '油面筋', kcal: 492, protein: 26.9, fat: 25.1, carbs: 40.4, fiber: 1.3, cat: '主食' },
  { name: '油饼', kcal: 403, protein: 7.9, fat: 22.9, carbs: 42.4, fiber: 2.0, cat: '主食' },
  { name: '烙饼(标准粉)', kcal: 258, protein: 7.5, fat: 2.3, carbs: 52.9, fiber: 1.9, cat: '主食' },
  { name: '烧饼(加糖)', kcal: 298, protein: 8.0, fat: 2.1, carbs: 62.7, fiber: 2.1, cat: '主食' },
  { name: '牛肝菌(白、干)', kcal: 296, protein: 27.8, fat: 1.6, carbs: 53.3, fiber: 0, cat: '主食', alias: ['美味牛肝菌'] },
  { name: '玉米粒(黄、干)', kcal: 327, protein: 8.0, fat: 0.8, carbs: 79.2, fiber: 0, cat: '主食' },
  { name: '玉米糁(黄)', kcal: 326, protein: 7.4, fat: 1.2, carbs: 78.7, fiber: 0, cat: '主食' },
  { name: '玉米面(强化豆粉)', kcal: 352, protein: 11.8, fat: 4.9, carbs: 68.3, fiber: 6.4, cat: '主食' },
  { name: '玉米面(白)', kcal: 352, protein: 8.0, fat: 4.5, carbs: 73.1, fiber: 6.2, cat: '主食' },
  { name: '玉米面(黄)', kcal: 350, protein: 8.5, fat: 1.5, carbs: 78.4, fiber: 0, cat: '主食' },
  { name: '玉米面面条', kcal: 350, protein: 6.6, fat: 0.3, carbs: 80.5, fiber: 0.6, cat: '主食' },
  { name: '珍珠白蘑(干)', kcal: 258, protein: 18.3, fat: 0.7, carbs: 56.3, fiber: 23.3, cat: '主食' },
  { name: '琼脂', kcal: 311, protein: 1.1, fat: 0.2, carbs: 76.3, fiber: 0.1, cat: '主食', alias: ['紫菜胶洋粉'] },
  { name: '甘薯(白心)', kcal: 106, protein: 1.4, fat: 0.2, carbs: 25.2, fiber: 1.0, cat: '主食', alias: ['红皮山芋'] },
  { name: '甘薯(红心)', kcal: 61, protein: 0.7, fat: 0.2, carbs: 15.3, fiber: 0, cat: '主食', alias: ['山芋', '红薯'] },
  { name: '甘薯片', kcal: 344, protein: 4.7, fat: 0.8, carbs: 80.5, fiber: 2.0, cat: '主食', alias: ['白薯干'] },
  { name: '甘薯粉', kcal: 336, protein: 2.7, fat: 0.2, carbs: 80.9, fiber: 0.1, cat: '主食', alias: ['地瓜粉'] },
  { name: '甜椒(脱水)', kcal: 324, protein: 7.6, fat: 0.4, carbs: 76.6, fiber: 8.3, cat: '主食' },
  { name: '生米', kcal: 346, protein: 7.9, fat: 0.9, carbs: 77.2, fiber: 0.6, cat: '主食' },
  { name: '白果(干)', kcal: 355, protein: 13.2, fat: 1.3, carbs: 72.6, fiber: 0, cat: '主食', alias: ['银杏'] },
  { name: '白笋(干)', kcal: 282, protein: 26.0, fat: 4.0, carbs: 57.1, fiber: 43.2, cat: '主食' },
  { name: '白菜(脱水)', kcal: 305, protein: 6.2, fat: 0.8, carbs: 72.9, fiber: 9.4, cat: '主食' },
  { name: '百合(脱水)', kcal: 346, protein: 8.1, fat: 0.1, carbs: 79.1, fiber: 1.7, cat: '主食' },
  { name: '眉豆(干)', kcal: 334, protein: 18.6, fat: 1.1, carbs: 65.6, fiber: 6.6, cat: '主食', alias: ['饭豇豆'] },
  { name: '稻米', kcal: 346, protein: 7.9, fat: 0.9, carbs: 77.2, fiber: 0.6, cat: '主食' },
  { name: '空锅饼', kcal: 278, protein: 8.6, fat: 0.2, carbs: 60.9, fiber: 0.7, cat: '主食' },
  { name: '竹荪(干)', kcal: 248, protein: 17.8, fat: 3.1, carbs: 60.3, fiber: 46.4, cat: '主食', alias: ['竹笙', '竹参'] },
  { name: '米粉', kcal: 349, protein: 0.4, fat: 0.8, carbs: 85.8, fiber: 0, cat: '主食' },
  { name: '籼稻(红)', kcal: 348, protein: 7.0, fat: 2.0, carbs: 76.4, fiber: 2.0, cat: '主食' },
  { name: '籼米', kcal: 340, protein: 7.5, fat: 1.1, carbs: 78.0, fiber: 0, cat: '主食' },
  { name: '籼米(优标)', kcal: 350, protein: 8.3, fat: 1.0, carbs: 77.3, fiber: 0.5, cat: '主食' },
  { name: '籼米(标一)', kcal: 348, protein: 7.7, fat: 0.7, carbs: 77.9, fiber: 0.6, cat: '主食' },
  { name: '籼米(标准)', kcal: 349, protein: 7.9, fat: 0.6, carbs: 78.3, fiber: 0.8, cat: '主食', alias: ['机米'] },
  { name: '籼米粉', kcal: 356, protein: 7.4, fat: 0.1, carbs: 81.5, fiber: 0.3, cat: '主食', alias: ['排米粉'] },
  { name: '籼米粥', kcal: 59, protein: 1.3, fat: 0.2, carbs: 13.4, fiber: 0, cat: '主食' },
  { name: '籼米饭(蒸)', kcal: 117, protein: 3.0, fat: 0.4, carbs: 26.4, fiber: 0, cat: '主食' },
  { name: '籼糯米', kcal: 352, protein: 7.9, fat: 1.1, carbs: 78.0, fiber: 0.5, cat: '主食' },
  { name: '粳米(小站稻米)', kcal: 346, protein: 6.9, fat: 0.7, carbs: 79.2, fiber: 0, cat: '主食' },
  { name: '粳米(极品精米)', kcal: 343, protein: 6.4, fat: 1.2, carbs: 78.1, fiber: 0, cat: '主食' },
  { name: '粳米(标一)', kcal: 345, protein: 7.7, fat: 0.6, carbs: 77.4, fiber: 0.6, cat: '主食' },
  { name: '粳米(标三)', kcal: 346, protein: 7.2, fat: 0.8, carbs: 77.6, fiber: 0.4, cat: '主食' },
  { name: '粳米(标二)', kcal: 347, protein: 8.0, fat: 0.6, carbs: 77.7, fiber: 0.4, cat: '主食' },
  { name: '粳米(标四)', kcal: 347, protein: 7.5, fat: 0.7, carbs: 78.1, fiber: 0.7, cat: '主食' },
  { name: '粳米(特等)', kcal: 335, protein: 7.3, fat: 0.4, carbs: 75.7, fiber: 0.4, cat: '主食' },
  { name: '粳米(西域王米)', kcal: 353, protein: 7.5, fat: 1.8, carbs: 77.0, fiber: 0.6, cat: '主食' },
  { name: '粳米粥', kcal: 46, protein: 1.1, fat: 0.3, carbs: 9.9, fiber: 0.1, cat: '主食' },
  { name: '粳米饭(蒸)', kcal: 118, protein: 2.6, fat: 0.3, carbs: 26.2, fiber: 0.2, cat: '主食' },
  { name: '粳糯米', kcal: 344, protein: 7.9, fat: 0.8, carbs: 76.7, fiber: 0.7, cat: '主食' },
  { name: '糙米', kcal: 348, protein: 7.7, fat: 2.7, carbs: 75.0, fiber: 3.4, cat: '主食' },
  { name: '糜子(带皮)', kcal: 336, protein: 10.6, fat: 0.6, carbs: 75.1, fiber: 6.3, cat: '主食' },
  { name: '糜子米(炒米)', kcal: 376, protein: 8.1, fat: 2.6, carbs: 80.5, fiber: 1.0, cat: '主食' },
  { name: '糯米', kcal: 350, protein: 7.3, fat: 1.0, carbs: 78.3, fiber: 0.8, cat: '主食', alias: ['江米'] },
  { name: '紫红糯米', kcal: 346, protein: 8.3, fat: 1.7, carbs: 75.1, fiber: 1.4, cat: '主食', alias: ['血糯米'] },
  { name: '紫菜(干)', kcal: 250, protein: 26.7, fat: 1.1, carbs: 44.1, fiber: 21.6, cat: '主食' },
  { name: '红豆沙(去皮)', kcal: 244, protein: 4.5, fat: 0.1, carbs: 57.1, fiber: 1.8, cat: '主食' },
  { name: '红豆馅', kcal: 261, protein: 4.5, fat: 0.2, carbs: 61.7, fiber: 2.8, cat: '主食' },
  { name: '绿豆(干)', kcal: 329, protein: 21.6, fat: 0.8, carbs: 62.0, fiber: 6.4, cat: '主食' },
  { name: '绿豆面', kcal: 341, protein: 20.8, fat: 0.7, carbs: 65.8, fiber: 5.8, cat: '主食' },
  { name: '绿豆饼', kcal: 122, protein: 15.2, fat: 1.2, carbs: 12.7, fiber: 0, cat: '主食' },
  { name: '羊肚菌(干)', kcal: 321, protein: 26.9, fat: 7.1, carbs: 43.7, fiber: 12.9, cat: '主食', alias: ['干狼肚'] },
  { name: '肚里黄', kcal: 337, protein: 8.8, fat: 1.2, carbs: 76.7, fiber: 8.0, cat: '主食' },
  { name: '胡萝卜(脱水)', kcal: 333, protein: 4.2, fat: 1.9, carbs: 77.9, fiber: 6.4, cat: '主食' },
  { name: '脑豆(干)', kcal: 363, protein: 23.4, fat: 3.8, carbs: 59.6, fiber: 1.5, cat: '主食' },
  { name: '芡实米(干)', kcal: 352, protein: 8.3, fat: 0.3, carbs: 79.6, fiber: 0.9, cat: '主食', alias: ['鸡头米'] },
  { name: '花卷', kcal: 214, protein: 6.4, fat: 1.0, carbs: 45.6, fiber: 1.5, cat: '主食' },
  { name: '花卷(加牛奶)', kcal: 282, protein: 6.5, fat: 3.2, carbs: 58.9, fiber: 0, cat: '主食' },
  { name: '苦荞麦粉', kcal: 316, protein: 9.7, fat: 2.7, carbs: 66.0, fiber: 5.8, cat: '主食' },
  { name: '茶树菇(干)', kcal: 309, protein: 23.1, fat: 2.6, carbs: 56.1, fiber: 0, cat: '主食', alias: ['柱状田头菇', '油茶菇'] },
  { name: '荆豆(干)', kcal: 407, protein: 43.6, fat: 14.3, carbs: 28.5, fiber: 5.2, cat: '主食' },
  { name: '荞麦', kcal: 337, protein: 9.3, fat: 2.3, carbs: 73.0, fiber: 6.5, cat: '主食' },
  { name: '荞麦(带皮)', kcal: 319, protein: 9.5, fat: 1.7, carbs: 73.0, fiber: 13.3, cat: '主食' },
  { name: '荞麦面', kcal: 340, protein: 11.3, fat: 2.8, carbs: 70.2, fiber: 0, cat: '主食' },
  { name: '莜麦面', kcal: 391, protein: 13.7, fat: 8.6, carbs: 67.7, fiber: 0, cat: '主食' },
  { name: '莲子(干)', kcal: 350, protein: 17.2, fat: 2.0, carbs: 67.2, fiber: 3.0, cat: '主食' },
  { name: '菜花(脱水)', kcal: 312, protein: 6.5, fat: 0.6, carbs: 76.8, fiber: 13.2, cat: '主食', alias: ['脱水花椰菜'] },
  { name: '菠菜(脱水)', kcal: 308, protein: 6.4, fat: 0.6, carbs: 75.7, fiber: 12.7, cat: '主食' },
  { name: '菠萝蜜', kcal: 164, protein: 4.9, fat: 0.3, carbs: 36.7, fiber: 2.3, cat: '主食' },
  { name: '葫芦条(干)', kcal: 256, protein: 4.3, fat: 1.8, carbs: 64.6, fiber: 18.1, cat: '主食' },
  { name: '薏米', kcal: 361, protein: 12.8, fat: 3.3, carbs: 71.1, fiber: 2.0, cat: '主食', alias: ['薏仁米', '苡米'] },
  { name: '薏米面', kcal: 351, protein: 11.3, fat: 2.4, carbs: 73.5, fiber: 4.8, cat: '主食' },
  { name: '藜麦(散装)', kcal: 357, protein: 14.0, fat: 6.0, carbs: 57.8, fiber: 6.5, cat: '主食' },
  { name: '蚕豆(去皮)', kcal: 347, protein: 25.4, fat: 1.6, carbs: 58.9, fiber: 2.5, cat: '主食' },
  { name: '蚕豆(带皮)', kcal: 326, protein: 24.6, fat: 1.1, carbs: 59.9, fiber: 10.9, cat: '主食' },
  { name: '蚕豆(干)', kcal: 338, protein: 21.6, fat: 1.0, carbs: 61.5, fiber: 1.7, cat: '主食' },
  { name: '蚕豆(炸)', kcal: 447, protein: 26.7, fat: 20.0, carbs: 40.4, fiber: 0.5, cat: '主食', alias: ['开花豆'] },
  { name: '蚕豆(烤)', kcal: 377, protein: 27.0, fat: 2.0, carbs: 63.8, fiber: 2.2, cat: '主食' },
  { name: '蚕豆(煮)', kcal: 62, protein: 4.8, fat: 0.5, carbs: 10.1, fiber: 0, cat: '主食' },
  { name: '蛹虫草(干)', kcal: 302, protein: 23.7, fat: 0.0, carbs: 60.9, fiber: 16.3, cat: '主食' },
  { name: '螺旋藻(干)', kcal: 358, protein: 64.7, fat: 3.1, carbs: 18.2, fiber: 1.0, cat: '主食' },
  { name: '血红菇(干)', kcal: 313, protein: 22.4, fat: 6.7, carbs: 56.0, fiber: 0, cat: '主食' },
  { name: '裙带菜(干)', kcal: 219, protein: 25.0, fat: 1.7, carbs: 41.5, fiber: 31.1, cat: '主食', alias: ['海芥菜', '海木耳'] },
  { name: '豇豆(干)', kcal: 336, protein: 19.3, fat: 1.2, carbs: 65.6, fiber: 7.1, cat: '主食' },
  { name: '豇豆(煮)', kcal: 133, protein: 9.5, fat: 0.6, carbs: 24.0, fiber: 1.8, cat: '主食' },
  { name: '豌豆(干)', kcal: 334, protein: 20.3, fat: 1.1, carbs: 65.8, fiber: 10.4, cat: '主食' },
  { name: '豌豆(煮)', kcal: 107, protein: 8.9, fat: 0.3, carbs: 19.2, fiber: 2.4, cat: '主食' },
  { name: '豌豆(花)', kcal: 336, protein: 21.6, fat: 1.0, carbs: 63.6, fiber: 6.9, cat: '主食' },
  { name: '豌豆尖', kcal: 225, protein: 3.1, fat: 0.0, carbs: 53.9, fiber: 1.3, cat: '主食' },
  { name: '贝果', kcal: 257, protein: 10.2, fat: 1.7, carbs: 50.5, fiber: 2.3, cat: '主食', alias: ['bagel', '面包圈'] },
  { name: '赤小豆(干)', kcal: 324, protein: 20.2, fat: 0.6, carbs: 63.4, fiber: 7.7, cat: '主食', alias: ['小豆', '红小豆'] },
  { name: '辣椒(小红尖辣椒、干)', kcal: 298, protein: 15.4, fat: 12.0, carbs: 57.4, fiber: 0, cat: '主食' },
  { name: '通心面', kcal: 351, protein: 11.9, fat: 0.1, carbs: 75.8, fiber: 0.4, cat: '主食', alias: ['通心粉'] },
  { name: '金针菜(鲜)', kcal: 214, protein: 19.4, fat: 1.4, carbs: 34.9, fiber: 7.7, cat: '主食', alias: ['黄花菜'] },
  { name: '银耳(干)', kcal: 261, protein: 10.0, fat: 1.4, carbs: 67.3, fiber: 30.4, cat: '主食', alias: ['白木耳'] },
  { name: '青稞', kcal: 342, protein: 8.1, fat: 1.5, carbs: 75.0, fiber: 1.8, cat: '主食' },
  { name: '面条(干切面)', kcal: 355, protein: 11.0, fat: 0.1, carbs: 77.7, fiber: 0.2, cat: '主食' },
  { name: '面条(虾蓉面)', kcal: 436, protein: 8.5, fat: 15.1, carbs: 68.3, fiber: 3.6, cat: '主食' },
  { name: '面筋(肉馅)', kcal: 364, protein: 16.2, fat: 33.2, carbs: 0.1, fiber: 0, cat: '主食' },
  { name: '馒头(富强粉)', kcal: 235, protein: 7.1, fat: 1.3, carbs: 50.9, fiber: 0, cat: '主食' },
  { name: '馒头(标准粉)', kcal: 236, protein: 7.8, fat: 1.0, carbs: 49.8, fiber: 1.5, cat: '主食' },
  { name: '香杏片口蘑(干)', kcal: 252, protein: 33.4, fat: 1.5, carbs: 37.6, fiber: 22.6, cat: '主食' },
  { name: '香米', kcal: 347, protein: 12.7, fat: 0.9, carbs: 72.4, fiber: 0.6, cat: '主食' },
  { name: '香菇(干)', kcal: 274, protein: 20.0, fat: 1.2, carbs: 61.7, fiber: 31.6, cat: '主食', alias: ['香蕈', '冬菇'] },
  { name: '香菜(脱水)', kcal: 310, protein: 7.4, fat: 1.3, carbs: 71.2, fiber: 8.2, cat: '主食' },
  { name: '马牙大豆(干)', kcal: 338, protein: 27.2, fat: 0.9, carbs: 59.4, fiber: 8.4, cat: '主食' },
  { name: '马铃薯', kcal: 81, protein: 2.6, fat: 0.2, carbs: 17.8, fiber: 1.1, cat: '主食', alias: ['土豆', '洋芋'] },
  { name: '马铃薯(烤)', kcal: 70, protein: 1.8, fat: 0.1, carbs: 16.4, fiber: 0.4, cat: '主食' },
  { name: '马铃薯(煮)', kcal: 65, protein: 3.2, fat: 0.0, carbs: 14.2, fiber: 0.2, cat: '主食' },
  { name: '马铃薯(蒸)', kcal: 69, protein: 3.0, fat: 0.0, carbs: 15.3, fiber: 0.2, cat: '主食' },
  { name: '马铃薯丁(脱水)', kcal: 344, protein: 5.7, fat: 0.5, carbs: 80.7, fiber: 3.3, cat: '主食' },
  { name: '马铃薯全粉', kcal: 362, protein: 8.4, fat: 0.5, carbs: 82.7, fiber: 3.5, cat: '主食' },
  { name: '高粱米', kcal: 360, protein: 10.4, fat: 3.1, carbs: 74.7, fiber: 4.3, cat: '主食' },
  { name: '高粱面面条', kcal: 304, protein: 7.0, fat: 0.2, carbs: 68.7, fiber: 0.3, cat: '主食' },
  { name: '高蛋白豆米粉(籼米)', kcal: 414, protein: 16.5, fat: 7.1, carbs: 71.0, fiber: 0, cat: '主食' },
  { name: '鸡枞(干)', kcal: 297, protein: 32.8, fat: 3.7, carbs: 44.8, fiber: 0, cat: '主食' },
  { name: '鸡枞(油炸)', kcal: 646, protein: 4.8, fat: 66.3, carbs: 10.2, fiber: 5.4, cat: '主食', alias: ['油鸡枞'] },
  { name: '鸡腿菇(干)', kcal: 294, protein: 26.7, fat: 2.0, carbs: 51.8, fiber: 0, cat: '主食', alias: ['毛头鬼伞'] },
  { name: '鹰嘴豆', kcal: 340, protein: 21.2, fat: 4.2, carbs: 60.1, fiber: 11.6, cat: '主食', alias: ['桃豆'] },
  { name: '麸皮', kcal: 282, protein: 15.8, fat: 4.0, carbs: 61.4, fiber: 31.3, cat: '主食' },
  { name: '黄伞菇(干)', kcal: 294, protein: 22.8, fat: 3.2, carbs: 57.5, fiber: 0, cat: '主食', alias: ['多脂鳞伞', '黄丝菌'] },
  { name: '黄米', kcal: 351, protein: 9.7, fat: 1.5, carbs: 76.9, fiber: 4.4, cat: '主食' },
  { name: '黄蘑(干)', kcal: 203, protein: 16.4, fat: 1.5, carbs: 40.1, fiber: 18.3, cat: '主食' },
  { name: '黑大麦', kcal: 327, protein: 10.2, fat: 2.2, carbs: 74.3, fiber: 15.2, cat: '主食' },
  { name: '黑笋(干)', kcal: 268, protein: 17.6, fat: 2.4, carbs: 57.5, fiber: 27.2, cat: '主食' },
  { name: '黑米', kcal: 341, protein: 9.4, fat: 2.5, carbs: 72.2, fiber: 3.9, cat: '主食' },
  { name: '龙须面(素)', kcal: 359, protein: 10.8, fat: 1.8, carbs: 75.7, fiber: 0, cat: '主食' },
  { name: '龙须面(鸡蛋)', kcal: 352, protein: 14.0, fat: 1.8, carbs: 71.5, fiber: 0, cat: '主食' },
  { name: '三七尖', kcal: 21, protein: 2.3, fat: 0.2, carbs: 4.0, fiber: 0, cat: '蔬菜' },
  { name: '丝瓜', kcal: 20, protein: 1.3, fat: 0.2, carbs: 4.0, fiber: 0, cat: '蔬菜' },
  { name: '乌塌菜', kcal: 13, protein: 1.8, fat: 0.1, carbs: 2.6, fiber: 1.8, cat: '蔬菜', alias: ['塌菜', '塌棵菜'] },
  { name: '乌菜', kcal: 28, protein: 2.6, fat: 0.4, carbs: 4.2, fiber: 1.4, cat: '蔬菜', alias: ['乌塌菜', '塌棵菜'] },
  { name: '佛手瓜', kcal: 18, protein: 1.2, fat: 0.1, carbs: 3.8, fiber: 1.2, cat: '蔬菜', alias: ['棒瓜', '菜肴梨'] },
  { name: '冬寒菜(鲜)', kcal: 34, protein: 3.9, fat: 0.4, carbs: 4.9, fiber: 2.2, cat: '蔬菜', alias: ['冬苋菜', '冬葵'] },
  { name: '冬笋(鲜)', kcal: 42, protein: 4.1, fat: 0.1, carbs: 6.5, fiber: 0.8, cat: '蔬菜' },
  { name: '刀豆(鲜)', kcal: 40, protein: 3.1, fat: 0.3, carbs: 7.0, fiber: 1.8, cat: '蔬菜' },
  { name: '分葱', kcal: 34, protein: 2.2, fat: 0.7, carbs: 5.1, fiber: 0.7, cat: '蔬菜', alias: ['四季葱', '菜葱'] },
  { name: '北风菌', kcal: 17, protein: 1.7, fat: 0.1, carbs: 2.9, fiber: 1.2, cat: '蔬菜', alias: ['荷叶离褶伞', '一窝羊'] },
  { name: '南瓜(栗面)', kcal: 36, protein: 1.4, fat: 0.1, carbs: 8.8, fiber: 2.6, cat: '蔬菜' },
  { name: '南瓜(鲜)', kcal: 23, protein: 0.7, fat: 0.1, carbs: 5.3, fiber: 0.8, cat: '蔬菜', alias: ['倭瓜', '番瓜'] },
  { name: '南瓜藤', kcal: 17, protein: 1.7, fat: 0.0, carbs: 3.2, fiber: 0, cat: '蔬菜' },
  { name: '卞萝卜', kcal: 18, protein: 0.8, fat: 0.1, carbs: 4.2, fiber: 1.1, cat: '蔬菜', alias: ['红皮萝卜'] },
  { name: '双孢蘑菇', kcal: 26, protein: 4.2, fat: 0.1, carbs: 2.7, fiber: 1.5, cat: '蔬菜', alias: ['洋蘑菇'] },
  { name: '发芽豆', kcal: 131, protein: 12.4, fat: 0.7, carbs: 19.4, fiber: 1.3, cat: '蔬菜' },
  { name: '叶甜菜(白梗)', kcal: 13, protein: 1.6, fat: 0.1, carbs: 2.8, fiber: 2.2, cat: '蔬菜' },
  { name: '四季豆', kcal: 24, protein: 2.0, fat: 0.2, carbs: 6.0, fiber: 0, cat: '蔬菜', alias: ['菜豆', '芸豆'] },
  { name: '四季豆(菜豆)', kcal: 31, protein: 2.0, fat: 0.4, carbs: 5.7, fiber: 1.5, cat: '蔬菜' },
  { name: '四棱豆', kcal: 19, protein: 2.0, fat: 0.2, carbs: 4.2, fiber: 0, cat: '蔬菜', alias: ['杨桃豆', '翅豆'] },
  { name: '地衣(水浸)', kcal: 10, protein: 1.5, fat: 0.0, carbs: 1.8, fiber: 1.8, cat: '蔬菜' },
  { name: '垅船豆(鲜)', kcal: 36, protein: 2.0, fat: 0.4, carbs: 6.8, fiber: 1.3, cat: '蔬菜' },
  { name: '大白菜', kcal: 20, protein: 1.6, fat: 0.2, carbs: 3.4, fiber: 0.9, cat: '蔬菜' },
  { name: '大白菜(小白口)', kcal: 16, protein: 1.3, fat: 0.1, carbs: 2.8, fiber: 0.9, cat: '蔬菜' },
  { name: '大白菜(白口)', kcal: 14, protein: 1.0, fat: 0.1, carbs: 2.9, fiber: 0, cat: '蔬菜' },
  { name: '大白菜(白梗)', kcal: 22, protein: 1.7, fat: 0.2, carbs: 3.7, fiber: 0.6, cat: '蔬菜', alias: ['黄芽白'] },
  { name: '大白菜(青口)', kcal: 12, protein: 1.1, fat: 0.1, carbs: 2.6, fiber: 0, cat: '蔬菜' },
  { name: '大白菜(青白口)', kcal: 17, protein: 1.4, fat: 0.1, carbs: 3.0, fiber: 0.9, cat: '蔬菜' },
  { name: '大葱', kcal: 28, protein: 1.6, fat: 0.3, carbs: 5.8, fiber: 2.2, cat: '蔬菜' },
  { name: '大葱(红皮)', kcal: 49, protein: 2.4, fat: 0.1, carbs: 10.2, fiber: 1.3, cat: '蔬菜' },
  { name: '大薯(鲜)', kcal: 108, protein: 2.1, fat: 0.2, carbs: 24.9, fiber: 1.1, cat: '蔬菜', alias: ['参薯'] },
  { name: '奶柿子', kcal: 14, protein: 0.6, fat: 0.1, carbs: 3.2, fiber: 0.8, cat: '蔬菜', alias: ['西红柿'] },
  { name: '奶白菜', kcal: 21, protein: 2.7, fat: 0.2, carbs: 3.3, fiber: 1.5, cat: '蔬菜' },
  { name: '姜(鲜)', kcal: 46, protein: 1.3, fat: 0.6, carbs: 10.3, fiber: 2.7, cat: '蔬菜', alias: ['黄姜'] },
  { name: '小水萝卜', kcal: 21, protein: 1.1, fat: 0.2, carbs: 4.2, fiber: 1.0, cat: '蔬菜', alias: ['算盘子', '红皮萝卜'] },
  { name: '小白菜', kcal: 14, protein: 1.4, fat: 0.3, carbs: 2.4, fiber: 0, cat: '蔬菜', alias: ['青菜'] },
  { name: '小西胡瓜', kcal: 22, protein: 0.7, fat: 0.1, carbs: 4.8, fiber: 0, cat: '蔬菜' },
  { name: '山药(鲜)', kcal: 57, protein: 1.9, fat: 0.2, carbs: 12.4, fiber: 0.8, cat: '蔬菜', alias: ['薯蓣', '大薯'] },
  { name: '干巴菌', kcal: 38, protein: 3.8, fat: 0.4, carbs: 8.0, fiber: 6.3, cat: '蔬菜' },
  { name: '平菇', kcal: 24, protein: 1.9, fat: 0.3, carbs: 4.6, fiber: 2.3, cat: '蔬菜', alias: ['糙皮侧耳', '青蘑'] },
  { name: '彩椒', kcal: 26, protein: 1.3, fat: 0.2, carbs: 6.4, fiber: 0, cat: '蔬菜' },
  { name: '慈姑(鲜)', kcal: 97, protein: 4.6, fat: 0.2, carbs: 19.9, fiber: 1.4, cat: '蔬菜', alias: ['乌芋', '白地果'] },
  { name: '扁豆', kcal: 41, protein: 2.7, fat: 0.2, carbs: 8.2, fiber: 2.1, cat: '蔬菜', alias: ['月亮菜'] },
  { name: '抱子甘蓝', kcal: 36, protein: 3.5, fat: 0.2, carbs: 8.8, fiber: 0, cat: '蔬菜', alias: ['小圆白菜'] },
  { name: '方瓜', kcal: 14, protein: 0.8, fat: 0.0, carbs: 3.1, fiber: 0.6, cat: '蔬菜' },
  { name: '春笋(鲜)', kcal: 25, protein: 2.4, fat: 0.1, carbs: 5.1, fiber: 2.8, cat: '蔬菜' },
  { name: '木耳(水发)', kcal: 27, protein: 1.5, fat: 0.2, carbs: 6.0, fiber: 2.6, cat: '蔬菜', alias: ['黑木耳', '云耳'] },
  { name: '杏鲍菇', kcal: 35, protein: 1.3, fat: 0.1, carbs: 8.3, fiber: 2.1, cat: '蔬菜' },
  { name: '根芹', kcal: 38, protein: 2.2, fat: 0.1, carbs: 10.0, fiber: 4.6, cat: '蔬菜', alias: ['根洋芹', '球根塘蒿'] },
  { name: '棠梨花', kcal: 58, protein: 3.5, fat: 0.8, carbs: 9.1, fiber: 0, cat: '蔬菜' },
  { name: '榛蘑(半干)', kcal: 178, protein: 9.5, fat: 3.7, carbs: 31.9, fiber: 10.4, cat: '蔬菜', alias: ['假蜜环菌'] },
  { name: '榛蘑(水发)', kcal: 53, protein: 2.8, fat: 1.1, carbs: 9.4, fiber: 3.1, cat: '蔬菜' },
  { name: '槟榔芋(鲜)', kcal: 90, protein: 3.0, fat: 0.1, carbs: 19.7, fiber: 1.1, cat: '蔬菜' },
  { name: '樱桃番茄', kcal: 25, protein: 1.0, fat: 0.2, carbs: 5.8, fiber: 0, cat: '蔬菜', alias: ['小西红柿'] },
  { name: '樱桃萝卜', kcal: 12, protein: 0.9, fat: 0.1, carbs: 3.0, fiber: 0, cat: '蔬菜' },
  { name: '樱桃萝卜缨', kcal: 14, protein: 2.0, fat: 0.1, carbs: 2.7, fiber: 2.3, cat: '蔬菜' },
  { name: '毛笋(鲜)', kcal: 23, protein: 2.2, fat: 0.2, carbs: 3.8, fiber: 1.3, cat: '蔬菜', alias: ['毛竹笋'] },
  { name: '毛豆(鲜)', kcal: 131, protein: 13.1, fat: 5.0, carbs: 10.5, fiber: 4.0, cat: '蔬菜', alias: ['青豆', '菜用大豆'] },
  { name: '水芹菜', kcal: 13, protein: 1.4, fat: 0.2, carbs: 1.8, fiber: 0.9, cat: '蔬菜' },
  { name: '水萝卜', kcal: 22, protein: 0.8, fat: 0.0, carbs: 5.5, fiber: 1.4, cat: '蔬菜', alias: ['脆萝卜'] },
  { name: '油菜', kcal: 14, protein: 1.3, fat: 0.5, carbs: 2.0, fiber: 0, cat: '蔬菜' },
  { name: '油菜(小)', kcal: 12, protein: 1.3, fat: 0.2, carbs: 1.6, fiber: 0.7, cat: '蔬菜' },
  { name: '油菜(黑)', kcal: 19, protein: 1.8, fat: 0.2, carbs: 2.9, fiber: 0.9, cat: '蔬菜' },
  { name: '油菜心', kcal: 15, protein: 1.3, fat: 0.4, carbs: 2.7, fiber: 0, cat: '蔬菜' },
  { name: '油菜薹', kcal: 24, protein: 3.2, fat: 0.4, carbs: 3.0, fiber: 2.0, cat: '蔬菜', alias: ['菜薹'] },
  { name: '油豆角(鲜)', kcal: 25, protein: 2.4, fat: 0.3, carbs: 3.9, fiber: 1.6, cat: '蔬菜', alias: ['多花菜豆'] },
  { name: '洋丝瓜苗', kcal: 29, protein: 4.4, fat: 0.3, carbs: 2.2, fiber: 0, cat: '蔬菜' },
  { name: '洋姜(鲜)', kcal: 64, protein: 2.4, fat: 0.0, carbs: 15.8, fiber: 4.3, cat: '蔬菜', alias: ['菊芋', '鬼子姜'] },
  { name: '洋葱(鲜)', kcal: 40, protein: 1.1, fat: 0.2, carbs: 9.0, fiber: 0.9, cat: '蔬菜', alias: ['葱头'] },
  { name: '海带', kcal: 90, protein: 1.8, fat: 0.1, carbs: 23.4, fiber: 6.1, cat: '蔬菜', alias: ['江白菜', '昆布'] },
  { name: '海带(浸)', kcal: 16, protein: 1.1, fat: 0.1, carbs: 3.0, fiber: 0.9, cat: '蔬菜', alias: ['江白菜', '昆布'] },
  { name: '海带(鲜)', kcal: 13, protein: 1.2, fat: 0.1, carbs: 2.1, fiber: 0.5, cat: '蔬菜', alias: ['江白菜'] },
  { name: '牛眼睛菌(鲜)', kcal: 41, protein: 5.1, fat: 0.3, carbs: 6.6, fiber: 4.4, cat: '蔬菜', alias: ['马勃菌'] },
  { name: '牛肝菌(白)', kcal: 35, protein: 4.0, fat: 0.4, carbs: 4.5, fiber: 1.5, cat: '蔬菜', alias: ['美味牛肝菌'] },
  { name: '牛肝菌(鲜)', kcal: 32, protein: 4.3, fat: 0.1, carbs: 5.3, fiber: 3.9, cat: '蔬菜', alias: ['黄皮牛肝菌', '黄皮疣柄牛肝菌', '黄癞头'] },
  { name: '牛肝菌(黑)', kcal: 32, protein: 3.6, fat: 0.2, carbs: 4.8, fiber: 1.6, cat: '蔬菜', alias: ['铜色牛肝菌'] },
  { name: '猴头菇(罐装)', kcal: 21, protein: 2.0, fat: 0.2, carbs: 4.9, fiber: 4.2, cat: '蔬菜' },
  { name: '玉兰片', kcal: 66, protein: 2.6, fat: 0.4, carbs: 18.6, fiber: 11.3, cat: '蔬菜' },
  { name: '球茎茴香', kcal: 17, protein: 1.2, fat: 0.0, carbs: 4.7, fiber: 2.2, cat: '蔬菜', alias: ['甜茴香', '意大利茴香'] },
  { name: '瓢儿白', kcal: 18, protein: 1.7, fat: 0.2, carbs: 3.2, fiber: 1.6, cat: '蔬菜', alias: ['瓢儿菜'] },
  { name: '甜椒', kcal: 18, protein: 1.0, fat: 0.2, carbs: 3.8, fiber: 0, cat: '蔬菜', alias: ['灯笼椒', '柿子椒'] },
  { name: '甜脆荷兰豆', kcal: 32, protein: 3.0, fat: 0.3, carbs: 8.1, fiber: 6.8, cat: '蔬菜', alias: ['甜豆'] },
  { name: '甜菜叶(鲜)', kcal: 22, protein: 1.8, fat: 0.1, carbs: 4.0, fiber: 1.3, cat: '蔬菜' },
  { name: '甜菜根(鲜)', kcal: 87, protein: 1.0, fat: 0.1, carbs: 23.5, fiber: 5.9, cat: '蔬菜', alias: ['甜菜头', '糖萝卜'] },
  { name: '番杏', kcal: 15, protein: 1.8, fat: 0.1, carbs: 3.1, fiber: 0, cat: '蔬菜', alias: ['新西兰菠菜', '夏菠菜'] },
  { name: '白凤菜', kcal: 16, protein: 1.6, fat: 0.2, carbs: 4.0, fiber: 0, cat: '蔬菜' },
  { name: '白菜薹', kcal: 28, protein: 2.8, fat: 0.5, carbs: 4.0, fiber: 1.7, cat: '蔬菜', alias: ['菜薹', '菜心'] },
  { name: '白萝卜(圆)', kcal: 16, protein: 0.7, fat: 0.2, carbs: 3.6, fiber: 1.0, cat: '蔬菜' },
  { name: '白萝卜(鲜)', kcal: 16, protein: 0.7, fat: 0.1, carbs: 4.0, fiber: 0, cat: '蔬菜', alias: ['莱菔'] },
  { name: '白蘑菇', kcal: 29, protein: 3.5, fat: 0.4, carbs: 3.8, fiber: 0, cat: '蔬菜', alias: ['双孢蘑菇', '洋蘑菇'] },
  { name: '百合(鲜)', kcal: 166, protein: 3.2, fat: 0.1, carbs: 38.8, fiber: 1.7, cat: '蔬菜' },
  { name: '盖菜', kcal: 13, protein: 1.5, fat: 0.2, carbs: 2.8, fiber: 0, cat: '蔬菜' },
  { name: '秋黄瓜', kcal: 14, protein: 0.9, fat: 0.2, carbs: 2.5, fiber: 0, cat: '蔬菜', alias: ['旱黄瓜'] },
  { name: '竹笋(鲜)', kcal: 23, protein: 2.6, fat: 0.2, carbs: 3.6, fiber: 1.8, cat: '蔬菜' },
  { name: '紫菜头', kcal: 42, protein: 1.8, fat: 0.2, carbs: 10.6, fiber: 4.2, cat: '蔬菜' },
  { name: '红奶浆菌', kcal: 18, protein: 1.5, fat: 0.4, carbs: 3.3, fiber: 2.4, cat: '蔬菜', alias: ['多汁乳菇', '谷熟菌'] },
  { name: '红心萝卜', kcal: 41, protein: 1.2, fat: 0.0, carbs: 9.8, fiber: 1.4, cat: '蔬菜', alias: ['心里美'] },
  { name: '红旦旦萝卜', kcal: 19, protein: 0.8, fat: 0.0, carbs: 4.3, fiber: 0.8, cat: '蔬菜', alias: ['樱桃萝卜', '小水萝卜'] },
  { name: '红菜薹', kcal: 43, protein: 2.9, fat: 2.5, carbs: 2.7, fiber: 0.9, cat: '蔬菜', alias: ['紫菜薹'] },
  { name: '红菱', kcal: 165, protein: 5.7, fat: 0.3, carbs: 40.9, fiber: 0, cat: '蔬菜' },
  { name: '红萝卜', kcal: 22, protein: 1.0, fat: 0.1, carbs: 4.6, fiber: 0.8, cat: '蔬菜', alias: ['卞萝卜'] },
  { name: '红薯叶', kcal: 27, protein: 3.1, fat: 0.0, carbs: 5.1, fiber: 2.8, cat: '蔬菜' },
  { name: '细香葱', kcal: 28, protein: 1.4, fat: 0.3, carbs: 6.6, fiber: 0, cat: '蔬菜', alias: ['香葱', '四季葱'] },
  { name: '结球甘蓝(紫)', kcal: 25, protein: 1.2, fat: 0.2, carbs: 6.2, fiber: 0, cat: '蔬菜', alias: ['圆白菜'] },
  { name: '结球甘蓝(绿)', kcal: 17, protein: 0.9, fat: 0.2, carbs: 4.0, fiber: 0, cat: '蔬菜', alias: ['圆白菜'] },
  { name: '结球菊苣(红)', kcal: 17, protein: 1.8, fat: 0.2, carbs: 3.4, fiber: 0, cat: '蔬菜' },
  { name: '绿豆芽', kcal: 16, protein: 1.7, fat: 0.1, carbs: 2.6, fiber: 1.2, cat: '蔬菜' },
  { name: '羽衣甘蓝', kcal: 69, protein: 5.0, fat: 0.4, carbs: 5.7, fiber: 3.2, cat: '蔬菜' },
  { name: '胡萝卜(红)', kcal: 39, protein: 1.0, fat: 0.2, carbs: 8.8, fiber: 1.1, cat: '蔬菜', alias: ['金笋', '丁香萝卜'] },
  { name: '胡萝卜(黄)', kcal: 46, protein: 1.4, fat: 0.2, carbs: 10.2, fiber: 1.3, cat: '蔬菜' },
  { name: '节瓜', kcal: 14, protein: 0.6, fat: 0.1, carbs: 3.4, fiber: 1.2, cat: '蔬菜', alias: ['毛瓜'] },
  { name: '芋头(煮)', kcal: 60, protein: 2.9, fat: 0.1, carbs: 13.0, fiber: 0.3, cat: '蔬菜' },
  { name: '芥菜(鲜)', kcal: 27, protein: 2.0, fat: 0.4, carbs: 4.7, fiber: 1.6, cat: '蔬菜', alias: ['雪里红', '雪菜'] },
  { name: '芥菜头', kcal: 36, protein: 1.9, fat: 0.2, carbs: 7.4, fiber: 1.4, cat: '蔬菜', alias: ['大头菜', '水芥'] },
  { name: '芥蓝', kcal: 24, protein: 3.1, fat: 0.3, carbs: 4.1, fiber: 0, cat: '蔬菜', alias: ['甘蓝菜', '盖蓝菜'] },
  { name: '芦笋(紫)', kcal: 22, protein: 2.7, fat: 0.2, carbs: 3.4, fiber: 1.3, cat: '蔬菜' },
  { name: '芦笋(绿)', kcal: 19, protein: 2.6, fat: 0.1, carbs: 3.3, fiber: 0, cat: '蔬菜', alias: ['石刁柏', '龙须菜'] },
  { name: '花叶萝卜', kcal: 48, protein: 1.2, fat: 0.1, carbs: 11.5, fiber: 2.1, cat: '蔬菜' },
  { name: '芸豆(鲜)', kcal: 30, protein: 0.8, fat: 0.1, carbs: 7.4, fiber: 2.1, cat: '蔬菜' },
  { name: '芹菜(茎)', kcal: 13, protein: 0.4, fat: 0.2, carbs: 3.1, fiber: 1.0, cat: '蔬菜', alias: ['旱芹', '药芹'] },
  { name: '芹菜叶(鲜)', kcal: 35, protein: 2.6, fat: 0.6, carbs: 5.9, fiber: 2.2, cat: '蔬菜' },
  { name: '芹菜茎', kcal: 22, protein: 1.2, fat: 0.2, carbs: 4.5, fiber: 1.2, cat: '蔬菜' },
  { name: '苔菜(干)', kcal: 167, protein: 19.0, fat: 0.4, carbs: 26.3, fiber: 9.1, cat: '蔬菜', alias: ['苔条', '条浒苔'] },
  { name: '苤蓝', kcal: 32, protein: 1.3, fat: 0.2, carbs: 7.0, fiber: 1.3, cat: '蔬菜', alias: ['玉蔓菁', '球茎甘蓝', '大头菜'] },
  { name: '苦瓜(鲜)', kcal: 22, protein: 1.0, fat: 0.1, carbs: 4.9, fiber: 1.4, cat: '蔬菜', alias: ['凉瓜', '癞瓜'] },
  { name: '苦菜', kcal: 46, protein: 2.8, fat: 0.6, carbs: 10.0, fiber: 5.4, cat: '蔬菜', alias: ['节节花', '拒马菜'] },
  { name: '茄子(圆)', kcal: 32, protein: 1.6, fat: 0.2, carbs: 6.7, fiber: 1.7, cat: '蔬菜' },
  { name: '茄子(白皮、长)', kcal: 21, protein: 1.3, fat: 0.1, carbs: 5.5, fiber: 0, cat: '蔬菜' },
  { name: '茄子(紫皮、圆)', kcal: 23, protein: 0.8, fat: 0.2, carbs: 5.3, fiber: 0, cat: '蔬菜' },
  { name: '茄子(紫皮、长)', kcal: 18, protein: 1.1, fat: 0.1, carbs: 4.8, fiber: 0, cat: '蔬菜' },
  { name: '茄子(绿皮)', kcal: 28, protein: 1.0, fat: 0.6, carbs: 5.2, fiber: 1.2, cat: '蔬菜' },
  { name: '茭白(鲜)', kcal: 26, protein: 1.2, fat: 0.2, carbs: 5.9, fiber: 1.9, cat: '蔬菜', alias: ['茭笋', '茭粑'] },
  { name: '茴香(鲜)', kcal: 27, protein: 2.5, fat: 0.4, carbs: 4.2, fiber: 1.6, cat: '蔬菜', alias: ['小茴香'] },
  { name: '茼蒿(鲜)', kcal: 24, protein: 1.9, fat: 0.3, carbs: 3.9, fiber: 1.2, cat: '蔬菜', alias: ['蓬蒿菜', '艾菜'] },
  { name: '草菇', kcal: 27, protein: 2.7, fat: 0.2, carbs: 4.3, fiber: 1.6, cat: '蔬菜', alias: ['大黑头细花草', '稻菇'] },
  { name: '荠菜(鲜)', kcal: 31, protein: 2.9, fat: 0.4, carbs: 4.7, fiber: 1.7, cat: '蔬菜', alias: ['蓟菜', '菱角菜'] },
  { name: '荷兰豆', kcal: 30, protein: 2.5, fat: 0.3, carbs: 4.9, fiber: 1.4, cat: '蔬菜' },
  { name: '荸荠(鲜)', kcal: 61, protein: 1.2, fat: 0.2, carbs: 14.2, fiber: 1.1, cat: '蔬菜', alias: ['马蹄', '地栗'] },
  { name: '莴笋(鲜)', kcal: 15, protein: 1.0, fat: 0.1, carbs: 2.8, fiber: 0.6, cat: '蔬菜', alias: ['莴苣'] },
  { name: '莴笋叶', kcal: 15, protein: 1.0, fat: 0.2, carbs: 2.9, fiber: 0, cat: '蔬菜', alias: ['莴苣菜'] },
  { name: '莼菜(瓶装)', kcal: 21, protein: 1.4, fat: 0.1, carbs: 3.8, fiber: 0.5, cat: '蔬菜', alias: ['花案菜'] },
  { name: '菊苣', kcal: 19, protein: 1.3, fat: 0.2, carbs: 3.4, fiber: 0.9, cat: '蔬菜' },
  { name: '菜瓜', kcal: 19, protein: 0.6, fat: 0.2, carbs: 3.9, fiber: 0.4, cat: '蔬菜', alias: ['生瓜', '白瓜'] },
  { name: '菜花(白色)', kcal: 20, protein: 1.7, fat: 0.2, carbs: 4.2, fiber: 2.1, cat: '蔬菜', alias: ['花椰菜'] },
  { name: '菠菜(鲜)', kcal: 28, protein: 2.6, fat: 0.3, carbs: 4.5, fiber: 1.7, cat: '蔬菜', alias: ['赤根菜'] },
  { name: '萝卜缨(小萝卜)', kcal: 23, protein: 1.6, fat: 0.3, carbs: 4.1, fiber: 1.4, cat: '蔬菜' },
  { name: '萝卜缨(白)', kcal: 17, protein: 2.6, fat: 0.3, carbs: 1.7, fiber: 1.4, cat: '蔬菜' },
  { name: '萝卜缨(青)', kcal: 38, protein: 3.1, fat: 0.1, carbs: 7.6, fiber: 2.9, cat: '蔬菜' },
  { name: '落葵', kcal: 23, protein: 1.6, fat: 0.3, carbs: 4.3, fiber: 1.5, cat: '蔬菜', alias: ['木耳菜', '软浆菜'] },
  { name: '葛(鲜)', kcal: 150, protein: 2.2, fat: 0.2, carbs: 36.1, fiber: 2.4, cat: '蔬菜', alias: ['葛薯', '粉葛'] },
  { name: '葫子', kcal: 29, protein: 0.7, fat: 0.1, carbs: 6.8, fiber: 0.9, cat: '蔬菜' },
  { name: '葫芦', kcal: 16, protein: 0.7, fat: 0.1, carbs: 3.5, fiber: 0.8, cat: '蔬菜', alias: ['长瓜', '蒲瓜', '瓠瓜'] },
  { name: '蒜薹(圆)', kcal: 66, protein: 2.0, fat: 0.1, carbs: 15.4, fiber: 2.5, cat: '蔬菜' },
  { name: '蒜黄(黄色)', kcal: 24, protein: 2.5, fat: 0.2, carbs: 3.8, fiber: 1.4, cat: '蔬菜' },
  { name: '蒲菜(鲜)', kcal: 14, protein: 1.2, fat: 0.1, carbs: 2.4, fiber: 0.9, cat: '蔬菜', alias: ['香蒲', '甘蒲', '野茭白'] },
  { name: '蕹菜', kcal: 19, protein: 2.2, fat: 0.2, carbs: 4.0, fiber: 0, cat: '蔬菜', alias: ['空心菜', '藤藤菜'] },
  { name: '薤白(鲜)', kcal: 124, protein: 3.4, fat: 0.4, carbs: 27.1, fiber: 0.9, cat: '蔬菜', alias: ['小根蒜', '山蒜', '团蒜'] },
  { name: '藕', kcal: 47, protein: 1.2, fat: 0.2, carbs: 11.5, fiber: 2.2, cat: '蔬菜', alias: ['莲藕'] },
  { name: '蘑菇(鲜蘑)', kcal: 24, protein: 2.7, fat: 0.1, carbs: 4.1, fiber: 2.1, cat: '蔬菜' },
  { name: '蚕豆(鲜)', kcal: 111, protein: 8.8, fat: 0.4, carbs: 19.5, fiber: 3.1, cat: '蔬菜' },
  { name: '蛇瓜', kcal: 18, protein: 1.5, fat: 0.1, carbs: 3.9, fiber: 2.0, cat: '蔬菜', alias: ['蛇豆', '大豆角'] },
  { name: '西芹', kcal: 17, protein: 0.6, fat: 0.1, carbs: 4.8, fiber: 2.2, cat: '蔬菜', alias: ['西洋芹菜', '美芹'] },
  { name: '西葫芦', kcal: 19, protein: 0.8, fat: 0.2, carbs: 3.8, fiber: 0.6, cat: '蔬菜' },
  { name: '观达菜', kcal: 23, protein: 1.9, fat: 0.3, carbs: 4.5, fiber: 2.8, cat: '蔬菜', alias: ['根达菜', '牛皮菜'] },
  { name: '豆瓣菜(鲜)', kcal: 20, protein: 2.9, fat: 0.5, carbs: 1.5, fiber: 1.2, cat: '蔬菜', alias: ['西洋菜', '水田芥'] },
  { name: '豆薯(鲜)', kcal: 56, protein: 0.9, fat: 0.1, carbs: 13.4, fiber: 0.8, cat: '蔬菜', alias: ['凉薯', '地瓜', '沙葛'] },
  { name: '豆角', kcal: 34, protein: 2.5, fat: 0.2, carbs: 6.7, fiber: 2.1, cat: '蔬菜' },
  { name: '豇豆', kcal: 32, protein: 2.2, fat: 0.3, carbs: 7.3, fiber: 0, cat: '蔬菜' },
  { name: '豇豆(长)', kcal: 32, protein: 2.7, fat: 0.2, carbs: 5.8, fiber: 1.8, cat: '蔬菜' },
  { name: '豌豆苗', kcal: 32, protein: 4.8, fat: 0.8, carbs: 2.6, fiber: 0, cat: '蔬菜' },
  { name: '软化白菊苣', kcal: 17, protein: 1.5, fat: 0.2, carbs: 3.1, fiber: 0, cat: '蔬菜' },
  { name: '辣椒(小红尖辣椒)', kcal: 62, protein: 4.1, fat: 0.4, carbs: 17.7, fiber: 11.8, cat: '蔬菜' },
  { name: '辣椒(青、尖)', kcal: 22, protein: 0.8, fat: 0.3, carbs: 5.2, fiber: 0, cat: '蔬菜' },
  { name: '迷你黄瓜', kcal: 14, protein: 1.0, fat: 0.2, carbs: 2.5, fiber: 0, cat: '蔬菜', alias: ['荷兰乳黄瓜'] },
  { name: '酸白菜', kcal: 10, protein: 0.7, fat: 0.2, carbs: 2.6, fiber: 0, cat: '蔬菜', alias: ['酸菜'] },
  { name: '金丝瓜', kcal: 38, protein: 3.3, fat: 2.0, carbs: 2.2, fiber: 0.8, cat: '蔬菜', alias: ['裸瓣瓜'] },
  { name: '金瓜', kcal: 15, protein: 0.5, fat: 0.1, carbs: 3.4, fiber: 0.7, cat: '蔬菜' },
  { name: '金针菇(罐装)', kcal: 26, protein: 1.0, fat: 0.0, carbs: 6.7, fiber: 2.5, cat: '蔬菜' },
  { name: '金针菇(鲜)', kcal: 32, protein: 2.4, fat: 0.4, carbs: 6.0, fiber: 2.7, cat: '蔬菜', alias: ['智力菇'] },
  { name: '青头菌', kcal: 20, protein: 2.7, fat: 0.1, carbs: 3.1, fiber: 2.2, cat: '蔬菜', alias: ['变绿红菇', '绿菇'] },
  { name: '青萝卜', kcal: 29, protein: 1.2, fat: 0.2, carbs: 6.9, fiber: 0, cat: '蔬菜' },
  { name: '青蒜(青葱)', kcal: 34, protein: 2.4, fat: 0.3, carbs: 6.2, fiber: 1.7, cat: '蔬菜' },
  { name: '面西胡瓜', kcal: 10, protein: 0.8, fat: 0.0, carbs: 1.8, fiber: 0, cat: '蔬菜' },
  { name: '鞭笋(鲜)', kcal: 24, protein: 2.6, fat: 0.0, carbs: 6.7, fiber: 6.6, cat: '蔬菜', alias: ['马鞭笋'] },
  { name: '韭薹', kcal: 37, protein: 2.2, fat: 0.1, carbs: 7.8, fiber: 1.9, cat: '蔬菜' },
  { name: '飞碟瓜', kcal: 18, protein: 1.0, fat: 0.1, carbs: 4.4, fiber: 1.6, cat: '蔬菜' },
  { name: '香瓜茄', kcal: 21, protein: 0.6, fat: 0.0, carbs: 5.5, fiber: 0.6, cat: '蔬菜' },
  { name: '香菇(鲜)', kcal: 26, protein: 2.2, fat: 0.3, carbs: 5.2, fiber: 3.3, cat: '蔬菜', alias: ['香蕈', '冬菇'] },
  { name: '香菜(鲜)', kcal: 33, protein: 1.8, fat: 0.4, carbs: 6.2, fiber: 1.2, cat: '蔬菜', alias: ['芫荽'] },
  { name: '鸡枞', kcal: 19, protein: 2.5, fat: 0.2, carbs: 2.5, fiber: 1.3, cat: '蔬菜', alias: ['蚁枞', '伞把菇', '鸡枞菌'] },
  { name: '鸡枞花', kcal: 18, protein: 2.3, fat: 0.3, carbs: 1.8, fiber: 0.8, cat: '蔬菜' },
  { name: '鸡毛菜', kcal: 19, protein: 2.7, fat: 0.2, carbs: 2.6, fiber: 0, cat: '蔬菜' },
  { name: '鸡油菌', kcal: 26, protein: 2.0, fat: 0.3, carbs: 5.1, fiber: 2.6, cat: '蔬菜', alias: ['黄丝菌', '杏菌'] },
  { name: '黄瓜(鲜)', kcal: 16, protein: 0.8, fat: 0.2, carbs: 2.9, fiber: 0.5, cat: '蔬菜', alias: ['胡瓜'] },
  { name: '黄茎瓜', kcal: 19, protein: 1.2, fat: 0.9, carbs: 2.0, fiber: 0.7, cat: '蔬菜', alias: ['小南瓜'] },
  { name: '黄蘑(水发)', kcal: 30, protein: 4.3, fat: 0.4, carbs: 4.8, fiber: 4.8, cat: '蔬菜' },
  { name: '黄豆芽', kcal: 47, protein: 4.5, fat: 1.6, carbs: 4.5, fiber: 1.5, cat: '蔬菜' },
  { name: '黄金西葫芦', kcal: 17, protein: 1.8, fat: 0.1, carbs: 3.6, fiber: 0, cat: '蔬菜' },
  { name: '黑豆苗', kcal: 30, protein: 4.4, fat: 0.8, carbs: 2.6, fiber: 1.6, cat: '蔬菜' },
  { name: '龙牙豆(鲜)', kcal: 19, protein: 2.6, fat: 0.2, carbs: 2.4, fiber: 1.3, cat: '蔬菜', alias: ['玉豆'] },
  { name: '龙豆(鲜)', kcal: 36, protein: 3.7, fat: 0.5, carbs: 5.0, fiber: 1.9, cat: '蔬菜' },
  { name: '三湖红橘', kcal: 43, protein: 0.8, fat: 0.3, carbs: 10.0, fiber: 1.3, cat: '水果' },
  { name: '中华猕猴桃', kcal: 61, protein: 0.8, fat: 0.6, carbs: 14.5, fiber: 2.6, cat: '水果', alias: ['毛叶猕猴桃'] },
  { name: '乐陵枣', kcal: 233, protein: 3.3, fat: 0.6, carbs: 57.9, fiber: 8.8, cat: '水果' },
  { name: '五月鲜桃', kcal: 41, protein: 0.4, fat: 0.1, carbs: 10.0, fiber: 0.9, cat: '水果' },
  { name: '京白梨', kcal: 57, protein: 0.2, fat: 0.5, carbs: 13.7, fiber: 1.4, cat: '水果' },
  { name: '人参果', kcal: 86, protein: 0.6, fat: 0.7, carbs: 21.2, fiber: 3.5, cat: '水果' },
  { name: '伏苹果', kcal: 48, protein: 0.5, fat: 0.1, carbs: 11.8, fiber: 1.2, cat: '水果' },
  { name: '余柑子', kcal: 45, protein: 0.3, fat: 0.1, carbs: 12.4, fiber: 3.4, cat: '水果', alias: ['油柑子'] },
  { name: '倭锦苹果', kcal: 54, protein: 0.2, fat: 0.2, carbs: 13.6, fiber: 1.7, cat: '水果' },
  { name: '冬果梨', kcal: 46, protein: 0.4, fat: 0.2, carbs: 12.8, fiber: 4.3, cat: '水果' },
  { name: '冬枣', kcal: 113, protein: 1.8, fat: 0.2, carbs: 27.8, fiber: 2.2, cat: '水果' },
  { name: '刺梨', kcal: 63, protein: 0.7, fat: 0.1, carbs: 16.9, fiber: 4.1, cat: '水果', alias: ['茨梨', '木梨子'] },
  { name: '印度苹果', kcal: 54, protein: 0.6, fat: 0.2, carbs: 14.8, fiber: 4.9, cat: '水果' },
  { name: '吊蛋', kcal: 65, protein: 0.8, fat: 0.4, carbs: 16.8, fiber: 4.4, cat: '水果' },
  { name: '哈密瓜', kcal: 34, protein: 0.5, fat: 0.1, carbs: 7.9, fiber: 0.2, cat: '水果' },
  { name: '国光苹果', kcal: 56, protein: 0.3, fat: 0.3, carbs: 13.3, fiber: 0.8, cat: '水果' },
  { name: '子瓜', kcal: 5, protein: 0.2, fat: 0.3, carbs: 0.6, fiber: 0.5, cat: '水果' },
  { name: '密云小枣', kcal: 229, protein: 3.9, fat: 0.8, carbs: 55.2, fiber: 7.3, cat: '水果' },
  { name: '小叶橘', kcal: 40, protein: 1.1, fat: 0.2, carbs: 8.8, fiber: 0.9, cat: '水果' },
  { name: '小枣(干)', kcal: 275, protein: 2.7, fat: 0.7, carbs: 66.8, fiber: 0, cat: '水果' },
  { name: '小西瓜', kcal: 30, protein: 0.8, fat: 0.1, carbs: 6.7, fiber: 0, cat: '水果', alias: ['地雷瓜'] },
  { name: '山竹', kcal: 72, protein: 0.4, fat: 0.2, carbs: 18.0, fiber: 0.4, cat: '水果' },
  { name: '布朗', kcal: 44, protein: 0.6, fat: 0.2, carbs: 10.7, fiber: 0, cat: '水果' },
  { name: '庆丰桃', kcal: 42, protein: 0.6, fat: 0.1, carbs: 10.1, fiber: 0.9, cat: '水果' },
  { name: '库尔勒香梨', kcal: 42, protein: 0.1, fat: 0.1, carbs: 13.4, fiber: 6.7, cat: '水果' },
  { name: '无花果', kcal: 65, protein: 1.5, fat: 0.1, carbs: 16.0, fiber: 3.0, cat: '水果' },
  { name: '无花果(干)', kcal: 361, protein: 3.6, fat: 4.3, carbs: 77.8, fiber: 0, cat: '水果' },
  { name: '早桃(黄)', kcal: 41, protein: 0.4, fat: 0.1, carbs: 10.1, fiber: 1.1, cat: '水果' },
  { name: '早橘', kcal: 57, protein: 1.2, fat: 0.2, carbs: 12.6, fiber: 0.1, cat: '水果' },
  { name: '早酥梨', kcal: 50, protein: 0.2, fat: 0.2, carbs: 13.6, fiber: 3.6, cat: '水果' },
  { name: '旱久保桃', kcal: 48, protein: 0.9, fat: 0.1, carbs: 11.3, fiber: 0.8, cat: '水果' },
  { name: '旱苹果', kcal: 34, protein: 0.4, fat: 0.2, carbs: 8.4, fiber: 1.7, cat: '水果' },
  { name: '明月梨', kcal: 54, protein: 0.3, fat: 0.2, carbs: 13.3, fiber: 0.9, cat: '水果' },
  { name: '晚桃(黄)', kcal: 41, protein: 0.7, fat: 0.2, carbs: 9.6, fiber: 1.0, cat: '水果' },
  { name: '木梨', kcal: 32, protein: 0.4, fat: 0.1, carbs: 8.2, fiber: 1.9, cat: '水果' },
  { name: '木瓜', kcal: 29, protein: 0.4, fat: 0.1, carbs: 7.0, fiber: 0.8, cat: '水果', alias: ['番木瓜'] },
  { name: '李子', kcal: 38, protein: 0.7, fat: 0.2, carbs: 8.7, fiber: 0.9, cat: '水果' },
  { name: '李子杏', kcal: 37, protein: 1.0, fat: 0.1, carbs: 8.6, fiber: 1.1, cat: '水果' },
  { name: '杏', kcal: 38, protein: 0.9, fat: 0.1, carbs: 9.1, fiber: 1.3, cat: '水果' },
  { name: '杏干', kcal: 338, protein: 2.7, fat: 0.4, carbs: 83.2, fiber: 4.4, cat: '水果' },
  { name: '杨桃', kcal: 31, protein: 0.6, fat: 0.2, carbs: 7.4, fiber: 1.2, cat: '水果' },
  { name: '杨梅', kcal: 30, protein: 0.8, fat: 0.2, carbs: 6.7, fiber: 1.0, cat: '水果', alias: ['树梅', '山杨梅'] },
  { name: '枇杷', kcal: 41, protein: 0.8, fat: 0.2, carbs: 9.3, fiber: 0.8, cat: '水果' },
  { name: '枣(干)', kcal: 276, protein: 3.2, fat: 0.5, carbs: 67.8, fiber: 6.2, cat: '水果' },
  { name: '枣(金丝小枣)', kcal: 308, protein: 1.2, fat: 1.1, carbs: 76.7, fiber: 7.0, cat: '水果' },
  { name: '枣(鲜)', kcal: 125, protein: 1.1, fat: 0.3, carbs: 30.5, fiber: 1.9, cat: '水果' },
  { name: '柚', kcal: 42, protein: 0.8, fat: 0.2, carbs: 9.5, fiber: 0.4, cat: '水果', alias: ['文旦'] },
  { name: '柠檬', kcal: 37, protein: 1.1, fat: 1.2, carbs: 6.2, fiber: 1.3, cat: '水果' },
  { name: '柿', kcal: 74, protein: 0.4, fat: 0.1, carbs: 18.5, fiber: 1.4, cat: '水果' },
  { name: '柿饼', kcal: 255, protein: 1.8, fat: 0.2, carbs: 62.8, fiber: 2.6, cat: '水果' },
  { name: '桂圆', kcal: 71, protein: 1.2, fat: 0.1, carbs: 16.6, fiber: 0.4, cat: '水果' },
  { name: '桂圆(干)', kcal: 277, protein: 5.0, fat: 0.2, carbs: 64.8, fiber: 2.0, cat: '水果' },
  { name: '桂圆肉', kcal: 317, protein: 4.6, fat: 1.0, carbs: 73.5, fiber: 2.0, cat: '水果' },
  { name: '桃', kcal: 42, protein: 0.6, fat: 0.1, carbs: 10.1, fiber: 1.0, cat: '水果' },
  { name: '桃(久保桃)', kcal: 42, protein: 0.6, fat: 0.1, carbs: 10.0, fiber: 0.6, cat: '水果' },
  { name: '桃(黄桃)', kcal: 56, protein: 0.5, fat: 0.1, carbs: 14.0, fiber: 1.2, cat: '水果' },
  { name: '桑葚', kcal: 57, protein: 1.7, fat: 0.4, carbs: 13.8, fiber: 4.1, cat: '水果' },
  { name: '桑葚(干)', kcal: 298, protein: 21.1, fat: 6.1, carbs: 54.2, fiber: 29.3, cat: '水果' },
  { name: '桑葚(白)', kcal: 60, protein: 1.8, fat: 0.3, carbs: 14.9, fiber: 4.9, cat: '水果' },
  { name: '桑葚(红)', kcal: 55, protein: 1.6, fat: 0.4, carbs: 12.9, fiber: 3.3, cat: '水果' },
  { name: '梅', kcal: 34, protein: 0.9, fat: 0.9, carbs: 6.2, fiber: 1.0, cat: '水果', alias: ['青梅'] },
  { name: '梨', kcal: 51, protein: 0.3, fat: 0.1, carbs: 13.1, fiber: 2.6, cat: '水果' },
  { name: '梨(巴梨)', kcal: 51, protein: 0.4, fat: 0.2, carbs: 12.9, fiber: 2.2, cat: '水果' },
  { name: '椰子', kcal: 241, protein: 4.0, fat: 12.1, carbs: 31.3, fiber: 4.7, cat: '水果' },
  { name: '榴莲', kcal: 150, protein: 2.6, fat: 3.3, carbs: 28.3, fiber: 1.7, cat: '水果' },
  { name: '樱桃', kcal: 46, protein: 1.1, fat: 0.2, carbs: 10.2, fiber: 0.3, cat: '水果' },
  { name: '橄榄(白榄)', kcal: 57, protein: 0.8, fat: 0.2, carbs: 15.1, fiber: 4.0, cat: '水果' },
  { name: '橘(四川红橘)', kcal: 42, protein: 0.7, fat: 0.1, carbs: 9.8, fiber: 0.7, cat: '水果' },
  { name: '橘(金橘)', kcal: 58, protein: 1.0, fat: 0.2, carbs: 13.7, fiber: 1.4, cat: '水果', alias: ['金枣'] },
  { name: '橘柑子', kcal: 44, protein: 0.8, fat: 0.1, carbs: 10.2, fiber: 0.5, cat: '水果', alias: ['宽皮桂'] },
  { name: '橘饼', kcal: 371, protein: 0.6, fat: 0.4, carbs: 92.9, fiber: 3.5, cat: '水果' },
  { name: '橙', kcal: 48, protein: 0.8, fat: 0.2, carbs: 11.1, fiber: 0.6, cat: '水果' },
  { name: '沙果', kcal: 70, protein: 0.4, fat: 0.1, carbs: 17.8, fiber: 2.0, cat: '水果' },
  { name: '沙棘', kcal: 120, protein: 0.9, fat: 1.8, carbs: 25.5, fiber: 0.8, cat: '水果' },
  { name: '海棠果', kcal: 76, protein: 0.3, fat: 0.2, carbs: 19.2, fiber: 1.8, cat: '水果', alias: ['楸子'] },
  { name: '灵蜜瓜', kcal: 4, protein: 0.5, fat: 0.1, carbs: 0.4, fiber: 0.4, cat: '水果' },
  { name: '甜瓜', kcal: 26, protein: 0.4, fat: 0.1, carbs: 6.2, fiber: 0.4, cat: '水果', alias: ['香瓜'] },
  { name: '番石榴', kcal: 53, protein: 1.1, fat: 0.4, carbs: 14.2, fiber: 5.9, cat: '水果', alias: ['鸡矢果', '番桃'] },
  { name: '白兰瓜', kcal: 23, protein: 0.6, fat: 0.1, carbs: 5.3, fiber: 0.8, cat: '水果' },
  { name: '白粉桃', kcal: 26, protein: 1.3, fat: 0.1, carbs: 5.5, fiber: 0.9, cat: '水果' },
  { name: '石榴', kcal: 72, protein: 1.3, fat: 0.2, carbs: 18.5, fiber: 4.9, cat: '水果' },
  { name: '石榴(玛瑙)', kcal: 72, protein: 1.6, fat: 0.2, carbs: 18.4, fiber: 4.7, cat: '水果' },
  { name: '石榴(红粉皮)', kcal: 74, protein: 1.3, fat: 0.1, carbs: 19.4, fiber: 4.9, cat: '水果' },
  { name: '石榴(青皮)', kcal: 71, protein: 1.2, fat: 0.2, carbs: 18.5, fiber: 4.9, cat: '水果' },
  { name: '磨盘柿', kcal: 79, protein: 0.7, fat: 0.1, carbs: 19.6, fiber: 1.5, cat: '水果' },
  { name: '祝光苹果', kcal: 50, protein: 0.4, fat: 0.1, carbs: 12.5, fiber: 1.5, cat: '水果' },
  { name: '福橘', kcal: 46, protein: 1.0, fat: 0.2, carbs: 10.3, fiber: 0.4, cat: '水果' },
  { name: '秋里蒙苹果', kcal: 43, protein: 0.2, fat: 0.2, carbs: 11.9, fiber: 3.7, cat: '水果' },
  { name: '紫葡萄', kcal: 45, protein: 0.7, fat: 0.3, carbs: 10.3, fiber: 1.0, cat: '水果' },
  { name: '紫酥梨', kcal: 51, protein: 0.3, fat: 0.1, carbs: 13.3, fiber: 2.0, cat: '水果' },
  { name: '红元帅苹果', kcal: 60, protein: 0.2, fat: 0.4, carbs: 14.3, fiber: 0.6, cat: '水果' },
  { name: '红富士苹果', kcal: 49, protein: 0.7, fat: 0.4, carbs: 11.7, fiber: 2.1, cat: '水果' },
  { name: '红提子葡萄', kcal: 54, protein: 0.4, fat: 0.2, carbs: 13.1, fiber: 0, cat: '水果' },
  { name: '红星苹果', kcal: 58, protein: 0.4, fat: 0.1, carbs: 14.3, fiber: 0.8, cat: '水果' },
  { name: '红果', kcal: 102, protein: 0.5, fat: 0.6, carbs: 25.1, fiber: 3.1, cat: '水果', alias: ['山里红', '大山楂'] },
  { name: '红果(干)', kcal: 251, protein: 4.3, fat: 2.2, carbs: 78.4, fiber: 49.7, cat: '水果' },
  { name: '红毛丹', kcal: 82, protein: 1.0, fat: 1.2, carbs: 17.5, fiber: 0.5, cat: '水果' },
  { name: '红玉苹果', kcal: 52, protein: 0.2, fat: 0.2, carbs: 14.7, fiber: 4.7, cat: '水果' },
  { name: '红玫瑰葡萄', kcal: 42, protein: 0.4, fat: 0.2, carbs: 10.7, fiber: 2.2, cat: '水果' },
  { name: '红肖梨', kcal: 36, protein: 0.2, fat: 0.0, carbs: 10.5, fiber: 3.2, cat: '水果' },
  { name: '红香蕉苹果', kcal: 51, protein: 0.4, fat: 0.2, carbs: 12.3, fiber: 0.9, cat: '水果' },
  { name: '芒果', kcal: 35, protein: 0.6, fat: 0.2, carbs: 8.3, fiber: 1.3, cat: '水果', alias: ['抹猛果', '望果'] },
  { name: '芒果(大头)', kcal: 52, protein: 0.5, fat: 0.1, carbs: 12.9, fiber: 1.1, cat: '水果' },
  { name: '芦橘', kcal: 44, protein: 0.6, fat: 0.2, carbs: 10.3, fiber: 0.6, cat: '水果' },
  { name: '芭蕉', kcal: 115, protein: 1.2, fat: 0.1, carbs: 28.9, fiber: 3.1, cat: '水果', alias: ['甘蕉', '板蕉', '牙蕉'] },
  { name: '苏木梨', kcal: 52, protein: 0.6, fat: 0.3, carbs: 13.1, fiber: 2.5, cat: '水果' },
  { name: '苏梅梨', kcal: 77, protein: 1.2, fat: 0.2, carbs: 20.5, fiber: 5.7, cat: '水果' },
  { name: '苹果梨', kcal: 53, protein: 0.2, fat: 0.1, carbs: 13.9, fiber: 2.3, cat: '水果' },
  { name: '草莓', kcal: 32, protein: 1.0, fat: 0.2, carbs: 7.1, fiber: 1.1, cat: '水果', alias: ['洋莓', '凤阳草莓'] },
  { name: '荔枝', kcal: 71, protein: 0.9, fat: 0.2, carbs: 16.6, fiber: 0.5, cat: '水果' },
  { name: '荔枝(干)', kcal: 328, protein: 4.5, fat: 1.2, carbs: 77.4, fiber: 0, cat: '水果' },
  { name: '荷柿', kcal: 65, protein: 0.6, fat: 0.2, carbs: 17.1, fiber: 3.8, cat: '水果' },
  { name: '莱阳梨', kcal: 54, protein: 0.3, fat: 0.2, carbs: 14.1, fiber: 2.6, cat: '水果' },
  { name: '菠萝', kcal: 44, protein: 0.5, fat: 0.1, carbs: 10.8, fiber: 1.3, cat: '水果', alias: ['凤梨', '地菠萝'] },
  { name: '葡萄(巨峰)', kcal: 51, protein: 0.4, fat: 0.2, carbs: 12.0, fiber: 0.4, cat: '水果' },
  { name: '葡萄(玫瑰香)', kcal: 52, protein: 0.4, fat: 0.4, carbs: 12.1, fiber: 1.0, cat: '水果' },
  { name: '葡萄(马奶子)', kcal: 41, protein: 0.5, fat: 0.4, carbs: 9.1, fiber: 0.4, cat: '水果' },
  { name: '葡萄干', kcal: 344, protein: 2.5, fat: 0.4, carbs: 83.4, fiber: 1.6, cat: '水果' },
  { name: '葡萄柚', kcal: 33, protein: 0.7, fat: 0.3, carbs: 7.8, fiber: 0, cat: '水果', alias: ['西柚'] },
  { name: '蒲桃', kcal: 39, protein: 0.5, fat: 0.2, carbs: 10.2, fiber: 2.8, cat: '水果' },
  { name: '蛇果', kcal: 59, protein: 0.1, fat: 0.2, carbs: 14.9, fiber: 0, cat: '水果' },
  { name: '蜜枣', kcal: 333, protein: 1.3, fat: 0.2, carbs: 84.4, fiber: 5.8, cat: '水果', alias: ['椰枣'] },
  { name: '蜜桃', kcal: 46, protein: 0.6, fat: 0.1, carbs: 11.0, fiber: 0.6, cat: '水果' },
  { name: '蜜橘', kcal: 45, protein: 0.8, fat: 0.4, carbs: 10.3, fiber: 1.4, cat: '水果' },
  { name: '西梅', kcal: 42, protein: 0.7, fat: 0.1, carbs: 10.3, fiber: 0.7, cat: '水果' },
  { name: '西瓜', kcal: 31, protein: 0.5, fat: 0.3, carbs: 6.8, fiber: 0.2, cat: '水果' },
  { name: '西瓜(京欣一号)', kcal: 34, protein: 0.5, fat: 0.0, carbs: 8.1, fiber: 0.2, cat: '水果' },
  { name: '西瓜(郑州三号)', kcal: 26, protein: 0.6, fat: 0.1, carbs: 5.7, fiber: 0.2, cat: '水果' },
  { name: '软梨', kcal: 32, protein: 0.4, fat: 0.2, carbs: 11.7, fiber: 9.1, cat: '水果' },
  { name: '酒枣', kcal: 148, protein: 1.6, fat: 0.2, carbs: 35.7, fiber: 1.4, cat: '水果' },
  { name: '酥梨', kcal: 45, protein: 0.3, fat: 0.1, carbs: 11.4, fiber: 1.2, cat: '水果' },
  { name: '酸刺', kcal: 112, protein: 2.8, fat: 0.3, carbs: 25.5, fiber: 2.2, cat: '水果' },
  { name: '酸木瓜', kcal: 41, protein: 0.3, fat: 0.2, carbs: 11.1, fiber: 3.0, cat: '水果' },
  { name: '酸枣', kcal: 300, protein: 3.5, fat: 1.5, carbs: 73.3, fiber: 10.6, cat: '水果' },
  { name: '酸梨', kcal: 33, protein: 0.1, fat: 0.1, carbs: 9.8, fiber: 3.7, cat: '水果' },
  { name: '醋栗', kcal: 46, protein: 0.9, fat: 0.6, carbs: 10.2, fiber: 1.9, cat: '水果', alias: ['灯笼果'] },
  { name: '金元帅苹果', kcal: 53, protein: 0.2, fat: 0.1, carbs: 13.3, fiber: 1.1, cat: '水果' },
  { name: '金塔寺瓜', kcal: 10, protein: 0.6, fat: 0.1, carbs: 2.0, fiber: 0.7, cat: '水果' },
  { name: '金红桃', kcal: 28, protein: 0.7, fat: 0.1, carbs: 6.6, fiber: 1.0, cat: '水果' },
  { name: '锦丰梨', kcal: 51, protein: 0.2, fat: 0.1, carbs: 13.9, fiber: 3.2, cat: '水果' },
  { name: '长把梨', kcal: 62, protein: 0.8, fat: 0.8, carbs: 14.9, fiber: 4.0, cat: '水果' },
  { name: '雪梨', kcal: 79, protein: 0.9, fat: 0.1, carbs: 20.2, fiber: 3.0, cat: '水果' },
  { name: '雪花梨', kcal: 42, protein: 0.2, fat: 0.1, carbs: 10.6, fiber: 0.8, cat: '水果' },
  { name: '青香蕉苹果', kcal: 52, protein: 0.3, fat: 0.1, carbs: 13.1, fiber: 1.3, cat: '水果' },
  { name: '面蛋', kcal: 91, protein: 1.6, fat: 0.5, carbs: 21.7, fiber: 3.3, cat: '水果' },
  { name: '香梨', kcal: 51, protein: 0.3, fat: 0.1, carbs: 13.6, fiber: 2.7, cat: '水果' },
  { name: '香玉苹果', kcal: 62, protein: 0.5, fat: 0.1, carbs: 15.7, fiber: 1.7, cat: '水果' },
  { name: '香蕉(红皮)', kcal: 86, protein: 1.1, fat: 0.2, carbs: 20.8, fiber: 0, cat: '水果' },
  { name: '马蹄黄梨', kcal: 50, protein: 0.3, fat: 0.1, carbs: 12.5, fiber: 1.3, cat: '水果' },
  { name: '高山白桃', kcal: 42, protein: 0.7, fat: 0.2, carbs: 10.1, fiber: 1.3, cat: '水果' },
  { name: '鳄梨', kcal: 171, protein: 2.0, fat: 15.3, carbs: 7.4, fiber: 2.1, cat: '水果' },
  { name: '鸭广梨', kcal: 60, protein: 0.6, fat: 0.2, carbs: 16.5, fiber: 5.1, cat: '水果' },
  { name: '鸭梨', kcal: 45, protein: 0.2, fat: 0.2, carbs: 11.1, fiber: 1.1, cat: '水果' },
  { name: '鹅黄梨', kcal: 41, protein: 0.3, fat: 0.1, carbs: 10.7, fiber: 1.9, cat: '水果' },
  { name: '麻醉瓜', kcal: 17, protein: 0.7, fat: 0.1, carbs: 3.6, fiber: 0.4, cat: '水果' },
  { name: '黄元帅苹果', kcal: 59, protein: 0.2, fat: 0.3, carbs: 14.7, fiber: 1.8, cat: '水果' },
  { name: '黄河蜜瓜', kcal: 11, protein: 0.4, fat: 0.0, carbs: 4.0, fiber: 3.2, cat: '水果' },
  { name: '黄皮果', kcal: 39, protein: 1.6, fat: 0.2, carbs: 9.9, fiber: 4.3, cat: '水果' },
  { name: '黄香蕉苹果', kcal: 53, protein: 0.3, fat: 0.2, carbs: 13.7, fiber: 2.2, cat: '水果' },
  { name: '黑枣(无核)', kcal: 234, protein: 1.7, fat: 0.3, carbs: 57.3, fiber: 2.6, cat: '水果', alias: ['乌枣'] },
  { name: '黑枣(有核)', kcal: 246, protein: 3.7, fat: 0.5, carbs: 61.4, fiber: 9.2, cat: '水果' },
  { name: '黑醋栗', kcal: 66, protein: 1.4, fat: 0.4, carbs: 15.4, fiber: 2.4, cat: '水果', alias: ['黑加仑'] },
  { name: '南瓜子(炒)', kcal: 582, protein: 36.0, fat: 46.1, carbs: 7.9, fiber: 4.1, cat: '脂肪坚果', alias: ['白瓜子'] },
  { name: '南瓜子(熟)', kcal: 615, protein: 26.6, fat: 52.8, carbs: 12.9, fiber: 9.1, cat: '脂肪坚果', alias: ['白瓜子'] },
  { name: '南瓜子仁', kcal: 576, protein: 33.2, fat: 48.1, carbs: 4.9, fiber: 4.9, cat: '脂肪坚果' },
  { name: '夏威夷果', kcal: 718, protein: 7.9, fat: 75.8, carbs: 13.8, fiber: 8.6, cat: '脂肪坚果', alias: ['澳洲坚果', '夏威夷果仁'] },
  { name: '山核桃(干)', kcal: 616, protein: 18.0, fat: 50.4, carbs: 26.2, fiber: 7.4, cat: '脂肪坚果' },
  { name: '山核桃(熟)', kcal: 658, protein: 8.3, fat: 64.5, carbs: 21.3, fiber: 0, cat: '脂肪坚果', alias: ['小核桃'] },
  { name: '巴旦木', kcal: 579, protein: 21.2, fat: 49.9, carbs: 21.6, fiber: 12.5, cat: '脂肪坚果', alias: ['扁桃仁', '美国大杏仁', '巴旦木仁', '大杏仁', '杏仁(进口)'] },
  { name: '开心果(熟)', kcal: 631, protein: 20.6, fat: 53.0, carbs: 21.9, fiber: 8.2, cat: '脂肪坚果' },
  { name: '开心果仁', kcal: 560, protein: 20.2, fat: 45.3, carbs: 27.2, fiber: 10.6, cat: '脂肪坚果', alias: ['开心果(去壳)'] },
  { name: '杏仁(原味)', kcal: 596, protein: 21.3, fat: 50.6, carbs: 19.7, fiber: 11.8, cat: '脂肪坚果' },
  { name: '杏仁(大杏仁)', kcal: 540, protein: 19.9, fat: 42.9, carbs: 27.8, fiber: 18.5, cat: '脂肪坚果' },
  { name: '杏仁(漂白后)', kcal: 602, protein: 21.9, fat: 50.6, carbs: 19.9, fiber: 10.4, cat: '脂肪坚果' },
  { name: '杏仁(炒)', kcal: 618, protein: 25.7, fat: 51.0, carbs: 18.7, fiber: 9.1, cat: '脂肪坚果' },
  { name: '杏仁(过油炸干)', kcal: 631, protein: 21.2, fat: 55.2, carbs: 17.7, fiber: 10.5, cat: '脂肪坚果' },
  { name: '松子(炒)', kcal: 644, protein: 14.1, fat: 58.5, carbs: 21.4, fiber: 12.4, cat: '脂肪坚果' },
  { name: '松子(熟)', kcal: 553, protein: 12.9, fat: 40.4, carbs: 40.3, fiber: 0, cat: '脂肪坚果' },
  { name: '松子(生)', kcal: 665, protein: 12.6, fat: 62.6, carbs: 19.0, fiber: 12.4, cat: '脂肪坚果' },
  { name: '松子仁', kcal: 718, protein: 13.4, fat: 70.6, carbs: 12.2, fiber: 10.0, cat: '脂肪坚果' },
  { name: '核桃(干)', kcal: 646, protein: 14.9, fat: 58.8, carbs: 19.1, fiber: 9.5, cat: '脂肪坚果', alias: ['胡桃'] },
  { name: '核桃(鲜)', kcal: 336, protein: 12.8, fat: 29.9, carbs: 6.1, fiber: 4.3, cat: '脂肪坚果' },
  { name: '棉籽油', kcal: 899, protein: 0.0, fat: 99.8, carbs: 0.1, fiber: 0, cat: '脂肪坚果' },
  { name: '椰子油', kcal: 899, protein: 0.0, fat: 99.9, carbs: 0.0, fiber: 0, cat: '脂肪坚果' },
  { name: '榛子(干)', kcal: 561, protein: 20.0, fat: 44.8, carbs: 24.3, fiber: 9.6, cat: '脂肪坚果' },
  { name: '榛子(炒)', kcal: 611, protein: 30.5, fat: 50.3, carbs: 13.1, fiber: 8.2, cat: '脂肪坚果' },
  { name: '榛子(熟)', kcal: 642, protein: 12.5, fat: 57.3, carbs: 25.6, fiber: 12.9, cat: '脂肪坚果' },
  { name: '榛子仁(熟)', kcal: 628, protein: 15.6, fat: 52.9, carbs: 26.7, fiber: 0, cat: '脂肪坚果' },
  { name: '橄榄油', kcal: 899, protein: 0.0, fat: 99.9, carbs: 0.0, fiber: 0, cat: '脂肪坚果' },
  { name: '毛核桃', kcal: 184, protein: 12.0, fat: 6.7, carbs: 21.7, fiber: 5.4, cat: '脂肪坚果' },
  { name: '牛油(板油)', kcal: 835, protein: 0.0, fat: 92.0, carbs: 1.8, fiber: 0, cat: '脂肪坚果' },
  { name: '牛油(炼)', kcal: 898, protein: 0.0, fat: 99.7, carbs: 0.1, fiber: 0, cat: '脂肪坚果' },
  { name: '猪油(板油)', kcal: 827, protein: 0.0, fat: 88.7, carbs: 7.2, fiber: 0, cat: '脂肪坚果' },
  { name: '猪油(炼)', kcal: 897, protein: 0.0, fat: 99.6, carbs: 0.2, fiber: 0, cat: '脂肪坚果' },
  { name: '玉米油', kcal: 895, protein: 0.0, fat: 99.2, carbs: 0.5, fiber: 0, cat: '脂肪坚果' },
  { name: '碧根果', kcal: 691, protein: 9.2, fat: 72.0, carbs: 13.9, fiber: 9.6, cat: '脂肪坚果', alias: ['长寿果', '美国山核桃', '碧根果仁'] },
  { name: '红花油', kcal: 899, protein: 0.0, fat: 99.9, carbs: 0.0, fiber: 0, cat: '脂肪坚果' },
  { name: '羊油(板油)', kcal: 824, protein: 0.0, fat: 88.0, carbs: 8.0, fiber: 0, cat: '脂肪坚果' },
  { name: '羊油(炼)', kcal: 895, protein: 0.0, fat: 99.0, carbs: 0.9, fiber: 0, cat: '脂肪坚果' },
  { name: '胡麻子', kcal: 450, protein: 19.1, fat: 30.7, carbs: 39.5, fiber: 30.2, cat: '脂肪坚果' },
  { name: '腰果(熟)', kcal: 615, protein: 24.0, fat: 50.9, carbs: 20.4, fiber: 10.4, cat: '脂肪坚果' },
  { name: '色拉油', kcal: 898, protein: 0.0, fat: 99.8, carbs: 0.0, fiber: 0, cat: '脂肪坚果' },
  { name: '芝麻子(白)', kcal: 536, protein: 18.4, fat: 39.6, carbs: 31.5, fiber: 9.8, cat: '脂肪坚果' },
  { name: '芝麻子(黑)', kcal: 559, protein: 19.1, fat: 46.1, carbs: 24.0, fiber: 14.0, cat: '脂肪坚果' },
  { name: '芝麻油', kcal: 898, protein: 0.0, fat: 99.7, carbs: 0.2, fiber: 0, cat: '脂肪坚果', alias: ['香油'] },
  { name: '芡实米(鲜)', kcal: 145, protein: 4.4, fat: 0.2, carbs: 31.5, fiber: 0.4, cat: '脂肪坚果', alias: ['鸡头米'] },
  { name: '花生(炒)', kcal: 601, protein: 21.7, fat: 48.0, carbs: 23.8, fiber: 6.3, cat: '脂肪坚果' },
  { name: '花生(鲜)', kcal: 313, protein: 12.0, fat: 25.4, carbs: 13.0, fiber: 7.7, cat: '脂肪坚果', alias: ['落花生', '长生果'] },
  { name: '花生仁(油炸)', kcal: 583, protein: 22.2, fat: 47.1, carbs: 26.2, fiber: 17.2, cat: '脂肪坚果' },
  { name: '花生仁(炒)', kcal: 589, protein: 23.9, fat: 44.4, carbs: 25.7, fiber: 4.3, cat: '脂肪坚果' },
  { name: '花生仁(生)', kcal: 574, protein: 24.8, fat: 44.3, carbs: 21.7, fiber: 5.5, cat: '脂肪坚果' },
  { name: '花生油', kcal: 899, protein: 0.0, fat: 99.9, carbs: 0.0, fiber: 0, cat: '脂肪坚果' },
  { name: '茶油', kcal: 899, protein: 0.0, fat: 99.9, carbs: 0.0, fiber: 0, cat: '脂肪坚果' },
  { name: '菜籽油', kcal: 899, protein: 0.0, fat: 99.9, carbs: 0.0, fiber: 0, cat: '脂肪坚果', alias: ['青油'] },
  { name: '葵花子(生)', kcal: 609, protein: 23.9, fat: 49.9, carbs: 19.1, fiber: 6.1, cat: '脂肪坚果' },
  { name: '葵花子仁', kcal: 615, protein: 19.1, fat: 53.4, carbs: 16.7, fiber: 4.5, cat: '脂肪坚果' },
  { name: '葵花子油', kcal: 899, protein: 0.0, fat: 99.9, carbs: 0.0, fiber: 0, cat: '脂肪坚果' },
  { name: '西瓜子', kcal: 567, protein: 30.3, fat: 46.5, carbs: 13.4, fiber: 13.2, cat: '脂肪坚果' },
  { name: '西瓜子(炒)', kcal: 582, protein: 32.7, fat: 44.8, carbs: 14.2, fiber: 4.5, cat: '脂肪坚果' },
  { name: '西瓜子(熟)', kcal: 550, protein: 29.0, fat: 46.0, carbs: 9.5, fiber: 8.9, cat: '脂肪坚果', alias: ['黑瓜子'] },
  { name: '西瓜子仁', kcal: 566, protein: 32.4, fat: 45.9, carbs: 8.6, fiber: 5.4, cat: '脂肪坚果' },
  { name: '豆油', kcal: 899, protein: 0.0, fat: 99.9, carbs: 0.0, fiber: 0, cat: '脂肪坚果' },
  { name: '香榧(熟)', kcal: 644, protein: 12.4, fat: 57.0, carbs: 26.9, fiber: 0, cat: '脂肪坚果' },
  { name: '鸭油(炼)', kcal: 897, protein: 0.0, fat: 99.7, carbs: 0.0, fiber: 0, cat: '脂肪坚果' },
  { name: '麦胚油', kcal: 899, protein: 0.0, fat: 99.9, carbs: 0.0, fiber: 0, cat: '脂肪坚果' },
  { name: '可乐', kcal: 43, protein: 0, fat: 0, carbs: 10.8, fiber: 0, cat: '其他', alias: ['可乐(含糖)', '汽水'] },
  { name: '燕窝', kcal: 320, protein: 57.9, fat: 0.2, carbs: 21.7, fiber: 0, cat: '其他' },
  { name: '牛蛙', kcal: 81, protein: 15.7, fat: 0.5, carbs: 3.4, fiber: 0, cat: '其他' },
  { name: '白砂糖', kcal: 400, protein: 0, fat: 0, carbs: 99.9, fiber: 0, cat: '其他', alias: ['砂糖', '白糖', '糖'] },
  { name: '蛤蟆油', kcal: 241, protein: 31.4, fat: 1.9, carbs: 24.6, fiber: 0, cat: '其他' },
  { name: '蜂蛹', kcal: 100, protein: 10.6, fat: 5.4, carbs: 2.3, fiber: 0, cat: '其他', alias: ['蜂胚', '蜂仔'] },
  { name: '蜂蛹(大黄蜂)', kcal: 109, protein: 12.1, fat: 3.8, carbs: 6.6, fiber: 0, cat: '其他' },
  { name: '蜂蜜', kcal: 304, protein: 0.3, fat: 0, carbs: 82.4, fiber: 0.2, cat: '其他', alias: ['蜜'] },
  { name: '裙边(干)', kcal: 337, protein: 81.6, fat: 1.2, carbs: 0.0, fiber: 0, cat: '其他' },
  { name: '阿胶', kcal: 383, protein: 73.0, fat: 5.8, carbs: 9.5, fiber: 0, cat: '其他' },
  { name: '鱼唇(干)', kcal: 347, protein: 83.1, fat: 1.6, carbs: 0.0, fiber: 0, cat: '其他' },
  { name: '鱼肚(干)', kcal: 312, protein: 75.6, fat: 1.0, carbs: 0.0, fiber: 0, cat: '其他' },

]

// 食物名称智能匹配（用于「牛肉 100g」类自由输入自动带营养 / 搜索兜底）
// 口语→库里正名。只写「库里确实有的名字」，写错目标会自动退化为模糊匹配，不会崩。
const FOOD_ALIAS = {
  // —— 主食：最要紧的是分清「生重 / 熟重」——
  '米': '稻米', '大米': '稻米', '生大米': '稻米', '白米': '稻米', '生米': '稻米',
  '饭': '米饭(熟)', '米饭': '米饭(熟)', '白米饭': '米饭(熟)', '熟米饭': '米饭(熟)', '蒸米饭': '米饭(熟)',
  '糙米饭': '糙米饭(熟)', '苞米': '玉米(鲜)', '玉米': '玉米(鲜)',
  '马铃薯': '土豆(蒸)', '洋芋': '土豆(蒸)',
  '地瓜': '红薯', '番薯': '红薯', '山芋': '红薯', '甜薯': '红薯',
  '面': '面条(熟)', '面条': '面条(熟)', '挂面': '面条(熟)', '拉面': '面条(熟)',
  '面包': '全麦面包', '吐司': '全麦面包', '全麦吐司': '全麦面包',
  '荞麦': '荞麦面(熟)', '意面': '意面(熟)', '通心粉': '意面(熟)',
  '藜麦': '藜麦(熟)', '藜麦米': '藜麦(熟)', '燕麦片': '燕麦',
  // —— 蛋白 ——
  '牛肉': '牛肉(瘦)', '牛里脊': '牛肉(瘦)', '牛排': '牛肉(瘦)', '牛腱': '牛肉(瘦)',
  '肥牛': '牛肉(腹部肉)', '牛腹肉': '牛肉(腹部肉)',
  '五花肉': '猪肉(奶面)', '硬五花': '猪肉(奶面)', '软五花': '猪肉(奶脯)', '猪夹心': '猪肉(奶脯)',
  '豆干': '豆腐干', '香干': '豆腐干',
  '黑芝麻': '芝麻子(黑)', '白芝麻': '芝麻子(白)',
  '鸡胸': '鸡胸肉', '鸡大胸': '鸡胸肉', '鸡腿': '鸡腿肉', '鸡腿排': '鸡腿肉',
  '猪肉': '猪肉(瘦)', '瘦猪肉': '猪肉(瘦)', '里脊': '猪里脊', '猪里脊肉': '猪里脊',
  '羊肉': '羊肉(瘦)', '鸭肉': '鸭肉(瘦)', '鸭胸': '鸭胸肉(去皮)',
  '酸奶': '酸奶(原味)', '老酸奶': '酸奶(原味)',
  '乳清': '蛋白粉(乳清)', '乳清蛋白': '蛋白粉(乳清)', '蛋白粉': '蛋白粉(乳清)',
  '蛋清': '鸡蛋白', '蛋白': '鸡蛋白', '水煮蛋': '鸡蛋', '白煮蛋': '鸡蛋',
  '大虾': '虾', '明虾': '虾', '基围虾': '虾', '河虾': '虾',
  '大豆': '黄豆', '青豆': '毛豆',
  // —— 脂肪坚果 ——
  '扁桃仁': '巴旦木', '美国大杏仁': '巴旦木', '巴旦木仁': '巴旦木', '大杏仁': '巴旦木',
  '澳洲坚果': '夏威夷果', '长寿果': '碧根果', '美国山核桃': '碧根果',
  '花生米': '花生', '生花生': '花生仁(生)', '花生豆': '花生仁(生)',
  '芝麻': '白芝麻', '黑巧': '黑巧克力(85%)', '可可': '黑巧克力(85%)',
  // —— 蔬菜 ——
  '西红柿': '番茄', '圣女果': '番茄', '青瓜': '黄瓜', '胡瓜': '黄瓜',
  '柿子椒': '青椒', '圆椒': '青椒', '灯笼椒': '青椒', '菜椒': '青椒',
  '蘑菇': '口蘑', '冬菇': '香菇', '花菜': '菜花(白色)',
  '卷心菜': '结球甘蓝(绿)', '包菜': '结球甘蓝(绿)', '洋白菜': '结球甘蓝(绿)', '莲花白': '结球甘蓝(绿)',
  '银耳': '银耳(干)', '海带': '海带(鲜)', '紫菜': '紫菜(干)',
  '土豆': '土豆(蒸)', '胡萝卜': '胡萝卜',
  // —— 水果 ——
  '橙': '橙子', '桔子': '蜜橘', '橘': '蜜橘', '柚子': '柚',
  '提子': '葡萄', '车厘子': '樱桃', '奇异果': '猕猴桃', '牛油果': '鳄梨',
  // —— 油脂 & 调料 ——
  '油': '食用油', '橄榄油': '食用油', '菜油': '食用油', '调和油': '食用油',
  // —— 肉类「生重」口语（2026-10-17：用户搜「生鸡胸肉」等要能命中，别误当熟重）——
  '生鸡胸肉': '鸡胸脯肉', '生鸡胸': '鸡胸脯肉', '生鸡腿': '鸡腿肉', '生鸡腿肉': '鸡腿肉',
  '生猪里脊': '猪里脊', '生猪柳': '猪里脊', '生瘦猪肉': '猪肉(瘦)', '生五花肉': '猪肉(奶面)',
  '生牛肉': '牛肉(瘦)', '生牛排': '牛肉(瘦)', '生羊肉': '羊肉(瘦)', '生鸭胸': '鸭胸肉(去皮)',
  '生三文鱼': '三文鱼', '生鳕鱼': '鳕鱼', '生虾': '虾', '生虾仁': '虾'
}
function matchFood(name) {
  if (!name) return null
  const n = String(name).trim()
  if (!n) return null
  // ① 库里正名精确命中
  let f = FOODS.find(x => x.name === n)
  if (f) return f
  // ② 别名表（目标名若已不存在，则静默跳过，继续往下模糊）
  const target = FOOD_ALIAS[n]
  if (target) { f = FOODS.find(x => x.name === target); if (f) return f }
  // ③ 条目自带的俗名（扩充库从原表的［…］里抽出来的，如「核桃(干)」的「胡桃」）
  f = FOODS.find(x => (x.alias || []).indexOf(n) >= 0)
  if (f) return f
  // ④ 包含匹配：取「分数最高的那条」——
  //    以关键词开头 > 名字中出现 > 用户输得更长；同档取名字更短的（越短越通用）。
  //    这比"抢数组里第一条"稳：搜「牛肉」该命中「牛肉(瘦)」而不是某个细分部位。
  let best = null, bestScore = 0
  for (const x of FOODS) {
    let score = 0
    if (x.name.indexOf(n) === 0) score = 2000 - x.name.length
    else if (x.name.indexOf(n) > 0) score = 1000 - x.name.length
    else if (n.indexOf(x.name) >= 0) score = 500 + x.name.length
    if (score > bestScore) { bestScore = score; best = x }
  }
  return best
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
// 动作联想：名称直接命中，或命中别名词（多词按 AND 组合，如“上斜卧推”=上斜∩卧推）
function searchEx(q) {
  q = (q || '').trim()
  if (!q) return []
  const active = Object.keys(EX_ALIAS).filter(k => q.indexOf(k) >= 0)
  const pool = active.length
    ? EX.filter(e => active.every(k => EX_ALIAS[k].some(frag => e.name.indexOf(frag) >= 0)))
    : EX.filter(e => e.name.indexOf(q) >= 0)
  return pool.slice(0, 15)
}
// 食物联想：正名 / 别名 / 条目自带俗名 都能搜到；按相关度排序（库已扩到 1000+ 条，
// 不排序的话搜「牛肉」会淹出一堆细分部位，用户还得自己翻）
function searchFood(q) {
  q = (q || '').trim()
  if (!q) return []
  const scored = []
  const want = FOOD_ALIAS[q]
  for (const f of FOODS) {
    let s = 0
    if (f.name === q) s = 10000                                   // 正名完全相同
    else if (want === f.name) s = 9000                             // 命中常用口语别名
    else if ((f.alias || []).indexOf(q) >= 0) s = 8500             // 命中库内俗名
    else if (f.name.indexOf(q) === 0) s = 6000 - f.name.length      // 以关键词开头
    else if (f.name.indexOf(q) > 0) s = 3000 - f.name.length        // 名字里含关键词
    else if ((f.alias || []).some(a => a.indexOf(q) >= 0)) s = 1500 - f.name.length
    if (s > 0) scored.push({ f: f, s: s })
  }
  scored.sort((a, b) => b.s - a.s || a.f.name.length - b.f.name.length)
  return scored.slice(0, 24).map(x => x.f)
}

// —— 食物分类（今日页点选式记录用：蛋白/主食/蔬菜/脂肪坚果/水果/其他）——
// 规则按顺序命中，调顺序就是改优先级
const FOOD_CAT_RULES = [
  ['其他', /^(蒜|姜|葱|香菜|辣椒|酱油|醋|料酒|糖|淀粉)$/],   // 调料不算食材类
  ['脂肪坚果', /食用油|花生|南瓜子|牛油果|芝麻|核桃|腰果|奶酪|杏仁|花生酱|亚麻籽|黑巧克力/],
  ['蔬菜', /西兰花|菠菜|番茄|黄瓜|芹菜|青椒|香菇|口蘑|娃娃菜|生菜|油麦菜|白菜|冬瓜|豆芽|茄子|韭菜|萝卜|蘑菇|青菜|荠菜|芦笋|秋葵/],
  ['蛋白', /鸡胸|鸡腿|鸡胸肉|牛肉|猪里脊|猪肉|羊肉|鸭|鸡蛋|蛋白粉|三文鱼|鳕鱼|龙利鱼|黄花鱼|鱿鱼|扇贝|虾|豆腐|牛奶|酸奶|黑豆|毛豆|鹰嘴豆/],
  ['主食', /米饭|燕麦|红薯|紫薯|山药|芋头|面包|面条|意面|馒头|糙米|玉米|荞麦|土豆|藜麦|粉丝|米粉|红豆|绿豆/],
  ['水果', /香蕉|苹果|蓝莓|橙|葡萄|西瓜|芒果|梨|桃|猕猴桃|火龙果/]
]
function foodCatOf(f) {
  // 扩充库自带人工核对过的分类，优先信它（按名字正则猜容易把栗子分到坚果、干香菇分到蔬菜）
  if (f && f.cat) return f.cat
  for (const [cat, re] of FOOD_CAT_RULES) {
    if (re.test(f.name)) return cat
  }
  // 规则未命中 → 按营养特征兜底
  if (f.kcal <= 45 && f.carbs <= 12) return '蔬菜'
  if (f.protein >= 15) return '蛋白'
  if (f.carbs >= 20) return '主食'
  if (f.fat >= 10) return '脂肪坚果'
  return '其他'
}
const FOOD_CATS = ['蛋白', '主食', '蔬菜', '脂肪坚果', '水果', '其他']
function foodByCat(cat) {
  return FOODS.filter(f => foodCatOf(f) === cat)
}

module.exports = {
  EX, PARTS, EQUIP, LEVELS, getExercises, SPLITS, FREQ, FOCUS_NAME, buildExercises,
  generatePlan, buildDay, dayContent, migratePlan, LEARN, FOODS, FOOD_ALIAS, matchFood, searchEx, searchFood, foodCatOf, foodByCat, FOOD_CATS,
  PROGRAMS, enrollProgram, programList,
  // 方法论与引擎内部件（导出以便 node 回归测试与页面派生，勿在业务里绕过）
  METHOD, PLAN_SCHEMA, FOCUS_PATTERNS, PATTERNS: FOCUS_PATTERNS,
  patternOf, setsFor, pickBalanced, rankExercises, microFor, buildWarmup, isDeloadWeek, reduceSets,
  buildProgramMicro, splitList, freqList,
  // 食物分类
  FOOD_CATS, foodCatOf, foodByCat
}

module.exports.schedulePosition=schedulePosition
module.exports.postponePlan=postponePlan
