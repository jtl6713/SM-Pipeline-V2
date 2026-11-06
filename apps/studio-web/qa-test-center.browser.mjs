// Hermetic QA Test Center browser smoke: no Cloudflare, Airtable, publishing or network egress.
// Run: node apps/studio-web/qa-test-center.browser.mjs (requires Playwright Chromium).
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import {once} from "node:events";
import {chromium} from "playwright";

const here=new URL("./",import.meta.url);
const html=fs.readFileSync(new URL("index.html",here),"utf8");
const script=fs.readFileSync(new URL("assets/qa-test-center.js",here),"utf8");
const nav=html.match(/<button[^>]+id="navQaTestCenter"[^>]*>[\s\S]*?<\/button>/)?.[0];
const start=html.indexOf('<section id="page-qa-test-center"');
const end=html.indexOf('<section id="page-exception-recovery"',start);
assert.ok(nav&&start!==-1&&end>start,"real QA navigation and page markup required");
const qaMarkup=html.slice(start,end);
const fixture='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
  '<nav>'+nav+'</nav>'+qaMarkup+'</body></html>';
const server=http.createServer((request,response)=>{
  response.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
  response.end(fixture);
});
server.listen(0,"127.0.0.1");
await once(server,"listening");
const base="http://127.0.0.1:"+server.address().port;
const id="qa-00000000-0000-4000-8000-000000000001";
const eventId="qaex-00000000-0000-4000-8000-000000000001";
const at="2026-11-06T12:00:00.000Z";
let run=null,events=[],nextEvent=1,unexpected=0;
const posted=[];
const testDefinition={id:"QA-AUTH-001",title:"Admin access control",
  category:"AUTH",severity:"Critical",automation:"manual",
  prerequisites:["Tenant administrator"],steps:[{order:1,instruction:"Verify authorized and denied sessions"}],
  expectedResults:["Admin sees catalog and non-admin receives 403"],version:1};
function gate(){
  const result=events.filter(e=>e.kind==="ManualResult").slice(-1)[0];
  const pass=result?.payload?.status==="Pass";
  return {ready:false,decision:"Incomplete",total:88,
    passed:pass?["QA-AUTH-001"]:[],failed:[],
    blocked:pass?[]:["QA-AUTH-001"],pendingHuman:[],
    deploymentBlockers:["Other cases not executed"],waivers:[]};
}
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try{
  const page=await browser.newPage();
  page.on("dialog",dialog=>dialog.accept());
  page.on("pageerror",error=>{unexpected++;console.error("Browser error",error.message);});
  await page.route("**/api/admin/qa/**",async route=>{
    const request=route.request(),u=new URL(request.url()),path=u.pathname;
    const method=request.method(),raw=request.postData()||"";
    let body;try{body=raw?JSON.parse(raw):{};}catch{body={};}
    posted.push({method,path,body});
    const reply=(data,status=200)=>route.fulfill({status,contentType:"application/json",
      body:JSON.stringify({ok:true,...data})});
    if(method==="GET"&&path.endsWith("/catalog"))
      return reply({catalogVersion:"2026-11-06.2",tests:[testDefinition],
        executionEnvironment:"production",safeAutomations:[]});
    if(path.endsWith("/runs")&&method==="POST"){
      run={runId:id,createdAtUtc:at,createdBy:"recADMIN00000001",environment:"production",
        deployment:{worker:"test-build",ui:"test-ui",runner:"unverified"},
        catalogRevision:"2026-11-06.2",status:"Open"};
      return reply({run},201);
    }
    if(path.endsWith("/runs")&&method==="GET")
      return reply({runs:run?[run]:[],next_cursor:null});
    if(path.endsWith("/runs/"+id)&&method==="GET")
      return reply({run,events});
    if(path.endsWith("/runs/"+id+"/gate")&&method==="GET")
      return reply({run,gate:gate()});
    if(path.endsWith("/runs/"+id+"/results")&&method==="POST"){
      if(!body.notes?.trim()&&!(body.evidence||[]).length)
        return reply({error:"Pass requires notes or evidence"},400);
      const event={record_id:"recTEST00000001",executionId:eventId,runId:id,
        testId:body.testId,kind:"ManualResult",actorId:"recADMIN00000001",
        atUtc:at,payload:{executionId:eventId,status:body.status,
          notes:body.notes,evidence:body.evidence,catalogVersion:"2026-11-06.2"}};
      events.push(event);nextEvent++;return reply({event},201);
    }
    if(path.endsWith("/runs/"+id+"/finalize")&&method==="POST"){
      if(run.status==="Finalized")return reply({error:"already finalized"},409);
      const e={record_id:"recTEST00000002",executionId:"qaex-00000000-0000-4000-8000-000000000002",
        runId:id,testId:"QA-RUN",kind:"RunFinalized",actorId:"recADMIN00000001",atUtc:at,
        payload:{decision:body.decision,notes:body.notes}};
      events.push(e);run={...run,status:"Finalized",finalizedAtUtc:at,releaseDecision:body.decision};
      return reply({event:e},201);
    }
    unexpected++;
    return reply({error:"Unexpected QA API path: "+method+" "+path},404);
  });
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.addScriptTag({content:script});
  await page.locator("#navQaTestCenter").waitFor({state:"visible"});
  await page.locator("#navQaTestCenter").click();
  await page.locator(".qa-case").waitFor({state:"visible"});
  assert.equal(await page.locator(".qa-case").count(),1);
  assert.equal(await page.locator("#qaFinalizeRun").isDisabled(),true);
  await page.locator("#qaSearch").fill("QA-AUTH-001");
  await page.locator("#qaStartRun").click();
  await page.waitForFunction(() => { const control=document.getElementById("qaFinalizeRun");return Boolean(control)&&control.disabled===false; },null,{timeout:8000});
  assert.equal(await page.locator("#qaFinalizeRun").isEnabled(),true);
  await page.locator(".qa-case summary").click();
  await page.locator(".qa-case-actions button").filter({hasText:"Pass"}).click();
  await page.getByText("Record what you observed or attach evidence before marking Pass").waitFor();
  assert.equal(events.length,0,"UI must not transmit evidence-free Pass");
  await page.locator(".qa-case textarea").fill("Observed a protected API return 403 to unauthorized request");
  await page.locator(".qa-case-actions button").filter({hasText:"Pass"}).click();
  await page.getByText("Saved Pass for QA-AUTH-001",{exact:false}).waitFor();
  assert.equal(events.length,1);
  assert.equal(events[0].payload.status,"Pass");
  await page.locator("#qaFinalDecision").selectOption("Incomplete");
  await page.locator("#qaFinalNotes").fill("87 tests not yet executed");
  await page.locator("#qaFinalizeRun").click();
  await page.getByText("Finalized as Incomplete at",{exact:false}).waitFor();
  assert.equal(run.status,"Finalized");
  assert.equal(await page.locator("#qaFinalizeRun").isDisabled(),true);
  assert.equal(await page.locator(".qa-case-actions button").first().isDisabled(),true);
  assert.equal(events.filter(e=>e.kind==="RunFinalized").length,1);
  assert.equal(posted.some(x=>/\/api\/(?:publish|outputs|factory|operations)\//.test(x.path)),false);
  assert.equal(unexpected,0,"Browser/API errors are forbidden");
  console.log("QA_TEST_CENTER_BROWSER=PASS; isolated catalog, evidence, saved result and immutable closure");
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
