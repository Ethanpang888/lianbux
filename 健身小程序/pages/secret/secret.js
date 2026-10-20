// pages/secret/secret.js —— 藏经阁：6 本基础功法 + 18 本秘籍（与健身网站 shared/secret.js 同源）
const app = getApp()
const kb = require('../../utils/kb.js')
const calc = require('../../utils/calc.js')
const SECRET = require('../../utils/secret.js')
const BACKUP = require('../../utils/plan-backup.js')
const FND = require('../../utils/foundations-data.js')

// 分类 → 角标字 / 分类名（与网站 src/pages/secret.js catMeta 一致）
const CAT_META = {
  home: { glyph: '居', label: '居家计划' },
  focus: { glyph: '专', label: '部位专项' },
  posture: { glyph: '衡', label: '体态矫正' },
  female: { glyph: '她', label: '女性训练' },
  advanced: { glyph: '进', label: '进阶周期' }
}
const TABS = [
  { key: 'all', name: '全部' },
  { key: 'free', name: '免费入门' },
  { key: 'female', name: '女性' },
  { key: 'home', name: '居家' },
  { key: 'focus', name: '部位专项' },
  { key: 'posture', name: '体态矫正' },
  { key: 'advanced', name: '进阶周期' }
]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// 当前循环槽位（与网站 Foundations.startNow 同款取模，负数保护）
function slotOf(plan, today) {
  const idx = calc.dayIndexFromStart(plan.cycleStart || today, today)
  return ((idx % plan.micro.length) + plan.micro.length) % plan.micro.length
}

