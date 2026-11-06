import { autonomousRecoveryPolicy, reconcilePublication, recoverySnapshot } from "./exception-recovery-autonomous.mjs";
import { withOutputApprovalLock } from "./output-approval-lease.mjs";
const PREFIX="studio/state/publication-reconciliation/v1/";
// One-time ordered, exact-record handoff checks approved for investigation.
// Later entries are unverified candidates with existing remote IDs; inclusion
// does not assert that they are posted, owner-matched, public or safe to patch.
// This does not authorize a provider post or bypass recoveryPolicy, output
// lease, ownership/receipt, schedule, holds, audit or readback fences.
// A persistent cursor makes the list exhaust after two ordinary bounded
// sweeps, then the existing discovery/processing queue resumes.
export const PRIORITY_VERIFIED_EXISTING_POSTS = Object.freeze([
  "rec9uw6xfRJGXpqz1", // YouTube #3374 Miami
  "recJOW1OsfNeNhRW4", // YouTube #3241 Chicago
  "rec4R88s8mlZLE6UO", // YouTube #9308 Chicago
  "recfTqaYB0h5FCUVi", // Instagram #7864 New York
  // New due-with-remote-ID candidates, still unverified. Fresh authenticated
  // provider GET, exact profile/channel ownership, immutable ID and readback
  // remain mandatory; these IDs alone never authorize a mutation or repost.
  "rec0MKVEfx5zyLh3L", // Instagram #8121
  "reczQCBHrHpIyBUBu", // YouTube #8698
  "recha3rExqOvKwFy1", // YouTube #1885
  "recqLmTDQRqyB9ytE", // YouTube #3344
  "recxkZ1hBhREpsJgj", // YouTube #8098
  "recI3x5A6Cz9vIQIs", // YouTube #9277: verified publicly released, private Studio handoff stale
  // These two are approved/due with pre-existing IDs, NOT yet provider-verified.
  // Authenticated exact-channel GET and status-only preflight remain compulsory.
  "rece57RpkWLMOpZ47", // YouTube #5327 Miami, wuPzjhhUFLs
  "reccenlA9uIF2MtSd", // YouTube #4146 Chicago, Qokdf8u-shY
  // Stage 3: canonical Airtable readback still has saved pre-existing YouTube
  // video IDs for these now-overdue outputs. GET ONLY; inclusion does not
  // claim they are public. This bounded manifest only prioritizes authenticated
  // verification and the existing lock/audit/readback status-only reconciler.
  "recLzqmtWJGQvLNTZ", // YouTube #5321 Miami, ekWGUhmlnaQ
  "recT2eb5eOeioD0nY", // YouTube #4140 Chicago, PGNXR-WNI3g
  "rec0259hg7cjoKl3j", // YouTube #4050 Los Angeles, gm9Mxa8ScnM
]);
export const recoveryStateKey=id=>PREFIX+"outputs/"+id+".json";
export async function readRecoveryState(bucket,key) {
  const object=await bucket.get(key);
  return object?JSON.parse(await object.text()):null;
}
export async function writeRecoveryState(bucket,key,value) {
  const body=JSON.stringify(value);
  await bucket.put(key,body,{httpMetadata:{contentType:"application/json"}});
  const read=await readRecoveryState(bucket,key);
  if(JSON.stringify(read)!==body) throw new Error("recovery_journal_readback_failed");
}
export function publicationDiscoveryFormula(nowMs=Date.now()) {
  // Only approved YouTube uploads or Instagram posts with existing published
  // media IDs. Do not scan unpublished IG containers/Stories or retry posting.
  // Private Studio handoffs are eligible for GET-only public status catch-up
  // only after their scheduled release; never trigger an upload or visibility write.
  return 'AND({Test_Run_ID}=BLANK(),{Review_Status}="Approved",{Do_Not_Publish}=0,'
    +'OR(AND({Platform}="YouTube",OR({YouTube_Video_ID}!="",{Platform_Post_ID}!="")),'
    +'AND({Platform}="Instagram",OR({Platform_Post_ID}!="",{IG_Carousel_Published_Media_ID}!=""))),'
    +'OR({Output_Status}!="Published",{Publish_Status}!="Published"),'
    +'OR(AND({Output_Status}!="Awaiting Public Release",{Publish_Status}!="Published Privately"),'
    +'AND({Platform}="YouTube",{Output_Status}="Awaiting Public Release",{Publish_Status}="Published Privately",'
    +'{YouTube_Scheduled_Publish_At}!=BLANK(),IS_BEFORE({YouTube_Scheduled_Publish_At},"'
    +new Date(nowMs+1).toISOString()+'"))),'
    +'OR({Output_Status}="Failed",{Publish_Status}="Failed",{Published_At}!=BLANK(),'
    +'AND({Scheduled_Post_Date}!=BLANK(),IS_BEFORE({Scheduled_Post_Date},"'
    +new Date(nowMs-15*60000).toISOString()+'"))))';
}
/** Reuses the Worker cron and canonical approval mutex; no competing scheduler. */
export async function runPublicationRecovery(env,deps) {
  const policy=autonomousRecoveryPolicy(env);
  if(!policy.inspect) return {status:"disabled",corrected:0};
  const bucket=env.STUDIO_MEDIA;
  const now=deps.now||Date.now;
  return withOutputApprovalLock(bucket,"recPublicationRecoverySweep",async()=>{
    const controlKey=PREFIX+"control.json";
    const control=await readRecoveryState(bucket,controlKey)||{};
    if(Number(control.next_at)>now()) return {status:"cooldown",corrected:0};
    const result={status:"running",started_at:new Date(now()).toISOString(),
      inspected:0,verified:0,corrected:0,blocked:0,escalated:0,errors:0};
    // Reserve this interval durably before discovery; a restart retries next tick.
    await writeRecoveryState(bucket,controlKey,{...control,next_at:now()+policy.intervalMs,
      heartbeat:result,policy});
    // When the mutation gate is scoped to a single approved canary, do not
    // crawl or process the unrelated backlog. Canary activation must be
    // deterministic and have an exact Airtable record identity.
    const canaryOnly=policy.mutate && !policy.broad;
    if(canaryOnly && !/^rec[A-Za-z0-9]{14}$/.test(policy.canaryRecord))
      throw new Error("exact_canary_identity_required");
    const page=canaryOnly?{records:[{id:policy.canaryRecord}],offset:null}
      :await deps.discover({filterFormula:publicationDiscoveryFormula(now()),
          pageSize:100,...(control.discovery_cursor?{offset:control.discovery_cursor}:{})});
    if(!Array.isArray(page.records)) throw new Error("authoritative_discovery_unavailable");
    for(const row of page.records) {
      if(!/^rec[A-Za-z0-9]{14}$/.test(String(row.id))) throw new Error("invalid_discovery_identity");
      const key=recoveryStateKey(row.id);
      if(!await readRecoveryState(bucket,key))
        await writeRecoveryState(bucket,key,{record_id:row.id,attempts:0,next_at:0,terminal:false});
    }
    // Never enlarge the production batch budget. During bounded status-only
    // recovery, place exactly these provider-verified existing posts at the
    // front once. The existing reconcilePublication() still authenticates
    // provider ownership again and fails closed on every conflicting field.
    // An R2 cursor retires this temporary focus after each reviewed slice.
    const priorityStart=policy.mutate&&policy.broad
      ?Math.min(PRIORITY_VERIFIED_EXISTING_POSTS.length,Math.max(0,
         Math.floor(Number(control.priority_cursor)||0)))
      :PRIORITY_VERIFIED_EXISTING_POSTS.length;
    const priorityIds=priorityStart<PRIORITY_VERIFIED_EXISTING_POSTS.length
      ?PRIORITY_VERIFIED_EXISTING_POSTS.slice(priorityStart,priorityStart+policy.batch)
      :[];
    for(const id of priorityIds) {
      if(!await readRecoveryState(bucket,recoveryStateKey(id)))
        await writeRecoveryState(bucket,recoveryStateKey(id),{
          record_id:id,attempts:0,next_at:0,terminal:false,
        });
    }
    const listed=canaryOnly
      ?{objects:[{key:recoveryStateKey(policy.canaryRecord)}],truncated:false,cursor:null}
      :priorityIds.length
      ?{objects:priorityIds.map(id=>({key:recoveryStateKey(id)})),
          truncated:false,cursor:null}
      :await bucket.list({prefix:PREFIX+"outputs/",limit:policy.batch,
          ...(control.processing_cursor?{cursor:control.processing_cursor}:{})});
    for(const object of listed.objects||[]) {
      const id=object.key.slice((PREFIX+"outputs/").length).replace(/\.json$/,"");
      try {
        const outcome=await withOutputApprovalLock(bucket,id,()=>reconcilePublication({
          ...deps,recordId:id,policy,now,
          readState:()=>readRecoveryState(bucket,recoveryStateKey(id)),
          saveState:(_,state)=>writeRecoveryState(bucket,recoveryStateKey(id),state),
        }),{owner:"publication-reconciliation:"+crypto.randomUUID()});
        if(!outcome.skipped&&!outcome.duplicate) result.inspected++;
        if(outcome.receipt?.verified_delivery && outcome.receipt?.ownership_verified) result.verified++;
        if(outcome.outcome==="Corrected") result.corrected++;
        if(outcome.outcome==="Blocked") result.blocked++;
        if(outcome.outcome==="Needs Decision") result.escalated++;
      } catch(error) {
        if(error?.status===409) {
          result.blocked++;
          try {
            const row=await deps.readOutput(id),attempt=crypto.randomUUID();
            await deps.appendAudit({record_id:id,attempt_id:attempt,audit_id:attempt+":outcome",
              phase:"outcome",outcome:"Blocked",reason:"canonical_output_lock_active",
              actor:"automated-publication-reconciler",authorization:"deployment",
              output_id:String(row.fields?.Output_ID||""),title:String(row.fields?.Output_Title||row.fields?.Title_Text||""),
              platform:row.fields?.Platform,profile_id:row.fields?.Content_Profile?.[0],
              detected_at:new Date(now()).toISOString(),before:recoverySnapshot(row),duration_ms:0});
          } catch { result.errors++; }
        } else result.errors++;
      }
    }
    result.status=result.errors?"degraded":"completed";
    result.completed_at=new Date(now()).toISOString();
    await writeRecoveryState(bucket,controlKey,{
      next_at:now()+policy.intervalMs,discovery_cursor:page.offset||null,
      priority_cursor:priorityIds.length
        ?priorityStart+priorityIds.length
        :Number(control.priority_cursor)||0,
      processing_cursor:priorityIds.length
        ?control.processing_cursor||null
        :listed.truncated?listed.cursor:null,
      heartbeat:result,policy,
    });
    return result;
  },{owner:"publication-reconciliation-sweep:"+crypto.randomUUID()});
}
export async function publicationRecoveryStatus(env) {
  return {policy:autonomousRecoveryPolicy(env),
    runtime:await readRecoveryState(env.STUDIO_MEDIA,PREFIX+"control.json")};
}
