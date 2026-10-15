import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

test("UI build advertises idea find-images local refresh", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.688-suggested-schedule-prefill"/);
  assert.match(html, /UI build 0.6.688/);
  assert.match(html, /app-item4-1008\.js\?v=0.6.688-suggested-schedule-prefill/);
});

test("Find images now patches one idea row instead of reloading Ideas", () => {
  assert.match(app, /data-idea-row=/);
  assert.match(app, /function refreshIdeaListRow/);
  assert.match(app, /function refreshIdeaAfterPhotoMatch/);
  assert.match(app, /Update only this idea row/);

  const rowHandler = app.slice(
    app.indexOf('scope.querySelectorAll("[data-idea-find-images]")'),
    app.indexOf('scope.querySelectorAll("[data-idea-timeline]")')
  );
  assert.match(rowHandler, /refreshIdeaAfterPhotoMatch/);
  assert.doesNotMatch(rowHandler, /loadIdeas\(\)/);
  assert.doesNotMatch(rowHandler, /loadDashboard\(\)/);

  const manageHandler = app.slice(
    app.indexOf('$("matchIdeaPhotosButton")?.addEventListener("click"'),
    app.indexOf('$("openIdeaProductionButton")?.addEventListener("click"')
  );
  assert.match(manageHandler, /refreshIdeaAfterPhotoMatch/);
  assert.doesNotMatch(manageHandler, /loadIdeas\(\)/);
  assert.doesNotMatch(manageHandler, /loadDashboard\(\)/);
  assert.doesNotMatch(manageHandler, /loadProductionRequests\(\)/);
});
