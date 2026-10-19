/* src/pages/diet.js —— 饮食页：目标 + 宏观调控 + 分餐方案 + 微饿循环 + 食物库
 *
 * 两套调整机制（都是喂给 calc.dietMacros 的偏移，通过 Store.adj() 合并）：
 *   ① 饥饿反馈（日级，感性）—— 今天饿就加点碳水（applyHunger）
 *   ② 宏观调控（周级，客观）—— 看 7–10 天体重趋势，按目标速率自动调（macro.review）
 */
const PageDiet = {
  render() {
    const u = Store.state.user
    const adj = Store.adj()
    const e = ENGINE.calc.energyPlan(u.profile, adj)
    const mode = (u.profile || {}).dietMode || 'simple'
    let day = null
    try { day = ENGINE.diet.buildDay(e, mode, { seed: this.seedOfToday() }) } catch (err) { day = null }
    // ⚠️ 空档案时 bmi(NaN,NaN) 返回 NaN，而 NaN 是 truthy → 会显示成「BMI NaN（肥胖）」
    const prof = u.profile || {}
    const hasBody = Number(prof.weight) > 0 && Number(prof.height) > 0
    const bmiV = hasBody ? ENGINE.calc.bmi(prof.weight, prof.height) : 0
    const bd = hasBody ? ENGINE.calc.bmiCat(bmiV) : null
    const rev = this.review()

    document.getElementById('app').innerHTML =
      Router.bar('饮食方案', Fmt.esc(prof.goal) + ' · ' + (mode === 'recipe' ? '配好菜' : '只给克数')) +

      // ───── 每日目标 + 今日补给 合并卡（2026-10-19 用户指定：目标+进度一体，四色保留，超100%柱变红）─────
      this.goalCard(e, prof, u) +

      // ───── 今天吃了什么：四餐 + 添加面板（常用/食物库/最近/套餐）─────
      this.foodLogCard(e, prof) +

      // ───── 消耗与缺口总账（用户 2026-10-15：总消耗/缺口埋在小字里看不见）─────
      '<details class="fold"><summary>热量目标怎么算的？查看消耗与缺口</summary>' + this.energyCard(e, prof, u) + '</details>' +

      // ───── 宏观调控：看体重趋势自动调 ─────
      this.macroCard(rev, e, u) +

      // ───── 完整版：三套饮食口径 / 外卖 / 补剂（免费用户只看到引导）─────
      '<details class="fold"><summary>进阶饮食功能与会员权益</summary>' + this.proCard(u, e) + '</details>' +

      // ───── 三餐参考入口（旧「今天怎么分配」已重做成独立页 mealref）─────
      '<div class="card"><div class="row between" style="align-items:baseline"><h2 style="margin:0">三餐参考</h2>' +
        '<span class="muted txs">按你的宏量自动配比</span></div>' +
        '<p class="muted txs">每餐 = 主食 + 蛋白 + 蔬菜 + 油脂，克数按各自营养密度折算（考虑食物复合营养，不是单一映射），克数可调，一键记入。</p>' +
        '<button class="btn" onclick="Router.go(\'mealref\')">看今天的三餐参考 ›</button>' +
      '</div>' +

      '<div class="card">' +
        '<h2>微饿循环 <span class="mini">饥饿反馈碳水 ' + this.signed(ENGINE.macro.breakdown(u.dietState).hunger.carb) +
        ' / 蛋白 ' + this.signed(ENGINE.macro.breakdown(u.dietState).hunger.protein) + ' g/kg</span></h2>' +
        '<p class="muted txs">谭成义口径：很饿 → 碳水 +0.5（蛋白 −0.2）；不饿 → 碳水 −0.5（蛋白 +0.2）。蛋白底线 1.4 g/kg。' +
        '这是<b>日级</b>的感性反馈，另一路是下面的宏观调</p>' +
        '<div class="wrap-row" style="margin-top:8px">' +
          '<button class="chip" onclick="PageDiet.hunger(\'很饿\')">很饿</button>' +
          '<button class="chip on" onclick="PageDiet.hunger(\'微饿\')">微饿</button>' +
          '<button class="chip" onclick="PageDiet.hunger(\'不饿\')">不饿</button>' +
        '</div>' +
      '</div>'

    this.bindFood()
  },

  // ───────── 食物库：只列常见，其余靠搜索 ─────────
  // 用户 2026-09-23 反馈：1246 条全平铺「看着占位置、点了还没反应」。
  // 现在：常见食材做成可点的 chip（点开看营养），其他输入一个字就联想出来。
  // ⚠️ 名单里的名字必须是食物库里真实存在的（test-pages 有断言挡着），否则点开是空的。
  COMMON: {
    蛋白: ['鸡胸肉', '鸡腿', '鸡蛋', '牛肉(瘦)', '猪里脊', '三文鱼', '鳕鱼', '虾', '豆腐', '牛奶', '酸奶'],
    主食: ['米饭(熟)', '馒头', '面条(熟)', '红薯', '紫薯', '土豆(蒸)', '燕麦片', '玉米(鲜)', '全麦面包', '山药', '糙米饭(熟)'],
    蔬菜: ['西兰花', '菠菜', '番茄', '黄瓜', '生菜', '白菜', '油麦菜', '香菇', '胡萝卜', '青椒', '冬瓜'],
    脂肪坚果: ['花生', '核桃', '杏仁', '腰果', '橄榄油', '牛油果', '芝麻子(黑)', '黄油', '南瓜子'],
    水果: ['香蕉', '苹果', '蓝莓', '橙子', '葡萄', '西瓜', '猕猴桃', '火龙果', '梨', '桃'],
    其他: ['蜂蜜', '白砂糖', '可乐', '花生酱']
  },

  /** 食物库片段（嵌在「今天吃了什么」卡里）：点名字弹克重选择，不写死 100g */
  foodLibInner() {
    return '<input class="pro-input" id="foodQ" type="text" placeholder="搜食材：鸡 / 米饭 / 西兰花" autocomplete="off">' +
      '<div class="muted txs" style="margin-top:6px">点下面的食物名 → 弹出克重选择（50/100/150/200 或自己填）→ 记入。其它的打字搜，<b>输入一个字就出结果</b>。</div>' +
      '<div id="foodHits" style="margin-top:10px"></div>' +
      '<div id="foodCommon">' +
        Object.keys(this.COMMON).map(c => {
          const list = this.COMMON[c].filter(n => ENGINE.kb.matchFood(n))
          if (!list.length) return ''
          return '<details class="food-category"' + (c === '蛋白' ? ' open' : '') + '><summary>' + Fmt.esc(c) + ' <span>查看食物</span></summary>' +
            '<div class="fc-chips">' + list.map(n =>
              '<button class="chip sm" data-food="' + Fmt.esc(n) + '">' + Fmt.esc(n) + '</button>').join('') +
            '</div></details>'
        }).join('') +
      '</div>'
  },

  /** 搜索：结果里「常见食材」排前面（搜「鸡」先出鸡胸肉/鸡腿/鸡蛋，而不是鸡心鸡爪鸡血） */
  searchFoods(q, n) {
    const raw = ENGINE.kb.searchFood(q) || []
    const rank = {}
    Object.keys(this.COMMON).forEach(c => this.COMMON[c].forEach((nm, i) => { rank[nm] = i }))
    const common = [], other = []
    raw.forEach(f => { (rank[f.name] != null ? common : other).push(f) })
    return common.concat(other).slice(0, n || 12)
  },

  bindFood() {
    const q = document.getElementById('foodQ')
    if (!q) return
    const hits = document.getElementById('foodHits')
    const common = document.getElementById('foodCommon')
    const render = () => {
      const v = String(q.value || '').trim()
      if (!v) {
        if (hits) hits.innerHTML = ''
        if (common) common.style.display = ''
        return
      }
      const list = this.searchFoods(v, 12)
      if (common) common.style.display = 'none'
      if (!hits) return
      hits.innerHTML = list.length
        ? '<div class="muted txs" style="margin-bottom:6px">找到 ' + list.length + ' 条 · 点名字看营养，点 ＋ 直接记 100g</div>' +
          list.map(f => '<div class="food-hit" data-food="' + Fmt.esc(f.name) + '">' +
            '<b>' + Fmt.esc(f.name) + '</b>' +
            '<span class="tag gray">' + Fmt.esc(ENGINE.kb.foodCatOf(f)) + '</span>' +
            '<span class="muted txs">' + Fmt.round(f.kcal, 0) + ' kcal/100g</span>' +
            '<span style="color:var(--primary,#1a73e8);cursor:pointer;font-weight:800;margin-left:8px" onclick="event.stopPropagation();PageDiet.flAddByName(\'' + Fmt.esc(f.name) + '\',100)">＋记</span></div>').join('')
        : '<div class="muted txs">没找到「' + Fmt.esc(v) + '」。换个更短的关键词试试，比如「鸡」「米」「鱼」。</div>'
    }
    q.oninput = render
    q.onfocus = render

    // 事件委托：常见 chips 与搜索结果都能点（列表动态渲染，逐个绑定会漏）
    const card = document.getElementById('flCard') || document.getElementById('foodCard')
    if (card) card.onclick = e => {
      let el = e.target
      while (el && el !== card) {
        if (el.dataset && el.dataset.food) { this.showFood(el.dataset.food); return }
        el = el.parentNode
      }
    }
  },

  /** 点开一个食材：每 100g 营养 + 常用份量换算 */
  showFood(name) {
    const f = ENGINE.kb.matchFood(name)
    if (!f) { UI.toast('库里没有「' + name + '」'); return }
    const kg = g => Fmt.round(f.kcal * g / 100, 0)
    const g1 = (v, g) => Fmt.round(v * g / 100, 1)
    const rows = [{ g: 100, t: '一小份' }, { g: 150, t: '一份' }, { g: 200, t: '大份' }]
    UI.modal({
      title: f.name,
      body: '<div class="muted txs">' + Fmt.esc(ENGINE.kb.foodCatOf(f)) + ' · 每 100g</div>' +
        UI.kv([
          { k: '热量 kcal', v: Fmt.round(f.kcal, 0) },
          { k: '蛋白 g', v: Fmt.round(f.protein, 1) },
          { k: '脂肪 g', v: Fmt.round(f.fat, 1) },
          { k: '碳水 g', v: Fmt.round(f.carbs, 1) }
        ]) +
        (Number(f.fiber) > 0 ? '<div class="muted txs" style="margin-top:6px">膳食纤维 ' +
          Fmt.round(f.fiber, 1) + ' g / 100g</div>' : '') +
        '<div style="margin-top:10px;border-top:1px dashed var(--line);padding-top:8px">' +
          rows.map(x => UI.li(Fmt.esc(x.t) + '（' + x.g + 'g）', kg(x.g) + ' kcal · 蛋白 ' + g1(f.protein, x.g) + 'g',
            '<span style="color:var(--primary,#1a73e8);cursor:pointer;font-weight:800" onclick="PageDiet.flAddByName(\'' + Fmt.esc(f.name) + '\',' + x.g + ');UI.toast(\'已记 ' + Fmt.esc(f.name) + ' ' + x.g + 'g\')">＋记</span>')).join('') +
        '</div>' +
        // 自定义克数（吃了 500g 米饭这种）—— 不再写死 100g；上下两行布局（.btn 是 width:100%，别和输入框抢一行）
        '<div class="muted txs" style="margin-top:10px">不是这几个份量？自己填：</div>' +
        '<input id="foodGIn" class="pro-input" type="number" inputmode="decimal" placeholder="填克数，如 500（单位：克）" style="font-size:16px;padding:13px 14px">' +
        '<button class="btn" onclick="PageDiet.flAddCustom(\'' + Fmt.esc(f.name) + '\')">按我填的克数记</button>' +
        '<div class="muted txs" style="margin-top:6px">⚠️ 生重/熟重差很多：带「(熟)」的是煮熟后的数。' +
          '100g 生米 346 kcal，煮成饭约 300g、350 kcal —— 记哪一种要固定。</div>',
      okText: '知道了', cancelText: false
    })
  },

  /** 弹窗里的自定义克数记入（吃了 500g 米饭的场景） */
  flAddCustom(name) {
    const g = Number((document.getElementById('foodGIn') || {}).value)
    if (!(g > 0)) { UI.toast('先填一个克数'); return }
    this.flAddByName(name, g)
  },

  /**
   * 完整版饮食区块。
   * 免费版已经给了「每日目标 + 分餐克数 + 微饿循环 + 体重宏观调控 + 食物库」，
   * 完整版补的是「三套饮食口径 / 外卖点法 / 补剂与饮水」，详情在 #/pro 页。
   */
  proCard(u, e) {
    const P = ENGINE.pro
    if (!P.isPro(u)) {
      const li = (a, b) => '<div style="padding:6px 0;border-bottom:1px solid var(--line)">' +
        '<b style="font-size:13px">' + Fmt.esc(a) + '</b>' +
        '<div class="muted txs">' + Fmt.esc(b) + '</div></div>'
      return '<div class="card pro-card">' +
        '<h2>完整版饮食 <span class="tag gold">收费</span></h2>' +
        '<div class="muted txs">上面这些免费的够用：每日目标、分餐克数、微饿循环、体重宏观调控、' +
          Fmt.num(ENGINE.kb.FOODS.length) + ' 种食物库。完整版再补三样：</div>' +
        '<div style="margin-top:6px">' +
          li('三套饮食口径，都标了出处', '均衡档（长期用）/ 碳水循环档（卡住了冲刺）/ 增肌档 —— 各自的碳水、蛋白、脂肪区间与例餐') +
          li('外卖怎么点', '6 条点法规则 + 主食克数换算（不给编出来的「某家店多少卡」）') +
          li('补剂与饮水', '肌酸、蛋白粉、维生素 D、鱼油，以及每天该喝多少水') +
        '</div>' +
        '<button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'pro\')">看看完整饮食计划</button>' +
      '</div>'
    }

    const prof = u.profile || {}
    const dp = P.dietPlan(prof, e, { method: ENGINE.method })
    // 今天是不是训练日（分餐表与「练前练后」讲法要用到）
    let isTrain = false
    const plan = u.plan
    if (plan && plan.micro && plan.micro.length) {
      try {
        const idx = Math.max(0, ENGINE.calc.dayIndexFromStart(plan.cycleStart || Fmt.todayStr(), Fmt.todayStr()))
        const d = ENGINE.kb.dayContent(plan, idx, prof, !!plan.home)
        isTrain = !!(d && d.type === 'train')
      } catch (err) { /* 算不出来就按休息日显示 */ }
    }
    const rec = (dp.schools.list.filter(x => x.recommended)[0]) || dp.schools.list[0]
    return '<div class="card pro-card">' +
      '<h2>完整版饮食 <span class="tag">已开通</span></h2>' +
      UI.kv([
        { k: '热量 kcal', v: dp.kcal },
        { k: '蛋白 g', v: dp.protein },
        { k: '碳水 g', v: dp.base.carb },
        { k: '饮水 L', v: dp.water }
      ]) +
      '<div class="muted txs" style="margin-top:8px">你的目标「' + Fmt.esc(prof.goal || '—') +
        '」建议先看 <b>' + Fmt.esc(rec.name) + '</b>：碳水 ' + Fmt.esc(rec.carb) +
        '、蛋白 ' + Fmt.esc(rec.protein) + '、脂肪 ' + Fmt.esc(rec.fat) + '。' +
        '（出处：' + Fmt.esc(rec.from) + '）</div>' +
      '<div class="muted txs">另外两套（碳水循环档 / 增肌档）也都有原文出处。三套挑一套固定吃 7–10 天再看体重，别混着用。</div>' +
      '<button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'pro\')">看三套口径 / 分餐 / 外卖 / 补剂</button>' +
    '</div>'
  },

  // ───────── 宏观调控 ─────────

  review() {
    const u = Store.state.user
    try {
      return ENGINE.macro.review({
        checkins: Store.state.checkins,
        profile: u.profile,
        dietState: u.dietState,
        today: Fmt.todayStr()
      })
    } catch (e) { return null }
  },

  macroCard(rev, e, u) {
    if (!rev) return ''
    const bd = ENGINE.macro.breakdown(u.dietState)
    const sp = ENGINE.macro.sparkline(rev.points, 1)

    const head = rev.ready
      ? (rev.verdict === 'on_track' ? '<span class="tag">节奏正好</span>' : '<span class="tag warn">建议调整</span>')
      : (rev.verdict === 'cooldown' ? '<span class="tag gray">冷却中</span>' :
        (rev.verdict === 'noisy' || rev.verdict === 'unclear' ? '<span class="tag gray">数据不足</span>'
          : '<span class="tag gray">攒数据中</span>'))

    let body = ''
    if (rev.trend) {
      body +=
        '<div style="margin:6px 0 2px">' + UI.sparkline(sp, { h: 96, color: rev.verdict === 'on_track' ? '#0e9f6e' : '#f59e0b' }) + '</div>' +
        '<div class="row between txs muted"><span>' + Fmt.esc(rev.window.from) + '</span>' +
          '<span>' + Fmt.esc(rev.window.to) + '</span></div>' +
        UI.kv([
          { k: '每周变化', v: this.signed(rev.trend.perWeek, 'kg') },
          { k: '每周 %', v: this.signed(Fmt.round(rev.trend.perWeekPct * 100, 2), '%') },
          { k: '可信度', v: { high: '高', mid: '中', low: '低' }[rev.trend.confidence] || '低' },
          { k: '波动', v: '±' + rev.window.sd + 'kg' }
        ]) +
        '<div class="muted txs" style="margin-top:6px">目标：' + Fmt.esc(rev.target.tip) +
        ' · 可信区间 ' + rev.trend.ci.lowKg + ' ~ ' + rev.trend.ci.highKg + ' kg/周</div>'
    } else {
      // 数据不够
      const p = rev.progress || {}
      body += UI.bar('体重记录进度',
        Math.min(p.havePoints || 0, p.needPoints || 4), p.needPoints || 4, '次') +
        UI.bar('跨度天数',
          Math.min(p.haveDays || 0, p.needDays || 7), p.needDays || 7, '天') +
        (sp.length >= 2 ? '<div style="margin-top:8px">' + UI.sparkline(sp, { h: 84 }) + '</div>' : '')
    }

    if (rev.headline) {
      body += '<div style="margin-top:10px;padding:10px 12px;border-radius:var(--r-sm);background:var(--green-soft)">' +
        '<b style="color:var(--green-dark)">' + Fmt.esc(rev.headline) + '</b>' +
        '<div class="muted txs" style="margin-top:4px">' + Fmt.esc(rev.message) + '</div></div>'
    } else {
      body += '<div class="muted txs" style="margin-top:8px">' + Fmt.esc(rev.reason || '') + '</div>'
    }

    // 调整前后对比（只有真能调的时候才显示）
    let action = ''
    if (rev.action) {
      const after = Object.assign({}, u.dietState || {})
      after.macro = Object.assign({}, (u.dietState || {}).macro, { kcalAdj: rev.action.kcalAfter })
      const e2 = ENGINE.calc.energyPlan(u.profile, ENGINE.macro.combinedAdj(after))
      action =
        '<div style="margin-top:10px;border-top:1px dashed var(--line);padding-top:8px">' +
        UI.deltaRow('碳水', e.carb, e2.carb, 'g') +
        UI.deltaRow('热量', e.kcal, e2.kcal, 'kcal') +
        UI.deltaRow('每日热量杠杆', (rev.action.kcalBefore >= 0 ? '+' : '') + rev.action.kcalBefore,
          (rev.action.kcalAfter >= 0 ? '+' : '') + rev.action.kcalAfter, ' kcal') +
        '<div class="muted txs">（蛋白 ' + e2.protein + 'g、脂肪 ' + e2.fat + 'g 都不动——只加碳水，不会顺手把蛋白压下去）</div>' +
        '<button class="btn" style="margin-top:10px" onclick="PageDiet.applyMacro()">应用这次调整</button>' +
        '</div>'
    }

    // 历史留痕
    const hist = bd.macroHistory
    const histHtml = hist.length
      ? '<div style="margin-top:10px;border-top:1px dashed var(--line);padding-top:8px">' +
        '<div class="muted txs" style="margin-bottom:4px">调整记录（每次调整至少隔 7 天）</div>' +
        hist.map(h => UI.li(Fmt.esc(h.date) + ' · ' + this.verdictCN(h.reason),
          this.signed(h.perWeek, 'kg/周'),
          this.signed(h.carbGrams || 0, 'g 碳水'))).join('') +
        '</div>'
      : ''

    return '<div class="card"><h2>宏观调控 ' + head + '</h2>' + body + action + histHtml + '</div>'
  },

  /** 当前生效的各路偏移汇总 */

  // ───── 饮食记录：今天吃了什么（存本机 localStorage，不上云）─────
  LOG_KEY: 'lbgym_dietlog',
  logOf(date) {
    try { return (JSON.parse(localStorage.getItem(this.LOG_KEY) || '{}'))[date] || [] } catch (e) { return [] }
  },
  logSave(date, list) {
    try {
      const all = JSON.parse(localStorage.getItem(this.LOG_KEY) || '{}')
      all[date] = list
      localStorage.setItem(this.LOG_KEY, JSON.stringify(all))
    } catch (e) { /* 存满了就算了 */ }
  },
  flPick: null,

  /**
   * 消耗与缺口总账（用户 2026-10-15：总消耗/缺口原来埋在小字里，"我什么都不知道怎么把握"）。
   * 三个大数 + 一句大白话 + 减脂/增肌速度预估。数字全部引擎算的，不编。
   */
  energyCard(e, prof, u) {
    if (!e || !e.tdee) return ''
    const goal = (prof && prof.goal) || '塑形'
    const deficit = Math.round(e.tdee - e.kcal)          // 正=缺口（吃得比消耗少），负=盈余
    const adj = (u && u.dietState && u.dietState.kcalAdj) || 0
    const hasAdj = adj !== 0
    // 速度预估：7700 kcal ≈ 1kg 脂肪；增肌盈余 130/天 ≈ 每周 +0.12kg
    const perWeek = Math.abs(Math.round(deficit * 7 / 7700 * 100) / 100)
    const bowl = Math.abs(Math.round(deficit / 232 * 10) / 10)   // 一碗 200g 熟米饭 ≈ 232 kcal
    const big = (v, k, c) => '<div style="flex:1;text-align:center"><div style="font-size:26px;font-weight:800;color:' + (c || 'var(--tx)') + '">' + v + '</div><div class="muted txs">' + k + '</div></div>'
    let line = ''
    if (deficit > 0) {
      line = '每天缺口 <b>' + deficit + ' kcal</b>' + (bowl > 0 ? ' ≈ 少吃 ' + bowl + ' 碗米饭' : '') +
        '，按这个速度 <b>每周约 -' + perWeek + 'kg</b>（0.3-0.8 之间算健康）。缺口来自「减脂目标 -300' +
        (hasAdj ? ' + 你在「调一下」里手动调的 ' + (adj > 0 ? '+' : '') + adj : '') + '」。'
    } else if (deficit < 0) {
      line = '每天盈余 <b>' + (-deficit) + ' kcal</b>（吃得比消耗多），按这个速度 <b>每周约 +' + perWeek + 'kg</b>（增肌期 0.2-0.4 合适）。' +
        '盈余来自「增肌目标 +130' + (hasAdj ? ' + 手动调的 ' + (adj > 0 ? '+' : '') + adj : '') + '」。'
    } else {
      line = '吃和消耗持平（塑形维持）。'
    }
    return '<div class="card"><h2>消耗与缺口 <span class="mini">' + Fmt.esc(goal) + '</span></h2>' +
      '<div style="display:flex;gap:4px;margin-top:8px">' +
        big(Fmt.num(e.tdee), '你每天总消耗') +
        big(Fmt.num(e.kcal), '建议每天吃', 'var(--green)') +
        big((deficit > 0 ? '-' : deficit < 0 ? '+' : '±') + Math.abs(deficit), deficit > 0 ? '缺口/天' : deficit < 0 ? '盈余/天' : '持平') +
      '</div>' +
      '<div class="muted txs" style="margin-top:10px;border-top:1px dashed var(--line);padding-top:8px">' + line +
        ' 总消耗 = 基础代谢 ' + e.bmr + ' × 活动系数 ' + (e.activity ? e.activity.factor : '—') +
        '（' + (e.activity ? Fmt.esc(e.activity.name) : '—') + '）。觉得误差大，把活动系数调准比啥都强。</div>' +
    '</div>'
  },

  // ───── 四餐模型（2026-10-19 用户指定：早餐/午餐/晚餐/加餐，加餐=练后餐/宵夜/随手记）─────
  MEALS: [
    { k: 'b', name: '早餐' },
    { k: 'l', name: '午餐' },
    { k: 'd', name: '晚餐' },
    { k: 's', name: '加餐' }
  ],
  mealName(k) { const m = this.MEALS.find(x => x.k === k); return m ? m.name : '加餐' },
  curMeal: 'b',     // 当前添加目标餐次
  flTab: 'lib',     // 添加面板页签：freq 常用 / lib 食物库（默认，搜索是主路径）/ recent 最近 / tpl 套餐

  /** 全部历史记录（跨日期，倒序）—— 常用/最近/套餐的数据源 */
  logAll() {
    let all = []
    try { all = JSON.parse(localStorage.getItem(this.LOG_KEY) || '{}') } catch (e) { return [] }
    return Object.keys(all).sort().reverse().reduce((out, d) => out.concat((all[d] || []).map(f => Object.assign({ _date: d }, f))), [])
  },

  /** 常用食物：按名字聚合出现次数，取前 12 */
  freqFoods() {
    const cnt = {}
    this.logAll().forEach(f => { cnt[f.name] = (cnt[f.name] || 0) + 1 })
    return Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 12).map(n => ({ name: n, count: cnt[n] }))
  },

  /** 最近记录：去重后取前 12 */
  recentFoods() {
    const seen = new Set(), out = []
    for (const f of this.logAll()) {
      if (seen.has(f.name)) continue
      seen.add(f.name); out.push(f)
      if (out.length >= 12) break
    }
    return out
  },

  // ───── 套餐（餐次模板）：保存过的一餐，下次一键套用 ─────
  TPL_KEY: 'lbgym_mealTpl',
  tplAll() {
    try { return JSON.parse(localStorage.getItem(this.TPL_KEY) || '[]') } catch (e) { return [] }
  },
  tplSave(name, items, meal) {
    const list = this.tplAll().filter(t => t.name !== name)
    list.unshift({ name, meal, items, at: Fmt.todayStr() })
    try { localStorage.setItem(this.TPL_KEY, JSON.stringify(list.slice(0, 30))) } catch (e) { UI.toast('本机空间不足，套餐没存上') }
  },
  tplDel(name) {
    const list = this.tplAll().filter(t => t.name !== name)
    try { localStorage.setItem(this.TPL_KEY, JSON.stringify(list)) } catch (e) {}
    this.flRefresh(); this.paintPanel()
  },
  /** 套餐详情（弹窗查看：条目+营养，可删可套用） */
  tplView(name) {
    const t = this.tplAll().find(x => x.name === name)
    if (!t) return
    const sum = t.items.reduce((a, f) => ({ k: a.k + (f.kcal || 0) * (f.g || 100) / 100, p: a.p + (f.protein || 0) * (f.g || 100) / 100 }), { k: 0, p: 0 })
    UI.modal({
      title: '套餐 · ' + name,
      body: '<div class="muted txs">保存于 ' + Fmt.esc(t.at || '') + ' · 共 ' + t.items.length + ' 种食物（按 100g 记录）</div>' +
        '<div style="margin-top:8px">' + t.items.map(f =>
          '<div class="li"><span class="nm">' + Fmt.esc(f.name) + '</span><span class="mc">' + Math.round(f.kcal || 0) + ' kcal/100g</span></div>').join('') + '</div>' +
        '<div class="muted txs" style="margin-top:8px">合计约 ' + Math.round(sum.k) + ' kcal · 蛋白 ' + Math.round(sum.p) + 'g（按 100g/种估算，套用后可逐条删改）</div>' +
        '<button class="btn ghost" style="margin-top:10px" onclick="PageDiet.tplDel(\'' + Fmt.esc(name) + '\');UI.toast(\'套餐已删除\')">删除这个套餐</button>',
      okText: '套用到「' + this.mealName(this.curMeal) + '」',
      onOk: () => {
        t.items.forEach(f => this.flAddByName(f.name, f.g || 100))
        UI.toast('已套用 ' + t.items.length + ' 项到' + this.mealName(this.curMeal))
      }
    })
  },
  tplSaveCurrent() {
    const list = this.logOf(Fmt.todayStr()).filter(f => (f.meal || 's') === this.curMeal)
    if (!list.length) { UI.toast('这一餐还没有记录'); return }
    const def = this.mealName(this.curMeal) + ' ' + Fmt.todayStr().slice(5).replace('-', '/')
    UI.modal({
      title: '把这餐存成套餐',
      body: '<div class="muted txs">' + list.length + ' 项 · 合计 ' + Math.round(list.reduce((a, f) => a + (f.kcal || 0), 0)) + ' kcal</div>' +
        '<input id="tplName" class="pro-input" placeholder="套餐名，如：我的早餐" value="' + Fmt.esc(def) + '" style="margin-top:8px">',
      okText: '保存套餐',
      onOk: () => {
        const name = String((document.getElementById('tplName') || {}).value || '').trim() || def
        this.tplSave(name, list.map(f => ({ name: f.name, g: f.g, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat })), this.curMeal)
        this.flTab = 'tpl'; this.paintPanel()
        UI.toast('已存套餐「' + name + '」')
      }
    })
  },

  /** 每日目标 + 今日补给 合并卡（2026-10-19 二次压缩：行式，参考赛博教练排版——一行一营养素，柱子细、已吃+百分比同行） */
  goalCard(e, prof, u) {
    const hasBody = Number(prof.weight) > 0 && Number(prof.height) > 0
    const list = this.logOf(Fmt.todayStr())
    const tot = list.reduce((a, f) => ({ k: a.k + (Number(f.kcal) || 0), p: a.p + (Number(f.protein) || 0), c: a.c + (Number(f.carbs) || 0), f: a.f + (Number(f.fat) || 0) }), { k: 0, p: 0, c: 0, f: 0 })
    const goal = prof.goal || '塑形'
    const deficit = Math.round((e.tdee || 0) - (e.kcal || 0))
    // 一句话说明：目标类型 + 每日消耗 + 摄入要求 + 缺口
    const line = goal === '减脂'
      ? '每日消耗 <b>' + Fmt.num(e.tdee) + '</b> · 摄入 <b>' + Fmt.num(e.kcal) + '</b> kcal（缺口 ' + deficit + '）'
      : goal === '增肌'
        ? '每日消耗 <b>' + Fmt.num(e.tdee) + '</b> · 摄入 <b>' + Fmt.num(e.kcal) + '</b> kcal（盈余 +' + (-deficit) + '）'
        : '每日消耗 <b>' + Fmt.num(e.tdee) + '</b> · 摄入 <b>' + Fmt.num(e.kcal) + '</b> kcal（' + (deficit > 0 ? '微缺口 ' + deficit : '走平') + '）'
    const row = (label, got, target, unit, cls) => {
      const pctv = target > 0 ? Math.round(got / target * 100) : 0
      const over = target > 0 && got > target
      return '<div class="grow ' + cls + (over ? ' is-over' : '') + '">' +
        '<div class="grow-h"><span class="grow-l">' + label + '</span>' +
        '<span class="grow-v"><b>' + Fmt.num(got, 0) + '</b> / ' + Fmt.num(target) + ' ' + unit + '</span>' +
        '<span class="grow-p">' + pctv + '%</span></div>' +
        '<div class="gc-bar"><i style="width:' + Math.min(100, pctv) + '%"></i></div></div>'
    }
    const kcalLeft = Math.max(0, (e.kcal || 0) - tot.k)
    return '<div class="card" id="goalCardBox">' +
      '<div class="row between" style="align-items:baseline"><h2>每日目标</h2>' +
        '<span class="muted txs">' + line + '</span></div>' +
      // 大字：已吃 / 目标（热量单独一行大数，参考竞品）
      '<div class="kcal-big"><div><b>' + Fmt.num(tot.k, 0) + '</b><span> kcal 已吃</span></div>' +
        '<div class="kcal-left">' + (deficit >= 0 ? '还差 ' + Fmt.num(kcalLeft, 0) + ' kcal 到目标' : '已超 ' + Fmt.num(-deficit + kcalLeft ? tot.k - (e.kcal || 0) : 0, 0) + ' kcal') + '</div></div>' +
      row('热量', tot.k, e.kcal, 'kcal', 'g-kcal') +
      row('蛋白质', tot.p, e.protein, 'g', 'g-pro') +
      row('碳水', tot.c, e.carb, 'g', 'g-carb') +
      row('脂肪', tot.f, e.fat, 'g', 'g-fat') +
      '<details class="diet-basis"><summary>营养目标说明</summary><div class="muted txs" style="margin-top:8px">基础代谢 ' + e.bmr + ' × 活动系数 ' +
        (e.activity ? e.activity.factor : '—') + (e.activity ? '（' + Fmt.esc(e.activity.name) + '）' : '') +
        ' = ' + e.tdee + ' kcal；' + (deficit > 0 ? '缺口 ' + deficit : deficit < 0 ? '盈余 +' + (-deficit) : '维持') + ' kcal（谭成义口径：蛋白 ' + (hasBody ? Fmt.round(e.protein / prof.weight, 2) : '—') + ' g/kg、脂肪 ' + (hasBody ? Fmt.round(e.fat / prof.weight, 2) : '—') + ' g/kg）' +
        (hasBody ? ' · BMI ' + ENGINE.calc.bmi(prof.weight, prof.height) + '（' + Fmt.esc(ENGINE.calc.bmiCat(ENGINE.calc.bmi(prof.weight, prof.height)).txt) + '）' : '') + '</div>' +
        this.adjustLine(u, Store.adj()) + '</details>' +
    '</div>'
  },

  nutritionBars(e) {
    const list=this.logOf(Fmt.todayStr())
    const total=list.reduce((a,f)=>({k:a.k+(Number(f.kcal)||0),p:a.p+(Number(f.protein)||0),c:a.c+(Number(f.carbs)||0),f:a.f+(Number(f.fat)||0)}),{k:0,p:0,c:0,f:0})
    return '<div class="nutrition-head"><div><h2>今日补给</h2><p class="nutrition-caption">今天已吃的热量和营养</p></div><span class="tag">'+list.length+' 笔记录</span></div><div class="nutrition-grid">'+
      [['热量',total.k,e.kcal,'kcal','calorie'],['蛋白质',total.p,e.protein,'g','protein'],['碳水',total.c,e.carb,'g','carb'],['脂肪',total.f,e.fat,'g','fat']].map(x=>{
        const value=Math.round(x[1]*10)/10,target=Number(x[2])||0,over=target>0&&x[1]>target,pct=target?Math.min(100,x[1]/target*100):0
        return '<div class="nutrient '+x[4]+(over?' is-over':'')+'"><div class="nutrient-title"><b>'+x[0]+'</b><span>'+(over?'已超目标':target&&pct>=100?'已达目标':'已摄入')+'</span></div><div class="nutrient-value"><strong>'+Fmt.num(value,1)+'</strong><span class="nutrient-unit">'+x[3]+'</span></div><div class="nutrient-target">每日目标 '+Fmt.num(target)+' '+x[3]+'</div><div class="nutrient-track" role="progressbar" aria-label="'+x[0]+'摄入" aria-valuemin="0" aria-valuemax="'+target+'" aria-valuenow="'+Math.min(value,target)+'" aria-valuetext="已摄入 '+value+'，目标 '+target+' '+x[3]+'"><i style="width:'+pct+'%"></i></div><div class="nutrient-status">'+(over?'超出 '+Fmt.num(x[1]-target,1)+' '+x[3]:target?'还可摄入 '+Fmt.num(Math.max(0,target-x[1]),1)+' '+x[3]:'暂无目标')+'</div></div>'
      }).join('')+'</div><p class="nutrition-note">红色表示超过当前参考目标，并不等于这一餐不健康；正常安排下一餐，结合长期趋势调整。</p>'
  },

  foodLogCard(e, prof) {
    const list = this.logOf(Fmt.todayStr())
    return '<div class="card" id="flCard">' +
      '<div class="row between" style="align-items:baseline"><h2 style="margin:0">今天吃了什么</h2>' +
        '<span class="muted txs">记到对应的餐次里</span></div>' +
      // ── 四餐页签 ──
      '<div class="wrap-row" style="margin-top:10px" id="mealTabs">' +
        this.MEALS.map(m => '<button class="chip' + (this.curMeal === m.k ? ' on' : '') + '" onclick="PageDiet.setMeal(\'' + m.k + '\')">' + m.name +
          ' <span class="muted txs">' + list.filter(f => (f.meal || 's') === m.k).length + '</span></button>').join('') +
      '</div>' +
      // ── 各餐记录（紧凑）──
      '<div id="mealLists" style="margin-top:6px">' + this.mealListsHTML(list) + '</div>' +
      // ── 添加入口：收进弹层（2026-10-19 用户反馈：面板堆主页越拉越长）──
      '<button class="btn" style="margin-top:10px" onclick="PageDiet.openFoodPanel()">＋ 添加食物（搜索 / 常用 / 最近 / 套餐）</button>' +
    '</div>'
  },

  /** 添加食物弹层（参考赛博教练「选择食物」独立页：页签+搜索+分类，不占主页空间） */
  openFoodPanel() {
    UI.modal({
      title: '添加食物 → ' + this.mealName(this.curMeal),
      body: '<div class="wrap-row" id="flTabs">' +
          [['freq', '常用'], ['lib', '食物库'], ['recent', '最近'], ['tpl', '套餐']].map(x =>
            '<button class="chip' + (this.flTab === x[0] ? ' on' : '') + '" onclick="PageDiet.setFlTab(\'' + x[0] + '\')">' + x[1] + '</button>').join('') +
          '<button class="chip" style="margin-left:auto" onclick="PageDiet.tplSaveCurrent();">💾 存这餐为套餐</button>' +
        '</div>' +
        '<div id="flPanel" style="margin-top:10px">' + this.flPanel() + '</div>' +
        '<div class="muted txs" style="margin-top:6px">记入「' + this.mealName(this.curMeal) + '」—— 要换餐次先关掉弹层点上面的餐次页签。</div>',
      okText: '完成',
      after: () => { this.bindFood(); this.bindMealCard() }
    })
    // modal onOk 后节点还在 —— 手动绑一次
    setTimeout(() => { this.bindFood(); this.bindMealCard() }, 50)
  },

  setMeal(k) { this.curMeal = k; PageDiet.render() },
  setFlTab(tab) { this.flTab = tab; this.paintPanel() },

  /** 添加面板（按页签局部重绘） */
  flPanel() {
    if (this.flTab === 'freq') {
      const list = this.freqFoods()
      return list.length
        ? '<div class="muted txs" style="margin-bottom:6px">你记过的食物，按次数排 —— 点名字选克重记入「' + this.mealName(this.curMeal) + '」</div>' +
          '<div class="fc-chips">' + list.map(x =>
            '<button class="chip sm" data-food="' + Fmt.esc(x.name) + '">' + Fmt.esc(x.name) + ' <span class="muted">×' + x.count + '</span></button>').join('') + '</div>'
        : '<div class="muted txs">还没有常用食物 —— 记过几次之后，这里就是你最常吃的。</div>'
    }
    if (this.flTab === 'recent') {
      const list = this.recentFoods()
      return list.length
        ? '<div class="muted txs" style="margin-bottom:6px">最近记过的（含今天）</div>' +
          '<div class="fc-chips">' + list.map(f =>
            '<button class="chip sm" data-food="' + Fmt.esc(f.name) + '">' + Fmt.esc(f.name) + ' <span class="muted">' + Fmt.esc((f._date || '').slice(5)) + '</span></button>').join('') + '</div>'
        : '<div class="muted txs">还没有记录。</div>'
    }
    if (this.flTab === 'tpl') {
      const list = this.tplAll()
      return list.length
        ? '<div class="muted txs" style="margin-bottom:6px">存过的套餐 —— 点开查看/套用到「' + this.mealName(this.curMeal) + '」。吃一样的时候就不用一项项记了。</div>' +
          list.map(t => '<div class="li" style="cursor:pointer" onclick="PageDiet.tplView(\'' + Fmt.esc(t.name) + '\')">' +
            '<span class="nm">' + Fmt.esc(t.name) + '</span>' +
            '<span class="mc">' + t.items.length + ' 项 · ' + this.mealName(t.meal) + '</span>' +
            '<span class="del" onclick="event.stopPropagation();PageDiet.tplDel(\'' + Fmt.esc(t.name) + '\')">✕</span></div>').join('')
        : '<div class="muted txs">还没有套餐 —— 记完一餐点「💾 存这餐为套餐」，下次吃一样的直接套用。</div>'
    }
    // lib：食物库（搜索 + 分类）
    return this.foodLibInner()
  },

  paintPanel() {
    const el = document.getElementById('flPanel')
    if (el) el.innerHTML = this.flPanel()
    this.bindFood()
    this.bindMealCard()
  },

  /** 四餐记录列表（每餐小计 + 条目，onclick 传原始 index） */
  mealListsHTML(list) {
    return this.MEALS.map(m => {
      const items = list.map((f, i) => ({ f, i })).filter(x => (x.f.meal || 's') === m.k)
      const sum = items.reduce((a, x) => ({ k: a.k + (x.f.kcal || 0), p: a.p + (x.f.protein || 0) }), { k: 0, p: 0 })
      return '<div style="padding:6px 0;border-top:1px solid var(--line)">' +
        '<div class="row between"><b style="font-size:13px">' + m.name + '</b>' +
        '<span class="muted txs">' + (items.length ? items.length + ' 项 · ' + Math.round(sum.k) + ' kcal · 蛋白 ' + Math.round(sum.p) + 'g' : '还没记') + '</span></div>' +
        (items.length
          ? items.map(x => '<div class="li"><span class="nm">' + Fmt.esc(x.f.name) + ' ' + x.f.g + 'g</span>' +
              '<span class="mc">' + Math.round(x.f.kcal) + 'kcal · 蛋白' + Math.round(x.f.protein) + 'g · 碳水' + Math.round(x.f.carbs) + 'g · 脂肪' + Math.round(x.f.fat) + 'g</span>' +
              '<span class="del" onclick="PageDiet.flDel(' + x.i + ')">✕</span></div>').join('')
          : '') +
      '</div>'
    }).join('')
  },

  bindMealCard() {
    const card = document.getElementById('flCard')
    if (!card) return
    card.onclick = e => {
      let el = e.target
      while (el && el !== card) {
        if (el.dataset && el.dataset.food) { this.showFood(el.dataset.food); return }
        el = el.parentNode
      }
    }
    // 弹层里的 chips 也要能点（modal 在 body 末尾，不在 flCard 内）
    const mb = document.getElementById('modalbox')
    if (mb && !mb._dietBound) {
      mb._dietBound = true
      mb.addEventListener('click', e => {
        let el = e.target
        while (el && el !== mb) {
          if (el.dataset && el.dataset.food) { this.showFood(el.dataset.food); return }
          el = el.parentNode
        }
      })
    }
  },

  /** 局部刷新（加食物后：目标卡+四餐列表+餐次计数） */
  flRefresh() {
    const e = ENGINE.calc.energyPlan(Store.state.user.profile, Store.adj())
    const goalBox = document.getElementById('goalCardBox')
    if (goalBox) goalBox.outerHTML = this.goalCard(e, Store.state.user.profile, Store.state.user)
    const listEl = document.getElementById('mealLists')
    if (listEl) listEl.innerHTML = this.mealListsHTML(this.logOf(Fmt.todayStr()))
    const tabs = document.getElementById('mealTabs')
    if (tabs) {
      const list = this.logOf(Fmt.todayStr())
      tabs.innerHTML = this.MEALS.map(m => '<button class="chip' + (this.curMeal === m.k ? ' on' : '') + '" onclick="PageDiet.setMeal(\'' + m.k + '\')">' + m.name +
        ' <span class="muted txs">' + list.filter(f => (f.meal || 's') === m.k).length + '</span></button>').join('')
    }
    const panel = document.getElementById('flPanel')
    if (panel) { panel.innerHTML = this.flPanel(); this.bindFood() }
  },
  setMeal(k) { this.curMeal = k; Router.rerender ? Router.rerender() : PageDiet.render() },
  setFlTab(tab) { this.flTab = tab; this.paintPanel() },

  /** 添加面板（按页签局部重绘） */
  flPanel() {
    if (this.flTab === 'freq') {
      const list = this.freqFoods()
      return list.length
        ? '<div class="muted txs" style="margin-bottom:6px">你记过的食物，按次数排 —— 点名字选克重记入「' + this.mealName(this.curMeal) + '」</div>' +
          '<div class="fc-chips">' + list.map(x =>
            '<button class="chip sm" data-food="' + Fmt.esc(x.name) + '">' + Fmt.esc(x.name) + ' <span class="muted">×' + x.count + '</span></button>').join('') + '</div>'
        : '<div class="muted txs">还没有常用食物 —— 记过几次之后，这里就是你最常吃的。</div>'
    }
    if (this.flTab === 'recent') {
      const list = this.recentFoods()
      return list.length
        ? '<div class="muted txs" style="margin-bottom:6px">最近记过的（含今天）</div>' +
          '<div class="fc-chips">' + list.map(f =>
            '<button class="chip sm" data-food="' + Fmt.esc(f.name) + '">' + Fmt.esc(f.name) + ' <span class="muted">' + Fmt.esc((f._date || '').slice(5)) + '</span></button>').join('') + '</div>'
        : '<div class="muted txs">还没有记录。</div>'
    }
    if (this.flTab === 'tpl') {
      const list = this.tplAll()
      return list.length
        ? '<div class="muted txs" style="margin-bottom:6px">存过的套餐 —— 点开查看/套用到「' + this.mealName(this.curMeal) + '」。吃一样的时候就不用一项项记了。</div>' +
          list.map(t => '<div class="li" style="cursor:pointer" onclick="PageDiet.tplView(\'' + Fmt.esc(t.name) + '\')">' +
            '<span class="nm">' + Fmt.esc(t.name) + '</span>' +
            '<span class="mc">' + t.items.length + ' 项 · ' + this.mealName(t.meal) + '</span>' +
            '<span class="del" onclick="event.stopPropagation();PageDiet.tplDel(\'' + Fmt.esc(t.name) + '\')">✕</span></div>').join('')
        : '<div class="muted txs">还没有套餐 —— 记完一餐点「💾 存这餐为套餐」，下次吃一样的直接套用。</div>'
    }
    // lib：食物库（搜索 + 分类）
    return this.foodLibInner()
  },

  paintPanel() {
    const el = document.getElementById('flPanel')
    if (el) el.innerHTML = this.flPanel()
    this.bindFood()
    this.bindMealCard()
  },

  /** 四餐记录列表（每餐小计 + 条目，onclick 传原始 index） */
  mealListsHTML(list) {
    const e = ENGINE.calc.energyPlan(Store.state.user.profile, Store.adj())
    return this.MEALS.map(m => {
      const items = list.map((f, i) => ({ f, i })).filter(x => (x.f.meal || 's') === m.k)
      const sum = items.reduce((a, x) => ({ k: a.k + (x.f.kcal || 0), p: a.p + (x.f.protein || 0) }), { k: 0, p: 0 })
      return '<div style="padding:8px 0;border-top:1px solid var(--line)">' +
        '<div class="row between"><b style="font-size:13px">' + m.name + '</b>' +
        '<span class="muted txs">' + (items.length ? items.length + ' 项 · ' + Math.round(sum.k) + ' kcal · 蛋白 ' + Math.round(sum.p) + 'g' : '还没记') + '</span></div>' +
        (items.length
          ? items.map(x => '<div class="li"><span class="nm">' + Fmt.esc(x.f.name) + ' ' + x.f.g + 'g</span>' +
              '<span class="mc">' + Math.round(x.f.kcal) + 'kcal · 蛋白' + Math.round(x.f.protein) + ' · 碳水' + Math.round(x.f.carbs) +
              ' · 脂肪' + Math.round(x.f.fat) + 'g</span>' +
              '<span class="del" onclick="PageDiet.flDel(' + x.i + ')">✕</span></div>').join('')
          : '') +
      '</div>'
    }).join('')
  },

  bindMealCard() {
    const card = document.getElementById('flCard')
    if (!card) return
    card.onclick = e => {
      let el = e.target
      while (el && el !== card) {
        if (el.dataset && el.dataset.food) { this.showFood(el.dataset.food); return }
        el = el.parentNode
      }
    }
  },

  /** 局部刷新记录列表与合计（不整页重绘 —— 加食物时不丢搜索状态和滚动位置） */
  flRefresh() {
    const e = ENGINE.calc.energyPlan(Store.state.user.profile, Store.adj())
    const goalBox = document.getElementById('goalCardBox')
    if (goalBox) goalBox.outerHTML = this.goalCard(e, Store.state.user.profile, Store.state.user)
    const listEl = document.getElementById('mealLists')
    if (listEl) listEl.innerHTML = this.mealListsHTML(this.logOf(Fmt.todayStr()))
    const tabs = document.getElementById('mealTabs')
    if (tabs) {
      const list = this.logOf(Fmt.todayStr())
      tabs.innerHTML = this.MEALS.map(m => '<button class="chip' + (this.curMeal === m.k ? ' on' : '') + '" onclick="PageDiet.setMeal(\'' + m.k + '\')">' + m.name +
        ' <span class="muted txs">' + list.filter(f => (f.meal || 's') === m.k).length + '</span></button>').join('')
    }
    const panel = document.getElementById('flPanel')
    if (panel) { panel.innerHTML = this.flPanel(); this.bindFood(); this.bindMealCard() }
  },
  /** 食物库/弹窗一键记入（名字需在库内；g 默认 100） */
  flAddByName(name, g) {
    const f = ENGINE.kb.FOODS.find(x => x.name === name) || ENGINE.kb.matchFood(name)
    if (!f) { UI.toast('库里没有「' + name + '」'); return }
    this.flPush(f, Number(g) || 100)
    this.flRefresh()
    UI.toast('已记 ' + f.name + ' ' + (Number(g) || 100) + 'g')
  },
  flHints() {
    const q = (document.getElementById('flQ').value || '').trim().toLowerCase()
    const box = document.getElementById('flHints')
    if (!q) { box.innerHTML = ''; return }
    const F = ENGINE.kb.FOODS
    const hits = []
    for (let i = 0; i < F.length && hits.length < 8; i++) {
      const f = F[i]
      if (f.name.toLowerCase().includes(q) || (f.alias || []).some(a => String(a).toLowerCase().includes(q))) hits.push(i)
    }
    box.innerHTML = hits.length
      ? hits.map(i => '<div class="li" style="cursor:pointer" onclick="PageDiet.flSel(' + i + ')"><span class="nm">' + Fmt.esc(F[i].name) +
          '</span><span class="mc">' + F[i].kcal + 'kcal/100g</span></div>').join('')
      : '<div class="muted txs">没搜到 —— 换个叫法试试（别名也搜得到）</div>'
  },
  flSel(idx) {
    const f = ENGINE.kb.FOODS[idx]
    if (!f) return
    document.getElementById('flQ').value = f.name
    // 统一交互：搜到也弹克重选择器（份量行 + 自定义克数），不再依赖单独的克数输入框
    this.showFood(f.name)
  },
  flAdd() {
    if (!this.flPick) { UI.toast('先搜并点选一个食物'); return }
    const g = Number(document.getElementById('flG').value) || 100
    const f = this.flPick, k = g / 100
    const today = Fmt.todayStr()
    const list = this.logOf(today)
    list.push({ name: f.name, g: g, kcal: f.kcal * k, protein: f.protein * k, carbs: f.carbs * k, fat: f.fat * k })
    this.logSave(today, list)
    this.flPick = null
    const q = document.getElementById('flQ'); if (q) q.value = ''
    const h = document.getElementById('flHints'); if (h) h.innerHTML = ''
    this.flRefresh()
  },
  flDel(i) {
    const today = Fmt.todayStr()
    const list = this.logOf(today)
    list.splice(i, 1)
    this.logSave(today, list)
    this.flRefresh()
  },


  // ───── 一键记入：分餐方案 → 今日吃了什么（不再手动搜索）─────
  flAddParsed(name, g) {
    const f = ENGINE.kb.FOODS.find(x => x.name === name)
    if (!f) { UI.toast('食物库里没有「' + name + '」，手动搜一下'); return }
    this.flPush(f, g)
  },
  flAddDish(mi, di) {
    const u = Store.state.user
    const adj = Store.adj()
    const e = ENGINE.calc.energyPlan(u.profile, adj)
    const mode = (u.profile || {}).dietMode || 'simple'
    const day = ENGINE.diet.buildDay(e, mode, { seed: this.seedOfToday() })
    const dish = ((day.meals || [])[mi] || {}).dishes?.[di]
    if (!dish) return
    const missing = []
    ;(dish.items || []).forEach(it => {
      const f = ENGINE.kb.FOODS.find(x => x.name === it.food)
      if (f) this.flPush(f, it.g)
      else missing.push(it.food)
    })
    UI.toast(missing.length ? '已记大部分；「' + missing[0] + '」没在库里，手动搜一下' : '已记入「' + dish.name + '」')
    this.flRefresh()
  },
  flAddMeal(mi) {
    const u = Store.state.user
    const adj = Store.adj()
    const e = ENGINE.calc.energyPlan(u.profile, adj)
    const mode = (u.profile || {}).dietMode || 'simple'
    const day = ENGINE.diet.buildDay(e, mode, { seed: this.seedOfToday() })
    const meal = (day.meals || [])[mi]
    if (!meal) return
    let n = 0
    ;(meal.dishes || []).forEach(d => (d.items || []).forEach(it => {
      const f = ENGINE.kb.FOODS.find(x => x.name === it.food)
      if (f) { this.flPush(f, it.g); n++ }
    }))
    UI.toast(n ? '已整餐记入（' + n + ' 项）' : '这一餐没有可记的库内食物')
    this.flRefresh()
  },
  flPush(f, g) {
    const k = g / 100
    const list = this.logOf(Fmt.todayStr())
    const exist = list.find(x => x.name === f.name && (x.meal || 's') === this.curMeal)
    if (exist) {
      exist.g += g; exist.kcal += f.kcal * k; exist.protein += f.protein * k; exist.carbs += f.carbs * k; exist.fat += f.fat * k
      exist.fiber = (exist.fiber || 0) + (f.fiber || 0) * k
    } else list.push({ name: f.name, g: g, meal: this.curMeal, kcal: f.kcal * k, protein: f.protein * k, carbs: f.carbs * k, fat: f.fat * k, fiber: (f.fiber || 0) * k })
    this.logSave(Fmt.todayStr(), list)
  },


  // ───── 三餐参考（2026-10-19 重做：独立的页，替代旧「今天怎么分配」——旧版按宏量单一映射，
  //       早餐 185g 燕麦不现实、没考虑食物复合营养。新版：每餐=主食+蛋白+蔬菜+油脂组合，
  //       克数按各自营养密度折算、蛋白食物自带脂肪从油脂预算扣除，克数可调、一键记入实际吃的。）─────
  REF_PCT: { b: 0.27, l: 0.35, s: 0.10, d: 0.28 },   // 早/午/加餐(练后)/晚 的热量配额
  REF_POOL: {
    staple: ['米饭(熟)', '燕麦片', '红薯', '全麦面包', '面条(熟)'],
    protein: ['鸡胸肉', '鸡蛋', '牛肉(瘦)', '虾', '三文鱼'],
    veg: ['西兰花', '菠菜', '番茄', '生菜'],
    fat: ['橄榄油', '花生', '牛油果', '杏仁']
  },
  refMeals(e, prof) {
    const seed = this.seedOfToday()
    const pick = (arr, off) => arr[(seed + off) % arr.length]
    const F = ENGINE.kb.FOODS
    const find = n => F.find(x => x.name === n) || {}
    const per100 = n => { const x = find(n); return { kcal: x.kcal || 0, protein: x.protein || 0, carbs: x.carbs || 0, fat: x.fat || 0 } }
    const meals = []
    const eggNote = '鸡蛋按 1 个 ≈ 50g 计'
    this.MEALS.forEach((m, mi) => {
      const pct = this.REF_PCT[m.k]
      const ck = (e.kcal || 0) * pct, pg = (e.protein || 0) * pct, cb = (e.carb || 0) * pct, ft = (e.fat || 0) * pct
      let items = []
      if (m.k === 's') {
        // 加餐（练后）：香蕉 + 蛋白粉 —— 简单直接
        items = [
          { name: '香蕉', g: 1, unit: '根', gramLabel: '约 120g/根', ...per100('香蕉') },
          { name: '蛋白粉(乳清)', g: 30, unit: 'g', gramLabel: '1 勺 ≈ 30g', ...per100('蛋白粉(乳清)') }
        ]
      } else {
        const bn = pick(this.REF_POOL.protein, mi)
        const sn = pick(this.REF_POOL.staple, mi)
        const vn = pick(this.REF_POOL.veg, mi + 1)
        const fn = pick(this.REF_POOL.fat, mi)
        const bp = per100(bn), sp = per100(sn), fp = per100(fn)
        const isEgg = bn === '鸡蛋'
        // 蛋白：承担该餐蛋白的 80%（其余来自主食/蔬菜）
        let bg = Math.round(pg * 0.80 / (bp.protein / 100 || 1))
        if (isEgg) { const eggs = Math.max(1, Math.round(bg / 50)); bg = eggs * 50 }
        const fatFromB = bp.fat * bg / 100
        // 主食：承担该餐碳水 85%
        const sg = Math.round(cb * 0.85 / (sp.carbs / 100 || 1))
        // 油脂：该餐脂肪 − 蛋白食物自带脂肪（复合营养考虑：鸡胸/虾自脂少，三文鱼/鸡蛋多）
        const fg = Math.max(5, Math.round((ft - fatFromB) / (fp.fat / 100 || 1)))
        items = [
          { name: bn, g: bg, unit: isEgg ? 'g（' + Math.round(bg / 50) + ' 个）' : 'g', gramLabel: isEgg ? eggNote : '', ...bp },
          { name: sn, g: sg, unit: 'g', gramLabel: '', ...sp },
          { name: vn, g: 250, unit: 'g', gramLabel: '蔬菜管饱不管热量', ...per100(vn) },
          { name: fn, g: fg, unit: 'g', gramLabel: '', ...fp }
        ]
      }
      const sum = items.reduce((a, x) => ({ k: a.k + (x.kcal || 0) * (x.g || 0) / 100, p: a.p + (x.protein || 0) * (x.g || 0) / 100, c: a.c + (x.carbs || 0) * (x.g || 0) / 100, f: a.f + (x.fat || 0) * (x.g || 0) / 100 }), { k: 0, p: 0, c: 0, f: 0 })
      meals.push({ meal: m.k, name: m.name, items, sum: { k: Math.round(sum.k), p: Math.round(sum.p), c: Math.round(sum.c), f: Math.round(sum.f) }, target: { k: Math.round(ck), p: Math.round(pg), c: Math.round(cb), f: Math.round(ft) } })
    })
    return meals
  },

  refPage() {
    const u = Store.state.user
    const prof = u.profile || {}
    const e = ENGINE.calc.energyPlan(prof, Store.adj())
    const meals = this.refMeals(e, prof)
    document.getElementById('app').innerHTML =
      Router.bar('三餐参考', '按你的宏量目标自动配比 · 克数可调') +
      '<div class="card"><div class="muted txs">每餐 = 主食 + 蛋白 + 蔬菜 + 油脂，克数按<b>各自营养密度</b>折算（蛋白食物自带的脂肪已从油脂里扣）。' +
        '食材每天轮换，嫌换得勤就自己固定吃那几样 —— 参考是拿来抄作业的，不是考试题。</div></div>' +
      meals.map(m => '<div class="card"><div class="row between" style="align-items:baseline"><h2 style="margin:0">' + Fmt.esc(m.name) + '</h2>' +
          '<span class="muted txs">目标 ' + m.target.k + ' kcal · 蛋白 ' + m.target.p + 'g</span></div>' +
        '<div style="margin-top:8px">' + m.items.map((x, i) =>
          '<div class="li"><span class="nm">' + Fmt.esc(x.name) + (x.gramLabel ? ' <span class="muted txs">' + Fmt.esc(x.gramLabel) + '</span>' : '') + '</span>' +
            '<span class="mc">' + Math.round(x.kcal * x.g / 100) + ' kcal · 蛋白' + Fmt.round(x.protein * x.g / 100, 0) + 'g</span></div>').join('') + '</div>' +
        '<div class="muted txs" style="margin-top:6px">本餐合计 <b>' + m.sum.k + '</b> kcal · 蛋白 ' + m.sum.p + 'g · 碳水 ' + m.sum.c + 'g · 脂肪 ' + m.sum.f + 'g</div>' +
        '<button class="btn ghost" style="margin-top:8px" onclick="PageDiet.refLog(\'' + m.meal + '\')">✓ 按这个记入「' + Fmt.esc(m.name) + '」</button>' +
      '</div>').join('') +
      '<div class="card"><div class="muted txs">吃的时候按参考量来，有出入就按实际量改「今天吃了什么」里的记录 —— 参考是起点，记录才是真相。</div></div>' +
      '<div style="margin-bottom:20px"><button class="btn line" onclick="Router.go(\'diet\')">回饮食方案</button></div>'
  },

  /** 把三餐参考的某一餐按当前克数记入「今天吃了什么」 */
  refLog(mealK) {
    const meals = this.refMeals(ENGINE.calc.energyPlan(Store.state.user.profile, Store.adj()), Store.state.user.profile || {})
    const m = meals.find(x => x.meal === mealK)
    if (!m) return
    const prev = this.curMeal
    this.curMeal = mealK
    m.items.forEach(x => {
      const f = ENGINE.kb.FOODS.find(y => y.name === x.name) || ENGINE.kb.matchFood(x.name)
      if (f) this.flPush(f, x.g)
      else UI.toast('「' + x.name + '」不在食物库，跳过 —— 手动记一下')
    })
    this.curMeal = prev
    this.logSave(Fmt.todayStr(), this.logOf(Fmt.todayStr()))
    UI.toast('已按参考记入「' + m.name + '」—— 吃得不一致就手动改记录')
    if (window.Router) Router.go('diet')
  },

  adjustLine(u, adj) {
    const bd = ENGINE.macro.breakdown(u.dietState)
    // ⚠️ dietMacros 内部直接读 profile.weight —— 传 null 会崩（空档案用户踩过）
    const prof = u.profile || {}
    const t = ENGINE.calc.dietMacros(prof, adj)
    const base = ENGINE.calc.dietMacros(prof, { carbAdj: 0, proteinAdj: 0 })
    const noHunger = !bd.hunger.carb && !bd.hunger.protein
    const noMacro = !bd.macro.kcal
    if (noHunger && noMacro) {
      return '<div class="muted txs" style="margin-top:6px">当前没有额外偏移（饥饿反馈 0 · 宏观调控 0 kcal）</div>'
    }
    return '<div class="muted txs" style="margin-top:6px">当前偏移：' +
      (noHunger ? '' : '饥饿反馈 碳水 ' + this.signed(bd.hunger.carb) + ' / 蛋白 ' + this.signed(bd.hunger.protein) + '；') +
      (noMacro ? '' : '宏观调控热量 ' + this.signed(bd.macro.kcal, ' kcal') + '；') +
      '→ 碳水 ' + base.carb + 'g 变 ' + t.carb + 'g，蛋白 ' + t.protG + ' g/kg（仍在下限 1.4 以上）</div>'
  },

  signed(v, unit) {
    const n = Fmt.round(v || 0, 2)
    return (n > 0 ? '+' : '') + n + (unit || '')
  },

  verdictCN(v) {
    return ({ too_fast: '掉太快', below: '需加量', above: '需减量', on_track: '维持', noisy: '数据噪声', unclear: '数据不足' })[v] || v || '调整'
  },

  applyMacro() {
    const u = Store.state.user
    const rev = this.review()
    if (!rev || !rev.ready || !rev.action) { UI.toast('当前没有可应用的调整'); return }
    const before = ENGINE.macro.breakdown(u.dietState).macro.kcal
    u.dietState = ENGINE.macro.apply(rev, u.dietState)
    const after = ENGINE.macro.breakdown(u.dietState).macro.kcal
    Store.saveCloud({ dietState: u.dietState })   // 偏移属于档案，登录时同步云端
    UI.toast('已应用：每日热量 ' + this.signed(before, '') + ' → ' + this.signed(after, '') +
      ' kcal（碳水约 ' + this.signed(rev.action.carbGrams, '') + 'g）')
    this.flRefresh()
  },

  seedOfToday() {
    const d = new Date()
    const start = new Date(d.getFullYear(), 0, 0)
    return Math.floor((d - start) / 86400000)
  },

  /** 步长表 —— 与 ENGINE.calc.applyHunger 内表一致（那边没 export，这里对齐；改一处要同步另一处） */
  HUNGER_STEPS: {
    '很饿': { carb: 0.5, protein: -0.2 },
    '微饿': { carb: 0, protein: 0 },
    '不饿': { carb: -0.5, protein: 0.2 }
  },
  hunger(type) {
    const u = Store.state.user
    const ds = u.dietState || {}
    const today = Fmt.todayStr()
    const steps = this.HUNGER_STEPS
    // 修小程序老 bug（同一天连点会叠加）：今天已经反馈过 → 先回退旧反馈，再按新反馈计
    // （同 key 重按 = 幂等，偏移不变）
    const last = (ds.hungerToday || {}).date === today ? ds.hungerToday : null
    let adj = { carbAdj: ds.carbAdj || 0, proteinAdj: ds.proteinAdj || 0 }
    if (last && steps[last.key]) {
      adj = { carbAdj: adj.carbAdj - steps[last.key].carb, proteinAdj: adj.proteinAdj - steps[last.key].protein }
    }
    const next = ENGINE.calc.applyHunger(type, adj)
    const rolled = last && last.key !== type
    u.dietState = Object.assign({}, ds, next, { hungerToday: { date: today, key: type } })
    const hist = (ds.history || []).filter(x => x.date !== today)
    hist.push({ date: today, type })
    u.dietState.history = hist
    Store.saveCloud({ dietState: u.dietState })
    UI.toast('今天已反馈：' + type + '（碳水 ' + next.carbAdj + ' / 蛋白 ' + next.proteinAdj + '）' +
      (rolled ? '—— 已替换你刚才的选择' : ''))
    this.flRefresh()
  }
}
