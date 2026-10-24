/**
 * Short-lived R2 CAS lease for administrator conversation writes.
 * Dedicated namespace prevents conversations from interfering with approvals.
 */
export const EXCEPTION_THREAD_LOCK_PREFIX = "studio/state/exception-recovery-messages/v1";
const VALID = /^rec[A-Za-z0-9]{14}$/;
async function current(bucket, key) {
  const result = await bucket.get(key);
  if (!result) return null;
  return {etag:result.etag, data:JSON.parse(await result.text())};
}
export async function withExceptionConversationLock(bucket, recordId, operation, options={}) {
  if (!VALID.test(String(recordId||""))) throw Object.assign(new Error("Invalid output identity"),{status:400});
  if (!bucket?.get||!bucket?.put) throw Object.assign(new Error("Conversation lock store unavailable"),{status:503});
  const key=EXCEPTION_THREAD_LOCK_PREFIX+"/"+recordId+".json";
  const owner=(options.owner||crypto.randomUUID());
  const now=options.now||Date.now;
  let held=false;
  for(let i=0;i<4;i++) {
    const before=await current(bucket,key);
    if(before?.data?.owner&&Number(before.data.expires_ms)>now())
      throw Object.assign(new Error("Conversation already updating; reopen the thread before retrying"),{status:409});
    const result=await bucket.put(key,JSON.stringify({owner,expires_ms:now()+120000}),{
      onlyIf:before?{etagMatches:before.etag}:new Headers({"If-None-Match":"*"}),
      httpMetadata:{contentType:"application/json"},
    });
    if(result){held=true;break;}
  }
  if(!held) throw Object.assign(new Error("Concurrent conversation update; inspect history"),{status:409});
  try { return await operation(); }
  finally {
    try{
      const after=await current(bucket,key);
      if(after?.data?.owner===owner) await bucket.put(key,JSON.stringify({owner:null,expires_ms:0}),{
        onlyIf:{etagMatches:after.etag},
        httpMetadata:{contentType:"application/json"}
      });
    }catch(error){console.warn("Exception conversation lease release deferred",String(error?.message||error));}
  }
}
