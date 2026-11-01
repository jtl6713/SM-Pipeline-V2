/**
 * Stage-replay of canonical Factory single-output and publishing-handoff path,
 * seeded with actual review-ready LA record identities independently verified
 * via Airtable. No Airtable/API/social network calls are made in this test.
 * Live production output state is not modified.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import { maeScheduleNextSlot, maeIsBlackoutLocalTime, maeScheduleConflicts } from "./mae-schedule.mjs";
import { factoryBatchEnqueue, factoryBatchDrain, factoryBatchSummary } from "./factory-approval-queue.mjs";

const PROFILE = "recF7UAn0LkMZZrWZ";
const TIMEZONE = "America/Los_Angeles";
const fixtures = [
["rec1O29xgpz4YSaGe",4660,"Instagram","Story"],
["rec1j55VE7pI7Uc6R",4649,"Facebook","Story"],
["rec3tDcNFban5xWLu",4792,"YouTube","Short"],
["recA18GxDo1L1W7kH",4646,"TikTok","Video Draft"],
["rec5VFG0632BrezTE",4654,"Instagram","Story"],
["rec1qznbh6qnMUKZF",4667,"Facebook","Story"],
["rec75nNjbFn830TjM",4671,"YouTube","Short"],
["recDpecwLx6TEtkrT",4798,"TikTok","Video Draft"],
["rec9AnnOpnpvcbcQX",4648,"Instagram","Story"],
["rec28I5wR4lS272h4",4809,"Facebook","Reel"],
["rec9stpSS4WyC9jeX",4665,"YouTube","Short"],
["recGEEer5OrA4CqNl",4804,"TikTok","Video Draft"],
["recAbvvnFsCqa008h",4789,"Instagram","Reel"],
["rec6aI9SWoDhnrIto",4813,"Facebook","Story"],
["recD7WS92VgGRRdGS",4647,"YouTube","Short"],
["recI7WFP5LohmVREb",4658,"TikTok","Video Draft"],
["recCzSoLFo0vfCrKa",4800,"Instagram","Story"],
["rec8OhN9winQmlXWq",4651,"Facebook","Reel"],
["recGIHGFawdmk3WiK",4799,"YouTube","Short"],
["recIKnK4pRwmLHWs0",4810,"TikTok","Video Draft"],
];
const worker=readStudioWorkerSource();
function extract(startMarker,endMarker){
 const a=worker.indexOf(startMarker),b=worker.indexOf(endMarker,a);
 assert.ok(a>=0&&b>a,"Source contains "+startMarker);
 return worker.slice(a,b);
}
const lookup=(record,key)=>record.fields[key];
class HttpError extends Error { constructor(status,message){super(message);this.status=status} }
const eligibleSource=extract("function studioOutputReadyForPublishApproval(", "async function studioPipelineSettingsProfileRecord(");
const eligible=new Function("f","studioIsFinishedPassthrough","studioFinishedOriginKind","studioOutputIsNativePhoto",
 eligibleSource+"\nreturn studioOutputReadyForPublishApproval")(
 lookup,()=>false,()=>"",()=>false,
);
const approvalSource=extract("async function factoryApproveOutput(", "function factoryFeedbackBlock(");
class MemoryR2{
 constructor(){this.objects=new Map();this.version=0}
 async get(key){const row=this.objects.get(key);return row?{etag:row.etag,text:async()=>JSON.stringify(row.value)}:null}
 async put(key,raw,options={}){
  const old=this.objects.get(key);
  if(options.onlyIf instanceof Headers&&options.onlyIf.get("If-None-Match")==="*"&&old)return null;
  if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;
  const row={value:JSON.parse(raw),etag:String(++this.version)};
  this.objects.set(key,row);return{etag:row.etag};
 }
 async list({prefix,limit=1000}){
  return{objects:[...this.objects.keys()].filter(x=>x.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false};
 }
}
test("20 actual LA record identities pass canonical Factory approval route against isolated stage records only",async()=>{
 const rows=new Map(fixtures.map(([id,number,platform,format])=>[id,{id,fields:{
  Output_ID:number,Platform:platform,Studio_Output_Type:format,
  Output_Status:"Ready for Review",Review_Status:"Review Sent",
  Render_Status:"Rendered",Publish_Status:"Not Ready",
  Final_File_URL:"https://staging.invalid/non-publishing-output.mp4",
  Do_Not_Publish:false,Content_Profile:[PROFILE],
 }}]));
 const occupancy={};let stagedWrites=0,stagedDispatchCalls=0;
 const wouldApprove=async(_env,record)=>{
   stagedWrites++;
   const platform=record.fields.Platform;
   const slots=occupancy[platform]||[];
   const slot=maeScheduleNextSlot({timeZone:TIMEZONE,horizonDays:30,
     now:new Date("2026-10-16T19:10:00Z"),occupiedMs:slots,platformOccupiedMs:slots});
   assert.equal(slot.ok,true);
   const instant=Date.parse(slot.iso);
   assert.equal(maeIsBlackoutLocalTime(instant,TIMEZONE),false);
   assert.equal(maeScheduleConflicts(instant,slots),false);
   (occupancy[platform]||=[]).push(instant);
   const next={...record,fields:{...record.fields,
     Review_Status:"Approved",Output_Status:"Approved for Publishing",
     Publish_Status:"Scheduled",Scheduled_Post_Date:slot.iso}};
   rows.set(record.id,next);
   return next;
 };
 const studioScheduleMs=(value)=>{const ms=Date.parse(String(value||""));return Number.isFinite(ms)?ms:null;};
 const factory=new Function("airtableFetch","f","HttpError",
  "studioOutputReadyForPublishApproval","approveOutputRecordForPublishing",
  "studioPublishCanDispatchNow","studioDispatchApprovedPublishAndSchedule",
  "studioScheduleMs","reconcileCreativeMasterAtFactoryApproval",
  approvalSource+"\nreturn factoryApproveOutput")(
   async(_env,_table,id)=>rows.get(id),
   lookup,HttpError,eligible,wouldApprove,()=>false,
   async()=>{stagedDispatchCalls++;return{skipped:"test-only"}},
   studioScheduleMs,
   async()=>({status:"no_master"})
 );
 const bucket=new MemoryR2();
 const profileId=PROFILE,requestId="factory_live_record_stage_20";
 const records=fixtures.map(([id,output_id,platform,format])=>({id,output_id,platform,format}));
 await factoryBatchEnqueue(bucket,{profileId,requestId,records});
 const context={waitUntil:promise=>{Promise.resolve(promise).catch(()=>{})}};
 const fn=async id=>{
   assert.equal(rows.get(id).fields.Content_Profile[0],profileId);
   return factory({AIRTABLE_OUTPUT_TABLE_ID:"test-stage-output"},id,"stage","",context);
 };
 const a=await factoryBatchDrain(bucket,{profileId,requestId,maxItems:12,approve:fn,makeOwner:()=>"stage1"});
 const b=await factoryBatchDrain(bucket,{profileId,requestId,maxItems:12,approve:fn,makeOwner:()=>"stage2"});
 assert.equal(a.processed+b.processed,20);
 assert.equal(factoryBatchSummary(b.job).approved_count,20);
 assert.equal(stagedWrites,20);
 assert.equal(stagedDispatchCalls,20); // mocked dispatch calls, zero external requests
 const repeat=await factoryBatchDrain(bucket,{profileId,requestId,maxItems:20,approve:fn});
 assert.equal(repeat.processed,0);
 assert.equal(stagedWrites,20);
 assert.equal(stagedDispatchCalls,20);
 for(const row of rows.values())assert.equal(row.fields.Review_Status,"Approved");
 console.log("FACTORY_REAL_RECORD_PUBLISHING_ROUTE_STAGE=PASS | 20 actual audited IDs | 20 sandbox-only writes | 20 intercepted dispatches | 0 Airtable writes | 0 social calls");
});
test("canonical Factory approval rejections prevent unsafe published/blocked/rerendering mutations",async()=>{
 const cases=[
  [{Output_Status:"Approved for Publishing",Review_Status:"Approved",Render_Status:"Rendered"}, "already_approved"],
  [{Output_Status:"Published",Publish_Status:"Published",Render_Status:"Rendered"}, "already_published"],
  [{Output_Status:"Ready for Review",Render_Status:"Rendering",Final_File_URL:"https://x.invalid"}, "rendering"],
  [{Output_Status:"Ready for Review",Render_Status:"Rendered",Do_Not_Publish:true,Final_File_URL:"https://x.invalid"}, "blocked"],
 ];
 for(const [fields,kind] of cases){
  let writes=0;
  const factory=new Function("airtableFetch","f","HttpError",
    "studioOutputReadyForPublishApproval","approveOutputRecordForPublishing",
    "studioPublishCanDispatchNow","studioDispatchApprovedPublishAndSchedule",
    "studioScheduleMs",
    approvalSource+"\nreturn factoryApproveOutput")(
      async()=>({id:"recFactoryGuardedExample",fields}),
      lookup,HttpError,eligible,async()=>{writes++;return{}},()=>false,async()=>{},
      (value)=>{const ms=Date.parse(String(value||""));return Number.isFinite(ms)?ms:null;}
    );
  if(kind==="already_approved"||kind==="already_published"){
    const r=await factory({AIRTABLE_OUTPUT_TABLE_ID:"stage"},"recFactoryGuardedExample","stage","",null);
    assert.equal(r[kind],true);
  }else await assert.rejects(()=>factory({AIRTABLE_OUTPUT_TABLE_ID:"stage"},"recFactoryGuardedExample","stage","",null),e=>e.status===409);
  assert.equal(writes,0);
 }
});
