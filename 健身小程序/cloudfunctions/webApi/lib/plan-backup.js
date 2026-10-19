/* plan-backup.js —— 计划快照 / 多套保存（两端同源：健身网站/shared/ ≡ 健身小程序/utils/）
 *
 * 数据结构（存 user，云端字段无白名单，直接可写）：
 *   user.lastPlanBackup = { v:1, plan, profile, fromSecretKey, at }   // 秘籍快照，单槽
 *   user.savedPlans    = [ { id, name, createdAt, plan, profileRef } ] // 显式保存的多套
 *   user.activeSavedId = 'sp_xxx'                                      // 当前用的保存套（'' = 不在）
 *
 * 规矩：
 *   - 快照只在空的时候建（换回 = 回到挂秘籍之前的最初状态，不覆盖）
 *   - 换回/切换一律过 kb.migratePlan（schema 兼容、保留 cycleStart/slotExercises = 继续原进度）
 *   - 恢复 profile 时保留当前 weight（体重是生理事实，不能被快照回滚），删掉 secret 标记
 *   - profile.home 以 plan.home 为权威对齐（修挂秘籍造成的 profile-plan 脱节）
 */
// 打包环境（bundle loader）用 './kb.js'；纯 Node（测试脚本）回退到相对路径
let kb
try { kb = require('./kb.js') } catch (e) { kb = require('../../健身小程序/utils/kb.js') }

const clone = o => JSON.parse(JSON.stringify(o))
const todayStr = () => {
  const d = new Date()
  const p = n => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

/** profile 与 plan 的一致性对齐：split/freq/home 以 plan 为准写回 profile */
function alignProfileToPlan(profile, plan) {
  if (!profile || !plan) return profile
  if (plan.split) profile.split = plan.split
  if (plan.freq) profile.freq = plan.freq
  profile.home = !!plan.home
  return profile
}

/**
 * 挂秘籍前建快照。只在没有备份时建（换回语义 = 回到最初）。
 * 返回 backup 对象（不需要备份时返回 null）。
 */
function makeBackup(user, secretKey) {
  const u = user || {}
  if (u.lastPlanBackup && u.lastPlanBackup.plan) return null // 已有备份，不覆盖
  if (!u.plan || !u.plan.micro) return null // 没有正经计划，没东西可备份
  const profile = clone(u.profile || {})
  if (u.profile) for (const k of Object.keys(u.profile)) profile[k] = clone(u.profile[k])
  alignProfileToPlan(profile, u.plan)
  delete profile.secret
  return { v: 1, plan: clone(u.plan), profile: profile, fromSecretKey: secretKey || '', at: todayStr() }
}

/**
 * 从快照恢复：返回 { plan, profile }。
 * - plan 过 migratePlan（跨 schema 版本兼容，保留 cycleStart/slotExercises）
 * - profile 整体恢复但 weight 保留当前值、删 secret 标记
 */
function restoreData(backup, curProfile) {
  if (!backup || !backup.plan || !backup.plan.micro) return null
  const plan = kb.migratePlan(backup.profile || {}, clone(backup.plan))
  const p = clone(backup.profile || {})
  if (curProfile && curProfile.weight != null) p.weight = curProfile.weight
  delete p.secret
  return { plan: plan, profile: p }
}

/** 生成一条保存套（深拷贝当前 plan + profile 关键值） */
function makeSavedEntry(user, name) {
  const u = user || {}
  if (!u.plan || !u.plan.micro) return null
  const p = u.profile || {}
  return {
    id: 'sp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name || ((u.plan.templateName || u.plan.split) + ' · ' + (u.plan.freq || '')),
    createdAt: todayStr(),
    plan: clone(u.plan),
    profileRef: {
      goal: p.goal || '', home: !!u.plan.home,
      split: u.plan.split || '', freq: u.plan.freq || '', dietMode: p.dietMode || ''
    }
  }
}

/** 插入/更新保存套（同 id 覆盖），超上限返回 null 不写入 */
function upsertSaved(list, entry, limit) {
  const arr = Array.isArray(list) ? clone(list) : []
  const i = arr.findIndex(x => x.id === entry.id)
  if (i >= 0) arr[i] = entry
  else {
    if (arr.length >= limit) return null
    arr.unshift(entry)
  }
  return arr
}

function removeSaved(list, id) {
  return (Array.isArray(list) ? list : []).filter(x => x.id !== id)
}

/**
 * 切到某套保存计划：返回 { plan, profile }（由页面写入 user）。
 * 当前 profile 只保留 weight/生理字段，目标/场景/分化频率取自 profileRef。
 */
function switchData(entry, curProfile) {
  if (!entry || !entry.plan) return null
  const plan = kb.migratePlan((entry.profileRef) || {}, clone(entry.plan))
  const p = Object.assign({}, curProfile || {}, {
    goal: (entry.profileRef && entry.profileRef.goal) || (curProfile && curProfile.goal) || '',
    home: !!plan.home,
    split: plan.split || '',
    freq: plan.freq || '',
    dietMode: (entry.profileRef && entry.profileRef.dietMode) || (curProfile && curProfile.dietMode) || ''
  })
  if (curProfile && curProfile.weight != null) p.weight = curProfile.weight
  delete p.secret
  return { plan: plan, profile: p }
}

module.exports = { makeBackup, restoreData, makeSavedEntry, upsertSaved, removeSaved, switchData, alignProfileToPlan }
