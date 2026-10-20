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
    const prof = u.profile || {}
    document.getElementById('app').innerHTML = Router.bar('饮食', '吃得清楚，练得踏实') +
      this.goalCard(e, prof, u) +
      '<details class="fold"><summary>目标计算与饮食调整</summary>' + this.fatLossPaceCard(prof,adj) + this.energyCard(e, prof, u) + this.adjustLine(u, Store.adj()) +
      this.macroCard(this.review(), e, u) +
      '<div class="card"><h2>今日饥饿反馈</h2><div class="wrap-row">' +
      ['很饿','微饿','不饿'].map(t => '<button class="chip" onclick="PageDiet.hunger(\''+t+'\')">'+t+'</button>').join('') + '</div></div></details>' +
      '<details class="fold"><summary>进阶饮食功能</summary>'+this.proCard(u,e)+'</details>'
  },

  fatLossPaceCard(profile,adj){
    const p=ENGINE.calc.fatLossChoices(profile,adj);if(!p)return ''
    return '<section class="pace-setting"><div class="ob-label">减脂目标 · 力度</div><div class="pace-options">'+p.choices.map(c=>'<button class="pace-choice '+(p.key===c.key?'on':'')+'" '+(c.disabled?'disabled ':'')+'onclick="PageDiet.chooseFatLossPace(\''+c.key+'\')"><b>'+c.name+'</b></button>').join('')+'</div><p class="muted txs">'+Fmt.esc(p.note)+'</p>'+(p.reason?'<p class="muted txs">'+Fmt.esc(p.reason)+'</p>':'')+(p.custom?'<p class="muted txs">当前使用自定参考目标；选择档位后恢复档案估算。</p>':'')+(p.key==='intensive'?'<p class="muted txs">持续疲劳、明显饥饿或训练表现下滑时，先回到稳步档。结合近期体重趋势复核，不因单日体重不变继续减餐。</p>':'')+'</section>'
  },
  chooseFatLossPace(key){
    if(this.paceBusy)return
    const u=Store.state.user,p=ENGINE.calc.fatLossChoices(u.profile,Store.adj()),c=p&&p.choices.find(x=>x.key===key)
    if(!c)return;if(c.disabled){UI.toast(p.reason);return}if(key===p.key&&!p.custom)return
    UI.modal({title:'切换为'+c.name+'？',body:'<p>预计每天吃 <b>'+c.kcal+' 大卡</b>，缺口约 <b>'+c.deficit+' 大卡</b>。</p><p>切换会恢复档案估算目标、重置旧热量偏移，保留已吃记录与参考份量。至少观察7天再调整；持续疲劳、明显饥饿或训练下滑时请回到稳步档。</p>',okText:'确认切换',onOk:()=>this.applyFatLossPace(key)})
  },
  async applyFatLossPace(key){
    if(this.paceBusy)return;this.paceBusy=true
    try{
      const u=Store.state.user,patch=ENGINE.dietFeedback.changePace(u.profile,u.dietState,key,Fmt.todayStr())
      // 合并待同步改动，避免队列里的旧档案在本次确认保存后写回。
      const pending=Store._pending;clearTimeout(Store._saveTimer)
      if(!Store.state.demo)await Api.api('putState',{token:Store.state.token,patch:Object.assign({},pending||{},patch)})
      if(Store._pending===pending)Store._pending=null
      else if(Store._pending){if(Store._pending.profile)Store._pending.profile=patch.profile;if(Store._pending.dietState)Store._pending.dietState=patch.dietState;Store.saveCloud({})}
      Object.assign(u,patch);Store.saveCache();this.render();UI.toast('已切换减脂力度')
    }catch(e){if(Store._pending)Store.saveCloud({});UI.toast('保存失败，请重试；原目标已保留')}finally{this.paceBusy=false}
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
  foodRow(f) {
    return '<button class="food-select-row" data-food="'+Fmt.esc(f.name)+'"><span><b>'+Fmt.esc(f.name)+'</b><small>'+Fmt.esc(/熟/.test(f.name)?'熟重':/米饭|面包|奶|酸奶/.test(f.name)?'按标示可食部':'按食物库可食部')+' · '+Math.round(f.kcal||0)+' kcal / 100g</small></span><span class="food-plus">＋</span></button>'
  },
  foodLibInner() {
    const cats=['全部'].concat(Object.keys(this.COMMON))
    const names=this.foodCat && this.foodCat!=='全部' ? this.COMMON[this.foodCat]||[] : Object.values(this.COMMON).flat()
    return '<input class="pro-input" id="foodQ" placeholder="搜索食物，例如米饭、鸡蛋" autocomplete="off">'+
      '<div id="foodHits"></div><div id="foodCommon"><div class="food-categories">'+cats.map(c=>'<button class="chip '+((this.foodCat||'全部')===c?'on':'')+'" data-cat="'+c+'">'+c+'</button>').join('')+'</div>'+names.slice(0,18).map(n=>ENGINE.kb.matchFood(n)).filter(Boolean).map(f=>this.foodRow(f)).join('')+'</div>'
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
    const q=document.getElementById('foodQ'), hits=document.getElementById('foodHits'), common=document.getElementById('foodCommon')
    if(q) q.oninput=()=>{ const v=q.value.trim(); common.hidden=!!v; hits.innerHTML=v?(this.searchFoods(v,60).map(f=>this.foodRow(f)).join('')||'<p class="muted">没有找到，试试其他名称。</p>'):'' }
    const root=document.getElementById('flPanel')
    if(root) root.onclick=e=>{const f=e.target.closest('[data-food]'), c=e.target.closest('[data-cat]'); if(f)this.showFood(f.dataset.food); if(c){this.foodCat=c.dataset.cat;this.paintPanel()} }
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
    if (!Number.isFinite(g) || g<=0 || g>5000) { UI.toast('请填写1–5000克'); return }
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
        (e2.kcal===e.kcal?'<p class="muted txs">当前目标已到调整边界；不会继续减餐。请先复核减脂力度或自定参考目标。</p>':'<button class="btn" style="margin-top:10px" onclick="PageDiet.applyMacro()">应用这次调整</button>') +
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
    } catch (e) { UI.toast('记录未保存：本机空间不足或数据损坏'); throw e }
  },
  flPick: null,

  /**
   * 消耗与缺口总账（用户 2026-10-15：总消耗/缺口原来埋在小字里，"我什么都不知道怎么把握"）。
   * 三个大数 + 一句大白话 + 减脂/增肌速度预估。数字全部引擎算的，不编。
   */
  energyCard(e, prof, u) {
    if (!e || !e.tdee) return ''
    const daily=ENGINE.cardio.daily(e,(Store.checkinOf(Fmt.todayStr())||{}).cardio);e=Object.assign({},e,{tdee:daily.tdee});
    const goal = (prof && prof.goal) || '塑形'
    const deficit = Math.round(e.tdee - e.kcal)          // 正=缺口（吃得比消耗少），负=盈余
    const adj = (u && u.dietState && u.dietState.kcalAdj) || 0
    const hasAdj = adj !== 0
    const big = (v,k,c) => '<div style="flex:1;text-align:center"><div style="font-size:23px;font-weight:700;color:'+(c||'var(--tx)')+'">'+v+'</div><div class="muted txs">'+k+'</div></div>'
    const line = (e.source==='reference'?'当前使用你保存的全天参考目标，可在饮食参考页恢复档案估算。':'当前使用档案估算目标。')+' 缺口＝每日总消耗−摄入目标；负数表示盈余。消耗是估算值，请结合实际执行和长期趋势复核。'
    return '<div class="card"><h2>消耗与缺口 <span class="mini">' + Fmt.esc(goal) + '</span></h2>' +
      '<div style="display:flex;gap:4px;margin-top:8px">' +
        big(Fmt.num(e.tdee), '本日估算总消耗') +
        big(Fmt.num(e.kcal), '建议每天吃', 'var(--green)') +
        big((deficit > 0 ? '-' : deficit < 0 ? '+' : '±') + Math.abs(deficit), deficit > 0 ? '缺口/天' : deficit < 0 ? '盈余/天' : '持平') +
      '</div>' +
      '<div class="muted txs" style="margin-top:10px;border-top:1px dashed var(--line);padding-top:8px">' + line +
        ' 总消耗 = 基础代谢 ' + e.bmr + ' × 活动系数 ' + (e.activity ? e.activity.factor : '—') +
        '（' + (e.activity ? Fmt.esc(e.activity.name) : '—') + '）+ 额外有氧 '+daily.added+' kcal。饮食目标不自动增加。</div>' +
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
  flTab: 'freq',     // 添加面板页签：freq 常用 / lib 食物库（默认，搜索是主路径）/ recent 最近 / tpl 套餐

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
  tplAll() { try { const v=JSON.parse(localStorage.getItem(this.TPL_KEY)||'[]'); return Array.isArray(v)?v:[] } catch(e){return []} },
  tplSave(name,items,meal) {
    const list=this.tplAll().filter(t=>t.name!==name)
    list.unshift({name,items,meal,at:Fmt.todayStr(),version:2})
    try{localStorage.setItem(this.TPL_KEY,JSON.stringify(list.slice(0,30)));return true}catch(e){UI.toast('保存失败，本机空间不足');return false}
  },
  tplDel(name) { try{localStorage.setItem(this.TPL_KEY,JSON.stringify(this.tplAll().filter(t=>t.name!==name)));this.paintPanel()}catch(e){UI.toast('删除失败')} },
  tplSaveCurrent(fullDay) {
    const items=this.logOf(Fmt.todayStr()).filter(f=>fullDay||(f.meal||'s')===this.curMeal)
    if(!items.length){UI.toast('还没有记录');return}
    UI.modal({title:fullDay?'保存全天套餐':'保存这餐套餐',body:'<input id="tplName" class="pro-input" placeholder="输入套餐名称">',onOk:()=>{
      const name=document.getElementById('tplName').value.trim()
      if(!name){UI.toast('请填写套餐名');return true}
      if(!this.tplSave(name,items.map(f=>Object.assign({},f)),fullDay?'day':this.curMeal))return true
      UI.toast('套餐已保存');this.flTab='tpl';this.foodPage()
    }})
  },
  tplView(name) {
    const t=this.tplAll().find(t=>t.name===name); if(!t)return
    this.tplDraft=JSON.parse(JSON.stringify(t))
    UI.modal({title:'编辑套餐 · '+name,body:'<input class="pro-input" id="tplEditName" value="'+Fmt.esc(name)+'">'+t.items.map((f,i)=>
      '<div class="ref-food"><span>'+Fmt.esc(f.name)+'</span><input class="pro-input" type="number" min="1" max="5000" id="tplG'+i+'" value="'+(f.g||100)+'"><span>克</span></div>').join('')+
      '<button class="btn ghost" id="tplApply">确认份量并记入'+(t.meal==='day'?'对应四餐':this.mealName(this.curMeal))+'</button>',okText:'保存修改',onOk:()=>{
        if(!this.readTplDraft())return true
        const newName=document.getElementById('tplEditName').value.trim();if(!newName){UI.toast('请填写套餐名');return true}
        if(!this.tplSave(newName,this.tplDraft.items,t.meal))return true
        if(newName!==name)this.tplDel(name)
        this.paintPanel();UI.toast('已保存修改')
      },after:()=>{document.getElementById('tplApply').onclick=()=>{
        if(!this.readTplDraft())return
        const list=this.logOf(Fmt.todayStr())
        this.tplDraft.items.forEach(f=>list.push(Object.assign({},f,{meal:t.meal==='day'?(f.meal||'s'):this.curMeal})))
        this.logSave(Fmt.todayStr(),list);this.flRefresh();document.getElementById('modalbox').innerHTML='';UI.toast('已记入实际摄入')
      }}})
  },
  readTplDraft() {
    for(let i=0;i<this.tplDraft.items.length;i++){
      const f=this.tplDraft.items[i],g=Number(document.getElementById('tplG'+i).value)
      if(!Number.isFinite(g)||g<=0||g>5000){UI.toast('请填写1–5000克');return false}
      const ratio=g/(Number(f.g)||100)
      ;['kcal','protein','carbs','fat','fiber'].forEach(k=>{f[k]=(Number(f[k])||0)*ratio});f.g=g
    }return true
  },
  goalCard(e,prof,u,opts) {
    const daily=ENGINE.cardio.daily(e,(Store.checkinOf(Fmt.todayStr())||{}).cardio);e=Object.assign({},e,{tdee:daily.tdee});
    const compact=!!(opts&&opts.compact)
    const list=this.logOf(Fmt.todayStr()),t={k:0,p:0,c:0,f:0}
    list.forEach(x=>{t.k+=Number(x.kcal)||0;t.p+=Number(x.protein)||0;t.c+=Number(x.carbs)||0;t.f+=Number(x.fat)||0})
    const pct=e.kcal>0?Math.round(t.k/e.kcal*100):0,over=e.kcal>0&&t.k>e.kcal,delta=Math.round(t.k-e.kcal),gap=Math.round(e.tdee-e.kcal)
    const macro=(label,got,target,cls)=>{const p=target>0?Math.round(got/target*100):0,o=target>0&&got>target;return '<div class="diet-macro '+cls+(o?' is-over':'')+'"><span>'+label+'</span><div><b>'+Fmt.num(got,0)+'</b> / '+Fmt.num(target,0)+'g</div><small>'+p+'%</small><div class="gc-bar"><i style="width:'+Math.max(0,Math.min(100,p))+'%"></i></div></div>'}
    return '<section class="card diet-overview" id="goalCardBox"><div class="row between"><h2>今日饮食</h2><span class="muted">目标 '+Fmt.num(e.kcal)+' kcal</span></div>'+
      (compact?'':'<button class="diet-ref-link" onclick="Router.go(\'mealref\')"><span><b>我的饮食参考</b><small>查看与调整食材、份量</small></span><span>›</span></button>')+
      '<div class="diet-energy"><div><strong>'+Fmt.num(t.k,0)+'</strong> <span>大卡</span><p>'+(delta>0?'已超目标 '+delta:delta===0?'已达到目标':'距目标 '+(-delta))+' 大卡</p></div><div class="diet-ring '+(over?'is-over':'')+'" style="--pct:'+Math.max(0,Math.min(100,pct))+'%"><div><small>目标进度</small><b>'+pct+'%</b></div></div></div>'+
      '<div class="diet-macros">'+macro('蛋白质',t.p,e.protein,'g-pro')+macro('碳水',t.c,e.carb,'g-carb')+macro('脂肪',t.f,e.fat,'g-fat')+'</div>'+
      (daily.cardio?'<p class="muted txs">本日有氧 '+Fmt.esc(daily.cardio.name)+' '+daily.cardio.minutes+' 分钟 · 估算净消耗约 '+(daily.cardio.kcal===null?'—':daily.cardio.kcal)+' kcal · '+(daily.added?'已计入额外消耗':'计划内活动，已含在日常估算中')+'</p>':'')+
      '<p class="diet-goal-note">'+Fmt.esc(prof.goal||'塑形')+' · 消耗 '+Math.round(e.tdee)+' · 摄入 '+Math.round(e.kcal)+' kcal · '+(gap>0?'缺口 '+gap:gap<0?'盈余 '+(-gap):'收支持平')+(e.source==='reference'?' · 自定参考目标':'')+'</p>'+
      (compact?'':'<div class="diet-meals">'+this.MEALS.map(m=>{const a=list.filter(f=>(f.meal||'s')===m.k);return '<button onclick="PageDiet.openFoodPanel(\''+m.k+'\')"><span>'+({b:'☀',l:'◷',d:'☾',s:'＋'}[m.k])+'</span><b>'+m.name+'</b><small>'+ (a.length?Math.round(a.reduce((n,f)=>n+(Number(f.kcal)||0),0))+' kcal':'去记录')+'</small></button>'}).join('')+'</div>')+'</section>'
  },
  foodLogCard() {return ''},
  openFoodPanel(k) {this.curMeal=this.MEALS.some(m=>m.k===k)?k:this.curMeal;Router.go('food/'+this.curMeal)},
  foodPage(args) {
    if(args&&this.MEALS.some(m=>m.k===args[0]))this.curMeal=args[0]
    document.getElementById('app').innerHTML='<header class="appbar"><button class="chip" onclick="Router.go(\'diet\')">‹ 返回饮食</button><h1>选择食物</h1><div id="mealTabs" class="diet-meals">'+this.MEALS.map(m=>'<button class="chip '+(m.k===this.curMeal?'on':'')+'" onclick="PageDiet.setMeal(\''+m.k+'\')">'+m.name+'</button>').join('')+'</div></header>'+
      '<div class="card"><div id="flTabs" class="food-tabs">'+[['freq','常用'],['lib','食物库'],['tpl','套餐'],['recent','最近']].map(x=>'<button class="chip '+(this.flTab===x[0]?'on':'')+'" onclick="PageDiet.setFlTab(\''+x[0]+'\')">'+x[1]+'</button>').join('')+'</div><div id="flPanel">'+this.flPanel()+'</div></div>'+
      '<div class="card"><h2>'+this.mealName(this.curMeal)+' · 已吃记录</h2><div id="mealLists">'+this.mealListsHTML(this.logOf(Fmt.todayStr()))+'</div><button class="btn ghost" onclick="PageDiet.tplSaveCurrent()">把这餐存为套餐</button><button class="btn line" onclick="PageDiet.tplSaveCurrent(true)">保存全天饮食套餐</button></div>'
    this.bindFood()
  },
  setMeal(k) {this.openFoodPanel(k)},
  setFlTab(tab) {this.flTab=tab;this.foodPage()},
  flPanel() {
    if(this.flTab==='tpl')return this.tplAll().map((t,i)=>'<div class="food-select-row"><button class="chip" onclick="PageDiet.tplView(PageDiet.tplAll()['+i+'].name)">'+Fmt.esc(t.name)+' · '+t.items.length+'项 · 查看/编辑</button><button class="chip" onclick="PageDiet.tplDel(PageDiet.tplAll()['+i+'].name)">删除</button></div>').join('')||'<p class="muted">还没有套餐。记录一餐后，可在下方保存。</p>'
    if(this.flTab==='freq'||this.flTab==='recent'){const fs=this.flTab==='freq'?this.freqFoods():this.recentFoods();return '<input class="pro-input" placeholder="搜索食物，请切换食物库" onfocus="PageDiet.setFlTab(\'lib\')">'+(fs.map(x=>ENGINE.kb.matchFood(x.name)).filter(Boolean).map(f=>this.foodRow(f)).join('')||'<p class="muted">记录过一次的食物会出现在这里。<button class="chip" onclick="PageDiet.setFlTab(\'lib\')">添加食物</button></p>')}
    return this.foodLibInner()
  },
  paintPanel(){const p=document.getElementById('flPanel');if(p){p.innerHTML=this.flPanel();this.bindFood()}},
  mealListsHTML(list) {
    return list.map((f,i)=>({f,i})).filter(x=>(x.f.meal||'s')===this.curMeal).map(x=>'<div class="food-select-row"><span><b>'+Fmt.esc(x.f.name)+' · '+x.f.g+'g</b><small>'+Math.round(x.f.kcal||0)+' kcal · 蛋白 '+Fmt.num(x.f.protein,1)+'g</small></span><button class="chip" onclick="PageDiet.editLog('+x.i+')">修改</button><button class="chip" onclick="PageDiet.flDel('+x.i+')">删除</button></div>').join('')||'<p class="muted">这一餐还没有记录。</p>'
  },
  editLog(i){const list=this.logOf(Fmt.todayStr()),f=list[i];UI.modal({title:'修改实际份量',body:'<input class="pro-input" type="number" id="editFoodG" value="'+f.g+'">',onOk:()=>{const g=Number(document.getElementById('editFoodG').value);if(!Number.isFinite(g)||g<=0||g>5000){UI.toast('请填写1–5000克');return true}const ratio=g/f.g;['kcal','protein','carbs','fat','fiber'].forEach(k=>f[k]=(Number(f[k])||0)*ratio);f.g=g;this.logSave(Fmt.todayStr(),list);this.flRefresh()}})},
  flRefresh(){if(Router.current==='diet')this.render();else if(Router.current==='food'){const el=document.getElementById('mealLists');if(el)el.innerHTML=this.mealListsHTML(this.logOf(Fmt.todayStr()))}},

  /** 食物库/弹窗一键记入（名字需在库内；g 默认 100） */
  flAddByName(name, g) {
    const f = ENGINE.kb.FOODS.find(x => x.name === name) || ENGINE.kb.matchFood(name)
    if (!f) { UI.toast('库里没有「' + name + '」'); return }
    g=Number(g);if(!Number.isFinite(g)||g<=0||g>5000){UI.toast('请填写1–5000克');return}
    this.flPush(f, g)
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
  refKey(){const u=Store.state.user||{};return 'lbgym_reference_'+(u._id||u.id||u.playerNo||'demo')+'_'+ENGINE.diet.referenceBasis(u.profile)},
  refMeals(e,prof){
    try{const saved=JSON.parse(localStorage.getItem(this.refKey())||'null');if(saved&&Array.isArray(saved.meals)&&saved.meals.length===4)return saved.meals}catch(err){}
    return ENGINE.diet.buildReference(e)
  },
  refPage(){
    const u=Store.state.user,e=ENGINE.calc.energyPlan(u.profile,Store.adj())
    this.refDraft=this.refMeals(e,u.profile)
    this.drawReference()
  },
  drawReference(){
    const meals=this.refDraft,total=ENGINE.diet.referenceSum(meals.flatMap(m=>m.items))
    document.getElementById('app').innerHTML='<header class="appbar"><button class="chip" onclick="Router.go(\'diet\')">‹ 返回饮食</button><h1>我的饮食参考</h1><div class="sub">参考份量可以改，确认记录后才算实际摄入</div></header>'+
      meals.map((m,mi)=>{m.sum=ENGINE.diet.referenceSum(m.items);return '<section class="card"><div class="row between"><h2>'+m.name+'</h2><b>'+Math.round(m.sum.k)+' 大卡</b></div><p class="muted txs">蛋白质 '+Fmt.num(m.sum.p,1)+'g · 碳水 '+Fmt.num(m.sum.c,1)+'g · 脂肪 '+Fmt.num(m.sum.f,1)+'g</p>'+
      m.items.map((x,i)=>'<label class="ref-food"><span>'+Fmt.esc(x.name)+(x.name==='鸡蛋'?'<small>去壳约50g/个</small>':'')+'</span><input class="pro-input" aria-label="'+m.name+' '+Fmt.esc(x.name)+'克数" type="number" inputmode="decimal" min="0" max="5000" value="'+x.g+'" onchange="PageDiet.refEdit('+mi+','+i+',this)"><span>克</span></label>').join('')+
      '<button class="btn ghost" onclick="PageDiet.refLog(\''+m.meal+'\')">记录实际吃的 ›</button></section>'}).join('')+
      '<section class="card"><b>全天参考 '+Math.round(total.k)+' kcal</b><p class="muted txs">这是一份可调整的食材参考，正常份量下可能与原目标有差额，不会为了凑数无限增加食量。原目标 '+Math.round(ENGINE.calc.energyPlan(Store.state.user.profile,Store.adj()).kcal)+' kcal。</p><button class="btn" onclick="PageDiet.refSave(false)">保存参考份量</button><button class="btn line" onclick="PageDiet.refSave(true)">保存并用全天参考作为每日目标</button><button class="btn line" onclick="PageDiet.refResetTarget()">恢复按档案计算目标</button></section>'+
      '<details class="fold"><summary>来源与计算说明</summary><p>营养来自现有食物库，按各食物全部营养累加。米饭按熟重；肉、蔬菜按食物库所列可食部计；燕麦按干重；鸡蛋按去壳重量，香蕉按去皮重量。烹调用油单列，品牌与烹调方式会带来误差。默认参考不代表精准定制，也不会自动记为已吃。自定目标在身体资料或目标变化后失效。</p></details>'
  },
  refEdit(mi,i,input){const g=Number(input.value);if(input.value===''||!Number.isFinite(g)||g<0||g>5000){UI.toast('请填写0–5000克');input.value=this.refDraft[mi].items[i].g;return}this.refDraft[mi].items[i].g=g;this.drawReference()},
  refSave(asTarget){
    const save=()=>{try{localStorage.setItem(this.refKey(),JSON.stringify({meals:this.refDraft}));}catch(e){UI.toast('参考保存失败');return}
      if(asTarget){const t=ENGINE.diet.referenceSum(this.refDraft.flatMap(m=>m.items));if(t.k<=0){UI.toast('全天参考不能为零');return}const p=Store.state.user.profile;p.dietReferenceTarget={basis:ENGINE.diet.referenceBasis(p),kcal:t.k,protein:t.p,carb:t.c,fat:t.f};Store.saveCache();Store.saveCloud({profile:p})}UI.toast(asTarget?'已更新每日目标；参考未计入实际摄入':'已保存参考；未计入实际摄入')}
    if(asTarget)UI.modal({title:'将参考设为每日目标？',body:'<p>这会替换按档案估算的热量与营养目标，不会增加实际摄入记录。可随时恢复。</p>',onOk:save});else save()
  },
  refResetTarget(){const p=Store.state.user.profile;delete p.dietReferenceTarget;Store.saveCache();Store.saveCloud({profile:p});UI.toast('已恢复档案目标');this.drawReference()},
  refLog(k){const m=this.refDraft.find(m=>m.meal===k);if(!m)return;UI.modal({title:'确认实际吃的 · '+m.name,body:'<p>按当前编辑份量追加 '+Math.round(ENGINE.diet.referenceSum(m.items).k)+' kcal 到'+m.name+'。已有记录会保留，请避免重复记入。</p>',okText:'确认记入',onOk:()=>{const prev=this.curMeal;this.curMeal=k;m.items.filter(x=>x.g>0).forEach(x=>this.flPush(x,x.g));this.curMeal=prev;UI.toast('已记入实际摄入')}})},

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
    const next=ENGINE.macro.apply(rev,u.dietState)
    if(ENGINE.calc.energyPlan(u.profile,ENGINE.macro.combinedAdj(next)).kcal===ENGINE.calc.energyPlan(u.profile,Store.adj()).kcal){UI.toast('当前目标已到调整边界，请先复核档位或自定目标');return}
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
    const last=(ds.hungerToday||{}).date===today?ds.hungerToday:null
    const rolled=last&&last.key!==type
    u.dietState=ENGINE.dietFeedback.hunger(ds,type,today)
    const next=u.dietState
    Store.saveCloud({ dietState: u.dietState })
    UI.toast('今天已反馈：' + type + '（碳水 ' + next.carbAdj + ' / 蛋白 ' + next.proteinAdj + '）' +
      (rolled ? '—— 已替换你刚才的选择' : ''))
    this.flRefresh()
  }
}
