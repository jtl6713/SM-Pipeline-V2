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
 assert.match(source,/if\(state\.pendingFactoryFeedback!==pending\)return/);
 assert.match(css,/#factoryReadOnlyInventory\[hidden\]\{display:none!important\}/);
});
test("UI uses read-only exact server endpoints, never selects siblings or enables generation",()=>{
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
 assert.doesNotMatch(body,/method:\s*["']POST["']/);
 assert.doesNotMatch(body,/mutateDesk|selected_output_ids|render_this_plan|publishNow/);
 assert.match(body,/document\.createElement\("li"\)/);
 assert.doesNotMatch(body,/innerHTML/);
});
test("Factory module and styles are cache-busted without changing the release build",()=>{
 assert.match(html,/factory-desk\.js\?v=0\.6\.\d+-[^"\s]*gallery_inventory=read_only_v1/);
 assert.match(html,/factory-layout-0680\.css\?v=0\.6\.\d+-[^"\s]*gallery_inventory=read_only_v1/);
});
