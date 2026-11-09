import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(root, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const begin = app.indexOf("  function ideaRowHtml(r) {");
const end = app.indexOf("\n  function upsertIdeaInCache(", begin);
assert.ok(begin >= 0 && end > begin, "Ideas row renderer must be available");

const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const ideaRowHtml = vm.runInNewContext(
  `(() => { ${app.slice(begin, end)}; return ideaRowHtml; })()`,
  {
    ideaShowPromoteAction: () => false,
    ideaIsPromoted: () => false,
    ideaDraftNeedsTimeline: () => false,
    ideaTimelineRowButtonLabel: () => "Create VO timeline",
    escapeHtml,
    value: (value, fallback = "—") => escapeHtml(value ?? fallback),
    dateValue: () => "Oct 23",
    ideaStatusLabel: () => "Generated",
    ideaStructureLabel: () => "—",
    ideaProductionLabel: () => "—",
    badge: () => "",
    join: () => "",
  }
);
const render = (overrides = {}) => ideaRowHtml({
  id: "recfETIGvizOeh9ew",
  candidate_id: 2000,
  title: "Marina City Reflections",
  ...overrides,
});

test("Ideas page shows numeric Candidate_ID before the actual title", () => {
  assert.match(render(), /class="title-cell">2000 – Marina City Reflections<\/div>/);
  assert.match(render({ candidate_id: "2001", title: "River Bridge Lift" }),
    /class="title-cell">2001 – River Bridge Lift<\/div>/);
});

test("Listed and freshly updated Ideas use the same title formatter", () => {
  assert.match(render({ is_on_hold: true, photo_wait_status: "Waiting" }),
    /class="title-cell">2000 – Marina City Reflections <span class="subtle">\(Listening for photos\)<\/span><\/div>/);
  assert.match(app, /records\.map\(ideaRowHtml\)/);
  assert.match(app, /holder\.innerHTML = ideaRowHtml\(next\)/);
});

test("No Airtable record GUID is displayed as a title if the numeric ID is absent", () => {
  const row = render({ candidate_id: null });
  assert.match(row, /class="title-cell">Marina City Reflections<\/div>/);
  assert.doesNotMatch(row, /class="title-cell">recfETIGvizOeh9ew/);
  assert.match(render({ candidate_id: "invalid" }), /class="title-cell">Marina City Reflections<\/div>/);
});

test("Idea title remains HTML escaped", () => {
  assert.match(render({ title: "<script>alert(1)</script>" }),
    /class="title-cell">2000 – &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/div>/);
});

test("Studio cache-bust agrees with the updated Ideas JS release", () => {
  assert.match(app, /BUILD_ID = "item4-0\.6\.\d+-[a-z0-9-]+"/);
  assert.match(html, /app-item4-1008\.js\?v=0\.6\.\d+-[a-z0-9-]+/);
});
