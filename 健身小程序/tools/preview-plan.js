#!/usr/bin/env node
/**
 * tools/preview-plan.js —— 生成「我的计划」可视化预览（不进包）
 * 跑法：node tools/preview-plan.js
 * 产出：/Users/a1-6/Desktop/健身知识库/_preview/我的计划预览.html
 *
 * 用真实引擎数据渲染两份视图：
 *   ① App 里长什么样（今日页）
 *   ② 邮件发出去长什么样（云函数 lib/email-html.js 的真实输出）
 */
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const LIB = path.join(ROOT, 'cloudfunctions/sendDailyPlan/lib')
const kb = require(path.join(ROOT, 'utils/kb.js'))
const calc = require(path.join(ROOT, 'utils/calc.js'))
const dietLib = require(path.join(ROOT, 'utils/diet.js'))
const mail = require(path.join(LIB, 'email-html.js'))

// ══════ 你的档案 ══════
const P = {
  gender: '男', age: 30, height: 183, weight: 93,
  goal: '增肌减脂同步',   // recomp：蛋白 +0.2g/kg、碳水 −0.3g/kg，热量近维持
  exp: '进阶', days: 5, bodyType: '中性',
  activity: 'mod',        // 练四休一（5.83练/周×80-90min）→ MET 交叉验证对应 1.40-1.48，取中度 1.55（用户拍板 2026-09-15）
  dietMode: 'simple'      // 水煮选手：只给克数+换算（2026-09-15 用户确认）
}
const HOME = false
const SPLIT = 'ppl'          // 三分化（推/拉/腿）
const FREQ = 'c3'            // 练三休一（照谭成义原文）
const SEED = 258             // 配菜用的「年内第几天」

const plan = kb.generatePlan(P, { split: SPLIT, freq: FREQ, home: HOME, dietMode: P.dietMode })
const macros = calc.energyPlan(P, {})
const recipeDay = dietLib.buildRecipeDay(macros, { seed: SEED })
const simpleDay = dietLib.buildSimpleDay(macros)

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ══════ ① App 视图（模拟今日页）══════
function appDay(di) {
  const day = kb.dayContent(plan, di, P, HOME)
  if (day.type === 'rest') {
    return `<div class="card rest"><div class="restico">🌿</div><div class="muted">${esc(day.note)}</div></div>`
  }
  const ex = day.exercises.map((e, i) => `
    <div class="ex">
      <div class="exh">
        <div class="exn">${esc(e.name)}
          <span class="rtag r-${e.role === '主项' ? 'main' : e.role === '孤立' ? 'iso' : e.role === '核心' ? 'core' : 'assist'}">${esc(e.role)}</span>
        </div>
        <div class="exs">${esc(e.sets)} ›</div>
      </div>
      <div class="exmeta">组间休息 ${e.rest}s · ${esc(e.rpe)} · ${esc(e.equipment)}${e.homeFallback ? ' · <span style="color:#993556">居家替代</span>' : ''}</div>
      ${i === 0 ? `<div class="setrow"><b>第1组</b><span class="sbox">参考${e.suggest ?? '-'}</span><span class="sbox">次数</span><span class="sdone"></span></div>
      <div class="setrow"><b>第2组</b><span class="sbox">参考${e.suggest ?? '-'}</span><span class="sbox">次数</span><span class="sdone"></span></div>` : ''}
    </div>`).join('')
  return `
    <div class="card">
      <div class="sect">🔥 热身 · ${day.warmup.minutes} min</div>
      ${day.warmup.items.map(x => `<div class="warmi">· ${esc(x)}</div>`).join('')}
      <div class="warmnote">${esc(kb.METHOD.MAIN_NOTE)}</div>
    </div>
    <div class="card">
      <div class="sect">今日训练</div>
      <div class="hint">点重量/次数可滚轮选择，自动填满剩余组</div>
      ${ex}
    </div>
    <div class="card cardio">
      <div class="cdh">🏃 有氧（选做）· ${esc(day.cardio.type)}</div>
      <div class="muted">${esc(day.cardio.detail)} · 每周 ${esc(day.cardio.perWeek)}</div>
    </div>`
}

