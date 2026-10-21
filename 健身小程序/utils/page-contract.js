// 双端页面的内容顺序与入口，由网站现有界面确定。
const SECTIONS={
 today:['date','warmup','strength','exercises','cardio','method','pro','coach','journal'],
 diet:['goal','adjust','advanced'],
 records:['strength','compare','details','journal','timeline','weight','heat','trend','week'],
 me:['profile','tools','rank','member','invite','characters','level','theme','account','technical']
}
const TOOLS=[
 {key:'plan',name:'我的完整计划',note:'查看周期与调整安排',url:'/pages/plan/plan'},
 {key:'exlib',name:'动作图鉴',note:'查动作与训练要领',url:'/subpkgs/exlib/pages/exlib/exlib'},
 {key:'secret',name:'藏经阁',note:'目标秘籍与训练方法',url:'/pages/secret/secret'},
 {key:'plus',name:'进阶工具包',note:'查看已有工具与权益',url:'/subpkgs/tools/pages/plus/plus'},
 {key:'plan12',name:'12 周定制方案',note:'查看方案与交付说明',url:'/subpkgs/tools/pages/plan12/plan12'}
]
const CHAR_STAGES=[{at:1,name:'新手',file:'stage1.png'},{at:20,name:'入门',file:'stage2.png'},{at:45,name:'规律',file:'stage3.png'},{at:70,name:'硬核',file:'stage4.png'},{at:95,name:'练不虚',file:'stage5.png'}]
module.exports={SECTIONS,TOOLS,CHAR_STAGES}
