const app = getApp()
const kb = require('../../utils/kb.js')
const calc = require('../../utils/calc.js')
const SECRET = require('../../utils/secret.js')
const BACKUP = require('../../utils/plan-backup.js')

// append 型秘籍重挂：换分化后把挂载动作重新加到新计划的每个训练日末尾
function remountSecret(np, profile) {
  const key = (profile && profile.secret && profile.secret.key) || ''
  if (!key) return
  const s = SECRET.get(key)
  if (!s || s.kind !== 'append') return
  const acts = (s.preset && s.preset.append) || []
  if (!acts.length) return
  const sx = Object.assign({}, np.slotExercises || {})
  np.micro.forEach((m, slot) => {
    const isTrain = m !== 'rest' && !(typeof m === 'object' && m.type === 'rest')
    if (!isTrain) return
    sx[String(slot)] = (sx[String(slot)] || []).concat(acts.map(a => ({
      oid: '', name: a.name, sets: a.sets || '3×15',
      role: '辅助', equipment: '', custom: true, fromSecret: key
    })))
  })
  np.slotExercises = sx
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function extractOid(gif) {
  const url = (Array.isArray(gif) ? gif[0] : gif) || ''
  const m = String(url).match(/\/exercises\/([^/]+)\//) ||
            String(url).match(/\/ex\/([^/]+)\//) ||
            String(url).match(/\/assets\/exdb\/([^/]+)\.jpg$/) ||
            String(url).match(/\/assets\/gif\/([^/]+)\.gif$/i)
  return m ? m[1] : ''
}

require('../../utils/page.js')({
  data: {
    hasPlan: false, plan: null, home: false,
    // 分化/频率清单从 kb 派生（旧版是页内硬编码一份，新增分化时页面看不到）
    splitList: kb.splitList(),
    freqList: kb.freqList(),
    microView: [], daySlot: -1,
    showExForm: false, exSlot: -1, exQuery: '', exSuggestions: [], exCustomName: '',
    pkCats: [], pkCatSel: '全部',
    // 我的计划库（与网站同款；小程序端 member 未加载，先按免费档 2 套）
    planLimit: 2, savedList: [], activeSavedId: '',
    progList: [], showProg: false, currentProgram: ''
  },

  onShow() {
    this.load()
  },

  load() {
    const g = app.globalData
    if (!g.openid) { setTimeout(() => this.load(), 300); return }
    if (!g.profile) { app.loadUser().then(() => this.load()).catch(() => this.render()); return }
    this.setData({ progList: kb.programList() })
    this.render()
    if(g.openSchedule){g.openSchedule=false;this.postponeTraining()}
  },

  render() {
    const g = app.globalData
    if (!g.plan) { this.setData({ hasPlan: false }); return }
    const plan = g.plan
    const profile = g.profile
    // 存量自愈：旧版挂居家秘籍只改了 plan.home 没回写 profile，这里对齐一次（plan 为准）
    if (profile && plan && !!profile.home !== !!plan.home) {
      g.profile = Object.assign({}, profile, { home: !!plan.home })
      app.saveUser({ profile: g.profile }).catch(() => {})
    }
    let idx = calc.dayIndexFromStart(plan.cycleStart, todayStr())
    const microLen = (plan.micro && plan.micro.length) || 1
    const pos=kb.schedulePosition(plan,idx)
    const daySlot = idx < 0 || pos.paused ? -1 : (((pos.index % microLen) + microLen) % microLen)
    const microView = (plan.micro || []).map((f, slot) => {
      const isRest = (f === 'rest' || !f)
      const isObj = typeof f === 'object' && f.exercises
      const extra = (plan.slotExercises && plan.slotExercises[String(slot)]) || []
      return {
        slot, open: false,
        type: isRest ? 'rest' : 'train',
        focusName: isRest ? '休息日' : (isObj ? f.focus : (kb.FOCUS_NAME[f] || f)),
        note: isRest ? '散步/拉伸/筋膜放松，恢复也是训练的一部分。' : '',
        base: isRest ? [] : (isObj ? f.exercises : kb.buildExercises(f, profile, plan.home)),
        custom: extra.map(e => ({ oid: e.oid || '', name: e.name, sets: e.sets || '3×12', equipment: e.equipment || '' }))
      }
    })
    const upcoming=Array.from({length:7},(_,i)=>{const date=this.shiftScheduleDate(todayStr(),i),d=kb.dayContent(plan,idx+i,profile,plan.home);return {date,focus:d.focus||'休息日'}})
    this.setData({ upcoming, hasPlan: true, plan, home: !!plan.home, microView, daySlot, currentProgram: plan.program || '' })
    this.renderSaved()
  },

  postponeTraining(){wx.showActionSheet({itemList:['今天没空：顺延1天','今天起休息2天','今天起休息3天','补顺延昨天漏练（1天）','撤销最近一次顺延'],success:r=>{if(r.tapIndex===4){this.undoSchedule();return}const days=r.tapIndex===3?1:r.tapIndex+1,from=r.tapIndex===3?this.shiftScheduleDate(todayStr(),-1):todayStr();this.previewPostpone(from,days)}})},
  shiftScheduleDate(s,n){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)},
  scheduleRecords(from){const db=wx.cloud.database();return db.collection('checkins').where({_openid:app.globalData.openid,date:db.command.gte(from)}).limit(100).get().then(r=>r.data||[])},
  previewPostpone(from,days){const g=app.globalData,plan=g.plan;let np;try{np=kb.postponePlan(plan,from,days)}catch(e){wx.showToast({title:e.message,icon:'none'});return}this.scheduleRecords(from).then(rows=>{const resume=this.shiftScheduleDate(from,days);if(rows.some(c=>c.trained))throw new Error('开始日期后已有完成训练，请从未练日期顺延');const d=kb.dayContent(np,calc.dayIndexFromStart(np.cycleStart,resume),g.profile,np.home);wx.showModal({title:'确认顺延'+days+'天？',content:from+'起临时休息，'+resume+'恢复：'+d.focus+'。历史记录保留，部分已做组数不复制。',success:r=>{if(!r.confirm)return;if(g.plan!==plan){wx.showToast({title:'计划已变化，请重新预览',icon:'none'});return}wx.cloud.database().collection('users').doc(g.openid).update({data:{plan:np}}).then(()=>{g.plan=np;this.render();wx.showToast({title:'已顺延，可撤销'})}).catch(()=>wx.showToast({title:'保存失败，请重试',icon:'none'}))}})}).catch(e=>wx.showToast({title:e.message||'记录读取失败，未更改',icon:'none'}))},
  undoSchedule(){const g=app.globalData,plan=g.plan,list=plan.schedulePauses||[];if(!list.length){wx.showToast({title:'没有可撤销的顺延',icon:'none'});return}const last=list[list.length-1],from=last.fromDate||this.shiftScheduleDate(plan.cycleStart,last.at);this.scheduleRecords(from).then(rows=>{if(rows.some(c=>c.trained))throw new Error('顺延后已有完成训练，请安排后续');wx.showModal({title:'撤销最近一次顺延？',content:'恢复之前的后续排期，历史记录保留。',success:r=>{if(!r.confirm)return;if(g.plan!==plan){wx.showToast({title:'计划已变化，请重新预览',icon:'none'});return}const np=Object.assign({},plan,{schedulePauses:list.slice(0,-1)});wx.cloud.database().collection('users').doc(g.openid).update({data:{plan:np}}).then(()=>{g.plan=np;this.render();wx.showToast({title:'已撤销'})}).catch(()=>wx.showToast({title:'保存失败',icon:'none'}))}})}).catch(e=>wx.showToast({title:e.message||'读取失败',icon:'none'}))},

  // ───── 我的计划库（与网站同款）：保存当前计划 / 多套切换 ─────
  renderSaved() {
    const g = app.globalData
    const list = Array.isArray(g.savedPlans) ? g.savedPlans : []
    this.setData({
      savedList: list.map(sp => ({
        id: sp.id, name: sp.name,
        meta: ((sp.plan || {}).templateName || (sp.plan || {}).split || '') + ' · ' + ((sp.plan || {}).freq || '') + ((sp.plan || {}).home ? ' · 居家' : ' · 健身房') + ' · 存于 ' + sp.createdAt
      })),
      activeSavedId: g.activeSavedId || ''
    })
  },
  saveCurrentPlan() {
    const g = app.globalData
    if (!g.plan || !g.plan.micro) { wx.showToast({ title: '先有训练计划', icon: 'none' }); return }
    const list = Array.isArray(g.savedPlans) ? g.savedPlans : []
    if (list.length >= this.data.planLimit) { wx.showToast({ title: '存满了（免费 2 套）', icon: 'none' }); return }
    const entry = BACKUP.makeSavedEntry({ profile: g.profile, plan: g.plan }, '')
    if (!entry) { wx.showToast({ title: '先有训练计划', icon: 'none' }); return }
    const defName = (g.plan.templateName || g.plan.split || '计划') + ' · ' + (g.plan.freq || '')
    wx.showModal({
      title: '给这套计划起个名字（可跳过）', editable: true, placeholderText: defName,
      success: res => {
        if (!res.confirm) return
        const nm = (res.content || '').trim() || defName
        entry.name = nm
        const nl = BACKUP.upsertSaved(list, entry, this.data.planLimit)
        if (!nl) { wx.showToast({ title: '存满了', icon: 'none' }); return }
        g.savedPlans = nl
        g.activeSavedId = entry.id
        app.saveUser({ savedPlans: nl, activeSavedId: entry.id }).then(() => {
          wx.showToast({ title: '已保存「' + nm + '」', icon: 'none' })
          this.renderSaved()
        })
      }
    })
  },
  switchSaved(e) {
    const id = e.currentTarget.dataset.id
    const g = app.globalData
    const sp = (g.savedPlans || []).find(x => x.id === id)
    if (!sp) return
    wx.showModal({
      title: '切到「' + sp.name + '」？',
      content: '会整体替换当前训练安排（当前未保存的改动会丢），继续它的周期进度。',
      success: res => {
        if (!res.confirm) return
        const r = BACKUP.switchData(sp, g.profile)
        if (!r) { wx.showToast({ title: '这套数据坏了', icon: 'none' }); return }
        g.plan = r.plan
        g.profile = r.profile
        g.activeSavedId = id
        app.saveUser({ plan: r.plan, profile: r.profile, activeSavedId: id }).then(() => {
          wx.showToast({ title: '已切换', icon: 'none' })
          this.render()
        })
      }
    })
  },
  deleteSaved(e) {
    const id = e.currentTarget.dataset.id
    const g = app.globalData
    const sp = (g.savedPlans || []).find(x => x.id === id)
    if (!sp) return
    wx.showModal({
      title: '删除「' + sp.name + '」？', content: '删了找不回来。',
      success: res => {
        if (!res.confirm) return
        g.savedPlans = BACKUP.removeSaved(g.savedPlans, id)
        if (g.activeSavedId === id) g.activeSavedId = ''
        app.saveUser({ savedPlans: g.savedPlans, activeSavedId: g.activeSavedId }).then(() => {
          wx.showToast({ title: '已删除', icon: 'none' })
          this.renderSaved()
        })
      }
    })
  },

  // 切换分化 / 频率：foci 改变，自定义动作不再适用，丢弃并提示
  selectSplit(e) {
    const split = e.currentTarget.dataset.key
    if (split === app.globalData.plan.split) return
    this.applyTemplate({ split })
  },
  selectFreq(e) {
    const freq = e.currentTarget.dataset.key
    if (freq === app.globalData.plan.freq) return
    this.applyTemplate({ freq })
  },
  applyTemplate(patch) {
    const g = app.globalData
    const plan = g.plan
    // 场景以 profile 为权威（修 bug：写死 !!plan.home 导致挂居家秘籍后换分化/频率永远回不到健身房）
    const home = !!(g.profile && g.profile.home)
    const np = kb.generatePlan(g.profile, {
      split: patch.split || plan.split, freq: patch.freq || plan.freq,
      home, dietMode: plan.dietMode
    })
    np.schedulePauses = plan.schedulePauses || []
    np.cycleStart = plan.cycleStart
    const sameFoci = JSON.stringify(np.foci || []) === JSON.stringify(plan.foci || [])
    if (sameFoci) {
      np.slotExercises = plan.slotExercises || {}
    } else {
      remountSecret(np, g.profile)
    }
    // 分化/频率/场景写回 profile，保证档案页与计划页一致
    const p = Object.assign({}, g.profile, { split: np.split, freq: np.freq, home })
    g.profile = p
    g.plan = np
    app.saveUser({ plan: np, profile: p }).then(() => {
      wx.showToast({ title: sameFoci ? '已更新' : '已更新（自定义动作已按新分化重挂）', icon: 'none' })
      this.render()
    })
  },

  // 切换场景：foci 不变，保留自定义动作
  onHome(e) {
    const home = e.currentTarget.dataset.v === '1'
    if (home === this.data.home) return
    const g = app.globalData
    const plan = g.plan
    const np = kb.generatePlan(g.profile, {
      split: plan.split, freq: plan.freq, home, dietMode: plan.dietMode
    })
    np.schedulePauses = plan.schedulePauses || []
    np.cycleStart = plan.cycleStart
    np.slotExercises = plan.slotExercises || {}
    // 场景写回 profile（权威源统一）
    const p = Object.assign({}, g.profile, { home })
    g.profile = p
    g.plan = np
    app.saveUser({ plan: np, profile: p }).then(() => {
      wx.showToast({ title: home ? '已切居家' : '已切健身房', icon: 'none' })
      this.render()
    })
  },

  toggleDay(e) {
    const slot = e.currentTarget.dataset.slot
    const key = `microView[${slot}].open`
    this.setData({ [key]: !this.data.microView[slot].open })
  },

  // —— 自定义动作：动作库弹层（与网站 openPicker 同款：搜索 + 分类 + 列表，2026-10-17 死命令 1:1）——
  planPaint(q, cat) {
    let lib = kb.EX
    if (!q && cat && cat !== '全部') lib = lib.filter(x => (x.partName || '其他') === cat)
    if (q) lib = kb.searchEx(q)
    return lib.slice(0, 80).map(x => ({ name: x.name, equipment: x.equipment || '', sets: x.sets || '' }))
  },
  openExForm(e) {
    const slot = e.currentTarget.dataset.slot
    this.setData({
      showExForm: true, exSlot: slot, exQuery: '',
      pkCats: ['全部'].concat([...new Set(kb.EX.map(x => x.partName || '其他'))].sort()),
      pkCatSel: '全部',
      exSuggestions: this.planPaint('', '全部'),
      exCustomName: ''
    })
  },
  closeExForm() { this.setData({ showExForm: false }) },
  exCat(e) {
    const cat = e.currentTarget.dataset.cat
    this.setData({ pkCatSel: cat, exQuery: '', exSuggestions: this.planPaint('', cat) })
  },
  exQueryInput(e) {
    const q = (e.detail.value || '').trim()
    this.setData({ exQuery: q, exSuggestions: this.planPaint(q, this.data.pkCatSel) })
  },
  pickExSuggestion(e) {
    const ex = this.data.exSuggestions[e.currentTarget.dataset.i]
    this.addCustomEx({ name: ex.name, oid: extractOid(ex.gif), sets: ex.sets || '3×12', equipment: ex.equipment || '' })
  },
  exCustomInput(e) { this.setData({ exCustomName: e.detail.value }) },
  submitCustomEx() {
    const name = (this.data.exCustomName || '').trim()
    if (!name) { wx.showToast({ title: '请输入动作名称', icon: 'none' }); return }
    this.addCustomEx({ name, oid: '', sets: '3×12', equipment: '' })
  },
  addCustomEx(item) {
    const slot = this.data.exSlot
    const plan = app.globalData.plan
    if (!plan.slotExercises) plan.slotExercises = {}
    const key = String(slot)
    if (!plan.slotExercises[key]) plan.slotExercises[key] = []
    plan.slotExercises[key].push({ oid: item.oid || '', name: item.name, sets: item.sets || '3×12', equipment: item.equipment || '' })
    app.globalData.plan = plan
    app.saveUser({ plan }).then(() => {
      this.setData({ showExForm: false })
      this.render()
    })
  },
  removeEx(e) {
    const { slot, i } = e.currentTarget.dataset
    const plan = app.globalData.plan
    if (plan.slotExercises && plan.slotExercises[String(slot)]) {
      plan.slotExercises[String(slot)].splice(i, 1)
      if (!plan.slotExercises[String(slot)].length) delete plan.slotExercises[String(slot)]
    }
    app.globalData.plan = plan
    app.saveUser({ plan }).then(() => this.render())
  },

  goAssess() { wx.navigateTo({ url: '/pages/assess/assess' })
  },

  // 更换 / 选择精选固定课表
  openProg() { this.setData({ showProg: true }) },
  closeProg() { this.setData({ showProg: false }) },
  pickProg(e) {
    const key = e.currentTarget.dataset.key
    const g = app.globalData
    if (!g.profile) { wx.showToast({ title: '请先完成测评', icon: 'none' }); return }
    const np = kb.enrollProgram(key, g.profile, g.plan.home)
    g.plan = np
    app.saveUser({ plan: np }).then(() => {
      this.setData({ showProg: false })
      this.render()
      wx.showToast({ title: '已切换课表', icon: 'none' })
    })
  },

  noop() {} // 弹窗遮罩 catchtap 占位，阻止冒泡关闭
})
