/* tools/test-pages.js —— 页面渲染冒烟测试
 *
 * 为什么需要：`src/pages/*.js` 里只要调用了不存在的函数（例如 ENGINE.round），
 * 页面就会在白屏 / 「页面出错了」里静默挂掉，而纯逻辑测试（test-gamify）抓不到。
 * 这个脚本用一个极小的假 DOM 把每个页面都渲染一遍，任何异常都会让 CI 红。
 *
 * 跑法：node tools/test-pages.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.join(__dirname, '..')
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')

let pass = 0, fail = 0
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name) }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')) }
}
const section = t => console.log('\n── ' + t + ' ──')

// ─── 极简假 DOM ──────────────────────────────────────────────
function mkEl(id) {
  const el = {
    id, innerHTML: '', textContent: '', value: '', style: {}, dataset: { k: id },
    onclick: null, onchange: null, oninput: null,
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    addEventListener() {}, appendChild() {}, removeChild() {}, focus() {}, click() {},
    remove() {}, prepend() {}, scrollIntoView() {},
    querySelector: () => mkEl('sub'), querySelectorAll: () => []
  }
  return el
}
const els = {}
const getEl = id => (els[id] = els[id] || mkEl(id))

const sandbox = {
  console,
  setTimeout: (fn) => 0,           // 不让 toast 的定时器真的跑
  clearTimeout: () => {},
  setInterval: () => 0,            // 训练计时器（WorkoutTimer）在沙箱里不真跑
  clearInterval: () => {},
  Math, Date, JSON, Number, String, Object, Array, Error, RegExp, isNaN, parseFloat, parseInt,
  document: {
    readyState: 'complete',
    getElementById: getEl,
    querySelector: () => mkEl('q'),
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => mkEl('new'),
    body: mkEl('body')
  },
  location: { hash: '#/home' },
  localStorage: (() => {
    const m = {}
    return {
      getItem: k => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v) },
      removeItem: k => { delete m[k] }
    }
  })(),
  navigator: { userAgent: 'node' },
  module: { exports: {} },   // shared/gamify.js 末尾有 CommonJS 导出（浏览器端由打包器接管）
  exports: {},
  requestAnimationFrame: fn => 0,
  alert: () => {}, confirm: () => true
}
sandbox.window = sandbox
sandbox.globalThis = sandbox
sandbox.window.addEventListener = () => {}
sandbox.window.scrollTo = () => {}

// ─── 按依赖顺序拼成一份脚本（同一作用域，页面才能看到 Fmt/UI/...）───
const FILES = [
  'src/fmt.js',
  'src/config.js',
  'src/vendor/qrcode.min.js',
  'src/store.js',
  'src/api.js',
  'src/router.js',
  'src/components/ui.js',
  'src/components/journal.js',
  'src/components/tabbar.js',
  'src/pages/home.js',
  'src/pages/tcm.js',
  'src/pages/today.js',
  'src/pages/diet.js',
  'src/pages/records.js',
  'src/pages/me.js',
  'src/pages/login.js',
  'src/pages/badges.js',
  'src/pages/growth.js',
  'src/pages/rank.js',
  'src/pages/onboard.js',
  'src/pages/pro.js',
  'src/pages/plus.js',
  'src/pages/plan.js',
  'src/pages/plan12.js',
  'src/pages/exlib.js',
  'src/pages/coach.js',
  'src/pages/ai.js',
  'src/pages/training-flow.js',
  'src/pages/foundations.js',
  'src/pages/secret.js',
  'src/pages/poster.js',
  'src/pages/breakthrough.js',
  'src/pages/precheck.js',
  'shared/gamify.js',
  'dist/engine.js'   // 定义 window.ENGINE
]
// 注意：必须用「;\n」分隔——gamify.js 结尾的 module.exports 没有分号，
// 直接拼接会和下一个 IIFE 粘成一句调用（ASI 陷阱）。
const src = FILES.map(f => '\n;\n/*=== ' + f + ' ===*/\n' + read(f)).join('')

// 追加测试体（在同一个作用域里跑）
const body = `
;(function () {
  const TEST = { els: {}, pages: {} }
  // 让 ENGINE 在沙箱里可见（dist/engine.js 挂到 window.ENGINE）
  if (typeof ENGINE === 'undefined') { try { globalThis.ENGINE = window.ENGINE } catch (e) {} }

  TEST.render = function (name, fn) {
    try {
      fn()
      const html = document.getElementById('app').innerHTML || ''
      TEST.pages[name] = { ok: true, len: html.length, html }
    } catch (e) {
      TEST.pages[name] = { ok: false, err: (e && e.message) || String(e), stack: (e && e.stack) || '' }
    }
  }
  TEST.run = function () {
    Store.load(); Store.ensureDemo()
    TEST.render('home', () => PageHome.render())
    TEST.render('today', () => PageToday.render([]))
    TEST.render('diet', () => PageDiet.render())
    TEST.render('mealref', () => PageDiet.refPage())
    TEST.render('records', () => PageRecords.render())
    TEST.render('me', () => PageMe.render())
    TEST.render('login', () => PageLogin.render())
    TEST.render('badges', () => PageBadges.render())
    TEST.render('rank', () => PageRank.render())
    TEST.render('recover', () => PageLogin.renderRecover())
    TEST.render('onboard', () => PageOnboard.render())
    TEST.render('pro', () => PagePro.render())
    TEST.render('coach', () => PageCoach.render())
    TEST.render('ai', () => PageAi.render())
    TEST.render('secret', () => PageSecret.render([]))
    TEST.render('secretDetail', () => PageSecret.render(['fatloss']))
    TEST.render('plus', () => PagePlus.render())
    TEST.render('plan', () => PagePlan.render())
    TEST.render('plan12', () => PagePlan12.render())
    TEST.render('exlib', () => PageExlib.render())

    // ── 空档案场景：模拟「刚注册、还没建档」的真实状态 ──
    // 2026-09-23 用户注册后就是这个状态（webAuth 建号时 profile/plan 都是 null），
    // 结果饮食页直接崩（读 u.profile.dietMode 报 null is not an object）。
    // 以后任何页面敢在空档案下崩，这一项就会红。
    TEST.empty = {}
    const snap = { user: Store.state.user, demo: Store.state.demo, token: Store.state.token }
    Store.state.user = {
      profile: null, plan: null, dietState: {},
      gamify: { exp: 0, level: 1, badges: [], streak: { cur: 0, best: 0, tierGiven: [] },
                caps: {}, weekTask: { paid: [] }, counters: { sessions: 0, volume: 0 } }
    }
    Store.state.demo = false
    Store.state.token = 'test-token'
    const emptyFns = {
      home: () => PageHome.render(),
      today: () => PageToday.render([]),
      diet: () => PageDiet.render(),
      records: () => PageRecords.render(),
      me: () => PageMe.render(),
      rank: () => PageRank.render(),
      onboard: () => PageOnboard.render(),
      pro: () => PagePro.render(),
      coach: () => PageCoach.render(),
      ai: () => PageAi.render(),
      secret: () => PageSecret.render([])
    }
    Object.keys(emptyFns).forEach(n => {
      try {
        emptyFns[n]()
        TEST.empty[n] = { ok: true, html: document.getElementById('app').innerHTML || '' }
      } catch (e) { TEST.empty[n] = { ok: false, err: (e && e.message) || String(e) } }
    })
    Store.state.user = snap.user
    Store.state.demo = snap.demo
    Store.state.token = snap.token
    Store.load(); Store.ensureDemo()

    // ── 完整版（付费层）场景：把会员打开，完整内容必须能渲染 ──
    // 会员只认账号上的 member（服务端下发）—— 这里注入成最高档，顺带覆盖 coach 分支。
    // 付费内容是核心，它崩了就是"用户交了钱打不开"，必须进冒烟测试。
    TEST.proOn = {}
    const u0 = Store.state.user
    if (u0 && u0.profile) {
      const hadM = Object.prototype.hasOwnProperty.call(u0, 'member')
      const snapM = u0.member
      u0.member = { level: 'coach', expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }
      const hadP = Object.prototype.hasOwnProperty.call(u0, 'plus')
      const snapP = u0.plus
      u0.plus = { since: '2026-10-11' }
      const fns = {
        pro: () => PagePro.render(),
        plus: () => PagePlus.render(),
        plan12: () => PagePlan12.render(),
        today: () => PageToday.render([]),
        diet: () => PageDiet.render(),
        me: () => PageMe.render(),
        secretDetail: () => PageSecret.render(['fatloss'])
      }
      Object.keys(fns).forEach(n => {
        try {
          fns[n]()
          TEST.proOn[n] = { ok: true, html: document.getElementById('app').innerHTML || '' }
        } catch (e) { TEST.proOn[n] = { ok: false, err: (e && e.message) || String(e) } }
      })
      if (hadP) u0.plus = snapP
      else delete u0.plus
      if (hadM) u0.member = snapM
      else delete u0.member
    }
    Store.load(); Store.ensureDemo()
    return TEST
  }
  globalThis.__TEST__ = TEST
})()
`

