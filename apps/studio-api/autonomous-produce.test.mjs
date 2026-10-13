import assert from "node:assert/strict";
import test from "node:test";

import {
  autonomousInWindow,
  autonomousIncomingMediaIds,
  isDerivedLibraryStillName,
  autonomousMasterMediaIds,
  autonomousPlanOverrides,
  autonomousCanonicalContentType,
  autonomousPlanExtras,
  autonomousDefaultVoiceoverSeconds,
  autonomousDefaultVoiceoverTailSeconds,
  AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID,
  AUTONOMOUS_DEFAULT_VOICEOVER_TAIL_SECONDS,
  AUTONOMOUS_IDEA_CREATED_FIELD,
  pickAutonomousMusicAssetId,
  pickNarrationVoiceFromProfiles,
  resolveAutonomousNarrationVoice,
  autonomousRunIsBusy,
  autonomousSlot,
  autonomousSlotAlreadyClaimed,
  isAutonomousOrigin,
  autonomousRequestNeedsContinue,
  firstAutonomousResumeDraft,
  dailyIdeaProduceHasStarted,
  dailyIdeasReadyToProduce,
  stampAutonomousOrigin,
  isAutonomousResumeDeferred,
  stampAutonomousResumeDeferred,
  autonomousWaitingIsStale,
  autonomousPreparingIsStale,
  extractJsonObject,
  mapYoutubeSearchItems,
  observationIsRecent,
  parseAutonomousLastRun,
  parseAutonomousPick,
  parseAutonomousNotedMediaIds,
  parseRssItemTitles,
  summarizeObservations,
  autonomousIdeaConflictsOccupied,
  AUTONOMOUS_RELATED_STILL_MAX,
  AUTONOMOUS_RELATED_STILL_MIN,
  autonomousUnusedLibraryAssets,
  autonomousPlaceSubjects,
  buildAutonomousPickerPrompt,
  completeRelatedStillPick,
  parseAutonomousLinkedMediaIds,
  autonomousProfileHarvestOrder,
  pickAutonomousEnabledProfile,
  pickRelatedUnusedStillCluster,
  summarizeUnusedLibraryOverview,
  autonomousClusterConflictsOccupied,
  autonomousPreferredSubject,
  collectAutonomousOccupiedFromIdeas,
  collectAutonomousTopicCollisions,
  mapAutonomousOccupiedRequest,
  mergeAutonomousOccupied,
  filterAutonomousOccupiedForProfile,
  autonomousPickUsesFreshMedia,
  autonomousYoutubeQueriesForTheme,
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
    resolveAutonomousNarrationVoice(
      {
        default_narration_voice_id: "6F5Zhi321D3Oq7v1oNT4",
        default_narration_voice_name: "Hank - Deep and Engaging Narrator",
      },
      { voice_id: "xVQH621DS3eyBYrseRt5", voice_name: "Kate" },
    ),
    {
      voice_id: "6F5Zhi321D3Oq7v1oNT4",
      voice_name: "Hank - Deep and Engaging Narrator",
    },
  );
  assert.deepEqual(
    resolveAutonomousNarrationVoice({}, { voice_id: "xVQH621DS3eyBYrseRt5", voice_name: "Kate" }),
    { voice_id: "xVQH621DS3eyBYrseRt5", voice_name: "Kate" },
  );
});