require('../../utils/page.js')({
  data: {
    tabs: TABS,
    tab: 'all',
    view: 'list',          // list | sec | fnd
    cur: null,             // 详情数据
    books: [], secrets: [],
    road: [],
    freeCount: 0, secCount: 0,
    lessonDone: [], lessonProgress: ''
  },

  onLoad(options) { this.prepare();if(options&&options.id){if(FND.some(x=>x.key===options.id))this.openFnd({currentTarget:{dataset:{key:options.id}}});else this.openSec({currentTarget:{dataset:{key:options.id}}})} },
  onShow() { this.prepare() },

  // ───────────── 列表 ─────────────
  prepare() {
    const profile = app.globalData.profile || {}
    const using = (profile.secret && profile.secret.key) || ''
    const books = FND.map(b => Object.assign({}, b, { cat: 'free', glyph: b.mark }))
    const secrets = SECRET.list().map(s => {
      const meta = CAT_META[s.cat || 'advanced'] || CAT_META.advanced
      const append = s.kind === 'append'
      const free = s.cat === 'female' // 女性周期训练免费开放（2026-10-18）
      const grade = s.cat === 'female' ? '黄阶' : (s.cat === 'advanced' ? '地阶' : '玄阶') // 品阶（与网站一致）
      return {
        key: s.key, name: s.name, tagline: s.tagline, weeks: s.weeks,
        cat: s.cat || 'advanced', append,
        catLabel: meta.label + ' · ' + grade, grade,
        glyph: append ? '衡' : meta.glyph,
        using: s.key === using, free,
        tags: s.tags || []
      }
    })
    const road = (SECRET.ROADMAP || []).map(x => ({ name: x.name, why: x.why }))
    this.setData({
      books, secrets, road, hasProfile: !!app.globalData.profile,
      freeCount: books.length, secCount: secrets.length,
      usingKey: using,
      hasBackup: !!(app.globalData.lastPlanBackup && app.globalData.lastPlanBackup.plan)
    })
  },

  switchTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }) },

  // ───────────── 秘籍详情 ─────────────
  openSec(e) {
    const key = e.currentTarget.dataset.key
    const s = SECRET.get(key)
    if (!s) return
    const profile = app.globalData.profile || {}
    const locked=s.cat!=='female'&&!require('../../utils/pro.js').isPro(app.globalData)
    const using = (profile.secret || {}).key === key
    const preset = s.preset || {}
    const withIdx = rows => (rows || []).map((x, i) => Object.assign({ idx: i }, x))
    // 2026-10-18 线上复查：没应用这本时，内容里写死的「已自动加进你的计划」是假话 → 改成「应用后自动加进」
    const fixRows = rows => withIdx(rows).map(x => x.t
      ? Object.assign({}, x, { t: String(x.t).replace('（已自动加进你的计划）', '（应用这本后自动加进）') })
      : x)
    this.setData({
      view: 'sec',
      cur: {
        locked, key: s.key, name: s.name, weeks: s.weeks, tagline: s.tagline,
        forWho: s.forWho || '', using, append: s.kind === 'append',
        grade: (s.cat || 'advanced') === 'advanced' ? '地阶' : '玄阶',
        solves: s.solves || [],
        theory: fixRows(locked?(s.theory||[]).slice(0,1):s.theory), eat: locked?[]:fixRows(s.eat), train: locked?[]:fixRows(s.train),
        outline: locked?[]:(s.outline || []), sources: s.sources || [],
        appendNames: (preset.append || []).map(a => a.name).join('、'),
        presetGoal: preset.goal || '', presetSplit: preset.split || '', presetFreq: preset.freq || '',
        hasBackup: !!(app.globalData.lastPlanBackup && app.globalData.lastPlanBackup.plan)
      }
    })
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  goPro(){wx.navigateTo({url:'/subpkgs/tools/pages/pro/pro'})},
  backList() { this.setData({ view: 'list', cur: null }) },

  // ───────────── 用这本（换档案 + 换计划 / 挂动作）─────────────
  useSecret(e) {
    const key = e.currentTarget.dataset.key
    const s = SECRET.get(key)
    if (!s) return
    if(s.cat!=='female'&&!require('../../utils/pro.js').isPro(app.globalData)){this.goPro();return}
    const profile = app.globalData.profile
    if (!profile) { this.goAssess(); return }
    // 挂载前快照（只在空的时候建；换回 = 回到挂秘籍之前的最初状态。免费可用，防流失兜底）
    const backup = BACKUP.makeBackup({ profile, plan: app.globalData.plan }, key)
    const p = SECRET.applyTo(key, profile)
    if (!p) return
    p.secret = { key, since: todayStr() }
    app.globalData.profile = p
    if (backup) app.globalData.lastPlanBackup = backup

    if (s.kind === 'append') {
      // append 型：不重排计划，往每个训练日末尾挂动作（slotExercises，可随时删）
      const plan = app.globalData.plan
      if (!plan || !plan.micro) {
        wx.showToast({ title: '先有训练计划再用这本', icon: 'none' }); return
      }
      const np = JSON.parse(JSON.stringify(plan))
      const sx = Object.assign({}, np.slotExercises || {})
      // 已用过秘籍挂的动作 → 先清掉旧的（换一本时替换而不是叠加）
      Object.keys(sx).forEach(k => { sx[k] = (sx[k] || []).filter(ex => !ex.fromSecret) })
      const acts = (s.preset && s.preset.append) || []
      let touched = 0
      np.micro.forEach((m, slot) => {
        const isTrain = m !== 'rest' && !(typeof m === 'object' && m.type === 'rest')
        if (!isTrain) return
        const add = acts.map(a => ({
          oid: '', name: a.name, sets: a.sets || '3×15',
          role: '辅助', equipment: '', custom: true, fromSecret: key
        }))
        sx[String(slot)] = (sx[String(slot)] || []).concat(add)
        touched++
      })
      np.slotExercises = sx
      app.globalData.plan = np
      app.saveUser({ profile: p, plan: np, lastPlanBackup: app.globalData.lastPlanBackup || null })
      wx.showToast({ title: `已挂上 ${touched} 个训练日`, icon: 'none' })
    } else {
      // 换计划：goal / split / freq 一起换，周期起点重置到今天
      let np = null
      try {
        np = kb.generatePlan(p, {
          split: s.preset.split, freq: s.preset.freq,
          home: s.preset.home !== undefined ? !!s.preset.home : !!p.home,
          dietMode: p.dietMode
        })
        np.cycleStart = todayStr()
        app.globalData.plan = np
        // 场景/分化/频率写回 profile（修 profile-plan 脱节：否则档案页和计划页对不上）
        p.split = np.split; p.freq = np.freq; p.home = !!np.home
        app.globalData.profile = p
      } catch (err) { np = null }
      app.saveUser({ profile: p, plan: app.globalData.plan, lastPlanBackup: app.globalData.lastPlanBackup || null })
      wx.showToast({ title: np ? '已换上，计划同步更新' : '已换上', icon: 'none' })
    }
    this.prepare()
    // 刷新详情页的「正在用」标记
    const cur = this.data.cur
    if (cur && cur.key === key) this.setData({ 'cur.using': true })
  },

  // 跟着开练：直接去今天的训练页
  goToday() { wx.switchTab({ url: '/pages/today/today' }) },

  // ───────────── 换回挂秘籍之前的计划（免费可用，防流失兜底）─────────────
  restoreBackup() {
    const b = app.globalData.lastPlanBackup
    if (!b || !b.plan) { wx.showToast({ title: '没有可换回的备份', icon: 'none' }); return }
    const sname = (SECRET.get(b.fromSecretKey) || {}).name || '秘籍'
    wx.showModal({
      title: `换回挂《${sname}》之前的计划？`,
      content: '会整体恢复到挂秘籍之前的训练计划、目标和分化，继续原来的周期进度；挂上秘籍后手动改过的动作不会保留。',
      confirmText: '换回',
      success: res => {
        if (!res.confirm) return
        const r = BACKUP.restoreData(b, app.globalData.profile)
        if (!r) { wx.showToast({ title: '备份坏了，换不回来', icon: 'none' }); return }
        app.globalData.plan = r.plan
        app.globalData.profile = r.profile
        app.globalData.lastPlanBackup = null
        app.saveUser({ plan: r.plan, profile: r.profile, lastPlanBackup: null })
        wx.showToast({ title: '已换回之前的计划', icon: 'none' })
        this.setData({ hasBackup: false, 'cur.hasBackup': false })
        this.prepare()
      }
    })
  },

  // ───────────── 功法详情 ─────────────
  openFnd(e) {
    const key = e.currentTarget.dataset.key
    const b = FND.filter(x => x.key === key)[0]
    if (!b) return
    const done = this.loadLesson(key)
    // wxml 里不能调方法，勾选态在这里预先算好
    const doneMap = {}
    done.forEach(i => { doneMap[i] = true })
    const secRows = (b.sections || []).map((x, i) => ({ idx: i, title: x[0], body: x[1], done: !!doneMap[i] }))
    this.setData({
      view: 'fnd',
      cur: {
        key: b.key, name: b.name, subtitle: b.subtitle, category: b.category,
        time: b.time, tone: b.tone, mark: b.mark, intro: b.intro, who: b.who,
        source: b.source, actions: b.actions || []
      },
      secRows,
      lessonDone: done
    }, () => this.paintLesson())
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  lessonKey(key) {
    const u = app.globalData.openid || 'demo'
    return `lbgym_lesson_${u}_${todayStr()}_${key}`
  },
  loadLesson(key) {
    try { return wx.getStorageSync(this.lessonKey(key)) || [] } catch (e) { return [] }
  },
  paintLesson() {
    if (!this.data.view || this.data.view !== 'fnd') return
    this.setData({ lessonProgress: `${this.data.lessonDone.length} / ${this.data.secRows.length}` })
  },
  toggleLesson(e) {
    const i = Number(e.currentTarget.dataset.i)
    const key = this.data.cur.key
    let done = this.data.lessonDone.slice()
    const at = done.indexOf(i)
    if (at >= 0) done.splice(at, 1)
    else done.push(i)
    try { wx.setStorageSync(this.lessonKey(key), done) } catch (err) {}
    const rows = this.data.secRows.map(r => r.idx === i ? Object.assign({}, r, { done: !r.done }) : r)
    this.setData({ lessonDone: done, secRows: rows }, () => this.paintLesson())
  },

  // 功法「跟着开练」：把动作加进今天的训练日末尾（fnd_tag，可随时删）
  goAssess() { wx.navigateTo({url:'/pages/assess/assess'}) },
  startFnd() {
    const cur = this.data.cur
    const b = FND.filter(x => x.key === cur.key)[0]
    if (!b || !b.actions || !b.actions.length) return
    const plan = app.globalData.plan
    if (!plan || !plan.micro) {
      wx.navigateTo({url:'/pages/assess/assess'}); return
    }
    const today = todayStr()
    const slotN = slotOf(plan, today)
    const m = plan.micro[slotN]
    if (m === 'rest' || (typeof m === 'object' && m.type === 'rest')) {
      wx.showToast({ title: '今天是休息日——照清单直接做就行，不用挂进训练', icon: 'none' }); return
    }
    const sx = Object.assign({}, plan.slotExercises || {})
    const tag = 'fnd_' + cur.key
    const add = b.actions.map(a => ({
      oid: '', name: a.name, sets: a.sets || '3×12',
      role: '辅助', equipment: '', custom: true, fromSecret: tag
    }))
    sx[String(slotN)] = (sx[String(slotN)] || []).filter(ex => ex.fromSecret !== tag).concat(add)
    plan.slotExercises = sx
    app.globalData.plan = plan
    app.saveUser({ plan })
    wx.showToast({ title: '已加进今天的训练', icon: 'none' })
    wx.switchTab({ url: '/pages/today/today' })
  }
})
