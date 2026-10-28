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
  assert.match(nodes.rrStatus.textContent,/Read-only · Chicago Instagram Reels/);
  assert.equal(nodes.rrQueueList.children.length,1);
  assert.equal(nodes.rrOpenFile.href,'https://studio.test/api/outputs/recA1B2C3D4E5F6G7/preview');
  assert.equal(nodes.rrVideo.src,'https://studio.test/api/outputs/recA1B2C3D4E5F6G7/preview');
  assert.equal(nodes.rrMore.hidden,true);
  assert.equal(nodes.rrCount.textContent,'1 results loaded');
  assert.equal(requests.length,2);
  assert.ok(requests.every(v=>v.options.method==='GET'));
  assert.match(requests[1].url,/profile_id=recT2rbKX3MF7cVFU/);
});


test('manual Chicago enrollment and actual Producer exchange require server flags and hold',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const calls=[];
  let observerCallback;
  let enrolled=false;
  let conversation=false;
  let admissionActive=true;
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
      {role:'user',content:'Explain step by step'},
      {role:'producer',content:'I propose a clearer journey example.'}]:[],
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
  assert.ok(enroll);
  await enroll.listeners.click();
  for(let i=0;i<10;i++)await tick();
  assert.equal(enrolled,true);
  // Operators may pause fresh admissions without losing already-held chats.
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
  assert.ok(descendants(nodes.rrDetail).some(n=>n.textContent==='I propose a clearer journey example.'));
  const writes=calls.filter(v=>v.method==='POST');
  assert.equal(writes.length,2);
  assert.ok(writes.every(v=>v.url.endsWith('/enroll')||v.url.endsWith('/producer-conversation')));
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
    n.textContent==='Create next attempt — render only').length,0,
    'No commit action when protected server gate is disabled');
  enabled=true;await nodes.rrRefresh.listeners.click();
  for(let i=0;i<12;i++)await tick();
  const action=descendants(nodes.rrDetail).find(n=>
    n.textContent==='Create next attempt — render only');
  assert.ok(action,'Server-approved frozen plan shows the render-only button');
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
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
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
        session:{version:ready?4:3,state:ready?'ready_for_review':'queued',
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
  const descendants=node=>[node,...node.children.flatMap(descendants)];
  const versions=descendants(nodes.rrDetail).filter(n=>n.tag==='button'&&
    /^Attempt [12] ·/.test(n.textContent));
  assert.equal(versions.length,2,'Both original and revised versions remain selectable');
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
  assert.match(statuses[0].textContent,/Not sent: The Producer returned an invalid revision proposal/);
  assert.equal(composer.value,'Keep the morning opening, but show three more Riverwalk photos.');
  assert.equal(send.disabled,false);
  await send.listeners.click();
  assert.equal(submissions.length,2);
  assert.equal(submissions[0].client_request_id,submissions[1].client_request_id);
  assert.equal(submissions[0].expected_version,1);
  assert.ok(!submissions.some(x=>x.publish||x.render));
});

