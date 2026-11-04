import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('apps/studio-web');
const html=readFileSync(path.join(root,'index.html'),'utf8');
const section=html.slice(html.indexOf('<section id="page-factory"'),html.indexOf('<section id="page-support"'));
const profile='recFixtureProfileLA';
const cards=Array.from({length:6},(_,i)=>({id:'recFixtureOutput'+i,output_id:9000+i,
  profile_id:profile,profile_name:'Los Angeles',content_id:'recFixtureContent',kind:'output',
  title:'Six-output regression '+i,platform:'Instagram',studio_output_type:'Reel',
  output_status:'Ready for Review',review_status:'Review Sent',studio_state:'Ready for Review',render_status:'Rendered'}));
const desk={ok:true,lanes:{needs_eyes:cards,auto_high:[],manual:[],needs_assets:[]},needs_assets_candidates:[],summary:{needs_eyes:6}};
const policy={enabled:true,stage:'expanded',max_total:20,max_per_profile:10,
  allowed_platforms:['Instagram'],allowed_output_types_by_platform:{Instagram:['Reel']}};
let scenario='busy',posts=[],job=null;
const errors=[];
const send=(res,body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/') {res.writeHead(200,{'content-type':'text/html'});res.end('<html><body><select id="studioProfileSelect"><option value="'+profile+'">LA</option></select>'+section+'<script src="/assets/factory-desk.js"></script></body></html>');return;}
  if(url.pathname.startsWith('/assets/')) {const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}try{res.writeHead(200,{'content-type':'text/javascript'});res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}return;}
  if(url.pathname==='/api/factory/desk'){send(res,desk);return;}
  if(url.pathname==='/api/factory/approval-batches' && req.method==='GET'){
    const rid=url.searchParams.get('request_id');
    send(res,{ok:true,scope:'all',exact_request_id:rid||undefined,batches:job?[job]:[],
      totals:{active:job?1:0,pending:job?6:0,approved:0,failed:0},approvals_enabled:true,
      global_rollout:policy,rollout:{enabled:true,max_items:10}});return;
  }
  if(url.pathname==='/api/factory/approval-batches' && req.method==='POST'){
    let raw='';for await(const piece of req)raw+=piece;
    const body=JSON.parse(raw);posts.push(body);
    assert.equal(body.action,'start_group');assert.deepEqual(body.record_ids,cards.map(x=>x.id));
    if(scenario==='blocked'){send(res,{error:'Output is held; approval not accepted'},409);return;}
    if(posts.length===1 && scenario==='busy'){send(res,{error:'Temporary upstream failure'},503);return;}
    job={ok:true,accepted:true,job_id:'fg_'+body.request_id,request_id:body.request_id,group:true,
      status:'queued',total:6,pending_count:6,approved_count:0,failed_count:0,items:cards.map(x=>({...x,status:'pending'}))};
    if(posts.length===1 && scenario==='lost'){send(res,{error:'Response lost after commit'},503);return;}
    send(res,job);return;
  }
  send(res,{ok:true});
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
 for(const mode of ['busy','lost','blocked']){
  scenario=mode;posts=[];job=null;
  const context=await browser.newContext({viewport:{width:1024,height:768},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  async function load(){await page.goto(origin);await page.waitForFunction(()=>window.StudioFactoryDesk?.load);await page.evaluate(()=>{document.querySelector('#page-factory').classList.add('active');return window.StudioFactoryDesk.load(true);});}
  await load();
  await page.locator('[data-factory-select-content]').first().check();
  assert.match(await page.locator('#factoryBatchSelectionCount').innerText(),/6 outputs selected/);
  await page.locator('#factoryBatchSubmit').click();
  await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('studio.factory.recovery.v2.')) || Object.keys(JSON.parse(localStorage.getItem('studio.factory.accepted-output-ids.v1')||'{}')).length===6);
  assert.equal(posts.length,1);
  if(mode==='blocked'){
    assert.match(await page.locator('#factoryBatchPendingNotice').innerText(),/Output is held/);
    await page.evaluate(()=>window.StudioFactoryDesk.load(true));
    assert.match(await page.locator('#factoryBatchPendingNotice').innerText(),/Output is held/);
    assert.equal(posts.length,1);
  }else{
    // Reload after a failed network response; no second Submit click. Advance
    // the persisted retry deadline only, retaining the actual production payload.
    await page.evaluate(()=>{for(const key of Object.keys(localStorage)){if(key.startsWith('studio.factory.recovery.v2.')){const v=JSON.parse(localStorage.getItem(key));v.next_retry_ms=0;localStorage.setItem(key,JSON.stringify(v));}}});
    await load();
    await page.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('studio.factory.accepted-output-ids.v1')||'{}')).length===6);
    assert.equal(posts.length,mode==='busy'?2:1);
    if(posts.length===2)assert.deepEqual(posts[0],posts[1]);
    assert.equal(await page.locator('#factoryBatchPendingNotice').isVisible(),false);
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log('FACTORY_SIX_OUTPUT_BROWSER=PASS busy_retry_same_id=true reload_resume=true lost_response_no_duplicate=true validation_error_persistent=true');
}finally{await browser.close();await new Promise(r=>server.close(r));}
