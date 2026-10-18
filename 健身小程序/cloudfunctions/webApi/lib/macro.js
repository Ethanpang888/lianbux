/**
 * shared/macro.js —— 饮食「宏观调控」唯一真相源（纯函数，零依赖）
 *
 * 解决什么问题：
 *   微饿循环（calc.applyHunger）是**日级**的感性反馈——今天饿就加点碳水。
 *   但真正决定成败的是**周级的客观趋势**：连续 7–10 天的体重曲线往哪走。
 *   这个模块负责：读体重数据 → 算趋势 → 和目标速率比 → 给一次调整（或不调）。
 *
 * 三条铁律（都是为了防止"越调越乱"）：
 *   1. **够数据才说话**：至少 4 个体重点、跨 7 天以上、相邻间隔不超过 4 天。不够就说"再攒几天"。
 *   2. **不频繁调**：距上次调整至少 7 天（cooldownDays）。体重的水分波动能在 2–3 天内骗过任何公式。
 *   3. **有上限**：自动调整累计不超过 ±0.75 g/kg。到顶了就让用户去改活动量/训练量，而不是无限减碳水。
 *
 * 数据流：checkins[{date, weight}] + profile.goal → 一次 review → dietState.macro.carbAdj
 *   最终喂给 calc.dietMacros 的偏移 = 饥饿反馈偏移 + 宏观调控偏移（见 combinedAdj）
 */

// ───────────────────────── 参数表 ─────────────────────────

const MACRO = {
  // —— 数据要求 ——
  minDays: 7,          // 窗口至少跨 7 天
  preferDays: 10,      // 首选窗口 10 天（用户说的"一周或 10 天"）
  maxDays: 21,         // 最多回看 21 天
  minPoints: 4,        // 至少 4 个有效体重点
  maxGapDays: 4,       // 相邻两次记录间隔 > 4 天 → 视为断档，只取最近连续段
  maxSd: 1.8,          // 体重标准差 > 1.8kg → 测量条件明显失控，直接拒绝给结论
  ciZ: 1.645,          // 90% 置信区间的 z 值

  // —— 调整规则 ——
  cooldownDays: 7,     // 距上次调整 ≥ 7 天才再次自动调
  maxCiRatio: 1.5,     // 置信区间宽度 ÷ 目标区间宽度 > 1.5 → 趋势太不确定，不下结论
  step: 0.25,          // 单次碳水步长 g/kg（人类可读的表达方式）
  kcalPerCarbG: 4,     // 1g 碳水 = 4 kcal（换算到实际杠杆）
  maxAutoAdj: 0.75,    // 自动调整累计上限（g/kg 口径；换算成热量上限见 maxAutoKcal）
  maxStepsPerReview: 1 // 每次最多 ±1 步
}

/**
 * 为什么实际杠杆是「热量」而不是 carbAdj？
 *   energyPlan 里碳水是「热量补齐项」——固定蛋白/脂肪后，用碳水填到目标热量。
 *   所以只加 carbAdj，碳水几乎不动（只有蛋白跷跷板腾出的几十 kcal 落到碳水），
 *   会出现「文案说加 23g 碳水、结果只涨 7g」的言行不一。
 *   真要多吃碳水，必须抬高热量目标：kcalAdj = 碳水克数 × 4。
 *   这样「说的话」和「算的数」才一致，蛋白也不会因为跷跷板莫名其妙掉下来。
 */

// 目标速率：相对当前体重的每周变化比例（用比例而非绝对值，大体重小体重都适用）
const GOAL_TARGET = {
  '减脂':        { min: -0.008, max: -0.004, name: '减脂', tip: '每周 −0.4% ~ −0.8% 体重最稳（掉太快会丢肌肉）' },
  '增肌减脂同步': { min: -0.004, max: 0.001, name: '增肌减脂同步', tip: '体重基本走平（±0.4% 以内），围度和力量在涨就对了' },
  '塑形':        { min: -0.004, max: 0.001, name: '塑形', tip: '体重基本走平（±0.4% 以内），围度和力量在涨就对了' },
  '增肌':        { min: 0.001, max: 0.003, name: '增肌', tip: '每周 +0.1% ~ +0.3% 体重，涨太快长的是脂肪' }
}

const DAY = 86400000
const round = (n, d = 0) => { const p = Math.pow(10, d); return Math.round((Number(n) || 0) * p) / p }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

