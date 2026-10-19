/* 训练流程：热身清单、统一计时与按需有氧。 */
const TrainingFlow = {
  source:'谭成义《一次性看完三分化热身整套流程》本地笔记；次数、时长与新手替代为本站整理。',
  warmup(day) {
    const focus = day.focus || ''
    let rows
    if (/腿|下肢|臀/.test(focus)) rows=[['足踝活动','扶墙踝关节前移，每侧 8 次'],['髋关节活动','舒适范围的髋部前后移动，约 8 次'],['后侧链激活','扶物髋铰链，每侧 8 次；先保持躯干稳定'],['预演主项','徒手深蹲或轻重量硬拉 1–2 组，不做到疲劳']]
    else if (/拉|背/.test(focus)) rows=[['胸椎与肩胛活动','轻柔胸椎活动、肩胛前伸后缩，各 8–10 次'],['弹力带拉开','保持躯干稳定，小幅度、有控制地做 10–12 次'],['肩胛稳定','墙面肩胛俯卧撑 8–10 次，作为进阶支撑动作的简化替代'],['预演主项','轻重量划船或下拉 1–2 组，熟悉今天的动作轨迹']]
    else rows=[['肩部动态活动','肩环绕 8–10 次，在无痛范围内完成'],['弹力带激活','前后拉与小幅环绕各 8–12 次；躯干不前顶'],['下斜方肌激活','俯卧 Y 字 8–10 次，不抬头、不塌腰'],['前锯肌激活','墙面肩胛俯卧撑 8–10 次，作为原文支撑动作的简化替代']]
    return [['先让身体温热','快走或原地踏步 2–3 分钟'],...rows,['主项递进准备组','轻重量开始，逐步接近工作重量；做 2–3 组，不计入正式组数']]
  },
  key(kind) {const u=Store.state.user||{};return 'lbgym_flow_'+(u._id||u.id||u.playerNo||(u.player||{}).no||'demo')+'_'+PageToday.date+'_'+kind},
  load(kind,fallback) {try {return JSON.parse(localStorage.getItem(this.key(kind))||'null')||fallback}catch(e){return fallback}},
  save(kind,value) {try{localStorage.setItem(this.key(kind),JSON.stringify(value))}catch(e){UI.toast('本机空间不足，训练流程进度未保存')}},
  render(day) {
    this.day=day
    const checked=this.load('warmup',[]), rows=this.warmup(day)
    return '<section class="flow-card"><details id="warmupSteps" '+(this.load('warmupClosed',false)?'':'open')+'><summary class="flow-heading"><span class="step-number">01</span><div><h2>热身准备</h2><p>约 8–12 分钟 · <span id="warmupCount">'+checked.length+'/'+rows.length+'</span> 项已完成</p></div></summary>'+
      '<div class="warmup-list">'+rows.map((x,i)=>'<label class="warmup-item"><input type="checkbox" data-warmup="'+i+'" '+(checked.includes(i)?'checked':'')+'><span><b>'+Fmt.esc(x[0])+'</b><small>'+Fmt.esc(x[1])+'</small></span></label>').join('')+'</div>'+
      '<div class="flow-actions"><button class="btn ghost" onclick="TrainingFlow.continueStrength()">收起热身，进入力量训练</button><button class="text-link" onclick="Router.go(\'secret/warmup\')">查看热身图文 ›</button></div>'+
      '<details class="flow-source"><summary>来源与使用提醒</summary><p>'+this.source+' 不适时减小范围或停止。</p></details></details></section>'
  },
  cardio(day) {
    const goal=((Store.state.user||{}).profile||{}).goal||''
    const recommended=/减脂/.test(goal)
    return '<section class="flow-card cardio-card"><div class="flow-heading"><span class="step-number">03</span><div><h2>练后有氧 <span class="tag">按需选做</span></h2><p>'+(recommended?'配合减脂目标，先看今天的恢复情况':'想练心肺可以加，疲劳时跳过也可以')+'</p></div></div>'+ 
      '<div class="cardio-options"><button class="cardio-option" onclick="TrainingFlow.timer(900,\'轻松有氧\')"><b>轻松活动</b><span>快走 / 单车 · 10–15 分钟</span><small>入门或腿日后优先；能说完整句子</small><em>开始 15 分钟计时 ↗</em></button><button class="cardio-option" onclick="TrainingFlow.timer(1200,\'走跑间歇\',true)"><b>走跑间歇</b><span>4 轮 ×（走 3 分＋跑 2 分）</span><small>已有跑步基础、今天恢复良好时选择</small><em>开始 20 分钟分段计时 ↗</em></button></div>'+ 
      '<div class="flow-actions"><button class="chip" id="cardioDone" onclick="TrainingFlow.cardioDone()">'+(this.load('cardio',false)?'已记录有氧 ✓':'记录本次有氧完成')+'</button><button class="text-link" onclick="Router.go(\'secret/cardio\')">怎样安排有氧 ›</button></div><p class="muted txs">间歇结构来自谭成义的有氧笔记。配速按个人能力选择；有氧不必每次做，不代替力量打卡。结束时放慢速度，不适立即停止。</p></section>'
  },
  timer(seconds,label,interval) {WorkoutTimer.start(seconds,label,!!interval)},
  cardioDone(){this.save('cardio',true);document.getElementById('cardioDone').textContent='已记录有氧 ✓';UI.toast('有氧完成已存本机')},
  continueStrength(){document.getElementById('warmupSteps').open=false;this.save('warmupClosed',true);document.getElementById('strengthSection').scrollIntoView({behavior:'smooth',block:'start'})},
  mount(){const details=document.getElementById('warmupSteps');details.ontoggle=()=>this.save('warmupClosed',!details.open);document.querySelectorAll('[data-warmup]').forEach(cb=>cb.onchange=()=>{const ids=Array.from(document.querySelectorAll('[data-warmup]:checked')).map(x=>Number(x.dataset.warmup));this.save('warmup',ids);document.getElementById('warmupCount').textContent=ids.length+'/'+this.warmup(this.day).length})}
}

