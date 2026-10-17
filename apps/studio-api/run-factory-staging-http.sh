#!/usr/bin/env bash
# Trusted main-branch GitHub Actions ONLY. Never target a production Worker.
# Runs a single locked -> secret-installed -> staging-on -> real HTTP test
# -> locked deployment; trap re-locks even on failed acceptance.
set -euo pipefail

EXPECTED_WORKER="sm-pipeline-v2-factory-approval-staging"
EXPECTED_BUCKET="sm-pipeline-v2-factory-approval-staging"
EXPECTED_BASE="appJ0ox62OMfZuE1v"
CONFIG="wrangler.factory-staging.jsonc"
ACTIVE="wrangler.factory-staging.active.jsonc"
WRANGLER="./node_modules/.bin/wrangler"
STAGED_DEPLOYED=0
RELOCK_OK=0
ACCEPTANCE_PASSED=0
STAGING_TEST_AUTH=""
STAGING_WORKER_URL=""
API_ROOT="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID"
WORKER_API="$API_ROOT/workers/scripts/$EXPECTED_WORKER"

finish() {
  original="$1"
  trap - EXIT
  set +e
  rm -f /tmp/factory-staging-secrets.json
  if [ "$STAGED_DEPLOYED" = 1 ]; then
    cp "$CONFIG" "$ACTIVE"
    for attempt in 1 2 3 4; do
      if "$WRANGLER" deploy --config "$ACTIVE" --keep-vars >/tmp/factory-staging-relock.log 2>&1; then
        RELOCK_OK=1
        break
      fi
      sleep 5
    done
    if [ "$RELOCK_OK" != 1 ]; then
      echo "ERROR: Staging Worker relock failed. Manually set FACTORY_BATCH_APPROVALS_ENABLED=false in Cloudflare staging Worker." >&2
      tail -25 /tmp/factory-staging-relock.log >&2
      original=1
    else
      for attempt in 1 2 3 4 5 6 7 8; do
        code=$(curl -sS --max-time 20 -o /tmp/factory-staging-final-health.json -w '%{http_code}' \
          -H "Authorization: Bearer $STAGING_TEST_AUTH" \
          "$STAGING_WORKER_URL/__staging/health" 2>/dev/null)
        if [ "$code" = 200 ] &&
          jq -e '.ok==true and .approvals_enabled==false' /tmp/factory-staging-final-health.json >/dev/null 2>&1; then
          echo "FACTORY_STAGING_FINAL_RELOCK=PASS enabled=false"
          break
        fi
        sleep 3
      done
      if ! jq -e '.ok==true and .approvals_enabled==false' /tmp/factory-staging-final-health.json >/dev/null 2>&1; then
        echo "ERROR: Could not independently confirm staging feature flag is OFF." >&2
        original=1
      fi
      if [ "$ACCEPTANCE_PASSED" = 1 ] && [ -s /tmp/factory-stage-requestid.txt ]; then
        rid=$(cat /tmp/factory-stage-requestid.txt)
        curl -fsS --max-time 30 -H "Authorization: Bearer $STAGING_TEST_AUTH" \
          "$STAGING_WORKER_URL/api/factory/approval-batches?profile_id=rect1wQB9BeUSEimn&request_id=$rid" \
          -o /tmp/factory-staging-persisted-after-redeploy.json
        if jq -e '.total==5 and .approved_count==4 and .failed_count==1 and .pending_count==0 and .approvals_enabled==false' \
          /tmp/factory-staging-persisted-after-redeploy.json >/dev/null 2>&1; then
          echo "FACTORY_STAGING_R2_PERSISTED_ACROSS_REDEPLOY=PASS"
        else
          echo "ERROR: Staging batch R2 ledger did not persist after Worker redeploy" >&2
          original=1
        fi
      fi
      if [ -s /tmp/factory-stage-requestid.txt ]; then
        rid=$(cat /tmp/factory-stage-requestid.txt)
        http=$(curl -sS --max-time 30 -X POST \
          -H "Authorization: Bearer $STAGING_TEST_AUTH" \
          -H "Content-Type: application/json" \
          --data "{\"request_id\":\"$rid\"}" \
          -o /tmp/factory-staging-r2-cleanup.json -w '%{http_code}' \
          "$STAGING_WORKER_URL/__staging/cleanup")
        if [ "$http" = 200 ] &&
          jq -e '.ok==true' /tmp/factory-staging-r2-cleanup.json >/dev/null 2>&1; then
          echo "FACTORY_STAGING_R2_TEST_CLEANUP=PASS"
        else
          echo "WARN: Test R2 ledger cleanup needs attention; never delete broad R2 prefixes." >&2
          original=1
        fi
      fi
    fi
  fi
  rm -f /tmp/factory-staging-secrets.json
  exit "$original"
}
trap 'finish "$?"' EXIT