function dayDiff(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY)
}
function shiftDate(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const p = x => String(x).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

// ───────────────────────── 取数 ─────────────────────────

/** 从打卡记录里抽体重点（去重同日、按日期升序） */
function weightPoints(checkins) {
  const byDate = {}
  ;(checkins || []).forEach(c => {
    const w = Number(c && c.weight)
    if (c && c.date && w > 20 && w < 400) byDate[c.date] = { date: c.date, w: round(w, 1) }
  })
  return Object.keys(byDate).sort().map(k => byDate[k])
}

/** 只保留最近的一段连续记录（相邻间隔 ≤ maxGapDays），再截到 maxDays 内 */
function contiguousTail(points, today) {
  if (!points.length) return []
  const out = [points[points.length - 1]]
  for (let i = points.length - 2; i >= 0; i--) {
    if (dayDiff(points[i].date, out[0].date) > MACRO.maxGapDays) break
    out.unshift(points[i])
  }
  const from = shiftDate(today || out[out.length - 1].date, -MACRO.maxDays)
  return out.filter(p => p.date >= from)
}

/** 最小二乘斜率（kg/天） + 拟合优度 R² + 斜率的 t 值（趋势是否显著） */
function fitLine(points, fromDate) {
  const xs = points.map(p => dayDiff(fromDate, p.date))
  const ys = points.map(p => p.w)
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  const r2 = (sxx === 0 || syy === 0) ? 0 : (sxy * sxy) / (sxx * syy)
  // 残差标准误 → 斜率的 t 值。t ≈ 斜率是它自身标准误的多少倍。
  // 直观理解：同样掉 0.5kg/周，体重曲线很干净 → t 大（可信）；上下乱跳 → t 小（不可信）。
  // 注意：n=2 时残差自由度是 0，算不出误差 → 约定 se=0、t=99（两点必完美拟合）。
  let se = 0, t = 0
  if (sxx > 0) {
    if (n > 2) {
      let sse = 0
      for (let i = 0; i < n; i++) {
        const pred = my + slope * (xs[i] - mx)
        sse += (ys[i] - pred) ** 2
      }
      se = Math.sqrt(sse / (n - 2) / sxx)
    }
    t = se > 0 ? Math.abs(slope) / se : (slope === 0 ? 0 : 99)
  }
  return { slope, r2, t: round(t, 2), se, intercept: my - slope * mx }
}

function sd(values) {
  if (values.length < 2) return 0
  const m = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1))
}

/** 「每周 −0.5kg（−0.54%）」这种一句话描述，多处复用 */
function trendWordsOf(perWeek, perWeekPct) {
  if (perWeek === 0) return '体重没动'
  return '每周 ' + (perWeek > 0 ? '+' : '') + perWeek + 'kg（' +
    (perWeekPct >= 0 ? '+' : '') + round(perWeekPct * 100, 2) + '%）'
}

// ───────────────────────── 主流程 ─────────────────────────

/**
 * 评估一次宏观调控。
 * @param {Object} input
 *   - checkins  打卡记录数组（含 {date, weight}）
 *   - profile   用户档案（用 goal / weight）
 *   - dietState 饮食状态（用 macro.lastAt / macro.carbAdj / carbAdj）
 *   - today     今天日期 YYYY-MM-DD
 * @returns {Object} review（结构见下方 return）
 */
