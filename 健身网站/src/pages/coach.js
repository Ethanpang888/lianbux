/* src/pages/coach.js —— 调整顾问：点一下情况 → 看建议 → 应用进计划
 *
 * 这是「反馈 → 调整 → 确认 → 同步」闭环的前半段，全部由规则引擎驱动（零 AI 成本）。
 * AI 顾问上线后挂在两头：听懂人话（把「最近老饿」映射成 hungry），和把结论说成人话。
 */
const PageCoach = {
  picked: '',
  result: null,

  render(args) {
    if(args&&args[0]==='schedule'){this.schedulePage();return}
    document.getElementById('app').innerHTML =
      Router.bar('训练与饮食调整', '选情况 → 查看建议 → 确认应用；临时没空请用顺延训练') +
      '<div class="card"><b>今天临时没空，或前几天漏练了？</b><p class="muted txs">保留训练顺序，用顺延安排休息；长期练不过来，再调整训练频率。</p><button class="btn ghost" onclick="Router.go(\'coach/schedule\')">顺延训练 ›</button><p class="muted txs">本页按规则算，结合现有数据给建议，不会自动改计划。疲劳重量微调需完整版；已有自定饮食目标时，饮食偏移不会覆盖它。</p></div>' +
      this.picker() +
      '<div id="coachOut"></div>' +
      this.aiHint()
    this.bind()
    this.paint()
  },

  picker() {
    const C = ENGINE.coach
    const cur = C.SITUATIONS.filter(s => s.key === this.picked)[0]
    return '<div class="card">' +
      '<h2>哪儿不对劲 <span class="mini">点一个，我给你算</span></h2>' +
      '<div class="wrap-row">' +
        C.SITUATIONS.map(s => '<button class="chip' + (this.picked === s.key ? ' on' : '') +
          '" data-sit="' + s.key + '">' + Fmt.esc(s.name) + '</button>').join('') +
      '</div>' +
      '<div class="muted txs" style="margin-top:8px">' +
        Fmt.esc(cur ? cur.hint : '这些都能算出来，不用瞎猜；算不出来的我不编。') + '</div>' +
    '</div>'
  },

  paint() {
    const box = document.getElementById('coachOut')
    if (!box) return
    const r = this.result
    if (!this.picked || !r) { box.innerHTML = ''; return }
    if (!r.ok) {
      box.innerHTML = '<div class="card"><h2>这个算不了</h2>' +
        '<div class="muted txs">' + Fmt.esc(r.msg || '') + '</div></div>'
      return
    }
    // 需要先选一个动作（「有个动作不舒服」这一步）
    if (r.needPick) {
      box.innerHTML = '<div class="card"><h2>' + Fmt.esc(r.title) + '</h2>' +
        '<div class="muted txs">' + Fmt.esc(r.why || '') + '</div>' +
        '<div class="wrap-row" style="margin-top:10px">' +
          (r.options || []).map(o => '<button class="chip sm" data-ex="' + Fmt.esc(o.key) + '">' +
            Fmt.esc(o.name) + '</button>').join('') +
        '</div></div>'
      document.querySelectorAll('#app button[data-ex]').forEach(b => {
        b.onclick = () => {
          this.result = this.compute(this.picked, b.dataset.ex)
          this.paint()
        }
      })
      return
    }
    box.innerHTML = '<div class="card">' +
      '<h2>' + Fmt.esc(r.title) +
        (r.src ? ' <span class="tag' + (r.src === '推演' ? ' warn' : '') + '">' + Fmt.esc(r.src) + '</span>' : '') +
      '</h2>' +
      '<div class="muted txs">' + Fmt.esc(r.why || '') + '</div>' +
      (r.changes && r.changes.length
        ? '<div style="margin-top:10px;border-top:1px dashed var(--line);padding-top:6px">' +
          r.changes.map(c => UI.li(Fmt.esc(c.k), Fmt.esc(c.from), '→ ' + Fmt.esc(c.to))).join('') +
          '</div>'
        : '') +
      (r.note ? '<div class="muted txs" style="margin-top:10px;border-top:1px dashed var(--line);padding-top:8px">' +
        Fmt.esc(r.note) + '</div>' : '') +
      (r.apply
        ? '<button class="btn" style="margin-top:12px" id="coachApply">应用到我的计划</button>'
        : '<div class="muted txs" style="margin-top:10px">这条不用改计划 —— 照着做就行。</div>') +
    '</div>'
    const btn = document.getElementById('coachApply')
    if (btn) btn.onclick = () => this.apply()
  },

  bind() {
    document.querySelectorAll('#app button[data-sit]').forEach(b => {
      b.onclick = () => {
        this.picked = b.dataset.sit
        this.result = this.compute(this.picked)
        this.render()
      }
    })
  },

  compute(key, ex) {
    const u = Store.state.user || {}
    const plan = u.plan
    const today = Fmt.todayStr()
    let day = null
    if (plan && plan.micro && plan.micro.length) {
      try {
        const idx = Math.max(0, ENGINE.calc.dayIndexFromStart(plan.cycleStart || today, today))
        day = ENGINE.kb.dayContent(plan, idx, u.profile, !!plan.home)
      } catch (e) { day = null }
    }
    try {
      return ENGINE.coach.advise(key, {
        engine: ENGINE,
        profile: u.profile || {},
        plan: plan,
        dietState: u.dietState || {},
        checkins: Store.state.checkins || [],
        day: day,
        today: today
      }, { exercise: ex })
    } catch (e) { return { ok: false, msg: (e && e.message) || String(e) } }
  },

  apply() {
    const r = this.result
    if (!r || !r.apply) return
    const u = Store.state.user
    const a = r.apply
    try {
      if (a.type === 'macro') {
        u.dietState = ENGINE.macro.apply(a.payload.rev, u.dietState)
        Store.saveCloud({ dietState: u.dietState })
      } else if (a.type === 'hunger') {
        u.dietState = Object.assign({}, u.dietState, a.payload.next, { lastType: '很饿' })
        Store.saveCloud({ dietState: u.dietState })
      } else if (a.type === 'state') {
        u.profile = Object.assign({}, u.profile, {
          todayState: { date: Fmt.todayStr(), key: a.payload.key }
        })
        Store.saveCloud({ profile: u.profile })
      } else if (a.type === 'plan') {
        u.plan = a.payload.plan
        Store.saveCloud({ plan: u.plan })
      } else {
        UI.toast('这条还不支持自动应用'); return
      }
      Store.saveCache()
      UI.toast(a.type==='state'?'已记录今日疲劳状态；重量建议按权益生效':a.type==='macro'||a.type==='hunger'?'已保存饮食调整；自定参考目标需另行复核':'已更新训练计划')
      this.result = null
      this.picked = ''
      this.render()
    } catch (e) { UI.toast('应用失败：' + ((e && e.message) || e)) }
  },

  schedulePage(){
    const u=Store.state.user||{},plan=u.plan,today=Fmt.todayStr()
    if(!plan){document.getElementById('app').innerHTML=Router.bar('顺延训练')+'<div class="card">请先建立训练计划。</div>';return}
    const list=plan.schedulePauses||[]
    document.getElementById('app').innerHTML=Router.bar('顺延训练','临时休息，后续接着原顺序练')+
      '<div class="card"><h2>这次休息几天？</h2><p class="muted txs">今天没空选1天；要补回前几天漏练的安排，可修改开始日期。只插入休息日，不移动过去的周期起点。</p><label>从哪天开始 <input id="pauseFrom" class="pro-input" type="date" max="'+today+'" value="'+today+'"></label><div class="schedule-options">'+[1,2,3,5,7].map(n=>'<button class="chip" onclick="PageCoach.openSchedule('+n+')">休息 / 顺延'+n+'天</button>').join('')+'</div><p class="muted txs">已完成的训练不能补设为休息。未完成的部分组数保留在原日期，不自动复制到恢复日。</p></div>'+
      (list.length?'<div class="card"><h2>最近的顺延</h2>'+list.slice().reverse().slice(0,5).map(x=>'<p>'+Fmt.esc(x.fromDate||Fmt.shiftDate(plan.cycleStart,x.at))+'起 · '+x.days+'天</p>').join('')+'<button class="btn line" onclick="PageCoach.undoSchedule()">撤销最近一次顺延</button></div>':'')+
      '<button class="btn line" onclick="Router.go(\'plan\')">查看完整计划</button><button class="btn line" onclick="Router.go(\'home\')">返回洞府</button>'
  },
  completedIn(from,days){return (Store.state.checkins||[]).some(c=>c.date>=from&&c.trained)},
  openSchedule(days){
    const u=Store.state.user||{},plan=u.plan,from=(document.getElementById('pauseFrom')||{}).value||Fmt.todayStr()
    let next;try{if(from>Fmt.todayStr())throw new Error('开始日期请选择今天或之前');if(this.completedIn(from,days))throw new Error('开始日期之后已有完成训练，请从之后的未练日期顺延');next=ENGINE.kb.postponePlan(plan,from,days)}catch(e){UI.toast(e.message);return}
    const resume=Fmt.shiftDate(from,days),preview=Array.from({length:Math.min(7,days+3)},(_,i)=>{const date=Fmt.shiftDate(from,i),idx=ENGINE.calc.dayIndexFromStart(plan.cycleStart,date),d=ENGINE.kb.dayContent(next,idx,u.profile,next.home);return '<div><span>'+date+'</span><b>'+Fmt.esc(d.focus||'休息')+'</b></div>'}).join('')
    UI.modal({title:'确认顺延'+days+'天？',body:'<p>'+from+'起安排临时休息，'+resume+'起接着原顺序。历史打卡保留；原日期未完成的组数不自动算到恢复日。</p><div class="schedule-preview">'+preview+'</div>',okText:'确认顺延',onOk:()=>{
      if(Store.state.user.plan!==plan){UI.toast('计划已变化，请重新预览');return true}
      const p=Object.assign({},u.profile),ts=p.todayState||{};if(ts.date>=from&&ts.date<resume)delete p.todayState
      Store.patchUser({plan:next,profile:p});UI.toast('已顺延，可撤销');Router.go('coach/schedule');this.schedulePage()
    }})
  },
  undoSchedule(){const u=Store.state.user||{},plan=u.plan,list=(plan&&plan.schedulePauses)||[];if(!list.length)return;const last=list[list.length-1],from=last.fromDate||Fmt.shiftDate(plan.cycleStart,last.at)
    if((Store.state.checkins||[]).some(c=>c.trained&&c.date>=from)){UI.toast('顺延后已有完成训练，请保留历史并重新安排后续');return}
    UI.modal({title:'撤销最近一次顺延？',body:'<p>将恢复这次顺延前的后续排期，已有记录保留。</p>',onOk:()=>{if(Store.state.user.plan!==plan){UI.toast('计划已变化，请重新预览');return true}Store.patchUser({plan:Object.assign({},plan,{schedulePauses:list.slice(0,-1)})});this.schedulePage();UI.toast('已撤销顺延')}})
  },

  /** AI 顾问已上线：规则算不出的一半交给知识库 + 大模型 */
  aiHint() {
    return '<div class="card">' +
      '<h2>更细的问题 <span class="tag gold">AI 顾问</span></h2>' +
      '<div class="muted txs">上面这些是「能用数据算出来」的调整。下面这类要动教练知识库，去问 AI：</div>' +
      ENGINE.coach.AI_TOPICS.map(t =>
        '<div class="muted txs" style="margin-top:4px">· ' + Fmt.esc(t) + '</div>').join('') +
      '<button class="btn" style="margin-top:10px" onclick="Router.go(\'ai\')">去问 AI 顾问 →</button>' +
      '<div class="muted txs" style="margin-top:6px">它的知识库是谭成义的口径，你的数字是引擎算的 —— 它不编数。' +
      '如果它觉得你的计划要调，会给一个「一键应用」按钮。</div>' +
    '</div>'
  }
}
