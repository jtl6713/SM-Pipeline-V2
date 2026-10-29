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
  const state = {busy:false,actionBusy:false,flags:{admission_enabled:false,producer_conversation_enabled:false,attempt_commit_enabled:false},records:[],cursor:null,selected:'',lastLoad:0,request:0,commitKeys:new Map(),pollTimer:null,activeEntry:null,lastReplyNotice:null,lastReplyNoticeNode:null};
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
  function clearMedia(){
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
    state.selected=entry.output_id;state.activeEntry=entry;renderList();clearMedia();
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
      const reviewNightOffer=entry.output_id==='rec0uVrVeiUM6shp9'&&
        nightRows.length===2&&unresolvedNight.length>0&&
        saved.publication_hold_verified===true;
      const reviewCanTalk=saved.flags?.producer_conversation_enabled===true&&
        ['ready_for_review','discussing','awaiting_assets','plan_ready','revision_failed'].includes(session?.state);
      if(!reviewNightOffer&&state.flags.producer_conversation_enabled===true &&
         ['ready_for_review','discussing','awaiting_assets','plan_ready','revision_failed'].includes(session.state)){
        const form=elem('div',null,'rr-chat-form rr-producer-chat-primary');
        const composer=elem('textarea');
        composer.placeholder='Tell me what you would like changed. Use your own words.';
        composer.rows=4;composer.maxLength=3000;
        composer.setAttribute('aria-label','Creative direction for Producer');
        form.append(elem('strong','Talk to your Producer','rr-producer-label'));
        form.append(elem('p','Want a different change? Just tell me what feels wrong.','rr-muted'));
        form.append(composer);
        const feedbackStatus=elem('p','','rr-feedback-status');
        feedbackStatus.hidden=true;
        feedbackStatus.setAttribute('role','status');
        feedbackStatus.setAttribute('aria-live','polite');
        let pendingKey='',pendingDirection='';
        const sendDirection=async content=>{
          content=String(content||'').trim();
          if(!content)throw new Error('Enter creative direction before sending');
          // Keep an idempotency key for a retry of the same direction. A lost
          // response must never create duplicate producer messages.
          if(content!==pendingDirection){
            pendingKey=safeRequestId();pendingDirection=content;
          }
          feedbackStatus.textContent='Checking the saved Reel and preparing a Producer response…';
          say('Your Producer is considering your changes…');
          const created=await post('/api/rendering-review/outputs/'+
            encodeURIComponent(entry.output_id)+'/producer-conversation',{
            direction:content,expected_version:session.version,
            client_request_id:pendingKey,
          });
          if(created.persisted!==true||created.render_queued!==false)
            throw new Error('Producer response was not confirmed saved. Your text is preserved for retry.');
          if(created.plan_ready===true&&created.plan_persisted===true){
            feedbackStatus.textContent='Your changes are ready. You can make the new video whenever you like.';
          }else if(Array.isArray(created.plan_blockers)&&created.plan_blockers.length){
            feedbackStatus.textContent='I need to check one more thing before making the video: '+
              created.plan_blockers.slice(0,3).map(x=>x.description).join(' / ');
          }else{
            feedbackStatus.textContent='Producer reply saved. You can continue refining it.';
          }
          feedbackStatus.classList.toggle('error-text',false);
          feedbackStatus.dataset.state='success';
          state.lastReplyNotice={outputId:entry.output_id,message:
            'Your message was saved. Review the Producer’s response and any proposed edits below.'};
          say('Producer response saved.');
          pendingDirection='';pendingKey='';
          await open(entry);
          if(typeof state.lastReplyNoticeNode?.scrollIntoView==='function')
            state.lastReplyNoticeNode.scrollIntoView({block:'nearest'});
        };
        form.append(feedbackStatus);
        form.append(actionButton('Send to Producer',async()=>{
          if(typeof composer.blur==='function')composer.blur();
          return sendDirection(composer.value);
        },feedbackStatus));
        detail.append(form);
      }
      if(reviewNightOffer){
        const offer=elem('section',null,'rr-night-fix');
        offer.append(elem('strong','Your Producer','rr-producer-label'));
        const morning=storyboard.map(frame=>frame?.original).find(photo=>
          photo?.time_of_day==='Morning'&&/riverwalk/i.test(photo.name||'')&&
          typeof photo.preview_url==='string'&&photo.preview_url.length>0);
        offer.append(elem('p',morning?
          'I found a morning Chicago Riverwalk photo that could replace both nighttime shots. '+
          'You can see it next to the originals below. Do these look right? '+
          'Tell me if you would prefer a different photo for either shot.':
          'I can see two nighttime shots. I haven\'t found a suitable verified daytime replacement yet. '+
          'Tell me which existing photo you would like me to try.'));
        if(reviewCanTalk){
          const conversation=elem('div',null,'rr-chat-form');
          const reply=elem('textarea');
          reply.rows=3;reply.maxLength=3000;
          reply.placeholder='For example: Yes, those look good. Or: Try a different photo for the first shot.';
          reply.setAttribute('aria-label','Reply to your Producer');
          conversation.append(reply);
          const feedback=elem('p','','rr-feedback-status');
          feedback.hidden=true;
          feedback.setAttribute('role','status');
          feedback.setAttribute('aria-live','polite');
          let pendingKey='',pendingReply='';
          conversation.append(feedback);
          conversation.append(actionButton('Reply to Producer',async()=>{
            // Dismiss the iPhone keyboard so both progress and the Producer
            // action remain visible while the request is processing.
            if(typeof reply.blur==='function')reply.blur();
            const direction=String(reply.value||'').trim();
            if(!direction)throw new Error('Tell your Producer what you think of these photos.');
            if(direction!==pendingReply){
              pendingReply=direction;pendingKey=safeRequestId();
            }
            const created=await post('/api/rendering-review/outputs/'+
              encodeURIComponent(entry.output_id)+'/producer-conversation',{
              direction,expected_version:session.version,client_request_id:pendingKey,
            });
            if(created.persisted!==true||created.render_queued!==false)
              throw new Error('I couldn\'t save your reply. Your words are still here so you can retry.');
            feedback.dataset.state='success';
            feedback.textContent='Your feedback is saved.';
            state.lastReplyNotice={outputId:entry.output_id,message:
              created.plan_ready&&created.plan_persisted?
                'Your photo choices were saved. Choose “Make the revised video” when the render button is available.':
                'Your message was saved. Review the Producer’s response below.'};
            pendingReply='';pendingKey='';
            say('Your Producer has your feedback.');
            await open(entry);
            if(typeof state.lastReplyNoticeNode?.scrollIntoView==='function')
              state.lastReplyNoticeNode.scrollIntoView({block:'nearest'});
          },feedback));
          offer.append(conversation);
        }
        detail.append(offer);
      }
      const messages=Array.isArray(saved.session?.messages)?saved.session.messages:[];
      if(messages.length){
        const history=elem('details',null,'rr-conversation-history');
        history.append(elem('summary','Previous conversation ('+messages.length+' messages)'));
        detail.append(history);
        const thread=elem('div',null,'rr-thread');
        for(const message of messages.slice(-30)){
          const line=elem('article',null,'rr-message');
          line.append(elem('strong',message.role==='user'?'You':'Producer'),
            elem('p',message.content||''));
          thread.append(line);
        }
        history.append(thread);
      }

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
  async function openFromFactory(outputId,message){
    if(!/^rec[A-Za-z0-9]{14}$/.test(String(outputId||"")))return;
    state.lastReplyNotice={
      outputId,message:String(message||
        "Your change request was saved. Continue with the Producer here."),
    };
    state.selected='';
    state.lastLoad=0;
    nav.click();
    if(root.classList.contains('active'))await load(false);
    const entry=state.records.find(row=>row.output_id===outputId);
    if(entry)await open(entry);
  }
  window.StudioRenderingReview={load,openFromFactory};
})();
