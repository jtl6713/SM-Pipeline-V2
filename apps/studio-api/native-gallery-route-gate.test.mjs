import test from "node:test";
import assert from "node:assert/strict";
import {isNativeGalleryControlledPostPath as allowed}
  from "./native-gallery-route-gate.mjs";

const output="rec00000000000001",job="ngjob_01234567890123456789";
const factory="/api/factory/outputs/"+output;
const admitted=[
 factory+"/gallery-selection-preview",
 factory+"/gallery-enroll",
 factory+"/gallery-generate",
 factory+"/gallery/jobs/"+job+"/creative-decision",
 factory+"/gallery/jobs/"+job+"/factory-handoff",
 "/internal/native-gallery/claim-job",
 "/api/internal/native-gallery/claim-job",
 "/internal/native-gallery/reserve-launch",
 "/api/internal/native-gallery/reserve-launch",
 "/internal/native-gallery/commit-manifest",
 "/api/internal/native-gallery/commit-manifest",
];

test("every already-mounted C5/C6, private intent and creative POST crosses Phase 2A",()=>{
 for(const route of admitted)assert.equal(allowed(route,"POST"),true,route);
});
test("admission is strictly POST; no new DELETE PATCH PUT or malformed output identity",()=>{
 for(const route of admitted){
  for(const method of ["GET","HEAD","PATCH","PUT","DELETE","OPTIONS"])
   assert.equal(allowed(route,method),false,method+" "+route);
 }
 for(const route of [
  "/api/factory/outputs/recbad/gallery-generate",
  "/api/factory/outputs/rec00000000000001/gallery-generate/something",
  "/api/factory/outputs/rec00000000000001/gallery/jobs/no/creative-decision",
  "/api/factory/outputs/rec00000000000001/gallery/jobs/"+job+"/factory-approve",
  "/api/factory/outputs/rec00000000000001/gallery-revision-status",
  "/api/factory/outputs/rec00000000000001/gallery/jobs/"+job+"/slides/rec00000000000002/revised",
  "/api/internal/native-gallery/publish",
  "/api/internal/native-gallery/delete-all",
  "/api/internal/rendering-review/claim-render-job",
  "/api/factory/approval-batches",
  "/api/factory/outputs/rec00000000000001/correction-matches",
  "/api/internal/native-gallery/reserve-launch/extra",
  "/api/internal/native-gallery/claim-job?bypass=1",
  "/api/internal/native-gallery/%63laim-job",
 ])assert.equal(allowed(route,"POST"),false,route);
});
test("module stays a pure route predicate, not a release/authorization gate",()=>{
 assert.equal(allowed(null,"POST"),false);
 assert.equal(allowed("/api/factory/outputs/"+output+"/gallery-generate","post"),false);
 assert.equal(allowed("https://host/api/internal/native-gallery/claim-job","POST"),false);
});
