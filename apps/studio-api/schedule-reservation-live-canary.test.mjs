import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./schedule-reservation-live-canary.mjs", import.meta.url), "utf8");

test("live canary cannot import Airtable, publishing, or Studio routes", () => {
  assert.doesNotMatch(source, /(?:from|import\s*\()\s*["'][^"']*(?:airtable|publish|factory|pipeline|worker\.js)/i);
  assert.match(source, /STUDIO_SCHEDULE_RESERVATIONS/);
  assert.match(source, /__synthetic_schedule_canary__/);
  assert.match(source, /production scheduling authority must remain disabled/i);
});
test("live canary requires synthetic identities and stub-only write", () => {
  assert.match(source, /content_profile_id:\s*lane/);
  assert.match(source, /platform:\s*"synthetic"/);
  assert.match(source, /shadow\.set\(/);
  assert.doesNotMatch(source, /airtableFetch|airtableBatchUpdate|fetch\s*\(\s*["']https?:/);
});
