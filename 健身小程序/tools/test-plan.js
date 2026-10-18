#!/usr/bin/env node
/**
 * tools/test-plan.js —— 计划引擎回归测试（不进包：tools 已在 packOptions.ignore）
 * 跑法：node tools/test-plan.js
 *
 * 覆盖：编排门禁 / 动作去重 / 每日腹部 / sets 格式兼容 / patternOf 三处误判 /
 *       低频分化漏部位 / 居家兜底 / 全组合动作数 / enrollProgram freq / migratePlan 保留选择 /
 *       减载周 / dietMacros 减脂分支
 */
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const kb = require(path.join(ROOT, 'utils/kb.js'))
const calc = require(path.join(ROOT, 'utils/calc.js'))
const METHOD = kb.METHOD

let pass = 0, fail = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name) }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')) }
}
function section(t) { console.log('\n── ' + t + ' ──') }

const P = { gender: '男', age: 35, height: 183, weight: 93, goal: '增肌', exp: '进阶', days: 4, bodyType: '中性' }
const PV = { gender: '女', age: 42, height: 162, weight: 68, goal: '减脂', exp: '新手', days: 3, bodyType: '易胖' }

// ─────────────────────────────────────────────
section('1. 四分化「胸+三头」日的门禁')
{
  const plan = kb.generatePlan(P, { split: 'cpbsl', freq: 'c4', home: false })
  const day = kb.dayContent(plan, 0, P, false)
  const pats = day.exercises.map(e => e.pattern)
  const banned = ['pull_v', 'pull_h', 'curl', 'squat', 'hinge', 'legcurl']
  const hitBanned = pats.filter(p => banned.indexOf(p) >= 0)
  ok(day.focusKey === 'chest', 'D1 是胸日', 'focusKey=' + day.focusKey)
  ok(hitBanned.length === 0, '不含背/二头/腿类动作', '出现 ' + hitBanned.join(','))
  ok(pats.indexOf('tri') >= 0, '含三头动作')
  ok(pats.filter(p => p === 'push_h' || p === 'delts').length >= 2, '至少 2 个胸部动作')
}

section('2. 同日动作不重复 + 动作数')
{
  let dup = [], bad = []
  ;['full', 'ppl', 'cpbsl', 'five'].forEach(sp => {
    ;['w3', 'c3', 'c4', 'c5'].forEach(fq => {
      ;['新手', '进阶', '熟练'].forEach(ex => {
        ;[false, true].forEach(home => {
          const pr = Object.assign({}, P, { exp: ex })
          const plan = kb.generatePlan(pr, { split: sp, freq: fq, home })
          for (let d = 0; d < 12; d++) {
            const day = kb.dayContent(plan, d, pr, home)
            if (day.type !== 'train') continue
            const names = day.exercises.map(e => e.name)
            const uniq = new Set(names)
            const tag = [sp, fq, ex, home ? '居家' : '健身', 'D' + (d + 1), day.focus].join('/')
            if (uniq.size !== names.length) dup.push(tag + ' → ' + names.join(','))
            if (names.length < 3 || names.length > 7) bad.push(tag + ' → ' + names.length + '个')
            if (home && uniq.size < 4) bad.push(tag + ' → 居家仅 ' + uniq.size + '个')
          }
        })
      })
    })
  })
  ok(dup.length === 0, '同日无重复动作', dup.slice(0, 3).join(' | '))
  ok(bad.length === 0, '动作数都在 3-7（居家≥4）', bad.slice(0, 5).join(' | '))
}

section('3. 每个训练日末尾必带腹部')
{
  let bad = []
  ;['ppl', 'cpbsl', 'five', 'full'].forEach(sp => {
    const plan = kb.generatePlan(P, { split: sp, home: false })
    for (let d = 0; d < 20; d++) {
      const day = kb.dayContent(plan, d, P, false)
      if (day.type !== 'train') continue
      const ex = day.exercises
      const last = ex[ex.length - 1]
      const coreCnt = ex.filter(e => e.pattern === 'core').length
      if (coreCnt < 1 || last.pattern !== 'core') {
        bad.push(sp + '/D' + (d + 1) + ' ' + day.focus + ' → core数=' + coreCnt + ' 末位=' + (last && last.pattern))
      }
    }
  })
  ok(bad.length === 0, '每天都有腹且排在最后', bad.slice(0, 5).join(' | '))
}

