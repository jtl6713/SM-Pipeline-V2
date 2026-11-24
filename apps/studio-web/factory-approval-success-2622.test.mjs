import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("./assets/factory-desk.js",import.meta.url),"utf8");
const from=src.indexOf("  function factoryBatchActiveRow(");
const to=src.indexOf("  function factoryBatchRecountActive(",from);
const active=new Function(src.slice(from,to)+"\nreturn factoryBatchActiveRow;")();
test("terminal failures are not active, pending retries are active",()=>{
  assert.equal(active({status:"completed",pending_count:0,failed_count:3}),false);
  assert.equal(active({status:"completed",pending_count:0,failed_count:0}),false);
  assert.equal(active({status:"running",pending_count:3,failed_count:0}),true);
  assert.equal(active({status:"queued",pending_count:0}),true);
});
test("Factory separates approved percentage from processed count in aggregate, batch and profile",()=>{
  assert.match(src,/aggregateTotal \? Math\.round\(100 \* totals\.approved \/ aggregateTotal\)/);
  assert.match(src,/\$\{aggregatePercent\}% approved/);
  assert.match(src,/\$\{aggregateDone\} of \$\{aggregateTotal\} processed/);
  assert.match(src,/100 \* Number\(row\.approved_count \|\| 0\) \/ row\.total/);
  assert.match(src,/100\*Number\(child\.approved_count\|\|0\)\/child\.total/);
  assert.match(src,/Completed with failures/);
});