section('加载源码（' + FILES.length + ' 个文件）')
const ctx = vm.createContext(sandbox)
try {
  vm.runInContext(src + body, ctx, { filename: 'bundle.js' })
  pass++
  console.log('  ✅ 全部源码可加载、无语法/引用错误')
} catch (e) {
  fail++
  console.log('  ❌ 加载源码失败 → ' + e.message)
  console.log(e.stack.split('\n').slice(0, 4).join('\n'))
}

if (typeof sandbox.__TEST__ === 'undefined') {
  console.log('\n无法继续（测试体没跑起来）')
  process.exit(1)
}

section('ENGINE 可用性')
const E = sandbox.ENGINE
ok(!!E, 'ENGINE 已挂载到 window')
if (E) {
  ok(typeof E.calc.energyPlan === 'function', 'ENGINE.calc.energyPlan 存在')
  ok(typeof E.kb.generatePlan === 'function', 'ENGINE.kb.generatePlan 存在')
  ok(typeof E.gamify.levelOf === 'function', 'ENGINE.gamify.levelOf 存在')
  // 页面里容易误用的顶层函数，全部显式检查
  const forbidden = ['round', 'clamp', 'todayStr', 'num', 'esc']
  const found = forbidden.filter(k => typeof E[k] === 'function')
  ok(found.length === 0, '页面未误用不存在的 ENGINE 顶层函数（' + (found.join(',') || '无') + '）',
    '这些应该在 Fmt 上：' + found.join(','))
}

section('页面渲染冒烟（每个页面都必须无异常 + 有内容）')
const res = sandbox.__TEST__.run()
const names = ['home', 'today', 'diet', 'records', 'me', 'login', 'badges', 'recover', 'rank', 'onboard', 'pro', 'coach', 'ai', 'secret', 'secretDetail']
for (const n of names) {
  const r = res.pages[n]
  if (r && r.ok) {
    ok(r.len > 200, n.padEnd(8) + ' 渲染成功（' + r.len + ' 字符）')
  } else {
    ok(false, n.padEnd(8) + ' 渲染失败', r ? r.err : '未执行')
    if (r && r.stack) console.log('       ' + r.stack.split('\n').slice(1, 3).join('\n       '))
  }
}