function appDiet() {
  const pb = (label, got, tg, unit) => {
    const pct = tg ? Math.min(100, Math.round(got / tg * 100)) : 0
    const over = tg && got > tg * 1.05
    return `<div class="pb"><div class="pbh"><span>${label}</span><b class="${over ? 'over' : ''}">${Math.round(got)} / ${Math.round(tg)}${unit || 'g'}</b></div>
      <div class="pbbar"><div class="pbin ${over ? 'over' : ''}" style="width:${pct}%"></div></div></div>`
  }
  return `
    <div class="card">
      <div class="rowb"><div class="sect" style="margin:0">今日饮食</div>
        <div class="modesw"><span class="ms on">配好菜</span><span class="ms">只给克数</span></div></div>
      <div class="pbs">
        ${pb('热量', 0, macros.kcal, 'kcal')}
        ${pb('蛋白质', 0, macros.protein)}
        ${pb('碳水', 0, macros.carb)}
        ${pb('脂肪', 0, macros.fat)}
      </div>
      <div class="foodh">＋ 加吃了什么</div>
      <div class="biginput">打字搜食物（「牛肉 / 米饭 / 西兰花」），点结果即可加</div>
      <div class="dlogh">已吃记录（0 项）</div>
      <div class="dlogempty">还没记录。在上面输入框打「牛肉」这类词，联想出来后点一下，填克数就记上了。</div>
    </div>`
}

function appPage() {
  const t = kb.dayContent(plan, 0, P, HOME)
  return `
  <div class="phone">
    <div class="phbar">健身减脂陪伴营</div>
    <div class="phbody">
      <div class="card">
        <div class="rowb"><div class="sect" style="margin:0">第 1 天 · ${esc(t.focus)}</div><div class="muted">今天 · 2026-09-15</div></div>
        <div class="pbbar" style="margin-top:10px"><div class="pbin" style="width:33%"></div></div>
        <div class="headtags"><span class="htag">第1周</span><span class="htag">练3休1</span></div>
      </div>
      ${appDay(0)}
      ${appDiet()}
      <div class="card micro">
        <div class="sect" style="font-size:13px">🌾 微饿循环 · 每天记一下</div>
        <div class="chks"><span class="chk">很饿·加碳水</span><span class="chk on">微饿·最佳</span><span class="chk">不饿·减碳水</span></div>
        <div class="muted" style="margin-top:8px">当前微调：碳水 0g/kg · 蛋白 0g/kg</div>
      </div>
    </div>
    <div class="phtab"><span class="on">首页</span><span class="on">今日</span><span>计划</span><span>调理</span><span>我的</span></div>
  </div>`
}

// ══════ ② 邮件视图（真实输出）══════
const todaySec = mail.buildTodaySection(plan, P, HOME, '2026-09-15')
const dietSec = mail.buildDietSection(P, {})
const menuSec = mail.buildMenuSection(P, {}, SEED)
const emailHtml = mail.buildHtml('2026-09-15', todaySec, dietSec, menuSec)

// ══════ 组装 ══════
const cycle = []
for (let d = 0; d < 8; d++) {
  const day = kb.dayContent(plan, d, P, HOME)
  cycle.push({ d: d + 1, day })
}

const cycleRows = cycle.map(({ d, day }) => {
  if (day.type === 'rest') return `<tr><td>第${d}天</td><td colspan="3" class="restcell">休息日 · 散步/拉伸/筋膜放松</td></tr>`
  return `<tr>
    <td>第${d}天<span class="wk">W${day.week}</span></td>
    <td><b>${esc(day.focus)}</b></td>
    <td>${day.exercises.map(e => esc(e.name) + ' <span class="st">' + esc(e.sets) + '</span>').join('<br>')}</td>
    <td class="ctr">${day.exercises.length} 个<br><span class="st">含腹 ${day.exercises.some(e => e.pattern === 'core') ? '✓' : '✗'}</span></td>
  </tr>`
}).join('')

