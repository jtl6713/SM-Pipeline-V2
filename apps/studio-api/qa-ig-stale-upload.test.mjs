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
