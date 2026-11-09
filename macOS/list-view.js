function hasMatch(n,term){return n.title.toLowerCase().includes(term)||n.children.some(c=>hasMatch(c,term))}
function tree(d,nodes,prefix=''){
 const ul=document.createElement('ul');ul.className='tree';
 nodes.forEach((n,i)=>{
  const route=prefix+i,k=d.id+':'+route,li=document.createElement('li');
  if(n.children.length){const toggle=button(subtrees.has(k)?'⌄':'›',()=>{subtrees.has(k)?subtrees.delete(k):subtrees.add(k);renderList(toggle.dataset.focus)},'twisty');toggle.dataset.focus='fold-'+k;toggle.setAttribute('aria-label',(subtrees.has(k)?'收起':'展开')+n.title+'的下级疑问');toggle.setAttribute('aria-expanded',subtrees.has(k));li.append(toggle)}
  else li.append(text('span','','leaf'));
  const q=button(n.title,()=>openReading(d,route,q),'question');q.dataset.focus='read-'+k;li.append(q);
  if(n.children.length&&subtrees.has(k))li.append(tree(d,n.children,route+'.'));ul.append(li);
 });return ul;
}
function renderDocumentList(items,noun,restore,addRename){
 rows.replaceChildren();
 const term=$('#search').value.trim().toLowerCase();
 const matches=items.filter(d=>record(d).archived===archived&&(!term||(d.title+' '+d.summary+' '+(d.searchText||'')).toLowerCase().includes(term)||d.questions.some(n=>hasMatch(n,term)))).sort((a,b)=>record(b).last-record(a).last);
 for(const d of matches){
  const item=document.createElement('article'),r=record(d),row=text('div','','row'),topic=button('',()=>openReading(d,r.route,topic),'topic');
  topic.dataset.focus='topic-'+d.id;
  const meta=text('div','','topic-meta'),actions=text('div','','row-actions');
  if(d.summary)meta.append(text('span',d.summary));
  if(r.last){
   const days=Math.floor((Date.now()-r.last)/86400000);
   const date=days===0?'今天':days===1?'昨天':new Date(r.last).toLocaleDateString('zh-CN',{month:'short',day:'numeric'});
   meta.append(text('time',date,'when'));
  }
  topic.append(text('b',d.title),meta);row.append(topic,actions);
  const fold=text('div','','fold'),inner=document.createElement('div');fold.append(inner);fold.id='tree-'+d.id;
  function showBranches(on){fold.classList.toggle('open',on);inner.inert=!on;toggle.setAttribute('aria-expanded',on)}
  const count=d.questions.reduce((sum,n)=>sum+nodeCount(n),0);
  const toggle=button('旁支 '+count,()=>{const on=!expanded.has(d.id);on?expanded.add(d.id):expanded.delete(d.id);showBranches(on)},'branchBtn');toggle.setAttribute('aria-controls',fold.id);
  if(d.kind==='quick'){fold.hidden=true}
  else if(!d.questions.length || d.sourceOnly){
   toggle.textContent='旁支 0';toggle.disabled=true;
  } else {
   showBranches(expanded.has(d.id));inner.append(tree(d,d.questions));
  }
  if(addRename)addRename(d,actions,topic);
  const act=button('',()=>archive(d),archived?'soft restore':'archive');
  const symbol=archived
   ? '<path d="m7.5 3.75-4.5 4.5 4.5 4.5M3.5 8.25h8.25a4.25 4.25 0 0 1 0 8.5H9"/>'
   : '<rect x="2" y="3" width="16" height="4" rx="1"/><path d="M4 7v9h12V7M8 10h4"/>';
  act.innerHTML='<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+symbol+'</svg>';
  act.setAttribute('aria-label',(archived?'恢复 ':'归档 ')+d.title);
  actions.append(act);
  if(d.kind!=='quick')actions.append(toggle);
  item.append(row,fold);rows.append(item);
 }
 if(!matches.length){
  const message=term?'没有匹配的'+noun:archived?'暂无归档记录':'暂无'+noun;
  rows.append(text('p',message,'empty'));
 }
 if(restore)rows.querySelector('[data-focus="'+CSS.escape(restore)+'"]')?.focus({preventScroll:true});
}
function nodeCount(n){return 1+n.children.reduce((s,c)=>s+nodeCount(c),0)}
