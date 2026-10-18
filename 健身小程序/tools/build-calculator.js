// 构建热量计算器网页：注入小程序食物库（utils/kb.js FOODS）
const fs = require('fs')
const kb = require('/Users/a1-6/Desktop/健身知识库/健身小程序/utils/kb.js')

// 简易分类（与 kb.foodCatOf 同口径，内嵌网页用）
const RULES = [
  ['其他', /^(蒜|姜|葱|香菜|辣椒|酱油|醋|料酒|糖|淀粉)$/],
  ['脂肪坚果', /食用油|花生|南瓜子|牛油果|芝麻|核桃|腰果|奶酪|杏仁|花生酱|亚麻籽|黑巧克力/],
  ['蔬菜', /西兰花|菠菜|番茄|黄瓜|芹菜|青椒|香菇|口蘑|娃娃菜|生菜|油麦菜|白菜|冬瓜|豆芽|茄子|韭菜|萝卜|蘑菇|青菜|荠菜|芦笋|秋葵/],
  ['蛋白', /鸡胸|鸡腿|鸡胸肉|牛肉|猪里脊|猪肉|羊肉|鸭|鸡蛋|蛋白粉|三文鱼|鳕鱼|龙利鱼|黄花鱼|鱿鱼|扇贝|虾|豆腐|牛奶|酸奶|黑豆|毛豆|鹰嘴豆/],
  ['主食', /米饭|燕麦|红薯|紫薯|山药|芋头|面包|面条|意面|馒头|糙米|玉米|荞麦|土豆|藜麦|粉丝|米粉|红豆|绿豆/],
  ['水果', /香蕉|苹果|蓝莓|橙|葡萄|西瓜|芒果|梨|桃|猕猴桃|火龙果/]
]
function catOf(f) {
  for (const [c, re] of RULES) if (re.test(f.name)) return c
  if (f.kcal <= 45 && f.carbs <= 12) return '蔬菜'
  if (f.protein >= 15) return '蛋白'
  if (f.carbs >= 20) return '主食'
  if (f.fat >= 10) return '脂肪坚果'
  return '其他'
}
const FOODS = kb.FOODS.map(f => ({ n: f.name, k: f.kcal, p: f.protein, c: f.carbs, f: f.fat, fb: f.fiber || 0, cat: catOf(f) }))

const template = fs.readFileSync('/Users/a1-6/Desktop/健身知识库/热量计算器-template.html', 'utf8')
const html = template.replace('/*__FOODS__*/', 'const FOODS = ' + JSON.stringify(FOODS) + ';')
const out = '/Users/a1-6/Desktop/健身知识库/热量计算器.html'
fs.writeFileSync(out, html)
console.log('OK', out, Math.round(fs.statSync(out).size / 1024) + 'KB, 食物', FOODS.length, '种')
