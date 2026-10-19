// app.js —— 初始化云环境 + 全局用户态（OPENID / profile / plan）
const ENV = 'cloud1-d7gtp1mv1bfcc25df' // CloudBase 环境 ID
const kb = require('./utils/kb.js')
const restTimer = require('./utils/rest-timer.js')
const cultivation = require('./utils/cultivation.js')

App({
  onShow(){restTimer.show()},
  onHide(){restTimer.hide()},
  globalData: {
    env: ENV,
    openid: null,
    profile: null,   // 测评资料
    plan: null,      // 生成的28天计划
    constitution: null, // 中医体质倾向（调理页选择）
    lastPlanBackup: null, // 秘籍快照（utils/plan-backup.js 建，换回用）
    savedPlans: [],       // 多套保存计划
    activeSavedId: '',    // 当前使用的保存套 id
    breakShown: 0,        // 已展示的最高破境级（破境仪式卡幂等）
    ready: false,
    cultivation: null,  // 修炼摘要（EXP/等级/境界，当日缓存，utils/cultivation.js 算）
    aiEnabled: false // ← AI 答疑默认关闭（个人测试阶段免费）。后续开通 CloudBase AI 额度后改 true
  },

  // 修炼摘要：读 checkins 重放 EXP/等级/境界（只读不写库，口径 = 网站 gamify.js）
  // 当日缓存：同一天多个页面复用一次查询；打卡保存后传 force=true 刷新
  loadCultivation(force) {
    const today = this.todayStr()
    const c = this.globalData.cultivation
    if (!force && c && c._day === today && this.globalData.profile) return Promise.resolve(c)
    if (!this.globalData.openid) return Promise.resolve(null)
    const db = wx.cloud.database()
    return db.collection('checkins').where({ _openid: this.globalData.openid })
      .orderBy('date', 'desc').limit(365).get()
      .then(res => {
        const cul = cultivation.summarize(((res && res.data) || []).slice().reverse(), this.globalData.profile)
        cul._day = today
        this.globalData.cultivation = cul
        return cul
      })
      .catch(() => null)
  },

  onLaunch() {
    // 隐私授权（微信强制）：首次触发需收集个人信息时弹窗，用户同意后才继续
    if (wx.onNeedPrivacyAuthorize) {
      wx.onNeedPrivacyAuthorize((resolve) => {
        wx.showModal({
          title: '隐私授权提示',
          content: '使用前需同意《隐私协议》。本小程序仅通过微信 OpenID 标识您的身份，用于保存您的健身计划与打卡记录，不收集头像、昵称、手机号等额外信息。',
          confirmText: '同意并继续',
          cancelText: '暂不使用',
          success: (res) => {
            if (res.confirm) {
              resolve({ event: 'agree' })
            } else {
              resolve({ event: 'disagree' })
            }
          },
          fail: () => resolve({ event: 'disagree' })
        })
      })
    }

    if (!wx.cloud) {
      console.error('请使用 2.2.3 以上基础库以使用云能力')
      return
    }
    wx.cloud.init({ env: ENV, traceUser: true })

    // 取 OPENID（云函数 login）
    wx.cloud.callFunction({ name: 'login' })
      .then(res => {
        this.globalData.openid = res.result.openid
        return this.loadUser()
      })
      .then(() => this.loadEntitlements().catch(()=>{}))
      .then(() => { this.globalData.ready = true })
      .catch(err => console.error('初始化失败', err))
  },

  // 拉取用户文档（不存在则留空）
  loadUser() {
    const db = wx.cloud.database()
    return db.collection('users').doc(this.globalData.openid).get()
      .then(res => {
        const d = res.data || {}
        this.globalData.profile = d.profile || null
        const rawPlan = d.plan || null
        // 旧 plan.days（28天）格式一次性迁移为 micro 无限循环，回写云端
        const plan = kb.migratePlan(this.globalData.profile, rawPlan)
        this.globalData.plan = plan
        const profile = d.profile || {}
        this.globalData.constitution = Object.prototype.hasOwnProperty.call(profile, 'constitution') ? profile.constitution : (d.constitution || null)
        this.globalData.tcmResult = Object.prototype.hasOwnProperty.call(profile, 'tcmResult') ? profile.tcmResult : (d.tcmResult || null)
        this.globalData.member=d.member||null;this.globalData.plus=d.plus||null;this.globalData.plan12=d.plan12||null;this.globalData.playerNo=d.playerNo||0
        this.globalData.email = d.email || ''
        this.globalData.subscribed = !!d.subscribed
        this.globalData.dietState = d.dietState || { carbAdj: 0, proteinAdj: 0, history: [] }
        this.globalData.lastPlanBackup = d.lastPlanBackup || null
        this.globalData.savedPlans = Array.isArray(d.savedPlans) ? d.savedPlans : []
        this.globalData.activeSavedId = d.activeSavedId || ''
        // 2026-10-18 成长总览：周任务进度与已展示破境级挂在 globalData（profile 页展示用）
        this.globalData.gamify = d.gamify || null
        this.globalData.breakShown = (d.breakShown || 0)
        if (rawPlan && (!rawPlan.micro || !rawPlan.micro.length)) {
          return this.saveUser({ plan }).catch(() => {})
        }
      })
      .catch(() => { /* 无文档 = 新用户 */ })
  },

  // 保存/更新用户文档（合并写入，避免覆盖 constitution 等已有字段）
  saveUser(data) {
    const openid = this.globalData.openid
    if (!openid) {
      return Promise.reject(new Error('openid 未初始化，请稍后重试'))
    }
    const db = wx.cloud.database()
    return db.collection('users').doc(openid).get()
      .then(res => {
        const cur = res.data || {}
        delete cur._id; delete cur._openid
        return db.collection('users').doc(openid).set({ data: Object.assign({}, cur, data) })
      }, err => {
        // 只有确实不存在才创建。网络/权限错误不能用部分数据覆盖原文档；
        // 此拒绝回调只处理 get，不会吞掉前一个 set 的写入失败。
        const message = String(err && (err.errMsg || err.message) || '')
        if (!/document(?: does)? not exist|document.*not found|文档不存在/i.test(message)) throw err
        const clean = Object.assign({}, data)
        delete clean._id; delete clean._openid
        return db.collection('users').doc(openid).set({ data: clean })
      })
  },

  loadEntitlements(){return require('./utils/entitlements.js').load()},

  // 今日日期 YYYY-MM-DD
  todayStr() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
})
