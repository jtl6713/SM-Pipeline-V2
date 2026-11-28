// #3159: exact NYC missing schedule-mirror repair, never a provider action or reapproval.
import { assessFreshSupabasePublish } from "./approved-publish-flow.mjs";
import { renderingReviewHoldPresent } from "./rendering-review-publication-hold.mjs";
import { factorySupabaseApprovalRows } from "./factory-supabase-approval.mjs";
import { factoryBatchLock, factoryBatchUnlock } from "./factory-approval-queue.mjs";
import { withOutputApprovalLock } from "./output-approval-lease.mjs";
import { runAtomicScheduleTransaction } from "./schedule-reservation-transaction.mjs";
import { scheduleReservationLaneEnabled } from "./schedule-reservation-authority.mjs";
import { supabaseRest } from "./supabase-pipeline-reads.mjs";
import { MAE_SCHEDULE_GAP_MS, maeScheduleLaneKey, maeScheduleNextSlot, maeNormalizeTimeZone } from "./mae-schedule.mjs";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const RECEIPT = "Studio_3159_Gallery_MAE_Repair_Receipt";
const NYC_UUID="63c2e81b-0cd1-423d-a033-11366e69bdee";
export const NYC_GALLERY_REPAIR_IDS=Object.freeze({"recQHBwfiX0wj2NKo":11110,"recXJZXhzyatwEL6Q":11100,"rec4mFjnWYzj1rLI0":10574,"recLnCSRbrYtWenCB":10590});
const ms = value => Date.parse(String(value || ""));
const sameTime = (a,b) => Number.isFinite(ms(a)) && ms(a) === ms(b);
const skip = (id,reason) => ({id, skipped:reason});
const filter = (key,value) => key + "=" + (value == null ? "is.null" : "eq." + encodeURIComponent(typeof value === "object" ? JSON.stringify(value) : String(value)));


// Only an unattempted row may move here. Prior dispatch evidence, including
// the other two allowlisted NYC rows, must follow provider reconciliation.
export function nycGalleryRepairGuard(entry,nowMs) {
  const r=entry?.row, record=entry?.record;
  const no=reason=>({ok:false,reason});
  const id=r?.airtable_record_id, f=k=>record?.fields?.[k];
  if(!r||!Object.hasOwn(NYC_GALLERY_REPAIR_IDS,id)||NYC_GALLERY_REPAIR_IDS[id]!==r.output_number||
     record?.id!==id||entry.profileUuid!==NYC_UUID||r.content_profile_id!==NYC_UUID||
     !r.content_item_airtable_id||!Number.isFinite(nowMs))return no("exact_nyc_identity_required");
  if(r.studio_scheduled_at!=null)return no("schedule_mirror_already_present");
  if(!Number.isFinite(ms(r.scheduled_post_date))||r.publish_status!=="Ready to Schedule"||
     r.render_status!=="Native Photo Route"||r.publish_hold_reason||r.test_run_id||
     r.output_status!=="Approved for Publishing"||r.review_status!=="Approved"||
     r.publish_method!=="Automated"||r.do_not_publish!==false||r.auto_publish_enabled!==true||
     renderingReviewHoldPresent(f)||f("Manual_Fallback_Required")===true||
     f("Replace_Transaction_ID")||f("Replace_Fingerprint"))return no("gallery_schedule_state_changed");
  if(!((r.platform==="Instagram"&&r.platform_output_type==="Instagram Carousel"&&r.studio_output_type==="Carousel")||
       (r.platform==="Facebook"&&r.platform_output_type==="Facebook Photo Set"&&r.studio_output_type==="Multi-Image Post")))
    return no("gallery_type_changed");
  if(Number(f("Studio_Publish_Dispatch_Count")||0)!==0||Number(f("Publish_Attempt_Count")||0)!==0||
     f("Publish_Locked_By")||f("Publish_Locked_At")||f("FB_Post_ID")||f("FB_Video_ID")||
     (r.publish_next_retry_at&&ms(r.publish_next_retry_at)>nowMs)||r.error_messages?.[RECEIPT])
    return no("prior_dispatch_or_lock_requires_reconciliation");
  // The ordinary fresh-publication classifier also checks all provider-specific
  // attempts and receipts. A media/ caption deficiency is safe for scheduling
  // only; it does not grant publication eligibility.
  const gate=assessFreshSupabasePublish(record,{nowMs:Math.max(nowMs,ms(r.scheduled_post_date))});
  if(!["fresh_approved_due_unattempted","media_not_ready","caption_not_ready"].includes(gate.reason))
    return no(gate.reason);
  return {ok:true};
}
export function planNycGalleryRepair(entry,{nowMs,timeZone,horizonDays,laneOccupiedMs,platformOccupiedMs,occupancyComplete}){
  const guard=nycGalleryRepairGuard(entry,nowMs);
  if(!guard.ok)return guard;
  if(occupancyComplete!==true||!Array.isArray(laneOccupiedMs)||!Array.isArray(platformOccupiedMs)||
     [...laneOccupiedMs,...platformOccupiedMs].some(x=>!Number.isFinite(x))||
     timeZone!=="America/New_York"||maeNormalizeTimeZone(timeZone)!==timeZone)
    return {ok:false,reason:"verified_nyc_occupancy_required"};
  const slot=maeScheduleNextSlot({timeZone,now:new Date(nowMs),horizonDays,laneOccupiedMs,platformOccupiedMs,leadMs:30*60000});
  if(!slot.ok||!(ms(slot.iso)>nowMs+30*60000))return {ok:false,reason:"no_verified_future_mae_slot"};
  const r=entry.row;
  return {ok:true,scheduled_for:slot.iso,receipt:{version:"issue-3159-nyc-mae-v1",output_record_id:r.airtable_record_id,
    original_scheduled_at:r.scheduled_post_date,scheduled_for:slot.iso,planned_at:new Date(nowMs).toISOString(),time_zone:timeZone}};
}

