function sourceButton(text,handler){
  const button=document.createElement('button');
  button.type='button';button.textContent=text;button.onclick=handler;return button;
}
function createImportForm({attachments:defaultAttachments,materialRequest,created}){
  const editor=document.createElement('dialog');
  editor.className='import-editor';
  editor.setAttribute('aria-labelledby','import-title');
  editor.innerHTML=`<h2 id="import-title">导入资料</h2>
  <textarea id="article-text" aria-label="长回答" placeholder="粘贴长回答以新建探索"></textarea>
  <div class="file-drop" role="group" aria-label="参考文件">
    <span class="drop-hint">拖入 PDF、Word 或 PPT</span>
    <ul class="material-list" aria-label="附件"></ul>
    <button type="button" class="pick-files" title="选择文件" aria-label="选择文件">＋</button>
    <input type="file" accept=".pdf,.docx,.pptx" multiple hidden>
  </div><p class="import-status" role="status"></p>
  <footer><button type="button" value="cancel">取消</button><button type="button" class="confirm-import">创建</button></footer>`;
  document.body.append(editor);
  const articleText=editor.querySelector('textarea'),confirmImport=editor.querySelector('.confirm-import');
  const dropZone=editor.querySelector('.file-drop'),picker=dropZone.querySelector('input');
  const fileRows=dropZone.querySelector('ul'),importStatus=editor.querySelector('[role=status]');
  let attachments=defaultAttachments;
  let queuedFiles=[],existingFiles=[],removedFiles=new Set(),importBusy=false,importVersion=0;

  function renderImport(){
    const newArticle=!attachments && !!articleText.value.trim();
    const canAttach=attachments;
    confirmImport.disabled=importBusy || (!newArticle && !(canAttach && (queuedFiles.length || removedFiles.size)));
    fileRows.replaceChildren();
    function addTag(name,remove,open){
      const tag=document.createElement('li');
      const label=open?sourceButton(name,open):document.createElement('span');
      label.className='file-name';label.textContent=name;label.title=name;
      if(open)label.setAttribute('aria-label','打开 '+name);
      const cross=sourceButton('×',()=>{
        const index=Array.from(fileRows.children).indexOf(tag);
        remove();renderImport();
        const next=fileRows.children[Math.min(index,fileRows.children.length-1)];
        (next?.querySelector('.remove-file') || dropZone.querySelector('.pick-files')).focus({preventScroll:true});
      });
      cross.className='remove-file';cross.setAttribute('aria-label','移除 '+name);cross.title='移除 '+name;
      tag.append(label,cross);fileRows.append(tag);
    }
    if(canAttach)for(const doc of existingFiles){
      if(removedFiles.has(doc.id))continue;
      addTag(doc.name,()=>removedFiles.add(doc.id),async()=>{
        try {await materialRequest('original',{document:doc.id})} catch(e){importStatus.textContent=e.message}
      });
    }
    for(const file of queuedFiles)addTag(file.name,()=>{queuedFiles=queuedFiles.filter(f=>f!==file)});
  }
  async function openImport(onlyAttachments=defaultAttachments){
    if(editor.open)return;
    attachments=onlyAttachments;
    editor.querySelector('h2').textContent=attachments?'添加参考资料':'新建探索';
    articleText.hidden=attachments;
    confirmImport.textContent=attachments?'保存':'创建';
    const version=++importVersion;
    queuedFiles=[];existingFiles=[];removedFiles.clear();articleText.value='';
    importStatus.textContent='';
    renderImport();editor.showModal();(attachments?dropZone.querySelector('.pick-files'):articleText).focus();
    if(attachments)try{
      const result=await materialRequest('list');
      if(editor.open && version===importVersion){existingFiles=result.documents;renderImport()}
    }catch(e){if(editor.open && version===importVersion)importStatus.textContent=e.message}
  }
  function queueFiles(files){
    if(importBusy)return;
    const errors=[];
    for(const file of files){
      if(!/\.(pdf|docx|pptx)$/i.test(file.name)){errors.push(file.name+'：请选择 PDF、DOCX 或 PPTX。');continue}
      if(!file.size || file.size>100*1024*1024){errors.push(file.name+'：文件为空或超过 100 MB。');continue}
      if(!queuedFiles.some(f=>f.name===file.name && f.size===file.size && f.lastModified===file.lastModified))queuedFiles.push(file);
    }
    importStatus.textContent=errors.join('\n');
    renderImport();
  }
  articleText.oninput=()=>{importStatus.textContent='';renderImport()};
  editor.querySelector('[value=cancel]').onclick=()=>editor.close();
  editor.addEventListener('cancel',e=>{if(importBusy)e.preventDefault()});
  dropZone.querySelector('.pick-files').onclick=()=>picker.click();
  picker.onchange=()=>{queueFiles(picker.files);picker.value=''};
  for(const type of ['dragenter','dragover','drop']){
    editor.addEventListener(type,e=>{
      if(!Array.from(e.dataTransfer.types).includes('Files'))return;
      e.preventDefault();
      const inside=dropZone.contains(e.target) && !importBusy;
      e.dataTransfer.dropEffect=inside?'copy':'none';
      dropZone.classList.toggle('drag-over',inside && type!=='drop');
      if(inside && type==='drop')queueFiles(e.dataTransfer.files);
    });
  }
  dropZone.ondragleave=e=>{if(!dropZone.contains(e.relatedTarget))dropZone.classList.remove('drag-over')};
  function chunkData(blob){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=()=>reject(new Error('读取文件失败。'));
      reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);
    });
  }
  confirmImport.onclick=async()=>{
    if(confirmImport.disabled)return;
    importBusy=true;editor.inert=true;
    try{
      await materialRequest('begin');
      for(const [index,file] of queuedFiles.entries()){
        importStatus.textContent='正在读取 '+file.name+'…';
        for(let offset=0;offset<file.size;offset+=512*1024){
          const data=await chunkData(file.slice(offset,offset+512*1024));
          await materialRequest('chunk',{index:String(index),name:file.name,offset:String(offset),data});
        }
      }
      importStatus.textContent=queuedFiles.length?'正在解析附件…':'正在保存…';
      const source=attachments?'':articleText.value.trim();
      const result=await materialRequest('commit',{source,removed:source?'':[...removedFiles].join(',')});
      editor.close();
      if(result.entry)await created(result.entry);
    }catch(e){
      importStatus.textContent=e.message;
      await materialRequest('abort').catch(()=>{});
    }
    finally{importBusy=false;editor.inert=false;renderImport()}
  };
  return {editor,openImport,articleText,confirmImport,dropZone,fileRows};
}
