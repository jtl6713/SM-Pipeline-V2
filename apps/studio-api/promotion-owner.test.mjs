import test from "node:test";
import assert from "node:assert/strict";
import { promotedContentOwner } from "./promotion-owner.mjs";

test("same production request remains owner", () => {
  assert.equal(promotedContentOwner("recCURRENT1234567", ["recCURRENT1234567"]), null);
});

test("different production request is detected as incumbent owner", () => {
  assert.equal(
    promotedContentOwner("recSECOND12345678", ["recFIRST123456789"]),
    "recFIRST123456789"
  );
});

test("empty owner allows first promotion finalizer to claim content", () => {
  assert.equal(promotedContentOwner("recCURRENT1234567", []), null);
});
