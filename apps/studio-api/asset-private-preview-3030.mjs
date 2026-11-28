// Exact private photo pilot: independent canonical identity and authenticated
// runner delivery. No raw Drive-ID endpoint or public media URL.
export const ISSUE3030_PROFILE="recpNlNn6U6eq0M9r";
export const ISSUE3030_PHOTOS=Object.freeze({
  recLCL4QBOuOEJ1s4:["1C_6XNcEvQugrSDqZUj0c5FYrctB29Qz7",2669428],
  rec9eKU4Asdo2jyx3:["1IM1_5lO-5clkGYNLHeO_9DEMwRHMSc5Z",2357679],
  recdAAkJ6fRrNY9el:["10htxPjKxCFYqbFlSORFb2vh1N72s1rjq",2382870],
  recbetLNTbLcxWcMJ:["1Iqax5ClaweTt6-vIk99ukw2hvR2CJPIZ",2072774],
  reclA5AWAy0UWCx6f:["1NCxVWT39iOle1nZFnlG1FPGBI-jiZmeF",2299565],
});
export const isIssue3030Photo=id=>Object.hasOwn(ISSUE3030_PHOTOS,id);
const MAX_THUMB=800000;
const fail=(status,reason)=>{const e=new Error(reason);e.status=status;throw e;};
export function eligibleIssue3030Photo(rows,id){
  if(!isIssue3030Photo(id)||!Array.isArray(rows)||rows.length!==1)return false;
  const row=rows[0], [file,size]=ISSUE3030_PHOTOS[id];
  return row?.airtable_record_id===id&&row.active===true&&row.do_not_use===false&&
    row.asset_status==="Available"&&row.media_class==="Image"&&row.mime_type==="image/png"&&
    row.google_drive_file_id===file&&row.file_size_bytes===size&&
    row.metadata?.content_profile_airtable_id===ISSUE3030_PROFILE&&
    String(row.metadata?.studio_transfer_id||"").startsWith("ITEM4-MASTER-");
}
async function boundedBody(response,expected){
  if(!response.body)return null;
  const reader=response.body.getReader(),bytes=new Uint8Array(expected);
  let n=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(value.byteLength>expected-n){await reader.cancel();return null;}
      bytes.set(value,n);n+=value.byteLength;
    }
  }finally{reader.releaseLock();}
  return n===expected?bytes:null;
}
export async function serveIssue3030Photo({request,env,assetId,authorizeProfile,readRows,fetchImpl=fetch}){
  if(!isIssue3030Photo(assetId))return null;
  if(!["GET","HEAD"].includes(request.method))fail(405,"ASSET_PREVIEW_READ_ONLY");
  if(typeof authorizeProfile!=="function"||typeof readRows!=="function")fail(503,"ASSET_PREVIEW_AUTHORITY_UNAVAILABLE");
  await authorizeProfile(ISSUE3030_PROFILE);
  if(!eligibleIssue3030Photo(await readRows(assetId),assetId))fail(409,"ASSET_PREVIEW_SOURCE_CHANGED");
  const base=String(env?.PIPELINE_RUNNER_URL||"").trim().replace(/\/+$/,"");
  const secret=String(env?.PIPELINE_RUNNER_SHARED_SECRET||"").trim();
  if(base!=="https://pipeline.chicagoshining.com"||secret.length<24)fail(503,"ASSET_PREVIEW_RUNNER_UNCONFIGURED");
  const [file,size]=ISSUE3030_PHOTOS[assetId];
  let response;
  try{
    response=await fetchImpl(base+"/jobs/assets/private-preview-source/"+encodeURIComponent(assetId),{
      method:"GET",redirect:"manual",headers:{"X-Pipeline-Secret":secret,Accept:"image/jpeg"},
      signal:AbortSignal.timeout(90000),
    });
  }catch{fail(503,"ASSET_PREVIEW_RUNNER_UNAVAILABLE");}
  if(response.status!==200){
    try{await response.body?.cancel();}catch{}
    if(response.status===429)fail(429,"ASSET_PREVIEW_RUNNER_BUSY");
    if(response.status===409)fail(409,"ASSET_PREVIEW_SOURCE_CHANGED");
    fail(503,"ASSET_PREVIEW_RUNNER_UNAVAILABLE");
  }
  const length=Number(response.headers.get("Content-Length")),digest=response.headers.get("X-Asset-Preview-Sha256")||"";
  if(response.headers.get("Content-Type")!=="image/jpeg"||
    response.headers.get("X-Asset-Preview-Record")!==assetId||
    response.headers.get("X-Asset-Preview-Source-Id")!==file||
    Number(response.headers.get("X-Asset-Preview-Source-Bytes"))!==size||
    !Number.isInteger(length)||length<24||length>MAX_THUMB||!/^[a-f0-9]{64}$/.test(digest)){
    try{await response.body?.cancel();}catch{}
    fail(502,"ASSET_PREVIEW_RUNNER_RECEIPT_INVALID");
  }
  const bytes=await boundedBody(response,length);
  if(!bytes||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)
    fail(502,"ASSET_PREVIEW_IMAGE_INVALID");
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");
  if(hash!==digest)fail(502,"ASSET_PREVIEW_HASH_MISMATCH");
  // Runner also revalidates after creating the derivative. Recheck current
  // authority before sending private bytes, even on a runner memory cache hit.
  if(!eligibleIssue3030Photo(await readRows(assetId),assetId))fail(409,"ASSET_PREVIEW_SOURCE_CHANGED");
  return new Response(request.method==="HEAD"?null:bytes,{status:200,headers:{
    "Content-Type":"image/jpeg","Content-Length":String(length),
    "Cache-Control":"private, max-age=300","X-Content-Type-Options":"nosniff",
    "X-Studio-Preview-Source":"runner-photo-thumbnail",
  }});
}
