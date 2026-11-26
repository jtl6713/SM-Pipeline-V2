import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const start = app.indexOf("  function ezWizardPick(");
const end = app.indexOf("  function renderEzWizard(", start);
assert.ok(start >= 0 && end > start, "Wizard selection handler exists");
const pickerCode = app.slice(start, end);

const candidateCode = app.slice(app.indexOf("  const automaticEzWizardKinds ="), app.indexOf("  function automaticEzWizardCounts("));
const confirmationCode = app.slice(app.indexOf("  async function routeAutomaticEzWizardConfirmation("), app.indexOf("  async function finishEzWizard("));
assert.ok(candidateCode.includes("function automaticEzWizardCandidate") && confirmationCode.includes("function routeAutomaticEzWizardConfirmation"));

function simulatePick(answers, {automatic = false} = {}) {
  const log = [], navigation = [], finish = [], offers = [], messages = [];
  const make = new Function("initial", "log", "navigation", "finish", "offers", "messages", "automatic", `
    let ezWizardStep = "vibeVersions";
    let ezWizardAnswers = { ...initial };
    function ezWizardLogAdd(role, text) { log.push({ role, text }); }
    function ezWizardGo(nextStep) { navigation.push(nextStep); }
    function finishEzWizard() {
      finish.push({ ...ezWizardAnswers });
      return Promise.resolve();
    }
    let ezWizardBusy = false;
    function setEzWizardBusy(busy) { ezWizardBusy = busy; }
    function ezWizardSetMessage(message) { messages.push(message); }
    async function offerAutomaticEzWizardIntake(answers) { offers.push({...answers}); return automatic; }
    ${candidateCode}
    ${confirmationCode}
    ${pickerCode}
    return { pick: ezWizardPick, answers: () => ezWizardAnswers };
  `);
  return { ...make(answers, log, navigation, finish, offers, messages, automatic), log, navigation, finish, offers, messages };
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

test("regular Studio paths still show their existing date confirmation with the automatic editor boundary off", async () => {
  const wizard = simulatePick({ start: "photos", inputKind: "multiple-photos" });
  wizard.pick("Video", { packageId: "video" }, "confirm");
  await Promise.resolve();
  assert.equal(wizard.offers.length, 1);
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

test("capability-enabled ordinary EZ intake does not show provisional dates", async () => {
  const wizard = simulatePick({ start: "photos", inputKind: "multiple-photos" }, {automatic:true});
  wizard.pick("Video", {packageId:"video"}, "confirm");
  await Promise.resolve();
  assert.equal(wizard.offers.length,1);
  assert.deepEqual(wizard.navigation,[]);
  assert.equal(wizard.finish.length,0);
});
test("existing Idea and dedicated finished-video paths retain date confirmation", () => {
  for(const answers of [{start:"idea",ideaId:"recExisting",inputKind:"single-photo"},{start:"photos",inputKind:"finished-video"}]){
    const wizard=simulatePick(answers,{automatic:true});
    wizard.pick("Video",{packageId:"video"},"confirm");
    assert.deepEqual(wizard.navigation,["confirm"]);
    assert.equal(wizard.offers.length,0);
  }
});
