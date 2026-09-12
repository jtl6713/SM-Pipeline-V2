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
  AUTONOMOUS_IDEA_CREATED_FIELD,
  pickAutonomousMusicAssetId,
  resolveAutonomousNarrationVoice,
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
  autonomousUnusedLibraryAssets,
  autonomousPlaceSubjects,
  buildAutonomousPickerPrompt,
  autonomousPreferredSubject,
  collectAutonomousOccupiedFromIdeas,
  collectAutonomousTopicCollisions,
  mapAutonomousOccupiedRequest,
  mergeAutonomousOccupied,
} from "./autonomous-produce.mjs";

test("music pool picks only from profile subset and falls back", () => {
  assert.equal(pickAutonomousMusicAssetId([], AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID), AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID);
  assert.equal(pickAutonomousMusicAssetId(["not-a-rec"], AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID), AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID);
  const pool = ["recAAAAAAAAAAAAAA", "recBBBBBBBBBBBBBB"];
  assert.equal(pickAutonomousMusicAssetId(pool, AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID, () => 0), "recAAAAAAAAAAAAAA");
  assert.equal(pickAutonomousMusicAssetId(pool, AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID, () => 0.99), "recBBBBBBBBBBBBBB");
  assert.equal(
    pickAutonomousMusicAssetId(["recAAAAAAAAAAAAAA", "recAAAAAAAAAAAAAA", "bad"], AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID, () => 0.4),
    "recAAAAAAAAAAAAAA",
  );
});

