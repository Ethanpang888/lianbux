/* src/components/ui.js —— 通用 UI 组件（toast / modal / 进度条 / 指标格 / 骨架） */
const UI = {
  toast(msg, ms) {
    const box = document.getElementById('toastbox')
    box.innerHTML = '<div class="toast">' + Fmt.esc(msg) + '</div>'
    clearTimeout(this._t)
    this._t = setTimeout(() => { box.innerHTML = '' }, ms || 2200)
  },

  /** 弹窗：opts = { title, body(html), okText, onOk, cancelText } */
  modal(opts) {
    const box = document.getElementById('modalbox')
    const o = opts || {}
    box.innerHTML =
      '<div class="mask" id="mk"><div class="sheet"><h3>' + Fmt.esc(o.title || '提示') + '</h3>' +
      (o.body || '') +
      '<div style="margin-top:14px;display:flex;gap:8px">' +
      '<button class="btn" id="mok" style="width:auto;flex:1.6">' + Fmt.esc(o.okText || '确定') + '</button>' +
      (o.cancelText === false ? '' : '<button class="btn line" id="mcancel" style="width:auto;flex:1">' + Fmt.esc(o.cancelText || '取消') + '</button>') +
      '</div></div></div>'
    const close = () => { box.innerHTML = '' }
    document.getElementById('mk').onclick = e => { if (e.target.id === 'mk') close() }
    document.getElementById('mcancel') && (document.getElementById('mcancel').onclick = close)
    document.getElementById('mok').onclick = () => {
      const keep = o.onOk && o.onOk(document.getElementById('mok'))
      if (!keep) close()
    }
    o.after && o.after()
    return close
  },

  confirm(title, onOk) {
    return this.modal({ title, okText: '确定', onOk })
  },

  /** 进度条 */
  bar(label, val, target, unit, opts) {
    const o = opts || {}
    const pct = target > 0 ? Math.min(100, Math.round(val / target * 100)) : 0
    const over = target > 0 && val > target * (o.tolerance || 1.08)
    return '<div class="prog"><div class="lab"><span>' + Fmt.esc(label) + '</span><b>' +
      Fmt.num(val, o.digits || 0) + ' / ' + Fmt.num(target, o.digits || 0) + ' ' + (unit || '') + '</b></div>' +
      '<div class="track"><div class="fill ' + (over ? 'over' : (pct >= 100 ? '' : 'warn')) + '" style="width:' + pct + '%"></div></div></div>'
  },

  /** 四宫格指标 */
  kv(items) {
    return '<div class="kv">' + items.map(i =>
      '<div><b>' + Fmt.esc(i.v) + '</b><span>' + Fmt.esc(i.k) + '</span></div>').join('') + '</div>'
  },

  /** 列表行 */
  li(left, mid, right) {
    return '<div class="li"><span class="nm">' + left + '</span>' +
      (mid ? '<span class="mc">' + mid + '</span>' : '') +
      (right ? '<span class="mc">' + right + '</span>' : '') + '</div>'
  },

  skeleton(rows) {
    return Array.from({ length: rows || 3 }, () => '<div class="skel"></div>').join('')
  },

  /**
   * 折线小图。points = ENGINE.macro.sparkline(...) 的输出（x/y 已归一化到 0..1）
   * opts: { w, h, color, showDots, baseline(0~1，画一条虚线参考线) }
   */
  sparkline(points, opts) {
    const p = points || []
    if (p.length < 2) return UI.empty('数据还不够画曲线')
    const o = opts || {}
    const W = o.w || 480, H = o.h || 110, pad = 12
    const X = v => pad + (W - pad * 2) * v
    const Y = v => pad + (H - pad * 2) * (1 - v)          // y=1 在顶部
    const pts = p.map(q => Fmt.round(X(q.x), 1) + ',' + Fmt.round(Y(q.y), 1))
    const last = p[p.length - 1]
    let baseline = ''
    if (typeof o.baseline === 'number') {
      const by = Fmt.round(Y(o.baseline), 1)
      baseline = '<line x1="' + pad + '" y1="' + by + '" x2="' + (W - pad) + '" y2="' + by +
        '" stroke="#c9ced6" stroke-width="1.5" stroke-dasharray="5 5"></line>'
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:' + H + 'px">' +
      baseline +
      '<polyline fill="none" stroke="' + (o.color || '#0e9f6e') + '" stroke-width="2.5" ' +
        'stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(' ') + '"></polyline>' +
      (o.showDots === false ? '' : p.map(q =>
        '<circle cx="' + Fmt.round(X(q.x), 1) + '" cy="' + Fmt.round(Y(q.y), 1) + '" r="3" fill="' +
        (o.color || '#0b7d56') + '"></circle>').join('')) +
      '<circle cx="' + Fmt.round(X(last.x), 1) + '" cy="' + Fmt.round(Y(last.y), 1) + '" r="5.5" fill="#fff" stroke="' +
        (o.color || '#0e9f6e') + '" stroke-width="2.5"></circle>' +
      '</svg>'
  },

  /** 一行「键：旧值 → 新值」，用于调控前后对比 */
  deltaRow(k, from, to, unit) {
    const same = from === to
    const arrow = same ? '＝' : (to > from ? '↑' : '↓')
    return '<div class="pn-row"><span class="k">' + Fmt.esc(k) + '</span>' +
      '<span class="v"><span class="muted">' + Fmt.esc(from) + (unit || '') + '</span> ' +
      '<b style="color:' + (same ? 'var(--sub)' : 'var(--green-dark)') + '">' + arrow + ' ' +
      Fmt.esc(to) + (unit || '') + '</b></span></div>'
  },

  empty(text) { return '<div class="empty">' + Fmt.esc(text) + '</div>' }
}
