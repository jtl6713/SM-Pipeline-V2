import test from "node:test";import assert from "node:assert/strict";
import fs from "node:fs";import {fileURLToPath} from "node:url";import path from "node:path";
const dir=path.dirname(fileURLToPath(import.meta.url));
const worker=fs.readFileSync(path.join(dir,"worker.js"),"utf8");
const service=fs.readFileSync(path.join(dir,"worker-functions-04.mjs"),"utf8");
const html=fs.readFileSync(path.join(dir,"../studio-web/index.html"),"utf8");
const ui=fs.readFileSync(path.join(dir,"../studio-web/assets/exception-recovery.js"),"utf8");
test("conversation and preflight routes require server-side tenant_admin",()=>{
 for(const [name,handler] of [
  ["isAdminExceptionConversationRoute","getStudioExceptionRecoveryConversation"],
  ["isAdminExceptionPreflightRoute","getStudioExceptionRecoveryPreflight"]]){
  const start=worker.indexOf("if ("+name+") {");
  const end=worker.indexOf("\n      if (",start+5);
  assert.ok(start>0&&end>start);
  const snippet=worker.slice(start,end);
  assert.match(snippet,/requirePermission\(authorization, "tenant_admin"\)/);
  assert.ok(snippet.includes(handler));
 }
 assert.match(worker,/if \(request.method === "POST"\) assertWriteRequest\(request, env\)/);
});
test("conversation writes only to dedicated Airtable table and is CAS-fenced",()=>{
 const start=service.indexOf("export async function getStudioExceptionRecoveryConversation");
 const end=service.indexOf("/*__STUDIO_WORKER_END:getStudioExceptionRecoveryConversation__*/",start);
 const snippet=service.slice(start,end);
 assert.match(snippet,/withExceptionConversationLock\(env.STUDIO_MEDIA,outputRecordId/);
 assert.match(snippet,/airtableFetch\(env,EXCEPTION_MESSAGES_TABLE,""/);
 assert.doesNotMatch(snippet,/airtableFetch\(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId,\s*\{/);
 assert.doesNotMatch(snippet,/studioPublish|enqueueStudioProductionJob|factoryDeleteDeskItem/);
});
test("administrator UI is permission-gated and escapes messages through DOM text nodes",()=>{
 assert.match(html,/id="navExceptionRecovery" hidden/);
 assert.match(ui,/session\?\.authenticated===true&&session\?\.authorized===true/);
 assert.match(ui,/permissions\?\.tenant_admin===true/);
 assert.match(ui,/panel\.append\(elem\("strong"/);
 assert.match(ui,/elem\("p",message\.message\|\|""\)/);
 assert.doesNotMatch(ui,/innerHTML/);
 assert.match(ui,/can\s*run|are disabled|actions remain disabled/);
});
test("recovery UI JS/CSS follows the existing Studio release key",()=>{
 const css=html.match(/exception-recovery\.css\?v=([^"&]+)/)?.[1];
 const js=html.match(/exception-recovery\.js\?v=([^"&]+)/)?.[1];
 const release=html.match(/id="uiBuildLabel">UI build (\d+\.\d+\.\d+)/)?.[1];
 assert.ok(css&&js&&release);
 assert.equal(css,js);
 assert.ok(css.startsWith(release+"-"));
});

test("bulk preview limits selection and uses only read-only output preflight",()=>{
 assert.match(html,/id="ercPreviewSelected" disabled/);
 assert.match(ui,/state\.selectedBulk\.size>=5/);
 assert.match(ui,/getJson\("\/api\/admin\/exception-recovery\/"\+id\+"\/preflight"\)/);
 assert.match(ui,/inspection only; publishing and state changes remain disabled/);
 assert.doesNotMatch(ui,/fetch\([^)]*\/publish/);
});

test("bulk existing-post recovery reuses individually audited admin actions and stops on uncertainty",()=>{
 assert.match(html,/id="ercRecoverSelected" disabled/);
 assert.match(ui,/state\.selectedBulk\.size>=5/);
 assert.match(ui,/ercRecoverSelected.*addEventListener\("click",recoverSelected\)/);
 const start=ui.indexOf("  async function recoverSelected()");
 const end=ui.indexOf("  function freshClientRequestId()",start);
 assert.ok(start>0&&end>start);
 const bulk=ui.slice(start,end);
 assert.match(bulk,/window\.confirm\(/);
 assert.match(bulk,/Promise\.all\(/);
 assert.match(bulk,/\/preflight"/);
 assert.match(bulk,/\/receipt"/);
 assert.match(bulk,/administrator_recovery_actions_enabled!==true/);
 assert.match(bulk,/receipt\?\.verified_public/);
 assert.match(bulk,/preflight\.held\|\|preflight\.lock_active/);
 assert.match(bulk,/finalize_existing_facebook_post/);
 assert.match(bulk,/reconcile_verified_existing_receipt/);
 assert.match(bulk,/client_request_id:freshClientRequestId\(\)/);
 assert.match(bulk,/result\.durable_recovery_recorded!==true/);
 assert.match(bulk,/break; \/\/ Do not reissue an approval after an uncertain write/);
 assert.doesNotMatch(bulk,/\/publish|\/delete|\/reschedule|studioPulseFb0|studioPulseFb1|studioPulseFb2/);
});
test("live receipt and full-count endpoints stay administrator-only GET",()=>{
 for(const [key,handler] of [
  ["isAdminExceptionReceiptRoute","getStudioExceptionRecoveryReceipt"],
  ["isAdminExceptionCountsRoute","getStudioExceptionRecoveryCounts"],
 ]) {
  const start=worker.indexOf("if ("+key+") {");
  const end=worker.indexOf("\n      if (",start+5);
  assert.ok(start>0&&end>start);
  const route=worker.slice(start,end);
  assert.match(route,/requirePermission\(authorization, "tenant_admin"\)/);
  assert.match(route,/request.method !== "GET"/);
  assert.ok(route.includes(handler));
  assert.doesNotMatch(route,/assertWriteRequest|PATCH|POST/);
 }
});
test("mutating FB3 route requires POST, admin, origin safety and no other stage",()=>{
 const start=worker.indexOf("if (isAdminExceptionActionRoute) {");
 const end=worker.indexOf("\n      if (",start+5);
 assert.ok(start>0&&end>start);
 const code=worker.slice(start,end);
 assert.match(code,/requirePermission\(authorization, "tenant_admin"\)/);
 assert.match(code,/request.method !== "POST"/);
 assert.match(code,/assertWriteRequest\(request, env\)/);
 assert.match(code,/runStudioExceptionRecoveryAction\(request, env, authorization\)/);
 const handler=service.slice(service.indexOf("export async function runStudioExceptionRecoveryAction"),service.indexOf("/*__STUDIO_WORKER_END:runStudioExceptionRecoveryAction__*/"));
 assert.match(handler,/withOutputApprovalLock\(env.STUDIO_MEDIA/);
 assert.match(handler,/verifyRemote:async\(row\)=>exceptionRecoveryReadProvider/);
 assert.match(handler,/finalizeExistingPost:async\(row\)=>studioPulseFb3\(env,row\)/);
 assert.match(handler,/persistVerifiedRecoveryInAirtable/);
 assert.doesNotMatch(handler,/studioPulseFb0|studioPulseFb1|studioPulseFb2|studioPublish|DELETE/);
});
test("canonical output scan paginates full Airtable table with Home mapping",()=>{
 const code=service.slice(service.indexOf("export async function getStudioExceptionRecoveryCounts"),service.indexOf("/*__STUDIO_WORKER_END:getStudioExceptionRecoveryCounts__*/"));
 assert.match(code,/scanOutstandingFailedOutputs/);
 assert.match(code,/listRecordsPage\(env,env.AIRTABLE_OUTPUT_TABLE_ID/);
 assert.match(code,/reconcileExceptionCensus\(all,mapOutput/);
 assert.doesNotMatch(code,/limit:\s*250|method:\s*"PATCH"|method:\s*"POST"/);
});
test("explicit complete source census does not trigger another fresh Quality Agent full-table scan",()=>{
 const section=service.slice(service.indexOf("export async function getStudioExceptionRecoveryCounts"),
   service.indexOf("/*__STUDIO_WORKER_END:getStudioExceptionRecoveryCounts__*/"));
 assert.match(section,/filterFormula:"\\{Test_Run_ID\\}=BLANK\\(\\)"/);
 assert.match(section,/qaFailed:null,qaPastDue:null/);
 assert.doesNotMatch(section,/loadStudioFailedOutputSnapshot\\(env,\\{fresh:true\\}\\)/);
 assert.match(section,/quality_agent_scan_at:null/);
 assert.match(section,/home_snapshot_comparison/);
});
test("UI requires explicit receipt inspection and post-ID confirmation before FB3",()=>{
 assert.match(html,/id="ercReconcileCounts"/);
 assert.match(ui,/ercReconcileCounts.*addEventListener\("click",reconcileAllCounts\)/);
 assert.match(ui,/Verify live provider receipt/);
 assert.match(ui,/window.confirm\(title\+" #"/);
 assert.match(ui,/action,confirm_output_id:outputId,confirm_post_id:postId/);
 assert.match(ui,/submitApproved\("finalize_existing_facebook_post",finalize\)/);
 assert.match(ui,/submitApproved\("reconcile_verified_existing_receipt",repair\)/);
});

test("action execution is gated by a durable exact-ID admin approval readback",()=>{
 const start=service.indexOf("export async function runStudioExceptionRecoveryAction");
 const end=service.indexOf("/*__STUDIO_WORKER_END:runStudioExceptionRecoveryAction__*/",start);
 const handler=service.slice(start,end);
 const approved=handler.indexOf("actionApprovalAudit(");
 const persistent=handler.indexOf("records:[{fields:approvalAudit}]");
 const readback=handler.indexOf("readback.some(item=>item.event_key===approvalAudit.Event_Key)");
 const engine=handler.indexOf("executeFb3AdminRecovery(");
 assert.ok(approved>=0&&persistent>approved&&readback>persistent&&engine>readback);
 assert.match(handler,/already_processed_request/);
 assert.match(handler,/admin_approval_recorded:true/);
 assert.match(ui,/client_request_id:freshClientRequestId\(\)/);
});

test("read-only deployment cannot trigger approved FB3 or status-repair mutations",()=>{
 const start=service.indexOf("export async function runStudioExceptionRecoveryAction");
 const end=service.indexOf("/*__STUDIO_WORKER_END:runStudioExceptionRecoveryAction__*/",start);
 const handler=service.slice(start,end);
 const gate=handler.indexOf("if(!exceptionRecoveryMutationsEnabled(env))");
 const body=handler.indexOf("await readJsonBody(request)");
 const lock=handler.indexOf("withOutputApprovalLock");
 const audit=handler.indexOf("actionApprovalAudit(");
 assert.ok(gate>0&&gate<body&&body<audit&&audit<lock);
 assert.match(service,/administrator_recovery_actions_enabled:exceptionRecoveryMutationsEnabled\(env\)/);
 assert.match(ui,/rolloutOn=preflight\?\.administrator_recovery_actions_enabled===true/);
 assert.match(ui,/const fb3=rolloutOn&&exact/);
 assert.match(ui,/const statusRepair=rolloutOn&&exact/);
});

test("complete canonical census populates administrator list without authorizing publication",()=>{
 assert.match(ui,/function applyCanonicalCensus\(census\)/);
 assert.match(ui,/Array\.isArray\(census\.exception_items\)/);
 assert.match(ui,/getJson\("\/api\/admin\/exception-recovery\/counts"\)/);
 assert.match(ui,/actions_enabled:false/);
 assert.match(ui,/qa_only_unreconciled/);
 assert.match(html,/value="remote_identity_unverified"/);
 assert.match(html,/value="held_deferred"/);
});
test("reconciliation captures stable Home generation before and after full census",()=>{
 assert.match(service,/compareHomeSnapshotToExceptionCensus/);
 const section=service.slice(service.indexOf("export async function getStudioExceptionRecoveryCounts"),
   service.indexOf("/*__STUDIO_WORKER_END:getStudioExceptionRecoveryCounts__*/"));
 const before=section.indexOf("const homeBefore=");
 const scan=section.indexOf("scanOutstandingFailedOutputs(");
 const after=section.indexOf("const homeAfter=");
 const comparison=section.indexOf("compareHomeSnapshotToExceptionCensus(");
 assert.ok(before>0&&before<scan&&scan<after&&after<comparison);
});

test("ordinary inventory load uses R2 without launching a full Airtable census",()=>{
 const section=service.slice(service.indexOf("export async function getStudioExceptionRecoveryCounts"),
   service.indexOf("/*__STUDIO_WORKER_END:getStudioExceptionRecoveryCounts__*/"));
 const skip=section.indexOf("if(!fresh)");
 const cache=section.indexOf("readExceptionRecoveryCensusCache(");
 const scan=section.indexOf("scanOutstandingFailedOutputs(");
 assert.ok(skip>0&&cache>skip&&cache<scan);
 assert.match(section,/No fresh verified census cache is available/);
 assert.match(section,/persistExceptionRecoveryCensusCache\(env\.STUDIO_MEDIA,data\)/);
 assert.match(section,/filterFormula:"\{Test_Run_ID\}=BLANK\(\)",pageSize:100,requireUnique:true/);
});
