/* src/api.js —— 云函数调用（走 HTTP 访问服务；不依赖任何前端 SDK）
 *
 * 约定：云函数统一返回 { ok: true, ... } 或 { ok: false, code }
 * 出错时抛出的 error 上带 code，页面用 Api.toast(err) 统一提示。
 */
const Api = {
  TIMEOUT: 12000,

  async call(url, action, data) {
    if (!Config.isConfigured()) { const e = new Error('NO_BACKEND'); e.code = 'NO_BACKEND'; throw e }
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer = ctl ? setTimeout(() => ctl.abort(), this.TIMEOUT) : null
    let res
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action }, data || {})),
        signal: ctl ? ctl.signal : undefined
      })
    } catch (err) {
      if (timer) clearTimeout(timer)
      const e = new Error('NETWORK')
      e.code = (err && err.name === 'AbortError') ? 'TIMEOUT' : 'NETWORK'
      throw e
    }
    if (timer) clearTimeout(timer)

    let r = null
    try { r = await res.json() } catch (e) { r = null }
    if (!r) { const e = new Error('BAD_RESPONSE'); e.code = 'SERVER'; throw e }
    if (r.ok === false) {
      const e = new Error(r.code || 'SERVER')
      e.code = r.code || 'SERVER'
      e.detail = r
      throw e
    }
    return r
  },

  auth(action, data) { return this.call(Config.authUrl(), action, data) },
  api(action, data) { return this.call(Config.apiUrl(), action, data) },

  /** AI 对话：回答要等模型想完，超时放宽到 75 秒（普通接口 12 秒不够） */
  async ai(action, data) {
    const old = this.TIMEOUT
    this.TIMEOUT = 75000
    try { return await this.call(Config.apiUrl(), action, data) }
    finally { this.TIMEOUT = old }
  },

  /** 把错误翻成人话（给用户看的） */
  toast(err) {
    const map = {
      NO_BACKEND: '云端还没配好，当前是本地演示模式',
      NETWORK: '网络不给力，稍后再试（数据不会丢）',
      TIMEOUT: '服务器响应超时，稍后再试',
      BAD_EMAIL: '邮箱格式好像不对',
      RATE_LIMIT: '发得太频繁了，等一会儿再试',
      LOCKED: '尝试次数过多，已锁定 15 分钟',
      CODE_WRONG: '验证码不对，再看看？',
      CODE_EXPIRED: '验证码过期了，重新获取一个',
      CODE_USED: '这个验证码已经用过了，重新获取',
      CODE_EMPTY: '先输入开通码',
      CODE_INVALID: '这个开通码不对，检查一下',
      CODE_REDEEMED: '这个开通码你已经用过了',
      CODE_EXHAUSTED: '这个开通码已经被用完',
      NEED_LOGIN: '先登录再开通，这样换设备也还在',
      NO_CODE: '请先获取验证码',
      AUTH_EXPIRED: '登录过期了，重新登录一下',
      NO_USER: '账号不存在',
      RECOVER_FAILED: '编号或恢复码不对',
      PLAYER_NO_BUSY: '同时注册的人太多，再试一次',
      SERVER_MISCONFIG: '服务端没配密钥（AUTH_SECRET），请联系管理员',
      SERVER: '服务器开小差了，稍后再试'
    }
    const code = (err && err.code) || 'SERVER'
    const msg = map[code] || (err && err.message) || '操作失败'
    if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg)
    return msg
  }
}
