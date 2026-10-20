// Both posture images stay mounted, preventing repeated downloads and blank flashes.
Component({
 properties:{frames:{type:null,value:[]},equip:{type:String,value:''},speed:{type:Number,value:1500},mode:{type:String,value:'auto'},poster:{type:Number,value:0},interactive:{type:Boolean,value:false}},
 data:{list:[],current:0,err:false,ready:false,paused:false},
 observers:{frames(val){const list=(Array.isArray(val)?val:(val?[val]:[])).filter(x=>typeof x==='string'&&x).slice(0,2);if(JSON.stringify(list)!==JSON.stringify(this.data.list)){this._loaded={};this.setData({list,current:0,err:false,ready:false,paused:false})}}},
 methods:{
 onLoad(e){this._loaded=this._loaded||{};this._loaded[e.currentTarget.dataset.i]=true;if(this.data.list.every((_,i)=>this._loaded[i]))this.setData({ready:true})},
 next(){if(this.data.list.length>1)this.setData({current:(this.data.current+1)%this.data.list.length,paused:true,err:false})},
 toggle(){this.setData({paused:!this.data.paused})},
 onErr(){this.setData({err:true,ready:false})},
 retry(){const list=this.data.list.slice();this._loaded={};this.setData({list:[],err:false,ready:false},()=>this.setData({list}))}
 }
})
