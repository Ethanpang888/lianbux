#!/usr/bin/env node
/* test-reward.js —— 奖励结算回归（2026-10-18 线上复查驱动的两个实锤 bug）
 * 场景：
 *   ① 连续阶梯奖励不被双倍发（旧 bug：gained 与 totalGained 各加一次 special）
 *   ② 网站端重复保存同一份训练：训练次数/容量/周任务不双计（旧 bug：isFirstToday 写死 true）
 *   ③ 先记睡眠后提交训练：训练计数照计（isFirstToday=false 的窗口）
 *   ④ 先训练后补睡眠：睡眠天数照计（增量语义）
 *   ⑤ 周任务/徽章/streak 一次性奖励不因重复提交重发
 */
const path = require('path')
const g = require(path.join(__dirname, '..', '..', '健身小程序', 'utils', 'gamify.js'))

let pass = 0, fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ❌ ' + name) } }

const profile = { weight: 80, goal: '增肌减脂同步' }
const targets = { kcal: 2100, protein: 140 }
const mkTrain = () => ({
  date: '2026-10-18', trained: true,
  exercises: [{ name: '杠铃卧推', log: [{ weight: 60, reps: 10, done: true }, { weight: 60, reps: 10, done: true }] }],
  waterMl: 2400, sleepHours: 7.5, weight: 80.5
})
const ctx = (over) => Object.assign({
  user: {}, checkin: mkTrain(), profile, targets,
  today: '2026-10-18', weekKey: '2026-W42', isFirstToday: true, hour: 20
}, over)

// ── ① 连续阶梯不双倍 ──
{
  // 构造：streak.cur=2、lastDate=昨天，今天首次提交 → 连续 3 天（tier 3 发 20）
  const user = { gamify: { exp: 0, streak: { cur: 2, best: 2, lastDate: '2026-10-17', tierGiven: [] } } }
  const r = g.calcCheckinExp(ctx({ user }))
  const streakItem = (r.breakdown || []).find(b => b.k === 'streak_3')
  t('连续3天奖励入账', !!streakItem && streakItem.exp === 20)
  // pools = 训练100 + 容量1吨10 + 生活(睡15+水10+体重5)=30；徽章（首训等）单独一笔。
  // 断言本质：总额 = breakdown 明细之和 + 徽章之和，streak 不多不少（无双倍）
  const bSum = (r.breakdown || []).reduce((a, b) => a + b.exp, 0)
  const badgeSum = (r.badges || []).reduce((a, b) => a + b.exp, 0)
  t('总额 = 明细 + 徽章（streak 不双倍）', r.gained === bSum + badgeSum)
  t('streak_3 明细只出现一次', (r.breakdown || []).filter(b => b.k === 'streak_3').length === 1)
  t('streak 推进到 3', r.streak.cur === 3)
}

// ── ② 重复保存不双计（网站端旧 bug：isFirstToday 写死 true）──
{
  const user = { gamify: { exp: 0, streak: { cur: 1, best: 1, lastDate: '2026-10-18', tierGiven: [] } } }
  const first = g.calcCheckinExp(ctx({ user }))
  const user2 = { gamify: { exp: first.exp, streak: first.streak, caps: first.caps, counters: first.counters, weekTask: first.weekTask, badges: first.badges } }
  const ck = mkTrain()
  const again = g.calcCheckinExp(ctx({
    user: user2, checkin: ck, prevCheckin: ck,
    isFirstToday: false, firstTrainOfDay: false
  }))
  t('重复保存 EXP 增量为 0', again.gained === 0)
  t('重复保存 sessions 不双计', again.counters.sessions === first.counters.sessions)
  t('重复保存 volume 不双计', again.counters.volume === first.counters.volume)
  t('重复保存 sleepDays 不双计', again.counters.sleepDays === first.counters.sleepDays)
  t('重复保存 weekTask.sessions 不双计', again.weekTask.sessions === first.weekTask.sessions)
}

// ── ③ 先记睡眠（trained=false）后提交训练 ──
{
  const lifeOnly = { date: '2026-10-18', trained: false, exercises: [], sleepHours: 7.5, waterMl: 2400, weight: 80.5 }
  const user = { gamify: { exp: 0 } }
  const r1 = g.calcCheckinExp(ctx({ user, checkin: lifeOnly }))
  t('生活记录本身计 sleepDays', r1.counters.sleepDays === 1)
  const user2 = { gamify: { exp: r1.exp, streak: r1.streak, caps: r1.caps, counters: r1.counters, weekTask: r1.weekTask, badges: r1.badges } }
  const r2 = g.calcCheckinExp(ctx({
    user: user2, checkin: mkTrain(), prevCheckin: lifeOnly,
    isFirstToday: false, firstTrainOfDay: true
  }))
  t('后提交训练：sessions 计上', r2.counters.sessions === 1)
  t('后提交训练：sleepDays 不重计', r2.counters.sleepDays === 1)
  t('后提交训练：EXP 照拿训练分', r2.gained >= 110)
}

// ── ④ 先训练后补睡眠（旧代码此窗口漏计 sleepDays）──
{
  const noSleep = mkTrain(); noSleep.sleepHours = 0; noSleep.waterMl = 0; noSleep.weight = 0
  const user = { gamify: { exp: 0 } }
  const r1 = g.calcCheckinExp(ctx({ user, checkin: noSleep }))
  t('先训练：sleepDays=0', r1.counters.sleepDays === 0)
  const user2 = { gamify: { exp: r1.exp, streak: r1.streak, caps: r1.caps, counters: r1.counters, weekTask: r1.weekTask, badges: r1.badges } }
  const r2 = g.calcCheckinExp(ctx({
    user: user2, checkin: mkTrain(), prevCheckin: noSleep,
    isFirstToday: false, firstTrainOfDay: false
  }))
  t('补睡眠后：sleepDays 补上（增量语义）', r2.counters.sleepDays === 1)
  t('补睡眠后：sessions 不重计', r2.counters.sessions === 1)
  t('补睡眠后：EXP 补差额（睡15+水10+体重5）', r2.gained === 30)
}

// ── ⑤ 周任务一次性奖励不重发 ──
{
  // weekTask.sessions 已 3，本次训练后到 4 → 发 80；再提交一次不再发
  const user = { gamify: { exp: 0, weekTask: { week: '2026-W42', sessions: 3, sleepDays: 0, weights: 0, proteinDays: 0, paid: [] } } }
  const r1 = g.calcCheckinExp(ctx({ user }))
  t('周任务达成发 80', (r1.breakdown || []).some(b => b.k === 'week_sessions' && b.exp === 80))
  const user2 = { gamify: { exp: r1.exp, streak: r1.streak, caps: r1.caps, counters: r1.counters, weekTask: r1.weekTask, badges: r1.badges } }
  const ck = mkTrain()
  const r2 = g.calcCheckinExp(ctx({ user: user2, checkin: ck, prevCheckin: ck, isFirstToday: false, firstTrainOfDay: false }))
  t('重复提交周任务不重发', !(r2.breakdown || []).some(b => b.k === 'week_sessions'))
  t('重复提交 gained=0', r2.gained === 0)
}

console.log('════════════════════════════════════════════════')
console.log('  reward 结算回归：' + pass + ' 通过 / ' + fail + ' 失败')
console.log('════════════════════════════════════════════════')
process.exit(fail ? 1 : 0)
