// utils/method.js —— 训练/饮食方法论唯一真相源
// 依据：
//   ①《凯圣王-谭成义三分化①——训练计划》（ksw-1906006665556401392，519 行，2026 版）→ 标记 原文
//   ②《谭成义_我的计划_183-93_增肌为主.md》（带口播稿出处）→ 标记 原文
//   ③ 凯圣王 skill `modules/训练计划.md`（居家四分化 D1胸三头→D2背二头→D3下肢→D4肩）→ 四分化骨架
//   ④ 两个 skill 都没有四分化（健身房版）/五分化排法 → 按推拉腿逻辑推演，标记 推演
//
// 铁律：凡 src !== '原文' 的内容，UI 必须显示「推演」标签，不冒充博主原话。
// 本文件为纯逻辑（不依赖 wx.*/cloud.*），可直接被小程序与云函数共用。

const METHOD_VERSION = 1

const SRC = { YUAN: '原文', TUI: '推演' }

// —— 每个训练日 = 部位组合编排（不是单部位！）——
// parts[]: { part:动作库部位code, picks:[{pattern:动作模式, n:取几个}] }
//   part 取值：chest/back/shoulder/arm/leg/hip/abs
//   用「模式配额」而不是「取 n 个再交给打分」，是为了精确控制这一天练什么 ——
//   否则同部位里打分高的模式（比如三头）会把该部位的名额吃光，出现「胸日只有 2 个胸动作」。
//   配额之间共享去重（同一天不会出现重复动作）；pattern 为 'any' 时表示不限定模式。
// 腹部规则：parts 里没有 abs 的训练日，由引擎在末尾追加 CORE.n 个腹部动作（原文：每日必带）。
const DAYS = {
  // ===== 三分化：原文（《凯圣王-谭成义三分化①》动作明细）=====
  // 原文 5 动作：杠铃卧推 / 哑铃上斜卧推 / 双杠臂屈伸 / 仰卧杠铃臂屈伸 / Y字侧平举
  push: {
    name: '推｜胸 + 肩中束 + 三头', short: '推', src: SRC.YUAN,
    parts: [
      { part: 'chest', picks: [{ pattern: 'push_h', n: 3 }] },      // 卧推 / 上斜 / 双杠臂屈伸
      { part: 'shoulder', picks: [{ pattern: 'delts', n: 1 }] },     // Y字侧平举（中束）
      { part: 'arm', picks: [{ pattern: 'tri', n: 1 }] }             // 仰卧杠铃臂屈伸
    ],
    warmup: ['泡沫轴放松胸椎 2min', '弹力带肩外旋 15×2', '空杆卧推 15×1'],
    note: '主项（卧推）首组用「能做20次的重量」做15次刷动作熟练度；复合动作初期不做到力竭，孤立可到力竭（最多两组）。'
  },
  // 原文 5 动作：单手钢线下拉 / 对卧下拉 / 单手器械划船 / 坐姿开肘划船 / 钢索弯举
  pull: {
    name: '拉｜背 + 后束 + 二头', short: '拉', src: SRC.YUAN,
    parts: [
      { part: 'back', picks: [{ pattern: 'pull_v', n: 2 }, { pattern: 'pull_h', n: 1 }] }, // 下拉×2 + 划船
      { part: 'shoulder', picks: [{ pattern: 'rear_delt', n: 1 }] },                        // 后束
      { part: 'arm', picks: [{ pattern: 'curl', n: 1 }] }                                   // 钢索弯举
    ],
    warmup: ['弹力带直臂下拉 15×2', '轻重量划船 15×1'],
    note: '背阔肌是主攻点（面积与肌纤维都占优）；开肘划船兼练上斜方，对肩胛后缩与肩痛改善有帮助。'
  },
  // 原文 5 动作：单腿硬拉 / 保加利亚蹲 / 颈前深蹲 / 罗马尼亚硬拉 / 山羊挺身
  leg: {
    name: '腿｜后侧链为主', short: '腿', src: SRC.YUAN,
    parts: [
      { part: 'leg', picks: [{ pattern: 'hinge', n: 1 }, { pattern: 'squat', n: 1 }, { pattern: 'legcurl', n: 1 }] },
      { part: 'hip', picks: [{ pattern: 'hinge', n: 1 }] },
      { part: 'leg', picks: [{ pattern: 'calf', n: 1 }] }
    ],
    warmup: ['青蛙式拉伸 2min', '伟大者伸展 8×2', '空杆深蹲 15×1'],
    note: '以后侧链为主（大多数人后侧薄弱、髋能力需要开发）；大腿前侧安排相对少。'
  },

  // ===== 四分化：推演（骨架＝凯圣王居家四分化 D1胸三头→D2背二头→D3肩→D4腿）=====
  chest: {
    name: '胸 + 三头', short: '胸三头', src: SRC.TUI,
    parts: [
      { part: 'chest', picks: [{ pattern: 'push_h', n: 2 }, { pattern: 'delts', n: 1 }] },  // 推×2 + 飞鸟/夹胸
      { part: 'arm', picks: [{ pattern: 'tri', n: 2 }] }
    ],
    warmup: ['泡沫轴放松胸椎 2min', '弹力带肩外旋 15×2', '俯卧撑 10×1'],
    note: '推演的胸+三头日：胸为主项，三头做孤立收尾（复合动作已大量参与三头）。'
  },
  back: {
    name: '背 + 后束 + 二头', short: '背二头', src: SRC.TUI,
    parts: [
      { part: 'back', picks: [{ pattern: 'pull_v', n: 2 }, { pattern: 'pull_h', n: 1 }] },
      { part: 'shoulder', picks: [{ pattern: 'rear_delt', n: 1 }] },
      { part: 'arm', picks: [{ pattern: 'curl', n: 1 }] }
    ],
    warmup: ['弹力带直臂下拉 15×2', '轻重量划船 15×1'],
    note: '推演：沿用谭成义「拉＝背+后束+二头」的组合，后束不单开一天，放在拉日。'
  },
  shoulder: {
    name: '肩（前中后三束）', short: '肩', src: SRC.TUI,
    parts: [
      { part: 'shoulder', picks: [{ pattern: 'push_v', n: 1 }, { pattern: 'delts', n: 2 }, { pattern: 'rear_delt', n: 1 }] },
      { part: 'back', picks: [{ pattern: 'trap', n: 1 }] }
    ],
    warmup: ['弹力带绕肩 15×2', '轻哑铃侧平举 15×1'],
    note: '推演：肩单独一天 —— 推举打前中束、侧平举打中束、面拉/反向飞鸟打后束，斜方收尾。'
  },
  legs: {
    name: '腿｜股四 + 臀 + 腘绳', short: '腿', src: SRC.TUI,
    parts: [
      { part: 'leg', picks: [{ pattern: 'squat', n: 2 }, { pattern: 'hinge', n: 1 }, { pattern: 'calf', n: 1 }] },
      { part: 'hip', picks: [{ pattern: 'hinge', n: 1 }] }
    ],
    warmup: ['青蛙式拉伸 2min', '伟大者伸展 8×2', '空杆深蹲 15×1'],
    note: '推演：四分化里腿单独一天，股四+臀+腘绳均衡。'
  },

  // ===== 五分化：推演（两个 skill 只说「五分化不适合新手」，未给排法）=====
  f_chest: {
    name: '胸 + 三头', short: '胸', src: SRC.TUI,
    parts: [
      { part: 'chest', picks: [{ pattern: 'push_h', n: 2 }, { pattern: 'delts', n: 1 }] },
      { part: 'arm', picks: [{ pattern: 'tri', n: 2 }] }
    ],
    warmup: ['泡沫轴放松胸椎 2min', '弹力带肩外旋 15×2', '俯卧撑 10×1'],
    note: '推演（源方明确提示：五分化对恢复要求高，不适合新手）。'
  },
  f_back: {
    name: '背 + 后束', short: '背', src: SRC.TUI,
    parts: [
      { part: 'back', picks: [{ pattern: 'pull_v', n: 2 }, { pattern: 'pull_h', n: 2 }] },
      { part: 'shoulder', picks: [{ pattern: 'rear_delt', n: 1 }] }
    ],
    warmup: ['弹力带直臂下拉 15×2', '轻重量划船 15×1'],
    note: '推演。'
  },
  f_shoulder: {
    name: '肩 + 斜方', short: '肩', src: SRC.TUI,
    parts: [
      { part: 'shoulder', picks: [{ pattern: 'push_v', n: 1 }, { pattern: 'delts', n: 2 }, { pattern: 'rear_delt', n: 1 }] },
      { part: 'back', picks: [{ pattern: 'trap', n: 1 }] }
    ],
    warmup: ['弹力带绕肩 15×2', '轻哑铃侧平举 15×1'],
    note: '推演。'
  },
  f_arm: {
    name: '手臂（二头 + 三头）', short: '手臂', src: SRC.TUI,
    parts: [
      { part: 'arm', picks: [{ pattern: 'curl', n: 2 }] },
      { part: 'arm', picks: [{ pattern: 'tri', n: 2 }] }
      // 本日已含核心（ABS_PRESET），引擎不再重复追加
    ],
    warmup: ['手腕绕环 15×2', '轻重量弯举 15×1'],
    note: '推演：手臂日二头三头对半分；本日自带 2 个腹部动作，不再另加。'
  },
  f_leg: {
    name: '腿 + 臀 + 小腿', short: '腿', src: SRC.TUI,
    parts: [
      { part: 'leg', picks: [{ pattern: 'squat', n: 2 }, { pattern: 'hinge', n: 1 }, { pattern: 'calf', n: 1 }] },
      { part: 'hip', picks: [{ pattern: 'hinge', n: 1 }] }
    ],
    warmup: ['青蛙式拉伸 2min', '空杆深蹲 15×1'],
    note: '推演。'
  },

  // 手臂单独成日（被精选课表 five12 的 perWeek 引用，键名必须是 'arm'）
  arm: {
    name: '手臂（二头 + 三头）', short: '手臂', src: SRC.TUI,
    parts: [
      { part: 'arm', picks: [{ pattern: 'curl', n: 2 }] },
      { part: 'arm', picks: [{ pattern: 'tri', n: 2 }] }
    ],
    warmup: ['手腕绕环 15×2', '轻重量弯举 15×1'],
    note: '二头三头各半；本日自带腹部动作（ABS_PRESET），不再重复追加。'
  },

  // ===== 全身（新手）：原文精神（每周 3 练全身循环，降低受伤风险）=====
  full: {
    name: '全身循环', short: '全身', src: SRC.YUAN,
    parts: [
      { part: 'leg', picks: [{ pattern: 'squat', n: 1 }] },
      { part: 'chest', picks: [{ pattern: 'push_h', n: 1 }] },
      { part: 'back', picks: [{ pattern: 'pull_v', n: 1 }] },
      { part: 'shoulder', picks: [{ pattern: 'push_v', n: 1 }] },
      { part: 'arm', picks: [{ pattern: 'curl', n: 1 }] }
    ],
    warmup: ['动态热身 5min（摆腿/肩环绕/猫牛式）'],
    note: '新手神经适应期：全身循环、每周多练、每次各部位 1 个动作，先把动作模式和熟练度建立起来。'
  }
}

