/**
 * shared/gamify.js —— 游戏化唯一真相源（纯函数，零依赖）
 *
 * 同一份代码同时被：
 *   · 浏览器（dist/engine.js → ENGINE.gamify）即时预览
 *   · 云函数（cloudfunctions/webApi/lib/gamify.js）权威结算
 * 改任何规则只需改这里 + 跑 node build/sync-engine.js --write
 *
 * 设计原则：
 *   1. 服务端权威：客户端算的 EXP 只用于即时反馈，最终以服务端重算为准
 *   2. 分池封顶：训练 220 / 生活 70 / 识别 50 = 单日硬上限 340，防刷
 *   3. 幂等补差：同一天重复提交只补差额（caps 记账）
 *   4. 不排体重体型：等级与榜单只反映"坚持与容量"，不诱导节食
 */

// ───────────────────────── 常量表 ─────────────────────────

const DAILY_CAP = { train: 220, life: 70, push: 50 }
const DAILY_CAP_TOTAL = 340

// EXP 基础值
const EXP_RULE = {
  session: 100,          // 完成一次训练
  volumePerTon: 10,      // 每 1 吨容量
  volumeCap: 120,        // 容量单日上限
  dietFull: 30,          // 蛋白 + 热量都达标
  dietProteinOnly: 15,   // 只有蛋白达标
  sleep: 15,             // 睡够 7 小时
  water: 10,             // 喝水达标
  weight: 5,             // 记录体重
  learn: 10,             // 学一张卡
  pushupPer10: 5,        // 每 10 个俯卧撑
  pushupCap: 50,
  weekTask: 80           // 每个周任务
}

// 连续打卡阶梯（一次性，只发一次；记在 streak.tierGiven）
const STREAK_TIERS = [
  { days: 3, exp: 20 }, { days: 7, exp: 50 }, { days: 14, exp: 80 },
  { days: 30, exp: 150 }, { days: 60, exp: 250 }, { days: 100, exp: 500 }
]

// 周任务定义
const WEEK_TASKS = [
  { key: 'sessions', name: '本周练满 4 次', target: 4, exp: EXP_RULE.weekTask },
  { key: 'sleepDays', name: '睡够 6 天（≥7h）', target: 6, exp: EXP_RULE.weekTask },
  { key: 'weights', name: '记录体重 3 次', target: 3, exp: EXP_RULE.weekTask },
  { key: 'proteinDays', name: '蛋白达标 5 天', target: 5, exp: EXP_RULE.weekTask }
]

// 等级曲线：need(L) = round(40 × L^1.9)，99 级满级约 24.7 万 EXP（约 3.2 年全勤）
const MAX_LEVEL = 99
const TITLE_TIERS = [
  { from: 1, to: 9, title: '新手村' },
  { from: 10, to: 19, title: '起步' },
  { from: 20, to: 29, title: '入门' },
  { from: 30, to: 39, title: '上道' },
  { from: 40, to: 49, title: '规律' },
  { from: 50, to: 59, title: '进阶' },
  { from: 60, to: 69, title: '硬核' },
  { from: 70, to: 79, title: '铁人' },
  { from: 80, to: 89, title: '练家子' },
  { from: 90, to: 98, title: '宗师' },
  { from: 99, to: 99, title: '练不虚' }
]

// 境界 = 等级的阶段分组（修炼世界观只是视觉与文案层；99 级经验曲线不动，数据库字段不动）。
// 与 Lv 同时显示，每段给一句大白话解释 —— 可解释、不强行套用小说人物。
const REALMS = [
  { from: 1, to: 9, name: '炼体', note: '把动作练对，把习惯立起来' },
  { from: 10, to: 29, name: '蓄力', note: '规律训练成为日常' },
  { from: 30, to: 59, name: '精进', note: '重量与容量稳步上涨' },
  { from: 60, to: 84, name: '破境', note: '冲击更高强度与更重的主项' },
  { from: 85, to: 99, name: '宗师', note: '练不虚的最后一段' }
]

/** 当前等级所在境界 */
function realmOf(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1))
  return REALMS.find(r => lv >= r.from && lv <= r.to) || REALMS[0]
}

