import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDIO_PROFILES_OVERVIEW_SNAPSHOT_SETTING,
  STUDIO_PROFILES_OVERVIEW_SNAPSHOT_FRESH_MS,
  STUDIO_PROFILES_OVERVIEW_SNAPSHOT_MAX_AGE_MS,
  emptyOverviewSnapshot,
  filterOverviewSnapshotRows,
  isOverviewSnapshotFresh,
  parseOverviewSnapshot,
  serializeOverviewSnapshot,
} from "./profiles-overview-snapshot.mjs";

test("snapshot setting name is stable for Settings row", () => {
  assert.equal(STUDIO_PROFILES_OVERVIEW_SNAPSHOT_SETTING, "STUDIO_PROFILES_OVERVIEW_SNAPSHOT_V1");
  assert.ok(STUDIO_PROFILES_OVERVIEW_SNAPSHOT_FRESH_MS >= 60_000);
  assert.ok(STUDIO_PROFILES_OVERVIEW_SNAPSHOT_MAX_AGE_MS > STUDIO_PROFILES_OVERVIEW_SNAPSHOT_FRESH_MS);
});

test("parseOverviewSnapshot normalizes rows and rejects junk", () => {
  assert.equal(parseOverviewSnapshot(null), null);
  assert.equal(parseOverviewSnapshot("not-json"), null);
  const parsed = parseOverviewSnapshot({
    updated_at: "2026-10-11T12:00:00.000Z",
    rows: [
      {
        id: "recA",
        name: "Chicago",
        city_label: "Chicago",
        scheduled: { instagram: 2 },
        manual: "3",
        failed: 1,
        approval: 4,
        ideas: 5,
      },
      { id: "", name: "drop" },
      null,
    ],
  });
  assert.equal(parsed.schema_version, 1);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].id, "recA");
  assert.equal(parsed.rows[0].manual, 3);
  assert.deepEqual(parsed.rows[0].scheduled, { instagram: 2 });
});

test("isOverviewSnapshotFresh respects freshness window", () => {
  const now = Date.parse("2026-10-11T12:02:00.000Z");
  const fresh = { updated_at: "2026-10-11T12:00:30.000Z" };
  const stale = { updated_at: "2026-10-11T11:50:00.000Z" };
  assert.equal(isOverviewSnapshotFresh(fresh, now, 120_000), true);
  assert.equal(isOverviewSnapshotFresh(stale, now, 120_000), false);
  assert.equal(isOverviewSnapshotFresh({}, now), false);
});

test("filterOverviewSnapshotRows keeps only authorized profile ids", () => {
  const rows = [
    { id: "recA", name: "A" },
    { id: "recB", name: "B" },
    { id: "recC", name: "C" },
  ];
  assert.deepEqual(
    filterOverviewSnapshotRows(rows, new Set(["recA", "recC"])).map((row) => row.id),
    ["recA", "recC"],
  );
  assert.deepEqual(filterOverviewSnapshotRows(rows, []), []);
});

test("serializeOverviewSnapshot round-trips", () => {
  const snap = emptyOverviewSnapshot("2026-10-11T12:00:00.000Z");
  snap.rows.push({
    id: "recA",
    name: "Chicago",
    city_label: "Chicago",
    scheduled: {},
    manual: 1,
    failed: 0,
    approval: 2,
    ideas: 3,
  });
  const again = parseOverviewSnapshot(serializeOverviewSnapshot(snap));
  assert.equal(again.rows[0].id, "recA");
  assert.equal(again.rows[0].ideas, 3);
  assert.equal(again.updated_at, "2026-10-11T12:00:00.000Z");
});
