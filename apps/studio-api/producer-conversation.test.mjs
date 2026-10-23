import test from "node:test";
import assert from "node:assert/strict";
import {readProducerThread, appendProducerThreadMessage, planConversationalSceneRevision} from "./producer-conversation.mjs";
const plan = {scene_order: Array.from({length:6},(_,i)=>({scene:i+1,media_asset_record_id:"rec"+String(i).repeat(14)}))};
const submit=(notes,revision,message,id="producer-msg-00000001")=>appendProducerThreadMessage(notes,{expected_revision:revision,message,message_id:id,at:"2026-10-23T00:00:00Z"},{producer_plan:plan});
test("scene four through six daylight preserves unaffected plan, narration and required media",()=>{
 const original=JSON.stringify(plan);
 const p=planConversationalSceneRevision("Please make scenes 4 through 6 more sunny. Keep the narration.",plan);
 assert.deepEqual(p.target_scenes,[4,5,6]);
 assert.equal(p.preferences.lighting,"brighter_daylight");
 assert.ok(p.preserve.includes("narration"));
 assert.equal(p.status,"proposed_not_executed");
 assert.equal(p.auto_publish,false);
 assert.equal(JSON.stringify(plan),original);
});
test("second half and closing scene scopes",()=>{
 assert.deepEqual(planConversationalSceneRevision("Make the second half brighter",plan).target_scenes,[4,5,6]);
 assert.deepEqual(planConversationalSceneRevision("I want a different closing scene",plan).target_scenes,[6]);
});
test("unspecified nuanced feedback is not fabricated as executed",()=>{
 const p=planConversationalSceneRevision("Make this cinematic but authentic",plan);
 assert.equal(p.requires_interpretation,true);
 assert.equal(p.status,"proposed_not_executed");
});
test("mandatory uploaded media cannot be silently replaced",()=>{
 const p=planConversationalSceneRevision("Replace the required uploaded photo in scene 2",plan);
 assert.equal(p.required_asset_override_blocked,true);
 assert.equal(p.requires_human_approval,true);
});
test("bad scene ranges fail closed",()=>{
 assert.throws(()=>planConversationalSceneRevision("Replace scenes 4 to 9",plan),/outside/);
 assert.throws(()=>planConversationalSceneRevision("Remove scene 0",plan),/outside/);
});
test("Airtable notes preserve original brief and Producer Plan and replay idempotently",()=>{
 const notes="Original creative brief! \n[producer-plan]{\"schema\":\"studio.producer-plan.1\"}[/producer-plan]";
 const a=submit(notes,0,"Please use more sunshine in scenes 4 through 6");
 assert.ok(a.notes.startsWith(notes));
 assert.equal(a.thread.revision,1);
 assert.deepEqual(readProducerThread(a.notes),a.thread);
 assert.equal(submit(a.notes,1,"Please use more sunshine in scenes 4 through 6").replay,true);
 assert.throws(()=>submit(a.notes,0,"Change it","producer-msg-00000002"),/reload/);
 const b=submit(a.notes,1,"Keep the original narration in scene 6","producer-msg-00000002");
 assert.equal(b.thread.messages.length,2);
 assert.equal(readProducerThread(b.notes).messages[0].content,"Please use more sunshine in scenes 4 through 6");
});
test("oversized content, corrupted thread and unknown identity fail closed",()=>{
 assert.throws(()=>submit("X".repeat(9600),0,"Sunny scenes"),/limit/);
 assert.throws(()=>readProducerThread("[studio-producer-thread]{not JSON}[/studio-producer-thread]"),/decoded/);
 assert.throws(()=>appendProducerThreadMessage("",{message:"ok",expected_revision:0,message_id:"x"}),/message id/);
});
