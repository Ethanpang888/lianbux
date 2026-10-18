#!/usr/bin/env node
/**
 * tools/test-gamify.js —— 游戏化规则回归测试（纯 Node，零依赖）
 * 跑法：node tools/test-gamify.js
 *
 * 覆盖：EXP 分池封顶 / 幂等补差 / 连续阶梯一次性 / 周任务 / 等级曲线 99 级 /
 *       徽章触发与隐藏 / 容量与完成率 / 排序稳定性
 */
const g = require('../shared/gamify.js')

let pass = 0, fail = 0
const failures = []
function ok(cond, name, extra) {
  if (cond) { pass++; return }
  fail++; failures.push(name + (extra ? '  → ' + extra : ''))
}
function section(t) { console.log('\n── ' + t + ' ──') }

const mkUser = (over) => Object.assign({
  gamify: {
    exp: 0, level: 1, badges: [],
    streak: { cur: 0, best: 0, lastDate: '', tierGiven: [] },
    caps: { date: '2026-09-01', train: 0, life: 0, push: 0 },
    weekTask: { week: '2026-W36', sessions: 0, sleepDays: 0, weights: 0, proteinDays: 0, paid: [] },
    counters: {}
  }
}, over || {})

const profile = { weight: 93 }
const targets = { kcal: 2600, protein: 167 }
const fullCheckin = {
  date: '2026-09-21', trained: true,
  exercises: [{ name: '杠铃卧推', log: [{ weight: 80, reps: 10, done: true }, { weight: 80, reps: 10, done: true }] }],
  dietLog: [{ name: '鸡胸', kcal: 2400, protein: 170 }],
  waterMl: 2800, sleepHours: 7.5, weight: 92.4
}
const baseCtx = {
  user: mkUser(), checkin: fullCheckin, profile, targets,
  today: '2026-09-21', weekKey: '2026-W38', isFirstToday: true, hour: 20
}

// ── 1. 等级曲线（99 级）──
section('1. 等级曲线')
ok(g.MAX_LEVEL === 99, '满级为 99 级', String(g.MAX_LEVEL))
{
  const l1 = g.levelOf(0)
  ok(l1.level === 1 && l1.title === '新手村', '0 EXP → 1 级 新手村', JSON.stringify(l1))
  ok(g.needOf(1) === 40, 'need(1) = 40', String(g.needOf(1)))
  const max = g.levelOf(9999999)
  ok(max.level === 99 && max.title === '练不虚', '超量 EXP → 99 级 练不虚', JSON.stringify(max))
  const mid = g.levelOf(g.needOf(50))
  ok(mid.level === 50, '恰好压线 → 升到 50 级', String(mid.level))
  const just = g.levelOf(g.needOf(50) - 1)
  ok(just.level === 49, '差 1 点 → 仍是 49 级', String(just.level))
  ok(g.levelOf(1000).pct >= 0 && g.levelOf(1000).pct <= 100, '进度百分比在 0-100', String(g.levelOf(1000).pct))
  // 满级约 3 年：需 200k-300k EXP
  const need99 = g.needOf(99)
  ok(need99 > 200000 && need99 < 300000, '满级门槛在 20-30 万 EXP（约 3 年）', String(need99))
}

// ── 2. 单日结算 ──
section('2. 单日结算与分池')
{
  const r = g.calcCheckinExp(baseCtx)
  ok(r.pools.train === 110, '训练池 = 100（完成）+ 10（1.6 吨）', String(r.pools.train))
  ok(r.pools.life === 60, '生活池 = 30+15+10+5 = 60', String(r.pools.life))
  ok(r.pools.push === 0, '未做俯卧撑 → 识别池 0', String(r.pools.push))
  const badgeExp = r.badges.reduce((s, b) => s + b.exp, 0)
  ok(r.badges.some(b => b.k === 'first_session'), '首次打卡触发「首练」徽章', JSON.stringify(r.badges.map(b => b.k)))
  ok(r.gained === 170 + badgeExp, '总 EXP = 池得分 170 + 徽章 ' + badgeExp, String(r.gained))
  ok(r.exp === r.gained, '累计 EXP 等于本次（新用户）', String(r.exp))
  ok(r.breakdown.length >= 5, '明细条目 ≥5', String(r.breakdown.length))
}

