/* Chicago Post Production Edits: authenticated, exact-output media and review.
 * Preview never claims a hold or bypasses publication safeguards.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = $('page-rendering-review');
  const nav = $('navRenderingReview');
  if (!root || !nav) return;
  const chicago = 'recT2rbKX3MF7cVFU';
  const NEEDS_ASSET_THUMB = '/assets/needs-asset.svg';
  const state = {busy:false,actionBusy:false,flags:{admission_enabled:false,producer_conversation_enabled:false,attempt_commit_enabled:false},records:[],cursor:null,selected:'',lastLoad:0,request:0,commitKeys:new Map(),pollTimer:null,activeEntry:null,nextRevisionDrafts:new Map(),nextRevisionKeys:new Map(),editRequestKeys:new Map(),progressCheckNode:null,lastVerifiedSummary:null,lastReplyNotice:null,lastReplyNoticeNode:null,viewingVersion:null,approvalButton:null,approvalVersion:null,approvalLocks:new Set(),approvalKeys:new Map()};
  const list = $('rrQueueList'), detail = $('rrDetail'), status = $('rrStatus');
  const topProgress = $('rrProgressSummary');

  const chicagoTime = value => {
    if(typeof value!=='string'||!value.trim())return 'Timestamp unavailable';
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return 'Timestamp unavailable';
    return new Intl.DateTimeFormat('en-US',{
      timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',
      hour:'numeric',minute:'2-digit',timeZoneName:'short',
    }).format(date);
  };
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
      const error = new Error(body.error||body.message||'Post Production Edits request failed ('+response.status+')');
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
        'Post Production Edits request failed ('+response.status+')';
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
      button.textContent=inlineStatus?'Producer is working…':'Working…';
      button.setAttribute('aria-busy','true');
      let slowNotice=null;
      if(inlineStatus){
        inlineStatus.hidden=false;
        inlineStatus.dataset.state='working';
        inlineStatus.textContent='Sending your feedback to the Producer…';
        inlineStatus.classList.toggle('error-text',false);
        // The Producer request can take time, but there is no server-side
        // stage feed. Tell the truth rather than inventing a percentage.
        if(typeof window.setTimeout==='function'){
          slowNotice=window.setTimeout(()=>{
            if(inlineStatus.dataset.state==='working'){
              inlineStatus.textContent='Still waiting for the Producer to respond. Your request is processing; please keep this page open.';
            }
          },8000);
        }
      }
      try{await run();}
      catch(error){
        const message=error.message||'Review action could not be verified';
        say(message,true);
        if(inlineStatus){
          inlineStatus.hidden=false;
          inlineStatus.dataset.state='error';
          inlineStatus.textContent='Could not confirm your reply: '+message+' Your message is still in the box to retry.';
          inlineStatus.classList.toggle('error-text',true);
        }
      }
      finally{
        if(slowNotice!==null&&typeof window.clearTimeout==='function')window.clearTimeout(slowNotice);
        state.actionBusy=false;button.disabled=false;
        button.textContent=textValue;button.removeAttribute('aria-busy');
      }
    });
    return button;
  }
  const safeUrl = value => {
    try {
      const u = new URL(String(value||''), window.location.href);
      return ['http:','https:'].includes(u.protocol) ? u.href : '';
    } catch { return ''; }
  };
  function syncSelectedApproval(){
    const button=state.approvalButton;
    if(!button)return;
    const selected=state.viewingVersion===state.approvalVersion;
    button.disabled=!selected||state.approvalLocks.has(button.dataset.approvalKey);
    button.title=selected?'':'Select V'+state.approvalVersion+' to approve it.';
  }
  function clearMedia(){
    state.viewingVersion=null;
    syncSelectedApproval();
    const video = $('rrVideo');
    if(video){video.pause();video.removeAttribute('src');video.load();video.hidden=true;}
    const frame=$('rrDrivePreview');
    if(frame)frame.remove();
    const a = $('rrOpenFile');
    if(a){a.hidden=true;a.removeAttribute('href');}
    const version=$('rrVersionBar');
    if(version)version.hidden=true;
    const original=$('rrOriginalVersion');
    if(original)original.hidden=true;
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
  function showMedia(mediaValue,label,versionNumber=1){
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
    const version=Number.isInteger(versionNumber)&&versionNumber>=1?versionNumber:1;
    state.viewingVersion=version;
    syncSelectedApproval();
    const bar=$('rrVersionBar');
    const labelNode=$('rrVersionLabel');
    const originalLink=$('rrOriginalVersion');
    if(labelNode)labelNode.textContent='Version V'+version;
    if(originalLink)originalLink.hidden=version===1;
    if(bar)bar.hidden=false;
    return true;
  }
  const originalVersionLink=$('rrOriginalVersion');
  if(originalVersionLink)originalVersionLink.addEventListener('click',()=>{
    if(state.activeEntry&&showMedia(originalMedia(state.activeEntry),'V1',1))
      say('Viewing original version (V1).');
  });
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
      const thumb = elem('span',null,'rr-entry-thumb');
      const cover = elem('img');
      const coverUrl = safeUrl(entry.thumbnail_url);
      cover.loading='lazy';cover.decoding='async';
      cover.alt=coverUrl?'':'NEEDS ASSET';
      cover.src=coverUrl||NEEDS_ASSET_THUMB;
      cover.addEventListener('error',()=>{
        if(cover.getAttribute('src')===NEEDS_ASSET_THUMB)return;
        cover.src=NEEDS_ASSET_THUMB;cover.alt='NEEDS ASSET';
      });
      thumb.append(cover);
      const copy=elem('span',null,'rr-entry-body');
      copy.append(elem('strong',entry.title||'Untitled Reel'),
        elem('span','Instagram Reel'+(entry.output_number?' · #'+entry.output_number:''),
          'rr-entry-meta'),
        elem('span',entry.review_held?'Review hold present':entry.dispatch_started?
          'Dispatch already started':'Completed render · review not started','rr-entry-meta'));
      button.append(thumb,copy);
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
  // Observe only the held review session. This is an authoritative saved-state
  // check, NOT a claim that Producer chat automatically queued an isolated render.
  function reviewSignature(session) {
    const messages=Array.isArray(session?.messages)?session.messages:[];
    const last=messages[messages.length-1];
    const history=Array.isArray(session?.history)?session.history:[];
    return JSON.stringify([
      session?.version,session?.state,session?.current_attempt_id,
      session?.latest_attempt_number,session?.plan?.version,session?.plan?.hash,
      session?.plan?.frozen,session?.producer_candidate?.stale,
      session?.attempts?.length,last?.at,last?.content,
      history[history.length-1]?.at,
    ]);
  }
  function watchReview(entry,seenSignature,requestSequence) {
    if(typeof window.setTimeout!=='function')return;
    cancelAttemptPoll();
    state.pollTimer=window.setTimeout(async()=>{
      state.pollTimer=null;
      if(!root.classList.contains('active')||state.selected!==entry.output_id||
         state.request!==requestSequence)return;
      try{
        const latest=await get('/api/rendering-review/outputs/'+encodeURIComponent(entry.output_id));
        if(!root.classList.contains('active')||state.selected!==entry.output_id||
           state.request!==requestSequence)return;
        if(latest.publication_hold_verified!==true){
          if(state.progressCheckNode)state.progressCheckNode.textContent=
            'Status checks paused: the publication hold could not be verified.';
          say('Review hold could not be verified; automatic status checks paused.',true);
          return;
        }
        if(reviewSignature(latest.session)!==seenSignature){
          // Never interrupt a playing V1/V2 video just to update a status card.
          if($('rrVideo')?.paused===false){
            if(state.progressCheckNode)state.progressCheckNode.textContent=
              'New saved activity detected. Pause the video and select Check latest status to see it.';
            watchReview(entry,seenSignature,requestSequence);
          }else await open(entry);
        }else{
          if(state.progressCheckNode)state.progressCheckNode.textContent=
            'Last verified: '+chicagoTime(new Date().toISOString())+
            ' · automatic check every 20 seconds while this page is open.';
          watchReview(entry,seenSignature,requestSequence);
        }
      }catch(error){
        if(state.progressCheckNode)state.progressCheckNode.textContent=
          'Automatic status check unavailable. Last verified state is retained. Use Check latest status to retry.';
        watchReview(entry,seenSignature,requestSequence);
      }
    },20000);
  }
  function appendRevisionProgress(activity,session,messages,producer,planReady,completedAttempt,entry,saved) {
    const attempts=Array.isArray(session?.attempts)?session.attempts:[];
    const approvedV2=session?.state==='approved'&&attempts.some(a=>
      a?.id===session.approved_attempt_id&&Number(a?.number)>1);
    const readyV2=!!completedAttempt||approvedV2;
    const rendering=['queued','rendering','validating'].includes(session?.state);
    const failed=session?.state==='revision_failed';
    const pendingFeedback=messages.findLastIndex(m=>m.role==='user')>
      messages.findLastIndex(m=>m.role==='producer');
    const stage=readyV2?5:session?.state==='validating'?4:
      rendering||failed?3:planReady?2:producer?1:0;

    // Red means a verified operator action is possible, NOT that a background
    // job is still processing. Gated/unavailable actions are never invented.
    const canReply=!!producer&&saved?.flags?.producer_conversation_enabled===true&&
      ['discussing','awaiting_assets'].includes(session?.state);
    const canRender=planReady&&!!session?.plan?.immutable_manifest&&
      session?.review_hold?.active===true&&saved?.publication_hold_verified===true&&
      saved?.flags?.attempt_commit_enabled===true&&
      session?.producer_candidate?.stale!==true;
    const current=attempts.find(a=>a?.id===session?.current_attempt_id);
    const canApprove=readyV2&&session?.state==='ready_for_review'&&
      saved?.flags?.creative_approval_enabled===true&&
      saved?.publication_hold_verified===true&&
      current?.status==='ready_for_review'&&!!attemptMedia(current,entry);
    const canPrepareEdits=saved?.flags?.producer_conversation_enabled===true&&
      session?.review_hold?.active===true&&!rendering;
    const requiresInput=(stage===0&&pendingFeedback&&canPrepareEdits)||
      (stage===1&&(canReply||pendingFeedback&&canPrepareEdits))||
      (stage===2&&canRender)||
      (stage===5&&(canApprove||pendingFeedback&&canPrepareEdits));
    const steps=['Feedback received','Producer review','Plan ready',
      'Rendering','Quality check','Ready for review'];
    const rail=elem('ol',null,'rr-progress-stages');
    rail.setAttribute('aria-label','Verified post-production stages');
    for(let i=0;i<steps.length;i++){
      const phase=(readyV2&&session?.state==='approved')||i<stage?'complete':i===stage?
        requiresInput||failed?'attention':'current':'pending';
      const item=elem('li',null,'rr-progress-stage rr-progress-stage--'+phase);
      item.append(elem('span',steps[i],'rr-progress-stage-name'));
      item.append(elem('span',phase==='complete'?'Completed':
        phase==='attention'?(requiresInput?'Requires your attention':'Needs attention'):
        phase==='current'?(session?.state==='queued'&&i===3?'Queued — not started':
          session?.state==='rendering'&&i===3?'In progress':
          i===0&&!messages.length?'Not started':'Current'):'Not started','rr-progress-stage-state'));
      rail.append(item);
    }
    if(requiresInput)activity.classList.add('rr-activity--attention');
    const heading=elem('h3','Post-production progress','rr-progress-heading');
    const summary=session?.state==='approved'&&approvedV2?
      (session.factory_review?.status==='accepted_pending_qa'?
        'Factory has accepted the V2 creative cut. Watermark QA is still pending; publication and scheduling remain held.':
        'V2 creative approval is saved. Factory can accept the creative cut under a QA hold without scheduling or publishing.'):
      readyV2?(canApprove?
        'Requires your attention: V2 is ready for review. Select V2 and approve only if satisfied. Publication remains held.':
        pendingFeedback&&canPrepareEdits?
        'Requires your attention: V2 is ready and your newer feedback is saved. Make edits based on the latest feedback to prepare another plan, or review V2. Nothing is automatically rendered.':
        'Revised V2 is ready for review. Publication remains held until approval.'):
      session?.state==='validating'?
        'V2 render completed its rendering stage; media validation is in progress.':
      session?.state==='rendering'?
        'V2 render is running. Quality validation and review are not complete.':
      session?.state==='queued'?
        'V2 render job is queued. Rendering has not been confirmed started.':
      failed?'The revised render needs attention; V1 remains preserved.':
      planReady?(canRender?
        'Requires your attention: V2 plan is saved. Select Make the revised video to authorize rendering. No render has started.':
        'V2 plan is saved. No render has started. Render authorization is a separate action when enabled.'):
      producer?(pendingFeedback?
        'Requires your attention: feedback was saved but no new edits have been requested. Select Make edits based on the latest feedback to prepare a plan. V2 has NOT started.':
        canReply?
        'Requires your attention: Producer replied, but V2 has NOT started. Review the proposed changes and reply with your direction. No render-ready plan or V2 job exists.':
        'Producer replied, but V2 has NOT started. No verified render-ready plan or V2 render job exists. Continue the conversation to resolve remaining requirements.'):
      messages.length?(pendingFeedback?
        'Requires your attention: feedback is saved. Select Make edits based on the latest feedback when ready. No edits or render have started.':
        'Feedback was saved. No verified Producer reply or V2 job yet.'): 
      'Review is held. No Producer activity or V2 render job is verified.';
    activity.append(heading,elem('p',summary,'rr-progress-summary'),rail);
    const checked=elem('p','Verified from the saved review session · '+chicagoTime(new Date().toISOString())+
      ' · auto-check every 20 seconds while this page is open.','rr-progress-checked');
    state.progressCheckNode=checked;
    activity.append(checked,actionButton('Check latest status',async()=>{await open(entry);}));
    state.lastVerifiedSummary={outputId:entry.output_id,summary};
    if(topProgress){
      topProgress.hidden=false;
      topProgress.classList.toggle('rr-progress-top--attention',requiresInput);
      topProgress.textContent=(entry.output_number?'#'+entry.output_number+' · ':'')+summary;
    }
  }
  async function open(entry) {
    cancelAttemptPoll();
    const changedOutput=state.selected!==entry.output_id;
    state.selected=entry.output_id;state.activeEntry=entry;
    state.progressCheckNode=null;
    if(topProgress&&changedOutput){topProgress.hidden=true;
      topProgress.classList.remove('rr-progress-top--attention');}
    state.approvalButton=null;state.approvalVersion=null;
    renderList();clearMedia();
    detail.replaceChildren();
    detail.append(elem('h2',entry.title||'Instagram Reel'),
      elem('p','Chicago · Instagram Reel'+(entry.output_number?' · #'+entry.output_number:''),'rr-entry-meta'));
    state.lastReplyNoticeNode=null;
    if(state.lastReplyNotice?.outputId===entry.output_id){
      const receipt=elem('p',state.lastReplyNotice.message,'rr-feedback-receipt');
      receipt.setAttribute('role','status');
      detail.append(receipt);
      state.lastReplyNoticeNode=receipt;
    }
    if(!showMedia(originalMedia(entry),'V1',1)){
      detail.append(elem('p','The original render has no authenticated Studio video source.','rr-muted'));
    }
    appendLine(detail,'Render:',entry.render_status||'Completed file recorded');
    appendLine(detail,'Review:',entry.review_held?'Existing hold detected — do not clear automatically':
      entry.dispatch_started?'Already being dispatched — not eligible to claim':'Not enrolled');
    if(!entry.review_held){
      if(topProgress){topProgress.hidden=true;topProgress.classList.remove('rr-progress-top--attention');}
      detail.append(elem('p','To request changes, open this output in Factory, select Request Changes, and enter comments before submitting.','rr-notice'));
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
        if(topProgress){topProgress.hidden=false;topProgress.classList.remove('rr-progress-top--attention');
          topProgress.textContent='Status paused: authoritative publication hold could not be verified.';}
        detail.append(elem('p','Authoritative publication hold could not be verified. Discussion actions are disabled.','rr-notice'));
        return;
      }
      const session=saved.session;
      const creativeGroup=saved.creative_group;
      if(creativeGroup?.key&&Array.isArray(creativeGroup.outputs)){
        const section=elem('section',null,'rr-activity');
        section.setAttribute('aria-label','Creative master and matching outputs');
        section.append(elem('strong','One creative master · '+creativeGroup.linked_count+
          ' matching output'+(creativeGroup.linked_count===1?'':'s'),'rr-activity-heading'));
        section.append(elem('p','Content '+creativeGroup.content_item_id+
          ' · '+creativeGroup.format+' · '+creativeGroup.aspect_ratio,'rr-activity-detail'));
        section.append(elem('p',creativeGroup.master?
          'Creative master V'+creativeGroup.master.version+
          ' recorded. Matching outputs share its reference, but retain independent videos, captions, schedules, and publishing approvals.':
          'These outputs match the source creative. A shared approved master will be registered only after independently verified creative acceptance and Factory handoff.','rr-activity-detail'));
        const linked=elem('ul',null,'rr-creative-master-members');
        for(const sibling of creativeGroup.outputs.slice().sort((a,b)=>
          Number(a.output_number||0)-Number(b.output_number||0))){
          linked.append(elem('li',(sibling.output_number?'#'+sibling.output_number+' · ':'')+
            sibling.platform+' · '+sibling.output_type+
            (sibling.dispatched?' · already dispatched':
              sibling.scheduled?' · scheduled':
              sibling.held?' · held':' · not scheduled')+
            ' · publishing unchanged'));
        }
        section.append(linked);
        detail.append(section);
      }else if(saved.creative_group_error){
        const qaPending=session?.state==='approved'&&
          saved.factory_handoff_gate?.code==='WATERMARK_QA_REQUIRED';
        detail.append(elem('p',qaPending?
          'Sibling creative-master propagation is deferred while watermark QA is pending. V2 is still creatively approved and can receive a Factory creative decision or another revision. No sibling media or publishing was changed.':
          saved.creative_group_error+'. No automatic sibling changes were made.','rr-notice'));
      }
      const messages=Array.isArray(session?.messages)?session.messages:[];
      const last=messages.length?messages[messages.length-1]:null;
      const producer=[...messages].reverse().find(m=>m.role==='producer');
      const rendering=['queued','rendering','validating'].includes(session?.state);
      const planReady=session?.state==='plan_ready'&&session?.plan?.frozen===true&&
        Array.isArray(session.plan?.missing_assets)&&session.plan.missing_assets.length===0;
      // A separately validated, registered V2 must override stale Producer chatter.
      const completedAttempt=Array.isArray(session?.attempts)?
        session.attempts.find(a=>a?.id===session?.current_attempt_id&&
          Number(a?.number)>1&&a?.status==='ready_for_review'&&
          typeof a?.artifact_id==='string'&&a.artifact_id.length>0):null;
      const activity=elem('section',null,'rr-activity');
      activity.setAttribute('aria-label','Producer and render status');
      const title=completedAttempt&&session.state==='approved'?
        'V'+completedAttempt.number+(session.factory_review?.status==='accepted_pending_qa'?
          ' · Factory creative review accepted — QA pending':
          ' · Creatively approved — Factory review available'):
        completedAttempt&&session.state==='ready_for_review'?
        'V'+completedAttempt.number+' · Ready for review'+
        (completedAttempt.provenance?.kind==='manual_verified_review_import'?
          ' (verified imported edit)':''):
        rendering?'V'+(Number(session.latest_attempt_number)||2)+' · '+
        ({queued:'Queued for rendering',rendering:'Rendering',validating:'Validating'}[session.state]):
        planReady?'Revision plan ready · Make revised video to begin render':
        producer?'Producer replied · V2 NOT STARTED':
        messages.length?'Factory comments saved · Producer has not replied':'No saved messages';
      activity.append(elem('strong',title,'rr-activity-heading'));
      const lastActivityAt=completedAttempt?
        session.history?.[session.history.length-1]?.at:last?.at;
      if(lastActivityAt)activity.append(elem('p','Last saved: '+chicagoTime(lastActivityAt),'rr-activity-time'));
      if(!completedAttempt&&!rendering&&!planReady&&producer){
        activity.append(elem('p','The Producer responded, but no render-ready plan or V2 job exists. Chat messages do not queue a render.','rr-activity-detail'));
        const needs=session?.producer_candidate?.candidate?.requirements;
        if(Array.isArray(needs)&&needs.some(x=>x?.description)){
          const prompt=elem('div',null,'rr-activity-needs');
          prompt.append(elem('strong','Plan still needs these checks or answers:'));
          const list=elem('ul');
          for(const item of needs.filter(x=>x?.description).slice(0,3))list.append(elem('li',item.description));
          prompt.append(list);activity.append(prompt);
        }
      }
      appendRevisionProgress(activity,session,messages,producer,planReady,completedAttempt,entry,saved);
      detail.append(activity);
      if(messages.length){
        const history=elem('section',null,'rr-conversation-live');
        history.setAttribute('aria-label','Saved Producer messages with timestamps');
        history.append(elem('h3','Conversation · newest first'));
        const thread=elem('div',null,'rr-thread');
        for(const message of messages.slice(-30).reverse()){
          const row=elem('article',null,'rr-message');
          const head=elem('div',null,'rr-message-head');
          head.append(elem('strong',message.role==='producer'?'Producer':'You'));
          const time=elem('time',chicagoTime(message.at),'rr-message-time');
          if(typeof message.at==='string')time.dateTime=message.at;
          head.append(time);
          row.append(head,elem('p',message.content||''));thread.append(row);
        }
        history.append(thread);detail.append(history);
      }
      const attempts=Array.isArray(session?.attempts)?session.attempts:[];
      const storyboard=Array.isArray(saved.storyboard)?saved.storyboard:[];
      if(['queued','rendering','validating','revision_failed'].includes(session?.state)){
        const version='V'+(Number(session.latest_attempt_number)||2);
        const phase={
          queued:'Queued for rendering',
          rendering:'Rendering your revised video',
          validating:'Checking your revised video',
          revision_failed:'The render needs attention'
        }[session.state];
        detail.append(elem('p',version+' · '+phase,'rr-review-progress'));
      }
      const nightRows=storyboard.filter(frame=>frame?.original?.time_of_day==='Night');
      const unresolvedNight=nightRows.filter(frame=>
        !frame.changed||frame.proposed?.time_of_day==='Night');
      const plan=session?.plan;
      const ready=plan?.frozen===true&&Array.isArray(plan.missing_assets)&&
        plan.missing_assets.length===0&&!!plan.immutable_manifest&&
        session.state==='plan_ready'&&session.review_hold?.active===true&&
        saved.publication_hold_verified===true&&
        saved.flags?.attempt_commit_enabled===true&&
        session.producer_candidate?.stale!==true;
      if(ready){
        const nextVersion=Math.max(1,...attempts.map(a=>Number(a?.number)||1))+1;
        const proposal=elem('section',null,'rr-next-step');
        proposal.append(elem('strong','Your Producer','rr-producer-label'));
        const bothNightReplaced=nightRows.length>=2&&unresolvedNight.length===0&&
          nightRows.every(frame=>frame.changed&&frame.proposed?.time_of_day!=='Night');
        proposal.append(elem('p',bothNightReplaced?
          'I found daytime replacements for the nighttime images. I can make V'+nextVersion+
          ' with the changes we discussed. Would you like me to create it?':
          'I have the changes ready for V'+nextVersion+'. Would you like me to make the new video?'));
        const make=actionButton('Make the revised video (V'+nextVersion+')',async()=>{
          if(!window.confirm('Create V'+nextVersion+' for your review? It will not be published.'))return;
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
          say('V'+receipt.attempt_number+' is being made. It will appear here when ready.');
          await open(entry);
        });
        make.classList.add('rr-primary-render');
        proposal.append(make);
        detail.append(proposal);
      }
      // Show the Producer's creative suggestion in plain language, not the
      // internal distinction between an unsaved draft and a render manifest.
      // This message is grounded in source images from the held, verified
      // storyboard. Neither previewing nor typing implicitly edits a plan.
      // All photo-specific feedback is handled by the shared composer below.
      // The photo storyboard below remains visible. The single shared
      // conversation composer appears immediately after the photo suggestions,
      // so the reviewer can always comment on the precise proposed frames.
      if(storyboard.length){
        const changedRows=storyboard.filter(frame=>frame.changed===true);
        const availableMorning=storyboard.map(frame=>frame?.original).find(source=>
          source?.time_of_day==='Morning'&&/riverwalk/i.test(source.name||'')&&
          typeof source.preview_url==='string'&&source.preview_url.length>0);
        const toShow=[...new Map([...nightRows,...changedRows].map(r=>[r.scene,r])).values()]
          .sort((a,b)=>a.scene-b.scene);
        if(toShow.length){
          const section=elem('section',null,'rr-proposal-storyboard');
          section.append(elem('h3','Take a look at these photos'));
          if(rendering)section.append(elem('p',
            'These photos are previews of the plan already queued for V'+
            (Number(session.latest_attempt_number)||2)+
            '. New image suggestions can be saved below for a later version, but cannot change this in-flight job.',
            'rr-review-progress'));
          for(const frame of toShow){
            const item=elem('div',null,'rr-storyboard-row');
            const time=Number(frame.start_seconds).toFixed(2)+'–'+Number(frame.end_seconds).toFixed(2)+'s';
            item.append(elem('h4','Frame '+frame.scene+' · '+time));
            const pair=elem('div',null,'rr-storyboard-pair');
            const imageCard=(heading,photo)=>{
              const block=elem('div',null,'rr-storyboard-still');
              block.append(elem('strong',heading));
              if(photo?.preview_url){
                const im=elem('img');
                im.src=photo.preview_url;
                im.alt=(photo.name||'Studio still')+' ('+(photo.time_of_day||'unknown daypart')+')';
                im.loading='lazy';
                block.append(im);
              }
              block.append(elem('p',(photo?.name||'Not verified')+
                ' · '+(photo?.time_of_day||'Unknown'),'rr-muted'));
              return block;
            };
            const suggested=frame.original.time_of_day==='Night'&&
              (!frame.changed||frame.proposed?.time_of_day==='Night')&&
              availableMorning&&frame.original.name!==availableMorning.name?
              availableMorning:null;
            pair.append(imageCard('Original photo',frame.original),
              imageCard(suggested?'Suggested morning photo':
                !frame.proposed_ready?'Replacement not found yet':
                frame.changed?'Suggested replacement':
                'Original photo',suggested||frame.proposed));
            item.append(pair);
            if(frame.original.time_of_day==='Night'&&
               (!frame.changed||frame.proposed?.time_of_day==='Night')){
              if(!suggested){
                item.append(elem('p','I still need a suitable replacement for this shot.','rr-v1-warning'));
              }
            }
            section.append(item);
          }
          detail.append(section);
        }
      }
      // Feedback during a held render is saved as a user note for the NEXT
      // creative revision. It cannot edit, cancel, or implicitly retry the
      // immutable job that has already been authorized.
      // One continuous conversation field: discussing, plan-ready, in-flight,
      // validation and completed V2 review all accept reviewer comments.
      // Saving text NEVER calls the Producer, freezes a plan or queues a job.
      const discussionStates=['ready_for_review','discussing','awaiting_assets',
        'plan_ready','revision_failed'];
      const inFlight=rendering&&!!session.active_job?.id;
      const mayComment=saved.flags?.producer_conversation_enabled===true&&
        session.review_hold?.active===true&&
        (discussionStates.includes(session.state)||inFlight);
      if(mayComment){
        const recentProducerIndex=messages.findLastIndex(m=>m.role==='producer');
        const outstanding=messages.slice(recentProducerIndex+1).filter(m=>m.role==='user');
        const latestDirection=outstanding.map(m=>m.content||'').filter(Boolean)
          .join('\n').slice(-3000);
        const section=elem('section',null,'rr-next-revision-comments rr-producer-chat-primary');
        section.setAttribute('aria-label','Producer conversation and next edit authorization');
        section.append(elem('h3',inFlight?
          'Comment on the photos for the next revision':'Talk to your Producer'));
        section.append(elem('p',inFlight?
          'Current V'+(Number(session.latest_attempt_number)||2)+
          ' is already queued or rendering. New feedback is saved for the next version; this job will not be changed or restarted.':
          'Save your photo, narration or scene comments first. Nothing changes until you explicitly select Make edits based on the latest feedback. Rendering requires another separate confirmation.',
          'rr-muted'));
        const composer=elem('textarea');
        composer.rows=4;composer.maxLength=3000;
        composer.setAttribute('aria-label','Feedback and photo suggestions for Producer');
        composer.placeholder='For example: Use a different image for frame 3, keep frame 2, and update the narration to match.';
        composer.value=state.nextRevisionDrafts.get(entry.output_id)||'';
        composer.addEventListener('input',()=>
          state.nextRevisionDrafts.set(entry.output_id,composer.value));
        section.append(composer);
        const message=elem('p','','rr-feedback-status');
        message.hidden=true;message.setAttribute('role','status');
        message.setAttribute('aria-live','polite');
        const save=elem('button','Save feedback (no edits or render)','secondary-button');
        save.type='button';
        save.addEventListener('click',async()=>{
          if(state.actionBusy)return;
          const content=String(composer.value||'').trim();
          if(!content){message.hidden=false;message.dataset.state='error';
            message.textContent='Enter your photo or narration feedback before saving.';return;}
          const identity=entry.output_id+':'+content;
          if(!state.nextRevisionKeys.has(identity))
            state.nextRevisionKeys.set(identity,safeRequestId());
          state.actionBusy=true;save.disabled=true;
          message.hidden=false;message.dataset.state='working';
          message.textContent='Saving your comments only. No edit or render will start.';
          try{
            const result=await post('/api/rendering-review/outputs/'+
              encodeURIComponent(entry.output_id)+
              (inFlight?'/next-revision-feedback':'/review-feedback'),{
              content,expected_version:session.version,
              client_request_id:state.nextRevisionKeys.get(identity),
            });
            if(result.ok!==true||result.review_hold_active!==true||
               !Number.isSafeInteger(result.session_version)||result.message_count<1)
              throw new Error('Comments were not independently verified as saved.');
            state.nextRevisionDrafts.delete(entry.output_id);
            state.nextRevisionKeys.delete(identity);
            state.lastReplyNotice={outputId:entry.output_id,message:
              inFlight?'Your comments are saved for the next version. The current render remains unchanged.':
              'Your comments are saved. Select Make edits based on the latest feedback when you want the Producer to prepare changes; nothing has been rendered.'};
            say('Feedback saved. No edits or render started.');
            await open(entry);
          }catch(error){
            state.nextRevisionDrafts.set(entry.output_id,content);
            message.hidden=false;message.dataset.state='error';
            message.textContent='Feedback save could not be verified: '+
              (error?.message||'Status unavailable')+
              '. Your text is retained. Check the latest status before retrying.';
            say('Feedback not confirmed saved.',true);
          }finally{
            state.actionBusy=false;save.disabled=false;
          }
        });
        section.append(save,message);
        const edit=actionButton('Make edits based on the latest feedback',async()=>{
          // This is a separate, deliberate action. Even when it succeeds, its
          // only effect is a Producer response / candidate and a saved plan;
          // the actual render needs the distinct Make revised video action.
          if(!latestDirection)throw new Error('Save your feedback before requesting edits.');
          if(!window.confirm('Ask the Producer to prepare changes based on your saved feedback? This will NOT render or publish a video.'))return;
          const key=entry.output_id+':'+session.version+':'+latestDirection;
          if(!state.editRequestKeys.has(key))state.editRequestKeys.set(key,safeRequestId());
          const created=await post('/api/rendering-review/outputs/'+
            encodeURIComponent(entry.output_id)+'/producer-conversation',{
            direction:latestDirection,expected_version:session.version,
            client_request_id:state.editRequestKeys.get(key),
          });
          if(created.persisted!==true||created.render_queued!==false)
            throw new Error('Producer changes could not be confirmed. No render started.');
          state.editRequestKeys.delete(key);
          state.lastReplyNotice={outputId:entry.output_id,message:
            created.plan_ready&&created.plan_persisted?
            'Producer prepared the revised plan. Review the changes; a separate render confirmation is required.':
            'Producer responded to the latest saved feedback. Continue discussing or resolving requirements. No render started.'};
          say('Producer edits prepared. No render started.');
          await open(entry);
        },null);
        edit.classList.add('rr-primary-render');
        edit.disabled=inFlight||!latestDirection;
        edit.title=inFlight?'Available after the current V2 finishes and you review it.':
          !latestDirection?'Save new feedback before requesting changes.':
          'Prepare edits and a plan only; render authorization is separate.';
        section.append(elem('p',inFlight?
          'Make edits based on the latest feedback becomes available after this render finishes.':
          latestDirection?'Saved feedback is awaiting your explicit edit instruction.':
          'No unprocessed feedback is saved. You can keep discussing before requesting edits.',
          'rr-muted'),edit);
        detail.append(section);
      }
      if(attempts.length>1){
        const heading=elem('h3','Video versions');detail.append(heading);
        const picker=elem('div',null,'rr-attempts');
        for(const attempt of attempts){
          const statusText='Version V'+attempt.number+' · '+String(attempt.status||'unknown').replace(/_/g,' ');
          const media=attemptMedia(attempt,entry);
          const playable=attempt.status==='ready_for_review'&&!!media;
          const button=actionButton(statusText,async()=>{
            if(!playable)throw new Error('This attempt is not yet a verified, playable render');
            if(!showMedia(media,'V'+attempt.number,attempt.number))
              throw new Error('This attempt has no supported HTTPS media URL');
            say('Viewing version V'+attempt.number+'.');
          });
          button.disabled=!playable;
          picker.append(button);
        }
        detail.append(picker);
        const newest=attempts.filter(a=>a.status==='ready_for_review'&&a.artifact_id)
          .sort((a,b)=>Number(b.number)-Number(a.number))[0];
        if(newest?.number>1)showMedia(attemptMedia(newest,entry),'V'+newest.number,newest.number);
      }
      if(session?.state==='approved'){
        const approved=attempts.find(a=>a.id===session.approved_attempt_id);
        const version='V'+(approved?.number||session.latest_attempt_number||2);
        const gate=saved.factory_handoff_gate;
        const transferred=gate?.status==='transferred'&&
          session.factory_handoff?.attempt_id===session.approved_attempt_id &&
          session.review_hold?.active===false;
        const notice=transferred?
          version+' creatively approved and transferred to Factory. Normal approval is still required.':
          version+' creatively approved. Factory transfer is '+(
            gate?.status==='blocked'?'blocked by media QA.':
            gate?.status==='unavailable'?'awaiting a reliable QA record.':
            gate?.status==='ready'?'ready to complete.':'not yet verified.');
        detail.append(elem('p',notice+' No Instagram publication has been authorized.','rr-notice'));
        if(!transferred){
          if(gate?.message){
            const reason=elem('p',gate.message,'rr-feedback-receipt');
            reason.setAttribute('role','status');
            detail.append(reason);
          }
          if(gate?.status==='ready'){
            // This resumes only the saved creative acceptance. It does not
            // submit another approval, authorize a render, or publish.
            const transfer=elem('button','Complete Factory transfer (no publishing)','secondary-button');
            transfer.type='button';
            const feedback=elem('p','','rr-feedback-status');
            feedback.hidden=true;
            feedback.setAttribute('role','status');
            feedback.setAttribute('aria-live','polite');
            transfer.addEventListener('click',async()=>{
              if(state.actionBusy)return;
              state.actionBusy=true;
              transfer.disabled=true;
              transfer.setAttribute('aria-busy','true');
              feedback.hidden=false;feedback.dataset.state='working';
              feedback.textContent='Verifying V2 and completing the protected Factory handoff…';
              try{
                const result=await post('/api/rendering-review/outputs/'+
                  encodeURIComponent(entry.output_id)+'/factory-handoff',{});
                if(result.factory_ready!==true||result.review_hold_active!==false||
                   result.approved_for_publishing!==false)
                  throw new Error('Factory handoff readback was not verified');
                feedback.dataset.state='success';
                feedback.textContent='V2 transferred. Factory approval is still required; nothing was published.';
                say('V2 is back in Factory for approval.');
                await open(entry);
              }catch(error){
                feedback.dataset.state='error';
                feedback.textContent='Factory transfer did not complete: '+
                  (error?.message||'Status unavailable')+
                  '. Your creative approval remains saved; check status before retrying.';
                say('Factory handoff needs attention; creative approval remains saved.',true);
              }finally{
                state.actionBusy=false;
                transfer.removeAttribute('aria-busy');
                transfer.disabled=false;
              }
            });
            detail.append(transfer,feedback);
          }
          // QA is a delivery check, not a prerequisite to asking Producer for
          // another creative pass. Keep the original held output unpublished.
          if(session.review_hold?.active===true&&saved.publication_hold_verified===true){
            const redo=elem('section',null,'rr-chat-form rr-producer-chat-primary');
            redo.append(elem('strong','Need another version?','rr-producer-label'));
            redo.append(elem('p','You can request another creative redo even while watermark verification is pending. This does not publish or start a render.','rr-muted'));
            const direction=elem('textarea');
            direction.rows=3;direction.maxLength=3000;
            direction.setAttribute('aria-label','Instructions for another creative revision');
            direction.value=state.nextRevisionDrafts.get(entry.output_id)||
              'Redo this version while keeping the approved creative changes.';
            direction.addEventListener('input',()=>
              state.nextRevisionDrafts.set(entry.output_id,direction.value));
            redo.append(direction);
            const notice=elem('p','','rr-feedback-status');
            notice.hidden=true;notice.setAttribute('role','status');
            notice.setAttribute('aria-live','polite');
            let pendingKey='',pendingNote='';
            const send=elem('button','Make edits based on the latest feedback','secondary-button');
            send.type='button';
            send.addEventListener('click',async()=>{
              if(state.actionBusy)return;
              const note=String(direction.value||'').trim();
              if(!note){notice.hidden=false;notice.dataset.state='error';notice.textContent='Enter your requested revision.';return;}
              if(note!==pendingNote){pendingNote=note;pendingKey=safeRequestId();}
              state.actionBusy=true;send.disabled=true;
              send.setAttribute('aria-busy','true');
              notice.hidden=false;notice.dataset.state='working';
              notice.textContent='Saving your revision request under the existing publication hold…';
              try{
                const result=await post('/api/rendering-review/outputs/'+
                  encodeURIComponent(entry.output_id)+'/request-redo',{
                  expected_version:session.version,client_request_id:pendingKey,note,
                });
                if(result.redo_requested!==true||result.review_hold_active!==true||
                   result.render_queued!==false||result.public_post_created!==false)
                  throw new Error('The held creative revision receipt was not verified');
                notice.dataset.state='success';
                notice.textContent='Redo requested. Continue with Producer; no render or publication started.';
                pendingKey='';pendingNote='';
                state.nextRevisionDrafts.delete(entry.output_id);
                say('Redo direction saved under the existing hold. No render started.');
                await open(entry);
              }catch(error){
                notice.dataset.state='error';
                notice.textContent='Redo request status: '+(error?.message||'Not verified')+
                  '. Check the saved conversation before retrying.';
              }finally{
                state.actionBusy=false;send.disabled=false;send.removeAttribute('aria-busy');
              }
            });
            redo.append(send,notice);
            detail.append(redo);
          }
          detail.append(actionButton('Recheck QA / Factory status',async()=>{await open(entry);}));
        }
      }
      if(session?.state==='ready_for_review'&&
         saved.flags?.creative_approval_enabled===true&&
         saved.publication_hold_verified===true){
        const current=attempts.find(a=>a.id===session.current_attempt_id);
        if(current?.status==='ready_for_review'&&attemptMedia(current,entry)){
          const approvalKey=entry.output_id+':'+current.id;
          const approval=elem('button','Approve selected version','secondary-button');
          approval.type='button';
          approval.dataset.approvalKey=approvalKey;
          const approvalStatus=elem('p','','rr-feedback-status');
          approvalStatus.hidden=true;
          approvalStatus.setAttribute('role','status');
          approvalStatus.setAttribute('aria-live','polite');
          approval.addEventListener('click',async()=>{
            if(state.actionBusy||state.approvalLocks.has(approvalKey))return;
            if(state.viewingVersion!==Number(current.number)){
              say('Select V'+current.number+' before approving this version.',true);
              return;
            }
            const versionNumber=Number(current.number);
            if(!window.confirm('Approve selected version V'+versionNumber+'?\n\n'+
              'Select OK to approve V'+versionNumber+', or Cancel to choose a different version.\n\n'+
              'This does not publish, upload, or release the publication hold.'))return;
            if(state.viewingVersion!==versionNumber)
              throw new Error('Version selection changed; select V'+versionNumber+' again before approving.');
            if(state.actionBusy||state.approvalLocks.has(approvalKey))return;
            state.actionBusy=true;
            state.approvalLocks.add(approvalKey);
            approval.textContent='Approving V'+versionNumber+'…';
            approval.setAttribute('aria-busy','true');
            approvalStatus.hidden=false;
            approvalStatus.dataset.state='working';
            approvalStatus.textContent='Approving V'+versionNumber+' and moving it to Factory…';
            syncSelectedApproval();
            try{
              if(!state.approvalKeys.has(approvalKey))
                state.approvalKeys.set(approvalKey,safeRequestId());
            const result=await post('/api/rendering-review/outputs/'+
              encodeURIComponent(entry.output_id)+'/approve',{
              expected_version:session.version,attempt_id:current.id,
              client_request_id:state.approvalKeys.get(approvalKey),
            });
            if(result.accepted!==true||
               result.publication_changed!==false||
               result.instagram_upload_created!==false)
              throw new Error('Creative acceptance receipt not verified');
            if(result.factory_ready!==true){
              approval.textContent='V'+versionNumber+' creatively approved';
              approvalStatus.dataset.state='success';
              approvalStatus.textContent='V'+versionNumber+
                ' creatively approved and preserved. Final Factory transfer still needs verification. '+ 
                'You can request another creative revision regardless of watermark status. Nothing was published.';
              say('Creative approval saved; Factory delivery QA is still pending.');
              await open(entry);
              return;
            }
            if(result.factory_handoff?.factory_ready!==true||
               result.review_hold_active!==false)
              throw new Error('Factory handoff readback not verified');
            approval.textContent='V'+versionNumber+' approved — in Factory';
            approvalStatus.dataset.state='success';
            approvalStatus.textContent='V'+versionNumber+
              ' approved and transferred to Factory. Continue there for normal approval and scheduling. Nothing was published.';
            say('V'+versionNumber+' approved and ready in Factory.');
            }catch(error){
              approval.textContent='V'+versionNumber+' approval status needs checking';
              approvalStatus.dataset.state='error';
              approvalStatus.textContent='Could not confirm the final response: '+
                (error?.message||'Status unavailable')+
                '. Approval may have completed. Check Factory or refresh this review; do not approve again.';
              say('Approval status requires verification. Do not approve again.',true);
            }finally{
              state.actionBusy=false;
              approval.removeAttribute('aria-busy');
              syncSelectedApproval();
            }
          });
          state.approvalButton=approval;
          state.approvalVersion=Number(current.number);
          syncSelectedApproval();
          detail.append(approval,approvalStatus);
        }
      }
      if(['queued','rendering','validating'].includes(session?.state)){
        detail.append(elem('p','Attempt '+session.latest_attempt_number+' · '+
          ({queued:'Queued for isolated renderer',rendering:'Rendering',validating:'Validating media'}[session.state])+
          '. No Instagram publication has been authorized.','rr-notice'));
        detail.append(actionButton('Check render status',async()=>{await open(entry);}));
      }
      if(plan){
        const technical=elem('details',null,'rr-plan-details');
        technical.append(elem('summary','Technical details (optional)'));
        appendLine(technical,'Plan status:',ready?'Ready':
          plan.frozen&&plan.missing_assets?.length===0?
          'Saved; render action unavailable':'Additional details needed');
        appendLine(technical,'Plan revision:',plan.version);
        if(Array.isArray(plan.acceptance_checks)){
          for(const check of plan.acceptance_checks.slice(0,10))
            technical.append(elem('p','Acceptance check: '+String(check),'rr-muted'));
        }
        if(Array.isArray(plan.missing_assets)&&plan.missing_assets.length)
          technical.append(elem('p',plan.missing_assets.length+' items need attention before making V2.','rr-notice'));
        detail.append(technical);
      }
      const candidate=session?.producer_candidate;
      if(candidate?.candidate){
        const heading=elem('h3','Suggested changes');detail.append(heading);
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
      watchReview(entry,reviewSignature(session),seq);

    }catch(err){
      if(seq===state.request && state.selected===entry.output_id){
        if(topProgress){
          const prior=state.lastVerifiedSummary?.outputId===entry.output_id?
            ' Last verified: '+state.lastVerifiedSummary.summary:'';
          topProgress.textContent='Latest status unavailable; no change can be confirmed.'+prior;
          topProgress.hidden=false;
        }
        if(err.status!==404)detail.append(elem('p','Saved review detail could not be verified: '+err.message,'rr-notice'));
      }
    }
  }
  async function load(next=false){
    if(state.busy||!root.classList.contains('active'))return;
    if(!next && state.lastLoad && Date.now()-state.lastLoad<30000)return;
    const current=++state.request;
    state.busy=true;refresh.disabled=true;more.disabled=true;
    say(next?'Loading more Factory-submitted reviews…':'Loading Factory-submitted reviews…');
    try{
      const query=new URLSearchParams({profile_id:chicago});
      if(next && state.cursor)query.set('cursor',state.cursor);
      const data=await get('/api/rendering-review/queue?'+query.toString());
      if(current!==state.request)return;
      if(data.flags?.automatic_sampling_percent!==0 ||
         typeof data.flags?.admission_enabled!=='boolean' ||
         typeof data.flags?.producer_conversation_enabled!=='boolean')
        throw new Error('Unsafe Post Production Edits feature configuration; rendering queue withheld');
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
      say('Factory-submitted reviews · Chicago Instagram Reels · '+state.records.length+' loaded');
      renderList();
      if(!state.selected && state.records.length)open(state.records[0]);
    }catch(error){
      say(error.message||'Post Production Edits is unavailable',true);
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
    else {cancelAttemptPoll();clearMedia();state.lastLoad=0;if(topProgress)topProgress.hidden=true;}
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
  async function openOutputById(outputId) {
    if(!/^rec[A-Za-z0-9]{14}$/.test(String(outputId||"")))
      throw new Error("A valid output is required");
    state.lastReplyNotice={outputId,message:
      "Your change request was received in Factory. Continue the conversation with your Producer here; no new render has been started."};
    state.lastLoad=0;
    state.selected='';
    nav.click();
    if(root.classList.contains('active'))await load(false);
    const entry=state.records.find(v=>v.output_id===outputId);
    if(entry)await open(entry);
    else say("Post Production Edits opened. Refresh to find the saved revision.",true);
  }
  window.StudioRenderingReview={load,openOutputById};
})();
