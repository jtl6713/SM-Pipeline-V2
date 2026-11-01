/**
 * Browser-only five-Reel operator canary: production-shipped Factory markup
 * and JS with a synthetic Chicago profile. All API calls are in-process fakes.
 * No Airtable, Cloudflare or social publishing credentials are present.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import path from "node:path";

const root=path.resolve("apps/studio-web");
const html=readFileSync(path.join(root,"index.html"),"utf8");
const start=html.indexOf('<section id="page-factory"');
const end=html.indexOf('<section id="page-support"',start);
assert.ok(start>=0&&end>start);
const section=html.slice(start,end);
const css=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)].map(m=>m[0]).join("\n");
const embedded=[...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map(m=>m[0]).join("\n");
const profile="recT2rbKX3MF7cVFU";
const la="recF7UAn0LkMZZrWZ";
const cards=[
  ["recCanaryChicagoReel001","Instagram","Reel"],
  ["recCanaryChicagoReel002","Instagram","Reel"],
  ["recCanaryChicagoReel003","Instagram","Reel"],
  ["recCanaryChicagoReel004","Instagram","Reel"],
  ["recCanaryChicagoReel005","Instagram","Reel"],
  ["recCanaryChicagoStory06","Instagram","Story"],
  ["recCanaryChicagoShort07","YouTube","Short"],
  ["recCanaryChicagoFbReel08","Facebook","Reel"],
].map(([id,platform,studio_output_type],i)=>({
  id,platform,studio_output_type,output_id:5500+i,kind:"output",
  content_id:"recCanaryContent001",profile_id:profile,
  profile_name:"ChicagoShining - Chicago",title:"Chicago pilot Reel",
  output_status:"Ready for Review",render_status:"Rendered",
  review_status:"Review Sent",studio_state:"Ready for Review",can_preview:false,
}));
const desk={ok:true,summary:{needs_eyes:4,auto_high:0,needs_assets_pile:0,needs_assets_max:3,manual:0},
 lanes:{needs_eyes:cards,auto_high:[],needs_assets:[],manual:[]},
 needs_assets_candidates:[]};
let started=0,job=null,errors=[],posts=[];
const respond=(res,body,status=200)=>{
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(body));
};
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/"){
    const page='<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      css+embedded+'</head><body>'+
      '<select id="studioProfileSelect"><option value="'+profile+'">Chicago</option><option value="'+la+'">Los Angeles</option></select>'+
      section+'<script src="/assets/factory-desk.js"></script></body></html>';
    res.writeHead(200,{"content-type":"text/html"});res.end(page);return;
  }
  if(url.pathname.startsWith("/assets/")){
    const file=path.resolve(root,"."+url.pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
    try{const data=readFileSync(file);res.writeHead(200,{"content-type":file.endsWith(".css")?"text/css":"text/javascript"});res.end(data)}
    catch{res.writeHead(404);res.end()}return;
  }
  if(url.pathname==="/api/factory/desk"&&req.method==="GET"){respond(res,desk);return}
  if(url.pathname==="/api/factory/approval-batches"&&req.method==="GET"){
    const isGlobal=url.searchParams.get("scope")==="all";
    const selected=isGlobal ? url.searchParams.get("factory_profile") :
      url.searchParams.get("profile")||url.searchParams.get("profile_id");
    const pilot=isGlobal ? (!selected || selected===profile) : selected===profile;
    respond(res,{
      ...(pilot && job ? job : {ok:true,batch:true,status:"idle",job_id:null,items:[]}),
      scope:isGlobal?"all":undefined,
      batches:isGlobal&&pilot&&job?[job]:[],
      totals:isGlobal?{batches:pilot&&job?1:0,active:pilot&&job&&["queued","running"].includes(job.status)?1:0,
        approved:pilot&&job?job.approved_count:0,failed:pilot&&job?job.failed_count:0}:undefined,
      approvals_enabled:isGlobal?true:pilot,
      rollout:{enabled:pilot,mode:"chicago_ig_reels_v2",max_items:5,
        profile_id:profile,platform:"Instagram",output_type:"Reel"},
      quality_signals:[],
    });return;
  }
  if(url.pathname==="/api/factory/approval-batches"&&req.method==="POST"){
    let text="";for await(const chunk of req)text+=chunk;
    const payload=JSON.parse(text);
    posts.push(payload);
    assert.equal(payload.action,"start");
    assert.equal(payload.content_profile_id,profile);
    assert.deepEqual(payload.record_ids,cards.slice(0,5).map(card=>card.id));
    assert.equal(payload.items.length,5);
    started++;
    job={
      ok:true,batch:true,accepted:true,status:"queued",
      request_id:payload.request_id,job_id:"fb_"+payload.request_id,profile_id:profile,
      total:5,approved_count:0,failed_count:0,pending_count:5,skipped_count:0,done_count:0,
      can_retry:false,updated_at:new Date().toISOString(),
      items:cards.slice(0,5).map(card=>({id:card.id,platform:"Instagram",format:"Reel",status:"pending"}))
    };
    respond(res,job);
    setTimeout(()=>{
      job={...job,status:"completed",approved_count:5,pending_count:0,done_count:5,
        updated_at:new Date().toISOString(),
        items:cards.slice(0,5).map(card=>({id:card.id,platform:"Instagram",format:"Reel",status:"approved"}))};
    },150);
    return;
  }
  errors.push(req.method+" "+url.pathname);respond(res,{error:"Unexpected request"},404);
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const origin="http://127.0.0.1:"+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const desktop=await browser.newContext({viewport:{width:1365,height:900}});
  const page=await desktop.newPage();
  const jsErrors=[];
  page.on("pageerror",e=>jsErrors.push(e.message));
  await page.goto(origin,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.StudioFactoryDesk?.load);
  await page.evaluate(()=>document.querySelector("#page-factory").classList.add("active"));
  await page.evaluate(()=>window.StudioFactoryDesk.load());
  await page.locator('[data-factory-band-toggle]').first().click();
  await page.getByText(/Chicago Reel pilot: select up to five Instagram Reels per batch/i).waitFor();
  assert.equal(await page.locator("[data-factory-select-output]").count(),8);
  assert.equal(await page.locator("[data-factory-select-output]:not(:disabled)").count(),5,
    "Exactly five Chicago Instagram Reels may be selected for pilot batch approval");
  assert.equal(await page.locator("[data-factory-select-output]:disabled").count(),3);
  await page.locator("[data-factory-select-content]").first().check();
  assert.match(await page.locator("#factoryBatchSelectionCount").innerText(),/5 outputs selected/);
  assert.equal(await page.locator("#factoryBatchSubmit").isEnabled(),true);
  await page.locator("#factoryBatchSubmit").click();
  await page.waitForFunction(()=>document.getElementById("factoryDeskStatus").textContent.includes("accepted"));
  assert.equal(started,1);
  await desktop.close();
  await new Promise(resolve=>setTimeout(resolve,240));
  const phoneCtx=await browser.newContext({viewport:{width:390,height:844}});
  const phone=await phoneCtx.newPage();
  phone.on("pageerror",e=>jsErrors.push(e.message));
  await phone.goto(origin,{waitUntil:"domcontentloaded"});
  await phone.waitForFunction(()=>window.StudioFactoryDesk?.load);
  await phone.evaluate(()=>document.querySelector("#page-factory").classList.add("active"));
  await phone.evaluate(()=>window.StudioFactoryDesk.load());
  await phone.waitForFunction(()=>document.getElementById("factoryBatchSummary").textContent.includes("5 approved"));
  assert.equal(started,1,"Status restoration must not send a second approval");
  // Studio header controls neither Factory history nor rollout eligibility.
  await phone.locator("#studioProfileSelect").selectOption(la);
  await phone.locator("#factoryBatchRefresh").click();
  assert.match(await phone.locator("#factoryBatchSummary").innerText(),/5 approved/);
  assert.equal(await phone.locator("#factoryProfileFilter").inputValue(),"");
  // Factory's own selector scopes displayed review rows.
  await phone.locator("#factoryProfileFilter").selectOption(la);
  assert.equal(await phone.locator("[data-factory-select-output]").count(),0);
  await phone.locator("#factoryProfileFilter").selectOption("");
  await phone.locator('[data-factory-band-toggle]').first().click();
  assert.equal(await phone.locator("[data-factory-select-output]").count(),8);
  assert.equal(await phone.locator("[data-factory-select-output]:not(:disabled)").count(),5);
  assert.equal(await phone.locator("[data-factory-select-output]:disabled").count(),3);
  assert.deepEqual(posts.map(x=>x.record_ids),[cards.slice(0,5).map(card=>card.id)]);
  assert.deepEqual(jsErrors,[]);
  assert.deepEqual(errors,[]);
  await phoneCtx.close();
  console.log("FACTORY_CHICAGO_FIVE_REELS_UI_CANARY=PASS; desktop=5_eligible; Story_YouTube_Facebook_excluded=true; mobile_status_restored=true; factory_filter_independent=true; publish_calls=0");
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
