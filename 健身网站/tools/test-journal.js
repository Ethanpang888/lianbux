#!/usr/bin/env node
/**
 * tools/test-journal.js —— 训练日志（一句话 + 照片 + 突破识别）回归测试
 * 跑法：node tools/test-journal.js
 *
 * 这个模块管两件"错了会很难看"的事：
 *   ① 突破识别 —— 认错了就是在骗用户（把普通训练吹成 PR），或者漏掉真突破
 *   ② 照片本机配额 —— 算错了会撑爆 localStorage，把用户所有打卡数据一起搞丢
 */
const path = require('path')
const J = require(path.join(__dirname, '..', 'shared', 'journal.js'))

let pass = 0, fail = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name) }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')) }
}
function section(t) { console.log('\n── ' + t + ' ──') }

const ex = (name, sets) => ({ name, log: sets.map(([w, r, d]) => ({ weight: w, reps: r, done: d !== false })) })

// ─────────────────────────────────────────────
section('1. 突破识别：只认真突破')
{
  const hist = [{ date: '2026-09-10', exercises: [ex('卧推', [[80, 8]])] }]
  const prs = J.findPRs([ex('卧推', [[85, 6]])], hist)
  ok(prs.length === 1 && prs[0].kind === 'weight', '重量提高 → 报突破', JSON.stringify(prs[0]))
  ok(prs[0].delta === 5, '加了多少算得对（+5kg）', String(prs[0].delta))
  ok(/85kg/.test(J.prText(prs[0])) && /重了 5kg/.test(J.prText(prs[0])), '文案说清了新重量和增量', J.prText(prs[0]))

  ok(J.findPRs([ex('卧推', [[75, 8]])], hist).length === 0, '重量降了 → 不报突破')
  ok(J.findPRs([ex('卧推', [[80, 6]])], hist).length === 0, '同重量次数更少 → 不报突破')
  const repPR = J.findPRs([ex('卧推', [[80, 9]])], hist)
  ok(repPR.length === 1 && repPR[0].kind === 'reps', '同重量多做 1 次 → 报次数突破', JSON.stringify(repPR[0]))
  ok(/多了 1 次/.test(J.prText(repPR[0])), '次数突破文案正确', J.prText(repPR[0]))
}

section('2. 突破识别：边界与陷阱')
{
  // 历史里同重量做过 10 次，今天 80×8 不该报
  const h2 = [{ date: '2026-09-10', exercises: [ex('卧推', [[80, 10]])] }]
  ok(J.findPRs([ex('卧推', [[80, 8]])], h2).length === 0, '严格比历史最好成绩（不只看上一次）')

  // 历史分散在多天：取最大值
  const h3 = [
    { date: '2026-09-01', exercises: [ex('深蹲', [[100, 5]])] },
    { date: '2026-09-08', exercises: [ex('深蹲', [[95, 8]])] }
  ]
  ok(J.findPRs([ex('深蹲', [[98, 5]])], h3).length === 0, '对比多天历史里的最重成绩（100 > 98）')
  ok(J.findPRs([ex('深蹲', [[102, 3]])], h3).length === 1, '超过历史最好 → 报')

  // 已有历史时，小重量也记录真实进步（女性/新手线）；20kg 仅限首次记录。
  const h4 = [{ date: '2026-09-01', exercises: [ex('侧平举', [[5, 12]])] }]
  ok(J.findPRs([ex('侧平举', [[6, 12]])], h4).length === 1, '小重量从5到6kg也记真实进步')
  ok(J.findPRs([ex('侧平举', [[6, 12]])], []).length === 0, '首次小重量不报虚假突破')
  ok(J.findPRs([ex('侧平举', [[5, 12]])], h4).length === 0, '小重量相同成绩不重复报突破')
  ok(J.findPRs([ex('侧平举', [[6, 12]])], h4, { minWeight: 5 }).length === 1, '阈值可调，调低就报')

  // 没打勾的组不算
  const prs = J.findPRs([ex('卧推', [[100, 1, false], [80, 8, true]])], [{ date: '2026-09-01', exercises: [ex('卧推', [[75, 8]])] }])
  ok(prs.length === 1 && prs[0].weight === 80, '没打勾的组不参与突破判定', JSON.stringify(prs[0]))
}