// 每 10 级解锁
const UNLOCKS = {
  2: '徽章墙', 10: '自定义昵称', 20: '排行榜可见', 30: '周报卡',
  40: '可发起挑战', 50: '分享图金边', 60: '徽章展示位 ×6',
  70: '称号后缀自定义', 80: '隐藏徽章可见', 90: '榜单置顶 1 天/月', 99: '满级金标'
}

// ───────────────────────── 玩家编号 ─────────────────────────
// 注册时由云端「原子分配」生成，全局唯一、不可更改；
// 作用＝身份凭证（像别人的邮箱/学号），换设备、换微信都能凭它找回账号。
const PLAYER_NO = {
  foundingLimit: 100,   // 前 100 位 = 创始玩家，编号与身份永久保留
  earlyLimit: 1000,     // 前 1000 位 = 早期玩家
  pad: 4                // 显示位数 → #0001
}

const _PLAYER_TIERS = [
  { key: 'founding', name: '创始玩家', gold: true,
    desc: '前 ' + PLAYER_NO.foundingLimit + ' 位 · 编号与身份永久保留' },
  { key: 'early', name: '早期玩家', gold: false,
    desc: '第 ' + (PLAYER_NO.foundingLimit + 1) + '–' + PLAYER_NO.earlyLimit + ' 位玩家' },
  { key: 'player', name: '副本玩家', gold: false, desc: '编号可用于找回账号' }
]

function playerTier(no) {
  const n = Number(no) || 0
  if (n <= 0) return { key: 'none', name: '待分配', gold: false, desc: '完成注册后自动分配编号' }
  if (n <= PLAYER_NO.foundingLimit) return Object.assign({}, _PLAYER_TIERS[0])
  if (n <= PLAYER_NO.earlyLimit) return Object.assign({}, _PLAYER_TIERS[1])
  return Object.assign({}, _PLAYER_TIERS[2])
}

/** #0001 形式；未分配时给占位符（不显示 undefined） */
function playerNoStr(no) {
  const n = Number(no) || 0
  if (n <= 0) return '#' + '-'.repeat(PLAYER_NO.pad)
  return '#' + String(n).padStart(PLAYER_NO.pad, '0')
}

/** 校验用户输入的编号（找回账号时用）：#0007 / 0007 / 7 都接受 */
function parsePlayerNo(input) {
  const m = String(input == null ? '' : input).match(/\d{1,9}/)
  return m ? Number(m[0]) : 0
}

/** 当前等级在 11 段位阶梯里的位置（首页段位条用） */
function tierIndexOf(level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1))
  const i = TITLE_TIERS.findIndex(t => lv >= t.from && lv <= t.to)
  return i < 0 ? 0 : i
}

