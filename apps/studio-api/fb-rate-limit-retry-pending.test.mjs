import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizedOutputState } from "./worker-functions-01.mjs";

const root = dirname(fileURLToPath(import.meta.url));

test("Worker version is 0\.10\.\d+(?:-[\w.-]+)?", () => {
  const worker = readFileSync(join(root, "worker.js"), "utf8");
  assert.match(worker, /version: "0\.10\.\d+(?:-[\w.-]+)?"/);
});

test("Facebook Graph 368 park paints Retry Pending, not Failed", () => {
  const state = normalizedOutputState({
    fields: {
      Platform: "Facebook",
      Output_Status: "Approved for Publishing",
      Publish_Status: "Failed",
      Publish_Error_Stage: "FB_GRAPH_RATE_LIMIT",
      Publish_Error_Message:
        "Facebook rate limit (368/1390008): parked until 2026-10-16T16:00Z. Auto_Publish paused so production Worker does not storm FBS3.",
      Publish_Retry_Eligible: true,
      FB_Slideshow_Status: "Video Ready",
      FB_Publish_Status: "Retry Pending",
    },
  });
  assert.equal(state, "Retry Pending");
});

test("a leftover carousel image_url error on Ready to Schedule paints Retry Pending", () => {
  const state = normalizedOutputState({
    fields: {
      Platform: "Instagram",
      Review_Status: "Approved",
      Output_Status: "Approved for Publishing",
      Publish_Status: "Ready to Schedule",
      Auto_Publish_Enabled: true,
      Studio_Publish_Dispatch_Count: 1,
      IG_Carousel_Error_Message: "(#100) The parameter image_url is required.",
    },
  });
  assert.equal(state, "Retry Pending");
});

test("approved auto-publish off with zero dispatches paints Manual Action Required", () => {
  const state = normalizedOutputState({
    fields: {
      Platform: "Facebook",
      Platform_Output_Type: "Facebook Story",
      Review_Status: "Approved",
      Output_Status: "Approved for Publishing",
      Publish_Status: "Ready to Schedule",
      Auto_Publish_Enabled: false,
      Studio_Publish_Dispatch_Count: 0,
    },
  });
  assert.equal(state, "Manual Action Required");
});

test("FBS3_RATE_LIMIT stage also paints Retry Pending", () => {
  const state = normalizedOutputState({
    fields: {
      Platform: "Facebook",
      Output_Status: "Approved for Publishing",
      Publish_Status: "Failed",
      Publish_Error_Stage: "FBS3_RATE_LIMIT",
      Publish_Error_Message: "Facebook rate limit (368/1390008): We limit how often you can post. Retry after cooldown.",
      Publish_Retry_Eligible: true,
    },
  });
  assert.equal(state, "Retry Pending");
});
