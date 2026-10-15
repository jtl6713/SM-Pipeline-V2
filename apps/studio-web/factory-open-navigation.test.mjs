import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));

async function openTargetResolver() {
  const source = await readFile(path.join(here, "assets/factory-open-target.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.FactoryOpenTargets.resolve;
}

test("Factory In Flight maps every production entity to its exact route", async () => {
  const resolve = await openTargetResolver();

  assert.deepEqual(
    { ...resolve({
      id: "recWheelRequest0001",
      kind: "request",
      idea_id: "recWheelIdea0000001",
      studio_state: "produce_stale",
      profile_id: "recChicagoProfile01",
    }) },
    {
      entity: "production_request",
      id: "recWheelRequest0001",
      page: "content",
      profileId: "recChicagoProfile01",
    },
  );

  assert.deepEqual(
    { ...resolve({
      id: "recQueueAlias000001",
      kind: "request",
      production_request_id: "recActualRequest001",
      studio_state: "Producing · crops",
    }) },
    {
      entity: "production_request",
      id: "recActualRequest001",
      page: "content",
      profileId: "",
    },
  );

  for (const studioState of ["Preparing Assets", "Waiting in render queue", "Rendering", "Waiting for shared render"]) {
    assert.deepEqual(
      { ...resolve({
        id: "recExactOutput00001",
        kind: "output",
        production_request_id: "recParentRequest001",
        studio_state: studioState,
      }) },
      {
        entity: "output",
        id: "recExactOutput00001",
        page: "outputs",
        profileId: "",
      },
    );
  }

  assert.equal(resolve({
    id: "recPromotedIdea0001",
    kind: "idea",
    production_request_id: "recPromotedRequest1",
  }).entity, "production_request");
  assert.deepEqual(
    { ...resolve({ id: "recIdeaOnly0000001", kind: "idea", studio_state: "Waiting for photos" }) },
    { entity: "idea", id: "recIdeaOnly0000001", page: "ideas", profileId: "" },
  );
});

test("Factory Open uses direct record helpers and Production tolerates a missing Ideas-list row", async () => {
  const app = await readFile(path.join(here, "assets/app-item4-1008.js"), "utf8");
  const factory = await readFile(path.join(here, "assets/factory-desk.js"), "utf8");
  const html = await readFile(path.join(here, "index.html"), "utf8");

  assert.match(factory, /FactoryOpenTargets\?\.resolve/);
  assert.match(factory, /StudioOpenProductionRequestById/);
  assert.match(factory, /StudioOpenPipelineOutputById/);
  assert.match(factory, /StudioOpenIdeaById/);
  assert.doesNotMatch(factory, /!card\.content_id && card\.idea_id/);

  const productionOpen = app.slice(
    app.indexOf("window.StudioOpenProductionRequestById"),
    app.indexOf("window.StudioOpenIdeaById"),
  );
  assert.match(productionOpen, /api\(`\/api\/production-requests\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(productionOpen, /productionRequest: record/);
  assert.match(productionOpen, /const idea = ideaId/);
  assert.match(productionOpen, /:\s*null;/);
  assert.doesNotMatch(productionOpen, /no linked Idea Candidate/);
  assert.doesNotMatch(productionOpen, /method:\s*"POST"|\/promote|\/produce|\/render/);

  const openForIdea = app.slice(
    app.indexOf("async function openProductionRequestForIdea"),
    app.indexOf("window.StudioOpenProductionRequestById"),
  );
  assert.match(openForIdea, /if \(!idea\?\.id && !productionRequest\?\.id\) return/);
  assert.match(openForIdea, /activeIdea = idea\?\.id \? idea : null/);

  const resolverAsset = html.indexOf("/assets/factory-open-target.js");
  const deskAsset = html.indexOf("/assets/factory-desk.js");
  assert.ok(resolverAsset > 0 && deskAsset > resolverAsset, "Factory target resolver must load before the desk binder");
  assert.match(app, /BUILD_ID = "item4-0.6.690-mae-horizon-overflow"/);
  assert.match(html, /UI build 0.6.690/);
});
