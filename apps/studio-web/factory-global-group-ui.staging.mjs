/**
 * Synthetic-only global Factory Activity UI acceptance. In-process server only:
 * no Airtable credentials, no real approval calls, no publishing.
 */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {chromium} from "playwright";
import path from "node:path";

const root=path.resolve("apps/studio-web");
const html=readFileSync(path.join(root,"index.html"),"utf8");
const start=html.indexOf('<section id="page-factory"');
const end=html.indexOf('<section id="page-support"',start);
assert.ok(start>=0 && end>start);
const section=html.slice(start,end);
const css=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)].map(x=>x[0]).join("\n");
const styles=[...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map(x=>x[0]).join("\n");
const chicago="recT2rbKX3MF7cVFU",nyc="recgtK8Z7eNADNtVy";
const cards=[
  {id:"recFixtureGlobalChiReel1",profile_id:chicago,profile_name:"Chicago",content_id:"recFixtureChiContent",output_id:8001,platform:"Instagram",studio_output_type:"Reel"},
  {id:"recFixtureGlobalChiStory2",profile_id:chicago,profile_name:"Chicago",content_id:"recFixtureChiContent",output_id:8002,platform:"Instagram",studio_output_type:"Story"},
  {id:"recFixtureGlobalNycReel3",profile_id:nyc,profile_name:"New York",content_id:"recFixtureNycContent",output_id:8003,platform:"Instagram",studio_output_type:"Reel"},
  {id:"recFixtureGlobalNycShort4",profile_id:nyc,profile_name:"New York",content_id:"recFixtureNycContent",output_id:8004,platform:"YouTube",studio_output_type:"Short"},
].map(x=>({...x,kind:"output",title:"Fixture "+x.output_id,output_status:"Ready for Review",
  review_status:"Review Sent",studio_state:"Ready for Review",render_status:"Rendered"}));
const desk={ok:true,lanes:{needs_eyes:cards,auto_high:[],manual:[],needs_assets:[]},
  needs_assets_candidates:[],summary:{needs_eyes:4,auto_high:0,manual:0,needs_assets_pile:0}};
const policy={enabled:true,stage:"expanded",mode:"global_ig_reel_story_v1",max_total:20,max_per_profile:10};
let job=null,started=0,retried=0,unexpected=[];
const send=(res,value,status=200)=>{
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(value));
};
function rebuild(phase) {
  if(!job)return;
  const failed=phase==="failed",done=phase==="done";
  job={
    ...job,status:failed||done?"completed":"queued",
    approved_count:done?3:failed?2:0,
    failed_count:failed?1:0,pending_count:failed||done?0:3,
    done_count:failed||done?3:0,can_retry:failed,
    updated_at:new Date().toISOString(),
    children:[
      {profile_id:chicago,status:done||failed?"completed":"queued",total:2,
        done_count:done||failed?2:0,approved_count:done||failed?2:0,pending_count:done||failed?0:2,failed_count:0},
      {profile_id:nyc,status:done||failed?"completed":"queued",total:1,
        done_count:done||failed?1:0,approved_count:done?1:0,pending_count:done||failed?0:1,failed_count:failed?1:0},
    ],
    items:cards.slice(0,3).map((x,i)=>({id:x.id,output_id:x.output_id,title:x.title,
      platform:x.platform,format:x.studio_output_type,profile_id:x.profile_id,
      status:done||i<2&&failed?"approved":failed?"failed":"pending",
      ...(failed&&i===2?{error:"Controlled synthetic rejection"}:{})})),
  };
}
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/"){
    const body='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
      +css+styles+'</head><body>'
      +'<select id="studioProfileSelect"><option value="'+chicago+'">Chicago</option><option value="'+nyc+'">New York</option></select>'
      +section+'<script src="/assets/factory-desk.js"></script></body></html>';
    res.writeHead(200,{"content-type":"text/html"});res.end(body);return;
  }
  if(url.pathname.startsWith("/assets/")){
    const file=path.resolve(root,"."+url.pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
    try{const data=readFileSync(file);res.writeHead(200,{"content-type":file.endsWith(".css")?"text/css":"text/javascript"});res.end(data)}
    catch{res.writeHead(404);res.end()}return;
  }
  if(url.pathname==="/api/factory/desk"&&req.method==="GET"){send(res,desk);return}
  if(url.pathname==="/api/factory/approval-batches"&&req.method==="GET"){
    const filter=url.searchParams.get("factory_profile");
    const visible=job&&(!filter || job.profile_ids.includes(filter));
    const batch=visible?job:null;
    send(res,{...(batch||{ok:true,batch:true,status:"idle",job_id:null,items:[]}),
      scope:"all",batches:batch?[batch]:[],
      totals:{batches:batch?1:0,active:batch?.pending_count?1:0,
        approved:batch?.approved_count||0,pending:batch?.pending_count||0,
        failed:batch?.failed_count||0},
      approvals_enabled:true,
      rollout:{enabled:true,mode:"chicago_ig_reels_v2",max_items:5,
        profile_id:chicago,platform:"Instagram",output_type:"Reel"},
      global_rollout:policy,quality_signals:[]});return;
  }
  if(url.pathname==="/api/factory/approval-batches"&&req.method==="POST"){
    let body="";for await(const piece of req)body+=piece;
    const payload=JSON.parse(body);
    if(payload.action==="start_group"){
      started++;
      assert.deepEqual(new Set(payload.record_ids),new Set(cards.slice(0,3).map(c=>c.id)));
      assert.equal(payload.content_profile_id,undefined);
      assert.equal(payload.items.length,3);
      job={ok:true,batch:true,group:true,accepted:true,job_id:"fg_"+payload.request_id,
        request_id:payload.request_id,profile_id:null,profile_ids:[chicago,nyc],
        created_at:new Date().toISOString()};
      rebuild("queued");send(res,job);
      setTimeout(()=>rebuild("failed"),180);return;
    }
    if(payload.action==="retry_group"){
      assert.equal(payload.request_id,job?.request_id);
      retried++;rebuild("queued");send(res,{...job,accepted:true});
      setTimeout(()=>rebuild("done"),180);return;
    }
  }
  unexpected.push(req.method+" "+url.pathname);send(res,{error:"Unexpected test route"},404);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const context=await browser.newContext({viewport:{width:1280,height:880}});
  const page=await context.newPage(),errors=[];
  page.on("pageerror",err=>errors.push(err.message));
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>Boolean(window.StudioFactoryDesk?.load));
  await page.evaluate(()=>document.querySelector("#page-factory").classList.add("active"));
  await page.evaluate(()=>window.StudioFactoryDesk.load());
  await page.getByText(/Global Factory \(expanded\): up to 20 Instagram Reels or Stories/).waitFor();
  await page.locator("[data-factory-band-toggle]").first().click();
  assert.equal(await page.locator("[data-factory-select-content]").count(),2);
  await page.locator("#factoryProfileFilter").selectOption(chicago);
  await page.locator("[data-factory-select-content]").first().check();
  await page.locator("#factoryProfileFilter").selectOption(nyc);
  await page.locator("[data-factory-select-content]").first().check();
  assert.match(await page.locator("#factoryBatchSelectionCount").innerText(),/3 outputs selected/);
  await page.locator("#factoryProfileFilter").selectOption("");
  await page.locator("#factoryBatchSubmit").click();
  await page.waitForFunction(()=>document.querySelector("#factoryDeskStatus").textContent.includes("accepted"));
  assert.equal(started,1);
  await new Promise(resolve=>setTimeout(resolve,240));
  await page.locator("#factoryBatchRefresh").click();
  await page.locator(".factory-batch-activity-choice").first().click();
  assert.equal(await page.locator(".factory-batch-child").count(),2);
  assert.equal(await page.locator("#factoryBatchDetails li").count(),3);
  assert.match(await page.locator("#factoryBatchSummary").innerText(),/2 approved/);
  await page.locator("#factoryBatchRetry").click();
  await page.waitForFunction(()=>document.querySelector("#factoryBatchSummary").textContent.includes("3 approved"),null,{timeout:15000});
  assert.equal(started,1);
  assert.equal(retried,1);
  await context.close();
  const phoneCtx=await browser.newContext({viewport:{width:390,height:844}});
  const phone=await phoneCtx.newPage();
  phone.on("pageerror",err=>errors.push(err.message));
  await phone.goto(origin,{waitUntil:"domcontentloaded"});
  await phone.waitForFunction(()=>Boolean(window.StudioFactoryDesk?.load));
  await phone.evaluate(()=>document.querySelector("#page-factory").classList.add("active"));
  await phone.evaluate(()=>window.StudioFactoryDesk.load());
  await phone.waitForFunction(()=>document.querySelector("#factoryBatchSummary").textContent.includes("3 approved"));
  await phone.locator(".factory-batch-activity-choice").first().click();
  assert.equal(await phone.locator(".factory-batch-child").count(),2);
  assert.deepEqual(errors,[]);
  assert.deepEqual(unexpected,[]);
  console.log("FACTORY_GLOBAL_GROUP_UI=PASS desktop_mobile=true profiles=2 outputs=3 retry_failed_only=true publish_calls=0");
  await phoneCtx.close();
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
