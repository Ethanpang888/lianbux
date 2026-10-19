const NAV=require('./presentation.js').NAV
function go(url){
 const path=String(url||'').split('?')[0]
 if(!path){wx.showToast({title:'页面地址无效',icon:'none'});return}
 const options={url,fail(){wx.showToast({title:'页面暂时无法打开，请返回重试',icon:'none'})}}
 if(NAV.some(n=>n.pagePath===path))return wx.switchTab(options)
 return wx.navigateTo(options)
}
module.exports={go}
