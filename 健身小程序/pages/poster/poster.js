// pages/poster/poster.js —— 战报海报（2026-10-17 获客 P0，与网站 PagePoster 同款）
// 两种海报：today=今日战报（本次举铁吨位+今日功课） / life=修行生涯卡（累计举起+连续+入坑天数）
// 口号（用户 2026-10-17 拍板）：核心固定「三月河东，三月河西，莫欺少年凡胎弱！」，顶部随机文案见 POOL（审过的池，禁自加捞词）
// 合规：分享按钮不挂奖励（不诱导分享）；裂变走收徒邀请码（注册填码双方到账）
const app = getApp()
const SLOGAN_CORE = '三月河东，三月河西，莫欺少年凡胎弱！'
const SITE = 'https://c289b837374c4dfc8f14d386d2e36a02.app.workbuddy.host/'
const STAGES = [
  { at: 1, file: 'stage1.png' },
  { at: 20, file: 'stage2.png' },
  { at: 45, file: 'stage3.png' },
  { at: 70, file: 'stage4.png' },
  { at: 95, file: 'stage5.png' }
]
const POOL = [
  '三个月胖子，三个月帅哥。',
  '你举过的铁，从不说谎。',
  '修行没有奇遇，只有日复一日。',
  '莫问前程几许，只看脚下这一步。',
  '少侠骨骼清奇，再来一组？',
  '山河远阔，先练眼前这一组。',
  '凡胎又如何？练起来就是主角。',
  '今日功课已了，明日再进一分。',
  '不必赢过任何人，赢过昨天的自己。',
  '把力气花在自己身上，永远不算浪费。'
]
const COMMENTS = [
  '功课扎实。修行之道贵在日拱一卒——今日这一拱，老夫记下了。',
  '哼，汗流得不少，组歇没偷懒吧？继续。',
  '气血通畅，筋骨齐鸣。此等状态，明日可再进一分。',
  '练完就吃，吃完就睡。肌肉是在神魂归位时长出来的，别再刷手机了。',
  '凡胎淬体，最忌三日打鱼。你能来，已胜过大多数人。',
  '今日之功已成，昭告天下又何妨——但记住，炫耀一分，练十分。'
]

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
function wrapText(ctx, text, x, y, maxW, lh) {
  let line = '', yy = y
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) { ctx.fillText(line, x, yy); line = ch; yy += lh }
    else line += ch
  }
  if (line) ctx.fillText(line, x, yy)
}

