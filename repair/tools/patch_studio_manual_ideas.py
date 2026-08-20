from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "apps/studio-api/worker.js"
HTML = ROOT / "apps/studio-web/index.html"
JS = ROOT / "apps/studio-web/assets/app-item4-0619.js"
CSS = ROOT / "apps/studio-web/assets/styles-phase7-0617.css"

MARKER = "STUDIO_MANUAL_IDEA_GENERATOR_V1"


def replace_once(text, old, new, label):
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


def patch_worker(text):
    if MARKER in text:
        return text

    text = replace_once(
        text,
        '      const isIdeaProductionRequestRoute = /^\\/api\\/ideas\\/rec[A-Za-z0-9]+\\/production-request$/.test(url.pathname);',
        '      const isIdeaProductionRequestRoute = /^\\/api\\/ideas\\/rec[A-Za-z0-9]+\\/production-request$/.test(url.pathname);\n'
        '      const isIdeaGenerateRoute = url.pathname === "/api/ideas/generate";\n'
        '      const isIdeaGenerateStatusRoute = /^\\/api\\/ideas\\/generate\\/rec[A-Za-z0-9]+$/.test(url.pathname);',
        "worker idea route predicates",
    )
    text = replace_once(
        text,
        '      const isIdeaCreateRoute = url.pathname === "/api/ideas" && request.method === "POST";',
        '      const isIdeaCreateRoute = url.pathname === "/api/ideas" && request.method === "POST";\n'
        '      const isIdeaGenerateWrite = isIdeaGenerateRoute && request.method === "POST";',
        "worker idea write predicate",
    )
    text = replace_once(
        text,
        '        isIdeaCreateRoute ||\n        isIdeaEditRoute ||',
        '        isIdeaCreateRoute ||\n        isIdeaGenerateWrite ||\n        isIdeaEditRoute ||',
        "worker allowed methods",
    )
    text = replace_once(
        text,
        '          version: "0.10.34-public-cover-handoff",',
        '          version: "0.10.35-manual-ideas",\n          studio_manual_idea_generation_v1: true,',
        "worker version",
    )
    route_anchor = '''      if (url.pathname === "/api/ideas") {
        if (request.method === "POST") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "ideas_create");
          return createIdea(request, env, authorization);
        }
        return listIdeas(request, env, url);
      }
'''
    route_new = '''      if (isIdeaGenerateRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_create");
        return startStudioIdeaGeneration(request, env, authorization, ctx);
      }

      if (isIdeaGenerateStatusRoute) {
        return studioIdeaGenerationStatus(request, env, url, authorization);
      }

''' + route_anchor
    text = replace_once(text, route_anchor, route_new, "worker idea route handler")

    append = r'''

// STUDIO_MANUAL_IDEA_GENERATOR_V1
// Manual/on-demand Idea generation reuses canonical I1, but temporarily scopes
// Module 2 to exactly one Content Profile while I1 is inactive. The original
// blueprint and OFF state are restored after admission so scheduled operation
// remains unchanged and unrelated profiles cannot be consumed by a manual run.
const STUDIO_IDEA_I1_SCENARIO_ID = 5514334;
const STUDIO_IDEA_PROFILE_TABLE_ID = "tblNYg2QB0BmmVACy";
const STUDIO_IDEA_BATCH_TABLE_ID = "tblpCKSqcTpDtyst3";
const STUDIO_IDEA_ALLOWED_COUNTS = new Set([5, 10, 25, 50, 100]);
const STUDIO_IDEA_ALLOWED_QUALITIES = new Set(["Highest Quality", "Balanced", "Quantity"]);

function studioIdeaBatchRecordIdFromPath(url) {
  const match = /^\/api\/ideas\/generate\/(rec[A-Za-z0-9]+)$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid idea-generation batch path");
  return match[1];
}

function studioIdeaBatchView(record) {
  const requested = Math.max(0, Number(f(record, "Requested_Count")) || 0);
  const candidates = Array.isArray(f(record, "Idea Candidates")) ? f(record, "Idea Candidates") : [];
  return {
    id: record.id,
    batch_id: String(f(record, "Batch_ID") || ""),
    status: String(f(record, "Status") || "Pending"),
    requested_count: requested,
    generated_count: candidates.length,
    quality: String(f(record, "Quality") || "Balanced"),
    requested_at: f(record, "Requested_At") || null,
    completed_at: f(record, "Completed_At") || null,
    error: f(record, "Error") || null,
  };
}

async function studioIdeaEnabledProfile(env) {
  const formula = 'AND({Active}=1,{Idea_Generation_Enabled}=1)';
  const query = `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=2`;
  const body = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, query);
  const records = Array.isArray(body?.records) ? body.records : [];
  if (!records.length) throw new HttpError(409, "No active idea-generation profile is configured");
  if (records.length > 1) {
    throw new HttpError(409, "More than one idea-generation profile is active. Selectable profiles must be added before manual generation can run safely.");
  }
  const profile = records[0];
  const existingBatch = Array.isArray(f(profile, "Manual_Idea_Batch")) ? f(profile, "Manual_Idea_Batch") : [];
  if (existingBatch.length) throw new HttpError(409, "Another manual idea batch is already starting. Try again after it finishes.");
  return profile;
}

async function studioIdeaCreateBatch(env, profile, count, quality, authorization) {
  const stamp = new Date().toISOString();
  const random = crypto.randomUUID().split("-")[0].toUpperCase();
  const batchId = `IDEAS-${stamp.slice(0, 10).replace(/-/g, "")}-${random}`;
  const body = await airtableFetch(env, STUDIO_IDEA_BATCH_TABLE_ID, "", {
    method: "POST",
    body: JSON.stringify({
      records: [{ fields: {
        Batch_ID: batchId,
        Status: "Pending",
        Requested_Count: count,
        Quality: quality,
        Generated_Count: 0,
        Requested_At: stamp,
        Requested_By: authorization?.email || null,
        Content_Profile: [profile.id],
      }}],
      typecast: true,
    }),
  });
  const record = body?.records?.[0];
  if (!record?.id) throw new HttpError(502, "Studio could not create the idea-generation batch");
  return record;
}

async function studioIdeaUpdateBatch(env, recordId, fields) {
  return airtableFetch(env, STUDIO_IDEA_BATCH_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}

async function studioIdeaSetProfileOverrides(env, profileId, batchRecordId, count, quality) {
  return airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Manual_Idea_Count_Override: count,
        Manual_Idea_Quality_Override: quality,
        Manual_Idea_Batch: [batchRecordId],
      },
      typecast: true,
    }),
  });
}

async function studioIdeaClearProfileOverrides(env, profileId) {
  return airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Manual_Idea_Count_Override: null,
        Manual_Idea_Quality_Override: null,
        Manual_Idea_Batch: [],
      },
      typecast: true,
    }),
  });
}

function studioIdeaUnwrapBlueprint(body) {
  const value = body?.blueprint ?? body?.response?.blueprint ?? body;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === "object" ? value : null;
}

async function studioIdeaReadI1Blueprint(env) {
  const body = await phase6MakeApiJson(env, `/scenarios/${STUDIO_IDEA_I1_SCENARIO_ID}/blueprint?draft=false`, { method: "GET" });
  const blueprint = studioIdeaUnwrapBlueprint(body);
  if (!blueprint?.flow) throw new HttpError(502, "I1 did not return a usable live blueprint");
  return blueprint;
}

async function studioIdeaWriteI1Blueprint(env, blueprint) {
  await phase6MakeApiJson(env, `/scenarios/${STUDIO_IDEA_I1_SCENARIO_ID}?confirmed=true`, {
    method: "PATCH",
    body: JSON.stringify({ blueprint: JSON.stringify(blueprint) }),
  });
}

async function studioIdeaInstallExactProfileSelector(env, profileId) {
  const original = await studioIdeaReadI1Blueprint(env);
  const patched = JSON.parse(JSON.stringify(original));
  const module2 = phase6FindModule(patched.flow, 2);
  if (!module2 || module2.module !== "airtable:ActionSearchRecords") {
    throw new HttpError(409, "I1 Module 2 profile selector contract has drifted");
  }
  module2.mapper = module2.mapper || {};
  module2.mapper.formula = `AND(RECORD_ID()="${String(profileId).replace(/"/g, "")}",{Active}=1,{Idea_Generation_Enabled}=1)`;
  module2.mapper.maxRecords = "1";
  await studioIdeaWriteI1Blueprint(env, patched);
  const verified = await studioIdeaReadI1Blueprint(env);
  const verified2 = phase6FindModule(verified.flow, 2);
  if (String(verified2?.mapper?.formula || "") !== module2.mapper.formula || String(verified2?.mapper?.maxRecords || "") !== "1") {
    throw new HttpError(502, "I1 exact-profile selector verification failed");
  }
  return original;
}

async function studioIdeaExecuteBatch(env, profile, batchRecord) {
  let originalBlueprint = null;
  let started = false;
  const startedAt = new Date().toISOString();
  try {
    await studioIdeaUpdateBatch(env, batchRecord.id, { Status: "Running", Started_At: startedAt, Error: null });
    originalBlueprint = await studioIdeaInstallExactProfileSelector(env, profile.id);
    await phase6SetScenarioActive(env, STUDIO_IDEA_I1_SCENARIO_ID, true);
    started = true;
    // Proven interval-scenario behavior: /start launches one execution. Give the
    // execution time to consume the exact profile bundle; do not race it with /run.
    await new Promise((resolve) => setTimeout(resolve, 6500));
  } catch (error) {
    try {
      await studioIdeaUpdateBatch(env, batchRecord.id, {
        Status: "Failed",
        Completed_At: new Date().toISOString(),
        Error: String(error?.message || error || "Idea generation failed").slice(0, 10000),
      });
    } catch {}
    throw error;
  } finally {
    if (started) {
      try { await phase6StopScenarioVerified(env, STUDIO_IDEA_I1_SCENARIO_ID, 4); } catch (error) { console.error("Could not restore I1 OFF", error); }
    }
    if (originalBlueprint) {
      try { await studioIdeaWriteI1Blueprint(env, originalBlueprint); } catch (error) { console.error("Could not restore I1 blueprint", error); }
    }
    try { await studioIdeaClearProfileOverrides(env, profile.id); } catch (error) { console.error("Could not clear manual idea overrides", error); }
  }
}

async function startStudioIdeaGeneration(request, env, authorization, ctx = null) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const count = Number(payload?.count);
  const quality = String(payload?.quality || "Highest Quality").trim();
  if (!STUDIO_IDEA_ALLOWED_COUNTS.has(count)) throw new HttpError(400, "Idea count must be 5, 10, 25, 50, or 100");
  if (!STUDIO_IDEA_ALLOWED_QUALITIES.has(quality)) throw new HttpError(400, "Quality must be Highest Quality, Balanced, or Quantity");

  const scenario = await phase6ScenarioState(env, STUDIO_IDEA_I1_SCENARIO_ID);
  if (scenario?.isActive) {
    throw new HttpError(409, "The scheduled idea generator is currently active. Try manual generation after that run finishes.");
  }
  const profile = await studioIdeaEnabledProfile(env);
  const batch = await studioIdeaCreateBatch(env, profile, count, quality, authorization);
  try {
    await studioIdeaSetProfileOverrides(env, profile.id, batch.id, count, quality);
  } catch (error) {
    await studioIdeaUpdateBatch(env, batch.id, { Status: "Failed", Completed_At: new Date().toISOString(), Error: String(error?.message || error).slice(0, 10000) });
    throw error;
  }

  const task = studioIdeaExecuteBatch(env, profile, batch).catch((error) => console.error("Manual idea generation background task failed", error));
  if (ctx?.waitUntil) ctx.waitUntil(task); else await task;

  return respond(request, env, {
    ok: true,
    accepted: true,
    batch_record_id: batch.id,
    batch_id: String(f(batch, "Batch_ID") || ""),
    requested_count: count,
    quality,
    status: "Pending",
    message: "Idea generation started.",
  }, 202);
}

async function studioIdeaGenerationStatus(request, env, url) {
  const recordId = studioIdeaBatchRecordIdFromPath(url);
  let record = await airtableFetch(env, STUDIO_IDEA_BATCH_TABLE_ID, recordId);
  let view = studioIdeaBatchView(record);
  const now = Date.now();
  const requestedAt = view.requested_at ? Date.parse(view.requested_at) : now;
  const ageMs = Number.isFinite(requestedAt) ? Math.max(0, now - requestedAt) : 0;
  const updates = {};

  if (view.generated_count !== Number(f(record, "Generated_Count") || 0)) updates.Generated_Count = view.generated_count;
  if (view.requested_count > 0 && view.generated_count >= view.requested_count && view.status !== "Complete") {
    updates.Status = "Complete";
    updates.Completed_At = new Date().toISOString();
    updates.Error = null;
  } else if (["Pending", "Running"].includes(view.status) && ageMs > 15 * 60 * 1000) {
    updates.Status = "Failed";
    updates.Completed_At = new Date().toISOString();
    updates.Error = `Generation stopped after creating ${view.generated_count} of ${view.requested_count} requested ideas.`;
  }

  if (Object.keys(updates).length) {
    record = await studioIdeaUpdateBatch(env, recordId, updates);
    view = studioIdeaBatchView(record);
  }
  return respond(request, env, { ok: true, batch: view });
}
// STUDIO_MANUAL_IDEA_GENERATOR_V1_END
'''
    return text.rstrip() + append + "\n"


