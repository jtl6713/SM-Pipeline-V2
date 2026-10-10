import test from "node:test";
import assert from "node:assert/strict";
import {
  preferAuthoritativeProductionRequest,
  promotedContentOwner,
  siblingProductionRequestsToCancel,
} from "./promotion-owner.mjs";

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

test("preferAuthoritativeProductionRequest picks Promoted over older Draft", () => {
  const winner = preferAuthoritativeProductionRequest([
    { id: "recDRAFT0000000001", status: "Draft", createdAt: "2026-10-08T12:00:00.000Z" },
    { id: "recPROMOTED0000001", status: "Promoted", createdAt: "2026-10-09T12:00:00.000Z" },
    { id: "recCANCEL000000001", status: "Cancelled", createdAt: "2026-10-10T05:00:00.000Z" },
  ]);
  assert.equal(winner?.id, "recPROMOTED0000001");
});

test("siblingProductionRequestsToCancel leaves the winner and Cancelled alone", () => {
  assert.deepEqual(
    siblingProductionRequestsToCancel("recPROMOTED0000001", [
      { id: "recPROMOTED0000001", status: "Promoted" },
      { id: "recDRAFT0000000001", status: "Draft" },
      { id: "recSUBMIT000000001", status: "Submitted" },
      { id: "recCANCEL000000001", status: "Cancelled" },
    ]),
    ["recDRAFT0000000001", "recSUBMIT000000001"]
  );
});
