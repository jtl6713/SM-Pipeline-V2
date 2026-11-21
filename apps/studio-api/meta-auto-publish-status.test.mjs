import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { metaAutoPublishDisabledState } from "./meta-auto-publish-status.mjs";

const base = {
  Platform: "Instagram", Review_Status: "Approved",
  Output_Status: "Approved for Publishing",
  Publish_Status: "Ready to Schedule",
  Publish_Method: "Automated",
  Auto_Publish_Enabled: false, Do_Not_Publish: false,
  Studio_Publish_Dispatch_Count: 0, Publish_Attempt_Count: 0,
};
const classify = override => metaAutoPublishDisabledState({ ...base, ...override });

test("approved, scheduled but unarmed Meta output is not a manual handoff", () => {
  assert.equal(classify({}), "Auto Publish Disabled");
  assert.equal(classify({ Platform: "Facebook" }), "Auto Publish Disabled");
  assert.equal(classify({ Publish_Retry_Eligible: false }), "Auto Publish Disabled");
});
test("prior Meta side effects require verification rather than another blind create", () => {
  assert.equal(classify({ Studio_Publish_Dispatch_Count: 1 }), "Verification Required");
  assert.equal(classify({ Publish_Attempt_Count: 1 }), "Verification Required");
  assert.equal(classify({ FB_Photo_IDs_JSON: '["123"]', Platform: "Facebook" }), "Verification Required");
  assert.equal(classify({ IG_Carousel_Parent_Container_ID: "existing" }), "Verification Required");
});
test("explicit hold does not claim an operator must perform a platform action", () => {
  assert.equal(classify({ Do_Not_Publish: true }), "Review Held");
});
test("real manual fallback/method is still handled by the manual classification", () => {
  assert.equal(classify({ Publish_Method: "Manual" }), null);
  assert.equal(classify({ Manual_Fallback_Required: true }), null);
  assert.equal(classify({ Publish_Status: "Manual Publish Required" }), null);
});
test("actual failure, publication, nonapproved and non-Meta rows retain their separate status paths", () => {
  assert.equal(classify({ Publish_Status: "Failed" }), null);
  assert.equal(classify({ Platform_Post_URL: "https://facebook.com/123" }), null);
  assert.equal(classify({ Review_Status: "Review Sent" }), null);
  assert.equal(classify({ Platform: "TikTok" }), null);
  assert.equal(classify({ Platform: "YouTube" }), null);
  assert.equal(classify({ Auto_Publish_Enabled: true }), null);
});
test("production normalizedOutputState invokes Meta classifier before generic false-auto manual branch", () => {
  const worker = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  const at = worker.indexOf("const metaDisabledState = typeof metaAutoPublishDisabledState");
  const legacy = worker.indexOf("if (fields.Auto_Publish_Enabled === false", at);
  assert.ok(at > 0 && legacy > at, "Meta-specific state must precede original manual handoff");
  assert.match(worker, /import \{ metaAutoPublishDisabledState \} from "\.\/meta-auto-publish-status\.mjs";/);
});
