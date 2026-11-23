import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const js=readFileSync(new URL("./assets/factory-desk.js",import.meta.url),"utf8");

test("#2618: failed Factory video never silently becomes a cover still",()=>{
  const source=js.slice(js.indexOf("function openFactoryPreview("),js.indexOf("function saveFactorySelection("));
  assert.match(source,/video\.onerror\s*=/);
  assert.match(source,/video\.hidden = true;[\s\S]*?image\.hidden = true;/);
  assert.match(source,/Do not approve until you have watched the full video/);
  assert.match(source,/factoryGalleryPreviewEpoch/);
});

test("#2618: broken in-app playback supplies only an exact Drive final link",()=>{
  const source=js.slice(js.indexOf("function openFactoryPreview("),js.indexOf("function saveFactorySelection("));
  assert.match(source,/new URL\(String\(card\.final_file_url \|\| ""\)\)/);
  assert.match(source,/source\.hostname === "drive\.google\.com"/);
  assert.match(source,/\[A-Za-z0-9_-\]\{20,\}/);
  assert.match(source,/source\.protocol === "https:"/);
  assert.match(source,/!source\.search && !source\.hash && match/);
  assert.match(source,/link\.rel = "noopener noreferrer"/);
  assert.match(source,/link\.target = "_blank"/);
  assert.match(source,/empty\.appendChild\(link\)/);
  assert.doesNotMatch(source,/video\.src = source\.href/);
});
