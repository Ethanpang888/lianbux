const app = getApp()
const kb = require('../../utils/kb.js')
const calc = require('../../utils/calc.js')

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
  for (let w = 2.5; w <= 120.0001; w += 2.5) a.push(Math.round(w * 10) / 10)
  return a
})()
const REP_OPTIONS = (function () {
  const a = []
  for (let r = 1; r <= 30; r++) a.push(r)
  return a
})()

// 参考起步重量：按「动作角色 × 体重 × 经验 × 器械」粗估，只作滚轮默认值 + 灰字提示，用户可随意改
function suggestWeight(profile, ex) {
  const p = profile || {}
  const w = Number(p.weight) || 70
  const base = (ex.role === '主项' ? 0.50 : ex.role === '辅助' ? 0.30 : 0.12) * w
  const expK = { 新手: 0.6, 进阶: 0.8, 熟练: 1.0 }[p.exp] || 0.6
  const eqK = {
    杠铃: 1, 器械: 0.9, 绳索: 0.5, 哑铃: 0.4, 壶铃: 0.5,
    瑞士球: 0.3, 弹力带: 0.2, 无器械: 0
  }[ex.equipment] || 0.5
  return Math.max(0, Math.round(base * expK * eqK / 2.5) * 2.5)
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
  let hit = null
  if (e.oid) hit = exdb.find(x => x.gif && x.gif[0] && x.gif[0].includes('/' + e.oid + '/'))
  if (!hit) hit = exdb.find(x => x.name === e.name)
  if (!hit && e.gif) {
    const oid = extractOid(e.gif)
    if (oid) hit = exdb.find(x => x.gif && x.gif[0] && x.gif[0].includes('/' + oid + '/'))
  }
  if (!hit) hit = fuzzyMatch(e.name, exdb)
  const out = {
    oid: e.oid || (hit && extractOid(hit.gif)) || '',
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

Page({
  data: {
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
    week: 1, deload: false, srcTag: '', warmup: null, mainNote: '', cardio: null,
    // —— 饮食双模式 + 进度 ——
    dietMode: 'simple', progress: [],
    // —— 重量/次数滚轮 ——
    showWheel: false, wheelValue: [0, 0], wheelSet: 0, wheelEx: 0, wheelExName: '',
    wheelSuggest: 0, weightOptions: WEIGHT_OPTIONS, repOptions: REP_OPTIONS,
    wheelTarget: '',   // '' = 普通组；'fm' = 专注模式重量/次数
    // —— 专注训练全屏 ——
    fm: { on: false, exName: '', gif: '', equipment: '', points: '', ei: 0, si: 0, totalSets: 1, weight: '', reps: '', restLeft: 0, restLabel: '' },
    swapMode: false,
    // 练前自评浮层（与网站同款）
    preOn: false, preDims: [], preTotal: 12
  },

  onShow() {
    if (this.getTabBar) this.getTabBar().setData({ selected: 1 })
    this.load()
  },

  load() {
    const g = app.globalData
    if (!g.openid) { setTimeout(() => this.load(), 300); return }
    if (!g.profile) { app.loadUser().then(() => { this.render(); this.loadWeek() }).catch(() => this.render()); return }
    this.render(); this.loadWeek()
  },

  render() {
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
    if (idx < 0) { idx = 0; this.setData({ dayOffset: -baseIdx }) }
    const viewDate = shiftDate(today, this.data.dayOffset)
    const microLen = (plan.micro && plan.micro.length) || 1
    const off = this.data.dayOffset
    const relLabel = off === 0 ? '今天' : (off > 0 ? `${off}天后` : `${-off}天前`)
    const day = kb.dayContent(plan, idx, profile, plan.home)
    // 动作编辑持久化（2026-10-16 用户反馈「删了明天又回来」）：本机按循环槽位记住删/换
    const slotN = ((idx % microLen) + microLen) % microLen
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
    const m = calc.energyPlan(profile, dietState)
    const cal = m.kcal
    const common = {
      loaded: true, hasPlan: true, dayIndex: idx, dayOffset: off, viewDate,
      isToday: off === 0, relLabel, microLen,
      energy: {
        bmr: m.bmr, factor: m.activity.factor, actName: m.activity.name,
        tdee: m.tdee, deficit: m.deficit, warn: m.warn
      },
      dietTarget: `消耗 ${m.tdee}kcal（基础代谢 ${m.bmr} × ${m.activity.factor}）→ 目标 ${cal}kcal · 蛋白${m.protein}g · 碳水${m.carb}g · 脂肪${m.fat}g`,
      calTarget: cal, macroTarget: m,
      dietMode: profile.dietMode || (plan && plan.dietMode) || 'simple',
      dietState: { carbAdj: dietState.carbAdj || 0, proteinAdj: dietState.proteinAdj || 0, lastType: dietState.lastType || '' },
      waterTarget: calc.round(profile.weight * 35),
      learn: kb.LEARN[((idx % 28) + 28) % 28], learnOpen: false
    }
    if (day.type === 'rest') {
      this.setData(Object.assign(common, {
        isRest: true, restNote: day.note, focus: '休息日',
        exercises: [], warmup: null, cardio: null, mainNote: '', srcTag: '',
        week: day.week || 1, deload: false,
        cycleLabel: plan.micro ? `第 ${idx + 1} 天 · 循环第${Math.floor(idx / microLen) + 1}周 · 第${(idx % microLen) + 1}/${microLen}单元` : `第 ${idx + 1} 天`
      }))
      this.recalcDiet(); this.loadCheckin(viewDate, idx); return
    }
    const exdb = kb.EX || []
    const exercises = planEx.map(e => mapExercise(e, exdb, profile))
    this.setData(Object.assign(common, {
      isRest: false, focus: day.focus, exercises,
      week: day.week || 1, deload: !!day.deload, srcTag: day.src || '',
      warmup: day.warmup || null, mainNote: (kb.METHOD && kb.METHOD.MAIN_NOTE) || '',
      cardio: day.cardio || null,
      cycleLabel: plan.micro ? `第 ${idx + 1} 天 · 循环第${Math.floor(idx / microLen) + 1}周 · 第${(idx % microLen) + 1}/${microLen}单元 · ${day.focus}` : `第 ${idx + 1} 天`
    }))
    this.recalcDiet(); this.loadCheckin(viewDate, idx)
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
    const db = wx.cloud.database()
    db.collection('checkins').where({ _openid: app.globalData.openid, date: viewDate }).get()
      .then(res => {
        if (!res.data.length) return
        const c = res.data[0]
        const ex = this.data.exercises.map(e => {
          // 优先按 oid 匹配（改动作库/改名字也不会丢历史），名字兜底
          let rec = e.oid ? (c.exercises || []).find(x => x.oid && x.oid === e.oid) : null
          if (!rec) rec = (c.exercises || []).find(x => x.name === e.name)
          if (rec && rec.log && rec.log.length) {
            // 历史组数可能与当前不一致：以当前组数为准，逐组回填
            e.log = e.log.map((s, k) => rec.log[k] ? { weight: rec.log[k].weight || '', reps: rec.log[k].reps || '', done: !!rec.log[k].done } : s)
          }
          return e
        })
        this.setData({
          exercises: ex, dietLog: c.dietLog || [],
          trained: !!c.trained, waterMl: c.waterMl || 0, sleepHours: c.sleepHours || 0,
          weight: c.weight ? String(c.weight) : '', note: c.note || ''
        })
        this.recalcDiet()
      }).catch(() => {})
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
      if (!(isLastSet && isLastEx)) {
        this.startRest(ex.rest || 120, `${ex.name} · 第 ${Number(j) + 1} 组完成`)
      }
    }
  },

  /** 组间倒计时浮条：勾组自动开始 / +30s / 跳过；到点震动提醒。
   *  2026-10-18 线上复查修复：剩余时间按「截止时间戳」存本机 —— 切页/刷新/杀进程回来都能接着跑
   *  （旧版 onHide 直接清零，切去饮食再回训练倒计时就没了）。 */
  restKey() { return 'lbgym_rest_' + (app.globalData.openid || 'demo') + '_' + todayStr() },
  startRest(sec, label) {
    this.clearRestTimer()
    const total = Math.max(30, Math.min(600, Number(sec) || 120))
    this.setData({ restLeft: total, restTotal: total, restLabel: label || '组间休息' })
    try { wx.setStorageSync(this.restKey(), { left: total, deadline: Date.now() + total * 1000, label: label || '组间休息' }) } catch (e) {}
    this._rt = setInterval(() => this.restTick(), 1000)
  },
  restTick() {
    const left = this.data.restLeft - 1
    if (left <= 0) {
      this.clearRestTimer()
      this.setData({ restLeft: 0 })
      try { wx.removeStorageSync(this.restKey()) } catch (e) {}
      try { wx.vibrateShort({ type: 'heavy' }) } catch (e) { /* 老机型无参 */ }
      wx.showToast({ title: '休息结束，下一组！', icon: 'none' })
    } else this.setData({ restLeft: left })
  },
  /** 恢复本机未过期的休息计时（onShow/render 时调；没有就不显示，保持「不常驻」原则） */
  restoreRest() {
    if (this.data.restLeft > 0 || this._rt) return
    let st = null
    try { st = wx.getStorageSync(this.restKey()) } catch (e) { return }
    if (!st || !st.deadline) return
    const left = Math.ceil((st.deadline - Date.now()) / 1000)
    if (left <= 0) { try { wx.removeStorageSync(this.restKey()) } catch (e) {}; return }
    this.setData({ restLeft: left, restTotal: st.left || left, restLabel: st.label || '组间休息' })
    this._rt = setInterval(() => this.restTick(), 1000)
  },
  addRest30() {
    if (this.data.restLeft > 0) {
      const left = this.data.restLeft + 30
      this.setData({ restLeft: left, restTotal: this.data.restTotal + 30 })
      try {
        const st = wx.getStorageSync(this.restKey())
        if (st) wx.setStorageSync(this.restKey(), { left: st.left, deadline: Date.now() + left * 1000, label: st.label })
      } catch (e) {}
    }
  },
  skipRest() {
    this.clearRestTimer(); this.setData({ restLeft: 0 })
    try { wx.removeStorageSync(this.restKey()) } catch (e) {}
  },
  clearRestTimer() { if (this._rt) { clearInterval(this._rt); this._rt = null } },
  onUnload() { this.clearRestTimer(); this.fmStop() },
  // 2026-10-18：不再清零 —— 切页只是停表，storage 里的截止时间留着，onShow 由 restoreRest 接着跑
  onHide() { this.clearRestTimer(); this.fmStop() },

  // ───── 专注训练全屏（2026-10-16 用户需求：带着用户一起练）─────
  // 大倒计时 + 动作大图 + 当前组重量/次数步进 + 「完成这一组」= 打勾并进入休息倒计时
  fmOpen(e) {
    // 入口：①休息浮条「专注训练」→ 从第一个未完成组开始 ②动作要领区 → 从该动作开始
    const fromI = e && e.currentTarget && e.currentTarget.dataset.i !== undefined
      ? Number(e.currentTarget.dataset.i) : 0
    const cur = this.nextSet(fromI, true)
    if (!cur) { wx.showToast({ title: '今天的组都完成了 ✓', icon: 'none' }); return }
    this._fmCur = cur
    this.setData(Object.assign({ fm: this.fmData(cur) }, this.fmPrefill(cur) || {}))
    this._fmIv = setInterval(() => this.fmPaint(), 400)
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
      exName: ex.name, gif: gifArr, equipment: ex.equipment || '',
      points: ex.points || '',
      totalSets: ex.log.length,
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
      const v = Math.max(0, Math.min(180, Math.round((base + Number(d) * 2.5) * 10) / 10))
      this.setData({ ['exercises[' + cur.ei + '].log[' + cur.si + '].weight']: v, 'fm.weight': v })
    } else {
      const base = s.reps === '' ? (parseInt(String(ex.sets).split(/[×x]/i)[1], 10) || 10) : Number(s.reps)
      const v = Math.max(1, Math.min(50, base + Number(d)))
      this.setData({ ['exercises[' + cur.ei + '].log[' + cur.si + '].reps']: v, 'fm.reps': v })
    }
  },
  fmDone() {
    const cur = this._fmCur
    if (!cur) return
    const ex = this.data.exercises[cur.ei]
    const isLastSet = cur.si >= ex.log.length - 1
    const isLastEx = cur.ei >= this.data.exercises.length - 1
    // 打勾（重量/次数已在 fmAdj 里写进 log）
    this.setData({ ['exercises[' + cur.ei + '].log[' + cur.si + '].done']: true })
    if (isLastSet && isLastEx) {
      this.fmStop()
      wx.showToast({ title: '全部完成 ✓ 记得保存打卡', icon: 'none' })
      return
    }
    // 进入休息倒计时（全屏里继续显示大倒计时）
    this.startRest(ex.rest || 120, `${ex.name} · 第 ${cur.si + 1} 组完成`)
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
  fmClose() { this.fmStop() },
  fmStop() {
    if (this._fmIv) { clearInterval(this._fmIv); this._fmIv = null }
    this._fmCur = null
    if (this.data.fm && this.data.fm.on) this.setData({ fm: { on: false } })
  },

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
      title: `记录 ${f.name}`,
      editable: true,
      placeholderText: '吃了多少克？(默认100)',
      success: r => {
        if (!r.confirm) return
        let grams = parseFloat(r.content)
        if (!grams || grams <= 0) grams = 100
        const k = grams / 100
        const item = {
          name: f.name, grams,
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
      ? { name, grams, custom: true, kcal: Math.round(num(cf.kcal) * grams / 100),
          protein: Math.round(num(cf.protein) * grams / 100 * 10) / 10,
          carbs: Math.round(num(cf.carbs) * grams / 100 * 10) / 10,
          fat: Math.round(num(cf.fat) * grams / 100 * 10) / 10,
          fiber: Math.round(num(cf.fiber) * grams / 100 * 10) / 10 }
      : { name, grams, custom: true, unknown: true, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
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
      const pct = tg > 0 ? Math.min(100, Math.round(got / tg * 100)) : 0
      return { key, label, got: Math.round(got), target: Math.round(tg || 0), unit: unit || 'g', pct, over: tg > 0 && got > tg * 1.05 }
    }
    const progress = [
      mk('kcal', '热量', total.kcal, mt.kcal, 'kcal'),
      mk('protein', '蛋白质', total.protein, mt.protein),
      mk('carb', '碳水', total.carbs, mt.carb),
      mk('fat', '脂肪', total.fat, mt.fat)
    ]
    this.setData({
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
  goDiet() { wx.navigateTo({ url: '/pages/diet/diet' }) },

  // —— 重量/次数 滚轮 ——
  openWheel(e) {
    const i = Number(e.currentTarget.dataset.i)
    const j = Number(e.currentTarget.dataset.j)
    const ex = this.data.exercises[i]
    if (!ex) return
    const cur = ex.log[j] || {}
    const hasW = cur.weight !== '' && cur.weight !== null && cur.weight !== undefined
    const hasR = cur.reps !== '' && cur.reps !== null && cur.reps !== undefined
    const wIdx = hasW ? Math.max(0, WEIGHT_OPTIONS.indexOf(Number(cur.weight))) : Math.max(0, WEIGHT_OPTIONS.indexOf(ex.suggest || 0))
    const rIdx = hasR ? Math.max(0, REP_OPTIONS.indexOf(Number(cur.reps))) : 11   // 默认 12 次
    this.setData({
      showWheel: true, wheelEx: i, wheelSet: j, wheelExName: ex.name,
      wheelSuggest: ex.suggest || 0,
      wheelValue: [wIdx, rIdx]
    })
  },
  onWheelChange(e) { this.setData({ wheelValue: e.detail.value }) },
  closeWheel() { this.setData({ showWheel: false }) },
  /* 专注模式：点重量/次数值 → 复用滚轮直选（不用一下下点 +2.5；卧推直接滚到自己的重量） */
  fmPickW() {
    const fm = this.data.fm || {}
    const hasW = fm.weight !== '' && fm.weight !== null && fm.weight !== undefined
    const wIdx = hasW ? Math.max(0, WEIGHT_OPTIONS.indexOf(Number(fm.weight))) : Math.max(0, WEIGHT_OPTIONS.indexOf(Number(fm.suggest || 0)))
    const rIdx = fm.reps ? Math.max(0, REP_OPTIONS.indexOf(Number(fm.reps))) : 11
    this.setData({ showWheel: true, wheelTarget: 'fm', wheelEx: -1, wheelSet: -1, wheelExName: fm.exName || '', wheelSuggest: Number(fm.suggest || 0), wheelValue: [wIdx, rIdx] })
  },
  fmPickR() {
    const fm = this.data.fm || {}
    const wIdx = (fm.weight !== '' && fm.weight !== null && fm.weight !== undefined) ? Math.max(0, WEIGHT_OPTIONS.indexOf(Number(fm.weight))) : Math.max(0, WEIGHT_OPTIONS.indexOf(Number(fm.suggest || 0)))
    const rIdx = fm.reps ? Math.max(0, REP_OPTIONS.indexOf(Number(fm.reps))) : 11
    this.setData({ showWheel: true, wheelTarget: 'fm', wheelEx: -1, wheelSet: -1, wheelExName: fm.exName || '', wheelSuggest: Number(fm.suggest || 0), wheelValue: [wIdx, rIdx] })
  },
  confirmWheel() {
    const v = this.data.wheelValue
    const w = WEIGHT_OPTIONS[v[0]] || 0
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
          title: '手动输入次数', editable: true, placeholderText: '如 12',
          success: (r2) => {
            if (!r2.confirm) return
            const reps = String(r2.content || '').trim() || '12'
            const wv = w === '' ? '0' : w
            this.setData({
              ['exercises[' + i + '].log[' + j + '].weight']: wv,
              ['exercises[' + i + '].log[' + j + '].reps']: reps
            })
            this.applyToRest(i, wv, reps, j)
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
    const db = wx.cloud.database()
    const doc = {
      date: this.data.viewDate, dayIndex: this.data.dayIndex,
      trained: this.data.trained, dietOk: this.data.dietOk,
      waterMl: this.data.waterMl || 0, sleepHours: this.data.sleepHours || 0,
      weight: this.data.weight ? Number(this.data.weight) : '',
      note: this.data.note,
      exercises: this.data.exercises.map(e => ({ oid: e.oid || '', name: e.name, sets: e.sets, role: e.role || '', log: e.log })),
      dietLog: this.data.dietLog
    }
    db.collection('checkins').where({ _openid: app.globalData.openid, date: this.data.viewDate }).get()
      .then(res => {
        const save = () => {
          if (res.data.length) {
            return db.collection('checkins').doc(res.data[0]._id).update({ data: doc })
          }
          return db.collection('checkins').add({ data: doc })
        }
        return save()
      })
      .then(() => {
        this.setData({ savedTip: true }); setTimeout(() => this.setData({ savedTip: false }), 1500)
        if (app.loadCultivation) app.loadCultivation(true)   // 修炼摘要当日缓存失效（EXP 变了）
        // 双端互通：绑定了网站账号的话，把今天这条打卡镜像过去（不绑定就静默跳过）
        wx.cloud.callFunction({ name: 'webApi', data: { action: 'mpSyncCheckin', date: this.data.viewDate } })
          .catch(() => {})
      })
      .catch(err => wx.showToast({ title: '保存失败', icon: 'none' }))
  },

  goAssess() { wx.navigateTo({ url: '/pages/assess/assess' }) },
  goCoach() { wx.navigateTo({ url: '/pages/coach/coach' }) },

  applyTcmTip() {
    const g = app.globalData
    const key = (g.tcmResult && g.tcmResult.main) || g.constitution
    const m = key ? TIP_MAP[key] : null
    this.setData({ tcmTip: m ? { name: m.name, tip: m.tip } : null })
  },
  goTcm() { wx.switchTab({ url: '/pages/tcm/tcm' }) },

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
