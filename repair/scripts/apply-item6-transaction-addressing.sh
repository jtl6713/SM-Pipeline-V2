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
make_call(){
  local method="$1" url="$2" out="$3" body="${4:-}" attempt code delay
  for attempt in 1 2 3 4 5 6 7; do
    if [[ "$method" == GET ]]; then
      code=$(curl -sS -o "$out" -w '%{http_code}' "$url" -H "Authorization: Token $TOKEN" || true)
    else
      code=$(curl -sS -o "$out" -w '%{http_code}' -X "$method" "$url" -H "Authorization: Token $TOKEN" -H 'Content-Type: application/json' --data-binary @"$body" || true)
    fi
    if [[ "$code" -ge 200 && "$code" -lt 300 ]]; then sleep 2; return 0; fi
    if [[ "$code" == 429 ]]; then delay=$((attempt*8)); echo "make_rate_limit url=$url attempt=$attempt sleep=${delay}s"; sleep "$delay"; continue; fi
    echo "make_call_failed method=$method url=$url http=$code" >&2; return 1
  done
  echo "make_call_exhausted method=$method url=$url" >&2; return 1
}
rollback(){
  rc=$?
  if [[ $rc -ne 0 && ${#PATCHED[@]} -gt 0 && -n "$TOKEN" && -n "$BASE" ]]; then
    echo "item6_transaction_patch_failed=1 rollback_count=${#PATCHED[@]}"
    for ((i=${#PATCHED[@]}-1;i>=0;i--)); do
      sid="${PATCHED[$i]}"; make_body "/tmp/i6-before-$sid.json" "/tmp/i6-rb-$sid-body.json"
      if make_call PATCH "$BASE/scenarios/$sid" "/tmp/i6-rb-$sid-resp.json" "/tmp/i6-rb-$sid-body.json"; then echo "rollback_$sid=PASS"; else echo "rollback_$sid=FAIL"; fi
    done
  fi
  cleanup_creds; exit "$rc"
}
trap rollback EXIT

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

python - <<'PY' >/tmp/i6-active-q.txt
import urllib.parse
f="AND(LEN({Replace_Transaction_ID})>0,NOT(OR({Replace_State}='Rolled Back',{Replace_State}='Verified',{Replace_State}='Cleanup Complete',{Replace_State}='Manual Cleanup Required')))"
print(urllib.parse.urlencode([('filterByFormula',f),('maxRecords','3'),('fields[]','Output_ID'),('fields[]','Replace_Transaction_ID'),('fields[]','Replace_State')]))
PY
curl -fsS "https://api.airtable.com/v0/appe33zkZn35yirTL/tblrlPeboBthkplH0?$(cat /tmp/i6-active-q.txt)" -H "Authorization: Bearer $PAT" -o /tmp/i6-active-replace.json
python - <<'PY'
import json
if json.load(open('/tmp/i6-active-replace.json')).get('records',[]): raise SystemExit('Nonterminal replacement transaction exists; refusing live blueprint patch')
PY

# Snapshot current state and construct the desired idempotent state. Calls are deliberately paced.
for sid in "${SIDS[@]}"; do
  make_call GET "$BASE/scenarios/$sid" "/tmp/i6-scenario-before-$sid.json"
  make_call GET "$BASE/scenarios/$sid/blueprint" "/tmp/i6-wrapper-$sid.json"
  python - "$sid" <<'PY'
import json,sys,hashlib
sid=int(sys.argv[1]); s=json.load(open(f'/tmp/i6-scenario-before-{sid}.json')); s=s.get('scenario') or s.get('response') or s
w=json.load(open(f'/tmp/i6-wrapper-{sid}.json')); bp=w.get('blueprint') or (w.get('response') or {}).get('blueprint') or w
json.dump(bp,open(f'/tmp/i6-before-{sid}.json','w'),separators=(',',':'))
open(f'/tmp/i6-before-{sid}.sha','w').write(hashlib.sha256(json.dumps(bp,separators=(',',':'),sort_keys=True).encode()).hexdigest())
open(f'/tmp/i6-before-{sid}.active','w').write('true' if s.get('isActive') else 'false')
PY
  python repair/scripts/patch-item6-transaction-addressing.py "$sid" "/tmp/i6-wrapper-$sid.json" "/tmp/i6-wanted-$sid.json" >"/tmp/i6-change-$sid.json"
done

# Apply only blueprints that still differ. Previously completed scenarios are verified, not rewritten.
for sid in "${SIDS[@]}"; do
  if cmp -s "/tmp/i6-before-$sid.json" "/tmp/i6-wanted-$sid.json"; then
    cp "/tmp/i6-scenario-before-$sid.json" "/tmp/i6-scenario-after-$sid.json"
    cp "/tmp/i6-wrapper-$sid.json" "/tmp/i6-after-wrapper-$sid.json"
    cp "/tmp/i6-before-$sid.sha" "/tmp/i6-after-$sid.sha"
    echo "scenario_${sid}=ALREADY_DESIRED"
    continue
  fi
  make_body "/tmp/i6-wanted-$sid.json" "/tmp/i6-body-$sid.json"
  make_call PATCH "$BASE/scenarios/$sid" "/tmp/i6-patch-resp-$sid.json" "/tmp/i6-body-$sid.json"
  PATCHED+=("$sid")
  make_call GET "$BASE/scenarios/$sid" "/tmp/i6-scenario-after-$sid.json"
  make_call GET "$BASE/scenarios/$sid/blueprint" "/tmp/i6-after-wrapper-$sid.json"
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

# Final read-back of every target after all writes; this proves the partial prior attempt was fully converged.
for sid in "${SIDS[@]}"; do
  make_call GET "$BASE/scenarios/$sid" "/tmp/i6-final-scenario-$sid.json"
  make_call GET "$BASE/scenarios/$sid/blueprint" "/tmp/i6-final-wrapper-$sid.json"
  python - "$sid" <<'PY'
import json,sys,hashlib
sid=int(sys.argv[1]); expected=json.load(open(f'/tmp/i6-wanted-{sid}.json'))
w=json.load(open(f'/tmp/i6-final-wrapper-{sid}.json')); actual=w.get('blueprint') or (w.get('response') or {}).get('blueprint') or w
if actual != expected: raise SystemExit(f'scenario {sid}: final convergence mismatch')
s=json.load(open(f'/tmp/i6-final-scenario-{sid}.json')); s=s.get('scenario') or s.get('response') or s
if ('true' if s.get('isActive') else 'false') != open(f'/tmp/i6-before-{sid}.active').read().strip(): raise SystemExit(f'scenario {sid}: activation drift')
open(f'/tmp/i6-final-{sid}.sha','w').write(hashlib.sha256(json.dumps(actual,separators=(',',':'),sort_keys=True).encode()).hexdigest())
PY
done

python - <<'PY'
import json
sids=[5864632,5813561,5806668,5823581,5862882,5612664,5845193,5791356,5791396,5791424,5813463,5813487,5813511,5813534,5806644,5806597,5823572,5830810,5830609,5830616,5830623]
rows=[]
for sid in sids:
    b=json.load(open(f'/tmp/i6-scenario-before-{sid}.json')); b=b.get('scenario') or b.get('response') or b
    f=json.load(open(f'/tmp/i6-final-scenario-{sid}.json')); f=f.get('scenario') or f.get('response') or f
    c=json.load(open(f'/tmp/i6-change-{sid}.json'))
    before=open(f'/tmp/i6-before-{sid}.sha').read().strip(); final=open(f'/tmp/i6-final-{sid}.sha').read().strip()
    rows.append({'scenario_id':sid,'scenario_name':b.get('name'),'active_before':bool(b.get('isActive')),'active_final':bool(f.get('isActive')),'blueprint_sha256_before_this_run':before,'blueprint_sha256_final':final,'already_desired_at_start':before==final,'patcher_changes':c.get('changes',[])})
out={'repair_item':6,'checkpoint':'transaction-addressed-stage-handoff','result':'PASS','workflow_note':'Converged safely after a prior partial rollout was interrupted by Make HTTP 429 rate limiting. Final run used paced requests and 429 retry/backoff.','scenario_runs':0,'scenario_activation_changes':0,'nonterminal_replacement_transactions_at_start':0,'contract':{'normal_calls':'missing/empty transaction fields are accepted only when Airtable replacement fields are also empty','replacement_calls':'replace_transaction_id and replace_fingerprint must equal the exact Airtable Platform Output before the first mutating/create/finalize step','handoffs':'orchestrator and internal exact-output webhook bodies carry Replace_Transaction_ID and Replace_Fingerprint','youtube':'YT0 idempotency key is replacement-transaction scoped'},'scenarios':rows}
open('/tmp/item6-transaction-addressing-evidence.json','w').write(json.dumps(out,indent=2)); print(json.dumps(out,indent=2))
PY

trap - EXIT
cleanup_creds
rm -f /tmp/i6-active-q.txt
echo 'item6_transaction_addressing=PASS'
