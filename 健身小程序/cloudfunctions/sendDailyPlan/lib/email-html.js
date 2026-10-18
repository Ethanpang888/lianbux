// cloudfunctions/sendDailyPlan/lib/email-html.js
// 邮件内容渲染（纯函数，不依赖 wx-server-sdk / nodemailer）——
// 抽出来是为了能单独跑预览、也方便以后加内容时不必碰发送逻辑。
const calc = require('./calc.js')
const kb = require('./kb.js')
const dietLib = require('./diet.js')

const BRAND = '练不虚Gym'
const SLOGAN = 'AI 生成你的增肌减脂计划'
const C = { green: '#0e9f6e', blue: '#185FA5', amber: '#b45309', red: '#c0392b', sub: '#888' }

function dayIndexFromStart(cycleStart, today) {
  const s = new Date(cycleStart + 'T00:00:00').getTime()
  const t = new Date(today + 'T00:00:00').getTime()
  return Math.floor((t - s) / 86400000)
}
function esc(s) { return String(s == null ? '' : s) }

// —— 今日训练 ——
function buildTodaySection(plan, profile, home, today) {
  if (!plan || !plan.micro || !plan.micro.length) {
    return { title: '今日训练', html: '<p style="color:' + C.sub + '">暂无计划，打开小程序完成测评即可生成。</p>', text: '暂无计划' }
  }
  let dayIndex = dayIndexFromStart(plan.cycleStart || today, today)
  if (dayIndex < 0) dayIndex = 0
  const day = kb.dayContent(plan, dayIndex, profile, !!home)
  const planName = plan.programName || plan.templateName || '训练计划'
  const dayNo = dayIndex + 1

  if (day.type === 'rest') {
    return {
      title: '今日训练（第' + dayNo + '天 · ' + planName + '）',
      html: '<p style="font-size:16px;margin:0 0 6px"><b>休息日 🌿</b></p>' +
        '<p style="color:#555;margin:0">' + esc(day.note || '散步 / 拉伸 / 筋膜放松，恢复也是训练的一部分。') + '</p>',
      text: '休息日：' + (day.note || '恢复也是训练的一部分')
    }
  }

  const rows = (day.exercises || []).map(e => {
    const tag = e.role === '主项' ? '主项 · ' : e.role === '核心' ? '核心 · ' : ''
    return '<tr>' +
      '<td style="padding:8px 6px;border-bottom:1px solid #eee">' + esc(e.name) + '</td>' +
      '<td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;white-space:nowrap">' + esc(e.sets || '3×12') + '</td>' +
      '<td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;color:' + C.green + ';white-space:nowrap">' + (e.rest ? e.rest + 's' : '—') + '</td>' +
      '<td style="padding:8px 6px;border-bottom:1px solid #eee;color:' + C.sub + '">' + tag + esc(e.part) + ' · ' + esc(e.equipment || '无器械') + '</td>' +
      '</tr>'
  }).join('')

  const warmupHtml = (day.warmup && day.warmup.items && day.warmup.items.length)
    ? '<p style="font-size:13px;color:' + C.green + ';margin:6px 0">🔥 热身 ' + (day.warmup.minutes || 8) + ' min：' + esc(day.warmup.items.join(' → ')) + '</p>'
    : ''
  const deloadHtml = day.deload
    ? '<p style="font-size:13px;color:' + C.red + ';margin:6px 0">⚠️ 减载周：正式组数已降到 60%，热身与时长不变；先砍辅助组数、不缩短组间休息。</p>'
    : ''
  const srcHtml = (day.src === '推演')
    ? '<p style="font-size:12px;color:' + C.amber + ';margin:2px 0">（本编排为推演版：源方没有四/五分化的原文排法，按谭成义推拉腿逻辑推演）</p>'
    : ''

  const html = '<p style="font-size:16px;margin:0 0 4px"><b>第' + dayNo + '天 · ' + esc(day.focus) + ' · ' + esc(planName) + '</b></p>' +
    srcHtml + deloadHtml + warmupHtml +
    '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
    '<thead><tr style="color:' + C.green + '">' +
    '<th style="text-align:left;padding:6px">动作</th>' +
    '<th style="text-align:center;padding:6px">组数×次数</th>' +
    '<th style="text-align:center;padding:6px">组间</th>' +
    '<th style="text-align:left;padding:6px">部位/器械</th></tr></thead>' +
    '<tbody>' + (rows || '<tr><td colspan="4" style="padding:8px;color:' + C.sub + '">无动作</td></tr>') + '</tbody></table>' +
    (day.cardio ? '<p style="font-size:13px;color:' + C.blue + ';margin:8px 0">🏃 有氧（选做）：' + esc(day.cardio.type) + ' · ' + esc(day.cardio.detail) + ' · 每周 ' + esc(day.cardio.perWeek) + '</p>' : '')

  const text = '第' + dayNo + '天 · ' + (day.focus || '训练') + (day.deload ? '（减载周）' : '') + '\n' +
    ((day.warmup && day.warmup.items) ? '热身：' + day.warmup.items.join(' / ') + '\n' : '') +
    (day.exercises || []).map(e => '• ' + e.name + '  ' + (e.sets || '3×12') +
      (e.rest ? '  组间' + e.rest + 's' : '') + '  (' + (e.role ? e.role + ' · ' : '') + (e.equipment || '无器械') + ')').join('\n')

  return { title: '今日训练（第' + dayNo + '天 · ' + planName + '）', html, text }
}

