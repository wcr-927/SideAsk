// This adapter is loaded only inside the native window.
let article = window.pairArticle || JSON.parse(localStorage.getItem('sideask-active-article') || '{"id":"welcome","source":""}');
let isQuick=article.kind==='quick';
let pendingQuickReply=null;
function newReply(){
  const reply={text:isQuick?'':'正在连接 Codex…',cls:'live-answer'};
  if(isQuick)pendingQuickReply=reply;
  return reply;
}
function renderAnswer(block,reply){
  if(reply===pendingQuickReply){
    const dots=document.createElement('span');
    dots.className='reply-wait';dots.setAttribute('role','status');dots.setAttribute('aria-label','正在等待回答');
    dots.innerHTML='<i></i><i></i><i></i>';
    block.replaceChildren(dots);
  }else if(isQuick && !reply.text){
    block.textContent='上次回答已中断。';
  }else formatLive(block,reply.text);
}
function quickConversation(n,reply){
  const turns=[{role:'user',text:n.title,quote:n.quote}];
  for(const block of n.blocks){
    if(block===reply)break;
    if(block.cls==='turn-title')turns.push({role:'user',text:block.text});
    else if(block.cls==='turn-quote')turns[turns.length-1].quote=block.text;
    else if(block.cls==='live-answer' && block.text)turns.push({role:'assistant',text:block.text});
  }
  return turns;
}
window.sideAskNative = {
  ...article, busy:false,
  ask(n,reply,title,quote){
    this.busy=true;
    get('#send').disabled=true;
    const context=isQuick ? {对话:quickConversation(n,reply)} : {
      原文:this.source,对话路径:path(n).map(item=>({question:item.title,quote:item.quote,content:item.blocks.filter(b=>b!==reply).map(b=>b.text)})),
      当前引用:quote,当前问题:title
    };
    const prompt=JSON.stringify(context);
    if(isQuick && !cachedSummary && !localStorage.getItem(summaryKey(article.id)) && !localStorage.getItem('sideask-title-'+article.id)){
      const name=Array.from(n.title.replace(/\s+/g,' ')).slice(0,36).join('');
      localStorage.setItem(summaryKey(article.id),name);showSummary(name);
    }
    window.receiveCodex=event=>{
      if(pendingQuickReply===reply){
        if(event.kind==='text' && !event.value.trim())return;
        pendingQuickReply=null;
      }
      reply.text=event.value;
      if(event.kind==='error')reply.text='连接失败：'+event.value;
      if(event.kind!=='text')this.busy=false;
      const paragraph=reader.querySelector('[data-node="'+n.id+'"] > [data-block="'+n.blocks.indexOf(reply)+'"]');
      if(paragraph)formatLive(paragraph,reply.text,event.kind==='text');
      if(event.kind!=='text'){
        persist();get('#send').disabled=!input.value.trim();
        if(path(current()).includes(n))render(positionNow());
      }
    };
    window.webkit.messageHandlers.ask.postMessage({article:this.id,prompt,...(isQuick?{quickTitle:n.title,customTitle:localStorage.getItem('sideask-title-'+this.id)||''}:{})});
  }
};
window.changeArticle=({firstQuestion,firstQuote,...next},resumeNode)=>{
  if(native.busy)return false;
  if(firstQuestion && article.id==='welcome'){input.value='';quoteInput.value='';writeDraft()}
  remember();persist();
  localStorage.setItem('sideask-active-article',JSON.stringify(next));
  closeRecents();showPageMenu(false);closeIndex();
  finishPromptFade?.();
  if(quoteBubble.contains(document.activeElement))input.focus({preventScroll:true});
  window.getSelection()?.removeAllRanges();
  selectedRange=null;alignment=null;window.visibleBranch=null;
  creatingQuick=false;pendingQuickReply=null;window.receiveCodex=null;
  article=next;isQuick=article.kind==='quick';imported=article.id!=='welcome' && !isQuick;
  Object.assign(native,{id:article.id,kind:article.kind,source:article.source});
  loadConversation();captureNodes();repairSavedMathQuotes();
  quoteOwner=null;refreshArticleTitle();configureArticleMenu();
  render();
  if(resumeNode)visitLibraryNode(resumeNode);
  if((imported||isQuick) && current().id==='article')input.focus({preventScroll:true});
  if(firstQuestion && isQuick && current().id==='article'){
    input.value=firstQuestion;quoteInput.value=firstQuote||'';writeDraft();send();
  }
  paper.getAnimations().filter(a=>a.id==='conversation-arrival').forEach(a=>a.cancel());
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    paper.animate([{opacity:.65,transform:'translateY(4px)'},{opacity:1,transform:'none'}],
      {id:'conversation-arrival',duration:170,easing:'ease-out'});
  }
  return true;
};
const sendButton=get('#send');
sendButton.textContent='';
sendButton.title='发送';
sendButton.setAttribute('aria-label','发送');
sendButton.innerHTML='<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 13V3m-5 5 5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function trackGlassLight(event){
  const glass=event.currentTarget,bounds=glass.getBoundingClientRect();
  glass.style.setProperty('--light-x',(event.clientX-bounds.left)+'px');
  glass.style.setProperty('--light-y',(event.clientY-bounds.top)+'px');
}
panel.querySelector('header').addEventListener('pointermove',trackGlassLight);
get('.note header').addEventListener('pointerdown',e=>{
  if(!e.target.closest('button,[role=button]'))window.webkit.messageHandlers.windowAction.postMessage('drag');
},true);
// Fade an edge only while there is more text beyond it.
let observedAnswer=null,fadeFrame=0;
function scheduleReadingFade(){
  if(fadeFrame)return;
  fadeFrame=requestAnimationFrame(()=>{
    fadeFrame=0;
    paper.classList.toggle('fade-above',paper.scrollTop>1);
    paper.classList.toggle('fade-below',paper.scrollHeight-paper.clientHeight-paper.scrollTop>1);
  });
}
const fadeObserver=new ResizeObserver(scheduleReadingFade);
fadeObserver.observe(paper);
new MutationObserver(()=>{
  if(observedAnswer)fadeObserver.unobserve(observedAnswer);
  observedAnswer=paper.firstElementChild;
  if(observedAnswer)fadeObserver.observe(observedAnswer);
  scheduleReadingFade();
}).observe(paper,{childList:true});
paper.addEventListener('scroll',scheduleReadingFade,{passive:true});

