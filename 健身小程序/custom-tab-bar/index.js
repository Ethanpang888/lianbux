const P=require('../utils/presentation.js'),rest=require('../utils/rest-timer.js')
Component({data:{selected:0,list:P.NAV,theme:'light',themeStyle:'',activeRest:null},
 lifetimes:{attached(){this.connect()},detached(){if(this._unsub)this._unsub()}},
 pageLifetimes:{show(){this.connect()}},
 methods:{connect(){const theme=wx.getStorageSync('lbgym_theme')||'light';this.setData({theme,themeStyle:P.themeStyle(theme)});rest.connect(getApp().globalData.openid);if(!this._unsub)this._unsub=rest.subscribe(t=>this.setData({activeRest:t?{time:t.time,label:t.label,left:t.left,run:t.run,phase:t.phase}:null}))},
 switchTab(e){wx.switchTab({url:e.currentTarget.dataset.path})},goTraining(){wx.switchTab({url:'/pages/today/today'})},addRest(){rest.add()},pauseRest(){rest.toggle()},endRest(){rest.end()}}
})
