// utils/recipes-data.js —— 家常菜谱库（「菜谱模式」用）
// 设计原则：
//   · 只写「食材 + 克数」，**营养不硬编码** —— 由 utils/diet.js 实时查 kb.FOODS 算，避免两处对不上
//   · food 字段必须能被 kb.matchFood 命中（用 FOODS 里的标准名，如 牛肉(瘦) 而不是 牛肉）
//   · kind: 蛋白 / 主食 / 蔬菜 —— 配餐时按这三类各取一道，再按当日宏量目标缩放份量
//   · 首版 20 道（用户后续可按自己口味增补到 40-60 道）

const RECIPES = [
  // ===== 高蛋白菜 =====
  // 早餐专用：简单快手、不用炒菜（用户明确要求：早餐别搞爆炒虾仁这种）
  { id: 'shuizhu_dan', name: '水煮蛋 + 牛奶', kind: '蛋白', meal: ['早'], tags: ['快手', '不用开火'],
    items: [{ food: '鸡蛋', g: 100 }, { food: '牛奶', g: 250 }],
    steps: '鸡蛋冷水下锅煮 8 分钟；配一盒牛奶。赶时间直接吃。' },

  { id: 'fanqie_chaodan', name: '番茄炒蛋', kind: '蛋白', meal: ['早', '午', '晚'], tags: ['家常', '快手'],
    items: [{ food: '鸡蛋', g: 120 }, { food: '番茄', g: 200 }, { food: '食用油', g: 5 }],
    steps: '鸡蛋打散先炒至刚凝固盛出；番茄下锅炒出汁，回锅鸡蛋，少盐翻匀。' },

  { id: 'qincai_niurou', name: '芹菜炒牛肉', kind: '蛋白', meal: ['午', '晚'], tags: ['高蛋白', '低脂'],
    items: [{ food: '牛肉(瘦)', g: 150 }, { food: '芹菜', g: 200 }, { food: '食用油', g: 5 }, { food: '蒜', g: 5 }],
    steps: '牛肉逆纹切薄片、少生抽抓匀；热锅快炒牛肉至变色盛出，芹菜断生后回锅。' },

  { id: 'heijiao_jixiong', name: '黑椒鸡胸', kind: '蛋白', meal: ['午', '晚'], tags: ['高蛋白', '低脂'],
    items: [{ food: '鸡胸肉', g: 180 }, { food: '青椒', g: 100 }, { food: '食用油', g: 5 }],
    steps: '鸡胸切片用黑胡椒+少盐腌10分钟；中火两面煎熟，青椒同炒。' },

  { id: 'qingzheng_xueyu', name: '清蒸鳕鱼', kind: '蛋白', meal: ['午', '晚'], tags: ['低脂', '好消化'],
    items: [{ food: '鳕鱼', g: 200 }, { food: '姜', g: 5 }, { food: '食用油', g: 3 }],
    steps: '鳕鱼铺姜丝，水开蒸 8-10 分钟；出锅淋少生抽与热油。' },

  { id: 'congbao_xiaren', name: '爆炒虾仁', kind: '蛋白', meal: ['午', '晚'], tags: ['高蛋白', '低脂'],
    items: [{ food: '虾', g: 200 }, { food: '青椒', g: 80 }, { food: '蒜', g: 5 }, { food: '食用油', g: 5 }],
    steps: '虾去线用少盐抓匀；大火快炒至变红，下青椒蒜末翻匀即出锅。' },

  { id: 'mapo_doufu', name: '麻婆豆腐（少油版）', kind: '蛋白', meal: ['午', '晚'], tags: ['家常', '植物蛋白'],
    items: [{ food: '豆腐', g: 250 }, { food: '牛肉(瘦)', g: 80 }, { food: '食用油', g: 8 }],
    steps: '豆腐切块焯水去豆腥；牛肉末炒散，下豆腐轻推，少豆瓣酱调味收汁。' },

  { id: 'xianggu_huaji', name: '香菇滑鸡', kind: '蛋白', meal: ['午', '晚'], tags: ['家常'],
    items: [{ food: '鸡腿肉', g: 150 }, { food: '香菇', g: 120 }, { food: '食用油', g: 5 }, { food: '姜', g: 3 }],
    steps: '鸡腿肉去皮切块，用少生抽+淀粉抓匀；香菇炒软后下鸡肉焖 6 分钟。' },

  { id: 'xiangjian_sanwenyu', name: '香煎三文鱼', kind: '蛋白', meal: ['午', '晚'], tags: ['优质脂肪'],
    items: [{ food: '三文鱼', g: 180 }, { food: '生菜', g: 100 }, { food: '食用油', g: 3 }],
    steps: '三文鱼吸干水分，皮朝下中火煎 4 分钟再翻面 2 分钟；配生菜解腻。' },

  // ===== 主食 =====
  // 早餐专用主食：面条 / 麦片这类，符合「早上就该吃这些」的习惯
  { id: 'jidan_mian', name: '鸡蛋面', kind: '主食', meal: ['早'], tags: ['快手', '热汤'],
    items: [{ food: '面条(熟)', g: 200 }, { food: '鸡蛋', g: 50 }, { food: '菠菜', g: 50 }],
    steps: '水开下面条；卧一个荷包蛋，扔两把青菜，少盐少生抽。' },

  { id: 'zaliang_fan', name: '杂粮饭', kind: '主食', meal: ['午', '晚'], tags: ['低GI'],
    items: [{ food: '糙米饭(熟)', g: 200 }, { food: '玉米(鲜)', g: 80 }], steps: '糙米提前泡 2 小时再煮，掺玉米粒口感更好。' },

  { id: 'zheng_hongshu', name: '蒸红薯', kind: '主食', meal: ['早', '午', '晚'], tags: ['低GI'],
    items: [{ food: '红薯', g: 250 }], steps: '红薯带皮蒸 20 分钟，凉一点吃升糖更慢。' },

  { id: 'yanmai_wan', name: '燕麦碗', kind: '主食', meal: ['早'], tags: ['低GI', '快手'],
    items: [{ food: '燕麦片', g: 60 }, { food: '牛奶', g: 200 }, { food: '蓝莓', g: 100 }],
    steps: '燕麦用热牛奶泡 5 分钟，撒蓝莓。可提前一晚冷藏做隔夜燕麦。' },

  { id: 'qiaomai_mian', name: '荞麦面', kind: '主食', meal: ['早', '午', '晚'], tags: ['低GI'],
    items: [{ food: '荞麦面(熟)', g: 200 }, { food: '生菜', g: 80 }], steps: '荞麦面煮熟过凉水，拌少生抽与生菜。' },

  { id: 'yumi_nangua', name: '玉米南瓜', kind: '主食', meal: ['早', '午'], tags: ['低GI'],
    items: [{ food: '玉米(鲜)', g: 150 }, { food: '南瓜', g: 200 }], steps: '一起上锅蒸 15 分钟，替代部分米饭。' },

  { id: 'mantou', name: '馒头', kind: '主食', meal: ['早', '午'], tags: ['高GI', '练后'],
    items: [{ food: '馒头', g: 100 }], steps: '高 GI，建议放在练后那一餐补糖原。' },

  // ===== 蔬菜 =====
  // 早餐那份「菜」：水果最实际，别让人早上炒菜
  { id: 'shuiguo_fen', name: '水果一份', kind: '蔬菜', meal: ['早'], tags: ['不用开火'],
    items: [{ food: '苹果', g: 200 }, { food: '蓝莓', g: 50 }],
    steps: '苹果洗净切块，配一把蓝莓。也可以换成当季水果。' },

  { id: 'suanrong_xilanhua', name: '蒜蓉西兰花', kind: '蔬菜', meal: ['午', '晚'], tags: ['高纤维'],
    items: [{ food: '西兰花', g: 250 }, { food: '蒜', g: 5 }, { food: '食用油', g: 5 }],
    steps: '西兰花焯水 1 分钟；蒜末爆香后大火快炒，保持脆感。' },

  { id: 'qingchao_boluo', name: '清炒菠菜', kind: '蔬菜', meal: ['午', '晚'], tags: ['高纤维'],
    items: [{ food: '菠菜', g: 250 }, { food: '蒜', g: 5 }, { food: '食用油', g: 5 }],
    steps: '菠菜先焯水去草酸，蒜末快炒 30 秒即出锅。' },

  { id: 'liangban_huanggua', name: '凉拌黄瓜', kind: '蔬菜', meal: ['午', '晚'], tags: ['低热量'],
    items: [{ food: '黄瓜', g: 250 }, { food: '蒜', g: 5 }], steps: '黄瓜拍裂切段，加蒜末、少醋与少盐拌匀。' },

  { id: 'fanqie_dantang', name: '番茄蛋汤', kind: '蔬菜', meal: ['早', '晚'], tags: ['低热量'],
    items: [{ food: '番茄', g: 150 }, { food: '鸡蛋', g: 50 }], steps: '番茄炒出汁加水煮开，淋蛋液成蛋花。' },

  { id: 'culiu_tudousi', name: '醋溜土豆丝', kind: '蔬菜', meal: ['午', '晚'], tags: ['家常'],
    items: [{ food: '土豆(蒸)', g: 200 }, { food: '青椒', g: 50 }, { food: '食用油', g: 5 }],
    steps: '土豆丝泡水去淀粉，大火快炒烹醋，脆口不粘。' },

  { id: 'shangtang_wawacai', name: '上汤娃娃菜', kind: '蔬菜', meal: ['午', '晚'], tags: ['低热量'],
    items: [{ food: '娃娃菜', g: 250 }, { food: '蒜', g: 5 }, { food: '食用油', g: 3 }],
    steps: '蒜片爆香加水煮开，下娃娃菜煮软，少盐调味。' },

  // ===== 加餐（练后那一餐，量小、吸收快）=====
  { id: 'ruqing_yin', name: '乳清蛋白饮', kind: '加餐', meal: ['练后'], tags: ['快速吸收'],
    items: [{ food: '蛋白粉(乳清)', g: 30 }], steps: '练后 30-60 分钟内用温水冲开。' },

  { id: 'ruqing_xiangjiao', name: '蛋白粉 + 香蕉', kind: '加餐', meal: ['练后'], tags: ['练后黄金搭配'],
    items: [{ food: '蛋白粉(乳清)', g: 25 }, { food: '香蕉', g: 120 }], steps: '快碳 + 快蛋白，补糖原与修复。' },

  { id: 'suannai_lanmei', name: '酸奶 + 蓝莓', kind: '加餐', meal: ['练后', '早'], tags: ['好消化'],
    items: [{ food: '酸奶(原味)', g: 200 }, { food: '蓝莓', g: 50 }], steps: '冷藏后直接吃，省事。' },

  { id: 'mantou_lianti', name: '馒头(练后快碳)', kind: '加餐', meal: ['练后'], tags: ['高GI', '练后'],
    items: [{ food: '馒头', g: 80 }], steps: '练后补糖原用，平时少吃。' }
]