// Ordinary equations share the answer's scroll surface. Only an oversized
// equation needs its own horizontal viewport.
const formulaRoots=new Set();
let formulaFrame=0;
function checkFormulaWidths(root){
  formulaRoots.add(root);
  if(formulaFrame)return;
  formulaFrame=requestAnimationFrame(()=>{
    formulaFrame=0;
    for(const surface of formulaRoots){
      if(!surface.isConnected)continue;
      for(const line of surface.querySelectorAll('.katex-display')){
        const wide=line.firstElementChild?.scrollWidth>line.clientWidth+1;
        line.classList.toggle('wide-equation',wide);
        if(wide)line.addEventListener('wheel',scrollAnswerOverMath,{passive:false});
        else line.removeEventListener('wheel',scrollAnswerOverMath);
      }
    }
    formulaRoots.clear();
  });
}
function scrollAnswerOverMath(event){
  if(event.ctrlKey || event.shiftKey || !event.deltaY || Math.abs(event.deltaX)>=Math.abs(event.deltaY))return;
  const surface=event.currentTarget.closest('.background-text,.source-paper,.paper') || paper;
  const unit=event.deltaMode===1 ? parseFloat(getComputedStyle(surface).lineHeight) : event.deltaMode===2 ? surface.clientHeight : 1;
  if(!event.cancelable)return;
  surface.scrollTop+=event.deltaY*unit;
  event.preventDefault();
}
const formulaLayoutObserver=new ResizeObserver(()=>checkFormulaWidths(document.body));
formulaLayoutObserver.observe(paper);
document.fonts.addEventListener('loadingdone',()=>checkFormulaWidths(document.body));
// Long prose inside a brace sets the width of the mathematical term above it.
// Keep the original TeX and text nodes (including saved selection offsets).
function layoutBraceNotes(span){
  const line=span.querySelector('.katex-display');
  if(!line)return;
  const labels=[...line.querySelectorAll('.munder > .vlist-t > .vlist-r > .vlist > span > .katex-sizing .text')];
  if(!labels.some(el=>/[\u3400-\u9fff]{6}/.test(el.textContent)))return;
  const notes=labels.map((label,i)=>{
    label.classList.add('brace-label');
    label.dataset.number=String(i+1);
    return '('+(i+1)+') '+label.textContent;
  });
  line.dataset.notes=notes.join('　');
}
// Imported Markdown can double the delimiters while leaving TeX commands intact.
// Match paired delimiters of the same width before Markdown consumes the escapes.
const mathTokens=/```[\s\S]*?(?:```|$)|`[^`\n]*(?:`|$)|\$\$(?<display>[\s\S]*?)\$\$|(?<square>\\{1,2})\[(?<bracket>[\s\S]*?)\k<square>\]|(?<round>\\{1,2})\((?<paren>[\s\S]*?)\k<round>\)|(?<!\\)\$(?<inline>[^$\n]+?)\$/g;
function mathToken(groups){
  let text=groups.display ?? groups.bracket ?? groups.paren ?? groups.inline ?? groups.command;
  if(text===undefined)return null;
  if((groups.square ?? groups.round)?.length===2){
    text=text.replace(/\\{4}(?=\[)/g,'\\\\').replace(/\\{3}(?=\s)/g,'\\\\').replace(/\\{2},/g,'\\,');
  }
  return {text,display:groups.display!==undefined || groups.bracket!==undefined};
}
function formatLive(block,text,streaming=false){
  // A delta can stop halfway through a formula. Keep the completed prefix readable.
  if(streaming){
    const tokens=/```[\s\S]*?(?:```|$)|`[^`\n]*(?:`|$)|\$\$|\\[()[\]]|(?<!\\)\$/g;
    let waiting=null;
    for(const m of text.matchAll(tokens)){
      if(m[0].startsWith('`'))continue;
      if(waiting){if(m[0]===waiting.end)waiting=null;continue}
      const end={'$$':'$$','$':'$','\\(':'\\)','\\[':'\\]'}[m[0]];
      if(end && !(m[0]==='$' && /\s/.test(text[m.index+1] || ' ')))waiting={end,at:m.index};
    }
    if(waiting)text=text.slice(0,waiting.at)+' …';
  }
  // Parse in an inert template and copy only simple formatting, never attributes.
  const formulas=[];
  const prepared=text.replace(mathTokens,(match,...args)=>{
    const formula=mathToken(args.at(-1));
    if(!formula)return match;
    const index=formulas.length;
    formulas.push(formula);
    return 'SIDEASKMATH'+index+'END';
  });
  const template=document.createElement('template');
  template.innerHTML=marked.parse(prepared,{breaks:block.classList.contains('original-body')});
  const allowed=new Set('P BR STRONG EM PRE CODE UL OL LI BLOCKQUOTE H1 H2 H3 H4 TABLE TR TH TD TBODY THEAD HR'.split(' '));
  function clean(n){
    if(n.nodeType===Node.TEXT_NODE){
      const part=document.createDocumentFragment();
      for(const s of n.data.split(/(SIDEASKMATH\d+END)/g)){
        const m=/^SIDEASKMATH(\d+)END$/.exec(s),f=m&&formulas[Number(m[1])];
        if(f){const span=document.createElement('span');katex.render(f.text,span,{displayMode:f.display,throwOnError:false,trust:false});if(f.display && f.text.includes('\\underbrace'))layoutBraceNotes(span);part.append(span)}
        else part.append(s);
      }
      return part;
    }
    if(n.nodeName==='A'){
      const citation=/^sideask-source:([a-f0-9-]{36})\/(\d+)$/.exec(n.getAttribute('href') || '');
      if(citation){
        const link=document.createElement('button');
        link.className='source-citation';link.textContent=n.textContent;
        link.onclick=()=>showSourceExcerpt(citation[1],citation[2]);
        return link;
      }
    }
    const el=allowed.has(n.nodeName)?document.createElement(n.localName):document.createDocumentFragment();
    n.childNodes.forEach(c=>el.append(clean(c)));return el;
  }
  block.replaceChildren(clean(template.content));
  if(formulas.some(f=>f.display))checkFormulaWidths(block);
}

