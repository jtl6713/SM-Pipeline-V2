import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../../.github/workflows/deploy-cloudflare-pages-production.yml", import.meta.url), "utf8");

test("Pages production blocks unchanged push releases before upload", () => {
  assert.match(workflow, /name: Reject unchanged custom-domain UI version on push/);
  assert.match(workflow, /if: github\.event_name == 'push'/);
  assert.match(workflow, /--assert-newer-than "\$LIVE_UI_VERSION"/);
  assert.match(workflow, /predeploy_live_ui=\$LIVE_UI_VERSION/);
  assert.match(workflow, /predeploy_requested_ui=\$EXPECTED_UI_VERSION/);
});

test("Pages production retries and proves exact custom-domain release identity", () => {
  assert.match(workflow, /for attempt in 1 2 3 4 5 6 7 8; do/);
  assert.match(workflow, /grep -Fq "\$EXPECTED_JS_URL" \/tmp\/custom-index\.html/);
  assert.match(workflow, /require_match "\$EXPECTED_BUILD_ID" \/tmp\/custom-app\.js "custom-domain BUILD_ID"/);
  assert.match(workflow, /custom_domain_verified_ui=\$EXPECTED_LABEL/);
  assert.match(workflow, /custom_domain_verified_build_id=\$EXPECTED_BUILD_ID/);
});


test("PR960 same-version Home exception is exact, one-time, and keeps default release guard", () => {
  assert.match(workflow, /same_version_home_integrity_release=verified_PR960_one_time/);
  assert.match(workflow, /approval-snapshot-monotonic-v1/);
  assert.match(workflow, /approved-unpublished-integrity-v2/);
  assert.match(workflow, /studio\\.allProfilesOverview\\.v4/);
  assert.match(workflow, /previous\\.includes\\(oldHome\\)/);
  assert.match(workflow, /!previous\\.includes\\(newHome\\)/);
  assert.match(workflow, /Unchanged UI build refused: no verified one-time cache fingerprint transition/);
  assert.match(workflow, /--assert-newer-than "\\$LIVE_UI_VERSION"/);
});
