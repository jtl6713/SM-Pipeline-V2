import test from "node:test";
import assert from "node:assert/strict";
import {createSupabaseQaLedger,QA_RUNS_TABLE,QA_EVENTS_TABLE} from "./qa-supabase-ledger.mjs";

const ENV={
  SUPABASE_URL:"https://vkwvscgisqsbuwagdvtb.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY:"test-not-a-real-secret"
};
const sampleRun=(n)=>({
  record_id:"qa-sb-"+n,run_id:"qa-11111111-1111-4111-8111-111111111111",
  catalog_revision:"test-revision",environment:"development",deployment:{worker:"x",ui:"y",runner:"z"},
  created_by:"recTEST",created_at_utc:"2026-11-06T05:50:33.000Z",status:"Open",
  idempotency_key:"run:key-"+n,payload_hash:"a".repeat(64)
});
const sampleEvent={
  record_id:"qa-sb-event-1",run_id:"qa-11111111-1111-4111-8111-111111111111",
  execution_id:"qaex-22222222-2222-4222-8222-222222222222",
  test_id:"QA-DIAG-001",event_kind:"RunFinalized",actor_id:"recTEST",
  recorded_at_utc:"2026-11-06T05:50:53.000Z",
  payload_json:{decision:"Incomplete",notes:"Synthetic test"},
  idempotency_key:"RunFinalized:key-1",payload_hash:"b".repeat(64)
};
function json(data,status=200) {
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}});
}

test("requires server credential and an exact HTTPS Supabase origin",()=>{
  for(const bad of [
    {...ENV,SUPABASE_URL:"http://vkwvscgisqsbuwagdvtb.supabase.co"},
    {...ENV,SUPABASE_URL:"https://vkwvscgisqsbuwagdvtb.supabase.co.evil.test"},
    {...ENV,SUPABASE_URL:"https://vkwvscgisqsbuwagdvtb.supabase.co/foo"},
    {...ENV,SUPABASE_SERVICE_ROLE_KEY:""}
  ]) assert.throws(()=>createSupabaseQaLedger(bad),/QA ledger/);
});

test("lists bounded canonical Supabase run rows with precise filtering and cursor",async()=>{
  const requests=[];
  const ledger=createSupabaseQaLedger(ENV,async(url,options)=>{
    requests.push({url,options});
    const u=new URL(url);
    assert.equal(u.pathname,"/rest/v1/studio_qa_runs");
    assert.equal(u.searchParams.get("run_id"),"eq.qa-11111111-1111-4111-8111-111111111111");
    assert.equal(u.searchParams.get("limit"),"3");
    assert.equal(u.searchParams.get("offset"),"0");
    assert.equal(options.method,"GET");
    assert.equal(options.headers.apikey,ENV.SUPABASE_SERVICE_ROLE_KEY);
    return json([sampleRun("1"),sampleRun("2"),sampleRun("3")]);
  });
  const page=await ledger.listPage(QA_RUNS_TABLE,"Run ID",
    "qa-11111111-1111-4111-8111-111111111111",2);
  assert.equal(page.records.length,2);
  assert.equal(page.offset,"2");
  assert.equal(page.records[0].fields["Created At UTC"],"2026-11-06T05:50:33.000Z");
  assert.equal(page.records[0].fields["Deployment JSON"],
    '{"worker":"x","ui":"y","runner":"z"}');
  assert.equal(requests.length,1);
  await assert.rejects(()=>ledger.listPage(QA_RUNS_TABLE,"Bogus","x"),/Unknown QA ledger filter/);
  await assert.rejects(()=>ledger.listPage(QA_RUNS_TABLE,null,null,101),/Unbounded/);
  await assert.rejects(()=>ledger.listPage(QA_RUNS_TABLE,null,null,5,"1;delete"),/Invalid QA pagination/);
});

test("inserts a new run once with server-side identity readback and only POST",async()=>{
  const writes=[];
  const ledger=createSupabaseQaLedger(ENV,async(url,options)=>{
    const u=new URL(url);
    assert.equal(u.pathname,"/rest/v1/studio_qa_runs");
    assert.equal(options.method,"POST");
    assert.equal(options.headers.Prefer,"return=representation");
    const body=JSON.parse(options.body);
    writes.push(body);
    return json([sampleRun("new")],201);
  });
  const saved=await ledger.add(QA_RUNS_TABLE,{
    "Run ID":"qa-11111111-1111-4111-8111-111111111111",
    "Catalog Revision":"test-revision","Environment":"development",
    "Deployment JSON":'{"worker":"x","ui":"y","runner":"z"}',
    "Created By":"recTEST","Created At UTC":"2026-11-06T05:50:33.000Z",
    "Status":"Open","Idempotency Key":"run:key-new","Payload Hash":"a".repeat(64)
  });
  assert.equal(saved.id,"qa-sb-new");
  assert.equal(writes.length,1);
  assert.equal(writes[0].catalog_revision,"test-revision");
  assert.equal(writes[0].idempotency_key,"run:key-new");
  assert.equal(writes[0].legacy_record_id,undefined);
});

