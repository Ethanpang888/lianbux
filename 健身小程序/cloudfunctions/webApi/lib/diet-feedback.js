const calc=require('./calc.js')
const STEPS={'很饿':{carb:.5,protein:-.2},'微饿':{carb:0,protein:0},'不饿':{carb:-.5,protein:.2}}
function hunger(ds,type,today){if(!STEPS[type])throw new Error('请选择饥饿程度');ds=ds||{};const last=(ds.hungerToday||{}).date===today?ds.hungerToday:null;let adj={carbAdj:ds.carbAdj||0,proteinAdj:ds.proteinAdj||0};if(last&&STEPS[last.key]){adj.carbAdj-=STEPS[last.key].carb;adj.proteinAdj-=STEPS[last.key].protein}return Object.assign({},ds,calc.applyHunger(type,adj),{hungerToday:{date:today,key:type},history:(ds.history||[]).filter(h=>h.date!==today).concat([{date:today,type}])})}
module.exports={hunger,STEPS}
