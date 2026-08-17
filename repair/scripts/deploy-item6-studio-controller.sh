#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${CLOUDFLARE_API_TOKEN:?missing token}"
: "${CLOUDFLARE_ACCOUNT_ID:?missing account id}"
TARGET_WORKER="chicagoshining-studio-api"
VERIFY_BRIDGE="chicagoshining-item6-controller-verify"
WRANGLER_VERSION="4.123.0"
API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$TARGET_WORKER"
AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
ROOT="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID"
ROLLED_BACK=0
CAPTURED=0

cleanup_bridge() {
  curl -sS -X DELETE "$ROOT/workers/scripts/$VERIFY_BRIDGE" -H "$AUTH" >/dev/null 2>&1 || true
}
rollback() {
  local rc=$?
  cleanup_bridge
  if [[ $rc -ne 0 && $CAPTURED -eq 1 ]]; then
    local before current
    before=$(cat /tmp/item6-active-before.txt)
    curl -fsS "$API/deployments" -H "$AUTH" -o /tmp/item6-current-deployments.json || exit "$rc"
    current=$(jq -er '.result.deployments[0].versions|max_by(.percentage)|.version_id' /tmp/item6-current-deployments.json) || exit "$rc"
    if [[ "$current" != "$before" ]]; then
      printf '{"strategy":"percentage","versions":[{"version_id":"%s","percentage":100}]}' "$before" >/tmp/item6-rollback.json
      curl -fsS -X POST "$API/deployments" -H "$AUTH" -H 'Content-Type: application/json' --data-binary @/tmp/item6-rollback.json -o /tmp/item6-rollback-result.json || exit "$rc"
      jq -e '.success==true' /tmp/item6-rollback-result.json >/dev/null || exit "$rc"
      ROLLED_BACK=1
      echo 'automatic_rollback=PASS'
    fi
  fi
  exit "$rc"
}
trap rollback EXIT

SOURCE="apps/studio-api/worker.js"
test -s "$SOURCE"
cp "$SOURCE" /tmp/item6-studio-worker.mjs
node --check /tmp/item6-studio-worker.mjs
grep -q 'ITEM6_REPLACE_TRANSACTION_V1_BEGIN' "$SOURCE"
grep -q 'prepare_replace_transaction' "$SOURCE"
grep -q 'begin_replace_transaction' "$SOURCE"
grep -q 'verify_replace_transaction' "$SOURCE"
grep -q 'rollback_replace_transaction' "$SOURCE"
grep -q 'complete_replace_cleanup' "$SOURCE"
sha256sum "$SOURCE" | awk '{print $1}' >/tmp/item6-source-sha256.txt

curl -fsS "$API/deployments" -H "$AUTH" -o /tmp/item6-deployments-before.json
jq -e '.success==true' /tmp/item6-deployments-before.json >/dev/null
BEFORE=$(jq -er '.result.deployments[0].versions|max_by(.percentage)|.version_id' /tmp/item6-deployments-before.json)
printf '%s' "$BEFORE" >/tmp/item6-active-before.txt
curl -fsS "$API/versions/$BEFORE" -H "$AUTH" -o /tmp/item6-version-before.json
jq -e '.success==true' /tmp/item6-version-before.json >/dev/null
CAPTURED=1

python - <<'PY'
import json
from pathlib import Path
expected={
 'AIRTABLE_BASE_ID':'plain_text','AIRTABLE_CONTENT_TABLE_ID':'plain_text','AIRTABLE_IDEA_TABLE_ID':'plain_text',
 'AIRTABLE_MEDIA_TABLE_ID':'plain_text','AIRTABLE_MUSIC_VIEW_ID':'plain_text','AIRTABLE_OUTPUT_TABLE_ID':'plain_text',
 'AIRTABLE_PAT':'secret_text','ALLOWED_ORIGINS':'plain_text','I3_DECISION_WEBHOOK_URL':'plain_text','STUDIO_MEDIA':'r2_bucket'
}
r=json.loads(Path('/tmp/item6-version-before.json').read_text())['result']
bindings=(r.get('resources') or {}).get('bindings') or []
got={str(x.get('name')):str(x.get('type')) for x in bindings}
if got != expected: raise SystemExit(f'Live binding contract changed: {sorted(got.items())}')
r2=next(x for x in bindings if x.get('name')=='STUDIO_MEDIA')
bucket=r2.get('bucket_name') or r2.get('bucket')
if not bucket: raise SystemExit('STUDIO_MEDIA bucket not recoverable')
Path('/tmp/item6-studio-media-bucket.txt').write_text(str(bucket))
Path('/tmp/item6-bindings-before.json').write_text(json.dumps(sorted([{'name':k,'type':v} for k,v in got.items()],key=lambda x:x['name']),indent=2))
print('predeploy_binding_contract=PASS')
PY

