import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./assets/story-first-workspace.js", import.meta.url), "utf8");
const start = source.indexOf("  function rememberSavedIdea(record) {");
const end = source.indexOf("  async function openAssetManager() {", start);
assert.ok(start >= 0 && end > start, "save receipt functions must remain discoverable");
const saveSource = source.slice(start, end);

const profile = "recProfile123";
const asset = "recAsset123";
const story = {
  schema: "story-first.1", profile_id: profile, target_seconds: 30,
  scenes: [{
    n: 1, time: "0-30", visual: "CTA train crosses the Chicago River bridge",
    voiceover: "Chicago moves at sunrise", media: "clip", decision: "library",
    assigned_asset_id: asset, selected_approved: true,
    candidate_asset_id: null, candidate_assets: [], rejected_ai_ids: [],
    ai_prompt: "Chicago train", state: "media_approved",
  }],
};
function makeRecord(changes = {}) {
  return {
    id: "recIdea123", candidate_id: 2468, title: "CTA Short", summary: "Chicago train story",
    content_profile_links: [profile], story_first: structuredClone(story), ...changes,
  };
}
function setup(handler, existing = makeRecord()) {
  const notices = [], requests = [], stored = {};
  const picker = {
    options: [],
    add(option) { this.options.push(option); },
    value: "",
  };
  const saveButton = { disabled: false };
  const hint = { textContent: "" };
  const elements = {
    storyFirstSaved: picker,
    storyFirstSavedHint: hint,
    storyFirstSave: saveButton,
  };
  const current = {
    record: existing, story: structuredClone(story), profile,
    title: "CTA Short", summary: "Chicago train story",
    busy: false, ideaRecords: [],
  };
  const context = {
    current,
    $: key => elements[key],
    readForm: () => current.story,
    assertProfile: () => profile,
    storyNotesFromRecord: record => record?.story_first || null,
    call: async (path, init) => {
      requests.push({ path, method: init?.method || "GET" });
      return handler(path, init, requests.length);
    },
    report: (msg, isError) => notices.push({ msg, isError }),
    localStorage: { setItem: (key, val) => { stored[key] = val; } },
    Option: function Option(text, value) { this.textContent = text; this.value = value; },
    encodeURIComponent,
  };
  const functions = vm.runInNewContext(
    "(()=>{" + saveSource + "; return { save, savedIdeaMatches }; })()", context,
  );
  return { ...functions, current, requests, notices, picker, saveButton, stored, hint };
}

test("confirmed PATCH is a save receipt: no redundant /api/ideas list reload", async () => {
  const record = makeRecord();
  const run = setup(async () => ({ ok: true, record }));
  const saved = await run.save();
  assert.equal(saved.id, record.id);
  assert.deepEqual(run.requests.map(req => req.method), ["PATCH"]);
  assert.equal(run.picker.value, record.id);
  assert.equal(run.picker.options[0].textContent, "CTA Short · Idea 2468");
  assert.match(run.notices.at(-1).msg, /Saved to Airtable/);
  assert.equal(run.saveButton.disabled, false);
  assert.equal(run.current.busy, false);
  assert.equal(run.stored["studio.story_first_resume." + profile], record.id);
});

test("interrupted PATCH verifies the authoritative GET before confirming save", async () => {
  const record = makeRecord();
  const run = setup(async (path, init) => {
    if (init?.method === "PATCH") throw new Error("Fetch is aborted");
    assert.match(path, /fresh=1/);
    return { ok: true, record };
  });
  await run.save();
  assert.deepEqual(run.requests.map(req => req.method), ["PATCH", "GET"]);
  assert.match(run.notices.at(-1).msg, /Saved to Airtable/);
});

test("a stale GET after an aborted PATCH never fabricates save success or retries the write", async () => {
  const stale = makeRecord({ story_first: { ...story, scenes: [{ ...story.scenes[0], assigned_asset_id: null }] } });
  const run = setup(async (path, init) => {
    if (init?.method === "PATCH") throw new Error("Fetch is aborted");
    return { ok: true, record: stale };
  });
  await assert.rejects(run.save(), error => error.saveUnconfirmed && /verify before trying again/.test(error.message));
  assert.deepEqual(run.requests.map(req => req.method), ["PATCH", "GET"]);
  assert.ok(!run.notices.some(item => /Saved to Airtable/.test(item.msg)));
  assert.equal(run.current.busy, false);
  assert.equal(run.saveButton.disabled, false);
});

test("ambiguous POST never retries creation or claims it failed definitively", async () => {
  const run = setup(async () => { throw new Error("Fetch is aborted"); }, null);
  await assert.rejects(run.save(), error => error.saveUnconfirmed && /may exist/.test(error.message));
  assert.deepEqual(run.requests.map(req => req.method), ["POST"]);
  assert.equal(run.current.record, null);
});

test("real Worker validation errors remain visible and do not trigger read-back", async () => {
  const run = setup(async () => { throw new Error("Selected storyboard media is missing or unavailable"); });
  await assert.rejects(run.save(), /Selected storyboard media is missing or unavailable/);
  assert.deepEqual(run.requests.map(req => req.method), ["PATCH"]);
  assert.equal(run.saveButton.disabled, false);
});
