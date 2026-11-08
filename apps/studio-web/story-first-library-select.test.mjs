import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./assets/story-first-workspace.js", import.meta.url), "utf8");
const begin = source.indexOf("  async function selectSceneAsset(index, asset) {");
const end = source.indexOf("  async function uploadScene(index, file) {", begin);
assert.ok(begin >= 0 && end > begin, "existing-media selector must remain testable");

const profile = "recProfile123";
const image = { id: "recBeanImage123", name: "The Bean Sunset", content_profile_id: profile };
const blankScene = () => ({
  time: "7-10", visual: "Sunset reflections across Cloud Gate",
  media: "still", decision: "unassigned", state: "missing",
  assigned_asset_id: null, selected_approved: false,
});
const clone = value => JSON.parse(JSON.stringify(value));

function setup({ existing = false, failPatch = false, unconfirmed = false, rejectedCreate = false } = {}) {
  const calls = [], notices = [];
  const current = {
    record: existing ? { id: "recIdea123" } : null,
    profile, busy: false,
    story: { profile_id: profile, scenes: [blankScene()] },
    selectedAssetNames: {},
  };
  let renderCount = 0;
  const context = {
    current,
    assertProfile: () => profile,
    eligibility: (scene, row) => scene.media === "still" && row.id === image.id && row.content_profile_id === profile,
    save: async () => {
      const assigned = current.story.scenes[0].assigned_asset_id;
      const isPatch = Boolean(current.record?.id);
      calls.push({ type: isPatch ? "PATCH" : "POST", assigned });
      if (!isPatch) {
        if (rejectedCreate || assigned) throw new Error("New Script a Short ideas cannot contain unverified media selections");
        current.record = { id: "recIdea123" };
        current.story = clone(current.story);
        return { ...current.record, story_first: clone(current.story) };
      }
      if (failPatch) throw new Error("Media selection rejected by Airtable rights validation");
      const returned = clone(current.story);
      if (unconfirmed) {
        returned.scenes[0].assigned_asset_id = null;
        returned.scenes[0].selected_approved = false;
        returned.scenes[0].state = "missing";
      }
      current.story = clone(returned);
      return { ...current.record, story_first: returned };
    },
    storyNotesFromRecord: record => record?.story_first,
    render: () => { renderCount += 1; },
    report: message => { notices.push(message); },
    JSON,
    Error,
  };
  const selectSceneAsset = vm.runInNewContext(
    "(() => {" + source.slice(begin, end) + "; return selectSceneAsset; })()", context);
  return { selectSceneAsset, calls, notices, current, get renderCount() { return renderCount; } };
}

test("unsaved seven-scene flow creates an unselected Idea before the selected-asset PATCH", async () => {
  const run = setup();
  await run.selectSceneAsset(0, image);
  assert.deepEqual(run.calls, [
    { type: "POST", assigned: null },
    { type: "PATCH", assigned: image.id },
  ]);
  assert.equal(run.current.story.scenes[0].assigned_asset_id, image.id);
  assert.equal(run.current.story.scenes[0].selected_approved, true);
  assert.equal(run.current.story.scenes[0].state, "media_approved");
  assert.equal(run.current.selectedAssetNames[image.id], image.name);
  assert.equal(run.renderCount, 1);
  assert.match(run.notices.at(-1), /saved and verified in Airtable/);
});

test("existing saved Idea uses one PATCH and never creates a duplicate Idea", async () => {
  const run = setup({ existing: true });
  await run.selectSceneAsset(0, image);
  assert.deepEqual(run.calls, [{ type: "PATCH", assigned: image.id }]);
  assert.equal(run.renderCount, 1);
});

test("rejected PATCH restores unselected scene without closing browser results", async () => {
  const run = setup({ failPatch: true });
  await assert.rejects(run.selectSceneAsset(0, image), /rights validation/);
  assert.deepEqual(run.calls.map(row => row.type), ["POST", "PATCH"]);
  assert.equal(run.current.record.id, "recIdea123", "initial Idea remains saved for a retry");
  assert.equal(run.current.story.scenes[0].assigned_asset_id, null);
  assert.equal(run.current.story.scenes[0].selected_approved, false);
  assert.equal(run.renderCount, 0, "failure must not redraw and close the search picker");
});

test("missing response confirmation never reports success or repaints as selected", async () => {
  const run = setup({ existing: true, unconfirmed: true });
  await assert.rejects(run.selectSceneAsset(0, image), /did not confirm/);
  assert.equal(run.renderCount, 0);
  assert.equal(run.notices.length, 0);
  assert.equal(run.current.story.scenes[0].selected_approved, false);
});

test("ambiguous create is not retried and cannot attach selected asset", async () => {
  const run = setup({ rejectedCreate: true });
  await assert.rejects(run.selectSceneAsset(0, image), /cannot contain unverified/);
  assert.deepEqual(run.calls, [{ type: "POST", assigned: null }]);
  assert.equal(run.renderCount, 0);
});

test("picker shows inline failure, disables repeat clicks, and retains results on error", () => {
  assert.match(source, /choose\.disabled = true/);
  assert.match(source, /story-first-select-error/);
  assert.match(source, /role", "alert"/);
  assert.doesNotMatch(source.slice(begin, end).match(/catch \(err\) \{[\s\S]*?\n    \}/)?.[0] || "",
    /render\(\)/);
});
