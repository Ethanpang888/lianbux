/* shared/pro.js —— 「完整版」（付费层）的唯一逻辑源
 *
 * ── 分层原则（用户 2026-09-23 拍板）──
 *   免费   = 动作骨架：练什么、几组几次、组间休息、强度口径（method.js / kb.js 已经给全）
 *   完整版 = 具体重量 + 每周递进 + 四周周期表 + 状态微调 + 完整饮食（三套口径 / 外食 / 补剂）
 *   普通用户永远只看得到前者；后者是收费本体，也是自用时给自己看的那份。
 *
 * ── 数据可信度分三级，UI 必须如实标注（项目铁律）──
 *   · 原文 —— 直接引用 method.js（谭成义 × 凯圣王），是组次/休息/递进阶梯/RPE/热量口径
 *   · 实测 —— 用户自己打卡记录换算出来的重量（最可信，一旦有就优先用）
 *   · 推演 —— 相对强度表估算的起始重量（只在没有实测时用，标「推演」）
 *
 * ── 零依赖 ──
 *   本文件不 require 任何模块：打包进浏览器时用 ENGINE.method，测试时用传入的 method，
 *   都没有才落到下面的 FALLBACK。FALLBACK 与 method.js 的一致性由 tools/test-pro.js 断言守着。
 */

const PRO_VERSION = 1
const SRC = { YUAN: '原文', SHI: '实测', TUI: '推演' }

// ────────────────────────── 兜底方法论（真身是 method.js）──────────────────────────
// 只在拿不到 method.js 时使用；test-pro.js 会逐项比对，防止两处真相漂移。
const FALLBACK = {
  MAIN_LADDER: ['4×12', '4×10', '4×8', '4×6', '4×5'],
  DELOAD: { everyWeeks: 4, setsFactor: 0.6 },
  CORE_SETS: '3×15-20',
  SETS_BY_GOAL: {
    增肌: { 新手: { 主项: '4×10', 辅助: '4×12', 孤立: '4×15', 核心: '3×15-20' },
            进阶: { 主项: '4×8', 辅助: '4×12', 孤立: '4×15', 核心: '3×15-20' },
            熟练: { 主项: '4×8', 辅助: '4×10', 孤立: '4×12', 核心: '3×15-20' } },
    增肌减脂同步: { 新手: { 主项: '3×12', 辅助: '3×12', 孤立: '3×15', 核心: '3×20' },
                    进阶: { 主项: '4×10', 辅助: '4×10', 孤立: '3×15', 核心: '3×20' },
                    熟练: { 主项: '4×8', 辅助: '4×10', 孤立: '4×12', 核心: '3×20' } },
    减脂: { 新手: { 主项: '3×12', 辅助: '3×15', 孤立: '3×15', 核心: '3×20' },
            进阶: { 主项: '4×12', 辅助: '3×15', 孤立: '3×15', 核心: '3×20' },
            熟练: { 主项: '4×12', 辅助: '4×15', 孤立: '4×15', 核心: '4×20' } },
    塑形: { 新手: { 主项: '3×12', 辅助: '3×12', 孤立: '3×15', 核心: '3×15-20' },
            进阶: { 主项: '4×12', 辅助: '4×12', 孤立: '4×15', 核心: '3×15-20' },
            熟练: { 主项: '4×12', 辅助: '4×12', 孤立: '4×15', 核心: '3×15-20' } }
  },
  MEALS: [
    { key: '早', name: '早餐', pct: 0.25 },
    { key: '午', name: '午餐', pct: 0.35 },
    { key: '练后', name: '练后加餐', pct: 0.10 },
    { key: '晚', name: '晚餐', pct: 0.30 }
  ]
}

function methodOf(m) {
  if (m && m.MAIN_LADDER) return m
  if (typeof ENGINE !== 'undefined' && ENGINE && ENGINE.method && ENGINE.method.MAIN_LADDER) return ENGINE.method
  return FALLBACK
}

// ────────────────────────── 一、重量处方 ──────────────────────────

/** 解析 '4×12' / '3×15-20' → { sets, reps, repMax } */
function parseSets(s) {
  const m = String(s == null ? '' : s).match(/(\d+)\s*[×x*]\s*(\d+)\s*(?:[-~]\s*(\d+))?/)
  if (!m) return { sets: 3, reps: 10, repMax: 10 }
  return {
    sets: Number(m[1]) || 3,
    reps: Number(m[2]) || 10,
    repMax: Number(m[3] || m[2]) || 10
  }
}