// 便于配餐取用：按类别分组
const BY_KIND = { 蛋白: [], 主食: [], 蔬菜: [], 加餐: [] }
RECIPES.forEach(r => { if (BY_KIND[r.kind]) BY_KIND[r.kind].push(r) })

function get(id) { return RECIPES.find(r => r.id === id) || null }
function byKind(kind) { return BY_KIND[kind] || [] }

// 按「餐次」取可用的菜 —— 早餐不该出现爆炒虾仁/上汤娃娃菜这类正经炒菜
function byKindMeal(kind, mealKey) {
  const all = BY_KIND[kind] || []
  const hit = all.filter(r => !r.meal || r.meal.indexOf(mealKey) >= 0)
  return hit.length ? hit : all          // 某餐没匹配就退回全量，免得配不出餐
}

// 份量换算单位：让「175g 鸡胸」也能说成「约 1.5 块」、「碳水70g ≈ 米饭270g（约2碗）」
const PORTION = {
  '鸡蛋': { per: 50, unit: '个' },
  '米饭(熟)': { per: 150, unit: '碗' },
  '糙米饭(熟)': { per: 150, unit: '碗' },
  '馒头': { per: 100, unit: '个' },
  '红薯': { per: 200, unit: '个' },
  '玉米(鲜)': { per: 200, unit: '根' },
  '香蕉': { per: 120, unit: '根' },
  '苹果': { per: 200, unit: '个' },
  '牛奶': { per: 250, unit: '盒' },
  '全麦面包': { per: 35, unit: '片' },
  '鸡胸肉': { per: 120, unit: '块' },
  '酸奶(原味)': { per: 100, unit: '杯' }
}
function portionOf(food, grams) {
  const u = PORTION[food]
  if (!u || !grams) return ''
  const n = grams / u.per
  if (n < 0.4) return ''
  const v = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10
  return '（约 ' + v + ' ' + u.unit + '）'
}

module.exports = { RECIPES, BY_KIND, PORTION, get, byKind, byKindMeal, portionOf }
