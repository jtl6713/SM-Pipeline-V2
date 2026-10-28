import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('./assets/rendering-review-queue.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./assets/rendering-review-queue.css',import.meta.url),'utf8');

test('dedicated Chicago review page and nav are opt-in read-only surfaces',()=>{
  assert.match(html,/<button[^>]*id="navRenderingReview"[^>]*hidden/);
  assert.match(html,/<section id="page-rendering-review" class="page"/);
  assert.match(html,/id="rrVideo"[^>]*controls playsinline/);
  assert.match(html,/id="rrQueueList"/);
  assert.match(html,/id="rrMore"/);
  assert.match(html,/rendering-review-queue\.js/);
  assert.match(html,/rendering-review-queue\.css/);
  assert.match(html,/Review enrollment and new changes are not yet enabled/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.doesNotMatch(html,/id="rr(?:Submit|Approve|Publish|Commit|Release)"/);
  assert.doesNotMatch(script,/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
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
      ok:true,flags:{admission_enabled:false,automatic_sampling_percent:0},
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
    fetch:fetchStub,URL,
  };
  vm.runInNewContext(script,sandbox,{filename:'rendering-review-queue.js'});
  await tick();await tick();
  assert.equal(nodes.navRenderingReview.hidden,false);
  nodes['page-rendering-review'].classList.add('active');
  notify();
  for(let i=0;i<10;i++)await tick();
  assert.match(nodes.rrStatus.textContent,/Read-only · Chicago Instagram Reels/);
  assert.equal(nodes.rrQueueList.children.length,1);
  assert.equal(nodes.rrOpenFile.href,'https://example.org/preview.mp4');
  assert.equal(nodes.rrVideo.src,'https://example.org/preview.mp4');
  assert.equal(nodes.rrMore.hidden,true);
  assert.equal(nodes.rrCount.textContent,'1 results loaded');
  assert.equal(requests.length,2);
  assert.ok(requests.every(v=>v.options.method==='GET'));
  assert.match(requests[1].url,/profile_id=recT2rbKX3MF7cVFU/);
});