export function nycGalleryExactSelector(row) {
  // Full observed bag equality prevents losing a concurrent provider stamp even
  // if its writer did not advance updated_at. Refuse oversized requests.
  if (!row?.id || !row.updated_at || !RECORD_ID.test(row.airtable_record_id) ||
      !row.error_messages || typeof row.error_messages !== "object" ||
      Array.isArray(row.error_messages)) throw Error("nyc_gallery_mae_exact_identity_missing");
  const keys = ["id","airtable_record_id","content_profile_id","content_item_id","platform",
    "platform_output_type","updated_at","output_status","review_status","publish_status",
    "publish_method","do_not_publish","auto_publish_enabled","test_run_id","publish_hold_reason","render_status","studio_output_type","scheduled_post_date",
    "studio_scheduled_at","youtube_scheduled_publish_at","published_at","platform_post_url",
    "platform_publish_response","publish_next_retry_at","asset_set_revision","error_messages"];
  const query = "platform_outputs?" + keys.map(k=>filter(k,row[k])).join("&") + "&select=id";
  if (query.length > 16000) throw Error("nyc_gallery_mae_exact_selector_too_large");
  return query;
}

export function nycGallerySchedulePatch(row, plan, state, nowMs) {
  const iso = plan.scheduled_for;
  if (!plan.ok || !Number.isFinite(ms(iso)) || !["pending_commit","committed"].includes(state)) throw Error("nyc_gallery_mae_invalid_plan");
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
      || row.publish_status !== original.publish_status || row.publish_hold_reason !== original.publish_hold_reason || row.auto_publish_enabled !== true
      || row.publish_method !== "Automated" || row.do_not_publish !== false
      || row.asset_set_revision !== original.asset_set_revision || row.published_at || row.platform_post_url
      || !sameTime(row.scheduled_post_date, plan.scheduled_for)
      || !sameTime(row.studio_scheduled_at, plan.scheduled_for)
      || (row.platform==="YouTube" && !sameTime(row.youtube_scheduled_publish_at, plan.scheduled_for))
      || receipt?.state !== state || Object.entries(plan.receipt).some(([k,v])=>receipt[k]!==v)
      || Object.entries(original.error_messages).some(([k,v])=>k!==RECEIPT && JSON.stringify(row.error_messages[k])!==JSON.stringify(v)))
    throw Error("nyc_gallery_mae_authoritative_readback_failed");
  return row;
}

/** Bounded single-output operation. No provider calls or approval/hold changes.
 * Uses both the Factory profile claim and shared output lease, then the existing
 * atomic reservation lane. An ambiguous schedule write leaves a pending receipt
 * and the reservation quarantined, never a second publish authorization.
 */
