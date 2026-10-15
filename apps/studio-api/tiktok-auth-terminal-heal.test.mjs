import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Quality recovery never rearms terminal TikTok auth failures", async () => {
  const source = readStudioWorkerSource();
  const start = source.indexOf("async function studioHealFailedStatuses");
  const end = source.indexOf("function studioMediaIdsFromSourcePackage", start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /tiktokTerminalAuthFailure/);
  assert.match(handler, /TIKTOK_AUTH_PARKED/);
  assert.match(handler, /terminal_auth_failure/);
  assert.doesNotMatch(handler, /tiktokParked/);
  assert.doesNotMatch(handler, /TikTok_Draft_Status:\s*"Ready for Delivery"/);
});
