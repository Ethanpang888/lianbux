// cloudfunctions/adminApi/index.js
// 管理后台专用 API（网页后台 → 本云函数 → 数据库）
//
// 安全模型：网页带口令（ADMIN_TOKEN 环境变量），口令不对一律拒绝。
// 部署后必须在云开发控制台给 adminApi 配置环境变量 ADMIN_TOKEN（自定义口令）。
//
// actions:
//   list       拉全部用户摘要（邮箱/订阅/会员/档案/计划）
//   setMember  { openid, level, months }  标会员（到期日自动按月数算）
//   clearMember{ openid }                 取消会员

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysStr(days) {
  const d = new Date(Date.now() + days * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

exports.main = async (event = {}) => {
  // —— 口令校验 ——
  const token = process.env.ADMIN_TOKEN
  if (!token) return { ok: false, error: '未配置 ADMIN_TOKEN 环境变量' }
  if (!event.token || event.token !== token) return { ok: false, error: '口令错误' }

  try {
    // —— 用户列表 ——
    if (event.action === 'list') {
      const res = await db.collection('users').limit(1000).get()
      const users = (res.data || []).map(u => ({
        openid: u._openid || u._id,
        email: u.email || '',
        subscribed: !!u.subscribed,
        member: u.member || null,
        isMember: !!(u.member && u.member.level && (!u.member.expiresAt || u.member.expiresAt >= todayStr())),
        profile: {
          gender: (u.profile || {}).gender || '', age: (u.profile || {}).age || '',
          height: (u.profile || {}).height || '', weight: (u.profile || {}).weight || '',
          goal: (u.profile || {}).goal || '', exp: (u.profile || {}).exp || '',
          dietMode: (u.profile || {}).dietMode || 'simple', bodyType: (u.profile || {}).bodyType || ''
        },
        plan: u.plan ? { name: u.plan.templateName || u.plan.programName || '', split: u.plan.split || '', home: !!u.plan.home } : null,
        dietState: { carbAdj: (u.dietState || {}).carbAdj || 0, proteinAdj: (u.dietState || {}).proteinAdj || 0 }
      }))
      // 订阅中的排前面，其次会员
      users.sort((a, b) => (b.subscribed - a.subscribed) || ((b.isMember ? 1 : 0) - (a.isMember ? 1 : 0)))
      return { ok: true, users, total: users.length, today: todayStr() }
    }

    // —— 标会员 ——
    if (event.action === 'setMember') {
      const { openid, level, months } = event
      const VALID = ['月度', '半年', '年费']
      if (!openid || VALID.indexOf(level) < 0) return { ok: false, error: '参数错误' }
      const monthsN = Number(months) || (level === '月度' ? 1 : level === '半年' ? 6 : 12)
      const member = { level, expiresAt: addDaysStr(Math.round(monthsN * 30.4)), updatedAt: todayStr() }
      await db.collection('users').doc(openid).update({ data: { member } })
      return { ok: true, openid, member }
    }

    // —— 取消会员 ——
    if (event.action === 'clearMember') {
      const { openid } = event
      if (!openid) return { ok: false, error: '参数错误' }
      await db.collection('users').doc(openid).update({ data: { member: _.remove() } })
      return { ok: true, openid, member: null }
    }

    return { ok: false, error: '未知 action' }
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) }
  }
}