// Older selections stored KaTeX's MathML, TeX annotation and visible glyphs together.
function repairSavedMathQuotes(){
  for(const n of state.nodes){
    if(!n.anchor || !n.parent || !n.quote)continue;
    const parent=find(n.parent);
    if(!parent)continue;
    for(const block of parent.blocks.slice(n.anchor.first,n.anchor.last+1)){
      if(block.cls!=='live-answer' || !block.text)continue;
      // A legacy selection contains the original TeX without its delimiters.
      const template=document.createElement('div');
      formatLive(template,block.text);
      for(const math of template.querySelectorAll('.katex')){
        const tex=math.querySelector('annotation')?.textContent;
        const legacy=math.textContent;
        if(tex && legacy!==tex && n.quote.includes(legacy)){
          n.quote=n.quote.split(legacy).join('$'+tex+'$');
        }
      }
    }
  }
}
// Quotes stay plain text in storage. Only their presentation gets typeset.
function typesetQuote(el,text){
  if(el.dataset.quote===text)return;
  el.dataset.quote=text;
  const fragment=document.createDocumentFragment();
  const bareCommand=/(?<command>\\[A-Za-z]+(?:\s*(?:\\[A-Za-z]+|[_^]|[\w=+\-/.,(){}]))*)/;
  const tokens=new RegExp(mathTokens.source+'|'+bareCommand.source,'g');
  let offset=0;
  for(const match of text.matchAll(tokens)){
    fragment.append(text.slice(offset,match.index));
    const formula=mathToken(match.groups);
    if(!formula){fragment.append(match[0])}
    else{
      const span=document.createElement('span');
      try{katex.render(formula.text.trim(),span,{displayMode:formula.display && formula.text.includes('\\tag'),trust:false,throwOnError:true});fragment.append(span)}
      catch{fragment.append(match[0])}
    }
    offset=match.index+match[0].length;
  }
  fragment.append(text.slice(offset));el.replaceChildren(fragment);
}
const quoteField=get('.ref input'), quotePreview=document.createElement('button');
quotePreview.type='button';quotePreview.className='quote-preview';quotePreview.hidden=true;
quotePreview.title='编辑引用';quoteField.after(quotePreview);
const quoteBubble=quoteField.closest('.ref');
quoteBubble.id='quote-bubble';
const quoteToggle=document.createElement('button');
quoteToggle.id='quote-toggle';quoteToggle.type='button';quoteToggle.innerHTML='<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 3.5h5v4c0 2.4-1.4 4.2-4.2 5l-.7-1.5c1.7-.8 2.5-1.8 2.6-3H2zm7 0h5v4c0 2.4-1.4 4.2-4.2 5l-.7-1.5c1.7-.8 2.5-1.8 2.6-3H9z"/></svg>';
quoteToggle.title='添加或编辑引用';quoteToggle.setAttribute('aria-label',quoteToggle.title);
quoteToggle.setAttribute('aria-controls',quoteBubble.id);
quoteBubble.before(quoteToggle);
let quoteOwner=null, bubbleOpen=false;
function syncQuotePreview(){
  const owner=state.pending || current().id;
  if(owner!==quoteOwner){
    quoteOwner=owner;bubbleOpen=!!quoteField.value;
  }
  quoteBubble.hidden=!bubbleOpen;
  quoteToggle.setAttribute('aria-expanded',String(bubbleOpen));
  quoteToggle.classList.toggle('has-quote',!!quoteField.value);
  const preview=!!quoteField.value && document.activeElement!==quoteField;
  quotePreview.hidden=!preview;quoteField.hidden=preview;
  if(preview)typesetQuote(quotePreview,quoteField.value);
}
function editQuote(){
  quotePreview.hidden=true;quoteField.hidden=false;quoteField.focus();
}
function toggleQuote(){
  bubbleOpen=!bubbleOpen;syncQuotePreview();
  if(bubbleOpen)editQuote();else input.focus();
}
quotePreview.onclick=editQuote;
quoteField.addEventListener('blur',event=>{
  if(!quoteField.value && event.relatedTarget && !quoteBubble.contains(event.relatedTarget) && event.relatedTarget!==quoteToggle)bubbleOpen=false;
  syncQuotePreview();
});
quoteField.addEventListener('keydown',event=>{
  if(event.isComposing || !['Enter','Escape'].includes(event.key))return;
  event.preventDefault();bubbleOpen=false;input.focus();syncQuotePreview();
});

