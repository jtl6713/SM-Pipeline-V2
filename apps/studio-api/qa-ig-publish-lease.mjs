/**
 * Cross-runtime AP1-IG publish attempt authority (Worker + Windows Python Runner).
 * R2 exact-record compare-and-swap is the shared lease. Flag default OFF.
 * A Graph request can have committed without an Airtable media ID: once the
 * irreversible-intent transition is written, expiry NEVER proves noncreation.
 */
export const IG_LEASE_PREFIX = "studio/state/qa-ig-stale-upload/v1/leases/";
export const IG_LEASE_TTL_MS = 90_000;
export const IG_LEASE_STALE_MS = 30 * 60_000;
const ID = /^rec[A-Za-z0-9]{14}$/;
const tokenPattern = /^[A-Za-z0-9_-]{16,128}$/;

export const igPublishLeaseEnabled = env =>
  env?.STUDIO_IG_PUBLISH_LEASE_ENABLED === "true" &&
  env?.STUDIO_IG_PUBLISH_LEASE_EXCLUSIVE_VERIFIED === "true";

function fail(code, status=409) {
  const error = new Error(code); error.code = code; error.status = status;
  throw error;
}
function key(id) {
  if (!ID.test(String(id || ""))) fail("invalid_output_identity",400);
  return IG_LEASE_PREFIX + id + ".json";
}
async function readEntry(bucket, id) {
  const object = await bucket.get(key(id));
  if (!object) return {state:null,etag:null};
  let state;
  try { state = JSON.parse(await object.text()); }
  catch { fail("corrupt_publish_lease",503); }
  if (!state || state.output_id !== id || !Number.isSafeInteger(state.generation))
    fail("invalid_publish_lease_state",503);
  return {state,etag:object.etag};
}
export async function readIgPublishLease(env, outputId) {
  if (!igPublishLeaseEnabled(env) || !env?.STUDIO_MEDIA?.get)
    return {available:false,reason:"lease_authority_not_enabled"};
  const {state} = await readEntry(env.STUDIO_MEDIA,outputId);
  return {available:true,state};
}
async function cas(bucket,id,old,next) {
  const result = await bucket.put(key(id),JSON.stringify(next),{
    onlyIf: old.etag
      ? {etagMatches:old.etag}
      : new Headers({"If-None-Match":"*"}),
    httpMetadata:{contentType:"application/json"},
  });
  return Boolean(result);
}
const text = x => String(x ?? "").trim();
function supports(row,id) {
  const f = row?.fields || {};
  return row?.id === id && f.Platform === "Instagram"
    && f.Platform_Output_Type === "Instagram Reel"
    && f.Output_Status === "Approved for Publishing"
    && f.Review_Status === "Approved"
    && f.Publish_Method === "Automated"
    && f.Auto_Publish_Enabled === true
    && !f.Do_Not_Publish && !f.Test_Run_ID && !f.Replace_Transaction_ID
    && !f.Published_At && !f.Platform_Post_ID && !f.Platform_Post_URL
    && !f.Studio_Render_Review_Hold_Active
    && !f.Studio_Render_Review_Hold_ID
    && !f.Studio_Render_Review_Hold_Owner
    && !f.Studio_Render_Review_Session_ID
    && !f.Studio_Review_Hold_ID && !f.Studio_Review_Hold_Owner;
}
export async function mutateIgPublishLease(env, {
  action,outputId,attemptId,generation,lockStamp,
  readOutput,nowMs=Date.now(),
}={}) {
  if (!igPublishLeaseEnabled(env) || !env?.STUDIO_MEDIA?.put ||
      !env?.STUDIO_MEDIA?.get)
    fail("ig_publish_lease_unavailable",503);
  if (!["claim","heartbeat","remote_intent","finish"].includes(action))
    fail("unsupported_publish_lease_action",400);
  if (typeof readOutput !== "function") fail("lease_authoritative_read_missing",503);
  if (!ID.test(String(outputId || ""))) fail("invalid_output_identity",400);
  if (action !== "claim" &&
      (!tokenPattern.test(text(attemptId)) || !Number.isSafeInteger(generation) ||
       generation < 1)) fail("lease_token_invalid",400);

  for (let tries=0;tries<5;tries++) {
    const old=await readEntry(env.STUDIO_MEDIA,outputId);
    const last=old.state;
    if (action==="claim") {
      // A previous irreversible Graph request, even one with lost response, is
      // NEVER a safe automatic new upload. A pre-remote expired lease must
      // explicitly be fenced and rescheduled by the Quality Agent first.
      if (last && !["recovered","finished"].includes(last.phase))
        fail("publish_lease_requires_reconciliation");
      const row=await readOutput(outputId);
      if (!supports(row,outputId) || text(row.fields.Publish_Status)!=="Ready to Publish"
        || row.fields.Publish_Locked_By || row.fields.Publish_Locked_At
        || row.fields.Publish_Started_At || row.fields.Platform_Media_ID)
        fail("publish_output_not_claimable");
      const next={
        schema:"ig.publish-lease.1",output_id:outputId,
        attempt_id:crypto.randomUUID(),generation:(last?.generation || 0)+1,
        phase:"pre_remote",owner:"AP1-IG",
        acquired_at:new Date(nowMs).toISOString(),
        heartbeat_at:new Date(nowMs).toISOString(),
        expires_ms:nowMs+IG_LEASE_TTL_MS,
        irreversible_possible:false,
      };
      if (await cas(env.STUDIO_MEDIA,outputId,old,next))
        return {ok:true,output_id:outputId,attempt_id:next.attempt_id,
          generation:next.generation,phase:next.phase,expires_ms:next.expires_ms};
      continue;
    }
    if (!last || last.attempt_id!==attemptId ||
        last.generation!==generation || !["pre_remote","remote_intent"].includes(last.phase))
      fail("publisher_fenced_or_lease_changed");
    if (nowMs >= last.expires_ms) fail("publisher_lease_expired");
    const row=await readOutput(outputId);
    if (!supports(row,outputId) ||
        text(row.fields.Publish_Locked_By)!=="AP1-IG" ||
        !Number.isFinite(Date.parse(String(lockStamp||""))) ||
        Date.parse(String(row.fields.Publish_Locked_At||""))!==Date.parse(lockStamp) ||
        Date.parse(String(row.fields.Last_Publish_Attempt_At||""))!==Date.parse(lockStamp) ||
        text(row.fields.Publish_Status)!=="Publishing")
      fail("publisher_authoritative_lock_changed");
    if (action==="remote_intent" && last.phase!=="pre_remote")
      fail("irreversible_intent_already_recorded");
    const phase = action==="remote_intent"?"remote_intent"
      :action==="finish"?"finished":last.phase;
    const next={...last,phase,
      heartbeat_at:new Date(nowMs).toISOString(),
      expires_ms:action==="finish"?nowMs:nowMs+IG_LEASE_TTL_MS,
      irreversible_possible: last.irreversible_possible || action==="remote_intent",
    };
    if (action==="remote_intent") next.irreversible_intent_at=new Date(nowMs).toISOString();
    if (action==="finish") {
      // Never treat 'finish' as verified publication; only authority record
      // completion. The Airtable and provider receipts remain independent.
      next.finished_at=new Date(nowMs).toISOString();
    }
    if (await cas(env.STUDIO_MEDIA,outputId,old,next))
      return {ok:true,output_id:outputId,attempt_id:attemptId,
        generation,phase:next.phase,expires_ms:next.expires_ms};
  }
  fail("publisher_lease_cas_contention");
}

