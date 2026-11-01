import {watermarkVerificationSatisfied} from "./rendering-review-watermark-policy.mjs";
/** Read-only preflight for a creatively approved V2 waiting on Factory.
 * Never infer QA from a successful approval or a playable preview.
 * A gate verdict is advisory; POST handoff independently re-reads all evidence.
 */
const str=x=>String(x??'').trim();
const choice=x=>typeof x==='object'&&x!==null?str(x.name):str(x);
const blocked=(code,message)=>({status:'blocked',code,message});
export function classifyApprovedFactoryHandoff({session,held,attemptRecords}){
  if(session?.state!=='approved')return null;
  if(session.factory_handoff?.attempt_id===session.approved_attempt_id&&
     session.review_hold?.active===false)
    return {status:'transferred',code:'FACTORY_HANDOFF_COMPLETE',
      message:'V2 has returned to Factory for independent approval.'};
  if(session.review_hold?.active!==true||held!==true)
    return blocked('REVIEW_HOLD_NOT_VERIFIED',
      'The publication hold could not be verified. Factory transfer is disabled.');
  if(!session.approved_attempt_id||session.approved_attempt_id!==session.current_attempt_id)
    return blocked('APPROVED_ATTEMPT_DRIFT',
      'The accepted version no longer matches the current review attempt.');
  if(attemptRecords===null)
    return {status:'unavailable',code:'QA_READ_UNAVAILABLE',
      message:'The media QA record is temporarily unavailable. No handoff has been attempted.'};
  if(!Array.isArray(attemptRecords)||attemptRecords.length!==1)
    return blocked('QA_ATTEMPT_NOT_VERIFIED',
      'A unique authoritative media QA record could not be verified.');
  const f=attemptRecords[0]?.fields||{};
  const attempt=session.attempts?.find(a=>a.id===session.approved_attempt_id);
  if(!attempt||Number(attempt.number)<2||!str(attempt.artifact_id)||
     f.Attempt_ID!==attempt.id||f.Session_ID!==session.id||
     f.Output_Record_ID!==session.output_id||
     Number(f.Attempt_Number)!==Number(attempt.number)||
     choice(f.Attempt_Status)!=='ready_for_review'||
     f.Artifact_File_ID!==attempt.artifact_id||
     f.Artifact_URL!=='https://drive.google.com/file/d/'+attempt.artifact_id+'/view')
    return blocked('QA_ATTEMPT_MISMATCH',
      'The saved V2 media evidence does not match the approved version.');
  let evidence;
  try{evidence=JSON.parse(str(f.Validation_Evidence_JSON));}
  catch{return blocked('QA_EVIDENCE_MISSING',
    'The selected V2 has no readable independent media validation receipt.');}
  if(!watermarkVerificationSatisfied(attempt,evidence))
    return {status:'blocked',code:'WATERMARK_QA_REQUIRED',redo_allowed:true,
      message:'Watermark verification is pending for publishing readiness only. Your creative approval is saved, and you may request another video revision without this check. Factory release remains held.'};
  if(evidence.audio_verified!==true)
    return blocked('AUDIO_QA_REQUIRED',
      'Audio verification has not passed for this V2. Factory transfer remains on hold.');
  if(evidence.google_drive_verified!==true||evidence.google_drive_mime_type!=='video/mp4')
    return blocked('DRIVE_QA_REQUIRED',
      'The canonical Google Drive MP4 has not passed independent media verification.');
  if(!/^[a-f0-9]{64}$/.test(str(evidence.sha256))||
     !Number.isSafeInteger(evidence.byte_count)||evidence.byte_count<100000||
     evidence.mime_type!=='video/mp4'||evidence.width!==1080||evidence.height!==1920)
    return blocked('MEDIA_QA_REQUIRED',
      'The V2 validation receipt is missing required byte, hash, format, or dimension evidence.');
  return {status:'ready',code:'QA_PREFLIGHT_PASSED',
    message:'Saved V2 evidence meets the preliminary QA gate. Complete the guarded Factory transfer; no publishing approval will be granted.'};
}
