from pathlib import Path

worker_path = Path("apps/studio-api/worker.js")
worker = worker_path.read_text()

replacements = {
    'if (!Number.isInteger(exact) || exact < 1 || exact > 20) {\n        issues.push("Enter an exact carousel slide count from 1 through 20.");\n      }':
        'if (!Number.isInteger(exact) || exact < 1) {\n        issues.push("Enter a valid exact carousel slide count of 1 or more.");\n      }',
    '!Number.isInteger(max) ||\n        min < 1 ||\n        max > 20 ||\n        min > max':
        '!Number.isInteger(max) ||\n        min < 1 ||\n        min > max',
    'issues.push("Enter a valid carousel slide-count range from 1 through 20 with minimum less than or equal to maximum.");':
        'issues.push("Enter a valid carousel slide-count range with minimum at least 1 and minimum less than or equal to maximum.");',
}

for old, new in replacements.items():
    count = worker.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one bridge validation match for {old!r}, found {count}")
    worker = worker.replace(old, new)

old_version = 'version: "0.10.420-unlimited-slide-count"'
new_version = 'version: "0.10.421-unlimited-slide-bridge"'
count = worker.count(old_version)
if count != 1:
    raise SystemExit(f"Expected one Worker version marker, found {count}")
worker = worker.replace(old_version, new_version)
worker_path.write_text(worker)

for test_path in Path("apps/studio-api").glob("*.test.mjs"):
    text = test_path.read_text()
    text = text.replace(r'0\.10\.420-unlimited-slide-count', r'0\.10\.421-unlimited-slide-bridge')
    text = text.replace('0.10.420-unlimited-slide-count', '0.10.421-unlimited-slide-bridge')
    test_path.write_text(text)

regression = Path("apps/studio-api/production-unlimited-slide-count.test.mjs")
text = regression.read_text()
if 'bridge preflight accepts carousel counts above 20' not in text:
    text += r'''

test("bridge preflight accepts carousel counts above 20", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const start = worker.indexOf("function productionRequestCompatibilityIssues");
  const end = worker.indexOf("function productionRequestFields", start);
  const handler = worker.slice(start, end > start ? end : start + 12000);
  assert.ok(start >= 0);
  assert.match(handler, /if \(!Number\.isInteger\(exact\) \|\| exact < 1\)/);
  assert.match(handler, /Enter a valid exact carousel slide count of 1 or more/);
  assert.doesNotMatch(handler, /exact > 20/);
  assert.doesNotMatch(handler, /max > 20/);
  assert.doesNotMatch(handler, /from 1 through 20/);
});
'''
    regression.write_text(text)

deploy = Path("deploy/cloudflare-worker-production.txt")
marker = "Worker: 0.10.421-unlimited-slide-bridge"
current = deploy.read_text()
if marker not in current:
    deploy.write_text(current + """

Deploy Studio API Worker production
Reason: Remove second legacy 20-slide ceiling in source-to-production bridge compatibility preflight
Worker: 0.10.421-unlimited-slide-bridge
Requested: 2026-09-28
""")
