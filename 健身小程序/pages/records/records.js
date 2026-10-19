const app = getApp()
const calc = require('../../utils/calc.js')
const kb = require('../../utils/kb.js')

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

require('../../utils/page.js')({
  data: {
    hasPlan: false, dayIndex: 0, streak: 0, total: 0, completion: 0,
    weights: [], risks: [], summary: '', chat: [], input: '', aiBusy: false,
    weekReport: '', aiEnabled: false, history: [], expandedIdx: -1, planName: '',
    // 对齐网站记录页新增：力量估算 / 本月热力 / 本周复盘 / 记体重
    strength: [], heatCells: [], weekRep: { label: '', trained: 0, dwStr: '—', trend: '' },
    weightInput: ''
  },

  goCoach() { wx.navigateTo({url:'/pages/ai/ai'}) },
  onShow() {
    if(this.getTabBar&&this.getTabBar())this.getTabBar().setData({selected:3})
    this.setData({ aiEnabled: !!app.globalData.aiEnabled })
    this.load()
  },

  load() {
    const g = app.globalData
    if (!g.openid) { setTimeout(() => this.load(), 300); return }
    if (!g.profile) { app.loadUser().then(() => this.render()).catch(() => this.render()); return }
    this.render()
  },

  // 游标分页：按 date 倒序、每次 100 条，用 _.lt(上一页最旧日期) 推进，支持一年 365+ 条不截断
  async fetchAllCheckins(openid) {
    const db = wx.cloud.database()
    const _ = db.command
    let all = []
    let lastDate = '9999-12-31'
    let guard = 0
    while (guard++ < 60) {
      const res = await db.collection('checkins')
        .where({ _openid: openid, date: _.lt(lastDate) })
        .orderBy('date', 'desc')
        .limit(100)
        .get()
      const data = res.data || []
      all = all.concat(data)
      if (data.length < 100) break
      lastDate = data[data.length - 1].date
    }
    return all.reverse() // 转回升序（最旧→最新），供下方统计/明细复用
  },

  async render() {
    const g = app.globalData
    if (!g.plan) { this.setData({ hasPlan: false }); return }
    const plan = g.plan
    let idx = calc.dayIndexFromStart(plan.cycleStart, todayStr())
    try {
      const list = await this.fetchAllCheckins(g.openid)
      const total = list.length
      const trained = list.filter(c => c.trained).length
      const completion = total ? Math.round(trained / total * 100) : 0
      const weights = list.filter(c => c.weight).map(c => ({ date: c.date.slice(5), weight: c.weight }))
      const history = list.slice().reverse().map(c => {
        let volume = 0
        const exercises = (c.exercises || []).map(e => {
          const logStr = (e.log || []).map(s => {
            volume += (Number(s.weight) || 0) * (Number(s.reps) || 0)
            const w = s.weight ? s.weight + 'kg×' : ''
            return w + (s.reps || '-') + (s.done ? '✓' : '')
          }).join('  ')
          return { name: e.name, sets: e.sets, logStr }
        })
        const dietStr = (c.dietLog || []).map(f => `${f.name} ${f.grams}g`).join('、')
        return {
          date: c.date, dayIndex: c.dayIndex, trained: !!c.trained,
          volume: Math.round(volume),
          dietKcal: Math.round((c.dietLog || []).reduce((a, f) => a + (f.kcal || 0), 0)),
          exercises, dietStr, waterMl: c.waterMl || 0, sleepHours: c.sleepHours || 0,
          noteStr: c.note ? String(c.note) : ''
        }
      })
      this.computeStreak(list)
      this.computeRisks(list, weights)
      // ── 对齐网站记录页：力量估算 / 本月热力 / 本周复盘 / 今天体重 ──
      const today = todayStr()
      const todayCk = list.find(c => c.date === today)
      this.setData({
        hasPlan: true, dayIndex: idx < 0 ? 0 : idx, total, completion,
        weights, weekReport: this.buildWeekReport(list, plan),
        planName: plan.templateName || plan.split || '我的计划',
        history,
        strength: this.computeStrength(list),
        heatCells: this.computeHeat(list),
        weekRep: this.computeWeek(list),
        weightInput: todayCk && todayCk.weight ? String(todayCk.weight) : ''
      })
      if (weights.length) this.drawWeight(weights)
    } catch (e) {
      this.setData({ hasPlan: true, dayIndex: idx < 0 ? 0 : idx, planName: plan.templateName || plan.split || '' })
    }
  },

  /* ── 力量估算（网站 strengthCard 同口径）：近 90 天主项最佳估算 1RM（Epley 公式）+ 停滞提示。
     e1RM = 重量 ×（1 + 次数/30），只统计有重量的完成组；停滞 = 连续 2 次训练所有完成组都没做满目标次数 ── */
  computeStrength(list) {
    const cutoff = this.shiftDate(todayStr(), -90)
    const per = {}
    list.filter(c => c.date >= cutoff).forEach(c => {
      ;(c.exercises || []).forEach(e => {
        if (!e || !e.name) return
        const target = parseInt(String(e.sets || '').split(/[×x]/i)[1], 10) || 10
        const p = per[e.name] || (per[e.name] = { name: e.name, target, best: 0, bestAt: '', bestRep: 0, sessions: [] })
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
      p.best = Math.round(p.best * 10) / 10
    })
    return rows
  },

  /* ── 本月打卡热力（网站 heat 同款）：深色 = 完成训练，浅色 = 有记录未训练 ── */
  computeHeat(list) {
    const today = todayStr()
    const monthStart = today.slice(0, 7) + '-01'
    const first = new Date(monthStart + 'T00:00:00')
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const lead = (first.getDay() + 6) % 7   // 周一=0
    const cells = []
    for (let i = 0; i < lead; i++) cells.push({ k: 'e' + i, label: '', cls: 'empty' })
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = monthStart.slice(0, 8) + String(d).padStart(2, '0')
      const ck = list.find(c => c.date === ds)
      const cls = ck && ck.trained ? 'hit' : (ck ? 'part' : (ds === today ? 'today' : ''))
      cells.push({ k: 'd' + d, label: String(d), cls })
    }
    return cells
  },

  /* ── 本周复盘（网站同文案口径）：周一为一周起点 ── */
  computeWeek(list) {
    const today = todayStr()
    const d = new Date(today + 'T00:00:00')
    const dow = (d.getDay() + 6) % 7
    const weekStart = this.shiftDate(today, -dow)
    const thisWeek = list.filter(c => c.date >= weekStart && c.date <= today)
    const trainedN = thisWeek.filter(c => c.trained).length
    const ws = thisWeek.filter(c => Number(c.weight) > 0)
    let dw = null
    if (ws.length >= 2) dw = Math.round((ws[ws.length - 1].weight - ws[0].weight) * 10) / 10
    const trend = dw === null ? '本周体重记录不足 2 次' :
      (dw <= -1.2 ? '掉重偏快，碳水每天 +0.25 g/kg 保住肌肉' :
       dw >= 0.6 ? '体重上涨，检查油与零食，碳水每天 −0.25 g/kg' :
       '体重基本持平（' + (dw > 0 ? '+' : '') + dw + ' kg），同步期这是理想曲线')
    return {
      label: weekStart.slice(5).replace('-', '/') + ' 起',
      trained: trainedN,
      dwStr: dw === null ? '—' : (dw > 0 ? '+' : '') + dw + ' kg',
      trend
    }
  },

  shiftDate(s, n) {
    const d = new Date(s + 'T00:00:00')
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  /* ── 记今天体重（网站 bindWeight 同款）：记体重也算一次打卡（+5 EXP 的输入）── */
  onWeightInput(e) { this.setData({ weightInput: e.detail.value }) },
  saveWeight() {
    const w = Number(this.data.weightInput)
    if (!(w > 20 && w < 400)) { wx.showToast({ title: '请填 20–400 之间的体重（kg）', icon: 'none' }); return }
    const w1 = Math.round(w * 10) / 10
    const db = wx.cloud.database()
    const date = todayStr()
    const g = app.globalData
    let dayIndex = 0
    try { dayIndex = calc.dayIndexFromStart(g.plan.cycleStart, date) } catch (e) { dayIndex = 0 }
    db.collection('checkins').where({ _openid: g.openid, date }).get()
      .then(res => {
        if (res.data.length) return db.collection('checkins').doc(res.data[0]._id).update({ data: { weight: w1 } })
        return db.collection('checkins').add({
          data: { date, dayIndex: dayIndex < 0 ? 0 : dayIndex, trained: false, dietOk: false,
            waterMl: 0, sleepHours: 0, weight: w1, note: '', exercises: [], dietLog: [] }
        })
      })
      .then(() => {
        wx.showToast({ title: '已记录 ' + w1 + ' kg', icon: 'none' })
        if (app.loadCultivation) app.loadCultivation(true)
        this.render()
      })
      .catch(() => wx.showToast({ title: '保存失败', icon: 'none' }))
  },

  computeStreak(list) {
    const dates = list.filter(c => c.trained).map(c => c.date).sort().reverse()
    let streak = 0, cur = todayStr()
    const prevDate = s => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    for (const dt of dates) {
      if (dt === cur || dt === prevDate(cur)) { streak++; cur = prevDate(dt); } else break
    }
    this.setData({ streak })
  },

  computeRisks(list, weights) {
    const risks = []
    if (weights.length >= 2) {
      const a = weights[weights.length - 1].weight, b = weights[weights.length - 2].weight
      if (b - a > 1.5) risks.push({ t: '掉秤过快', d: `一周内下降 ${(b - a).toFixed(1)}kg，可能掉肌肉/代谢受损，建议增加 200kcal 摄入。` })
    }
    if (list.length) {
      const last = list[list.length - 1].date
      const days = Math.floor((new Date(todayStr() + 'T00:00:00') - new Date(last + 'T00:00:00')) / 86400000)
      if (days > 3) risks.push({ t: '打卡中断', d: `已 ${days} 天未打卡，进度会流失，今天补一次训练吧。` })
    } else {
      risks.push({ t: '尚未开始', d: '还没有任何打卡记录，从今天的训练开始第一步。' })
    }
    const dietCnt = list.filter(c => c.dietOk).length
    if (list.length && dietCnt / list.length < 0.3) risks.push({ t: '饮食缺口', d: '饮食打卡比例偏低，减脂期建议每天记录吃了什么，更容易看到缺口。' })
    this.setData({ risks })
  },

  buildWeekReport(list, plan) {
    const wk = Math.floor(this.data.dayIndex / 7) + 1
    const wkTrained = list.filter(c => c.trained).length
    return `第${wk}周小结：累计打卡 ${list.length} 次、训练 ${list.filter(c => c.trained).length} 次，继续加油！`
  },

  drawWeight(weights) {
    const q = wx.createSelectorQuery().in(this)
    q.select('#wc').fields({ node: true, size: true }).exec(res => {
      if (!res[0]) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getWindowInfo().pixelRatio
      canvas.width = res[0].width * dpr
      canvas.height = res[0].height * dpr
      ctx.scale(dpr, dpr)
      const W = res[0].width, H = res[0].height
      ctx.clearRect(0, 0, W, H)
      const vals = weights.map(w => w.weight)
      const min = Math.min(...vals), max = Math.max(...vals)
      const pad = 24
      const x = i => pad + i * (W - 2 * pad) / (vals.length - 1 || 1)
      const y = v => H - pad - (v - min) / ((max - min) || 1) * (H - 2 * pad)
      ctx.strokeStyle = '#90c8a4'; ctx.lineWidth = 2
      ctx.beginPath()
      vals.forEach((v, i) => { i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)) })
      ctx.stroke()
      ctx.fillStyle = '#9aa99e'; ctx.font = '10px sans-serif'
      ctx.fillText(max.toFixed(1), 0, pad)
      ctx.fillText(min.toFixed(1), 0, H - pad)
    })
  },

  // ===== 导出 =====
  buildExportText(list, plan) {
    const lines = []
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const exportTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
    lines.push('健身记录导出')
    lines.push('导出时间：' + exportTime)
    if (plan) {
      lines.push('计划：' + (plan.templateName || plan.split || '自定义'))
      if (plan.cycleStart) lines.push('计划起始：' + plan.cycleStart)
    }
    const total = list.length
    const trained = list.filter(c => c.trained).length
    const completion = total ? Math.round(trained / total * 100) : 0
    lines.push(`累计打卡：${total} 次 / 训练 ${trained} 次 / 完成率 ${completion}%`)
    lines.push('')
    lines.push('===== 每日明细（按时间） =====')
    for (const c of list) {
      const tag = c.trained ? '训练' : '休息'
      lines.push('')
      lines.push(`${c.date} | 第${(c.dayIndex != null ? c.dayIndex : '?')}天 | ${tag}` + (c.weight ? ` | 体重 ${c.weight}kg` : ''))
      const exs = c.exercises || []
      if (exs.length) {
        lines.push('  动作：')
        for (const e of exs) {
          const log = (e.log || []).map(s => `${s.weight ? s.weight + 'kg×' : ''}${s.reps || '-'}${s.done ? '✓' : ''}`).join('  ')
          lines.push(`    - ${e.name}（${e.sets || ''}） ${log}`)
        }
      }
      const diet = (c.dietLog || []).map(f => `${f.name} ${f.grams || ''}g`).join('、')
      if (diet) lines.push('  饮食：' + diet)
      const extra = []
      if (c.waterMl) extra.push('喝水 ' + c.waterMl + 'ml')
      if (c.sleepHours) extra.push('睡眠 ' + c.sleepHours + 'h')
      if (extra.length) lines.push('  ' + extra.join(' · '))
      if (c.note) lines.push('  备注：' + c.note)
    }
    return lines.join('\n')
  },

  copyAll() {
    const plan = app.globalData.plan
    wx.showLoading({ title: '读取中' })
    this.fetchAllCheckins(app.globalData.openid)
      .then(list => {
        wx.hideLoading()
        const text = this.buildExportText(list, plan)
        wx.setClipboardData({
          data: text,
          success: () => wx.showToast({ title: `已复制 ${list.length} 条记录`, icon: 'none' }),
          fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
        })
      })
      .catch(() => { wx.hideLoading(); wx.showToast({ title: '读取失败', icon: 'none' }) })
  },

  exportFile() {
    const plan = app.globalData.plan
    wx.showLoading({ title: '生成中' })
    this.fetchAllCheckins(app.globalData.openid)
      .then(list => {
        const text = this.buildExportText(list, plan)
        const fs = wx.getFileSystemManager()
        const name = '健身记录_' + todayStr() + '.txt'
        const filePath = `${wx.env.USER_DATA_PATH}/${name}`
        fs.writeFile({
          filePath, data: text, encoding: 'utf8',
          success: () => {
            wx.hideLoading()
            wx.shareFileMessage({
              filePath, fileName: name,
              fail: () => { // 部分环境/基础库不支持分享文件，回退到复制
                wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'none' }), fail: () => wx.showToast({ title: '导出失败', icon: 'none' }) })
              }
            })
          },
          fail: () => {
            wx.hideLoading()
            wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'none' }), fail: () => wx.showToast({ title: '导出失败', icon: 'none' }) })
          }
        })
      })
      .catch(() => { wx.hideLoading(); wx.showToast({ title: '读取失败', icon: 'none' }) })
  },

  // ===== AI =====
  callAI() {
    if (!app.globalData.aiEnabled) {
      wx.showToast({ title: 'AI 答疑暂未开通', icon: 'none' })
      return null
    }
    if (!wx.cloud || !wx.cloud.extend || !wx.cloud.extend.AI) {
      wx.showToast({ title: '请先在 CloudBase 开通 AI', icon: 'none' })
      return null
    }
    try { return wx.cloud.extend.AI.beta.models.createModel('hunyuan-exp') }
    catch (e) { return wx.cloud.extend.AI.createModel ? wx.cloud.extend.AI.createModel('hunyuan-exp') : null }
  },

  aiSummary() {
    const model = this.callAI()
    if (!model) return
    const prompt = `你是健身陪练。根据用户数据给一段进度总结与下一步建议（口语、≤120字）。\n` +
      `计划：${this.data.planName || '无'}；当前第${this.data.dayIndex}天；累计打卡${this.data.total}次；训练完成率${this.data.completion}%；` +
      `连续${this.data.streak}天；风险提示：${this.data.risks.map(r => r.t).join('、') || '无'}。`
    this.setData({ aiBusy: true })
    model.generateText({ messages: [{ role: 'user', content: prompt }] })
      .then(r => { this.setData({ summary: r.text || r.data || '', aiBusy: false }) })
      .catch(err => { this.setData({ summary: 'AI 生成失败：' + (err.errMsg || '请检查 AI 额度'), aiBusy: false }) })
  },

  onInput(e) { this.setData({ input: e.detail.value }) },
  goAssess() { wx.navigateTo({ url: '/pages/assess/assess' }) },
  tapHistory(e) {
    const i = e.currentTarget.dataset.i
    this.setData({ expandedIdx: this.data.expandedIdx === i ? -1 : i })
  },
  sendChat() {
    const text = (this.data.input || '').trim()
    if (!text) return
    const model = this.callAI()
    if (!model) return
    const chat = this.data.chat.concat([{ role: 'user', content: text }])
    this.setData({ chat, input: '', aiBusy: true, chat: chat.concat([{ role: 'assistant', content: '' }]) })
    const kbHint = '参考知识库：' + kb.LEARN.map(l => l.title).join('；')
    model.streamText({
      messages: [
        { role: 'system', content: '你是「啊清练不虚」的健身教练，用中文简洁回答，结合运动科学。' + kbHint },
        ...chat.filter(c => c.role === 'user').map(c => ({ role: 'user', content: c.content }))
      ]
    }).onText(chunk => {
      const cur = this.data.chat
      cur[cur.length - 1].content += chunk
      this.setData({ chat: cur })
    }).on('end', () => this.setData({ aiBusy: false }))
      .catch(err => { const cur = this.data.chat; cur[cur.length - 1].content = 'AI 失败：' + (err.errMsg || ''); this.setData({ chat: cur, aiBusy: false }) })
  }
})
