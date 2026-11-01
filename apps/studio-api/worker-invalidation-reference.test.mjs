import test from "node:test";
import assert from "node:assert/strict";
import { studioInvalidateHotReads } from "./worker-functions-01.mjs";

// Regression: split Worker module must resolve ALL cache invalidation references.
// Before this fix, every successful Airtable POST/PATCH could throw
// ReferenceError: STUDIO_PIPELINE_SETTINGS_TABLE_ID is not defined.
test("successful Airtable writes can invalidate cache without ReferenceError", () => {
  const env = {
    AIRTABLE_OUTPUT_TABLE_ID: "tblOutput",
    AIRTABLE_MEDIA_TABLE_ID: "tblMedia",
    AIRTABLE_IDEA_TABLE_ID: "tblIdeas",
    AIRTABLE_CONTENT_TABLE_ID: "tblContent",
  };
  for (const [id, method] of [
    ["tblpHPWeEkyJaF7ql", "PATCH"], // Canonical Pipeline Settings
    ["tblNYg2QB0BmmVACy", "PATCH"], // Manual I1 Content Profile lock
    ["tblpCKSqcTpDtyst3", "POST"], // Idea generation batch creation
    ["tblIdeas", "POST"],
    ["tblOutput", "PATCH"],
    ["tblMedia", "POST"],
    ["Production Requests", "PATCH"],
    ["tblAnyOtherTable", "PATCH"],
    ["tblAnyOtherTable", "DELETE"],
  ]) {
    assert.doesNotThrow(() => studioInvalidateHotReads(env, id, method), id + " " + method);
  }
});

test("read-only requests never run mutation invalidation", () => {
  assert.doesNotThrow(() => studioInvalidateHotReads({}, "tblAnyOtherTable", "GET"));
  assert.doesNotThrow(() => studioInvalidateHotReads({}, "tblAnyOtherTable", "HEAD"));
});