let imported=article.id!=='welcome' && !isQuick;
let creatingQuick=false;
async function startQuick(question='',quote=''){
  if(creatingQuick)return;
  creatingQuick=true;
  try{await window.webkit.messageHandlers.library.postMessage({action:'newQuick',question,quote})}
  catch(error){creatingQuick=false;const box=actionDialog('暂时无法新建随问');box.append(document.createTextNode(error.message),sourceButton('关闭',()=>box.close()));box.showModal()}
}
function receiveClipboardQuote(quote){
  if(sideAskNative.busy)return;
  if(isQuick){
    if(!drafting().text && !drafting().quote)begin(null,null,quote);
  }else if(!state.pending || (!state.pending.text && !state.pending.quote))begin(null,null,quote);
}
const importButton=document.createElement('button');
importButton.textContent=imported?'添加参考资料':'新建探索';
importButton.className='import-button';
get('.index-trigger').before(importButton);
const {editor,openImport:openImportForm,articleText,confirmImport,dropZone,fileRows}=createImportForm({
  attachments:false, materialRequest, created:entry=>changeArticle(entry)
});
function openImport(attachments=imported){return openImportForm(attachments)}
importButton.onclick=()=>openImport();
const subtitle=get('.subtitle');
const summaryKey=id=>'sideask-summary-'+id;
function showSummary(text){
  subtitle.textContent=text || '最近对话';
  subtitle.setAttribute('aria-label',(text?text+'，':'')+'切换随问或探索');
}
window.receiveTitle=(id,title)=>{
  localStorage.setItem('sideask-title-'+id,title);
  if(id===article.id)showSummary(title);
};
window.receiveSummary=(id,text)=>{
  if(localStorage.getItem('sideask-title-'+id))return;
  if(text)localStorage.setItem(summaryKey(id),text);
  if(id===article.id)showSummary(text || '已导入原文');
};
let cachedSummary;
function refreshArticleTitle(){
  cachedSummary=localStorage.getItem('sideask-title-'+article.id)||article.customTitle||article.summary || localStorage.getItem(summaryKey(article.id));
  showSummary(isQuick ? cachedSummary || '新随问' : imported ? cachedSummary || '正在概括原文…' : '');
  if(imported && !cachedSummary && !window.pairSeed)window.webkit?.messageHandlers?.summarize?.postMessage({id:article.id,source:article.source});
}
refreshArticleTitle();
get('#new-note').textContent='针对整段另问';
get('#ask-selection').textContent='再问';
get('.ref input').placeholder='添加引用（可选）';
const quickWelcome=document.createElement('p');
quickWelcome.className='quick-prompt';
quickWelcome.innerHTML='<img src="SideAsk-header.png" width="68" height="68" alt="" draggable="false"><span>想问点什么？</span>';
const welcome=elementWelcome();
function elementWelcome(){
  const section=document.createElement('section');
  section.className='start-reading';
  section.innerHTML='<h1>想问点什么？</h1><p>直接输入开始随问，或导入长回答展开探索。</p><button type="button">新建探索</button>';
  section.querySelector('button').onclick=()=>importButton.click();
  return section;
}
const promptPage=document.createElement('section');
promptPage.className='start-reading';
promptPage.innerHTML='<h1>你想问什么？</h1><p>原文已作为本篇背景。可以直接提问，也可以复制一句原文再追问。</p><button type="button">查看原文</button>';
const background=document.createElement('dialog');
background.className='import-editor original-dialog';
background.innerHTML='<form method="dialog"><h2 id="original-title">原文</h2><div class="background-text original-body live-answer" role="region" aria-labelledby="original-title" tabindex="0" autofocus></div><button>返回提问</button></form>';
document.body.append(background);
function showBackground(){
  const body=background.querySelector('.original-body');
  formatLive(body,article.source);
  background.showModal();
  body.scrollTop=0;
}
promptPage.querySelector('button').onclick=showBackground;
const promptMaterials=document.createElement('button');
promptMaterials.type='button';promptMaterials.textContent='添加参考资料';
promptMaterials.onclick=()=>openImport();promptPage.append(promptMaterials);
function refineNativePage(){
  get('#new-note').hidden=true;
  if(window.pairSeed && !state.pending)input.placeholder='继续问这条旁注…';
  composeMore.hidden=!!window.pairSeed || !!state.pending || current().id==='article';
  if(isQuick){
    composeMore.hidden=true;cancelNew.hidden=true;get('.compose-target').hidden=true;
    get('.index-trigger').hidden=true;importButton.hidden=true;
    if(current().id==='article')reader.replaceChildren(quickWelcome);
    input.placeholder=current().id==='article'?'输入你的问题…':'继续随问…';
    return;
  }
  const empty=!imported && current().id==='article';
  if(current().id==='article')reader.replaceChildren(empty?welcome:promptPage);
  importButton.hidden=false;
  const count=state.nodes.filter(n=>!n.parent&&n.id!=='article').length;
  get('.index-trigger').hidden=!!window.pairSeed || count===0;
  get('.index-trigger').textContent='TOC';
  if(current().id==='article'){
    get('#new-note').hidden=true;
    get('#cancel-new').hidden=true;
    get('.compose-target').hidden=true;
    input.placeholder=imported?'输入你的问题…':'也可以直接提问…';
  }
}

window.addEventListener('load',()=>{
  if((imported||isQuick) && current().id==='article')input.focus();
});

