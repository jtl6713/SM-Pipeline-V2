/* Chicago Rendering Review: read-only discovery and existing session inspection.
 * Admission, producer chat writes, scheduling, approval and publishing are OFF.
 * Never infer permission from a client toggle or bypass a server-side hold.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = $('page-rendering-review');
  const nav = $('navRenderingReview');
  if (!root || !nav) return;
  const chicago = 'recT2rbKX3MF7cVFU';
  const state = {busy:false,actionBusy:false,flags:{admission_enabled:false,producer_conversation_enabled:false},records:[],cursor:null,selected:'',lastLoad:0,request:0};
  const list = $('rrQueueList'), detail = $('rrDetail'), status = $('rrStatus');
  const refresh = $('rrRefresh'), more = $('rrMore');
  const elem = (tag,text,cls) => {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (cls) node.className = cls;
    return node;
  };
  const say = (message, bad=false) => {
    status.textContent=String(message||'');
    status.classList.toggle('error-text',bad);
  };
  const url = path => (window.CHICAGOSHINING_STUDIO_CONFIG?.apiBase || '') + path;
  async function get(path) {
    const response = await fetch(url(path),{
      method:'GET', credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json'}
    });
    const body = await response.json().catch(()=>({}));
    if(!response.ok || body.ok!==true){
      const error = new Error(body.error||body.message||'Rendering Review request failed ('+response.status+')');
      error.status=response.status;throw error;
    }
    return body;
  }
  const safeRequestId = () => {
    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') throw new Error('Secure request IDs are unavailable on this device');
    return 'review_' + crypto.randomUUID().replace(/-/g,'');
  };
  async function post(path,body) {
    const response=await fetch(url(path),{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json','Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.ok!==true){
      const error=new Error(result.error||result.message||'Rendering Review request failed ('+response.status+')');
      error.status=response.status;throw error;
    }
    return result;
  }
  function actionButton(textValue,run){
    const button=elem('button',textValue,'secondary-button');
    button.type='button';
    button.addEventListener('click',async()=>{
      if(state.actionBusy)return;
      state.actionBusy=true;button.disabled=true;
      try{await run();}
      catch(error){say(error.message||'Review action could not be verified',true);}
      finally{state.actionBusy=false;button.disabled=false;}
    });
    return button;
  }
  const safeUrl = value => {
    try {
      const u = new URL(String(value||''), window.location.href);
      return ['http:','https:'].includes(u.protocol) ? u.href : '';
    } catch { return ''; }
  };
  function clearMedia(){
    const video = $('rrVideo');
    if(video){video.pause();video.removeAttribute('src');video.load();}
    const a = $('rrOpenFile');
    if(a){a.hidden=true;a.removeAttribute('href');}
  }
  function renderList(){
    list.replaceChildren();
    $('rrCount').textContent=state.records.length + ' results loaded';
    more.hidden=!state.cursor;
    more.disabled=state.busy;
    if(!state.records.length){
      list.append(elem('p','No completed Chicago Instagram Reels are visible in this page of the authoritative queue.','rr-empty'));
      return;
    }
    for(const entry of state.records){
      const button=elem('button',null,'rr-entry');
      button.type='button';button.dataset.outputId=entry.output_id;
      button.setAttribute('aria-pressed',String(entry.output_id===state.selected));
      button.append(elem('strong',entry.title||'Untitled Reel'),
        elem('span','Instagram Reel'+(entry.output_number?' · #'+entry.output_number:''),
          'rr-entry-meta'),
        elem('span',entry.review_held?'Review hold present':entry.dispatch_started?
          'Dispatch already started':'Completed render · review not started','rr-entry-meta'));
      button.addEventListener('click',()=>open(entry));
      list.append(button);
    }
  }
  function appendLine(parent,label,value){
    const line=elem('p',null,'rr-detail-line');
    line.append(elem('strong',label+' '),elem('span',value));parent.append(line);
  }
  async function open(entry) {
    state.selected=entry.output_id; renderList();clearMedia();
    detail.replaceChildren();
    detail.append(elem('h2',entry.title||'Instagram Reel'),
      elem('p','Chicago · Instagram Reel'+(entry.output_number?' · #'+entry.output_number:''),'rr-entry-meta'));
    const media=safeUrl(entry.final_file_url);
    const video=$('rrVideo');
    if(media && video){
      video.src=media; video.hidden=false;
      const link=$('rrOpenFile');link.href=media;link.hidden=false;
    } else {
      if(video)video.hidden=true;
      detail.append(elem('p','The original render has no playable HTTPS preview URL. Open it through Pipeline or the linked source library.','rr-muted'));
    }
    appendLine(detail,'Render:',entry.render_status||'Completed file recorded');
    appendLine(detail,'Review:',entry.review_held?'Existing hold detected — do not clear automatically':
      entry.dispatch_started?'Already being dispatched — not eligible to claim':'Not enrolled');
    if(!entry.review_held){
      if(state.flags.admission_enabled===true&&entry.manual_admission_enabled===true&&
          !entry.dispatch_started){
        const enroll=actionButton('Review with Producer',async()=>{
          const result=await post('/api/rendering-review/outputs/'+
            encodeURIComponent(entry.output_id)+'/enroll',
            {client_request_id:safeRequestId()});
          if(!result.review_hold_active)throw new Error('Enrollment hold could not be verified');
          entry.review_held=true;entry.manual_admission_enabled=false;
          say('Chicago Reel enrolled · publication review hold verified');
          renderList();
          await open(entry);
        });
        detail.append(enroll);
        detail.append(elem('p','Manual enrollment establishes a publication hold and vacates any earlier schedule before discussion. Previewing alone changes nothing.','rr-muted'));
      }else{
        detail.append(elem('p','Read-only preview. Manual review admission is disabled or this output is not eligible.','rr-notice'));
      }
      return;
    }
    if(state.flags.producer_conversation_enabled!==true){
      detail.append(elem('p','Existing review hold detected. Conversation writes remain disabled until the protected pilot is verified.','rr-notice'));
    }
    const seq=++state.request;
    try{
      const saved=await get('/api/rendering-review/outputs/'+encodeURIComponent(entry.output_id));
      if(seq!==state.request||state.selected!==entry.output_id)return;
      if(saved.integrity_error)detail.append(elem('p','Hold integrity issue: '+saved.integrity_error,'rr-notice'));
      if(!saved.publication_hold_verified){
        detail.append(elem('p','Authoritative publication hold could not be verified. Discussion actions are disabled.','rr-notice'));
        return;
      }
      const session=saved.session;
      const candidate=session?.producer_candidate;
      if(candidate?.candidate){
        const heading=elem('h3','Latest Producer proposal');detail.append(heading);
        detail.append(elem('p','Candidate only · requires asset/fact checks · does not authorize rendering.','rr-muted'));
        const draft=elem('details',null,'rr-candidate');
        draft.append(elem('summary','Proposed narration and changes'));
        draft.append(elem('p',candidate.candidate.narration||'', 'rr-draft'));
        for(const change of candidate.candidate.changes||[]){
          draft.append(elem('p','Change: '+change,'rr-muted'));
        }
        for(const requirement of candidate.candidate.requirements||[]){
          draft.append(elem('p','Needed ('+requirement.kind+'): '+requirement.description,'rr-muted'));
        }
        if(candidate.stale)draft.append(elem('p','An additional comment was added. Ask the Producer to refresh this plan.','rr-notice'));
        detail.append(draft);
      }
      const messages=Array.isArray(saved.session?.messages)?saved.session.messages:[];
      if(messages.length){
        const heading=elem('h3','Saved conversation (read-only)');detail.append(heading);
        const thread=elem('div',null,'rr-thread');
        for(const message of messages.slice(-30)){
          const line=elem('article',null,'rr-message');
          line.append(elem('strong',message.role==='user'?'You':'Producer'),
            elem('p',message.content||''));
          thread.append(line);
        }
        detail.append(thread);
      }
      if(state.flags.producer_conversation_enabled===true &&
         ['ready_for_review','discussing','awaiting_assets','plan_ready','revision_failed'].includes(session.state)){
        const form=elem('div',null,'rr-chat-form');
        const composer=elem('textarea');
        composer.placeholder='Describe what to change, what to preserve, and where the video needs more detail';
        composer.rows=4;composer.maxLength=3000;
        composer.setAttribute('aria-label','Creative direction for Producer');
        form.append(composer);
        form.append(actionButton('Send to Producer',async()=>{
          const content=String(composer.value||'').trim();
          if(!content)throw new Error('Enter creative direction before sending');
          say('Checking the saved render context and preparing a Producer response…');
          const created=await post('/api/rendering-review/outputs/'+
            encodeURIComponent(entry.output_id)+'/producer-conversation',{
            direction:content,expected_version:session.version,
            client_request_id:safeRequestId(),
          });
          if(created.persisted!==true||created.render_queued!==false)
            throw new Error('Producer conversation receipt could not be verified');
          say('Producer response saved. No replacement render has been started.');
          await open(entry);
        }));
        form.append(elem('p','Producer discussion only. Create next attempt and Approve & schedule remain disabled until the replacement renderer and exact-attempt approval pass verification.','rr-muted'));
        detail.append(form);
      }
    }catch(err){
      if(seq===state.request && err.status!==404)
        detail.append(elem('p','Saved review detail could not be verified: '+err.message,'rr-notice'));
    }
  }
  async function load(next=false){
    if(state.busy||!root.classList.contains('active'))return;
    if(!next && state.lastLoad && Date.now()-state.lastLoad<30000)return;
    const current=++state.request;
    state.busy=true;refresh.disabled=true;more.disabled=true;
    say(next?'Loading more Chicago renders…':'Loading completed Chicago Reel renders…');
    try{
      const query=new URLSearchParams({profile_id:chicago});
      if(next && state.cursor)query.set('cursor',state.cursor);
      const data=await get('/api/rendering-review/queue?'+query.toString());
      if(current!==state.request)return;
      if(data.flags?.automatic_sampling_percent!==0 ||
         typeof data.flags?.admission_enabled!=='boolean' ||
         typeof data.flags?.producer_conversation_enabled!=='boolean')
        throw new Error('Unsafe Rendering Review feature configuration; rendering queue withheld');
      state.flags=data.flags;
      if(!next)state.records=[];
      const previousIds=new Set(state.records.map(v=>v.output_id));
      for(const entry of data.queue||[]){
        if(entry.profile_id!==chicago||entry.output_type!=='Instagram Reel'||
           (entry.manual_admission_enabled===true && data.flags.admission_enabled!==true))
           throw new Error('Unexpected review queue scope');
        if(!previousIds.has(entry.output_id)){state.records.push(entry);previousIds.add(entry.output_id);}
      }
      state.cursor=data.next_cursor||null;state.lastLoad=Date.now();
      say((state.flags.admission_enabled ? 'Manual pilot available' : 'Read-only')+
        ' · Chicago Instagram Reels · '+state.records.length+' loaded');
      renderList();
      if(!state.selected && state.records.length)open(state.records[0]);
    }catch(error){
      say(error.message||'Rendering Review is unavailable',true);
      if(!next){state.records=[];state.cursor=null;clearMedia();renderList();}
    }finally{
      state.busy=false;refresh.disabled=false;more.disabled=!state.cursor;
    }
  }
  refresh.addEventListener('click',()=>{state.lastLoad=0;state.selected='';detail.replaceChildren();load(false);});
  more.addEventListener('click',()=>{if(state.cursor)load(true);});
  nav.addEventListener('click',()=>{ /* Core Studio navigation activates the page; observer loads it. */ });
  const observer = new MutationObserver(()=>{
    if(root.classList.contains('active'))load(false);
    else {clearMedia();state.lastLoad=0;}
  });
  observer.observe(root,{attributes:true,attributeFilter:['class']});
  async function reveal(){
    try{
      const session=await get('/api/session');
      const canReview=session.authenticated&&session.authorized&&session.permissions?.outputs_review===true;
      nav.hidden=!canReview;
    }catch{nav.hidden=true;}
  }
  reveal();
  if(root.classList.contains('active'))load(false);
  window.StudioRenderingReview={load};
})();
