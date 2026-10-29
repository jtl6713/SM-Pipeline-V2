import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
const start=worker.indexOf("const isChicagoReviewPost =");
const end=worker.indexOf("const allowedMethod =",start);
assert.ok(start>=0 && end>start,"The real Phase-2A POST guard must exist");
const predicate=Function("request","url",worker.slice(start,end)+"\nreturn isChicagoReviewPost;");
const allowed=(path,method="POST")=>predicate({method},{pathname:path});
const output="rec0uVrVeiUM6shp9";

test("authenticated exact #8447 recovery route reaches its handler through the global POST guard",()=>{
 assert.equal(allowed("/api/internal/rendering-review/factory-handoff"),true);
 assert.equal(allowed("/internal/rendering-review/factory-handoff"),true);
});
test("reviewer acceptance/retry handoff is not blocked by Phase-2A",()=>{
 assert.equal(allowed("/api/rendering-review/outputs/"+output+"/factory-handoff"),true);
 assert.equal(allowed("/api/rendering-review/outputs/"+output+"/approve"),true);
});
test("no broad method or arbitrary route exemption",()=>{
 assert.equal(allowed("/api/internal/rendering-review/other-action"),false);
 assert.equal(allowed("/api/rendering-review/outputs/999/factory-handoff"),false);
 assert.equal(allowed("/api/internal/rendering-review/factory-handoff","GET"),false);
});
