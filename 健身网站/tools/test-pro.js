#!/usr/bin/env node
/**
 * tools/test-pro.js —— 「完整版」（付费层）逻辑回归测试
 *
 * 为什么需要：
 *   完整版给的是「具体重量 + 周期表 + 状态微调」，一旦算错，用户照着练就会受伤或白练。
 *   而且周期表是**第二处**复现引擎组次的地方（第一处是 kb.js），必须逐轮逐角色对齐，
 *   否则页面上写着 4×8、引擎按 4×10 排 —— 这就是"两处真相"，本项目踩过多次。
 *
 * 跑法：node tools/test-pro.js
 */
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const KBROOT = path.resolve(ROOT, '..', '健身小程序')
const pro = require(path.join(ROOT, 'shared/pro.js'))
const kb = require(path.join(KBROOT, 'utils/kb.js'))
const calc = require(path.join(KBROOT, 'utils/calc.js'))
const METHOD = kb.METHOD

let pass = 0, fail = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name) }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')) }
}
function section(t) { console.log('\n── ' + t + ' ──') }

const P = { gender: '男', age: 35, height: 183, weight: 93, goal: '增肌', exp: '进阶', days: 4, bodyType: '中性', activity: 'mod' }
const EX = (name, pattern, equipment, role) => ({ name, pattern, equipment, role: role || '辅助' })

// ─────────────────────────────────────────────
section('1. 模块导出与接口完整性')
{
  const need = ['todayPrescription', 'cycleTable', 'applyState', 'dietPlan', 'anchorOf',
    'estimateW8', 'wForReps', 'snap', 'parseSets', 'memberOf', 'isPro', 'isCoach', 'roundPlan']
  const miss = need.filter(k => typeof pro[k] !== 'function')
  ok(miss.length === 0, '核心函数全部导出', '缺 ' + miss.join(','))
  ok(pro.STATES.length >= 4, '状态微调规则 ≥4 档', '实际 ' + pro.STATES.length)
  ok(pro.EATOUT.length >= 4, '外食规则 ≥4 条')
  ok(pro.SUPPLEMENT.length >= 4, '补剂建议 ≥4 条')
}

section('2. ★ 兜底副本与 method.js 完全一致（防两处真相）')
{
  const F = pro.FALLBACK
  ok(JSON.stringify(F.MAIN_LADDER) === JSON.stringify(METHOD.MAIN_LADDER), 'MAIN_LADDER 一致')
  ok(F.DELOAD.everyWeeks === METHOD.DELOAD.everyWeeks && F.DELOAD.setsFactor === METHOD.DELOAD.setsFactor,
    'DELOAD 一致', JSON.stringify(F.DELOAD) + ' vs ' + JSON.stringify(METHOD.DELOAD))
  ok(JSON.stringify(F.SETS_BY_GOAL) === JSON.stringify(METHOD.SETS_BY_GOAL), 'SETS_BY_GOAL 一致')
  ok(F.CORE_SETS === METHOD.CORE.sets, '核心组次一致', F.CORE_SETS + ' vs ' + METHOD.CORE.sets)
  ok(JSON.stringify(F.MEALS.map(m => [m.key, m.name, m.pct])) ===
     JSON.stringify(METHOD.DIET.meals.map(m => [m.key, m.name, m.pct])), '分餐比例一致')
}

section('3. 组次解析')
{
  const a = pro.parseSets('4×12')
  ok(a.sets === 4 && a.reps === 12 && a.repMax === 12, "4×12 → 4 组 12 次")
  const b = pro.parseSets('3×15-20')
  ok(b.sets === 3 && b.reps === 15 && b.repMax === 20, '3×15-20 → 区间被识别')
  const c = pro.parseSets('2x8')
  ok(c.sets === 2 && c.reps === 8, '兼容小写 x 分隔符')
  const d = pro.parseSets('')
  ok(d.sets === 3 && d.reps === 10, '空值有安全兜底')
}

