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

    // ── 全局守卫：已登录但还没建档 → 一律先去建档 ──
    // 放在路由层而不是各页面里，这样连"手动改地址栏"都拦得住。
    // 没有档案时训练计划算不出来、饮食页会读 null 崩掉，所以这是硬门槛。
    const noGuard = ['onboard', 'login', 'recover']
    if (typeof Store !== 'undefined' && Store.isLoggedIn && Store.isLoggedIn()
      && !Store.hasProfile() && noGuard.indexOf(name) < 0) {
      if (this.current !== 'onboard') { location.hash = '#/onboard'; return }
    }

    const r = this.routes.find(x => x.path === name) || this.routes.find(x => x.path === 'home')
    if (!r) return
    // 未登录守卫：除 login/privacy 外，未登录走演示模式（M1 起改为强制跳登录）
    const modal = document.getElementById('modalbox')
    if (modal) modal.innerHTML = ''
    if (typeof WorkoutTimer !== 'undefined') WorkoutTimer.unmount()
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
    if (r.opts.noTab) {
      const bar = document.querySelector('#app .appbar')
      if (bar || document.getElementById('app')) {
        const back = document.createElement('button')
        back.className = 'page-back'; back.textContent = '‹ 返回洞府'
        back.onclick = () => this.go('home')
        ;(bar || document.getElementById('app')).prepend(back)
      }
    }
    if (typeof Tabbar !== 'undefined') Tabbar.mark(r.path)
    window.scrollTo(0, 0)
  },

  /** 顶部栏（统一渲染） */
  bar(title, sub, right) {
    return '<div class="appbar"><h1>' + Fmt.esc(title) +
      (right ? '<span class="grow"></span>' + right : '') + '</h1>' +
      (sub ? '<div class="sub">' + Fmt.esc(sub) + '</div>' : '') + '</div>'
  }
}
