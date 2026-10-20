// utils/calc.js —— 体测与热量计算（行业标准公式，非知识库私有）
// 饮食口径（脂肪 g/kg、缺口大小）来自 utils/method.js 的 DIET，保持单一真相源
let METHOD = null
try { METHOD = require('./method.js') } catch (e) { METHOD = null }
const DIET_RULE = (METHOD && METHOD.DIET) || {
  fatPerKg: { 增肌: 0.7, 增肌减脂同步: 0.7, 塑形: 0.7, 减脂: 0.8 },
  kcalRule: { 增肌: 130, 增肌减脂同步: -200, 减脂: -300, 塑形: 0 }
}
function fatPerKgOf(goal) { return DIET_RULE.fatPerKg[goal] || 0.7 }
function kcalAdjOf(goal) { return DIET_RULE.kcalRule[goal] || 0 }

function round(n, d = 0) {
  const p = Math.pow(10, d)
  return Math.round(n * p) / p
}

// BMI
function bmi(weightKg, heightCm) {
  const h = heightCm / 100
  return round(weightKg / (h * h), 1)
}
function bmiCat(v) {
  if (v < 18.5) return { txt: '偏瘦', color: '#3b82f6' }
  if (v < 24) return { txt: '正常', color: '#0e9f6e' }
  if (v < 28) return { txt: '超重', color: '#f59e0b' }
  return { txt: '肥胖', color: '#ef4444' }
}

// 基础代谢 Mifflin-St Jeor
function bmr(gender, weightKg, heightCm, age) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return round(gender === '男' ? base + 5 : base - 161)
}

// 活动系数（按每周训练天数）
function activityFactor(daysPerWeek) {
  if (daysPerWeek <= 1) return 1.2
  if (daysPerWeek <= 3) return 1.375
  if (daysPerWeek <= 5) return 1.55
  return 1.725
}
function tdee(b, daysPerWeek) {
  return round(b * activityFactor(daysPerWeek))
}

// 每日热量目标（口径来自 method.js：谭成义「增肌看强度、不靠大盈余」→ 只 +130；减脂缺口只开 300）
function calorieTarget(t, goal) {
  const adj = kcalAdjOf(goal)
  return round(t + adj)
}

// 宏量分配（克）
function macros(cal, weightKg, goal) {
  const protein = round(goal === '增肌' ? weightKg * 2.0 : weightKg * 1.8) // 1.8~2.0 g/kg
  const fatCal = cal * 0.25
  const fat = round(fatCal / 9)
  const carbCal = cal - protein * 4 - fat * 9
  const carb = round(Math.max(carbCal, 0) / 4)
  return { protein, fat, carb }
}

