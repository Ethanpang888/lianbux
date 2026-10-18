#!/usr/bin/env node
/* test-plan-backup.js —— 计划快照/多套保存纯函数回归（2026-10-17 新增）
 * 覆盖：深拷贝、单槽不覆盖、换回（migratePlan 跨 schema / weight 保留 / secret 清理 / slotExercises 保留）、
 *       savedPlans 上限、id 防撞、switchData 一致性、alignProfileToPlan
 */
const path = require('path')
const B = require(path.join(__dirname, '..', 'shared', 'plan-backup.js'))
const K = require(path.join(__dirname, '..', '..', '健身小程序', 'utils', 'kb.js'))

let pass = 0, fail = 0
const t = (name, cond) => { if (cond) { pass++ } else { fail++; console.log('  ❌ ' + name) } }

const profile = { nick: '测', gender: '男', age: 30, height: 180, weight: 80, goal: '增肌', exp: 'some', days: 4, home: '0', dietMode: '均衡' }
let plan = K.generatePlan(profile, { split: 'cpbsl', freq: 'w4', home: false })
plan.slotExercises = { '0': [{ oid: '', name: '面拉', sets: '3×15', custom: true }] }
const user = { profile: JSON.parse(JSON.stringify(profile)), plan: JSON.parse(JSON.stringify(plan)) }

// 1. makeBackup：建快照 + 深拷贝
const bk = B.makeBackup(user, 'home4')
t('快照建立', !!bk && bk.v === 1 && bk.fromSecretKey === 'home4')
user.plan.slotExercises['0'].push({ name: '改了' })
t('快照深拷贝（改 plan 不影响备份）', bk.plan.slotExercises['0'].length === 1)
t('已有备份不覆盖', B.makeBackup({ ...user, lastPlanBackup: bk }, 'x') === null)
t('无计划不备份', B.makeBackup({ profile }, 'x') === null)

// 2. 挂居家秘籍模拟（profile 与 plan 脱节）
const np = K.generatePlan(user.profile, { split: 'cpbsl', freq: 'c4', home: true })
np.cycleStart = '2026-10-17'
user.plan = np

// 3. restoreData
const r = B.restoreData(bk, user.profile)
t('换回原计划 split/freq', r.plan.split === 'cpbsl' && r.plan.freq === 'w4')
t('换回后 home=false', r.plan.home === false && r.profile.home === false)
t('slotExercises 保留（继续原进度）', (r.plan.slotExercises['0'] || []).length === 1)
t('cycleStart 保留', r.plan.cycleStart === plan.cycleStart)
t('secret 标记已删', !('secret' in r.profile))
user.profile.weight = 78.5
const r2 = B.restoreData(bk, user.profile)
t('weight 保留当前值（不被快照回滚）', r2.profile.weight === 78.5)
const bad = B.restoreData(null, user.profile)
t('坏备份返回 null', bad === null)

// 4. 跨 schema：备份降级成 schema 3 → 恢复后 migratePlan 升上来
const bk3 = JSON.parse(JSON.stringify(bk)); bk3.plan.schema = 3
const r3 = B.restoreData(bk3, user.profile)
t('跨 schema 恢复（migratePlan）', r3.plan.schema === K.PLAN_SCHEMA && r3.plan.split === 'cpbsl')

// 5. savedPlans：id 防撞 + 上限
const e1 = B.makeSavedEntry(user, '健身房四分化')
const e2 = B.makeSavedEntry(user, '居家三练')
t('id 唯一（同毫秒不撞）', e1.id !== e2.id)
const l1 = B.upsertSaved([], e1, 2)
const l2 = B.upsertSaved(l1, e2, 2)
t('上限 2：第三套被拒', B.upsertSaved(l2, B.makeSavedEntry(user, '第三套'), 2) === null)
t('上限内写入成功', l2.length === 2)
t('removeSaved', B.removeSaved(l2, e1.id).length === 1)

// 6. switchData：profile-plan 一致性 + weight 保留
const sw = B.switchData(l2[0], user.profile)
t('切换后 plan 与 profile.home 一致', sw.profile.home === !!sw.plan.home)
t('切换后 weight 保留', sw.profile.weight === 78.5)
t('切换后 secret 已删', !('secret' in sw.profile))

// 7. alignProfileToPlan
const p4 = B.alignProfileToPlan({ home: false, split: 'x' }, { home: true, split: 'cpbsl', freq: 'c4' })
t('align：home/split/freq 以 plan 为准', p4.home === true && p4.split === 'cpbsl' && p4.freq === 'c4')

console.log('════════════════════════════════════════════════')
console.log('  plan-backup 测试：' + pass + ' 通过 / ' + fail + ' 失败')
console.log('════════════════════════════════════════════════')
process.exit(fail ? 1 : 0)