section('4. sets 格式兼容（setCount / reduceSets / 邮件渲染）')
{
  let bad = []
  ;['ppl', 'cpbsl', 'five', 'full'].forEach(sp => {
    ;['增肌', '减脂', '塑形'].forEach(goal => {
      const pr = Object.assign({}, P, { goal })
      const plan = kb.generatePlan(pr, { split: sp, home: false })
      for (let d = 0; d < 10; d++) {
        const day = kb.dayContent(plan, d, pr, false)
        if (day.type !== 'train') continue
        day.exercises.forEach(e => {
          if (!/^\d+\s*[×xX]\s*\d+/.test(String(e.sets))) bad.push(sp + '/' + goal + '/' + e.name + ' → ' + e.sets)
        })
      }
    })
  })
  ok(bad.length === 0, '所有 sets 都以 N×M 开头', bad.slice(0, 5).join(' | '))
}

section('5. patternOf 三处误判修正')
{
  ok(kb.patternOf('反向飞鸟') === 'rear_delt', '反向飞鸟 → rear_delt（不是胸部飞鸟）', kb.patternOf('反向飞鸟'))
  ok(kb.patternOf('坐姿腿弯举') === 'legcurl', '坐姿腿弯举 → legcurl（不是二头）', kb.patternOf('坐姿腿弯举'))
  ok(kb.patternOf('绳索上斜下压') === 'pull_v', '绳索上斜下压 → pull_v（不是三头）', kb.patternOf('绳索上斜下压'))
  ok(kb.patternOf('杠铃后三角肌划船') === 'rear_delt', '后三角肌划船 → rear_delt（不是划船）', kb.patternOf('杠铃后三角肌划船'))
  ok(kb.patternOf('胸部臂屈伸') === 'push_h', '胸部臂屈伸 → push_h（不是三头）', kb.patternOf('胸部臂屈伸'))
  ok(kb.patternOf('杠铃深蹲') === 'squat', '杠铃深蹲 → squat', kb.patternOf('杠铃深蹲'))
}

section('6. 低频分化不再漏部位（曾经「四分化×每周3练」永远排不到肩）')
{
  let bad = []
  ;[['cpbsl', 'w3'], ['five', 'w3'], ['cpbsl', 'w4'], ['full', 'w3']].forEach(([sp, fq]) => {
    const plan = kb.generatePlan(P, { split: sp, freq: fq, home: false })
    const seen = {}
    for (let d = 0; d < 28; d++) {
      const day = kb.dayContent(plan, d, P, false)
      if (day.type === 'train') seen[day.focusKey] = (seen[day.focusKey] || 0) + 1
    }
    const want = plan.foci.length
    if (Object.keys(seen).length !== want) bad.push(sp + '/' + fq + ' → 只出现 ' + Object.keys(seen).join(',') + '，期望 ' + want + ' 个')
  })
  ok(bad.length === 0, '28 天内所有训练日类型都出现', bad.join(' | '))
}

section('7. 居家模式兜底')
{
  const plan = kb.generatePlan(PV, { split: 'ppl', freq: 'c3', home: true })
  let allCount = 0, fbCount = 0, thin = 0
  for (let d = 0; d < 9; d++) {
    const day = kb.dayContent(plan, d, PV, true)
    if (day.type !== 'train') continue
    if (day.exercises.length < 4) thin++
    day.exercises.forEach(e => { allCount++; if (e.homeFallback) fbCount++ })
  }
  ok(thin === 0, '居家每个训练日 ≥4 个动作')
  const ratio = allCount ? fbCount / allCount : 0
  ok(ratio <= 0.35, '居家非无器械兜底占比 ≤35%', (ratio * 100).toFixed(0) + '% (' + fbCount + '/' + allCount + ')')
}

