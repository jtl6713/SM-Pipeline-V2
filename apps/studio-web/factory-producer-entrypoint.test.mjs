import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const here = new URL(".", import.meta.url);
const html = fs.readFileSync(new URL("index.html", here), "utf8");
const desk = fs.readFileSync(new URL("assets/factory-desk.js", here), "utf8");

test("Factory has an always-discoverable Producer entry point even with all lanes collapsed", () => {
  assert.match(html, /id="factoryProducerOpen"[^>]*aria-controls="factoryBandBodyNeedsEyes"/);
  assert.match(html, /Review &amp; Request Changes/);
  assert.match(desk, /\$\("factoryProducerOpen"\)\?\.addEventListener\("click"/);
  assert.match(desk, /band\.classList\.remove\("is-collapsed"\)/);
  assert.match(desk, /toggle\?\.setAttribute\("aria-expanded", "true"\)/);
  assert.match(desk, /No Ready for Review content is available yet/);
});
test("Discoverable entry point leads to the real durable content-level Producer action", () => {
  assert.match(desk, /data-factory-send-back-content/);
  assert.match(desk, /action: "request_changes_content"/);
  assert.match(desk, /desk\?\.result\?\.producer_queued/);
  assert.match(desk, /loadFactoryDesk\(true\)\.catch\(\(\) => \{\}\)/);
  assert.match(html, /id="factoryFeedbackForm"/);
  assert.match(html, /id="factoryFeedbackNotes"/);
  assert.match(html, /id="factoryFeedbackSubmit"/);
});

test("individual Factory review uses durable Producer submission for linked content", () => {
 assert.match(desk, /const producerAvailable = \/\\^rec/);
 assert.match(desk, /action: "request_changes_content"/);
 assert.match(desk, /output_ids: ready\.map\(\(item\) => item\.id\)/);
 assert.match(desk, /action: "send_back"/);
 assert.match(desk, />Request Changes<\/button>/);
});
