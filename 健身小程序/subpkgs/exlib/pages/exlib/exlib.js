const kb = require('../../utils/kb.js')

require('../../../../utils/page.js')({
  data: {
    list: [], parts: kb.PARTS, equips: kb.EQUIP, levels: kb.LEVELS,
    part: '', equip: '', level: '', q: '', mode: '', home: false
  },
  onLoad(q) {
    const mode = q.mode || ''
    const qv = q.q || ''
    this.setData({ mode, q: qv })
    if (qv) wx.setNavigationBarTitle({ title: '「' + qv + '」示范' })
    this.filter()
  },
  onPart(e) { this.setData({ part: e.currentTarget.dataset.v }); this.filter() },
  onEquip(e) { this.setData({ equip: e.currentTarget.dataset.v, home: false }); this.filter() },
  onLevel(e) { this.setData({ level: e.currentTarget.dataset.v }); this.filter() },
  onHome() {
    const on = !this.data.home
    // 开启居家：清空器械筛选，保留部位/难度/搜索；关闭居家：不清空其他条件
    this.setData({ home: on, equip: '' })
    this.filter()
  },
  clear() { this.setData({ part: '', equip: '', level: '', q: '', home: false }); this.filter() },

  filter() {
    let list = kb.getExercises({
      part: this.data.part || null,
      equipment: this.data.home ? '无器械' : (this.data.equip || null),
      level: this.data.level || null
    })
    const q = this.data.q
    if (q) list = list.filter(e => e.name.indexOf(q) >= 0)
    this.setData({ list })
    if (q && list.length === 0) {
      wx.showToast({ title: `未找到「${q}」示范`, icon: 'none' })
    }
  },

  tap(e) {
    const name = e.currentTarget.dataset.name
    const ex = kb.getExercises({}).find(e => e.name === name)
    if (this.data.mode === 'select') {
      const ch = this.getOpenerEventChannel && this.getOpenerEventChannel()
      if (ch && ch.emit) ch.emit('select', ex || { name })
      wx.navigateBack()
    } else {
      wx.navigateTo({ url: '/subpkgs/exlib/pages/exdetail/exdetail?name=' + encodeURIComponent(name) })
    }
  }
})