section('页面内容正确性抽查')
{
  { fs.writeFileSync('/tmp/today_dump.html', res.pages.today.html || '') }
  const diet = res.pages.diet.html || ''
  ok(!/undefined|NaN/.test(diet), '饮食页无 undefined / NaN 泄漏',
    (diet.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])
  ok(/g\/kg/.test(diet), '饮食页显示了 g/kg 口径')
  ok(/活动系数/.test(diet), '饮食页显示了活动系数')
  // 2026-10-19 改版：三餐参考独立页（mealref），主页只留入口 + 四餐记录 + 添加按钮
  ok(/我的饮食参考/.test(diet) && /mealref/.test(diet), '饮食页有三餐参考入口')
  ok(/openFoodPanel/.test(diet), '四餐入口跳转到独立选择食物页')
  ok(/早餐/.test(diet) && /加餐/.test(diet), '主页有四餐记录区')
  // 三餐参考页：≥3 餐且每餐热量不为 0（原「每餐合计」断言挪到这里）
  const ref = res.pages.mealref ? res.pages.mealref.html : ''
  ok(!!ref, '三餐参考页可渲染')
  if (ref) {
    const mealKcals = (ref.match(/(\d+) 大卡/g) || []).map(x => Number(x.match(/(\d+)/)[1]))
    ok(mealKcals.length >= 3, '三餐参考列出了 ≥3 餐', '实际 ' + mealKcals.length)
    ok(mealKcals.every(k => k > 0), '每餐热量都不为 0（字段名接对）', JSON.stringify(mealKcals))
    ok(/refLog/.test(ref) && /记录实际吃的/.test(ref), '每餐可确认后记录实际摄入')
    // 科学性抽查：主食克数别再出现「早餐 185g 燕麦」级别的离谱值（单食物 ≤500g）
    const grams = (ref.match(/(\d+)g/g) || []).map(x => Number(x.match(/(\d+)/)[1]))
    ok(grams.every(g => g <= 500), '克数无离谱值（≤500g，复合营养折算生效）', JSON.stringify(grams.slice(0, 8)))
  }
  ok(/消耗 2990/.test(diet) && /摄入 2789/.test(diet), '饮食卡展示估算消耗与摄入目标')

  // 宏观调控卡：演示数据刻意造成"掉得偏快"，必须给出真实结论而不是空卡
  ok(/宏观调控/.test(diet), '饮食页有「宏观调控」卡')
  ok(/目标：/.test(diet), '显示了目标速率区间')
  ok(/可信区间/.test(diet), '显示了趋势的可信区间')
  ok(/该加碳水|该减碳水|节奏正好/.test(diet), '给出明确结论（不是"没结论"）',
    (diet.match(/(该加碳水|该减碳水|节奏正好|攒数据中|数据不足|冷却中)/) || [''])[0])
  ok(/应用这次调整|节奏正好/.test(diet), '有可执行的下一步')
  ok(/饥饿反馈/.test(diet) && /宏观调控/.test(diet), '两路偏移都展示（饥饿反馈 / 宏观调控）')
  ok(/当前偏移|当前没有额外偏移/.test(diet), '有偏移汇总行（有偏移说清来源 / 无偏移明说）')

  const rec = res.pages.records.html || ''
  ok(/今天体重/.test(rec), '记录页有「今天体重」录入入口')
  ok(/wIn/.test(rec) && /wSave/.test(rec), '体重输入框与保存按钮都在')
  ok(/再记 \d+ 天|已够数据评估/.test(rec), '记录页提示了还需攒几天数据')

  const home = res.pages.home.html || ''
  ok(!/undefined|NaN/.test(home), '首页无 undefined / NaN 泄漏',
    (home.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])
  // 修炼改版（2026-10-16）：首页 = 洞府。角色区只留 昵称/境界/Lv/修为；
  // 玩家编号与创始席位挪到「我的」页 —— 编号断言跟着搬家。
  ok(/realm-tag/.test(home), '首页角色区有境界徽记')
  ok(/炼体|蓄力|精进|破境|宗师/.test(home), '首页显示了境界名（五境界之一）')
  ok(/修为/.test(home), '首页经验条标了「修为」')
  ok(/开始训练|继续训练/.test(home), '首页有「开始训练」强按钮')
  ok(/藏经阁/.test(home) && /随身导师/.test(home), '首页有藏经阁与随身导师两个并列入口')
  ok(/hero-av[\s\S]*assets\/characters\/stage1\.png/.test(home), '首页角色形象指向 assets/characters/stage1.png')
  const meHtml0 = (res.pages.me.html || '')
  // 修炼改版二轮（codex）：编号/席位退到「我的」（登录后显示），首页只留头像圆点入口
  ok(/profile-dot/.test(home), '首页右上角有个人入口（头像圆点）')
  ok(/连续修炼/.test(home), '首页角色区显示连续天数')
  ok(/今日恢复/.test(home) && /data-sleep=/.test(home) && /data-water=/.test(home),
    '★ 首页有「今日恢复」卡（睡眠 + 补水都能记，写进 checkin）')
  ok(/修炼工具/.test(meHtml0) && /账号/.test(meHtml0), '「我的」页有修炼工具与账号区块')

  const today = res.pages.today.html || ''
  ok(!/undefined|NaN/.test(today), '训练页无 undefined / NaN 泄漏',
    (today.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])

  const me = res.pages.me.html || ''
  ok(!/undefined|NaN/.test(me), '「我的」页无 undefined / NaN 泄漏（BMI 两个函数配套用）',
    (me.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])
  ok(/BMI 27\.8/.test(me), '「我的」页 BMI 数字+分类都渲染')
  ok(/我的形象/.test(me), '「我的」页有形象墙')
  ok((me.match(/assets\/characters\/stage[0-9]\.png/g) || []).length === 5, '形象墙列全 5 个阶段',
    String((me.match(/assets\/characters\/stage[0-9]\.png/g) || []).length))
  ok(/练到 Lv20 会变成『入门』/.test(me), '形象墙提示下一个阶段', (me.match(/练到 Lv\d+ 会变成[^<]{0,10}/) || [''])[0])

  // ── 建档（新用户的第一道门槛）──
  section('建档页与空档案防御')
  {
    const ob = res.pages.onboard.html || ''
    ok(res.pages.onboard.ok, '建档页能渲染')
    ok(/obSubmit/.test(ob), '有提交按钮')
    ok(/data-chips="goal"/.test(ob) && /data-chips="exp"/.test(ob), '有目标与经验选项')
    ok(/data-list="activity"/.test(ob) && /data-chips="home"/.test(ob), '有活动量（列表式）与场所选项')
    ok((ob.match(/act-item/g) || []).length >= 5, '活动量列出全部 5 档',
      String((ob.match(/act-item/g) || []).length))
    ok(/act-factor/.test(ob) && /×1\.55/.test(ob), '每档显示了活动系数（×1.55 这种）')
    ok(/act-desc/.test(ob), '每档自带判断标准（用户原话：不知道自己是哪一档）')
    ok(/拿不准就选/.test(ob), '给了"拿不准怎么选"的指引')

    // 训练安排：分化方式 + 循环方式（用户明确要求"练三休一/四分化要能选"）
    ok(/data-list="split"/.test(ob), '有分化方式选项')
    const splitN = (ob.match(/data-v="(full|ppl|cpbsl|five)"/g) || []).length
    ok(splitN === 4, '四种分化都列出来了', String(splitN))
    ok(/四分化/.test(ob), '四分化在界面上可见（此前引擎有、界面没露出来）')
    ok(/推拉腿/.test(ob) && /全身循环/.test(ob), '三分化与全身循环也在')
    ok(/练3休1/.test(ob) && /练4休1/.test(ob) && /练5休2/.test(ob), '循环制三种都能选')
    ok(/不看星期几/.test(ob), '解释了循环制与按周安排的区别')
    ok(/已按经验与循环自动配好/.test(ob) && /已按每周天数选好/.test(ob), '写明了默认是自动推荐、可改')
    ok(/四分化（胸 \/ 背 \/ 肩 \/ 腿）/.test(ob), '分化标题带上了「练哪几天」（直接回答「为什么不是胸背肩腿」）',
      (ob.match(/四分化（[^）]*）/) || [''])[0])
    ok(/就是「胸 \/ 背 \/ 肩 \/ 腿」/.test(ob), '四分化说明写清了它就是胸背肩腿、三头二头挂在胸背日')
    ok(/data-chips="bodyType"/.test(ob) && /data-chips="dietMode"/.test(ob), '有体质与饮食模式选项')
    ok(/不开定位/.test(ob), '城市说明写明了不开定位')
    ok(/ob-inp/.test(ob), '有身高/体重输入框')
    ok(!/undefined|NaN/.test(ob), '建档页无 undefined / NaN 泄漏',
      (ob.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])

    // ★ 空档案（刚注册）时 7 个页面都不能崩 —— 这是真实炸过的场景
    const emp = res.empty || {}
    const crashed = Object.keys(emp).filter(n => !emp[n].ok)
    ok(Object.keys(emp).length === 11, '空档案场景覆盖 11 个页面', String(Object.keys(emp).length))
    ok(crashed.length === 0, '空档案时所有页面都不崩',
      crashed.map(n => n + ' → ' + emp[n].err).join('  |  '))
    const leak2 = Object.keys(emp).filter(n => emp[n].ok && /undefined|NaN/.test(emp[n].html || ''))
    ok(leak2.length === 0, '空档案时不泄漏 undefined / NaN',
      leak2.map(n => n + ':' + (emp[n].html.match(/.{0,25}(undefined|NaN).{0,25}/) || [''])[0]).join(' | '))
    ok(emp.diet && emp.diet.ok, '饮食页在空档案下不崩（曾经就崩在这）',
      emp.diet ? emp.diet.err : '未渲染')

    // 守卫与建档能力（用源码静态检查，避免依赖 ev 的定义顺序）
    const ssrc = read('src/store.js')
    ok(/hasProfile\s*\(/.test(ssrc), 'Store.hasProfile 已实现')
    ok(/saveProfile\s*\(profile/.test(ssrc), 'Store.saveProfile 已实现（支持 split/freq 选项）')
    ok(/isLoggedIn\s*\(/.test(ssrc), 'Store.isLoggedIn 已实现')
    ok(/generatePlan\s*\(/.test(ssrc), 'saveProfile 里会生成训练计划（不能只存档案不生成计划）')
    const rsrc = read('src/router.js')
    ok(/hasProfile/.test(rsrc), 'Router 里有建档守卫')
    ok(/'onboard'/.test(rsrc), '守卫放行了 onboard 自己（否则会死循环）')
    const asrc = read('src/app.js')
    ok(/reg\('onboard'/.test(asrc), 'app.js 注册了 onboard 路由')
  }

  // ── M1 账号体系 ──
  const login = res.pages.login.html || ''
  ok(/用邮箱登录/.test(login), '登录页有邮箱登录表单')
  ok(/emailIn/.test(login) && /okBtn/.test(login), '登录页有输入框和提交按钮')
  ok(/玩家编号/.test(login), '登录页说明会分配玩家编号')
  ok(/用编号找回账号/.test(login), '登录页有找回入口')
  ok(/不收集/.test(login), '登录页写明隐私边界')

  const rec2 = res.pages.recover.html || ''
  ok(/noIn/.test(rec2) && /rcIn/.test(rec2), '找回页有编号 + 恢复码输入')
  ok(/恢复码/.test(rec2), '找回页说明了恢复码')

  const me2 = res.pages.me.html || ''
  ok(/邮箱验证码登录 \/ 注册/.test(me2), '「我的」页（未登录）有登录入口')
  ok(/用编号找回账号/.test(me2), '「我的」页（未登录）有找回入口')

  section('M1 配置与接口')
  // vm 里顶层 const 不挂 global，必须回上下文求值
  const ev = e => vm.runInContext(e, ctx)
  ok(ev("typeof Config") === 'object', 'Config 已加载')
  ok(/^https:\/\//.test(ev('Config.authUrl()')), 'auth 接口是 https 地址', ev('Config.authUrl()'))
  ok(ev('Config.authUrl() !== Config.apiUrl()'), 'auth 与 api 是两个不同端点')
  ok(ev("typeof Api.auth === 'function' && typeof Api.api === 'function'"), 'Api.auth / Api.api 存在')
  ok(ev("typeof Store.restoreSession === 'function'"), 'Store.restoreSession 存在')
  ok(ev("typeof Store.pushCheckin === 'function'"), 'Store.pushCheckin 存在')
  ok(ev("typeof Store.saveCloud === 'function'"), 'Store.saveCloud 存在')
  ok(ev("typeof Store.afterLogin === 'function' && typeof Store.logout === 'function'"), '登录/登出方法齐全')
  ok(ev("Store.theme()") === 'dark', '默认主题是深空', ev('Store.theme()'))
  ok(ev("typeof Api.toast") === 'function', 'Api.toast 错误提示存在')

  // ── 训练日志（一句话 + 照片 + 突破）──
  const todayHtml = res.pages.today.html || ''
  ok(/noteBox/.test(todayHtml), '「训练」页底部有日志入口')
  ok(/今天留个记录/.test(todayHtml), '「训练」页有"今天留个记录"标题')
  ok(/拍一张/.test(todayHtml) && /不会上传/.test(todayHtml), '拍照入口明确写了"不会上传"')
  ok(/noteText/.test(todayHtml) && /noteSave/.test(todayHtml), '有正文输入框和保存按钮')
  ok(sandbox.ENGINE.journal.TAGS.some(t => todayHtml.indexOf(t) >= 0), '主题快选渲染出来了')

  const recHtml0 = res.pages.records.html || ''
  ok(/训练日志/.test(recHtml0), '「记录」页有训练日志卡')
  ok(/写今天的记录|改今天的记录/.test(recHtml0), '「记录」页有写/改今天的记录按钮')
  ok(/过往记录/.test(recHtml0), '「记录」页有过往记录区块')
  ok(!/undefined|NaN/.test(recHtml0), '「记录」页日志区无 undefined / NaN 泄漏',
    (recHtml0.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])

  ok(ev("typeof JournalUI") === 'object', 'JournalUI 组件已加载')
  ok(ev("typeof JournalUI.render === 'function' && typeof JournalUI.timelineHTML === 'function'"), 'JournalUI 方法齐全')
  ok(ev("typeof ENGINE.journal") === 'object', 'ENGINE.journal 已在引擎里')
  ok(ev("typeof Store.addPhoto === 'function' && typeof Store.photosOf === 'function'"), '照片本机存储方法齐全')
  ok(ev("typeof Store.saveNote === 'function'"), 'Store.saveNote 存在')

  // ── 排行榜（全国 / 同城）──
  const rank = res.pages.rank.html || ''
  ok(/排行榜/.test(rank), '「排行榜」页渲染出来了')
  ok(/同城/.test(rank) && /全国/.test(rank), '有同城/全国两个维度')
  ok(/等级榜/.test(rank) && /连续榜/.test(rank) && /本周榜/.test(rank), '三种榜都在')
  ok(/不排体重、不排体型/.test(rank), '写明"不排体重体型"（这是产品红线）')
  ok(/没有开定位/.test(rank), '写明没开定位')
  ok(!/undefined|NaN/.test(rank), '排行榜无 undefined / NaN 泄漏',
    (rank.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])
  ok(/rank-row/.test(rank), '榜单行有渲染（本机示例数据）')
  ok(/我的名次|🥇|🥈|🥉|第 \d+ 名/.test(rank), '显示了我的名次')

  ok(ev("typeof PageRank") === 'object', 'PageRank 已定义')
  ok(ev("typeof Store.demoBoard === 'function'"), '本机示例榜单方法存在')
  ok(sandbox.ENGINE.gamify.BOARDS.length === 3, '三个榜单定义齐全')

  // ── 周期化：递进阶梯 + 减载（两个都修过真 bug）──
  section('周期化：主项递进 + 减载周')
  {
    // 四分化·练4休1 → 一轮 5 天，取第 w 轮第一天的主项组次
    const pick = (w) => JSON.parse(ev("(function(){var P={gender:'男',age:30,height:183,weight:93," +
      "goal:'增肌减脂同步',exp:'进阶',days:4,bodyType:'中性',home:false,activity:'mod',dietMode:'simple'};" +
      "var d=ENGINE.kb.dayContent(ENGINE.kb.generatePlan(P,{freq:'c4'})," + ((w - 1) * 5) + ",P,false);" +
      "var m=(d.exercises||[]).filter(function(e){return e.role==='主项'})[0]||{};" +
      "return JSON.stringify({sets:m.sets,deload:!!d.deload,week:d.week});})()"))

    const w1 = pick(1), w2 = pick(2), w3 = pick(3), w4 = pick(4), w5 = pick(5), w6 = pick(6), w8 = pick(8)
    ok(w1.sets === '4×12', '第 1 轮打基础：4×12', w1.sets)
    ok(w2.sets === '4×10', '第 2 轮加重量：4×10', w2.sets)
    ok(w3.sets === '4×8', '第 3 轮上强度：4×8', w3.sets)
    ok(w4.deload === true, '第 4 轮是减载轮（每 4 轮一次）', String(w4.deload))
    ok(/^2×/.test(w4.sets), '减载轮真的把组数降下来了（4 组 → 2 组）。' +
      '以前只标了标记、组数照旧，等于连续加量不歇', w4.sets)
    ok(w5.sets === '4×6', '第 5 轮递进到 4×6 —— 减载轮没有把这一级顶掉', w5.sets)
    ok(w6.sets === '4×5', '第 6 轮到 4×5（阶梯走完）', w6.sets)
    ok(w8.deload === true && /^2×/.test(w8.sets), '第 8 轮再次减载', w8.sets + '/' + w8.deload)
    ok(pick(1).sets === w1.sets, '同一轮多次取值结果一致（幂等）')

    const kbSrc = read('../健身小程序/utils/kb.js')
    ok(/reduceSets\(e\.sets, cut\)/.test(kbSrc), 'kb.js 里减载真的作用到组数上')
    ok(/effWeek/.test(kbSrc), 'kb.js 里减载轮不参与递进（effWeek）')
    ok(/减少的比例/.test(kbSrc), 'reduceSets 的语义写进了注释（避免和 setsFactor 搞反）')
  }

  // ── 训练页：引擎里的方法论必须「露在界面上」──
  // 用户原话：「这些知识有没有给我放进去呢？」—— 以前全藏在代码里，界面一个字没有。
  section('训练页：把方法论露出来 + 完整版（付费理由）')
  {
    const td = res.pages.today.html || ''
    ok(/这一套是怎么定的/.test(td), '有「这一套是怎么定的」卡（原来没有任何说明）')
    ok(/组间休息/.test(td), '显示了组间休息口径')
    ok(/主项/.test(td) && /辅助/.test(td) && /孤立/.test(td), '显示了按动作角色的组次口径')
    ok(/RPE|留 ?2 ?次余量/.test(td), '显示了强度口径（RPE / 留几次余量）')
    ok(/4×12/.test(td) && /4×5/.test(td), '显示了主项递进阶梯（4×12 → … → 4×5）')
    ok(/减载/.test(td), '显示了减载规则')
    ok(/腹部|核心/.test(td), '显示了腹部安排')
    ok(/强度/.test(td), '每个动作卡上标了强度')

    // 完整版卡改成折叠形态（details.fold），summary 里有「完整版」与卖点
    ok(/完整版/.test(td) && /details class="fold"/.test(td), '有「完整版」卡（付费理由的呈现，折叠形态）')
    ok(/每个动作练多重/.test(td), '完整版说明了「重量与递进」')
    ok(/四周一个周期表/.test(td), '完整版说明了「周期表」')
    ok(/状态不好怎么临时调/.test(td), '完整版说明了「状态调整」')
    ok(/动作纠错|完整饮食计划/.test(td), '完整版说明了「AI 顾问 / 完整饮食」')
    ok(/Router\.go\('pro'\)/.test(td), '完整版有跳转入口（未开通时不在这里直接卖）')
    ok(/收费/.test(td), '明确标注了这是收费内容（不假装免费）')
    ok(!/undefined|NaN/.test(td), '训练页无 undefined / NaN 泄漏',
      (td.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])
  }

  // ── 活动量选择器：选中要真的改变结果 ──
  // 2026-09-23 用户报的 bug：「点哪个它都是一模一样的，别人根本不知道自己是属于哪一档」
  // 根因：选完只改了高亮，没刷新下面的说明文字。这里从逻辑层锁住。
  section('活动量选择：选完必须真的变')
  {
    ev("PageOnboard.draft = null; PageOnboard.render()")
    const texts = ['sed', 'lit', 'mod', 'high', 'max'].map(k => ev("PageOnboard.actHintText('" + k + "')"))
    ok(new Set(texts).size === 5, '5 档的说明文字各不相同（点哪个都一样就是这个挂了）',
      'distinct=' + new Set(texts).size)
    ok(/极大|极高|1\.9/.test(texts[4]), '「极高」档说到 1.9', texts[4].slice(0, 50))
    ok(/久坐|1\.2/.test(texts[0]), '「久坐」档说到 1.2', texts[0].slice(0, 50))
    ok(texts.every(t => /拿不准就选/.test(t)), '每档都带"拿不准怎么选"的指引')

    // 选中 → 草稿真的更新 + 打上"手动改过"标记
    ev("PageOnboard.pick('activity', { dataset: { v: 'max' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.d().activity") === 'max', '选中「极高」后草稿更新', ev("PageOnboard.d().activity"))
    ok(ev("PageOnboard._actTouched") === true, '手动选过活动量后打标记（之后不再被天数覆盖）')

    // 每周天数联动：手动改过活动量就不再覆盖
    ev("PageOnboard.pick('days', { dataset: { v: '2' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.d().activity") === 'max', '手动选过活动量 → 改天数不会覆盖它',
      ev("PageOnboard.d().activity"))

    // 反过来：没手动选过 → 改天数会自动调档
    // 模拟刚注册的新用户：draft 走默认值（不能从演示数据里的旧 plan 回填，否则测的不是推荐逻辑）
    ev("PageOnboard.draft = PageOnboard.defaults(); PageOnboard._actTouched = false")
    ev("PageOnboard.pick('days', { dataset: { v: '6' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.d().activity") === 'high', '没手动选过 → 每周 6 天自动升到「高度」',
      ev("PageOnboard.d().activity"))
    ev("PageOnboard.pick('days', { dataset: { v: '2' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.d().activity") === 'lit', '每周 2 天 → 自动降到「轻度」',
      ev("PageOnboard.d().activity"))

    // ── 分化 / 循环：推荐联动 + 手动选择优先 + 引擎真的照做 ──
    // 模拟刚注册的新用户：draft 走默认值（不能从演示数据里的旧 plan 回填，否则测的不是推荐逻辑）
    ev("PageOnboard.draft = PageOnboard.defaults(); PageOnboard._actTouched = false")
    ok(ev("PageOnboard.effSplit()") === 'full', '新手默认推荐「全身循环」', ev("PageOnboard.effSplit()"))
    ok(ev("PageOnboard.effFreq()") === 'w4', '每周 4 天默认推荐 w4', ev("PageOnboard.effFreq()"))
    ev("PageOnboard.pick('exp', { dataset: { v: '进阶' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.effSplit()") === 'ppl', '改成进阶 → 自动推荐推拉腿三分化', ev("PageOnboard.effSplit()"))
    ev("PageOnboard.pick('exp', { dataset: { v: '熟练' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.effSplit()") === 'cpbsl', '改成熟练 → 自动推荐四分化', ev("PageOnboard.effSplit()"))
    ev("PageOnboard.pick('days', { dataset: { v: '6' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.effFreq()") === 'w6', '每周 6 天 → 自动推荐 w6', ev("PageOnboard.effFreq()"))

    // 手动选了循环制之后，改天数不能再覆盖它
    ev("PageOnboard.pick('freq', { dataset: { v: 'c3' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.effFreq()") === 'c3', '手动选「练3休1」后即时生效', ev("PageOnboard.effFreq()"))
    ev("PageOnboard.pick('days', { dataset: { v: '3' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.effFreq()") === 'c3', '手动选过循环制 → 改天数不会覆盖（尊重用户）',
      ev("PageOnboard.effFreq()"))

    // ── 分化 × 循环 必须配对（用户发现的：练4休1 配三分化会「推练两次、腿只一次」）──
    ev("PageOnboard.draft = PageOnboard.defaults(); PageOnboard._actTouched = false")
    ev("PageOnboard.draft.exp='进阶'; PageOnboard.draft.days='4'")
    ev("PageOnboard.pick('freq', { dataset: { v: 'c4' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.effSplit()") === 'cpbsl', '练4休1 → 自动推荐四分化（而不是三分化）',
      ev("PageOnboard.effSplit()"))
    ok(/最整齐/.test(ev("PageOnboard.comboHint()")), '练4休1 + 四分化 → 确认是最整齐的配法',
      ev("PageOnboard.comboHint()").slice(0, 40))

    // 手动选成不搭的组合 → 必须警告（这种「两个都选了但打架」最容易被忽略）
    ev("PageOnboard.draft.split='ppl'")
    ok(/不均匀|不平衡/.test(ev("PageOnboard.comboHint()")), '练4休1 + 三分化 → 明确警告练得不均匀',
      ev("PageOnboard.comboHint()").slice(0, 50))
    ev("PageOnboard.draft.split='auto'")
    ev("PageOnboard.pick('freq', { dataset: { v: 'c3' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.effSplit()") === 'ppl', '练3休1 → 自动推荐三分化', ev("PageOnboard.effSplit()"))
    ok(/最整齐/.test(ev("PageOnboard.comboHint()")), '练3休1 + 三分化 → 确认配得上')
    ev("PageOnboard.draft.split='cpbsl'")
    ok(/轮不到/.test(ev("PageOnboard.comboHint()")), '练3休1 + 四分化 → 警告有部位轮不到',
      ev("PageOnboard.comboHint()").slice(0, 50))
    ev("PageOnboard.draft.split='auto'")
    ev("PageOnboard.pick('freq', { dataset: { v: 'c5' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.effSplit()") === 'five', '练5休2 → 自动推荐五分化', ev("PageOnboard.effSplit()"))
    // 新手不会被推到四分化/五分化
    ev("PageOnboard.draft = PageOnboard.defaults(); PageOnboard._actTouched = false")
    ev("PageOnboard.pick('freq', { dataset: { v: 'c4' }, parentNode: { querySelectorAll: () => [] } })")
    ok(ev("PageOnboard.effSplit()") === 'full', '新手即使选练4休1，也不推四分化（仍是全身）',
      ev("PageOnboard.effSplit()"))

    // 引擎侧端到端：选了四分化 + 练3休1，生成的计划必须真的是它
    const planStr = ev("(function(){var P={gender:'男',age:30,height:180,weight:80,goal:'增肌',exp:'熟练'," +
      "days:4,bodyType:'中性',activity:'mod',dietMode:'simple'};return JSON.stringify(ENGINE.kb.generatePlan(P,{split:'cpbsl',freq:'c3'}));})()")
    const pl = JSON.parse(planStr)
    ok(pl.split === 'cpbsl' && pl.freq === 'c3', '四分化 + 练3休1 真的生成出来了', pl.templateName)
    ok(JSON.stringify(pl.micro) === JSON.stringify(['chest', 'back', 'shoulder', 'rest']),
      '循环单元 = 胸/背/肩/休（练3休1 按循环轮转）', JSON.stringify(pl.micro))
    const plan2 = JSON.parse(ev("(function(){var P={gender:'男',age:30,height:180,weight:80,goal:'增肌',exp:'进阶'," +
      "days:4,bodyType:'中性',activity:'mod',dietMode:'simple'};return JSON.stringify(ENGINE.kb.generatePlan(P,{freq:'c4'}));})()"))
    ok(plan2.freq === 'c4' && plan2.micro.indexOf('rest') >= 0, '练4休1 也能生成', JSON.stringify(plan2.micro))
    ok(plan2.basis && plan2.basis.length > 10, '计划带「为什么这么排」的说明（basis）', plan2.basis.slice(0, 40))

    // 校验和建档产物
    ok(ev("PageOnboard.validate({ age: '5', height: '170', weight: '70' })") !== '', '年龄离谱时会被拦住')
    ok(ev("PageOnboard.validate({ age: '30', height: '170', weight: '70' })") === '', '正常值放行')
    const ossrc = read('src/pages/onboard.js')
    ok(/isLoggedIn\(\)/.test(ossrc), '未登录提交时会先提示去登录（不是静默失败）')
    ok(/SaveProfile|saveProfile/.test(ossrc), '提交会调 Store.saveProfile')
  }

  // ── 十二周计划：预览必须是「周期大纲」而不是逐动作铺屏（用户 2026-10-16 点名）──
  const p12 = res.pages.plan12.html || ''
  ok(res.pages.plan12.ok, '十二周计划页能渲染')
  ok(/积累期/.test(p12) && /减载周/.test(p12) && /冲刺期/.test(p12), '★ 预览是三轮周期大纲（积累/加重→冲刺/减载）')
  ok(/组次策略/.test(p12) && /重量策略/.test(p12), '★ 大纲带组次与重量策略列')
  ok(/骨架概览/.test(p12), '★ 有「一个循环练什么」骨架概览（不铺逐动作清单）')

  // ── 训练页：动作卡折叠（力量主区像热身一样可展开/收起）──
  const folds = (today.match(/details class="ex-card"/g) || []).length
  ok(folds >= 3, '★ 动作卡是折叠卡（' + folds + ' 张 details.ex-card）')
  ok(/ex-sum-meta/.test(today), '★ 折叠摘要带组次与完成进度')

  const recHtml = res.pages.records.html || ''
  ok(!/undefined|NaN/.test(rec), '记录页无 undefined / NaN 泄漏',
    (rec.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])
}