/** Epley 估算：w 做 reps 次 ≈ 1RM 的这个比例 */
function e1rm(w, reps) { return (Number(w) || 0) * (1 + Math.max(1, Number(reps) || 1) / 30) }

/** 已知「8 次重量」，换算到做 reps 次该用多重（次数↓ → 重量↑） */
function wForReps(w8, reps) {
  const r = Math.max(1, Number(reps) || 1)
  return (Number(w8) || 0) * (1 + 8 / 30) / (1 + r / 30)
}

// 相对强度表：动作「8 次力竭前 2 次（RPE8）」的重量 ÷ 体重
// 复合动作（squat/hinge/push_h/push_v/pull_v/pull_h/trap）= 杠铃口径，还要乘装备修正
// 孤立动作（curl/tri/delts/rear_delt/legcurl/calf）= 已是哑铃/绳索/器械口径，不再乘修正
// ⚠️ 推演值：来自通行的相对力量标准区间，不是博主原话。第一次照着做，之后自动改用实测。
const COEF = {
  squat: { 新手: 0.70, 进阶: 0.95, 熟练: 1.15 },
  hinge: { 新手: 0.80, 进阶: 1.05, 熟练: 1.30 },
  push_h: { 新手: 0.55, 进阶: 0.70, 熟练: 0.85 },
  push_v: { 新手: 0.35, 进阶: 0.48, 熟练: 0.60 },
  pull_v: { 新手: 0.60, 进阶: 0.75, 熟练: 0.90 },
  pull_h: { 新手: 0.50, 进阶: 0.65, 熟练: 0.80 },
  trap: { 新手: 0.75, 进阶: 1.05, 熟练: 1.35 },
  legcurl: { 新手: 0.30, 进阶: 0.42, 熟练: 0.52 },
  calf: { 新手: 0.60, 进阶: 0.90, 熟练: 1.20 },
  curl: { 新手: 0.12, 进阶: 0.16, 熟练: 0.20 },
  tri: { 新手: 0.15, 进阶: 0.20, 熟练: 0.25 },
  delts: { 新手: 0.07, 进阶: 0.10, 熟练: 0.13 },
  rear_delt: { 新手: 0.06, 进阶: 0.09, 熟练: 0.11 },
  core: { 新手: 0, 进阶: 0, 熟练: 0 },
  other: { 新手: 0.40, 进阶: 0.55, 熟练: 0.70 }
}
const COMPOUND = ['squat', 'hinge', 'push_h', 'push_v', 'pull_v', 'pull_h', 'trap']

// 装备修正（只作用于复合动作）。0 = 没有外部重量（自重/弹力带），UI 显示「自重」
const EQUIP_FIX = {
  杠铃: 1, 器械: 0.95, 绳索: 0.72, 哑铃: 0.40, 壶铃: 0.45,
  瑞士球: 0.5, 弹力带: 0, 无器械: 0
}
// 可加的最小配重（做到「能算出来就能落地」）
const STEP = {
  杠铃: 2.5, 器械: 5, 绳索: 2.5, 哑铃: 2, 壶铃: 4, 默认: 2.5
}
// 特殊动作名称纠偏：pattern 相同但负荷量级差太远（腿举 ≠ 深蹲）
const NAME_FIX = [
  { re: /腿举|哈克/, c: { 新手: 1.50, 进阶: 2.20, 熟练: 3.00 } },
  { re: /腿弯举|腿屈伸/, c: { 新手: 0.30, 进阶: 0.42, 熟练: 0.55 } },
  { re: /俯卧撑|平板|卷腹|仰卧起坐|举腿|登山|臀桥|超人|挺身/, c: { 新手: 0, 进阶: 0, 熟练: 0 } }
]

function stepOf(equipment) {
  const s = STEP[equipment]
  return s == null ? STEP.默认 : s
}
/** 保守取整：向下贴到最小配重（宁可轻一点，别一上手就过重） */
function snap(w, step) {
  const v = Number(w) || 0
  if (!step || v <= 0) return 0
  if (v < step) return step
  return Math.round(Math.floor(v / step) * step * 100) / 100
}

