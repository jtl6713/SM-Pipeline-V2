// #3096: exact audited historical hold recovery, not a new approval or publisher.
import { STORY_2915_ID } from "./story-expired-generation-2915.mjs";
import { planAuditedEarlyHoldMaeReschedule } from "./approved-publish-flow.mjs";
import { factorySupabaseApprovalRows } from "./factory-supabase-approval.mjs";
import { factoryBatchLock, factoryBatchUnlock } from "./factory-approval-queue.mjs";
import { withOutputApprovalLock } from "./output-approval-lease.mjs";
import { runAtomicScheduleTransaction } from "./schedule-reservation-transaction.mjs";
import { scheduleReservationLaneEnabled } from "./schedule-reservation-authority.mjs";
import { supabaseRest } from "./supabase-pipeline-reads.mjs";
import { MAE_SCHEDULE_GAP_MS, maeScheduleLaneKey } from "./mae-schedule.mjs";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const RECEIPT = "Studio_Overdue_MAE_Recovery_Receipt";
const ms = value => Date.parse(String(value || ""));
const sameTime = (a,b) => Number.isFinite(ms(a)) && ms(a) === ms(b);
const skip = (id,reason) => ({id, skipped:reason});
const filter = (key,value) => key + "=" + (value == null ? "is.null" : "eq." + encodeURIComponent(typeof value === "object" ? JSON.stringify(value) : String(value)));

export function overdueMaeExactSelector(row) {
  // Full observed bag equality prevents losing a concurrent provider stamp even
  // if its writer did not advance updated_at. Refuse oversized requests.
  if (!row?.id || !row.updated_at || !RECORD_ID.test(row.airtable_record_id) ||
      !row.error_messages || typeof row.error_messages !== "object" ||
      Array.isArray(row.error_messages)) throw Error("overdue_mae_exact_identity_missing");
  const keys = ["id","airtable_record_id","content_profile_id","content_item_id","platform",
    "platform_output_type","updated_at","output_status","review_status","publish_status",
    "publish_method","do_not_publish","auto_publish_enabled","test_run_id","scheduled_post_date",
    "studio_scheduled_at","youtube_scheduled_publish_at","published_at","platform_post_url",
    "platform_publish_response","publish_next_retry_at","asset_set_revision","error_messages"];
  const query = "platform_outputs?" + keys.map(k=>filter(k,row[k])).join("&") + "&select=id";
  if (query.length > 16000) throw Error("overdue_mae_exact_selector_too_large");
  return query;
}

export function overdueMaeSchedulePatch(row, plan, state, nowMs) {
  const iso = plan.scheduled_for;
  if (!plan.ok || !Number.isFinite(ms(iso)) || !["pending_commit","committed"].includes(state)) throw Error("overdue_mae_invalid_plan");
  return { scheduled_post_date:iso, studio_scheduled_at:iso,
    youtube_scheduled_publish_at:row.platform==="YouTube" ? iso : null,
    updated_at:new Date(nowMs).toISOString(),
    error_messages:{...row.error_messages,[RECEIPT]:{...plan.receipt,state}} };
}

function verify(entry, original, plan, state) {
  const row = entry?.row, receipt = row?.error_messages?.[RECEIPT];
  if (!row || row.id !== original.id || row.airtable_record_id !== original.airtable_record_id
      || row.content_profile_id !== original.content_profile_id || row.platform !== original.platform
      || row.platform_output_type !== original.platform_output_type
      || row.output_status !== original.output_status || row.review_status !== original.review_status
      || row.publish_status !== original.publish_status || row.auto_publish_enabled !== true
      || row.publish_method !== "Automated" || row.do_not_publish !== false
      || row.asset_set_revision !== original.asset_set_revision || row.published_at || row.platform_post_url
      || !sameTime(row.scheduled_post_date, plan.scheduled_for)
      || !sameTime(row.studio_scheduled_at, plan.scheduled_for)
      || (row.platform==="YouTube" && !sameTime(row.youtube_scheduled_publish_at, plan.scheduled_for))
      || receipt?.state !== state || Object.entries(plan.receipt).some(([k,v])=>receipt[k]!==v)
      || Object.entries(original.error_messages).some(([k,v])=>k!==RECEIPT && JSON.stringify(row.error_messages[k])!==JSON.stringify(v)))
    throw Error("overdue_mae_authoritative_readback_failed");
  return row;
}

/** Bounded single-output operation. No provider calls or approval/hold changes.
 * Uses both the Factory profile claim and shared output lease, then the existing
 * atomic reservation lane. An ambiguous schedule write leaves a pending receipt
 * and the reservation quarantined, never a second publish authorization.
 */
