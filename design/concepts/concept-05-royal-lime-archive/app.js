(() => {
  'use strict';
  const P = window.ArchivePrototype;
  P.settings = {density:'balanced',motion:true,mapFailure:false,saveFailure:false,exif:'success'};
  P.session = {loggedIn:false};
  P.esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  P.date = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value || '未填写') : new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d); };
  P.blobs = new Set();
  P.imageURL = value => typeof value === 'string' && (/^\.\/assets\/[\w.-]+$/.test(value) || P.blobs.has(value)) ? value : './assets/photo-placeholder.svg';
  P.createImage = file => { const url = URL.createObjectURL(file); P.blobs.add(url); return url; };
  let nextId = 0;
  P.id = () => `${Date.now()}-${++nextId}`;
  const inline = text => P.esc(text).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  P.markdown = (text, options={}) => {
    const lines = String(text || '').split('\n'), html=[]; let code=null, list=null, paragraph=[]; let heading=0;
    const flushParagraph=()=>{if(paragraph.length){html.push(`<p>${inline(paragraph.join('\n')).replace(/\n/g,'<br>')}</p>`);paragraph=[];}};
    const flushList=()=>{if(list){html.push(`</${list}>`);list=null;}};
    for (const line of lines) {
      if (/^```/.test(line)) {flushParagraph();flushList();if(code!==null){html.push(`<pre><code>${P.esc(code.join('\n'))}</code></pre>`);code=null;}else code=[];continue;}
      if(code!==null){code.push(line);continue;}
      if(!line.trim()){flushParagraph();flushList();continue;}
      const h=line.match(/^(#{1,3})\s+(.+)$/);
      const img=line.match(/^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/);
      const li=line.match(/^\s*(?:([-*])|\d+\.)\s+(.+)$/);
      if(h){flushParagraph();flushList();if(options.skipTitle && h[1].length===1)continue; const level=Math.max(2,h[1].length);html.push(`<h${level} id="chapter-${++heading}">${inline(h[2])}</h${level}>`);}
      else if(img){flushParagraph();flushList();html.push(`<figure class="article-figure"><img src="${P.esc(P.imageURL(img[2]))}" alt="${P.esc(img[1])}">${img[3]?`<figcaption>${P.esc(img[3])}</figcaption>`:''}</figure>`);}
      else if(li){flushParagraph();const type=li[1]?'ul':'ol';if(list!==type){flushList();html.push(`<${type}>`);list=type;}html.push(`<li>${inline(li[2])}</li>`);}
      else if(/^>\s?/.test(line)){flushParagraph();flushList();html.push(`<blockquote>${inline(line.replace(/^>\s?/,''))}</blockquote>`);}
      else{flushList();paragraph.push(line);}
    }
    flushParagraph();flushList();if(code!==null)html.push(`<pre><code>${P.esc(code.join('\n'))}</code></pre>`);
    return html.join('');
  };
  let currentHash = location.hash.startsWith('#/') ? location.hash : '#/home';
  let index = Number.isInteger(history.state?.archiveIndex) ? history.state.archiveIndex : 0;
  history.replaceState({...history.state,archiveIndex:index},'',currentHash);
  let restoring = false, awaitingHistory = false, replay = false, pendingHistory = null;
  P.confirm = ({title,copy,confirmLabel='确认'}) => new Promise(resolve => {
    const dialog=document.querySelector('#confirm-dialog');
    if(dialog.open){resolve(false);return;}
    const trigger=document.activeElement;
    dialog.querySelector('#confirm-title').textContent=title;
    dialog.querySelector('#confirm-copy').textContent=copy;
    dialog.querySelector('[data-confirm]').textContent=confirmLabel;
    dialog.returnValue='';
    dialog.addEventListener('close',()=>{if(trigger?.isConnected)trigger.focus({preventScroll:true});resolve(dialog.returnValue==='confirm');},{once:true});
    dialog.showModal();
  });
  P.guard = async callback => {
    if (P.admin?.busy?.() || awaitingHistory || restoring) return false;
    if(P.admin?.isDirty?.()) {
      const yes=await P.confirm({title:'离开前放弃修改？',copy:'当前内容尚未保存。取消可继续编辑，放弃后本次修改不会保留。',confirmLabel:'放弃修改'});
      if(!yes)return false;
      P.admin.discard();
    }
    await callback();return true;
  };
  P.parseRoute = hash => {
    try {
      const [path,query='']=hash.replace(/^#\//,'').split('?'); const parts=path.split('/').filter(Boolean).map(decodeURIComponent);const [section,folder,record]=parts;
      if(parts.length>3 || !['home','articles','images','admin'].includes(section))return {section:'not-found'};
      if(section==='home')return parts.length===1?{section}: {section:'not-found'};
      if(section==='admin')return !record && (!folder||['articles','images','folders'].includes(folder))?{section,tab:folder||'articles'}:{section:'not-found'};
      if(folder && !P.data.folders.some(f=>f.type===section && f.slug===folder))return {section:'not-found'};
      if(record && !P.data[section].some(r=>r.folder===folder && (section==='articles'?r.slug:r.id)===record))return {section:'not-found'};
      return {section,folder,record,view:new URLSearchParams(query).get('view')==='map'?'map':'photos'};
    }catch{return {section:'not-found'};}
  };
  P.render = (focus=true) => {
    P.public?.cleanup?.();P.admin?.cleanup?.();
    const route=P.parseRoute(currentHash);P.route=route;
    const main=document.querySelector('#prototype-main');
    main.dataset.section=route.section;
    main.innerHTML=route.section==='not-found'?'<section class="screen-content"><p class="eyebrow">404 / Archive</p><h1>页面不存在</h1><p>这条记录可能已移除。</p><a class="button button-primary" href="#/home">返回首页</a></section>':route.section==='admin'?(P.admin?.render(route)||'<h1>后台正在准备</h1>'):(P.public?.render(route)||'<h1>页面正在准备</h1>');
    document.querySelectorAll('[data-section]').forEach(a=>{if(a.tagName==='A'){if(a.dataset.section===route.section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}});
    if(route.section==='admin')P.admin?.mount(route);else P.public?.mount(route);
    const h=main.querySelector('h1');document.title=`${h?.textContent || 'Royal Lime Archive'} · Website Turns Away`;
    if(focus){window.scrollTo({top:0,behavior:'instant'});if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}
  };
  P.go = hash => {if(hash===currentHash)return Promise.resolve(true);return P.guard(()=>{index++;history.pushState({archiveIndex:index},'',hash);currentHash=hash;P.render();});};
  window.addEventListener('popstate', async event=>{
    if(restoring){restoring=false;const job=pendingHistory;pendingHistory=null;if(!job)return;const yes=await P.confirm({title:'离开前放弃修改？',copy:'当前内容尚未保存。取消可继续编辑。',confirmLabel:'放弃修改'});awaitingHistory=false;if(yes){P.admin?.discard();replay=true;history.go(job.delta);}return;}
    const target=location.hash; const marked=Number.isInteger(event.state?.archiveIndex);const targetIndex=marked?event.state.archiveIndex:index+1;if(!marked)history.replaceState({archiveIndex:targetIndex},'',target);
    const delta=targetIndex-index;
    if(target===currentHash)return;
    if(!replay && (P.admin?.isDirty?.()||P.admin?.busy?.())){
      if(!delta){history.replaceState({archiveIndex:index},'',currentHash);return;}
      if(P.admin?.busy?.()){restoring=true;pendingHistory=null;history.go(-delta);return;}
      awaitingHistory=true;restoring=true;pendingHistory={delta};history.go(-delta);return;
    }
    replay=false;index=targetIndex;currentHash=target;P.render();
  });
  window.addEventListener('hashchange',()=>{
    if(restoring||awaitingHistory||location.hash===currentHash)return;
    const next=location.hash;
    history.replaceState({archiveIndex:index},'',currentHash);
    P.go(next);
  });
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#/"]');
    if(link && event.button===0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey){event.preventDefault();P.go(link.getAttribute('href'));}
    if(event.target.closest('[data-skip]')){event.preventDefault();document.querySelector('#prototype-main').focus();}
  });
  window.addEventListener('beforeunload',e=>{if(P.admin?.isDirty?.()){e.preventDefault();e.returnValue='';}});
  document.addEventListener('DOMContentLoaded',()=>{P.preview?.init();P.render(false);});
})();