mkdir -p /tmp/item6-wrangler
cp "$SOURCE" /tmp/item6-wrangler/worker.js
cd /tmp/item6-wrangler
npm init -y >/dev/null 2>&1
npm install --no-save "wrangler@$WRANGLER_VERSION" >/dev/null
test "$(./node_modules/.bin/wrangler --version | tr -d '\r\n')" = "$WRANGLER_VERSION"
python - <<'PY'
import json,os
from pathlib import Path
bucket=Path('/tmp/item6-studio-media-bucket.txt').read_text().strip()
cfg={
 'name':'chicagoshining-studio-api','main':'worker.js','compatibility_date':'2026-08-02','workers_dev':False,
 'no_bundle':True,'keep_vars':True,'r2_buckets':[{'binding':'STUDIO_MEDIA','bucket_name':bucket}],
 'secrets':{'required':['AIRTABLE_PAT']}
}
Path('wrangler.jsonc').write_text(json.dumps(cfg,indent=2))
PY
./node_modules/.bin/wrangler deploy --config wrangler.jsonc --keep-vars --dry-run >/tmp/item6-wrangler-dry-run.log 2>&1
echo 'wrangler_no_bundle_dry_run=PASS'
./node_modules/.bin/wrangler deploy --config wrangler.jsonc --keep-vars >/tmp/item6-wrangler-deploy.log 2>&1
echo 'wrangler_no_bundle_deploy=PASS'
cd "$GITHUB_WORKSPACE"

ACTIVE=''
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS "$API/deployments" -H "$AUTH" -o /tmp/item6-deployments-after.json
  ACTIVE=$(jq -er '.result.deployments[0].versions|max_by(.percentage)|.version_id' /tmp/item6-deployments-after.json)
  [[ -n "$ACTIVE" && "$ACTIVE" != "$BEFORE" ]] && break
  sleep 2
done
test -n "$ACTIVE"
test "$ACTIVE" != "$BEFORE"
printf '%s' "$ACTIVE" >/tmp/item6-active-after.txt
curl -fsS "$API/versions/$ACTIVE" -H "$AUTH" -o /tmp/item6-version-after.json
jq -e '.success==true' /tmp/item6-version-after.json >/dev/null
python - <<'PY'
import json
from pathlib import Path
r=json.loads(Path('/tmp/item6-version-after.json').read_text())['result']
bindings=(r.get('resources') or {}).get('bindings') or []
got=sorted([{'name':str(x.get('name')),'type':str(x.get('type'))} for x in bindings],key=lambda x:x['name'])
before=json.loads(Path('/tmp/item6-bindings-before.json').read_text())
if got != before: raise SystemExit(f'Binding identity changed: {got}')
Path('/tmp/item6-bindings-after.json').write_text(json.dumps(got,indent=2))
print('postdeploy_binding_identity=PASS')
PY

