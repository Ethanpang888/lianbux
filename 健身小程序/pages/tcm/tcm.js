// pages/tcm/tcm.js —— 中医调理板块（体质自测 + 概念库科普 + 食养 + 训练宜忌 + 四季养生）
const app = getApp()

// 免责声明（合规红线：全程标注，结论用"倾向"而非"诊断"）
const DISCLAIMER = '本页为中医健康科普。体质自测结果仅作日常养生参考，不构成医疗诊断或治疗建议；如有明显不适，请咨询具备资质的中医师。'

// 七种与健身强相关的体质（简化自《中医体质分类与判定》国标，内容取自本号概念库）
const TYPES = [
  {
    key: 'pinghe', name: '平和质',
    desc: '精力充沛、睡眠好、不易累、面色红润、适应力强',
    mech: '阴阳气血调和，是最理想的状态，维持即可。',
    train: '保持规律就好，有氧+力量均衡，不必刻意加量。',
    food: '饮食均衡，五谷果蔬荤素搭配，不偏嗜。',
    tip: '维持现有习惯就行，不用额外进补。'
  },
  {
    key: 'qixu', name: '气虚质',
    desc: '容易累、气短、稍微动就出汗、面色偏白、肌肉松软',
    mech: '中医讲"劳则气耗"——每组力竭、长期高强度会让气往外散；"脾主肌肉"，脾胃把营养变成肌肉，气虚时运化不动蛋白质，吃再多也长不上。',
    train: '不宜大汗久练；以快走、八段锦、小重量多次为主，练到微汗即止；忌力竭、忌空腹练。',
    food: '补气：红枣、山药、小米、黄芪煮水；少食多餐减轻脾胃负担。',
    tip: '⚠️ 练完腹部有"下坠感"不是酸痛，是"中气下陷"，要减强度。'
  },
  {
    key: 'yangxu', name: '阳虚质',
    desc: '怕冷、手脚凉、喜热饮、精神容易不振',
    mech: '肾精是身体最底层储备（像银行存款），阳虚是温煦不足；训练过度会调用肾精硬撑，越练越虚。',
    train: '宜晨练晒太阳、温和有氧；忌冷水浴、忌深夜训练、忌暴汗。',
    food: '温补：羊肉、生姜、桂圆、韭菜；以黑养黑（黑芝麻、黑豆）补肾精；少生冷。',
    tip: '运动后尽快保暖，忌冰饮冰水。'
  },
  {
    key: 'yinxu', name: '阴虚质',
    desc: '手脚心热、口干咽燥、喜冷饮、体型偏瘦、易烦躁',
    mech: '"汗血同源"——汗是津液，与血同出一源；暴汗→津液流失→伤阴→失眠烦躁。"壮火食气"：强度太大变成病理之火在消耗你。',
    train: '避免闷热环境暴汗，选通风处中低强度，及时补水；忌力竭天天练。',
    food: '滋阴润燥：银耳、百合、梨、绿豆；少辛辣。',
    tip: '练完烦躁/失眠/长痘 = 壮火食气的信号，要降强度。'
  },
  {
    key: 'tanshi', name: '痰湿质',
    desc: '体型偏胖、易困倦、痰多、舌苔厚腻、面部油腻',
    mech: '"痰湿"是脾胃运化不了的东西堆在身体里；健身人最常见原因是蛋白质/蛋白粉吃太多运化不掉，变成腰腹松软的"湿气"（不是脂肪）。',
    train: '多做有氧出汗排湿（快走/游泳/跳操），强度适中、频率高；练再多腹肌出不来先调脾胃。',
    food: '健脾祛湿：薏米、赤小豆、冬瓜、茯苓；少甜少油少奶茶。',
    tip: '舌苔白厚、大便黏马桶、口中黏腻 = 痰湿体感信号。'
  },
  {
    key: 'shire', name: '湿热质',
    desc: '面油、口苦、易长痘、大便黏腻、小便黄',
    mech: '湿热内蕴，多因脾虚生湿+辛辣油腻加重；与痰湿同源但偏"热"。',
    train: '避免闷热环境暴汗，选通风处中低强度，及时补水。',
    food: '清淡利湿：绿豆、苦瓜、冬瓜、芹菜；少辣少甜少酒。',
    tip: '忌辛辣烧烤火锅、忌熬夜。'
  },
  {
    key: 'qiyu', name: '气郁质',
    desc: '闷闷不乐、焦虑紧张、胸闷、爱叹气、压力大时更堵',
    mech: '"肝的疏泄"是身体的气机调度员；训练压力+工作压力叠加，肝气不舒，气卡在胸廓；"气机"不顺，不是气不够而是走不动。',
    train: '训练前调息内关（注意力放呼吸上）稳定情绪；避免过度依赖撸铁疏肝反而耗气。',
    food: '疏肝理气：玫瑰花、陈皮、芹菜、荠菜；少油腻。',
    tip: '练完胸闷肋骨胀、情绪一点就炸 = 肝气不舒，先调情绪再练。'
  }
]

