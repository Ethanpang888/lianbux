/* src/pages/me.js —— 我的：档案 + 引擎自检（M0 用来验证网页端引擎与小程序一致）+ 登录入口 */
const PageMe = {
  render() {
    const u = Store.state.user
    const p = u.profile || {}
    const lv = ENGINE.gamify.levelOf((u.gamify || {}).exp || 0)
    const md5 = (ENGINE.__md5 || {})
    // calc.bmi 返回数字、calc.bmiCat 返回 {txt,color} —— 两个要配套用（曾在饮食页踩过同一个坑）
    // ⚠️ 必须先用「有没有身高体重」挡一下：空档案时 bmi(NaN,NaN) 返回 NaN，
    //    而 NaN 是 truthy，会照样显示成「BMI NaN（肥胖）」。
    const hasBody = Number(p.weight) > 0 && Number(p.height) > 0
    const bmiV = hasBody ? ENGINE.calc.bmi(p.weight, p.height) : 0
    const bd = hasBody ? ENGINE.calc.bmiCat(bmiV) : null
    const stage = PageHome.charStageName(lv.level)

    document.getElementById('app').innerHTML =
      Router.bar('我的', Store.state.demo ? '演示模式' : '已登录') +

      '<div class="card">' +
        '<h2>档案 <span class="mini">' + Fmt.esc(p.exp || '') + '</span></h2>' +
        UI.kv([
          { k: '体重 kg', v: p.weight || '—' },
          { k: '身高 cm', v: p.height || '—' },
          { k: '目标', v: (p.goal || '—').slice(0, 4) },
          { k: '活动', v: (ENGINE.method.activityOf(p.activity) || {}).name || '—' }
        ]) +
        '<button class="btn ghost" style="margin-top:10px" onclick="PageOnboard.reset()">' +
          (Store.hasProfile() ? '修改档案（体重变了记得改）' : '去建档') + '</button>' +
        (bd ? '<div class="muted txs" style="margin-top:6px">BMI ' + bmiV + '（' + Fmt.esc(bd.txt) +
          '）· 每周 ' + (p.days || '—') + ' 练 · ' + (p.home ? '居家' : '健身房') + '</div>' : '') +
      '</div>' +

      '<div class="card"><h2>修炼工具</h2><div class="tool-links">' +
        [['plan', '我的完整计划', '查看周期与调整安排'], ['exlib', '动作图鉴', '查动作与训练要领'],
         ['ai', '随身导师', '训练与饮食答疑'], ['secret', '藏经阁', '目标秘籍与训练方法'],
         ['plus', '进阶工具包', '查看已有工具与权益'], ['plan12', '12 周定制方案', '查看方案与交付说明']].map(x =>
           '<button class="tool-link" onclick="Router.go(\'' + x[0] + '\')"><span><b>' + x[1] + '</b><small>' + x[2] + '</small></span><span>›</span></button>').join('') +
        '<button class="tool-link" onclick="PagePoster.showToday()"><span><b>📸 今日战报</b><small>本次举铁多少吨 · 昭告天下</small></span><span>›</span></button>' +
        '<button class="tool-link" onclick="PagePoster.showLife()"><span><b>🏆 修行生涯卡</b><small>累计举起 · 连续修炼 · 入坑天数</small></span><span>›</span></button>' +
        '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">' +
          '<button class="btn ghost" id="exportData">导出我的数据（JSON）</button>' +
          '<div class="muted txs" style="margin-top:6px">档案 + 计划 + 全部打卡打包下载 —— 你的数据永远归你，随时带走。</div>' +
        '</div>' +
      '</div></div>' +

      // 排行榜入口 + 城市设置（同城榜的前提）
      '<div class="card">' +
        '<h2>排行榜 <span class="mini">同城 / 全国</span></h2>' +
        '<div class="pn-row"><span class="k">我的城市</span>' +
          '<span class="v"><b>' + Fmt.esc(p.city || '未设置') + '</b>' +
          (p.city ? '' : '<span class="muted txs"> — 设了才能看同城榜</span>') + '</span></div>' +
        '<div class="chips" id="meCityChips" style="margin-top:8px">' +
          ENGINE.gamify.CITIES.map(c => '<button class="chip' + (p.city === c ? ' on' : '') +
            '" data-city="' + Fmt.esc(c) + '">' + Fmt.esc(c) + '</button>').join('') +
        '</div>' +
        '<button class="btn ghost" style="margin-top:8px" onclick="Router.go(\'rank\')">看排行榜</button>' +
      '</div>' +

      // 完整版（付费层）：自己用、给用户开通，都在这里进
      this.proCard(u) +
      this.inviteCard(u) +

      // 形象墙：5 个成长阶段，当前阶段高亮、未解锁的变灰
      '<div class="card">' +
        '<h2>我的形象 <span class="mini">当前『' + Fmt.esc(stage) + '』</span></h2>' +
        '<div class="stage-row">' +
          PageHome.CHAR_STAGES.map(s => {
            const on = lv.level >= s.at
            const cur = PageHome.charStageOf(lv.level).at === s.at
            return '<div class="stage-tile ' + (on ? 'on' : 'locked') + (cur ? ' cur' : '') + '">' +
              '<img src="assets/characters/' + s.file + '" alt="' + Fmt.esc(s.name) + '" loading="lazy" ' +
                'onerror="this.style.visibility=\'hidden\'">' +
              '<b>Lv' + s.at + '</b><span>' + Fmt.esc(s.name) + '</span></div>'
          }).join('') +
        '</div>' +
        '<div class="muted txs" style="margin-top:8px">' +
          '形象随等级变化：练到 Lv' + PageHome.nextStageOf(lv.level).at + ' 会变成『' +
          Fmt.esc(PageHome.nextStageOf(lv.level).name) + '』。' +
          '以后还能上传自己的照片，生成专属的 3D 手办形象。</div>' +
      '</div>' +

      '<div class="card">' +
        '<h2>等级与经验</h2>' +
        UI.li('境界', ENGINE.gamify.realmOf(lv.level).name + '（' +
          Fmt.esc(ENGINE.gamify.realmOf(lv.level).note) + '）', '') +
        UI.li('等级', 'Lv ' + lv.level + ' · ' + lv.title, '') +
        UI.li('总经验', Fmt.num(lv.exp) + ' EXP', '') +
        UI.li('距离下一级', Fmt.num(lv.toNext) + ' EXP', '') +
        UI.li('徽章', ((u.gamify || {}).badges || []).length + ' / ' + ENGINE.gamify.BADGES.length, '') +
        '<button class="btn line" style="margin-top:10px" onclick="Router.go(\'badges\')">查看徽章墙</button>' +
      '</div>' +

      '<div class="card">' +
        '<h2>外观 <span class="mini">' + (Store.theme() === 'dark' ? '深空' : '明亮') + '</span></h2>' +
        '<div class="wrap-row">' +
          '<button class="chip ' + (Store.theme() !== 'dark' ? 'on' : '') + '" onclick="PageMe.setTheme(\'light\')">明亮</button>' +
          '<button class="chip ' + (Store.theme() === 'dark' ? 'on' : '') + '" onclick="PageMe.setTheme(\'dark\')">深空（深色）</button>' +
        '</div>' +
        '<div class="muted txs" style="margin-top:8px">选择你看着舒服的颜色。</div>' +
      '</div>' +

      '<div class="card">' +
        '<h2>账号 <span class="mini">' + (Store.state.demo ? '未登录' : '已登录') + '</span></h2>' +
        (Store.state.demo
          ? '<p class="muted txs">登录后数据存云端、换设备不丢，并拿到永久玩家编号。' +
            '（不登录也能用，只是记录只在本机）</p>' +
            '<button class="btn" onclick="Router.go(\'login\')">邮箱验证码登录 / 注册</button>' +
            '<button class="btn ghost" style="margin-top:8px" onclick="Router.go(\'recover\')">用编号找回账号</button>'
          : this.accountBlock(u)) +
      '</div>' +

      '<div class="card">' +
        '<details><summary>技术信息与引擎状态</summary>' +
        '<div class="muted txs" style="line-height:2">' +
          '计算引擎：' + (ENGINE.calc && ENGINE.calc.bmr ? '✅ 已加载' : '❌') +
          '　计划引擎：' + (ENGINE.kb && ENGINE.kb.generatePlan ? '✅' : '❌') +
          '　饮食引擎：' + (ENGINE.diet && ENGINE.diet.buildDay ? '✅' : '❌') +
          '　游戏化：' + (ENGINE.gamify ? '✅ ' + ENGINE.gamify.BADGES.length + ' 徽章 / ' + ENGINE.gamify.MAX_LEVEL + ' 级' : '❌') + '<br>' +
          'BMR（男/93kg/183cm/30岁）= <b>' + ENGINE.calc.bmr('男', 93, 183, 30) + '</b>（应与小程序相同）<br>' +
          '动作库：<b>' + (ENGINE.kb.EX || []).length + '</b> 条　食物库：<b>' + (ENGINE.kb.FOODS || []).length + '</b> 种' +
        '</div>' +
        '<div class="muted txs" style="margin-top:8px">构建指纹：' +
          Object.keys(md5).map(k => k.replace('.js', '') + ':' + md5[k]).join(' · ') + '</div></details>' +
      '</div>'

    this.bindCity()
    const exBtn = document.getElementById('exportData')
    if (exBtn) exBtn.onclick = () => Store.exportAll()
  },

  /** 已登录时的账号区块：邮箱 / 玩家编号 / 恢复码重置 / 退出 / 注销 */
  /** 完整版入口 —— 开通状态与到期时间都从**账号的 member** 上读（服务端下发，客户端改不了） */
  proCard(u) {
    const m = ENGINE.pro.memberOf(u)
    return '<div class="card">' +
      '<h2>完整版 ' + (m.valid
        ? '<span class="tag">' + Fmt.esc(m.name) + '</span>'
        : '<span class="tag gold">未开通</span>') + '</h2>' +
      (m.valid
        ? '<div class="muted txs">每个动作的具体重量、四周周期表、状态微调、完整饮食（三套口径 / 外卖 / 补剂）。</div>' +
          '<div class="muted txs">到期 ' + Fmt.esc(String(m.expiresAt).slice(0, 10)) + ' · 还剩 ' + m.days +
            ' 天（挂在账号上，换设备也在）</div>' +
          '<button class="btn" style="margin-top:10px" onclick="Router.go(\'secret\')">看秘籍（减脂 / 增肌 / 同步 / 卧推）</button>' +
          '<button class="btn ghost" style="margin-top:8px" onclick="Router.go(\'pro\')">打开完整版计划</button>'
        : '<div class="muted txs">免费版给动作骨架（练什么、几组几次）；完整版给<b>每个动作练多重</b>、' +
          '四周周期表、状态微调规则和完整饮食计划，还有按目标挑的<b>秘籍</b>。</div>' +
          '<button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'pro\')">看看里面有什么</button>' +
          '<button class="btn ghost" style="margin-top:8px" onclick="Router.go(\'secret\')">看秘籍</button>') +
    '</div>'
  },

  /** 收徒（裂变）：我的邀请码 + 弟子数 + 绑定师傅。奖励走「注册填码」到账（不挂分享按钮，合规） */
  inviteCard(u) {
    return '<div class="card">' +
      '<h2>广收门徒 <span class="mini">同门师兄弟 · 一起炼</span></h2>' +
      '<div class="muted txs">把你的邀请码发给想练的人——他注册时填码，<b>你和他各得 3 天完整版</b>。' +
      '谁先玩谁就是师傅，你的门下弟子数会记在账上。</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;align-items:center">' +
        '<b style="font-family:ui-monospace,Menlo,monospace;font-size:20px;letter-spacing:2px" id="inviteCodeBox">' +
          Fmt.esc(u.inviteCode || '点右侧获取') + '</b>' +
        '<button class="chip" onclick="PageMe.getInviteCode()">' + (u.inviteCode ? '复制邀请码' : '获取邀请码') + '</button>' +
      '</div>' +
      '<div class="muted txs" style="margin-top:8px">同门之间不比吃喝，只比谁练得勤。徒弟注册填码那一刻，奖励自动到账。</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">' +
        '<button class="chip" onclick="PageMe.myInvites()">我的弟子</button>' +
        '<button class="chip" onclick="PageMe.bindInvite()">绑定师傅的邀请码</button>' +
      '</div>' +
      (u.inviter ? '<div class="muted txs" style="margin-top:6px">已拜师 · 师傅编号 ' + Fmt.esc(u.inviter.code || '') + '（一个账号只认一个师傅）</div>' : '') +
    '</div>'
  },

  async getInviteCode() {
    try {
      const r = await Api.api('inviteCode', { token: Store.state.token })
      const code = (r && r.code) || ''
      if (!code) { UI.toast('获取失败，稍后再试'); return }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(code); UI.toast('邀请码已复制：' + code) } catch (e) { UI.toast('你的邀请码：' + code) }
      } else UI.toast('你的邀请码：' + code)
      const u = Store.state.user
      if (u) { u.inviteCode = code; this.render() }
    } catch (e) { UI.toast('获取失败，稍后再试') }
  },

  async myInvites() {
    try {
      const r = await Api.api('myInvites', { token: Store.state.token })
      const n = (r && r.count) || 0
      UI.modal({ title: '我的门下弟子', body: n ? '<p class="muted txs">已有 <b>' + n + '</b> 位同门拜入你门下。徒弟练得越勤，你这位师傅越有牌面。</p>' : '<p class="muted txs">还没有弟子。把邀请码发给想练的朋友——他注册时填码，你俩各得 3 天完整版。</p>', okText: '知道了' })
    } catch (e) { UI.toast('查询失败') }
  },

  bindInvite() {
    const code = prompt('输入师傅的邀请码（LB 开头 8 位）：')
    if (!code || !code.trim()) return
    Api.api('bindInvite', { token: Store.state.token, code: code.trim() }).then(r => {
      if (r && r.bound) {
        UI.toast('拜师成功！你和师傅各得 3 天完整版')
        const u = Store.state.user
        if (u) { u.inviter = { code: code.trim().toUpperCase(), at: new Date().toISOString() } }
        this.render()
      }
    }).catch(e => {
      const c = (e && e.code) || ''
      UI.toast(c === 'CODE_INVALID' ? '邀请码不对，再核对一下' : c === 'ALREADY_BOUND' ? '你已经绑过师傅了' : c === 'SELF_INVITE' ? '不能填自己的码' : '绑定失败')
    })
  },

  accountBlock(u) {
    const no = u.playerNo || 0
    const pt = ENGINE.gamify.playerTier(no)
    const sync = Store.state.syncing ? '同步中…'
      : (Store.state.lastError ? '上次同步失败：' + Fmt.esc(Store.state.lastError)
        : (Store.state.lastSyncAt ? '已同步 · ' + new Date(Store.state.lastSyncAt).toLocaleTimeString('zh-CN') : '已连接'))
    return '<div class="pn-row"><span class="k">邮箱</span><span class="v">' + Fmt.esc(u.email || '') + '</span></div>' +
      '<div class="pn-row"><span class="k">玩家编号</span>' +
        '<span class="v"><b style="font-family:ui-monospace,Menlo,monospace">' +
        Fmt.esc(Store.state.playerNoText || ENGINE.gamify.playerNoStr(no)) + '</b> ' +
        '<span class="tag ' + (pt.gold ? 'gold' : '') + '">' + Fmt.esc(pt.name) + '</span></span></div>' +
      '<div class="pn-row"><span class="k">云端状态</span><span class="v muted">' + sync + '</span></div>' +
      '<div class="wrap-row" style="margin-top:10px">' +
        '<button class="chip" onclick="PageMe.refresh()">立即同步</button>' +
        '<button class="chip" onclick="PageMe.resetRecovery()">换一个恢复码</button>' +
        '<button class="chip" onclick="PageMe.bindMp()">📱 绑定小程序</button>' +
      '</div>' +
      '<div class="muted txs" style="margin-top:6px">绑定后小程序记的打卡自动同步到这里（记录 / 力量估算 / AI 总结都能用），排行榜也是同一个榜。</div>' +
      '<button class="btn line" style="margin-top:10px" onclick="PageMe.logout()">退出登录</button>' +
      '<button class="btn line" style="margin-top:8px;color:var(--danger);border-color:var(--danger)" ' +
        'onclick="PageMe.deleteAccount()">注销账号（永久删除）</button>'
  },

  async refresh() {
    UI.toast('正在同步…')
    const ok = await Store.pullState()
    UI.toast(ok ? '同步完成' : (Store.state.lastError || '同步失败'))
    this.render()
  },

  /** 绑定小程序：生成 6 位码（5 分钟有效），小程序端输码完成绑定，两端打卡双向互通 */
  async bindMp() {
    try {
      const r = await Api.api('bindStart', { token: Store.state.token })
      UI.modal({
        title: '绑定小程序（5 分钟内有效）',
        body: '<div style="text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:30px;' +
          'font-weight:800;letter-spacing:8px;padding:14px 0;color:var(--green-dark)">' + Fmt.esc(r.code) + '</div>' +
          '<div class="muted txs" style="line-height:1.9">在微信小程序「啊清练不虚」里：' +
          '我的 → 🔗 绑定网站账号 → 输入上面的 6 位码。<br>绑定瞬间会把两边的打卡记录互相补齐，之后每次打卡自动同步。</div>',
        okText: '知道了', cancelText: false
      })
    } catch (e) { Api.toast(e) }
  },

  async resetRecovery() {    UI.confirm('换一个恢复码？旧的会立刻作废。', async () => {
      try {
        const r = await Api.auth('resetRecovery', { token: Store.state.token })
        UI.modal({
          title: '新的恢复码（只显示这一次）',
          body: '<div style="text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:22px;' +
            'font-weight:700;padding:12px 0">' + Fmt.esc(r.recoveryCode) + '</div>' +
            '<div class="muted txs">请立刻抄到备忘录。旧的恢复码已失效。</div>',
          okText: '我记下了', cancelText: false
        })
      } catch (e) { Api.toast(e) }
      return true
    })
  },

  async deleteAccount() {
    UI.confirm('注销会永久删除账号和全部训练记录，且无法恢复。确定吗？', async () => {
      try {
        await Api.api('deleteAccount', { token: Store.state.token, confirm: 'DELETE' })
        Store.logout()
        UI.toast('账号已注销，数据已删除')
        Router.go('home')
      } catch (e) { Api.toast(e) }
      return true
    })
  },

  /** 设置城市（同城榜的前提） */
  bindCity() {
    document.querySelectorAll('#meCityChips button[data-city]').forEach(b => {
      b.onclick = () => {
        const u = Store.state.user
        u.profile = Object.assign({}, u.profile, { city: b.dataset.city })
        Store.saveCloud({ profile: u.profile })
        UI.toast('城市已设为 ' + b.dataset.city)
        this.render()
      }
    })
  },

  setTheme(t) {
    Store.setTheme(t)
    UI.toast(t === 'dark' ? '已切到深空主题' : '已切到明亮主题')
    this.render()
  },

  logout() {
    Store.logout()
    UI.toast('已退出登录（本机数据已清，云端档案保留）')
    Router.go('home')
  }
}
