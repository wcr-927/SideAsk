// Reading prototype. Only the initial article uses trusted HTML; reader input is text.
const reader = get('.paper'), outline = get('#outline');
const input = get('.composer textarea'), quoteInput = get('.ref input');
const selectionButton = get('#ask-selection');
const storageStatus=element('small','storage-status','本篇暂时仅保存在当前页面');
storageStatus.hidden=true;get('.composer').prepend(storageStatus);
const native = window.sideAskNative;
let storageKey, indexKey, indexChoices;
const numerals = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'];
const levels = ['', '第一层追问', '第二层追问', '第三层追问'];

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
function node(id, parent, title, quote, blocks, anchor = null) {
  return {id, parent, title, quote, blocks, anchor, draft:{text:'',quote:''}, position:0, returnOffset:null};
}
function readBlocks(elements) {
  return [...elements].map(el => ({tag:el.localName, html:el.innerHTML, cls:el.className}));
}
function seed() {
  const rootParagraphs = [...reader.querySelectorAll(':scope > p')].map(p => {
    const copy = p.cloneNode(true);
    copy.querySelectorAll('button').forEach(el => el.remove());
    return {text:copy.textContent};
  });
  const title = get('.question h1').textContent, quote = get('.question blockquote').textContent;
  const root = node('root',null,title,quote,[...rootParagraphs,...readBlocks(reader.querySelectorAll('.next > p'))]);
  const source = get('#origin').textContent;
  const start = root.blocks[1].text.indexOf(source);
  const childBlocks = readBlocks(reader.querySelectorAll('#child > p,#child > .radial-equations,#child .step > *'));
  const child = node('direction','root',get('#branch-title').textContent,source,childBlocks,
    {first:1,last:1,start,end:start+source.length});
  const secondRoot = node('charge',null,'球内电荷量怎么求？','包围的电荷量等于总电荷乘以体积之比。',[
    {text:'体积电荷密度均匀时，半径为 r 的球内电荷占总电荷的比例，等于它的体积占整个球体积的比例。'},
    {text:'Q 内 = Q · (r/R)³',cls:'formula'}
  ]);
  root.order=0; secondRoot.order=1;
  return {nodes:[root,child,secondRoot],active:'root',pending:null};
}
let state;
function loadConversation(){
  storageKey=native ? 'sideask-exploration-'+native.id : 'sideask-reading-example-v1';
  indexKey=storageKey+'-directory';
  indexChoices={};
  state=null;
  try {state=JSON.parse(localStorage.getItem(storageKey))} catch {}
  if(window.pairSeed)state=JSON.parse(window.pairSeed);
  if(!state?.nodes?.some(n=>n.id===state.active)){
    if(native){
      const root=node('article',null,'本篇原文','',native.source.split(/\n\s*\n/).map(text=>({text})));
      state={nodes:[root],active:root.id,pending:{parent:null,anchor:null,text:'',quote:''}};
    }else state=seed();
  }
  if(native){
    try {indexChoices=JSON.parse(localStorage.getItem(indexKey)) || {}} catch {}
  }
}
loadConversation();
let knownNodes=new Map();
function captureNodes(){knownNodes=new Map(state.nodes.map(n=>[n.id,JSON.stringify(n)]))}
captureNodes();
const find = id=>state.nodes.find(n=>n.id===id);
const current = ()=>find(state.active);
function path(n) {return n.parent ? [...path(find(n.parent)),n] : [n]}
function children(n) {return state.nodes.filter(x=>x.parent===n.id)}
let selectionAnchor=null, selectedRange=null, rendering=false;
const expandedIndex=new Set();
function persist() {
  const bridge=window.webkit?.messageHandlers?.pairChanges;
  if(bridge){
    const updates=state.nodes.filter(n=>knownNodes.get(n.id)!==JSON.stringify(n));
    const removed=[...knownNodes.keys()].filter(id=>!find(id));
    if(updates.length||removed.length){
      captureNodes();bridge.postMessage({article:native.id,updates,removed,fallback:state.active});
    }
  }
  try {localStorage.setItem(storageKey, JSON.stringify(state));storageStatus.hidden=true}
  catch {storageStatus.hidden=false}
}
function positionNow() {return paper.scrollTop - (native && current().parent ? 0 : pinned.offsetHeight)}
function remember() {current().position=positionNow()}
function drafting() {return state.pending || current().draft}
function syncInput() {
  const d=drafting();
  input.value=d.text; quoteInput.value=d.quote;if(native)syncQuotePreview();
  input.placeholder=state.pending ? (state.pending.parent ? '写下这条旁注的问题…' : '写下本篇的新问题…') :
    (native ? (window.pairSeed?'继续问这条旁注…':'继续追问…') : '就“'+current().title+'”继续追问…');
  get('#new-note').hidden=!!native || !!state.pending || path(current()).length===3;
  get('#cancel-new').hidden=native?.kind==='quick' || !state.pending;
  const more=get('#compose-more');
  if(more)more.hidden=native?.kind==='quick' || !!window.pairSeed || !!state.pending || current().id==='article';
  const target=get('.compose-target');target.hidden=!state.pending;
  if(state.pending)target.textContent=state.pending.parent ? numerals[path(find(state.pending.parent)).length+1]+' 新旁注' : '本篇新问题';
  get('.clear-ref').hidden=!d.quote;
  get('#send').disabled=!!native?.busy || !d.text.trim();
}
function depthMark(level) {
  const el=element('span','depth',numerals[level]);
  el.title=levels[level]; el.setAttribute('role','img'); el.setAttribute('aria-label',levels[level]); return el;
}
function decorate(block, links, index) {
  const ranges=[];
  for(const n of links) {
    const a=n.anchor;
    if(!a || index<a.first || index>a.last) continue;
    ranges.push([index===a.first?a.start:0,index===a.last?a.end:block.textContent.length,n.id]);
  }
  const walk=document.createTreeWalker(block,NodeFilter.SHOW_TEXT), texts=[];
  while(walk.nextNode()) texts.push(walk.currentNode);
  let at=0;
  for(const t of texts) {
    const start=at; at+=t.length;
    const math=native && t.parentElement.closest('.katex');
    if(math){
      const hits=ranges.filter(([l,r])=>l<at && r>start);
      if(hits.length){
        const ids=new Set(math.dataset.refs?.split(' ') || []);
        hits.forEach(([, ,id])=>ids.add(id));
        math.dataset.refs=[...ids].join(' ');
      }
      continue;
    }
    const cuts=[...new Set([start,at,...ranges.flatMap(([l,r])=>[l,r]).filter(x=>x>start&&x<at)])].sort((a,b)=>a-b);
    if (!ranges.some(([l,r])=>l<at&&r>start)) continue;
    const fragment=document.createDocumentFragment();
    for(let i=0;i<cuts.length-1;i++){
      const part=t.data.slice(cuts[i]-start,cuts[i+1]-start);
      const hits=ranges.filter(([l,r])=>l<=cuts[i]&&r>cuts[i]);
      if(!hits.length){fragment.append(part);continue}
      const span=element('span','selected',part); span.dataset.refs=hits.map(x=>x[2]).join(' ');fragment.append(span);
    }
    t.replaceWith(fragment);
  }
}
// Use the cited passage to disambiguate referential questions in bookmarks.
function bookmarkTitle(n) {
  const question=n.title.trim();
  const generic=/^(?:这个|这里|这一步|这句话|这段|这|那)?(?:是)?(?:为什么|怎么理解|什么意思|如何理解|怎么来的|是怎么推导的)[呢吗啊？?。！!]*$/.test(question);
  const excerpt=(n.quote || '').trim().replace(/\s+/g,' ').replace(/[，。；：、]+$/,'');
  if(!generic || !excerpt)return question;
  const subject=excerpt.length>20?excerpt.slice(0,20)+'…':excerpt;
  return /为什么/.test(question)?'为何「'+subject+'」？':'如何理解「'+subject+'」？';
}
// A moving panel or a re-rendered passage may put mouseup on a different node.
// Commit press-sensitive controls once, keeping click activation for keyboard and assistive input.
function bindNoteAction(button, action) {
  let handledPress=false;
  button.addEventListener('pointerdown',event=>{
    handledPress=event.isPrimary && event.pointerType==='mouse' && event.button===0;
    if(!handledPress)return;
    event.preventDefault();
    action();
  });
  button.onclick=event=>{
    if(handledPress && event.isTrusted && event.detail>0){handledPress=false;return}
    action();
  };
}
function renderNode(n, route) {
  const level=path(n).length;
  const section=element('section',level>1?'second':'topic');
  section.dataset.node=n.id;
  const heading=element('div',level>1?'branch-heading':'question');
  if(native && level===1 && n.id!=='article'){
    heading.classList.add('user-bubble');heading.setAttribute('role','group');heading.setAttribute('aria-label','我的提问');
  }
  if(level>1)heading.append(depthMark(level));
  heading.append(element(level===1?'h1':'h2','',n.title));
  if(native && native.kind!=='quick' && n.id!=='article'){
    const remove=element('button','remove-question','删除');
    remove.title='删除这个问题及下级追问';remove.disabled=!!native.busy;
    remove.onclick=()=>confirmDelete(n);heading.append(remove);
  }
  if(level===1 && n.quote){
    const quote=element('blockquote','',n.quote);
    if(native)typesetQuote(quote,n.quote);
    heading.append(quote);
  }
  section.append(heading);
  const kids=children(n);
  const visible=level===1 && native && find(window.visibleBranch);
  const visibleBookmark=visible ? path(visible)[1]?.id : null;
  let followupBubble=null;
  n.blocks.forEach((b,i)=>{
    const block=element(b.cls==='live-answer'?'div':b.tag||'p',b.cls,b.text);
    if(b.html!=null)block.innerHTML=b.html;
    if(native && b.cls==='live-answer')renderAnswer(block,b);
    if(native && b.cls==='turn-quote')typesetQuote(block,b.text);
    block.dataset.block=i;
    decorate(block,kids,i);
    const linked=kids.filter(c=>(c.anchor?.last??n.blocks.length-1)===i);
    if(native && b.cls==='turn-title'){
      followupBubble=element('div','user-bubble');
      followupBubble.setAttribute('role','group');followupBubble.setAttribute('aria-label','我的提问');
      section.append(followupBubble);
    }else if(b.cls!=='turn-quote')followupBubble=null;
    (followupBubble||section).append(block);
    for(const c of linked){
      const button=element('button','mark',native ? numerals[level+1] : c.title);
      if(native){
        const glyph=element('span','mark-glyph','I'.repeat(level+1));
        button.replaceChildren(glyph);
      }
      button.title=c.quote ? c.title+' · '+c.quote : c.title;
      button.setAttribute('aria-label',native ? bookmarkTitle(c) : c.title);
      button.dataset.link=c.id;button.setAttribute('aria-expanded',String(route.includes(c.id)||c.id===visibleBookmark||native && state.active===c.id));
      const openNote=()=>{
        if(native && !matchMedia('(prefers-reduced-motion: reduce)').matches){
          button.animate([{boxShadow:'inset 0 2px 4px #25476150'}, {boxShadow:getComputedStyle(button).boxShadow}],
            {duration:240,easing:'ease-out'});
          button.firstElementChild.animate([{transform:'scale(.88)'},{transform:'scale(1)'}],
            {duration:240,easing:'ease-out'});
        }
        if(route.includes(c.id)||native && state.active===c.id)returnFrom(c);else enter(c,!!native && level===1);
      };
      if(native)bindNoteAction(button,openNote);
      else button.onclick=openNote;
      // Keep the opening mark with the last word even on a narrow page.
      const marks=block.querySelectorAll('[data-refs~="'+c.id+'"]');
      const endMark=marks[marks.length-1];
      const formula=endMark?.closest('.katex-display');
      if(native && formula){
        let group=formula.querySelector(':scope > .equation-with-notes');
        if(!group){
          group=element('span','equation-with-notes');
          group.append(formula.firstElementChild);formula.append(group);
        }
        group.append(button);
        checkFormulaWidths(block);
        continue;
      }
      const target=endMark?.closest('p,li,pre,td,h1,h2,h3,h4')||block;
      const last=target.lastChild, tail=element('span','annotated-end');
      if(last?.nodeType===Node.TEXT_NODE && last.length>=2) tail.append(last.splitText(last.length-2));
      if(native){
        const slot=element('span','mark-slot');
        slot.append(button);tail.append(slot);
      }else tail.append(button);
      target.append(tail);
      if(route.includes(c.id))target.after(renderNode(c,route));
    }

  });
  if(level>1 && n.id===state.active){
    const close=element('button','fold','↶ 回到原句'); close.onclick=()=>returnFrom(n); section.append(close);
  }
  return section;
}
function sourceFor(n){
  return reader.querySelector('[data-refs~="'+n.id+'"]')||reader.querySelector('[data-link="'+n.id+'"]');
}
function render(position=current().position) {
  if(native && separateCard(current()))return;
  window.fadeParentNote?.();
  rendering=true; pinned.hidden=true;
  const route=path(current());
  if(native && route[0].id==='article')reader.replaceChildren();
  else if(native && current().parent)reader.replaceChildren(renderNode(current(),[]));
  else reader.replaceChildren(renderNode(route[0],route.map(n=>n.id)));
  if(native)layoutCompanion(current());
  paper.scrollTop=Math.max(0,position);
  refreshSource();syncInput();rendering=false;
  get('.index-trigger').textContent='本篇疑问 · '+state.nodes.filter(n=>!n.parent && (!native||n.id!=='article')).length;
  if(native)refineNativePage();
  selectionAnchor=null;selectionButton.hidden=true;
}
function refreshSource(){
  if(native && current().parent){
    const n=current();pinned.hidden=false;
    pinned.querySelector('.depth').replaceWith(depthMark(path(n).length));
    typesetQuote(pinned.querySelector('.pin-source'),n.quote || '');
    return;
  }
  const n=current(), source=n.parent && sourceFor(n);
  const section=reader.querySelector('[data-node="'+n.id+'"]');
  const top=reader.getBoundingClientRect().top;
  const show=!!source && source.getBoundingClientRect().bottom<top && section.getBoundingClientRect().bottom>top+44;
  if(show){
    pinned.querySelector('.depth').replaceWith(depthMark(path(n).length));
    pinned.querySelector('.pin-source').textContent=n.quote?'「'+n.quote+'」':n.title;
  }
  if(pinned.hidden===!show)return;
  pinned.hidden=!show;
  paper.scrollTop+=reader.getBoundingClientRect().top-top;
}
function activate(n) {
  current().pendingDraft=state.pending;
  state.active=n.id;
  state.pending=n.pendingDraft??null;
}
function closeIndex(){
  outline.hidden=true;
  get('.index-trigger').setAttribute('aria-expanded','false');
  if(native)get('.index-trigger').textContent='TOC';
}
document.addEventListener('keydown',e=>{if(e.key==='Escape' && !outline.hidden){closeIndex();get('.index-trigger').focus()}});
function enter(n,toggleBookmark=false) {
  if(native && !n.parent && n.id!==state.active && window.visibleBranch)window.webkit?.messageHandlers?.windowAction?.postMessage('unsplit');
  remember();
  const source=sourceFor(n);
  if(source && n.parent===state.active)n.returnOffset=source.getBoundingClientRect().top-reader.getBoundingClientRect().top;
  activate(n);closeIndex();
  if(!toggleBookmark || !separateCard(n,null,true))render(n.position);
  persist();
}
function returnFrom(n) {
  if(window.pairSeed && n.parent && !find(n.parent).parent){
    try {remember();persist()}
    finally {window.webkit.messageHandlers.windowAction.postMessage('unsplit')}
    return;
  }
  remember();
  const sourceY=n.returnOffset??65;
  activate(find(n.parent));render();
  const source=sourceFor(n);
  if(native && source)alignForTransition(reader,n);
  if(source && !native){
    paper.scrollTop+=source.getBoundingClientRect().top-reader.getBoundingClientRect().top-sourceY;
    refreshSource();
    reader.querySelector('[data-link="'+n.id+'"]')?.focus({preventScroll:true});
  }
  remember();persist();
}
const returnButton=pinned.querySelector('.fold');
if(window.pairSeed)bindNoteAction(returnButton,()=>returnFrom(current()));
else returnButton.onclick=()=>returnFrom(current());
paper.addEventListener('scroll',()=>{if(!rendering){refreshSource();remember();persist()}});
function renderIndex(){
  outline.replaceChildren();
  if(!native)outline.append(element('div','index-caption','本篇问题'));
  const activePath=path(find(window.visibleBranch) || current());
  function entry(n,depth){
    const row=element('div','entry');row.dataset.depth=depth;if(native)row.style.setProperty('--depth',depth);else row.style.paddingLeft=(depth*14)+'px';
    const kids=children(n);
    const open=native ? (indexChoices[n.id] ?? activePath.slice(0,-1).includes(n)) : expandedIndex.has(n.id);
    if(kids.length){
      const toggle=element('button','index-fold',native?'':(open?'⌄':'›'));
      toggle.dataset.node=n.id;
      toggle.setAttribute('aria-label',(open?'收起':'展开')+'「'+n.title+'」的下级问题');
      toggle.setAttribute('aria-expanded',String(open));
      toggle.onclick=()=>{
        if(native){
          indexChoices[n.id]=!open;
          try {localStorage.setItem(indexKey,JSON.stringify(indexChoices))} catch {}
        }else if(open)expandedIndex.delete(n.id);
        else expandedIndex.add(n.id);
        const scroll=outline.scrollTop;
        renderIndex();outline.scrollTop=scroll;
        outline.querySelector('.index-fold[data-node="'+CSS.escape(n.id)+'"]')?.focus({preventScroll:true});
      };
      row.append(toggle);
    }
    const title=element('button','index-title',n.title);
    if(native)typesetQuote(title,n.title);
    title.setAttribute('aria-current',String(n.id===(native && window.visibleBranch || state.active)));
    title.dataset.ancestor=String(path(current()).includes(n));
    title.onclick=()=>enter(n);row.append(title);outline.append(row);
    if(open)kids.forEach(k=>entry(k,depth+1));
  }
  const roots=state.nodes.filter(n=>!n.parent && (!native||n.id!=='article'));
  roots.filter(n=>n.order!=null).sort((a,b)=>a.order-b.order).forEach(n=>entry(n,0));
  const loose=roots.filter(n=>n.order==null);
  if(loose.length && roots.some(n=>n.order!=null))outline.append(element('small','','其他问题'));
  loose.forEach(n=>entry(n,0));

}
function toggleDirectory(){
  if(native){showPageMenu(false);closeRecents()}
  outline.hidden=!outline.hidden;
  get('.index-trigger').setAttribute('aria-expanded',String(!outline.hidden));
  if(native && !outline.hidden)positionDirectory();
  if(!outline.hidden){
    if(!native)path(current()).slice(0,-1).forEach(n=>expandedIndex.add(n.id));
    renderIndex();
  }
}
if(native){
  for(const [button,kind] of [[explorationTab,'exploration'],[quickTab,'quick']]){
    bindNoteAction(button,()=>{
      if(kind!==recentKind)selectRecentKind(kind);
    });
  }
  bindNoteAction(quoteToggle,toggleQuote);
  bindNoteAction(subtitle,()=>recents.hidden?openRecents():closeRecents(true));
  bindNoteAction(get('.library-trigger'),()=>window.webkit.messageHandlers.windowAction.postMessage('showLibrary'));
  bindNoteAction(get('.index-trigger'),toggleDirectory);
  bindNoteAction(menuButton,()=>{closeIndex();showPageMenu(pageMenu.hidden)});
}
else get('.index-trigger').onclick=toggleDirectory;
document.addEventListener('pointerdown',event=>{
  if(!event.target.closest('#outline,.index-trigger'))closeIndex();
});
function inspectSelection(){
  const sel=window.getSelection();
  selectionButton.hidden=true; selectionAnchor=null;
  if(!sel.rangeCount || sel.isCollapsed)return;
  const range=sel.getRangeAt(0).cloneRange();
  if(native){
    // Selecting part of a rendered formula quotes the whole mathematical expression.
    const mathAt=node=>(node.nodeType===1?node:node.parentElement)?.closest('.katex');
    const start=mathAt(range.startContainer),end=mathAt(range.endContainer);
    if(start)range.setStartBefore(start);
    if(end)range.setEndAfter(end);
  }
  const paragraph=node=>(node.nodeType===1?node:node.parentElement)?.closest('[data-block]');
  const first=paragraph(range.startContainer), last=paragraph(range.endContainer);
  if(!first || !last || !reader.contains(first) || first.closest('[data-node]')!==last.closest('[data-node]'))return;
  const ownerSection=first.closest('[data-node]');
  const owner=find(ownerSection?.dataset.node);
  if(!owner || path(owner).length>=3 || range.commonAncestorContainer.nodeType===1 && !ownerSection.contains(range.commonAncestorContainer))return;
  const offset=(block,end,at)=>{
    const r=document.createRange();r.selectNodeContents(block);r.setEnd(end,at);
    const fragment=r.cloneContents(); fragment.querySelectorAll('button,section[data-node]').forEach(b=>b.remove()); return fragment.textContent.length;
  };
  const fragment=range.cloneContents();fragment.querySelectorAll('button,section').forEach(b=>b.remove());
  if(native)for(const math of fragment.querySelectorAll('.katex')){
    const tex=math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if(tex)math.replaceWith('$'+tex+'$');
  }
  const quote=fragment.textContent.trim();if(!quote)return;
  selectionAnchor={parent:owner.id,quote,anchor:{first:Number(first.dataset.block),last:Number(last.dataset.block),
    start:offset(first,range.startContainer,range.startOffset),end:offset(last,range.endContainer,range.endOffset)}};
  selectedRange=range;
  positionSelectionButton();
}
function positionSelectionButton(){
  selectionButton.hidden=true;
  if(!selectionAnchor || !selectedRange || !reader.contains(selectedRange.commonAncestorContainer))return;
  const selection=window.getSelection();
  if(!selection.rangeCount || selection.isCollapsed || !reader.contains(selection.focusNode))return;
  const view=reader.getBoundingClientRect(), frame=panel.getBoundingClientRect();
  const rects=Array.from(selectedRange.getClientRects()).filter(r=>
    r.width>0 && r.bottom>view.top && r.top<view.bottom && r.right>view.left && r.left<view.right);
  if(!rects.length)return;
  const backwards=selection.focusNode===selection.getRangeAt(0).startContainer &&
    selection.focusOffset===selection.getRangeAt(0).startOffset;
  const anchor=backwards?rects[0]:rects[rects.length-1];
  selectionButton.hidden=false;
  const width=selectionButton.offsetWidth,height=selectionButton.offsetHeight;
  const x=backwards?anchor.left:anchor.right-width;
  const above=anchor.top-height-4;
  const below=anchor.bottom+4;
  const y=(!backwards && below+height<=view.bottom) || above<view.top ? below : above;
  selectionButton.style.left=(constrain(x,view.left+4,view.right-width-4)-frame.left)+'px';
  selectionButton.style.top=(constrain(y,view.top,view.bottom-height)-frame.top)+'px';
}
reader.addEventListener('scroll',positionSelectionButton,{passive:true,capture:true});
window.addEventListener('resize',positionSelectionButton);
document.addEventListener('selectionchange',()=>{
  if(window.getSelection().isCollapsed){selectionAnchor=null;selectedRange=null;selectionButton.hidden=true}
});
reader.addEventListener('pointerup',inspectSelection);
reader.addEventListener('keyup',inspectSelection);
selectionButton.onpointerdown=e=>e.preventDefault();
selectionButton.onclick=()=>{if(selectionAnchor)begin(native && selectionAnchor.parent==='article'?null:find(selectionAnchor.parent),selectionAnchor.anchor,selectionAnchor.quote)};
function begin(parent,anchor,quote){
  if(native?.kind==='quick'){
    quoteInput.value=quote;bubbleOpen=!!quote;writeDraft();input.focus();
    window.getSelection().removeAllRanges();selectionButton.hidden=true;return;
  }
  if(parent && path(parent).length===3)return;
  if(parent && parent.id!==state.active)enter(parent);
  const firstBlock=anchor && reader.querySelector('[data-node="'+parent.id+'"] [data-block="'+anchor.first+'"]');
  const range=window.getSelection();
  const originTop=firstBlock && range.rangeCount ? range.getRangeAt(0).getBoundingClientRect().top : null;
  state.pending={parent:parent?.id??null,anchor,quote,text:'',
    returnOffset:originTop==null?null:originTop-reader.getBoundingClientRect().top};
  closeIndex();window.getSelection().removeAllRanges();selectionButton.hidden=true;
  syncInput();input.focus();persist();
}
get('#new-note').onclick=()=>begin(native && current().id==='article'?null:current(),null,'');
get('#cancel-new').onclick=()=>{
  const previous=input.value?'':input.placeholder;
  state.pending=null;
  syncInput();
  if(native)fadePrompt(previous);
  input.focus();persist();
};
function writeDraft(){const d=drafting();d.text=input.value;d.quote=quoteInput.value;get('#send').disabled=!!native?.busy || !d.text.trim();
  get('.clear-ref').hidden=!d.quote;if(native)syncQuotePreview();persist()}