function review(input) {
  const { checkins, profile, dietState, today } = input || {}
  const P = profile || {}
  const ds = dietState || {}
  const macroState = ds.macro || {}
  const goal = P.goal || '塑形'
  const target = GOAL_TARGET[goal] || GOAL_TARGET['塑形']
  const curW = Number(P.weight) || 0

  const all = weightPoints(checkins)
  const tail = contiguousTail(all, today)
  const window = tail.slice(-MACRO.preferDays * 2) // 最多取这么多点，再按天数裁
  const days = window.length >= 2 ? dayDiff(window[0].date, window[window.length - 1].date) : 0
  const sdv = round(sd(window.map(p => p.w)), 2)

  const base = {
    goal, target, points: window, totalPoints: all.length,
    window: {
      from: window.length ? window[0].date : '',
      to: window.length ? window[window.length - 1].date : '',
      days, count: window.length, sd: sdv
    },
    state: {
      carbAdj: round(macroState.carbAdj || 0, 2),
      lastAt: macroState.lastAt || '',
      times: (macroState.history || []).length
    },
    ready: false, verdict: 'not_ready', action: null, nextReviewAt: ''
  }

  // —— 闸门 1：数据够不够 ——
  if (all.length < 2) {
    return Object.assign(base, {
      reason: '还没有体重记录。每天早起空腹称一次，是这套系统唯一的"传感器"。',
      progress: { havePoints: all.length, needPoints: MACRO.minPoints, haveDays: 0, needDays: MACRO.minDays }
    })
  }
  if (window.length < MACRO.minPoints || days < MACRO.minDays) {
    const needPoints = Math.max(0, MACRO.minPoints - window.length)
    const needDays = Math.max(0, MACRO.minDays - days)
    return Object.assign(base, {
      reason: '数据还不够下结论——至少 ' + MACRO.minPoints + ' 次体重、跨 ' + MACRO.minDays +
        ' 天（建议 ' + MACRO.preferDays + ' 天）。再记 ' + Math.max(needPoints, needDays) + ' 天就够。',
      progress: {
        havePoints: window.length, needPoints: MACRO.minPoints,
        haveDays: days, needDays: MACRO.minDays, stillNeed: Math.max(needPoints, needDays)
      }
    })
  }

  // —— 闸门 2：数据脏不脏 ——
  const fit = fitLine(window, window[0].date)
  const perWeek = round(fit.slope * 7, 2)
  const perWeekPct = curW > 0 ? round(perWeek / curW, 4) : 0

  // 90% 置信区间：趋势本身有误差，要把误差一起拿来判定。
  // 宽度用「区间宽度 ÷ 目标区间宽度」衡量可信度：越窄越可信。
  const ciKg = round(MACRO.ciZ * (fit.se || 0) * 7, 2)                 // ±kg/周
  const loKg = round(perWeek - ciKg, 2)
  const hiKg = round(perWeek + ciKg, 2)
  const loPct = curW > 0 ? round(loKg / curW, 4) : 0
  const hiPct = curW > 0 ? round(hiKg / curW, 4) : 0
  const targetWidth = Math.max(1e-6, target.max - target.min)
  const ciRatio = round(((hiPct - loPct) / targetWidth), 2)
  const confidence = ciRatio <= 1 ? 'high' : (ciRatio <= 3 ? 'mid' : 'low')

  const trend = {
    deltaKg: round(window[window.length - 1].w - window[0].w, 1),
    fromWeight: window[0].w, toWeight: window[window.length - 1].w,
    perWeek, perWeekPct, r2: round(fit.r2, 2), t: fit.t, confidence,
    ci: { lowKg: loKg, highKg: hiKg, lowPct: loPct, highPct: hiPct, ratio: ciRatio }
  }

  // 测量条件失控（波动本身比任何趋势都大）→ 直接不给结论
  if (sdv > MACRO.maxSd) {
    return Object.assign(base, {
      applied: false, trend, verdict: 'noisy',
      reason: '这 ' + days + ' 天体重波动 ' + sdv + 'kg，比趋势本身还大（多半是吃咸了、喝水、' +
        '称重时间不固定）。先固定"早起空腹、同上秤、上完厕所"再评估。',
      weekly: { perWeek, perWeekPct }
    })
  }

  // —— 闸门 3：冷却期（刚调过就再等等）——
  // 一次调整至少要 7 天才看得出效果；中间乱改，等于把上一次实验作废。
  if (macroState.lastAt) {
    const since = dayDiff(macroState.lastAt, today || window[window.length - 1].date)
    if (since < MACRO.cooldownDays) {
      return Object.assign(base, {
        applied: false, trend, verdict: 'cooldown',
        reason: '上次调整在 ' + since + ' 天前，' + trendWordsOf(perWeek, perWeekPct) + '。' +
          '一次调整至少要 ' + MACRO.cooldownDays + ' 天才看得出效果，现在再改会来回打架——' +
          '先按现在的吃法走，' + (MACRO.cooldownDays - since) + ' 天后再评估。',
        nextReviewAt: shiftDate(macroState.lastAt, MACRO.cooldownDays)
      })
    }
  }

  // —— 闸门 4：趋势够不够确定 ——
  // 关键区分（曾经在这里错过一次）：
  //   · 「置信区间跨过边界」≠「说不清」——只要区间足够窄，点估计落哪就是哪，照常给结论。
  //   · 只有区间宽到超过目标带本身的 maxCiRatio 倍，才叫真的分不清。
  //   · 体重「完全没动」区间又平又窄，会正常落到"该减碳水"，不会被误判成噪声。
  if (ciRatio > MACRO.maxCiRatio) {
    return Object.assign(base, {
      applied: false, trend, verdict: 'unclear',
      reason: '这 ' + days + ' 天体重上下有 ' + sdv + 'kg 的波动，趋势可能落在 ' + loKg + ' ~ ' + hiKg +
        'kg/周，范围比目标区间还宽（' + target.tip + '）——现在改饮食，说不清效果是它带来的还是波动。' +
        '两个办法：① 再多记几天（记到 ' + (MACRO.preferDays + 4) + ' 天以上）；' +
        '② 把称重条件固定下来（早起、空腹、同上秤）。',
      weekly: { perWeek, perWeekPct }
    })
  }

  // —— 判定：点估计落在目标区间里吗 ——
  // 点估计定方向（该加还是该减），置信区间宽度已在上一步确认过可信度。
  const overlapsTarget = !(hiPct < target.min || loPct > target.max)
  const insideTarget = loPct >= target.min && hiPct <= target.max
  let verdict, step = 0
  if (perWeekPct >= target.min && perWeekPct <= target.max) {
    verdict = 'on_track'
  } else if (perWeekPct < target.min) {
    verdict = 'below'     // 低于目标区间 → 需要加碳水
    step = MACRO.step
  } else {
    verdict = 'above'     // 高于目标区间 → 需要减碳水
    step = -MACRO.step
  }
  const borderline = overlapsTarget && !insideTarget   // 区间擦边：照调，但标注不确定

  const before = round(macroState.kcalAdj || 0, 2)
  const carbGrams = curW ? Math.round(step * curW) : 0
  const kcalStep = Math.round(carbGrams * MACRO.kcalPerCarbG)      // 实际杠杆：热量
  const maxKcal = Math.round(MACRO.maxAutoAdj * (curW || 80) * MACRO.kcalPerCarbG)
  let after = round(before + kcalStep, 0)
  const capped = Math.abs(after) > maxKcal
  if (capped) after = clamp(after, -maxKcal, maxKcal)

  const trendWords = trendWordsOf(perWeek, perWeekPct)
  const pctWords = (perWeekPct >= 0 ? '+' : '') + round(perWeekPct * 100, 2) + '%'

  let headline, message
  if (verdict === 'on_track') {
    headline = '节奏正好，不用调'
    message = '这 ' + days + ' 天' + trendWords + '，落在目标区间里。' + target.tip +
      '。保持现在的吃法，' + MACRO.cooldownDays + ' 天后再看一次。'
  } else if (verdict === 'below') {
    const why = target.min < 0
      ? '掉得比目标快，继续这样会掉肌肉、也容易反弹'
      : '涨得不够，训练量在花但没长起来'
    headline = '该加碳水了'
    message = '这 ' + days + ' 天' + trendWords + '，' + why + '。' +
      '把碳水加 ' + MACRO.step + 'g/kg' + (curW ? '（约 ' + Math.round(MACRO.step * curW) + 'g）' : '') +
      '，优先加在练后那餐。'
  } else {
    const why = target.max < 0
      ? '掉得比目标慢（或没掉），缺口不够'
      : '涨得比目标快，多出来的多半是脂肪'
    headline = '该减碳水了'
    message = '这 ' + days + ' 天' + trendWords + '，' + why + '。' +
      '把碳水减 ' + MACRO.step + 'g/kg' + (curW ? '（约 ' + Math.round(MACRO.step * curW) + 'g）' : '') +
      '。如果已经减到蛋白不降了还是不动，先加日常活动量（每天多走 2000 步），别一路砍碳水。'
  }
  if (borderline) {
    message += ' ⓘ 注：这次的数据刚好压在目标区间的边界上（可信区间 ' + loKg + ' ~ ' + hiKg +
      'kg/周），所以这次改动是「朝对的方向推一把」，不是绝对结论——下次 7 天后早点回来看。'
  }
  if (capped) {
    message += ' ⚠️ 自动调整已经到上限（±' + maxKcal + ' kcal/天 ≈ ' + MACRO.maxAutoAdj +
      'g/kg 碳水），接下来请从训练量/日常活动下手，或者找我看一次真实饮食记录——继续砍碳水不是办法。'
  }

  const from = today || window[window.length - 1].date
  return Object.assign(base, {
    ready: true, applied: verdict !== 'on_track' && step !== 0, trend, verdict, headline, message, borderline,
    action: step === 0 ? null : {
      step,                                   // 人类口径：±0.25 g/kg 碳水
      carbGrams,                              // 折算成克数（约多少 g 碳水）
      kcalStep,                               // 实际杠杆：±多少 kcal/天
      kcalBefore: before, kcalAfter: after,   // 调整前/后的每日热量偏移
      capped, maxKcal,
      gramsPerDay: carbGrams
    },
    progress: { havePoints: window.length, needPoints: MACRO.minPoints, haveDays: days, needDays: MACRO.minDays },
    nextReviewAt: shiftDate(from, MACRO.cooldownDays)
  })
}

