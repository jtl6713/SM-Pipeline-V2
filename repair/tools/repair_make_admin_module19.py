#!/usr/bin/env python3
import copy
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_ID = 'appe33zkZn35yirTL'
SETTINGS_TABLE = 'tblpHPWeEkyJaF7ql'
SCENARIO_ID = 5893243
EXPECTED_NAME = 'MAKE-ADMIN-BRIDGE v1.3 - Airtable Controlled Make API - Direct Webhook Runner'
RESULT_FIELD = 'fldduyTQgkdN6E1wI'
ERROR_FIELD = 'fld6x1xtUD3CxmXdv'
OLD_RESULT = '{{18.data}}'
OLD_ERROR = '{{if(18.statusCode >= 200; if(18.statusCode < 300; ""; 18.data); 18.data)}}'
NEW_RESULT = '{"blueprint_omitted":true,"scenario_id":"{{1.Scenario_ID}}","http_status":"{{18.statusCode}}"}'
NEW_ERROR = '{{if(18.statusCode >= 200; if(18.statusCode < 300; ""; "GET_BLUEPRINT failed; response body omitted"); "GET_BLUEPRINT failed; response body omitted")}}'
TMP = Path('/tmp')


def request_json(url, *, headers=None, method='GET', body=None, expected=(200,)):
    data = None if body is None else json.dumps(body, separators=(',', ':')).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            status = resp.status
            raw = resp.read()
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read()
    if status not in expected:
        raise RuntimeError(f'HTTP {status} from required control endpoint')
    try:
        return json.loads(raw.decode() or '{}')
    except Exception as exc:
        raise RuntimeError('Required control endpoint returned non-JSON') from exc


def load_make_config(airtable_pat):
    formula = 'AND({Active}=1,OR({Setting_Name}="MAKE_API_BASE_URL",{Setting_Name}="MAKE_API_TOKEN",{Setting_Name}="MAKE_ADMIN_BRIDGE_ENABLED"))'
    params = urllib.parse.urlencode([
        ('maxRecords', '10'),
        ('fields[]', 'Setting_Name'),
        ('fields[]', 'Setting_Value'),
        ('fields[]', 'Active'),
        ('filterByFormula', formula),
    ])
    url = f'https://api.airtable.com/v0/{BASE_ID}/{SETTINGS_TABLE}?{params}'
    data = request_json(url, headers={'Authorization': f'Bearer {airtable_pat}'})
    found = {}
    for rec in data.get('records', []):
        f = rec.get('fields', {})
        name = f.get('Setting_Name')
        if name in {'MAKE_API_BASE_URL', 'MAKE_API_TOKEN', 'MAKE_ADMIN_BRIDGE_ENABLED'} and f.get('Active') is True:
            found[name] = str(f.get('Setting_Value', ''))
    missing = sorted(k for k in {'MAKE_API_BASE_URL', 'MAKE_API_TOKEN', 'MAKE_ADMIN_BRIDGE_ENABLED'} if not found.get(k))
    if missing:
        raise RuntimeError('Missing active Make configuration: ' + ','.join(missing))
    if found['MAKE_ADMIN_BRIDGE_ENABLED'].strip().lower() != 'true':
        raise RuntimeError('MAKE_ADMIN_BRIDGE_ENABLED setting is not true')
    return found['MAKE_API_BASE_URL'].rstrip('/'), found['MAKE_API_TOKEN']


def make_headers(token, json_body=False):
    h = {'Authorization': f'Token {token}', 'Accept': 'application/json'}
    if json_body:
        h['Content-Type'] = 'application/json'
    return h


def scenario_object(data):
    if isinstance(data.get('scenario'), dict):
        return data['scenario']
    if isinstance((data.get('response') or {}).get('scenario'), dict):
        return data['response']['scenario']
    return data


def blueprint_object(data):
    bp = (data.get('response') or {}).get('blueprint') or data.get('blueprint')
    if not isinstance(bp, dict):
        raise RuntimeError('Make blueprint response did not contain a blueprint object')
    return bp


def module19(bp):
    matches = []
    def walk(flow):
        for node in flow or []:
            if node.get('id') == 19:
                matches.append(node)
            for route in node.get('routes') or []:
                walk(route.get('flow'))
    walk(bp.get('flow'))
    if len(matches) != 1:
        raise RuntimeError(f'Expected exactly one module 19, found {len(matches)}')
    node = matches[0]
    if node.get('module') != 'airtable:ActionUpdateRecords':
        raise RuntimeError('Module 19 type changed unexpectedly')
    name = (((node.get('metadata') or {}).get('designer') or {}).get('name'))
    if name != '19 - Record GET_BLUEPRINT Result':
        raise RuntimeError('Module 19 name changed unexpectedly')
    return node


