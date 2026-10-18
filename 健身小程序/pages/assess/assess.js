const app = getApp()
const calc = require('../../utils/calc.js')
const kb = require('../../utils/kb.js')

Page({
  data: {
    gender: '男', age: '', height: '', weight: '',
    goal: '减脂', exp: '新手', days: 3,
    // 目标：增肌减脂同步(recomp) / 增肌 / 减脂 / 塑形
    goals: ['增肌减脂同步', '增肌', '减脂', '塑形'],
    exps: ['新手', '进阶', '熟练'],
    dayOpts: [3, 4, 5, 6],
    bodyTypes: ['易胖', '中性', '易瘦'],
    bodyType: '中性',
    scenes: [{ k: false, name: '健身房' }, { k: true, name: '居家·无器械' }],
    home: false,
    // 日常活动量（决定 BMR 乘以多少 → TDEE）——不填就没法算每日消耗
    activities: kb.METHOD.ACTIVITY,
    activity: 'mod',
    activityName: '中度', activityDesc: '', factor: 1.55,
    progMode: 'smart',
    progList: [],
    selProg: 'fb4',
    // 训练分化（从 kb 派生：全身/三分化/四分化/五分化）
    splitOpts: kb.splitList(),
    selSplit: 'full',
    splitBasis: '', splitSrc: '',
    // 饮食方案：配好菜 / 只给克数
    dietMode: 'simple',
    result: null
  },

  onLoad() {
    const p = app.globalData.profile
    const plan = app.globalData.plan
    if (p) {
      this.setData({
        gender: p.gender, age: String(p.age), height: String(p.height),
        weight: String(p.weight), goal: p.goal, exp: p.exp, days: p.days,
        // 场景与分化都读 plan（与计划页同一权威源，修三处来源不一致）
        home: !!(plan && plan.home), bodyType: p.bodyType || '中性',
        dietMode: p.dietMode || 'simple',
        activity: p.activity || kb.METHOD.defaultActivity(p.days)
      })
    }
    if (plan && plan.program) {
      this.setData({ progMode: 'program', selProg: plan.program })
    }
    this.setData({
      progList: kb.programList(),
      selSplit: (plan && plan.split) || this.defaultSplit(p && p.exp)
    })
    this.syncSplitInfo()
    this.recompute()
  },

  // 经验 → 默认分化（新手全身 / 进阶推拉腿 / 熟练四分化）
  defaultSplit(exp) {
    return exp === '熟练' ? 'cpbsl' : exp === '进阶' ? 'ppl' : 'full'
  },
  syncSplitInfo() {
    const s = (this.data.splitOpts || []).find(x => x.key === this.data.selSplit)
    this.setData({
      splitBasis: s ? s.basis : '',
      splitSrc: s ? s.src : ''
    })
  },

  onScene(e) { this.setData({ home: e.currentTarget.dataset.v === '1' }) },

  onGender(e) { this.setData({ gender: e.currentTarget.dataset.v }); this.recompute() },
  onGoal(e) { this.setData({ goal: e.currentTarget.dataset.v }); this.recompute() },
  // 经验变化时，若分化还是「上一个经验的默认值」，就跟着切到新默认（用户手动选过则不覆盖）
  onExp(e) {
    const exp = e.currentTarget.dataset.v
    const patch = { exp }
    if (this.data.selSplit === this.defaultSplit(this.data.exp)) patch.selSplit = this.defaultSplit(exp)
    this.setData(patch)
    this.syncSplitInfo()
    this.recompute()
  },
  onDays(e) {
    const days = this.data.dayOpts[e.detail.value]
    const patch = { days }
    // 活动量若还是「按天数自动推的」，就跟着天数走
    if (this.data.activity === kb.METHOD.defaultActivity(this.data.days)) patch.activity = kb.METHOD.defaultActivity(days)
    this.setData(patch)
    this.recompute()
  },
  onActivity(e) { this.setData({ activity: e.currentTarget.dataset.v }); this.recompute() },
  onInput(e) { this.setData({ [e.currentTarget.dataset.k]: e.detail.value }); this.recompute() },
  onBodyType(e) { this.setData({ bodyType: e.currentTarget.dataset.v }); this.recompute() },
  onProgMode(e) { this.setData({ progMode: e.currentTarget.dataset.v }) },
  onSelProg(e) { this.setData({ selProg: e.currentTarget.dataset.v }) },
  onSplit(e) { this.setData({ selSplit: e.currentTarget.dataset.v }); this.syncSplitInfo() },
  onDietMode(e) { this.setData({ dietMode: e.currentTarget.dataset.v }) },

  recompute() {
    const d = this.data
    const act = kb.METHOD.activityOf(d.activity)
    const age = Number(d.age), h = Number(d.height), w = Number(d.weight)
    // 活动系数与描述随时可见（即使身高体重还没填完）
    this.setData({ activityName: act.name, activityDesc: act.desc, factor: act.factor })
    if (!age || !h || !w) { this.setData({ result: null }); return }
    // 统一用「锚定 TDEE」的 energyPlan：BMR × 活动系数 = TDEE → 目标热量 = TDEE ± 缺口 → 碳水补齐差额
    const prof = {
      gender: d.gender, age, height: h, weight: w,
      goal: d.goal, exp: d.exp, days: d.days, bodyType: d.bodyType, activity: d.activity
    }
    const e = calc.energyPlan(prof, {})
    const bmi = calc.bmi(w, h), cat = calc.bmiCat(bmi)
    this.setData({
      result: {
        bmi, cat: cat.txt, catColor: cat.color,
        bmr: e.bmr, factor: e.activity.factor, actName: e.activity.name, tdee: e.tdee,
        targetKcal: e.targetKcal, kcal: e.kcal,
        protein: e.protein, carb: e.carb, fat: e.fat,
        deficit: e.deficit, wantDeficit: e.wantDeficit, warn: e.warn
      }
    })
  },

  submit() {
    const d = this.data
    const age = Number(d.age), h = Number(d.height), w = Number(d.weight)
    if (!age || !h || !w) { wx.showToast({ title: '请填写完整', icon: 'none' }); return }
    if (!app.globalData.openid) {
      wx.showToast({ title: '登录初始化中，请稍后再试', icon: 'none' })
      return
    }
    const profile = {
      gender: d.gender, age, height: h, weight: w, goal: d.goal, exp: d.exp,
      days: d.days, bodyType: d.bodyType,
      home: !!d.home,                    // ⚠️ 旧版漏了这个字段（但 onLoad 又去读），导致二次编辑时居家被静默重置
      activity: d.activity,              // 日常活动量 → 决定 TDEE
      dietMode: d.dietMode || 'simple'
    }
    const plan = d.progMode === 'program'
      ? kb.enrollProgram(d.selProg, profile, d.home)
      : kb.generatePlan(profile, { home: d.home, split: d.selSplit, dietMode: profile.dietMode })
    const old = app.globalData.plan
    if (old && old.cycleStart) plan.cycleStart = old.cycleStart // 编辑时不重置周期
    app.globalData.profile = profile
    app.globalData.plan = plan
    wx.showLoading({ title: '保存中', mask: true })
    app.saveUser({ profile, plan }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: '已生成计划' })
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) wx.navigateBack()
        else wx.switchTab({ url: '/pages/today/today' })
      }, 800)
    }).catch(err => {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    })
  }
})
