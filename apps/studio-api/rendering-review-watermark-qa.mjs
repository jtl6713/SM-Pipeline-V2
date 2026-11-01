/**
 * A human watermark review is independently recorded and bound to the exact
 * byte-verified V2. It never changes the original automatic QA evidence.
 */
const rec=/^rec[A-Za-z0-9]{14}$/;
const sha=/^[a-f0-9]{64}$/;
const str=x=>String(x??"").trim();

export function watermarkReviewReceipt(evidence,session,attempt){
  if(evidence?.watermark_verified===true)
    return {method:"automatic",sha256:str(evidence.sha256)};
  const w=session?.factory_watermark_qa;
  if(w?.status!=="confirmed"||w?.method!=="explicit_human_visual_review"||
     w?.confirmed_visible!==true||!rec.test(str(w.reviewer_id))||
     !Number.isFinite(Date.parse(str(w.at)))||
     w.attempt_id!==attempt?.id||w.artifact_id!==attempt?.artifact_id||
     !sha.test(str(evidence?.sha256))||w.sha256!==evidence.sha256)
    return null;
  if(session?.state!=="approved"||
     session.current_attempt_id!==attempt.id||
     session.approved_attempt_id!==attempt.id)
    return null;
  return {method:"human",sha256:w.sha256,
    reviewer_id:w.reviewer_id,reviewed_at:w.at};
}

export function exactReviewMediaEvidence(evidence){
  return Boolean(evidence&&sha.test(str(evidence.sha256))&&
    Number.isSafeInteger(evidence.byte_count)&&evidence.byte_count>=100000&&
    evidence.mime_type==="video/mp4"&&evidence.width===1080&&
    evidence.height===1920&&evidence.audio_verified===true&&
    evidence.google_drive_verified===true&&
    evidence.google_drive_mime_type==="video/mp4");
}
