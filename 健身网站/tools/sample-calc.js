// tools/sample-calc.js —— 给「定制计划样稿」算真实数字（示例客户：男 30 岁 178/85 减脂）
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..') // 健身知识库/
const kb = require(path.join(ROOT, '健身小程序', 'utils', 'kb.js'))
const calc = require(path.join(ROOT, '健身小程序', 'utils', 'calc.js'))
const pro = require(path.join(__dirname, '..', 'shared', 'pro.js'))
const method = require(path.join(ROOT, '健身小程序', 'utils', 'method.js'))

const P = { gender: '男', age: 30, height: 178, weight: 85, goal: '减脂', exp: '进阶', days: 3, bodyType: '中性', activity: 'mod' }
const plan = kb.generatePlan(P, { split: 'ppl', freq: 'c3', home: false })
const e = calc.energyPlan(P, {})
console.log('=== 能量与宏量 ===')
console.log('kcal:', e.kcal, ' 蛋白:', e.protein + 'g', ' 碳水:', e.carb + 'g', ' 脂肪:', e.fat + 'g')
const dp = pro.dietPlan(P, e, { method })
console.log('饮水:', dp.water, 'L / 推荐档:', dp.schools.list.filter(x => x.recommended)[0].name)

function show(label, d) {
  console.log('\n=== ' + label + ' ===')
  pro.todayPrescription(d, P, []).list.forEach(x => {
    const w = x.weight > 0
      ? (Math.round(x.weight * 10) / 10) + 'kg' + (x.perSide ? '（每只）' : '')
      : '自重'
    console.log((x.name + '  ').slice(0, 18).padEnd(18), (x.sets + '').padEnd(10), w.padStart(10), x.src || '')
  })
}
show('第 1 天 · 推日', kb.dayContent(plan, 0, P, false))
show('第 2 天 · 拉日', kb.dayContent(plan, 1, P, false))
show('第 3 天 · 腿日', kb.dayContent(plan, 2, P, false))