// 徽章（21 个，hidden 的未解锁时显示 ???）
const BADGES = [
  { k: 'first_session', name: '首练', tier: '铜', exp: 50, cond: '完成第 1 次训练', test: c => c.counters.sessions >= 1 },
  { k: 'sessions_10', name: '破冰', tier: '铜', exp: 100, cond: '累计训练 10 次', test: c => c.counters.sessions >= 10 },
  { k: 'sessions_50', name: '半百', tier: '银', exp: 200, cond: '累计训练 50 次', test: c => c.counters.sessions >= 50 },
  { k: 'sessions_100', name: '百炼', tier: '金', exp: 500, cond: '累计训练 100 次', test: c => c.counters.sessions >= 100 },
  { k: 'streak_3', name: '火种', tier: '铜', exp: 50, cond: '连续打卡 3 天', test: c => c.streak.best >= 3 },
  { k: 'streak_7', name: '周更', tier: '铜', exp: 100, cond: '连续打卡 7 天', test: c => c.streak.best >= 7 },
  { k: 'streak_14', name: '双周不断', tier: '银', exp: 150, cond: '连续打卡 14 天', test: c => c.streak.best >= 14 },
  { k: 'streak_30', name: '月志', tier: '金', exp: 300, cond: '连续打卡 30 天', test: c => c.streak.best >= 30 },
  { k: 'streak_100', name: '百日', tier: '金', exp: 500, cond: '连续打卡 100 天', test: c => c.streak.best >= 100 },
  { k: 'protein_7', name: '蛋白控', tier: '铜', exp: 100, cond: '蛋白达标 7 天', test: c => c.counters.proteinDays >= 7 },
  { k: 'protein_30', name: '蛋白机械', tier: '金', exp: 300, cond: '蛋白达标 30 天', test: c => c.counters.proteinDays >= 30 },
  { k: 'kcal_14', name: '热量狙击', tier: '银', exp: 200, cond: '热量达标 14 天', test: c => c.counters.kcalDays >= 14 },
  { k: 'sleep_7', name: '睡神', tier: '铜', exp: 100, cond: '睡够 7 天', test: c => c.counters.sleepDays >= 7 },
  { k: 'water_30', name: '水怪', tier: '铜', exp: 100, cond: '喝水达标 30 天', test: c => c.counters.waterDays >= 30 },
  { k: 'weight_20', name: '记录癖', tier: '银', exp: 150, cond: '记录体重 20 次', test: c => c.counters.weightLogs >= 20 },
  { k: 'volume_100t', name: '容量王', tier: '金', exp: 300, cond: '累计容量 100 吨', test: c => c.counters.volume >= 100000 },
  { k: 'lift_100', name: '破百', tier: '金', exp: 300, cond: '单组 ≥100kg', test: c => c.counters.maxLift >= 100 },
  { k: 'perfect_week', name: '全勤周', tier: '金', exp: 300, hidden: true, cond: '一周计划日全完成且饮食达标 ≥5 天', test: c => c.counters.perfectWeeks >= 1 },
  { k: 'early_bird', name: '早起鸟', tier: '铜', exp: 100, hidden: true, cond: '早上 5-6 点打卡累计 5 次', test: c => (c.counters.earlyCount || 0) >= 5 },
  { k: 'night_owl', name: '夜练者', tier: '铜', exp: 100, hidden: true, cond: '晚上 22-23 点打卡累计 5 次', test: c => (c.counters.nightCount || 0) >= 5 },
  { k: 'challenge_win', name: '挑战者', tier: '银', exp: 150, cond: '赢下 1 场挑战', test: c => c.counters.challengeWins >= 1 }
]

// ───────────────────────── 工具函数 ─────────────────────────

const round = (n, d = 0) => { const p = Math.pow(10, d); return Math.round(n * p) / p }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)

/** 累计 EXP 门槛表（缓存，避免重复计算） */
let NEEDS = null
function needsTable() {
  if (NEEDS) return NEEDS
  NEEDS = [0]
  for (let L = 1; L <= MAX_LEVEL; L++) NEEDS.push(Math.round(40 * Math.pow(L, 1.9)))
  return NEEDS
}
function needOf(level) { const t = needsTable(); return t[clamp(level, 0, MAX_LEVEL)] }
function titleOf(level) {
  const t = TITLE_TIERS.find(x => level >= x.from && level <= x.to)
  return t ? t.title : '新手村'
}

/** EXP → 等级信息（二分查表） */
function levelOf(exp) {
  exp = Math.max(0, Number(exp) || 0)
  const t = needsTable()
  let lo = 1, hi = MAX_LEVEL
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (exp >= t[mid]) lo = mid; else hi = mid - 1
  }
  const level = lo
  // ⚠️ 曲线表 t[L] 是「达到 L 级所需的累计 EXP」，t[1]=40 是公式产物。
  // 新用户 0 EXP 就应该是 1 级，所以 1 级的区间下界强制为 0，
  // 否则 exp-cur 会变成负数（曾导致进度条宽度为负 → 渲染成满格）。
  const cur = level <= 1 ? 0 : t[level]
  const next = level >= MAX_LEVEL ? cur : t[level + 1]
  const span = Math.max(1, next - cur)
  const pct = level >= MAX_LEVEL ? 100 : clamp(Math.round((exp - cur) / span * 100), 0, 100)
  return {
    level, title: titleOf(level), exp: round(exp, 0), cur, next, span, pct,
    toNext: level >= MAX_LEVEL ? 0 : Math.max(0, next - exp),
    unlock: UNLOCKS[level + 1] || UNLOCKS[level] || ''
  }
}

// ───────────────────────── 容量 / 达标判定 ─────────────────────────

/** 训练容量 Σ(重量×次数)，仅计 done=true 的组 */
function volumeOf(exercises) {
  let v = 0
  ;(exercises || []).forEach(e => (e.log || []).forEach(s => {
    if (s && s.done) v += (Number(s.weight) || 0) * (Number(s.reps) || 0)
  }))
  return Math.round(v)
}

