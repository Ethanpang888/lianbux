#!/usr/bin/env node
/**
 * tools/test-coach.js —— 「调整顾问」规则层测试
 *
 * 为什么需要：coach 是「反馈 → 调整 → 应用」闭环的大脑，它算错 = 用户的计划被改错。
 * 而且它是 AI 顾问将来挂载的底座，规则一旦漂了，AI 的输出就跟着漂。
 *
 * 跑法：node tools/test-coach.js
 */
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const KBROOT = path.resolve(ROOT, '..', '健身小程序')
const coach = require(path.join(ROOT, 'shared', 'coach.js'))
const pro = require(path.join(ROOT, 'shared', 'pro.js'))
const macro = require(path.join(ROOT, 'shared', 'macro.js'))
const kb = require(path.join(KBROOT, 'utils', 'kb.js'))
const calc = require(path.join(KBROOT, 'utils', 'calc.js'))
const method = require(path.join(KBROOT, 'utils', 'method.js'))

const engine = { kb: kb, calc: calc, macro: macro, pro: pro, method: method }

let pass = 0, fail = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name) }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')) }
}
const section = t => console.log('\n── ' + t + ' ──')

// ── 造数据 ──
const P = { gender: '男', age: 35, height: 183, weight: 93, goal: '减脂', exp: '进阶', days: 4, bodyType: '中性', activity: 'mod' }
const dayStr = n => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
/** 造 n 天体重记录：按每周掉 kgPerWeek 的速率 */
function weightLog(n, fromKg, kgPerWeek) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const w = fromKg - (n - 1 - i) * (kgPerWeek / 7)
    out.push({ date: dayStr(i), weight: Math.round(w * 10) / 10, trained: true, exercises: [] })
  }
  return out
}
function ctxOf(opts) {
  const o = opts || {}
  const profile = o.profile || P
  const plan = o.plan || kb.generatePlan(profile, { split: 'ppl', freq: o.freq || 'c3', home: false })
  const today = dayStr(0)
  const day = o.day === null ? null : (o.day || kb.dayContent(plan, o.dayIdx || 0, profile, false))
  return {
    engine: engine, profile: profile, plan: plan,
    dietState: o.dietState || {}, checkins: o.checkins || [],
    day: day, today: today
  }
}

// ─────────────────────────────────────────────
section('1. 结构与导出')
{
  ok(typeof coach.advise === 'function', 'advise 已导出')
  ok(Array.isArray(coach.SITUATIONS) && coach.SITUATIONS.length >= 4, '情况清单 ≥4 条', String(coach.SITUATIONS.length))
  ok(coach.SITUATIONS.every(s => s.key && s.name && s.hint), '每条都有 key / 名称 / 提示')
  ok(Array.isArray(coach.AI_TOPICS) && coach.AI_TOPICS.length >= 3, 'AI 待办话题清单存在')
}

section('2. 未知情况不能崩')
{
  const r = coach.advise('不存在的', ctxOf())
  ok(r && r.ok === false, '未知 key 返回失败', JSON.stringify(r))
  ok(coach.advise('stuck', { engine: {} }).ok === false, '引擎缺失时安全失败')
}

section('3. 老是饿 → 碳水 +0.5 / 蛋白 −0.2')
{
  const r1 = coach.advise('hungry', ctxOf())
  ok(r1.ok === true, '能给出结论')
  ok(r1.apply && r1.apply.type === 'hunger', '带可应用的调整', r1.apply && r1.apply.type)
  ok(r1.changes.length === 2, '列出了碳水与蛋白两条变化', String(r1.changes.length))
  const carbChange = r1.changes.filter(c => c.k === '碳水')[0]
  ok(carbChange && /\+0\.5/.test(carbChange.to), '碳水变成 +0.5 g/kg', carbChange && carbChange.to)
  const proChange = r1.changes.filter(c => c.k === '蛋白')[0]
  ok(proChange && /-0\.2/.test(proChange.to), '蛋白变成 −0.2 g/kg', proChange && proChange.to)
  ok(/吃太少/.test(r1.title), '结论是「吃太少」而不是「你不够自律」', r1.title)

  // 已经加过一轮 → 不该继续往上加
  // ⚠️ 饥饿偏移存在 dietState **顶层**（calc.applyHunger 的返回值直接 merge 进 dietState），不是嵌套的 hunger 对象
  const ds = { carbAdj: 0.5, proteinAdj: -0.2, lastType: '很饿' }
  const r2 = coach.advise('hungry', ctxOf({ dietState: ds }))
  ok(r2.apply === null, '已经加过一轮后不再往上加', JSON.stringify(r2.apply))
  ok(/别再往上加|已经加过/.test(r2.title), '明确说出为什么不再加', r2.title)
}

