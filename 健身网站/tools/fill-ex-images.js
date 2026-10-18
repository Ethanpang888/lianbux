#!/usr/bin/env node
/**
 * tools/fill-ex-images.js —— 给「无图」的主流动作补上 free-exercise-db 的图片 URL
 *
 * ── 背景（2026-09-23 用户截图反馈）──
 *   「有一些动作我单看名字都不知道怎么做，新手更不懂」，截图里每个动作左边都是「无图」。
 *   查下来是两个问题叠在一起：
 *     ① 前端拿到课表后没回查动作库，图和要领根本没渲染（已修：today.js 的 exInfo）
 *     ② 动作库 250 条里 29 条 gif 为 null —— 而这 29 条恰好是最主流的那批
 *        （卧推 / 划船 / 下拉 / 推举 / 腿举 / 提踵 …），偏门动作反而都有图
 *   这些图在云存储里其实**存在**，只是中文名 → free-exercise-db 目录名的映射没配上。
 *
 * ── 做法 ──
 *   按下面的对照表把 `"gif": null` 换成双帧 URL。表里每个目录名都是逐个 curl 探测出来的
 *   （云存储不支持列目录，只能猜名字试），探测到的 200 才写进来；剩下的确实没有对应图，
 *   靠动作要领文字兜底（points 是 250/250 全覆盖的）。
 *
 * 用法：node tools/fill-ex-images.js            # 只看能补几条（dry-run）
 *       node tools/fill-ex-images.js --write    # 真写入
 *
 * ⚠️ exercises-data.js 是**引擎文件**：改完必须同步三份副本，否则 sync-engine --check 会拦。
 */
const fs = require('fs')
const path = require('path')

const FILE = path.resolve(__dirname, '..', '..', '健身小程序', 'utils', 'exercises-data.js')
const BASE = 'https://cloud1-d7gtp1mv1bfcc25df-1469515685.tcloudbaseapp.com/ex'

// 中文动作名 → free-exercise-db 目录名（逐个探测确认存在 0.jpg / 1.jpg）
const MAP = {
  杠铃卧推: 'Barbell_Bench_Press_-_Medium_Grip',
  上斜杠铃卧推: 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  上斜哑铃卧推: 'Incline_Dumbbell_Press',
  哑铃平板卧推: 'Dumbbell_Bench_Press',
  龙门架夹胸: 'Cable_Crossover',
  双杠臂屈伸: 'Dips_-_Chest_Version',
  高位下拉: 'Wide-Grip_Lat_Pulldown',
  杠铃划船: 'Bent_Over_Barbell_Row',
  T杠划船: 'T-Bar_Row_with_Handle',
  杠铃站姿推举: 'Barbell_Shoulder_Press',
  坐姿哑铃推举: 'Dumbbell_Shoulder_Press',
  绳索侧平举: 'Cable_Seated_Lateral_Raise',   // 2026-10-15 用户反馈原映射 Side_Lateral_Raise（哑铃站姿图）与要领不符
  器械推胸: 'Machine_Bench_Press',
  蝴蝶机夹胸: 'Butterfly',
  直臂下压: 'Rope_Straight-Arm_Pulldown',
  器械肩推: 'Machine_Shoulder_Military_Press',
  绳索下压: 'Triceps_Pushdown_-_Rope_Attachment',
  仰卧杠铃臂屈伸: 'EZ-Bar_Skullcrusher',
  绳索弯举: 'Standing_Biceps_Cable_Curl',
  哑铃保加利亚分腿蹲: 'Split_Squat_with_Dumbbells',
  平板支撑: 'Plank',
  徒手提踵: 'Calf_Raise_On_A_Dumbbell',
  反向蝴蝶机: 'Reverse_Flyes',
  哑铃锤式弯举: 'Hammer_Curls',
  俯卧腿弯举: 'Lying_Leg_Curls',
  站姿提踵: 'Standing_Calf_Raises',
  悬垂举腿: 'Hanging_Leg_Raise',
  腿举机: 'Leg_Press'
}

const write = process.argv.includes('--write')
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let src = fs.readFileSync(FILE, 'utf8')
const before = (src.match(/"gif":\s*null/g) || []).length
let done = 0, missed = []

Object.keys(MAP).forEach(cn => {
  const dir = MAP[cn]
  const re = new RegExp('("name":\\s*"' + esc(cn) + '"[\\s\\S]{0,320}?"gif":\\s*)null')
  if (!re.test(src)) { missed.push(cn); return }
  const arr = '[\n      "' + BASE + '/' + dir + '/0.jpg",\n      "' + BASE + '/' + dir + '/1.jpg"\n    ]'
  src = src.replace(re, '$1' + arr)
  done++
})

const after = (src.match(/"gif":\s*null/g) || []).length
console.log('原无图条目：' + before + ' 条')
console.log('本次可补：  ' + done + ' 条' + (missed.length ? '（未匹配：' + missed.join('、') + '）' : ''))
console.log('补后仍无图：' + after + ' 条（靠动作要领文字兜底，points 是 100% 覆盖的）')

if (write) {
  fs.writeFileSync(FILE, src)
  console.log('\n✅ 已写入 ' + FILE)
  console.log('⚠️ 别忘了同步副本：cd 健身网站 && node build/sync-engine.js --check')
} else {
  console.log('\n（dry-run，加 --write 才真写）')
}
