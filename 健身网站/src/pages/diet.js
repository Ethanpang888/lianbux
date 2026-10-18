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

      // ───── 每日目标置顶 + 四色区分（用户 2026-10-17 指定排版）─────
      '<div class="card">' +
        '<h2>每日目标 <span class="mini">' + Fmt.esc(e.tdee + ' kcal 消耗') + '</span></h2>' +
        '<div class="goal-grid">' +
          '<div class="goal-cell gc-kcal"><span>热量 kcal</span><b>' + Fmt.num(e.kcal) + '</b></div>' +
          '<div class="goal-cell gc-pro"><span>蛋白 g</span><b>' + Fmt.num(e.protein) + '</b></div>' +
          '<div class="goal-cell gc-carb"><span>碳水 g</span><b>' + Fmt.num(e.carb) + '</b></div>' +
          '<div class="goal-cell gc-fat"><span>脂肪 g</span><b>' + Fmt.num(e.fat) + '</b></div>' +
        '</div>' +
        '<details class="diet-basis"><summary>营养目标说明</summary><div class="muted txs" style="margin-top:8px">基础代谢 ' + e.bmr + ' × 活动系数 ' +
        (e.activity ? e.activity.factor : '—') + (e.activity ? '（' + Fmt.esc(e.activity.name) + '）' : '') +
        ' = ' + e.tdee + ' kcal；缺口 ' + Math.abs(e.tdee - e.kcal) + ' kcal' +
        '（谭成义口径：蛋白 ' + (hasBody ? Fmt.round(e.protein / prof.weight, 2) : '—') + ' g/kg、脂肪 ' +
        (hasBody ? Fmt.round(e.fat / prof.weight, 2) : '—') + ' g/kg）' +
        (bd ? ' · BMI ' + bmiV + '（' + Fmt.esc(bd.txt) + '）' : '') + '</div>' +
        this.adjustLine(u, adj) + '</details>' +
      '</div>' +

      // ───── 今天吃了什么 + 添加食材 ─────
      this.foodLogCard(e, prof) +

      // ───── 今日补给（已吃进度条）—— 与「吃了什么」同组 ─────
      '<div class="card nutrition-card" id="nutritionBars">' + this.nutritionBars(e) + '</div>' +

      // ───── 消耗与缺口总账（用户 2026-10-15：总消耗/缺口埋在小字里看不见）─────
      '<details class="fold"><summary>热量目标怎么算的？查看消耗与缺口</summary>' + this.energyCard(e, prof, u) + '</details>' +

      // ───── 宏观调控：看体重趋势自动调 ─────
      this.macroCard(rev, e, u) +

      // ───── 完整版：三套饮食口径 / 外卖 / 补剂（免费用户只看到引导）─────
      '<details class="fold"><summary>进阶饮食功能与会员权益</summary>' + this.proCard(u, e) + '</details>' +

      (day ? '<div class="card"><h2>今天怎么分配 <span class="mini">' +
        (day.mode === 'recipe' ? '已配好菜' : '只给克数') + '</span></h2>' +
        (day.meals || []).map((m, mi) => {
          // 两种模式的字段名不同：只给克数 = 直接在餐上（m.kcal/protein/carb/fat）；
          // 配好菜 = 在 m.got 里（由菜品营养累加）。这里统一成 got，避免显示成 0。
          const got = m.got || {
            kcal: m.kcal || 0, protein: m.protein || 0, carb: m.carb || 0, fat: m.fat || 0
          }
          // 每行带「＋记」：点一下直接进「今天吃了什么」—— 计划即记录，不用再搜一遍
          // （用户实测反馈 2026-10-11：记录和分餐分家，每次都要手动搜，太反人类）
          let inner = ''
          if (day.mode === 'recipe') {
            inner = (m.dishes || []).map((d, di) => '<div class="muted txs">· ' + Fmt.esc(d.name) + '：' +
              Fmt.esc((d.items || []).join('、')) +
              ' <span style="color:var(--primary,#1a73e8);cursor:pointer;font-weight:700" onclick="PageDiet.flAddDish(' + mi + ',' + di + ')">＋记</span></div>').join('')
          } else {
            inner = (m.hints || []).map(h => {
              // 「≈ 鸡胸 160g / 瘦牛肉 145g / 虾 205g」—— 逐候选取第一个在食物库里的（俗称自动跳过）
              const seg = /≈([^≈]+)/.exec(h)
              let pick = null
              if (seg) seg[1].split(' / ').forEach(part => {
                if (pick) return
                const mt = /^\s*([^\s（]+?)\s*(\d+(?:\.\d+)?)\s*g/.exec(part)
                if (!mt) return
                const nm = { '鸡胸': '鸡胸肉', '蛋白粉': '蛋白粉(乳清)', '瘦牛肉': '牛肉(瘦)', '去皮鸡腿': '鸡腿' }[mt[1]] || mt[1]
                if (ENGINE.kb.FOODS.some(f => f.name === nm)) pick = [nm, Number(mt[2])]
              })
              const btn = pick
                ? ' <span style="color:var(--primary,#1a73e8);cursor:pointer;font-weight:700" onclick="PageDiet.flAddParsed(\'' + pick[0] + '\',' + pick[1] + ')">＋记</span>'
                : ''
              return '<div class="muted txs">· ' + Fmt.esc(h) + btn + '</div>'
            }).join('')
          }
          // 整餐一键：把这一餐全部记进今日（配好菜模式）
          const mealBtn = day.mode === 'recipe' && (m.dishes || []).length
            ? '<button class="btn ghost" style="margin-top:6px;font-size:12px" onclick="PageDiet.flAddMeal(' + mi + ')">＋ 整餐记入</button>' : ''
          return '<div style="padding:10px 0;border-top:1px solid var(--line)">' +
            '<b>' + Fmt.esc(m.mealName) + '</b> <span class="muted txs">' + got.kcal + ' kcal · 蛋白 ' +
            Fmt.round(got.protein, 1) + 'g · 碳水 ' + Fmt.round(got.carb, 1) + 'g · 脂肪 ' + Fmt.round(got.fat, 1) + 'g</span>' +
            inner + mealBtn + '</div>'
        }).join('') +
        (day.target ? '<div class="muted txs" style="margin-top:8px">全天合计 ' +
          ((day.got || day.target || {}).kcal || 0) + ' kcal（目标 ' + day.target.kcal + '）</div>' : '') +
      '</div>' : '') +

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
    const today = Fmt.todayStr()
    const list = this.logOf(today)
    const tot = list.reduce((a, f) => ({ k: a.k + (f.kcal || 0), p: a.p + (f.protein || 0), c: a.c + (f.carbs || 0), f: a.f + (f.fat || 0) }), { k: 0, p: 0, c: 0, f: 0 })
    const rows = list.map((f, i) => '<div class="li"><span class="nm">' + Fmt.esc(f.name) + ' ' + f.g + 'g</span>' +
      '<span class="mc">' + Math.round(f.kcal) + 'kcal · 蛋白' + Math.round(f.protein) + ' · 碳水' + Math.round(f.carbs) +
      ' · 脂肪' + Math.round(f.fat) + (f.fiber ? ' · 纤维' + Math.round(f.fiber) : '') + 'g</span>' +
      '<span class="del" onclick="PageDiet.flDel(' + i + ')">✕</span></div>').join('')
    const pct = v => Math.min(100, Math.round(v / (e.kcal || 1) * 100))
    return '<div class="card" id="flCard"><h2>今天吃了什么 <span class="mini">点食物 → 选克重 → 记入</span></h2>' +

      // ── 食物库直接嵌在记录卡里（用户实测反馈 2026-10-13：分两处反人类）——点名字弹克重选择 ──
      this.foodLibInner() +
      '<div id="flPick" class="muted txs" style="margin-top:6px">点上面的食物名 → 选克重；或搜别的</div>' +
      '<div id="flList" style="margin-top:8px">' + rows + '</div>' +
      (list.length
        ? '<div id="flTot" class="muted txs" style="margin-top:8px">今日合计：' + Math.round(tot.k) + ' / ' + e.kcal + ' kcal（' + pct(tot.k) + '%）· 蛋白 ' +
            Math.round(tot.p) + '/' + e.protein + 'g · 碳水 ' + Math.round(tot.c) + '/' + e.carb + 'g · 脂肪 ' + Math.round(tot.f) + '/' + e.fat + 'g' +
            ' —— ' + (tot.k > e.kcal ? '已超过参考目标，正常安排下一餐' : pct(tot.k) > 85 ? '快到线了，很稳' : '还差得远，别饿着自己') + '</div>'
        : '<div id="flTot" class="muted txs">吃了就记一笔，晚上对着目标看差多少 —— 这比任何计划都管用。</div>') +
    '</div>'
  },
  /** 局部刷新记录列表与合计（不整页重绘 —— 加食物时不丢搜索状态和滚动位置） */
  flRefresh() {
    const e = ENGINE.calc.energyPlan(Store.state.user.profile, Store.adj())
    const bars = document.getElementById('nutritionBars'); if (bars) bars.innerHTML = this.nutritionBars(e)
    const list = this.logOf(Fmt.todayStr())
    const tot = list.reduce((a, f) => ({ k: a.k + f.kcal, p: a.p + f.protein, c: a.c + f.carbs, f: a.f + f.fat, fb: a.fb + (f.fiber || 0) }),
      { k: 0, p: 0, c: 0, f: 0, fb: 0 })
    const rowTxt = f => Math.round(f.kcal) + 'kcal · 蛋白' + Math.round(f.protein) + ' · 碳水' + Math.round(f.carbs) +
      ' · 脂肪' + Math.round(f.fat) + (f.fiber ? ' · 纤维' + Math.round(f.fiber) : '') + 'g'
    const rowsEl = document.getElementById('flList')
    if (rowsEl) rowsEl.innerHTML = list.map((f, i) => '<div class="li"><span class="nm">' + Fmt.esc(f.name) + ' ' + f.g + 'g</span>' +
      '<span class="mc">' + rowTxt(f) + '</span>' +
      '<span class="del" onclick="PageDiet.flDel(' + i + ')">✕</span></div>').join('')
    const totEl = document.getElementById('flTot')
    if (totEl && !list.length) totEl.textContent = '还没有记录，搜索食物或从常用食物中选择。'
    if (totEl && list.length) {
      const pct = v => Math.min(100, Math.round(v / (e.kcal || 1) * 100))
      totEl.innerHTML = '今日合计：' + Math.round(tot.k) + ' / ' + e.kcal + ' kcal（' + pct(tot.k) + '%）· 蛋白 ' +
        Math.round(tot.p) + '/' + e.protein + 'g · 碳水 ' + Math.round(tot.c) + '/' + e.carb + 'g · 脂肪 ' +
        Math.round(tot.f) + '/' + e.fat + 'g' +
        (tot.fb ? ' · 纤维 ' + Math.round(tot.fb) + 'g' : '') +
        ' —— ' + (tot.k > e.kcal ? '已超过参考目标，正常安排下一餐' : pct(tot.k) > 85 ? '快到线了，很稳' : '还差得远，别饿着自己')
    }
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
    const exist = list.find(x => x.name === f.name)
    if (exist) {
      exist.g += g; exist.kcal += f.kcal * k; exist.protein += f.protein * k; exist.carbs += f.carbs * k; exist.fat += f.fat * k
      exist.fiber = (exist.fiber || 0) + (f.fiber || 0) * k
    } else list.push({ name: f.name, g: g, kcal: f.kcal * k, protein: f.protein * k, carbs: f.carbs * k, fat: f.fat * k, fiber: (f.fiber || 0) * k })
    this.logSave(Fmt.todayStr(), list)
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
