let timer=null,iv=null,owner='',visible=true
const listeners=new Set()
let audio=null
function unlockSound(){try{if(!audio){audio=wx.createInnerAudioContext();audio.src='/assets/timer-end.wav';audio.obeyMuteSwitch=true}}catch(e){}}
function format(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}

function key(){return 'lbgym_active_rest_v2_'+owner}
function save(){try{if(timer)wx.setStorageSync(key(),timer);else wx.removeStorageSync(key())}catch(e){wx.showToast({title:'计时未保存，重启后可能丢失',icon:'none'})}}
function tick(){if(timer&&timer.run){timer.left=Math.max(0,Math.ceil((timer.deadline-Date.now())/1000));if(!timer.left){timer.run=false;save()}}
 if(timer&&!timer.left&&!timer.notified&&visible){timer.notified=true;save();try{wx.vibrateLong({})}catch(e){};try{if(audio){audio.stop();audio.play()}}catch(e){};wx.showToast({title:timer.kind==='warmup'?'热身计时结束':timer.kind==='cardio'?'有氧计时结束':'休息结束，下一组！',icon:'none',duration:4000})}
 if(timer){const elapsed=Math.max(0,timer.total-timer.left),slot=elapsed%300;timer.time=format(timer.interval&&timer.left>0?(slot<180?180-slot:300-slot):timer.left);timer.phase=timer.interval&&timer.left>0?'第 '+(Math.floor(elapsed/300)+1)+'/4轮 · '+(slot<180?'快走':'轻松跑'):''}
 listeners.forEach(fn=>fn(timer))
}
function connect(id){if(owner===id)return;owner=id||'demo';timer=null;try{timer=wx.getStorageSync(key())||null}catch(e){};if(timer&&(!Number.isFinite(timer.deadline)||!Number.isFinite(timer.left)))timer=null;if(!timer){try{const d=new Date(),date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),oldKey='lbgym_rest_'+owner+'_'+date,old=wx.getStorageSync(oldKey);if(old&&Number.isFinite(old.deadline)){timer={left:Math.max(0,Math.ceil((old.deadline-Date.now())/1000)),total:old.left||120,deadline:old.deadline,label:old.label||'组间休息',run:true,notified:false};save();wx.removeStorageSync(oldKey)}}catch(e){}}if(!iv)iv=setInterval(tick,250);tick()}
function start(sec,label,kind,interval){unlockSound();const total=Math.max(1,Math.min(3600,Number(sec)||120));timer={interval:!!interval,kind:kind||'rest',left:total,total,deadline:Date.now()+total*1000,label:label||'组间休息',run:true,notified:false};save();tick()}
function add(){tick();if(!timer||!timer.left||timer.interval)return;timer.left+=30;timer.total+=30;if(timer.run)timer.deadline=Date.now()+timer.left*1000;save();tick()}
function toggle(){unlockSound();tick();if(!timer||!timer.left)return;timer.run=!timer.run;if(timer.run)timer.deadline=Date.now()+timer.left*1000;save();tick()}
function end(){timer=null;save();tick()}
function subscribe(fn){listeners.add(fn);tick();return()=>listeners.delete(fn)}
function show(){visible=true;tick()}
function hide(){visible=false}
function current(){tick();return timer}
module.exports={connect,start,add,toggle,end,subscribe,show,hide,current}
