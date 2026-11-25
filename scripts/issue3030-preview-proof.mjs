// Exact-scope, temporary production proof. Never return media bytes or raw errors.
export const EXACT = Object.freeze({
  recLCL4QBOuOEJ1s4: 2669428,
  rec9eKU4Asdo2jyx3: 2357679,
  recdAAkJ6fRrNY9el: 2382870,
  recbetLNTbLcxWcMJ: 2072774,
  reclA5AWAy0UWCx6f: 2299565,
});
const MAX = 3500000;
const SOURCES = new Set(["cloudflare-r2-transient-cache","drive-photo-thumbnail","google-drive-media-asset"]);
export function imageEnvelope(bytes,type) {
  if (!(bytes instanceof Uint8Array) || bytes.length<24) return false;
  const b=bytes,d=new DataView(b.buffer,b.byteOffset,b.byteLength);
  const ascii=(start,end)=>String.fromCharCode(...b.subarray(start,end));
  if(type==="image/png"){
    if(![137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return false;
    if(d.getUint32(8)!==13||ascii(12,16)!=="IHDR"||!d.getUint32(16)||!d.getUint32(20))return false;
    let offset=8,hasData=false;
    while(offset+12<=b.length){
      const len=d.getUint32(offset),tag=ascii(offset+4,offset+8);
      if(len>b.length-offset-12)return false;
      if(tag==="IDAT"&&len>0)hasData=true;
      offset+=12+len;
      if(tag==="IEND")return len===0&&hasData&&offset===b.length;
    }
    return false;
  }
  if(type==="image/jpeg")return b[0]===255&&b[1]===216&&b[2]===255&&b.at(-2)===255&&b.at(-1)===217;
  if(type==="image/webp")return ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP"&&d.getUint32(4,true)+8===b.length&&["VP8 ","VP8L","VP8X"].includes(ascii(12,16));
  return false;
}
async function boundedBytes(res){
  if(!res.body)return null;
  const length=Number(res.headers.get("Content-Length")||0);
  if(length>MAX){await res.body.cancel();return null;}
  const reader=res.body.getReader(),chunks=[];
  let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX){await reader.cancel();return null;}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  if(length&&length!==size)return null;
  const result=new Uint8Array(size);
  let p=0;for(const chunk of chunks){result.set(chunk,p);p+=chunk.byteLength;}
  return result;
}
const json=data=>Response.json(data,{headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
export function createPreviewProofBridge({token,expires,reviewUser,expectedVersion}){
  const headers={"Cf-Access-Authenticated-User-Email":reviewUser,"Origin":"https://studio.chicagoshining.com"};
  return {async fetch(request,env){
    const u=new URL(request.url),parts=u.pathname.split("/");
    if(Date.now()>expires||request.method!=="GET"||parts.length!==4||parts[1]!==token||parts[2]!=="probe"||u.search||!(parts[3]==="health"||Object.hasOwn(EXACT,parts[3])))return new Response("Not found",{status:404});
    const id=parts[3];
    try{
      if(id==="health"){
        const r=await env.STUDIO_API.fetch(new Request("https://studio.chicagoshining.com/health",{headers}));
        const body=await r.json();
        return json({ok:r.status===200&&body.version===expectedVersion,status:r.status,version_matches:body.version===expectedVersion});
      }
      const res=await env.STUDIO_API.fetch(new Request("https://studio.chicagoshining.com/api/media-assets/"+id+"/preview",{headers:{...headers,Accept:"image/png,image/jpeg,image/webp"}}));
      const type=(res.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase();
      const rawSource=res.headers.get("X-Studio-Preview-Source")||"",source=SOURCES.has(rawSource)?rawSource:"unknown";
      const base={asset:id,status:res.status,source};
      if(res.status!==200||!["image/png","image/jpeg","image/webp"].includes(type)){
        try{await res.body?.cancel();}catch{}
        return json({...base,ok:false,reason:[401,403].includes(res.status)?"AUTH_REJECTED":res.status===200?"NOT_RASTER_IMAGE":"PREVIEW_HTTP_ERROR"});
      }
      const bytes=await boundedBytes(res);
      const envelope=Boolean(bytes&&imageEnvelope(bytes,type));
      const exactSize=source!=="google-drive-media-asset"||bytes?.length===EXACT[id];
      const privateCache=/\bprivate\b/i.test(res.headers.get("Cache-Control")||"");
      const ok=envelope&&exactSize&&privateCache&&source!=="unknown";
      return json({...base,ok,type,byte_count:bytes?.length||0,envelope_verified:envelope,original_size_verified:source==="google-drive-media-asset"?exactSize:null,private_cache:privateCache,reason:ok?"VERIFIED_IMAGE_ENVELOPE":!envelope?"INVALID_OR_OVERSIZED_IMAGE":!exactSize?"ORIGINAL_SIZE_MISMATCH":!privateCache?"UNSAFE_CACHE_POLICY":"UNKNOWN_SOURCE"});
    }catch{return json({asset:id,ok:false,status:0,reason:"SERVICE_BINDING_REQUEST_FAILED"});}
  }};
}
