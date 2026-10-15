import { createProfileOnboarding } from "./profile-onboarding.mjs";
import {
  studioReadSource,
  studioSupabaseConfigured,
  listSupabasePipelineOutputs,
  listSupabaseScheduleGrid,
  syncAllProfilesPipelineToSupabase,
  syncProfilePipelineToSupabase,
  syncAirtableOutputRowToSupabase,
  STUDIO_SUPABASE_PIPELINE_READ_ROUTES,
} from "./supabase-pipeline-reads.mjs";
import {
  DESK_SETTING_NAME,
  DESK_CAPS_SETTING_NAME,
  DESK_MODES,
  PUBLIC_HEALTH_TARGETS,
  buildDeskInventoryPayload,
  classifyAutonomousRequest,
  classifyAutonomousRevisionLock,
  classifyAutonomousRfrGate,
  classifyAutonomousTopicCollision,
  classifyAzNotAutoFinished,
  classifyCropRow,
  classifyHealthTarget,
  classifyIntakeResidue,
  classifyNativeCover,
  classifyNativePhotoReviewStrand,
  classifyNativePhotoApproveIncomplete,
  classifyAwaitingApprovalStaleRfr,
  classifyPhantomRerender,
  classifyPreparingGap,
  classifyProduceJob,
  classifyPromotedNotRfr,
  classifyPublishDispatch,
  classifyPublishFailed,
  classifyIgCarouselTooManyChildren,
  classifyIgCarouselChildVerificationRace,
  classifyIgCarouselChildPollFailure,
  classifyIgCarouselRateLimited,
  classifyTikTokAuthSignature,
  classifyRenderRow,
  deskFailedNeedsHeal,
  deskRecoverableEscalatedError,
  isDriveMusic404Error,
  isProduceStamp422Error,
  deskTransientPublishError,
  deskTransientRenderError,
  deskWorkIdentity,
  classifyRfrLockedMissingDeliverable,
  classifyTesterCatalogAssert,
  classifyTesterNightly,
  classifyYoutubeCoverQuota,
  classifyYoutubePrivateSourceFail,
  parseDeskCaps,
  parseDeskMode,
} from "./desk-inventory.mjs";
import {
  allocateLibraryBatchNames,
  combineAirtableFormulas,
  firstLinkedRecordId,
  LIBRARY_ADDED_AT_FIELD,
  LIBRARY_CROSS_SCOPE_SETTING,
  libraryAddedDateFilterFormula,
  libraryBatchNameFilterFormula,
  libraryCrossScopeEnabled,
  libraryDriveFilename,
  ideaLibraryExcludeDerivedStillFormula,
  libraryClassifyPendingFormula,
  libraryRecordIdsFilterFormula,
  parseLibraryRecordIdsParam,
  mediaAssetIsHeic,
  mediaAssetProfileScopeFormula,
  normalizeLibraryBatchBase,
  parseLibraryDateParam,
  libraryAssetAddedAt,
  resolveAssetManagerCrossScopeFlag,
  resolveLibraryCrossScopeFlag,
  resolveLibraryListSort,
  resolveLibraryUploadProfileId,
  sanitizeLibraryAssetName,
  stripLibraryAssetExtension,
} from "./asset-library.mjs";
import {
  POST_PUBLISH_RELEASE_BATCH_LIMIT,
  POST_PUBLISH_RELEASE_COOLDOWN_MS,
  POST_PUBLISH_RELEASE_DRY_RUN_SETTING,
  POST_PUBLISH_RELEASE_LIST_FIELDS,
  DESK_INVENTORY_OUTPUT_FIELDS,
  DESK_INVENTORY_REQUEST_FIELDS,
  collectPublishedR2CleanupKeys,
  contentGroupReadyForMediaRelease,
  contentItemDerivedDriveIds,
  contentItemIdFromOutput,
  dryRunFlagEnabled,
  evaluatePublishedOutputRelease,
  isFillCropAssetName,
  isFillCropPreviewKey,
  postPublishReleaseCandidateFormula,
  publishedReleaseStampFields,
} from "./post-publish-release.mjs";
import { attachCompressionJobs } from "./operations-oversized.mjs";
import {
  YOUTUBE_PRIVATE_SOURCE_HEAL_INNER,
  mpuPartRanges,
  shouldUseMultipart,
  youtubePublishAssetKey,
} from "./youtube-public-mp4.mjs";
import { item4UrlIsRenderServerVideo } from "./output-preview-source.mjs";
import {
  YOUTUBE_MANUAL_LIVE_VIDEO_HEAL_FORMULA,
  YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA,
  isYouTubePostUrl,
  manualPublishRequiredFields,
  youtubeCompleteEligibility,
  youtubeLiveVideoIdFromFields,
  youtubeCoverQuotaParkFields,
  youtubeLiveQuotaOnly,
  youtubeManualActionRequired,
  youtubeManualCloseFields,
  youtubeManualLiveVideoHealCandidate,
  youtubeOembedUrl,
  youtubeWatchUrl,
  staleManualFlagsOnPublishedFields,
} from "./youtube-manual-publish.mjs";
import {
  AZ_EXPECTED_OUTPUT_COUNT,
  FINISHED_DESTINATION_KEYS,
  FINISHED_HORIZONTAL_KEYS,
  FINISHED_STORY_TEASER_SECONDS,
  azExpectedOutputCount,
  azOutputLockHeld,
  azOutputLockIsFresh,
  azOutputLockToken,
  canonicalFinishedDestinationKey,
  capFinishedPlanItems,
  finishedCompanionStoryFields,
  finishedStoryTeaserClipFlags,
  isHorizontalFinishedAspect,
  mergeAzOutputLock,
  pickDuplicateOutputKeepers,
  pickPlatformOutputSeedKeeper,
  shouldCreateFinishedOutput,
  uniquePlanItems,
} from "./az-finished-video.mjs";
import {
  preferAuthoritativeProductionRequest,
  promotedContentOwner,
  siblingProductionRequestsToCancel,
} from "./promotion-owner.mjs";
import {
  AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID,
  AUTONOMOUS_IDEA_CREATED_FIELD,
  AUTONOMOUS_CITY_CREATE_ATTEMPTS,
  AUTONOMOUS_CITY_CREATE_MS,
  AUTONOMOUS_IDEAS_PER_HOUR,
  AUTONOMOUS_LIBRARY_SCAN_CAP,
  AUTONOMOUS_HOUR_ASSET_DRAIN,
  AUTONOMOUS_OPEN_IDEAS_CAP,
  AUTONOMOUS_RELATED_STILL_MIN,
  AUTONOMOUS_NEWS_FEEDS,
  AUTONOMOUS_SCHEDULED_SKIP_ABOVE,
  AUTONOMOUS_SCHEDULED_TARGET,
  AUTONOMOUS_STANDARD_PLATFORMS,
  AUTONOMOUS_YOUTUBE_QUERIES,
  autonomousYoutubeQueriesForTheme,
  filterAutonomousOccupiedForProfile,
  autonomousDefaultVoiceoverSeconds,
  autonomousIdeaConflictsOccupied,
  autonomousIncomingMediaIds,
  autonomousMasterMediaIds,
  autonomousCanonicalContentType,
  autonomousPlanExtras,
  autonomousPlanOverrides,
  autonomousPreferredSubject,
  autonomousProfilesNeedingRefill,
  autonomousProfileHourOpen,
  autonomousRefillProfilesStillOpen,
  autonomousRefillScoresFromOverview,
  autonomousAtTopOfHour,
  autonomousClockForCron,
  autonomousOpenIdeasAtCap,
  autonomousOpenIdeasCreateBudget,
  autonomousOpenIdeasRoom,
  autonomousRefillSlot,
  mergeAutonomousHourProgress,
  pickAutonomousEnabledProfile,
  pickAutonomousRefillProfile,
  autonomousProfileHarvestOrder,
  autonomousRequestNeedsContinue,
  firstAutonomousResumeDraft,
  listAutonomousResumeDrafts,
  productionNotesRevisionOpen,
  autonomousErrorIsFactoryRevision,
  autonomousRevisionLockReset,
  dailyIdeaProduceHasStarted,
  dailyIdeasReadyToProduce,
  stampAutonomousOrigin,
  isAutonomousResumeDeferred,
  stampAutonomousResumeDeferred,
  clearAutonomousResumeDeferred,
  shouldClearAutonomousResumeDeferred,
  photoReadySlaOverdue,
  autonomousProduceJobInFlight,
  autonomousWaitingIsStale,
  autonomousPreparingIsStale,
  autonomousRunIsBusy,
  autonomousSlot,
  autonomousSlotAlreadyClaimed,
  buildAutonomousPickerPrompt,
  completeRelatedStillPick,
  pickRelatedUnusedStillCluster,
  planAutonomousHourIdeas,
  summarizeUnusedLibraryOverview,
  collectAutonomousOccupiedFromIdeas,
  collectAutonomousTopicCollisions,
  isAutonomousOrigin,
  mapAutonomousOccupiedRequest,
  mapYoutubeSearchItems,
  mergeAutonomousOccupied,
  parseAutonomousLastRun,
  pickAutonomousMusicAssetId,
  pickNarrationVoiceFromProfiles,
  resolveAutonomousNarrationVoice,
  parseAutonomousPick,
  parseRssItemTitles,
  summarizeObservations,
  youtubePublishedAfterIso,
} from "./autonomous-produce.mjs";
import { ideaAutoListenContentType, ideaManagePhotoPauseActive, ideaProductionConfigFields, mergeIdeaProductionNotes, mergeProductionRequestNotes, parseIdeaMachineNotes, parseIdeaNotedMediaIds, productionNotesForPromotionHandoff, productionPhotoWaitAutoOff, productionPhotoWaitRejectedIds, shouldAttachPhotoWaitAssets, withIdeaManagePhotoPause, withoutIdeaManagePhotoPause, withProductionPhotoWaitManual } from "./idea-photo-wait.mjs";
import {
  STUDIO_PUBLISH_RECONCILE_SCHEDULE_FORMULA,
  STUDIO_TIKTOK_INBOX_DUE_FORMULA,
  studioTikTokArmedDraftStatus,
  studioTikTokInboxIsDue,
} from "./tiktok-inbox-schedule.mjs";
import {
  tiktokResendEligibility,
  tiktokResendRearmFields,
  TIKTOK_RESEND_ERRORS,
} from "./tiktok-resend.mjs";
import {
  APPROVE_ALL_BATCH_SIZE,
  APPROVE_ALL_JOBS_SETTING,
  APPROVE_ALL_MAX_SLICES_PER_INVOKE,
  approveAllJobCounts,
  approveAllProgressMessage,
  buildApproveAllJob,
  emptyApproveAllJobStore,
  finalizeApproveAllJobStatus,
  newApproveAllJobId,
  nextPendingApproveAllItems,
  parseApproveAllJobStore,
  pruneApproveAllJobStore,
  resetFailedApproveAllItems,
  summarizeApproveAllJob,
} from "./approve-all-batch.mjs";
import {
  RENDER_STATUS_READY,
  RENDER_STATUS_WAITING_QUEUE,
  assignRenderQueuePositions,
  isActiveRemotionHold,
  isRealRemotionRetryFailure,
  isRenderQueueCandidateStatus,
  isRenderQueueWaitingStatus,
  remotionHealthLooksBusy,
  sortRenderQueueCandidates,
} from "./render-queue.mjs";
import {
  OPS_QUEUE_CONTROLS_KEY,
  OPS_QUEUE_CONTENT_FIELDS,
  OPS_QUEUE_OUTPUT_FIELDS,
  OPS_QUEUE_OUTPUT_FORMULA,
  OPS_QUEUE_RENDER_FORMULA,
  OPS_QUEUE_REVIEW_FORMULA,
  OPS_QUEUE_REQUEST_FIELDS,
  OPS_QUEUE_REQUEST_FORMULA,
  opsQueueContinuationCandidatePriority,
  applyProducePauseToJob,
  buildOpsE2eStages,
  emptyOpsQueueControls,
  isProducePaused,
  isRenderPaused,
  jobIsOpsPaused,
  mergeOpsQueueOutputRecords,
  normalizeOpsQueueControls,
  opsQueueItemTitle,
  partitionOpsQueues,
  queueLaneForStudioState,
  summarizeOpsQueueRows,
} from "./ops-queue.mjs";
import {
  FACTORY_DESK_KEY,
  emptyFactoryDeskControls,
  normalizeFactoryDeskControls,
  partitionFactoryLanes,
  pinFactoryNeedsAssets,
  unpinFactoryNeedsAssets,
} from "./factory-desk.mjs";

import {
  analyticsObservationKey,
  fetchFacebookOwnedPostAnalytics,
  fetchInstagramOwnedMediaAnalytics,
  fetchTikTokOwnedVideoAnalytics,
  fetchYouTubeOwnedVideoAnalytics,
  nativePlatformId,
  normalizeAnalyticsSnapshot,
  sanitizeAnalyticsError,
} from "./first-party-analytics.mjs";
import {
  MAE_DEFAULT_TIME_ZONE,
  MAE_PRIORITY_SCHEDULE_WINDOWS,
  MAE_SCHEDULE_HORIZON_SETTING,
  MAE_STORY_COMPANION_OFFSET_MS,
  MAE_SUGGEST_HORIZON_DAYS,
  MAE_SUGGEST_LEAD_MS,
  maeAdvancePastBlackout,
  maeBuildSuggestedScheduleMap,
  maeIsBlackoutLocalTime,
  maeIsPriorityLocalTime,
  maeNextOpenScheduleIso,
  maeNormalizeHorizonDays,
  maeNormalizeTimeZone,
  maePickBalancedSuggestedIso,
  maeResolveStorySchedule,
  maeScheduleConflicts,
  maeScheduleLaneKey,
  maeScheduleNextSlot,
  maeTimeZoneFromTheme,
} from "./mae-schedule.mjs";
import {
  SCHEDULE_REGEN_JOBS_SETTING,
  createScheduleRegenJob,
  parseScheduleRegenJobStore,
  pruneScheduleRegenJobStore,
  scheduleRegenCombinationKey,
  scheduleRegenJobCounts,
  scheduleRegenProgressMessage,
  summarizeScheduleRegenJob,
  SCHEDULE_REGEN_STATUS,
} from "./schedule-regen-batch.mjs";
import {
  libraryAssetNameFindFormula,
  libraryNameHasPhrase,
  libraryNameSort,
  libraryQuotedPhrase,
} from "./library-phrase.mjs";
import {
  assignOwnedScenes,
  assignScenesToStills,
  buildTimelineFromScenes,
  ensureRelevantVideoScene,
  exactVoiceoverText,
  fallbackProposalScenes,
  fallbackScenesFromStills,
  formatTimedScriptMarkdown,
  ideaTimedScriptReady,
  mergeTimedScriptNotes,
  isStillsIdeaContentType,
  normalizeIdeaLibraryAssetIds,
  pickTimelineCatalog,
  preferredIdeaLibraryAssetIds,
  scenesFromModelPayload,
  scriptedShortProposalReady,
  singleImageFeedPostIds,
  timedScriptFromNotes,
  timelineCatalogIsRelevantVideo,
  unassignedSuggestionCount,
} from "./idea-timed-script.mjs";
import {
  anotherCutFromUnused,
  capVibeCutPlanItems,
  defaultVibeCutConfig,
  isHorizontalVibeCutAspect,
  isVibeCutNotes,
  mergeVibeCutIntoNotes,
  parseVibeCutDirective,
  proposeVibeCuts,
  provisionalSelectsFromDuration,
  selectsFromSceneTimestamps,
  vibeCutProductionDefaults,
  vibeCutRenderSettings,
} from "./vibe-cut.mjs";
import {
  capabilityMatrixResponse,
  studioApplyEngagementAction,
  studioEngagementCron,
  studioEngagementInsights,
  studioListEngagementRecommendations,
  studioLoadEngagementSettings,
  studioRunEngagementDiscovery,
  studioSaveEngagementSettings,
} from "./engagement-service.mjs";
import {
  PROFILE_SETUP_DEFAULT_FORMATS,
  PROFILE_SETUP_DEFAULT_THEMES,
  PROFILE_SETUP_PLATFORMS,
  normalizeProfileSetupState,
  profileDestinationSettingName,
  profileSetupChecklist,
  profileSetupPlatformKey,
  profileSetupPublicPlatformDescriptors,
  profileSetupSelectedPlatformLabels,
  profileSetupSettingName,
  profileSetupSlug,
} from "./profile-setup.mjs";

// Functions extracted verbatim from worker.js. No route, response, or state changes.
import {
  airtableFetch,
  HttpError,
  AIRTABLE_SLOT_FAIL_FAST_MS,
  ITEM4_MEDIA_ASSET_TABLE,
  STUDIO_OCCUPIED_LIST_LIMIT,
  ITEM4_VARIANT_QUEUE_TABLE,
  STUDIO_P1_SCENARIO_ID,
  PRODUCTION_REQUEST_TABLE,
  STUDIO_YOUTUBE_AUTONOMOUS_HARVEST_SETTING,
  STUDIO_YOUTUBE_AUTONOMOUS_HARVEST_TTL_MS,
  OUTPUT_LIST_FIELDS,
  PHASE6_DEFAULT_VOICE_ID,
  STUDIO_RENDER_QUEUE_ACTIVE_FORMULA,
  STUDIO_CONTINUATION_CANDIDATE_FORMULA,
  STUDIO_PUBLISH_RECONCILE_FORMULA,
  STUDIO_OVERDUE_SCHEDULED_FORMULA,
  STUDIO_PROFILES_OVERVIEW_CACHE_MS,
  STUDIO_PROFILES_OVERVIEW_SNAPSHOT_KEY,
  STUDIO_PROFILES_OVERVIEW_BUILD_BUDGET_MS,
  STUDIO_PROFILES_OVERVIEW_RESOLVE_BUDGET_MS,
  STUDIO_PROFILES_OVERVIEW_OUTPUT_LIMIT,
  STUDIO_PROFILES_OVERVIEW_IDEA_LIMIT,
  studioProfilesOverviewCache,
  REPAIR_LEASE_NOTE_PREFIX,
  REPAIR_LEASE_TABLE_ID,
  REPAIR_CONTROL_SCENARIOS,
  REPAIR_LEASE_MAX_MS,
  REPAIR_LEASE_MIN_MS,
  ITEM7_EXACT_STAGE_CONFIG,
  ITEM6_REPLACE_ACTIVE_STATES,
  ITEM6_REPLACE_COMMON_FIELDS,
  ITEM6_REPLACE_PLATFORM_FIELDS,
  STUDIO_IDEA_I1_SCENARIO_ID,
  STUDIO_A1S_SCENARIO_ID,
  STUDIO_A1M_SCENARIO_ID,
  STUDIO_A2_SCENARIO_ID,
  STUDIO_A2B_SCENARIO_ID,
  STUDIO_A3_SCENARIO_ID,
  STUDIO_A4_SCENARIO_ID,
  STUDIO_A3_CLASSIFY_VIEW_ID,
  STUDIO_A2_EMPTY_MAX_OPERATIONS,
  STUDIO_PIPELINE_SETTINGS_TABLE_ID,
  STUDIO_PUB1_VIEW_ID,
  STUDIO_PUB2_VIEW_ID,
  STUDIO_PUB3_VIEW_ID,
  STUDIO_A1S_OVERSIZE_BYTES,
  STUDIO_I1_LAST_DAILY_SETTING,
  STUDIO_AUTONOMOUS_LAST_SETTING,
  STUDIO_IDEA_PROFILE_TABLE_ID,
  STUDIO_IDEA_BATCH_TABLE_ID,
  STUDIO_IDEA_MIN_COUNT,
  STUDIO_IDEA_MAX_COUNT,
  STUDIO_IDEA_ALLOWED_QUALITIES,
  DESK_OUTPUT_IDENTITY_KINDS,
  studioAiApiPreferenceCache,
  AUTONOMOUS_OPEN_IDEAS_FORMULA,
  TIKTOK_COMPLETE_ERRORS,
  YOUTUBE_COMPLETE_ERRORS,
} from "./worker.js";
import {
  resolveStudioCronAuthorization,
  corsHeaders,
  respond,
  readJsonBody,
  requirePermission,
  requireAnyPermission,
  airtableCooldownWaitMs,
  studioSupabaseWriteThroughOutput,
  airtableBatchUpdate,
  listRecords,
  f,
  studioOutputIsNativePhoto,
  studioYoutubePublicSourceUrl,
  mapYoutubePrivateSourceDeskRow,
  studioPublishHandoffFields,
  studioEnsureNativePublishSlides,
  normalizedOutputState,
  mapIdea,
  mapContent,
  outputCreativeAvailable,
  mapOutput,
  googleDriveFileId,
  requestedProfileId,
  studioThemeForProfile,
  studioCityLabel,
  studioScheduleTimeZoneForProfile,
  studioScheduleTimeZoneForRecord,
  normalizeStudioBackgroundColor,
  studioBackgroundColorForRecord,
  mapStudioContentProfile,
  contentProfileFilterFormula,
  studioApproveAllCandidateFormula,
  listContentProfileRecords,
  resolveAuthorizedContentProfiles,
  resolveWorkingContentProfile,
  outputRowsForProductionRequest,
  item4ParseJson,
  item4AssetManifest,
  studioPickSharedAudioMixFields,
  studioSharedRenderRerenderFields,
  studioPatchSiblingVerticalShortOutputs,
  ideaLibraryFilterFormula,
  ideaLibraryIntakeDate,
  ideaLibraryIsEligibleImage,
  item4ProductionProfileRecord,
  attachItem4LibraryAssetIds,
  studioScheduleMs,
  studioOccupiedRowMatchesProfile,
  studioOccupiedFilterFormula,
  studioInvalidateOccupiedScheduleCache,
  studioOccupiedMsFromRow,
  studioPublishScheduleFields,
  studioResolveStoryPublishIso,
  studioPublishIsDue,
  studioPublishCanDispatchNow,
  studioPromoteDuePublishStatus,
  studioPublishHeldUntilIso,
  buildItem4OutputPlan,
  studioFacebookGraphPublishHeld,
  pipelineStageBackend,
  parseStudioProductionJob,
  studioRequestNotesText,
  enqueueStudioProductionJob,
  studioOutputProductionRequestId,
  loadStudioProductionJobsForOutputs,
  studioLastModifiedStaleFormula,
  studioOutputVoiceoverRequired,
} from "./worker-functions-01.mjs";
import {
  item4PulsePipelineStage,
  readOpsQueueControls,
  readFactoryDeskControls,
  writeFactoryDeskControls,
  loadFactoryIdeaCandidates,
  writeOpsQueueControls,
  studioLoadRenderQueueCandidates,
  item4PulseLetterPython,
  item4PulseP1Python,
  item4DrainAllPendingWork,
  item4VariantManifestPlanComplete,
  item4ReconcileVariants,
  prepareItem4Variants,
  item4ResumePendingVariants,
  canonicalProductionPlatforms,
  cleanProductionRequestPayload,
  productionRequestDefaultsFromIdea,
  listOpenProductionRequests,
  existingDraftForIdea,
  createDraftForIdea,
  item4SourceToProductionBridgePreflight,
  stripFactoryRevisionNote,
  withFactoryRevisionOpen,
  loadContentPlatformOutputs,
  outputAlreadyApprovedForPublishing,
  arrayOrEmpty,
  studioScheduleHorizonDays,
  studioOccupiedForPlatform,
  studioOccupiedForLane,
  studioSuggestedLocalDatetime,
  studioOccupiedSchedulesOrEmpty,
  studioInsightsLoadObservations,
  studioReadSimilarWatchlist,
  finalizeProductionRequestPromotion,
  promoteProductionRequestViaI3I4,
  promotionCompleted,
  waitForPromotionResult,
  ideaPhotoWatchRange,
  ideaPhotoAutoListenContentType,
  ideaHasExplicitPhotoProductionConfig,
} from "./worker-functions-02.mjs";
import {
  evaluateAndMaybeAttachWaitingIdeaPhotos,
  readLibraryCrossScopeSetting,
  mediaAssetProfileScopeForId,
  phase6RecordIdFromPath,
  phase6ParseJson,
  phase6AudioMixFieldsFromPayload,
  phase6ProductionMixAction,
  phase6AssertProductionAudioMixAllowed,
  phase6Text,
  phase6SlidesForOutput,
  phase6FindModule,
  mapPhase6CreativeOutput,
  phase6TitleLockView,
  phase6SlidesWithTitleRenderInput,
  phase6BuildPreviewRenderPackage,
  phase6ScenarioState,
  phase6SetScenarioActive,
  phase6RunAlreadyActiveError,
  phase6PulseOnDemandScenario,
  phase6WaitForOutputStatus,
  phase6StopScenarioVerified,
  phase6CreativeHandoffStatus,
  phase6MakeApiJson,
  cadenceScheduleSync,
  studioFirstLinkedId,
  advanceStudioProductionOutputs,
  pulseOnDemandR2B,
  pulseOnDemandM1,
  pulseOnDemandMakeAdminBridge,
  phase6RunScenario,
  phase6StopExactScenarioExecution,
  phase6WaitForScenarioExecution,
  phase6AdvanceVoicePrepShort,
  studioOutputReadyForPublishApproval,
  studioActivePipelineSettings,
  studioFacebookVideoId,
  studioFacebookNativeCoverRequired,
  studioFacebookNativeCoverUrl,
  studioFacebookCoverAlreadyAttached,
  studioAttachFacebookNativeCover,
  studioFacebookPublicMakeEligible,
  studioPulseAp0PublicAsset,
  studioPulseAp1IgReel,
  studioPulseFbs1,
  studioPulseFbs2,
  studioPulseFbs3,
  studioPulseFbs4,
  studioPulseYtRecord,
  studioPulseTtd0,
  studioPulseTtd1,
  studioPulseTtd2,
  studioPulseTtd3,
  studioPulseFb0,
  studioPulseFb1,
  studioPulseFb2,
  studioPulseFb2r,
  studioPulseFb3,
  studioPulseAp0c,
  studioPulseAp1c,
  studioPulseAp2c,
  studioPulseAp3c,
  studioPulseAp3p,
  studioPulseAp4c,
  studioPulseAp4r,
  studioPulseAp5c,
  studioPulseAp1IgsPoll,
  studioDispatchApprovedPublishNow,
  studioDispatchApprovedPublishTail,
  studioPublishDispatchNote,
  studioStampPublishDispatch,
  studioDispatchApprovedPublishAndSchedule,
  studioHealFailedYoutubeSourceDownloads,
  studioParkStaleYoutubeQuotaPolls,
} from "./worker-functions-03.mjs";

export async function healStaleManualFlagsOnPublishedRecord(env, record) {
  const patch = staleManualFlagsOnPublishedFields(record?.fields || record);
  if (!patch) return record;
  try {
    return await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
      method: "PATCH",
      body: JSON.stringify({ fields: patch, typecast: true }),
    });
  } catch (error) {
    console.warn("stale manual flags on published heal failed", record?.id, error);
    return record;
  }
}
/*__STUDIO_WORKER_END:healStaleManualFlagsOnPublishedRecord__*/

export async function healYoutubeManualWithLiveVideoRecord(env, record, options = {}) {
  const candidate = youtubeManualLiveVideoHealCandidate(record?.fields || record);
  if (!candidate) return record;
  const oembed = youtubeOembedUrl(candidate.liveUrl);
  if (!oembed) return record;
  try {
    const probe = await fetch(oembed, { method: "GET", redirect: "follow" });
    if (!probe.ok) return record;
    return await patchYoutubeManualClose(env, record, {
      url: candidate.liveUrl,
      autoHealed: options.autoHealed !== false,
    });
  } catch (error) {
    console.warn("youtube manual live-video heal failed", record?.id, error);
    return record;
  }
}
/*__STUDIO_WORKER_END:healYoutubeManualWithLiveVideoRecord__*/

export async function studioCloseYoutubeManualWithLiveVideo(env, options = {}) {
  const limit = Number(options.limit || 3);
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: YOUTUBE_MANUAL_LIVE_VIDEO_HEAL_FORMULA,
    });
  } catch (error) {
    console.warn("youtube manual live-video heal scan failed", error);
    return [];
  }
  const results = [];
  for (const row of rows) {
    try {
      const healed = await healYoutubeManualWithLiveVideoRecord(env, row, { autoHealed: true });
      if (healed?.id === row.id && String(f(healed, "Publish_Status") || "").toLowerCase().includes("published")) {
        results.push({
          id: row.id,
          stage: "manual_live_video_heal",
          video_id: youtubeLiveVideoIdFromFields(row.fields || {}),
          ok: true,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("youtube manual live-video heal failed", row.id, error);
      results.push({ id: row.id, stage: "manual_live_video_heal", error: message });
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioCloseYoutubeManualWithLiveVideo__*/

export async function studioRearmDueYoutubeManualPublishes(env, options = {}) {
  const limit = Number(options.limit || 3);
  const formula = 'AND({Test_Run_ID}=BLANK(),{Platform}="YouTube",{Do_Not_Publish}=0,{Publish_Status}="Manual Publish Required",{Publish_Retry_Eligible}=1,{YouTube_Video_ID}="",OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())))';
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit, filterFormula: formula });
  } catch (error) {
    console.warn("youtube manual-publish rearm scan failed", error);
    return [];
  }
  const results = [];
  for (const row of rows) {
    try {
      const fields = {
        Publish_Status: "Ready to Publish",
        Publish_Error_Stage: "",
        Publish_Error_Message: "",
        YouTube_Error_Message: "",
        YouTube_Response_JSON: "",
        Publish_Next_Retry_At: null,
        Publish_Retry_Eligible: true,
        Manual_Fallback_Required: false,
        Manual_Completion_Status: "Not Required",
        YouTube_Upload_Status: "Not Started",
        YouTube_Stage: "YT1",
        YouTube_Upload_Job_ID: "",
        YouTube_Package_Status: "Ready",
      };
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
      const refreshed = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id);
      const stage = "ytp1";
      const target = "YTP1";
      const pulsed = await studioPulseYtRecord(env, stage, target, refreshed);
      results.push({
        id: row.id,
        stage: "manual_publish_rearm",
        next: stage,
        ok: pulsed?.ok !== false,
        skipped: pulsed?.skipped || false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("youtube manual-publish rearm failed", row.id, error);
      results.push({ id: row.id, stage: "manual_publish_rearm", error: message });
    }
  }
  return results;
}

/*__STUDIO_WORKER_END:studioRearmDueYoutubeManualPublishes__*/

export async function studioReconcileYoutubePublishes(env, options = {}) {
  if (pipelineStageBackend(env, "YT0").mode !== "python") return [];
  const limit = Number(options.limit || 3);
  const results = [];
  try {
    results.push(...await studioHealFailedYoutubeSourceDownloads(env, { limit }));
  } catch (error) {
    console.warn("youtube source-download heal failed", error);
  }
  try {
    results.push(...await studioParkStaleYoutubeQuotaPolls(env, { limit }));
  } catch (error) {
    console.warn("youtube stale quota-poll park failed", error);
  }
  try {
    results.push(...await studioCloseYoutubeManualWithLiveVideo(env, { limit }));
  } catch (error) {
    console.warn("youtube manual live-video heal failed", error);
  }
  try {
    results.push(...await studioRearmDueYoutubeManualPublishes(env, { limit }));
  } catch (error) {
    console.warn("youtube manual-publish rearm failed", error);
  }
  const scans = [
    {
      stage: "yt0",
      target: "YT0",
      formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="YouTube",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{YouTube_Video_ID}="",{Platform_Post_ID}="",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW()),{YouTube_Scheduled_Publish_At}!=""),OR({YouTube_Stage}="",{YouTube_Stage}="YT0",AND({Publish_Retry_Eligible}=1,FIND("YT0",UPPER({Publish_Error_Stage}&""))>0)),OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())))',
    },
    {
      stage: "ytp1",
      target: "YTP1",
      formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="YouTube",{Do_Not_Publish}=0,{YouTube_Stage}="YT1",{YouTube_Upload_Job_ID}="",{YouTube_Video_ID}="",OR({Publish_Status}!="Manual Publish Required",AND({Publish_Retry_Eligible}=1,OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())))),OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())))',
    },
    {
      stage: "yts1",
      target: "YTS1",
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{YouTube_Stage}="YT2",{YouTube_Upload_Job_ID}!="",{YouTube_Video_ID}="",OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())))',
    },
    {
      stage: "yts2",
      target: "YTS2",
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{YouTube_Stage}="YT2",{YouTube_Video_ID}!="",OR({Publish_Status}!="Manual Publish Required",AND({Publish_Retry_Eligible}=1,OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())))),OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())))',
    },
    {
      stage: "yts3",
      target: "YTS3",
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{YouTube_Stage}="YT4",{YouTube_Video_ID}!="",{YouTube_Processing_Status}="Succeeded",OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())))',
    },
  ];
  for (const scan of scans) {
    let rows = [];
    try {
      rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit, filterFormula: scan.formula });
    } catch (error) {
      console.warn(`youtube ${scan.stage} reconcile scan failed`, error);
      continue;
    }
    for (const row of rows) {
      try {
        if (scan.stage === "ytp1" && !studioYoutubePublicSourceUrl(row)) {
          const staged = await studioPulseAp0PublicAsset(env, row);
          results.push({
            id: row.id,
            stage: "ap0",
            ok: staged?.ok !== false,
            skipped: staged?.skipped || false,
            blocked: "missing_public_publish_url",
          });
          continue;
        }
        const pulsed = await studioPulseYtRecord(env, scan.stage, scan.target, row);
        results.push({
          id: row.id,
          stage: scan.stage,
          ok: pulsed?.ok !== false,
          skipped: pulsed?.skipped || false,
          still_processing: pulsed?.still_processing || false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`youtube ${scan.stage} reconcile failed`, row.id, error);
        results.push({ id: row.id, stage: scan.stage, error: message });
      }
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcileYoutubePublishes__*/

export async function studioReconcileTiktokDrafts(env, options = {}) {
  if (pipelineStageBackend(env, "TTD0").mode !== "python") return [];
  const limit = Number(options.limit || 3);
  const results = [];
  const scans = [
    {
      stage: "ttd0",
      pulse: studioPulseTtd0,
      formula: `AND({Test_Run_ID}=BLANK(),{Platform}="TikTok",{Do_Not_Publish}=0,{Auto_Publish_Enabled}=1,{TikTok_Draft_Publish_ID}="",${STUDIO_TIKTOK_INBOX_DUE_FORMULA},OR({TikTok_Draft_Status}="Ready for Assets",AND({TikTok_Draft_Status}="Retry Pending",FIND("TTD0",UPPER({Publish_Error_Stage}&""))>0)))`,
      sortField: "Scheduled_Post_Date",
      sortDirection: "asc",
    },
    {
      stage: "ttd1",
      pulse: studioPulseTtd1,
      formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="TikTok",{Do_Not_Publish}=0,{Auto_Publish_Enabled}=1,{TikTok_Draft_Publish_ID}="",OR({TikTok_Draft_Status}="Ready for Delivery",AND({TikTok_Draft_Status}="Retry Pending",OR(FIND("TTD1",UPPER({Publish_Error_Stage}&""))>0,{Publish_Error_Stage}="TTD_CAPACITY"))))',
    },
    {
      stage: "ttd2",
      pulse: studioPulseTtd2,
      formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="TikTok",{Do_Not_Publish}=0,{TikTok_Draft_Publish_ID}!="",OR({TikTok_Draft_Status}="Processing",AND({TikTok_Draft_Status}="Retry Pending",FIND("TTD2",UPPER({Publish_Error_Stage}&""))>0)))',
    },
    {
      stage: "ttd3",
      pulse: studioPulseTtd3,
      formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="TikTok",{Do_Not_Publish}=0,{TikTok_Draft_Delivered_At}!="",{TikTok_Draft_Email_Sent_At}="",{Manual_Completion_Status}="Required",OR({TikTok_Draft_Status}="Draft Delivered — Manual Action Required",{TikTok_Draft_Status}="Manual Completion Received",AND({TikTok_Draft_Status}="Retry Pending",FIND("TTD3",UPPER({Publish_Error_Stage}&""))>0)))',
    },
  ];
  for (const scan of scans) {
    let rows = [];
    try {
      rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
        limit,
        filterFormula: scan.formula,
        sortField: scan.sortField || null,
        sortDirection: scan.sortDirection || "desc",
      });
    } catch (error) {
      console.warn(`tiktok ${scan.stage} reconcile scan failed`, error);
      continue;
    }
    for (const row of rows) {
      try {
        let current = row;
        if (scan.stage === "ttd0") current = await studioPromoteDuePublishStatus(env, row);
        const pulsed = await scan.pulse(env, current);
        results.push({ id: current.id, stage: scan.stage, ok: pulsed?.ok !== false, skipped: pulsed?.skipped || false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`tiktok ${scan.stage} reconcile failed`, row.id, error);
        results.push({ id: row.id, stage: scan.stage, error: message });
      }
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcileTiktokDrafts__*/

export async function studioReconcileFacebookPhotos(env, options = {}) {
  if (studioFacebookGraphPublishHeld(env)) return [];
  if (pipelineStageBackend(env, "FB0").mode !== "python") return [];
  const limit = Number(options.limit || 3);
  const results = [];
  const scans = [
    {
      stage: "fb0",
      pulse: studioPulseFb0,
      formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Do_Not_Publish}=0,{Auto_Publish_Enabled}=1,{Platform_Post_ID}="",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())),OR({FB_Publish_Status}="Ready for Assets",AND({FB_Publish_Status}="Retry Pending",FIND("FB0",UPPER({Publish_Error_Stage}&""))>0)))',
    },
    {
      stage: "fb1",
      pulse: studioPulseFb1,
      formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Do_Not_Publish}=0,{Platform_Post_ID}="",OR({FB_Publish_Status}="Ready for Photo Media",AND({FB_Publish_Status}="Retry Pending",FIND("FB1",UPPER({Publish_Error_Stage}&""))>0)))',
    },
    {
      stage: "fb2",
      pulse: studioPulseFb2,
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{Platform_Post_ID}="",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())),OR({FB_Publish_Status}="Photo Media Ready",AND({FB_Publish_Status}="Retry Pending",FIND("FB2_PUBLISH",UPPER({Publish_Error_Stage}&""))>0)))',
    },
    {
      stage: "fb2r",
      pulse: studioPulseFb2r,
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{Platform_Post_ID}="",{FB_Publish_Status}="Reconcile Pending")',
    },
    {
      stage: "fb3",
      pulse: studioPulseFb3,
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{Platform_Post_ID}!="",{Publish_Status}!="Published")',
    },
  ];
  for (const scan of scans) {
    let rows = [];
    try {
      rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit, filterFormula: scan.formula });
    } catch (error) {
      console.warn(`facebook photo ${scan.stage} reconcile scan failed`, error);
      continue;
    }
    for (const row of rows) {
      try {
        const pulsed = await scan.pulse(env, row);
        results.push({ id: row.id, stage: scan.stage, ok: pulsed?.ok !== false, skipped: pulsed?.skipped || false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`facebook photo ${scan.stage} reconcile failed`, row.id, error);
        results.push({ id: row.id, stage: scan.stage, error: message });
      }
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcileFacebookPhotos__*/

export async function studioReconcileInstagramCarousels(env, options = {}) {
  if (pipelineStageBackend(env, "AP0C").mode !== "python") return [];
  const limit = Number(options.limit || 3);
  const results = [];
  // Publish/finalize stages first so a due Parent Ready row cannot starve behind
  // asset/child prep work for other carousels in the same cron budget.
  const scans = [
    {
      stage: "ap4c",
      pulse: studioPulseAp4c,
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{Platform_Post_ID}="",{IG_Carousel_Status}="Parent Ready",{IG_Carousel_Parent_Container_ID}!="",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())))',
    },
    {
      stage: "ap4r",
      pulse: studioPulseAp4r,
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{IG_Carousel_Status}="Publishing",{IG_Carousel_Published_Media_ID}="",{IG_Carousel_Error_Stage}="AP4C Parent Publishing")',
    },
    {
      stage: "ap5c",
      pulse: studioPulseAp5c,
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{IG_Carousel_Status}="Publishing",{IG_Carousel_Published_Media_ID}!="",{Platform_Post_URL}="")',
    },
    {
      stage: "ap0c",
      pulse: studioPulseAp0c,
      formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Platform_Output_Type}="Instagram Carousel",{Do_Not_Publish}=0,{Auto_Publish_Enabled}=1,{Platform_Post_ID}="",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())),OR({IG_Carousel_Status}="Ready for Asset Prep",AND({IG_Carousel_Status}="Retry Pending",{Publish_Retry_Eligible}=1)))',
    },
    {
      stage: "ap1c",
      pulse: studioPulseAp1c,
      formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Do_Not_Publish}=0,{Platform_Post_ID}="",{IG_Carousel_Status}="Assets Ready")',
    },
    {
      stage: "ap2c",
      pulse: studioPulseAp2c,
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{IG_Carousel_Status}="Children Processing")',
    },
    {
      stage: "ap3c",
      pulse: studioPulseAp3c,
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{IG_Carousel_Status}="Children Ready",{IG_Carousel_Parent_Container_ID}="")',
    },
    {
      stage: "ap3p",
      pulse: studioPulseAp3p,
      formula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{IG_Carousel_Status}="Parent Processing",{IG_Carousel_Parent_Container_ID}!="")',
    },
  ];
  for (const scan of scans) {
    let rows = [];
    try {
      rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit, filterFormula: scan.formula });
    } catch (error) {
      console.warn(`instagram carousel ${scan.stage} reconcile scan failed`, error);
      continue;
    }
    for (const row of rows) {
      try {
        const pulsed = await scan.pulse(env, row);
        results.push({ id: row.id, stage: scan.stage, ok: pulsed?.ok !== false, skipped: pulsed?.skipped || false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`instagram carousel ${scan.stage} reconcile failed`, row.id, error);
        results.push({ id: row.id, stage: scan.stage, error: message });
      }
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcileInstagramCarousels__*/

export function studioPublishLockIsStale(record, staleMs = 10 * 60 * 1000) {
  const raw = String(f(record, "Publish_Locked_At") || "").trim();
  if (!raw) return true;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) || ms <= Date.now() - staleMs;
}
/*__STUDIO_WORKER_END:studioPublishLockIsStale__*/

export async function studioHealOverdueTikTokPrep(env, record) {
  if (String(f(record, "Platform") || "").trim() !== "TikTok") return record;
  if (String(f(record, "TikTok_Draft_Status") || "").trim() !== "Preparing Assets") return record;
  if (!studioPublishLockIsStale(record)) return record;
  try {
    return await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          TikTok_Draft_Status: "Ready for Assets",
          Publish_Locked_At: null,
          Publish_Locked_By: "",
          Publish_Started_At: null,
          Publish_Error_Stage: "",
          Publish_Error_Message: "",
          Publish_Next_Retry_At: null,
          Publish_Retry_Eligible: false,
        },
        typecast: true,
      }),
    });
  } catch (error) {
    console.warn("overdue TikTok prep heal failed", record?.id, error);
    return record;
  }
}
/*__STUDIO_WORKER_END:studioHealOverdueTikTokPrep__*/

export async function studioReconcileOverdueScheduledPublishes(env, options = {}) {
  const limit = Math.max(1, Math.min(20, Number(options.limit || 12)));
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: STUDIO_OVERDUE_SCHEDULED_FORMULA,
      sortField: "Scheduled_Post_Date",
      sortDirection: "asc",
    });
  } catch (error) {
    console.warn("overdue scheduled publish rescue scan failed", error);
    return [];
  }
  const results = [];
  for (const row of rows) {
    try {
      let current = await studioHealOverdueTikTokPrep(env, row);
      current = await studioPromoteDuePublishStatus(env, current);
      const primary = await studioDispatchApprovedPublishNow(env, current);
      await studioStampPublishDispatch(env, current, `overdue-rescue: ${studioPublishDispatchNote(primary)}`);
      results.push({
        id: current.id,
        output_id: f(current, "Output_ID"),
        platform: f(current, "Platform"),
        target: primary?.target || primary?.plan?.target || primary?.skipped || null,
        ok: primary?.ok !== false,
      });
      await studioDispatchApprovedPublishTail(env, current, primary).catch((error) => {
        console.warn("overdue scheduled publish rescue tail failed", current.id, error);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("overdue scheduled publish rescue failed", row.id, error);
      await studioStampPublishDispatch(env, row, `overdue-rescue failed: ${message}`);
      results.push({ id: row.id, output_id: f(row, "Output_ID"), error: message });
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcileOverdueScheduledPublishes__*/

export async function studioHealApprovedMissingSchedule(env, options = {}) {
  const limit = Math.max(1, Math.min(20, Number(options.limit || 16)));
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      sortField: "Output_ID",
      sortDirection: "asc",
      // Publishing is already in flight. Ready to Publish / Ready to Schedule with
      // no date are the Factory approvals Make will post on the next pulse.
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{Published_At}=BLANK(),{Scheduled_Post_Date}=BLANK(),{YouTube_Scheduled_Publish_At}=BLANK(),{Studio_Scheduled_At}=BLANK(),{Output_Status}="Approved for Publishing",OR({Publish_Status}="Ready to Publish",{Publish_Status}="Ready to Schedule"))',
    });
  } catch (error) {
    console.warn("approved missing-schedule scan failed", error);
    return [];
  }
  const occupiedByProfile = new Map();
  const healed = [];
  for (const row of rows || []) {
    const profile = await item4ProductionProfileRecord(env, row).catch(() => null);
    const profileKey = profile?.id || "_all";
    if (!occupiedByProfile.has(profileKey)) {
      occupiedByProfile.set(profileKey, await studioOccupiedSchedulesOrEmpty(env, { profile }).catch(() => ({})));
    }
    const occupiedByLane = occupiedByProfile.get(profileKey) || {};
    const platform = String(f(row, "Platform") || "").trim();
    const outputType = String(f(row, "Studio_Output_Type") || f(row, "Format") || "").trim();
    const isStory = /story/i.test(outputType);
    const laneKey = maeScheduleLaneKey(platform, outputType) || platform.toLowerCase();
    const lane = studioOccupiedForLane(occupiedByLane, platform, outputType);
    const timeZone = await studioScheduleTimeZoneForRecord(env, row, null);
    const horizonDays = await studioScheduleHorizonDays(env).catch(() => MAE_SUGGEST_HORIZON_DAYS);
    let iso = "";
    let storyCompanion = false;
    if (isStory) {
      const resolved = await studioResolveStoryPublishIso(env, row, { occupiedMs: lane, timeZone });
      iso = resolved.iso || "";
      storyCompanion = true;
    } else {
      iso = studioSuggestedLocalDatetime(MAE_PRIORITY_SCHEDULE_WINDOWS, new Date(), {
        occupiedMs: lane,
        platformOccupiedMs: lane,
        timeZone,
        horizonDays,
      });
    }
    if (!iso && isStory) {
      iso = studioSuggestedLocalDatetime(MAE_PRIORITY_SCHEDULE_WINDOWS, new Date(), {
        occupiedMs: lane,
        platformOccupiedMs: lane,
        timeZone,
        horizonDays,
      });
      storyCompanion = false;
    }
    if (!iso) continue;
    const fields = studioPublishScheduleFields(
      { scheduled_post_date: iso, timezone: timeZone },
      row,
      { occupiedMs: storyCompanion ? [] : lane, timeZone, forceWrite: true, storyCompanion },
    );
    if (!fields.Scheduled_Post_Date) continue;
    try {
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
    } catch (error) {
      console.warn("approved missing-schedule stamp failed", row.id, error);
      continue;
    }
    const booked = Date.parse(fields.Scheduled_Post_Date);
    if (Number.isFinite(booked)) (occupiedByLane[laneKey] ||= []).push(booked);
    healed.push({ id: row.id, output_id: f(row, "Output_ID") || null, scheduled_post_date: fields.Scheduled_Post_Date });
  }
  if (healed.length) studioInvalidateOccupiedScheduleCache();
  return healed;
}
/*__STUDIO_WORKER_END:studioHealApprovedMissingSchedule__*/

export async function studioHealStoryCompanionDrift(env, options = {}) {
  const limit = Math.max(1, Math.min(12, Number(options.limit || 8)));
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      sortField: "Scheduled_Post_Date",
      sortDirection: "asc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{Published_At}=BLANK(),{Studio_Scheduled_At}=BLANK(),{Scheduled_Post_Date}!="",IS_BEFORE({Scheduled_Post_Date},DATEADD(NOW(),7,"days")),{Output_Status}="Approved for Publishing",OR({Publish_Status}="Ready to Publish",{Publish_Status}="Ready to Schedule"),OR(FIND("Story",{Studio_Output_Type}&""),FIND("Story",{Format}&"")))',
    });
  } catch (error) {
    console.warn("story companion drift scan failed", error);
    return [];
  }
  const healed = [];
  for (const row of rows || []) {
    const currentRaw = String(f(row, "Scheduled_Post_Date") || "").trim();
    const currentMs = Date.parse(currentRaw);
    if (!Number.isFinite(currentMs)) continue;
    const timeZone = await studioScheduleTimeZoneForRecord(env, row, null);
    const resolved = await studioResolveStoryPublishIso(env, row, {
      timeZone,
      existingIso: currentRaw,
      allowMaeFallback: false,
    });
    if (resolved.source !== "companion" || !resolved.iso) continue;
    const companionMs = Date.parse(resolved.iso);
    if (!Number.isFinite(companionMs) || Math.abs(companionMs - currentMs) < 2 * 60 * 1000) continue;
    const fields = studioPublishScheduleFields(
      { scheduled_post_date: resolved.iso, timezone: timeZone },
      row,
      { occupiedMs: [], timeZone, forceWrite: true, storyCompanion: true },
    );
    if (!fields.Scheduled_Post_Date) continue;
    try {
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
    } catch (error) {
      console.warn("story companion drift stamp failed", row.id, error);
      continue;
    }
    healed.push({
      id: row.id,
      output_id: f(row, "Output_ID") || null,
      scheduled_post_date: fields.Scheduled_Post_Date,
      offset_ms: MAE_STORY_COMPANION_OFFSET_MS,
    });
  }
  if (healed.length) studioInvalidateOccupiedScheduleCache();
  return healed;
}
/*__STUDIO_WORKER_END:studioHealStoryCompanionDrift__*/

export async function studioReconcileApprovedPublishes(env, options = {}) {
  await studioHealApprovedMissingSchedule(env, { limit: 16 }).catch((error) => {
    console.warn("approved missing-schedule heal before reconcile failed", error);
  });
  const limit = Math.max(1, Math.min(12, Number(options.limit || 8)));
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: STUDIO_PUBLISH_RECONCILE_FORMULA,
      sortField: "Scheduled_Post_Date",
      sortDirection: "asc",
    });
  } catch (error) {
    console.warn("publish reconcile scan failed", error);
    return [];
  }
  const results = [];
  for (const row of rows) {
    try {
      const primary = await studioDispatchApprovedPublishNow(env, row);
      await studioStampPublishDispatch(env, row, `reconcile: ${studioPublishDispatchNote(primary)}`);
      results.push({ id: row.id, target: primary?.target || primary?.skipped || null, ok: primary?.ok !== false });
      await studioDispatchApprovedPublishTail(env, row, primary).catch((error) => {
        console.warn("publish reconcile tail failed", row.id, error);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("publish reconcile dispatch failed", row.id, error);
      await studioStampPublishDispatch(env, row, `reconcile failed: ${message}`);
      results.push({ id: row.id, error: message });
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcileApprovedPublishes__*/

export async function studioReconcileFacebookPublicMake(env, options = {}) {
  if (!studioFacebookGraphPublishHeld(env)) return [];
  const limit = Number(options.limit || 3);
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Do_Not_Publish}=0,{Auto_Publish_Enabled}=1,{Published_At}=BLANK(),{Platform_Post_ID}="",{Output_Status}="Approved for Publishing",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())),OR({Studio_Publish_Dispatch_Count}=BLANK(),{Studio_Publish_Dispatch_Count}<8),OR({Studio_Publish_Dispatch_At}=BLANK(),DATETIME_DIFF(NOW(),{Studio_Publish_Dispatch_At},"minutes")>=6))',
    });
  } catch (error) {
    console.warn("facebook public make reconcile scan failed", error);
    return [];
  }
  const results = [];
  for (const row of rows) {
    if (!studioFacebookPublicMakeEligible(row) || !studioPublishCanDispatchNow(row)) continue;
    try {
      const primary = await studioDispatchApprovedPublishNow(env, row);
      await studioStampPublishDispatch(env, row, `reconcile: ${studioPublishDispatchNote(primary)}`);
      results.push({ id: row.id, target: primary?.target || primary?.skipped || null, ok: primary?.ok !== false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("facebook public make reconcile failed", row.id, error);
      await studioStampPublishDispatch(env, row, `reconcile failed: ${message}`);
      results.push({ id: row.id, error: message });
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcileFacebookPublicMake__*/

export async function studioReconcileFacebookVideoCovers(env, options = {}) {
  const limit = Number(options.limit || 8);
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Do_Not_Publish}=0,OR({Platform_Post_ID}!="",{FB_Slideshow_Meta_Video_ID}!=""),OR({Platform_Output_Type}="Facebook Reel",{Studio_Output_Type}="Slideshow Reel"),FIND("facebook-cover=attached",{Studio_Publish_Dispatch_Note}&"")=0)',
    });
  } catch (error) {
    console.warn("facebook native cover reconcile scan failed", error);
    return [];
  }
  const results = [];
  for (const row of rows) {
    if (!studioFacebookNativeCoverRequired(row) || studioFacebookCoverAlreadyAttached(row)) continue;
    if (!studioFacebookVideoId(row) || !studioFacebookNativeCoverUrl(row)) continue;
    try {
      const attached = await studioAttachFacebookNativeCover(env, row);
      results.push({
        id: row.id,
        ok: attached?.ok !== false,
        skipped: attached?.skipped || false,
        attached: Boolean(attached?.attached),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("facebook native cover attach failed", row.id, error);
      results.push({ id: row.id, error: message });
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcileFacebookVideoCovers__*/

export async function studioReconcilePublishingInstagramStories(env, options = {}) {
  if (pipelineStageBackend(env, "AP1_IGS").mode !== "python") return [];
  const limit = Number(options.limit || 3);
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Do_Not_Publish}=0,{IG_Story_Status}="Publishing",{IG_Story_Container_ID}!="",{IG_Story_Post_ID}=BLANK())',
    });
  } catch (error) {
    console.warn("instagram story poll reconcile scan failed", error);
    return [];
  }
  const results = [];
  for (const row of rows) {
    try {
      const pulsed = await studioPulseAp1IgsPoll(env, row);
      results.push({ id: row.id, ok: pulsed?.ok !== false, still_processing: pulsed?.still_processing || false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("instagram story poll reconcile failed", row.id, error);
      results.push({ id: row.id, error: message });
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcilePublishingInstagramStories__*/

export async function studioReconcilePublishingInstagramReels(env, options = {}) {
  if (pipelineStageBackend(env, "AP1_IG").mode !== "python") return [];
  const limit = Number(options.limit || 4);
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Do_Not_Publish}=0,{Auto_Publish_Enabled}=1,{Published_At}=BLANK(),{Platform_Post_ID}="",{Platform_Media_ID}!="",OR({Platform_Output_Type}="Instagram Reel",{Studio_Output_Type}="Reel"),OR({Publish_Status}="Publishing",AND({Publish_Status}="Ready to Publish",{Publish_Retry_Eligible}=1)))',
    });
  } catch (error) {
    console.warn("instagram reel in-progress reconcile scan failed", error);
    return [];
  }
  const results = [];
  for (const row of rows) {
    try {
      const pulsed = await studioPulseAp1IgReel(env, row);
      results.push({
        id: row.id,
        ok: pulsed?.ok !== false,
        skipped: pulsed?.skipped || null,
        post_id: pulsed?.post_id || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("instagram reel in-progress reconcile failed", row.id, error);
      results.push({ id: row.id, error: message });
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcilePublishingInstagramReels__*/

export async function studioReconcileFacebookSlideshows(env, options = {}) {
  if (pipelineStageBackend(env, "FBS1").mode !== "python") return [];
  const limit = Number(options.limit || 3);
  const results = [];
  let ready = [];
  let processing = [];
  try {
    ready = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())),OR({FB_Slideshow_Status}="Ready to Render",AND({FB_Slideshow_Status}="Retry Pending",FIND("FBS1",UPPER({Publish_Error_Stage}&""))>0)))',
    });
  } catch (error) {
    console.warn("facebook slideshow create reconcile scan failed", error);
  }
  try {
    processing = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,OR({FB_Slideshow_Status}="Rendering",{FB_Slideshow_Status}="Staging Final MP4",AND({FB_Slideshow_Status}="Retry Pending",FIND("FBS2",UPPER({Publish_Error_Stage}&""))>0),AND({Platform}="Facebook",{Platform_Output_Type}="Facebook Reel",{Output_Status}="Approved for Publishing",{Review_Status}="Approved",{Final_File_ID}!="",{Platform_Post_ID}="",{Publish_Asset_URL}="",{FB_Slideshow_Public_URL}="",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())))))',
    });
  } catch (error) {
    console.warn("facebook slideshow poll reconcile scan failed", error);
  }
  for (const row of ready) {
    try {
      const pulsed = await studioPulseFbs1(env, row);
      results.push({ id: row.id, stage: "fbs1", ok: pulsed?.ok !== false, skipped: pulsed?.skipped || false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("facebook slideshow create reconcile failed", row.id, error);
      results.push({ id: row.id, stage: "fbs1", error: message });
    }
  }
  for (const row of processing) {
    try {
      const pulsed = await studioPulseFbs2(env, row);
      results.push({ id: row.id, stage: "fbs2", ok: pulsed?.ok !== false, still_processing: pulsed?.still_processing || false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("facebook slideshow poll reconcile failed", row.id, error);
      results.push({ id: row.id, stage: "fbs2", error: message });
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcileFacebookSlideshows__*/

export async function studioReconcileFacebookReels(env, options = {}) {
  if (pipelineStageBackend(env, "FBS3").mode !== "python") return [];
  const graphHeld = studioFacebookGraphPublishHeld(env);
  const limit = Number(options.limit || 3);
  const results = [];
  let ready = [];
  let processing = [];
  // Graph-held still allows FBS4 finalize for rows Make/public already posted.
  // Returning [] here left 310/315/319/324 live on Facebook but stuck Publishing.
  if (!graphHeld) {
    try {
      ready = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
        limit,
        filterFormula: 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())),OR(AND({FB_Slideshow_Status}="Video Ready",{FB_Slideshow_Public_URL}!=""),AND({FB_Slideshow_Status}="Retry Pending",FIND("FBS3",UPPER({Publish_Error_Stage}&""))>0)))',
        sortField: "Scheduled_Post_Date",
        sortDirection: "asc",
      });
    } catch (error) {
      console.warn("facebook reel create reconcile scan failed", error);
    }
  }
  // Pending Finalize first so cover-stuck Reel Processing zombies cannot starve
  // already-live Make/public posts. Skip Publish_Status=Published — those are done;
  // native cover retries belong to studioReconcileFacebookVideoCovers.
  const pollScans = [
    {
      label: "pending-finalize",
      formula: 'AND({Test_Run_ID}=BLANK(),{FB_Slideshow_Status}="Published Pending Finalize",OR({FB_Slideshow_Meta_Video_ID}!="",{Platform_Post_ID}!=""),{Publish_Status}!="Published")',
    },
    {
      label: "reel-processing",
      formula: 'AND({Test_Run_ID}=BLANK(),{FB_Slideshow_Status}="Reel Processing",OR({FB_Slideshow_Meta_Video_ID}!="",{Platform_Post_ID}!=""),{Publish_Status}!="Published")',
    },
  ];
  const seen = new Set();
  for (const scan of pollScans) {
    if (processing.length >= limit) break;
    let rows = [];
    try {
      rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
        limit: limit - processing.length,
        filterFormula: scan.formula,
        sortField: "Scheduled_Post_Date",
        sortDirection: "asc",
      });
    } catch (error) {
      console.warn(`facebook reel poll ${scan.label} reconcile scan failed`, error);
      continue;
    }
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      processing.push(row);
      if (processing.length >= limit) break;
    }
  }
  for (const row of ready) {
    if (!studioPublishCanDispatchNow(row)) continue;
    try {
      const pulsed = await studioPulseFbs3(env, row);
      await studioStampPublishDispatch(
        env,
        row,
        `facebook-native-reel: ${pulsed?.skipped ? `skipped=${pulsed.skipped}` : pulsed?.ok === false ? `failed=${pulsed?.message || pulsed?.status || "unknown"}` : `accepted FBS3 video_id=${pulsed?.video_id || ""}`}`
      );
      results.push({ id: row.id, stage: "fbs3", ok: pulsed?.ok !== false, skipped: pulsed?.skipped || false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("facebook reel create reconcile failed", row.id, error);
      await studioStampPublishDispatch(env, row, `facebook-native-reel failed: ${message}`);
      results.push({ id: row.id, stage: "fbs3", error: message });
    }
  }
  for (const row of processing) {
    try {
      const pulsed = await studioPulseFbs4(env, row);
      results.push({ id: row.id, stage: "fbs4", ok: pulsed?.ok !== false, still_processing: pulsed?.still_processing || false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("facebook reel poll reconcile failed", row.id, error);
      results.push({ id: row.id, stage: "fbs4", error: message });
    }
  }
  return results;
}
/*__STUDIO_WORKER_END:studioReconcileFacebookReels__*/

export async function approveOutputRecordForPublishing(env, existing, note, stamp, payload = {}, options = {}) {
  const id = existing.id;
  if (Boolean(f(existing, "Do_Not_Publish"))) {
    throw new HttpError(409, "Do_Not_Publish outputs cannot be approved for live publishing");
  }
  if (!studioOutputReadyForPublishApproval(existing)) {
    throw new HttpError(409, "This output is not ready for publishing approval");
  }
  const existingNotes = String(f(existing, "Review_Notes") || "").trim();
  let record = existing;
  if (studioOutputIsNativePhoto(record)) {
    await item4PulseLetterPython(env, { outputRecordId: record.id }).catch((error) => {
      console.warn("native photo branding before publish approval failed", record.id, error);
    });
    record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id);
  }
  const platform = String(f(record, "Platform") || "").trim();
  const outputType = String(f(record, "Studio_Output_Type") || f(record, "Format") || "").trim();
  const laneKey = maeScheduleLaneKey(platform, outputType) || String(platform || "").toLowerCase();
  const profile = options.profile || await item4ProductionProfileRecord(env, record).catch(() => null);
  const horizonDays = options.horizonDays
    || await studioScheduleHorizonDays(env).catch(() => MAE_SUGGEST_HORIZON_DAYS);
  let occupiedMs = Array.isArray(options.occupiedMs) ? options.occupiedMs.slice() : null;
  if (!occupiedMs) {
    const occupied = await studioOccupiedSchedulesOrEmpty(env, {
      excludeIds: [id],
      profile,
    });
    occupiedMs = studioOccupiedForLane(occupied, platform, outputType);
  }
  const timeZone = options.timeZone || await studioScheduleTimeZoneForRecord(env, record, payload);
  const isStory = /story/i.test(outputType);
  const markerIso = String(f(record, "Studio_Scheduled_At") || "").trim();
  const existingScheduleIso = String(
    f(record, "Scheduled_Post_Date") || f(record, "YouTube_Scheduled_Publish_At") || ""
  ).trim();
  const rawIn = String(payload?.scheduled_post_date || "").trim();
  const publishNowImmediate = Boolean(
    payload?.publish_now === true || rawIn.toLowerCase() === "immediate"
  );
  // Manual override and Publish Now keep exact operator intent. Factory Approve,
  // Pipeline Approve, and Approve All set recheckBestSlot so scheduling happens
  // at click time from the centralized MAE-first / balanced-overflow engine.
  // A blank Scheduled_Post_Date is what Make and the worker treat as due, so
  // writing nothing publishes the post immediately.
  const recheckBestSlot = options.recheckBestSlot === true
    || (options.recheckBestSlot !== false
      && !publishNowImmediate
      && payload?.manual_schedule_override !== true
      && !markerIso);
  let requestedRaw = recheckBestSlot ? "" : rawIn;
  let exactOverride = false;
  let storyCompanion = false;
  const capacityMessage = `No open morning, afternoon, evening, or overflow slot in the next ${horizonDays} days`;
  const pickLaneIso = (lane) => {
    const picked = maeScheduleNextSlot({
      timeZone,
      occupiedMs: lane || [],
      horizonDays,
    });
    if (!picked.ok) throw new HttpError(409, picked.error || capacityMessage);
    return picked.iso;
  };
  if (publishNowImmediate) {
    requestedRaw = "immediate";
  } else if (payload?.manual_schedule_override === true && rawIn) {
    requestedRaw = rawIn;
    exactOverride = true;
  } else if (markerIso && !recheckBestSlot) {
    requestedRaw = markerIso;
    exactOverride = true;
  } else if (isStory) {
    const resolved = await studioResolveStoryPublishIso(env, record, {
      timeZone,
      occupiedMs: occupiedMs || [],
      requestedIso: recheckBestSlot ? "" : requestedRaw,
      existingIso: recheckBestSlot ? "" : existingScheduleIso,
      extraSiblings: options.extraSiblings || [],
      siblingRows: options.siblingRows,
    });
    if (!resolved.iso) {
      requestedRaw = pickLaneIso(occupiedMs || []);
      storyCompanion = false;
    } else {
      requestedRaw = resolved.iso;
      storyCompanion = resolved.source === "companion" || resolved.source === "mae_plus_10";
    }
  } else if (!recheckBestSlot && !requestedRaw && existingScheduleIso) {
    requestedRaw = existingScheduleIso;
  } else if (!requestedRaw) {
    requestedRaw = pickLaneIso(occupiedMs || []);
  }

  // Concurrency guard: two near-simultaneous approvals must not claim the same slot.
  // Approve All already holds a shared in-memory occupancy map for the whole job —
  // reloading the calendar from Airtable for every row is what made 50 Approves time out.
  if (
    !options.skipOccupancyRefresh
    && !publishNowImmediate
    && !exactOverride
    && requestedRaw
    && requestedRaw !== "immediate"
  ) {
    studioInvalidateOccupiedScheduleCache();
    const fresh = await studioOccupiedSchedulesOrEmpty(env, { excludeIds: [id], profile });
    const freshLane = studioOccupiedForLane(fresh, platform, outputType);
    const ms = Date.parse(requestedRaw);
    if (Number.isFinite(ms) && maeScheduleConflicts(ms, freshLane)) {
      requestedRaw = pickLaneIso(freshLane);
      occupiedMs = freshLane;
      storyCompanion = false;
    } else {
      occupiedMs = freshLane;
    }
  }

  const scheduleFields = studioPublishScheduleFields(
    { ...(payload || {}), scheduled_post_date: requestedRaw, timezone: timeZone },
    record,
    {
      occupiedMs: storyCompanion ? [] : occupiedMs,
      exactOverride,
      storyCompanion,
      timeZone,
      // Publish Now must store "now". Leaving the date blank is the same as due.
      forceWrite: publishNowImmediate,
    },
  );
  const scheduledIso = scheduleFields.Scheduled_Post_Date || f(record, "Scheduled_Post_Date");
  const fields = {
    Review_Status: "Approved",
    Output_Status: "Approved for Publishing",
    Publish_Status: "Ready to Schedule",
    Publish_Method: "Automated",
    Auto_Publish_Enabled: true,
    Review_Decision_At: stamp,
    Do_Not_Publish: false,
    Review_Notes: [existingNotes, note, `Studio Pipeline approved for publishing at ${stamp}.`].filter(Boolean).join("\n\n"),
    ...studioPublishHandoffFields(record, { scheduledPostDate: scheduledIso }),
    ...scheduleFields,
  };
  const prepared = await studioEnsureNativePublishSlides(env, record);
  // Handoff must not clobber schedule-aware Publish_Status / TikTok draft labels.
  const preparedHandoff = studioPublishHandoffFields(prepared, {
    scheduledPostDate: scheduleFields.Scheduled_Post_Date || f(prepared, "Scheduled_Post_Date") || scheduledIso,
  });
  const updated = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, prepared.id || id, {
    method: "PATCH",
    body: JSON.stringify({ fields: { ...fields, ...preparedHandoff, ...scheduleFields }, typecast: true }),
  });
  if (!options.skipOccupancyRefresh) studioInvalidateOccupiedScheduleCache();
  // Phase 3: Factory/Approve updates Airtable; Pipeline list/grid read Supabase.
  // Without write-through, Approved rows stay "Ready for Review" in Pipeline.
  const writeThrough = studioSupabaseWriteThroughOutput(env, updated, "approve");
  if (Array.isArray(options.writeThroughQueue)) {
    options.writeThroughQueue.push(writeThrough);
  } else {
    await writeThrough;
  }
  return updated;
}
/*__STUDIO_WORKER_END:approveOutputRecordForPublishing__*/

export function mapApprovedOutputSummary(record) {
  return {
    id: record.id,
    output_id: f(record, "Output_ID"),
    platform: f(record, "Platform"),
    format: f(record, "Format") || f(record, "Platform_Output_Type") || f(record, "Studio_Output_Type"),
  };
}
/*__STUDIO_WORKER_END:mapApprovedOutputSummary__*/

export async function studioLoadApproveAllJobStore(env) {
  const row = await studioSettingsByName(env, APPROVE_ALL_JOBS_SETTING).catch(() => null);
  return pruneApproveAllJobStore(
    parseApproveAllJobStore(row?.fields?.Setting_Value || row?.fields?.Value || "{}"),
  );
}
/*__STUDIO_WORKER_END:studioLoadApproveAllJobStore__*/

export async function studioSaveApproveAllJobStore(env, store) {
  let pruned = pruneApproveAllJobStore(store);
  const notes = "Durable Pipeline Approve All batch jobs (progress + retry).";
  try {
    await studioUpsertSetting(env, APPROVE_ALL_JOBS_SETTING, JSON.stringify(pruned), notes);
    return pruned;
  } catch (error) {
    const message = String(error?.message || error || "");
    if (!/INVALID_VALUE_FOR_COLUMN|Setting_Value|cannot accept the provided value/i.test(message)) {
      throw error;
    }
    pruned = pruneApproveAllJobStore(pruned, Date.now(), { maxChars: 20000, maxTerminalJobs: 0 });
    try {
      await studioUpsertSetting(env, APPROVE_ALL_JOBS_SETTING, JSON.stringify(pruned), notes);
      console.warn("approve-all job store pruned after Setting_Value reject", JSON.stringify(pruned).length);
      return pruned;
    } catch (retryError) {
      const activeOnly = emptyApproveAllJobStore();
      for (const jobId of Object.values(pruned.active_by_profile || {})) {
        if (pruned.jobs?.[jobId]) activeOnly.jobs[jobId] = pruned.jobs[jobId];
      }
      activeOnly.active_by_profile = { ...(pruned.active_by_profile || {}) };
      const emergency = pruneApproveAllJobStore(activeOnly, Date.now(), { maxChars: 20000, maxTerminalJobs: 0 });
      await studioUpsertSetting(env, APPROVE_ALL_JOBS_SETTING, JSON.stringify(emergency), notes);
      console.warn("approve-all job store reset to active-only after Setting_Value reject", retryError);
      return emergency;
    }
  }
}
/*__STUDIO_WORKER_END:studioSaveApproveAllJobStore__*/

export async function studioGetApproveAllJob(env, jobId) {
  const store = await studioLoadApproveAllJobStore(env);
  return store.jobs[String(jobId || "").trim()] || null;
}
/*__STUDIO_WORKER_END:studioGetApproveAllJob__*/

export async function studioPutApproveAllJob(env, job) {
  const store = await studioLoadApproveAllJobStore(env);
  store.jobs[job.id] = job;
  if (job.profile_id && (job.status === "queued" || job.status === "running")) {
    store.active_by_profile[job.profile_id] = job.id;
  } else if (job.profile_id && store.active_by_profile[job.profile_id] === job.id) {
    delete store.active_by_profile[job.profile_id];
  }
  await studioSaveApproveAllJobStore(env, store);
  return job;
}
/*__STUDIO_WORKER_END:studioPutApproveAllJob__*/

export function mapApproveAllEligibleSummary(record) {
  return {
    id: record.id,
    output_id: f(record, "Output_ID"),
    platform: f(record, "Platform"),
    format: f(record, "Format") || f(record, "Platform_Output_Type") || f(record, "Studio_Output_Type"),
  };
}

/*__STUDIO_WORKER_END:mapApproveAllEligibleSummary__*/

export async function studioLoadScheduleRegenJobStore(env) {
  const row = await studioSettingsByName(env, SCHEDULE_REGEN_JOBS_SETTING).catch(() => null);
  return pruneScheduleRegenJobStore(
    parseScheduleRegenJobStore(row?.fields?.Setting_Value || row?.fields?.Value || "{}"),
  );
}
/*__STUDIO_WORKER_END:studioLoadScheduleRegenJobStore__*/

export async function studioPutScheduleRegenJobStore(env, store, notes = "Schedule regeneration job store") {
  const pruned = pruneScheduleRegenJobStore(store);
  await studioUpsertSetting(env, SCHEDULE_REGEN_JOBS_SETTING, JSON.stringify(pruned), notes);
  return pruned;
}
/*__STUDIO_WORKER_END:studioPutScheduleRegenJobStore__*/

export async function studioGetScheduleRegenJob(env, jobId) {
  const store = await studioLoadScheduleRegenJobStore(env);
  return store.jobs[String(jobId || "").trim()] || null;
}
/*__STUDIO_WORKER_END:studioGetScheduleRegenJob__*/

export async function studioPutScheduleRegenJob(env, job) {
  const store = await studioLoadScheduleRegenJobStore(env);
  store.jobs[job.id] = { ...job, updated_at: new Date().toISOString() };
  if (job.profile_id && (job.status === "queued" || job.status === "running")) {
    store.active_by_scope[job.profile_id] = job.id;
  }
  if (job.status === "completed" || job.status === "failed") {
    for (const [scope, id] of Object.entries(store.active_by_scope)) {
      if (id === job.id) delete store.active_by_scope[scope];
    }
  }
  await studioPutScheduleRegenJobStore(env, store);
  return store.jobs[job.id];
}
/*__STUDIO_WORKER_END:studioPutScheduleRegenJob__*/

export function studioNormalizeRegenFilters(payload = {}) {
  const platforms = Array.isArray(payload.platforms)
    ? payload.platforms.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const outputTypes = Array.isArray(payload.output_types || payload.outputTypes)
    ? (payload.output_types || payload.outputTypes).map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const profiles = Array.isArray(payload.profiles)
    ? payload.profiles.map((row) => ({
      id: String(row?.id || "").trim(),
      name: String(row?.name || row?.profile || "").trim(),
    })).filter((row) => row.id || row.name)
    : [];
  return { platforms, outputTypes, profiles };
}
/*__STUDIO_WORKER_END:studioNormalizeRegenFilters__*/

export async function studioProcessScheduleRegenJobSlice(env, jobId, options = {}) {
  let job = await studioGetScheduleRegenJob(env, jobId);
  if (!job) return null;
  if (job.status === "completed" || job.status === "failed") return job;
  const horizonDays = maeNormalizeHorizonDays(job.horizon_days, await studioScheduleHorizonDays(env));
  job = { ...job, status: "running", updated_at: new Date().toISOString(), horizon_days: horizonDays };
  await studioPutScheduleRegenJob(env, job);

  const combos = Array.isArray(job.combinations) ? job.combinations.map((row) => ({ ...row })) : [];
  const start = Math.max(0, Number(job.cursor) || 0);
  // One combination per slice — sequential processing requirement.
  const index = combos.findIndex((row, i) => i >= start && String(row.status || "") === SCHEDULE_REGEN_STATUS.PENDING);
  if (index < 0) {
    const failed = combos.some((row) => row.status === SCHEDULE_REGEN_STATUS.FAILED);
    job = {
      ...job,
      combinations: combos,
      cursor: combos.length,
      status: failed ? "failed" : "completed",
      updated_at: new Date().toISOString(),
    };
    await studioPutScheduleRegenJob(env, job);
    return job;
  }

  const combo = { ...combos[index], status: SCHEDULE_REGEN_STATUS.PROCESSING, error: "" };
  combos[index] = combo;
  job = { ...job, combinations: combos, cursor: index, updated_at: new Date().toISOString() };
  await studioPutScheduleRegenJob(env, job);

  try {
    const profile = combo.profile_id
      ? await airtableFetch(env, "Content Profiles", combo.profile_id).catch(() => null)
      : null;
    const timeZone = studioScheduleTimeZoneForProfile(profile, MAE_DEFAULT_TIME_ZONE);
    const nowMs = Date.now();
    const horizonMs = nowMs + horizonDays * 24 * 60 * 60 * 1000;
    const platformWant = String(combo.platform || "").trim().toLowerCase();
    const typeWant = String(combo.output_type || "").trim().toLowerCase();
    const rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: STUDIO_OCCUPIED_LIST_LIMIT,
      sortField: "Scheduled_Post_Date",
      sortDirection: "asc",
      filterFormula: studioOccupiedFilterFormula(nowMs, profile),
      fields: ["Platform", "Scheduled_Post_Date", "YouTube_Scheduled_Publish_At", "Studio_Scheduled_At", "Publish_Status", "Studio_Output_Type", "Format", "Content_Profile", "Published_At", "Do_Not_Publish", "Output_Status", "Output_ID"],
    });
    const eligible = [];
    const protectedTimes = [];
    for (const row of rows || []) {
      if (!studioOccupiedRowMatchesProfile(row, profile)) continue;
      const platform = String(f(row, "Platform") || "").trim();
      const outputType = String(f(row, "Studio_Output_Type") || f(row, "Format") || "").trim();
      if (platform.toLowerCase() !== platformWant) continue;
      if (outputType.toLowerCase() !== typeWant) continue;
      const published = Boolean(String(f(row, "Published_At") || "").trim())
        || String(f(row, "Publish_Status") || "").trim() === "Published"
        || String(f(row, "Output_Status") || "").trim() === "Published";
      const ms = studioOccupiedMsFromRow(row, nowMs);
      if (published || Boolean(f(row, "Do_Not_Publish"))) {
        if (ms != null) protectedTimes.push(ms);
        continue;
      }
      const iso = String(f(row, "Scheduled_Post_Date") || f(row, "YouTube_Scheduled_Publish_At") || "").trim();
      const stamp = iso ? Date.parse(iso) : NaN;
      if (iso && Number.isFinite(stamp) && stamp <= nowMs) {
        protectedTimes.push(stamp);
        continue;
      }
      if (iso && Number.isFinite(stamp) && stamp > horizonMs) continue;
      eligible.push(row);
    }
    combo.total_posts = eligible.length;
    combo.completed_posts = 0;
    combo.rescheduled = 0;
    combos[index] = { ...combo };
    job = { ...job, combinations: combos, updated_at: new Date().toISOString() };
    await studioPutScheduleRegenJob(env, job);

    const plan = [];
    const reserved = protectedTimes.slice();
    for (const row of eligible) {
      const picked = maeScheduleNextSlot({
        timeZone,
        occupiedMs: reserved,
        horizonDays,
      });
      if (!picked.ok) {
        throw new HttpError(409, picked.error || `Capacity failure for ${combo.platform} ${combo.output_type}`);
      }
      plan.push({ id: row.id, iso: picked.iso, record: row });
      reserved.push(Date.parse(picked.iso));
    }

    // Apply the full combination plan before advancing — avoid partial reschedule.
    for (const entry of plan) {
      const fields = studioPublishScheduleFields(
        { scheduled_post_date: entry.iso, timezone: timeZone },
        entry.record,
        { occupiedMs: [], timeZone, forceWrite: true, exactOverride: true },
      );
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, entry.id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
      await studioSupabaseWriteThroughOutput(env, { id: entry.id, fields: { ...(entry.record.fields || {}), ...fields } }, "schedule-regen").catch(() => null);
      combo.completed_posts += 1;
      combo.rescheduled += 1;
      combos[index] = { ...combo };
      job = { ...job, combinations: combos, updated_at: new Date().toISOString() };
      await studioPutScheduleRegenJob(env, job);
    }

    combo.status = SCHEDULE_REGEN_STATUS.COMPLETED;
    combo.error = "";
  } catch (error) {
    combo.status = SCHEDULE_REGEN_STATUS.FAILED;
    combo.error = error?.message || "Schedule regeneration failed";
  }

  combos[index] = { ...combo };
  const nextPending = combos.findIndex((row, i) => i > index && String(row.status || "") === SCHEDULE_REGEN_STATUS.PENDING);
  const failed = combos.some((row) => row.status === SCHEDULE_REGEN_STATUS.FAILED);
  const more = nextPending >= 0;
  job = {
    ...job,
    combinations: combos,
    cursor: more ? nextPending : combos.length,
    status: more ? "running" : (failed ? "failed" : "completed"),
    updated_at: new Date().toISOString(),
  };
  studioInvalidateOccupiedScheduleCache();
  await studioPutScheduleRegenJob(env, job);
  return job;
}
/*__STUDIO_WORKER_END:studioProcessScheduleRegenJobSlice__*/

export async function startScheduleRegenJob(request, env, authorization, ctx = null) {
  const payload = await readJsonBody(request);
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(new URL(request.url), payload));
  const { platforms, outputTypes, profiles } = studioNormalizeRegenFilters(payload);
  if (!platforms.length || !outputTypes.length) {
    throw new HttpError(400, "Select at least one platform and one output type");
  }
  const horizonDays = maeNormalizeHorizonDays(
    payload.horizon_days ?? payload.horizonDays,
    await studioScheduleHorizonDays(env),
  );
  const store = await studioLoadScheduleRegenJobStore(env);
  const scope = String(profile?.id || "_all");
  const activeId = store.active_by_scope[scope];
  if (activeId && store.jobs[activeId] && ["queued", "running"].includes(store.jobs[activeId].status)) {
    return respond(request, env, {
      ok: false,
      error: "A schedule regeneration job is already running for this profile",
      job: summarizeScheduleRegenJob(store.jobs[activeId]),
    }, 409);
  }
  const profileList = profiles.length
    ? profiles
    : [{ id: profile?.id || "", name: String(f(profile, "Name") || f(profile, "Profile_Name") || "").trim() }];
  const job = createScheduleRegenJob({
    profileId: profile?.id || "",
    profiles: profileList,
    platforms,
    outputTypes,
    horizonDays,
    eligibleCount: Number(payload.eligible_count || payload.eligibleCount || 0) || 0,
  });
  store.jobs[job.id] = job;
  store.active_by_scope[scope] = job.id;
  await studioPutScheduleRegenJobStore(env, store);
  if (ctx?.waitUntil) {
    ctx.waitUntil(studioProcessScheduleRegenJobSlice(env, job.id).catch((error) => {
      console.warn("schedule regen slice failed", job.id, error);
    }));
  } else {
    await studioProcessScheduleRegenJobSlice(env, job.id);
  }
  return respond(request, env, {
    ok: true,
    job: summarizeScheduleRegenJob(job),
    message: scheduleRegenProgressMessage(job),
  });
}
/*__STUDIO_WORKER_END:startScheduleRegenJob__*/

export async function getScheduleRegenJobStatus(request, env, authorization) {
  const url = new URL(request.url);
  const jobId = String(url.searchParams.get("job_id") || "").trim();
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url, null));
  const store = await studioLoadScheduleRegenJobStore(env);
  let job = jobId ? store.jobs[jobId] : null;
  if (!job && profile?.id) {
    const activeId = store.active_by_scope[profile.id];
    job = activeId ? store.jobs[activeId] : null;
  }
  if (!job) {
    return respond(request, env, {
      ok: true,
      status: "idle",
      job_id: null,
      message: "No schedule regeneration job is running.",
    });
  }
  if (job.status === "queued" || job.status === "running") {
    job = await studioProcessScheduleRegenJobSlice(env, job.id) || job;
  }
  return respond(request, env, summarizeScheduleRegenJob(job));
}
/*__STUDIO_WORKER_END:getScheduleRegenJobStatus__*/

export async function getStudioScheduleSettings(request, env, authorization) {
  const horizonDays = await studioScheduleHorizonDays(env);
  return respond(request, env, {
    ok: true,
    scheduling_horizon_days: horizonDays,
    default_horizon_days: MAE_SUGGEST_HORIZON_DAYS,
    setting_name: MAE_SCHEDULE_HORIZON_SETTING,
    mae_windows: [...MAE_PRIORITY_SCHEDULE_WINDOWS],
    blackout: "20:00-03:30",
  });
}
/*__STUDIO_WORKER_END:getStudioScheduleSettings__*/

export async function putStudioScheduleSettings(request, env, authorization) {
  const payload = await readJsonBody(request);
  const horizonDays = maeNormalizeHorizonDays(
    payload.scheduling_horizon_days ?? payload.horizon_days ?? payload.horizonDays,
    MAE_SUGGEST_HORIZON_DAYS,
  );
  await studioUpsertSetting(
    env,
    MAE_SCHEDULE_HORIZON_SETTING,
    String(horizonDays),
    "Global scheduling horizon in days (MAE-first / balanced overflow)",
  );
  return respond(request, env, {
    ok: true,
    scheduling_horizon_days: horizonDays,
    message: `Scheduling horizon set to ${horizonDays} days. Existing schedules are unchanged; later approvals and regenerations use the new horizon.`,
  });
}

/*__STUDIO_WORKER_END:putStudioScheduleSettings__*/

export async function getApproveAllJobStatus(request, env, authorization) {
  const url = new URL(request.url);
  const jobId = String(url.searchParams.get("job_id") || "").trim();
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url, null));
  const store = await studioLoadApproveAllJobStore(env);
  let job = jobId ? store.jobs[jobId] : null;
  if (!job && profile?.id) {
    const activeId = store.active_by_profile[profile.id];
    job = activeId ? store.jobs[activeId] : null;
  }
  if (!job) {
    return respond(request, env, {
      ok: true,
      action: "approve_all_for_publishing",
      batch: true,
      status: "idle",
      job_id: null,
      message: "No Approve All batch is running.",
    });
  }
  if (job.profile_id && profile?.id && job.profile_id !== profile.id) {
    throw new HttpError(404, "Approve All job not found for this profile");
  }
  return respond(request, env, summarizeApproveAllJob(job));
}
/*__STUDIO_WORKER_END:getApproveAllJobStatus__*/

export async function studioFetchApproveAllRecordsByIds(env, ids = []) {
  const unique = [...new Set((ids || []).map((id) => String(id || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  if (!unique.length) return new Map();
  const byId = new Map();
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const formula = chunk.length === 1
      ? `RECORD_ID()="${chunk[0]}"`
      : `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: chunk.length,
      filterFormula: formula,
    }).catch(() => []);
    for (const row of rows || []) {
      if (row?.id) byId.set(row.id, row);
    }
    for (const id of chunk) {
      if (byId.has(id)) continue;
      try {
        byId.set(id, await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id));
      } catch {
        // Leave missing; caller marks failed.
      }
    }
  }
  return byId;
}
/*__STUDIO_WORKER_END:studioFetchApproveAllRecordsByIds__*/

export async function studioProcessApproveAllJobSlice(env, jobId, options = {}) {
  const maxSlices = Math.max(1, Math.min(24, Number(options.maxSlices || APPROVE_ALL_MAX_SLICES_PER_INVOKE)));
  let job = await studioGetApproveAllJob(env, jobId);
  if (!job) return null;
  if (job.status === "completed" || job.status === "failed") return job;

  const stamp = new Date().toISOString();
  job = { ...job, status: "running", updated_at: stamp, items: (job.items || []).map((item) => ({ ...item })) };
  // One Settings write at start + one at end. Rewriting APPROVE_ALL_JOBS after every
  // few rows was a major timeout driver under Airtable rate limits.
  await studioPutApproveAllJob(env, job);

  const profile = job.profile_id
    ? await airtableFetch(env, "Content Profiles", job.profile_id).catch(() => null)
    : null;
  const occupiedByLane = await studioOccupiedSchedulesOrEmpty(env, {
    excludeIds: (job.items || []).map((item) => item.id),
    profile,
  });
  const horizonDays = await studioScheduleHorizonDays(env).catch(() => MAE_SUGGEST_HORIZON_DAYS);
  // One profile timezone for the whole job — avoid per-row Airtable theme lookups.
  const timeZone = studioScheduleTimeZoneForProfile(profile, MAE_DEFAULT_TIME_ZONE);
  // Seed occupancy with schedules already booked by earlier approved items in this job.
  for (const item of job.items || []) {
    if (item.status !== "approved" || !item.scheduled_ms) continue;
    const platform = String(item.platform || "").trim();
    const format = String(item.format || "").trim();
    if (!platform) continue;
    const lane = maeScheduleLaneKey(platform, format) || platform.toLowerCase();
    (occupiedByLane[lane] ||= []).push(Number(item.scheduled_ms));
  }

  let slices = 0;
  let approvedThisInvoke = 0;
  const writeThroughQueue = [];
  while (slices < maxSlices) {
    const pending = nextPendingApproveAllItems(job, APPROVE_ALL_BATCH_SIZE);
    if (!pending.length) break;
    slices += 1;
    const recordsById = await studioFetchApproveAllRecordsByIds(env, pending.map((row) => row.id));
    for (const pendingItem of pending) {
      const item = (job.items || []).find((row) => row.id === pendingItem.id);
      if (!item || item.status !== "pending") continue;
      try {
        const record = recordsById.get(item.id);
        if (!record) throw new HttpError(404, "Output record not found");
        const publishStatus = String(f(record, "Publish_Status") || "").trim();
        const outputStatus = String(f(record, "Output_Status") || "").trim();
        const reviewStatus = String(f(record, "Review_Status") || "").trim();
        if (publishStatus === "Published" || outputStatus === "Published") {
          item.status = "skipped";
          item.error = null;
          Object.assign(item, mapApproveAllEligibleSummary(record));
          continue;
        }
        if (reviewStatus === "Approved" || outputStatus === "Approved for Publishing") {
          item.status = "skipped";
          item.error = null;
          Object.assign(item, mapApproveAllEligibleSummary(record));
          continue;
        }
        if (!studioOutputReadyForPublishApproval(record)) {
          const renderStatus = String(f(record, "Render_Status") || "").trim();
          const stillRendering = outputStatus === "In Production"
            || /^(?:Waiting in Render Queue|Ready for Render|Rendering|Queued)$/i.test(renderStatus);
          // Stories often land in the batch a moment before Remotion finishes.
          // Keep them pending so a later slice/cron retries instead of failing
          // the row and leaving 1–2 Stories alone on Needs Eyes.
          if (stillRendering) {
            item.error = `waiting_for_render:${renderStatus || outputStatus || "In Production"}`;
            continue;
          }
          throw new HttpError(409, "This output is not ready for publishing approval");
        }
        const platform = String(f(record, "Platform") || "").trim();
        const outputType = String(f(record, "Studio_Output_Type") || f(record, "Format") || "").trim();
        const occupiedMs = studioOccupiedForLane(occupiedByLane, platform, outputType);
        const rowSchedule = String(job.schedules?.[record.id] || "").trim();
        const markerIso = String(f(record, "Studio_Scheduled_At") || "").trim();
        const existingIso = String(
          f(record, "Scheduled_Post_Date") || f(record, "YouTube_Scheduled_Publish_At") || ""
        ).trim();
        // Keep a usable prefilled schedule when it does not collide with this job's
        // in-memory occupancy. Only re-pick when blank or conflicting.
        const existingMs = existingIso ? Date.parse(existingIso) : NaN;
        const existingOk = Number.isFinite(existingMs)
          && !maeScheduleConflicts(existingMs, occupiedMs || []);
        const recheckBestSlot = !markerIso && !existingOk;
        const extraSiblings = (job.items || [])
          .filter((entry) => entry.status === "approved" && entry.scheduled_ms && !/story/i.test(String(entry.format || "")))
          .map((entry) => ({
            platform: entry.platform,
            output_type: entry.format,
            scheduled_at: new Date(Number(entry.scheduled_ms)).toISOString(),
          }));
        const updated = await approveOutputRecordForPublishing(env, record, job.notes || "", new Date().toISOString(), {
          scheduled_post_date: markerIso
            ? (rowSchedule || undefined)
            : (existingOk ? existingIso : undefined),
          manual_schedule_override: Boolean(markerIso),
        }, {
          occupiedMs,
          extraSiblings,
          // Skip Airtable sibling fan-out; companions come from this job's approved mains.
          siblingRows: [],
          recheckBestSlot,
          skipOccupancyRefresh: true,
          writeThroughQueue,
          horizonDays,
          profile,
          timeZone,
        });
        const booked = studioScheduleMs(f(updated, "Scheduled_Post_Date")) ?? Date.now();
        const lane = maeScheduleLaneKey(platform, outputType) || platform.toLowerCase();
        (occupiedByLane[lane] ||= []).push(booked);
        Object.assign(item, mapApproveAllEligibleSummary(updated), {
          status: "approved",
          error: null,
          scheduled_ms: booked,
        });
        approvedThisInvoke += 1;
      } catch (error) {
        item.status = "failed";
        item.error = error?.message || "Approval failed";
      }
      job.updated_at = new Date().toISOString();
    }
    job = finalizeApproveAllJobStatus(job, new Date().toISOString());
    if (job.status === "completed" || job.status === "failed") break;
  }

  if (writeThroughQueue.length) {
    await Promise.all(writeThroughQueue.map((promise) => Promise.resolve(promise).catch((error) => {
      console.warn("approve-all supabase write-through failed", error);
    })));
  }
  studioInvalidateOccupiedScheduleCache();
  job = finalizeApproveAllJobStatus(job, new Date().toISOString());
  await studioPutApproveAllJob(env, job);
  return { job, approvedThisInvoke };
}
/*__STUDIO_WORKER_END:studioProcessApproveAllJobSlice__*/

export async function studioRunApproveAllJob(env, jobId, ctx = null) {
  const result = await studioProcessApproveAllJobSlice(env, jobId);
  const job = result?.job;
  if (!job) return null;
  if (result.approvedThisInvoke > 0 && ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(studioReconcileApprovedPublishes(env, { limit: 2 }).catch((error) => {
      console.warn("approve-all publish kickoff failed", error);
    }));
  }
  const counts = approveAllJobCounts(job);
  if (counts.pending_count > 0) {
    // Chain slices after the HTTP response returns. Cron also resumes queued/running
    // jobs if an isolate budget cut lands mid-batch.
    const continuation = studioRunApproveAllJob(env, jobId, null).catch((error) => {
      console.warn("approve-all batch continuation failed", jobId, error);
    });
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(continuation);
    } else {
      await continuation;
    }
  }
  return job;
}
/*__STUDIO_WORKER_END:studioRunApproveAllJob__*/

export async function studioResumeApproveAllJobs(env, ctx = null) {
  const store = await studioLoadApproveAllJobStore(env);
  const activeIds = Object.values(store.active_by_profile || {});
  const running = Object.values(store.jobs || {}).filter((job) => {
    if (!job) return false;
    if (activeIds.includes(job.id)) return true;
    return job.status === "queued" || job.status === "running";
  });
  const seen = new Set();
  for (const job of running) {
    if (!job?.id || seen.has(job.id)) continue;
    seen.add(job.id);
    const counts = approveAllJobCounts(job);
    if (counts.pending_count <= 0) {
      const finalized = finalizeApproveAllJobStatus(job, new Date().toISOString());
      await studioPutApproveAllJob(env, finalized);
      continue;
    }
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(studioRunApproveAllJob(env, job.id, ctx).catch((error) => {
        console.warn("approve-all cron resume failed", job.id, error);
      }));
    } else {
      await studioRunApproveAllJob(env, job.id, null).catch((error) => {
        console.warn("approve-all cron resume failed", job.id, error);
      });
    }
  }
  return seen.size;
}
/*__STUDIO_WORKER_END:studioResumeApproveAllJobs__*/

export async function approveAllOutputsForPublishing(request, env, authorization, ctx = null) {
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const note = phase6Text(payload?.notes, 10000);
  const stamp = new Date().toISOString();
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(null, payload));
  const action = String(payload?.action || "start").trim().toLowerCase();

  if (action === "retry") {
    const jobId = String(payload?.job_id || "").trim();
    if (!jobId) throw new HttpError(400, "job_id is required to retry Approve All failures");
    const existing = await studioGetApproveAllJob(env, jobId);
    if (!existing) throw new HttpError(404, "Approve All job not found");
    if (existing.profile_id && profile?.id && existing.profile_id !== profile.id) {
      throw new HttpError(404, "Approve All job not found for this profile");
    }
    const counts = approveAllJobCounts(existing);
    if (counts.failed_count <= 0) {
      return respond(request, env, {
        ...summarizeApproveAllJob(existing),
        message: "No failed approvals to retry.",
      });
    }
    const retried = resetFailedApproveAllItems(existing, stamp);
    await studioPutApproveAllJob(env, retried);
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(studioRunApproveAllJob(env, retried.id, ctx).catch((error) => {
        console.warn("approve-all retry failed", retried.id, error);
      }));
    } else {
      await studioRunApproveAllJob(env, retried.id, null);
    }
    return respond(request, env, {
      ...summarizeApproveAllJob(retried),
      accepted: true,
      message: `Retrying ${counts.failed_count} failed approval${counts.failed_count === 1 ? "" : "s"} in the background.`,
    });
  }

  const store = await studioLoadApproveAllJobStore(env);
  const activeId = profile?.id ? store.active_by_profile[profile.id] : null;
  const activeJob = activeId ? store.jobs[activeId] : null;
  if (activeJob && (activeJob.status === "queued" || activeJob.status === "running")) {
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(studioRunApproveAllJob(env, activeJob.id, ctx).catch(() => null));
    }
    return respond(request, env, {
      ...summarizeApproveAllJob(activeJob),
      accepted: true,
      already_running: true,
      message: approveAllProgressMessage(activeJob),
    });
  }

  // Enqueue only. Approval work + publish reconcile run in waitUntil / cron slices so
  // Studio stays responsive and a closed tab cannot strand half-approved batches.
  const requestedIds = Array.isArray(payload?.record_ids)
    ? [...new Set(payload.record_ids.map((id) => String(id || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))]
    : [];
  let eligibleSummaries = [];
  let skippedCount = 0;
  if (requestedIds.length) {
    // Pipeline already filtered Ready-for-Review ids. Do not N× GET those rows on the
    // HTTP request — under Airtable cooldown Promise.all either 429s every slot or
    // holds the browser on Approving… for >60s. Background slices re-fetch + gate.
    const clientItems = Array.isArray(payload?.items) ? payload.items : [];
    const byId = new Map();
    for (const item of clientItems) {
      const id = String(item?.id || "").trim();
      if (!/^rec[A-Za-z0-9]+$/.test(id)) continue;
      byId.set(id, item);
    }
    eligibleSummaries = requestedIds.map((id) => {
      const client = byId.get(id) || {};
      return {
        id,
        output_id: client.output_id ?? client.Output_ID ?? null,
        platform: client.platform ?? client.Platform ?? null,
        format: client.format ?? client.Format ?? client.platform_output_type ?? null,
      };
    });
  } else {
    const records = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 100,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: studioApproveAllCandidateFormula(profile),
    });
    const eligible = records.filter((record) => studioOutputReadyForPublishApproval(record));
    skippedCount = records.length - eligible.length;
    eligibleSummaries = eligible.map(mapApproveAllEligibleSummary);
  }
  if (!eligibleSummaries.length) {
    return respond(request, env, {
      ok: true,
      action: "approve_all_for_publishing",
      batch: true,
      status: "idle",
      approved_count: 0,
      failed_count: 0,
      skipped_count: skippedCount,
      message: "No outputs were ready to approve.",
    });
  }

  // Occupancy warm is best-effort and must not block enqueue under Airtable pressure.
  // Background slices call studioOccupiedSchedulesOrEmpty again before stamping times.
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(studioOccupiedSchedulesOrEmpty(env, {
      excludeIds: eligibleSummaries.map((record) => record.id),
      profile,
    }).catch(() => ({})));
  }

  const schedules = payload?.schedules && typeof payload.schedules === "object" ? payload.schedules : {};
  const job = buildApproveAllJob({
    jobId: newApproveAllJobId(),
    profileId: profile?.id || null,
    note,
    schedules,
    records: eligibleSummaries,
    stamp,
  });
  await studioPutApproveAllJob(env, job);
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(studioRunApproveAllJob(env, job.id, ctx).catch((error) => {
      console.warn("approve-all batch start failed", job.id, error);
    }));
  } else {
    await studioRunApproveAllJob(env, job.id, null);
  }
  return respond(request, env, {
    ...summarizeApproveAllJob(job),
    accepted: true,
    skipped_count: skippedCount,
    message: `Approve All started · 0 of ${eligibleSummaries.length} approved · 0 failed`,
  });
}
/*__STUDIO_WORKER_END:approveAllOutputsForPublishing__*/

export async function reviewOutputCreative(request, env, url, authorization, ctx = null) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const id = phase6RecordIdFromPath(url);
  const existing = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  const action = phase6Text(payload?.action, 50).toLowerCase();
  const note = phase6Text(payload?.notes, 10000);
  const existingNotes = String(f(existing, "Review_Notes") || "").trim();
  const stamp = new Date().toISOString();
  const doNotPublish = Boolean(f(existing, "Do_Not_Publish"));
  const productionPublishApprove = action === "approve_for_publishing" || ((action === "approve" || action === "approved") && !doNotPublish);
  if (productionPublishApprove) {
    const publishStatus = String(f(existing, "Publish_Status") || "").trim();
    const outputStatus = String(f(existing, "Output_Status") || "").trim();
    if (publishStatus === "Published" || outputStatus === "Published") {
      return respond(request, env, {
        ok: true,
        action: "approve_for_publishing",
        already_published: true,
        record: mapPhase6CreativeOutput(existing),
        handoff_state: "published",
        message: "This output is already published.",
      });
    }
    if (String(f(existing, "Review_Status") || "").trim() === "Approved" || outputStatus === "Approved for Publishing") {
      const held = !studioPublishCanDispatchNow(existing);
      if (!held && ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(studioReconcileApprovedPublishes(env, { limit: 1 }).catch((error) => {
          console.warn("approve republish kickoff failed", existing?.id, error);
        }));
      }
      return respond(request, env, {
        ok: true,
        action: "approve_for_publishing",
        already_approved: true,
        record: mapPhase6CreativeOutput(existing),
        handoff_state: "approved_for_publishing",
        message: held
          ? "Already approved. Studio will publish at the scheduled time."
          : "Already approved. Studio is starting the publisher from the approved queue.",
      });
    }
    try {
      const updated = await approveOutputRecordForPublishing(env, existing, note, stamp, payload);
      const held = !studioPublishCanDispatchNow(updated);
      // Facebook Reel/Story publish can take a minute. Return as soon as the
      // row is approved so the review click cannot time out into a fake 500.
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(studioDispatchApprovedPublishAndSchedule(null, env, updated).catch((error) => {
          console.warn("approve publish kickoff failed", updated?.id, error);
        }));
        return respond(request, env, {
          ok: true,
          action: "approve_for_publishing",
          record: mapPhase6CreativeOutput(updated),
          handoff_state: "approved_for_publishing",
          publish_dispatch: held
            ? { accepted: true, detail: "scheduled-hold", held_until: studioPublishHeldUntilIso(updated) }
            : { accepted: true, detail: "queued" },
          message: held
            ? "Approved. Studio will publish at the scheduled time."
            : "Approved for publishing. Instagram and Facebook will auto-publish; TikTok will be created as a draft.",
        });
      }
      const dispatch = await studioDispatchApprovedPublishAndSchedule(ctx, env, updated);
      const heldAfter = dispatch?.skipped === "scheduled-hold";
      return respond(request, env, {
        ok: true,
        action: "approve_for_publishing",
        record: mapPhase6CreativeOutput(updated),
        handoff_state: "approved_for_publishing",
        publish_dispatch: {
          target: dispatch?.target || dispatch?.skipped || null,
          ok: dispatch?.ok !== false,
          detail: studioPublishDispatchNote(dispatch),
          held_until: dispatch?.held_until || null,
        },
        message: heldAfter
          ? "Approved. Studio will publish at the scheduled time."
          : dispatch?.ok === false
          ? "Approved for publishing, but the publisher handoff did not go through. Studio will retry it automatically within a few minutes."
          : "Approved for publishing. Instagram and Facebook will auto-publish; TikTok will be created as a draft.",
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error("approve_for_publishing failed", existing?.id, error);
      return respond(request, env, {
        ok: false,
        action: "approve_for_publishing",
        error: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  }
  if (!doNotPublish && phase6ProductionMixAction(action)) {
    phase6AssertProductionAudioMixAllowed(existing);
    const mapped = mapPhase6CreativeOutput(existing);
    const audioFields = phase6AudioMixFieldsFromPayload(payload, mapped);
    const mixFields = {
      ...audioFields,
      Review_Status: "Changes Requested",
      Output_Status: "In Production",
      Publish_Status: "Not Ready",
      Render_Status: "Ready for Render",
      Review_Decision_At: stamp,
      Review_Notes: [existingNotes, note, `Studio review mix applied at ${stamp}. Music ${audioFields.Music_Volume}, voiceover ${audioFields.Voiceover_Volume}.`].filter(Boolean).join("\n\n"),
    };
    const updated = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
      method: "PATCH",
      body: JSON.stringify({ fields: mixFields, typecast: true }),
    });
    const sharedMix = {
      ...studioPickSharedAudioMixFields(mixFields),
      ...studioSharedRenderRerenderFields(),
      Review_Status: mixFields.Review_Status,
      Output_Status: mixFields.Output_Status,
      Publish_Status: mixFields.Publish_Status,
    };
    const sharedSiblings = await studioPatchSiblingVerticalShortOutputs(env, updated, sharedMix);
    const slides = await phase6SlidesForOutput(env, updated);
    return respond(request, env, {
      ok: true,
      action: "apply_audio_mix",
      preview_rerender_prepared: true,
      shared_vertical_short_siblings: sharedSiblings.length,
      record: mapPhase6CreativeOutput(updated),
      slides: phase6SlidesWithTitleRenderInput(updated, slides),
      handoff: phase6CreativeHandoffStatus(updated, slides),
      handoff_state: "render_ready",
      message: sharedSiblings.length > 1
        ? "Mix saved for all Reels, Shorts, and TikTok on this post. Studio is rendering one shared preview for every platform."
        : "Mix saved. Studio is rendering a new preview. Approve stays locked until that preview is ready.",
    });
  }
  if (!doNotPublish) {
    throw new HttpError(409, "Phase 6 preview edits remain limited to Do_Not_Publish outputs");
  }
  let fields;
  let renderPackage = null;
  let voiceAutomation = null;
  if (action === "approve" || action === "approved") {
    const slidesForLock = await phase6SlidesForOutput(env, existing);
    const settings = phase6ParseJson(f(existing, "Studio_Creative_Settings_JSON"), {}) || {};
    const lockView = phase6TitleLockView(existing, slidesForLock);
    settings.title_lock = {
      schema: "studio-title-edit-v1",
      locked: true,
      version: lockView.version,
      overlay_identity: lockView.overlay_identity,
      approved_at: stamp,
    };
    fields = {
      Review_Status: "Approved",
      Review_Decision_At: stamp,
      Review_Notes: [existingNotes, note, `Studio Phase 6 preview approved (review-only) at ${stamp}.`].filter(Boolean).join("\n\n"),
      Do_Not_Publish: true,
      Studio_Creative_Settings_JSON: JSON.stringify(settings),
    };
  } else if (["changes", "changes_requested", "revise", "revision"].includes(action)) {
    // Persist the handoff boundary BEFORE any long-running voice work. This is the durable
    // revision marker used to distinguish the old rendered preview from the preview that
    // must be produced for this exact changes request, even if the browser disconnects.
    const requestedRecord = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Review_Status: "Changes Requested",
          Output_Status: "In Production",
          Publish_Status: "Not Ready",
          Review_Decision_At: stamp,
          Do_Not_Publish: true,
        },
        typecast: true,
      }),
    });
    try {
      voiceAutomation = await phase6AdvanceVoicePrepShort(env, requestedRecord);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Automatic voice prep failed";
      fields = {
        Review_Status: "Changes Requested",
        Output_Status: "In Production",
        Publish_Status: "Not Ready",
        Review_Decision_At: stamp,
        Review_Notes: [existingNotes, note, `Studio Phase 6 automatic voice prep failed at ${stamp}: ${message}`].filter(Boolean).join("\n\n"),
        Do_Not_Publish: true,
      };
      const failedRecord = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
      return respond(request, env, {
        ok: true,
        action,
        preview_rerender_prepared: false,
        voice_prep_pending: true,
        voice_prep_failed: true,
        handoff_state: "voice_prep_failed",
        record: mapPhase6CreativeOutput(failedRecord),
        message: `Creative changes were saved, but automatic voice prep failed: ${message}`,
      });
    }

    if (!voiceAutomation.completed) {
      const pendingVoicePrep = Array.isArray(voiceAutomation.pending_voice_slides) ? voiceAutomation.pending_voice_slides : [];
      const pendingNames = pendingVoicePrep.map((x) => x.name || x.id).join(", ");
      fields = {
        Review_Status: "Changes Requested",
        Output_Status: "In Production",
        Publish_Status: "Not Ready",
        Review_Decision_At: stamp,
        Review_Notes: [existingNotes, note, `Studio Phase 6 automatic voice prep started at ${stamp}. Waiting for rerender handoff after voice generation for: ${pendingNames || "pending slides"}.`].filter(Boolean).join("\n\n"),
        Do_Not_Publish: true,
      };
      const updatedPending = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
      return respond(request, env, {
        ok: true,
        action,
        preview_rerender_prepared: false,
        voice_prep_pending: true,
        voice_prep_automation_started: Boolean(voiceAutomation.triggered),
        handoff_state: "voice_prep_running",
        pending_voice_slides: pendingVoicePrep,
        scenario_id: voiceAutomation.scenario_id,
        execution_ids: voiceAutomation.execution_ids,
        execution_status: voiceAutomation.execution_status,
        record: mapPhase6CreativeOutput(updatedPending),
        message: pendingNames
          ? `Creative changes were saved and automatic voice prep was started for: ${pendingNames}. Rerender handoff will be available once those slide voiceovers finish.`
          : "Creative changes were saved and automatic voice prep is still running. Rerender handoff will be available once voice prep finishes.",
      });
    }

    // Build and validate the complete P020 render package BEFORE changing lifecycle status.
    // This keeps a failed prep from leaving the record falsely ready for R4.
    renderPackage = await phase6BuildPreviewRenderPackage(env, requestedRecord);
    fields = {
      Review_Status: "Changes Requested",
      Output_Status: "In Production",
      Publish_Status: "Not Ready",
      Render_Status: "Ready for Render",
      Render_Clip_List_JSON: JSON.stringify(renderPackage.clips),
      Render_Total_Frames: renderPackage.totalFrames,
      Composition_ID: renderPackage.composition,
      Output_Filename: renderPackage.filename,
      Creative_Render_Manifest_JSON: JSON.stringify(renderPackage.manifest),
      Music_URL: renderPackage.musicUrl,
      Review_Decision_At: stamp,
      Review_Notes: [existingNotes, note, `Studio Phase 6 changes requested and preview rerender prepared at ${stamp}.`, voiceAutomation?.triggered ? `Automatic voice prep completed in scenario ${voiceAutomation.scenario_id} execution ${(voiceAutomation.execution_ids || []).join(",") || "n/a"}.` : ""].filter(Boolean).join("\n\n"),
      Do_Not_Publish: true,
    };
  } else {
    throw new HttpError(400, "Review action must be approve, apply_audio_mix, or changes_requested");
  }
  const updated = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
  // Keep review/save requests bounded. Once the render package is prepared, the browser
  // continuation loop advances R4/R5 in short resumable pulses rather than holding this request open.
  const renderAutomation = null;
  const finalRecord = updated;
  return respond(request, env, {
    ok: true,
    action,
    preview_rerender_prepared: Boolean(renderPackage),
    render_total_frames: renderPackage?.totalFrames || null,
    output_filename: renderPackage?.filename || null,
    record: mapPhase6CreativeOutput(finalRecord),
    handoff_state: action.startsWith("approve") ? "approved_review_only" : (renderPackage ? "render_ready" : (renderAutomation?.handoff_state || "render_prep_needed")),
    render_automation: renderAutomation,
    voice_prep_automation_started: action.startsWith("approve") ? false : Boolean(voiceAutomation?.triggered),
    message: action.startsWith("approve")
      ? "Preview approved in review-only mode. Do_Not_Publish remains enabled."
      : (renderPackage
        ? "Changes requested. Voice prep is complete and the preview package is prepared; Studio is continuing the rerender automatically and publishing remains blocked."
        : "Changes requested. Studio is continuing the resumable voice/render handoff automatically; publishing remains blocked."),
  });
}
/*__STUDIO_WORKER_END:reviewOutputCreative__*/

export async function getRecordRoute(request, env, url, tableId, kind) {
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!/^rec[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, "Invalid Airtable record ID");
  const record = await airtableFetch(env, tableId, id);
  const mapped = kind === "idea" ? mapIdea(record) : mapContent(record);
  return respond(request, env, { ok: true, record: mapped });
}
/*__STUDIO_WORKER_END:getRecordRoute__*/

export async function getOutputRoute(request, env, url) {
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!/^rec[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, "Invalid Airtable record ID");
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  const jobs = await loadStudioProductionJobsForOutputs(env, [record]);
  return respond(request, env, {
    ok: true,
    record: mapOutput(record, jobs.get(record)),
  });
}
/*__STUDIO_WORKER_END:getOutputRoute__*/

export function studioOverviewScheduledCounts(mappedOutputs) {
  const platformOrder = ["Facebook", "Instagram", "TikTok", "YouTube"];
  const counts = Object.fromEntries(platformOrder.map((p) => [p, 0]));
  for (const row of mappedOutputs || []) {
    const platform = String(row?.platform || "").trim();
    if (!(platform in counts)) continue;
    const publishStatus = String(row?.publish_status || "");
    const youtubePrivacy = String(row?.youtube_privacy_status || "").trim().toLowerCase();
    const youtubeNotPublic = platform === "YouTube" && /^(private|unlisted)$/.test(youtubePrivacy);
    const published = !youtubeNotPublic && (Boolean(row?.published_at) || /published/i.test(publishStatus));
    const scheduled = Boolean(row?.scheduled_post_date || row?.youtube_scheduled_publish_at || row?.studio_scheduled_at)
      || /scheduled|ready to publish|publishing/i.test(publishStatus)
      || youtubeNotPublic;
    if (!published && scheduled) counts[platform] += 1;
  }
  return counts;
}
/*__STUDIO_WORKER_END:studioOverviewScheduledCounts__*/

export function studioOverviewOperationalMetrics(mappedOutputs, ideas) {
  const attentionStates = new Set(["Failed", "Retry Pending", "Manual Action Required"]);
  const manualAction = mappedOutputs.filter((o) => o.studio_state === "Manual Action Required").length;
  const failed = mappedOutputs.filter((o) => o.studio_state === "Failed").length;
  const awaitingApproval = mappedOutputs.filter((o) => {
    const state = String(o.studio_state || "").trim();
    if (state !== "Ready for Review" && state !== "Awaiting Approval") return false;
    if (o.do_not_publish) return false;
    const notes = `${o.output_notes || ""}\n${o.production_notes || ""}`;
    if (/origin=az-finished-video/i.test(notes)) return false;
    if (/az-auto-queue=1/i.test(notes) && /ez-input=finished-video/i.test(notes)) return false;
    return true;
  }).length;
  const ideasNotInProduction = (ideas || []).filter((idea) => !(
    Boolean(idea?.promoted_content_record_id)
    || (Array.isArray(idea?.content_item_links) && idea.content_item_links.length > 0)
  )).length;
  return {
    manual_action_required: manualAction,
    failed_outputs: failed,
    awaiting_approval: awaitingApproval,
    ideas_not_in_production: ideasNotInProduction,
    attention_outputs: mappedOutputs.filter((o) => attentionStates.has(o.studio_state)).length,
    published_outputs: mappedOutputs.filter((o) => o.studio_state === "Published").length,
    active_outputs: mappedOutputs.filter((o) => !["Published", "Skipped", "Failed"].includes(o.studio_state)).length,
    ideas: (ideas || []).length,
    platform_outputs: mappedOutputs.length,
  };
}
/*__STUDIO_WORKER_END:studioOverviewOperationalMetrics__*/

export function studioOverviewBudgetError(label = "overview") {
  return new HttpError(429, `Airtable cooling down (${label} budget); try again shortly`);
}
/*__STUDIO_WORKER_END:studioOverviewBudgetError__*/

export async function raceStudioOverviewBudget(promise, budgetMs, label = "overview") {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(studioOverviewBudgetError(label)), Math.max(250, Number(budgetMs) || 0));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/*__STUDIO_WORKER_END:raceStudioOverviewBudget__*/

export function studioProfilesOverviewAuthKey(profiles = []) {
  return (profiles || []).map((profile) => String(profile?.id || "").trim()).filter(Boolean).sort().join(",");
}
/*__STUDIO_WORKER_END:studioProfilesOverviewAuthKey__*/

export function studioProfilesOverviewCombinedFormula(profiles = []) {
  const formulas = (profiles || []).map((profile) => contentProfileFilterFormula(profile)).filter(Boolean);
  if (!formulas.length) return null;
  if (formulas.length === 1) return formulas[0];
  return `OR(${formulas.join(",")})`;
}
/*__STUDIO_WORKER_END:studioProfilesOverviewCombinedFormula__*/

export function studioOverviewRowMatchesProfile(row, profile) {
  if (!profile?.id) return true;
  if (studioOccupiedRowMatchesProfile(row, profile)) return true;
  const name = String(f(profile, "Profile_Name") || "").trim();
  if (!name) return false;
  const joined = arrayOrEmpty(f(row, "Content_Profile"))
    .map((item) => (typeof item === "string" ? item : String(item?.name || item?.id || "")))
    .join(" ");
  return joined.includes(name);
}
/*__STUDIO_WORKER_END:studioOverviewRowMatchesProfile__*/

export async function buildStudioProfilesOverviewRows(env, profiles) {
  const formula = studioProfilesOverviewCombinedFormula(profiles);
  // Fetch every matching row; the previous global 800/300 caps silently excluded
  // older profiles. listRecords follows Airtable offsets until exhausted.
  // Treat reaching the safety ceiling as incomplete, never as a valid snapshot.
  const outputRows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: STUDIO_PROFILES_OVERVIEW_OUTPUT_LIMIT,
    filterFormula: formula,
    sortField: "Output_ID",
    sortDirection: "desc",
    fields: OUTPUT_LIST_FIELDS,
  });
  if (outputRows.length >= STUDIO_PROFILES_OVERVIEW_OUTPUT_LIMIT) {
    throw new Error("Profiles overview outputs exceeded complete-scan safety ceiling");
  }
  const ideaRows = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
    limit: STUDIO_PROFILES_OVERVIEW_IDEA_LIMIT,
    sortField: "Create_Date",
    filterFormula: formula,
  });
  if (ideaRows.length >= STUDIO_PROFILES_OVERVIEW_IDEA_LIMIT) {
    throw new Error("Profiles overview ideas exceeded complete-scan safety ceiling");
  }
  return (profiles || []).map((profile) => {
    const profileOutputs = (outputRows || []).filter((row) => studioOverviewRowMatchesProfile(row, profile));
    const profileIdeas = (ideaRows || []).filter((row) => studioOverviewRowMatchesProfile(row, profile));
    // Skip produce-job hydration — overview only needs studio_state + schedule fields.
    const mappedOutputs = profileOutputs.map((row) => mapOutput(row, null));
    const ideas = profileIdeas.map(mapIdea);
    const metrics = studioOverviewOperationalMetrics(mappedOutputs, ideas);
    const mapped = mapStudioContentProfile(profile);
    return {
      id: profile.id,
      name: mapped.city_label || mapped.name || profile.id,
      city_label: mapped.city_label || "",
      scheduled: studioOverviewScheduledCounts(mappedOutputs),
      manual: metrics.manual_action_required,
      failed: metrics.failed_outputs,
      approval: metrics.awaiting_approval,
      ideas: metrics.ideas_not_in_production,
      metrics,
    };
  });
}
/*__STUDIO_WORKER_END:buildStudioProfilesOverviewRows__*/

export function isAirtableCoolingError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || "");
  return status === 429 || /cooling down|rate.?limit|too many requests/i.test(message);
}
/*__STUDIO_WORKER_END:isAirtableCoolingError__*/

export function respondProfilesOverviewSoft(request, env, { records = [], cached = false, stale = false, cooling = false, refreshing = false, snapshot = false } = {}) {
  // Never HTTP 429 the home overview — cold isolates + Airtable cooldown used to
  // paint a red banner on every Studio open even when the selected-profile feed
  // could still recover. Soft 200 keeps the shell usable.
  return respond(request, env, {
    ok: true,
    cached: Boolean(cached),
    stale: Boolean(stale),
    cooling: Boolean(cooling),
    refreshing: Boolean(refreshing),
    snapshot: Boolean(snapshot),
    records: Array.isArray(records) ? records : [],
  });
}
/*__STUDIO_WORKER_END:respondProfilesOverviewSoft__*/

export function rememberProfilesOverviewSnapshot(snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  if (!rows.length) return null;
  studioProfilesOverviewCache.rows = rows;
  studioProfilesOverviewCache.at = Number(snapshot.at) || 0;
  studioProfilesOverviewCache.authKey = String(snapshot.authKey || "");
  studioProfilesOverviewCache.complete = snapshot.complete === true;
  return {
    rows,
    at: studioProfilesOverviewCache.at,
    authKey: studioProfilesOverviewCache.authKey,
    complete: studioProfilesOverviewCache.complete,
  };
}
/*__STUDIO_WORKER_END:rememberProfilesOverviewSnapshot__*/

export async function readStudioProfilesOverviewSnapshot(env) {
  const cache = studioProfilesOverviewCache;
  if (cache.rows?.length) {
    return { rows: cache.rows, at: cache.at, authKey: cache.authKey, complete: cache.complete === true };
  }
  if (!env?.STUDIO_MEDIA?.get) return null;
  try {
    const object = await env.STUDIO_MEDIA.get(STUDIO_PROFILES_OVERVIEW_SNAPSHOT_KEY);
    if (!object) return null;
    return rememberProfilesOverviewSnapshot(await object.json());
  } catch (error) {
    console.warn("profiles overview snapshot read failed", error);
    return null;
  }
}
/*__STUDIO_WORKER_END:readStudioProfilesOverviewSnapshot__*/

export async function writeStudioProfilesOverviewSnapshot(env, rows, authKey) {
  const snapshot = rememberProfilesOverviewSnapshot({ rows, authKey, at: Date.now(), complete: true });
  if (!snapshot || !env?.STUDIO_MEDIA?.put) return snapshot;
  try {
    await env.STUDIO_MEDIA.put(
      STUDIO_PROFILES_OVERVIEW_SNAPSHOT_KEY,
      JSON.stringify(snapshot),
      { httpMetadata: { contentType: "application/json" } },
    );
  } catch (error) {
    console.warn("profiles overview snapshot write failed", error);
  }
  return snapshot;
}
/*__STUDIO_WORKER_END:writeStudioProfilesOverviewSnapshot__*/

export async function refreshStudioProfilesOverviewSnapshot(env, authorization) {
  const cache = studioProfilesOverviewCache;
  if (cache.inflight) return cache.inflight;
  if (airtableCooldownWaitMs() > AIRTABLE_SLOT_FAIL_FAST_MS) return cache.rows || [];
  const run = (async () => {
    const profiles = authorization
      ? await resolveAuthorizedContentProfiles(env, authorization)
      : (await listContentProfileRecords(env)).filter((record) => Boolean(f(record, "Active")));
    if (!profiles?.length) return cache.rows || [];
    const rows = await buildStudioProfilesOverviewRows(env, profiles);
    await writeStudioProfilesOverviewSnapshot(env, rows, studioProfilesOverviewAuthKey(profiles));
    return rows;
  })().finally(() => {
    if (cache.inflight === run) cache.inflight = null;
  });
  cache.inflight = run;
  return run;
}
/*__STUDIO_WORKER_END:refreshStudioProfilesOverviewSnapshot__*/

export function scheduleStudioProfilesOverviewRefresh(ctx, env, authorization) {
  const pending = refreshStudioProfilesOverviewSnapshot(env, authorization);
  ctx?.waitUntil?.(pending.catch((error) => {
    console.warn("profiles overview background refresh failed", error);
  }));
  return pending;
}
/*__STUDIO_WORKER_END:scheduleStudioProfilesOverviewRefresh__*/

export async function profilesOverview(request, env, authorization, ctx) {
  const snapshot = await readStudioProfilesOverviewSnapshot(env);
  const age = snapshot?.at ? Date.now() - snapshot.at : Infinity;
  if (snapshot?.rows?.length && snapshot.complete === true && age < STUDIO_PROFILES_OVERVIEW_CACHE_MS) {
    return respondProfilesOverviewSoft(request, env, {
      records: snapshot.rows,
      cached: true,
      snapshot: true,
    });
  }
  if (snapshot?.rows?.length) {
    const cooling = airtableCooldownWaitMs() > AIRTABLE_SLOT_FAIL_FAST_MS;
    if (!cooling) scheduleStudioProfilesOverviewRefresh(ctx, env, authorization);
    return respondProfilesOverviewSoft(request, env, {
      records: snapshot.rows,
      cached: true,
      stale: true,
      cooling,
      refreshing: !cooling,
      snapshot: true,
    });
  }

  const cache = studioProfilesOverviewCache;
  const coolMs = airtableCooldownWaitMs();
  if (coolMs > AIRTABLE_SLOT_FAIL_FAST_MS) {
    return respondProfilesOverviewSoft(request, env, { records: [], cooling: true });
  }
  if (cache.inflight) {
    try {
      const rows = await raceStudioOverviewBudget(
        cache.inflight,
        STUDIO_PROFILES_OVERVIEW_BUILD_BUDGET_MS,
        "overview-build",
      );
      return respondProfilesOverviewSoft(request, env, { records: rows, cached: true, snapshot: true });
    } catch (error) {
      if (cache.rows?.length) {
        return respondProfilesOverviewSoft(request, env, { records: cache.rows, stale: true, cooling: isAirtableCoolingError(error), snapshot: true });
      }
      if (isAirtableCoolingError(error)) {
        return respondProfilesOverviewSoft(request, env, { records: [], cooling: true, refreshing: true });
      }
      throw error;
    }
  }
  try {
    const profiles = await raceStudioOverviewBudget(
      resolveAuthorizedContentProfiles(env, authorization),
      STUDIO_PROFILES_OVERVIEW_RESOLVE_BUDGET_MS,
      "overview-resolve",
    );
    cache.authKey = studioProfilesOverviewAuthKey(profiles);
    cache.inflight = buildStudioProfilesOverviewRows(env, profiles)
      .then((rows) => writeStudioProfilesOverviewSnapshot(env, rows, cache.authKey).then(() => rows))
      .finally(() => {
        if (cache.inflight) cache.inflight = null;
      });
    ctx?.waitUntil?.(cache.inflight.catch((error) => {
      console.warn("profiles overview snapshot build failed", error);
    }));
    const rows = await raceStudioOverviewBudget(
      cache.inflight,
      STUDIO_PROFILES_OVERVIEW_BUILD_BUDGET_MS,
      "overview-build",
    );
    return respondProfilesOverviewSoft(request, env, { records: rows, snapshot: true });
  } catch (error) {
    if (cache.rows?.length) {
      return respondProfilesOverviewSoft(request, env, { records: cache.rows, stale: true, cooling: isAirtableCoolingError(error), snapshot: true });
    }
    if (isAirtableCoolingError(error)) {
      return respondProfilesOverviewSoft(request, env, { records: [], cooling: true });
    }
    throw error;
  }
}
/*__STUDIO_WORKER_END:profilesOverview__*/

export async function dashboard(request, env, url, authorization) {
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
  const formula = contentProfileFilterFormula(profile);
  const leanOverview = url.searchParams.get("all_profiles_overview") === "1";
  const ideas = (await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, { limit: 100, sortField: "Create_Date", filterFormula: formula })).map(mapIdea);
  const outputRows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 200,
    filterFormula: formula,
    sortField: "Output_ID",
    sortDirection: "desc",
    fields: leanOverview ? OUTPUT_LIST_FIELDS : [],
  });
  if (leanOverview) {
    const mappedOutputs = outputRows.map((row) => mapOutput(row, null));
    const metrics = studioOverviewOperationalMetrics(mappedOutputs, ideas);
    return respond(request, env, {
      ok: true,
      lean: true,
      metrics: {
        ...metrics,
        content_items: 0,
      },
      ideas: [],
      content: [],
      outputs: mappedOutputs,
      recent_outputs: mappedOutputs.slice(0, 12),
      profile: mapStudioContentProfile(profile),
    });
  }
  const contentRows = await listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, { limit: 100, sortField: "Created_At", filterFormula: formula });
  const outputsByContent = new Map();
  for (const output of outputRows) {
    const contentId = studioFirstLinkedId(f(output, "Content_Item"));
    if (!contentId) continue;
    if (!outputsByContent.has(contentId)) outputsByContent.set(contentId, []);
    outputsByContent.get(contentId).push(output);
  }
  const content = contentRows.map((row) => mapContent(row, outputsByContent.get(row.id) || []));
  const outputJobs = await loadStudioProductionJobsForOutputs(env, outputRows);
  const mappedOutputs = outputRows.map((row) => mapOutput(row, outputJobs.get(row)));
  const metrics = studioOverviewOperationalMetrics(mappedOutputs, ideas);

  return respond(request, env, {
    ok: true,
    metrics: {
      ...metrics,
      content_items: content.length,
    },
    ideas,
    content,
    outputs: mappedOutputs,
    recent_outputs: mappedOutputs.slice(0, 12),
    profile: mapStudioContentProfile(profile),
  });
}

/*__STUDIO_WORKER_END:dashboard__*/

export function respondHtml(request, env, html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(request, env),
    },
  });
}
/*__STUDIO_WORKER_END:respondHtml__*/

export async function listPipelineSettingsForAdmin(env) {
  const records = [];
  let offset = null;
  let pages = 0;
  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (offset) params.set("offset", offset);
    const body = await airtableFetch(env, "Pipeline Settings", `?${params.toString()}`);
    if (Array.isArray(body.records)) records.push(...body.records);
    offset = body?.offset ? String(body.offset) : null;
    pages += 1;
    if (pages >= 20) break;
  } while (offset);
  return records;
}
/*__STUDIO_WORKER_END:listPipelineSettingsForAdmin__*/

export function pipelineSettingValue(records, name) {
  const match = records.find((record) =>
    String(record?.fields?.Setting_Name || "").trim() === name &&
    Boolean(record?.fields?.Active)
  );
  return match ? String(match.fields.Setting_Value || "").trim() : "";
}

/*__STUDIO_WORKER_END:pipelineSettingValue__*/

export function repairJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}
/*__STUDIO_WORKER_END:repairJson__*/

export function repairIsoMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : NaN;
}
/*__STUDIO_WORKER_END:repairIsoMs__*/

export function repairString(value, name, max = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new HttpError(400, `${name} is required and must be <= ${max} characters`);
  return text;
}
/*__STUDIO_WORKER_END:repairString__*/

export function repairRecordIds(value, name) {
  const ids = Array.isArray(value) ? value.map((v) => String(v || "").trim()).filter(Boolean) : [];
  if (!ids.length) throw new HttpError(400, `${name} must contain at least one exact Airtable record ID`);
  if (ids.length > 20 || ids.some((id) => !/^rec[A-Za-z0-9]{14}$/.test(id))) {
    throw new HttpError(400, `${name} contains an invalid Airtable record ID`);
  }
  return [...new Set(ids)];
}
/*__STUDIO_WORKER_END:repairRecordIds__*/

export function repairLeaseState(record) {
  const contract = repairJson(record?.fields?.Request_JSON, {}) || {};
  const state = repairJson(record?.fields?.Result_JSON, {}) || {};
  return {
    record_id: record?.id || null,
    contract,
    state,
    status: String(record?.fields?.Status || ""),
    scenario_id: Number(record?.fields?.Scenario_ID || contract.scenario_id || 0),
    test_run_id: String(contract.test_run_id || record?.fields?.Correlation_ID || ""),
    lease_id: String(contract.lease_id || ""),
    expires_at: String(contract.expires_at || ""),
    operations_used: Number(state.operations_used || 0),
    runs_used: Number(state.runs_used || 0),
  };
}
/*__STUDIO_WORKER_END:repairLeaseState__*/

export async function repairLeaseRecords(env, scenarioId = null) {
  const formulas = ['{Status}="Processing"', `FIND("${REPAIR_LEASE_NOTE_PREFIX}", {Notes}&"")>0`];
  if (Number.isInteger(Number(scenarioId)) && Number(scenarioId) > 0) formulas.push(`{Scenario_ID}=${Number(scenarioId)}`);
  return listRecords(env, REPAIR_LEASE_TABLE_ID, {
    limit: 50,
    sortField: "Requested_At",
    sortDirection: "desc",
    filterFormula: `AND(${formulas.join(",")})`,
  });
}
/*__STUDIO_WORKER_END:repairLeaseRecords__*/

export async function repairClearR4LeaseToken(env, lease) {
  if (Number(lease?.scenario_id) !== 5556716) return { cleared: 0 };
  const token = String(lease?.lease_id || lease?.contract?.lease_id || "");
  if (!token) return { cleared: 0 };
  const allowed = Array.isArray(lease?.contract?.allowed_platform_output_record_ids) ? lease.contract.allowed_platform_output_record_ids : [];
  let cleared = 0;
  for (const recordId of allowed) {
    const record = await airtableFetch(env, "Platform Outputs", recordId);
    if (String(record?.fields?.Studio_Render_Request_ID || "") !== token) continue;
    await airtableFetch(env, "Platform Outputs", recordId, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Studio_Render_Request_ID: "" }, typecast: true }),
    });
    cleared += 1;
  }
  return { cleared };
}
/*__STUDIO_WORKER_END:repairClearR4LeaseToken__*/

export async function repairCloseLease(env, lease, status, resultPatch = {}) {
  if (!lease?.record_id) return;
  await repairClearR4LeaseToken(env, lease);
  const state = { ...(lease.state || {}), ...resultPatch, state: status, closed_at: new Date().toISOString() };
  await airtableFetch(env, REPAIR_LEASE_TABLE_ID, lease.record_id, {
    method: "PATCH",
    body: JSON.stringify({ fields: {
      Status: status === "failed" ? "Failed" : "Succeeded",
      Result_JSON: JSON.stringify(state),
      Completed_At: new Date().toISOString(),
      Error_Message: status === "failed" ? String(resultPatch.error || "Repair lease failed") : "",
    } }),
  });
}
/*__STUDIO_WORKER_END:repairCloseLease__*/

export async function repairVerifyOutputRecord(env, recordId, allowPublicPublish = false, expectedTestRunId = null) {
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId);
  if (!record?.id) throw new HttpError(404, `Platform Output ${recordId} not found`);
  const fields = record.fields || {};
  const durableTestRunId = String(fields.Test_Run_ID || "").trim();
  if (expectedTestRunId !== null) {
    const expected = String(expectedTestRunId || "").trim();
    if (!expected) throw new HttpError(409, `Test execution requires a non-empty test_run_id for Platform Output ${recordId}`);
    if (!durableTestRunId) throw new HttpError(409, `Platform Output ${recordId} is not tagged with a durable Test_Run_ID`);
    if (durableTestRunId !== expected) {
      throw new HttpError(409, `Platform Output ${recordId} Test_Run_ID does not match this test_run_id`);
    }
  }
  if (!allowPublicPublish && fields.Do_Not_Publish !== true) {
    throw new HttpError(409, `Test mode requires Do_Not_Publish on Platform Output ${recordId}`);
  }
  return {
    id: record.id,
    output_id: fields.Output_ID ?? null,
    platform: fields.Platform?.name || fields.Platform || null,
    do_not_publish: fields.Do_Not_Publish === true,
    test_run_id: durableTestRunId || null,
    output_status: fields.Output_Status?.name || fields.Output_Status || null,
  };
}
/*__STUDIO_WORKER_END:repairVerifyOutputRecord__*/

export async function repairSweepExpiredLeases(env, scenarioId = null) {
  const records = await repairLeaseRecords(env, scenarioId);
  const results = [];
  const now = Date.now();
  for (const record of records) {
    const lease = repairLeaseState(record);
    const expiry = repairIsoMs(lease.expires_at);
    const exhausted = lease.operations_used >= Number(lease.contract.max_operations || 0) || lease.runs_used >= Number(lease.contract.max_runs || 0);
    if (!(Number.isFinite(expiry) && expiry <= now) && !exhausted) continue;
    let stopped = null;
    let error = null;
    try { stopped = await phase6StopScenarioVerified(env, lease.scenario_id, 2); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    await repairCloseLease(env, lease, error || stopped?.inactive !== true ? "failed" : "expired", {
      reason: exhausted ? "budget-exhausted" : "lease-expired",
      scenario_stopped: stopped?.inactive === true,
      stop_result: stopped || null,
      error,
    });
    results.push({ lease_id: lease.lease_id, scenario_id: lease.scenario_id, exhausted, stopped: stopped?.inactive === true, error });
  }
  return results;
}

/*__STUDIO_WORKER_END:repairSweepExpiredLeases__*/

export async function repairVerifyContentItemRecord(env, recordId, expectedTestRunId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(recordId || ""))) throw new HttpError(400, "Invalid Content Item record ID");
  const record = await airtableFetch(env, "Content Items", recordId);
  const fields = record?.fields || {};
  const durableTestRunId = String(fields.Test_Run_ID || "").trim();
  if (!durableTestRunId || durableTestRunId !== String(expectedTestRunId || "").trim()) {
    throw new HttpError(403, `Content Item ${recordId} Test_Run_ID does not exactly match the repair lease`);
  }
  return record;
}
/*__STUDIO_WORKER_END:repairVerifyContentItemRecord__*/

export async function repairAcquireLease(env, input, authorization) {
  const testRunId = repairString(input.test_run_id, "test_run_id");
  const leaseId = repairString(input.lease_id, "lease_id");
  const scenarioId = Number(input.scenario_id);
  const maxRuns = Number(input.max_runs);
  const maxOperations = Number(input.max_operations);
  const expiresAt = repairString(input.expires_at, "expires_at");
  const allowedOutputs = Array.isArray(input.allowed_platform_output_record_ids) && input.allowed_platform_output_record_ids.length
    ? repairRecordIds(input.allowed_platform_output_record_ids, "allowed_platform_output_record_ids")
    : [];
  const allowedContentItems = Array.isArray(input.allowed_content_item_record_ids) && input.allowed_content_item_record_ids.length
    ? repairRecordIds(input.allowed_content_item_record_ids, "allowed_content_item_record_ids")
    : [];
  const denyFixtures = Array.isArray(input.deny_fixture_record_ids) ? input.deny_fixture_record_ids.map(String) : [];
  const allowPublicPublish = input.allow_public_publish === true;

  if (!Number.isInteger(scenarioId) || !REPAIR_CONTROL_SCENARIOS.has(scenarioId)) throw new HttpError(403, `Scenario ${scenarioId} is not repair-control allowlisted`);
  if (!Number.isInteger(maxRuns) || maxRuns < 1 || maxRuns > 5) throw new HttpError(400, "max_runs must be an integer from 1 to 5");
  if (!Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > 50) throw new HttpError(400, "max_operations must be an integer from 1 to 50");
  const expiryMs = repairIsoMs(expiresAt);
  const delta = expiryMs - Date.now();
  if (!Number.isFinite(expiryMs) || delta < REPAIR_LEASE_MIN_MS || delta > REPAIR_LEASE_MAX_MS) {
    throw new HttpError(400, "expires_at must be between 1 and 30 minutes in the future");
  }
  if (!allowedOutputs.length && !allowedContentItems.length) throw new HttpError(400, "A repair lease requires at least one exact resource allowlist");
  if (denyFixtures.some((id) => allowedOutputs.includes(id) || allowedContentItems.includes(id))) throw new HttpError(400, "deny fixture cannot also be allowlisted");
  if (allowPublicPublish) {
    if (allowedContentItems.length || allowedOutputs.length !== 1 || !repairString(input.explicit_publish_platform, "explicit_publish_platform", 40)) {
      throw new HttpError(400, "Public publish test mode requires exactly one output and explicit_publish_platform");
    }
  }

  const existingLeases = (await repairLeaseRecords(env, scenarioId)).map(repairLeaseState).filter((l) => l.lease_id !== leaseId);
  const nowMs = Date.now();
  const staleLeases = existingLeases.filter((l) => {
    const expiry = repairIsoMs(l.expires_at);
    const exhausted = l.operations_used >= Number(l.contract.max_operations || 0) || l.runs_used >= Number(l.contract.max_runs || 0);
    return (Number.isFinite(expiry) && expiry <= nowMs) || exhausted;
  });
  const activeOverlaps = existingLeases.filter((l) => !staleLeases.includes(l));
  if (activeOverlaps.length) throw new HttpError(409, `Scenario ${scenarioId} already has an active repair lease`);
  if (staleLeases.length) {
    const staleWithRuns = staleLeases.filter((l) => l.runs_used > 0);
    let stopped = null;
    if (staleWithRuns.length) {
      try { stopped = await phase6StopScenarioVerified(env, scenarioId, 2); }
      catch (e) { throw new HttpError(502, `Could not verify scenario ${scenarioId} inactive before replacing stale repair lease: ${e instanceof Error ? e.message : String(e)}`); }
      if (stopped?.inactive !== true) throw new HttpError(502, `Could not verify scenario ${scenarioId} inactive before replacing stale repair lease`);
    }
    for (const stale of staleLeases) {
      await repairCloseLease(env, stale, "expired", {
        reason: stale.runs_used > 0 ? "lease-expired-before-reacquire-scenario-stopped" : "lease-expired-before-reacquire-no-runs",
        scenario_stopped: stale.runs_used > 0 ? stopped?.inactive === true : null,
        replacement_lease_id: leaseId,
        replacement_test_run_id: testRunId,
      });
    }
  }

  const outputs = [];
  for (const id of allowedOutputs) outputs.push(await repairVerifyOutputRecord(env, id, allowPublicPublish, testRunId));
  const contentItems = [];
  for (const id of allowedContentItems) contentItems.push(await repairVerifyContentItemRecord(env, id, testRunId));

  const contract = {
    kind: REPAIR_LEASE_NOTE_PREFIX,
    lease_id: leaseId,
    test_run_id: testRunId,
    scenario_id: scenarioId,
    expires_at: new Date(expiryMs).toISOString(),
    max_runs: maxRuns,
    max_operations: maxOperations,
    allowed_platform_output_record_ids: allowedOutputs,
    allowed_content_item_record_ids: allowedContentItems,
    deny_fixture_record_ids: denyFixtures,
    allow_public_publish: allowPublicPublish,
    explicit_publish_platform: allowPublicPublish ? String(input.explicit_publish_platform) : null,
  };
  const now = new Date().toISOString();
  const created = await airtableFetch(env, REPAIR_LEASE_TABLE_ID, "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: {
      Command_ID: `REPAIR-LEASE-${Date.now()}-${scenarioId}`,
      Action: "GET_SCENARIO",
      Scenario_ID: scenarioId,
      Scenario_Name: `Repair activation lease ${scenarioId}`,
      Request_JSON: JSON.stringify(contract),
      Write_Approved: false,
      Activation_Approved: false,
      Status: "Processing",
      Result_JSON: JSON.stringify({ kind: REPAIR_LEASE_NOTE_PREFIX, state: "active", operations_used: 0, runs_used: 0, acquired_at: now }),
      Requested_At: now,
      Started_At: now,
      Requested_By: String(authorization?.email || "studio-admin"),
      Correlation_ID: testRunId,
      Notes: `${REPAIR_LEASE_NOTE_PREFIX} ${leaseId}; exact resource allowlist enforced; standalone RUN disabled; only stage-specific guarded pulses permitted.`,
    } }], typecast: true }),
  });
  const record = created?.records?.[0];
  if (!record?.id) throw new HttpError(502, "Could not persist repair lease");
  return { lease: repairLeaseState(record), outputs, content_items: contentItems };
}
/*__STUDIO_WORKER_END:repairAcquireLease__*/

export async function repairFindLease(env, input) {
  const scenarioId = Number(input.scenario_id);
  const leaseId = repairString(input.lease_id, "lease_id");
  const testRunId = repairString(input.test_run_id, "test_run_id");
  if (!Number.isInteger(scenarioId) || !REPAIR_CONTROL_SCENARIOS.has(scenarioId)) throw new HttpError(403, `Scenario ${scenarioId} is not repair-control allowlisted`);
  const exactMarker = `${REPAIR_LEASE_NOTE_PREFIX} ${leaseId};`;
  const formula = `AND({Status}="Processing",{Scenario_ID}=${scenarioId},{Correlation_ID}=${JSON.stringify(testRunId)},FIND(${JSON.stringify(exactMarker)}, {Notes}&"")>0)`;
  const params = new URLSearchParams();
  params.set("pageSize", "2");
  params.set("maxRecords", "2");
  params.set("filterByFormula", formula);
  params.set("sort[0][field]", "Requested_At");
  params.set("sort[0][direction]", "desc");
  const body = await airtableFetch(env, REPAIR_LEASE_TABLE_ID, `?${params.toString()}`);
  const candidates = (Array.isArray(body?.records) ? body.records : []).map(repairLeaseState);
  const lease = candidates.find((l) => l.lease_id === leaseId && l.test_run_id === testRunId && l.scenario_id === scenarioId);
  if (!lease) throw new HttpError(409, "Active repair lease not found or does not match test_run_id");
  if (repairIsoMs(lease.expires_at) <= Date.now()) throw new HttpError(409, "Repair lease has expired");
  return lease;
}
/*__STUDIO_WORKER_END:repairFindLease__*/

export async function repairReserveBudget(env, lease, { operationCost = 1, runCost = 0, action = "operation" } = {}) {
  const maxOperations = Number(lease.contract.max_operations || 0);
  const maxRuns = Number(lease.contract.max_runs || 0);
  const nextOps = lease.operations_used + operationCost;
  const nextRuns = lease.runs_used + runCost;
  if (nextOps > maxOperations || nextRuns > maxRuns) {
    let stop = null;
    try { stop = await phase6StopScenarioVerified(env, lease.scenario_id, 2); } catch {}
    await repairCloseLease(env, lease, "expired", { reason: "budget-exhausted-before-operation", attempted_action: action, scenario_stopped: stop?.inactive === true });
    throw new HttpError(409, "Repair lease operation/run budget exhausted; scenario shutdown requested");
  }
  lease.operations_used = nextOps;
  lease.runs_used = nextRuns;
  lease.state = { ...(lease.state || {}), state: "active", operations_used: nextOps, runs_used: nextRuns, last_action: action, updated_at: new Date().toISOString() };
  await airtableFetch(env, REPAIR_LEASE_TABLE_ID, lease.record_id, {
    method: "PATCH",
    body: JSON.stringify({ fields: { Result_JSON: JSON.stringify(lease.state) } }),
  });
  return lease;
}

/*__STUDIO_WORKER_END:repairReserveBudget__*/

export function repairScenarioModuleById(flow, moduleId) {
  for (const node of flow || []) {
    if (Number(node?.id) === Number(moduleId)) return node;
    for (const route of node?.routes || []) {
      const found = repairScenarioModuleById(route?.flow || [], moduleId);
      if (found) return found;
    }
  }
  return null;
}
/*__STUDIO_WORKER_END:repairScenarioModuleById__*/

export function repairScenarioModuleIds(flow, out = []) {
  for (const node of flow || []) {
    out.push(Number(node?.id));
    for (const route of node?.routes || []) repairScenarioModuleIds(route?.flow || [], out);
  }
  return out;
}
/*__STUDIO_WORKER_END:repairScenarioModuleIds__*/

export async function repairReadMakeBlueprint(env, scenarioId) {
  const raw = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: "GET" });
  const wrapped = raw?.blueprint ?? raw?.response?.blueprint ?? raw;
  const blueprint = typeof wrapped === "string" ? repairJson(wrapped, null) : wrapped;
  if (!blueprint || typeof blueprint !== "object" || Array.isArray(blueprint)) throw new HttpError(502, `Make scenario ${scenarioId} returned an invalid blueprint`);
  return { blueprint, original_payload: typeof wrapped === "string" ? wrapped : JSON.stringify(blueprint) };
}
/*__STUDIO_WORKER_END:repairReadMakeBlueprint__*/

export function repairP1Eligibility(fields) {
  const contentStatus = String(fields?.Content_Status || "");
  const scriptStatus = String(fields?.Script_Status || "");
  const linkedProfile = Array.isArray(fields?.Content_Profile) ? fields.Content_Profile.length > 0 : Boolean(fields?.Content_Profile);
  return (
    ["Idea Approved", "Ready for Script"].includes(contentStatus) &&
    linkedProfile &&
    Boolean(String(fields?.Content_Title || "").trim()) &&
    Boolean(String(fields?.Idea_Summary || "").trim()) &&
    fields?.Do_Not_Produce !== true &&
    !String(fields?.Script || "").trim() &&
    !String(fields?.Caption || "").trim() &&
    ["", "Not Started", "Ready"].includes(scriptStatus)
  );
}
/*__STUDIO_WORKER_END:repairP1Eligibility__*/

export async function repairWaitForP1Package(env, recordId, expectedTestRunId, timeoutMs = 90000) {
  const started = Date.now();
  let last = await airtableFetch(env, "Content Items", recordId);
  while (Date.now() - started < timeoutMs) {
    const fields = last?.fields || {};
    if (String(fields.Test_Run_ID || "") !== expectedTestRunId) throw new HttpError(409, "P1 target durable Test_Run_ID changed during pulse");
    if (String(fields.Script_Status || "") === "Generated" && String(fields.Script || "").trim()) {
      return { matched: true, record: last };
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
    last = await airtableFetch(env, "Content Items", recordId);
  }
  return { matched: false, record: last };
}
/*__STUDIO_WORKER_END:repairWaitForP1Package__*/

export async function repairPulseP1TestSelector(env, lease, input, action) {
  const P1_SCENARIO_ID = STUDIO_P1_SCENARIO_ID;
  if (lease.scenario_id !== P1_SCENARIO_ID) throw new HttpError(403, `pulse_p1_test_selector is limited to P1 scenario ${P1_SCENARIO_ID}`);
  const recordId = repairString(input.content_item_record_id, "content_item_record_id", 32);
  const allowlist = Array.isArray(lease.contract.allowed_content_item_record_ids) ? lease.contract.allowed_content_item_record_ids : [];
  if (!allowlist.includes(recordId)) throw new HttpError(403, `Content Item ${recordId} is outside this test_run_id allowlist`);
  if ((lease.contract.deny_fixture_record_ids || []).includes(recordId)) throw new HttpError(403, `Content Item ${recordId} is an explicit denial fixture`);

  const target = await repairVerifyContentItemRecord(env, recordId, lease.test_run_id);
  if (!repairP1Eligibility(target?.fields || {})) throw new HttpError(409, `Content Item ${recordId} does not satisfy the P1 package eligibility contract`);

  if (pipelineStageBackend(env, "P1").mode === "python") {
    await repairReserveBudget(env, lease, { operationCost: 30, runCost: 1, action });
    let failure = null;
    let observed = null;
    try {
      try {
        await item4PulseP1Python(env, {
          contentItemId: recordId,
          testRunId: lease.test_run_id,
          maxRuns: 1,
        });
      } catch (error) {
        console.warn("P1 python pulse returned before Airtable wait", error);
      }
      observed = await repairWaitForP1Package(env, recordId, lease.test_run_id, 90000);
      if (!observed?.matched) throw new HttpError(502, `P1 did not generate a package for exact Content Item ${recordId} within 90 seconds`);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    if (failure) {
      try { await repairCloseLease(env, lease, "failed", { reason: "p1-python-pulse-failed", error: failure }); } catch {}
      throw new HttpError(502, failure);
    }
    try { await repairCloseLease(env, lease, "released", { reason: "p1-python-one-run-complete", exact_content_item_record_id: recordId, operations_used: lease.operations_used, runs_used: lease.runs_used }); } catch {}
    const finalFields = observed?.record?.fields || {};
    return {
      action,
      lease,
      backend: "python",
      target_record_id: recordId,
      exact_selector: true,
      observed_script_status: String(finalFields.Script_Status || ""),
      script_generated: Boolean(String(finalFields.Script || "").trim()),
      durable_test_run_id: String(finalFields.Test_Run_ID || ""),
      scenario_started: false,
      scenario_stopped: true,
      selector_restored: true,
      schedule_preserved: true,
    };
  }

  const beforeState = await phase6ScenarioState(env, P1_SCENARIO_ID);
  if (beforeState.isActive) throw new HttpError(409, "P1 must be OFF before Test Mode selector pulse");
  const originalScheduling = JSON.stringify(beforeState?.scenario?.scheduling || {});
  const scheduling = beforeState?.scenario?.scheduling || {};
  if (String(scheduling.type || "") !== "on-demand") {
    throw new HttpError(409, `P1 canonical on-demand schedule is not present: ${originalScheduling}`);
  }
  if (beforeState?.scenario?.hookId != null) throw new HttpError(409, "P1 unexpectedly has a webhook identity; refusing selector pulse");

  const read = await repairReadMakeBlueprint(env, P1_SCENARIO_ID);
  const originalBlueprint = read.blueprint;
  const originalModuleIds = repairScenarioModuleIds(originalBlueprint?.flow || []).sort((a, b) => a - b);
  const root = repairScenarioModuleById(originalBlueprint?.flow || [], 1);
  const mapper = root?.mapper || {};
  if (!root || root.module !== "airtable:ActionSearchRecords") throw new HttpError(409, "P1 Module 1 is not the expected Airtable Search Records selector");
  if (String(mapper.table || "") !== "Content Items" || String(mapper.view || "") !== "P1 - Ready for Package Generation") {
    throw new HttpError(409, "P1 Module 1 table/view contract drifted");
  }
  if (String(mapper.formula || "") !== "{Test_Run_ID}=BLANK()" || String(mapper.maxRecords || "") !== "10") {
    throw new HttpError(409, `P1 production selector is not at the verified baseline; formula=${String(mapper.formula || "")}, maxRecords=${String(mapper.maxRecords || "")}`);
  }

  const patched = JSON.parse(JSON.stringify(originalBlueprint));
  const patchedRoot = repairScenarioModuleById(patched?.flow || [], 1);
  patchedRoot.mapper.formula = `AND(RECORD_ID()=${JSON.stringify(recordId)},{Test_Run_ID}=${JSON.stringify(lease.test_run_id)})`;
  patchedRoot.mapper.maxRecords = "1";

  await repairReserveBudget(env, lease, { operationCost: 30, runCost: 1, action });

  let patchedLive = false;
  let started = false;
  let stop = null;
  let restored = false;
  let failure = null;
  let observed = null;
  try {
    await phase6MakeApiJson(env, `/scenarios/${P1_SCENARIO_ID}?confirmed=true`, {
      method: "PATCH",
      body: JSON.stringify({ blueprint: JSON.stringify(patched) }),
    });
    patchedLive = true;

    const verifyPatched = await repairReadMakeBlueprint(env, P1_SCENARIO_ID);
    const verifyRoot = repairScenarioModuleById(verifyPatched.blueprint?.flow || [], 1);
    if (String(verifyRoot?.mapper?.formula || "") !== String(patchedRoot.mapper.formula) || String(verifyRoot?.mapper?.maxRecords || "") !== "1") {
      throw new HttpError(502, "P1 exact Test Mode selector did not verify live before activation");
    }
    const patchedIds = repairScenarioModuleIds(verifyPatched.blueprint?.flow || []).sort((a, b) => a - b);
    if (JSON.stringify(patchedIds) !== JSON.stringify(originalModuleIds)) throw new HttpError(502, "P1 module topology changed while installing exact selector");

    await phase6SetScenarioActive(env, P1_SCENARIO_ID, true);
    started = true;
    try { await phase6RunScenario(env, P1_SCENARIO_ID); } catch (error) {
      if (!phase6RunAlreadyActiveError(error)) throw error;
    }
    observed = await repairWaitForP1Package(env, recordId, lease.test_run_id, 90000);
    if (!observed?.matched) throw new HttpError(502, `P1 did not generate a package for exact Content Item ${recordId} within 90 seconds`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    try { stop = await phase6StopScenarioVerified(env, P1_SCENARIO_ID, 4); } catch (error) {
      if (!failure) failure = error instanceof Error ? error.message : String(error);
    }
    if (patchedLive) {
      try {
        await phase6MakeApiJson(env, `/scenarios/${P1_SCENARIO_ID}?confirmed=true`, {
          method: "PATCH",
          body: JSON.stringify({ blueprint: read.original_payload }),
        });
        const verifyRestore = await repairReadMakeBlueprint(env, P1_SCENARIO_ID);
        const restoredRoot = repairScenarioModuleById(verifyRestore.blueprint?.flow || [], 1);
        const restoredIds = repairScenarioModuleIds(verifyRestore.blueprint?.flow || []).sort((a, b) => a - b);
        const finalState = await phase6ScenarioState(env, P1_SCENARIO_ID);
        restored = (
          String(restoredRoot?.mapper?.formula || "") === "{Test_Run_ID}=BLANK()" &&
          String(restoredRoot?.mapper?.maxRecords || "") === "10" &&
          JSON.stringify(restoredIds) === JSON.stringify(originalModuleIds) &&
          finalState.isActive === false &&
          JSON.stringify(finalState?.scenario?.scheduling || {}) === originalScheduling &&
          finalState?.scenario?.hookId == null
        );
        if (!restored && !failure) failure = "P1 production blueprint/state did not verify fully restored";
      } catch (error) {
        restored = false;
        if (!failure) failure = error instanceof Error ? error.message : String(error);
      }
    }

    if (stop?.inactive !== true && !failure) failure = "P1 did not verify inactive after pulse";
    if (failure || !restored) {
      try { await repairCloseLease(env, lease, "failed", { reason: "p1-test-selector-pulse-failed", scenario_stopped: stop?.inactive === true, selector_restored: restored, error: failure || "restore verification failed" }); } catch {}
    } else {
      try { await repairCloseLease(env, lease, "released", { reason: "p1-test-selector-one-run-complete", scenario_stopped: true, selector_restored: true, exact_content_item_record_id: recordId, operations_used: lease.operations_used, runs_used: lease.runs_used }); } catch {}
    }
  }

  if (failure || !restored) throw new HttpError(502, failure || "P1 Test Mode selector pulse failed restoration verification");
  const finalFields = observed?.record?.fields || {};
  return {
    action,
    lease,
    target_record_id: recordId,
    exact_selector: true,
    observed_script_status: String(finalFields.Script_Status || ""),
    script_generated: Boolean(String(finalFields.Script || "").trim()),
    durable_test_run_id: String(finalFields.Test_Run_ID || ""),
    scenario_started: started,
    scenario_stopped: stop?.inactive === true,
    selector_restored: restored,
    schedule_preserved: true,
  };
}

/*__STUDIO_WORKER_END:repairPulseP1TestSelector__*/

export function repairItem7CanonicalMaxRecords(scenarioId) {
  const sid = Number(scenarioId);
  if (sid === 5557966) return "10";
  if (sid === 5565333) return "5";
  if (sid === 5576363) return "10";
  return "1";
}
/*__STUDIO_WORKER_END:repairItem7CanonicalMaxRecords__*/

export function repairItem7StageCheckpoint(scenarioId, fields = {}) {
  if (scenarioId === 5569495) {
    return {
      complete: String(fields.Asset_Selection_Status || "") === "Selected" && Boolean(String(fields.Selected_Assets_JSON || "").trim()) && Number(fields.Selected_Clip_Count || 0) > 0,
      failed: String(fields.Asset_Selection_Status || "") === "Failed",
      summary: { asset_selection_status: fields.Asset_Selection_Status || null, selected_clip_count: Number(fields.Selected_Clip_Count || 0), selected_assets_present: Boolean(String(fields.Selected_Assets_JSON || "").trim()) },
    };
  }
  if (scenarioId === 5557966) {
    return {
      complete: String(fields.Render_Status || "") === "Ready for Render" && Boolean(String(fields.Composition_ID || "").trim()) && Boolean(String(fields.Output_Filename || "").trim()) && Boolean(String(fields.Render_Clip_List_JSON || "").trim()) && Number(fields.Render_Total_Frames || 0) > 0,
      failed: String(fields.Render_Status || "") === "Failed",
      summary: { render_status: fields.Render_Status || null, composition_id: fields.Composition_ID || null, output_filename: fields.Output_Filename || null, render_total_frames: Number(fields.Render_Total_Frames || 0), render_clip_list_present: Boolean(String(fields.Render_Clip_List_JSON || "").trim()) },
    };
  }
  if (scenarioId === 5565333) {
    return {
      complete: String(fields.Render_Status || "") === "Rendered" && Boolean(String(fields.Final_File_URL || "").trim()) && Boolean(String(fields.Final_File_ID || "").trim()),
      // R5 deliberately pre-marks Failed while Drive upload is in progress, so timeout/cycle exhaustion is the terminal failure signal.
      failed: false,
      summary: { render_status: fields.Render_Status || null, final_file_url: fields.Final_File_URL || null, final_file_id: fields.Final_File_ID || null, studio_preview_url: fields.Studio_Preview_URL || null, studio_preview_r2_key: fields.Studio_Preview_R2_Key || null },
    };
  }
  if (scenarioId === 5576363) {
    return {
      complete: String(fields.Review_Status || "") === "Review Sent" && Boolean(String(fields.Review_Email_Sent_At || "").trim()),
      failed: false,
      summary: { review_status: fields.Review_Status || null, review_email_sent_at: fields.Review_Email_Sent_At || null },
    };
  }
  throw new HttpError(403, `Scenario ${scenarioId} is not an Item 7 exact-stage scenario`);
}
/*__STUDIO_WORKER_END:repairItem7StageCheckpoint__*/

export async function repairReadItem7Output(env, recordId, testRunId) {
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId);
  if (!record?.id) throw new HttpError(404, `Platform Output ${recordId} not found`);
  const fields = record.fields || {};
  if (String(fields.Test_Run_ID || "").trim() !== testRunId) throw new HttpError(409, `Platform Output ${recordId} escaped Item 7 Test_Run_ID isolation`);
  if (fields.Do_Not_Publish !== true) throw new HttpError(409, `Platform Output ${recordId} must remain Do_Not_Publish=true during Item 7`);
  return record;
}
/*__STUDIO_WORKER_END:repairReadItem7Output__*/

export async function repairWaitItem7Checkpoint(env, scenarioId, recordId, testRunId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  // ITEM7_SUBREQUEST_RESERVE_V4: keep the long R2/R3/RR1 wait window, but cap
  // checkpoint reads so the same Worker invocation always has capacity left for
  // exact execution stop, scenario deactivation, selector rollback, verification,
  // and lease close. Six 15s reads cover the 90s window instead of ~15 6s reads.
  const pollMs = 15000;
  while (Date.now() < deadline) {
    const record = await repairReadItem7Output(env, recordId, testRunId);
    const checkpoint = repairItem7StageCheckpoint(scenarioId, record.fields || {});
    last = { record, checkpoint };
    if (checkpoint.complete || checkpoint.failed) return last;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remaining)));
  }
  return last;
}
/*__STUDIO_WORKER_END:repairWaitItem7Checkpoint__*/

export async function repairPulseItem7ExactStage(env, lease, input, action) {
  const scenarioId = Number(input.scenario_id);
  const config = ITEM7_EXACT_STAGE_CONFIG[scenarioId];
  if (!config || lease.scenario_id !== scenarioId) throw new HttpError(403, `pulse_item7_exact_stage is not authorized for scenario ${scenarioId}`);
  const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
  const allowlist = Array.isArray(lease.contract.allowed_platform_output_record_ids) ? lease.contract.allowed_platform_output_record_ids : [];
  if (!allowlist.includes(recordId)) throw new HttpError(403, `Platform Output ${recordId} is outside this Item 7 lease allowlist`);
  if ((lease.contract.deny_fixture_record_ids || []).includes(recordId)) throw new HttpError(403, `Platform Output ${recordId} is an explicit denial fixture`);
  await repairVerifyOutputRecord(env, recordId, false, lease.test_run_id);

  const requestedCycles = Math.max(1, Number(input.max_cycles || 1));
  const maxCycles = Math.min(config.max_cycles, requestedCycles);
  if (!Number.isInteger(maxCycles) || maxCycles < 1) throw new HttpError(400, "max_cycles must be a positive integer");

  const beforeState = await phase6ScenarioState(env, scenarioId);
  if (beforeState.isActive) throw new HttpError(409, `${config.stage} must be OFF before Item 7 exact-stage pulse`);
  if (beforeState?.scenario?.hookId != null) throw new HttpError(409, `${config.stage} unexpectedly has a webhook identity; refusing scheduled-stage seizure`);
  const originalScheduling = JSON.stringify(beforeState?.scenario?.scheduling || {});

  let read = await repairReadMakeBlueprint(env, scenarioId);
  let originalBlueprint = read.blueprint;
  let root = repairScenarioModuleById(originalBlueprint?.flow || [], 1);
  if (!root || root.module !== "airtable:ActionSearchRecords") throw new HttpError(409, `${config.stage} Module 1 is not the expected Airtable Search Records selector`);
  let originalFormula = String(root?.mapper?.formula || "");
  let strandedSelectorRecovered = false;

  // A prior invocation can hit a platform subrequest ceiling after installing the exact selector but before rollback.
  // Recover only the exact selector for this same output + Test_Run_ID, while the scenario is already verified OFF.
  if (!originalFormula.includes('{Test_Run_ID}=BLANK()')) {
    const exactRunToken = `{Test_Run_ID}=${JSON.stringify(lease.test_run_id)}`;
    const exactWrapper = `AND(RECORD_ID()=${JSON.stringify(recordId)},`;
    if (!originalFormula.startsWith(exactWrapper) || !originalFormula.endsWith(")") || !originalFormula.includes(exactRunToken)) {
      throw new HttpError(409, `${config.stage} production selector no longer contains the verified Test_Run_ID exclusion`);
    }
    let recoveredFormula = originalFormula.slice(exactWrapper.length, -1).replace(exactRunToken, '{Test_Run_ID}=BLANK()');
    if (scenarioId === 5569495) recoveredFormula = recoveredFormula.replace('{Do_Not_Publish}=1', 'NOT({Do_Not_Publish})');
    if (!recoveredFormula.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} stranded selector recovery could not reconstruct Test_Run_ID exclusion`);
    if (scenarioId === 5569495 && !recoveredFormula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 stranded selector recovery could not reconstruct Do_Not_Publish exclusion");

    const recoveredBlueprint = JSON.parse(JSON.stringify(originalBlueprint));
    const recoveredRoot = repairScenarioModuleById(recoveredBlueprint?.flow || [], 1);
    recoveredRoot.mapper.formula = recoveredFormula;
    recoveredRoot.mapper.maxRecords = repairItem7CanonicalMaxRecords(scenarioId);
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(recoveredBlueprint) }) });
    read = await repairReadMakeBlueprint(env, scenarioId);
    originalBlueprint = read.blueprint;
    root = repairScenarioModuleById(originalBlueprint?.flow || [], 1);
    originalFormula = String(root?.mapper?.formula || "");
    if (originalFormula !== recoveredFormula || String(root?.mapper?.maxRecords || "") !== (repairItem7CanonicalMaxRecords(scenarioId))) throw new HttpError(502, `${config.stage} stranded selector recovery did not verify live`);
    strandedSelectorRecovered = true;
  }

  // ITEM7_R3_CANONICAL_MAXRECORDS_V7: R3 production intentionally batches up to 10;
  // ITEM7_R5_CANONICAL_MAXRECORDS_V8: R5 production intentionally batches up to 5;
  // ITEM7_RR1_CANONICAL_MAXRECORDS_V9: RR1 production intentionally batches up to 10;
  // the temporary exact Item 7 selector uses maxRecords=1 and must restore the
  // canonical production value after every success, failure, retry, or cleanup.
  const canonicalMaxRecords = repairItem7CanonicalMaxRecords(scenarioId);
  const originalSerialized = JSON.stringify(originalBlueprint);
  const originalIds = repairScenarioModuleIds(originalBlueprint?.flow || []).sort((a, b) => a - b);
  if (String(root?.mapper?.maxRecords || "") !== canonicalMaxRecords) throw new HttpError(409, `${config.stage} canonical maxRecords drifted; expected ${canonicalMaxRecords}`);
  if (!originalFormula.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} production selector no longer contains the verified Test_Run_ID exclusion`);
  if (scenarioId === 5569495 && !originalFormula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 production selector no longer contains the verified Do_Not_Publish exclusion");

  let exactFormula = originalFormula.replaceAll('{Test_Run_ID}=BLANK()', `{Test_Run_ID}=${JSON.stringify(lease.test_run_id)}`);
  if (scenarioId === 5569495) exactFormula = exactFormula.replace('NOT({Do_Not_Publish})', '{Do_Not_Publish}=1');
  exactFormula = `AND(RECORD_ID()=${JSON.stringify(recordId)},${exactFormula})`;

  const patched = JSON.parse(JSON.stringify(originalBlueprint));
  const patchedRoot = repairScenarioModuleById(patched?.flow || [], 1);
  patchedRoot.mapper.formula = exactFormula;
  patchedRoot.mapper.maxRecords = "1";

  await repairReserveBudget(env, lease, { operationCost: Math.min(90, 20 + (maxCycles * 5)), runCost: maxCycles, action });

  let patchedLive = false, restored = false, failure = null, stop = null, observed = null, cyclesRun = 0;
  try {
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(patched) }) });
    patchedLive = true;
    const verifyPatched = await repairReadMakeBlueprint(env, scenarioId);
    const verifyRoot = repairScenarioModuleById(verifyPatched.blueprint?.flow || [], 1);
    const verifyIds = repairScenarioModuleIds(verifyPatched.blueprint?.flow || []).sort((a, b) => a - b);
    if (String(verifyRoot?.mapper?.formula || "") !== exactFormula || String(verifyRoot?.mapper?.maxRecords || "") !== "1") throw new HttpError(502, `${config.stage} exact Item 7 selector did not verify live`);
    if (JSON.stringify(verifyIds) !== JSON.stringify(originalIds)) throw new HttpError(502, `${config.stage} module topology changed while installing exact selector`);

    for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
      cyclesRun = cycle;
      await phase6SetScenarioActive(env, scenarioId, true);
      // ITEM7_EXACT_STAGE_EXPLICIT_RUN_V2: activation alone does not prove a scheduled scenario executed.
      // ITEM7_EXACT_EXECUTION_STOP_V3: retain the exact execution id so shutdown can only force-stop
      // the execution created by this lease/cycle; never select or stop an unrelated execution.
      const exactRun = await phase6RunScenario(env, scenarioId, null);
      const exactExecutionId = exactRun.executionId;
      observed = await repairWaitItem7Checkpoint(env, scenarioId, recordId, lease.test_run_id, config.wait_ms_per_cycle);
      // Reserve stop/rollback subrequests: one normal stop attempt first, then
      // exact execution force-stop and up to three verification attempts.
      stop = await phase6StopScenarioVerified(env, scenarioId, 1);
      let exactExecutionStop = null;
      if (stop?.inactive !== true) {
        exactExecutionStop = await phase6StopExactScenarioExecution(env, scenarioId, exactExecutionId);
        stop = await phase6StopScenarioVerified(env, scenarioId, 3);
      }
      if (stop?.inactive !== true) {
        throw new HttpError(502, `${config.stage} did not verify inactive after exact cycle ${cycle}; execution_id=${exactExecutionId}; exact_execution_stop=${JSON.stringify(exactExecutionStop)}; scenario_stop=${JSON.stringify(stop)}`);
      }
      if (observed?.checkpoint?.failed) throw new HttpError(502, `${config.stage} reported a failed checkpoint: ${JSON.stringify(observed.checkpoint.summary)}`);
      if (observed?.checkpoint?.complete) break;
      if (cycle < maxCycles) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (!observed?.checkpoint?.complete) throw new HttpError(502, `${config.stage} did not reach its exact Item 7 checkpoint after ${cyclesRun} cycle(s)`);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    try { stop = await phase6StopScenarioVerified(env, scenarioId, 4); } catch (error) { if (!failure) failure = error instanceof Error ? error.message : String(error); }
    if (patchedLive) {
      try {
        await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: read.original_payload }) });
        const verifyRestore = await repairReadMakeBlueprint(env, scenarioId);
        const restoredState = await phase6ScenarioState(env, scenarioId);
        restored = JSON.stringify(verifyRestore.blueprint) === originalSerialized && restoredState.isActive === false && JSON.stringify(restoredState?.scenario?.scheduling || {}) === originalScheduling;
        if (!restored && !failure) failure = `${config.stage} exact selector rollback did not verify byte-for-byte`;
      } catch (error) { if (!failure) failure = error instanceof Error ? error.message : String(error); }
    }
    if (failure || !restored) {
      try { await repairCloseLease(env, lease, "failed", { reason: "item7-exact-stage-pulse-failed", stage: config.stage, scenario_stopped: stop?.inactive === true, selector_restored: restored, cycles_run: cyclesRun, error: failure || "restore verification failed" }); } catch {}
    } else {
      try { await repairCloseLease(env, lease, "released", { reason: "item7-exact-stage-pulse-complete", stage: config.stage, scenario_stopped: true, selector_restored: true, exact_platform_output_record_id: recordId, cycles_run: cyclesRun, checkpoint: observed?.checkpoint?.summary || null }); } catch {}
    }
  }
  if (failure || !restored) throw new HttpError(502, failure || `${config.stage} Item 7 exact-stage restoration failed`);
  return { stage: config.stage, scenario_id: scenarioId, platform_output_record_id: recordId, test_run_id: lease.test_run_id, cycles_run: cyclesRun, checkpoint: observed?.checkpoint?.summary || null, scenario_started: true, scenario_stopped: stop?.inactive === true, selector_restored: true, schedule_preserved: true, do_not_publish_preserved: true, stranded_selector_recovered: strandedSelectorRecovered };
}
/*__STUDIO_WORKER_END:repairPulseItem7ExactStage__*/

export async function repairCleanupItem7ExactStage(env, lease, input) {
  const scenarioId = Number(input.scenario_id);
  const config = ITEM7_EXACT_STAGE_CONFIG[scenarioId];
  if (!config || lease.scenario_id !== scenarioId) throw new HttpError(403, `cleanup_item7_exact_stage is not authorized for scenario ${scenarioId}`);
  const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
  const allowlist = Array.isArray(lease.contract.allowed_platform_output_record_ids) ? lease.contract.allowed_platform_output_record_ids : [];
  if (!allowlist.includes(recordId)) throw new HttpError(403, `Platform Output ${recordId} is outside this Item 7 lease allowlist`);
  if ((lease.contract.deny_fixture_record_ids || []).includes(recordId)) throw new HttpError(403, `Platform Output ${recordId} is an explicit denial fixture`);
  await repairVerifyOutputRecord(env, recordId, false, lease.test_run_id);

  const beforeState = await phase6ScenarioState(env, scenarioId);
  const originalScheduling = JSON.stringify(beforeState?.scenario?.scheduling || {});
  const stop = await phase6StopScenarioVerified(env, scenarioId, 4);
  if (stop?.inactive !== true) throw new HttpError(502, `${config.stage} cleanup did not verify inactive`);

  let read = await repairReadMakeBlueprint(env, scenarioId);
  let blueprint = read.blueprint;
  let root = repairScenarioModuleById(blueprint?.flow || [], 1);
  if (!root || root.module !== "airtable:ActionSearchRecords") throw new HttpError(409, `${config.stage} Module 1 is not the expected Airtable Search Records selector`);
  let formula = String(root?.mapper?.formula || "");
  let selectorRestored = false;
  let alreadyCanonical = false;

  const canonicalMaxRecords = repairItem7CanonicalMaxRecords(scenarioId);
  if (formula.includes('{Test_Run_ID}=BLANK()')) {
    if (scenarioId === 5569495 && !formula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 canonical cleanup selector is missing Do_Not_Publish exclusion");
    if (String(root?.mapper?.maxRecords || "") !== canonicalMaxRecords) throw new HttpError(409, `${config.stage} canonical cleanup maxRecords drifted; expected ${canonicalMaxRecords}`);
    selectorRestored = true;
    alreadyCanonical = true;
  } else {
    const exactRunToken = `{Test_Run_ID}=${JSON.stringify(lease.test_run_id)}`;
    const exactWrapper = `AND(RECORD_ID()=${JSON.stringify(recordId)},`;
    if (!formula.startsWith(exactWrapper) || !formula.endsWith(")") || !formula.includes(exactRunToken)) {
      throw new HttpError(409, `${config.stage} cleanup refused a selector that is not the exact leased Output/Test_Run_ID selector`);
    }
    let recoveredFormula = formula.slice(exactWrapper.length, -1).replace(exactRunToken, '{Test_Run_ID}=BLANK()');
    if (scenarioId === 5569495) recoveredFormula = recoveredFormula.replace('{Do_Not_Publish}=1', 'NOT({Do_Not_Publish})');
    if (!recoveredFormula.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} cleanup could not reconstruct Test_Run_ID exclusion`);
    if (scenarioId === 5569495 && !recoveredFormula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 cleanup could not reconstruct Do_Not_Publish exclusion");

    const recoveredBlueprint = JSON.parse(JSON.stringify(blueprint));
    const recoveredRoot = repairScenarioModuleById(recoveredBlueprint?.flow || [], 1);
    recoveredRoot.mapper.formula = recoveredFormula;
    recoveredRoot.mapper.maxRecords = canonicalMaxRecords;
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(recoveredBlueprint) }) });

    const verify = await repairReadMakeBlueprint(env, scenarioId);
    const verifyRoot = repairScenarioModuleById(verify.blueprint?.flow || [], 1);
    const verifyState = await phase6ScenarioState(env, scenarioId);
    selectorRestored = String(verifyRoot?.mapper?.formula || "") === recoveredFormula && String(verifyRoot?.mapper?.maxRecords || "") === canonicalMaxRecords && verifyState.isActive === false;
    if (!selectorRestored) throw new HttpError(502, `${config.stage} cleanup selector restoration did not verify live`);
    if (JSON.stringify(verifyState?.scenario?.scheduling || {}) !== originalScheduling) throw new HttpError(502, `${config.stage} cleanup changed scenario scheduling`);
  }

  await repairCloseLease(env, lease, "failed", {
    reason: "item7-exact-stage-fresh-cleanup",
    stage: config.stage,
    scenario_stopped: true,
    selector_restored: selectorRestored,
    exact_platform_output_record_id: recordId,
    cleanup_only: true,
  });

  return {
    stage: config.stage,
    scenario_id: scenarioId,
    platform_output_record_id: recordId,
    test_run_id: lease.test_run_id,
    scenario_stopped: true,
    selector_restored: selectorRestored,
    already_canonical: alreadyCanonical,
    lease_terminalized: true,
  };
}
/*__STUDIO_WORKER_END:repairCleanupItem7ExactStage__*/

export function item6Choice(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value.name || value.id || null;
  return value ?? null;
}
/*__STUDIO_WORKER_END:item6Choice__*/

export function item6Platform(fields) {
  return String(item6Choice(fields?.Platform) || "").trim();
}
/*__STUDIO_WORKER_END:item6Platform__*/

export function item6SnapshotFieldNames(fields) {
  const platform = item6Platform(fields);
  return [...ITEM6_REPLACE_COMMON_FIELDS, ...(ITEM6_REPLACE_PLATFORM_FIELDS[platform] || [])];
}
/*__STUDIO_WORKER_END:item6SnapshotFieldNames__*/

export function item6PublicationSnapshot(record) {
  const fields = record?.fields || {};
  const names = item6SnapshotFieldNames(fields);
  const values = {};
  for (const name of names) values[name] = Object.prototype.hasOwnProperty.call(fields, name) ? fields[name] : null;
  return { schema: "ITEM6_LAST_GOOD_V1", record_id: record.id, platform: item6Platform(fields), captured_at: new Date().toISOString(), fields: values };
}
/*__STUDIO_WORKER_END:item6PublicationSnapshot__*/

export function item6ParseSnapshot(value, recordId) {
  let snapshot;
  try { snapshot = typeof value === "string" ? JSON.parse(value) : value; } catch { snapshot = null; }
  if (!snapshot || snapshot.schema !== "ITEM6_LAST_GOOD_V1" || snapshot.record_id !== recordId || !snapshot.fields || typeof snapshot.fields !== "object") {
    throw new HttpError(409, `Platform Output ${recordId} does not have a valid Item 6 last-good snapshot`);
  }
  return snapshot;
}
/*__STUDIO_WORKER_END:item6ParseSnapshot__*/

export function item6Identity(fields) {
  const platform = item6Platform(fields);
  const first = (...values) => values.map(v => String(v || "").trim()).find(Boolean) || null;
  if (platform === "Instagram") return first(fields.Platform_Post_ID, fields.IG_Carousel_Published_Media_ID, fields.IG_Story_Post_ID, fields.Platform_Post_URL);
  if (platform === "Facebook") return first(fields.Platform_Post_ID, fields.FB_Slideshow_Meta_Video_ID, fields.Platform_Post_URL);
  if (platform === "TikTok") return first(fields.Platform_Post_ID, fields.Manual_Published_URL, fields.TikTok_Draft_Public_Post_IDs_JSON, fields.Platform_Post_URL);
  if (platform === "YouTube") return first(fields.YouTube_Video_ID, fields.Platform_Post_ID, fields.Platform_Post_URL);
  return first(fields.Platform_Post_ID, fields.Platform_Post_URL);
}
/*__STUDIO_WORKER_END:item6Identity__*/

export function item6IdentityFromSnapshot(snapshot) {
  return item6Identity({ Platform: snapshot.platform, ...(snapshot.fields || {}) });
}
/*__STUDIO_WORKER_END:item6IdentityFromSnapshot__*/

export function item6SafeJson(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}
/*__STUDIO_WORKER_END:item6SafeJson__*/

export async function item6LoadAllowedOutput(env, lease, input) {
  const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
  if (!lease.contract.allowed_platform_output_record_ids.includes(recordId)) throw new HttpError(403, `Platform Output ${recordId} is outside this test_run_id allowlist`);
  await repairVerifyOutputRecord(env, recordId, lease.contract.allow_public_publish === true, lease.contract.test_run_id);
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId);
  if (!record?.id) throw new HttpError(404, `Platform Output ${recordId} not found`);
  return record;
}
/*__STUDIO_WORKER_END:item6LoadAllowedOutput__*/

export async function item6PatchOutput(env, recordId, fields) {
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId, { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) });
}
/*__STUDIO_WORKER_END:item6PatchOutput__*/

export function item6PrepareResetPatch(record, transactionId, fingerprint) {
  const fields = record.fields || {};
  const platform = item6Platform(fields);
  const patch = {};
  for (const name of ITEM6_REPLACE_COMMON_FIELDS) patch[name] = null;
  patch.Publish_Status = "Ready";
  patch.Publish_Attempt_Count = 0;
  patch.Publish_Retry_Eligible = false;
  patch.Manual_Fallback_Required = false;
  for (const name of ITEM6_REPLACE_PLATFORM_FIELDS[platform] || []) patch[name] = null;
  if (platform === "YouTube") patch.YouTube_Idempotency_Key = `item6:${record.id}:${transactionId}:${fingerprint}`.slice(0, 250);
  return patch;
}
/*__STUDIO_WORKER_END:item6PrepareResetPatch__*/

export function item6ObsoleteInventory(snapshot) {
  const fields = snapshot.fields || {};
  return {
    schema: "ITEM6_OBSOLETE_V1", platform: snapshot.platform, captured_at: snapshot.captured_at,
    canonical_identity: item6IdentityFromSnapshot(snapshot), platform_post_id: fields.Platform_Post_ID || null,
    platform_media_id: fields.Platform_Media_ID || null, platform_post_url: fields.Platform_Post_URL || null,
    instagram_story_post_id: fields.IG_Story_Post_ID || null, instagram_carousel_media_id: fields.IG_Carousel_Published_Media_ID || null,
    facebook_slideshow_video_id: fields.FB_Slideshow_Meta_Video_ID || null,
    tiktok_public_post_ids: item6SafeJson(fields.TikTok_Draft_Public_Post_IDs_JSON, fields.TikTok_Draft_Public_Post_IDs_JSON || null),
    youtube_video_id: fields.YouTube_Video_ID || null
  };
}
/*__STUDIO_WORKER_END:item6ObsoleteInventory__*/

export async function item6ReplaceControlAction(env, action, lease, input) {
  const record = await item6LoadAllowedOutput(env, lease, input);
  const fields = record.fields || {};
  const transactionId = repairString(input.replace_transaction_id, "replace_transaction_id", 120);
  const fingerprint = repairString(input.replace_fingerprint, "replace_fingerprint", 250);
  const currentTxn = String(fields.Replace_Transaction_ID || "").trim();
  const currentFingerprint = String(fields.Replace_Fingerprint || "").trim();
  const state = String(fields.Replace_State || "").trim();
  const now = new Date().toISOString();

  if (currentTxn && currentTxn !== transactionId && ITEM6_REPLACE_ACTIVE_STATES.has(state)) throw new HttpError(409, `Platform Output ${record.id} already has active replacement transaction ${currentTxn}`);
  if (currentTxn === transactionId && currentFingerprint && currentFingerprint !== fingerprint) throw new HttpError(409, `Replacement transaction ${transactionId} fingerprint mismatch`);

  if (action === "replace_transaction_state") {
    return { action, output: { id: record.id, output_id: fields.Output_ID ?? null, platform: item6Platform(fields), test_run_id: fields.Test_Run_ID || null }, replace: {
      transaction_id: currentTxn || null, fingerprint: currentFingerprint || null, state: state || null,
      cleanup_state: fields.Replace_Cleanup_State || null, started_at: fields.Replace_Started_At || null,
      updated_at: fields.Replace_Updated_At || null, has_last_good_snapshot: Boolean(String(fields.Replace_Last_Good_JSON || "").trim())
    }};
  }

  await repairReserveBudget(env, lease, { operationCost: 1, action });

  if (action === "prepare_replace_transaction") {
    if (currentTxn === transactionId && currentFingerprint === fingerprint && ITEM6_REPLACE_ACTIVE_STATES.has(state)) return { action, idempotent: true, output: { id: record.id, output_id: fields.Output_ID ?? null }, replace: { transaction_id: transactionId, fingerprint, state } };
    if (state === "Complete" && currentTxn === transactionId && currentFingerprint === fingerprint) return { action, idempotent: true, complete: true, output: { id: record.id, output_id: fields.Output_ID ?? null }, replace: { transaction_id: transactionId, fingerprint, state } };
    const snapshot = item6PublicationSnapshot(record);
    const oldIdentity = item6IdentityFromSnapshot(snapshot);
    if (!oldIdentity) throw new HttpError(409, `Platform Output ${record.id} has no durable published identity to replace`);
    const updated = await item6PatchOutput(env, record.id, {
      Replace_Transaction_ID: transactionId, Replace_State: "Prepared", Replace_Fingerprint: fingerprint,
      Replace_Last_Good_JSON: JSON.stringify(snapshot), Replace_Obsolete_JSON: null, Replace_Cleanup_State: null,
      Replace_Cleanup_Attempt_Count: 0, Replace_Error: null, Replace_Started_At: now, Replace_Updated_At: now
    });
    return { action, idempotent: false, output: { id: record.id, output_id: fields.Output_ID ?? null, platform: snapshot.platform }, replace: { transaction_id: transactionId, fingerprint, state: "Prepared", last_good_identity: oldIdentity }, record: { id: updated.id } };
  }

  if (currentTxn !== transactionId || currentFingerprint !== fingerprint) throw new HttpError(409, `Replacement transaction ${transactionId} is not the current transaction for Platform Output ${record.id}`);
  const snapshot = item6ParseSnapshot(fields.Replace_Last_Good_JSON, record.id);
  const oldIdentity = item6IdentityFromSnapshot(snapshot);

  if (action === "begin_replace_transaction") {
    if (lease.contract.allow_public_publish !== true) throw new HttpError(403, "Replacement publishing requires a lease with allow_public_publish=true");
    if (fields.Do_Not_Publish === true) throw new HttpError(409, `Platform Output ${record.id} is still Do_Not_Publish`);
    const explicitPlatform = String(lease.contract.explicit_publish_platform || "").trim();
    if (!explicitPlatform || explicitPlatform !== item6Platform(fields)) throw new HttpError(409, "Replacement platform does not match the lease explicit_publish_platform");
    if (state === "Publishing") return { action, idempotent: true, output: { id: record.id }, replace: { transaction_id: transactionId, fingerprint, state } };
    if (state !== "Prepared") throw new HttpError(409, `Replacement begin requires Prepared state, found ${state || "blank"}`);
    const reset = item6PrepareResetPatch(record, transactionId, fingerprint);
    const updated = await item6PatchOutput(env, record.id, { ...reset, Replace_State: "Publishing", Replace_Cleanup_State: null, Replace_Error: null, Replace_Updated_At: now });
    return { action, idempotent: false, output: { id: record.id, output_id: fields.Output_ID ?? null, platform: item6Platform(fields) }, replace: { transaction_id: transactionId, fingerprint, state: "Publishing", last_good_identity: oldIdentity }, record: { id: updated.id } };
  }

  if (action === "verify_replace_transaction") {
    if (!["Publishing", "Verified", "Cleanup Pending", "Manual Cleanup Required", "Complete"].includes(state)) throw new HttpError(409, `Replacement verification requires Publishing or later state, found ${state || "blank"}`);
    const newIdentity = item6Identity(fields);
    const expectedIdentity = String(input.expected_new_platform_identity || "").trim();
    if (!newIdentity) throw new HttpError(409, `Platform Output ${record.id} has no replacement publication identity yet`);
    if (oldIdentity && newIdentity === oldIdentity) throw new HttpError(409, "Replacement identity is still the last-good publication identity");
    if (expectedIdentity && expectedIdentity !== newIdentity) throw new HttpError(409, "Observed replacement identity does not match expected_new_platform_identity");
    if (["Verified", "Cleanup Pending", "Manual Cleanup Required", "Complete"].includes(state)) return { action, idempotent: true, output: { id: record.id }, replace: { transaction_id: transactionId, fingerprint, state, old_identity: oldIdentity, new_identity: newIdentity, cleanup_state: fields.Replace_Cleanup_State || null } };
    const obsolete = item6ObsoleteInventory(snapshot);
    const updated = await item6PatchOutput(env, record.id, { Replace_State: "Manual Cleanup Required", Replace_Obsolete_JSON: JSON.stringify(obsolete), Replace_Cleanup_State: "Manual Cleanup Required", Replace_Error: null, Replace_Updated_At: now });
    return { action, idempotent: false, output: { id: record.id, output_id: fields.Output_ID ?? null, platform: item6Platform(fields) }, replace: { transaction_id: transactionId, fingerprint, state: "Manual Cleanup Required", old_identity: oldIdentity, new_identity: newIdentity, cleanup_state: "Manual Cleanup Required" }, record: { id: updated.id } };
  }

  if (action === "rollback_replace_transaction") {
    if (state === "Rolled Back") return { action, idempotent: true, output: { id: record.id }, replace: { transaction_id: transactionId, fingerprint, state } };
    if (!["Prepared", "Publishing", "Failed"].includes(state)) throw new HttpError(409, `Replacement rollback is not allowed from ${state || "blank"}`);
    const observedIdentity = item6Identity(fields);
    if (state === "Publishing" && observedIdentity && observedIdentity !== oldIdentity) {
      await item6PatchOutput(env, record.id, { Replace_State: "Manual Cleanup Required", Replace_Cleanup_State: "Manual Cleanup Required", Replace_Error: "Rollback refused because a new external publication identity is already present; clean up the new object before restoring last-good state.", Replace_Updated_At: now });
      throw new HttpError(409, "Rollback refused because replacement publication already exists; cleanup is required before last-good restoration");
    }
    const restore = { ...(snapshot.fields || {}) };
    const updated = await item6PatchOutput(env, record.id, { ...restore, Replace_State: "Rolled Back", Replace_Cleanup_State: null, Replace_Error: String(input.rollback_reason || "").trim() || null, Replace_Updated_At: now });
    return { action, idempotent: false, output: { id: record.id, output_id: fields.Output_ID ?? null, platform: snapshot.platform }, replace: { transaction_id: transactionId, fingerprint, state: "Rolled Back", restored_identity: oldIdentity }, record: { id: updated.id } };
  }

  if (action === "complete_replace_cleanup") {
    if (state === "Complete") return { action, idempotent: true, output: { id: record.id, output_id: fields.Output_ID ?? null, platform: item6Platform(fields) }, replace: { transaction_id: transactionId, fingerprint, state: "Complete", cleanup_state: fields.Replace_Cleanup_State || "Complete" } };
    if (!["Manual Cleanup Required", "Cleanup Pending", "Verified"].includes(state)) throw new HttpError(409, `Cleanup completion is not allowed from ${state || "blank"}`);
    const evidence = input.cleanup_evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new HttpError(400, "cleanup_evidence object is required");
    if (evidence.verified !== true) throw new HttpError(409, "cleanup_evidence.verified must be true before completing replacement cleanup");
    const platform = item6Platform(fields);
    const currentIdentity = item6Identity(fields);
    const obsolete = item6SafeJson(fields.Replace_Obsolete_JSON, null);
    if (!obsolete || obsolete.schema !== "ITEM6_OBSOLETE_V1") throw new HttpError(409, "Stored obsolete publication inventory is missing or invalid");
    if (!oldIdentity || obsolete.canonical_identity !== oldIdentity) throw new HttpError(409, "Stored obsolete publication identity does not match the last-good snapshot");
    if (!currentIdentity || currentIdentity === oldIdentity) throw new HttpError(409, "Replacement publication identity is not durably distinct from the obsolete publication");
    if (String(evidence.transaction_id || "").trim() !== transactionId) throw new HttpError(409, "cleanup_evidence.transaction_id does not match the active replacement transaction");
    if (String(evidence.replace_fingerprint || "").trim() !== fingerprint) throw new HttpError(409, "cleanup_evidence.replace_fingerprint does not match the active replacement fingerprint");
    if (String(evidence.platform || "").trim() !== platform) throw new HttpError(409, "cleanup_evidence.platform does not match the Platform Output");
    if (String(evidence.obsolete_identity || "").trim() !== oldIdentity) throw new HttpError(409, "cleanup_evidence.obsolete_identity does not match the stored obsolete publication");
    if (String(evidence.current_identity || "").trim() !== currentIdentity) throw new HttpError(409, "cleanup_evidence.current_identity does not match the replacement publication");
    const verification = evidence.verification && typeof evidence.verification === "object" && !Array.isArray(evidence.verification) ? evidence.verification : null;
    if (!verification || verification.obsolete_absent !== true || verification.replacement_present !== true) throw new HttpError(409, "cleanup_evidence.verification must prove obsolete_absent=true and replacement_present=true");
    const method = String(evidence.verification_method || "").trim();
    if (!["platform_api", "platform_ui_manual", "platform_reconciliation"].includes(method)) throw new HttpError(409, "cleanup_evidence.verification_method is not an approved verification method");
    const verifiedAt = Date.parse(String(evidence.verified_at || ""));
    if (!Number.isFinite(verifiedAt)) throw new HttpError(409, "cleanup_evidence.verified_at must be a valid timestamp");
    const updated = await item6PatchOutput(env, record.id, { Replace_State: "Complete", Replace_Cleanup_State: "Complete", Replace_Cleanup_Attempt_Count: Number(fields.Replace_Cleanup_Attempt_Count || 0) + 1, Replace_Error: null, Replace_Updated_At: now });
    return { action, idempotent: false, output: { id: record.id, output_id: fields.Output_ID ?? null, platform }, replace: { transaction_id: transactionId, fingerprint, state: "Complete", cleanup_state: "Complete", old_identity: oldIdentity, new_identity: currentIdentity, cleanup_evidence: evidence }, record: { id: updated.id } };
  }

  throw new HttpError(400, `Unsupported Item 6 replacement action ${action}`);
}/*__STUDIO_WORKER_END:item6ReplaceControlAction__*/

export async function repairRecoverItem7ExactSelector(env, input) {
  const confirm = repairString(input.confirm, "confirm", 96);
  if (confirm !== "RECOVER-ITEM7-EXACT-SELECTOR-V1") throw new HttpError(400, "Item 7 exact selector recovery confirmation is required");
  const scenarioId = Number(input.scenario_id);
  const config = ITEM7_EXACT_STAGE_CONFIG[scenarioId];
  if (!config) throw new HttpError(403, `Scenario ${scenarioId} is outside the Item 7 exact-stage allowlist`);
  const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
  const testRunId = repairString(input.test_run_id, "test_run_id", 160);
  // ITEM7_SELECTOR_RECOVERY_V6_1: repairVerifyOutputRecord already enforces the
  // exact Test_Run_ID and Do_Not_Publish=true when allowPublicPublish=false.
  // Its return value is a normalized projection (not the raw Airtable fields),
  // so do not redundantly re-read output.fields.Do_Not_Publish here.
  await repairVerifyOutputRecord(env, recordId, false, testRunId);

  const beforeState = await phase6ScenarioState(env, scenarioId);
  if (beforeState.isActive) throw new HttpError(409, `${config.stage} must be inactive before standalone selector recovery`);
  const schedulingBefore = JSON.stringify(beforeState?.scenario?.scheduling || {});

  const read = await repairReadMakeBlueprint(env, scenarioId);
  const blueprint = read.blueprint;
  const root = repairScenarioModuleById(blueprint?.flow || [], 1);
  if (!root || root.module !== "airtable:ActionSearchRecords") throw new HttpError(409, `${config.stage} Module 1 is not the expected Airtable Search Records selector`);
  const formula = String(root?.mapper?.formula || "");
  const canonicalMaxRecords = repairItem7CanonicalMaxRecords(scenarioId);

  if (formula.includes('{Test_Run_ID}=BLANK()')) {
    if (String(root?.mapper?.maxRecords || "") !== canonicalMaxRecords) throw new HttpError(409, `${config.stage} canonical selector maxRecords drifted; expected ${canonicalMaxRecords}`);
    if (scenarioId === 5569495 && !formula.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 canonical selector is missing Do_Not_Publish exclusion");
    return { stage: config.stage, scenario_id: scenarioId, platform_output_record_id: recordId, test_run_id: testRunId, scenario_stopped: true, selector_restored: true, already_canonical: true, schedule_preserved: true };
  }

  if (String(root?.mapper?.maxRecords || "") !== "1") throw new HttpError(409, `${config.stage} stranded exact selector maxRecords is not 1`);

  const exactWrapper = `AND(RECORD_ID()=${JSON.stringify(recordId)},`;
  const exactRunToken = `{Test_Run_ID}=${JSON.stringify(testRunId)}`;
  if (!formula.startsWith(exactWrapper) || !formula.endsWith(")") || !formula.includes(exactRunToken)) {
    throw new HttpError(409, `${config.stage} recovery refused selector: it is not the exact requested Output/Test_Run_ID selector`);
  }
  if (scenarioId === 5569495 && !formula.includes('{Do_Not_Publish}=1')) throw new HttpError(409, "R2 exact selector does not carry the required Do_Not_Publish=1 test guard");

  let canonical = formula.slice(exactWrapper.length, -1).replace(exactRunToken, '{Test_Run_ID}=BLANK()');
  if (scenarioId === 5569495) canonical = canonical.replace('{Do_Not_Publish}=1', 'NOT({Do_Not_Publish})');
  if (!canonical.includes('{Test_Run_ID}=BLANK()')) throw new HttpError(409, `${config.stage} could not reconstruct the production Test_Run_ID exclusion`);
  if (scenarioId === 5569495 && !canonical.includes('NOT({Do_Not_Publish})')) throw new HttpError(409, "R2 could not reconstruct the production Do_Not_Publish exclusion");

  const patched = JSON.parse(JSON.stringify(blueprint));
  const patchedRoot = repairScenarioModuleById(patched?.flow || [], 1);
  patchedRoot.mapper.formula = canonical;
  patchedRoot.mapper.maxRecords = canonicalMaxRecords;
  await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: "PATCH", body: JSON.stringify({ blueprint: JSON.stringify(patched) }) });

  const verifyRead = await repairReadMakeBlueprint(env, scenarioId);
  const verifyRoot = repairScenarioModuleById(verifyRead.blueprint?.flow || [], 1);
  const afterState = await phase6ScenarioState(env, scenarioId);
  const schedulePreserved = JSON.stringify(afterState?.scenario?.scheduling || {}) === schedulingBefore;
  const selectorRestored = afterState.isActive === false && String(verifyRoot?.mapper?.formula || "") === canonical && String(verifyRoot?.mapper?.maxRecords || "") === canonicalMaxRecords;
  if (!selectorRestored) throw new HttpError(502, `${config.stage} standalone selector recovery did not verify live`);
  if (!schedulePreserved) throw new HttpError(502, `${config.stage} standalone selector recovery changed scenario scheduling`);

  return { stage: config.stage, scenario_id: scenarioId, platform_output_record_id: recordId, test_run_id: testRunId, scenario_stopped: true, selector_restored: true, already_canonical: false, schedule_preserved: true };
}
/*__STUDIO_WORKER_END:repairRecoverItem7ExactSelector__*/

export async function repairControlAction(env, input) {
  const action = repairString(input.action, "action", 40).toLowerCase();
  if (action === "recover_item7_exact_selector") return repairRecoverItem7ExactSelector(env, input);
  const lease = await repairFindLease(env, input);

  if (["replace_transaction_state", "prepare_replace_transaction", "begin_replace_transaction", "verify_replace_transaction", "rollback_replace_transaction", "complete_replace_cleanup"].includes(action)) {
    return item6ReplaceControlAction(env, action, lease, input);
  }

  if (action === "assert_output_allowed") {
    await repairReserveBudget(env, lease, { operationCost: 1, action });
    const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
    if (!lease.contract.allowed_platform_output_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is outside this test_run_id allowlist`);
    }
    const output = await repairVerifyOutputRecord(env, recordId, lease.contract.allow_public_publish === true, lease.contract.test_run_id);
    return { action, lease, output };
  }

  if (action === "run" || action === "activate") {
    throw new HttpError(409, "Standalone ACTIVATE/RUN is intentionally disabled. Repair scenarios must use an exact one-run pulse or wait until stage-specific addressing is verified.");
  }

  if (action === "pulse_p1_test_selector") {
    return await repairPulseP1TestSelector(env, lease, input, action);
  }

  if (action === "pulse_item7_exact_stage") {
    return await repairPulseItem7ExactStage(env, lease, input, action);
  }

  if (action === "cleanup_item7_exact_stage") {
    return await repairCleanupItem7ExactStage(env, lease, input);
  }

  if (action === "pulse_r4_scheduled_selector") {
    if (lease.scenario_id !== 5556716) throw new HttpError(403, "pulse_r4_scheduled_selector is limited to R4 scenario 5556716");
    const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
    if (!lease.contract.allowed_platform_output_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is outside this test_run_id allowlist`);
    }
    if (lease.contract.deny_fixture_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is an explicit denial fixture`);
    }
    const output = await repairVerifyOutputRecord(env, recordId, lease.contract.allow_public_publish === true, lease.contract.test_run_id);
    const selectorFormula = 'AND({Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0)';
    const eligible = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit: 3, filterFormula: selectorFormula });
    if (eligible.length !== 1 || eligible[0]?.id !== recordId) {
      throw new HttpError(409, `R4 scheduled-selector pulse requires exactly one eligible Platform Output and it must be ${recordId}`);
    }
    await repairReserveBudget(env, lease, { operationCost: 6, runCost: 1, action });
    const before = await phase6ScenarioState(env, lease.scenario_id);
    const observedScheduling = repairInspectorClone(before?.scenario?.scheduling || {});
    if (before.isActive) throw new HttpError(409, "R4 must be OFF before scheduled-selector pulse");
    if (observedScheduling?.type !== "on-demand") {
      throw new HttpError(409, `R4 canonical on-demand schedule is not present: ${JSON.stringify(observedScheduling)}`);
    }
    let stop = null;
    let failure = null;
    try {
      await phase6SetScenarioActive(env, lease.scenario_id, true);
      try { await phase6RunScenario(env, lease.scenario_id); } catch (error) {
        if (!phase6RunAlreadyActiveError(error)) throw error;
      }
      const observed = await phase6WaitForOutputStatus(env, recordId, (record) => {
        const status = String(f(record, "Render_Status") || "");
        return ["Rendering", "Rendered", "Failed"].includes(status);
      }, 24000, 3000);
      if (!observed?.matched) throw new HttpError(502, `R4 scheduled selector did not advance Platform Output ${recordId} within 24 seconds`);
      const afterFields = observed?.record?.fields || {};
      return {
        action,
        lease,
        target_record_id: recordId,
        selector_eligible_count: eligible.length,
        selector_target_only: true,
        observed_status: String(afterFields.Render_Status || ""),
        remotion_job_id_present: Boolean(afterFields.Remotion_Job_ID),
        remotion_status_url_present: Boolean(afterFields.Remotion_Status_URL),
        scenario_was_active: before.isActive,
        schedule_preserved: true,
      };
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      try { stop = await phase6StopScenarioVerified(env, lease.scenario_id, 3); } catch (stopError) {
        if (!failure) failure = stopError instanceof Error ? stopError.message : String(stopError);
      }
      if (stop?.inactive !== true || failure) {
        try { await repairCloseLease(env, lease, "failed", { reason: "r4-scheduled-selector-pulse-failed", scenario_stopped: stop?.inactive === true, error: failure || "R4 did not verify inactive" }); } catch {}
      } else {
        try { await repairCloseLease(env, lease, "released", { reason: "r4-scheduled-selector-one-run-complete", scenario_stopped: true, selector_target_only: true, operations_used: lease.operations_used, runs_used: lease.runs_used }); } catch {}
      }
    }
  }

  if (action === "pulse_r4_exact_output") {
    if (lease.scenario_id !== 5556716) throw new HttpError(403, "pulse_r4_exact_output is limited to R4 scenario 5556716");
    const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
    if (!lease.contract.allowed_platform_output_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is outside this test_run_id allowlist`);
    }
    if (lease.contract.deny_fixture_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is an explicit denial fixture`);
    }

    const target = await airtableFetch(env, "Platform Outputs", recordId);
    const fields = target?.fields || {};
    if (lease.contract.allow_public_publish !== true && fields.Do_Not_Publish !== true) {
      throw new HttpError(403, "R4 repair pulse requires Do_Not_Publish=true unless the lease explicitly allows publishing");
    }
    if (String(fields.Render_Status || "") !== "Ready for Render") throw new HttpError(409, "Target output is not Ready for Render");
    for (const required of ["Composition_ID", "Output_Filename", "Render_Clip_List_JSON", "Render_Total_Frames"]) {
      if (fields[required] === null || fields[required] === undefined || fields[required] === "" || fields[required] === 0) {
        throw new HttpError(409, `Target output is missing required R4 field ${required}`);
      }
    }
    const platformOutputId = String(fields.Output_ID ?? "").trim();
    if (!platformOutputId) throw new HttpError(409, "Target output is missing Output_ID");
    const attemptNumber = Number.isInteger(Number(input?.attempt_number)) && Number(input.attempt_number) > 0 ? Number(input.attempt_number) : 1;
    const intendedStage = repairString(input?.intended_stage || "R4", "intended_stage", 20).toUpperCase();
    if (intendedStage !== "R4") throw new HttpError(409, "R4 exact pulse requires intended_stage=R4");
    const idempotencyKey = repairString(
      input?.idempotency_key || `${lease.test_run_id}:R4:${recordId}:${attemptNumber}`,
      "idempotency_key",
      180,
    );
    const runInput = {
      test_run_id: lease.test_run_id,
      output_record_id: recordId,
      platform_output_id: platformOutputId,
      intended_stage: "R4",
      attempt_number: attemptNumber,
      idempotency_key: idempotencyKey,
    };

    await repairReserveBudget(env, lease, { operationCost: 8, runCost: 1, action });
    const before = await phase6ScenarioState(env, lease.scenario_id);
    const beforeJobId = String(fields.Remotion_Job_ID || "");
    const originalScheduling = { type: "indefinitely", interval: 900 };
    const observedScheduling = repairInspectorClone(before?.scenario?.scheduling || {});
    let schedulingTemporarilyChanged = false;
    let originalPulseInterface = null;
    let interfaceTemporarilyRequired = false;
    let failure = null;
    let stop = null;
    let exactTargetConsumed = false;
    let finalTarget = target;
    try {
      if (String(observedScheduling?.type || "") !== "on-demand") {
        await phase6MakeApiJson(env, `/scenarios/${lease.scenario_id}?confirmed=true`, {
          method: "PATCH",
          body: JSON.stringify({ scheduling: JSON.stringify({ type: "on-demand" }) }),
        });
        schedulingTemporarilyChanged = true;
      }
      const pulseInterfaceBody = await phase6MakeApiJson(env, `/scenarios/${lease.scenario_id}/interface`, { method: "GET" });
      const pulseInterface = pulseInterfaceBody?.interface || pulseInterfaceBody?.response?.interface || {};
      originalPulseInterface = {
        input: repairInspectorClone(Array.isArray(pulseInterface?.input) ? pulseInterface.input : []),
        output: repairInspectorClone(Array.isArray(pulseInterface?.output) ? pulseInterface.output : []),
      };
      const requiredPulseInputs = originalPulseInterface.input.map((item) => ({ ...item, required: true }));
      await phase6MakeApiJson(env, `/scenarios/${lease.scenario_id}/interface`, {
        method: "PATCH",
        body: JSON.stringify({ interface: { input: requiredPulseInputs, output: originalPulseInterface.output } }),
      });
      interfaceTemporarilyRequired = true;
      if (!before.isActive) await phase6SetScenarioActive(env, lease.scenario_id, true);
      const execution = await phase6RunScenario(env, lease.scenario_id, runInput);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const executionState = await phase6WaitForScenarioExecution(env, lease.scenario_id, execution.executionId, 30000, 5000);
      if (!executionState.done || !executionState.success) {
        const detail = JSON.stringify(executionState.details || {}).slice(0, 1600);
        throw new HttpError(502, `R4 Make execution ${execution.executionId} ended ${executionState.status}: ${detail}`);
      }
      for (let i = 0; i < 6; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        finalTarget = await airtableFetch(env, "Platform Outputs", recordId);
        const currentFields = finalTarget?.fields || {};
        const status = String(currentFields.Render_Status || "");
        const currentJobId = String(currentFields.Remotion_Job_ID || "");
        if (status !== "Ready for Render" || (currentJobId && currentJobId !== beforeJobId)) {
          exactTargetConsumed = true;
          break;
        }
      }
      if (!exactTargetConsumed) {
        const detail = JSON.stringify(executionState.details || {}).slice(0, 1600);
        throw new HttpError(504, `R4 exact input execution ${execution.executionId} did not advance the target; status=${executionState.status}; details=${detail}`);
      }
      return {
        action,
        lease,
        platform_output_record_id: recordId,
        platform_output_id: platformOutputId,
        intended_stage: "R4",
        attempt_number: attemptNumber,
        idempotency_key: idempotencyKey,
        execution_id: execution.executionId,
        exact_input_dispatched: true,
        exact_target_consumed: true,
        final_render_status: String(finalTarget?.fields?.Render_Status || ""),
        final_remotion_job_id_present: Boolean(finalTarget?.fields?.Remotion_Job_ID),
      };
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      try { stop = await phase6StopScenarioVerified(env, lease.scenario_id, 2); } catch (stopError) {
        if (!failure) failure = stopError instanceof Error ? stopError.message : String(stopError);
      }
      if (interfaceTemporarilyRequired && originalPulseInterface) {
        try {
          await phase6MakeApiJson(env, `/scenarios/${lease.scenario_id}/interface`, {
            method: "PATCH",
            body: JSON.stringify({ interface: originalPulseInterface }),
          });
        } catch (interfaceError) {
          if (!failure) failure = interfaceError instanceof Error ? interfaceError.message : String(interfaceError);
        }
      }
      {
        try {
          await phase6MakeApiJson(env, `/scenarios/${lease.scenario_id}?confirmed=true`, {
            method: "PATCH",
            body: JSON.stringify({ scheduling: JSON.stringify(originalScheduling) }),
          });
          const restored = await phase6ScenarioState(env, lease.scenario_id);
          if (JSON.stringify(restored?.scenario?.scheduling || {}) !== JSON.stringify(originalScheduling) || restored?.isActive) {
            throw new Error("R4 scheduling/OFF state did not verify after pulse");
          }
        } catch (scheduleError) {
          if (!failure) failure = scheduleError instanceof Error ? scheduleError.message : String(scheduleError);
        }
      }
      try { await repairClearR4LeaseToken(env, lease); } catch (cleanupError) {
        if (!failure) failure = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      }
      if (stop?.inactive !== true || failure) {
        try { await repairCloseLease(env, lease, "failed", { reason: "r4-exact-pulse-failed", scenario_stopped: stop?.inactive === true, error: failure || "R4 did not verify inactive" }); } catch {}
      } else {
        try { await repairCloseLease(env, lease, "released", { reason: "r4-exact-one-run-complete", scenario_stopped: true, exact_input_dispatched: true, exact_target_consumed: exactTargetConsumed, operations_used: lease.operations_used, runs_used: lease.runs_used }); } catch {}
      }
    }
  }

  if (action === "pulse_admin_bridge") {
    if (lease.scenario_id !== 5893243) throw new HttpError(403, "pulse_admin_bridge is limited to MAKE-ADMIN-BRIDGE 5893243");
    const exactQueueRecordId = repairString(input.exact_make_admin_command_record_id, "exact_make_admin_command_record_id", 32);
    const pending = await listRecords(env, REPAIR_LEASE_TABLE_ID, {
      limit: 10,
      sortField: "Requested_At",
      sortDirection: "asc",
      filterFormula: '{Status}="Pending"',
    });
    if (pending.length !== 1 || pending[0]?.id !== exactQueueRecordId) {
      throw new HttpError(409, `MAKE-ADMIN-BRIDGE pulse requires exactly one Pending command and it must be ${exactQueueRecordId}`);
    }
    await repairReserveBudget(env, lease, { operationCost: 6, runCost: 1, action });
    const before = await phase6ScenarioState(env, lease.scenario_id);
    let execution = null;
    let stop = null;
    let failure = null;
    try {
      if (!before.isActive) await phase6SetScenarioActive(env, lease.scenario_id, true);
      execution = await phase6RunScenario(env, lease.scenario_id, null);
      return { action, lease, exact_make_admin_command_record_id: exactQueueRecordId, execution_id: execution.executionId, before: { isActive: before.isActive } };
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      try { stop = await phase6StopScenarioVerified(env, lease.scenario_id, 2); } catch (stopError) {
        if (!failure) failure = stopError instanceof Error ? stopError.message : String(stopError);
      }
      if (stop?.inactive !== true) {
        try { await repairCloseLease(env, lease, "failed", { reason: "pulse-finally-shutdown-failed", error: failure || "Scenario did not verify inactive" }); } catch {}
      } else if (!failure) {
        try { await repairCloseLease(env, lease, "released", { reason: "one-run-pulse-complete", scenario_stopped: true, operations_used: lease.operations_used, runs_used: lease.runs_used }); } catch {}
      }
    }
  }

  if (action === "state") {
    await repairReserveBudget(env, lease, { operationCost: 1, action });
    return { action, lease, scenario: await phase6ScenarioState(env, lease.scenario_id) };
  }

  if (action === "deactivate" || action === "release") {
    await repairReserveBudget(env, lease, { operationCost: 3, action });
    const before = await phase6ScenarioState(env, lease.scenario_id);
    if (before.isActive) await phase6SetScenarioActive(env, lease.scenario_id, false);
    const after = await phase6ScenarioState(env, lease.scenario_id);
    if (after.isActive) throw new HttpError(502, `Scenario ${lease.scenario_id} did not become inactive`);
    await repairCloseLease(env, lease, "released", { reason: action, scenario_stopped: true, operations_used: lease.operations_used, runs_used: lease.runs_used });
    return { action, lease: { ...lease, status: "released" }, before: { isActive: before.isActive }, after: { isActive: after.isActive } };
  }

  throw new HttpError(400, `Unsupported repair control action: ${action}`);
}

/*__STUDIO_WORKER_END:repairControlAction__*/

export async function repairSha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/*__STUDIO_WORKER_END:repairSha256Hex__*/

export function repairMakeAdminFindModule19(blueprint) {
  const matches = [];
  const walk = (flow) => {
    for (const node of Array.isArray(flow) ? flow : []) {
      if (Number(node?.id) === 19) matches.push(node);
      for (const route of Array.isArray(node?.routes) ? node.routes : []) walk(route?.flow);
    }
  };
  walk(blueprint?.flow);
  if (matches.length !== 1) throw new HttpError(409, `Expected exactly one MAKE-ADMIN module 19; found ${matches.length}`);
  const module = matches[0];
  if (module?.module !== "airtable:ActionUpdateRecords") throw new HttpError(409, "MAKE-ADMIN module 19 type changed unexpectedly");
  if (module?.metadata?.designer?.name !== "19 - Record GET_BLUEPRINT Result") throw new HttpError(409, "MAKE-ADMIN module 19 name changed unexpectedly");
  return module;
}
/*__STUDIO_WORKER_END:repairMakeAdminFindModule19__*/

export async function repairMakeAdminModule19(env) {
  const scenarioId = 5893243;
  const expectedScenarioName = "MAKE-ADMIN-BRIDGE v1.3 - Airtable Controlled Make API - Direct Webhook Runner";
  const resultField = "fldduyTQgkdN6E1wI";
  const errorField = "fld6x1xtUD3CxmXdv";
  const oldResult = "{{18.data}}";
  const oldError = '{{if(18.statusCode >= 200; if(18.statusCode < 300; ""; 18.data); 18.data)}}';
  const newResult = '{"blueprint_omitted":true,"scenario_id":"{{1.Scenario_ID}}","http_status":"{{18.statusCode}}"}';
  const newError = '{{if(18.statusCode >= 200; if(18.statusCode < 300; ""; "GET_BLUEPRINT failed; response body omitted"); "GET_BLUEPRINT failed; response body omitted")}}';

  const stateBefore = await phase6ScenarioState(env, scenarioId);
  if (stateBefore?.isActive) throw new HttpError(409, "MAKE-ADMIN-BRIDGE must be OFF before module 19 repair");
  if (String(stateBefore?.scenario?.name || "") !== expectedScenarioName) throw new HttpError(409, "MAKE-ADMIN-BRIDGE scenario name changed unexpectedly");

  const live = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: "GET" });
  const liveBlueprint = live?.response?.blueprint || live?.blueprint;
  if (!liveBlueprint || typeof liveBlueprint !== "object") throw new HttpError(502, "Make blueprint response did not contain a blueprint object");
  const original = JSON.parse(JSON.stringify(liveBlueprint));
  const patched = JSON.parse(JSON.stringify(liveBlueprint));
  const module = repairMakeAdminFindModule19(patched);
  const record = module?.mapper?.record || {};

  if (record[resultField] === newResult && record[errorField] === newError) {
    const stateAlready = await phase6ScenarioState(env, scenarioId);
    if (stateAlready?.isActive) throw new HttpError(409, "MAKE-ADMIN-BRIDGE became active during idempotent verification");
    return {
      scenario_id: scenarioId,
      scenario_name: expectedScenarioName,
      module_id: 19,
      already_repaired: true,
      scenario_off_before: true,
      scenario_off_after: true,
      full_blueprint_omitted: true,
      blueprint_sha256: await repairSha256Hex(JSON.stringify(liveBlueprint)),
    };
  }

  if (record[resultField] !== oldResult) throw new HttpError(409, "MAKE-ADMIN module 19 Result_JSON mapping no longer matches the expected unsafe baseline");
  if (record[errorField] !== oldError) throw new HttpError(409, "MAKE-ADMIN module 19 Error_Message mapping no longer matches the expected unsafe baseline");
  record[resultField] = newResult;
  record[errorField] = newError;

  const reverted = JSON.parse(JSON.stringify(patched));
  const revertedRecord = repairMakeAdminFindModule19(reverted)?.mapper?.record || {};
  revertedRecord[resultField] = oldResult;
  revertedRecord[errorField] = oldError;
  if (JSON.stringify(reverted) !== JSON.stringify(original)) throw new HttpError(500, "Module 19 patch construction changed more than the two approved mappings");

  const originalSha = await repairSha256Hex(JSON.stringify(original));
  const patchedSha = await repairSha256Hex(JSON.stringify(patched));
  let applied = false;
  try {
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, {
      method: "PATCH",
      body: JSON.stringify({ blueprint: JSON.stringify(patched) }),
    });
    applied = true;
    const after = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: "GET" });
    const actual = after?.response?.blueprint || after?.blueprint;
    if (!actual || JSON.stringify(actual) !== JSON.stringify(patched)) throw new HttpError(502, "Post-write MAKE-ADMIN blueprint does not exactly match the intended module 19 patch");
    const actualRecord = repairMakeAdminFindModule19(actual)?.mapper?.record || {};
    if (actualRecord[resultField] !== newResult || actualRecord[errorField] !== newError) throw new HttpError(502, "MAKE-ADMIN module 19 bounded mappings did not verify");
    const stateAfter = await phase6ScenarioState(env, scenarioId);
    if (stateAfter?.isActive) throw new HttpError(409, "MAKE-ADMIN-BRIDGE became active during module 19 repair");
    return {
      scenario_id: scenarioId,
      scenario_name: expectedScenarioName,
      module_id: 19,
      changed_mapper_fields: [resultField, errorField],
      scenario_off_before: true,
      scenario_off_after: true,
      exact_postwrite_verification: true,
      full_blueprint_omitted: true,
      original_sha256: originalSha,
      patched_sha256: patchedSha,
    };
  } catch (error) {
    if (applied) {
      try {
        await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, {
          method: "PATCH",
          body: JSON.stringify({ blueprint: JSON.stringify(original) }),
        });
        const rolled = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: "GET" });
        const rolledBlueprint = rolled?.response?.blueprint || rolled?.blueprint;
        const rolledState = await phase6ScenarioState(env, scenarioId);
        if (!rolledBlueprint || JSON.stringify(rolledBlueprint) !== JSON.stringify(original) || rolledState?.isActive) {
          throw new Error("rollback verification failed");
        }
      } catch (rollbackError) {
        throw new HttpError(500, `MAKE-ADMIN module 19 repair failed and rollback could not be verified: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    throw error;
  }
}

/*__STUDIO_WORKER_END:repairMakeAdminModule19__*/

export function repairInspectorClone(value, depth = 0) {
  if (depth > 10) return "[depth-limit]";
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}...[truncated:${value.length}]` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => repairInspectorClone(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (/token|secret|password|authorization|api[_-]?key/i.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = repairInspectorClone(child, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}


/*__STUDIO_WORKER_END:repairInspectorClone__*/

export function repairProbeModuleIndex(blueprint) {
  const found = [];
  const walk = (flow, routePath = []) => {
    for (const node of Array.isArray(flow) ? flow : []) {
      found.push({
        id: Number(node?.id || 0),
        module: String(node?.module || ''),
        version: node?.version ?? null,
        name: String(node?.metadata?.designer?.name || ''),
        parameters: repairInspectorClone(node?.parameters || {}),
        mapper: repairInspectorClone(node?.mapper || {}),
        route_path: routePath,
      });
      const routes = Array.isArray(node?.routes) ? node.routes : [];
      routes.forEach((route, index) => walk(route?.flow, [...routePath, { parent_module_id: node?.id, route_index: index }]));
    }
  };
  walk(blueprint?.flow);
  return found;
}
/*__STUDIO_WORKER_END:repairProbeModuleIndex__*/

export async function repairProbeMakeStartScenarioSchema(env) {
  const anchorState = await phase6ScenarioState(env, 5556716);
  const teamId = Number(anchorState?.scenario?.teamId || anchorState?.scenario?.team?.id || 0);
  if (!Number.isInteger(teamId) || teamId <= 0) throw new HttpError(502, 'Make scenario metadata did not expose a usable teamId');

  const evidence = {
    team_id: teamId,
    template_catalog: { attempted: true, accessible: false, templates_scanned: 0, scenario_service_modules: [], error: null },
    scratch: { created: false, deleted: false, scenario_id: null, interface_set: false, scheduling_type: 'on-demand', modules_after_interface: [] },
  };

  try {
    const list = await phase6MakeApiJson(
      env,
      '/templates/public?usedApps%5B%5D=scenario-service&pg%5Blimit%5D=20&pg%5Boffset%5D=0',
      { method: 'GET' },
    );
    const templates = list?.templatesPublic || list?.response?.templatesPublic || [];
    if (Array.isArray(templates)) {
      evidence.template_catalog.accessible = true;
      const moduleMap = new Map();
      for (const template of templates.slice(0, 20)) {
        const templateUrl = String(template?.url || '');
        if (!templateUrl) continue;
        try {
          const bpBody = await phase6MakeApiJson(env, `/templates/public/${encodeURIComponent(templateUrl)}/blueprint`, { method: 'GET' });
          const bp = bpBody?.blueprint || bpBody?.response?.blueprint;
          if (!bp || typeof bp !== 'object') continue;
          evidence.template_catalog.templates_scanned += 1;
          for (const mod of repairProbeModuleIndex(bp)) {
            if (!/scenario/i.test(mod.module) && !/scenario/i.test(mod.name)) continue;
            const key = `${mod.module}|${mod.version}|${mod.name}`;
            if (!moduleMap.has(key)) moduleMap.set(key, mod);
          }
        } catch {}
      }
      evidence.template_catalog.scenario_service_modules = [...moduleMap.values()].slice(0, 40);
    }
  } catch (error) {
    evidence.template_catalog.error = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
  }

  const scratchName = `REPAIR-SCRATCH-START-SCENARIO-PROBE-${Date.now()}`;
  const scratchBlueprint = {
    name: scratchName,
    flow: [],
    metadata: {
      version: 1,
      scenario: {
        roundtrips: 1,
        maxErrors: 3,
        autoCommit: true,
        autoCommitTriggerLast: true,
        sequential: false,
        confidential: false,
        dataloss: false,
        dlq: false,
        freshVariables: false,
      },
      designer: { orphans: [] },
    },
  };

  let scratchId = null;
  try {
    const created = await phase6MakeApiJson(env, '/scenarios?confirmed=true', {
      method: 'POST',
      body: JSON.stringify({
        blueprint: JSON.stringify(scratchBlueprint),
        teamId,
        scheduling: JSON.stringify({ type: 'on-demand' }),
      }),
    });
    scratchId = Number(created?.scenario?.id || created?.response?.scenario?.id || 0);
    if (!Number.isInteger(scratchId) || scratchId <= 0) throw new HttpError(502, 'Make scratch scenario creation did not return an id');
    evidence.scratch.created = true;
    evidence.scratch.scenario_id = scratchId;

    const iface = await phase6MakeApiJson(env, `/scenarios/${scratchId}/interface`, {
      method: 'PATCH',
      body: JSON.stringify({
        interface: {
          input: [{ name: 'output_record_id', type: 'text', default: null, required: true, multiline: false }],
          output: [],
        },
      }),
    });
    const ifaceObj = iface?.interface || iface?.response?.interface || {};
    evidence.scratch.interface_set = Array.isArray(ifaceObj?.input) && ifaceObj.input.some((item) => item?.name === 'output_record_id');

    const after = await phase6MakeApiJson(env, `/scenarios/${scratchId}/blueprint?draft=false`, { method: 'GET' });
    const bp = after?.response?.blueprint || after?.blueprint;
    evidence.scratch.modules_after_interface = repairProbeModuleIndex(bp || {}).slice(0, 20);
  } finally {
    if (Number.isInteger(scratchId) && scratchId > 0) {
      try {
        await phase6MakeApiJson(env, `/scenarios/${scratchId}`, { method: 'DELETE' });
        evidence.scratch.deleted = true;
      } catch (error) {
        evidence.scratch.delete_error = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
      }
    }
  }

  if (evidence.scratch.created && !evidence.scratch.deleted) throw new HttpError(500, 'Disposable Make scratch scenario could not be verified deleted');
  return evidence;
}
/*__STUDIO_WORKER_END:repairProbeMakeStartScenarioSchema__*/

export async function repairListMakeScenariosCompact(env) {
  const anchorScenarioId = 5556716;
  const anchorState = await phase6ScenarioState(env, anchorScenarioId);
  const teamId = Number(anchorState?.scenario?.teamId || anchorState?.scenario?.team?.id || 0);
  if (!Number.isInteger(teamId) || teamId <= 0) throw new HttpError(502, 'Make scenario metadata did not expose a usable teamId');

  const body = await phase6MakeApiJson(
    env,
    `/scenarios?teamId=${teamId}&pg%5Blimit%5D=100&pg%5Boffset%5D=0&pg%5BsortBy%5D=id&pg%5BsortDir%5D=desc`,
    { method: 'GET' },
  );
  const scenarios = body?.scenarios || body?.response?.scenarios || [];
  if (!Array.isArray(scenarios)) throw new HttpError(502, 'Make list scenarios response did not contain scenarios');
  const compact = scenarios.slice(0, 100).map((scenario) => ({
    id: Number(scenario?.id || 0),
    name: String(scenario?.name || ''),
    is_active: scenario?.isActive === true,
    scheduling_type: String(scenario?.scheduling?.type || ''),
    hook_id_present: scenario?.hookId != null,
    type: String(scenario?.type || ''),
  }));
  const onDemand = compact.filter((scenario) => scenario.scheduling_type === 'on-demand').slice(0, 30);
  const inputDetails = [];
  for (const scenario of onDemand) {
    try {
      const ifaceBody = await phase6MakeApiJson(env, `/scenarios/${scenario.id}/interface`, { method: 'GET' });
      const iface = ifaceBody?.interface || ifaceBody?.response?.interface || {};
      const input = Array.isArray(iface?.input) ? iface.input : [];
      inputDetails.push({
        id: scenario.id,
        name: scenario.name,
        is_active: scenario.is_active,
        input_count: input.length,
        inputs: input.slice(0, 20).map((item) => ({
          name: String(item?.name || ''),
          type: String(item?.type || ''),
          required: item?.required === true,
        })),
      });
    } catch (error) {
      inputDetails.push({
        id: scenario.id,
        name: scenario.name,
        is_active: scenario.is_active,
        input_count: null,
        inputs: [],
        interface_error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
      });
    }
  }
  return {
    team_id: teamId,
    returned_count: compact.length,
    page_limit: 100,
    scenarios: compact,
    on_demand_with_interfaces: inputDetails,
  };
}
/*__STUDIO_WORKER_END:repairListMakeScenariosCompact__*/

export async function repairInspectMakeScenarioModules(env, scenarioId, requestedIds) {
  const id = Number(scenarioId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "scenario_id must be a positive integer");
  const wanted = new Set((Array.isArray(requestedIds) ? requestedIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0));
  if (wanted.size > 20) throw new HttpError(400, "At most 20 module_ids may be inspected");
  const state = await phase6ScenarioState(env, id);
  const live = await phase6MakeApiJson(env, `/scenarios/${id}/blueprint?draft=false`, { method: "GET" });
  const blueprint = live?.response?.blueprint || live?.blueprint;
  if (!blueprint || typeof blueprint !== "object") throw new HttpError(502, "Make blueprint response did not contain a blueprint object");
  const found = [];
  const walk = (flow, routePath = []) => {
    for (const node of Array.isArray(flow) ? flow : []) {
      const nodeId = Number(node?.id);
      if (!wanted.size || wanted.has(nodeId)) {
        found.push({
          route_path: routePath,
          module: repairInspectorClone({
            id: node?.id,
            module: node?.module,
            version: node?.version,
            parameters: node?.parameters,
            mapper: node?.mapper,
            metadata: node?.metadata,
          }),
        });
      }
      const routes = Array.isArray(node?.routes) ? node.routes : [];
      routes.forEach((route, index) => walk(route?.flow, [...routePath, { parent_module_id: node?.id, route_index: index, filter: repairInspectorClone(route?.filter || null) }]));
    }
  };
  walk(blueprint?.flow);
  if (wanted.size) {
    const foundIds = new Set(found.map((x) => Number(x?.module?.id)));
    const missing = [...wanted].filter((x) => !foundIds.has(x));
    if (missing.length) throw new HttpError(404, `Requested Make module(s) not found: ${missing.join(",")}`);
  }
  return {
    scenario_id: id,
    scenario_name: String(state?.scenario?.name || ""),
    scenario_active: Boolean(state?.isActive),
    module_count_returned: found.length,
    modules: found,
  };
}

/*__STUDIO_WORKER_END:repairInspectMakeScenarioModules__*/

export function repairR4FindModule(blueprint, moduleId) {
  const matches = [];
  const walk = (flow) => {
    for (const node of Array.isArray(flow) ? flow : []) {
      if (Number(node?.id) === Number(moduleId)) matches.push(node);
      for (const route of Array.isArray(node?.routes) ? node.routes : []) walk(route?.flow);
    }
  };
  walk(blueprint?.flow);
  if (matches.length !== 1) throw new HttpError(409, `Expected exactly one R4 module ${moduleId}; found ${matches.length}`);
  return matches[0];
}
/*__STUDIO_WORKER_END:repairR4FindModule__*/

export function repairR4ModuleMap(blueprint) {
  const map = new Map();
  const walk = (flow) => {
    for (const node of Array.isArray(flow) ? flow : []) {
      const id = Number(node?.id);
      if (!Number.isInteger(id) || map.has(id)) throw new HttpError(409, `R4 blueprint contains an invalid or duplicate module id: ${node?.id}`);
      map.set(id, node);
      for (const route of Array.isArray(node?.routes) ? node.routes : []) walk(route?.flow);
    }
  };
  walk(blueprint?.flow);
  return map;
}
/*__STUDIO_WORKER_END:repairR4ModuleMap__*/

export async function repairR4TokenSelector(env) {
  const scenarioId = 5556716;
  const expectedNamePrefix = 'R4 - Start Remotion Render';
  const tokenFieldId = 'fld8BooS423HQr3KS';
  const broadFormula = 'AND({Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0)';
  const exactFormula = 'AND({Studio_Render_Request_ID}!="",{Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0)';

  const stateBefore = await phase6ScenarioState(env, scenarioId);
  if (stateBefore?.isActive) throw new HttpError(409, 'R4 must be OFF before token-selector repair');
  const scenarioName = String(stateBefore?.scenario?.name || '');
  if (!scenarioName.startsWith(expectedNamePrefix)) throw new HttpError(409, `R4 scenario name changed unexpectedly: ${scenarioName}`);

  const live = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
  const liveBlueprint = live?.response?.blueprint || live?.blueprint;
  if (!liveBlueprint || typeof liveBlueprint !== 'object') throw new HttpError(502, 'R4 live blueprint response did not contain a blueprint object');
  const original = JSON.parse(JSON.stringify(liveBlueprint));
  const originalMap = repairR4ModuleMap(original);
  const module1 = originalMap.get(1);
  const module2 = originalMap.get(2);
  if (module1?.module !== 'airtable:ActionSearchRecords' || String(module1?.mapper?.maxRecords || '') !== '1') throw new HttpError(409, 'R4 module 1 no longer matches the approved SearchRecords baseline');
  if (module2?.module !== 'airtable:ActionUpdateRecords' || module2?.mapper?.id !== '{{1.id}}') throw new HttpError(409, 'R4 module 2 no longer consumes module 1 by record id');

  const currentFormula = String(module1?.mapper?.formula || '');
  const currentClear = module2?.mapper?.record?.[tokenFieldId] === '';
  if (currentFormula === exactFormula && currentClear) {
    return { scenario_id: scenarioId, scenario_name: scenarioName, already_repaired: true, changed_modules: [1,2], scenario_off_before: true, scenario_off_after: true };
  }
  if (currentFormula !== broadFormula) throw new HttpError(409, 'R4 module 1 selector no longer matches the approved broad-selector baseline');

  const patched = JSON.parse(JSON.stringify(original));
  const patchedMap = repairR4ModuleMap(patched);
  const p1 = patchedMap.get(1);
  const p2 = patchedMap.get(2);
  p1.mapper.formula = exactFormula;
  p1.metadata = p1.metadata || {};
  p1.metadata.designer = p1.metadata.designer || {};
  p1.metadata.designer.name = 'Find Exact Tokened Platform Output Ready for Render - Rerender Safe';
  p2.mapper.record = p2.mapper.record || {};
  p2.mapper.record[tokenFieldId] = '';

  if (patchedMap.size !== originalMap.size) throw new HttpError(500, 'R4 token-selector repair changed module count');
  for (const [id, module] of originalMap) {
    if (id === 1 || id === 2) continue;
    if (JSON.stringify(module) !== JSON.stringify(patchedMap.get(id))) throw new HttpError(500, `R4 token-selector repair changed unrelated module ${id}`);
  }
  const originalTop = JSON.parse(JSON.stringify(original)); delete originalTop.flow;
  const patchedTop = JSON.parse(JSON.stringify(patched)); delete patchedTop.flow;
  if (JSON.stringify(originalTop) !== JSON.stringify(patchedTop)) throw new HttpError(500, 'R4 token-selector repair changed unrelated blueprint metadata');

  let applied = false;
  try {
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: 'PATCH', body: JSON.stringify({ blueprint: JSON.stringify(patched) }) });
    applied = true;
    const after = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
    const actual = after?.response?.blueprint || after?.blueprint;
    const actualMap = repairR4ModuleMap(actual);
    const a1 = actualMap.get(1), a2 = actualMap.get(2);
    if (String(a1?.mapper?.formula || '') !== exactFormula || a2?.mapper?.record?.[tokenFieldId] !== '') throw new HttpError(502, 'R4 exact token selector did not verify after write');
    if (actualMap.size !== originalMap.size) throw new HttpError(502, 'R4 post-write module count changed');
    for (const [id, module] of originalMap) {
      if (id === 1 || id === 2) continue;
      if (JSON.stringify(module) !== JSON.stringify(actualMap.get(id))) throw new HttpError(502, `R4 post-write verification found unrelated module change ${id}`);
    }
    const stateAfter = await phase6ScenarioState(env, scenarioId);
    if (stateAfter?.isActive) throw new HttpError(409, 'R4 became active during token-selector repair');
    return { scenario_id: scenarioId, scenario_name: scenarioName, changed_modules: [1,2], preserved_module_count: originalMap.size - 2, exact_formula: true, module2_clears_token: true, scenario_off_before: true, scenario_off_after: true, exact_postwrite_verification: true };
  } catch (error) {
    if (applied) {
      await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, { method: 'PATCH', body: JSON.stringify({ blueprint: JSON.stringify(original) }) });
      const rolled = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
      const rolledBlueprint = rolled?.response?.blueprint || rolled?.blueprint;
      const rolledState = await phase6ScenarioState(env, scenarioId);
      if (!rolledBlueprint || JSON.stringify(rolledBlueprint) !== JSON.stringify(original) || rolledState?.isActive) throw new HttpError(500, 'R4 token-selector repair failed and rollback could not be verified');
    }
    throw error;
  }
}
/*__STUDIO_WORKER_END:repairR4TokenSelector__*/

export async function repairR4ExactOutputEntry(env) {
  const scenarioId = 5556716;
  const expectedNamePrefix = 'R4 - Start Remotion Render';
  const outputTableId = 'tblrlPeboBthkplH0';
  const outputBaseId = 'appe33zkZn35yirTL';
  const expectedFormula = 'AND({Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0)';
  const exactRecordExpression = '{{var.input.output_record_id}}';
  const legacyNullRecordExpression = '{{input.output_record_id}}';
  const requiredInputs = [
    { name: 'test_run_id', type: 'text', default: null, required: false, multiline: false },
    { name: 'output_record_id', type: 'text', default: null, required: false, multiline: false },
    { name: 'platform_output_id', type: 'text', default: null, required: false, multiline: false },
    { name: 'intended_stage', type: 'text', default: 'R4', required: false, multiline: false },
    { name: 'attempt_number', type: 'number', default: 1, required: false },
    { name: 'idempotency_key', type: 'text', default: null, required: false, multiline: false },
  ];

  const canonicalScheduling = { type: 'indefinitely', interval: 900 };
  let stateBefore = await phase6ScenarioState(env, scenarioId);
  if (stateBefore?.isActive) throw new HttpError(409, 'R4 must be OFF before exact-output entrance repair');
  let schedulingRestored = false;
  if (JSON.stringify(stateBefore?.scenario?.scheduling || {}) !== JSON.stringify(canonicalScheduling)) {
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, {
      method: 'PATCH',
      body: JSON.stringify({ scheduling: JSON.stringify(canonicalScheduling) }),
    });
    stateBefore = await phase6ScenarioState(env, scenarioId);
    if (stateBefore?.isActive || JSON.stringify(stateBefore?.scenario?.scheduling || {}) !== JSON.stringify(canonicalScheduling)) {
      throw new HttpError(502, 'R4 canonical scheduling restore did not verify');
    }
    schedulingRestored = true;
  }
  const scenarioName = String(stateBefore?.scenario?.name || '');
  if (!scenarioName.startsWith(expectedNamePrefix)) throw new HttpError(409, `R4 scenario name changed unexpectedly: ${scenarioName}`);

  const live = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
  const liveBlueprint = live?.response?.blueprint || live?.blueprint;
  if (!liveBlueprint || typeof liveBlueprint !== 'object') throw new HttpError(502, 'R4 live blueprint response did not contain a blueprint object');
  const interfaceBody = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/interface`, { method: 'GET' });
  const liveInterface = interfaceBody?.interface || interfaceBody?.response?.interface || {};
  const originalInterface = {
    input: Array.isArray(liveInterface?.input) ? repairInspectorClone(liveInterface.input) : [],
    output: Array.isArray(liveInterface?.output) ? repairInspectorClone(liveInterface.output) : [],
  };

  const existingMap = repairR4ModuleMap(liveBlueprint);
  const existing1 = existingMap.get(1);
  if (!existing1) throw new HttpError(409, 'R4 module 1 is missing');
  const hasExactInterface = requiredInputs.every((required) =>
    originalInterface.input.some((actual) => actual?.name === required.name && actual?.type === required.type && actual?.required === false)
  );
  if (existing1?.module === 'airtable:ActionGetRecord' && existing1?.mapper?.id === exactRecordExpression && hasExactInterface) {
    const stateAlready = await phase6ScenarioState(env, scenarioId);
    if (stateAlready?.isActive) throw new HttpError(409, 'R4 became active during idempotent exact-entry verification');
    return {
      scenario_id: scenarioId,
      scenario_name: scenarioName,
      already_repaired: true,
      changed_modules: [1],
      interface_inputs: requiredInputs.map((item) => item.name),
      exact_record_expression: exactRecordExpression,
      preserved_module_count: existingMap.size - 1,
      scenario_off_before: true,
      scenario_off_after: true,
      no_webhook_required: true,
      make_interface_inputs_optional: true,
      invocation_contract_enforced_by_worker: true,
      scheduling_restored: schedulingRestored,
    };
  }

  const migratingLegacyNullInput =
    existing1?.module === 'airtable:ActionGetRecord' &&
    existing1?.mapper?.id === legacyNullRecordExpression &&
    existing1?.mapper?.base === outputBaseId &&
    existing1?.mapper?.table === outputTableId &&
    String(existing1?.metadata?.designer?.name || '') === '1 - Get Exact Platform Output';
  if (!migratingLegacyNullInput) {
    // ITEM7_R4_EXACT_ENTRY_DRIFT_V8: a later Test Mode hardening pass reintroduced
    // SearchRecords while retaining the exact-entry module label. Accept only that
    // known one-record drift (or the original approved broad selector) so the
    // existing exact-entry migration can restore GetRecord without touching Modules 2+.
    if (existing1?.module !== 'airtable:ActionSearchRecords') throw new HttpError(409, `R4 module 1 type changed unexpectedly: ${existing1?.module}`);
    const liveName = String(existing1?.metadata?.designer?.name || '');
    const approvedNames = new Set([
      'Find One Platform Output Ready for Render - Rerender Safe - Cache Concurrency Guard',
      '1 - Get Exact Platform Output',
    ]);
    if (!approvedNames.has(liveName)) throw new HttpError(409, `R4 module 1 name changed unexpectedly: ${liveName}`);
    const testModeGuardedFormula = `AND({Test_Run_ID}=BLANK(),${expectedFormula})`;
    const liveFormula = String(existing1?.mapper?.formula || '');
    if (![expectedFormula, testModeGuardedFormula].includes(liveFormula) || String(existing1?.mapper?.maxRecords || '') !== '1') {
      throw new HttpError(409, 'R4 module 1 selector no longer matches an approved exact-entry migration baseline');
    }
  }
  const module2 = existingMap.get(2);
  if (module2?.module !== 'airtable:ActionUpdateRecords' || module2?.mapper?.id !== '{{1.id}}') {
    throw new HttpError(409, 'R4 module 2 no longer consumes module 1 by exact record id');
  }

  const original = JSON.parse(JSON.stringify(liveBlueprint));
  const patched = JSON.parse(JSON.stringify(liveBlueprint));
  const exactRecord = repairR4FindModule(patched, 1);
  const originalX = Number(exactRecord?.metadata?.designer?.x || 0);
  const originalY = Number(exactRecord?.metadata?.designer?.y || 0);
  exactRecord.module = 'airtable:ActionGetRecord';
  exactRecord.mapper = { id: exactRecordExpression, base: outputBaseId, table: outputTableId, useColumnId: false };
  exactRecord.metadata = { designer: { x: originalX, y: originalY, name: '1 - Get Exact Platform Output' } };

  const patchedMap = repairR4ModuleMap(patched);
  const originalMap = repairR4ModuleMap(original);
  if (patchedMap.size !== originalMap.size) throw new HttpError(500, 'R4 exact-entry patch changed the module count');
  for (const [id, module] of originalMap) {
    if (id === 1) continue;
    if (JSON.stringify(module) !== JSON.stringify(patchedMap.get(id))) throw new HttpError(500, `R4 exact-entry patch changed unrelated module ${id}`);
  }
  const originalTop = JSON.parse(JSON.stringify(original)); delete originalTop.flow;
  const patchedTop = JSON.parse(JSON.stringify(patched)); delete patchedTop.flow;
  if (JSON.stringify(originalTop) !== JSON.stringify(patchedTop)) throw new HttpError(500, 'R4 exact-entry patch changed unrelated blueprint metadata');

  const patchedInterface = { input: requiredInputs, output: originalInterface.output };
  let blueprintApplied = false;
  let interfaceApplied = false;
  try {
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, {
      method: 'PATCH',
      body: JSON.stringify({ blueprint: JSON.stringify(patched) }),
    });
    blueprintApplied = true;
    await phase6MakeApiJson(env, `/scenarios/${scenarioId}/interface`, {
      method: 'PATCH',
      body: JSON.stringify({ interface: patchedInterface }),
    });
    interfaceApplied = true;

    const after = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
    const actual = after?.response?.blueprint || after?.blueprint;
    if (!actual || typeof actual !== 'object') throw new HttpError(502, 'R4 post-write blueprint could not be read');
    const actualMap = repairR4ModuleMap(actual);
    const actual1 = actualMap.get(1);
    if (actual1?.module !== 'airtable:ActionGetRecord' || actual1?.mapper?.id !== exactRecordExpression || actual1?.mapper?.base !== outputBaseId || actual1?.mapper?.table !== outputTableId) {
      throw new HttpError(502, 'R4 exact GetRecord module did not verify');
    }
    if (actualMap.size !== originalMap.size) throw new HttpError(502, 'R4 post-write module count changed unexpectedly');
    for (const [id, module] of originalMap) {
      if (id === 1) continue;
      if (JSON.stringify(module) !== JSON.stringify(actualMap.get(id))) throw new HttpError(502, `R4 post-write verification found unrelated module change ${id}`);
    }
    const afterInterfaceBody = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/interface`, { method: 'GET' });
    const actualInterface = afterInterfaceBody?.interface || afterInterfaceBody?.response?.interface || {};
    const actualInputs = Array.isArray(actualInterface?.input) ? actualInterface.input : [];
    if (!requiredInputs.every((required) => actualInputs.some((actualInput) => actualInput?.name === required.name && actualInput?.type === required.type && actualInput?.required === false))) {
      throw new HttpError(502, 'R4 exact input interface did not verify');
    }
    const stateAfter = await phase6ScenarioState(env, scenarioId);
    if (stateAfter?.isActive) throw new HttpError(409, 'R4 became active during exact-output entrance repair');
    return {
      scenario_id: scenarioId,
      scenario_name: scenarioName,
      changed_modules: [1],
      interface_inputs: requiredInputs.map((item) => item.name),
      exact_record_expression: exactRecordExpression,
      preserved_module_count: originalMap.size - 1,
      scenario_off_before: true,
      scenario_off_after: true,
      exact_postwrite_verification: true,
      no_webhook_required: true,
      make_interface_inputs_optional: true,
      invocation_contract_enforced_by_worker: true,
    };
  } catch (error) {
    let rollbackError = null;
    try {
      if (blueprintApplied) {
        await phase6MakeApiJson(env, `/scenarios/${scenarioId}?confirmed=true`, {
          method: 'PATCH',
          body: JSON.stringify({ blueprint: JSON.stringify(original) }),
        });
      }
      if (interfaceApplied || blueprintApplied) {
        await phase6MakeApiJson(env, `/scenarios/${scenarioId}/interface`, {
          method: 'PATCH',
          body: JSON.stringify({ interface: originalInterface }),
        });
      }
      const rolled = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: 'GET' });
      const rolledBlueprint = rolled?.response?.blueprint || rolled?.blueprint;
      const rolledInterfaceBody = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/interface`, { method: 'GET' });
      const rolledInterface = rolledInterfaceBody?.interface || rolledInterfaceBody?.response?.interface || {};
      const rolledState = await phase6ScenarioState(env, scenarioId);
      const interfaceMatches = JSON.stringify({
        input: Array.isArray(rolledInterface?.input) ? rolledInterface.input : [],
        output: Array.isArray(rolledInterface?.output) ? rolledInterface.output : [],
      }) === JSON.stringify(originalInterface);
      if (!rolledBlueprint || JSON.stringify(rolledBlueprint) !== JSON.stringify(original) || !interfaceMatches || rolledState?.isActive) {
        throw new Error('R4 blueprint/interface rollback verification failed');
      }
    } catch (rollbackFailure) {
      rollbackError = rollbackFailure instanceof Error ? rollbackFailure.message : String(rollbackFailure);
    }
    if (rollbackError) throw new HttpError(500, `R4 exact-entry repair failed and rollback could not be verified: ${rollbackError}`);
    throw error;
  }
}

/*__STUDIO_WORKER_END:repairR4ExactOutputEntry__*/

export async function repairInspectMakeBlueprintHistory(env, scenarioId, moduleId) {
  const id = Number(scenarioId);
  const targetModuleId = Number(moduleId || 900);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "scenario_id must be a positive integer");
  if (!Number.isInteger(targetModuleId) || targetModuleId <= 0) throw new HttpError(400, "module_id must be a positive integer");

  const rawVersions = await phase6MakeApiJson(env, `/scenarios/${id}/blueprints`, { method: "GET" });
  const rawCandidates = rawVersions?.response?.scenariosBlueprints
    ?? rawVersions?.scenariosBlueprints
    ?? rawVersions?.response?.blueprints
    ?? rawVersions?.blueprints
    ?? (Array.isArray(rawVersions?.response) ? rawVersions.response : null)
    ?? (Array.isArray(rawVersions) ? rawVersions : null)
    ?? [];
  const candidates = Array.isArray(rawCandidates) ? rawCandidates : (rawCandidates && typeof rawCandidates === "object" ? [rawCandidates] : []);

  const versions = [];
  const recent = candidates.slice(0, 60);
  for (const version of recent) {
    const blueprintId = Number(version?.id ?? version?.blueprintId ?? version?.blueprint_id ?? version?.version);
    if (!Number.isInteger(blueprintId) || blueprintId <= 0) continue;
    const body = await phase6MakeApiJson(env, `/scenarios/${id}/blueprint?blueprintId=${blueprintId}`, { method: "GET" });
    const blueprint = body?.response?.blueprint || body?.blueprint;
    let target = null;
    const walk = (flow) => {
      for (const node of Array.isArray(flow) ? flow : []) {
        if (Number(node?.id) === targetModuleId) target = node;
        for (const route of Array.isArray(node?.routes) ? node.routes : []) walk(route?.flow);
      }
    };
    if (blueprint && typeof blueprint === "object") walk(blueprint.flow);
    versions.push({
      blueprint_id: blueprintId,
      created_at: String(version?.createdAt || version?.created_at || version?.created || version?.timestamp || ""),
      is_draft: Boolean(version?.draft ?? version?.isDraft ?? version?.is_draft),
      target_module_present: Boolean(target),
      target_module_type: target ? String(target?.module || "") : null,
      target_hook_id: target ? Number(target?.parameters?.hook || target?.mapper?.hook || 0) || null : null,
      target_module_name: target ? String(target?.metadata?.designer?.name || "") : null,
    });
  }
  return {
    scenario_id: id,
    module_id: targetModuleId,
    version_count_returned: versions.length,
    versions,
  };
}

/*__STUDIO_WORKER_END:repairInspectMakeBlueprintHistory__*/

export async function repairInspectMakeExecution(env, scenarioId, executionId) {
  const id = Number(scenarioId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "scenario_id must be a positive integer");
  const execution = repairString(executionId, "execution_id", 100);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(execution)) throw new HttpError(400, "execution_id format is invalid");
  const body = await phase6MakeApiJson(env, `/scenarios/${id}/executions/${execution}`, { method: "GET" });
  const details = body?.response || body?.execution || body || {};
  return {
    scenario_id: id,
    execution_id: execution,
    status: String(details?.status || ""),
    details: repairInspectorClone(details),
  };
}
/*__STUDIO_WORKER_END:repairInspectMakeExecution__*/

export async function adminRepairControlStatus(request, env) {
  const records = await repairLeaseRecords(env);
  const leases = records.map(repairLeaseState).map((l) => ({
    lease_id: l.lease_id,
    test_run_id: l.test_run_id,
    scenario_id: l.scenario_id,
    expires_at: l.expires_at,
    operations_used: l.operations_used,
    max_operations: Number(l.contract.max_operations || 0),
    runs_used: l.runs_used,
    max_runs: Number(l.contract.max_runs || 0),
    allowed_platform_output_record_ids: l.contract.allowed_platform_output_record_ids || [],
    allowed_content_item_record_ids: l.contract.allowed_content_item_record_ids || [],
    allow_public_publish: l.contract.allow_public_publish === true,
  }));
  return respond(request, env, { ok: true, repair_control: "lease-v1", run_enabled: false, leases });
}
/*__STUDIO_WORKER_END:adminRepairControlStatus__*/

export async function adminRepairControl(request, env, authorization) {
  const input = await request.json();
  const action = repairString(input?.action, "action", 40).toLowerCase();
  if (action === "probe_make_start_scenario_schema") {
    const confirm = repairString(input?.confirm, "confirm", 80);
    if (confirm !== "PROBE-MAKE-START-SCENARIO-SCHEMA-V1") throw new HttpError(400, "Start Scenario schema probe confirmation is required");
    const probe = await repairProbeMakeStartScenarioSchema(env);
    return respond(request, env, { ok: true, action, probe });
  }
  if (action === "list_make_scenarios_compact") {
    const confirm = repairString(input?.confirm, "confirm", 80);
    if (confirm !== "LIST-MAKE-SCENARIOS-COMPACT-V1") throw new HttpError(400, "Compact Make scenario inventory confirmation is required");
    const inventory = await repairListMakeScenariosCompact(env);
    return respond(request, env, { ok: true, action, inventory });
  }
  if (action === "repair_r4_token_selector") {
    const confirm = repairString(input?.confirm, "confirm", 80);
    if (confirm !== "REPAIR-R4-TOKEN-SELECTOR-V1") throw new HttpError(400, "Exact R4 token selector confirmation is required");
    const repaired = await repairR4TokenSelector(env);
    return respond(request, env, { ok: true, action, repaired });
  }
  if (action === "repair_r4_exact_output_entry") {
    const confirm = repairString(input?.confirm, "confirm", 80);
    if (confirm !== "REPAIR-R4-EXACT-OUTPUT-ENTRY-V1") throw new HttpError(400, "Exact R4 entrance repair confirmation is required");
    const repaired = await repairR4ExactOutputEntry(env);
    return respond(request, env, { ok: true, action, repaired });
  }
  if (action === "inspect_make_execution") {
    const confirm = repairString(input?.confirm, "confirm", 80);
    if (confirm !== "INSPECT-MAKE-EXECUTION-V1") throw new HttpError(400, "Exact Make execution inspection confirmation is required");
    const inspected = await repairInspectMakeExecution(env, input?.scenario_id, input?.execution_id);
    return respond(request, env, { ok: true, action, inspected });
  }
  if (action === "inspect_make_scenario") {
    const confirm = repairString(input?.confirm, "confirm", 80);
    if (confirm !== "INSPECT-MAKE-MODULES-V1") throw new HttpError(400, "Exact Make module inspection confirmation is required");
    const inspected = await repairInspectMakeScenarioModules(env, input?.scenario_id, input?.module_ids);
    return respond(request, env, { ok: true, action, inspected });
  }
  if (action === "inspect_make_blueprint_history") {
    const confirm = repairString(input?.confirm, "confirm", 80);
    if (confirm !== "INSPECT-MAKE-BLUEPRINT-HISTORY-V1") throw new HttpError(400, "Make blueprint history inspection confirmation is required");
    const inspected = await repairInspectMakeBlueprintHistory(env, input?.scenario_id, input?.module_id);
    return respond(request, env, { ok: true, action, inspected });
  }
  if (action === "repair_make_admin_module19") {
    const confirm = repairString(input?.confirm, "confirm", 80);
    if (confirm !== "REPAIR-MAKE-ADMIN-MODULE19-V1") throw new HttpError(400, "Exact module 19 repair confirmation is required");
    const repaired = await repairMakeAdminModule19(env);
    return respond(request, env, { ok: true, action, repaired });
  }
  if (action === "sweep") {
    return respond(request, env, { ok: true, action, swept: await repairSweepExpiredLeases(env) });
  }
  if (action === "acquire") {
    const result = await repairAcquireLease(env, input, authorization);
    return respond(request, env, { ok: true, action, ...result });
  }
  const result = await repairControlAction(env, input);
  return respond(request, env, { ok: true, ...result });
}
/*__STUDIO_WORKER_END:adminRepairControl__*/

export async function adminMakeDeployPage(request, env, authorization) {
  const displayName = String(authorization?.user?.display_name || authorization?.email || "Studio admin");
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ChicagoShining Studio Admin Deploy</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f3f7f7;color:#102829;margin:0}
main{max-width:900px;margin:40px auto;background:white;border:1px solid #d7e4e3;border-radius:16px;padding:28px}
h1{margin-top:0} label{display:block;font-weight:650;margin:16px 0 6px}
input,textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bfd1d0;border-radius:8px}
button{margin-top:20px;background:#087f78;color:white;border:0;border-radius:9px;padding:12px 18px;font-weight:700;cursor:pointer}
pre{background:#102829;color:#dff8f5;padding:16px;border-radius:10px;white-space:pre-wrap;overflow:auto}
.note{background:#fff8df;border:1px solid #ecd98d;padding:12px;border-radius:8px}
</style>
</head>
<body><main>
<h1>Studio Admin — Make Blueprint Deploy</h1>
<p>Signed in as ${escapeHtml(displayName)}. This deployer uses the Studio API Worker's server-side Airtable credential and reads the Make API credential from Pipeline Settings. No local AIRTABLE_PAT is used or requested.</p>
<div class="note"><strong>Safety:</strong> The current live blueprint is backed up to the Make Admin Queue before the Make PATCH is attempted. Scheduling/activation are not changed.</div>
<label>Scenario ID</label><input id="scenario" type="number" value="5556716">
<label>Expected current name</label><input id="expected" value="R4 - Start Remotion Render v2.4.1 - Remotion Props toString Fix">
<label>Blueprint JSON file</label><input id="file" type="file" accept=".json,application/json">
<label>Correlation ID</label><input id="correlation" value="P020-PHASE6-R4-V25">
<button id="deploy">Validate, back up, and deploy</button>
<pre id="out">Ready.</pre>
<script>
const out=document.getElementById('out');
document.getElementById('deploy').addEventListener('click', async () => {
  const f=document.getElementById('file').files[0];
  if(!f){out.textContent='Choose the blueprint JSON file first.';return;}
  let blueprint;
  try{ blueprint=JSON.parse(await f.text()); }catch(e){out.textContent='Invalid JSON: '+e.message;return;}
  const body={
    scenario_id:Number(document.getElementById('scenario').value),
    expected_current_name:document.getElementById('expected').value.trim(),
    correlation_id:document.getElementById('correlation').value.trim(),
    blueprint
  };
  out.textContent='Working...';
  try{
    const r=await fetch('/api/admin/make-deploy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const t=await r.text();
    out.textContent=t;
  }catch(e){out.textContent='Request failed: '+e.message;}
});
</script>
</main></body></html>`;
  return respondHtml(request, env, html);
}
/*__STUDIO_WORKER_END:adminMakeDeployPage__*/

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
/*__STUDIO_WORKER_END:escapeHtml__*/

export async function adminMakeDeploy(request, env, authorization) {
  const input = await request.json();
  const scenarioId = Number(input?.scenario_id);
  const expectedCurrentName = String(input?.expected_current_name || "").trim();
  const correlationId = String(input?.correlation_id || `STUDIO-MAKE-DEPLOY-${Date.now()}`).trim();
  const blueprint = input?.blueprint;

  if (!Number.isInteger(scenarioId) || scenarioId <= 0) {
    throw new HttpError(400, "scenario_id must be a positive integer");
  }
  if (!blueprint || typeof blueprint !== "object" || Array.isArray(blueprint)) {
    throw new HttpError(400, "blueprint must be a JSON object");
  }
  const newName = String(blueprint?.name || "").trim();
  if (!newName) throw new HttpError(400, "blueprint.name is required");

  const settings = await listPipelineSettingsForAdmin(env);
  const makeApiBase = pipelineSettingValue(settings, "MAKE_API_BASE_URL").replace(/\/+$/, "");
  const makeApiToken = pipelineSettingValue(settings, "MAKE_API_TOKEN");
  if (!makeApiBase || !makeApiToken) {
    throw new HttpError(500, "Active MAKE_API_BASE_URL and MAKE_API_TOKEN are required in Pipeline Settings");
  }

  const makeHeaders = {
    Authorization: `Token ${makeApiToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const liveResponse = await fetch(`${makeApiBase}/scenarios/${scenarioId}/blueprint?draft=false`, {
    method: "GET",
    headers: makeHeaders,
  });
  const liveText = await liveResponse.text();
  let liveBody;
  try { liveBody = liveText ? JSON.parse(liveText) : {}; } catch { liveBody = { raw: liveText }; }
  if (!liveResponse.ok) {
    throw new HttpError(liveResponse.status, `Make live blueprint read failed (${liveResponse.status})`);
  }

  const liveBlueprint = liveBody?.response?.blueprint || liveBody?.blueprint || null;
  if (!liveBlueprint || typeof liveBlueprint !== "object") {
    throw new HttpError(502, "Make did not return a usable live blueprint");
  }
  const liveName = String(liveBlueprint?.name || "").trim();

  if (expectedCurrentName && liveName !== expectedCurrentName && liveName !== newName) {
    throw new HttpError(
      409,
      `Live scenario name "${liveName}" does not match expected baseline "${expectedCurrentName}" or requested target "${newName}". No write attempted.`
    );
  }

  if (liveName === newName) {
    return respond(request, env, {
      ok: true,
      already_deployed: true,
      scenario_id: scenarioId,
      live_name: liveName,
      local_airtable_pat_used: false,
    });
  }

  const requestedAt = new Date().toISOString();
  const backupBlueprint = JSON.stringify(liveBlueprint);
  const proposedBlueprint = JSON.stringify(blueprint);

  const auditCreate = await airtableFetch(env, "Make Admin Queue", "", {
    method: "POST",
    body: JSON.stringify({
      records: [{
        fields: {
          Command_ID: `STUDIO-ADMIN-${Date.now()}`,
          Action: "UPDATE_BLUEPRINT",
          Scenario_ID: scenarioId,
          Scenario_Name: newName,
          Proposed_Blueprint_JSON_Original: proposedBlueprint,
          Write_Approved: true,
          Status: "Processing",
          Backup_Blueprint_Wrapper_2: backupBlueprint,
          Requested_At: requestedAt,
          Started_At: requestedAt,
          Requested_By: String(authorization?.email || "studio-admin"),
          Correlation_ID: correlationId,
          Notes: "Server-side Studio Admin deployment. Uses Cloudflare Worker AIRTABLE_PAT and Make API credentials stored in Pipeline Settings; no local AIRTABLE_PAT. Live blueprint backed up before PATCH. Scheduling/activation unchanged.",
        },
      }],
      typecast: true,
    }),
  });
  const auditId = auditCreate?.records?.[0]?.id;
  if (!auditId) throw new HttpError(502, "Could not create Make Admin Queue audit record");

  let patchBody = null;
  let patchStatus = null;
  try {
    const patchResponse = await fetch(`${makeApiBase}/scenarios/${scenarioId}`, {
      method: "PATCH",
      headers: makeHeaders,
      body: JSON.stringify({ blueprint: proposedBlueprint }),
    });
    patchStatus = patchResponse.status;
    const patchText = await patchResponse.text();
    try { patchBody = patchText ? JSON.parse(patchText) : {}; } catch { patchBody = { raw: patchText }; }
    if (!patchResponse.ok) {
      throw new Error(`Make scenario PATCH failed (${patchResponse.status})`);
    }

    const verifyResponse = await fetch(`${makeApiBase}/scenarios/${scenarioId}/blueprint?draft=false`, {
      method: "GET",
      headers: makeHeaders,
    });
    const verifyText = await verifyResponse.text();
    let verifyBody;
    try { verifyBody = verifyText ? JSON.parse(verifyText) : {}; } catch { verifyBody = { raw: verifyText }; }
    if (!verifyResponse.ok) throw new Error(`Make post-deploy blueprint read failed (${verifyResponse.status})`);
    const verifiedBlueprint = verifyBody?.response?.blueprint || verifyBody?.blueprint || null;
    const verifiedName = String(verifiedBlueprint?.name || "").trim();
    if (verifiedName !== newName) {
      throw new Error(`Post-deploy verification mismatch. Expected "${newName}", got "${verifiedName}"`);
    }

    const completedAt = new Date().toISOString();
    await airtableFetch(env, "Make Admin Queue", auditId, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Status: "Succeeded",
          Completed_At: completedAt,
          Result_JSON: JSON.stringify({
            ok: true,
            scenario_id: scenarioId,
            previous_name: liveName,
            deployed_name: verifiedName,
            make_patch_status: patchStatus,
            local_airtable_pat_used: false,
          }),
          Error_Message: "",
        },
      }),
    });

    return respond(request, env, {
      ok: true,
      scenario_id: scenarioId,
      previous_name: liveName,
      deployed_name: verifiedName,
      audit_record_id: auditId,
      backup_preserved: true,
      scheduling_changed: false,
      activation_changed: false,
      local_airtable_pat_used: false,
    });
  } catch (error) {
    try {
      await airtableFetch(env, "Make Admin Queue", auditId, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Status: "Failed",
            Completed_At: new Date().toISOString(),
            Error_Message: String(error?.message || error),
            Result_JSON: JSON.stringify({
              ok: false,
              scenario_id: scenarioId,
              make_patch_status: patchStatus,
              local_airtable_pat_used: false,
            }),
          },
        }),
      });
    } catch {}
    throw error instanceof HttpError ? error : new HttpError(502, String(error?.message || error));
  }
}
/*__STUDIO_WORKER_END:adminMakeDeploy__*/

export function studioIdeaBatchRecordIdFromPath(url) {
  const match = /^\/api\/ideas\/generate\/(rec[A-Za-z0-9]+)$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid idea-generation batch path");
  return match[1];
}
/*__STUDIO_WORKER_END:studioIdeaBatchRecordIdFromPath__*/

export function studioIdeaBatchView(record) {
  const requested = Math.max(0, Number(f(record, "Requested_Count")) || 0);
  const candidates = Array.isArray(f(record, "Idea Candidates")) ? f(record, "Idea Candidates") : [];
  return {
    id: record.id,
    batch_id: String(f(record, "Batch_ID") || ""),
    status: String(f(record, "Status") || "Pending"),
    requested_count: requested,
    generated_count: candidates.length,
    quality: String(f(record, "Quality") || "Balanced"),
    requested_at: f(record, "Requested_At") || null,
    completed_at: f(record, "Completed_At") || null,
    error: f(record, "Error") || null,
  };
}
/*__STUDIO_WORKER_END:studioIdeaBatchView__*/

export async function studioIdeaManualBatchStillRunning(env, batchId) {
  const batch = await airtableFetch(env, STUDIO_IDEA_BATCH_TABLE_ID, batchId).catch(() => null);
  if (!batch) return false;
  const status = String(f(batch, "Status") || "").trim();
  if (!["Pending", "Running"].includes(status)) return false;
  const requestedAt = Date.parse(String(f(batch, "Requested_At") || batch.createdTime || ""));
  const ageMs = Number.isFinite(requestedAt) ? Date.now() - requestedAt : Infinity;
  // Abandoned waitUntil / crashed clears left Pending forever; only a fresh
  // batch should block Generate.
  return ageMs <= 20 * 60 * 1000;
}
/*__STUDIO_WORKER_END:studioIdeaManualBatchStillRunning__*/

export async function studioIdeaEnabledProfile(env, authorization, profileId) {
  let profile = await resolveWorkingContentProfile(env, authorization, profileId);
  if (!Boolean(f(profile, "Active"))) throw new HttpError(409, "The selected content profile is not active");
  const existingBatchIds = linkedRecordIds(f(profile, "Manual_Idea_Batch"));
  if (!existingBatchIds.length) return profile;

  let liveLock = false;
  for (const batchId of existingBatchIds) {
    if (await studioIdeaManualBatchStillRunning(env, batchId)) {
      liveLock = true;
      break;
    }
  }
  if (liveLock) {
    throw new HttpError(409, "Another manual idea batch is already starting. Try again after it finishes.");
  }
  // Stale Complete/Failed/expired Manual_Idea_Batch links used to hard-block
  // Generate forever (NYC locked on IDEAS-20260922 after a missed clear).
  await studioIdeaClearProfileOverrides(env, profile.id);
  profile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profile.id);
  return profile;
}
/*__STUDIO_WORKER_END:studioIdeaEnabledProfile__*/

export async function studioIdeaCreateBatch(env, profile, count, quality, authorization) {
  const stamp = new Date().toISOString();
  const random = crypto.randomUUID().split("-")[0].toUpperCase();
  const batchId = `IDEAS-${stamp.slice(0, 10).replace(/-/g, "")}-${random}`;
  const body = await airtableFetch(env, STUDIO_IDEA_BATCH_TABLE_ID, "", {
    method: "POST",
    body: JSON.stringify({
      records: [{ fields: {
        Batch_ID: batchId,
        Status: "Pending",
        Requested_Count: count,
        Quality: quality,
        Generated_Count: 0,
        Requested_At: stamp,
        Requested_By: authorization?.email || null,
        Content_Profile: [profile.id],
      }}],
      typecast: true,
    }),
  });
  const record = body?.records?.[0];
  if (!record?.id) throw new HttpError(502, "Studio could not create the idea-generation batch");
  return record;
}
/*__STUDIO_WORKER_END:studioIdeaCreateBatch__*/

export async function studioIdeaUpdateBatch(env, recordId, fields) {
  return airtableFetch(env, STUDIO_IDEA_BATCH_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:studioIdeaUpdateBatch__*/

export async function studioIdeaSetProfileOverrides(env, profileId, batchRecordId, count, quality) {
  return airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Manual_Idea_Count_Override: count,
        Manual_Idea_Quality_Override: quality,
        Manual_Idea_Batch: [batchRecordId],
      },
      typecast: true,
    }),
  });
}
/*__STUDIO_WORKER_END:studioIdeaSetProfileOverrides__*/

export async function studioIdeaClearProfileOverrides(env, profileId) {
  return airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Manual_Idea_Count_Override: null,
        Manual_Idea_Quality_Override: null,
        Manual_Idea_Batch: [],
      },
      typecast: true,
    }),
  });
}
/*__STUDIO_WORKER_END:studioIdeaClearProfileOverrides__*/

export function studioIdeaUnwrapBlueprint(body) {
  const value = body?.blueprint ?? body?.response?.blueprint ?? body;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === "object" ? value : null;
}
/*__STUDIO_WORKER_END:studioIdeaUnwrapBlueprint__*/

export async function studioIdeaReadI1Blueprint(env) {
  const body = await phase6MakeApiJson(env, `/scenarios/${STUDIO_IDEA_I1_SCENARIO_ID}/blueprint?draft=false`, { method: "GET" });
  const blueprint = studioIdeaUnwrapBlueprint(body);
  if (!blueprint?.flow) throw new HttpError(502, "I1 did not return a usable live blueprint");
  return blueprint;
}
/*__STUDIO_WORKER_END:studioIdeaReadI1Blueprint__*/

export async function studioIdeaWriteI1Blueprint(env, blueprint) {
  await phase6MakeApiJson(env, `/scenarios/${STUDIO_IDEA_I1_SCENARIO_ID}?confirmed=true`, {
    method: "PATCH",
    body: JSON.stringify({ blueprint: JSON.stringify(blueprint) }),
  });
}
/*__STUDIO_WORKER_END:studioIdeaWriteI1Blueprint__*/

export async function studioIdeaInstallExactProfileSelector(env, profileId) {
  const original = await studioIdeaReadI1Blueprint(env);
  const patched = JSON.parse(JSON.stringify(original));
  const module2 = phase6FindModule(patched.flow, 2);
  if (!module2 || module2.module !== "airtable:ActionSearchRecords") {
    throw new HttpError(409, "I1 Module 2 profile selector contract has drifted");
  }
  module2.mapper = module2.mapper || {};
  // Daily I1 uses view "I1 - Enabled Profiles". Manual runs must ignore that view
  // or LA/NYC (checkbox off) return zero rows even with an exact RECORD_ID formula.
  delete module2.mapper.view;
  module2.mapper.formula = `AND(RECORD_ID()="${String(profileId).replace(/"/g, "")}",{Active}=1)`;
  module2.mapper.maxRecords = "1";
  await studioIdeaWriteI1Blueprint(env, patched);
  const verified = await studioIdeaReadI1Blueprint(env);
  const verified2 = phase6FindModule(verified.flow, 2);
  if (
    String(verified2?.mapper?.formula || "") !== module2.mapper.formula
    || String(verified2?.mapper?.maxRecords || "") !== "1"
    || verified2?.mapper?.view
  ) {
    throw new HttpError(502, "I1 exact-profile selector verification failed");
  }
  return original;
}
/*__STUDIO_WORKER_END:studioIdeaInstallExactProfileSelector__*/

export async function studioIdeaExecuteBatch(env, profile, batchRecord) {
  let originalBlueprint = null;
  let started = false;
  const startedAt = new Date().toISOString();
  try {
    await studioIdeaUpdateBatch(env, batchRecord.id, { Status: "Running", Started_At: startedAt, Error: null });
    if (pipelineStageBackend(env, "I1").mode === "python") {
      const requested = Math.max(0, Number(f(batchRecord, "Requested_Count")) || 0);
      const quality = String(f(profile, "Manual_Idea_Quality_Override") || f(batchRecord, "Quality") || "Balanced").trim();
      const { response, payload } = await item4PulsePipelineStage(env, "i1", {
        extra: {
          profile_record_id: profile.id,
          batch_record_id: batchRecord.id,
          requested_count: requested,
          quality,
        },
      }, "I1");
      if (!response.ok || payload?.status === "error") {
        throw new HttpError(502, payload?.message || `Python I1 returned HTTP ${response.status}`);
      }
      const created = Number(payload?.details?.run?.created_count || 0);
      if (requested > 0 && created < requested) {
        throw new HttpError(504, `I1 finished without creating all requested ideas (${created} of ${requested}).`);
      }
      return;
    }
    originalBlueprint = await studioIdeaInstallExactProfileSelector(env, profile.id);
    await phase6SetScenarioActive(env, STUDIO_IDEA_I1_SCENARIO_ID, true);
    started = true;

    // Manual generation must explicitly request one execution. Some Make schedule
    // types launch immediately on /start while others only become active. Calling
    // /run makes the one-shot contract deterministic; if /start already launched
    // the execution, Make returns a running/422 response and we simply keep the
    // activation-triggered run.
    let executionId = null;
    try {
      const run = await phase6RunScenario(env, STUDIO_IDEA_I1_SCENARIO_ID);
      executionId = run?.executionId || null;
    } catch (runError) {
      const message = String(runError?.message || runError || "");
      if (!/422|already.*running|currently.*running|active execution/i.test(message)) throw runError;
    }
    if (executionId) {
      await studioIdeaUpdateBatch(env, batchRecord.id, { Make_Execution_ID: String(executionId) });
    }
    // Wait on Airtable candidates, not Make GET /executions/:id. That route 404s
    // while I1 is still running, which used to fail the batch and stop I1.
    const requested = Math.max(0, Number(f(batchRecord, "Requested_Count")) || 0);
    const deadline = Date.now() + 180000;
    let generated = 0;
    while (Date.now() < deadline) {
      const current = await airtableFetch(env, STUDIO_IDEA_BATCH_TABLE_ID, batchRecord.id);
      generated = studioIdeaBatchView(current).generated_count;
      if (requested > 0 && generated >= requested) break;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    if (requested > 0 && generated < requested) {
      throw new HttpError(504, `I1 finished without creating all requested ideas (${generated} of ${requested}).`);
    }
  } catch (error) {
    try {
      await studioIdeaUpdateBatch(env, batchRecord.id, {
        Status: "Failed",
        Completed_At: new Date().toISOString(),
        Error: String(error?.message || error || "Idea generation failed").slice(0, 10000),
      });
    } catch {}
    throw error;
  } finally {
    if (started) {
      try { await phase6StopScenarioVerified(env, STUDIO_IDEA_I1_SCENARIO_ID, 4); } catch (error) { console.error("Could not restore I1 OFF", error); }
    }
    if (originalBlueprint) {
      try { await studioIdeaWriteI1Blueprint(env, originalBlueprint); } catch (error) { console.error("Could not restore I1 blueprint", error); }
    }
    try { await studioIdeaClearProfileOverrides(env, profile.id); } catch (error) { console.error("Could not clear manual idea overrides", error); }
  }
}
/*__STUDIO_WORKER_END:studioIdeaExecuteBatch__*/

export async function studioIdeaStartPhotoListening(env, authorization, createdIds) {
  const photoListening = [];
  for (const ideaId of createdIds || []) {
    try {
      let idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaId);
      const contentType = ideaPhotoAutoListenContentType(idea);
      let waitStatus = String(f(idea, "Studio_Photo_Wait_Status") || "").trim();
      if (!waitStatus && !ideaHasExplicitPhotoProductionConfig(idea)) {
        const range = ideaPhotoWatchRange(idea, contentType);
        idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              Production_Content_Type: contentType,
              Production_Carousel_Image_Mode: "Manual Upload",
              Production_Carousel_Slide_Count_Mode: "Target range",
              Production_Carousel_Slide_Count_Min: range.min,
              Production_Carousel_Slide_Count_Max: range.max,
              Production_Carousel_Slide_Count: range.max,
              Studio_Photo_Wait_Status: "Waiting",
            },
            typecast: true,
          }),
        });
        waitStatus = "Waiting";
      }
      if (!["Waiting", "Ready"].includes(waitStatus)) continue;
      const draft = await existingDraftForIdea(env, idea.id, authorization)
        || await createDraftForIdea(env, idea, authorization);
      photoListening.push(await evaluateAndMaybeAttachWaitingIdeaPhotos(env, idea, {
        authorization,
        force: false,
        productionRequest: draft,
      }));
    } catch (error) {
      console.warn("generated idea automatic photo listening failed", ideaId, error);
      photoListening.push({ action: "error", idea_id: ideaId, error: error?.message || String(error) });
    }
  }
  return photoListening;
}
/*__STUDIO_WORKER_END:studioIdeaStartPhotoListening__*/

export async function studioIdeaRunPythonBatch(env, authorization, profile, batch, count, quality) {
  await studioIdeaUpdateBatch(env, batch.id, {
    Status: "Running",
    Started_At: new Date().toISOString(),
    Error: null,
  });

  let pulse;
  try {
    pulse = await item4PulsePipelineStage(env, "i1", {
      extra: {
        profile_record_id: profile.id,
        batch_record_id: batch.id,
        requested_count: count,
        quality,
        trigger_i2: false,
      },
    }, "I1");
  } catch (error) {
    console.error("Studio idea generation could not reach Python I1", error);
    throw error instanceof HttpError
      ? error
      : new HttpError(502, `Python I1 request failed: ${String(error?.message || error)}`);
  }

  const { response, payload: result } = pulse;
  if (!response.ok || result?.status === "error") {
    throw new HttpError(
      response.status >= 400 ? response.status : 502,
      result?.message || result?.error || `Python I1 returned HTTP ${response.status}`
    );
  }

  const run = result?.details?.run || {};
  const created = Math.max(0, Number(run.created_count || 0));
  if (created < count) {
    throw new HttpError(
      502,
      run.reason
        ? `Python I1 created ${created} of ${count} requested ideas (${run.reason}).`
        : `Python I1 created ${created} of ${count} requested ideas.`
    );
  }

  const createdIds = Array.isArray(run.created_record_ids)
    ? run.created_record_ids.map((id) => String(id || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id))
    : [];
  const photoListening = await studioIdeaStartPhotoListening(env, authorization, createdIds);
  await studioIdeaUpdateBatch(env, batch.id, {
    Status: "Complete",
    Generated_Count: created,
    Completed_At: new Date().toISOString(),
    Error: null,
  });
  return { created, createdIds, photoListening };
}
/*__STUDIO_WORKER_END:studioIdeaRunPythonBatch__*/

export async function startStudioIdeaGeneration(request, env, authorization, ctx = null) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const count = Number(payload?.count);
  const quality = String(payload?.quality || "Highest Quality").trim();
  if (!Number.isInteger(count) || count < STUDIO_IDEA_MIN_COUNT || count > STUDIO_IDEA_MAX_COUNT) {
    throw new HttpError(400, "Idea count must be a whole number from 1 to 10");
  }
  if (!STUDIO_IDEA_ALLOWED_QUALITIES.has(quality)) {
    throw new HttpError(400, "Quality must be Highest Quality, Balanced, or Quantity");
  }

  const profileId = requestedProfileId(null, payload);
  // Blocks a second Generate while Manual_Idea_Batch is still linked.
  const profile = await studioIdeaEnabledProfile(env, authorization, profileId);
  const batch = await studioIdeaCreateBatch(env, profile, count, quality, authorization);
  await studioIdeaSetProfileOverrides(env, profile.id, batch.id, count, quality);

  // Mobile Safari aborts long sync Generate posts ("Fetch is aborted") while I1
  // + photo listening still run. Accept the batch immediately and finish in
  // waitUntil; the UI already polls /api/ideas/generate/:batchId.
  const finish = async () => {
    try {
      return await studioIdeaRunPythonBatch(env, authorization, profile, batch, count, quality);
    } catch (error) {
      try {
        await studioIdeaUpdateBatch(env, batch.id, {
          Status: "Failed",
          Completed_At: new Date().toISOString(),
          Error: String(error?.message || error || "Idea generation failed").slice(0, 10000),
        });
      } catch {}
      throw error;
    } finally {
      try { await studioIdeaClearProfileOverrides(env, profile.id); } catch (error) {
        console.error("Could not clear manual idea overrides", error);
      }
    }
  };

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(finish().catch((error) => {
      console.error("Studio idea generation background finish failed", batch.id, error);
    }));
    return respond(request, env, {
      ok: true,
      accepted: true,
      completed: false,
      status: "Pending",
      batch_record_id: batch.id,
      batch_id: String(f(batch, "Batch_ID") || ""),
      requested_count: count,
      quality,
      profile_record_id: profile.id,
      backend: "python",
      message: `Generating ${count} idea${count === 1 ? "" : "s"}…`,
    }, 202);
  }

  const { created, photoListening } = await finish();
  return respond(request, env, {
    ok: true,
    accepted: true,
    completed: true,
    status: "Complete",
    created_count: created,
    requested_count: count,
    quality,
    profile_record_id: profile.id,
    batch_record_id: batch.id,
    backend: "python",
    photo_listening_started: photoListening.filter((row) => row.action !== "error").length,
    photo_matches_ready: photoListening.filter((row) => row.action === "ready").length,
    message: `${created} idea${created === 1 ? "" : "s"} created. Ideas are listening for photos automatically.`,
  }, 200);
}
/*__STUDIO_WORKER_END:startStudioIdeaGeneration__*/

export async function studioIdeaGenerationStatus(request, env, url) {
  const recordId = studioIdeaBatchRecordIdFromPath(url);
  let record = await airtableFetch(env, STUDIO_IDEA_BATCH_TABLE_ID, recordId);
  let view = studioIdeaBatchView(record);
  const now = Date.now();
  const requestedAt = view.requested_at ? Date.parse(view.requested_at) : now;
  const ageMs = Number.isFinite(requestedAt) ? Math.max(0, now - requestedAt) : 0;
  const updates = {};

  if (view.generated_count !== Number(f(record, "Generated_Count") || 0)) updates.Generated_Count = view.generated_count;
  if (view.requested_count > 0 && view.generated_count >= view.requested_count && view.status !== "Complete") {
    updates.Status = "Complete";
    updates.Completed_At = new Date().toISOString();
    updates.Error = null;
  } else if (["Pending", "Running"].includes(view.status) && ageMs > 15 * 60 * 1000) {
    updates.Status = "Failed";
    updates.Completed_At = new Date().toISOString();
    updates.Error = `Generation stopped after creating ${view.generated_count} of ${view.requested_count} requested ideas.`;
  }

  if (Object.keys(updates).length) {
    record = await studioIdeaUpdateBatch(env, recordId, updates);
    view = studioIdeaBatchView(record);
  }
  return respond(request, env, { ok: true, batch: view });
}/*__STUDIO_WORKER_END:studioIdeaGenerationStatus__*/

export function chicagoNowParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const minuteRaw = get("minute");
  return {
    date,
    hour: Number(get("hour")),
    minute: minuteRaw === "" ? null : Number(minuteRaw),
  };
}
/*__STUDIO_WORKER_END:chicagoNowParts__*/

export function mapOperationsOutput(record) {
  return {
    ...mapOutput(record),
    output_notes: f(record, "Output_Notes") || "",
  };
}
/*__STUDIO_WORKER_END:mapOperationsOutput__*/

export function linkedRecordIds(value) {
  return arrayOrEmpty(value)
    .map((item) => (typeof item === "string" ? item : item?.id))
    .map((id) => String(id || "").trim())
    .filter((id) => /^rec[a-zA-Z0-9]{14}$/.test(id));
}
/*__STUDIO_WORKER_END:linkedRecordIds__*/

export function mapOperationsProfile(record) {
  const limit = Number(f(record, "Daily_Idea_Limit"));
  const theme = studioThemeForProfile(record);
  return {
    id: record.id,
    name: String(f(record, "Profile_Name") || ""),
    active: Boolean(f(record, "Active")),
    theme,
    city_label: studioCityLabel(theme, record),
    background_color: studioBackgroundColorForRecord(record),
    idea_generation_enabled: Boolean(f(record, "Idea_Generation_Enabled")),
    autonomous_produce_enabled: Boolean(f(record, "Autonomous_Produce_Enabled")),
    daily_idea_limit: Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 5,
    default_narration_voice_id: String(f(record, "Default_Narration_Voice_ID") || "").trim(),
    default_narration_voice_name: String(f(record, "Default_Narration_Voice_Name") || "").trim(),
    autonomous_music_asset_ids: linkedRecordIds(f(record, "Autonomous_Music_Pool")),
  };
}
/*__STUDIO_WORKER_END:mapOperationsProfile__*/

export async function studioSettingsByName(env, name) {
  const rows = await listRecords(env, STUDIO_PIPELINE_SETTINGS_TABLE_ID, {
    limit: 5,
    filterFormula: `AND({Active}=1,{Setting_Name}="${String(name).replace(/"/g, "")}")`,
  });
  return rows[0] || null;
}
/*__STUDIO_WORKER_END:studioSettingsByName__*/

export async function studioUpsertSetting(env, name, value, notes) {
  const existing = await studioSettingsByName(env, name);
  const fields = {
    Setting_Name: name,
    Setting_Value: String(value || ""),
    Active: true,
    Notes: notes || null,
  };
  if (existing?.id) {
    return airtableFetch(env, STUDIO_PIPELINE_SETTINGS_TABLE_ID, existing.id, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
  }
  const created = await airtableFetch(env, STUDIO_PIPELINE_SETTINGS_TABLE_ID, "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return created?.records?.[0] || null;
}
/*__STUDIO_WORKER_END:studioUpsertSetting__*/

export async function probeDeskHealthTarget(target) {
  if (target?.public === false) {
    return {
      id: target.id,
      url: target.url,
      ok: true,
      skipped: "no_public_hostname",
      local_port: target.local_port,
    };
  }
  try {
    const response = await fetch(target.url, { method: "GET", signal: AbortSignal.timeout(4000) });
    return { id: target.id, url: target.url, ok: response.ok, status: response.status, local_port: target.local_port };
  } catch (error) {
    return {
      id: target.id,
      url: target.url,
      ok: false,
      status: 0,
      local_port: target.local_port,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
/*__STUDIO_WORKER_END:probeDeskHealthTarget__*/

export function deskContentRecIdsFromRecords(records = []) {
  const ids = [];
  for (const record of records || []) {
    const content = studioFirstLinkedId(f(record, "Content_Item"));
    const promoted = studioFirstLinkedId(f(record, "Promoted_Content_Item"));
    if (content) ids.push(content);
    if (promoted) ids.push(promoted);
  }
  return ids;
}
/*__STUDIO_WORKER_END:deskContentRecIdsFromRecords__*/

export async function loadDeskContentById(env, recIds) {
  const unique = [...new Set((recIds || []).map((id) => String(id || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  const map = new Map();
  if (!unique.length || !env.AIRTABLE_CONTENT_TABLE_ID) return map;
  await Promise.all(unique.slice(0, 40).map(async (id) => {
    const record = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, id).catch(() => null);
    if (!record?.id) return;
    map.set(id, {
      content_item_id: id,
      content_id: f(record, "Content_ID"),
      content_title: String(f(record, "Content_Title") || "").trim() || null,
    });
  }));
  return map;
}
/*__STUDIO_WORKER_END:loadDeskContentById__*/

export function deskRequestWorkIdentity(record, contentById = new Map()) {
  const contentItemId = studioFirstLinkedId(f(record, "Promoted_Content_Item"));
  const content = contentById.get(contentItemId) || {};
  return deskWorkIdentity({
    content_item_id: contentItemId,
    content_id: content.content_id ?? null,
    content_title: content.content_title || String(f(record, "Requested_Title") || "").trim() || null,
  });
}
/*__STUDIO_WORKER_END:deskRequestWorkIdentity__*/

export function deskEventRecordId(event) {
  const body = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const direct = String(body.record_id || "").trim();
  if (/^rec[A-Za-z0-9]+$/.test(direct)) return direct;
  const fingerprint = String(body.fingerprint || "").trim();
  const rec = fingerprint.split(":")[1] || "";
  return /^rec[A-Za-z0-9]+$/.test(rec) ? rec : "";
}
/*__STUDIO_WORKER_END:deskEventRecordId__*/

export async function enrichDeskActivityIdentity(env, events, identityByRecord, contentById) {
  const rows = Array.isArray(events) ? events : [];
  const missing = [];
  for (const event of rows) {
    const recId = deskEventRecordId(event);
    if (!recId || identityByRecord.has(recId)) continue;
    const body = event?.payload && typeof event.payload === "object" ? event.payload : {};
    if (body.content_id != null && body.output_id != null) continue;
    missing.push({
      recId,
      kind: String(body.kind || String(body.fingerprint || "").split(":")[0] || ""),
    });
  }
  const unique = [...new Map(missing.map((row) => [row.recId, row])).values()].slice(0, 12);
  await Promise.all(unique.map(async ({ recId, kind }) => {
    if (!kind || DESK_OUTPUT_IDENTITY_KINDS.has(kind)) {
      const output = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recId).catch(() => null);
      if (output?.id) {
        const mapped = mapDeskInventoryOutput(output, new Map(), contentById);
        if (mapped.content_item_id && !contentById.has(mapped.content_item_id)) {
          const extra = await loadDeskContentById(env, [mapped.content_item_id]);
          extra.forEach((value, key) => contentById.set(key, value));
        }
        const content = contentById.get(mapped.content_item_id) || {};
        identityByRecord.set(recId, deskWorkIdentity({
          ...mapped,
          content_id: content.content_id ?? mapped.content_id,
          content_title: content.content_title || mapped.content_title,
        }));
        return;
      }
    }
    const request = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recId).catch(() => null);
    if (request?.id) {
      if (!contentById.has(studioFirstLinkedId(f(request, "Promoted_Content_Item")))) {
        const extra = await loadDeskContentById(env, [studioFirstLinkedId(f(request, "Promoted_Content_Item"))]);
        extra.forEach((value, key) => contentById.set(key, value));
      }
      identityByRecord.set(recId, deskRequestWorkIdentity(request, contentById));
    }
  }));
  return rows.map((event) => {
    const recId = deskEventRecordId(event);
    const ident = recId ? identityByRecord.get(recId) : null;
    if (!ident) return event;
    const body = event?.payload && typeof event.payload === "object" ? event.payload : {};
    return { ...event, payload: { ...ident, ...body } };
  });
}
/*__STUDIO_WORKER_END:enrichDeskActivityIdentity__*/

export function mapDeskInventoryOutput(record, contentToRequest = new Map(), contentById = new Map()) {
  const note = String(f(record, "Studio_Publish_Dispatch_Note") || "");
  const contentItemId = studioFirstLinkedId(f(record, "Content_Item"));
  const content = contentById.get(contentItemId) || {};
  return {
    id: record.id,
    output_id: f(record, "Output_ID"),
    output_title: f(record, "Output_Title"),
    output_status: f(record, "Output_Status"),
    render_status: f(record, "Render_Status"),
    remotion_job_id: f(record, "Remotion_Job_ID"),
    final_file_url: f(record, "Final_File_URL"),
    studio_preview_url: f(record, "Studio_Preview_URL"),
    thumbnail_url: f(record, "Thumbnail_URL"),
    output_caption: f(record, "Output_Caption"),
    review_status: f(record, "Review_Status"),
    review_decision_at: f(record, "Review_Decision_At"),
    publish_status: f(record, "Publish_Status"),
    published_at: f(record, "Published_At"),
    platform: f(record, "Platform"),
    studio_output_type: f(record, "Studio_Output_Type"),
    platform_output_type: f(record, "Platform_Output_Type"),
    thumbnail_mode: f(record, "Studio_Effective_Thumbnail_Mode"),
    test_run_id: f(record, "Test_Run_ID"),
    last_modified: f(record, "Last_Modified") || f(record, "Updated_At") || "1970-01-01T00:00:00Z",
    last_publish_attempt_at: f(record, "Last_Publish_Attempt_At"),
    scheduled_post_date: f(record, "Scheduled_Post_Date"),
    auto_publish_enabled: Boolean(f(record, "Auto_Publish_Enabled")),
    do_not_publish: Boolean(f(record, "Do_Not_Publish")),
    carousel_slide_count: Array.isArray(f(record, "Carousel Slides")) ? f(record, "Carousel Slides").length : 0,
    ig_carousel_status: f(record, "IG_Carousel_Status"),
    fb_publish_status: f(record, "FB_Publish_Status"),
    dispatch_count: f(record, "Studio_Publish_Dispatch_Count"),
    dispatch_note: note,
    request_id: studioOutputProductionRequestId(record, contentToRequest)
      || studioFirstLinkedId(f(record, "Production Requests")),
    content_item_id: contentItemId,
    content_id: content.content_id ?? null,
    content_title: content.content_title || String(f(record, "Output_Title") || "").trim() || null,
    voiceover_required: studioOutputVoiceoverRequired(record),
    voiceover_url: f(record, "Voiceover_URL"),
    cover_attached: note.includes("facebook-cover=attached"),
    publish_error: f(record, "Publish_Error_Message"),
    publish_error_stage: f(record, "Publish_Error_Stage"),
    ig_carousel_status: f(record, "IG_Carousel_Status"),
    ig_carousel_error: f(record, "IG_Carousel_Error_Message"),
    ig_carousel_error_stage: f(record, "IG_Carousel_Error_Stage"),
    ig_carousel_child_count: f(record, "IG_Carousel_Child_Count"),
    image_count: f(record, "Image_Count"),
    tiktok_draft_status: f(record, "TikTok_Draft_Status"),
    youtube_error: f(record, "YouTube_Error_Message"),
    youtube_video_id: f(record, "YouTube_Video_ID"),
    publish_retry_eligible: Boolean(f(record, "Publish_Retry_Eligible")),
    render_error: f(record, "Remotion_Error_Message") || f(record, "Final_File_Error_Message"),
    timing_error: f(record, "Timing_Error_Message"),
    music_error: f(record, "Music_Error_Message"),
    render_clip_list_json: f(record, "Render_Clip_List_JSON"),
    remotion_props_json: f(record, "Remotion_Props_JSON"),
  };
}
/*__STUDIO_WORKER_END:mapDeskInventoryOutput__*/

export function deskOutputsForRequest(outputs, requestId) {
  const id = String(requestId || "").trim();
  if (!id) return [];
  return (outputs || []).filter((row) => String(row.request_id || "").trim() === id);
}
/*__STUDIO_WORKER_END:deskOutputsForRequest__*/

export async function gatherStudioDeskInventory(env) {
  const chicago = chicagoNowParts();
  const nowMs = Date.now();
  const [modeRow, capsRow, produceRows, readyNoJob, invalidRenderSources, longRendering, orphans, preparing, cropProcessing, cropError, autonomousRows, azRows, promotedRows, autonomousPromoted, notRfrOutputs, azReadyOutputs, approvedDispatch, publishedCovers] = await Promise.all([
    studioSettingsByName(env, DESK_SETTING_NAME).catch(() => null),
    studioSettingsByName(env, DESK_CAPS_SETTING_NAME).catch(() => null),
    listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: 25,
      sortField: "Created_At",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Studio_Production_Job_JSON}!="")',
      fields: DESK_INVENTORY_REQUEST_FIELDS,
    }).catch(() => []),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 8,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Render_Status}="Ready for Render",{Remotion_Job_ID}="")',
      fields: DESK_INVENTORY_OUTPUT_FIELDS,
    }).catch(() => []),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 12,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),FIND("/api/media-assets/",{Render_Clip_List_JSON}&"")>0,OR({Render_Status}="Ready for Render",{Render_Status}="Rendering",{Render_Status}="Failed"))',
      fields: DESK_INVENTORY_OUTPUT_FIELDS,
    }).catch(() => []),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 8,
      filterFormula: `AND({Test_Run_ID}=BLANK(),{Render_Status}="Rendering",{Remotion_Job_ID}!="",{Final_File_URL}="",${studioLastModifiedStaleFormula(15)})`,
      fields: DESK_INVENTORY_OUTPUT_FIELDS,
    }).catch(() => []),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 8,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Output_Status}="In Production",{Remotion_Job_ID}="",{Published_At}=BLANK())',
      fields: DESK_INVENTORY_OUTPUT_FIELDS,
    }).catch(() => []),
    listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: 12,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),OR({Studio_Variant_Status}="Preparing",{Studio_Variant_Status}="Error"))',
      fields: DESK_INVENTORY_REQUEST_FIELDS,
    }).catch(() => []),
    listRecords(env, ITEM4_VARIANT_QUEUE_TABLE, {
      limit: 8,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Transfer_Status}="Processing")',
    }).catch(() => []),
    listRecords(env, ITEM4_VARIANT_QUEUE_TABLE, {
      limit: 8,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Transfer_Status}="Error")',
    }).catch(() => []),
    listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: 8,
      filterFormula: "AND(OR({Request_Status}='Draft',{Request_Status}='Ready',{Request_Status}='Submitted'),FIND('origin=autonomous',{Production_Notes}&'')>0,{Test_Run_ID}=BLANK())",
      fields: DESK_INVENTORY_REQUEST_FIELDS,
    }).catch(() => []),
    listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: 8,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),FIND("origin=az-finished-video",{Production_Notes}&""),{Request_Status}!="Cancelled")',
      fields: DESK_INVENTORY_REQUEST_FIELDS,
    }).catch(() => []),
    listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: 8,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Request_Status}="Promoted")',
      fields: DESK_INVENTORY_REQUEST_FIELDS,
    }).catch(() => []),
    listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: 8,
      filterFormula: "AND({Test_Run_ID}=BLANK(),FIND('origin=autonomous',{Production_Notes}&'')>0,{Request_Status}='Promoted')",
      fields: DESK_INVENTORY_REQUEST_FIELDS,
    }).catch(() => []),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 8,
      filterFormula: `AND(${STUDIO_CONTINUATION_CANDIDATE_FORMULA},{Output_Status}!="Ready for Review",${studioLastModifiedStaleFormula(15)})`,
      fields: DESK_INVENTORY_OUTPUT_FIELDS,
    }).catch(() => []),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 8,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Output_Status}="Ready for Review",{Final_File_URL}!="",{Output_Caption}!="",{Thumbnail_URL}!="",OR({Review_Status}="",{Review_Status}="Review Sent"))',
      fields: DESK_INVENTORY_OUTPUT_FIELDS,
    }).catch(() => []),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 8,
      filterFormula: `AND({Test_Run_ID}=BLANK(),{Output_Status}="Approved for Publishing",{Published_At}=BLANK(),{Platform}!="TikTok",${studioLastModifiedStaleFormula(15)})`,
      fields: DESK_INVENTORY_OUTPUT_FIELDS,
    }).catch(() => []),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 8,
      filterFormula: 'AND({Test_Run_ID}=BLANK(),OR({Output_Status}="Published",{Publish_Status}="Published"),OR({Studio_Output_Type}="Reel",{Studio_Output_Type}="Short",{Platform_Output_Type}="Instagram Reel",{Platform_Output_Type}="Facebook Reel",{Platform_Output_Type}="YouTube Short"))',
      fields: DESK_INVENTORY_OUTPUT_FIELDS,
    }).catch(() => []),
  ]);

  const mode = parseDeskMode(f(modeRow, "Setting_Value"));
  const caps = parseDeskCaps(f(capsRow, "Setting_Value"), chicago.date);
  const incidents = [];
  const seen = new Set();
  const scannedKinds = new Set();
  const push = (row) => {
    if (!row?.fingerprint || seen.has(row.fingerprint)) return;
    seen.add(row.fingerprint);
    incidents.push(row);
  };
  const scanned = (...kinds) => {
    for (const kind of kinds) scannedKinds.add(kind);
  };

  scanned("produce_stale", "produce_escalated", "produce_clip_mismatch", "produce_stamp_422", "drive_music_404");
  const escalatedRows = await listRecords(env, PRODUCTION_REQUEST_TABLE, {
    limit: 8,
    sortField: "Updated_At",
    sortDirection: "desc",
    filterFormula: `AND({Test_Run_ID}=BLANK(),{Request_Status}!="Cancelled",{Studio_Production_Job_JSON}!="",OR(FIND('"step":"escalated"',{Studio_Production_Job_JSON}),FIND('"step": "escalated"',{Studio_Production_Job_JSON})))`,
    fields: DESK_INVENTORY_REQUEST_FIELDS,
  }).catch(() => []);
  const contentToRequest = new Map();
  for (const record of [...(promotedRows || []), ...(autonomousPromoted || []), ...(azRows || []), ...(autonomousRows || []), ...(produceRows || []), ...(escalatedRows || [])]) {
    const contentId = studioFirstLinkedId(f(record, "Promoted_Content_Item"));
    if (contentId && !contentToRequest.has(contentId)) contentToRequest.set(contentId, record.id);
  }
  const contentById = await loadDeskContentById(env, [
    ...deskContentRecIdsFromRecords([
      ...(produceRows || []),
      ...(escalatedRows || []),
      ...(readyNoJob || []),
      ...(invalidRenderSources || []),
      ...(longRendering || []),
      ...(orphans || []),
      ...(preparing || []),
      ...(autonomousRows || []),
      ...(azRows || []),
      ...(promotedRows || []),
      ...(autonomousPromoted || []),
      ...(notRfrOutputs || []),
      ...(azReadyOutputs || []),
      ...(approvedDispatch || []),
      ...(publishedCovers || []),
    ]),
    ...contentToRequest.keys(),
  ]);
  const mapOut = (record) => mapDeskInventoryOutput(record, contentToRequest, contentById);
  const requestIdentity = (record) => deskRequestWorkIdentity(record, contentById);
  const produceSeen = new Set();
  for (const record of [...(produceRows || []), ...(escalatedRows || [])]) {
    if (produceSeen.has(record.id)) continue;
    produceSeen.add(record.id);
    const job = parseStudioProductionJob(record) || {};
    push(classifyProduceJob({ ...job, request_id: record.id, ...requestIdentity(record) }, nowMs));
  }
  scanned("render_ready_no_job", "render_ready_waiting_voiceover", "render_unfetchable_source", "render_private_drive_watermark", "render_long", "produce_orphan");
  for (const record of invalidRenderSources || []) {
    push(classifyRenderRow(mapOut(record), nowMs));
  }
  for (const record of readyNoJob || []) {
    push(classifyRenderRow(mapOut(record), nowMs));
  }
  for (const record of longRendering || []) {
    push(classifyRenderRow({ ...mapOut(record), last_modified: "1970-01-01T00:00:00Z" }, nowMs));
  }
  for (const record of orphans || []) {
    push(classifyRenderRow(mapOut(record), nowMs));
  }
  scanned("variant_preparing");
  for (const record of preparing || []) {
    push(classifyPreparingGap({
      id: record.id,
      studio_variant_status: f(record, "Studio_Variant_Status"),
      ...requestIdentity(record),
    }));
  }
  scanned("crop_stale", "crop_parked");
  for (const record of [...(cropProcessing || []), ...(cropError || [])]) {
    push(classifyCropRow({
      id: record.id,
      transfer_status: f(record, "Transfer_Status"),
      attempt_count: f(record, "Attempt_Count"),
      last_attempt_at: f(record, "Last_Attempt_At"),
      updated_at: f(record, "Updated_At"),
    }, nowMs));
  }
  scanned("autonomous_revision_lock");
  const lastRunRow = await studioSettingsByName(env, STUDIO_AUTONOMOUS_LAST_SETTING).catch(() => null);
  const lastRun = parseAutonomousLastRun(f(lastRunRow, "Setting_Value"));
  const lockedId = String(lastRun?.production_request_id || "").trim();
  if (lockedId) {
    const locked = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, lockedId).catch(() => null);
    push(classifyAutonomousRevisionLock(lastRun, f(locked, "Production_Notes")));
  }
  scanned("autonomous_stalled", "autonomous_produce_gap", "az_stalled");
  for (const record of [...(autonomousRows || []), ...(azRows || [])]) {
    const job = parseStudioProductionJob(record) || {};
    push(classifyAutonomousRequest({
      status: f(record, "Request_Status"),
      notes: studioRequestNotesText(record),
      job: { ...job, request_id: record.id, ...requestIdentity(record) },
      nowMs,
    }));
  }

  const notRfr = (notRfrOutputs || []).map(mapOut);
  const azReady = (azReadyOutputs || []).map(mapOut);
  scanned("promoted_not_rfr");
  for (const record of promotedRows || []) {
    const notes = studioRequestNotesText(record);
    push(classifyPromotedNotRfr({
      status: f(record, "Request_Status"),
      notes,
      outputs: deskOutputsForRequest(notRfr, record.id),
      requestId: record.id,
      nowMs,
    }));
  }
  scanned("az_not_auto_finished");
  for (const record of azRows || []) {
    push(classifyAzNotAutoFinished({
      status: f(record, "Request_Status"),
      notes: studioRequestNotesText(record),
      outputs: deskOutputsForRequest(azReady, record.id),
      requestId: record.id,
    }));
  }
  scanned("autonomous_rfr_gate");
  const leakedOutputs = [
    ...((approvedDispatch || []).map(mapOut)),
    ...((publishedCovers || []).map(mapOut)),
  ];
  for (const record of autonomousPromoted || []) {
    push(classifyAutonomousRfrGate({
      notes: studioRequestNotesText(record),
      outputs: deskOutputsForRequest(leakedOutputs, record.id),
      requestId: record.id,
    }));
  }
  scanned("publish_never_dispatch");
  for (const record of approvedDispatch || []) {
    push(classifyPublishDispatch(mapOut(record), nowMs));
    push(classifyTikTokAuthSignature(mapOut(record)));
    push(classifyIgCarouselTooManyChildren(mapOut(record)));
    push(classifyPublishFailed(mapOut(record), nowMs));
    push(classifyYoutubeCoverQuota(mapOut(record)));
  }
  try {
    const failedRows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 12,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),OR({Render_Status}="Failed",{Publish_Status}="Failed",AND({Publish_Error_Message}!="",{Published_At}=BLANK()),AND({IG_Carousel_Error_Message}!="",{Published_At}=BLANK())))',
    }).catch(() => []);
    scanned("render_failed", "publish_failed_transient", "tiktok_auth_signature", "ig_carousel_too_many_children", "ig_carousel_child_verification_race", "ig_carousel_child_poll_failure", "ig_carousel_rate_limited");
    for (const record of failedRows || []) {
      push(classifyRenderRow(mapOut(record), nowMs));
      push(classifyTikTokAuthSignature(mapOut(record)));
      push(classifyIgCarouselTooManyChildren(mapOut(record)));
      push(classifyIgCarouselChildVerificationRace(mapOut(record)));
      push(classifyIgCarouselChildPollFailure(mapOut(record)));
      push(classifyIgCarouselRateLimited(mapOut(record)));
      push(classifyPublishFailed(mapOut(record), nowMs));
    }
  } catch (error) {
    console.warn("desk failed-status scan failed", error);
  }
  try {
    const igCarouselOverRows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 12,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Published_At}=BLANK(),OR({Studio_Output_Type}="Carousel",{Platform_Output_Type}="Instagram Carousel"),OR(FIND("too little or too many attachments",{IG_Carousel_Error_Message}&"")>0,AND({IG_Carousel_Child_Count}>10,{IG_Carousel_Status}="Children Ready")))',
    }).catch(() => []);
    scanned("ig_carousel_too_many_children");
    for (const record of igCarouselOverRows || []) {
      push(classifyIgCarouselTooManyChildren(mapOut(record)));
    }
  } catch (error) {
    console.warn("desk IG carousel child-count scan failed", error);
  }
  scanned("native_cover_missing");
  for (const record of publishedCovers || []) {
    push(classifyNativeCover(mapOut(record)));
  }

  try {
    const rfrLockedRows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 25,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Published_At}=BLANK(),OR({Output_Status}="Ready for Review",{Review_Status}="Review Sent",{Render_Status}="Rendered",{Render_Status}="Native Photo Route"))',
    }).catch(() => []);
    scanned("rfr_locked_missing_deliverable", "native_photo_review_strand", "native_photo_approve_incomplete");
    const mapped = (rfrLockedRows || []).map(mapOut);
    const byContent = new Map();
    for (const row of mapped) {
      const cid = String(row.content_item_id || "");
      if (!cid) continue;
      if (!byContent.has(cid)) byContent.set(cid, []);
      byContent.get(cid).push(row);
    }
    for (const row of mapped) {
      const sibs = byContent.get(String(row.content_item_id || "")) || [];
      const storyOpen = sibs.some((sibling) => (
        /story/i.test(String(sibling.studio_output_type || ""))
        && !classifyRfrLockedMissingDeliverable(sibling, nowMs)
      ));
      const lockedCount = sibs.filter((sibling) => classifyRfrLockedMissingDeliverable(sibling, nowMs)).length;
      push(classifyRfrLockedMissingDeliverable(row, nowMs, {
        story_open_review: storyOpen,
        group_progress: sibs.length ? `${sibs.length - lockedCount}/${sibs.length}` : null,
      }));
      push(classifyNativePhotoReviewStrand(row, sibs));
      push(classifyNativePhotoApproveIncomplete(row));
    }
  } catch (error) {
    console.warn("desk rfr locked missing deliverable scan failed", error);
  }
  try {
    const unarmedNative = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 20,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Published_At}=BLANK(),{Do_Not_Publish}=0,{Render_Status}="Native Photo Route",{Output_Status}="Approved for Publishing",OR({Review_Status}=BLANK(),{Review_Status}!="Approved",{Publish_Status}=BLANK(),{Auto_Publish_Enabled}=0))',
    }).catch(() => []);
    scanned("native_photo_approve_incomplete");
    for (const record of unarmedNative || []) {
      push(classifyNativePhotoApproveIncomplete(mapOut(record)));
    }
  } catch (error) {
    console.warn("desk native-photo approve-incomplete scan failed", error);
  }
  try {
    const staleRfrRows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 30,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Published_At}=BLANK(),{Do_Not_Publish}=0,{Output_Status}="Ready for Review",{Review_Status}="Approved",OR({Publish_Status}="Ready to Schedule",{Publish_Status}="Ready to Publish",{Publish_Status}="Scheduled",{Publish_Status}="Publishing"))',
    }).catch(() => []);
    scanned("awaiting_approval_stale_rfr");
    for (const record of staleRfrRows || []) {
      push(classifyAwaitingApprovalStaleRfr(mapOut(record)));
    }
  } catch (error) {
    console.warn("desk awaiting-approval stale RFR scan failed", error);
  }
  try {
    const phantomRerenderRows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 24,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Published_At}=BLANK(),{Do_Not_Publish}=0,{Output_Status}="In Production",{Review_Status}="Changes Requested",OR({Render_Status}="Native Photo Route",AND({Final_File_URL}!="",OR({Render_Status}="Waiting in Render Queue",{Render_Status}="Rendered",{Render_Status}="Ready to Render",{Render_Status}=BLANK()))))',
    }).catch(() => []);
    scanned("phantom_rerender");
    for (const record of phantomRerenderRows || []) {
      push(classifyPhantomRerender(mapOut(record), nowMs));
    }
  } catch (error) {
    console.warn("desk phantom rerender scan failed", error);
  }

  try {
    const ideaQuery = {
      limit: 50,
      sortField: AUTONOMOUS_IDEA_CREATED_FIELD,
      sortDirection: "desc",
      filterFormula: "{Test_Run_ID}=BLANK()",
    };
    let ideas = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, ideaQuery).catch(() => null);
    if (!ideas) {
      ideas = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
        ...ideaQuery,
        sortField: undefined,
      }).catch(() => []);
    }
    const packages = (ideas || []).map((record) => ({
      id: record.id,
      title: f(record, "Candidate_Title"),
      location: f(record, "Primary_Location") || f(record, "Neighborhood_or_Area"),
      notes: f(record, "Production_Config_Notes") || f(record, "Idea_Summary"),
      status: f(record, "Candidate_Status"),
      createdTime: record.createdTime,
    }));
    scanned("autonomous_topic_collision");
    for (const collision of collectAutonomousTopicCollisions(packages)) {
      push(classifyAutonomousTopicCollision(collision));
    }
  } catch (error) {
    console.warn("desk autonomous topic collision scan failed", error);
  }

  try {
    const youtubeFailed = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 8,
      filterFormula: `AND({Test_Run_ID}=BLANK(),{Platform}="YouTube",{Do_Not_Publish}=0,${YOUTUBE_PRIVATE_SOURCE_HEAL_INNER})`,
    }).catch(() => []);
    scanned("youtube_private_source_fail");
    for (const record of youtubeFailed || []) {
      push(classifyYoutubePrivateSourceFail({
        ...mapOut(record),
        ...mapYoutubePrivateSourceDeskRow(record),
      }));
    }
  } catch (error) {
    console.warn("desk youtube private-source scan failed", error);
  }

  try {
    const youtubeCoverQuota = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 8,
      filterFormula: YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA,
    }).catch(() => []);
    scanned("youtube_cover_quota");
    for (const record of youtubeCoverQuota || []) {
      push(classifyYoutubeCoverQuota(mapOut(record)));
    }
  } catch (error) {
    console.warn("desk youtube cover-quota scan failed", error);
  }

  try {
    const { response, payload } = await item4PulsePipelineStage(env, "a2", { extra: { dry_run: true } }, "A2");
    const routes = response.ok ? (payload?.details?.run?.routes || []) : [];
    scanned("intake_processed_residue", "intake_parked", "intake_oversize");
    for (const file of routes) push(classifyIntakeResidue(file));
  } catch (error) {
    console.warn("desk intake residue scan failed", error);
  }

  scanned("health_down");
  const health = [];
  for (const target of PUBLIC_HEALTH_TARGETS) {
    const probe = await probeDeskHealthTarget(target);
    health.push(probe);
    push(classifyHealthTarget(target, probe));
  }

  scanned("tester_catalog_assert");
  push(classifyTesterCatalogAssert());
  let activityEvents = [];
  try {
    const endpoint = String(env.TASKS_ACTIVITY_URL || "https://tasks.chicagoshining.com/agent-activity/log-event").replace(/\/$/, "");
    const tester = await fetchTaskActivityEvents(endpoint, "github_actions", 20);
    const results = await fetchTaskActivityEvents(endpoint, "test_result", 20);
    const deskTickets = await fetchTaskActivityEvents(endpoint, "desk_incident", 40);
    activityEvents = deskTickets.events || [];
    scanned("tester_nightly");
    push(classifyTesterNightly([...(tester.events || []), ...(results.events || [])], nowMs));
  } catch (error) {
    console.warn("desk tester nightly scan failed", error);
  }

  const identityByRecord = new Map();
  const rememberIdentity = (id, ident) => {
    if (!id || !ident) return;
    const prev = identityByRecord.get(id) || {};
    const next = { ...prev };
    for (const [key, value] of Object.entries(ident)) {
      if (value != null && value !== "") next[key] = value;
    }
    identityByRecord.set(id, next);
  };
  for (const record of [...(readyNoJob || []), ...(longRendering || []), ...(orphans || []), ...(notRfrOutputs || []), ...(azReadyOutputs || []), ...(approvedDispatch || []), ...(publishedCovers || [])]) {
    const mapped = mapOut(record);
    rememberIdentity(record.id, deskWorkIdentity(mapped));
    if (mapped.request_id) rememberIdentity(mapped.request_id, deskWorkIdentity(mapped));
  }
  for (const record of [...(produceRows || []), ...(escalatedRows || []), ...(autonomousRows || []), ...(azRows || []), ...(promotedRows || []), ...(autonomousPromoted || []), ...(preparing || [])]) {
    rememberIdentity(record.id, requestIdentity(record));
  }
  for (const row of incidents) rememberIdentity(row.record_id, deskWorkIdentity(row));
  activityEvents = await enrichDeskActivityIdentity(env, activityEvents, identityByRecord, contentById);

  return buildDeskInventoryPayload({
    mode,
    chicagoDate: chicago.date,
    chicagoHour: chicago.hour,
    incidents,
    health,
    caps,
    scannedKinds,
    activityEvents,
  });
}
/*__STUDIO_WORKER_END:gatherStudioDeskInventory__*/

export async function getStudioDeskInventory(request, env) {
  const payload = await gatherStudioDeskInventory(env);
  return respond(request, env, payload);
}
/*__STUDIO_WORKER_END:getStudioDeskInventory__*/

export function isStudioTestActivityEvent(row) {
  const type = String(row?.type || "").trim();
  return type === "test_result" || type === "github_actions" || type === "regression";
}
/*__STUDIO_WORKER_END:isStudioTestActivityEvent__*/

export function sortStudioActivityEvents(rows) {
  return [...rows].sort((left, right) => {
    const byId = Number(right?.id || 0) - Number(left?.id || 0);
    if (byId) return byId;
    return Date.parse(right?.created_at || 0) - Date.parse(left?.created_at || 0);
  });
}
/*__STUDIO_WORKER_END:sortStudioActivityEvents__*/

export async function fetchTaskActivityEvents(endpoint, type, limit = 40) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const res = await fetch(`${endpoint}${sep}type=${encodeURIComponent(type)}&task_id=1&limit=${limit}`, {
    headers: { Accept: "application/json" },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok === false) {
    return { ok: false, error: body?.error || `tasks_http_${res.status}`, events: [] };
  }
  const events = Array.isArray(body.events) ? body.events : Array.isArray(body) ? body : [];
  return { ok: true, events };
}
/*__STUDIO_WORKER_END:fetchTaskActivityEvents__*/

export async function getStudioDeskActivity(request, env) {
  const endpoint = String(env.TASKS_ACTIVITY_URL || "https://tasks.chicagoshining.com/agent-activity/log-event").replace(/\/$/, "");
  try {
    const results = await Promise.all([
      fetchTaskActivityEvents(endpoint, "desk_incident"),
      fetchTaskActivityEvents(endpoint, "test_result"),
      fetchTaskActivityEvents(endpoint, "github_actions"),
    ]);
    const seen = new Set();
    const events = [];
    const errors = [];
    for (const result of results) {
      if (!result.ok) errors.push(result.error);
      for (const row of result.events) {
        const key = row?.id != null ? `id:${row.id}` : JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        events.push(row);
      }
    }
    const sorted = sortStudioActivityEvents(events);
    const deskEvents = sorted.filter((row) => !isStudioTestActivityEvent(row));
    const testEvents = sorted.filter(isStudioTestActivityEvent);
    const failedAll = results.every((result) => !result.ok);
    return respond(request, env, {
      ok: true,
      events: sorted,
      desk_events: deskEvents,
      test_events: testEvents,
      source: failedAll ? "unavailable" : "tasks",
      error: failedAll ? errors[0] : undefined,
    });
  } catch (error) {
    return respond(request, env, {
      ok: true,
      events: [],
      desk_events: [],
      test_events: [],
      source: "unavailable",
      error: String(error?.message || error),
    });
  }
}
/*__STUDIO_WORKER_END:getStudioDeskActivity__*/

export async function studioAiApiRunnerStatus(env) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) return null;
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  try {
    const response = await fetch(runnerUrl + "/ai-api/status", {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(secret ? { "X-Pipeline-Secret": secret } : {}),
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}
/*__STUDIO_WORKER_END:studioAiApiRunnerStatus__*/

export async function getStudioAiApiStatus(request, env) {
  // Parallel + soft-soft: Airtable settings must never blank the footer under 429 cooldown.
  const [row, failoverRow, runner] = await Promise.all([
    studioSettingsByName(env, "AI_API_PREFERRED_PROVIDER").catch(() => null),
    studioSettingsByName(env, "AI_API_CROSS_PROVIDER_FAILOVER").catch(() => null),
    studioAiApiRunnerStatus(env),
  ]);
  const raw = String(row ? f(row, "Setting_Value") || "" : "").trim().toLowerCase();
  const failoverRaw = String(failoverRow ? f(failoverRow, "Setting_Value") || "" : "").trim().toLowerCase();
  let preferredProvider = raw === "azure" ? "Azure" : (raw === "openai" ? "OpenAI" : "");
  let failoverEnabled = ["1", "true", "yes", "on", "enabled"].includes(failoverRaw);
  if (!preferredProvider) {
    preferredProvider = studioAiApiPreferenceCache.preferred || "OpenAI";
  } else {
    studioAiApiPreferenceCache.preferred = preferredProvider;
    studioAiApiPreferenceCache.at = Date.now();
  }
  if (!failoverRow) {
    failoverEnabled = studioAiApiPreferenceCache.failoverEnabled !== false;
  } else {
    studioAiApiPreferenceCache.failoverEnabled = failoverEnabled;
  }
  return respond(request, env, {
    ok: true,
    preferred_provider: preferredProvider,
    failover_provider: preferredProvider === "OpenAI" ? "Azure" : "OpenAI",
    failover_enabled: runner?.failover_enabled != null ? Boolean(runner.failover_enabled) : failoverEnabled,
    current_provider: runner?.current_provider || null,
    failover_active: Boolean(runner?.failover_active),
    last_success_at: runner?.last_success_at || null,
    last_primary_stage: runner?.last_primary_stage || null,
    last_primary_kind: runner?.last_primary_kind || null,
    last_primary_at: runner?.last_primary_at || null,
    last_primary_failover: Boolean(runner?.last_primary_failover),
    runner_connected: Boolean(runner?.ok),
    settings_cached: !row,
  });
}
/*__STUDIO_WORKER_END:getStudioAiApiStatus__*/

export async function patchStudioAiApiPreference(request, env) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const raw = String(payload?.preferred_provider || payload?.provider || "").trim().toLowerCase();
  if (!["openai", "azure"].includes(raw)) throw new HttpError(400, "preferred_provider must be OpenAI or Azure");
  const provider = raw === "azure" ? "Azure" : "OpenAI";
  await studioUpsertSetting(
    env,
    "AI_API_PREFERRED_PROVIDER",
    provider,
    "Preferred AI API for normal Pipeline Runner workloads. The other provider is automatic failover."
  );
  studioAiApiPreferenceCache.preferred = provider;
  studioAiApiPreferenceCache.at = Date.now();
  return respond(request, env, {
    ok: true,
    preferred_provider: provider,
    failover_provider: provider === "OpenAI" ? "Azure" : "OpenAI",
  });
}
/*__STUDIO_WORKER_END:patchStudioAiApiPreference__*/

export async function patchStudioDeskMode(request, env) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const requested = String(payload.mode || "").trim().toLowerCase();
  if (!DESK_MODES.includes(requested)) {
    throw new HttpError(400, "Desk_Mode must be off, observe, infra, patch, or automerge");
  }
  const mode = requested;
  await studioUpsertSetting(env, DESK_SETTING_NAME, mode, "Quality Agent kill switch / phase");
  const inventory = await gatherStudioDeskInventory(env);
  return respond(request, env, { ok: true, ...inventory });
}
/*__STUDIO_WORKER_END:patchStudioDeskMode__*/

export async function patchLibraryCrossScope(request, env) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  if (!Object.prototype.hasOwnProperty.call(payload, "enabled") && !Object.prototype.hasOwnProperty.call(payload, "include_cross_scope")) {
    throw new HttpError(400, "enabled is required");
  }
  const enabled = libraryCrossScopeEnabled(
    Object.prototype.hasOwnProperty.call(payload, "enabled") ? payload.enabled : payload.include_cross_scope
  );
  await studioUpsertSetting(
    env,
    LIBRARY_CROSS_SCOPE_SETTING,
    enabled ? "1" : "0",
    "Admin: include Media Assets from other Content Profiles in idea matching and harvest"
  );
  return respond(request, env, {
    ok: true,
    library_include_cross_scope: enabled,
    setting: LIBRARY_CROSS_SCOPE_SETTING,
  });
}
/*__STUDIO_WORKER_END:patchLibraryCrossScope__*/

export function parseA1JobValue(value) {
  const parts = String(value || "").split("|");
  const phase = String(parts[0] || "").trim().toLowerCase();
  const looksName = (part) => /\.(mov|mp4|m4v|webm)$/i.test(part || "");
  let fileId = "";
  let name = "";
  if (parts.length >= 8) {
    fileId = String(parts[3] || "").trim();
    name = String(parts[5] || "").trim();
  } else {
    fileId = String(parts[3] || "").trim();
    name = String(parts.find(looksName) || "").trim();
  }
  return {
    phase,
    file_id: fileId,
    name,
    updated_at: String(parts[parts.length - 1] || "").trim(),
    job_id: String(parts[1] || "").trim(),
  };
}
/*__STUDIO_WORKER_END:parseA1JobValue__*/

export function compressionPhaseLabel(phase) {
  const normalized = String(phase || "").trim().toLowerCase();
  if (normalized === "queued") return "Queued";
  if (normalized === "downloading") return "Downloading";
  if (normalized === "starting" || normalized === "processing_local") return "Starting";
  if (normalized.startsWith("failed") || normalized === "timeout") return "Failed";
  if (normalized === "finished") return "Finished";
  return "Compressing";
}
/*__STUDIO_WORKER_END:compressionPhaseLabel__*/

export function compressionPhaseTone(phase) {
  const normalized = String(phase || "").trim().toLowerCase();
  if (normalized.startsWith("failed") || normalized === "timeout") return "failed";
  if (normalized === "queued" || normalized === "starting" || normalized === "processing_local") return "waiting";
  if (normalized === "finished") return "ok";
  return "compressing";
}
/*__STUDIO_WORKER_END:compressionPhaseTone__*/

export function parseProgressPercent(notes, livePercent) {
  const live = Number(livePercent);
  if (Number.isFinite(live)) return Math.max(0, Math.min(100, Math.round(live)));
  const match = String(notes || "").match(/(\d{1,3})\s*%/);
  if (!match) return null;
  return Math.max(0, Math.min(100, Number(match[1])));
}
/*__STUDIO_WORKER_END:parseProgressPercent__*/

export function mapA1CompressionJob(record) {
  const settingName = String(f(record, "Setting_Name") || "").trim();
  if (!settingName.startsWith("A1_JOB_")) return null;
  const parsed = parseA1JobValue(f(record, "Setting_Value"));
  const fileId = parsed.file_id || settingName.slice("A1_JOB_".length);
  const name = parsed.name || fileId;
  const phase = parsed.phase || "processing";
  const label = compressionPhaseLabel(phase);
  const notes = String(f(record, "Notes") || "").trim() || null;
  const progress = parseProgressPercent(notes);
  return {
    id: record.id,
    google_drive_file_id: fileId,
    name,
    job_id: parsed.job_id || null,
    phase,
    label,
    tone: compressionPhaseTone(phase),
    progress_percent: progress,
    headline: name ? `${label} ${name}${progress != null ? ` · ${progress}%` : ""}` : `${label} video`,
    notes,
    updated_at: parsed.updated_at || f(record, "Last_Modified") || null,
  };
}
/*__STUDIO_WORKER_END:mapA1CompressionJob__*/

export async function enrichCompressionJobsLive(env, jobs) {
  if (!jobs.length) return jobs;
  const backend = pipelineStageBackend(env, "A1S");
  if (backend.mode !== "python" || !backend.runnerUrl) return jobs;
  try {
    const { response, payload } = await item4PulsePipelineStage(env, "a1s", { extra: { live_status: true } }, "A1S");
    if (!response.ok) return jobs;
    const live = Array.isArray(payload?.details?.run?.jobs) ? payload.details.run.jobs : [];
    const byFile = new Map(live.map((row) => [String(row.google_drive_file_id || ""), row]));
    const byJob = new Map(live.map((row) => [String(row.job_id || ""), row]));
    return jobs.map((job) => {
      const snap = byFile.get(String(job.google_drive_file_id || "")) || byJob.get(String(job.job_id || ""));
      if (!snap) return job;
      const phase = String(snap.status || job.phase || "compressing");
      const label = compressionPhaseLabel(phase);
      const progress = parseProgressPercent(snap.detail || job.notes, snap.progress);
      const name = job.name || snap.name;
      return {
        ...job,
        phase,
        label,
        tone: compressionPhaseTone(phase),
        progress_percent: progress,
        headline: name ? `${label} ${name}${progress != null ? ` · ${progress}%` : ""}` : job.headline,
        notes: snap.detail || job.notes,
      };
    });
  } catch (error) {
    console.error("enrichCompressionJobsLive failed", error);
    return jobs;
  }
}
/*__STUDIO_WORKER_END:enrichCompressionJobsLive__*/

export async function listActiveA1CompressionJobs(env) {
  const records = await listRecords(env, STUDIO_PIPELINE_SETTINGS_TABLE_ID, {
    limit: 20,
    filterFormula: "AND({Active}=1,FIND('A1_JOB_',{Setting_Name})=1)",
  });
  return enrichCompressionJobsLive(env, records.map(mapA1CompressionJob).filter(Boolean));
}
/*__STUDIO_WORKER_END:listActiveA1CompressionJobs__*/

export async function getStudioCompressionStatus(request, env) {
  const [jobs, oversized] = await Promise.all([
    listActiveA1CompressionJobs(env).catch(() => []),
    listOversizedMedia(env).catch(() => []),
  ]);
  return respond(request, env, {
    ok: true,
    jobs,
    oversized_media: attachCompressionJobs(oversized, jobs),
    active_count: jobs.length,
    headline: jobs[0]?.headline || null,
  });
}
/*__STUDIO_WORKER_END:getStudioCompressionStatus__*/

export function mapOversizedIntakeDriveFile(row) {
  const fileId = String(row?.id || "").trim();
  if (!fileId) return null;
  const sizeBytes = Number(row?.size);
  const fileSizeMb = Number.isFinite(sizeBytes) && sizeBytes > 0
    ? Math.round((sizeBytes / 1048576) * 100) / 100
    : null;
  return {
    id: null,
    name: String(row?.name || fileId).trim() || fileId,
    file_size_mb: fileSizeMb,
    mime_type: "video/*",
    google_drive_file_id: fileId,
    google_drive_url: `https://drive.google.com/file/d/${fileId}/view`,
    source: "intake_folder",
  };
}
/*__STUDIO_WORKER_END:mapOversizedIntakeDriveFile__*/

export async function listOversizedIntakeVideos(env) {
  const backend = pipelineStageBackend(env, "A1S");
  if (backend.mode !== "python" || !backend.runnerUrl) return [];
  try {
    const { response, payload } = await item4PulsePipelineStage(env, "a1s", { extra: { dry_run: true } }, "A1S");
    if (!response.ok) return [];
    const run = payload?.details?.run || {};
    const eligible = Array.isArray(run.eligible) ? run.eligible : [];
    return eligible.map(mapOversizedIntakeDriveFile).filter(Boolean);
  } catch (error) {
    console.error("listOversizedIntakeVideos failed", error);
    return [];
  }
}
/*__STUDIO_WORKER_END:listOversizedIntakeVideos__*/

export async function listOversizedMediaFromAirtable(env) {
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
    limit: 50,
    filterFormula: `AND({File_Size_MB}>95.36,FIND("_compressed",{Asset Name}&"")=0)`,
  });
  return records.map((record) => ({
    id: record.id,
    name: f(record, "Asset Name"),
    file_size_mb: f(record, "File_Size_MB"),
    mime_type: f(record, "MIME_Type"),
    google_drive_file_id: googleDriveFileId(record),
    google_drive_url: f(record, "Google Drive URL"),
    source: "airtable",
  })).filter((row) => row.google_drive_file_id);
}
/*__STUDIO_WORKER_END:listOversizedMediaFromAirtable__*/

export async function listOversizedMedia(env) {
  const [airtableRows, intakeRows] = await Promise.all([
    listOversizedMediaFromAirtable(env).catch(() => []),
    listOversizedIntakeVideos(env).catch(() => []),
  ]);
  const byDriveId = new Map();
  for (const row of intakeRows) {
    byDriveId.set(row.google_drive_file_id, row);
  }
  for (const row of airtableRows) {
    byDriveId.set(row.google_drive_file_id, row);
  }
  return [...byDriveId.values()].sort((a, b) => (Number(b.file_size_mb) || 0) - (Number(a.file_size_mb) || 0));
}
/*__STUDIO_WORKER_END:listOversizedMedia__*/

export function firstOpsLinkedId(value) {
  return firstLinkedRecordId(value) || studioFirstLinkedId(value) || "";
}
/*__STUDIO_WORKER_END:firstOpsLinkedId__*/

export function mapOpsQueueProfileName(profileMap, linked) {
  const id = firstOpsLinkedId(linked);
  if (!id) return { profile_id: null, profile_name: "" };
  const profile = profileMap.get(id);
  return {
    profile_id: id,
    profile_name: profile ? String(f(profile, "Profile_Name") || "") : "",
  };
}
/*__STUDIO_WORKER_END:mapOpsQueueProfileName__*/

export async function getStudioOperationsQueue(request, env, authorization) {
  const controls = await readOpsQueueControls(env);
  const fetchErrors = [];
  const settleList = async (label, promise) => {
    try {
      return await promise;
    } catch (error) {
      fetchErrors.push(`${label}: ${error?.message || error}`);
      console.warn("operations-queue fetch failed", label, error?.message || error);
      return [];
    }
  };
  const [profiles, outputs, requests, activeHolds, renderLaneOutputs, reviewOutputs] = await Promise.all([
    settleList("profiles", listRecords(env, STUDIO_IDEA_PROFILE_TABLE_ID, { limit: 50 })),
    settleList("outputs", listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 160,
      sortField: "Output_ID",
      sortDirection: "desc",
      fields: OPS_QUEUE_OUTPUT_FIELDS,
      filterFormula: OPS_QUEUE_OUTPUT_FORMULA,
    })),
    settleList("requests", listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: 60,
      sortField: "Updated_At",
      sortDirection: "desc",
      fields: OPS_QUEUE_REQUEST_FIELDS,
      filterFormula: OPS_QUEUE_REQUEST_FORMULA,
    })),
    settleList("activeHolds", listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 16,
      fields: OPS_QUEUE_OUTPUT_FIELDS,
      filterFormula: STUDIO_RENDER_QUEUE_ACTIVE_FORMULA,
    })),
    // Separate Remotion-lane fetch so a full Publishing backlog cannot empty Rendering Queue.
    settleList("renderLane", listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 100,
      sortField: "Output_ID",
      sortDirection: "desc",
      fields: OPS_QUEUE_OUTPUT_FIELDS,
      filterFormula: OPS_QUEUE_RENDER_FORMULA,
    })),
    settleList("review", listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 500,
      sortField: "Output_ID",
      sortDirection: "desc",
      fields: OPS_QUEUE_OUTPUT_FIELDS,
      filterFormula: OPS_QUEUE_REVIEW_FORMULA,
    })),
  ]);
  const mergedOutputs = mergeOpsQueueOutputRecords(outputs, renderLaneOutputs, activeHolds, reviewOutputs);
  const profileMap = new Map((profiles || []).map((row) => [row.id, row]));
  const queueCandidates = sortRenderQueueCandidates(
    mergedOutputs.filter((row) => isRenderQueueCandidateStatus(f(row, "Render_Status"))),
    f,
    controls,
  );
  const { byId: renderQueueById, total: renderQueueTotal } = assignRenderQueuePositions(
    queueCandidates,
    f,
    { activeHolds, controls },
  );

  const contentIds = [...new Set([
    ...mergedOutputs.map((row) => firstOpsLinkedId(f(row, "Content_Item"))),
    ...(requests || []).map((row) => firstOpsLinkedId(f(row, "Promoted_Content_Item"))),
  ].filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  const contentMap = new Map();
  if (contentIds.length && env.AIRTABLE_CONTENT_TABLE_ID) {
    const formula = contentIds.length === 1
      ? `RECORD_ID()="${contentIds[0]}"`
      : `OR(${contentIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const contentRows = await listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, {
      limit: Math.min(160, contentIds.length),
      fields: OPS_QUEUE_CONTENT_FIELDS,
      filterFormula: formula,
    }).catch(() => []);
    for (const row of contentRows || []) contentMap.set(row.id, row);
  }

  const requestByContent = new Map();
  const requestRows = [];
  const ideaIds = [...new Set((requests || [])
    .map((row) => firstOpsLinkedId(f(row, "Idea_Candidate")))
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  const ideaMetaById = new Map();
  if (ideaIds.length && env.AIRTABLE_IDEA_TABLE_ID) {
    const ideaFormula = ideaIds.length === 1
      ? `RECORD_ID()="${ideaIds[0]}"`
      : `OR(${ideaIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const ideas = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
      limit: Math.min(60, ideaIds.length),
      fields: ["Content_Profile", "Candidate_Title"],
      filterFormula: ideaFormula,
    }).catch(() => []);
    for (const idea of ideas || []) {
      ideaMetaById.set(idea.id, {
        profile_id: firstOpsLinkedId(f(idea, "Content_Profile")),
        title: String(f(idea, "Candidate_Title") || "").trim(),
      });
    }
  }
  for (const record of requests || []) {
    const job = parseStudioProductionJob(record);
    const producePaused = jobIsOpsPaused(job) || isProducePaused(controls, record.id);
    const stuck = classifyProduceJob({
      ...(job || {}),
      request_id: record.id,
      record_id: record.id,
    });
    const contentId = firstOpsLinkedId(f(record, "Promoted_Content_Item"));
    const content = contentId ? contentMap.get(contentId) : null;
    const ideaId = firstOpsLinkedId(f(record, "Idea_Candidate"));
    const ideaMeta = ideaId ? ideaMetaById.get(ideaId) : null;
    const profile = mapOpsQueueProfileName(
      profileMap,
      (content ? f(content, "Content_Profile") : null) || ideaMeta?.profile_id || null,
    );
    const step = String(job?.step || "").trim();
    const status = String(f(record, "Request_Status") || "").trim();
    // Transient produce_stale is heal backlog (often waiting on serial Remotion).
    // Keep the Producing · step label so Factory In Flight does not read as Repair.
    const transientProduceStale = stuck?.kind === "produce_stale" && stuck?.class === "transient"
      && step && step !== "blocked" && step !== "escalated" && step !== "done";
    const studioState = producePaused
      ? "Paused"
      : (transientProduceStale
        ? `Producing · ${step}`
        : (stuck ? (stuck.kind || "Stuck") : (step && step !== "done" ? `Producing · ${step}` : status || "Draft")));
    const contentNumber = content ? f(content, "Content_ID") : null;
    const ideaLinkedId = firstOpsLinkedId(f(record, "Idea_Candidate")) || null;
    const row = {
      kind: "request",
      id: record.id,
      production_request_id: record.id,
      production_request_number: f(record, "Production_Request_ID") || null,
      content_item_id: contentId || null,
      content_id: contentNumber,
      title: opsQueueItemTitle({
        contentTitle: content ? f(content, "Content_Title") : "",
        ideaTitle: ideaMeta?.title || "",
        requestedTitle: f(record, "Requested_Title"),
        masterContentType: f(record, "Master_Content_Type"),
        fallback: "Production request",
      }),
      ...profile,
      studio_state: studioState,
      request_status: status,
      variant_status: f(record, "Studio_Variant_Status") || null,
      plan_status: f(record, "Studio_Output_Plan_Status") || null,
      produce_step: step || null,
      produce_percent: Number(job?.percent) || null,
      produce_error: job?.error || stuck?.error || null,
      stuck_kind: stuck?.kind || null,
      stuck_class: stuck?.class || null,
      produce_paused: producePaused,
      render_paused: false,
      production_notes: f(record, "Production_Notes") || "",
      lane: queueLaneForStudioState(studioState, { producePaused, stuck }),
      idea_id: ideaLinkedId,
      platforms: Array.isArray(f(record, "Target_Platforms")) ? f(record, "Target_Platforms") : [],
      updated_at: f(record, "Updated_At") || job?.updated_at || null,
    };
    row.e2e = buildOpsE2eStages({
      ...row,
      has_idea: Boolean(ideaLinkedId),
      has_outputs: false,
    });
    requestRows.push(row);
    if (contentId) requestByContent.set(contentId, row);
  }

  const outputRows = mergedOutputs.map((record) => {
    const queueMeta = renderQueueById.get(record.id) || null;
    const mapped = mapOutput(record, null, queueMeta);
    const contentId = firstOpsLinkedId(f(record, "Content_Item"));
    const content = contentId ? contentMap.get(contentId) : null;
    const parentRequest = contentId ? requestByContent.get(contentId) : null;
    const renderPaused = isRenderPaused(controls, record.id);
    const producePaused = Boolean(parentRequest?.produce_paused);
    const outputUpdatedAt = f(record, "Studio_Preview_Updated_At")
      || f(record, "Last_Publish_Attempt_At")
      || record?.createdTime
      || null;
    const stuck = classifyRenderRow({
      id: record.id,
      render_status: f(record, "Render_Status"),
      remotion_job_id: f(record, "Remotion_Job_ID"),
      final_file_url: f(record, "Final_File_URL"),
      output_status: f(record, "Output_Status"),
      last_modified: outputUpdatedAt,
      render_error: f(record, "Remotion_Error_Message") || f(record, "Final_File_Error_Message"),
      error: f(record, "Publish_Error_Message"),
    });
    const studioState = renderPaused
      ? "Paused in render queue"
      : mapped.studio_state;
    const profile = mapOpsQueueProfileName(
      profileMap,
      f(record, "Content_Profile") || (content ? f(content, "Content_Profile") : null),
    );
    const contentNumber = content ? f(content, "Content_ID") : null;
    const outputRow = {
      kind: "output",
      id: record.id,
      output_id: mapped.output_id,
      production_request_id: parentRequest?.production_request_id || null,
      production_request_number: parentRequest?.production_request_number || null,
      content_item_id: contentId || null,
      content_id: contentNumber,
      title: opsQueueItemTitle({
        contentTitle: content ? f(content, "Content_Title") : "",
        requestedTitle: parentRequest?.title || "",
        outputTitle: mapped.output_title,
        outputId: mapped.output_id,
        fallback: "Untitled output",
      }),
      ...profile,
      platform: mapped.platform,
      format: mapped.format || null,
      studio_output_type: mapped.studio_output_type || mapped.format,
      studio_state: studioState,
      output_status: mapped.output_status,
      render_status: mapped.render_status,
      remotion_job_id: mapped.remotion_job_id || null,
      review_status: mapped.review_status,
      publish_status: mapped.publish_status,
      thumbnail_url: mapped.thumbnail_url || null,
      final_file_url: mapped.final_file_url || null,
      render_queue_position: mapped.render_queue_position,
      render_queue_total: mapped.render_queue_total || renderQueueTotal,
      render_queue_label: mapped.render_queue_label,
      request_status: parentRequest?.request_status || null,
      variant_status: parentRequest?.variant_status || null,
      plan_status: parentRequest?.plan_status || null,
      produce_step: parentRequest?.produce_step || null,
      produce_percent: parentRequest?.produce_percent || null,
      produce_paused: producePaused,
      render_paused: renderPaused,
      stuck_kind: stuck?.kind || parentRequest?.stuck_kind || null,
      stuck_class: stuck?.class || parentRequest?.stuck_class || null,
      produce_error: stuck?.error || parentRequest?.produce_error || mapped.remotion_error_message || null,
      lane: queueLaneForStudioState(studioState, {
        producePaused,
        renderPaused,
        stuck: stuck || (parentRequest?.stuck_kind ? { kind: parentRequest.stuck_kind } : null),
      }),
      idea_id: parentRequest?.idea_id || null,
      platforms: parentRequest?.platforms || (mapped.platform ? [mapped.platform] : []),
      scheduled_at: mapped.scheduled_at || mapped.scheduled_post_date || null,
      creative_available: outputCreativeAvailable(record),
      updated_at: outputUpdatedAt,
    };
    outputRow.e2e = buildOpsE2eStages({
      ...outputRow,
      has_idea: Boolean(outputRow.idea_id),
      has_outputs: true,
    });
    return outputRow;
  });

  // Prefer output rows; keep request-only rows (Draft/Ready before fanout) so Ideas→produce is visible.
  const contentIdsWithOutputs = new Set(outputRows.map((row) => row.content_item_id).filter(Boolean));
  const requestOnly = requestRows.filter((row) => {
    if (!row.content_item_id) return true;
    return !contentIdsWithOutputs.has(row.content_item_id);
  });
  const rows = [...outputRows, ...requestOnly].sort((a, b) => {
    const laneRank = { stuck: 0, paused: 1, active: 2, review: 3, publish: 4, done: 5 };
    const laneDelta = (laneRank[a.lane] ?? 9) - (laneRank[b.lane] ?? 9);
    if (laneDelta) return laneDelta;
    const aPos = Number(a.render_queue_position) || Number.POSITIVE_INFINITY;
    const bPos = Number(b.render_queue_position) || Number.POSITIVE_INFINITY;
    if (aPos !== bPos) return aPos - bPos;
    const aOut = Number(a.output_id) || 0;
    const bOut = Number(b.output_id) || 0;
    if (aOut && bOut && aOut !== bOut) return bOut - aOut;
    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  });
  const queues = partitionOpsQueues(rows);

  return respond(request, env, {
    ok: true,
    page: "operations-queue",
    summary: queues.summary,
    queues: {
      rendering: queues.rendering,
      publishing: queues.publishing,
      end_to_end: queues.end_to_end,
    },
    render_queue_total: renderQueueTotal,
    controls,
    can_edit_queue: Boolean(
      authorization?.permissions?.tenant_admin
      || authorization?.permissions?.publishing_control
      || authorization?.permissions?.production_configure
    ),
    rows,
    fetch_errors: fetchErrors,
    warning: fetchErrors.length
      ? `Queue data incomplete: ${fetchErrors.slice(0, 2).join(" · ")}`
      : null,
  });
}
/*__STUDIO_WORKER_END:getStudioOperationsQueue__*/

export async function getFactoryDesk(request, env, authorization) {
  const [queueResponse, deskControls, ideaCandidates] = await Promise.all([
    getStudioOperationsQueue(request, env, authorization),
    readFactoryDeskControls(env),
    loadFactoryIdeaCandidates(env),
  ]);
  let queue = {};
  try {
    queue = await queueResponse.clone().json();
  } catch {
    queue = {};
  }
  const part = partitionFactoryLanes(queue.rows || [], deskControls, { ideaCandidates });
  const warningBits = [];
  if (queue.warning) warningBits.push(queue.warning);
  return respond(request, env, {
    ok: true,
    page: "factory-desk",
    lanes: part.lanes,
    needs_assets_candidates: part.needs_assets_candidates,
    summary: part.summary,
    controls: part.controls,
    can_edit: Boolean(
      authorization?.permissions?.tenant_admin
      || authorization?.permissions?.publishing_control
      || authorization?.permissions?.production_configure
    ),
    warning: warningBits.length ? warningBits.join(" · ") : null,
  });
}
/*__STUDIO_WORKER_END:getFactoryDesk__*/

export async function factoryDeskRefreshPayload(request, env, authorization, controls, action, extra = {}) {
  const queueResponse = await getStudioOperationsQueue(request, env, authorization);
  let queue = {};
  try { queue = await queueResponse.clone().json(); } catch { queue = {}; }
  const ideaCandidates = await loadFactoryIdeaCandidates(env);
  const part = partitionFactoryLanes(queue.rows || [], controls, { ideaCandidates });
  return respond(request, env, {
    ok: true,
    page: "factory-desk",
    lanes: part.lanes,
    needs_assets_candidates: part.needs_assets_candidates,
    summary: part.summary,
    controls: part.controls,
    can_edit: true,
    action,
    ...extra,
  });
}
/*__STUDIO_WORKER_END:factoryDeskRefreshPayload__*/

export async function factoryApproveOutput(env, id, actor, note, ctx = null) {
  const existing = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  const outputStatus = String(f(existing, "Output_Status") || "").trim();
  const reviewStatus = String(f(existing, "Review_Status") || "").trim();
  const publishStatus = String(f(existing, "Publish_Status") || "").trim();
  // Idempotent retry: a previous approve may have committed even if its
  // subsequent Desk refresh failed. Never re-schedule or dispatch twice.
  if (publishStatus === "Published" || outputStatus === "Published") {
    return { id, already_published: true, message: "Output is already published." };
  }
  if (reviewStatus === "Approved" || outputStatus === "Approved for Publishing") {
    return { id, already_approved: true, message: "Output is already approved; no second approval was sent." };
  }
  const renderStatus = String(f(existing, "Render_Status") || "").trim();
  if (/^(?:Waiting in Render Queue|Ready for Render|Rendering|Queued)$/i.test(renderStatus)) {
    throw new HttpError(409, `Cannot approve yet: rendering is incomplete (${renderStatus}). The output will return to Needs Eyes after rendering finishes.`);
  }
  if (!studioOutputReadyForPublishApproval(existing)) {
    throw new HttpError(409, "Cannot approve this output yet: a finished render and Ready for Review are required.");
  }
  const stamp = new Date().toISOString();
  const updated = await approveOutputRecordForPublishing(
    env,
    existing,
    note || `Factory Desk approve by ${actor || "operator"}`,
    stamp,
    {},
    { recheckBestSlot: true },
  );
  const held = !studioPublishCanDispatchNow(updated);
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(studioDispatchApprovedPublishAndSchedule(null, env, updated).catch((error) => {
      console.warn("factory approve publish kickoff failed", updated?.id, error);
    }));
  }
  return {
    id,
    message: held
      ? "Approved. Studio will publish at the scheduled time."
      : "Approved for publishing. Studio is starting the publisher.",
  };
}
/*__STUDIO_WORKER_END:factoryApproveOutput__*/

export function factoryFeedbackBlock(note, { actor = "operator", stamp = "", scope = "content" } = {}) {
  const instruction = String(note || "").trim();
  if (!instruction) return "";
  const safeScope = String(scope || "content").replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0,96);
  const safeActor = String(actor || "operator").replace(/[^a-zA-Z0-9@._-]/g, "_").slice(0,120);
  const safeInstruction = instruction.replace(/\[\/factory-review-feedback\]/gi, "[end review feedback]");
  return `[factory-review-feedback at=${stamp || new Date().toISOString()} scope=${safeScope} actor=${safeActor}]\n${safeInstruction}\n[/factory-review-feedback]`;
}
/*__STUDIO_WORKER_END:factoryFeedbackBlock__*/

export function factoryAppendFeedback(existing, note, metadata = {}) {
  const clean = stripFactoryRevisionNote(existing);
  const block = factoryFeedbackBlock(note, metadata);
  const merged = [clean, block].filter(Boolean).join("\n\n");
  // Reserve space for the Factory revision lock marker appended by the caller.
  if (merged.length > 9750) throw new HttpError(409, "Production notes are full. Shorten existing notes before adding another review.");
  return merged;
}
/*__STUDIO_WORKER_END:factoryAppendFeedback__*/

export function factoryLatestReviewFeedback(notes) {
  const source = String(notes || "");
  const re = /\[factory-review-feedback at=([^\s\]]+) scope=([^\s\]]+) actor=([^\]]+)\]\r?\n([\s\S]*?)\r?\n\[\/factory-review-feedback\]/g;
  let latest = null;
  for (const match of source.matchAll(re)) {
    latest = { at: match[1], scope: match[2], author: match[3], instructions: String(match[4] || "").trim() };
  }
  return latest;
}
/*__STUDIO_WORKER_END:factoryLatestReviewFeedback__*/

export async function factorySendBackOutput(env, id, actor, note, requestedProductionId = null) {
  const existing = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  const outputStatus = String(f(existing, "Output_Status") || "").trim();
  const reviewStatus = String(f(existing, "Review_Status") || "").trim();
  const publishStatus = String(f(existing, "Publish_Status") || "").trim();
  if (publishStatus === "Published" || outputStatus === "Published") {
    throw new HttpError(409, "Published outputs cannot be sent back");
  }
  if (outputStatus === "Skipped") throw new HttpError(409, "Skipped outputs cannot be sent back");
  const stamp = new Date().toISOString();
  const linkedRequestId = studioFirstLinkedId(f(existing, "Production_Request"));
  const requestedId = String(requestedProductionId || "").trim();
  if (requestedId && linkedRequestId && requestedId !== linkedRequestId) {
    throw new HttpError(409, "Output belongs to a different Production Request");
  }
  const productionRequestId = linkedRequestId || (/^rec[A-Za-z0-9]+$/.test(requestedId) ? requestedId : null);
  const requestRecord = productionRequestId
    ? await airtableFetch(env, PRODUCTION_REQUEST_TABLE, productionRequestId)
    : null;
  if (requestRecord) {
    const outputContentId = studioFirstLinkedId(f(existing, "Content_Item"));
    const requestContentId = studioFirstLinkedId(f(requestRecord, "Promoted_Content_Item"));
    if (outputContentId && requestContentId && outputContentId !== requestContentId) {
      throw new HttpError(409, "Output and Production Request content do not match");
    }
  }
  const productionNotes = requestRecord
    ? factoryAppendFeedback(f(requestRecord, "Production_Notes"), note, { actor, stamp, scope: `output:${id}` })
    : null;
  const existingNotes = String(f(existing, "Review_Notes") || "").trim();
  const line = `Factory Desk send-back by ${actor || "operator"} at ${stamp}.${note ? ` ${note}` : ""}`;
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Review_Status: "Changes Requested",
        Output_Status: "Changes Requested",
        Publish_Status: "Not Ready",
        Render_Status: "Needs Changes",
        Do_Not_Publish: true,
        Review_Decision_At: stamp,
        Review_Notes: [existingNotes, line].filter(Boolean).join("\n\n"),
      },
      typecast: true,
    }),
  });
  if (requestRecord) {
    await airtableFetch(env, PRODUCTION_REQUEST_TABLE, productionRequestId, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Request_Status: "Draft",
          Active: true,
          Submitted_At: null,
          Studio_Production_Job_JSON: null,
          Production_Notes: withFactoryRevisionOpen(productionNotes, { actor, stamp }),
          Updated_At: stamp,
        },
        typecast: true,
      }),
    });
  }
  return {
    id,
    production_request_id: productionRequestId || null,
    prior_review_status: reviewStatus,
    message: "Sent back to Production with review feedback. Change the request, then approve to rerender.",
  };
}
/*__STUDIO_WORKER_END:factorySendBackOutput__*/

export async function factorySendBackContent(env, productionRequestId, outputIds, actor, note) {
  const requestId = String(productionRequestId || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(requestId)) throw new HttpError(400, "Production Request is required");
  const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);

  const suppliedIds = [...new Set((Array.isArray(outputIds) ? outputIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];

  let contentId = studioFirstLinkedId(f(requestRecord, "Promoted_Content_Item"));
  if (!contentId && suppliedIds.length) {
    const firstOutput = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, suppliedIds[0]).catch(() => null);
    contentId = firstOutput ? studioFirstLinkedId(f(firstOutput, "Content_Item")) : null;
  }
  if (!contentId) throw new HttpError(409, "The linked Content Item could not be resolved");

  const [contentOutputs, requestOutputRows] = await Promise.all([
    loadContentPlatformOutputs(env, contentId),
    outputRowsForProductionRequest(env, requestId, { includeInactive: true }).catch(() => []),
  ]);
  if (!contentOutputs.length) throw new HttpError(409, "This content has no Platform Outputs to send back");

  const routedOutputIds = new Set();
  for (const row of requestOutputRows || []) {
    if (Boolean(f(row, "Enabled")) === false) continue;
    for (const id of arrayOrEmpty(f(row, "Platform_Output"))) {
      const value = String(id || "").trim();
      if (/^rec[A-Za-z0-9]+$/.test(value)) routedOutputIds.add(value);
    }
  }

  const suppliedSet = new Set(suppliedIds);
  const targets = contentOutputs.filter((row) => {
    const id = String(row?.id || "").trim();
    if (!id) return false;
    if (String(f(row, "Output_Status") || "").trim() === "Skipped") return false;
    const directRequest = studioFirstLinkedId(f(row, "Production_Request"));
    if (routedOutputIds.size) {
      return routedOutputIds.has(id) || directRequest === requestId || suppliedSet.has(id);
    }
    return !directRequest || directRequest === requestId || suppliedSet.has(id);
  });
  if (!targets.length) throw new HttpError(409, "No active outputs for this Production Request could be resolved");

  const blocked = targets.filter((row) => outputAlreadyApprovedForPublishing(row) || Boolean(f(row, "Published_At")));
  if (blocked.length) {
    throw new HttpError(
      409,
      "This content already has an approved, publishing, or published output. Send-back is only available before publishing approval."
    );
  }

  const stamp = new Date().toISOString();
  const productionNotes = factoryAppendFeedback(f(requestRecord, "Production_Notes"), note, {
    actor, stamp, scope: "content",
  });
  const line = `Factory content send-back by ${actor || "operator"} at ${stamp}.${note ? ` ${note}` : ""}`;
  // Hold the last render for reference. Do not start any production work until
  // the operator explicitly clicks Approve after making revisions.
  const patches = targets.map((existing) => {
    const existingNotes = String(f(existing, "Review_Notes") || "").trim();
    return {
      id: existing.id,
      fields: {
        Review_Status: "Changes Requested",
        Output_Status: "Changes Requested",
        Publish_Status: "Not Ready",
        Render_Status: "Needs Changes",
        Do_Not_Publish: true,
        Review_Decision_At: stamp,
        Review_Notes: [existingNotes, line].filter(Boolean).join("\n\n"),
      },
    };
  });
  await airtableBatchUpdate(env, env.AIRTABLE_OUTPUT_TABLE_ID, patches, { typecast: true });

  await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Request_Status: "Draft",
        Active: true,
        Submitted_At: null,
        Studio_Production_Job_JSON: null,
        Production_Notes: withFactoryRevisionOpen(productionNotes, { actor, stamp }),
        Updated_At: stamp,
      },
      typecast: true,
    }),
  });

  return {
    production_request_id: requestId,
    content_item_id: contentId,
    output_count: patches.length,
    output_ids: patches.map((row) => row.id),
    message: `Sent the full content package (${patches.length} output${patches.length === 1 ? "" : "s"}) back to Production. Make changes and Approve to rerender.`,
  };
}
/*__STUDIO_WORKER_END:factorySendBackContent__*/

export async function factoryDeleteDeskItem(env, id, kind, actor, note) {
  const stamp = new Date().toISOString();
  if (kind === "idea") {
    const idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, id);
    const promoted = firstOpsLinkedId(f(idea, "Promoted_Content_Record_ID") || f(idea, "Content Item") || f(idea, "Content_Item"));
    if (promoted) throw new HttpError(409, "Promoted ideas cannot be deleted from Factory; open Ideas instead");
    await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, id, { method: "DELETE" });
    return { id, kind, message: "Idea deleted." };
  }
  if (kind === "request") {
    throw new HttpError(409, "Production requests cannot be deleted from Factory yet; open Production or Operations");
  }
  const existing = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  const outputStatus = String(f(existing, "Output_Status") || "").trim();
  const publishStatus = String(f(existing, "Publish_Status") || "").trim();
  if (publishStatus === "Published" || outputStatus === "Published") {
    throw new HttpError(409, "Published outputs cannot be deleted");
  }
  const existingNotes = String(f(existing, "Review_Notes") || "").trim();
  const line = `Factory Desk delete/skip by ${actor || "operator"} at ${stamp}.${note ? ` ${note}` : ""}`;
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Output_Status: "Skipped",
        Publish_Status: "Not Ready",
        Do_Not_Publish: true,
        Review_Decision_At: stamp,
        Review_Notes: [existingNotes, line].filter(Boolean).join("\n\n"),
      },
      typecast: true,
    }),
  });
  return { id, kind: "output", message: "Output marked Skipped (removed from Factory queues)." };
}
/*__STUDIO_WORKER_END:factoryDeleteDeskItem__*/

export async function mutateFactoryDesk(request, env, authorization, ctx = null) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const action = String(payload?.action || "").trim().toLowerCase();
  const actor = authorization?.user?.email || authorization?.email || null;
  const controls = await readFactoryDeskControls(env);
  let next = controls;
  let resultExtra = {};

  if (action === "pin_needs_assets") {
    const result = pinFactoryNeedsAssets(controls, payload?.item || payload, { actor });
    if (!result.ok) throw new HttpError(409, result.message || result.error || "Could not pin needs-assets item");
    next = result.controls;
  } else if (action === "unpin_needs_assets") {
    next = unpinFactoryNeedsAssets(controls, payload?.id || payload?.item?.id).controls;
  } else if (action === "approve" || action === "send_back" || action === "send_back_content" || action === "delete") {
    const id = String(payload?.id || payload?.item?.id || "").trim();
    const kind = String(payload?.kind || payload?.item?.kind || "output").trim().toLowerCase();
    const note = String(payload?.note || payload?.notes || "").trim().slice(0, 3000);
    if (!/^rec[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, "id must be an Airtable record id");
    if (action === "approve") {
      if (kind !== "output") throw new HttpError(400, "Approve is only for Ready for Review outputs");
      requirePermission(authorization, "outputs_review");
      resultExtra = await factoryApproveOutput(env, id, actor, note, ctx);
    } else if (action === "send_back") {
      if (kind !== "output") throw new HttpError(400, "Send back is only for outputs");
      requirePermission(authorization, "outputs_review");
      resultExtra = await factorySendBackOutput(env, id, actor, note, payload?.production_request_id);
    } else if (action === "send_back_content") {
      requirePermission(authorization, "outputs_review");
      resultExtra = await factorySendBackContent(
        env,
        payload?.production_request_id,
        payload?.output_ids,
        actor,
        note,
      );
    } else {
      if (kind === "idea") requirePermission(authorization, "ideas_delete");
      else requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
      resultExtra = await factoryDeleteDeskItem(env, id, kind, actor, note);
      next = unpinFactoryNeedsAssets(next, id).controls;
    }
  } else {
    throw new HttpError(400, "action must be pin_needs_assets, unpin_needs_assets, approve, send_back, send_back_content, or delete");
  }

  const saved = (
    action === "pin_needs_assets"
    || action === "unpin_needs_assets"
    || action === "delete"
  )
    ? await writeFactoryDeskControls(env, next, actor)
    : next;
  if (action === "approve") {
    // The Airtable write above is the authoritative approval transaction.
    // A later queue/idea fetch may fail or exceed request limits; do not turn
    // a committed approval into HTTP 500 and invite a duplicate click.
    return respond(request, env, {
      ok: true, page: "factory-desk", action, result: resultExtra,
      message: resultExtra.message || "Approved.", refresh_required: true,
    });
  }
  return factoryDeskRefreshPayload(request, env, authorization, saved, action, {
    result: resultExtra,
    message: resultExtra.message || null,
  });
}
/*__STUDIO_WORKER_END:mutateFactoryDesk__*/

export async function pauseStudioOperationsQueueItem(request, env, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const kind = String(payload?.kind || "").trim();
  const id = String(payload?.id || "").trim();
  const paused = Boolean(payload?.paused);
  const reason = String(payload?.reason || "").trim().slice(0, 240) || null;
  if (!/^rec[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, "id must be an Airtable record id");
  if (kind !== "output" && kind !== "request") throw new HttpError(400, "kind must be output or request");
  const actor = authorization?.user?.email || authorization?.email || null;
  const controls = await readOpsQueueControls(env);
  const next = normalizeOpsQueueControls(controls);

  if (kind === "output") {
    if (paused) {
      next.render_paused[id] = { paused_at: new Date().toISOString(), paused_by: actor, reason };
    } else {
      delete next.render_paused[id];
    }
  } else {
    if (paused) {
      next.produce_paused[id] = { paused_at: new Date().toISOString(), paused_by: actor, reason };
    } else {
      delete next.produce_paused[id];
    }
    const record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, id).catch(() => null);
    if (record?.id) {
      const job = parseStudioProductionJob(record) || {
        schema_version: "studio.production-job.1",
        job_id: `spj-pause-${id.slice(-6)}`,
        step: "themes",
      };
      const patched = applyProducePauseToJob(job, { paused, pausedBy: actor, reason });
      await airtableFetch(env, PRODUCTION_REQUEST_TABLE, id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Studio_Production_Job_JSON: JSON.stringify(patched),
            Updated_At: new Date().toISOString(),
          },
          typecast: false,
        }),
      });
      if (!paused) {
        try { await enqueueStudioProductionJob(env, id, { resume: true, force: true }); } catch (error) {
          console.warn("ops queue unpause resume failed", id, error);
        }
      }
    }
  }

  const saved = await writeOpsQueueControls(env, next, actor);
  return respond(request, env, { ok: true, controls: saved, kind, id, paused });
}
/*__STUDIO_WORKER_END:pauseStudioOperationsQueueItem__*/

export async function reorderStudioOperationsRenderQueue(request, env, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const orderedIds = Array.isArray(payload?.ordered_ids) ? payload.ordered_ids : null;
  const moveId = String(payload?.id || "").trim();
  const direction = String(payload?.direction || "").trim().toLowerCase();
  const actor = authorization?.user?.email || authorization?.email || null;
  const controls = await readOpsQueueControls(env);
  const next = normalizeOpsQueueControls(controls);

  if (orderedIds) {
    next.render_priority = [...new Set(orderedIds.map((id) => String(id || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  } else if (/^rec[A-Za-z0-9]+$/.test(moveId) && (direction === "up" || direction === "down" || direction === "top")) {
    const candidates = await studioLoadRenderQueueCandidates(env, { limit: 100, controls: next });
    const currentOrder = candidates.map((row) => row.id);
    const priority = next.render_priority.length
      ? [...next.render_priority.filter((id) => currentOrder.includes(id)), ...currentOrder.filter((id) => !next.render_priority.includes(id))]
      : currentOrder;
    const index = priority.indexOf(moveId);
    if (index < 0) {
      priority.unshift(moveId);
    } else if (direction === "top") {
      priority.splice(index, 1);
      priority.unshift(moveId);
    } else if (direction === "up" && index > 0) {
      [priority[index - 1], priority[index]] = [priority[index], priority[index - 1]];
    } else if (direction === "down" && index < priority.length - 1) {
      [priority[index + 1], priority[index]] = [priority[index], priority[index + 1]];
    }
    next.render_priority = priority;
  } else {
    throw new HttpError(400, "Provide ordered_ids or id + direction (up|down|top)");
  }

  const saved = await writeOpsQueueControls(env, next, actor);
  // Recompute positions so the UI can refresh immediately.
  const candidates = await studioLoadRenderQueueCandidates(env, { limit: 100, controls: saved });
  const activeHolds = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 16,
    filterFormula: STUDIO_RENDER_QUEUE_ACTIVE_FORMULA,
  }).catch(() => []);
  const { byId, total } = assignRenderQueuePositions(candidates, f, { activeHolds, controls: saved });
  return respond(request, env, {
    ok: true,
    controls: saved,
    render_queue_total: total,
    queue: [...byId.entries()].map(([id, meta]) => ({ id, ...meta })),
  });
}
/*__STUDIO_WORKER_END:reorderStudioOperationsRenderQueue__*/

export function stampPrepareToReviewNotes(existing) {
  const text = String(existing || "").trim();
  if (/origin=(prepare-to-review|autonomous|az-finished-video)/i.test(text)) return text || "origin=prepare-to-review";
  return [text, "origin=prepare-to-review"].filter(Boolean).join("\n").slice(0, 3000);
}
/*__STUDIO_WORKER_END:stampPrepareToReviewNotes__*/

export async function prepareIdeaToReview(request, env, url, authorization, ctx = null) {
  const match = /^\/api\/ideas\/(rec[A-Za-z0-9]+)\/prepare-to-review$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid idea path");
  const ideaId = match[1];
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }

  const idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaId);
  if (!idea?.id) throw new HttpError(404, "Idea was not found");
  if (String(f(idea, "Candidate_Status") || "").trim() === "On Hold") {
    throw new HttpError(409, "Restore this idea before preparing it for review");
  }

  const platforms = canonicalProductionPlatforms(
    Array.isArray(payload.platforms) && payload.platforms.length
      ? payload.platforms
      : (Array.isArray(f(idea, "Production_Target_Platforms")) && f(idea, "Production_Target_Platforms").length
        ? f(idea, "Production_Target_Platforms")
        : (Array.isArray(f(idea, "Suggested_Platforms")) ? f(idea, "Suggested_Platforms") : AUTONOMOUS_STANDARD_PLATFORMS))
  );
  if (!platforms.length) throw new HttpError(400, "Choose at least one target platform");

  const contentType = String(
    payload.content_type
    || f(idea, "Production_Content_Type")
    || "Vertical Short Video"
  ).trim();
  const libraryIds = [
    ...new Set([
      ...(Array.isArray(payload.library_asset_ids) ? payload.library_asset_ids : []),
      ...linkedRecordIds(f(idea, "Studio_Matched_Media_Assets")),
      ...parseIdeaNotedMediaIds(f(idea, "Production_Config_Notes")),
    ].map((id) => String(id || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))
  ];
  if (!libraryIds.length) {
    throw new HttpError(409, "Attach library photos before preparing this idea for review");
  }

  const existingNotes = String(f(idea, "Production_Config_Notes") || "");
  const nextIdeaNotes = mergeIdeaProductionNotes(
    stampPrepareToReviewNotes(existingNotes),
    parseIdeaMachineNotes(existingNotes).user || undefined,
    libraryIds,
  );
  await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Production_Config_Notes: nextIdeaNotes,
        Production_Target_Platforms: platforms,
        Production_Content_Type: contentType,
      },
      typecast: true,
    }),
  }).catch(() => null);

  const input = {
    content_type: contentType,
    platforms,
    include_voiceover: payload.include_voiceover || f(idea, "Production_Include_Voiceover") || "Yes",
    include_background_music: payload.include_background_music || f(idea, "Production_Include_Background_Music") || "Yes",
    include_thumbnail: payload.include_thumbnail || f(idea, "Production_Include_Thumbnail") || "Yes",
    video_duration: payload.video_duration || f(idea, "Production_Video_Duration") || 30,
    production_notes: stampPrepareToReviewNotes(payload.production_notes || f(idea, "Production_Notes") || ""),
  };
  let requestRecord = await createDraftForIdea(env, idea, authorization, input);
  await attachItem4LibraryAssetIds(env, requestRecord.id, libraryIds, authorization);
  requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id);

  const requestNotes = String(f(requestRecord, "Production_Notes") || "");
  if (!/origin=(prepare-to-review|autonomous|az-finished-video)/i.test(requestNotes)) {
    requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Production_Notes: stampPrepareToReviewNotes(requestNotes) },
        typecast: true,
      }),
    });
  }

  // Plan with the operator's platforms before finishAutonomous (which defaults to standard Reel set).
  if (String(f(requestRecord, "Studio_Output_Plan_Status") || "").trim() !== "Ready") {
    const planCall = studioInternalJsonRequest(`/api/production-requests/${requestRecord.id}/plan`, {
      platforms,
      overrides: autonomousPlanOverrides(contentType),
      extras: autonomousPlanExtras(),
      skip_fbs1_guard: true,
    });
    await buildItem4OutputPlan(planCall.request, env, planCall.url, authorization);
    requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id);
  }

  const finished = await finishAutonomousProductionRequest(
    env,
    authorization,
    ctx,
    idea,
    requestRecord,
    { media_asset_ids: libraryIds, content_type: contentType },
    { awaitFinish: Boolean(payload.await_finish), scheduled: false }
  );

  return respond(request, env, {
    ok: true,
    message: finished?.waiting
      ? (finished.waiting_reason === "awaiting_i4"
        ? "Preparing production — waiting on I4 promotion."
        : "Preparing frames and production. Watch the Operations Queue.")
      : "Production started. Outputs will land at Ready for Review.",
    idea_id: ideaId,
    production_request_id: finished?.production_request_id || requestRecord.id,
    waiting: Boolean(finished?.waiting),
    waiting_reason: finished?.waiting_reason || null,
    gate: "ready_for_review",
  });
}
/*__STUDIO_WORKER_END:prepareIdeaToReview__*/

export async function getStudioOperations(request, env, authorization) {
  const chicago = chicagoNowParts();
  const lastDaily = await studioSettingsByName(env, STUDIO_I1_LAST_DAILY_SETTING);
  const lastAutonomous = await studioSettingsByName(env, STUDIO_AUTONOMOUS_LAST_SETTING);
  const libraryCrossScopeRow = await studioSettingsByName(env, LIBRARY_CROSS_SCOPE_SETTING).catch(() => null);
  const [profiles, readyToSchedule, readyToPublish, published, oversized, needingClassification, compressionJobs] = await Promise.all([
    listRecords(env, STUDIO_IDEA_PROFILE_TABLE_ID, { limit: 50 }),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit: 50, view: STUDIO_PUB1_VIEW_ID, filterFormula: "{Test_Run_ID}=BLANK()" }),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit: 50, view: STUDIO_PUB2_VIEW_ID, filterFormula: "{Test_Run_ID}=BLANK()" }),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit: 25, view: STUDIO_PUB3_VIEW_ID, filterFormula: "{Test_Run_ID}=BLANK()" }),
    listOversizedMedia(env).catch(() => []),
    listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, { limit: 25, view: STUDIO_A3_CLASSIFY_VIEW_ID }).catch(() => []),
    listActiveA1CompressionJobs(env).catch(() => []),
  ]);
  const libraryIntake = mapLibraryIntakeSnapshot(needingClassification, oversized);
  // Read-only watchlist for Ops; do not block Profiles on ensure/upsert side effects.
  const similarAccounts = await studioReadSimilarWatchlist(env).catch(() => []);
  return respond(request, env, {
    ok: true,
    page: "operations",
    timezone: "America/Chicago",
    chicago_date: chicago.date,
    chicago_hour: chicago.hour,
    last_daily_idea_date: f(lastDaily, "Setting_Value") || null,
    last_autonomous_run: parseAutonomousLastRun(f(lastAutonomous, "Setting_Value")),
    can_edit_profiles: Boolean(authorization?.permissions?.tenant_admin),
    can_publish_queue: Boolean(authorization?.permissions?.publishing_control),
    profiles: profiles.map(mapOperationsProfile),
    ready_to_schedule: readyToSchedule.map(mapOperationsOutput),
    ready_to_publish: readyToPublish.map(mapOperationsOutput),
    recently_published: published.map(mapOperationsOutput),
    oversized_media: attachCompressionJobs(oversized, compressionJobs),
    compression_jobs: compressionJobs,
    compression_headline: compressionJobs[0]?.headline || null,
    a1s_oversize_bytes: STUDIO_A1S_OVERSIZE_BYTES,
    library_intake: libraryIntake,
    similar_accounts: similarAccounts,
    library_include_cross_scope: libraryCrossScopeEnabled(f(libraryCrossScopeRow, "Setting_Value")),
  });
}
/*__STUDIO_WORKER_END:getStudioOperations__*/

export async function getStudioOperationsProfiles(request, env, authorization) {
  const profiles = await listRecords(env, STUDIO_IDEA_PROFILE_TABLE_ID, { limit: 50 });
  return respond(request, env, {
    ok: true,
    page: "operations-profiles",
    can_edit_profiles: Boolean(authorization?.permissions?.tenant_admin),
    profiles: (profiles || []).map(mapOperationsProfile),
  });
}
/*__STUDIO_WORKER_END:getStudioOperationsProfiles__*/

export async function patchStudioOperationsProfile(request, env, url, authorization) {
  const match = /^\/api\/operations\/profiles\/(rec[A-Za-z0-9]+)$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid profile path");
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const record = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, match[1]);
  if (!record?.id) throw new HttpError(404, "Content Profile was not found");
  const fields = {};
  if (payload.idea_generation_enabled !== undefined) fields.Idea_Generation_Enabled = Boolean(payload.idea_generation_enabled);
  if (payload.autonomous_produce_enabled !== undefined) fields.Autonomous_Produce_Enabled = Boolean(payload.autonomous_produce_enabled);
  if (payload.daily_idea_limit !== undefined) {
    const limit = Number(payload.daily_idea_limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new HttpError(400, "Daily idea limit must be a whole number from 1 to 10");
    fields.Daily_Idea_Limit = limit;
  }
  if (payload.background_color !== undefined) {
    if (payload.background_color === null || String(payload.background_color).trim() === "") {
      fields.Studio_Background_Color = null;
    } else {
      const color = normalizeStudioBackgroundColor(payload.background_color);
      if (color === null) throw new HttpError(400, "Background color must be a 6-digit hex value like #e8eef6");
      fields.Studio_Background_Color = color;
    }
  }
  if (payload.default_narration_voice_id !== undefined || payload.default_narration_voice_name !== undefined) {
    const voiceId = payload.default_narration_voice_id === undefined
      ? String(f(record, "Default_Narration_Voice_ID") || "").trim()
      : String(payload.default_narration_voice_id || "").trim().slice(0, 120);
    const voiceName = payload.default_narration_voice_name === undefined
      ? String(f(record, "Default_Narration_Voice_Name") || "").trim()
      : String(payload.default_narration_voice_name || "").trim().slice(0, 120);
    fields.Default_Narration_Voice_ID = voiceId || null;
    fields.Default_Narration_Voice_Name = voiceId ? (voiceName || voiceId) : null;
  }
  if (payload.autonomous_music_asset_ids !== undefined) {
    if (payload.autonomous_music_asset_ids === null) {
      fields.Autonomous_Music_Pool = [];
    } else if (!Array.isArray(payload.autonomous_music_asset_ids)) {
      throw new HttpError(400, "autonomous_music_asset_ids must be an array of Media Asset record ids");
    } else {
      const ids = linkedRecordIds(payload.autonomous_music_asset_ids);
      if (ids.length !== payload.autonomous_music_asset_ids.filter((value) => String(value || "").trim()).length) {
        throw new HttpError(400, "autonomous_music_asset_ids must contain only Airtable record ids");
      }
      fields.Autonomous_Music_Pool = ids;
    }
  }
  if (!Object.keys(fields).length) throw new HttpError(400, "No profile settings to update");
  const updated = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, record.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
  env.__contentProfilesPromise = null;
  return respond(request, env, { ok: true, profile: mapOperationsProfile(updated) });
}
/*__STUDIO_WORKER_END:patchStudioOperationsProfile__*/

export function studioInternalJsonRequest(pathname, body) {
  const url = new URL(`https://studio.chicagoshining.com${pathname}`);
  return {
    url,
    request: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    }),
  };
}
/*__STUDIO_WORKER_END:studioInternalJsonRequest__*/

export async function studioSaveAutonomousLastRun(env, payload) {
  const previous = await studioLoadAutonomousLastRun(env).catch(() => ({}));
  const merged = mergeAutonomousHourProgress(previous, payload || {});
  const stored = {
    ...merged,
    at: payload?.at || new Date().toISOString(),
  };
  await studioUpsertSetting(
    env,
    STUDIO_AUTONOMOUS_LAST_SETTING,
    JSON.stringify(stored),
    String(stored.skip_reason || stored.status || "autonomous run").slice(0, 500)
  );
  return stored;
}
/*__STUDIO_WORKER_END:studioSaveAutonomousLastRun__*/

export async function studioLoadAutonomousLastRun(env) {
  const row = await studioSettingsByName(env, STUDIO_AUTONOMOUS_LAST_SETTING);
  return parseAutonomousLastRun(f(row, "Setting_Value"));
}
/*__STUDIO_WORKER_END:studioLoadAutonomousLastRun__*/

export async function studioLoadAutonomousRefillScores(env, profiles, { refresh = false } = {}) {
  const enabled = (Array.isArray(profiles) ? profiles : []).filter((row) => row?.id);
  if (!enabled.length) return { scores: {}, overview: [], source: "empty" };
  const authKey = studioProfilesOverviewAuthKey(enabled);
  let rows = [];
  let source = "snapshot";
  const snapshot = await readStudioProfilesOverviewSnapshot(env).catch(() => null);
  if (snapshot?.rows?.length) {
    rows = snapshot.rows;
  }
  const age = snapshot?.at ? Date.now() - snapshot.at : Infinity;
  const stale = !rows.length || age > Math.max(STUDIO_PROFILES_OVERVIEW_CACHE_MS, 15 * 60 * 1000);
  if (refresh || stale) {
    try {
      rows = await buildStudioProfilesOverviewRows(env, enabled);
      await writeStudioProfilesOverviewSnapshot(env, rows, authKey).catch(() => null);
      source = "live";
    } catch (error) {
      console.warn("autonomous refill overview load failed", error);
      if (!rows.length) return { scores: {}, overview: [], source: "error", error: String(error?.message || error).slice(0, 180) };
      source = "stale_snapshot";
    }
  }
  const byEnabled = new Set(enabled.map((row) => String(row.id)));
  const overview = (rows || []).filter((row) => byEnabled.has(String(row?.id || "")));
  return {
    scores: autonomousRefillScoresFromOverview(overview, AUTONOMOUS_SCHEDULED_TARGET),
    overview,
    source,
    target: AUTONOMOUS_SCHEDULED_TARGET,
  };
}
/*__STUDIO_WORKER_END:studioLoadAutonomousRefillScores__*/

export async function harvestAutonomousNewsHeadlines() {
  const titles = [];
  for (const feed of AUTONOMOUS_NEWS_FEEDS) {
    try {
      const response = await fetch(feed, { headers: { "User-Agent": "ChicagoShining-Studio/autonomous" } });
      if (!response.ok) continue;
      titles.push(...parseRssItemTitles(await response.text(), { limit: 8 }));
    } catch (error) {
      console.warn("autonomous news feed failed", feed, error);
    }
  }
  return [...new Set(titles)].slice(0, 8).map((title) => ({ source: "news", title }));
}
/*__STUDIO_WORKER_END:harvestAutonomousNewsHeadlines__*/

export async function harvestAutonomousYoutube(env, options = {}) {
  const queries = autonomousYoutubeQueriesForTheme(options.theme);
  const force = options.force === true;
  if (!force) {
    const cacheRow = await studioSettingsByName(env, STUDIO_YOUTUBE_AUTONOMOUS_HARVEST_SETTING).catch(() => null);
    const raw = String(cacheRow?.fields?.Setting_Value || cacheRow?.fields?.Value || "").trim();
    if (raw) {
      try {
        const cached = JSON.parse(raw);
        const atMs = Date.parse(String(cached?.at || ""));
        if (Number.isFinite(atMs) && Date.now() - atMs < STUDIO_YOUTUBE_AUTONOMOUS_HARVEST_TTL_MS && Array.isArray(cached?.items)) {
          return cached.items;
        }
      } catch {
        /* fall through to live search */
      }
    }
  }
  const settings = await studioActivePipelineSettings(env, ["YOUTUBE_API_KEY"]).catch(() => ({}));
  const youtubeKey = settings.YOUTUBE_API_KEY || env.YOUTUBE_API_KEY;
  if (!youtubeKey) return [];
  const publishedAfter = youtubePublishedAfterIso();
  const query = queries[Math.floor(Math.random() * queries.length)];
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=8&publishedAfter=${encodeURIComponent(publishedAfter)}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(youtubeKey)}`;
  try {
    const response = await fetch(searchUrl);
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.error) {
      // Cache empty attempt briefly via stamp so a quota burn does not retry every autonomous pick.
      await studioUpsertSetting(
        env,
        STUDIO_YOUTUBE_AUTONOMOUS_HARVEST_SETTING,
        JSON.stringify({ at: new Date().toISOString(), query, items: [], error: true }),
        "Cached YouTube autonomous harvest (search.list ~100 units; 12h TTL)."
      ).catch(() => {});
      return [];
    }
    const items = mapYoutubeSearchItems(body);
    await studioUpsertSetting(
      env,
      STUDIO_YOUTUBE_AUTONOMOUS_HARVEST_SETTING,
      JSON.stringify({ at: new Date().toISOString(), query, items }),
      "Cached YouTube autonomous harvest (search.list ~100 units; 12h TTL)."
    ).catch((error) => console.warn("youtube autonomous harvest cache failed", error));
    return items;
  } catch (error) {
    console.warn("autonomous youtube harvest failed", error);
    return [];
  }
}
/*__STUDIO_WORKER_END:harvestAutonomousYoutube__*/

export async function harvestAutonomousLibraryCatalog(env, subject = "", profileId = "") {
  const pin = autonomousPreferredSubject(subject);
  const crossScope = await readLibraryCrossScopeSetting(env);
  const scopeFormula = await mediaAssetProfileScopeForId(env, profileId, { crossScope, includeUnscoped: false });
  let records = [];
  try {
    records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID || ITEM4_MEDIA_ASSET_TABLE, {
      limit: AUTONOMOUS_LIBRARY_SCAN_CAP,
      sortField: LIBRARY_ADDED_AT_FIELD,
      sortDirection: "desc",
      fields: [
        "Asset Name",
        "Location",
        "Topic",
        "Subtopic",
        "Media_Class",
        "MIME_Type",
        "Classification_Status",
        "Raw_Source_Eligibility",
        "Asset_Status",
        "Do_Not_Use",
        "Active",
        "Google Drive File ID",
        "Google Drive URL",
        LIBRARY_ADDED_AT_FIELD,
        "Intake_Date",
      ],
      filterFormula: combineAirtableFormulas(ideaLibraryFilterFormula(pin ? [pin.toLowerCase()] : []), scopeFormula),
    });
  } catch (error) {
    console.warn("autonomous library catalog failed", profileId, error);
    throw error;
  }
  const rows = [];
  for (const record of records || []) {
    if (!ideaLibraryIsEligibleImage(record)) continue;
    const topic = f(record, "Topic");
    rows.push({
      id: record.id,
      name: f(record, "Asset Name"),
      location: f(record, "Location") || null,
      topic: Array.isArray(topic) ? topic.join(", ") : (topic || null),
      subtopic: f(record, "Subtopic") || null,
      intake_date: ideaLibraryIntakeDate(record) || null,
    });
  }
  return rows;
}
/*__STUDIO_WORKER_END:harvestAutonomousLibraryCatalog__*/

export async function harvestAutonomousRecentTitles(env) {
  const rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 12,
    sortField: "Published_At",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Published_At}!="")',
  }).catch(() => []);
  return (rows || [])
    .map((row) => String(f(row, "Output_Title") || f(row, "Output_Caption") || "").trim())
    .filter(Boolean)
    .slice(0, 8);
}
/*__STUDIO_WORKER_END:harvestAutonomousRecentTitles__*/

export async function harvestAutonomousOccupiedTopics(env, profileId = "") {
  const ideaQuery = {
    limit: 200,
    sortField: AUTONOMOUS_IDEA_CREATED_FIELD,
    sortDirection: "desc",
    filterFormula: "{Test_Run_ID}=BLANK()",
  };
  let ideas = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, ideaQuery).catch(() => null);
  if (!ideas) {
    ideas = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
      ...ideaQuery,
      sortField: undefined,
    }).catch(() => []);
  }
  const requests = (await listRecords(env, PRODUCTION_REQUEST_TABLE, {
    limit: 100,
    sortField: "Created_At",
    sortDirection: "desc",
    filterFormula: "AND({Test_Run_ID}=BLANK(),{Request_Status}!='Cancelled')",
  }).catch(() => [])) || [];
  const published = await harvestAutonomousRecentTitles(env);
  return filterAutonomousOccupiedForProfile(mergeAutonomousOccupied([
    collectAutonomousOccupiedFromIdeas(ideas || []),
    (requests || []).map(mapAutonomousOccupiedRequest),
    published.map((title) => ({ source: "recent", title, location: "", media_asset_ids: [] })),
  ]), profileId);
}
/*__STUDIO_WORKER_END:harvestAutonomousOccupiedTopics__*/

export async function studioAutonomousOpenAiPick(env, prompt) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) throw new HttpError(503, "Pipeline runner is required for autonomous produce");
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const response = await fetch(`${runnerUrl}/jobs/autonomous-pick`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify({ prompt }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(
      response.status >= 400 ? response.status : 502,
      payload?.error || payload?.message || "I1 OpenAI pick failed"
    );
  }
  const parsed = payload?.parsed && typeof payload.parsed === "object" ? payload.parsed : payload;
  return parseAutonomousPick(parsed);
}
/*__STUDIO_WORKER_END:studioAutonomousOpenAiPick__*/

export async function createAutonomousIdea(env, profile, pick) {
  const fields = {
    Candidate_Title: pick.candidate_title,
    Candidate_Status: "Generated",
    Batch_Date: chicagoNowParts().date,
    Content_Profile: [profile.id],
    Idea_Summary: pick.idea_summary,
    Hook: pick.hook || null,
    Primary_Location: pick.primary_location || null,
    Neighborhood_or_Area: pick.neighborhood_or_area || null,
    Suggested_Visuals: pick.suggested_visuals || null,
    Required_Assets: pick.required_assets || null,
    Why_This_Should_Work: pick.why_this_should_work || null,
    Suggested_Format: [pick.content_type],
    Suggested_Platforms: [...AUTONOMOUS_STANDARD_PLATFORMS],
    Production_Content_Type: pick.content_type,
    Production_Target_Platforms: [...AUTONOMOUS_STANDARD_PLATFORMS],
    Production_Include_Voiceover: "Yes",
    Production_Include_Background_Music: "Yes",
    Production_Include_Thumbnail: "Yes",
    Production_Config_Notes: `origin=autonomous\nmedia_asset_ids=${(pick.media_asset_ids || []).join(",")}\ncited_trend=${pick.cited_trend || ""}\ncluster=${pick.cluster_label || ""}\n${pick.why_this_should_work || ""}`.slice(0, 3000),
  };
  if (pick.needs_assets || !(pick.media_asset_ids || []).length) {
    fields.Studio_Photo_Wait_Status = "Waiting";
  }
  return airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, "", {
    method: "POST",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:createAutonomousIdea__*/

export function autonomousPlanVariantsReady(record, reconciled = null) {
  const current = reconciled?.record || record;
  if (String(f(current, "Studio_Variant_Status") || "").trim() === "Ready") return true;
  if (reconciled?.status === "Ready") return true;
  const manifest = reconciled?.manifest || item4ParseJson(f(current, "Studio_Variant_Manifest_JSON"), null);
  const plan = item4ParseJson(f(current, "Studio_Output_Plan_JSON"), null);
  return item4VariantManifestPlanComplete(manifest, plan, item4AssetManifest(current));
}
/*__STUDIO_WORKER_END:autonomousPlanVariantsReady__*/

export async function waitAutonomousVariantsReady(env, recordId, ctx, maxMs = 80000) {
  const deadline = Date.now() + maxMs;
  let record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  while (Date.now() < deadline) {
    const reconciled = await item4ReconcileVariants(env, recordId, record).catch(() => null);
    if (reconciled?.record) record = reconciled.record;
    if (String(f(record, "Studio_Variant_Status") || "").trim() === "Error" || reconciled?.status === "Error") {
      throw new HttpError(409, String(f(record, "Studio_Variant_Error") || reconciled?.error || "Platform variants failed"));
    }
    if (autonomousPlanVariantsReady(record, reconciled)) return record;
    try { await item4ResumePendingVariants(env, recordId, record); } catch {}
    try { await item4DrainAllPendingWork(env, { maxMs: 15000 }); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 4000));
    record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  }
  if (ctx?.waitUntil) {
    ctx.waitUntil(item4ResumePendingVariants(env, recordId, record).catch((error) => {
      console.warn("autonomous variant resume deferred", error);
    }));
  }
  return record;
}
/*__STUDIO_WORKER_END:waitAutonomousVariantsReady__*/

export async function finishAutonomousProductionRequest(env, authorization, ctx, idea, requestRecord, pick, options = {}) {
  const requestId = requestRecord.id;
  let current = await ensureAutonomousSelectedMusic(env, requestRecord);
  const incoming = autonomousIncomingMediaIds(
    item4ParseJson(f(current, "Studio_Master_Assets_JSON"), []),
    pick.media_asset_ids
  );
  if (incoming.length) {
    await attachItem4LibraryAssetIds(env, requestId, incoming, authorization);
    current = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  }
  if (String(f(current, "Studio_Output_Plan_Status") || "").trim() !== "Ready") {
    const planCall = studioInternalJsonRequest(`/api/production-requests/${requestId}/plan`, {
      platforms: [...AUTONOMOUS_STANDARD_PLATFORMS],
      overrides: autonomousPlanOverrides(pick.content_type),
      extras: autonomousPlanExtras(),
      skip_fbs1_guard: true,
    });
    await buildItem4OutputPlan(planCall.request, env, planCall.url, authorization);
    current = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  }
  if (pick.content_type) {
    current = await alignAutonomousDraftContentType(env, current, pick.content_type);
  }

  const continueAfterPlan = async () => {
    let current = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
    let reconciled = await item4ReconcileVariants(env, requestId, current).catch(() => null);
    if (reconciled?.record) current = reconciled.record;
    if (!autonomousPlanVariantsReady(current, reconciled)) {
      const queued = Array.isArray(reconciled?.queue_rows) && reconciled.queue_rows.length;
      if (!queued) {
        const variantsCall = studioInternalJsonRequest(`/api/production-requests/${requestId}/variants`, {});
        await prepareItem4Variants(variantsCall.request, env, variantsCall.url, authorization, ctx);
      }
      current = await waitAutonomousVariantsReady(
        env,
        requestId,
        ctx,
        options.scheduled ? 8000 : 80000
      );
      if (!autonomousPlanVariantsReady(current)) {
        return { waiting: true, production_request_id: requestId, idea_id: idea.id };
      }
    }
    const preflight = await item4SourceToProductionBridgePreflight(env, current, idea);
    if (!preflight.ready) {
      const blockers = (preflight.issues || []).filter((issue) => !/preview image is still catching up/i.test(String(issue || "")));
      if (blockers.length) {
        throw new HttpError(409, `Autonomous bridge not ready: ${blockers.join(" ")}`);
      }
    }
    const promoteCall = studioInternalJsonRequest(`/api/production-requests/${requestId}/promote`, {});
    await promoteProductionRequestViaI3I4(promoteCall.request, env, promoteCall.url, authorization, ctx);
    let after = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
    if (String(f(after, "Request_Status") || "").trim() === "Submitted") {
      let ideaNow = await waitForPromotionResult(env, idea.id, 24, 1250);
      if (promotionCompleted(ideaNow)) {
        await finalizeProductionRequestPromotion(env, requestId, ideaNow);
        after = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
      }
    }
    if (String(f(after, "Request_Status") || "").trim() === "Submitted") {
      return {
        waiting: true,
        waiting_reason: "awaiting_i4",
        production_request_id: requestId,
        idea_id: idea.id,
      };
    }
    // Prior Remotion/produce still running — promote now, enqueue on a later tick
    // (orphan kick / FIFO advance) so two heavy renders do not collide.
    if (options.deferProduce) {
      return {
        waiting: false,
        deferred_produce: true,
        production_request_id: requestId,
        idea_id: idea.id,
      };
    }
    try { await enqueueStudioProductionJob(env, requestId); } catch (error) {
      console.warn("autonomous studio-produce enqueue failed", requestId, error);
    }
    try {
      await advanceStudioProductionOutputs(env, { requestRecordId: requestId, waitMs: 0 });
    } catch (error) {
      console.warn("autonomous continuation after produce enqueue failed", requestId, error);
    }
    return { waiting: false, production_request_id: requestId, idea_id: idea.id };
  };

  current = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  const variantsReady = autonomousPlanVariantsReady(current);
  if (variantsReady || options.awaitFinish || !ctx?.waitUntil) {
    return continueAfterPlan();
  }

  if (ctx?.waitUntil) {
    ctx.waitUntil(continueAfterPlan().then(async (finished) => {
      await studioSaveAutonomousLastRun(env, {
        status: finished.waiting
          ? (finished.waiting_reason === "awaiting_i4" ? "awaiting_i4" : "waiting_variants")
          : "producing",
        skip_reason: finished.waiting
          ? (finished.waiting_reason === "awaiting_i4" ? "awaiting_i4" : "variants_still_preparing")
          : null,
        idea_id: idea.id,
        production_request_id: requestId,
      });
    }).catch(async (error) => {
      console.warn("autonomous continue after plan failed", requestId, error);
      try {
        await studioSaveAutonomousLastRun(env, {
          status: "skipped",
          skip_reason: String(error?.message || error).slice(0, 180),
          idea_id: idea.id,
          production_request_id: requestId,
        });
      } catch {}
    }));
    return { waiting: true, production_request_id: requestId, idea_id: idea.id };
  }

  return continueAfterPlan();
}
/*__STUDIO_WORKER_END:finishAutonomousProductionRequest__*/

export function ideaMatchedMediaIds(idea) {
  const raw = f(idea, "Studio_Matched_Media_Assets");
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .map((row) => String(row || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
}
/*__STUDIO_WORKER_END:ideaMatchedMediaIds__*/

export async function ensureAutonomousSelectedMusic(env, requestRecord, profileRecord = null) {
  if (!requestRecord?.id) return requestRecord;
  if (linkedRecordIds(f(requestRecord, "Selected_Music_Asset")).length) return requestRecord;
  let profile = profileRecord;
  if (!profile) {
    const profileId = firstLinkedRecordId(f(requestRecord, "Content_Profile"));
    if (!profileId) return requestRecord;
    profile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId).catch(() => null);
  }
  if (!profile?.id) return requestRecord;
  const musicAssetId = pickAutonomousMusicAssetId(
    mapOperationsProfile(profile).autonomous_music_asset_ids,
    AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID,
  );
  const fields = {
    Selected_Music_Asset: [musicAssetId],
    Background_Music_Mode: "Yes",
  };
  return airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:ensureAutonomousSelectedMusic__*/

export async function stampPhotoReadyIdeaForAutonomousProduce(env, idea, requestRecord) {
  if (!idea?.id || !requestRecord?.id) return requestRecord;
  const alreadyAutonomous = isAutonomousOrigin(f(requestRecord, "Production_Notes"));
  const profileId = firstLinkedRecordId(f(idea, "Content_Profile"))
    || firstLinkedRecordId(f(requestRecord, "Content_Profile"));
  if (!profileId) return requestRecord;
  const profile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId).catch(() => null);
  if (!f(profile, "Active") || !f(profile, "Autonomous_Produce_Enabled")) return requestRecord;
  const fields = {};
  if (!alreadyAutonomous) {
    fields.Production_Notes = stampAutonomousOrigin(f(requestRecord, "Production_Notes"));
  }
  if (!linkedRecordIds(f(requestRecord, "Selected_Music_Asset")).length) {
    fields.Selected_Music_Asset = [pickAutonomousMusicAssetId(
      mapOperationsProfile(profile).autonomous_music_asset_ids,
      AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID,
    )];
    fields.Background_Music_Mode = "Yes";
  }
  if (!Object.keys(fields).length) return requestRecord;
  return airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:stampPhotoReadyIdeaForAutonomousProduce__*/

export async function adoptNextReadyDailyIdea(env, authorization, { limit = 8 } = {}) {
  const profiles = (await listRecords(env, STUDIO_IDEA_PROFILE_TABLE_ID, {
    limit: 50,
    filterFormula: "AND({Active}=1,{Autonomous_Produce_Enabled}=1)",
  })).map(mapOperationsProfile);
  const enabledIds = profiles.map((row) => row.id).filter(Boolean);
  if (!enabledIds.length) return [];

  const ideas = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
    limit: 40,
    sortField: "Create_Date",
    sortDirection: "asc",
    filterFormula: "AND({Studio_Photo_Wait_Status}='Ready',{Promoted_Content_Record_ID}=BLANK(),{Candidate_Status}!='On Hold',{Candidate_Status}!='Rejected')",
    fields: [
      "Candidate_Title",
      "Content_Profile",
      "Studio_Photo_Wait_Status",
      "Promoted_Content_Record_ID",
      "Candidate_Status",
      "Studio_Matched_Media_Assets",
    ],
  });
  if (!ideas.length) return [];

  const open = await listOpenProductionRequests(env, { limit: 100 });
  const draftByIdea = new Map();
  for (const record of open) {
    const ideaId = firstLinkedRecordId(f(record, "Idea_Candidate"));
    const status = String(f(record, "Request_Status") || "").trim();
    if (!ideaId || draftByIdea.has(ideaId)) continue;
    if (!["Draft", "Ready", "Submitted"].includes(status)) continue;
    if (!f(record, "Active")) continue;
    draftByIdea.set(ideaId, record);
  }

  const plain = ideas.map((idea) => {
    const draft = draftByIdea.get(idea.id) || null;
    return {
      id: idea.id,
      profile_id: firstLinkedRecordId(f(idea, "Content_Profile")),
      photo_wait_status: String(f(idea, "Studio_Photo_Wait_Status") || "").trim(),
      promoted: Boolean(String(f(idea, "Promoted_Content_Record_ID") || "").trim()),
      candidate_status: String(f(idea, "Candidate_Status") || "").trim(),
      already_autonomous: isAutonomousOrigin(draft ? f(draft, "Production_Notes") : ""),
      draft,
      matched_ids: ideaMatchedMediaIds(idea),
    };
  });

  const adopted = [];
  const max = Math.max(1, Number(limit) || 8);
  for (const idea of dailyIdeasReadyToProduce(plain, enabledIds)) {
    if (adopted.length >= max) break;
    const draft = idea.draft;
    if (!draft?.id) continue;
    const assetCount = Number(f(draft, "Studio_Master_Asset_Count") || 0);
    if (assetCount < 1) {
      if (!idea.matched_ids.length || !authorization) continue;
      try {
        await attachItem4LibraryAssetIds(env, draft.id, idea.matched_ids, authorization);
      } catch (error) {
        console.warn("daily idea asset attach failed", idea.id, error);
        continue;
      }
    }
    const profile = profiles.find((row) => row.id === idea.profile_id) || null;
    const profileRecord = profile?.id
      ? await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profile.id).catch(() => null)
      : null;
    const fields = {
      Production_Notes: stampAutonomousOrigin(f(draft, "Production_Notes")),
    };
    if (!linkedRecordIds(f(draft, "Selected_Music_Asset")).length) {
      fields.Selected_Music_Asset = [pickAutonomousMusicAssetId(
        (profile?.autonomous_music_asset_ids?.length
          ? profile.autonomous_music_asset_ids
          : mapOperationsProfile(profileRecord || {}).autonomous_music_asset_ids),
        AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID,
      )];
      fields.Background_Music_Mode = "Yes";
    }
    await airtableFetch(env, PRODUCTION_REQUEST_TABLE, draft.id, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
    adopted.push({ idea_id: idea.id, production_request_id: draft.id });
  }
  return adopted;
}
/*__STUDIO_WORKER_END:adoptNextReadyDailyIdea__*/

export async function listAutonomousDraftRequests(env) {
  return listRecords(env, PRODUCTION_REQUEST_TABLE, {
    limit: Math.max(40, AUTONOMOUS_HOUR_ASSET_DRAIN + 10),
    // Autonomous harvest + operator Prepare-to-Review both need Draft/Ready/Submitted resume.
    // More than one row so a Chicago/LA draft cannot block the next Miami or NYC draft.
    filterFormula: "AND(OR({Request_Status}='Draft',{Request_Status}='Ready',{Request_Status}='Submitted'),OR(FIND('origin=autonomous',{Production_Notes}&'')>0,FIND('origin=prepare-to-review',{Production_Notes}&'')>0))",
    sortField: "Created_At",
    sortDirection: "asc",
  });
}
/*__STUDIO_WORKER_END:listAutonomousDraftRequests__*/

export async function annotateAutonomousResumeDrafts(env, drafts) {
  const profiles = (await listRecords(env, STUDIO_IDEA_PROFILE_TABLE_ID, {
    limit: 50,
    filterFormula: "AND({Active}=1,{Autonomous_Produce_Enabled}=1)",
  })).map(mapOperationsProfile);
  const enabled = new Set(profiles.map((row) => row.id));
  const annotated = [];
  const nowMs = Date.now();
  for (let requestRecord of drafts || []) {
    let notes = String(f(requestRecord, "Production_Notes") || "");
    // Factory revision is an operator hold. Skip it before undefer: Ready
    // variants would clear a deferred stamp and this draft would lock FIFO again.
    if (productionNotesRevisionOpen(notes)) continue;
    let profileId = "";
    if (isAutonomousOrigin(notes)) {
      const ideaId = firstLinkedRecordId(f(requestRecord, "Idea_Candidate"));
      const idea = ideaId
        ? await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaId).catch(() => null)
        : null;
      profileId = firstLinkedRecordId(idea ? f(idea, "Content_Profile") : "");
    }
    let variantStatus = String(f(requestRecord, "Studio_Variant_Status") || "").trim();
    let variantUpdatedAt = f(requestRecord, "Studio_Variant_Updated_At") || requestRecord.createdTime || "";
    const draftCreatedAt = f(requestRecord, "Created_At") || requestRecord.createdTime || "";
    // Crops can finish while the parent stays Preparing (reconcile gap). Reconcile
    // before parking so Ready drafts are not deferred forever.
    if (isAutonomousOrigin(notes) && (variantStatus === "Preparing" || variantStatus === "Error")) {
      try {
        const resumed = await item4ResumePendingVariants(env, requestRecord.id, requestRecord);
        if (resumed?.record) {
          requestRecord = resumed.record;
          variantStatus = String(f(requestRecord, "Studio_Variant_Status") || "").trim();
          variantUpdatedAt = f(requestRecord, "Studio_Variant_Updated_At") || requestRecord.createdTime || "";
          notes = String(f(requestRecord, "Production_Notes") || notes);
        }
      } catch (error) {
        console.warn("autonomous prepare reconcile before resume failed", requestRecord.id, error);
      }
    }
    // 30m SLA: re-enter FIFO when Ready (or non-Preparing overdue), not only after reconcile.
    if (isAutonomousOrigin(notes)
      && shouldClearAutonomousResumeDeferred(notes, variantStatus, draftCreatedAt, nowMs)) {
      try {
        const cleared = clearAutonomousResumeDeferred(notes);
        requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id, {
          method: "PATCH",
          body: JSON.stringify({ fields: { Production_Notes: cleared }, typecast: true }),
        });
        notes = cleared;
      } catch (error) {
        console.warn("autonomous undefer for SLA drain failed", requestRecord.id, error);
      }
    }
    // Auto-park long-Preparing drafts so FIFO can reach the next city.
    if (isAutonomousOrigin(notes) && !isAutonomousResumeDeferred(notes)
      && autonomousPreparingIsStale(variantStatus, variantUpdatedAt, nowMs, 12 * 60 * 1000, draftCreatedAt)) {
      try {
        await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: { Production_Notes: stampAutonomousResumeDeferred(notes, "preparing_stale") },
            typecast: true,
          }),
        });
      } catch (error) {
        console.warn("autonomous defer preparing draft failed", requestRecord.id, error);
      }
      continue;
    }
    annotated.push({
      requestRecord,
      notes,
      profile_id: profileId,
      variant_status: variantStatus,
      variant_updated_at: variantUpdatedAt,
      created_at: draftCreatedAt,
    });
  }
  return { annotated, enabledIds: [...enabled], nowMs };
}
/*__STUDIO_WORKER_END:annotateAutonomousResumeDrafts__*/

export async function selectAutonomousResumeDraft(env, drafts) {
  const { annotated, enabledIds, nowMs } = await annotateAutonomousResumeDrafts(env, drafts);
  const chosen = firstAutonomousResumeDraft(annotated, enabledIds, nowMs);
  return chosen?.requestRecord || null;
}
/*__STUDIO_WORKER_END:selectAutonomousResumeDraft__*/

export async function selectAutonomousResumeDraftBatch(env, drafts, { limit = AUTONOMOUS_HOUR_ASSET_DRAIN } = {}) {
  const { annotated, enabledIds, nowMs } = await annotateAutonomousResumeDrafts(env, drafts);
  return listAutonomousResumeDrafts(annotated, enabledIds, { limit, nowMs })
    .map((row) => row?.requestRecord)
    .filter(Boolean);
}
/*__STUDIO_WORKER_END:selectAutonomousResumeDraftBatch__*/

export async function alignAutonomousDraftContentType(env, requestRecord, contentType) {
  const current = String(f(requestRecord, "Master_Content_Type") || "").trim();
  if (!contentType || current === contentType) return requestRecord;
  return airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id, {
    method: "PATCH",
    body: JSON.stringify({ fields: { Master_Content_Type: contentType }, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:alignAutonomousDraftContentType__*/

export async function resumeAutonomousDrafts(env, authorization, ctx, drafts, chicago, slot, options = {}) {
  const drainLimit = Math.max(
    1,
    Number(options.drainLimit) || (options.hourAssetDrain ? AUTONOMOUS_HOUR_ASSET_DRAIN : 1),
  );
  const batch = await selectAutonomousResumeDraftBatch(env, drafts, { limit: Math.max(drainLimit * 2, drainLimit) });
  if (!batch.length) {
    return { status: "no_enabled_profile", chicago_date: chicago.date, slot, resumed: [] };
  }
  // Prefer drafts that already have masters. Skip/park empty ones without burning the drain budget.
  const withAssets = [];
  for (const requestRecord of batch) {
    if (withAssets.length >= drainLimit) break;
    const mediaAssetIds = autonomousMasterMediaIds(item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), []));
    if (!mediaAssetIds.length) {
      await parkAutonomousResumeDraft(env, requestRecord, "resume_missing_assets");
      continue;
    }
    withAssets.push({ requestRecord, mediaAssetIds });
  }
  if (!withAssets.length) {
    return { status: "no_enabled_profile", chicago_date: chicago.date, slot, resumed: [], skip_reason: "resume_missing_assets" };
  }
  drafts = withAssets.map((row) => row.requestRecord);
  const ids = drafts.map((row) => row.id);
  const ideaIds = drafts.map((row) => firstLinkedRecordId(f(row, "Idea_Candidate"))).filter(Boolean);
  const baseDeferProduce = Boolean(options.deferProduce);

  const runAll = async () => {
    const results = [];
    let enqueuedProduce = false;
    for (let index = 0; index < withAssets.length; index += 1) {
      const { requestRecord, mediaAssetIds } = withAssets[index];
      const ideaId = firstLinkedRecordId(f(requestRecord, "Idea_Candidate"));
      if (!ideaId) {
        results.push({ production_request_id: requestRecord.id, status: "skipped", skip_reason: "missing_idea" });
        continue;
      }
      const idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaId);
      const contentType = autonomousCanonicalContentType(
        String(f(idea, "Production_Content_Type") || "Vertical Short Video").trim()
      );
      // Serialize Remotion: only the first asset-ready draft enqueues produce in this pass.
      const deferProduce = baseDeferProduce || enqueuedProduce || index > 0;
      try {
        await alignAutonomousDraftContentType(env, requestRecord, contentType);
        const finished = await finishAutonomousProductionRequest(env, authorization, ctx, idea, requestRecord, {
          content_type: contentType,
          media_asset_ids: mediaAssetIds,
        }, {
          awaitFinish: true,
          scheduled: Boolean(options.scheduled),
          deferProduce,
        });
        if (!finished.waiting && !finished.deferred_produce) enqueuedProduce = true;
        results.push({
          production_request_id: finished.production_request_id,
          idea_id: finished.idea_id,
          status: finished.waiting
            ? (finished.waiting_reason === "awaiting_i4" ? "awaiting_i4" : "waiting_variants")
            : (finished.deferred_produce ? "promoted_deferred_produce" : "producing"),
        });
      } catch (error) {
        console.warn("autonomous draft resume failed", requestRecord.id, error);
        if (autonomousErrorIsFactoryRevision(error)) {
          results.push({
            production_request_id: requestRecord.id,
            idea_id: ideaId,
            status: "reset",
            skip_reason: "skip_factory_revision_open",
          });
        } else {
          results.push({
            production_request_id: requestRecord.id,
            idea_id: ideaId,
            status: "skipped",
            skip_reason: String(error?.message || error).slice(0, 180),
          });
        }
      }
    }
    if (results.length && results.every((row) => row.skip_reason === "skip_factory_revision_open")) {
      await releaseAutonomousRevisionLock(env, chicago, {
        productionRequestId: results[0].production_request_id,
        ideaId: results[0].idea_id,
      });
      return results;
    }
    const waitingI4 = results.some((row) => row.status === "awaiting_i4");
    const waiting = results.some((row) => row.status === "waiting_variants");
    const producing = results.some((row) => row.status === "producing" || row.status === "promoted_deferred_produce");
    await studioSaveAutonomousLastRun(env, {
      status: waitingI4 ? "awaiting_i4" : (waiting ? "waiting_variants" : (producing ? "producing" : "skipped")),
      skip_reason: waitingI4
        ? "awaiting_i4"
        : (waiting ? "variants_still_preparing" : (baseDeferProduce ? "deferred_produce_prior_in_flight" : null)),
      chicago_date: chicago.date,
      slot,
      idea_id: ideaIds[ideaIds.length - 1] || null,
      production_request_id: ids[ids.length - 1] || null,
      production_request_ids: ids,
      resumed: results,
      hour_asset_drain: drainLimit,
      deferred_produce: baseDeferProduce || undefined,
      prior_produce_request_id: options.priorProduceRequestId || null,
    });
    return results;
  };

  await studioSaveAutonomousLastRun(env, {
    status: "resuming",
    skip_reason: null,
    chicago_date: chicago.date,
    slot,
    idea_id: ideaIds[0] || null,
    production_request_id: ids[0] || null,
    production_request_ids: ids,
    hour_asset_drain: drainLimit,
    prior_produce_request_id: options.priorProduceRequestId || null,
  });

  if (ctx?.waitUntil) {
    ctx.waitUntil(runAll().catch((error) => {
      console.warn("autonomous draft resume failed", error);
    }));
    return {
      status: "resuming",
      chicago_date: chicago.date,
      slot,
      resumed: drafts.map((row, index) => ({
        production_request_id: row.id,
        idea_id: ideaIds[index] || null,
      })),
    };
  }

  const results = await runAll();
  return {
    status: results.some((row) => row.status === "awaiting_i4")
      ? "awaiting_i4"
      : (results.some((row) => row.status === "waiting_variants") ? "waiting_variants" : "producing"),
    chicago_date: chicago.date,
    slot,
    resumed: results,
  };
}
/*__STUDIO_WORKER_END:resumeAutonomousDrafts__*/

export async function studioHealAutonomousRevisionLock(env) {
  const last = await studioLoadAutonomousLastRun(env);
  const requestId = String(last?.production_request_id || "").trim();
  if (!requestId) return { healed: 0 };
  const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId).catch(() => null);
  const finding = classifyAutonomousRevisionLock(last, f(requestRecord, "Production_Notes"));
  if (!finding) return { healed: 0 };
  await releaseAutonomousRevisionLock(env, chicagoNowParts(), {
    productionRequestId: requestId,
    ideaId: last?.idea_id || null,
  });
  return { healed: 1, fingerprint: finding.fingerprint, record_id: requestId };
}
/*__STUDIO_WORKER_END:studioHealAutonomousRevisionLock__*/

export async function releaseAutonomousRevisionLock(env, chicago, { productionRequestId = null, ideaId = null } = {}) {
  return studioSaveAutonomousLastRun(env, autonomousRevisionLockReset({
    chicagoDate: chicago?.date || null,
    productionRequestId,
    ideaId,
  }));
}
/*__STUDIO_WORKER_END:releaseAutonomousRevisionLock__*/

export async function parkAutonomousResumeDraft(env, requestRecord, reason) {
  if (!requestRecord?.id) return;
  const notes = String(f(requestRecord, "Production_Notes") || "");
  if (isAutonomousResumeDeferred(notes)) return;
  try {
    await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Production_Notes: stampAutonomousResumeDeferred(notes, reason) },
        typecast: true,
      }),
    });
  } catch (error) {
    console.warn("autonomous park draft failed", requestRecord.id, error);
  }
}
/*__STUDIO_WORKER_END:parkAutonomousResumeDraft__*/

export async function countAutonomousOpenIdeas(env, { cap = AUTONOMOUS_OPEN_IDEAS_CAP } = {}) {
  if (!env?.AIRTABLE_IDEA_TABLE_ID) return 0;
  const limit = Math.max(1, Number(cap) || AUTONOMOUS_OPEN_IDEAS_CAP) + 1;
  const rows = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
    limit,
    fields: ["Candidate_Status", "Promoted_Content_Record_ID"],
    filterFormula: AUTONOMOUS_OPEN_IDEAS_FORMULA,
  }).catch(() => []);
  return Array.isArray(rows) ? rows.length : 0;
}
/*__STUDIO_WORKER_END:countAutonomousOpenIdeas__*/

export async function fillAutonomousCityIdeas(env, authorization, {
  chicago,
  slot,
  profileId,
  counts,
  skips,
  preferredSubject,
  refillScores,
  createBudget = AUTONOMOUS_IDEAS_PER_HOUR,
}) {
  const hourGoal = AUTONOMOUS_IDEAS_PER_HOUR;
  let count = Math.max(0, Number(counts?.[profileId]) || 0);
  const budget = Math.max(0, Number(createBudget) || 0);
  const goal = Math.min(hourGoal, count + budget);
  const profile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId);
  const profileSettings = mapOperationsProfile(profile);
  let saved = await studioSaveAutonomousLastRun(env, {
    status: "picking",
    skip_reason: null,
    chicago_date: chicago.date,
    chicago_hour: chicago.hour,
    slot,
    preferred_subject: preferredSubject || null,
    scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
    open_ideas_cap: AUTONOMOUS_OPEN_IDEAS_CAP,
    ideas_per_hour: hourGoal,
    refill_profile_id: profileId,
    ideas_by_profile: { ...counts, [profileId]: count },
    hour_profile_skip: { ...skips },
    refill: refillScores ? Object.values(refillScores) : null,
  });
  let created = 0;
  const persist = async (status, skipReason) => {
    saved = await studioSaveAutonomousLastRun(env, {
      status,
      skip_reason: skipReason || null,
      chicago_date: chicago.date,
      chicago_hour: chicago.hour,
      slot,
      ideas_by_profile: { ...counts, [profileId]: count },
      hour_profile_skip: { ...skips },
      ideas_per_hour: hourGoal,
      open_ideas_cap: AUTONOMOUS_OPEN_IDEAS_CAP,
      ideas_created_this_pass: created,
      refill_profile_id: profileId,
      scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
      scheduled_skip_above: AUTONOMOUS_SCHEDULED_SKIP_ABOVE,
    });
    return saved;
  };
  if (budget <= 0) {
    await persist("skipped", "open_ideas_cap");
    return { created_count: 0, last: saved, counts, skips, stop: true };
  }
  if (count >= goal) {
    await persist("skipped", "hour_quota_met");
    return { created_count: 0, last: saved, counts, skips, stop: false };
  }
  let catalog = [];
  try {
    catalog = await harvestAutonomousLibraryCatalog(env, "", profileId);
  } catch (error) {
    console.warn("autonomous library catalog failed", profileId, error);
    try {
      catalog = await harvestAutonomousLibraryCatalog(env, "", profileId);
    } catch (retryError) {
      console.warn("autonomous library catalog retry failed", profileId, retryError);
      catalog = [];
    }
  }
  const planned = planAutonomousHourIdeas(catalog, {
    goal: Math.max(0, goal - count),
    profileName: String(f(profile, "Profile_Name") || "").trim(),
    startIndex: count,
  });
  for (const plannedPick of planned) {
    if (count >= goal) break;
    const pick = {
      ...plannedPick,
      content_type: autonomousCanonicalContentType(plannedPick.content_type),
    };
    let idea = null;
    let requestRecord = null;
    let savedThis = false;
    for (let attempt = 0; attempt < 3 && !savedThis; attempt += 1) {
      try {
        if (!idea) idea = await createAutonomousIdea(env, profile, pick);
        if ((pick.media_asset_ids || []).length) {
          if (!requestRecord) {
            const defaults = productionRequestDefaultsFromIdea(idea);
            const narration = resolveAutonomousNarrationVoice(profileSettings, {
              voice_id: PHASE6_DEFAULT_VOICE_ID,
              voice_name: "Kate",
            });
            const musicAssetId = pickAutonomousMusicAssetId(
              profileSettings.autonomous_music_asset_ids,
              AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID,
            );
            const input = await cleanProductionRequestPayload({
              ...defaults,
              content_type: pick.content_type,
              platforms: [...AUTONOMOUS_STANDARD_PLATFORMS],
              voiceover_mode: "Yes",
              background_music_mode: "Yes",
              thumbnail_mode: "Yes",
              video_duration_seconds: null,
              voiceover_duration_seconds: null,
              voiceover_tail_seconds: 0,
              music_start_seconds: 0,
              selected_music_asset_id: musicAssetId,
              voice_id: narration.voice_id || PHASE6_DEFAULT_VOICE_ID,
              voice_name: narration.voice_name || "Kate",
              carousel_image_mode: "Manual Upload",
              caption_mode: pick.post_caption ? "AI improve" : "AI decides",
              requested_caption: pick.post_caption || "",
              production_notes: `origin=autonomous cited_trend=${pick.cited_trend || ""}`.slice(0, 3000),
              primary_location: pick.primary_location || defaults.primary_location,
            }, env);
            requestRecord = await createDraftForIdea(env, idea, authorization, input);
          }
          await attachItem4LibraryAssetIds(env, requestRecord.id, pick.media_asset_ids, authorization);
        }
        count += 1;
        created += 1;
        counts[profileId] = count;
        saved = await studioSaveAutonomousLastRun(env, {
          status: "producing",
          skip_reason: null,
          chicago_date: chicago.date,
          chicago_hour: chicago.hour,
          slot,
          idea_id: idea.id,
          production_request_id: requestRecord?.id || null,
          ideas_by_profile: { ...counts },
          hour_profile_skip: { ...skips },
          ideas_per_hour: hourGoal,
          open_ideas_cap: AUTONOMOUS_OPEN_IDEAS_CAP,
          ideas_created_this_pass: created,
          refill_profile_id: profileId,
          scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
          scheduled_skip_above: AUTONOMOUS_SCHEDULED_SKIP_ABOVE,
        });
        savedThis = true;
      } catch (error) {
        console.warn("autonomous hour idea failed", profileId, attempt, error);
      }
    }
  }
  await persist(created ? "producing" : "skipped", created ? null : "hour_create_short");
  return { created_count: created, last: saved, counts, skips, stop: false };
}
/*__STUDIO_WORKER_END:fillAutonomousCityIdeas__*/

export async function fillAutonomousScheduledHour(env, authorization, {
  chicago,
  slot,
  last,
  profiles,
  preferredSubject = "",
}) {
  const openIdeasCount = await countAutonomousOpenIdeas(env);
  const openIdeasRoom = autonomousOpenIdeasRoom(openIdeasCount);
  const sameSlot = String(last?.slot || "") === String(slot || "");
  if (autonomousOpenIdeasAtCap(openIdeasCount)) {
    if (sameSlot && last?.status === "skipped" && last?.skip_reason === "open_ideas_cap") {
      return { terminal: true, created_count: 0, last, result: last };
    }
    const saved = await studioSaveAutonomousLastRun(env, {
      skipped: "open_ideas_cap",
      chicago_date: chicago.date,
      chicago_hour: chicago.hour,
      slot,
      status: "skipped",
      skip_reason: "open_ideas_cap",
      open_ideas_count: openIdeasCount,
      open_ideas_cap: AUTONOMOUS_OPEN_IDEAS_CAP,
      scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
      ideas_per_hour: AUTONOMOUS_IDEAS_PER_HOUR,
    });
    return { terminal: true, created_count: 0, last: saved, result: saved };
  }
  const refillMeta = await studioLoadAutonomousRefillScores(env, profiles);
  const loadedScores = refillMeta?.scores || {};
  const scoreCount = Object.keys(loadedScores).length;
  let refillScores = null;
  if (!scoreCount || refillMeta?.source === "error" || refillMeta?.source === "empty") {
    console.warn("autonomous refill scores unavailable; harvesting without target gate", refillMeta?.source || "missing");
  } else {
    refillScores = loadedScores;
  }
  const needing = refillScores ? autonomousProfilesNeedingRefill(profiles, refillScores) : (profiles || []);
  if (refillScores && !needing.length) {
    const bands = Object.values(refillScores).map((row) => row?.band);
    const skipReason = bands.length && bands.every((band) => band === "skip")
      ? "scheduled_over_209"
      : "scheduled_target_met";
    if (sameSlot && last?.status === "skipped" && last?.skip_reason === skipReason) {
      return { terminal: true, created_count: 0, last, result: last };
    }
    const saved = await studioSaveAutonomousLastRun(env, {
      skipped: skipReason,
      chicago_date: chicago.date,
      chicago_hour: chicago.hour,
      slot,
      status: "skipped",
      skip_reason: skipReason,
      scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
      scheduled_skip_above: AUTONOMOUS_SCHEDULED_SKIP_ABOVE,
      ideas_per_hour: AUTONOMOUS_IDEAS_PER_HOUR,
      refill: Object.values(refillScores),
      refill_source: refillMeta?.source || null,
    });
    return { terminal: true, created_count: 0, last: saved, result: saved };
  }
  const open = refillScores
    ? autonomousRefillProfilesStillOpen(profiles, refillScores, last, slot)
    : (profiles || []).filter((row) => autonomousProfileHourOpen(last, slot, row?.id));
  if (!open.length) {
    const exhausted = needing.length > 0 && needing.every((row) => sameSlot && last?.hour_profile_skip?.[row.id]);
    const skipReason = exhausted ? "no_distinct_subject" : "hour_quota_met";
    if (sameSlot && last?.status === "skipped" && last?.skip_reason === skipReason) {
      return { terminal: true, created_count: 0, last, result: last };
    }
    const saved = await studioSaveAutonomousLastRun(env, {
      skipped: skipReason,
      chicago_date: chicago.date,
      chicago_hour: chicago.hour,
      slot,
      status: "skipped",
      skip_reason: skipReason,
      scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
      ideas_per_hour: AUTONOMOUS_IDEAS_PER_HOUR,
      hour_complete: skipReason === "hour_quota_met",
      ideas_by_profile: sameSlot ? (last?.ideas_by_profile || {}) : {},
      hour_profile_skip: sameSlot ? (last?.hour_profile_skip || {}) : {},
      refill: refillScores ? Object.values(refillScores) : null,
    });
    return { terminal: true, created_count: 0, last: saved, result: saved };
  }
  const picked = pickAutonomousRefillProfile(open, refillScores) || open[0];
  const order = autonomousProfileHarvestOrder(open, picked?.id, refillScores);
  const counts = sameSlot && last?.ideas_by_profile ? { ...last.ideas_by_profile } : {};
  const skips = sameSlot && last?.hour_profile_skip ? { ...last.hour_profile_skip } : {};
  let createdCount = 0;
  let workingLast = last;
  for (const candidate of order) {
    const createBudget = autonomousOpenIdeasCreateBudget(openIdeasCount, createdCount);
    if (createBudget <= 0) break;
    if (!candidate?.id || !autonomousProfileHourOpen({ slot, ideas_by_profile: counts, hour_profile_skip: skips }, slot, candidate.id)) {
      continue;
    }
    const outcome = await fillAutonomousCityIdeas(env, authorization, {
      chicago,
      slot,
      profileId: candidate.id,
      counts,
      skips,
      preferredSubject,
      refillScores,
      createBudget,
    });
    workingLast = outcome.last || workingLast;
    createdCount += outcome.created_count || 0;
    if (outcome.stop || autonomousOpenIdeasCreateBudget(openIdeasCount, createdCount) <= 0) break;
  }
  const stillOpen = refillScores
    ? autonomousRefillProfilesStillOpen(profiles, refillScores, workingLast, slot)
    : (profiles || []).filter((row) => autonomousProfileHourOpen(workingLast, slot, row?.id));
  // Cap may leave per-city hour quotas open; still treat the hour as done so
  // the scheduled-target refill cannot keep minting past 50 open ideas.
  const cappedOut = openIdeasRoom > 0 && autonomousOpenIdeasCreateBudget(openIdeasCount, createdCount) <= 0;
  return {
    terminal: stillOpen.length === 0 || cappedOut,
    created_count: createdCount,
    last: workingLast,
    result: workingLast,
  };
}
/*__STUDIO_WORKER_END:fillAutonomousScheduledHour__*/

export async function executeStudioAutonomousProduce(env, ctx, options = {}) {
  const chicago = autonomousClockForCron(chicagoNowParts(), options.cronMinute);
  // Hourly refill slot (date:hHH). Legacy am/pm slots still match claimed hours at 8/16.
  const slot = autonomousRefillSlot(chicago) || autonomousSlot(chicago);
  const topOfHour = autonomousAtTopOfHour(chicago);
  const harvestThisHour = Boolean(
    options.scheduled && !options.force && !options.dry_run && !options.resume_only && topOfHour
  );
  let last = await studioLoadAutonomousLastRun(env);
  let authorization = options.authorization;
  if (!authorization?.user?.record_id) {
    authorization = await resolveStudioCronAuthorization(env);
  }

  // A stuck Preparing / I4 wait / hung resuming must not monopolize FIFO
  // (Color Rush status=resuming for hours left Needs eyes empty).
  const lastStatus = String(last?.status || "").trim();
  // Prior job already finished → clear the lock and take the next draft.
  // Do not park Promoted+done rows as deferred (that was parking Color Rush).
  if (last.production_request_id) {
    const prior = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, last.production_request_id).catch(() => null);
    const priorStatus = String(f(prior, "Request_Status") || "").trim();
    const priorJob = prior ? parseStudioProductionJob(prior) : null;
    const priorStep = String(priorJob?.step || "").trim();
    if (priorStatus === "Promoted" && (priorStep === "done" || priorStep === "blocked")) {
      last = await studioSaveAutonomousLastRun(env, {
        status: "reset",
        skip_reason: priorStep === "done" ? "prior_job_done_advance_fifo" : "prior_job_blocked_advance_fifo",
        chicago_date: chicago.date,
        slot: null,
        idea_id: null,
        production_request_id: null,
        completed_production_request_id: last.production_request_id,
        completed_idea_id: last.idea_id || null,
      });
    }
  }
  const waitingStale = autonomousWaitingIsStale(last) || (
    Boolean(options.force)
    && ["waiting_variants", "awaiting_i4", "resuming", "picking"].includes(lastStatus)
  );
  if (waitingStale && last.production_request_id) {
    const stuck = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, last.production_request_id).catch(() => null);
    const stuckStatus = String(f(stuck, "Request_Status") || "").trim();
    // Only park drafts still waiting on variants / I4 — never park finished produce.
    if (stuckStatus !== "Promoted") {
      await parkAutonomousResumeDraft(env, stuck, String(last.skip_reason || last.status || "waiting_stale"));
    }
    last = await studioSaveAutonomousLastRun(env, {
      status: "reset",
      skip_reason: "skip_stuck_waiting_for_next_draft",
      chicago_date: chicago.date,
      slot: null,
      idea_id: null,
      production_request_id: null,
      parked_production_request_id: last.production_request_id,
      parked_idea_id: last.idea_id || null,
    });
  }

  // An open draft must not swallow the top-of-hour create. :05 ticks still
  // finish that draft. The hour itself always creates its 10 ideas first.
  if (!harvestThisHour && last.production_request_id && last.idea_id) {
    const idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, last.idea_id).catch(() => null);
    const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, last.production_request_id).catch(() => null);
    const requestStatus = String(f(requestRecord, "Request_Status") || "").trim();
    const notes = f(requestRecord, "Production_Notes");
    const job = requestRecord ? parseStudioProductionJob(requestRecord) : null;
    const jobStep = String(job?.step || "").trim();
    const variantStatus = String(f(requestRecord, "Studio_Variant_Status") || "").trim();
    const variantUpdatedAt = f(requestRecord, "Studio_Variant_Updated_At") || requestRecord?.createdTime || "";
    const draftCreatedAt = f(requestRecord, "Created_At") || requestRecord?.createdTime || "";
    if (
      isAutonomousResumeDeferred(notes)
      || autonomousPreparingIsStale(variantStatus, variantUpdatedAt, Date.now(), 12 * 60 * 1000, draftCreatedAt)
    ) {
      if (!isAutonomousResumeDeferred(notes) && requestRecord) {
        await parkAutonomousResumeDraft(env, requestRecord, "preparing_stale");
      }
      last = await studioSaveAutonomousLastRun(env, {
        status: "reset",
        skip_reason: isAutonomousResumeDeferred(notes) ? "skip_deferred_draft" : "skip_preparing_stale_draft",
        chicago_date: chicago.date,
        idea_id: null,
        production_request_id: null,
        parked_production_request_id: requestRecord?.id || last.production_request_id,
      });
    } else if (productionNotesRevisionOpen(notes)) {
      // Operator hold. Fall through to the next draft. Do not keep this request id.
      last = await releaseAutonomousRevisionLock(env, chicago, {
        productionRequestId: requestRecord?.id || last.production_request_id,
        ideaId: last.idea_id || null,
      });
    } else {
    const lastNeedsResume = ["waiting_variants", "awaiting_i4", "skipped", "reset", "picking", "resuming"].includes(String(last.status || "").trim())
      || autonomousRequestNeedsContinue(requestStatus, notes)
      || (isAutonomousOrigin(notes) && requestStatus === "Promoted" && !jobStep);
    if (["waiting_variants", "awaiting_i4"].includes(String(last.status || "").trim()) && (!idea || !requestRecord)) {
      return studioSaveAutonomousLastRun(env, { ...last, status: "reset", skip_reason: "waiting_record_gone" });
    }
    if (idea && requestRecord && lastNeedsResume && (
      autonomousRequestNeedsContinue(requestStatus, notes)
      || (isAutonomousOrigin(notes) && requestStatus === "Promoted" && !jobStep)
    )) {
    const pick = {
      content_type: String(f(idea, "Production_Content_Type") || "Vertical Short Video").trim() || "Vertical Short Video",
      media_asset_ids: autonomousMasterMediaIds(item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), [])),
    };
    if (!pick.media_asset_ids.length) {
      await parkAutonomousResumeDraft(env, requestRecord, "resume_missing_assets");
      last = await studioSaveAutonomousLastRun(env, {
        status: "reset",
        skip_reason: "resume_missing_assets",
        chicago_date: chicago.date,
        slot,
        idea_id: null,
        production_request_id: null,
        parked_production_request_id: requestRecord.id,
        parked_idea_id: idea?.id || last.idea_id || null,
      });
    } else {
    let finished = null;
    try {
      finished = await finishAutonomousProductionRequest(env, authorization, ctx, idea, requestRecord, pick, {
        awaitFinish: true,
        scheduled: Boolean(options.scheduled),
      });
    } catch (error) {
      if (autonomousErrorIsFactoryRevision(error)) {
        last = await releaseAutonomousRevisionLock(env, chicago, {
          productionRequestId: requestRecord?.id || last.production_request_id,
          ideaId: last.idea_id || null,
        });
      } else {
        return studioSaveAutonomousLastRun(env, {
          ...last,
          status: "skipped",
          skip_reason: String(error?.message || error).slice(0, 180),
          chicago_date: chicago.date,
        });
      }
    }
    if (finished?.waiting) {
      // Force or 30m SLA breach on the same waiting PR → park and advance FIFO.
      const slaOverdue = photoReadySlaOverdue(draftCreatedAt) || photoReadySlaOverdue(last.at);
      if ((options.force || slaOverdue) && ["waiting_variants", "awaiting_i4"].includes(String(last.status || "").trim())) {
        await parkAutonomousResumeDraft(env, requestRecord, finished.waiting_reason || "variants_still_preparing");
        last = await studioSaveAutonomousLastRun(env, {
          status: "reset",
          skip_reason: options.force ? "force_skip_stuck_waiting" : "sla_skip_stuck_waiting",
          chicago_date: chicago.date,
          idea_id: null,
          production_request_id: null,
          parked_production_request_id: requestRecord.id,
        });
      } else {
        return studioSaveAutonomousLastRun(env, {
          ...last,
          status: finished.waiting_reason === "awaiting_i4" ? "awaiting_i4" : "waiting_variants",
          skip_reason: finished.waiting_reason === "awaiting_i4" ? "awaiting_i4" : "variants_still_preparing",
          chicago_date: chicago.date,
        });
      }
    } else if (finished) {
      return studioSaveAutonomousLastRun(env, {
        ...last,
        status: "promoted",
        skip_reason: null,
        chicago_date: chicago.date,
        idea_id: finished.idea_id,
        production_request_id: finished.production_request_id,
      });
    }
    }
    }
    }
  }

  // Remotion/produce in flight must NOT block adopt + prepare of the next matched
  // draft (that was the day-long Needs eyes stall). Only defer the next enqueue.
  let priorProduceInFlight = false;
  let priorProduceRequestId = String(last.prior_produce_request_id || "").trim() || null;
  const produceProbeIds = [...new Set([
    last.production_request_id,
    priorProduceRequestId,
  ].filter(Boolean))];
  for (const probeId of produceProbeIds) {
    const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, probeId).catch(() => null);
    const requestStatus = String(f(requestRecord, "Request_Status") || "").trim();
    const job = requestRecord ? parseStudioProductionJob(requestRecord) : null;
    const step = String(job?.step || "").trim();
    if (autonomousProduceJobInFlight(requestStatus, step)) {
      priorProduceInFlight = true;
      priorProduceRequestId = probeId;
      break;
    }
    if (probeId === last.production_request_id
      && ["producing", "promoted", "resuming"].includes(String(last.status || "").trim())
      && requestStatus === "Promoted"
      && (!job || step === "done" || step === "blocked")) {
      // Promoted produce finished — free the lock so the next Draft can resume.
      last = await studioSaveAutonomousLastRun(env, {
        status: "reset",
        skip_reason: step === "done" ? "prior_job_done_advance_fifo" : "prior_promoted_advance_fifo",
        chicago_date: chicago.date,
        slot: null,
        idea_id: null,
        production_request_id: null,
        prior_produce_request_id: null,
        completed_production_request_id: last.production_request_id,
      });
      priorProduceRequestId = null;
    }
  }
  if (!priorProduceInFlight) priorProduceRequestId = null;

  if (autonomousRunIsBusy(last) && !priorProduceInFlight && !harvestThisHour) {
    return { skipped: "in_flight", chicago_date: chicago.date, slot, last };
  }

  // Light + heavy: stamp photo-ready daily ideas after 8am CT so matched drafts
  // never sit past the 30m SLA waiting for the next heavy harvest tick.
  if (dailyIdeaProduceHasStarted(chicago, { force: Boolean(options.force) })) {
    await adoptNextReadyDailyIdea(env, authorization).catch((error) => {
      console.warn("daily idea produce adopt failed", error);
    });
  }

  const pendingDrafts = await listAutonomousDraftRequests(env);
  const profiles = (await listRecords(env, STUDIO_IDEA_PROFILE_TABLE_ID, {
    limit: 50,
    filterFormula: "AND({Active}=1,{Autonomous_Produce_Enabled}=1)",
  })).map(mapOperationsProfile);
  if (!profiles.length) {
    const result = { skipped: "no_enabled_profiles", chicago_date: chicago.date, slot, status: "skipped", skip_reason: "no_enabled_profiles" };
    if (options.scheduled) await studioSaveAutonomousLastRun(env, result);
    return result;
  }

  // Top of the Chicago hour only: 10 ideas per city under 200 Scheduled+Awaiting
  // Approval, even when the subject is already in flight. When open ideas are
  // already at/over the cap (20), skip create and drain up to 20 asset-ready
  // drafts toward Ready for Review instead. :05 and :30 ticks resume one draft.
  // Combined load over 209 skips that city.
  if (harvestThisHour) {
    const openIdeasCount = await countAutonomousOpenIdeas(env);
    const skipCreate = autonomousOpenIdeasAtCap(openIdeasCount);
    let hourPass = null;
    if (!skipCreate) {
      hourPass = await fillAutonomousScheduledHour(env, authorization, {
        chicago,
        slot,
        last,
        profiles,
        preferredSubject: autonomousPreferredSubject(options.preferred_subject || last.preferred_subject),
      });
      if (hourPass?.last) last = hourPass.last;
    } else {
      last = await studioSaveAutonomousLastRun(env, {
        skipped: "open_ideas_cap",
        chicago_date: chicago.date,
        chicago_hour: chicago.hour,
        slot,
        status: "skipped",
        skip_reason: "open_ideas_cap",
        open_ideas_count: openIdeasCount,
        open_ideas_cap: AUTONOMOUS_OPEN_IDEAS_CAP,
        hour_asset_drain: AUTONOMOUS_HOUR_ASSET_DRAIN,
        scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
        ideas_per_hour: AUTONOMOUS_IDEAS_PER_HOUR,
      });
      hourPass = { terminal: true, created_count: 0, last, result: last };
    }
    const draftsNow = hourPass?.created_count
      ? await listAutonomousDraftRequests(env)
      : (skipCreate ? await listAutonomousDraftRequests(env) : pendingDrafts);
    if (draftsNow.length) {
      const resumed = await resumeAutonomousDrafts(env, authorization, ctx, draftsNow, chicago, slot, {
        scheduled: true,
        force: false,
        deferProduce: priorProduceInFlight,
        priorProduceRequestId,
        hourAssetDrain: true,
        drainLimit: AUTONOMOUS_HOUR_ASSET_DRAIN,
      });
      if (resumed?.status !== "no_enabled_profile") return resumed;
    }
    return hourPass?.result || {
      skipped: "resume_only_idle",
      chicago_date: chicago.date,
      slot,
      last,
    };
  }

  if (pendingDrafts.length) {
    const resumed = await resumeAutonomousDrafts(env, authorization, ctx, pendingDrafts, chicago, slot, {
      scheduled: Boolean(options.scheduled),
      force: Boolean(options.force),
      deferProduce: priorProduceInFlight,
      priorProduceRequestId,
    });
    if (resumed?.status !== "no_enabled_profile") return resumed;
  }

  if (options.resume_only || (options.scheduled && !options.force && !options.dry_run)) {
    return {
      skipped: options.resume_only ? "resume_only_idle" : "not_top_of_hour",
      chicago_date: chicago.date,
      slot,
      last,
    };
  }

  // Manual / dry-run: one idea. Scheduled hours already returned above.
  // Hold at 200–209 Scheduled+Awaiting Approval. Skip when that combined load is over 209.
  // Global open-ideas cap still wins over the scheduled-target refill.
  const openIdeasCount = await countAutonomousOpenIdeas(env);
  if (autonomousOpenIdeasAtCap(openIdeasCount)) {
    const result = {
      skipped: "open_ideas_cap",
      chicago_date: chicago.date,
      chicago_hour: chicago.hour,
      slot,
      status: "skipped",
      skip_reason: "open_ideas_cap",
      open_ideas_count: openIdeasCount,
      open_ideas_cap: AUTONOMOUS_OPEN_IDEAS_CAP,
      scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
    };
    if (options.scheduled || options.force) await studioSaveAutonomousLastRun(env, result);
    return result;
  }
  let refillScores = null;
  let refillMeta = null;
  if (options.scheduled && !options.force) {
    refillMeta = await studioLoadAutonomousRefillScores(env, profiles);
    const loadedScores = refillMeta?.scores || {};
    const scoreCount = Object.keys(loadedScores).length;
    if (!scoreCount || refillMeta?.source === "error" || refillMeta?.source === "empty") {
      // Fail open — do not freeze harvest when overview counts are unavailable.
      console.warn("autonomous refill scores unavailable; harvesting without target gate", refillMeta?.source || "missing");
      refillScores = null;
    } else {
      refillScores = loadedScores;
      const needing = autonomousProfilesNeedingRefill(profiles, refillScores);
      if (!needing.length) {
        const bands = Object.values(refillScores).map((row) => row?.band);
        const skipReason = bands.length && bands.every((band) => band === "skip")
          ? "scheduled_over_209"
          : "scheduled_target_met";
        const result = {
          skipped: skipReason,
          chicago_date: chicago.date,
          chicago_hour: chicago.hour,
          slot,
          status: "skipped",
          skip_reason: skipReason,
          scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
          scheduled_skip_above: AUTONOMOUS_SCHEDULED_SKIP_ABOVE,
          refill: Object.values(refillScores || {}),
          refill_source: refillMeta.source,
        };
        await studioSaveAutonomousLastRun(env, result);
        return result;
      }
    }
  } else if (options.scheduled || options.force) {
    refillMeta = await studioLoadAutonomousRefillScores(env, profiles).catch(() => null);
    refillScores = Object.keys(refillMeta?.scores || {}).length ? refillMeta.scores : null;
  }

  if (autonomousSlotAlreadyClaimed(last, slot)) {
    return { skipped: "already_ran_slot", chicago_date: chicago.date, slot, last };
  }

  const preferredSubject = autonomousPreferredSubject(options.preferred_subject || last.preferred_subject);
  const refillPick = pickAutonomousRefillProfile(profiles, refillScores);
  const selected = pickAutonomousEnabledProfile(
    profiles,
    options.content_profile_id || refillPick?.id,
  );
  if (!selected) {
    const result = { skipped: "no_enabled_profiles", chicago_date: chicago.date, slot, status: "skipped", skip_reason: "no_enabled_profiles" };
    if (options.scheduled) await studioSaveAutonomousLastRun(env, result);
    return result;
  }

  const harvestProfiles = options.scheduled && !options.force && refillScores
    ? autonomousProfilesNeedingRefill(profiles, refillScores)
    : profiles;
  if (options.scheduled && !options.force && refillScores && !harvestProfiles.length) {
    const result = {
      skipped: "scheduled_target_met",
      chicago_date: chicago.date,
      slot,
      status: "skipped",
      skip_reason: "scheduled_target_met",
      scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
    };
    await studioSaveAutonomousLastRun(env, result);
    return result;
  }

  if (!options.dry_run) {
    await studioSaveAutonomousLastRun(env, {
      status: "picking",
      skip_reason: null,
      chicago_date: chicago.date,
      slot,
      preferred_subject: preferredSubject || null,
      scheduled_target: AUTONOMOUS_SCHEDULED_TARGET,
      refill_profile_id: selected.id,
      refill: refillScores ? Object.values(refillScores) : null,
    });
  }

  const profileTheme = studioThemeForProfile(await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, selected.id).catch(() => selected));
  const observations = await studioInsightsLoadObservations(env, { profile: profileTheme, limit: 80 }).catch(() => []);
  const similar = summarizeObservations(observations);
  const [news, youtube, occupiedIdeas] = await Promise.all([
    profileTheme === "chicago" ? harvestAutonomousNewsHeadlines() : Promise.resolve([]),
    harvestAutonomousYoutube(env, { theme: profileTheme }),
    harvestAutonomousOccupiedTopics(env, selected.id),
  ]);
  const recentTitles = occupiedIdeas.map((row) => row.title);
  let profile = null;
  let catalog = [];
  let unusedAssets = [];
  let overview = { unused_count: 0, cluster_count: 0, clusters: [] };
  let cluster = null;
  for (const candidate of autonomousProfileHarvestOrder(harvestProfiles, selected.id, refillScores)) {
    const nextCatalog = await harvestAutonomousLibraryCatalog(env, preferredSubject, candidate.id);
    const nextUnused = nextCatalog;
    const nextOverview = summarizeUnusedLibraryOverview(nextCatalog);
    const nextCluster = pickRelatedUnusedStillCluster(nextCatalog, { occupied: occupiedIdeas });
    if (!catalog.length || nextUnused.length > unusedAssets.length) {
      catalog = nextCatalog;
      unusedAssets = nextUnused;
      overview = nextOverview;
    }
    if (!nextCluster) continue;
    profile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, candidate.id);
    catalog = nextCatalog;
    unusedAssets = nextUnused;
    overview = nextOverview;
    cluster = nextCluster;
    break;
  }
  if (!profile) {
    profile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, selected.id);
  }
  const trends = { similar, news, youtube };
  if (!unusedAssets.length) {
    const result = {
      skipped: preferredSubject ? "no_matching_subject_stills" : "no_library_stills",
      chicago_date: chicago.date,
      slot,
      status: "skipped",
      skip_reason: preferredSubject ? "no_matching_subject_stills" : "no_library_stills",
      harvest: {
        similar: similar.length,
        news: news.length,
        youtube: youtube.length,
        assets: catalog.length,
        unused: unusedAssets.length,
        profile_id: profile?.id || selected.id,
      },
    };
    await studioSaveAutonomousLastRun(env, result);
    return result;
  }
  if (!cluster) {
    const result = {
      skipped: "no_distinct_subject",
      chicago_date: chicago.date,
      slot,
      status: "skipped",
      skip_reason: "no_distinct_subject",
      harvest: {
        similar: similar.length,
        news: news.length,
        youtube: youtube.length,
        assets: unusedAssets.length,
        unused_clusters: overview.cluster_count,
      },
    };
    await studioSaveAutonomousLastRun(env, result);
    return result;
  }

  const prompt = buildAutonomousPickerPrompt({
    profile: {
      name: f(profile, "Profile_Name"),
      brand_voice: f(profile, "Brand_Voice"),
      avoid_topics: f(profile, "Avoid_Topics"),
    },
    trends,
    assets: cluster.assets.map((row) => ({
      media_asset_id: row.id,
      name: row.name,
      location: row.location,
      topic: row.topic,
      subtopic: row.subtopic,
    })),
    recentTitles,
    occupiedIdeas,
    preferredSubject,
    overview,
    clusterLabel: cluster.label,
  });

  if (options.dry_run) {
    return {
      dry_run: true,
      chicago_date: chicago.date,
      slot,
      harvest: {
        similar: similar.length,
        news: news.length,
        youtube: youtube.length,
        assets: unusedAssets.length,
        unused_clusters: overview.cluster_count,
        cluster: cluster.label,
        cluster_count: cluster.assets.length,
      },
      overview,
      prompt,
    };
  }

  const pick = await studioAutonomousOpenAiPick(env, prompt);
  if (pick.skip) {
    const result = {
      skipped: pick.reason,
      chicago_date: chicago.date,
      slot,
      status: "skipped",
      skip_reason: pick.reason,
    };
    await studioSaveAutonomousLastRun(env, result);
    return result;
  }

  pick.media_asset_ids = completeRelatedStillPick(pick.media_asset_ids, cluster.assets);
  pick.cluster_label = cluster.label;
  pick.content_type = autonomousCanonicalContentType(pick.content_type);
  if (pick.media_asset_ids.length < AUTONOMOUS_RELATED_STILL_MIN) {
    const result = {
      skipped: "picker_assets_not_in_harvest",
      chicago_date: chicago.date,
      slot,
      status: "skipped",
      skip_reason: "picker_assets_not_in_harvest",
    };
    await studioSaveAutonomousLastRun(env, result);
    return result;
  }

  const conflict = autonomousIdeaConflictsOccupied(pick, occupiedIdeas);
  if (conflict.conflict) {
    const result = {
      skipped: conflict.reason,
      chicago_date: chicago.date,
      slot,
      status: "skipped",
      skip_reason: `${conflict.reason}:${conflict.match}`.slice(0, 180),
    };
    await studioSaveAutonomousLastRun(env, result);
    return result;
  }

  const idea = await createAutonomousIdea(env, profile, pick);
  const defaults = productionRequestDefaultsFromIdea(idea);
  const profileSettings = mapOperationsProfile(profile);
  const narration = resolveAutonomousNarrationVoice(profileSettings, {
    voice_id: PHASE6_DEFAULT_VOICE_ID,
    voice_name: "Kate",
  });
  const musicAssetId = pickAutonomousMusicAssetId(
    profileSettings.autonomous_music_asset_ids,
    AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID,
  );
  const input = await cleanProductionRequestPayload({
    ...defaults,
    content_type: pick.content_type,
    platforms: [...AUTONOMOUS_STANDARD_PLATFORMS],
    voiceover_mode: "Yes",
    background_music_mode: "Yes",
    thumbnail_mode: "Yes",
    video_duration_seconds: null,
    voiceover_duration_seconds: null,
    voiceover_tail_seconds: 0,
    music_start_seconds: 0,
    selected_music_asset_id: musicAssetId,
    voice_id: narration.voice_id || PHASE6_DEFAULT_VOICE_ID,
    voice_name: narration.voice_name || "Kate",
    carousel_image_mode: "Manual Upload",
    caption_mode: pick.post_caption ? "AI improve" : "AI decides",
    requested_caption: pick.post_caption || "",
    production_notes: `origin=autonomous cited_trend=${pick.cited_trend || ""}`.slice(0, 3000),
    primary_location: pick.primary_location || defaults.primary_location,
  }, env);
  const requestRecord = await createDraftForIdea(env, idea, authorization, input);
  const finished = await finishAutonomousProductionRequest(env, authorization, ctx, idea, requestRecord, pick);
  if (finished.waiting) {
    return studioSaveAutonomousLastRun(env, {
      status: "waiting_variants",
      skip_reason: "variants_still_preparing",
      chicago_date: chicago.date,
      slot,
      idea_id: idea.id,
      production_request_id: finished.production_request_id,
    });
  }
  return studioSaveAutonomousLastRun(env, {
    status: "producing",
    skip_reason: null,
    chicago_date: chicago.date,
    slot,
    idea_id: idea.id,
    production_request_id: finished.production_request_id,
  });
}
/*__STUDIO_WORKER_END:executeStudioAutonomousProduce__*/

export async function runStudioAutonomousProduce(request, env, authorization, ctx, options = {}) {
  let dryRun = Boolean(options.dry_run);
  let preferredSubject = options.preferred_subject;
  let contentProfileId = options.content_profile_id;
  if (request) {
    let payload = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }
    dryRun = Boolean(payload?.dry_run);
    if (payload?.preferred_subject) preferredSubject = payload.preferred_subject;
    try {
      contentProfileId = requestedProfileId(new URL(request.url), payload) || contentProfileId;
    } catch {
      if (payload?.content_profile_id) contentProfileId = payload.content_profile_id;
    }
  }
  const result = await executeStudioAutonomousProduce(env, ctx, {
    ...options,
    dry_run: dryRun,
    preferred_subject: preferredSubject,
    content_profile_id: contentProfileId,
    authorization: authorization?.user?.record_id ? authorization : null,
  });
  if (!request) return result;
  return respond(request, env, { ok: true, ...result }, result.skipped || result.dry_run ? 200 : 202);
}
/*__STUDIO_WORKER_END:runStudioAutonomousProduce__*/

export async function studioDailyCadenceRecentBatchForProfile(env, profileId) {
  const sinceMs = Date.now() - 3 * 60 * 60 * 1000;
  const rows = await listRecords(env, STUDIO_IDEA_BATCH_TABLE_ID, {
    limit: 25,
    sortField: "Requested_At",
    sortDirection: "desc",
    filterFormula: "AND({Requested_By}='studio-daily-cadence',OR({Status}='Complete',{Status}='Running',{Status}='Pending'))",
  });
  for (const row of rows) {
    if (!linkedRecordIds(f(row, "Content_Profile")).includes(profileId)) continue;
    const stamp = Date.parse(String(f(row, "Requested_At") || row.createdTime || ""));
    if (Number.isFinite(stamp) && stamp >= sinceMs) return row;
  }
  return null;
}
/*__STUDIO_WORKER_END:studioDailyCadenceRecentBatchForProfile__*/

export async function executeStudioDailyIdeas(env, ctx, options = {}) {
  const chicago = chicagoNowParts();
  const lastDaily = await studioSettingsByName(env, STUDIO_I1_LAST_DAILY_SETTING);
  const lastDate = String(f(lastDaily, "Setting_Value") || "").trim();
  if (!options.force && options.scheduled) {
    const cron = String(options.cron || "");
    const inWindow = chicago.hour === 1 || cron === "0 6 * * *";
    if (!inWindow) return { skipped: "outside_chicago_1am_window", chicago_date: chicago.date, chicago_hour: chicago.hour };
    if (lastDate === chicago.date) return { skipped: "already_ran_today", chicago_date: chicago.date };
  }
  const profiles = (await listRecords(env, STUDIO_IDEA_PROFILE_TABLE_ID, {
    limit: 50,
    filterFormula: "AND({Active}=1,{Idea_Generation_Enabled}=1)",
  })).map(mapOperationsProfile);
  if (!profiles.length) {
    if (options.scheduled) await studioUpsertSetting(env, STUDIO_I1_LAST_DAILY_SETTING, chicago.date, "No enabled idea-generation profiles");
    return { skipped: "no_enabled_profiles", chicago_date: chicago.date, profiles: [] };
  }

  let authorization = options.authorization;
  if (!authorization?.user?.record_id) {
    authorization = await resolveStudioCronAuthorization(env).catch(() => authorization || null);
  }

  const started = [];
  const skipped = [];
  const errors = [];
  for (const profile of profiles) {
    const count = Math.max(1, Math.min(10, Number(profile.daily_idea_limit) || 5));
    let batch = null;
    try {
      if (!options.force) {
        const recent = await studioDailyCadenceRecentBatchForProfile(env, profile.id);
        if (recent) {
          skipped.push({
            profile_id: profile.id,
            name: profile.name,
            batch_record_id: recent.id,
            reason: "recent_daily_batch",
          });
          continue;
        }
      }
      const full = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profile.id);
      batch = await studioIdeaCreateBatch(env, full, count, "Balanced", { email: "studio-daily-cadence" });
      await studioIdeaSetProfileOverrides(env, profile.id, batch.id, count, "Balanced");
      // Use the same Python completion path as Studio Generate Ideas (marks
      // Complete, stamps Generated_Count, starts photo listening). The older
      // studioIdeaExecuteBatch Python branch returned without finishing the batch.
      await studioIdeaRunPythonBatch(env, authorization, full, batch, count, "Balanced");
      started.push({ profile_id: profile.id, name: profile.name, batch_record_id: batch.id, requested_count: count });
    } catch (error) {
      const message = String(error?.message || error || "Daily I1 failed").slice(0, 500);
      errors.push({ profile_id: profile.id, name: profile.name, batch_record_id: batch?.id || null, error: message });
      console.warn("daily idea cadence profile failed", profile.id, message);
      if (batch?.id) {
        try {
          await studioIdeaUpdateBatch(env, batch.id, {
            Status: "Failed",
            Completed_At: new Date().toISOString(),
            Error: message.slice(0, 10000),
          });
        } catch {}
      }
    } finally {
      try { await studioIdeaClearProfileOverrides(env, profile.id); } catch {}
    }
  }

  const pending = profiles.length - started.length - skipped.length;
  // Stamp the day only when every enabled profile either finished or already
  // had a recent daily batch. Partial failure leaves the stamp unset so later
  // hour-1 ticks can retry the remaining profiles without re-running successes.
  if (options.scheduled && pending <= 0 && errors.length === 0) {
    await studioUpsertSetting(
      env,
      STUDIO_I1_LAST_DAILY_SETTING,
      chicago.date,
      `Daily I1 started for ${started.length} profile(s); skipped ${skipped.length}`
    );
  } else if (!options.scheduled && started.length) {
    await studioUpsertSetting(env, STUDIO_I1_LAST_DAILY_SETTING, chicago.date, `Daily I1 started for ${started.length} profile(s)`);
  }

  if (!started.length && !skipped.length && errors.length) {
    return { started: false, chicago_date: chicago.date, runs: [], skipped, errors };
  }
  return {
    started: started.length > 0,
    chicago_date: chicago.date,
    runs: started,
    skipped,
    errors,
  };
}
/*__STUDIO_WORKER_END:executeStudioDailyIdeas__*/

export async function runStudioDailyIdeas(request, env, authorization, ctx, options = {}) {
  const result = await executeStudioDailyIdeas(env, ctx, options);
  if (!request) return result;
  return respond(request, env, { ok: true, ...result }, result.started ? 202 : 200);
}
/*__STUDIO_WORKER_END:runStudioDailyIdeas__*/

export async function kickStudioOutputPublish(request, env, url, authorization, ctx = null) {
  const match = /^\/api\/operations\/outputs\/(rec[A-Za-z0-9]+)\/publish-kick$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid output path");
  const existing = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1]);
  if (Boolean(f(existing, "Do_Not_Publish"))) {
    throw new HttpError(409, "Do_Not_Publish outputs cannot be publish-kicked");
  }
  if (String(f(existing, "Output_Status") || "").trim() !== "Approved for Publishing") {
    throw new HttpError(409, "Only Approved for Publishing outputs can be publish-kicked");
  }
  const dispatch = await studioDispatchApprovedPublishNow(env, existing);
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(studioDispatchApprovedPublishTail(env, existing, dispatch).catch((error) => {
      console.warn("publish-kick tail failed", match[1], error);
    }));
  }
  return respond(request, env, {
    ok: true,
    output_id: match[1],
    dispatch: {
      ok: dispatch?.ok !== false,
      skipped: dispatch?.skipped || null,
      target: dispatch?.target || dispatch?.plan?.target || null,
      held_until: dispatch?.held_until || null,
      message: dispatch?.message || null,
    },
    record: mapOperationsOutput(
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1]).catch(() => existing)
    ),
  });
}
/*__STUDIO_WORKER_END:kickStudioOutputPublish__*/

export async function scheduleStudioPublishOutput(request, env, url, authorization, ctx = null) {
  const match = /^\/api\/operations\/outputs\/(rec[A-Za-z0-9]+)\/schedule$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid output path");
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const value = String(payload?.scheduled_post_date || "").trim();
  const existing = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1]);
  if (Boolean(f(existing, "Do_Not_Publish"))) {
    throw new HttpError(409, "Do_Not_Publish outputs cannot be rescheduled");
  }
  const published = /published/i.test(String(f(existing, "Publish_Status") || ""))
    || String(f(existing, "Output_Status") || "").trim() === "Published"
    || Boolean(f(existing, "Published_At"));
  if (published) throw new HttpError(409, "Published outputs cannot be rescheduled");
  const platform = String(f(existing, "Platform") || "").trim();
  const manualScheduleOverride = Boolean(
    payload?.manual_schedule_override === true
    && value
    && value.toLowerCase() !== "immediate"
  );
  const publishNowImmediate = Boolean(
    payload?.publish_now === true
    && (!value || value.toLowerCase() === "immediate")
  );
  // Calendar Save sends manual_schedule_override and keeps the exact slot.
  // Occupancy is only for MAE auto-stamp; do not let a list 422/500 block Save.
  const occupied = (manualScheduleOverride || publishNowImmediate)
    ? {}
    : await studioOccupiedSchedulesOrEmpty(env, {
      excludeIds: [match[1]],
      profile: await item4ProductionProfileRecord(env, existing).catch(() => null),
    });
  const timeZone = await studioScheduleTimeZoneForRecord(env, existing, payload);
  const fields = studioPublishScheduleFields(
    { scheduled_post_date: value || "immediate", timezone: timeZone },
    existing,
    {
      occupiedMs: publishNowImmediate ? null : studioOccupiedForPlatform(occupied, platform),
      forceWrite: true,
      exactOverride: manualScheduleOverride,
      timeZone,
    },
  );
  if (!manualScheduleOverride) fields.Studio_Scheduled_At = null;
  if (String(f(existing, "Review_Status") || "").trim() === "Approved") {
    fields.Output_Status = "Approved for Publishing";
  }
  fields.Publish_Error_Message = "";
  const updated = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1], {
    method: "PATCH",
    body: JSON.stringify({
      fields,
      typecast: true,
    }),
  });
  studioInvalidateOccupiedScheduleCache();
  // Phase 3: keep Supabase schedule-grid in lockstep so the calendar does not
  // snap the bubble back after refreshPipelineOutputs reloads from Supabase.
  await studioSupabaseWriteThroughOutput(env, updated, "schedule");
  const due = studioPublishIsDue(updated);
  const approved = String(f(updated, "Output_Status") || "").trim() === "Approved for Publishing"
    || String(f(updated, "Review_Status") || "").trim() === "Approved";
  let dispatch = null;
  if (due && approved && (payload?.publish_now === true || !value || value.toLowerCase() === "immediate")) {
    dispatch = await studioDispatchApprovedPublishNow(env, updated);
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(studioDispatchApprovedPublishTail(env, updated, dispatch).catch((error) => {
        console.warn("schedule publish-now tail failed", match[1], error);
      }));
    }
  } else if (due) {
    cadenceScheduleSync(ctx, env, { startPublish: true });
  }
  return respond(request, env, {
    ok: true,
    record: mapOperationsOutput(
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1]).catch(() => updated)
    ),
    dispatch: dispatch
      ? {
          ok: dispatch?.ok !== false,
          skipped: dispatch?.skipped || null,
          target: dispatch?.target || dispatch?.plan?.target || null,
          message: dispatch?.message || null,
        }
      : null,
  });
}
/*__STUDIO_WORKER_END:scheduleStudioPublishOutput__*/

export function isTikTokPostUrl(url) {
  // Keep aligned with apps/studio-api/tiktok-complete.mjs (Worker deploy is this file only).
  const value = String(url || "").trim();
  if (!value) return false;
  return value.toLowerCase().includes("tiktok.com");
}
/*__STUDIO_WORKER_END:isTikTokPostUrl__*/

export function tiktokCompleteEligibility(record = {}) {
  const platform = String(record.platform || "").trim().toLowerCase();
  if (platform !== "tiktok") return "not_tiktok";
  if (record.do_not_publish) return "do_not_publish";
  const publish = String(record.publish_status || "").trim().toLowerCase();
  const output = String(record.output_status || "").trim().toLowerCase();
  const draft = String(record.tiktok_draft_status || "").trim().toLowerCase();
  if (publish === "published" || output === "published" || draft === "published") return "already_published";
  const manual = String(record.manual_completion_status || "").trim().toLowerCase();
  const studio = String(record.studio_state || "").trim().toLowerCase();
  const awaiting = manual === "required"
    || studio.includes("manual action")
    || studio === "draft delivered"
    || draft.includes("manual action")
    || draft.includes("draft delivered")
    || draft.includes("manual completion received");
  if (!awaiting) return "manual_completion_not_required";
  return null;
}
/*__STUDIO_WORKER_END:tiktokCompleteEligibility__*/

export function tiktokMusicStatusFromChoice(choice, currentMusicStatus) {
  const music = String(choice || "").trim().toLowerCase();
  if (music === "yes") return { status: "Completed Manually", completedAt: true };
  if (music === "no") return { status: "Manual Action Required", completedAt: false };
  if (music === "not_requested") return { status: "Not Required", completedAt: false };
  const current = String(currentMusicStatus || "").trim().toLowerCase();
  if (current.includes("manual action")) return { status: "Manual Action Required", completedAt: false };
  return { status: "Not Required", completedAt: false };
}
/*__STUDIO_WORKER_END:tiktokMusicStatusFromChoice__*/

export function tiktokManualPublishFields({
  url,
  now,
  existingNotes = "",
  musicStatus = "Not Required",
  musicCompletedAt = null,
} = {}) {
  const stamp = String(now || "").trim() || new Date().toISOString();
  const liveUrl = String(url || "").trim();
  const note = `Studio TikTok publication confirmed at ${stamp}. URL: ${liveUrl}`;
  const notes = String(existingNotes || "").trim() ? `${String(existingNotes).trim()}\n\n${note}` : note;
  return {
    Publish_Locked_At: null,
    Publish_Locked_By: "",
    Publish_Started_At: null,
    Music_Status: musicStatus,
    Music_Completion_At: musicCompletedAt ? stamp : null,
    Output_Notes: notes.slice(0, 10000),
    Published_At: stamp,
    Output_Status: "Published",
    Publish_Status: "Published",
    Platform_Post_URL: liveUrl,
    Publish_Error_Stage: "",
    TikTok_Draft_Status: "Published",
    Manual_Completion_At: stamp,
    Manual_Published_URL: liveUrl,
    Publish_Error_Message: "",
    Publish_Next_Retry_At: null,
    Publish_Retry_Eligible: false,
    TikTok_Manual_Posted_At: stamp,
    Manual_Completion_Status: "Completed",
    Manual_Fallback_Required: false,
    TikTok_Public_Confirmation_At: stamp,
  };
}
/*__STUDIO_WORKER_END:tiktokManualPublishFields__*/

export function tiktokCompleteViewFromRecord(record) {
  return {
    platform: f(record, "Platform"),
    do_not_publish: Boolean(f(record, "Do_Not_Publish")),
    publish_status: f(record, "Publish_Status"),
    output_status: f(record, "Output_Status"),
    tiktok_draft_status: f(record, "TikTok_Draft_Status"),
    manual_completion_status: f(record, "Manual_Completion_Status"),
    studio_state: normalizedOutputState(record),
    music_status: f(record, "Music_Status"),
  };
}
/*__STUDIO_WORKER_END:tiktokCompleteViewFromRecord__*/

export async function patchTiktokManualPublish(env, record, { url, musicCompleted } = {}) {
  const music = tiktokMusicStatusFromChoice(musicCompleted, f(record, "Music_Status"));
  const fields = tiktokManualPublishFields({
    url,
    now: new Date().toISOString(),
    existingNotes: f(record, "Output_Notes"),
    musicStatus: music.status,
    musicCompletedAt: music.completedAt,
  });
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:patchTiktokManualPublish__*/

export function youtubeCompleteViewFromRecord(record) {
  return {
    platform: f(record, "Platform"),
    do_not_publish: Boolean(f(record, "Do_Not_Publish")),
    publish_status: f(record, "Publish_Status"),
    output_status: f(record, "Output_Status"),
    youtube_stage: f(record, "YouTube_Stage"),
    youtube_video_id: f(record, "YouTube_Video_ID"),
    youtube_privacy_status: f(record, "YouTube_Privacy_Status"),
    youtube_error_message: f(record, "YouTube_Error_Message"),
    publish_error_stage: f(record, "Publish_Error_Stage"),
    publish_error_message: f(record, "Publish_Error_Message"),
    manual_completion_status: f(record, "Manual_Completion_Status"),
    manual_fallback_required: Boolean(f(record, "Manual_Fallback_Required")),
    studio_state: normalizedOutputState(record),
  };
}
/*__STUDIO_WORKER_END:youtubeCompleteViewFromRecord__*/

export async function patchYoutubeManualClose(env, record, { url, autoHealed = false } = {}) {
  const fields = youtubeManualCloseFields({
    url,
    videoId: f(record, "YouTube_Video_ID"),
    now: new Date().toISOString(),
    existingNotes: f(record, "Output_Notes"),
    privacy: f(record, "YouTube_Privacy_Status"),
    autoHealed,
  });
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:patchYoutubeManualClose__*/

export async function markStudioYoutubeComplete(request, env, url) {
  const match = /^\/api\/outputs\/(rec[A-Za-z0-9]+)\/youtube-complete$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid output path");
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const postUrl = String(payload?.platform_post_url || payload?.youtube_url || "").trim();
  if (!isYouTubePostUrl(postUrl)) throw new HttpError(400, "Paste a YouTube watch, Shorts, or youtu.be URL.");
  const current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1]);
  if (!current?.id) throw new HttpError(404, "Platform Output was not found");
  const reason = youtubeCompleteEligibility(youtubeCompleteViewFromRecord(current));
  if (reason === "already_published") {
    return respond(request, env, { ok: true, already_published: true, record: mapOutput(current) });
  }
  if (reason) throw new HttpError(reason === "do_not_publish" ? 409 : 400, YOUTUBE_COMPLETE_ERRORS[reason] || reason);
  const updated = await patchYoutubeManualClose(env, current, { url: postUrl });
  return respond(request, env, { ok: true, published: true, record: mapOutput(updated) });
}
/*__STUDIO_WORKER_END:markStudioYoutubeComplete__*/

export async function markStudioTiktokComplete(request, env, url) {
  const match = /^\/api\/outputs\/(rec[A-Za-z0-9]+)\/tiktok-complete$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid output path");
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const postUrl = String(payload?.platform_post_url || payload?.tiktok_url || "").trim();
  if (!isTikTokPostUrl(postUrl)) throw new HttpError(400, "Paste a live TikTok URL containing tiktok.com.");
  const current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1]);
  if (!current?.id) throw new HttpError(404, "Platform Output was not found");
  const reason = tiktokCompleteEligibility(tiktokCompleteViewFromRecord(current));
  if (reason === "already_published") {
    return respond(request, env, { ok: true, already_published: true, record: mapOutput(current) });
  }
  if (reason) throw new HttpError(reason === "do_not_publish" ? 409 : 400, TIKTOK_COMPLETE_ERRORS[reason] || reason);
  const updated = await patchTiktokManualPublish(env, current, {
    url: postUrl,
    musicCompleted: payload?.music_completed,
  });
  return respond(request, env, { ok: true, published: true, record: mapOutput(updated) });
}
/*__STUDIO_WORKER_END:markStudioTiktokComplete__*/

export async function resendStudioTiktokDraft(request, env, url, authorization, ctx = null) {
  const match = /^\/api\/outputs\/(rec[A-Za-z0-9]+)\/tiktok-resend$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid output path");
  const existing = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1]);
  if (!existing?.id) throw new HttpError(404, "Platform Output was not found");
  const reason = tiktokResendEligibility(tiktokCompleteViewFromRecord(existing));
  if (reason) {
    throw new HttpError(
      reason === "do_not_publish" || reason === "already_published" || reason === "not_approved" ? 409 : 400,
      TIKTOK_RESEND_ERRORS[reason] || reason,
    );
  }
  const fields = tiktokResendRearmFields({
    now: new Date().toISOString(),
    existingNotes: f(existing, "Output_Notes"),
  });
  const rearmed = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1], {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
  const dispatch = await studioDispatchApprovedPublishNow(env, rearmed);
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(studioDispatchApprovedPublishTail(env, rearmed, dispatch).catch((error) => {
      console.warn("tiktok-resend tail failed", match[1], error);
    }));
  }
  const refreshed = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1]).catch(() => rearmed);
  return respond(request, env, {
    ok: true,
    resent: true,
    output_id: match[1],
    dispatch: {
      ok: dispatch?.ok !== false,
      skipped: dispatch?.skipped || null,
      target: dispatch?.target || dispatch?.plan?.target || null,
      held_until: dispatch?.held_until || null,
      message: dispatch?.message || null,
    },
    record: mapOutput(refreshed),
  });
}
/*__STUDIO_WORKER_END:resendStudioTiktokDraft__*/

export async function markStudioOutputPublished(request, env, url, authorization) {
  const match = /^\/api\/operations\/outputs\/(rec[A-Za-z0-9]+)\/published$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid output path");
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const postUrl = String(payload?.platform_post_url || "").trim();
  if (!postUrl) throw new HttpError(400, "Platform post URL is required");
  const notes = String(payload?.notes || "").trim();
  const current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1]);
  if (String(f(current, "Platform") || "").trim().toLowerCase() === "tiktok") {
    if (!isTikTokPostUrl(postUrl)) throw new HttpError(400, "Paste a live TikTok URL containing tiktok.com.");
    const updatedTikTok = await patchTiktokManualPublish(env, current, {
      url: postUrl,
      musicCompleted: payload?.music_completed,
    });
    return respond(request, env, { ok: true, record: mapOperationsOutput(updatedTikTok) });
  }
  if (String(f(current, "Platform") || "").trim().toLowerCase() === "youtube") {
    if (!isYouTubePostUrl(postUrl)) throw new HttpError(400, "Paste a YouTube watch, Shorts, or youtu.be URL.");
    const reason = youtubeCompleteEligibility(youtubeCompleteViewFromRecord(current));
    if (reason === "already_published") {
      return respond(request, env, { ok: true, already_published: true, record: mapOperationsOutput(current) });
    }
    if (reason) throw new HttpError(reason === "do_not_publish" ? 409 : 400, YOUTUBE_COMPLETE_ERRORS[reason] || reason);
    const updatedYouTube = await patchYoutubeManualClose(env, current, { url: postUrl });
    return respond(request, env, { ok: true, record: mapOperationsOutput(updatedYouTube) });
  }
  const existingNotes = String(f(current, "Output_Notes") || "").trim();
  const stamp = new Date().toISOString();
  const appended = [existingNotes, `Studio Operations publish confirmation at ${stamp}.\nPlatform post URL: ${postUrl}${notes ? `\nNotes: ${notes}` : ""}`].filter(Boolean).join("\n\n");
  const updated = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, match[1], {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Platform_Post_URL: postUrl,
        Publish_Status: "Published",
        Output_Status: "Published",
        Published_At: stamp,
        Output_Notes: appended.slice(0, 10000),
      },
      typecast: true,
    }),
  });
  return respond(request, env, { ok: true, record: mapOperationsOutput(updated) });
}
/*__STUDIO_WORKER_END:markStudioOutputPublished__*/

export async function pulseA1SCompression(env, { driveFileId = null, ctx } = {}) {
  const normalizedId = String(driveFileId || "").trim();
  const data = normalizedId ? { drive_file_id: normalizedId } : {};
  const python = pipelineStageBackend(env, "A1S");
  const task = (async () => {
    if (python.mode === "python") {
      try {
        await item4PulsePipelineStage(env, "a1s", { extra: data }, "A1S");
      } catch (error) {
        console.error("A1S python pulse failed", error);
      }
      if (normalizedId) {
        try {
          await item4PulsePipelineStage(env, "a1m", { extra: data }, "A1S");
        } catch (error) {
          console.error("A1M python pulse failed", error);
        }
      }
      return;
    }
    try {
      await phase6PulseOnDemandScenario(env, STUDIO_A1S_SCENARIO_ID, { waitMs: 20000, data });
    } catch (error) {
      console.error("A1S on-demand pulse failed", error);
    }
    if (normalizedId) {
      try {
        await phase6PulseOnDemandScenario(env, STUDIO_A1M_SCENARIO_ID, { waitMs: 20000, data });
      } catch (error) {
        console.error("A1M on-demand pulse failed", error);
      }
    }
  })();
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else await task;
  return { driveFileId: normalizedId || null, backend: python.mode };
}
/*__STUDIO_WORKER_END:pulseA1SCompression__*/

export async function pulseA1SForDriveFile(request, env, authorization, ctx) {
  void authorization;
  let payload;
  try { payload = await request.json(); } catch { payload = {}; }
  const driveFileId = String(payload?.drive_file_id || "").trim();
  const compressAll = Boolean(payload?.compress_all);
  if (!driveFileId && !compressAll) {
    throw new HttpError(400, "drive_file_id is required unless compress_all is true");
  }
  const pulse = await pulseA1SCompression(env, { driveFileId: driveFileId || null, ctx });
  if (compressAll && !pulse.driveFileId) {
    const intakeSmallFiles = (async () => {
      try {
        await item4PulsePipelineStage(env, "a2", {
          extra: { drain: true, trigger_a2b: true, wait_for_next: false },
        }, "A2");
      } catch (error) {
        console.error("A2 drain after compress-all failed", error);
      }
    })();
    if (ctx?.waitUntil) ctx.waitUntil(intakeSmallFiles);
    else await intakeSmallFiles;
  }
  return respond(request, env, {
    ok: true,
    triggered: pulse.backend === "python" ? "a1s-python" : "on-demand-run",
    backend: pulse.backend,
    drive_file_id: pulse.driveFileId,
    compress_all: compressAll && !pulse.driveFileId,
    scenarios: pulse.driveFileId ? ["A1S", "A1M"] : ["A1S"],
    message: pulse.driveFileId
      ? "A1S compress and A1M duration probe were pulsed because this file is over 100 MB."
      : "A1S scanned the ingestion folder and started compression for eligible oversized videos.",
  }, 202);
}
/*__STUDIO_WORKER_END:pulseA1SForDriveFile__*/

export async function pulseM1ResetRenderUrls(request, env, ctx) {
  const result = await pulseOnDemandM1(env, { force: true });
  return respond(request, env, {
    ok: true,
    triggered: result.some((row) => row.backend === "python") ? "m1-python" : "m1-on-demand",
    pulses: result,
    message: "M1 will reset Rendering jobs that still point at an old Remotion URL, then those jobs can rerun R4.",
  }, 202);
}
/*__STUDIO_WORKER_END:pulseM1ResetRenderUrls__*/

export async function pulseR2BRetryAssetSelection(request, env, ctx) {
  const result = await pulseOnDemandR2B(env);
  const skipped = result.some((row) => row.skipped);
  return respond(request, env, {
    ok: true,
    triggered: skipped ? "r2b-skipped" : "r2b-on-demand",
    pulses: result,
    message: skipped
      ? "No failed asset-selection rows are waiting, so R2B did not run."
      : "R2B is retrying asset selection for the waiting output.",
  }, skipped ? 200 : 202);
}
/*__STUDIO_WORKER_END:pulseR2BRetryAssetSelection__*/

export async function pulseMakeAdminBridgeQueue(request, env, ctx) {
  const result = await pulseOnDemandMakeAdminBridge(env);
  const skipped = result.some((row) => row.skipped);
  return respond(request, env, {
    ok: true,
    triggered: skipped ? "make-admin-skipped" : "make-admin-on-demand",
    pulses: result,
    message: skipped
      ? "Make admin is retired. Pipeline stages run on the local Python runner."
      : "Make admin is retired. Pipeline stages run on the local Python runner.",
  }, skipped ? 200 : 202);
}
/*__STUDIO_WORKER_END:pulseMakeAdminBridgeQueue__*/

export async function pulseAudioLeadingSilence(request, env) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) throw new HttpError(503, "Pipeline runner is required to trim catalog audio");
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const response = await fetch(`${runnerUrl}/jobs/studio-audio-leading-silence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify({
      dry_run: Boolean(body?.dry_run),
      force: Boolean(body?.force),
      record_ids: Array.isArray(body?.record_ids) ? body.record_ids : [],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(
      response.status >= 400 ? response.status : 502,
      payload?.error || payload?.message || "Leading-silence backfill failed"
    );
  }
  const capped = Number(payload?.capped || 0);
  const notNeeded = Number(payload?.not_needed || 0);
  const failed = Number(payload?.failed || 0);
  const matched = Number(payload?.matched || 0);
  return respond(request, env, {
    ok: true,
    ...payload,
    message: payload?.dry_run
      ? `Checked ${matched} catalog audio file${matched === 1 ? "" : "s"} without changing Drive.`
      : `Capped ${capped}, already short enough ${notNeeded}, failed ${failed}.`,
  });
}
/*__STUDIO_WORKER_END:pulseAudioLeadingSilence__*/

export async function pulseStudioLibraryIntake(request, env, authorization, ctx) {
  void authorization;
  const startedAt = new Date().toISOString();
  const { response, payload } = await item4PulsePipelineStage(env, "a2", {
    extra: { trigger_a2b: true, wait_for_next: false, drain: true },
  }, "A2");
  if (!response.ok || payload?.status === "error") {
    throw new HttpError(502, payload?.message || `Python A2 returned HTTP ${response.status}`);
  }
  const run = payload?.details?.run || {};
  const filesFound = Boolean(run.files_found);
  const intakenCount = Number(run.intaken_count || 0);
  const skippedOversizeCount = Number(run.skipped_oversize_count || 0);
  let compressionTriggered = false;
  if (skippedOversizeCount > 0) {
    compressionTriggered = true;
    await pulseA1SCompression(env, { ctx });
  }
  const knownA2 = {
    id: "python-a2",
    timestamp: startedAt,
    operations: filesFound ? 20 : 2,
    state: "success",
    status_code: 1,
    intaken_count: intakenCount,
    skipped_oversize_count: skippedOversizeCount,
    compression_triggered: compressionTriggered,
  };
  const status = await buildLibraryIntakeStatus(env, startedAt, knownA2);
  return respond(request, env, {
    ok: true,
    triggered: "a2-python",
    scenario_id: STUDIO_A2_SCENARIO_ID,
    daisy_chain: ["A2", "A2B"],
    hook_response: String(payload?.message || "python-a2").slice(0, 200),
    skipped_oversize_count: skippedOversizeCount,
    compression_triggered: compressionTriggered,
    ...status,
    message: status.summary,
  }, status.complete ? 200 : 202);
}
/*__STUDIO_WORKER_END:pulseStudioLibraryIntake__*/

export function mapLibraryIntakeAsset(record) {
  const profileId = firstLinkedRecordId(f(record, "Content_Profile"));
  return {
    id: record.id,
    name: f(record, "Asset Name"),
    mime_type: f(record, "MIME_Type"),
    classification_status: f(record, "Classification_Status"),
    intake_status: f(record, "Intake_Status"),
    file_size_mb: f(record, "File_Size_MB"),
    content_profile_id: profileId || null,
    needs_profile: !profileId,
  };
}
/*__STUDIO_WORKER_END:mapLibraryIntakeAsset__*/

export function mapLibraryIntakeSnapshot(needingClassification, oversized) {
  const classify = (needingClassification || []).map(mapLibraryIntakeAsset);
  const needProfile = classify.filter((row) => row.needs_profile);
  const needClassify = classify.filter((row) => !row.needs_profile);
  const oversize = Array.isArray(oversized) ? oversized : [];
  const notices = [];
  if (needProfile.length) notices.push(`${needProfile.length} asset${needProfile.length === 1 ? "" : "s"} waiting for a Content Profile in Asset Manager`);
  if (needClassify.length) notices.push(`${needClassify.length} asset${needClassify.length === 1 ? "" : "s"} waiting for classification`);
  if (oversize.length) notices.push(`${oversize.length} oversized video${oversize.length === 1 ? "" : "s"} need compression`);
  return {
    a0_parked: true,
    a2_webhook: true,
    daisy_chain: ["A2", "A2B"],
    action_required: classify.length + oversize.length,
    notice: notices.length ? notices.join(". ") + "." : "No library assets currently require action.",
    needing_classification: classify,
    needing_profile: needProfile,
    awaiting_classification: needClassify,
    oversized_count: oversize.length,
  };
}
/*__STUDIO_WORKER_END:mapLibraryIntakeSnapshot__*/

export function mapMakeIntakeRun(row) {
  if (!row) return null;
  if (row.eventType && row.eventType !== "EXECUTION_END" && !Number.isFinite(Number(row.operations))) return null;
  if (row.type && !row.operations && row.type !== "auto") return null;
  const statusCode = Number(row.status);
  const operations = Number(row.operations) || 0;
  let state = "unknown";
  if (statusCode === 1) state = "success";
  else if (statusCode === 2) state = "warning";
  else if (Number.isFinite(statusCode) && statusCode >= 3) state = "error";
  return {
    id: row.id || null,
    timestamp: row.timestamp || null,
    duration_ms: Number(row.duration) || 0,
    operations,
    state,
    status_code: Number.isFinite(statusCode) ? statusCode : null,
  };
}
/*__STUDIO_WORKER_END:mapMakeIntakeRun__*/

export function makeExecutionList(body) {
  const bags = [];
  if (Array.isArray(body)) bags.push(body);
  if (body && typeof body === "object") {
    bags.push(
      body.executions,
      body.scenarioLogs,
      body.logs,
      body.scenarioExecutions,
      body.data,
      body.response,
      body.response?.executions,
      body.response?.scenarioLogs,
      body.response?.logs,
      body.response?.scenarioExecutions,
      body.response?.data
    );
  }
  for (const bag of bags) {
    if (Array.isArray(bag)) return bag.map(mapMakeIntakeRun).filter(Boolean);
    if (bag && Array.isArray(bag.executions)) return bag.executions.map(mapMakeIntakeRun).filter(Boolean);
  }
  return [];
}
/*__STUDIO_WORKER_END:makeExecutionList__*/

export async function listMakeIntakeExecutions(env, scenarioId) {
  const body = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/logs?pg%5Blimit%5D=12`, { method: "GET", timeoutMs: 8000 });
  return makeExecutionList(body);
}
/*__STUDIO_WORKER_END:listMakeIntakeExecutions__*/

export function pythonIntakeRun(startedAt, operations) {
  return {
    id: "python",
    timestamp: startedAt || new Date().toISOString(),
    duration_ms: 0,
    operations,
    state: "success",
    status_code: 1,
  };
}
/*__STUDIO_WORKER_END:pythonIntakeRun__*/

export async function pythonA2RunSince(env, startedAt) {
  if (!startedAt) return null;
  const startMs = Date.parse(startedAt);
  const iso = Number.isFinite(startMs) ? new Date(startMs - 15000).toISOString() : String(startedAt);
  const safe = iso.replace(/'/g, "");
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
    limit: 10,
    filterFormula: `IS_AFTER(CREATED_TIME(), DATETIME_PARSE('${safe}'))`,
  }).catch(() => []);
  if (records.length) return pythonIntakeRun(startedAt, 20);
  if (Number.isFinite(startMs) && Date.now() - startMs > 25000) return pythonIntakeRun(startedAt, 2);
  return null;
}
/*__STUDIO_WORKER_END:pythonA2RunSince__*/

export function firstRunSince(runs, startedAt) {
  if (!runs.length) return null;
  if (!startedAt) return runs[0];
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) return runs[0];
  const matched = runs.find((run) => {
    const t = Date.parse(run.timestamp || "");
    return Number.isFinite(t) && t >= startMs - 8000;
  });
  if (matched) return matched;
  const newest = runs[0];
  const newestMs = Date.parse(newest.timestamp || "");
  if (Number.isFinite(newestMs) && Math.abs(newestMs - startMs) < 20000) return newest;
  return null;
}
/*__STUDIO_WORKER_END:firstRunSince__*/

export function describeA2Run(run) {
  if (!run) return { files_found: null, result: "waiting", detail: "Starting A2…" };
  const python = String(run.id || "").startsWith("python");
  const skippedOversize = Number(run.skipped_oversize_count || 0);
  const intakenCount = Number(run.intaken_count || 0);
  if (run.state === "error") {
    return { files_found: null, result: "error", detail: python ? "A2 failed." : "A2 failed. Check Make for the error." };
  }
  if (run.operations <= STUDIO_A2_EMPTY_MAX_OPERATIONS) {
    if (skippedOversize > 0) {
      const compressNote = run.compression_triggered ? " Compression started." : "";
      return {
        files_found: true,
        result: "oversize_only",
        detail: `${skippedOversize} oversized video${skippedOversize === 1 ? "" : "s"} skipped intake.${compressNote}`,
        skipped_oversize_count: skippedOversize,
      };
    }
    return { files_found: false, result: "empty", detail: "A2 completed with no assets to process" };
  }
  if (skippedOversize > 0 && intakenCount === 0) {
    const compressNote = run.compression_triggered ? " Compression started." : "";
    return {
      files_found: true,
      result: "oversize_only",
      detail: `${skippedOversize} oversized video${skippedOversize === 1 ? "" : "s"} sent to compression.${compressNote}`,
      skipped_oversize_count: skippedOversize,
    };
  }
  if (python) {
    const oversizeNote = skippedOversize > 0 ? ` ${skippedOversize} oversized skipped.` : "";
    return { files_found: true, result: "processed", detail: `A2 intook ${intakenCount || "new"} file(s).${oversizeNote}` };
  }
  return { files_found: true, result: "processed", detail: `A2 found files to intake (${run.operations} Make operations).` };
}
/*__STUDIO_WORKER_END:describeA2Run__*/

export async function buildLibraryIntakeStatus(env, startedAt, knownA2 = null) {
  const a2Python = pipelineStageBackend(env, "A2").mode === "python";
  const a2bPython = pipelineStageBackend(env, "A2B").mode === "python";
  const a3Python = pipelineStageBackend(env, "A3").mode === "python";
  const a4Python = pipelineStageBackend(env, "A4").mode === "python";
  let inferredA2 = knownA2;
  if (!inferredA2 && a2Python) inferredA2 = await pythonA2RunSince(env, startedAt);
  const [a2Runs, a2bRuns, a3Runs, a4Runs, needingClassification, oversized] = await Promise.all([
    inferredA2 || a2Python ? Promise.resolve([]) : listMakeIntakeExecutions(env, STUDIO_A2_SCENARIO_ID).catch(() => []),
    a2bPython ? Promise.resolve([]) : listMakeIntakeExecutions(env, STUDIO_A2B_SCENARIO_ID).catch(() => []),
    a3Python ? Promise.resolve([]) : listMakeIntakeExecutions(env, STUDIO_A3_SCENARIO_ID).catch(() => []),
    a4Python ? Promise.resolve([]) : listMakeIntakeExecutions(env, STUDIO_A4_SCENARIO_ID).catch(() => []),
    listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, { limit: 25, view: STUDIO_A3_CLASSIFY_VIEW_ID }).catch(() => []),
    listOversizedMedia(env).catch(() => []),
  ]);
  const a2 = inferredA2 || firstRunSince(a2Runs, startedAt);
  const a2ResultPreview = describeA2Run(a2);
  const a2b = firstRunSince(a2bRuns, startedAt) || (a2 && a2bPython ? pythonIntakeRun(startedAt, a2ResultPreview.files_found ? 8 : 2) : null);
  const a3 = firstRunSince(a3Runs, startedAt);
  const a4 = firstRunSince(a4Runs, startedAt);
  const a2Result = describeA2Run(a2);
  const classifyRows = (needingClassification || []).map(mapLibraryIntakeAsset);
  const classifyCount = classifyRows.length;
  const needProfileCount = classifyRows.filter((row) => row.needs_profile).length;
  const needClassifyCount = classifyCount - needProfileCount;
  const skipped = a2Result.files_found === false && !classifyCount ? "Skipped — no files to intake." : null;
  const a3Detail = needProfileCount && needClassifyCount
    ? `${needProfileCount} need a Content Profile; ${needClassifyCount} waiting for classification.`
    : needProfileCount
      ? `${needProfileCount} waiting for a Content Profile in Asset Manager.`
      : needClassifyCount
        ? `${needClassifyCount} waiting for classification (profile already set).`
        : a3
          ? (a3.state === "error" ? "A3 failed." : "A3 finished.")
          : (skipped || "A3 classifies after a Content Profile is on the asset.");
  const stages = [
    { key: "A2", label: "Intake", run: a2, ...a2Result },
    { key: "A2B", label: "Video backfill", run: a2b, detail: a2b ? (a2b.state === "error" ? "A2B failed." : "A2B finished.") : (skipped || (a2 ? "Starting A2B…" : "Queued")) },
    { key: "A3", label: "Classification", run: a3, detail: a3Detail },
    { key: "A4", label: "Reconciliation", run: a4, detail: a4 ? (a4.state === "error" ? "A4 failed." : "A4 finished.") : (skipped || "Queued") },
  ];
  const failed = a2Result.result === "error" || [a2b, a3, a4].some((run) => run?.state === "error");
  const empty = a2Result.files_found === false && !classifyCount;
  const intakeDone = Boolean(a2) && a2Result.result !== "waiting" && a2Result.result !== "error";
  const complete = failed || empty || intakeDone;
  const percent = empty || (complete && !failed) ? 100 : failed ? 40 : a2Result.files_found ? 55 : 12;
  const summary = empty
    ? "A2 completed with no assets to process"
    : classifyCount && intakeDone
      ? `Intake finished. ${classifyCount} asset${classifyCount === 1 ? "" : "s"} need a profile in Asset Manager before classification.`
      : a2Result.result === "oversize_only"
      ? a2Result.detail
      : failed
        ? a2Result.detail
        : complete
          ? "Intake finished. Assign a profile in Asset Manager to classify Drive-ingested files."
          : a2Result.detail;
  return {
    started_at: startedAt,
    percent,
    complete,
    failed,
    summary,
    a2: a2Result,
    stages,
    library_intake: mapLibraryIntakeSnapshot(needingClassification, oversized),
  };
}
/*__STUDIO_WORKER_END:buildLibraryIntakeStatus__*/

export async function getStudioLibraryIntakeStatus(request, env, url) {
  const startedAt = String(url.searchParams.get("started_at") || "").trim() || null;
  const status = await buildLibraryIntakeStatus(env, startedAt);
  return respond(request, env, { ok: true, ...status });
}

/*__STUDIO_WORKER_END:getStudioLibraryIntakeStatus__*/
