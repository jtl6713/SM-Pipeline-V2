import test from "node:test";
import assert from "node:assert/strict";
import {
  QA_IG_STALE_UPLOAD_SIGNATURE,
  classifyStaleInstagramReel,
  staleInstagramReelFormula,
  auditStaleInstagramReels,
  verifySavedInstagramContainer,
} from "./qa-ig-stale-upload.mjs";

const NOW = Date.parse("2026-11-02T18:00:00Z");
function row(overrides = {}) {
  return { id: "rec12345678901234", fields: {
    Output_ID: 9289, Platform: "Instagram",
    Platform_Output_Type: "Instagram Reel",
    Publish_Status: "Publishing", Publish_Locked_By: "AP1-IG",
    Publish_Locked_At: "2026-11-02T17:00:00Z",
    Last_Publish_Attempt_At: "2026-11-02T17:01:00Z",
    Output_Status: "Approved for Publishing", Review_Status: "Approved",
    Auto_Publish_Enabled: true, Publish_Method: "Automated", Content_Profile: ["rec12345678901235"],
    ...overrides,
  }};
}
test("detects 30-minute-old Reel lock but never authorizes a create or release", () => {
  const evidence = classifyStaleInstagramReel(row(), { nowMs: NOW });
  assert.equal(evidence.signature, QA_IG_STALE_UPLOAD_SIGNATURE);
  assert.equal(evidence.age_seconds, 59 * 60);
  assert.equal(evidence.auto_repair_authorized, false);
  assert.equal(evidence.runner_lease_verified, false);
  assert.equal(evidence.creates, 0);
  assert.match(staleInstagramReelFormula(NOW), /IS_BEFORE/);
});
test("ignores active, held, test, cooldown, replaced or published outputs", () => {
  for (const patch of [
    {Last_Publish_Attempt_At: "2026-11-02T17:45:00Z"},
    {Studio_Render_Review_Hold_ID: "hold"},
    {Do_Not_Publish: true}, {Test_Run_ID: "test"},
    {Replace_Transaction_ID: "replace"}, {Published_At: "2026-11-02T17:50:00Z"},
    {Publish_Next_Retry_At: "2026-11-02T18:30:00Z"},
    {Publish_Locked_By: "other"},
    {Publish_Method: "Manual"},
    {Studio_Render_Review_Session_ID: "review-session"},
  ]) assert.equal(classifyStaleInstagramReel(row(patch), {nowMs:NOW}), null);
});
test("released legacy guard refusals are audited but never treated as safe retries", () => {
  const unlocked = row({
    Publish_Locked_By: "", Publish_Locked_At: "",
    Publish_Started_At: "",
    Output_Notes: "QA-IG-STALE-UPLOAD: AP1-IG review guard refused continuation (publication_lock_changed)",
  });
  const evidence = classifyStaleInstagramReel(unlocked, { nowMs: NOW });
  assert.equal(evidence.lock_state, "released_legacy");
  assert.equal(evidence.exact_guard_refusal_recorded, true);
  assert.equal(evidence.action, "indeterminate_create_receipt");
  assert.equal(evidence.auto_repair_authorized, false);
  assert.equal(evidence.creates, 0);
  const formula=staleInstagramReelFormula(NOW);
  assert.match(formula,/Publish_Started_At/);
  assert.match(formula,/Last_Publish_Attempt_At/);
  assert.match(formula,/review guard refused continuation/);
  assert.match(formula,/Platform_Post_ID/);
});
test("unowned legacy must carry exact refusal or saved remote identity", () => {
  const blank = {
    Publish_Locked_By:"", Publish_Locked_At:"", Publish_Started_At:"",
    Output_Notes:"unrelated old publication",
  };
  assert.equal(classifyStaleInstagramReel(row(blank), {nowMs:NOW}), null);
  assert.equal(classifyStaleInstagramReel(
    row({...blank, Publish_Locked_By:"another-publisher", Platform_Post_ID:"18168690085479740"}), {nowMs:NOW}), null);
  assert.equal(classifyStaleInstagramReel(
    row({...blank, Publish_Started_At:"2026-11-02T17:01:00Z"}), {nowMs:NOW}), null);
});
test("saved post on released output with mismatched Published output state is read-only candidate",()=>{
  const candidate=row({
    Publish_Locked_By:"",Publish_Locked_At:"",Publish_Started_At:"",
    Output_Status:"Published", Platform_Post_ID:"18168690085479740",
  });
  const result=classifyStaleInstagramReel(candidate,{nowMs:NOW});
  assert.equal(result.lock_state,"released_legacy");
  assert.equal(result.output_status,"Published");
  assert.equal(result.action,"verify_existing_post");
  assert.equal(result.graph_create_authorized,undefined);
  // Real NYC #9098 has Published_At and Output_Status Published, but a
  // stranded Publishing status. This must remain GET-only until provider proof.
  const savedPublication = classifyStaleInstagramReel(row({
    ...candidate.fields,Published_At:"2026-11-02T17:30:00Z",
  }),{nowMs:NOW});
  assert.equal(savedPublication.action,"verify_existing_post");
  assert.equal(savedPublication.lock_state,"released_legacy");
  assert.equal(savedPublication.auto_repair_authorized,false);
  assert.equal(classifyStaleInstagramReel(row({
    ...candidate.fields,Output_Status:"Approved for Publishing",
    Published_At:"2026-11-02T17:30:00Z",
  }),{nowMs:NOW}),null);
});
test("released legacy cannot CAS fence or MAE reschedule even if a pre_remote R2 lease appears",async()=>{
  const candidate=row({
    Publish_Locked_By:"",Publish_Locked_At:"",Publish_Started_At:"",
    Output_Notes:"QA-IG-STALE-UPLOAD: AP1-IG review guard refused continuation (publication_lock_changed)",
  });
  let saved, recoverCalls=0;
  const entries=await auditStaleInstagramReels({},{
    nowMs:NOW, inspectLease:async()=>({available:true,state:{
      phase:"pre_remote", irreversible_possible:false,
      heartbeat_at:"2026-11-02T17:00:00Z",
      expires_ms:NOW-20000,generation:7,attempt_id:"token_legacy"
    }}),
    recoverSafe:async()=>{recoverCalls++;throw new Error("never recover legacy");},
    airtableFetch:async(_env,table,path,options)=>{
      if(table==="Quality Agent Recovery Ledger"){
        if(options?.method==="PATCH"){
          saved=JSON.parse(options.body).records[0].fields;
          return {records:[{id:"rec12345678901239"}]};
        }
        return {id:path,fields:saved};
      }
      return String(path).startsWith("?")?{records:[candidate]}:candidate;
    }
  });
  assert.equal(entries.length,1);
  assert.equal(entries[0].outcome,"released_legacy_needs_eyes");
  assert.equal(entries[0].pregraph_proof,false);
  assert.equal(entries[0].graph_create_authorized,false);
  assert.equal(entries[0].release_lock,false);
  assert.equal(entries[0].schedule_changed,false);
  assert.equal(entries[0].next_action,"needs_eyes_released_legacy_no_retroactive_graph_proof");
  assert.equal(recoverCalls,0);
  assert.equal(saved.Outcome,"released_legacy_needs_eyes");
});

