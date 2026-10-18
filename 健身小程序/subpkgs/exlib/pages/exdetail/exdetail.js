const data = require('../../utils/exercises-data.js')
const EX = Array.isArray(data) ? data : (data.EX || [])

Page({
  data: { ex: null },
  onLoad(o) {
    const name = decodeURIComponent(o.name || '')
    const ex = EX.find(e => e.name === name) || null
    if (ex) wx.setNavigationBarTitle({ title: ex.name })
    this.setData({ ex })
  }
})
