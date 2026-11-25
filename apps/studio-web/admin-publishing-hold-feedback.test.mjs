import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("./assets/admin-publishing-holds.js",import.meta.url),"utf8");
const start=source.indexOf("  async function releaseHold("),end=source.indexOf("  function renderRow(",start);
assert.ok(start>=0&&end>start);
function harness({note="Verified source and release for review",confirm=true,response,error}={}){
 const record={id:"recABCDEFGHIJKLMN",number:11192,profile_name:"Chicago",releasable:true,revision:"r1",hold_set_at:"h1"};
 const check={checked:false,disabled:false},feedback={textContent:"",classList:{toggle(){}}};
 const more={hidden:false,disabled:false},calls=[];
 const receipt={id:record.id,released:true,automatic_publishing_enabled:false,publication_triggered:false,approved:false,scheduled:false,audit:{operation:"released",reason:note?.trim()}};
 const fn=new Function("prompt","confirm","request","showStatus","more","AbortController","setTimeout","clearTimeout",
 "let hasMore=true;"+source.slice(start,end)+"return releaseHold;")(
 ()=>note,()=>confirm,async(path,init)=>{calls.push({path,init});if(error)throw error;return response??receipt;},
 ()=>{},more,AbortController,setTimeout,clearTimeout);
 return {run:()=>fn(record,check,feedback),check,feedback,calls,more};
}
test("short reason or cancelled confirmation has visible row feedback without POST",async()=>{
 for(const [options,expected] of [[{note:"short"},/12–500/],[{note:null},/cancelled/],[{confirm:false},/cancelled/]]){
 const h=harness(options);await h.run();assert.equal(h.calls.length,0);assert.equal(h.check.checked,true);assert.match(h.feedback.textContent,expected);
 }
});
test("server rejection remains visible beside checked hold",async()=>{
 const h=harness({error:Error("Hold changed since it was loaded")});await h.run();
 assert.equal(h.calls.length,1);assert.equal(h.check.checked,true);assert.match(h.feedback.textContent,/Hold changed/);assert.match(h.feedback.textContent,/Refresh or check History/);
});
test("verified release persists on row and stops unsafe pagination",async()=>{
 const h=harness();await h.run();assert.equal(h.calls.length,1);assert.equal(h.check.checked,false);assert.equal(h.check.disabled,true);
 assert.equal(h.more.disabled,true);assert.match(h.feedback.textContent,/Released #11192/);
 assert.equal(JSON.parse(h.calls[0].init.body).revision,"r1");
});
test("ambiguous response or timeout never displays success or retries",async()=>{
 for(const options of [{response:{ok:true}},{error:Object.assign(Error("abort"),{name:"AbortError"})}]){
 const h=harness(options);await h.run();assert.equal(h.calls.length,1);assert.equal(h.check.checked,true);assert.match(h.feedback.textContent,/Release not confirmed/);
 }
});
