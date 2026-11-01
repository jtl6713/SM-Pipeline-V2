import test from "node:test";
import assert from "node:assert/strict";
import {
  CHICAGO_PROFILE_ID, REVIEW_PILOT, REVIEW_SCHEMA,
  reviewEligibility, enrollReview, applyReviewEvent,
  reviewDispatchGate, cleanupCandidates,
} from "./rendering-review-policy.mjs";

const policy = {...REVIEW_PILOT, enabled: true};
const base = {
  id: "recChicagoOutput123", profile_id: CHICAGO_PROFILE_ID,
  output_type: "Instagram Reel", platform: "Instagram",
  output_status: "Ready for Review", publish_status: "Pending",
  render_status: "Rendered", final_file_id: "drive-original-123",
};
const requestId = n => "request-" + String(n).padStart(7, "0");
const fingerprint = n => "digest-" + String(n).padStart(7, "0");
let sequence = 0;
const transition = (session, type, fields = {}) => {
  const n = ++sequence;
  return applyReviewEvent(session, {
    type, expected_version: session.version,
    idempotency_key: requestId(n), fingerprint: fingerprint(n),
    at: "2026-10-27T23:00:00Z", ...fields,
  }).session;
};
const create = (o = base) => enrollReview(o, {
  verified: true, id: "hold-chicago123",
  output_id: o.id, owner: "session-12345678",
}, policy, {
  session_id: "session-12345678", original_attempt_id: "attempt-00000001",
});
const plan = (s, overrides = {}) => transition(s, "PROPOSE_PLAN", {
  plan_hash: "planhash-12345678", plan_version: s.latest_plan_version + 1,
  frozen: true, missing_assets: [], acceptance_checks: ["Narration has requested instructions"],
  ...overrides,
});
const commit = (s, props = {}) => transition(s, "COMMIT_PLAN", {
  plan_hash: s.plan.hash, plan_version: s.plan.version,
  intent: "explicit_go_ahead", attempt_id: "attempt-00000002",
  job_id: "job-00000000002", ...props,
});
const rendered = (s, {artifact = "artifact-00000002"} = {}) => {
  s = transition(s, "RENDER_STARTED", {job_id:s.active_job.id, attempt_id:s.current_attempt_id});
  s = transition(s, "RENDER_VALIDATING", {job_id:s.active_job.id, attempt_id:s.current_attempt_id});
  return transition(s, "RENDER_READY", {
    job_id:s.active_job.id, attempt_id:s.current_attempt_id,
    plan_hash:s.active_job.plan_hash, validation_passed:true,
    artifact_id:artifact,
  });
};
const throws = (fn, code) => assert.throws(fn, err => err.code === code);

test("pilot policy is disabled by default; no sampled or automatic admission", () => {
  assert.equal(REVIEW_PILOT.enabled,false);
  assert.equal(REVIEW_PILOT.sample_percent,0);
  assert.equal(REVIEW_PILOT.quality_auto_admission,false);
  assert.equal(REVIEW_PILOT.scheduled_auto_admission,false);
  assert.equal(reviewEligibility(base).reason,"FEATURE_DISABLED");
  assert.equal(reviewEligibility(base,policy,"sampled").reason,"AUTOMATIC_ENROLLMENT_DISABLED");
  assert.equal(reviewEligibility(base,policy,"quality").allowed,false);
  assert.equal(reviewEligibility(base,policy).allowed,true);
});

test("Chicago Instagram Reel only, even when API input bypasses UI", () => {
  for (const output of [
    {...base,profile_id:"recNYCabcdefghijk"},
    {...base,profile_id:"recLAabcdefghijk"},
    {...base,profile_id:"recMiamiabcdefgh"},
    {...base,platform:"Facebook"},
    {...base,output_type:"Instagram Story"},
    {...base,output_type:"YouTube Short"},
  ]) assert.equal(reviewEligibility(output,policy).reason,"OUTSIDE_PILOT_SCOPE");
});

