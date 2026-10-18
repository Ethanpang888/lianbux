/* 基础功法：可独立执行，不改动现有付费处方或用户计划。 */
const Foundations = {
  books: [
    {key:'warmup',name:'启脉诀',subtitle:'力量训练前的完整热身',category:'训练准备',time:'8–12 分钟',tone:'sage',mark:'启',intro:'按推、拉、腿选择热身。先活动，再激活，最后用轻重量预演今天的主项。',who:'居家或健身房力量训练者',source:'谭成义《一次性看完三分化热身整套流程》本地笔记；动作次数、简化替代和顺序为本站整理建议。',sections:[['准备','先快走或原地踏步 2–3 分钟，让身体温热。力度以舒适为准，不靠强压痛点完成热身。'],['推日：胸、肩、三头','轻量弹力带前后拉 → 小幅肩环绕 → 俯卧 Y 字 → 墙面肩胛俯卧撑。每项先做 1 组、约 8–12 次，不做到力竭。'],['拉日：背、后束、二头','轻柔活动胸椎 → 弹力带拉开 → 肩胛前伸后缩 → 轻重量划船。每项约 8–12 次；不用高难度倒立来代替新手热身。'],['腿日：髋、膝、踝','踝关节前移 → 小幅髋关节活动 → 扶物髋铰链 → 徒手深蹲。每项约 8–10 次，先找到稳定的脚底和髋部发力。'],['主项递进热身','先空杆、轻哑铃或简单变体，再逐组接近工作重量；做 2–3 个准备组，每组约 5–8 次，越接近工作重量越减少次数。热身组与正式工作组分开。'],['什么时候停下来','锐痛、麻木、眩晕或动作中疼痛加重时停止。原视频中的进阶动作并非人人需要，已有伤病按专业人员建议调整。']]},
    {key:'cardio',name:'御风诀',subtitle:'练后有氧与走跑间歇',category:'心肺耐力',time:'10–20 分钟',tone:'blue',mark:'风',intro:'有氧按体能和恢复安排，不用每天跑，也不用用它惩罚多吃的一餐。',who:'想增加日常活动或练心肺的人',source:'谭成义《哪种有氧对力量训练帮助更大？以及有氧的强度和时间具体如何安排》本地笔记；低强度入门和停止条件为本站整理。',sections:[['入门从舒适强度开始','新手或当天腿部疲劳，先快走、单车或椭圆机 10–15 分钟，能说完整句子。适应后再逐步增加，不同时增加时长与强度。'],['原文走跑方案','20 分钟＝4 轮 ×（快走 3 分钟＋跑 2 分钟）。这是原文方案，不是所有人的起步要求；跑段使用自己能控制的配速。'],['放在哪一天','可以放在力量后，也可以分开一天做。增肌期若影响下次力量表现，减少有氧量；腿日后优先轻松活动。'],['一次做完如何判断','记录方式、时间和主观吃力程度。呼吸逐渐平稳、能恢复正常活动即可，不追逐设备估算的热量。'],['收尾与不适','结束前放慢 2–3 分钟。胸痛、异常气促、头晕立即停止；不要用憋气或舌头位置判断运动是否安全。']]},
    {key:'home-start',name:'居家筑基诀',subtitle:'一张椅子开始全身训练',category:'居家入门',time:'15–20 分钟',tone:'sand',mark:'基',intro:'四个基础动作，一周先完成两次。适合想建立规律、还不熟悉健身器械的人。',who:'健康成年人中的健身初学者；男女均可',source:'本站基础训练编排，非博主原方；动作要领可在动作图鉴进一步查看。',actions:[{name:'自重深蹲',sets:'2×10'},{name:'俯卧撑',sets:'2×8'},{name:'臀桥',sets:'2×12'},{name:'徒手提踵',sets:'2×12'}],sections:[['本周安排','两次全身训练之间至少留一天恢复；其余日按能力散步。先稳定坚持，再增加训练量。'],['热身 3 分钟','原地踏步、轻柔肩环绕、徒手坐下起立各做约 1 分钟。'],['四个动作','椅子坐站 2×8–12；墙面俯卧撑 2×8–12；臀桥 2×10–15；扶墙提踵 2×10–15。椅子靠墙放稳，不用带轮椅。跟着开练时用动作图鉴的对应版本（自重深蹲/俯卧撑/臀桥/提踵），要领相同、难度更好调。'],['休息与强度','组间休息 60–90 秒，结束一组时感觉还能做 2–3 次。若动作变形，减少次数或换更容易的角度。'],['下周怎么进步','同一动作两次都能稳定做到次数上限，再增加少量次数或难度；不要一次增加所有动作的组数。']]},
    {key:'back',name:'舒展美背诀',subtitle:'上背力量与久坐活动',category:'上背训练',time:'10–15 分钟',tone:'rose',mark:'展',intro:'用拉、肩胛活动和日常起身建立更舒服的上背。体态变化需要长期观察，不承诺矫正骨骼。',who:'久坐、想练上背且没有持续疼痛的人',source:'本站基础动作组合 + 谭成义《居家训练之背部跟练》本地笔记（划船组次、肩胛唤醒、引体主干）；不属于诊断或康复处方。',actions:[{name:'弹力带飞鸟',sets:'2×12'},{name:'单臂哑铃划船',sets:'2×10每侧'},{name:'超人式',sets:'1×12'}],sections:[['日常起身','每坐一段时间起身走动 2–3 分钟；不用整天夹紧肩胛或强迫自己保持一种姿势。'],['肩胛唤醒（练前 1 分钟）','谭成义背部跟练的开场：跪姿肘支撑、平板拉锯式各 30 秒 —— 先把肩胛叫醒，后面的划船才不耸肩。'],['动作清单','墙面滑手 1×8；轻阻力弹力带划船 2×10–15；弹力带飞鸟（后束）2×12；单臂哑铃划船 2×10–12 每侧；俯卧 Y 字或超人式 1–2×8–12。动作慢、肩颈放松，弹力带固定在可靠位置。'],['想更进一步：引体','有条件就练引体向上，每周 2 次主项（4×10–12，做不了用弹力带辅助或做离线下放）—— 这是居家背部跟练的主干动作，对整个上背效率最高。'],['安排与替代','每周做 2 次，和高量背部训练错开。没有弹力带时先做墙面滑手与徒手肩胛前伸后缩，不把毛巾门框当作安全锚点。'],['如何观察进步','看动作是否更稳定、同样次数是否更轻松、久坐是否更舒服。拍照角度和光线保持一致，不能仅凭照片诊断圆肩或肱骨位置。'],['避免误解','背部训练不能局部减去背部脂肪，也不保证改变天生骨架。持续疼痛、上肢麻木或无力时先评估。想要更完整的美背周期，进阶区有「美背专项」秘籍。']]},
    {key:'shape',name:'塑形入门诀',subtitle:'减脂、线条与长期进步',category:'体型管理',time:'7 天起步',tone:'sage',mark:'形',intro:'不用把“薄肌”当成特殊练法。先建立力量训练、合理饮食和恢复的日常习惯。',who:'想减脂塑形、保持肌肉与力量的人',source:'本站入门行动指南，不是个体化饮食处方。',sections:[['先记录一周','按常态记录饮食、训练和睡眠；体重在相似条件下称量，看周趋势，不追一天的波动。'],['力量训练先稳定','选择你能坚持的每周 2–3 次安排。主项保留 2–3 次余力，记录重量与次数，不靠每天练到力竭追求线条。'],['饮食先看总体','参考饮食页的估算目标，正常吃饭，保证蛋白来源与蔬果。目标是起点，结合数周变化调整，不因一顿超标极端少吃。'],['加活动而非惩罚','先增加步行和自己喜欢的活动，按恢复加入有氧。没有专门瘦脸、瘦腰或美背的局部减脂训练。'],['一周复盘','完成了几次训练？哪顿最难安排？下周只改一个最容易执行的点。女性同样可以规律进行力量训练。']]},
    {key:'recovery',name:'养息诀',subtitle:'休息日也有自己的功课',category:'恢复习惯',time:'5–10 分钟',tone:'blue',mark:'息',intro:'内修先从睡眠、轻松活动和训练后的恢复开始。休息不扣修为，也无需补课式加练。',who:'训练日与休息日均适用',source:'本站一般健康习惯建议，不包含中医诊断、药物或治失眠承诺。',sections:[['白天','按能力散步，适当接触自然光；明显疲劳时减少额外训练。'],['睡前','安排相对固定的上床和起床时间，睡前留一段安静放松时间。'],['轻松呼吸','坐着或躺在舒适位置，自然呼吸 2–3 分钟，不憋气、不追求特殊频率。感到不适就恢复平常呼吸。'],['持续睡不好','长期失眠、影响白天生活或伴随明显不适时，寻求专业帮助，不用茶包或训练替代诊疗。']]}
  ],
  get(key) { return this.books.find(x => x.key === key) },
  /** 「跟着开练」：把功法的动作加进今天的训练日末尾（slotExercises 机制，可随时删），然后跳训练页 */
  startNow(key) {
    const b = this.get(key)
    if (!b || !b.actions || !b.actions.length) return
    const u = Store.state.user || {}
    const plan = u.plan && u.plan.micro ? u.plan : null
    if (!plan) { UI.toast('先有训练计划 —— 回首页建档生成一份'); return }
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
      (b.actions ? '<button class="btn" onclick="Foundations.startNow(\'' + key + '\')">跟着开练 · 加进今天的训练</button><button class="btn ghost" style="margin-top:10px" onclick="Router.go(\'today\')">去训练页（不加动作）</button>'
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
