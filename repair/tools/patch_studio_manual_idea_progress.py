from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "apps/studio-api/worker.js"
JS = ROOT / "apps/studio-web/assets/app-item4-0619.js"
HTML = ROOT / "apps/studio-web/index.html"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


def patch_worker(text: str) -> str:
    text = replace_once(
        text,
        '          version: "0.10.35-manual-ideas",\n          studio_manual_idea_generation_v1: true,',
        '          version: "0.10.36-manual-ideas-progress",\n          studio_manual_idea_generation_v1: true,\n          studio_manual_idea_progress_v1: true,',
        "worker health/version",
    )

    old = '''    await phase6SetScenarioActive(env, STUDIO_IDEA_I1_SCENARIO_ID, true);\n    started = true;\n    // Proven interval-scenario behavior: /start launches one execution. Give the\n    // execution time to consume the exact profile bundle; do not race it with /run.\n    await new Promise((resolve) => setTimeout(resolve, 6500));'''
    new = '''    await phase6SetScenarioActive(env, STUDIO_IDEA_I1_SCENARIO_ID, true);\n    started = true;\n\n    // Manual generation must explicitly request one execution. Some Make schedule\n    // types launch immediately on /start while others only become active. Calling\n    // /run makes the one-shot contract deterministic; if /start already launched\n    // the execution, Make returns a running/422 response and we simply keep the\n    // activation-triggered run.\n    let executionId = null;\n    try {\n      const run = await phase6RunScenario(env, STUDIO_IDEA_I1_SCENARIO_ID);\n      executionId = run?.executionId || null;\n    } catch (runError) {\n      const message = String(runError?.message || runError || "");\n      if (!/422|already.*running|currently.*running|active execution/i.test(message)) throw runError;\n    }\n    if (executionId) {\n      await studioIdeaUpdateBatch(env, batchRecord.id, { Make_Execution_ID: String(executionId) });\n    }\n\n    // Leave the exact selector and manual overrides in place long enough for the\n    // Make execution to consume Module 2, then restore the production blueprint\n    // and OFF state in finally.\n    await new Promise((resolve) => setTimeout(resolve, 6500));'''
    text = replace_once(text, old, new, "manual I1 explicit execution")
    return text


def patch_js(text: str) -> str:
    text = replace_once(
        text,
        '  const BUILD_ID = "item4-0.6.68-idea-generator";',
        '  const BUILD_ID = "item4-0.6.69-idea-progress";',
        "UI build id",
    )
    text = replace_once(
        text,
        '      setIdeaGenerateMessage(generated > 0 && requested > 0 ? `${generated} of ${requested} complete` : "Generating ideas…");\n      ideaGenerationPollTimer = setTimeout(pollIdeaGenerationBatch, 3000);',
        '      setIdeaGenerateMessage(requested > 0 ? `${generated} of ${requested} complete` : "Generating ideas…");\n      ideaGenerationPollTimer = setTimeout(pollIdeaGenerationBatch, 1000);',
        "live batch progress polling",
    )
    text = replace_once(
        text,
        '      setIdeaGenerateMessage("Generating ideas…");\n      ideaGenerationPollTimer = setTimeout(pollIdeaGenerationBatch, 1800);',
        '      setIdeaGenerateMessage(`0 of ${count} complete`);\n      ideaGenerationPollTimer = setTimeout(pollIdeaGenerationBatch, 500);',
        "initial 0-of-N progress",
    )
    return text


def patch_html(text: str) -> str:
    text = text.replace('0.6.68-idea-generator', '0.6.69-idea-progress')
    text = text.replace('UI build 0.6.68', 'UI build 0.6.69')
    return text


worker = patch_worker(WORKER.read_text(encoding="utf-8"))
js = patch_js(JS.read_text(encoding="utf-8"))
html = patch_html(HTML.read_text(encoding="utf-8"))

WORKER.write_text(worker, encoding="utf-8")
JS.write_text(js, encoding="utf-8")
HTML.write_text(html, encoding="utf-8")

print("patched Studio manual idea execution + progress")
