/* shared/coach.js —— 「调整顾问」的规则层：把用户的模糊感受，翻成可执行的计划调整
 *
 * ── 分层（2026-09-23 与用户定的路线）──
 *   规则层（本文件）——「能算的」：体重趋势 / 饥饿反馈 / 当天状态 / 训练频率
 *   AI 层（后接）    ——「要知识的」：「卧推肩膀不舒服怎么办」「背哪里弱怎么练」
 *   分界线：凡是能用现有数据算出来的，绝不让模型去猜。算得出来 = 快、准、免费、不会胡说。
 *
 * ── 为什么要有这一层 ──
 *   用户要的闭环是「反馈 → 给调整 → 确认 → 同步进计划」。
 *   这条闭环的八成内容根本不需要大模型：引擎里早就能算（macro.review / calc.applyHunger /
 *   pro.applyState / kb.generatePlan）。把它们收成一个统一入口，AI 以后只需要挂在两头
 *   （听懂人话 + 把结论说成人话），成本和胡说风险都压到最低。
 *
 * ── 零依赖 ──
 *   引擎通过 ctx.engine 传进来。**不能 require 别的模块** —— test-pages 的沙箱里没有 require。
 */

const COACH_VERSION = 1
const SRC = { YUAN: '原文', TUI: '推演' }

/** 可点选的情况（第一屏就这些，都是能算的） */
const SITUATIONS = [
  { key: 'stuck', name: '体重卡住了', hint: '两周没怎么动', need: 'weight' },
  { key: 'hungry', name: '最近老是饿', hint: '尤其晚上想吃碳水', need: '' },
  { key: 'tired', name: '没睡好 / 很累', hint: '今天练不动', need: '' },
  { key: 'busy', name: '练不过来了', hint: '想从练 4 休 1 降到练 3 休 1', need: '' },
  { key: 'shortweek', name: '这周只能练 2 天', hint: '出差 / 加班，次数少也别断', need: '' },
  { key: 'stall', name: '重量涨不上去了', hint: '卡在同一重量好几轮', need: '' },
  { key: 'ache', name: '有个动作不舒服', hint: '肩膀 / 手肘 / 腰', need: 'exercise' }
]

const AI_TOPICS = ['卧推时肩膀 / 手肘不舒服', '背哪里弱、怎么专门补', '某个动作找不到发力感', '深蹲膝盖响']

function signed(v, unit) {
  const n = Math.round((Number(v) || 0) * 100) / 100
  return (n > 0 ? '+' : '') + n + (unit || '')
}
function fail(msg) { return { ok: false, msg: msg || '算不出来' } }
function ok(o) { o.ok = true; return o }

/** 当前第几轮循环（与 kb 的 day.week 同一套口径：一轮 = micro 走完一遍） */
function weekOf(E, plan, today) {
  if (!plan || !plan.micro || !plan.micro.length) return 1
  try {
    const idx = Math.max(0, E.calc.dayIndexFromStart(plan.cycleStart || today, today))
    return Math.floor(idx / plan.micro.length) + 1
  } catch (e) { return 1 }
}

// ───────────────────────── 各情况的规则 ─────────────────────────

/** 体重卡住 → 交给饮食宏观调控（它已经在看 7–10 天趋势了） */
function stuck(E, ctx) {
  let rev
  try {
    rev = E.macro.review({
      checkins: ctx.checkins || [],
      profile: ctx.profile || {},
      dietState: ctx.dietState,
      today: ctx.today
    })
  } catch (e) { return fail('算不出来：' + ((e && e.message) || e)) }

  const p = rev.progress || {}
  if (!rev.ready) {
    return ok({
      title: '数据还不够，先别急着改',
      why: '现在有 ' + (p.havePoints || 0) + '/' + (p.needPoints || 4) + ' 次体重记录、跨 ' +
        (p.haveDays || 0) + '/' + (p.needDays || 7) + ' 天。每天早上起床空腹称一次，攒够了我才敢动数字 —— ' +
        '凭一两天的波动改饮食，只会越改越乱。',
      changes: [], apply: null, src: SRC.YUAN
    })
  }
  if (rev.verdict === 'on_track' || !rev.action) {
    return ok({
      title: rev.headline || '节奏正好，先别动',
      why: rev.message || rev.reason || '趋势在目标区间里，这个时候动热量反而坏事。',
      changes: [], apply: null, src: SRC.YUAN
    })
  }
  return ok({
    title: rev.headline || '该调一下热量了',
    why: rev.message || '',
    changes: [
      { k: '每日热量杠杆', from: signed(rev.action.kcalBefore, ' kcal'), to: signed(rev.action.kcalAfter, ' kcal') },
      { k: '碳水', from: '不动', to: signed(rev.action.carbGrams, ' g') }
    ],
    apply: { type: 'macro', payload: { rev: rev } },
    src: SRC.YUAN
  })
}