// —— 今日饮食：宏量目标（锚定 TDEE，与 App 完全一致）——
function buildDietSection(profile, dietState) {
  const e = calc.energyPlan(profile || {}, dietState || {})
  const adj = dietState || {}
  const r1 = v => Math.round(v * 10) / 10   // 老档案里可能存着 -0.30000000000000004 这类浮点脏值，展示前必须归整
  const offset = []
  if (adj.carbAdj) offset.push('碳水偏移 ' + (adj.carbAdj > 0 ? '+' : '') + r1(adj.carbAdj) + 'g/kg')
  if (adj.proteinAdj) offset.push('蛋白偏移 ' + (adj.proteinAdj > 0 ? '+' : '') + r1(adj.proteinAdj) + 'g/kg')
  const cell = (k, v, strong) => '<td style="padding:8px">' + k + '</td><td style="padding:8px;text-align:right;' +
    (strong ? 'font-weight:bold;color:' + C.green : '') + '">' + v + '</td>'
  const html = '<p style="font-size:16px;margin:0 0 4px"><b>今日饮食目标</b>（谭成义宏量模型）</p>' +
    '<p style="font-size:12px;color:' + C.sub + ';margin:0 0 8px">基础代谢 ' + e.bmr + ' × 活动系数 ' + e.activity.factor +
      '（' + e.activity.name + '）= 每日消耗 <b>' + e.tdee + '</b> kcal → 热量目标 <b>' + e.kcal + '</b> kcal（缺口 ' + e.deficit + '）</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;background:#f7fbf9;border-radius:8px">' +
    '<tr>' + cell('蛋白质', e.protein + ' g', true) + cell('碳水', e.carb + ' g', true) + '</tr>' +
    '<tr>' + cell('脂肪', e.fat + ' g', true) + cell('合计', e.kcal + ' kcal', false) + '</tr>' +
    '</table>' +
    (offset.length ? '<p style="font-size:12px;color:' + C.sub + ';margin-top:6px">微饿循环：' + offset.join('，') + '（每天在 App 内记录饥饿感会自动微调）</p>' : '')
  const text = '蛋白质 ' + e.protein + 'g / 碳水 ' + e.carb + 'g / 脂肪 ' + e.fat + 'g / 约 ' + e.kcal + ' kcal' +
    '（每日消耗 ' + e.tdee + '，缺口 ' + e.deficit + '）' +
    (offset.length ? '（微饿偏移：' + offset.join('，') + '）' : '')
  return { html, text }
}

