/* src/router.js —— hash 路由（含登录守卫） */
const Router = {
  routes: [],
  current: '',

  reg(path, render, opts) { this.routes.push({ path, render, opts: opts || {} }); return this },

  start() {
    window.addEventListener('hashchange', () => this.go())
    this.go()
  },

  parse() {
    const h = (location.hash || '').replace(/^#\/?/, '')
    const parts = h.split('/').filter(Boolean)
    return { name: parts[0] || 'home', args: parts.slice(1) }
  },

  go(path) {
    if (typeof PageToday !== 'undefined' && this.current === 'today') PageToday.persistDraft()
    if (path) {
      const next = '#/' + path.replace(/^#?\/?/, '')
      if (location.hash !== next) { location.hash = next; return }
    }
    const { name, args } = this.parse()

    // 先浏览免费内容；个人训练、饮食与记录仍需要真实档案。
    const publicPages = ['home','secret','exlib','onboard','login','recover']
    const missingProfile = typeof Store !== 'undefined' && !Store.hasProfile()
    const preview = missingProfile && publicPages.indexOf(name) < 0 ||
      (Store.state.demo && ['home','today','diet'].includes(name))
    if (preview) {
      this.current = name
      document.body.dataset.page = name
      document.getElementById('tabbar').style.display = 'grid'
      const modal = document.getElementById('modalbox'); if (modal) modal.innerHTML = ''
      if (typeof FocusMode !== 'undefined') FocusMode.close()
      PageHome.renderGuest(name)
      if (typeof Tabbar !== 'undefined') Tabbar.mark(name)
      if (typeof WorkoutTimer !== 'undefined') WorkoutTimer.mount()
      window.scrollTo(0, 0)
      return
    }

    const r = this.routes.find(x => x.path === name) || this.routes.find(x => x.path === 'home')
    if (!r) return
    // 未登录守卫：除 login/privacy 外，未登录走演示模式（M1 起改为强制跳登录）
    const modal = document.getElementById('modalbox')
    if (modal) modal.innerHTML = ''
    if (typeof FocusMode !== 'undefined') FocusMode.close()
    this.current = r.path
    document.body.dataset.page = r.path
    document.getElementById('tabbar').style.display = (r.opts.noTab ? 'none' : 'grid')
    try {
      r.render(args)
    } catch (e) {
      console.error(e)
      document.getElementById('app').innerHTML =
        '<div class="card"><h2>页面出错了</h2><p class="muted">' + Fmt.esc(e.message) + '</p></div>'
    }
    if (r.opts.noTab && !r.opts.ownBack) {
      const bar = document.querySelector('#app .appbar')
      if (bar || document.getElementById('app')) {
        const back = document.createElement('button')
        back.className = 'page-back'; back.textContent = '‹ 返回洞府'
        back.onclick = () => this.go('home')
        ;(bar || document.getElementById('app')).prepend(back)
      }
    }
    if (typeof Tabbar !== 'undefined') Tabbar.mark(r.path)
    if (typeof WorkoutTimer !== 'undefined') WorkoutTimer.mount()
    window.scrollTo(0, 0)
  },

  /** 顶部栏（统一渲染） */
  bar(title, sub, right) {
    return '<div class="appbar"><h1>' + Fmt.esc(title) +
      (right ? '<span class="grow"></span>' + right : '') + '</h1>' +
      (sub ? '<div class="sub">' + Fmt.esc(sub) + '</div>' : '') + '</div>'
  }
}
