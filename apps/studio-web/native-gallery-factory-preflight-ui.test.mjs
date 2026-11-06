import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const factory=readFileSync(new URL("./assets/factory-desk.js",import.meta.url),"utf8");
const worker=readFileSync(new URL("../studio-api/worker.js",import.meta.url),"utf8");

test("Factory preflight is offered only for accepted held V2 when server opts in",()=>{
 assert.match(factory,/job\.status==="creative_accepted"\s*&&\s*revision\.factory_preflight_available===true/);
 assert.match(factory,/Verify private Factory review packet/);
 assert.match(factory,/\/factory-preflight"/);
 assert.match(worker,/nativeGalleryFactoryPreflightEnabled\(env\)/);
});
test("private handoff receipt does not masquerade as Factory approval or publication",()=>{
 for(const required of [
  "packet.ready_for_factory_review!==true",
  "packet.drive_rights_and_pixels_verified!==true",
  "packet.factory_approved!==false",
  "packet.handoff_performed!==false",
  "packet.can_publish!==false",
  "packet.publication_authorized!==false",
  "packet.requires_separate_factory_approval!==true",
 ])assert.ok(factory.includes(required),required);
 assert.match(factory,/The output stays held; Factory approval and publication remain separate/);
 assert.match(worker,/inspectNativeGalleryFactoryPreflight\(/);
});

test("private Factory transfer requires a second affirmative human action and exact held receipt",()=>{
 assert.match(factory,/revision\.factory_handoff_available===true/);
 assert.match(factory,/job\.stage!=="factory_review_pending"/);
 assert.match(factory,/Send to private Factory review/);
 assert.match(factory,/checkbox\.type="checkbox"/);
 assert.match(factory,/confirm_private_factory_handoff:true/);
 assert.match(factory,/moved\.private_factory_review_handoff!==true/);
 assert.match(factory,/moved\.hold_released!==false/);
 assert.match(factory,/moved\.factory_approved!==false/);
 assert.match(factory,/moved\.publication_authorized!==false/);
 assert.match(factory,/moved\.media_quarantined!==true/);
 assert.match(worker,/handoffNativeGalleryToPrivateFactory\(/);
 assert.match(worker,/nativeGalleryPrivateFactoryHandoffEnabled\(env\)/);
});

test("private correction request capabilities are server-authorized and never release a publication hold",()=>{
 assert.match(worker,/hold_enrollment_request_enabled:nativeGalleryEnrollmentEnabled\(env\)/);
 assert.match(worker,/generation_request_enabled:nativeGalleryJobsEnabled\(env\)/);
 assert.match(factory,/revision\.can_generate!==false\|\|revision\.can_publish!==false/);
 assert.match(factory,/revision\.generation_request_enabled===true/);
 assert.match(factory,/revision\.hold_enrollment_request_enabled===true/);
 assert.match(factory,/receipt\.publication_authorized!==false/);
 assert.match(factory,/galleryActions\.jobCount===0/);
});