// One countdown, shared by automatic set rests and optional cardio.
// 用户 2026-10-15 拍板：不要常驻计时块 —— 只在勾完一组（或有氧开始）时出现，结束后自动消失。
const WorkoutTimer = {
  state:null, owner:'', iv:null,
  ownerId(){const u=Store.state.user||{};return String(u._id||u.id||u.playerNo||(u.player||{}).no||'demo')},
  key(){return 'lbgym_active_timer_v2_'+this.ownerId()},
  fmt(seconds){const n=Math.max(0,Math.ceil(seconds));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')},
  persist(){try{if(this.state)localStorage.setItem(this.key(),JSON.stringify(this.state));else localStorage.removeItem(this.key())}catch(e){UI.toast('计时无法保存，刷新后可能丢失')}},
  nextRest(){const records=PageToday.collect(),exercises=PageToday._exs||[],index=records.findIndex(e=>e.log.some(s=>!s.done)),e=exercises[Math.max(0,index)]||{};return{seconds:Number(e.rest)||120,name:e.name||'当前动作'}},
  unlockAudio(){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;this.ac=this.ac||new AC();if(this.ac.state==='suspended')this.ac.resume().catch(()=>{});const o=this.ac.createOscillator(),g=this.ac.createGain();g.gain.value=0;o.connect(g);g.connect(this.ac.destination);o.start();o.stop(this.ac.currentTime+.01)}catch(e){}},
  init(){if(this.initialized)return;this.initialized=true;document.addEventListener('pointerdown',()=>this.unlockAudio(),{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.mount()});window.addEventListener('pageshow',()=>this.mount());window.addEventListener('storage',e=>{if(e.key===this.key()){this.state=null;this.mount()}})},
  start(seconds,label,interval,context){TrainingFlow.save('countdown',null);this.init();this.owner=this.ownerId();this.unlockAudio();seconds=Math.max(1,Math.min(86400,Number(seconds)||120));this.state={total:seconds,left:seconds,deadline:Date.now()+seconds*1000,run:true,label:label||'组间休息',interval:!!interval,context:context||'',route:'today/'+(PageToday.date||Fmt.todayStr()),id:Date.now()+'_'+Math.random(),notified:false};this.persist();this.mount()},
  // Removing UI is reserved for completion, explicit end, and account changes; route changes keep it alive.
  unmount(){if(this.iv)clearInterval(this.iv);this.iv=null;const el=document.getElementById('workoutTimer');if(el)el.remove();document.body.classList.remove('has-workout-timer')},
  mount(){
    this.init();const owner=this.ownerId();if(this.owner!==owner){this.unmount();this.state=null;this.owner=owner}
    if(!this.state){try{this.state=JSON.parse(localStorage.getItem(this.key())||'null')}catch(e){this.state=null}}
    if(!this.state && Router.current==='today'){
      const old=TrainingFlow.load('countdown',null)
      if(old&&old.left>0){this.state=Object.assign({},old,{route:'today/'+PageToday.date,id:'legacy_'+Date.now(),notified:false});this.persist();TrainingFlow.save('countdown',null)}
    }
    const t=this.state
    if(!t||!Number.isFinite(t.deadline)||!Number.isFinite(t.left)||!Number.isFinite(t.total)){this.state=null;this.unmount();return}
    if(!document.getElementById('workoutTimer')){
      const el=document.createElement('section');el.id='workoutTimer';el.setAttribute('aria-label','训练倒计时');el.innerHTML='<div class="wt-heading"><div><b id="wtLabel"></b><small id="wtContext"></small></div><strong id="wtTime" role="timer"></strong></div><div id="wtPhase" class="muted txs"></div><div class="wt-actions"><button class="chip wt-focus" id="wtFocus" onclick="WorkoutTimer.returnToTraining()">返回训练</button><button class="chip" id="wtAdd" onclick="WorkoutTimer.add()">加30秒</button><button class="chip" id="wtPause" onclick="WorkoutTimer.toggle()">暂停</button><button class="chip" onclick="WorkoutTimer.end()">结束计时</button></div>';document.body.appendChild(el);document.body.classList.add('has-workout-timer')
    }
    this.paint();if(this.state&&!this.iv)this.iv=setInterval(()=>this.paint(),250)
  },
  returnToTraining(){if(Router.current==='today')FocusMode.open();else Router.go(this.state.route||'today')},
  sync(){const t=this.state;if(t&&t.run)t.left=Math.max(0,Math.ceil((t.deadline-Date.now())/1000))},
  notify(){try{if(navigator.vibrate)navigator.vibrate([200,100,200])}catch(e){};try{const ac=this.ac;if(ac&&ac.state==='running'){[0,.28,.56].forEach(d=>{const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=880;g.gain.setValueAtTime(.1,ac.currentTime+d);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d+.2);o.connect(g);g.connect(ac.destination);o.start(ac.currentTime+d);o.stop(ac.currentTime+d+.22)})}}catch(e){};UI.toast(this.state.label+'结束，可以继续训练',5000)},
  paint(){
    const t=this.state;if(!t)return;if(this.owner!==this.ownerId()){this.state=null;this.unmount();return}this.sync()
    if(t.left===0&&!t.notified){t.run=false;t.notified=true;t.finishedAt=Date.now();this.persist();this.notify()}
    // Keep a completion notice until acknowledged, including when returning from background.
    const el=document.getElementById('workoutTimer');if(!el)return
    document.getElementById('wtLabel').textContent=t.label+(t.left===0?' · 已结束':!t.run?' · 已暂停':'')
    document.getElementById('wtContext').textContent=t.left===0?(t.interval||t.label!=='组间休息'?'有氧完成，放慢速度收尾':'休息结束，可以继续下一组'):t.context
    const elapsed=Math.max(0,t.total-t.left),slot=elapsed%300
    document.getElementById('wtTime').textContent=this.fmt(t.interval&&t.left>0?(slot<180?180-slot:300-slot):t.left)
    document.getElementById('wtPhase').textContent=t.interval&&t.left>0?'第 '+(Math.floor(elapsed/300)+1)+'/4轮 · '+(slot<180?'快走':'轻松跑')+' · 当前段剩余':''
    document.getElementById('wtPause').textContent=t.run?'暂停':'继续';document.getElementById('wtPause').hidden=t.left===0;document.getElementById('wtAdd').hidden=t.interval||t.left===0;document.getElementById('wtFocus').hidden=t.interval;document.getElementById('wtFocus').textContent=Router.current==='today'?'专注训练':'返回训练'
  },
  toggle(){this.unlockAudio();this.sync();const t=this.state;if(!t||t.left===0){this.paint();return}t.run=!t.run;if(t.run)t.deadline=Date.now()+t.left*1000;this.persist();this.paint()},
  add(){this.sync();const t=this.state;if(!t||t.interval||t.left===0){this.paint();return}t.left+=30;t.total+=30;if(t.run)t.deadline=Date.now()+t.left*1000;this.persist();this.paint()},
  end(){TrainingFlow.save('countdown',null);this.state=null;this.persist();this.unmount()}
}