section('4. 重量换算（Epley）单调且自洽')
{
  ok(Math.abs(pro.wForReps(60, 8) - 60) < 1e-9, '8 次口径换算回自身不变')
  const r = [12, 10, 8, 6, 5].map(n => pro.wForReps(100, n))
  ok(r.every((v, i) => i === 0 || v > r[i - 1]), '次数越少重量越大（严格单调）', JSON.stringify(r.map(v => Math.round(v * 10) / 10)))
  ok(Math.abs(r[0] - 90.5) < 0.5, '12 次 ≈ 8 次重量的 90%', String(Math.round(r[0] * 10) / 10))
  ok(Math.abs(r[4] - 108.6) < 0.5, '5 次 ≈ 8 次重量的 109%', String(Math.round(r[4] * 10) / 10))
  ok(pro.e1rm(100, 10) > pro.e1rm(100, 1), '同一重量能做更多次 → 估算 1RM 更高')
}

section('5. 配重取整（保守）')
{
  ok(pro.snap(63.1, 2.5) === 62.5, '杠铃向下贴 2.5kg', String(pro.snap(63.1, 2.5)))
  ok(pro.snap(26.4, 2) === 26, '哑铃向下贴 2kg', String(pro.snap(26.4, 2)))
  ok(pro.snap(0.5, 2.5) === 2.5, '低于最小配重时给一档最小的（不是 0）', String(pro.snap(0.5, 2.5)))
  ok(pro.snap(0, 2.5) === 0, '0 保持 0（自重动作）')
  ok(pro.snap(-5, 2.5) === 0, '负数归零')
}

section('6. 起始重量估算（推演，合理性区间）')
{
  const bw = EX('杠铃卧推', 'push_h', '杠铃')
  const sq = EX('杠铃深蹲', 'squat', '杠铃')
  const lp = EX('腿举', 'squat', '器械')
  const db = EX('哑铃卧推', 'push_h', '哑铃')
  const lat = EX('哑铃侧平举', 'delts', '哑铃')
  const pu = EX('俯卧撑', 'push_h', '无器械')
  const w1 = pro.estimateW8(bw, P), w2 = pro.estimateW8(sq, P), w3 = pro.estimateW8(lp, P)
  const w4 = pro.estimateW8(db, P), w5 = pro.estimateW8(lat, P), w6 = pro.estimateW8(pu, P)
  ok(w1 >= 55 && w1 <= 75, '93kg 进阶 卧推 8RM 落在 55-75kg', String(w1))
  ok(w2 >= 80 && w2 <= 100, '深蹲 8RM 落在 80-100kg', String(w2))
  ok(w3 >= 180 && w3 <= 230, '腿举 8RM 落在 180-230kg（≠深蹲口径）', String(w3))
  ok(w4 >= 20 && w4 <= 32, '哑铃卧推单只 20-32kg（哑铃修正生效）', String(w4))
  ok(w5 >= 6 && w5 <= 14, '哑铃侧平举单只 6-14kg', String(w5))
  ok(w6 === 0, '自重动作不给外部重量', String(w6))
  ok(pro.estimateW8(bw, { weight: 0 }) === 0, '没填体重时不瞎给重量')
  const novice = pro.estimateW8(bw, Object.assign({}, P, { exp: '新手' }))
  ok(novice < w1, '新手 < 进阶的起始重量', novice + ' < ' + w1)
}

section('7. 锚点优先用实测')
{
  const ex = EX('杠铃卧推', 'push_h', '杠铃', '主项')
  const hist = [
    { date: '2026-09-10', exercises: [{ name: '杠铃卧推', log: [{ weight: 50, reps: 10, done: true }] }] },
    { date: '2026-09-20', exercises: [{ name: '杠铃卧推', log: [{ weight: 60, reps: 8, done: true }] }] }
  ]
  const a = pro.anchorOf(ex, P, hist)
  ok(a.src === '实测', '有记录时用实测', a.src)
  ok(a.from && a.from.date === '2026-09-20', '取最近一次（不是最早那次）', a.from && a.from.date)
  ok(Math.abs(a.weight - 60) <= 2.5, '60kg×8 → 锚点 ≈60kg', String(a.weight))
  const noHist = pro.anchorOf(ex, P, [])
  ok(noHist.src === '推演', '没记录时退回推演', noHist.src)
  // 只记录但没练（0 重量）不该被当成实测
  const zero = pro.anchorOf(ex, P, [{ date: '2026-09-20', exercises: [{ name: '杠铃卧推', log: [{ weight: 0, reps: 8, done: false }] }] }])
  ok(zero.src === '推演', '空组次不算实测')
}

