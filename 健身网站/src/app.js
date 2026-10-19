/* src/app.js —— 启动与路由注册
 *
 * 启动策略（先给内容，再升级）：
 *   1. 同步：读本地缓存 / 生成演示数据 → 立刻渲染，页面不会白屏
 *   2. 异步：后台尝试恢复登录态 → 成功就重渲染当前页
 *   这样即使云端没配好、或网络很慢，用户打开就能用。
 */
;(function () {
  async function boot() {
    if (typeof ENGINE === 'undefined') {
      document.getElementById('app').innerHTML =
        '<div class="card"><h2>引擎未加载</h2><p class="muted">请先执行 <code>node build/bundle-engine.js</code> 与 <code>node build/build.js</code></p></div>'
      return
    }
    window.addEventListener('pagehide', () => { if (Router.current === 'today') PageToday.persistDraft() })
    Store.load()
    Store.applyTheme()
    Store.ensureDemo()

    Tabbar.render()
    Router
      .reg('home', () => PageHome.render(), { tab: true })
      .reg('today', a => PageToday.render(a), { tab: true })
      .reg('diet', () => PageDiet.render(), { tab: true })
      .reg('mealref', () => PageDiet.refPage(), { noTab: true })
      .reg('records', () => PageRecords.render(), { tab: true })
      .reg('me', () => PageMe.render(), { tab: true })
      .reg('login', () => PageLogin.render(), { noTab: true })
      .reg('recover', () => PageLogin.renderRecover(), { noTab: true })
      .reg('badges', () => PageBadges.render(), { noTab: true })
      .reg('growth', () => PageGrowth.render(), { noTab: true })
      .reg('rank', () => PageRank.render(), { noTab: true })
      .reg('onboard', () => PageOnboard.render(), { noTab: true })
      .reg('pro', () => PagePro.render(), { noTab: true })
      .reg('coach', () => PageCoach.render(), { noTab: true })
      .reg('ai', () => PageAi.render(), { noTab: true })
      .reg('secret', a => PageSecret.render(a), { noTab: true })
      .reg('plus', () => PagePlus.render(), { noTab: true })
      .reg('plan', () => PagePlan.render(), { noTab: true })
      .reg('plan12', () => PagePlan12.render(), { noTab: true })
      .reg('exlib', () => PageExlib.render(), { noTab: true })
      .start()

    console.log('[练不虚] ENGINE 指纹', ENGINE.__md5, '构建于', ENGINE.__build)

    // 后台恢复登录态；变了就重渲染当前页
    const changed = await Store.restoreSession()
    if (changed) { Router.go(); Tabbar.render() }
    if (Store.state.lastError) console.warn('[练不虚] 同步提示：', Store.state.lastError)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()
})();
