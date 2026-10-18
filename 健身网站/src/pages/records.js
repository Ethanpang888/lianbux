/* src/pages/records.js —— 记录页：月历热力 + 体重趋势 + 周报（M0 用本机数据） */
const PageRecords = {
  render() {
    const u = Store.state.user
    const cks = Store.state.checkins || []
    const today = Fmt.todayStr()
    const monthStart = today.slice(0, 7) + '-01'

    // 月历热力（当月）
    const first = new Date(monthStart + 'T00:00:00')
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const lead = (first.getDay() + 6) % 7
    const cells = []
    for (let i = 0; i < lead; i++) cells.push('<span></span>')
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = monthStart.slice(0, 8) + String(d).padStart(2, '0')
      const ck = cks.find(c => c.date === ds)
      const cls = ck && ck.trained ? 'hit' : (ck ? 'part' : '')
      cells.push('<span class="' + cls + '" title="' + ds + '">' + d + '</span>')
    }

    // 体重折线
    const ws = cks.filter(c => Number(c.weight) > 0).slice(-30)
    const chart = this.spark(ws)
    const todayCk = Store.checkinOf(today)
    const rev = (function () {
      try {
        return ENGINE.macro.review({
          checkins: cks, profile: u.profile, dietState: u.dietState, today
        })
      } catch (e) { return null }
    })()

    // 周报
    const week = Fmt.weekKey(today)
    const thisWeek = cks.filter(c => Fmt.weekKey(c.date) === week)
    const trainedN = thisWeek.filter(c => c.trained).length
    const weights = thisWeek.filter(c => Number(c.weight) > 0)
    const dw = weights.length >= 2 ? Fmt.round(weights[weights.length - 1].weight - weights[0].weight, 1) : null
    // 2026-10-18 线上复查：周报原来用绝对 kg 阈值，和宏观调控（每周 % 目标区间）不是一把尺，
    // 同一份数据能得出相反结论。现在统一成「折算每周 %」对 GOAL_TARGET 区间，并标明窗口与以谁为准。
    const curW = Number((u.profile || {}).weight) || 0
    const goal0 = (u.profile || {}).goal || '塑形'
    const tgt = (ENGINE.macro.GOAL_TARGET || {})[goal0] || (ENGINE.macro.GOAL_TARGET || {})['塑形']
    const spanDays = weights.length >= 2
      ? Math.max(1, Math.round((new Date(weights[weights.length - 1].date + 'T00:00:00') - new Date(weights[0].date + 'T00:00:00')) / 86400000))
      : 1
    const dwPct = dw !== null && curW > 0 ? Fmt.round((dw / curW) * (7 / spanDays) * 100, 2) : 0
    const trend = dw === null ? '本周体重记录不足 2 次（每天早起空腹称一次，这是系统唯一的传感器）' :
      (dwPct < tgt.min ? '本周折算每周 ' + dwPct + '% —— 掉得比目标快（' + tgt.tip + '），碳水每天 +0.25 g/kg 保住肌肉' :
       dwPct > tgt.max ? '本周折算每周 +' + dwPct + '% —— 涨得比目标快（' + tgt.tip + '），检查油与零食，碳水每天 −0.25 g/kg' :
       '体重基本持平（本周 ' + (dw > 0 ? '+' : '') + dw + ' kg · 每周 ' + (dwPct > 0 ? '+' : '') + dwPct + '%），' + tgt.tip) +
      '<div class="muted txs" style="margin-top:4px">周报只看本周 ' + spanDays + ' 天；<b>宏观调控看近 10 天趋势，以它的结论为准</b>。</div>'

    // 训练日志（一句话 + 照片 + 突破）
    const words = Store.latestWords()
    const logHTML =
      '<div class="card"><h2>训练日志 <span class="mini">' + cks.filter(c => c.note && (c.note.text || c.note.title)).length + ' 条</span></h2>' +
        (words
          ? '<div class="tl-note" style="margin-bottom:10px"><span class="tl-tag">最近</span>' +
            '<div class="tl-text">' + Fmt.esc(words.text) + '</div></div>'
          : '<p class="muted txs">还没写过记录。练完在「训练」页底部写一句，或者现在就补一条今天。</p>') +
        '<button class="btn ghost" id="writeToday">' + (ENGINE.journal.noteOf(Store.checkinOf(today)) ? '改今天的记录' : '写今天的记录') + '</button>' +
      '</div>' +
      '<div id="noteBox"></div>' +
      '<div class="card"><h2>过往记录</h2><div class="timeline">' +
        JournalUI.timelineHTML(cks, { limit: 20 }) + '</div></div>'

    document.getElementById('app').innerHTML =
      Router.bar('修炼记录', '打卡 ' + cks.length + ' 天 · 本月 ' + today.slice(0, 7)) +
      // 演示数据必须显式标注，不能让假曲线冒充真实进步（改版方案：演示说明保留简短标签）
      (Store.state.demo
        ? '<div class="card" style="border-left:3px solid var(--warn,#e0a92c)"><b>以下来自演示数据</b>' +
          '<div class="muted txs" style="margin-top:4px">这些体重和打卡是演示用的样例，不是你的真实记录。' +
          '注册登录后从你的真实数据开始记。</div></div>' : '') +
      this.strengthCard(cks) +
      this.compareCard() +
      '<div class="card"><h2>训练明细</h2>' +
        (cks.filter(c => (c.exercises || []).length).length ? cks.filter(c => (c.exercises || []).length).slice(-20).reverse().map(c => {
          const done = c.exercises.reduce((n,e) => n + (e.log || []).filter(s => s.done).length, 0)
          return '<details class="training-history"><summary>' + Fmt.esc(c.date) + ' · 已完成 ' + done + ' 组</summary>' +
            c.exercises.map(e => '<div class="history-ex"><b>' + Fmt.esc(e.name) + '</b><span>' + (e.log || []).map((s,i) => '第' + (i+1) + '组 ' + Fmt.esc(s.weight || 0) + 'kg × ' + Fmt.esc(s.reps || 0) + (s.done ? ' ✓' : '')).join(' / ') + '</span></div>').join('') +
            '<button class="btn ghost" onclick="Router.go(\'today/' + Fmt.esc(c.date) + '\')">查看当天训练</button></details>'
        }).join('') : '<p class="muted txs">训练后保存打卡，就能在这里回看重量和次数。</p>') + '</div>' +
      logHTML +

      // 记体重：整套宏观调控的「传感器」，必须一步可达
      '<div class="card">' +
        '<h2>今天体重 <span class="mini">早起空腹 · 同上秤</span></h2>' +
        '<div class="row" style="gap:10px">' +
          '<input id="wIn" type="number" inputmode="decimal" step="0.1" placeholder="如 93.2" ' +
            'value="' + (todayCk && todayCk.weight ? todayCk.weight : '') + '" ' +
            'style="flex:1;padding:12px;border:2px solid var(--line);border-radius:var(--r-md);font-size:16px;text-align:center">' +
          '<span class="muted">kg</span>' +
          '<button class="btn" id="wSave" style="width:120px">保存</button>' +
        '</div>' +
        '<div class="muted txs" style="margin-top:8px">' +
          (rev && rev.ready
            ? '已够数据评估（近 ' + rev.window.days + ' 天）→ 去「饮食」页看宏观调控建议'
            : (rev && rev.progress
              ? '再记 ' + ((rev.progress.needDays || 7) - (rev.progress.haveDays || 0)) +
                ' 天、满 ' + (rev.progress.needPoints || 4) + ' 次，就能自动评估饮食该不该调'
              : '每天记一次，攒够 7 天就能自动评估饮食该不该调')) +
        '</div>' +
      '</div>' +

      '<div class="card"><h2>本月打卡</h2>' +
        '<div class="heat">' + ['一', '二', '三', '四', '五', '六', '日'].map(d => '<span class="hdr">' + d + '</span>').join('') +
        cells.join('') + '</div>' +
        '<div class="muted txs" style="margin-top:8px">深色 = 完成训练打卡；浅色 = 有记录未训练</div>' +
      '</div>' +

      '<div class="card"><h2>体重趋势 <span class="mini">' + ws.length + ' 条记录</span></h2>' +
        (ws.length ? chart : UI.empty('还没有体重记录')) +
        (ws.length >= 2 ? '<div class="muted txs">' + ws[0].weight + 'kg → ' + ws[ws.length - 1].weight + 'kg（' +
          Fmt.round(ws[ws.length - 1].weight - ws[0].weight, 1) + 'kg）</div>' : '') +
      '</div>' +

      '<div class="card"><h2>本周复盘 <span class="mini">' + Fmt.esc(week) + '</span></h2>' +
        UI.li('训练', trainedN + ' 天', '') +
        UI.li('体重变化', dw === null ? '—' : (dw > 0 ? '+' : '') + dw + ' kg', '') +
        '<div class="muted txs" style="margin-top:8px">💡 ' + Fmt.esc(trend) + '</div>' +
        (rev && rev.ready ? '<div class="muted txs">📊 宏观调控：' + Fmt.esc(rev.headline) + '（' +
          Fmt.esc(rev.target.tip) + '）</div>' : '') +
      '</div>'

    this.bindWeight(today)
    this.bindJournal()
    this.bindCompare()
  },

  /**
   * 力量估算卡：主项最佳估算 1RM（Epley 公式）+ 停滞提示。
   * 口径：e1RM = 重量 ×（1 + 次数/30），只统计有重量的完成组，近 90 天。
   * 停滞 = 同一动作**连续 2 次训练**所有完成组都没做满目标次数 → 提示去调整顾问（不自动改计划）。
   */
  strengthCard(cks) {
    const cutoff = Fmt.shiftDate(Fmt.todayStr(), -90)
    const per = {}
    cks.filter(c => c.date >= cutoff).forEach(c => {
      ;(c.exercises || []).forEach(e => {
        if (!e || !e.name) return
        const target = parseInt(String(e.sets || '').split(/[×x]/i)[1], 10) || 10
        const p = per[e.name] || (per[e.name] = { name: e.name, sets: e.sets || '', best: 0, bestAt: '', bestRep: 0, sessions: [] })
        const day = { date: c.date, hit: false, logged: false }
        ;(e.log || []).forEach(s => {
          const w = Number(s.weight) || 0, r = Number(s.reps) || 0
          if (w > 0 && r > 0 && s.done) {
            day.logged = true
            if (r >= target) day.hit = true
            const e1rm = w * (1 + r / 30)
            if (e1rm > p.best) { p.best = e1rm; p.bestAt = c.date; p.bestRep = r }
          }
        })
        if (day.logged) p.sessions.push(day)
      })
    })
    const rows = Object.keys(per).map(k => per[k])
      .filter(p => p.best > 0)
      .sort((a, b) => b.best - a.best)
      .slice(0, 8)
    rows.forEach(p => {   // 从最近往前数连续未达标（最多看 6 次）
      let miss = 0
      const ss = p.sessions.slice(-6).reverse()
      for (let i = 0; i < ss.length; i++) { if (ss[i].hit) break; miss++ }
      p.stall = miss >= 2 ? miss : 0
    })
    if (!rows.length) {
      return '<div class="card"><h2>力量估算</h2>' +
        '<p class="muted txs">练满几次带重量的打卡后，这里会估算你的主项极限重量（1RM），' +
        '并自动发现「连续做不满目标次数」的停滞动作。</p></div>'
    }
    return '<div class="card"><h2>力量估算 <span class="mini">近 90 天 · 最佳估算 1RM</span></h2>' +
      rows.map(p =>
        '<div class="history-ex" style="align-items:center"><b>' + Fmt.esc(p.name) + '</b>' +
        '<span>' + Fmt.round(p.best, 1) + ' kg <span class="mini">（' + Fmt.esc(p.bestAt) + ' · ' + p.bestRep + ' 次推出）</span></span>' +
        (p.stall ? '<span class="tag warn">连续 ' + p.stall + ' 次没做满 ' + Fmt.esc((p.sets.split(/[×x]/i)[1] || '')) + ' 次</span>' : '') +
        '</div>').join('') +
      (rows.some(p => p.stall)
        ? '<button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'coach\')">有停滞动作 → 去调一下</button>'
        : '') +
      '<div class="muted txs" style="margin-top:8px">估算口径：Epley 公式（重量 ×（1+次数/30）），由你打卡的实测推出，供参考——' +
        '排计划仍以实际完成的组次为准。连续 2 次没做满目标次数 = 停滞信号，该减载或换动作了。</div>' +
    '</div>'
  },

  /** 体型对比：两张进度照滑块擦除（照片只存本机，不外传） */
  compareCard() {
    const phs = Store.photosAll ? Store.photosAll() : []
    if (phs.length < 2) {
      return '<div class="card"><h2>体型对比</h2>' +
        '<p class="muted txs">拍满两张体型照后，这里能拖动滑块前后对比。' +
        '拍照在训练页练完后的「训练日志」里，照片只存在你手机/电脑本机。</p></div>'
    }
    const opt = phs.map((p, i) => '<option value="' + i + '">' + Fmt.esc(p.date) + '</option>').join('')
    return '<div class="card"><h2>体型对比 <span class="mini">拖动滑块 · 照片仅存本机</span></h2>' +
      '<div class="row" style="gap:8px;margin-bottom:8px">' +
        '<select id="cmpA" style="flex:1">' + opt + '</select>' +
        '<span class="muted txs">vs</span>' +
        '<select id="cmpB" style="flex:1">' + opt + '</select>' +
      '</div>' +
      '<div style="position:relative;width:100%;height:300px;background:var(--bg);border-radius:var(--r-md);overflow:hidden">' +
        '<img id="cmpBimg" alt="较近的照片" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">' +
        '<img id="cmpAimg" alt="较早的照片" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;clip-path:inset(0 50% 0 0)">' +
        '<div id="cmpLine" style="position:absolute;top:0;bottom:0;left:50%;width:2px;background:var(--green);pointer-events:none"></div>' +
        '<span id="cmpALab" class="tag" style="position:absolute;left:8px;top:8px"></span>' +
        '<span id="cmpBLab" class="tag gold" style="position:absolute;right:8px;top:8px"></span>' +
      '</div>' +
      '<input id="cmpRange" type="range" min="0" max="100" value="50" style="width:100%;margin-top:8px">' +
      '<div class="muted txs" style="margin-top:4px">左滑看较早、右滑看较近。同光线同角度拍，对比才有意义。</div>' +
    '</div>'
  },

  bindCompare() {
    const selA = document.getElementById('cmpA')
    const selB = document.getElementById('cmpB')
    if (!selA || !selB) return
    const phs = Store.photosAll()
    // 默认：A = 最早，B = 最新
    selA.value = '0'
    selB.value = String(phs.length - 1)
    const paint = () => {
      if (!phs.length) return
      const a = phs[Number(selA.value)] || phs[0]
      const b = phs[Number(selB.value)] || phs[phs.length - 1]
      if (!a || !b) return
      const ia = document.getElementById('cmpAimg')
      const ib = document.getElementById('cmpBimg')
      if (ia) ia.src = a.src
      if (ib) ib.src = b.src
      const la = document.getElementById('cmpALab')
      const lb = document.getElementById('cmpBLab')
      if (la) la.textContent = a.date
      if (lb) lb.textContent = b.date
    }
    selA.onchange = paint
    selB.onchange = paint
    const range = document.getElementById('cmpRange')
    const img = document.getElementById('cmpAimg')
    const line = document.getElementById('cmpLine')
    if (range) range.oninput = () => {
      const v = Number(range.value)
      if (img) img.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)'
      if (line) line.style.left = v + '%'
    }
    paint()
  },

  /** 训练日志区：展开编辑器 / 改某天的日志 / 看图 */
  bindJournal() {
    const today = Fmt.todayStr()
    const openEditor = (date) => {
      const box = document.getElementById('noteBox')
      if (!box) return
      box.innerHTML = JournalUI.render(date, { showSkip: true })
      JournalUI.bind(date, () => { this.render() }, () => { box.innerHTML = '' })
      if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    const btn = document.getElementById('writeToday')
    if (btn) btn.onclick = () => openEditor(today)
    JournalUI.bindTimeline(date => openEditor(date))
  },

  bindWeight(today) {
    const btn = document.getElementById('wSave')
    const inp = document.getElementById('wIn')
    if (!btn || !inp) return
    const save = async () => {
      const w = Number(inp.value)
      if (!(w > 20 && w < 400)) { UI.toast('请填 20–400 之间的体重（kg）'); return }
      // 记体重也算一次打卡（云端结算 +5 EXP，且是宏观调控的输入）
      const ck = Object.assign({ date: today, exercises: [] }, Store.checkinOf(today) || {}, { weight: Fmt.round(w, 1) })
      const res = await Store.pushCheckin(ck)
      if (Store.state.user && Store.state.user.profile) Store.state.user.profile.weight = ck.weight
      Store.saveCloud({ profile: Store.state.user.profile })
      UI.toast((res && res.local) ? ('已记录 ' + ck.weight + ' kg')
        : (res && res.offline) ? '已存本机，联网后同步' : ('已记录 ' + ck.weight + ' kg · 云端已同步'))
      this.render()
    }
    btn.onclick = save
    inp.onchange = save
  },

  spark(rows) {
    if (rows.length < 2) return ''
    const vals = rows.map(r => Number(r.weight))
    const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals)
    const W = 480, H = 120, pad = 10
    const pts = vals.map((v, i) => {
      const x = pad + (W - pad * 2) * (i / (vals.length - 1))
      const y = max === min ? H / 2 : pad + (H - pad * 2) * (1 - (v - min) / (max - min))
      return Fmt.round(x, 1) + ',' + Fmt.round(y, 1)
    })
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:' + H + 'px">' +
      '<polyline fill="none" stroke="#0e9f6e" stroke-width="2.5" points="' + pts.join(' ') + '"></polyline>' +
      pts.map(p => { const xy = p.split(','); return '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="3" fill="#0b7d56"></circle>' }).join('') +
      '</svg>'
  }
}
