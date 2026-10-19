/**
 * shared/journal.js —— 训练日志：一次训练留下的「一句话 + 主题 + 照片」
 *
 * 这一层只放纯逻辑（浏览器 / 云函数 / node 测试共用），不碰 DOM、不碰 localStorage。
 * 页面侧只负责画，规则全在这里，方便回归测试。
 *
 * 两条产品红线（用户 2026-09-22 明确要做的东西，但边界必须写死）：
 *   ① **照片只存本机，永不上传。** 对比的竞品也是这么做的（"照片/语音仅存本地"）。
 *      理由：手机相册照片带 GPS / 人脸，上传就是给自己找合规麻烦，而且没收益。
 *   ② **突破（PR）是算出来的，不是用户填的。** 用户只需练完打勾，
 *      「今天卧推 80kg 创新高」由历史打卡比对得出 —— 少一步手填，多一个发朋友圈的理由。
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else { root.Journal = factory() }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var J = {
    // 可选主题：给不想写字的人一个"一次点选"的出口
    TAGS: ['突破', '状态好', '状态一般', '状态差', '心得', '饮食', '卡点'],
    NOTE_MAX: 200,          // 一句话最多 200 字（真"一句话"，不是小作文）
    SUBJECT_MAX: 24,        // 简短标题（可选）
    // 照片预算（localStorage 只有 5MB，撑爆了整站数据一起丢）
    PHOTO_MAX_ITEMS: 24,    // 最多留 24 张
    PHOTO_MAX_KB: 2600,     // 照片总量上限 2.6MB
    PHOTO_MAX_EDGE: 900,    // 存之前最长边压到 900px
    PHOTO_QUALITY: 0.72,    // JPEG 质量
    // 突破判定
    PR_MIN_WEIGHT: 20,      // 20kg 以下不报突破（空杆/小哑铃噪音太多）
    PR_MIN_REPS: 1
  }

  function round(n, d) {
    var p = Math.pow(10, d || 0)
    return Math.round((Number(n) || 0) * p) / p
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0 }

  /* ─────────── 一、突破识别（PR）─────────── */

  /** 单次训练里每个动作的最重一组；只算"打勾完成"的组 */
  function topSetsOf(exercises) {
    var out = {}
    ;(exercises || []).forEach(function (ex) {
      var name = String((ex && ex.name) || '').trim()
      if (!name) return
      var best = null
      ;((ex && ex.log) || []).forEach(function (s) {
        if (s && s.done === false) return
        var w = num(s && s.weight)
        var r = num(s && s.reps)
        if (r <= 0) return
        // 自重动作（引体/俯卧撑/卷腹）重量填 0 也要算 —— 否则这类动作永远上不了榜
        if (w < 0) return
        // 比大小先看重量；同重量看次数（80×9 强于 80×8；0kg 就纯比次数）
        if (!best || w > best.weight || (w === best.weight && r > best.reps)) {
          best = { weight: w, reps: r }
        }
      })
      if (best) {
        var prev = out[name]
        if (!prev || best.weight > prev.weight ||
          (best.weight === prev.weight && best.reps > prev.reps)) out[name] = best
      }
    })
    return out
  }

  /**
   * 找突破。history 传**不含今天**的历史打卡。
   * 返回 [{ name, weight, reps, prevWeight, prevReps, kind, delta }]
   *   kind: 'weight' 重量新高 / 'reps' 同重量次数新高 / 'first' 该动作第一次有记录
   */
  function findPRs(todayExercises, history, opts) {
    var o = opts || {}
    var mini = o.minWeight === undefined ? J.PR_MIN_WEIGHT : o.minWeight
    var today = topSetsOf(todayExercises)

    // 历史最好成绩
    var best = {}
    ;(history || []).forEach(function (ck) {
      var t = topSetsOf(ck && ck.exercises)
      Object.keys(t).forEach(function (k) {
        var v = t[k]
        if (!best[k] || v.weight > best[k].weight ||
          (v.weight === best[k].weight && v.reps > best[k].reps)) best[k] = v
      })
    })

    var prs = []
    Object.keys(today).forEach(function (name) {
      var t = today[name]
      var bodyweight = (t.weight === 0)              // 自重动作：只比次数
      // 2026-10-18 女性线：20kg 门槛只拦「首次记录」（空杆/小哑铃噪音）；
      // 有历史记录的动作走正常比较 —— 否则女生 2kg→3kg 哑铃永远算不出突破
      var b = best[name]
      if (!b) {
        if (!bodyweight && t.weight < mini) return    // 小重量哑铃/空杆不报，噪音太多
        if (bodyweight && t.reps < 5) return          // 自重第一次至少 5 次才值得说
        prs.push({ name: name, weight: t.weight, reps: t.reps, prevWeight: 0, prevReps: 0, kind: 'first', delta: 0 })
      } else if (bodyweight) {
        if (t.reps > b.reps) {
          prs.push({
            name: name, weight: 0, reps: t.reps, prevWeight: 0, prevReps: b.reps,
            kind: 'reps', delta: round(t.reps - b.reps, 1)
          })
        }
      } else if (t.weight > b.weight) {
        prs.push({
          name: name, weight: t.weight, reps: t.reps,
          prevWeight: b.weight, prevReps: b.reps, kind: 'weight', delta: round(t.weight - b.weight, 1)
        })
      } else if (t.weight === b.weight && t.reps > b.reps) {
        prs.push({
          name: name, weight: t.weight, reps: t.reps,
          prevWeight: b.weight, prevReps: b.reps, kind: 'reps', delta: round(t.reps - b.reps, 1)
        })
      }
    })
    // 重量突破排前面，其次是加得多
    prs.sort(function (a, b) {
      var rank = { weight: 0, reps: 1, first: 2 }
      return (rank[a.kind] - rank[b.kind]) || (b.delta - a.delta) || a.name.localeCompare(b.name)
    })
    return prs
  }

  /** 突破的一句话说法（页面直接贴） */
  function prText(pr) {
    if (!pr) return ''
    if (pr.kind === 'first') {
      return pr.weight > 0
        ? pr.name + ' ' + pr.weight + 'kg × ' + pr.reps + '，第一次记录'
        : pr.name + ' ' + pr.reps + ' 次，第一次记录'
    }
    if (pr.kind === 'reps') {
      return pr.weight > 0
        ? pr.name + ' ' + pr.weight + 'kg 做到 ' + pr.reps + ' 次（多了 ' + pr.delta + ' 次）'
        : pr.name + ' 做到 ' + pr.reps + ' 次（多了 ' + pr.delta + ' 次）'
    }
    return pr.name + ' ' + pr.weight + 'kg × ' + pr.reps + '，比上次重了 ' + pr.delta + 'kg'
  }

  /* ─────────── 二、日志条目 ──────────── */

  function clampText(s, max) {
    // 控制字符清掉 + **两端 trim**：用户在输入框里敲了几个空格，不算"写了记录"
    var t = String(s === undefined || s === null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim()
    if (t.length > max) t = t.slice(0, max)
    return t
  }

  /** 规范化一条日志（空内容返回 null，页面据此判断"还没写"） */
  function normalize(note) {
    var n = note || {}
    var tag = J.TAGS.indexOf(n.tag) >= 0 ? n.tag : ''
    return {
      text: clampText(n.text, J.NOTE_MAX),
      subject: clampText(n.subject, J.SUBJECT_MAX),
      tag: tag,
      // 照片只记"本机键名"，内容在主站自己的存储里，绝不跟着 checkin 上云
      photos: (n.photos || []).slice(0, 6),
      at: num(n.at)
    }
  }

  /** 是否算"写了东西" */
  function hasContent(note) {
    var n = normalize(note)
    return !!(n.text || n.subject || n.tag || (n.photos && n.photos.length))
  }

  /**
   * 把日志并进打卡数组（纯函数，返回新数组）。
   * 注意：**日志不上云**，云侧 webApi 会主动剥掉 note/photos 字段（见 sanitizeCheckin）。
   */
  function upsertNote(checkins, date, note) {
    var list = (checkins || []).slice()
    var i = -1
    for (var k = 0; k < list.length; k++) { if (list[k] && list[k].date === date) { i = k; break } }
    if (i < 0) {
      // 没打过卡也可以先写一句话（"今天没练，因为加班到 11 点"——这也值得记）
      if (!hasContent(note)) return list
      list.push({ date: date, trained: false, exercises: [], note: normalize(note) })
      return list.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0) })
    }
    var cur = list[i] || {}
    var merged = normalize(Object.assign({}, cur.note || {}, note || {}))
    if (!hasContent(merged)) {
      // 全删空了 → 把 note 字段去掉（别留一个空对象在数据里）
      var copy = Object.assign({}, cur)
      delete copy.note
      list[i] = copy
      return list
    }
    list[i] = Object.assign({}, cur, { note: merged })
    return list
  }

  /** 取某天的日志 */
  function noteOf(checkin) {
    if (!checkin || !checkin.note) return null
    return hasContent(checkin.note) ? normalize(checkin.note) : null
  }

  /* ─────────── 三、照片预算（本机存储）─────────── */

  /**
   * 算要淘汰哪些照片。photos 是索引数组（每项 {k, kb, at, pinned}），
   * incoming 是准备新加的照片体积（KB）。返回要删掉的 key 列表。
   * 策略：先按"超出条数"淘汰最旧的，再按"超出体积"继续淘汰；突破那天的可以钉住不删。
   */
  function planEvict(photos, incoming, opts) {
    var o = opts || {}
    var maxItems = o.maxItems === undefined ? J.PHOTO_MAX_ITEMS : o.maxItems
    var maxKB = o.maxKB === undefined ? J.PHOTO_MAX_KB : o.PHOTO_MAX_KB
    var list = (photos || []).slice().sort(function (a, b) { return num(a.at) - num(b.at) })  // 旧→新
    var addKB = num(incoming)
    // 新加的这张也要占一个名额，否则永远会多留一张（测试抓出来的）
    var addCount = addKB > 0 ? 1 : 0
    var victims = []
    // 一：条数超了
    var alive = list.slice()
    while (alive.length + addCount > maxItems) {
      var v = alive.find(function (p) { return !p.pinned })
      if (!v) break                      // 全钉住了就不删（宁可超一点）
      victims.push(v.k)
      alive = alive.filter(function (p) { return p.k !== v.k })
    }
    // 二：体积超了
    // 注意：cur 必须按「淘汰后还在的」重算，不能拿 total（含已淘汰的）
    var cur = alive.reduce(function (a2, p) { return a2 + num(p.kb) }, 0) + addKB
    for (var i = 0; i < alive.length && cur > maxKB; i++) {
      if (alive[i].pinned) continue
      victims.push(alive[i].k)
      cur -= num(alive[i].kb)
    }
    return victims
  }

  /** dataURL 的近似体积（KB）：base64 每 4 字符 3 字节 */
  function dataUrlKB(dataUrl) {
    var s = String(dataUrl || '')
    var i = s.indexOf(',')
    var b64 = i >= 0 ? s.slice(i + 1) : s
    return round(b64.length * 3 / 4 / 1024, 1)
  }

  /* ─────────── 四、给页面用的派生 ──────────── */

  /** 那天的训练摘要：动作数 / 组数 / 容量吨 / 突破数 */
  function dayStats(checkin, history) {
    var exs = (checkin && checkin.exercises) || []
    var sets = 0, vol = 0, doneSets = 0
    exs.forEach(function (ex) {
      ;((ex && ex.log) || []).forEach(function (s) {
        if (s && s.done === false) return
        var w = num(s && s.weight), r = num(s && s.reps)
        if (w <= 0 || r <= 0) return
        sets++; doneSets++; vol += w * r
      })
    })
    var prs = history ? findPRs(exs, history) : []
    return { exercises: exs.length, sets: sets, volume: vol, prs: prs, prCount: prs.length }
  }

  /**
   * 时间线：值得回顾的日子，倒序（最近在前）。
   * 「值得回顾」= 写了文字 / 有照片 / 那天真练了（至少记录了一组）。
   * 只打了卡但一个动作都没填的日子不算 —— 列出来全是"0 个动作 · 0 组"，纯噪音（实测发现的）。
   */
  function timeline(checkins, opts) {
    var o = opts || {}
    var limit = o.limit || 30
    return (checkins || [])
      .filter(function (ck) {
        if (!ck || !ck.date) return false
        if (noteOf(ck)) return true
        if (ck.note && (ck.note.photos || []).length) return true
        return !!(ck.trained && hasLoggedSets(ck.exercises))
      })
      .sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0) })
      .slice(0, limit)
  }

  /** 那天是否至少记录了一组（有次数）—— 判断"真练了" */
  function hasLoggedSets(exercises) {
    var found = false
    ;(exercises || []).forEach(function (ex) {
      ;((ex && ex.log) || []).forEach(function (s) {
        if (!found && s && num(s.reps) > 0) found = true
      })
    })
    return found
  }

  /** 一句话回顾（首页/存档页可以用） */
  function latestWords(checkins) {
    var t = timeline(checkins, { limit: 40 })
    for (var i = 0; i < t.length; i++) {
      var n = noteOf(t[i])
      if (n && n.text) return { date: t[i].date, text: n.text, tag: n.tag }
    }
    return null
  }

  return {
    J: J, TAGS: J.TAGS,
    round: round,
    topSetsOf: topSetsOf, findPRs: findPRs, prText: prText,
    normalize: normalize, hasContent: hasContent, upsertNote: upsertNote, noteOf: noteOf,
    planEvict: planEvict, dataUrlKB: dataUrlKB,
    dayStats: dayStats, timeline: timeline, latestWords: latestWords, hasLoggedSets: hasLoggedSets
  }
})
