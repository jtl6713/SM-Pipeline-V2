// Admin-only QA Test Center HTTP service. All mutation methods append to Airtable.
// This module has no production-output mutation, scheduling or publishing imports.
import {QA_CATALOG} from "./qa-catalog.mjs";
import {validateManualResult,evaluateAssertion,SAFE_ASSERTIONS} from "./qa-test-core.mjs";
import {withQaIdempotencyLock} from "./qa-idempotency-lock.mjs";

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
  async function list(table,field,value,limit=50){
    if(!Number.isInteger(limit)||limit<1||limit>100)throw error(400,"Unbounded QA history request");
    const query=new URLSearchParams({maxRecords:String(limit),pageSize:String(Math.min(limit,100))});
    if(field)query.set("filterByFormula",filterFormula(field,value));
    const response=await airtableFetch(env,table,"?"+query.toString());
    if(!Array.isArray(response.records))throw error(503,"QA canonical history unavailable");
    return response.records;
  }
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
    const all=await list(QA_EVENTS_TABLE,"Run ID",runId,100);
    if(all.length>=100)throw error(409,"QA event history exceeds bounded window; pagination required");
    return all.map(exposeEvent).sort((a,b)=>String(a.atUtc).localeCompare(String(b.atUtc)));
  }
  if(pathname===apiPrefix+"catalog"&&request.method==="GET"){
    return send({ok:true,catalogVersion:QA_CATALOG.catalogVersion,tests:catalog,
      safeAutomations:["QA-DIAG-001"],writeAuthority:"Airtable"});
  }
  if(pathname===apiPrefix+"runs"){
    if(request.method==="GET"){
      const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||20)||20,1),50);
      const rows=await list(QA_RUNS_TABLE,null,null,limit);
      return send({ok:true,runs:rows.map(exposeRun).sort((a,b)=>
        String(b.createdAtUtc).localeCompare(String(a.createdAtUtc))),limited_to:limit});
    }
    if(request.method==="POST"){
      const body=await jsonBody(request),key=requestKey(body);
      const environment=body.environment===undefined?"production":required(body.environment,"environment",40);
      if(!["production","staging","development"].includes(environment))throw error(400,"Invalid QA environment");
      const snapshot={worker:"0.10.765-qa-center-v1",ui:"0.6.897-qa-center-pilot",
        runner:"unverified"}; // Do not accept claimed deployment versions from browser.
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
  const match=/^\/api\/admin\/qa\/runs\/(qa-[0-9a-f-]{36})(?:\/(results|approvals|waivers|gate|regressions|execute\/(QA-[A-Z0-9-]+)))?$/i.exec(pathname);
  if(!match)throw error(404,"Unknown QA endpoint");
  const runId=checkRunId(match[1]),operation=match[2]||"",testToExecute=match[3];
  const run=exposeRun(await runRow(runId));
  if(!operation&&request.method==="GET")return send({ok:true,run,events:await history(runId)});
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
    const blockers=[];
    if(run.deployment?.runner==="unverified")blockers.push("Runner deployment is not attested");
    if(blockers.length){gate.ready=false;gate.decision="Incomplete";}
    return send({ok:true,run,gate:{...gate,deploymentBlockers:blockers}});
  }
  if(request.method!=="POST"||!["results","approvals","waivers"].includes(operation)&&!operation.startsWith("execute/"))
    throw error(405,"QA method not allowed");
  const body=await jsonBody(request),key=requestKey(body);
  let testId,kind,payload;
  if(operation==="results"){
    let result;
    try{result=validateManualResult(body);}catch(e){throw error(400,String(e?.message||"Invalid manual result"));}
    testId=result.testId;exactTest(testId);kind="ManualResult";
    payload={executionId:"qaex-"+crypto.randomUUID(),status:result.status,source:"manual",
      notes:result.notes,evidence:result.evidence,catalogVersion:QA_CATALOG.catalogVersion};
  }else if(operation.startsWith("execute/")){
    testId=testToExecute;exactTest(testId);
    if(testId!=="QA-DIAG-001"||!SAFE_ASSERTIONS[testId])throw error(405,"Safe automation not enabled for this test");
    kind="AutomatedObservation";
    const existing=await list(QA_EVENTS_TABLE,"Idempotency Key",kind+":"+key,2);
    if(existing.length>1)throw error(409,"Duplicate QA assertion identity");
    if(existing.length===1){
      const old=exposeEvent(existing[0]);
      if(old.runId!==runId||old.testId!==testId||old.actorId!==actor)
        throw error(409,"Conflicting QA assertion identity");
      return send({ok:true,reused:true,event:old});
    }
    const target=new URL("/api/health",url.origin);
    let evaluated;
    try{
      const response=await fetchHealth(target.toString(),{method:"GET",redirect:"error",
        headers:{Accept:"application/json"},signal:AbortSignal.timeout(5000)});
      const health=await response.json();
      evaluated=evaluateAssertion(testId,{httpStatus:response.status,
        workerVersion:typeof health?.version==="string"?health.version:null});
    }catch{evaluated={status:"Error",reason:"Bounded Worker health observation unavailable",evidence:null};}
    payload={executionId:"qaex-"+crypto.randomUUID(),status:evaluated.status,
      source:"automated",reason:evaluated.reason,
      evidence:evaluated.evidence? [evaluated.evidence]:[],
      catalogVersion:QA_CATALOG.catalogVersion,assertionVersion:"worker-health-v1",
      requiresHumanApproval:true};
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
}
