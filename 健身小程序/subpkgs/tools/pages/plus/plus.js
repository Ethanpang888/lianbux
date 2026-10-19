const app=getApp(),ctx=require('../../lib/context.js'),checks=require('../../../../utils/checkins-store.js'),ent=require('../../../../utils/entitlements.js')
require('../../../../utils/page.js')({
 data:{loading:true,error:'',code:'',goal:'',lifts:['卧推','上斜卧推','杠铃划船','硬拉','深蹲','坐姿推肩'],liftIndex:0,weight:'',stepIndex:0,steps:['杠铃 +2.5kg','哑铃 +1kg'],payTier:'y1'},
 onShow(){this.load()},
 async load(){if(!app.globalData.openid){this.setData({loading:false,error:'登录尚未完成，请稍后重试'});return}this.setData({loading:true,error:''});try{await ent.load();this.history=await checks.all(app.globalData.openid);this.paint()}catch(e){this.setData({error:e.message||'加载失败，请重试'})}finally{this.setData({loading:false})}},
 content(){const c=ctx.context(this.history);return require('../../lib/plus-content.js')(c.ENGINE,c.Store,c.Fmt,c.UI)},
 paint(){const g=app.globalData,p=this.content(),c=ctx.context(this.history),owned=c.ENGINE.plus.isPlus(g);if(!g.profile){this.setData({error:'请先到我的页面建立身体档案'});return}p.goal=this.data.goal||g.profile.goal||'增肌';p.payTier=this.data.payTier;this._page=p;const raw=p.head(owned)+(owned?p.painBlock(true):p.locked());this._raw=raw;this.setData({owned,goal:p.goal,member:c.ENGINE.pro.memberOf(g),tiers:p.PAY_TIERS||[],body:ctx.html(raw),payment:'进阶包 ¥99 · 一次买断'})},
 field(e){this.setData({[e.currentTarget.dataset.k]:e.detail.value})},
 choose(e){this.setData({[e.currentTarget.dataset.k]:e.currentTarget.dataset.v});this.paint()},
 lift(e){this.setData({liftIndex:Number(e.detail.value)})},step(e){this.setData({stepIndex:Number(e.detail.value)})},
 generate(){if(!this.data.owned)return;const c=ctx.context(this.history),result=c.ENGINE.plus.strengthCycle(this.data.lifts[this.data.liftIndex],this.data.weight,this.data.stepIndex?1:2.5);if(result.error){wx.showToast({title:result.error,icon:'none'});return}this.setData({generated:ctx.html(this._page.cycleTable(result))})},
 async redeem(){if(this.data.busy)return;if(!this.data.code.trim()){wx.showToast({title:'先输入开通码',icon:'none'});return}this.setData({busy:true});try{await ent.redeem(this.data.code,this.data.goal);this.paint();wx.showToast({title:'兑换成功'})}catch(e){wx.showToast({title:e.message||'兑换失败，请重试',icon:'none'})}finally{this.setData({busy:false})}},
 cancel(){wx.showModal({title:'取消会员权益？',content:'取消后立即失效，训练记录保留。这不是关闭自动续费；当前没有自动扣费。',success:async r=>{if(!r.confirm)return;try{await ent.cancel();this.paint()}catch(e){wx.showToast({title:e.message,icon:'none'})}}})},
 go(e){require('../../../../utils/navigation.js').go(e.currentTarget.dataset.url)},
 async exportDoc(){if(!this.data.owned)return;const path=wx.env.USER_DATA_PATH+'/练不虚十二周计划.html',html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>十二周训练与饮食计划</title>'+ctx.html(this._raw);try{await new Promise((resolve,reject)=>wx.getFileSystemManager().writeFile({filePath:path,data:html,encoding:'utf8',success:resolve,fail:reject}));wx.shareFileMessage({filePath:path,fileName:'练不虚十二周计划.html'})}catch(e){wx.showToast({title:'导出失败，请重试',icon:'none'})}},
 previewQr(){wx.previewImage({urls:['https://c289b837374c4dfc8f14d386d2e36a02.app.workbuddy.host/assets/pay-qr.png']})}
})