/** 完成率：done 组数 / 全部组数 */
function doneRatio(exercises) {
  let all = 0, done = 0
  ;(exercises || []).forEach(e => (e.log || []).forEach(s => { all++; if (s && s.done) done++ }))
  return all ? done / all : 0
}

/** 饮食达标：返回 {ok, proteinOnly, kcal, protein, targetKcal, targetProtein} */
function dietCheck(checkin, profile, targets) {
  const t = targets || {}
  const targetKcal = Number(t.kcal) || 0
  const targetProtein = Number(t.protein) || 0
  let kcal = 0, protein = 0
  ;((checkin || {}).dietLog || []).forEach(f => { kcal += Number(f.kcal) || 0; protein += Number(f.protein) || 0 })
  kcal = Math.round(kcal); protein = round(protein, 1)
  const proteinHit = targetProtein > 0 && protein >= targetProtein * 0.9
  const kcalHit = targetKcal > 0 && kcal >= targetKcal * 0.9 && kcal <= targetKcal * 1.1
  return {
    ok: kcalHit && proteinHit, proteinOnly: proteinHit && !kcalHit,
    kcal, protein, targetKcal, targetProtein
  }
}

// ───────────────────────── 单日结算（核心） ─────────────────────────

/**
 * 计算一次打卡应得 EXP
 * @param {Object} ctx
 *   ctx.user       webusers 文档（读 gamify.caps / streak / counters / weekTask）
 *   ctx.checkin    提交的打卡数据（服务端已校验）
 *   ctx.targets    { kcal, protein } 当日目标（来自 calc.energyPlan）
 *   ctx.isFirstToday 是否是今天第一次提交（决定 streak 是否推进）
 * @returns {Object} { gained, pools, breakdown, streak, badges, counters, weekTask }
 */
