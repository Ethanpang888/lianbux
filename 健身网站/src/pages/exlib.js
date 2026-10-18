/* src/pages/exlib.js —— 动作库（1112 个动作 · 三级筛选）
 *
 * 数据：kb.EX 全量（含 inPlan:false 的补齐动作——浏览可见，不进计划池）。
 * 交互借鉴「轻盈行动」：部位 → 器械 → 难度 筛选 + 搜索；点卡片弹详情（图 + 要领）。
 */
const PageExlib = {
  fPlace: 'all', fPart: 'all', fEquip: 'all', fLvl: 'all', q: '',

  render() {
    document.getElementById('app').innerHTML = Router.bar('动作库', Fmt.num(ENGINE.kb.EX.length) + ' 个动作') +
      '<div class="card">' +
        '<div class="wrap-row" style="margin-top:2px">' + this.placeChips() + '</div>' +
        '<input class="pro-input" id="exQ" placeholder="搜动作：卧推 / 深蹲 / 弯举…" autocomplete="off" value="' + Fmt.esc(this.q) + '">' +
        '<div class="muted txs" style="margin-top:8px">部位</div>' +
        '<div class="wrap-row" style="margin-top:4px">' + this.chips('fPart', this.partOpts(), 'part') + '</div>' +
        '<div class="muted txs" style="margin-top:8px">器械</div>' +
        '<div class="wrap-row" style="margin-top:4px">' + this.chips('fEquip', this.equipOpts(), 'equipment') + '</div>' +
        '<div class="muted txs" style="margin-top:8px">难度</div>' +
        '<div class="wrap-row" style="margin-top:4px">' + this.chips('fLvl', this.lvlOpts(), 'level') + '</div>' +
        '<div class="muted txs" style="margin-top:8px">「精选池」动作可被计划直接编排；其余为全量动作库（含拉伸 / 爆发力 / 力量举），练什么查什么。</div>' +
      '</div>' +
      '<div id="exList">' + this.listHTML() + '</div>' +
      '<div style="height:20px"></div>'
    this.bind()
  },

  /** 场地三选（用户 2026-10-15 指定）：全部 / 健身房 / 居家。居家口径与计划生成一致：无器械+哑铃+弹力带 */
  placeChips() {
    const cur = this.fPlace
    const opts = [
      { v: 'all', n: '全部' },
      { v: 'gym', n: '🏋 健身房' },
      { v: 'home', n: '🏠 居家' }
    ]
    return opts.map(o => '<button class="chip' + (cur === o.v ? ' on' : '') +
      '" onclick="PageExlib.set(\'fPlace\',\'' + o.v + '\')">' + o.n + '</button>').join('')
  },

  partOpts() {
    const m = {}
    this.placePool().forEach(e => { m[e.part] = (m[e.part] || 0) + 1 })
    const PN = { chest: '胸部', back: '背部', shoulder: '肩部', arm: '手臂', leg: '腿部', abs: '腹部', hip: '髋臀', neck: '颈部', stretch: '拉伸', plyo: '爆发力', power: '力量举', cardio: '有氧', misc: '其他' }
    return [{ v: 'all', n: '全部' }].concat(Object.keys(m).sort((a, b) => m[b] - m[a]).map(k => ({ v: k, n: (PN[k] || k) + ' ' + m[k] })))
  },
  equipOpts() {
    const m = {}
    this.placePool().forEach(e => { if (e.equipment) m[e.equipment] = (m[e.equipment] || 0) + 1 })
    return [{ v: 'all', n: '全部' }].concat(Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, 10).map(k => ({ v: k, n: k + ' ' + m[k] })))
  },
  lvlOpts() {
    const m = {}
    this.placePool().forEach(e => { if (e.level) m[e.level] = (m[e.level] || 0) + 1 })
    return [{ v: 'all', n: '全部' }].concat(Object.keys(m).map(k => ({ v: k, n: k })))
  },
  chips(field, opts, key) {
    return opts.map(o => {
      const on = String(this[field]) === String(o.v)
      return '<button class="chip' + (on ? ' on' : '') + '" onclick="PageExlib.set(\'' + field + '\',\'' + Fmt.esc(o.v) + '\')">' + Fmt.esc(o.n) + '</button>'
    }).join('')
  },
  /** 场地过滤（在部位/器械之前） */
  placePool() {
    if (this.fPlace === 'home') {
      return ENGINE.kb.EX.filter(e => ['无器械', '哑铃', '弹力带'].indexOf(e.equipment) >= 0)
    }
    if (this.fPlace === 'gym') {
      return ENGINE.kb.EX.filter(e => e.equipment && e.equipment !== '无器械' && e.equipment !== '弹力带')
    }
    return ENGINE.kb.EX
  },
  pool() {
    if (this.fPart === 'all') return this.placePool()
    return this.placePool().filter(e => e.part === this.fPart)
  },
  filtered() {
    let list = this.pool()
    if (this.fEquip !== 'all') list = list.filter(e => e.equipment === this.fEquip)
    if (this.fLvl !== 'all') list = list.filter(e => e.level === this.fLvl)
    if (this.q) {
      const q = this.q.toLowerCase()
      list = list.filter(e => e.name.toLowerCase().indexOf(q) >= 0 || (e.en || '').toLowerCase().indexOf(q) >= 0)
    }
    return list
  },
  listHTML() {
    const list = this.filtered()
    if (!list.length) return '<div class="card">' + UI.empty('没有匹配的动作 —— 换个筛选条件') + '</div>'
    return '<div class="card"><h2>匹配 ' + Fmt.num(list.length) + ' 个</h2><div style="margin-top:6px">' +
      list.slice(0, 60).map(e => {
        const img = (e.gif && e.gif[0]) || ''
        const pool = e.inPlan !== false
        return '<div class="li" style="cursor:pointer" onclick="PageExlib.show(\'' + Fmt.esc(e.name).replace(/'/g, '') + '\')">' +
          (img ? '<img src="' + img + '" style="width:54px;height:54px;object-fit:cover;border-radius:10px;margin-right:10px" loading="lazy">' : '') +
          '<span class="nm"><b>' + Fmt.esc(e.name) + '</b><br><span class="muted txs">' + Fmt.esc(e.partName || e.part) +
          (e.equipment ? ' · ' + Fmt.esc(e.equipment) : '') + (e.level ? ' · ' + Fmt.esc(e.level) : '') +
          (pool ? ' · <span style="color:var(--primary,#1a73e8)">计划池</span>' : '') + '</span></span></div>'
      }).join('') +
      (list.length > 60 ? '<div class="muted txs" style="margin-top:8px">共 ' + Fmt.num(list.length) + ' 个，先显示前 60 个 —— 收窄筛选或用搜索</div>' : '') +
      '</div></div>'
  },

  bind() {
    const q = document.getElementById('exQ')
    if (q) {
      const self = this
      q.oninput = () => {
        self.q = String(q.value || '').trim()
        const l = document.getElementById('exList')
        if (l) l.innerHTML = self.listHTML()
      }
    }
  },
  set(field, v) { this[field] = v; this.render() },

  show(name) {
    const e = ENGINE.kb.EX.find(x => x.name === name)
    if (!e) return
    const imgs = (e.gif || []).slice(0, 2)
    // 一键换进计划：往「下一个训练日」末尾加这个动作（slotExercises 机制）
    const u = Store.state.user || {}
    const plan = u.plan && u.plan.micro ? u.plan : null
    let nextSlot = -1, nextFocus = ''
    if (plan) {
      const today = Fmt.todayStr()
      let idx = 0
      try { idx = Math.max(0, ENGINE.calc.dayIndexFromStart(plan.cycleStart || today, today)) } catch (er) { idx = 0 }
      for (let d = 1; d <= plan.micro.length; d++) {
        const s = (idx + d) % plan.micro.length
        const m = plan.micro[s]
        if (m !== 'rest' && !(typeof m === 'object' && m.type === 'rest')) {
          nextSlot = s
          try { nextFocus = ENGINE.kb.dayContent(plan, idx + d, u.profile, !!plan.home).focus || '' } catch (er) { nextFocus = '' }
          break
        }
      }
    }
    const addBtn = (nextSlot >= 0)
      ? '<button class="btn ghost" style="margin-top:10px" onclick="PageExlib.addToday(\'' + Fmt.esc(e.name).replace(/'/g, '') + '\',' + nextSlot + ')">＋ 加到下一个训练日（' + Fmt.esc(nextFocus) + '）</button>'
      : ''
    UI.modal({
      title: e.name,
      body: (imgs.length
        ? (imgs.length > 1
          ? '<div style="text-align:center;margin-bottom:10px">' +
            '<div class="ex-frames" style="display:inline-block;width:240px;height:240px;border-radius:12px;overflow:hidden;background:#eef1f4">' +
            '<img src="' + Fmt.esc(imgs[0]) + '" referrerpolicy="no-referrer" onerror="this.style.visibility=\'hidden\'">' +
            '<img class="f1" src="' + Fmt.esc(imgs[1]) + '" referrerpolicy="no-referrer" onerror="this.style.visibility=\'hidden\'">' +
            '</div><div class="muted txs" style="margin-top:6px">起始 ↔ 结束 自动循环演示</div></div>'
          : '<div style="text-align:center;margin-bottom:10px"><img src="' + Fmt.esc(imgs[0]) + '" style="max-width:70%;border-radius:10px" loading="lazy"></div>')
        : '') +
        '<div class="muted txs">' + Fmt.esc(e.partName || e.part) +
          (e.equipment ? ' · ' + Fmt.esc(e.equipment) : '') + (e.level ? ' · ' + Fmt.esc(e.level) : '') + '</div>' +
        (e.points
          ? '<div class="txs" style="margin-top:8px;white-space:pre-line">' + Fmt.esc(e.points) + '</div>'
          : '<div class="muted txs" style="margin-top:8px">📖 这个动作的要领还在整理（图与分类已就绪）。' +
            '动作模式不确定的话，先看图模仿 + 用轻重量找感觉；或换一个同部位的精选池动作。</div>') +
        (e.inPlan === false ? '<div class="muted txs" style="margin-top:8px">库动作（不参与计划自动编排）</div>'
          : '<div class="muted txs" style="margin-top:8px">计划精选池动作 —— 可能出现在你的训练计划里。</div>') +
        addBtn,
      okText: '关闭', cancelText: false
    })
  },

  /** 把这个动作加到指定训练日（slot）末尾 —— 3 组递进，免费功能（计划自定义权是用户的） */
  addToday(name, slot) {
    const u = Store.state.user || {}
    if (!u.plan || !u.plan.micro) { UI.toast('先有训练计划'); return }
    const plan = Object.assign({}, u.plan)
    const sx = Object.assign({}, plan.slotExercises || {})
    const k = String(slot)
    const dup = (sx[k] || []).some(x => x.name === name)
    if (dup) { UI.toast('这个训练日已经有了'); return }
    if ((sx[k] || []).length >= 4) { UI.toast('这个训练日加的够多了，先删再加'); return }
    sx[k] = (sx[k] || []).concat([{ oid: '', name: name, sets: '3×12', role: '辅助', equipment: '', custom: true }])
    plan.slotExercises = sx
    Store.patchUser({ plan: plan })
    UI.toast('已加到下一个训练日末尾 —— 3 组，重量自己定')
    const box = document.getElementById('modalbox')
    if (box) box.innerHTML = ''   // 关掉详情弹窗（UI.modal 没有暴露 close 方法）
  }
}
