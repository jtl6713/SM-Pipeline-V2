import test from "node:test";
import assert from "node:assert/strict";
import { describeIdeaPhotoMatchError } from "./idea-photo-wait.mjs";

test("matcher diagnostics classify status-less JavaScript failures", () => {
  const meta = describeIdeaPhotoMatchError(new ReferenceError("IDEA_LIBRARY_SCAN_LIMIT is not defined"));
  assert.equal(meta.error_category, "runtime_error");
  assert.equal(meta.error_status, null);
  assert.match(meta.error_detail, /not defined/);
});

test("matcher diagnostics distinguish transient Airtable failures", () => {
  const rate = describeIdeaPhotoMatchError(Object.assign(new Error("Too many requests"), { status: 429 }));
  assert.equal(rate.error_category, "rate_limited");
  assert.equal(rate.error_status, 429);
  const query = describeIdeaPhotoMatchError(Object.assign(new Error("Invalid formula"), { status: 422 }));
  assert.equal(query.error_category, "invalid_query");
});

test("matcher diagnostics redact URL and API tokens before persisting", () => {
  const meta = describeIdeaPhotoMatchError(new Error(
    "fetch https://api.airtable.com/v0/base/table?secret=123 failed Bearer patABCDEFGHIJKLMNOPQRSTU"
  ));
  assert.ok(!meta.error_detail.includes("api.airtable.com"));
  assert.ok(!meta.error_detail.includes("patABCDEFGHIJKLMNOPQRSTU"));
  assert.ok(meta.error_detail.length <= 180);
});
