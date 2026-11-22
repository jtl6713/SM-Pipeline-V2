import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { assertProductionRequestFanoutComplete } from "./worker-functions-02.mjs";

const api = fs.readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
const readback = fs.readFileSync(new URL("./production-promotion-readback.mjs", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../studio-web/assets/app-item4-1008.js", import.meta.url), "utf8");

test("promotion summary rejects partial fanout", () => {
  assert.throws(() => assertProductionRequestFanoutComplete({
    enabled_output_count: 4, routed_count: 1, blocked_count: 0, remaining: 0,
  }), /routing is incomplete/);
  assert.doesNotThrow(() => assertProductionRequestFanoutComplete({
    enabled_output_count: 4, routed_count: 4, blocked_count: 0, remaining: 0,
  }));
});

test("canonical readback gate precedes the Promoted write", () => {
  const start = api.indexOf("export async function finalizeProductionRequestPromotion");
  const end = api.indexOf("/*__STUDIO_WORKER_END:finalizeProductionRequestPromotion__*/", start);
  const body = api.slice(start, end);
  assert.ok(body.indexOf("readCommittedPromotionFanout(") > 0);
  assert.ok(body.indexOf("readCommittedPromotionFanout(") < body.indexOf('Request_Status: "Promoted"'));
  assert.match(readback, /production_request_outputs\?production_request_id=/);
  assert.match(readback, /platform_output_id/);
  assert.match(readback, /missing_or_duplicate_output_link/);
});

test("Production and Pipeline render truthful X\/N lifecycle states", () => {
  assert.match(ui, /Platform Outputs · \$\{progressState\} \$\{linkedCount\}\/\$\{rows\.length\}/);
  assert.match(ui, /Platform Outputs · \$\{escapeHtml\(state\)\} \$\{created\}\/\$\{planned\}/);
  assert.doesNotMatch(ui, /No platform outputs generated yet/);
});