function calcCheckinExp(ctx) {
  const user = ctx.user || {}
  const g = user.gamify || {}
  // caps 语义：当日「原始值高水位」（不是已发值）——
  // 已发值 = min(高水位, 池上限)，因此重复提交同一份数据时差额为 0，天然幂等
  let caps = Object.assign({ date: ctx.today, trainRaw: 0, lifeRaw: 0, pushRaw: 0 }, g.caps || {})
  if (caps.date !== ctx.today) caps = { date: ctx.today, trainRaw: 0, lifeRaw: 0, pushRaw: 0 }

  const checkin = ctx.checkin || {}
  const breakdown = []
  let train = 0, life = 0, push = 0, special = 0

  // ① 完成训练
  const trained = !!checkin.trained && (checkin.exercises || []).length > 0 && doneRatio(checkin.exercises) >= 0.8
  if (trained) { train += EXP_RULE.session; breakdown.push({ k: 'session', name: '完成训练', exp: EXP_RULE.session }) }

  // ② 训练容量（每吨 10 分，单池上限 120）
  const volume = volumeOf(checkin.exercises)
  if (volume > 0) {
    const vExp = Math.min(EXP_RULE.volumeCap, Math.floor(volume / 1000) * EXP_RULE.volumePerTon)
    if (vExp > 0) { train += vExp; breakdown.push({ k: 'volume', name: '训练容量 ' + Math.round(volume / 1000) + ' 吨', exp: vExp }) }
  }

  // ③ 连续打卡阶梯（一次性）
  let streak = Object.assign({ cur: 0, best: 0, lastDate: '', tierGiven: [] }, g.streak || {})
  if (ctx.isFirstToday && checkin.trained) {
    const last = streak.lastDate
    if (!last) streak.cur = 1
    else {
      const d = dayDiff(last, ctx.today)
      streak.cur = d === 1 ? streak.cur + 1 : (d === 0 ? streak.cur : 1)
    }
    streak.lastDate = ctx.today
    if (streak.cur > streak.best) streak.best = streak.cur
    STREAK_TIERS.forEach(t => {
      if (streak.cur >= t.days && streak.tierGiven.indexOf(t.days) < 0) {
        streak.tierGiven.push(t.days)
        special += t.exp
        breakdown.push({ k: 'streak_' + t.days, name: '连续 ' + t.days + ' 天', exp: t.exp })
      }
    })
  }

  // ④ 生活项
  const dc = dietCheck(checkin, ctx.profile, ctx.targets)
  if (dc.ok) { life += EXP_RULE.dietFull; breakdown.push({ k: 'diet', name: '蛋白 + 热量达标', exp: EXP_RULE.dietFull }) }
  else if (dc.proteinOnly) { life += EXP_RULE.dietProteinOnly; breakdown.push({ k: 'diet_p', name: '蛋白达标', exp: EXP_RULE.dietProteinOnly }) }
  if (Number(checkin.sleepHours) >= 7) { life += EXP_RULE.sleep; breakdown.push({ k: 'sleep', name: '睡够 7 小时', exp: EXP_RULE.sleep }) }
  const waterTarget = Math.round((Number((ctx.profile || {}).weight) || 60) * 30)
  if (Number(checkin.waterMl) >= waterTarget) { life += EXP_RULE.water; breakdown.push({ k: 'water', name: '喝水达标', exp: EXP_RULE.water }) }
  if (Number(checkin.weight) > 0) { life += EXP_RULE.weight; breakdown.push({ k: 'weight', name: '记录体重', exp: EXP_RULE.weight }) }
  if (checkin.learned) { life += EXP_RULE.learn; breakdown.push({ k: 'learn', name: '学一张卡', exp: EXP_RULE.learn }) }

  // ⑤ 俯卧撑
  const pushCount = Number((checkin.pushup || {}).count) || 0
  if (pushCount >= 10) {
    push = Math.min(EXP_RULE.pushupCap, Math.floor(pushCount / 10) * EXP_RULE.pushupPer10)
    breakdown.push({ k: 'pushup', name: '俯卧撑 ' + pushCount + ' 个', exp: push })
  }

  // ⑥ 分池结算：已发 = min(当日原始高水位, 池上限)，本次只发增量
  const grantedTrain = Math.max(0, Math.min(train, DAILY_CAP.train) - Math.min(caps.trainRaw, DAILY_CAP.train))
  const grantedLife = Math.max(0, Math.min(life, DAILY_CAP.life) - Math.min(caps.lifeRaw, DAILY_CAP.life))
  const grantedPush = Math.max(0, Math.min(push, DAILY_CAP.push) - Math.min(caps.pushRaw, DAILY_CAP.push))
  caps.trainRaw = Math.max(caps.trainRaw, train)
  caps.lifeRaw = Math.max(caps.lifeRaw, life)
  caps.pushRaw = Math.max(caps.pushRaw, push)
  // ⚠️ 2026-10-18 修双倍发放：special（连续阶梯/周任务/徽章）只在最后统一加一次。
  // 旧代码这里把 special 加进 gained、下面 totalGained 又加一次 → 连续阶梯奖励发两遍。
  const gained = grantedTrain + grantedLife + grantedPush

  // 当日首次「有效训练」提交才计训练类累计（重复保存同一份训练不双计）；
  // 旧调用没传就退回 isFirstToday（兼容测试与历史调用方）
  const firstTrainOfDay = ctx.firstTrainOfDay !== undefined ? !!ctx.firstTrainOfDay : !!ctx.isFirstToday
  // 生活项增量语义：上一版没达标、这一版达标 → +1（先训练后补睡眠也计，重复提交不双计）
  const prev = ctx.prevCheckin || null
  const lifeInc = (prevOk, nowOk) => prev ? (nowOk && !prevOk) : (!!ctx.isFirstToday && nowOk)
  const prevNum = k => Number((prev || {})[k])

  // ⑦ 累计计数器（2026-10-18 修：训练项按 firstTrainOfDay，生活项按达标增量 —— 修 isFirstToday 写死导致重复保存双计/同日补记漏计）
  const counters = Object.assign({
    sessions: 0, volume: 0, proteinDays: 0, kcalDays: 0, sleepDays: 0, waterDays: 0,
    weightLogs: 0, maxLift: 0, perfectWeeks: 0, challengeWins: 0, earlyCount: 0, nightCount: 0
  }, g.counters || {})
  if (firstTrainOfDay) {
    if (trained) counters.sessions += 1
    counters.volume += volume
    let maxLift = 0
    ;(checkin.exercises || []).forEach(e => (e.log || []).forEach(s => {
      if (s && s.done) maxLift = Math.max(maxLift, Number(s.weight) || 0)
    }))
    if (maxLift > counters.maxLift) counters.maxLift = maxLift
  }
  const sleepOk = Number(checkin.sleepHours) >= 7
  const waterOk = Number(checkin.waterMl) >= waterTarget
  const weightOk = Number(checkin.weight) > 0
  if (lifeInc(prevNum('sleepHours') >= 7, sleepOk)) counters.sleepDays += 1
  if (lifeInc(prevNum('waterMl') >= waterTarget, waterOk)) counters.waterDays += 1
  if (lifeInc(prevNum('weight') > 0, weightOk)) counters.weightLogs += 1
  if (lifeInc(dietCheck(prev, ctx.profile, ctx.targets).ok, dc.ok)) { counters.proteinDays += 1; counters.kcalDays += 1 }
  else if (lifeInc(dietCheck(prev, ctx.profile, ctx.targets).proteinOnly, dc.proteinOnly)) counters.proteinDays += 1
  if (ctx.isFirstToday) {
    const h = Number(ctx.hour)
    if (h >= 5 && h <= 6) counters.earlyCount = (counters.earlyCount || 0) + 1
    if (h >= 22 && h <= 23) counters.nightCount = (counters.nightCount || 0) + 1
  }

  // ⑧ 周任务累计（sessions 同训练项口径；生活项同增量口径）
  const week = ctx.weekKey
  let weekTask = Object.assign({ week, sessions: 0, sleepDays: 0, weights: 0, proteinDays: 0, paid: [] }, g.weekTask || {})
  if (weekTask.week !== week) weekTask = { week, sessions: 0, sleepDays: 0, weights: 0, proteinDays: 0, paid: [] }
  if (firstTrainOfDay && trained) weekTask.sessions += 1
  if (lifeInc(prevNum('sleepHours') >= 7, sleepOk)) weekTask.sleepDays += 1
  if (lifeInc(prevNum('weight') > 0, weightOk)) weekTask.weights += 1
  if (lifeInc(dietCheck(prev, ctx.profile, ctx.targets).ok, dc.ok) ||
      lifeInc(dietCheck(prev, ctx.profile, ctx.targets).proteinOnly, dc.proteinOnly)) weekTask.proteinDays += 1
  WEEK_TASKS.forEach(t => {
    if (weekTask[t.key] >= t.target && weekTask.paid.indexOf(t.key) < 0) {
      weekTask.paid.push(t.key)
      special += t.exp
      breakdown.push({ k: 'week_' + t.key, name: '周任务：' + t.name, exp: t.exp })
    }
  })

  // ⑨ 徽章（exp 基数含 pools+special，与最终发放一致）
  const ctxCounters = { counters, streak, gamify: { exp: (g.exp || 0) + grantedTrain + grantedLife + grantedPush + special } }
  const owned = (g.badges || []).map(b => b.k)
  const badges = []
  BADGES.forEach(b => {
    if (owned.indexOf(b.k) >= 0) return
    let hit = false
    try { hit = !!b.test(ctxCounters) } catch (e) { hit = false }
    if (hit) {
      badges.push({ k: b.k, name: b.name, tier: b.tier, exp: b.exp, at: ctx.today })
      special += b.exp
    }
  })
  const totalGained = gained + special

  const expBefore = g.exp || 0
  const expAfter = expBefore + totalGained
  const lvBefore = levelOf(expBefore).level
  const lvAfter = levelOf(expAfter).level

  return {
    gained: totalGained,
    breakdown,
    pools: {
      train: Math.min(caps.trainRaw, DAILY_CAP.train),
      life: Math.min(caps.lifeRaw, DAILY_CAP.life),
      push: Math.min(caps.pushRaw, DAILY_CAP.push),
      capTotal: DAILY_CAP_TOTAL
    },
    caps,
    streak, counters, weekTask,
    badges,
    exp: expAfter,
    level: lvAfter,
    leveledUp: lvAfter > lvBefore,
    levelInfo: levelOf(expAfter)
  }
}

