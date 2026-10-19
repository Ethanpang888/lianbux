/* src/pages/plan.js —— 我的计划：完整周期总览
 *
 * 用户实测反馈（2026-10-11）：网站只有「今日」，没有一个地方能看到整个周期长什么样。
 * 本页 = 周期日历 + 每天的动作清单；当天高亮。详情（重量/打卡）仍在今日训练页。
 */
const PagePlan = {
  date() { return Fmt.todayStr() },

  render() {
    const u = Store.state.user || {}
    const plan = u.plan
    if (!plan || !plan.micro || !plan.micro.length) {
      document.getElementById('app').innerHTML = Router.bar('我的计划') +
        '<div class="card">' + UI.empty('还没有训练计划 —— 先完成 1 分钟建档') +
        '<button class="btn" onclick="Router.go(\'onboard\')">去建档</button></div>'
      return
    }

    const today = this.date()
    // 存量自愈：旧版挂居家秘籍只改了 plan.home 没回写 profile，这里对齐一次（plan 为准）
    if (u.profile && !!u.profile.home !== !!plan.home) {
      u.profile.home = !!plan.home
      Store.patchUser({ profile: u.profile })
    }
    const idx = Math.max(0, ENGINE.calc.dayIndexFromStart(plan.cycleStart || today, today))
    const len = plan.micro.length
    const logical=ENGINE.kb.schedulePosition(plan,idx)
    const cycle = Math.floor(Math.max(0,logical.index) / len)
    const week = cycle + 1
    const slotToday = logical.paused?-1:((logical.index % len) + len) % len
    const sp = ENGINE.kb.SPLITS ? (ENGINE.kb.SPLITS[plan.split] || {}) : {}
    // 计划人格化（竞品「轻盈行动」做法，用户 10/15 确认）：分化挂上知识源的博主名
    const AUTHOR = { ppl: '谭成义', cpbsl: '凯圣王', five: '谭成义', full: '综合' }
    const splitName = sp.name || plan.split || '训练循环'
    const author = AUTHOR[plan.split] ? ' <span class="tag gold">' + Fmt.esc(AUTHOR[plan.split]) + '体系</span>' : ''
    const start = plan.cycleStart || today

    // 周期日历条：每天一格，当天高亮
    const cells = plan.micro.map((f, i) => {
      const isToday = i === 0
      const cls = isToday ? 'background:var(--green);color:#fff;border-color:var(--green)' : ''
      const d=ENGINE.kb.dayContent(plan,idx+i,u.profile,!!plan.home);const nm=d.type==='rest'?'休':(d.focus||f).slice(0,1)
      return '<div style="' + cls + ';border:1px solid var(--line);border-radius:10px;padding:8px 0;text-align:center;font-size:13px;font-weight:700">' +
        Fmt.shiftDate(today,i).slice(5) + '<br><span style="font-weight:600">' + Fmt.esc(nm) + '</span></div>'
    }).join('')

    // 每天的卡：动作清单（点击某天 → 今日训练页看详情；非今天也能看）
    const cards = plan.micro.map((f, i) => {
      const day = ENGINE.kb.dayContent(plan, idx + i, u.profile, !!plan.home)
      const targetDate = Fmt.shiftDate(today, i)
      const isToday = i === 0
      const rest = day.type === 'rest'
      const names = (day.exercises || []).map(e => Fmt.esc(e.name + ' ' + e.sets)).join('、')
      return '<div class="card" style="' + (isToday ? 'border:2px solid var(--green)' : '') + '">' +
        '<h2>' + targetDate.slice(5) + ' · ' + Fmt.esc(day.focus || f) +
          (isToday ? ' <span class="tag gold">今天</span>' : '') + '</h2>' +
        '<div class="muted txs" style="margin-top:4px">' +
          (rest ? '休息日 —— 全休或散步 20 分钟，别安排力量' : names || '—') + '</div>' +
        (!rest ? '<button class="btn ghost" style="margin-top:8px;font-size:13px" onclick="Router.go(\'today/' + targetDate + '\')">查看这一天 →</button>' : '') +
      '</div>'
    }).join('')

    document.getElementById('app').innerHTML = Router.bar('我的计划') +
      '<div class="card">' +
        '<h2>' + Fmt.esc(splitName) + author + (plan.home ? ' · 居家版' : ' · 健身房版') +
          ' <span class="tag">第 ' + week + ' 轮</span></h2>' +
        '<div class="muted txs" style="margin-top:6px">' + Fmt.esc(start) + ' 开始 · 循环 ' + len + ' 天 · 已进行 ' + (idx + 1) + ' 天 · ' +
          '每 ' + (ENGINE.method.DELOAD ? ENGINE.method.DELOAD.everyWeeks : 4) + ' 周一个减载周（完整版周期表在「完整版」里）</div>' +
        '<div style="display:flex;gap:6px;margin-top:10px;overflow-x:auto">' + cells + '</div>' +
        // 节假日 / 停练顺延：把整个循环往后挪，练腿日照原顺序落到你有空的那天
        '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">' +
          '<b style="font-size:13px">节假日 / 没空停练？把计划顺延</b>' +
          '<div class="muted txs" style="margin-top:4px">插入临时休息日，之后按原顺序接着练。可补顺延漏练的日期，确认前预览，历史打卡保留。</div>' +
          '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">' +
            [1, 2, 3, 4, 5].map(n => '<button class="chip" onclick="PagePlan.delay(' + n + ')">顺延 ' + n + ' 天</button>').join('') +
          '</div>' +
        '</div>' +
      '</div>' + cards +
      this.savedPlansCard(u) +
      '<div class="card">' +
        '<h2>在哪练？ <span class="mini">居家 · 健身房 随时切</span></h2>' +
        '<div class="muted txs">换场景会按现在的分化重新挑动作（居家版换成弹力带/哑铃/自重，健身房版换回杠铃器械），自定义周期进度不变。</div>' +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
          '<button class="chip' + (plan.home ? ' on' : '') + '" onclick="PagePlan.switchHome(true)">🏠 居家</button>' +
          '<button class="chip' + (!plan.home ? ' on' : '') + '" onclick="PagePlan.switchHome(false)">🏋️ 健身房</button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>练法不对？换循环 <span class="mini">一周四练选「四分化」</span></h2>' +
        this.switchList(plan) +
        '<div class="muted txs" style="margin-top:8px">换循环会<b>重新生成整个训练安排</b>（动作与编排全换），打卡记录和体重数据保留；' +
          '换完从今天起重排，不用等旧周期跑完。</div>' +
      '</div>' +
      '<div style="height:20px"></div>'
  },

  /** 插入临时休息日，先预览确认，保留历史周期起点。 */
  delay(n) { PageCoach.openSchedule(n) },

  /** 切场景（居家/健身房）：分化频率不变，按新场景重挑动作，保留自定义挂载与周期进度 */
  switchHome(home) {
    const u = Store.state.user || {}
    const plan = u.plan
    if (!plan || !plan.micro) { UI.toast('先完成建档'); return }
    if (!!plan.home === home) return
    const np = ENGINE.kb.generatePlan(u.profile, {
      split: plan.split, freq: plan.freq, home: home, dietMode: plan.dietMode
    })
    np.schedulePauses = plan.schedulePauses || []
    np.cycleStart = plan.cycleStart
    np.slotExercises = plan.slotExercises || {}
    const p = Object.assign({}, u.profile, { home: home })
    Store.patchUser({ plan: np, profile: p, activeSavedId: '' })
    UI.toast(home ? '已切居家版' : '已切健身房版')
    this.render()
  },

  // ───────────── 我的计划库：保存当前计划 / 多套切换（2026-10-17 用户要求）─────────────
  planLimit(u) { return ENGINE.pro.isPro(u) ? 8 : 2 },

  savedPlansCard(u) {
    const list = Array.isArray(u.savedPlans) ? u.savedPlans : []
    const limit = this.planLimit(u)
    const active = u.activeSavedId || ''
    const rows = list.map(sp => {
      const on = sp.id === active
      const pl = sp.plan || {}
      return '<div style="display:flex;align-items:center;gap:8px;margin-top:10px">' +
        '<div style="flex:1;min-width:0"><b style="font-size:13px">' + Fmt.esc(sp.name) + '</b>' +
          '<div class="muted txs">' + Fmt.esc(pl.templateName || pl.split || '') + ' · ' + Fmt.esc(pl.freq || '') +
          (pl.home ? ' · 居家' : ' · 健身房') + ' · 存于 ' + Fmt.esc(sp.createdAt) + '</div></div>' +
        (on ? '<span class="tag gold">当前</span>'
            : '<button class="btn ghost" style="width:auto;padding:8px 12px;font-size:12px;flex:none" onclick="PagePlan.switchToSaved(\'' + sp.id + '\')">切到这套 →</button>') +
        '<button class="chip sm" style="flex:none" onclick="PagePlan.deleteSaved(\'' + sp.id + '\')">删</button>' +
      '</div>'
    }).join('')
    const full = list.length >= limit
    return '<div class="card"><h2>我的计划库 <span class="mini">' + list.length + ' / ' + limit + ' 套' +
      (ENGINE.pro.isPro(u) ? '' : ' · 免费存 2 套，完整版 8 套') + '</span></h2>' +
      '<div class="muted txs">把现在这套训练计划（含你改过的动作）存起来，随时一键切回来。' +
      '挂秘籍前的原计划也会自动留一份，在藏经阁能「换回挂秘籍之前的计划」。</div>' +
      (full ? '<div class="muted txs" style="margin-top:10px">存满了 —— 删掉一套再存，或开通完整版扩到 8 套。</div>'
            : '<button class="btn" style="margin-top:10px" onclick="PagePlan.saveCurrentPlan()">💾 保存当前这套计划</button>') +
      rows +
    '</div>'
  },

  saveCurrentPlan() {
    const u = Store.state.user || {}
    const limit = this.planLimit(u)
    const list = Array.isArray(u.savedPlans) ? u.savedPlans : []
    if (list.length >= limit) { UI.toast('存满了（免费 2 套，完整版 8 套）'); return }
    if (!u.plan || !u.plan.micro) { UI.toast('先有训练计划'); return }
    const entry = ENGINE.planBackup.makeSavedEntry(u, '')
    if (!entry) { UI.toast('先有训练计划'); return }
    const defName = (u.plan.templateName || (ENGINE.kb.SPLITS[u.plan.split] || {}).name || u.plan.split) +
      ' · ' + ((ENGINE.kb.FREQ && ENGINE.kb.FREQ[u.plan.freq]) || {}).name || u.plan.freq || ''
    let nm = defName
    try { const inp = prompt('给这套计划起个名字（可跳过）', defName); if (typeof inp === 'string' && inp.trim()) nm = inp.trim() } catch (e) {}
    entry.name = nm
    const nl = ENGINE.planBackup.upsertSaved(list, entry, limit)
    if (!nl) { UI.toast('存满了'); return }
    Store.patchUser({ savedPlans: nl, activeSavedId: entry.id })
    UI.toast('已保存「' + nm + '」')
    this.render()
  },

  switchToSaved(id) {
    const u = Store.state.user || {}
    const sp = (u.savedPlans || []).find(x => x.id === id)
    if (!sp) return
    if (!confirm('切到「' + sp.name + '」会整体替换当前训练安排（当前未保存的改动会丢），确定？')) return
    const r = ENGINE.planBackup.switchData(sp, u.profile)
    if (!r) { UI.toast('这套计划数据坏了，切不了'); return }
    Store.patchUser({ plan: r.plan, profile: r.profile, activeSavedId: id })
    UI.toast('已切到「' + sp.name + '」，继续它的周期进度')
    this.render()
  },

  deleteSaved(id) {
    const u = Store.state.user || {}
    const sp = (u.savedPlans || []).find(x => x.id === id)
    if (!sp) return
    if (!confirm('删除「' + sp.name + '」？删了找不回来。')) return
    Store.patchUser({
      savedPlans: ENGINE.planBackup.removeSaved(u.savedPlans, id),
      activeSavedId: u.activeSavedId === id ? '' : u.activeSavedId
    })
    UI.toast('已删除')
    this.render()
  },

  /** 三种分化 × 六种排法全开放（循环制 c3/c4/c5 + 周制 w3/w4/w5）—— 排法不再绑死分化（2026-10-17 用户要求：三练/四练选择必须能自由换） */
  freqSplitHint(split, freq) {
    const good = (split === 'ppl' && (freq === 'c3' || freq === 'w3')) ||
      (split === 'cpbsl' && (freq === 'c4' || freq === 'w4')) ||
      (split === 'five' && (freq === 'c5' || freq === 'w5'))
    if (good) return ''
    const sn = (ENGINE.kb.SPLITS[split] || {}).name || split
    return sn + '通常配「' + (split === 'ppl' ? '练3休1/每周3练' : split === 'cpbsl' ? '练4休1/每周4练' : '练5休2/每周5练') +
      '」。你选的排法也能跑（引擎会自动轮转部位），只是各部位恢复间隔和常见练法不同。确定这样排？'
  },
  switchList(plan) {
    const cur = plan.split || 'ppl'
    const curFreq = plan.freq || ''
    const list = [
      { k: 'ppl', n: '三分化 · 推拉腿', d: '推（胸+肩中束+三头）→ 拉（背+后束+二头）→ 腿。肩后束跟背走、肩中束跟推走',
        rec: '推荐：练3休1 或 每周3练' },
      { k: 'cpbsl', n: '四分化', d: '胸+三头 → 背+二头 → 肩 → 腿 —— 肩独立一天，就是你本人的练法',
        rec: '推荐：练4休1 或 每周4练' },
      { k: 'five', n: '五分化', d: '胸 → 背 → 肩 → 手臂 → 腿。对恢复要求高，适合吃得睡得跟得上的熟练者',
        rec: '推荐：练5休2 或 每周5练' }
    ]
    const freqs = [
      { key: 'c3', label: '练3休1 · 循环制', desc: '练 3 天休 1 天无限循环（不掺星期几）' },
      { key: 'w3', label: '每周3练 · 按周排', desc: '固定每周哪 3 天练，适合作息按周走的人' },
      { key: 'c4', label: '练4休1 · 循环制', desc: '练 4 天休 1 天无限循环' },
      { key: 'w4', label: '每周4练 · 按周排', desc: '固定每周哪 4 天练，适合工作日时间稳定的人' },
      { key: 'c5', label: '练5休2 · 循环制', desc: '练 5 天休 2 天无限循环' },
      { key: 'w5', label: '每周5练 · 按周排', desc: '固定每周 5 天，适合周末必须歇的人' }
    ]
    return list.map(x => {
      const isCurSplit = x.k === cur
      const rows = freqs.map(f => {
        const on = isCurSplit && curFreq === f.key
        return '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">' +
          '<div style="flex:1"><b style="font-size:13px">' + Fmt.esc(f.label) + '</b>' +
            '<div class="muted txs">' + Fmt.esc(f.desc) + '</div></div>' +
          (on ? '<span class="tag gold">当前</span>'
              : '<button class="btn ghost" style="width:auto;padding:8px 12px;font-size:12px;flex:none" onclick="PagePlan.applySplit(\'' + x.k + '\',\'' + f.key + '\')">换成这个 →</button>') +
        '</div>'
      }).join('')
      return '<div style="padding:10px 0;border-bottom:1px solid var(--line)">' +
        '<b>' + Fmt.esc(x.n) + (isCurSplit ? ' <span class="tag gold">分化</span>' : '') + '</b>' +
        '<div class="muted txs">' + Fmt.esc(x.d) + '</div>' +
        '<div class="muted txs" style="margin-top:2px;color:var(--green)">' + Fmt.esc(x.rec) + '</div>' +
        rows +
      '</div>'
    }).join('')
  },

  async applySplit(key, freq) {
    const u = Store.state.user || {}
    if (!u.profile) { UI.toast('先完成建档'); return }
    // 不搭组合先警告（引擎能跑，只是恢复间隔和常见练法不同）
    const hint = this.freqSplitHint(key, freq)
    if (hint && !confirm(hint)) return
    if (!confirm('换成新排法会重新生成全部训练安排（打卡和体重记录保留），确定？')) return
    const plan = ENGINE.kb.generatePlan(u.profile, { split: key, freq: freq, home: !!(u.plan && u.plan.home) })
    plan.cycleStart = new Date().toISOString().slice(0, 10)
    // 体态秘籍的矫正动作是挂在 slotExercises 上的 —— 换循环后重挂，别让它静默丢失
    const cur = ENGINE.secret && ENGINE.secret.currentOf(u.profile)
    if (cur && cur.kind === 'append' && cur.preset && cur.preset.append) {
      const sx = {}
      plan.micro.forEach((m, slot) => {
        if (m === 'rest' || (typeof m === 'object' && m.type === 'rest')) return
        sx[String(slot)] = cur.preset.append.map(a => ({
          oid: '', name: a.name, sets: a.sets || '3×15',
          role: '辅助', equipment: '', custom: true, fromSecret: cur.key
        }))
      })
      plan.slotExercises = sx
    }
    // 分化/频率/场景写回 profile（保证档案页与计划页一致）
    const p = Object.assign({}, u.profile, { split: plan.split, freq: plan.freq, home: !!plan.home })
    Store.patchUser({ plan: plan, profile: p, activeSavedId: '' })
    const sp = (ENGINE.kb.SPLITS[key] || {}).name || key
    const fr = (ENGINE.kb.FREQ && ENGINE.kb.FREQ[freq] || {}).name || freq
    UI.toast('已切换「' + sp + ' · ' + fr + '」—— 从今天起重排')
    this.render()
  }
}