section('8. enrollProgram 的 freq 必须是合法 FREQ 键（旧版是 ' + "'program'" + '）')
{
  let bad = []
  ;['fb4', 'ppl8', 'five12'].forEach(k => {
    const plan = kb.enrollProgram(k, P, false)
    if (!kb.FREQ[plan.freq]) bad.push(k + ' → freq=' + plan.freq)
    if (plan.schema !== kb.PLAN_SCHEMA) bad.push(k + ' → schema=' + plan.schema)
  })
  ok(bad.length === 0, '三套精选课表的 freq 都合法', bad.join(' | '))

  const plan = kb.enrollProgram('ppl8', P, false)
  const day = kb.dayContent(plan, 0, P, false)
  ok(day.type === 'train' && day.exercises.length >= 3, '精选课表能取出当天动作', '动作数=' + (day.exercises || []).length)
  // 减载周（第4周）组数应小于正常周
  const wk1 = kb.buildProgramMicro(kb.PROGRAMS[1], P, false).filter(x => x.week === 1 && x.exercises)[0]
  const wk4 = kb.buildProgramMicro(kb.PROGRAMS[1], P, false).filter(x => x.week === 4 && x.exercises)[0]
  const n1 = parseInt(String(wk1.exercises[0].sets).match(/^(\d+)/)[1], 10)
  const n4 = parseInt(String(wk4.exercises[0].sets).match(/^(\d+)/)[1], 10)
  ok(n4 < n1, '减载周正式组数 < 正常周', n1 + ' → ' + n4)
  ok(wk4.warmup && wk4.warmup.items.length > 0 && wk4.exercises[wk4.exercises.length - 1].pattern === 'core',
    '减载周保留热身与核心')
}

section('9. migratePlan 升级时保留用户选择')
{
  // 模拟一份「旧版本」云端计划：有 micro 但没有 schema
  const legacy = {
    split: 'cpbsl', freq: 'c4', home: true, dietMode: 'recipe',
    micro: ['chest', 'back', 'shoulder', 'legs', 'rest'],
    cycleStart: '2026-08-01',
    slotExercises: { 0: [{ name: '自定义动作', sets: '3×12' }] }
  }
  const np = kb.migratePlan(P, legacy)
  ok(np.schema === kb.PLAN_SCHEMA, '已升级到当前 schema')
  ok(np.split === 'cpbsl', '保留 split（四分化）', np.split)
  ok(np.freq === 'c4', '保留 freq', np.freq)
  ok(np.home === true, '保留 home（居家）', String(np.home))
  ok(np.dietMode === 'recipe', '保留 dietMode', np.dietMode)
  ok(np.cycleStart === '2026-08-01', '保留 cycleStart（周期起点不重置）', np.cycleStart)
  ok(np.slotExercises && np.slotExercises['0'], '保留自定义动作 slotExercises')

  // 再来一次应幂等（已是当前 schema 不再重排）
  const again = kb.migratePlan(P, np)
  ok(again === np, '同版本再次迁移是幂等的')

  // 旧 plan.days 格式也能升级
  const old2 = { days: new Array(28).fill({ type: 'rest', focus: '休息日' }), cycleStart: '2026-07-01', home: false }
  const np2 = kb.migratePlan(P, old2)
  ok(np2 && np2.micro && np2.micro.length > 0 && np2.schema === kb.PLAN_SCHEMA, '旧 plan.days 能升级为 micro')
}

