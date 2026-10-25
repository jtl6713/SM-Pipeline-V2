import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {runPublicationRecovery,readRecoveryState,writeRecoveryState,publicationDiscoveryFormula,PRIORITY_VERIFIED_EXISTING_POSTS} from "./exception-recovery-background.mjs";
function bucket() {
  const data=new Map();let version=0;
  return {
    async get(key){const found=data.get(key);return found?{etag:String(found.version),text:async()=>found.text}:null;},
    async put(key,text,options) {
      const before=data.get(key),condition=options?.onlyIf;
      if(condition?.etagMatches && condition.etagMatches!==String(before?.version)) return null;
      if(condition?.get?.("If-None-Match")==="*"&&before)return null;
      data.set(key,{text,version:++version});return {key};
    },
    async list({prefix,limit,cursor}) {
      const keys=[...data.keys()].filter(k=>k.startsWith(prefix)).sort();
      const start=Number(cursor)||0,end=start+limit;
      return {objects:keys.slice(start,end).map(key=>({key})),truncated:end<keys.length,cursor:String(end)};
    },
  };
}
test("disabled scan touches neither provider nor Airtable",async()=>{
  assert.equal((await runPublicationRecovery({},{})).status,"disabled");
});
test("duplicate scheduled invocations share canonical durable lease",async()=>{
  const store=bucket(),env={STUDIO_MEDIA:store,PUBLICATION_RECONCILIATION_SCAN_ENABLED:"true"};
  let release,start;const started=new Promise(r=>start=r);let calls=0;
  const deps={discover:async()=>{calls++;start();await new Promise(r=>release=r);return {records:[]};}};
  const first=runPublicationRecovery(env,deps);await started;
  await assert.rejects(runPublicationRecovery(env,deps),e=>e.status===409);
  release();assert.equal((await first).status,"completed");
  assert.equal((await runPublicationRecovery(env,deps)).status,"cooldown");assert.equal(calls,1);
});
test("restart retains discovery cursor and applies configured processing limit",async()=>{
  const store=bucket();let now=1000000000000;const observed=[];
  const env={STUDIO_MEDIA:store,PUBLICATION_RECONCILIATION_SCAN_ENABLED:"true",PUBLICATION_RECONCILIATION_BATCH_SIZE:"1"};
  const ids=["recAAAAAAAAAAAAAA","recBBBBBBBBBBBBBB"];
  let scan=0;
  const deps={now:()=>now,discover:async options=>{
    if(scan++)assert.equal(options.offset,"next-airtable-page");
    return {records:ids.map(id=>({id})),offset:"next-airtable-page"};},
    readOutput:async id=>{observed.push(id);return {id,fields:{Platform:"TikTok",Content_Profile:["recCCCCCCCCCCCCCC"],Review_Status:"Approved"}};},
    appendAudit:async()=>{},verifyRemote:async()=>{throw new Error("must not verify unsupported provider");}};
  await runPublicationRecovery(env,deps);assert.deepEqual(observed,[ids[0]]);
  now+=16*60000;await runPublicationRecovery(env,deps);assert.deepEqual(observed,ids);
});
test("journal requires durable readback and discovery is all-profile",async()=>{
  await assert.rejects(writeRecoveryState({put:async()=>{},get:async()=>null},"key",{pending:true}));
  const store=bucket();await writeRecoveryState(store,"key",{pending:true});
  assert.deepEqual(await readRecoveryState(store,"key"),{pending:true});
  assert.ok(!publicationDiscoveryFormula().includes("Content_Profile"));
});
test("integration uses existing cron, authenticated admin history and no publishing stage",()=>{
  const worker=fs.readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const source=fs.readFileSync(new URL("./worker-functions-04.mjs",import.meta.url),"utf8");
  assert.match(worker,/ctx\.waitUntil\(studioPublicationRecoveryCron\(env\)/);
  assert.match(worker,/if \(isAdminExceptionHistoryRoute\) \{\s*requirePermission\(authorization, "tenant_admin"\)/);
  assert.equal((worker.match(/if \(isAdminExceptionHistoryRoute\)/g)||[]).length,1);
  assert.doesNotMatch(worker,/isAdminPublicationRecoveryHistoryRoute/);
  const section=source.slice(source.indexOf("export async function studioPublicationRecoveryCron"),source.indexOf("export async function getStudioPublicationRecoveryHistory"));
  assert.ok(!/studioPulse|upload|publish-kick|finalizeExistingPost/.test(section));
  assert.match(section,/method:"PATCH"/);
});

test("discovery only scans approved YouTube outputs with an existing remote identity and no completed handoff",()=>{
 const formula=publicationDiscoveryFormula(Date.parse("2026-10-24T12:00:00Z"));
 assert.match(formula,/\{Platform\}="YouTube"/);
 assert.match(formula,/\{Platform\}="Instagram"/);
 assert.match(formula,/\{IG_Carousel_Published_Media_ID\}!=""/);
 assert.match(formula,/\{Review_Status\}="Approved"/);
 assert.match(formula,/\{Do_Not_Publish\}=0/);
 assert.match(formula,/\{YouTube_Video_ID\}!=""|\{Platform_Post_ID\}!=""/);
 assert.match(formula,/\{Publish_Status\}!="Published Privately"/);
 assert.match(formula,/\{Output_Status\}!="Awaiting Public Release"/);
});

test("approved single-canary deployment never scans or processes unrelated backlog",async()=>{
 const store=bucket(),canary="recAAAAAAAAAAAAAA";const visited=[];
 const env={STUDIO_MEDIA:store,PUBLICATION_RECONCILIATION_SCAN_ENABLED:"true",
   PUBLICATION_RECONCILIATION_ENABLED:"true",PUBLICATION_RECONCILIATION_CANARY_RECORD:canary};
 const deps={now:()=>Date.parse("2026-10-24T12:00:00Z"),
   discover:async()=>{throw new Error("canary must not paginate whole Airtable queue");},
   readOutput:async id=>{visited.push(id);return {id,fields:{
     Platform:"YouTube",Review_Status:"Approved",Content_Profile:["recBBBBBBBBBBBBBB"]}};},
   verifyRemote:async()=>{throw new Error("unavailable");},appendAudit:async()=>{},
   patchStatus:async()=>{throw new Error("not authorized");}};
 const result=await runPublicationRecovery(env,deps);
 assert.equal(result.status,"completed");
 assert.deepEqual(visited,[canary]);
 assert.equal(result.corrected,0);
});

test("bounded recovery inspects four exact existing receipts once before resuming ordinary queue",async()=>{
 const store=bucket();let now=Date.parse("2026-10-25T03:30:00Z");
 const env={STUDIO_MEDIA:store,PUBLICATION_RECONCILIATION_SCAN_ENABLED:"true",
   PUBLICATION_RECONCILIATION_ENABLED:"true",PUBLICATION_RECONCILIATION_BOUNDED_ENABLED:"true",
   PUBLICATION_RECONCILIATION_BATCH_SIZE:"2"};
 const observed=[];
 const deps={now:()=>now,discover:async()=>({records:[]}),
   readOutput:async id=>{observed.push(id);return {id,fields:{
     Platform:"TikTok",Review_Status:"Approved",Content_Profile:["recBBBBBBBBBBBBBB"]
   }};},
   appendAudit:async()=>{},verifyRemote:async()=>{throw Error("No provider call for unsupported destination");},
   patchStatus:async()=>{throw Error("Never modify an unverified output");}};
 const first=await runPublicationRecovery(env,deps);
 assert.equal(first.inspected,2);
 assert.deepEqual(observed,PRIORITY_VERIFIED_EXISTING_POSTS.slice(0,2));
 now+=16*60000;
 const second=await runPublicationRecovery(env,deps);
 assert.equal(second.inspected,2);
 assert.deepEqual(observed,PRIORITY_VERIFIED_EXISTING_POSTS);
 now+=16*60000;
 await runPublicationRecovery(env,deps);
 assert.deepEqual(observed,PRIORITY_VERIFIED_EXISTING_POSTS,
   "Priority is exhausted after one bounded pass and never replays blindly");
 const control=await readRecoveryState(store,"studio/state/publication-reconciliation/v1/control.json");
 assert.equal(control.priority_cursor,4);
});
test("read-only and exact-canary stages never select priority records",async()=>{
 assert.equal(PRIORITY_VERIFIED_EXISTING_POSTS.length,4);
 for(const id of PRIORITY_VERIFIED_EXISTING_POSTS) assert.match(id,/^rec[A-Za-z0-9]{14}$/);
 const store=bucket(),env={STUDIO_MEDIA:store,
   PUBLICATION_RECONCILIATION_SCAN_ENABLED:"true",
   PUBLICATION_RECONCILIATION_BATCH_SIZE:"1"};
 const got=[];
 await runPublicationRecovery(env,{discover:async()=>({records:[{id:"recAAAAAAAAAAAAAA"}]}),
   readOutput:async id=>{got.push(id);return {id,fields:{Platform:"TikTok",Review_Status:"Approved",Content_Profile:["recBBBBBBBBBBBBBB"]}};},
   appendAudit:async()=>{}});
 assert.deepEqual(got,["recAAAAAAAAAAAAAA"]);
});
