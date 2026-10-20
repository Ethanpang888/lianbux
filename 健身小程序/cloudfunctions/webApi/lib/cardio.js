// MET estimates; net expenditure excludes resting energy already in the daily baseline.
// Activity factors already include usual workouts. Only explicitly extra sessions add to TDEE.
const TYPES=[{key:'walk',name:'快走',met:3.5},{key:'cycle',name:'单车（中等）',met:5.5},{key:'jog',name:'慢跑',met:7},{key:'interval',name:'走跑间歇',met:6},{key:'elliptical',name:'椭圆机（中等）',met:5},{key:'incline',name:'坡度走（中等坡度）',met:5.3},{key:'stairs',name:'爬楼梯（持续上楼）',met:6.8}]
function clean(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
 const type=TYPES.find(x=>x.key===raw.type),minutes=Number(raw.minutes),weight=Number(raw.weight)
 if(!type||!Number.isFinite(minutes)||minutes<1||minutes>240)return null
 return {type:type.key,minutes:Math.round(minutes*10)/10,weight:Number.isFinite(weight)&&weight>20&&weight<400?weight:null,extra:raw.extra===true}
}
function estimate(raw){const c=clean(raw);if(!c)return null;const t=TYPES.find(x=>x.key===c.type),kcal=c.weight?Math.round((t.met-1)*3.5*c.weight/200*c.minutes):null;return Object.assign({},c,{name:t.name,met:t.met,kcal,added:c.extra?(kcal||0):0})}
function daily(base,raw){const c=estimate(raw),added=c?c.added:0;return {cardio:c,added,baseTdee:base.tdee,tdee:Math.round(base.tdee+added),deficit:Math.round(base.tdee+added-base.kcal)}}
module.exports={TYPES,clean,estimate,daily}
