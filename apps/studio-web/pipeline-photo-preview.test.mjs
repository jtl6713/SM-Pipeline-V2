import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read = p => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const source = read("./assets/pipeline-photo-preview.js");
const app = read("./assets/app-item4-1008.js");
const html = read("./index.html");
const ctx = { URL };
vm.runInNewContext(source, ctx);
const viewer = ctx.StudioPipelineGallery;
const id = "recaQyj12CzOHjIQp";
const image = n => "https://media.chicagoshining.com/studio/previews/item4/example/slide-" + n + ".jpg";
const payload = (platform, type, ratio="4:5") => ({
  ok:true, output:{id,platform,studio_output_type:type,aspect_ratio:ratio,selected_clip_count:19},
  slides:Array.from({length:19},(_,i)=>({order:i+1,name:"Photo "+(i+1),include:true,virtual:true,
    final_image_url:image(i+1),preview_url:image(i+1),variants:{[ratio]:image(i+1)}})).reverse(),
});
test("19-photo native packages for each supported platform are ordered, not replaced by a cover",()=>{
  for(const [platform,type,ratio] of [["Instagram","Carousel","4:5"],["Facebook","Multi-Image Post","4:5"],["TikTok","Multi-Photo","9:16"]]){
    const result=viewer.readSlides(payload(platform,type,ratio),id);
    assert.equal(result.slides.length,19);
    assert.equal(result.slides[0].image,image(1));
    assert.equal(result.slides[18].image,image(19));
    assert.equal(result.expected,19);
    assert.equal(result.sourceOnly,true);
  }
});
test("linked final URLs and incomplete/missing previews are distinguishable",()=>{
  const d=payload("Instagram","Carousel");
  d.slides[0].virtual=false;
  d.slides[0].final_image_url=image(90);
  d.slides[1].preview_url="https://other.example/bad.jpg";
  d.slides[1].current_image_url="javascript:alert(1)";
  d.slides[1].variants={};
  const result=viewer.readSlides(d,id);
  assert.equal(result.slides[18].image,image(90));
  assert.equal(result.slides[18].sourceOnly,false);
  assert.equal(result.slides[17].image,"");
  assert.equal(result.slides.length,19);
  d.slides.pop();
  assert.equal(viewer.readSlides(d,id).expected,19);
  assert.equal(viewer.readSlides(d,id).slides.length,18);
});
test("reject foreign output, videos, duplicate slide positions and unknown type",()=>{
  const d=payload("TikTok","Slideshow","9:16");
  assert.throws(()=>viewer.readSlides(d,"recDifferent"),/exact photo package/);
  d.slides[0].order=d.slides[1].order;
  assert.throws(()=>viewer.readSlides(d,id),/duplicate slide order/);
  assert.equal(viewer.isGallery({platform:"Facebook",studio_output_type:"Slideshow Reel"}),false);
  assert.equal(viewer.isGallery({platform:"Instagram",studio_output_type:"Reel"}),false);
  assert.equal(viewer.isGallery({platform:"YouTube",studio_output_type:"Slideshow Video"}),false);
});
test("Pipeline viewer is an explicit exact-row read; no initial media fetch or approval change",()=>{
  assert.match(app,/data-pipeline-photo-preview="\$\{escapeHtml\(r\.id\)\}"/);
  assert.match(app,/recordId: id,/);
  assert.match(app,/load: \(\) => api\(`\/api\/outputs\/\$\{encodeURIComponent\(id\)\}\/creative`/);
  assert.match(app,/retries: 0/);
  assert.match(app,/\[data-pipeline-photo-preview\].*\)\) return;/);
  assert.match(source,/await load\(\)/);
  assert.doesNotMatch(source,/fetch\(|method:|\/publish|\/approve|\/schedule/);
  assert.ok(html.indexOf('"/assets/pipeline-photo-preview.js?')<html.indexOf('"/assets/app-item4-1008.js?'));
  assert.match(html,/pipeline-photo-preview\.css\?v=/);
});

const factory = read("./assets/factory-desk.js");
test("Factory native TikTok routes to exact Creative photo viewer, never video or Meta slide API",()=>{
  const start=factory.indexOf("  function isFactoryTikTokPhotoGallery(");
  const end=factory.indexOf("  function isFactoryNativeGallery(",start);
  const scope={}; vm.runInNewContext(factory.slice(start,end)+"\nthis.classify=isFactoryTikTokPhotoGallery;",scope);
  assert.equal(scope.classify({kind:"output",platform:"TikTok",studio_output_type:"Multi-Photo"}),true);
  assert.equal(scope.classify({kind:"output",platform:"TikTok",studio_output_type:"TikTok Slideshow"}),true);
  for(const c of [{platform:"TikTok",studio_output_type:"Video Draft"},{platform:"Facebook",studio_output_type:"Multi-Photo"},{platform:"Instagram",studio_output_type:"Carousel"}]) assert.equal(scope.classify({kind:"output",...c}),false);
  const route=factory.slice(factory.indexOf("    if (isFactoryTikTokPhotoGallery(card))"),factory.indexOf("    if (isFactoryNativeGallery(card))"));
  assert.match(route,/requireCompleteTikTok: true/);
  assert.match(route,/\/creative`/); assert.doesNotMatch(route,/video\.src\s*=|\/slides/);
  const good=payload("TikTok","Multi-Photo","9:16");
  assert.equal(viewer.readSlides(good,id,{requireCompleteTikTok:true}).slides.length,19);
  for(const change of [d=>d.slides.pop(),d=>d.slides[0].order=20,d=>d.output.platform="Facebook",d=>d.output.aspect_ratio="4:5",d=>{d.slides[0].variants={};d.slides[0].preview_url="https://bad.example/a.jpg";}]) {
    const d=payload("TikTok","Multi-Photo","9:16"); change(d); assert.throws(()=>viewer.readSlides(d,id,{requireCompleteTikTok:true}));
  }
});