section('3. 突破识别：自重动作（引体 / 俯卧撑）')
{
  // 自重动作重量填 0，靠次数比
  const h = [{ date: '2026-09-01', exercises: [ex('引体向上', [[0, 8]])] }]
  const prs = J.findPRs([ex('引体向上', [[0, 10]])], h)
  ok(prs.length === 1 && prs[0].kind === 'reps', '自重动作按次数报突破', JSON.stringify(prs[0]))
  ok(/做到 10 次/.test(J.prText(prs[0])) && !/0kg/.test(J.prText(prs[0])), '自重文案不出现 0kg', J.prText(prs[0]))
  ok(J.findPRs([ex('引体向上', [[0, 8]])], h).length === 0, '自重没进步 → 不报')

  const first = J.findPRs([ex('俯卧撑', [[0, 20]])], [])
  ok(first.length === 1 && first[0].kind === 'first', '第一次记录自重动作也算（≥5 次）', JSON.stringify(first[0]))
  ok(J.findPRs([ex('俯卧撑', [[0, 3]])], []).length === 0, '自重只做 3 次 → 不值得报')

  // 负重自重（引体挂片）走重量逻辑
  const hw = [{ date: '2026-09-01', exercises: [ex('负重引体', [[20, 5]])] }]
  ok(J.findPRs([ex('负重引体', [[25, 5]])], hw).length === 1, '负重引体按重量报')
}

section('4. 日志文本规范化')
{
  ok(J.normalize({}).text === '', '空日志不炸')
  ok(J.normalize(null).text === '', 'null 不炸')
  const long = J.normalize({ text: 'x'.repeat(500) })
  ok(long.text.length === J.J.NOTE_MAX, '正文截到 ' + J.J.NOTE_MAX + ' 字', String(long.text.length))
  ok(J.normalize({ tag: '不存在的标签' }).tag === '', '非法主题被清掉')
  ok(J.normalize({ tag: '突破' }).tag === '突破', '合法主题保留')
  ok(J.hasContent({ text: '  ' }) === false, '全空格不算写了东西')
  ok(J.hasContent({ tag: '心得' }) === true, '只点了主题也算写了')
  const ctrl = J.normalize({ text: 'a\u0001b' })
  ok(ctrl.text === 'ab', '控制字符被清掉')
}

section('5. 日志写回打卡数组（纯函数）')
{
  const base = [{ date: '2026-09-20', trained: true, exercises: [ex('卧推', [[80, 8]])] }]
  const frozen = JSON.stringify(base)
  const after = J.upsertNote(base, '2026-09-21', { text: '今天状态很好', tag: '状态好' })
  ok(JSON.stringify(base) === frozen, '入参没被改动（纯函数）')
  ok(after.length === 2, '没打过卡的日子也能写（会新建一条）')
  ok(after[1].note.text === '今天状态很好', '文本写进去了')
  ok(after[1].date === '2026-09-21' && after[1].trained === false, '新建条目标记为"没练"')

  const upd = J.upsertNote(after, '2026-09-21', { text: '改成这样' })
  ok(upd.length === 2 && upd[1].note.text === '改成这样', '同一天再写 → 覆盖而不是新增')
  ok(upd[1].note.tag === '状态好', '没传的字段保留（局部更新）')

  // 清空要把「主题」也清掉才算真没写（只删正文、还留着'状态好'标签 → 仍算有内容，这是刻意的）
  const tagOnly = J.upsertNote(upd, '2026-09-21', { text: '' })
  ok(tagOnly[1].note && tagOnly[1].note.tag === '状态好', '只删正文不清主题 → 仍算有内容')
  const cleared = J.upsertNote(upd, '2026-09-21', { text: '', tag: '' })
  ok(!cleared[1].note, '正文+主题都清空 → 移除 note 字段（不留空对象）')
  ok(J.upsertNote(base, '2026-09-21', {}).length === 1, '空日志不新增条目')
  ok(J.noteOf({ note: { text: '' } }) === null, 'noteOf 对空日志返回 null')
  ok(J.noteOf({ date: 'x' }) === null, '没日志的打卡返回 null')
}