def patch_html(text):
    if 'id="ideaGeneratePanel"' in text:
        return text
    actions = '<div class="heading-actions"><button class="secondary-button" data-refresh="ideas">Refresh</button><button class="primary-button" id="newIdeaButton">+ New idea</button></div>'
    new_actions = '<div class="heading-actions"><button class="secondary-button" data-refresh="ideas">Refresh</button><button class="secondary-button" id="generateIdeasButton">Generate AI ideas</button><button class="primary-button" id="newIdeaButton">+ New idea</button></div>'
    text = replace_once(text, actions, new_actions, "ideas heading actions")
    create_anchor = '<section class="panel idea-create-panel" id="ideaCreatePanel" hidden>'
    generator = '''<section class="panel idea-generate-panel" id="ideaGeneratePanel" hidden>
 <form id="ideaGenerateForm" class="idea-generate-form">
 <div class="idea-generate-fields">
 <label class="form-field"><span>Ideas</span><select id="ideaGenerateCount"><option>5</option><option>10</option><option selected>25</option><option>50</option><option>100</option></select></label>
 <label class="form-field"><span>Quality</span><select id="ideaGenerateQuality"><option selected>Highest Quality</option><option>Balanced</option><option>Quantity</option></select></label>
 </div>
 <div class="idea-generate-actions"><button type="submit" class="primary-button" id="ideaGenerateSubmit">Generate Ideas</button><button type="button" class="secondary-button" id="ideaGenerateCancel">Cancel</button></div>
 <div class="form-message" id="ideaGenerateMessage" aria-live="polite"></div>
 <div class="idea-generate-complete" id="ideaGenerateComplete" hidden><button type="button" class="primary-button" id="ideaGenerateView">View Ideas</button><button type="button" class="secondary-button" id="ideaGenerateMore">Generate More</button></div>
 </form>
 </section>
 ''' + create_anchor
    text = replace_once(text, create_anchor, generator, "ideas generator panel")
    text = text.replace('0.6.67-public-covers', '0.6.68-idea-generator')
    text = text.replace('UI build 0.6.67', 'UI build 0.6.68')
    return text


