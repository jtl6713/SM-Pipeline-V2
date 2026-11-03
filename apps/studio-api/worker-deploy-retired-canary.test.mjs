import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deploy = readFileSync(new URL("../../.github/workflows/deploy-cloudflare-worker-production.yml", import.meta.url), "utf8");

test("a retired Michigan Avenue record-specific assertion cannot block unrelated Worker releases", () => {
  assert.doesNotMatch(deploy, /Verify Michigan Avenue V2 private MP4 previews in all six Factory cards/);
  assert.doesNotMatch(deploy, /Verify Michigan Avenue held source and pending sibling in Factory/);
  assert.doesNotMatch(deploy, /michiganPreview|michiganAllowlist|michigan_v2_preview/);
});

test("Worker release retains real protected deployment and rollback gates", () => {
  assert.match(deploy, /Capture production rollback point and exact binding contract/);
  assert.match(deploy, /Verify authenticated Studio session through service binding/);
  assert.match(deploy, /Verify live transactional multi-scene revision without saving or publishing/);
  assert.match(deploy, /Verify authoritative All Profiles force refresh through service binding/);
  assert.match(deploy, /automatic_rollback_verified=true/);
  assert.match(deploy, /STUDIO_HOME_PROFILE_SUMMARY_READS/);
});
