const app = getApp()
const calc = require('../../utils/calc.js')
const dietLib = require('../../utils/diet.js')
const kb = require('../../utils/kb.js')
const records = require('../../utils/diet-records.js')

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

require('../../utils/page.js')({
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
    if(this.getTabBar&&this.getTabBar())this.getTabBar().setData({selected:2})
    if(!this.data.viewDate)this.setData({viewDate:records.dateStr()})
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
      refMeals, refTotal:dietLib.referenceSum(refMeals.reduce((a,m)=>a.concat(m.items),[])), diet, dietMode: mode, dayPlan,
      energy: {
        bmr: diet.bmr, factor: diet.activity.factor, actName: diet.activity.name,
        tdee: diet.tdee, targetKcal: diet.targetKcal, deficit: diet.deficit, warn: diet.warn
      },
      dietState: { carbAdj: ds.carbAdj || 0, proteinAdj: ds.proteinAdj || 0, lastType: ds.lastType || '' },
      history7
    })
    this.loadActual()
    this.loadTrend()
  },

  // ───── 三餐参考（与网站 diet.js refMeals 同步；改一边必须改另一边）─────
  saveReferenceProfile(p){return wx.cloud.database().collection('users').doc(app.globalData.openid).update({data:{profile:p}})},
  refKey(){return 'lbgym_reference_mp_'+app.globalData.openid+'_'+dietLib.referenceBasis(app.globalData.profile)},
  buildRefMeals(e){try{const saved=wx.getStorageSync(this.refKey());if(saved&&saved.length===4)return saved.map(m=>Object.assign({},m,{sum:dietLib.referenceSum(m.items)}))}catch(err){};return dietLib.buildReference(e)},
  refEdit(e){const mi=e.currentTarget.dataset.mi,i=e.currentTarget.dataset.i;this._edits=this._edits||{};this._edits[mi+':'+i]=e.detail.value},
  readEdits(){const meals=JSON.parse(JSON.stringify(this.data.refMeals));Object.keys(this._edits||{}).forEach(k=>{const [mi,i]=k.split(':').map(Number),v=this._edits[k],g=Number(v);if(v===''||!Number.isFinite(g)||g<0||g>5000)throw new Error('请填写0–5000克');meals[mi].items[i].g=g});meals.forEach(m=>m.sum=dietLib.referenceSum(m.items));this._edits={};this.setData({refMeals:meals,refTotal:dietLib.referenceSum(meals.reduce((a,m)=>a.concat(m.items),[]))});return meals},
  refSave(){try{const meals=this.readEdits();wx.setStorageSync(this.refKey(),meals);wx.showToast({title:'已保存参考，未计入摄入',icon:'none'})}catch(e){wx.showToast({title:e.message||'保存失败',icon:'none'})}},
  refAsTarget(){let meals;try{meals=this.readEdits()}catch(e){wx.showToast({title:e.message,icon:'none'});return}const t=dietLib.referenceSum(meals.reduce((a,m)=>a.concat(m.items),[]));if(t.k<=0){wx.showToast({title:'全天参考不能为零',icon:'none'});return}wx.showModal({title:'设为每日目标？',content:'替换档案估算目标，不计入实际摄入，可随时恢复。',success:r=>{if(!r.confirm)return;const p=Object.assign({},app.globalData.profile,{dietReferenceTarget:{basis:dietLib.referenceBasis(app.globalData.profile),kcal:t.k,protein:t.p,carb:t.c,fat:t.f}});this.saveReferenceProfile(p).then(()=>{app.globalData.profile=p;wx.setStorageSync(this.refKey(),meals);this.refresh();wx.showToast({title:'每日目标已更新'})}).catch(()=>wx.showToast({title:'目标保存失败，请重试',icon:'none'}))}})},
  refReset(){const p=Object.assign({},app.globalData.profile);delete p.dietReferenceTarget;this.saveReferenceProfile(p).then(()=>{app.globalData.profile=p;this.refresh();wx.showToast({title:'已恢复档案目标'})}).catch(()=>wx.showToast({title:'恢复失败，请重试',icon:'none'}))},
  refLog(e){let meals;try{meals=this.readEdits()}catch(err){wx.showToast({title:err.message,icon:'none'});return}const m=meals.find(x=>x.meal===e.currentTarget.dataset.k);if(!m||this._recording)return;wx.showModal({title:'确认实际吃的 · '+m.name,content:'按编辑份量追加 '+Math.round(m.sum.k)+' kcal。已有记录保留，请避免重复记入。',success:r=>{if(!r.confirm||this._recording)return;this._recording=true;const add=m.items.filter(x=>x.g>0).map(x=>{const f={name:x.name,grams:x.g,meal:m.meal};['kcal','protein','carbs','fat','fiber'].forEach(k=>f[k]=Math.round((x[k]||0)*x.g/100*10)/10);return f});records.mutate(app.globalData.openid,this.data.viewDate||records.dateStr(),log=>log.concat(add)).then(()=>{this.loadActual();wx.showToast({title:'已记入实际摄入'})}).catch(err=>wx.showToast({title:err.message||'保存失败，请重试',icon:'none'})).then(()=>{this._recording=false})}})},

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

  loadActual(){const date=this.data.viewDate||records.dateStr();this.setData({actualLoading:true,actualError:false});return records.load(app.globalData.openid,date).then(rows=>{if(this.data.viewDate!==date)return;const log=(rows[0]||{}).dietLog||[];this.setData(Object.assign({actualLoading:false},require('../../utils/presentation.js').dietSummary(log,this.data.diet)))}).catch(()=>{if(this.data.viewDate===date)this.setData({actualLoading:false,actualError:true})})},
  openFoodPanel(e){wx.navigateTo({url:'/pages/food/food?meal='+e.currentTarget.dataset.k+'&date='+this.data.viewDate})},
  dateChange(e){this.setData({viewDate:e.detail.value});this.loadActual()},
  shiftDate(e){const d=new Date(this.data.viewDate+'T12:00:00');d.setDate(d.getDate()+Number(e.currentTarget.dataset.d));const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');this.setData({viewDate:date});this.loadActual()},
  toggleReference(){this.setData({referenceOpen:!this.data.referenceOpen})},
  recalcReference(){try{this.readEdits()}catch(e){wx.showToast({title:e.message,icon:'none'})}},
  toggleBasis(){this.setData({basisOpen:!this.data.basisOpen})},
  toggleAdjust(){this.setData({adjustOpen:!this.data.adjustOpen})},
  goAssess() { wx.navigateTo({ url: '/pages/assess/assess' }) }
})
