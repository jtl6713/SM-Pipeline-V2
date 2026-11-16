import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Factory Needs eyes and Overview Awaiting Approval claim the same package-ready queue", async () => {
  const html = await readFile(path.join(here, "index.html"), "utf8");
  const overview = await readFile(path.join(here, "assets/all-profiles-overview-1007.js"), "utf8");
  assert.match(html, /Same queue as Studio overview Awaiting Approval/);
  assert.match(html, /Incomplete packages sit in Repair/);
  assert.match(
    overview,
    /Factory items awaiting your approval/,
  );
  assert.doesNotMatch(html, /Studio overview Awaiting Approval can read higher/);
  assert.doesNotMatch(overview, /May be higher than Factory Needs eyes/);
});


test("Home Awaiting Approval navigates to Factory review rather than Pipeline status filter", async () => {
  const overview = await readFile(path.join(here, "assets/all-profiles-overview-1007.js"), "utf8");
  const route = overview.match(/if \(kind === "approval"\) \{([\s\S]*?)\n    \}/);
  assert.ok(route, "dedicated approval action route exists");
  assert.match(route[1], /data-page="factory"/);
  assert.match(route[1], /factoryProfileFilter/);
  assert.match(route[1], /factoryLaneNeedsEyesHeading/);
  assert.match(route[1], /aria-expanded/);
  assert.match(route[1], /toggle\.click\(\)/);
  assert.doesNotMatch(route[1], /studioOpenPipelineFilter|\/api\/airtable/i);
});