/** 老是饿 → 饥饿反馈（日级、感性，谭成义口径） */
function hungry(E, ctx) {
  const bd = E.macro.breakdown(ctx.dietState)
  const cur = bd.hunger.carb
  if (cur >= 0.5) {
    return ok({
      title: '已经加过一轮了，别再往上加',
      why: '碳水偏移现在 +' + cur + ' g/kg。再加就出目标区间了 —— 按现在的吃满 7 天，让体重说话。' +
        '（一直饿也可能是睡太少，睡眠那头的账得单独算）',
      changes: [], apply: null, src: SRC.YUAN
    })
  }
  const next = E.calc.applyHunger('很饿', ctx.dietState || {})
  return ok({
    title: '这是吃太少的信号，不是意志力问题',
    why: '谭成义口径：很饿且渴望干净碳水 → 碳水 +0.5 g/kg、蛋白 −0.2（蛋白有 1.4 的下限兜着，掉不下去）。' +
      '固定吃 7 天再评，别天天改。',
    changes: [
      { k: '碳水', from: signed(cur, ' g/kg'), to: signed(next.carbAdj, ' g/kg') },
      { k: '蛋白', from: signed(bd.hunger.protein, ' g/kg'), to: signed(next.proteinAdj, ' g/kg') }
    ],
    apply: { type: 'hunger', payload: { next: next } },
    src: SRC.YUAN
  })
}

/** 没睡好 → 当天降量（改量不改动作，绝不靠缩短组间休息换时间） */
function tired(E, ctx) {
  const day = ctx.day
  if (!day || day.type !== 'train') {
    return ok({
      title: '今天本来就不用练',
      why: '休息日。把觉补回来就是今天最该做的调整。',
      changes: [], apply: null, src: SRC.YUAN
    })
  }
  const base = E.pro.applyState(day, ctx.profile, ctx.checkins || [], 'ok')
  const st = E.pro.applyState(day, ctx.profile, ctx.checkins || [], 'tired')
  const changes = []
  st.list.forEach((x, i) => {
    const b = base.list[i] || {}
    if (x.weight > 0 && b.weight > 0 && x.weight !== b.weight) {
      changes.push({ k: x.name, from: b.weight + ' kg', to: x.weight + ' kg' })
    } else if (x.setsN !== b.setsN) {
      changes.push({ k: x.name + ' · 组数', from: b.setsN + ' 组', to: x.setsN + ' 组' })
    }
  })
  return ok({
    title: '今天降量，但别减动作',
    why: st.note,
    changes: changes,
    apply: { type: 'state', payload: { key: 'tired' } },
    src: SRC.TUI
  })
}