/** QA-only fence. Expired pre-remote lease is positive evidence that this
 * participating attempt never received authorization to call Graph.
 * The prior runner cannot pass remote_intent after this CAS.
 */
export async function fenceStaleIgPreRemoteLease(env,outputId,{
  nowMs=Date.now(),thresholdMs=IG_LEASE_STALE_MS,readOutput,
}={}) {
  if (!igPublishLeaseEnabled(env) || !env?.STUDIO_MEDIA?.get ||
      !env?.STUDIO_MEDIA?.put)
    return {safe:false,reason:"lease_authority_unavailable"};
  if (typeof readOutput!=="function") return {safe:false,reason:"authoritative_read_missing"};
  for(let attempt=0;attempt<4;attempt++){
    const old=await readEntry(env.STUDIO_MEDIA,outputId);
    const lease=old.state;
    if (!lease || lease.phase!=="pre_remote" || lease.irreversible_possible)
      return {safe:false,reason:lease?.phase==="remote_intent"?"graph_request_may_exist":"no_proven_pre_remote_lease"};
    const heartbeat=Date.parse(lease.heartbeat_at||"");
    if (!Number.isFinite(heartbeat) || nowMs-heartbeat<Math.max(60_000,thresholdMs) ||
        nowMs < lease.expires_ms)
      return {safe:false,reason:"owner_heartbeat_or_lease_still_active"};
    const row=await readOutput(outputId);
    const f=row?.fields || {};
    if (!supports(row,outputId) || f.Publish_Status!=="Publishing" ||
        f.Publish_Locked_By!=="AP1-IG" ||
        !f.Publish_Locked_At || !f.Last_Publish_Attempt_At ||
        !Number.isFinite(Date.parse(f.Publish_Locked_At)) ||
        Date.parse(f.Publish_Locked_At) < Date.parse(lease.acquired_at)-30_000 ||
        Date.parse(f.Publish_Locked_At) > lease.expires_ms ||
        Date.parse(f.Publish_Locked_At)!==Date.parse(f.Last_Publish_Attempt_At) ||
        f.Platform_Media_ID || f.Platform_Post_ID || f.Platform_Post_URL)
      return {safe:false,reason:"authoritative_publication_state_ambiguous"};
    const next={...lease,phase:"fenced",expires_ms:nowMs,
      fenced_at:new Date(nowMs).toISOString(),fence_reason:"expired_pre_remote_no_graph_authorization"};
    if (await cas(env.STUDIO_MEDIA,outputId,old,next))
      return {safe:true,fenced:true,output_id:outputId,generation:lease.generation,
        attempt_id:lease.attempt_id,fenced_at:next.fenced_at,
        proof:"cas_pre_remote_before_remote_intent",
        lock_at:f.Publish_Locked_At};
  }
  return {safe:false,reason:"fence_cas_conflict"};
}
export async function markIgLeaseRecovered(env,outputId,generation,{
  nowMs=Date.now(),readOutput,
}={}) {
  if (!igPublishLeaseEnabled(env)) fail("ig_publish_lease_unavailable",503);
  for(let i=0;i<4;i++){
    const old=await readEntry(env.STUDIO_MEDIA,outputId),lease=old.state;
    if(!lease || lease.phase!=="fenced" || lease.generation!==generation)
      fail("ig_recovery_fence_changed");
    const row=await readOutput(outputId);
    if(row?.id!==outputId || row.fields?.Publish_Locked_By ||
       row.fields?.Publish_Status!=="Ready to Schedule" ||
       !Number.isFinite(Date.parse(String(row.fields?.Scheduled_Post_Date||""))))
      fail("ig_recovery_schedule_readback_missing");
    const next={...lease,phase:"recovered",recovered_at:new Date(nowMs).toISOString()};
    if(await cas(env.STUDIO_MEDIA,outputId,old,next))
      return {ok:true,generation,phase:"recovered"};
  }
  fail("ig_recovery_fence_cas_conflict");
}