export async function recoverNycGalleryMae(env, id, {horizonDays, now=Date.now} = {}, deps = {}) {
  if (!Object.hasOwn(NYC_GALLERY_REPAIR_IDS,id)) return skip(id,"outside_exact_nyc_repair_scope");
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 90) return skip(id,"verified_schedule_horizon_required");
  const read = deps.read || (async()=> (await factorySupabaseApprovalRows(env,[id])).get(id));
  const rest = deps.rest || ((query,options)=>supabaseRest(env,query,options));
  const bucket = env.STUDIO_MEDIA;
  const claim = deps.claim || ((profile,owner,at)=>factoryBatchLock(bucket,profile,owner,at));
  const release = deps.release || ((profile,owner)=>factoryBatchUnlock(bucket,profile,owner));
  const lock = deps.lock || ((fn)=>withOutputApprovalLock(bucket,id,fn,{owner:"nyc-gallery-mae-"+crypto.randomUUID()}));
  const enabled = deps.enabled || ((profile,platform)=>scheduleReservationLaneEnabled(env,profile,platform));
  const atomic = deps.atomic || ((args,callbacks)=>runAtomicScheduleTransaction(env,args,callbacks,{maxWaitMs:2000}));
  const before = await read();
  if (!before?.row || !RECORD_ID.test(before.profileId) || !before.profileUuid ||
      !enabled(before.profileId,before.row.platform)) return skip(id,"nyc_gallery_mae_atomic_lane_unavailable");
  const initial = nycGalleryRepairGuard(before,now());
  if(!initial.ok)return skip(id,initial.reason);
  const owner = "nyc-gallery-mae-"+crypto.randomUUID();
  if (!await claim(before.profileId,owner,now())) return skip(id,"nyc_gallery_mae_factory_profile_busy");
  try {
    return await lock(async()=>{
      const current = await read();
      const row = current?.row;
      const decision=nycGalleryRepairGuard(current,now());
      if(!decision.ok)return skip(id,decision.reason);
      if (!row || current.profileId !== before.profileId || current.profileUuid !== before.profileUuid
          || row.platform !== before.row.platform || row.publish_method !== "Automated"
          || row.error_messages?.[RECEIPT] || row.platform_publish_response && Object.keys(row.platform_publish_response).length)
        return skip(id,"nyc_gallery_mae_original_state_changed");
      const fenceKey = "studio/state/initial-publish-fence/v1/"+id+".json";
      if (await (deps.fenceExists || (key=>bucket.get(key)))(fenceKey))
        return skip(id,"prior_fenced_dispatch_requires_provider_reconciliation");
      let planned = null, original = null;
      const result = await atomic({
        content_profile_id:current.profileId, platform:row.platform,
        output_type:row.platform_output_type, platform_output_record_id:id,
        content_item_id:row.content_item_airtable_id || null,
        owner_operation_id:"nyc-gallery-mae-3159:"+id+":"+String(row.scheduled_post_date),
      },{
        legacy:async()=>{throw Error("nyc_gallery_mae_atomic_lane_required");},
        plan:async({occupied_reservations=[]})=>{
          const entry = await read();
          original = entry?.row;
          if (!original || original.id !== row.id || original.updated_at !== row.updated_at
              || entry.profileId!==current.profileId || entry.profileUuid!==current.profileUuid
              || original.platform_publish_response && Object.keys(original.platform_publish_response).length)
            throw Error("nyc_gallery_mae_source_changed_under_lane");
          const at = now(), occupied=[], lane=[];
          const guard=nycGalleryRepairGuard(entry,at);
          if(!guard.ok)throw Error(guard.reason);
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
            if(!Array.isArray(rows)||rows.length>500)throw Error("nyc_gallery_mae_occupancy_unavailable");
            for(const other of rows){
              if(other.airtable_record_id===id)continue;
              const t=ms(other.scheduled_post_date);
              if(!Number.isFinite(t))throw Error("nyc_gallery_mae_invalid_occupancy");
              occupied.push(t);
              if(maeScheduleLaneKey(original.platform,other.platform_output_type)===laneKey)lane.push(t);
            }
            if(rows.length<500){complete=true;break;}
          }
          for(const other of occupied_reservations){
            if(other.platform_output_record_id===id)continue;
            const t=ms(other.scheduled_iso);
            if(!Number.isFinite(t))throw Error("nyc_gallery_mae_invalid_durable_occupancy");
            occupied.push(t);
            if(maeScheduleLaneKey(original.platform,other.output_type)===laneKey)lane.push(t);
          }
          planned=planNycGalleryRepair(entry,{
            nowMs:at,timeZone:entry.profileTimeZone,horizonDays,
            laneOccupiedMs:lane,platformOccupiedMs:occupied,occupancyComplete:complete,
          });
          if(!planned.ok)throw Error(planned.reason);
          return {action:"move",previousIso:original.scheduled_post_date,selectedIso:planned.scheduled_for};
        },
        write:async(_plan,{signal})=>{
          if(await (deps.fenceExists || (key=>bucket.get(key)))(fenceKey))throw Error("nyc_gallery_mae_provider_fence_appeared");
          const rows=await rest(nycGalleryExactSelector(original),{
            method:"PATCH",body:nycGallerySchedulePatch(original,planned,"pending_commit",now()),
            headers:{Prefer:"return=representation"},signal,
          });
          if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==original.id)throw Error("nyc_gallery_mae_schedule_cas_not_verified");
          return rows[0];
        },
        verify:async()=>verify(await read(),original,planned,"pending_commit").scheduled_post_date,
      });
      // Never finalize an unobserved, previously committed operation here:
      // an ambiguous earlier transaction requires explicit reconciliation.
      if (!result?.atomic_schedule || result.already_committed || !planned || !original || !result.commit)
        throw Error("nyc_gallery_mae_reservation_commit_unverified");
      const pending = verify(await read(),original,planned,"pending_commit");
      const updated = await rest(nycGalleryExactSelector(pending),{
        method:"PATCH",body:nycGallerySchedulePatch(pending,planned,"committed",now()),
        headers:{Prefer:"return=representation"},
      });
      if(!Array.isArray(updated)||updated.length!==1||updated[0].id!==pending.id)throw Error("nyc_gallery_mae_commit_receipt_cas_not_verified");
      verify(await read(),original,planned,"committed");
      return {id,rescheduled:true,scheduled_for:planned.scheduled_for};
    });
  } finally { await release(before.profileId,owner); }
}