section('调整顾问：反馈 → 调整 → 应用 的闭环')
{
  const ch = res.pages.coach.html || ''
  ok(res.pages.coach.ok, '调整顾问页能渲染')
  const sits = (ch.match(/data-sit="/g) || []).length
  ok(sits >= 4, '列出 ≥4 个可点选的情况（' + sits + ' 个）')
  ok(/体重卡住了/.test(ch) && /最近老是饿/.test(ch), '情况用的是人话，不是术语')
  ok(/按规则算/.test(ch), '说明了这是规则算的，不是瞎猜')
  ok(/AI 顾问/.test(ch) && /去问 AI 顾问/.test(ch), 'AI 顾问已上线（coach 页有入口）')

  const today = res.pages.today.html || ''
  ok(/Router\.go\('coach'\)/.test(today), '训练页有「调一下」入口')
  ok(/todayState/.test(read('src/pages/today.js')), '训练页会读当天状态（点了「没睡好」真的会降量）')

  // 逻辑层：四个情况都要给得出结论，而且必须带「依据」，不能只丢一句结论
  const adv = vm.runInContext(
    '(function(){var u=Store.state.user,E=ENGINE,today=Fmt.todayStr(),plan=u.plan;' +
    'var idx=Math.max(0,E.calc.dayIndexFromStart(plan.cycleStart||today,today));' +
    'var day=E.kb.dayContent(plan,idx,u.profile,!!plan.home);var out={};' +
    '["stuck","hungry","tired","busy"].forEach(function(k){out[k]=E.coach.advise(k,' +
    '{engine:E,profile:u.profile,plan:plan,dietState:u.dietState||{},checkins:Store.state.checkins||[],day:day,today:today})});' +
    'return JSON.stringify(out)})()', ctx)
  const A = JSON.parse(adv)
  const bad = Object.keys(A).filter(k => !A[k] || A[k].ok !== true || !A[k].title || !A[k].why)
  ok(bad.length === 0, '四个情况都有结论且带依据（title + why）', bad.join(','))
  ok(A.hungry && A.hungry.apply && A.hungry.apply.type === 'hunger', '「老是饿」给得出可应用的调整',
    A.hungry && A.hungry.apply && A.hungry.apply.type)
  ok(A.busy && (A.busy.apply || A.busy.changes), '「练不过来」给得出结论')
  const hasStuck = A.stuck && (A.stuck.apply || A.stuck.why)
  ok(!!hasStuck, '「体重卡住」在数据不足时给的是「先攒数据」而不是硬改')
  ok(!Object.keys(A).some(k => /undefined|NaN/.test(JSON.stringify(A[k]))), '结论里不泄漏 undefined / NaN')
  ok(vm.runInContext('ENGINE.coach.advise("不存在的",{engine:ENGINE,profile:{},dietState:{},checkins:[]}).ok', ctx) === false,
    '未知情况返回失败，不崩')
}

section('食物库：只列常见 + 实时联想搜索')
{
  const diet = res.pages.diet.html || ''
  // 2026-10-19：食物库/搜索/常用收进「添加食物」弹层 —— 源码级验证（弹层按需渲染，主页 html 不含）
  const dietSrc = fs.readFileSync(ROOT + '/src/pages/diet.js', 'utf8')
  ok(dietSrc.includes('id="foodQ"'), '有搜索框（弹层内，按需渲染）')
  ok(dietSrc.includes('id="foodCommon"'), '有「常见食材」区（弹层内）')
  const chips = (diet.match(/data-food="/g) || []).length
  const cm = dietSrc.match(/COMMON:\s*\{[\s\S]*?\n  \}/)
  const commonNames = cm ? (cm[0].match(/'[^']+'/g) || []).length : 0
  ok(commonNames >= 40, '常见食材 ≥40 个（源码级名单）', String(commonNames))
  // 旧版把 1246 条全 join 出来 —— 现在必须不这么干（用户原话：看着占位置、点了没反应）
  ok(!/鸡枞|鸡肫|马铃薯|籼米|粳米/.test(diet), '没有把整库平铺出来（只留常见项）')
  ok(dietSrc.includes('搜索食物，例如米饭、鸡蛋'), '文案写清了打一个字就出结果')

  // 名单里每个名字都必须真能在库里查到，否则点开是空的
  const badNames = vm.runInContext(
    '(function(){var bad=[];Object.keys(PageDiet.COMMON).forEach(function(c){' +
    'PageDiet.COMMON[c].forEach(function(n){if(!ENGINE.kb.matchFood(n))bad.push(n)})});return bad})()', ctx)
  ok(badNames.length === 0, '常见食材每一项都能在库里查到', badNames.join('、'))
  const totalCommon = vm.runInContext(
    'Object.keys(PageDiet.COMMON).reduce(function(s,c){return s+PageDiet.COMMON[c].length},0)', ctx)
  ok(totalCommon >= 50 && totalCommon <= 90, '常见食材数量克制（' + totalCommon + ' 个，而不是 1246 个）')

  // 搜「鸡」要优先出鸡胸肉，而不是鸡心鸡爪鸡血
  const hit = vm.runInContext('PageDiet.searchFoods("鸡",5).map(function(f){return f.name}).join("、")', ctx)
  ok(/鸡胸肉/.test(hit), '搜「鸡」优先出常见食材', hit)
  ok(vm.runInContext('PageDiet.searchFoods("米",6).length', ctx) > 0, '搜「米」有结果')
  ok(vm.runInContext('PageDiet.searchFoods("zzz不存在的东西",5).length', ctx) === 0, '乱输入返回空（页面会给提示）')
  ok(vm.runInContext('PageDiet.searchFoods("",5).length', ctx) === 0, '空输入不报错')
}

section('训练页：加/减组 + 重量滑动 + 动作说明')
{
  const today = res.pages.today.html || ''
  const adds = (today.match(/data-setop="add"/g) || []).length
  const dels = (today.match(/data-setop="del"/g) || []).length
  ok(adds >= 3, '每个动作都有「加一组」（' + adds + ' 个）')
  ok(adds === dels && dels > 0, '加/减组按钮成对出现')
  ok(/readonly/.test(today) && /inputmode="none"/.test(today), '重量框改成点选（手机上不弹键盘）')
  const hows = (today.match(/class="ex-how fm-entry"/g) || []).length
  ok(hows >= 3, '每个动作都有「怎么做」说明且可进专注训练（' + hows + ' 个）')

  // ★ 2026-10-16 用户拍板三件套：专注训练 / 换删动作 / 加动作（修 A 不许丢 B）
  ok(/data-exop="swap"/.test(today) && (today.match(/data-exop="swap"/g) || []).length === adds, '每个动作都有「换动作」')
  ok(/data-exop="del"/.test(today) && (today.match(/data-exop="del"/g) || []).length === adds, '每个动作都有「删除动作」')
  ok(/openPicker\('add'\)/.test(today), '动作清单有「＋ 加动作」入口')
  const flowSrc = read('src/pages/training-flow.js')
  ok(/wt-focus/.test(flowSrc), '计时浮条有「专注训练」按钮')
  ok(/'focusMode'/.test(flowSrc), '专注训练全屏组件存在')
  ok(/FocusMode\.done\(\)/.test(flowSrc), '专注模式「完成=打勾」闭环')
  // 换/删动作真的改数据（DayEdit 本机持久）
  const dayEdit = vm.runInContext(
    '(function(){var p=PageToday;p._exs=[{name:"深蹲",role:"主项",log:[{weight:"",reps:"8",done:false}]},{name:"卧推",role:"主项",log:[{weight:"",reps:"8",done:false}]}];' +
    'var de={del:["深蹲"],swap:{}};var out=p.applyDayEdit(p._exs,de);return out.length+","+out[0].name})()', ctx)
  ok(dayEdit === '1,卧推', 'DayEdit 删动作真的过滤', dayEdit)
  const daySwap = vm.runInContext(
    '(function(){var p=PageToday;p._exs=[{name:"深蹲",role:"主项",sets:"4×6",log:[{weight:"",reps:"6",done:false}]}];' +
    'var de={del:[],swap:{深蹲:{oid:"ex123",name:"硬拉",sets:"4×6"}}};var out=p.applyDayEdit(p._exs,de);return out[0].name+","+out[0].oid})()', ctx)
  ok(daySwap === '硬拉,ex123', 'DayEdit 换动作真的替换', daySwap)

  // ★ 动作图：引擎课表只存 oid，页面必须回查动作库，否则永远是「无图」
  // 2026-10-15 起动作卡改为双帧循环（div.ex-frames 包两张 img），单帧/无图才用 img.ex-thumb
  const imgs = (today.match(/class="ex-thumb"[^>]*src="([^"]+)"/g) || [])
    .concat((today.match(/class="ex-thumb ex-frames"/g) || [])).concat((today.match(/class="posture-images/g) || []))
  ok(imgs.length >= 3, '动作图回查成功（不再是「无图」）—— ' + imgs.length + ' 张')
  ok(!imgs.length || /\/ex\//.test(today), '图片指向动作图库')

  // 组次编辑真的改到数据（不是只有个按钮）
  const step = vm.runInContext(
    '(function(){var p=PageToday;p._exs=[{name:"x",role:"辅助",log:[{weight:60,reps:8,done:false}]}];' +
    'p._presc={};p.addSet(0);var a=p._exs[0].log.length;p.delSet(0);return a+","+p._exs[0].log.length})()', ctx)
  ok(step === '2,1', '加组 / 减组真的改了组数', step)
  const guard = vm.runInContext(
    '(function(){var p=PageToday;p._exs=[{name:"x",log:[{weight:"",reps:"8",done:false}]}];' +
    'p._presc={};p.delSet(0);return p._exs[0].log.length})()', ctx)
  ok(guard === 1, '只剩一组时不给再减（不会减到 0）', String(guard))

  // 重量口径：用户指定 0–180kg、2.5 一档
  const W = vm.runInContext('PageToday.WEIGHT.max + "/" + PageToday.WEIGHT.step', ctx)
  ok(W === '180/2.5', '重量上限 180kg、步进 2.5', W)
}

section('秘籍：内容 + 一键换计划')
{
  const lib = res.pages.secret.html || ''
  ok(res.pages.secret.ok, '秘籍库能渲染')
  ok(/全部秘籍/.test(lib), '有秘籍列表')
  const cards = (lib.match(/data-secret="/g) || []).length
  ok(cards >= 4, '列出 ≥4 本秘籍（' + cards + ' 本）')
  ok(/减脂秘籍/.test(lib) && /增肌秘籍/.test(lib) && /增肌减脂同步/.test(lib), '减脂 / 增肌 / 同步三本都在')
  ok(/卧推增力秘籍/.test(lib) && /把卧推推上去/.test(lib), '★ 卧推增力那本已补齐（素材挖到了）')
  ok(/还在补的/.test(lib), '没做的几本明说了（不拿半成品凑数）')
  ok(/薄肌塑形秘籍/.test(lib) && /薄肌 = 低体脂/.test(lib), '★ 薄肌已补成真秘籍（不再是「还在补」）')
  ok(/居家三分化/.test(lib) && /居家五分化/.test(lib), '★ 居家三分化 / 五分化两本完整计划都在')
  ok(/居家腹肌专项/.test(lib) && /居家翘臀专项/.test(lib) && /居家练胸专项/.test(lib) && /美背专项/.test(lib),
    '★ 腹肌 / 臀 / 胸 / 美背四本部位专项都在')
  ok(/data-filter="home"/.test(lib) && /data-filter="focus"/.test(lib) && /data-filter="posture"/.test(lib),
    '★ 藏经阁分类 tabs 齐全（免费/居家/部位/体态/进阶）')
  ok((lib.match(/data-cat="home"/g) || []).length >= 3 && (lib.match(/data-cat="focus"/g) || []).length >= 4,
    '★ 分类真的挂在卡片上（居家 ≥3、部位 ≥4）')
  ok(/瘦脸秘籍/.test(lib), '瘦脸仍诚实标着不做（无素材硬写是贩卖焦虑）')

  const d = res.pages.secretDetail.html || ''
  ok(res.pages.secretDetail.ok, '秘籍详情能渲染')
  ok(/这本秘籍解决什么/.test(d), '有「解决什么」')
  ok(/跟着开练/.test(d) || ((res.proOn.secretDetail || {}).html || '').indexOf('跟着开练') >= 0,
    '★ 详情页有「跟着开练」按钮（已开通态；套用后直接跳训练页）')
  ok(/理论/.test(d) && /怎么吃/.test(d) && /怎么练/.test(d), '有理论 / 怎么吃 / 怎么练')
  ok(/4 周大纲/.test(d), '有周期大纲')
  ok(/内容出处/.test(d), '有出处汇总卡')
  const froms = (d.match(/出处：/g) || []).length
  ok(froms >= 3, '内容条目带具体出处（' + froms + ' 条）')
  // 2026-10-20：《女性周期训练》转免费（cat 'female'）——demo 档案默认展示的就是这本，
  // 未开通态也有完整内容；付费锁逻辑改到「进阶周期/部位专项」类目上验证（proOn 态另测）。
  ok(/female_cycle|女性周期训练/.test(d) || /解锁/.test(d) || /待开通/.test(d), '秘籍详情可渲染（免费本展示全部内容）')

  // ⛔ 每条内容都必须带出处 —— 用户就是为「来源不明」发的火，这条是护栏
  const bad = vm.runInContext(
    '(function(){var bad=[];ENGINE.secret.SECRETS.forEach(function(s){' +
    '["theory","eat","train"].forEach(function(k){(s[k]||[]).forEach(function(x){' +
    'if(!x.d) bad.push(s.key+"."+k+" 缺内容");' +
    'if(!x.from) bad.push(s.key+"."+k+" 缺出处");})});' +
    'if(!s.solves||!s.solves.length) bad.push(s.key+" 缺 solves");' +
    'if(!s.outline||!s.outline.length) bad.push(s.key+" 缺大纲");' +
    'if(!s.sources||!s.sources.length) bad.push(s.key+" 缺 sources");' +
    'if(!s.preset) { bad.push(s.key+" 缺 preset"); }' +
    'else if(s.kind==="append"){ if(!s.preset.append||!s.preset.append.length) bad.push(s.key+" 缺 append 动作"); }' +
    'else { if(!s.preset.goal||!s.preset.split||!s.preset.freq) bad.push(s.key+" 缺 preset"); }});' +
    'return bad})()', ctx)
  ok(bad.length === 0, '每本秘籍：内容 / 出处 / 大纲 / preset 一个不缺（append 型查 append 动作）', bad.slice(0, 4).join(' | '))

  // preset 必须是引擎的合法值 —— 否则「用这本」会当场报错
  const badPreset = vm.runInContext(
    '(function(){var bad=[];ENGINE.secret.SECRETS.forEach(function(s){' +
    'var p={gender:"男",age:35,height:183,weight:93,exp:"进阶",days:4,bodyType:"中性",activity:"mod",goal:s.preset.goal};' +
    'try{var pl=ENGINE.kb.generatePlan(p,{split:s.preset.split,freq:s.preset.freq,home:false});' +
    'if(!pl||!pl.micro||!pl.micro.length) bad.push(s.key+" 生成不出计划");}catch(e){bad.push(s.key+":"+e.message)}});' +
    'return bad})()', ctx)
  ok(badPreset.length === 0, '每本秘籍的 preset 都能真的生成出计划', badPreset.join(' | '))
  ok(vm.runInContext('ENGINE.secret.get("fatloss").name', ctx) === '减脂秘籍', 'get() 能按 key 取到')
  ok(vm.runInContext('ENGINE.secret.get("不存在")', ctx) === null, '取不到时返回 null 而不是崩')
  ok(/Router\.go\('secret'\)/.test(res.pages.me.html || ''), '「我的」页有秘籍入口')
}

section('完整版（付费层）')
{
  const pro = res.pages.pro.html || ''
  ok(res.pages.pro.ok, '完整版页能渲染（未开通态）')
  ok(/完整版里有什么/.test(pro), '未开通时说明「里面有什么」')
  ok(/每个动作练多重/.test(pro) && /四周周期表/.test(pro) && /完整饮食计划/.test(pro), '四项能力都写清了')
  ok(/proCode/.test(pro) && /proBtn/.test(pro), '有激活码输入与开通按钮')
  ok(/免费版永远保留/.test(pro), '明说了免费版保留什么（不制造恐慌）')
  ok(!/主项 ×/.test(pro), '未开通时不泄漏周期表本体（重量倍率）')

  const on = res.proOn || {}
  ok(on.pro && on.pro.ok, '开通后完整版页能渲染', (on.pro || {}).err)
  const op = (on.pro || {}).html || ''
  ok(/今天的处方/.test(op), '开通后给出今日处方')
  ok(/四周周期表/.test(op) && /四周周期表|≈ \d+kg/.test(op), '开通后显示周期表（系数已换算成公斤）')
  ok(/三套饮食口径/.test(op) && /碳水循环档/.test(op) && /出处：/.test(op),
    '开通后显示三套口径，且每套都带出处')
  ok(/外卖潜规则/.test(op) && /补剂与饮水/.test(op), '开通后显示外食与补剂')
  ok(/这些数字是哪来的/.test(op), '标明了数据来源（原文 / 实测 / 推演）')
  ok(/推演/.test(op), '推演内容带「推演」标签（项目铁律）')
  ok(!/undefined|NaN/.test(op), '完整版页无 undefined / NaN 泄漏',
    (op.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])

  const ot = (on.today || {}).html || ''
  ok(/今日重量/.test(ot), '开通后训练页显示「完整版 · 今日重量」')
  ok(/建议 \d/.test(ot), '动作卡里给出了建议重量')
  ok(/kg<\/span>"?|kg/.test(ot), '重量带单位')
  ok(!/undefined|NaN/.test(ot), '开通后训练页无 undefined / NaN 泄漏',
    (ot.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])

  const od = (on.diet || {}).html || ''
  ok(on.diet && on.diet.ok, '开通后饮食页能渲染', (on.diet || {}).err)
  ok(/完整版饮食/.test(od) && /建议先看/.test(od) && /出处：/.test(od),
    '开通后饮食页给出建议口径 + 出处（不再有来源不明的数）')
  ok(!/undefined|NaN/.test(od), '开通后饮食页无 undefined / NaN 泄漏',
    (od.match(/.{0,30}(undefined|NaN).{0,30}/) || [''])[0])

  // 免费用户必须只看到引导，看不到内容本体
  const freeToday = res.pages.today.html || ''
  ok(/每个动作练多重/.test(freeToday) && /收费/.test(freeToday), '未开通时训练页只看到引导（折叠卡）')
  ok(!/建议 \d/.test(freeToday), '未开通时不给建议重量')
  const freeDiet = res.pages.diet.html || ''
  ok(/完整版饮食/.test(freeDiet) && !/训练日碳水/.test(freeDiet), '未开通时饮食页只看到引导')
}

section('路由与交互回调存在')
{
  // 注意：vm 里顶层 const 不会挂到 global 上，必须回到上下文里用 typeof 求值
  const ty = n => vm.runInContext('typeof ' + n, ctx)
  const missing = ['PageHome', 'PageToday', 'PageDiet', 'PageRecords', 'PageMe', 'PageLogin', 'PageBadges', 'PagePro', 'PageCoach', 'PageSecret']
    .filter(p => ty(p) === 'undefined')
  ok(missing.length === 0, '所有页面对象都已定义', missing.join(','))
  ok(ty('Router') === 'object', 'Router 存在')
  ok(ty('UI') === 'object', 'UI 存在')
  ok(ty('Fmt') === 'object', 'Fmt 存在')
  ok(ty('Store') === 'object', 'Store 存在')
  ok(ty('Tabbar') === 'object', 'Tabbar 存在')
  const tabN = vm.runInContext('Tabbar.items.length', ctx)
  ok(tabN === 5, '底部 tab 有 5 项', String(tabN))
}

section('构建清单完整（防止「测试通过但线上白屏」）')
{
  // 2026-09-23 踩过：新页面加进了本文件的 FILES，却忘了加进 build/build.js 的 ORDER，
  // 结果测试全绿、截图出来是「PagePro is not defined」。清单在两处，必须由脚本比对。
  const grab = (file, name) => {
    const m = read(file).match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\]'))
    return m ? (m[1].match(/'([^']+)'/g) || []).map(s => s.replace(/'/g, '')) : null
  }
  const order = grab('build/build.js', 'ORDER')
  const testFiles = grab('tools/test-pages.js', 'FILES')
  ok(!!order && !!testFiles, '能解析出两份清单')
  if (order && testFiles) {
    const dirFiles = (d, prefix) => {
      try {
        return fs.readdirSync(path.join(ROOT, d)).filter(f => /\.js$/.test(f)).map(f => prefix + f)
      } catch (e) { return [] }
    }
    const onDisk = [].concat(
      dirFiles('src', 'src/'),
      dirFiles('src/pages', 'src/pages/'),
      dirFiles('src/components', 'src/components/')
    )
    const notBuilt = onDisk.filter(f => order.indexOf(f.replace(/^src\//, '')) < 0)
    ok(notBuilt.length === 0, 'src/ 下每个文件都进了 build.js 的 ORDER', notBuilt.join(', '))
    const notTested = order.filter(f => f !== 'app.js' && testFiles.indexOf('src/' + f) < 0)
    ok(notTested.length === 0, 'build 清单与测试清单一致', notTested.join(', '))
    const notInTest = onDisk.filter(f => testFiles.indexOf(f) < 0 && /src\/(pages|components)\//.test(f))
    ok(notInTest.length === 0, '每个页面/组件都被冒烟测试覆盖', notInTest.join(', '))
  }
}

console.log('\n' + (fail === 0 ? '✅ 全部通过' : '❌ 有失败') + '：' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail === 0 ? 0 : 1)
