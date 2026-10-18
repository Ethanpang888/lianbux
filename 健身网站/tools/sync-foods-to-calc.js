#!/usr/bin/env node
/* tools/sync-foods-to-calc.js —— 把引擎食物库（1246 条）同步到桌面端热量计算器
 *
 * 背景：桌面计算器（热量计算器.html / 网页版 / .app 内）各有一份拷贝，内嵌 87 条旧食物表；
 *      引擎 kb.js 的 FOODS 才是真相源（《中国食物成分表》第6版 + 别名 303 条）。
 *
 * 做什么：
 *   1. 引擎 FOODS → 计算器短格式 {n,k,p,c,f,fb,cat,a?}
 *      - 字段映射：name→n, kcal→k, protein→p, carbs→c, fat→f, fiber→fb
 *      - ⚠️ 引擎里 88 条早期条目 cat 为 undefined → 用旧表的分类按名字映射兜底，
 *        再兜不住的走启发式（蛋白/脂肪坚果），最后落「其他」
 *   2. 替换三份 html 里的 `const FOODS = [...];` 行（幂等，可重跑）
 *   3. 搜索支持别名（f.a）——搜索行由本脚本一并替换
 *
 * 用法：node tools/sync-foods-to-calc.js   （改完引擎食物库后重跑一次即可）
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..') // 健身知识库/
const kb = require(path.join(ROOT, '健身小程序', 'utils', 'kb.js'))

const TARGETS = [
  path.join(ROOT, '热量计算器.html'),
  path.join(ROOT, '热量计算器-网页版', 'index.html'),
  path.join(ROOT, '热量计算器.app', 'Contents', 'Resources', '热量计算器.html'),
  path.join(ROOT, '健身网站', 'calc.html')
]

// ── 1. 从现有计算器 html 提取旧表（拿它的人工分类做 undefined 兜底）──
const oldHtml = fs.readFileSync(TARGETS[0], 'utf8')
const m = oldHtml.match(/const FOODS = (\[.*?\]);/)
if (!m) { console.error('✗ 在计算器里找不到 FOODS 行'); process.exit(1) }
const OLD = JSON.parse(m[1])
const oldCat = {}
OLD.forEach(f => { oldCat[f.n] = f.cat })

// ── 2. 转格式 ──
function catOf(f) {
  if (f.cat) return f.cat
  if (oldCat[f.name]) return oldCat[f.name]
  // 启发式兜底（按营养形状）
  if (f.protein >= 8 && f.fat < 25) return '蛋白'
  if (f.kcal >= 300 && f.fat >= 25) return '脂肪坚果'
  return '其他'
}

const CAT_ORDER = ['蛋白', '主食', '蔬菜', '水果', '脂肪坚果', '其他']
const round1 = x => Math.round(x * 10) / 10

const out = kb.FOODS.map(f => {
  const o = {
    n: f.name,
    k: f.kcal,
    p: round1(f.protein),
    c: round1(f.carbs),
    f: round1(f.fat),
    fb: round1(f.fiber || 0),
    cat: catOf(f)
  }
  if (f.alias && f.alias.length) o.a = f.alias
  return o
}).sort((a, b) => {
  const d = CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat)
  return d !== 0 ? d : a.n.localeCompare(b.n, 'zh')
})

const line = 'const FOODS = ' + JSON.stringify(out) + ';'

// ── 3b. UI：平时只列常吃的（与网站 diet.js 的 COMMON 同一份名单），搜索才弹全部 ──
const COMMON = {
  蛋白: ['鸡胸肉', '鸡腿', '鸡蛋', '牛肉(瘦)', '猪里脊', '三文鱼', '鳕鱼', '虾', '豆腐', '牛奶', '酸奶'],
  主食: ['米饭(熟)', '馒头', '面条(熟)', '红薯', '紫薯', '土豆(蒸)', '燕麦片', '玉米(鲜)', '全麦面包', '山药', '糙米饭(熟)'],
  蔬菜: ['西兰花', '菠菜', '番茄', '黄瓜', '生菜', '白菜', '油麦菜', '香菇', '胡萝卜', '青椒', '冬瓜'],
  脂肪坚果: ['花生', '核桃', '杏仁', '腰果', '橄榄油', '牛油果', '芝麻子(黑)', '黄油', '南瓜子'],
  水果: ['香蕉', '苹果', '蓝莓', '橙子', '葡萄', '西瓜', '猕猴桃', '火龙果', '梨', '桃'],
  其他: ['蜂蜜', '白砂糖', '可乐', '花生酱']
}
const COMMON_LINE = 'const COMMON = ' + JSON.stringify(COMMON) + ';'
// 渲染行：不搜索 → 严格按 COMMON[分类] 的名单与顺序显示（黄油这类引擎分类异常的条目不会串 tab）；搜索 → 弹全部联想（含别名）
// 幂等：html 里可能是「最老版（无别名）」「上一版（COMMON_FLAT）」两种现状，都替换成目标版
const RENDER_A = 'const list = q ? FOODS.filter(f=>f.n.toLowerCase().includes(q)) : FOODS.filter(f=>f.cat===CAT)'
const RENDER_B = 'const list = q ? FOODS.filter(f=>f.n.toLowerCase().includes(q) || (f.a && f.a.some(x=>x.toLowerCase().includes(q)))) : FOODS.filter(f=>f.cat===CAT)'
const RENDER_B2 = 'const list = q ? FOODS.filter(f=>f.n.toLowerCase().includes(q) || (f.a && f.a.some(x=>x.toLowerCase().includes(q)))) : FOODS.filter(f=>f.cat===CAT && COMMON_FLAT.has(f.n))'
const RENDER_TARGET = "const list = q ? FOODS.filter(f=>f.n.toLowerCase().includes(q) || (f.a && f.a.some(x=>x.toLowerCase().includes(q)))) : (COMMON[CAT]||[]).map(n=>FOODS.find(f=>f.n===n)).filter(Boolean)"
const EMPTY_OLD = "|| '<div class=\"empty\">没搜到 → 用下方自定义添加</div>'"
const EMPTY_NEW = "|| (q ? '<div class=\"empty\">没搜到 → 用下方自定义添加</div>' : '<div class=\"empty\">这里只放常吃的 —— 这一类的其他食物用上方搜索框打字找</div>')"

// ── 3. 写回三份文件 ──
const SEARCH_NEW = RENDER_TARGET

let changed = 0
for (const t of TARGETS) {
  let html = fs.readFileSync(t, 'utf8')
  if (!/const FOODS = \[.*\];/.test(html)) { console.error('✗ 未命中 FOODS 行：' + t); continue }
  // 幂等清理：历史运行可能叠加了多份 COMMON / COMMON_FLAT 行 → 全部删光（const 重复声明会让脚本崩）
  html = html.replace(/^const COMMON = .*\n/gm, '')
  html = html.replace(/^const COMMON_FLAT = .*\n/gm, '')
  html = html.replace(/const FOODS = \[.*\];/, () => line + '\n' + COMMON_LINE)
  for (const old of [RENDER_B2, RENDER_B, RENDER_A]) {
    if (html.includes(old)) { html = html.replace(old, RENDER_TARGET); break }
  }
  if (html.includes(EMPTY_OLD)) html = html.replace(EMPTY_OLD, EMPTY_NEW)
  fs.writeFileSync(t, html)
  changed++
  console.log('✓ ' + path.relative(ROOT, t) + '  →  ' + out.length + ' 条（别名 ' + out.filter(f => f.a).length + '；常用名单 ' + Object.values(COMMON).flat().length + '）')
}
console.log(changed + '/' + TARGETS.length + ' 份已同步。数据源：健身小程序/utils/kb.js（中国食物成分表 第6版）')