// 每日「自带核心」的分化（parts 里已含 abs 的日子，不重复追加）
const ABS_PRESET = { f_arm: 2, arm: 2 }

// 孤立类动作模式：决定组间休息（孤立 90s）与「孤立/辅助」标签
const ISOLATION_PATTERNS = ['curl', 'tri', 'delts', 'calf', 'legcurl', 'rear_delt', 'trap']

// —— 分化 → 训练日顺序 + 推荐频率 ——
// freq 取值必须是 kb.FREQ 的合法键（w3/w4/w5/w6/c3/c4/c5）
const SPLITS = {
  full: { name: '全身循环（新手）', foci: ['full'], freq: 'w3', level: '新手', src: SRC.YUAN,
    basis: '新手神经适应期：全身循环、每周多练，降低受伤风险、契合 30-50 岁忙人。' },
  ppl: { name: '推拉腿（三分化）', foci: ['push', 'pull', 'leg'], freq: 'c3', level: '进阶', src: SRC.YUAN,
    basis: '推＝胸+肩中束+三头；拉＝背+后束+二头；腿＝后侧链为主。练三天休一天，单次 80 分钟内（谭成义×凯圣王三分化①原文）。' },
  cpbsl: { name: '四分化', foci: ['chest', 'back', 'shoulder', 'legs'], freq: 'c4', level: '进阶', src: SRC.TUI,
    basis: '【推演】胸+三头 → 背+后束+二头 → 肩 → 腿。骨架取自凯圣王居家四分化（D1胸三头→D2背二头→D3下肢→D4肩），后束按谭成义拉日逻辑归入背日。' },
  five: { name: '五分化', foci: ['f_chest', 'f_back', 'f_shoulder', 'f_arm', 'f_leg'], freq: 'c5', level: '熟练', src: SRC.TUI,
    basis: '【推演】胸 → 背 → 肩 → 手臂 → 腿。源方明确提示「五分化对恢复要求高、不太适合新手」，请确认自身恢复能力后再选。' }
}

