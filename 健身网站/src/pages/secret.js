/* src/pages/secret.js —— 秘籍：挑一本 → 你的计划和饮食当场跟着变
 *
 * 两态：
 *   未开通 → 看得到「解决什么」和理论，具体条目锁住（勾起兴趣，但不白送）
 *   已开通 → 全部内容 + 「用这本」按钮（真正改 goal / 计划 / 饮食档）
 */
const PageSecret = {
  render(args) {
    const key = (args && args[0]) || ''
    if (Foundations.get(key)) Foundations.detail(key)
    else if (key) this.detail(key)
    else this.list()
  },

  // ───────────── 秘籍库 ─────────────

  list() {
    const u = Store.state.user || {}
    const on = ENGINE.pro.isPro(u)
    const cur = ENGINE.secret.currentOf(u.profile)
    const app = document.getElementById('app')
    app.innerHTML = Router.bar('藏经阁', '先把基础练好，再选择进阶方向') +
      '<section class="library-lead"><div class="eyebrow">修行，从一本开始</div><h2>找到今天用得上的功法。</h2><p>基础功法完整开放；居家、部位专项、体态矫正按需挑选。</p></section>' +
      '<div class="library-tabs"><button class="chip on" data-filter="all">全部</button><button class="chip" data-filter="free">免费入门</button><button class="chip" data-filter="home">居家</button><button class="chip" data-filter="focus">部位专项</button><button class="chip" data-filter="posture">体态矫正</button><button class="chip" data-filter="advanced">进阶周期</button></div>' +
      '<div class="manual-grid" id="manualGrid">' +
      Foundations.books.map(s => '<button class="manual-card manual-'+s.tone+'" data-access="free" data-cat="free" data-secret="'+s.key+'"><div class="manual-top"><span>'+s.category+'</span><span class="access-free">免费</span></div><div class="manual-glyph">'+s.mark+'</div><h2>'+s.name+'</h2><p>'+s.subtitle+'</p><div class="manual-bottom"><span>'+s.time+'</span><b>开始修习 ↗</b></div></button>').join('') +
      ENGINE.secret.SECRETS.map(s => this.card(s, cur, on)).join('') + '</div>' +
      '<div class="library-note">基础内容可以直接使用；进阶周期保留原会员权益，应用计划前会说明将改动什么。</div>' +
      // 「还在补的」诚实卡必须保留：不拿半成品凑数（项目规矩，test-pages 有断言）
'<h2 style="margin:18px 0 4px;font-size:15px">全部秘籍一览 <span class="mini">' +
      Foundations.books.length + ' 本基础功法 + 女性周期训练（免费）+ ' + (ENGINE.secret.SECRETS.length - 1) + ' 本会员内容</span></h2>' +
      this.roadmapCard()
    this.bindList()
    const rb = document.getElementById('restorePlanBtn')
    if (rb) rb.onclick = () => this.restoreBackup()
    document.querySelectorAll('[data-filter]').forEach(btn => btn.onclick = () => {
      document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('on',x===btn))
      document.querySelectorAll('[data-cat]').forEach(x => { x.hidden = btn.dataset.filter !== 'all' && x.dataset.cat !== btn.dataset.filter })
    })
  },

  /** 分类 → 卡片角标字 / 分类名 */
  catMeta(cat) {
    return cat === 'home' ? { glyph: '居', label: '居家计划' }
    : cat === 'focus' ? { glyph: '专', label: '部位专项' }
    : cat === 'posture' ? { glyph: '衡', label: '体态矫正' }
    : cat === 'female' ? { glyph: '她', label: '女性训练' }
    : { glyph: '进', label: '进阶周期' }
  },

  statusCard(cur, on) {
    const u = Store.state.user || {}
    const bk = u.lastPlanBackup
    const restoreBtn = (bk && bk.plan)
      ? '<button class="btn ghost" style="margin-top:10px" id="restorePlanBtn">↩ 换回挂秘籍之前的计划</button>'
      : ''
    if (!on) {
      return '<div class="card">' +
        '<h2>秘籍是什么 <span class="tag gold">完整版</span></h2>' +
        '<div class="muted txs">功法分品阶：基础功法是<b>黄阶</b>，完整开放；<b>玄阶、地阶功法</b>（部位专项 / 体态矫正 / 居家周期 / 进阶周期）随完整版解锁 —— ' +
        '不是解锁几个功能，是拿到主角配置。每一条结论都标了是谁说的。</div>' + restoreBtn + '</div>'
    }
    if (!cur) {
      return '<div class="card"><h2>你还没挑秘籍</h2>' +
        '<div class="muted txs">下面挑一本。挑了之后目标、计划、饮食档会一起换，不满意随时换回来。</div>' +
        restoreBtn + '</div>'
    }
    return '<div class="card">' +
      '<h2>正在用 <span class="tag">' + Fmt.esc(cur.name) + '</span></h2>' +
      '<div class="muted txs">' + Fmt.esc(cur.weeks) + ' 周 · ' + Fmt.esc(cur.tagline) + '</div>' +
      '<button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'secret/' + Fmt.esc(cur.key) + '\')">看这本的内容</button>' +
      restoreBtn +
    '</div>'
  },

  /** 换回挂秘籍之前的计划（免费可用，防流失兜底；快照消费即删） */
  restoreBackup() {
    const u = Store.state.user
    const b = u && u.lastPlanBackup
    if (!b || !b.plan) { UI.toast('没有可换回的备份'); return }
    const sname = (ENGINE.secret.get(b.fromSecretKey) || {}).name || '秘籍'
    UI.modal({
      title: '换回挂《' + Fmt.esc(sname) + '》之前的计划？',
      body: '<p class="muted txs">会整体恢复到挂秘籍之前的训练计划、目标和分化，继续原来的周期进度；挂上秘籍之后手动改过的动作不会保留。</p>',
      okText: '换回',
      onOk: () => {
        const r = ENGINE.planBackup.restoreData(b, u.profile)
        if (!r) { UI.toast('备份坏了，换不回来'); return }
        Store.patchUser({ plan: r.plan, profile: r.profile, lastPlanBackup: null })
        UI.toast('已换回之前的计划')
        Router.go('plan')
      }
    })
  },

  /** 品阶（2026-10-17 斗破式包装）：基础功法=黄阶（免费）；女性周期训练=黄阶（2026-10-18 免费开放）；部位专项/体态/居家=玄阶；进阶周期=地阶 */
  gradeOf(s) {
    if (!s) return ''
    if (s.cat === 'female') return '黄阶'
    return s.cat === 'advanced' ? '地阶' : '玄阶'
  },

  isFree(s) {
    return !!s && s.cat === 'female'
  },

  card(s, cur, on) {
    const using = cur && s.key === cur.key
    const meta = this.catMeta(s.cat)
    const free = this.isFree(s)
    const tags = Array.isArray(s.tags) && s.tags.length
      ? '<div class="muted" style="font-size:11px;margin-top:4px">' + Fmt.esc(s.tags.join(' · ')) + '</div>' : ''
    return '<button class="manual-card manual-ink" data-access="' + (free ? 'free' : 'advanced') + '" data-cat="' + Fmt.esc(s.cat || 'advanced') + '" data-secret="' + Fmt.esc(s.key) + '">' +
      '<div class="manual-top"><span>' + meta.label + ' · ' + this.gradeOf(s) + '</span><span class="access-paid">' + (using ? '使用中' : free ? '免费' : on ? '已解锁' : '会员') + '</span></div>' +
      '<div class="manual-glyph">' + (s.kind === 'append' ? '衡' : meta.glyph) + '</div><h2>' + Fmt.esc(s.name) + '</h2>' +
      '<p>' + Fmt.esc(s.tagline) + '</p>' + tags +
      '<div class="manual-bottom"><span>' + s.weeks + ' 周</span><b>查看详情 ↗</b></div></button>'

  },

  /** 还没做的几本，明说为什么没做 —— 不拿半成品凑数 */
  roadmapCard() {
    const r = ENGINE.secret.ROADMAP
    if (!r.length) return ''
    return '<div class="card"><h2>还在补的 <span class="mini">' + r.length + ' 本</span></h2>' +
      r.map(x => '<div style="margin-top:6px"><b style="font-size:13px">' + Fmt.esc(x.name) +
        '</b><div class="muted txs">' + Fmt.esc(x.why) + '</div></div>').join('') +
    '</div>'
  },

  bindList() {
    document.querySelectorAll('#app [data-secret]').forEach(el => {
      el.onclick = () => Router.go('secret/' + el.dataset.secret)
    })
  },

  // ───────────── 秘籍详情 ─────────────

  detail(key) {
    const s = ENGINE.secret.get(key)
    const app = document.getElementById('app')
    if (!s) {
      app.innerHTML = Router.bar('秘籍') + '<div class="card">' + UI.empty('没有这本秘籍') +
        '<button class="btn" onclick="Router.go(\'secret\')">回秘籍库</button></div>'
      return
    }
    const u = Store.state.user || {}
    // 2026-10-18 女性线：女性周期训练（cat 'female'）免费开放
    const on = ENGINE.pro.isPro(u) || s.cat === 'female'
    const cur = ENGINE.secret.currentOf(u.profile)
    const using = cur && cur.key === s.key

    app.innerHTML = '<button class="text-link book-back" onclick="Router.go(\'secret\')">‹ 返回藏经阁</button>' + Router.bar(s.name, s.weeks + ' 周 · ' + s.tagline) +
      this.cover(s, using) +
      this.block('这本秘籍解决什么', s.solves.map(x => ({ d: x })), on, false) +
      this.block('理论 · 底层逻辑', s.theory, on, true, using) +
      this.block('怎么吃', s.eat, on, true, using) +
      this.block('怎么练', s.train, on, true, using) +
      this.outline(s, on) +
      this.sourceCard(s) +
      this.actionBar(s, on, using)

    const btn = document.getElementById('useSecret')
    if (btn) btn.onclick = () => this.use(s.key)
    const goBtn = document.getElementById('startSecret')
    if (goBtn) goBtn.onclick = () => this.use(s.key, true)
    const rb = document.getElementById('restorePlanBtn')
    if (rb) rb.onclick = () => this.restoreBackup()
  },

  cover(s, using) {
    return '<div class="card" style="border-color:var(--green)">' +
      '<h2>' + Fmt.esc(s.name) +
        (using ? ' <span class="tag gold">正在用</span>' : '') + ' <span class="tag">' + this.gradeOf(s) + '功法</span></h2>' +
      '<div class="muted txs">' + Fmt.esc(s.weeks) + ' 周 · ' + Fmt.esc(s.tagline) + '</div>' +
      '<div class="muted txs" style="margin-top:4px">适合：' + Fmt.esc(s.forWho) + '</div>' +
    '</div>'
  },

  /** 内容块：未开通时只露第一条，其余锁住。
   *  applied=false（这本还没应用）时，把内容里写死的「已自动加进你的计划」改成
   *  「应用这本后自动加进」—— 2026-10-18 线上复查：没开通只打开详情就说「已自动加进」是假话 */
  block(title, rows, on, lockable, applied) {
    const list = rows || []
    if (!list.length) return ''
    const shown = (on || !lockable) ? list : list.slice(0, 1)
    const locked = (on || !lockable) ? 0 : list.length - 1
    const fixT = t => applied === false
      ? String(t).replace('（已自动加进你的计划）', '（应用这本后自动加进）')
      : String(t)
    return '<div class="card"><h2>' + Fmt.esc(title) +
      (locked ? ' <span class="mini">还有 ' + locked + ' 条</span>' : '') + '</h2>' +
      shown.map(x => '<div style="margin-top:8px">' +
        (x.t ? '<b style="font-size:13px">' + Fmt.esc(fixT(x.t)) + '</b>' : '') +
        '<div class="muted txs">' + Fmt.esc(x.d || '') + '</div>' +
        (x.from ? '<div class="muted txs" style="margin-top:2px">出处：' + Fmt.esc(x.from) + '</div>' : '') +
      '</div>').join('') +
      (locked ? '<div class="muted txs" style="margin-top:10px;padding:10px;border:1px dashed var(--line);' +
        'border-radius:var(--r-sm);text-align:center">开通完整版后解锁全部 ' + list.length + ' 条</div>' : '') +
    '</div>'
  },

  outline(s, on) {
    const rows = on ? s.outline : (s.outline || []).slice(0, 2)
    return '<div class="card"><h2>' + s.weeks + ' 周大纲' +
      (on ? '' : ' <span class="mini">后 ' + Math.max(0, s.outline.length - 2) + ' 周待解锁</span>') + '</h2>' +
      rows.map(w => '<div class="cyc-row" style="margin-top:6px">' +
        '<div class="cyc-h"><b>第 ' + w.w + ' 周</b></div>' +
        '<div class="muted txs" style="margin-top:2px"><b>' + Fmt.esc(w.t) + '</b></div>' +
        '<div class="muted txs">' + Fmt.esc(w.d) + '</div>' +
      '</div>').join('') +
    '</div>'
  },

  sourceCard(s) {
    return '<div class="card"><h2>内容出处</h2>' +
      '<div class="muted txs">这本秘籍整理自：</div>' +
      (s.sources || []).map(x => '<div class="muted txs">· ' + Fmt.esc(x) + '</div>').join('') +
      '<div class="muted txs" style="margin-top:8px">每一段内容下面都标了具体出处。' +
        '我们只做整理和编排，不冒称是本人所讲。</div>' +
    '</div>'
  },

  actionBar(s, on, using) {
    if (!on) {
      return '<div class="card"><h2>怎么用上这本</h2>' +
        '<div class="muted txs">秘籍随「完整版」开通。开通之后点一下「用这本」，' +
        '你的目标、训练计划、饮食档会一起换成这本的配置。</div>' +
        '<button class="btn" style="margin-top:10px" onclick="Router.go(\'pro\')">去开通完整版</button>' +
      '</div>'
    }
    const appendBtn = s.kind === 'append' ? '用这本 · 挂到我的训练日' : '用这本 · 换掉我的计划'
    return '<div class="card">' +
      '<h2>' + (using ? '正在用这本' : '换上这本') + '</h2>' +
      (s.kind === 'append'
        ? '<div class="muted txs">点了会把 <b>' + Fmt.esc((s.preset.append || []).map(a => a.name).join('、')) +
          '</b> 加到你<b>每个训练日的末尾</b>（计划页的动作卡里能看到，随时可删）。你的分化、组次、周期都不动。</div>'
        : '<div class="muted txs">点了会改三样东西：<b>目标</b>（' + Fmt.esc(s.preset.goal) + '）、' +
          '<b>训练计划</b>（' + Fmt.esc(s.preset.split) + ' / ' + Fmt.esc(s.preset.freq) + '）、' +
          '并把周期起点重置到今天。饮食口径在饮食页自己挑。</div>') +
      (using
        ? '<button class="btn" style="margin-top:12px" id="startSecret">跟着开练 → 去今天的训练</button>'
        : '<button class="btn" style="margin-top:12px" id="useSecret">' + appendBtn + '</button>' +
          '<button class="btn ghost" style="margin-top:10px" id="startSecret">跟着开练 → 直接去训练页</button>') +
      (((Store.state.user || {}).lastPlanBackup || {}).plan
        ? '<button class="btn ghost" style="margin-top:10px" id="restorePlanBtn">↩ 换回挂秘籍之前的计划</button>'
        : '') +
    '</div>'
  },

  /** go = true：套用完直接跳训练页跟着练（「跟着开练」按钮） */
  use(key, go) {
    if (!Store.hasProfile() || Store.state.demo) { Router.go('onboard'); return }
    const s = ENGINE.secret.get(key)
    if (!s) return
    const u = Store.state.user
    // 挂载前快照（只在空的时候建；换回 = 回到挂秘籍之前的最初状态。免费可用，防流失兜底）
    const backup = ENGINE.planBackup.makeBackup(u, key)
    if (backup) u.lastPlanBackup = backup
    const p = ENGINE.secret.applyTo(key, u.profile)
    if (!p) return
    p.secret = { key: key, since: Fmt.todayStr() }
    u.profile = p

    // append 型（体态三本 / 部位专项）：不重排计划，往每个训练日末尾加动作（slotExercises，可随时删）
    if (s.kind === 'append') {
      const acts = (s.preset && s.preset.append) || []
      const plan = u.plan && u.plan.micro ? JSON.parse(JSON.stringify(u.plan)) : null
      if (!plan) { UI.toast('先有训练计划再用这本 —— 先去建档或换循环'); return }
      const sx = Object.assign({}, plan.slotExercises || {})
      // 已用过同一本 → 先清掉旧的（换一本时替换而不是叠加）
      Object.keys(sx).forEach(k => { sx[k] = (sx[k] || []).filter(e => !e.fromSecret) })
      let touched = 0
      plan.micro.forEach((m, slot) => {
        const isTrain = m !== 'rest' && !(typeof m === 'object' && m.type === 'rest')
        if (!isTrain) return
        const add = acts.map(a => ({
          oid: '', name: a.name, sets: a.sets || '3×15',
          role: '辅助', equipment: '', custom: true, fromSecret: key
        }))
        sx[String(slot)] = (sx[String(slot)] || []).concat(add)
        touched++
      })
      plan.slotExercises = sx
      u.plan = plan
      Store.saveCloud({ profile: p, plan: u.plan, lastPlanBackup: u.lastPlanBackup || null })
      UI.toast('已挂上《' + s.name + '》—— ' + touched + ' 个训练日末尾加了动作' + (go ? '，跟着开练' : ''))
      if (go) Router.go('today')
      else this.render([key])
      return
    }

    let np = null
    try {
      np = ENGINE.kb.generatePlan(p, {
        split: s.preset.split, freq: s.preset.freq,
        home: s.preset.home !== undefined ? !!s.preset.home : !!p.home, dietMode: p.dietMode
      })
      np.cycleStart = Fmt.todayStr()
      u.plan = np
      // 场景/分化/频率写回 profile（修 profile-plan 脱节：否则档案页和计划页对不上）
      p.split = np.split; p.freq = np.freq; p.home = !!np.home
    } catch (e) { np = null }
    Store.saveCloud({ profile: p, plan: u.plan, lastPlanBackup: u.lastPlanBackup || null })
    UI.toast('已换上《' + s.name + '》' + (np ? ' —— 计划也换了，跟着开练' : ''))
    if (go) Router.go('today')
    else this.render([key])
  }
}
