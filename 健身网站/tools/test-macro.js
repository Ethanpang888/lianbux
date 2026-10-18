#!/usr/bin/env node
/**
 * tools/test-macro.js —— 饮食宏观调控回归测试（纯 Node，零依赖）
 * 跑法：node tools/test-macro.js
 */
const m = require('../shared/macro.js')

let pass = 0, fail = 0
const failures = []
function ok(cond, name, extra) {
  if (cond) { pass++; return }
  fail++; failures.push(name + (extra ? '  → ' + extra : ''))
}
function section(t) { console.log('\n── ' + t + ' ──') }

// 日期助手：D(1) = 2026-09-01，可跨月（D(39) = 2026-10-09）
const _base = new Date('2026-09-01T00:00:00')
const D = (n) => {
  const d = new Date(_base)
  d.setDate(d.getDate() + (n - 1))
  const p = x => String(x).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}
/** 造体重序列：从 startDay 起连续 n 天，体重按 step/天 变 */
const series = (startDay, n, startW, step, skip) => {
  const out = []
  for (let i = 0; i < n; i++) {
    if (skip && skip.indexOf(i) >= 0) continue
    out.push({ date: D(startDay + i), weight: m.round(startW + step * i, 2) })
  }
  return out
}
/** 带噪点的序列：每天偏移按 noise 数组循环 */
const noisy = (startDay, n, startW, step, noise) => {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push({ date: D(startDay + i), weight: m.round(startW + step * i + noise[i % noise.length], 2) })
  }
  return out
}
const call = (checkins, goal, dietState, today) => m.review({
  checkins, profile: { goal, weight: checkins.length ? checkins[checkins.length - 1].weight : 93 },
  dietState: dietState || {}, today: today || D(21)
})

// ── 1. 数据闸门 ──
section('1. 数据不够时不说话')
{
  const r0 = call([], '减脂')
  ok(r0.ready === false && r0.verdict === 'not_ready', '没有体重记录 → 不下结论')
  ok(/还没有体重记录/.test(r0.reason), '给出该怎么做的提示', r0.reason)

  const r1 = call(series(15, 2, 93, -0.1), '减脂')
  ok(r1.ready === false, '只有 2 个点 → 不下结论')
  ok(r1.progress.stillNeed > 0, '告诉还差几天', JSON.stringify(r1.progress))

  const r2 = call(series(18, 4, 93, -0.1), '减脂')   // 4 个点但只跨 3 天
  ok(r2.ready === false, '点数够但天数不够（3 天）→ 不下结论', JSON.stringify(r2.window))
  ok(r2.progress.haveDays === 3, '天数统计正确', String(r2.progress.haveDays))

  const r3 = call(series(12, 10, 93, -0.05), '减脂') // 10 点跨 9 天
  ok(r3.ready === true, '10 天 10 个点 → 可以评估')
}

// ── 2. 脏数据保护 ──
section('2. 数据太脏 / 说不清时拒绝给建议')
{
  // 上下乱跳，没有任何方向
  const zigzag = noisy(12, 10, 93, 0, [0, 2.2, -0.6, 1.6, -0.2, 2.4, 0.2, 2.0, 0.6, 2.1])
  const r = call(zigzag, '减脂')
  ok(r.verdict === 'unclear' || r.verdict === 'noisy', '上下乱跳 → 不下结论', r.verdict + ' ciRatio=' + (r.trend && r.trend.ci && r.trend.ci.ratio))
  ok(r.applied === false, '不下结论时不产出调整动作')
  ok(r.action === null, '不给 step', JSON.stringify(r.action))
  ok(/再多记几天|称重条件/.test(r.reason), '给出"多记几天/固定称重"的具体办法', r.reason.slice(0, 50))

  // 测量条件彻底失控（波动 > 1.8kg）
  const wild = noisy(12, 10, 93, 0, [0, 4.0, -1.0, 3.0, -0.5, 4.2, 0.5, 3.6, 1.0, 3.8])
  const r2 = call(wild, '减脂')
  ok(r2.verdict === 'noisy' && r2.window.sd > m.MACRO.maxSd, '波动超过 ' + m.MACRO.maxSd + 'kg → 直接拒绝', String(r2.window.sd))
  ok(/早起空腹/.test(r2.reason), '给出测量规范提示')

  // 有噪声但趋势真实存在 → 应该照样给结论
  const real = noisy(12, 14, 93, -0.07, [0, 0.3, -0.3, 0.2, -0.2, 0.3, -0.1, 0.2, -0.3, 0.1, -0.2, 0.2, -0.1, 0.1])
  const r3 = call(real, '减脂', {}, D(25))
  ok(r3.ready === true, '有点噪声但有真实趋势 → 仍然给结论', r3.verdict + ' t=' + r3.trend.t)
  ok(['mid', 'high'].indexOf(r3.trend.confidence) >= 0, '置信度不低', r3.trend.confidence + ' ciRatio=' + r3.trend.ci.ratio)

  // 置信区间必须满足 lowKg ≤ perWeek ≤ highKg
  ok(r3.trend.ci.lowKg <= r3.trend.perWeek && r3.trend.perWeek <= r3.trend.ci.highKg,
    '置信区间包住点估计', JSON.stringify(r3.trend.ci))
}

