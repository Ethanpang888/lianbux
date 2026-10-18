/* src/pages/coach.js —— 调整顾问：点一下情况 → 看建议 → 应用进计划
 *
 * 这是「反馈 → 调整 → 确认 → 同步」闭环的前半段，全部由规则引擎驱动（零 AI 成本）。
 * AI 顾问上线后挂在两头：听懂人话（把「最近老饿」映射成 hungry），和把结论说成人话。
 */
const PageCoach = {
  picked: '',
  result: null,

  render() {
    document.getElementById('app').innerHTML =
      Router.bar('调一下', '按规则算，不猜') +
      this.picker() +
      '<div id="coachOut"></div>' +
      this.aiHint()
    this.bind()
    this.paint()
  },

  picker() {
    const C = ENGINE.coach
    const cur = C.SITUATIONS.filter(s => s.key === this.picked)[0]
    return '<div class="card">' +
      '<h2>哪儿不对劲 <span class="mini">点一个，我给你算</span></h2>' +
      '<div class="wrap-row">' +
        C.SITUATIONS.map(s => '<button class="chip' + (this.picked === s.key ? ' on' : '') +
          '" data-sit="' + s.key + '">' + Fmt.esc(s.name) + '</button>').join('') +
      '</div>' +
      '<div class="muted txs" style="margin-top:8px">' +
        Fmt.esc(cur ? cur.hint : '这些都能算出来，不用瞎猜；算不出来的我不编。') + '</div>' +
    '</div>'
  },

  paint() {
    const box = document.getElementById('coachOut')
    if (!box) return
    const r = this.result
    if (!this.picked || !r) { box.innerHTML = ''; return }
    if (!r.ok) {
      box.innerHTML = '<div class="card"><h2>这个算不了</h2>' +
        '<div class="muted txs">' + Fmt.esc(r.msg || '') + '</div></div>'
      return
    }
    // 需要先选一个动作（「有个动作不舒服」这一步）
    if (r.needPick) {
      box.innerHTML = '<div class="card"><h2>' + Fmt.esc(r.title) + '</h2>' +
        '<div class="muted txs">' + Fmt.esc(r.why || '') + '</div>' +
        '<div class="wrap-row" style="margin-top:10px">' +
          (r.options || []).map(o => '<button class="chip sm" data-ex="' + Fmt.esc(o.key) + '">' +
            Fmt.esc(o.name) + '</button>').join('') +
        '</div></div>'
      document.querySelectorAll('#app button[data-ex]').forEach(b => {
        b.onclick = () => {
          this.result = this.compute(this.picked, b.dataset.ex)
          this.paint()
        }
      })
      return
    }
    box.innerHTML = '<div class="card">' +
      '<h2>' + Fmt.esc(r.title) +
        (r.src ? ' <span class="tag' + (r.src === '推演' ? ' warn' : '') + '">' + Fmt.esc(r.src) + '</span>' : '') +
      '</h2>' +
      '<div class="muted txs">' + Fmt.esc(r.why || '') + '</div>' +
      (r.changes && r.changes.length
        ? '<div style="margin-top:10px;border-top:1px dashed var(--line);padding-top:6px">' +
          r.changes.map(c => UI.li(Fmt.esc(c.k), Fmt.esc(c.from), '→ ' + Fmt.esc(c.to))).join('') +
          '</div>'
        : '') +
      (r.note ? '<div class="muted txs" style="margin-top:10px;border-top:1px dashed var(--line);padding-top:8px">' +
        Fmt.esc(r.note) + '</div>' : '') +
      (r.apply
        ? '<button class="btn" style="margin-top:12px" id="coachApply">应用到我的计划</button>'
        : '<div class="muted txs" style="margin-top:10px">这条不用改计划 —— 照着做就行。</div>') +
    '</div>'
    const btn = document.getElementById('coachApply')
    if (btn) btn.onclick = () => this.apply()
  },

  bind() {
    document.querySelectorAll('#app button[data-sit]').forEach(b => {
      b.onclick = () => {
        this.picked = b.dataset.sit
        this.result = this.compute(this.picked)
        this.render()
      }
    })
  },

  compute(key, ex) {
    const u = Store.state.user || {}
    const plan = u.plan
    const today = Fmt.todayStr()
    let day = null
    if (plan && plan.micro && plan.micro.length) {
      try {
        const idx = Math.max(0, ENGINE.calc.dayIndexFromStart(plan.cycleStart || today, today))
        day = ENGINE.kb.dayContent(plan, idx, u.profile, !!plan.home)
      } catch (e) { day = null }
    }
    try {
      return ENGINE.coach.advise(key, {
        engine: ENGINE,
        profile: u.profile || {},
        plan: plan,
        dietState: u.dietState || {},
        checkins: Store.state.checkins || [],
        day: day,
        today: today
      }, { exercise: ex })
    } catch (e) { return { ok: false, msg: (e && e.message) || String(e) } }
  },

  apply() {
    const r = this.result
    if (!r || !r.apply) return
    const u = Store.state.user
    const a = r.apply
    try {
      if (a.type === 'macro') {
        u.dietState = ENGINE.macro.apply(a.payload.rev, u.dietState)
        Store.saveCloud({ dietState: u.dietState })
      } else if (a.type === 'hunger') {
        u.dietState = Object.assign({}, u.dietState, a.payload.next, { lastType: '很饿' })
        Store.saveCloud({ dietState: u.dietState })
      } else if (a.type === 'state') {
        u.profile = Object.assign({}, u.profile, {
          todayState: { date: Fmt.todayStr(), key: a.payload.key }
        })
        Store.saveCloud({ profile: u.profile })
      } else if (a.type === 'plan') {
        u.plan = a.payload.plan
        Store.saveCloud({ plan: u.plan })
      } else {
        UI.toast('这条还不支持自动应用'); return
      }
      UI.toast('已应用 —— 计划已经改了')
      this.result = null
      this.picked = ''
      this.render()
    } catch (e) { UI.toast('应用失败：' + ((e && e.message) || e)) }
  },

  /** AI 顾问已上线：规则算不出的一半交给知识库 + 大模型 */
  aiHint() {
    return '<div class="card">' +
      '<h2>更细的问题 <span class="tag gold">AI 顾问</span></h2>' +
      '<div class="muted txs">上面这些是「能用数据算出来」的调整。下面这类要动教练知识库，去问 AI：</div>' +
      ENGINE.coach.AI_TOPICS.map(t =>
        '<div class="muted txs" style="margin-top:4px">· ' + Fmt.esc(t) + '</div>').join('') +
      '<button class="btn" style="margin-top:10px" onclick="Router.go(\'ai\')">去问 AI 顾问 →</button>' +
      '<div class="muted txs" style="margin-top:6px">它的知识库是谭成义的口径，你的数字是引擎算的 —— 它不编数。' +
      '如果它觉得你的计划要调，会给一个「一键应用」按钮。</div>' +
    '</div>'
  }
}