/** 结算一周（webCron 周一调用）：返回本周应发的 EXP 与更新后的 weekTask */
function settleWeek(gamify, weekKey) {
  const weekTask = Object.assign({ week: weekKey, sessions: 0, sleepDays: 0, weights: 0, proteinDays: 0, paid: [] }, (gamify || {}).weekTask || {})
  if (weekTask.week !== weekKey) return { ok: false, exp: 0, weekTask, breakdown: [] }
  let exp = 0
  const breakdown = []
  WEEK_TASKS.forEach(t => {
    if (weekTask[t.key] >= t.target && weekTask.paid.indexOf(t.key) < 0) {
      weekTask.paid.push(t.key); exp += t.exp
      breakdown.push({ k: 'week_' + t.key, name: t.name, exp: t.exp })
    }
  })
  return { ok: exp > 0, exp, weekTask, breakdown }
}

/** 排行榜排序（稳定：value desc → exp desc → uid asc） */
function sortRank(rows) {
  return rows.slice().sort((a, b) =>
    (b.value - a.value) || ((b.exp || 0) - (a.exp || 0)) || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
  ).map((r, i) => Object.assign({ rank: i + 1 }, r))
}

/* ─────────── 排行榜（对标竞品：能看到同城同级的玩家）───────────
 * 设计要点：
 *   ① **只排"坚持与容量"**，不排体重、不排体型（这条在 BADGES 注释里就定了，不能破）；
 *   ② 支持三种榜：等级榜 / 连续打卡榜 / 本周训练量榜；
 *   ③ 区域维度靠 profile.city；城市是**用户自选**的，不做定位（定位要授权、要备案，不值当）；
 *   ④ 人少的时候榜单会很难看 —— 所以 < 5 人时提示"同城还没几个人"而不是显示空榜。
 */
