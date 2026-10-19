/* src/pages/plan12.js —— 十二周计划文档（进阶包内容）
 *
 * 选目标 → 按用户身体数据生成 12 周逐周训练 + 宏量饮食的长文档，可打印成 PDF。
 * 结构对标市售「定制计划」交付物（基本信息 / 概述 / 宏量 / 逐周训练 / 调整规则 / 执行清单），
 * 数字全部来自引擎（energyPlan + todayPrescription 推演 + 双渐进阶梯），每处标口径。
 * 权限：ENGINE.plus.isPlus。
 */
const PagePlan12 = {
  goal: '',

  render() {
    const u = Store.state.user || {}
    const owned = ENGINE.plus.hasPlan12(u)
    this.goal = this.goal || (u.profile || {}).goal || '增肌'
    this.injectPrintStyle()
    if (!owned) {
      // 未购：第一周预览（转化素材）+ 购买引导 —— 12 周计划是「按周期交付的一份文档」，单独卖
      document.getElementById('app').innerHTML = Router.bar('十二周计划') +
        '<div class="card">' +
          '<h2>个人定制 · 十二周训练与饮食计划 <span class="tag gold">¥39.9 / 份</span></h2>' +
          '<div class="muted txs">一份<b>可打印的 12 周全案</b>：宏量克数表 + 12 周逐周训练（带具体重量）+ 调整规则 + 执行清单。' +
            '<b>按你的身高体重目标经验逐项算出来</b>，不是拿模板改名字 —— 这类定制方案市面上一份卖 50-99。</div>' +
          '<div class="callout"><p class="muted txs"><b>你买到的是什么、不是什么</b></p>' +
            '<p class="muted txs">✅ 是：一份按你数据逐项定制、能直接照着练 12 周的完整方案（含自我调整规则，出了状况先查表）。</p>' +
            '<p class="muted txs">✕ 不是：陪跑 / 答疑服务 —— 执行中的问题先用站内免费工具自查（调整顾问免费开放；疼痛排查库完整版在进阶包，免费可见摘要）；' +
              '要「每周有人盯着你」那是陪跑（1299 起）的范畴，两边不混。</p></div>' +
          '<div class="callout"><p class="muted txs"><b>为什么单独卖、不塞进买断包：</b>计划是周期性交付物 —— 12 周练完、身体变了，' +
            '需要的是「下一版」而不是同一份。单独按份买，一次一付，谁也不欠谁。</p></div>' +
          '<div class="muted txs"><b>购买</b>：微信长按识别下方码付 ¥39.9（备注注册邮箱）→ 私信阿清 → 收到 12 周码 → 下面输入 → 生成你的版本</div>' +
          '<div style="text-align:center;margin:10px 0">' +
            '<img src="assets/pay-qr.png" style="width:170px;border-radius:12px" alt="收款码">' +
          '</div>' +
          '<input class="pro-input" id="p12Code" placeholder="输入 12 周计划码" autocomplete="off">' +
          '<button class="btn" style="margin-top:10px" id="p12Btn">解锁并生成</button>' +
        '</div>' +
        '<div class="card"><h2>第一周长这样（预览）</h2>' + this.weekPreview() +
          '<div class="muted txs">🔒 完整 12 周（含重量阶梯、减载周、调整规则、执行清单）解锁后生成。</div></div>' +
        '<div style="height:20px"></div>'
      this.bindRedeem()
      return
    }
    document.getElementById('app').innerHTML = Router.bar('十二周计划') +
      '<div class="card no-print">' +
        '<h2>十二周计划文档 <span class="tag gold">已解锁</span></h2>' +
        '<div class="muted txs">选目标 → 生成 → 浏览器打印/另存 PDF。12 周练完后身体变了 —— ' +
          '再买一份新的（老客半价 ¥19.9，找阿清拿码），这就是它的用法。</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
          ['增肌', '减脂', '增肌减脂'].map(g =>
            '<button class="chip' + (this.goal === g ? ' on' : '') + '" onclick="PagePlan12.setGoal(\'' + g + '\')">' + g + '</button>').join('') +
          '<button class="btn" style="margin-left:auto" onclick="window.print()">🖨 打印 / 存 PDF</button>' +
        '</div>' +
      '</div>' +
      '<div id="docWrap">' + this.doc() + '</div>' +
      '<div style="height:20px"></div>'
  },

  /** 第一周预览（未购转化素材）：周期大纲表（谭成义团队口径），不再逐动作铺屏 */
  weekPreview() {
    const u = Store.state.user || {}
    const p = u.profile || {}
    const plan = u.plan || ENGINE.kb.generatePlan(p)
    const splitName = (ENGINE.kb.SPLITS[plan.split] || {}).name || plan.split
    const rows = [
      { w: '第 1-3 周', ph: '积累期', reps: '主项 4×8 → 4×10 → 4×12', kg: '同一重量，次数往上走', note: '建立基线：记下每个动作的重量与次数' },
      { w: '第 4 周', ph: '减载周', reps: '组数 ×0.6', kg: '重量维持', note: '神经恢复 —— 减载是「练得少」，不是「随便练」' },
      { w: '第 5-7 周', ph: '加重期', reps: '重新 8 → 10 → 12', kg: '起点 +2.5kg（按你第 1 轮实测）', note: '第二轮以你的实测为基准，不再估算' },
      { w: '第 8 周', ph: '减载周', reps: '组数 ×0.6', kg: '重量维持', note: '同第 4 周' },
      { w: '第 9-11 周', ph: '冲刺期', reps: '8 → 10 → 12', kg: '再 +2.5kg', note: '重量最重的一轮，主项留 2 次余量别硬顶' },
      { w: '第 12 周', ph: '减载 + 复盘', reps: '组数 ×0.6', kg: '重量维持', note: '对比第 1 周：力量、围度、照片' }
    ]
    const table = '<table><thead><tr><th>周</th><th>阶段</th><th>组次策略</th><th>重量策略</th><th>做什么</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + r.w + '</td><td><b>' + r.ph + '</b></td><td>' + r.reps + '</td><td>' + r.kg + '</td><td class="txs">' + r.note + '</td></tr>').join('') +
      '</tbody></table>'
    // 一周骨架：一个完整循环练什么（只到「练哪个部位」，不铺逐动作清单）
    let skel = ''
    const len = plan.micro.length
    for (let d = 0; d < len; d++) {
      const day = ENGINE.kb.dayContent(Object.assign({},plan,{schedulePauses:[]}), d, p, !!plan.home)
      skel += '<div class="cyc-row" style="margin-top:4px"><div class="cyc-h"><b>Day ' + (d + 1) + '</b></div>' +
        (day.type === 'rest'
          ? '<div class="muted txs">休息 · 散步 / 拉伸 / 筋膜放松</div>'
          : '<div class="muted txs"><b>' + Fmt.esc(day.focus) + '</b> · ' + (day.exercises || []).length + ' 个动作 · 含腹部收尾</div>') +
        '</div>'
    }
    return '<div class="muted txs" style="margin-bottom:6px">训练安排：<b>' + Fmt.esc(splitName) + (plan.home ? ' · 居家版' : ' · 健身房版') + '</b>，一个循环 ' + len + ' 天，循环滚下去。</div>' +
      table +
      '<details class="fold" style="margin-top:10px"><summary>一个循环练什么（骨架概览）</summary>' + skel + '</details>' +
      '<div class="muted txs" style="margin-top:8px">递进规则：同一重量做满组次 → 次数 +2 → 做满 → 重量 +2.5kg 回到 8 次；每 4 周减载一轮。解锁后生成逐周逐动作的完整 12 周（含每个动作的具体重量与饮食克数表）。</div>'
  },

  bindRedeem() {
    const btn = document.getElementById('p12Btn')
    if (!btn) return
    btn.onclick = async () => {
      const code = (document.getElementById('p12Code').value || '').trim()
      if (!code) { UI.toast('先输入 12 周计划码'); return }
      btn.disabled = true; btn.textContent = '核销中…'
      const r = await Store.redeem(code)
      btn.disabled = false; btn.textContent = '解锁并生成'
      if (!r.ok) { UI.toast(r.msg || '兑换失败'); return }
      UI.toast('已解锁 —— 生成你的版本')
      this.render()
    }
  },

  setGoal(g) { this.goal = g; this.render() },

  injectPrintStyle() {
    if (document.getElementById('printStyle')) return
    const st = document.createElement('style')
    st.id = 'printStyle'
    st.textContent = '@media print{body *{visibility:hidden}#docWrap,#docWrap *{visibility:visible}' +
      '#docWrap{position:absolute;top:0;left:0;width:100%}}'
    document.head.appendChild(st)
  },

  /** ── 文档主体 ── */
  doc() {
    const u = Store.state.user
    const p = u.profile || {}
    const goal = this.goal
    const macros = ENGINE.calc.energyPlan(Object.assign({},p,{goal}), {})
    const plan = u.plan || ENGINE.kb.generatePlan(p)
    const splitName = (ENGINE.kb.SPLITS[plan.split] || {}).name || plan.split

    const info = '<div class="card"><h2>一、你的基本情况</h2><table><tbody>' +
      '<tr><td>性别 / 年龄</td><td>' + Fmt.esc(p.gender) + ' / ' + Fmt.esc(p.age) + ' 岁</td></tr>' +
      '<tr><td>身高 / 体重</td><td>' + Fmt.esc(p.height) + 'cm / ' + Fmt.esc(p.weight) + 'kg</td></tr>' +
      '<tr><td>训练目标</td><td>' + Fmt.esc(goal) + '</td></tr>' +
      '<tr><td>训练安排</td><td>' + Fmt.esc(splitName) + ' · ' + (plan.home ? '居家版' : '健身房版') + '</td></tr>' +
      '<tr><td>生成日期</td><td>' + Fmt.todayStr() + '（每 4 周一档，按实际进步重算）</td></tr>' +
    '</tbody></table></div>'

    const overview = '<div class="card"><h2>二、总体思路</h2>' +
      '<p class="txs">' + (goal === '减脂'
        ? '缺口小开（' + Math.abs(macros.tdee - macros.kcal) + ' kcal），力量照练、重量照加 —— 减脂期掉肌肉的本质是「练轻了、歇短了」，不是吃多了。'
        : goal === '增肌'
          ? '热量小盈余 + 力量渐进。体重每周涨 0.2–0.5% 是黄金区间，涨太快涨的多是脂肪。'
          : '热量贴近消耗，靠训练把「重做了多少」顶上去 —— 体脂和肌肉同向缓慢改善。') +
      ' 十二周分三轮，每 4 周一个减载周；饮食按宏量克数执行 7–10 天再动。</p></div>'

    const macrosCard = '<div class="card"><h2>三、每天吃多少（' + Fmt.esc(goal) + ' 口径）</h2>' +
      '<table><thead><tr><th>项目</th><th>数值</th><th>依据</th></tr></thead><tbody>' +
      '<tr><td>每日热量</td><td><b>' + macros.kcal + ' kcal</b></td><td>消耗 ' + macros.tdee +
        ' kcal' + (macros.kcal < macros.tdee ? '，缺口 ' + Math.abs(macros.tdee - macros.kcal) : '，盈余 ' + Math.abs(macros.tdee - macros.kcal)) + '</td></tr>' +
      '<tr><td>蛋白质</td><td><b>' + macros.protein + 'g</b>（' + Fmt.round(macros.protein / p.weight, 2) + 'g/kg）</td><td>谭成义区间内取值，保肌肉</td></tr>' +
      '<tr><td>碳水</td><td><b>' + macros.carb + 'g</b>（' + Fmt.round(macros.carb / p.weight, 2) + 'g/kg）</td><td>训练燃料，按饥饿反馈 ± 微调</td></tr>' +
      '<tr><td>脂肪</td><td><b>' + macros.fat + 'g</b>（' + Fmt.round(macros.fat / p.weight, 2) + 'g/kg）</td><td>不低于 0.8，影响激素</td></tr>' +
      '</tbody></table>' +
      '<div class="muted txs">连续吃满 7–10 天，只看<b>晨起空腹的周平均</b>再调；一次只动一个变量。' +
      '（宏量口径：谭成义减脂 / 增肌体系；数字由引擎按你的档案算出）</div></div>'

    // 12 周逐周
    const weeksHtml = []
    for (let w = 1; w <= 12; w++) {
      const deload = w % 4 === 0
      const inRound = (w - 1) % 4
      const bump = Math.floor((w - 1) / 4) * 2.5
      const phase = deload ? '减载周' : (w <= 4 ? '第一轮 · 积累' : w <= 8 ? '第二轮 · 加重' : '第三轮 · 冲刺')
      const reps = deload ? '' : ['8', '10', '12'][inRound]
      let daysHtml = ''
      for (let d = 0; d < 7; d++) {
        const dayIdx = (w - 1) * 7 + d
        const day = ENGINE.kb.dayContent(Object.assign({},plan,{schedulePauses:[]}), dayIdx, Object.assign({},p,{goal}), !!plan.home)
        if (day.type === 'rest') {
          daysHtml += '<div class="muted txs" style="padding:4px 0">Day ' + (d + 1) + ' · 休息（散步 20 分钟）</div>'
          continue
        }
        let presc = []
        try { presc = ENGINE.pro.todayPrescription(day, p, []).list } catch (e) { presc = day.exercises || [] }
        const rows = (day.exercises || []).map((e, i) => {
          const pu = presc[i] || {}
          const base = Number(pu.weight) || 0
          const nSets = Number(String(e.sets).split('×')[0]) || 3
          const reps0 = String(e.sets).split('×')[1] || '10'
          const sets = deload ? Math.max(2, Math.round(nSets * 0.6)) : nSets
          const r = deload ? reps0 : (i === 0 && !day.type.includes('腹') ? reps : reps0)
          // 重量只对真正负重的器械显示（杠铃/哑铃/绳索/器械/壶铃/EZ）——
          // 自重/弹力带动作被推演出「575.5kg」这类荒谬数（用户 2026-10-16 反馈），这里守卫
          const loaded = base > 0 && /杠铃|哑铃|绳索|器械|壶铃|EZ/i.test(String(e.equipment || ''))
          const kg = loaded ? (deload ? base : Fmt.round(base + (i === 0 ? bump : 0), 1)) + 'kg' : '自重'
          return '<tr><td>' + Fmt.esc(e.name) + '</td><td>' + sets + '×' + Fmt.esc(r) + '</td><td>' + kg + '</td></tr>'
        }).join('')
        daysHtml += '<div style="padding:6px 0;border-top:1px dashed var(--line)"><b class="txs">Day ' + (d + 1) +
          ' · ' + Fmt.esc(day.focus) + '</b>' +
          '<table style="margin-top:4px"><thead><tr><th>动作</th><th>组×次</th><th>重量</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      }
      weeksHtml.push('<div class="card"><h2>第 ' + w + ' 周 · ' + Fmt.esc(phase) +
        (deload ? ' <span class="tag warn">组数 ×0.6 · 重量维持</span>' : '') + '</h2>' + daysHtml +
        (deload ? '<div class="muted txs">减载是「练得少」，不是「随便练」—— 重量维持、动作照常，神经恢复后下一轮继续加重。</div>' : '') +
      '</div>')
    }

    const adjust = '<div class="card"><h2>五、什么时候调、怎么调</h2>' +
      '<table><thead><tr><th>情况（连续 1–2 周）</th><th>调整</th></tr></thead><tbody>' +
      '<tr><td>体重变化低于预期</td><td>碳水每天 ±30g 或每天多走 3000 步</td></tr>' +
      '<tr><td>在黄金区间</td><td><b>不动</b>（减脂 0.5–1%/周 · 增肌 0.2–0.5%/周）</td></tr>' +
      '<tr><td>某动作连续 4 次做不满目标次数</td><td>该动作先减载一轮，或换同部位动作</td></tr>' +
      '<tr><td>节假日停练</td><td>「我的计划」里点顺延，整个循环往后挪，节奏不乱</td></tr>' +
      '</tbody></table>' +
      '<div class="muted txs">铁律：一次只动一个变量；蛋白任何时候不低于 1.6g/kg。</div></div>'

    const checklist = '<div class="card"><h2>六、执行清单</h2><table><tbody>' +
      '<tr><td>每天</td><td>晨起空腹称重 → 按克数吃 → 训练按表加重 → 睡前放下手机</td></tr>' +
      '<tr><td>每周</td><td>量围度 → 看 7 天平均 → 按上面表格决定动不动</td></tr>' +
      '<tr><td>每 4 周</td><td>减载周 + 拍三张体型照对比</td></tr>' +
      '</tbody></table></div>'

    const src = '<div class="card"><h2>七、口径与出处</h2>' +
      '<div class="muted txs">宏量区间与调整规则 = 谭成义体系；组次递进（4×8→4×10→4×12→加重）= 谭成义 × 凯圣王；' +
        '减载（每 4 周、组数 ×0.6）= 引擎口径；起始重量由你的身体数据推演（标「推演」），执行两周后以你的实测为准。' +
        '本计划为训练与营养参考，不构成医疗建议。</div></div>'

    return '<div style="text-align:center;padding:20px 0"><h1 style="font-size:24px">个人定制 · 十二周训练与饮食计划</h1>' +
      '<div class="muted txs">' + Fmt.esc(p.gender) + ' · ' + Fmt.esc(p.age) + ' 岁 · ' + Fmt.esc(p.height) + 'cm / ' +
      Fmt.esc(p.weight) + 'kg · 目标：' + Fmt.esc(goal) + '</div></div>' +
      info + overview + macrosCard +
      '<div class="card"><h2>四、十二周训练安排 <span class="mini">重量为推演起步值，达标就按阶梯加重</span></h2>' +
      '<div class="muted txs">递进规则：同一重量做满组次 → 次数 +2 → 做满 → 重量 +2.5kg 回到 8 次；每 4 周减载一轮。' +
      '「今天练什么」以训练页为准（本表是你的全程地图）。</div></div>' +
      weeksHtml.join('') + adjust + checklist + src
  }
}
