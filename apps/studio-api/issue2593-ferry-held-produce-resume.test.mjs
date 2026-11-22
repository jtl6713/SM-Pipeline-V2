import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const code=fs.readFileSync(new URL("./worker-functions-02.mjs", import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("./worker.js", import.meta.url),"utf8");

test("2593 final job resume has exact blocked-error, output and hold preconditions",()=>{
 const a=code.indexOf("export async function studioResumeFreeSkylineHeldProduceCron(");
 const b=code.indexOf("/*__STUDIO_WORKER_END:studioResumeFreeSkylineHeldProduceCron__*/",a);
 assert.ok(a>0&&b>a,"extractable isolated recovery helper is present");
 const body=code.slice(a,b);
 for(const id of ["reczvqjo1xs2jYXn0","recbxdvQZTDm61Ctq"]) assert.ok(body.includes(id));
 assert.match(body,/String\(job\?\.step \|\| ""\) !== "blocked"/);
 assert.match(body,/tblSITCujCsJTNcDe/);
 assert.match(body,/expected_two_output_links_missing/);
 assert.match(body,/output_identity_or_link_mismatch/);
 assert.match(body,/publishing_hold_not_verified/);
 assert.match(body,/Do_Not_Publish/);
 assert.match(body,/Auto_Publish_Enabled/);
 assert.match(body,/Published_At/);
 assert.match(body,/Platform_Post_URL/);
 assert.ok(body.indexOf('onlyIf:new Headers({"If-None-Match":"*"})')<
    body.indexOf("enqueueStudioProductionJob(env, target.request, { resume:true })"));
 assert.doesNotMatch(body,/publishPlatform|publishNow|approveOutput|scheduleOutput|postToMeta/);
});

test("2593 final resume is a one-shot minute cron, no broad retries or client approval",()=>{
 assert.match(worker,/studioResumeFreeSkylineHeldProduceCron,/);
 assert.match(worker,/\/\*__STUDIO_WORKER_EXTRACT:studioResumeFreeSkylineHeldProduceCron__\*\//);
 assert.match(worker,/ctx\.waitUntil\(studioResumeFreeSkylineHeldProduceCron\(env\)/);
 assert.match(worker,/version: "0\.10\.1015-ferry-held-resume-2593"/);
 const body=code.slice(code.indexOf("export async function studioResumeFreeSkylineHeldProduceCron("),
    code.indexOf("/*__STUDIO_WORKER_END:studioResumeFreeSkylineHeldProduceCron__*/"));
 assert.match(body,/one_shot_receipt_exists/);
 assert.match(body,/failed_no_auto_retry/);
 assert.doesNotMatch(body,/do_not_publish\s*=\s*false/);
});
