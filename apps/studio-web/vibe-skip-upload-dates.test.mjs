import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const start = app.indexOf("  function ezWizardPick(");
const end = app.indexOf("  function renderEzWizard(", start);
assert.ok(start >= 0 && end > start, "Wizard selection handler exists");
const pickerCode = app.slice(start, end);

function simulatePick(answers) {
  const log = [], navigation = [], finish = [];
  const make = new Function("initial", "log", "navigation", "finish", `
    let ezWizardStep = "vibeVersions";
    let ezWizardAnswers = { ...initial };
    function ezWizardLogAdd(role, text) { log.push({ role, text }); }
    function ezWizardGo(nextStep) { navigation.push(nextStep); }
    function finishEzWizard() {
      finish.push({ ...ezWizardAnswers });
      return Promise.resolve();
    }
    ${pickerCode}
    return { pick: ezWizardPick, answers: () => ezWizardAnswers };
  `);
  return { ...make(answers, log, navigation, finish), log, navigation, finish };
}

test("Vibe Cut goes straight from cut versions to upload without confirming dates", () => {
  const wizard = simulatePick({
    start: "vibe-cut",
    inputKind: "vibe-cut",
    schedules: { "Instagram::Reel": "2026-11-05T11:00:00.000Z" },
  });
  wizard.pick("2 cuts", { vibeVersions: 2, packageId: "video" }, "confirm");
  assert.equal(wizard.navigation.length, 0);
  assert.equal(wizard.finish.length, 1);
  assert.equal(wizard.finish[0].vibeVersions, 2);
  assert.equal("schedules" in wizard.finish[0], false);
  assert.match(wizard.log.at(-1).text, /final approval/i);
});

test("regular Studio paths still show their existing date confirmation", () => {
  const wizard = simulatePick({ start: "photos", inputKind: "multiple-photos" });
  wizard.pick("Video", { packageId: "video" }, "confirm");
  assert.deepEqual(wizard.navigation, ["confirm"]);
  assert.equal(wizard.finish.length, 0);
});

test("Vibe Cut from an existing idea also skips provisional scheduling", () => {
  const wizard = simulatePick({ start: "idea", inputKind: "vibe-cut" });
  wizard.pick("1 cut", { vibeVersions: 1 }, "confirm");
  assert.equal(wizard.finish.length, 1);
  assert.equal(wizard.navigation.length, 0);
});

test("all three Vibe cut-version choices still reach the shared selector", () => {
  const section = app.slice(
    app.indexOf('if (ezWizardStep === "vibeVersions")'),
    app.indexOf('if (ezWizardStep === "ideaMode")'),
  );
  for (const count of [1, 2, 3]) {
    assert.ok(section.includes(`vibeVersions: ${count}, packageId: "video" }, "confirm"`));
  }
  assert.match(app, /automatic(?:ally)?/i);
});
