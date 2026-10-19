/* 可选逐组递进：记录事实、目标快照与待确认建议分开保存。独立实现。 */
const VERSION=1
const round=n=>Math.round(n*1000)/1000
function key(ex){return String(ex.oid||ex.name||'')}
function scope(plan){return JSON.stringify([plan.cycleStart||'',plan.split||'',plan.program||'',!!plan.home])}
function normalizeConfig(raw){
  const c=Object.assign({},raw),n=k=>Number(c[k])
  if(!['load','assisted','bodyweight','time'].includes(c.kind))throw new Error('请选择正确的训练类型')
  if(!Number.isInteger(n('sets'))||n('sets')<1||n('sets')>10)throw new Error('工作组数需为1–10组')
  if(!Number.isInteger(n('min'))||!Number.isInteger(n('max'))||n('min')<1||n('max')<n('min')||n('max')>(c.kind==='time'?180:100))throw new Error('请检查次数/秒数上下限')
  if(!Number.isFinite(n('weight'))||n('weight')<0||n('weight')>1000)throw new Error('起始重量需为0–1000kg')
  if(['load','assisted'].includes(c.kind)&&n('weight')<=0)throw new Error('负重或助力动作请填写实际可完成的起始重量')
  if(!Number.isFinite(n('step'))||n('step')<=0||n('step')>100)throw new Error('重量步长需大于0且不超过100kg')
  const weights=Array.isArray(c.weights)?c.weights:String(c.weights||'').split(/[,，、\s]+/).filter(Boolean)
  if(weights.length>30||weights.some(w=>!Number.isFinite(Number(w))||Number(w)<=0||Number(w)>1000))throw new Error('器械档位最多30档，填写正数，用逗号分隔')
  Object.assign(c,{v:VERSION,sets:n('sets'),min:n('min'),max:n('max'),weight:['bodyweight','time'].includes(c.kind)?0:n('weight'),step:n('step'),weights:[...new Set(weights.map(Number))].sort((a,b)=>a-b)})
  if(c.weights.length&&['load','assisted'].includes(c.kind)&&!c.weights.includes(c.weight))throw new Error('起始重量需在已填写的器械档位中')
  return c
}
function configFor(ex,plan){const c=(plan.exerciseProgression||{})[key(ex)];return c&&c.scope===scope(plan)?c:null}
function cleanTarget(t){
  if(!t||t.v!==VERSION||t.policy!=='double'||typeof t.id!=='string'||typeof t.scope!=='string')return null
  try{const c=normalizeConfig(t);if(!Number.isInteger(Number(t.reps))||Number(t.reps)<c.min||Number(t.reps)>c.max)return null
    return {v:VERSION,policy:'double',id:t.id.slice(0,80),scope:t.scope.slice(0,300),kind:c.kind,sets:c.sets,min:c.min,max:c.max,reps:Number(t.reps),weight:c.weight,step:c.step,weights:c.weights,recovery:!!t.recovery}
  }catch(e){return null}
}
function matching(history,ex,c,before){
  return (history||[]).filter(ck=>ck.date&&(!before||ck.date<before)).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(ck=>{
    const e=(ck.exercises||[]).find(e=>(ex.oid&&e.oid===ex.oid)||e.name===ex.name),t=e&&cleanTarget(e.target)
    return t&&t.id===c.id&&t.scope===c.scope?{date:ck.date,e,t}:null
  }).filter(Boolean)
}
function fingerprint(row){return JSON.stringify([row.date,row.t,!!row.e.progressReady,(row.e.log||[]).map(s=>[s.type||'work',Number(s.weight)||0,Number(s.reps)||0,!!s.done])])}
function targetFor(ex,plan,history,date,recovery){
  const c=configFor(ex,plan);if(!c)return null
  let value={weight:c.weight,reps:c.min}
  if(c.accepted&&c.accepted.date<date){const source=matching(history,ex,c,date).find(r=>r.date===c.accepted.date)
    value=source&&fingerprint(source)===c.accepted.source?c.accepted.value:c.accepted.previous
  }
  const t=cleanTarget(Object.assign({},c,value,{v:VERSION,policy:'double',recovery:!!recovery}))
  if(t&&recovery)t.sets=Math.max(1,Math.round(t.sets*.6))
  return t
}
function working(row){return (row.e.log||[]).filter(s=>s.type!=='warmup').slice(0,row.t.sets)}
function performance(row){const rows=working(row),valid=rows.length===row.t.sets&&rows.every(s=>s.done&&Number.isFinite(Number(s.reps))&&Number(s.reps)>0);return {rows,valid,low:valid?Math.min(...rows.map(s=>Number(s.reps))):0}}
function suggestion(ex,plan,history,before){
  const c=configFor(ex,plan);if(!c)return null
  const rows=matching(history,ex,c,before),last=rows[0]
  if(!last)return {kind:'baseline',reason:'尚无这套目标的记录；先按已确认的起点校准，不用旧记录判定成败。'}
  const t=last.t,p=performance(last),same=p.rows.every(s=>Math.abs((Number(s.weight)||0)-t.weight)<.001),unit=t.kind==='time'?'秒':'次'
  const result=(kind,reason,value)=>({kind,reason,value:value||{weight:t.weight,reps:t.reps},source:fingerprint(last),date:last.date,previous:{weight:t.weight,reps:t.reps},summary:p.rows.map(s=>s.done?String(s.reps):'未完成').join(' / '),target:t})
  if(t.recovery)return result('hold','本次属于减载或状态调整，不据此加重或累计停滞。')
  if(!p.valid)return result('hold','工作组尚未全部完成；热身组与额外加做不用于达标判定，维持目标。')
  if(!same)return result('calibrate','实际重量与当时目标不同；先在递进设置中校准起点，不自动推高重量。')
  if(!last.e.progressReady)return result('hold','先确认动作稳定、没有疼痛且仍有余力；本次维持目标。')
  if(p.low>=t.max){
    if(t.kind==='bodyweight'||t.kind==='time')return result('hold','已达到当前上限。可继续巩固，准备好后再调整上限或选择更难版本。')
    const rack=t.weights||[],w=t.kind==='assisted'?(rack.length?rack.slice().reverse().find(x=>x<t.weight):Math.max(0,round(t.weight-t.step))):(rack.length?rack.find(x=>x>t.weight):round(t.weight+t.step))
    if(w==null||w===t.weight||w<=0||w>1000)return result('hold','当前器械没有合适的下一档，先维持；更换难度或器械后重新校准。')
    return result('up',t.kind==='assisted'?'全部工作组达到上限，下次可减少一档助力；先回到次数下限。':'全部工作组达到上限，下次可增加一档重量；先回到次数下限。',{weight:w,reps:t.min})
  }
  if(p.low>=t.reps)return result('reps','工作组达到本次目标，先增加'+(t.kind==='time'?'5秒':'1次')+'，重量保持。',{weight:t.weight,reps:Math.min(t.max,t.reps+(t.kind==='time'?5:1))})
  // 只比较同一目标；改善、漏记、换目标、减载都会打断停滞。
  let stalled=0,prev=null
  for(const r of rows){const q=performance(r);if(r.t.recovery||r.t.weight!==t.weight||r.t.reps!==t.reps||r.t.sets!==t.sets||!q.valid||!r.e.progressReady||q.rows.some(s=>Math.abs((Number(s.weight)||0)-t.weight)>.001)||q.low>=t.reps)break
    if(prev!==null&&prev>q.low)break;stalled++;prev=q.low;if(stalled>=3)break
  }
  if(stalled>=3&&['load','assisted'].includes(t.kind)){
    const rack=t.weights||[],desired=t.kind==='assisted'?round(t.weight/0.9):round(t.weight*.9)
    const w=t.kind==='assisted'?(rack.length?rack.find(x=>x>=desired):round(Math.ceil(desired/t.step)*t.step)):(rack.length?rack.slice().reverse().find(x=>x<=desired):round(Math.floor(desired/t.step)*t.step))
    if(w>0&&w!==t.weight)return result('deload','连续3次相同目标未完成且未改善，可先确认恢复情况，再采用减轻负担的建议。',{weight:w,reps:t.min})
  }
  return result('hold','尚未完成全部工作组目标，先维持；一次状态波动不自动减载。')
}
function label(t){if(!t)return '';const unit=t.kind==='time'?'秒':'次',load=t.kind==='bodyweight'?'自重':t.kind==='time'?'计时':(t.kind==='assisted'?'助力 ':'')+t.weight+'kg';return load+' · '+t.sets+'组 × '+t.reps+unit}
function accept(c,s){if(!c||!s)throw new Error("建议不存在，请重新读取记录");if(c.accepted&&c.accepted.source===s.source)throw new Error('这条建议已采用，无需重复确认');if(!s||!s.source||!s.value||['baseline','calibrate'].includes(s.kind))throw new Error('请先保存有效记录或校准目标');return Object.assign({},c,{previousAccepted:c.accepted||null,accepted:{date:s.date,source:s.source,value:s.value,previous:s.previous}})}
function adjustWeight(t,current,d,fallbackStep){
  const value=Number(current)||0,rack=t&&t.weights||[]
  if(rack.length){const next=d>0?rack.find(w=>w>value):rack.slice().reverse().find(w=>w<value);return next==null?value:next}
  return Math.max(0,Math.min(t?1000:300,round(value+d*(t?t.step:fallbackStep||2.5))))
}
function weightChoices(t,current,defaults){return [...new Set((t&&t.weights&&t.weights.length?t.weights:defaults||[]).concat([0,Number(current)||0]))].sort((a,b)=>a-b)}
module.exports={adjustWeight,weightChoices,VERSION,key,scope,normalizeConfig,configFor,cleanTarget,matching,fingerprint,targetFor,suggestion,label,accept}
