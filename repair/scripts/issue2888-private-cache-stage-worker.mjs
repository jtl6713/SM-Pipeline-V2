// Temporary write-only bridge; no arbitrary key, media read, or identity override.
const TOKEN=__TOKEN__;
const EXPIRES=__EXPIRES__;
const specs=new Map([
  ["1aWyb-OkXhJ9GwWkg3VWruTaivdms6pTL",{sha:"cde325819144408f3341c23287637f9ab19aed9cd62c69332d91e49dd8d04875",size:2194946}],
  ["1KMygA91kqVv2InOcAQbCoy5IvQDjkfgH",{sha:"a93676f4b1cfa53e22c7cf3b677ceb2136f1366acd74de7f7a80d890d0972d67",size:895259}],
  ["1DlqSVCwMkzUVJ4bFLJDrvals8Bal3imj",{sha:"f1e5986c31a6032334cd47a1ad6a4555085cdaa0fa3c79b614c915d1ce91af93",size:17892121}],
]);
const reply=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const valid=(obj,id,s)=>obj?.size===s.size&&obj.customMetadata?.role==="issue2618-verified-private-review"&&obj.customMetadata?.sourceDriveFileId===id&&obj.customMetadata?.sha256===s.sha;
export default {
  async fetch(req,env) {
    try{
      const u=new URL(req.url),parts=u.pathname.split("/");
      if(Date.now()>EXPIRES||req.method!=="PUT"||req.headers.get("Authorization")!=="Bearer "+TOKEN||parts.length!==3||parts[1]!=="stage"||!specs.has(parts[2])||u.search)
        return reply({ok:false},404);
      const id=parts[2],s=specs.get(id),key="studio/review-previews/issue2618/sha256-"+s.sha+".mp4";
      if(req.headers.get("Content-Type")!=="video/mp4"||Number(req.headers.get("Content-Length"))!==s.size)return reply({ok:false},400);
      const bytes=await req.arrayBuffer();
      if(bytes.byteLength!==s.size)return reply({ok:false},400);
      const sha=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
      if(sha!==s.sha)return reply({ok:false},422);
      const old=await env.PRIVATE_MEDIA.head(key);
      if(old)return valid(old,id,s)?reply({ok:true,sha256:sha,bytes:s.size,existing:true}):reply({ok:false},409);
      await env.PRIVATE_MEDIA.put(key,bytes,{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"video/mp4",cacheControl:"private, no-store"},customMetadata:{role:"issue2618-verified-private-review",sourceDriveFileId:id,sha256:sha}});
      const confirmed=await env.PRIVATE_MEDIA.head(key);
      if(!valid(confirmed,id,s))return reply({ok:false},503);
      return reply({ok:true,sha256:sha,bytes:s.size,existing:false});
    }catch{return reply({ok:false},503);}
  }
};
