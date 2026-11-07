import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const resetStart = source.indexOf("  function actionScopeCurrent(");
const resetEnd = source.indexOf("  function applyStudioProfile(", resetStart);
const renderStart = source.indexOf("  function renderCreativeTiktokComplete(");
const renderEnd = source.indexOf("  function renderCreativeYoutubeComplete(", renderStart);
assert.ok(resetStart > 0 && resetEnd > resetStart);
assert.ok(renderStart > 0 && renderEnd > renderStart);

function classList() {
  const values = new Set(["error-text"]);
  return {
    values,
    remove: (...names) => names.forEach(name => values.delete(name)),
  };
}

test("profile switch clears transient action statuses, cached output rows, and an open editor", () => {
  const notifications = [
    { textContent: "Sent — check TikTok inbox", classList: classList() },
    { textContent: "An earlier operation failed", classList: classList() },
  ];
  const nodes = {
    creativeEditorPanel: { hidden: false, classList: classList() },
    creativeRenderPreview: { pause() {}, removeAttribute() {} },
    creativeRenderPreviewDrive: { removeAttribute() {} },
    creativeTiktokResend: { disabled: true },
    outputsList: { innerHTML: "<table>Chicago data</table>" },
  };
  const ctx = vm.createContext({
    $: id => nodes[id] || null,
    document: { querySelectorAll: () => notifications },
    clearTimeout: () => {},
  });
  vm.runInContext(`
    let selectedProfileId = "chicago", profileSwitchGeneration = 0;
    let activeCreativeOutputId = "output-a", activeCreativeOutput = { id: "output-a" };
    let creativeTiktokResendScope = "chicago:output-a";
    let creativeHandoffPollToken = 0, creativeHandoffStatus = "running";
    let creativeSlides = [{}], creativeOptions = { a: true }, creativeVisualTimeline = {};
    let creativeVisualScript = {}, creativeFeatures = {}, creativeEditorDirty = true;
    let creativeSavedFingerprint = "old", creativeDirtyTimer = 123;
    const creativeSlideCollapsed = new Set(["slide-a"]);
    let pipelineOutputs = [{ id: "output-a" }], pipelineContentRecords = [{}];
    let pipelineListExceptionScope = true, pipelineListUnverified = true;
    let pipelineScheduleGridRecords = [{}];
    const pipelineScheduleDrafts = new Map([["a", "b"]]);
    const pipelineScheduleDirty = new Set(["a"]);
    const pipelineTiktokUrlDrafts = new Map([["a", "b"]]);
    const pipelineYoutubeUrlDrafts = new Map([["a", "b"]]);
    const pipelineGroupOpen = new Map([["a", true]]);
    ${source.slice(resetStart, resetEnd)}
    globalThis.reset = resetProfileScopedTransientState;
    globalThis.current = actionScopeCurrent;
    globalThis.setProfile = value => { selectedProfileId = value; };
    globalThis.snapshot = () => ({
      generation: profileSwitchGeneration, id: activeCreativeOutputId,
      pipelineCount: pipelineOutputs.length, draftCount: pipelineTiktokUrlDrafts.size,
      handoff: creativeHandoffPollToken, dirty: creativeEditorDirty,
    });
  `, ctx);
  assert.equal(ctx.current("chicago", 0, "output-a"), true);
  ctx.reset();
  ctx.setProfile("miami");
  assert.equal(ctx.current("chicago", 0, "output-a"), false);
  ctx.setProfile("chicago");
  assert.equal(ctx.current("chicago", 0, "output-a"), false, "switching back cannot revive an old response");
  assert.deepEqual({ ...ctx.snapshot() }, { generation: 1, id: null, pipelineCount: 0, draftCount: 0, handoff: 1, dirty: false });
  assert.equal(nodes.creativeEditorPanel.hidden, true);
  assert.equal(nodes.creativeTiktokResend.disabled, false);
  assert.equal(nodes.outputsList.innerHTML, "");
  assert.ok(notifications.every(n => n.textContent === "" && !n.classList.values.has("error-text")));
});

test("TikTok resend status follows the output AND working profile", () => {
  const ids = [
    "creativeTiktokComplete", "creativeTiktokCompleteForm", "creativeTiktokCompleteLive",
    "creativeTiktokMusicWrap", "creativeTiktokMusic", "creativeTiktokMusicRequirement",
    "creativeTiktokUrl", "creativeTiktokResendWrap", "creativeTiktokResend",
    "creativeTiktokResendMessage", "creativeTiktokCompleteCopy",
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, { textContent: "", hidden: false, classList: classList(), value: "" }]));
  const ctx = vm.createContext({
    $: id => nodes[id] || null,
    tiktokNeedsUrlEntry: () => true,
    tiktokNeedsDraftResend: () => true,
    tiktokPhotoSoundRequired: () => false,
    tiktokLiveUrl: () => "",
    tiktokMusicChoice: () => "",
    escapeHtml: value => value,
  });
  vm.runInContext(`
    let selectedProfileId = "chicago", activeCreativeOutputId = "output-a";
    let creativeTiktokResendScope = "";
    ${source.slice(renderStart, renderEnd)}
    globalThis.render = renderCreativeTiktokComplete;
    globalThis.setProfile = id => { selectedProfileId = id; };
  `, ctx);
  const feedback = nodes.creativeTiktokResendMessage;
  ctx.render({ id: "output-a", platform: "TikTok" });
  feedback.textContent = "Sent — check TikTok inbox";
  ctx.render({ id: "output-a", platform: "TikTok" });
  assert.equal(feedback.textContent, "Sent — check TikTok inbox", "same output retains its own feedback");
  ctx.render({ id: "output-b", platform: "TikTok" });
  assert.equal(feedback.textContent, "", "different output must not inherit success");
  feedback.textContent = "Could not send";
  ctx.setProfile("miami");
  ctx.render({ id: "output-b", platform: "TikTok" });
  assert.equal(feedback.textContent, "", "different profile must not inherit error either");
  assert.equal(feedback.classList.values.has("error-text"), false);
});

test("resend handlers and editor loads reject responses from earlier profile generations", () => {
  assert.match(source, /if \(!actionScopeCurrent\(requestProfileId, requestGeneration\)\) return;/);
  assert.match(source, /if \(!actionScopeCurrent\(requestProfileId, requestGeneration, id\)\) return;/);
  assert.match(source, /if \(!actionScopeCurrent\(openedProfileId, openedGeneration, recordId\)\) return;/);
  assert.match(source, /if \(selectedProfileId && selectedProfileId !== profile.id\) resetProfileScopedTransientState\(\)/);
  assert.match(source, /phase6ConfirmDiscardUnsaved\("switch profiles"\)/);
});
