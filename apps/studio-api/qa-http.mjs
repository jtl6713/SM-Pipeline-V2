// Admin-only QA Test Center HTTP service. All mutation methods append to Airtable.
// This module has no production-output mutation, scheduling or publishing imports.
import {QA_CATALOG} from "./qa-catalog.mjs";
import {validateManualResult,SAFE_ASSERTIONS} from "./qa-test-core.mjs";
import {executeQaAssertion} from "./qa-registry.mjs";
import {withQaIdempotencyLock} from "./qa-idempotency-lock.mjs";

// The Runner release identity is read only from the trusted production origin.
// A guessed/client-provided version must never make an incomplete gate green.
export async function verifiedRunnerVersion(env,requester){
  const origin=String(env?.PIPELINE_RUNNER_URL||"").trim().replace(/\/$/,"");
  if(origin!=="https://pipeline.chicagoshining.com")return "unverified";
  try{
    const response=await requester(origin+"/health",{
      method:"GET",redirect:"error",headers:{Accept:"application/json"},
      signal:AbortSignal.timeout(4500)
    });
    if(!response.ok)return "unverified";
    const info=await response.json();
    if(info?.ok!==true||info?.service!=="pipeline-runner"||
      info?.studio_write_source!=="airtable"||
      typeof info?.version!=="string"||info.version.length>120||!info.version.trim())
      return "unverified";
    return info.version.trim();
  }catch{return "unverified";}
}
function configuredQaEnvironment(env){
  // A selected label is not a target. Only test the environment actually
  // bound to this Worker, never silently route 'staging' to production.
  const configured=String(env?.STUDIO_QA_EXECUTION_ENV||"production").trim().toLowerCase();
  if(!["production","staging","development"].includes(configured))
    throw error(503,"QA execution environment is not configured");
  return configured;
}
export const QA_RUNS_TABLE="tblYwzehVtmyUMzj5";
export const QA_EVENTS_TABLE="tblsg5E1cq8nb240c";
const catalog=QA_CATALOG.tests;
const knownTests=new Map(catalog.map(test=>[test.id,test]));
function error(status,message){const e=new Error(message);e.status=status;return e;}
function required(value,label,max=500){
  if(typeof value!=="string"||!value.trim()||value.length>max)throw error(400,label+" required");
  return value.trim();
}
function requestKey(body){
  const key=required(body.client_request_id,"client_request_id",80);
  if(!/^[A-Za-z0-9._:-]{8,80}$/.test(key))throw error(400,"Invalid request id");
  return key;
}
function exactTest(id){const t=knownTests.get(id);if(!t)throw error(404,"Unknown QA test");return t;}
function checkRunId(value){const id=required(value,"run ID",100);if(!/^qa-[0-9a-f-]{36}$/i.test(id))throw error(400,"Invalid run ID");return id;}
function filterFormula(field,value){
  if(!["Run ID","Idempotency Key"].includes(field))throw error(500,"QA filter forbidden");
  return "{"+field+"}="+JSON.stringify(String(value));
}
async function payloadHash(value){
  const raw=new TextEncoder().encode(JSON.stringify(value));
  const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",raw));
  return [...hash].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function jsonBody(request){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type")||""))
    throw error(415,"JSON required");
  const raw=await request.text();
  if(raw.length>8192)throw error(413,"QA request exceeds 8 KB");
  let body;try{body=JSON.parse(raw)}catch{throw error(400,"Invalid JSON");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw error(400,"JSON object required");
  return body;
}
function trustedActor(authorization){
  const actor=authorization?.user?.record_id;
  return required(actor,"Authenticated tester",100);
}
function fields(record){return record?.fields||{};}
function exposeRun(record){
  const f=fields(record);
  let deployment={};try{deployment=JSON.parse(f["Deployment JSON"]||"{}");}catch{}
  return {record_id:record.id,runId:f["Run ID"],catalogRevision:f["Catalog Revision"],
    environment:f.Environment,deployment,createdBy:f["Created By"],
    createdAtUtc:f["Created At UTC"],status:f.Status||"Open"};
}
function exposeEvent(record){
  const f=fields(record);
  let payload={};try{payload=JSON.parse(f["Payload JSON"]||"{}");}catch{payload={parse_error:true};}
  return {record_id:record.id,executionId:f["Execution ID"],runId:f["Run ID"],
    testId:f["Test ID"],kind:f["Event Kind"],actorId:f["Actor ID"],
    atUtc:f["Recorded At UTC"],payload};
}
// Revalidate canonical Airtable observations at release time, not just at submission.
// A malformed or directly imported legacy Pass must never become a green gate.
export function qaEvidenceIntegrityBlockers(events){
  const latest=new Map();
  for(const event of [...events].sort((a,b)=>String(a.atUtc).localeCompare(String(b.atUtc))))
    if(["ManualResult","AutomatedObservation"].includes(event.kind))
      latest.set(event.testId,event);
  const blockers=[];
  for(const [testId,event] of latest){
    if(event.payload?.status!=="Pass")continue;
    const p=event.payload||{},hasNotes=typeof p.notes==="string"&&!!p.notes.trim();
    const hasEvidence=Array.isArray(p.evidence)&&p.evidence.length>0 &&
      p.evidence.every(v=>v&&typeof v==="object"&&Object.keys(v).length>0);
    if(!event.actorId||typeof p.executionId!=="string"||!/^qaex-[0-9a-f-]{36}$/i.test(p.executionId)){
      blockers.push(testId+": missing trusted tester or execution identity");
      continue;
    }
    if(event.kind==="ManualResult"&&!hasNotes&&!hasEvidence)
      blockers.push(testId+": manual Pass lacks notes or evidence");
    if(event.kind==="AutomatedObservation"&&
       (p.source!=="automated"||p.requiresHumanApproval!==true||!hasEvidence))
      blockers.push(testId+": automated Pass lacks trusted evidence or review requirement");
  }
  return blockers;
}
export function computeQaGate(tests,events){
  const latest=new Map(),reviews=new Map(),waivers=[];
  for(const event of [...events].sort((a,b)=>String(a.atUtc).localeCompare(String(b.atUtc)))){
    if(["ManualResult","AutomatedObservation"].includes(event.kind)&&event.payload?.executionId)
      latest.set(event.testId,event);
    if(event.kind==="HumanApproval"&&event.payload?.executionId)
      reviews.set(event.payload.executionId,event);
    if(event.kind==="Waiver")waivers.push(event);
  }
  const passed=[],failed=[],blocked=[],pendingHuman=[];
  for(const t of tests){
    const e=latest.get(t.id);
    if(!e||!["Pass","Fail","Blocked","Error","Needs Review"].includes(e.payload?.status)){blocked.push(t.id);continue;}
    if(e.payload.status==="Fail"){failed.push(t.id);continue;}
    if(e.payload.status!=="Pass"){blocked.push(t.id);continue;}
    if(e.kind==="AutomatedObservation"&&
       (reviews.get(e.payload.executionId)?.payload?.decision!=="Approved" ||
        reviews.get(e.payload.executionId)?.actorId===e.actorId)){
      pendingHuman.push(t.id);continue;
    }
    passed.push(t.id);
  }
  // Waivers are visible but never automatically turn an untested release green.
  return {ready:passed.length===tests.length,decision:failed.length?"Reject":
    blocked.length?"Incomplete":pendingHuman.length?"Needs human approval":
    passed.length===tests.length?"Ready":"Incomplete",
    total:tests.length,passed,failed,blocked,pendingHuman,waivers:waivers.map(x=>({
      testId:x.testId,reason:x.payload?.reason,expiresAtUtc:x.payload?.expiresAtUtc,actorId:x.actorId
    }))};
}
export function compareQaRunResults(baselineEvents,currentEvents){
  function latest(events){
    const results=new Map();
    for(const e of [...events].sort((a,b)=>String(a.atUtc).localeCompare(String(b.atUtc))))
      if(["ManualResult","AutomatedObservation"].includes(e.kind)&&e.payload?.status)
        results.set(e.testId,e);
    return results;
  }
  const older=latest(baselineEvents),newer=latest(currentEvents),regressions=[];
  for(const [testId,old] of older){
    if(old.payload.status!=="Pass")continue;
    const now=newer.get(testId);
    if(now?.payload?.status!=="Pass")
      regressions.push({testId,from:"Pass",to:now?.payload?.status||"Not run",
        baselineExecutionId:old.payload.executionId,
        currentExecutionId:now?.payload?.executionId||null});
  }
  return regressions;
}
export async function handleQaApi({request,url,env,authorization,airtableFetch,respond,
  clock=()=>new Date(),fetchHealth=fetch}){
  const actor=trustedActor(authorization);
  const send=(body,status=200)=>respond(request,env,body,status);
  const pathname=url.pathname;
  const apiPrefix="/api/admin/qa/";
  if(!pathname.startsWith(apiPrefix))throw error(404,"Unknown QA route");
  async function listPage(table,field,value,limit=50,offset=null,sortField=null){
    if(!Number.isInteger(limit)||limit<1||limit>100)throw error(400,"Unbounded QA history request");
    const query=new URLSearchParams({pageSize:String(Math.min(limit,100))});
    if(field)query.set("filterByFormula",filterFormula(field,value));
    if(offset){
      if(typeof offset!=="string"||offset.length>180||!/^[A-Za-z0-9/+=._-]+$/.test(offset))
        throw error(400,"Invalid QA pagination cursor");
      query.set("offset",offset);
    }
    if(sortField){
      if(!["Created At UTC","Recorded At UTC"].includes(sortField))throw error(500,"QA sort field denied");
      query.set("sort[0][field]",sortField);query.set("sort[0][direction]","desc");
    }
    const response=await airtableFetch(env,table,"?"+query.toString());
    if(!Array.isArray(response.records))throw error(503,"QA canonical history unavailable");
    return {records:response.records,offset:response.offset||null};
  }
  const list=async(table,field,value,limit=50)=>(
    await listPage(table,field,value,limit)).records;
  async function add(table,recordFields){
    const saved=await airtableFetch(env,table,"",{method:"POST",skipSupabaseWriteThrough:true,
      body:JSON.stringify({records:[{fields:recordFields}],typecast:false})});
    const result=saved?.records?.[0];
    if(!result?.id)throw error(503,"QA Airtable commit unverified");
    return result;
  }
  async function writeOnce(table,kind,key,identity,payload,makeFields){
    const compound=kind+":"+key;
    const hash=await payloadHash({kind,identity,payload});
    return withQaIdempotencyLock(env.STUDIO_MEDIA,compound,async()=>{
      const old=await list(table,"Idempotency Key",compound,2);
      if(old.length>1)throw error(409,"Duplicate QA history identity requires reconciliation");
      if(old.length===1){
        if(fields(old[0])["Payload Hash"]!==hash)throw error(409,"QA idempotency payload conflict");
        return {record:old[0],reused:true};
      }
      const record=await add(table,{...makeFields(),"Idempotency Key":compound,"Payload Hash":hash});
      return {record,reused:false};
    });
  }
  async function runRow(runId){
    const matches=await list(QA_RUNS_TABLE,"Run ID",runId,2);
    if(matches.length!==1)throw error(matches.length?409:404,"QA run unavailable or duplicated");
    return matches[0];
  }
  async function history(runId){
    // Read all canonical event pages before calculating a gate. A partial view
    // must never appear green. The scan is strictly capped at 1,000 events.
    const all=[];let offset=null;
    for(let page=0;page<10;page++){
      const next=await listPage(QA_EVENTS_TABLE,"Run ID",runId,100,offset);
      all.push(...next.records);offset=next.offset;
      if(!offset)return all.map(exposeEvent).sort((a,b)=>String(a.atUtc).localeCompare(String(b.atUtc)));
    }
    throw error(409,"QA run history exceeds 1,000-event safe scan; release gate blocked");
  }
  if(pathname===apiPrefix+"catalog"&&request.method==="GET"){
    return send({ok:true,catalogVersion:QA_CATALOG.catalogVersion,tests:catalog,
      safeAutomations:["QA-DIAG-001","QA-CAT-001","QA-AT-001"],executionEnvironment:configuredQaEnvironment(env),writeAuthority:"Airtable"});
  }
  if(pathname===apiPrefix+"runs"){
    if(request.method==="GET"){
      const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||20)||20,1),50);
      const page=await listPage(QA_RUNS_TABLE,null,null,limit,
        url.searchParams.get("cursor")||null,"Created At UTC");
      return send({ok:true,runs:page.records.map(exposeRun),next_cursor:page.offset,limited_to:limit});
    }
    if(request.method==="POST"){
      const body=await jsonBody(request),key=requestKey(body);
      const boundEnvironment=configuredQaEnvironment(env);
      const environment=body.environment===undefined?boundEnvironment:required(body.environment,"environment",40);
      if(environment!==boundEnvironment)throw error(400,"Selected QA environment is not configured on this Worker; no cross-environment testing");
      const runner=await verifiedRunnerVersion(env,fetchHealth);
      const snapshot={worker:"0.10.765-qa-center-v1",ui:"0.6.897-qa-center-pilot",
        runner}; // Server-only observed Runner identity; never trust a browser claim.
      const identity={actor,environment,catalogRevision:QA_CATALOG.catalogVersion};
      const payload={environment,catalogRevision:QA_CATALOG.catalogVersion};
      const value=await writeOnce(QA_RUNS_TABLE,"run",key,identity,payload,()=>({
        "Run ID":"qa-"+crypto.randomUUID(),"Catalog Revision":QA_CATALOG.catalogVersion,
        "Environment":environment,"Deployment JSON":JSON.stringify(snapshot),
        "Created By":actor,"Created At UTC":clock().toISOString(),"Status":"Open"
      }));
      return send({ok:true,reused:value.reused,run:exposeRun(value.record)},value.reused?200:201);
    }
    throw error(405,"QA method not allowed");
  }
  const match=/^\/api\/admin\/qa\/runs\/(qa-[0-9a-f-]{36})(?:\/(results|approvals|waivers|finalize|gate|regressions|execute\/(QA-[A-Z0-9-]+)))?$/i.exec(pathname);
  if(!match)throw error(404,"Unknown QA endpoint");
  const runId=checkRunId(match[1]),operation=match[2]||"",testToExecute=match[3];
  const run=exposeRun(await runRow(runId));
  if(!operation&&request.method==="GET"){
    const events=await history(runId);
    const finished=events.filter(x=>x.kind==="RunFinalized");
    if(finished.length>1)throw error(409,"Conflicting QA finalization events");
    return send({ok:true,run:{...run,status:finished.length?"Finalized":"Open",
      finalizedAtUtc:finished[0]?.atUtc||null,
      releaseDecision:finished[0]?.payload?.decision||null},events});
  }
  if(operation==="regressions"&&request.method==="GET"){
    const baselineId=checkRunId(url.searchParams.get("baseline")||"");
    if(baselineId===runId)throw error(400,"Select a different baseline run");
    const baseline=exposeRun(await runRow(baselineId));
    if(baseline.catalogRevision!==run.catalogRevision)
      throw error(409,"Cannot compare different QA catalog revisions");
    const [previous,current]=await Promise.all([history(baselineId),history(runId)]);
    const regressions=compareQaRunResults(previous,current);
    return send({ok:true,baselineRunId:baselineId,currentRunId:runId,
      regressions,baselineTotal:previous.length,currentTotal:current.length});
  }
  if(operation==="gate"&&request.method==="GET"){
    const events=await history(runId);
    const gate=computeQaGate(catalog,events);
    const blockers=qaEvidenceIntegrityBlockers(events);
    if(run.catalogRevision!==QA_CATALOG.catalogVersion)
      blockers.push("QA catalog revision changed; create a new run before release");
    if(events.some(event=>["ManualResult","AutomatedObservation"].includes(event.kind)&&
       event.payload?.catalogVersion!==run.catalogRevision))
      blockers.push("QA history contains an observation with a mismatched catalog revision");
    if(run.deployment?.runner==="unverified")blockers.push("Runner deployment is not attested");
    const finished=events.filter(x=>x.kind==="RunFinalized");
    if(finished.length>1)blockers.push("Multiple finalization records require reconciliation");
    if(finished.length===1&&finished[0].payload?.decision!=="Approved")
      blockers.push("Run was finalized without release approval");
    if(blockers.length){gate.ready=false;gate.decision="Incomplete";}
    return send({ok:true,run,gate:{...gate,deploymentBlockers:blockers}});
  }
  if(request.method!=="POST"||!["results","approvals","waivers","finalize"].includes(operation)&&!operation.startsWith("execute/"))
    throw error(405,"QA method not allowed");
  // Historical runs remain readable, but new execution under a different
  // catalog would create a false green result from an obsolete procedure.
  if(run.catalogRevision!==QA_CATALOG.catalogVersion)
    throw error(409,"QA catalog revision changed; start a new run before recording results");
  // Every mutation of one run uses the same conditional lease. This serializes
  // finalization against late result/approval requests across Worker isolates.
  return withQaIdempotencyLock(env.STUDIO_MEDIA,"run-write:"+runId,async()=>{
  const body=await jsonBody(request),key=requestKey(body);
  const existingEvents=await history(runId);
  const completed=existingEvents.filter(e=>e.kind==="RunFinalized");
  if(completed.length>1)throw error(409,"Conflicting QA finalization events");
  if(completed.length){
    if(operation!=="finalize")throw error(409,"This QA run is finalized; start another run");
    const replay=await list(QA_EVENTS_TABLE,"Idempotency Key","RunFinalized:"+key,2);
    if(replay.length!==1||replay[0].id!==completed[0].record_id)
      throw error(409,"Run already finalized; no new finalization is permitted");
    const original=exposeEvent(replay[0]);
    if(body.decision!==original.payload.decision||
       String(body.notes||"").trim()!==String(original.payload.notes||"").trim())
      throw error(409,"Finalization request does not match the immutable event");
    return send({ok:true,reused:true,event:original});
  }
  let testId,kind,payload;
  if(operation==="results"){
    let result;
    try{result=validateManualResult(body);}catch(e){throw error(400,String(e?.message||"Invalid manual result"));}
    testId=result.testId;exactTest(testId);kind="ManualResult";
    payload={executionId:"qaex-"+crypto.randomUUID(),status:result.status,source:"manual",
      notes:result.notes,evidence:result.evidence,catalogVersion:QA_CATALOG.catalogVersion};
  }else if(operation.startsWith("execute/")){
    testId=testToExecute;exactTest(testId);
    const enabled=new Set(["QA-DIAG-001","QA-CAT-001","QA-AT-001"]);
    if(!enabled.has(testId)||!SAFE_ASSERTIONS[testId])throw error(405,"Safe automation not enabled for this test");
    kind="AutomatedObservation";
    const existing=await list(QA_EVENTS_TABLE,"Idempotency Key",kind+":"+key,2);
    if(existing.length>1)throw error(409,"Duplicate QA assertion identity");
    if(existing.length===1){
      const old=exposeEvent(existing[0]);
      if(old.runId!==runId||old.testId!==testId||old.actorId!==actor)
        throw error(409,"Conflicting QA assertion identity");
      return send({ok:true,reused:true,event:old});
    }
    const observers={
      workerHealth:async({signal})=>{
        const target=new URL("/api/health",url.origin);
        const response=await fetchHealth(target.toString(),{method:"GET",redirect:"error",
          headers:{Accept:"application/json"},signal});
        const health=await response.json();
        return {httpStatus:response.status,
          workerVersion:typeof health?.version==="string"?health.version:null};
      },
      catalogIntegrity:async()=>{
        const ids=new Set();let invalidCount=0;
        for(const t of catalog){
          if(!t.id||!t.title||!t.severity||!t.prerequisites?.length||
             !t.steps?.length||!t.expectedResults?.length||ids.has(t.id))invalidCount++;
          ids.add(t.id);
        }
        return {source:"versioned-catalog",catalogVersion:QA_CATALOG.catalogVersion,
          totalTests:catalog.length,uniqueIds:ids.size,invalidCount};
      },
      canonicalRun:async()=>{
        const result=await list(QA_RUNS_TABLE,"Run ID",runId,2);
        const record=result.length===1?result[0]:null;
        return {source:"Airtable",recordId:record?.id||null,
          expectedRunId:runId,runId:fields(record)["Run ID"]||null,
          createdAtUtc:fields(record)["Created At UTC"]||null};
      },
    };
    const evaluated=await executeQaAssertion({testId,scope:{},observers,now:clock});
    payload={executionId:"qaex-"+crypto.randomUUID(),status:evaluated.status,
      source:"automated",reason:evaluated.reason,
      evidence:evaluated.evidence?[evaluated.evidence]:[],
      startedAtUtc:evaluated.startedAtUtc,finishedAtUtc:evaluated.finishedAtUtc,
      catalogVersion:QA_CATALOG.catalogVersion,assertionVersion:"qa-registry-v2",
      requiresHumanApproval:true};
  }else if(operation==="finalize"){
    const decision=required(body.decision,"release decision",20);
    if(!["Approved","Rejected","Incomplete"].includes(decision))
      throw error(400,"Invalid QA finalization decision");
    const notes=typeof body.notes==="string"?body.notes.trim():"";
    if(notes.length>2000)throw error(400,"Finalization notes too long");
    if(decision!=="Approved"&&!notes)
      throw error(400,"Rejected or incomplete runs require an explanation");
    if(decision==="Approved"){
      const gate=computeQaGate(catalog,existingEvents);
      if(!gate.ready||qaEvidenceIntegrityBlockers(existingEvents).length||
         run.deployment?.runner==="unverified"||
         existingEvents.some(event=>["ManualResult","AutomatedObservation"].includes(event.kind)&&
           event.payload?.catalogVersion!==run.catalogRevision))
        throw error(409,"Cannot approve QA release while evidence or deployment is incomplete");
    }
    kind="RunFinalized";testId="QA-RUN";
    payload={decision,notes,catalogVersion:run.catalogRevision};
  }else if(operation==="approvals"){
    testId=required(body.testId,"testId",80);exactTest(testId);
    const executionId=required(body.executionId,"executionId",100);
    if(!/^qaex-[0-9a-f-]{36}$/i.test(executionId))throw error(400,"Invalid execution identity");
    if(!["Approved","Rejected"].includes(body.decision))throw error(400,"Invalid review decision");
    const events=await history(runId);
    const subject=events.find(x=>x.testId===testId&&x.payload?.executionId===executionId
      &&x.kind==="AutomatedObservation");
    if(!subject)throw error(404,"Only existing automated evidence can receive QA approval");
    if(subject.actorId===actor)throw error(403,"Independent reviewer required");
    kind="HumanApproval";
    payload={executionId,decision:body.decision,
      notes:typeof body.notes==="string"?body.notes.slice(0,2000):"",subjectActorId:subject.actorId};
  }else{
    testId=required(body.testId,"testId",80);exactTest(testId);
    const reason=required(body.reason,"waiver reason",2000);
    const expiresAtUtc=required(body.expiresAtUtc,"waiver expiration",60);
    if(!Number.isFinite(Date.parse(expiresAtUtc))||Date.parse(expiresAtUtc)<=clock().valueOf()||
       Date.parse(expiresAtUtc)>clock().valueOf()+30*86400000)throw error(400,"Waiver expiry must be within 30 days");
    kind="Waiver";payload={reason,expiresAtUtc,riskAccepted:true};
  }
  const semanticPayload={...payload,executionId:undefined}; // stable across retries before generated ID
  const identity={runId,testId,actor};
  const result=await writeOnce(QA_EVENTS_TABLE,kind,key,identity,semanticPayload,()=>({
    "Execution ID":payload.executionId||"qaex-"+crypto.randomUUID(),
    "Run ID":runId,"Test ID":testId,"Event Kind":kind,"Actor ID":actor,
    "Recorded At UTC":clock().toISOString(),"Payload JSON":JSON.stringify(payload)
  }));
  return send({ok:true,reused:result.reused,event:exposeEvent(result.record)},result.reused?200:201);
  });
}
