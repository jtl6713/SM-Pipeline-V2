import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { verifyPromotionReadback } from "./production-promotion-readback.mjs";

const good = () => ({
  request: { id: "request-uuid", promoted_content_item_id: null },
  content: { id: "content-uuid", production_request_id: "request-uuid", content_profile_id: "profile-uuid" },
  plans: [
    { id: "pro-1", enabled: true, production_request_id: "request-uuid", content_item_id: "content-uuid", platform_output_id: "po-1", platform: "Instagram", output_type: "Carousel" },
    { id: "pro-2", enabled: true, production_request_id: "request-uuid", content_item_id: "content-uuid", platform_output_id: "po-2", platform: "Facebook", output_type: "Multi-Image Post" },
  ],
  outputs: [
    { id: "po-1", content_item_id: "content-uuid", content_profile_id: "profile-uuid", platform: "Instagram", studio_output_type: "Carousel" },
    { id: "po-2", content_item_id: "content-uuid", content_profile_id: "profile-uuid", platform: "Facebook", studio_output_type: "Multi-Image Post" },
  ],
  expected: 2,
});

test("2/2 committed I3/I4 routing verifies typed owner, platform, type and profile", () => {
  assert.deepEqual(verifyPromotionReadback(good()), { ok: true, enabled: 2, committed: 2, linked: 2 });
});

test("0/N, partial fanout, and unlinked output never appear promoted", () => {
  const absent = good(); absent.outputs = [];
  assert.equal(verifyPromotionReadback(absent).reason, "committed_output_count_mismatch");
  const partial = good(); partial.outputs.pop();
  assert.equal(verifyPromotionReadback(partial).reason, "committed_output_count_mismatch");
  const unlinked = good(); unlinked.plans[0].platform_output_id = null;
  assert.equal(verifyPromotionReadback(unlinked).reason, "committed_plan_fk_missing");
});

test("existing outputs missing PRO links must not be regenerated or falsely accepted", () => {
  const g = good(); g.plans[1].platform_output_id = null;
  assert.equal(verifyPromotionReadback(g).ok, false);
  const swapped = good(); swapped.plans[0].platform_output_id = "po-2";
  assert.equal(verifyPromotionReadback(swapped).reason, "platform_type_or_profile_mismatch");
  const duplicate = good(); duplicate.plans[1].platform_output_id = "po-1";
  assert.equal(verifyPromotionReadback(duplicate).reason, "missing_or_duplicate_output_link");
});

test("reject foreign parent, foreign output profile, wrong output type and extra rows", () => {
  const parent = good(); parent.content.production_request_id = "other-request";
  assert.equal(verifyPromotionReadback(parent).reason, "parent_owner_mismatch");
  const pro = good(); pro.plans[1].production_request_id = "other-request";
  assert.equal(verifyPromotionReadback(pro).reason, "plan_request_owner_mismatch");
  const po = good(); po.outputs[0].content_profile_id = "other-profile";
  assert.equal(verifyPromotionReadback(po).reason, "platform_type_or_profile_mismatch");
  const format = good(); format.outputs[0].studio_output_type = "Story";
  assert.equal(verifyPromotionReadback(format).reason, "platform_type_or_profile_mismatch");
  const extra = good(); extra.outputs.push({ ...extra.outputs[0], id:"po-3" });
  assert.equal(verifyPromotionReadback(extra).reason, "committed_output_count_mismatch");
  const none = good(); none.expected = 0;
  assert.equal(verifyPromotionReadback(none).reason, "invalid_expected_count");
});

test("promotion gates Promoted mutation on full committed FK readback", () => {
  const code = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const start = code.indexOf("export async function finalizeProductionRequestPromotion(");
  const end = code.indexOf("/*__STUDIO_WORKER_END:finalizeProductionRequestPromotion__*/", start);
  assert.ok(start >= 0 && end > start);
  const section = code.slice(start, end);
  const fanout = section.indexOf("assertProductionRequestFanoutComplete(outputFanout)");
  const readback = section.indexOf("await readCommittedPromotionFanout(");
  const promoted = section.indexOf('Request_Status: "Promoted"');
  assert.ok(fanout >= 0 && readback > fanout && promoted > readback);
  assert.match(section, /if \(!committed\?\.ok\).*throw new HttpError\(409,/s);
  assert.doesNotMatch(section, /sendToMeta|publishNow|approveAll/);
});
