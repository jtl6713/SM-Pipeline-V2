import assert from "node:assert/strict";
import test from "node:test";

import {
  autonomousInWindow,
  autonomousIncomingMediaIds,
  isDerivedLibraryStillName,
  autonomousMasterMediaIds,
  autonomousPlanOverrides,
  autonomousPlanExtras,
  autonomousDefaultVoiceoverSeconds,
  AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID,
  autonomousRunIsBusy,
  autonomousSlot,
  autonomousSlotAlreadyClaimed,
  isAutonomousOrigin,
  extractJsonObject,
  mapYoutubeSearchItems,
  observationIsRecent,
  parseAutonomousLastRun,
  parseAutonomousPick,
  parseRssItemTitles,
  summarizeObservations,
} from "./autonomous-produce.mjs";

test("Chicago 8am and 4pm are autonomous windows", () => {
  assert.equal(autonomousInWindow({ hour: 8 }), true);
  assert.equal(autonomousInWindow({ hour: 16 }), true);
  assert.equal(autonomousInWindow({ hour: 1 }), false);
  assert.equal(autonomousInWindow({ hour: 13 }, "0 13 * * *"), true);
});

test("slot keys are once per morning and afternoon", () => {
  assert.equal(autonomousSlot({ date: "2026-08-30", hour: 8 }), "2026-08-30:am");
  assert.equal(autonomousSlot({ date: "2026-08-30", hour: 16 }), "2026-08-30:pm");
  assert.equal(autonomousSlot({ date: "2026-08-30", hour: 9 }), null);
  assert.equal(autonomousRunIsBusy({ status: "picking", at: "2026-08-30T13:27:00Z" }, Date.parse("2026-08-30T13:27:14Z")), true);
  assert.equal(autonomousRunIsBusy({ status: "reset" }), false);
  assert.equal(autonomousSlotAlreadyClaimed({ slot: "2026-08-30:am", status: "waiting_variants" }, "2026-08-30:am"), true);
  assert.equal(autonomousSlotAlreadyClaimed({ slot: "2026-08-30:am", status: "reset" }, "2026-08-30:am"), false);
});

test("RSS parser reads CDATA titles", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[Pilsen mural walk draws a crowd]]></title></item>
    <item><title>Cubs night at Wrigley</title></item>
  </channel></rss>`;
  assert.deepEqual(parseRssItemTitles(xml), [
    "Pilsen mural walk draws a crowd",
    "Cubs night at Wrigley",
  ]);
});

test("recent observations drop older posts", () => {
  const now = Date.parse("2026-08-30T12:00:00Z");
  const rows = summarizeObservations([
    { caption: "old", published_at: "2026-08-20T12:00:00Z", engagement_score: 99 },
    { caption: "hot pilsen", published_at: "2026-08-30T10:00:00Z", engagement_score: 4, handle: "chi" },
  ], { nowMs: now, limit: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].caption, "hot pilsen");
  assert.equal(observationIsRecent("2026-08-20T12:00:00Z", now), false);
});

test("YouTube mapper keeps titles and picker requires assets", () => {
  const videos = mapYoutubeSearchItems({
    items: [{ snippet: { title: "Chicago river kayak", channelTitle: "Local", publishedAt: "2026-08-30T01:00:00Z" } }],
  });
  assert.equal(videos[0].title, "Chicago river kayak");
  assert.equal(parseAutonomousPick({ skip: true, reason: "no_asset_backed_trend" }).reason, "no_asset_backed_trend");
  assert.equal(parseAutonomousPick({ candidate_title: "Hi", idea_summary: "There" }).skip, true);
  const picked = parseAutonomousPick({
    candidate_title: "Pilsen mural walk",
    idea_summary: "See the new wall before the weekend crowd.",
    suggested_format: "Vertical Short Video",
    media_asset_ids: ["recAsset1234567890"],
  });
  assert.equal(picked.skip, false);
  assert.equal(picked.media_asset_ids[0], "recAsset1234567890");
  assert.deepEqual(autonomousPlanOverrides("Vertical Short Video").Instagram, "Reel");
  assert.deepEqual(autonomousPlanOverrides("Carousel").Instagram, "Carousel");
  assert.deepEqual(autonomousPlanExtras(), [
    { platform: "Instagram", output_type: "Story" },
    { platform: "Facebook", output_type: "Story" },
  ]);
  assert.equal(autonomousDefaultVoiceoverSeconds(30), 15);
  assert.equal(AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID, "recT49crfrhMVfZAQ");
  assert.equal(isAutonomousOrigin("origin=autonomous cited_trend=Pilsen"), true);
  assert.equal(isDerivedLibraryStillName("Pilsen-Murals-9__9x16__fill-crop-v2.jpg"), true);
  assert.equal(isDerivedLibraryStillName("Pilsen Murals 1.jpg"), false);
  assert.deepEqual(autonomousMasterMediaIds([
    { name: "Pilsen Murals 1.jpg", media_asset_record_id: "recfgniLGTG1tTviX" },
    { name: "Pilsen-Murals-9__9x16__fill-crop-v2.jpg", media_asset_record_id: "rec95rcrMXUBXJryK" },
  ]), ["recfgniLGTG1tTviX"]);
  assert.deepEqual(autonomousIncomingMediaIds([
    { name: "Pilsen Murals 1.jpg", media_asset_record_id: "recfgniLGTG1tTviX" },
  ], ["recfgniLGTG1tTviX", "recAsset1234567890"]), ["recAsset1234567890"]);
  assert.deepEqual(autonomousIncomingMediaIds(
    Array.from({ length: 12 }, (_, i) => ({ name: `still-${i}.jpg`, media_asset_record_id: `recAlready${String(i).padStart(10, "0")}` })),
    ["recAsset1234567890"]
  ), []);
});

test("JSON fences unwrap and last-run notes stay readable", () => {
  assert.equal(extractJsonObject("```json\n{\"skip\":true}\n```").skip, true);
  assert.equal(parseAutonomousLastRun("not-json").notes, "not-json");
  assert.equal(parseAutonomousLastRun('{"slot":"2026-08-30:am"}').slot, "2026-08-30:am");
});