// —— 今日饮食：分餐 / 配菜 ——
// seed 用「年内第几天」，保证同一天收到的一样、隔天会换菜
function buildMenuSection(profile, dietState, seed, isMember) {
  let mode = (profile && profile.dietMode) || 'simple'
  // 配好菜（三餐定制菜单）是会员权益：非会员邮件一律按「只给克数」发
  if (mode === 'recipe' && !isMember) mode = 'simple'
  const macros = calc.energyPlan(profile || {}, dietState || {})
  let day = null
  try { day = dietLib.buildDay(macros, mode, { seed: seed || 0 }) } catch (e) { day = null }
  if (!day) return { html: '', text: '' }

  const isRecipe = day.mode === 'recipe'
  const head = '<p style="font-size:16px;margin:0 0 4px"><b>今天吃什么</b>（' +
    (isRecipe ? '已按你的目标配好份量' : '只给克数，食材自己选') + '）</p>'
  const rows = (day.meals || []).map(m => {
    const got = m.got || { protein: 0, carb: 0, fat: 0, kcal: 0 }
    let inner = ''
    if (isRecipe) {
      inner = (m.dishes || []).map(d =>
        '<div style="font-size:13px;margin:3px 0">' +
        '<span style="font-weight:bold">' + esc(d.name) + '</span>' +
        '<span style="color:' + C.sub + '"> — ' + esc(d.items.join('、')) + '</span></div>'
      ).join('')
    } else {
      inner = '<div style="font-size:13px;color:' + C.green + ';font-weight:bold;margin:3px 0">蛋白 ' + m.protein + 'g · 碳水 ' + m.carb + 'g · 脂肪 ' + m.fat + 'g</div>' +
        (m.hints || []).map(h => '<div style="font-size:12px;color:' + C.sub + ';margin:2px 0">' + esc(h) + '</div>').join('')
    }
    return '<div style="padding:10px 0;border-top:1px solid #f0f0f0">' +
      '<div style="font-size:14px;font-weight:bold;margin-bottom:4px">' + esc(m.mealName) +
      '<span style="font-weight:normal;color:' + C.sub + ';font-size:12px"> · ' + got.kcal + 'kcal</span></div>' +
      inner + '</div>'
  }).join('')

  const sum = '<p style="font-size:12px;color:' + C.sub + ';margin-top:8px">全天合计 蛋白' + day.got.protein + 'g · 碳水' + day.got.carb + 'g · 脂肪' + day.got.fat + 'g · ' + day.got.kcal + 'kcal（目标 蛋白' + day.target.protein + 'g · 碳水' + day.target.carb + 'g · 脂肪' + day.target.fat + 'g）</p>'

  const html = head + rows + sum +
    '<p style="font-size:12px;color:' + C.sub + ';margin-top:6px">' + esc(day.note) + '</p>'

  const text = '【今天吃什么】\n' + (day.meals || []).map(m => {
    if (isRecipe) return m.mealName + '：' + (m.dishes || []).map(d => d.name + '(' + d.items.join('、') + ')').join(' + ')
    return m.mealName + '：蛋白' + m.protein + 'g/碳水' + m.carb + 'g/脂肪' + m.fat + 'g\n  ' + (m.hints || []).join('\n  ')
  }).join('\n')
  return { html, text }
}

// —— 买菜清单（明日预告邮件用）：把三餐食材合并去重算总量 ——
// dishes 的 items 是「食物 Gg」字符串，这里解析回「食物 → 总克数」
function buildShoppingListSection(profile, dietState, seed) {
  const macros = calc.energyPlan(profile || {}, dietState || {})
  let day = null
  try { day = dietLib.buildDay(macros, 'recipe', { seed: seed || 0 }) } catch (e) { return null }
  if (!day || day.mode !== 'recipe') return null

  const bag = {}
  ;(day.meals || []).forEach(m => (m.dishes || []).forEach(dish =>
    (dish.items || []).forEach(it => {
      const m2 = String(it).match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*g$/)
      if (m2) bag[m2[1]] = (bag[m2[1]] || 0) + parseFloat(m2[2])
    })))
  const items = Object.keys(bag).sort((a, b) => bag[b] - bag[a])
  if (!items.length) return null

  const row = n => {
    const g = Math.round(bag[n])
    return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:4px 0">' +
      '<input type="checkbox" style="accent-color:' + C.green + '">' +
      '<span>' + esc(n) + '</span>' +
      '<span style="color:#888;margin-left:auto">' + g + 'g</span></label>'
  }
  const html = '<p style="font-size:16px;margin:0 0 4px"><b>🛒 买菜清单</b>（明天三餐的食材，勾着买）</p>' +
    '<div style="background:#fffaf0;border:1px dashed #e0c98f;border-radius:8px;padding:10px 14px">' +
    items.map(row).join('') +
    '</div>' +
    '<p style="font-size:12px;color:' + C.sub + ';margin-top:6px">份量已按你的宏量配好；同类食材可自由替换（等量蛋白换等量蛋白）。</p>'
  const text = '【买菜清单（明天）】\n' + items.map(n => '☐ ' + n + ' ' + Math.round(bag[n]) + 'g').join('\n')
  return { html, text }
}

