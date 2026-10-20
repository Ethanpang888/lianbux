const calc=require('./calc.js')
const STEPS={'很饿':{carb:.5,protein:-.2},'微饿':{carb:0,protein:0},'不饿':{carb:-.5,protein:.2}}
function hunger(ds,type,today){if(!STEPS[type])throw new Error('请选择饥饿程度');ds=ds||{};const last=(ds.hungerToday||{}).date===today?ds.hungerToday:null;let adj={carbAdj:ds.carbAdj||0,proteinAdj:ds.proteinAdj||0};if(last&&STEPS[last.key]){adj.carbAdj-=STEPS[last.key].carb;adj.proteinAdj-=STEPS[last.key].protein}return Object.assign({},ds,calc.applyHunger(type,adj),{hungerToday:{date:today,key:type},history:(ds.history||[]).filter(h=>h.date!==today).concat([{date:today,type}])})}
function changePace(profile,ds,key,today){
 if(!profile||profile.goal!=='减脂'||!['steady','intensive'].includes(key))throw new Error('请先将目标设为减脂，再选择减脂力度')
 const next=Object.assign({},profile,{fatLossPace:key});delete next.dietReferenceTarget
 const energy=calc.energyPlan(next,{})
 if(key==='intensive'&&!energy.fatLoss.eligible)throw new Error(energy.fatLoss.reason)
 const state=Object.assign({},ds||{}),old=state.macro||{}
 state.macro=Object.assign({},old,{kcalAdj:0,carbAdj:0,lastAt:today,history:(old.history||[]).concat([{date:today,reason:'切换为'+energy.fatLoss.name+'，重置热量偏移',kcalAdj:0,carbGrams:0}]).slice(-24)})
 return {profile:next,dietState:state}
}
module.exports={hunger,changePace,STEPS}
