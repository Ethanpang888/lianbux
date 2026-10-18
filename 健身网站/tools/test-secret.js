#!/usr/bin/env node
/**
 * tools/test-secret.js —— 秘籍（内容 + 一键换计划）逻辑测试
 *
 * 为什么需要：秘籍是变现主体，「用这本」会**真的改用户的 goal 和计划**。
 * preset 写错一个字母，用户点下去就是白屏或者计划错乱。
 *
 * 跑法：node tools/test-secret.js
 */
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const KBROOT = path.resolve(ROOT, '..', '健身小程序')
const secret = require(path.join(ROOT, 'shared', 'secret.js'))
const kb = require(path.join(KBROOT, 'utils', 'kb.js'))

let pass = 0, fail = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name) }
  else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')) }
}
const section = t => console.log('\n── ' + t + ' ──')

const P = { gender: '男', age: 35, height: 183, weight: 93, goal: '增肌减脂同步', exp: '进阶', days: 4, bodyType: '中性', activity: 'mod' }

section('1. 导出与结构')
{
  ok(typeof secret.get === 'function' && typeof secret.list === 'function', 'get / list 已导出')
  ok(typeof secret.applyTo === 'function' && typeof secret.currentOf === 'function', 'applyTo / currentOf 已导出')
  ok(secret.SECRETS.length >= 8, '秘籍 ≥8 本（4 本目标类 + 三分化/四分化/居家四分化/五分化）', String(secret.SECRETS.length))
  const keys = secret.SECRETS.map(s => s.key)
  ok(keys.indexOf('fatloss') >= 0 && keys.indexOf('gain') >= 0 && keys.indexOf('recomp') >= 0,
    '减脂 / 增肌 / 同步三本的 key 都在', keys.join(','))

  const bench = secret.get('bench')
  ok(!!bench, '★ 卧推增力那本已补上（原来素材不够，一直欠着）')
  ok(!!bench && bench.weeks === 6, '卧推那本是 6 周周期')
  ok(!!bench && bench.train.some(x => /肩/.test(x.t + x.d)), '★ 覆盖「推不上去先查肩」这条隐藏原因')
  ok(!!bench && bench.train.some(x => /冈上肌/.test(x.t + x.d)), '有冈上肌的具体处方（不是「注意姿势」这种空话）')
  ok(!!bench && bench.train.some(x => /空罐测试/.test(x.d)), '有肩胛下肌的自测方法')
  ok(!!bench && bench.train.some(x => /抽筋|内收肌/.test(x.t + x.d)), '有腿抽筋这类细节')
  ok(!!bench && /ATP/.test(bench.theory.map(x => x.t + x.d).join('')), '讲清了力量靠 ATP（有生理依据）')
  ok(secret.ROADMAP.every(x => x.name !== '卧推增力秘籍'), 'ROADMAP 里已把卧推那本划掉')
  ok(secret.ROADMAP.length >= 1, '还没做的几本有登记（瘦脸：无素材硬写是贩卖焦虑）', String(secret.ROADMAP.length))
  ok(secret.ROADMAP.every(x => x.name && x.why && x.why.length > 10),
    '每本没做的都写清了「为什么没做」（不是拖着不说）')
}

section('2. 内容完整性与出处纪律')
{
  const bad = []
  secret.SECRETS.forEach(s => {
    if (!s.name || !s.tagline || !s.forWho) bad.push(s.key + ' 缺基本信息')
    if (!s.weeks || s.weeks < 2) bad.push(s.key + ' 周数不合理')
    if (!s.solves || s.solves.length < 3) bad.push(s.key + ' solves 少于 3 条')
    if (!s.outline || s.outline.length < 4) bad.push(s.key + ' 大纲少于 4 周')
    if (!s.sources || s.sources.length < 3) bad.push(s.key + ' 出处少于 3 条')
    ;['theory', 'eat', 'train'].forEach(k => {
      const rows = s[k] || []
      if (rows.length < 3) bad.push(s.key + '.' + k + ' 少于 3 条')
      rows.forEach(x => {
        if (!x.t) bad.push(s.key + '.' + k + ' 有条目缺标题')
        if (!x.d || x.d.length < 8) bad.push(s.key + '.' + k + ' 有条目缺说明')
        // ⛔ 出处纪律：用户就是为「来源不明」发的火
        if (!x.from) bad.push(s.key + '.' + k + '「' + (x.t || '?') + '」缺出处')
      })
    })
  })
  ok(bad.length === 0, '三本秘籍：条目齐全、**每条都有出处**', bad.slice(0, 4).join(' | '))
}

section('3. preset 必须是引擎能吃的合法值')
{
  const bad = []
  secret.SECRETS.forEach(s => {
    const p = Object.assign({}, P, { goal: s.preset.goal })
    try {
      const plan = kb.generatePlan(p, { split: s.preset.split, freq: s.preset.freq, home: false })
      if (!plan || !plan.micro || !plan.micro.length) bad.push(s.key + ' 生成不出计划')
      else {
        // 每一轮都要能渲染出课表
        for (let d = 0; d < plan.micro.length * 2; d++) {
          const day = kb.dayContent(plan, d, p, false)
          if (!day || !day.focus) { bad.push(s.key + ' 第' + (d + 1) + '天渲染失败'); break }
        }
      }
    } catch (e) { bad.push(s.key + ':' + e.message) }
  })
  ok(bad.length === 0, '三本的 preset 都能生成并渲染出完整计划', bad.join(' | '))

  // goal 必须是 method 认识的目标（append 型体态三本不改 goal，goal 为空是设计如此）
  const wrongGoals = secret.SECRETS
    .filter(s => s.kind !== 'append')
    .map(s => s.preset.goal)
  ok(wrongGoals.every(g => ['增肌', '减脂', '增肌减脂同步', '塑形'].indexOf(g) >= 0),
    'preset.goal 都在合法目标里（append 型不设 goal）', wrongGoals.join(','))
  ok(secret.SECRETS.filter(s => s.kind === 'append').every(s => !s.preset.goal),
    'append 型三本不设置 goal（不动用户目标）')
}

