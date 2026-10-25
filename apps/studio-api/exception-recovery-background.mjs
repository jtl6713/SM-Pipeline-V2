import { autonomousRecoveryPolicy, reconcilePublication, recoverySnapshot } from "./exception-recovery-autonomous.mjs";
import { withOutputApprovalLock } from "./output-approval-lease.mjs";
const PREFIX="studio/state/publication-reconciliation/v1/";
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
  // Only inspect approved YouTube outputs with an existing saved video ID.
  // This prevents a full-table queue of unrelated unfinished Studio outputs.
  // Completed Studio handoffs are terminal even before public release.
  return 'AND({Test_Run_ID}=BLANK(),{Platform}="YouTube",{Review_Status}="Approved",{Do_Not_Publish}=0,'
    +'OR({YouTube_Video_ID}!="",{Platform_Post_ID}!=""),'
    +'OR({Output_Status}!="Published",{Publish_Status}!="Published"),'
    +'{Output_Status}!="Awaiting Public Release",{Publish_Status}!="Published Privately",'
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
    const listed=canaryOnly
      ?{objects:[{key:recoveryStateKey(policy.canaryRecord)}],truncated:false,cursor:null}
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
      processing_cursor:listed.truncated?listed.cursor:null,heartbeat:result,policy,
    });
    return result;
  },{owner:"publication-reconciliation-sweep:"+crypto.randomUUID()});
}
export async function publicationRecoveryStatus(env) {
  return {policy:autonomousRecoveryPolicy(env),
    runtime:await readRecoveryState(env.STUDIO_MEDIA,PREFIX+"control.json")};
}
