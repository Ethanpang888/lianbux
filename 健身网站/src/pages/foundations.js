/* 基础功法：可独立执行，不改动现有付费处方或用户计划。 */
const Foundations = {
  get books() { return ENGINE.foundations },
  get(key) { return this.books.find(x => x.key === key) },
  /** 「跟着开练」：把功法的动作加进今天的训练日末尾（slotExercises 机制，可随时删），然后跳训练页 */
  startNow(key) {
    const b = this.get(key)
    if (!b || !b.actions || !b.actions.length) return
    const u = Store.state.user || {}
    const plan = u.plan && u.plan.micro ? u.plan : null
    if (!plan) { Router.go('onboard'); return }
    const today = Fmt.todayStr()
    const idx = ENGINE.calc.dayIndexFromStart(plan.cycleStart || today, today)
    const slotN = ((idx % plan.micro.length) + plan.micro.length) % plan.micro.length
    const slot = String(slotN)
    const m = plan.micro[slotN]
    if (m === 'rest' || (typeof m === 'object' && m.type === 'rest')) {
      UI.toast('今天是休息日 —— 功法内容直接照上面清单做就行，不用挂进训练')
      return
    }
    const sx = Object.assign({}, plan.slotExercises || {})
    const tag = 'fnd_' + key
    const add = b.actions.map(a => ({
      oid: '', name: a.name, sets: a.sets || '3×12',
      role: '辅助', equipment: '', custom: true, fromSecret: tag
    }))
    sx[slot] = (sx[slot] || []).filter(e => e.fromSecret !== tag).concat(add)
    plan.slotExercises = sx
    u.plan = plan
    Store.saveCloud({ plan: plan })
    UI.toast('已加进今天的训练 —— 去训练页跟着练，打卡计时都通用')
    Router.go('today')
  },
  detail(key) {
    const b = this.get(key); if (!b) return
    const date = Fmt.todayStr()
    let done = []; try { done = JSON.parse(localStorage.getItem(this.key(key)) || '[]') } catch(e) {}
    document.getElementById('app').innerHTML = Router.bar(b.name, b.subtitle) +
      '<button class="text-link book-back" onclick="Router.go(\'secret\')">‹ 返回藏经阁</button>' +
      '<div class="manual-intro manual-'+b.tone+'"><span class="tag">完整免费</span><h2>'+Fmt.esc(b.intro)+'</h2><p>'+Fmt.esc(b.who)+' · '+b.time+'</p></div>' +
      '<div class="card"><h2>今天跟着做 <span class="mini" id="lessonProgress">'+done.length+' / '+b.sections.length+'</span></h2>' +
      b.sections.map((x,i)=>'<label class="lesson-row"><input type="checkbox" data-lesson="'+i+'" '+(done.includes(i)?'checked':'')+'><span><b>'+Fmt.esc(x[0])+'</b><span>'+Fmt.esc(x[1])+'</span></span></label>').join('') +
      '<p class="muted txs">勾选用于今天的学习与执行记录，不自动算作力量训练或发放修为。</p></div>' +
      '<div class="card"><h2>现在开始</h2>' +
      (!Store.hasProfile() || Store.state.demo ? '<button class="btn" onclick="Router.go(\'onboard\')">生成我的个人计划 · 去建档</button>' : b.actions ? '<button class="btn" onclick="Foundations.startNow(\'' + key + '\')">跟着开练 · 加进今天的训练</button><button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'today\')">去训练页（不加动作）</button>'
        : '<button class="btn" onclick="Router.go(\'today\')">去训练 · 打开热身与计时</button>') +
      '<button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'diet\')">去记录饮食</button></div>' +
      '<details class="fold"><summary>内容来源与适用范围</summary><p class="muted txs">'+Fmt.esc(b.source)+'</p></details>'
    document.querySelectorAll('[data-lesson]').forEach(cb => cb.onchange = () => {
      const ids = Array.from(document.querySelectorAll('[data-lesson]:checked')).map(x=>Number(x.dataset.lesson))
      try { localStorage.setItem(this.key(key),JSON.stringify(ids)) } catch(e) { UI.toast('本机存储不足，学习进度未保存') }
      document.getElementById('lessonProgress').textContent = ids.length+' / '+b.sections.length
    })
  },
  key(key) { const u=Store.state.user||{}; return 'lbgym_lesson_'+(u._id||u.id||u.playerNo||(u.player||{}).no||'demo')+'_'+Fmt.todayStr()+'_'+key }
}