test('Rendering Review does not portray V1 playback as a completed Producer render',()=>{
  assert.match(script,/ORIGINAL V1 — unchanged/);
  assert.match(script,/NOT RENDERED/);
  assert.match(script,/Latest Producer proposal — not yet rendered/);
  assert.match(script,/Correct frames 1 and 5 in Producer plan — no render/);
  assert.match(script,/return 'Please replace BOTH nighttime scenes, including '/);
  assert.match(script,/await sendDirection\(composer\.value\)/);
  assert.match(script,/const listed=originalNightRows\.map/);
  assert.doesNotMatch(script,/const listed=unresolvedNight\.map/);
  assert.match(script,/Verified Morning source · NOT SAVED/);
  assert.match(script,/suggestion_saved===false/);
  assert.match(script,/never renders, approves, publishes or alters V1/);
  assert.match(css,/rr-storyboard-pair/);
  assert.doesNotMatch(script,/showMedia\(.*candidate\.candidate\.timeline/);
});


test('one click sends BOTH original Night frames even if saved scene 5 is already Morning',async()=>{
  const ids=['page-rendering-review','navRenderingReview','rrQueueList','rrDetail',
    'rrStatus','rrRefresh','rrMore','rrCount','rrVideo','rrOpenFile'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id)]));
  const output='rec0uVrVeiUM6shp9';
  const posts=[];
  let observerCallback;
  let updated=false;
  const night=(scene,start,end,changed)=>({
    scene,start_seconds:start,end_seconds:end,changed,
    proposed_ready:true,suggestion_saved:false,
    original:{name:'Night source',time_of_day:'Night',
      preview_url:'https://media.chicagoshining.com/studio/previews/item4/night.jpg'},
    proposed:{name:changed?'Chicago Riverwalk 8':'Night source',
      time_of_day:changed?'Morning':'Night',
      preview_url:'https://media.chicagoshining.com/studio/previews/item4/saved.jpg'},
    suggested:{name:'Chicago Riverwalk 8',time_of_day:'Morning',
      preview_url:'https://media.chicagoshining.com/studio/previews/item4/morning.jpg'},
  });
  const fetchStub=async(url,options)=>{
    if(url==='/api/session')return {ok:true,json:async()=>({
      ok:true,authenticated:true,authorized:true,permissions:{outputs_review:true}})};
    if(url.startsWith('/api/rendering-review/queue?'))return {ok:true,json:async()=>({
      ok:true,flags:{admission_enabled:false,producer_conversation_enabled:true,
        automatic_sampling_percent:0},
      queue:[{output_id:output,profile_id:'recT2rbKX3MF7cVFU',
        output_type:'Instagram Reel',review_held:true,title:'Riverwalk Morning Reflections',
        output_number:8447,render_status:'Rendered'}],next_cursor:null})};
    if(url==='/api/rendering-review/outputs/'+output)return {ok:true,json:async()=>({
      ok:true,publication_hold_verified:true,flags:{producer_conversation_enabled:true},
      session:{version:updated?4:3,state:'discussing',review_hold:{active:true},
        messages:[],attempts:[]},
      storyboard:[night(1,0,3.567,updated),night(5,13.9,17.133,true)],
    })};
    if(url.endsWith('/producer-conversation')){
      assert.equal(options.method,'POST');
      const body=JSON.parse(options.body);
      posts.push(body);
      updated=true;
      return {ok:true,json:async()=>({
        ok:true,persisted:true,render_queued:false,
        plan_ready:true,plan_persisted:true,session_version:4,
      })};
    }
    throw new Error('Unexpected endpoint '+url);
  };
  const sandbox={
    document:{getElementById:id=>nodes[id],createElement:tag=>new Node(tag)},
    window:{location:{href:'https://studio.test/'},
      CHICAGOSHINING_STUDIO_CONFIG:{apiBase:''}},
    MutationObserver:class {constructor(cb){observerCallback=cb;}observe(){}},
    fetch:fetchStub,URL,URLSearchParams,
    crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  await tick();await tick();
  nodes['page-rendering-review'].classList.add('active');
  observerCallback();
  for(let i=0;i<10;i++)await tick();
  const descendants=root=>[root,...root.children.flatMap(descendants)];
  assert.equal(posts.length,0,'read-only preview must not auto-submit feedback');
  const before=descendants(nodes.rrDetail);
  assert.ok(before.some(n=>n.textContent==='Verified Morning source · NOT SAVED'));
  const actions=before.filter(n=>n.tag==='button'&&
    n.textContent==='Correct frames 1 and 5 in Producer plan — no render');
  assert.equal(actions.length,2,'visible above storyboard and beside composer');
  await actions[0].listeners.click();
  for(let i=0;i<10;i++)await tick();
  assert.equal(posts.length,1);
  assert.equal(posts[0].expected_version,3);
  assert.match(posts[0].direction,/frame 1 \\(0\\.000/);
  assert.match(posts[0].direction,/frame 5 \\(13\\.900/);
  assert.match(posts[0].direction,/Preserve|Keep every other scene, narration, music, watermark/);
  assert.ok(!posts[0].direction.includes('publish'));
  assert.equal(updated,true);
});
