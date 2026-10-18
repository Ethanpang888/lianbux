/* src/pages/badges.js —— 徽章墙（2026-10-18 复查方案 D：条件/进度/解锁日期全展示，隐藏徽章保持神秘） */
const PageBadges = {
  render() {
    const u = Store.state.user
    const g = u.gamify || {}
    const owned = (g.badges || [])
    const lv = ENGINE.gamify.levelOf(g.exp || 0)
    const list = ENGINE.gamify.visibleBadges(ENGINE.gamify.BADGES, owned.map(b => b.k), lv.level)
      .map(b => Object.assign({}, b, { at: (owned.find(o => o.k === b.k) || {}).at || '', prog: ENGINE.gamify.badgeProgress(b, g.counters, g.streak) }))
    const gotN = list.filter(b => b.got).length

    const card = b => {
      const got = b.got
      const showProg = b.prog && b.prog.target > 1 && (!got || b.prog.cur > b.prog.target)
      const cur = b.prog ? Math.min(b.prog.cur, b.prog.target) : 0
      const pct = b.prog ? Math.min(100, Math.round(cur / b.prog.target * 100)) : (got ? 100 : 0)
      return '<details class="ex-card" style="padding:12px 14px;margin-top:8px">' +
        '<summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px">' +
          '<span>' + (got ? '🏅' : '🔒') + '</span>' +
          '<b style="flex:1">' + Fmt.esc(b.displayName) +
            ' <span class="tag ' + (b.tier === '金' ? 'gold' : (b.tier === '银' ? '' : 'gray')) + '">' + b.tier + '</span></b>' +
          '<span class="muted txs">' + (got ? '已解锁' : '+' + b.exp + ' EXP') + '</span>' +
        '</summary>' +
        '<div class="muted txs" style="margin-top:8px">' + Fmt.esc(b.displayCond) + '</div>' +
        (got
          ? '<div class="muted txs" style="margin-top:4px">' + (b.at ? '解锁于 ' + Fmt.esc(String(b.at).slice(0, 10)) + ' · ' : '') + '奖励已入账（+' + b.exp + ' 修为）</div>'
          : (showProg
            ? '<div class="expbar" style="margin-top:8px"><div class="expbar-fill" style="width:' + pct + '%"></div></div>' +
              '<div class="muted txs" style="margin-top:3px">' + cur + ' / ' + b.prog.target + '（' + pct + '%）</div>'
            : '<div class="muted txs" style="margin-top:4px">' + (b.prog ? '进度：' + b.prog.cur + ' / ' + b.prog.target : '达成后自动点亮') + '</div>')) +
      '</details>'
    }

    document.getElementById('app').innerHTML =
      Router.bar('徽章墙', '已解锁 ' + gotN + ' / ' + list.length) +
      '<div class="card"><div class="badge-grid">' +
      list.map(b => '<div class="badge-tile ' + (b.got ? '' : 'locked') + '">' +
        '<div class="badge-ic">' + (b.got ? '🏅' : '🔒') + '</div>' +
        '<span>' + Fmt.esc(b.displayName) + '</span></div>').join('') +
      '</div></div>' +
      '<div class="card"><h2>每一枚怎么拿</h2>' +
      '<div class="muted txs">点开看条件与当前进度。隐藏徽章达成条件保持神秘——练下去自然会亮。</div>' +
      list.map(card).join('') +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:20px">' +
        '<button class="btn ghost" onclick="Router.go(\'growth\')">成长总览</button>' +
        '<button class="btn line" onclick="Router.go(\'me\')">返回</button>' +
      '</div>'
  }
}
