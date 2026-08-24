#!/usr/bin/env python3
from pathlib import Path

p = Path("repair/scripts/deploy-item6-studio-controller.sh")
s = p.read_text(encoding="utf-8")

if "/tmp/item6-worker-deploy" in s:
    print("item6_clean_deploy_dir_patch=ALREADY_APPLIED")
    raise SystemExit(0)

old = """mkdir -p /tmp/item6-wrangler
cp "$SOURCE" /tmp/item6-wrangler/worker.js
cd /tmp/item6-wrangler
npm init -y >/dev/null 2>&1
npm install --no-save "wrangler@$WRANGLER_VERSION" >/dev/null
test "$(./node_modules/.bin/wrangler --version | tr -d '\\r\\n')" = "$WRANGLER_VERSION"
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
"""

new = """mkdir -p /tmp/item6-wrangler-tool /tmp/item6-worker-deploy
cd /tmp/item6-wrangler-tool
npm init -y >/dev/null 2>&1
npm install --no-save "wrangler@$WRANGLER_VERSION" >/dev/null
test "$(./node_modules/.bin/wrangler --version | tr -d '\\r\\n')" = "$WRANGLER_VERSION"
cp "$GITHUB_WORKSPACE/$SOURCE" /tmp/item6-worker-deploy/worker.js
cd /tmp/item6-worker-deploy
python - <<'PY'
import json
from pathlib import Path
bucket=Path('/tmp/item6-studio-media-bucket.txt').read_text().strip()
cfg={
 'name':'chicagoshining-studio-api','main':'worker.js','compatibility_date':'2026-08-02','workers_dev':False,
 'no_bundle':True,'keep_vars':True,'r2_buckets':[{'binding':'STUDIO_MEDIA','bucket_name':bucket}],
 'secrets':{'required':['AIRTABLE_PAT']}
}
Path('wrangler.jsonc').write_text(json.dumps(cfg,indent=2))
PY
/tmp/item6-wrangler-tool/node_modules/.bin/wrangler deploy --config wrangler.jsonc --keep-vars --dry-run >/tmp/item6-wrangler-dry-run.log 2>&1
grep -q 'Total Upload:' /tmp/item6-wrangler-dry-run.log
! grep -q 'sharp-wasm32' /tmp/item6-wrangler-dry-run.log
echo 'wrangler_clean_no_bundle_dry_run=PASS'
/tmp/item6-wrangler-tool/node_modules/.bin/wrangler deploy --config wrangler.jsonc --keep-vars >/tmp/item6-wrangler-deploy.log 2>&1
echo 'wrangler_clean_no_bundle_deploy=PASS'
cd "$GITHUB_WORKSPACE"
"""

count = s.count(old)
if count != 1:
    raise SystemExit(f"Expected one deploy block, found {count}")

p.write_text(s.replace(old, new, 1), encoding="utf-8")
print("item6_clean_deploy_dir_patch=PASS")
