import assert from "node:assert/strict";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import test from "node:test";

const source = readStudioWorkerSource();

test("library photos cannot override a Vibe Cut source while photo-wait is running", () => {
  assert.ok(source.includes('reason: "vibe-cut-uploaded-video-only"'));
  assert.ok(source.includes("if (studioIsVibeCut(latest))"));
  assert.ok(source.includes("if (studioIsVibeCut(requestRecord))"));
});

test("vibe source upload replaces stale photos and clears their old crop plan", () => {
  assert.ok(source.includes("JSON.stringify(vibeCut ? [draft] : [...existing, draft])"));
  assert.ok(source.includes('Studio_Master_Media_Assets: []'));
  assert.ok(source.includes('Studio_Variant_Manifest_JSON: null'));
});

test("vibe plan allows validated photo montage while retaining source guards", () => {
  assert.ok(source.includes("validateVibeCutSourceAssets(assets, { allowPhotoMontage:") && source.includes("allow-vibe-cut-photo-montage=1"));
  assert.ok(source.includes("Vibe Cut requires its original uploaded and processed video"));
  assert.ok(source.includes("if (studioIsVibeCut(record)) return false;"));
});


test("orphan Vibe Processing transfers are reclaimed only after the 45-minute master lease", () => {
  const start = source.indexOf("export async function item4HealPendingVibeMasterTransfer");
  const end = source.indexOf("/*__STUDIO_WORKER_END:item4HealPendingVibeMasterTransfer__*/", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /\{Transfer_Status\}="Processing"/);
  assert.match(body, /Date\.now\(\) - claimedAt < 45 \* 60 \* 1000/);
  assert.match(body, /item4RequeueStaleProcessing\(env, \[row\]\)/);
  assert.match(body, /item4QueueStatus\(requeued\[0\]\) !== "Pending"/);
  assert.match(body, /Source_R2_Key/);
  assert.match(body, /expired-vibe-master-processing-claim-requeued/);
  assert.doesNotMatch(body, /publish.*true/i);
});