// —— 组×次数（按目标 × 经验 × 动作角色）——
// 保持 'N×M' 格式（首位是组数），以兼容 today.js:setCount 与云函数邮件渲染
const SETS_BY_GOAL = {
  增肌: { 新手: { 主项: '4×10', 辅助: '4×12', 孤立: '4×15', 核心: '3×15-20' },
          进阶: { 主项: '4×8', 辅助: '4×12', 孤立: '4×15', 核心: '3×15-20' },
          熟练: { 主项: '4×8', 辅助: '4×10', 孤立: '4×12', 核心: '3×15-20' } },
  // 增肌减脂同步（recomp）：主项保留中低次数以保住力量与肌肉，孤立用中高次数，热量≈维持
  增肌减脂同步: { 新手: { 主项: '3×12', 辅助: '3×12', 孤立: '3×15', 核心: '3×20' },
                  进阶: { 主项: '4×10', 辅助: '4×10', 孤立: '3×15', 核心: '3×20' },
                  熟练: { 主项: '4×8', 辅助: '4×10', 孤立: '4×12', 核心: '3×20' } },
  减脂: { 新手: { 主项: '3×12', 辅助: '3×15', 孤立: '3×15', 核心: '3×20' },
          进阶: { 主项: '4×12', 辅助: '3×15', 孤立: '3×15', 核心: '3×20' },
          熟练: { 主项: '4×12', 辅助: '4×15', 孤立: '4×15', 核心: '4×20' } },
  塑形: { 新手: { 主项: '3×12', 辅助: '3×12', 孤立: '3×15', 核心: '3×15-20' },
          进阶: { 主项: '4×12', 辅助: '4×12', 孤立: '4×15', 核心: '3×15-20' },
          熟练: { 主项: '4×12', 辅助: '4×12', 孤立: '4×15', 核心: '3×15-20' } }
}

