// Both platforms consume these summaries. Rendering never changes the calculation units.
const macro=require('./macro.js'),journal=require('./journal.js')
function strength(checkins,today){
 const per={},cutoff=macro.shiftDate(today,-90)
 checkins.filter(c=>c.date>=cutoff&&c.date<=today).forEach(c=>(c.exercises||[]).forEach(e=>{
  if(!e||!e.name)return
  const target=parseInt(String(e.sets||'').split(/[×x]/i)[1],10)||10,p=per[e.name]||(per[e.name]={name:e.name,target,sets:e.sets||'',best:0,bestAt:'',bestRep:0,sessions:[]}),day={date:c.date,hit:false,logged:false}
  ;(e.log||[]).forEach(s=>{const w=Number(s.weight)||0,r=Number(s.reps)||0;if(w>0&&r>0&&s.done&&s.type!=='warmup'){day.logged=true;if(r>=target)day.hit=true;const v=w*(1+r/30);if(v>p.best){p.best=v;p.bestAt=c.date;p.bestRep=r}}})
  if(day.logged)p.sessions.push(day)
 }))
 return Object.values(per).filter(p=>p.best>0).sort((a,b)=>b.best-a.best).slice(0,8).map(p=>{let n=0;for(const s of p.sessions.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6)){if(s.hit)break;n++}return Object.assign({},p,{best:macro.round(p.best,1),stall:n>=2?n:0})})
}
function week(list,profile,today){
 const start=macro.shiftDate(today,-((new Date(today+'T00:00:00').getDay()+6)%7)),rows=list.filter(c=>c.date>=start&&c.date<=today).sort((a,b)=>a.date.localeCompare(b.date)),ws=rows.filter(c=>Number(c.weight)>0)
 const dw=ws.length>=2?macro.round(ws[ws.length-1].weight-ws[0].weight,1):null,span=ws.length>=2?Math.max(1,macro.dayDiff(ws[0].date,ws[ws.length-1].date)):1,w=Number(profile.weight)||0,pct=dw!==null&&w>0?dw/w*7/span:0,tgt=macro.GOAL_TARGET[profile.goal]||macro.GOAL_TARGET['塑形']
 let trend='本周体重记录不足 2 次（每天早起空腹称一次）'
 if(dw!==null)trend=pct<tgt.min?'本周掉得比目标快，请结合饮食页宏观调控建议复核':pct>tgt.max?'本周涨得比目标快，请结合饮食页宏观调控建议复核':'体重变化在目标区间内'
 return {label:start+' 起',trained:rows.filter(c=>c.trained).length,dwStr:dw===null?'—':(dw>0?'+':'')+dw+' kg',trend:trend+'。'+tgt.tip,spanDays:span,perWeekPct:macro.round(pct*100,2),note:'周报只看本周；宏观调控看近 10 天趋势，以宏观调控结论为准。'}
}
function timeline(list){return journal.timeline(list,{limit:20}).map(c=>{const n=journal.noteOf(c)||{},s=journal.dayStats(c,list.filter(x=>x.date<c.date));return {date:c.date,note:n,stats:s,prs:s.prs.map(journal.prText)}})}
module.exports={strength,week,timeline}