test("saved media identity changes the action, not the permission", () => {
  assert.equal(classifyStaleInstagramReel(row({Platform_Media_ID:"18127559140783117"}), {nowMs:NOW}).action,
    "poll_saved_container_and_verify_post");
  assert.equal(classifyStaleInstagramReel(row({Platform_Post_ID:"18168690085479740"}), {nowMs:NOW}).action,
    "verify_existing_post");
});
test("records authenticated exact-ID receipt as a finding without mutating output", async () => {
  const subject = row({Platform_Post_ID:"18168690085479740"});
  const writes = [];
  const fetcher = async (_env, table, path, options) => {
    if (table === "Platform Outputs" && String(path).startsWith("?")) return {records:[subject]};
    if (table === "Platform Outputs" && path === subject.id) return subject;
    if (table === "Quality Agent Recovery Ledger" && options?.method === "PATCH") {
      writes.push(JSON.parse(options.body));
      return {records:[{id:"rec12345678901239"}]};
    }
    if (table === "Quality Agent Recovery Ledger" && path === "rec12345678901239")
      return {id:path,fields:writes[0].records[0].fields};
    throw new Error("Unexpected operation");
  };
  const results = await auditStaleInstagramReels({}, {
    airtableFetch:fetcher, nowMs:NOW, verifyProvider: async () => ({
      verified_public:true,ownership_verified:true,remote_id:"18168690085479740",
      evidence:"account_scoped_graph_media_membership_exact_id_permalink_timestamp",
    }),
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].provider_public_verified, true);
  assert.equal(results[0].release_lock, false);
  assert.equal(results[0].schedule_changed, false);
  assert.equal(writes.length,1);
  assert.equal(writes[0].records[0].fields.Outcome,
    "published_identity_verified_pending_reconciliation");
});
test("changed lock between discovery and reread blocks stale finding", async () => {
  const candidate=row();
  const writes=[];
  const result=await auditStaleInstagramReels({}, {nowMs:NOW,
    airtableFetch:async (_env, table, path, options) => {
      if (options) writes.push(1);
      return String(path).startsWith("?") ? {records:[candidate]}
        : row({Publish_Locked_At:"2026-11-02T17:05:00Z"});
    },
  });
  assert.deepEqual(result,[]);
  assert.deepEqual(writes,[]);
});
test("unknown provider state stays Needs Eyes; no Graph create", async () => {
  const candidate=row({Platform_Post_ID:"18168690085479740"});
  let logged;
  const rows=await auditStaleInstagramReels({}, {nowMs:NOW,
    airtableFetch:async (_env, table, path, options) => {
      if (options) { logged=JSON.parse(options.body); return {records:[{id:"rec12345678901239"}]}; }
      if (table === "Quality Agent Recovery Ledger")
        return {id:path,fields:logged.records[0].fields};
      return String(path).startsWith("?") ? {records:[candidate]} : candidate;
    },
    verifyProvider: async () => {throw new Error("provider offline");},
  });
  assert.equal(rows[0].outcome,"stale_lock_needs_eyes");
  assert.equal(rows[0].provider_public_verified,false);
  assert.equal(rows[0].graph_create_authorized,false);
  assert.equal(logged.records[0].fields.Outcome,"stale_lock_needs_eyes");
});