// 主项线性递进阶梯（原文：15次热身 → 3组 12/10/8 → 过渡到 4×8 → 4组6次 → 4组5次，全程 RPE8）
// week 为计划内周次（1 基）；超出阶梯则维持最后一档
const MAIN_LADDER = ['4×12', '4×10', '4×8', '4×6', '4×5']
const MAIN_NOTE = '主项首组用「能做20次的轻重量」做15次刷熟练度；正式组保留约2次余量（RPE8），初期不做到力竭。'

// 组间休息（秒）——原文：ATP 恢复 3-5 分钟，大肌群复合约 4 分钟；小肌群/孤立另算
const REST = { 主项: 180, 辅助: 150, 孤立: 90, 核心: 60 }
// 大重量多关节复合动作：组间休息拉到 4 分钟（用户 2026-10-14 指出"卧推深蹲 1 分半会被压死"，
// 谭原文口径本来就是大肌群复合 3-5 分钟 → 主项里这些动作给 240，其余主项仍 180）
const BIG_COMPOUND = ['深蹲', '卧推', '硬拉', '腿举', '推举']
const REST_NOTE = '单次 84-90 分钟约 20 组；训练超时先砍辅助动作的组数，不缩短组间休息。深蹲/卧推/硬拉等大重量复合动作休息 4 分钟，感觉没缓过来就再歇 30-60 秒。'