// ───────────────────────── 应用 / 合并 ─────────────────────────

/** 把一次 review 的结果写进 dietState（返回新的 dietState，不修改入参） */
function apply(reviewResult, dietState) {
  const ds = Object.assign({}, dietState || {})
  const r = reviewResult || {}
  if (!r.ready || !r.action) return ds
  const m = Object.assign({ kcalAdj: 0, carbAdj: 0, proteinAdj: 0, history: [] }, ds.macro || {})
  const before = round(m.kcalAdj || 0, 0)
  m.kcalAdj = round(r.action.kcalAfter, 0)          // 实际杠杆：热量
  m.carbAdj = round((r.action.carbGrams || 0) / 100, 2)  // 仅用于展示"相当于多少 g/kg"（不参与计算）
  m.lastAt = (r.window && r.window.to) || ''
  m.history = (m.history || []).concat([{
    date: m.lastAt,
    from: before, to: m.kcalAdj, step: r.action.kcalStep,
    carbGrams: r.action.carbGrams,
    reason: r.verdict,
    perWeek: r.trend ? r.trend.perWeek : 0,
    perWeekPct: r.trend ? r.trend.perWeekPct : 0
  }]).slice(-24)
  ds.macro = m
  return ds
}

/**
 * 合并各路偏移，喂给 calc.energyPlan / calc.dietMacros：
 *   饥饿反馈（日级、感性，走 carbAdj/proteinAdj） + 宏观调控（周级、客观，走 kcalAdj）
 * 两路互不干扰：宏观只动热量，所以蛋白不会因为"该多吃"反而被跷跷板压下去。
 */
