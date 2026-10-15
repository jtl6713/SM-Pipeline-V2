import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerEntry = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const modules = ["01", "02", "03", "04"].map((n) => ({
  n,
  source: fs.readFileSync(path.join(here, `worker-functions-${n}.mjs`), "utf8"),
}));

/** Local helpers that still live in worker.js (not EXTRACT bodies) but modules call. */
const SHARED_RUNTIME_HELPERS = [
  "airtableFetch",
  "studioMarkMappedListDirty",
  "schedulePipelineListHeal",
  "item4EnsureMakeHardeningFromWorkspaceOpen",
  "syncProductionCadence",
];

test("worker.js exports runtime helpers that extracted modules call", () => {
  const exportBlock = workerEntry.match(/\/\/ Shared bindings[\s\S]*?\nexport \{([\s\S]*?)\n\}/);
  assert.ok(exportBlock, "shared bindings export block missing");
  for (const name of SHARED_RUNTIME_HELPERS) {
    assert.match(exportBlock[1], new RegExp(`\\b${name}\\b`), `${name} must be exported from worker.js`);
  }
});

test("extracted modules that call shared helpers also import them from worker.js", () => {
  for (const { n, source } of modules) {
    const importBlock = source.match(/import \{([\s\S]*?)\} from "\.\/worker\.js"/);
    assert.ok(importBlock, `worker-functions-${n}.mjs missing worker.js import`);
    for (const name of SHARED_RUNTIME_HELPERS) {
      const used = new RegExp(`\\b${name}\\s*\\(`).test(source);
      if (!used) continue;
      assert.match(
        importBlock[1],
        new RegExp(`\\b${name}\\b`),
        `worker-functions-${n}.mjs calls ${name} but does not import it (Approve all failed: ${name} is not defined)`,
      );
    }
  }
});

test("assembled Worker still defines studioMarkMappedListDirty for Approve write-through", () => {
  const worker = readStudioWorkerSource();
  assert.match(worker, /function studioMarkMappedListDirty/);
  assert.match(worker, /0\.10\.621-approve-binding-dirty/);
});
