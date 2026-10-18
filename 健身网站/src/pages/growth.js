/* src/pages/growth.js —— 成长总览（2026-10-18 复查方案第一批）
 *
 * 回答用户三个问题：我现在到哪了 / 下一步解锁什么 / 这周任务完成得怎么样。
 * 数据全部来自引擎与账号（levelOf/REALMS/CHAR_STAGES/WEEK_TASKS/BADGES），不伪造进度。
 * 不新增底部导航：首页「查看成长」入口直达。
 */
const PageGrowth = {
  render() {
    const u = Store.state.user
    const g = u.gamify || {}
    const lv = ENGINE.gamify.levelOf(g.exp || 0)
    const realm = ENGINE.gamify.realmOf(lv.level)
    const maxed = lv.level >= ENGINE.gamify.MAX_LEVEL

    // —— 下一节点（真实门槛；满级不显示负数）——
    let nextRealm = null
    if (!maxed) {
      const rs = ENGINE.gamify.REALMS.filter(r => r.from > lv.level).sort((a, b) => a.from - b.from)
      nextRealm = rs[0] || null
    }
    const stages = PageHome.CHAR_STAGES || []
    const nextStage = maxed ? null : stages.filter(s => s.at > lv.level).sort((a, b) => a.at - b.at)[0] || null

    // —— 周任务（weekTask 不是本周则按 0 展示）——
    const week = Fmt.weekKey(Fmt.todayStr())
    const wt = (g.weekTask && g.weekTask.week === week) ? g.weekTask : {}
    const tasks = ENGINE.gamify.WEEK_TASKS.map(t => ({
      name: t.name, target: t.target, exp: t.exp,
      cur: Number(wt[t.key]) || 0,
      paid: ((wt.paid || []).indexOf(t.key) >= 0)
    }))

    // —— 徽章进度摘要（明细在徽章墙）——
    const owned = (g.badges || [])
    const counters = g.counters || {}
    const badges = ENGINE.gamify.visibleBadges(ENGINE.gamify.BADGES, owned.map(b => b.k), lv.level)
      .map(b => Object.assign({}, b, { at: (owned.find(o => o.k === b.k) || {}).at || '', prog: ENGINE.gamify.badgeProgress(b, counters, g.streak) }))
    const gotN = badges.filter(b => b.got).length

    const pct = Math.max(0, Math.min(100, Math.round(lv.pct || 0)))
    const nodeRows = []
    if (nextRealm) nodeRows.push(['下一境界', '「' + nextRealm.name + '」 · Lv.' + nextRealm.from + ' 起', nextRealm.note])
    if (nextStage) nodeRows.push(['形象焕新', 'Lv.' + nextStage.at + ' —— ' + nextStage.name + '期', '换一张新的修行形象'])
    nodeRows.push(['每周里程碑', '每 10 级一座碑', '纯记载 · 无额外奖励'])

    document.getElementById('app').innerHTML =
      Router.bar('成长总览', '境界 · 节点 · 这一周') +
      // ① 我在哪
      '<div class="card">' +
        '<div class="row between" style="align-items:baseline"><h2 style="margin:0">' + Fmt.esc(realm.name) + ' · Lv.' + lv.level + '</h2>' +
        '<span class="muted txs">累计修为 ' + Fmt.num(g.exp || 0) + '</span></div>' +
        '<div class="expbar" style="margin-top:10px"><div class="expbar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="muted txs" style="margin-top:6px">' + (maxed
          ? '已到顶（Lv.99 练不虚）—— 这条路的尽头是继续练下去'
          : '本级进度 ' + Fmt.num(lv.cur || 0) + ' / ' + Fmt.num(lv.next || 0) + ' · 再攒 ' + Fmt.num(lv.toNext) + ' 修为升 Lv.' + (lv.level + 1)) + '</div>' +
        '<div class="muted txs" style="margin-top:4px">' + Fmt.esc(realm.note || '') + '</div>' +
      '</div>' +
      // ② 下一步解锁什么
      '<div class="card"><h2>前面的节点</h2>' +
      nodeRows.map(r => '<div class="pn-row" style="margin-top:8px"><span class="k">' + r[0] + '</span><span class="v"><b>' + Fmt.esc(r[1]) + '</b><br><span class="muted txs">' + Fmt.esc(r[2]) + '</span></span></div>').join('') +
      '<div class="muted txs" style="margin-top:8px">形象共 ' + stages.length + ' 阶（' + stages.map(s => 'Lv.' + s.at).join(' / ') + '）；当前 ' + Fmt.esc(PageHome.charStageOf(lv.level).name) + '期。</div>' +
      '</div>' +
      // ③ 这一周
      '<div class="card"><h2>本周任务 <span class="mini">每项 +' + tasks[0].exp + ' 修为</span></h2>' +
      tasks.map(t => {
        const p = Math.min(100, Math.round(t.cur / t.target * 100))
        return '<div style="margin-top:10px">' +
          '<div class="row between" style="font-size:13px"><b>' + Fmt.esc(t.name) + '</b>' +
          '<span class="muted txs">' + (t.paid ? '<span class="tag">已入账 ✓</span>' : '+' + t.exp + ' EXP') + '</span></div>' +
          '<div class="expbar" style="margin-top:5px"><div class="expbar-fill" style="width:' + p + '%"></div></div>' +
          '<div class="muted txs" style="margin-top:3px">' + Math.min(t.cur, t.target) + ' / ' + t.target + '</div>' +
        '</div>'
      }).join('') +
      '<div class="muted txs" style="margin-top:8px">任务每周一清零重算；按你真实记录的打卡数据结算，不用手动领取。</div>' +
      '</div>' +
      // ④ 徽章摘要 + 入口
      '<div class="card"><h2>徽章 <span class="mini">' + gotN + ' / ' + badges.length + ' 已解锁</span></h2>' +
      badges.filter(b => b.got).slice(-6).reverse().map(b =>
        '<div class="muted txs" style="margin-top:4px">🏅 ' + Fmt.esc(b.displayName) +
        (b.at ? ' <span class="muted">' + Fmt.esc(String(b.at).slice(0, 10)) + ' 解锁</span>' : '') + '</div>').join('') ||
        '<div class="muted txs">还没有徽章——完成第一次训练就有第一枚。</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:20px">' +
        '<button class="btn ghost" onclick="Router.go(\'badges\')">徽章墙（条件与进度）</button>' +
        '<button class="btn line" onclick="Router.go(\'home\')">回首页</button>' +
      '</div>'
  }
}
