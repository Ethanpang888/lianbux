const app = getApp()
const gamify = require('../../utils/gamify.js')

/* 排行榜（与网站同榜）：共享云端池 rankrows，网站用户 + 小程序用户同池竞技。
   只排坚持与容量：等级 / 连续天数 / 本周训练量。不排体重、不排体型。
   城市来自 profile.city（自选，不做定位）。每次拉榜云端会顺手刷新自己那行（服务端重放，改不了）。 */

const BOARDS = [
  { k: 'level', name: '等级榜', unit: 'Lv' },
  { k: 'streak', name: '连续榜', unit: '天' },
  { k: 'volume', name: '本周榜', unit: '吨' }
]

require('../../utils/page.js')({
  data: {
    scope: 'city', board: 'level',
    BOARDS: BOARDS,
    cityList: [], city: '', needCity: false,
    rows: null, me: null, total: 0, loading: true, err: ''
  },

  onShow() {
    const g = app.globalData
    if (!g.openid) { setTimeout(() => this.onShow(), 300); return }
    const loadProfile = g.profile
      ? Promise.resolve(g.profile)
      : app.loadUser().then(() => app.globalData.profile).catch(() => ({}))
    loadProfile.then(profile => {
      const city = gamify.normCity((profile || {}).city || '')
      this.setData({
        city,
        cityList: gamify.CITIES,
        scope: 'all',
        needCity: false
      })
      // 有城市默认同城榜，没有就先看全国榜（顶部提示去设城市）
      if (city) this.setData({ scope: 'city' })
      this.refresh()
    })
  },

  refresh() {
    this.setData({ loading: true, err: '' })
    wx.cloud.callFunction({
      name: 'webApi',
      data: { action: 'mpBoard', scope: this.data.scope, city: this.data.city, board: this.data.board, limit: 50 }
    }).then(r => {
      const res = (r && r.result) || {}
      if (!res.ok) throw new Error(res.code || 'SERVER')
      const list = res.list || []
      // 榜值展示格式与网站一致：连续=天 / 容量=吨 / 等级=Lv N
      list.forEach(x => {
        x.valText = this.data.board === 'streak' ? (x.streak + ' 天')
          : this.data.board === 'volume' ? (x.volume + ' 吨')
          : ('Lv ' + x.level)
        x.medal = x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : ''
      })
      this.setData({ rows: list, me: res.me || null, total: res.total || list.length, loading: false })
    }).catch(e => {
      this.setData({ loading: false, err: '榜单加载失败：' + ((e && e.message) || '稍后再试'), rows: [] })
    })
  },

  setScope(e) {
    const s = e.currentTarget.dataset.s
    if (s === 'city' && !this.data.city) { wx.showToast({ title: '先选个城市', icon: 'none' }); return }
    this.setData({ scope: s })
    this.refresh()
  },
  setBoard(e) {
    this.setData({ board: e.currentTarget.dataset.b })
    this.refresh()
  },
  setCity(e) {
    const city = e.currentTarget.dataset.c
    this.setData({ city, scope: 'city', needCity: false })
    // 写进档案（保存后云端拉榜时会带上城市）
    const g = app.globalData
    if (g.profile) {
      g.profile.city = city
      app.saveUser({ profile: g.profile }).catch(() => {})
    }
    wx.showToast({ title: '城市已设为 ' + city, icon: 'none' })
    this.refresh()
  },
  goProfile() { wx.switchTab({ url: '/pages/profile/profile' }) }
})