/** 练不过来 → 降一档频率（重排计划，持久生效） */
function busy(E, ctx) {
  const plan = ctx.plan
  if (!plan || !plan.micro || !plan.micro.length) return fail('还没有计划，先去建档')
  const nowDays = plan.micro.filter(x => x !== 'rest').length
  if (nowDays <= 3) {
    return ok({
      title: '你已经在练 3 休 1 了',
      why: '再往下压到 2 练，部位就轮不过来了 —— 反而不如保持现在的频率、每次少练一会儿。' +
        '真要赶时间，优先保住主项，砍辅助的组数。',
      changes: [], apply: null, src: SRC.TUI
    })
  }
  let np
  try {
    np = E.kb.generatePlan(ctx.profile || {}, {
      split: plan.split, freq: 'c3', home: !!plan.home, dietMode: plan.dietMode
    })
  } catch (e) { return fail('排不出来：' + ((e && e.message) || e)) }
  np.cycleStart = plan.cycleStart || ctx.today
  const nextDays = np.micro.filter(x => x !== 'rest').length
  return ok({
    title: '把节奏从「练 ' + nowDays + ' 休 ' + (plan.micro.length - nowDays) +
      '」降到「练 3 休 1」',
    why: '一轮从 ' + plan.micro.length + ' 天压到 ' + np.micro.length + ' 天：推、拉、腿各练一次，' +
      '肩并进推日。每次练的内容不变 —— 减的是次数，不是强度。减频率不减强度，才不掉肌肉。',
    changes: [
      { k: '一轮天数', from: plan.micro.length + ' 天', to: np.micro.length + ' 天' },
      { k: '训练日', from: nowDays + ' 练', to: nextDays + ' 练' }
    ],
    apply: { type: 'plan', payload: { plan: np } },
    src: SRC.TUI
  })
}

/** 这周只能练 2 天 → 换成全身循环（次数少的时候，拆分化反而是负担） */
function shortweek(E, ctx) {
  const plan = ctx.plan
  if (!plan || !plan.micro || !plan.micro.length) return fail('还没有计划，先去建档')
  if (plan.split === 'full') {
    return ok({
      title: '你已经是全身循环了',
      why: '全身循环本来就是给时间少的人准备的 —— 一周挑 2-3 天，每次把推、拉、腿都过一遍就够，' +
        '不必因为少练一天就换计划。真要赶时间，保住每次的第一个动作（主项），砍辅助的组数。',
      changes: [], apply: null, src: SRC.YUAN
    })
  }
  let np
  try {
    np = E.kb.generatePlan(ctx.profile || {}, {
      split: 'full', freq: 'w3', home: !!plan.home, dietMode: plan.dietMode
    })
  } catch (e) { return fail('排不出来：' + ((e && e.message) || e)) }
  np.cycleStart = plan.cycleStart || ctx.today
  const nowName = (((E.method || {}).SPLITS || {})[plan.split] || {}).name || plan.split
  return ok({
    title: '这周只练得上 2 次？换成全身循环',
    why: '次数少的时候，拆分化的代价是每个部位都练不到位 —— 一周轮不完一圈，等于哪个都没练透。' +
      '全身循环每次推、拉、腿各来一个，一周来 2-3 次，相同时间内覆盖得更全。',
    changes: [
      { k: '分化', from: nowName, to: '全身循环' },
      { k: '一周练几次', from: plan.micro.filter(x => x !== 'rest').length + ' 练', to: '挑 2-3 天' }
    ],
    apply: { type: 'plan', payload: { plan: np } },
    src: SRC.YUAN
  })
}

/** 重量涨不上去 → 先分清「还没到那一步」还是「真卡住」 */
function stall(E, ctx) {
  const plan = ctx.plan
  if (!plan || !plan.micro || !plan.micro.length) return fail('还没有计划，先去建档')
  const hist = ctx.checkins || []
  const presc = E.pro.todayPrescription(ctx.day, ctx.profile, hist)
  const main = (presc.list || []).filter(x => x.role === '主项')[0]
  if (main && main.src === '推演') {
    return ok({
      title: '先把重量记下来，才谈得上「卡住」',
      why: '现在给你的还是估算出来的起点（标「推演」那个）。练完把实际用的重量填回去，' +
        '攒 2-3 轮之后我才能分出来：是真卡住了，还是本来就还没练到位。',
      changes: [], apply: null, src: SRC.YUAN
    })
  }
  const week = weekOf(E, plan, ctx.today)
  const everyWk = (((E.method || {}).DELOAD || {}).everyWeeks) || 4
  const pos = ((week - 1) % everyWk) + 1
  const ct = E.pro.cycleTable(plan, ctx.profile, { rounds: everyWk * 2, week: week, method: E.method })
  const round = ct.rounds[(week - 1) % ct.rounds.length] || ct.rounds[0]
  const isDeload = week % everyWk === 0
  const nextDeload = isDeload ? week + everyWk : week + (everyWk - pos + 1)
  return ok({
    title: '重量是逐轮加的，别自己跳档',
    why: '你现在第 ' + week + ' 轮（' + round.phase + '），主项该练 ' + round.sets.主项 +
      '。这一轮的目标重量在「今天的处方」里 —— 如果连目标次数都做不满，' +
      '就别加重量，先把组数练满。下次减载在第 ' + nextDeload + ' 轮；减载轮只砍组数、不降重量。',
    changes: [], apply: null, src: SRC.YUAN
  })
}