test("narration voice uses profile default then Kate fallback", () => {
  assert.deepEqual(
    resolveAutonomousNarrationVoice(
      { default_narration_voice_id: "voice-1", default_narration_voice_name: "Nova" },
      { voice_id: "xVQH621DS3eyBYrseRt5", voice_name: "Kate" },
    ),
    { voice_id: "voice-1", voice_name: "Nova" },
  );
  assert.deepEqual(
    resolveAutonomousNarrationVoice(
      { Default_Narration_Voice_ID: "voice-2" },
      { voice_id: "xVQH621DS3eyBYrseRt5", voice_name: "Kate" },
    ),
    { voice_id: "voice-2", voice_name: "voice-2" },
  );
  assert.deepEqual(
    resolveAutonomousNarrationVoice({}, { voice_id: "xVQH621DS3eyBYrseRt5", voice_name: "Kate" }),
    { voice_id: "xVQH621DS3eyBYrseRt5", voice_name: "Kate" },
  );
});

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
  assert.equal(autonomousSlotAlreadyClaimed({
    slot: "2026-09-07:pm",
    status: "skipped",
    idea_id: "recdGHU0uHq3ktPje",
    skip_reason: "variants_still_preparing",
  }, "2026-09-07:pm"), true);
  assert.equal(autonomousSlotAlreadyClaimed({
    slot: "2026-09-07:pm",
    status: "skipped",
    skip_reason: "no_unused_library_stills",
  }, "2026-09-07:pm"), false);
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
  assert.equal(parseAutonomousPick({ skip: true, reason: "no_unused_library_stills" }).reason, "no_unused_library_stills");
  const libraryFirst = buildAutonomousPickerPrompt({
    profile: { name: "Chicago" },
    trends: { news: [{ title: "Heat wave" }] },
    assets: [{ media_asset_id: "recAsset1234567890", name: "Navy Pier.jpeg" }],
    occupiedIdeas: [{ title: "Pilsen Murals: Color on 18th Street", location: "18th Street, Pilsen" }],
  });
  assert.equal(autonomousPreferredSubject("  Chicago Theatre  "), "Chicago Theatre");
  const pinned = buildAutonomousPickerPrompt({
    profile: { name: "Chicago" },
    trends: {},
    assets: [{ media_asset_id: "recTheatre12345678", name: "Chicago Theatre 7.jpeg" }],
    preferredSubject: "Chicago Theatre",
  });
  assert.match(pinned, /OPERATOR PIN/);
  assert.match(pinned, /Chicago Theatre/);
  assert.match(libraryFirst, /Start from the library stills/);
  assert.match(libraryFirst, /no_unused_library_stills/);
  assert.match(libraryFirst, /Another angle of an occupied place/);
  assert.equal(libraryFirst.includes("no_asset_backed_trend"), false);
  assert.deepEqual(autonomousUnusedLibraryAssets([
    { id: "recAsset1234567890" },
    { id: "recfgniLGTG1tTviX" },
  ], [{ media_asset_ids: ["recfgniLGTG1tTviX"] }]).map((row) => row.id), ["recAsset1234567890"]);
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
  const zooOccupied = [{
    source: "recent",
    title: "Lincoln Park Zoo: Quick Stroll",
    location: "Lincoln Park Zoo",
    media_asset_ids: ["recZooStill0000001"],
  }];
  const anotherZooAngle = autonomousIdeaConflictsOccupied({
    candidate_title: "Free Zoo Escape",
    idea_summary: "A quick urban nature break near the lake.",
    primary_location: "Lincoln Park Zoo",
    neighborhood_or_area: "Lincoln Park",
    media_asset_ids: ["recZooStill0000002"],
  }, zooOccupied);
  assert.equal(anotherZooAngle.conflict, true);
  assert.equal(anotherZooAngle.reason, "similar_to_recent");
  assert.deepEqual(autonomousPlaceSubjects("Free Zoo Escape Lincoln Park Zoo"), [
    "lincoln park zoo",
    "lincoln park",
  ]);
  assert.deepEqual(autonomousUnusedLibraryAssets([
    { id: "recZooStill0000002", name: "Zoo rhino.jpeg", location: "Lincoln Park Zoo" },
    { id: "recPierAsset000001", name: "Navy Pier.jpeg", location: "Navy Pier" },
  ], zooOccupied).map((row) => row.id), ["recPierAsset000001"]);
  assert.equal(AUTONOMOUS_IDEA_CREATED_FIELD, "Create_Date");
  const occupiedFromAirtable = collectAutonomousOccupiedFromIdeas([
    {
      createdTime: "2026-09-07T21:05:56.000Z",
      fields: {
        Candidate_Title: "Free Zoo Escape",
        Candidate_Status: "Approved",
        Primary_Location: "Lincoln Park Zoo",
        Neighborhood_or_Area: "Lincoln Park",
      },
    },
    {
      createdTime: "2026-09-07T11:36:41.000Z",
      fields: {
        Candidate_Title: "Lincoln Park Zoo - Worth the trip?",
        Candidate_Status: "Promoted",
        Primary_Location: "Lincoln Park Zoo",
      },
    },
    {
      createdTime: "2026-09-07T21:00:00.000Z",
      fields: {
        Candidate_Title: "Rejected zoo extra",
        Candidate_Status: "Rejected",
        Primary_Location: "Lincoln Park Zoo",
      },
    },
  ], Date.parse("2026-09-07T22:00:00.000Z"));
  assert.deepEqual(occupiedFromAirtable.map((row) => row.title), [
    "Free Zoo Escape",
    "Lincoln Park Zoo - Worth the trip?",
  ]);
  const merged = mergeAutonomousOccupied([
    occupiedFromAirtable,
    [mapAutonomousOccupiedRequest({
      fields: {
        Request_Status: "Promoted",
        Primary_Location: "Lincoln Park Zoo",
        Production_Notes: "origin=autonomous cited_trend=library",
        Production_Request_ID: "PR-20260907213117-QP78NY",
      },
    })],
  ]);
  assert.equal(merged.some((row) => row.location === "Lincoln Park Zoo"), true);
  const collisions = collectAutonomousTopicCollisions([
    {
      id: "recEMuJACqAnqsRPu",
      title: "Lincoln Park Zoo - Worth the trip?",
      location: "Lincoln Park Zoo",
      notes: "manual library stills",
      createdTime: "2026-09-07T11:36:41.000Z",
    },
    {
      id: "recdGHU0uHq3ktPje",
      title: "Free Zoo Escape",
      location: "Lincoln Park Zoo",
      notes: "origin=autonomous cited_trend=library",
      createdTime: "2026-09-07T21:05:56.000Z",
    },
    {
      id: "recPy3fzh3rdnsVta",
      title: "Lincoln Park Zoo Stroll: Birds to Rhinos",
      location: "Lincoln Park Zoo",
      notes: "origin=autonomous",
      createdTime: "2026-09-07T21:31:00.000Z",
    },
    {
      id: "recNavyPierOnly",
      title: "Navy Pier sunset sail",
      location: "Navy Pier",
      notes: "origin=autonomous",
      createdTime: "2026-09-07T21:40:00.000Z",
    },
  ]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].place, "lincoln park zoo");
  assert.equal(collisions[0].keep.id, "recEMuJACqAnqsRPu");
  assert.deepEqual(collisions[0].extras.map((row) => row.id), [
    "recdGHU0uHq3ktPje",
    "recPy3fzh3rdnsVta",
  ]);
});

test("JSON fences unwrap and last-run notes stay readable", () => {
  assert.equal(extractJsonObject("```json\n{\"skip\":true}\n```").skip, true);
  assert.equal(parseAutonomousLastRun("not-json").notes, "not-json");
  assert.equal(parseAutonomousLastRun('{"slot":"2026-08-30:am"}').slot, "2026-08-30:am");
});
