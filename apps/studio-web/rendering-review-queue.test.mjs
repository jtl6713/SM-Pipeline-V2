import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('./assets/rendering-review-queue.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./assets/rendering-review-queue.css',import.meta.url),'utf8');

test('dedicated Chicago review page and nav are opt-in protected surfaces',()=>{
  assert.match(html,/<button[^>]*id="navRenderingReview"[^>]*hidden/);
  assert.match(html,/<section id="page-rendering-review" class="page"/);
  assert.match(html,/id="rrVideo"[^>]*controls playsinline/);
  assert.match(html,/id="rrQueueList"/);
  assert.match(html,/id="rrMore"/);
  assert.match(html,/rendering-review-queue\.js/);
  assert.match(html,/rendering-review-queue\.css/);
  assert.match(html,/Previewing never enrolls an output or publishes it/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.doesNotMatch(html,/id="rr(?:Submit|Approve|Publish|Commit|Release)"/);
  assert.match(script,/method:'POST'/);
  assert.doesNotMatch(script,/method:\s*['"](?:PATCH|PUT|DELETE)['"]/);
});
class Node {
  constructor(tag='div'){
    this.tag=tag;this.dataset={};this.children=[];this.listeners={};
    this.attrs={};this.textContent='';this.className='';this.hidden=false;this.disabled=false;
    this.classes=new Set();
    this.classList={
      add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),
      contains:k=>this.classes.has(k),toggle:(k,on)=>{
        if(on===undefined)on=!this.classes.has(k);
        if(on)this.classes.add(k);else this.classes.delete(k);
      },
    };
  }
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(k,v){this.attrs[k]=v;}
  removeAttribute(k){delete this.attrs[k];}
  addEventListener(k,fn){this.listeners[k]=fn;}
  pause(){}
  load(){}
  insertAdjacentElement(_position,node){this.inserted=node;}
  remove(){this.removed=true;}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('queue UI does not write, respects Chicago scope, and renders a safe original preview',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(k=>[k,new Node(k)]));
  const requests=[];
  let notify;
  const fetchStub=async (url,options)=>{
    requests.push({url,options});
    if(url==='/api/session')return {ok:true,json:async()=>({
      ok:true,authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,flags:{admission_enabled:false,producer_conversation_enabled:false,automatic_sampling_percent:0},
      queue:[{output_id:'recA1B2C3D4E5F6G7',profile_id:'recT2rbKX3MF7cVFU',
        output_type:'Instagram Reel',manual_admission_enabled:false,output_number:54,
        title:'Chicago test reel',render_status:'Rendered',review_held:false,
        final_file_url:'https://example.org/preview.mp4'}],next_cursor:null})};
    throw new Error('Unexpected request: '+url);
  };
  const sandbox={
    document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},
    window:{location:{href:'https://studio.test/'},CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''}},
    MutationObserver:class {constructor(cb){notify=cb;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  await tick();await tick();
  assert.equal(nodes.navRenderingReview.hidden,false);
  nodes['page-rendering-review'].classList.add('active');
  notify();
  for(let i=0;i<10;i++)await tick();
  assert.match(nodes.rrStatus.textContent,/Factory-submitted reviews · Chicago Instagram Reels/);
  assert.equal(nodes.rrQueueList.children.length,1);
  assert.equal(nodes.rrOpenFile.href,'https://studio.test/api/outputs/recA1B2C3D4E5F6G7/preview');
  assert.equal(nodes.rrVideo.src,'https://studio.test/api/outputs/recA1B2C3D4E5F6G7/preview');
  assert.equal(nodes.rrMore.hidden,true);
  assert.equal(nodes.rrCount.textContent,'1 results loaded');
  assert.equal(requests.length,2);
  assert.ok(requests.every(v=>v.options.method==='GET'));
  assert.match(requests[1].url,/profile_id=recT2rbKX3MF7cVFU/);
});


test('review notes are saved separately and only explicit Make edits asks Producer',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const calls=[];let notify,version=1,savedNote='',conversation=false;
  const output='recA1B2C3D4E5F6G7';
  const saved=()=>({ok:true,publication_hold_verified:true,
    flags:{producer_conversation_enabled:true,attempt_commit_enabled:false},
    session:{version,state:'discussing',review_hold:{active:true},
      latest_attempt_number:1,
      attempts:[{id:'attemptv1',number:1,status:'ready_for_review'}],
      messages:[...(savedNote?[{role:'user',content:savedNote,at:'2026-11-01T17:00:00Z'}]:[]),
        ...(conversation?[{role:'producer',content:'I will adjust the narration',at:'2026-11-01T17:01:00Z'}]:[])],
      producer_candidate:conversation?{candidate:{narration:'Updated script',changes:[],requirements:[]}}:null}});
  const fetchStub=async(url,opts)=>{
    calls.push({url,method:opts.method,body:opts.body});
    if(url==='/api/session')return {ok:true,json:async()=>({ok:true,authenticated:true,authorized:true,
      permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,flags:{admission_enabled:false,producer_conversation_enabled:true,automatic_sampling_percent:0},
      queue:[{output_id:output,profile_id:'recT2rbKX3MF7cVFU',output_type:'Instagram Reel',
        output_number:54,title:'Review',review_held:true,final_file_url:'https://example.org/v1.mp4'}],
      next_cursor:null})};
    if(url==='/api/rendering-review/outputs/'+output)return {ok:true,json:async()=>saved()};
    if(url.endsWith('/review-feedback')){
      const body=JSON.parse(opts.body);assert.equal(body.expected_version,1);
      savedNote=body.content;version=2;
      return {ok:true,json:async()=>({ok:true,review_hold_active:true,
        session_version:version,message_count:1})};
    }
    if(url.endsWith('/producer-conversation')){
      const body=JSON.parse(opts.body);assert.equal(body.expected_version,2);
      assert.equal(body.direction,'Explain step by step');
      conversation=true;version=3;
      return {ok:true,json:async()=>({ok:true,persisted:true,render_queued:false})};
    }
    throw Error('Unexpected '+url);
  };
  const sandbox={
    document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},
    window:{location:{href:'https://studio.test/'},CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''}},
    MutationObserver:class{constructor(fn){notify=fn;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
    crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  for(let i=0;i<5;i++)await tick();
  nodes['page-rendering-review'].classList.add('active');notify();
  for(let i=0;i<10;i++)await tick();
  const descendants=root=>[root,...root.children.flatMap(descendants)];
  let all=descendants(nodes.rrDetail);
  const input=all.find(n=>n.tag==='textarea'&&n.attrs['aria-label']==='Creative direction for Producer');
  const save=all.find(n=>n.tag==='button'&&n.textContent==='Save comment (no edits yet)');
  const apply=all.find(n=>n.tag==='button'&&n.textContent==='Make edits based on the latest feedback');
  assert.ok(input&&save&&apply);
  assert.equal(calls.filter(x=>x.method==='POST').length,0,'read must be inert');
  assert.equal(apply.disabled,true,'no saved feedback');
  input.value='Explain step by step';input.listeners.input();
  await save.listeners.click();
  for(let i=0;i<8;i++)await tick();
  assert.equal(conversation,false,'saving comments must not invoke Producer');
  assert.equal(calls.filter(x=>x.method==='POST').length,1);
  assert.ok(calls.some(x=>x.url.endsWith('/review-feedback')));
  all=descendants(nodes.rrDetail);
  const applyNow=all.find(n=>n.tag==='button'&&n.textContent==='Make edits based on the latest feedback');
  assert.equal(applyNow.disabled,false);
  await applyNow.listeners.click();
  for(let i=0;i<8;i++)await tick();
  assert.equal(conversation,true);
  assert.equal(calls.filter(x=>x.method==='POST').length,2);
  assert.ok(calls.some(x=>x.url.endsWith('/producer-conversation')));
  assert.ok(!calls.some(x=>/commit-attempt|publish|approve|\/enroll/.test(x.url)));
  assert.ok(descendants(nodes.rrDetail).some(n=>/I will adjust the narration/.test(n.textContent)));
});

test('real Drive /view source uses the authenticated Studio MP4 stream, not a Google iframe',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const source='https://drive.google.com/file/d/1CAh-mGGiCiv7WKUl9jNeqm1vyQF7PTzq/view';
  let activate;
  const fetchStub=async url=>{
    if(url==='/api/session')return {ok:true,json:async()=>({
      authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,flags:{admission_enabled:false,producer_conversation_enabled:false,
        attempt_commit_enabled:false,automatic_sampling_percent:0},
      queue:[{output_id:'recA1B2C3D4E5F6G7',profile_id:'recT2rbKX3MF7cVFU',
        output_type:'Instagram Reel',output_number:9192,title:'Bridge Houses Close-Up',
        review_held:false,dispatch_started:false,final_file_url:source}],
      next_cursor:null})};
    throw Error('Unexpected '+url);
  };
  const sandbox={
    document:{getElementById:id=>nodes[id],createElement:tag=>{
      const n=new Node(tag);n.style={};return n;
    }},
    window:{location:{href:'https://studio.test/'},CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''}},
    MutationObserver:class{constructor(cb){activate=cb;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  await tick();await tick();
  nodes['page-rendering-review'].classList.add('active');activate();
  for(let i=0;i<10;i++)await tick();
  assert.equal(nodes.rrVideo.hidden,false,'Native Studio video is visible');
  assert.equal(nodes.rrVideo.inserted,undefined,'No Google Drive iframe inserted');
  assert.equal(nodes.rrVideo.src,'https://studio.test/api/outputs/recA1B2C3D4E5F6G7/preview');
  assert.equal(nodes.rrOpenFile.href,nodes.rrVideo.src);
});

test('frozen render-only plan requires server availability and one explicit button, not chat text',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const output='recA1B2C3D4E5F6G7',hash='a'.repeat(64);
  let activate,enabled=false,confirmed=0,commits=0,receiptBody=null;
  const fetchStub=async (url,options)=>{
    if(url==='/api/session')return {ok:true,json:async()=>({
      authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,flags:{admission_enabled:false,producer_conversation_enabled:false,
        attempt_commit_enabled:enabled,automatic_sampling_percent:0},
      queue:[{output_id:output,profile_id:'recT2rbKX3MF7cVFU',
        output_type:'Instagram Reel',output_number:54,title:'Manual pilot',
        review_held:true,final_file_url:'https://media.example.test/source.mp4'}],
      next_cursor:null})};
    if(url==='/api/rendering-review/outputs/'+output)return {ok:true,json:async()=>({
      ok:true,publication_hold_verified:true,flags:{attempt_commit_enabled:enabled},
      session:{
        version:4,state:'plan_ready',review_hold:{active:true},messages:[],
        attempts:[{number:1,status:'ready_for_review',artifact_id:'drive-source-artifact'}],
        producer_candidate:{stale:false},
        plan:{version:1,hash,frozen:true,missing_assets:[],immutable_manifest:{
          allow_public_publish:false,allow_platform_upload:false},
          acceptance_checks:['Narration clearer']},
      }})};
    if(url.endsWith('/commit-attempt')){
      commits++;receiptBody=JSON.parse(options.body);
      return {ok:true,json:async()=>({ok:true,hold_active:true,
        attempt_id:'rrattempt-example123',job_id:'rrjob-example123',
        attempt_number:2,public_post_created:false})};
    }
    throw Error('Unexpected '+url);
  };
  const sandbox={
    document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},
    window:{location:{href:'https://studio.test/'},confirm:()=>{confirmed++;return true;},
      CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''}},
    MutationObserver:class{constructor(cb){activate=cb;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
    crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  await tick();await tick();
  nodes['page-rendering-review'].classList.add('active');activate();
  for(let i=0;i<10;i++)await tick();
  const descendants=node=>[node,...node.children.flatMap(descendants)];
  assert.equal(descendants(nodes.rrDetail).filter(n=>
    n.textContent==='Make the revised video (V2)').length,0,
    'No commit action when protected server gate is disabled');
  enabled=true;await nodes.rrRefresh.listeners.click();
  for(let i=0;i<12;i++)await tick();
  const action=descendants(nodes.rrDetail).find(n=>
    n.textContent==='Make the revised video (V2)');
  assert.ok(action,'Server-approved frozen plan shows the render-only button');
  const all=descendants(nodes.rrDetail);
  assert.equal(all.filter(n=>n.textContent==='Make the revised video (V2)').length,1,
    'only one render button is shown');
  const nextStep=all.find(n=>n.className==='rr-next-step');
  const planDetails=all.find(n=>n.className==='rr-plan-details');
  assert.ok(nextStep,'the Producer presents a clear next step');
  assert.ok(planDetails,'technical checks remain accessible, but are collapsed');
  assert.equal(planDetails.tag,'details');
  assert.ok(all.indexOf(nextStep)<all.indexOf(planDetails),
    'the action appears before plan diagnostics');
  assert.ok(!all.some(n=>n.textContent==='Current revision plan'));
  await action.listeners.click();
  assert.equal(confirmed,1);
  assert.equal(commits,1);
  assert.equal(receiptBody.intent,'render_this_plan');
  assert.equal(receiptBody.expected_version,4);
  assert.equal(receiptBody.plan_version,1);
  assert.equal(receiptBody.plan_hash,hash);
  assert.match(receiptBody.client_request_id,/^review_/);
  assert.equal(receiptBody.allow_public_publish,undefined);
});

test('queued Chicago render automatically delivers verified V2 without interrupting V1 during polling',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile',
    'rrVersionBar','rrVersionLabel','rrOriginalVersion'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const output='recA1B2C3D4E5F6G7';
  const original='1CAh-mGGiCiv7WKUl9jNeqm1vyQF7PTzq';
  const revised='1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4';
  const attemptId='rrattempt_1234567890abcdef';
  let activate,ready=false,reads=0,permitApproval=false,releaseApproval;
  const timers=[];
  const calls=[],confirmations=[],approvalPosts=[];
  const fetchStub=async(url,options)=>{
    calls.push({url,method:options.method});
    if(url==='/api/session')return {ok:true,json:async()=>({
      authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))
      return {ok:true,json:async()=>({
        ok:true,flags:{admission_enabled:false,producer_conversation_enabled:false,
          attempt_commit_enabled:false,automatic_sampling_percent:0},
        queue:[{output_id:output,profile_id:'recT2rbKX3MF7cVFU',
          output_type:'Instagram Reel',output_number:8447,
          title:'Chicago test render',review_held:true,render_status:'Rendered',
          final_file_url:'https://drive.google.com/file/d/'+original+'/view'}],
        next_cursor:null})};
    if(url==='/api/rendering-review/outputs/'+output+'/approve'){
      approvalPosts.push(JSON.parse(options.body));
      return new Promise(resolve=>{
        releaseApproval=()=>resolve({ok:true,json:async()=>({ok:true,accepted:true,
          factory_ready:true,factory_handoff:{factory_ready:true,attempt_id:attemptId},
          review_hold_active:false,publication_changed:false,instagram_upload_created:false})});
      });
    }
    if(url==='/api/rendering-review/outputs/'+output){
      reads++;
      return {ok:true,json:async()=>({
        ok:true,publication_hold_verified:true,
        flags:{creative_approval_enabled:true},
        creative_group:{key:'vertical short video|9:16',
          content_item_id:'recYhIjy4BW0U3WaW',format:'Vertical Short Video',
          aspect_ratio:'9:16',linked_count:5,master:ready?{
            version:1,file_id:revised,approved_attempt_id:attemptId}:null,
          outputs:[{output_id:output,platform:'Instagram',output_type:'Instagram Reel',
            output_number:8447,held:true},
            {output_id:'recBBBBBBBBBBBBBB',platform:'Facebook',
              output_type:'Facebook Reel',output_number:8448,scheduled:true},
            {output_id:'recCCCCCCCCCCCCCC',platform:'TikTok',
              output_type:'TikTok Video Draft',output_number:8449,dispatched:true},
            {output_id:'recDDDDDDDDDDDDDD',platform:'YouTube',
              output_type:'YouTube Short',output_number:8450},
            {output_id:'recEEEEEEEEEEEEEE',platform:'New Platform',
              output_type:'Future Video Type',output_number:8451}]},
        session:{version:ready?4:3,state:ready?'ready_for_review':'queued',
          current_attempt_id:attemptId,
          latest_attempt_number:2,review_hold:{active:true},
          attempts:[{number:1,status:'ready_for_review',artifact_id:original},
            {id:attemptId,number:2,status:ready?'ready_for_review':'queued',
              artifact_id:ready?revised:null,
              ...(ready?{provenance:{kind:'manual_verified_review_import'}}:{})}],
          history:ready?[{at:'2026-10-31T21:50:00.000Z'}]:[],
          messages:ready?[{role:'producer',content:'Old message: waiting for V2',
            at:'2026-10-31T21:00:00.000Z'}]:[]},
      })};
    }
    throw Error('Unexpected '+url);
  };
  const sandbox={
    document:{getElementById:id=>nodes[id],createElement:tag=>{
      const n=new Node(tag);n.style={};return n;
    }},
    window:{location:{href:'https://studio.test/'},
      CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''},
      setTimeout:fn=>{timers.push(fn);return timers.length;},
      clearTimeout:()=>{},confirm:message=>{
        confirmations.push(message);return permitApproval;
      }},
    MutationObserver:class{constructor(cb){activate=cb;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
    crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  await tick();await tick();
  nodes['page-rendering-review'].classList.add('active');activate();
  for(let i=0;i<10;i++)await tick();
  assert.equal(reads,1);
  assert.equal(timers.length,1,'One polling callback for exact held session');
  assert.equal(nodes.rrOpenFile.href,'https://studio.test/api/outputs/'+output+'/preview');
  assert.equal(nodes.rrVersionLabel.textContent,'Version V1');
  assert.equal(nodes.rrOriginalVersion.hidden,true);
  await timers[0]();for(let i=0;i<4;i++)await tick();
  assert.equal(reads,2,'Poll reads authoritative session once');
  assert.equal(timers.length,2,'Still queued: do not reset the player');
  assert.equal(nodes.rrOpenFile.href,'https://studio.test/api/outputs/'+output+'/preview');
  ready=true;
  await timers[1]();for(let i=0;i<5;i++)await tick();
  const revisedStream='https://studio.test/api/rendering-review/outputs/'+output+'/attempts/'+attemptId+'/preview';
  assert.equal(nodes.rrOpenFile.href,revisedStream);
  assert.equal(nodes.rrVideo.src,revisedStream);
  assert.equal(nodes.rrVideo.inserted,undefined);
  assert.equal(nodes.rrVersionLabel.textContent,'Version V2');
  assert.equal(nodes.rrOriginalVersion.hidden,false);
  const descendants=node=>[node,...node.children.flatMap(descendants)];
  const activityTitles=descendants(nodes.rrDetail).filter(n=>
    n.className==='rr-activity-heading').map(n=>n.textContent);
  assert.ok(activityTitles.some(t=>t.includes('One creative master · 5 matching outputs')));
  const memberList=descendants(nodes.rrDetail).find(n=>
    n.className==='rr-creative-master-members');
  assert.equal(memberList?.children.length,5);
  assert.ok(memberList.children.some(n=>n.textContent.includes('already dispatched')));
  assert.ok(memberList.children.some(n=>n.textContent.includes('scheduled')));
  assert.ok(activityTitles.some(t=>t.includes('V2 · Ready for review (verified imported edit)')));
  assert.ok(!activityTitles.some(t=>t.includes('V2 NOT STARTED')),
    'A verified imported V2 must supersede obsolete Producer conversation');
  const approval=descendants(nodes.rrDetail).find(n=>n.tag==='button'&&
    n.textContent==='Approve selected version');
  assert.ok(approval,'Current V2 offers the requested exact approval label');
  assert.equal(approval.disabled,false,'The displayed V2 is approvable');
  nodes.rrOriginalVersion.listeners.click();
  assert.equal(approval.disabled,true,'Previewing V1 must not accidentally approve V2');
  assert.equal(nodes.rrVideo.src,'https://studio.test/api/outputs/'+output+'/preview');
  assert.equal(nodes.rrVersionLabel.textContent,'Version V1');
  assert.equal(nodes.rrOriginalVersion.hidden,true);
  const versions=descendants(nodes.rrDetail).filter(n=>n.tag==='button'&&
    /^Version V[12] ·/.test(n.textContent));
  assert.equal(versions.length,2,'Both original and revised versions remain selectable');
  await versions[1].listeners.click();
  assert.equal(nodes.rrVideo.src,revisedStream);
  assert.equal(nodes.rrVersionLabel.textContent,'Version V2');
  assert.equal(nodes.rrOriginalVersion.hidden,false);
  assert.equal(approval.disabled,false,'Re-selecting V2 enables its approval');
  assert.ok(calls.every(c=>c.method==='GET'),'Polling never renders or publishes');
  await approval.listeners.click();
  assert.equal(confirmations.length,1,'One approval confirmation appears');
  assert.match(confirmations[0],/Approve selected version V2\?/);
  assert.match(confirmations[0],/Cancel to choose a different version/);
  assert.match(confirmations[0],/does not publish, upload, or release the publication hold/);
  assert.equal(approvalPosts.length,0,'Cancel must not submit an approval');
  permitApproval=true;
  const pending=approval.listeners.click();
  await tick();
  assert.equal(approvalPosts.length,1,'OK sends one approval');
  assert.equal(approval.disabled,true,'The approval action locks immediately');
  assert.equal(approval.textContent,'Approving V2…');
  const receipt=descendants(nodes.rrDetail).find(n=>n.className==='rr-feedback-status');
  assert.equal(receipt?.hidden,false,'Feedback is visible next to the approval action');
  assert.match(receipt.textContent,/Approving V2 and moving it to Factory/);
  await approval.listeners.click();
  assert.equal(approvalPosts.length,1,'Repeated click cannot send another approval');
  assert.equal(approvalPosts[0].attempt_id,attemptId,'Approval references displayed V2 attempt');
  assert.equal(approvalPosts[0].expected_version,4);
  assert.equal(approvalPosts[0].public_post_created,undefined,'No publishing intent is submitted');
  releaseApproval();
  await pending;
  assert.equal(approval.disabled,true,'A completed approval cannot be submitted again');
  assert.equal(approval.textContent,'V2 approved — in Factory');
  assert.equal(receipt.dataset.state,'success');
  assert.match(receipt.textContent,/V2 approved and transferred to Factory/);
  await approval.listeners.click();
  assert.equal(approvalPosts.length,1,'Approval remains once-only after successful handoff');
});


test('explicit Producer action failure preserves saved feedback and retry request identity',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  let notify;const submissions=[],output='recA1B2C3D4E5F6G7';
  const fetchStub=async(url,options)=>{
    if(url==='/api/session')return {ok:true,json:async()=>({
      authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,flags:{admission_enabled:false,producer_conversation_enabled:true,
        automatic_sampling_percent:0},
      queue:[{output_id:output,profile_id:'recT2rbKX3MF7cVFU',
        output_type:'Instagram Reel',output_number:8447,title:'Riverwalk',
        review_held:true,final_file_url:'https://example.org/v1.mp4'}],next_cursor:null})};
    if(url==='/api/rendering-review/outputs/'+output)return {ok:true,json:async()=>({
      ok:true,publication_hold_verified:true,flags:{producer_conversation_enabled:true},
      session:{version:2,state:'discussing',review_hold:{active:true},
        messages:[{role:'user',content:'Use more Riverwalk images',at:'2026-11-01T17:00:00Z'}],
        attempts:[{number:1,status:'ready_for_review'}]}})};
    if(url.endsWith('/producer-conversation')){
      submissions.push(JSON.parse(options.body));
      return {ok:false,status:502,json:async()=>({
        ok:false,error:'Producer response unavailable'})};
    }
    throw Error('Unexpected '+url);
  };
  const sandbox={document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},
    window:{location:{href:'https://studio.test/'},CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''}},
    MutationObserver:class{constructor(fn){notify=fn;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
    crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'}};
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  for(let i=0;i<5;i++)await tick();
  nodes['page-rendering-review'].classList.add('active');notify();
  for(let i=0;i<8;i++)await tick();
  const descendants=root=>[root,...root.children.flatMap(descendants)];
  const all=descendants(nodes.rrDetail);
  const apply=all.find(n=>n.tag==='button'&&n.textContent==='Make edits based on the latest feedback');
  const comment=all.find(n=>n.tag==='textarea'&&n.attrs['aria-label']==='Creative direction for Producer');
  assert.ok(apply&&comment);assert.equal(apply.disabled,false);
  await apply.listeners.click();
  const status=all.find(n=>n.className==='rr-feedback-status');
  assert.match(status.textContent,/Producer request not verified/);
  assert.equal(comment.value,'');
  assert.equal(apply.disabled,false);
  await apply.listeners.click();
  assert.equal(submissions.length,2);
  assert.equal(submissions[0].expected_version,2);
  assert.equal(submissions[0].client_request_id,submissions[1].client_request_id);
  assert.ok(!submissions.some(v=>v.render||v.publish));
});

test('photo suggestions keep comments available and never make edits until explicit click',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const output='rec0uVrVeiUM6shp9',calls=[];let notify,version=3,savedNote='',processed=false;
  const original={name:'Riverwalk night',time_of_day:'Night',preview_url:'https://example.org/river.jpg'};
  const replacement={name:'Morning Riverwalk',time_of_day:'Morning',preview_url:'https://example.org/day.jpg'};
  const fetchStub=async(url,options)=>{
    calls.push({url,method:options.method,body:options.body});
    if(url==='/api/session')return {ok:true,json:async()=>({
      ok:true,authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,flags:{admission_enabled:false,producer_conversation_enabled:true,automatic_sampling_percent:0},
      queue:[{output_id:output,profile_id:'recT2rbKX3MF7cVFU',output_type:'Instagram Reel',
        output_number:8447,title:'Chicago Riverwalk',review_held:true,
        final_file_url:'https://example.org/v1.mp4'}],next_cursor:null})};
    if(url==='/api/rendering-review/outputs/'+output)return {ok:true,json:async()=>({
      ok:true,publication_hold_verified:true,
      flags:{producer_conversation_enabled:true,attempt_commit_enabled:false},
      session:{version,state:'discussing',review_hold:{active:true},
        messages:[...(savedNote?[{role:'user',content:savedNote,at:'2026-11-01T17:30:00Z'}]:[]),
          ...(processed?[{role:'producer',content:'I can update the photos.',at:'2026-11-01T17:31:00Z'}]:[])],
        attempts:[{id:'v1',number:1,status:'ready_for_review'}]},
      storyboard:[{scene:3,start_seconds:9.7,end_seconds:15.03,
        original,proposed:replacement,changed:true,proposed_ready:true}]})};
    if(url.endsWith('/review-feedback')){
      const body=JSON.parse(options.body);
      assert.equal(body.expected_version,3);
      savedNote=body.content;version=4;
      return {ok:true,json:async()=>({ok:true,review_hold_active:true,
        session_version:4,message_count:1})};
    }
    if(url.endsWith('/producer-conversation')){
      const body=JSON.parse(options.body);
      assert.equal(body.expected_version,4);
      assert.equal(body.direction,'Use a different photo for frame 3');
      processed=true;version=5;
      return {ok:true,json:async()=>({ok:true,persisted:true,render_queued:false})};
    }
    throw Error('Unexpected '+url);
  };
  const sandbox={document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},
    window:{location:{href:'https://studio.test/'},CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''}},
    MutationObserver:class{constructor(fn){notify=fn;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
    crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}};
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  for(let i=0;i<5;i++)await tick();
  nodes['page-rendering-review'].classList.add('active');notify();
  for(let i=0;i<8;i++)await tick();
  const descendants=root=>[root,...root.children.flatMap(descendants)];
  let all=descendants(nodes.rrDetail);
  const photos=all.find(n=>n.className==='rr-proposal-storyboard');
  assert.ok(photos);
  assert.ok(descendants(photos).some(n=>n.textContent==='Suggested replacement'));
  const form=all.find(n=>n.className.includes('rr-producer-chat-primary'));
  const input=descendants(form).find(n=>n.tag==='textarea');
  const save=descendants(form).find(n=>n.tag==='button'&&n.textContent==='Save comment (no edits yet)');
  assert.ok(input&&save,'photo suggestions must retain the comment input');
  assert.ok(all.indexOf(form)>all.indexOf(photos),'comment box follows proposed photos');
  input.value='Use a different photo for frame 3';input.listeners.input();
  await save.listeners.click();for(let i=0;i<5;i++)await tick();
  assert.equal(processed,false);
  assert.equal(calls.filter(x=>x.method==='POST').length,1);
  all=descendants(nodes.rrDetail);
  const apply=all.find(n=>n.tag==='button'&&n.textContent==='Make edits based on the latest feedback');
  assert.ok(apply&&!apply.disabled);
  await apply.listeners.click();for(let i=0;i<5;i++)await tick();
  assert.equal(processed,true);
  assert.equal(calls.filter(x=>x.method==='POST').length,2);
  assert.ok(!calls.some(x=>/commit-attempt|publish|approve/.test(x.url)));
});

test('Rendering Review labels the playing video without unchanged-video explanations',()=>{
  assert.match(script,/Version V/);
  assert.match(script,/rrVersionBar/);
  assert.match(html,/id="rrOriginalVersion"/);
  assert.match(script,/Suggested changes/);
  assert.match(script,/Do these look right/);
  assert.match(script,/Make edits based on the latest feedback/);
  assert.match(script,/Save comment \(no edits yet\)/);
  assert.match(script,/Suggested morning photo/);
  assert.match(script,/receipt\.persisted!==true\|\|receipt\.render_queued!==false/);
  assert.doesNotMatch(script,/ORIGINAL V1 — unchanged/);
  assert.doesNotMatch(script,/The video has not changed/);
  assert.doesNotMatch(script,/I haven\\'t changed the video yet/);
  assert.match(css,/rr-version-bar/);
  assert.doesNotMatch(script,/showMedia\(.*candidate\.candidate\.timeline/);
});


test('held Producer reply shows V2 not started; saved plan and render progress refresh automatically',async()=>{
  const output='recA1B2C3D4E5F6G7';
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail','rrStatus',
    'rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile','rrProgressSummary'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  let notify,version=2,state='discussing',plan=null,attempts=[],timerId=0;
  let currentAttemptId=null,approvedAttemptId=null,allowActions=true;
  let reads=0,failNextRead=false;const timers=new Map();let savedNote='';let notePosts=0;
  const saved=()=>({ok:true,publication_hold_verified:true,
    flags:{producer_conversation_enabled:allowActions,attempt_commit_enabled:allowActions,
      creative_approval_enabled:allowActions},
    session:{
    id:'review-session',version,state,review_hold:{active:true},
    current_attempt_id:currentAttemptId,approved_attempt_id:approvedAttemptId,
    active_job:['queued','rendering','validating'].includes(state)?{id:'rrjob-queued-123'}:null,
    latest_attempt_number:attempts.length?2:1,
    messages:[{role:'user',content:'Change narration only',at:'2026-11-01T16:00:00Z'},
      {role:'producer',content:'I will keep the same eight photos',at:'2026-11-01T16:01:00Z'},
      ...(savedNote?[{role:'user',content:savedNote,at:'2026-11-01T16:02:00Z'}]:[])],
    producer_candidate:{stale:false,candidate:{narration:'New script',changes:[],requirements:[]}},
    plan,attempts,
  }});
  const fetchStub=async(url,options)=>{
    if(url==='/api/rendering-review/outputs/'+output+'/review-feedback'){
      assert.equal(options.method,'POST');
      const body=JSON.parse(options.body);
      assert.match(body.content,/Replace scene 3/);
      assert.equal(body.expected_version,version);
      savedNote=body.content;notePosts++;version++;
      return {ok:true,json:async()=>({ok:true,review_hold_active:true,
        session_version:version,message_count:3})};
    }
    assert.equal(options.method,'GET','polling must never initiate a render or publish');
    if(url==='/api/session')return {ok:true,json:async()=>({
      ok:true,authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,flags:{admission_enabled:false,producer_conversation_enabled:true,
        automatic_sampling_percent:0},
      queue:[{output_id:output,profile_id:'recT2rbKX3MF7cVFU',
        output_type:'Instagram Reel',output_number:9664,title:'Adler View Photo Set',
        render_status:'Rendered',review_held:true,final_file_url:'https://example.org/v1.mp4'}],
      next_cursor:null})};
    if(url==='/api/rendering-review/outputs/'+output){
      reads++;
      if(failNextRead){failNextRead=false;return {ok:false,status:503,
        json:async()=>({ok:false,error:'Session temporarily unavailable'})};}
      return {ok:true,json:async()=>saved()};
    }
    throw new Error('Unexpected request '+url);
  };
  const sandbox={
    document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},
    window:{location:{href:'https://studio.test/'},CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''},
      setTimeout:(cb,ms)=>{assert.equal(ms,20000);const id=++timerId;timers.set(id,cb);return id;},
      clearTimeout:id=>timers.delete(id)},
    MutationObserver:class {constructor(fn){notify=fn;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
    crypto:{randomUUID:()=> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'},
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  await tick();await tick();
  nodes['page-rendering-review'].classList.add('active');notify();
  for(let i=0;i<10;i++)await tick();
  const descendants=root=>[root,...root.children.flatMap(descendants)];
  const textAll=()=>descendants(nodes.rrDetail).map(n=>n.textContent).join(' ');
  assert.equal(nodes.rrProgressSummary.hidden,false);
  assert.match(nodes.rrProgressSummary.textContent,/V2 has NOT started/);
  assert.match(textAll(),/Post-production progress/);
  assert.match(textAll(),/Plan ready/);
  assert.match(textAll(),/Not started/);
  assert.match(textAll(),/Requires your attention/);
  assert.ok(nodes.rrProgressSummary.classList.contains('rr-progress-top--attention'));
  assert.ok(descendants(nodes.rrDetail).some(n=>n.className.includes('rr-progress-stage--attention')));
  assert.ok(descendants(nodes.rrDetail).some(n=>n.tag==='button'&&n.textContent==='Check latest status'));
  assert.equal(timers.size,1);
  // Unchanged saved state: verify again without resetting the V1 playback.
  const firstTimer=timers.values().next().value;timers.clear();await firstTimer();
  assert.equal(reads,2);assert.equal(timers.size,1);
  assert.match(textAll(),/Last verified/);
  // A separately saved, frozen plan becomes visible without a manual refresh.
  version=3;state='plan_ready';
  plan={frozen:true,missing_assets:[],hash:'plan123',version:1,immutable_manifest:'manifest'};
  const second=timers.values().next().value;timers.clear();await second();
  for(let i=0;i<5;i++)await tick();
  assert.match(nodes.rrProgressSummary.textContent,/plan is saved/);
  assert.match(nodes.rrProgressSummary.textContent,/No render has started/);
  assert.match(nodes.rrProgressSummary.textContent,/Requires your attention/);
  assert.ok(descendants(nodes.rrDetail).some(n=>n.className.includes('rr-progress-stage--attention')));
  assert.equal(timers.size,1);
  // Only a server-confirmed queue changes the UI to rendering queued.
  version=4;state='queued';attempts=[{id:'attempt2',number:2,status:'queued'}];
  const third=timers.values().next().value;timers.clear();await third();
  for(let i=0;i<5;i++)await tick();
  assert.match(nodes.rrProgressSummary.textContent,/render job is queued/);
  assert.match(textAll(),/Queued — not started/);
  assert.ok(!nodes.rrProgressSummary.classList.contains('rr-progress-top--attention'),
    'queued render is automatic work, not a user-action warning');
  assert.ok(!descendants(nodes.rrDetail).some(n=>n.className.includes('rr-progress-stage--attention')));
  assert.ok(!/V2 is ready for review/.test(nodes.rrProgressSummary.textContent));
  const draft=descendants(nodes.rrDetail).find(n=>n.tag==='textarea'&&
    n.attrs['aria-label']==='Creative direction for Producer');
  const saveNote=descendants(nodes.rrDetail).find(n=>n.tag==='button'&&
    n.textContent==='Save comment (no edits yet)');
  assert.ok(draft&&saveNote,'queued render must still accept comments');
  draft.value='Replace scene 3 with another planetarium photo';
  draft.listeners.input();
  await saveNote.listeners.click();
  for(let i=0;i<5;i++)await tick();
  assert.equal(notePosts,1);
  assert.match(textAll(),/Replace scene 3/);
  assert.ok(!/current render was changed/i.test(textAll()));
  assert.ok(!nodes.rrProgressSummary.classList.contains('rr-progress-top--attention'));
  // Transient manual check failures must not erase the previously verified stage.
  failNextRead=true;
  const check=descendants(nodes.rrDetail).find(n=>
    n.tag==='button'&&n.textContent==='Check latest status');
  assert.ok(check);
  await check.listeners.click();
  for(let i=0;i<4;i++)await tick();
  assert.match(nodes.rrProgressSummary.textContent,/Latest status unavailable/);
  assert.match(nodes.rrProgressSummary.textContent,/render job is queued/);
  // Once a verified V2 exists, only enabled creative approval requires attention.
  state='ready_for_review';version=5;currentAttemptId='attempt2abc';
  attempts=[{id:currentAttemptId,number:2,status:'ready_for_review',artifact_id:'artifact123'}];
  await nodes.rrQueueList.children[0].listeners.click();
  for(let i=0;i<5;i++)await tick();
  assert.match(nodes.rrProgressSummary.textContent,/Requires your attention/);
  assert.match(nodes.rrProgressSummary.textContent,/ready for review/);
  assert.ok(descendants(nodes.rrDetail).some(n=>n.className.includes('rr-progress-stage--attention')));
  // A disabled approval gate must not invent an operator action.
  allowActions=false;
  await nodes.rrQueueList.children[0].listeners.click();
  for(let i=0;i<5;i++)await tick();
  assert.ok(!nodes.rrProgressSummary.classList.contains('rr-progress-top--attention'));
  // Approved V2 is complete, never an outstanding user approval.
  state='approved';approvedAttemptId=currentAttemptId;version=6;
  await nodes.rrQueueList.children[0].listeners.click();
  for(let i=0;i<5;i++)await tick();
  assert.ok(!descendants(nodes.rrDetail).some(n=>n.className.includes('rr-progress-stage--attention')));
  assert.ok(descendants(nodes.rrDetail).some(n=>n.className.includes('rr-progress-stage--complete')));
  nodes['page-rendering-review'].classList.remove('active');notify();
  assert.equal(timers.size,0,'polling cancels when the page is closed');
});

test('approved imported V2 never reverts its activity heading to V2 NOT STARTED',()=>{
  const approved=script.indexOf("const title=completedAttempt&&session.state==='approved'?");
  const ready=script.indexOf("completedAttempt&&session.state==='ready_for_review'?",approved);
  const stale=script.indexOf("producer?'Producer replied · V2 NOT STARTED'",ready);
  assert.ok(approved>0&&ready>approved&&stale>ready,
    'approved V2 must take precedence over stale Producer messages');
  assert.match(script,/Factory creative review accepted — QA pending/);
  assert.match(script,/V2 creative approval is saved\. Factory can accept/);
  assert.match(script,/Sibling creative-master propagation is deferred while watermark QA is pending/);
});

test('held review progress displays a recovery warning for an unclaimed stale V2, never a second render action', async()=>{
  const fs=await import('node:fs');
  const source=fs.readFileSync(new URL('./assets/rendering-review-queue.js',import.meta.url),'utf8');
  assert.match(source,/const stalledQueued=session\?\.state==='queued'/);
  assert.match(source,/jobAgeMs>=240000/);
  assert.match(source,/const stalledClaimed=session\?\.state==='queued'/);
  assert.match(source,/jobAgeMs>=900000/);
  assert.match(source,/Requires your attention: V2 has been queued/);
  assert.match(source,/do not start another render/);
  assert.match(source,/reviewSignature\(latest\.session,latest\.render_job\)/);
});

test('completed V2 and pending V3 have separate, non-authorizing progress states',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile','rrProgressSummary'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  let activate;const calls=[];
  const output='recA1B2C3D4E5F6G7';
  const entry={output_id:output,profile_id:'recT2rbKX3MF7cVFU',
    output_type:'Instagram Reel',output_number:9664,title:'Adler View Photo Set',
    review_held:true,final_file_url:'https://example.org/v1.mp4'};
  const producer={
    source_attempt_id:'attempt-v2',stale:false,
    candidate:{explanation:'Keep skyline and select seven exteriors',
      requirements:[{kind:'asset',description:'Verify existing Adler photo 5'}]}};
  const fetchStub=async(url,opts)=>{
    calls.push({url,method:opts?.method||'GET'});
    if(url==='/api/session')return {ok:true,json:async()=>({
      ok:true,authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,queue:[entry],next_cursor:null,
      flags:{admission_enabled:false,producer_conversation_enabled:true,
        automatic_sampling_percent:0}})};
    if(url==='/api/rendering-review/outputs/'+output)return {ok:true,json:async()=>({
      ok:true,publication_hold_verified:true,
      flags:{producer_conversation_enabled:true,attempt_commit_enabled:false,
        creative_approval_enabled:false},
      session:{id:'session-12345678',version:6,state:'ready_for_review',
        profile_id:'recT2rbKX3MF7cVFU',current_attempt_id:'attempt-v2',
        latest_attempt_number:2,review_hold:{active:true,id:'held-1234'},
        attempts:[{id:'attempt-v1',number:1,status:'ready_for_review',artifact_id:'originalfile123456789'},
          {id:'attempt-v2',number:2,status:'ready_for_review',artifact_id:'renderedfile123456789'}],
        messages:[
          {role:'user',content:'Use Adler Planetarium 3, 5, 12, 13, 14, 17, 18',
            attempt_id:'attempt-v2',at:'2026-11-02T01:20:00Z'},
          {role:'producer',content:'Seven photos need linking',
            attempt_id:'attempt-v2',at:'2026-11-02T01:21:00Z'}],
        producer_candidate:producer,plan:null}})};
    throw Error('Unexpected '+url);
  };
  const sandbox={
    document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},
    window:{location:{href:'https://studio.test/'},
      CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''}},
    MutationObserver:class{constructor(cb){activate=cb;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
    crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  for(let i=0;i<5;i++)await tick();
  nodes['page-rendering-review'].classList.add('active');activate();
  for(let i=0;i<10;i++)await tick();
  const descend=root=>[root,...root.children.flatMap(descend)];
  const text=descend(nodes.rrDetail).map(n=>n.textContent).filter(Boolean).join('\n');
  assert.match(text,/V2 · Ready for review/);
  assert.match(text,/V3 · Proposed changes — not rendered/);
  assert.match(text,/1 checks or assets remain unresolved/);
  assert.match(text,/Not authorized \/ not started/);
  assert.ok(calls.every(x=>x.method==='GET'),'page read cannot authorize any edits or render');
});
