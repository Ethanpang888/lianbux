const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
const file=path.resolve(__dirname,'../../健身小程序/cloudfunctions/login/index.js');
let openid='real-owner',doc=null,writes=0,readError=null,writeError=null,lastId;
const db={collection:()=>({where:q=>{lastId=q._id;return {limit:()=>({get:async()=>{if(readError)throw readError;return {data:doc?[doc]:[]}}})}}}),runTransaction:async fn=>fn({collection:()=>({doc:id=>{lastId=id;return {get:async()=>{if(readError)throw readError;if(!doc)throw Error('document does not exist');return {data:doc}},set:async({data})=>{if(writeError)throw writeError;writes++;doc=data}}}})})};
const cloud={init(){},getWXContext:()=>({OPENID:openid}),database:()=>db};
const ctx={require:()=>cloud,exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),ctx);const main=ctx.exports.main;
(async()=>{
 assert.equal((await main()).openid,'real-owner');assert.equal((await main({action:'loadUser'})).user,null);
 await main({action:'saveUser',openid:'victim',patch:{profile:{age:26},member:{level:'paid'},_openid:'victim',plan:{micro:[]}}});
 assert.equal(lastId,'real-owner');assert.equal(doc._openid,'real-owner');assert.equal(doc.member,undefined);assert.equal(writes,1);
 // Existing cloud-created record is updated, rather than misclassified as absent by client rules.
 doc={_id:'real-owner',profile:{age:25},member:{level:'paid'},email:'kept',inviter:{uid:'referrer'}};
 await main({action:'saveUser',patch:{profile:{age:26},member:null,inviter:null}});
 assert.equal(doc.profile.age,26);assert.equal(doc.email,'kept');assert.equal(doc.member.level,'paid');assert.equal(doc.inviter.uid,'referrer');assert.equal(doc._id,undefined);
 const before=writes;readError=Error('permission denied');await assert.rejects(main({action:'saveUser',patch:{profile:{}}}));assert.equal(writes,before);
 await assert.rejects(main({action:'loadUser'}));readError=Error('network unavailable');await assert.rejects(main({action:'saveUser',patch:{profile:{}}}));assert.equal(writes,before);
 readError=null;writeError=Error('write failed');await assert.rejects(main({action:'saveUser',patch:{profile:{}}}));assert.equal(writes,before);writeError=null;
 openid=null;assert.equal((await main({action:'saveUser',openid:'victim',patch:{profile:{}}})).ok,false);assert.equal(writes,before);
 console.log('PASS cloud profile: create, existing record, trusted identity, protected fields, read/write failure propagation');
})().catch(e=>{console.error(e);process.exit(1)});
