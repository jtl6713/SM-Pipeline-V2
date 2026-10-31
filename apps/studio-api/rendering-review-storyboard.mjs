/** Read-only visual storyboard for the exact held per-profile output.
 * Original frames and preview URLs must match the approved 9:16 production
 * manifest. An AI suggestion never becomes a video or a render receipt.
 */
const rec=x=>/^rec[A-Za-z0-9]{14}$/.test(String(x||""));
const parse=x=>{try{return typeof x==="string"?JSON.parse(x):x;}catch{return null;}};
const img=x=>{try{const u=new URL(x);return u.protocol==="https:"&&
  u.hostname==="media.chicagoshining.com"&&
  u.pathname.startsWith("/studio/previews/item4/");}catch{return false;}};
export function reviewStillStoryboard({output,request,media=[],session}={}){
  const f=output?.fields||{},q=request?.fields||{};
  const props=parse(f.Remotion_Props_JSON),master=parse(q.Studio_Master_Assets_JSON),
    variants=parse(q.Studio_Variant_Manifest_JSON);
  // This storyboard is informational, but must not leak another profile's
  // source images. Trust the authoritative stored session and output identity,
  // not a creative candidate's requested media ID.
  const owner=String(session?.profile_id||"");
  if(!rec(owner)||!rec(output?.id)||session?.output_id!==output.id||
     !String(session?.platform||"").trim()||
     !String(session?.output_type||"").trim()||
     String(f.Platform||"")!==session.platform||
     String(f.Platform_Output_Type||"")!==session.output_type)return [];
  if(!props||props.compositionId!=="ChicagoShiningPhotoSequence"||
     !Number.isFinite(props.fps)||props.fps<=0||props.fps>120||
     !Array.isArray(props.clips)||props.clips.length<1||props.clips.length>80||
     !Array.isArray(master)||!variants?.complete||
     variants.production_request_record_id!==request?.id||
     !Array.isArray(variants.assets))return [];
  const byMedia=new Map(),byId=new Map(),liveMedia=new Map();
  for(const a of master){
    if(!a||typeof a.id!=="string"||!rec(a.media_asset_record_id)||
       byMedia.has(a.media_asset_record_id)||byId.has(a.id))return [];
    byMedia.set(a.media_asset_record_id,a);byId.set(a.id,a);
  }
  for(const row of media){
    if(rec(row?.id)&&!liveMedia.has(row.id))liveMedia.set(row.id,row.fields||{});
  }
  const originals=[];
  for(const clip of [...props.clips].sort((a,b)=>a.startFrame-b.startFrame)){
    const entry=byMedia.get(clip?.mediaAssetRecordId);
    if(!entry||!Number.isInteger(clip.startFrame)||!Number.isInteger(clip.durationFrames)||
       clip.durationFrames<=0)return [];
    const m=liveMedia.get(entry.media_asset_record_id);
    const approved=variants.assets.find(a=>a?.id===entry.id&&
      a.media_asset_record_id===entry.media_asset_record_id&&
      a.google_drive_file_id===entry.google_drive_file_id)?.variants?.["9:16"];
    const url=String(approved?.preview_url||"");
    if(!m||m.Media_Class!=="Image"||m.Asset_Status!=="Available"||
       m.Rights_Status!=="Owned"||m.Active!==true||m.Do_Not_Use===true||
       !Array.isArray(m.Content_Profile)||m.Content_Profile.length!==1||
       m.Content_Profile[0]!==owner||
       m["Google Drive File ID"]!==entry.google_drive_file_id||
       approved.preview_status!=="Ready"||
       approved.google_drive_file_id!==clip.googleDriveFileId||
       !img(url)||url!==clip.url||url!==clip.src)return [];
    originals.push({id:entry.id,name:String(entry.name||m["Asset Name"]||"Original still").slice(0,160),
      url,time_of_day:String(m.Time_Of_Day||"Unknown").slice(0,40),
      start_seconds:Number((clip.startFrame/props.fps).toFixed(3)),
      end_seconds:Number(((clip.startFrame+clip.durationFrames)/props.fps).toFixed(3))});
  }
  const scenes=session?.producer_candidate?.stale===false?
    session?.producer_candidate?.candidate?.timeline:null;
  const aligned=Array.isArray(scenes)&&scenes.length===originals.length&&scenes.every((s,i)=>
    s&&Array.isArray(s.asset_ids)&&s.asset_ids.length===1&&byId.has(s.asset_ids[0])&&
    Number.isFinite(s.start_seconds)&&Number.isFinite(s.end_seconds)&&
    Math.abs(s.start_seconds-originals[i].start_seconds)<.007&&
    Math.abs(s.end_seconds-originals[i].end_seconds)<.007);
  return originals.map((o,i)=>{
    const wanted=aligned?scenes[i].asset_ids[0]:o.id;
    const target=aligned?originals.find(s=>s.id===wanted):null;
    // Original source clips are the only storyboard photos; a wider-library
    // candidate has no verified 9:16 image and can never be shown as approved.
    return {scene:i+1,start_seconds:o.start_seconds,end_seconds:o.end_seconds,
      original:{name:o.name,time_of_day:o.time_of_day,preview_url:o.url},
      proposed:target?{name:target.name,time_of_day:target.time_of_day,
        preview_url:target.url}:null,
      changed:aligned&&wanted!==o.id,
      proposed_ready:aligned,video_rendered:false};
  });
}
