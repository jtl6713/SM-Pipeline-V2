/**
 * Durable R2 storage for Factory's post-render correction receipts.
 * Per-request approval lock is acquired externally; each receipt write is
 * independently conditional and read back. Airtable remains output SoR.
 * No file upload, render, approval, scheduling or posting happens here.
 */
export const FACTORY_CORRECTION_RECEIPT_PREFIX="studio/state/factory-corrections/v1";
const clean=x=>String(x??"").trim();
function fail(message){
  const e=new Error(message);e.status=409;e.code="CORRECTION_RECEIPT_CONFLICT";throw e;
}
export function factoryCorrectionReceiptStore(bucket,actorId){
  if(!bucket?.get||!bucket?.put||!/^rec[A-Za-z0-9]{14}$/.test(clean(actorId)))
    fail("Trusted receipt store and actor required");
  function path(id) {
    if(!/^[A-Za-z0-9_-]{8,120}$/.test(clean(id)))fail("Invalid receipt identifier");
    return FACTORY_CORRECTION_RECEIPT_PREFIX+"/"+actorId+"/"+id+".json";
  }
  async function get(id) {
    const entry=await bucket.get(path(id));
    if(!entry)return null;
    const value=JSON.parse(await entry.text());
    if(value?.client_request_id!==id||!Number.isSafeInteger(value.version)||
       value.version<1)fail("Stored correction receipt is malformed");
    return {value,etag:entry.etag};
  }
  async function readBatchReceipt(id){return (await get(id))?.value||null;}
  async function createBatchReceiptIfAbsent(id,value){
    if(value?.client_request_id!==id||value.version!==1)
      fail("Initial receipt identity is invalid");
    const put=await bucket.put(path(id),JSON.stringify(value),{
      onlyIf:new Headers({"If-None-Match":"*"}),
      httpMetadata:{contentType:"application/json"},
    });
    if(!put){
      const old=await readBatchReceipt(id);
      if(!old)fail("Initial correction receipt could not be stored");
      return false;
    }
    const readback=await readBatchReceipt(id);
    if(!readback||readback.fingerprint!==value.fingerprint||readback.version!==1)
      fail("Initial correction receipt readback differs");
    return true;
  }
  async function updateBatchReceiptIfVersion(id,version,next) {
    if(next?.client_request_id!==id||next.version!==version+1)
      fail("Correction receipt version advance invalid");
    const old=await get(id);
    if(old?.value.version!==version||!old.etag)
      fail("Concurrent correction receipt mutation");
    if(old.value.fingerprint!==next.fingerprint||
       old.value.production_request_id!==next.production_request_id||
       old.value.profile_id!==next.profile_id)
      fail("Immutable correction receipt identity changed");
    const wrote=await bucket.put(path(id),JSON.stringify(next),{
      onlyIf:{etagMatches:old.etag},
      httpMetadata:{contentType:"application/json"},
    });
    if(!wrote)fail("Correction receipt lost concurrent CAS");
    const readback=await readBatchReceipt(id);
    if(readback?.version!==next.version||readback?.fingerprint!==next.fingerprint)
      fail("Correction receipt readback unverified");
    return true;
  }
  return {readBatchReceipt,createBatchReceiptIfAbsent,updateBatchReceiptIfVersion};
}