test("idea profile without a voice yields to the working profile default", () => {
  assert.deepEqual(
    pickNarrationVoiceFromProfiles(
      [
        { default_narration_voice_id: "", default_narration_voice_name: "" },
        {
          default_narration_voice_id: "6F5Zhi321D3Oq7v1oNT4",
          default_narration_voice_name: "Hank - Deep and Engaging Narrator",
        },
      ],
      { voice_id: "xVQH621DS3eyBYrseRt5", voice_name: "Kate" },
    ),
    {
      voice_id: "6F5Zhi321D3Oq7v1oNT4",
      voice_name: "Hank - Deep and Engaging Narrator",
    },
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
  assert.match(libraryFirst, /Start from unused library stills/);
  assert.match(libraryFirst, /5 to 10/);
  assert.match(libraryFirst, /post_caption/);
  assert.match(libraryFirst, /no_unused_library_stills/);
  assert.match(libraryFirst, /Fresh unused stills at a familiar landmark are OK/);
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
    post_caption: "Pilsen walls are loud this week. Walk 18th before the weekend crowd.",
    media_asset_ids: ["recAsset1234567890"],
  });
  assert.equal(picked.skip, false);
  assert.equal(picked.media_asset_ids[0], "recAsset1234567890");
  assert.match(picked.post_caption, /Pilsen walls/);
  assert.deepEqual(autonomousPlanOverrides("Vertical Short Video"), {
    Instagram: "Reel",
    Facebook: "Reel",
    TikTok: "Video Draft",
    YouTube: "Short",
  });
  assert.deepEqual(autonomousPlanOverrides("Carousel"), autonomousPlanOverrides("Vertical Short Video"));
  assert.equal(autonomousCanonicalContentType("Carousel"), "Vertical Short Video");
  assert.deepEqual(autonomousPlanExtras(), [
    { platform: "Instagram", output_type: "Story" },
    { platform: "Facebook", output_type: "Story" },
  ]);
  assert.equal(autonomousDefaultVoiceoverSeconds(30), 15);
  assert.equal(autonomousDefaultVoiceoverSeconds(6), 4);
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
  const miami = "recpNlNn6U6eq0M9r";
  const nyc = "recgtK8Z7eNADNtVy";
  const la = "recF7UAn0LkMZZrWZ";
  const enabled = [miami, nyc];
  assert.equal(firstAutonomousResumeDraft([
    { id: "la", notes: "origin=autonomous", profile_id: la },
    { id: "miami", notes: "origin=autonomous", profile_id: miami },
  ], enabled)?.id, "miami");
  assert.equal(firstAutonomousResumeDraft([
    { id: "prepare", notes: "origin=prepare-to-review", profile_id: la },
    { id: "miami", notes: "origin=autonomous", profile_id: miami },
  ], enabled)?.id, "prepare");
  assert.equal(firstAutonomousResumeDraft([
    { id: "la", notes: "origin=autonomous", profile_id: la },
    { id: "chicago", notes: "origin=autonomous", profile_id: "recChicago" },
  ], enabled), null);
  assert.equal(firstAutonomousResumeDraft([
    {
      id: "stuck-nyc",
      notes: "origin=autonomous\nautonomous_resume=deferred reason=preparing_stale",
      profile_id: nyc,
    },
    { id: "miami", notes: "origin=autonomous", profile_id: miami },
  ], enabled)?.id, "miami");
  assert.equal(firstAutonomousResumeDraft([
    {
      id: "preparing-nyc",
      notes: "origin=autonomous",
      profile_id: nyc,
      variant_status: "Preparing",
      variant_updated_at: "2026-10-13T12:00:00.000Z",
    },
    { id: "miami", notes: "origin=autonomous", profile_id: miami },
  ], enabled, Date.parse("2026-10-13T12:20:00.000Z"))?.id, "miami");
  assert.equal(isAutonomousResumeDeferred("origin=autonomous\nautonomous_resume=deferred reason=x"), true);
  assert.equal(isAutonomousResumeDeferred("origin=autonomous\nqueue=deferred\nWas waiting"), true);
  assert.equal(isAutonomousResumeDeferred("origin=autonomous"), false);
  assert.match(stampAutonomousResumeDeferred("origin=autonomous", "preparing_stale"), /autonomous_resume=deferred reason=preparing_stale/);
  assert.equal(autonomousWaitingIsStale({
    status: "waiting_variants",
    at: "2026-10-13T12:00:00.000Z",
  }, Date.parse("2026-10-13T12:15:00.000Z")), true);
  assert.equal(autonomousWaitingIsStale({
    status: "waiting_variants",
    at: "2026-10-13T12:10:00.000Z",
  }, Date.parse("2026-10-13T12:15:00.000Z")), false);
  assert.equal(autonomousWaitingIsStale({
    status: "resuming",
    at: "2026-10-13T16:34:57.233Z",
  }, Date.parse("2026-10-13T18:35:00.000Z")), true);
  assert.equal(autonomousWaitingIsStale({
    status: "resuming",
    at: "2026-10-13T18:34:00.000Z",
  }, Date.parse("2026-10-13T18:35:00.000Z")), false);
  assert.equal(autonomousPreparingIsStale("Preparing", "2026-10-13T12:00:00.000Z", Date.parse("2026-10-13T12:13:00.000Z")), true);
  assert.equal(autonomousPreparingIsStale("Ready", "2026-10-13T12:00:00.000Z", Date.parse("2026-10-13T12:20:00.000Z")), false);
  assert.equal(dailyIdeaProduceHasStarted({ hour: 1 }), false);
  assert.equal(dailyIdeaProduceHasStarted({ hour: 8 }), true);
  assert.equal(dailyIdeaProduceHasStarted({ hour: 1 }, { force: true }), true);
  const morning = dailyIdeasReadyToProduce([
    { id: "wait", profile_id: miami, photo_wait_status: "Waiting" },
    { id: "la-ready", profile_id: la, photo_wait_status: "Ready" },
    { id: "hold", profile_id: nyc, photo_wait_status: "Ready", candidate_status: "On Hold" },
    { id: "queued", profile_id: miami, photo_wait_status: "Ready", already_autonomous: true },
    { id: "miami-ready", profile_id: miami, photo_wait_status: "Ready", candidate_status: "Generated" },
    { id: "nyc-ready", profile_id: nyc, photo_wait_status: "Ready", candidate_status: "Sent for Review" },
  ], enabled);
  assert.deepEqual(morning.map((row) => row.id), ["miami-ready", "nyc-ready"]);
  assert.equal(stampAutonomousOrigin("Keep the river shots"), "origin=autonomous\nKeep the river shots");
  assert.equal(stampAutonomousOrigin("origin=autonomous\nKeep"), "origin=autonomous\nKeep");
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
  assert.equal(anotherZooAngle.conflict, false);
  assert.deepEqual(autonomousPlaceSubjects("Free Zoo Escape Lincoln Park Zoo"), [
    "lincoln park zoo",
    "lincoln park",
  ]);
  assert.deepEqual(autonomousUnusedLibraryAssets([
    { id: "recZooStill0000002", name: "Zoo rhino.jpeg", location: "Lincoln Park Zoo" },
    { id: "recPierAsset000001", name: "Navy Pier.jpeg", location: "Navy Pier" },
  ], zooOccupied).map((row) => row.id), ["recZooStill0000002", "recPierAsset000001"]);
  assert.equal(autonomousClusterConflictsOccupied({
    label: "Lincoln Park Zoo",
    assets: [{ id: "recZooStill0000002", location: "Lincoln Park Zoo" }],
  }, zooOccupied), false);
  assert.equal(autonomousClusterConflictsOccupied({
    label: "Lincoln Park Zoo",
    assets: [{ id: "recZooStill0000001", location: "Lincoln Park Zoo" }],
  }, zooOccupied), true);
  assert.deepEqual(pickRelatedUnusedStillCluster([
    { id: "recZooStill0000002", location: "Lincoln Park Zoo" },
    { id: "recZooStill0000003", location: "Lincoln Park Zoo" },
    { id: "recZooStill0000004", location: "Lincoln Park Zoo" },
    { id: "recZooStill0000005", location: "Lincoln Park Zoo" },
    { id: "recZooStill0000006", location: "Lincoln Park Zoo" },
    { id: "recPierAsset000001", location: "Navy Pier" },
    { id: "recPierAsset000002", location: "Navy Pier" },
    { id: "recPierAsset000003", location: "Navy Pier" },
    { id: "recPierAsset000004", location: "Navy Pier" },
    { id: "recPierAsset000005", location: "Navy Pier" },
  ], { occupied: zooOccupied })?.key, "place:lincoln park zoo");
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

test("on-demand harvest uses the working profile, not the first enabled city", () => {
  const nyc = { id: "recgtK8Z7eNADNtVy", name: "NYC - New York City" };
  const chicago = { id: "recT2rbKX3MF7cVFU", name: "ChicagoShining - Chicago" };
  assert.equal(pickAutonomousEnabledProfile([chicago, nyc], "recgtK8Z7eNADNtVy").name, "NYC - New York City");
  assert.equal(pickAutonomousEnabledProfile([chicago, nyc], "").name, "ChicagoShining - Chicago");
  assert.equal(
    filterAutonomousOccupiedForProfile([
      { title: "Chicago zoo", content_profile_id: "recT2rbKX3MF7cVFU" },
      { title: "NYC pier", content_profile_id: "recgtK8Z7eNADNtVy" },
      { title: "No profile", content_profile_id: null },
    ], "recgtK8Z7eNADNtVy").length,
    2,
  );
  assert.equal(autonomousPickUsesFreshMedia(
    { media_asset_ids: ["recNew1", "recNew2"] },
    [{ media_asset_ids: ["recOld1"], title: "Lower Manhattan" }],
  ), true);
  assert.equal(autonomousYoutubeQueriesForTheme("nyc")[0], "New York City");
  assert.deepEqual(
    autonomousProfileHarvestOrder([chicago, nyc], "recgtK8Z7eNADNtVy").map((row) => row.name),
    ["NYC - New York City", "ChicagoShining - Chicago"],
  );
  const parkStills = [
    { id: "recPark00000000001", location: "Central Park, Manhattan, New York City" },
    { id: "recPark00000000002", location: "Central Park, Columbus Circle, Manhattan, New York City" },
    { id: "recPark00000000003", location: "Central Park, Upper West Side, Manhattan, New York City" },
    { id: "recPark00000000004", location: "Central Park, Manhattan, New York City" },
    { id: "recPark00000000005", location: "Central Park, Manhattan, New York City" },
  ];
  assert.equal(autonomousPlaceSubjects("Central Park, Manhattan, New York City")[0], "central park");
  const occupiedManhattan = [{
    source: "in_flight",
    title: "Lower Manhattan: Where New York Hits Different",
    location: "Lower Manhattan",
    media_asset_ids: ["recLowerManhattan01"],
  }];
  assert.deepEqual(
    autonomousUnusedLibraryAssets(parkStills, occupiedManhattan).map((row) => row.id),
    parkStills.map((row) => row.id),
  );
  const cluster = pickRelatedUnusedStillCluster(parkStills, { occupied: occupiedManhattan });
  assert.equal(cluster?.key, "place:central park");
  assert.equal(cluster?.assets.length, 5);
});

test("unused stills cluster into a related 5-10 set", () => {
  assert.equal(AUTONOMOUS_RELATED_STILL_MIN, 5);
  assert.equal(AUTONOMOUS_RELATED_STILL_MAX, 10);
  assert.deepEqual(
    parseAutonomousLinkedMediaIds(["recfgniLGTG1tTviX", { id: "rec1nTwk171jxI4sA" }]),
    ["recfgniLGTG1tTviX", "rec1nTwk171jxI4sA"],
  );
  const unused = [
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `recPilsen${String(index).padStart(10, "0")}`,
      name: `Pilsen mural ${index + 1}.jpeg`,
      location: "Pilsen",
      topic: "Street art",
      intake_date: "2026-09-10",
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `recRiver${String(index).padStart(11, "0")}`,
      name: `Riverwalk ${index + 1}.jpeg`,
      location: "Chicago River",
      intake_date: "2026-09-11",
    })),
  ];
  const overview = summarizeUnusedLibraryOverview(unused);
  assert.equal(overview.unused_count, 10);
  assert.equal(overview.clusters[0].label, "Pilsen");
  assert.equal(overview.clusters[0].count, 7);
  const cluster = pickRelatedUnusedStillCluster(unused);
  assert.equal(cluster.label, "Pilsen");
  assert.equal(cluster.assets.length, 7);
  assert.equal(pickRelatedUnusedStillCluster(unused.slice(7)), null);
  assert.deepEqual(
    completeRelatedStillPick(["recPilsen0000000000"], cluster.assets).length,
    7,
  );
  const occupiedRequest = mapAutonomousOccupiedRequest({
    fields: {
      Request_Status: "Promoted",
      Primary_Location: "Pilsen",
      Production_Request_ID: "PR-USED",
      Studio_Master_Media_Assets: ["recPilsen0000000000"],
    },
  });
  assert.deepEqual(occupiedRequest.media_asset_ids, ["recPilsen0000000000"]);
});