/** 该动作是否有外部重量（自重动作返回 0） */
function isBodyweight(ex) {
  const eq = (ex && ex.equipment) || ''
  if (eq === '无器械' || eq === '弹力带') return true
  const nm = (ex && ex.name) || ''
  return NAME_FIX.some(f => f.c === 0 && f.re.test(nm))
}

/** 估算「8 次重量」：体重 × 相对强度 × 装备修正 */
function estimateW8(ex, profile) {
  const p = profile || {}
  const bw = Number(p.weight) || 0
  if (!bw || isBodyweight(ex)) return 0
  const exp = p.exp || '新手'
  const nm = (ex && ex.name) || ''
  let c
  const fix = NAME_FIX.find(f => f.re.test(nm))
  if (fix) c = fix.c[exp]
  else {
    const base = COEF[(ex && ex.pattern) || 'other'] || COEF.other
    c = base[exp]
    if (COMPOUND.indexOf((ex && ex.pattern) || '') >= 0) {
      const ef = EQUIP_FIX[(ex && ex.equipment) || '杠铃']
      c = c * (ef == null ? 1 : ef)
    }
  }
  if (!c) return 0
  return snap(bw * c, stepOf((ex && ex.equipment) || '杠铃'))
}

/** 从打卡历史里找这个动作最近一次「有重量且完成」的组（用于反推真实水平） */
function lastLogged(name, history) {
  const rows = (history || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))
  for (const ck of rows) {
    const hit = ((ck && ck.exercises) || []).find(e => e && e.name === name && (e.log || []).length)
    if (!hit) continue
    const done = (hit.log || []).filter(s => Number(s && s.weight) > 0 && (s.done || Number(s.reps) > 0))
    if (!done.length) continue
    const best = done.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a))
    return { date: ck.date, weight: Number(best.weight), reps: Number(best.reps) || 8 }
  }
  return null
}

/**
 * 重量锚点：优先实测，其次推演。
 * 返回 { w8, weight, src, note } —— weight 是 8 次口径、贴合配重的可执行数字。
 */
function anchorOf(ex, profile, history) {
  const hit = lastLogged((ex && ex.name) || '', history)
  if (hit && hit.weight > 0) {
    const raw = wForReps(hit.weight, hit.reps)
    return {
      w8: raw,
      weight: snap(raw, stepOf((ex && ex.equipment) || '杠铃')),
      src: SRC.SHI,
      from: hit,
      note: '按 ' + hit.date + ' 记录的 ' + hit.weight + 'kg×' + hit.reps + ' 次换算（你自己的数据）'
    }
  }
  const est = estimateW8(ex, profile)
  return {
    w8: est,
    weight: est,
    src: SRC.TUI,
    from: null,
    note: est ? '按体重 ' + (profile || {}).weight + 'kg 与「' + ((profile || {}).exp || '新手') + '」经验估算的起点，第一轮照做，之后自动改用你的实测' : '自重动作，不设外部重量'
  }
}

/** 单个动作的处方 */
function prescribeOne(ex, profile, history, opts) {
  const o = opts || {}
  const ps = parseSets(ex && ex.sets)
  const a = anchorOf(ex, profile, history)
  const bw = isBodyweight(ex)
  const step = stepOf((ex && ex.equipment) || '杠铃')
  const pct = o.weightPct == null ? 1 : o.weightPct
  const setsDelta = Number(o.setsDelta) || 0
  const sets = Math.max(1, ps.sets + setsDelta)
  let w = bw ? 0 : snap(wForReps(a.w8, ps.reps) * pct, step)
  return {
    name: (ex && ex.name) || '',
    role: (ex && ex.role) || '辅助',
    pattern: (ex && ex.pattern) || '',
    equipment: (ex && ex.equipment) || '',
    sets: sets + '×' + ps.reps + (ps.repMax !== ps.reps ? '-' + ps.repMax : ''),
    setsN: sets,
    reps: ps.reps,
    weight: w,
    step: step,
    unit: bw ? '自重' : 'kg',
    perSide: !bw && (ex && ex.equipment) === '哑铃',
    src: bw ? SRC.TUI : a.src,
    note: bw ? '自重动作，按次数推进（能做满上限再加难度）' : a.note
  }
}

