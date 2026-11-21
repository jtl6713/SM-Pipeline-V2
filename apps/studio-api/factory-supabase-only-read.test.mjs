import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runInNewContext } from "node:vm";

const dir = path.dirname(fileURLToPath(import.meta.url));
const get = (file) => readFileSync(path.join(dir,file),"utf8");

function extractExportedFunction(source, name) {
  const start = source.indexOf("export async function " + name + "(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:" + name + "*/",start);
  assert.ok(start >= 0 && end > start, "missing source function: " + name);
  return source.slice(start,end).replace(/^export /,"");
}

function makeFunction(source, name, sandbox) {
  return runInNewContext(
    extractExportedFunction(source,name) + "\n" + name + ";",
    { ...sandbox, console: { warn(){}, error(){} } },
  );
}

class HttpError extends Error {
  constructor(status,message) {
    super(message);
    this.status = status;
  }
}

test("Supabase configured: failed canonical Factory pack never issues Airtable list requests",async()=>{
  let airtableCalls=0;
  const queue=makeFunction(get("worker-functions-04.mjs"),"getStudioOperationsQueue",{
    HttpError,
    studioWriteSource:()=> "supabase",
    studioFactoryOpsReadSource:()=> "supabase",
    readOpsQueueControls:async()=> ({}),
    listSupabaseFactoryDeskPack:async()=>{throw Error("canonical Supabase unavailable");},
    listRecords:async()=>{airtableCalls++;throw Error("retired Airtable read");},
    listContentProfileRecords:async()=>{airtableCalls++;throw Error("retired profiles");},
  });
  await assert.rejects(
    queue({},{} ,{}),
    (err)=>err.status===503 && /No legacy source fallback permitted/.test(err.message),
  );
  assert.equal(airtableCalls,0);
});

test("Supabase write authority with stale Factory read-source flag fails without touching Airtable",async()=>{
  let reads=0;
  const queue=makeFunction(get("worker-functions-04.mjs"),"getStudioOperationsQueue",{
    HttpError,
    studioWriteSource:()=> "supabase",
    studioFactoryOpsReadSource:()=> "airtable",
    readOpsQueueControls:async()=>{reads++;return {};},
    listRecords:async()=>{reads++;return [];},
  });
  await assert.rejects(
    queue({}, {},{}),
    (err)=>err.status===503 && /No Airtable fallback/.test(err.message),
  );
  assert.equal(reads,0);
});

test("Supabase photo-waiting idea pack error is optional missing ideas, never Airtable",async()=>{
  let legacy=0;
  const ideas=makeFunction(get("worker-functions-02.mjs"),"loadFactoryIdeaCandidates",{
    studioWriteSource:()=> "supabase",
    studioFactoryOpsReadSource:()=> "supabase",
    listSupabaseFactoryDeskPack:async()=>{throw Error("Supabase read temporarily unavailable");},
    listRecords:async()=>{legacy++;throw Error("Airtable should not be queried");},
    listContentProfileRecords:async()=>{legacy++;throw Error("profiles should not be queried");},
  });
  const result=await ideas({});
  assert.deepEqual(Array.from(result),[]);
  assert.equal(legacy,0);
});

test("Supabase write authority but stale idea read flag does not fall back",async()=>{
  let legacy=0;
  const ideas=makeFunction(get("worker-functions-02.mjs"),"loadFactoryIdeaCandidates",{
    studioWriteSource:()=> "supabase",
    studioFactoryOpsReadSource:()=> "airtable",
    listRecords:async()=>{legacy++;throw Error("Airtable should not be queried");},
    listContentProfileRecords:async()=>{legacy++;throw Error("profiles should not be queried");},
  });
  assert.deepEqual(Array.from(await ideas({})),[]);
  assert.equal(legacy,0);
});

test("healthy empty Supabase optional ideas response remains empty without legacy source",async()=>{
  let calls=0;
  const ideas=makeFunction(get("worker-functions-02.mjs"),"loadFactoryIdeaCandidates",{
    studioWriteSource:()=> "supabase",
    studioFactoryOpsReadSource:()=> "supabase",
    listSupabaseFactoryDeskPack:async()=>({profiles:[],photoWaitIdeas:[]}),
    listRecords:async()=>{calls++;throw Error("no Airtable");},
  });
  assert.deepEqual(Array.from(await ideas({})),[]);
  assert.equal(calls,0);
});

test("legacy fallback disabled under Supabase by source assertions",()=>{
  const ops=extractExportedFunction(get("worker-functions-04.mjs"),"getStudioOperationsQueue");
  const ideas=extractExportedFunction(get("worker-functions-02.mjs"),"loadFactoryIdeaCandidates");
  assert.match(ops,/queueReadSource = "supabase"/);
  assert.doesNotMatch(ops,/supabase factory\/ops queue read failed; falling back to Airtable/);
  assert.match(ops,/studioWriteSource\(env\) === "supabase" && studioFactoryOpsReadSource\(env\) !== "supabase"/);
  assert.match(ideas,/return \[\];\s+\}\s+\}\s+if \(!env\.AIRTABLE_IDEA_TABLE_ID\)/);
  assert.doesNotMatch(ideas,/supabase factory idea candidates failed; falling back to Airtable/);
});
