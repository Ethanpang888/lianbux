Component({
  properties: {
    frames: { type: null, value: [] },
    equip: { type: String, value: '' },
    speed: { type: Number, value: 550 },     // 单帧时长(ms)，整周期 = 2*speed（A 淡出同时 B 淡入，再回来）。2026-10-17 对齐网站 1.1s 周期
    mode: { type: String, value: 'anim' },   // 'anim' = 交叉淡化循环；'static' = 只显示海报帧
    poster: { type: Number, value: 0 },
    interactive: { type: Boolean, value: false } // true=详情页：点图暂停/播放；false=列表：点图冒泡给卡片跳转
  },
  data: { list: [], isHome: false, err: false, paused: false, visible: true },
  observers: {
    frames(val) {
      const list = Array.isArray(val) ? val.slice() : (val ? [val] : [])
      this.setData({ list, err: false })
    },
    equip(v) { this.setData({ isHome: v === '无器械' }) }
  },
  lifetimes: {
    attached() {
      // 进入视口才播放，滚出视口自动暂停 → 避免一屏外几百个动画同时跑拖慢低端机
      if (this._io) return
      this._io = this.createIntersectionObserver()
      this._io.relativeToViewport().observe('.fg', (res) => {
        const visible = res.intersectionRatio > 0
        if (this.data.visible !== visible) this.setData({ visible })
      })
    },
    detached() {
      if (this._io) { this._io.disconnect(); this._io = null }
    }
  },
  methods: {
    toggle() {
      if (this.data.mode !== 'anim' || this.data.list.length <= 1) return
      this.setData({ paused: !this.data.paused })
    },
    onErr() { this.setData({ err: true }) }
  }
})
