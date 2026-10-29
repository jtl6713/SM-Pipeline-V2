import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Execute the actual routing predicate extracted from the Worker, not a copied
// approximation of its allowlist. The handler still performs authentication,
// output ownership and session validation separately.
const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
const start=worker.indexOf("const isChicagoReviewPost =");
const end=worker.indexOf("const allowedMethod =",start);
assert.ok(start>=0&&end>start,"Global Phase-2A selector must exist");
const isAllowed=Function("request","url",worker.slice(start,end)+"\nreturn isChicagoReviewPost;");
const allow=(path,method="POST")=>isAllowed({method},{pathname:path});
const record="rec0uVrVeiUM6shp9";
test("exact protected handoff variants may reach authenticated handler",()=>{
  assert.equal(allow("/api/internal/rendering-review/factory-handoff"),true);
  assert.equal(allow("/internal/rendering-review/factory-handoff"),true);
});
test("reviewer recovery and creative acceptance pass the Phase-2A method gate",()=>{
  assert.equal(allow("/api/rendering-review/outputs/"+record+"/factory-handoff"),true);
  assert.equal(allow("/api/rendering-review/outputs/"+record+"/approve"),true);
});
test("no arbitrary POST or method bypass",()=>{
  assert.equal(allow("/api/internal/rendering-review/random"),false);
  assert.equal(allow("/api/rendering-review/outputs/invalid/factory-handoff"),false);
  assert.equal(allow("/api/internal/rendering-review/factory-handoff","GET"),false);
});