// ── 3. 幂等补差（同日重复提交不涨）──
section('3. 幂等补差')
{
  const first = g.calcCheckinExp(baseCtx)
  // 模拟服务端把首次结果写库
  const user2 = mkUser({ gamify: Object.assign({}, baseCtx.user.gamify, {
    exp: first.exp, caps: first.caps, badges: first.badges,
    counters: first.counters, streak: first.streak, weekTask: first.weekTask
  }) })
  const again = g.calcCheckinExp(Object.assign({}, baseCtx, { user: user2, isFirstToday: false }))
  ok(again.gained === 0, '同日原样再提交 → 0 EXP（幂等）', String(again.gained))
  ok(again.exp === first.exp, '累计 EXP 不变', String(again.exp))
  // 补差额：只多做了俯卧撑
  const withPush = Object.assign({}, fullCheckin, { pushup: { count: 30 } })
  const r2 = g.calcCheckinExp(Object.assign({}, baseCtx, { user: user2, checkin: withPush, isFirstToday: false }))
  ok(r2.gained === 15, '新增 30 个俯卧撑 → 只补 15（5×3）', String(r2.gained))
  ok(r2.pools.push === 15, '识别池累计 15', String(r2.pools.push))
  // 再提交一次同样的 → 仍为 0（注意：引擎返回的 badges 是「本次新解锁」，服务端需追加而非替换）
  const user3 = mkUser({ gamify: Object.assign({}, user2.gamify, {
    exp: r2.exp, caps: r2.caps, badges: user2.gamify.badges.concat(r2.badges)
  }) })
  const r3 = g.calcCheckinExp(Object.assign({}, baseCtx, { user: user3, checkin: withPush, isFirstToday: false }))
  ok(r3.gained === 0, '第二次补差后再提交 → 0', String(r3.gained))
  ok(r3.badges.length === 0, '不重复发徽章', JSON.stringify(r3.badges))
}

// ── 4. 分池上限 ──
section('4. 分池上限')
{
  const monster = Object.assign({}, fullCheckin, {
    exercises: [{ name: '深蹲', log: [{ weight: 200, reps: 10, done: true }] }] // 2000kg
  })
  // 造 30 吨：150kg × 20 次 × 10 组 = 30000kg → 容量 300 分，应被截到 120
  monster.exercises = [{ name: '深蹲', log: Array.from({ length: 10 }, () => ({ weight: 150, reps: 20, done: true })) }]
  const r = g.calcCheckinExp(Object.assign({}, baseCtx, { checkin: monster }))
  ok(r.pools.train === 220, '训练池封顶 220（100+120）', String(r.pools.train))
  const life = Object.assign({}, fullCheckin, { waterMl: 9999, sleepHours: 9, weight: 92 })
  const r2 = g.calcCheckinExp(Object.assign({}, baseCtx, { checkin: life }))
  ok(r2.pools.life <= 70, '生活池不超过 70', String(r2.pools.life))
  const push = Object.assign({}, fullCheckin, { pushup: { count: 5000 } })
  const r3 = g.calcCheckinExp(Object.assign({}, baseCtx, { checkin: push }))
  ok(r3.pools.push === 50, '识别池封顶 50', String(r3.pools.push))
}

// ── 5. 连续打卡阶梯 ──
section('5. 连续打卡阶梯')
{
  let user = mkUser()
  let lastExp = 0
  for (let d = 1; d <= 3; d++) {
    const today = '2026-09-' + String(10 + d).padStart(2, '0')
    const r = g.calcCheckinExp({
      user, checkin: Object.assign({}, fullCheckin, { date: today }), profile, targets,
      today, weekKey: '2026-W37', isFirstToday: true, hour: 20
    })
    user = mkUser({ gamify: Object.assign({}, user.gamify, {
      exp: r.exp, caps: r.caps, streak: r.streak, counters: r.counters, weekTask: r.weekTask
    }) })
    if (d === 3) {
      ok(r.streak.cur === 3, '连续 3 天', String(r.streak.cur))
      const hasTier3 = r.breakdown.some(b => b.k === 'streak_3')
      ok(hasTier3, '第 3 天触发 +20 阶梯', JSON.stringify(r.breakdown.map(b => b.k)))
      lastExp = r.gained
    }
  }
  // 断签后重置
  const r4 = g.calcCheckinExp(Object.assign({}, baseCtx, {
    user, checkin: Object.assign({}, fullCheckin, { date: '2026-09-20' }),
    today: '2026-09-20', isFirstToday: true
  }))
  ok(r4.streak.cur === 1, '断签后 cur 重置为 1', String(r4.streak.cur))
  ok(r4.streak.best === 3, 'best 保留 3', String(r4.streak.best))
}

