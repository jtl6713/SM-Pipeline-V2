import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {deskHealOutputFilter} from "./supabase-pipeline-reads.mjs";
const root=path.dirname(fileURLToPath(import.meta.url));
test("full Supabase overdue query includes Ready to Publish and held outputs",()=>{
 const f=deskHealOutputFilter("approved_past_due_all",{cutoffIso:"2026-11-20T13:00:00Z"});
 assert.match(f,/review_status=eq\.Approved/);
 assert.match(f,/output_status=eq\./);
 assert.match(f,/publish_status=neq\.Published/);
 assert.match(f,/scheduled_post_date\.lt\./);
 assert.match(f,/studio_scheduled_at\.lt\./);
 assert.doesNotMatch(f,/do_not_publish=eq\.false/);
 assert.doesNotMatch(f,/Ready%20to%20Schedule|Ready to Schedule|publish_status=eq\./);
});
test("unknown clock fails closed",()=>{
 assert.throws(()=>deskHealOutputFilter("approved_past_due_all",{cutoffIso:"nonsense"}),/UTC clock/);
});
test("protected admin triage does not dispatch provider writes",()=>{
 const main=fs.readFileSync(path.join(root,"worker.js"),"utf8");
 const impl=fs.readFileSync(path.join(root,"worker-functions-04.mjs"),"utf8");
 assert.match(main,/isAdminApprovedPastDueTriageRoute/);
 const gate=main.slice(main.indexOf("if (isAdminApprovedPastDueTriageRoute)"),main.indexOf("if (isAdminExceptionRecoveryRoute)"));
 assert.match(gate,/requirePermission\(authorization, "tenant_admin"\)/);
 assert.match(gate,/request.method !== "GET"/);
 const start=impl.indexOf("export async function getStudioApprovedPastDueTriage(");
 const end=impl.indexOf("STUDIO_WORKER_END:getStudioApprovedPastDueTriage",start);
 const snippet=impl.slice(start,end);
 assert.match(snippet,/listSupabaseDeskHealPage/);
 assert.match(snippet,/classifyApprovedPastDueOutput/);
 assert.doesNotMatch(snippet,/studioDispatchApprovedPublishNow|studioPulse|airtableFetch|method:\s*["']PATCH|fetch\(/);
});
