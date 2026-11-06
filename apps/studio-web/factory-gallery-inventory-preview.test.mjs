import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const source=read("./assets/factory-desk.js");
const html=read("./index.html");
const css=read("./assets/factory-layout-0680.css");

test("Factory feedback exposes accurate non-publishing gallery and compatible-output progress",()=>{
 for(const id of ["factoryReadOnlyInventory","factoryReadOnlyInventoryStatus",
  "factoryReadOnlyInventoryRows"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="factoryReadOnlyInventory"[^>]*hidden/);
 assert.match(html,/factoryReadOnlyInventoryStatus"[^>]*role="status" aria-live="polite"/);
 assert.match(source,/function loadFactoryCorrectionReadOnlyPreview/);
 assert.match(source,/void loadFactoryCorrectionReadOnlyPreview\(state\.pendingFactoryFeedback\)/);
 assert.match(source,/const current=\(\)=>state\.pendingFactoryFeedback===pending/);
 assert.match(source,/if\(!current\(\)\)return/);
 assert.match(css,/#factoryReadOnlyInventory\[hidden\]\{display:none!important\}/);
});
test("UI uses exact source validation and never selects sibling outputs",()=>{
 const begin=source.indexOf("async function loadFactoryCorrectionReadOnlyPreview(");
 const end=source.indexOf("  // Review feedback is entered before any",begin);
 assert.ok(begin>0&&end>begin);
 const body=source.slice(begin,end);
 assert.match(body,/\/correction-matches\?production_request_id=/);
 assert.match(body,/\/gallery-inventory/);
 assert.match(body,/batch_enabled!==false/);
 assert.match(body,/Promise\.all\(\[readMatches\(\),readGallery\(\)\]\)/);
 assert.match(body,/inventory\?\.can_generate!==false/);
 assert.match(body,/inventory\?\.publication_authorized!==false/);
 assert.match(body,/\/gallery-selection-preview/);
 assert.match(body,/method:"POST"/);
 assert.match(body,/proposal\.can_generate!==false/);
 assert.match(body,/proposal\.publication_authorized!==false/);
 assert.doesNotMatch(body,/mutateDesk|selected_output_ids|render_this_plan|publishNow/);
 assert.match(body,/document\.createElement\("li"\)/);
 assert.doesNotMatch(body,/innerHTML/);
 assert.match(body,/factory-gallery-select-slide/);
 assert.match(body,/factory-gallery-slide-instruction/);
 assert.match(body,/Validate selected photo changes \(no render\)/);
});
test("private Generate UI is server-gated, explicitly confirmed and never claims a render pass",()=>{
 const begin=source.indexOf("async function loadFactoryCorrectionReadOnlyPreview(");
 const end=source.indexOf("  // Review feedback is entered before any",begin);
 const body=source.slice(begin,end);
 assert.match(body,/generationRequest:revision\.generation_request_enabled===true/);
 assert.match(body,/holdEnrollment:revision\.hold_enrollment_request_enabled===true/);
 assert.match(body,/galleryActions\?\.generationRequest===true/);
 assert.match(body,/galleryActions\.holdActive===true/);
 assert.match(body,/galleryActions\.jobCount===0/);
 assert.match(body,/canSaveWithoutAutoRender&&galleryActions/);
 assert.match(body,/Generate private image corrections/);
 assert.match(body,/confirmation\.append\(confirm/);
 assert.match(body,/confirm\.addEventListener\("change"/);
 assert.match(body,/\/gallery-enroll/);
 assert.match(body,/\/gallery-generate/);
 assert.match(body,/client_request_id,selected_slides:selected/);
 assert.match(body,/receipt\.publication_authorized!==false/);
 assert.match(body,/receipt\.creative_approved!==false/);
 assert.match(body,/receipt\.factory_approved!==false/);
 assert.match(body,/receipt\.state!=="held_queued"/);
 assert.match(body,/No automatic retry will occur/);
 assert.doesNotMatch(body,/\/publish-now|auto_approve:true|allow_public_publish:true/);
});
test("gallery progress is clearly Airtable ledger data, never falsely verified media",()=>{
 assert.match(source,/progress_source!=="airtable_ledger_unverified"/);
 assert.match(source,/slide slots recorded/);
 assert.match(source,/generated Drive media not independently verified by this count/);
});
test("Factory module and styles are cache-busted with a versioned release",()=>{
 assert.match(html,/factory-desk\.js\?v=0\.6\.\d+-[^"\s]*gallery_inventory=read_only_v1/);
 assert.match(html,/factory-layout-0680\.css\?v=0\.6\.\d+-[^"\s]*gallery_inventory=read_only_v1/);
});

test("selected slide instructions are actually included in existing saved Factory feedback",()=>{
 const start=source.indexOf("async function submitFactoryFeedback(");
 const finish=source.indexOf("  function ",start+32);
 assert.ok(start>=0&&finish>start);
 const body=source.slice(start,finish);
 assert.match(body,/selectedGallerySlides/);
 assert.match(body,/\.factory-gallery-select-slide:checked/);
 assert.match(body,/\.factory-gallery-slide-instruction/);
 assert.match(body,/Selected photo corrections/);
 assert.match(body,/const notes=\[freeformNotes,photoNotes\]/);
 assert.match(body,/mutateDesk\(\{ \.\.\.pending\.payload, note: notes \}\)/);
 assert.match(body,/notes\.length\s*>\s*3000/);
});

test("automatic Producer request cannot silently turn photo selection into a render",()=>{
 assert.match(source,/const canSaveWithoutAutoRender = pending\?\.payload\?\.action !== "request_changes_content"/);
 assert.match(source,/if\(selectable\.length && canSaveWithoutAutoRender\)/);
 assert.match(source,/if\(!canSaveWithoutAutoRender\)/);
 assert.match(source,/entry\.checkbox\.disabled=true/);
 assert.match(source,/if\(selectedGallerySlides\.length && pending\.payload\?\.action==="request_changes_content"\)/);
});
