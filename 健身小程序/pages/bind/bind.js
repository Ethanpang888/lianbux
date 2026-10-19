const app = getApp()

/* 绑定网站账号：网站「我的」页生成 6 位码 → 这里输入 → 两端打卡数据互通（双向镜像） */
require('../../utils/page.js')({
  data: {
    bound: false, webNick: '', checking: true,
    code: '', busy: false, backfill: null
  },

  onShow() {
    const g = app.globalData
    if (!g.openid) { setTimeout(() => this.onShow(), 300); return }
    this.check()
  },

  check() {
    this.setData({ checking: true })
    wx.cloud.callFunction({ name: 'webApi', data: { action: 'mpBindStatus' } })
      .then(r => {
        const res = (r && r.result) || {}
        this.setData({ checking: false, bound: !!res.bound, webNick: res.webNick || '' })
      })
      .catch(() => this.setData({ checking: false, err: '状态查询失败' }))
  },

  onCode(e) { this.setData({ code: e.detail.value }) },

  confirm() {
    const code = (this.data.code || '').trim()
    if (!/^\d{6}$/.test(code)) { wx.showToast({ title: '请输 6 位数字码', icon: 'none' }); return }
    this.setData({ busy: true })
    wx.cloud.callFunction({ name: 'webApi', data: { action: 'mpBindConfirm', code } })
      .then(r => {
        const res = (r && r.result) || {}
        if (!res.ok) throw new Error(res.code || 'FAILED')
        const bf = res.backfill || {}
        this.setData({ busy: false, bound: true, webNick: res.webNick || '', backfill: bf })
        const msg = bf.mpToWeb || bf.webToMp
          ? ('同步完成：' + bf.mpToWeb + ' 天 → 网站，' + bf.webToMp + ' 天 → 小程序')
          : '绑定成功，之后两边打卡自动互通'
        wx.showToast({ title: msg, icon: 'none', duration: 3000 })
      })
      .catch(e => {
        this.setData({ busy: false })
        const map = { BAD_CODE: '请输 6 位数字码', CODE_EXPIRED: '码已过期，回网站重新生成', WEB_USER_MISSING: '网站账号不存在', NO_USER: '请先打开小程序登录' }
        wx.showToast({ title: map[(e && e.message)] || ('绑定失败：' + ((e && e.message) || '')), icon: 'none', duration: 3000 })
      })
  },

  unbind() {
    wx.showModal({
      title: '解除绑定', content: '解绑后两边新打卡不再互通（已同步的数据保留）。确定？',
      success: r => {
        if (!r.confirm) return
        wx.cloud.callFunction({ name: 'webApi', data: { action: 'mpUnbind' } })
          .then(() => { wx.showToast({ title: '已解绑', icon: 'none' }); this.check() })
          .catch(() => wx.showToast({ title: '操作失败', icon: 'none' }))
      }
    })
  }
})