test("rejects mismatched persisted run identity, deployment or actor after POST",async()=>{
  const base={
    "Run ID":"qa-11111111-1111-4111-8111-111111111111",
    "Catalog Revision":"test-revision","Environment":"development",
    "Deployment JSON":'{"worker":"x","ui":"y","runner":"z"}',
    "Created By":"recTEST","Created At UTC":"2026-11-06T05:50:33.000Z",
    "Status":"Open","Idempotency Key":"run:key-new","Payload Hash":"a".repeat(64)
  };
  for (const altered of [
    {created_by:"different-actor"},
    {deployment:{worker:"different",ui:"y",runner:"z"}},
    {catalog_revision:"incorrect-revision"},
    {run_id:"qa-99999999-9999-4999-8999-999999999999"},
    {created_at_utc:"2026-11-07T05:50:33.000Z"}
  ]) {
    const ledger=createSupabaseQaLedger(ENV,async()=>json([{
      ...sampleRun("new"),...altered
    }],201));
    await assert.rejects(()=>ledger.add(QA_RUNS_TABLE,base),
      e=>e.status===503&&/readback field mismatch/.test(String(e)));
  }
});

test("JSONB key reordering does not falsely reject committed QA evidence",async()=>{
  const ledger=createSupabaseQaLedger(ENV,async()=>json([{
    ...sampleEvent,payload_json:{notes:"Synthetic test",decision:"Incomplete"}
  }],201));
  const saved=await ledger.add(QA_EVENTS_TABLE,{
    "Execution ID":sampleEvent.execution_id,"Run ID":sampleEvent.run_id,
    "Test ID":sampleEvent.test_id,"Event Kind":sampleEvent.event_kind,
    "Actor ID":sampleEvent.actor_id,"Recorded At UTC":sampleEvent.recorded_at_utc,
    "Payload JSON":JSON.stringify(sampleEvent.payload_json),
    "Idempotency Key":sampleEvent.idempotency_key,"Payload Hash":sampleEvent.payload_hash
  });
  assert.equal(saved.id,sampleEvent.record_id);
});

test("reads event JSON unchanged and fails closed on missing canonical rows",async()=>{
  const ledger=createSupabaseQaLedger(ENV,async()=>json([sampleEvent]));
  const page=await ledger.listPage(QA_EVENTS_TABLE,"Run ID",sampleEvent.run_id,10);
  assert.equal(page.offset,null);
  assert.equal(page.records[0].fields["Event Kind"],"RunFinalized");
  assert.equal(JSON.parse(page.records[0].fields["Payload JSON"]).decision,"Incomplete");
  const empty=createSupabaseQaLedger(ENV,async()=>json([]));
  await assert.rejects(()=>empty.add(QA_EVENTS_TABLE,{
    "Execution ID":sampleEvent.execution_id,"Run ID":sampleEvent.run_id,
    "Test ID":sampleEvent.test_id,"Event Kind":sampleEvent.event_kind,
    "Actor ID":sampleEvent.actor_id,"Recorded At UTC":sampleEvent.recorded_at_utc,
    "Payload JSON":JSON.stringify(sampleEvent.payload_json),
    "Idempotency Key":sampleEvent.idempotency_key,"Payload Hash":sampleEvent.payload_hash
  }),/readback not committed/);
});

test("refuses a uniqueness conflict and never hides provider failure details",async()=>{
  const ledger=createSupabaseQaLedger(ENV,async()=>json({message:"confidential"},409));
  await assert.rejects(async()=>{
    await ledger.add(QA_EVENTS_TABLE,{
      "Execution ID":sampleEvent.execution_id,"Run ID":sampleEvent.run_id,
      "Test ID":sampleEvent.test_id,"Event Kind":sampleEvent.event_kind,
      "Actor ID":sampleEvent.actor_id,"Recorded At UTC":sampleEvent.recorded_at_utc,
      "Payload JSON":JSON.stringify(sampleEvent.payload_json),
      "Idempotency Key":sampleEvent.idempotency_key,"Payload Hash":sampleEvent.payload_hash
    });
  },e=>e.status===409&&!String(e).includes("confidential"));
});
