const app = getApp()
const restTimer=require('../../utils/rest-timer.js')
const calc = require('../../utils/calc.js')
const kb = require('../../utils/kb.js')
const dietRecords = require('../../utils/diet-records.js')

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* 角色形象阶段（与网站洞府一致）：按**累计完成打卡次数**取阶段。 */
const STAGES= require('../../utils/page-contract.js').CHAR_STAGES
function stageOf(n) {
  let pick = STAGES[0]
  for (const s of STAGES) if (n >= s.at) pick = s
  return pick
}

require('../../utils/page.js')({
  data: {
    profile: null, plan: null, hasPlan: false,
    dayIndex: 0, streak: 0, totalTrained: 0,
    dateLabel: '', stageName: '新手', stageFile: 'stage1.png',
    nickname: '',
    culLevel: 0, culTitle: '', culRealm: '', culExp: 0,
    culPct: 0, culCur: 0, culSpan: 0, culToNext: 0, culMaxed: false,
    todayFocus: '', isRest: false, todayNEx: 0, todayNSets: 0, todayEstMin: 0, doneToday: false,
    targetKcal: 0, targetProtein: 0,
    inProgram: false, progress: 0,
    // 今日恢复卡（与网站 recoveryCard 同款：睡眠 chips + 补水）
    sleepHours: 0, waterMl: 0, waterTarget: 0,
    // 破境仪式卡（2026-10-18 与网站分层版一致：境界/形象/里程碑分真实事件，不锁 XP 无门槛）
    breakOn: false, breakLv: 0, breakRealm: '', breakNote: '', breakComment: '', breakEyebrow: '', breakParts: [],
    SLEEP_CHIPS: [6, 6.5, 7, 7.5, 8, 8.5, 9]
  },

  onShow() {
    restTimer.connect(app.globalData.openid)
    if(!this._restUnsub)this._restUnsub=restTimer.subscribe(t=>this.setData({activeRest:t?{label:t.label,left:t.left,time:String(Math.floor(t.left/60)).padStart(2,'0')+':'+String(t.left%60).padStart(2,'0')}:null}))
    if (this.getTabBar) this.getTabBar().setData({ selected: 0 })
    this.load()
  },

  onHide(){if(this._restUnsub){this._restUnsub();this._restUnsub=null}},
  onUnload(){this.onHide()},
  load() {
    const g = app.globalData
    if (!g.openid) { setTimeout(() => this.load(), 300); return }
    if (!g.profile) {
      app.loadUser().then(() => this.render()).catch(() => this.render())
    } else this.render()
  },

  render() {
    const g = app.globalData
    const profile = g.profile, plan = g.plan
    if (!profile) { this.setData({ profile: null, hasPlan: false }); return }

    const d = new Date()
    const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
    const dateLabel = `${d.getMonth() + 1}月${d.getDate()}日 · 周${wd}`

    let dayIndex = 0, inProgram = false, progress = 0
    let todayFocus = '', isRest = false, nEx = 0, nSets = 0, estMin = 0
    let cycleLen = 28
    if (plan && plan.cycleStart) {
      const idx = calc.dayIndexFromStart(plan.cycleStart, todayStr())
      dayIndex = idx < 0 ? 0 : idx
      const day = kb.dayContent(plan, dayIndex, profile, plan.home)
      if (day && day.type === 'train') {
        todayFocus = day.focus
        nEx = (day.exercises || []).length
        let sec = (day.warmup && day.warmup.minutes || 8) * 60
        ;(day.exercises || []).forEach(e => {
          const n = Number(String(e.sets).split('×')[0]) || 3
          nSets += n
          sec += n * 45 + Math.max(0, n - 1) * (e.rest || 120)
        })
        estMin = Math.max(30, Math.round(sec / 60 / 5) * 5)
      } else if (day) { isRest = true; todayFocus = '休息日' }
      if (plan.micro && plan.micro.length) { cycleLen = plan.micro.length; inProgram = !!plan.program }
    }
    progress = cycleLen ? ((dayIndex % cycleLen) / cycleLen) * 100 : 0

    // 饮食目标（引擎算，与饮食页同口径）
    let targetKcal = 0, targetProtein = 0
    try {
      const diet = calc.energyPlan(profile, require('../../utils/macro.js').combinedAdj(g.dietState || {}))
      if (diet) { targetKcal = Math.round(diet.targetKcal || diet.kcal || 0); targetProtein = Math.round(diet.protein || 0) }
    } catch (e) { /* 算不出就显示 0，不挡页面 */ }

    const st = this.data.totalTrained ? stageOf(this.data.totalTrained) : stageOf(0)
    this.setData({
      profile, plan, hasPlan: !!plan, dayIndex, inProgram, progress, dateLabel,
      todayFocus, isRest, todayNEx: nEx, todayNSets: nSets, todayEstMin: estMin,
      targetKcal, targetProtein,
      nickname: (profile.nickname || '修行者').slice(0, 6),
      stageName: st.name, stageFile: st.file,
      waterTarget: Math.round((Number(profile.weight) || 60) * 30)
    })
    this.loadStreak()
    this.loadRecovery()
    this.loadDietSummary()
  },

  postponeTraining(){app.globalData.openSchedule=true;require('../../utils/navigation.js').go('/pages/plan/plan')},
  goDiet(){require('../../utils/navigation.js').go('/pages/diet/diet')},
  openFoodPanel(e){wx.navigateTo({url:'/pages/food/food?meal='+e.currentTarget.dataset.k+'&date='+todayStr()})},
  loadDietSummary(){
    const e=calc.energyPlan(app.globalData.profile,require('../../utils/macro.js').combinedAdj(app.globalData.dietState||{}))
    const paint=log=>this.setData(Object.assign({goalName:(app.globalData.profile||{}).goal,energy:{tdee:e.tdee,deficit:e.deficit}},require('../../utils/presentation.js').dietSummary(log,e)))
    paint([])
    dietRecords.load(app.globalData.openid,todayStr()).then(rows=>paint((rows[0]||{}).dietLog||[])).catch(()=>wx.showToast({title:'饮食记录读取失败',icon:'none'}))
  },

  /* ───── 破境/里程碑仪式卡（与网站分层版一致）：按真实事件分类，跨级合并，不虚构奖励 ───── */
  checkBreak(cul) {
    const lv = cul.level || 0
    const shown = app.globalData.breakShown || 0
    if (!(lv > shown)) return
    const realms = [10, 30, 60, 85], images = [20, 45, 70, 95]
    const evs = { realm: [], image: [], mile: [] }
    for (let l = Math.max(shown + 1, 1); l <= Math.min(lv, 99); l++) {
      if (realms.indexOf(l) >= 0) evs.realm.push(l)
      else if (images.indexOf(l) >= 0) evs.image.push(l)
      else if (l % 10 === 0) evs.mile.push(l)
    }
    if (!evs.realm.length && !evs.image.length && !evs.mile.length) return
    const hasRealm = evs.realm.length > 0, hasImage = evs.image.length > 0
    const eyebrow = hasRealm ? '境 界 突 破' : hasImage ? '形 象 解 锁' : '修 行 里 程 碑'
    const REALM_AT = { 10: '蓄力', 30: '精进', 60: '破境', 85: '宗师' }
    const parts = []
    if (hasRealm) parts.push('跨入「' + REALM_AT[evs.realm[evs.realm.length - 1]] + '」（Lv.' + evs.realm.join('、') + '）')
    if (hasImage) parts.push('修行形象焕新（Lv.' + evs.image.join('、') + '）—— 现在是这个阶段的你')
    if (evs.mile.length) parts.push('修行里程碑（Lv.' + evs.mile.join('、') + '）—— 每十级一座碑')
    const comments = [
      '哼，凡胎淬体百日，总算摸到了门槛。这不过是起点——老夫等着看你血肉成丹的那天。',
      '骨骼清奇，心性也算沉稳。此境若稳扎三月，胜过旁人蛮干一年。',
      '破了这一层，往后每一分力气都得用在刀刃上。组歇、睡眠、吃食，一样不许马虎。',
      '好。此境之名，老夫记下了。昭告天下也无妨——但炫耀一分，练十分。'
    ]
    this.setData({
      breakOn: true, breakLv: lv,
      breakEyebrow: eyebrow,
      breakRealm: hasRealm ? REALM_AT[evs.realm[evs.realm.length - 1]] : (cul.realm || ''),
      breakNote: (cul.realmNote || '') + (hasImage ? ' · 形象已随阶段焕新' : ''),
      breakParts: parts,
      breakComment: comments[Math.floor(Math.random() * comments.length)]
    })
  },
  closeBreak() {
    const lv = this.data.breakLv
    app.globalData.breakShown = lv
    this.setData({ breakOn: false })
    app.saveUser({ breakShown: lv }).catch(() => {})
  },

  loadStreak() {
    // 修炼摘要（EXP/等级/境界/连续/今日打卡）—— 全量重放，口径与网站 gamify 一致
    app.loadCultivation(true).then(cul => {
      if (!cul) return
      this.setData({
        streak: cul.streak.cur, stageName: stageOf(cul.level).name, stageFile: stageOf(cul.level).file,

        culLevel: cul.level, culTitle: cul.title, culRealm: cul.realm,
        culExp: cul.exp,
        culPct: Math.max(0, Math.min(100, Math.round(cul.pct || 0))),
        culCur: Math.round((cul.exp || 0) - (cul.cur || 0)), culSpan: Math.round((cul.next || 0) - (cul.cur || 0)),
        culToNext: Math.round(cul.toNext || 0),
        culMaxed: cul.level >= 99
      })
      this.checkBreak(cul)
    }).catch(() => {})
    // 累计完成次数（角色阶段用）：count 不受拉取上限影响
    const db = wx.cloud.database()
    db.collection('checkins').where({ _openid: app.globalData.openid, trained: true }).count()
      .then(r => {
        const total = (r && r.total) || 0
        const st = stageOf(this.data.culLevel || 1)
        this.setData({ totalTrained: total, stageName: st.name, stageFile: st.file })
      }).catch(() => {})
  },

  /* ───── 今日恢复卡：睡眠 + 补水（写入当日 checkin 的 sleepHours/waterMl，
     与网站 recoveryCard 同款；结算口径「睡够7h」「喝水达标」都算修为）───── */
  loadRecovery() {
    const db = wx.cloud.database()
    db.collection('checkins').where({ _openid: app.globalData.openid, date: todayStr() }).get()
      .then(res => {
        const ck = (res.data || [])[0] || {}
        this.setData({ sleepHours: Number(ck.sleepHours) || 0, waterMl: Number(ck.waterMl) || 0, doneToday:(ck.exercises||[]).some(e=>(e.log||[]).some(s=>s.done)) })
      }).catch(() => {})
  },
  saveRecovery(patch) {
    const db = wx.cloud.database()
    const date = todayStr()
    db.collection('checkins').where({ _openid: app.globalData.openid, date }).get()
      .then(res => {
        if (res.data.length) return db.collection('checkins').doc(res.data[0]._id).update({ data: patch })
        const base = { date, dayIndex: this.data.dayIndex, trained: false, dietOk: false,
          waterMl: 0, sleepHours: 0, weight: '', note: '', exercises: [], dietLog: [] }
        return db.collection('checkins').add({ data: Object.assign(base, patch) })
      })
      .then(() => { if (app.loadCultivation) app.loadCultivation(true) })
      .catch(() => wx.showToast({ title: '记录失败', icon: 'none' }))
  },
  setSleep(e) {
    const h = Number(e.currentTarget.dataset.h)
    this.setData({ sleepHours: h })
    this.saveRecovery({ sleepHours: h })
    wx.showToast({ title: h >= 7 ? '✓ ' + h + ' 小时，达标' : h + ' 小时，7 小时起有加成', icon: 'none' })
  },
  addWater(e) {
    const w = this.data.waterMl + Number(e.currentTarget.dataset.w)
    this.setData({ waterMl: w })
    this.saveRecovery({ waterMl: w })
  },
  clearWater() {
    this.setData({ waterMl: 0 })
    this.saveRecovery({ waterMl: 0 })
  },

  go(e) { require('../../utils/navigation.js').go(e.currentTarget.dataset.url) },
  goTab(e) { require('../../utils/navigation.js').go(e.currentTarget.dataset.url) },
  goToday() { wx.switchTab({ url: '/pages/today/today' }) },
  goProfile() { wx.switchTab({ url: '/pages/profile/profile' }) },
  goAssess() { wx.navigateTo({ url: '/pages/assess/assess' }) },

  copyWx() {
    wx.setClipboardData({ data: 'Ethan888168', success: () => wx.showToast({ title: '微信号已复制，去加我领计划', icon: 'none' }) })
  }
})
