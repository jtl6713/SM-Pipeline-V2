import test from "node:test";
import assert from "node:assert/strict";
import {handleQaApi,computeQaGate,compareQaRunResults,qaEvidenceIntegrityBlockers,QA_RUNS_TABLE,QA_EVENTS_TABLE,verifiedRunnerVersion} from "./qa-http.mjs";

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
test("QA environment selection cannot silently send staging tests to production",async()=>{
  const h=harness();
  await assert.rejects(h.call("POST","runs",{environment:"staging",client_request_id:"environment-12345678"}),
    /not configured on this Worker/);
  assert.equal(h.rows.get(QA_RUNS_TABLE).length,0);
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


test("Runner attestation allows only the fixed health origin and Airtable source",async()=>{
  let calls=0;
  const healthy=async()=>{
    calls++;
    return new Response(JSON.stringify({ok:true,service:"pipeline-runner",
      version:"2026-11-05-video-watermark-scale-v2",studio_write_source:"airtable"}),{status:200});
  };
  assert.equal(await verifiedRunnerVersion({PIPELINE_RUNNER_URL:"https://unknown.example.com"},healthy),"unverified");
  assert.equal(calls,0);
  assert.equal(await verifiedRunnerVersion({PIPELINE_RUNNER_URL:"https://pipeline.chicagoshining.com"},healthy),
    "2026-11-05-video-watermark-scale-v2");
  assert.equal(calls,1);
  const invalid=async()=>new Response(JSON.stringify({ok:true,service:"pipeline-runner",
    version:"v1",studio_write_source:"supabase"}),{status:200});
  assert.equal(await verifiedRunnerVersion({PIPELINE_RUNNER_URL:"https://pipeline.chicagoshining.com"},invalid),
    "unverified");
  assert.equal(await verifiedRunnerVersion({PIPELINE_RUNNER_URL:"https://pipeline.chicagoshining.com"},
    async()=>{throw new Error("offline");}),"unverified");
});


test("historical runs remain readable but a newer catalog refuses writes and release approval",async()=>{
  const h=harness();
  const created=(await (await h.call("POST","runs",{client_request_id:"run-catalog-drift-001"})).json()).run;
  const canonical=h.rows.get(QA_RUNS_TABLE).find(x=>x.fields["Run ID"]===created.runId);
  canonical.fields["Catalog Revision"]="2026-10-31.1";
  const history=await (await h.call("GET","runs/"+created.runId)).json();
  assert.equal(history.ok,true);
  assert.equal(history.run.catalogRevision,"2026-10-31.1");
  const gate=await (await h.call("GET","runs/"+created.runId+"/gate")).json();
  assert.equal(gate.gate.ready,false);
  assert.equal(gate.gate.decision,"Incomplete");
  assert.ok(gate.gate.deploymentBlockers.some(x=>/catalog revision changed/i.test(x)));
  await assert.rejects(()=>h.call("POST","runs/"+created.runId+"/results",{
    testId:"QA-AUTH-001",status:"Pass",notes:"Legacy case",client_request_id:"result-old-catalog001"
  }),/QA catalog revision changed/);
  await assert.rejects(()=>h.call("POST","runs/"+created.runId+"/execute/QA-DIAG-001",{
    client_request_id:"assert-old-catalog01"
  }),/QA catalog revision changed/);
  assert.equal(h.rows.get(QA_EVENTS_TABLE).length,0);
});

test("run gate detects an event whose catalog provenance no longer matches the run",async()=>{
  const h=harness();
  const created=(await (await h.call("POST","runs",{client_request_id:"run-event-version-001"})).json()).run;
  const posted=await h.call("POST","runs/"+created.runId+"/results",{
    client_request_id:"event-mismatched-001",testId:"QA-AUTH-001",status:"Pass",
    notes:"Observed authorized and denied API responses."
  });
  assert.equal(posted.status,201);
  const event=h.rows.get(QA_EVENTS_TABLE)[0];
  const payload=JSON.parse(event.fields["Payload JSON"]);
  payload.catalogVersion="obsolete-version";
  event.fields["Payload JSON"]=JSON.stringify(payload);
  const gate=await (await h.call("GET","runs/"+created.runId+"/gate")).json();
  assert.equal(gate.gate.ready,false);
  assert.ok(gate.gate.deploymentBlockers.some(x=>/mismatched catalog revision/i.test(x)));
});


test("a completed QA run is finalized by append-only event, never by rewriting the run row",async()=>{
  const h=harness();
  const created=(await (await h.call("POST","runs",{client_request_id:"qa-finish-run-001"})).json()).run;
  const payload={decision:"Incomplete",notes:"Integration acceptance still pending",client_request_id:"qa-finish-event-001"};
  const first=await h.call("POST","runs/"+created.runId+"/finalize",payload);
  assert.equal(first.status,201);
  const result=await first.json();
  assert.equal(result.event.kind,"RunFinalized");
  assert.equal(result.event.payload.decision,"Incomplete");
  const saved=(await (await h.call("GET","runs/"+created.runId)).json());
  assert.equal(saved.run.status,"Finalized");
  assert.equal(saved.run.releaseDecision,"Incomplete");
  assert.equal(saved.run.finalizedAtUtc,"2026-11-06T12:00:00.000Z");
  const canonical=h.rows.get(QA_RUNS_TABLE)[0].fields;
  assert.equal(canonical.Status,"Open","run row must stay immutable");
  assert.equal(h.rows.get(QA_EVENTS_TABLE).length,1,"one append only final event");
  const gate=(await (await h.call("GET","runs/"+created.runId+"/gate")).json()).gate;
  assert.equal(gate.ready,false);
  assert.ok(gate.deploymentBlockers.some(x=>/finalized without release approval/i.test(x)));
  const replay=await h.call("POST","runs/"+created.runId+"/finalize",payload);
  assert.equal(replay.status,200);assert.equal((await replay.json()).reused,true);
  assert.equal(h.rows.get(QA_EVENTS_TABLE).length,1);
  await assert.rejects(()=>h.call("POST","runs/"+created.runId+"/results",{
    client_request_id:"qa-closed-result-001",testId:"QA-AUTH-001",
    status:"Pass",notes:"Should not write"
  }),/run is finalized/);
  await assert.rejects(()=>h.call("POST","runs/"+created.runId+"/finalize",{
    decision:"Rejected",notes:"Changed mind",client_request_id:"qa-finish-event-002"
  }),/already finalized/);
  assert.equal(h.rows.get(QA_EVENTS_TABLE).length,1);
});
test("release Approved cannot finalize an incomplete or unattested run",async()=>{
  const h=harness();
  const created=(await (await h.call("POST","runs",{client_request_id:"qa-reject-approval-001"})).json()).run;
  await assert.rejects(()=>h.call("POST","runs/"+created.runId+"/finalize",{
    decision:"Approved",notes:"",client_request_id:"qa-finalize-deny-001"
  }),/Cannot approve QA release/);
  assert.equal(h.rows.get(QA_EVENTS_TABLE).length,0);
});


test("no manual Pass can silently clear a release gate without observed notes or evidence",async()=>{
  const h=harness();
  const created=(await (await h.call("POST","runs",{client_request_id:"run-pass-proof-001"})).json()).run;
  await assert.rejects(()=>h.call("POST","runs/"+created.runId+"/results",{
    client_request_id:"result-no-evidence-001",testId:"QA-AUTH-001",status:"Pass"
  }),/Pass requires observed notes or evidence/);
  assert.equal(h.rows.get(QA_EVENTS_TABLE).length,0);
  const evidenceOnly=await h.call("POST","runs/"+created.runId+"/results",{
    client_request_id:"result-evidence-only001",testId:"QA-AUTH-001",status:"Pass",
    evidence:[{kind:"reference",reference:"CI run 12345, unauthorized access 403"}]
  });
  assert.equal(evidenceOnly.status,201);
  const saved=await evidenceOnly.json();
  assert.equal(saved.event.payload.evidence.length,1);
});

test("release evidence audit blocks imported blank manual Pass and untrusted automated Pass",()=>{
 const executionId="qaex-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const manual={testId:"QA-AUTH-001",kind:"ManualResult",actorId:"recADMIN00000001",
 atUtc:"2026-11-06T11:00:00.000Z",payload:{executionId,status:"Pass",notes:"",evidence:[]}};
 const automated={testId:"QA-DIAG-001",kind:"AutomatedObservation",actorId:"recADMIN00000001",
 atUtc:"2026-11-06T11:01:00.000Z",payload:{executionId,status:"Pass",source:"automated",
 requiresHumanApproval:true,evidence:[]}};
 const blockers=qaEvidenceIntegrityBlockers([manual,automated]);
 assert.ok(blockers.some(x=>x.includes("QA-AUTH-001")&&x.includes("notes or evidence")));
 assert.ok(blockers.some(x=>x.includes("QA-DIAG-001")&&x.includes("trusted evidence")));
 assert.deepEqual(qaEvidenceIntegrityBlockers([
 {...manual,payload:{...manual.payload,notes:"Verified 401 from anonymous request"}},
 {...automated,payload:{...automated.payload,evidence:[{httpStatus:200,workerVersion:"0.10.765"}]}},
 ]),[]);
});
test("HTTP release gate exposes missing canonical Pass evidence",async()=>{
 const h=harness(),created=await (await h.call("POST","runs",{client_request_id:"run-gate-audit-001"})).json();
 const runId=created.run.runId;
 h.rows.get(QA_EVENTS_TABLE).push({id:"recEXAMPLE0000001",fields:{
 "Execution ID":"qaex-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","Run ID":runId,
 "Test ID":"QA-AUTH-001","Event Kind":"ManualResult",
 "Actor ID":"recADMIN00000001","Recorded At UTC":"2026-11-06T11:05:00.000Z",
 "Payload JSON":JSON.stringify({
 executionId:"qaex-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",status:"Pass",source:"manual",
 notes:"",evidence:[],catalogVersion:created.run.catalogRevision,
 }),
 }});
 const g=await (await h.call("GET","runs/"+runId+"/gate")).json();
 assert.equal(g.gate.ready,false);
 assert.ok(g.gate.deploymentBlockers.some(x=>x.includes("QA-AUTH-001")&&x.includes("notes or evidence")));
});
