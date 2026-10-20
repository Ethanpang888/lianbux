/* src/pages/home.js —— 洞府（首页）：角色 + 今天该做什么 + 成长反馈
 *
 * 2026-10-16 按修炼游戏改版方案重排信息结构（原版是"存档页"，七个等权重大按钮堆一屏）：
 *   1. 轻顶栏：品牌 + 日期 + 个人入口
 *   2. 角色区：卡通人物（160–200px）+ 昵称 + 境界 + Lv + 修为进度 + 距下一级
 *   3. 今日训练：部位 / 动作数 / 组数 / 预计时长 + 唯一强按钮「开始训练」+ 次要「顺延」
 *      休息日 → 恢复任务
 *   4. 今日饮食：目标 / 已记录 / 剩余 +「记一餐」
 *   5. 两个并列入口：藏经阁（秘籍）/ 随身导师（AI 顾问）
 *   6. 轻量的修炼记录入口
 * 排行榜、徽章墙、玩家身份、本周任务等 → 我的（me.js）二级页面。
 */
const PageHome = {
  renderGuest(section) {
    const diet = section === 'diet'
    document.getElementById('app').innerHTML = Router.bar(diet ? '饮食' : section === 'today' ? '训练' : '洞府', '先体验，再开始你的修行') +
      '<section class="card"><span class="tag">免费体验</span><h2 style="margin-top:16px">先练一小步，不急着填资料。</h2><p class="muted">先看居家训练示例与完整免费功法；需要个人安排和饮食目标时，再用约1分钟建档。</p><button class="btn" onclick="Router.go(\'onboard\')">生成我的计划 · 去建档</button></section>' +
      '<section class="card"><h2>徒手筑基诀 <span class="tag">完整免费</span></h2><p class="muted">零基础起步 → 上下肢进阶，热身、动作清单、休息与加难条件都开放。</p><button class="btn ghost" onclick="Router.go(\'secret/bodyweight-start\')">先看居家训练示例</button></section>' +
      '<section class="card"><h2>先把基础学会</h2><p class="muted">热身、练后有氧、居家入门与日常恢复，基础功法无需建档即可阅读。</p><button class="btn ghost" onclick="Router.go(\'secret\')">浏览免费秘籍</button></section>' +
      (diet ? '<section class="card"><h2>饮食目标，按你的资料计算</h2><p class="muted">示例训练不代表个人处方。建档后再显示你的热量、蛋白质、碳水和脂肪目标。</p></section>' : '')
  },

  /* 角色形象按境界段取图：stage1..stage5，缺图自动回退 */
  get CHAR_STAGES(){return ENGINE.pageContract.CHAR_STAGES},

  charStageOf(level) {
    let pick = this.CHAR_STAGES[0]
    for (const s of this.CHAR_STAGES) if (level >= s.at) pick = s
    return pick
  },
  nextStageOf(level) {
    return this.CHAR_STAGES.find(s => level < s.at) || this.CHAR_STAGES[this.CHAR_STAGES.length - 1]
  },
  charImage(level) {
    return 'assets/characters/' + this.charStageOf(level).file
  },
  charStageName(level) {
    return this.charStageOf(level).name
  },

  render() {
    if (!Store.hasProfile()) return this.renderGuest('home')
    const u = Store.state.user, g = u.gamify || {}, P = u.player || {}
    const lv = ENGINE.gamify.levelOf(g.exp || 0)
    const realm = ENGINE.gamify.realmOf(lv.level)
    const today = Fmt.todayStr()
    const maxed = lv.level >= ENGINE.gamify.MAX_LEVEL
    const top = '<header class="appbar homebar"><div><span class="eyebrow">练不虚 · 日常修行</span><h1>今天，也进步一点。</h1></div>' +
      '<button class="profile-dot" aria-label="打开我的档案" onclick="Router.go(\'me\')">' + Fmt.esc((P.nickname || '我').slice(0, 1)) + '</button></header>'
    const hero = '<section class="hero"><div class="hero-in"><div class="hero-main">' +
      '<div class="eyebrow">' + Fmt.monthDay(today) + ' · ' + Fmt.weekdayCN(today) + '</div>' +
      '<div class="hero-who"><b>' + Fmt.esc(P.nickname || '修行者') + '</b><span class="realm-tag">' + Fmt.esc(realm.name) + '</span></div>' +
      '<div class="hero-title">Lv.' + lv.level + ' · ' + Fmt.esc(lv.title) + '</div>' +
      '<div class="hero-exp"><div class="lab"><span>修为</span><span>' + (maxed ? '境界已圆满' : Fmt.num(lv.exp-lv.cur) + ' / ' + Fmt.num(lv.span)) + '</span></div>' +
      '<div class="track"><div class="fill" style="width:' + (maxed ? 100 : lv.pct) + '%"></div></div></div>' +
      '<div class="hero-unlock">' + (maxed ? '继续修炼，记录每一次突破' : '再积累 ' + Fmt.num(lv.toNext) + ' 修为，升至 Lv.' + (lv.level+1)) + '</div>' +
      '<div class="hero-slogan">三月河东，三月河西，莫欺少年凡胎弱</div>' +
      '</div><div class="hero-av"><img src="' + this.charImage(lv.level) + '" alt="你的修炼角色" onerror="this.style.visibility=\'hidden\'"></div></div>' +
      '<div class="hero-footer"><span>连续修炼 <b>' + ((g.streak || {}).cur || 0) + '</b> 天</span>' +
      '<button class="text-link" onclick="Router.go(\'growth\')">查看成长 ›</button></div></section>'
    const duo = '<div class="duo-row">' +
      '<button class="card duo" onclick="Router.go(\'ai\')"><span class="duo-symbol">' + Tabbar.icon('mentor') + '</span><b>随身导师</b><span class="muted txs">遇到问题，随时问</span><span class="duo-arrow">↗</span></button>' +
      '<button class="card duo" onclick="Router.go(\'secret\')"><span class="duo-symbol">' + Tabbar.icon('book') + '</span><b>藏经阁</b><span class="muted txs">找到适合你的功法</span><span class="duo-arrow">↗</span></button></div>' +
      '<button class="chip" style="width:100%;margin-top:14px;padding:12px;font-size:13px" onclick="PagePoster.showToday()">📸 昭告天下 · 晒今日战报</button>' +
      '<button class="chip" style="width:100%;margin-top:8px;padding:12px;font-size:13px" onclick="PagePoster.showLife()">🏆 修行生涯卡 · 晒累计</button>'
    document.getElementById('app').innerHTML = top +
      (Store.state.demo ? '<div class="demo-note"><span class="status-dot"></span>演示体验 · 示例档案，记录仅存本机<button class="text-link" onclick="Router.go(\'login\')">登录 ›</button></div>' : '') +      hero + '<div class="home-daily">' + this.trainCard(u,today) + this.dietCard(u,today) + '</div>' +
      this.recoveryCard(u, today) + duo +
      '<button class="card conditioning" style="width:100%;text-align:left;color:var(--tx)" onclick="Router.go(\'tcm\')"><div class="row between"><div><h2 style="margin-bottom:4px">调理 · 内修</h2><div class="muted txs">体质倾向、日常食养与训练恢复</div></div><span>›</span></div></button>' +
      '<button class="record-link" onclick="Router.go(\'records\')"><span>每一次坚持，都有迹可循</span><b>修炼记录 ›</b></button>'
    this.bindRecovery(today)
    PageBreak.check()
  },

  /** 今日恢复卡：睡眠 + 补水（写入当日 checkin 的 sleepHours / waterMl，
   *  云端结算会消费这两个字段 —— 「睡够 7 小时」「喝水达标」都算修为，水怪/睡神徽章也看它们）。 */
  recoveryCard(u, today) {
    const ck = Store.checkinOf(today) || {}
    const sleep = Number(ck.sleepHours) || 0
    const water = Number(ck.waterMl) || 0
    const chips = [6, 6.5, 7, 7.5, 8, 8.5, 9]
    return '<div class="card today-card" id="recoveryCard">' +
      '<div class="section-label">今日恢复</div><h2>睡够 + 喝够，也算修炼</h2>' +
      '<div class="recovery-row"><span class="rc-lab">昨晚睡眠</span>' +
        chips.map(h => '<button class="chip sm' + (sleep === h ? ' on' : '') + '" data-sleep="' + h + '">' + h + 'h</button>').join('') +
        '<span class="muted txs rc-note" id="sleepNote">' + (sleep ? (sleep >= 7 ? '✓ ' + sleep + ' 小时，达标' : sleep + ' 小时，7 小时起才有睡够加成') : '点一下就记上') + '</span></div>' +
      '<div class="recovery-row"><span class="rc-lab">今天喝水</span>' +
        '<b id="waterVal">' + Fmt.num(water) + '</b><span class="muted txs">ml</span>' +
        '<button class="chip sm" data-water="250">+250</button>' +
        '<button class="chip sm" data-water="500">+500</button>' +
        '<button class="chip sm" data-water="0">清零</button>' +
        '<span class="muted txs rc-note" id="waterNote">' + (water >= Math.round((Number((u.profile || {}).weight) || 60) * 30)
          ? '✓ 已达标（体重×30ml）'
          : '目标约 ' + Fmt.num(Math.round((Number((u.profile || {}).weight) || 60) * 30)) + 'ml（体重×30）') + '</span></div>' +
    '</div>'
  },

  bindRecovery(today) {
    const card = document.getElementById('recoveryCard')
    if (!card) return
    const target = Math.round((Number((Store.state.user || {}).profile || {}).weight || 60) * 30)
    const paint = (sleep, water) => {
      card.querySelectorAll('[data-sleep]').forEach(b => b.classList.toggle('on', Number(b.dataset.sleep) === sleep))
      const sn = document.getElementById('sleepNote')
      if (sn) sn.textContent = sleep ? (sleep >= 7 ? '✓ ' + sleep + ' 小时，达标' : sleep + ' 小时，7 小时起才有睡够加成') : '点一下就记上'
      const wv = document.getElementById('waterVal')
      if (wv) wv.textContent = Fmt.num(water)
      const wn = document.getElementById('waterNote')
      if (wn) wn.textContent = water >= target ? '✓ 已达标（体重×30ml）' : '目标约 ' + Fmt.num(target) + 'ml（体重×30）'
    }
    const save = async (patch) => {
      const ck = Object.assign({}, Store.checkinOf(today) || {}, { date: today }, patch)
      await Store.pushCheckin(ck)
      paint(Number(ck.sleepHours) || 0, Number(ck.waterMl) || 0)
    }
    card.querySelectorAll('[data-sleep]').forEach(b => {
      b.onclick = async () => { await save({ sleepHours: Number(b.dataset.sleep) }); UI.toast('已记睡眠 ' + b.dataset.sleep + ' 小时') }
    })
    card.querySelectorAll('[data-water]').forEach(b => {
      b.onclick = async () => {
        const cur = Number((Store.checkinOf(today) || {}).waterMl) || 0
        const next = b.dataset.water === '0' ? 0 : cur + Number(b.dataset.water)
        await save({ waterMl: next })
        UI.toast(b.dataset.water === '0' ? '饮水记录已清零' : '已记 ' + next + ' ml')
      }
    })
  },

  /** 今日训练卡：练什么 / 多大量 / 预计多久；休息日给恢复任务 */
  trainCard(u, today) {
    const plan = u.plan
    if (!plan || !plan.micro || !plan.micro.length) {
      return '<div class="card today-card"><h2>今日训练</h2>' +
        '<p class="muted">还没有训练计划</p>' +
        '<button class="btn" onclick="Router.go(\'onboard\')">去建档生成计划</button></div>'
    }
    const idx = ENGINE.calc.dayIndexFromStart(plan.cycleStart || today, today)
    const day = ENGINE.kb.dayContent(plan, Math.max(0, idx), u.profile, !!plan.home)

    if (day.type === 'rest') {
      return '<div class="card today-card rest">' +
        '<h2>今日休息 <span class="tag">恢复日</span></h2>' +
        '<p class="muted txs">' + Fmt.esc(day.note || '散步 / 拉伸 / 筋膜放松，恢复也是训练的一部分。') + '</p>' +
        '<div class="muted txs">今天不练不扣修为，好好恢复，明天接着来。</div>' +
        '<button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'today\')">看恢复安排</button>' +
      '</div>'
    }

    // 量：动作数 / 总组数 / 预计时长（每组 = 该动作组歇 + ~45s 完成）
    const exs = day.exercises || []
    const saved = PageToday.readDraft(today) || Store.checkinOf(today)
    const setsN = exs.reduce((s, e) => { const recorded = ((saved || {}).exercises || []).find(x => x.name === e.name); return s + (recorded && recorded.log ? recorded.log.length : Number(String(e.sets).split('×')[0]) || 3) }, 0)
    const sec = exs.reduce((s, e) => {
      const n = Number(String(e.sets).split('×')[0]) || 3
      return s + n * 45 + Math.max(0, n - 1) * (e.rest || 120)
    }, (day.warmup && day.warmup.minutes || 8) * 60)
    const est = Math.max(30, Math.round(sec / 60 / 5) * 5)
    const ck = PageToday.readDraft(today) || Store.checkinOf(today)
    const doneSets = ((ck && ck.exercises) || []).reduce((s, e) =>
      s + (e.log || []).filter(x => x.done).length, 0)
    const warm = day.warmup && day.warmup.items && day.warmup.items.length
      ? '热身 ' + (day.warmup.minutes || 8) + ' 分钟 · ' + Fmt.esc(day.warmup.items.slice(0, 2).join(' / ')) : ''

    return '<div class="card today-card">' +
      '<div class="section-label">今日训练</div><h2 class="focus-title"><span>' + Fmt.esc(day.focus) + '</span>' +
        (day.src === '推演' ? '<span class="tag warn">推演</span>' : '') + '</h2>' +
      '<div class="today-stats">' +
        '<div><b>' + exs.length + '</b><span>个动作</span></div>' +
        '<div><b>' + setsN + '</b><span>组</span></div>' +
        '<div><b>约 ' + est + '</b><span>分钟</span></div>' +
        (doneSets ? '<div><b>' + doneSets + '</b><span>组已完成</span></div>' : '') +
      '</div>' +
      (warm ? '<details class="home-warmup"><summary>热身准备 · ' + (day.warmup.minutes || 8) + ' 分钟</summary><p class="muted txs">' + warm + '</p></details>' : '') +
      '<button class="btn big" style="margin-top:12px" onclick="Router.go(\'today\')">' +
        (doneSets ? '继续训练' : '开始训练') + '</button>' +
      '<div class="row between" style="margin-top:8px">' +
        '<button class="chip sm" onclick="Router.go(\'plan\')">看完整计划</button>' +
        '<button class="chip sm" onclick="Router.go(\'coach/schedule\')">今天没空？顺延训练</button>' +
      '</div>' +
    '</div>'
  },

  /** 今日饮食卡：目标 / 已记录 / 剩余（口径与饮食页完全一致：本机饮食记录 + 引擎目标） */
  dietCard(u, today) {
    try {return PageDiet.goalCard(ENGINE.calc.energyPlan(u.profile,Store.adj()),u.profile||{},u,{compact:true})}catch(e){return ''}
  }
}
