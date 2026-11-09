/**
 * Trusted Media Asset -> ElevenLabs reference bridge.
 * Airtable/Drive are authority. The browser sends only exact record IDs;
 * it cannot supply arbitrary file URLs, mime claims, or provider asset IDs.
 */
export const STORY_VIDEO_REFERENCE_MAX_BYTES = 12 * 1024 * 1024;
export const STORY_VIDEO_REFERENCE_TOTAL_MAX_BYTES = 36 * 1024 * 1024;
export const STORY_VIDEO_REF_MIMES = Object.freeze({
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/wav"],
});
const ID = /^rec[A-Za-z0-9]+$/;
const fail = (status, message) => Object.assign(new Error(message), {status});
const clean = v => String(v ?? "").trim();
const field = (record, key) => record?.fields?.[key];

export function normalizeStoryVideoReferences(references = {}) {
  if (!references || typeof references !== "object" || Array.isArray(references))
    throw fail(400, "Video references must be an object");
  const one = (key) => {
    const value = clean(references[key]);
    if (value && !ID.test(value)) throw fail(400, "Invalid " + key + " Media Asset ID");
    return value || null;
  };
  const rows = (key, limit) => {
    const list = references[key] ?? [];
    if (!Array.isArray(list) || list.length > limit) throw fail(400, "Too many " + key + " references for the pilot");
    return list.map(item => {
      const id = clean(typeof item === "string" ? item : item?.asset_id);
      if (!ID.test(id)) throw fail(400, "Invalid " + key + " Media Asset ID");
      return key === "images" ? {asset_id: id, role: clean(item?.role || "subject")} : {asset_id: id};
    });
  };
  const result = {start_frame: one("start_frame"), end_frame: one("end_frame"),
    images: rows("images",3), videos: rows("videos",2), audios: rows("audios",1)};
  if (result.end_frame && !result.start_frame)
    throw fail(400, "End frame requires a start frame");
  const frameMode = Boolean(result.start_frame || result.end_frame);
  const referenceMode = Boolean(result.images.length || result.videos.length || result.audios.length);
  if (frameMode && referenceMode)
    throw fail(400, "Use start/end frames OR free-form references, not both");
  const all = [result.start_frame, result.end_frame, ...result.images.map(x=>x.asset_id),
    ...result.videos.map(x=>x.asset_id), ...result.audios.map(x=>x.asset_id)].filter(Boolean);
  if (new Set(all).size !== all.length)
    throw fail(400, "Each reference Media Asset may only be used once");
  return result;
}

export function storyVideoReferenceManifest(refs) {
  const input = normalizeStoryVideoReferences(refs);
  return [
    ...(input.start_frame ? [{field:"start_frame",type:"image",asset_id:input.start_frame}] : []),
    ...(input.end_frame ? [{field:"end_frame",type:"image",asset_id:input.end_frame}] : []),
    ...input.images.map(x=>({field:"images",type:"image",asset_id:x.asset_id,role:x.role})),
    ...input.videos.map(x=>({field:"videos",type:"video",asset_id:x.asset_id})),
    ...input.audios.map(x=>({field:"audios",type:"audio",asset_id:x.asset_id})),
  ];
}

export function verifyStudioReferenceAsset(record, {asset_id, type}, profileId, {allowLicensed=false}={}) {
  if (record?.id !== asset_id || !ID.test(asset_id))
    throw fail(409, "Reference was not verified against its exact Media Asset");
  const owners = Array.isArray(field(record,"Content_Profile")) ? field(record,"Content_Profile") : [];
  if (!owners.includes(profileId))
    throw fail(403, "Reference media is not assigned to the selected profile");
  const rights = clean(field(record,"Rights_Status")).toLowerCase();
  const clearedForAi=rights==="owned"||rights==="public domain"||
    (allowLicensed&&["licensed","cleared"].includes(rights));
  if (!clearedForAi || field(record,"Do_Not_Use") === true || field(record,"Active") === false)
    throw fail(403, "Reference media is not cleared for third-party AI use");
  if (!["available","ready"].includes(clean(field(record,"Asset_Status")).toLowerCase()))
    throw fail(409, "Reference Media Asset is unavailable");
  const driveId = clean(field(record,"Google Drive File ID"));
  if (!driveId || !/^[a-zA-Z0-9_-]{10,160}$/.test(driveId))
    throw fail(409, "Reference source requires an authoritative Google Drive file ID");
  const mime = clean(field(record,"MIME_Type")).toLowerCase().split(";")[0];
  if (!STORY_VIDEO_REF_MIMES[type]?.includes(mime))
    throw fail(415, "Selected Media Asset is not a supported "+type+" file");
  const size = Number(field(record,"File_Size_Bytes") || 0);
  if (size > STORY_VIDEO_REFERENCE_MAX_BYTES)
    throw fail(413, "Reference exceeds the 12 MB per-file limit for the pilot");
  const duration=Number(field(record,"Duration_Seconds")||0);
  if ((type==="video"||type==="audio") && duration > 30)
    throw fail(400, "Reference clip exceeds the Seedance 30-second media reference limit");
  return {asset_id, type, mime, size, drive_id:driveId,
    filename: clean(field(record,"Asset Name")).replace(/[^a-zA-Z0-9 _.-]/g,"").slice(0,60) || asset_id};
}

