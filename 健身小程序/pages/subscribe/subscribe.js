const app = getApp()

require('../../utils/page.js')({
  data: {
    email: '',
    agreed: false,
    subscribed: false,
    curEmail: '',
    saving: false
  },

  onShow() {
    const g = app.globalData
    if (!g.openid) { setTimeout(() => this.onShow(), 300); return }
    this.setData({ curEmail: g.email || '', subscribed: !!g.subscribed, email: g.email || '' })
  },

  onEmail(e) { this.setData({ email: e.detail.value }) },
  toggleAgree() { this.setData({ agreed: !this.data.agreed }) },

  subscribe() {
    const email = (this.data.email || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      wx.showToast({ title: '邮箱格式不对', icon: 'none' }); return
    }
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意隐私说明', icon: 'none' }); return
    }
    this.setData({ saving: true })
    app.saveUser({ email, subscribed: true }).then(() => {
      this.setData({ saving: false, subscribed: true, curEmail: email })
      wx.showToast({ title: '订阅成功', icon: 'none' })
    }).catch(() => {
      this.setData({ saving: false })
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  },

  unsubscribe() {
    app.saveUser({ subscribed: false }).then(() => {
      this.setData({ subscribed: false })
      wx.showToast({ title: '已取消', icon: 'none' })
    }).catch(() => {})
  }
})
