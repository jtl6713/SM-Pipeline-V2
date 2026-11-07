import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const web = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(web, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(web, "index.html"), "utf8");

function block(start, end) {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "expected source block " + start);
  return app.slice(from, to);
}

test("switching content profiles clears only transient feedback, not persistent output status", () => {
  const code = block("const PROFILE_TRANSIENT_FEEDBACK_IDS", "function applyStudioProfile(");
  const calls = [];
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: "Sent — check TikTok inbox",
      disabled: true,
      classList: { remove: (...names) => calls.push({ id, names }) },
    });
    return nodes.get(id);
  }
  const reset = vm.runInNewContext(`(() => {
    const $ = globalNode;
    ${code}
    return clearProfileScopedFeedback;
  })()`, { globalNode: node });
  reset();
  for (const id of ["creativeTiktokResendMessage", "creativeEditorMessage", "productionRequestMessage", "operationsMessage"]) {
    assert.equal(node(id).textContent, "");
    assert.ok(calls.some((entry) => entry.id === id && entry.names.includes("error-text")));
  }
  assert.equal(node("creativeTiktokResend").disabled, false);
  assert.equal(nodes.has("apiStatus"), false, "server health and persistent badges stay intact");
  const apply = block("function applyStudioProfile(", "function persistStudioProfilesCache(");
  assert.match(apply, /selectedProfileId !== profile.id/);
  assert.match(apply, /profileFeedbackRevision \+= 1;\s*clearProfileScopedFeedback\(\)/);
});

test("late TikTok results cannot touch another profile, another output, or a switched-back profile", () => {
  const code = block("function profileActionIsCurrent(", "function applyStudioProfile(");
  const context = {
    selectedProfileId: "chicago",
    profileFeedbackRevision: 2,
    activeCreativeOutputId: "recChicago",
    activeCreativeOutput: { id: "recChicago" },
  };
  const current = vm.runInNewContext(`(() => { ${code} return profileActionIsCurrent; })()`, context);
  assert.equal(current("chicago", 2, "recChicago"), true);
  context.selectedProfileId = "miami";
  context.profileFeedbackRevision = 3;
  context.activeCreativeOutputId = "recMiami";
  assert.equal(current("chicago", 2, "recChicago"), false);
  context.selectedProfileId = "chicago";
  context.profileFeedbackRevision = 4;
  context.activeCreativeOutputId = "recChicago";
  assert.equal(current("chicago", 2, "recChicago"), false);
  assert.equal(current("chicago", 4, "recOther"), false);
});

test("TikTok resend checks profile and output identity before success, error and finally UI writes", () => {
  const handler = block('$("creativeTiktokResend")?.addEventListener("click"', '$("creativeTiktokCompleteForm")?.addEventListener');
  assert.match(handler, /const actionProfileId = selectedProfileId;/);
  assert.match(handler, /const actionRevision = profileFeedbackRevision;/);
  assert.match(handler, /await submitTiktokDraftResend\(id\);\s*if \(!profileActionIsCurrent\(actionProfileId, actionRevision, id\)\) return;/);
  assert.match(handler, /catch \(error\) \{\s*if \(!profileActionIsCurrent\(actionProfileId, actionRevision, id\)\) return;/);
  assert.match(handler, /finally \{\s*if \(profileActionIsCurrent\(actionProfileId, actionRevision, id\)\) button.disabled = false;/);
  const render = block("let creativeTiktokFeedbackKey", "function renderCreativeYoutubeComplete(");
  assert.match(render, /feedbackKey !== creativeTiktokFeedbackKey/);
  assert.match(render, /resendMessage.textContent = ""/);
  assert.match(html, /app-item4-1008.js\?v=0.6.900-profile-feedback-rows/);
});

test("Pipeline resend feedback stays with the initiating profile and mounted row", () => {
  const inline = block('function bindPipelineTiktokComplete(root)', 'function bindPipelineYoutubeComplete(');
  assert.match(inline, /const actionProfileId = selectedProfileId;/);
  assert.match(inline, /const actionRevision = profileFeedbackRevision;/);
  assert.match(inline, /const isCurrentRow = \(\) => profileActionIsCurrent\(actionProfileId, actionRevision\)/);
  assert.match(inline, /wrap\.isConnected/);
  assert.match(inline, /await submitTiktokDraftResend\(id\);\s*if \(!isCurrentRow\(\)\) return;/);
  assert.match(inline, /catch \(error\) \{\s*if \(!isCurrentRow\(\)\) return;/);
  assert.match(inline, /finally \{\s*if \(isCurrentRow\(\)\) button\.disabled = false;/);
});

test("Profile switch clears old Pipeline rows and does not display stale output loads", () => {
  const apply = block("function applyStudioProfile(", "function persistStudioProfilesCache(");
  assert.match(apply, /clearProfileScopedFeedback\(\);\s*pipelineOutputs = \[\];/);
  assert.match(apply, /activeCreativeOutputId = null;/);
  const clear = block("function clearProfileScopedFeedback(", "function profileActionIsCurrent(");
  assert.match(clear, /outputList\.innerHTML = ""/);
  const refresh = block("async function refreshPipelineOutputs(", "async function loadOutputs(");
  assert.match(refresh, /catch \(e\) \{\s*if \(profileAtRequest !== selectedProfileId\) return;/);
  const open = block("async function openCreativeEditor(", "function collectCreativePayload(");
  assert.match(open, /await api\(.*?\/creative\x60\);\s*if \(!profileActionIsCurrent\(profileAtRequest, revisionAtRequest, recordId\)\) return;/s);
  assert.match(open, /catch \(e\) \{\s*if \(!profileActionIsCurrent\(profileAtRequest, revisionAtRequest, recordId\)\) return;/);
});
