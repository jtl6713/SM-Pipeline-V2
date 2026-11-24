const assert=require("node:assert/strict");
const path=require("node:path");
const fs=require("node:fs");
const {chromium}=require("playwright");
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const id="recaQyj12CzOHjIQp";
    let images=0;
    await page.route("https://media.chicagoshining.com/**",async route=>{
      images++;
      await route.fulfill({status:200,contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=","base64")});
    });
    await page.setContent("<!doctype html><html><body><button id='view'>View photos</button></body></html>");
    await page.addStyleTag({path:path.join(__dirname,"assets/pipeline-photo-preview.css")});
    await page.addScriptTag({path:path.join(__dirname,"assets/pipeline-photo-preview.js")});
    await page.evaluate(id=>{
      window.loads=0;
      document.querySelector("#view").onclick=()=>window.StudioPipelineGallery.open({
        recordId:id,label:"TikTok · Pilsen Mural Stroll · #11157",
        load:async()=>{
          window.loads++;
          return {ok:true,output:{id,platform:"TikTok",studio_output_type:"Multi-Photo",aspect_ratio:"9:16",selected_clip_count:19},
            slides:Array.from({length:19},(_,i)=>({order:i+1,name:"Photo "+(i+1),virtual:true,preview_url:"https://media.chicagoshining.com/fixture/slide-"+(i+1)+".jpg"}))};
        }
      });
    },id);
    assert.equal(await page.evaluate(()=>window.loads),0);
    assert.equal(images,0);
    await page.getByRole("button",{name:"View photos"}).click();
    const dialog=page.getByRole("dialog");
    await dialog.getByText("1 of 19",{exact:true}).waitFor();
    assert.match(await dialog.locator("img").getAttribute("src"),/slide-1\.jpg$/);
    assert.equal(await dialog.getByRole("button",{name:"← Previous"}).isDisabled(),true);
    await dialog.getByRole("button",{name:"Next →"}).click();
    await dialog.getByText("2 of 19",{exact:true}).waitFor();
    await page.keyboard.press("ArrowRight");
    await dialog.getByText("3 of 19",{exact:true}).waitFor();
    // Dispatch pointer events within the actual dialog to exercise touch-swipe handling.
    await dialog.locator(".pipeline-photo-frame").evaluate(frame=>{
      frame.setPointerCapture=()=>{};
      frame.dispatchEvent(new PointerEvent("pointerdown",{pointerId:1,pointerType:"touch",clientX:280,clientY:200,bubbles:true}));
      frame.dispatchEvent(new PointerEvent("pointerup",{pointerId:1,pointerType:"touch",clientX:60,clientY:202,bubbles:true}));
    });
    await dialog.getByText("4 of 19",{exact:true}).waitFor();
    for(let i=4;i<19;i++)await dialog.getByRole("button",{name:"Next →"}).click();
    await dialog.getByText("19 of 19",{exact:true}).waitFor();
    assert.match(await dialog.locator("img").getAttribute("src"),/slide-19\.jpg$/);
    assert.equal(await dialog.getByRole("button",{name:"Next →"}).isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.loads),1);
    assert.match(await dialog.locator(".pipeline-photo-status").textContent(),/final gallery verification may still be pending/);
    assert.equal(await dialog.getByRole("button",{name:/approve|publish|schedule/i}).count(),0);
    await dialog.getByRole("button",{name:"Close",exact:true}).click();
    await dialog.waitFor({state:"detached"});
    console.log("pipeline_gallery_19_slide_mobile_navigation=PASS");
    // Execute the actual Factory preview entry point with a minimal DOM and
    // the production viewer. Only the API response is a fixture.
    await page.setContent('<button id="factoryClick">Preview</button><div id="factoryPreviewBackdrop" hidden><div class="library-preview-dialog"><video id="factoryPreviewVideo"></video><img id="factoryPreviewImage"><div id="factoryPreviewEmpty"></div><h2 id="factoryPreviewTitle"></h2></div></div>');
    await page.addStyleTag({path:path.join(__dirname,"assets/pipeline-photo-preview.css")});
    await page.addScriptTag({path:path.join(__dirname,"assets/pipeline-photo-preview.js")});
    const source=fs.readFileSync(path.join(__dirname,"assets/factory-desk.js"),"utf8");
    const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
    await page.addScriptTag({content:`
      const $=id=>document.getElementById(id);
      let factoryGalleryPreviewEpoch=0, factoryReviewSaveInFlight=false;
      const clearFactoryNativeGalleryControls=()=>{},clearFactoryRecoveryGalleryControls=()=>{};
      const cardLabel=card=>card.title, setStatus=()=>{}, looksLikeImageOnly=()=>false;
      window.calls=[];
      const fetchJson=async url=>{window.calls.push(url);return {ok:true,output:{id:"${id}",platform:"TikTok",studio_output_type:"Multi-Photo",aspect_ratio:"9:16",selected_clip_count:19},slides:Array.from({length:19},(_,i)=>({order:i+1,name:"Photo "+(i+1),virtual:true,preview_url:"https://media.chicagoshining.com/fixture/slide-"+(i+1)+".jpg"}))};};
      ${section("  function isFactoryTikTokPhotoGallery(","  // Never infer a complete gallery")}
      ${section("  function openFactoryPreview(","  function saveFactorySelection(")}
      $("factoryClick").onclick=()=>openFactoryPreview({kind:"output",id:"${id}",platform:"TikTok",studio_output_type:"Multi-Photo",title:"Pilsen Mural Stroll",preview_url:"/should-not-play.mp4"});
    `});
    await page.getByRole("button",{name:"Preview",exact:true}).click();
    await page.getByRole("dialog").getByText("1 of 19",{exact:true}).waitFor();
    for(let i=1;i<19;i++)await page.getByRole("dialog").getByRole("button",{name:"Next →"}).click();
    await page.getByRole("dialog").getByText("19 of 19",{exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.calls),["/api/outputs/"+id+"/creative"]);
    assert.equal(await page.locator("#factoryPreviewVideo").getAttribute("src"),null);
    assert.equal(await page.locator("#factoryPreviewBackdrop").isHidden(),true);
    console.log("factory_tiktok_19_slide_preview=PASS");
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
