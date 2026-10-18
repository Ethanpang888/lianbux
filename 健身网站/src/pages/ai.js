/* src/pages/ai.js —— AI 顾问对话页（智谱 GLM 免费模型，云端 webApi aiChat 接口）
 *
 * 分界线（写死）：能算的绝不让模型猜 ——
 *   · 数字（热量/克数/课表/体重趋势）由云端引擎算好塞进 system prompt；
 *   · 模型只负责解释和给执行建议；
 *   · 若模型判断需要自动调整计划，会在末尾输出 [APPLY:key] 标记，
 *     前端抓到后变成「一键应用」按钮，复用调整顾问（coach.js）的 apply 逻辑。
 *
 * 配额（云端执行）：会员每天 20 次，免费用户每天 3 次尝鲜 —— 免费 key 是账号级限速，
 * 留配额是防单个人刷爆把其他人的请求挤挂，不是为了省钱。
 */
const PageAi = {
  msgs: [],       // { role: 'user'|'assistant', content }
  quota: null,    // { used, cap, member }
  busy: false,

  render() {
    const u = Store.state.user
    const logged = !!(u && Store.state.token)
    // 对话保留在本机（刷新/隔天回来还在）—— 用户 2026-10-15 自查清单④
    let saved = []
    try { saved = JSON.parse(localStorage.getItem('lbgym_aichat') || '[]') } catch (e) { saved = [] }
    this.msgs = Array.isArray(saved) ? saved.slice(-20) : []
    this.quota = null
    document.getElementById('app').innerHTML =
      Router.bar('AI 顾问', '知识是谭成义的 · 数字是引擎算的') +
      '<div class="card">' +
        '<h2>问点什么 <span class="mini">GLM · 免费</span></h2>' +
        '<div class="muted txs">训练怎么调、重量怎么加、饮食怎么改 —— 它答不了的会直接说，不编。</div>' +
        // 2026-10-18 线上复查：未登录时提前说明额度，别让用户点完示例问题才跳登录
        (logged ? '' : '<div class="muted txs" style="margin-top:6px;color:var(--warn)">还没登录 —— 登录后每天可免费问 3 次（完整版每天 20 次）。点上面任意问题会自动带你登录，登录后接着问。</div>') +
        '<div class="wrap-row" style="margin-top:8px">' +
          ['这周帮我复盘一下', '卧推重量卡住了怎么办', '减脂期碳水怎么吃', '练后总是很饿正常吗', '肩膀疼还能练胸吗'].map(q =>
            '<button class="chip" data-q="' + Fmt.esc(q) + '">' + Fmt.esc(q) + '</button>').join('') +
        '</div>' +
      '</div>' +
      '<div class="card" id="aiChatCard">' +
        '<div id="aiLog" style="max-height:none">' +
          (this.msgs.length ? '' : '<div class="muted txs" id="aiEmpty">还没开始聊。上面点一个，或直接在下面输入。</div>') +
        '</div>' +
        '<input id="aiIn" class="pro-input" type="text" placeholder="输入问题，比如：卧推怎么加重量…" style="font-size:16px;padding:13px 14px">' +
        '<button class="btn" id="aiSend" style="margin-top:8px;padding:14px;font-size:16px">发送</button>' +
        '<div class="muted txs" style="margin-top:6px;display:flex;justify-content:space-between;align-items:center">' +
          '<span id="aiQuota">' +
            (ENGINE.pro.isPro(u) ? '会员额度：每天 20 次' : '免费尝鲜：每天 3 次 · 开通完整版每天 20 次') + '</span>' +
          '<button class="chip" style="padding:2px 10px;font-size:11px" id="aiNew">新对话</button></div>' +
      '</div>'
    this.bind()
    // 登录回来：把未登录时点的问题自动接着问（2026-10-18 线上复查）
    if (logged) {
      let pending = ''
      try { pending = localStorage.getItem('lbgym_ai_pending') || '' } catch (e) {}
      if (pending) {
        try { localStorage.removeItem('lbgym_ai_pending') } catch (e) {}
        setTimeout(() => { if (!this.busy) this.send(pending) }, 400)
      }
    }
  },

  bind() {
    // 事件委托绑到 #app：快捷问题 chips 在上面那张卡，发送/应用按钮在 aiChatCard —— 两处都要响
    const app = document.getElementById('app')
    if (!app) return
    app.addEventListener('click', e => {
      const chip = e.target.closest('[data-q]')
      if (chip) { this.send(chip.getAttribute('data-q')); return }
      if (e.target.id === 'aiSend') this.send()
      if (e.target.id === 'aiNew') {
        this.msgs = []
        this._err = ''
        try { localStorage.removeItem('lbgym_aichat') } catch (er) { /* 无痕模式 */ }
        this.paint()
        const log = document.getElementById('aiLog')
        if (log) log.innerHTML = '<div class="muted txs">新对话。想聊什么？</div>'
        return
      }
      if (e.target.closest('[data-ai-retry]')) {
        this._err = ''
        const t = this._lastFailed
        this._lastFailed = ''
        this.send(t)
        return
      }
      if (e.target.closest('[data-apply]')) this.apply(e.target.closest('[data-apply]').getAttribute('data-apply'))
    })
    const inp = document.getElementById('aiIn')
    if (inp) {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') this.send() })
      // 手机上点输入框自动聚焦到底部（软键盘弹出不挡输入框）
      inp.focus && inp.focus()
    }
  },

  /** 对话存本机（最近 20 条）—— 刷新不丢 */
  saveLocal() {
    try { localStorage.setItem('lbgym_aichat', JSON.stringify(this.msgs.slice(-20))) } catch (e) { /* 无痕模式 */ }
  },

  async send(preset) {
    if (this.busy) return
    const inp = document.getElementById('aiIn')
    const text = String(preset || (inp && inp.value) || '').trim()
    if (!text) return
    if (!Store.state.user || !Store.state.token) {
      // 2026-10-18 线上复查：问题先存本机，登录回来自动接着问（不丢上下文）
      try { localStorage.setItem('lbgym_ai_pending', text) } catch (e) {}
      UI.toast('先登录再问 AI —— 已记下你的问题')
      Router.go('login')
      return
    }
    if (inp) inp.value = ''
    this._err = ''
    this.msgs.push({ role: 'user', content: text })
    this.paint()
    this.busy = true
    const sendBtn = document.getElementById('aiSend')
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '想一下…' }
    try {
      // ⚠️ token 必须显式带 —— Api.call 不会自动注入，漏了云函数必报 AUTH_EXPIRED
      const r = await Api.ai('aiChat', { token: Store.state.token, messages: this.msgs })
      this.quota = r.quota || null
      this.msgs.push({ role: 'assistant', content: r.text || '（空回复）' })
    } catch (err) {
      const code = (err && err.code) || 'SERVER'
      const map = {
        AI_NOT_CONFIGURED: 'AI 还没配好钥匙，稍后再来',
        AI_QUOTA: '今天的次数用完了，明天再来（会员每天 20 次）',
        AI_RATE: '问的人太多挤到限流了——点下面的「重试」再来一次',
        AI_TIMEOUT: 'AI 想太久了——点「重试」再来一次',
        AI_NETWORK: '网络不给力——点「重试」再来一次',
        AI_UPSTREAM: 'AI 服务抽风了——点「重试」再来一次',
        AUTH_EXPIRED: '登录过期了，重新登录一下'
      }
      this.msgs.pop()   // 把刚才那条用户消息收回来，不用重新打字
      // 2026-10-16 导师升级：失败不再只弹一下 toast —— 对话流里留一条可点的重试
      this._err = map[code] || Api.toast(err)
      this._lastFailed = text
      if (inp) inp.value = text
    }
    this.busy = false
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '发送' }
    this.saveLocal()
    this.paint()
  },

  paint() {
    const log = document.getElementById('aiLog')
    if (!log) return
    log.innerHTML = (this._err
      ? '<div class="muted txs" style="padding:8px 10px;border:1px dashed var(--line);border-radius:var(--r-sm);margin-top:10px">' +
        Fmt.esc(this._err) + '<button class="chip" style="margin-left:8px;padding:2px 10px;font-size:11px" data-ai-retry>重试</button></div>'
      : '') +
      this.msgs.map(m =>
      '<div style="margin-top:10px">' +
        '<div class="muted txs">' + (m.role === 'user' ? '你' : 'AI 顾问') + '</div>' +
        '<div style="margin-top:2px;white-space:pre-wrap;font-size:14px;line-height:1.6">' +
          Fmt.esc(this.stripApply(m.content)) + '</div>' +
        (m.role === 'assistant' ? this.applyBtn(m.content) : '') +
      '</div>').join('') || '<div class="muted txs">还没开始聊。</div>'
    const q = this.quota
    const qEl = document.getElementById('aiQuota')
    if (qEl && q) qEl.textContent = '今天已用 ' + q.used + '/' + q.cap + ' 次' + (q.member ? '（会员）' : '')
    log.scrollTop = log.scrollHeight
  },

  /** 抓 [APPLY:key] 标记 → 一键应用按钮（key 与调整顾问的 SITUATIONS 对齐） */
  stripApply(t) { return String(t).replace(/\s*\[APPLY:\w+\]\s*$/, '') },
  applyBtn(t) {
    const m = /\[APPLY:(\w+)\]\s*$/.exec(String(t))
    if (!m) return ''
    const C = ENGINE.coach
    const sit = C.SITUATIONS.filter(s => s.key === m[1])[0]
    if (!sit) return ''
    return '<div style="margin-top:8px"><button class="btn" data-apply="' + m[1] + '">⚙ 按这个调我的计划（' +
      Fmt.esc(sit.name) + '）</button></div>'
  },

  /** AI 建议的一键应用：直接复用调整顾问的 compute（拿标准 apply 包），落库逻辑同 coach.js */
  async apply(key) {
    const r = PageCoach.compute(key)
    if (!r || !r.ok || !r.apply) { UI.toast('这个调整要手动来，看上面建议'); return }
    const a = r.apply
    try {
      if (a.type === 'macro') {
        u.dietState = ENGINE.macro.apply(a.payload.rev, u.dietState)
        Store.saveCloud({ dietState: u.dietState })
      } else if (a.type === 'hunger') {
        u.dietState = Object.assign({}, u.dietState, a.payload.next, { lastType: '很饿' })
        Store.saveCloud({ dietState: u.dietState })
      } else if (a.type === 'state') {
        u.profile = Object.assign({}, u.profile, { todayState: { date: Fmt.todayStr(), key: a.payload.key } })
        Store.saveCloud({ profile: u.profile })
      } else if (a.type === 'plan') {
        u.plan = a.payload.plan
        Store.saveCloud({ plan: u.plan })
      } else { UI.toast('这条还不支持自动应用'); return }
      UI.toast('已应用 —— 计划已经改了')
    } catch (e) { UI.toast('应用失败：' + ((e && e.message) || e)) }
  }
}
