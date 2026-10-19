/* 调理：内容与简化自测规则直接来自小程序 utils/tcm-content.js。 */
const PageTcm={
 selected:null,showAllFoods:false,
 esc(s){return Fmt.esc(s||'')},
 result(){return (Store.state.user.profile||{}).tcmResult||null},
 render(){
  const C=ENGINE.tcm,E=s=>this.esc(s),r=this.result(),key=this.selected||(r&&r.main),type=C.TYPES.find(t=>t.key===key);
  this.selected=key;
  const cards=(rows)=>rows.map(x=>'<div class="tcm-item"><b>'+E(x.t||x.z||x.s)+'</b>'+(x.fit?'<span class="muted txs"> · '+E(x.fit)+'</span>':'')+'<p class="muted txs">'+E(x.b||x.d)+'</p></div>').join('');
  const fold=(name,body)=>'<details class="card tcm-fold"><summary>'+name+'</summary><div class="tcm-fold-body">'+body+'</div></details>';
  const foods=C.TYPES.filter(t=>!key||this.showAllFoods||t.key===key).map(t=>'<h3>'+E(t.name)+'</h3>'+(C.FOODS_TCM[t.key]||[]).map(f=>'<div class="tcm-item"><b>'+E(f.name)+'</b><p class="muted txs">食材：'+E(f.ingre)+'<br>做法：'+E(f.how)+'<br>频率：'+E(f.freq)+'</p></div>').join('')).join('');
  document.getElementById('app').innerHTML=Router.bar('调理 · 内修','了解体质倾向，按需查看日常食养与训练恢复。')+
   '<p class="muted txs">'+E(C.DISCLAIMER)+'</p><div class="card" style="background:var(--green-soft)"><h2>中医调理 · 体质自测</h2><p class="muted txs">简化自测，仅作日常养生参考。</p><button class="btn" onclick="PageTcm.startQuiz()">开始体质倾向自测</button></div>'+
   (type?'<div class="card"><h2>'+E(type.name)+(r&&r.secName?' · 兼夹倾向 '+E(r.secName):'')+'</h2><p class="muted txs">'+E(type.desc)+'</p>'+[['中医说',type.mech],['训练宜忌',type.train],['食养建议',type.food],['红线信号',type.tip]].map(x=>'<div class="tcm-item"><b>'+x[0]+'</b><p class="muted txs">'+E(x[1])+'</p></div>').join('')+'<button class="text-link" onclick="PageTcm.reset()">重新自测 / 清除</button></div>':'')+
   '<div class="card"><h2>或手动选择你的体质</h2><div class="chips">'+C.TYPES.map(t=>'<button class="chip '+(key===t.key?'on':'')+'" onclick="PageTcm.select(\''+t.key+'\')">'+E(t.name)+'</button>').join('')+'</div></div>'+
   fold('中医小课堂',cards(C.LESSONS))+fold('食养方库 · 食疗非处方','<button class="text-link" onclick="PageTcm.toggleFoods()">'+(this.showAllFoods?'只看我的体质':'查看全部体质方')+'</button>'+foods)+fold('训练恢复锦囊',cards(C.RECOVERY))+fold('训练宜忌',cards(C.TRAIN_TIPS))+fold('节气养生（顺时训练 · 食养）',C.SOLAR.map(s=>'<h3>'+E(s.season)+'</h3>'+cards(s.list)).join(''))+fold('五脏 × 训练（中医怎么看健身）',cards(C.WUZANG));
 },
 save(r){Store.patchUser({profile:Object.assign({},Store.state.user.profile||{},{constitution:r?r.main:null,tcmResult:r})})},
 select(key){const t=ENGINE.tcm.TYPES.find(x=>x.key===key);if(!t)return;this.selected=key;this.save({main:key,mainName:t.name,mainConv:null,sec:null,secName:'',secConv:0,conv:{},source:'manual'});this.render()},
 reset(){this.selected=null;this.save(null);this.render()},toggleFoods(){this.showAllFoods=!this.showAllFoods;this.render()},
 startQuiz(){this.answers={};this.index=0;this.quiz()},
 quiz(){const C=ENGINE.tcm,q=C.QUIZ[this.index];this.closeQuiz=UI.modal({title:'体质倾向自测',okText:'退出自测',cancelText:false,body:'<h2>第 '+(this.index+1)+' / '+C.QUIZ.length+' 题</h2><p>'+this.esc(q.q)+'</p><div class="tcm-answers">'+C.SCALE.map((s,i)=>'<button class="btn ghost" onclick="PageTcm.answer('+(i+1)+')">'+s+'</button>').join('')+'</div><p class="muted txs">简化自测，仅作日常参考</p>'})},
 answer(score){if(score<1||score>5)return;this.answers[this.index]=score;this.index++;if(this.index<ENGINE.tcm.QUIZ.length){this.quiz();return}const r=ENGINE.tcm.evaluateQuiz(this.answers);this.save(r);this.selected=r.main;if(this.closeQuiz)this.closeQuiz();this.render();UI.toast('体质倾向自测已保存')}
}
