import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {protectedReviewRunnerScope as allowed} from "./rendering-review-internal-scope.mjs";

const chicago="recT2rbKX3MF7cVFU",la="recF7UAn0LkMZZrWZ";
const id="recA1B2C3D4E5F6G7";
const output=(profile_id,platform="TikTok",output_type="TikTok Video")=>({
  id,profile_id,platform,output_type
});
const global={
  RENDERING_REVIEW_ENROLL_WRITES_ENABLED:"true",
  RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED:"true",
  RENDERING_REVIEW_INTEGRATION_VERIFIED:"true",
  RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED:"true",
  RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED:"true",
  RENDERING_REVIEW_GLOBAL_MANUAL_ENABLED:"true",
  RENDERING_REVIEW_GLOBAL_RUNNER_VERIFIED:"true",
};

test("global Runner scope supports a real non-Chicago output only with all server gates",()=>{
  assert.equal(allowed(output(la),id,global),true);
  for(const gate of Object.keys(global)){
    assert.equal(allowed(output(la),id,{...global,[gate]:"false"}),false,gate);
  }
  assert.equal(allowed(output(la),id,{}),false);
});
test("original Chicago IG Reel remains scoped to original verified pilot",()=>{
  assert.equal(allowed(output(chicago,"Instagram","Instagram Reel"),id,{}),true);
  assert.equal(allowed(output(chicago),id,{}),false);
});
test("internal media authority rejects cross-output, malformed and missing identities",()=>{
  for(const invalid of [
    output(la,"","TikTok Video"),
    output(la,"TikTok",""),
    {...output(la),id:"recWRONGIDENTITY"},
    {...output(la),profile_id:""},
    {...output(la),profile_id:"not-a-record"},
    {...output(la),id:""},
  ])assert.equal(allowed(invalid,id,global),false);
  assert.equal(allowed(output(la),"recWRONGIDENTITY",global),false);
  assert.equal(allowed(null,id,global),false);
});
test("all three internal lifecycle routes use one shared scope gate",()=>{
  const src=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const clauses=[
    '/internal/rendering-review/claim-render-job',
    '/internal/rendering-review/launch-ledger',
    '/internal/rendering-review/complete-attempt',
  ];
  for(let i=0;i<clauses.length;i++){
    const begin=src.indexOf(clauses[i]);
    const next=i===clauses.length-1?src.indexOf('requireConfig(env);',src.indexOf('// Exact, server-authorized recovery path',begin)):-1;
    assert.ok(begin>=0,clauses[i]);
    const body=i===0?src.slice(begin,src.indexOf('// Write-once launch intent',begin)):
      i===1?src.slice(begin,src.indexOf('// A one-time, authenticated',begin)):
      src.slice(begin,src.indexOf('// Exact, server-authorized recovery path',begin));
    assert.match(body,/protectedReviewRunnerScope\((?:view|output),outputId,env\)/);
  }
});
