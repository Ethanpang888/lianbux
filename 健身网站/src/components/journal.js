/* src/components/journal.js —— 训练日志 UI（今日页写 / 记录页看）
 *
 * 三件用户明确要的东西（对标的竞品也是这三件）：
 *   ① 拍一张照    ② 一段话（今天想说什么 / 突破了什么）    ③ 主题快选
 * 突破（PR）不用用户填 —— 由 Journal 比对历史打卡自动算出来，直接显示成徽章。
 *
 * 隐私：照片只进本机 localStorage（Store.addPhoto），**不上传**。页面里也要跟用户说清楚。
 */
const JournalUI = {
  // 当前编辑中的日期（跨 render 保留，因为每次输入都会重画照片区）
  editing: {},

  /* ─────────── 拍照 / 选图 ─────────── */

  pick(onOk, onErr) {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/*'
    // 手机上调相机（桌面浏览器会忽略这个属性，退化成选文件）
    if (/Android|iPhone|iPad|iPod/i.test((navigator || {}).userAgent || '')) inp.setAttribute('capture', 'environment')
    inp.onchange = () => {
      const f = inp.files && inp.files[0]
      if (!f) return
      const fr = new FileReader()
      fr.onload = () => this.shrink(String(fr.result), onOk, onErr)
      fr.onerror = () => onErr && onErr('这张图读不出来，换一张试试')
      fr.readAsDataURL(f)
    }
    inp.click()
  },

  /** 压到最长边 900px / JPEG 0.72 —— 不压的话一张手机原图 3-5MB，localStorage 直接爆 */
  shrink(dataUrl, onOk, onErr) {
    const max = ENGINE.journal.J.PHOTO_MAX_EDGE
    const q = ENGINE.journal.J.PHOTO_QUALITY
    const img = new Image()
    img.onload = () => {
      let w = img.width || 0, h = img.height || 0
      if (!w || !h) { onErr && onErr('图片尺寸读不出来'); return }
      const scale = Math.min(1, max / Math.max(w, h))
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      const ctx = cv.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      try { onOk(cv.toDataURL('image/jpeg', q), { w: w, h: h }) }
      catch (e) { onErr && onErr('压缩失败') }
    }
    img.onerror = () => onErr && onErr('这张图打不开，换一张试试')
    img.src = dataUrl
  },

  /* ─────────── 编辑器 ─────────── */

  /**
   * 编辑器 HTML。date 是日期，compact 用于"今日页只放一条按钮"的折叠形态。
   */
  render(date, opts) {
    const o = opts || {}
    const ck = Store.checkinOf(date) || {}
    const n = ENGINE.journal.noteOf(ck) || { text: '', subject: '', tag: '', photos: [] }
    const photos = Store.photosOf(date)
    const prs = Store.prsOf(date)
    const isToday = date === Fmt.todayStr()

    const tagChips = ENGINE.journal.TAGS.map(t =>
      '<button class="chip ' + (n.tag === t ? 'on' : '') + '" data-tag="' + Fmt.esc(t) + '">' +
      Fmt.esc(t) + '</button>').join('')

    const photoGrid = photos.length
      ? '<div class="ph-grid">' + photos.map(p =>
        '<div class="ph-item"><img src="' + p.src + '" alt="训练照片">' +
        '<button class="ph-del" data-del="' + p.k + '" title="删除">×</button></div>').join('') +
        '<button class="ph-add" id="phAdd">＋<span>再加</span></button></div>'
      : '<button class="ph-add wide" id="phAdd">📷 拍一张 / 选张图<span class="muted">（只存在你本机，不会上传）</span></button>'

    const prBox = prs.length
      ? '<div class="pr-box">' + prs.map(p =>
        '<div class="pr-line"><span class="pr-tag">突破</span>' + Fmt.esc(ENGINE.journal.prText(p)) + '</div>').join('') + '</div>'
      : ''

    const used = Store.photoUsage()

    return '<div class="card note-card" id="noteCard" data-date="' + date + '">' +
      '<h2>' + (isToday ? '今天留个记录' : Fmt.monthDay(date) + ' 的记录') +
        '<span class="mini">' + (n.text || n.tag ? '已写' : '可写可不写') + '</span></h2>' +

      (o.hideIntro ? '' :
        '<p class="muted txs">写一句今天就够了 —— 状态好、卡在哪、练完什么感觉。' +
        '照片只存在你自己的手机上，<b>不会上传</b>。</p>') +

      prBox +

      (o.tags === false ? '' : '<div class="chips" id="tagChips">' + tagChips + '</div>') +

      '<input class="note-subject" id="noteSubject" maxlength="' + ENGINE.journal.J.SUBJECT_MAX +
        '" placeholder="给今天起个标题（可不填）" value="' + Fmt.esc(n.subject || '') + '">' +

      '<textarea class="note-text" id="noteText" maxlength="' + ENGINE.journal.J.NOTE_MAX +
        '" placeholder="今天想说什么？比如：卧推第一次上到 80kg，肩不疼了；或者加班到 11 点，只做了 20 分钟。">' +
        Fmt.esc(n.text || '') + '</textarea>' +

      '<div class="note-count" id="noteCount">' + (n.text || '').length + ' / ' + ENGINE.journal.J.NOTE_MAX + '</div>' +

      photoGrid +

      '<div class="muted txs" style="margin-top:8px">本机照片 ' + used.count + ' 张 · ' +
        used.kb + ' KB / ' + used.limitKB + ' KB（超出会自动淘汰最旧的）</div>' +

      '<div class="note-actions">' +
        '<button class="btn" id="noteSave">保存记录</button>' +
        (o.showSkip ? '<button class="btn ghost" id="noteSkip">先不写</button>' : '') +
      '</div>' +
    '</div>'
  },

  /** 绑定编辑器事件。onSaved 保存成功后回调（页面用它刷新）。 */
  bind(date, onSaved, onSkip) {
    const $ = id => document.getElementById(id)
    const tagBox = $('tagChips')
    if (tagBox) {
      tagBox.querySelectorAll('button[data-tag]').forEach(btn => {
        btn.onclick = () => {
          const cur = tagBox.querySelector('.chip.on')
          if (cur && cur !== btn) cur.classList.remove('on')
          btn.classList.toggle('on')
        }
      })
    }

    const ta = $('noteText')
    const cnt = $('noteCount')
    if (ta && cnt) {
      ta.oninput = () => { cnt.textContent = ta.value.length + ' / ' + ENGINE.journal.J.NOTE_MAX }
    }

    const add = $('phAdd')
    if (add) {
      add.onclick = () => {
        this.pick(dataUrl => {
          const r = Store.addPhoto(date, dataUrl)
          if (r.error) { UI.toast(r.error); return }
          // 照片存好之后，把它挂到这条日志上（没打卡也能挂）
          const ck = Store.checkinOf(date) || {}
          const n = ENGINE.journal.noteOf(ck) || { text: '', subject: '', tag: '' }
          const cur = $('noteText'), curSub = $('noteSubject')
          const next = {
            text: cur ? cur.value : n.text,
            subject: curSub ? curSub.value : n.subject,
            tag: (tagBox && tagBox.querySelector('.chip.on') || {}).dataset ?
              tagBox.querySelector('.chip.on').dataset.tag : n.tag,
            photos: (n.photos || []).concat([r.k])
          }
          Store.saveNote(date, next)
          this.refresh(date, onSaved)
          UI.toast('照片已存在本机（不上传）')
        }, msg => UI.toast(msg))
      }
    }

    const grid = document.querySelectorAll('button[data-del]')
    grid.forEach(b => {
      b.onclick = () => {
        const k = b.dataset.del
        const ck = Store.checkinOf(date) || {}
        const n = ENGINE.journal.noteOf(ck) || {}
        Store.delPhoto(k)
        Store.saveNote(date, Object.assign({}, n, {
          photos: (n.photos || []).filter(x => x !== k)
        }))
        this.refresh(date, onSaved)
      }
    })

    const save = $('noteSave')
    if (save) {
      save.onclick = () => {
        const ta2 = $('noteText'), sub = $('noteSubject')
        const on = tagBox ? tagBox.querySelector('.chip.on') : null
        const ck = Store.checkinOf(date) || {}
        const cur = ENGINE.journal.noteOf(ck) || {}
        Store.saveNote(date, {
          text: ta2 ? ta2.value : '',
          subject: sub ? sub.value : '',
          tag: on ? on.dataset.tag : '',
          photos: cur.photos || [],
          at: Date.now()
        })
        UI.toast('记录已保存' + (Store.state.demo ? '（本机）' : ''))
        if (onSaved) onSaved()
      }
    }

    const skip = $('noteSkip')
    if (skip && onSkip) skip.onclick = onSkip
  },

  /** 只重画编辑器（不整页刷新，否则正在打的字会丢） */
  refresh(date, onSaved, opts) {
    const box = document.getElementById('noteBox')
    if (!box) return
    box.innerHTML = this.render(date, opts)
    this.bind(date, onSaved)
  },

  /* ─────────── 时间线（记录页）─────────── */

  timelineHTML(checkins, opts) {
    const o = opts || {}
    const list = ENGINE.journal.timeline(checkins, { limit: o.limit || 20 })
    if (!list.length) {
      return UI.empty('还没有记录。练完在「训练」页写一句，这里就会攒起来。')
    }
    return list.map(ck => {
      const n = ENGINE.journal.noteOf(ck)
      const date = ck.date
      const isToday = date === Fmt.todayStr()
      const history = (checkins || []).filter(c => c.date < date)
      const st = ENGINE.journal.dayStats(ck, history)
      const photos = Store.photosOf(date)

      const head = '<div class="tl-head">' +
        '<b>' + (isToday ? '今天' : Fmt.monthDay(date)) + '</b>' +
        '<span class="muted txs">' + Fmt.weekdayCN(date) + '</span>' +
        (ck.trained
          ? '<span class="tl-meta">' + st.exercises + ' 个动作 · ' + st.sets + ' 组' +
            (st.volume > 0 ? ' · ' + Fmt.num(st.volume / 1000, 1) + ' 吨' : '') + '</span>'
          : '<span class="tl-meta rest">休息日</span>') +
        '</div>'

      const prs = st.prs.length
        ? '<div class="pr-box">' + st.prs.slice(0, 3).map(p =>
          '<div class="pr-line"><span class="pr-tag">突破</span>' + Fmt.esc(ENGINE.journal.prText(p)) + '</div>').join('') + '</div>'
        : ''

      const body = n
        ? '<div class="tl-note">' +
            (n.tag ? '<span class="tl-tag">' + Fmt.esc(n.tag) + '</span>' : '') +
            (n.subject ? '<div class="tl-subject">' + Fmt.esc(n.subject) + '</div>' : '') +
            (n.text ? '<div class="tl-text">' + Fmt.esc(n.text) + '</div>' : '') +
          '</div>'
        : '<div class="muted txs">这天没有文字记录</div>'

      const ph = photos.length
        ? '<div class="ph-grid sm">' + photos.map(p =>
          '<button class="ph-thumb" data-view="' + date + '|' + p.k + '"><img src="' + p.src + '" alt=""></button>').join('') + '</div>'
        : ''

      return '<div class="tl-item" data-date="' + date + '">' + head + prs + body + ph +
        '<button class="tl-edit" data-edit="' + date + '">' +
        (n ? '改这条' : '补一条') + '</button></div>'
    }).join('')
  },

  /** 时间线事件：改 / 看图 */
  bindTimeline(onEdit) {
    document.querySelectorAll('button[data-edit]').forEach(b => {
      b.onclick = () => onEdit && onEdit(b.dataset.edit)
    })
    document.querySelectorAll('button[data-view]').forEach(b => {
      b.onclick = () => {
        const parts = String(b.dataset.view).split('|')
        const src = Store.photoSrc(parts[1])
        if (!src) { UI.toast('这张照片已经不在了'); return }
        UI.modal({
          title: Fmt.monthDay(parts[0]) + ' 的照片',
          body: '<img src="' + src + '" style="width:100%;border-radius:10px" alt="">' +
            '<div class="muted txs" style="margin-top:8px">这张照片只存在这台设备上，没有上传。</div>',
          okText: '关闭', cancelText: false
        })
      }
    })
  }
}