test("authenticated exact-ID container GET is read-only and never asserts published post", async () => {
  const candidate = row({Platform_Media_ID:"18127559140783117"});
  let method = "";
  const result = await verifySavedInstagramContainer(candidate, {
    expectedAccountId:"17841400000000000",
    settings:{META_GRAPH_API_ACCESS_TOKEN:"test-token",META_GRAPH_API_VERSION:"v26.0"},
    fetcher: async (url, options) => {
      method = options.method;
      assert.match(url, /18127559140783117/);
      return {ok:true,status:200,json: async () => ({
        id:"18127559140783117",status_code:"FINISHED",
      })};
    },
  });
  assert.equal(method,"GET");
  assert.equal(result.verified,true);
  assert.equal(result.status,"FINISHED");
  assert.equal(result.public_post_verified,false);
  assert.equal(result.new_containers,0);
});
test("unexpected container identity cannot authorize recovery", async () => {
  const result = await verifySavedInstagramContainer(
    row({Platform_Media_ID:"18127559140783117"}), {
    expectedAccountId:"17841400000000000",
    settings:{META_GRAPH_API_ACCESS_TOKEN:"test-token"},
    fetcher:async () => ({ok:true,status:200,json:async () => ({
      id:"18127559140783118",status_code:"FINISHED",
    })}),
  });
  assert.equal(result.verified,false);
});
test("existing saved container is audited without new Graph create or lock release", async () => {
  const candidate=row({Platform_Media_ID:"18127559140783117"});
  let persisted;
  const outcomes=await auditStaleInstagramReels({}, {
    nowMs:NOW,verifyContainer:async () => ({
      verified:true,container_id:"18127559140783117",status:"IN_PROGRESS",
      evidence:"authenticated_graph_get_exact_saved_container",
    }),
    airtableFetch: async (_env, table, path, options) => {
      if (options?.method==="PATCH") {
        persisted=JSON.parse(options.body).records[0].fields;
        return {records:[{id:"rec12345678901239"}]};
      }
      if (table==="Quality Agent Recovery Ledger")
        return {id:path,fields:persisted};
      return String(path).startsWith("?") ? {records:[candidate]} : candidate;
    },
  });
  assert.equal(outcomes[0].container_identity_verified,true);
  assert.equal(outcomes[0].container_status,"IN_PROGRESS");
  assert.equal(outcomes[0].outcome,"saved_container_verified_pending_fenced_resume");
  assert.equal(outcomes[0].graph_create_authorized,false);
  assert.equal(outcomes[0].release_lock,false);
});

