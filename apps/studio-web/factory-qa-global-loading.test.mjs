import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const js=readFileSync(new URL("./assets/factory-batch-quality-0710.js",import.meta.url),"utf8");

test("global Factory loading state must not ask for a missing Content Profile",()=>{
  assert.match(js,/function panelMarkup\(\{ profileId, data, error, factoryView = false \}\)/);
  assert.match(js,/if \(!factoryView && data\?\.scope !== "all"/);
  assert.match(js,/if \(!data && !error && factoryView\)/);
  assert.match(js,/Checking Quality Agent findings across all profiles/);
});
test("routine navigation and focus refreshes reuse coalesced census; explicit refresh bypasses it",()=>{
  assert.match(js,/async function refresh\(force = false, freshCensus = false\)/);
  assert.match(js,/if \(global && freshCensus\) query\.set\("fresh_output_failures", "1"\)/);
  assert.match(js,/function refreshSoon\(\).*refresh\(true\)/s);
  assert.match(js,/function refreshCensusSoon\(\).*refresh\(true, true\)/s);
  assert.match(js,/factoryBatchQualityRefresh"\)\?\.addEventListener\("click", refreshCensusSoon\)/);
  assert.doesNotMatch(js,/if \(global && force\) query\.set\("fresh_output_failures"/);
});
test("global identity is kept with stored render state through async changes",()=>{
  assert.match(js,/state\.lastView = \{ profileId, data, error, global \}/);
  assert.match(js,/panelMarkup\(\{ profileId, data, error, factoryView: global \}\)/);
  assert.match(js,/state\.lastView\.global/);
});