section('4. applyTo：换秘籍不能弄丢档案')
{
  const before = Object.assign({}, P)
  const after = secret.applyTo('fatloss', P)
  ok(after && after !== P, '返回的是新对象（不改原档案）')
  ok(JSON.stringify(P) === JSON.stringify(before), '原档案一字未动')
  ok(after.goal === '减脂', '目标换成了减脂', after.goal)
  ok(after.weight === 93 && after.exp === '进阶' && after.gender === '男',
    '体重 / 经验 / 性别等原有字段都保住了')
  ok(secret.applyTo('不存在', P) === null, '未知秘籍返回 null')
  ok(secret.applyTo('gain', null).goal === '增肌', '空档案也能安全套用')

  // 三本换过去，目标都要跟 preset 对上（append 型不动 goal —— goal 保持原样才算对）
  const wrong = secret.SECRETS.filter(s => {
    const g = secret.applyTo(s.key, P).goal
    return s.kind === 'append' ? g !== P.goal : g !== s.preset.goal
  })
  ok(wrong.length === 0, '每本的 goal 都跟 preset 一致（append 型保持原 goal）', wrong.map(s => s.key).join(','))
}

section('5. currentOf：正在用哪本')
{
  ok(secret.currentOf(null) === null, '没档案 → null')
  ok(secret.currentOf({}) === null, '没挑过 → null')
  ok(secret.currentOf({ secret: {} }) === null, 'secret 是空对象 → null')
  const s = secret.currentOf({ secret: { key: 'gain', since: '2026-09-23' } })
  ok(s && s.key === 'gain' && s.name === '增肌秘籍', '挑过之后能取回来', s && s.name)
  ok(secret.currentOf({ secret: { key: '早就删掉的key' } }) === null,
    '换成不存在的 key 时安全返回 null（不会崩）')
}

section('6. get / list')
{
  ok(secret.get('recomp').name === '增肌减脂同步', 'get 能按 key 取')
  ok(secret.get('nope') === null, '取不到返回 null')
  const l = secret.list()
  ok(Array.isArray(l) && l.length === secret.SECRETS.length, 'list 返回全部')
  l[0].name = '改坏了'
  ok(secret.SECRETS[0].name !== '改坏了', 'list 返回的是副本（外部改不坏源数据）')

// ─────────────────────────────────────────────
section('7. append 型专项（体态 3 本 + 部位专项 4 本，2026-10-16 扩充）')
{
  const appends = secret.SECRETS.filter(s => s.kind === 'append')
  ok(appends.length === 7, 'append 型 7 本（圆肩/腰突/肱骨前移 + 腹肌/臀/胸/美背）', String(appends.length))
  ok(appends.filter(s => s.cat === 'posture').length === 3 && appends.filter(s => s.cat === 'focus').length === 4,
    '分类字段正确：体态 3 本 posture、部位 4 本 focus')
  ok(appends.every(s => s.preset.goal === '' && !s.preset.split), 'append 型不动 goal / 不换分化')
  ok(appends.every(s => (s.preset.append || []).length >= 3), '每本都带 ≥3 个动作')
  // ⭐ 动作必须真实在库 —— 名字编了渲染就查无此动作（无图无要领）
  const names = new Set((typeof kb !== 'undefined' && kb.EX) ? kb.EX.map(e => e.name) : [])
  if (names.size) {
    const acts = appends.flatMap(s => (s.preset.append || []).map(a => a.name))
    const missing = acts.filter(n => !names.has(n))
    ok(missing.length === 0, 'append 动作全部真实在动作库里', missing.join(','))
  }
  // 合规红线：腰突那本必须有就医声明，每本都得有出处
  const spine = appends.filter(s => s.key === 'posture2')[0]
  ok(spine && /就医|医生/.test(JSON.stringify(spine.theory)), '腰突本带就医红线')
  ok(appends.every(s => (s.sources || []).length >= 2), '每本 sources ≥2 条')
  ok(appends.every(s => (s.outline || []).length >= 6), '每本大纲 ≥6 周')
  // 每本都有分类（藏经阁 tabs 依赖它）
  ok(secret.SECRETS.every(s => ['home', 'focus', 'posture', 'advanced'].indexOf(s.cat) >= 0),
    '全部 18 本都带合法 cat 字段')
  const home3 = secret.get('home3')
  ok(home3 && home3.preset.home === true && home3.preset.split === 'ppl', '居家三分化 = ppl + home:true')
  const home5 = secret.get('home5')
  ok(home5 && home5.preset.home === true && home5.preset.split === 'five', '居家五分化 = five + home:true')
  const thin = secret.get('thin')
  ok(thin && thin.preset.goal === '减脂' && thin.preset.split === 'cpbsl', '薄肌塑形 = 减脂 + 四分化')
  ok(secret.ROADMAP.length === 1 && secret.ROADMAP[0].name === '瘦脸秘籍',
    'ROADMAP 只剩瘦脸（薄肌/美背已补齐）')
}
}

// ─────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('  秘籍逻辑：' + pass + ' 通过 / ' + fail + ' 失败')
console.log('═'.repeat(60))
if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  · ' + f)); process.exit(1) }
console.log('  ✅ 全部通过')