// ── 3. 断档处理 ──
section('3. 记录断档只取最近连续段')
{
  const a = series(1, 5, 94, -0.1)          // 9/1–9/5（断档 6 天）
  const b = series(12, 8, 93.5, -0.05)      // 9/12–9/19
  const all = a.concat(b)
  const pts = m.contiguousTail(m.weightPoints(all), D(21))
  ok(pts.length === 8, '丢掉断档前的旧数据，只留 8 个点', String(pts.length))
  ok(pts[0].date === D(12), '起始日期是断档之后', pts[0].date)
}

// ── 4. 同日重复只算一个 ──
section('4. 体重取数清洗')
{
  const pts = m.weightPoints([
    { date: D(10), weight: 93.0 }, { date: D(10), weight: 93.4 },
    { date: D(11), weight: 92.8 }, { date: D(12), weight: 0 }, { date: D(13), weight: 900 }
  ])
  ok(pts.length === 2, '同日去重 + 过滤异常值（0 / 900）', JSON.stringify(pts))
  ok(pts[0].w === 93.4, '同日取后写入的那条', String(pts[0].w))
}

// ── 5. 减脂：三种判定 ──
section('5. 减脂 目标区间 −0.4% ~ −0.8% / 周')
{
  // 每周 -0.6% → 93kg × 0.006 = 0.558kg/周 = 0.0797kg/天
  const onTrack = call(series(12, 10, 93, -0.0797), '减脂')
  ok(onTrack.verdict === 'on_track', '每周 −0.6% → on_track', onTrack.verdict + ' ' + onTrack.trend.perWeekPct)
  ok(onTrack.action === null && onTrack.applied === false, 'on_track 不产出调整')
  ok(/节奏正好/.test(onTrack.headline), '给正面反馈', onTrack.headline)

  const tooFast = call(series(12, 10, 93, -0.14), '减脂')
  ok(tooFast.verdict === 'below', '每周约 −1.05% → 掉太快', tooFast.trend.perWeekPct + '')
  ok(tooFast.action && tooFast.action.step === 0.25, '掉太快 → 碳水 +0.25g/kg', JSON.stringify(tooFast.action))
  ok(/加碳水/.test(tooFast.headline), '文案说加碳水', tooFast.headline)

  const stalled = call(series(12, 10, 93, 0.0), '减脂')
  ok(stalled.verdict === 'above', '体重不动 → 缺口不够', stalled.verdict)
  ok(stalled.action && stalled.action.step === -0.25, '不动 → 碳水 −0.25g/kg', JSON.stringify(stalled.action))
  ok(/别一路砍碳水/.test(stalled.message), '提示换杠杆而不是无限砍碳水')
}

// ── 6. 增肌：区间正负号相反也不出错 ──
section('6. 增肌 目标区间 +0.1% ~ +0.3% / 周')
{
  const slow = call(series(12, 10, 80, 0.0), '增肌')
  ok(slow.verdict === 'below' && slow.action.step === 0.25, '体重不涨 → 加碳水', slow.verdict)
  ok(/涨得不够/.test(slow.message), '文案按增肌语境解释', slow.message.slice(0, 40))

  const fast = call(series(12, 10, 80, 0.05), '增肌')  // 0.35kg/周 = 0.44%/周
  ok(fast.verdict === 'above' && fast.action.step === -0.25, '涨太快 → 减碳水', fast.verdict + ' ' + fast.trend.perWeekPct)

  const good = call(series(12, 10, 80, 0.025), '增肌')  // 0.175kg/周 ≈ 0.22%/周
  ok(good.verdict === 'on_track', '涨速合适 → 维持', good.trend.perWeekPct + '')
}

