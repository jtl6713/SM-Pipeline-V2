import test from "node:test";
import assert from "node:assert/strict";
import {handleQaApi,computeQaGate,compareQaRunResults,QA_RUNS_TABLE,QA_EVENTS_TABLE} from "./qa-http.mjs";

function harness(){
  const rows=new Map([[QA_RUNS_TABLE,[]],[QA_EVENTS_TABLE,[]]]);
  const leases=new Map();
  const bucket={
    async get(k){
      const v=leases.get(k);if(!v)return null;
      return {etag:v.etag,async text(){return v.body;}};
    },
    async put(k,body,{onlyIf}={}){
      const old=leases.get(k);
      if(old&&onlyIf?.etagMatches!==old.etag)return null;
      if(!old&&onlyIf?.headers?.get?.("If-None-Match")!=="*"&&onlyIf?.get?.("If-None-Match")!=="*")
        return null;
      const etag="e"+crypto.randomUUID();leases.set(k,{etag,body});return {etag};
    }
  };
  let seq=0;
  const airtableFetch=async(_env,table,suffix,options={})=>{
    const entries=rows.get(table);assert.ok(entries,"only QA tables may be addressed");
    if(options.method==="POST"){
      const body=JSON.parse(options.body);
      assert.equal(body.records.length,1);
      const record={id:"rec"+String(++seq).padStart(14,"0"),fields:body.records[0].fields};
      entries.push(record);return {records:[record]};
    }
    assert.ok(!options.method||options.method==="GET","QA API must be append-only");
    const q=new URLSearchParams(suffix?.startsWith("?")?suffix.slice(1):"");
    const formula=q.get("filterByFormula");
    let selected=entries;
    if(formula){
      const m=/^\{(Run ID|Idempotency Key)\}=("(?:[^"\\]|\\.)*")$/.exec(formula);
      assert.ok(m,"structured only QA formula");
      const value=JSON.parse(m[2]);selected=selected.filter(x=>x.fields[m[1]]===value);
    }
    return {records:selected.slice(0,Number(q.get("maxRecords")||50))};
  };
  const now=()=>new Date("2026-11-06T12:00:00.000Z");
  const base="https://studio.chicagoshining.com";
  function call(method,path,body,actor="recADMIN00000001",fetchHealth){
    const request=new Request(base+"/api/admin/qa/"+path,{
      method,headers:{"Content-Type":"application/json"},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    return handleQaApi({request,url:new URL(request.url),env:{STUDIO_MEDIA:bucket},
      authorization:{user:{record_id:actor}},airtableFetch,clock:now,
      respond:(_request,_env,obj,status=200)=>new Response(JSON.stringify(obj),{status}),
      fetchHealth:fetchHealth || (async()=>new Response(JSON.stringify({version:"0.10.764"}),{status:200}))});
  }
  return {call,rows};
}
test("catalog exposes 88 versioned cases and read-only safe-check allowlist",async()=>{
  const h=harness(),r=await h.call("GET","catalog");const j=await r.json();
  assert.equal(r.status,200);assert.equal(j.tests.length,88);
  assert.deepEqual(j.safeAutomations,["QA-DIAG-001","QA-CAT-001","QA-AT-001"]);
  assert.equal(j.writeAuthority,"Airtable");
});
test("run creation is server-stamped and repeated request IDs reuse canonical Airtable rows",async()=>{
  const h=harness(),input={environment:"production",client_request_id:"ui-run-12345678"};
  const first=await h.call("POST","runs",input);const p=await first.json();
  assert.equal(first.status,201);assert.match(p.run.runId,/^qa-/);
  assert.equal(p.run.createdBy,"recADMIN00000001");
  assert.equal(p.run.createdAtUtc,"2026-11-06T12:00:00.000Z");
  const duplicate=await h.call("POST","runs",input);const d=await duplicate.json();
  assert.equal(duplicate.status,200);assert.equal(d.reused,true);
  assert.equal(d.run.runId,p.run.runId);
  assert.equal(h.rows.get(QA_RUNS_TABLE).length,1);
});
test("failure requires notes and cannot fabricate Pass or insert a result",async()=>{
  const h=harness(),r=await (await h.call("POST","runs",{client_request_id:"ui-run-fail-01"})).json();
  await assert.rejects(()=>h.call("POST","runs/"+r.run.runId+"/results",
    {testId:"QA-DIAG-001",status:"Fail",client_request_id:"ui-event-fail01"}),/failure or block requires notes/);
  assert.equal(h.rows.get(QA_EVENTS_TABLE).length,0);
});
test("manual Pass creates immutable event and gate still blocks unexecuted tests",async()=>{
  const h=harness(),created=await (await h.call("POST","runs",{client_request_id:"ui-run-manual01"})).json();
  const path="runs/"+created.run.runId+"/results";
  const body={testId:"QA-AUTH-001",status:"Pass",notes:"Verified 401 and 403.",
    client_request_id:"ui-event-0001"};
  const first=await h.call("POST",path,body);assert.equal(first.status,201);
  const replay=await h.call("POST",path,body);assert.equal(replay.status,200);
  assert.equal((await replay.json()).reused,true);
  assert.equal(h.rows.get(QA_EVENTS_TABLE).length,1);
  const gate=await (await h.call("GET","runs/"+created.run.runId+"/gate")).json();
  assert.equal(gate.gate.ready,false);assert.equal(gate.gate.passed.length,1);
  assert.equal(gate.gate.blocked.length,87);
});
test("falsely healthy assertion never passes and automated Pass needs independent approval",async()=>{
  const h=harness(),created=await (await h.call("POST","runs",{client_request_id:"ui-run-auto001"})).json();
  const id=created.run.runId,path="runs/"+id+"/execute/QA-DIAG-001";
  const failed=await (await h.call("POST",path,{client_request_id:"ui-automate-fail01"},
    "recADMIN00000001",async()=>new Response(JSON.stringify({version:"0.10.764"}),{status:503}))).json();
  assert.equal(failed.event.payload.status,"Fail");
  const passed=await (await h.call("POST",path,{client_request_id:"ui-automate-pass01"})).json();
  assert.equal(passed.event.payload.status,"Pass");
  let g=(await (await h.call("GET","runs/"+id+"/gate")).json()).gate;
  assert.ok(g.pendingHuman.includes("QA-DIAG-001"));
  await assert.rejects(()=>h.call("POST","runs/"+id+"/approvals",
    {testId:"QA-DIAG-001",executionId:passed.event.payload.executionId,
    decision:"Approved",client_request_id:"ui-self-approve01"}),/Independent reviewer required/);
  await h.call("POST","runs/"+id+"/approvals",{
    testId:"QA-DIAG-001",executionId:passed.event.payload.executionId,
    decision:"Approved",client_request_id:"ui-review-approve01"
  },"recADMIN00000002");
  g=(await (await h.call("GET","runs/"+id+"/gate")).json()).gate;
  assert.ok(g.passed.includes("QA-DIAG-001"));
  assert.ok(!g.pendingHuman.includes("QA-DIAG-001"));
  assert.equal(g.ready,false);
});
test("unregistered automation cannot execute arbitrary tests, scripts, URLs or publishing",async()=>{
  const h=harness(),created=await (await h.call("POST","runs",{client_request_id:"ui-run-deny001"})).json();
  await assert.rejects(()=>h.call("POST","runs/"+created.run.runId+"/execute/QA-AUTH-001",
    {client_request_id:"ui-deny-script01",script:"fetch('https://evil.invalid')"}),/Safe automation not enabled/);
  assert.equal(h.rows.get(QA_EVENTS_TABLE).length,0);
});
test("gate rejects failures even if a human later reviewed an older pass",()=>{
 const cases=[{id:"QA-DIAG-001"}];
 const events=[
 {testId:"QA-DIAG-001",kind:"AutomatedObservation",atUtc:"2026-11-06T10:00:00Z",actorId:"u1",
  payload:{executionId:"qaex-old",status:"Pass"}},
 {testId:"QA-DIAG-001",kind:"HumanApproval",atUtc:"2026-11-06T11:00:00Z",actorId:"u2",
  payload:{executionId:"qaex-old",decision:"Approved"}},
 {testId:"QA-DIAG-001",kind:"ManualResult",atUtc:"2026-11-06T12:00:00Z",actorId:"u1",
  payload:{executionId:"qaex-new",status:"Fail"}},
 ];
 const gate=computeQaGate(cases,events);
 assert.equal(gate.ready,false);assert.deepEqual(gate.failed,["QA-DIAG-001"]);
});

test("regression comparator flags failing and missing cases without rewriting saved evidence",()=>{
 const old=[
  {testId:"QA-DIAG-001",kind:"ManualResult",atUtc:"2026-11-05T10:00:00Z",payload:{executionId:"qaex-1",status:"Pass"}},
  {testId:"QA-AUTH-001",kind:"ManualResult",atUtc:"2026-11-05T10:01:00Z",payload:{executionId:"qaex-2",status:"Pass"}},
  {testId:"QA-CAT-001",kind:"ManualResult",atUtc:"2026-11-05T10:02:00Z",payload:{executionId:"qaex-3",status:"Fail"}},
 ];
 const current=[
  {testId:"QA-DIAG-001",kind:"ManualResult",atUtc:"2026-11-06T10:00:00Z",payload:{executionId:"qaex-4",status:"Fail"}},
 ];
 const r=compareQaRunResults(old,current);
 assert.deepEqual(r.map(x=>({id:x.testId,to:x.to})),[
   {id:"QA-DIAG-001",to:"Fail"},
   {id:"QA-AUTH-001",to:"Not run"}
 ]);
 assert.equal(r[0].baselineExecutionId,"qaex-1");
 assert.equal(old[0].payload.status,"Pass");
});
test("same-catalog historical runs have bounded read-only regression endpoint",async()=>{
 const h=harness();
 const previous=(await (await h.call("POST","runs",{client_request_id:"run-regression-prev01"})).json()).run;
 const current=(await (await h.call("POST","runs",{client_request_id:"run-regression-now01"})).json()).run;
 await h.call("POST","runs/"+previous.runId+"/results",{
  client_request_id:"event-regression-prev01",testId:"QA-AUTH-001",status:"Pass",
  notes:"Pass from older run"
 });
 const r=await h.call("GET","runs/"+current.runId+"/regressions?baseline="+previous.runId);
 const body=await r.json();
 assert.equal(r.status,200);
 assert.equal(body.regressions.length,1);
 assert.equal(body.regressions[0].to,"Not run");
 assert.equal(h.rows.get(QA_EVENTS_TABLE).length,1);
});

test("catalog-integrity auto assertion records observed schema, not guessed Pass",async()=>{
  const h=harness(),created=await (await h.call("POST","runs",{client_request_id:"ui-run-cat-0001"})).json();
  const result=await (await h.call("POST","runs/"+created.run.runId+"/execute/QA-CAT-001",
    {client_request_id:"ui-check-catalog01"})).json();
  assert.equal(result.event.payload.status,"Pass");
  assert.equal(result.event.payload.evidence[0].totalTests,88);
  assert.equal(result.event.payload.evidence[0].invalidCount,0);
  assert.equal(result.event.payload.requiresHumanApproval,true);
});
test("Airtable canonical QA run assertion only passes on observed canonical row",async()=>{
  const h=harness(),created=await (await h.call("POST","runs",{client_request_id:"ui-run-at-00001"})).json();
  const found=await (await h.call("POST","runs/"+created.run.runId+"/execute/QA-AT-001",
    {client_request_id:"ui-check-at-00001"})).json();
  assert.equal(found.event.payload.status,"Pass");
  assert.equal(found.event.payload.evidence[0].runId,created.run.runId);
  assert.equal(found.event.payload.evidence[0].source,"Airtable");
  assert.ok(found.event.payload.evidence[0].recordId);
});
