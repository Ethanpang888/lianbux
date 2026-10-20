const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path'),{createRequire}=require('module');
const mp=path.resolve(__dirname,'../../健身小程序'),C=require(mp+'/utils/cardio.js');
const a={type:'jog',minutes:20,weight:70,extra:false},base={tdee:2400,kcal:2100};
assert.equal(C.daily(base,a).tdee,2400);assert.equal(C.daily(base,{...a,extra:true}).tdee,2547);
assert.equal(C.estimate({...a,minutes:40}).kcal,294);assert.equal(C.daily(base,{...a,minutes:40,extra:true}).deficit,594);
for(const minutes of [0,-1,241,Infinity,'bad'])assert.equal(C.clean({...a,minutes}),null);
assert.equal(C.estimate({...a,weight:null}).kcal,null);assert.equal(C.daily(base,null).tdee,2400);
const bjDateStr=()=>'2026-10-19';
const api=fs.readFileSync(mp+'/cloudfunctions/webApi/index.js','utf8'),cloud={bjDateStr,cardioLog:C,progression:require(mp+'/utils/progression.js'),ROLE_OK:[],noteOf:x=>x,toWebNote:x=>x,toMpNote:x=>x};vm.createContext(cloud);
for(const [a,b] of [['function sanitizeCheckin','async function upsertCheckin'],['function mpCkToWeb','/** 网站打卡'],['function webCkToMp','async function']]){const start=api.indexOf(a),end=api.indexOf(b,start+a.length);vm.runInContext(api.slice(start,end),cloud)}
const record=cloud.sanitizeCheckin({date:'2026-10-19',cardio:{...a,minutes:40,extra:true,kcal:999999}},'u');
assert.equal(record.cardio.minutes,40);assert.equal(record.cardio.kcal,undefined);assert.equal(cloud.webCkToMp(cloud.mpCkToWeb(record,'u'),'owner').cardio.minutes,40);
let page,component,saves=[],fail=false;const app={globalData:{openid:'owner',profile:{weight:70}}},wx={showToast(){},setStorageSync(){}};
const file=mp+'/pages/today/today.js',req=createRequire(file);
vm.runInNewContext(fs.readFileSync(file,'utf8'),{getApp:()=>app,require:n=>n.endsWith('/page.js')?p=>page=p:n.endsWith('/checkins-store.js')?{patch:async(uid,date,patch)=>{if(fail)throw Error('network');saves.push({uid,date,patch});return patch}}:req(n),wx,console,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){}});
page.data=JSON.parse(JSON.stringify(page.data));page.setData=function(p){for(const [key,value] of Object.entries(p)){const ks=key.replace(/\[(\d+)\]/g,'.$1').split('.');let o=this.data;for(const k of ks.slice(0,-1))o=o[k]||(o[k]={});o[ks.at(-1)]=value}};page.decorateProgression=x=>x;
const lib=req('../../utils/kb.js').EX;
const names=['杠铃长凳推举中距握','蝴蝶机夹胸','哑铃单臂肱三头肌臂屈伸'];
page.restoreDraft({exercises:names.map(name=>({name,oid:'stale-bench-id',gif:lib.find(x=>x.name===names[0]).gif,sets:'2×10',log:[{weight:10,reps:10,done:false}]}))});
for(let i=0;i<names.length;i++){const fm=page.fmData({ei:i,si:0});assert.equal(fm.exName,names[i]);assert.deepEqual(fm.gif,lib.find(x=>x.name===names[i]).gif)}
assert.notEqual(page.data.exercises[0].gif[0],page.data.exercises[1].gif[0]);
vm.runInNewContext(fs.readFileSync(mp+'/components/frame-gif/index.js','utf8'),{Component:c=>component=c});
const c={data:{list:[],current:0,err:false},setData:p=>Object.assign(c.data,p)};
component.observers.frames.call(c,['first/0.jpg','first/1.jpg']);component.methods.next.call(c);assert.equal(c.data.current,1);
component.observers.frames.call(c,['second/0.jpg','second/1.jpg']);assert.equal(c.data.current,0);assert.equal(c.data.list[0],'second/0.jpg');
(async()=>{
 page.data.viewDate='2026-10-19';page.data.cardioMinutes='40';page.data.cardioTypeIndex=2;page.data.cardioExtra=true;
 await page.completeCardio();assert.equal(saves.length,1);assert.equal(saves[0].patch.cardio.minutes,40);assert.equal(page.data.cardioRecord.kcal,294);
 page.data.cardioMinutes='35';await page.completeCardio();assert.equal(saves[1].patch.cardio.minutes,35);assert.equal(Object.keys(saves[1].patch).join(','),'cardio');
 fail=true;page.data.cardioMinutes='60';await page.completeCardio();assert.equal(page.data.cardioRecord.minutes,35);assert.equal(page.data.cardioSaving,false);
 fail=false;await page.clearCardio();assert.equal(saves.at(-1).patch.cardio,null);assert.equal(page.data.cardioRecord,null);
 console.log('PASS: 3 exercise images/focus/draft refresh, stable posture switching; cardio actual duration, no double counting, trusted estimate, cloud roundtrip, save/update/failure/clear');
})().catch(e=>{console.error(e);process.exitCode=1});
