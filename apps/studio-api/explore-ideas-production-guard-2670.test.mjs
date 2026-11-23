import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exploreIdeaNeedsApproval } from "./idea-photo-wait.mjs";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const source02 = read("./worker-functions-02.mjs");
const source03 = read("./worker-functions-03.mjs");
const source04 = read("./worker-functions-04.mjs");
function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, start);
  const until = source.indexOf(end, from + start.length);
  assert.ok(until > from, end);
  return source.slice(from, until);
}

test("Explore is an editorial-only option until independently Approved", () => {
  for (const status of ["", "Generated", "Sent for Review", "On Hold", "Rejected", "Promoted"]) {
    assert.equal(exploreIdeaNeedsApproval({
      sourcingMode: " explore ", candidateStatus: status,
    }), true, status);
  }
  assert.equal(exploreIdeaNeedsApproval({ sourcingMode: "Explore", candidateStatus: "Approved" }), false);
  assert.equal(exploreIdeaNeedsApproval({ sourcingMode: "balanced", candidateStatus: "Generated" }), false);
  assert.equal(exploreIdeaNeedsApproval({ sourcingMode: "existing", candidateStatus: "Generated" }), false);
  assert.equal(exploreIdeaNeedsApproval({}), false);
});

test("manual Explore I1 completes as 1–10 ideas without immediate auto photo search", () => {
  const batch = section(source04,
    "export async function studioIdeaRunPythonBatch(", "/*__STUDIO_WORKER_END:studioIdeaRunPythonBatch__*/");
  assert.match(batch, /sourcingMode === "explore" \? \[\]/);
  assert.match(batch, /studioIdeaStartPhotoListening\(env, authorization, createdIds\)/);
  const listener = section(source04,
    "export async function studioIdeaStartPhotoListening(", "/*__STUDIO_WORKER_END:studioIdeaStartPhotoListening__*/");
  assert.ok(listener.indexOf("exploreIdeaNeedsApproval(") < listener.indexOf("createDraftForIdea("));
});

test("unapproved Explore cannot enter legacy listener or background matcher", () => {
  const legacy = section(source02,
    "export async function autoListenOpenPhotoIdeas(", "/*__STUDIO_WORKER_END:autoListenOpenPhotoIdeas__*/");
  assert.ok(legacy.indexOf("exploreIdeaNeedsApproval(") < legacy.indexOf('method: "PATCH"'));
  const matcher = section(source03,
    "export async function evaluateAndMaybeAttachWaitingIdeaPhotos(", "/*__STUDIO_WORKER_END:evaluateAndMaybeAttachWaitingIdeaPhotos__*/");
  assert.match(matcher, /if \(!force && exploreIdeaNeedsApproval\(/);
  assert.match(matcher, /action: "needs_approval"/);
  assert.match(matcher, /if \(autonomousAdmitted\)/);
  assert.match(matcher, /if \(env\.STUDIO_MEDIA && autonomousAdmitted\)/);
});

test("ready production and daily adoption exclude unapproved Explore even with Ready photo status", () => {
  const eligibility = section(source04,
    "function readyProductionIdeaEligible(", "async function discoverReadyProductionIdeas(");
  assert.match(eligibility, /exploreIdeaNeedsApproval\(/);
  assert.ok(eligibility.indexOf("exploreIdeaNeedsApproval(") <
    eligibility.indexOf('Studio_Photo_Wait_Status'));
  const adopter = section(source04,
    "export async function adoptNextReadyDailyIdea(", "/*__STUDIO_WORKER_END:adoptNextReadyDailyIdea__*/");
  assert.match(adopter, /sourcing_mode: String\(f\(idea, "Asset_Sourcing_Mode"\)/);
  assert.match(adopter, /dailyIdeasReadyToProduce\(plain\.filter/);
  assert.match(adopter, /exploreIdeaNeedsApproval\(/);
  assert.match(adopter, /"Asset_Sourcing_Mode"/);
});
