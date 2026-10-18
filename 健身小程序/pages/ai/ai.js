// pages/ai/ai.js —— 随身导师（AI 顾问）：小程序通道，云端走 webApi 的 mpAiChat（openid 鉴权）
const app = getApp()

/** 把回复文本解析成 rich-text nodes：按空行分段，行内 **x** 加粗 */
function toNodes(text) {
  const nodes = []
  String(text || '').split('\n').forEach(line => {
    if (!line.trim()) return
    const children = []
    String(line).split(/\*\*(.+?)\*\*/g).forEach((seg, i) => {
      if (!seg) return
      children.push(i % 2
        ? { name: 'b', attrs: { style: 'font-weight:700;' }, children: [{ type: 'text', text: seg }] }
        : { type: 'text', text: seg })
    })
    nodes.push({ name: 'div', attrs: { style: 'margin:8rpx 0;line-height:1.7;' }, children })
  })
  return nodes
}

const QUICK = [
  '这周帮我复盘一下',
  '我最近没进步，怎么破',
  '外卖怎么点才不掉肌肉',
  '练完吃什么长得快'
]

// 错误码 → 人话（与网站 ai.js 同口径）
const ERR_MAP = {
  AI_QUOTA: '今天的免费咨询次数用完了（每天 3 次）。明天再来，或开通完整版每天 20 次。',
  NO_USER: '先在首页完善资料建档，导师才能看到你的数据。',
  AI_RATE: '导师太忙被限流了，稍等几秒再点重试。',
  AI_TIMEOUT: '这次等太久了，点重试再来一次。',
  AI_NETWORK: '网络开小差了，点重试再来一次。',
  AI_EMPTY: '问题好像没发出去，再试一次。',
  AI_NOT_CONFIGURED: '导师还没配置好，过几天再来。'
}

Page({
  data: {
    messages: [],       // {id, role, content, nodes?}
    input: '', sending: false, err: '',
    quota: null,        // {used, cap}
    quick: QUICK,
    anchor: ''
  },

  onLoad() { this.restore() },

  chatKey() { return 'lbgym_ai_chat_' + (app.globalData.openid || 'demo') },

  restore() {
    let ms = []
    try { ms = wx.getStorageSync(this.chatKey()) || [] } catch (e) {}
    this.setData({ messages: ms.map(m => m.role === 'assistant' ? Object.assign({}, m, { nodes: toNodes(m.content) }) : m) })
    setTimeout(() => this.toBottom(), 300)
  },

  save() {
    try {
      wx.setStorageSync(this.chatKey(), this.data.messages.slice(-40).map(m => ({ role: m.role, content: m.content })))
    } catch (e) { /* 存储满就算了 */ }
  },

  toBottom() { this.setData({ anchor: 'chat-bottom' }) },

  onInput(e) { this.setData({ input: e.detail.value }) },

  tapQuick(e) { this.send(e.currentTarget.dataset.q) },

  send(e) {
    if (this.data.sending) return
    // 入参三种形态：confirm 事件（e.detail.value）/ 快捷问（e.currentTarget.dataset.q）/ 字符串（retry）
    let text = ''
    if (typeof e === 'string') text = e
    else if (e && e.detail && typeof e.detail.value === 'string' && e.detail.value) text = e.detail.value
    else if (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.q) text = e.currentTarget.dataset.q
    else text = this.data.input
    text = String(text || '').trim()
    if (!text) return
    if (!app.globalData.openid) {
      this.setData({ err: '还没连上账号，等几秒再发一次' }); return
    }
    const history = this.data.messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
    const messages = history.concat([{ role: 'user', content: text.slice(0, 2000) }])
    const ms = this.data.messages.concat([{ id: 'u' + Date.now(), role: 'user', content: text }])
    this.setData({ messages: ms, input: '', sending: true, err: '' }, () => this.toBottom())
    wx.cloud.callFunction({
      name: 'webApi',
      data: { action: 'mpAiChat', messages },
      success: res => {
        const r = (res && res.result) || {}
        if (!r.ok) { this.handleErr(r.code); return }
        const reply = { id: 'a' + Date.now(), role: 'assistant', content: r.text, nodes: toNodes(r.text) }
        this.setData({
          messages: this.data.messages.concat([reply]),
          sending: false,
          quota: r.quota || null
        }, () => { this.save(); this.toBottom() })
      },
      fail: () => this.handleErr('AI_NETWORK')
    })
  },

  handleErr(code) {
    this.setData({ sending: false, err: ERR_MAP[code] || '出了点问题，点重试再试一次' }, () => this.toBottom())
  },

  // 重试：拿最后一条用户消息重发
  retry() {
    const ms = this.data.messages
    for (let i = ms.length - 1; i >= 0; i--) {
      if (ms[i].role === 'user') { this.send(ms[i].content); return }
    }
  },

  clearChat() {
    const that = this
    wx.showModal({
      title: '清空对话', content: '聊天记录只存在你的手机上，清空后找不回来。',
      confirmText: '清空', cancelText: '留着',
      success(res) {
        if (res.confirm) {
          try { wx.removeStorageSync(that.chatKey()) } catch (e) {}
          that.setData({ messages: [], err: '', quota: null })
        }
      }
    })
  }
})
