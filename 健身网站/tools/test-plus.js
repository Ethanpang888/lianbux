/* tools/test-plus.js —— 进阶包测试：增力处方数字、疼痛排查结构、权限判定
 * 运行：node tools/test-plus.js
 */
let pass = 0, fail = 0; const failures = []
const ok = (cond, msg, detail) => { if (cond) { pass++ } else { fail++; failures.push(msg + (detail ? ' → ' + detail : '')) } }
const section = t => console.log('\n── ' + t + ' ──')

const plus = require('../shared/plus.js')

section('1. 六周增力处方（自测 50kg）')
{
  const c = plus.strengthCycle('卧推', 50, 2.5)
  ok(!c.error, '正常生成')
  ok(c.oneRM === 62.5, 'Epley 1RM = 62.5（50×1.267）', String(c.oneRM))
  ok(c.target === 67.5, '六周目标 67.5（1RM×1.05 贴 2.5）', String(c.target))
  ok(c.weeks.length === 6, '六周表')
  ok(c.weeks[0].kg === 50 && c.weeks[0].sets === 4 && c.weeks[0].reps === '8', 'W1 = 4×8 @ 50（自测起点）')
  ok(c.weeks[2].kg === 50 && c.weeks[2].reps === '12', 'W3 = 4×12（双渐进顶点）')
  ok(c.weeks[3].kg === 52.5 && c.weeks[3].sets === 5, 'W4 强化 = 5×5 @ 52.5', c.weeks[3].kg + '')
  ok(c.weeks[4].kg === 42.5 && c.weeks[4].sets === 3, 'W5 减载 = 3×5 @ 42.5（×0.6 组 / ×0.8 重）')
  ok(c.weeks[5].kg === 67.5, 'W6 测试目标 = 67.5')
  const phases = c.weeks.map(x => x.phase)
  ok(phases.join(',') === '积累,积累,积累,强化,减载,测试', '三阶段结构（积累→强化→减载+测试）', phases.join(','))
  ok(c.weeks.every(x => x.note && x.note.length > 5), '每周都带执行要点')
}

section('2. 换动作换重量（鲁棒性）')
{
  const c = plus.strengthCycle('硬拉', 77.5)
  ok(c.target === 102.5, '硬拉 77.5 → 目标 102.5', String(c.target))
  const c2 = plus.strengthCycle('哑铃弯举', 12, 1)
  ok(c2.weeks[3].kg === 12.5 || c2.weeks[3].kg === 13, '哑铃 +1 步长：W4 贴 1kg 档', String(c2.weeks[3].kg))
  ok(!!plus.strengthCycle('卧推', 0).error, '无效输入 → 引导自测而非报错')
  ok(!!plus.strengthCycle('卧推', -5).error, '负数 → 拒绝')
  ok(!!plus.strengthCycle('卧推', 'abc').error, '非数字 → 拒绝')
}

section('3. 疼痛排查库结构')
{
  const all = plus.PAIN_CHECKS
  ok(all.length >= 4, '≥4 张排查卡（肘/肩/腰/膝）', all.map(x => x.part).join(','))
  ok(all.every(c => c.id && c.part && c.title && c.cause.length >= 2 && c.steps.length >= 4 && c.redline && c.from),
    '每张卡：cause≥2、steps≥4、redline、from 齐全')
  ok(all.every(c => /医院|就医|评估/.test(c.redline)), '每张卡都有就医红线（安全底线）')
  ok(all.every(c => /谭成义|通用|共识|体系/.test(c.from)), '每张卡都标出处（无出处数字不入站）')
  ok(!all.some(c => /肌腱炎|颈椎病|腰椎间盘突出症|滑膜炎/.test(c.steps.join('') + c.title)),
    '不下诊断术语（只有机制描述）')
}

section('4. 权限判定')
{
  ok(plus.isPlus({ plus: { since: '2026-10-11' } }) === true, '有 plus → 已购')
  ok(plus.isPlus({}) === false, '无 plus → 未购')
  ok(plus.isPlus(null) === false, 'null 不崩')
  ok(plus.isPlus({ plus: {} }) === false, '空 plus → 未购')
}

console.log('\n' + '═'.repeat(56))
console.log('  进阶包测试：' + pass + ' 通过 / ' + fail + ' 失败')
console.log('═'.repeat(56))
if (fail) { console.log('失败项：'); failures.forEach(f => console.log('  · ' + f)); process.exit(1) }
console.log('  ✅ 全部通过')
