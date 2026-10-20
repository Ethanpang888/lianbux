const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),mp=path.join(root,'健身小程序'),C=require(path.join(mp,'utils/calc.js')),F=require(path.join(mp,'utils/diet-feedback.js')),M=require(path.join(mp,'utils/macro.js')),D=require(path.join(mp,'utils/diet.js'));
const female={gender:'女',age:26,height:165,weight:60,activity:'mod',goal:'减脂'},male={gender:'男',age:30,height:180,weight:90,activity:'mod',goal:'减脂'};
(async()=>{
let n=0;
for(const base of [female,male])for(const weight of [45,60,90,140])for(const activity of ['sed','lit','mod','high','max'])for(const pace of ['steady','intensive'])for(const kcalAdj of [-1000,-150,0,150]){
 const p={...base,weight,activity,fatLossPace:pace},e=C.energyPlan(p,{kcalAdj});
 assert(Number.isFinite(e.kcal));assert(e.deficit<=Math.min(500,Math.floor(e.tdee*.2)),JSON.stringify({p,e}));assert.equal(e.kcal,e.protein*4+e.carb*4+e.fat*9);n++;
}
assert.equal(C.energyPlan(male).fatLoss.key,'steady');assert.equal(C.energyPlan(male).fatLoss.baseDeficit,300);
assert(C.energyPlan({...male,fatLossPace:'intensive'}).deficit>=497);
const low=C.energyPlan({...female,height:150,weight:47,activity:'sed',fatLossPace:'intensive'});assert(low.fatLoss.eligible);assert(low.deficit<350);assert(low.deficit<=Math.floor(low.tdee*.2));
for(const p of [{...female,age:17},{...female,age:undefined},{...female,weight:45},{...female,gender:''}]){assert(!C.energyPlan({...p,fatLossPace:'intensive'}).fatLoss.eligible);assert.throws(()=>F.changePace(p,{},'intensive','2026-10-19'));}
assert.equal(C.fatLossChoices({...female,goal:'增肌'},{}),null);
for(const goal of ['增肌','塑形','增肌减脂同步'])assert.deepEqual(C.energyPlan({...female,goal}),C.energyPlan({...female,goal,fatLossPace:'intensive'}));
const custom={...female,dietReferenceTarget:{basis:D.referenceBasis(female),kcal:1900,protein:100,carb:240,fat:60}},state={carbAdj:.5,proteinAdj:-.2,hungerToday:{key:'很饿',date:'2026-10-19'},macro:{kcalAdj:-250,history:[{date:'2026-10-01',reason:'old'}]},extra:'retained'};
const before=JSON.stringify([custom,state]),patch=F.changePace(custom,state,'intensive','2026-10-19');assert.equal(JSON.stringify([custom,state]),before);assert.equal(C.energyPlan(custom).source,'reference');assert(!patch.profile.dietReferenceTarget);assert.equal(patch.dietState.macro.kcalAdj,0);assert.equal(patch.dietState.carbAdj,.5);assert.equal(patch.dietState.extra,'retained');assert.equal(patch.dietState.macro.history.length,2);assert.equal(patch.dietState.macro.lastAt,'2026-10-19');assert.equal(C.energyPlan(patch.profile).fatLoss.key,'intensive');assert.equal(F.changePace(patch.profile,patch.dietState,'steady','2026-10-19').profile.fatLossPace,'steady');
console.log('PASS '+n+' female/male, bodyweight, activity and macro-offset combinations; default, eligibility, custom targets and immutable switching');
// Execute the actual native handlers: failed write retains target, successful write persists and is usable after reload.
let native;const app={globalData:{openid:'pace-test',profile:{...female},dietState:state}},wx={showToast(){},getStorageSync(){}};let failed=true,saved;global.getApp=()=>app;global.wx=wx;
app.saveUser=async patch=>{if(failed)throw new Error('offline');saved=JSON.parse(JSON.stringify(patch))};const file=path.join(mp,'pages/diet/diet.js'),req=createRequire(file);
vm.runInNewContext(fs.readFileSync(file,'utf8'),{getApp:()=>app,require:s=>s.endsWith('/page.js')?p=>native=p:req(s),wx,console,Date,Promise,setTimeout,clearTimeout});native.setData=p=>Object.assign(native.data,p);native.refresh=()=>{};
await native.applyFatLossPace('intensive');assert(!app.globalData.profile.fatLossPace);assert.equal(native.data.paceBusy,false);failed=false;await native.applyFatLossPace('intensive');assert.equal(app.globalData.profile.fatLossPace,'intensive');assert.equal(C.energyPlan(saved.profile,M.combinedAdj(saved.dietState)).fatLoss.key,'intensive');assert(saved.dietState.hungerToday);
// Execute website handler including queued state and an API failure, without browser storage or a production account.
let web;const store={state:{user:{profile:{...male},dietState:state},token:'test'},_pending:{nick:'kept'},adj(){return M.combinedAdj(this.state.user.dietState)},saveCache(){},saveCloud(){}};
let apiFailed=true,received;const context={ENGINE:{calc:C,dietFeedback:F},Store:store,Api:{api:async(action,payload)=>{if(apiFailed)throw new Error('offline');received=payload;return{}}},Fmt:{esc:x=>String(x),todayStr:()=> '2026-10-19'},UI:{toast(){}},clearTimeout,setTimeout,console};vm.runInNewContext(fs.readFileSync(path.join(root,'健身网站/src/pages/diet.js'),'utf8')+'\nthis.page=PageDiet;',context);web=context.page;web.render=()=>{};
await web.applyFatLossPace('intensive');assert(!store.state.user.profile.fatLossPace);assert.equal(store._pending.nick,'kept');assert(!web.paceBusy);apiFailed=false;await web.applyFatLossPace('intensive');assert.equal(received.patch.nick,'kept');assert.equal(store.state.user.profile.fatLossPace,'intensive');assert.equal(store._pending,null);
const html=web.fatLossPaceCard(male,{});assert(html.includes('稳步减脂')&&html.includes('强化减脂')&&!/NaN|undefined/.test(html));
console.log('PASS actual native and website saves: rollback, pending patch preservation, reload persistence and matching controls');
})().catch(e=>{console.error(e);process.exitCode=1});