/** 今天的完整处方（today 页直接用） */
function todayPrescription(day, profile, history, opts) {
  const list = ((day && day.exercises) || []).map(ex => prescribeOne(ex, profile, history, opts))
  const total = list.reduce((s, x) => s + (x.weight > 0 ? x.weight * x.setsN * x.reps : 0), 0)
  return { list, plannedKg: Math.round(total), weightPct: (opts && opts.weightPct) || 1 }
}

// ────────────────────────── 二、周期表 ──────────────────────────

/** 第 week 轮的组次编排（与 kb.js 的 effWeek 算法保持一致：减载轮不占用递进阶梯） */
function roundPlan(goal, exp, week, M) {
  const m = methodOf(M)
  const everyWk = (m.DELOAD && m.DELOAD.everyWeeks) || 4
  const factor = (m.DELOAD && m.DELOAD.setsFactor) || 0.6
  const deload = week % everyWk === 0
  const effWeek = week - Math.floor(week / everyWk)
  const ladder = m.MAIN_LADDER || FALLBACK.MAIN_LADDER
  const main = ladder[Math.min(Math.max(1, effWeek), ladder.length) - 1]
  const gset = m.SETS_BY_GOAL || FALLBACK.SETS_BY_GOAL
  const g = (gset[goal] || gset.塑形)[exp] || (gset[goal] || gset.塑形).新手

  const cut = s => {
    // ⚠️ 必须与 kb.js:reduceSets 完全同形：只保留 'N×M' 的 M，丢掉 '15-20' 这种区间
    const p = parseSets(s)
    const n = Math.max(1, Math.round(p.sets * factor))
    return n + '×' + p.reps
  }
  const sets = { 主项: deload ? cut(main) : main }
  const coreSets = (m.CORE && m.CORE.sets) || (m.CORE_SETS) || g.核心
  ;['辅助', '孤立'].forEach(r => { sets[r] = deload ? cut(g[r]) : g[r] })
  sets.核心 = deload ? cut(coreSets) : coreSets

  const reps = parseSets(sets.主项).reps
  return {
    week: week,
    deload: deload,
    effWeek: effWeek,
    phase: deload ? '减载周' : (effWeek === 1 ? '打基础' : (effWeek === 2 ? '加重量' : '上强度')),
    sets: sets,
    reps: reps,
    rel: Math.round(wForReps(1, reps) * 1000) / 1000,   // 相对 8 次重量的倍率
    note: deload
      ? '只砍组数（×' + factor + '），重量维持、组间休息不动 —— 减载是「减量」不是「随便练练」'
      : (effWeek === 1 ? '组次最多，先把动作做熟；重量用最低那档'
        : (effWeek === 2 ? '组次降一档，重量往上走一档' : '组次最少、重量最重，主项最后一组留 2 次余量'))
  }
}

/** 一个完整周期（默认 8 轮 = 两个减载周期）的编排表 */
function cycleTable(plan, profile, opts) {
  const o = opts || {}
  const p = profile || {}
  const M = methodOf(o.method)
  const everyWk = (M.DELOAD && M.DELOAD.everyWeeks) || 4
  const rounds = Number(o.rounds) || everyWk * 2
  const goal = (plan && plan.goal) || p.goal || '塑形'
  const exp = p.exp || '新手'
  const list = []
  for (let w = 1; w <= rounds; w++) list.push(roundPlan(goal, exp, w, M))
  const start = (plan && (plan.cycleStartWeek || 1)) || 1
  return {
    goal: goal,
    exp: exp,
    everyWeeks: everyWk,
    rounds: list,
    currentWeek: (o.week) || 1,
    startWeek: start,
    ladder: (M.MAIN_LADDER || FALLBACK.MAIN_LADDER).join(' → '),
    note: '一轮 = 把你的训练日走完一遍' + (plan && plan.micro ? '（共 ' + plan.micro.length + ' 天）' : '') +
      '；每 ' + everyWk + ' 轮减载一次。重量列是「主项相对 8 次重量」的倍率，具体到每个动作看今日处方。'
  }
}

// ────────────────────────── 三、状态微调 ──────────────────────────

