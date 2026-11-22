import test from "node:test";
import assert from "node:assert/strict";
import { QA_CATALOG } from "./qa-catalog.mjs";
import { inspectNativeGalleryPublicationPackage } from "./native-gallery-package-guard.mjs";

const entry = id => QA_CATALOG.tests.find(x => x.id === id);

test("#2294 QA Test Center provides exact native gallery missing-slide acceptance procedure", () => {
  const t = entry("QA-FACT-2294");
  assert.ok(t, "Missing Factory gallery regression test case");
  assert.equal(t.category, "FACT");
  assert.equal(t.severity, "Critical");
  assert.equal(t.automation, "manual");
  assert.ok(t.steps.length >= 4);
  const fullProcedure = [...t.prerequisites, ...t.steps.map(x => x.instruction)].join(" ");
  assert.match(fullProcedure, /10992/);
  assert.match(fullProcedure, /10993/);
  assert.match(t.steps.map(x => x.instruction).join(" "), /unverified/i);
  assert.match(t.expectedResults.join(" "), /no provider calls/i);
  assert.ok(t.prohibitedActions.includes("public_publish"));
  assert.ok(t.prohibitedActions.includes("release_publication_hold"));
});
test("#2294 QA Test Center records separate native Facebook crop and publisher test", () => {
  const t = entry("QA-PUB-2294");
  assert.ok(t, "Missing Facebook gallery publisher regression test case");
  assert.equal(t.category, "PUB");
  assert.equal(t.severity, "Critical");
  assert.match(t.steps.map(x => x.instruction).join(" "), /FB0_ASSETS/);
  assert.match(t.steps.map(x => x.instruction).join(" "), /11136/);
  assert.match(t.steps.map(x => x.instruction).join(" "), /11137/);
  assert.match(t.steps.map(x => x.instruction).join(" "), /4:5/);
  assert.ok(t.prohibitedActions.includes("meta_graph_post"));
});
test("#2294 gallery approval fail-closed rule never treats selected image count as canonical slides", () => {
  const output = {airtable_record_id:"rec1p9SOjrpxtpQkV",output_number:10992,
    platform_output_type:"Instagram Carousel",studio_output_type:"Carousel",
    selected_clip_count:8,
    selected_assets:{selected_clips:Array.from({length:8},(_,i)=>({order:i+1,url:"https://media.chicagoshining.com/studio/previews/lettered/rec1p9SOjrpxtpQkV/"+i+".jpg"}))},
    render_clip_list:Array.from({length:8},(_,i)=>({order:i+1,url:"https://media.chicagoshining.com/studio/previews/lettered/rec1p9SOjrpxtpQkV/"+i+".jpg"}))
  };
  const state = inspectNativeGalleryPublicationPackage(output,[]);
  assert.equal(state.applicable,true);
  assert.equal(state.eligible,false);
  assert.equal(state.reason,"native_gallery_slide_count_mismatch");
  const fb = {...output,platform_output_type:"Facebook Photo Set",studio_output_type:"Multi-Image Post"};
  assert.equal(inspectNativeGalleryPublicationPackage(fb,[]).eligible,false);
});
