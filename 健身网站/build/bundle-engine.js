#!/usr/bin/env node
/**
 * build/bundle-engine.js —— 把 CommonJS 引擎打包成浏览器可用的 window.ENGINE
 *
 * 不改动源文件一行：每个文件被包进 __def(name, function(module, exports, require){...})，
 * 运行时用一个 25 行的 loader 实现 CommonJS 语义（含缓存与 MODULE_NOT_FOUND）。
 *
 * 输出：dist/engine.js
 *   window.ENGINE = { kb, calc, method, diet, recipes, gamify, macro, journal, pro, __md5 }
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const KB = path.resolve(ROOT, '..', '健身小程序')
const UTILS = path.join(KB, 'utils')
const DIST = path.join(ROOT, 'dist')

// 依赖顺序只为可读，loader 是惰性 + 缓存，不依赖顺序
const MODULES = [
  { id: 'training-flow-data.js', file: path.join(UTILS,'training-flow-data.js') },
  { id: 'presentation.js', file: path.join(UTILS,'presentation.js') },
  { id: 'tcm-content.js', file: path.join(UTILS,'tcm-content.js') },
  { id: 'exercises-data.js', file: path.join(UTILS, 'exercises-data.js') },
  { id: 'method.js',         file: path.join(UTILS, 'method.js') },
  { id: 'recipes-data.js',   file: path.join(UTILS, 'recipes-data.js') },
  { id: 'kb.js',             file: path.join(UTILS, 'kb.js') },
  { id: 'diet.js',           file: path.join(UTILS, 'diet.js') },
  { id: 'calc.js',           file: path.join(UTILS, 'calc.js') },
  { id: 'gamify.js',         file: path.join(ROOT, 'shared', 'gamify.js') },
  { id: 'macro.js',          file: path.join(ROOT, 'shared', 'macro.js') },
  { id: 'journal.js',        file: path.join(ROOT, 'shared', 'journal.js') },
  { id: 'progression.js', file: path.join(UTILS,'progression.js') },
  { id: 'pro.js',            file: path.join(ROOT, 'shared', 'pro.js') },
  { id: 'coach.js',          file: path.join(ROOT, 'shared', 'coach.js') },
  { id: 'secret.js',         file: path.join(ROOT, 'shared', 'secret.js') },
  { id: 'plan-backup.js',    file: path.join(ROOT, 'shared', 'plan-backup.js') },
  { id: 'plus.js',           file: path.join(ROOT, 'shared', 'plus.js') }
]

const md5 = f => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex').slice(0, 8)

function main() {
  fs.mkdirSync(DIST, { recursive: true })
  const parts = []
  const fingerprints = {}

  parts.push('/* dist/engine.js —— 自动生成，请勿手改（源：健身小程序/utils + 健身网站/shared） */')
  parts.push('(function (root) {')
  parts.push('  var defs = {}, cache = {};')
  parts.push('  function req(id) {')
  parts.push("    var k = String(id).replace(/^\\.\\//, '');")
  parts.push("    if (!/\\.js$/.test(k)) k += '.js';")
  parts.push('    if (cache[k]) return cache[k].exports;')
  parts.push("    if (!defs[k]) throw new Error('MODULE_NOT_FOUND: ' + id);")
  parts.push('    var m = { exports: {} }; cache[k] = m;')
  parts.push('    defs[k](m, m.exports, req);')
  parts.push('    return m.exports;')
  parts.push('  }')
  parts.push('  function __def(n, f) { defs[n] = f }')

  MODULES.forEach(mod => {
    const code = fs.readFileSync(mod.file, 'utf8')
    fingerprints[mod.id] = md5(mod.file)
    parts.push('')
    parts.push('  /* ===== ' + mod.id + ' (md5 ' + fingerprints[mod.id] + ') ===== */')
    parts.push("  __def('" + mod.id + "', function (module, exports, require) {")
    parts.push(code)
    parts.push('  });')
  })

  parts.push('')
  parts.push('  root.ENGINE = {')
  parts.push("    trainingFlow: req('training-flow-data.js'), presentation: req('presentation.js'), tcm: req('tcm-content.js'), kb: req('kb.js'), calc: req('calc.js'), method: req('method.js'),")
  parts.push("    diet: req('diet.js'), recipes: req('recipes-data.js'), gamify: req('gamify.js'),")
  parts.push("    progression: req('progression.js'), macro: req('macro.js'), journal: req('journal.js'), pro: req('pro.js'), coach: req('coach.js'), secret: req('secret.js'), planBackup: req('plan-backup.js'), plus: req('plus.js'),")
  parts.push('    __md5: ' + JSON.stringify(fingerprints) + ',')
  parts.push("    __build: '" + new Date().toISOString() + "'")
  parts.push('  };')
  parts.push('})(window);')

  const out = path.join(DIST, 'engine.js')
  fs.writeFileSync(out, parts.join('\n'))
  const kb = Math.round(fs.statSync(out).size / 1024)
  console.log('✅ dist/engine.js  ' + kb + ' KB  模块数 ' + MODULES.length)
  console.log('   指纹 ' + JSON.stringify(fingerprints))
  if (kb > 340) console.log('   ⚠️ 超过 300KB，检查 exercises-data.js 是否被重复引入')
}

main()
