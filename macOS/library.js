'use strict';
const $=s=>document.querySelector(s);
function text(tag,value,cls){const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e}
function button(label,action,cls){const b=text('button',label,cls);b.type='button';b.onclick=action;return b}
const host=window.webkit.messageHandlers;
const rows=$('#rows'),expanded=new Set(),subtrees=new Set();
let docs=[],archived=false,days=Number(localStorage.getItem('sideask-library-period'))===30?30:7,activity={},timer;
const record=d=>d;
let listKind='exploration',openingQuick=false;
function renderList(restore){
 renderDocumentList(archived?docs:docs.filter(d=>d.kind===listKind),archived?'对话':listKind==='quick'?'随问':'探索',restore,addRenameControl);
}
const createMenu=$('#createMenu');
function toggleCreateMenu(rightInset){
 if($('#dashboard').hidden || document.querySelector('dialog[open]'))return;
 createMenu.style.right=Math.max(8,rightInset)+'px';
 createMenu.togglePopover();
 if(createMenu.matches(':popover-open'))createMenu.focus({preventScroll:true});
}
createMenu.addEventListener('keydown',event=>{
 if(!['ArrowDown','ArrowUp'].includes(event.key))return;
 event.preventDefault();
 const options=Array.from(createMenu.querySelectorAll('button'));
 const step=event.key==='ArrowDown'?1:-1;
 const current=options.indexOf(document.activeElement);
 const next=current<0?(step===1?0:options.length-1):(current+step+options.length)%options.length;
 options[next].focus();
});
window.addEventListener('blur',()=>createMenu.hidePopover());
createMenu.onclick=async event=>{
 const option=event.target.closest('[data-create]');
 if(!option)return;
 createMenu.hidePopover();
 if(option.dataset.create==='exploration')return importForm.openImport();
 if(openingQuick)return;
 openingQuick=true;
 try{await action({action:'newQuick'})}catch(error){notify(error.message)}finally{openingQuick=false}
};
const listTabs=Array.from(document.querySelectorAll('[data-list-kind]'));
function selectList(tab){
 if(tab.getAttribute('aria-selected')==='true')return;
 archived=tab.dataset.listKind==='archive';
 if(!archived)listKind=tab.dataset.listKind;
 for(const item of listTabs){
   item.setAttribute('aria-selected',String(item===tab));
   item.tabIndex=item===tab?0:-1;
 }
 rows.setAttribute('aria-labelledby',tab.id);
 const search=$('#search');search.value='';
 search.placeholder='搜索'+tab.textContent;search.setAttribute('aria-label',search.placeholder);
 renderList();
}
listTabs.forEach((tab,i)=>{
 tab.onclick=()=>selectList(tab);
 tab.onkeydown=event=>{
   const next={ArrowLeft:(i+2)%3,ArrowRight:(i+1)%3,Home:0,End:2}[event.key];
   if(next===undefined)return;
   event.preventDefault();listTabs[next].focus();selectList(listTabs[next]);
 };
});
function notify(message,undo){
 clearTimeout(timer);const t=$('#toast');t.replaceChildren(text('span',message));
 if(undo)t.append(button('撤销',()=>{undo();t.hidden=true}));
 t.hidden=false;timer=setTimeout(()=>t.hidden=true,4500);
}
async function action(request){return host.library.postMessage(request)}
function openReading(d,route){
 const node=route==null?null:route.split('.').reduce((node,index)=>node.children[Number(index)],{children:d.questions});
 action({action:'open',id:d.id,node:node?.id||''}).catch(e=>notify(e.message));
}
function addRenameControl(doc,row,topic){
 const rename=button('',edit,'row-rename');
 rename.dataset.focus='rename-'+doc.id;
 rename.setAttribute('aria-label','重命名「'+doc.title+'」');
 rename.innerHTML='<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12.5 4 3.5 3.5M3.5 16.5l1-4 9.3-9.3a1.7 1.7 0 0 1 2.4 0l.6.6a1.7 1.7 0 0 1 0 2.4l-9.3 9.3z"/></svg>';
 row.append(rename);
 function edit(){
   rows.querySelector('.rename-form')?.reset();
   const form=document.createElement('form');form.className='rename-form';
   const field=document.createElement('input');field.value=doc.title;field.maxLength=100;
   field.setAttribute('aria-label','新标题');
   const accept=button('保存',null,'soft');accept.type='submit';
   const cancel=button('取消',null,'rename-cancel');cancel.type='reset';
   form.append(field,accept,cancel);topic.replaceWith(form);rename.hidden=true;
   field.focus();field.select();
   field.oninput=()=>{accept.disabled=!field.value.trim()};
   field.onkeydown=e=>{
     if(e.isComposing || e.keyCode===229)return;
     if(e.key==='Escape'){e.preventDefault();form.reset()}
   };
   form.onreset=e=>{
     e.preventDefault();form.replaceWith(topic);rename.hidden=false;rename.focus({preventScroll:true});
   };
   form.onsubmit=async e=>{
     e.preventDefault();const title=field.value.trim();if(!title||accept.disabled)return;
     if(title===doc.title){form.reset();return}
     field.readOnly=true;accept.disabled=cancel.disabled=true;
     try{
       await action({action:'rename',id:doc.id,title});
       const stored=docs.find(item=>item.id===doc.id);if(stored)stored.title=title;
       if(form.isConnected)renderList(rename.dataset.focus);
     }catch(error){field.readOnly=false;accept.disabled=cancel.disabled=false;notify(error.message);field.focus()}
   };
 }
}
async function archive(d){
 try{await action({action:'archive',id:d.id,value:d.archived?'0':'1'});notify(d.archived?'已恢复':'已归档',()=>archive({...d,archived:!d.archived}))}
 catch(e){notify(e.message)}
}
function stats(){
 $('#count').replaceChildren(text('span',docs.filter(d=>d.kind!=='quick').length),text('small','篇','unit'));$('#activeLabel').textContent='近 '+days+' 天活跃';
 $('#usageLabel').textContent='近 '+days+' 天追问 Token';
 const daily=[];for(let i=days-1;i>=0;i--){const date=new Date();date.setDate(date.getDate()-i);const key=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');daily.push(activity[key])}
 $('#activity').replaceChildren(text('span',daily.filter(Boolean).length),text('small','天','unit'));
 const reported=daily.filter(v=>v?.reported);
 $('#usage').textContent=reported.length?new Intl.NumberFormat('zh-CN',{notation:'compact'}).format(reported.reduce((s,v)=>s+v.tokens,0)):'未记录';
 $('#usage').classList.toggle('unreported',!reported.length);
 $('#usage').title='仅累计已上报的追问用量';$('#provider').textContent='Codex';
 const max=Math.max(1,...daily.map(v=>v?.questions||0));
 $('#bars').replaceChildren(...daily.map(v=>{const i=document.createElement('i');i.style.height=(v?6+22*v.questions/max:3)+'px';i.classList.toggle('logged',!!v);i.title=(v?.questions||0)+' 次提问';return i}));
 document.querySelectorAll('[data-days]').forEach(b=>{b.setAttribute('aria-pressed',String(+b.dataset.days===days));b.onclick=()=>{days=+b.dataset.days;localStorage.setItem('sideask-library-period',days);stats()}});
}
window.updateLibrary=packet=>{
 docs=packet.articles.map(d=>{
   const byId=new Map(d.nodes.map(n=>[n.id,{...n,children:[]}]));
   const questions=[];for(const n of byId.values()){const parent=byId.get(n.parent);(parent?parent.children:questions).push(n)}
   return {...d,questions,route:null};
 });activity=packet.activity;stats();if(!rows.querySelector('.rename-form'))renderList();
};
const importForm=createImportForm({attachments:false,materialRequest:(action,extra={})=>host.materials.postMessage({action,article:'',...extra}),created:entry=>action({action:'open',id:entry.id})});
$('#search').oninput=()=>renderList();
const dashboard=$('#dashboard'),preferences=$('#preferences'),clipboardQuote=$('#clipboardQuote');
const recordButton=$('#recordShortcut'),shortcutHint=$('#shortcutHint');
let dashboardScroll=0,settingsVisit=0,displayedShortcut=null;
function playSettingPress(button){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const pressed={filter:'brightness(.86)',transform:reduced?'none':'translateY(2px) scale(.95)'};
 button.getAnimations().filter(a=>a.id==='setting-press').forEach(a=>a.cancel());
 return button.animate([{...pressed,offset:0},{...pressed,offset:.38},{filter:'brightness(1)',transform:'none'}],
   {id:'setting-press',duration:reduced?85:175,easing:'ease-out'});
}
function displayShortcut(shortcut,message){
 displayedShortcut=shortcut;
 const names={'⌃':'Ctrl','⌥':'Option','⇧':'Shift','⌘':'Cmd'};
 const compact=shortcut.symbols.length>1;
 const keys=shortcut.symbols.map(symbol=>{
   const cap=document.createElement('kbd');
   if(compact)cap.className='compact-key';
   cap.append(text('b',symbol),names[symbol]);return cap;
 });
 const last=document.createElement('kbd');
 if(shortcut.key==='空格'){last.className='space-key';last.append(text('b','␣'),'空格')}
 else last.append(text('b',shortcut.key));
 recordButton.replaceChildren(...keys,last);recordButton.setAttribute('aria-pressed','false');
 recordButton.setAttribute('aria-label','更换浮页快捷键，当前为 '+shortcut.symbols.join(' ')+' '+shortcut.key);
 shortcutHint.textContent=message || (shortcut.available?'点击键帽，更换呼出与收起浮页的快捷键。':'该组合不可用，点击键帽重新设置。');
}
recordButton.onclick=async()=>{
 playSettingPress(recordButton);
 if(recordButton.getAttribute('aria-pressed')==='true'){await host.settings.postMessage({action:'cancelRecording'});return}
 const visit=settingsVisit;
 recordButton.focus({preventScroll:true});recordButton.setAttribute('aria-pressed','true');
 recordButton.setAttribute('aria-label','正在录入快捷键，再按一次取消');shortcutHint.textContent='按住 ⌃、⌥ 或 ⌘ 再按一个键，Esc 取消。';
 try{
   const result=await host.settings.postMessage({action:'record'});
   if(visit===settingsVisit)displayShortcut(result);
 }catch(error){if(visit===settingsVisit)displayShortcut(displayedShortcut,error.message)}
};
recordButton.onblur=()=>{
 if(recordButton.getAttribute('aria-pressed')==='true')host.settings.postMessage({action:'cancelRecording'}).catch(()=>{});
};
const modelChoice=$('#modelChoice'),effortChoice=$('#effortChoice'),modelStatus=$('#modelStatus');
const effortLabels={none:'关闭',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'更高',max:'最高',ultra:'超高'};
let modelCatalog=null,savedMessageTimer;
function effortLabel(id){return effortLabels[id]||id}
const choiceList=$('#choiceList');
const choiceItems=new Map();
let openChoice=null,activeIndex=-1;
function fillChoice(control,items,value,enabled){
 choiceItems.set(control,items);
 control.value=value;control.disabled=!enabled;
 control.firstElementChild.textContent=items.find(item=>item.value===value)?.label||'—';
}
function closeChoices(){
 if(!openChoice)return;
 openChoice.setAttribute('aria-expanded','false');
 openChoice.removeAttribute('aria-activedescendant');
 openChoice=null;choiceList.hidden=true;choiceList.replaceChildren();
}
function placeChoices(){
 if(!openChoice)return;
 const rect=openChoice.getBoundingClientRect(),gap=5;
 if(rect.bottom<0 || rect.top>innerHeight){closeChoices();return}
 const below=innerHeight-rect.bottom-gap-8,above=rect.top-gap-8;
 const flip=below<Math.min(choiceList.scrollHeight,200) && above>below;
 choiceList.style.width=Math.min(rect.width,280)+'px';
 choiceList.style.maxHeight=Math.max(36,Math.min(320,flip?above:below))+'px';
 choiceList.style.left=rect.left+'px';
 choiceList.style.top=(flip?rect.top-gap-choiceList.offsetHeight:rect.bottom+gap)+'px';
}
function highlightChoice(index,scroll=true){
 const row=choiceList.children[index];
 if(!row)return;
 choiceList.children[activeIndex]?.classList.remove('active');
 activeIndex=index;row.classList.add('active');
 openChoice.setAttribute('aria-activedescendant',row.id);
 if(scroll){
   const top=row.offsetTop,bottom=top+row.offsetHeight;
   if(top<choiceList.scrollTop)choiceList.scrollTop=top;
   else if(bottom>choiceList.scrollTop+choiceList.clientHeight)choiceList.scrollTop=bottom-choiceList.clientHeight;
 }
}
function commitChoice(index){
 const control=openChoice,item=choiceItems.get(control)?.[index];
 if(!item)return;
 closeChoices();
 if(control.value!==item.value){control.value=item.value;control.dispatchEvent(new Event('change'))}
}
function openChoices(control){
 closeChoices();
 openChoice=control;activeIndex=-1;
 control.focus({preventScroll:true});control.setAttribute('aria-expanded','true');
 choiceList.setAttribute('aria-labelledby',control===modelChoice?'modelLabel':'effortLabel');
 const items=choiceItems.get(control);
 for(const [i,item] of items.entries()){
   const row=text('div',item.label,'choice-option');
   row.id='choice-option-'+i;row.setAttribute('role','option');
   row.setAttribute('aria-selected',String(item.value===control.value));
   row.onpointermove=()=>highlightChoice(i,false);
   row.onmousedown=e=>e.preventDefault();
   row.onclick=()=>commitChoice(i);
   choiceList.append(row);
 }
 choiceList.hidden=false;placeChoices();
 if(openChoice)highlightChoice(Math.max(0,items.findIndex(item=>item.value===control.value)));
}
for(const control of [modelChoice,effortChoice]){
 // WebKit may blur a focused button on mouse down, before its toggle click.
 control.onmousedown=e=>{if(e.button===0)e.preventDefault()};
 control.onclick=()=>openChoice===control?closeChoices():openChoices(control);
 control.onkeydown=e=>{
   if(!openChoice && (e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();openChoices(control);return}
   if(openChoice!==control)return;
   const last=choiceList.children.length-1;
   const next={ArrowDown:Math.min(activeIndex+1,last),ArrowUp:Math.max(0,activeIndex-1),Home:0,End:last}[e.key];
   if(next!==undefined){e.preventDefault();highlightChoice(next)}
   else if(e.key==='Enter'||e.key===' '){e.preventDefault();commitChoice(activeIndex)}
   else if(e.key==='Tab')closeChoices();
 };
}
function dismissOutsideChoice(e){
 if(openChoice && !openChoice.contains(e.target) && !choiceList.contains(e.target))closeChoices();
}
document.addEventListener('pointerdown',dismissOutsideChoice,true);
document.addEventListener('click',dismissOutsideChoice,true);
document.addEventListener('focusin',dismissOutsideChoice,true);
document.addEventListener('keydown',e=>{
 if(openChoice && e.key==='Escape'){
   e.preventDefault();e.stopPropagation();closeChoices();
 }
},true);
window.addEventListener('blur',closeChoices);
window.addEventListener('resize',placeChoices);
document.addEventListener('scroll',e=>{if(e.target!==choiceList)placeChoices()},true);
function showModelChoices(){
 const {model,effort,models,selection}=modelCatalog;
 const selected=selection.model||model,item=models.find(entry=>entry.id===selected);
 const options=models.map(m=>({value:m.id,label:m.name||m.id}));
 fillChoice(modelChoice,options,selected||'',options.length>0);
 if(selected && !item)modelChoice.firstElementChild.textContent=selected+'（未列出）';
 $('#resetModel').hidden=!selection.model;$('#resetModel').disabled=!selection.model;
 const level=selection.model?selection.effort:effort;
 const levels=(item?.efforts||[]).map(value=>({value,label:effortLabel(value)}));
 if(!levels.some(option=>option.value===(level||'')))levels.push({value:level||'',label:level?effortLabel(level):'模型默认'});
 fillChoice(effortChoice,levels,level||'',!!item?.efforts.length);
 modelStatus.textContent=selection.model && !item?'所选模型已不在当前列表，请重新选择。':'';
}
async function loadModels(){
 const visit=settingsVisit;
 clearTimeout(savedMessageTimer);$('#modelSaved').textContent='';
 $('#resetModel').hidden=true;modelCatalog=null;modelChoice.disabled=true;effortChoice.disabled=true;
 modelChoice.firstElementChild.textContent=effortChoice.firstElementChild.textContent='读取中…';
 modelStatus.textContent='';$('#reloadModels').hidden=true;
 try{
   const result=await host.settings.postMessage({action:'modelOptions'});
   if(visit!==settingsVisit)return;
   modelCatalog=result;showModelChoices();
 }catch(error){
   if(visit!==settingsVisit)return;
   modelChoice.firstElementChild.textContent='未能读取';effortChoice.firstElementChild.textContent='—';
   modelStatus.textContent=error.message;$('#reloadModels').hidden=false;
 }
}
async function saveModelChoice(event){
 if(!modelCatalog)return;
 const control=event.currentTarget;
 const visit=settingsVisit,changingEffort=control===effortChoice,resetting=control===$('#resetModel');
 if(resetting)playSettingPress(control);
 const model=resetting?'':modelChoice.value;
 const item=modelCatalog.models.find(entry=>entry.id===model);
 const effort=changingEffort?effortChoice.value:(item?.efforts.includes(item.defaultEffort)?item.defaultEffort:item?.efforts[0]||'');
 clearTimeout(savedMessageTimer);$('#modelSaved').textContent='';
 $('#resetModel').disabled=true;modelChoice.disabled=true;effortChoice.disabled=true;
 try{
   await host.settings.postMessage({action:'saveModel',model,effort});
   if(visit!==settingsVisit)return;
   modelCatalog.selection={model,effort};showModelChoices();
   $('#modelSaved').textContent='已保存，下次提问生效';
   savedMessageTimer=setTimeout(()=>{$('#modelSaved').textContent=''},2400);
 }catch(error){
   if(visit!==settingsVisit)return;
   showModelChoices();modelStatus.textContent=error.message;
 }finally{
   if(visit===settingsVisit){
     if(document.activeElement===document.body)(resetting?modelChoice:control).focus({preventScroll:true});
   }
 }
}
modelChoice.onchange=effortChoice.onchange=$('#resetModel').onclick=saveModelChoice;
$('#reloadModels').onclick=loadModels;

async function showSettings(){
 if(!preferences.hidden || document.querySelector('dialog[open]'))return;
 createMenu.hidePopover();
 backButton.getAnimations().forEach(animation=>animation.cancel());
 dashboardScroll=window.scrollY;
 dashboard.hidden=true;preferences.hidden=false;
 window.scrollTo(0,0);$('#preferences-title').focus({preventScroll:true});
 const visit=++settingsVisit;
 loadModels();
 clipboardQuote.disabled=true;recordButton.disabled=true;
 try{
   const prefs=await host.settings.postMessage({action:'enter'});
   if(visit!==settingsVisit)return;
   clipboardQuote.checked=prefs.clipboard;clipboardQuote.disabled=false;
   displayShortcut(prefs.shortcut);recordButton.disabled=false;
 }catch(error){notify(error.message)}
}
function returnToLibrary(){
 if(preferences.hidden)return;
 closeChoices();settingsVisit++;preferences.hidden=true;dashboard.hidden=false;
 $('.library-kinds [aria-selected=true]').focus({preventScroll:true});
 window.scrollTo(0,dashboardScroll);
 host.settings.postMessage({action:'leave'}).catch(error=>notify(error.message));
}
const backButton=$('#backToLibrary');
backButton.onclick=()=>{
 if(backButton.getAnimations().some(a=>a.id==='setting-press'))return;
 const visit=settingsVisit;
 playSettingPress(backButton);
 setTimeout(()=>{
   if(visit===settingsVisit)returnToLibrary();
 },32);
};
clipboardQuote.onchange=async()=>{
 const enabled=clipboardQuote.checked,visit=settingsVisit;
 clipboardQuote.disabled=true;
 try{await host.settings.postMessage({action:'clipboard',enabled})}
 catch(error){if(visit===settingsVisit){clipboardQuote.checked=!enabled;notify(error.message)}}
 finally{if(visit===settingsVisit)clipboardQuote.disabled=false}
};
document.addEventListener('keydown',event=>{
 if(document.querySelector('dialog[open]') || (!preferences.hidden && recordButton.getAttribute('aria-pressed')==='true'))return;
 if(event.metaKey && event.key===','){event.preventDefault();showSettings()}
 if(event.key==='Escape' && !preferences.hidden){event.preventDefault();returnToLibrary()}
});

const overview=$('.overview');
overview.addEventListener('pointermove',event=>{
 const bounds=overview.getBoundingClientRect();
 overview.style.setProperty('--shine-x',(event.clientX-bounds.left)+'px');
 overview.style.setProperty('--shine-y',(event.clientY-bounds.top)+'px');
});
