// utils/diet.js —— 饮食方案生成（两种模式）
//   菜谱模式 buildRecipeDay：直接给「今天吃什么」——具体菜名 + 食材用量（按当日宏量自动调份量）
//   简化模式 buildSimpleDay：只给每餐的蛋白/碳水/脂肪克数 + 常见食材换算举例（适合直接水煮的人）
// 营养一律实时查 kb.FOODS（带缓存），不硬编码。
//
// 配餐算法：主餐在「蛋白菜 × 主食 × 蔬菜」的组合里**搜最优搭配**（288 组），
// 每组先按目标做三步拟合（蛋白→缩放蛋白菜主料；碳水→缩放主食主料；脂肪→增减油），
// 再按宏量误差挑最小的一组。这样能避开「鸡腿肉太肥、怎么调都超标」这类硬凑。
const kb = require('./kb.js')
const METHOD = require('./method.js')
const MENU = require('./recipes-data.js')

function r1(n) { return Math.round((n || 0) * 10) / 10 }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// ——— 营养查询（带缓存，避免重复 matchFood）———
const NUTRI = {}
function nutrOf(foodName) {
  if (foodName in NUTRI) return NUTRI[foodName]
  const f = kb.matchFood(foodName)
  NUTRI[foodName] = f ? {
    kcal: f.kcal || 0, protein: f.protein || 0,
    carbs: f.carbs || 0, fat: f.fat || 0, fiber: f.fiber || 0
  } : null
  return NUTRI[foodName]
}

function nutritionOfItems(items) {
  const t = { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 }
  ;(items || []).forEach(it => {
    const n = nutrOf(it.food)
    if (!n) return
    const k = (it.g || 0) / 100
    t.kcal += n.kcal * k; t.protein += n.protein * k
    t.carb += n.carbs * k; t.fat += n.fat * k; t.fiber += n.fiber * k
  })
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carb: r1(t.carb), fat: r1(t.fat), fiber: r1(t.fiber) }
}
function totalOf(dishes) {
  return nutritionOfItems(dishes.reduce((a, d) => a.concat(d.items), []))
}

const SEASONING = ['蒜', '姜', '食用油']
function mainItemIndex(items, field) {
  let best = -1, bestV = 0
  items.forEach((it, i) => {
    if (SEASONING.indexOf(it.food) >= 0) return
    const n = nutrOf(it.food)
    if (!n) return
    const v = (field === 'protein' ? n.protein : n.carbs) || 0
    if (v > bestV) { bestV = v; best = i }
  })
  return best
}
// 缩放一道菜的份量，使其对 field 的贡献变化 delta 克
function scaleDish(dish, field, delta, lo, hi) {
  if (!delta || !dish) return
  const idx = mainItemIndex(dish.items, field)
  if (idx < 0) return
  const n = nutrOf(dish.items[idx].food)
  if (!n) return
  const per100 = (field === 'protein' ? n.protein : n.carbs) || 0
  if (per100 <= 0) return
  const curG = dish.items[idx].g
  const want = per100 * curG / 100 + delta
  if (want <= 0) return
  const factor = clamp(want / (per100 * curG / 100), lo, hi)
  dish.items[idx].g = Math.max(5, Math.round(curG * factor / 5) * 5)
}
// 依据目标拟合一组菜：蛋白 → 碳水 → 脂肪（油）
function fitDishes(dishes, target) {
  scaleDish(dishes.find(d => d.kind === '蛋白'), 'protein', target.protein - totalOf(dishes).protein, 0.5, 2.2)
  scaleDish(dishes.find(d => d.kind === '主食'), 'carb', target.carb - totalOf(dishes).carb, 0.4, 2.8)
  const gap = target.fat - totalOf(dishes).fat
  if (Math.abs(gap) >= 1) {
    const oils = []
    dishes.forEach(d => d.items.forEach(i => { if (i.food === '食用油') oils.push(i) }))
    if (oils.length) {
      const per = oils.length
      const add = gap * 100 / 99.9 / per
      oils.forEach(o => { o.g = Math.round(clamp(o.g + add, 0, 20)) })
      dishes.forEach(d => { d.items = d.items.filter(i => i.food !== '食用油' || i.g > 0) })
    }
  }
}
function errOf(got, target) {
  return Math.abs(got.protein - target.protein) / Math.max(target.protein, 1)
    + Math.abs(got.carb - target.carb) / Math.max(target.carb, 1)
    + Math.abs(got.fat - target.fat) / Math.max(target.fat, 1)
}
function copyDish(recipe) {
  return { id: recipe.id, name: recipe.name, kind: recipe.kind, steps: recipe.steps, items: recipe.items.map(x => ({ food: x.food, g: x.g })) }
}

