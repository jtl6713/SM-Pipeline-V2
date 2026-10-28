/** Authenticated, Airtable-authoritative read API. Never enrolls on preview. */
import { RENDER_REVIEW_TABLES, RENDER_REVIEW_OUTPUT_FIELDS } from './rendering-review-airtable.mjs';
import { REVIEW_SCHEMA } from './rendering-review-policy.mjs';

const text=x=>String(x??'').trim();
const rec=x=>/^rec[A-Za-z0-9]{14}$/.test(text(x));
function fail(status,message){const e=new Error(message);e.status=status;throw e;}
const summary=row=>({
  session_id:row.fields.Session_ID,output_id:row.fields.Output_Record_ID,
  profile_id:row.fields.Profile_Record_ID,output_type:row.fields.Output_Type,
  state:row.fields.Review_State,version:row.fields.Row_Version,
  current_attempt_id:row.fields.Current_Attempt_ID,attempt_number:row.fields.Latest_Attempt_Number,
  hold_active:row.fields.Hold_Active===true,updated_at:row.fields.Updated_At,
});
const summaryFields=['Session_ID','Output_Record_ID','Profile_Record_ID','Output_Type','Review_State',
  'Row_Version','Current_Attempt_ID','Latest_Attempt_Number','Hold_Active','Updated_At'];

export async function readRenderingReviewWorkspace({env,url,authorization,operations}){
  if(!authorization?.authenticated||!authorization?.authorized||!authorization?.permissions?.outputs_review)
    fail(403,'Rendering Review permission required');
  const profiles=await operations.authorizedProfiles(env,authorization);
  const allowed=new Set(profiles.map(p=>p.id).filter(rec));
  const requested=text(url.searchParams.get('profile_id'));
  if(requested&&!allowed.has(requested))fail(403,'Content Profile is not available for this membership');
  const scope=requested?[requested]:[...allowed];
  const flags={admission_enabled:false,automatic_sampling_percent:0,integration_verified:false};
  if(url.pathname==='/api/rendering-review/sessions'){
    if(!scope.length)return {ok:true,sessions:[],next_cursor:null,as_of:new Date().toISOString(),flags};
    const filter='OR('+scope.map(id=>'{Profile_Record_ID}="'+id+'"').join(',')+')';
    const page=await operations.listRecordsPage(env,RENDER_REVIEW_TABLES.sessions,{
      limit:30,filterFormula:filter,fields:summaryFields,
      sortField:'Updated_At',sortDirection:'desc',offset:url.searchParams.get('cursor')||null,
    });
    if(!page.valid)fail(503,'Authoritative review list unavailable');
    // A malformed scope result must never leak another tenant's review data.
    if(page.records.some(row=>!scope.includes(row.fields?.Profile_Record_ID)))
      fail(503,'Review scope readback mismatch');
    return {ok:true,sessions:page.records.map(summary),next_cursor:page.offset||null,
      as_of:new Date().toISOString(),flags};
  }
  const match=/^\/api\/rendering-review\/outputs\/(rec[A-Za-z0-9]{14})$/.exec(url.pathname);
  if(!match)fail(404,'Rendering Review route not found');
  const outputId=match[1];
  const rows=await operations.listRecords(env,RENDER_REVIEW_TABLES.sessions,{
    limit:2,filterFormula:'{Output_Record_ID}="'+outputId+'"',
    fields:[...summaryFields,'Session_JSON','Hold_ID','Hold_Owner'],
  });
  if(rows.length!==1)fail(rows.length?409:404,rows.length?'Duplicate review sessions require reconciliation':'Output is not enrolled');
  const row=rows[0],fields=row.fields||{};
  if(!scope.includes(fields.Profile_Record_ID))fail(403,'Content Profile is not available for this membership');
  let session;
  try{session=JSON.parse(fields.Session_JSON);}catch{fail(409,'Stored review session is malformed');}
  if(session?.schema!==REVIEW_SCHEMA||session.output_id!==outputId||session.id!==fields.Session_ID||
    session.profile_id!==fields.Profile_Record_ID||session.version!==fields.Row_Version||
    session.current_attempt_id!==fields.Current_Attempt_ID||session.review_hold?.id!==fields.Hold_ID||
    session.review_hold?.owner!==fields.Hold_Owner)
    fail(409,'Stored review identity or version mismatch');
  const output=await operations.airtableFetch(env,env.AIRTABLE_OUTPUT_TABLE_ID,outputId);
  if(output?.id!==outputId||!output.fields)fail(503,'Authoritative output unavailable');
  const f=output.fields;
  const held=f[RENDER_REVIEW_OUTPUT_FIELDS.hold_active]===true&&
    f[RENDER_REVIEW_OUTPUT_FIELDS.hold_id]===session.review_hold.id&&
    f[RENDER_REVIEW_OUTPUT_FIELDS.hold_owner]===session.id&&
    f[RENDER_REVIEW_OUTPUT_FIELDS.session_id]===session.id;
  return {ok:true,...summary(row),session,
    publication_hold_verified:held,
    integrity_error:session.review_hold.active&&!held?'HOLD_NOT_VERIFIED':null,
    preview:{file_id:f.Final_File_ID||null,url:f.Final_File_URL||null,
      title:f.Output_Title||f.Final_File_Name||('Output '+(f.Output_ID||outputId)),output_number:f.Output_ID||null},
    as_of:new Date().toISOString(),flags};
}
