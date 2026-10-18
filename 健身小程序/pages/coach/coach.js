const app = getApp()
const calc = require('../../utils/calc.js')
const kb = require('../../utils/kb.js')
const macro = require('../../utils/macro.js')
const pro = require('../../utils/pro.js')
const coach = require('../../utils/coach.js')

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* 调整顾问（与网站 pages/coach.js 同一套规则引擎，零 AI 成本）：
   点一个情况 → 引擎按你最近的打卡/体重/计划算 → 给可执行调整 → 一键应用进计划 */
Page({
  data: {
    sits: [], picked: '', hint: '',
    result: null, needPick: false, options: [],
    aiBusy: false, hasPlan: true
  },

  onLoad() {
    this.setData({ sits: coach.situationList() })
  },

  onShow() {
    const g = app.globalData
    if (!g.openid) { setTimeout(() => this.onShow(), 300); return }
    if (!g.profile) { app.loadUser().then(() => this.setData({ hasPlan: !!g.plan })).catch(() => {}); return }
    this.setData({ hasPlan: !!g.plan })
  },

  pick(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ picked: key, hint: (this.data.sits.find(s => s.key === key) || {}).hint || '' })
    this.compute(key)
  },

  fetchCheckins() {
    // 调整顾问只看近 90 天：降序 100 条足够（体重趋势/频率/饥饿都在近两周窗口）
    const db = wx.cloud.database()
    return db.collection('checkins')
      .where({ _openid: app.globalData.openid })
      .orderBy('date', 'desc').limit(100).get()
      .then(res => (res.data || []).slice().reverse())
  },

  compute(key, ex) {
    const g = app.globalData
    if (!g.plan) { this.setData({ result: { ok: false, msg: '还没有计划，先去建档' }, needPick: false, options: [] }); return }
    this.fetchCheckins().then(checkins => {
      const today = todayStr()
      let day = null
      try {
        const idx = Math.max(0, calc.dayIndexFromStart(g.plan.cycleStart || today, today))
        day = kb.dayContent(g.plan, idx, g.profile, !!g.plan.home)
      } catch (e) { day = null }
      try {
        const r = coach.advise(key, {
          engine: { calc, kb, macro, pro },
          profile: g.profile || {},
          plan: g.plan,
          dietState: g.dietState || {},
          checkins,
          day,
          today
        }, { exercise: ex })
        const needPick = !!(r && r.needPick)
        this.setData({
          result: r,
          needPick,
          options: needPick ? (r.options || []) : []
        })
      } catch (e) {
        this.setData({ result: { ok: false, msg: (e && e.message) || String(e) }, needPick: false, options: [] })
      }
    }).catch(() => this.setData({ result: { ok: false, msg: '打卡数据读取失败，稍后再试' }, needPick: false, options: [] }))
  },

  pickEx(e) {
    const key = e.currentTarget.dataset.ex
    this.compute(this.data.picked, key)
  },

  apply() {
    const r = this.data.result
    if (!r || !r.apply) return
    const g = app.globalData
    const a = r.apply
    try {
      if (a.type === 'macro') {
        g.dietState = macro.apply(a.payload.rev, g.dietState)
        app.saveUser({ dietState: g.dietState })
      } else if (a.type === 'hunger') {
        g.dietState = Object.assign({}, g.dietState, a.payload.next, { lastType: '很饿' })
        app.saveUser({ dietState: g.dietState })
      } else if (a.type === 'state') {
        g.profile = Object.assign({}, g.profile, { todayState: { date: todayStr(), key: a.payload.key } })
        app.saveUser({ profile: g.profile })
      } else if (a.type === 'plan') {
        g.plan = a.payload.plan
        app.saveUser({ plan: g.plan })
      } else {
        wx.showToast({ title: '这条还不支持自动应用', icon: 'none' }); return
      }
      wx.showToast({ title: '已应用 —— 计划已经改了', icon: 'none' })
      this.setData({ result: null, picked: '', hint: '' })
    } catch (e) {
      wx.showToast({ title: '应用失败：' + ((e && e.message) || ''), icon: 'none' })
    }
  },

  goPlan() { wx.switchTab({ url: '/pages/plan/plan' }) },
  goToday() { wx.switchTab({ url: '/pages/today/today' }) }
})
