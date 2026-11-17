import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const worker02 = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
const worker03 = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
const extract = (source, name) => {
  const start = source.indexOf(`export function ${name}(`);
  const end = source.indexOf(`/*__STUDIO_WORKER_END:${name}__*/`, start);
  assert.ok(start >= 0 && end > start, `${name} must have an intact extracted Worker declaration`);
  return source.slice(start, end);
};

test("production exact-source package rejects a stale or partially transferred master manifest", () => {
  const body = extract(worker02, "item4StudioSourcePackageForOutput");
  assert.match(body, /orderedMasters\\.length === 0 \\|\\|/); // legacy empty-mirror compatibility
  assert.match(body, /sourceRowsAll\.length === orderedMasters\.length/);
  assert.match(body, /sourceRowsAll\.every\(\(source, index\)/);
  assert.match(body, /source\?\.id/);
  assert.match(body, /master\?\.google_drive_file_id/);
  assert.match(body, /master\?\.media_asset_record_id/);
  assert.match(body, /if \(!exactMasters\)[\s\S]*?return null;/);
});

test("fanout cannot seed a fallback platform output if owner images are not ready", () => {
  const start = worker02.indexOf("export async function fanoutProductionRequestOutputsToContentItems(");
  const end = worker02.indexOf("/*__STUDIO_WORKER_END:fanoutProductionRequestOutputsToContentItems__*/", start);
  assert.ok(start >= 0 && end > start);
  const body = worker02.slice(start, end);
  const guard = body.indexOf("if (!sourcePackage && item4AssetManifest(requestRecord).length > 0)");
  const seeded = body.indexOf("let seed=platformOutputSeedFields(");
  assert.ok(guard > 0 && seeded > guard, "source authority gate must execute before output seeding");
  assert.match(body.slice(guard, seeded), /Pipeline_Route_Status:"Blocked"/);
  assert.match(body.slice(guard, seeded), /continue;/);
});

test("continuation cannot re-stamp incomplete source or reuse an old selected-assets snapshot", () => {
  const stamp = worker03.slice(
    worker03.indexOf("export async function studioContinuationStampPackage("),
    worker03.indexOf("/*__STUDIO_WORKER_END:studioContinuationStampPackage__*/")
  );
  assert.match(stamp, /if \(!sourcePackage && item4AssetManifest\(requestRecord\)\.length > 0\)/);
  assert.match(stamp, /throw new HttpError\(409/);
  const inspect = worker03.slice(
    worker03.indexOf("export async function studioContinuationInspectOutput("),
    worker03.indexOf("/*__STUDIO_WORKER_END:studioContinuationInspectOutput__*/")
  );
  assert.match(inspect, /const matchesCurrentMasterSelection =/);
  assert.match(inspect, /const alreadyExact = matchesCurrentMasterSelection/);
  assert.match(inspect, /if \(readyForRender && hasClips && matchesCurrentMasterSelection/);
});

test("saved selected-assets identity must match exact current clip IDs, media IDs, URL and order", () => {
  const inspect = worker03.slice(
    worker03.indexOf("export async function studioContinuationInspectOutput("),
    worker03.indexOf("/*__STUDIO_WORKER_END:studioContinuationInspectOutput__*/")
  );
  const first = inspect.indexOf("  const matchesCurrentMasterSelection = (() => {");
  const last = inspect.indexOf("  })();", first) + "  })();".length;
  assert.ok(first >= 0 && last > first, "continuation must embed a pure comparison");
  const declaration = inspect.slice(first, last);
  const matches = vm.runInNewContext(
    `(sourcePackage, savedSelected) => {
      const po = {};
      const f = () => savedSelected;
      const item4ParseJson = (input, fallback) => {
        if (!input) return fallback;
        return typeof input === "string" ? JSON.parse(input) : input;
      };
      ${declaration}
      return matchesCurrentMasterSelection;
    }`
  );
  const clips = [
    { source_asset_id: "owner-1", media_asset_record_id: "recAsset1", url: "https://media.example/one.jpg" },
    { source_asset_id: "owner-2", media_asset_record_id: "recAsset2", url: "https://media.example/two.jpg" },
  ];
  const current = { status: "Ready", selected_assets_json: JSON.stringify({ selected_clips: clips }) };
  assert.equal(matches(current, JSON.stringify({ selected_clips: clips })), true);
  assert.equal(matches(current, JSON.stringify({ selected_clips: [...clips].reverse() })), false);
  assert.equal(matches(current, JSON.stringify({ selected_clips: [{ ...clips[0], source_asset_id: "foreign" }, clips[1]] })), false);
  assert.equal(matches(current, JSON.stringify({ selected_clips: [{ ...clips[0], url: "https://media.example/old.jpg" }, clips[1]] })), false);
  assert.equal(matches({ ...current, status: "Preparing" }, JSON.stringify({ selected_clips: clips })), false);
  assert.equal(matches(null, JSON.stringify({ selected_clips: clips })), false);
});