// 概念库小课堂（直接取自 Obsidian 概念库 16 篇笔记，科普化呈现）
const LESSONS = [
  { t: '脾主肌肉', b: '不是脾脏长肌肉，是脾胃把吃下的东西化成气血去养肌肉。增肌慢常是脾胃运化不了蛋白质。' },
  { t: '脾主四肢', b: '训练四肢反过来刺激脾胃——"健身能补气血"的理论基础；练完胃口变好就是它在起作用。' },
  { t: '劳则气耗', b: '过度劳累气会外散；每组力竭、长期高强度→气耗→恢复变慢，身体调用肾精硬撑。' },
  { t: '汗血同源', b: '汗是津液，与血同出一源；暴汗→津液漏→阴虚→失眠烦躁、恢复变慢。' },
  { t: '壮火食气', b: '强度太大变成病理之火在消耗你；练完烦躁失眠长痘就是信号。中低强度+休息才是"生气"。' },
  { t: '痰湿', b: '蛋白粉等滋腻品脾胃运化不动→堆成腰腹痰湿；舌苔白厚、大便黏马桶是信号。' },
  { t: '肝的疏泄', b: '肝是气机调度员；健身人压力大易肝郁，胸闷肋骨胀、情绪暴躁是表现。' },
  { t: '肾精', b: '身体最底层储备（银行存款）；越练睡越差、脾气越爆、掉发越多=在掏老本。' },
  { t: '血不养筋', b: '血不够筋就干硬伸展不开；练完紧绷拉伸不开，可能要补血而非只拉伸。' },
  { t: '以黑养黑 / 以子养子', b: '黑色食物（黑芝麻黑豆）入肾，植物种子（枸杞奇亚籽）养肾精，对激素合成有帮助。' },
  { t: '三焦', b: '上焦（胸廓呼吸）中焦（核心脾胃）下焦（骨盆肾）；肋骨外翻=上焦气浮，骨盆前倾=下焦肾气泄。' },
  { t: '调息内关', b: '注意力放呼吸上→交感神经放松→助眠；训练后失眠、训练前焦虑都可用。' }
]

// 食养方库（按体质分组；食疗养生，非处方，不替代医生诊疗）
const FOODS_TCM = {
  pinghe: [
    { name: '均衡三餐', ingre: '五谷+果蔬+优质蛋白', how: '三餐规律，荤素搭配不偏嗜', freq: '日常' },
    { name: '顺应四时', ingre: '当季食材', how: '按季节吃应季菜，不必额外进补', freq: '日常' }
  ],
  qixu: [
    { name: '红枣小米粥', ingre: '红枣+小米', how: '小火熬粥，早晚温服', freq: '每周3-4次' },
    { name: '黄芪泡水', ingre: '黄芪5-10g', how: '沸水冲泡代茶饮', freq: '每日' },
    { name: '山药薏米糊', ingre: '山药+薏米', how: '蒸熟打糊或煮粥，健脾', freq: '每周3次' }
  ],
  yangxu: [
    { name: '羊肉生姜汤', ingre: '羊肉+生姜+桂圆', how: '炖汤温服，秋冬更宜', freq: '每周1-2次' },
    { name: '以黑养黑', ingre: '黑芝麻+黑豆+核桃', how: '炒香打粉，每日一小勺', freq: '每日少量' },
    { name: '韭菜温阳', ingre: '韭菜', how: '温炒，春夏减量', freq: '适量' }
  ],
  yinxu: [
    { name: '银耳百合梨汤', ingre: '银耳+百合+梨', how: '慢炖成羹，滋阴润燥', freq: '每周3次' },
    { name: '绿豆汤', ingre: '绿豆', how: '煮汤少糖，夏季为宜', freq: '每周2-3次' },
    { name: '桑葚枸杞水', ingre: '桑葚+枸杞', how: '泡水代茶', freq: '每日' }
  ],
  tanshi: [
    { name: '薏米赤小豆汤', ingre: '薏米+赤小豆+冬瓜', how: '煮水代茶，健脾祛湿', freq: '每周3-4次' },
    { name: '茯苓山药粥', ingre: '茯苓+山药+大米', how: '煮粥，淡味健脾', freq: '每周3次' },
    { name: '冬瓜汤', ingre: '冬瓜', how: '清汤少油，利湿', freq: '每周2-3次' }
  ],
  shire: [
    { name: '绿豆苦瓜汤', ingre: '绿豆+苦瓜', how: '煮汤，清淡利湿', freq: '每周3次' },
    { name: '芹菜凉拌', ingre: '芹菜', how: '少油凉拌，清热', freq: '每周2-3次' },
    { name: '冬瓜汤', ingre: '冬瓜', how: '清汤，利湿', freq: '每周2-3次' }
  ],
  qiyu: [
    { name: '玫瑰花陈皮茶', ingre: '玫瑰花+陈皮', how: '沸水冲泡，疏肝理气', freq: '每日' },
    { name: '荠菜芹菜', ingre: '荠菜+芹菜', how: '清炒，疏肝', freq: '每周2-3次' }
  ]
}

