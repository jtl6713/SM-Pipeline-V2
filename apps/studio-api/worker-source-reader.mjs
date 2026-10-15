// Static-source tests reconstruct the original declaration order from the
// real Worker entry point and its function modules. This does not read a
// historical copy and fails if a marker or function is missing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const prefix = "\n// Route handlers and helpers live in smaller source modules.";
const suffix = "\n// Shared bindings for the extracted function modules (live ESM references).";

export function readStudioWorkerSource() {
  const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
  const beginning = worker.indexOf(prefix);
  const declarations = worker.indexOf("\nconst JSON_HEADERS", beginning);
  const ending = worker.indexOf(suffix, declarations);
  if (beginning < 0 || declarations < 0 || ending < 0) throw new Error("Split Worker markers missing");
  const code = worker.slice(0, beginning) + worker.slice(declarations, ending);
  const body = new Map();
  for (const i of ["01", "02", "03", "04"]) {
    const moduleSource = fs.readFileSync(path.join(here, "worker-functions-" + i + ".mjs"), "utf8");
    for (const m of moduleSource.matchAll(/^export (?:async )?function ([A-Za-z_$][\w$]*)\(/gm)) {
      const name = m[1];
      const stop = moduleSource.indexOf("/*__STUDIO_WORKER_END:" + name + "__*/", m.index + 7);
      if (stop < 0 || body.has(name)) throw new Error("Invalid extracted function marker: " + name);
      body.set(name, moduleSource.slice(m.index + 7, stop));
    }
  }
  let count = 0;
  const restored = code.replace(/\/\*__STUDIO_WORKER_EXTRACT:([A-Za-z_$][\w$]*)__\*\//g, (_, name) => {
    const value = body.get(name);
    if (value == null) throw new Error("Worker function missing: " + name);
    count++;
    return value;
  });
  if (count !== body.size) throw new Error("Worker split markers out of sync: " + count + " of " + body.size);
  return restored;
}