// FocusMode —— 专注训练全屏（2026-10-16 用户需求：带着用户一起练）
// 大倒计时 + 动作大图 + 当前组重量/次数步进 + 「完成这一组」= 打勾并进入休息倒计时。
// 入口：①休息浮条「专注训练」②动作卡「示范与要领」整块区域点击。
const FocusMode = {
  cur: null, iv: null,
  fmt(s){return WorkoutTimer.fmt(s)},
  nextSet(fromI, wrap) {
    const exs = PageToday._exs || []
    for (let i = fromI; i < exs.length; i++) {
      const j = (exs[i].log || []).findIndex(s => !s.done)
      if (j >= 0) return { ei: i, si: j }
    }
    if (wrap) for (let i = 0; i < fromI && i < exs.length; i++) {
      const j = (exs[i].log || []).findIndex(s => !s.done)
      if (j >= 0) return { ei: i, si: j }
    }
    return null
  },
  open() { this.openAt(null) },
  openAt(ei) {
    if (!PageToday._exs || !PageToday._exs.length) return
    const cur = this.nextSet(ei === null || ei === undefined ? 0 : ei, true)
    if (!cur) { UI.toast('今天的组都完成了 ✓'); return }
    this.cur = cur
    this.mount()
  },
  mount() {
    this.unmount()
    document.body.classList.add('fm-open')   // 专注模式全屏时藏起底部休息浮条（restBar 9998 会飘在全屏上）
    const cur = this.cur, exs = PageToday._exs || []
    const e = exs[cur.ei]; if (!e) return
    const info = PageToday.exInfo(e)
    const gif = (info && info.gif) || e.gif || null
    const s = e.log[cur.si] || {}
    // 空重量预填建议重量（2026-10-18 用户截图反馈：初始显示「自重」，点 +2.5 从 20 起跳，
    // 卧推调到 100kg 要按 40 次）。完整版用户有处方建议才预填，免费版行为不变（仍可点开滑条从 0 拖）。
    const sug0 = (PageToday._presc || {})[e.name]
    if ((s.weight === '' || s.weight === null || s.weight === undefined) && sug0 && sug0.weight) s.weight = sug0.weight
    const points = String(e.points || (info && info.points) || '').split('；').map(x => x.trim()).filter(Boolean)
    const el = document.createElement('div'); el.id = 'focusMode'
    el.innerHTML = '<div class="fm-top"><b>' + Fmt.esc(e.name) + '</b><button class="chip" onclick="FocusMode.close()">收起 ✕</button></div>' +
      '<div class="fm-img">' + PageToday.framesHTML(gif) + '</div>' +
      '<div class="fm-set">第 ' + (cur.si + 1) + ' / ' + e.log.length + ' 组</div>' +
      '<div class="fm-timer" id="fmTime">—</div><div class="fm-sub" id="fmSub"></div>' +
      '<div class="fm-fill"><button class="chip" onclick="FocusMode.adj(-1,\'w\')">' + (e.target&&e.target.weights.length?'上一档':'−'+(e.target?e.target.step:2.5)) + '</button><b id="fmW" class="fm-val" title="点我滑条选重量" onclick="FocusMode.pickW()"></b><button class="chip" onclick="FocusMode.adj(1,\'w\')">' + (e.target&&e.target.weights.length?'下一档':'+'+(e.target?e.target.step:2.5)) + '</button></div>' +
      '<div class="fm-fill"><button class="chip" onclick="FocusMode.adj(-1,\'r\')">−1</button><b id="fmR" class="fm-val" title="点我滑条选次数" onclick="FocusMode.pickR()"></b><button class="chip" onclick="FocusMode.adj(1,\'r\')">+1</button></div>' +
      '<button class="btn fm-done" onclick="FocusMode.done()">✓ 完成这一组</button>' +
      (points.length ? '<div class="fm-points">' + points.map(p => '<div class="ln">· ' + Fmt.esc(p) + '</div>').join('') + '</div>' : '')
    document.body.appendChild(el)
    this.paintFill()
    this.iv = setInterval(() => this.paint(), 400)
    this.paint()
  },
  unmount() { if (this.iv) clearInterval(this.iv); this.iv = null; const el = document.getElementById('focusMode'); if (el) el.remove(); document.body.classList.remove('fm-open') },
  close() { this.cur = null; this.unmount() },
  paintFill() {
    const cur = this.cur; if (!cur) return
    const e = PageToday._exs[cur.ei]; if (!e) return
    const s = e.log[cur.si] || {}
    const wEl = document.getElementById('fmW'), rEl = document.getElementById('fmR')
    if (wEl) wEl.textContent = (s.weight === '' ? '自重' : s.weight + ' kg')
    if (rEl) rEl.textContent = (s.reps === '' ? '—' : s.reps+(e.target&&e.target.kind==='time'?' 秒':' 次'))
  },
  adj(d, kind) {
    const cur = this.cur; if (!cur) return
    const e = PageToday._exs[cur.ei]; if (!e) return
    const s = e.log[cur.si]
    if (kind === 'w') {
      const sug = (PageToday._presc || {})[e.name]
      const base = s.weight === '' ? ((sug && sug.weight) || 20) : Number(s.weight)
      s.weight=ENGINE.progression.adjustWeight(e.target,base,d,PageToday.WEIGHT.step)
    } else {
      const reps0 = parseInt(String(e.sets).split(/[×x]/i)[1], 10) || 10
      const base = s.reps === '' ? reps0 : Number(s.reps)
      s.reps = Math.max(1, Math.min(e.target&&e.target.kind==='time'?180:100,base+d))
    }
    this.paintFill()
  },

  /** 滑条绑定的公共部分（openWeight 与专注模式 pickW/pickR 共用） */
  bindSlider(W, start, quick) {
    const range = document.getElementById('wRange')
    const valEl = document.getElementById('wVal')
    if (!range) return
    const upd = () => { if (valEl) valEl.innerHTML = (W.weight?W.weight(range.value):Number(range.value)) + (W.unit || '<span> kg</span>') }
    range.oninput = upd
    const minus = document.getElementById('wMinus')
    const plus = document.getElementById('wPlus')
    if (minus) minus.onclick = () => { range.value = Math.max(W.min, Number(range.value) - W.step); upd() }
    if (plus) plus.onclick = () => { range.value = Math.min(W.max, Number(range.value) + W.step); upd() }
    document.querySelectorAll('#modalbox [data-w]').forEach(b => {
      b.onclick = () => { range.value=W.rack?W.rack.indexOf(Number(b.dataset.w)):b.dataset.w; upd() }
    })
  },

  /** 专注模式：点重量值 → 滑条直选（不用一下下点 +2.5；卧推直接滑到自己的重量） */
  pickW() {
    const cur = this.cur; if (!cur) return
    const e = PageToday._exs[cur.ei]; if (!e) return
    const s = e.log[cur.si] || {}
    const sug=(PageToday._presc||{})[e.name],current=s.weight===''?((sug&&sug.weight)||20):Number(s.weight),W=PageToday.weightSlider(e,current),start=W.value
    const quick=W.rack||[20,40,60,80,100,120,140]
    UI.modal({
      title: e.name + ' · 重量（滑条直选）',
      body: '<div class="wslider">' +
        '<div class="val" id="wVal">' + W.weight(start) + '<span> kg</span></div>' +
        '<input type="range" id="wRange" min="0" max="' + W.max + '" step="' + W.step + '" value="' + start + '">' +
        '<div class="ends"><span>0</span><span>' + W.weight(W.max) + ' kg</span></div>' +
        '<div class="wquick">' + quick.map(v =>
          '<button class="chip sm" type="button" data-w="' + v + '">' + v + '</button>').join('') + '</div>' +
      '</div>',
      okText: '用这个重量',
      onOk: () => {
        const v=W.weight((document.getElementById('wRange')||{}).value||0)
        s.weight = v
        this.paintFill()
      }
    })
    this.bindSlider(W, start, quick)
  },

  /** 专注模式：点次数值 → 滑条直选 */
  pickR() {
    const cur = this.cur; if (!cur) return
    const e = PageToday._exs[cur.ei]; if (!e) return
    const s = e.log[cur.si] || {}
    const reps0 = parseInt(String(e.sets).split(/[×x]/i)[1], 10) || 10
    const start = s.reps === '' ? reps0 : Number(s.reps)
    const timed=e.target&&e.target.kind==='time',unit=timed?'秒':'次',max=timed?180:100,quick=timed?[20,30,45,60,90,120]:[5,8,10,12,15,20]
    UI.modal({
      title: e.name + ' · '+unit+'（滑条直选）',
      body: '<div class="wslider">' +
        '<div class="val" id="wVal">' + Fmt.round(start, 0) + '<span> '+unit+'</span></div>' +
        '<input type="range" id="wRange" min="1" max="' + max + '" step="1" value="' + Fmt.round(start, 0) + '">' +
        '<div class="ends"><span>1</span><span>' + max + ' ' + unit + '</span></div>' +
        '<div class="wquick">' + quick.map(v =>
          '<button class="chip sm" type="button" data-w="' + v + '">' + v + '</button>').join('') + '</div>' +
      '</div>',
      okText:'用这个'+unit,
      onOk: () => {
        const v = Number((document.getElementById('wRange') || {}).value) || reps0
        s.reps = v
        this.paintFill()
      }
    })
    this.bindSlider({ min: 1, max,step:1,unit:'<span> '+unit+'</span>' }, start, quick)
  },
  paint() {
    const t = WorkoutTimer.state
    const timeEl = document.getElementById('fmTime'), subEl = document.getElementById('fmSub')
    if (!timeEl || !this.cur) return
    if (t && t.left > 0) {
      WorkoutTimer.sync()
      timeEl.textContent = this.fmt(Math.max(0, t.left))
      subEl.textContent = t.run === false ? '已暂停' : '休息中 · 下一组：' + (PageToday._exs[this.cur.ei] || {}).name
    } else {
      timeEl.textContent = '—'
      subEl.textContent = '做这一组 —— 重量次数先调好，练完点大按钮'
    }
  },
  done() {
    const cur = this.cur; if (!cur) return
    const exs = PageToday._exs || []
    const e = exs[cur.ei]; if (!e) return
    const isLastSet = cur.si >= e.log.length - 1, isLastEx = cur.ei >= exs.length - 1
    e.log[cur.si].done = true
    PageToday.redrawEx()
    if (isLastSet && isLastEx) { UI.toast('全部完成 ✓ 记得保存打卡'); this.close(); return }
    WorkoutTimer.start(e.rest || 120, '组间休息', false, e.name + ' · 第 ' + (cur.si + 1) + ' 组已完成')
    const nxt = this.nextSet(isLastSet ? cur.ei + 1 : cur.ei, true)
    if (nxt) { this.cur = nxt; this.mount() }   // 重画换动作大图
    else { UI.toast('全部完成 ✓'); this.close() }
  }
}
