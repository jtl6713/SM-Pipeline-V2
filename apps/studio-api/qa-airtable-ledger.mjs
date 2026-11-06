// Airtable-authoritative QA ledger adapter. No PATCH/DELETE or Supabase writes.
// Network transport must be injected by an authenticated Worker route. Not a public endpoint.
const tables=Object.freeze({runs:"QA Test Runs",events:"QA Executions"});
const safeId=x=>typeof x==="string"&&/^[A-Za-z0-9._:-]{3,128}$/.test(x);
function assertTransport(client){if(typeof client?.list!=="function"||typeof client?.create!=="function")throw Error("Airtable transport unavailable");}
export function qaAirtableAdapter(client,{maxPage=100}={}){
 assertTransport(client);
 const list=async(table,filter,{limit=50}={})=>{
  if(!Number.isInteger(limit)||limit<1||limit>maxPage)throw Error("Unbounded QA query");
  return client.list(table,{filter,maxRecords:limit});
 };
 const append=async(table,entity,key)=>{
  if(!safeId(key))throw Error("Invalid idempotency key");
  // Read-before-create protects retry responses in serial use; transport must provide
  // atomic uniqueness/serialized write guard for concurrent retries.
  const existing=await list(table,{field:"Idempotency Key",equals:key},{limit:2});
  if(!Array.isArray(existing))throw Error("Airtable canonical read failed");
  if(existing.length>1)throw Error("Duplicate idempotency conflict");
  if(existing.length===1){
   if(existing[0].fields?.["Payload Hash"]!==entity.payloadHash)throw Error("Idempotency conflict");
   return {record:existing[0],reused:true};
  }
  const record=await client.create(table,{...entity.fields,"Idempotency Key":key,"Payload Hash":entity.payloadHash});
  if(!record?.id)throw Error("Airtable did not acknowledge durable write");
  return {record,reused:false};
 };
 return Object.freeze({
  listRuns:async(limit=50)=>list(tables.runs,null,{limit}),
  listEvents:async(runId,limit=100)=>{
   if(!safeId(runId))throw Error("Invalid run id");
   return list(tables.events,{field:"Run ID",equals:runId},{limit});
  },
  appendRun:async(run,key,payloadHash)=>append(tables.runs,{fields:{
   "Run ID":run.runId,"Catalog Revision":run.catalogRevision,"Environment":run.environment,
   "Deployment JSON":JSON.stringify(run.deployment),"Created By":run.createdBy,
   "Created At UTC":run.createdAtUtc,"Status":run.status},payloadHash},key),
  appendEvent:async(event,key,payloadHash)=>{
   if(event?.appendOnly!==true||event?.writeAuthority!=="Airtable")throw Error("Not an authorized immutable QA event");
   return append(tables.events,{fields:{
    "Run ID":event.runId,"Test ID":event.testId,"Event Kind":event.kind,
    "Actor ID":event.actorId,"Recorded At UTC":event.atUtc,
    "Payload JSON":JSON.stringify(event.payload)},payloadHash},key);
  }
 });
}
