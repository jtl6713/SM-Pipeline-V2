import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(here, "assets/factory-desk.js"), "utf8");
const index = readFileSync(join(here, "index.html"), "utf8");
const start = js.indexOf("  function factoryVisibleNeedsEyes(");
const end = js.indexOf("  const FACTORY_WAITING_SELECTION_KEY", start);
assert.ok(start >= 0 && end > start, "Review/attention partition functions exist");

function partition(cards, submitted = []) {
  const ctx = {
    factorySubmittedApprovalIds: () => new Set(submitted),
    canReviewActions: (card) => card.ready === true,
  };
  vm.createContext(ctx);
  vm.runInContext(js.slice(start, end), ctx);
  return {
    ready: Array.from(ctx.factoryVisibleNeedsEyes(cards), card => card.id),
    attention: Array.from(ctx.factoryReviewAttentionCards(cards), card => card.id),
  };
}

test("only individually approvable outputs remain in Needs Eyes", () => {
  const cards = [
    { kind: "output", id: "recReady", ready: true },
    { kind: "output", id: "recBlocked", ready: false },
    { kind: "output", id: "recHeld", ready: false, review_hold_active: true },
    { kind: "request", id: "recRequest" },
  ];
  assert.deepEqual(partition(cards), {
    ready: ["recReady"], attention: ["recBlocked", "recHeld"],
  });
});

test("submitted outputs do not reappear in either queue", () => {
  const cards = [
    { kind: "output", id: "recReady", ready: true },
    { kind: "output", id: "recBlocked", ready: false },
  ];
  assert.deepEqual(partition(cards, ["recReady", "recBlocked"]), { ready: [], attention: [] });
});

test("Needs Attention provides diagnostics and exact-output remediation without approval", () => {
  assert.match(js, /data-factory-make-ready/);
  assert.match(js, /await openStudioTarget\(card\)/);
  assert.match(js, /const manualCards = \[\.\.\.\(desk\.lanes\?\.manual \|\| \[\]\)\]/);
  assert.match(js, /if \(!inManual\.has\(String\(card\.id \|\| ""\)\)\) manualCards\.push\(card\)/);
  assert.match(js, /if \(reviewAllowed \|\| needsEyesOutput\)/);
  assert.match(js, /if\(reviewActionOutput && card\.review_hold_active===true/);
  assert.match(js, /reviewActionOutput && canReviewHeldOutput\(card\)/);
  assert.match(js, /reviewActionOutput && canRejectHeldOutput\(card\)/);
  assert.match(index, /id="factoryLaneManualHeading">Needs Attention/);
});
