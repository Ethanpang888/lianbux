const queues = {}
function dateStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function load(openid,date){return wx.cloud.database().collection('checkins').where({_openid:openid,date}).get().then(r=>r.data||[])}
function mutate(openid,date,change){
  if(!openid)return Promise.reject(new Error('请先登录'))
  const key=openid+'_'+date, run=()=>load(openid,date).then(rows=>{
    if(rows.length>1)throw new Error('当天有重复记录，请先处理，未覆盖数据')
    const log=change(JSON.parse(JSON.stringify((rows[0]||{}).dietLog||[])))
    const data={date,dietLog:log,dietOk:log.length>0,updatedAt:Date.now()}
    const col=wx.cloud.database().collection('checkins')
    return (rows.length?col.doc(rows[0]._id).update({data}):col.add({data})).then(()=>{
      wx.cloud.callFunction({name:'webApi',data:{action:'mpSyncCheckin',date}}).catch(()=>{})
      return log
    })
  })
  const next=(queues[key]||Promise.resolve()).then(run,run)
  queues[key]=next.catch(()=>{})
  return next
}
module.exports={dateStr,load,mutate}
