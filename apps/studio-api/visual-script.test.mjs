import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptVisualScriptProposal,
  applyVisualScriptToSlides,
  assertVisualScriptRevision,
  buildVisualScriptProposal,
  buildVisualScriptState,
  estimateNarrationSeconds,
  fitNarrationToVisual,
  visualScriptChangedSceneIds,
  visualScriptEnabled,
} from "./visual-script.mjs";

const timeline = {
  revision: 7,
  sequence_hash: "vt1-sequence",
  scenes: [
    { scene_id: "a", include: true, duration_ms: 3000, voiceover_mode: "narrated" },
    { scene_id: "b", include: true, duration_ms: 4000, voiceover_mode: "silent" },
    { scene_id: "c", include: true, duration_ms: 2500, voiceover_mode: "narrated" },
  ],
};

const slides = [
  { id: "a", voiceover: { enabled: true, text: "Current scene A wording." } },
  { id: "b", voiceover: { enabled: false, text: "Old text that must not speak." } },
  { id: "c", voiceover: { enabled: true, text: "Current scene C wording." } },
];


test("visual script has an independent default-off feature gate", () => {
  assert.equal(visualScriptEnabled({}), false);
  assert.equal(visualScriptEnabled({ STUDIO_VISUAL_SCRIPT_V1: "true" }), true);
  assert.equal(visualScriptEnabled({ STUDIO_VISUAL_SCRIPT_V1: "0" }), false);
});

test("current script mirrors visual silence and keeps script revision separate", () => {
  const state = buildVisualScriptState(slides, timeline);
  assert.equal(state.visual_revision, 7);
  assert.equal(state.scenes[1].narration_text, "");
  assert.equal(state.scenes[1].voiceover_mode, "silent");
});

test("proposal enforces silent and locked scenes even when model returns text", () => {
  const current = buildVisualScriptState(slides, timeline);
  current.scenes[2].narration_locked = true;
  const proposal = buildVisualScriptProposal(current, timeline, {
    a: "Fresh scene A.",
    b: "This must be ignored.",
    c: "This must also be ignored.",
  });
  assert.equal(proposal.scenes[0].proposed_text, "Fresh scene A.");
  assert.equal(proposal.scenes[1].proposed_text, "");
  assert.equal(proposal.scenes[1].reason, "silent");
  assert.equal(proposal.scenes[2].proposed_text, "Current scene C wording.");
  assert.equal(proposal.scenes[2].reason, "locked");
});

test("selected-scene proposal changes only selected unlocked narration", () => {
  const current = buildVisualScriptState(slides, timeline);
  const proposal = buildVisualScriptProposal(current, timeline, {
    a: "New A.",
    c: "New C.",
  }, { mode: "selected", selectedSceneIds: ["c"] });
  assert.equal(proposal.scenes[0].proposed_text, "Current scene A wording.");
  assert.equal(proposal.scenes[2].proposed_text, "New C.");
});

test("fallback fitting shortens narration to the authoritative visual window", () => {
  const long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen";
  const fitted = fitNarrationToVisual(long, 2000);
  assert.ok(fitted.split(/\s+/).length < long.split(/\s+/).length);
  assert.ok(estimateNarrationSeconds(fitted) <= 2.05);
});

test("accept rejects stale script and stale visual bases", () => {
  const current = buildVisualScriptState(slides, timeline);
  const proposal = buildVisualScriptProposal(current, timeline, { a: "New A." });
  assert.throws(() => assertVisualScriptRevision(current.revision - 1, current.script_hash, current), /outdated narration script/);
  assert.throws(() => acceptVisualScriptProposal(current, { ...timeline, revision: 8 }, proposal), /outdated visual sequence/);
});

test("accepted proposal versions script history and reports changed scenes", () => {
  const current = buildVisualScriptState(slides, timeline);
  const proposal = buildVisualScriptProposal(current, timeline, { a: "New scene A wording." });
  const accepted = acceptVisualScriptProposal(current, timeline, proposal, {
    acceptedAt: "2026-10-17T13:00:00.000Z",
    acceptedBy: "studio@example.com",
  });
  assert.equal(accepted.revision, current.revision + 1);
  assert.equal(accepted.history.length, 1);
  assert.deepEqual(visualScriptChangedSceneIds(current, accepted), ["a"]);
});

test("accepted script reapplies narration and silence to creative slides", () => {
  const current = buildVisualScriptState(slides, timeline);
  const proposal = buildVisualScriptProposal(current, timeline, { a: "Accepted A.", c: "Accepted C." });
  const accepted = acceptVisualScriptProposal(current, timeline, proposal);
  const applied = applyVisualScriptToSlides(slides, accepted);
  assert.equal(applied[0].voiceover.text, "Accepted A.");
  assert.equal(applied[1].voiceover.enabled, false);
  assert.equal(applied[1].voiceover.text, "");
});


test("accept rejects operator-edited narration that overruns the visual window", () => {
  const current = buildVisualScriptState(slides, timeline);
  const proposal = buildVisualScriptProposal(current, timeline, { a: "Short." });
  proposal.scenes[0].proposed_text = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty";
  assert.throws(
    () => acceptVisualScriptProposal(current, timeline, proposal),
    /exceeds its visual duration/,
  );
});


test("accept preserves current narration for a scene locked at accept time", () => {
  const current = buildVisualScriptState(slides, timeline);
  const proposal = buildVisualScriptProposal(current, timeline, { a: "Generated A." });
  proposal.scenes[0].narration_locked = true;
  proposal.scenes[0].proposed_text = "Malicious or stale replacement.";
  const accepted = acceptVisualScriptProposal(current, timeline, proposal);
  assert.equal(accepted.scenes[0].narration_locked, true);
  assert.equal(accepted.scenes[0].narration_text, "Current scene A wording.");
});


test("accept cannot mutate locked or unselected narration through an edited proposal payload", () => {
  const current = buildVisualScriptState(slides, timeline);
  current.scenes[2].narration_locked = true;
  const proposal = buildVisualScriptProposal(current, timeline, {
    a: "Generated A.",
    c: "Generated C.",
  }, { mode: "selected", selectedSceneIds: ["a"] });
  proposal.scenes[1].proposed_text = "Injected silent words.";
  proposal.scenes[2].proposed_text = "Injected locked words.";
  const accepted = acceptVisualScriptProposal(current, timeline, proposal);
  assert.equal(accepted.scenes[1].narration_text, "");
  assert.equal(accepted.scenes[2].narration_text, "Current scene C wording.");
});

test("accept rejects manually edited proposal text that overruns its visual window", () => {
  const current = buildVisualScriptState(slides, timeline);
  const proposal = buildVisualScriptProposal(current, timeline, { a: "Short." }, {
    mode: "selected",
    selectedSceneIds: ["a"],
  });
  proposal.scenes[0].proposed_text = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty";
  assert.throws(
    () => acceptVisualScriptProposal(current, timeline, proposal),
    /exceeds its visual duration/,
  );
});