section('6. 照片配额：别把 localStorage 撑爆')
{
  const mk = (n, kb, at) => ({ k: 'p' + n, kb, at })
  const many = Array.from({ length: 30 }, (_, i) => mk(i, 100, i))
  // 条数闸单独看（把体积闸放宽）
  const ev = J.planEvict(many, 100, { maxItems: 24, maxKB: 99999 })
  ok(ev.length === 7, '31 张 → 按条数上限 24 淘汰最旧 7 张', String(ev.length))
  // 两道闸一起：31 张 ×100KB 淘汰 7 张后 = 2400KB，仍在 2600KB 体积闸内 → 还是 7 张
  ok(J.planEvict(many, 100).length === 7, '条数闸满足后不再多删（体积已够用）',
    String(J.planEvict(many, 100).length))
  // 体积真的超了才继续删：24 张 ×200KB = 4800KB > 2600KB
  const fat = Array.from({ length: 24 }, (_, i) => mk(i, 200, i))
  ok(J.planEvict(fat, 200).length === 12, '体积超限时按旧→新淘汰到 2600KB 以内',
    String(J.planEvict(fat, 200).length))
  ok(ev.indexOf('p0') >= 0 && ev.indexOf('p29') < 0, '淘汰发生在最旧的一端', ev.join(','))
  ok(J.planEvict(mk(1, 100, 1) && [mk(1, 100, 1)], 100).length === 0, '没超限就不删')

  const big = [mk(1, 1500, 1), mk(2, 1500, 2)]
  ok(J.planEvict(big, 10).length === 1, '体积超限 → 从旧的开始删', JSON.stringify(J.planEvict(big, 10)))
  ok(J.planEvict(big, 10, { maxKB: 5000 }).length === 0, '放宽体积上限就不删')

  const pinned = [mk(1, 100, 1), mk(2, 100, 2), mk(3, 100, 3)]
  pinned[0].pinned = true
  const ev2 = J.planEvict(pinned, 100, { maxItems: 1 })
  ok(ev2.indexOf('p1') < 0 || ev2.indexOf('p1') >= 0, '能跑通', ev2.join(','))
  ok(ev2.indexOf('p1') < 0, '钉住的照片（突破那天）不会被删', ev2.join(','))

  ok(J.planEvict(null, 0).length === 0, '空索引不炸')
  ok(J.dataUrlKB('data:image/jpeg;base64,' + 'A'.repeat(1368)) === 1, '1KB 的 base64 体积算得对')
  ok(J.dataUrlKB('') === 0, '空串算 0')
}

section('7. 派生：摘要 / 时间线 / 最近一句话')
{
  const cks = [
    { date: '2026-09-19', trained: true, exercises: [ex('卧推', [[80, 8], [80, 8]])] },
    { date: '2026-09-20', trained: false, exercises: [], note: { text: '加班到 11 点，没练' } },
    { date: '2026-09-21', trained: true, exercises: [ex('卧推', [[85, 6]])], note: { text: '状态爆了', tag: '突破' } },
    { date: '2026-09-22', trained: false, exercises: [] }        // 啥也没有 → 不该出现在时间线
  ]
  const tl = J.timeline(cks)
  ok(tl.length === 3, '时间线只收"有内容的"日子（空打卡排除）', String(tl.length))
  ok(tl[0].date === '2026-09-21' && tl[2].date === '2026-09-19', '倒序排列（最近在前）', tl.map(c => c.date).join(','))

  const st = J.dayStats(cks[2], cks.slice(0, 2))
  ok(st.exercises === 1 && st.sets === 1, '摘要：动作数 / 组数', JSON.stringify({ a: st.exercises, s: st.sets }))
  ok(st.volume === 510, '容量 = 85×6 = 510', String(st.volume))
  ok(st.prCount === 1, '摘要里带上突破数', String(st.prCount))
  ok(J.dayStats(null, []).setCount !== undefined || J.dayStats(null, []).sets === 0, '空打卡的摘要不炸')

  const words = J.latestWords(cks)
  ok(words && words.text === '状态爆了', '「最近一句话」取最近一条有文字的', JSON.stringify(words))
  ok(J.latestWords([{ date: '2026-09-22', trained: true, exercises: [] }]) === null, '都没有文字时返回 null')
}

// ─────────────────────────────────────────────
console.log('\n' + '═'.repeat(56))
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail) { console.log('\n  失败明细：'); failures.forEach(f => console.log('   · ' + f)) }
console.log('═'.repeat(56))
process.exit(fail ? 1 : 0)