section('8. ★ 周期表与计划引擎逐轮对齐')
{
  const mismatch = []
  const cfgs = [{ split: 'full', freq: 'w3' }, { split: 'ppl', freq: 'c3' }, { split: 'cpbsl', freq: 'c4' }, { split: 'five', freq: 'c5' }]
  let checked = 0
  cfgs.forEach(cfg => {
    ;['新手', '进阶', '熟练'].forEach(exp => {
      ;['增肌', '减脂', '塑形', '增肌减脂同步'].forEach(goal => {
        const pr = Object.assign({}, P, { exp, goal })
        let plan
        try { plan = kb.generatePlan(pr, { split: cfg.split, freq: cfg.freq, home: false }) } catch (e) { return }
        const micro = plan.micro || []
        const first = micro.findIndex(x => x !== 'rest')
        if (first < 0) return
        for (let w = 1; w <= 8; w++) {
          const d = (w - 1) * micro.length + first
          const day = kb.dayContent(plan, d, pr, false)
          if (!day || day.type !== 'train') continue
          const tag = cfg.split + '/' + exp + '/' + goal + ' 第' + w + '轮'
          if (Number(day.week) !== w) { mismatch.push(tag + ' 引擎 week=' + day.week); continue }
          const rp = pro.roundPlan(goal, exp, w, METHOD)
          if (!!day.deload !== rp.deload) mismatch.push(tag + ' 减载标记不一致')
          const main = (day.exercises || []).find(e => e.role === '主项')
          if (main && main.sets !== rp.sets.主项) mismatch.push(tag + ' 主项 ' + main.sets + ' vs ' + rp.sets.主项)
          ;['辅助', '孤立'].forEach(role => {
            const e = (day.exercises || []).find(x => x.role === role)
            if (e && e.sets !== rp.sets[role]) mismatch.push(tag + ' ' + role + ' ' + e.sets + ' vs ' + rp.sets[role])
          })
          const core = (day.exercises || []).find(x => x.role === '核心')
          if (core && core.sets !== rp.sets.核心) mismatch.push(tag + ' 核心 ' + core.sets + ' vs ' + rp.sets.核心)
          checked++
        }
      })
    })
  })
  ok(checked > 200, '覆盖组合足够（' + checked + ' 个训练日）')
  ok(mismatch.length === 0, '组次/减载全部一致（' + checked + ' 个训练日逐角色比对）', mismatch.slice(0, 3).join(' ｜ '))
}

section('9. 周期表结构')
{
  const plan = kb.generatePlan(P, { split: 'ppl', freq: 'c3', home: false })
  const t = pro.cycleTable(plan, P, { rounds: 8, week: 3, method: METHOD })
  ok(t.rounds.length === 8, '默认给出 8 轮（两个减载周期）', String(t.rounds.length))
  const deloads = t.rounds.filter(r => r.deload).map(r => r.week)
  ok(JSON.stringify(deloads) === JSON.stringify([4, 8]), '减载轮是第 4、8 轮', JSON.stringify(deloads))
  ok(t.rounds[0].sets.主项 === '4×12' && t.rounds[1].sets.主项 === '4×10' && t.rounds[2].sets.主项 === '4×8',
    '主项阶梯 12→10→8', t.rounds.slice(0, 3).map(r => r.sets.主项).join(' '))
  ok(t.rounds[3].sets.主项 === '2×8', '减载轮组数 ×0.6（4×8 → 2×8）', t.rounds[3].sets.主项)
  ok(t.rounds[4].sets.主项 === '4×6' && t.rounds[5].sets.主项 === '4×5', '减载不占阶梯（第5轮继续 4×6）',
    t.rounds.slice(4, 6).map(r => r.sets.主项).join(' '))
  ok(t.rounds[0].rel < t.rounds[2].rel, '打基础轮的重量应低于上强度轮', t.rounds[0].rel + ' < ' + t.rounds[2].rel)
  ok(t.rounds.every(r => r.note && r.phase), '每轮都有阶段名与说明')
  ok(/减量/.test(t.rounds[3].note), '减载轮说明写清了「减量不减强度」')
}

