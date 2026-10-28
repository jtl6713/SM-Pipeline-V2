/**
 * Airtable-backed projections for exact Rendering Review attempt commits.
 *
 * Never called by user request data directly. Each caller MUST hold the
 * canonical R2 output approval lock, have a verified Chicago review hold,
 * and pass all protected render/outbox flags. Session JSON remains the
 * authority; Plan/Attempt/Job rows are repairable, strict-identity projections.
 */
import {makeRenderingReviewAirtableOperations,RENDER_REVIEW_TABLES}
  from "./rendering-review-airtable.mjs";
import {renderAttemptCommitEnabled} from "./rendering-review-attempt-outbox.mjs";

const rec=/^rec[A-Za-z0-9]{14}$/;
const id=/^[A-Za-z0-9_-]{8,120}$/;
const str=x=>String(x??"").trim();
function deny(code,message,status=409){
  const e=new Error(message);e.code=code;e.status=status;throw e;
}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function makeRenderingReviewOutboxAirtableOperations({
  env,airtableFetch,listRecords,readField,withOutputApprovalLock,authorizeReview,
}){
  if(!renderAttemptCommitEnabled(env))
    deny("OUTBOX_DISABLED","Attempt persistence is disabled",405);
  for(const [key,value] of Object.entries({airtableFetch,listRecords,readField,
    withOutputApprovalLock,authorizeReview})){
    if(typeof value!=="function")
      deny("OUTBOX_ADAPTER_MISSING","Trusted "+key+" adapter required",503);
  }
  const base=makeRenderingReviewAirtableOperations({
    env,airtableFetch,listRecords,readField,withOutputApprovalLock,authorizeReview,
    authorizeEvent:async()=>false,
    revokeScheduleUnderHold:async()=>deny("OUTBOX_SCHEDULER_DENIED",
      "Render intent cannot vacate or approve schedules",405),
    mutationGate:true,
  });
  const tableIds=RENDER_REVIEW_TABLES;
  let sessionRow=null;
  async function find(table,field,value,fields){
    if(!id.test(str(value)))deny("OUTBOX_ID_INVALID","Exact immutable record identifier required",400);
    const query=await listRecords(env,table,{
      limit:2,filterFormula:'{'+field+'}="'+value+'"',
      fields,
    });
    const rows=Array.isArray(query)?query:query?.records;
    if(!Array.isArray(rows)||rows.length>1)
      deny("OUTBOX_LOOKUP_UNVERIFIED","Unique immutable record lookup unavailable",503);
    if(rows.length&&!rec.test(rows[0].id))
      deny("OUTBOX_ROW_IDENTITY_INVALID","Airtable record identity missing",503);
    return rows[0]||null;
  }
  async function currentSession(idValue){
    if(sessionRow?.fields?.Session_ID===idValue)return sessionRow;
    const row=await find(tableIds.sessions,"Session_ID",idValue,
      ["Session_ID","Output_Record_ID","Row_Version"]);
    if(!row||str(row.fields?.Session_ID)!==idValue||
       !rec.test(str(row.fields?.Output_Record_ID)))
      deny("OUTBOX_SESSION_NOT_FOUND","Authoritative review session row missing",503);
    sessionRow=row;return row;
  }
  async function upsert(table,identityField,identityValue,fields){
    const keys=Object.keys(fields);
    let row=await find(table,identityField,identityValue,keys);
    if(!row){
      await airtableFetch(env,table,"",{
        method:"POST",body:JSON.stringify({fields,typecast:false}),
      });
      row=await find(table,identityField,identityValue,keys);
    }
    if(!row)
      deny("OUTBOX_RECORD_UNVERIFIED","Durable projection was not independently saved",503);
    for(const [key,value] of Object.entries(fields)){
      if(!same(row.fields?.[key],value))
        deny("OUTBOX_RECORD_CONFLICT","Immutable projection identity or payload differs",409);
    }
    return row;
  }
  const operations={
    ...base,
    async upsertPlanIfAbsent(p){
      const session=await currentSession(p.session_id);
      const fields={
        Plan_ID:p.plan_id,Review_Session:[session.id],
        Session_ID:p.session_id,Plan_Version:p.plan_version,
        Source_Attempt_ID:p.source_attempt_id,Plan_Hash:p.plan_hash,
        Plan_State:"committed",
        Frozen_Plan_JSON:JSON.stringify(p.immutable_manifest),
        Asset_Manifest_JSON:JSON.stringify(p.immutable_manifest.asset_manifest||[]),
        Fact_Sources_JSON:JSON.stringify(p.immutable_manifest.fact_sources||[]),
        Acceptance_Checks_JSON:JSON.stringify(
          p.immutable_manifest.creative?.acceptance_checks||[]),
      };
      // Created_At is set only on create, not compared for replay.
      return upsert(tableIds.plans,"Plan_ID",p.plan_id,fields);
    },
    async upsertAttemptIfAbsent(a){
      const session=await currentSession(a.session_id);
      return upsert(tableIds.attempts,"Attempt_ID",a.attempt_id,{
        Attempt_ID:a.attempt_id,Review_Session:[session.id],
        Session_ID:a.session_id,Output_Record_ID:a.output_id,
        Attempt_Number:a.attempt_number,
        Parent_Attempt_ID:a.parent_attempt_id,
        Plan_ID:a.plan_id,Plan_Version:a.plan_version,
        Job_ID:a.job_id,Attempt_Status:"queued",
        Cleanup_State:"not_applicable",
      });
    },
    async upsertJobIfAbsent(j){
      const session=await currentSession(j.session_id);
      return upsert(tableIds.jobs,"Job_ID",j.job_id,{
        Job_ID:j.job_id,Review_Session:[session.id],
        Session_ID:j.session_id,Output_Record_ID:j.output_id,
        Attempt_ID:j.attempt_id,Plan_ID:j.plan_id,
        Plan_Hash:j.plan_hash,Idempotency_Key:j.idempotency_key,
        Job_State:"queued",Progress_Stage:j.progress_stage,
        Progress_Percent:0,Lease_Fence:0,Retry_Count:0,
        Event_History_JSON:"[]",
      });
    },
    async readPlan(planId){
      const row=await find(tableIds.plans,"Plan_ID",planId,["Plan_ID","Session_ID","Plan_Hash"]);
      return row?{plan_id:str(row.fields.Plan_ID),
        session_id:str(row.fields.Session_ID),plan_hash:str(row.fields.Plan_Hash)}:null;
    },
    async readAttempt(attemptId){
      const row=await find(tableIds.attempts,"Attempt_ID",attemptId,
        ["Attempt_ID","Job_ID","Attempt_Number"]);
      return row?{attempt_id:str(row.fields.Attempt_ID),
        job_id:str(row.fields.Job_ID),attempt_number:Number(row.fields.Attempt_Number)}:null;
    },
    async readJob(jobId){
      const row=await find(tableIds.jobs,"Job_ID",jobId,
        ["Job_ID","Attempt_ID","Plan_Hash","Job_State"]);
      return row?{job_id:str(row.fields.Job_ID),attempt_id:str(row.fields.Attempt_ID),
        plan_hash:str(row.fields.Plan_Hash),state:str(row.fields.Job_State)}:null;
    },
  };
  return operations;
}
