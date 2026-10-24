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
 assert.match(html,/exception-recovery\.css\?v=0\.6\.757-idea-id-list/);
 assert.match(html,/exception-recovery\.js\?v=0\.6\.757-idea-id-list/);
});