Page({
  data: { ready: false, img: '', stats: null, mode: 'today' },

  onLoad(options) {
    const mode = (options && options.mode) === 'life' ? 'life' : 'today'
    this.setData({ mode: mode })
    this.start(mode)
  },

  async start(mode) {
    wx.showLoading({ title: '生成中', mask: true })
    try {
      const g = app.globalData
      let cul = null
      try { cul = await app.loadCultivation() } catch (e) { cul = null }
      const db = wx.cloud.database()
      let checkins = []
      try {
        const snap = await db.collection('checkins').where({ _openid: g.openid }).orderBy('date', 'desc').limit(365).get()
        checkins = ((snap && snap.data) || []).reverse()
      } catch (e) { checkins = [] }
      const vol = ck => {
        let v = 0
        ;(ck.exercises || []).forEach(e => (e.log || []).forEach(s => { if (s.done) v += (Number(s.weight) || 0) * (Number(s.reps) || 0) }))
        return v
      }
      let volumeAll = 0, first = null, todayCk = null
      const todayStr = (() => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) })()
      checkins.forEach(c => {
        if (!first || (c.date && c.date < first)) first = c.date
        if (!c.trained) return
        volumeAll += vol(c)
        if (c.date === todayStr) todayCk = c
      })
      // today 模式但今天没练 → 提示并改生涯卡
      if (mode === 'today' && !todayCk) {
        wx.hideLoading()
        wx.showToast({ title: '今日还没修炼记录——练完再来昭告天下', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 800)
        return
      }
      const level = cul ? cul.level : 1
      let stage = STAGES[0]
      STAGES.forEach(s => { if (level >= s.at) stage = s })
      const days = first ? Math.max(1, Math.round((Date.now() - new Date(first + 'T00:00:00')) / 86400000) + 1) : 1
      const todaySets = todayCk ? (todayCk.exercises || []).reduce((n, e) => n + (e.log || []).filter(s => s.done).length, 0) : 0
      // 今日功课名
      let focus = '今日功课'
      try {
        const plan = g.plan
        if (plan && plan.micro && plan.cycleStart) {
          const kb = require('../../utils/kb.js')
          const calc = require('../../utils/calc.js')
          const idx = Math.max(0, calc.dayIndexFromStart(plan.cycleStart, todayStr))
          const dc = kb.dayContent(plan, idx, g.profile, !!plan.home)
          if (dc && dc.focus) focus = dc.focus
        }
      } catch (e) {}
      if (focus.length > 7) focus = focus.slice(0, 7) + '…'
      const stats = {
        mode: mode,
        nick: ((g.profile || {}).nickname || '修行者').slice(0, 10),
        level: level,
        title: cul ? cul.title : '新手',
        realm: cul ? cul.realm : '炼体',
        stage: '/assets/characters/' + stage.file,
        streak: cul ? ((cul.streak || {}).cur || 0) : 0,
        days: days,
        todayTons: todayCk ? (vol(todayCk) / 1e6).toFixed(2) : '0',
        todaySets: todaySets,
        focus: focus,
        allTons: (volumeAll / 1e6).toFixed(2),
        line: POOL[Math.floor(Math.random() * POOL.length)],
        comment: COMMENTS[Math.floor(Math.random() * COMMENTS.length)]
      }
      this.setData({ stats: stats })
      await this.draw(stats)
    } catch (e) {
      wx.showToast({ title: '生成失败，再试一次', icon: 'none' })
    }
    wx.hideLoading()
  },

  draw(stats) {
    return new Promise((resolve, reject) => {
      const q = wx.createSelectorQuery().in(this)
      q.select('#pCanvas').fields({ node: true, size: true }).exec(res => {
        if (!res || !res[0] || !res[0].node) { reject(new Error('no canvas')); return }
        const canvas = res[0].node
        const W = 720, H = 1280
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d')
        this.paint(ctx, W, H, stats, canvas, resolve, reject)
      })
    })
  },

  paint(ctx, W, H, d, canvas, resolve, reject) {
    const SERIF = 'Songti SC, STSong, serif'
    // 背景
    const grd = ctx.createLinearGradient(0, 0, 0, H)
    grd.addColorStop(0, '#141c15'); grd.addColorStop(0.55, '#101713'); grd.addColorStop(1, '#0c1119')
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H)
    const glow = ctx.createRadialGradient(W / 2, 140, 20, W / 2, 140, 430)
    glow.addColorStop(0, 'rgba(213,189,135,0.15)'); glow.addColorStop(1, 'rgba(213,189,135,0)')
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 620)
    ctx.strokeStyle = '#3a3323'; ctx.lineWidth = 2; ctx.strokeRect(16, 16, W - 32, H - 32)
    ctx.strokeStyle = '#d5bd87'; ctx.lineWidth = 1; ctx.strokeRect(24, 24, W - 48, H - 48)

    // 顶部：印章 + 随机文案
    ctx.fillStyle = '#a83232'
    roundRect(ctx, W - 92, 52, 58, 58, 6); ctx.fill()
    ctx.strokeStyle = '#f5e6c8'; ctx.lineWidth = 1.5; ctx.strokeRect(W - 87, 57, 48, 48)
    ctx.fillStyle = '#f5e6c8'
    ctx.font = '500 34px ' + SERIF
    ctx.textAlign = 'center'
    ctx.fillText('练', W - 63, 96)
    ctx.fillStyle = '#d5bd87'
    ctx.font = '500 ' + (d.line.length > 12 ? '40px' : '46px') + ' ' + SERIF
    ctx.fillText(d.line, W / 2, 118)
    ctx.fillStyle = '#a89668'; ctx.font = '400 22px ' + SERIF
    ctx.fillText('练 不 虚 · 修 行 战 报', W / 2, 158)

    const finish = () => {
      wx.canvasToTempFilePath({
        canvas: canvas,
        success: r => { this.setData({ img: r.tempFilePath, ready: true }); resolve() },
        fail: () => resolve()
      })
    }

    // 角色立绘
    const im = canvas.createImage()
    im.onload = () => {
      const boxW = 420, boxH = 430, boxY = 185
      const r = Math.min(boxW / im.width, boxH / im.height)
      const iw = im.width * r, ih = im.height * r
      ctx.drawImage(im, (W - iw) / 2, boxY + (boxH - ih) / 2, iw, ih)
      this.paintRest(ctx, W, H, d)
      finish()
    }
    im.onerror = () => {
      ctx.fillStyle = '#233c2c'
      ctx.beginPath(); ctx.arc(W / 2, 400, 140, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#90c8a4'; ctx.font = '500 84px ' + SERIF
      ctx.fillText('练', W / 2, 430)
      this.paintRest(ctx, W, H, d)
      finish()
    }
    im.src = d.stage
  },

  paintRest(ctx, W, H, d) {
    const SERIF = 'Songti SC, STSong, serif'
    // 昵称 + 境界
    ctx.textAlign = 'center'
    ctx.fillStyle = '#e8dcc0'; ctx.font = '500 42px ' + SERIF
    ctx.fillText(d.nick, W / 2, 690)
    ctx.fillStyle = '#c9b98a'; ctx.font = '400 28px ' + SERIF
    ctx.fillText('Lv.' + d.level + ' · ' + d.title + ' · ' + d.realm, W / 2, 732)

    // 数据块
    const stats = d.mode === 'today'
      ? [{ v: d.todayTons + ' 吨', l: '本次举铁' }, { v: d.todaySets + ' 组', l: '今日完成' }, { v: d.focus, l: '今日功课', small: true }]
      : [{ v: d.allTons + ' 吨', l: '累计举起' }, { v: d.streak + ' 天', l: '连续修炼' }, { v: d.days + ' 天', l: '入坑修行' }]
    const bw = 196, gap = 22, total = bw * 3 + gap * 2, x0 = (W - total) / 2, by = 780
    stats.forEach((s, i) => {
      const x = x0 + i * (bw + gap)
      ctx.fillStyle = '#1a2016'
      roundRect(ctx, x, by, bw, 150, 18); ctx.fill()
      ctx.strokeStyle = '#3a3323'; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = '#d5bd87'
      ctx.font = (s.small ? '500 24px ' : '500 44px ') + SERIF
      ctx.fillText(s.v, x + bw / 2, by + (s.small ? 78 : 76))
      ctx.fillStyle = '#a89668'; ctx.font = '400 22px ' + SERIF
      ctx.fillText(s.l, x + bw / 2, by + 118)
    })

    // 玄衡批语（朱砂框）
    const cy = 990
    ctx.fillStyle = 'rgba(168,50,50,0.10)'
    roundRect(ctx, 60, cy, W - 120, 120, 10); ctx.fill()
    ctx.strokeStyle = '#a83232'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = '#e8b4b4'; ctx.font = '400 22px ' + SERIF
    ctx.textAlign = 'left'
    wrapText(ctx, '「' + d.comment + '」', 82, cy + 42, W - 164, 32)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#a83232'; ctx.font = '400 20px ' + SERIF
    ctx.fillText('—— 玄衡 批', W - 82, cy + 102)

    // 底部品牌 + 核心口号 + 引导
    ctx.textAlign = 'left'
    ctx.fillStyle = '#d5bd87'; ctx.font = '500 38px ' + SERIF
    ctx.fillText('练不虚', 46, H - 206)
    ctx.fillStyle = '#a83232'; ctx.font = '400 24px ' + SERIF
    ctx.fillText(SLOGAN_CORE, 46, H - 160)
    ctx.fillStyle = '#a89668'; ctx.font = '400 22px ' + SERIF
    ctx.fillText('微信小程序搜「练不虚」/ 点下方发给好友', 46, H - 116)
  },

  save() {
    if (!this.data.img) { wx.showToast({ title: '还在生成，等一下', icon: 'none' }); return }
    wx.saveImageToPhotosAlbum({
      filePath: this.data.img,
      success: () => wx.showToast({ title: '已存到相册' }),
      fail: () => {
        wx.showModal({
          title: '需要相册权限',
          content: '在设置里允许「保存到相册」；或者直接截图这张海报发给朋友。',
          confirmText: '去设置',
          success: r => { if (r.confirm) wx.openSetting() }
        })
      }
    })
  },

  onShareAppMessage() {
    const s = this.data.stats || {}
    return {
      title: (s.mode === 'today' ? '今日举铁 ' + (s.todayTons || '0') + ' 吨 · ' : '累计举起 ' + (s.allTons || '0') + ' 吨 · ') + '三月河东，三月河西，莫欺少年凡胎弱',
      imageUrl: this.data.img || '',
      path: '/pages/index/index'
    }
  },
  onShareTimeline() {
    return { title: '三月河东，三月河西，莫欺少年凡胎弱 · 我在「练不虚」修炼中' }
  }
})
