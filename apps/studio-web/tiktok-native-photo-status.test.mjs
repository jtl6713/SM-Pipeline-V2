import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./assets/app-item4-1008.js', import.meta.url), 'utf8');
const start = source.indexOf('      const draft = String(record?.tiktok_draft_status || "").trim();');
const end = source.indexOf('      const pct = pipelineDisplayPercent(record);', start);
assert.ok(start > 0 && end > start, 'native-photo status branch must exist');
const evaluate = new Function('record', 'state', source.slice(start, end) + '\nreturn label;');

for (const [id, count] of [[9869,4],[9884,4],[9897,4],[9907,4],[9910,8],[9921,8]]) {
  test(`TikTok ${id}: prepared ${count} photos do not regress to preparing`, () => {
    assert.equal(evaluate({ output_status:'Approved for Publishing', tiktok_draft_status:'Failed', publish_status:'Failed' }, 'Manual Action Required'), 'Photos ready · delivery failed');
  });
}
test('native photo route still reports genuine unprepared work', () => {
  assert.equal(evaluate({ output_status:'In Production' }, 'Preparing Assets'), 'Preparing photos');
});
test('native photo route reports prepared assets without delivery failure', () => {
  assert.equal(evaluate({ output_status:'Approved for Publishing' }, 'Manual Action Required'), 'Photos ready');
});