const BOARDS = [
  { k: 'level', name: '等级榜', unit: 'Lv', desc: '看谁练得久' },
  { k: 'streak', name: '连续榜', unit: '天', desc: '看谁没断过' },
  { k: 'volume', name: '本周榜', unit: '吨', desc: '看谁这个礼拜练得狠' }
]

/** 城市列表（我们自己列，不用定位）：先给一批健身人群集中的城市，用户也可自己填 */
const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉', '西安',
  '南京', '长沙', '苏州', '天津', '郑州', '青岛', '东莞', '佛山', '合肥', '福州', '厦门',
  '昆明', '济南', '沈阳', '大连', '宁波', '其他']

function normCity(c) {
  const t = String(c || '').trim().replace(/市$/, '').replace(/(省|自治区|特别行政区)$/, '')
  return t.slice(0, 12)
}

/**
 * 取一行榜的数值。
 * ⚠️ 必须同时兼容两种形状：
 *   ① 原始行 { uid, gamify:{ exp, streak, weekTask } }（云函数返回的）
 *   ② rankBoard 映射后的行 { exp, streak, volume }（顶层字段）
 * 只认 ① 的话，排序会全部取到 0，然后静默退化成"按经验排"—— 榜单看着有数据，其实是错的。
 */
function boardValue(row, board) {
  if (!row) return 0
  const g = row.gamify || row
  if (board === 'streak') {
    if (typeof row.streak === 'number') return row.streak
    return ((g.streak || {}).cur || 0)
  }
  if (board === 'volume') {
    if (typeof row.volume === 'number') return row.volume
    return round(((g.weekTask || {}).volume || 0) / 1000, 1)     // 吨
  }
  return (typeof row.exp === 'number' && row.gamify === undefined) ? row.exp : (g.exp || 0)
}

/**
 * 生成榜单。
 *   rows    : [{ uid, nick, city, playerNo, gamify, badgeCount }]
 *   opts    : { scope:'city'|'all', city, board, me, limit }
 * 返回     : { list, me, total, scope, board, thin }
 */