// —— 会员每周复盘（周日随每日邮件附带）——
// checkins 集合：{ _openid, date, trained, weight, sleepHours, waterMl, ... }
function buildWeeklySection(openid, today, db) {
  if (!db || !openid) return Promise.resolve(null)
  const since = new Date(new Date(today + 'T00:00:00+08:00').getTime() - 6 * 86400000)
  const pad = n => String(n).padStart(2, '0')
  const sinceStr = since.getFullYear() + '-' + pad(since.getMonth() + 1) + '-' + pad(since.getDate())
  return db.collection('checkins').where({ _openid: openid, date: db.command.gte(sinceStr) }).limit(50).get()
    .then(res => {
      const rows = res.data || []
      if (!rows.length) return null

  const trained = rows.filter(r => r.trained).length
  const weights = rows.filter(r => r.weight > 0).sort((a, b) => a.date < b.date ? -1 : 1)
  const w0 = weights.length ? weights[0].weight : null
  const w1 = weights.length ? weights[weights.length - 1].weight : null
  const dw = (w0 && w1) ? Math.round((w1 - w0) * 10) / 10 : null
  const sleeps = rows.filter(r => r.sleepHours > 0)
  const avgSleep = sleeps.length ? Math.round(sleeps.reduce((s, r) => s + r.sleepHours, 0) / sleeps.length * 10) / 10 : null

  // 建议（口径与 App 内「体重趋势调控」一致）
  let tip = '本周节奏稳定，按计划继续即可。'
  if (dw !== null) {
    if (dw <= -1.2) tip = '本周掉重 ' + dw + 'kg，速度偏快：优先把碳水加回来（每天 +0.25g/kg），保住肌肉。'
    else if (dw >= 0.6) tip = '本周体重 +0.6kg：检查油和零食，或把碳水每天 −0.25g/kg。'
    else tip = '体重基本持平（' + (dw > 0 ? '+' : '') + dw + 'kg）：增肌减脂同步期这正是理想曲线。'
  }

  const li = (k, v) => '<div style="font-size:13px;margin:3px 0">' + k + '：<b>' + v + '</b></div>'
  const html = '<p style="font-size:16px;margin:0 0 4px"><b>📈 每周复盘</b>（会员权益）</p>' +
    '<div style="background:#f7fbf9;border-radius:8px;padding:10px 14px">' +
    li('训练次数', trained + ' / 7 天') +
    li('体重变化', w0 ? (w0 + 'kg → ' + w1 + 'kg（' + (dw > 0 ? '+' : '') + dw + 'kg）') : '本周未记录体重') +
    li('平均睡眠', avgSleep ? avgSleep + ' 小时' : '未记录') +
    '<div style="font-size:13px;margin-top:8px;color:#0b7d56"><b>💡 建议</b>：' + tip + '</div>' +
    '</div>'
  const text = '【每周复盘】\n训练 ' + trained + '/7 天' +
    (w0 ? '，体重 ' + w0 + '→' + w1 + 'kg（' + (dw > 0 ? '+' : '') + dw + 'kg）' : '') +
    '\n建议：' + tip
  return { html, text }
    }).catch(() => null)
}

// —— 整封邮件 ——
function buildHtml(today, todaySec, dietSec, menuSec, weeklySec) {
  const block = '<div style="margin-bottom:18px">'
  return '<div style="max-width:560px;margin:0 auto;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#222">' +
    '<div style="background:' + C.green + ';color:#fff;padding:18px 20px;border-radius:12px 12px 0 0">' +
      '<div style="font-size:18px;font-weight:bold">' + BRAND + ' · 今日计划</div>' +
      '<div style="font-size:13px;opacity:.9;margin-top:4px">' + esc(today) + ' · ' + SLOGAN + '</div>' +
    '</div>' +
    '<div style="background:#fff;padding:18px 20px;border:1px solid #eee;border-top:0;border-radius:0 0 12px 12px">' +
      block + todaySec.html + '</div>' +
      block + dietSec.html + '</div>' +
      (menuSec && menuSec.html ? block + menuSec.html + '</div>' : '') +
      (weeklySec && weeklySec.html ? block + weeklySec.html + '</div>' : '') +
      '<div style="font-size:12px;color:#aaa;margin-top:16px;padding-top:12px;border-top:1px dashed #eee">' +
        '打开微信小程序「' + BRAND + '」查看动作 GIF、记录打卡、调整微饿循环。<br>本邮件每日自动发送；想改「配好菜 / 只给克数」或退订，在小程序「我的 → 每日邮件订阅」里改。' +
      '</div>' +
    '</div>' +
  '</div>'
}

function buildText(today, todaySec, dietSec, menuSec, weeklySec) {
  return BRAND + ' · 今日计划（' + today + '）\n\n' +
    '【' + todaySec.title + '】\n' + todaySec.text + '\n\n' +
    '【今日饮食目标】\n' + dietSec.text + '\n\n' +
    (menuSec && menuSec.text ? menuSec.text + '\n\n' : '') +
    (weeklySec && weeklySec.text ? weeklySec.text + '\n\n' : '') +
    '打开微信小程序「' + BRAND + '」查看动作 GIF、记录打卡。'
}

module.exports = { buildTodaySection, buildDietSection, buildMenuSection, buildWeeklySection, buildShoppingListSection, buildHtml, buildText, dayIndexFromStart }
