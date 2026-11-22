import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("#2574 Ideas displays truthful saved autonomous handoff failures separately from the countdown", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const ui = await readFile(new URL("./assets/autonomous-handoff-health.js", import.meta.url), "utf8");
  assert.match(page, /id="ideasHandoffHealth"/);
  assert.match(page, /assets\/autonomous-handoff-health\.js/);
  assert.match(page, /id="ideasNextPullCountdown"/);
  assert.match(ui, /last_autonomous_run/);
  assert.match(ui, /No enabled platform destinations were found/);
  assert.match(ui, /Supabase read unavailable/);
  assert.match(ui, /no user action is required/);
  assert.match(ui, /setInterval\(refresh, 60000\)/);
  assert.doesNotMatch(ui, /fetch\([^)]*method:\s*["']POST/);
});
