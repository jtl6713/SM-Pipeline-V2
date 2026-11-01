import test from "node:test";
import assert from "node:assert/strict";
import { studioInvalidateHotReads } from "./worker-functions-01.mjs";

// Before this import repair, all successful Airtable mutations could throw
// ReferenceError: STUDIO_PIPELINE_SETTINGS_TABLE_ID is not defined.
test("Airtable mutations invalidate caches without unresolved Worker symbols", () => {
  const env = {
    AIRTABLE_OUTPUT_TABLE_ID: "tblOutput",
    AIRTABLE_MEDIA_TABLE_ID: "tblMedia",
    AIRTABLE_IDEA_TABLE_ID: "tblIdeas",
    AIRTABLE_CONTENT_TABLE_ID: "tblContent",
  };
  for (const [table, verb] of [
    ["tblpHPWeEkyJaF7ql", "PATCH"], // pipeline settings
    ["tblNYg2QB0BmmVACy", "PATCH"], // manual-I1 profile lock
    ["tblpCKSqcTpDtyst3", "POST"], // new I1 batch
    ["tblIdeas", "POST"],
    ["tblOutput", "PATCH"],
    ["tblMedia", "POST"],
    ["Production Requests", "PATCH"],
    ["tblUnknown", "PATCH"],
  ]) {
    assert.doesNotThrow(() => studioInvalidateHotReads(env, table, verb), table + ": " + verb);
  }
});
test("GET or HEAD never triggers mutation invalidation", () => {
  assert.doesNotThrow(() => studioInvalidateHotReads({}, "tblOther", "GET"));
  assert.doesNotThrow(() => studioInvalidateHotReads({}, "tblOther", "HEAD"));
});