section('10. 状态微调')
{
  const plan = kb.generatePlan(P, { split: 'ppl', freq: 'c3', home: false })
  const day = kb.dayContent(plan, 0, P, false)
  const normal = pro.applyState(day, P, [], 'ok')
  const tired = pro.applyState(day, P, [], 'tired')
  const rush = pro.applyState(day, P, [], 'rush')
  const bad = pro.applyState(day, P, [], 'bad')
  ok(normal.list.length === day.exercises.length, '正常状态动作数不变')
  ok(tired.list.length === normal.list.length, '累的时候不减动作、只降量')
  const nMain = normal.list.find(x => x.role === '主项'), tMain = tired.list.find(x => x.role === '主项')
  ok(tMain.weight < nMain.weight, '累 → 主项重量下降', tMain.weight + ' < ' + nMain.weight)
  const nAux = normal.list.filter(x => x.role === '辅助')[0]
  const tAux = tired.list.filter(x => x.role === '辅助')[0]
  ok(nAux && tAux && tAux.setsN === nAux.setsN - 1, '累 → 辅助砍 1 组', (tAux && tAux.setsN) + ' vs ' + (nAux && nAux.setsN))
  ok(rush.list.length === 2, '只有 30 分钟 → 只留主项 + 1 个辅助', String(rush.list.length))
  ok(bad.list.length === 0, '生病 → 不练', String(bad.list.length))
  ok(pro.applyState(day, P, [], '不存在的状态').state.key === 'ok', '未知状态回落「正常」')
}

section('11. 今日处方（页面直接渲染）')
{
  const plan = kb.generatePlan(P, { split: 'ppl', freq: 'c3', home: false })
  ;[0, 12, 16].forEach(d => {
    const day = kb.dayContent(plan, d, P, false)
    if (day.type !== 'train') return
    const tp = pro.todayPrescription(day, P, [])
    ok(tp.list.length === day.exercises.length, '第' + (d + 1) + '天：每个动作都有处方（' + tp.list.length + ' 个）')
    ok(tp.list.every(x => x.name && x.unit && x.sets && Number.isFinite(x.weight)),
      '第' + (d + 1) + '天：无 NaN/undefined，重量是数字')
    ok(tp.list.every(x => x.weight === 0 || x.weight > 0), '第' + (d + 1) + '天：重量非负')
    ok(tp.plannedKg > 0, '第' + (d + 1) + '天：计划容量算得出来（' + tp.plannedKg + 'kg）')
  })
  const plan2 = kb.generatePlan(Object.assign({}, P, { home: true }), { split: 'ppl', freq: 'c3', home: true })
  const day2 = kb.dayContent(plan2, 0, Object.assign({}, P, { home: true }), true)
  const tp2 = pro.todayPrescription(day2, Object.assign({}, P, { home: true }), [])
  ok(tp2.list.every(x => Number.isFinite(x.weight)), '居家计划同样不产生 NaN')
}

section('12. 主食换算与食物库一致')
{
  const bad = []
  pro.STAPLE.forEach(s => {
    const f = kb.FOODS.find(x => x.name === s.name)
    if (!f) bad.push(s.name + '（库里没有）')
    else if (Number(f.kcal) !== Number(s.kcal)) bad.push(s.name + ' ' + f.kcal + ' vs ' + s.kcal)
  })
  ok(bad.length === 0, 'STAPLE 的每一条都能在食物库里对上号且热量一致', bad.join(' | '))
}