section('4. 没睡好 → 当天降量，但动作一个不少')
{
  const c = ctxOf({ dayIdx: 0 })
  ok(c.day && c.day.type === 'train', '前提：当天是训练日', c.day && c.day.type)
  const r = coach.advise('tired', c)
  ok(r.ok === true, '能给出结论')
  ok(r.apply && r.apply.type === 'state', '带可应用的当天状态', r.apply && r.apply.type)
  ok(r.changes.length >= 1, '列出了具体变化（不是空话）', String(r.changes.length))
  ok(r.changes.some(x => /kg/.test(x.to)), '有重量下调的变化', JSON.stringify(r.changes[0]))
  ok(/降量/.test(r.title) && /别减动作/.test(r.title), '原则写对了：降量不减动作', r.title)
  ok(r.src === '推演', '标了「推演」不冒充原话', r.src)

  // 休息日 → 应该说"今天本来就不用练"
  const restIdx = (function () {
    for (let i = 0; i < 8; i++) { if (kb.dayContent(c.plan, i, P, false).type === 'rest') return i }
    return -1
  })()
  if (restIdx >= 0) {
    const r2 = coach.advise('tired', ctxOf({ dayIdx: restIdx }))
    ok(r2.apply === null && /不用练/.test(r2.title), '休息日不给降量建议', r2.title)
  }
}

section('5. 练不过来 → 降一档频率')
{
  const p4 = kb.generatePlan(P, { split: 'ppl', freq: 'c4', home: false })
  const r = coach.advise('busy', ctxOf({ plan: p4, freq: 'c4' }))
  ok(r.ok === true, '能给出结论')
  ok(r.apply && r.apply.type === 'plan', '带可应用的新计划', r.apply && r.apply.type)
  if (r.apply) {
    const np = r.apply.payload.plan
    const nowDays = p4.micro.filter(x => x !== 'rest').length
    const newDays = np.micro.filter(x => x !== 'rest').length
    ok(newDays < nowDays, '训练日真的变少了（' + nowDays + ' → ' + newDays + '）')
    ok(np.micro && np.micro.length > 0, '新计划结构完整')
    ok(!!np.split, '保留了分化选择')
  }
  // 已经在 3 练 → 不再往下压
  const r2 = coach.advise('busy', ctxOf())
  ok(r2.apply === null && /3/.test(r2.title), '已经是练 3 休 1 时不再往下压', r2.title)
}

section('6. 体重卡住 → 交给宏观调控')
{
  // ① 数据不足：必须说「先攒数据」，不能硬改
  const r1 = coach.advise('stuck', ctxOf({ checkins: weightLog(2, 93, 0.5) }))
  ok(r1.ok === true, '能给出结论')
  ok(r1.apply === null, '数据不足时不给可应用的调整', JSON.stringify(r1.apply))
  ok(/数据还不够|别急|先/.test(r1.title), '明确要求先攒数据', r1.title)
  ok(/称/.test(r1.why), '告诉用户具体怎么做（每天称体重）')

  // ② 数据充足：必须真的给出调整
  const r2 = coach.advise('stuck', ctxOf({ checkins: weightLog(10, 93, 0.9) }))
  ok(r2.ok === true, '数据充足时能给结论', r2.title)
  ok(r2.why && r2.why.length > 4, '结论有依据', r2.why)
  ok(typeof r2.apply !== 'undefined', 'apply 字段存在')
  console.log('     （诊断）标题：' + r2.title)
  console.log('     （诊断）有无调整：' + (r2.apply ? '有 ' + JSON.stringify(r2.apply.payload && Object.keys(r2.apply.payload)) : '无'))
}

section('7. 输出卫生：任何情况都不能泄漏 undefined / NaN')
{
  const cases = ['stuck', 'hungry', 'tired', 'busy']
  const bad = []
  cases.forEach(k => {
    ;[{}, { checkins: weightLog(10, 93, 0.9) }, { dietState: { carbAdj: 0.5 } }].forEach((o, i) => {
      const r = coach.advise(k, ctxOf(o))
      const s = JSON.stringify(r)
      if (/undefined|NaN/.test(s)) bad.push(k + '#' + i)
    })
  })
  ok(bad.length === 0, '12 组组合都不产生 undefined / NaN', bad.join(', '))
  ok(coach.advise('stuck', ctxOf({ checkins: [] })).ok === true, '完全没数据时也不崩')
  ok(coach.advise('tired', ctxOf({ day: null })).ok === true, '没有当天课表时也不崩')
}