// 训练恢复锦囊（取自概念库：调息内关/汗出护阳/汗血同源/壮火食气/脾主肌肉/以黑养黑/中气下陷）
const RECOVERY = [
  { t: '练后调息内关', b: '腕横纹上约两指、两筋之间为内关；练后闭眼深呼吸3-5分钟，注意力放呼吸，助交感神经放松、助眠稳情绪。' },
  { t: '汗出护阳', b: '运动毛孔张开，立即擦干保暖，忌冲凉、吹冷风、喝冰饮，否则寒邪易从毛孔而入。' },
  { t: '暴汗养阴', b: '暴汗后津液随汗流失（汗血同源），先补温水或淡盐水，再饮银耳/绿豆汤；忌马上灌冰水。' },
  { t: '中气下陷信号', b: '练完腹部有"下坠感"不是酸痛，是气虚下陷，应减强度、缩短时长，改快走/八段锦。' },
  { t: '壮火食气信号', b: '练完烦躁、失眠、爆痘=强度变病理之火在耗气（壮火食气），须降强度、增休息。' },
  { t: '脾主肌肉时机', b: '练完胃口变好是脾胃在运化（脾主肌肉），此时按时吃饭最利增肌，别饿着。' },
  { t: '以黑养黑', b: '黑芝麻、黑豆、核桃等黑色/种子类食物入肾养精，每日少量，对激素合成与恢复有益。' }
]

// 训练宜忌
const TRAIN_TIPS = [
  { t: '顺时训练', d: '晨练助阳气升发（阳虚/气虚尤宜）；晚上宜缓和，23点前卧养肝胆。' },
  { t: '汗出有度', d: '中医讲"汗血同源"，大汗伤气。痰湿质可微汗排湿，气虚质忌暴汗。' },
  { t: '练后护阳', d: '运动后毛孔开张，忌立即冲凉、吹冷风、喝冰饮，宜擦干保暖。' },
  { t: '饭后勿剧', d: '饭后气血聚脾胃助运化，宜散步；忌立刻大强度训练。' }
]

// 四季养生
const SEASONS = [
  { s: '春', d: '养肝：舒缓伸展、早睡，少生气。' },
  { s: '夏', d: '养心：避正午暴晒，补水补钾，微汗即可。' },
  { s: '秋', d: '养肺：空气好时户外快走，润燥少辛辣。' },
  { s: '冬', d: '养肾：保暖蓄能，温和力量训练，忌大汗。' }
]