// 强度约定
const RPE = {
  主项: 'RPE8（留 2 次余量）',
  辅助: 'RPE8；熟练后最后两组可接近力竭',
  孤立: '可到力竭（最多两组）',
  核心: '可到力竭'
}

// 核心/腹部（原文：真空腹每日；腹肌 8×40、旋身举腿 5×20 等）
const CORE = {
  n: 1,
  sets: '3×15-20',
  note: '每日必带。吐气收紧、起半程、不必完全起身。另建议每日做「真空腹」：假吸 → 仰卧 → 支撑位 → 站姿，逐步延长维持时间。'
}

// 有氧（原文：一周 3-4 次、单次 30-40min；或间歇 20min = 4×(3min快走+2min快跑)）
const CARDIO = {
  type: '间歇跑 / 爬楼',
  detail: '20min = 4×(3min 快走 + 2min 快跑)',
  alt: '或爬楼 100 层（分次完成）',
  perWeek: '3-4 次',
  optional: true,
  src: SRC.YUAN,
  note: '固定时长只提强度，不延长时长。减脂期放在力量训练之后或休息日。'
}

// 减载（原文精神：超时先砍辅助组数；本处按 4 周周期化处理）
const DELOAD = {
  everyWeeks: 4,
  setsFactor: 0.6,
  keepWarmup: true,
  note: '第 4/8/12 周为减载周：正式组数 ×0.6，热身与时长不变；先砍辅助动作组数，不缩短组间休息。'
}

// —— 每日消耗：活动系数（在 BMR 基础上乘）——
// 分档描述同时覆盖「日常行为」和「训练量」，所以用户只要选一档即可
const ACTIVITY = [
  { key: 'sed', name: '久坐', factor: 1.2, desc: '办公室/居家为主，日常走动少，基本不训练' },
  { key: 'lit', name: '轻度', factor: 1.375, desc: '日常走动较多，每周训练 2–3 次' },
  { key: 'mod', name: '中度', factor: 1.55, desc: '练四休一 / 每周 4–6 练，每次 60–90 分钟力量（多数认真训练的人在这档）' },
  { key: 'high', name: '高度', factor: 1.725, desc: '每天 1 练以上、或体力工作 + 规律训练' },
  { key: 'max', name: '极高', factor: 1.9, desc: '体力劳动 + 每天高强度训练（运动员级）' }
]
function activityOf(key) {
  return ACTIVITY.find(a => a.key === key) || ACTIVITY[2]   // 默认「中度」
}
// 没填活动量时按每周训练天数猜一个
function defaultActivity(days) {
  const d = Number(days) || 3
  if (d >= 6) return 'high'
  if (d >= 4) return 'mod'
  if (d >= 2) return 'lit'
  return 'sed'
}