test("saved container with provider PUBLISHED status is never offered for re-publish", async () => {
  const candidate=row({Platform_Media_ID:"18127559140783117"});
  let persisted;
  const events=await auditStaleInstagramReels({}, {
    nowMs:NOW,verifyContainer:async () => ({
      verified:true,container_id:"18127559140783117",status:"PUBLISHED",
      evidence:"authenticated_graph_get_exact_saved_container",
    }),
    airtableFetch: async (_env, table, path, options) => {
      if (options?.method==="PATCH") {
        persisted=JSON.parse(options.body).records[0].fields;
        return {records:[{id:"rec12345678901239"}]};
      }
      if (table==="Quality Agent Recovery Ledger") return {id:path,fields:persisted};
      return String(path).startsWith("?") ? {records:[candidate]} : candidate;
    },
  });
  assert.equal(events[0].outcome,"container_reports_published_receipt_unverified");
  assert.equal(events[0].next_action,"verify_exact_public_post_receipt_no_publish");
  assert.equal(events[0].graph_create_authorized,false);
});

test("durable pagination cursor eventually audits newer locks behind an old backlog", async () => {
  const first=row();
  const second={...row({Output_ID:9290}),id:"rec12345678901236"};
  const pages=[];
  let cursorBytes=null, saved=null;
  const bucket={
    get:async () => cursorBytes ? {text:async()=>cursorBytes} : null,
    put:async (_key,body) => {cursorBytes=body;},
  };
  const fetcher=async (_env,table,path,options) => {
    if (options?.method==="PATCH") {
      saved=JSON.parse(options.body).records[0].fields;
      return {records:[{id:"rec12345678901239"}]};
    }
    if (table==="Quality Agent Recovery Ledger") return {id:path,fields:saved};
    if (String(path).startsWith("?")) {
      pages.push(path);
      return path.includes("offset=page-two") ? {records:[second]}
        : {records:[first],offset:"page-two"};
    }
    return path===first.id?first:second;
  };
  const firstRun=await auditStaleInstagramReels({STUDIO_MEDIA:bucket},{
    nowMs:NOW,airtableFetch:fetcher,limit:1,
  });
  const secondRun=await auditStaleInstagramReels({STUDIO_MEDIA:bucket},{
    nowMs:NOW+60000,airtableFetch:fetcher,limit:1,
  });
  assert.equal(firstRun[0].record_id,first.id);
  assert.equal(secondRun[0].record_id,second.id);
  assert.ok(pages[1].includes("offset=page-two"));
  assert.equal(new URLSearchParams(pages[0].slice(1)).get("filterByFormula"),
    new URLSearchParams(pages[1].slice(1)).get("filterByFormula"));
  assert.equal(JSON.parse(cursorBytes).offset,null);
});

test("pre-remote lease can recover only after durable finding audit",async()=>{
  const candidate=row();
  const events=[];
  let currentLedger=null;
  let recovered=0;
  const output=await auditStaleInstagramReels({},{
    nowMs:NOW,
    inspectLease:async()=>({available:true,state:{
      phase:"pre_remote",irreversible_possible:false,
      heartbeat_at:"2026-11-02T17:00:00Z",
      expires_ms:NOW-20000,generation:5,attempt_id:"attempt_token_123456789",
    }}),
    recoverSafe:async(_row,proof)=>{
      assert.equal(events.length,1);
      assert.equal(proof.lease_generation,5);
      recovered++;
      return {committed:true,output_id:candidate.id,generation:5,
        scheduled_at:"2026-12-01T16:30:00Z",reservation_id:"reserved_1"};
    },
    airtableFetch:async(_env,table,path,opts)=>{
      if(table==="Quality Agent Recovery Ledger"){
        if(opts?.method==="PATCH"){
          currentLedger=JSON.parse(opts.body).records[0].fields;
          events.push(currentLedger);
          return {records:[{id:"rec12345678901239"}]};
        }
        return {id:path,fields:currentLedger};
      }
      return String(path).startsWith("?") ? {records:[candidate]}:candidate;
    },
  });
  assert.equal(recovered,1);
  assert.equal(events.length,2);
  assert.equal(events[1].Outcome,"fenced_pregraph_mae_rescheduled");
  assert.equal(output[0].recovery_committed,true);
  assert.equal(output[0].recovered_scheduled_at,"2026-12-01T16:30:00Z");
});
test("remote Graph intent without saved identity is quarantined, never rescheduled",async()=>{
  const candidate=row();
  let recoveryCalls=0,currentLedger=null;
  const output=await auditStaleInstagramReels({},{
    nowMs:NOW,
    inspectLease:async()=>({available:true,state:{
      phase:"remote_intent",irreversible_possible:true,
      heartbeat_at:"2026-11-02T17:00:00Z",
      expires_ms:NOW-20000,generation:5,attempt_id:"attempt_token_123456789",
    }}),
    recoverSafe:async()=>{recoveryCalls++;throw new Error("must not execute");},
    airtableFetch:async(_env,table,path,opts)=>{
      if(table==="Quality Agent Recovery Ledger"){
        if(opts?.method==="PATCH"){
          currentLedger=JSON.parse(opts.body).records[0].fields;
          return {records:[{id:"rec12345678901239"}]};
        }
        return {id:path,fields:currentLedger};
      }
      return String(path).startsWith("?") ? {records:[candidate]}:candidate;
    },
  });
  assert.equal(output[0].outcome,"graph_intent_ambiguous_needs_eyes");
  assert.equal(output[0].irreversible_possible,true);
  assert.equal(output[0].recovery_committed,undefined);
  assert.equal(recoveryCalls,0);
});

