import test from "node:test";
import assert from "node:assert/strict";
import { loadAuthoritativeFactoryCorrection } from "./factory-correction-authority.mjs";
import { productionFormatSignature } from "./production-format-groups.mjs";
const id=n=>"rec"+String(n).padStart(14,"0");
const signature=(family,format,aspect)=>({
  pipeline_family:family,format,aspect_ratio:aspect,
  key:productionFormatSignature({pipeline_family:family,format,aspect_ratio:aspect}),
});
function fixture(){
  const profile=id(90),content=id(91),request=id(92);
  const video=signature("Video","Vertical Short Video","9:16");
  const story=signature("Story","Vertical Story","9:16");
  const outputs=Array.from({length:5},(_,i)=>({
    id:id(i+1),fields:{
      Content_Item:[content],Production_Request:[request],
      Render_Status:"Rendered",Output_Status:"Ready for Review",
      Final_File_URL:"https://example.test/review-"+i+".mp4",
    },
  }));
  const mappings=outputs.map((o,i)=>({
    enabled:true,platform:["Instagram","Facebook","TikTok","YouTube","Instagram"][i],
    output_type:["Instagram Reel","Facebook Reel","TikTok Video","YouTube Short","Instagram Story"][i],
    platform_output_links:[o.id],render_format:i<4?video:story,
  }));
  const requestContent={id:content,fields:{Content_Profile:[profile],Production_Request:[request]}};
  const ops={
    outputId:outputs[0].id,productionRequestId:request,
    authorizedProfileIds:[profile],
    readOutput:async x=>outputs.find(row=>row.id===x),
    readContent:async()=>requestContent,readMappings:async()=>({records:mappings}),
  };
  return {ops,outputs,mappings,requestContent,profile};
}
test("all matching outputs come from Airtable mapping; Stories never inherit a Reel change",async()=>{
  const f=fixture();const result=await loadAuthoritativeFactoryCorrection(f.ops);
  assert.equal(result.outputs.length,4);
  assert.deepEqual(result.matches.map(x=>x.id),f.outputs.slice(0,4).map(x=>x.id));
  assert.equal(result.profile_id,f.profile);
});
test("any supported profile is eligible, unauthorized content is not",async()=>{
  const f=fixture();f.ops.authorizedProfileIds=['recAnotherProfile'];
  await assert.rejects(loadAuthoritativeFactoryCorrection(f.ops),e=>e.status===403);
  f.ops.authorizedProfileIds=[f.profile];
  assert.equal((await loadAuthoritativeFactoryCorrection(f.ops)).matches.length,4);
});
test("published and active-held siblings are excluded but cannot change source identity",async()=>{
  const f=fixture();f.outputs[1].fields.Platform_Post_URL="https://example.test/published";
  f.outputs[2].fields.Studio_Render_Review_Hold_Active=true;
  assert.deepEqual((await loadAuthoritativeFactoryCorrection(f.ops)).matches.map(x=>x.id),
    [f.outputs[0].id,f.outputs[3].id]);
});
test("cross-content mapping and a missing source are rejected",async()=>{
  const f=fixture();f.outputs[2].fields.Content_Item=[id(88)];
  await assert.rejects(loadAuthoritativeFactoryCorrection(f.ops),e=>e.status===409);
  f.outputs[2].fields.Content_Item=[f.requestContent.id];
  f.mappings[0].enabled=false;
  await assert.rejects(loadAuthoritativeFactoryCorrection(f.ops),e=>e.status===409);
});

test("render support is derived from exact persisted Remotion composition and mapping",async()=>{
  const f=fixture();
  // Absence of saved original props never authorizes a new revision job.
  assert.equal((await loadAuthoritativeFactoryCorrection(f.ops)).outputs[0].review_render_supported,false);
  f.outputs[0].fields.Remotion_Props_JSON=JSON.stringify({
    compositionId:"ChicagoShiningPhotoSequence",width:1080,height:1920,fps:30,
    clips:[{src:"https://source.test/asset.jpg"}]
  });
  const live=await loadAuthoritativeFactoryCorrection(f.ops);
  assert.equal(live.outputs[0].review_render_supported,true);
  assert.equal(live.outputs[1].review_render_supported,false);
});
