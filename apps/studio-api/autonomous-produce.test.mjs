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
  autonomousDefaultVoiceoverTailSeconds,
  AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID,
  AUTONOMOUS_DEFAULT_VOICEOVER_TAIL_SECONDS,
  autonomousRunIsBusy,
  autonomousSlot,
  autonomousSlotAlreadyClaimed,
  isAutonomousOrigin,
  autonomousRequestNeedsContinue,
  extractJsonObject,
  mapYoutubeSearchItems,
  observationIsRecent,
  parseAutonomousLastRun,
  parseAutonomousPick,
  parseAutonomousNotedMediaIds,
  parseRssItemTitles,
  summarizeObservations,
  autonomousIdeaConflictsOccupied,
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
  assert.equal(autonomousSlotAlreadyClaimed({ slot: "2026-08-30:am", status: "awaiting_i4" }, "2026-08-30:am"), true);
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
  assert.equal(AUTONOMOUS_DEFAULT_VOICEOVER_TAIL_SECONDS, 2);
  assert.equal(autonomousDefaultVoiceoverTailSeconds(), 2);
  assert.equal(autonomousDefaultVoiceoverTailSeconds(30 - 15), 2);
  assert.equal(autonomousDefaultVoiceoverTailSeconds(0), 0);
  assert.equal(AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID, "recT49crfrhMVfZAQ");
  assert.equal(isAutonomousOrigin("origin=autonomous cited_trend=Pilsen"), true);
  assert.equal(autonomousRequestNeedsContinue("Submitted", "origin=autonomous cited_trend=Heat"), true);
  assert.equal(autonomousRequestNeedsContinue("Draft", "origin=autonomous"), true);
  assert.equal(autonomousRequestNeedsContinue("Submitted", "manual studio request"), false);
  assert.equal(autonomousRequestNeedsContinue("Promoted", "origin=autonomous"), false);
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

test("occupied ideas block the same stills or the same place and subject", () => {
  assert.deepEqual(
    parseAutonomousNotedMediaIds("origin=autonomous\nmedia_asset_ids=recfgniLGTG1tTviX,rec1nTwk171jxI4sA\n"),
    ["recfgniLGTG1tTviX", "rec1nTwk171jxI4sA"]
  );
  const occupied = [{
    source: "in_flight",
    title: "Pilsen Murals: Color on 18th Street",
    location: "18th Street, Pilsen",
    media_asset_ids: ["recfgniLGTG1tTviX", "rec1nTwk171jxI4sA", "recCKj0QBKLwnqlpL"],
  }];
  const sameStills = autonomousIdeaConflictsOccupied({
    candidate_title: "Pilsen’s 18th Street Murals, Right Now",
    idea_summary: "Walk the walls before the weekend crowd.",
    primary_location: "18th Street, Pilsen",
    media_asset_ids: ["recfgniLGTG1tTviX", "rec1nTwk171jxI4sA", "recVEPxw7nJTcXvbH"],
  }, occupied);
  assert.equal(sameStills.conflict, true);
  assert.equal(sameStills.reason, "similar_to_in_flight");
  const different = autonomousIdeaConflictsOccupied({
    candidate_title: "Navy Pier sunset sail",
    idea_summary: "Catch the lake light after work.",
    primary_location: "Navy Pier",
    media_asset_ids: ["recPierAsset000001"],
  }, occupied);
  assert.equal(different.conflict, false);
});

test("JSON fences unwrap and last-run notes stay readable", () => {
  assert.equal(extractJsonObject("```json\n{\"skip\":true}\n```").skip, true);
  assert.equal(parseAutonomousLastRun("not-json").notes, "not-json");
  assert.equal(parseAutonomousLastRun('{"slot":"2026-08-30:am"}').slot, "2026-08-30:am");
});
