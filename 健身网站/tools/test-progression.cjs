const assert=require('node:assert/strict'),path=require('path'),fs=require('fs'),vm=require('vm');
const root=path.resolve(process.argv[2]||path.join(__dirname,"../..")),P=require(path.join(root,'健身小程序/utils/progression.js'));
let n=0;function check(f){f();n++}
let plan={cycleStart:'2026-10-01',split:'ppl',home:false},ex={oid:'curl',name:'哑铃弯举'};
let cfg=P.normalizeConfig({id:'a',scope:P.scope(plan),kind:'load',sets:3,min:8,max:12,weight:10,step:1,weights:[8,10,12,14]});plan.exerciseProgression={[P.key(ex)]:cfg};
const target=P.targetFor(ex,plan,[],'2026-10-17',false);
const ck=(date,reps,opts={})=>({date,exercises:[{...ex,target,progressReady:true,log:reps.map(r=>({weight:10,reps:r,done:true})),...opts}]});
let s=P.suggestion(ex,plan,[ck('2026-10-17',[12,11,9])]);check(()=>assert.equal(s.value.weight,10));check(()=>assert.equal(s.kind,'reps'));
s=P.suggestion(ex,plan,[ck('2026-10-17',[12,12,12])]);check(()=>assert.deepEqual(s.value,{weight:12,reps:8}));
let accepted=P.accept(cfg,s),acceptedPlan={...plan,exerciseProgression:{[P.key(ex)]:accepted}};
check(()=>assert.equal(P.targetFor(ex,acceptedPlan,[ck('2026-10-17',[12,12,12])],'2026-10-17',false).weight,10));
check(()=>assert.equal(P.targetFor(ex,acceptedPlan,[ck('2026-10-17',[12,12,12])],'2026-10-18',false).weight,12));
const day2=ck('2026-10-18',[8,8,8]);day2.exercises[0].target={...target,weight:12};day2.exercises[0].log.forEach(x=>x.weight=12);
check(()=>assert.equal(P.targetFor(ex,acceptedPlan,[day2,ck('2026-10-17',[12,12,12])],'2026-10-19',false).weight,12));
check(()=>assert.equal(P.targetFor(ex,acceptedPlan,[ck('2026-10-17',[12,12,10])],'2026-10-19',false).weight,10));
check(()=>assert.throws(()=>P.accept(accepted,s)));
check(()=>assert.equal(P.suggestion(ex,plan,[ck('2026-10-17',[12,12])]).kind,'hold'));
check(()=>assert.equal(P.suggestion(ex,plan,[ck('2026-10-17',[12,12,12],{progressReady:false})]).kind,'hold'));
check(()=>assert.equal(P.suggestion(ex,plan,[ck('2026-10-17',[12,12,12],{target:{...target,recovery:true}})]).kind,'hold'));
check(()=>assert.equal(P.targetFor(ex,plan,[],'2026-10-17',true).sets,2));
const warm=ck('2026-10-17',[12,12,12]);warm.exercises[0].log.unshift({type:'warmup',weight:5,reps:2,done:false});warm.exercises[0].log.push({weight:50,reps:1,done:true});check(()=>assert.equal(P.suggestion(ex,plan,[warm]).kind,'up'));
const missed=ck('2026-10-17',[12,12,12]);missed.exercises[0].log[1].done=false;check(()=>assert.equal(P.suggestion(ex,plan,[missed]).kind,'hold'));
check(()=>assert.equal(P.suggestion(ex,plan,[ck('2026-10-17',[12,12,12],{target:null})]).kind,'baseline'));
check(()=>assert.equal(P.targetFor(ex,{...plan,home:true},[],'2026-10-17'),null));
const calibration=ck('2026-10-17',[12,12,12]);calibration.exercises[0].log[0].weight=20;check(()=>assert.equal(P.suggestion(ex,plan,[calibration]).kind,'calibrate'));
let stalled=['2026-10-15','2026-10-16','2026-10-17'].map(d=>ck(d,[7,7,7]));check(()=>assert.equal(P.suggestion(ex,plan,stalled).kind,'deload'));
stalled[2].exercises[0].log.forEach(s=>s.reps=7);stalled[1].exercises[0].log.forEach(s=>s.reps=6);check(()=>assert.equal(P.suggestion(ex,plan,stalled).kind,'hold'));
const assistCfg={...cfg,kind:'assisted',weights:[5,10,15]},assistPlan={...plan,exerciseProgression:{[P.key(ex)]:assistCfg}},assistCk=ck('2026-10-17',[12,12,12],{target:{...target,kind:'assisted',weights:[5,10,15]}});check(()=>assert.equal(P.suggestion(ex,assistPlan,[assistCk]).value.weight,5));
check(()=>assert.equal(P.suggestion(ex,{...plan,exerciseProgression:{[P.key(ex)]:{...cfg,weights:[8,10]}}},[ck('2026-10-17',[12,12,12],{target:{...target,weights:[8,10]}})]).kind,'hold'));
const str=ck('2026-10-17',[12,12,12]);str.exercises[0].log.forEach(x=>{x.weight=String(x.weight);x.reps=String(x.reps)});check(()=>assert.equal(P.fingerprint(P.matching([str],ex,cfg)[0]),s.source));
check(()=>assert.throws(()=>P.normalizeConfig({...cfg,min:12,max:8})));
check(()=>assert.throws(()=>P.normalizeConfig({...cfg,weight:11})));
// Real cloud mapping functions run in isolation, with no network or cloud writes.
const api=fs.readFileSync(path.join(root,'健身小程序/cloudfunctions/webApi/index.js'),'utf8');
const sandbox={cardioLog:require(path.join(root,'健身小程序/utils/cardio.js')),progression:P,ROLE_OK:['辅助'],bjDateStr:()=> '2026-10-19',noteOf:()=>undefined,toWebNote:x=>x,toMpNote:x=>x};vm.createContext(sandbox);
for(const [a,b] of [['function sanitizeCheckin','async function upsertCheckin'],['function mpCkToWeb','/** 网站打卡'],['function webCkToMp','async function']]){const start=api.indexOf(a),end=api.indexOf(b,start+a.length);vm.runInContext(api.slice(start,end),sandbox)}
const raw=warm;const clean=sandbox.sanitizeCheckin(raw,'u');check(()=>assert.equal(clean.exercises[0].target.id,'a'));check(()=>assert.equal(clean.exercises[0].log[0].type,'warmup'));check(()=>assert.equal(clean.exercises[0].progressReady,true));
check(()=>assert.equal(sandbox.mpCkToWeb(raw,'u').exercises[0].target.kind,'load'));check(()=>assert.equal(sandbox.webCkToMp(clean,'wx').exercises[0].log[0].type,'warmup'));
console.log('PASS',n,'progression, history invalidation, warmup, deload, equipment, cloud roundtrip checks');

check(()=>assert.equal(P.adjustWeight(cfg,10,1),12));
check(()=>assert.equal(P.adjustWeight({...cfg,weights:[],step:1.25},10,1),11.25));
check(()=>assert.deepEqual(P.weightChoices({...cfg,weights:[1.25,2.5]},1.25,[0,1,2]),[0,1.25,2.5]));
console.log('PASS equipment controls: rack selection, exact fractional weights, no zero fallback');