// 重复用过的菜加一点惩罚：只在「同样合格」的候选之间起作用，避免早中晚全是鳕鱼
function reusePenalty(dishes, usedIds) {
  if (!usedIds || !usedIds.length) return 0
  return dishes.reduce((s, d) => s + (usedIds.indexOf(d.id) >= 0 ? 0.12 : 0), 0)
}

// 主餐：搜索最优组合（mealKey 按餐次过滤菜谱 —— 早餐不会再出现爆炒虾仁/上汤娃娃菜）
function bestMainCombo(target, seed, usedIds, mealKey) {
  const Ps = MENU.byKindMeal('蛋白', mealKey), Ss = MENU.byKindMeal('主食', mealKey), Vs = MENU.byKindMeal('蔬菜', mealKey)
  let best = null, bestErr = Infinity
  Ps.forEach((p, pi) => Ss.forEach((s, si) => Vs.forEach((v, vi) => {
    const dishes = [copyDish(p), copyDish(s), copyDish(v)]
    fitDishes(dishes, target)
    // 误差 + 一个确定性的小扰动，让不同日期挑到不同的「同样合格」组合
    const err = errOf(totalOf(dishes), target)
      + (((pi * 7 + si * 13 + vi * 17 + seed * 5) % 11) * 0.002)
      + reusePenalty(dishes, usedIds)
    if (err < bestErr) { bestErr = err; best = dishes }
  })))
  return best || []
}
// 加餐：量小、吸收快，单独菜单
function bestSnack(target, seed, usedIds) {
  const list = MENU.byKind('加餐')
  let best = null, bestErr = Infinity
  list.forEach((rc, i) => {
    const dishes = [copyDish(rc)]
    // 加餐以蛋白为主目标，碳水次之
    scaleDish(dishes[0], 'protein', target.protein - totalOf(dishes).protein, 0.5, 3)
    const err = errOf(totalOf(dishes), target) + ((i * 7 + seed * 3) % 11) * 0.002 + reusePenalty(dishes, usedIds)
    if (err < bestErr) { bestErr = err; best = dishes }
  })
  return best || []
}

function packMeal(mealDef, dishes, target) {
  const got = totalOf(dishes)
  return {
    meal: mealDef.key, mealName: mealDef.name,
    dishes: dishes.map(d => ({
      name: d.name, kind: d.kind, steps: d.steps,
      items: d.items.map(i => i.food + ' ' + i.g + 'g'),
      nutrition: nutritionOfItems(d.items)
    })),
    target: { protein: Math.round(target.protein), carb: Math.round(target.carb), fat: Math.round(target.fat), kcal: Math.round(target.kcal) },
    got
  }
}

// 菜谱模式：今天的四餐（seed 用日期序数：同一天看到的一样、换一天会换菜）
function buildRecipeDay(macros, opts) {
  opts = opts || {}
  const seed = typeof opts.seed === 'number' ? opts.seed : 0
  const usedIds = []   // 当天已用过的菜，避免早中晚重复
  const meals = METHOD.DIET.meals.map((m, mi) => {
    const target = { protein: macros.protein * m.pct, carb: macros.carb * m.pct, fat: macros.fat * m.pct, kcal: macros.kcal * m.pct }
    const dishes = (m.type === 'snack') ? bestSnack(target, seed + mi, usedIds) : bestMainCombo(target, seed + mi, usedIds, m.key)
    dishes.forEach(d => usedIds.push(d.id))
    return packMeal(m, dishes, target)
  })
  const total = meals.reduce((a, m) => {
    a.protein += m.got.protein; a.carb += m.got.carb; a.fat += m.got.fat; a.kcal += m.got.kcal
    return a
  }, { protein: 0, carb: 0, fat: 0, kcal: 0 })
  return {
    mode: 'recipe',
    meals,
    target: { protein: Math.round(macros.protein), carb: Math.round(macros.carb), fat: Math.round(macros.fat), kcal: Math.round(macros.kcal) },
    got: { protein: Math.round(total.protein), carb: Math.round(total.carb), fat: Math.round(total.fat), kcal: Math.round(total.kcal) },
    note: '份量已按你的当日宏量自动缩放；同类菜可自由替换（等量蛋白换等量蛋白），不必严格照做。'
  }
}

