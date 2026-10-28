/**
 * Inactive composition boundary for manual Chicago Reel admission.
 *
 * Reuses the existing authoritative Airtable hold/session adapter, R2
 * output-approval lease and atomic MAE vacate adapter. No new scheduler,
 * database, posting route or publishing side effect is introduced.
 *
 * This module is not imported by Worker routes. It may only be mounted
 * after independent publisher ownership, hold and schedule checks are proven.
 */
import {
  makeRenderingReviewAirtableOperations,
} from "./rendering-review-airtable.mjs";
import {
  makeRenderingReviewAtomicScheduleHooks,
} from "./rendering-review-schedule-owner.mjs";
import {
  reviewEnrollmentWriteEnabled,
} from "./rendering-review-enrollment-http.mjs";

const CONTENT_ITEMS_TABLE_ID = "tblwzN9AXWvmKVKPs";
const idPattern=/^rec[A-Za-z0-9]{14}$/;

function required(name,value){
  if(typeof value!=="function"){
    const error=new Error("Trusted Rendering Review integration requires "+name);
    error.code="REVIEW_INTEGRATION_MISSING";
    error.status=503;
    throw error;
  }
}

/**
 * The *only* authoritative source writes are delegated to the existing
 * injected Airtable client (hold/session) and the atomic scheduling lane's
 * exact-output vacate writer. The latter must be a server-owned callback,
 * never an arbitrary operation supplied by a request body.
 */
export function composeRenderingReviewEnrollmentOperations({
  env,airtableFetch,listRecords,readField,withOutputApprovalLock,
  authorizeReview,authorizeEvent,writeVacateUnderLane,postCommit,
  scheduleTransaction,holdIdFactory,
}={}){
  for(const [key,value] of Object.entries({
    airtableFetch,listRecords,readField,withOutputApprovalLock,
    authorizeReview,authorizeEvent,writeVacateUnderLane,postCommit,
  }))required(key,value);
  const tableId=String(env?.AIRTABLE_OUTPUT_TABLE_ID||"").trim();
  if(!tableId){
    const error=new Error("Authoritative Airtable Platform Outputs table required");
    error.code="REVIEW_INTEGRATION_MISSING";
    error.status=503;
    throw error;
  }
  // Five protected gates are checked independently by the HTTP handler.
  // Repeat them here so standalone adapters cannot grant write capability.
  // These are deployment-side env bindings, NEVER user-supplied flags.
  const mutationGate=reviewEnrollmentWriteEnabled(env);

  const readExact=async(table,id)=>{
    if(!idPattern.test(String(id||""))){
      const error=new Error("Exact Airtable record ID required");
      error.code="REVIEW_IDENTITY_INVALID";error.status=400;throw error;
    }
    const row=await airtableFetch(env,table,id);
    if(row?.id!==id||!row.fields){
      const error=new Error("Authoritative Airtable record unavailable");
      error.code="REVIEW_SOURCE_UNAVAILABLE";error.status=503;throw error;
    }
    return row;
  };
  const schedule=makeRenderingReviewAtomicScheduleHooks({
    env,readOutput:id=>readExact(tableId,id),
    readContentItem:id=>readExact(CONTENT_ITEMS_TABLE_ID,id),
    writeVacateUnderLane,postCommit,mutationGate,
    ...(typeof scheduleTransaction==="function"?{scheduleTransaction}:{}),
  });
  return makeRenderingReviewAirtableOperations({
    env,airtableFetch,listRecords,readField,withOutputApprovalLock,
    authorizeReview,authorizeEvent,
    revokeScheduleUnderHold:schedule.revokeScheduleUnderHold,
    scheduleRevocationReady:schedule.scheduleRevocationReady,
    mutationGate,
    ...(typeof holdIdFactory==="function"?{holdIdFactory}:{}),
  });
}
