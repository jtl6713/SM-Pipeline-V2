import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const home=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(home,"worker-functions-04.mjs"),"utf8");
const admin=source.slice(source.indexOf("export async function getStudioExceptionRecoveryCenter"),
  source.indexOf("/*__STUDIO_WORKER_END:getStudioExceptionRecoveryCenter__"));
test("admin QA exact-ID rerun invokes a genuinely fresh candidate scan when requested",()=>{
 assert.match(admin,/const url = new URL\(request\.url\)/);
 assert.match(admin,/loadStudioFailedOutputSnapshot\(env, \{/);
 assert.match(admin,/fresh: url\.searchParams\.get\("fresh"\) === "1"/);
 assert.match(source,/studioReadCoalesce\(fresh \? "quality-agent-census-fresh:" \+ Date\.now\(\)/);
});
test("the QA freshness option changes neither ordinary reads nor the protected output write gate",()=>{
 assert.match(admin,/get\("fresh"\) === "1"/);
 assert.match(admin,/return respond\(request, env, \{\.\.\.view,items,automation,/);
 const worker=fs.readFileSync(path.join(home,"worker.js"),"utf8");
 assert.match(worker,/getStudioExceptionRecoveryCenter\(request, env\)/);
});
