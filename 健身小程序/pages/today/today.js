const app = getApp()
const kb = require('../../utils/kb.js')
const calc = require('../../utils/calc.js')
const progression=require('../../utils/progression.js')
const cardioLog=require('../../utils/cardio.js'),checkinsStore=require('../../utils/checkins-store.js')
const restTimer = require('../../utils/rest-timer.js')
const macro=require('../../utils/macro.js'),pro=require('../../utils/pro.js'),method=require('../../utils/method.js')

// 体质 → 今日宜忌（取自概念库，合规措辞：宜忌/建议/信号，无诊断/处方）
const TIP_MAP = {
  pinghe: { name: '平和质', tip: '保持规律就好，有氧+力量均衡，不必刻意加量。' },
  qixu: { name: '气虚质', tip: '今天训练到微汗即止，忌力竭、忌空腹练；练后腹部若有下坠感应减强度。' },
  yangxu: { name: '阳虚质', tip: '宜晨练晒太阳、温和有氧；运动后立即保暖，忌冰饮冷水浴。' },
  yinxu: { name: '阴虚质', tip: '避开闷热暴汗，选通风处中低强度并及时补水；练完烦躁失眠=壮火食气信号。' },
  tanshi: { name: '痰湿质', tip: '今天少甜少油少奶茶，餐后散步15分钟助运化；多做有氧微汗排湿。' },
  shire: { name: '湿热质', tip: '饮食清淡利湿（绿豆苦瓜冬瓜），忌辛辣烧烤火锅熬夜；避暴汗。' },
  qiyu: { name: '气郁质', tip: '练前先调息内关稳住情绪，避免过度撸铁疏肝反而耗气；胸闷肋骨胀先调情绪。' }
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shiftDate(s, off) {
  const d = new Date(s + 'T00:00:00')
  d.setDate(d.getDate() + off)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function setCount(setsStr) {
  const m = String(setsStr).match(/(\d+)\s*[×xX]/)
  return m ? parseInt(m[1]) : 3
}
function extractOid(gif) {
  const url = (Array.isArray(gif) ? gif[0] : gif) || ''
  const m = String(url).match(/\/exercises\/([^/]+)\//) ||
            String(url).match(/\/ex\/([^/]+)\//) ||
            String(url).match(/\/assets\/exdb\/([^/]+)\.jpg$/) ||
            String(url).match(/\/assets\/gif\/([^/]+)\.gif$/i)
  return m ? m[1] : ''
}

// —— 重量/次数滚轮选项 ——
const WEIGHT_OPTIONS = (function () {
  const a = [0]                                   // 0 = 自重（无器械动作）
  for (let w = .5; w <= 300.0001; w += .5) a.push(Math.round(w * 10) / 10)
  return a
})()
const REP_OPTIONS = (function () {
  const a = []
  for (let r = 1; r <= 180; r++) a.push(r)
  return a
})()

// 参考起步重量：按「动作角色 × 体重 × 经验 × 器械」粗估，只作滚轮默认值 + 灰字提示，用户可随意改
function suggestWeight(profile, ex) {
  return require('../../utils/pro.js').estimateW8(ex,profile || {})
}

// 旧计划动作名 → 最新动作名（中文名变化导致匹配失败时兜底）
const NAME_ALIAS = {
  '屈腿硬拉正面': '杠铃硬拉',
  '负重躬身': '早安式',
  '坐姿并握划船': '坐姿绳索划船',
  '直立划船': '史密斯机直立划船',
  '颈后下拉': '宽握背阔下拉',
  '哑铃交替大锤牧师凳弯举': '哑铃交替锤式弯举',
  '绳索坐姿后侧平举': '绳索坐姿侧平举',
  'EZ杆滚动飞鸟': '自重飞鸟',
  '杠铃地面飞鸟': '自重飞鸟'
}
function fuzzyMatch(name, exdb) {
  if (!name || !exdb || !exdb.length) return null
  if (NAME_ALIAS[name]) {
    const hit = exdb.find(x => x.name === NAME_ALIAS[name])
    if (hit) return hit
  }
  const keywords = name.replace(/[\(\)\[\]（）]/g, ' ').split(/\s+|·/)
    .map(s => s.trim()).filter(s => s.length >= 2)
  let best = null, bestScore = 0
  exdb.forEach(e => {
    const score = keywords.reduce((sum, k) => sum + (e.name.includes(k) ? 1 : 0), 0)
    if (score > bestScore) { bestScore = score; best = e }
  })
  return bestScore >= 2 ? best : null
}

// 角色的英文键（用于 wxss 类名，避免中文类名）
const ROLE_KEY = { 主项: 'main', 辅助: 'assist', 孤立: 'iso', 核心: 'core' }

// 把计划里某动作（oid 优先，名字/旧gif兜底）映射成带最新图/要领的展示对象
// role/rest/rpe/pattern 由新引擎给出（主项/辅助/孤立/核心），老计划没有这些字段时给安全默认值
function mapExercise(e, exdb, profile) {
  let hit = exdb.find(x=>x.name===e.name) || null
  if (!hit && e.oid) hit = exdb.find(x => x.gif && x.gif[0] && x.gif[0].includes('/' + e.oid + '/'))
  if (!hit) hit = exdb.find(x => x.name === e.name)
  if (!hit && e.gif) {
    const oid = extractOid(e.gif)
    if (oid) hit = exdb.find(x => x.gif && x.gif[0] && x.gif[0].includes('/' + oid + '/'))
  }
  if (!hit) hit = fuzzyMatch(e.name, exdb)
  const out = {
    oid: (hit && extractOid(hit.gif)) || e.oid || '',
    name: hit ? hit.name : e.name,
    sets: e.sets,
    gif: hit ? hit.gif : e.gif,
    equipment: hit ? hit.equipment : (e.equipment || ''),
    points: hit ? hit.points : (e.points || ''),
    role: e.role || '',
    roleKey: ROLE_KEY[e.role] || '',
    rest: e.rest || 0,
    rpe: e.rpe || '',
    pattern: e.pattern || '',
    homeFallback: !!e.homeFallback,
    custom: !!e.custom,
    expanded: false,
    log: Array.from({ length: setCount(e.sets) }, () => ({ weight: '', reps: '', done: false }))
  }
  out.suggest = suggestWeight(profile, out)
  return out
}

require('../../utils/page.js')({
  data: {
    autoRest:true, settingsOpen:false, methodOpen:false, proOpen:false, progressDone:0, progressTotal:0, journalHistory:[],
    loaded: false, hasPlan: false, dayIndex: 0, dayOffset: 0, viewDate: '', isToday: true,
    relLabel: '今天', cycleLabel: '', microLen: 1,
    tcmTip: null, isRest: false, restNote: '', focus: '',
    exercises: [], dietTarget: '', dietLog: [], dietConsumed: '',
    calTarget: 0, macroTarget: {},
    learn: null, learnOpen: false,
    trained: false, waterMl: 0, sleepHours: 0, waterTarget: 0,
    weight: '', note: '', savedTip: false, weekTip: null,
    foodInput: '', foodResults: [],
    foodCats: [], foodCat: '蛋白', foodGrid: [],
    showFoodForm: false,
    cf: { name: '', grams: '100', showNutri: false, kcal: '', protein: '', carbs: '', fat: '', fiber: '' },
    exInput: '', exResults: [],
    // 动作库选择弹层（与网站 openPicker 同款）
    pk: { on: false, mode: 'add', cats: [], cat: '全部', q: '', list: [], tip: '' },
    // —— 完整版训练内容 ——
    cardioTypes:cardioLog.TYPES,cardioTypeIndex:0,cardioMinutes:'',cardioExtra:false,cardioRecord:null,cardioSaving:false,week: 1, deload: false, srcTag: '', warmup: null, warmupOpen: true, mainNote: '', cardio: null,
    // —— 饮食双模式 + 进度 ——
    dietMode: 'simple', progress: [],
    // —— 重量/次数滚轮 ——
    showWheel: false, wheelValue: [0, 0], wheelSet: 0, wheelEx: 0, wheelExName: '',
    wheelSuggest: 0, weightOptions: WEIGHT_OPTIONS, repOptions: REP_OPTIONS,
    wheelTarget: '',   // '' = 普通组；'fm' = 专注模式重量/次数
    // —— 专注训练全屏 ——
    fm: { on: false, exName: '', gif: '', equipment: '', points: '', ei: 0, si: 0, totalSets: 1, weight: '', reps: '', restLeft: 0, restLabel: '' },
    mealTabs: [{ k: 'b', name: '早餐' }, { k: 'l', name: '午餐' }, { k: 'd', name: '晚餐' }, { k: 's', name: '加餐' }],
    curMeal: 'b', mealPanel: 'lib', panelList: [], mealGroups: [], mealTpls: [], freqFoods: [], recentFoods: [],
    swapMode: false,
    // 练前自评浮层（与网站同款）
    preOn: false, preDims: [], preTotal: 12
  },

  onLoad(){
    const original=this.setData.bind(this)
    this.setData=(data,cb)=>{original(data,cb);if(Object.keys(data).some(k=>/^exercises|^waterMl$|^sleepHours$|^weight$|^trained$/.test(k))){this.updateProgress(original);if(this._checkinReadyDate===this.data.viewDate)this.persistDraft()}}
    this.setData({autoRest:wx.getStorageSync('lbgym_autoRest')!==false,methodRows:[
      ['目标与组次','按目标、经验和动作角色安排，具体组次以今日动作卡为准。'],['主项阶梯',method.MAIN_LADDER.join(' → ')],['组间休息',Object.keys(method.REST).map(k=>k+' '+method.REST[k]+'秒').join(' · ')],['休息原则',method.REST_NOTE],['核心收尾',method.CORE.note||'核心动作按计划收尾，不额外堆量。'],['减载规则','每 '+method.DELOAD.everyWeeks+' 轮减载，工作组数 ×'+method.DELOAD.setsFactor+'；重量维持。']].map(x=>({name:x[0],text:x[1]}))})
  },
  updateProgress(set){const rows=(this.data.exercises||[]).flatMap(e=>e.log||[]).filter(s=>s.type!=='warmup'),done=rows.filter(s=>s.done).length;(set||this.setData.bind(this))({progressTotal:rows.length,progressDone:done,progressPct:rows.length?Math.round(done/rows.length*100):0})},
  draftKey(){const g=app.globalData;return 'lbgym_training_draft_'+g.openid+'_'+progression.scope(g.plan||{})+'_'+this.data.viewDate},
  persistDraft(){if(this._checkinReadyDate!==this.data.viewDate)return;try{wx.setStorageSync(this.draftKey(),{at:Date.now(),exercises:this.data.exercises,waterMl:this.data.waterMl,sleepHours:this.data.sleepHours,weight:this.data.weight,trained:this.data.trained})}catch(e){if(!this._draftWarn){this._draftWarn=true;wx.showToast({title:'本机草稿未保存，请保存云端打卡',icon:'none'})}}},
  restoreDraft(saved){const d=saved;if(!d||!Array.isArray(d.exercises))return;this.setData({exercises:this.decorateProgression(d.exercises.map(e=>Object.assign({},e,mapExercise(e,kb.EX,app.globalData.profile),{log:e.log,expanded:!!e.expanded,target:e.target,progressReady:e.progressReady})),this._progressHistory),waterMl:d.waterMl||0,sleepHours:d.sleepHours||0,weight:d.weight||'',trained:!!d.trained,draftSaved:true})},
  toggleAutoRest(e){const autoRest=!!e.detail.value;wx.setStorageSync('lbgym_autoRest',autoRest);this.setData({autoRest})},
  toggleFold(e){const k=e.currentTarget.dataset.k;this.setData({[k]:!this.data[k]})},
  goPro(){wx.navigateTo({url:'/subpkgs/tools/pages/pro/pro'})},
  goSecret(e){wx.navigateTo({url:'/pages/secret/secret?id='+(e.currentTarget.dataset.id||'')})},
  enterStrength(){this.setData({warmupOpen:false});wx.pageScrollTo({selector:'#strength',duration:200})},
  onShow() {
    const date=app.globalData.trainingDate;if(date){delete app.globalData.trainingDate;this.setData({dayOffset:Math.round((new Date(date+'T00:00:00')-new Date(todayStr()+'T00:00:00'))/86400000)})}
    this.restoreRest()
    if (this.getTabBar) this.getTabBar().setData({ selected: 1 })
    this.load()
  },

  load() {
    const g = app.globalData
    if (!g.openid) { this.render(); setTimeout(() => this.load(), 300); return }
    if (!g.profile) { app.loadUser().then(() => { this.render(); this.loadWeek() }).catch(() => this.render()); return }
    this.render(); this.loadWeek()
  },

  render() {
    this.persistDraft(); this._checkinReadyDate=null
    const g = app.globalData
    this.syncCustomFoods()
    this.applyTcmTip()
    if (!g.plan) { this.setData({ loaded: true, hasPlan: false }); return }
    const plan = g.plan
    const profile = g.profile
    const today = todayStr()
    let baseIdx = calc.dayIndexFromStart(plan.cycleStart, today)
    if (baseIdx < 0) baseIdx = 0
    let idx = baseIdx + this.data.dayOffset
    if (idx < 0) idx = 0
    const viewDate = shiftDate(today, this.data.dayOffset)
    const microLen = (plan.micro && plan.micro.length) || 1
    const off = this.data.dayOffset
    const relLabel = off === 0 ? '今天' : (off > 0 ? `${off}天后` : `${-off}天前`)
    const day = kb.dayContent(plan, idx, profile, plan.home)
    // 动作编辑持久化（2026-10-16 用户反馈「删了明天又回来」）：本机按循环槽位记住删/换
    const logical=kb.schedulePosition(plan,idx).index
    const slotN = ((logical % microLen) + microLen) % microLen
    this._slotN = slotN
    const de = this.readDayEdit(plan, slotN)
    const planEx = (day.exercises || [])
      .filter(e => (de.del || []).indexOf(e.name) < 0)
      .map(e => {
        const sw = (de.swap || {})[e.name]
        if (!sw) return e
        return Object.assign({}, e, { oid: sw.oid || '', name: sw.name, sets: sw.sets || e.sets, custom: !!sw.custom })
      })
    const dietState = app.globalData.dietState || { carbAdj: 0, proteinAdj: 0 }
    // 锚定 TDEE 的每日方案：BMR × 活动系数 = 每日消耗 → ± 目标缺口 = 热量目标 → 碳水补齐差额
    const m = calc.energyPlan(profile, macro.combinedAdj(dietState))
    const cal = m.kcal
    const common = {
      member:pro.memberOf(g), loaded: true, hasPlan: true, dayIndex: idx, dayOffset: off, viewDate,
      isToday: off === 0, relLabel, microLen,
      energy: {
        bmr: m.bmr, factor: m.activity.factor, actName: m.activity.name,
        tdee: m.tdee, deficit: m.deficit, warn: m.warn
      },
      dietTarget: `消耗 ${m.tdee}kcal（基础代谢 ${m.bmr} × ${m.activity.factor}）→ 目标 ${cal}kcal · 蛋白${m.protein}g · 碳水${m.carb}g · 脂肪${m.fat}g`,
      calTarget: cal, macroTarget: m,
      dietMode: profile.dietMode || (plan && plan.dietMode) || 'simple',
      dietState: { carbAdj: dietState.carbAdj || 0, proteinAdj: dietState.proteinAdj || 0, lastType: dietState.lastType || '' },
      waterTarget: calc.round(profile.weight * 30),
      learn: kb.LEARN[((idx % 28) + 28) % 28], learnOpen: false
    }
    if (day.type === 'rest') {
      this.setData(Object.assign(common, {
        isRest: true, restNote: day.note, focus: day.focus || '休息日',
        exercises: [], warmup: null, cardio: null, mainNote: '', srcTag: '',
        week: day.week || 1, deload: false,
        cycleLabel: plan.micro ? `第 ${idx + 1} 天 · 循环第${Math.floor(logical / microLen) + 1}周 · 第${(logical % microLen) + 1}/${microLen}单元` : `第 ${idx + 1} 天`
      }))
      this.loadFlow(); this.recalcDiet(); this.loadCheckin(viewDate, idx); return
    }
    const exdb = kb.EX || []
    const exercises = planEx.map(e => {const ex=mapExercise(e,exdb,profile),ts=(profile||{}).todayState||{},recovery=!!day.deload||(ts.date===viewDate&&!['ok','good'].includes(ts.key)),t=progression.targetFor(ex,plan,this._progressHistory||[],viewDate,recovery);if(t){ex.target=t;ex.sets=t.sets+'×'+t.reps+(t.kind==='time'?'秒':'');ex.suggest=t.weight;ex.log=Array.from({length:t.sets},()=>({weight:t.weight,reps:t.reps,done:false,type:'work'}))}return ex})
    this.setData(Object.assign(common, {
      isRest: false, focus: day.focus, exercises:this.decorateProgression(exercises,this._progressHistory||[],viewDate),
      week: day.week || 1, deload: !!day.deload, srcTag: day.src || '',
      warmup: day.warmup || {minutes:8},warmupRows:require('../../utils/training-flow-data.js').warmup(day), mainNote: (kb.METHOD && kb.METHOD.MAIN_NOTE) || '',
      cardio: day.cardio || {type:'轻松活动',detail:'力量后按恢复情况选做，能正常说话的强度',note:'疲劳或不适时跳过有氧。'},
      cycleLabel: plan.micro ? `第 ${idx + 1} 天 · 循环第${Math.floor(logical / microLen) + 1}周 · 第${(logical % microLen) + 1}/${microLen}单元 · ${day.focus}` : `第 ${idx + 1} 天`
    }))
    this.loadFlow(); this.recalcDiet(); this.loadCheckin(viewDate, idx)
    this.restoreRest()
    this.maybePrecheck(viewDate, false)
  },

  // ───── 练前「内视」自评（2026-10-17 与网站同款）：每天一次，只建议不强制 ─────
  precheckKey(date) {
    const u = app.globalData.openid || 'demo'
    return 'lbgym_precheck_' + u + '_' + date
  },
  maybePrecheck(viewDate, isRest) {
    if (isRest || viewDate !== todayStr()) return
    let done = false
    try { done = !!wx.getStorageSync(this.precheckKey(viewDate)) } catch (e) {}
    if (done) return
    this.setData({
      preOn: true,
      preDims: [
        { k: 'sleep', label: '昨晚睡眠', lo: '彻夜难眠', hi: '一觉天明', v: 3 },
        { k: 'energy', label: '今日精力', lo: '像被抽干', hi: '电力满格', v: 3 },
        { k: 'ache', label: '筋骨酸痛', lo: '酸软如泥', hi: '毫无疲态', v: 3 },
        { k: 'will', label: '训练意愿', lo: '完全不想动', hi: '战意盎然', v: 3 }
      ],
      preTotal: 12
    })
  },
  preChanging(e) {
    const i = Number(e.currentTarget.dataset.i)
    const v = Number(e.detail.value)
    const key = `preDims[${i}].v`
    this.setData({ [key]: v }, () => {
      const s = this.data.preDims.reduce((a, d) => a + d.v, 0)
      this.setData({ preTotal: s })
    })
  },
  preSubmit() {
    const dims = this.data.preDims
    const s = dims.reduce((a, d) => a + d.v, 0)
    const tired = s <= 10 || dims.some(d => d.v === 1)
    const peak = s >= 16 && dims.every(d => d.v >= 3)
    const key = tired ? 'tired' : peak ? 'peak' : 'ok'
    const title = tired ? '疲劳态 · 建议减量' : peak ? '气血充盈 · 可冲' : '阴阳平和 · 常态'
    const text = tired
      ? '神魂或筋骨不在线——今日建议主项减 1-2 组、重量降一成，练完拉伸就收工。玄衡：硬撑大重量必遭反噬，留得青山在。'
      : peak
        ? '状态正盛——今日可按计划照常完成，主项有余力就安心加一点。玄衡：给你脸你就接着，往死里推！'
        : '状态平稳——按部就班完成今日功法即可，修行贵在日拱一卒。玄衡：别贪，也别躲。'
    try { wx.setStorageSync(this.precheckKey(todayStr()), JSON.stringify({ dims, s, key })) } catch (e) {}
    this.setData({ preOn: false })
    if (key === 'tired') {
      const g = app.globalData
      const p = Object.assign({}, g.profile || {}, { todayState: { date: todayStr(), key: 'tired' } })
      g.profile = p
      app.saveUser({ profile: p }).catch(() => {})
    }
    // 2026-10-18 线上复查（与网站同步）：不再弹第二层，结果用 toast 带一句
    wx.showToast({ title: title + ' · ' + (key === 'tired' ? '完整版今日处方自动降一成' : '按计划开练'), icon: 'none', duration: 2500 })
  },

  // —— 天数导航 ——
  prevDay() {
    const plan = app.globalData.plan
    const base = calc.dayIndexFromStart(plan.cycleStart, todayStr())
    const newOff = this.data.dayOffset - 1
    if (base + newOff < 0) return
    this.setData({ dayOffset: newOff }); this.render()
  },
  nextDay() { this.setData({ dayOffset: this.data.dayOffset + 1 }); this.render() },
  backToToday() { this.setData({ dayOffset: 0 }); this.render() },
  skipToTrain() {
    const plan = app.globalData.plan, profile = app.globalData.profile
    const base = calc.dayIndexFromStart(plan.cycleStart, todayStr())
    const off = this.data.dayOffset
    let idx = Math.max(0, base + off)
    for (let k = 1; k <= (plan.micro ? plan.micro.length : 28) + 1; k++) {
      const d = kb.dayContent(plan, idx + k, profile, plan.home)
      if (d.type === 'train') { this.setData({ dayOffset: off + k }); this.render(); return }
    }
  },

  loadCheckin(viewDate, idx) {
    this._checkinReadyDate = null
    const db = wx.cloud.database()
    const plan=app.globalData.plan,before=JSON.stringify(this.data.exercises.map(e=>e.log)),draftBefore=wx.getStorageSync(this.draftKey())
    db.collection('checkins').where({_openid:app.globalData.openid,date:db.command.lte(viewDate)}).orderBy('date','desc').limit(100).get()
      .then(res => {
        if(this.data.viewDate!==viewDate||app.globalData.plan!==plan)return
        this._progressHistory=res.data||[]
        const c=(res.data||[]).find(x=>x.date===viewDate)||{exercises:[]}
        const historical=viewDate<todayStr()&&(c.exercises||[]).length?c.exercises.map(e=>Object.assign(mapExercise(e,kb.EX,app.globalData.profile),{target:progression.cleanTarget(e.target)})):this.data.exercises
        const prescriptions=pro.isPro(app.globalData)?pro.applyState({exercises:historical},app.globalData.profile,this._progressHistory,((app.globalData.profile.todayState||{}).date===viewDate?(app.globalData.profile.todayState||{}).key:'ok')||'ok').list:[]
        const ex = historical.map((e,i) => {
          if(prescriptions[i]){const p=prescriptions[i];e.prescription=p;e.suggest=p.weight}
          if(JSON.stringify(this.data.exercises.map(x=>x.log))!==before)return e
          // 优先按 oid 匹配（改动作库/改名字也不会丢历史），名字兜底
          let rec = e.oid ? (c.exercises || []).find(x => x.oid && x.oid === e.oid) : null
          if (!rec) rec = (c.exercises || []).find(x => x.name === e.name)
          if (rec && rec.log && rec.log.length) {
            e.log=rec.log.map(s=>({weight:s.weight===0?0:(s.weight||''),reps:s.reps||'',done:!!s.done,type:s.type==='warmup'?'warmup':'work'}))
            e.target=progression.cleanTarget(rec.target);e.progressReady=!!rec.progressReady;e.sets=rec.sets||e.sets
          }else{const ts=(app.globalData.profile||{}).todayState||{},t=progression.targetFor(e,plan,this._progressHistory,viewDate,!!this.data.deload||(ts.date===viewDate&&!['ok','good'].includes(ts.key)));if(t){e.target=t;e.sets=t.sets+'×'+t.reps+(t.kind==='time'?'秒':'');e.log=Array.from({length:t.sets},()=>({weight:t.weight,reps:t.reps,done:false,type:'work'}));e.suggest=t.weight}else if(e.prescription){const p=e.prescription;e.log=Array.from({length:p.setsN},()=>({weight:p.weight,reps:p.reps,done:false,type:'work'}))}}
          return e
        })
        this.setData({
          journalHistory:res.data||[], exercises:this.decorateProgression(ex,this._progressHistory), dietLog: c.dietLog || [],
          cardioRecord:cardioLog.estimate(c.cardio),cardioCompleted:!!cardioLog.clean(c.cardio),cardioMinutes:c.cardio?String(c.cardio.minutes):'',cardioExtra:!!(c.cardio&&c.cardio.extra),cardioTypeIndex:Math.max(0,cardioLog.TYPES.findIndex(t=>t.key===(c.cardio||{}).type)),trained: !!c.trained, waterMl: c.waterMl || 0, sleepHours: c.sleepHours || 0,
          weight: c.weight ? String(c.weight) : '', note: c.note || ''
        })
        this.recalcDiet()
        this._checkinReadyDate = viewDate
        this._checkinBaseline = JSON.parse(JSON.stringify({date:viewDate,dietLog:this.data.dietLog,dietOk:this.data.dietOk,waterMl:this.data.waterMl,sleepHours:this.data.sleepHours,weight:this.data.weight,note:this.data.note}))
        this.restoreDraft(draftBefore);const first=this.data.exercises.findIndex(e=>(e.log||[]).some(s=>!s.done));if(first>=0)this.setData({['exercises['+first+'].expanded']:true});this.updateProgress()
      }).catch(() => { if(this.data.viewDate===viewDate)wx.showToast({title:'记录加载失败，请重新进入后保存',icon:'none'}) })
  },

  toggleExpand(e) {
    const i = e.currentTarget.dataset.i
    const k = `exercises[${i}].expanded`
    this.setData({ [k]: !this.data.exercises[i].expanded })
  },
  setLog(e) {
    const { i, j, f } = e.currentTarget.dataset
    const k = `exercises[${i}].log[${j}].${f}`
    this.setData({ [k]: e.detail.value })
  },
  toggleSetDone(e) {
    const { i, j } = e.currentTarget.dataset
    const k = `exercises[${i}].log[${j}].done`
    const nowDone = !this.data.exercises[i].log[j].done
    this.setData({ [k]: nowDone })
    // 组间倒计时（2026-10-16 与网站同步）：勾完一组自动开始；最后一个动作的最后一组不响
    if (nowDone) {
      const ex = this.data.exercises[i]
      const isLastSet = j >= ex.log.length - 1
      const isLastEx = i >= this.data.exercises.length - 1
      if (this.data.autoRest && !(isLastSet && isLastEx)) {
        this.startRest(ex.rest || 120, `${ex.name} · 第 ${Number(j) + 1} 组完成`)
      }
    }
  },

  /** 组间倒计时浮条：勾组自动开始 / +30s / 跳过；到点震动提醒。
   *  2026-10-18 线上复查修复：剩余时间按「截止时间戳」存本机 —— 切页/刷新/杀进程回来都能接着跑
   *  （旧版 onHide 直接清零，切去饮食再回训练倒计时就没了）。 */
  startRest(sec,label){restTimer.connect(app.globalData.openid);restTimer.start(sec,label);this.restoreRest()},
  restTick(){const t=restTimer.current();this.setData({restLeft:t?t.left:0,restTotal:t?t.total:0,restDisplay:t?t.time:'00:00',restPhase:t?t.phase:'',restRunning:!!(t&&t.run),restLabel:t?t.label:'',timerActive:!!t,timerKind:t?t.kind||'rest':'rest'})},
  restoreRest(){restTimer.connect(app.globalData.openid);if(!this._restUnsub)this._restUnsub=restTimer.subscribe(t=>this.setData({restLeft:t?t.left:0,restTotal:t?t.total:0,restDisplay:t?t.time:'00:00',restPhase:t?t.phase:'',restRunning:!!(t&&t.run),restLabel:t?t.label:'',timerActive:!!t,timerKind:t?t.kind||'rest':'rest'}));this.restTick()},
  addRest30(){restTimer.add()},
  pauseRest(){restTimer.toggle()},
  skipRest(){restTimer.end()},
  clearRestTimer(){if(this._restUnsub){this._restUnsub();this._restUnsub=null}},
  onUnload(){this.persistDraft();this.clearRestTimer();this.fmStop()},
  onHide(){this.persistDraft();this.clearRestTimer();this.fmStop()},

  // ───── 专注训练全屏（2026-10-16 用户需求：带着用户一起练）─────
  // 大倒计时 + 动作大图 + 当前组重量/次数步进 + 「完成这一组」= 打勾并进入休息倒计时
  fmOpen(e) {
    // 入口：①休息浮条「专注训练」→ 从第一个未完成组开始 ②动作要领区 → 从该动作开始
    const ds = e && e.currentTarget ? e.currentTarget.dataset : {}
    const explicit = ds.name !== undefined || ds.i !== undefined
    const fromI = ds.name !== undefined ? this.data.exercises.findIndex(x=>x.name===ds.name) : Number(ds.i)
    const selected = explicit && this.data.exercises[fromI]
    const timer=restTimer.current()
    const timerName=timer&&String(timer.label||'').split(' · 第')[0]
    const resumeI=this.data.exercises.findIndex(x=>x.name===timerName)
    const cur = selected ? {ei:fromI,si:Math.max(0,selected.log.findIndex(s=>!s.done))} : (explicit ? null : this.nextSet(Math.max(0,resumeI),true))
    if (!cur) { wx.showToast({ title: '今天的组都完成了 ✓', icon: 'none' }); return }
    this._fmCur = cur
    if(this.getTabBar && this.getTabBar())this.getTabBar().setData({focusMode:true})
    this.setData(Object.assign({ fm: this.fmData(cur) }, this.fmPrefill(cur) || {}))
    if(this._fmIv)clearInterval(this._fmIv)
    this._fmIv = setInterval(() => this.fmPaint(), 1000)
  },
  /** 专注模式空重量预填（双写 log：只写显示的话，完成这一组重量就丢了） */
  fmPrefill(cur) {
    const ex = this.data.exercises[cur.ei]
    if (!ex) return null
    const s = ex.log[cur.si] || {}
    if ((s.weight === '' || s.weight === null || s.weight === undefined) && ex.suggest) {
      const patch = {}
      patch['exercises[' + cur.ei + '].log[' + cur.si + '].weight'] = String(ex.suggest)
      return patch
    }
    return null
  },
  nextSet(fromI, wrap) {
    const exs = this.data.exercises
    for (let i = fromI; i < exs.length; i++) {
      const j = exs[i].log.findIndex(s => !s.done)
      if (j >= 0) return { ei: i, si: j }
    }
    if (wrap) {
      for (let i = 0; i < fromI && i < exs.length; i++) {
        const j = exs[i].log.findIndex(s => !s.done)
        if (j >= 0) return { ei: i, si: j }
      }
    }
    return null
  },
  fmData(cur) {
    const ex = this.data.exercises[cur.ei]
    const s = ex.log[cur.si] || {}
    const gifArr = Array.isArray(ex.gif) ? ex.gif : (ex.gif ? [ex.gif] : [])
    return {
      on: true, ei: cur.ei, si: cur.si,
      exName: ex.name, gif: gifArr, media:[{id:ex.name+'|'+gifArr.join('|'),frames:gifArr}], equipment: ex.equipment || '',
      points: ex.points || '',
      totalSets:ex.log.length,unit:ex.target&&ex.target.kind==='time'?'秒':'次',weightStep:ex.target?ex.target.step:2.5,hasRack:!!(ex.target&&ex.target.weights.length),
      // 空重量预填参考重量（2026-10-18 用户截图反馈同款问题：初始「自重」，±2.5 从 0 起跳太难调）
      weight: (s.weight !== '' && s.weight !== null && s.weight !== undefined) ? s.weight : (ex.suggest ? String(ex.suggest) : ''),
      reps: s.reps || String((String(ex.sets).split(/[×x]/i)[1] || '10').trim()),
      suggest: ex.suggest || 0,
      restLeft: this.data.restLeft || 0, restLabel: this.data.restLabel || ''
    }
  },
  fmPaint() {
    if (!this.data.fm || !this.data.fm.on) return
    this.setData({ 'fm.restLeft': this.data.restLeft || 0, 'fm.restLabel': this.data.restLabel || '' })
  },
  fmAdj(e) {
    const { f, d } = e.currentTarget.dataset
    const cur = this._fmCur
    if (!cur) return
    const ex = this.data.exercises[cur.ei]
    const s = ex.log[cur.si]
    if (f === 'weight') {
      const base = s.weight === '' ? (Number(ex.suggest) || 0) : Number(s.weight)
      const v = progression.adjustWeight(ex.target,base,Number(d),2.5)
      this.setData({ ['exercises[' + cur.ei + '].log[' + cur.si + '].weight']: v, 'fm.weight': v })
    } else {
      const base = s.reps === '' ? (parseInt(String(ex.sets).split(/[×x]/i)[1], 10) || 10) : Number(s.reps)
      const v = Math.max(1, Math.min(ex.target&&ex.target.kind==='time'?180:100,base+Number(d)))
      this.setData({ ['exercises[' + cur.ei + '].log[' + cur.si + '].reps']: v, 'fm.reps': v })
    }
  },
  fmDone() {
    const cur = this._fmCur
    if (!cur) return
    const ex = this.data.exercises[cur.ei]
    const isLastSet = cur.si >= ex.log.length - 1
    const isLastEx = cur.ei >= this.data.exercises.length - 1
    this.setData({['exercises['+cur.ei+'].log['+cur.si+'].weight']:this.data.fm.weight===''?0:this.data.fm.weight,['exercises['+cur.ei+'].log['+cur.si+'].reps']:this.data.fm.reps})
    // 打勾（重量/次数已在 fmAdj 里写进 log）
    this.setData({ ['exercises[' + cur.ei + '].log[' + cur.si + '].done']: true })
    if (isLastSet && isLastEx) {
      this.fmStop()
      wx.showToast({ title: '全部完成 ✓ 记得保存打卡', icon: 'none' })
      return
    }
    // 进入休息倒计时（全屏里继续显示大倒计时）
    if(this.data.autoRest)this.startRest(ex.rest || 120, `${ex.name} · 第 ${cur.si + 1} 组完成`)
    // 前进到下一个未完成组
    const nxt = this.nextSet(isLastSet ? cur.ei + 1 : cur.ei, true)
    if (nxt) {
      this._fmCur = nxt
      this.setData(Object.assign({ fm: this.fmData(nxt) }, this.fmPrefill(nxt) || {}))
    } else {
      this.fmStop()
      wx.showToast({ title: '全部完成 ✓', icon: 'none' })
    }
  },
  fmChangeSets(e) {
    const cur=this._fmCur;if(!cur)return
    const ex=this.data.exercises[cur.ei];if(!ex)return
    const log=ex.log.slice(),adding=Number(e.currentTarget.dataset.d)>0
    if(adding){if(log.length>=12){wx.showToast({title:'最多12组',icon:'none'});return}const last=log[log.length-1]||{};log.push({weight:last.weight||'',reps:last.reps||'',done:false})}
    else {const i=log.map(s=>!s.done).lastIndexOf(true);if(log.length<=1||i<0){wx.showToast({title:'保留至少一组，已完成组不删除',icon:'none'});return}log.splice(i,1);cur.si=Math.min(cur.si,log.length-1)}
    this.setData({['exercises['+cur.ei+'].log']:log,['exercises['+cur.ei+'].sets']:String(ex.sets).replace(/^\d+/,String(log.length))})
    this.setData({fm:this.fmData(cur)});this.updateProgress();this.persistDraft()
  },
  fmClose() { this.fmStop() },
  fmStop() {
    if(this.getTabBar && this.getTabBar())this.getTabBar().setData({focusMode:false})
    if (this._fmIv) { clearInterval(this._fmIv); this._fmIv = null }
    this._fmCur = null
    if (this.data.fm && this.data.fm.on) this.setData({ fm: { on: false } })
  },

  toggleWarmup(){this.setData({warmupOpen:!this.data.warmupOpen})},
  checkWarmup(e){const i=Number(e.currentTarget.dataset.i),checks=Object.assign({},this.data.warmChecks||{});checks[i]=!checks[i];this.setData({warmChecks:checks});this.saveFlow('warmup',checks)},
  flowKey(k){return 'lbgym_flow_mp_'+app.globalData.openid+'_'+this.data.viewDate+'_'+k},
  saveFlow(k,v){try{wx.setStorageSync(this.flowKey(k),v)}catch(e){wx.showToast({title:'记录保存失败，请重试',icon:'none'})}},
  loadFlow(){this.setData({warmChecks:wx.getStorageSync(this.flowKey('warmup'))||{}})},
  startWarmup(){restTimer.start((this.data.warmup.minutes||8)*60,'热身准备','warmup');this.restoreRest()},
  startCardio(e){this.setData({cardioMinutes:String(Number(e.currentTarget.dataset.seconds)/60),cardioTypeIndex:Number(e.currentTarget.dataset.seconds)===1200?3:0});restTimer.start(Number(e.currentTarget.dataset.seconds),Number(e.currentTarget.dataset.seconds)===1200?'走跑间歇':'轻松有氧','cardio',Number(e.currentTarget.dataset.seconds)===1200);this.restoreRest()},
  cardioMinutesInput(e){this.setData({cardioMinutes:e.detail.value})},
  cardioTypeChange(e){this.setData({cardioTypeIndex:Number(e.detail.value)})},
  cardioExtraChange(e){this.setData({cardioExtra:!!e.detail.value})},
  async completeCardio(){
    if(this.data.cardioSaving)return
    const date=this.data.viewDate,record=cardioLog.clean({type:cardioLog.TYPES[this.data.cardioTypeIndex].key,minutes:this.data.cardioMinutes,extra:this.data.cardioExtra,weight:app.globalData.profile.weight})
    if(!record){wx.showToast({title:'请填实际有氧时长（1–240分钟）',icon:'none'});return}
    this.setData({cardioSaving:true})
    try{await checkinsStore.patch(app.globalData.openid,date,{cardio:record});if(this.data.viewDate===date)this.setData({cardioRecord:cardioLog.estimate(record),cardioCompleted:true});wx.showToast({title:'实际有氧已保存'})}
    catch(e){wx.showToast({title:'有氧保存失败，请重试',icon:'none'})}finally{this.setData({cardioSaving:false})}
  },
  async clearCardio(){if(this.data.cardioSaving)return;const date=this.data.viewDate;this.setData({cardioSaving:true});try{await checkinsStore.patch(app.globalData.openid,date,{cardio:null});if(this.data.viewDate===date)this.setData({cardioRecord:null,cardioCompleted:false,cardioMinutes:'',cardioExtra:false})}catch(e){wx.showToast({title:'清除失败，请重试',icon:'none'})}finally{this.setData({cardioSaving:false})}},

  postponeTraining(){app.globalData.openSchedule=true;require('../../utils/navigation.js').go('/pages/plan/plan')},
  toggleProgression(e){const i=Number(e.currentTarget.dataset.i);this.setData({['exercises['+i+'].pgExpanded']:!this.data.exercises[i].pgExpanded})},
  noop() {},

  // —— 今日饮食：单输入框（打字即联想 + 没找到自行输入）——
  // 自定义食物并入搜索库（profile.customFoods 存每100g营养），下次直接搜得到
  syncCustomFoods() {
    const customs = (app.globalData.profile && app.globalData.profile.customFoods) || []
    customs.forEach(c => {
      if (!kb.FOODS.find(f => f.name === c.name)) kb.FOODS.push(c)
    })
    if (!this.data.foodCats.length) {
      this.setData({
        foodCats: kb.FOOD_CATS,
        foodGrid: kb.foodByCat(this.data.foodCat)
      })
    }
  },
  // 点分类标签 → 弹出该类食材清单
  onFoodCat(e) {
    const cat = e.currentTarget.dataset.c
    if (cat === this.data.foodCat) return
    this.setData({ foodCat: cat, foodGrid: kb.foodByCat(cat), foodInput: '', foodResults: [] })
  },
  // 点清单里的食材 → 填克数入账
  pickFoodGrid(e) {
    const f = this.data.foodGrid[e.currentTarget.dataset.i]
    this.addFoodKnown(f)
  },
  foodSearchInput(e) {
    const q = (e.detail.value || '').trim()
    this.setData({ foodInput: q, foodResults: q ? kb.searchFood(q) : [] })
  },
  pickFoodResult(e) {
    const f = this.data.foodResults[e.currentTarget.dataset.i]
    this.addFoodKnown(f)
    this.setData({ foodInput: '', foodResults: [] })
  },
  // 没搜到 → 用输入框里的字作为自定义食物名，带出克数/营养录入
  openCustomFoodFromInput() {
    const name = (this.data.foodInput || '').trim()
    if (!name) { wx.showToast({ title: '先输入食物名称', icon: 'none' }); return }
    this.setData({
      showFoodForm: true, foodInput: '', foodResults: [],
      cf: { name, grams: '100', showNutri: false, kcal: '', protein: '', carbs: '', fat: '', fiber: '' }
    })
  },
  addFoodKnown(f) {
    wx.showModal({
      title: `记录 ${f.name}（${this.mealName(this.data.curMeal)}）`,
      editable: true,
      placeholderText: '吃了多少克？(默认100)',
      success: r => {
        if (!r.confirm) return
        let grams = parseFloat(r.content)
        if (!grams || grams <= 0) grams = 100
        const k = grams / 100
        const item = {
          name: f.name, grams,
          meal: this.data.curMeal,
          kcal: Math.round(f.kcal * k),
          protein: Math.round(f.protein * k * 10) / 10,
          carbs: Math.round(f.carbs * k * 10) / 10,
          fat: Math.round(f.fat * k * 10) / 10,
          fiber: Math.round(f.fiber * k * 10) / 10
        }
        this.setData({ dietLog: this.data.dietLog.concat(item) })
        this.recalcDiet()
      }
    })
  },

  // ───── 四餐模型（2026-10-19 与网站同步：早餐/午餐/晚餐/加餐，加餐=练后餐/宵夜）─────
  MEALS: [
    { k: 'b', name: '早餐' }, { k: 'l', name: '午餐' },
    { k: 'd', name: '晚餐' }, { k: 's', name: '加餐' }
  ],
  mealName(k) { const m = this.MEALS.find(x => x.k === k); return m ? m.name : '加餐' },
  setMeal(e) {
    this.setData({ curMeal: e.currentTarget.dataset.k })
    this.paintMealPanel()
  },
  openFoodPanel(e) {
    const meal=(e&&e.currentTarget.dataset.k)||this.data.curMeal||'b'
    wx.navigateTo({url:'/pages/food/food?meal='+meal+'&date='+this.data.viewDate})
  },
  closeFoodPanel() { this.setData({ showFoodPanel: false }) },
  setMealPanel(e) {
    this.setData({ mealPanel: e.currentTarget.dataset.p })
    if (e.currentTarget.dataset.p === 'freq' || e.currentTarget.dataset.p === 'recent') this.loadFreqFoods()
    if (e.currentTarget.dataset.p === 'tpl') this.loadMealTpls()
    this.paintMealPanel()
  },
  /** 面板数据刷新（常用/最近/套餐的 wxml 数据源） */
  paintMealPanel() {
    const p = this.data.mealPanel
    if (p === 'freq') this.setData({ panelList: (this.data.freqFoods || []).map(f => ({ name: f.name, meta: '记过 ' + f.count + ' 次' })) })
    else if (p === 'recent') this.setData({ panelList: (this.data.recentFoods || []).map(f => ({ name: f.name, meta: (f._date || '').slice(5) + ' 记过' })) })
    else if (p === 'tpl') this.setData({ panelList: (this.data.mealTpls || []).map(t => ({ name: t.name, meta: t.items.length + ' 项 · ' + this.mealName(t.meal) })) })
    else this.setData({ panelList: [] })
  },
  /** 常用/最近：从云端最近 7 天打卡的 dietLog 聚合（与网站 localStorage 同逻辑，数据源不同） */
  loadFreqFoods() {
    const db = wx.cloud.database()
    const _ = db.command
    db.collection('checkins').where({
      _openid: app.globalData.openid,
      date: _.gte(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
    }).limit(20).get().then(res => {
      const rows = []
      ;(res.data || []).sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach(ck =>
        (ck.dietLog || []).forEach(f => rows.push(Object.assign({ _date: ck.date }, f))))
      // 常用：按名字聚合
      const cnt = {}
      rows.forEach(f => { cnt[f.name] = (cnt[f.name] || 0) + 1 })
      const freq = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 12).map(n => ({ name: n, count: cnt[n] }))
      // 最近：去重前 12
      const seen = new Set(), recent = []
      for (const f of rows) { if (seen.has(f.name)) continue; seen.add(f.name); recent.push(f); if (recent.length >= 12) break }
      this.setData({ freqFoods: freq, recentFoods: recent })
      this.paintMealPanel()
    }).catch(() => { this.setData({ freqFoods: [], recentFoods: [] }) })
  },
  /** 套餐（餐次模板）：本机存储，与网站同逻辑 */
  TPL_KEY: 'lbgym_mealTpl_mp',
  loadMealTpls() {
    let list = []
    try { list = JSON.parse(wx.getStorageSync(this.TPL_KEY) || '[]') } catch (e) {}
    this.setData({ mealTpls: list }); this.paintMealPanel()
  },
  tplSaveCurrent() {
    const items = this.data.dietLog.filter(f => (f.meal || 's') === this.data.curMeal)
    if (!items.length) { wx.showToast({ title: '这一餐还没有记录', icon: 'none' }); return }
    const kcal = Math.round(items.reduce((a, f) => a + (f.kcal || 0), 0))
    wx.showModal({
      title: '把这餐存成套餐',
      editable: true,
      placeholderText: '套餐名，如：我的早餐（' + items.length + ' 项 ' + kcal + 'kcal）',
      success: r => {
        if (!r.confirm) return
        const name = (r.content || '').trim() || (this.mealName(this.data.curMeal) + ' ' + todayStr().slice(5))
        let list = []
        try { list = JSON.parse(wx.getStorageSync(this.TPL_KEY) || '[]') } catch (e) {}
        list = list.filter(t => t.name !== name)
        list.unshift({ name, meal: this.data.curMeal, items, at: todayStr() })
        try { wx.setStorageSync(this.TPL_KEY, JSON.stringify(list.slice(0, 30)) ) } catch (e) {}
        this.setData({ mealPanel: 'tpl' }); this.loadMealTpls()
        wx.showToast({ title: '已存套餐「' + name + '」', icon: 'none' })
      }
    })
  },
  tplUse(e) {
    const name = e.currentTarget.dataset.n
    let list = []
    try { list = JSON.parse(wx.getStorageSync(this.TPL_KEY) || '[]') } catch (e) {}
    const t = list.find(x => x.name === name)
    if (!t) return
    const add = t.items.map(f => Object.assign({}, f, { meal: this.data.curMeal }))
    this.setData({ dietLog: this.data.dietLog.concat(add) })
    this.recalcDiet()
    wx.showToast({ title: '已套用 ' + add.length + ' 项到' + this.mealName(this.data.curMeal), icon: 'none' })
  },
  tplDel(e) {
    const name = e.currentTarget.dataset.n
    let list = []
    try { list = JSON.parse(wx.getStorageSync(this.TPL_KEY) || '[]') } catch (e) {}
    list = list.filter(t => t.name !== name)
    try { wx.setStorageSync(this.TPL_KEY, JSON.stringify(list)) } catch (e) {}
    this.loadMealTpls()
  },
  /** 点面板里的食物（常用/最近页签复用 addFoodKnown） */
  pickPanelFood(e) {
    const n = e.currentTarget.dataset.n
    const f = kb.FOODS.find(x => x.name === n) || kb.matchFood(n)
    if (!f) { wx.showToast({ title: '库里没有「' + n + '」', icon: 'none' }); return }
    this.addFoodKnown(f)
  },

  // —— 今日训练：单输入框（打字即联想 + 没找到自行输入）——
  exSearchInput(e) {
    const q = (e.detail.value || '').trim()
    this.setData({ exInput: q, exResults: q ? kb.searchEx(q) : [] })
  },
  pickExResult(e) {
    const ex = this.data.exResults[e.currentTarget.dataset.i]
    if (this._swapTarget !== undefined && this._swapTarget !== null) {
      this.applySwap(ex); return
    }
    const item = mapExercise({ name: ex.name, sets: ex.sets || '3×12', gif: ex.gif, oid: extractOid(ex.gif), custom: true }, kb.EX, app.globalData.profile)
    item.expanded = true; item.custom = true
    this.setData({ exercises: this.data.exercises.concat(item), exInput: '', exResults: [] })
    this.persistAdd(ex.name, ex.sets || '3×12', extractOid(ex.gif))
    this.save()
  },
  // 没搜到 → 用输入框里的字作为自定义动作
  addCustomExFromInput() {
    const name = (this.data.exInput || '').trim()
    if (!name) { wx.showToast({ title: '请先输入动作名', icon: 'none' }); return }
    if (this._swapTarget !== undefined && this._swapTarget !== null) {
      this.applySwap({ name, sets: '3×12', gif: '' }); return
    }
    const item = {
      name, sets: '3×12', gif: '', expanded: true, role: '辅助', pattern: '',
      rest: 120, rpe: '', custom: true,
      log: Array.from({ length: 3 }, () => ({ weight: '', reps: '', done: false }))
    }
    item.suggest = suggestWeight(app.globalData.profile, item)
    this.setData({ exercises: this.data.exercises.concat(item), exInput: '', exResults: [] })
    this.persistAdd(name, '3×12', '')
    this.save()
  },

  // ───── 动作库选择弹层（2026-10-17 与网站 openPicker 同款：搜索 + 分类 + 列表，死命令 1:1）─────
  goPoster() { wx.navigateTo({ url: '/pages/poster/poster?mode=today' }) },
  pkPaint(q, cat) {
    let lib = kb.EX
    if (!q && cat && cat !== '全部') lib = lib.filter(x => (x.partName || '其他') === cat)
    if (q) lib = kb.searchEx(q)
    this._pkList = lib
    return lib.slice(0, 80).map(x => ({
      name: x.name,
      meta: (x.partName || '') + ' · ' + (x.equipment || '') + (x.sets ? ' · ' + x.sets : '')
    }))
  },
  openPkMode(mode) {
    const cats = ['全部'].concat([...new Set(kb.EX.map(x => x.partName || '其他'))].sort())
    this.setData({
      pk: {
        on: true, mode: mode, cats: cats, cat: '全部', q: '',
        list: this.pkPaint('', '全部'),
        tip: mode === 'add'
          ? '加进来的动作会长期保留在这个训练日（每个循环都练它），卡片里可随时删除。'
          : '替换后这个训练日的循环都用新动作（本机记住）。组次保持原动作的安排。'
      }
    })
  },
  openPk(e) { this.openPkMode(e.currentTarget.dataset.mode || 'add') },
  pkCat(e) {
    const cat = e.currentTarget.dataset.cat
    this.setData({ 'pk.cat': cat, 'pk.q': '', 'pk.list': this.pkPaint('', cat) })
  },
  pkInput(e) {
    const q = (e.detail.value || '').trim()
    this.setData({ 'pk.q': q, 'pk.list': this.pkPaint(q, this.data.pk.cat) })
  },
  closePk() {
    const wasSwap = this.data.pk && this.data.pk.mode === 'swap'
    this.setData({ 'pk.on': false })
    if (wasSwap) {
      this._swapTarget = null
      this.setData({ swapMode: false })
    }
  },
  pkAdd(ex) {
    const item = mapExercise({ name: ex.name, sets: ex.sets || '3×12', gif: ex.gif, oid: extractOid(ex.gif), custom: true }, kb.EX, app.globalData.profile)
    item.expanded = true; item.custom = true
    this.setData({ exercises: this.data.exercises.concat(item) })
    this.persistAdd(ex.name, ex.sets || '3×12', extractOid(ex.gif))
    this.save()
    wx.showToast({ title: '已加入「' + ex.name + '」', icon: 'none' })
  },
  pickPk(e) {
    const x = (this._pkList || [])[e.currentTarget.dataset.i]
    if (!x) return
    if (this.data.pk.mode === 'swap') {
      this.setData({ 'pk.on': false, swapMode: false })
      this.applySwap(x)
      return
    }
    this.setData({ 'pk.on': false })
    this.pkAdd(x)
  },
  // 没找到 → 手动输入动作名（自定义动作）
  pkCustom() {
    const mode = this.data.pk.mode
    this.setData({ 'pk.on': false })
    wx.showModal({
      title: '自定义动作名', editable: true, placeholderText: '输入动作名，如：绳索面拉',
      success: res => {
        if (!res.confirm) return
        const name = (res.content || '').trim()
        if (!name) { wx.showToast({ title: '没有输入名字', icon: 'none' }); return }
        if (mode === 'swap') {
          this.setData({ swapMode: false })
          this.applySwap({ name, sets: '3×12', gif: '' })
        } else {
          this.pkAdd({ name, sets: '3×12', gif: '' })
        }
      }
    })
  },

  // ───── 换动作（本机按槽位持久）：点动作卡里的「换动作」→ 弹层选一个 → 原地替换 ─────
  swapEx(e) {
    this._swapTarget = Number(e.currentTarget.dataset.i)
    this.setData({ swapMode: true })
    this.openPkMode('swap')
  },
  applySwap(ex) {
    const i = this._swapTarget
    const src = this.data.exercises[i]
    if (!src) { this._swapTarget = null; this.setData({ swapMode: false }); return }
    const item = mapExercise({ name: ex.name, sets: src.sets, gif: ex.gif || '', oid: extractOid(ex.gif || '') }, kb.EX, app.globalData.profile)
    item.custom = src.custom
    item.expanded = true
    this.setData({ ['exercises[' + i + ']']: item, exInput: '', exResults: [], swapMode: false })
    // 本机持久：同槽位的循环日都换成这个
    const plan = app.globalData.plan
    if (plan && plan.micro && this._slotN !== undefined) {
      const de = this.readDayEdit(plan, this._slotN)
      de.swap = de.swap || {}
      de.swap[src.name] = { oid: extractOid(ex.gif || ''), name: ex.name, sets: src.sets, custom: !!src.custom }
      this.writeDayEdit(plan, this._slotN, de)
    }
    this._swapTarget = null
    this.save()
    wx.showToast({ title: '已换成「' + ex.name + '」', icon: 'none' })
  },
  cancelSwap() {
    if (this._swapTarget !== undefined && this._swapTarget !== null) {
      this._swapTarget = null
      this.setData({ swapMode: false, exInput: '', exResults: [] })
      wx.showToast({ title: '已取消换动作', icon: 'none' })
    }
  },

  // ───── 动作编辑持久化（2026-10-16 用户反馈：删了明天又回来 = 等于没有）─────
  // 删/换：本机按「循环槽位」记住（同 slot 的循环日都不再出现）；加：写 plan.slotExercises（云端持久）
  dayEditKey(plan, slotN) {
    const openid = app.globalData.openid || 'demo'
    return 'lbgym_dayedit_' + openid + '_' + (plan.cycleStart || '') + '_' + slotN
  },
  readDayEdit(plan, slotN) {
    try { return wx.getStorageSync(this.dayEditKey(plan, slotN)) || { del: [], swap: {} } } catch (e) { return { del: [], swap: {} } }
  },
  writeDayEdit(plan, slotN, de) {
    try { wx.setStorageSync(this.dayEditKey(plan, slotN), de) } catch (e) {}
  },

  // 删除今日训练动作（持久：自定义动作从计划里删，计划动作本机记住）
  removeExercise(e) {
    const i = e.currentTarget.dataset.i
    const ex = this.data.exercises[i]
    if (!ex) return
    const doDel = () => {
      const log = this.data.exercises.slice()
      log.splice(i, 1)
      this.setData({ exercises: log })
      const plan = app.globalData.plan
      if (plan && plan.micro && this._slotN !== undefined) {
        const sx = Object.assign({}, plan.slotExercises || {})
        const key = String(this._slotN)
        const list = sx[key] || []
        if (ex.custom && list.some(x => x.name === ex.name)) {
          // 秘籍挂的/搜索加的动作 → 从计划里真删（云端持久）
          sx[key] = list.filter(x => x.name !== ex.name)
          plan.slotExercises = sx
          app.globalData.plan = plan
          app.saveUser({ plan })
        } else {
          // 计划自带动作 → 本机记住「这个槽位不要它」
          const de = this.readDayEdit(plan, this._slotN)
          if (de.del.indexOf(ex.name) < 0) de.del.push(ex.name)
          this.writeDayEdit(plan, this._slotN, de)
        }
      }
      this.save()
      wx.showToast({ title: '已删 · 之后的循环也不出现', icon: 'none' })
    }
    wx.showModal({
      title: '删除「' + ex.name + '」？',
      content: '删除后这个训练日的循环里都不再有它。想加回来用清单底部的搜索框。',
      confirmText: '删除', cancelText: '留着',
      success: r => { if (r.confirm) doDel() }
    })
  },

  // 加动作 → 同时写进计划（slotExercises，云端持久，之后的循环都有）
  persistAdd(name, sets, oid) {
    const plan = app.globalData.plan
    if (!plan || !plan.micro || this._slotN === undefined) return
    const sx = Object.assign({}, plan.slotExercises || {})
    const key = String(this._slotN)
    sx[key] = (sx[key] || []).filter(x => x.name !== name)
      .concat([{ oid: oid || '', name, sets: sets || '3×12', role: '辅助', equipment: '', custom: true }])
    plan.slotExercises = sx
    app.globalData.plan = plan
    app.saveUser({ plan })
    wx.showToast({ title: '已加入 · 之后的循环都有', icon: 'none' })
  },

  // —— 自定义食物弹窗（名称已由输入框带入，仅补克数/可选营养）——
  closeFoodForm() { this.setData({ showFoodForm: false }) },
  cfInput(e) { this.setData({ ['cf.' + e.currentTarget.dataset.f]: e.detail.value }) },
  toggleCfNutri() { this.setData({ 'cf.showNutri': !this.data.cf.showNutri }) },

  markTrained() { this.setData({ trained: true }); this.save() },
  onWeight(e) { this.setData({ weight: e.detail.value }) },
  onNote(e) { this.setData({ note: e.detail.value }) },
  onWater(e) { this.setData({ waterMl: Number(e.detail.value) || 0 }) },
  onSleep(e) { this.setData({ sleepHours: Number(e.detail.value) || 0 }) },

  submitCustomFood() {
    const cf = this.data.cf
    let name = (cf.name || '').trim()
    let grams = parseFloat(cf.grams)
    // 解析「牛肉 100g / 牛肉100克」类自由输入：分离名称与克数
    const m = name.match(/(.*?)[\s]*(\d+(?:\.\d+)?)\s*(g|克|G|克)$/)
    if (m) { name = m[1].trim(); const g = parseFloat(m[2]); if (g > 0) grams = g }
    if (!name) { wx.showToast({ title: '请输入食物名称', icon: 'none' }); return }
    if (!grams || grams <= 0) grams = 100
    // 名称命中内置库 → 自动带营养
    const known = kb.matchFood(name)
    if (known) {
      const k = grams / 100
      const item = {
        name: known.name, grams,
        meal: this.data.curMeal,
        kcal: Math.round(known.kcal * k),
        protein: Math.round(known.protein * k * 10) / 10,
        carbs: Math.round(known.carbs * k * 10) / 10,
        fat: Math.round(known.fat * k * 10) / 10,
        fiber: Math.round(known.fiber * k * 10) / 10
      }
      this.setData({ dietLog: this.data.dietLog.concat(item), showFoodForm: false })
      this.recalcDiet()
      wx.showToast({ title: `已添加${known.name}·含营养`, icon: 'none' })
      return
    }
    // 未命中 → 看是否手动填了营养，否则标 unknown
    const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n }
    const hasNutri = cf.kcal !== '' && cf.protein !== ''
    const item = hasNutri
      ? { name, grams, custom: true, meal: this.data.curMeal, kcal: Math.round(num(cf.kcal) * grams / 100),
          protein: Math.round(num(cf.protein) * grams / 100 * 10) / 10,
          carbs: Math.round(num(cf.carbs) * grams / 100 * 10) / 10,
          fat: Math.round(num(cf.fat) * grams / 100 * 10) / 10,
          fiber: Math.round(num(cf.fiber) * grams / 100 * 10) / 10 }
      : { name, grams, custom: true, unknown: true, meal: this.data.curMeal, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    this.setData({ dietLog: this.data.dietLog.concat(item), showFoodForm: false })
    this.recalcDiet()
    // 记住这个自定义食物（每100g营养存进档案），下次搜索直接命中，不用再填
    if (hasNutri) {
      const profile = app.globalData.profile || {}
      const foods = profile.customFoods || []
      if (!kb.FOODS.find(f => f.name === name)) {
        const entry = { name, kcal: num(cf.kcal), protein: num(cf.protein), fat: num(cf.fat), carbs: num(cf.carbs), fiber: num(cf.fiber), custom: true }
        foods.push(entry)
        kb.FOODS.push(entry)
        profile.customFoods = foods
        app.globalData.profile = profile
        app.saveUser({ profile })
        wx.showToast({ title: '已添加并记住，下次可直接搜', icon: 'none' })
        return
      }
    }
    wx.showToast({ title: hasNutri ? '已添加并计营养' : '已记录(营养未知)', icon: 'none' })
  },
  removeFood(e) {
    const i = e.currentTarget.dataset.i
    const log = this.data.dietLog.slice()
    log.splice(i, 1)
    this.setData({ dietLog: log })
    this.recalcDiet()
  },
  clearDiet() {
    this.setData({ dietLog: [] })
    this.recalcDiet()
  },
  recalcDiet() {
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    this.data.dietLog.forEach(f => {
      t.kcal += f.kcal || 0; t.protein += f.protein || 0; t.carbs += f.carbs || 0; t.fat += f.fat || 0; t.fiber += f.fiber || 0
    })
    const total = {
      kcal: Math.round(t.kcal),
      protein: Math.round(t.protein * 10) / 10,
      carbs: Math.round(t.carbs * 10) / 10,
      fat: Math.round(t.fat * 10) / 10,
      fiber: Math.round(t.fiber * 10) / 10
    }
    const target = this.data.calTarget || 0
    const remain = target ? Math.max(0, target - total.kcal) : 0
    const hasUnknown = this.data.dietLog.some(f => f.unknown)
    // 「目标 vs 已吃」4 条进度（超额变橙）
    const mt = this.data.macroTarget || {}
    const mk = (key, label, got, tg, unit) => {
      const pct = tg > 0 ? Math.round(got / tg * 100) : 0
      return { key, label, got: Math.round(got), target: Math.round(tg || 0), unit: unit || 'g', pct, width:Math.min(100,pct), over: tg > 0 && got > tg }
    }
    const progress = [
      mk('kcal', '热量', total.kcal, mt.kcal, 'kcal'),
      mk('protein', '蛋白质', total.protein, mt.protein),
      mk('carb', '碳水', total.carbs, mt.carb),
      mk('fat', '脂肪', total.fat, mt.fat)
    ]
    // 四餐分组（每餐小计，2026-10-19 与网站同步）
    const mealGroups = [{ k: 'b', name: '早餐' }, { k: 'l', name: '午餐' }, { k: 'd', name: '晚餐' }, { k: 's', name: '加餐' }].map(m => {
      const items = this.data.dietLog.map((f, idx) => ({ f, idx })).filter(x => (x.f.meal || 's') === m.k).map(x => Object.assign({}, x.f, { _idx: x.idx }))
      return { k: m.k, name: m.name, items,
        sum: items.length ? items.length + ' 项 · ' + Math.round(items.reduce((a, f) => a + (f.kcal || 0), 0)) + ' kcal' : '还没记' }
    })
    this.setData({
      goalName:(app.globalData.profile||{}).goal||'塑形',
      mealGroups,
      calorieProgress: progress[0], nutrientProgress: progress.slice(1),
      dietRemain: Math.abs(Math.round((mt.kcal||0)-total.kcal)), dietOver:total.kcal>(mt.kcal||0),
      ringStyle:'background:conic-gradient('+(progress[0].over?'#e05252':'#df9656')+' '+Math.min(100,progress[0].pct)+'%,var(--line) 0)',
      dietTotal: total,
      progress,
      dietOk: this.data.dietLog.length > 0,
      dietConsumed: `已吃 ${total.kcal}kcal（剩 ${remain}kcal）· 蛋白${total.protein}g · 碳水${total.carbs}g · 脂肪${total.fat}g · 纤维${total.fiber}g${hasUnknown ? ' · 含未识别食物' : ''}`
    })
  },

  // —— 饮食模式切换（配好菜 / 只给克数）——
  setDietMode(e) {
    const m = e.currentTarget.dataset.m
    if (m === this.data.dietMode) return
    this.setData({ dietMode: m })
    const profile = app.globalData.profile
    if (profile) { profile.dietMode = m; app.saveUser({ profile }).catch(() => {}) }
  },

  toggleLearn() { this.setData({ learnOpen: !this.data.learnOpen }) },
  goLearnAll() { wx.navigateTo({ url: '/pages/learn/learn' }) },

  // 微饿循环：记录今日饥饿感 → 微调碳水/蛋白目标（谭成义理论）
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
      this.render()
      wx.showToast({ title: '已记录·目标已微调', icon: 'none' })
    }).catch(() => { wx.hideLoading(); this.render() })
  },
  goDiet() { require('../../utils/navigation.js').go('/pages/diet/diet') },

  // —— 重量/次数 滚轮 ——
  openWheel(e){this.showProgressWheel(Number(e.currentTarget.dataset.i),Number(e.currentTarget.dataset.j),false)},
  showProgressWheel(i,j,focus){
    const ex=this.data.exercises[i];if(!ex)return;const row=focus?this.data.fm:ex.log[j]||{},current=row.weight!==''&&row.weight!=null?Number(row.weight):Number(ex.suggest)||0,
      weights=progression.weightChoices(ex.target,current,WEIGHT_OPTIONS),reps=Number(row.reps)||12
    this.setData({showWheel:true,wheelTarget:focus?'fm':'',wheelEx:i,wheelSet:j,wheelExName:ex.name,wheelSuggest:ex.suggest||0,weightOptions:weights,wheelUnit:ex.target&&ex.target.kind==='time'?'秒':'次',wheelValue:[weights.indexOf(current),Math.max(0,REP_OPTIONS.indexOf(reps))]})
  },
  onWheelChange(e){this.setData({wheelValue:e.detail.value})},
  closeWheel(){this.setData({showWheel:false})},
  fmPickW(){if(this._fmCur)this.showProgressWheel(this._fmCur.ei,this._fmCur.si,true)},
  fmPickR(){this.fmPickW()},
  confirmWheel() {
    const v = this.data.wheelValue
    const w = this.data.weightOptions[v[0]] || 0
    const r = REP_OPTIONS[v[1]] || 12
    // 专注模式目标：写 fm 显示 + 同步写 log（只写显示不写 log 的话，完成这一组重量就丢了）
    if (this.data.wheelTarget === 'fm') {
      const cur = this._fmCur
      const patch = { showWheel: false, 'fm.weight': String(w), 'fm.reps': String(r) }
      if (cur) {
        patch['exercises[' + cur.ei + '].log[' + cur.si + '].weight'] = String(w)
        patch['exercises[' + cur.ei + '].log[' + cur.si + '].reps'] = String(r)
      }
      this.setData(patch)
      wx.showToast({ title: '已调 ' + (w === 0 ? '自重' : w + 'kg') + ' × ' + r, icon: 'none' })
      return
    }
    const i = this.data.wheelEx, j = this.data.wheelSet
    this.setData({
      [`exercises[${i}].log[${j}].weight`]: String(w),
      [`exercises[${i}].log[${j}].reps`]: String(r),
      showWheel: false
    })
    this.applyToRest(i, String(w), String(r), j)
    wx.showToast({ title: '已填 ' + (w === 0 ? '自重' : w + 'kg') + ' × ' + r + '，空组已同步', icon: 'none' })
  },
  // 把该动作其余「空着的组」填成同一值（只填空组，不覆盖已填的）
  applyToRest(i, w, r, skipJ) {
    const ex = this.data.exercises[i]
    if (!ex) return
    const upd = {}
    ex.log.forEach((s, k) => {
      if (k === skipJ) return
      const empty = v => v === '' || v === null || v === undefined
      if (empty(s.weight)) upd['exercises[' + i + '].log[' + k + '].weight'] = w
      if (empty(s.reps)) upd['exercises[' + i + '].log[' + k + '].reps'] = r
    })
    if (Object.keys(upd).length) this.setData(upd)
  },
  // 按第一组把所有组填满（用户主动覆盖）
  fillSets(e) {
    const i = Number(e.currentTarget.dataset.i)
    const ex = this.data.exercises[i]
    if (!ex || !ex.log.length) return
    const w = ex.log[0].weight, r = ex.log[0].reps
    if ((w === '' || w === null) && (r === '' || r === null)) {
      wx.showToast({ title: '先把第 1 组填上', icon: 'none' }); return
    }
    const upd = {}
    ex.log.forEach((s, k) => {
      if (k === 0) return
      upd['exercises[' + i + '].log[' + k + '].weight'] = w
      upd['exercises[' + i + '].log[' + k + '].reps'] = r
    })
    this.setData(upd)
    wx.showToast({ title: '已按第 1 组填满', icon: 'none' })
  },
  // 手动输入（滚轮兜底）
  manualInput() {
    const i = this.data.wheelEx, j = this.data.wheelSet
    this.setData({ showWheel: false })
    wx.showModal({
      title: '手动输入重量', editable: true, placeholderText: '如 52.5（留空=自重）',
      success: (r1) => {
        if (!r1.confirm) return
        const w = String(r1.content || '').trim()
        wx.showModal({
          title:'手动输入'+(this.data.wheelUnit||'次'), editable: true, placeholderText: '如 12',
          success: (r2) => {
            if (!r2.confirm) return
            const reps = String(r2.content || '').trim() || '12'
            const wv = w === '' ? '0' : w
            this.setData({
              ['exercises[' + i + '].log[' + j + '].weight']: wv,
              ['exercises[' + i + '].log[' + j + '].reps']: reps
            })
            if(this.data.wheelTarget==='fm')this.setData({'fm.weight':wv,'fm.reps':reps})
            else this.applyToRest(i,wv,reps,j)
          }
        })
      }
    })
  },
  // 改组数（同步 sets 首位数字，保持 N×M 格式）
  addSet(e) {
    const i = Number(e.currentTarget.dataset.i)
    const ex = this.data.exercises[i]
    if (!ex || ex.log.length >= 10) return
    const log = ex.log.concat([{ weight: '', reps: '', done: false }])
    this.setData({
      ['exercises[' + i + '].log']: log,
      ['exercises[' + i + '].sets']: String(ex.sets).replace(/^(\d+)/, String(log.length))
    })
  },
  decSet(e) {
    const i = Number(e.currentTarget.dataset.i)
    const ex = this.data.exercises[i]
    if (!ex || ex.log.length <= 1) return
    const log = ex.log.slice(0, ex.log.length - 1)
    this.setData({
      ['exercises[' + i + '].log']: log,
      ['exercises[' + i + '].sets']: String(ex.sets).replace(/^(\d+)/, String(log.length))
    })
  },

  save() {
    if(this._checkinReadyDate!==this.data.viewDate){wx.showToast({title:'记录尚未加载完成，请稍后保存',icon:'none'});return Promise.resolve()}
    const db = wx.cloud.database()
    const doc = {
      date: this.data.viewDate, dayIndex: this.data.dayIndex,
      trained: this.data.isRest?false:(require('../../utils/gamify.js').doneRatio(this.data.exercises)>=0.8), dietOk: this.data.dietOk,
      waterMl: this.data.waterMl || 0, sleepHours: this.data.sleepHours || 0,
      weight: this.data.weight ? Number(this.data.weight) : '',
      note: this.data.note,
      exercises: this.data.exercises.map(e => ({ oid: e.oid || '', name: e.name, sets: e.sets, role:e.role||'',target:e.target||null,progressReady:!!e.progressReady,log:e.log })),
      dietLog: this.data.dietLog
    }
    // Only fields edited here may be written. Other pages own newer nutrition/recovery data.
    const patch = JSON.parse(JSON.stringify(require('../../utils/checkin-patch.js').trainingPatch(doc, this._checkinBaseline)))
    const savedDate=doc.date
    const persist = () => db.collection('checkins').where({ _openid: app.globalData.openid, date: savedDate }).get()
      .then(res => {
        if(res.data.length>1)throw new Error('当天有重复记录，未覆盖')
        const save = () => {
          if (res.data.length) {
            return db.collection('checkins').doc(res.data[0]._id).update({ data: patch })
          }
          return db.collection('checkins').add({ data: patch })
        }
        return save()
      })
      .then(() => {
        if(this.data.viewDate!==savedDate)return
        try{wx.removeStorageSync(this.draftKey())}catch(e){}
        this._checkinBaseline=JSON.parse(JSON.stringify(doc))
        this._progressHistory=[doc].concat((this._progressHistory||[]).filter(x=>x.date!==doc.date));this.setData({exercises:this.decorateProgression(this.data.exercises,this._progressHistory)});
        this.setData({ savedTip: true }); setTimeout(() => this.setData({ savedTip: false }), 1500)
        if (app.loadCultivation) app.loadCultivation(true)   // 修炼摘要当日缓存失效（EXP 变了）
        // 双端互通：绑定了网站账号的话，把今天这条打卡镜像过去（不绑定就静默跳过）
        wx.cloud.callFunction({ name: 'webApi', data: { action: 'mpSyncCheckin', date: savedDate } })
          .catch(() => {})
      })
      .catch(err => wx.showToast({ title: '保存失败，请重试', icon: 'none' }))
    this._saveQueue = (this._saveQueue || Promise.resolve()).then(persist, persist)
    return this._saveQueue
  },

  decorateProgression(exercises,history,viewDate){const g=app.globalData,plan=g.plan,P=progression,date=viewDate||this.data.viewDate||todayStr();return exercises.map(e=>{const c=P.configFor(e,plan),s=c&&P.suggestion(e,plan,history,shiftDate(date,1));return Object.assign({},e,{pgOn:!!c,pgLabel:P.label(e.target),pgSuggestion:s&&s.target?P.label(Object.assign({},s.target,s.value)):'',pgReason:s?s.reason:'',pgSource:s&&s.date?s.date+'：'+s.summary:'',pgCanAccept:!!(s&&s.source&&s.kind!=='calibrate'&&(!c.accepted||c.accepted.source!==s.source))})})},
  pgToggleReady(e){const i=Number(e.currentTarget.dataset.i);this.setData({['exercises['+i+'].progressReady']:!!e.detail.value})},
  pgToggleWarm(e){const i=Number(e.currentTarget.dataset.i),j=Number(e.currentTarget.dataset.j);this.setData({['exercises['+i+'].log['+j+'].type']:e.detail.value?'warmup':'work'})},
  pgEdit(e){if(!this.data.isToday){wx.showToast({title:'请回到今天设置',icon:'none'});return}const i=Number(e.currentTarget.dataset.i),ex=this.data.exercises[i],P=progression,c=P.configFor(ex,app.globalData.plan),m=String(ex.sets).match(/(\d+)\s*[×x]\s*(\d+)/),kind=c?c.kind:/助力|辅助.*引体/.test(ex.name)?'assisted':/秒|平板|悬垂/.test(ex.sets+' '+ex.name)?'time':ex.equipment==='无器械'?'bodyweight':'load',kinds=['load','assisted','bodyweight','time'];this._pgPlan=app.globalData.plan;this.setData({pgOpen:true,pgIndex:i,pgName:ex.name,pgKinds:['负重动作','助力器械','自重次数','静态计时（秒）'],pgKindIndex:kinds.indexOf(kind),pgForm:{sets:c?c.sets:Number(m&&m[1])||3,min:c?c.min:kind==='time'?30:8,max:c?c.max:kind==='time'?60:12,weight:c?c.weight:0,step:c?c.step:ex.equipment==='哑铃'?1:2.5,weights:c?(c.weights||[]).join(','):''},pgHad:!!c,pgOff:false})},
  pgInput(e){this.setData({['pgForm.'+e.currentTarget.dataset.k]:e.detail.value})},pgKind(e){this.setData({pgKindIndex:Number(e.detail.value)})},pgOff(e){this.setData({pgOff:!!e.detail.value})},pgClose(){this.setData({pgOpen:false})},
  pgSave(){const g=app.globalData,plan=g.plan,P=progression,ex=this.data.exercises[this.data.pgIndex];if(plan!==this._pgPlan){wx.showToast({title:'计划已变化，请重新设置',icon:'none'});return}let c;try{if(!this.data.pgOff)c=P.normalizeConfig(Object.assign({},this.data.pgForm,{kind:['load','assisted','bodyweight','time'][this.data.pgKindIndex],id:Date.now()+'_'+Math.random().toString(36).slice(2),scope:P.scope(plan)}))}catch(err){wx.showToast({title:err.message,icon:'none'});return}const map=Object.assign({},plan.exerciseProgression);if(c)map[P.key(ex)]=c;else delete map[P.key(ex)];this.pgWrite(Object.assign({},plan,{exerciseProgression:map})).then(()=>{this.setData({pgOpen:false});let list=this.data.exercises.slice(),item=Object.assign({},list[this.data.pgIndex]);if(!item.log.some(s=>s.done)&&!(this._progressHistory||[]).some(c=>c.date===this.data.viewDate&&(c.exercises||[]).some(x=>x.name===item.name))){const t=P.targetFor(item,g.plan,this._progressHistory||[],this.data.viewDate,!!this.data.deload||((g.profile.todayState||{}).date===this.data.viewDate&&!['ok','good'].includes((g.profile.todayState||{}).key)));item.target=t;item.progressReady=false;if(!t){this.render();wx.showToast({title:'已恢复原计划',icon:'none'});return}if(t){item.sets=t.sets+'×'+t.reps+(t.kind==='time'?'秒':'');item.log=Array.from({length:t.sets},()=>({weight:t.weight,reps:t.reps,done:false,type:'work'}))}list[this.data.pgIndex]=item}this.setData({exercises:this.decorateProgression(list,this._progressHistory||[])});wx.showToast({title:'递进设置已保存',icon:'none'})}).catch(()=>wx.showToast({title:'保存失败，请重试',icon:'none'}))},
  pgWrite(plan){const g=app.globalData;return wx.cloud.database().collection('users').doc(g.openid).update({data:{plan}}).then(()=>{g.plan=plan})},
  pgAccept(e){const i=Number(e.currentTarget.dataset.i),ex=this.data.exercises[i],g=app.globalData,plan=g.plan,P=progression,c=P.configFor(ex,plan),s=c&&P.suggestion(ex,plan,this._progressHistory||[],shiftDate(this.data.viewDate,1));if(!s||!s.source)return;wx.showModal({title:'采用为下次目标？',content:P.label(Object.assign({},s.target,s.value))+'。'+s.reason+' 从本次记录之后的训练日起生效，历史不变。',success:r=>{if(!r.confirm)return;if(g.plan!==plan||P.suggestion(ex,plan,this._progressHistory||[],shiftDate(this.data.viewDate,1)).source!==s.source){wx.showToast({title:'数据已变化，请重新确认',icon:'none'});return}let next;try{next=P.accept(c,s)}catch(err){wx.showToast({title:err.message,icon:'none'});return}this.pgWrite(Object.assign({},plan,{exerciseProgression:Object.assign({},plan.exerciseProgression,{[P.key(ex)]:next})})).then(()=>wx.showToast({title:'下次目标已保存'})).catch(()=>wx.showToast({title:'保存失败',icon:'none'}))}})},
  pgUndo(e){const ex=this.data.exercises[Number(e.currentTarget.dataset.i)],g=app.globalData,P=progression,c=P.configFor(ex,g.plan);if(!c||!c.accepted){wx.showToast({title:'没有可撤销的目标',icon:'none'});return}const next=Object.assign({},c,{accepted:c.previousAccepted||null,previousAccepted:null});this.pgWrite(Object.assign({},g.plan,{exerciseProgression:Object.assign({},g.plan.exerciseProgression,{[P.key(ex)]:next})})).then(()=>wx.showToast({title:'已撤销，记录保留',icon:'none'})).catch(()=>wx.showToast({title:'保存失败',icon:'none'}))},

  goAssess() { wx.navigateTo({ url: '/pages/assess/assess' }) },
  goCoach() { wx.navigateTo({ url: '/pages/coach/coach' }) },

  applyTcmTip() {
    const g = app.globalData
    const key = (g.tcmResult && g.tcmResult.main) || g.constitution
    const m = key ? TIP_MAP[key] : null
    this.setData({ tcmTip: m ? { name: m.name, tip: m.tip } : null })
  },
  goTcm() { require('../../utils/navigation.js').go('/pages/tcm/tcm') },

  loadWeek() {
    const db = wx.cloud.database()
    const _ = db.command
    const now = new Date()
    const past = new Date(now.getTime() - 6 * 24 * 3600 * 1000)
    const since = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
    db.collection('checkins').where({ _openid: app.globalData.openid, date: _.gte(since) })
      .orderBy('date', 'asc').limit(20).get()
      .then(res => this.buildWeekTip(res.data))
      .catch(() => {})
  },
  buildWeekTip(list) {
    if (!list || !list.length) { this.setData({ weekTip: null }); return }
    const trainedDays = list.filter(c => c.trained)
    const n = trainedDays.length
    const sleeps = list.filter(c => c.sleepHours)
    const avgSleep = sleeps.length ? sleeps.reduce((s, c) => s + c.sleepHours, 0) / sleeps.length : 0
    const tips = []
    if (n >= 5) tips.push(`最近7天练了${n}天，安排1天休息更利恢复——过度消耗会掏肾精（肾藏精），越练越虚。`)
    else if (n <= 2) tips.push(`最近7天只练了${n}天，保持每周3-4次节奏更利增肌。`)
    if (avgSleep && avgSleep < 7) tips.push(`最近平均睡眠${avgSleep.toFixed(1)}小时偏短，恢复不足（心主神），练后调息内关助眠。`)
    if (tips.length) this.setData({ weekTip: tips })
    else this.setData({ weekTip: ['节奏不错，继续保持——练后及时食养、睡好，增肌恢复两不误。'] })
  }
})
