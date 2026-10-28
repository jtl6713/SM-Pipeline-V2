/**
 * Airtable adapter for the Rendering Review admission coordinator.
 * Zero routes or workflows call this until dispatch/approval fences are proven.
 * Existing Airtable is the authoritative write source; no Supabase authority.
 *
 * MUTATIONS ARE DISABLED BY DEFAULT, EVEN IF A CALLER INSTANTIATES THIS MODULE.
 * Never flip the protected deployment flag until the irreversible platform
 * dispatch owner has been updated to re-read and enforce the dedicated hold.
 */
import { CHICAGO_PROFILE_ID, REVIEW_SCHEMA } from "./rendering-review-policy.mjs";
import { renderingReviewOutputView } from "./rendering-review-output-view.mjs";
import { renderingReviewHoldPresent } from "./rendering-review-publication-hold.mjs";

export const RENDER_REVIEW_TABLES = Object.freeze({
  sessions: "tblHX3UdoNszkoquG",
  messages: "tbl8tuxw838DQiGKo",
  plans: "tblalFXUJyYg5PBrz",
  attempts: "tbl7wPOAE26o2coMU",
  requirements: "tblbnKA0Cb2Mnlg5r",
  jobs: "tblUkZB6SMtf9Ib6I",
});
export const RENDER_REVIEW_OUTPUT_FIELDS = Object.freeze({
  hold_active: "Studio_Render_Review_Hold_Active",
  hold_owner: "Studio_Render_Review_Hold_Owner",
  hold_id: "Studio_Render_Review_Hold_ID",
  session_id: "Studio_Render_Review_Session_ID",
});
const recordRe = /^rec[A-Za-z0-9]{14}$/;
const text = x => String(x ?? "").trim();
function error(code, message, status = 409) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  throw e;
}
function linkedId(value) {
  if (Array.isArray(value)) return linkedId(value[0]);
  if (typeof value === "string") return value;
  if (value?.linkedRecordIds?.length) return value.linkedRecordIds[0];
  if (value?.id) return value.id;
  return "";
}
function name(value) {
  return typeof value === "string" ? value : text(value?.name);
}
function formulaId(id) {
  if (!recordRe.test(text(id))) error("INVALID_OUTPUT_ID","Exact Platform Output record ID required",400);
  return id;
}
function identity(session) {
  if (!session || session.schema !== REVIEW_SCHEMA ||
      !recordRe.test(text(session.output_id)) ||
      !/^[A-Za-z0-9_-]{8,120}$/.test(text(session.id)) ||
      !Number.isSafeInteger(session.version) || session.version < 1)
    error("INVALID_SESSION", "Review session record failed validation", 400);
}
/**
 * Server must supply trusted access and transport functions from the existing
 * Worker. Gate must be read from protected deployment configuration, not HTTP
 * request bodies, client headers, or Airtable user-editable settings.
 */