test("failed MAE attempt may be retried from same already-fenced generation",async()=>{
  const candidate=row();
  let currentLedger=null,attempts=0;
  const output=await auditStaleInstagramReels({},{
    nowMs:NOW,
    inspectLease:async()=>({available:true,state:{
      phase:"fenced",irreversible_possible:false,
      heartbeat_at:"2026-11-02T17:00:00Z",
      expires_ms:NOW-20000,generation:8,attempt_id:"attempt_token_123456789",
    }}),
    recoverSafe:async(_row,proof)=>{
      attempts++;
      assert.equal(proof.lease_generation,8);
      return {committed:true,output_id:candidate.id,generation:8,
        scheduled_at:"2026-12-01T16:30:00Z"};
    },
    airtableFetch:async(_env,table,path,opts)=>{
      if(table==="Quality Agent Recovery Ledger"){
        if(opts?.method==="PATCH"){
          currentLedger=JSON.parse(opts.body).records[0].fields;
          return {records:[{id:"rec12345678901239"}]};
        }
        return {id:path,fields:currentLedger};
      }
      return String(path).startsWith("?") ? {records:[candidate]}:candidate;
    },
  });
  assert.equal(output[0].recovery_committed,true);
  assert.equal(output[0].outcome,"fenced_pregraph_mae_retry_candidate");
  assert.equal(attempts,1);
});
test("supabase write source lists stale reel candidates without an Airtable formula", async () => {
  const previous = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify([{
      airtable_record_id: "rec12345678901234",
      output_number: 9289,
      platform: "Instagram",
      platform_output_type: "Instagram Reel",
      publish_status: "Publishing",
      review_status: "Approved",
      output_status: "Approved for Publishing",
      publish_method: "Automated",
      do_not_publish: false,
      error_messages: {
        Publish_Locked_By: "AP1-IG",
        Publish_Locked_At: "2026-11-02T17:00:00Z",
        Last_Publish_Attempt_At: "2026-11-02T17:01:00Z",
        Auto_Publish_Enabled: true,
      },
    }]), { status: 200, headers: { "content-type": "application/json" } });
  };
  const paths = [];
  let ledger = null;
  try {
    const results = await auditStaleInstagramReels({
      STUDIO_WRITE_SOURCE: "supabase",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
      AIRTABLE_OUTPUT_TABLE_ID: "tblOutputs",
    }, {
      nowMs: NOW,
      airtableFetch: async (_env, table, path, options) => {
        paths.push(String(path || ""));
        if (table === "Quality Agent Recovery Ledger" && options?.method === "PATCH") {
          ledger = JSON.parse(options.body).records[0].fields;
          return { records: [{ id: "rec12345678901239" }] };
        }
        if (table === "Quality Agent Recovery Ledger") return { id: path, fields: ledger };
        if (String(path).startsWith("?")) throw new Error("formula list");
        return row();
      },
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].outcome, "stale_lock_needs_eyes");
    assert.equal(paths.some((path) => path.startsWith("?")), false);
    assert.equal(paths.includes("rec12345678901234"), true);
    assert.match(urls[0], /Publish_Locked_By\.eq\.AP1-IG/);
  } finally {
    globalThis.fetch = previous;
  }
});
