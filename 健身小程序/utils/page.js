const presentation=require('./presentation.js')
module.exports=function(config){
 const onShow=config.onShow
 config.onShow=function(){
  const theme=wx.getStorageSync('lbgym_theme')||'light';this.setData({theme,themeStyle:presentation.themeStyle(theme)})
  wx.setNavigationBarColor({frontColor:theme==='dark'?'#ffffff':'#000000',backgroundColor:presentation.THEMES[theme=== 'dark'?'dark':'light'].bg})
  return onShow&&onShow.apply(this,arguments)
 }
 return Page(config)
}