test("enrollment refuses any published, dispatching, incomplete, or existing output", () => {
  const disallowed=[
    [{published_at:"2026-10-27"}, "DISPATCH_ALREADY_STARTED"],
    [{post_id:"meta-1234"}, "DISPATCH_ALREADY_STARTED"],
    [{output_status:"Published"}, "DISPATCH_ALREADY_STARTED"],
    [{publish_status:"Publishing"}, "DISPATCH_ALREADY_STARTED"],
    [{publish_started_at:"2026-10-27"}, "DISPATCH_ALREADY_STARTED"],
    [{publish_locked_at:"2026-10-27"}, "DISPATCH_ALREADY_STARTED"],
    [{publish_locked_by:"AP1-IG-producer"}, "DISPATCH_ALREADY_STARTED"],
    [{platform_media_id:"existing-instagram-container"}, "DISPATCH_ALREADY_STARTED"],
    [{dispatch_lease_active:true}, "DISPATCH_ALREADY_STARTED"],
    [{render_status:"Rendering"}, "NO_COMPLETED_RENDER"],
    [{final_file_id:"",final_file_url:""}, "NO_COMPLETED_RENDER"],
    [{review_session_exists:true}, "ALREADY_ENROLLED"],
  ];
  for (const [patch,reason] of disallowed) assert.equal(
    reviewEligibility({...base,...patch},policy).reason,reason);
});

test("enrollment requires an authoritative verified and owned hold", () => {
  const hold={verified:true,id:"hold-00000001",output_id:base.id,owner:"session-12345678"};
  const options={session_id:"session-12345678",original_attempt_id:"attempt-00000001"};
  for (const patch of [
    {verified:false},{output_id:"recOther999999999"},{owner:"session-other1234"},{id:"bad"},
  ]) throws(()=>enrollReview(base,{...hold,...patch},policy,options),"HOLD_NOT_VERIFIED");
  const s=enrollReview(base,hold,policy,options);
  assert.equal(s.schema,REVIEW_SCHEMA);
  assert.equal(s.state,"ready_for_review");
  assert.equal(s.attempts[0].artifact_id,base.final_file_id);
  assert.equal(s.review_hold.active,true);
});

test("unselected legacy path untouched; held review blocks dispatch regardless of feature switch", () => {
  const s=create();
  assert.equal(reviewDispatchGate(null,base,null).allowed,true);
  assert.deepEqual(reviewDispatchGate(s,base,{
    attempt_id:"attempt-00000001",artifact_id:base.final_file_id,
  }),{allowed:false,reason:"REVIEW_HOLD_ACTIVE"});
});

test("persistable user and producer transcript; timestamp-linked feedback", () => {
  let s=create();
  s=transition(s,"MESSAGE",{message_id:"message-00000001",role:"user",content:"Make the train instructions clearer",timestamp_seconds:12});
  s=transition(s,"MESSAGE",{message_id:"message-00000002",role:"producer",content:"I can propose a worked journey."});
  assert.equal(s.messages.length,2);
  assert.equal(s.messages[0].timestamp_seconds,12);
  assert.equal(s.messages[1].role,"producer");
  assert.equal(s.state,"discussing");
  assert.equal(JSON.parse(JSON.stringify(s)).messages[0].content,"Make the train instructions clearer");
});

test("idempotent replay does not advance version or append messages", () => {
  const s=create();
  const event={
    type:"MESSAGE",role:"user",message_id:"message-00000001",content:"More detail",
    expected_version:s.version,idempotency_key:"request-00000001",fingerprint:"digest-00000001",
  };
  const once=applyReviewEvent(s,event).session;
  const replay=applyReviewEvent(once,event);
  assert.equal(replay.replay,true);
  assert.equal(replay.session.version,once.version);
  assert.equal(replay.session.messages.length,1);
  throws(()=>applyReviewEvent(once,{...event,fingerprint:"digest-different12"}),"IDEMPOTENCY_CONFLICT");
  throws(()=>applyReviewEvent(once,{...event,idempotency_key:"request-00000002"}),"STALE_SESSION");
});

test("producer conversation cannot approve or publish by itself", () => {
  let s=create();
  s=transition(s,"MESSAGE",{message_id:"message-00000003",role:"user",content:"Go ahead"});
  assert.equal(s.state,"discussing");
  assert.equal(s.approved_attempt_id,null);
  assert.equal(reviewDispatchGate(s,base,{attempt_id:s.current_attempt_id,artifact_id:base.final_file_id}).allowed,false);
});

