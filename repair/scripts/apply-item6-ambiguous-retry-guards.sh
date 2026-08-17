#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${CLOUDFLARE_API_TOKEN:?missing CLOUDFLARE_API_TOKEN}"
SIDS=(5862882 5612664 5845193 5791356 5791396 5806644)
PATCHED=()
TOKEN=''; BASE=''; PAT=''

cleanup_creds() {
  for f in /tmp/item6-key.pem /tmp/item6-pat.enc /tmp/item6-pat.txt /tmp/item6-make-token.txt /tmp/item6-make-base.txt /tmp/item6-settings.json /tmp/item6-q.txt; do
    [[ ! -e "$f" ]] || shred -u "$f" 2>/dev/null || rm -f "$f"
  done
}

make_body() {
  local bpfile="$1" outfile="$2"
  python - "$bpfile" "$outfile" <<'PY'
import json,sys
bp=json.load(open(sys.argv[1]))
json.dump({'blueprint':json.dumps(bp,separators=(',',':'))},open(sys.argv[2],'w'),separators=(',',':'))
PY
}

rollback() {
  rc=$?
  if [[ $rc -ne 0 && ${#PATCHED[@]} -gt 0 && -n "$TOKEN" && -n "$BASE" ]]; then
    echo "patch_failed=1 rollback_count=${#PATCHED[@]}"
    for ((i=${#PATCHED[@]}-1;i>=0;i--)); do
      sid="${PATCHED[$i]}"
      make_body "/tmp/item6-before-$sid.json" "/tmp/item6-rollback-$sid-body.json"
      code=$(curl -sS -o "/tmp/item6-rollback-$sid-response.json" -w '%{http_code}' -X PATCH "$BASE/scenarios/$sid" -H "Authorization: Token $TOKEN" -H 'Content-Type: application/json' --data-binary @"/tmp/item6-rollback-$sid-body.json" || true)
      if [[ "$code" -ge 200 && "$code" -lt 300 ]]; then echo "rollback_scenario_${sid}=PASS"; else echo "rollback_scenario_${sid}=FAIL HTTP_$code"; fi
    done
  fi
  cleanup_creds
  exit "$rc"
}
trap rollback EXIT

# Recover Make API credentials through the existing encrypted credential envelope.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:CLOUDFLARE_API_TOKEN -in deploy/credential-envelope/private.pem.enc -out /tmp/item6-key.pem
base64 -d deploy/credential-envelope/airtable_pat.ciphertext.b64 >/tmp/item6-pat.enc
openssl pkeyutl -decrypt -inkey /tmp/item6-key.pem -in /tmp/item6-pat.enc -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -pkeyopt rsa_mgf1_md:sha256 -out /tmp/item6-pat.txt
PAT=$(cat /tmp/item6-pat.txt)
python - <<'PY' >/tmp/item6-q.txt
import urllib.parse
f="OR({Setting_Name}='MAKE_API_TOKEN',{Setting_Name}='MAKE_API_BASE_URL')"
print(urllib.parse.urlencode([('filterByFormula',f),('fields[]','Setting_Name'),('fields[]','Setting_Value'),('fields[]','Active')]))
PY
curl -fsS "https://api.airtable.com/v0/appe33zkZn35yirTL/tblpHPWeEkyJaF7ql?$(cat /tmp/item6-q.txt)" -H "Authorization: Bearer $PAT" -o /tmp/item6-settings.json
python - <<'PY'
import json
x=json.load(open('/tmp/item6-settings.json'))
v={r['fields'].get('Setting_Name'):r['fields'].get('Setting_Value') for r in x.get('records',[]) if r.get('fields',{}).get('Active')}
open('/tmp/item6-make-token.txt','w').write(str(v['MAKE_API_TOKEN']).strip())
open('/tmp/item6-make-base.txt','w').write(str(v['MAKE_API_BASE_URL']).strip().rstrip('/'))
PY
TOKEN=$(cat /tmp/item6-make-token.txt); BASE=$(cat /tmp/item6-make-base.txt)

# Snapshot every target before any write and assert the scenarios are still active webhooks/stages.
echo '[]' >/tmp/item6-evidence.json
for sid in "${SIDS[@]}"; do
  curl -fsS "$BASE/scenarios/$sid" -H "Authorization: Token $TOKEN" -o "/tmp/item6-scenario-before-$sid.json"
  curl -fsS "$BASE/scenarios/$sid/blueprint" -H "Authorization: Token $TOKEN" -o "/tmp/item6-blueprint-wrapper-$sid.json"
  python - "$sid" <<'PY'
import json,sys,hashlib
sid=int(sys.argv[1])
s=json.load(open(f'/tmp/item6-scenario-before-{sid}.json'))
s=s.get('scenario') or s.get('response') or s
b=json.load(open(f'/tmp/item6-blueprint-wrapper-{sid}.json'))
bp=b.get('blueprint') or (b.get('response') or {}).get('blueprint') or b
json.dump(bp,open(f'/tmp/item6-before-{sid}.json','w'),separators=(',',':'))
raw=json.dumps(bp,separators=(',',':'),sort_keys=True).encode()
open(f'/tmp/item6-before-{sid}.sha','w').write(hashlib.sha256(raw).hexdigest())
open(f'/tmp/item6-before-{sid}.active','w').write('true' if s.get('isActive') else 'false')
PY
  python repair/scripts/patch-item6-ambiguous-retry-guards.py "$sid" "/tmp/item6-blueprint-wrapper-$sid.json" "/tmp/item6-after-wanted-$sid.json" >"/tmp/item6-change-$sid.json"
done

# Apply one scenario at a time. Every successful write is immediately re-read and canonical-compared.
for sid in "${SIDS[@]}"; do
  make_body "/tmp/item6-after-wanted-$sid.json" "/tmp/item6-patch-$sid-body.json"
  code=$(curl -sS -o "/tmp/item6-patch-$sid-response.json" -w '%{http_code}' -X PATCH "$BASE/scenarios/$sid" -H "Authorization: Token $TOKEN" -H 'Content-Type: application/json' --data-binary @"/tmp/item6-patch-$sid-body.json")
  [[ "$code" -ge 200 && "$code" -lt 300 ]] || { echo "scenario_$sid patch HTTP $code"; cat "/tmp/item6-patch-$sid-response.json"; exit 1; }
  PATCHED+=("$sid")
  sleep 1
  curl -fsS "$BASE/scenarios/$sid" -H "Authorization: Token $TOKEN" -o "/tmp/item6-scenario-after-$sid.json"
  curl -fsS "$BASE/scenarios/$sid/blueprint" -H "Authorization: Token $TOKEN" -o "/tmp/item6-after-wrapper-$sid.json"
  python - "$sid" <<'PY'
import json,sys,hashlib
sid=int(sys.argv[1])
expected=json.load(open(f'/tmp/item6-after-wanted-{sid}.json'))
w=json.load(open(f'/tmp/item6-after-wrapper-{sid}.json'))
actual=w.get('blueprint') or (w.get('response') or {}).get('blueprint') or w
if actual != expected:
    raise SystemExit(f'Scenario {sid}: live blueprint differs from requested patched blueprint')
before_active=open(f'/tmp/item6-before-{sid}.active').read().strip()
s=json.load(open(f'/tmp/item6-scenario-after-{sid}.json')); s=s.get('scenario') or s.get('response') or s
after_active='true' if s.get('isActive') else 'false'
if after_active != before_active:
    raise SystemExit(f'Scenario {sid}: active state changed {before_active}->{after_active}')
raw=json.dumps(actual,separators=(',',':'),sort_keys=True).encode()
open(f'/tmp/item6-after-{sid}.sha','w').write(hashlib.sha256(raw).hexdigest())
PY
  echo "scenario_${sid}=PATCHED_AND_VERIFIED"
done

# Sanitized evidence only: hashes, active state, module IDs and guard names; never raw blueprints/tokens.
python - <<'PY'
import json,hashlib
sids=[5862882,5612664,5845193,5791356,5791396,5806644]
rows=[]
for sid in sids:
    change=json.load(open(f'/tmp/item6-change-{sid}.json'))
    sb=json.load(open(f'/tmp/item6-scenario-before-{sid}.json')); sb=sb.get('scenario') or sb.get('response') or sb
    sa=json.load(open(f'/tmp/item6-scenario-after-{sid}.json')); sa=sa.get('scenario') or sa.get('response') or sa
    rows.append({
      'scenario_id':sid,'scenario_name':sb.get('name'),
      'active_before':bool(sb.get('isActive')),'active_after':bool(sa.get('isActive')),
      'blueprint_sha256_before':open(f'/tmp/item6-before-{sid}.sha').read().strip(),
      'blueprint_sha256_after':open(f'/tmp/item6-after-{sid}.sha').read().strip(),
      'changes':change['changes']
    })
out={
 'repair_item':6,'checkpoint':'ambiguous-retry-guards','result':'PASS','scenario_runs':0,'scenario_activation_changes':0,
 'guard_contract':{
   'normal_path':'original failure route plus Replace_Transaction_ID notexist',
   'replacement_path':'cloned sibling failure route plus Replace_Transaction_ID exist',
   'replacement_effect':['Publish_Status=Failed','Publish_Retry_Eligible=false','Publish_Next_Retry_At cleared','Manual_Fallback_Required=true','Replace_State=Manual Cleanup Required','Replace_Cleanup_State=Manual Cleanup Required','Replace_Error set','Replace_Updated_At=now']
 },
 'scenarios':rows
}
open('/tmp/item6-ambiguous-retry-guards-evidence.json','w').write(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))
PY

trap - EXIT
cleanup_creds
echo 'item6_ambiguous_retry_guards=PASS'