/** No raw untrusted URLs: always use the verified Drive ID and service identity. */
export async function fetchStudioReferenceFromDrive(source, driveAccessToken, fetcher = fetch) {
  if (!clean(driveAccessToken)) throw fail(503, "Authorized Google Drive access is unavailable");
  const url = "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(source.drive_id) + "?alt=media&supportsAllDrives=true";
  const response = await fetcher(url, {
    headers: {Authorization:"Bearer "+driveAccessToken,Accept:source.mime},
    redirect:"error",
  });
  const mime = clean(response.headers.get("Content-Type")).toLowerCase().split(";")[0];
  if (!response.ok || ![source.mime,"application/octet-stream"].includes(mime)) {
    await response.body?.cancel().catch(()=>{});
    throw fail(502, "Verified reference could not be retrieved from Google Drive");
  }
  const length=Number(response.headers.get("Content-Length") || 0);
  if (length > STORY_VIDEO_REFERENCE_MAX_BYTES) {
    await response.body?.cancel().catch(()=>{});
    throw fail(413, "Reference source exceeds 12 MB");
  }
  const bytes=await response.arrayBuffer();
  if (bytes.byteLength < 80 || bytes.byteLength > STORY_VIDEO_REFERENCE_MAX_BYTES)
    throw fail(413, "Reference source is empty or exceeds 12 MB");
  return bytes;
}

/** Upload user-authorized Media Asset as an ElevenLabs workspace asset. */
export async function uploadStudioReferenceToEleven(env, source, bytes, fetcher=fetch) {
  const fileName = source.filename + ({image:".png",video:".mp4",audio:".mp3"}[source.type] || ".bin");
  const form = new FormData();
  form.set("name", fileName);
  form.set("asset",new Blob([bytes],{type:source.mime}),fileName);
  const response = await fetcher("https://api.elevenlabs.io/v1/assets", {
    method:"POST",headers:{"xi-api-key":clean(env.ELEVENLABS_API_KEY)},
    body:form,redirect:"error",
  });
  const result=await response.json().catch(()=>({}));
  if (!response.ok || !/^[A-Za-z0-9_-]{8,100}$/.test(clean(result.asset_id)))
    throw fail(502, "ElevenLabs reference upload failed; inspect job before retrying");
  if (clean(result.mime_type).toLowerCase() !== source.mime)
    throw fail(502, "ElevenLabs returned a mismatched reference MIME type");
  return {type:"asset",asset_id:result.asset_id};
}

export async function deleteStudioElevenReferenceAssets(env, ids, fetcher=fetch) {
  const unique=[...new Set((ids||[]).filter(v=>/^[A-Za-z0-9_-]{8,100}$/.test(clean(v))))];
  return Promise.allSettled(unique.map(id=>fetcher("https://api.elevenlabs.io/v1/assets/"+encodeURIComponent(id),{
    method:"DELETE", headers:{"xi-api-key":clean(env.ELEVENLABS_API_KEY)},redirect:"error",
  })));
}

export async function uploadStoryVideoReferences(env, refs, profileId, operations) {
  const manifest=storyVideoReferenceManifest(refs);
  if (!manifest.length) return {provider_references:{},provider_asset_ids:[]};
  const prepared=[];
  let total=0;
  // All sources must be verified before any external upload.
  for(const item of manifest){
    const record=await operations.loadAsset(item.asset_id);
    const source=verifyStudioReferenceAsset(record,item,profileId,{
      allowLicensed:String(env.STUDIO_ELEVENLABS_VIDEO_LICENSED_REFERENCES_VERIFIED||"").toLowerCase()==="true",
    });
    total+=source.size;
    if(total>STORY_VIDEO_REFERENCE_TOTAL_MAX_BYTES)
      throw fail(413,"Reference selection exceeds total 36 MB pilot budget");
    prepared.push({...item,source});
  }
  const token=await operations.driveToken();
  if(!token)throw fail(503,"Reference transfer requires authenticated Drive access");
  const result={}, assetIds=[];
  for(const item of prepared){
    const bytes=await fetchStudioReferenceFromDrive(item.source,token,operations.fetcher||fetch);
    const reference=await uploadStudioReferenceToEleven(env,item.source,bytes,operations.fetcher||fetch);
    assetIds.push(reference.asset_id);
    if(item.field==="images"){
      (result.images ||= []).push(item.role ? {image:reference,role:item.role}:reference);
    }else if(item.field==="videos" || item.field==="audios"){
      (result[item.field] ||= []).push(reference);
    }else result[item.field]=reference;
  }
  return {provider_references:result,provider_asset_ids:assetIds};
}
