// pages/tcm/tcm.js —— 中医调理板块（体质自测 + 概念库科普 + 食养 + 训练宜忌 + 四季养生）
const app = getApp()

// 免责声明（合规红线：全程标注，结论用"倾向"而非"诊断"）
const {DISCLAIMER,TYPES,LESSONS,FOODS_TCM,RECOVERY,TRAIN_TIPS,SOLAR,WUZANG,QUIZ,SCALE,evaluateQuiz}=require('../../utils/tcm-content.js')

require('../../utils/page.js')({
  data: {
    types: TYPES, lessons: LESSONS, foodGroups: [], showAllFoods: false, recovery: RECOVERY, trainTips: TRAIN_TIPS, solar: SOLAR, wuzang: WUZANG,
    disclaimer: DISCLAIMER, scale: SCALE, quizList: QUIZ,
    selected: null, selType: null,
    quiz: { active: false, idx: 0, answers: {}, done: false, result: null }
  },

  onShow() {
    const profile=app.globalData.profile||{}
    const c = Object.prototype.hasOwnProperty.call(profile,'constitution') ? profile.constitution : app.globalData.constitution
    if((app.globalData.profile||{}).tcmResult)app.globalData.tcmResult=app.globalData.profile.tcmResult
    if (c) {
      const t = TYPES.find(x => x.key === c)
      if (t) {
        this.setData({ selected: c, selType: t,'quiz.result':app.globalData.tcmResult||null })
        // 兜底：老用户只存了 constitution、没有完整 tcmResult 时补一个最小结果
        if (!app.globalData.tcmResult) {
          const result = { main: t.key, mainName: t.name, mainConv: null, sec: null, secName: '', secConv: 0, conv: {},source:'manual' }
          app.globalData.tcmResult = result
          app.saveUser({ tcmResult: result }).catch(() => {})
        }
      }
    }
    if (!c) this.setData({selected:null,selType:null,'quiz.result':null})
    this.refreshFoods()
  },

  // 一键自测
  startQuiz() {
    this.setData({
      quiz: { active: true, idx: 0, answers: {}, done: false, result: null },
      selected: null, selType: null
    })
  },

  answer(e) {
    const score = Number(e.currentTarget.dataset.s)
    const idx = this.data.quiz.idx
    const answers = Object.assign({}, this.data.quiz.answers)
    answers[idx] = score
    const next = idx + 1
    if (next >= QUIZ.length) {
      const result=evaluateQuiz(answers),mainKey=result.main,t=TYPES.find(x=>x.key===mainKey)
      this.setData({
        quiz: { active: true, idx, answers, done: true, result },
        selected: mainKey, selType: t
      })
      app.globalData.constitution = mainKey
      app.globalData.tcmResult = result
      this.persistResult(mainKey,result)
      this.refreshFoods()
    } else {
      this.setData({ 'quiz.idx': next, 'quiz.answers': answers })
    }
  },

  closeQuiz() { this.setData({ 'quiz.active': false }) },

  // 手动选择（自测之外的快速入口）
  selectType(e) {
    const t = TYPES[e.currentTarget.dataset.i]
    const result = { main: t.key, mainName: t.name, mainConv: null, sec: null, secName: '', secConv: 0, conv: {},source:'manual' }
    this.setData({ selected: t.key, selType: t })
    app.globalData.constitution = t.key
    app.globalData.tcmResult = result
    this.persistResult(t.key,result)
    this.refreshFoods()
  },

  toggleSection(e){const k=e.currentTarget.dataset.k;this.setData({['sections.'+k]:!(this.data.sections||{})[k]})},
  persistResult(key,result){const profile=Object.assign({},app.globalData.profile,{constitution:key,tcmResult:result});app.globalData.profile=profile;app.globalData.constitution=key;app.globalData.tcmResult=result;return app.saveUser({profile,constitution:key,tcmResult:result}).catch(()=>wx.showToast({title:'倾向保存失败，请重试',icon:'none'}))},
  reset() {
    this.persistResult(null,null)
    this.setData({ selected: null, selType: null, 'quiz.active': false, 'quiz.done': false });this.refreshFoods()
  },

  // 根据已测体质过滤食养方（我的体质优先，可切换看全部）
  refreshFoods() {
    const profile=app.globalData.profile||{}
    const c = Object.prototype.hasOwnProperty.call(profile,'constitution') ? profile.constitution : app.globalData.constitution
    let groups
    if (c && !this.data.showAllFoods) {
      const t = TYPES.find(x => x.key === c)
      groups = t ? [{ name: t.name, list: FOODS_TCM[c] || [] }] : []
    } else {
      groups = TYPES.map(t => ({ name: t.name, list: FOODS_TCM[t.key] || [] }))
    }
    this.setData({ foodGroups: groups })
  },
  toggleShowAllFoods() {
    this.setData({ showAllFoods: !this.data.showAllFoods }, () => this.refreshFoods())
  }
})
