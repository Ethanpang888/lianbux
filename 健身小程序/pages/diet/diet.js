const app = getApp()
const calc = require('../../utils/calc.js')
const dietLib = require('../../utils/diet.js')
const kb = require('../../utils/kb.js')

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// 当天序数：同一天看到同一套菜，换一天会换菜
function daySeed() {
  const d = new Date()
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d - start) / 86400000)
}

Page({
  data: {
    hasProfile: false,
    diet: null,
    energy: null,
    trend: null,
    dietMode: 'simple',
    dayPlan: null,
    dietState: { carbAdj: 0, proteinAdj: 0, lastType: '' },
    history7: [],
    theories: [
      { t: '🌾 微饿原则', s: '保持「微微饥饿」是增肌减脂最高效的状态。很饿→升碳水降蛋白；微饿→最佳不动；不饿→降碳水升蛋白。饥饿本身有助抗炎、促恢复。' },
      { t: '🥑 O3 / O6 平衡', s: '脂肪 0.6–0.8g/kg 足够。日常 O6 易过量，多补 O3：橄榄油、坚果、牛油果、深海鱼；少动物油。要平衡，不是只吃某一种。' },
      { t: '🏃 有氧 3–4 次/周', s: '增肌减脂都要有氧——提升线粒体能力（合成+代谢双收益）。一次 30–40 分钟，强度可渐进（爬坡→爬楼），别太久以免拖垮训练。' },
      { t: '😴 早睡养线粒体', s: '熬夜会让受损线粒体堆积、新线粒体进不来。尽量 11 点前睡，7–9 小时，恢复和激素稳定全靠它。' },
      { t: '🧭 状态优先', s: '一切跟着「状态」走：想练、专注、精神好才是调参信号。状态差先排查睡眠/有氧/饮食，别硬减脂，否则易平台期。' },
      { t: '🥩 优质蛋白', s: '红白肉交替，少吃炸的/久放的劣质数。蛋白 1.2–2.0g/kg，碳水低时吸收率高可多吃，碳水高时吸收率低略减——放屁多又臭就是过量信号。' }
    ]
  },

  onShow() {
    const g = app.globalData
    if (!g.openid) { setTimeout(() => this.onShow(), 300); return }
    if (!g.profile) { this.setData({ hasProfile: false }); return }
    this.setData({ hasProfile: true })
    this.refresh()
  },

  refresh() {
    const g = app.globalData
    const ds = g.dietState || { carbAdj: 0, proteinAdj: 0, history: [] }
    // 锚定 TDEE：BMR × 活动系数 → ± 目标缺口 → 热量目标
    const diet = calc.energyPlan(g.profile, ds)
    const history7 = (ds.history || []).slice(-7).map(h => h.type)
    const mode = (g.profile && g.profile.dietMode) || (g.plan && g.plan.dietMode) || 'simple'
    // 「今天吃什么」：菜谱模式给具体菜品+用量；简化模式给每餐克数+食材换算
    let dayPlan = null
    try { dayPlan = dietLib.buildDay(diet, mode, { seed: daySeed() }) } catch (e) { dayPlan = null }
    // 三餐参考（2026-10-19 与网站 refMeals 同逻辑：主食+蛋白+蔬菜+油脂组合，复合营养折算）
    const refMeals = this.buildRefMeals(diet)
    this.setData({
      refMeals, diet, dietMode: mode, dayPlan,
      energy: {
        bmr: diet.bmr, factor: diet.activity.factor, actName: diet.activity.name,
        tdee: diet.tdee, targetKcal: diet.targetKcal, deficit: diet.deficit, warn: diet.warn
      },
      dietState: { carbAdj: ds.carbAdj || 0, proteinAdj: ds.proteinAdj || 0, lastType: ds.lastType || '' },
      history7
    })
    this.loadTrend()
  },

  // ───── 三餐参考（与网站 diet.js refMeals 同步；改一边必须改另一边）─────
  REF_PCT: { b: 0.27, l: 0.35, s: 0.10, d: 0.28 },
  buildRefMeals(e) {
    const P = ['米饭(熟)', '燕麦片', '红薯', '全麦面包', '面条(熟)']
    const B = ['鸡胸肉', '鸡蛋', '牛肉(瘦)', '虾', '三文鱼']
    const V = ['西兰花', '菠菜', '番茄', '生菜']
    const F = ['橄榄油', '花生', '牛油果', '杏仁']
    const FOODS = kb.FOODS
    const per100 = n => { const x = FOODS.find(y => y.name === n) || {}; return { kcal: x.kcal || 0, protein: x.protein || 0, carbs: x.carbs || 0, fat: x.fat || 0 } }
    const seed = daySeed()
    const pick = (arr, off) => arr[(seed + off) % arr.length]
    const MEALS = [{ k: 'b', name: '早餐' }, { k: 'l', name: '午餐' }, { k: 's', name: '加餐（练后）' }, { k: 'd', name: '晚餐' }]
    return MEALS.map((m, mi) => {
      const pct = this.REF_PCT[m.k]
      const ck = (e.kcal || 0) * pct, pg = (e.protein || 0) * pct, cb = (e.carb || 0) * pct, ft = (e.fat || 0) * pct
      let items = []
      if (m.k === 's') {
        items = [{ name: '香蕉', g: 1, unit: '根', ...per100('香蕉') }, { name: '蛋白粉(乳清)', g: 30, unit: 'g', ...per100('蛋白粉(乳清)') }]
      } else {
        const bn = pick(B, mi), sn = pick(P, mi), vn = pick(V, mi + 1), fn = pick(F, mi)
        const bp = per100(bn), sp = per100(sn), fp = per100(fn)
        const isEgg = bn === '鸡蛋'
        let bg = Math.round(pg * 0.80 / (bp.protein / 100 || 1))
        if (isEgg) { const eggs = Math.max(1, Math.round(bg / 50)); bg = eggs * 50 }
        const fatFromB = bp.fat * bg / 100
        const sg = Math.round(cb * 0.85 / (sp.carbs / 100 || 1))
        const fg = Math.max(5, Math.round((ft - fatFromB) / (fp.fat / 100 || 1)))
        items = [
          { name: bn, g: bg, unit: isEgg ? 'g（' + Math.round(bg / 50) + ' 个）' : 'g', ...bp },
          { name: sn, g: sg, unit: 'g', ...sp },
          { name: vn, g: 250, unit: 'g', ...per100(vn) },
          { name: fn, g: fg, unit: 'g', ...fp }
        ]
      }
      const sum = items.reduce((a, x) => ({ k: a.k + (x.kcal || 0) * (x.g || 0) / 100, p: a.p + (x.protein || 0) * (x.g || 0) / 100 }), { k: 0, p: 0 })
      return { meal: m.k, name: m.name, items, sumK: Math.round(sum.k), sumP: Math.round(sum.p), targetK: Math.round(ck), targetP: Math.round(pg) }
    })
  },
  /** 把三餐参考的某一餐写进今日 checkin.dietLog（today 页 onShow 会拉到） */
  refLog(e) {
    const k = e.currentTarget.dataset.k
    const m = (this.data.refMeals || []).find(x => x.meal === k)
    if (!m) return
    const db = wx.cloud.database()
    const docId = app.globalData.openid + '_' + todayStr()
    wx.showLoading({ title: '记入中', mask: true })
    db.collection('checkins').doc(docId).get().then(r => {
      const log = (r.data && r.data.dietLog) || []
      const add = m.items.map(x => {
        const f = kb.FOODS.find(y => y.name === x.name)
        const k100 = (x.g || 0) / 100
        return { name: x.name, grams: x.g, meal: k,
          kcal: Math.round((x.kcal || (f ? f.kcal : 0)) * k100),
          protein: Math.round((x.protein || (f ? f.protein : 0)) * k100 * 10) / 10,
          carbs: Math.round((x.carbs || (f ? f.carbs : 0)) * k100 * 10) / 10,
          fat: Math.round((x.fat || (f ? f.fat : 0)) * k100 * 10) / 10,
          fiber: Math.round(((f ? f.fiber : 0) || 0) * k100 * 10) / 10 }
      })
      return db.collection('checkins').doc(docId).update({ data: { dietLog: log.concat(add), updatedAt: Date.now() } })
    }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: '已记入「' + m.name + '」', icon: 'none' })
    }).catch(() => { wx.hideLoading(); wx.showToast({ title: '记入失败（今天还没打过卡）', icon: 'none' }) })
  },

  // 近 3 周体重 → 趋势与调控建议（谭成义：固定吃 7-10 天再看；降太快加碳水、不动减碳水）
  loadTrend() {
    const db = wx.cloud.database()
    const _ = db.command
    const now = new Date()
    const past = new Date(now.getTime() - 21 * 86400000)
    const since = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
    db.collection('checkins').where({ _openid: app.globalData.openid, date: _.gte(since) })
      .orderBy('date', 'asc').limit(40).get()
      .then(res => this.setData({ trend: calc.weightTrend(res.data, app.globalData.profile, 14) }))
      .catch(() => {})
  },

  // 一键采纳趋势建议：碳水偏移 ±0.25g/kg
  applyTrend() {
    const t = this.data.trend
    if (!t || !t.enough || !t.step) return
    const cur = app.globalData.dietState || { carbAdj: 0, proteinAdj: 0, history: [] }
    const carbAdj = Math.max(-1.5, Math.min(1.5, Math.round(((cur.carbAdj || 0) + t.step) * 100) / 100))
    app.globalData.dietState = Object.assign({}, cur, { carbAdj })
    this.refresh()
    app.saveUser({ dietState: app.globalData.dietState }).then(() => {
      wx.showToast({ title: '已按体重趋势调整碳水', icon: 'none' })
    }).catch(() => {})
  },

  // 切换饮食模式（配好菜 / 只给克数）
  setDietMode(e) {
    const mode = e.currentTarget.dataset.m
    if (mode === this.data.dietMode) return
    const g = app.globalData
    if (g.profile) g.profile.dietMode = mode
    if (g.plan) g.plan.dietMode = mode
    this.setData({ dietMode: mode })
    this.refresh()
    app.saveUser({ profile: g.profile, plan: g.plan }).catch(() => {})
  },

  setHunger(e) {
    const type = e.currentTarget.dataset.v
    const cur = app.globalData.dietState || { carbAdj: 0, proteinAdj: 0, history: [] }
    const adj = calc.applyHunger(type, cur)
    const today = todayStr()
    const history = (cur.history || []).filter(h => h.date !== today).concat([{ date: today, type }])
    app.globalData.dietState = { carbAdj: adj.carbAdj, proteinAdj: adj.proteinAdj, history, lastType: type }
    wx.showLoading({ title: '记录中', mask: true })
    app.saveUser({ dietState: app.globalData.dietState }).then(() => {
      wx.hideLoading()
      this.refresh()
      wx.showToast({ title: '已记录·目标已微调', icon: 'none' })
    }).catch(() => { wx.hideLoading(); this.refresh() })
  },

  goAssess() { wx.navigateTo({ url: '/pages/assess/assess' }) }
})
