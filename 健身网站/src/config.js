/* src/config.js —— 前端可配置项（集中一处，别散落在各文件里）
 *
 * 为什么用「云函数 HTTP 访问服务」而不是 CloudBase Web SDK：
 *   1. SDK 要求在小程序后台配「安全来源」白名单，而我们的预览域名每次部署都会变 → 每次都要重配
 *   2. HTTP 访问服务给的是**固定域名**（https://<环境ID>.service.tcloudbase.com/<路径>），跨域由云函数返回 CORS 头
 *   3. 鉴权是我们自己签的 token（见 shared/authkit.js），不依赖任何登录态 SDK
 *   4. 前端零依赖，页面体积小、不会被 CDN 变更影响
 */
const Config = {
  ENV: 'cloud1-d7gtp1mv1bfcc25df',

  // ⚠️ 域名必须用「腾讯云开发平台 → HTTP 网关 → 路由管理」里显示的那个默认域名。
  //   2026-09-22 实测：新环境的默认域名已从 <环境ID>.service.tcloudbase.com
  //   变成 <环境ID>-<数字>.ap-<地域>.app.tcloudbase.com —— 写错就连不上，而且报错很含糊。
  API_HOST: 'https://cloud1-d7gtp1mv1bfcc25df-1469515685.ap-shanghai.app.tcloudbase.com',
  AUTH_PATH: '/auth',
  API_PATH: '/api',

  /** 允许用 ?api=https://xxx 临时切换（联调用，不写进本地） */
  _override() {
    try {
      const m = String((location.search || '')).match(/[?&]api=([^&#]+)/)
      if (m) return decodeURIComponent(m[1]).replace(/\/+$/, '')
    } catch (e) { /* 忽略 */ }
    return ''
  },
  host() { return this._override() || this.API_HOST },
  authUrl() { return this.host() + this.AUTH_PATH },
  apiUrl() { return this.host() + this.API_PATH },

  // 未配后端时（或网络不通）自动降级为本地演示模式，页面永远可用
  isConfigured() { return !!this.host() }
}