/** 状态不好时怎么调 —— 原则：改量不改动作，绝不靠缩短组间休息换时间 */
const STATES = [
  { key: 'good', name: '状态很好', weightPct: 1, mainSets: 0, auxSets: 0,
    note: '照计划走。主项最后一组可以打到 RPE9（留 1 次余量），但不要加重量 —— 加重量留给下一轮。' },
  { key: 'ok', name: '正常', weightPct: 1, mainSets: 0, auxSets: 0,
    note: '按计划原样执行。' },
  { key: 'tired', name: '没睡好 / 很累', weightPct: 0.9, mainSets: 0, auxSets: -1,
    note: '主项重量 −10%、辅助砍 1 组；热身与组间休息照旧。练完比平时早收工是正常的，别硬顶。' },
  { key: 'rush', name: '只有 30 分钟', weightPct: 1, mainSets: -1, auxSets: -2,
    note: '只做主项 + 1 个辅助：主项砍 1 组、辅助砍到 2 组，孤立与核心这次跳过。热身一步都别省。' },
  { key: 'bad', name: '感冒 / 明显不适', weightPct: 0, mainSets: 0, auxSets: 0,
    note: '不练。缺一次不会退步，硬练一次可能要还两周。恢复本身就是计划的一部分。' }
]

function stateAdjust(key) {
  return STATES.find(s => s.key === key) || STATES[1]
}
/** 把状态套到今天的动作上，返回 { list, state, note } */
function applyState(day, profile, history, stateKey) {
  const st = stateAdjust(stateKey)
  if (st.key === 'bad') return { list: [], state: st, note: st.note }
  const mainDelta = Number(st.mainSets) || 0
  const auxDelta = Number(st.auxSets) || 0
  const list = ((day && day.exercises) || []).map((ex, i) => {
    if (st.key === 'rush' && i > 1) return null          // 只留主项 + 第 1 个辅助
    const role = ex.role || '辅助'
    const delta = role === '主项' ? mainDelta : (role === '核心' ? 0 : auxDelta)
    return prescribeOne(ex, profile, history, { weightPct: st.weightPct, setsDelta: delta })
  }).filter(Boolean)
  return { list: list, state: st, note: st.note }
}

// ────────────────────────── 四、完整饮食计划 ──────────────────────────

// 主食换算：数值取自项目食物库（《中国食物成分表 标准版 第6版》），test-pro.js 会逐个比对
const STAPLE = [
  { name: '米饭(熟)', kcal: 116, unit: '100g' },
  { name: '馒头', kcal: 223, unit: '100g' },
  { name: '面条(熟)', kcal: 110, unit: '100g' },
  { name: '土豆(蒸)', kcal: 77, unit: '100g' },
  { name: '红薯', kcal: 99, unit: '100g' },
  { name: '燕麦片', kcal: 389, unit: '100g' }
]

// ── 三套饮食口径（2026-09-23 定案）──
// 规矩：每个数字都必须能追到原文，不允许再出现「我们自己推的做法」。
// 来源：kaishengwang-employee skill 的 modules/饮食营养.md（内含谭成义与凯圣王两人的观点）。
const DIET_SCHOOLS = [
  {
    key: 'balanced', name: '均衡档', useFor: '长期用（默认）',
    from: '谭成义《非常完整的减脂计划视频》',
    carb: '2.2–3.5 g/kg（女 2–3）',
    protein: '1.4–1.8 g/kg',
    fat: '0.8–1 g/kg（女 +0.1–0.2）',
    notes: ['蔬菜 500–800g/天；盐：男 7g / 女 5g', '固定吃 7–10 天，再看体重决定加减'],
    sample: '85kg 男 ≈ 碳水 187g / 蛋白 120g / 脂肪 68g'
  },
  {
    key: 'cycle', name: '碳水循环档', useFor: '卡住了 / 备赛冲刺',
    from: '谭成义《过年前的减脂大决战》',
    carb: '按体重倍数循环：3 → 高碳 5 → 2.5 → 高碳 6 → 2 → 1.8 倍',
    protein: '随碳水反向走（碳水低的那几天蛋白拉高）',
    fat: '0.4–0.6 倍体重（女略高）',
    notes: ['碳水选米 / 薯 / 土豆 / 玉米', '脂肪选动物油 + 冷压植物油', '3–4 餐/天'],
    sample: '93kg 男：从 167g（1.8 倍）到 558g（6 倍）'
  },
  {
    key: 'gain', name: '增肌档', useFor: '主要想涨围度',
    from: '凯圣王《碳水详解》《蛋白质详讲》《卧推系列⑩饮食》',
    carb: '占全天热量的一半',
    protein: '1.2–1.5 g/kg',
    fat: '剩下的热量里分，优先动物油 + 冷压植物油',
    notes: ['练后 30–40 分钟：80% 碳水 + 20% 蛋白', '训练日 = 基础代谢 + 消耗 + 200；休息日 ≈ 基础代谢'],
    sample: '93kg 男 ≈ 蛋白 112–140g'
  }
]

