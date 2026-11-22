import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("#2574 SMV1 pending variants drain on 5-minute light tick, not only :00/:30", async () => {
  const source = await readFile(new URL("./worker.js", import.meta.url), "utf8");
  const start = source.indexOf("const cadence = studioCronAirtableCadence(");
  assert.ok(start >= 0);
  const cron = source.slice(start, start + 2300);
  assert.match(cron, /if \(!cadence\.heavy\) \{/);
  assert.match(cron, /ctx\.waitUntil\(item4DrainAllPendingWork\(env, \{ maxMs: 20000 \}\)/);
  assert.match(cron, /catch\(\(error\) => console\.warn\("item4 light-tick crop drain failed"/);
  assert.ok(cron.indexOf("item4DrainAllPendingWork") < cron.indexOf("IDEA HARVEST SLA"));
  assert.match(source, /item4Drain = await item4DrainAllPendingWork\(env, \{ maxMs: ITEM4_DRAIN_CRON_BUDGET_MS \}\)/);
  assert.match(source, /if \(!cadence\.heavy\) return;/);
});
