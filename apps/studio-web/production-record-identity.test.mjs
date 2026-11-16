import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(dir, "assets/app-item4-1008.js"), "utf8");

function ideaIdentityHelpers() {
  const start = app.indexOf("  function ideaLinkId(");
  const end = app.indexOf("  async function ensureIdeasCache(", start);
  assert.ok(start >= 0 && end > start, "idea identity helpers must exist");
  return app.slice(start, end);
}

test("Production heading ignores a different Ideas drawer selection", () => {
  const ctx = {
    activeIdea: { id: "recOtherIdea", title: "Pier Marine Layer Watch" },
    ideasCache: [{ id: "recTasteTour", title: "Taste Tour: GCM" }],
    productionContentRecords: [{ id: "recContent597", content_id: 597, title: "Taste Tour: GCM" }],
  };
  vm.createContext(ctx);
  vm.runInContext(ideaIdentityHelpers() + String.raw`
    result = productionRequestHeading({
      idea_record_id: "recTasteTour",
      promoted_content_item_links: ["recContent597"],
    });
  `, ctx);
  assert.equal(ctx.result, "Taste Tour: GCM · Content 597");
});

test("Unknown request identity never borrows another idea's title", () => {
  const ctx = {
    activeIdea: { id: "recOtherIdea", title: "Pier Marine Layer Watch" },
    ideasCache: [],
    productionContentRecords: [{ id: "recContent597", content_id: 597, title: "Taste Tour: GCM" }],
  };
  vm.createContext(ctx);
  vm.runInContext(ideaIdentityHelpers() + String.raw`
    result = productionRequestHeading({ promoted_content_item_links: ["recContent597"] });
  `, ctx);
  assert.equal(ctx.result, "Taste Tour: GCM · Content 597");
});

test("Timeline open keeps the Ideas title when Idea_Candidate is omitted from the payload", () => {
  const ctx = {
    activeIdea: { id: "recCreekView", title: "CreekView timeline" },
    ideasCache: [{ id: "recCreekView", title: "CreekView timeline" }],
    productionContentRecords: [],
  };
  vm.createContext(ctx);
  vm.runInContext(ideaIdentityHelpers() + String.raw`
    stamped = withIdeaIdentityOnRequest({ id: "recPr1", status: "Ready" }, activeIdea);
    result = productionRequestHeading(stamped);
  `, ctx);
  assert.equal(ctx.stamped.idea_record_id, "recCreekView");
  assert.equal(ctx.stamped.idea_title, "CreekView timeline");
  assert.equal(ctx.result, "CreekView timeline");
});

test("Production heading uses the matching Ideas drawer title before Untitled piece", () => {
  const ctx = {
    activeIdea: { id: "recCreekView", title: "CreekView timeline" },
    ideasCache: [],
    productionContentRecords: [],
  };
  vm.createContext(ctx);
  vm.runInContext(ideaIdentityHelpers() + String.raw`
    result = productionRequestHeading({
      idea_record_id: "recCreekView",
      idea_candidate_links: ["recCreekView"],
    });
  `, ctx);
  assert.equal(ctx.result, "CreekView timeline");
});

test("Request switch clears unrelated activeIdea before timed-script hydration", () => {
  const start = app.indexOf("  function populateProductionRequestForm(");
  const end = app.indexOf("  async function findExistingProductionRequestForIdea(", start);
  const source = app.slice(start, end);
  assert.match(source, /const requestIdeaId = ideaIdFromRequest\(record\)/);
  assert.match(source, /String\(activeIdea\?\.id \|\| ""\) !== String\(requestIdeaId\)/);
  assert.match(source, /record = withIdeaIdentityOnRequest\(record, activeIdea\)/);
  assert.match(source, /intentionally opened idea/);
  assert.ok(source.indexOf("activeIdea = ideasCache.find") < source.indexOf("productionTimedScript = parseProductionTimedScript"));
  assert.match(source, /ideaTimedScriptPreview\?\.ideaId === activeIdea\?\.id/);
});

test("Stale response cannot overwrite later open editor", () => {
  const start = app.indexOf("  async function loadProductionRequestOutputs(");
  const end = app.indexOf("  function defaultOutputsForPlatforms(", start);
  const code = app.slice(start, end);
  assert.match(code, /activeProductionRequest\?\.id !== record\.id \|\| revision !== item4WorkspaceRevision\) return/);
  const contentOpen = app.slice(app.indexOf('target.querySelectorAll("[data-content-request]")'),app.indexOf('target.querySelectorAll("[data-content-pipeline]")'));
  assert.match(contentOpen, /result\?\.record\?\.id === requestId && activeProductionRequest\?\.id === requestId/);
  const draftOpen = app.slice(app.indexOf('async function loadProductionRequests('), app.indexOf('function ideaStructureLabel('));
  assert.match(draftOpen,/fresh\?\.record\?\.id === record\.id && activeProductionRequest\?\.id === record\.id/);
});