test("missing assets block commit; validated upload does not automatically render", () => {
  let s=plan(create(),{missing_assets:["image-required123"]});
  assert.equal(s.state,"awaiting_assets");
  throws(()=>commit(s),"REVIEW_NOT_READY");
  throws(()=>transition(s,"ASSET_VALIDATED",{plan_hash:s.plan.hash,plan_version:s.plan.version,
    requirement_id:"image-required123",validation_passed:false}),"ASSET_NOT_VALIDATED");
  s=transition(s,"ASSET_VALIDATED",{plan_hash:s.plan.hash,plan_version:s.plan.version,
    requirement_id:"image-required123",validation_passed:true});
  assert.equal(s.state,"plan_ready");
  assert.equal(s.active_job,null);
  throws(()=>commit(s,{intent:"suggested"}),"COMMIT_NOT_AUTHORIZED");
});

test("conditional authorization binds one frozen plan and creates exactly one job", () => {
  let s=plan(create(),{missing_assets:["image-required123"]});
  s=transition(s,"AUTHORIZE_AFTER_ASSETS",{plan_hash:s.plan.hash,
    plan_version:s.plan.version,intent:"explicit_go_ahead"});
  s=transition(s,"ASSET_VALIDATED",{plan_hash:s.plan.hash,
    plan_version:s.plan.version,requirement_id:"image-required123",validation_passed:true});
  s=commit(s,{intent:"authorized_after_assets"});
  assert.equal(s.state,"queued");
  assert.equal(s.latest_attempt_number,2);
  assert.equal(s.attempts.length,2);
  assert.equal(s.active_job.id,"job-00000000002");
  throws(()=>commit(s),"REVIEW_NOT_READY");
});

test("new plan revokes previous conditional authorization", () => {
  let s=plan(create(),{missing_assets:["image-required123"]});
  s=transition(s,"AUTHORIZE_AFTER_ASSETS",{plan_hash:s.plan.hash,plan_version:s.plan.version,intent:"explicit_go_ahead"});
  s=plan(s,{plan_hash:"planhash-22222222",missing_assets:[]});
  assert.equal(s.pending_authorization,null);
  throws(()=>commit(s,{intent:"authorized_after_assets"}),"COMMIT_NOT_AUTHORIZED");
});

test("concurrent or stale plans cannot overwrite latest content", () => {
  let s=plan(create());
  throws(()=>transition(s,"COMMIT_PLAN",{
    plan_hash:"oldplan-12345678",plan_version:s.plan.version,
    intent:"explicit_button",attempt_id:"attempt-00000002",job_id:"job-00000000002",
  }),"STALE_PLAN");
  throws(()=>transition(s,"PROPOSE_PLAN",{
    plan_hash:"badplan-12345678",plan_version:s.plan.version,
    frozen:true,missing_assets:[],
  }),"INVALID_PLAN");
});

test("revision commitment immediately invalidates old approval and cannot publish while queued", () => {
  let s=create();
  s.approved_attempt_id="attempt-00000001";
  s=commit(plan(s));
  assert.equal(s.approved_attempt_id,null);
  assert.equal(s.current_attempt_id,"attempt-00000002");
  assert.equal(reviewDispatchGate(s,base,{attempt_id:"attempt-00000001",artifact_id:base.final_file_id}).allowed,false);
});

test("render-ready requires authenticated matching job, stage, plan, and validation", () => {
  let s=commit(plan(create()));
  throws(()=>transition(s,"RENDER_READY",{
    job_id:s.active_job.id,attempt_id:s.current_attempt_id,plan_hash:s.active_job.plan_hash,
    validation_passed:true,artifact_id:"artifact-00000002",
  }),"RENDER_NOT_VALIDATED");
  s=transition(s,"RENDER_STARTED",{job_id:s.active_job.id,attempt_id:s.current_attempt_id});
  s=transition(s,"RENDER_VALIDATING",{job_id:s.active_job.id,attempt_id:s.current_attempt_id});
  throws(()=>transition(s,"RENDER_READY",{
    job_id:s.active_job.id,attempt_id:s.current_attempt_id,plan_hash:"wrongplan-123456",
    validation_passed:true,artifact_id:"artifact-00000002",
  }),"RENDER_NOT_VALIDATED");
  const ready=transition(s,"RENDER_READY",{
    job_id:s.active_job.id,attempt_id:s.current_attempt_id,plan_hash:s.active_job.plan_hash,
    validation_passed:true,artifact_id:"artifact-00000002",
  });
  assert.equal(ready.state,"ready_for_review");
  assert.equal(ready.active_job,null);
  assert.equal(ready.attempts[1].artifact_id,"artifact-00000002");
});

