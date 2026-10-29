import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
const begin=worker.indexOf("const isChicagoReviewPost =");
const end=worker.indexOf("const allowedMethod =",begin);
const selector=worker.slice(begin,end);
test("protected and user-initiated Factory handoff POST paths reach their route",()=>{
  assert.ok(begin>=0 && end>begin);
  assert.ok(selector.includes("messages|approve|factory-handoff"));
  assert.ok(selector.includes("ig-dispatch-claim|factory-handoff"));
  assert.ok(selector.includes('request.method === "POST"'));
});
test("global method gate recognizes the exact review selector",()=>{
  assert.ok(worker.slice(end,end+90).includes("isChicagoReviewPost ||"));
  assert.ok(selector.includes("$/.test(url.pathname)"));
});
