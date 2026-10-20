/* src/store.js —— 状态、登录态、缓存与离线队列（M0 用演示数据，M1 起接云端） */
const Store = {
  KEY_TOKEN: 'lbgym_web_token',
  KEY_CACHE: 'lbgym_web_cache_v1',
  KEY_OUTBOX: 'lbgym_web_outbox',
  KEY_DEMO: 'lbgym_web_demo_v1',
  KEY_THEME: 'lbgym_web_theme',
  KEY_PHOTOS: 'lbgym_web_photos_v1',     // 照片索引（照片本体是 lbgym_photo_<k>）
  PHOTO_PREFIX: 'lbgym_photo_',

  /** 外观：'light' 明亮 / 'dark' 深空。只切 body 的 class，所有主题差异都写在 CSS 里 */
  theme() {
    // ?theme=dark 可临时预览（不写进本地），方便截图/分享预览链接
    const q = (function () {
      try { return String((location.search || '')).match(/[?&]theme=(dark|light)/) } catch (e) { return null }
    })()
    if (q) return q[1]
    return localStorage.getItem(this.KEY_THEME) || 'dark'   // 默认深空（用户 2026-09-22 拍板）
  },
  setTheme(t) {
    const v = t === 'dark' ? 'dark' : 'light'
    localStorage.setItem(this.KEY_THEME, v)
    this.applyTheme()
    return v
  },
  applyTheme() {
    const dark = this.theme() === 'dark'
    document.body.classList.toggle('dark', dark)
    // html 也要跟着上色 —— 变量只定义在 :root 与 body.dark 上，html 本身读不到，
    // 滚动到边界时会露出浏览器默认底色（深空下那一条白边就是这么来的）。
    try { document.documentElement.style.background = dark ? '#05070d' : '#f5f7fa' } catch (e) {}
    const m = document.querySelector('meta[name="theme-color"]')
    if (m) m.setAttribute('content', dark ? '#05070d' : '#0e9f6e')
  },

  state: {
    ready: false,
    token: '',
    user: null,          // { profile, plan, dietState, gamify, privacy, player }
    checkins: [],
    demo: false,         // 未登录时的本地演示模式
    date: '',            // 当前查看日期
    playerNoText: '',    // #0001 形式
    founding: false,
    syncing: false,      // 正在与云端同步
    lastSyncAt: 0,
    lastError: ''        // 最近一次同步失败原因（页面可提示，但不阻塞）
  },

  // ─────────── 登录态 ───────────

  /** 用服务端返回的用户数据覆盖本地（并抽出玩家编号等展示字段） */
  applyUser(user, extra) {
    if (!user) return
    this.state.user = user
    this.state.playerNoText = (extra && extra.playerNoText) || ENGINE.gamify.playerNoStr(user.playerNo || 0)
    this.state.founding = (extra && extra.founding) != null
      ? extra.founding
      : ENGINE.gamify.playerTier(user.playerNo || 0).key === 'founding'
    // 玩家信息归到 user.player，页面统一从这里取
    this.state.user.player = Object.assign({}, this.state.user.player || {}, {
      no: user.playerNo || 0,
      nickname: (this.state.user.player || {}).nickname || '副本玩家',
      preview: false
    })
    this.state.demo = false
    this.saveCache()
  },

  /** 启动时尝试恢复登录态。返回是否发生了变化（变了就重渲染） */
  async restoreSession() {
    if (!this.state.token) { this.state.demo = true; return false }
    try {
      const r = await Api.auth('me', { token: this.state.token })
      this.applyUser(r.user, r)
      await this.pullState()
      return true
    } catch (e) {
      // token 失效 → 清掉，回演示模式；**不清本地缓存**（万一只是网络问题）
      if (e.code === 'AUTH_EXPIRED' || e.code === 'NO_USER') {
        this.setToken('')
        this.state.demo = true
      } else {
        this.state.lastError = Api.toast(e)
      }
      return false
    }
  },

  /** 登录成功后调：写入 token + 用户 + 拉云端数据 */
  async afterLogin(r) {
    this.setToken(r.token)
    this.applyUser(r.user, r)
    this.state.playerNoText = r.playerNoText || ENGINE.gamify.playerNoStr(r.playerNo || 0)
    this.state.founding = !!r.founding
    await this.pullState()
    return r
  },

  logout() {
    this.setToken('')
    this.state.user = null
    this.state.checkins = []
    this.state.playerNoText = ''
    this.state.founding = false
    localStorage.removeItem(this.KEY_CACHE)
    this.ensureDemo()
  },

  // ─────────── 与云端同步 ───────────

  /** 拉取云端档案与打卡记录 */
  async pullState() {
    this.state.syncing = true
    try {
      const r = await Api.api('getState', { token: this.state.token })
      this.applyUser(r.user, r)
      this.state.checkins = r.checkins || []
      this.state.lastSyncAt = Date.now()
      this.state.lastError = ''
      return true
    } catch (e) {
      this.state.lastError = Api.toast(e)
      return false
    } finally { this.state.syncing = false }
  },

  /** 写档案（防抖 1.2 秒合并多次改动）；未登录时只写本地 */
  /** 是否真的登录了（演示模式不算） */
  isLoggedIn() { return !this.state.demo && !!this.state.token && !!this.state.user },

  /**
   * 有没有档案。**这是能不能用这个 App 的分水岭**：
   * 注册时云端只建了空壳（profile: null），没有档案就算不出计划与宏量 ——
   * 训练页会空、饮食页会崩（读 weight/goal 时 null）。
   */
  hasProfile() {
    const p = this.state.user && this.state.user.profile
    return !!(p && Number(p.weight) > 0 && Number(p.height) > 0)
  },

  /**
   * 保存档案并**重算训练计划**（建档的唯一入口）。
   * 计划必须跟着档案一起生成：两者分开存会出现"有档案没计划"的半残状态。
   * @returns {{ok?:boolean, error?:string}}
   */
  saveProfile(profile, opts, extra) {
    const u = this.state.user
    if (!u) return { error: '请先登录' }
    const p = Object.assign({}, profile)
    // opts 里可以带 split / freq（分化方式、循环方式）；给空值时引擎会按经验与天数自动推
    const o = Object.assign({ home: !!p.home, dietMode: p.dietMode }, opts || {})
    if (!o.split) delete o.split
    if (!o.freq) delete o.freq
    try {
      const nextPlan = o.program ? ENGINE.kb.enrollProgram(o.program,p,o.home) : ENGINE.kb.generatePlan(p, o)
      if(o.preserveCycle && u.plan && u.plan.cycleStart) nextPlan.cycleStart=u.plan.cycleStart
      u.plan = nextPlan
    } catch (e) {
      return { error: '计划生成失败：' + ((e && e.message) || e) }
    }
    u.profile = p
    if(extra && extra.dietState) u.dietState=extra.dietState
    if (p.nick) u.nick = p.nick
    this.saveCache()
    this.saveCloud(Object.assign({ profile: u.profile, plan: u.plan, nick: u.nick || '' },extra&&extra.dietState?{dietState:extra.dietState}:{}))
    return { ok: true }
  },

  /** 局部更新当前用户的字段（plan/plus/plan12 等）—— 合入 state.user + 本地缓存 + 云端 putState。
   *  ⚠️ 2026-10-13 修：之前 plan 页调用的 Store.patch 根本不存在（调用未定义方法 → 顺延/换循环点了没反应） */
  patchUser(p) {
    const u = this.state.user || (this.state.user = {})
    Object.keys(p || {}).forEach(k => { u[k] = p[k] })
    this.saveCache()
    this.saveCloud(p)
  },

  saveCloud(patch) {
    this._pending = Object.assign({}, this._pending || {}, patch || {})
    this.saveCache()
    if (this.state.demo) return
    clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => this._flushCloud(), 1200)
  },

  async _flushCloud() {
    const patch = this._pending || {}
    this._pending = null
    if (!Object.keys(patch).length) return
    try {
      const r = await Api.api('putState', { token: this.state.token, patch })
      this.state.lastSyncAt = Date.now()
      this.state.lastError = ''
      return r
    } catch (e) {
      // 失败不阻塞用户：本地已经存了，下次改动会再带上去
      this.state.lastError = Api.toast(e)
    }
  },

  // ─────────── 会员（服务端权威：前端只发请求，不发权限）───────────

  /**
   * 兑换开通码。**权益由服务端发放**，本地只负责存结果。
   * 刻意不在前端比对口令 —— 前端能比对，就等于把口令公开了。
   */
  async redeem(code) {
    if (this.state.demo) return { ok: false, msg: '先登录再开通（这样换设备也还在）' }
    try {
      const r = await Api.api('redeem', { token: this.state.token, code: String(code || '').trim() })
      if (r && r.member && this.state.user) {
        this.state.user.member = r.member
        this.saveCache()
      }
      return { ok: true, member: (r && r.member) || null }
    } catch (e) {
      return { ok: false, msg: Api.toast(e), code: (e && e.code) || 'SERVER' }
    }
  },

  /**
   * 自助退订。也走服务端 —— 只删本地标记而云端还在，刷新一下就"复活"，
   * 那种假取消比不做还糟。
   */
  async cancelMember() {
    if (this.state.demo) return { ok: false, msg: '当前是演示模式，没有云端账号' }
    try {
      const r = await Api.api('cancelMember', { token: this.state.token })
      if (this.state.user) {
        this.state.user.member = (r && r.member) || { level: '', expiresAt: '' }
        this.saveCache()
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, msg: Api.toast(e) }
    }
  },

  /**
   * 提交打卡 —— **EXP 以服务端返回为准**。
   * 本地先按引擎算一份用于即时反馈，服务端返回后再覆盖（防止改内存刷分）。
   */
  async pushCheckin(ck) {
    this.upsertCheckinLocal(ck)
    if (this.state.demo) return { local: true }
    try {
      const r = await Api.api('upsertCheckin', { token: this.state.token, checkin: ck })
      if (r.gamify && this.state.user) {
        this.state.user.gamify = Object.assign({}, this.state.user.gamify, r.gamify)
      }
      this.state.lastSyncAt = Date.now()
      this.state.lastError = ''
      this.saveCache()
      return r
    } catch (e) {
      this.state.lastError = Api.toast(e)
      return { offline: true, error: this.state.lastError }
    }
  },

  load() {
    this.state.token = localStorage.getItem(this.KEY_TOKEN) || ''
    try {
      const c = JSON.parse(localStorage.getItem(this.KEY_CACHE) || 'null')
      if (c) { this.state.user = c.user || null; this.state.checkins = c.checkins || [] }
    } catch (e) { /* ignore */ }
    this.state.date = Fmt.todayStr()
    this.state.demo = !this.state.token
    return this.state
  },

  saveCache() {
    // 演示模式也存：标签写的是"数据仅存本机"，那就真的存下来（刷新不丢）
    try {
      localStorage.setItem(this.KEY_CACHE, JSON.stringify({
        user: this.state.user, checkins: this.state.checkins.slice(-90), at: Date.now()
      }))
    } catch (e) { /* 容量满则忽略 */ }
  },

  setToken(t) {
    this.state.token = t || ''
    if (t) localStorage.setItem(this.KEY_TOKEN, t)
    else localStorage.removeItem(this.KEY_TOKEN)
    this.state.demo = !t
  },

  // —— 离线队列（M1 起真正使用）——
  outbox() { try { return JSON.parse(localStorage.getItem(this.KEY_OUTBOX) || '[]') } catch (e) { return [] } },
  pushOutbox(item) {
    const q = this.outbox(); q.push(Object.assign({ at: Date.now(), tries: 0 }, item))
    localStorage.setItem(this.KEY_OUTBOX, JSON.stringify(q))
  },
  setOutbox(q) { localStorage.setItem(this.KEY_OUTBOX, JSON.stringify(q || [])) },

  // —— 未登录时的演示档案：用真实引擎生成，证明网页端引擎可用 ——
  ensureDemo() {
    if (this.state.user) return
    const demoProfile = {
      gender: '男', age: 30, height: 183, weight: 93, goal: '增肌减脂同步',
      exp: '进阶', days: 4, bodyType: '中性', home: false, activity: 'mod', dietMode: 'simple',
      city: '广州'
    }
    let plan = null
    try { plan = ENGINE.kb.generatePlan(demoProfile, { split: 'ppl', freq: 'c3', home: false, dietMode: 'simple' }) } catch (e) { plan = null }
    this.state.user = {
      profile: demoProfile,
      plan,
      dietState: { carbAdj: 0, proteinAdj: 0, history: [], lastType: '' },
      // 玩家编号：正式版由云端原子分配（webAuth），这里给预览值以便看效果
      player: { no: 7, nickname: '阿清', joinedAt: Fmt.todayStr(), avatar: '', preview: true },
      gamify: {
        exp: 0, level: 1, badges: [],
        streak: { cur: 0, best: 0, lastDate: '', tierGiven: [] },
        caps: { date: '', trainRaw: 0, lifeRaw: 0, pushRaw: 0 },
        weekTask: { week: Fmt.weekKey(), sessions: 0, sleepDays: 0, weights: 0, proteinDays: 0, paid: [] },
        counters: {}
      },
      privacy: { showOnRank: true }, bind: { openid: '' }
    }
    this.state.checkins = Store.demoCheckins()
    this.state.demo = true
  },

  /**
   * 演示用打卡数据：给一段真实的体重曲线，好让「宏观调控」有东西可算（否则永远是"攒数据中"）。
   * 曲线刻意造成"掉得偏快"（93kg 每周约 −0.7kg），会触发一次真实的调控建议。
   */
  demoCheckins() {
    const out = []
    const n = 12
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const date = Fmt.todayStr(d)
      const w = Fmt.round(93.6 - (n - 1 - i) * 0.1 + ((i % 3) - 1) * 0.15, 1)
      out.push({ date, weight: w, demo: true, trained: (n - 1 - i) % 2 === 0, exercises: [] })
    }
    return out
  },

  // 取某天的打卡（演示模式从内存，正式模式从缓存）
  checkinOf(date) {
    return this.state.checkins.find(c => c.date === date) || null
  },

  /**
   * 喂给引擎的饮食偏移 —— **唯一入口**。
   * 两路来源：饥饿反馈（日级感性，饮食页点「很饿/不饿」） + 宏观调控（周级客观，由体重趋势算出）。
   * 任何算宏量的地方都必须走这里，否则两个源会各算各的。
   */
  adj() {
    const u = this.state.user || {}
    return ENGINE.macro.combinedAdj(u.dietState || {})
  },

  /** 记一次体重（写进当天打卡；同时更新档案体重，宏量按它算） */
  setWeight(date, kg) {
    const w = Number(kg)
    if (!(w > 20 && w < 400)) return false
    const ck = Object.assign({ date, exercises: [] }, this.checkinOf(date) || {})
    ck.weight = Fmt.round(w, 1)
    this.upsertCheckinLocal(ck)
    if (this.state.user && this.state.user.profile) this.state.user.profile.weight = ck.weight
    return true
  },

  upsertCheckinLocal(ck) {
    const i = this.state.checkins.findIndex(c => c.date === ck.date)
    if (i >= 0) this.state.checkins[i] = Object.assign({}, this.state.checkins[i], ck)
    else this.state.checkins.push(ck)
    this.state.checkins.sort((a, b) => a.date < b.date ? -1 : 1)
    this.saveCache()
  },

  /* ─────────── 训练日志：一句话 + 照片 ───────────
   * 隐私红线：**照片只存本机 localStorage，永不上传**（对比的竞品也是这个做法）。
   *   理由：手机照片带 GPS/人脸，上传等于给自己找合规麻烦，而且对用户没收益。
   *   上云的只有「一句话 + 主题」，webApi 侧会主动剥掉 note.photos。
   */

  /** 照片索引：[{k, date, kb, at, pinned}]（旧→新由 Journal.planEvict 自己排） */
  photoIndex() {
    try { return JSON.parse(localStorage.getItem(this.KEY_PHOTOS) || '[]') } catch (e) { return [] }
  },
  setPhotoIndex(list) {
    try { localStorage.setItem(this.KEY_PHOTOS, JSON.stringify(list || [])) } catch (e) { /* 满了就算了 */ }
  },
  photoSrc(k) {
    if (!k) return ''
    try { return localStorage.getItem(this.PHOTO_PREFIX + k) || '' } catch (e) { return '' }
  },
  /** 取某天的照片（按索引顺序） */
  photosOf(date) {
    return this.photoIndex()
      .filter(p => p.date === date)
      .map(p => ({ k: p.k, src: this.photoSrc(p.k) }))
      .filter(p => p.src)
  },

  /** 全部照片索引（含 dataURL），按时间正序 —— 体型对比滑块用 */
  photosAll() {
    return this.photoIndex()
      .map(p => ({ k: p.k, date: p.date, src: this.photoSrc(p.k) }))
      .filter(p => p.src)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  },

  /** 数据导出：你的数据你带走（档案 + 计划 + 全部打卡，一份 JSON 下载） */
  exportAll() {
    const payload = {
      app: '练不虚',
      exportedAt: new Date().toISOString(),
      profile: (this.state.user || {}).profile || null,
      plan: (this.state.user || {}).plan || null,
      gamify: (this.state.user || {}).gamify || null,
      checkins: this.state.checkins || []
    }
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'lianbuxu-data-' + Fmt.todayStr() + '.json'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove() } catch (e) { /* ignore */ } }, 600)
      UI.toast('已导出 —— 文件在你的下载里')
    } catch (e) { UI.toast('导出失败：' + ((e && e.message) || '浏览器不支持')) }
  },

  /**
   * 存一张照片（dataUrl）。返回 {k} 或 {error}。
   * 配额策略：先按 Journal.planEvict 淘汰旧图，再写；写失败（QuotaExceeded）就再淘汰一批重试，
   * 最多 3 轮。**绝不因为存照片把打卡数据挤爆** —— 最后兜底是把照片放弃掉。
   */
  addPhoto(date, dataUrl) {
    if (!dataUrl) return { error: '空图片' }
    const kb = ENGINE.journal.dataUrlKB(dataUrl)
    let idx = this.photoIndex()
    const k = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    for (let round = 0; round < 3; round++) {
      const victims = ENGINE.journal.planEvict(idx, round === 0 ? kb : 1)
      victims.forEach(v => {
        try { localStorage.removeItem(this.PHOTO_PREFIX + v) } catch (e) { /* ignore */ }
      })
      idx = idx.filter(p => victims.indexOf(p.k) < 0)
      try {
        localStorage.setItem(this.PHOTO_PREFIX + k, dataUrl)
        idx.push({ k: k, date: date, kb: kb, at: Date.now(), pinned: false })
        this.setPhotoIndex(idx)
        return { k: k, kb: kb }
      } catch (e) {
        // 配额爆了 → 下一轮把体积闸收到最小（只留 1KB 余量）继续淘汰
      }
    }
    return { error: '本机存储空间不足，这张照片没存下来（打卡数据不受影响）' }
  },

  delPhoto(k) {
    try { localStorage.removeItem(this.PHOTO_PREFIX + k) } catch (e) { /* ignore */ }
    this.setPhotoIndex(this.photoIndex().filter(p => p.k !== k))
  },

  /** 本机照片占用了多少 */
  photoUsage() {
    const idx = this.photoIndex()
    const kb = idx.reduce((a, p) => a + (Number(p.kb) || 0), 0)
    return { count: idx.length, kb: Fmt.round(kb, 0), limitKB: ENGINE.journal.J.PHOTO_MAX_KB }
  },

  /**
   * 保存今天的日志。本地立刻生效 → 云端只同步「文字+主题」（照片本机留存）。
   * 返回 {ok, offline}
   */
  saveNote(date, note) {
    this.state.checkins = ENGINE.journal.upsertNote(this.state.checkins, date, note)
    this.saveCache()
    // 日志跟着打卡一起上云（云端 sanitizeCheckin 只留文字/标题/主题，**照片会被剥掉**）。
    // 没打卡的日子写了日志也能提交 —— 那条 checkin 的 trained 是 false。
    const ck = this.checkinOf(date)
    if (ck && !this.state.demo) {
      Api.api('upsertCheckin', { token: this.state.token, checkin: ck }).then(r => {
        if (r && r.gamify) this.state.user.gamify = Object.assign({}, this.state.user.gamify, r.gamify)
        this.state.lastSyncAt = Date.now()
      }).catch(() => { this.state.lastSyncAt = 0 })
    }
    return { ok: true }
  },

  /** 今天的突破（历史不含今天） */
  prsOf(date) {
    const ck = this.checkinOf(date)
    if (!ck) return []
    const history = this.state.checkins.filter(c => c.date < date)
    return ENGINE.journal.findPRs(ck.exercises || [], history)
  },

  /** 最近一条日志（首页/存档页用） */
  latestWords() { return ENGINE.journal.latestWords(this.state.checkins) },

  /**
   * 排行榜的本机示例数据。
   * 用途：还没部署云函数、或离线时，让用户看得见榜长什么样（而不是"空榜单"）。
   * 登录并拉到云端数据后，PageRank 会优先用云端的。
   */
  demoBoard() {
    const u = this.state.user || {}
    const g = u.gamify || {}
    const acct = u.account || {}
    const meCity = ENGINE.gamify.normCity((u.profile || {}).city) || '广州'
    const seed = [
      { nick: '老周', city: '广州', no: 3, exp: 46800, streak: 96, vol: 32400, badges: 14 },
      { nick: '阿May', city: '广州', no: 12, exp: 31500, streak: 41, vol: 26800, badges: 11 },
      { nick: '铁憨憨', city: '广州', no: 88, exp: 19200, streak: 63, vol: 41200, badges: 9 },
      { nick: '小何', city: '深圳', no: 45, exp: 27600, streak: 22, vol: 19500, badges: 10 },
      { nick: '大熊', city: '深圳', no: 60, exp: 15400, streak: 8, vol: 30100, badges: 7 },
      { nick: '陈sir', city: '北京', no: 101, exp: 52300, streak: 130, vol: 22600, badges: 15 },
      { nick: '柠檬', city: '杭州', no: 233, exp: 9800, streak: 17, vol: 12800, badges: 5 },
      { nick: '老猫', city: '成都', no: 356, exp: 6400, streak: 4, vol: 8600, badges: 4 }
    ]
    const list = seed.map((r, i) => ({
      uid: 'demo' + i, nick: r.nick, city: r.city, playerNo: r.no,
      gamify: {
        exp: r.exp, badges: new Array(r.badges).fill({}),
        streak: { cur: r.streak, best: r.streak }, weekTask: { volume: r.vol }
      }
    }))
    // 把自己也放进去，"我的名次"才真的算得出来
    list.push({
      uid: acct.uid || 'me', nick: acct.nick || '我', city: meCity,
      playerNo: acct.playerNo || 0, gamify: g
    })
    return list
  }
}