const composeMore=document.createElement('button');
composeMore.id='compose-more';
const cancelNew=get('#cancel-new');
cancelNew.title='取消新问题';cancelNew.setAttribute('aria-label','取消新问题');
for(const button of [composeMore,cancelNew]){
  button.innerHTML='<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M8 2.5v11M2.5 8h11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
}
composeMore.setAttribute('aria-label','新建问题');
composeMore.title='新建问题';
get('.compose-actions').prepend(composeMore);
composeMore.onclick=()=>startRootQuestion();
function startRootQuestion(){
  if(state.pending){input.focus();return}
  const previous=input.value?'':input.placeholder;
  begin(null,null,'');
  fadePrompt(previous);
}
let finishPromptFade;
function fadePrompt(previous){
  finishPromptFade?.();
  if(input.value || previous===input.placeholder || matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const ghost=document.createElement('span');ghost.className='prompt-ghost';
  ghost.textContent=previous;ghost.setAttribute('aria-hidden','true');input.after(ghost);
  ghost.animate([{opacity:1},{opacity:0}],{duration:140,fill:'forwards'});
  const incoming=input.animate([{opacity:0},{opacity:0,offset:.4},{opacity:1}],{duration:320});
  function clear(){
    ghost.remove();incoming.cancel();input.removeEventListener('input',clear);finishPromptFade=null;
  }
  finishPromptFade=clear;
  input.addEventListener('input',clear,{once:true});
  incoming.onfinish=clear;
}

function actionDialog(title){
  const box=document.createElement('dialog');
  box.addEventListener('pointermove',trackGlassLight);
  box.className='import-editor action-editor';
  const heading=document.createElement('h2');heading.textContent=title;box.append(heading);
  document.body.append(box);box.onclose=()=>box.remove();
  return box;
}
function dialogButtons(box,label,act){
  const row=document.createElement('footer');
  for(const [name,fn] of [['取消',()=>box.close()],[label,act]]){
    const button=document.createElement('button');button.textContent=name;button.onclick=fn;row.append(button);
  }
  box.append(row);box.showModal();
}
function materialRequest(action,extra={}){
  return window.webkit.messageHandlers.materials.postMessage({action,article:article.id,...extra});
}
async function showSourceExcerpt(documentId,index){
  const box=actionDialog('资料出处');
  const label=document.createElement('p'),body=document.createElement('div'),footer=document.createElement('footer');
  body.className='background-text';
  label.textContent='正在读取出处…';
  footer.append(sourceButton('关闭',()=>box.close()));
  box.append(label,body,footer);box.showModal();
  try {
    const source=await materialRequest('excerpt',{document:documentId,index});
    label.textContent=source.name+' · '+source.location;
    body.textContent=source.text || '此处没有提取到文字。';
    if(source.pageImage){
      const image=document.createElement('img');image.alt=source.location+'原页';
      image.src='data:image/png;base64,'+source.pageImage;image.style.width='100%';
      body.replaceChildren(image);
    }
    footer.prepend(sourceButton('打开原件',async()=>{
      try {await materialRequest('original',{document:documentId})} catch(error){label.textContent=error.message}
    }));
  } catch(error){label.textContent=error.message}
}
function editTitle(){
  if(!imported && !isQuick)return;
  const box=actionDialog('重命名');
  const field=document.createElement('input');field.value=subtitle.textContent;field.maxLength=100;
  field.setAttribute('aria-label','探索标题');box.append(field);
  function save(){
    const title=field.value.trim();if(!title){field.focus();return}
    receiveTitle(article.id,title);
    window.webkit?.messageHandlers?.renameArticle?.postMessage({id:article.id,title});box.close();
  }
  dialogButtons(box,'保存',save);field.focus();field.select();
  field.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)save()};
}
function confirmDelete(n){
  if(native.busy)return;
  const descendants=state.nodes.filter(x=>path(x).includes(n));
  const box=actionDialog('删除这个问题？');
  const description=document.createElement('p');
  description.textContent='「'+n.title+'」'+(descendants.length>1?'和下属 '+(descendants.length-1)+' 个追问':'')+'将从本篇中删除。';
  box.append(description);
  dialogButtons(box,'删除问题',()=>{
    if(native.busy)return;
    const removed=new Set(descendants.map(x=>x.id));
    if(removed.has(state.active)){state.active=n.parent||'article';state.pending=current().pendingDraft??null}
    state.nodes=state.nodes.filter(x=>!removed.has(x.id));
    render();persist();box.close();
  });
}
function positionDirectory(){
  const right=panel.getBoundingClientRect().right-get('.index-trigger').getBoundingClientRect().right;
  outline.style.right=Math.max(8,right)+'px';
}
window.addEventListener('resize',()=>{if(!outline.hidden)positionDirectory()});

