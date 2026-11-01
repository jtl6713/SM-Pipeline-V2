/** Reopen an approved-but-still-held V2 for another creative revision.
 * No watermark/branding proof is read here: that is a delivery/QA concern.
 * Does not create a job, edit the selected media, release holds, or publish.
 */
import {applyReviewEvent,CHICAGO_PROFILE_ID} from './rendering-review-policy.mjs';
const rec=/^rec[A-Za-z0-9]{14}$/;
const token=/^[A-Za-z0-9_-]{8,120}$/;
const str=x=>String(x??'').trim();
const choice=x=>typeof x==='object'&&x!==null?str(x.name):str(x);
const fail=(code,message,status=409)=>{const e=new Error(message);e.code=code;e.status=status;throw e;};
const link=id=>'https://drive.google.com/file/d/'+id+'/view';
function requireAdapter(ops){
  for(const name of ['withOutputLock','readSession','readRawOutput','readNormalizedOutput',
     'readField','saveSessionIfVersion']){
    if(typeof ops?.[name]!=='function')fail('REDO_ADAPTER_MISSING',name+' required',503);
  }
}
function liveHeld(row,f,s,attempt){
  return row?.id===s.output_id&&
    f(row,'Studio_Render_Review_Hold_Active')===true&&
    str(f(row,'Studio_Render_Review_Hold_ID'))===s.review_hold.id&&
    str(f(row,'Studio_Render_Review_Hold_Owner'))===s.id&&
    str(f(row,'Studio_Render_Review_Session_ID'))===s.id&&
    f(row,'Do_Not_Publish')===true&&
    f(row,'Auto_Publish_Enabled')!==true&&
    str(f(row,'Final_File_ID'))===attempt.artifact_id&&
    str(f(row,'Final_File_URL'))===link(attempt.artifact_id)&&
    choice(f(row,'Render_Status'))==='Rendered'&&
    choice(f(row,'Output_Status'))==='Ready for Review'&&
    choice(f(row,'Review_Status'))==='Review Sent'&&
    choice(f(row,'Publish_Status'))==='Not Ready'&&
    ['Scheduled_Post_Date','Studio_Scheduled_At','YouTube_Scheduled_Publish_At',
     'Published_At','Publish_Started_At','Publish_Locked_At','Publish_Locked_By',
     'Platform_Post_ID','Platform_Post_URL','Platform_Media_ID',
     'Studio_Review_Hold_ID','Studio_Review_Hold_Owner'].every(k=>!str(f(row,k)));
}
async function fingerprint(value){
  const digest=await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function requestApprovedHeldCreativeRedo({
 output_id,note,client_request_id,expected_version,actor_id,operations,now=()=>new Date().toISOString()
}){
  if(!rec.test(str(output_id))||!rec.test(str(actor_id)))
    fail('REDO_SCOPE_DENIED','Exact authorized output and reviewer are required',403);
  if(!token.test(str(client_request_id))||typeof note!=='string'||!note.trim()||
     note.trim().length>3000||!Number.isSafeInteger(expected_version)||expected_version<1)
    fail('REDO_INVALID_INPUT','Exact version, request key and creative direction required',400);
  requireAdapter(operations);
  const o=operations;
  const key='rrheldredo_'+str(client_request_id);
  const hash='rrheldfp_'+await fingerprint([actor_id,output_id,note.trim()]);
  return o.withOutputLock(output_id,async()=>{
    const s=await o.readSession(output_id);
    if(!s||s.output_id!==output_id||s.profile_id!==CHICAGO_PROFILE_ID||
       s.output_type!=='Instagram Reel')
      fail('REDO_SESSION_DENIED','Exact Chicago review session required',403);
    const current=s.attempts?.find(a=>a.id===s.current_attempt_id);
    const output=await o.readNormalizedOutput(output_id);
    const row=await o.readRawOutput(output_id),f=o.readField;
    if(output?.id!==output_id||output.profile_id!==CHICAGO_PROFILE_ID||
       output.platform!=='Instagram'||output.output_type!=='Instagram Reel'||
       !current||Number(current.number)<2||current.status!=='ready_for_review'||
       !liveHeld(row,f,s,current))
      fail('REDO_OUTPUT_NOT_HELD','The selected video is not safely held for creative revision');
    // Saved request replay cannot authorize a new job or repeat the note.
    if(s.processed?.[key]){
      if(s.processed[key]!==hash||s.state!=='discussing'||
         s.review_hold?.active!==true)
        fail('REDO_REPLAY_CONFLICT','Saved request state changed; reload before retrying');
      return {ok:true,replay:true,redo_requested:true,review_hold_active:true,
        output_id,session_version:s.version,render_queued:false,
        publication_changed:false,public_post_created:false};
    }
    if(s.state!=='approved'||s.review_hold?.active!==true||
       s.current_attempt_id!==s.approved_attempt_id||s.active_job||
       s.version!==expected_version)
      fail('REDO_APPROVAL_CHANGED','The saved creative approval changed; refresh before retrying');
    const next=applyReviewEvent(s,{
      type:'REOPEN_APPROVED_HELD_REDO',expected_version:s.version,
      attempt_id:current.id,artifact_id:current.artifact_id,
      hold_id:s.review_hold.id,hold_owner:s.id,
      note:note.trim(),message_id:'rrheldredomsg_'+client_request_id,
      idempotency_key:key,fingerprint:hash,at:now()
    }).session;
    if(await o.saveSessionIfVersion({output_id,expected_version:s.version,next})!==true)
      fail('REDO_SAVE_CONFLICT','Review version changed before redo saved');
    const confirmed=await o.readSession(output_id);
    if(JSON.stringify(confirmed)!==JSON.stringify(next))
      fail('REDO_READBACK_UNVERIFIED','Redo request did not verify after save',503);
    const held=await o.readRawOutput(output_id);
    if(!liveHeld(held,f,next,current))
      fail('REDO_HOLD_READBACK_FAILED','The publication hold changed during redo request',503);
    return {ok:true,replay:false,redo_requested:true,review_hold_active:true,
      output_id,session_version:next.version,render_queued:false,
      publication_changed:false,public_post_created:false,
      message:'Creative redo requested. Continue with Producer; no render or publishing has started.'};
  });
}