// —— 饮食（以谭成义为主）——
// 脂肪 g/kg 三口径裁决：增肌/同步/塑形取 0.7（0.6-0.8 卡中值）、减脂取 0.8（通用卡下沿）；备赛 0.5 暂不开放
const DIET = {
  fatPerKg: { 增肌: 0.7, 增肌减脂同步: 0.7, 塑形: 0.7, 减脂: 0.8 },
  // 谭成义：增肌看训练强度、不靠大盈余；减脂缺口只开 200-300；同步取更小的 200
  kcalRule: { 增肌: 130, 增肌减脂同步: -200, 减脂: -300, 塑形: 0 },
  meals: [
    { key: '早', name: '早餐', pct: 0.25, type: 'main' },
    { key: '午', name: '午餐', pct: 0.35, type: 'main' },
    { key: '练后', name: '练后加餐', pct: 0.10, type: 'snack' },
    { key: '晚', name: '晚餐', pct: 0.30, type: 'main' }
  ],
  notes: [
    '固定吃 7-10 天再校准，别天天改数字。',
    '很饿且渴望干净碳水 → 碳水 +0.5g/kg；微微饥饿 → 不动；不饿 → 碳水 −0.5g/kg。',
    '放屁多且臭 → 蛋白 −0.2g/kg；没有 → 可 +0.2（上限 2.0）。',
    '蔬菜 500-800g/天；碳水选低 GI（米/薯/土豆/玉米/燕麦），高 GI 放练后。'
  ]
}

// —— 便捷查询 ——
function dayOf(focusKey) { return DAYS[focusKey] || null }
function splitList() {
  return Object.keys(SPLITS).map(k => ({
    key: k, name: SPLITS[k].name, level: SPLITS[k].level,
    src: SPLITS[k].src, basis: SPLITS[k].basis, freq: SPLITS[k].freq
  }))
}
function restOf(role, name) {
  if (role === '主项') {
    const n = String(name || '')
    if (BIG_COMPOUND.some(k => n.indexOf(k) >= 0)) return 240
    return REST.主项
  }
  return REST[role] || 120
}
function rpeOf(role) { return RPE[role] || RPE.辅助 }
function setsOf(goal, exp, role, week) {
  const g = SETS_BY_GOAL[goal] || SETS_BY_GOAL.塑形
  const e = g[exp] || g.新手
  if (role === '主项' && week) {
    const idx = Math.min(Math.max(1, week), MAIN_LADDER.length) - 1
    return MAIN_LADDER[idx]
  }
  return e[role] || e.辅助
}
// 该分化日是否自带腹部动作
function hasOwnAbs(focusKey) {
  if (ABS_PRESET[focusKey]) return true
  const d = DAYS[focusKey]
  return !!(d && d.parts.some(p => p.part === 'abs'))
}
function absCountOf(focusKey) {
  if (ABS_PRESET[focusKey]) return ABS_PRESET[focusKey]
  const d = DAYS[focusKey]
  if (!d) return CORE.n
  return d.parts.some(p => p.part === 'abs') ? 0 : CORE.n
}

// 动作模式 → 角色（决定组次与组间休息）；主项由引擎单独标记（每天第一个动作）
function roleOfPattern(p) {
  if (p === 'core') return '核心'
  return ISOLATION_PATTERNS.indexOf(p) >= 0 ? '孤立' : '辅助'
}

module.exports = {
  METHOD_VERSION, SRC,
  DAYS, SPLITS, ABS_PRESET, ISOLATION_PATTERNS,
  SETS_BY_GOAL, MAIN_LADDER, MAIN_NOTE,
  REST, REST_NOTE, RPE, CORE, CARDIO, DELOAD, DIET, BIG_COMPOUND,
  ACTIVITY, activityOf, defaultActivity,
  dayOf, splitList, restOf, rpeOf, setsOf, hasOwnAbs, absCountOf, roleOfPattern
}