// ── 6. 周任务 ──
section('6. 周任务')
{
  const r = g.settleWeek({ weekTask: { week: '2026-W38', sessions: 4, sleepDays: 6, weights: 3, proteinDays: 5, paid: [] } }, '2026-W38')
  ok(r.ok && r.exp === 320, '四项全达标 → 320 EXP', String(r.exp))
  ok(r.breakdown.length === 4, '四个明细', String(r.breakdown.length))
  const r2 = g.settleWeek({ weekTask: { week: '2026-W38', sessions: 4, sleepDays: 6, weights: 3, proteinDays: 5, paid: ['sessions'] } }, '2026-W38')
  ok(r2.exp === 240, '已发过的不重复发（240）', String(r2.exp))
  const r3 = g.settleWeek({ weekTask: { week: '2026-W37', sessions: 9, paid: [] } }, '2026-W38')
  ok(!r3.ok, '跨周不结算', JSON.stringify(r3))
}

// ── 7. 容量与完成率 ──
section('7. 容量与完成率')
{
  const ex = [{ log: [{ weight: 100, reps: 5, done: true }, { weight: 100, reps: 5, done: false }] }]
  ok(g.volumeOf(ex) === 500, '只算 done 的组（500kg）', String(g.volumeOf(ex)))
  ok(g.doneRatio(ex) === 0.5, '完成率 0.5', String(g.doneRatio(ex)))
  // 完成率 <80% 不算完成训练
  const r = g.calcCheckinExp(Object.assign({}, baseCtx, { checkin: Object.assign({}, fullCheckin, { exercises: ex }) }))
  ok(!r.breakdown.some(b => b.k === 'session'), '完成率不足 → 不发「完成训练」分', JSON.stringify(r.breakdown.map(b => b.k)))
}

// ── 8. 徽章 ──
section('8. 徽章')
{
  const r = g.calcCheckinExp(baseCtx)
  const keys = r.badges.map(b => b.k)
  ok(keys.indexOf('first_session') >= 0, '首练徽章触发', JSON.stringify(keys))
  ok(keys.indexOf('streak_3') < 0, '连续 3 天未达成 → 不发火种', JSON.stringify(keys))
  const vis = g.visibleBadges(g.BADGES, ['first_session'], 1)
  const hidden = vis.find(b => b.k === 'early_bird')
  ok(hidden.displayName === '???', '低等级看不到隐藏徽章名', hidden.displayName)
  const vis80 = g.visibleBadges(g.BADGES, [], 80)
  ok(vis80.find(b => b.k === 'early_bird').displayName === '早起鸟', '80 级可见隐藏徽章', '')
  ok(g.BADGES.length === 21, '徽章共 21 个', String(g.BADGES.length))
  ok(g.BADGES.filter(b => b.hidden).length === 3, '隐藏徽章 3 个', String(g.BADGES.filter(b => b.hidden).length))
}

// ── 9. 排序稳定性 ──
section('9. 排行榜排序')
{
  const rows = [
    { uid: 'w_b', value: 5, exp: 100 },
    { uid: 'w_a', value: 5, exp: 100 },
    { uid: 'w_c', value: 7, exp: 10 }
  ]
  const sorted = g.sortRank(rows)
  ok(sorted[0].uid === 'w_c' && sorted[0].rank === 1, 'value 优先', JSON.stringify(sorted.map(r => r.uid)))
  ok(sorted[1].uid === 'w_a' && sorted[2].uid === 'w_b', '同分按 uid 稳定排序', JSON.stringify(sorted.map(r => r.uid)))
  const again = g.sortRank(rows)
  ok(JSON.stringify(again) === JSON.stringify(sorted), '两次排序结果一致', '')
}

// ── 10. 饮食判定 ──
section('10. 饮食达标判定')
{
  const c1 = { dietLog: [{ kcal: 2600, protein: 170 }] }
  ok(g.dietCheck(c1, profile, targets).ok === true, '蛋白+热量都达标 → ok', '')
  const c2 = { dietLog: [{ kcal: 1200, protein: 170 }] }
  const d2 = g.dietCheck(c2, profile, targets)
  ok(d2.proteinOnly === true && d2.ok === false, '仅蛋白达标 → proteinOnly', JSON.stringify(d2))
  const c3 = { dietLog: [] }
  const d3 = g.dietCheck(c3, profile, targets)
  ok(!d3.ok && !d3.proteinOnly, '没记录 → 都不达标', JSON.stringify(d3))
}

// ── 11. 玩家编号 ──

