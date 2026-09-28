from pathlib import Path

worker_path = Path("apps/studio-api/worker.js")
worker = worker_path.read_text()

replacements = {
    # Source-to-production bridge compatibility preflight.
    'if (!Number.isInteger(exact) || exact < 1 || exact > 20) {\n        issues.push("Enter an exact carousel slide count from 1 through 20.");\n      }':
        'if (!Number.isInteger(exact) || exact < 1) {\n        issues.push("Enter a valid exact carousel slide count of 1 or more.");\n      }',
    '!Number.isInteger(max) ||\n        min < 1 ||\n        max > 20 ||\n        min > max':
        '!Number.isInteger(max) ||\n        min < 1 ||\n        min > max',
    'issues.push("Enter a valid carousel slide-count range from 1 through 20 with minimum less than or equal to maximum.");':
        'issues.push("Enter a valid carousel slide-count range with minimum at least 1 and minimum less than or equal to maximum.");',

    # Promotion payload cleaner used by Approve.
    'if (carouselSlideCount < 1 || carouselSlideCount > 20) {\n    throw new HttpError(400, "Carousel slide count must be between 1 and 20");\n  }':
        'if (carouselSlideCount < 1) {\n    throw new HttpError(400, "Carousel slide count must be at least 1");\n  }',
    'nullableInt(payload?.carousel_slide_count_min, 1, 20, "Minimum photo count")':
        'nullableInt(payload?.carousel_slide_count_min, 1, Number.MAX_SAFE_INTEGER, "Minimum photo count")',
    'nullableInt(payload?.carousel_slide_count_max, 1, 20, "Maximum photo count")':
        'nullableInt(payload?.carousel_slide_count_max, 1, Number.MAX_SAFE_INTEGER, "Maximum photo count")',

    # Per-output effective work-item validation.
    'effective.carousel_slide_count_exact < 1 ||\n       effective.carousel_slide_count_exact > 20':
        'effective.carousel_slide_count_exact < 1',
    'effective.carousel_slide_count_min < 1 ||\n       effective.carousel_slide_count_max > 20 ||\n       effective.carousel_slide_count_min > effective.carousel_slide_count_max':
        'effective.carousel_slide_count_min < 1 ||\n       effective.carousel_slide_count_min > effective.carousel_slide_count_max',

    # Output overrides are Production directives, not native platform limits.
    'intField("carousel_slide_count_exact_override", "Carousel_Slide_Count_Exact_Override", 1, 20, "Exact carousel slide count override")':
        'intField("carousel_slide_count_exact_override", "Carousel_Slide_Count_Exact_Override", 1, Number.MAX_SAFE_INTEGER, "Exact carousel slide count override")',
    'intField("carousel_slide_count_min_override", "Carousel_Slide_Count_Min_Override", 1, 20, "Minimum carousel slide count override")':
        'intField("carousel_slide_count_min_override", "Carousel_Slide_Count_Min_Override", 1, Number.MAX_SAFE_INTEGER, "Minimum carousel slide count override")',
    'intField("carousel_slide_count_max_override", "Carousel_Slide_Count_Max_Override", 1, 20, "Maximum carousel slide count override")':
        'intField("carousel_slide_count_max_override", "Carousel_Slide_Count_Max_Override", 1, Number.MAX_SAFE_INTEGER, "Maximum carousel slide count override")',

    # Production AI quantity should follow the requested count rather than clamp to 20.
    'return Math.max(1, Math.min(20, Math.round(exact)))':
        'return Math.max(1, Math.round(exact))',
    'return Math.max(1, Math.min(20, Math.round(origin.aiCount)))':
        'return Math.max(1, Math.round(origin.aiCount))',

    # Manual/listening photo range should not silently cap at 20.
    'Number.isFinite(requestedMin) && requestedMin >= 1 && requestedMin <= 20':
        'Number.isFinite(requestedMin) && requestedMin >= 1',
    'Number.isFinite(requestedMax) && requestedMax >= min && requestedMax <= 20':
        'Number.isFinite(requestedMax) && requestedMax >= min',
}

for old, new in replacements.items():
    count = worker.count(old)
    if count == 0:
        # Some bridge replacements may already have been applied by the previous repair.
        if old in {
            'if (!Number.isInteger(exact) || exact < 1 || exact > 20) {\n        issues.push("Enter an exact carousel slide count from 1 through 20.");\n      }',
            '!Number.isInteger(max) ||\n        min < 1 ||\n        max > 20 ||\n        min > max',
            'issues.push("Enter a valid carousel slide-count range from 1 through 20 with minimum less than or equal to maximum.");',
        }:
            continue
        raise SystemExit(f"Expected match for {old!r}, found none")
    worker = worker.replace(old, new)

old_version = 'version: "0.10.421-unlimited-slide-bridge"'
new_version = 'version: "0.10.422-unlimited-production-slides"'
count = worker.count(old_version)
if count != 1:
    raise SystemExit(f"Expected one Worker version marker, found {count}")
worker = worker.replace(old_version, new_version)
worker_path.write_text(worker)

for test_path in Path("apps/studio-api").glob("*.test.mjs"):
    text = test_path.read_text()
    text = text.replace(r'0\.10\.421-unlimited-slide-bridge', r'0\.10\.422-unlimited-production-slides')
    text = text.replace('0.10.421-unlimited-slide-bridge', '0.10.422-unlimited-production-slides')
    test_path.write_text(text)

regression = Path("apps/studio-api/production-unlimited-slide-count.test.mjs")
text = regression.read_text()
if 'approve path has no internal 20-slide ceiling' not in text:
    text += r'''

test("approve path has no internal 20-slide ceiling", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");

  const promoteStart = worker.indexOf("function cleanPromotionPayload");
  const promoteEnd = worker.indexOf("function promotionWebhookUrl", promoteStart);
  assert.ok(promoteStart >= 0 && promoteEnd > promoteStart);
  const promotion = worker.slice(promoteStart, promoteEnd);
  assert.doesNotMatch(promotion, /> 20/);
  assert.doesNotMatch(promotion, /1, 20/);
  assert.match(promotion, /Carousel slide count must be at least 1/);

  const workStart = worker.indexOf("function outputWorkItemIssues");
  const workEnd = worker.indexOf("async function buildOutputWorkItemEffective", workStart);
  assert.ok(workStart >= 0 && workEnd > workStart);
  const work = worker.slice(workStart, workEnd);
  assert.doesNotMatch(work, /> 20/);

  const overrideStart = worker.indexOf("function cleanProductionRequestOutputPatch");
  const overrideEnd = worker.indexOf("async function getProductionRequestOutput", overrideStart);
  assert.ok(overrideStart >= 0 && overrideEnd > overrideStart);
  const overrides = worker.slice(overrideStart, overrideEnd);
  assert.doesNotMatch(overrides, /Carousel_Slide_Count_.*1, 20/);
});
'''
    regression.write_text(text)

deploy = Path("deploy/cloudflare-worker-production.txt")
marker = "Worker: 0.10.422-unlimited-production-slides"
current = deploy.read_text()
if marker not in current:
    deploy.write_text(current + """

Deploy Studio API Worker production
Reason: Remove all remaining internal 20-slide Production ceilings from Approve, bridge, output validation, overrides, AI count, and photo-listening directives
Worker: 0.10.422-unlimited-production-slides
Requested: 2026-09-28
""")