// 24 节气养生（顺时训练 / 食养，取自四季养生深化）
const SOLAR = [
  { season: '春 · 养肝', list: [
    { s: '立春', d: '养肝舒展，早睡少生气，宜缓伸拉筋' },
    { s: '雨水', d: '健脾祛湿，少酸多甘，宜散步' },
    { s: '惊蛰', d: '阳气升发，晨练助阳，忌骤冷' },
    { s: '春分', d: '阴阳平分，均衡训练，舒展筋骨' },
    { s: '清明', d: '舒缓户外，踏青快走，舒肝' },
    { s: '谷雨', d: '健脾利湿，增蛋白助运化' }
  ]},
  { season: '夏 · 养心', list: [
    { s: '立夏', d: '养心安神，避正午暴晒' },
    { s: '小满', d: '清热利湿，补水补钾' },
    { s: '芒种', d: '微汗即可，忌闷热暴汗' },
    { s: '夏至', d: '昼长夜短，宜晨练、23点前卧' },
    { s: '小暑', d: '避暑补水，训练降温' },
    { s: '大暑', d: '严防中暑，改室内中低强度' }
  ]},
  { season: '秋 · 养肺', list: [
    { s: '立秋', d: '养肺润燥，空气好时户外快走' },
    { s: '处暑', d: '暑去凉来，渐进增量' },
    { s: '白露', d: '润燥少辛辣，护呼吸道' },
    { s: '秋分', d: '阴阳平，训练均衡' },
    { s: '寒露', d: '保暖收敛，宜缓和' },
    { s: '霜降', d: '进补适度，温润不腻' }
  ]},
  { season: '冬 · 养肾', list: [
    { s: '立冬', d: '养藏蓄能，温和力量训练' },
    { s: '小雪', d: '保暖第一，忌大汗' },
    { s: '大雪', d: '室内训练，护关节' },
    { s: '冬至', d: '阳气初生，少练多养' },
    { s: '小寒', d: '防寒，热身充足' },
    { s: '大寒', d: '蓄力待春，缓和收尾' }
  ]}
]

// 五脏 × 训练映射（取自概念库：肝疏泄/心主神/脾主肌肉/肺主气/肾藏精）
const WUZANG = [
  { z: '肝（疏泄）', fit: '情绪压力训练', b: '肝是气机调度员，压力大易肝郁→胸闷肋骨胀、情绪暴躁。练前调息内关稳住情绪；避免过度撸铁疏肝反而耗气。气机舒畅，训练状态才好。' },
  { z: '心（主神）', fit: '睡眠 · 神经恢复', b: '心主神明，练后交感神经兴奋需靠睡眠放松恢复。练完烦躁失眠=心火亢/壮火食气，要降强度、调息助眠。' },
  { z: '脾（主肌肉）', fit: '增肌 · 运化', b: '脾把吃下的东西化成气血养肌肉，增肌慢常是脾胃运化不了蛋白质。练完胃口变好是脾在运化，按时吃饭最利增肌；脾虚湿重宜山药薏米。' },
  { z: '肺（主气）', fit: '有氧 · 耐力', b: '肺主一身之气，有氧能力靠肺气充实。气虚易喘、稍动出汗，宜八段锦/快走渐进，忌暴汗伤气。' },
  { z: '肾（藏精）', fit: '恢复 · 储备', b: '肾精是身体最底层储备，过度训练调用肾精硬撑→越练越虚（掉发/脾气爆/睡差）。恢复、保暖、黑色食养（黑芝麻黑豆）养精。' }
]

// 体质自测题（5级评分：没有1/很少2/有时3/经常4/总是5；正向计分，平和题也为正向）
const QUIZ = [
  { q: '您精力充沛、睡眠好、很少觉得累吗？', type: 'pinghe' },
  { q: '您胃口好、二便正常、不容易生病吗？', type: 'pinghe' },
  { q: '您容易疲乏、稍微活动就气短出汗吗？', type: 'qixu' },
  { q: '您容易感冒、病后恢复慢、说话声音无力吗？', type: 'qixu' },
  { q: '您手脚发凉、怕冷、喜欢热饮热食吗？', type: 'yangxu' },
  { q: '您精神容易不振、吃凉的东西会不舒服或腹泻吗？', type: 'yangxu' },
  { q: '您手脚心热、口干咽燥、喜欢冷饮吗？', type: 'yinxu' },
  { q: '您训练后常大汗淋漓且随后烦躁失眠、恢复慢吗？', type: 'yinxu' },
  { q: '您体型偏胖、腹部松软、容易困倦、痰多吗？', type: 'tanshi' },
  { q: '您面部油腻、舌苔厚腻、大便黏马桶、吃点就胀吗？', type: 'tanshi' },
  { q: '您面部油光、易长痘、口苦或口臭吗？', type: 'shire' },
  { q: '您大便黏滞不爽、小便发黄、体味偏重吗？', type: 'shire' },
  { q: '您常闷闷不乐、焦虑紧张、爱叹气吗？', type: 'qiyu' },
  { q: '您训练时或压力大后胸闷肋骨胀、情绪一点就炸吗？', type: 'qiyu' }
]
const SCALE = ['没有', '很少', '有时', '经常', '总是']