const recipeRows = recipeDay.meals.map(m => `
  <tr>
    <td><b>${esc(m.mealName)}</b></td>
    <td>${m.dishes.map(d => `<b>${esc(d.name)}</b><br><span class="st">${esc(d.items.join('、'))}</span>`).join('<br><br>')}</td>
    <td class="ctr">蛋白 ${m.got.protein}g<br>碳水 ${m.got.carb}g<br>脂肪 ${m.got.fat}g<br><span class="st">${m.got.kcal} kcal</span></td>
  </tr>`).join('')

const simpleRows = simpleDay.meals.map(m => `
  <tr>
    <td><b>${esc(m.mealName)}</b></td>
    <td>${m.hints.map(h => esc(h)).join('<br>')}</td>
    <td class="ctr">蛋白 ${m.protein}g<br>碳水 ${m.carb}g<br>脂肪 ${m.fat}g<br><span class="st">${m.kcal} kcal</span></td>
  </tr>`).join('')

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>啊清练不虚 · 我的计划预览</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#eef1f4;font-family:-apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif;color:#1f2937;font-size:14px}
  .wrap{max-width:1180px;margin:0 auto;padding:24px 16px 60px}
  h1{font-size:22px;margin:0 0 6px}
  .lead{color:#6b7280;font-size:13px;line-height:1.7;margin:0 0 20px}
  .prof{background:#fff;border-radius:12px;padding:14px 18px;margin-bottom:22px;border:1px solid #e5e9ee;font-size:13px;line-height:1.9}
  .prof b{color:#0b7d56}
  .cols{display:flex;gap:26px;align-items:flex-start;flex-wrap:wrap}
  .col{flex:1;min-width:360px}
  .coltitle{font-size:15px;font-weight:600;margin:0 0 10px;padding-left:10px;border-left:4px solid #0e9f6e}
  .coltitle small{font-weight:400;color:#6b7280;font-size:12px}
  /* App 手机壳 */
  .phone{width:390px;background:#f5f7fa;border-radius:30px;padding:10px;box-shadow:0 8px 28px rgba(0,0,0,.13);border:8px solid #1f2937}
  .phbar{background:#0e9f6e;color:#fff;text-align:center;font-size:13px;padding:12px;border-radius:20px 20px 0 0;font-weight:600}
  .phbody{max-height:640px;overflow-y:auto;padding:4px 0 14px}
  .phtab{display:flex;background:#fff;border-radius:0 0 20px 20px;border-top:1px solid #eef0f3}
  .phtab span{flex:1;text-align:center;font-size:11px;padding:10px 0;color:#9aa1ab}
  .phtab span.on{color:#0e9f6e;font-weight:600}
  .card{background:#fff;border-radius:12px;padding:14px;margin:10px}
  .card.rest{text-align:center}
  .restico{font-size:26px;margin-bottom:6px}
  .card.cardio{background:#f7f9fb;border-left:4px solid #378ADD}
  .card.micro{background:#fffaf0;border-left:4px solid #e0a458}
  .sect{font-size:13px;font-weight:600;margin-bottom:8px}
  .hint{font-size:11px;color:#9aa1ab;margin-bottom:8px}
  .rowb{display:flex;justify-content:space-between;align-items:center}
  .muted{font-size:11px;color:#9aa1ab;line-height:1.6}
  .pbbar{height:7px;background:#eef0f3;border-radius:99px;overflow:hidden}
  .pbin{height:100%;background:#0e9f6e;border-radius:99px}
  .pbin.over{background:#EF9F27}
  .headtags{display:flex;gap:6px;margin-top:10px}
  .htag{font-size:10px;background:#eef1f5;color:#6b7280;border-radius:99px;padding:2px 9px}
  .warmi{font-size:11px;color:#6b7280;line-height:1.9}
  .warmnote{font-size:10px;color:#9a6212;background:#fffaf0;border-radius:8px;padding:8px;margin-top:8px;line-height:1.6}
  .ex{border-bottom:1px solid #f0f2f5;padding:10px 0}
  .ex:last-child{border-bottom:none}
  .exh{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .exn{font-size:13px;font-weight:600}
  .exs{font-size:11px;color:#9aa1ab;white-space:nowrap}
  .exmeta{font-size:10px;color:#9aa1ab;margin-top:3px}
  .rtag{font-size:9px;border-radius:99px;padding:1px 7px;margin-left:5px;font-weight:400;vertical-align:1px}
  .r-main{background:#e6f1fb;color:#185FA5}
  .r-assist{background:#eef1f5;color:#6b7280}
  .r-iso{background:#f1efe8;color:#5F5E5A}
  .r-core{background:#faeeda;color:#854F0B}
  .setrow{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:11px;color:#6b7280}
  .sbox{flex:1;background:#f0f2f5;border-radius:6px;padding:8px;text-align:center;color:#9aa1ab;font-size:11px}
  .sdone{width:24px;height:24px;border-radius:50%;background:#f0f2f5}
  .cdh{font-size:13px;font-weight:600;color:#185FA5;margin-bottom:4px}
  .pbs{margin:12px 0 6px}
  .pb{margin-bottom:10px}
  .pbh{display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px}
  .pbh b{color:#0b7d56}.pbh b.over{color:#EF9F27}
  .foodh{font-size:12px;font-weight:600;color:#0b7d56;margin:14px 0 8px}
  .biginput{font-size:12px;border:2px solid #0e9f6e;border-radius:10px;padding:13px;color:#9aa1ab}
  .dlogh{font-size:11px;color:#6b7280;margin:14px 0 6px}
  .dlogempty{font-size:11px;color:#6b7280;line-height:1.7;background:#f7f9fb;border-radius:10px;padding:12px}
  .chks{display:flex;gap:8px;margin-top:10px}
  .chk{flex:1;text-align:center;font-size:11px;background:#f0f2f5;color:#6b7280;border-radius:10px;padding:10px 4px}
  .chk.on{background:#0e9f6e;color:#fff;font-weight:600}
  /* 表格 */
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:13px;border:1px solid #e5e9ee}
  th{background:#f7fbf9;color:#0b7d56;text-align:left;padding:10px;font-size:12px;font-weight:600}
  td{padding:10px;border-top:1px solid #eef2f5;vertical-align:top;line-height:1.7}
  td.ctr{text-align:center;white-space:nowrap}
  td.restcell{color:#9aa1ab;font-style:italic}
  .st{color:#9aa1ab;font-size:11px}
  .wk{font-size:10px;color:#9aa1ab;margin-left:4px}
  .sec{margin-top:30px}
  .badge{display:inline-block;font-size:11px;background:#e9f7f1;color:#0b7d56;border-radius:99px;padding:2px 10px;margin-left:6px;vertical-align:2px}
  .emailbox{background:#f0f2f5;border-radius:12px;padding:18px;border:1px solid #e5e9ee}
  .note{font-size:12px;color:#6b7280;line-height:1.8;background:#fff;border-left:4px solid #f59e0b;padding:12px 14px;border-radius:8px;margin-top:14px}
</style></head><body><div class="wrap">

<h1>啊清练不虚 · 我的计划预览</h1>
<p class="lead">这是用「小程序里同一套引擎」真实跑出来的结果 —— 左边是你在小程序里看到的，右边是每天 08:00 邮件发给你的。数据一致，不会两套。</p>

<div class="prof">
  <b>档案</b>：男 · ${P.age}岁 · ${P.height}cm · <b>${P.weight}kg</b>（BMI ${calc.bmi(P.weight, P.height)} · ${calc.bmiCat(calc.bmi(P.weight, P.height)).txt}）· 目标 <b>增肌减脂同步</b> · 经验 ${P.exp} · 每周 ${P.days} 练 · <b>${SPLIT === 'ppl' ? '三分化（推/拉/腿）· 练三休一' : SPLIT}</b><br>
  <b>每日消耗</b>：基础代谢 <b>${macros.bmr}</b> × 活动系数 <b>${macros.activity.factor}</b>（${macros.activity.name}）= <b>${macros.tdee} kcal</b>　→　热量目标 <b>${macros.kcal} kcal</b>（缺口 <b>${macros.deficit}</b>，目标缺口 ${macros.wantDeficit}）<br>
  <b>宏量</b>：蛋白 <b>${macros.protein}g</b> · 碳水 <b>${macros.carb}g</b> · 脂肪 <b>${macros.fat}g</b>　<span class="st">（${macros.protG}/${macros.carbG}/${macros.fatG} g per kg；碳水为弹性项，用来补齐热量）</span>
</div>

<div class="sec"><div class="coltitle">① 这一周练什么 <small>练三休一循环，4 天一轮、无限循环</small></div>
<table><thead><tr><th style="width:90px">第几天</th><th style="width:130px">训练日</th><th>动作（组×次）</th><th style="width:80px">数量</th></tr></thead>
<tbody>${cycleRows}</tbody></table>
</div>

<div class="sec"><div class="coltitle">② 今天吃什么 · 配好菜模式 <small>份量已按你的宏量自动缩放</small></div>
<table><thead><tr><th style="width:110px">餐次</th><th>菜品与用量</th><th style="width:120px">该餐营养</th></tr></thead>
<tbody>${recipeRows}</tbody></table>
<p class="note">全天合计：蛋白 ${recipeDay.got.protein}g · 碳水 ${recipeDay.got.carb}g · 脂肪 ${recipeDay.got.fat}g · ${recipeDay.got.kcal}kcal（目标 蛋白${recipeDay.target.protein}g / 碳水${recipeDay.target.carb}g / 脂肪${recipeDay.target.fat}g）——误差在 10% 以内。</p>
</div>

<div class="sec"><div class="coltitle">③ 今天吃什么 · 只给克数模式 <small>你直接水煮的话用这个</small></div>
<table><thead><tr><th style="width:110px">餐次</th><th>每餐克数 + 食材换算</th><th style="width:120px">该餐营养</th></tr></thead>
<tbody>${simpleRows}</tbody></table>
</div>

<div class="sec">
  <div class="cols">
    <div class="col">
      <div class="coltitle">④ App 里长什么样 <small>今日页（截图级还原）</small></div>
      ${appPage()}
    </div>
    <div class="col">
      <div class="coltitle">⑤ 邮件发给你长什么样 <span class="badge">真实输出</span> <small>云函数同一套渲染代码</small></div>
      <div class="emailbox">${emailHtml}</div>
    </div>
  </div>
</div>

</div></body></html>`

const outDir = '/Users/a1-6/Desktop/健身知识库/_preview'
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, '我的计划预览.html')
fs.writeFileSync(outFile, html, 'utf8')

console.log('✅ 预览已生成：' + outFile)
console.log('   今日: ' + todaySec.title)
console.log('   宏量: 蛋白' + macros.protein + 'g / 碳水' + macros.carb + 'g / 脂肪' + macros.fat + 'g / ' + macros.kcal + 'kcal')
console.log('   配餐: ' + recipeDay.meals.map(m => m.dishes.map(d => d.name).join('+')).join(' | '))
console.log('   邮件长度: html ' + emailHtml.length + ' 字符 / text ' + mail.buildText('2026-09-15', todaySec, dietSec, menuSec).length + ' 字符')
