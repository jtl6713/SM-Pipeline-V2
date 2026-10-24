import test from "node:test";import assert from "node:assert/strict";
import {withExceptionConversationLock} from "./exception-recovery-lock.mjs";
test("leased conversation write blocks concurrent same-output POST",async()=>{
 const locks=new Map();let rev=0;
 const bucket={
  async get(k){const v=locks.get(k);return v?{etag:String(v.rev),text:async()=>JSON.stringify(v.data)}:null;},
  async put(k,s,opt){const was=locks.get(k),expected=opt?.onlyIf?.etagMatches;
    if(was&&expected!==String(was.rev))return null;
    if(!was&&expected)return null;
    if(!was&&opt?.onlyIf?.get?.("If-None-Match")!=="*")return null;
    locks.set(k,{data:JSON.parse(s),rev:++rev});return {key:k};
  }
 };
 let release;let started;const begun=new Promise(r=>started=r);
 const task=withExceptionConversationLock(bucket,"recAAAAAAAAAAAAAA",async()=>{started();await new Promise(r=>release=r);return "committed";});
 await begun;
 await assert.rejects(withExceptionConversationLock(bucket,"recAAAAAAAAAAAAAA",()=>false),e=>e.status===409);
 release();assert.equal(await task,"committed");
 assert.equal(await withExceptionConversationLock(bucket,"recAAAAAAAAAAAAAA",()=> "again"),"again");
});
test("lock fails closed without durable R2 storage",async()=>{
 await assert.rejects(withExceptionConversationLock(null,"recAAAAAAAAAAAAAA",()=>true),e=>e.status===503);
});