input.oninput=writeDraft;quoteInput.oninput=writeDraft;
get('.clear-ref').onclick=()=>{
  quoteInput.value='';
  if(native)bubbleOpen=false;
  writeDraft();input.focus();
};
function exampleAnswer(q){
  if(/球心/.test(q))return '在球心，径向单位矢量没有唯一定义，因为从球心指向自身的位移为零。对于均匀带电的实心球，球心的电场为零，可由球对称性或球内电场随 r 趋于零得到。';
  if(/为什么旋转不变|旋转.*不变|旋转.*对称/.test(q))return '绕球心旋转一个均匀带电球，电荷分布在旋转前后完全重合。因此，能够通过旋转互相到达的两点，场强大小相同。';
  if(/相反|负电/.test(q))return '对于负电荷，电场与高斯面的外法线方向相反，两者夹角为 π。电场与向外面元的点积带负号，表示电通量指向球面内部。';
  if(/方向也相同|点积.*怎么算|夹角.*为零/.test(q))return '取球面上一点，面元沿该点的外法线。对于均匀带正电的球，电场也沿这个方向，所以两者夹角为零，点积等于两个大小的乘积。';
  if(/球内电荷量.*求|包围.*电荷.*求/.test(q))return '取半径为 r 的同心球，包围的电荷量等于体积电荷密度乘以这个球的体积。改变半径，包围的电荷也会随之改变。';
  return '这条追问已保存在当前讨论。阅读小样使用预置讲解，暂未生成针对这个问题的回答。';
}
function send(){
  const d=drafting(), title=d.text.trim();if(!title)return;
  if(native?.id==='welcome' && current().id==='article'){startQuick(title,d.quote);return}
  if(native && current().id==='article' && !state.pending){state.pending={parent:null,anchor:null,text:title,quote:d.quote}}
  if(native && native.busy)return;
  const reply=native ? newReply() : {text:exampleAnswer(title),cls:'example-reply'};
  if(state.pending){
    const n=node('q'+crypto.randomUUID(),state.pending.parent,title,d.quote,[reply],state.pending.anchor);
    if(native && !n.parent && d.quote && native.source.indexOf(d.quote)>=0)n.order=native.source.indexOf(d.quote);
    remember();state.nodes.push(n);state.pending=null;current().pendingDraft=null;state.active=n.id;
    if(n.parent && !n.anchor)n.anchor={first:find(n.parent).blocks.length-1,last:find(n.parent).blocks.length-1,start:0,end:0};
    n.returnOffset=d.returnOffset??65;
    if(native && separateCard(n,{index:0,title,quote:d.quote}))return;
    render(0);
    const source=sourceFor(n);
    if(source)n.returnOffset=d.returnOffset??65;
    const section=reader.querySelector('[data-node="'+n.id+'"]');
    paper.scrollTop+=section.getBoundingClientRect().top-reader.getBoundingClientRect().top-48;
  }else{
    const n=current();n.blocks.push({text:title,cls:'turn-title'});
    if(d.quote)n.blocks.push({text:d.quote,cls:'turn-quote'});
    n.blocks.push(reply);n.draft={text:'',quote:''};render(positionNow());
    const section=reader.querySelector('[data-node="'+n.id+'"]');
    const last=section.querySelector('[data-block="'+(n.blocks.length-1)+'"]');
    paper.scrollTop+=last.getBoundingClientRect().top-reader.getBoundingClientRect().top-80;
  }
  refreshSource();remember();persist();input.focus();
  if(native)native.ask(current(),reply,title,d.quote);
}
get('#send').onclick=send;
input.onkeydown=e=>{if(e.key==='Enter' && !e.shiftKey && !e.isComposing && e.keyCode!==229){e.preventDefault();send()}};
if(native)repairSavedMathQuotes();
render();
window.addEventListener('pagehide',()=>{remember();persist()});