/** 按目标给一个「建议先看哪档」的排序提示（只是排序，不替用户做决定） */
function dietSchools(profile) {
  const p = profile || {}
  const goal = p.goal || '塑形'
  const pick = goal === '增肌' ? 'gain' : 'balanced'
  return {
    list: DIET_SCHOOLS.map(s => Object.assign({}, s, { recommended: s.key === pick })),
    bw: Number(p.weight) || 0,
    note: '三套都是有原文出处的口径。挑一套固定吃 7–10 天再看体重 —— 别混着用，也别天天改数字。'
  }
}

/** 外食/外卖怎么点 —— 用规则 + 主食克数换算，不给「某家店一碗多少卡」这种编出来的数 */
const EATOUT = [
  { t: '先定主食量，再点菜', d: '点单时第一句就是「米饭减半/一拳大小」。示例：黄焖鸡米饭 → 「米饭小份，汤汁别浇饭」；麻辣烫 → 「主食选土豆红薯，别选方便面」。' },
  { t: '蛋白挑「整块」的', d: '鸡腿去皮、牛腱、清蒸鱼、白灼虾、豆腐 —— 优先点这些；丸子、香肠、培根是加工肉，蛋白少脂肪多。' },
  { t: '避开三种做法', d: '勾芡（滑蛋/糖醋/鱼香）、油炸、浓汤。同一块肉换个做法，热量差一倍。' },
  { t: '蔬菜单独补一份', d: '每天 500-800g。外卖里蔬菜永远不够，加一份白灼菜心/西兰花/拍黄瓜，几块钱解决。' },
  { t: '汤和饮料不占额度', d: '含糖饮料直接换成水或无糖茶；例汤表面那层油别喝。' },
  { t: '点不到就按克数自己配', d: '实在没得选：便利店茶叶蛋 2 个 + 无糖豆浆 + 全麦面包，比硬凑一份套餐干净。' }
]

/** 补剂与饮水（通用运动营养共识，不是博主原话） */
const SUPPLEMENT = [
  { t: '肌酸', d: '3-5g/天，什么时候吃都行，不用冲击期。便宜、证据最扎实的一项，增力增围度都管用。' },
  { t: '蛋白粉', d: '只用来补缺口。全天蛋白吃不够了再补，一勺约 20-25g；能靠正餐吃够就不必喝。' },
  { t: '维生素 D', d: '常年室内、日照少的话 1000-2000 IU/天。和情绪、力量、免疫都有关系。' },
  { t: '鱼油（Omega-3）', d: '每周吃鱼不到 2 次就补，1-2g/天。关节和恢复上会舒服些。' },
  { t: '饮水', d: '体重(kg) × 35ml/天起步，训练日再加 500ml。天热或出汗多还要往上加。' }
]

