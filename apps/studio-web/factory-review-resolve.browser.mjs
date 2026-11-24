import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {chromium} from "playwright";

const raw=readFileSync("apps/studio-web/index.html","utf8");
const section=raw.slice(raw.indexOf('<section id="page-factory"'),raw.indexOf('<section id="page-support"'));
const script=readFileSync("apps/studio-web/assets/factory-desk.js","utf8");
const id="recbzkRN1wyWoBjOn",profile="recAAAAAAAAAAAAAA",sha="a".repeat(64);
const card={id,output_id:11129,content_id:"recCCCCCCCCCCCCCC",kind:"output",profile_id:profile,profile_name:"Chicago",title:"Navy Pier Golden Path",platform:"Instagram",studio_output_type:"Carousel",output_status:"Ready for Review",render_status:"Native Photo Route",publish_status:"Not Ready",do_not_publish:true,review_resolve_available:true,candidate_gallery_review:true,review_package_ready:true,auto_publish_enabled:false,can_preview:true};
const desk={ok:true,summary:{needs_eyes:1},lanes:{needs_eyes:[card],auto_high:[],needs_assets:[],manual:[]},needs_assets_candidates:[]};
const slides=Array.from({length:4},(_,i)=>({order:i+1,image_url:"https://media.chicagoshining.com/studio/previews/test-"+(i+1)+".png"}));
const receipt={id,output_number:11129,package_sha256:sha,slide_count:4,saved_at:"2026-11-24T05:00:00Z",review_resolved:true,released:true,formal_approval_pending:true,scheduled:false,published:false};
let mode="failure",posts=0,saved=false;
const json=(res,value,status=200)=>{res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(value));};
const srv=createServer(async(req,res)=>{
 const url=new URL(req.url,"http://localhost");
 if(url.pathname==="/"){res.writeHead(200,{"content-type":"text/html"});res.end('<html><body><select id="studioProfileSelect"><option value="'+profile+'">Chicago</option></select>'+section+'<script src="/factory.js"></script></body></html>');return;}
 if(url.pathname==="/factory.js"){res.writeHead(200,{"content-type":"text/javascript"});res.end(script);return;}
 if(url.pathname==="/api/factory/desk"&&req.method==="GET"){json(res,desk);return;}
 if(url.pathname==="/api/factory/desk"&&req.method==="POST"){
  let text="";for await(const part of req)text+=part;
  const body=JSON.parse(text);posts++;
  assert.deepEqual(body,{action:"review_resolve",id,kind:"output",package_sha256:sha,confirm_images:true,confirm_caption:true,confirm_branding_rights:true});
  if(mode==="failure"){json(res,{error:"Staging controlled save failure"},409);return;}
  saved=true;
  if(mode==="lost"){json(res,{error:"Staging lost response"},503);return;}
  json(res,{ok:true,result:receipt});return;
 }
 if(url.pathname.endsWith("/slides")){
  if(url.searchParams.get("resolve")==="receipt"){
   assert.equal(url.searchParams.get("package_sha256"),sha);
   json(res,saved?{ok:true,...receipt}:{ok:true,id,review_resolved:false,held:true});return;
  }
  json(res,{ok:true,output_id:id,count:slides.length,slides,caption:"Fixture caption",package_sha256:sha,review_resolve_available:true,source:"verified-held-gallery-review",do_not_publish:true,publication_authorized:false});return;
 }
 json(res,{ok:true,status:"idle",items:[],batches:[],approvals_enabled:true});
});
await new Promise(resolve=>srv.listen(0,"127.0.0.1",resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route("https://media.chicagoshining.com/**",route=>route.fulfill({contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=","base64")}));
 page.on("dialog",dialog=>{void dialog.dismiss();});
 await page.goto("http://127.0.0.1:"+srv.address().port,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.StudioFactoryDesk?.load);
 await page.evaluate(()=>{document.querySelector("#page-factory").classList.add("active");return window.StudioFactoryDesk.load();});
 const toggle=page.locator("[data-factory-band-toggle]").first();
 if(await toggle.count())await toggle.click();
 const button=page.locator("[data-factory-review-resolve]");
 await button.first().click();
 const controls=page.locator("#factoryNativeGalleryControls");
 await controls.waitFor({state:"visible"});
 const save=controls.getByRole("button",{name:"Save review & resolve hold"});
 const status=page.locator("#factoryGalleryReviewSaveStatus");
 assert.equal(await save.isEnabled(),false);
 for(let i=0;i<4;i++){
  await page.waitForFunction(n=>{const img=document.querySelector("#factoryPreviewImage");return img?.src.endsWith("test-"+n+".png")&&img.complete&&img.naturalWidth>0;},i+1);
  if(i<3)await controls.getByRole("button",{name:"Next image"}).click();
 }
 for(const checkbox of await controls.getByRole("checkbox").all())await checkbox.check();
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll("#factoryNativeGalleryControls button")).find(b=>b.textContent==="Save review & resolve hold").disabled);
 await save.click();
 await page.waitForFunction(()=>document.querySelector("#factoryGalleryReviewSaveStatus")?.textContent.includes("Review not saved:"));
 assert.equal(posts,1);assert.equal(saved,false);
 assert.equal(await page.locator("#factoryPreviewBackdrop").isVisible(),true);
 assert.match(await status.innerText(),/No completed receipt exists/);
 mode="lost";
 await save.click();
 await page.waitForFunction(()=>document.querySelector("#factoryGalleryReviewSaveStatus")?.textContent.includes("Review saved and verified: 4 of 4"));
 assert.equal(posts,2);assert.equal(saved,true);
 assert.equal(await page.locator("#factoryPreviewBackdrop").isVisible(),true);
 assert.equal(await save.isVisible(),false);
 await controls.getByRole("button",{name:"Return to Factory for approval"}).click();
 await page.locator("#factoryPreviewBackdrop").waitFor({state:"hidden"});
 console.log("FACTORY_REVIEW_RESOLVE_BROWSER_PASS: failed save stays visible; lost response recovered via exact receipt; no duplicate save or publishing.");
}finally{await browser?.close();await new Promise(resolve=>srv.close(resolve));}
