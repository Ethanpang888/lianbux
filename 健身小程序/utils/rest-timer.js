let timer=null,iv=null,owner='',visible=true
const listeners=new Set()
function key(){return 'lbgym_active_rest_v2_'+owner}
function save(){try{if(timer)wx.setStorageSync(key(),timer);else wx.removeStorageSync(key())}catch(e){wx.showToast({title:'计时未保存，重启后可能丢失',icon:'none'})}}
function tick(){if(timer&&timer.run){timer.left=Math.max(0,Math.ceil((timer.deadline-Date.now())/1000));if(!timer.left){timer.run=false;save()}}
 if(timer&&!timer.left&&!timer.notified&&visible){timer.notified=true;save();try{wx.vibrateLong({})}catch(e){};wx.showToast({title:'休息结束，下一组！',icon:'none',duration:4000})}
 listeners.forEach(fn=>fn(timer))
}
function connect(id){if(owner===id)return;owner=id||'demo';timer=null;try{timer=wx.getStorageSync(key())||null}catch(e){};if(timer&&(!Number.isFinite(timer.deadline)||!Number.isFinite(timer.left)))timer=null;if(!timer){try{const d=new Date(),date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),oldKey='lbgym_rest_'+owner+'_'+date,old=wx.getStorageSync(oldKey);if(old&&Number.isFinite(old.deadline)){timer={left:Math.max(0,Math.ceil((old.deadline-Date.now())/1000)),total:old.left||120,deadline:old.deadline,label:old.label||'组间休息',run:true,notified:false};save();wx.removeStorageSync(oldKey)}}catch(e){}}if(!iv)iv=setInterval(tick,250);tick()}
function start(sec,label){const total=Math.max(1,Math.min(600,Number(sec)||120));timer={left:total,total,deadline:Date.now()+total*1000,label:label||'组间休息',run:true,notified:false};save();tick()}
function add(){tick();if(!timer||!timer.left)return;timer.left+=30;timer.total+=30;timer.deadline=Date.now()+timer.left*1000;save();tick()}
function end(){timer=null;save();tick()}
function subscribe(fn){listeners.add(fn);tick();return()=>listeners.delete(fn)}
function show(){visible=true;tick()}
function hide(){visible=false}
function current(){tick();return timer}
module.exports={connect,start,add,end,subscribe,show,hide,current}
