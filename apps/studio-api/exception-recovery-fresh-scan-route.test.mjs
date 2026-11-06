import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(dir,"worker-functions-04.mjs"),"utf8");
const center=source.slice(source.indexOf("export async function getStudioExceptionRecoveryCenter"),
  source.indexOf("/*__STUDIO_WORKER_END:getStudioExceptionRecoveryCenter__"));
test("admin exact-ID verification bypasses the coalesced Quality Agent scan only when fresh=1",()=>{
 assert.match(center,/const url = new URL\(request\.url\)/);
 assert.match(center,/loadStudioFailedOutputSnapshot\(env, \{/);
 assert.match(center,/fresh: url\.searchParams\.get\("fresh"\) === "1"/);
 assert.match(source,/studioReadCoalesce\(fresh \? "quality-agent-census-fresh:" \+ Date\.now\(\)/);
});
test("ordinary Center navigation remains read-only with cached QA diagnostics",()=>{
 assert.match(center,/get\("fresh"\) === "1"/);
 assert.match(center,/return respond\(request, env, \{\.\.\.view,items,automation,/);
 const worker=fs.readFileSync(path.join(dir,"worker.js"),"utf8");
 assert.match(worker,/getStudioExceptionRecoveryCenter\(request, env\)/);
});