export function makeRenderingReviewAirtableOperations({
  env, airtableFetch, listRecords, readField,
  withOutputApprovalLock, authorizeReview, authorizeEvent,
  revokeScheduleUnderHold, scheduleRevocationReady = null,
  mutationGate = false, holdIdFactory = () => "rrhold-" + crypto.randomUUID(),
}) {
  for (const [k,v] of Object.entries({
    airtableFetch,listRecords,readField,withOutputApprovalLock,authorizeReview,authorizeEvent,
    revokeScheduleUnderHold,
  })) if (typeof v !== "function") error("ADAPTER_NOT_CONFIGURED",k+" is required",503);
  const outputTable = text(env?.AIRTABLE_OUTPUT_TABLE_ID);
  if (!outputTable) error("ADAPTER_NOT_CONFIGURED","Authoritative Platform Output table missing",503);
  const f=(record,field)=>readField(record,field);
  const readRaw = async id => {
    const row = await airtableFetch(env,outputTable,formulaId(id));
    if(row?.id!==id || !row.fields)
      error("OUTPUT_IDENTITY_CONFLICT","Authoritative output readback failed",503);
    return row;
  };
  const writeEnabled = () => {
    if (mutationGate !== true)
      error("PILOT_WRITE_DISABLED", "Rendering Review writes remain disabled until provider dispatch fencing",403);
  };
  const storedSession = async outputId => {
    const recordId=formulaId(outputId);
    // Exact indexed scope: no full table scan, and fail closed on duplicates.
    const found=await listRecords(env,RENDER_REVIEW_TABLES.sessions,{
      limit:2,fields:["Session_ID","Output_Record_ID","Session_JSON","Row_Version"],
      filterFormula:'{Output_Record_ID}="' + recordId + '"',
    });
    const rows=Array.isArray(found) ? found : found?.records || [];
    if(rows.length>1)error("DUPLICATE_REVIEW_SESSION","Multiple authoritative sessions exist for output");
    if(!rows.length)return null;
    const row=rows[0];
    let session;
    try {session=JSON.parse(text(f(row,"Session_JSON")))}
    catch {error("BAD_SESSION_JSON","Stored Rendering Review session cannot be read")}
    identity(session);
    if(session.output_id!==recordId || text(f(row,"Output_Record_ID"))!==recordId ||
       text(f(row,"Session_ID"))!==session.id ||
       Number(f(row,"Row_Version"))!==session.version)
      error("SESSION_IDENTITY_CONFLICT","Airtable session identity or version mismatch");
    return {row,session};
  };
  const viewOutput = async record => {
    // Output.Content_Profile is a display lookup. Admission identity comes
    // exclusively from the authoritative linked Content Item's profile ID.
    const links=f(record,"Content_Item");
    if(!Array.isArray(links) || links.length!==1 || !recordRe.test(links[0]))
      error("CONTENT_IDENTITY_CONFLICT","Review requires exactly one linked Content Item");
    const content=await airtableFetch(env,"tblwzN9AXWvmKVKPs",links[0]);
    const profiles=f(content,"Content_Profile");
    if(content?.id!==links[0] || !Array.isArray(profiles) || profiles.length!==1 || !recordRe.test(profiles[0]))
      error("PROFILE_IDENTITY_CONFLICT","Review requires one authoritative Content Profile");
    return {...renderingReviewOutputView(record,readField,RENDER_REVIEW_OUTPUT_FIELDS.hold_active),
      profile_id:profiles[0]};
  };
  const readHold=async outputId => {
    const row=await readRaw(outputId);
    return {
      id:text(f(row,RENDER_REVIEW_OUTPUT_FIELDS.hold_id)),
      output_id:outputId,owner:text(f(row,RENDER_REVIEW_OUTPUT_FIELDS.hold_owner)),
      active:Boolean(f(row,RENDER_REVIEW_OUTPUT_FIELDS.hold_active)),
      verified:true,
    };
  };
  return {
    authorizeReview,authorizeEvent,
    withOutputLock:(outputId,fn)=>withOutputApprovalLock(env.STUDIO_MEDIA,formulaId(outputId),fn),
    readOutput:async outputId=>viewOutput(await readRaw(outputId)),
    readHold,
    loadSession:async outputId=>(await storedSession(outputId))?.session || null,
    readSession:async outputId=>(await storedSession(outputId))?.session || null,
    // Advisory availability is checked under the same output lease before
    // placing a persistent hold. No fallback to an unverified legacy scheduler.
    assertScheduleRevocationReady:async descriptor=>{
      writeEnabled();
      if(typeof scheduleRevocationReady!=="function")return false;
      return (await scheduleRevocationReady({env,...descriptor}))===true;
    },
    claimHold:async ({output_id,session_id})=>{
      writeEnabled();
      const row=await readRaw(output_id);
      if(renderingReviewHoldPresent(field=>f(row,field)))
        error("ALREADY_HELD","A durable Rendering Review hold already exists");
      if(name(f(row,"Publish_Status")).toLowerCase()==="published" ||
         f(row,"Publish_Started_At") || f(row,"Publish_Locked_At") || f(row,"Published_At") ||
         f(row,"Platform_Post_ID") || f(row,"Platform_Post_URL") ||
         f(row,"Platform_Media_ID"))
        error("DISPATCH_ALREADY_STARTED","Cannot claim hold after dispatch starts");
      const holdId=text(holdIdFactory());
      if(!/^[A-Za-z0-9_-]{8,120}$/.test(holdId))
        error("INVALID_HOLD_ID","Server hold ID failed validation",503);
      await airtableFetch(env,outputTable,output_id,{
        method:"PATCH",body:JSON.stringify({fields:{
          Do_Not_Publish:true,
          [RENDER_REVIEW_OUTPUT_FIELDS.hold_active]:true,
          [RENDER_REVIEW_OUTPUT_FIELDS.hold_owner]:session_id,
          [RENDER_REVIEW_OUTPUT_FIELDS.hold_id]:holdId,
          [RENDER_REVIEW_OUTPUT_FIELDS.session_id]:session_id,
        },typecast:false}),
      });
      // The coordinator independently verifies hold readback before continuing.
    },
    clearStaleSchedule:async ({output_id,review_hold_id,review_owner})=>{
      writeEnabled();
      const hold=await readHold(output_id);
      if(!hold.active || hold.id!==review_hold_id || hold.owner!==review_owner)
        error("HOLD_OWNER_MISMATCH","Cannot revoke a schedule without owned hold");
      // Scheduling mutations belong to the shared reservation authority.
      // A caller must inject a protected writer that atomically revokes the
      // output's existing occupancy under this same review hold. Never add a
      // second direct Airtable scheduling writer inside a standalone module.
      await revokeScheduleUnderHold({
        env,output_id,review_hold_id,review_owner,
      });
    },
    createSessionIfAbsent:async session=>{
      writeEnabled();
      identity(session);
      if(await storedSession(session.output_id))
        error("ALREADY_ENROLLED","A session already exists for output");
      const stamp=new Date().toISOString();
      await airtableFetch(env,RENDER_REVIEW_TABLES.sessions,"",{
        method:"POST",body:JSON.stringify({fields:{
          Session_ID:session.id,
          Platform_Output:[session.output_id],
          Output_Record_ID:session.output_id,
          Profile_Record_ID:session.profile_id,
          Output_Type:session.output_type,
          Enrollment_Reason:"manual",
          Review_State:session.state,
          Row_Version:session.version,
          Enrollment_Request_Key:session.enrollment_request_id,
          Review_Owner:session.id,
          Hold_ID:session.review_hold.id,
          Hold_Owner:session.review_hold.owner,
          Hold_Active:session.review_hold.active,
          Current_Attempt_ID:session.current_attempt_id,
          Approved_Attempt_ID:session.approved_attempt_id,
          Latest_Attempt_Number:session.latest_attempt_number,
          Latest_Plan_Version:session.latest_plan_version,
          Session_JSON:JSON.stringify(session),
          Created_At:stamp,Updated_At:stamp,
        },typecast:false}),
      });
    },
    saveSessionIfVersion:async ({output_id,expected_version,next})=>{
      writeEnabled();
      identity(next);
      if(next.output_id!==output_id)error("SESSION_IDENTITY_CONFLICT","Cannot move session to another output");
      const existing=await storedSession(output_id);
      if(!existing || existing.session.version!==expected_version) return false;
      if(next.version!==expected_version+1 || next.id!==existing.session.id ||
         next.profile_id!==existing.session.profile_id || next.output_type!==existing.session.output_type ||
         next.review_hold?.id!==existing.session.review_hold?.id ||
         next.review_hold?.owner!==existing.session.review_hold?.owner)
        error("SESSION_IDENTITY_CONFLICT","Session identity and hold ownership are immutable; version must advance once");
      const stamp=new Date().toISOString();
      if(JSON.stringify(next).length>85000)
        error("SESSION_GROWTH_LIMIT","Message history must be externalized to paginated records before continuing");
      await airtableFetch(env,RENDER_REVIEW_TABLES.sessions,existing.row.id,{
        method:"PATCH",body:JSON.stringify({fields:{
          Review_State:next.state,
          Row_Version:next.version,
          Hold_Active:next.review_hold.active,
          Current_Attempt_ID:next.current_attempt_id,
          Approved_Attempt_ID:next.approved_attempt_id,
          Latest_Attempt_Number:next.latest_attempt_number,
          Latest_Plan_Version:next.latest_plan_version,
          Session_JSON:JSON.stringify(next),Updated_At:stamp,
        },typecast:false}),
      });
      return true;
    },
    metadata:{chicago_profile_id:CHICAGO_PROFILE_ID,table_ids:RENDER_REVIEW_TABLES},
  };
}

