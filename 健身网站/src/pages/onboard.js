/* src/pages/onboard.js —— 建档（第一次登录后的引导页）
 *
 * 为什么必须有这一页（2026-09-23 用户注册后炸出来的）：
 *   注册时云端只建了个空壳（`profile: null`），而没有档案就算不出任何东西 ——
 *   训练页会说「还没有训练计划」、饮食页直接报错（读 weight/goal 时 null 崩页）。
 *   所以登录后的第一件事就是建档：填完立刻生成训练计划 + 每日宏量，用户马上能用。
 *
 * 设计取舍：
 *   · 一页填完（不做多步向导）—— 字段不多，多步反而增加放弃率
 *   · 每个选项都**预选一个合理默认**（活动量按每周天数推断）→ 用户只改不对的地方
 *   · 值域严格对齐引擎：goal/exp/activity/bodyType/dietMode 任何一项写错，
 *     计划或宏量都会静默算错，所以全部从引擎取值或与注释一一对应。
 */
const PageOnboard = {
  /** 表单草稿。null = 还没初始化过（进页面时按推荐值预填） */
  draft: null,

  /** 推荐默认值：一个「30 岁 / 170cm / 70kg / 练四休一 / 中度活动」的普通人 */
  defaults() {
    return {
      nick: '', gender: '男', age: '30', height: '170', weight: '70',
      goal: '增肌减脂同步', exp: '新手', days: '4', home: '0',
      split: 'auto', freq: 'auto',
      activity: 'mod', bodyType: '中性', dietMode: 'simple', city: ''
    }
  },

  /** 已有档案时用档案回填（改档案场景）。plan 里的分化/循环也要带回来，否则一改档案就被重置 */
  fromProfile(p, plan) {
    const d = this.defaults()
    if (plan) {
      if (plan.split) d.split = plan.split
      if (plan.freq) d.freq = plan.freq
    }
    if (!p) return d
    const map = ['gender', 'goal', 'exp', 'bodyType', 'dietMode', 'city']
    map.forEach(k => { if (p[k]) d[k] = String(p[k]) })
    d.age = String(p.age || d.age)
    d.height = String(p.height || d.height)
    d.weight = String(p.weight || d.weight)
    d.days = String(p.days || d.days)
    d.home = p.home ? '1' : '0'
    d.activity = p.activity || d.activity
    d.nick = p.nick || ''
    return d
  },

  d() {
    if (!this.draft) {
      const u = (Store.state.user || {})
      this.draft = this.fromProfile(u.profile, u.plan)
      if (!this.draft.nick && u.nick) this.draft.nick = u.nick
    }
    return this.draft
  },

  /**
   * 推荐的分化方式。规则与引擎 kb.defaultSplit() 一致（那个没导出，所以这里镜像一份）：
   *   新手 → 全身循环；进阶 → 推拉腿三分化；熟练 → 四分化。
   * 'auto' 表示"跟经验走"，用户手动选过就是固定值。
   */
  recommendSplit(exp, freqKey) {
    // 循环制：一轮练几天，就该有几个部位 —— 天数直接决定分化。
    // 为什么必须这样配：练4休1 配三分化会变成「推→拉→腿→推→休」，
    //   推在 5 天里练 2 次、腿只练 1 次，既不平衡也没必要（实测出来的）。
    if (freqKey === 'c5') return 'five'
    if (freqKey === 'c4') return exp === '新手' ? 'full' : 'cpbsl'
    if (freqKey === 'c3') return 'ppl'
    // 按周安排：按经验走
    if (exp === '新手') return 'full'
    return exp === '熟练' ? 'cpbsl' : 'ppl'
  },

  /** 生效的分化（没手动选过就用推荐值） */
  effSplit() {
    return this.d().split === 'auto' ? this.recommendSplit(this.d().exp, this.effFreq()) : this.d().split
  },

  /**
   * 分化 × 循环 的搭配体检。用户手动选了不搭的组合时给明确警告 ——
   * 这种"两个都选了但互相打架"的情况，不提示的话用户几个月后才发现练得不均匀。
   */
  comboHint() {
    const f = this.effFreq(), sp = this.effSplit()
    const F = ENGINE.kb.FREQ || {}
    const S = ENGINE.kb.SPLITS || {}
    const fName = (F[f] || {}).name || f
    const sName = (sp && S[sp] ? S[sp].name : sp)
    const need = { c3: 3, c4: 4, c5: 5 }[f]
    if (f === 'c4' && sp === 'ppl') {
      return '⚠️ 「练4休1」配三分化会让「推」在一轮里练 2 次、腿只练 1 次，练得不均匀。' +
        '建议换成「四分化」—— 练 4 天正好 4 个部位各一次。'
    }
    if (f === 'c3' && (sp === 'cpbsl' || sp === 'five')) {
      return '⚠️ 「练3休1」一轮只有 3 个训练日，配' + Fmt.esc(sName) +
        '会有一部分部位一轮轮不到，实际每周频率被拉低。建议换成「推拉腿三分化」。'
    }
    if (f === 'c5' && sp !== 'five') {
      return '⚠️ 「练5休2」一轮有 5 个训练日，建议配「五分化」一天练一个部位，不然会有部位反复练。'
    }
    if (need && sp && (ENGINE.kb.SPLITS[sp] || {}).foci && ENGINE.kb.SPLITS[sp].foci.length === need) {
      return '✅ ' + Fmt.esc(fName) + ' 配 ' + Fmt.esc(sName) + '：一轮 ' + need + ' 个训练日，正好 ' +
        need + ' 个部位各一次，这是最整齐的配法。'
    }
    return ''
  },

  /**
   * 生效的循环方式。'auto' 时按"每周能练几天"换算（镜像引擎 kb.defaultFreq）。
   * 注意 FREQ 里有两类：按周（w3~w6）和循环制（c3/c4/c5＝练3休1 / 练4休1 / 练5休2）。
   * 循环制不看星期几：练完一个循环直接接下一个，休息日跟着循环走 —— 作息不固定的人靠它。
   */
  effFreq() {
    const f = this.d().freq
    if (f !== 'auto') return f
    const dpw = Math.min(6, Math.max(3, Number(this.d().days) || 3))
    if (dpw >= 6) return 'w6'
    if (dpw >= 5) return 'w5'
    if (dpw >= 4) return 'w4'
    return 'w3'
  },

  /** 「训练安排」卡的内容（单独抽出来是为了能局部重建，不用整页重渲染） */
  trainBlockHTML() {
    const hint = this.comboHint()
    return '<h2>训练安排 <span class="mini">决定你练什么、怎么排</span></h2>' +
      '<div class="ob-label">练了多久</div>' +
      this.chips('exp', [
        { v: '新手', label: '新手（不到 1 年）' },
        { v: '进阶', label: '进阶（1–3 年）' },
        { v: '熟练', label: '熟练（3 年以上）' }
      ]) +
      '<div class="ob-label">每周能练几天</div>' +
      this.chips('days', [2, 3, 4, 5, 6].map(x => ({ v: String(x), label: x + ' 天' }))) +
      '<div class="ob-label">循环方式 <span class="muted">（已按每周天数选好，可改）</span></div>' +
      this.freqHTML() +
      '<div class="ob-label">分化方式 <span class="muted">（已按经验与循环自动配好，可改）</span></div>' +
      this.splitListHTML() +
      (hint ? '<div class="combo-hint">' + hint + '</div>' : '') +
      '<div class="ob-label">在哪练</div>' +
      this.chips('home', [{ v: '0', label: '健身房' }, { v: '1', label: '居家' }]) 
  },

  /** 局部重建「训练安排」卡（推荐值/搭配提示会随 exp、days、freq 变） */
  refreshTrainBlock() {
    const box = document.getElementById('obTrain')
    if (!box) return
    const y = window.scrollY
    box.innerHTML = this.trainBlockHTML()
    this.bind()
    if (typeof window.scrollTo === 'function') window.scrollTo(0, y)
  },

  /** 分化方式：列表式（每项带适合人群与依据，依据原文照抄、含【推演】标记） */
  splitListHTML() {
    const cur = this.effSplit()
    const map = ENGINE.kb.SPLITS || {}
    const FN = ENGINE.kb.FOCUS_NAME || {}
    return '<div class="act-list" data-list="split">' +
      Object.keys(map).map(k => {
        const sp = map[k]
        // 标题里摆一行「练哪几天」的简写（「四分化（胸 / 背 / 肩 / 腿）」）——
        // 光看「四分化」不知道包含什么，用户会问"为什么不是胸背肩腿"。
        // 注意用简写而不是 FOCUS_NAME 全称：全称是「胸 + 三头 / 背 + 后束 + 二头 / 肩（前中后三束）/ 腿｜股四 + 臀 + 腘绳」，太长。
        const SHORT = { full: '全身', ppl: '推 / 拉 / 腿', cpbsl: '胸 / 背 / 肩 / 腿', five: '胸 / 背 / 肩 / 臂 / 腿' }
        const fociCN = SHORT[k] || (sp.foci || []).map(f => FN[f] || f).join(' / ')
        return '<button class="act-item' + (cur === k ? ' on' : '') + '" data-v="' + Fmt.esc(k) + '">' +
          '<span class="act-top"><b>' + Fmt.esc(sp.name) +
            (fociCN ? '（' + Fmt.esc(fociCN) + '）' : '') + '</b>' +
          '<span class="act-factor">' + Fmt.esc(sp.level) + '</span></span>' +
          '<span class="act-desc">' + Fmt.esc(sp.basis) + '</span>' +
          (k === 'cpbsl' ? '<span class="act-desc" style="margin-top:3px">' +
            '<b>就是「胸 / 背 / 肩 / 腿」</b>，一天一个部位。三头挂在胸日、二头与后束挂在背日 —— ' +
            '因为推的动作本来就练三头、拉的动作本来就练二头，所以挂过去最省事，不用单开一天练手臂。</span>' : '') +
          '</button>'
      }).join('') + '</div>'
  },

  /** 循环方式：分「按周 / 循环制」两组，但共用同一个字段（互斥） */
  freqHTML() {
    const cur = this.effFreq()
    const F = ENGINE.kb.FREQ || {}
    const chip = k => (F[k] ? '<button class="chip' + (cur === k ? ' on' : '') +
      '" data-v="' + k + '">' + Fmt.esc(F[k].name) + '</button>' : '')
    return '<div class="freq-row"><span class="freq-k">按周</span>' +
        '<div class="chips" data-chips="freq">' + ['w3', 'w4', 'w5', 'w6'].map(chip).join('') + '</div></div>' +
      '<div class="freq-row"><span class="freq-k">循环制</span>' +
        '<div class="chips" data-chips="freq">' + ['c3', 'c4', 'c5'].map(chip).join('') + '</div></div>' +
      '<div class="muted txs" style="margin-top:8px">' +
        '<b>按周</b>＝固定星期几练（比如每周一三五）；<b>循环制</b>＝「练 N 天休 1 天」不停轮转，不看星期几。' +
        '上班排班不固定的人选循环制，效果一样还不容易断。</div>'
  },

  /** 一组单选按钮（chips）。key 与 draft 的字段同名 */
  chips(key, list) {
    const cur = String(this.d()[key])
    return '<div class="chips" data-chips="' + key + '">' +
      list.map(o => '<button class="chip' + (cur === String(o.v) ? ' on' : '') +
        '" data-v="' + Fmt.esc(String(o.v)) + '">' + Fmt.esc(o.label) + '</button>').join('') +
      '</div>'
  },

  /** 活动量的说明文字：说清「选它=消耗按 ×N 算」+「拿不准怎么选」 */
  actHintText(key) {
    const list = ENGINE.method.ACTIVITY || []
    const a = list.find(x => x.key === key)
    const picked = a ? '已选「<b>' + Fmt.esc(a.name) + '</b>」：每日总消耗 = 基础代谢 × ' + a.factor + '。' : ''
    return picked +
      '<br><span class="muted">拿不准就选「<b>中度</b>」—— 每周练 3–5 次、每次 60–90 分钟力量的人基本都在这档；' +
      '如果你上班要走很多路、或干体力活，往上加一档；天天坐办公室又几乎不练，往下选一档。</span>'
  },

  numField(key, label, unit, hint) {
    return '<div class="ob-num"><span class="ob-num-k">' + Fmt.esc(label) + '</span>' +
      '<input class="ob-inp" data-num="' + key + '" type="number" inputmode="decimal"' +
      ' value="' + Fmt.esc(String(this.d()[key])) + '">' +
      '<span class="ob-unit">' + Fmt.esc(unit) + '</span>' +
      (hint ? '<span class="ob-hint">' + Fmt.esc(hint) + '</span>' : '') + '</div>'
  },

  render() {
    const d = this.d()
    const isEdit = Store.hasProfile()
    const acts = ENGINE.method.ACTIVITY || []
    const actNow = acts.find(a => a.key === d.activity) || acts[2] || {}

    document.getElementById('app').innerHTML =
      Router.bar(isEdit ? '修改档案' : '建档',
        isEdit ? '改完会重算训练计划与饮食' : '1 分钟 · 之后随时能改') +

      (!isEdit
        ? '<div class="card warn-card">' +
            '<b>最后一步：填一下你的基本情况</b>' +
            '<div class="muted txs" style="margin-top:6px">' +
            '这一步不能跳 —— 训练计划和每天吃多少都是用它算出来的。' +
            '所有选项都填好了默认值，<b>你只需要改不对的地方</b>。</div>' +
          '</div>'
        : '') +

      /* ① 基本 */
      '<div class="card"><h2>基本</h2>' +
        '<div class="ob-num"><span class="ob-num-k">称呼</span>' +
          '<input class="ob-inp wide" data-txt="nick" type="text" maxlength="12"' +
          ' placeholder="榜上和存档里显示的名字（可留空）" value="' + Fmt.esc(d.nick) + '"></div>' +
        '<div class="ob-label">性别</div>' + this.chips('gender', [{ v: '男', label: '男' }, { v: '女', label: '女' }]) +
        this.numField('age', '年龄', '岁') +
        this.numField('height', '身高', 'cm') +
        this.numField('weight', '体重', 'kg', '早起空腹称最准，之后可随时改') +
      '</div>' +

      /* ② 目标 */
      '<div class="card"><h2>目标</h2>' +
        this.chips('goal', [
          { v: '减脂', label: '减脂' },
          { v: '增肌', label: '增肌' },
          { v: '增肌减脂同步', label: '增肌减脂同步' },
          { v: '塑形', label: '塑形（维持+线条）' }
        ]) +
        '<div class="muted txs">目标决定热量缺口（减脂 −300 / 增肌 +130 kcal）与蛋白口径。</div>' +
      '</div>' +

      /* ③ 训练安排：经验 → 每周天数 → 循环方式 → 分化方式 → 场所 */
      '<div class="card" id="obTrain">' + this.trainBlockHTML() + '</div>' +

      /* ④ 活动量（影响最大的一项）—— 列表式，每档自带判断标准 */
      '<div class="card"><h2>日常活动量 <span class="mini">这一项影响最大</span></h2>' +
        '<div class="act-list" data-list="activity">' +
          acts.map(a => '<button class="act-item' + (d.activity === a.key ? ' on' : '') +
            '" data-v="' + Fmt.esc(a.key) + '">' +
            '<span class="act-top"><b>' + Fmt.esc(a.name) + '</b>' +
            '<span class="act-factor">×' + a.factor + '</span></span>' +
            '<span class="act-desc">' + Fmt.esc(a.desc) + '</span>' +
            '</button>').join('') +
        '</div>' +
        '<div class="act-hint" id="actHint">' + this.actHintText(d.activity) + '</div>' +
      '</div>' +

      /* ⑤ 饮食 */
      '<div class="card"><h2>饮食方案</h2>' +
        '<div class="ob-label">怎么给量</div>' +
        this.chips('dietMode', [
          { v: 'simple', label: '只给克数（自由搭）' },
          { v: 'recipe', label: '帮我配好菜' }
        ]) +
        '<div class="ob-label">体质（决定碳水基准）</div>' +
        this.chips('bodyType', [
          { v: '易胖', label: '容易胖' },
          { v: '中性', label: '中性' },
          { v: '易瘦', label: '怎么吃都不胖' }
        ]) +
        '<div class="muted txs">碳水基准 易胖 2.5 / 中性 3.0 / 易瘦 3.5 g/kg —— 选错方向，吃多吃少会差一截。</div>' +
      '</div>' +

      /* ⑥ 城市（可选） */
      '<div class="card"><h2>城市 <span class="mini">可跳过</span></h2>' +
        '<div class="muted txs" style="margin-bottom:8px">只用来显示「同城排行榜」，' +
        '<b>不开定位</b>，也不会上传你的位置。</div>' +
        this.chips('city', ENGINE.gamify.CITIES.map(c => ({ v: c, label: c }))) +
      '</div>' +

      /* ⑦ 师傅邀请码（选填，收徒裂变） */
      '<div class="card"><h2>有师傅带你？ <span class="mini">可跳过</span></h2>' +
        '<div class="muted txs" style="margin-bottom:8px">填朋友的邀请码（LB 开头）——' +
        '你和他<b>各得 3 天完整版</b>。一个账号只认一个师傅。</div>' +
        '<input class="ob-inv" data-txt="invite" placeholder="LB 开头的邀请码（没有就跳过）" value="' + Fmt.esc(this.d().invite || '') + '">' +
      '</div>' +

      '<div style="margin-bottom:24px">' +
        '<button class="btn" id="obSubmit">' + (isEdit ? '保存并重算计划' : '完成建档，生成我的计划') + '</button>' +
        (isEdit ? '<button class="btn line" style="margin-top:10px" onclick="Router.go(\'me\')">取消</button>' : '') +
      '</div>'

    this.bind()
  },

  bind() {
    // 所有单选项（chips 与列表式都走同一条路）
    document.querySelectorAll('[data-chips], [data-list]').forEach(box => {
      const key = box.dataset.chips || box.dataset.list
      box.querySelectorAll('[data-v]').forEach(b => { b.onclick = () => this.pick(key, b) })
    })
    // 数字/文本
    document.querySelectorAll('[data-num]').forEach(inp => {
      inp.oninput = () => { this.d()[inp.dataset.num] = inp.value }
    })
    document.querySelectorAll('[data-txt]').forEach(inp => {
      inp.oninput = () => { this.d()[inp.dataset.txt] = inp.value }
    })
    const btn = document.getElementById('obSubmit')
    if (btn) btn.onclick = () => this.submit()
  },

  /**
   * 选中一项 → 只刷新相关 UI。
   *
   * ⚠️ 这里**故意不整体重渲染**，踩过的两个坑：
   *   ① 只重渲染的话，用户滚动到"活动量"再改"每周天数"，页面会被拽回顶部（滚动位置丢失）；
   *   ② 重渲染会重建输入框 → 正在填的昵称/体重会失焦。
   * 所以改成"改草稿 + 只更新受影响的 DOM"。
   */
  pick(key, btn) {
    const d = this.d()
    d[key] = btn.dataset.v

    // 刷新「同一个 key 的所有组」的选中态 —— 循环方式拆成了「按周/循环制」两组，
    // 只刷当前组的话，另一组的旧选中会留着（两个同时高亮）
    document.querySelectorAll('[data-chips="' + key + '"],[data-list="' + key + '"]').forEach(box => {
      box.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x.dataset.v === d[key]))
    })

    // 活动量：手动选过就打标记（之后不再被"每周天数"自动覆盖），并刷新说明
    if (key === 'activity') {
      this._actTouched = true
      this.syncActHint()
    }

    // 改「每周天数」→
    //   ① 没手动调过活动量 → 挪到推荐档；② 循环方式还是 auto → 高亮跟着换
    //   ③ 手动选过的循环方式与天数矛盾（如选过「练3休1」又改成 2 天）→ 自动纠正并明说
    //      （2026-10-18 线上复查：旧版只处理 auto，矛盾组合被静默保留，时间投入和安排对不上）
    if (key === 'days') {
      if (!this._actTouched) {
        d.activity = ENGINE.method.defaultActivity(Number(btn.dataset.v))
        document.querySelectorAll('[data-list="activity"]').forEach(box =>
          box.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x.dataset.v === d.activity)))
        this.syncActHint()
      }
      if (d.freq === 'auto') {
        this.syncGroup('freq', this.effFreq())
      } else {
        const days = Number(btn.dataset.v)
        const fr = (ENGINE.kb.FREQ || {})[d.freq]
        const trainPerWeek = fr ? (fr.kind === 'week' ? fr.train : Math.round(fr.train * 7 / (fr.train + fr.rest))) : 0
        if (fr && trainPerWeek > days) {
          const fixed = this.freqClampTo(days, fr.kind)
          if (fixed) {
            d.freq = fixed
            this.syncGroup('freq', fixed)
            UI.toast('每周 ' + days + ' 天：「' + fr.name + '」排不下，已换成「' + ENGINE.kb.FREQ[fixed].name + '」')
          }
        }
      }
    }

    // 经验 / 天数 / 循环 一变，分化推荐与搭配提示都会变 → 局部重建这一块
    if (key === 'exp' || key === 'days' || key === 'freq') this.refreshTrainBlock()
  },

  /** 把某个 key 的所有组按给定值刷新高亮 */
  syncGroup(key, val) {
    document.querySelectorAll('[data-chips="' + key + '"],[data-list="' + key + '"]').forEach(box => {
      box.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x.dataset.v === val))
    })
  },

  /** 天数收窄后，找同类型里排得下的最高档（循环制↔循环制、周制↔周制；没有就 null） */
  freqClampTo(days, kind) {
    const F = ENGINE.kb.FREQ || {}
    const keys = Object.keys(F).filter(k => F[k].kind === kind && F[k].train <= days)
    if (!keys.length) return null
    return keys.sort((a, b) => F[b].train - F[a].train)[0]
  },

  /** 只刷新活动量那行说明（不碰其它 DOM） */
  syncActHint() {
    const hint = document.getElementById('actHint')
    if (hint) hint.innerHTML = this.actHintText(this.d().activity)
  },

  /** 校验：只挡明显离谱的，别把用户拦在门外 */
  validate(d) {
    const age = Number(d.age), h = Number(d.height), w = Number(d.weight)
    if (!(age >= 12 && age <= 90)) return '年龄填 12–90 之间'
    if (!(h >= 120 && h <= 230)) return '身高填 120–230 cm 之间'
    if (!(w >= 30 && w <= 250)) return '体重填 30–250 kg 之间'
    return ''
  },

  submit() {
    const d = this.d()
    const err = this.validate(d)
    if (err) { UI.toast(err); return }

    const profile = {
      nick: (d.nick || '').trim().slice(0, 12),
      gender: d.gender,
      age: Number(d.age),
      height: Number(d.height),
      weight: Number(d.weight),
      goal: d.goal,
      exp: d.exp,
      days: Number(d.days),
      home: d.home === '1',
      activity: d.activity,
      bodyType: d.bodyType,
      dietMode: d.dietMode,
      city: ENGINE.gamify.normCity(d.city)
    }

    if (!Store.isLoggedIn()) {
      UI.toast('还没登录 —— 先注册/登录，档案才能存到云端')
      Router.go('login')
      return
    }
    // 分化 / 循环：'auto' 时不传，让引擎按经验/天数自己推（与展示的推荐值一致）
    const opts = {
      home: profile.home,
      dietMode: profile.dietMode,
      split: this.d().split === 'auto' ? '' : this.d().split,
      freq: this.d().freq === 'auto' ? '' : this.d().freq
    }
    const r = Store.saveProfile(profile, opts)
    if (r && r.error) { UI.toast(r.error); return }

    UI.toast(Store.state.demo ? '已建档（演示模式：只存本机）' : '建档完成，计划已生成')
    // 收徒：填了师傅邀请码就绑定（双方各得 3 天完整版；失败不挡建档）
    const invite = (d.invite || '').trim().toUpperCase()
    if (invite && !Store.state.demo) {
      Api.api('bindInvite', { token: Store.state.token, code: invite }).then(rr => {
        if (rr && rr.bound) UI.toast('拜师成功！你和师傅各得 3 天完整版')
      }).catch(() => {})
    }
    Router.go('today')
  },

  /** 从外面打开时重置草稿（比如换账号登录后） */
  reset() { this.draft = null; this._actTouched = false; Router.go('onboard') }
}
