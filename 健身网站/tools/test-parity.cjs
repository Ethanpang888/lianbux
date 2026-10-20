const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=process.argv[2]||path.resolve(__dirname,'../..'),mp=path.join(root,'健身小程序'),p=require(path.join(mp,'utils/presentation.js'));
const appJson=JSON.parse(fs.readFileSync(path.join(mp,'app.json')));
assert.deepEqual(appJson.tabBar.list.map(x=>x.text),['洞府','训练','饮食','修炼记录','我的']);
assert(!appJson.tabBar.list.some(x=>/tcm/.test(x.pagePath)));
let calls=[];global.wx={switchTab:x=>calls.push(['tab',x.url]),navigateTo:x=>calls.push(['page',x.url]),showToast(){}};
const nav=require(path.join(mp,'utils/navigation.js'));nav.go('/pages/diet/diet');nav.go('/pages/records/records');nav.go('/pages/tcm/tcm');nav.go('/pages/plan/plan');assert.deepEqual(calls.map(x=>x[0]),['tab','tab','page','page']);
const summary=p.dietSummary([{kcal:715,protein:143,carbs:0,fat:13,meal:'l'}],{kcal:600,protein:120,carb:200,fat:40});assert(summary.dietOver);assert(summary.nutrientProgress[0].over);assert(!summary.nutrientProgress[2].over);assert.equal(summary.mealGroups[1].items.length,1);
let config,writes=0,callErr=null,result={ok:true},doc={};
const context={require:n=>({migratePlan:(profile,plan)=>plan}),App:c=>config=c,wx:{cloud:{callFunction:async req=>{if(callErr)throw callErr;if(req.data.action==='saveUser'){writes++;return {result}}return {result:{ok:true,user:doc}}}}},console,Promise,Object,Error};
vm.runInNewContext(fs.readFileSync(path.join(mp,'app.js'),'utf8'),context);config.globalData.openid='test';
(async()=>{
 callErr=new Error('network unavailable');await assert.rejects(config.saveUser({email:'x'}));assert.equal(writes,0);
 callErr=null;result={ok:false,message:'write rejected'};await assert.rejects(config.saveUser({email:'x'}));assert.equal(writes,1);
 result={ok:true};await config.saveUser({profile:{}});assert.equal(writes,2);
 doc={profile:{constitution:null,tcmResult:null},constitution:'qixu',tcmResult:{main:'qixu'}};await config.loadUser();assert.equal(config.globalData.constitution,null);assert.equal(config.globalData.tcmResult,null);
 doc={profile:{},constitution:'qixu',tcmResult:{main:'qixu'}};await config.loadUser();assert.equal(config.globalData.constitution,'qixu');
 console.log('PASS unified navigation, secondary routes, nutrition over-target display, conditioning clear/legacy restore, network/write failure no destructive fallback');
})().catch(e=>{console.error(e);process.exit(1)})
