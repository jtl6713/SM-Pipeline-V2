import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../studio-web/assets/story-first-workspace.js",import.meta.url),"utf8");
const code=source.slice(source.indexOf("  function syncImageDecisionControls()"),source.indexOf("  // ElevenLabs video generation"));
function harness({fail=false,cancel=false}={}) {
  const current={busy:false,imageDecision:null,story:{scenes:[{generated_master_id:"aipre123",media:cancel?"clip":"still"}]}};
  let release,posts=0;
  const waiting=new Promise(resolve=>{release=resolve;});
  const buttons=["accept","decline"].map(imageAction=>({dataset:{imageAction},setAttribute(){}}));
  const message={classList:{remove(){},add(){}}};
  const group={dataset:{storyImageReview:"aipre123"},querySelectorAll:()=>buttons,querySelector:()=>message};
  const document={querySelectorAll:()=>[group]};
  const decide=new Function("current","document","save","call","reloadIdea","report","sceneUrl","assertProfile","confirm",code+";return decideGenerated;")(current,document,()=>waiting,async()=>{posts++;if(fail)throw Error("network error");},async()=>{},()=>{},()=>"/scene",()=>"rec123",()=>!cancel);
  return {current,buttons,message,decide,release,posts:()=>posts};
}
test("image review disables both buttons synchronously and suppresses repeat taps",async()=>{
  const h=harness(); const first=h.decide(0,"accept");
  assert.equal(h.buttons[0].textContent,"Accepting Image…");
  assert.ok(h.buttons.every(b=>b.disabled));
  assert.equal(h.message.hidden,false);
  await h.decide(0,"accept"); await h.decide(0,"decline");
  h.release(); await first;
  assert.equal(h.posts(),1); assert.ok(h.buttons.every(b=>!b.disabled));
});
test("failed registration restores controls and shows verification guidance",async()=>{
  const h=harness({fail:true});const pending=h.decide(0,"accept");h.release();
  await assert.rejects(pending,/Reopen the saved Idea/);
  assert.ok(h.buttons.every(b=>!b.disabled));
  assert.equal(h.message.hidden,false);assert.match(h.message.textContent,/verify/);
});
test("cancelled still-image override does not lock or submit",async()=>{
  const h=harness({cancel:true});await h.decide(0,"accept");
  assert.equal(h.current.imageDecision,null);assert.equal(h.posts(),0);
});
