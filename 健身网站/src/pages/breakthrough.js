/* src/pages/breakthrough.js —— 破境/里程碑仪式卡（2026-10-18 按复查方案分层重写）
 *
 * 三类真实事件，不再混为一谈（旧版逢整十都写「境界突破·形象焕新·徽记入囊」，Lv.20 弹境界是假话）：
 *   境界突破：Lv.10/30/60/85（REALMS 真实边界）
 *   形象解锁：Lv.20/45/70/95（CHAR_STAGES 真实边界）
 *   修行里程碑：其余整十级（10/20/…/90 中非上述节点）
 * 规则：
 *   · 以「已跨过且未展示」判断（breakShown=已展示最高级），一次结算跨多节点合并成一张卡
 *   · 不锁经验、不设门槛、不虚构奖励（没有发放链路就不写「徽记已入囊中」）
 */
const PageBreak = {
  COMMENTS: [
    '哼，凡胎淬体百日，总算摸到了门槛。这不过是起点——老夫等着看你血肉成丹的那天。',
    '骨骼清奇，心性也算沉稳。此境若稳扎三月，胜过旁人蛮干一年。',
    '破了这一层，往后每一分力气都得用在刀刃上。组歇、睡眠、吃食，一样不许马虎。',
    '好。此境之名，老夫记下了。昭告天下也无妨——但炫耀一分，练十分。'
  ],

  /** 该不该弹：当前级高于已展示级，且区间内存在任一节点 */
  should(u) {
    if (!u) return false
    const lv = ENGINE.gamify.levelOf((u.gamify || {}).exp || 0).level
    return lv > (u.breakShown || 0) && this.events(u.breakShown || 0, lv).length > 0
  },

  /** (shown, lv] 区间内的节点分类 */
  events(shown, lv) {
    const realms = [10, 30, 60, 85], images = [20, 45, 70, 95]
    const evs = { realm: [], image: [], mile: [] }
    for (let l = Math.max(shown + 1, 1); l <= Math.min(lv, 99); l++) {
      if (realms.indexOf(l) >= 0) evs.realm.push(l)
      else if (images.indexOf(l) >= 0) evs.image.push(l)
      else if (l % 10 === 0) evs.mile.push(l)
    }
    return evs
  },

  /** 首页渲染后调用；有未展示节点就弹 */
  check() {
    const u = Store.state.user
    if (!u || !this.should(u)) return
    this.show(u)
  },

  show(u) {
    const lv = ENGINE.gamify.levelOf((u.gamify || {}).exp || 0).level
    const shown = u.breakShown || 0
    const evs = this.events(shown, lv)
    const realm = ENGINE.gamify.realmOf(lv.level)
    const stage = PageHome.charStageOf(lv.level)
    const comment = this.COMMENTS[Math.floor(Math.random() * this.COMMENTS.length)]
    // 主标题按最高事件定：境界 > 形象 > 里程碑
    const hasRealm = evs.realm.length > 0
    const hasImage = evs.image.length > 0
    const eyebrow = hasRealm ? '境 界 突 破' : hasImage ? '形 象 解 锁' : '修 行 里 程 碑'
    const parts = []
    if (hasRealm) {
      const rAt = evs.realm[evs.realm.length - 1]
      const rr = ENGINE.gamify.realmOf(rAt)
      parts.push('<b>跨入「' + Fmt.esc(rr.name) + '」</b>（Lv.' + evs.realm.join('、') + '）—— ' + Fmt.esc(rr.note || ''))
    }
    if (hasImage) {
      const iAt = evs.image[evs.image.length - 1]
      const st = PageHome.charStageOf(iAt)
      parts.push('<b>修行形象焕新</b>（Lv.' + evs.image.join('、') + '）—— 当前阶段：' + Fmt.esc(st.name))
    }
    if (evs.mile.length) {
      parts.push('<b>修行里程碑</b>（Lv.' + evs.mile.join('、') + '）—— 每十级一座碑，记载你走过的路')
    }
    const old = document.getElementById('breakModal'); if (old) old.remove()
    const el = document.createElement('div'); el.id = 'breakModal'
    el.innerHTML = '<div style="position:fixed;inset:0;z-index:2300;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box">' +
      '<div style="background:#0e1510;border:2px solid #d5bd87;border-radius:18px;max-width:380px;width:100%;padding:26px 20px 20px;text-align:center;color:#e8dcc0;max-height:88vh;overflow-y:auto">' +
        '<div style="font-size:12px;color:#a89668;letter-spacing:4px">' + eyebrow + '</div>' +
        '<div style="font-size:26px;font-weight:500;color:#d5bd87;margin-top:10px">Lv.' + lv.level + ' · ' + Fmt.esc(realm.name) + '</div>' +
        '<div style="height:1px;background:repeating-linear-gradient(90deg,#4a4030 0 6px,transparent 6px 10px);margin:14px 0"></div>' +
        '<div style="font-size:12px;color:#c9b98a;line-height:1.8;text-align:left">' + parts.map(p => '<div style="margin-top:6px">· ' + p + '</div>').join('') + '</div>' +
        '<img src="assets/characters/' + stage.file + '" alt="当前形象" style="height:110px;object-fit:contain;margin-top:8px" onerror="this.style.visibility=\'hidden\'">' +
        '<div style="font-size:11px;color:#a89668;margin-top:4px">当前形象：' + Fmt.esc(stage.name) + '期（Lv.' + stage.at + ' 解锁）</div>' +
        '<div style="margin-top:14px;padding:10px 12px;background:#1a2016;border-radius:10px;font-size:12px;color:#e8dcc0;line-height:1.7;text-align:left">「' + Fmt.esc(comment) + '」<div style="text-align:right;color:#a83232;font-size:10px;margin-top:3px">—— 玄衡</div></div>' +
        '<button class="btn" style="margin-top:16px;width:100%" id="breakGo">继 续 修 炼</button>' +
        '<div style="font-size:10px;color:#5f6b60;margin-top:8px">不锁经验 · 不设门槛 · 只说真实发生的事</div>' +
      '</div></div>'
    document.body.appendChild(el)
    document.getElementById('breakGo').onclick = () => this.markShown(lv.level)
  },

  markShown(lv) {
    const el = document.getElementById('breakModal'); if (el) el.remove()
    Store.patchUser({ breakShown: lv })
    UI.toast('已记录 · Lv.' + lv + ' —— 继续')
  }
}
