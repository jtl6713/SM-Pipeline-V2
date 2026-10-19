import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "worker-functions-03.mjs"), "utf8");
const start = source.indexOf("export async function findDraftProductionRequestForIdea(");
const end = source.indexOf("/*__STUDIO_WORKER_END:findDraftProductionRequestForIdea__*/", start);
assert.ok(start>=0 && end>start, "photo-wait direct draft lookup is extracted");
const fn = source.slice(start,end);

function harness({linked=[],requests={},missing=false}={}) {
  const calls=[];
  const idea={id:"recIdea000000000", fields:{"Production Requests":linked}};
  const f=(row,key)=>row?.fields?.[key];
  const airtableFetch=async(_env,table,id)=>{
    calls.push({table,id});
    if(table==="Idea Candidates") return idea;
    if(requests[id]) return requests[id];
    throw Error("linked request unavailable");
  };
  const preferAuthoritativeProductionRequest=rows=>rows[0]||null;
  const find=new Function("airtableFetch","f","PRODUCTION_REQUEST_TABLE",
    "preferAuthoritativeProductionRequest","listOpenProductionRequests",
    fn+"\nreturn findDraftProductionRequestForIdea;"
  )(airtableFetch,f,"Production Requests",preferAuthoritativeProductionRequest,
    ()=>{throw Error("global scan must never run");});
  return {find, calls,env:{AIRTABLE_IDEA_TABLE_ID:"Idea Candidates"}};
}
const draft=id=>({id,fields:{Idea_Candidate:["recIdea000000000"],Request_Status:"Draft",Active:true}});
test("manual Find Images Now with no Production Request skips global list scans",async()=>{
  const h=harness();
  assert.equal(await h.find(h.env,"recIdea000000000"),null);
  assert.deepEqual(h.calls,[{table:"Idea Candidates",id:"recIdea000000000"}]);
});
test("linked Production Request is loaded directly and is not duplicated",async()=>{
  const h=harness({linked:["recDraft00000000"],requests:{"recDraft00000000":draft("recDraft00000000")}});
  assert.equal((await h.find(h.env,"recIdea000000000")).id,"recDraft00000000");
  assert.equal(h.calls.length,2);
});
test("unreadable linked request fails closed",async()=>{
  const h=harness({linked:["recMissing000000"]});
  await assert.rejects(h.find(h.env,"recIdea000000000"),/linked request unavailable/);
});
test("cron enumerates waiting queue before selecting a bounded fair slice",()=>{
  const start=source.indexOf("export async function runWaitingIdeaPhotoMatches(");
  const end=source.indexOf("/*__STUDIO_WORKER_END:runWaitingIdeaPhotoMatches__*/",start);
  const segment=source.slice(start,end);
  assert.match(segment,/limit: 500/);
  assert.match(segment,/prioritizeWaitingIdeaPhotoScans\(candidates, \{ limit \}\)/);
  assert.match(segment,/fields: \["Studio_Photo_Match_JSON", "Production_Config_Notes"\]/);
});