test "$GITHUB_REPOSITORY" = "jtl6713/SM-Pipeline-V2"
test "$GITHUB_REF" = "refs/heads/main"
test -n "$CLOUDFLARE_API_TOKEN"
test -n "$CLOUDFLARE_ACCOUNT_ID"
test -n "$STAGING_AIRTABLE_API_TOKEN"

node - <<'NODE'
const fs=require("node:fs");
const cfg=JSON.parse(fs.readFileSync("wrangler.factory-staging.jsonc","utf8"));
if (cfg.name!=="sm-pipeline-v2-factory-approval-staging" ||
    cfg.workers_dev!==true ||
    cfg.vars?.AIRTABLE_BASE_ID!=="appJ0ox62OMfZuE1v" ||
    cfg.vars?.FACTORY_BATCH_APPROVALS_ENABLED!=="false" ||
    cfg.r2_buckets?.length!==1 ||
    cfg.r2_buckets[0].bucket_name!=="sm-pipeline-v2-factory-approval-staging")
  throw Error("Staging Wrangler config not isolated or not locked");
NODE

# Verify the existing, user-created staging Worker from actual Cloudflare API.
curl -fsS "$WORKER_API/deployments" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -o /tmp/factory-staging-before.json
before=$(jq -er '.result.deployments[0].versions | max_by(.percentage) | .version_id' /tmp/factory-staging-before.json)
curl -fsS "$WORKER_API/versions/$before" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -o /tmp/factory-staging-before-version.json
python - <<'PY'
import json
r=json.load(open("/tmp/factory-staging-before-version.json"))["result"]
bs={b["name"]:b for b in ((r.get("resources") or {}).get("bindings") or [])}
assert bs["STUDIO_MEDIA"].get("bucket_name",bs["STUDIO_MEDIA"].get("bucket"))=="sm-pipeline-v2-factory-approval-staging"
expected={
"AIRTABLE_BASE_ID":"appJ0ox62OMfZuE1v",
"AIRTABLE_CONTENT_TABLE_ID":"tblszaHkgn51wajDV",
"AIRTABLE_OUTPUT_TABLE_ID":"tbl5sA6Mwiz9pGNOi",
"FACTORY_BATCH_APPROVALS_ENABLED":"false",
}
for k,v in expected.items():
    assert bs[k].get("text")==v,"Staging manual configuration mismatch: "+k
assert not (set(bs)-{"STUDIO_MEDIA",*expected}),"Unexpected existing staging bindings; refuse overwriting"
print("STAGING_EXISTING_WORKER_AND_R2_PRECHECK=PASS")
PY

npm install --no-save wrangler@4.123.0 >/dev/null
node apps/studio-api/generate-factory-batch-staging-worker.mjs
node --check apps/studio-api/factory-batch-staging-worker.generated.mjs
"$WRANGLER" deploy --config "$CONFIG" --dry-run >/tmp/factory-staging-dry-run.log 2>&1
echo "FACTORY_STAGING_BUILD=PASS"

# The first deployment is disabled. All endpoints refuse requests until secrets exist.
"$WRANGLER" deploy --config "$CONFIG" --keep-vars >/tmp/factory-staging-locked-deploy.log 2>&1
STAGED_DEPLOYED=1
echo "FACTORY_STAGING_INITIAL_DEPLOY=PASS flag=false"

# Never store a PAT or bearer token in repo, Wrangler vars or command arguments.
export STAGING_TEST_AUTH
STAGING_TEST_AUTH=$(openssl rand -hex 32)
echo "::add-mask::$STAGING_TEST_AUTH"
node - <<'NODE'
const fs=require("node:fs");
if(!process.env.STAGING_AIRTABLE_API_TOKEN || !process.env.STAGING_TEST_AUTH)
  throw Error("Missing staging-only credentials");
fs.writeFileSync("/tmp/factory-staging-secrets.json",JSON.stringify({
  AIRTABLE_PAT:process.env.STAGING_AIRTABLE_API_TOKEN,
  STAGING_TEST_AUTH:process.env.STAGING_TEST_AUTH,
}),{mode:0o600});
NODE
"$WRANGLER" secret bulk /tmp/factory-staging-secrets.json --config "$CONFIG" \
  >/tmp/factory-staging-secret-install.log 2>&1
rm -f /tmp/factory-staging-secrets.json

