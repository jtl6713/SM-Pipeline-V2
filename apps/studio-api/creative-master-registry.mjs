/** Dynamic, content-owned creative master. Never authorizes publication or rewrites sibling assets. */
const rec=/^rec[A-Za-z0-9]{14}$/;
const file=/^[A-Za-z0-9_-]{20,}$/;
const sha=/^[a-f0-9]{64}$/;
const norm=x=>String(typeof x==="object"&&x!==null?x.name??"":x??"").trim().toLowerCase().replace(/\s+/g," ");
const id=x=>Array.isArray(x)&&x.length===1?String(x[0]?.id||x[0]||""):null;
const fail=(code)=>{const e=new Error(code);e.code=code;e.status=409;throw e;};
export const MASTER_FIELD="Studio_Creative_Masters_JSON";
export const MASTER_SCHEMA="studio.creative-masters.1";
export const CREATIVE_MASTER_SIBLING_READ_FIELDS=Object.freeze([
  "Content_Item","Platform","Platform_Output_Type","Output_ID",
  "Format","Aspect_Ratio","Publish_Status","Published_At",
  "Platform_Post_ID","Platform_Post_URL","Publish_Started_At",
  "Publish_Locked_At","Publish_Locked_By","Scheduled_Post_Date",
  "Studio_Scheduled_At","YouTube_Scheduled_Publish_At",
  "Studio_Render_Review_Hold_Active","Studio_Render_Review_Hold_ID",
  "Studio_Review_Hold_ID","Do_Not_Publish",
  "Output_Filename","Final_File_Name",
]);

export function creativeMasterKey(format,aspectRatio){
  const f=norm(format),a=norm(aspectRatio).replace(/\s/g,"");
  if(!f||!a||f==="unknown"||a==="unknown"||!/^(?:\d+:\d+)$/.test(a))return "";
  return f+"|"+a;
}
/**
 * A video Content Item can share an *identical* 9:16 MP4 with a video Story
 * even though Airtable names Story as a different Format. Aspect ratio alone
 * is not enough: require a video content family AND an actual MP4 output.
 * Other formats (including still-image Stories) retain exact-key isolation.
 */
export function videoMasterTargetCompatible({masterFormat,masterAspectRatio,
  contentType,targetFormat,targetAspectRatio,targetFileName}){
  const masterKey=creativeMasterKey(masterFormat,masterAspectRatio);
  const targetKey=creativeMasterKey(targetFormat,targetAspectRatio);
  if(!masterKey||!targetKey)return false;
  if(masterKey===targetKey)return true;
  return norm(contentType)==="vertical short video" &&
    norm(masterFormat)==="vertical short video" &&
    norm(targetFormat)==="story" &&
    masterKey.split("|")[1]===targetKey.split("|")[1] &&
    String(targetFileName||"").trim().toLowerCase().endsWith(".mp4");
}

/** Resolve only a uniquely compatible, already-approved creative master. */
export function resolveCreativeMasterForOutput({content,output}){
  const registry=readCreativeMasterRegistry(content?.fields?.[MASTER_FIELD]);
  const f=output?.fields||{},hits=Object.values(registry.masters).filter(master=>
    videoMasterTargetCompatible({
      masterFormat:master?.format,masterAspectRatio:master?.aspect_ratio,
      contentType:content?.fields?.Content_Type,
      targetFormat:f.Format,targetAspectRatio:f.Aspect_Ratio,
      targetFileName:f.Output_Filename||f.Final_File_Name,
    }));
  if(hits.length>1)fail("CREATIVE_MASTER_AMBIGUOUS_COMPATIBLE_VIDEO");
  return hits[0]||null;
}
export function readCreativeMasterRegistry(raw){
  if(!raw)return {schema:MASTER_SCHEMA,masters:{}};
  let parsed;
  try{parsed=JSON.parse(raw)}catch{fail("CREATIVE_MASTER_REGISTRY_MALFORMED")}
  if(parsed?.schema!==MASTER_SCHEMA||!parsed.masters||
    typeof parsed.masters!=="object"||Array.isArray(parsed.masters))
    fail("CREATIVE_MASTER_REGISTRY_INVALID");
  return parsed;
}
function outputFields(output){return output?.fields||{};}
export function projectCreativeMasterGroup({source,content,outputs,requireComplete=true}){
  const cf=content?.fields||{},sf=outputFields(source),contentId=content?.id;
  if(!rec.test(contentId||"")||!rec.test(source?.id||"")||
    id(sf.Content_Item)!==contentId)fail("CREATIVE_MASTER_CONTENT_OWNER_UNVERIFIED");
  const key=creativeMasterKey(sf.Format,sf.Aspect_Ratio);
  if(!key)fail("CREATIVE_MASTER_SOURCE_FORMAT_UNVERIFIED");
  if(!norm(cf.Content_Type))fail("CREATIVE_MASTER_CONTENT_TYPE_UNVERIFIED");
  const expected=(cf["Platform Outputs"]||[]).map(x=>String(x?.id||x));
  if(!Array.isArray(cf["Platform Outputs"])||
    expected.some(x=>!rec.test(x))||new Set(expected).size!==expected.length)
    fail("CREATIVE_MASTER_CONTENT_LINKS_INVALID");
  const rows=Array.isArray(outputs)?outputs:[];
  const seen=new Set(rows.map(x=>x?.id));
  if(requireComplete&&(seen.size!==expected.length||
    expected.some(x=>!seen.has(x))))fail("CREATIVE_MASTER_MEMBERS_INCOMPLETE");
  const matches=[];
  for(const output of rows){
    if(!rec.test(output?.id||"")||!expected.includes(output.id)||
      id(outputFields(output).Content_Item)!==contentId)
      fail("CREATIVE_MASTER_MEMBER_CONTENT_MISMATCH");
    const f=outputFields(output);
    if(!videoMasterTargetCompatible({
      masterFormat:sf.Format,masterAspectRatio:sf.Aspect_Ratio,
      contentType:cf.Content_Type,targetFormat:f.Format,
      targetAspectRatio:f.Aspect_Ratio,
      targetFileName:f.Output_Filename||f.Final_File_Name,
    }))continue;
    const choice=x=>typeof x==="object"&&x!==null?x.name||"":x||"";
    const dispatched=["Published_At","Platform_Post_ID","Platform_Post_URL",
      "Publish_Started_At","Publish_Locked_At","Publish_Locked_By"].some(k=>Boolean(f[k]));
    const scheduled=["Scheduled_Post_Date","Studio_Scheduled_At","YouTube_Scheduled_Publish_At"].some(k=>Boolean(f[k]));
    const held=f.Studio_Render_Review_Hold_Active===true||Boolean(f.Studio_Render_Review_Hold_ID)||
      Boolean(f.Studio_Review_Hold_ID)||f.Do_Not_Publish===true;
    matches.push({output_id:output.id,platform:choice(f.Platform),
      output_type:choice(f.Platform_Output_Type),
      output_number:f.Output_ID??null,
      publish_status:choice(f.Publish_Status),
      creative_associated:true,
      handoff:"link_only",
      delivery_unchanged:true,
      scheduled,dispatched,held});
  }
  if(!matches.some(x=>x.output_id===source.id))fail("CREATIVE_MASTER_SOURCE_NOT_MATCHED");
  const registry=readCreativeMasterRegistry(cf[MASTER_FIELD]);
  const master=registry.masters[key]||null;
  if(master&&(master.key!==key||master.content_item_id!==contentId||
    !rec.test(master.source_output_id||"")||!file.test(master.file_id||"")))
    fail("CREATIVE_MASTER_BINDING_UNVERIFIED");
  return {key,content_item_id:contentId,content_type:choiceValue(cf.Content_Type),
    format:choiceValue(sf.Format),aspect_ratio:choiceValue(sf.Aspect_Ratio),
    source_output_id:source.id,master:master?{
      version:master.version,source_output_id:master.source_output_id,
      approved_attempt_id:master.approved_attempt_id,file_id:master.file_id,
      approved_at:master.approved_at,qa_verified:true
    }:null,linked_count:matches.length,outputs:matches};
}
const choiceValue=x=>typeof x==="object"&&x!==null?String(x.name||""):String(x||"");