/** One lifetime attempt per exact output; the bounded R2 journal prevents
 * repeated DB reads after all four are classified. An uncertain attempt may
 * only be reconciled through a separately reviewed recovery, never replayed. */
export async function runNycGalleryScheduleRepair(env,{horizonDays}={}){
  const bucket=env.STUDIO_MEDIA;
  if(!bucket)return {status:"journal_unavailable"};
  const prefix="studio/state/3159-nyc-mae-v1/";
  if(await bucket.get(prefix+"complete.json"))return {status:"exact_repair_journal_complete"};
  for(const id of Object.keys(NYC_GALLERY_REPAIR_IDS)){
    const marker=prefix+id+"/entered.json";
    if(await bucket.get(marker))continue;
    const at=Date.now();
    const entry={version:1,id,output:NYC_GALLERY_REPAIR_IDS[id],entered_at:new Date(at).toISOString()};
    if(!await bucket.put(marker,JSON.stringify(entry),{onlyIf:new Headers({"If-None-Match":"*"})}))return {status:"exact_repair_already_claimed"};
    let result;
    try{result=await recoverNycGalleryMae(env,id,{horizonDays});}
    catch{result={id,skipped:"uncertain_transaction_reconcile_no_replay"};}
    const outcome={...entry,...result,completed_at:new Date().toISOString()};
    if(!await bucket.put(prefix+id+"/outcome.json",JSON.stringify(outcome),{onlyIf:new Headers({"If-None-Match":"*"})}))
      return {status:"outcome_journal_unconfirmed_no_replay",output:entry.output};
    return result.rescheduled?{status:"rescheduled",output:entry.output,scheduled_for:result.scheduled_for}:
      {status:"blocked_no_replay",output:entry.output,reason:result.skipped};
  }
  // Do not claim completion while another isolate has entered but not recorded
  // its outcome. No additional database calls are made in that case.
  for(const id of Object.keys(NYC_GALLERY_REPAIR_IDS))if(!await bucket.get(prefix+id+"/outcome.json"))return {status:"entered_outcome_unresolved"};
  await bucket.put(prefix+"complete.json",JSON.stringify({version:1,completed_at:new Date().toISOString()}),{onlyIf:new Headers({"If-None-Match":"*"})});
  return {status:"exact_repair_journal_complete"};
}
