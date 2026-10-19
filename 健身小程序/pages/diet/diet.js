const app = getApp()
const calc = require('../../utils/calc.js')
const dietLib = require('../../utils/diet.js')
const kb = require('../../utils/kb.js')
const records = require('../../utils/diet-records.js')
const macro=require('../../utils/macro.js'),checks=require('../../utils/checkins-store.js'),feedback=require('../../utils/diet-feedback.js'),pro=require('../../utils/pro.js')

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

require('../../utils/page.js')(Object.assign({},require('../../utils/diet-reference-controller.js'),{
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
    const diet = calc.energyPlan(g.profile, macro.combinedAdj(ds))
    const history7 = (ds.history || []).slice(-7).map(h => h.type)
    const mode = (g.profile && g.profile.dietMode) || (g.plan && g.plan.dietMode) || 'simple'
    // 「今天吃什么」：菜谱模式给具体菜品+用量；简化模式给每餐克数+食材换算
    let dayPlan = null
    try { dayPlan = dietLib.buildDay(diet, mode, { seed: daySeed() }) } catch (e) { dayPlan = null }
    // 三餐参考（2026-10-19 与网站 refMeals 同逻辑：主食+蛋白+蔬菜+油脂组合，复合营养折算）
    const refMeals = this.buildRefMeals(diet)
    this.setData({
      profile:g.profile, refMeals, refTotal:dietLib.referenceSum(refMeals.reduce((a,m)=>a.concat(m.items),[])), diet, dietMode: mode, dayPlan,
      energy: {
        bmr: diet.bmr, factor: diet.activity.factor, actName: diet.activity.name,
        tdee: diet.tdee, targetKcal: diet.targetKcal, deficit: diet.deficit, warn: diet.warn
      },
      dietState: { carbAdj: ds.carbAdj || 0, proteinAdj: ds.proteinAdj || 0, lastType: ds.lastType || '' },
      history7, breakdown:macro.breakdown(ds), member:pro.memberOf(g), proDiet:pro.isPro(g)?pro.dietPlan(g.profile,diet,{method:require('../../utils/method.js')}):null
    })
    this.loadActual()
    this.loadTrend()
  },

  // ───── 三餐参考（与网站 diet.js refMeals 同步；改一边必须改另一边）─────
  loadTrend(){const owner=app.globalData.openid;this.setData({trendLoading:true,trendError:false});return checks.all(owner).then(rows=>{this._history=rows;this.paintReview();this.setData({trendLoading:false})}).catch(()=>this.setData({trendLoading:false,trendError:true}))},
  paintReview(){const g=app.globalData,r=macro.review({checkins:this._history||[],profile:g.profile,dietState:g.dietState,today:todayStr()});let after=null;if(r.ready&&r.action){const ds=macro.apply(r,g.dietState);after=calc.energyPlan(g.profile,macro.combinedAdj(ds))}this.setData({pointPct:Math.min(100,Math.max(0,((r.progress||{}).havePoints||0)/((r.progress||{}).needPoints||4)*100)),dayPct:Math.min(100,Math.max(0,((r.progress||{}).haveDays||0)/((r.progress||{}).needDays||7)*100)),review:r,trendPct:r.trend?macro.round(r.trend.perWeekPct*100,2):0,after,breakdown:macro.breakdown(g.dietState),hungerToday:(g.dietState||{}).hungerToday||null})},
  applyTrend(){this.applyMacro()},
  async applyMacro(){if(this.data.adjustBusy)return;const g=app.globalData,r=macro.review({checkins:this._history||[],profile:g.profile,dietState:g.dietState,today:todayStr()});if(!r.ready||!r.action){wx.showToast({title:'当前没有可应用的调整',icon:'none'});return}const next=macro.apply(r,g.dietState);this.setData({adjustBusy:true});try{await app.saveUser({dietState:next});g.dietState=next;this.refresh();wx.showToast({title:'已应用本次饮食调整',icon:'none'})}catch(e){wx.showToast({title:'保存失败，请重试',icon:'none'})}finally{this.setData({adjustBusy:false})}},
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

  async setHunger(e){if(this.data.adjustBusy)return;const g=app.globalData,next=feedback.hunger(g.dietState,e.currentTarget.dataset.v,todayStr());this.setData({adjustBusy:true});try{await app.saveUser({dietState:next});g.dietState=next;this.refresh();wx.showToast({title:'今天的反馈已更新',icon:'none'})}catch(err){wx.showToast({title:'保存失败，请重试',icon:'none'})}finally{this.setData({adjustBusy:false})}},
  loadActual(){const date=this.data.viewDate||records.dateStr();this.setData({actualLoading:true,actualError:false});return records.load(app.globalData.openid,date).then(rows=>{if(this.data.viewDate!==date)return;const log=(rows[0]||{}).dietLog||[];this.setData(Object.assign({actualLoading:false},require('../../utils/presentation.js').dietSummary(log,this.data.diet)))}).catch(()=>{if(this.data.viewDate===date)this.setData({actualLoading:false,actualError:true})})},
  openFoodPanel(e){wx.navigateTo({url:'/pages/food/food?meal='+e.currentTarget.dataset.k+'&date='+this.data.viewDate})},
  dateChange(e){this.setData({viewDate:e.detail.value});this.loadActual()},
  shiftDate(e){const d=new Date(this.data.viewDate+'T12:00:00');d.setDate(d.getDate()+Number(e.currentTarget.dataset.d));const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');this.setData({viewDate:date});this.loadActual()},
  toggleReference(){wx.navigateTo({url:'/pages/mealref/mealref'})},
  recalcReference(){try{this.readEdits()}catch(e){wx.showToast({title:e.message,icon:'none'})}},
  toggleBasis(){this.setData({basisOpen:!this.data.basisOpen})},
  toggleAdjust(){this.setData({adjustOpen:!this.data.adjustOpen})},
  toggleAdvanced(){this.setData({advancedOpen:!this.data.advancedOpen})},
  goPro(){wx.navigateTo({url:'/subpkgs/tools/pages/pro/pro'})},
  goAssess() { wx.navigateTo({ url: '/pages/assess/assess' }) }
}))
