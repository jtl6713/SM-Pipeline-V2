import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets", "app-item4-1008.js");

test("In-production Open request paints workspace before waiting on Airtable", async () => {
  const app = await readFile(appPath, "utf8");
  assert.match(app, /data-content-request/);
  assert.match(app, /fields=light/);
  assert.match(app, /Instant paint like Draft → Continue/);
  assert.match(app, /populateProductionRequestForm\(stub\)/);
  assert.match(app, /showProductionRequestWorkspace\(\)/);
  // Must not await a fat GET before the first workspace paint.
  assert.doesNotMatch(
    app,
    /data-content-request[\s\S]{0,400}await api\(`\/api\/production-requests\/\$\{encodeURIComponent\(requestId\)\}`\)/,
  );
});