export function nextApprovedCreativeMaster({source,content,attempt,session,evidence,at}){
  const group=projectCreativeMasterGroup({source,content,
    outputs:[source],requireComplete:false});
  const key=group.key;
  if(session?.state!=="approved"||session.output_id!==source.id||
    session.current_attempt_id!==session.approved_attempt_id||
    session.current_attempt_id!==attempt?.id)
    fail("CREATIVE_MASTER_SOURCE_NOT_APPROVED");
  const held=session.review_hold?.active===true;
  const transferred=session.review_hold?.active===false&&
    session.factory_handoff?.status==="ready_for_factory_approval"&&
    session.factory_handoff.attempt_id===attempt?.id&&
    session.factory_handoff.artifact_id===attempt?.artifact_id;
  if(!held&&!transferred)fail("CREATIVE_MASTER_HOLD_OR_HANDOFF_UNVERIFIED");
  if(attempt.status!=="ready_for_review"||!file.test(attempt.artifact_id||"")||
    !sha.test(evidence?.sha256||"")||evidence?.audio_verified!==true||
    evidence?.watermark_verified!==true||evidence?.google_drive_verified!==true||
    evidence?.google_drive_mime_type!=="video/mp4"||
    evidence?.mime_type!=="video/mp4"||
    !Number.isSafeInteger(evidence?.byte_count)||evidence.byte_count<100000)
    fail("CREATIVE_MASTER_ARTIFACT_NOT_INDEPENDENTLY_VALIDATED");
  const registry=readCreativeMasterRegistry(content.fields[MASTER_FIELD]);
  const old=registry.masters[key];
  // A completed handoff can replay only its already-persisted master.
  // Never create/supersede a master after the output hold was released.
  if(!held&&!old)fail("CREATIVE_MASTER_REPLAY_MISSING");
  if(old&&(old.source_output_id!==source.id||
    old.content_item_id!==content.id))fail("CREATIVE_MASTER_COMPETING_SOURCE");
  if(old?.approved_attempt_id===attempt.id){
    if(old.file_id!==attempt.artifact_id||old.sha256!==evidence.sha256)
      fail("CREATIVE_MASTER_REPLAY_ARTIFACT_MISMATCH");
    return {registry,master:old,changed:false};
  }
  const master={key,content_item_id:content.id,content_type:group.content_type,
    format:group.format,aspect_ratio:group.aspect_ratio,
    source_output_id:source.id,session_id:session.id,
    approved_attempt_id:attempt.id,file_id:attempt.artifact_id,
    sha256:evidence.sha256,version:(old?.version||0)+1,
    approved_at:at,rights:"source_session_verified",
    creative_only:true,publishing_authorized:false,
    platform_media_replaced:false};
  const next={schema:MASTER_SCHEMA,masters:{...registry.masters,[key]:master}};
  if(JSON.stringify(next).length>55000)fail("CREATIVE_MASTER_REGISTRY_TOO_LARGE");
  return {registry:next,master,changed:true};
}