// ===== 谭成义「增肌减脂底层逻辑」宏量模型（按体重 + 体质 + 身体信号）=====
// 脂肪 0.6-0.8g/kg（取 0.7）；碳水按体质 2.5/3.0/3.5 g/kg；蛋白随碳水档反向 1.2-2.0g/kg
// 减脂：在基准碳水上 -0.5g/kg 制造缺口（与"缩小缺口、不靠大缺口"理论一致）
const BODYTYPE_CARB = { 易胖: 2.5, 中性: 3.0, 易瘦: 3.5 }
function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// adj: { carbAdj:Number(g/kg 偏移), proteinAdj:Number(g/kg 偏移) } 来自「微饿循环」
function dietMacros(profile, adj) {
  adj = adj || { carbAdj: 0, proteinAdj: 0 }
  const w = Number(profile.weight) || 60
  const bt = profile.bodyType || '中性'
  const goal = profile.goal || '塑形'
  const fat = round(fatPerKgOf(goal) * w)                          // 脂肪 g（增肌/塑形 0.7，减脂 0.8）
  let carbG = (BODYTYPE_CARB[bt] || 3.0) + (adj.carbAdj || 0)
  carbG = clampNum(carbG, 1.5, 5.0)
  // 蛋白区间 1.4-2.0 g/kg（谭成义《体重倍数定宏量框架》：1.4-1.8 起步，蛋白消化反馈卡允许 ±0.2 微调至 2.0 封顶）
  // ⚠️ 底线从 1.2 提到 1.4：旧版「很饿→碳水↑→跷跷板压蛋白」叠加后会把蛋白打到 1.2（93kg 只有 111g），远低于谭的区间下限
  let protG = 1.6 - (carbG - 3.0) * 0.3 + (adj.proteinAdj || 0)   // 碳水高→吸收率低→蛋白略降；反之略升
  protG = clampNum(protG, 1.4, 2.0)
  // 减脂：缩缺口（碳水 −0.5g/kg）＋蛋白 +0.2 保肌肉
  // 增肌减脂同步（recomp）：碳水只下调 0.3 + 蛋白 +0.2 → 热量近维持，边增肌边减脂
  // 增肌：只加蛋白 +0.2
  // ⚠️ 调整后必须回写 carbG/protG 再返回，否则「每 kg 系数」与返回的克数不自洽（旧版就踩了这个坑）
  if (goal === '减脂') {
    carbG = clampNum(carbG - 0.5, 1.5, 5.0)
    protG = clampNum(protG + 0.2, 1.4, 2.0)
  } else if (goal === '增肌减脂同步') {
    carbG = clampNum(carbG - 0.3, 1.5, 5.0)
    protG = clampNum(protG + 0.2, 1.4, 2.0)
  } else if (goal === '增肌') {
    protG = clampNum(protG + 0.2, 1.4, 2.0)
  }
  const carb = round(carbG * w)
  const protein = round(protG * w)
  const kcal = round(fat * 9 + protein * 4 + carb * 4)
  return { fat, carb, protein, kcal, carbG: round(carbG, 2), protG: round(protG, 2) }
}

// 减脂力度仅改变热量基线，沿用原有蛋白/脂肪口径，不改变训练计划。
function fatLossPolicy(profile, total) {
  const p=profile||{},rule=DIET_RULE.fatLossPaces||{steady:{name:'稳步减脂',kcal:300},intensive:{name:'强化减脂',kcal:500},maxRatio:.20}
  const enabled=p.goal==='减脂', age=Number(p.age), w=Number(p.weight), h=Number(p.height)
  let reason=''
  if(enabled && (!Number.isFinite(age)||age<18||!Number.isFinite(w)||w<=0||!Number.isFinite(h)||h<=0||!['男','女'].includes(p.gender))) reason='请先完善成年用户的年龄、性别、身高和体重，再选择强化档。'
  else if(enabled && w/Math.pow(h/100,2)<18.5) reason='当前档案体重偏低，不开放强化档。'
  const requested=enabled&&p.fatLossPace==='intensive'?'intensive':'steady', key=requested==='intensive'&&!reason?'intensive':'steady'
  const cap=Math.max(0,Math.floor((Number(total)||0)*rule.maxRatio)), nominal=rule[key].kcal
  return {enabled,key,requested,name:rule[key].name,maxDeficit:Math.min(rule.intensive.kcal,cap),eligible:enabled&&!reason,reason,cap,nominal,baseDeficit:Math.min(nominal,cap),maxRatio:rule.maxRatio}
}
function fatLossChoices(profile,adj) {
  if(!profile||profile.goal!=='减脂') return null
  const current=energyPlan(profile,adj),base=Object.assign({},profile)
  delete base.dietReferenceTarget
  const choices=['steady','intensive'].map(key=>{const e=energyPlan(Object.assign({},base,{fatLossPace:key}),Object.assign({},adj,{kcalAdj:0}));return {key,name:key==='steady'?'稳步减脂':'强化减脂',kcal:e.kcal,deficit:Math.round(e.deficit),disabled:key==='intensive'&&!e.fatLoss.eligible}})
  return {key:current.fatLoss.key,name:current.fatLoss.name,choices,reason:current.fatLoss.reason,custom:current.source==='reference',limited:current.fatLoss.baseDeficit<current.fatLoss.nominal,note:'稳步档默认约300，强化档最高约500大卡；均不超过估算总消耗的20%。这是产品估算规则，不保证减重速度。'}
}