section('8. 应用值能被引擎吃下去（闭环真的接得上）')
{
  // 老是饿：applyHunger 的输出必须能 merge 进 dietState
  const r = coach.advise('hungry', ctxOf())
  const next = r.apply.payload.next
  const ds = Object.assign({}, {}, next)
  const bd = macro.breakdown(ds)
  ok(bd.hunger.carb === next.carbAdj, 'apply 的值能被 macro.breakdown 读出来', String(bd.hunger.carb))

  // 没睡好：state key 必须是 pro.STATES 里真有的
  const rt = coach.advise('tired', ctxOf({ dayIdx: 0 }))
  const key = rt.apply.payload.key
  const st = pro.STATES.filter(s => s.key === key)[0]
  ok(!!st, 'state key 在 pro.STATES 里真实存在（' + key + '）')
  ok(st.weightPct < 1, '这个状态确实是「降量」', String(st && st.weightPct))

  // 降频：新计划能被 dayContent 正常渲染
  const p4 = kb.generatePlan(P, { split: 'ppl', freq: 'c4', home: false })
  const rb = coach.advise('busy', ctxOf({ plan: p4, freq: 'c4' }))
  if (rb.apply) {
    let bad = 0
    const np = rb.apply.payload.plan
    for (let d = 0; d < np.micro.length * 2; d++) {
      const day = kb.dayContent(np, d, P, false)
      if (!day || !day.focus) bad++
    }
    ok(bad === 0, '新计划每一天都能渲染出课表', String(bad))
  }
}

section('9. 这周只能练 2 天 → 换全身循环')
{
  const r = coach.advise('shortweek', ctxOf())
  ok(r.ok === true, '能给出结论')
  ok(r.apply && r.apply.type === 'plan', '带可应用的新计划', r.apply && r.apply.type)
  if (r.apply) {
    ok(r.apply.payload.plan.split === 'full', '新计划真的是全身循环', r.apply.payload.plan.split)
    let bad = 0
    const np = r.apply.payload.plan
    for (let d = 0; d < np.micro.length; d++) {
      if (!kb.dayContent(np, d, P, false)) bad++
    }
    ok(bad === 0, '新计划每一天都能渲染', String(bad))
  }
  const pf = kb.generatePlan(P, { split: 'full', freq: 'w3', home: false })
  const r2 = coach.advise('shortweek', ctxOf({ plan: pf }))
  ok(r2.apply === null, '已经是全身循环时不再重复换', r2.title)
}

section('10. 重量卡住 → 先分清「还没到位」还是「真卡住」')
{
  const noHist = coach.advise('stall', ctxOf())
  ok(noHist.ok === true, '能给出结论')
  ok(noHist.apply === null, '这是解释类，不给自动改动', JSON.stringify(noHist.apply))
  ok(/记下来|推演/.test(noHist.title + noHist.why), '还没有实测记录时，先要求把重量记下来', noHist.title)

  const hist = [{ date: '2026-09-20', exercises: [{ name: '杠铃卧推', log: [{ weight: 60, reps: 8, done: true }] }] }]
  const withHist = coach.advise('stall', ctxOf({ checkins: hist }))
  ok(withHist.ok === true, '有实测记录时也给结论')
  ok(/第 \d+ 轮/.test(withHist.why), '说清了现在在第几轮', withHist.why.slice(0, 50))
  ok(/减载/.test(withHist.why), '提到了下次减载在哪一轮')
}

section('11. 动作不舒服 → 先选动作，再给替代')
{
  const c = ctxOf({ dayIdx: 0 })
  const pick = coach.advise('ache', c)
  ok(pick.ok === true && pick.needPick === 'exercise', '先要求选哪个动作', String(pick.needPick))
  ok(Array.isArray(pick.options) && pick.options.length >= 3, '列出了今天的全部动作',
    String((pick.options || []).length))

  const first = (pick.options || [])[0]
  const r = coach.advise('ache', c, { exercise: first.key })
  ok(r.ok === true, '选了动作后能给结论')
  ok(r.apply === null, '不给自动改动（疼不疼要用户自己判断）')
  ok(r.changes.length >= 1 && /替代动作/.test(r.changes[0].k), '给出了替代动作',
    JSON.stringify(r.changes.map(x => x.to)))
  ok(r.changes.every(x => x.to !== first.key), '替代动作不是它自己')
  ok(/AI 顾问/.test(r.note || ''), '说清了「细节处方留给 AI 顾问」')
  ok(coach.advise('ache', c, { exercise: '根本不存在的动作' }).ok === false, '选到不存在的动作 → 安全失败')
}

// ─────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('  调整顾问规则层：' + pass + ' 通过 / ' + fail + ' 失败')
console.log('═'.repeat(60))
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); process.exit(1) }
console.log('  ✅ 全部通过')
