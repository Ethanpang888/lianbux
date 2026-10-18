Component({
  data: {
    selected: 0,
    color: "#999999",
    selectedColor: "#0e9f6e",
    list: [
      { pagePath: "/pages/index/index", text: "首页" },
      { pagePath: "/pages/today/today", text: "今日" },
      { pagePath: "/pages/plan/plan", text: "计划" },
      { pagePath: "/pages/tcm/tcm", text: "调理" },
      { pagePath: "/pages/profile/profile", text: "我的" }
    ]
  },
  methods: {
    switchTab(e) {
      const path = e.currentTarget.dataset.path
      wx.switchTab({ url: path })
    }
  }
})
