// A training save must not overwrite unchanged fields owned by nutrition/recovery pages.
function trainingPatch(doc,baseline){
 const patch={date:doc.date,dayIndex:doc.dayIndex,trained:doc.trained,exercises:doc.exercises}
 const base=baseline&&baseline.date===doc.date?baseline:null
 for(const key of ['dietLog','dietOk','waterMl','sleepHours','weight','note']){
  const current=key==='weight'?(Number(doc[key])||''):doc[key]
  const before=key==='weight'?(Number(base&&base[key])||''):(base&&base[key])
  if(base&&JSON.stringify(current)!==JSON.stringify(before)&&current!==undefined){
   patch[key]=key==='note'&&before&&typeof before==='object'&&typeof current==='string'?Object.assign({},before,{text:current}):current
  }
 }
 return patch
}
module.exports={trainingPatch}
