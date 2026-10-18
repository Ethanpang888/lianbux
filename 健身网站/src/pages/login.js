/* src/pages/login.js —— 登录 / 注册 / 找回（邮箱验证码，无密码）
 *
 * 三步：填邮箱 → 收验证码 → 登录。首次登录自动建号并分配玩家编号；
 * 编号只在注册成功那一刻显示一次恢复码，之后凭「编号 + 恢复码」找回账号。
 */
const PageLogin = {
  step: 'email',        // email | code | done
  email: '',
  busy: false,
  countdown: 0,
  _timer: null,
  result: null,         // 注册成功后的返回（含恢复码）

  render() {
    if (this.step === 'done') return this.renderDone()
    const isCode = this.step === 'code'

    document.getElementById('app').innerHTML =
      Router.bar(isCode ? '输入验证码' : '登录 / 注册', '邮箱验证码 · 无需密码') +

      '<div class="card">' +
        (isCode
          ? '<h2>验证码已发送</h2>' +
            '<p class="muted txs">发到 <b>' + Fmt.esc(this.email) + '</b>，10 分钟内有效。' +
            '没收到就看一眼垃圾邮件；也能点下面的「重新发送」。</p>' +
            '<input id="codeIn" type="tel" inputmode="numeric" maxlength="6" placeholder="6 位数字验证码" ' +
              'style="width:100%;margin-top:12px;padding:14px;border:2px solid var(--line);border-radius:var(--r-md);' +
              'font-size:24px;text-align:center;letter-spacing:6px;font-variant-numeric:tabular-nums">' +
            '<div class="form-err" id="err" style="display:none"></div>' +
            '<button class="btn" id="okBtn" style="margin-top:12px">登录</button>' +
            '<button class="btn line" id="resendBtn" style="margin-top:8px">重新发送验证码</button>' +
            '<button class="btn line" style="margin-top:8px" onclick="PageLogin.back()">换个邮箱</button>'
          : '<h2>用邮箱登录</h2>' +
            '<p class="muted txs">第一次登录会<b>自动创建账号</b>，并分配一个永久不变的<b>玩家编号</b>（如 #0001）。' +
            '不需要密码。</p>' +
            '<input id="emailIn" type="email" inputmode="email" autocomplete="email" placeholder="你的邮箱，如 name@qq.com" ' +
              'value="' + Fmt.esc(this.email) + '" ' +
              'style="width:100%;margin-top:12px;padding:13px;border:2px solid var(--line);border-radius:var(--r-md);font-size:15px">' +
            '<div class="form-err" id="err" style="display:none"></div>' +
            '<button class="btn" id="okBtn" style="margin-top:12px">发送验证码</button>') +
        '<button class="btn line" style="margin-top:8px" onclick="Router.go(\'home\')">先用本地模式（不登录）</button>' +
      '</div>' +

      (isCode ? '' :
        '<div class="card"><h2>已有编号？</h2>' +
          '<p class="muted txs">换手机、换微信、清了浏览器数据之后，凭「玩家编号 + 恢复码」就能把账号找回来。</p>' +
          '<button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'recover\')">用编号找回账号</button>' +
        '</div>') +

      '<div class="card"><h2>为什么值得登录</h2>' +
        '<div class="muted txs" style="line-height:2">' +
          '· 数据存云端，<b>换设备不丢</b>（训练记录、等级、连续天数全都在）<br>' +
          '· 拿到<b>永久玩家编号</b>，前 100 位是创始玩家<br>' +
          '· 云端权威结算经验，换设备也能接着涨<br>' +
          '· 以后解锁排行榜、挑战赛、会员内容都靠它' +
        '</div>' +
      '</div>' +

      '<div class="card"><h2>隐私与合规</h2>' +
        '<div class="muted txs" style="line-height:2">' +
          '· 只收集<b>邮箱</b>（登录用）和<b>你自己填的身体数据</b><br>' +
          '· <b>不收集</b>头像、手机号、位置<br>' +
          '· 排行榜只显示昵称与数值，<b>不排体重、不排体型</b><br>' +
          '· 可随时在「我的」里注销，账号与全部记录<b>真删</b><br>' +
          '· 所有健康建议仅供参考，不替代医生或注册营养师' +
        '</div>' +
      '</div>'

    this.bind(isCode)
  },

  bind(isCode) {
    const btn = document.getElementById('okBtn')
    const errEl = document.getElementById('err')
    const showErr = m => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block' } }
    const clearErr = () => { if (errEl) errEl.style.display = 'none' }

    if (!isCode) {
      const inp = document.getElementById('emailIn')
      if (inp && inp.focus) inp.focus()
      const send = async () => {
        if (this.busy) return
        clearErr()
        const email = (inp.value || '').trim()
        if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return showErr('邮箱格式好像不对，检查一下')
        this.busy = true; btn.disabled = true; btn.textContent = '发送中…'
        try {
          const r = await Api.auth('sendCode', { email })
          this.email = email
          this.step = 'code'
          if (r.devCode) UI.toast('未配邮件服务；本次验证码：' + r.devCode, 6000)
          else UI.toast('验证码已发出，去邮箱看看')
          this.render()
          this.startCountdown()
        } catch (e) {
          showErr(Api.toast(e))
        } finally {
          this.busy = false
          const b = document.getElementById('okBtn')
          if (b) { b.disabled = false; b.textContent = '发送验证码' }
        }
      }
      btn.onclick = send
      inp.onkeydown = ev => { if (ev.key === 'Enter') send() }
      return
    }

    // 验证码步骤
    const ci = document.getElementById('codeIn')
    if (ci && ci.focus) ci.focus()
    const submit = async () => {
      if (this.busy) return
      clearErr()
      const code = (ci.value || '').trim()
      if (!/^\d{4,8}$/.test(code)) return showErr('请输入 6 位数字验证码')
      this.busy = true; btn.disabled = true; btn.textContent = '登录中…'
      try {
        const r = await Api.auth('verify', { email: this.email, code })
        await Store.afterLogin(r)
        this.result = r
        this.step = 'done'
        this.render()
        UI.toast(r.isNew ? '欢迎，编号 ' + r.playerNoText + ' 已分配' : '欢迎回来')
      } catch (e) {
        const code2 = e && e.code
        let msg = Api.toast(e)
        if (code2 === 'CODE_WRONG' && e.detail && e.detail.triesLeft >= 0) {
          msg += '（还剩 ' + e.detail.triesLeft + ' 次）'
        }
        showErr(msg)
      } finally {
        this.busy = false
        const b = document.getElementById('okBtn')
        if (b) { b.disabled = false; b.textContent = '登录' }
      }
    }
    btn.onclick = submit
    ci.oninput = () => { if ((ci.value || '').length === 6) submit() }
    ci.onkeydown = ev => { if (ev.key === 'Enter') submit() }

    const rs = document.getElementById('resendBtn')
    rs.onclick = async () => {
      if (this.countdown > 0) { UI.toast('再等 ' + this.countdown + ' 秒'); return }
      try {
        const r = await Api.auth('sendCode', { email: this.email })
        if (r.devCode) UI.toast('验证码：' + r.devCode, 6000); else UI.toast('已重新发送')
        this.startCountdown()
      } catch (e) { showErr(Api.toast(e)) }
    }
    this.startCountdown()
  },

  startCountdown() {
    this.countdown = 60
    clearInterval(this._timer)
    const tick = () => {
      const b = document.getElementById('resendBtn')
      this.countdown -= 1
      if (b) {
        b.textContent = this.countdown > 0 ? '重新发送（' + this.countdown + 's）' : '重新发送验证码'
        b.disabled = this.countdown > 0
      }
      if (this.countdown <= 0) clearInterval(this._timer)
    }
    tick()
    this._timer = setInterval(tick, 1000)
  },

  back() {
    this.step = 'email'
    this.countdown = 0
    clearInterval(this._timer)
    this.render()
  },

  /** 注册成功：把恢复码显著地摆出来（用户只有这一次机会看到） */
  renderDone() {
    const r = this.result || {}
    const u = Store.state.user || {}
    document.getElementById('app').innerHTML =
      Router.bar('欢迎加入', '练不虚 Gym · 健身副本') +
      '<div class="card" style="border:2px solid var(--green)">' +
        '<h2>你是第 ' + (r.playerNo || '?') + ' 位玩家</h2>' +
        '<div style="text-align:center;padding:8px 0 4px">' +
          '<div style="font-family:ui-monospace,Menlo,monospace;font-size:34px;font-weight:700;' +
            'color:var(--green-dark);letter-spacing:2px">' + Fmt.esc(r.playerNoText || '') + '</div>' +
          (r.founding ? '<div class="tag gold" style="margin-top:6px">创始玩家 · 身份永久保留</div>' : '<div class="tag">早期玩家</div>') +
        '</div>' +
        '<div class="muted txs" style="margin-top:6px">你的编号是<b>永久身份</b>，换设备、换微信都能凭它找回账号。' +
        '如果可能，把它记在备忘录里。</div>' +
      '</div>' +

      (r.recoveryCode
        ? '<div class="card" style="border:2px solid var(--warn)">' +
            '<h2>恢复码 <span class="tag warn">只显示这一次</span></h2>' +
            '<div style="text-align:center;padding:10px 0;font-family:ui-monospace,Menlo,monospace;' +
              'font-size:22px;font-weight:700;letter-spacing:1px">' + Fmt.esc(r.recoveryCode) + '</div>' +
            '<div class="muted txs">换手机或浏览器数据丢失时，凭「玩家编号 + 这个恢复码」找回档案。' +
            '我们只存它的哈希，<b>丢了就只能重新开始</b>——现在截个图或抄下来。</div>' +
            '<button class="btn ghost" style="margin-top:10px" id="copyBtn">复制编号和恢复码</button>' +
          '</div>'
        : '<div class="card"><h2>欢迎回来</h2><p class="muted txs">你的档案已经从云端恢复。</p></div>') +

      '<div class="card"><h2>下一步</h2>' +
        '<div class="muted txs" style="line-height:2">' +
          '· 填一下身体数据（身高体重目标），我们会算出你的训练计划和每日宏量<br>' +
          '· 每天早起称一次体重，攒够 7 天系统会自动帮你调饮食<br>' +
          '· 练完记一次，经验、连续天数、徽章都会涨' +
        '</div>' +
      '</div>' +

      '<button class="btn" id="goBtn" style="margin-bottom:20px">进入我的存档</button>'

    const cp = document.getElementById('copyBtn')
    if (cp) cp.onclick = () => {
      const txt = '练不虚 Gym｜玩家编号 ' + (r.playerNoText || '') + '｜恢复码 ' + (r.recoveryCode || '')
      try {
        navigator.clipboard.writeText(txt)
        UI.toast('已复制，去粘贴到备忘录')
      } catch (e) { UI.toast('复制失败，请手动抄写') }
    }
    const go = document.getElementById('goBtn')
    if (go) go.onclick = () => Router.go('home')
  },

  // ───────── 找回账号 ─────────

  renderRecover() {
    document.getElementById('app').innerHTML =
      Router.bar('找回账号', '玩家编号 + 恢复码') +
      '<div class="card">' +
        '<h2>输入编号与恢复码</h2>' +
        '<input id="noIn" type="tel" inputmode="numeric" placeholder="玩家编号，如 0001" ' +
          'style="width:100%;margin-top:10px;padding:13px;border:2px solid var(--line);border-radius:var(--r-md);' +
          'font-size:17px;text-align:center;font-family:ui-monospace,Menlo,monospace">' +
        '<input id="rcIn" type="text" placeholder="恢复码，如 K7M4-9QX2-P3WD" autocomplete="off" ' +
          'style="width:100%;margin-top:10px;padding:13px;border:2px solid var(--line);border-radius:var(--r-md);' +
          'font-size:15px;text-align:center;font-family:ui-monospace,Menlo,monospace;text-transform:uppercase">' +
        '<div class="form-err" id="err" style="display:none"></div>' +
        '<button class="btn" id="okBtn" style="margin-top:12px">找回我的账号</button>' +
        '<button class="btn line" style="margin-top:8px" onclick="Router.go(\'login\')">返回登录</button>' +
        '<div class="muted txs" style="margin-top:10px">编号和恢复码都不记得了？在「我的」里看当前编号；' +
        '恢复码只在注册时显示过一次，丢了的话就只能重新开始了。</div>' +
      '</div>'

    const btn = document.getElementById('okBtn')
    const errEl = document.getElementById('err')
    btn.onclick = async () => {
      const no = (document.getElementById('noIn').value || '').trim()
      const rc = (document.getElementById('rcIn').value || '').trim()
      if (!no || !rc) { errEl.textContent = '编号和恢复码都要填'; errEl.style.display = 'block'; return }
      btn.disabled = true; btn.textContent = '验证中…'
      try {
        const r = await Api.auth('recover', { playerNo: no, recoveryCode: rc })
        await Store.afterLogin(r)
        UI.toast('欢迎回来，' + r.playerNoText)
        Router.go('home')
      } catch (e) {
        errEl.textContent = Api.toast(e)
        errEl.style.display = 'block'
      } finally {
        btn.disabled = false; btn.textContent = '找回我的账号'
      }
    }
  }
}
