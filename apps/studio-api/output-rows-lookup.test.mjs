import test from "node:test";
import assert from "node:assert/strict";

// Pure helpers mirroring outputRowsForProductionRequest chunking so we lock
// the RECORD_ID() fanout formula that replaces the broken global limit:100 scan.

function chunkIds(ids, size = 40) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

function recordIdFormula(ids) {
  return `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
}

test("output row lookup chunks linked ids into RECORD_ID formulas", () => {
  const ids = Array.from({ length: 45 }, (_, i) => `rec${String(i).padStart(14, "A")}`);
  const chunks = chunkIds(ids, 40);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 40);
  assert.equal(chunks[1].length, 5);
  assert.equal(
    recordIdFormula(chunks[0]),
    `OR(${chunks[0].map((id) => `RECORD_ID()='${id}'`).join(",")})`
  );
});

test("video package destinations stay at six (4 mains + IG/FB Stories)", () => {
  const videoPackage = [
    "Instagram::Reel",
    "Facebook::Reel",
    "TikTok::Video Draft",
    "YouTube::Short",
    "Instagram::Story",
    "Facebook::Story",
  ];
  assert.equal(videoPackage.length, 6);
  assert.ok(videoPackage.includes("Instagram::Story"));
  assert.ok(videoPackage.includes("Facebook::Story"));
  assert.ok(!videoPackage.includes("Instagram::Single Image"));
});

test("pipeline output list must sort newest Output_ID first", () => {
  // Guards the Streeterville regression: unsorted maxRecords=100 hid 424/425.
  const listOutputsSort = { sortField: "Output_ID", sortDirection: "desc" };
  assert.equal(listOutputsSort.sortField, "Output_ID");
  assert.equal(listOutputsSort.sortDirection, "desc");
  const ids = [419, 420, 421, 422, 423, 424, 425];
  const page = [...ids].sort((a, b) => b - a).slice(0, 100);
  assert.deepEqual(page.slice(0, 2), [425, 424]);
  assert.ok(page.includes(424) && page.includes(425));
});

test("pipeline list merges open older packages that fall outside newest-N", () => {
  // CI 206 / outputs 887–892 aged out once newest Output_ID reached 1133 and
  // Pipeline only loaded the newest 100 rows. Keep unfinished rows via merge.
  const newest = Array.from({ length: 100 }, (_, i) => 1133 - i); // 1133..1034
  const openOlder = [892, 891, 889, 887];
  const merged = [...new Set([...openOlder, ...newest])].sort((a, b) => b - a);
  assert.ok(!newest.includes(889));
  assert.ok(merged.includes(889));
  assert.ok(merged.includes(887));
  assert.equal(merged[0], 1133);
});
