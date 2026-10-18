/* src/pages/poster.js —— 战报海报（2026-10-17 获客 P0）
 *
 * 两种海报：
 *   ① 今日战报（每次训练）：本次举铁吨位 + 今日功课 + 随机励志文案 —— 练完自愿分享
 *   ② 修行生涯卡（累计）：累计举起 + 连续修炼 + 入坑天数 + 境界 —— 里程碑单独一张
 * 合规红线：分享按钮不挂任何奖励文案（不诱导分享）；裂变走「收徒邀请码」（注册填码双方到账）。
 * 口号（用户 2026-10-17 拍板）：
 *   核心口号（海报底部固定）：三月河东，三月河西，莫欺少年凡胎弱！
 *   海报顶部随机文案：见 POOL（用户已逐条审过，禁自加捞词）
 */
const PagePoster = {
  SLOGAN_CORE: '三月河东，三月河西，莫欺少年凡胎弱！',
  SITE_URL: 'https://c289b837374c4dfc8f14d386d2e36a02.app.workbuddy.host/',

  // 海报顶部随机文案（每次生成刷一条，分享不重样）。用户审过的池，别乱加
  POOL: [
    '三个月胖子，三个月帅哥。',
    '你举过的铁，从不说谎。',
    '修行没有奇遇，只有日复一日。',
    '莫问前程几许，只看脚下这一步。',
    '少侠骨骼清奇，再来一组？',
    '山河远阔，先练眼前这一组。',
    '凡胎又如何？练起来就是主角。',
    '今日功课已了，明日再进一分。',
    '不必赢过任何人，赢过昨天的自己。',
    '把力气花在自己身上，永远不算浪费。'
  ],

  // 玄衡批语池（海报中部红框，随机一条）
  COMMENTS: [
    '功课扎实。修行之道贵在日拱一卒——今日这一拱，老夫记下了。',
    '哼，汗流得不少，组歇没偷懒吧？继续。',
    '气血通畅，筋骨齐鸣。此等状态，明日可再进一分。',
    '练完就吃，吃完就睡。肌肉是在神魂归位时长出来的，别再刷手机了。',
    '凡胎淬体，最忌三日打鱼。你能来，已胜过大多数人。',
    '今日之功已成，昭告天下又何妨——但记住，炫耀一分，练十分。'
  ],

  /** 今日打卡（网站 checkins 在 Store.state，date=YYYY-MM-DD） */
  todayCheckin() {
    const t = Fmt.todayStr()
    return (Store.state.checkins || []).find(c => c.date === t && c.trained) || null
  },

  /** 本次训练容量（kg×reps，只算完成组） */
  volumeOf(ck) {
    let v = 0
    ;(ck.exercises || []).forEach(e => (e.log || []).forEach(s => {
      if (s.done) v += (Number(s.weight) || 0) * (Number(s.reps) || 0)
    }))
    return v
  },

  /** 海报数据。mode: 'today'（每次训练） | 'life'（累计生涯） */
  data(mode) {
    const u = Store.state.user || {}
    const g = u.gamify || {}
    const P = u.player || {}
    const lv = ENGINE.gamify.levelOf(g.exp || 0)
    const realm = ENGINE.gamify.realmOf(lv.level)
    const ck = this.todayCheckin()
    let volumeAll = 0, first = null
    ;(Store.state.checkins || []).forEach(c => {
      if (!first || (c.date && c.date < first)) first = c.date
      if (!c.trained) return
      volumeAll += this.volumeOf(c)
    })
    const days = first ? Math.max(1, Math.round((Date.now() - new Date(first + 'T00:00:00')) / 86400000) + 1) : 1
    // 今日功课名（计划当前 slot 的部位）
    let focus = ''
    try {
      const plan = u.plan
      if (plan && plan.micro) {
        const idx = Math.max(0, ENGINE.calc.dayIndexFromStart(plan.cycleStart || Fmt.todayStr(), Fmt.todayStr()))
        const dc = ENGINE.kb.dayContent(plan, idx, u.profile, !!plan.home)
        focus = (dc && dc.focus) || ''
      }
    } catch (e) {}
    // 海报数据块只有 196px 宽，课表名过长会溢出 → 截断（用户视角自检发现）
    if (focus.length > 7) focus = focus.slice(0, 7) + '…'
    return {
      mode: mode,
      nick: P.nickname || '修行者',
      level: lv.level, title: lv.title, realm: realm.name,
      stage: PageHome.charStageOf(lv.level).file,
      streak: (g.streak || {}).cur || 0,
      days: days,
      // 本次
      todayTons: ck ? (this.volumeOf(ck) / 1e6).toFixed(2) : '0',
      todaySets: ck ? (ck.exercises || []).reduce((n, e) => n + (e.log || []).filter(s => s.done).length, 0) : 0,
      focus: focus || '今日功课',
      // 累计
      allTons: (volumeAll / 1e6).toFixed(2),
      line: this.POOL[Math.floor(Math.random() * this.POOL.length)],
      comment: this.COMMENTS[Math.floor(Math.random() * this.COMMENTS.length)]
    }
  },

  /** 入口：今日战报（要求今天练过） */
  showToday() {
    if (!this.todayCheckin()) {
      UI.toast('今日还没修炼记录——练完再来昭告天下')
      return
    }
    this.show('today')
  },

  /** 入口：修行生涯卡（累计，随时可晒） */
  showLife() { this.show('life') },

  show(mode) {
    const old = document.getElementById('posterModal'); if (old) old.remove()
    const el = document.createElement('div'); el.id = 'posterModal'
    el.innerHTML = '<div style="position:fixed;inset:0;z-index:2200;background:rgba(0,0,0,.78);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:14px;box-sizing:border-box">' +
      '<canvas id="posterCanvas" width="720" height="1280" style="max-height:70vh;max-width:94vw;border-radius:18px;background:#0e1510;box-shadow:0 10px 40px #000a"></canvas>' +
      '<div style="display:flex;gap:10px">' +
        '<button class="btn" style="width:auto;padding:10px 22px" id="posterSave">保存图片</button>' +
        '<button class="btn ghost" style="width:auto;padding:10px 22px" id="posterClose">关闭</button>' +
      '</div>' +
      '<div class="muted txs">手机长按海报也能保存 / 转发给朋友</div>' +
    '</div>'
    document.body.appendChild(el)
    document.getElementById('posterClose').onclick = () => el.remove()
    document.getElementById('posterSave').onclick = () => this.save()
    const d = this.data(mode)
    this.paint(document.getElementById('posterCanvas'), d).catch(err => console.error('poster paint', err))
  },

  loadImg(src) {
    return new Promise((res, rej) => {
      const im = new Image()
      im.onload = () => res(im); im.onerror = rej
      im.src = src
    })
  },

  async paint(canvas, d) {
    const ctx = canvas.getContext('2d')
    const W = 720, H = 1280
    const SERIF = '"Songti SC","STSong",serif'
    // ── 背景：墨绿深夜 + 顶部金光 ──
    const grd = ctx.createLinearGradient(0, 0, 0, H)
    grd.addColorStop(0, '#141c15'); grd.addColorStop(0.55, '#101713'); grd.addColorStop(1, '#0c1119')
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H)
    const glow = ctx.createRadialGradient(W / 2, 140, 20, W / 2, 140, 430)
    glow.addColorStop(0, 'rgba(213,189,135,0.15)'); glow.addColorStop(1, 'rgba(213,189,135,0)')
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 620)
    // 双线边框（外金内墨）
    ctx.strokeStyle = '#3a3323'; ctx.lineWidth = 2; ctx.strokeRect(16, 16, W - 32, H - 32)
    ctx.strokeStyle = '#d5bd87'; ctx.lineWidth = 1; ctx.strokeRect(24, 24, W - 48, H - 48)

    // ── 顶部：印章 + 随机文案 ──
    ctx.fillStyle = '#a83232'
    this.roundRect(ctx, W - 92, 52, 58, 58, 6); ctx.fill()
    ctx.strokeStyle = '#f5e6c8'; ctx.lineWidth = 1.5; ctx.strokeRect(W - 87, 57, 48, 48)
    ctx.fillStyle = '#f5e6c8'; ctx.font = '500 34px ' + SERIF
    ctx.textAlign = 'center'
    ctx.fillText('练', W - 63, 96)
    // 随机文案（金色衬线）
    ctx.fillStyle = '#d5bd87'
    ctx.font = '500 ' + (d.line.length > 12 ? '40px' : '46px') + ' ' + SERIF
    ctx.fillText(d.line, W / 2, 118)
    ctx.fillStyle = '#a89668'; ctx.font = '400 22px ' + SERIF
    ctx.fillText('练 不 虚 · 修 行 战 报', W / 2, 158)

    // ── 角色立绘 ──
    let im = null
    try { im = await this.loadImg('assets/characters/' + d.stage) } catch (e) { im = null }
    if (im) {
      const boxW = 420, boxH = 430, boxY = 185
      const r = Math.min(boxW / im.width, boxH / im.height)
      const iw = im.width * r, ih = im.height * r
      ctx.drawImage(im, (W - iw) / 2, boxY + (boxH - ih) / 2, iw, ih)
    } else {
      ctx.fillStyle = '#233c2c'
      ctx.beginPath(); ctx.arc(W / 2, 400, 140, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#90c8a4'; ctx.font = '500 84px ' + SERIF
      ctx.fillText('练', W / 2, 430)
    }

    // ── 昵称 + 境界 ──
    ctx.fillStyle = '#e8dcc0'; ctx.font = '500 42px ' + SERIF
    ctx.fillText(d.nick, W / 2, 690)
    ctx.fillStyle = '#c9b98a'; ctx.font = '400 28px ' + SERIF
    ctx.fillText('Lv.' + d.level + ' · ' + d.title + ' · ' + d.realm, W / 2, 732)

    // ── 数据块 ──
    const stats = d.mode === 'today'
      ? [{ v: d.todayTons + ' 吨', l: '本次举铁' }, { v: d.todaySets + ' 组', l: '今日完成' }, { v: d.focus, l: '今日功课', small: true }]
      : [{ v: d.allTons + ' 吨', l: '累计举起' }, { v: d.streak + ' 天', l: '连续修炼' }, { v: d.days + ' 天', l: '入坑修行' }]
    const bw = 196, gap = 22, total = bw * 3 + gap * 2, x0 = (W - total) / 2, by = 780
    stats.forEach((s, i) => {
      const x = x0 + i * (bw + gap)
      ctx.fillStyle = '#1a2016'
      this.roundRect(ctx, x, by, bw, 150, 18); ctx.fill()
      ctx.strokeStyle = '#3a3323'; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = '#d5bd87'
      ctx.font = s.small ? '500 24px ' + SERIF : '500 44px ' + SERIF
      ctx.fillText(s.v, x + bw / 2, by + (s.small ? 78 : 76))
      ctx.fillStyle = '#a89668'; ctx.font = '400 22px ' + SERIF
      ctx.fillText(s.l, x + bw / 2, by + 118)
    })

    // ── 玄衡批语（朱砂框） ──
    const cy = 990
    ctx.fillStyle = 'rgba(168,50,50,0.10)'
    this.roundRect(ctx, 60, cy, W - 120, 120, 10); ctx.fill()
    ctx.strokeStyle = '#a83232'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = '#e8b4b4'; ctx.font = '400 22px ' + SERIF
    ctx.textAlign = 'left'
    this.wrapText(ctx, '「' + d.comment + '」', 82, cy + 42, W - 164, 32)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#a83232'; ctx.font = '400 20px ' + SERIF
    ctx.fillText('—— 玄衡 批', W - 82, cy + 102)

    // ── 底部：品牌 + 核心口号 + 链接 + QR ──
    const qy = H - 250
    let qrImg = null
    try {
      if (typeof qrcode === 'function') {
        const qr = qrcode(0, 'M')
        qr.addData(this.SITE_URL)
        qr.make()
        qrImg = await this.loadImg(qr.createDataURL(6, 8))
      }
    } catch (e) { qrImg = null }
    if (qrImg) {
      ctx.fillStyle = '#ffffff'
      this.roundRect(ctx, W - 224, qy - 20, 186, 186, 16); ctx.fill()
      ctx.drawImage(qrImg, W - 214, qy - 10, 166, 166)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#a89668'; ctx.font = '400 20px ' + SERIF
      ctx.fillText('扫码测测你的肉身修为', W - 131, qy + 196)
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = '#d5bd87'; ctx.font = '500 38px ' + SERIF
    ctx.fillText('练不虚', 46, qy + 44)
    ctx.fillStyle = '#a83232'; ctx.font = '400 24px ' + SERIF
    ctx.fillText(this.SLOGAN_CORE, 46, qy + 90)
    ctx.fillStyle = '#5f6b60'; ctx.font = '400 20px ' + SERIF
    ctx.fillText(this.SITE_URL.replace('https://', '').slice(0, 44), 46, qy + 126)
    ctx.textAlign = 'center'
  },

  wrapText(ctx, text, x, y, maxW, lh) {
    let line = '', yy = y
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW && line) { ctx.fillText(line, x, yy); line = ch; yy += lh }
      else line += ch
    }
    if (line) ctx.fillText(line, x, yy)
  },

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  save() {
    const c = document.getElementById('posterCanvas')
    if (!c) return
    try {
      const a = document.createElement('a')
      a.href = c.toDataURL('image/png')
      a.download = '练不虚战报.png'
      document.body.appendChild(a); a.click(); a.remove()
      UI.toast('海报已生成，去下载目录看看')
    } catch (e) { UI.toast('长按上方图片也能保存') }
  }
}