Page({
  data: {
    types: TYPES, lessons: LESSONS, foodGroups: [], showAllFoods: false, recovery: RECOVERY, trainTips: TRAIN_TIPS, solar: SOLAR, wuzang: WUZANG,
    disclaimer: DISCLAIMER, scale: SCALE, quizList: QUIZ,
    selected: null, selType: null,
    quiz: { active: false, idx: 0, answers: {}, done: false, result: null }
  },

  onShow() {
    if (this.getTabBar) this.getTabBar().setData({ selected: 3 })
    const c = app.globalData.constitution
    if (c) {
      const t = TYPES.find(x => x.key === c)
      if (t) {
        this.setData({ selected: c, selType: t })
        // 兜底：老用户只存了 constitution、没有完整 tcmResult 时补一个最小结果
        if (!app.globalData.tcmResult) {
          const result = { main: t.key, mainName: t.name, mainConv: 100, sec: null, secName: '', secConv: 0, conv: {} }
          app.globalData.tcmResult = result
          app.saveUser({ tcmResult: result }).catch(() => {})
        }
      }
    }
    this.refreshFoods()
  },

  // 一键自测
  startQuiz() {
    this.setData({
      quiz: { active: true, idx: 0, answers: {}, done: false, result: null },
      selected: null, selType: null
    })
  },

  answer(e) {
    const score = Number(e.currentTarget.dataset.s)
    const idx = this.data.quiz.idx
    const answers = Object.assign({}, this.data.quiz.answers)
    answers[idx] = score
    const next = idx + 1
    if (next >= QUIZ.length) {
      // 计算各体质原始分与转化分
      const scores = {}; TYPES.forEach(t => scores[t.key] = 0)
      QUIZ.forEach((item, i) => { scores[item.type] += (answers[i] || 0) })
      const conv = {}
      TYPES.forEach(t => {
        const n = QUIZ.filter(q => q.type === t.key).length
        conv[t.key] = Math.round(((scores[t.key] - n) / (n * 4)) * 100)
      })
      // 主要倾向 = 转化分最高；兼夹 = 次高且≥30
      let mainKey = null, max = -1
      TYPES.forEach(t => { if (conv[t.key] > max) { max = conv[t.key]; mainKey = t.key } })
      let secKey = null, secMax = -1
      TYPES.forEach(t => { if (t.key !== mainKey && conv[t.key] > secMax) { secMax = conv[t.key]; secKey = t.key } })
      const t = TYPES.find(x => x.key === mainKey)
      const result = {
        main: mainKey, mainName: t.name, mainConv: conv[mainKey],
        sec: secMax >= 30 ? secKey : null,
        secName: secMax >= 30 ? TYPES.find(x => x.key === secKey).name : '',
        secConv: secKey ? conv[secKey] : 0,
        conv
      }
      this.setData({
        quiz: { active: true, idx, answers, done: true, result },
        selected: mainKey, selType: t
      })
      app.globalData.constitution = mainKey
      app.globalData.tcmResult = result
      app.saveUser({ constitution: mainKey, tcmResult: result }).catch(() => {})
      this.refreshFoods()
    } else {
      this.setData({ 'quiz.idx': next, 'quiz.answers': answers })
    }
  },

  closeQuiz() { this.setData({ 'quiz.active': false }) },

  // 手动选择（自测之外的快速入口）
  selectType(e) {
    const t = TYPES[e.currentTarget.dataset.i]
    const result = { main: t.key, mainName: t.name, mainConv: 100, sec: null, secName: '', secConv: 0, conv: {} }
    this.setData({ selected: t.key, selType: t })
    app.globalData.constitution = t.key
    app.globalData.tcmResult = result
    app.saveUser({ constitution: t.key, tcmResult: result }).catch(() => {})
    this.refreshFoods()
  },

  reset() {
    this.setData({ selected: null, selType: null, 'quiz.active': false, 'quiz.done': false })
  },

  // 根据已测体质过滤食养方（我的体质优先，可切换看全部）
  refreshFoods() {
    const c = app.globalData.constitution
    let groups
    if (c && !this.data.showAllFoods) {
      const t = TYPES.find(x => x.key === c)
      groups = t ? [{ name: t.name, list: FOODS_TCM[c] || [] }] : []
    } else {
      groups = TYPES.map(t => ({ name: t.name, list: FOODS_TCM[t.key] || [] }))
    }
    this.setData({ foodGroups: groups })
  },
  toggleShowAllFoods() {
    this.setData({ showAllFoods: !this.data.showAllFoods }, () => this.refreshFoods())
  }
})
