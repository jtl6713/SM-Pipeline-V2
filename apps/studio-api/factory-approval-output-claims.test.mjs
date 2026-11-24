import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  factoryOutputClaimReserve, factoryOutputClaimInspect,
  factoryOutputClaimReclaimIfSafe, factoryOutputClaimAssertNotTransferred, FACTORY_OUTPUT_CLAIMS_PREFIX,
  FACTORY_UNBACKED_CLAIM_GRACE_MS,
} from "./factory-approval-output-claims.mjs";

const profile = "recLosAngelesProfile";
const groupA = "request_la_original_20261030";
const groupB = "request_la_seconddevice_20261030";
const ids = Array.from({ length: 7 }, (_, i) => "recLosAngelesOutput" + (i + 1));

class R2 {
  constructor() { this.items = new Map(); this.revision = 0; }
  async get(key) {
    const o = this.items.get(key);
    return o ? { etag: o.etag, text: async () => JSON.stringify(o.value) } : null;
  }
  async put(key, content, options = {}) {
    const old = this.items.get(key);
    const rule = options.onlyIf;
    if (rule instanceof Headers && rule.get("If-None-Match") === "*" && old) return null;
    if (rule?.etagMatches && rule.etagMatches !== old?.etag) return null;
    const etag = String(++this.revision);
    const value = JSON.parse(content);
    this.items.set(key, { value, etag });
    return { etag };
  }
  async list({ prefix, limit = 1000, cursor } = {}) {
    const keys = [...this.items.keys()].filter(x => x.startsWith(prefix)).sort();
    const start = cursor ? keys.findIndex(x => x === cursor) + 1 : 0;
    const slice = keys.slice(start, start + limit);
    return {
      objects: slice.map(key => ({ key, uploaded: new Date().toISOString() })),
      truncated: start + slice.length < keys.length,
      cursor: slice.length && start + slice.length < keys.length ? slice.at(-1) : undefined,
    };
  }
}

function legacyJob(id, requestId, entries, timestamp, groupRequestId = null) {
  return {
    schema: "studio.factory-batch.2", id: "fb_" + requestId,
    request_id: requestId, group_request_id: groupRequestId,
    profile_id: profile, created_at: timestamp, status: "completed", items: entries,
  };
}

test("LA seven-output incident: a new request ID cannot create a second batch", async () => {
  const bucket = new R2();
  assert.equal((await factoryOutputClaimReserve(bucket, {
    profileId: profile, requestId: groupA, ids,
  })).ok, true);
  const duplicate = await factoryOutputClaimReserve(bucket, {
    profileId: profile, requestId: groupB, ids,
  });
  assert.equal(duplicate.ok, false);
  assert.deepEqual(duplicate.conflicts.map(row => row.id), ids);
  assert.deepEqual(duplicate.owners, [groupA]);
  const original = await factoryOutputClaimReserve(bucket, {
    profileId: profile, requestId: groupA, ids,
  });
  assert.equal(original.ok, true);
  assert.equal(original.already_reserved, true);
  assert.ok(bucket.items.has(FACTORY_OUTPUT_CLAIMS_PREFIX + "/" + profile + ".json"));
});

test("partial overlap is rejected without claiming the non-overlapping IDs", async () => {
  const bucket = new R2();
  await factoryOutputClaimReserve(bucket, { profileId: profile, requestId: groupA, ids: ids.slice(0, 3) });
  const mixed = await factoryOutputClaimReserve(bucket, {
    profileId: profile, requestId: groupB, ids: [ids[1], ids[3]],
  });
  assert.equal(mixed.ok, false);
  const newOnly = await factoryOutputClaimInspect(bucket, {
    profileId: profile, requestId: groupB, ids: [ids[3]],
  });
  assert.equal(newOnly.ok, true);
});

test("simultaneous devices serialize through the R2 profile CAS", async () => {
  const bucket = new R2();
  const [a, b] = await Promise.all([
    factoryOutputClaimReserve(bucket, { profileId: profile, requestId: groupA, ids }),
    factoryOutputClaimReserve(bucket, { profileId: profile, requestId: groupB, ids }),
  ]);
  assert.equal(Number(a.ok) + Number(b.ok), 1);
  const loser = a.ok ? b : a;
  assert.equal(loser.conflicts.length, 7);
});

test("interrupted enrollment remains claimed for its original request ID", async () => {
  const bucket = new R2();
  await factoryOutputClaimReserve(bucket, { profileId: profile, requestId: groupA, ids });
  // Deliberately omit the group ledger, modelling a crash before the group PUT.
  const second = await factoryOutputClaimReserve(bucket, { profileId: profile, requestId: groupB, ids });
  assert.equal(second.ok, false);
  const recovery = await factoryOutputClaimReserve(bucket, { profileId: profile, requestId: groupA, ids });
  assert.equal(recovery.ok, true);
});

