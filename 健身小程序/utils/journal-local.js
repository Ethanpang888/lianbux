// 日志与照片仅存本机，与网站相同；云端训练记录不包含照片路径或内容。
const J=require('./journal.js')
function key(owner){return 'lbgym_journal_mp_'+owner}
function all(owner){const v=wx.getStorageSync(key(owner));return v&&typeof v==='object'?v:{}}
function note(owner,date,fallback){const n=all(owner)[date];return J.normalize(n|| (typeof fallback==='string'?{text:fallback}:fallback)||{})}
function save(owner,date,value){if(!owner)throw new Error('请先登录');const a=all(owner);a[date]=J.normalize(value);wx.setStorageSync(key(owner),a);return a[date]}
function merge(owner,rows){const a=all(owner),map={};rows.forEach(c=>{map[c.date]=Object.assign({},c,{note:note(owner,c.date,c.note)})});Object.keys(a).forEach(date=>{if(!map[date])map[date]={date,exercises:[],trained:false,note:a[date]}});return Object.values(map).sort((a,b)=>a.date.localeCompare(b.date))}
function photos(owner){const a=all(owner),out=[];Object.keys(a).sort().forEach(date=>(a[date].photos||[]).forEach(src=>out.push({date,src})));return out}
module.exports={all,note,save,merge,photos}