test("retry infrastructure failure without consuming another attempt number", () => {
  let s=commit(plan(create()));
  s=transition(s,"RENDER_FAILED",{job_id:s.active_job.id,attempt_id:s.current_attempt_id});
  const priorNumber=s.latest_attempt_number;
  s=transition(s,"RETRY_ATTEMPT",{
    attempt_id:s.current_attempt_id,plan_hash:s.plan.hash,plan_version:s.plan.version,
    job_id:"job-00000000003",
  });
  assert.equal(s.latest_attempt_number,priorNumber);
  assert.equal(s.attempts.length,2);
  assert.equal(s.active_job.id,"job-00000000003");
  assert.deepEqual(s.attempts[1].job_history,["job-00000000002","job-00000000003"]);
});

test("late callback from failed job does not promote after retry", () => {
  let s=commit(plan(create()));
  s=transition(s,"RENDER_FAILED",{job_id:s.active_job.id,attempt_id:s.current_attempt_id});
  s=transition(s,"RETRY_ATTEMPT",{
    attempt_id:s.current_attempt_id,plan_hash:s.plan.hash,plan_version:s.plan.version,
    job_id:"job-00000000003",
  });
  const priorVersion=s.version;
  const n=++sequence;
  const result=applyReviewEvent(s,{type:"RENDER_READY",expected_version:s.version,
    idempotency_key:requestId(n),fingerprint:fingerprint(n),
    job_id:"job-00000000002",attempt_id:s.current_attempt_id,
    plan_hash:s.plan.hash,validation_passed:true,artifact_id:"artifact-stale-02"});
  assert.equal(result.ignored,true);
  assert.equal(result.session.version,priorVersion+1); // durable ignored callback audit
  assert.equal(result.session.attempts[1].artifact_id,null);
});

test("new creative plan has increasing plan and attempt version after success", () => {
  let s=rendered(commit(plan(create())));
  s=plan(s,{plan_hash:"planhash-22222222"});
  assert.equal(s.latest_plan_version,2);
  s=commit(s,{attempt_id:"attempt-00000003",job_id:"job-00000000003"});
  assert.equal(s.latest_attempt_number,3);
  assert.equal(s.attempts[2].parent_id,"attempt-00000002");
  assert.equal(s.attempts[1].status,"ready_for_review");
});

test("Michigan Avenue Stroll: completed V2 stays reviewable after later Producer conversation", () => {
  let s=rendered(commit(plan(create())));
  const v2=s.current_attempt_id, artifact=s.attempts[1].artifact_id;
  assert.equal(s.latest_attempt_number,2);
  assert.equal(s.state,"ready_for_review");

  s=transition(s,"MESSAGE",{message_id:"message-stroll-00001",role:"user",
    content:"OK this is great. Now how can we get this applied across all like output types?"});
  assert.equal(s.state,"ready_for_review");
  assert.equal(s.review_hold.active,true);
  assert.equal(s.current_attempt_id,v2);
  assert.equal(s.attempts[1].artifact_id,artifact);

  const candidate={
    explanation:"Discuss matching outputs only; do not publish",
    narration:"Existing edited V2 is retained for human review",
    changes:[],timeline:[],requirements:[],acceptance_checks:[],
  };
  s=transition(s,"PRODUCER_CANDIDATE",{
    candidate,candidate_hash:"a".repeat(64),evidence_hash:"b".repeat(64),
    user_message_id:"message-stroll-00002",producer_message_id:"message-stroll-00003",
    direction:"How can this edit be applied to matching types?",
    summary:"The master can fan out only after independent QA and approval",
  });
  assert.equal(s.state,"ready_for_review");
  assert.equal(s.current_attempt_id,v2);
  assert.equal(s.attempts[1].status,"ready_for_review");
  assert.equal(s.producer_candidate.source_attempt_id,v2);
  assert.equal(s.plan,null);
  assert.equal(s.active_job,null);
  assert.equal(s.approved_attempt_id,null);
  assert.equal(s.review_hold.active,true);
  assert.equal(reviewDispatchGate(s,base,{attempt_id:v2,artifact_id:artifact}).allowed,false);

  // Human creative acceptance remains possible; it is not publishing approval.
  s=transition(s,"APPROVE_ATTEMPT",{
    pilot_creative_only:true,attempt_id:v2,artifact_id:artifact,
  });
  assert.equal(s.state,"approved");
  assert.equal(s.review_hold.active,true);
  assert.equal(reviewDispatchGate(s,base,{attempt_id:v2,artifact_id:artifact}).allowed,false);
});