test("unbacked claims stay sticky inside grace then transfer to a new request ID", async () => {
  const bucket = new R2();
  const claimedAt = "2026-11-04T12:00:00.000Z";
  await factoryOutputClaimReserve(bucket, { profileId: profile, requestId: groupA, ids });
  const registry = bucket.items.get(FACTORY_OUTPUT_CLAIMS_PREFIX + "/" + profile + ".json");
  for (const id of ids) registry.value.outputs[id].at = claimedAt;
  const withinGrace = Date.parse(claimedAt) + FACTORY_UNBACKED_CLAIM_GRACE_MS - 1_000;
  const blocked = await factoryOutputClaimReclaimIfSafe(bucket, {
    profileId: profile, requestId: groupB, ids, nowMs: withinGrace,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.conflicts[0].reason, "unbacked_within_grace");
  const afterGrace = Date.parse(claimedAt) + FACTORY_UNBACKED_CLAIM_GRACE_MS + 1_000;
  const reclaimed = await factoryOutputClaimReclaimIfSafe(bucket, {
    profileId: profile, requestId: groupB, ids, nowMs: afterGrace,
  });
  assert.equal(reclaimed.ok, true);
  assert.deepEqual(reclaimed.reclaimed, ids);
  const reserved = await factoryOutputClaimReserve(bucket, {
    profileId: profile, requestId: groupB, ids,
  });
  assert.equal(reserved.ok, true);
  assert.equal(reserved.already_reserved, true);
});

test("terminal failed child ledger may be reclaimed; inactive approved ownership may too", async () => {
  const failedBucket = new R2();
  await factoryOutputClaimReserve(failedBucket, { profileId: profile, requestId: groupA, ids });
  const prefix = "studio/state/factory-approvals/v2/jobs/" + profile + "/";
  await failedBucket.put(prefix + groupA + ".json", JSON.stringify(legacyJob(
    "failed", groupA, ids.map(id => ({ id, status: "failed" })), "2026-11-04T12:00:00Z")));
  const ok = await factoryOutputClaimReclaimIfSafe(failedBucket, {
    profileId: profile, requestId: groupB, ids,
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.reclaimed, ids);

  // Completed approved ledgers do not appear in Active Approvals. Sticky claims
  // must not recreate empty-Activity overlap fences for Ready-for-Review rows.
  const approvedBucket = new R2();
  await factoryOutputClaimReserve(approvedBucket, {
    profileId: profile, requestId: groupA, ids: [ids[0]],
  });
  await approvedBucket.put(prefix + groupA + ".json", JSON.stringify(legacyJob(
    "approved", groupA, [{ id: ids[0], status: "approved" }], "2026-11-04T12:05:00Z")));
  const reclaimed = await factoryOutputClaimReclaimIfSafe(approvedBucket, {
    profileId: profile, requestId: groupB, ids: [ids[0]],
  });
  assert.equal(reclaimed.ok, true);
  assert.deepEqual(reclaimed.reclaimed, [ids[0]]);
  assert.deepEqual(reclaimed.previous_owners, [groupA]);
});

test("live pending ownership stays fail-closed even when Activity scan is separate", async () => {
  const bucket = new R2();
  await factoryOutputClaimReserve(bucket, {
    profileId: profile, requestId: groupA, ids: [ids[0]],
  });
  const prefix = "studio/state/factory-approvals/v2/jobs/" + profile + "/";
  await bucket.put(prefix + groupA + ".json", JSON.stringify({
    ...legacyJob("pending", groupA, [{ id: ids[0], status: "pending" }], "2026-11-11T12:00:00Z"),
    status: "running",
  }));
  const blocked = await factoryOutputClaimReclaimIfSafe(bucket, {
    profileId: profile, requestId: groupB, ids: [ids[0]],
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.conflicts[0].reason, "durable_active_work");
});

test("legacy ledgers migrate oldest valid owner; superseded duplicates do not own claims", async () => {
  const bucket = new R2();
  const prefix = "studio/state/factory-approvals/v2/jobs/" + profile + "/";
  const original = legacyJob("original", "legacyChildOriginal_20261030",
    ids.map(id => ({ id, status: "approved" })), "2026-10-30T14:00:00Z", groupA);
  const duplicate = legacyJob("duplicate", "legacyChildDuplicate_20261030",
    ids.map(id => ({ id, status: "superseded_duplicate" })),
    "2026-10-30T14:05:00Z", groupB);
  await bucket.put(prefix + original.request_id + ".json", JSON.stringify(original));
  await bucket.put(prefix + duplicate.request_id + ".json", JSON.stringify(duplicate));
  const result = await factoryOutputClaimInspect(bucket, {
    profileId: profile, requestId: groupB, ids,
  });
  assert.deepEqual(result.owners, [groupA]);
  assert.equal(result.conflicts.length, 7);
});

test("orphan global parent is indexed when a crash prevented child enqueue", async () => {
  const bucket = new R2();
  await bucket.put("studio/state/factory-approvals/v2/groups/" + groupA + ".json",
    JSON.stringify({
      schema: "studio.factory-approval-group.1", request_id: groupA,
      created_at: "2026-10-30T14:01:00Z", status: "enqueuing",
      records: ids.map(id => ({ id, profile_id: profile })),
    }));
  const newAttempt = await factoryOutputClaimReserve(bucket, {
    profileId: profile, requestId: groupB, ids,
  });
  assert.equal(newAttempt.ok, false);
  assert.deepEqual(newAttempt.owners, [groupA]);
});

test("global and profile-local routes share the same canonical output-ID fence", () => {
  const worker = readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const claims = readFileSync(new URL("./factory-approval-output-claims.mjs", import.meta.url), "utf8");
  assert.match(worker, /factoryOutputClaimReserve/);
  assert.match(worker, /factoryOutputClaimInspect/);
  assert.match(worker, /factoryOutputClaimReclaimIfSafe/);
  assert.match(worker, /still committing/);
  assert.match(claims, /terminal_inactive/);
  assert.match(claims, /durable_active_work/);
  assert.match(worker, /factoryGroupRecordsFromAirtablePreflight\(\s*env, authorization, ids, payload, policy/);
  assert.match(worker, /duplicate_prevented: true/);
  const ui = readFileSync(new URL("../studio-web/assets/factory-desk.js", import.meta.url), "utf8");
  assert.match(ui, /rememberFactoryAccepted\(plan\.ids\)/);
  assert.match(ui, /reconcilePersistedFactoryPending/);
  assert.match(ui, /surfaceFactoryBlockingApproval/);
  assert.match(ui, /factoryBlockingRequestIdsFromMessage/);
  assert.doesNotMatch(ui, /Recover saved submission first/);
  assert.match(ui, /const ready = selected\.filter\(card => !recovering\.has\(card\.id\)\)/,
    "Only outputs owned by an unresolved request must wait; unrelated selections proceed");
  assert.match(ui, /FACTORY_WAITING_SELECTION_KEY/,
    "Explicit overlapping submission intent must survive recovery without a second click");
});


test("#2915 a completed mixed failed/approved NYC group does not pin current-review outputs",async()=>{
  const bucket=new R2();
  const selected=["recVoFLCOAGHNIkD3","rechOtaxHOwY18A8F","recWq5HIxBT8BCtme"];
  const request="ac77ba24-1e61-4d16-a528-1deecd3ce704";
  const child="fgc_2915_historical_child";
  await factoryOutputClaimReserve(bucket,{profileId:profile,requestId:request,ids:selected});
  await bucket.put("studio/state/factory-approvals/v2/groups/"+request+".json",JSON.stringify({
    schema:"studio.factory-approval-group.1",request_id:request,status:"queued",
    records:selected.map(id=>({id,profile_id:profile})),
    children:[{profile_id:profile,request_id:child}],
  }));
  const key="studio/state/factory-approvals/v2/jobs/"+profile+"/"+child+".json";
  const history=legacyJob("old",child,selected.map((id,i)=>({id,status:i===1?"approved":"failed",error:i===1?null:"historic hold-release failure"})),"2026-11-22T05:44:51Z",request);
  history.items.push({id:ids[6],status:"pending"});
  await bucket.put(key,JSON.stringify({...history,status:"running"}));
  const blocked=await factoryOutputClaimReclaimIfSafe(bucket,{profileId:profile,requestId:groupB,ids:selected});
  assert.equal(blocked.ok,false);
  history.items.pop();
  await bucket.put(key,JSON.stringify(history));
  const safe=await factoryOutputClaimReclaimIfSafe(bucket,{profileId:profile,requestId:groupB,ids:selected});
  assert.equal(safe.ok,true);
  assert.deepEqual(safe.reclaimed,selected);
  assert.deepEqual(JSON.parse(await (await bucket.get(key)).text()),history,"historical decisions and failure evidence unchanged");
  const old=await factoryOutputClaimInspect(bucket,{profileId:profile,requestId:request,ids:selected});
  assert.equal(old.ok,false);
  assert.deepEqual(old.owners,[groupB]);
  await assert.rejects(factoryOutputClaimAssertNotTransferred(bucket,{profileId:profile,requestId:request,id:selected[0]}),/ownership transferred/);
  await factoryOutputClaimAssertNotTransferred(bucket,{profileId:profile,requestId:groupB,id:selected[0]});
});

test("#2915 a historical child with missing selected identity cannot authorize claim transfer",async()=>{
  const bucket=new R2();
  await factoryOutputClaimReserve(bucket,{profileId:profile,requestId:groupA,ids:ids.slice(0,2)});
  const key="studio/state/factory-approvals/v2/jobs/"+profile+"/"+groupA+".json";
  await bucket.put(key,JSON.stringify(legacyJob("incomplete",groupA,[{id:ids[0],status:"failed"}],"2026-11-22T05:44:51Z")));
  assert.equal((await factoryOutputClaimReclaimIfSafe(bucket,{profileId:profile,requestId:groupB,ids:ids.slice(0,2)})).ok,false);
});
