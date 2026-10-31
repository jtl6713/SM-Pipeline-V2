/** Authenticated, Airtable-authoritative read API. Never enrolls on preview. */
import { RENDER_REVIEW_TABLES, RENDER_REVIEW_OUTPUT_FIELDS } from './rendering-review-airtable.mjs';
import { REVIEW_SCHEMA } from './rendering-review-policy.mjs';
import { reviewEnrollmentWriteEnabled } from './rendering-review-enrollment-http.mjs';
import { producerConversationWritesEnabled } from './rendering-review-producer-persist.mjs';
import { renderAttemptCommitEnabled } from './rendering-review-attempt-outbox.mjs';
import {reviewStillStoryboard} from './rendering-review-storyboard.mjs';

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
  // These capabilities come ONLY from the protected deployment environment.
  // No Airtable settings, request headers or UI toggles can activate them.
  const flags={
    admission_enabled:false, // Direct enrollment from Rendering Review is forbidden.
    producer_conversation_enabled:producerConversationWritesEnabled(env),
    attempt_commit_enabled:renderAttemptCommitEnabled(env),
    creative_approval_enabled:env?.RENDERING_REVIEW_CREATIVE_ACCEPT_ENABLED==="true"&&reviewEnrollmentWriteEnabled(env),
    automatic_sampling_percent:0,
    integration_verified:env?.RENDERING_REVIEW_INTEGRATION_VERIFIED==="true",
  };
  // Read-only discovery of any held, completed output for authenticated
  // profiles. The Content Item link, not any output lookup field, owns scope.
  // No automatic admission, render authorization or scheduling side effects.
  if(url.pathname==='/api/rendering-review/queue'){
    if(!scope.length)return {ok:true,queue:[],next_cursor:null,as_of:new Date().toISOString(),flags};
    const cursor=text(url.searchParams.get('cursor'));
    if(cursor&&(cursor.length>512||!/^[A-Za-z0-9._-]+$/.test(cursor)))
      fail(400,'Invalid Rendering Review cursor');
    // Only already-held Factory submissions are discoverable. No auto-admission.
    const page=await operations.listRecordsPage(env,env.AIRTABLE_OUTPUT_TABLE_ID,{
      limit:40,offset:cursor||null,
      filterFormula:'AND(OR({Final_File_ID}!="",{Final_File_URL}!=""),OR({Studio_Render_Review_Hold_Active}=TRUE(),{Studio_Render_Review_Hold_ID}!="",{Studio_Render_Review_Session_ID}!=""))',
      fields:['Content_Item','Platform','Platform_Output_Type','Render_Status',
        'Final_File_ID','Final_File_URL','Output_Title','Output_ID','Output_Status',
        'Publish_Status','Published_At','Platform_Post_ID','Platform_Post_URL',
        'Platform_Media_ID','Publish_Started_At',
        'Publish_Locked_At','Publish_Locked_By','Do_Not_Publish',
        RENDER_REVIEW_OUTPUT_FIELDS.hold_active,RENDER_REVIEW_OUTPUT_FIELDS.hold_id,
        RENDER_REVIEW_OUTPUT_FIELDS.hold_owner,RENDER_REVIEW_OUTPUT_FIELDS.session_id],
    });
    if(!page.valid||!Array.isArray(page.records)||page.records.length>40)
      fail(503,'Authoritative rendered queue unavailable');
    const records=[...page.records];
    // Select eligible Platform Output rows without trusting the display-only
    // Content_Profile lookup. Resolve their linked Content Items in ONE exact-ID
    // Airtable query instead of 40 serial subrequests per source page.
    const candidates=[];
    for(const row of records){
      const f=row?.fields||{};
      const links=f.Content_Item;
      if(!rec(row?.id)||!Array.isArray(links)||links.length!==1||!rec(links[0]))continue;
      if(!text(f.Platform)||!text(f.Platform_Output_Type))continue;
      if(!text(f.Final_File_ID)&&!text(f.Final_File_URL))continue;
      if(/^(published|publishing|dispatched)$/i.test(text(f.Publish_Status))||
         /^(published|publishing|dispatched)$/i.test(text(f.Output_Status))||
         f.Published_At||f.Platform_Post_ID||f.Platform_Post_URL||
         f.Platform_Media_ID||f.Publish_Locked_By)continue;
      candidates.push({row,contentId:links[0]});
    }
    const uniqueContentIds=[...new Set(candidates.map(item=>item.contentId))];
    let contentById=new Map();
    if(uniqueContentIds.length){
      const formula='OR('+uniqueContentIds.map(id=>'RECORD_ID()="'+id+'"').join(',')+')';
      const contentPage=await operations.listRecordsPage(env,'tblwzN9AXWvmKVKPs',{
        limit:uniqueContentIds.length,filterFormula:formula,fields:['Content_Profile'],
      });
      // An incomplete source read must not become an apparently verified
      // authorization decision. Missing/deleted links are individually skipped.
      if(!contentPage.valid||!Array.isArray(contentPage.records)||
         contentPage.records.length>uniqueContentIds.length||contentPage.offset)
        fail(503,'Authoritative Content Item batch read unavailable');
      const wanted=new Set(uniqueContentIds);
      for(const content of contentPage.records){
        if(!rec(content?.id)||!wanted.has(content.id)||contentById.has(content.id))
          fail(503,'Authoritative Content Item batch identity mismatch');
        contentById.set(content.id,content);
      }
    }
    const queue=[];
    for(const {row,contentId} of candidates){
      const content=contentById.get(contentId);
      if(!Array.isArray(content?.fields?.Content_Profile)||
         content.fields.Content_Profile.length!==1||
         !allowed.has(content.fields.Content_Profile[0])||
         (requested&&content.fields.Content_Profile[0]!==requested))continue;
      const f=row.fields;
      const held=f[RENDER_REVIEW_OUTPUT_FIELDS.hold_active]===true||
        [RENDER_REVIEW_OUTPUT_FIELDS.hold_id,RENDER_REVIEW_OUTPUT_FIELDS.hold_owner,
          RENDER_REVIEW_OUTPUT_FIELDS.session_id].some(key=>Boolean(text(f[key])));
      if(!held)continue; // Upstream readiness never initiates conversational review.
      queue.push({
        output_id:row.id,profile_id:content.fields.Content_Profile[0],
        platform:text(f.Platform),output_type:text(f.Platform_Output_Type),
        output_number:f.Output_ID||null,title:text(f.Output_Title)||('Output '+(f.Output_ID||row.id)),
        render_status:text(f.Render_Status),final_file_id:text(f.Final_File_ID)||null,
        final_file_url:text(f.Final_File_URL)||null,
        review_held:held,dispatch_started:Boolean(f.Publish_Started_At||f.Publish_Locked_At||f.Publish_Locked_By),
        manual_admission_enabled:false,
      });
    }
    return {ok:true,queue,next_cursor:page.offset||null,as_of:new Date().toISOString(),flags};
  }
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
  const links=f.Content_Item;
  if(!Array.isArray(links)||links.length!==1||!rec(links[0]))
    fail(409,'Review output has ambiguous content identity');
  const content=await operations.airtableFetch(env,'tblwzN9AXWvmKVKPs',links[0]);
  const linkedProfiles=content?.fields?.Content_Profile;
  if(content?.id!==links[0]||!Array.isArray(linkedProfiles)||linkedProfiles.length!==1||
    linkedProfiles[0]!==session.profile_id||!scope.includes(linkedProfiles[0]))
    fail(403,'Authoritative output profile does not match this review workspace');
  const held=f[RENDER_REVIEW_OUTPUT_FIELDS.hold_active]===true&&
    f[RENDER_REVIEW_OUTPUT_FIELDS.hold_id]===session.review_hold.id&&
    f[RENDER_REVIEW_OUTPUT_FIELDS.hold_owner]===session.id&&
    f[RENDER_REVIEW_OUTPUT_FIELDS.session_id]===session.id;
  let storyboard=[];
  if(held&&session.producer_candidate?.candidate){
    const requestId=content?.fields?.Production_Request;
    if(Array.isArray(requestId)&&requestId.length===1&&rec(requestId[0])){
      // Read-only exact source inventory and verified original media metadata;
      // no preview URL can originate from user or AI-supplied text.
      const request=await operations.airtableFetch(env,'tbl75nxNi6PMUjBQE',requestId[0]);
      let assets,props;
      try{assets=JSON.parse(request?.fields?.Studio_Master_Assets_JSON||"null");
        props=JSON.parse(f.Remotion_Props_JSON||"null");}catch{}
      if(request?.id===requestId[0]&&Array.isArray(assets)&&assets.length<=80&&
         Array.isArray(props?.clips)&&props.clips.length<=80){
        const ids=[...new Set(assets.map(a=>a?.media_asset_record_id).filter(rec))];
        if(ids.length&&ids.length<=80){
          const media=await operations.listRecords(env,env.AIRTABLE_MEDIA_TABLE_ID,{
            limit:ids.length,filterFormula:'OR('+ids.map(id=>'RECORD_ID()="'+id+'"').join(',')+')',
            fields:['Asset Name','Media_Class','Asset_Status','Rights_Status','Active',
              'Do_Not_Use','Content_Profile','Google Drive File ID','Time_Of_Day'],
          });
          storyboard=reviewStillStoryboard({output,request,media,session});
        }
      }
    }
  }
  return {ok:true,...summary(row),session,storyboard,
    publication_hold_verified:held,
    integrity_error:session.review_hold.active&&!held?'HOLD_NOT_VERIFIED':null,
    preview:{file_id:f.Final_File_ID||null,url:f.Final_File_URL||null,
      title:f.Output_Title||f.Final_File_Name||('Output '+(f.Output_ID||outputId)),output_number:f.Output_ID||null},
    as_of:new Date().toISOString(),flags};
}
