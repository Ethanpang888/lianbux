const app=getApp()
const calc=require('../../utils/calc.js'),kb=require('../../utils/kb.js'),form=require('../../utils/assessment.js'),gamify=require('../../utils/gamify.js')
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
require('../../utils/page.js')({
 data:{draft:form.defaults(),goals:form.GOALS,paces:form.PACES,exps:[{v:'新手',label:'新手（不到1年）'},{v:'进阶',label:'进阶（1–3年）'},{v:'熟练',label:'熟练（3年以上）'}],dayOpts:[2,3,4,5,6],activities:kb.METHOD.ACTIVITY,cities:gamify.CITIES,splitOpts:kb.splitList(),weekOpts:kb.freqList().filter(f=>f.kind==='week'),cycleOpts:kb.freqList().filter(f=>f.kind==='cycle'),progList:kb.programList(),bodyTypes:[{v:'易胖',label:'容易胖'},{v:'中性',label:'中性'},{v:'易瘦',label:'怎么吃都不胖'}],pace:null,result:null,isEdit:false,saving:false},
 onLoad(){this._actTouched=false;this._draftKey='assessment-draft:'+app.globalData.openid;let cached=null;try{cached=wx.getStorageSync(this._draftKey)}catch(e){}this.setData({isEdit:!!app.globalData.profile,draft:cached&&cached.draft?Object.assign(form.fromProfile(app.globalData.profile,app.globalData.plan),cached.draft):form.fromProfile(app.globalData.profile,app.globalData.plan)});this.sync()},
 persistDraft(){if(!app.globalData.openid)return;this._draftKey='assessment-draft:'+app.globalData.openid;try{wx.setStorageSync(this._draftKey,{draft:this.data.draft})}catch(e){}},
 pick(e){if(this.data.saving)return;const {k,v}=e.currentTarget.dataset,d=Object.assign({},this.data.draft,{[k]:String(v)});if(k==='fatLossPace'&&v==='intensive'&&!form.pace(d).eligible)return
  if(k==='activity')this._actTouched=true
  if(k==='days'){
   if(!this._actTouched)d.activity=kb.METHOD.defaultActivity(Number(v))
   const f=kb.FREQ[d.freq],n=f?(f.kind==='week'?f.train:Math.round(f.train*7/(f.train+f.rest))):0
   if(n>Number(v)){const opts=Object.keys(kb.FREQ).filter(key=>kb.FREQ[key].kind===f.kind&&kb.FREQ[key].train<=Number(v)).sort((a,b)=>kb.FREQ[b].train-kb.FREQ[a].train);d.freq=opts[0]||'w'+v;wx.showToast({title:'已按可训练天数调整循环',icon:'none'})}
  }
  this.setData({draft:d});this.persistDraft();this.sync()
 },
 input(e){if(this.data.saving)return;const d=Object.assign({},this.data.draft,{[e.currentTarget.dataset.k]:e.detail.value});this.setData({draft:d});this.persistDraft();this.sync()},
 sync(){const d=this.data.draft;let pace=form.pace(d);if(pace&&!pace.eligible&&d.fatLossPace==='intensive'){d.fatLossPace='steady';pace=form.pace(d)}const act=kb.METHOD.activityOf(d.activity),valid=!form.validate(d),energy=valid?calc.energyPlan(form.profile(d),{}):null;this.setData({draft:d,pace,effFreq:form.freq(d),effSplit:form.split(d),comboHint:form.combo(d),activityHint:'已选「'+act.name+'」：每日总消耗 = 基础代谢 × '+act.factor+'。'+act.desc,splitOpts:kb.splitList(),result:energy?{bmr:energy.bmr,tdee:energy.tdee,kcal:energy.kcal,protein:energy.protein,carb:energy.carb,fat:energy.fat,deficit:energy.deficit}:null})},
 async submit(){if(this.data.saving)return;const g=app.globalData,d=this.data.draft;let patch,plan
  try{patch=form.prepare(d,g.profile,g.dietState,today());plan=d.progMode==='program'?kb.enrollProgram(d.program,patch.profile,d.home==='1'):kb.generatePlan(patch.profile,{home:d.home==='1',split:form.split(d),freq:form.freq(d),dietMode:d.dietMode});if(g.plan&&g.plan.cycleStart)plan.cycleStart=g.plan.cycleStart}catch(e){wx.showToast({title:e.message,icon:'none'});return}
  if(!g.openid){wx.showToast({title:'登录初始化中，请稍后再试',icon:'none'});return}
  this.persistDraft();patch.plan=plan;this.setData({saving:true});wx.showLoading({title:'保存中',mask:true})
  try{await app.saveUser(patch);try{wx.removeStorageSync(this._draftKey)}catch(e){}Object.assign(g,patch);if(d.invite&&!((g.profile||{}).inviter)){try{const rr=await wx.cloud.callFunction({name:'webApi',data:{action:'mpBindInvite',code:d.invite.trim().toUpperCase()}});if(!(rr.result||{}).bound)wx.showToast({title:'档案已保存，邀请码未绑定，可在“我的”重试',icon:'none'})}catch(e){wx.showToast({title:'档案已保存，邀请码未绑定，可在“我的”重试',icon:'none'})}}
   wx.hideLoading();wx.showToast({title:'档案已保存'});setTimeout(()=>{if(getCurrentPages().length>1)wx.navigateBack();else wx.switchTab({url:'/pages/today/today'})},500)
  }catch(e){wx.hideLoading();console.error('建档保存失败',e);wx.showModal({title:'档案暂未保存',content:'填写内容已保留，请重试。'+(/timeout|network|网络/i.test(e.message||e.errMsg||'')?'网络连接异常。':'云端保存失败，请稍后重试。'),showCancel:false})}finally{this.setData({saving:false})}
 },
 cancel(){if(this.data.saving)return;if(getCurrentPages().length>1)wx.navigateBack();else wx.switchTab({url:'/pages/index/index'})}
})