curl -fsS "$API/content/v2" -H "$AUTH" -D /tmp/item6-worker-after-headers.txt -o /tmp/item6-worker-after-body.bin
python - <<'PY'
from email.parser import BytesParser
from email.policy import default
from pathlib import Path
import re
headers=Path('/tmp/item6-worker-after-headers.txt').read_bytes(); body=Path('/tmp/item6-worker-after-body.bin').read_bytes()
text=headers.decode('latin-1',errors='replace')
matches=re.findall(r'(?im)^content-type:\s*(.+?)\r?$',text); ctype=matches[-1].strip() if matches else ''
out=Path('/tmp/item6-worker-after.js')
if ctype.lower().startswith('multipart/'):
    msg=BytesParser(policy=default).parsebytes(f'Content-Type: {ctype}\r\nMIME-Version: 1.0\r\n\r\n'.encode()+body)
    candidates=[]
    for part in msg.walk():
        if part.is_multipart(): continue
        pt=part.get_content_type().lower(); fn=part.get_filename() or ''; payload=part.get_payload(decode=True) or b''
        if 'javascript' in pt or fn.lower().endswith(('.js','.mjs')): candidates.append((fn,payload))
    if not candidates: raise SystemExit('No JavaScript module in deployed Worker')
    preferred=next((x for x in candidates if x[0] in ('worker.js','index.js','src/index.js')),candidates[0])
    out.write_bytes(preferred[1])
else:
    out.write_bytes(body)
PY
cmp --silent "$SOURCE" /tmp/item6-worker-after.js
echo 'active_source_byte_match=PASS'

TOKEN=$(python -c 'import secrets; print(secrets.token_urlsafe(32))')
cat >/tmp/item6-verify-worker.js <<EOF
export default {async fetch(request,env){const u=new URL(request.url);if(u.pathname!=="/$TOKEN")return new Response("Not found",{status:404});const r=await env.STUDIO_API.fetch(new Request("https://studio.chicagoshining.com/api/session",{headers:{"Cf-Access-Authenticated-User-Email":"joseph.t.logan@gmail.com","Origin":"https://studio.chicagoshining.com","Accept":"application/json"}}));return new Response(await r.text(),{status:r.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}};
EOF
cat >/tmp/item6-verify-metadata.json <<EOF
{"main_module":"worker.js","compatibility_date":"2026-08-02","bindings":[{"type":"service","name":"STUDIO_API","service":"$TARGET_WORKER"}]}
EOF
node --check /tmp/item6-verify-worker.js
cleanup_bridge
code=$(curl -sS -o /tmp/item6-verify-upload.json -w '%{http_code}' -X PUT "$ROOT/workers/scripts/$VERIFY_BRIDGE/content" -H "$AUTH" -F 'metadata=@/tmp/item6-verify-metadata.json;type=application/json' -F 'worker.js=@/tmp/item6-verify-worker.js;type=application/javascript+module;filename=worker.js')
test "$code" -ge 200 -a "$code" -lt 300
jq -e '.success==true' /tmp/item6-verify-upload.json >/dev/null
curl -fsS -X POST "$ROOT/workers/scripts/$VERIFY_BRIDGE/subdomain" -H "$AUTH" -H 'Content-Type: application/json' --data '{"enabled":true,"previews_enabled":false}' -o /tmp/item6-verify-subdomain.json
jq -e '.success==true and .result.enabled==true' /tmp/item6-verify-subdomain.json >/dev/null
curl -fsS "$ROOT/workers/subdomain" -H "$AUTH" -o /tmp/item6-account-subdomain.json
SUB=$(jq -er '.result.subdomain' /tmp/item6-account-subdomain.json)
SESSION_CODE=000
for i in 1 2 3 4 5 6 7 8 9 10; do
  SESSION_CODE=$(curl -sS --max-time 60 -o /tmp/item6-session.json -w '%{http_code}' "https://$VERIFY_BRIDGE.$SUB.workers.dev/$TOKEN" || true)
  if [[ "$SESSION_CODE" == 200 ]] && jq -e '.ok==true and .authenticated==true and .authorized==true' /tmp/item6-session.json >/dev/null 2>&1; then break; fi
  sleep 2
done
test "$SESSION_CODE" = 200
jq -e '.ok==true and .authenticated==true and .authorized==true' /tmp/item6-session.json >/dev/null
echo 'functional_session_check=PASS'
cleanup_bridge
trap - EXIT

echo "before_version=$BEFORE"
echo "after_version=$ACTIVE"
echo "source_sha256=$(cat /tmp/item6-source-sha256.txt)"
echo 'item6_studio_controller_deploy=PASS'
