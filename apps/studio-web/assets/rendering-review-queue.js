/* Chicago Rendering Review: authenticated, exact-output media and review.
 * Preview never claims a hold or bypasses publication safeguards.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = $('page-rendering-review');
  const nav = $('navRenderingReview');
  if (!root || !nav) return;
  const chicago = 'recT2rbKX3MF7cVFU';
  const state = {busy:false,actionBusy:false,flags:{admission_enabled:false,producer_conversation_enabled:false,attempt_commit_enabled:false},records:[],cursor:null,selected:'',lastLoad:0,request:0,commitKeys:new Map(),pollTimer:null};
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
      const detail=typeof result.error==='string'&&result.error.trim()?result.error:
        typeof result.message==='string'&&result.message.trim()?result.message:
        'Rendering Review request failed ('+response.status+')';
      const error=new Error(detail);
      error.status=response.status;throw error;
    }
    return result;
  }
  function actionButton(textValue,run,inlineStatus=null){
    const button=elem('button',textValue,'secondary-button');
    button.type='button';
    button.addEventListener('click',async()=>{
      if(state.actionBusy)return;
      state.actionBusy=true;button.disabled=true;
      if(inlineStatus){
        inlineStatus.textContent='Sending your request…';
        inlineStatus.classList.toggle('error-text',false);
      }
      try{await run();}
      catch(error){
        const message=error.message||'Review action could not be verified';
        say(message,true);
        if(inlineStatus){
          inlineStatus.textContent='Not sent: '+message;
          inlineStatus.classList.toggle('error-text',true);
        }
      }
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
    if(video){video.pause();video.removeAttribute('src');video.load();video.hidden=true;}
    const frame=$('rrDrivePreview');
    if(frame)frame.remove();
    const a = $('rrOpenFile');
    if(a){a.hidden=true;a.removeAttribute('href');}
  }
  // Always use the authenticated same-origin MP4 stream. Drive's embedded
  // /preview page can return HTTP 400 in mobile browsers, despite a real MP4.
  function originalMedia(entry){
    return /^rec[A-Za-z0-9]{14}$/.test(String(entry?.output_id||""))
      ?url('/api/outputs/'+encodeURIComponent(entry.output_id)+'/preview'):'';
  }
  function attemptMedia(attempt,entry){
    if(attempt?.number===1)return originalMedia(entry);
    if(attempt?.status!=='ready_for_review'||!attempt?.artifact_id||
       !/^[A-Za-z0-9_-]{8,120}$/.test(String(attempt.id||""))||
       !/^rec[A-Za-z0-9]{14}$/.test(String(entry?.output_id||"")))return '';
    return url('/api/rendering-review/outputs/'+encodeURIComponent(entry.output_id)+
      '/attempts/'+encodeURIComponent(attempt.id)+'/preview');
  }
  function showMedia(mediaValue,label){
    clearMedia();
    const value=safeUrl(mediaValue);
    if(!value)return false;
    const video=$('rrVideo');
    video.onerror=()=>{
      if(video.src===value)say('The video could not load from Studio. Select this Reel again to retry.',true);
    };
    video.src=value;
    video.preload='metadata';
    video.hidden=false;
    video.load();
    const link=$('rrOpenFile');
    link.href=value;link.hidden=false;
    link.textContent=label?'Open '+label+' video':'Open Reel video';
    return true;
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
  function cancelAttemptPoll(){
    if(state.pollTimer!==null && typeof window.clearTimeout==='function')
      window.clearTimeout(state.pollTimer);
    state.pollTimer=null;
  }
  // The exact held review session is polled for completion, never the renderer.
  // Do not replace the playing preview while a render is still in progress.
  function watchAttempt(entry,seenState,requestSequence){
    if(typeof window.setTimeout!=='function')return;
    cancelAttemptPoll();
    state.pollTimer=window.setTimeout(async()=>{
      state.pollTimer=null;
      if(!root.classList.contains('active')||state.selected!==entry.output_id||
         state.request!==requestSequence)return;
      try{
        const latest=await get('/api/rendering-review/outputs/'+encodeURIComponent(entry.output_id));
        if(state.selected!==entry.output_id||state.request!==requestSequence)return;
        if(latest.publication_hold_verified!==true){
          say('Review hold could not be verified; automatic status checks paused.',true);
          return;
        }
        const nextState=latest.session?.state;
        if(nextState===seenState){
          watchAttempt(entry,seenState,requestSequence);
        }else{
          await open(entry);
          if(nextState==='ready_for_review')
            say('Revised Reel delivered — select V2 or compare with V1.');
          else if(nextState==='revision_failed')
            say('Revision needs attention; original Reel is preserved.',true);
        }
      }catch(error){
        say('Could not refresh the render status. Select the Reel to try again.',true);
      }
    },12000);
  }
  async function open(entry) {
    cancelAttemptPoll();
    state.selected=entry.output_id; renderList();clearMedia();
    detail.replaceChildren();
    detail.append(elem('h2',entry.title||'Instagram Reel'),
      elem('p','Chicago · Instagram Reel'+(entry.output_number?' · #'+entry.output_number:''),'rr-entry-meta'));
    if(!showMedia(originalMedia(entry),'original Reel')){
      detail.append(elem('p','The original render has no authenticated Studio video source.','rr-muted'));
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
      const attempts=Array.isArray(session?.attempts)?session.attempts:[];
      if(attempts.length){
        const heading=elem('h3','Rendering attempts');detail.append(heading);
        const picker=elem('div',null,'rr-attempts');
        for(const attempt of attempts){
          const statusText='Attempt '+attempt.number+' · '+String(attempt.status||'unknown').replace(/_/g,' ');
          const media=attemptMedia(attempt,entry);
          const playable=attempt.status==='ready_for_review'&&!!media;
          const button=actionButton(statusText,async()=>{
            if(!playable)throw new Error('This attempt is not yet a verified, playable render');
            if(!showMedia(media,'Attempt '+attempt.number))
              throw new Error('This attempt has no supported HTTPS media URL');
            say('Showing Attempt '+attempt.number+' · original and revised files are retained separately');
          });
          button.disabled=!playable;
          picker.append(button);
        }
        detail.append(picker);
        const newest=attempts.filter(a=>a.status==='ready_for_review'&&a.artifact_id).at(-1);
        if(newest?.number>1)showMedia(attemptMedia(newest,entry),'Attempt '+newest.number);
      }
      if(session?.state==='approved'){
        detail.append(elem('p','Creative render accepted for the pilot. The publication hold remains active; no Instagram upload or publishing has been authorized.','rr-notice'));
      }
      if(session?.state==='ready_for_review'&&
         saved.flags?.creative_approval_enabled===true&&
         saved.publication_hold_verified===true){
        const current=attempts.find(a=>a.id===session.current_attempt_id);
        if(current?.status==='ready_for_review'&&attemptMedia(current,entry)){
          detail.append(actionButton('Approve this version — review only',async()=>{
            if(!window.confirm('Accept this rendered version for the pilot? This does NOT publish, upload, or release the publication hold.'))return;
            const result=await post('/api/rendering-review/outputs/'+
              encodeURIComponent(entry.output_id)+'/approve',{
              expected_version:session.version,attempt_id:current.id,
              client_request_id:safeRequestId(),
            });
            if(result.accepted!==true||result.review_hold_active!==true||
               result.publication_changed!==false||
               result.instagram_upload_created!==false)
              throw new Error('Creative approval receipt not verified');
            say('Version accepted. Publication remains held.');
            await open(entry);
          }));
        }
      }
      if(['queued','rendering','validating'].includes(session?.state)){
        detail.append(elem('p','Attempt '+session.latest_attempt_number+' · '+
          ({queued:'Queued for isolated renderer',rendering:'Rendering',validating:'Validating media'}[session.state])+
          '. No Instagram publication has been authorized.','rr-notice'));
        detail.append(actionButton('Check render status',async()=>{await open(entry);}));
        watchAttempt(entry,session.state,seq);
      }
      const plan=session?.plan;
      if(plan){
        detail.append(elem('h3','Current revision plan'));
        const ready=plan.frozen===true&&Array.isArray(plan.missing_assets)&&
          plan.missing_assets.length===0&&!!plan.immutable_manifest&&
          session.state==='plan_ready'&&session.review_hold?.active===true&&
          saved.publication_hold_verified===true&&
          saved.flags?.attempt_commit_enabled===true&&
          session.producer_candidate?.stale!==true;
        appendLine(detail,'Plan:',ready?'Ready for render-only authorization':
          plan.frozen&&plan.missing_assets?.length===0?
          'Frozen plan exists; rendering is not enabled':'Requirements remain unresolved');
        appendLine(detail,'Version:',plan.version);
        if(Array.isArray(plan.acceptance_checks)&&plan.acceptance_checks.length){
          for(const check of plan.acceptance_checks.slice(0,10))
            detail.append(elem('p','Acceptance check: '+String(check),'rr-muted'));
        }
        if(Array.isArray(plan.missing_assets)&&plan.missing_assets.length)
          detail.append(elem('p',plan.missing_assets.length+' requirements must be resolved before rendering.','rr-notice'));
        if(ready){
          detail.append(actionButton('Create next attempt — render only',async()=>{
            if(!window.confirm('Render one replacement Reel from the frozen plan? This will NOT upload or publish to Instagram.'))return;
            const identity=entry.output_id+':'+plan.hash+':'+plan.version;
            if(!state.commitKeys.has(identity))state.commitKeys.set(identity,safeRequestId());
            const receipt=await post('/api/rendering-review/outputs/'+
              encodeURIComponent(entry.output_id)+'/commit-attempt',{
              intent:'render_this_plan',expected_version:session.version,
              plan_version:plan.version,plan_hash:plan.hash,
              client_request_id:state.commitKeys.get(identity),
            });
            if(receipt.ok!==true||receipt.hold_active!==true||
               receipt.public_post_created!==false||!receipt.attempt_id||!receipt.job_id)
              throw new Error('A held, unique render-only job was not verified');
            say('Attempt '+receipt.attempt_number+' queued under the publication hold. No Instagram post created.');
            await open(entry);
          }));
        }
      }
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
        const feedbackStatus=elem('p','','rr-feedback-status');
        feedbackStatus.setAttribute('role','status');
        feedbackStatus.setAttribute('aria-live','polite');
        let pendingKey='',pendingDirection='';
        form.append(actionButton('Send to Producer',async()=>{
          const content=String(composer.value||'').trim();
          if(!content)throw new Error('Enter creative direction before sending');
          // Keep an idempotency key for a retry of the same direction. A lost
          // response must never create duplicate producer messages.
          if(content!==pendingDirection){
            pendingKey=safeRequestId();pendingDirection=content;
          }
          feedbackStatus.textContent='Checking the saved Reel and preparing a Producer response…';
          say('Checking the saved render context and preparing a Producer response…');
          const created=await post('/api/rendering-review/outputs/'+
            encodeURIComponent(entry.output_id)+'/producer-conversation',{
            direction:content,expected_version:session.version,
            client_request_id:pendingKey,
          });
          if(created.persisted!==true||created.render_queued!==false)
            throw new Error('Producer response was not confirmed saved. Your text is preserved for retry.');
          feedbackStatus.textContent='Producer reply saved. Reloading the conversation…';
          feedbackStatus.classList.toggle('error-text',false);
          say('Producer response saved. No replacement render has been started.');
          pendingDirection='';pendingKey='';
          await open(entry);
        },feedbackStatus));
        form.append(feedbackStatus);
        form.append(elem('p','Producer discussion does not launch a render. A separate render-only button appears only for an independently verified frozen plan; Instagram approval and publishing remain disabled.','rr-muted'));
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
  refresh.addEventListener('click',()=>{cancelAttemptPoll();state.lastLoad=0;state.selected='';detail.replaceChildren();load(false);});
  more.addEventListener('click',()=>{if(state.cursor)load(true);});
  nav.addEventListener('click',()=>{ /* Core Studio navigation activates the page; observer loads it. */ });
  const observer = new MutationObserver(()=>{
    if(root.classList.contains('active'))load(false);
    else {cancelAttemptPoll();clearMedia();state.lastLoad=0;}
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
