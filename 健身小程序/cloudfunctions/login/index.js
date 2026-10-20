// 档案仅按云端注入的 OPENID 读取；客户端不能指定其他用户或修改权益。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const FIELDS = ['profile', 'plan', 'constitution', 'tcmResult', 'dietState',
  'lastPlanBackup', 'savedPlans', 'activeSavedId', 'breakShown', 'email', 'subscribed']
exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, message: '微信登录未完成，请重新进入' }
  const action = event.action
  if (action === 'loadUser') {
    const snap = await cloud.database().collection('users').where({ _id: OPENID }).limit(1).get()
    return { ok: true, user: (snap.data || [])[0] || null }
  }
  if (action === 'saveUser') {
    const patch = event.patch
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return { ok: false, message: '档案数据无效，请重试' }
    }
    const clean = {}
    FIELDS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(patch, key)) clean[key] = patch[key]
    })
    if (!Object.keys(clean).length) return { ok: false, message: '没有可保存的档案内容' }
    const db = cloud.database()
    await db.runTransaction(async tx => {
      const ref = tx.collection('users').doc(OPENID)
      let current = {}
      try {
        const snap = await ref.get()
        current = snap.data || {}
      } catch (err) {
        // 服务端不存在才创建；其他数据库故障必须传回，不能覆盖旧数据。
        const message = String(err && (err.errMsg || err.message) || '')
        if (!/document(?: does)? not exist|document.*not found|cannot find document with _id|文档不存在/i.test(message)) throw err
      }
      const next = Object.assign({}, current, clean, { _openid: OPENID })
      delete next._id
      await ref.set({ data: next })
    })
    return { ok: true }
  }
  return { openid: OPENID }
}