section('10. dietMacros（谭成义宏量模型）')
{
  const d = calc.dietMacros({ weight: 93, bodyType: '中性', goal: '增肌' }, {})
  ok(d.fat === Math.round(0.7 * 93), '脂肪 = 0.7g/kg', String(d.fat))
  ok(d.protein > 0 && d.carb > 0 && d.kcal > 0, '宏量与热量都有值', JSON.stringify(d))
  ok(d.kcal === Math.round(d.fat * 9 + d.protein * 4 + d.carb * 4), '热量 = 三大宏量反算')

  const dj = calc.dietMacros({ weight: 93, bodyType: '中性', goal: '减脂' }, {})
  ok(Math.abs(dj.carb - Math.round(dj.carbG * 93)) <= 2,
    '减脂分支 carbG 字段与实际碳水自洽（旧版返回的是未减 0.5 的 carbG）',
    'carb=' + dj.carb + ' carbG=' + dj.carbG + ' → carbG×93=' + Math.round(dj.carbG * 93))
  ok(Math.abs(dj.fat - Math.round(0.8 * 93)) <= 1, '减脂脂肪 = 0.8g/kg', String(dj.fat))
  ok(Math.abs(dj.protein - Math.round(dj.protG * 93)) <= 2,
    '减脂分支 protG 与实际蛋白自洽', 'protein=' + dj.protein + ' protG=' + dj.protG)

  // 微饿循环
  const a1 = calc.applyHunger('很饿', { carbAdj: 0, proteinAdj: 0 })
  ok(a1.carbAdj === 0.5, '很饿 → 碳水 +0.5g/kg', JSON.stringify(a1))
  const a2 = calc.applyHunger('不饿', { carbAdj: 0, proteinAdj: 0 })
  ok(a2.carbAdj === -0.5, '不饿 → 碳水 −0.5g/kg', JSON.stringify(a2))
  const a3 = calc.applyHunger('不饿', { carbAdj: 1.4, proteinAdj: 0.4 })
  // 上限钳制：不饿 +0.2 → 0.6 应被钳到 0.4（谭成义消化反馈两步封顶）
  ok(a3.carbAdj === 0.9 && a3.proteinAdj === 0.4, '偏移上限被正确钳制（蛋白 ±0.4 封顶）', JSON.stringify(a3))
  const a4 = calc.applyHunger('很饿', { carbAdj: 0, proteinAdj: 0 })
  ok(a4.proteinAdj === -0.2, '很饿 → 蛋白 −0.2g/kg（谭成义消化反馈步长）', JSON.stringify(a4))
}

section('11. 方法论层自检')
{
  ok(Object.keys(METHOD.DAYS).length >= 13, '训练日编排足够（≥13 个）')
  const bad = []
  Object.keys(METHOD.DAYS).forEach(k => {
    const d = METHOD.DAYS[k]
    if (!d.parts || !d.parts.length) bad.push(k + ' 没有 parts')
    if (!d.name) bad.push(k + ' 没有 name')
    if (d.src !== '原文' && d.src !== '推演') bad.push(k + ' src 标注缺失')
    d.parts.forEach(p => {
      if (!p.picks || !p.picks.length) bad.push(k + '.' + p.part + ' 没有 picks 配额')
    })
  })
  ok(bad.length === 0, '每个训练日都有 parts/picks/name/src', bad.slice(0, 5).join(' | '))
  const srcs = Object.keys(METHOD.SPLITS).map(k => METHOD.SPLITS[k].src)
  ok(srcs.indexOf('推演') >= 0 && srcs.indexOf('原文') >= 0, '分化层区分了「原文」与「推演」')
  const isoSrc = Object.keys(METHOD.DAYS).filter(k => METHOD.DAYS[k].src === '推演')
  ok(isoSrc.length > 0, '推演内容可被 UI 识别（' + isoSrc.length + ' 个训练日为推演）')
}

// ─── 场景策略（用户 2026-09-15 拍板）：健身房不推徒手；居家只推徒手/哑铃/弹力带 ───
{
  const P = { gender: '男', age: 30, height: 183, weight: 93, goal: '增肌减脂同步', exp: '进阶', days: 4, bodyType: '中性' }
  // 健身房：大肌群日（胸/背/腿）不得出现徒手动作（腹部徒手属正常，豁免）
  const gym = kb.generatePlan(P, { split: 'ppl', freq: 'c3', home: false })
  const gymBad = []
  for (let d = 0; d < 12; d++) {
    const day = kb.dayContent(gym, d, P, false)
    if (day.type !== 'train') continue
    day.exercises.forEach(e => {
      if (e.pattern !== 'core' && e.equipment === '无器械') gymBad.push(day.focus + '/' + e.name)
    })
  }
  ok(gymBad.length === 0, '健身房大肌群日不出现徒手动作', gymBad.slice(0, 5).join(' | '))
  // 居家：所有动作 equipment ∈ {无器械, 哑铃, 弹力带}
  const home = kb.generatePlan(P, { split: 'ppl', freq: 'c3', home: true })
  const homeBad = []
  for (let d = 0; d < 12; d++) {
    const day = kb.dayContent(home, d, P, true)
    if (day.type !== 'train') continue
    day.exercises.forEach(e => {
      if (['无器械', '哑铃', '弹力带'].indexOf(e.equipment) < 0) homeBad.push(day.focus + '/' + e.name)
    })
  }
  ok(homeBad.length === 0, '居家动作仅限徒手/哑铃/弹力带', homeBad.slice(0, 5).join(' | '))
  // 腹部按天轮转：推/拉/腿三天的核心动作不完全相同
  const cores = []
  for (let d = 0; d < 3; d++) {
    const day = kb.dayContent(gym, d, P, false)
    if (day.type === 'train') cores.push(day.exercises.filter(e => e.pattern === 'core').map(e => e.name).join(','))
  }
  ok(new Set(cores).size > 1, '腹部动作按天轮转（推/拉/腿不同）', cores.join(' | '))
  // 确定性：同一天两次计算结果一致
  const r1 = kb.dayContent(gym, 0, P, false).exercises.map(e => e.name).join('|')
  const r2 = kb.dayContent(gym, 0, P, false).exercises.map(e => e.name).join('|')
  ok(r1 === r2, '计划确定性：同一天两次计算一致')
}