/** 有个动作不舒服 → 只给「换个动作」的建议（真正的处方是知识库的活） */
function ache(E, ctx, opts) {
  const day = ctx.day
  if (!day || day.type !== 'train') {
    return ok({
      title: '今天是休息日', why: '没有动作要调。真不舒服就先歇着，别硬练。',
      changes: [], apply: null, src: SRC.YUAN
    })
  }
  const list = day.exercises || []
  if (!list.length) return ok({ title: '今天没有动作', why: '', changes: [], apply: null, src: SRC.YUAN })

  const pick = opts && opts.exercise
  if (!pick) {
    return {
      ok: true, needPick: 'exercise',
      title: '哪个动作不舒服？',
      why: '选一个，我给你找同部位、但更省关节的替代动作。',
      options: list.map(e => ({ key: e.name, name: e.name, role: e.role || '' })),
      changes: [], apply: null, src: SRC.YUAN
    }
  }

  const ex = list.filter(x => x.name === pick)[0]
  if (!ex) return fail('今天没有「' + pick + '」这个动作')
  const lib = E.kb.EX || []
  const cur = lib.filter(x => x.name === pick)[0] || {}
  const names = lib
    .filter(x => x.name !== pick && cur.part && x.part === cur.part)
    .sort((a, b) => ((b.mainstream ? 1 : 0) - (a.mainstream ? 1 : 0)))
    .slice(0, 3)
    .map(x => x.name)

  return ok({
    title: '先别硬顶，换个动作试试',
    why: (names.length
      ? '「' + pick + '」先停一停。同部位可以换成：' + names.join('、') +
        '。换过去后先把重量降下来做两组，看还疼不疼 —— '
      : '今天这个部位没有合适的替代动作，先降重量做，做完还疼就直接跳过。') +
      '不疼了说明是动作角度的问题；还疼就不是换动作能解决的，是能力或恢复的问题。',
    changes: names.map((n, i) => ({ k: '替代动作 ' + (i + 1), from: pick, to: n })),
    apply: null,
    note: '具体是哪块肌肉不够、该练什么补上（比如「卧推肩不适，常先判是不是肌腹力量不足」），' +
      '属于知识库的活 —— 等 AI 顾问上线专门讲。',
    src: SRC.YUAN
  })
}

// ───────────────────────── 入口 ─────────────────────────

/** 算一个情况该怎么办。ctx = { engine, profile, plan, dietState, checkins, day, today }
 *  opts 目前只用于 ache（需要先知道是哪个动作不舒服） */
function advise(key, ctx, opts) {
  const c = ctx || {}
  const E = c.engine || {}
  if (!E.calc || !E.kb || !E.macro || !E.pro) return fail('引擎没加载完整')
  switch (key) {
    case 'stuck': return stuck(E, c)
    case 'hungry': return hungry(E, c)
    case 'tired': return tired(E, c)
    case 'busy': return busy(E, c)
    case 'shortweek': return shortweek(E, c)
    case 'stall': return stall(E, c)
    case 'ache': return ache(E, c, opts || {})
    default: return fail('这个情况还没做')
  }
}

/** 首页/入口用：哪些情况现在能算 */
function situationList() { return SITUATIONS.slice() }

module.exports = {
  COACH_VERSION, SRC, SITUATIONS, AI_TOPICS,
  signed, weekOf, advise, situationList
}
