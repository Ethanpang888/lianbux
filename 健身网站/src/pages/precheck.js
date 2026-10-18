/* src/pages/precheck.js —— 练前「内视」自评（2026-10-17 留存 P0）
 *
 * 4 维滑块（1-5）：睡眠 / 精力 / 酸痛 / 意愿 → 总分三档建议。
 * 原则（用户确认）：只建议、不强制。不减用户权重、不锁任何东西。
 * 复用：tired 档写入 profile.todayState —— 完整版的 pro.applyState 已会按它降量（旧机制接新入口）。
 * 幂等：每天首次进训练页弹一次（localStorage 记录），提交后本日内不再弹。
 */
const PagePreCheck = {
  DIMS: [
    { k: 'sleep', label: '昨晚睡眠', lo: '彻夜难眠', hi: '一觉天明' },
    { k: 'energy', label: '今日精力', lo: '像被抽干', hi: '电力满格' },
    { k: 'ache', label: '筋骨酸痛', lo: '酸软如泥', hi: '毫无疲态' },
    { k: 'will', label: '训练意愿', lo: '完全不想动', hi: '战意盎然' }
  ],

  keyOf(date) { return 'lbgym_precheck_' + date },

  /** 今天是否已评过（本机；弹过一次就够） */
  doneToday() {
    try { return !!localStorage.getItem(this.keyOf(Fmt.todayStr())) } catch (e) { return false }
  },

  /** 训练日 + 今天没评过 → 弹。restDay 由调用方判断后传入 */
  maybeShow(date, isTrainDay) {
    if (!isTrainDay) return
    if (date !== Fmt.todayStr()) return   // 只看今天，不挡回看历史
    if (this.doneToday()) return
    this.show()
  },

  show() {
    const old = document.getElementById('precheckModal'); if (old) old.remove()
    const el = document.createElement('div'); el.id = 'precheckModal'
    const rows = this.DIMS.map((d, i) =>
      '<div style="margin-top:14px;text-align:left">' +
        '<div style="display:flex;justify-content:space-between;font-size:13px"><b>' + d.label + '</b>' +
        '<span class="muted txs" id="pcVal' + i + '">3 分 · 平平</span></div>' +
        '<input type="range" min="1" max="5" step="1" value="3" data-i="' + i + '" class="pcRange" style="width:100%;margin-top:6px;accent-color:var(--green)">' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--sub)"><span>' + d.lo + '</span><span>' + d.hi + '</span></div>' +
      '</div>').join('')
    el.innerHTML = '<div style="position:fixed;inset:0;z-index:2400;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box">' +
      '<div class="card" style="max-width:400px;width:100%;text-align:center;max-height:90vh;overflow-y:auto">' +
        '<h2>开练前，内视一下</h2>' +
        '<div class="muted txs" style="margin-top:4px">四项各打 1-5 分。老夫按你的状态给今日建议——<b>只建议，不动你的计划</b>。</div>' +
        '<div id="pcTotal" style="font-size:26px;font-weight:500;color:var(--green-dark);margin-top:12px">总分 12 / 20</div>' +
        rows +
        '<div id="pcAdvice" style="margin-top:14px;padding:10px 12px;background:var(--bg);border-radius:10px;text-align:left;font-size:13px;line-height:1.7"></div>' +
        '<button class="btn" style="margin-top:16px;width:100%" id="pcGo">开始今日修炼</button>' +
        '<div class="muted txs" style="margin-top:8px;font-size:10px">每天只问一次 · 不会自动改你的重量和组数</div>' +
      '</div></div>'
    document.body.appendChild(el)
    const words = ['很差', '偏差', '平平', '不错', '很好']
    const paintAdvice = () => {
      const vals = [...el.querySelectorAll('.pcRange')].map(r => Number(r.value))
      const s = vals.reduce((a, b) => a + b, 0)
      document.getElementById('pcTotal').textContent = '总分 ' + s + ' / 20'
      vals.forEach((v, i) => { document.getElementById('pcVal' + i).textContent = v + ' 分 · ' + words[v - 1] })
      const a = this.advise(s, vals)
      document.getElementById('pcAdvice').innerHTML =
        '<b>' + a.title + '</b> · ' + a.text
    }
    el.querySelectorAll('.pcRange').forEach(r => { r.oninput = paintAdvice })
    paintAdvice()
    document.getElementById('pcGo').onclick = () => {
      const vals = [...el.querySelectorAll('.pcRange')].map(r => Number(r.value))
      this.submit(vals, vals.reduce((a, b) => a + b, 0))
      el.remove()
    }
  },

  /** 三档建议（PRD 状态一二三，用户确认版） */
  advise(s, vals) {
    if (s >= 16 && vals.every(v => v >= 3)) {
      return { key: 'peak', title: '气血充盈 · 可冲', text: '状态正盛——今日可按计划照常完成，主项有余力就安心加一点重量。药尊：给你脸你就接着，往死里推！' }
    }
    if (s <= 10 || vals.some(v => v === 1)) {
      return { key: 'tired', title: '疲劳态 · 建议减量', text: '神魂或筋骨不在线——今日建议主项减 1-2 组、重量降一成，练完做个拉伸就收工。药尊：硬撑大重量必遭反噬，留得青山在。' }
    }
    return { key: 'ok', title: '阴阳平和 · 常态', text: '状态平稳——按部就班完成今日功法即可，修行贵在日拱一卒。药尊：别贪，也别躲。' }
  },

  submit(vals, s) {
    const a = this.advise(s, vals)
    try { localStorage.setItem(this.keyOf(Fmt.todayStr()), JSON.stringify({ vals, s, key: a.key, at: Date.now() })) } catch (e) {}
    // 复用旧机制：疲劳档写 todayState，完整版 pro.applyState 会据此降量（不动免费版行为）
    if (a.key === 'tired') {
      const u = Store.state.user
      const p = Object.assign({}, u.profile, { todayState: { date: Fmt.todayStr(), key: 'tired' } })
      Store.saveCloud({ profile: p })
    }
    // 2026-10-18 线上复查：只 toast 不再弹第二层（两层弹窗被点名）
    UI.toast(a.title + ' —— ' + (a.key === 'tired' ? '完整版今日处方会自动降一成' : '按计划开练吧'))
  }
}