// 简化模式：每餐给「蛋白/碳水/脂肪/蔬菜」四项克数 + 常见食材换算（约几个鸡蛋/约几碗饭）
// 适用：水煮选手、自己做饭但不照菜谱的人（用户 2026-09-15 明确要求每餐都要有克数和蔬菜量）
const EXAMPLES = {
  protein: [{ food: '鸡胸肉', label: '鸡胸' }, { food: '牛肉(瘦)', label: '瘦牛肉' }, { food: '虾', label: '虾' }, { food: '鸡蛋', label: '鸡蛋' }],
  proteinSnack: [{ food: '鸡蛋', label: '鸡蛋' }, { food: '牛奶', label: '牛奶' }, { food: '酸奶(原味)', label: '酸奶' }],
  carb: {
    早: [{ food: '燕麦片', label: '燕麦' }, { food: '面条(熟)', label: '面条(熟)' }, { food: '全麦面包', label: '全麦面包' }, { food: '馒头', label: '馒头' }],
    主: [{ food: '米饭(熟)', label: '米饭(熟)' }, { food: '红薯', label: '红薯' }, { food: '糙米饭(熟)', label: '糙米饭' }, { food: '荞麦面(熟)', label: '荞麦面' }]
  },
  fat: [{ food: '食用油', label: '食用油' }, { food: '花生', label: '花生' }, { food: '牛油果', label: '牛油果' }],
  veg: ['西兰花', '菠菜', '生菜', '番茄']
}
// field 必须显式传：否则「米饭」会拿蛋白值去算碳水（0.1 吨米饭那种笑话）
function gramsFor(foodName, grams, field) {
  const n = nutrOf(foodName)
  if (!n) return null
  const per100 = (field === 'protein' ? n.protein : field === 'carb' ? n.carbs : n.fat) || 0
  if (per100 <= 0) return null
  return Math.max(5, Math.round(grams / per100 * 100 / 5) * 5)
}
// 练后加餐的蛋白粉口粮（乳清 30g ≈ 蛋白 24g）
const SCOOP_PROTEIN = 24
function buildSimpleDay(macros) {
  const meals = METHOD.DIET.meals.map(m => {
    const protein = Math.round(macros.protein * m.pct)
    const carb = Math.round(macros.carb * m.pct)
    const fat = Math.round(macros.fat * m.pct)
    const hints = []
    const fmt = (arr, field, amount) => arr.map(e => {
      const g = gramsFor(e.food, amount, field)
      return g ? e.label + ' ' + g + 'g' + MENU.portionOf(e.food, g) : null
    }).filter(Boolean).join(' / ')

    if (m.type === 'snack') {
      // 练后加餐：蛋白粉打底，剩下的蛋白给正餐补法，碳水给香蕉
      if (protein > 0) {
        hints.push(protein > SCOOP_PROTEIN
          ? '蛋白 ' + protein + 'g ≈ 蛋白粉 1勺（约30g，≈24g）＋ 剩余 ' + (protein - SCOOP_PROTEIN) + 'g 用鸡蛋/牛奶补'
          : '蛋白 ' + protein + 'g ≈ 蛋白粉 ' + Math.max(15, Math.round(protein / SCOOP_PROTEIN * 30)) + 'g（约 ' + (protein / SCOOP_PROTEIN).toFixed(1) + ' 勺）')
      }
      if (carb > 0) {
        const bg = gramsFor('香蕉', carb, 'carb')
        hints.push('碳水 ' + carb + 'g ≈ 香蕉 ' + (bg || 0) + 'g' + MENU.portionOf('香蕉', bg || 0) + '（练后快碳水）')
      }
    } else {
      if (protein > 0) hints.push('蛋白 ' + protein + 'g ≈ ' + fmt(EXAMPLES.protein, 'protein', protein))
      if (carb > 0) hints.push('碳水 ' + carb + 'g ≈ ' + fmt(EXAMPLES.carb[m.key === '早' ? '早' : '主'].slice(0, 2), 'carb', carb))
      if (fat > 0) hints.push('脂肪 ' + fat + 'g ≈ ' + fmt(EXAMPLES.fat, 'fat', fat))
      // 蔬菜：固定克数（不占蛋白碳水预算，但必须列出来——用户明确要求）
      hints.push(m.key === '早'
        ? '蔬菜 100–150g ≈ 番茄 1个 / 菠菜 150g（蛋花汤或白灼）'
        : '蔬菜 250g ≈ 西兰花 250g / 菠菜 300g / 生菜 300g（水煮或 5g 油快炒）')
    }
    return { meal: m.key, mealName: m.name, protein, carb, fat, kcal: Math.round(macros.kcal * m.pct), hints }
  })
  return {
    mode: 'simple',
    meals,
    target: { protein: Math.round(macros.protein), carb: Math.round(macros.carb), fat: Math.round(macros.fat), kcal: Math.round(macros.kcal) },
    got: { protein: Math.round(macros.protein), carb: Math.round(macros.carb), fat: Math.round(macros.fat), kcal: Math.round(macros.kcal) },
    note: '每餐四项：蛋白/碳水/脂肪/蔬菜，都有克数和「约等于」换算，水煮/外食都适用。食材按「等量替换」随便换；练后加餐的蛋白粉是打底，不吃蛋白粉就用鸡蛋牛奶补同量蛋白。'
  }
}

