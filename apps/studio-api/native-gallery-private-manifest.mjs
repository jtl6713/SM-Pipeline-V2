/** Private Worker-only source manifest from the authenticated Pipeline Runner.
 * Never render result.original_artifacts to Studio clients. This data may
 * enter only the canonical Airtable job plan under the existing output lock.
 */
const REC=/^rec[A-Za-z0-9]{14}$/;
const FILE=/^[A-Za-z0-9_-]{20,}$/;
const SHA=/^[a-f0-9]{64}$/;
const RATIO=new Set(["4:5","1:1","9:16","16:9"]);
const fail=(code,status=503)=>{throw Object.assign(new Error(code),{code,status});};
const digest=async raw=>[...new Uint8Array(await crypto.subtle.digest(
 "SHA-256",new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,"0")).join("");
function canonical(value){
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(
  k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
 return JSON.stringify(value);
}
export async function readNativeGalleryPrivateManifest({
 env,output_id,profile_id,content_item_id,aspect_ratio,
 runnerFetch=fetch,
}={}){
 if(env?.NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED!=="true")
   fail("NATIVE_GALLERY_PRIVATE_MANIFEST_DISABLED",405);
 if(!REC.test(String(output_id||""))||
    !REC.test(String(profile_id||""))||
    !REC.test(String(content_item_id||""))||
    !RATIO.has(aspect_ratio))fail("NATIVE_GALLERY_PRIVATE_IDENTITY_INVALID",400);
 const rawBase=String(env?.PIPELINE_RUNNER_URL||"").trim().replace(/\/+$/,"");
 const secret=String(env?.PIPELINE_RUNNER_SHARED_SECRET||"").trim();
 let base;
 try{base=new URL(rawBase);}catch{fail("NATIVE_GALLERY_RUNNER_CONFIG_INVALID");}
 if(base.protocol!=="https:"||base.username||base.password||
    base.search||base.hash||secret.length<24)
   fail("NATIVE_GALLERY_RUNNER_CONFIG_INVALID");
 let reply;
 try{
  reply=await runnerFetch(rawBase+"/jobs/native-gallery/private-source-manifest",{
    method:"POST",headers:{"Content-Type":"application/json",
      "X-Pipeline-Secret":secret},
    body:JSON.stringify({output_id,expected_profile_id:profile_id}),
    signal:AbortSignal.timeout(120000),
  });
 }catch{fail("NATIVE_GALLERY_PRIVATE_SOURCE_UNAVAILABLE");}
 let data;
 try{
  const raw=await reply.text();
  if(raw.length>50000)fail("NATIVE_GALLERY_PRIVATE_SOURCE_OVERSIZED");
  data=JSON.parse(raw);
 }catch{fail("NATIVE_GALLERY_PRIVATE_SOURCE_UNREADABLE");}
 if(!reply.ok)fail("NATIVE_GALLERY_PRIVATE_SOURCE_DENIED",409);
 const images=data?.original_artifacts;
 if(data?.ok!==true||data.output_id!==output_id||
    data.profile_id!==profile_id||data.content_item_id!==content_item_id||
    data.aspect_ratio!==aspect_ratio||
    data.sources_byte_verified!==true||
    data.source_rights_verified!==true||
    data.shared_watermark_asset_verified!==true||
    data.original_artifact_watermark_verified!==true||
    data.publication_authorized!==false||data.can_generate!==false||
    !Array.isArray(images)||images.length<1||images.length>20||
    data.slide_count!==images.length||
    !SHA.test(String(data.original_manifest_sha256||"")))
   fail("NATIVE_GALLERY_PRIVATE_MANIFEST_UNVERIFIED");
 const slots=new Set(),files=new Set();
 for(let i=0;i<images.length;i++){
  const row=images[i];
  if(!row||typeof row!=="object"||Array.isArray(row)||
     !REC.test(String(row.slot_id||""))||slots.has(row.slot_id)||
     row.order!==i+1||
     !FILE.test(String(row.drive_file_id||""))||files.has(row.drive_file_id)||
     !REC.test(String(row.source_media_asset_id||""))||
     row.output_id!==output_id||row.content_item_id!==content_item_id||
     row.profile_id!==profile_id||
     row.watermark_verified!==true||row.rights_verified!==true||
     row.airtable_identity_verified!==true||
     !SHA.test(String(row.sha256||""))||
     !Number.isSafeInteger(row.width)||row.width<128||row.width>12000||
     !Number.isSafeInteger(row.height)||row.height<128||row.height>12000||
     !Number.isSafeInteger(row.byte_count)||row.byte_count<1024||
     !["image/png","image/jpeg","image/webp"].includes(row.mime_type))
    fail("NATIVE_GALLERY_PRIVATE_SLIDE_UNVERIFIED");
  const [a,b]=aspect_ratio.split(":").map(Number);
  if(Math.abs(row.width/row.height-a/b)>.015)
    fail("NATIVE_GALLERY_PRIVATE_RATIO_MISMATCH");
  slots.add(row.slot_id);files.add(row.drive_file_id);
 }
 if(await digest(canonical(images))!==data.original_manifest_sha256)
   fail("NATIVE_GALLERY_PRIVATE_SOURCE_HASH_MISMATCH");
 return {output_id,profile_id,content_item_id,aspect_ratio,
   sources_byte_verified:true,source_rights_verified:true,
   shared_watermark_asset_verified:true,
   original_artifact_watermark_verified:true,
   original_manifest_sha256:data.original_manifest_sha256,
   original_artifacts:images,publication_authorized:false};
}