function rankBoard(rows, opts) {
  const o = opts || {}
  const board = o.board || 'level'
  const me = o.me || ''
  const city = normCity(o.city)
  let pool = (rows || []).slice()
  if (o.scope === 'city') pool = pool.filter(r => normCity(r.city) === city && city)

  const list = pool.map(r => {
    const g = r.gamify || r
    const lv = levelOf(g.exp || 0)
    return {
      uid: r.uid, nick: r.nick || '练友', city: normCity(r.city),
      playerNo: r.playerNo || '', noStr: r.playerNo ? playerNoStr(r.playerNo) : '',
      level: lv.level, title: lv.title, exp: g.exp || 0,
      streak: ((g.streak || {}).cur || 0),
      volume: round(((g.weekTask || {}).volume || 0) / 1000, 1),
      badges: r.badgeCount || ((g.badges || []).length),
      founding: playerTier(r.playerNo).key === 'founding',
      isMe: !!(me && r.uid === me)
    }
  })

  const sorted = list.sort((a, b) =>
    (boardValue(b, board) - boardValue(a, board)) ||
    (b.exp - a.exp) ||
    (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
  ).map((r, i) => Object.assign({ rank: i + 1 }, r))

  const mine = sorted.find(r => r.isMe) || null
  const myRank = mine ? mine.rank : null

  return {
    list: sorted.slice(0, o.limit || 50),
    me: mine, myRank: myRank, total: sorted.length,
    scope: o.scope === 'city' ? 'city' : 'all',
    city: city, board: board,
    unit: (BOARDS.find(b => b.k === board) || {}).unit || '',
    // 人少的时候实话实说，别装作榜单很热闹
    thin: sorted.length < 5,
    // 我还没上榜时，给一句"差多少"（比"暂无排名"有用）
    gapToTop: mine ? null : gapWords(sorted, me)
  }
}

function gapWords(sorted, me) {
  if (!sorted.length || !me) return ''
  const top = sorted[0]
  return '你还没进这份榜。目前第 1 名是 ' + (top.nick || '练友') + '（' + top.level + ' 级）'
}

/** 名次文案：前三名给奖牌，其余给"第 N 名" */
function rankWords(rank) {
  if (!rank) return '未上榜'
  if (rank === 1) return '🥇 第 1 名'
  if (rank === 2) return '🥈 第 2 名'
  if (rank === 3) return '🥉 第 3 名'
  return '第 ' + rank + ' 名'
}

/** 徽章展示辅助：未解锁 + hidden → ??? */
function visibleBadges(badges, ownedKeys, level) {
  const canSeeHidden = level >= 80
  return BADGES.map(b => {
    const got = ownedKeys.indexOf(b.k) >= 0
    const locked = !got && b.hidden && !canSeeHidden
    return Object.assign({}, b, { got, displayName: locked ? '???' : b.name, displayCond: locked ? '隐藏徽章' : b.cond })
  })
}

/** 徽章进度（2026-10-18 成长总览）：返回 { cur, target, done }；事件型/隐藏徽章返回 null（无进度条） */
function badgeProgress(b, counters, streak) {
  const c = counters || {}, s = streak || {}
  const M = {
    first_session: ['sessions', 1], sessions_10: ['sessions', 10], sessions_50: ['sessions', 50], sessions_100: ['sessions', 100],
    streak_3: ['best', 3, 'streak'], streak_7: ['best', 7, 'streak'], streak_14: ['best', 14, 'streak'],
    streak_30: ['best', 30, 'streak'], streak_100: ['best', 100, 'streak'],
    protein_7: ['proteinDays', 7], protein_30: ['proteinDays', 30], kcal_14: ['kcalDays', 14],
    sleep_7: ['sleepDays', 7], water_30: ['waterDays', 30], weight_20: ['weightLogs', 20],
    volume_100t: ['volume', 100000], lift_100: ['maxLift', 100]
  }
  const m = M[b.k]
  if (!m) return null
  const cur = m[2] === 'streak' ? (Number(s.best) || 0) : (Number(c[m[0]]) || 0)
  return { cur: cur, target: m[1], done: cur >= m[1] }
}

module.exports = {
  DAILY_CAP, DAILY_CAP_TOTAL, EXP_RULE, STREAK_TIERS, WEEK_TASKS,
  MAX_LEVEL, TITLE_TIERS, REALMS, realmOf, UNLOCKS, BADGES,
  PLAYER_NO, playerTier, playerNoStr, parsePlayerNo, tierIndexOf,
  levelOf, needOf, titleOf, volumeOf, doneRatio, dietCheck,
  calcCheckinExp, settleWeek, sortRank, visibleBadges, badgeProgress,
  BOARDS, CITIES, normCity, boardValue, rankBoard, rankWords, gapWords,
  round, clamp, dayDiff
}
