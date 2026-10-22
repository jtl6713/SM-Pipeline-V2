import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const client = fs.readFileSync(new URL("./assets/factory-batch-quality-0710.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
test("Factory surfaces all four verification recovery counts without inventing unavailable values", () => {
  assert.match(client, /verification_recovery/);
  for (const count of ["recovered_automatically", "awaiting_cooldown", "investigating", "human_action_required"]) {
    assert.match(client, new RegExp(count));
  }
  assert.match(client, /Published recovery audit unavailable/);
  assert.match(client, /recovered_automatically == null/);
  assert.match(client, /genuinely need human action/);
});
test("Factory script is cache-busted with updated verification recovery UI", () => {
  assert.match(html, /factory-batch-quality-0710\.js\?v=0\.6\.742-qa-autonomous-recovery/);
});