function combinedAdj(dietState) {
  const ds = dietState || {}
  const m = ds.macro || {}
  return {
    carbAdj: round(ds.carbAdj || 0, 3),
    proteinAdj: round(ds.proteinAdj || 0, 3),
    kcalAdj: round(m.kcalAdj || 0, 0)
  }
}

/** 拆开展示用：让 UI 能说清"这个数字是谁贡献的" */
function breakdown(dietState) {
  const ds = dietState || {}
  const m = ds.macro || {}
  return {
    hunger: { carb: round(ds.carbAdj || 0, 2), protein: round(ds.proteinAdj || 0, 2) },
    macro: { carb: round(m.carbAdj || 0, 2), kcal: round(m.kcalAdj || 0, 0) },
    total: combinedAdj(ds),
    lastMacroAt: m.lastAt || '',
    macroHistory: (m.history || []).slice(-6).reverse()
  }
}

/** 给 UI 画迷你折线用：把体重点归一化到 0..1（对应窗口高度） */
function sparkline(points, height) {
  const pts = points || []
  if (pts.length < 2) return []
  const h = height || 1
  const ws = pts.map(p => p.w)
  const lo = Math.min.apply(null, ws), hi = Math.max.apply(null, ws)
  const span = hi - lo || 1
  const d0 = pts[0].date, dN = pts[pts.length - 1].date
  const dSpan = Math.max(1, dayDiff(d0, dN))
  return pts.map(p => ({
    x: round(dayDiff(d0, p.date) / dSpan, 4),
    // y: 0 = 最低点（画布底部），1 = 最高点
    y: round((p.w - lo) / span, 4),
    w: p.w, date: p.date
  }))
}

module.exports = {
  MACRO, GOAL_TARGET, DAY,
  weightPoints, contiguousTail, fitLine, sd,
  review, apply, combinedAdj, breakdown, sparkline,
  dayDiff: dayDiff, shiftDate: shiftDate, round: round, clamp: clamp
}
