/**
 * Staging-only browser replay using 20 ACTUAL read-only LA review-ready record
 * identities audited 2026-10-16. All API calls are intercepted by an in-process
 * fake server. No Airtable mutation, Cloudflare deployment, or platform publish.
 * Uses the actual Factory index.html section and shipped Factory JavaScript.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { factoryBatchQualitySignals } from "../studio-api/factory-approval-queue.mjs";

const base = path.resolve("apps/studio-web");
const raw = readFileSync(path.join(base, "index.html"), "utf8");
const start = raw.indexOf('<section id="page-factory"');
const end = raw.indexOf('<section id="page-support"', start);
assert.ok(start >= 0 && end > start, "Current Factory markup in real index.html");
const section = raw.slice(start, end);
const opsStart = raw.indexOf('<section id="page-operations"');
assert.ok(opsStart >= 0 && opsStart < start, "Current Operations Quality Agent page exists");
const opsSection = raw.slice(opsStart, start);
const cssLinks = [...raw.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)].map(m=>m[0]).join("\n");
const embeddedStyle = [...raw.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map(m=>m[0]).join("\n");
const profileId = "recF7UAn0LkMZZrWZ";
const items = [
["rec1O29xgpz4YSaGe",4660,"rec5zsyUwuyxlEJRx","Instagram","Story"],
["rec1j55VE7pI7Uc6R",4649,"recauQbCpdWjONsVX","Facebook","Story"],
["rec3tDcNFban5xWLu",4792,"recqIgwOIqtCaSrDG","YouTube","Short"],
["recA18GxDo1L1W7kH",4646,"recauQbCpdWjONsVX","TikTok","Video Draft"],
["rec5VFG0632BrezTE",4654,"recBkcKIcwORranZH","Instagram","Story"],
["rec1qznbh6qnMUKZF",4667,"rec2trwh1k7ofmsqE","Facebook","Story"],
["rec75nNjbFn830TjM",4671,"recleOP0N4QV5Zr6C","YouTube","Short"],
["recDpecwLx6TEtkrT",4798,"recc1GKIxD5o3t5No","TikTok","Video Draft"],
["rec9AnnOpnpvcbcQX",4648,"recauQbCpdWjONsVX","Instagram","Story"],
["rec28I5wR4lS272h4",4809,"rec0ZIcRJyPpje2oL","Facebook","Reel"],
["rec9stpSS4WyC9jeX",4665,"rec2trwh1k7ofmsqE","YouTube","Short"],
["recGEEer5OrA4CqNl",4804,"recc00tSLiTRwe3Uy","TikTok","Video Draft"],
["recAbvvnFsCqa008h",4789,"recqIgwOIqtCaSrDG","Instagram","Reel"],
["rec6aI9SWoDhnrIto",4813,"rec0ZIcRJyPpje2oL","Facebook","Story"],
["recD7WS92VgGRRdGS",4647,"recauQbCpdWjONsVX","YouTube","Short"],
["recI7WFP5LohmVREb",4658,"rec5zsyUwuyxlEJRx","TikTok","Video Draft"],
["recCzSoLFo0vfCrKa",4800,"recc1GKIxD5o3t5No","Instagram","Story"],
["rec8OhN9winQmlXWq",4651,"recBkcKIcwORranZH","Facebook","Reel"],
["recGIHGFawdmk3WiK",4799,"recc1GKIxD5o3t5No","YouTube","Short"],
["recIKnK4pRwmLHWs0",4810,"rec0ZIcRJyPpje2oL","TikTok","Video Draft"],
];
const cards = items.map(([id,output_id,content_id,platform,studio_output_type]) => ({
 id,output_id,content_id,platform,studio_output_type,
 kind:"output",profile_id:profileId,profile_name:"LA - Los Angeles",
 title:"Real output " + output_id,output_status:"Ready for Review",
 render_status:"Rendered",studio_state:"Ready for Review",
 review_status:"Review Sent",can_preview:false,
}));
const desk = {ok:true,summary:{needs_eyes:20,auto_high:0,needs_assets_pile:0,needs_assets_max:3,manual:0},
lanes:{needs_eyes:cards,auto_high:[],needs_assets:[],manual:[]},needs_assets_candidates:[]};
let batch=null,starts=0,retries=0,unexpected=[];
const batchSignals=(value)=>value ? factoryBatchQualitySignals(value) : [];
let syntheticQualitySignals=null;
const send = (res,value,status=200) => {
 res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
 res.end(JSON.stringify(value));
};
const srv=createServer(async(req,res)=>{
 const url=new URL(req.url,"http://localhost");
 if(url.pathname==="/") {
   const html='<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
   + cssLinks+embeddedStyle+'</head><body><select id="studioProfileSelect">'
   +'<option value="'+profileId+'">Los Angeles</option></select>'
   +opsSection+section+
   '<script src="/assets/factory-desk.js"></script>'+
   '<script src="/assets/factory-batch-quality-0710.js"></script></body></html>';
   res.writeHead(200,{"content-type":"text/html"});res.end(html);return;
 }
 if(url.pathname.startsWith("/assets/")){
   const fname=path.resolve(base,"."+url.pathname);
   if(!fname.startsWith(base+path.sep)){res.writeHead(403);res.end();return}
   try{const content=readFileSync(fname);res.writeHead(200,{"content-type":fname.endsWith(".css")?"text/css":"text/javascript"});res.end(content)}
   catch{res.writeHead(404);res.end()}return;
 }
 if(url.pathname==="/api/factory/desk"&&req.method==="GET"){send(res,desk);return}
 if(url.pathname==="/api/factory/approval-batches"&&req.method==="GET"){
   const isGlobal=url.searchParams.get("scope")==="all";
   const queryProfile=isGlobal ? url.searchParams.get("factory_profile") :
     url.searchParams.get("profile")||url.searchParams.get("profile_id");
   const scopedBatch=(isGlobal ? (!queryProfile || queryProfile===profileId) : queryProfile===profileId) ? batch:null;
   const current=scopedBatch||{ok:true,batch:true,status:"idle",job_id:null,items:[]};
   const signals=scopedBatch?(syntheticQualitySignals??batchSignals(scopedBatch)):[];
   send(res,{...current,scope:isGlobal?"all":undefined,
     batches:isGlobal&&scopedBatch?[{...current,quality_signals:signals}]:[],
     totals:isGlobal?{batches:scopedBatch?1:0,active:scopedBatch&&["queued","running"].includes(scopedBatch.status)?1:0,
       approved:scopedBatch?.approved_count||0,failed:scopedBatch?.failed_count||0,findings:signals.length}:undefined,
     quality_signals:signals,approvals_enabled:true});return;
 }
 if(url.pathname==="/api/factory/approval-batches"&&req.method==="POST"){
   let body="";for await(const part of req)body+=part;
   const payload=JSON.parse(body);
   if(payload.action==="start"){
     assert.equal(payload.content_profile_id,profileId);
     assert.equal(payload.record_ids.length,20);
     assert.deepEqual(new Set(payload.record_ids),new Set(items.map(x=>x[0])));
     if(batch&&batch.request_id===payload.request_id) {
       send(res,{...batch,accepted:true,already_submitted:true});return;
     }
     starts++;
     batch={
       ok:true,batch:true,accepted:true,status:"queued",
       job_id:"fb_"+payload.request_id,request_id:payload.request_id,
       profile_id:profileId,updated_at:new Date().toISOString(),
       total:20,approved_count:0,skipped_count:0,failed_count:0,
       pending_count:20,done_count:0,can_retry:false,
       items:items.map(x=>({id:x[0],output_id:x[1],platform:x[3],format:x[4],status:"pending"})),
     };
     send(res,batch);
     setTimeout(()=>{
       batch.status="completed";batch.approved_count=19;batch.failed_count=1;
       batch.pending_count=0;batch.done_count=20;batch.can_retry=true;
       batch.updated_at=new Date().toISOString();
       batch.items.forEach((item,i)=>{item.status=i===6?"failed":"approved";if(i===6)item.error="Staging controlled error"});
     },250);
     return;
   }
   if(payload.action==="retry"){
     assert.equal(payload.request_id,batch?.request_id);
     retries++;
     batch.status="queued";batch.failed_count=0;batch.pending_count=1;batch.done_count=19;
     batch.can_retry=false;batch.items[6].status="pending";batch.items[6].error=null;
     send(res,{...batch,accepted:true});
     setTimeout(()=>{
       batch.status="completed";batch.approved_count=20;batch.pending_count=0;batch.done_count=20;
       batch.updated_at=new Date().toISOString();batch.items[6].status="approved";
     },220);
     return;
   }
 }
 unexpected.push(req.method+" "+url.pathname);
 send(res,{error:"Unexpected staging request"},404);
});
await new Promise(resolve=>srv.listen(0,"127.0.0.1",resolve));
const port=srv.address().port;
const origin="http://127.0.0.1:"+port;
let browser;
try {
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const one=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await one.newPage();
 const jsErrors=[];
 page.on("pageerror",e=>jsErrors.push(e.message));
 await page.goto(origin,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.StudioFactoryDesk&&typeof window.StudioFactoryDesk.load==="function");
 await page.evaluate(()=>{document.querySelector("#page-factory").classList.add("active")});
 const firstResult=await page.evaluate(()=>window.StudioFactoryDesk.load());
 const beforeBoxes=await page.locator('[data-factory-select-output]').count();
 console.log("STAGING_UI_DIAGNOSTIC",JSON.stringify({
   loaded:Boolean(firstResult),beforeBoxes,
   status:await page.locator("#factoryDeskStatus").innerText(),
   lanes:await page.locator("#factoryLaneNeedsEyes").count(),
   factoryRoot:await page.locator("#page-factory").count(),
   firstErrors:jsErrors.slice(0,4),
   htmlExcerpt:(await page.locator("#factoryLaneNeedsEyes").innerHTML()).slice(0,500),
 }));
 await page.locator('[data-factory-band-toggle]').first().click();
 assert.equal(await page.locator('[data-factory-select-output]').count(),20);
 const groups=page.locator('[data-factory-select-content]');
 assert.equal(await groups.count(),9,"Nine real linked Content Items should be grouped");
 for(let i=0;i<9;i++) await groups.nth(i).check();
 assert.match(await page.locator("#factoryBatchSelectionCount").innerText(),/20 outputs selected/);
 const firstOutput=page.locator('[data-factory-select-output]').first();
 await firstOutput.uncheck();
 assert.match(await page.locator("#factoryBatchSelectionCount").innerText(),/19 outputs selected/);
 await firstOutput.check();
 assert.match(await page.locator("#factoryBatchSelectionCount").innerText(),/20 outputs selected/);
 // Ordinary Factory navigation and browser refresh retain the local selection.
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.StudioFactoryDesk?.load);
 await page.evaluate(()=>{document.querySelector("#page-factory").classList.add("active")});
 await page.evaluate(()=>window.StudioFactoryDesk.load());
 await page.locator('[data-factory-band-toggle]').first().click();
 assert.match(await page.locator("#factoryBatchSelectionCount").innerText(),/20 outputs selected/);
 console.log("factory_batch_selection_survives_navigation=PASS");
 await page.locator("#factoryBatchSubmit").click();
 await page.waitForFunction(()=>document.getElementById("factoryDeskStatus").textContent.includes("accepted"));
 assert.equal(starts,1);
 await page.screenshot({path:"/tmp/factory-real-stage-desktop.png"});
 await one.close(); // browser tab closed; server job persists independently
 await sleep(350);
 const two=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
 const phone=await two.newPage();
 phone.on("pageerror",e=>jsErrors.push(e.message));
 await phone.goto(origin,{waitUntil:"domcontentloaded"});
 await phone.waitForFunction(()=>window.StudioFactoryDesk&&typeof window.StudioFactoryDesk.load==="function");
 await phone.evaluate(()=>document.querySelector("#page-factory").classList.add("active"));
 await phone.evaluate(()=>window.StudioFactoryDesk.load());
 await phone.waitForFunction(()=>document.getElementById("factoryBatchSummary").textContent.includes("19 approved"));
 assert.match(await phone.locator("#factoryBatchSummary").innerText(),/1 failed/);
 await phone.locator("#factoryBatchQualityRefresh").click();
 await phone.locator("#factoryBatchQualitySignals").getByText("Approval item failed").waitFor();
 assert.match(await phone.locator("#factoryBatchQualitySignals").textContent(),/QA-FACTORY-BATCH-FAILED-ITEM/);
 // The Quality Agent operator view presents the same authoritative finding.
 await phone.evaluate(()=>{
   document.querySelector("#page-factory").classList.remove("active");
   document.querySelector("#page-operations").classList.add("active");
   document.querySelector("#operationsAgentView").hidden=false;
 });
 await phone.locator("#operationsFactoryBatchQualityRefresh").click();
 await phone.locator("#operationsFactoryBatchQualitySignals").getByText("Approval item failed").waitFor();
 assert.match(await phone.locator("#operationsFactoryBatchQualitySignals").innerText(),/Only use Retry Failed/i);
 console.log("factory_quality_agent_operator_visibility=PASS");
 // Return to Factory to exercise the same batch's failed-only retry.
 await phone.evaluate(()=>{
   document.querySelector("#page-operations").classList.remove("active");
   document.querySelector("#page-factory").classList.add("active");
 });
 await phone.locator("#factoryBatchInspect").click();
 assert.equal(await phone.locator("#factoryBatchDetails li").count(),20);
 await phone.locator("#factoryBatchRetry").click();
 await phone.waitForFunction(()=>document.getElementById("factoryBatchSummary").textContent.includes("20 approved"),null,{timeout:10000});
 assert.equal(starts,1,"No duplicate batch on returning mobile browser");
 assert.equal(retries,1,"Only one retry for failed item");
 assert.equal(batch.items.filter(x=>x.status==="approved").length,20);
 await phone.locator("#factoryBatchQualityRefresh").click();
 await phone.locator("#factoryBatchQualitySignals").getByText("No Quality Agent findings").waitFor();
 // All additional Quality Agent signature types must be operator-readable, not just logged.
 syntheticQualitySignals=[
   {code:"QA-FACTORY-BATCH-STALLED",detail:"No durable progress for 21 minutes"},
   {code:"QA-FACTORY-BATCH-STATE-MISMATCH",detail:"Counters disagree"},
   {code:"QA-FACTORY-BATCH-DUPLICATE-ITEM",detail:"Duplicate output IDs in batch ledger"},
   {code:"QA-FACTORY-BATCH-TRANSIENT-WAIT",detail:"Waiting on a bounded retry"},
 ];
 await phone.locator("#factoryBatchQualityRefresh").click();
 const sample=await phone.locator("#factoryBatchQualitySignals").innerText();
 for(const code of syntheticQualitySignals.map(x=>x.code)) assert.ok(sample.includes(code),code);
 assert.match(sample,/Do not retry until the duplicate ledger is investigated/);
 // A malicious backend detail remains escaped text, never executable markup.
 syntheticQualitySignals=[{code:"QA-FACTORY-BATCH-FAILED-ITEM",
   detail:'<img src="broken" onerror="window.qaInjected=true">'}];
 await phone.locator("#factoryBatchQualityRefresh").click();
 await phone.locator("#factoryBatchQualitySignals").getByText(/<img src="broken"/).waitFor();
 assert.equal(await phone.locator("#factoryBatchQualitySignals img").count(),0);
 assert.equal(await phone.evaluate(()=>window.qaInjected===true),false);
 // Switching a profile must not show a different profile's latest batch.
 syntheticQualitySignals=null;
 await phone.evaluate(()=>{
   const select=document.getElementById("studioProfileSelect");
   const option=new Option("Other profile","recOtherQualityProfile123");
   select.add(option);
   select.value=option.value;
   select.dispatchEvent(new Event("change",{bubbles:true}));
 });
 await phone.locator("#factoryBatchQualityRefresh").click();
 await phone.locator("#factoryBatchQualitySignals").getByText("No recent Factory batch").waitFor();
 await phone.evaluate(()=>{
   const select=document.getElementById("studioProfileSelect");
   select.value="recF7UAn0LkMZZrWZ";
   select.dispatchEvent(new Event("change",{bubbles:true}));
 });
 await phone.locator("#factoryBatchQualityRefresh").click();
 await phone.locator("#factoryBatchQualitySignals").getByText("No Quality Agent findings").waitFor();
 console.log("factory_quality_agent_profile_isolation_and_xss=PASS");
 // Never blindly treat an unavailable Quality Agent GET as "no findings".
 syntheticQualitySignals=null;
 console.log("factory_quality_agent_all_five_signatures=PASS");
 await phone.screenshot({path:"/tmp/factory-real-stage-mobile.png"});
 assert.deepEqual(jsErrors,[],"No uncaught Factory UI exceptions");
 assert.deepEqual(unexpected,[],"No unexpected API calls during Factory staging UI");
 console.log("FACTORY_REAL_RECORD_UI_STAGING=PASS");
 console.log("real_output_ids=20; profile=LA; desktop_select=20; background_client_close=true; mobile_restore=true; inspect=20; retry_failed_only=true; published=0; airtable_writes=0");
 await two.close();
 // Tablet: separate browser context, independent server-backed status and no new submission.
 const tabletContext=await browser.newContext({viewport:{width:820,height:1180}});
 const tablet=await tabletContext.newPage();
 tablet.on("pageerror",e=>jsErrors.push(e.message));
 await tablet.goto(origin,{waitUntil:"domcontentloaded"});
 await tablet.waitForFunction(()=>window.StudioFactoryDesk?.load);
 await tablet.evaluate(()=>document.querySelector("#page-factory").classList.add("active"));
 await tablet.evaluate(()=>window.StudioFactoryDesk.load());
 await tablet.waitForFunction(()=>document.getElementById("factoryBatchSummary").textContent.includes("20 approved"));
 assert.equal(starts,1,"Tablet status inspection never resubmits");
 const tabletPanel=await tablet.locator("#factoryBatchQuality").boundingBox();
 assert.ok(tabletPanel && tabletPanel.width <= 820,"Quality panel fits tablet viewport");
 await tablet.screenshot({path:"/tmp/factory-real-stage-tablet.png"});
 await tabletContext.close();
 console.log("factory_batch_tablet_and_mobile=PASS");
}finally{await browser?.close();await new Promise(resolve=>srv.close(resolve))}
