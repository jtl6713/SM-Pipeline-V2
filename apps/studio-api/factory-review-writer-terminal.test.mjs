import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { evaluateReviewPackage } from "./review-package-readiness.mjs";

const first = readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
const third = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
const CDN = "https://media.chicagoshining.com/";
const parent = { fields: {
  Thumbnail_URL: CDN + "studio/previews/thumbnails/content/ai-cover.png",
  Caption: "Caption from the content master",
}};
function extract(source, marker, stop, name, sandbox) {
  const a=source.indexOf(marker), b=source.indexOf(stop,a);
  assert.ok(a>0&&b>a, "Expected real source function "+name);
  return vm.runInNewContext(source.slice(a,b).replace("export async function", "async function")+"\n"+name+";",sandbox);
}
function stampHarness() {
  const writes=[];
  const context={
    f:(row,key)=>row?.fields?.[key],
    studioAiThumbnailUrl:value=>String(value||"").startsWith(CDN)?String(value):"",
    studioOutputIsNativePhotoRoute:()=>true,
    item4UrlIsStudioPhotoCrop:()=>false,
    evaluateReviewPackage,
    airtableFetch:async (_env,_table,id,payload)=>{writes.push({id,payload});return {id}},
  };
  return {
    stamp:extract(first,"export async function studioStampParentAiCoverOnOutput","/*__STUDIO_WORKER_END:studioStampParentAiCoverOnOutput__*/","studioStampParentAiCoverOnOutput",context),
    writes,
  };
}
function photo(fields={}) {
  return {id:"recCqQ25AvLeysIlS", fields:{
    Output_Status:"In Production",Platform:"Facebook",Studio_Output_Type:"Multi-Image Post",
    Render_Status:"Native Photo Route",Do_Not_Publish:false,
    ...fields,
  }};
}
test("AI cover writer NEVER reopens a skipped/held/returned/approved output",async()=>{
  const h=stampHarness();
  for(const fields of [
    {Output_Status:"Skipped",Review_Status:"Skipped",Do_Not_Publish:true},
    {Output_Status:"Skipped",Review_Status:"Skipped",Do_Not_Publish:false},
    {Output_Status:"Changes Requested",Review_Status:"Changes Requested"},
    {Output_Status:"Approved for Publishing",Review_Status:"Approved"},
    {Output_Status:"Published",Publish_Status:"Published"},
    {Output_Status:"Rendered",Do_Not_Publish:true},
    {Output_Status:"Rendered",Test_Run_ID:"qa-001"},
  ]){
    assert.equal(await h.stamp({AIRTABLE_OUTPUT_TABLE_ID:"test"},photo(fields),parent),false,JSON.stringify(fields));
  }
  assert.equal(h.writes.length,0);
});
test("AI cover writer may populate missing metadata, but may NOT promote incomplete native photos",async()=>{
  const h=stampHarness();
  const result=await h.stamp({AIRTABLE_OUTPUT_TABLE_ID:"test"},photo(),parent);
  assert.equal(result,true);
  assert.equal(h.writes.length,1);
  const patch=JSON.parse(h.writes[0].payload.body).fields;
  assert.ok(patch.Thumbnail_URL.startsWith(CDN));
  assert.equal(patch.Output_Caption,parent.fields.Caption);
  assert.equal(patch.Output_Status,undefined);
});
test("AI cover writer can promote complete, still-unreviewed native-photo media",async()=>{
  const h=stampHarness();
  const row=photo({
    Selected_Clip_Count:2,
    "Carousel Slides":["recSlide1","recSlide2"],
    Selected_Assets_JSON:JSON.stringify({selected_clips:[
      {url:CDN+"studio/previews/lettered/photo-1.jpg"},
      {url:CDN+"studio/previews/lettered/photo-2.jpg"},
    ]}),
    Studio_Preview_URL:CDN+"studio/previews/lettered/photo-1.jpg",
  });
  assert.equal(await h.stamp({AIRTABLE_OUTPUT_TABLE_ID:"test"},row,parent),true);
  const patch=JSON.parse(h.writes[0].payload.body).fields;
  assert.equal(patch.Output_Status,"Ready for Review");
  assert.equal(evaluateReviewPackage({id:row.id,fields:{...row.fields,...patch}}).readiness,"READY");
});
test("Phase6 ready restoration never resurrects a skipped output even with old rendered preview",async()=>{
  let calls=0;
  const fn=extract(third,"export async function phase6RestoreProductionReviewReady","/*__STUDIO_WORKER_END:phase6RestoreProductionReviewReady__*/","phase6RestoreProductionReviewReady",{
    f:(row,key)=>row?.fields?.[key],
    phase6PreviewFulfillsCurrentReview:()=>true,
    airtableFetch:async()=>{calls++;return null},
  });
  for(const row of [
    {id:"recSkipped1",fields:{Output_Status:"Skipped",Review_Status:"Skipped",Render_Status:"Rendered",Studio_Preview_URL:CDN+"ready.jpg"}},
    {id:"recSkipped2",fields:{Output_Status:"In Production",Review_Status:"Skipped",Render_Status:"Rendered",Studio_Preview_URL:CDN+"ready.jpg"}},
    {id:"recHeld",fields:{Output_Status:"In Production",Review_Status:"Review Sent",Render_Status:"Rendered",Do_Not_Publish:true}},
  ])assert.equal(await fn({},row),row);
  assert.equal(calls,0);
});