test("only a completed current V2 is preserved; V1, invalid V2 and new plan still transition", () => {
  let v1=transition(create(),"MESSAGE",{
    role:"producer",message_id:"message-stroll-v1-01",content:"Let's revise V1",
  });
  assert.equal(v1.state,"discussing");

  let s=rendered(commit(plan(create())));
  const unvalidated=structuredClone(s);
  unvalidated.attempts[1].artifact_id=null;
  assert.equal(transition(unvalidated,"MESSAGE",{
    role:"user",message_id:"message-stroll-bad-01",content:"Revise",
  }).state,"discussing");

  const heldLost=structuredClone(s);
  heldLost.review_hold.active=false;
  throws(()=>transition(heldLost,"PRODUCER_CANDIDATE",{
    candidate:{explanation:"x",narration:"x",changes:[],timeline:[],requirements:[],acceptance_checks:[]},
    candidate_hash:"a".repeat(64),evidence_hash:"b".repeat(64),
    user_message_id:"message-stroll-lost-01",producer_message_id:"message-stroll-lost-02",
    direction:"go",summary:"respond",
  }),"PRODUCER_NOT_EDITABLE");

  s=transition(s,"MESSAGE",{
    role:"user",message_id:"message-stroll-new-01",content:"Please make another revision",
  });
  s=plan(s,{plan_hash:"planhash-stroll-03"});
  assert.equal(s.state,"plan_ready");
  assert.equal(s.current_attempt_id,"attempt-00000002");
});

test("feedback during rendering persists but cannot change in-flight job", () => {
  let s=commit(plan(create()));
  const jobId=s.active_job.id;
  s=transition(s,"MESSAGE",{message_id:"message-00000004",role:"user",content:"Change the last image on next attempt"});
  assert.equal(s.active_job.id,jobId);
  assert.equal(s.state,"queued");
  throws(()=>plan(s,{plan_hash:"planhash-33333333"}),"PLAN_NOT_EDITABLE");
});

test("approval bound to exact latest attempt and artifact, not stale file", () => {
  let s=rendered(commit(plan(create())));
  const attempt=s.current_attempt_id, artifact=s.attempts[1].artifact_id;
  throws(()=>transition(s,"APPROVE_ATTEMPT",{attempt_id:"attempt-00000001",artifact_id:base.final_file_id}),"STALE_OR_HELD_APPROVAL");
  throws(()=>transition(s,"APPROVE_ATTEMPT",{attempt_id:attempt,artifact_id:"wrongart-0000001"}),"STALE_OR_HELD_APPROVAL");
  throws(()=>transition(s,"APPROVE_ATTEMPT",{attempt_id:attempt,artifact_id:artifact,unrelated_hold_active:true}),"STALE_OR_HELD_APPROVAL");
  s=transition(s,"APPROVE_ATTEMPT",{attempt_id:attempt,artifact_id:artifact,pilot_creative_only:true});
  assert.equal(s.state,"approved");
  assert.equal(s.review_hold.active,true);
  assert.equal(reviewDispatchGate(s,base,{attempt_id:attempt,artifact_id:artifact}).allowed,false);
  throws(()=>transition(s,"RELEASE_REVIEW_HOLD",{hold_id:s.review_hold.id,hold_owner:s.id,scheduler_receipt_verified:false}),"HOLD_RELEASE_DENIED");
  s=transition(s,"RELEASE_REVIEW_HOLD",{hold_id:s.review_hold.id,hold_owner:s.id,scheduler_receipt_verified:true});
  assert.equal(s.review_hold.active,false);
  assert.equal(reviewDispatchGate(s,base,{attempt_id:attempt,artifact_id:artifact}).allowed,true);
  assert.equal(reviewDispatchGate(s,base,{attempt_id:"attempt-00000001",artifact_id:base.final_file_id}).allowed,false);
  assert.equal(reviewDispatchGate(s,{...base,unrelated_hold_active:true},{attempt_id:attempt,artifact_id:artifact}).allowed,false);
});

