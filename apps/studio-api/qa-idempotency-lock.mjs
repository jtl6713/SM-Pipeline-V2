// QA-only cross-isolate idempotency lease in the Studio R2 bucket.
// A single successful conditional R2 put wins; replays read the canonical Airtable event.
const PREFIX = "studio/state/qa-idempotency-locks/v1/";
function deny(status,message){const e=new Error(message);e.status=status;return e;}
async function hashKey(key){
  const raw=new TextEncoder().encode(key);
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",raw));
  return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function withQaIdempotencyLock(bucket,key,action,{clock=()=>Date.now()}={}){
  if(!bucket?.get||!bucket?.put||typeof action!=="function") throw deny(503,"QA serialized ledger unavailable");
  if(typeof key!=="string"||key.length>160||key.length<12||!/^[A-Za-z0-9:._-]+$/.test(key))
    throw deny(400,"Invalid QA idempotency identity");
  const path=PREFIX+await hashKey(key)+".json",owner=crypto.randomUUID();
  for(let attempt=0;attempt<5;attempt++){
    const old=await bucket.get(path),previous=old?JSON.parse(await old.text()):null;
    if(previous?.owner && Number(previous.expiresAt)>clock())
      throw deny(409,"QA write already in progress; retry with the same request ID after checking history");
    const put=await bucket.put(path,JSON.stringify({owner,expiresAt:clock()+60000}),{
      onlyIf:old?{etagMatches:old.etag}:new Headers({"If-None-Match":"*"}),
      httpMetadata:{contentType:"application/json"},
    });
    if(!put)continue;
    try{return await action();}
    finally{
      try{
        const current=await bucket.get(path);
        if(current){
          const saved=JSON.parse(await current.text());
          if(saved.owner===owner){
            await bucket.put(path,JSON.stringify({owner:null,expiresAt:0}),{
              onlyIf:{etagMatches:current.etag},httpMetadata:{contentType:"application/json"},
            });
          }
        }
      }catch(error){console.warn("QA lease will expire",String(error?.message||"unknown"));}
    }
  }
  throw deny(409,"Concurrent QA ledger write");
}
