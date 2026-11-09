import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("deployment retries only Cloudflare bridge routing 1042, never a real Home 404", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/deploy-cloudflare-worker-production.yml", import.meta.url), "utf8");
  const refresh = workflow.slice(workflow.indexOf("ACCEPTED=0"), workflow.indexOf("test \"$ACCEPTED\" = \"1\""));
  assert.match(refresh, /if \[\[ "\$CODE" == "404" \]\] && grep -Fq "error code: 1042"/);
  assert.match(refresh, /sleep 5\s+continue/);
  assert.match(refresh, /Overview refresh start failed http=\$CODE status=\$STATUS/);
  assert.match(refresh, /test|refreshing|completed/);
  assert.match(workflow, /bridge_get\(\) \{/);
  assert.match(workflow, /grep -Fq "error code: 1042" "\$output"/);
  assert.match(workflow, /bridge_get "\$BASE\/overview-status" \/tmp\/overview-refresh-status\.json/);
  assert.match(workflow, /automatic_rollback_verified=true/);
  const qa = workflow.slice(workflow.indexOf("qa-catalog"), workflow.indexOf("qa_admin_catalog_read=PASS"));
  assert.match(qa, /--retry 8 --retry-all-errors --retry-delay 2/);
  assert.doesNotMatch(qa, /--retry 5 --retry-delay 2 --max-time 45 "\$BASE\/qa-catalog"/);
});
