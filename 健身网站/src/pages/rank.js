/* src/pages/rank.js —— 排行榜：全国榜 / 同城榜 × 等级榜 / 连续榜 / 本周榜
 *
 * 为什么要有"同城"：对标竞品最抓人的一点就是「广州 · 你多少级」这种同城可比感。
 * 但我们的口径不一样 —— **只排坚持与容量**（等级 / 连续天数 / 本周训练量），
 * 不排体重、不排体型、不排体脂。榜上比的是"练没练"，不是"瘦没瘦"。
 *
 * 城市来自 profile.city，用户自选（不做定位：定位要授权、要备案，性价比太低）。
 */
const PageRank = {
  scope: 'city',        // 'city' | 'all'
  board: 'level',       // 'level' | 'streak' | 'volume'
  loading: false,
  rows: null,           // 云端返回的榜（null = 还没拉过）
  err: '',

  render() {
    const u = Store.state.user
    const p = u.profile || {}
    const g = ENGINE.gamify
    const city = g.normCity(p.city)
    // 没设城市时，同城榜退回全国榜，并把"去设置城市"顶出来
    const needCity = this.scope === 'city' && !city

    const board = g.BOARDS.find(b => b.k === this.board) || g.BOARDS[0]
    const data = g.rankBoard(this.pool(), {
      scope: needCity ? 'all' : this.scope,
      city: city,
      board: this.board,
      me: (u.account && u.account.uid) || (Store.state.demo ? 'me' : ''),
      limit: 50
    })

    const scopeTabs = [
      { k: 'city', name: '同城' + (city ? ' · ' + city : '') },
      { k: 'all', name: '全国' }
    ].map(t => '<button class="chip ' + (this.scope === t.k ? 'on' : '') +
      '" data-scope="' + t.k + '">' + Fmt.esc(t.name) + '</button>').join('')

    const boardTabs = g.BOARDS.map(b => '<button class="chip ' + (this.board === b.k ? 'on' : '') +
      '" data-board="' + b.k + '">' + Fmt.esc(b.name) + '</button>').join('')

    const meCard = data.me
      ? '<div class="card me-rank">' +
          '<div class="mr-left"><span class="mr-rank">' + Fmt.esc(g.rankWords(data.me.rank)) + '</span>' +
            '<span class="muted txs">' + Fmt.esc(data.me.title) +
            (data.me.noStr ? ' · ' + Fmt.esc(data.me.noStr) : '') +
            (data.me.founding ? ' · ⭐创始玩家' : '') + '</span></div>' +
          '<div class="mr-right"><b>' + (this.board === 'streak' ? data.me.streak + ' 天'
            : this.board === 'volume' ? data.me.volume + ' 吨' : 'Lv ' + data.me.level) + '</b>' +
            '<span class="muted txs">' + Fmt.esc(board.name) + ' · 共 ' + data.total + ' 人</span></div>' +
        '</div>'
      : ''

    const rows = data.list.map(r =>
      '<div class="rank-row' + (r.isMe ? ' me' : '') + '">' +
        '<span class="rk">' + (r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank) + '</span>' +
        '<span class="rn">' +
          '<b>' + Fmt.esc(r.nick) + '</b>' +
          (r.founding ? '<span class="tag gold">创始</span>' : '') +
          '<span class="muted txs">' + Fmt.esc(r.title) +
            (r.noStr ? ' · ' + Fmt.esc(r.noStr) : '') +
            (this.scope === 'all' && r.city ? ' · ' + Fmt.esc(r.city) : '') + '</span>' +
        '</span>' +
        '<span class="rv" id="rankVal">' +
          (this.board === 'streak' ? r.streak + '<i>天</i>'
            : this.board === 'volume' ? r.volume + '<i>吨</i>'
            : 'Lv' + r.level) +
        '</span>' +
      '</div>').join('')

    const thinNote = data.thin
      ? '<div class="muted txs" style="margin-top:10px">' +
        (this.scope === 'city'
          ? '同城目前只有 ' + data.total + ' 个人在榜 —— 人还少，等练友多起来才热闹。'
          : '目前上榜 ' + data.total + ' 人，人还少。') + '</div>'
      : ''

    const privacy = '<div class="card"><h2>这个榜怎么排的</h2>' +
      UI.li('等级榜', '看练得久（累计经验）', '') +
      UI.li('连续榜', '看谁没断过（当前连续打卡天数）', '') +
      UI.li('本周榜', '看这周谁练得狠（本周训练容量）', '') +
      '<div class="muted txs" style="margin-top:8px">' +
      '· <b>不排体重、不排体型、不排体脂</b> —— 榜上比的是"练没练"，不是"瘦没瘦"，' +
      '这样才不至于把人逼到节食上。<br>' +
      '· 上榜只显示昵称、玩家编号、城市和数值，不显示任何身体数据。<br>' +
      '· 城市是你自己填的，我们没有开定位。</div></div>'

    document.getElementById('app').innerHTML =
      Router.bar('排行榜', board.desc + ' · ' +
        (this.scope === 'city' ? (city || '未设置城市') : '全部玩家')) +

      (needCity
        ? '<div class="card warn-card"><h2>先选个城市</h2>' +
          '<p class="muted txs">同城榜要知道你哪个城市。选一个（不会用来做别的，也不开定位）：</p>' +
          '<div class="chips" id="cityChips">' + g.CITIES.map(c =>
            '<button class="chip" data-city="' + Fmt.esc(c) + '">' + Fmt.esc(c) + '</button>').join('') +
          '</div></div>'
        : '') +

      '<div class="card">' +
        (Store.state.demo
          ? '<div class="muted txs" style="margin-bottom:8px"><span class="tag warn">演示数据</span> 榜上是示例玩家，注册后进入真实排行榜。</div>'
          : '') +
        '<div class="chips" id="scopeTabs">' + scopeTabs + '</div>' +
        '<div class="chips" id="boardTabs">' + boardTabs + '</div>' +
        (this.err ? '<div class="muted txs">云端读取失败：' + Fmt.esc(this.err) + '（下面显示的是本机示例）</div>' : '') +
        meCard +
        (rows || UI.empty('榜上还没有人')) +
        thinNote +
      '</div>' +
      privacy +
      '<div style="margin-bottom:20px"><button class="btn line" onclick="Router.go(\'home\')">返回</button></div>'

    this.bind()
  },

  /** 榜单数据源：登录拉云端，否则用本机示例（保证没部署也看得见长什么样） */
  pool() {
    if (this.rows && this.rows.length) return this.rows
    return Store.demoBoard()
  },

  bind() {
    document.querySelectorAll('#scopeTabs button[data-scope]').forEach(b => {
      b.onclick = () => { this.scope = b.dataset.scope; this.render() }
    })
    document.querySelectorAll('#boardTabs button[data-board]').forEach(b => {
      b.onclick = () => { this.board = b.dataset.board; this.render() }
    })
    document.querySelectorAll('#cityChips button[data-city]').forEach(b => {
      b.onclick = () => {
        const u = Store.state.user
        u.profile = Object.assign({}, u.profile, { city: b.dataset.city })
        Store.saveCloud({ profile: u.profile })
        UI.toast('城市已设为 ' + b.dataset.city)
        this.render()
      }
    })
  },

  /** 进页面时顺手拉一次云端榜（拉不到就用本机示例，不阻塞渲染） */
  refresh() {
    if (Store.state.demo) return
    const u = Store.state.user
    Api.api('leaderboard', {
      token: Store.state.token, scope: this.scope,
      city: ENGINE.gamify.normCity((u.profile || {}).city), board: this.board, limit: 50
    }).then(r => {
      if (r && r.list) { this.rows = r.list; this.err = ''; this.render() }
    }).catch(e => { this.err = Api.toast(e); this.render() })
  }
}
