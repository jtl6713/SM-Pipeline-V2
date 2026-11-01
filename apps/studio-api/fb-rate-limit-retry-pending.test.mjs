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