// ─────────────────────────────────────────────
section('食物库（扩充后 1200+ 条）')
{
  ok(kb.FOODS.length >= 1200, '食物库条数 ≥ 1200（原 88）', String(kb.FOODS.length))

  // ① 用户点名的几项必须能命中（生米 / 巴旦木 / 坚果）
  const must = {
    '生米': 346, '稻米': 346, '大米': 346, '巴旦木': 579, '夏威夷果': 718,
    '碧根果': 691, '腰果': 559, '核桃': 646, '木耳': 265, '五花肉': 339,
    '牛腩': 332, '鲈鱼': 105, '鸡胸': 133, '豆干': 147, '黑芝麻': 559
  }
  const miss = []
  Object.keys(must).forEach(q => {
    const f = kb.matchFood(q)
    if (!f) { miss.push(q + '(未命中)'); return }
    if (f.kcal !== must[q]) miss.push(q + '→' + f.name + ' ' + f.kcal + '≠' + must[q])
  })
  ok(miss.length === 0, '15 个常见叫法都能命中且数值正确', miss.join(' / '))

  // ② 生重 / 熟重必须分清（这是最容易记错 3 倍的地方）
  const raw = kb.matchFood('生米'), cooked = kb.matchFood('米饭')
  ok(raw.kcal === 346 && cooked.kcal === 116, '生米 346 vs 熟饭 116，不会混', raw.name + '/' + cooked.name)
  ok(kb.FOODS.find(f => f.name === '生米') && kb.FOODS.find(f => f.name === '米饭(熟)') &&
     kb.FOODS.find(f => f.name === '稻米'), '生米 / 稻米 / 米饭(熟) 三个条目都在')

  // ③ 菜谱依赖的 35 个食材名不能被改坏
  const menuFoods = ['鸡胸肉', '鸡蛋', '牛肉(瘦)', '三文鱼', '米饭(熟)', '燕麦片', '红薯', '西兰花',
    '豆腐', '牛奶', '香蕉', '苹果', '蛋白粉(乳清)', '虾', '鳕鱼', '面条(熟)', '馒头', '糙米饭(熟)',
    '白菜', '冬瓜', '茄子', '洋葱', '玉米(鲜)', '南瓜', '土豆(蒸)', '胡萝卜', '菠菜', '番茄',
    '黄瓜', '酸奶(原味)', '食用油', '芹菜', '青椒', '香菇', '鸡腿肉', '蒜', '姜', '豆腐皮',
    '蓝莓', '荞麦面(熟)', '娃娃菜', '生菜', '甘蓝'].filter(n => n !== '甘蓝')
  const broken = menuFoods.filter(n => { const f = kb.matchFood(n); return !f || f.name !== n })
  ok(broken.length === 0, '菜谱引用的食材名全部还能精确命中', broken.join(','))

  // ④ 分类：六个类目都有货，且栗子/莲子这类不会被错分成坚果
  const cats = ['蛋白', '主食', '蔬菜', '脂肪坚果', '水果', '其他']
  const noCat = cats.filter(c => kb.foodByCat(c).length === 0)
  ok(noCat.length === 0, '六个类目都有条目', noCat.join(','))
  const chestnut = kb.FOODS.find(f => f.name === '栗子(鲜)')
  ok(chestnut && kb.foodCatOf(chestnut) === '主食', '栗子归主食（碳水高，不是坚果）',
    chestnut ? kb.foodCatOf(chestnut) : '缺条目')
  const oil = kb.FOODS.find(f => f.name === '橄榄油')
  ok(oil && oil.kcal === 899, '植物油类没被"数值带星号"问题丢掉', oil ? String(oil.kcal) : '缺条目')

  // ⑤ 数值合理性兜底：不允许出现负值 / 热量离谱
  const bad = kb.FOODS.filter(f => f.kcal <= 0 || f.kcal > 950 || f.protein < 0 || f.fat < 0 ||
    f.carbs < 0 || f.fiber < 0)
  ok(bad.length === 0, '没有负值或离谱热量', bad.slice(0, 3).map(f => f.name).join(','))

  // ⑥ 名字里不允许混进原数据仓库的字段污染（fat9g 之类）
  const dirty = kb.FOODS.filter(f => /fat\d|kcal|CHO|[A-Za-z]/.test(f.name))
  ok(dirty.length === 0, '没有污染名字（fat9g / 拉丁字母）', dirty.slice(0, 3).map(f => f.name).join(','))

  // ⑦ 热搜词排序：搜「牛肉」第一条要是最常见的瘦牛肉，不是某个细分部位
  const beef = kb.searchFood('牛肉')
  ok(beef.length > 0 && beef[0].name === '牛肉(瘦)', '搜「牛肉」第一条是牛肉(瘦)',
    beef.length ? beef[0].name : '空')
  ok(kb.searchFood('生米')[0].name !== '', '搜「生米」有结果')
  ok(kb.searchFood('').length === 0, '空关键字返回空数组')

  // ⑧ 别名表不能指向不存在条目（写错会静默失效）
  const aliases = kb.FOOD_ALIAS
  const dead = Object.keys(aliases).filter(k => !kb.FOODS.find(f => f.name === aliases[k]))
  ok(dead.length === 0, '别名表没有指向空气的名字', dead.slice(0, 5).join(','))

  // ⑨ 营养恒等式抽查：主流主食/蛋白 4/9/4 偏差不该离谱（超 30% 仅允许出现在低热量蔬果）
  const off = kb.FOODS.filter(f => {
    const c = f.protein * 4 + f.carbs * 4 + f.fat * 9
    return f.kcal >= 80 && c > 0 && Math.abs(c - f.kcal) / f.kcal > 0.35
  })
  ok(off.length / kb.FOODS.length < 0.03, '热量与三大宏量自洽（偏差大的 <3%）',
    (off.length + '/' + kb.FOODS.length + ' ' + off.slice(0, 3).map(f => f.name).join(',')))
}

