#!/usr/bin/env node
/* tools/gen-code.js —— 生成激活码指纹
 *
 * 服务端只认指纹（cloudfunctions/webApi/index.js 的 CODES），明文不落代码 ——
 * 所以「改口令」这件事必须由这个脚本做，不能手写。
 *
 * 用法：
 *   node tools/gen-code.js "qing-pro-2026" pro 3650
 *       口令            等级  天数
 *   等级：pro = 完整版 / coach = 完整版 + AI 顾问
 *   天数：3650 ≈ 永久；订阅制填 30 / 90 / 365
 *
 * 输出一行，直接粘进 CODES 数组即可。改完记得重新部署 webApi：
 *   bash tools/deploy-fn.sh webApi
 */
const crypto = require('crypto')

const SALT = 'qing-plan-2026' // ⚠️ 必须和 webApi/index.js 里的 CODE_SALT 一致
const LEVELS = ['pro', 'coach']

function codeHash(plain) {
  return crypto.createHash('sha256')
    .update(String(plain).trim().toLowerCase() + '|' + SALT)
    .digest('hex').slice(0, 24)
}

const [code, level = 'pro', days = '30'] = process.argv.slice(2)

if (!code) {
  console.log('用法：node tools/gen-code.js "口令" pro 3650')
  console.log('     等级 pro=完整版 / coach=完整版+AI顾问；天数 3650≈永久')
  process.exit(1)
}
if (LEVELS.indexOf(level) < 0) {
  console.error('✗ 等级只能是：' + LEVELS.join(' / '))
  process.exit(1)
}
if (!/^\d+$/.test(days) || Number(days) < 1) {
  console.error('✗ 天数要是正整数（3650 ≈ 永久）')
  process.exit(1)
}

console.log('')
console.log('  { h: \'' + codeHash(code) + '\', level: \'' + level + '\', days: ' + days + ', note: \'\' },')
console.log('')
console.log('  （口令 ' + code + ' 只出现在这一行输出里，不会写进任何文件）')
console.log('')
