import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const wf02 = readFileSync(join(here, "worker-functions-02.mjs"), "utf8");
const wf04 = readFileSync(join(here, "worker-functions-04.mjs"), "utf8");
const worker = readStudioWorkerSource();

test("Resume recreates hollow Preparing/Error queues instead of prepare-not-started", () => {
  const start = wf02.indexOf("export async function item4ResumePendingVariants");
  const end = wf02.indexOf("/*__STUDIO_WORKER_END:item4ResumePendingVariants__*/", start);
  const block = wf02.slice(start, end);
  assert.match(block, /prepare-queue-hollow/);
  assert.match(block, /parentStatus !== "Preparing" && parentStatus !== "Error"/);
  assert.match(block, /item4UpsertVariantQueue/);
  assert.match(block, /reason: "prepare-not-started"/);
  assert.match(block, /reason: "prepare-queue-hollow"/);
});

test("Reconcile keeps Preparing when masters are Drive-ready but queue scoped empty", () => {
  const start = wf02.indexOf("export async function item4ReconcileVariants");
  const end = wf02.indexOf("/*__STUDIO_WORKER_END:item4ReconcileVariants__*/", start);
  const block = wf02.slice(start, end);
  assert.match(block, /payload-wipe hollow queue/);
  assert.match(block, /status: "Preparing"/);
  assert.doesNotMatch(
    block,
    /Prepare could not create platform frames\. Click Prepare again after the files show as saved/,
  );
});

test("Promote sibling cancel and ready-claim fall back to idea_candidate_id FK", () => {
  const cancel = wf02.slice(
    wf02.indexOf("export async function cancelSiblingProductionRequestsForIdea"),
    wf02.indexOf("/*__STUDIO_WORKER_END:cancelSiblingProductionRequestsForIdea__*/"),
  );
  assert.match(cancel, /listSupabaseOpenProductionRequestsForIdea\(env, ideaRecord\.id\)/);

  const ready = wf04.slice(
    wf04.indexOf("async function readyProductionRequestForIdea"),
    wf04.indexOf("function readyProductionIdeaPlan"),
  );
  assert.match(ready, /listSupabaseOpenProductionRequestsForIdea\(env, idea\.id\)/);
  assert.match(ready, /Phase 6 SoR/);
});

test("Worker version bumps for prepare heal + Idea FK preventative fix", () => {
  assert.match(worker, /0\.10\.993-phase6-prepare-heal-fk/);
});
