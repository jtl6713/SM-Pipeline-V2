import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const service=fs.readFileSync(path.join(here,"worker-functions-04.mjs"),"utf8");
const settings=fs.readFileSync(path.join(here,"worker-functions-03.mjs"),"utf8");
const source=fs.readFileSync(path.join(here,"supabase-pipeline-reads.mjs"),"utf8");
function part(text,from,to){
 const start=text.indexOf(from),end=text.indexOf(to,start+from.length);
 assert.ok(start>=0&&end>start,"function boundary not found: "+from);
 return text.slice(start,end);
}
test("provider owner chain must read output, content and profile from Supabase only",()=>{
 const code=part(service,"async function exceptionRecoveryReadVerifiedOutput(", "async function exceptionRecoveryReadAuthenticatedProvider(");
 assert.match(code,/studioWriteSource\(env\)!=="supabase"/);
 assert.match(code,/readSupabaseShapedOutput\(env,recordId\)/);
 assert.match(code,/readSupabaseShapedContentItem\(env,contentId\)/);
 assert.match(code,/readSupabaseContentProfile\(env,links\[0\]\)/);
 assert.match(code,/verifyRecoveryProfileChain\(row,content,profile\)/);
 assert.match(code,/withVerifiedRecoveryProfile\(row,chain\)/);
 assert.doesNotMatch(code,/airtableFetch|listRecords\(|method:\s*["'](?:POST|PATCH|DELETE)/);
});
test("receipt GET uses a validated Supabase chain and never reads output from Airtable",()=>{
 const code=part(service,"export async function getStudioExceptionRecoveryReceipt(", "/*__STUDIO_WORKER_END:getStudioExceptionRecoveryReceipt__*/");
 assert.match(code,/const source=await exceptionRecoveryReadVerifiedOutput\(env,id\)/);
 assert.match(code,/exceptionRecoveryReadAuthenticatedProvider\(env,row\)/);
 assert.match(code,/exceptionRecoveryReadProvider\(env,row,source.profile\)/);
 assert.match(code,/authoritative_state_unchanged:unchanged/);
 assert.match(code,/no_output_write:true/);
 assert.doesNotMatch(code,/airtableFetch|studioPulse|publishNow|method:\s*["'](?:POST|PATCH|DELETE)/);
});
test("authenticated and generic provider GETs cannot fall back to legacy Pipeline Settings",()=>{
 const provider=part(service,"async function exceptionRecoveryReadAuthenticatedProvider(", "async function appendPublicationRecoveryAudit(");
 assert.match(provider, /requireSupabase:true/g);
 assert.doesNotMatch(provider,/listRecords\(env,"Pipeline Settings"/);
 const generic=part(service,"async function exceptionRecoveryReadProvider(", "async function exceptionRecoveryReadVerifiedOutput(");
 assert.match(generic,/const strict = Boolean\(verifiedProfile\)/);
 assert.match(generic,/requireSupabase:strict/);
 const scoped=part(settings,"export async function studioActivePipelineSettings(", "/*__STUDIO_WORKER_END:studioActivePipelineSettings__*/");
 assert.match(scoped,/options\.requireSupabase === true/);
 assert.match(scoped,/throw new Error\("Supabase profile-scoped Pipeline Settings unavailable"\)/);
 assert.ok(scoped.indexOf("options.requireSupabase")<scoped.indexOf('rows = await listRecords(env, "Pipeline Settings"'));
});
test("canonical Supabase Content Item helper preserves owner FK",()=>{
 const code=part(source,"export async function readSupabaseShapedContentItem(", "/**\n * Read the exact Platform Outputs belonging to one Content Item");
 assert.match(code,/studioSupabaseConfigured\(env\)/);
 assert.match(code,/return readContentRow\(env, id\)/);
 const contentReader=part(source,"async function readContentRow(", "function tightenSideFormula(");
 assert.match(contentReader,/content_items\?airtable_record_id=eq./);
 assert.match(contentReader,/airtableShapedContentFromSupabase\(flattenContentRow\(row\)\)/);
});
test("legacy Airtable status-reconciliation cron is disabled under Supabase writer",()=>{
 const code=part(service,"export async function studioPublicationRecoveryCron(", "/*__STUDIO_WORKER_END:studioPublicationRecoveryCron__*/");
 assert.match(code,/if \(studioWriteSource\(env\) === "supabase"\)/);
 assert.match(code,/legacy_airtable_recovery_writer_disabled/);
 assert.ok(code.indexOf("legacy_airtable_recovery_writer_disabled")<code.indexOf("runPublicationRecovery(env"));
});