const menuButton=document.createElement('button');
menuButton.className='page-menu-button';menuButton.innerHTML='<svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="4" r="1.5"/><circle cx="8" cy="4" r="1.5"/><circle cx="13" cy="4" r="1.5"/></g></svg>';menuButton.title='探索操作';
menuButton.setAttribute('aria-label','探索操作');get('#hide').replaceWith(menuButton);
const pageMenu=document.createElement('nav');pageMenu.className='page-menu';pageMenu.hidden=true;panel.append(pageMenu);
const recents=document.createElement('section');
recents.id='recent-explorations';recents.className='page-menu recent-menu';recents.hidden=true;
recents.setAttribute('aria-label','最近对话');
const recentToolbar=document.createElement('div');
recentToolbar.className='recent-toolbar';
const recentKinds=document.createElement('div');
recentKinds.className='recent-kinds';
const quickTab=document.createElement('button'), explorationTab=document.createElement('button');
quickTab.type=explorationTab.type='button';
quickTab.textContent='随问';explorationTab.textContent='探索';
const recentCreate=document.createElement('button');
recentCreate.type='button';recentCreate.className='recent-create';
recentCreate.innerHTML='<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8 2.5v11M2.5 8h11"/></svg>';
recentKinds.append(explorationTab,quickTab);
const recentRows=document.createElement('div'),recentStatus=document.createElement('div');
recentRows.className='recent-rows';recentStatus.className='recent-status';recentStatus.setAttribute('role','status');
recentToolbar.append(recentKinds,recentCreate);
recents.append(recentToolbar,recentRows,recentStatus);panel.append(recents);
let recentRequest=0,recentKind='exploration',recentLists=null;
const requestRecent=args=>window.webkit.messageHandlers.library.postMessage(args);
function closeRecents(restoreFocus=false){
  if(recents.hidden)return;
  recentRequest++;recentLists=null;recents.hidden=true;recentRows.replaceChildren();subtitle.setAttribute('aria-expanded','false');
  if(restoreFocus)subtitle.focus({preventScroll:true});
}
function positionRecents(){
  const anchor=subtitle.getBoundingClientRect(),bounds=panel.getBoundingClientRect();
  recents.style.left=Math.max(8,Math.min(anchor.left-bounds.left,bounds.width-recents.offsetWidth-8))+'px';
  recents.style.top=(anchor.bottom-bounds.top+9)+'px';
}
function selectRecentKind(kind){
  const quick=kind==='quick';
  recentKind=kind;
  quickTab.setAttribute('aria-pressed',String(quick));explorationTab.setAttribute('aria-pressed',String(!quick));
  recentCreate.setAttribute('aria-label',quick?'新建随问':'新建探索');
  recentStatus.replaceChildren();
  if(recentLists)renderRecentRows();
}
recentCreate.onclick=()=>{
  closeRecents(true);
  if(recentKind==='quick')startQuick();else openImport(false);
};
function renderRecentRows(){
  const fragment=document.createDocumentFragment();
  const kind=recentKind,items=recentLists[kind];
  for(const item of items){
    const row=document.createElement('div');row.className='recent-row';
    const select=sourceButton(item.title,async()=>{
      const version=recentRequest;
      if(item.id!==article.id)try{await requestRecent({action:'open',id:item.id})}
      catch(error){if(version===recentRequest)recentStatus.textContent=error.message;return}
      if(version===recentRequest)closeRecents(true);
    });
    select.className='recent-title';select.setAttribute('aria-current',String(item.id===article.id));
    const archive=sourceButton('',async()=>{
      const version=recentRequest;
      archive.disabled=true;
      try{
        await requestRecent({action:'archive',id:item.id,value:'1'});
        if(version!==recentRequest)return;
        if(!await loadRecentLists() || recentKind!==kind)return;
        const undo=sourceButton('撤销',async()=>{
          const undoVersion=recentRequest;
          undo.disabled=true;
          try{
            await requestRecent({action:'archive',id:item.id,value:'0'});
            if(undoVersion!==recentRequest)return;
            recentStatus.replaceChildren();await loadRecentLists();
          }catch(error){if(undoVersion===recentRequest)recentStatus.textContent=error.message}
        });
        recentStatus.replaceChildren('已归档',undo);undo.focus({preventScroll:true});
      }catch(error){archive.disabled=false;if(!recents.hidden && recentKind===kind)recentStatus.textContent=error.message}
    });
    archive.className='recent-archive';archive.setAttribute('aria-label','归档 '+item.title);
    archive.innerHTML='<svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="16" height="4" rx="1"/><path d="M4 7v9h12V7M8 10h4"/></svg>';
    row.append(select,archive);fragment.append(row);
  }
  if(!items.length){
    const empty=document.createElement('p');empty.className='recent-empty';
    empty.textContent=kind==='quick'?'暂无随问':'暂无探索';fragment.append(empty);
  }
  recentRows.replaceChildren(fragment);recentRows.scrollTop=0;
}
async function loadRecentLists(){
  const version=++recentRequest;
  const lists=await requestRecent({action:'recentLists'});
  if(version!==recentRequest)return false;
  recentLists=lists;renderRecentRows();return true;
}
async function openRecents(kind=isQuick?'quick':'exploration'){
  closeIndex();showPageMenu(false);
  selectRecentKind(kind);
  recents.hidden=false;subtitle.setAttribute('aria-expanded','true');positionRecents();
  try{
    if(await loadRecentLists() && recentKind===kind && document.activeElement===subtitle && subtitle.matches(':focus-visible'))
      (recentRows.querySelector('[aria-current=true]') || recentRows.querySelector('.recent-title'))?.focus();
  }catch(error){if(!recents.hidden)recentStatus.textContent=error.message}
}
window.addEventListener('resize',()=>{if(!recents.hidden)positionRecents()});
document.addEventListener('pointerdown',e=>{
  if(!recents.contains(e.target)&&!subtitle.contains(e.target))closeRecents();
});
document.addEventListener('keydown',e=>{
  if(recents.hidden)return;
  if(e.key==='Escape'){e.preventDefault();closeRecents(true);return}
  if(!['ArrowDown','ArrowUp'].includes(e.key))return;
  const choices=[...recentRows.querySelectorAll('.recent-title')];
  if(!choices.length)return;
  e.preventDefault();
  const i=choices.indexOf(document.activeElement);
  choices[e.key==='ArrowDown'?(i+1)%choices.length:(i<=0?choices.length-1:i-1)].focus();
});
recents.addEventListener('focusout',e=>{
  if(e.relatedTarget && !recents.contains(e.relatedTarget) && e.relatedTarget!==subtitle)closeRecents();
});
for(const surface of [get('#outline'),pageMenu,recents,editor,background])surface.addEventListener('pointermove',trackGlassLight);
function configureArticleMenu(){
  pageMenu.replaceChildren();
  importButton.hidden=isQuick;
  importButton.textContent=imported?'添加参考资料':'新建探索';
  const label=isQuick?'随问操作':'探索操作';
  menuButton.title=label;menuButton.setAttribute('aria-label',label);
  if(isQuick)pageMenu.append(sourceButton('新建随问',()=>startQuick()));
  else pageMenu.append(importButton);
  if(imported || isQuick)pageMenu.append(sourceButton('重命名',editTitle));
  if(imported)pageMenu.append(sourceButton('查看原文',showBackground));
}
configureArticleMenu();
function showPageMenu(open){
  if(open)closeRecents();
  pageMenu.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));
}
get('.index-trigger').setAttribute('aria-label','TOC，问题目录');
for(const control of [sendButton,composeMore,cancelNew,quoteToggle]){
  control.addEventListener('click',()=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    // The plus and cancel buttons exchange places on click. Animate the visible icon.
    const surface=control===composeMore?cancelNew:control===cancelNew?composeMore:control;
    const glyph=surface.querySelector('svg');
    glyph.getAnimations().filter(anim=>anim.id==='glass-release').forEach(anim=>anim.cancel());
    const resting=getComputedStyle(glyph).transform;
    const pressed=(resting==='none'?'':resting+' ')+'translateY(1px) scale(.9)';
    glyph.animate([{transform:pressed,offset:0},
      {transform:pressed,offset:.24},
      {transform:resting==='none'?'scale(1)':resting}],{
        id:'glass-release',duration:290,easing:'cubic-bezier(.2,.7,.25,1)'
      });
  });
}
showPageMenu(false);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && !pageMenu.hidden){showPageMenu(false);menuButton.focus({preventScroll:true})}
});
pageMenu.onclick=()=>showPageMenu(false);
document.addEventListener('pointerdown',e=>{if(!pageMenu.contains(e.target)&&!menuButton.contains(e.target))showPageMenu(false)});