def patch_js(text):
    if 'STUDIO_MANUAL_IDEA_GENERATOR_UI_V1' in text:
        return text
    text = replace_once(
        text,
        '  let activeIdea = null;\n  let ideasCache = [];',
        '  let activeIdea = null;\n  let ideasCache = [];\n  let activeIdeaGenerationBatchId = null;\n  let ideaGenerationPollTimer = null;\n  let ideaGenerationInFlight = false;',
        "js idea state",
    )
    text = re.sub(r'  const BUILD_ID = "item4-[^"]+";', '  const BUILD_ID = "item4-0.6.68-idea-generator";', text, count=1)
    anchor = '  function setIdeaFormOpen(open, { mode = null } = {}) {'
    block = r'''  // STUDIO_MANUAL_IDEA_GENERATOR_UI_V1
  function stopIdeaGenerationPoll() {
    if (ideaGenerationPollTimer) clearTimeout(ideaGenerationPollTimer);
    ideaGenerationPollTimer = null;
  }

  function setIdeaGenerateMessage(text = "", type = "") {
    const node = $("ideaGenerateMessage");
    if (!node) return;
    node.textContent = text;
    node.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function setIdeaGeneratorOpen(open, { reset = false } = {}) {
    const panel = $("ideaGeneratePanel");
    if (!panel) return;
    panel.hidden = !open;
    if (open) setIdeaFormOpen(false);
    if (reset) {
      stopIdeaGenerationPoll();
      activeIdeaGenerationBatchId = null;
      ideaGenerationInFlight = false;
      $("ideaGenerateForm")?.reset();
      if ($("ideaGenerateCount")) $("ideaGenerateCount").value = "25";
      if ($("ideaGenerateQuality")) $("ideaGenerateQuality").value = "Highest Quality";
      if ($("ideaGenerateSubmit")) {
        $("ideaGenerateSubmit").disabled = false;
        $("ideaGenerateSubmit").textContent = "Generate Ideas";
      }
      if ($("ideaGenerateComplete")) $("ideaGenerateComplete").hidden = true;
      setIdeaGenerateMessage();
    }
  }

  async function pollIdeaGenerationBatch() {
    if (!activeIdeaGenerationBatchId) return;
    try {
      const result = await api(`/api/ideas/generate/${encodeURIComponent(activeIdeaGenerationBatchId)}`);
      const batch = result.batch || {};
      const generated = Number(batch.generated_count || 0);
      const requested = Number(batch.requested_count || 0);
      if (batch.status === "Complete") {
        stopIdeaGenerationPoll();
        ideaGenerationInFlight = false;
        if ($("ideaGenerateSubmit")) {
          $("ideaGenerateSubmit").disabled = false;
          $("ideaGenerateSubmit").textContent = "Generate Ideas";
        }
        setIdeaGenerateMessage(`${generated || requested} ideas created${batch.batch_id ? ` · ${batch.batch_id}` : ""}.`, "success");
        if ($("ideaGenerateComplete")) $("ideaGenerateComplete").hidden = false;
        await Promise.all([loadIdeas(), loadDashboard()]);
        return;
      }
      if (batch.status === "Failed") {
        stopIdeaGenerationPoll();
        ideaGenerationInFlight = false;
        if ($("ideaGenerateSubmit")) {
          $("ideaGenerateSubmit").disabled = false;
          $("ideaGenerateSubmit").textContent = "Retry";
        }
        setIdeaGenerateMessage(batch.error || "Unable to generate ideas. Try again.", "error-text");
        return;
      }
      setIdeaGenerateMessage(generated > 0 && requested > 0 ? `${generated} of ${requested} complete` : "Generating ideas…");
      ideaGenerationPollTimer = setTimeout(pollIdeaGenerationBatch, 3000);
    } catch (error) {
      setIdeaGenerateMessage(error.message || "Could not check idea generation. Retrying…", "error-text");
      ideaGenerationPollTimer = setTimeout(pollIdeaGenerationBatch, 5000);
    }
  }

  $("generateIdeasButton")?.addEventListener("click", () => setIdeaGeneratorOpen(true, { reset: !ideaGenerationInFlight }));
  $("ideaGenerateCancel")?.addEventListener("click", () => setIdeaGeneratorOpen(false));
  $("ideaGenerateMore")?.addEventListener("click", () => setIdeaGeneratorOpen(true, { reset: true }));
  $("ideaGenerateView")?.addEventListener("click", async () => {
    await loadIdeas();
    setIdeaGeneratorOpen(false);
    $("ideasList")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("ideaGenerateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ideaGenerationInFlight) return;
    const count = Number($("ideaGenerateCount")?.value || 25);
    const quality = String($("ideaGenerateQuality")?.value || "Highest Quality");
    const button = $("ideaGenerateSubmit");
    ideaGenerationInFlight = true;
    stopIdeaGenerationPoll();
    if (button) { button.disabled = true; button.textContent = "Generating…"; }
    if ($("ideaGenerateComplete")) $("ideaGenerateComplete").hidden = true;
    setIdeaGenerateMessage("Starting idea generation…");
    try {
      const result = await api("/api/ideas/generate", {
        method: "POST",
        body: JSON.stringify({ count, quality }),
        timeoutMs: 30000,
      });
      activeIdeaGenerationBatchId = result.batch_record_id;
      if (!activeIdeaGenerationBatchId) throw new Error("Studio did not return an idea batch ID.");
      setIdeaGenerateMessage("Generating ideas…");
      ideaGenerationPollTimer = setTimeout(pollIdeaGenerationBatch, 1800);
    } catch (error) {
      ideaGenerationInFlight = false;
      if (button) { button.disabled = false; button.textContent = "Retry"; }
      setIdeaGenerateMessage(error.message || "Unable to start idea generation. Try again.", "error-text");
    }
  });

'''
    text = replace_once(text, anchor, block + anchor, "js idea generator block")
    return text


