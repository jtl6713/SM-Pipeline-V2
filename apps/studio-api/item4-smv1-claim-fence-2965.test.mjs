import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
const start=source.indexOf("export async function item4RequeueStaleProcessing(");
const end=source.indexOf("/*__STUDIO_WORKER_END:item4RequeueStaleProcessing__",start);
assert.ok(start>=0 && end>start);
function harness(studio,phase6) {
  let writes=0;
  const fn=vm.runInNewContext("("+source.slice(start,end).trim().replace(/^export /,"")+")",{
    studioWriteSource:()=>studio,studioPhase6WriteSource:()=>phase6,
    item4QueueStatus:r=>r.fields.Transfer_Status,f:(r,k)=>r.fields[k],
    airtableFetch:async()=>{writes++;return null;},ITEM4_VARIANT_QUEUE_TABLE:"fixture",
    console,
  });
  return {fn,writes:()=>writes};
}
for(const [studio,phase6] of [["supabase","supabase"],["legacy","supabase"],["supabase","legacy"]]){
  test("Supabase Processing claims never requeued by Worker clock: "+studio+"/"+phase6,async()=>{
    const h=harness(studio,phase6);
    const rows=[{id:"recFixture",fields:{Transfer_Status:"Processing",Last_Attempt_At:"2020-01-01T00:00:00Z",Attempt_Count:7}}];
    assert.equal(await h.fn({},rows),rows);
    assert.equal(h.writes(),0);
  });
}
test("legacy stale recovery behavior remains unchanged",async()=>{
  const h=harness("legacy","legacy");
  await h.fn({},[{id:"recFixture",fields:{Transfer_Status:"Processing",Last_Attempt_At:"2020-01-01T00:00:00Z",Attempt_Count:1}}]);
  assert.equal(h.writes(),1);
});
