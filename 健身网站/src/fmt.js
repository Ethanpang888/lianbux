/* src/fmt.js —— 格式化与通用工具（无依赖） */
const Fmt = {
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  },
  round(n, d = 0) { const p = Math.pow(10, d); return Math.round((Number(n) || 0) * p) / p },
  clamp(v, a, b) { return Math.min(b, Math.max(a, v)) },
  todayStr(d) {
    d = d || new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  },
  shiftDate(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() + n)
    return Fmt.todayStr(d)
  },
  dayDiff(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000) },
  /** ISO 周 key：2026-W38（周一为一周起点） */
  weekKey(dateStr) {
    const d = new Date((dateStr || Fmt.todayStr()) + 'T00:00:00')
    const day = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - day + 3) // 移到周四
    const firstThu = new Date(d.getFullYear(), 0, 4)
    const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7)
    return d.getFullYear() + '-W' + String(week).padStart(2, '0')
  },
  weekdayCN(dateStr) {
    const w = ['日', '一', '二', '三', '四', '五', '六'][new Date(dateStr + 'T00:00:00').getDay()]
    return '周' + w
  },
  monthDay(dateStr) {
    const p = String(dateStr).split('-')
    return Number(p[1]) + '月' + Number(p[2]) + '日'
  },
  num(n, d = 0) {
    const v = Fmt.round(n, d)
    if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + '万'
    return String(v)
  }
}
