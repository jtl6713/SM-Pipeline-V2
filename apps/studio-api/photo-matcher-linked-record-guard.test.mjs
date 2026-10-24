import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { firstLinkedRecordId } from "./asset-library.mjs";

const source = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

test("shared linked record helper recognizes authoritative Airtable link shapes", () => {
  assert.equal(firstLinkedRecordId(["rec12345678901234"]), "rec12345678901234");
  assert.equal(firstLinkedRecordId([{ id: "rec12345678901234" }]), "rec12345678901234");
  assert.equal(firstLinkedRecordId([]), "");
});

test("autonomous matcher prechecks never reference Worker-04-only linkedRecordIds", () => {
  const src = source("worker-functions-03.mjs");
  const evaluator = src.slice(
    src.indexOf("export async function evaluateAndMaybeAttachWaitingIdeaPhotos("),
    src.indexOf("/*__STUDIO_WORKER_END:evaluateAndMaybeAttachWaitingIdeaPhotos__*/"),
  );
  const create = src.slice(
    src.indexOf("export async function matchNewlyCreatedIdeaPhotos("),
    src.indexOf("/*__STUDIO_WORKER_END:matchNewlyCreatedIdeaPhotos__*/"),
  );
  assert.match(src, /firstLinkedRecordId,/);
  assert.match(evaluator, /firstLinkedRecordId\(f\(idea, "Content Items"\)\)/);
  assert.match(create, /firstLinkedRecordId\(f\(idea, "Content Items"\)\)/);
  assert.doesNotMatch(evaluator + create, /linkedRecordIds\(/,
    "unknown symbol used before rank_stills was the status-less matcher ReferenceError");
});

test("legacy listener retains operator guards without an unbound linkedRecordIds reference", () => {
  const src = source("worker-functions-02.mjs");
  const listener = src.slice(
    src.indexOf("export async function autoListenOpenPhotoIdeas("),
    src.indexOf("/*__STUDIO_WORKER_END:autoListenOpenPhotoIdeas__*/"),
  );
  assert.match(listener, /firstLinkedRecordId\(f\(live, "Content Items"\)\)/);
  assert.match(listener, /firstLinkedRecordId\(f\(live, "Production Requests"\)\)/);
  assert.doesNotMatch(listener, /linkedRecordIds\(/);
  assert.match(listener, /ideaHasExplicitPhotoProductionConfig/);
  assert.match(listener, /Studio_Photo_Wait_Status: "Waiting"/);
});