// ===== 每日消耗与热量目标（锚定 TDEE）=====
// ⚠️ 旧版只有 dietMacros：它的 kcal 是「蛋白/脂肪/碳水反算」出来的，**完全没有锚定每日消耗**，
//    所以会给高强度训练者算出远低于实际需要的热量、把缺口拉到 700+（远超谭成义的安全缺口 200-300）。
//    这里改为：BMR × 活动系数 = TDEE → 目标热量 = TDEE ± 目标缺口 → 碳水作为弹性项补齐差额。
function energyPlan(profile, adj) {
  const p = profile || {}
  const w = Number(p.weight) || 60
  const h = Number(p.height) || 170
  const age = Number(p.age) || 30
  const goal = p.goal || '塑形'
  const b = bmr(p.gender || '男', w, h, age)
  const act = (METHOD && METHOD.activityOf) ? METHOD.activityOf(p.activity)
    : { key: 'mod', name: '中度', factor: 1.55, desc: '' }
  const td = round(b * act.factor)
  const m = dietMacros(p, adj)                        // 给出蛋白、脂肪，以及「按体质基准」的碳水
  // adj.kcalAdj：周级「宏观调控」的热量杠杆（kcal/天，默认 0，正数=多吃）。
  // 为什么必须有它：碳水在下面是用「热量补齐」算出来的，只调 carbAdj 时碳水几乎不动
  //   （只有蛋白跷跷板腾出的几十 kcal 落到碳水），会出现「文案说加 23g 碳水、实际只涨 7g」的言行不一。
  //   要真的多给碳水，就得抬高热量目标。
  const kcalAdj = round(Number(adj && adj.kcalAdj) || 0)
  const fatLoss = fatLossPolicy(p,td)
  const baseAdj = fatLoss.enabled ? -fatLoss.baseDeficit : kcalAdjOf(goal)
  const rawTarget = td + baseAdj + kcalAdj
  // 负向宏观调整不能绕过缺口上限；正向反馈仍可增加摄入。
  const deficitCap = fatLoss.enabled ? fatLoss.maxDeficit : Infinity
  const targetKcal = round(Math.max(rawTarget,td-deficitCap))   // TDEE ± 目标缺口 ± 宏观调节
  // 碳水是弹性项：固定蛋白与脂肪后，用碳水补齐到目标热量
  const carbFlex = Math.max(0, (targetKcal - m.protein * 4 - m.fat * 9) / 4)
  // 钳制用「生理上下限」（1.5–6.5 g/kg），**不要**拿体质基准当天花板——
  // 否则训练量大的用户（TDEE 3300+）碳水被压住、缺口又被拉到 900，等于白算 TDEE。
  const carb = (fatLoss.enabled ? Math.ceil : Math.round)(clampNum(carbFlex, 1.5 * w, fatLoss.enabled ? Infinity : 6.5 * w))
  const kcal = round(m.protein * 4 + m.fat * 9 + carb * 4)
  const custom = p.dietReferenceTarget
  if (custom && custom.basis === require('./diet.js').referenceBasis(p) &&
      ['kcal','protein','carb','fat'].every(k => Number.isFinite(custom[k]) && custom[k] >= 0) && custom.kcal > 0) {
    return { bmr:b, activity:act, tdee:td, targetKcal:custom.kcal,
      kcal:custom.kcal, protein:custom.protein, carb:custom.carb, fat:custom.fat,
      protG:round(custom.protein/w,2), carbG:round(custom.carb/w,2), fatG:round(custom.fat/w,2),
      deficit:td-custom.kcal, wantDeficit:td-custom.kcal, warn:false, source:'reference', fatLoss }
  }
  const deficit = td - kcal                           // 正数=缺口，负数=盈余
  // 期望缺口：宏观调控是「有意的」偏离，不该再触发"偏离期望"告警
  const wantDeficit = td-targetKcal
  return {
    bmr: b, activity: act, tdee: td,
    targetKcal, protein: m.protein, carb, fat: m.fat, kcal,
    carbBase: m.carb, carbG: round(carb / w, 2), protG: m.protG, fatG: round(m.fat / w, 2),
    kcalAdj, deficit, wantDeficit, fatLoss,
    warn: Math.abs(deficit - wantDeficit) > 250       // 偏离期望缺口 250kcal 以上 → UI 提示
  }
}

