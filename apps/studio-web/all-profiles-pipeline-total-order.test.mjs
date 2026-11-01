import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./assets/all-profiles-overview-1007.js", import.meta.url), "utf8");

test("Pipeline Total is the first metric column after Profile in both header and rows", () => {
  const header = source.slice(source.indexOf('<thead><tr class="all-profiles-group-row">'));
  const profileAt = header.indexOf('>Profile</th>');
  const totalAt = header.indexOf('>Pipeline · Total</th>');
  const platformGroupAt = header.indexOf('>Future + Review platform outputs</th>');
  assert.ok(profileAt >= 0 && profileAt < totalAt && totalAt < platformGroupAt);
  const row = source.slice(source.indexOf('const rowHtml ='));
  const totalCellAt = row.indexOf('<td data-label="Pipeline total">');
  const platformCellAt = row.indexOf('${platformOrder.map((p) => `<td data-label=');
  assert.ok(totalCellAt >= 0 && totalCellAt < platformCellAt);
});

test("Pipeline Total has normal column styling, and keeps the same computed figure", () => {
  assert.match(source, /<td data-label="Pipeline total">\$\{calendar\.pipelineTotal\}<\/td>/);
  assert.doesNotMatch(source, /<td data-label="Pipeline total" class=/);
  assert.match(source, /const pipelineTotal = future \+ awaiting;/);
  assert.match(source, /rowHtml\(\{ name: "Total", \.\.\.total \}, true\)/);
});
