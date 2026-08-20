from pathlib import Path


def replace_exact(path, old, new, expected=1):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrence(s), found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")


worker = "apps/studio-api/worker.js"
index = "apps/studio-web/index.html"
app = "apps/studio-web/assets/app-item4-0619.js"

replace_exact(
    worker,
    'version: "0.10.36-manual-ideas-progress",',
    'version: "0.10.37-manual-idea-count-entry",',
)
replace_exact(
    worker,
    'studio_manual_idea_progress_v1: true,',
    'studio_manual_idea_progress_v1: true,\n          studio_manual_idea_count_range: "1-10",',
)
replace_exact(
    worker,
    'const STUDIO_IDEA_ALLOWED_COUNTS = new Set([5, 10, 25, 50, 100]);',
    'const STUDIO_IDEA_MIN_COUNT = 1;\nconst STUDIO_IDEA_MAX_COUNT = 10;',
)
replace_exact(
    worker,
    'if (!STUDIO_IDEA_ALLOWED_COUNTS.has(count)) throw new HttpError(400, "Idea count must be 5, 10, 25, 50, or 100");',
    'if (!Number.isInteger(count) || count < STUDIO_IDEA_MIN_COUNT || count > STUDIO_IDEA_MAX_COUNT) throw new HttpError(400, "Idea count must be a whole number from 1 to 10");',
)

replace_exact(
    index,
    '<label class="form-field"><span>Ideas</span><select id="ideaGenerateCount"><option>5</option><option>10</option><option selected>25</option><option>50</option><option>100</option></select></label>',
    '<label class="form-field"><span>Ideas</span><input id="ideaGenerateCount" type="number" min="1" max="10" step="1" value="5" inputmode="numeric" required></label>',
)
replace_exact(index, '0.6.69-idea-progress', '0.6.70-idea-count-entry', expected=3)
replace_exact(index, 'UI build 0.6.69', 'UI build 0.6.70')

replace_exact(
    app,
    'const BUILD_ID = "item4-0.6.69-idea-progress";',
    'const BUILD_ID = "item4-0.6.70-idea-count-entry";',
)
replace_exact(
    app,
    'if ($("ideaGenerateCount")) $("ideaGenerateCount").value = "25";',
    'if ($("ideaGenerateCount")) $("ideaGenerateCount").value = "5";',
)
replace_exact(
    app,
    'const count = Number($("ideaGenerateCount")?.value || 25);\n    const quality = String($("ideaGenerateQuality")?.value || "Highest Quality");\n    const button = $("ideaGenerateSubmit");',
    'const count = Number($("ideaGenerateCount")?.value || 5);\n    const quality = String($("ideaGenerateQuality")?.value || "Highest Quality");\n    const button = $("ideaGenerateSubmit");\n    if (!Number.isInteger(count) || count < 1 || count > 10) {\n      setIdeaGenerateMessage("Enter a whole number from 1 to 10.", "error-text");\n      $("ideaGenerateCount")?.focus();\n      return;\n    }',
)

print("studio_idea_count_entry_patch=PASS")
