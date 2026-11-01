import test from "node:test";
import assert from "node:assert/strict";
import {
  factoryCorrectionEligible, factoryCorrectionMatches,
  validateFactoryCorrectionSelection,
} from "./factory-correction-selection.mjs";
import { productionFormatSignature } from "./production-format-groups.mjs";

const id = n => "rec" + String(n).padStart(14, "0");
const profile = id(900), request = id(901), content = id(902);
const format = (family, label, ratio) => ({
  pipeline_family: family, format: label, aspect_ratio: ratio,
  key: productionFormatSignature({
    pipeline_family: family, format: label, aspect_ratio: ratio,
  }),
});
const vertical = format("Video", "Vertical Short Video", "9:16");
const story = format("Story", "Story", "9:16");
const main = (n, platform, output_type) => ({
  id: id(n), production_request_id: request, content_item_id: content,
  profile_id: profile, platform, output_type, enabled: true,
  render_format: vertical, render_status: "Rendered",
  output_status: "Ready for Review",
  final_file_url: "https://cdn.example.com/video.mp4",
  publish_mode: "Draft", scheduled_at: null,
});
const rows = [
  main(1, "Instagram", "Reel"),
  main(2, "Facebook", "Reel"),
  main(3, "TikTok", "Video Draft"),
  main(4, "YouTube", "Short"),
  {...main(5, "Instagram", "Story"), render_format: story},
  {...main(6, "Facebook", "Story"), render_format: story},
];
const match = (source = rows[0], candidates = rows, profiles = [profile]) =>
  factoryCorrectionMatches(source, candidates, { authorized_profile_ids: profiles });

test("Factory matches all four 9:16 Reel/Short outputs using PR #1406 format contract", () => {
  assert.deepEqual(match().map(x => x.id), rows.slice(0, 4).map(x => x.id));
  assert.deepEqual(match(rows[4]).map(x => x.id), rows.slice(4, 6).map(x => x.id));
});
test("new platform joins automatically when render contract and ownership match", () => {
  const future = main(7, "Future Network", "Vertical Film");
  assert.ok(match(rows[0], [...rows, future]).some(x => x.id === future.id));
});
test("never cross profile, content, production request, format or aspect ratio", () => {
  const candidates = [
    rows[0],
    { ...main(8, "TikTok", "Video Draft"), profile_id: id(800) },
    { ...main(9, "TikTok", "Video Draft"), content_item_id: id(801) },
    { ...main(10, "TikTok", "Video Draft"), production_request_id: id(802) },
    { ...main(11, "TikTok", "Video Draft"),
      render_format: format("Video", "Vertical Short Video", "4:5") },
    { ...main(12, "TikTok", "Video Draft"),
      render_format: format("Video", "Other", "9:16") },
  ];
  assert.deepEqual(match(rows[0], candidates).map(x => x.id), [rows[0].id]);
  assert.deepEqual(match(rows[0], rows, [id(800)]), []);
});
test("published, dispatching, held, incomplete and duplicate outputs are excluded", () => {
  const candidates = [
    rows[0], rows[0],
    {...rows[1], published_at: "2026-10-31T18:00:00Z"},
    {...rows[2], publish_locked_at: "2026-10-31T18:00:00Z"},
    {...rows[3], review_hold_active: true},
    {...main(7, "Future", "Video"), render_status: "Rendering"},
    {...main(8, "Future", "Video"), final_file_url: ""},
    {...main(9, "Future", "Video"), active_render_job_id: "job-1"},
  ];
  assert.deepEqual(match(rows[0], candidates).map(x => x.id), [rows[0].id]);
  assert.equal(factoryCorrectionEligible({...rows[1], do_not_publish: true}), false);
});
test("selection includes only explicitly checked, compatible output IDs", () => {
  const result = validateFactoryCorrectionSelection({
    source: rows[0], outputs: rows, authorized_profile_ids: [profile],
    selected_output_ids: [rows[0].id, rows[2].id], note: "Replace the nighttime frame",
    client_request_id: "factoryreview_12345678",
  });
  assert.deepEqual(result.output_ids, [rows[0].id, rows[2].id]);
  assert.equal(result.note, "Replace the nighttime frame");
  assert.equal(result.render_format_key, vertical.key);
  assert.equal(result.profile_id, profile);
});
test("Chicago, LA, New York and Miami each match only their own outputs", () => {
  const cities = [id(900), id(910), id(920), id(930)];
  const all = cities.flatMap((city, index) =>
    rows.slice(0, 4).map((row, offset) => ({
      ...row,
      id: id(100 + index * 10 + offset),
      profile_id: city,
      production_request_id: id(1000 + index),
      content_item_id: id(2000 + index),
    }))
  );
  for (const [index, city] of cities.entries()) {
    const source = all[index * 4];
    const matched = factoryCorrectionMatches(source, all, {
      authorized_profile_ids: cities,
    });
    assert.equal(matched.length, 4);
    assert.ok(matched.every(row => row.profile_id === city));
    assert.deepEqual(factoryCorrectionMatches(source, all, {
      authorized_profile_ids: cities.filter(other => other !== city),
    }), []);
  }
});

test("malformed, stale, mismatched and duplicate selection fails closed", () => {
  const base = {
    source: rows[0], outputs: rows, authorized_profile_ids: [profile],
    selected_output_ids: [rows[0].id], note: "Fix the footage",
    client_request_id: "factoryreview_12345678",
  };
  for (const change of [
    {selected_output_ids: []},
    {selected_output_ids: [rows[0].id, rows[0].id]},
    {selected_output_ids: [rows[4].id]},
    {selected_output_ids: [id(800)]},
    {authorized_profile_ids: [id(800)]},
    {note: " "},
    {note: "a".repeat(3001)},
    {client_request_id: "short"},
  ]) assert.throws(() => validateFactoryCorrectionSelection({...base, ...change}));
});
test("a previously scheduled target is marked for protected vacate, not modified", () => {
  const scheduled = {...rows[1], scheduled_at: "2026-11-01T12:00:00-05:00"};
  const result = validateFactoryCorrectionSelection({
    source: rows[0], outputs: [rows[0], scheduled],
    authorized_profile_ids: [profile], selected_output_ids: [scheduled.id],
    note: "Correct the footage", client_request_id: "factoryreview_12345678",
  });
  assert.equal(result.outputs[0].requires_schedule_vacate, true);
  assert.equal(scheduled.scheduled_at, "2026-11-01T12:00:00-05:00");
});