// ===== 体重趋势 → 调控建议 =====
// 谭成义：固定吃 7-10 天再看体重；降太快加碳水、降不动减碳水；涨太快减碳水。
function weightTrend(checkins, profile, days) {
  const list = (checkins || []).filter(c => c && c.weight).sort((a, b) => (a.date < b.date ? -1 : 1))
  const recent = list.slice(-(days || 14))
  const points = recent.map(c => ({ date: c.date, w: Number(c.weight) }))
  if (recent.length < 2) {
    return { enough: false, points, note: '体重记录不足：至少要有 2 次、且跨越 7 天以上才看得出趋势。' }
  }
  const first = recent[0], last = recent[recent.length - 1]
  const dDays = Math.max(1, Math.round((new Date(last.date + 'T00:00:00') - new Date(first.date + 'T00:00:00')) / 86400000))
  const delta = round(Number(last.weight) - Number(first.weight), 1)
  const perWeek = round(delta / dDays * 7, 2)
  const goal = (profile && profile.goal) || '塑形'
  let advice, step = 0
  if (goal === '增肌') {
    if (perWeek <= 0) { advice = '体重没涨：碳水 +0.25g/kg（先加在练后那餐）'; step = 0.25 }
    else if (perWeek >= 0.5) { advice = '涨得偏快：碳水 −0.25g/kg，避免长脂肪'; step = -0.25 }
    else advice = '涨速合适（每周 0.2–0.4kg），维持现在的量'
  } else if (goal === '增肌减脂同步' || goal === '塑形') {
    if (perWeek <= -1.0) { advice = '掉得太快，可能掉肌肉：碳水 +0.25g/kg'; step = 0.25 }
    else if (perWeek <= -0.15) advice = '降速合适（每周 0.3–0.8kg），维持'
    else { advice = '体重几乎没动：碳水 −0.25g/kg，或每天多走 2000 步'; step = -0.25 }
  } else {
    if (perWeek >= -0.15) { advice = '体重几乎没动：碳水 −0.25g/kg，或每天多走 2000 步'; step = -0.25 }
    else if (perWeek <= -1.0) { advice = '掉得太快（可能掉肌肉）：碳水 +0.25g/kg'; step = 0.25 }
    else advice = '降速合适（每周 0.3–0.8kg），维持'
  }
  return { enough: true, from: first.date, to: last.date, days: dDays, delta, perWeek, advice, step, points }
}

// 微饿循环：每天记饥饿感 → 微调碳水/蛋白偏移（很饿升碳水、微饿不动、不饿降碳水）
function applyHunger(type, adj) {
  // 蛋白步长 ±0.2：对齐谭成义《蛋白消化反馈调量》（放屁多且臭 → −0.2，无 → +0.2，两步封顶）
  const d = {
    '很饿': { carb: 0.5, protein: -0.2 },
    '微饿': { carb: 0,   protein: 0 },
    '不饿': { carb: -0.5, protein: 0.2 }
  }[type] || { carb: 0, protein: 0 }
  adj = adj || { carbAdj: 0, proteinAdj: 0 }
  return {
    // 保留 1 位小数：避免 0.30000000000000004 这类浮点脏值被写进数据库并显示给用户
    carbAdj: round(clampNum((adj.carbAdj || 0) + d.carb, -1.5, 1.5), 1),
    proteinAdj: round(clampNum((adj.proteinAdj || 0) + d.protein, -0.4, 0.4), 1)
  }
}

// 周期第几天（0基）→ 无限循环计划：返回任意非负天数差（可为大数，调用方用 %micro.length 取模）
function dayIndexFromStart(cycleStart, dateStr) {
  const s = new Date(cycleStart + 'T00:00:00')
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.floor((d - s) / 86400000)
  return diff // 负数表示计划尚未开始（调用方钳为 0）
}

module.exports = {
  round, bmi, bmiCat, bmr, activityFactor, tdee, calorieTarget, macros, dayIndexFromStart,
  dietMacros, applyHunger,
  energyPlan, weightTrend, fatLossPolicy, fatLossChoices
}