// ── 7. 冷却期 ──
section('7. 冷却期：不频繁调')
{
  const cks = series(12, 10, 93, -0.14)
  const recent = call(cks, '减脂', { macro: { carbAdj: 0.25, lastAt: D(18) }, carbAdj: 0 }, D(21))
  ok(recent.verdict === 'cooldown', '上次调在 3 天前 → 冷却中', recent.verdict)
  ok(recent.nextReviewAt === m.shiftDate(D(18), 7), '给出下次可评估日期', recent.nextReviewAt)

  const old = call(cks, '减脂', { macro: { carbAdj: 0.25, lastAt: D(5) } }, D(21))
  ok(old.verdict !== 'cooldown' && old.ready === true, '上次调在 16 天前 → 可以再评估', old.verdict)
}

// ── 8. 累积上限 ──
section('8. 自动调整有上限，防止越调越乱')
{
  const maxKcal = Math.round(m.MACRO.maxAutoAdj * 93 * m.MACRO.kcalPerCarbG)   // ±279 kcal
  let ds = { macro: { kcalAdj: 0, history: [] }, carbAdj: 0, proteinAdj: 0 }
  let last = null, rounds = 0
  // 每轮间隔 8 天（> cooldownDays 7），否则会被冷却期挡住
  for (let k = 0; k < 6; k++) {
    const day = 21 + k * 8
    const cks = series(day - 9, 10, 93, -0.14)
    const r = m.review({ checkins: cks, profile: { goal: '减脂', weight: 93 }, dietState: ds, today: D(day) })
    if (r.ready) {
      rounds++
      ds = m.apply(r, ds)
      last = r
    }
  }
  ok(rounds === 6, '6 轮都成功评估（冷却期不误挡）', String(rounds))
  ok(ds.macro.kcalAdj === maxKcal, '累积调整封顶在 ±' + maxKcal + ' kcal', String(ds.macro.kcalAdj))
  ok(last.action.capped === true, '最后一轮标记为已到上限', String(last.action.capped))
  ok(/到上限/.test(last.message), '提示改用训练量/活动量杠杆', last.message.slice(-60))
  ok(ds.macro.history.length === 6, '每次调整都留痕', String(ds.macro.history.length))
  ok(ds.macro.history[0].from === 0 && ds.macro.history[0].to === last.action.kcalStep,
    '留痕记录 from→to（热量口径）', JSON.stringify(ds.macro.history[0]).slice(0, 110))
  ok(ds.macro.history[0].carbGrams === 23, '留痕同时记下碳水克数（人类口径）', String(ds.macro.history[0].carbGrams))
}

// ── 9. apply 不改入参 ──
section('9. apply 纯函数性质')
{
  const before = { macro: { kcalAdj: 0, history: [] }, carbAdj: 0.5, proteinAdj: -0.2 }
  const frozen = JSON.stringify(before)
  const r = call(series(12, 10, 93, -0.14), '减脂')
  const after = m.apply(r, before)
  ok(JSON.stringify(before) === frozen, '入参 dietState 未被修改')
  ok(after.macro.lastAt === D(21), '写入评估基准日', after.macro.lastAt)
  ok(after.carbAdj === 0.5, '饥饿反馈的偏移原样保留（两路独立）', String(after.carbAdj))
  const r2 = m.review({ checkins: series(21, 1, 93, 0), profile: { goal: '减脂', weight: 93 }, dietState: {}, today: D(21) })
  const after2 = m.apply(r2, before)
  ok(after2.macro.kcalAdj === 0, '未就绪的 review → apply 不产生变化', String(after2.macro.kcalAdj))
}

