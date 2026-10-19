const app=getApp()
const messages={NO_USER:'请先完成建档并登录',CODE_EMPTY:'先输入开通码',CODE_INVALID:'开通码不正确，请核对',CODE_REDEEMED:'这个码已经使用过',CODE_EXHAUSTED:'开通码已用完'}
async function call(action,data){const r=await wx.cloud.callFunction({name:'webApi',data:Object.assign({action},data||{})}),v=r.result||{};if(!v.ok)throw new Error(messages[v.code]||'权益同步失败，请稍后重试');for(const k of ['member','plus','plan12','playerNo'])if(Object.prototype.hasOwnProperty.call(v,k))app.globalData[k]=v[k];return v}
module.exports={load:()=>call('mpEntitlements'),redeem:(code,goal)=>call('mpRedeem',{code:String(code||'').trim(),goal}),cancel:()=>call('mpCancelMember')}