const companion=document.createElement('aside');
companion.className='source-card';companion.hidden=true;
companion.innerHTML='<div class="source-heading">来源回答</div><div class="source-paper"></div>';
document.body.append(companion);
let lastSource=null, splitOpen=false, alignment=null;
function alignAfterLayout(){
  if(!alignment)return;
  const {surface,id,offset}=alignment;
  const source=surface.querySelector('[data-refs~="'+id+'"]')||surface.querySelector('[data-link="'+id+'"]');
  if(source)surface.scrollTop+=source.getBoundingClientRect().top-surface.getBoundingClientRect().top-offset;
}
window.addEventListener('resize',alignAfterLayout);
function alignForTransition(surface,n){
  if(n.returnOffset==null)return;
  const target={surface,id:n.id,offset:n.returnOffset};
  alignment=target;alignAfterLayout();
  setTimeout(()=>{if(alignment===target)alignment=null},250);
}
function layoutCompanion(n){
  const parent=n.parent && find(n.parent);
  if(window.pairSeed || window.webkit?.messageHandlers?.sourceCard){
    companion.hidden=true;
    if(window.pairSeed && !parent)window.webkit.messageHandlers.windowAction.postMessage('unsplit');
    return;
  }
  if(splitOpen!==!!parent){
    splitOpen=!!parent;
    document.body.classList.toggle('reading-pair',splitOpen);
    window.webkit?.messageHandlers?.windowAction?.postMessage(splitOpen?'split':'unsplit');
  }
  companion.hidden=!parent;
  if(!parent){lastSource=null;return}
  const surface=companion.querySelector('.source-paper');
  const parentChanged=lastSource!==parent.id;
  const previous=!parentChanged?surface.scrollTop:parent.position;
  lastSource=parent.id;
  surface.replaceChildren(renderNode(parent,[]));
  surface.scrollTop=previous;
  if(parentChanged)alignForTransition(surface,n);

}
companion.querySelector('.source-paper').onscroll=e=>{
  if(lastSource && !companion.hidden)find(lastSource).position=e.target.scrollTop;
};

function separateCard(n,request=null,toggleBookmark=false){
  const host=window.webkit?.messageHandlers?.sourceCard;
  if(!host || window.pairSeed || !n.parent)return false;
  const root=path(n)[0];
  const fresh=!reader.querySelector('[data-link="'+path(n)[1].id+'"]');
  const child=path(n)[1];
  host.postMessage({seed:JSON.stringify(state),article,request,bookmarkID:child.id,toggleBookmark});
  state.active=root.id;state.pending=root.pendingDraft??null;
  if(fresh || !reader.querySelector('[data-node="'+root.id+'"]')){
    render(root.position);
    if(fresh && child.anchor && child.returnOffset!=null)alignForTransition(reader,child);
  }
  else syncInput();
  persist();
  return true;
}
window.usePairState=(packet)=>{
  const next=JSON.parse(packet.seed);
  if(!packet.request && current().id===next.active)return;
  if(native.busy && !packet.request){
    // Keep the nodes that the active stream is writing to when browsing another note.
    for(const incoming of next.nodes)if(!find(incoming.id))state.nodes.push(incoming);
    remember();activate(find(next.active));render();persist();
    return;
  }
  state=next;repairSavedMathQuotes();captureNodes();render();
  if(packet.request){
    const n=current(), b=n.blocks[packet.request.index];
    native.ask(n,b,packet.request.title,packet.request.quote);
  }
};
window.mergePairChanges=changes=>{
  if(changes.article!==article.id)return;
  const position=reader.scrollTop, active=current();
  // Metadata, scroll and edits inside a child never replace the parent's reading DOM.
  let repaint=false;
  for(const incoming of changes.updates){
    const old=find(incoming.id);
    if(incoming.id===active.id && JSON.stringify([incoming.title,incoming.blocks])!==JSON.stringify([active.title,active.blocks]))repaint=true;
    if(incoming.parent===active.id && (!old || old.title!==incoming.title || old.quote!==incoming.quote))repaint=true;
  }
  if(changes.removed.some(id=>id===active.id || find(id)?.parent===active.id))repaint=true;
  for(const incoming of changes.updates){
    const index=state.nodes.findIndex(n=>n.id===incoming.id);
    if(index<0)state.nodes.push(incoming);else state.nodes[index]=incoming;
  }
  state.nodes=state.nodes.filter(n=>!changes.removed.includes(n.id));
  if(!find(state.active)){state.active=changes.fallback && find(changes.fallback)?changes.fallback:'article';state.pending=null}
  captureNodes();
  if(repaint)render(position);
  if(!outline.hidden)renderIndex();
};
window.showBranchInDirectory=id=>{
  window.visibleBranch=id;
  const node=find(id);
  const source=node && path(node)[1];
  for(const button of reader.querySelectorAll('.mark'))button.setAttribute('aria-expanded',String(button.dataset.link===source?.id));
  if(!outline.hidden)renderIndex();
};