test("JSON fences unwrap and last-run notes stay readable", () => {
  assert.equal(extractJsonObject("```json\n{\"skip\":true}\n```").skip, true);
  assert.equal(parseAutonomousLastRun("not-json").notes, "not-json");
  assert.equal(parseAutonomousLastRun('{"slot":"2026-08-30:am"}').slot, "2026-08-30:am");
});

test("Worker stamps photo-ready ideas and always adopts after 8am CT", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  assert.match(worker, /version: "0\.10\.580-factory-promoted-done-exclude"/);
  assert.match(worker, /async function stampPhotoReadyIdeaForAutonomousProduce/);
  assert.match(worker, /stampPhotoReadyIdeaForAutonomousProduce\(env, ideaReady, requestRecord\)/);
  assert.match(worker, /Always stamp photo-ready daily ideas after 8am CT/);
  assert.match(worker, /skip_stuck_waiting_for_next_draft/);
  assert.match(worker, /parkAutonomousResumeDraft/);
  assert.match(worker, /autonomousWaitingIsStale/);
  assert.doesNotMatch(
    worker.slice(
      worker.indexOf("if (dailyIdeaProduceHasStarted(chicago"),
      worker.indexOf("const pendingDrafts = await listAutonomousDraftRequests(env);"),
    ),
    /if \(!queued\)/,
  );
});