# Assert no production social credentials or production resource binding exists.
curl -fsS "$WORKER_API/deployments" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -o /tmp/factory-staging-after-secret.json
secret_version=$(jq -er '.result.deployments[0].versions|max_by(.percentage)|.version_id' /tmp/factory-staging-after-secret.json)
curl -fsS "$WORKER_API/versions/$secret_version" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -o /tmp/factory-staging-binding-proof.json
python - <<'PY'
import json
r=json.load(open("/tmp/factory-staging-binding-proof.json"))["result"]
bs={b["name"]:b for b in ((r.get("resources") or {}).get("bindings") or [])}
expected={"STUDIO_MEDIA","AIRTABLE_BASE_ID","AIRTABLE_CONTENT_TABLE_ID","AIRTABLE_OUTPUT_TABLE_ID",
          "FACTORY_BATCH_APPROVALS_ENABLED","AIRTABLE_PAT","STAGING_TEST_AUTH"}
assert set(bs)==expected,"Unexpected binding(s) in isolated staging Worker: "+str(set(bs)^expected)
assert bs["STUDIO_MEDIA"].get("bucket_name",bs["STUDIO_MEDIA"].get("bucket"))=="sm-pipeline-v2-factory-approval-staging"
assert bs["AIRTABLE_BASE_ID"].get("text")=="appJ0ox62OMfZuE1v"
assert bs["FACTORY_BATCH_APPROVALS_ENABLED"].get("text")=="false"
assert bs["AIRTABLE_PAT"]["type"]=="secret_text" and bs["STAGING_TEST_AUTH"]["type"]=="secret_text"
print("FACTORY_STAGING_SECRETS_AND_R2_ISOLATION=PASS")
PY

curl -fsS "$API_ROOT/workers/subdomain" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -o /tmp/factory-staging-subdomain.json
subdomain=$(jq -er '.result.subdomain' /tmp/factory-staging-subdomain.json)
export STAGING_WORKER_URL="https://$EXPECTED_WORKER.$subdomain.workers.dev"
echo "Staging test origin: $STAGING_WORKER_URL"

# No public/no-auth endpoint; true staging HTTP POST stays off before testing.
locked=0
for attempt in $(seq 1 25); do
  noauth=$(curl -sS --max-time 20 -o /tmp/factory-staging-unauth.json -w '%{http_code}' \
    "$STAGING_WORKER_URL/__staging/health" || true)
  post=$(curl -sS --max-time 20 -X POST \
    -H "Authorization: Bearer $STAGING_TEST_AUTH" -H "Content-Type: application/json" \
    --data '{"action":"start"}' -o /tmp/factory-staging-denied-post.json -w '%{http_code}' \
    "$STAGING_WORKER_URL/api/factory/approval-batches" || true)
  if [ "$noauth" = 401 ] && [ "$post" = 503 ]; then locked=1;break;fi
  sleep 3
done
test "$locked" = 1
echo "FACTORY_STAGING_LOCKED_POST_AND_AUTH=PASS"

# Only the staging Worker gets this brief activation. The exit trap returns it
# to false regardless of an assertion failure later in this script.
cp "$CONFIG" "$ACTIVE"
node - <<'NODE'
const fs=require("node:fs");
const path="wrangler.factory-staging.active.jsonc";
const cfg=JSON.parse(fs.readFileSync(path));
if(cfg.name!=="sm-pipeline-v2-factory-approval-staging")
  throw Error("Wrong Worker target during test activation");
cfg.vars.FACTORY_BATCH_APPROVALS_ENABLED="true";
fs.writeFileSync(path,JSON.stringify(cfg,null,2));
NODE
"$WRANGLER" deploy --config "$ACTIVE" --keep-vars >/tmp/factory-staging-active-deploy.log 2>&1

for attempt in $(seq 1 20); do
  http=$(curl -sS --max-time 20 -H "Authorization: Bearer $STAGING_TEST_AUTH" \
    "$STAGING_WORKER_URL/__staging/health" -o /tmp/factory-staging-test-health.json -w '%{http_code}' || true)
  if [ "$http" = 200 ] &&
    jq -e '.staging==true and .approvals_enabled==true and .transport=="intercepted"' \
      /tmp/factory-staging-test-health.json >/dev/null 2>&1; then break;fi
  sleep 3
done
test "$http" = 200
jq -e '.staging==true and .approvals_enabled==true and .transport=="intercepted"' \
  /tmp/factory-staging-test-health.json >/dev/null
echo "FACTORY_STAGING_TEMPORARY_ACTIVATION=PASS"

node apps/studio-api/factory-batch-deployed-http.staging.mjs
ACCEPTANCE_PASSED=1
echo "FACTORY_STAGING_ACTUAL_DEPLOYED_HTTP_ACCEPTANCE=PASS"