// ── 11. 等级进度区间（回归：0 经验时不能出现负进度）──
section('11. 等级进度区间')
{
  const l0 = g.levelOf(0)
  ok(l0.level === 1, '0 EXP → 1 级', String(l0.level))
  ok(l0.cur === 0, '1 级的区间下界是 0（不是 40）', String(l0.cur))
  ok(l0.exp - l0.cur === 0, '0 EXP 时本级已获得 = 0（不出现 -40）', String(l0.exp - l0.cur))
  ok(l0.pct === 0, '0 EXP 进度 0%', String(l0.pct))
  ok(l0.span > 0 && l0.toNext === l0.span, '本级跨度 = 还差 EXP', l0.span + '/' + l0.toNext)

  let bad = 0, prevLv = 0, nonMono = 0
  for (let e = 0; e <= 260000; e += 97) {
    const r = g.levelOf(e)
    if (r.pct < 0 || r.pct > 100 || r.cur < 0 || r.toNext < 0 || !isFinite(r.pct)) bad++
    if (r.level < prevLv) nonMono++
    prevLv = r.level
  }
  ok(bad === 0, '全经验区间扫查：进度百分比不出界、无 NaN', String(bad))
  ok(nonMono === 0, '等级随经验单调不降', String(nonMono))
  ok(g.levelOf(247609).level === g.MAX_LEVEL, '满级 EXP 可达 99 级')
  ok(g.levelOf(999999999).pct === 100 && g.levelOf(999999999).toNext === 0, '超满级后进度封顶 100%、无剩余', JSON.stringify(g.levelOf(999999999)))
}

section('12. 玩家编号（身份凭证）')
{
  ok(g.playerNoStr(1) === '#0001', '编号补零到 4 位 → #0001', g.playerNoStr(1))
  ok(g.playerNoStr(100) === '#0100', '第 100 位 → #0100', g.playerNoStr(100))
  ok(g.playerNoStr(12345) === '#12345', '超过 4 位不截断', g.playerNoStr(12345))
  ok(g.playerNoStr(0) === '#----', '未分配时给占位符（不出现 undefined）', g.playerNoStr(0))

  ok(g.playerTier(1).key === 'founding' && g.playerTier(1).gold === true, '第 1 位 → 创始玩家（金标）')
  ok(g.playerTier(100).key === 'founding', '第 100 位仍是创始玩家（含边界）')
  ok(g.playerTier(101).key === 'early', '第 101 位 → 早期玩家')
  ok(g.playerTier(1001).key === 'player', '第 1001 位 → 副本玩家')
  ok(g.playerTier(0).key === 'none', '未分配 → 待分配')

  ok(g.parsePlayerNo('#0007') === 7, '解析 #0007 → 7', String(g.parsePlayerNo('#0007')))
  ok(g.parsePlayerNo('7') === 7, '解析 7 → 7', String(g.parsePlayerNo('7')))
  ok(g.parsePlayerNo('我的编号是 0042 号') === 42, '从一句话里提取编号', String(g.parsePlayerNo('我的编号是 0042 号')))
  ok(g.parsePlayerNo('') === 0 && g.parsePlayerNo(null) === 0, '空输入 → 0（不抛错）')

  ok(g.tierIndexOf(1) === 0, 'Lv1 → 段位 0（新手村）', String(g.tierIndexOf(1)))
  ok(g.tierIndexOf(99) === g.TITLE_TIERS.length - 1, 'Lv99 → 最后一段（练不虚）', String(g.tierIndexOf(99)))
  let monotonic = true
  for (let lv = 1; lv <= 99; lv++) if (g.tierIndexOf(lv) < g.tierIndexOf(lv - 1)) monotonic = false
  ok(monotonic, '段位随等级单调不降（不会倒退）')
}

/** 造排行榜行 */
const mkRow = (uid, nick, city, exp, streak, vol, no) => ({
  uid, nick, city, playerNo: no || 0,
  gamify: { exp, badges: [], streak: { cur: streak }, weekTask: { volume: vol } }
})

