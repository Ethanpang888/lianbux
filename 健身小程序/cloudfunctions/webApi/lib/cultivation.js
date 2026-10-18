// utils/cultivation.js —— 修炼体系（小程序端只读重放）
//
// 口径与网站 shared/gamify.js 完全一致（同一条 EXP_RULE 曲线）：
//   逐日重放 checkins → 每天独立算当日 EXP（session/容量/饮食/睡眠/饮水/体重），
//   连续阶梯按 trained 序列重建（一次性奖励只发一次）。
// 不写库：每次从云端 checkins 现算，天然与打卡数据同步，不存在刷级入口
// （小程序打卡只能走 today 页写库，改内存改不了云端数据）。

const gamify = require('./gamify.js')
const calc = require('./calc.js')

// 单日 EXP（与 gamify.calcCheckinExp 同口径的只读版：不依赖 user.gamify 状态，
// 历史重放时每天只有一条打卡，逐日独立计算 = 云端逐日结算的结果）
function dayExp(c, profile, targets) {
  let exp = 0
  const breakdown = []
  const trained = !!c.trained && (c.exercises || []).length > 0 && gamify.doneRatio(c.exercises) >= 0.8
  if (trained) { exp += gamify.EXP_RULE.session; breakdown.push({ k: 'session', name: '完成训练', exp: gamify.EXP_RULE.session }) }
  const volume = gamify.volumeOf(c.exercises)
  if (volume > 0) {
    const v = Math.min(gamify.EXP_RULE.volumeCap, Math.floor(volume / 1000) * gamify.EXP_RULE.volumePerTon)
    if (v > 0) { exp += v; breakdown.push({ k: 'volume', name: '训练容量 ' + Math.round(volume / 1000) + ' 吨', exp: v }) }
  }
  const dc = gamify.dietCheck(c, profile, targets)
  if (dc.ok) { exp += gamify.EXP_RULE.dietFull; breakdown.push({ k: 'diet', name: '蛋白+热量达标', exp: gamify.EXP_RULE.dietFull }) }
  else if (dc.proteinOnly) { exp += gamify.EXP_RULE.dietProteinOnly; breakdown.push({ k: 'diet_p', name: '蛋白达标', exp: gamify.EXP_RULE.dietProteinOnly }) }
  if (Number(c.sleepHours) >= 7) { exp += gamify.EXP_RULE.sleep; breakdown.push({ k: 'sleep', name: '睡够 7 小时', exp: gamify.EXP_RULE.sleep }) }
  const waterTarget = Math.round((Number((profile || {}).weight) || 60) * 30)
  if (Number(c.waterMl) >= waterTarget) { exp += gamify.EXP_RULE.water; breakdown.push({ k: 'water', name: '喝水达标', exp: gamify.EXP_RULE.water }) }
  if (Number(c.weight) > 0) { exp += gamify.EXP_RULE.weight; breakdown.push({ k: 'weight', name: '记录体重', exp: gamify.EXP_RULE.weight }) }
  return { exp, trained, breakdown }
}

/**
 * 重放全部打卡 → 修炼摘要
 * @param {Array} checkins 云端打卡（date 升序），字段与 today 页 save() 写的一致
 * @param {Object} profile 用户档案（算饮食目标 / 饮水目标）
 */
function summarize(checkins, profile) {
  const cs = (checkins || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
  let targets = null
  try { targets = calc.energyPlan(profile || {}) } catch (e) { targets = null }
  const t = targets ? { kcal: targets.kcal, protein: targets.protein } : null

  let exp = 0, trainedTotal = 0
  const byDay = []
  // 连续：trained 序列重建（口径同 gamify：trained 才算，断一天归 1）
  let streakCur = 0, streakBest = 0, lastDate = ''
  const tiersGiven = []
  const today = new Date()
  const pad = x => String(x).padStart(2, '0')
  const todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate())

  cs.forEach(c => {
    const r = dayExp(c, profile, t)
    exp += r.exp
    if (r.trained) {
      trainedTotal++
      const d = lastDate ? gamify.dayDiff(lastDate, c.date) : 0
      if (!lastDate) streakCur = 1
      else if (d === 1) streakCur++
      else if (d !== 0) streakCur = 1
      // 中断后追补的旧记录不推进「当前连续」，但 best 保留历史峰值
      if (streakCur > streakBest) streakBest = streakCur
      lastDate = c.date
      gamify.STREAK_TIERS.forEach(x => {
        if (streakCur >= x.days && tiersGiven.indexOf(x.days) < 0) { tiersGiven.push(x.days); exp += x.exp }
      })
    }
    byDay.push({ date: c.date, exp: r.exp, trained: r.trained, breakdown: r.breakdown })
  })

  // 当前连续若最后一条不是今天/昨天，归零显示（口径诚实）
  let curShown = streakCur
  if (lastDate) {
    const gap = gamify.dayDiff(lastDate, todayStr)
    if (gap >= 2) curShown = 0
  } else curShown = 0

  const lv = gamify.levelOf(exp)
  const realm = gamify.realmOf(lv.level)
  const todayRow = byDay.filter(x => x.date === todayStr)[0] || {}
  return {
    exp: Math.round(exp),
    level: lv.level, title: lv.title, realm: realm.name, realmNote: realm.note,
    pct: lv.pct, cur: lv.cur, next: lv.next, toNext: lv.toNext,
    streak: { cur: curShown, best: Math.max(streakBest, curShown) },
    trainedTotal,
    byDay,
    todayExp: todayRow.exp || 0,
    todayTrained: !!todayRow.trained
  }
}

/* ── 徽章重放（2026-10-17，对齐网站徽章墙）：从 checkins 现算 counters，
   与云端结算同口径；纯只读不写库。hidden 徽章按等级决定可见。 ── */
function badgesOf(checkins, profile, targets, level, streakBest) {
  const counters = {
    sessions: 0, proteinDays: 0, kcalDays: 0, sleepDays: 0, waterDays: 0,
    weightLogs: 0, volume: 0, maxLift: 0, perfectWeeks: 0, challengeWins: 0,
    earlyCount: 0, nightCount: 0
  }
  const w = (Number(profile && profile.weight) || 60)
  const waterTarget = Math.round(w * 30)
  ;(checkins || []).forEach(c => {
    if (c.trained) counters.sessions++
    if (Number(c.sleepHours) >= 7) counters.sleepDays++
    if (Number(c.weight) > 0) counters.weightLogs++
    if (Number(c.waterMl) > 0 && Number(c.waterMl) >= waterTarget) counters.waterDays++
    ;(c.exercises || []).forEach(e => (e.log || []).forEach(s => {
      if (s.done && Number(s.weight) > 0) {
        counters.volume += (Number(s.weight) || 0) * (Number(s.reps) || 0)
        if (Number(s.weight) > counters.maxLift) counters.maxLift = Number(s.weight)
      }
    }))
    try {
      const dc = gamify.dietCheck(c, profile, targets)
      if (dc.ok) counters.kcalDays++
      if (dc.proteinOnly || dc.ok) counters.proteinDays++
    } catch (e) { /* 无 dietLog 就跳过 */ }
  })
  const owned = gamify.BADGES
    .filter(b => { try { return b.test({ counters, streak: { best: streakBest || 0 } }) } catch (e) { return false } })
    .map(b => b.k)
  return gamify.visibleBadges(gamify.BADGES, owned, level || 1)
}

module.exports = { summarize, dayExp, badgesOf }