section('13. 完整饮食计划')
{
  const e = calc.energyPlan(P, {})
  const d = pro.dietPlan(P, e, { method: METHOD })
  ok(Array.isArray(d.schools.list) && d.schools.list.length === 3, '给出三套口径', String(d.schools.list.length))
  // ⛔ 每一套都必须写清出处 —— 用户就是为「来源不明」发的火，这条是护栏
  const noFrom = d.schools.list.filter(x => !x.from || x.from.indexOf('《') < 0)
  ok(noFrom.length === 0, '每一套都标了原文出处（《…》）', noFrom.map(x => x.name).join('、'))
  const noNum = d.schools.list.filter(x => !x.carb || !x.protein || !x.fat)
  ok(noNum.length === 0, '每一套都给全了碳水/蛋白/脂肪', noNum.map(x => x.name).join('、'))
  ok(!d.cycle, '旧的「×1.15 / ×0.85」推演碳水循环已彻底移除')
  ok(d.schools.list.filter(x => x.recommended).length === 1, '恰好推一套当建议起点')

  // 数字必须跟 skill 里的原文对得上
  const by = k => d.schools.list.filter(x => x.key === k)[0]
  ok(/2\.2/.test(by('balanced').carb) && /3\.5/.test(by('balanced').carb),
    '均衡档碳水 2.2–3.5 g/kg（谭成义原文）', by('balanced').carb)
  ok(/6/.test(by('cycle').carb) && /1\.8/.test(by('cycle').carb),
    '碳水循环档含 6 倍与 1.8 倍（原文倍数序列）', by('cycle').carb)
  ok(/0\.4/.test(by('cycle').fat), '碳水循环档脂肪 0.4–0.6 倍（原文）', by('cycle').fat)
  ok(/一半/.test(by('gain').carb), '增肌档「碳水占一半热量」（凯圣王原文）', by('gain').carb)
  ok(/凯圣王/.test(by('gain').from), '增肌档出处标的是凯圣王', by('gain').from)

  ok(d.protein === e.protein, '蛋白仍来自引擎按档案算的值')
  ok(d.meals.length === METHOD.DIET.meals.length, '分餐数一致')
  const sum = d.meals.reduce((s, m) => s + m.carb, 0)
  ok(Math.abs(sum - d.base.carb) <= 25, '各餐碳水合计 ≈ 全天碳水', sum + ' vs ' + d.base.carb)
  ok(d.water > 2 && d.water < 5, '93kg 饮水量落在 2-5L', String(d.water))
  ok(/不构成医疗建议/.test(d.disclaimer), '带免责声明')
  ok(/减载周热量<b>不用改<\/b>/.test(d.cycleNote), '写清了周期内怎么微调')
}

section('14. 会员状态（服务端权威）')
{
  const day = 86400000
  const future = new Date(Date.now() + 10 * day).toISOString()
  const past = new Date(Date.now() - day).toISOString()

  ok(pro.isPro({ member: { level: 'pro', expiresAt: future } }) === true, '有效 pro → 已开通')
  ok(pro.isPro({ member: { level: 'coach', expiresAt: future } }) === true, 'coach 也算已开通（更高一档）')
  ok(pro.isCoach({ member: { level: 'coach', expiresAt: future } }) === true, 'coach 档能识别')
  ok(pro.isCoach({ member: { level: 'pro', expiresAt: future } }) === false, 'pro 档不算 coach')
  ok(pro.isPro({ member: { level: 'pro', expiresAt: past } }) === false, '★ 过期即失效')
  ok(pro.isPro({ profile: { tier: 'pro' } }) === false, '★ 只改 profile.tier 不再能开通（白嫖入口已堵）')
  ok(pro.isPro({}) === false, '没有 member → 未开通')
  ok(pro.isPro(null) === false, '无用户 → 未开通')
  ok(pro.isPro({ member: { level: 'pro', expiresAt: '不是日期' } }) === false, '到期时间解析不出来 → 当失效')
  ok(pro.isPro({ member: { level: '', expiresAt: future } }) === false, '没有等级 → 未开通')

  const m = pro.memberOf({ member: { level: 'coach', expiresAt: future } })
  ok(m.valid === true && m.level === 'coach', 'memberOf 解析等级')
  ok(m.days >= 9 && m.days <= 10, '剩余天数算得对', String(m.days))
  ok(!!m.name, '等级有中文名', m.name)
  ok(pro.memberOf({}).valid === false && pro.memberOf({}).days === 0, '无会员 → 0 天')
  ok(pro.memberOf(null).valid === false, 'memberOf(null) 不崩')

  // 前端不该再持有任何口令 —— 连哈希都不留
  ok(typeof pro.checkCode === 'undefined' && typeof pro.setTier === 'undefined',
    '★ 前端口令校验已删（checkCode / setTier）')
  ok(typeof pro.CODE_HASH === 'undefined', '★ 口令哈希已从客户端移除')
  ok(!!pro.LEVELS && !!pro.LEVELS.pro && !!pro.LEVELS.coach, '两档定价表存在')
  ok(pro.LEVELS.coach.price > pro.LEVELS.pro.price, 'AI 顾问档比完整版贵')
}

// ─────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('  完整版（付费层）测试：' + pass + ' 通过 / ' + fail + ' 失败')
console.log('═'.repeat(60))
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); process.exit(1) }
console.log('  ✅ 全部通过')