// ── 12. 排行榜（全国 / 同城 × 三种榜）──
section('13. 排行榜：分区域 + 分维度')
{
  const rows = [
    mkRow('u1', '阿清', '广州', 5200, 12, 18400, 7),
    mkRow('u2', '小李', '广州', 9800, 5, 26000, 236),
    mkRow('u3', '老王', '北京', 2100, 31, 9000, 1500)
  ]

  // ① 同城过滤
  const city = g.rankBoard(rows, { scope: 'city', city: '广州', board: 'level', me: 'u1' })
  ok(city.total === 2, '同城榜只含广州的 2 人', String(city.total))
  ok(city.list.every(r => r.city === '广州'), '榜上全是同城')
  const all = g.rankBoard(rows, { scope: 'all', board: 'level', me: 'u1' })
  ok(all.total === 3, '全国榜含 3 人', String(all.total))
  ok(g.rankBoard(rows, { scope: 'city', city: '', board: 'level' }).total === 0, '没设城市 → 同城榜为空（不发全量数据）')
  ok(g.rankBoard(rows, { scope: 'city', city: '广州市', board: 'level' }).total === 2, '「广州市」与「广州」视为同一个城市')

  // ② 三个维度各按自己的字段排（这里曾经有 bug：全退化成按经验排）
  const byLevel = g.rankBoard(rows, { scope: 'all', board: 'level' }).list
  ok(byLevel[0].uid === 'u2' && byLevel[2].uid === 'u3', '等级榜按经验排', byLevel.map(r => r.uid).join(','))
  const byStreak = g.rankBoard(rows, { scope: 'all', board: 'streak' }).list
  ok(byStreak[0].uid === 'u3' && byStreak[1].uid === 'u1', '连续榜按天数排（不是按经验）', byStreak.map(r => r.uid + ':' + r.streak).join(','))
  const byVol = g.rankBoard(rows, { scope: 'all', board: 'volume' }).list
  ok(byVol[0].uid === 'u2' && byVol[1].uid === 'u1', '本周榜按训练量排', byVol.map(r => r.uid + ':' + r.volume).join(','))

  // ③ boardValue 要同时认「原始行」和「映射后的行」
  ok(g.boardValue(rows[0], 'streak') === 12, 'boardValue 认原始行', String(g.boardValue(rows[0], 'streak')))
  ok(g.boardValue({ streak: 12, exp: 1 }, 'streak') === 12, 'boardValue 认映射行', String(g.boardValue({ streak: 12 }, 'streak')))
  ok(g.boardValue(rows[0], 'volume') === 18.4, 'boardValue 吨换算正确', String(g.boardValue(rows[0], 'volume')))
  ok(g.boardValue(null, 'level') === 0, '空行返回 0，不炸')

  // ④ 我的名次 / 未上榜提示
  const mine = g.rankBoard(rows, { scope: 'city', city: '广州', board: 'level', me: 'u1' })
  ok(mine.myRank === 2, '同城等级榜里我是第 2', String(mine.myRank))
  ok(mine.me && mine.me.isMe === true, '带回我的那一行')
  ok(g.rankWords(1) === '🥇 第 1 名' && g.rankWords(9) === '第 9 名' && g.rankWords(null) === '未上榜', '名次文案')
  const outsider = g.rankBoard(rows, { scope: 'city', city: '广州', board: 'level', me: 'nobody' })
  ok(outsider.myRank === null && /你还没进这份榜/.test(outsider.gapToTop), '没上榜时给"差多少"而不是空着', outsider.gapToTop)

  // ⑤ 人少时实话实说
  ok(g.rankBoard([rows[0]], { scope: 'all', board: 'level' }).thin === true, '少于 5 人 → thin 标记')
  ok(g.rankBoard(rows.concat(rows, rows), { scope: 'all', board: 'level' }).thin === false, '≥5 人 → 不算人少')

  // ⑥ 排序稳定 + 名次连续 + 不打乱入参
  const frozen = JSON.stringify(rows)
  const sorted = g.rankBoard(rows, { scope: 'all', board: 'level' }).list
  ok(sorted.map(r => r.rank).join(',') === '1,2,3', '名次从 1 连续编号', sorted.map(r => r.rank).join(','))
  ok(JSON.stringify(rows) === frozen, '不修改入参')

  // ⑦ 创始玩家标记 + 等级/称号
  const f = g.rankBoard(rows, { scope: 'all', board: 'level' }).list.find(r => r.uid === 'u1')
  ok(f.founding === true && f.noStr === '#0007', '创始玩家带金标与编号', f.noStr)
  ok(g.rankBoard(rows, { scope: 'all' }).list.find(r => r.uid === 'u3').founding === false, '非创始玩家不误标')
  ok(f.level > 0 && typeof f.title === 'string', '带上等级与称号', f.level + '/' + f.title)

  // ⑧ 城市归一化
  ok(g.normCity('广州市') === '广州' && g.normCity(' 广州 ') === '广州', '去「市」去空格')
  ok(g.normCity('广东省') === '广东', '去「省」')
  ok(g.normCity('') === '' && g.normCity(null) === '', '空值安全')
  ok(g.normCity('超长城市名字测试一二三四五') .length <= 12, '城市名截断到 12 字')
}

console.log('\n' + '═'.repeat(56))
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail) { console.log('\n  失败明细：'); failures.forEach(f => console.log('   · ' + f)) }
console.log('═'.repeat(56))
process.exit(fail ? 1 : 0)