def patch_css(text):
    if 'STUDIO_MANUAL_IDEA_GENERATOR_UI_V1' in text:
        return text
    return text.rstrip() + r'''

/* STUDIO_MANUAL_IDEA_GENERATOR_UI_V1 — compact Ideas-page generator */
.idea-generate-panel{margin-bottom:18px}
.idea-generate-form{padding:16px 20px;display:flex;align-items:end;gap:14px;flex-wrap:wrap}
.idea-generate-fields{display:flex;gap:12px;align-items:end;flex:1;min-width:260px}
.idea-generate-fields .form-field{min-width:150px;flex:1}
.idea-generate-fields select{width:100%;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);padding:10px 11px;font:inherit;outline:none}
.idea-generate-fields select:focus{border-color:var(--teal);box-shadow:0 0 0 3px var(--teal-soft)}
.idea-generate-actions,.idea-generate-complete{display:flex;gap:8px;align-items:center}
.idea-generate-form>.form-message{flex-basis:100%;min-height:18px}
.idea-generate-complete{flex-basis:100%}
.idea-generate-complete[hidden]{display:none}
.idea-generate-panel[hidden]{display:none}
@media(max-width:760px){.idea-generate-form{align-items:stretch}.idea-generate-fields{display:grid;grid-template-columns:1fr 1fr;width:100%}.idea-generate-actions{width:100%}.idea-generate-actions button{flex:1}}
/* STUDIO_MANUAL_IDEA_GENERATOR_UI_V1_END */
''' + "\n"


def main():
    worker = WORKER.read_text(encoding="utf-8")
    html = HTML.read_text(encoding="utf-8")
    js = JS.read_text(encoding="utf-8")
    css = CSS.read_text(encoding="utf-8")

    worker2 = patch_worker(worker)
    html2 = patch_html(html)
    js2 = patch_js(js)
    css2 = patch_css(css)

    WORKER.write_text(worker2, encoding="utf-8")
    HTML.write_text(html2, encoding="utf-8")
    JS.write_text(js2, encoding="utf-8")
    CSS.write_text(css2, encoding="utf-8")

    for path, text, marker in [
        (WORKER, worker2, MARKER),
        (HTML, html2, 'id="ideaGeneratePanel"'),
        (JS, js2, 'STUDIO_MANUAL_IDEA_GENERATOR_UI_V1'),
        (CSS, css2, 'STUDIO_MANUAL_IDEA_GENERATOR_UI_V1'),
    ]:
        if marker not in text:
            raise RuntimeError(f"{path}: expected marker missing")
    print("Studio manual idea generator source patch applied")


if __name__ == "__main__":
    main()