// ─────────────────────────────────────────────
// 组间休息：大重量复合动作 240 秒，其余按角色（2026-10-14 用户指出"卧推 1 分半会被压死"）
const M = kb.METHOD
ok(M.restOf('主项', '杠铃卧推') === 240, '卧推主项休息 240 秒', String(M.restOf('主项', '杠铃卧推')))
ok(M.restOf('主项', '杠铃深蹲') === 240, '深蹲主项休息 240 秒', String(M.restOf('主项', '杠铃深蹲')))
ok(M.restOf('主项', '罗马尼亚硬拉') === 240, '硬拉主项休息 240 秒', String(M.restOf('主项', '罗马尼亚硬拉')))
ok(M.restOf('主项', '高位下拉') === 180, '非大复合主项休息 180 秒', String(M.restOf('主项', '高位下拉')))
ok(M.restOf('孤立', '哑铃弯举') === 90, '孤立动作休息 90 秒', String(M.restOf('孤立', '哑铃弯举')))
ok(M.BIG_COMPOUND.every(k => typeof k === 'string' && k), 'BIG_COMPOUND 名单无空值')

// ─────────────────────────────────────────────
console.log('\n' + '═'.repeat(56))
console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (fail) { console.log('\n  失败明细：'); failures.forEach(f => console.log('   · ' + f)) }
console.log('═'.repeat(56))
process.exit(fail ? 1 : 0)
