#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${CLOUDFLARE_API_TOKEN:?missing CLOUDFLARE_API_TOKEN}"
SIDS=(5864632 5813561 5806668 5823581 5862882 5612664 5845193 5791356 5791396 5791424 5813463 5813487 5813511 5813534 5806644 5806597 5823572 5830810 5830609 5830616 5830623)
PATCHED=(); TOKEN=''; BASE=''; PAT=''

cleanup_creds(){
  for f in /tmp/i6-key.pem /tmp/i6-pat.enc /tmp/i6-pat.txt /tmp/i6-settings.json /tmp/i6-token.txt /tmp/i6-base.txt /tmp/i6-q.txt /tmp/i6-active-replace.json; do
    [[ ! -e "$f" ]] || shred -u "$f" 2>/dev/null || rm -f "$f"
  done
}
make_body(){ python - "$1" "$2" <<'PY'
import json,sys
bp=json.load(open(sys.argv[1])); json.dump({'blueprint':json.dumps(bp,separators=(',',':'))},open(sys.argv[2],'w'),separators=(',',':'))
PY
}
rollback(){
  rc=$?
  if [[ $rc -ne 0 && ${#PATCHED[@]} -gt 0 && -n "$TOKEN" && -n "$BASE" ]]; then
    echo "item6_transaction_patch_failed=1 rollback_count=${#PATCHED[@]}"
    for ((i=${#PATCHED[@]}-1;i>=0;i--)); do
      sid="${PATCHED[$i]}"; make_body "/tmp/i6-before-$sid.json" "/tmp/i6-rb-$sid-body.json"
      code=$(curl -sS -o "/tmp/i6-rb-$sid-resp.json" -w '%{http_code}' -X PATCH "$BASE/scenarios/$sid" -H "Authorization: Token $TOKEN" -H 'Content-Type: application/json' --data-binary @"/tmp/i6-rb-$sid-body.json" || true)
      [[ "$code" -ge 200 && "$code" -lt 300 ]] && echo "rollback_$sid=PASS" || echo "rollback_$sid=FAIL_HTTP_$code"
    done
  fi
  cleanup_creds; exit "$rc"
}
trap rollback EXIT

# Existing encrypted credential envelope; no secrets are emitted or uploaded.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:CLOUDFLARE_API_TOKEN -in deploy/credential-envelope/private.pem.enc -out /tmp/i6-key.pem
base64 -d deploy/credential-envelope/airtable_pat.ciphertext.b64 >/tmp/i6-pat.enc
openssl pkeyutl -decrypt -inkey /tmp/i6-key.pem -in /tmp/i6-pat.enc -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -pkeyopt rsa_mgf1_md:sha256 -out /tmp/i6-pat.txt
PAT=$(cat /tmp/i6-pat.txt)
python - <<'PY' >/tmp/i6-q.txt
import urllib.parse
f="OR({Setting_Name}='MAKE_API_TOKEN',{Setting_Name}='MAKE_API_BASE_URL')"
print(urllib.parse.urlencode([('filterByFormula',f),('fields[]','Setting_Name'),('fields[]','Setting_Value'),('fields[]','Active')]))
PY
curl -fsS "https://api.airtable.com/v0/appe33zkZn35yirTL/tblpHPWeEkyJaF7ql?$(cat /tmp/i6-q.txt)" -H "Authorization: Bearer $PAT" -o /tmp/i6-settings.json
python - <<'PY'
import json
x=json.load(open('/tmp/i6-settings.json')); v={r['fields'].get('Setting_Name'):r['fields'].get('Setting_Value') for r in x.get('records',[]) if r.get('fields',{}).get('Active')}
open('/tmp/i6-token.txt','w').write(str(v['MAKE_API_TOKEN']).strip()); open('/tmp/i6-base.txt','w').write(str(v['MAKE_API_BASE_URL']).strip().rstrip('/'))
PY
TOKEN=$(cat /tmp/i6-token.txt); BASE=$(cat /tmp/i6-base.txt)

# Refuse to modify handoff semantics while a nonterminal replacement transaction exists.
python - <<'PY' >/tmp/i6-active-q.txt
import urllib.parse
f="AND(LEN({Replace_Transaction_ID})>0,NOT(OR({Replace_State}='Rolled Back',{Replace_State}='Verified',{Replace_State}='Cleanup Complete',{Replace_State}='Manual Cleanup Required')))"
print(urllib.parse.urlencode([('filterByFormula',f),('maxRecords','3'),('fields[]','Output_ID'),('fields[]','Replace_Transaction_ID'),('fields[]','Replace_State')]))
PY
curl -fsS "https://api.airtable.com/v0/appe33zkZn35yirTL/tblrlPeboBthkplH0?$(cat /tmp/i6-active-q.txt)" -H "Authorization: Bearer $PAT" -o /tmp/i6-active-replace.json
python - <<'PY'
import json
x=json.load(open('/tmp/i6-active-replace.json')); rows=x.get('records',[])
if rows: raise SystemExit('Nonterminal replacement transaction exists; refusing live blueprint patch')
PY

# Snapshot and construct desired blueprints before any write.
for sid in "${SIDS[@]}"; do
  curl -fsS "$BASE/scenarios/$sid" -H "Authorization: Token $TOKEN" -o "/tmp/i6-scenario-before-$sid.json"
  curl -fsS "$BASE/scenarios/$sid/blueprint" -H "Authorization: Token $TOKEN" -o "/tmp/i6-wrapper-$sid.json"
  python - "$sid" <<'PY'
import json,sys,hashlib
sid=int(sys.argv[1]); s=json.load(open(f'/tmp/i6-scenario-before-{sid}.json')); s=s.get('scenario') or s.get('response') or s
w=json.load(open(f'/tmp/i6-wrapper-{sid}.json')); bp=w.get('blueprint') or (w.get('response') or {}).get('blueprint') or w
json.dump(bp,open(f'/tmp/i6-before-{sid}.json','w'),separators=(',',':'))
open(f'/tmp/i6-before-{sid}.sha','w').write(hashlib.sha256(json.dumps(bp,separators=(',',':'),sort_keys=True).encode()).hexdigest())
open(f'/tmp/i6-before-{sid}.active','w').write('true' if s.get('isActive') else 'false')
PY
  python repair/scripts/patch-item6-transaction-addressing.py "$sid" "/tmp/i6-wrapper-$sid.json" "/tmp/i6-wanted-$sid.json" >"/tmp/i6-change-$sid.json"
  python - "$sid" <<'PY'
import json,sys
sid=int(sys.argv[1]); c=json.load(open(f'/tmp/i6-change-{sid}.json'))
if not c.get('changes'): raise SystemExit(f'scenario {sid}: patcher produced no changes')
PY
done

# Apply serially; rollback all modified blueprints if any verification fails.
for sid in "${SIDS[@]}"; do
  make_body "/tmp/i6-wanted-$sid.json" "/tmp/i6-body-$sid.json"
  code=$(curl -sS -o "/tmp/i6-patch-resp-$sid.json" -w '%{http_code}' -X PATCH "$BASE/scenarios/$sid" -H "Authorization: Token $TOKEN" -H 'Content-Type: application/json' --data-binary @"/tmp/i6-body-$sid.json")
  [[ "$code" -ge 200 && "$code" -lt 300 ]] || { echo "scenario_$sid HTTP_$code"; exit 1; }
  PATCHED+=("$sid"); sleep 1
  curl -fsS "$BASE/scenarios/$sid" -H "Authorization: Token $TOKEN" -o "/tmp/i6-scenario-after-$sid.json"
  curl -fsS "$BASE/scenarios/$sid/blueprint" -H "Authorization: Token $TOKEN" -o "/tmp/i6-after-wrapper-$sid.json"
  python - "$sid" <<'PY'
import json,sys,hashlib
sid=int(sys.argv[1]); expected=json.load(open(f'/tmp/i6-wanted-{sid}.json'))
w=json.load(open(f'/tmp/i6-after-wrapper-{sid}.json')); actual=w.get('blueprint') or (w.get('response') or {}).get('blueprint') or w
if actual != expected: raise SystemExit(f'scenario {sid}: live blueprint differs from desired blueprint')
before=open(f'/tmp/i6-before-{sid}.active').read().strip(); s=json.load(open(f'/tmp/i6-scenario-after-{sid}.json')); s=s.get('scenario') or s.get('response') or s; after='true' if s.get('isActive') else 'false'
if after != before: raise SystemExit(f'scenario {sid}: active state changed {before}->{after}')
open(f'/tmp/i6-after-{sid}.sha','w').write(hashlib.sha256(json.dumps(actual,separators=(',',':'),sort_keys=True).encode()).hexdigest())
PY
  echo "scenario_${sid}=PATCHED_VERIFIED"
done

python - <<'PY'
import json
sids=[5864632,5813561,5806668,5823581,5862882,5612664,5845193,5791356,5791396,5791424,5813463,5813487,5813511,5813534,5806644,5806597,5823572,5830810,5830609,5830616,5830623]
rows=[]
for sid in sids:
    b=json.load(open(f'/tmp/i6-scenario-before-{sid}.json')); b=b.get('scenario') or b.get('response') or b
    a=json.load(open(f'/tmp/i6-scenario-after-{sid}.json')); a=a.get('scenario') or a.get('response') or a
    c=json.load(open(f'/tmp/i6-change-{sid}.json'))
    rows.append({'scenario_id':sid,'scenario_name':b.get('name'),'active_before':bool(b.get('isActive')),'active_after':bool(a.get('isActive')),'blueprint_sha256_before':open(f'/tmp/i6-before-{sid}.sha').read().strip(),'blueprint_sha256_after':open(f'/tmp/i6-after-{sid}.sha').read().strip(),'changes':c.get('changes',[])})
out={'repair_item':6,'checkpoint':'transaction-addressed-stage-handoff','result':'PASS','scenario_runs':0,'scenario_activation_changes':0,'nonterminal_replacement_transactions_at_start':0,'contract':{'normal_calls':'missing/empty transaction fields are accepted only when Airtable replacement fields are also empty','replacement_calls':'replace_transaction_id and replace_fingerprint must equal the exact Airtable Platform Output before first mutating/create/finalize step','handoffs':'orchestrator and internal exact-output webhook bodies carry Replace_Transaction_ID and Replace_Fingerprint','youtube':'YT0 idempotency key is replacement-transaction scoped'},'scenarios':rows}
open('/tmp/item6-transaction-addressing-evidence.json','w').write(json.dumps(out,indent=2)); print(json.dumps(out,indent=2))
PY

trap - EXIT
cleanup_creds
rm -f /tmp/i6-active-q.txt
echo 'item6_transaction_addressing=PASS'