test("turning admissions off does not release an existing review hold", () => {
  let s=create();
  assert.equal(reviewEligibility(base,REVIEW_PILOT).allowed,false);
  assert.equal(reviewDispatchGate(s,base,{attempt_id:s.current_attempt_id,artifact_id:s.attempts[0].artifact_id}).allowed,false);
});

test("cancel with active job requires fencing; old attempt stays nonpublishable", () => {
  let s=commit(plan(create()));
  throws(()=>transition(s,"CANCEL",{}),"ACTIVE_JOB_NOT_FENCED");
  s=transition(s,"CANCEL",{job_fenced:true});
  assert.equal(s.active_job,null);
  assert.equal(s.state,"cancelled");
  assert.equal(s.review_hold.active,true);
  assert.equal(reviewDispatchGate(s,base,{attempt_id:"attempt-00000001",artifact_id:base.final_file_id}).allowed,false);
});

test("cleanup only selects unreferenced generated media owned by superseded attempts", () => {
  const files=[
    {id:"generatedA",owner_attempt_id:"attempt-00000001",generated:true,owned_by_attempt:true},
    {id:"generatedB",owner_attempt_id:"attempt-00000002",generated:true,owned_by_attempt:true},
    {id:"sharedC",owner_attempt_id:"attempt-00000001",generated:true,owned_by_attempt:true,shared:true},
    {id:"sourceD",owner_attempt_id:"attempt-00000001",generated:true,owned_by_attempt:true,canonical_source:true},
    {id:"publishedE",owner_attempt_id:"attempt-00000001",generated:true,owned_by_attempt:true,published_evidence:true},
    {id:"unownedF",owner_attempt_id:"attempt-00000001",generated:true,owned_by_attempt:false},
    {id:"uploadG",owner_attempt_id:"attempt-00000001",generated:false,owned_by_attempt:true},
    {id:"referencedH",owner_attempt_id:"attempt-00000001",generated:true,owned_by_attempt:true},
    {id:"unknownI",owner_attempt_id:"attempt-00000001",generated:true,owned_by_attempt:true},
  ];
  assert.deepEqual(cleanupCandidates(files,{
    generatedA:0,generatedB:0,sharedC:0,sourceD:0,publishedE:0,
    unownedF:0,uploadG:0,referencedH:1,
  },["attempt-00000002"]),["generatedA"]);
});


test("new user feedback invalidates a ready plan and conditional authorization",()=>{
  let s=plan(create(),{missing_assets:["image-required123"]});
  s=transition(s,"AUTHORIZE_AFTER_ASSETS",{
    plan_hash:s.plan.hash,plan_version:s.plan.version,intent:"explicit_go_ahead",
  });
  assert.ok(s.pending_authorization);
  s=transition(s,"MESSAGE",{message_id:"message-changed-11111",
    role:"user",content:"Actually, use a different opening image"});
  assert.equal(s.pending_authorization,null);
  assert.equal(s.plan.frozen,false);
  assert.equal(s.state,"discussing");
  throws(()=>commit(s),"REVIEW_NOT_READY");
});

test("frozen manifest must match trusted model candidate and deny publishing",()=>{
  const s=create();
  s.producer_candidate={hash:"a".repeat(64),stale:false};
  const manifest={source_attempt_id:s.current_attempt_id,output_id:s.output_id,
    profile_id:s.profile_id,candidate_hash:"a".repeat(64),
    allow_public_publish:false,allow_platform_upload:false,auto_approve:false};
  const frozen=plan(s,{immutable_manifest:manifest});
  assert.equal(frozen.plan.immutable_manifest.candidate_hash,"a".repeat(64));
  throws(()=>plan(s,{immutable_manifest:{...manifest,allow_public_publish:true}}),"PLAN_SOURCE_UNVERIFIED");
  throws(()=>plan(s,{immutable_manifest:{...manifest,source_attempt_id:"attempt-invalid123"}}),"PLAN_SOURCE_UNVERIFIED");
  throws(()=>plan(s,{immutable_manifest:{...manifest,candidate_hash:"b".repeat(64)}}),"PLAN_SOURCE_UNVERIFIED");
});
