import test from "node:test";
import assert from "node:assert/strict";
import {
  validateUnbilledChicagoVideoAttempt,
  reconcileUnbilledChicagoVideoAttempt,
  UNBILLED_CHICAGO_VIDEO_ACK,
} from "./story-first-ai-video-unbilled-reconciliation.mjs";

const context = { ideaId:"recTgiblVhRnCfNuf", sceneNumber:1, profileId:"recT2rbKX3MF7cVFU" };
const evidence = {
  acknowledgement:UNBILLED_CHICAGO_VIDEO_ACK,
  no_charge_confirmed:true,
  provider_post_absent_confirmed:true,
  no_provider_generation_confirmed:true,
};
const job = {
  schema:"studio.story-video.1",run_id:"a518c3ae-79d2-4134-a4fe-933dddc0e991",
  idea_id:context.ideaId,scene_number:1,profile_id:context.profileId,
  attempt:1,state:"submission_uncertain",generation_id:null,
  approved_at:"2026-11-09T22:03:15.000Z",
  estimated_credits:2425,error:"Manual provider/reference reconciliation required",
  provider_asset_ids:[],
  settings:{
    prompt:"A cinematic aerial view of the Chicago River at golden hour, with skyscrapers reflecting warm sunlight on the water. Smooth forward camera movement, realistic architecture, beautiful natural lighting, photorealistic, no text or logos.",
    duration_secs:4,model_id:"veo-3.1-fast-generate-001",aspect_ratio:"9:16",resolution:"720p",
    generate_audio:false, references:{start_frame:null,end_frame:null,images:[],videos:[],audios:[]}
  },
};

test("exact one-scene no-charge recovery preserves original job and creates immutable-audit payload", () => {
  assert.equal(validateUnbilledChicagoVideoAttempt(job,context,evidence),true);
  const recovered = reconcileUnbilledChicagoVideoAttempt(job,context,evidence,"admin@example.test",
    Date.parse("2026-11-09T22:30:00.000Z"));
  assert.equal(job.state,"submission_uncertain","source is not modified");
  assert.equal(recovered.next.state,"failed");
  assert.equal(recovered.next.attempt,1,"recorded original attempt retained");
  assert.equal(recovered.next.run_id,job.run_id);
  assert.equal(recovered.next.reconciliation.original_run_id,job.run_id);
  assert.equal(recovered.next.reconciliation.evidence.no_charge_confirmed,true);
  assert.equal(recovered.audit.original_job.state,"submission_uncertain");
  assert.equal(recovered.audit.reconciliation.kind,"operator_verified_unbilled_cloudflare_redirect_error");
  assert.equal("generation_id" in recovered.next,true);
  assert.equal(recovered.next.generation_id,null);
});

test("fails closed for another profile, idea, scene or existing provider receipt", () => {
  for (const c of [{...context,ideaId:"recOtherIdea"},
     {...context,sceneNumber:2}, {...context,profileId:"recOtherProfile"}]) {
    assert.throws(()=>validateUnbilledChicagoVideoAttempt(job,c,evidence),/restricted/);
  }
  for (const changed of [
    {...job, state:"pending"},
    {...job, state:"failed"},
    {...job, attempt:2},
    {...job, generation_id:"gen123456789"},
    {...job, profile_id:"recOtherProfile"},
    {...job, run_id:""},
    {...job, approved_at:"2026-11-10T01:00:00.000Z"},
    {...job, error:"other provider failure"},
  ]) {
    assert.throws(()=>validateUnbilledChicagoVideoAttempt(changed,context,evidence));
  }
});

test("rejects mismatched paid quote, model, audio and uploaded references", () => {
  for (const changed of [
    {...job,estimated_credits:2500},
    {...job,settings:{...job.settings,model_id:"veo-3.1-generate-001"}},
    {...job,settings:{...job.settings,duration_secs:8}},
    {...job,settings:{...job.settings,aspect_ratio:"16:9"}},
    {...job,settings:{...job.settings,generate_audio:true}},
    {...job,settings:{...job.settings,prompt:"A different scene."}},
    {...job,settings:{...job.settings,references:{...job.settings.references,images:[{asset_id:"recImage1"}]}}},
    {...job,provider_asset_ids:["elevenReferenceId"]},
  ]) {
    assert.throws(()=>validateUnbilledChicagoVideoAttempt(changed,context,evidence));
  }
});

test("all three independent no-charge attestations and exact acknowledgement are mandatory", () => {
  for (const k of ["no_charge_confirmed","provider_post_absent_confirmed",
    "no_provider_generation_confirmed","acknowledgement"]) {
    const bad={...evidence,[k]:k==="acknowledgement"?"WRONG":false};
    assert.throws(()=>validateUnbilledChicagoVideoAttempt(job,context,bad),/explicitly attest/);
  }
});
