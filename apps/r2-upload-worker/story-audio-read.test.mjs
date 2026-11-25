import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
globalThis.crypto ??= webcrypto;
const source=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
const {default:worker}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const key="studio/previews/story-voiceover/recABCDEFGHIJKLMN/"+"a".repeat(64)+".mp3";
const data=new TextEncoder().encode("exact bytes");
const digest=Buffer.from(await crypto.subtle.digest("SHA-256",data)).toString("hex");
let reads=0;
const bucket={
  head:async k=>k===key?{size:data.byteLength,etag:"e"}:null,
  get:async(k,opts)=>{reads++;assert.equal(k,key);assert.equal(opts.onlyIf.etagMatches,"e");return {body:true,size:data.byteLength,arrayBuffer:async()=>data.buffer};}
};
const env={PUBLISH_BUCKET:bucket,R2_UPLOAD_WORKER_SECRET:"fixture-secret"};
const request=(k=key,sha=digest,auth=true)=>new Request("https://fixture.invalid/internal/story-audio?"+new URLSearchParams({key:k,sha256:sha}),{headers:auth?{"x-pipeline-secret":"fixture-secret"}:{}});
test("exact authenticated read only",async()=>{
 const response=await worker.fetch(request(),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get("Cache-Control"),"private, no-store");
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),data);
});
test("deny unauthenticated, invalid key and digest before bucket read",async()=>{
 const before=reads;
 assert.equal((await worker.fetch(request(key,digest,false),env)).status,403);
 assert.equal((await worker.fetch(request("publish/private.mp3"),env)).status,400);
 assert.equal((await worker.fetch(request(key,"bad"),env)).status,400);
 assert.equal(reads,before);
});
test("fail closed on missing, mismatched checksum, changed or oversized object",async()=>{
 assert.equal((await worker.fetch(request(key.replace(/a{64}/,"b".repeat(64))),env)).status,404);
 assert.equal((await worker.fetch(request(key,"0".repeat(64)),env)).status,409);
 assert.equal((await worker.fetch(request(),{...env,PUBLISH_BUCKET:{...bucket,get:async()=>({body:null})}})).status,409);
 assert.equal((await worker.fetch(request(),{...env,PUBLISH_BUCKET:{...bucket,head:async()=>({size:8388609})}})).status,413);
});