export async function recoverAuditedOverdueMae(env, id, {horizonDays, now=Date.now} = {}, deps = {}) {
  if (!RECORD_ID.test(id) || id === STORY_2915_ID) return skip(id,"invalid_or_special_generation_record");
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 90) return skip(id,"verified_schedule_horizon_required");
  const read = deps.read || (async()=> (await factorySupabaseApprovalRows(env,[id])).get(id));
  const rest = deps.rest || ((query,options)=>supabaseRest(env,query,options));
  const bucket = env.STUDIO_MEDIA;
  const claim = deps.claim || ((profile,owner,at)=>factoryBatchLock(bucket,profile,owner,at));
  const release = deps.release || ((profile,owner)=>factoryBatchUnlock(bucket,profile,owner));
  const lock = deps.lock || ((fn)=>withOutputApprovalLock(bucket,id,fn,{owner:"overdue-mae-"+crypto.randomUUID()}));
  const enabled = deps.enabled || ((profile,platform)=>scheduleReservationLaneEnabled(env,profile,platform));
  const atomic = deps.atomic || ((args,callbacks)=>runAtomicScheduleTransaction(env,args,callbacks,{maxWaitMs:2000}));
  const before = await read();
  if (!before?.row || !RECORD_ID.test(before.profileId) || !before.profileUuid ||
      !enabled(before.profileId,before.row.platform)) return skip(id,"overdue_mae_atomic_lane_unavailable");
  const owner = "overdue-mae-"+crypto.randomUUID();
  if (!await claim(before.profileId,owner,now())) return skip(id,"overdue_mae_factory_profile_busy");
  try {
    return await lock(async()=>{
      const current = await read();
      const row = current?.row;
      if (!row || current.profileId !== before.profileId || current.profileUuid !== before.profileUuid
          || row.platform !== before.row.platform || row.publish_method !== "Automated"
          || row.error_messages?.[RECEIPT] || row.platform_publish_response && Object.keys(row.platform_publish_response).length)
        return skip(id,"overdue_mae_original_state_changed");
      const fenceKey = "studio/state/initial-publish-fence/v1/"+id+".json";
      if (await (deps.fenceExists || (key=>bucket.get(key)))(fenceKey))
        return skip(id,"prior_fenced_dispatch_requires_provider_reconciliation");
      let planned = null, original = null;
      const result = await atomic({
        content_profile_id:current.profileId, platform:row.platform,
        output_type:row.platform_output_type, platform_output_record_id:id,
        content_item_id:row.content_item_airtable_id || null,
        owner_operation_id:"overdue-mae-3096:"+id+":"+String(row.scheduled_post_date),
      },{
        legacy:async()=>{throw Error("overdue_mae_atomic_lane_required");},
        plan:async({occupied_reservations=[]})=>{
          const entry = await read();
          original = entry?.row;
          if (!original || original.id !== row.id || original.updated_at !== row.updated_at
              || entry.profileId!==current.profileId || entry.profileUuid!==current.profileUuid
              || original.platform_publish_response && Object.keys(original.platform_publish_response).length)
            throw Error("overdue_mae_source_changed_under_lane");
          const at = now(), occupied=[], lane=[];
          const laneKey = maeScheduleLaneKey(original.platform,original.platform_output_type);
          let complete=false;
          for(let offset=0;offset<3000;offset+=500){
            const query="platform_outputs?content_profile_id=eq."+encodeURIComponent(entry.profileUuid)
              +"&platform=eq."+encodeURIComponent(original.platform)
              +"&scheduled_post_date=gte."+encodeURIComponent(new Date(at-MAE_SCHEDULE_GAP_MS).toISOString())
              +"&scheduled_post_date=lt."+encodeURIComponent(new Date(at+(horizonDays+2)*86400000).toISOString())
              +"&select=airtable_record_id,platform_output_type,scheduled_post_date"
              +"&order=scheduled_post_date.asc,airtable_record_id.asc&limit=500&offset="+offset;
            const rows=await rest(query);
            if(!Array.isArray(rows)||rows.length>500)throw Error("overdue_mae_occupancy_unavailable");
            for(const other of rows){
              if(other.airtable_record_id===id)continue;
              const t=ms(other.scheduled_post_date);
              if(!Number.isFinite(t))throw Error("overdue_mae_invalid_occupancy");
              occupied.push(t);
              if(maeScheduleLaneKey(original.platform,other.platform_output_type)===laneKey)lane.push(t);
            }
            if(rows.length<500){complete=true;break;}
          }
          for(const other of occupied_reservations){
            if(other.platform_output_record_id===id)continue;
            const t=ms(other.scheduled_iso);
            if(!Number.isFinite(t))throw Error("overdue_mae_invalid_durable_occupancy");
            occupied.push(t);
            if(maeScheduleLaneKey(original.platform,other.output_type)===laneKey)lane.push(t);
          }
          planned=planAuditedEarlyHoldMaeReschedule(entry.record,{
            nowMs:at,timeZone:entry.profileTimeZone,horizonDays,
            laneOccupiedMs:lane,platformOccupiedMs:occupied,occupancyComplete:complete,
          });
          if(!planned.ok)throw Error(planned.reason);
          return {action:"move",previousIso:original.scheduled_post_date,selectedIso:planned.scheduled_for};
        },
        write:async(_plan,{signal})=>{
          if(await (deps.fenceExists || (key=>bucket.get(key)))(fenceKey))throw Error("overdue_mae_provider_fence_appeared");
          const rows=await rest(overdueMaeExactSelector(original),{
            method:"PATCH",body:overdueMaeSchedulePatch(original,planned,"pending_commit",now()),
            headers:{Prefer:"return=representation"},signal,
          });
          if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==original.id)throw Error("overdue_mae_schedule_cas_not_verified");
          return rows[0];
        },
        verify:async()=>verify(await read(),original,planned,"pending_commit").scheduled_post_date,
      });
      // Never finalize an unobserved, previously committed operation here:
      // an ambiguous earlier transaction requires explicit reconciliation.
      if (!result?.atomic_schedule || result.already_committed || !planned || !original || !result.commit)
        throw Error("overdue_mae_reservation_commit_unverified");
      const pending = verify(await read(),original,planned,"pending_commit");
      const updated = await rest(overdueMaeExactSelector(pending),{
        method:"PATCH",body:overdueMaeSchedulePatch(pending,planned,"committed",now()),
        headers:{Prefer:"return=representation"},
      });
      if(!Array.isArray(updated)||updated.length!==1||updated[0].id!==pending.id)throw Error("overdue_mae_commit_receipt_cas_not_verified");
      verify(await read(),original,planned,"committed");
      return {id,rescheduled:true,scheduled_for:planned.scheduled_for};
    });
  } finally { await release(before.profileId,owner); }
}
