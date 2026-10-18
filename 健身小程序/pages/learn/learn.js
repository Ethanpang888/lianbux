const kb = require('../../utils/kb.js')

Page({
  data: { list: [], openIdx: -1 },
  onLoad(q) {
    this.setData({ list: kb.LEARN })
    if (q.day) this.setData({ openIdx: Number(q.day) - 1 })
  },
  toggle(e) {
    const i = e.currentTarget.dataset.i
    this.setData({ openIdx: this.data.openIdx === i ? -1 : i })
  },
  goEx(e) {
    const name = e.currentTarget.dataset.name
    wx.navigateTo({ url: '/subpkgs/exlib/pages/exlib/exlib?q=' + encodeURIComponent(name) })
  }
})
