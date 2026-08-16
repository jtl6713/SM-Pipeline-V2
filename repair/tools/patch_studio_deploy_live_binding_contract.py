from pathlib import Path

path = Path('.github/workflows/deploy-cloudflare-worker-production.yml')
text = path.read_text()
original = text

old = "'AIRTABLE_PAT':'secret_text','ALLOWED_ORIGINS':'plain_text','ELEVENLABS_API_KEY':'secret_text',"
new = "'AIRTABLE_PAT':'secret_text','ALLOWED_ORIGINS':'plain_text',"
count = text.count(old)
if count != 2:
    raise SystemExit(f'expected exactly two binding-contract occurrences; found {count}')
text = text.replace(old, new)

old_secret = "'secrets':{'required':['AIRTABLE_PAT','ELEVENLABS_API_KEY']}"
if text.count(old_secret) != 1:
    raise SystemExit('expected exactly one Wrangler required-secret contract')
text = text.replace(old_secret, "'secrets':{'required':['AIRTABLE_PAT']}", 1)

old_name = 'Verify active source and exact 11-binding contract'
if text.count(old_name) != 1:
    raise SystemExit('expected exact 11-binding step name once')
text = text.replace(old_name, 'Verify active source and exact live binding contract', 1)

if text == original:
    raise SystemExit('deploy binding contract patch made no change')
path.write_text(text)
print('binding_contract_occurrences_updated=2')
print('required_secret_contract=AIRTABLE_PAT')