// ── 10. 两路偏移合并 + 「说的话」与「算的数」必须一致 ──
section('10. 饥饿反馈 + 宏观调控 合并，且承诺 = 实际')
{
  const adj = m.combinedAdj({ carbAdj: 0.5, proteinAdj: -0.2, macro: { kcalAdj: -180 } })
  ok(adj.carbAdj === 0.5, '饥饿反馈的碳水偏移原样透传', String(adj.carbAdj))
  ok(adj.proteinAdj === -0.2, '蛋白偏移原样透传', String(adj.proteinAdj))
  ok(adj.kcalAdj === -180, '宏观热量杠杆透传', String(adj.kcalAdj))

  const bd = m.breakdown({ carbAdj: 0.5, proteinAdj: -0.2, macro: { kcalAdj: -180, carbAdj: -0.45, lastAt: D(21), history: [{ date: D(21) }] } })
  ok(bd.hunger.carb === 0.5 && bd.macro.kcal === -180, 'breakdown 能拆清"谁贡献的"', JSON.stringify(bd.total))
  ok(bd.lastMacroAt === D(21) && bd.macroHistory.length === 1, '带回最近调整记录')

  // ★ 核心：文案说"碳水 +23g"，引擎就必须真的多给 23g 碳水（曾经只有 7g）
  const calc = require('../../健身小程序/utils/calc.js')
  const P = { gender: '男', age: 30, height: 183, weight: 93, goal: '增肌减脂同步', bodyType: '中性', activity: 'mod' }
  const none = calc.energyPlan(P, m.combinedAdj({ carbAdj: 0, macro: { kcalAdj: 0 } }))
  const r = call(series(12, 10, 93, -0.14), '减脂')
  ok(r.action.carbGrams === 23, '建议口径：碳水 +23g', String(r.action.carbGrams))
  const after = Object.assign({}, {}, { macro: { kcalAdj: r.action.kcalAfter } })
  const plus = calc.energyPlan(P, m.combinedAdj(after))
  const realGain = plus.carb - none.carb
  ok(realGain === r.action.carbGrams, '★ 承诺加 ' + r.action.carbGrams + 'g 碳水 → 实际涨 ' + realGain + 'g（必须相等）',
    none.carb + ' → ' + plus.carb)
  ok(plus.kcal - none.kcal === r.action.kcalStep, '热量增量也与承诺一致',
    (plus.kcal - none.kcal) + ' vs ' + r.action.kcalStep)
  ok(plus.protein === none.protein, '★ 蛋白不受影响（不会被跷跷板顺手压下去）',
    none.protein + ' → ' + plus.protein)
  ok(plus.fat === none.fat, '脂肪不受影响', none.fat + ' → ' + plus.fat)
  ok(plus.protG >= 1.4, '蛋白仍在谭成义下限 1.4g/kg 以上', plus.protG + '/kg')

  // 反向：该减碳水时也一致
  const rDown = call(series(12, 10, 93, 0.0), '减脂')
  const minus = calc.energyPlan(P, m.combinedAdj({ macro: { kcalAdj: rDown.action.kcalAfter } }))
  ok(minus.carb - none.carb === rDown.action.carbGrams, '★ 建议减量时同样言行一致',
    none.carb + ' → ' + minus.carb + '（承诺 ' + rDown.action.carbGrams + 'g）')
}

// ── 11. 折线数据 ──
section('11. 迷你折线数据')
{
  const pts = [{ date: D(12), w: 93 }, { date: D(16), w: 92 }, { date: D(21), w: 91 }]
  const sp = m.sparkline(pts, 1)
  ok(sp.length === 3, '点数量一致')
  ok(sp[0].x === 0 && sp[2].x === 1, '首尾 x 归一化到 0 / 1', sp.map(p => p.x).join(','))
  ok(sp[0].y === 1 && sp[2].y === 0, '最高点 y=1、最低点 y=0', sp.map(p => p.y).join(','))
  ok(m.sparkline([{ date: D(12), w: 93 }]).length === 0, '只有一个点 → 不画线')

  const flat = m.sparkline([{ date: D(12), w: 93 }, { date: D(13), w: 93 }], 1)
  ok(flat.every(p => p.y >= 0 && p.y <= 1), '体重完全相同时不出现 NaN/越界', JSON.stringify(flat))
}

// ── 12. 拟合质量 ──
section('12. 拟合质量与置信度')
{
  const clean = call(series(12, 10, 93, -0.1), '减脂')
  ok(clean.trend.confidence === 'high', '线性下降 → high', clean.trend.confidence + ' r2=' + clean.trend.r2)
  ok(clean.trend.r2 > 0.95, 'R² 接近 1', String(clean.trend.r2))
  const fit = m.fitLine([{ date: D(12), w: 93 }, { date: D(21), w: 92.1 }], D(12))
  ok(m.round(fit.slope, 3) === -0.1, '斜率 = −0.1kg/天', String(fit.slope))
  ok(typeof fit.t === 'number' && fit.t > 10, '曲线干净 → t 极大（趋势极显著）', String(fit.t))
  ok(typeof clean.trend.t === 'number' && clean.trend.t > 3, 'trend 带回 t 值', String(clean.trend.t))
}

console.log('\n' + '═'.repeat(56))
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail) { console.log('\n  失败明细：'); failures.forEach(f => console.log('   · ' + f)) }
console.log('═'.repeat(56))
process.exit(fail ? 1 : 0)