def encrypt_backup(source):
    out = TMP / 'make-admin-5893243-blueprint-before.enc'
    env = os.environ.copy()
    if not env.get('CLOUDFLARE_API_TOKEN'):
        raise RuntimeError('CLOUDFLARE_API_TOKEN unavailable for encrypted rollback backup')
    subprocess.run([
        'openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt',
        '-pass', 'env:CLOUDFLARE_API_TOKEN', '-in', str(source), '-out', str(out)
    ], env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return out


def write_blueprint(base_url, token, bp):
    payload = {'blueprint': json.dumps(bp, separators=(',', ':'))}
    return request_json(
        f'{base_url}/scenarios/{SCENARIO_ID}?confirmed=true',
        headers=make_headers(token, True), method='PATCH', body=payload,
        expected=tuple(range(200, 300)),
    )


def assert_scenario_off(base_url, token, label):
    d = request_json(f'{base_url}/scenarios/{SCENARIO_ID}', headers=make_headers(token))
    s = scenario_object(d)
    if int(s.get('id', 0)) != SCENARIO_ID:
        raise RuntimeError(f'{label}: scenario id mismatch')
    if str(s.get('name', '')) != EXPECTED_NAME:
        raise RuntimeError(f'{label}: scenario name mismatch')
    if s.get('isActive') is True:
        raise RuntimeError(f'{label}: MAKE-ADMIN-BRIDGE is active; repair refused')
    return s


def main():
    pat_path = Path(os.environ.get('AIRTABLE_PAT_PATH', '/tmp/airtable-pat.txt'))
    pat = pat_path.read_text().strip()
    if not pat.startswith('pat') or len(pat) < 40:
        raise RuntimeError('Airtable credential structural validation failed')
    base_url, make_token = load_make_config(pat)
    print('make_configuration_loaded=true')

    assert_scenario_off(base_url, make_token, 'before')
    print('scenario_before_off=true')
    response_before = request_json(f'{base_url}/scenarios/{SCENARIO_ID}/blueprint', headers=make_headers(make_token))
    original = copy.deepcopy(blueprint_object(response_before))
    original_path = TMP / 'blueprint-original.json'
    original_path.write_text(json.dumps(original, separators=(',', ':')))
    encrypt_backup(original_path)

    patched = copy.deepcopy(original)
    node = module19(patched)
    record = ((node.get('mapper') or {}).get('record') or {})
    if record.get(RESULT_FIELD) != OLD_RESULT:
        raise RuntimeError('Module 19 Result_JSON mapping no longer matches expected unsafe baseline')
    if record.get(ERROR_FIELD) != OLD_ERROR:
        raise RuntimeError('Module 19 Error_Message mapping no longer matches expected unsafe baseline')
    record[RESULT_FIELD] = NEW_RESULT
    record[ERROR_FIELD] = NEW_ERROR

    reverted = copy.deepcopy(patched)
    rr = ((module19(reverted).get('mapper') or {}).get('record') or {})
    rr[RESULT_FIELD] = OLD_RESULT
    rr[ERROR_FIELD] = OLD_ERROR
    if reverted != original:
        raise RuntimeError('Patch construction changed more than the two approved module 19 mappings')

    patched_path = TMP / 'blueprint-patched.json'
    patched_path.write_text(json.dumps(patched, separators=(',', ':')))
    original_sha = hashlib.sha256(original_path.read_bytes()).hexdigest()
    patched_sha = hashlib.sha256(patched_path.read_bytes()).hexdigest()
    print('module19_patch_constructed=true')

    applied = False
    verified = False
    rollback_verified = None
    try:
        write_blueprint(base_url, make_token, patched)
        applied = True
        response_after = request_json(f'{base_url}/scenarios/{SCENARIO_ID}/blueprint', headers=make_headers(make_token))
        actual = blueprint_object(response_after)
        if actual != patched:
            raise RuntimeError('Post-write blueprint does not exactly equal intended patched blueprint')
        ar = ((module19(actual).get('mapper') or {}).get('record') or {})
        if ar.get(RESULT_FIELD) != NEW_RESULT or ar.get(ERROR_FIELD) != NEW_ERROR:
            raise RuntimeError('Module 19 compact mappings not verified after write')
        assert_scenario_off(base_url, make_token, 'after')
        verified = True
        print('blueprint_exact_postwrite_verification=PASS')
        print('scenario_after_off=true')
    except Exception:
        if applied and not verified:
            try:
                write_blueprint(base_url, make_token, original)
                rollback_now = blueprint_object(request_json(f'{base_url}/scenarios/{SCENARIO_ID}/blueprint', headers=make_headers(make_token)))
                assert_scenario_off(base_url, make_token, 'rollback')
                rollback_verified = rollback_now == original
                if not rollback_verified:
                    print('rollback_verification=FAILED', file=sys.stderr)
            except Exception:
                rollback_verified = False
                print('rollback_execution=FAILED', file=sys.stderr)
        raise
    finally:
        evidence = {
            'scenario_id': SCENARIO_ID,
            'scenario_name': EXPECTED_NAME,
            'scenario_off_before': True,
            'changed_module_id': 19,
            'changed_module_name': '19 - Record GET_BLUEPRINT Result',
            'changed_mapper_fields': [RESULT_FIELD, ERROR_FIELD],
            'result_json_contract': 'bounded summary; full blueprint omitted',
            'original_sha256': original_sha,
            'patched_sha256': patched_sha,
            'write_applied': applied,
            'exact_postwrite_verification': verified,
            'scenario_off_after': verified,
            'rollback_verified_if_needed': rollback_verified,
        }
        (TMP / 'module19-repair-evidence.json').write_text(json.dumps(evidence, indent=2, sort_keys=True))

    if not verified:
        raise RuntimeError('Module 19 repair did not verify')
    print(json.dumps({
        'scenario_id': SCENARIO_ID,
        'module_id': 19,
        'exact_postwrite_verification': True,
        'scenario_off_after': True,
        'full_blueprint_omitted': True,
    }, sort_keys=True))


if __name__ == '__main__':
    main()
