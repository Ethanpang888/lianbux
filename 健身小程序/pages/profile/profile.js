const app = getApp()
const calc = require('../../utils/calc.js')
const cultivation = require('../../utils/cultivation.js')
const gamify = require('../../utils/gamify.js')
const contract=require('../../utils/page-contract.js'),pro=require('../../utils/pro.js'),checks=require('../../utils/checkins-store.js')

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

require('../../utils/page.js')({
  data: {
    tools:contract.TOOLS, cities:gamify.CITIES, profile: null, plan: null, dayIndex: 0, streak: 0, tcm: null, cul: null,
    inviteCode: '', inviteCount: -1, inviterCode: '',
    weekTasks: [], weekNote: '',
    badgeOpen: [] },

  onShow() {
    if (this.getTabBar) this.getTabBar().setData({ selected: 4 })
    if(app.globalData.ready&&app.loadEntitlements)app.loadEntitlements().then(()=>this.load()).catch(()=>this.load());else this.load()
    // 虚拟支付兜底：支付成功但发货推送/前端回调丢失时，进「我的」自动查单补发货（2026-10-20）
    wx.cloud.callFunction({ name: 'webApi', data: { action: 'vp_check' } }).catch(() => {})
  },

  load() {
    const g = app.globalData
    if (!g.openid) { setTimeout(() => this.load(), 300); return }
    if (!g.profile) app.loadUser().then(() => this.render()).catch(() => this.render())
    else this.render()
  },

  render() {
    const g = app.globalData
    if (!g.profile) { this.setData({ profile: null }); return }
    let dayIndex = 0
    if (g.plan && g.plan.cycleStart) {
      const idx = calc.dayIndexFromStart(g.plan.cycleStart, todayStr())
      dayIndex = idx < 0 ? 0 : idx
    }
    const energy = calc.energyPlan(g.profile, require('../../utils/macro.js').combinedAdj(g.dietState || {}))
    this.setData({
      member:pro.memberOf(g), playerNo:gamify.playerNoStr(g.playerNo||0), activity:require('../../utils/method.js').activityOf(g.profile.activity).name,bmi:calc.bmi(g.profile.weight,g.profile.height),email:g.email||'',
      profile: g.profile, plan: g.plan, dayIndex, tcm: g.tcmResult || null,
      inProgram: !!(g.plan && g.plan.program),
      energy: {
        bmr: energy.bmr, factor: energy.activity.factor, actName: energy.activity.name,
        tdee: energy.tdee, kcal: energy.kcal,
        protein: energy.protein, carb: energy.carb, fat: energy.fat,
        deficit: energy.deficit, warn: energy.warn
      }
    })
    this.loadStreak()
    this.loadWeekTasks()
    this.loadInvite()
  },

  loadStreak() {
    // 修炼摘要（EXP/等级/境界/连续/累计）—— 与网站 gamify 同口径，当日缓存
    app.loadCultivation(true).then(cul => {
      if (!cul) return
      const level=cul.level,current=contract.CHAR_STAGES.filter(s=>level>=s.at).slice(-1)[0];this.setData({ streak: cul.streak.cur, cul, stageName:current.name,stages:contract.CHAR_STAGES.map(s=>Object.assign({},s,{unlocked:level>=s.at,current:current.at===s.at})) })
      this.loadBadges(cul)
    }).catch(() => {})
  },

  /* 徽章墙（与网站徽章墙同口径）：从近一年打卡重放 counters，只读不写库 */
  loadBadges(cul) {
    const g = app.globalData
    const db = wx.cloud.database()
    const energy = this.data.energy || {}
    db.collection('checkins').where({ _openid: g.openid }).orderBy('date', 'desc').limit(365).get()
      .then(res => {
        const badges = cultivation.badgesOf(
          res.data || [], g.profile,
          { kcal: energy.kcal || 0, protein: energy.protein || 0 },
          cul.level, cul.streak.best
        )
        // 2026-10-18 成长总览：每枚徽章带条件/进度（badgesOf 现在把 counters 挂在返回数组上）
        const withProg = badges.map(b => Object.assign({}, b, { prog: gamify.badgeProgress(b, badges.counters, { best: badges.streakBest }) }))
        this.setData({ badges: withProg, badgeGot: withProg.filter(b => b.got).length, badgeOpen: withProg.filter(b => !b.got && b.displayCond !== '隐藏徽章') })
      }).catch(() => {})
  },

  /* ───── 本周任务（与网站 growth 页同口径：WEEK_TASKS × gamify.weekTask，按真实数据展示）───── */
  loadWeekTasks() {
    // ISO 周口径与后端 weekKeyOf/网站 Fmt.weekKey 完全一致（周一为一周之首、周四锚定）
    const d = new Date()
    const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const day = (dd.getDay() + 6) % 7
    dd.setDate(dd.getDate() - day + 3)
    const firstThu = new Date(dd.getFullYear(), 0, 4)
    const weekNo = 1 + Math.round(((dd - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7)
    const week = dd.getFullYear() + '-W' + String(weekNo).padStart(2, '0')
    const g = app.globalData.gamify || {}
    const wt = (g.weekTask || {})
    const cur = wt.week === week ? wt : {}
    const tasks = gamify.WEEK_TASKS.map(t => ({
      name: t.name, target: t.target, exp: t.exp,
      cur: Math.min(Number(cur[t.key]) || 0, t.target),
      paid: (cur.paid || []).indexOf(t.key) >= 0
    }))
    this.setData({
      weekTasks: tasks,
      weekNote: '每周一清零重算 · 按真实打卡结算，不用手动领取'
    })
  },

  async refreshAccount(){if(this.data.syncing)return;this.setData({syncing:true,syncError:false});try{await app.loadUser();if(app.loadEntitlements)await app.loadEntitlements();this.render();wx.showToast({title:'同步完成'})}catch(e){this.setData({syncError:true});wx.showToast({title:'同步失败，请重试',icon:'none'})}finally{this.setData({syncing:false})}},
  async setCity(e){const profile=Object.assign({},app.globalData.profile,{city:e.currentTarget.dataset.city});try{await app.saveUser({profile});app.globalData.profile=profile;this.setData({profile})}catch(e){wx.showToast({title:'城市保存失败',icon:'none'})}},
  toggleTech(){this.setData({techOpen:!this.data.techOpen})},
  goPro(){wx.navigateTo({url:'/subpkgs/tools/pages/pro/pro'})},
  goSecret(){wx.navigateTo({url:'/pages/secret/secret'})},
  goGrowth(){wx.navigateTo({url:'/pages/growth/growth'})},
  poster(e){wx.navigateTo({url:'/pages/poster/poster?mode='+e.currentTarget.dataset.mode})},
  async exportData(){if(this.data.exporting)return;this.setData({exporting:true});try{const g=app.globalData,rows=await checks.all(g.openid),data={version:1,exportedAt:new Date().toISOString(),user:{profile:g.profile,plan:g.plan,dietState:g.dietState,gamify:g.gamify},checkins:rows.map(c=>{const x=Object.assign({},c);delete x._id;delete x._openid;return x}),localJournal:require('../../utils/journal-local.js').all(g.openid)},path=wx.env.USER_DATA_PATH+'/lianbux-'+todayStr()+'.json';await new Promise((resolve,reject)=>wx.getFileSystemManager().writeFile({filePath:path,data:JSON.stringify(data,null,2),encoding:'utf8',success:resolve,fail:reject}));if(wx.shareFileMessage)wx.shareFileMessage({filePath:path,fileName:'练不虚数据-'+todayStr()+'.json'});else wx.setClipboardData({data:JSON.stringify(data)}); }catch(e){wx.showToast({title:'导出失败，请重试',icon:'none'})}finally{this.setData({exporting:false})}},
  goTool(e){require('../../utils/navigation.js').go(e.currentTarget.dataset.url)},
  setTheme(e){const theme=e.currentTarget.dataset.theme;wx.setStorageSync('lbgym_theme',theme);this.setData({theme,themeStyle:require('../../utils/presentation.js').themeStyle(theme)});wx.setNavigationBarColor({frontColor:theme==='dark'?'#ffffff':'#000000',backgroundColor:theme==='dark'?'#101713':'#f4f6f2'});if(this.getTabBar&&this.getTabBar())this.getTabBar().connect()},
  edit() { wx.navigateTo({ url: '/pages/assess/assess' }) },
  goHistory() { require('../../utils/navigation.js').go('/pages/records/records') },
  goRank() { wx.navigateTo({ url: '/pages/rank/rank' }) },
  goBind() { wx.navigateTo({ url: '/pages/bind/bind' }) },
  goTcm() { require('../../utils/navigation.js').go('/pages/tcm/tcm') },
  goDiet() { require('../../utils/navigation.js').go('/pages/diet/diet') },
  goSubscribe() { wx.navigateTo({ url: '/pages/subscribe/subscribe' }) },

  /* ───── 收徒（2026-10-17 裂变）：邀请码 + 弟子数 + 绑定师傅 ───── */
  loadInvite() {
    wx.cloud.callFunction({ name: 'webApi', data: { action: 'mpInviteCode' } })
      .then(r => {
        const code = (r.result && r.result.code) || ''
        const g = app.globalData
        if (g.profile) g.profile.inviteCode = code
        this.setData({ inviteCode: code, inviterCode: (g.profile && g.profile.inviter && g.profile.inviter.code) || '' })
      }).catch(() => {})
  },
  copyInvite() {
    const code = this.data.inviteCode
    if (!code) { wx.showToast({ title: '邀请码还没生成', icon: 'none' }); return }
    wx.setClipboardData({ data: code, success: () => wx.showToast({ title: '邀请码已复制' }) })
  },
  myInvites() {
    wx.cloud.callFunction({ name: 'webApi', data: { action: 'mpMyInvites' } })
      .then(r => {
        const n = (r.result && r.result.count) || 0
        this.setData({ inviteCount: n })
        wx.showModal({
          title: '我的门下弟子',
          content: n ? '已有 ' + n + ' 位同门拜入你门下。徒弟练得越勤，你这位师傅越有牌面。' : '还没有弟子。把邀请码发给想练的朋友——他注册时填码，你俩各得 3 天完整版。',
          showCancel: false
        })
      }).catch(() => wx.showToast({ title: '查询失败', icon: 'none' }))
  },
  bindInvite() {
    const g = app.globalData
    if (g.profile && g.profile.inviter) { wx.showToast({ title: '你已经绑过师傅了', icon: 'none' }); return }
    wx.showModal({
      title: '绑定师傅的邀请码', editable: true, placeholderText: 'LB 开头的邀请码',
      success: res => {
        if (!res.confirm) return
        const code = (res.content || '').trim().toUpperCase()
        if (!code) return
        wx.cloud.callFunction({ name: 'webApi', data: { action: 'mpBindInvite', code: code } })
          .then(r2 => {
            const rr = r2.result || {}
            if (rr.bound) {
              if (g.profile) g.profile.inviter = { code: code, at: new Date().toISOString() }
              this.setData({ inviterCode: code })
              wx.showToast({ title: '拜师成功！双方各得 3 天完整版', icon: 'none' })
            } else {
              wx.showToast({ title: rr.code === 'CODE_INVALID' ? '邀请码不对' : rr.code === 'ALREADY_BOUND' ? '已经绑过了' : rr.code === 'SELF_INVITE' ? '不能填自己的码' : '绑定失败', icon: 'none' })
            }
          }).catch(() => wx.showToast({ title: '绑定失败', icon: 'none' }))
      }
    })
  },

  regen() {
    const kb = require('../../utils/kb.js')
    const old = app.globalData.plan || {}
    const profile = app.globalData.profile
    if (!profile) { wx.showToast({ title: '先完成测评', icon: 'none' }); return }
    // ⚠️ 旧版直接 generatePlan(profile) 不传参 → 把用户选的分化/频率/场景全部重置成默认。
    // 现在保留用户的选择，只重排内容。
    let plan
    if (old.program) {
      plan = kb.enrollProgram(old.program, profile, !!old.home)
    } else {
      plan = kb.generatePlan(profile, { split: old.split, freq: old.freq, home: !!old.home })
    }
    plan.cycleStart = old.cycleStart || plan.cycleStart
    plan.slotExercises = old.slotExercises || {}
    app.globalData.plan = plan
    app.saveUser({ plan }).then(() => {
      wx.showToast({ title: '已重排 · 保留你的分化与频率', icon: 'none' })
      this.setData({ plan })
    }).catch(() => wx.showToast({ title: '重排失败', icon: 'none' }))
  },

  clear() {
    wx.showModal({
      title: '清空数据', content: '将删除本账号的计划与全部打卡记录，不可恢复。确定？',
      success: r => {
        if (!r.confirm) return
        const db = wx.cloud.database()
        Promise.all([
          db.collection('users').doc(app.globalData.openid).remove(),
          db.collection('checkins').where({ _openid: app.globalData.openid }).remove()
        ]).then(() => {
          app.globalData.profile = null; app.globalData.plan = null
          wx.reLaunch({ url: '/pages/index/index' })
        }).catch(() => wx.showToast({ title: '清空失败', icon: 'none' }))
      }
    })
  },

  about() {
    wx.showModal({
      title: '免责声明',
      content: '本工具提供的测评、计划与建议仅为健身参考，不构成医疗诊断。如有疾病或伤痛，请遵医嘱。练习时量力而行，疼痛即停。',
      showCancel: false
    })
  }
})