function dietPlan(profile, energy, opts) {
  const o = opts || {}
  const p = profile || {}
  const e = energy || {}
  const carb = Number(e.carb) || 0
  const fat = Number(e.fat) || 0
  const protein = Number(e.protein) || 0
  const kcal = Number(e.kcal) || 0
  const bw = Number(p.weight) || 0

  // ⛔ 2026-09-23 删掉了原先那套「训练日 ×1.15 / 休息日 ×0.85」的碳水循环 ——
  //    那是我们自己推的、没有任何出处，却挂着「碳水循环」这种像博主原话的名头（用户当场质问过）。
  //    现在改成给三套**有原文出处**的口径，用户自己挑一套用，每套都标清楚是谁说的。

  // 分餐：沿用 method.DIET.meals 的比例（25/35/10/30），按当天的碳水/脂肪目标拆分
  const M = methodOf(o.method)
  const ratios = (M.DIET && M.DIET.meals) || FALLBACK.MEALS
  const split = (total, pct) => Math.round(total * pct / 5) * 5

  const mealPlan = (c, f) => ratios.map(m => ({
    key: m.key,
    name: m.name,
    pct: m.pct,
    carb: split(c, m.pct),
    fat: split(f, m.pct),
    protein: split(protein, m.pct)
  }))

  return {
    version: PRO_VERSION,
    kcal: kcal,
    protein: protein,
    base: { carb: carb, fat: fat },
    // 三套有原文出处的口径（每套标清是谁说的，不再有「我们自己推的」那套）
    schools: dietSchools(profile),
    meals: mealPlan(carb, fat),
    timing: [
      { t: '练前 1-2 小时', d: '碳水 30-40g（一根香蕉 + 一片面包），别空腹硬练，也别刚吃完就上。' },
      { t: '练后 2 小时内', d: '正餐一顿，碳水 + 蛋白一起吃；练后那顿的碳水可以占全天的大头（可用高 GI）。' },
      { t: '睡前', d: '蛋白 30g 左右（鸡蛋/牛奶/酸奶），脂肪别太高，不影响入睡。' }
    ],
    staples: STAPLE,
    eatout: EATOUT,
    supplement: SUPPLEMENT,
    water: bw ? Math.round(bw * 35 / 100) / 10 : 0,
    waterNote: bw ? '体重 ' + bw + 'kg × 35ml ≈ ' + (Math.round(bw * 35 / 100) / 10) + 'L/天，训练日再加 500ml。' : '先填体重才能算饮水量。',
    cycleNote: '周期内怎么微调：减载周热量<b>不用改</b>（减载是练得少，不是吃得少）；' +
      '体重趋势交给「宏观调控」，攒够 7-10 天数据它自己会算；<b>别一天一改数字</b>。',
    disclaimer: '以上为训练与营养参考，不构成医疗建议。有慢性病、用药或伤病史，先问医生。'
  }
}

// ─────────────── 五、会员状态：**服务端权威** ───────────────
//
// 2026-09-23 换掉了旧做法。旧的是「前端 djb2 口令哈希 + profile.tier」，等于把钥匙焊在门上：
//   哈希写在客户端能被人翻出来，profile.tier 用户自己也能写 —— 谁也挡不住。
// 现在：
//   · 只认服务端下发的 user.member（{ level, expiresAt }）；它在云端 WRITABLE 白名单之外，
//     客户端写不进去（test-auth 有静态断言挡回归）
//   · 兑换 / 取消都走云端接口（Store.redeem / Store.cancelMember）
//   · 前端不再持有任何口令 —— 连哈希一起删了

/** 会员定价：pro = 完整版（月付 19.9 / 年付 168 主推）。
 *  coach = 旧「AI 顾问」档，**已停售**（保留定义兼容旧数据，定价页不再展示）。 */
const LEVELS = {
  pro: { name: '完整版', price: 19.9, yearly: 168 },
  coach: { name: '完整版 + AI 顾问', price: 49.9 }
}

/**
 * 解析会员状态。过期即失效；expiresAt 解析不出来也算失效（宁可少给，不能多给）。
 * 参数是 **user 对象**，不是 profile —— 会员属于账号，不属于档案（换档案不该掉会员）。
 */
function memberOf(user) {
  const m = (user && user.member) || {}
  const t = Date.parse(m.expiresAt || '')
  const ok = !!m.level && !isNaN(t) && t > Date.now()
  return {
    level: ok ? m.level : '',
    name: ok ? (((LEVELS[m.level] || {}).name) || m.level) : '',
    expiresAt: m.expiresAt || '',
    days: ok ? Math.max(0, Math.ceil((t - Date.now()) / 86400000)) : 0,
    valid: ok
  }
}

/** 是否已开通「完整版」（含更高一档的 coach） */
function isPro(user) {
  const m = memberOf(user)
  return m.valid && (m.level === 'pro' || m.level === 'coach')
}

/** 是否开通了「完整版 + AI 顾问」那一档 */
function isCoach(user) { return memberOf(user).level === 'coach' }

module.exports = {
  PRO_VERSION, SRC, COEF, COMPOUND, EQUIP_FIX, STEP, STATES,
  STAPLE, EATOUT, SUPPLEMENT, FALLBACK, DIET_SCHOOLS, LEVELS,
  parseSets, e1rm, wForReps, snap, isBodyweight, estimateW8, lastLogged, anchorOf,
  prescribeOne, todayPrescription, roundPlan, cycleTable, stateAdjust, applyState,
  dietPlan, dietSchools, memberOf, isPro, isCoach
}