function buildDay(macros, mode, opts) {
  return (mode === 'recipe') ? buildRecipeDay(macros, opts) : buildSimpleDay(macros)
}

module.exports = { nutritionOfItems, buildRecipeDay, buildSimpleDay, buildDay }


// 两端共用：每项始终以可食部克数保存，营养为每100g；参考不等于实际摄入。
function referenceSum(items) {
  const t = { k: 0, p: 0, c: 0, f: 0 }
  ;(items || []).forEach(x => {
    const g = Number(x.g) / 100
    if (!Number.isFinite(g) || g < 0) return
    t.k += (Number(x.kcal) || 0) * g; t.p += (Number(x.protein) || 0) * g
    t.c += (Number(x.carbs) || 0) * g; t.f += (Number(x.fat) || 0) * g
  })
  Object.keys(t).forEach(k => { t[k] = r1(t[k]) })
  return t
}
function referenceBasis(p) {
  return JSON.stringify(['gender','age','height','weight','goal','activity'].map(k => (p || {})[k] || ''))
}
function buildReference(e) {
  const defs = [
    { meal: 'b', name: '早餐', pct: .27, foods: [['燕麦片',50,20,80],['鸡蛋',100,50,150],['牛奶',200,100,300],['蓝莓',100,50,150]] },
    { meal: 'l', name: '午餐', pct: .35, foods: [['米饭(熟)',200,100,350],['鸡胸肉',150,80,250],['西兰花',200,150,300],['橄榄油',8,0,20]] },
    { meal: 'd', name: '晚餐', pct: .28, foods: [['米饭(熟)',180,80,350],['牛肉(瘦)',120,60,220],['菠菜',200,150,300],['橄榄油',5,0,20]] },
    { meal: 's', name: '加餐', pct: .10, foods: [['香蕉',120,60,180],['酸奶',200,100,300]] }
  ]
  return defs.map(d => {
    const target = { k: (e.kcal || 0)*d.pct, p: (e.protein || 0)*d.pct, c: (e.carb || 0)*d.pct, f: (e.fat || 0)*d.pct }
    const items = d.foods.map(a => {
      const f = kb.FOODS.find(f => f.name === a[0])
      if (!f) throw new Error('参考食材缺失：' + a[0])
      return { name: f.name, g: a[1], min: a[2], max: a[3], unit: 'g', kcal: Number(f.kcal)||0, protein: Number(f.protein)||0, carbs: Number(f.carbs)||0, fat: Number(f.fat)||0, fiber: Number(f.fiber)||0 }
    })
    // 有上限的复合营养拟合：每次调整都重新计算所有食物的P/C/F与热量。
    // 无法在正常份量内满足时如实显示差额，不无限增加燕麦或油。
    const loss = () => { const t=referenceSum(items); return ['k','p','c','f'].reduce((a,k)=>a+Math.pow((t[k]-target[k])/Math.max(target[k],k==='k'?100:10),2),0) }
    for(let pass=0;pass<5;pass++) items.forEach(x => {
      let best=x.g, score=Infinity
      const step=x.name==='鸡蛋'?50:x.name==='橄榄油'?1:5
      for(let g=x.min;g<=x.max;g+=step) { x.g=g; const v=loss(); if(v<score) {score=v;best=g} }
      x.g=best
    })
    Object.keys(target).forEach(k=>{target[k]=r1(target[k])})
    return { meal:d.meal, name:d.name, items, sum:referenceSum(items), target }
  })
}
module.exports.buildReference = buildReference
module.exports.referenceSum = referenceSum
module.exports.referenceBasis = referenceBasis
