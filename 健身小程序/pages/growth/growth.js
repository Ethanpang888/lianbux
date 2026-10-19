const app=getApp()
const gamify=require('../../utils/gamify.js')
require('../../utils/page.js')({
 data:{loading:true,error:'',cul:null,nodes:[],tasks:[],badges:[],got:0},
 onShow(){this.load()},
 async load(){
  this.setData({loading:true,error:''})
  try{
   if(!app.globalData.openid)throw new Error('账号正在初始化')
   await app.loadUser()
   const cul=await app.loadCultivation(true)
   if(!cul){this.setData({loading:false});return}
   const next=gamify.REALMS.filter(r=>r.from>cul.level).sort((a,b)=>a.from-b.from)[0]
   const nodes=next?[{name:'下一境界',value:'「'+next.name+'」 · Lv.'+next.from+' 起',note:next.note}]:[]
   const now=new Date(),thu=new Date(now.getFullYear(),now.getMonth(),now.getDate());thu.setDate(thu.getDate()-(thu.getDay()+6)%7+3)
   const first=new Date(thu.getFullYear(),0,4),week=thu.getFullYear()+'-W'+String(1+Math.round(((thu-first)/86400000-3+(first.getDay()+6)%7)/7)).padStart(2,'0')
   const wt=((app.globalData.gamify||{}).weekTask||{}),cur=wt.week===week?wt:{}
   const tasks=gamify.WEEK_TASKS.map(t=>({name:t.name,exp:t.exp,target:t.target,cur:Math.min(Number(cur[t.key])||0,t.target),pct:Math.min(100,(Number(cur[t.key])||0)/t.target*100),paid:(cur.paid||[]).indexOf(t.key)>=0}))
   const db=wx.cloud.database(),res=await db.collection('checkins').where({_openid:app.globalData.openid}).orderBy('date','desc').limit(365).get()
   const calc=require('../../utils/calc.js'),e=calc.energyPlan(app.globalData.profile||{},app.globalData.dietState||{})
   const badges=require('../../utils/cultivation.js').badgesOf(res.data||[],app.globalData.profile,{kcal:e.kcal,protein:e.protein},cul.level,cul.streak.best)
   const withProgress=badges.map(b=>Object.assign({},b,{prog:gamify.badgeProgress(b,badges.counters,{best:badges.streakBest})}))
   this.setData({loading:false,cul,nodes,tasks,badges:withProgress,got:badges.filter(b=>b.got).length})
  }catch(e){this.setData({loading:false,error:'成长记录暂时没加载出来，点击重试'})}
 },
 goHome(){wx.switchTab({url:'/pages/index/index'})}
})
