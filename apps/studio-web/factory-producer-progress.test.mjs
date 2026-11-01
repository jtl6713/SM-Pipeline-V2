import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {runInNewContext} from "node:vm";

const ui = fs.readFileSync(new URL("./assets/factory-producer-progress.js", import.meta.url), "utf8");
const factory = fs.readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const backend = fs.readFileSync(new URL("../studio-api/worker-functions-02.mjs", import.meta.url), "utf8");
const ID = "recProducer1234567", REV = "fpr-1234abcdef";

function harness(sharedStore = new Map()) {
  const panel = {hidden:true};
  const list = {innerHTML:"",replaceChildren(){this.innerHTML=""}};
  const page = {classList:{contains:()=>true}};
  const elements = {factoryProducerProgress:panel,factoryProducerProgressList:list,"page-factory":page};
  let reply = {ok:true,record:{id:ID,status:"Draft",revision:{id:REV,state:"pending"},job:{id:REV,step:"themes",quality_passed:null}}};
  let fetchCount = 0;
  const listeners = new Map();
  const document = {
    hidden:false,getElementById:id=>elements[id] || null,
    addEventListener:(name,callback)=>listeners.set(name,callback),
  };
  const localStorage = {
    getItem:key=>sharedStore.get(key) ?? null,
    setItem:(key,value)=>sharedStore.set(key,value),
  };
  const window = {};
  const context = {
    document,window,localStorage,Date,JSON,String,Number,Math,RegExp,Array,Object,
    setInterval:()=>0,
    fetch:async(url,options)=>{
      fetchCount++;
      assert.equal(options.credentials,"same-origin");
      assert.equal(options.cache,"no-store");
      assert.match(url,/fields=producer-progress/);
      return {ok:true,json:async()=>reply};
    },
  };
  runInNewContext(ui,context);
  const rows=()=>JSON.parse(sharedStore.get("studio.factory.producer-progress.v1") || "[]");
  return {ui:window.StudioFactoryProducerProgress,panel,list,rows,store:sharedStore,
    setReply:value=>{reply=value},fetchCount:()=>fetchCount,listeners};
}

test("Factory Producer activity survives refresh and uses actual Airtable revision states", async () => {
  const first = harness();
  first.ui.begin({requestId:ID,title:"Chicago Night Reel"});
  assert.equal(first.rows()[0].status,"submitting");
  assert.equal(first.panel.hidden,false);
  first.ui.accept({requestId:ID,title:"Chicago Night Reel",result:{producer_queued:true,producer_revision_id:REV}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(first.rows()[0].status,"preparing");
  assert.match(first.list.innerHTML,/Producer preparing changes/);
  const reloaded = harness(first.store);
  assert.equal(reloaded.panel.hidden,false,"reload must immediately restore previous receipt");
  assert.match(reloaded.list.innerHTML,/Chicago Night Reel/);
  reloaded.setReply({ok:true,record:{id:ID,status:"Promoted",revision:{id:REV,state:"pending"},job:{id:REV,step:"done",quality_passed:null}}});
  await reloaded.ui.refresh(true);
  assert.equal(reloaded.rows()[0].status,"quality","job done alone is not a QA pass");
  assert.match(reloaded.list.innerHTML,/Quality Agent verification/);
  reloaded.setReply({ok:true,record:{id:ID,status:"Promoted",revision:{id:REV,state:"completed"},job:{id:REV,step:"done",quality_passed:true}}});
  await reloaded.ui.refresh(true);
  assert.equal(reloaded.rows()[0].status,"completed");
  assert.match(reloaded.list.innerHTML,/Ready for your review/);
  assert.doesNotMatch(reloaded.list.innerHTML,/class="factory-producer-wait"/);
});

test("A failed progress read never invents Producer failure or loses the saved receipt", async () => {
  const app=harness();
  app.ui.accept({requestId:ID,title:"City clip",result:{producer_queued:true,producer_revision_id:REV}});
  await new Promise(resolve=>setImmediate(resolve));
  app.setReply({ok:false,json:async()=>({message:"Server temporary error"})});
  await app.ui.refresh(true);
  assert.notEqual(app.rows()[0].status,"completed");
  assert.notEqual(app.rows()[0].status,"needs_attention");
  assert.match(app.rows()[0].error,/Progress check unavailable/);
  assert.equal(app.panel.hidden,false);
});

test("Lost submission acknowledgement never reuses an older completed revision", async () => {
  const app=harness();
  app.ui.begin({requestId:ID,title:"New unconfirmed change"});
  app.ui.uncertain({requestId:ID,title:"New unconfirmed change",message:"Connection lost"});
  app.setReply({ok:true,record:{id:ID,status:"Promoted",revision:{id:REV,state:"completed"},job:{id:REV,step:"done",quality_passed:true}}});
  await app.ui.refresh(true);
  assert.equal(app.rows()[0].status,"uncertain");
  assert.equal(app.rows()[0].revision_id,"");
  assert.match(app.list.innerHTML,/unconfirmed/);
});

test("Manual Producer feedback displays correct next step, never a phantom render", () => {
  const app=harness();
  app.ui.accept({requestId:ID,title:"Manual revision",result:{producer_queued:false,producer_reason:"Select media first."}});
  assert.equal(app.rows()[0].status,"manual");
  assert.match(app.list.innerHTML,/manual Producer edits required/);
  assert.doesNotMatch(app.list.innerHTML,/factory-producer-wait/);
});

test("Factory progress state is anchored outside the disposable desk and uses safe HTML", () => {
  assert.match(html,/id="factoryProducerProgress"/);
  assert.match(html,/id="factoryProducerProgressList"[^>]*aria-live="polite"/);
  assert.match(html,/factory-producer-progress\.js/);
  assert.match(factory,/StudioFactoryProducerProgress\?\.begin/);
  assert.match(factory,/StudioFactoryProducerProgress\?\.accept/);
  assert.match(factory,/StudioFactoryProducerProgress\?\.uncertain/);
  const app=harness();
  app.ui.begin({requestId:ID,title:'<img src=x onerror=alert(1)>'});
  assert.match(app.list.innerHTML,/&lt;img/);
  assert.doesNotMatch(app.list.innerHTML,/<img/);
});

test("Producer progress GET uses tenant-checked request and only a bounded projection",()=>{
  const start=backend.indexOf("export async function getProductionRequest(");
  const end=backend.indexOf("/*__STUDIO_WORKER_END:getProductionRequest__*/",start);
  const section=backend.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.ok(section.indexOf("loadAuthorizedProductionRequest(")<section.indexOf('=== "producer-progress"'));
  assert.match(section,/factory-producer-revision id=/);
  assert.match(section,/quality_passed/);
  assert.match(section,/quality_errors/);
  assert.doesNotMatch(section,/production_notes:\s*notes/);
});
