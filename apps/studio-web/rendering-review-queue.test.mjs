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


test('Rendering Review never enrolls; Factory-submitted sessions retain Producer conversation',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const calls=[];
  let observerCallback;
  let enrolled=true; // Review was admitted by Factory with required comments.
  let conversation=false;
  let admissionActive=false; // Direct admission is disabled.
  const output='recA1B2C3D4E5F6G7';
  const queue=()=>({ok:true,
    flags:{admission_enabled:admissionActive,producer_conversation_enabled:true,
      automatic_sampling_percent:0},
    queue:[{output_id:output,profile_id:'recT2rbKX3MF7cVFU',
      output_type:'Instagram Reel',manual_admission_enabled:!enrolled,
      output_number:54,title:'Chicago train pilot',render_status:'Rendered',
      review_held:enrolled,final_file_url:'https://example.org/clip.mp4'}],
    next_cursor:null});
  const saved=()=>({ok:true,publication_hold_verified:true,session:{
    id:'rrsession-12345678',version:conversation?2:1,
    state:conversation?'discussing':'ready_for_review',
    messages:conversation?[
      {role:'user',content:'Explain step by step',at:'2026-10-30T20:39:18.045Z'},
      {role:'producer',content:'I propose a clearer journey example.',at:'2026-10-30T20:42:39.164Z'}]:[],
    producer_candidate:conversation?{candidate:{narration:'Revised script',
      changes:['Add a worked example'],requirements:[]}}:null,
  }});
  const fetchStub=async(url,options)=>{
    calls.push({url,method:options.method,body:options.body});
    if(url==='/api/session')return {ok:true,json:async()=>({
      ok:true,authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))
      return {ok:true,json:async()=>queue()};
    if(url==='/api/rendering-review/outputs/'+output)
      return {ok:true,json:async()=>saved()};
    if(url.endsWith('/enroll')){
      assert.equal(options.method,'POST');
      assert.deepEqual(Object.keys(JSON.parse(options.body)),['client_request_id']);
      enrolled=true;
      return {ok:true,json:async()=>({ok:true,review_hold_active:true})};
    }
    if(url.endsWith('/producer-conversation')){
      assert.equal(options.method,'POST');
      const body=JSON.parse(options.body);
      assert.equal(body.direction,'Explain step by step');
      assert.equal(body.expected_version,1);
      assert.deepEqual(Object.keys(body),['direction','expected_version','client_request_id']);
      conversation=true;
      return {ok:true,json:async()=>({
        ok:true,persisted:true,render_queued:false,session_version:2,
      })};
    }
    throw new Error('Unexpected external action '+url);
  };
  const sandbox={
    document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},
    window:{location:{href:'https://studio.test/'},
      CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''}},
    MutationObserver:class {constructor(fn){observerCallback=fn;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
    crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  await tick();await tick();
  nodes['page-rendering-review'].classList.add('active');
  observerCallback();
  for(let i=0;i<10;i++)await tick();
  const descendants=root=>[root,...root.children.flatMap(descendants)];
  const initial=descendants(nodes.rrDetail);
  const enroll=initial.find(n=>n.tag==='button'&&n.textContent==='Review with Producer');
  assert.equal(enroll,undefined,'Rendering Review must not offer its own enrollment control');
  // Changing feature flags cannot bypass Factory-origin enrollment.
  admissionActive=false;
  await nodes.rrRefresh.listeners.click();
  for(let i=0;i<10;i++)await tick();
  const held=descendants(nodes.rrDetail);
  const textarea=held.find(n=>n.tag==='textarea');
  const send=held.find(n=>n.tag==='button'&&n.textContent==='Send to Producer');
  assert.ok(textarea&&send);
  textarea.value='Explain step by step';
  await send.listeners.click();
  for(let i=0;i<10;i++)await tick();
  assert.equal(conversation,true);
  const activity=descendants(nodes.rrDetail);
  assert.ok(activity.some(n=>n.textContent==='I propose a clearer journey example.'));
  assert.ok(activity.some(n=>n.className==='rr-activity-heading'&&/V2 NOT STARTED/.test(n.textContent)));
  const times=activity.filter(n=>n.className==='rr-message-time');
  assert.equal(times.length,2);
  assert.ok(times.some(n=>/3:39/.test(n.textContent)&&/CDT/.test(n.textContent)));
  assert.ok(times.some(n=>/3:42/.test(n.textContent)&&/CDT/.test(n.textContent)));
  assert.ok(activity.some(n=>n.className==='rr-conversation-live'),'Conversation must not be hidden');
  const writes=calls.filter(v=>v.method==='POST');
  assert.equal(writes.length,1);
  assert.ok(writes.every(v=>v.url.endsWith('/producer-conversation')));
  assert.ok(!calls.some(v=>v.url.endsWith('/enroll')));
  assert.ok(!writes.some(v=>/\/(?:publish|render|approve)(?:\/|$)/.test(v.url)));
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
  let activate,ready=false,reads=0;
  const timers=[];
  const calls=[];
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
    if(url==='/api/rendering-review/outputs/'+output){
      reads++;
      return {ok:true,json:async()=>({
        ok:true,publication_hold_verified:true,
        flags:{creative_approval_enabled:true},
        session:{version:ready?4:3,state:ready?'ready_for_review':'queued',
          current_attempt_id:attemptId,
          latest_attempt_number:2,review_hold:{active:true},
          attempts:[{number:1,status:'ready_for_review',artifact_id:original},
            {id:attemptId,number:2,status:ready?'ready_for_review':'queued',
              artifact_id:ready?revised:null}],
          messages:[]},
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
      clearTimeout:()=>{}},
    MutationObserver:class{constructor(cb){activate=cb;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
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
});


test('Producer failure is visible beside Send, preserves direction and reuses retry identity',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const output='recA1B2C3D4E5F6G7';
  let activate,submissions=[];
  const fetchStub=async(url,options)=>{
    if(url==='/api/session')return {ok:true,json:async()=>({
      authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,flags:{admission_enabled:true,producer_conversation_enabled:true,
        attempt_commit_enabled:false,automatic_sampling_percent:0},
      queue:[{output_id:output,profile_id:'recT2rbKX3MF7cVFU',
        output_type:'Instagram Reel',output_number:8447,title:'Riverwalk Morning Reflections',
        render_status:'Rendered',review_held:true,final_file_id:'source-1234567890'}],
      next_cursor:null})};
    if(url==='/api/rendering-review/outputs/'+output)return {ok:true,json:async()=>({
      ok:true,publication_hold_verified:true,session:{
        version:1,state:'ready_for_review',messages:[],attempts:[]}})};
    if(url.endsWith('/producer-conversation')){
      submissions.push(JSON.parse(options.body));
      return {ok:false,status:502,json:async()=>({
        ok:false,error:'The Producer returned an invalid revision proposal. Your feedback was not saved; please retry.'})};
    }
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
  const descendants=node=>[node,...node.children.flatMap(descendants)];
  const composer=descendants(nodes.rrDetail).find(n=>n.tag==='textarea');
  const send=descendants(nodes.rrDetail).find(n=>n.textContent==='Send to Producer');
  assert.ok(composer&&send);
  composer.value='Keep the morning opening, but show three more Riverwalk photos.';
  await send.listeners.click();
  const statuses=descendants(nodes.rrDetail).filter(n=>n.className==='rr-feedback-status');
  assert.equal(statuses.length,1);
  assert.match(statuses[0].textContent,/Could not confirm your reply: The Producer returned an invalid revision proposal/);
  assert.equal(composer.value,'Keep the morning opening, but show three more Riverwalk photos.');
  assert.equal(send.disabled,false);
  await send.listeners.click();
  assert.equal(submissions.length,2);
  assert.equal(submissions[0].client_request_id,submissions[1].client_request_id);
  assert.equal(submissions[0].expected_version,1);
  assert.ok(!submissions.some(x=>x.publish||x.render));
});

test('held #8447 surfaces a verified Morning alternative and saves correction only on reviewer click',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const output='rec0uVrVeiUM6shp9';
  let notify, savedRevision=false,completeReply;
  const slowTimers=[];
  const calls=[];
  const night={name:'Gibsons Italia 5',time_of_day:'Night',
    preview_url:'https://media.chicagoshining.com/studio/previews/item4/night.jpg'};
  const riverNight={name:'Chicago Riverwalk 10',time_of_day:'Night',
    preview_url:'https://media.chicagoshining.com/studio/previews/item4/night-river.jpg'};
  const morning={name:'Chicago Riverwalk 8',time_of_day:'Morning',
    preview_url:'https://media.chicagoshining.com/studio/previews/item4/morning.jpg'};
  const originals=[
    {scene:1,start_seconds:0,end_seconds:3.567,original:night,
      proposed:savedRevision?morning:night,changed:savedRevision,proposed_ready:true},
    {scene:5,start_seconds:13.9,end_seconds:17.133,original:riverNight,
      proposed:morning,changed:true,proposed_ready:true},
    {scene:7,start_seconds:20.7,end_seconds:24.233,original:morning,
      proposed:morning,changed:false,proposed_ready:true}];
  const fetchStub=async (url,options)=>{
    calls.push({url,method:options.method,body:options.body});
    if(url==='/api/session')return {ok:true,json:async()=>({
      ok:true,authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,flags:{admission_enabled:false,producer_conversation_enabled:true,
        automatic_sampling_percent:0},
      queue:[{output_id:output,profile_id:'recT2rbKX3MF7cVFU',review_held:true,
        output_type:'Instagram Reel',output_number:8447,render_status:'Rendered',
        title:'Chicago held Reel',final_file_url:'https://example.org/old.mp4'}],next_cursor:null})};
    if(url==='/api/rendering-review/outputs/'+output)
      return {ok:true,json:async()=>({ok:true,publication_hold_verified:true,
        flags:{producer_conversation_enabled:true,attempt_commit_enabled:false},
        session:{version:savedRevision?4:3,state:'discussing',review_hold:{active:true},
          attempts:[{number:1,status:'ready_for_review',artifact_id:'source1'}],messages:[]},
        storyboard:savedRevision?originals.map(f=>f.scene===1?
          {...f,proposed:morning,changed:true}:f):originals})};
    if(url.endsWith('/producer-conversation')){
      const body=JSON.parse(options.body);
      assert.equal(body.expected_version,3);
      assert.equal(body.direction,'Yes, those look good.');
      return new Promise(resolve=>{completeReply=()=>{
        savedRevision=true;
        resolve({ok:true,json:async()=>({ok:true,persisted:true,
          render_queued:false,plan_ready:true,plan_persisted:true})});
      };});
    }
    throw new Error('Unexpected request '+url);
  };
  const sandbox={
    document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},
    window:{location:{href:'https://studio.test/'},CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''},
      setTimeout:fn=>{slowTimers.push(fn);return slowTimers.length;},
      clearTimeout:()=>{}},
    MutationObserver:class {constructor(fn){notify=fn;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
    crypto:{randomUUID:()=> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  await tick();await tick();
  nodes['page-rendering-review'].classList.add('active');
  notify();
  for(let i=0;i<12;i++)await tick();
  const descendants=root=>[root,...root.children.flatMap(descendants)];
  const before=descendants(nodes.rrDetail);
  const reply=before.find(n=>n.tag==='textarea'&&
    n.attributes?.['aria-label']==='Reply to your Producer')||
    before.find(n=>n.tag==='textarea');
  const send=before.find(n=>n.tag==='button'&&n.textContent==='Reply to Producer');
  assert.ok(reply&&send,'Producer invites a natural-language reply next to verified photos');
  assert.ok(before.some(n=>String(n.textContent).includes('Do these look right?')),
    'Producer speaks naturally rather than showing an internal workflow warning');
  assert.ok(before.some(n=>n.textContent==='Suggested morning photo'),
    'the available Morning photo appears as a suggestion');
  assert.ok(!before.some(n=>String(n.textContent).includes('Daytime correction not yet saved')),
    'no technical system-status warning in the conversation');
  assert.equal(calls.filter(x=>x.method==='POST').length,0,'read never changes the session');
  reply.value='Yes, those look good.';
  const conversation=before.find(n=>n.className==='rr-chat-form');
  const progress=before.find(n=>n.className==='rr-feedback-status');
  assert.ok(conversation&&progress);
  assert.ok(conversation.children.indexOf(progress)<conversation.children.indexOf(send),
    'progress status must be above the button so iPhone keyboard cannot hide it');
  const response=send.listeners.click();
  assert.equal(send.disabled,true);
  assert.equal(send.textContent,'Producer is working…');
  assert.equal(send.attrs['aria-busy'],'true');
  assert.equal(progress.hidden,false);
  assert.match(progress.textContent,/Sending your feedback/);
  assert.equal(progress.dataset.state,'working');
  assert.equal(slowTimers.length,1);
  slowTimers[0]();
  assert.match(progress.textContent,/Still waiting for the Producer/);
  assert.equal(calls.filter(x=>x.method==='POST').length,1);
  await send.listeners.click();
  assert.equal(calls.filter(x=>x.method==='POST').length,1,'no duplicate while pending');
  completeReply();
  await response;
  for(let i=0;i<12;i++)await tick();
  assert.equal(send.disabled,false);
  assert.equal(send.textContent,'Reply to Producer');
  assert.equal(calls.filter(x=>x.method==='POST').length,1);
  assert.equal(savedRevision,true);
  assert.ok(!calls.some(x=>/commit-attempt|publish|approve/.test(x.url)));
  const after=descendants(nodes.rrDetail);
  assert.ok(after.some(n=>n.className==='rr-feedback-receipt'&&
    /photo choices were saved/.test(n.textContent)),
    'the acknowledgement survives the detail rerender');
  assert.ok(!after.some(n=>n.textContent==='Reply to Producer'));
  assert.ok(after.some(n=>n.textContent==='Suggested replacement'));
});

test('Rendering Review labels the playing video without unchanged-video explanations',()=>{
  assert.match(script,/Version V/);
  assert.match(script,/rrVersionBar/);
  assert.match(html,/id="rrOriginalVersion"/);
  assert.match(script,/Suggested changes/);
  assert.match(script,/Do these look right/);
  assert.match(script,/Reply to Producer/);
  assert.match(script,/Suggested morning photo/);
  assert.match(script,/created\.persisted!==true\|\|created\.render_queued!==false/);
  assert.doesNotMatch(script,/ORIGINAL V1 — unchanged/);
  assert.doesNotMatch(script,/The video has not changed/);
  assert.doesNotMatch(script,/I haven\\'t changed the video yet/);
  assert.match(css,/rr-version-bar/);
  assert.doesNotMatch(script,/showMedia\(.*candidate\.candidate\.timeline/);
});
