/* src/pages/today.js —— 训练页：用真实引擎渲染当天课表，支持记录组次并本地试算 EXP */
const PageToday = {
  date: '',
  progressionCard(e,i){
    const plan=Store.state.user.plan,c=ENGINE.progression.configFor(e,plan),s=c&&ENGINE.progression.suggestion(e,plan,Store.state.checkins,Fmt.shiftDate(this.date,1))
    return '<details class="progression-box"><summary>训练递进'+(c?' · 已启用':' · 可选')+'</summary><p class="muted txs">'+(c?'此动作按实际工作组推进，替代周期加重；每次建议由你确认。':'默认沿用原计划。可按实际能力设置起点，逐组达标后再推进。')+'</p>'+
      (c?'<p><b>本次目标：'+Fmt.esc(ENGINE.progression.label(e.target)||'保留原记录，下次起生效')+'</b></p><label class="progression-ready"><input type="checkbox" data-ready="'+i+'" onchange="PageToday.persistDraft()" '+(e.progressReady?'checked':'')+'> 动作稳定、没有疼痛，结束后仍有约2次余力</label>'+(s?'<p class="muted txs">'+(s.date?Fmt.esc(s.date+'：'+s.summary)+'<br>':'')+Fmt.esc(s.reason)+'</p>':'')+
        (s&&s.target?'<p>下次建议：<b>'+Fmt.esc(ENGINE.progression.label(Object.assign({},s.target,s.value)))+'</b></p>':'')+
        (s&&s.source&&s.kind!=='calibrate'&&(!c.accepted||c.accepted.source!==s.source)?'<button class="chip" onclick="PageToday.acceptProgression('+i+')">确认采用下次目标</button>':'')+(c.accepted&&s&&c.accepted.source===s.source?'<p class="muted txs">已采用，下次训练生效</p>':'')+(c.accepted?'<button class="chip" onclick="PageToday.undoProgression('+i+')">撤销上次采用</button>':''):'')+
      '<button class="chip" onclick="PageToday.editProgression('+i+')">'+(c?'调整 / 关闭递进':'设置递进起点')+'</button></details>'
  },
  editProgression(i){
    if(this.date!==Fmt.todayStr()){UI.toast('请回到今天设置，历史记录保持原样');return}
    this.syncFromDOM();const e=this._exs[i],plan=Store.state.user.plan,P=ENGINE.progression,c=P.configFor(e,plan),ps=ENGINE.pro.parseSets(e.sets),kind=c?c.kind:/辅助.*引体|助力/.test(e.name)?'assisted':/秒|平板|悬垂/.test(e.sets+' '+e.name)?'time':e.equipment==='无器械'?'bodyweight':'load'
    const field=(id,label,value)=>'<label>'+label+'<input class="pro-input" id="pg-'+id+'" type="number" min="0" value="'+value+'"></label>'
    UI.modal({title:'设置 '+e.name+' 的递进',body:'<p class="muted txs">先选你实际能完成的起点。哑铃重量按每只填写；助力越小越难。仅这个动作使用递进，已完成记录保留。</p><label>类型<select class="pro-input" id="pg-kind">'+[['load','负重动作'],['assisted','助力器械'],['bodyweight','自重次数'],['time','静态计时（秒）']].map(x=>'<option value="'+x[0]+'" '+(kind===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select></label>'+field('sets','工作组数',c?c.sets:ps.sets)+field('min','次数 / 秒数下限',c?c.min:kind==='time'?30:Math.min(ps.reps,8))+field('max','次数 / 秒数上限',c?c.max:kind==='time'?60:Math.max(ps.repMax,12))+field('weight','起始重量kg（自重 / 计时填0）',c?c.weight:0)+field('step','最小加重档位kg',c?c.step:e.equipment==='哑铃'?1:2.5)+'<label>可用重量档位（选填，逗号分隔）<input class="pro-input" id="pg-weights" value="'+Fmt.esc(c?(c.weights||[]).join(','):'')+'" placeholder="例如 2,4,6,8"></label>'+(c?'<label><input type="checkbox" id="pg-off"> 关闭该动作递进，恢复原计划</label>':''),okText:'确认设置',onOk:()=>{
      if(Store.state.user.plan!==plan){UI.toast('计划已变化，请重新设置');return true}
      let next;try{if(!(document.getElementById('pg-off')||{}).checked){const raw={kind:document.getElementById('pg-kind').value,weights:document.getElementById('pg-weights').value,id:Date.now()+'_'+Math.random().toString(36).slice(2),scope:P.scope(plan)};['sets','min','max','weight','step'].forEach(k=>raw[k]=Number(document.getElementById('pg-'+k).value));next=P.normalizeConfig(raw)}}catch(err){UI.toast(err.message);return true}
      const map=Object.assign({},plan.exerciseProgression);if(next)map[P.key(e)]=next;else delete map[P.key(e)]
      const current=this.collect(),keep=current.some(x=>x.log.some(s=>s.done)),np=Object.assign({},plan,{exerciseProgression:map})
      Store.patchUser({plan:np});if(keep){try{localStorage.setItem(this.draftKey(),JSON.stringify({date:this.date,exercises:current}))}catch(err){UI.toast('本机保存失败，请先保存打卡')}}else{try{localStorage.removeItem(this.draftKey())}catch(err){}}
      this.render([this.date]);UI.toast(keep?'已设置；本次已记录组保持原样，下次生效':'递进设置已保存')
    }})
  },
  acceptProgression(i){
    const e=this._exs[i],u=Store.state.user,plan=u.plan,P=ENGINE.progression,c=P.configFor(e,plan),s=c&&P.suggestion(e,plan,Store.state.checkins,Fmt.shiftDate(this.date,1));if(!s||!s.source){UI.toast('先保存训练记录，再查看下次建议');return}
    UI.modal({title:'采用为下次目标？',body:'<p>'+Fmt.esc(P.label(Object.assign({},s.target,s.value)))+'</p><p class="muted">'+Fmt.esc(s.reason)+'</p><p class="muted txs">从该记录之后的训练日起生效，本次组数与历史不变。</p>',onOk:()=>{
      if(Store.state.user.plan!==plan||P.suggestion(e,plan,Store.state.checkins,Fmt.shiftDate(this.date,1)).source!==s.source){UI.toast('记录或计划已变化，请重新确认');return true}
      let next;try{next=P.accept(c,s)}catch(err){UI.toast(err.message);return true}this.writeProgression(e,next);UI.toast('下次目标已保存')
    }})
  },
  writeProgression(e,c){this.persistDraft();const cur=this.collect(),plan=Store.state.user.plan,map=Object.assign({},plan.exerciseProgression,{[ENGINE.progression.key(e)]:c});Store.patchUser({plan:Object.assign({},plan,{exerciseProgression:map})});try{localStorage.setItem(this.draftKey(),JSON.stringify({date:this.date,exercises:cur}))}catch(err){}this.render([this.date])},
  undoProgression(i){const e=this._exs[i],c=ENGINE.progression.configFor(e,Store.state.user.plan);if(!c||!c.accepted){UI.toast('没有可撤销的采用记录');return}this.writeProgression(e,Object.assign({},c,{accepted:c.previousAccepted||null,previousAccepted:null}));UI.toast('已恢复上次目标，训练记录保留')},


  draftKey(date) {
    const u = Store.state.user || {}
    return 'lbgym_draft_v2_' + JSON.stringify([u._id || u.id || u.playerNo || (u.player || {}).no || 'demo', date || this.date, u.plan || {}])
  },
  readDraft(date) {
    try { return JSON.parse(localStorage.getItem(this.draftKey(date)) || 'null') } catch(e) { return null }
  },
  persistDraft() {
    if (!this.date || !document.getElementById('exWrap')) return
    const exercises = this.collect()
    if (!exercises.length) return
    try { localStorage.setItem(this.draftKey(), JSON.stringify({ date: this.date, exercises })) }
    catch(e) { if (!this._draftWarned) { UI.toast('本机存储已满，请及时保存打卡'); this._draftWarned = true } }
  },

  render(args) {
    const u = Store.state.user
    this.date = (args && args[0]) || Fmt.todayStr()
    const plan = u && u.plan
    if (!plan || !plan.micro || !plan.micro.length) {
      document.getElementById('app').innerHTML = Router.bar('今日训练') +
        '<div class="card">' + UI.empty('还没有训练计划') +
        '<button class="btn" onclick="Router.go(\'home\')">回首页</button></div>'
      return
    }

    const idx = ENGINE.calc.dayIndexFromStart(plan.cycleStart || this.date, this.date)
    const day = ENGINE.kb.dayContent(plan, Math.max(0, idx), u.profile, !!plan.home)
    const ck = this.readDraft() || Store.checkinOf(this.date) || { date: this.date, exercises: [] }

    // 完整版：算出每个动作的建议重量。未开通时 presc 为空，免费版行为完全不变。
    const on = ENGINE.pro.isPro(u)
    // 当天状态：「调一下」里点过「没睡好 / 很累」就按它降量（只对当天生效）
    const ts = (u.profile || {}).todayState || {}
    const stKey = ts.date === this.date ? (ts.key || 'ok') : 'ok'
    const presc = {}
    if (on) {
      try {
        ENGINE.pro.applyState(day, u.profile, Store.state.checkins || [], stKey)
          .list.forEach(x => { presc[x.name] = x })
      } catch (e) { /* 处方算不出来不该影响免费版功能 */ }
    }

    // 把已记录的组次合并回 exercises（按动作名匹配）
    // 动作编辑持久化（2026-10-16 用户反馈「删了明天又回来 = 等于没有」）：
    //   删/换 → 本机按循环槽位记住；加 → 写 plan.slotExercises（云端持久）
    this._dayEdit = this.readDayEdit()
    const exs = this.applyDayEdit(day.exercises || [], this._dayEdit).map(e => {
      const saved = (ck.exercises || []).find(s => s.name === e.name)
      const sets = Number(String(e.sets).split('×')[0]) || 3
      const reps = parseInt(String(e.sets).split(/[×x]/i)[1], 10) || 10
      const log = saved && Array.isArray(saved.log) && saved.log.length ? saved.log.map(s => Object.assign({}, s)) : Array.from({ length: sets }, () => ({ weight: '', reps: String(reps), done: false }))
      const recovery=!!day.deload||!['ok','good'].includes(stKey)
      const target=saved&&saved.target?ENGINE.progression.cleanTarget(saved.target):saved?null:ENGINE.progression.targetFor(e,plan,Store.state.checkins||[],this.date,recovery)
      if(target&&!saved){log.splice(0,log.length,...Array.from({length:target.sets},()=>({weight:target.weight,reps:target.reps,done:false})));delete presc[e.name]}
      if(ENGINE.progression.configFor(e,plan))delete presc[e.name]
      return Object.assign({},e,{log,target,progressReady:!!(saved&&saved.progressReady),sets:target?target.sets+'×'+target.reps+(target.kind==='time'?'秒':''):e.sets})
    })

    if (day.type === 'rest') {
      document.getElementById('app').innerHTML = Router.bar('今日训练', Fmt.monthDay(this.date) + ' ' + Fmt.weekdayCN(this.date)) +
        '<div class="card"><h2>休息日</h2><p class="muted">' + Fmt.esc(day.note || '散步/拉伸/筋膜放松，恢复也是训练的一部分。') + '</p></div>' +
        this.dateBar() + '<div id="noteBox">' + JournalUI.render(this.date) + '</div>'
      this._exs = null
      this.mountNote()
      this.bindDateBar()
      return
    }

    this._exs = exs          // 加/减组要就地重画清单，所以把当前态挂在实例上
    this._presc = presc || {}

    document.getElementById('app').innerHTML =
      Router.bar('今日训练', Fmt.monthDay(this.date) + ' ' + Fmt.weekdayCN(this.date) + ' · 第 ' + (idx + 1) + ' 天') +
      this.dateBar() + TrainingFlow.render(day) +
      '<div class="card today-card" id="strengthSection">' +
        '<h2>02 · 力量训练：' + Fmt.esc(day.focus) +
        (day.src === '推演' ? '<span class="tag warn">推演</span>' : '<span class="tag">原文</span>') + '</h2>' +
        '<div id="todayProg">' + this.progressHTML(exs) + '</div><p class="muted txs">做完一组后勾选“完成”。默认自动计休息，可在下方设置中关闭。</p>' +
        '<details class="fold" style="margin-top:10px">' +
          '<summary>计划说明 / 今天没空？</summary>' +
          (plan && plan.basis ? '<div class="muted txs" style="margin-top:6px">' + Fmt.esc(plan.basis) + '</div>' : '') +
          // 节假日 / 临时没空：把整个循环往后顺延（练腿日照原顺序挪到你有空的那天）
          '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--line)">' +
            '<span class="muted txs">今天没空练？把计划往后顺延：</span>' +
            [1, 2, 3].map(n => '<button class="chip" style="margin-left:6px" onclick="PagePlan.delay(' + n +
              ')">顺延 ' + n + ' 天</button>').join('') +
            '<span class="muted txs" style="margin-left:6px">（停几天顺几天，不用对不上）</span>' +
          '</div>' +
        '</details>' +
      '</div>' +
      // 清单单独包一层 id：加/减组时只重画这一块，不动其它已填内容
      '<div class="card" id="exWrap">' + this.exListHTML(exs, this._presc) + '</div>' +

      TrainingFlow.cardio(day) +
      this.methodCard(plan, day, idx) +
      this.proCard(u, day, presc, on) +

      // 调整顾问入口：反馈 → 算调整 → 确认 → 改计划
      this.coachEntry() +

      // 训练日志：拍一张照 / 写一句「今天想说什么」/ 看今天的突破
      '<div id="noteBox">' + JournalUI.render(this.date) + '</div>'

    this.bindSets(exs)
    TrainingFlow.mount()
    this.bindDateBar()
    this.mountNote()
    // 恢复本机持久化的倒计时（2026-10-18 复查：暂停后刷新/切页回来，计时面板此前的恢复调用点缺失）
    WorkoutTimer.mount()
    // 练前自评（每天一次，只建议不强制）
    PagePreCheck.maybeShow(this.date, day.type !== 'rest')
  },

  /** 挂载训练日志编辑器（今日页底部） */
  mountNote() {
    // 内容已经在 render() 里内联画好了，这里只绑事件
    if (!document.getElementById('noteBox')) return
    JournalUI.bind(this.date, () => this.mountNote())
  },

  /**
   * 「这一套是怎么定的」—— 把引擎里的方法论露到界面上。
   *
   * 为什么必须露：这些规则（组次口径 / 强度 / 组间休息 / 递进 / 减载）一直在引擎里跑，
   * 但以前**一个字都没显示**，用户看到"4×8"不知道凭什么，也不知道下一步怎么加。
   * 知识藏在代码里 = 用户觉得你没知识。
   */
  methodCard(plan, day, idx) {
    const M = ENGINE.method
    const goal = (plan && plan.goal) || '塑形'
    const exp = (((Store.state.user || {}).profile) || {}).exp || '新手'
    const byExp = (M.SETS_BY_GOAL[goal] || {})
    const g = byExp[exp] || byExp.新手 || {}
    // ⚠️ 「第几周」必须用引擎算的 day.week，不能自己按 7 天除 ——
    //    引擎的 week = 第几轮循环，循环制（练4休1）一轮是 5 天，按 7 天算会完全对不上。
    const week = (day && day.week) || 1
    const everyWk = (M.DELOAD && M.DELOAD.everyWeeks) || 4
    const posInCycle = ((week - 1) % everyWk) + 1
    const isDeload = !!(day && day.deload)
    const phase = isDeload ? '减载（本周主动降量）'
      : posInCycle === 1 ? '打基础（组次最多、先把动作练熟）'
      : posInCycle === 2 ? '加重量（组次降一档、重量往上走）'
      : '上强度（组次最少、重量最重）'
    const nextDeload = isDeload ? week + everyWk : week + (everyWk - posInCycle)
    const t = 'muted txs'
    // 计划原理 = 按需展开（改版方案：主区只留"练"，原理说明不抢主操作）
    return '<details class="fold"><summary>这一套是怎么定的（组次 / 休息 / 递进 / 减载）</summary>' +
      '<div class="muted txs" style="margin:8px 0 4px">' + Fmt.esc(goal) + ' × ' + Fmt.esc(exp) + '</div>' +
      UI.kv([
        { k: '主项', v: g.主项 || '—' },
        { k: '辅助', v: g.辅助 || '—' },
        { k: '孤立', v: g.孤立 || '—' },
        { k: '核心', v: g.核心 || '—' }
      ]) +
      '<div class="' + t + '" style="margin-top:8px"><b>组间休息</b>：深蹲/卧推/硬拉/腿举等大复合 4 分钟 · 其余主项 ' +
        Fmt.round(M.REST.主项 / 60, 0) + ' 分钟 · 辅助 ' + M.REST.辅助 +
        ' 秒 · 孤立 ' + M.REST.孤立 + ' 秒 · 核心 ' + M.REST.核心 + ' 秒。' +
        Fmt.esc(M.REST_NOTE || '') +
        '</div>' +
      '<div class="' + t + '" style="margin-top:6px"><b>用力程度</b>：主项留约 2 次余力；孤立动作接近做不动时停止，保持动作稳定。</div>' +
      '<div class="' + t + '" style="margin-top:6px"><b>主项怎么往上加</b>：' +
        M.MAIN_LADDER.join(' → ') + '。' + Fmt.esc(M.MAIN_NOTE || '') + '</div>' +
      '<div class="' + t + '" style="margin-top:6px"><b>什么时候减载</b>：' + Fmt.esc(M.DELOAD.note) +
        (isDeload ? ' <span class="tag warn">本轮是减载轮</span>' : '') + '</div>' +
      '<div class="' + t + '" style="margin-top:6px"><b>你现在</b>：第 ' + week + ' 轮循环 · ' +
        Fmt.esc(phase) + '；下次减载在第 ' + nextDeload + ' 轮。' +
        '<br>（一轮 = 把上面那串训练日走完一遍' +
        (plan && plan.micro ? '，共 ' + plan.micro.length + ' 天' : '') + '。）</div>' +
      (M.CORE ? '<div class="' + t + '" style="margin-top:6px"><b>腹部</b>：' + Fmt.esc(M.CORE.note) + '</div>' : '') +
    '</details>'
  },

  /**
   * 完整版区块。三种形态：
   *   已开通 + 训练日 → 今日重量摘要（动作卡里的重量框已预填建议值）
   *   已开通 + 休息日 → 状态说明
   *   未开通          → 「里面有什么」+ 开通入口（免费用户永远只看得到这一段）
   */
  proCard(u, day, presc, on) {
    let innerOn = ''
    if (on) {
      if (!day || day.type !== 'train') {
        innerOn = '<div class="muted txs" style="margin-top:10px">今天是休息日，没有重量处方。周期表与饮食计划随时可看。</div>' +
          '<button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'pro\')">打开完整版计划</button>'
      } else {
        const list = Object.keys(presc).map(k => presc[k])
        const sum = list.reduce((s, x) => s + (x.weight > 0 ? x.weight * x.setsN * x.reps : 0), 0)
        const est = list.filter(x => x.src === '推演').length
        const altNotes = list.filter(x => x.altNote)
        innerOn = '<div class="muted txs" style="margin-top:10px">动作卡里的「重量 kg」已按你的档案预填 —— <b>觉得轻了/重了，直接在下面清单里改成你实际的</b>，' +
          '打完卡它就记住你，下一轮按实测走、不再估。估算是故意保守的起步值（怕新手被大重量吓到），练一两周就全是你的数了。</div>' +
          (altNotes.length
            ? '<div style="margin-top:8px;padding:10px 12px;background:var(--green-soft);border-radius:10px;font-size:12px;line-height:1.7">' +
              '<b>🧘 女生新手看这里：</b>' + Fmt.esc(altNotes[0].altNote) +
              (altNotes.length > 1 ? '<br>（同样适用于：' + Fmt.esc(altNotes.slice(1).map(x => x.name).join('、')) + '）' : '') + '</div>'
            : '') +
          '<div class="muted txs" style="margin-top:6px">计划总容量约 <b>' + Fmt.round(sum / 1000, 1) + ' 吨</b>' +
          (est ? '；其中 ' + est + ' 个动作还是估算起点（标了「推演」）' : '；全部基于你自己的实测记录') + '。</div>' +
          '<button class="btn" style="margin-top:10px" onclick="Router.go(\'pro\')">看完整周期表与饮食计划</button>'
      }
    }

    const li = (a, b) => '<div style="padding:6px 0;border-bottom:1px solid var(--line)">' +
      '<b style="font-size:13px">' + Fmt.esc(a) + '</b>' +
      '<div class="muted txs">' + Fmt.esc(b) + '</div></div>'
    // 完整版区块折叠（改版方案：训练主区一个主操作；卖点与摘要按需展开）
    return '<details class="fold">' +
      (on
        ? '<summary>⚡ 完整版 · 今日重量摘要 <span class="tag">已开通</span></summary>'
        : '<summary>⚡ 完整版 · 每个动作练多重 <span class="tag gold">收费</span></summary>') +
      (on
        ? innerOn
        : '<div style="margin-top:10px">' +
          '<div class="muted txs">上面免费给的是<b>动作骨架</b> —— 练什么、几组几次。完整版补上这四样：</div>' +
          '<div style="margin-top:6px">' +
            li('每个动作练多重、怎么往上加', '现在只写「4×8」，完整版给到具体重量（含每只 / 自重）与逐轮递进') +
            li('四周一个周期表', '哪一轮加量、哪一轮减载（组数 ×0.6），一张表看完整个周期') +
            li('状态不好怎么临时调', '睡少了 −10%、只有 30 分钟只做主项 —— 按规则降量而不是干脆不练') +
            li('完整饮食计划', '三套饮食口径（都标了出处）、练前练后怎么吃、外卖怎么点、补剂与饮水') +
          '</div>' +
          '<button class="btn ghost" style="margin-top:12px" onclick="Router.go(\'pro\')">看看里面有什么</button>' +
        '</div>') +
    '</details>'
  },

  /** 「调一下」入口 —— 免费也能用：这些都是基础调整，不该锁在付费墙后面 */
  coachEntry() {
    return '<div class="card">' +
      '<h2>训练与饮食需要调整？ <span class="mini">调一下</span></h2>' +
      '<div class="muted txs">体重卡住、老是饿、没睡好、练不过来 —— 点一下，我按规则算该怎么调，' +
        '算完能直接改进你的计划。</div>' +
      '<button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'coach\')">查看调整建议</button>' +
    '</div>'
  },

  /**
   * 动作库回查：引擎的课表只存 `oid`（故意的 —— 动作库改名/换图不会把老计划弄裂），
   * 但页面必须自己回查，否则图与要领就永远是空的。
   * 2026-09-23 用户截图反馈「左边全是无图、单看名字不知道怎么做」就是这个原因。
   */
  exInfo(e) {
    if (!e) return null
    const key = e.oid || e.name || ''
    if (!key) return null
    this._exlib = this._exlib || {}
    if (this._exlib[key] !== undefined) return this._exlib[key]
    const lib = ENGINE.kb.EX || []
    // 先按 oid 试（引擎课表里存的就是它），再退回按动作名查。
    // ⚠️ 必须有名字兜底：29 条最主流的动作（卧推/划船/下拉/推举…）在动作库里 gif 是空的，
    //    于是 oid 也为空 —— 只按 oid 查的话它们永远拿不到要领。
    let hit = null
    if (e.oid) {
      hit = lib.find(x => {
        const u = Array.isArray(x.gif) ? x.gif[0] : (x.gif || '')
        return u && String(u).indexOf('/' + e.oid + '/') >= 0
      }) || null
    }
    if (!hit) hit = lib.find(x => x.name === e.name) || null
    this._exlib[key] = hit
    return hit
  },

  /** 动作清单整块（初次渲染与加/减组后重画都走这里，保证只有一处真相）
   *  openMap：重画时保留每张动作卡的展开/收起状态（重画不吞用户的折叠操作） */
  exListHTML(exs, presc, openMap) {
    const firstOpen = exs.findIndex(e => e.log.some(x => !x.done))   // 第一个没练完的动作默认展开
    return '<div class="draft-status">输入自动暂存本机 · 完成后保存打卡</div><h2>动作清单 <span class="mini" id="vol">容量 0 吨</span>' +
      '<button class="chip" style="margin-left:8px" onclick="PageToday.openPicker(\'add\')">＋ 加动作</button>' +
      '<button class="chip" style="margin-left:8px" onclick="PagePoster.showToday()">📸 昭告天下</button></h2>' +
      '<details class="workout-help"><summary>重量填写与自动计时设置</summary><div class="muted txs" style="margin:10px 0">重量口径：<b>杠铃含杆</b>（奥杆约 20kg）· <b>哑铃为单只</b>重量 · 自重动作填 0 按次数推进。' +
        '点重量格弹出滑条，勾完一组<b>底部出现组间倒计时</b>（' + (this.autoRest() ? '已开）' : '已关）') +
        '<button class="chip" style="margin-left:6px;padding:2px 10px;font-size:11px" onclick="PageToday.toggleAutoRest()">' +
        (this.autoRest() ? '关掉它' : '打开它') + '</button></div></details>' +
      exs.map((e, ei) => this.exCard(e, ei, (presc || {})[e.name],
        openMap ? openMap[ei] : ei === firstOpen)).join('') +
      '<button class="btn" style="margin-top:12px" id="saveBtn">保存打卡</button>' +
      '<div class="muted txs" style="margin-top:8px" id="expHint"></div>'
  },

  /** 顶部进度：当前动作 + 已完成组数（勾一组就刷新，与清单同一份处方数据） */
  progressHTML(exs) {
    const done = exs.reduce((s, e) => s + e.log.filter(x => x.done).length, 0)
    const total = exs.reduce((s, e) => s + e.log.length, 0)
    let cur = null
    exs.forEach((e, i) => { if (!cur && e.log.some(x => !x.done)) cur = { name: e.name, i: i + 1 } })
    const pct = total ? Math.round(done / total * 100) : 0
    return '<div class="prog today-prog"><div class="lab"><span>' +
      (cur ? '当前动作：' + Fmt.esc(cur.name) + '（第 ' + cur.i + '/' + exs.length + ' 个）' : '全部完成 ✓') +
      '</span><b>' + done + ' / ' + total + ' 组</b></div>' +
      '<div class="track"><div class="fill ' + (pct >= 100 ? '' : pct > 0 ? '' : 'warn') + '" style="width:' + pct + '%"></div></div></div>'
  },
  refreshProg() {
    const el = document.getElementById('todayProg')
    if (!el || !this._exs || !this._exs.length) return
    // 进度从 DOM 现读（collect），保证与用户刚勾的组一致 —— 与清单是同一份处方
    const cur = this.collect()
    if (!cur.length) return
    const done = cur.reduce((s, e) => s + e.log.filter(x => x.done).length, 0)
    const total = cur.reduce((s, e) => s + e.log.length, 0)
    let first = null
    cur.forEach((e, i) => { if (!first && e.log.some(x => !x.done)) first = { name: e.name, i: i + 1 } })
    const pct = total ? Math.round(done / total * 100) : 0
    el.innerHTML = '<div class="prog today-prog"><div class="lab"><span>' +
      (first ? '当前动作：' + Fmt.esc(first.name) + '（第 ' + first.i + '/' + cur.length + ' 个）' : '全部完成 ✓') +
      '</span><b>' + done + ' / ' + total + ' 组</b></div>' +
      '<div class="track"><div class="fill" style="width:' + pct + '%"></div></div></div>'
  },

  prescriptionText(e) {
    const parts=String(e.sets||'').replace(/秒$/,'').split(/[×x]/i), seconds=Number(e.rest)||120;
    const rest=(Math.floor(seconds/60)?Math.floor(seconds/60)+' 分钟':'')+(seconds%60?' '+seconds%60+' 秒':'');
    return Fmt.esc(parts.length>1?'计划 '+parts[0].trim()+' 组，每组 '+parts.slice(1).join('×').trim()+(e.target&&e.target.kind==='time'?' 秒':' 次'):'计划 '+String(e.sets||'按计划完成'))+'<br>组间休息 '+rest
  },

  /** 双帧循环图（对应小程序 frame-gif 组件）：两帧自动交替 = "做动作"的演示效果。
   *  单帧/字符串 → 静态图；空 → 无图占位。 */
  framesHTML(gif) {
    const arr = Array.isArray(gif) ? gif : (gif ? [gif] : [])
    if (!arr.length) return '<div class="ex-thumb" style="display:flex;align-items:center;justify-content:center;color:#b9bec7;font-size:11px">无图</div>'
    if (arr.length < 2) return '<img class="ex-thumb" loading="lazy" referrerpolicy="no-referrer" src="' + Fmt.esc(arr[0]) + '" onerror="this.style.visibility=\'hidden\'">'
    return '<div class="ex-thumb ex-frames">' +
      '<img src="' + Fmt.esc(arr[0]) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility=\'hidden\'">' +
      '<img class="f1" src="' + Fmt.esc(arr[1]) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility=\'hidden\'">' +
      '</div>'
  },

  /** 动作卡：details 折叠式 —— summary = 动作名 + 组次 + 完成进度；点开才见图 / 要领 / 组次表格。
   *  力量主区一屏只看到「要做什么」，细节按需展开（用户 2026-10-16 指定，类热身的折叠样式）。 */
  exCard(e, ei, sug, forceOpen) {
    const info = this.exInfo(e)
    const gif = (info && info.gif) || e.gif || null
    // 要领在库里是「；」分段的一串 —— 全部列出来，不能只显示第一句（新手看不懂动作）
    const points = String(e.points || (info && info.points) || '')
      .split('；').map(s => s.trim()).filter(Boolean)
    const done = e.log.filter(x => x.done).length
    const open = forceOpen === undefined ? ei === 0 : !!forceOpen
    return '<details class="ex-card" data-ex="' + ei + '"' + (open ? ' open' : '') + '>' +
      '<summary>' +
        '<span class="ex-sum-t"><b>' + Fmt.esc(e.name) + '</b>' +
        '<span class="tag gray">' + Fmt.esc(e.role || '') + '</span></span>' +
        '<span class="ex-sum-meta">' + Fmt.esc(e.sets || '') + '<br>' +
        (done >= e.log.length ? '<b style="color:var(--green)">已完成 ✓</b>' : '完成 ' + done + '/' + e.log.length) + '</span>' +
        '<span class="arr">›</span>' +
      '</summary>' +
      '<div class="ex-body">' +
      this.framesHTML(gif) +
      '<div class="ex-info">' +
        '<div class="exercise-prescription">'+this.prescriptionText(e)+'</div>' +
        (e.log.length !== (parseInt(e.sets,10)||e.log.length) ? '<div class="muted txs">本次记录 '+e.log.length+' 组（已调整）</div>' : '')+
        '<p class="exercise-effort">'+(/主项|辅助/.test(e.role||'辅助')?'重量怎么选：做完这一组，感觉还能再做约 2 次（强度口径 '+Fmt.esc(ENGINE.method.rpeOf(e.role||'辅助'))+'）。':'动作保持稳定，接近做不动时停止，不必勉强多做（强度口径 '+Fmt.esc(ENGINE.method.rpeOf(e.role||'辅助'))+'）。')+'</p>' +
        (sug && sug.weight > 0
          ? '<div class="muted txs" style="margin-top:2px;color:var(--green-dark)">建议 ' +
            Fmt.round(sug.weight, 1) + ' kg' + (sug.perSide ? '（每只）' : '') +
            ' <span class="tag ' + (sug.src === '实测' ? '' : 'warn') + '">' + Fmt.esc(sug.src) + '</span></div>'
          : (sug ? '<div class="muted txs" style="margin-top:2px">自重动作，按次数推进</div>' : '')) +
        (points.length
          ? '<div class="ex-how fm-entry" onclick="FocusMode.openAt(' + ei + ')" title="点击进入专注训练">' +
            '<b>动作示范与要领 · 点这里进入「专注训练」<span class="arr">›</span></b>' +
            points.map(p => '<div class="ln">· ' + Fmt.esc(p) + '</div>').join('') +
            '<div class="muted txs" style="margin-top:4px">全屏大图 + 大倒计时，带着你一组一组练</div></div>'
          : '') +
        this.progressionCard(e,ei) + '<div class="setgrid'+(e.target?' has-progression':'')+'">' +
          '<span class="hdr">组</span><span class="hdr">重量kg</span><span class="hdr">'+(e.target&&e.target.kind==='time'?'秒数':'次数')+'</span><span class="hdr">完成</span>' +
          e.log.map((s, si) =>
            '<span class="muted txs">' + (si + 1) + (e.target?'<label class="warmup-label"><input type="checkbox" data-warm="'+ei+'-'+si+'" '+(s.type==='warmup'?'checked':'')+'>热身</label>':'')+'</span>' +
            '<input aria-label="' + Fmt.esc(e.name) + ' 第' + (si + 1) + '组重量" type="number" inputmode="none" readonly data-e="' + ei + '" data-s="' + si + '" data-f="weight" value="' + Fmt.esc(s.weight) + '" placeholder="' + (sug && sug.weight > 0 ? Fmt.round(sug.weight, 1) : '0') + '">' +
            '<input aria-label="' + Fmt.esc(e.name) + ' 第' + (si + 1) + '组次数" min="0" step="1" type="number" inputmode="numeric" data-e="' + ei + '" data-s="' + si + '" data-f="reps" value="' + Fmt.esc(s.reps) + '">' +
            '<span class="cbdone"><input aria-label="' + Fmt.esc(e.name) + ' 第' + (si + 1) + '组完成" type="checkbox" data-e="' + ei + '" data-s="' + si + '" data-f="done" ' + (s.done ? 'checked' : '') + ' style="width:20px;height:20px;accent-color:var(--green)"></span>'
          ).join('') +
        '</div>' +
        '<div class="setops">' +
          '<button type="button" data-setop="del" data-e="' + ei + '">− 减一组</button>' +
          '<button type="button" data-setop="add" data-e="' + ei + '">＋ 加一组</button>' +
        '</div>' +
        '<div class="exops">' +
          '<button type="button" data-exop="swap" data-e="' + ei + '">🔁 换动作</button>' +
          '<button type="button" data-exop="del" data-e="' + ei + '">🗑 删除动作</button>' +
        '</div>' +
      '</div></div></details>'
  },

  /** 勾组自动倒计时开关（存本机，默认开） */
  autoRest() {
    try { return localStorage.getItem('lbgym_autotimer') !== 'off' } catch (e) { return true }
  },
  toggleAutoRest() {
    this.syncFromDOM()
    try { localStorage.setItem('lbgym_autotimer', this.autoRest() ? 'off' : 'on') } catch (e) { /* 无痕模式 */ }
    this.redrawEx()
  },

  // ───── 组次编辑：加/减组 + 重量滑动选择（小程序有的，网页版不能少）─────

  /** 把输入框里的当前值收回 _exs，重画时不会丢用户已经填的东西 */
  syncFromDOM() {
    if (!this._exs) return
    const cur = this.collect()
    this._exs.forEach((e, i) => { if(cur[i]){e.log=cur[i].log;e.progressReady=cur[i].progressReady} })
  },

  redrawEx() {
    const box = document.getElementById('exWrap')
    if (!box) return
    // 重画前把每张动作卡的展开/收起状态收进来，重画后还原（不吞用户的折叠操作）
    const openMap = {}
    box.querySelectorAll('details.ex-card').forEach(d => { openMap[Number(d.dataset.ex)] = d.open })
    box.innerHTML = this.exListHTML(this._exs, this._presc, openMap)
    this.bindSets(this._exs)
  },

  addSet(ei) {
    this.syncFromDOM()
    const e = this._exs[ei]
    if (!e) return
    if (e.log.length >= 12) { UI.toast('最多 12 组'); return }
    const last = e.log[e.log.length - 1] || { weight: '', reps: '10' }
    e.log = e.log.concat([{ weight: last.weight, reps: last.reps, done: false }])
    this.redrawEx()
  },

  delSet(ei) {
    this.syncFromDOM()
    const e = this._exs[ei]
    if (!e) return
    if (e.log.length <= 1) { UI.toast('每个动作至少留一组'); return }
    e.log = e.log.slice(0, -1)
    this.redrawEx()
  },

  /** 重量口径：0–180kg、每次 2.5（用户 2026-09-23 指定） */
  WEIGHT: { max: 180, step: 2.5 },

  // ───── 动作编辑持久化（2026-10-16 用户反馈：删/加只当天生效 = 功能等于没有）─────
  // 删/换：本机 localStorage 按「循环槽位」记住（同 slot 的循环日都不出现）；
  // 加：写 plan.slotExercises（云端持久，与秘籍挂载同机制，可随时删）。
  slotN() {
    const plan = (Store.state.user || {}).plan || {}
    const idx = ENGINE.calc.dayIndexFromStart(plan.cycleStart || this.date, this.date)
    const logical=ENGINE.kb.schedulePosition(plan,idx).index
    return plan.micro && plan.micro.length ? ((logical % plan.micro.length) + plan.micro.length) % plan.micro.length : 0
  },
  dayEditKey() {
    const u = Store.state.user || {}
    const plan = u.plan || {}
    return 'lbgym_dayedit_' + (u._id || u.id || u.playerNo || (u.player || {}).no || 'demo') + '_' + (plan.cycleStart || '') + '_' + this.slotN()
  },
  readDayEdit() {
    try { return JSON.parse(localStorage.getItem(this.dayEditKey()) || 'null') || { del: [], swap: {} } } catch (e) { return { del: [], swap: {} } }
  },
  writeDayEdit(de) { try { localStorage.setItem(this.dayEditKey(), JSON.stringify(de)) } catch (e) { /* 无痕模式 */ } },
  applyDayEdit(list, de) {
    let out = (list || []).map(e => {
      const sw = (de.swap || {})[e.name]
      if (!sw) return e
      return Object.assign({}, e, { oid: sw.oid || '', name: sw.name, sets: sw.sets || e.sets, custom: !!sw.custom })
    })
    return out.filter(e => (de.del || []).indexOf(e.name) < 0)
  },
  oidOf(x) {
    const u = Array.isArray(x.gif) ? x.gif[0] : (x.gif || '')
    const m = String(u).match(/\/exercises\/([^/]+)\//)
    return m ? m[1] : ''
  },

  /** 换动作：弹动作库选择（搜索/分类），原地替换，本机持久 */
  swapEx(ei) {
    this.openPicker('swap', ei)
  },
  /** 删除动作：custom（slotExercises 来源）→ 从计划真删；计划自带 → 本机 DayEdit */
  delEx(ei) {
    const e = this._exs && this._exs[ei]
    if (!e) return
    UI.modal({
      title: '删除「' + Fmt.esc(e.name) + '」？',
      body: '<p class="muted txs">删除后这个训练日的循环里都不再有它。想加回来点清单标题旁的「＋ 加动作」。</p>',
      okText: '删除',
      onOk: () => {
        const plan = Store.state.user.plan
        const slot = this.slotN()
        const list = (plan.slotExercises || {})[String(slot)] || []
        if (e.custom && list.some(x => x.name === e.name)) {
          const sx = Object.assign({}, plan.slotExercises || {})
          sx[String(slot)] = list.filter(x => x.name !== e.name)
          plan.slotExercises = sx
          Store.saveCloud({ plan: plan })
        } else {
          const de = this.readDayEdit()
          if (de.del.indexOf(e.name) < 0) de.del.push(e.name)
          this.writeDayEdit(de)
        }
        UI.toast('已删 · 之后的循环也不出现')
        this.render([this.date])
      }
    })
  },

  /** 动作库选择弹层：搜索 + 分类浏览。mode: 'add' | 'swap' */
  openPicker(mode, ei) {
    this._pk = { mode: mode || 'add', ei: ei }
    const lib = ENGINE.kb.EX || []
    const parts = ['全部'].concat([...new Set(lib.map(x => x.partName || '其他'))].sort())
    const old = document.getElementById('exPicker'); if (old) old.remove()
    const el = document.createElement('div'); el.id = 'exPicker'
    el.innerHTML = '<div class="pk-box">' +
      '<div class="pk-head"><b>' + (mode === 'add' ? '＋ 添加动作' : '换成什么动作') + '</b><button class="chip" onclick="PageToday.closePicker()">关闭</button></div>' +
      '<input id="pkSearch" placeholder="搜索动作，如：卧推 / 划船 / 下拉">' +
      '<div class="pk-cats">' + parts.map(p => '<button class="chip sm" data-pkcat="' + Fmt.esc(p) + '">' + Fmt.esc(p) + '</button>').join('') + '</div>' +
      '<div class="pk-list" id="pkList"></div>' +
      '<div class="muted txs" style="padding:8px 14px">' + (mode === 'add'
        ? '加进来的动作会长期保留在这个训练日（每个循环都练它，卡片里可随时删除）。'
        : '替换后这个训练日的循环都用新动作（本机记住）。组次保持原动作的安排。') + '</div>' +
    '</div>'
    document.body.appendChild(el)
    const catOf = btn => {
      const on = el.querySelector('[data-pkcat].on')
      return (on && on.dataset.pkcat) || '全部'
    }
    const paintList = list => {
      this._pkList = list
      document.getElementById('pkList').innerHTML = list.length
        ? list.slice(0, 80).map((x, i) =>
          '<button class="pk-i" data-pk="' + i + '"><b>' + Fmt.esc(x.name) + '</b><span class="muted txs">' +
          Fmt.esc(x.partName || '') + ' · ' + Fmt.esc(x.equipment || '') +
          (x.sets ? ' · ' + Fmt.esc(x.sets) : '') + '</span></button>').join('')
        : '<div class="muted txs" style="padding:16px;text-align:center">没有找到，换个词试试</div>'
      el.querySelectorAll('[data-pk]').forEach(b => { b.onclick = () => this.pickFromLib(Number(b.dataset.pk)) })
    }
    el.querySelectorAll('[data-pkcat]').forEach(b => {
      b.onclick = () => {
        el.querySelectorAll('[data-pkcat]').forEach(x => x.classList.toggle('on', x === b))
        document.getElementById('pkSearch').value = ''
        paintList(catOf(b) === '全部' ? lib : lib.filter(x => (x.partName || '其他') === catOf(b)))
      }
    })
    el.querySelector('#pkSearch').oninput = ev => {
      const q = ev.target.value.trim()
      paintList(q ? ENGINE.kb.searchEx(q) : (catOf() === '全部' ? lib : lib.filter(x => (x.partName || '其他') === catOf())))
    }
    paintList(lib)
  },
  closePicker() { const el = document.getElementById('exPicker'); if (el) el.remove(); this._pk = null },
  pickFromLib(i) {
    const x = (this._pkList || [])[i]
    if (!x || !this._pk) return
    const { mode, ei } = this._pk
    const sets = x.sets || '3×12'
    if (mode === 'add') {
      const plan = Store.state.user.plan
      const slot = this.slotN()
      const sx = Object.assign({}, plan.slotExercises || {})
      sx[String(slot)] = (sx[String(slot)] || []).filter(e2 => e2.name !== x.name)
        .concat([{ oid: this.oidOf(x), name: x.name, sets: sets, role: '辅助', equipment: '', custom: true }])
      plan.slotExercises = sx
      Store.saveCloud({ plan: plan })
      UI.toast('已加入「' + x.name + '」—— 之后的循环都有')
    } else {
      const src = this._exs && this._exs[ei]
      if (!src) { this.closePicker(); return }
      const de = this.readDayEdit()
      de.swap = de.swap || {}
      de.swap[src.name] = { oid: this.oidOf(x), name: x.name, sets: src.sets, custom: !!src.custom }
      this.writeDayEdit(de)
      UI.toast('已换成「' + x.name + '」')
    }
    this.closePicker()
    this.render([this.date])
  },

  weightSlider(e,current){
    const rack=e.target&&e.target.weights&&e.target.weights.length?ENGINE.progression.weightChoices(e.target,current):null
    return {min:0,max:rack?rack.length-1:Math.max(e.target?1000:this.WEIGHT.max,current),step:rack?1:(e.target ? .001 : this.WEIGHT.step),rack,
      value:rack?rack.indexOf(current):current,weight:v=>rack?rack[Number(v)]:Number(v)}
  },
  openWeight(ei, si) {
    this.syncFromDOM()
    const e = this._exs[ei]
    if (!e) return
    const cur=Number((e.log[si]||{}).weight)||0,W=this.weightSlider(e,cur),start=W.value
    const quick=W.rack||[20,40,60,80,100,120,140]
    UI.modal({
      title: e.name + ' · 第 ' + (si + 1) + ' 组',
      body: '<div class="wslider">' +
        '<div class="val" id="wVal">' + W.weight(start) + '<span> kg</span></div>' +
        '<input type="range" id="wRange" min="0" max="' + W.max + '" step="' + W.step + '" value="' + start + '">' +
        '<div class="ends"><span>0</span><span>' + W.weight(W.max) + ' kg</span></div>' +
        '<div class="wstep">' +
          '<button type="button" id="wMinus">' + (W.rack?'上一档':'− '+(e.target?e.target.step:W.step)) + '</button>' +
          '<button type="button" id="wPlus">' + (W.rack?'下一档':'+ '+(e.target?e.target.step:W.step)) + '</button>' +
        '</div>' +
        '<div class="wquick">' + quick.map(v =>
          '<button class="chip sm" type="button" data-w="' + v + '">' + v + '</button>').join('') + '</div>' +
      '</div>',
      okText: '用这个重量',
      onOk: () => {
        const v=W.weight((document.getElementById('wRange')||{}).value||0)
        e.log[si] = Object.assign({}, e.log[si], { weight: v })
        this.redrawEx()
      }
    })
    const range = document.getElementById('wRange')
    const valEl = document.getElementById('wVal')
    if (!range) return
    const upd = () => { if (valEl) valEl.innerHTML = W.weight(range.value) + '<span> kg</span>' }
    range.oninput = upd
    const minus = document.getElementById('wMinus')
    const plus = document.getElementById('wPlus')
    if (minus) minus.onclick = () => { range.value=W.rack?Math.max(0,Number(range.value)-1):ENGINE.progression.adjustWeight(e.target,W.weight(range.value),-1,this.WEIGHT.step); upd() }
    if (plus) plus.onclick = () => { range.value=W.rack?Math.min(W.max,Number(range.value)+1):ENGINE.progression.adjustWeight(e.target,W.weight(range.value),1,this.WEIGHT.step); upd() }
    document.querySelectorAll('#modalbox [data-w]').forEach(b => {
      b.onclick = () => { range.value=W.rack?W.rack.indexOf(Number(b.dataset.w)):b.dataset.w; upd() }
    })
  },

  collect() {
    const exs = []
    document.querySelectorAll('.ex-card').forEach(card => {
      const ei = Number(card.dataset.ex)
      const name = card.querySelector('b').textContent
      const log = []
      card.querySelectorAll('input[data-f="weight"]').forEach((inp, si) => {
        const reps = card.querySelector('input[data-e="' + ei + '"][data-s="' + si + '"][data-f="reps"]')
        const done = card.querySelector('input[data-e="' + ei + '"][data-s="' + si + '"][data-f="done"]')
        const warm=card.querySelector('[data-warm="'+ei+'-'+si+'"]');log.push({weight:Number(inp.value)||'',reps:Number(reps.value)||'',done:!!(done&&done.checked),type:warm&&warm.checked?'warmup':'work'})
      })
      const original = this._exs[ei]
      const ready=card.querySelector('[data-ready="'+ei+'"]');exs.push({oid:original.oid||'',name,sets:original.sets,role:original.role||'',log,target:original.target||null,progressReady:!!(ready&&ready.checked)})
    })
    return exs
  },

  bindSets(exs) {
    const recalc = () => {
      const cur = this.collect()
      const vol = ENGINE.gamify.volumeOf(cur)
      const el = document.getElementById('vol')
      if (el) el.textContent = '容量 ' + Fmt.num(vol / 1000, 1) + ' 吨'
      const hint = document.getElementById('expHint')
      if (hint) {
        const ratio = ENGINE.gamify.doneRatio(cur)
        hint.textContent = '完成率 ' + Math.round(ratio * 100) + '%（≥80% 才算完成训练，+100 EXP）'
      }
      // 折叠卡摘要实时刷新：勾一组，summary 上的「完成 x/y」立刻变
      document.querySelectorAll('#exWrap details.ex-card').forEach(d => {
        const e = cur[Number(d.dataset.ex)]
        const meta = d.querySelector('.ex-sum-meta')
        if (!e || !meta) return
        const dn = e.log.filter(x => x.done).length
        meta.innerHTML = Fmt.esc(e.sets || '') + '<br>' +
          (dn >= e.log.length ? '<b style="color:var(--green)">已完成 ✓</b>' : '完成 ' + dn + '/' + e.log.length)
      })
      this.refreshProg()
      this.persistDraft()
    }
    document.querySelectorAll('#exWrap input').forEach(i => { i.onchange = recalc; i.oninput = recalc })

    // 重量：点开滑动面板（0–180kg、2.5 一档）—— 比在手机上敲「62.5」快得多
    document.querySelectorAll('#app input[data-f="weight"]').forEach(inp => {
      inp.onclick = () => this.openWeight(Number(inp.dataset.e), Number(inp.dataset.s))
    })
    // 加/减组（小程序一直有、网页版以前没有，用户 2026-09-23 反馈）
    document.querySelectorAll('#app button[data-setop]').forEach(b => {
      b.onclick = () => {
        const ei = Number(b.dataset.e)
        if (b.dataset.setop === 'add') this.addSet(ei)
        else this.delSet(ei)
      }
    })
    // 换/删动作（2026-10-16 用户反馈：删了明天又回来、想换没入口）
    document.querySelectorAll('#app button[data-exop]').forEach(b => {
      b.onclick = () => {
        const ei = Number(b.dataset.e)
        if (b.dataset.exop === 'swap') this.swapEx(ei)
        else this.delEx(ei)
      }
    })

    // 完成一组复用唯一倒计时；最后一个动作的最后一组不计休息。
    document.querySelectorAll('#app input[data-f="done"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (!cb.checked) return
        if (this.autoRest()) {
          const exs = this._exs || []
          const ei = Number(cb.dataset.e), si = Number(cb.dataset.s)
          const e = exs[ei]
          if (!e) return
          const isLastSet = si >= e.log.length - 1
          const isLastEx = ei >= exs.length - 1
          if (isLastSet && isLastEx) return          // 收操了，别响
          WorkoutTimer.start(e.rest || 120, '组间休息', false, e.name+' · 第 '+(si+1)+' 组已完成')
        }
        UI.toast('已记一组 ✓')
      })
    })

    recalc()

    const btn = document.getElementById('saveBtn')
    if (btn && this.date > Fmt.todayStr()) { btn.disabled = true; btn.textContent = '未来安排 · 仅预览'; return }
    if (btn) btn.onclick = async () => {
      const exercises = this.collect()
      const ck = Object.assign({}, Store.checkinOf(this.date) || {}, { date: this.date, trained: ENGINE.gamify.doneRatio(exercises) >= 0.8, exercises })
      if (exercises.some(e => e.log.some(s => Number(s.weight) < 0 || Number(s.reps) < 0 || !Number.isInteger(Number(s.reps)) || (s.done && !(Number(s.reps) > 0))))) {
        UI.toast('请检查组次：重量不能为负，完成组的次数须为正整数'); return
      }
      const local = this.previewExp(ck, exercises)

      btn.disabled = true; btn.textContent = '保存中…'
      // 交给 Store：本地先存一份；登录状态下一并提交服务端做权威结算
      const res = await Store.pushCheckin(ck)
      // 打卡已保存 → 清掉本机草稿，避免下次进页旧草稿盖住云端记录
      try { localStorage.removeItem(this.draftKey(this.date)) } catch (e) {}
      btn.disabled = false; btn.textContent = '保存打卡'

      this.syncFromDOM();document.querySelectorAll('#exWrap .progression-box').forEach((box,i)=>{if(this._exs[i])box.outerHTML=this.progressionCard(this._exs[i],i)})
      const server = (!res || res.local || res.offline) ? null : res
      const shown = server || local
      const breakdown = shown.breakdown || []
      UI.modal({
        title: server ? '打卡已同步（云端结算）'
          : (res && res.offline ? '已存本机，联网后自动同步' : '打卡已保存（本机）'),
        body: '<p class="muted">本次获得：</p>' +
          breakdown.map(b => UI.li(Fmt.esc(b.name), '', '+' + b.exp)).join('') +
          '<div style="margin-top:8px"><b>合计 +' + shown.gained + ' EXP</b>' +
          (server && server.leveledUp ? '<span class="tag gold" style="margin-left:6px">升到 Lv' + server.level + '</span>' : '') +
          (server && (server.newBadges || []).length
            ? '<div class="muted txs" style="margin-top:4px">🏅 新徽章：' +
              server.newBadges.map(b => Fmt.esc(b.name)).join('、') + '</div>'
            : '') +
          '<div class="muted txs">' + (server
            ? '经验由云端权威结算——改不了，也刷不了'
            : '登录后经验由云端权威结算（含连续打卡阶梯、周任务、徽章）') + '</div>' +
          '<div style="display:flex;gap:8px;margin-top:12px">' +
            '<button class="btn" style="flex:1" onclick="Router.go(\'records\')">看训练记录</button>' +
            '<button class="btn ghost" style="flex:1" onclick="Router.go(\'home\')">回首页</button></div>',
        okText: '知道了',
        cancelText: false
      })
      // 结算弹窗关掉之后，把「写一句」送到眼前（这一步以前没有，用户练完就走了）
      const nb = document.getElementById('noteBox')
      if (nb && nb.scrollIntoView) setTimeout(() => nb.scrollIntoView({ behavior: 'smooth', block: 'start' }), 260)
    }
  },

  previewExp(ck, exercises) {
    const u = Store.state.user
    const e = ENGINE.calc.energyPlan(u.profile, Store.adj())
    return ENGINE.gamify.calcCheckinExp({
      user: u, checkin: ck, profile: u.profile,
      targets: { kcal: e.kcal, protein: e.protein },
      today: this.date, weekKey: Fmt.weekKey(this.date),
      isFirstToday: true,
      hour: new Date().getHours()
    })
  },

  rtBeep(hi) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      this._ac = this._ac || new AC()
      const o = this._ac.createOscillator(), gn = this._ac.createGain()
      o.frequency.value = hi ? 880 : 440
      gn.gain.value = 0.12
      o.connect(gn); gn.connect(this._ac.destination)
      o.start(); setTimeout(() => o.stop(), hi ? 420 : 160)
    } catch (e) { /* 音频不可用就算了 */ }
  },
  dateBar() {
    return '<div class="card"><div class="row between">' +
      '<button class="chip" onclick="PageToday.shift(-1)">← 前一天</button>' +
      '<button class="chip" onclick="Router.go(\'today\')">' + (this.date === Fmt.todayStr() ? '今天' : '回到今天') + '</button>' +
      '<button class="chip" onclick="PageToday.shift(1)">后一天 →</button>' +
      '</div></div>'
  },

  bindDateBar() { /* 由 inline onclick 处理 */ },

  shift(n) {
    Router.go('today/' + Fmt.shiftDate(this.date, n))
  }
}