if(window.pairSeed){
  document.documentElement.classList.add('annotation-window');
  menuButton.hidden=true;
  pinned.addEventListener('pointermove',trackGlassLight);
  pinned.addEventListener('pointerdown',event=>{
    if(!event.target.closest('button'))window.webkit?.messageHandlers?.windowAction?.postMessage('drag');
  });
  const sourceLine=pinned.querySelector('.pin-source');
  sourceLine.addEventListener('wheel',event=>{
    const remaining=event.deltaY>0 ? sourceLine.scrollHeight-sourceLine.clientHeight-sourceLine.scrollTop : sourceLine.scrollTop;
    if(remaining<1)scrollAnswerOverMath(event);
  },{passive:false});
  const parentEdge=document.createElement('button');
  parentEdge.className='parent-edge';parentEdge.hidden=true;panel.before(parentEdge);
  parentEdge.onclick=()=>returnFrom(current());

  const title=document.createElement('h2');title.className='annotation-title';
  const fold=pinned.querySelector('.fold');
  pinned.prepend(title);
  fold.innerHTML='<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5"/></svg>';
  const remove=document.createElement('button');
  remove.className='delete-annotation';remove.textContent='删除旁注';
  remove.onclick=()=>confirmDelete(current());

  let finishLevelChange, openingNote;
  window.fadeParentNote=()=>{
    const next=current();
    const previous=reader.firstElementChild?.dataset.node;
    if(previous===next.id)return;
    openingNote?.cancel();
    finishLevelChange?.();
    const returning=!!next.parent && find(previous)?.parent===next.id;
    const entering=next.parent===previous && path(next).length===3;
    if(!(entering || returning) || matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    panel.classList.add('changing-note-level');

    // Keep the shell and composer on screen. Only snapshot the outgoing reading area.
    const outgoing=document.createElement('div');
    outgoing.className='outgoing-reading';
    outgoing.inert=true;
    outgoing.setAttribute('aria-hidden','true');
    for(const element of [pinned,reader]){
      const copy=element.cloneNode(true);
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
      Object.assign(copy.style,{
        position:'absolute',left:element.offsetLeft+'px',top:element.offsetTop+'px',
        width:element.offsetWidth+'px',height:element.offsetHeight+'px',margin:'0'
      });
      outgoing.append(copy);
      copy.scrollTop=element.scrollTop;
    }
    panel.append(outgoing);
    outgoing.lastElementChild.scrollTop=reader.scrollTop;
    // Keep the back card under the moving top edge until the main surface covers it.
    if(returning)parentEdge.classList.add('returning');

    const still='translateY(0)', lowered='translateY(24px)';
    const options={duration:returning?780:800,fill:'both'};
    const exit=outgoing.animate([
      {opacity:1,transform:still,easing:'ease-in-out'},
      {opacity:0,transform:returning?lowered:still,offset:.4},
      {opacity:0,transform:returning?lowered:still}
    ],options);
    const arrival=[
      {opacity:0,transform:entering?lowered:still},
      {opacity:0,transform:entering?lowered:still,offset:.4,easing:'ease-out'},
      {opacity:1,transform:still}
    ];
    const animations=[pinned,reader].map(el=>el.animate(arrival,options));
    function finish(){
      animations[0].onfinish=null;
      outgoing.remove();exit.cancel();
      for(const animation of animations)animation.cancel();
      parentEdge.classList.remove('returning');
      panel.classList.remove('changing-note-level');
      finishLevelChange=null;
    }
    finishLevelChange=finish;
    animations[0].onfinish=finish;
  };
  function updateAnnotation(){
    const n=current();
    if(!n.parent)return;
    const parent=find(n.parent);
    const stacked=!!parent.parent;
    document.documentElement.classList.toggle('stacked',stacked);
    panel.classList.toggle('third-level',stacked);
    title.textContent=n.title;
    pinned.querySelector('.pin-source').hidden=!n.quote;
    reader.firstElementChild?.append(remove);
    fold.title=stacked?'回到上条旁注':'收起旁注，回到原句';
    fold.setAttribute('aria-label',fold.title);
    parentEdge.hidden=!stacked;
    if(stacked){
      parentEdge.textContent='Ⅱ　'+bookmarkTitle(parent);
      parentEdge.title='返回：'+parent.title;
    }
  }
  window.addEventListener('load',()=>{
    if(path(current()).length===2 && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      openingNote=panel.animate([
        {maxHeight:'88vh'}, {maxHeight:'88vh',offset:.32,easing:'cubic-bezier(.28,.1,.2,1)'}, {maxHeight:'100vh'}
      ],{duration:610});
    }
    const refresh=()=>{
      if(!current().parent)return;
      updateAnnotation();alignAfterLayout();
      window.webkit?.messageHandlers?.annotationLayout?.postMessage(current().id);
    };
    new MutationObserver(refresh).observe(reader,{childList:true});
    refresh();
    if(window.pairRequest){
      const n=current(),r=window.pairRequest;
      native.ask(n,n.blocks[r.index],r.title,r.quote);
    }
  });
}

// Read question metadata from the same WebKit origin that persists each exploration.
window.libraryArticles=entries=>entries.map(entry=>{
  let nodes=[],lastQuestion=null;
  try{
    const data=entry.id===article.id?state:JSON.parse(localStorage.getItem('sideask-exploration-'+entry.id));
    if(entry.kind==='quick'){
      const root=data?.nodes?.find(n=>n.id!=='article');
      const questions=(root?.blocks||[]).filter(b=>b.cls==='turn-title').map(b=>b.text);
      return {...entry,nodes:[],searchText:[root?.title,...questions].join(' '),summary:questions.at(-1)||''};
    }
    nodes=(data?.nodes||[]).filter(n=>n.id!=='article').map(n=>({id:n.id,parent:n.parent,title:bookmarkTitle(n)}));
    lastQuestion=nodes.find(n=>n.id===(entry.resume || data?.active));
  }catch{}
  const summary=entry.summary || (lastQuestion?'上次追问 · '+lastQuestion.title:'');
  return {...entry,summary,nodes};

});

function visitLibraryNode(id){
  const target=find(id);
  if(!target)return;
  if(!target.parent && window.visibleBranch && target.id===state.active){
    window.webkit.messageHandlers.windowAction.postMessage('unsplit');
  }else enter(target);
}
