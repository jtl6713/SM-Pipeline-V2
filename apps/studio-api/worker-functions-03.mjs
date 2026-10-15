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
  STUDIO_DEFAULT_MUSIC_VOLUME,
  STUDIO_DEFAULT_DUCKED_MUSIC_VOLUME,
  HttpError,
  AIRTABLE_SLOT_FAIL_FAST_MS,
  studioHotReadCache,
  studioListWriteGeneration,
  STUDIO_CITY_DESTINATION_KEYS,
  STUDIO_PIPELINE_OPEN_OUTPUT_LIMIT,
  PRODUCTION_REQUEST_OUTPUT_TABLE,
  ITEM4_MEDIA_PUBLIC_BASE,
  ITEM4_MAX_FILE_BYTES,
  ITEM4_MAX_CLIP_FILE_BYTES,
  ITEM4_MEDIA_ASSET_TABLE,
  IDEA_LIBRARY_BRAND_SUBJECTS,
  ITEM4_VARIANT_QUEUE_TABLE,
  ITEM4_SMV1_SCENARIO_ID,
  ITEM4_VARIANT_RECIPE_VERSION,
  IDEA_LIBRARY_SCAN_LIMIT,
  IDEA_LIBRARY_PLACE_FILTER_LIMIT,
  ITEM4_DRAIN_CRON_BUDGET_MS,
  ITEM4_P3_SCENARIO_ID,
  ITEM4_R2_SCENARIO_ID,
  ITEM4_R2_SOURCE_GUARD_NAME,
  ITEM4_P3_SOURCE_AUTHORITY_NAME,
  STUDIO_IG_ORCH_SCENARIO_ID,
  PRODUCTION_REQUEST_TABLE,
  STUDIO_PLATFORM_OUTPUT_TABLE,
  OUTPUT_LIST_FIELDS,
  STUDIO_READ_SNAPSHOT_FRESH_MS,
  PIPELINE_OUTPUT_LIST_CACHE_MS,
  PIPELINE_OPEN_PACK_CACHE_MS,
  STUDIO_READ_SNAPSHOT_WARM_MS,
  STUDIO_SUPABASE_SYNC_LAST_KEY,
  MUSIC_LIBRARY_MAX_FILES,
  MUSIC_LIBRARY_MAX_FILE_BYTES,
  GDRIVE_MUSIC_FOLDER_ID,
  ASSET_LIBRARY_MAX_FILES,
  ASSET_LIBRARY_LIST_FORMULA,
  ASSET_LIBRARY_PAGE_SIZE,
  ASSET_LIBRARY_MAX_PAGE_SIZE,
  PUBLISHED_LIBRARY_LIST_FORMULA,
  LIBRARY_CLASSIFY_ALL_LIMIT,
  LIBRARY_CLASSIFY_PENDING_FORMULA,
  ITEM4_PREVIEW_SMV1_NAME,
  STUDIO_P3_REMOTION_HANDOFF_MARKER,
  STUDIO_P3_NATIVE_PHOTO_STATUS_IF,
  STUDIO_P3_NATIVE_PHOTO_SELECTION_IF,
  PHASE6_CAROUSEL_SLIDES_TABLE,
  PHASE6_STYLE_PRESETS,
  PHASE6_TEXT_ROLES,
  PHASE6_POSITIONS,
  PHASE6_FOCAL_POINTS,
  PHASE6_FIT_MODES,
  PHASE6_MOTIONS,
  PHASE6_TRANSITIONS,
  PHASE6_VOICES,
  PHASE6_VOICE_CATALOG_TABLE,
  PHASE6_DEFAULT_VOICE_ID,
  PHASE6_GEORGE_VOICE_ID,
  PHASE6_P0202_SCENARIO_ID,
  PHASE6_R2_SCENARIO_ID,
  PHASE6_R3_SCENARIO_ID,
  PHASE6_R4_SCENARIO_ID,
  PHASE6_R5_SCENARIO_ID,
  STUDIO_R5_DONE_HOOK_TOKEN,
  STUDIO_R2_WORK_FORMULA,
  STUDIO_R3_WORK_FORMULA,
  STUDIO_T1_WORK_FORMULA,
  STUDIO_R4_WORK_FORMULA,
  STUDIO_RENDER_QUEUE_ACTIVE_FORMULA,
  STUDIO_CONTINUATION_CANDIDATE_FORMULA,
  STUDIO_RFR_MISSING_COVER_FORMULA,
  STUDIO_FB_PUBLIC_WEBHOOK_URL,
  STUDIO_AP0_RECORD_ID,
  STUDIO_M1_SCENARIO_ID,
  STUDIO_R2B_SCENARIO_ID,
  STUDIO_R2B_VIEW_NAME,
  STUDIO_M1_STALE_RENDER_FORMULA,
  STUDIO_C1_VIEW_ID,
  STUDIO_C2M_VIEW_ID,
  STUDIO_C2M_TABLE_ID,
  STUDIO_FB_COVER_ATTACHED_MARK,
  R2_UPLOAD_WORKER_PUBLIC,
  STUDIO_UPLOAD_WORKER_UA,
  STUDIO_CHICAGO_PLACE_PAGE_IDS,
  STUDIO_PUBLISH_DISPATCH_SCENARIOS,
  STUDIO_PUBLISH_ORCH_PYTHON,
  REPAIR_LEASE_NOTE_PREFIX,
  REPAIR_LEASE_TABLE_ID,
  STUDIO_IDEA_PROFILE_TABLE_ID,
} from "./worker.js";
import {
  accessIdentity,
  resolveStudioCronAuthorization,
  corsHeaders,
  respond,
  requirePermission,
  airtableCooldownWaitMs,
  studioReadCoalesce,
  clampLimit,
  listRecords,
  listRecordsPage,
  f,
  studioOutputIsNativePhotoRoute,
  studioOutputIsNativePhoto,
  studioNativeStillsNeedLettering,
  studioOutputHasReviewableDeliverable,
  studioClipPublicCdnUrl,
  item4UrlIsPublicPublishCdn,
  studioYoutubePublicSourceUrl,
  studioYoutubeFailedPrivateSource,
  studioStageYoutubePublicMp4FromDrive,
  item4FinishedVideoPreviewKey,
  item4FinishedMasterPlayUrl,
  item4UrlIsPublicPlayableVideo,
  studioMappedPreviewUrl,
  studioPublicJpegCoverUrl,
  studioNativeStillPreviewUrl,
  studioPreviewKind,
  sortHighConfidenceMatches,
  selectMatchedPhotos,
  mapContent,
  cleanMusicDisplayName,
  selectedVisualClips,
  mapOutput,
  extractGoogleDriveFileId,
  googleDriveFileId,
  googleDriveDownloadUrl,
  studioMusicR2KeyFromUrl,
  isMusicLibraryFile,
  mapMusic,
  buildIdeasListPayload,
  airtableFormulaEscape,
  requestedProfileId,
  studioThemeForProfile,
  studioSettingsPrefixForTheme,
  studioContentProfileRecordIdForOutput,
  studioThemeForPublishRecord,
  mapStudioContentProfile,
  contentProfileFilterFormula,
  studioPipelineOpenOutputFormula,
  mergePipelineOutputRecords,
  studioPipelineContentIdsFromOutputs,
  listPipelineOutputsForContentIds,
  listPipelineContentByIds,
  listContentProfileRecords,
  resolveWorkingContentProfile,
  outputRowsForProductionRequest,
  item4ParseJson,
  item4SafeFileName,
  item4FileExtension,
  item4IsSupportedImageFile,
  item4IsSupportedVideoFile,
  item4LooksLikeVideoAsset,
  item4GoogleAccessToken,
  item4FetchDriveThumbnailBytes,
  item4NormalizedMimeType,
  item4AssetManifest,
  item4OutputHasLeftoverOverlay,
  studioRepairLeftoverNativeLettering,
  studioBurnedInOverlayPosition,
  phase6DefaultOverlayPosition,
  studioPickSharedAudioMixFields,
  studioPatchSiblingVerticalShortOutputs,
  item4UpdateRequestState,
  ideaLibraryTokens,
  ideaLibraryStrongTokens,
  ideaLibrarySearchFilterKeys,
  ideaLibraryMatchKeys,
  ideaLibraryFilterKeys,
  ideaLibraryAirtableEscape,
  ideaLibraryFilterFormula,
  ideaLibraryVideoFilterFormula,
  ideaLibraryIntakeDate,
  ideaLibraryFileBytes,
  ideaLibraryIsEligibleVideo,
  ideaLibraryIsEligibleImage,
  ideaLibraryRankAsset,
  ideaLibraryRejectReason,
  studioProfileRequiresChicagoWatermark,
  studioAssetSourceDriveId,
  ensureChicagoWatermarkedLibraryAssetForProfile,
  ensureChicagoWatermarkedLibraryAsset,
  studioFinishedOriginKind,
  studioIsFinishedPassthrough,
  studioOutputTypeLabel,
  studioIsFinishedVideoFilePassthrough,
  item4FinishedStoryTeaserReady,
  studioPublishCanDispatchNow,
  studioPromoteDuePublishStatus,
  studioPublishHeldUntilIso,
  item4EffectivePhotoCount,
  item4StudioDirectiveYes,
  studioAiThumbnailUrl,
  studioNeedsAiThumbnail,
  studioStampParentAiCoverOnOutput,
  studioEnsurePublicAiCover,
  item4SyncPlanOutputs,
  pipelineStageBackend,
  parseStudioProductionJob,
  item4PulseStudioProduceJob,
  studioRequestNotesText,
  studioIsAzFinishedVideo,
  studioIsVibeCut,
  studioAzIsStory,
  azAutoApproveIfReady,
  enqueueStudioProductionJob,
  loadStudioProductionJobsForOutputs,
  resumeStaleStudioProductionJobs,
  healStuckStudioRenders,
  studioHealFailedStatuses,
  studioHealIgCarouselTooManyChildren,
  studioHealIgCarouselChildVerificationRace,
  studioHealIgCarouselChildPollFailure,
  studioHealIgCarouselRateLimit,
} from "./worker-functions-01.mjs";
import {
  studioHealEscalatedProduce,
  resumeStalePlatformOutputs,
  item4PulsePipelineStage,
  item4PulseSmv1Python,
  item4PulseR2BPython,
  item4PulseR2Python,
  item4PulseR3Python,
  item4PulseT1Python,
  readOpsQueueControls,
  studioLoadRenderQueueCandidates,
  item4PulseR4Python,
  item4PulseR5Python,
  item4PulseLetterPython,
  item4RefreshNativeLetteredSlides,
  item4PulseP1Python,
  item4PulseP3Python,
  item4DrainAllPendingWork,
  item4ReconcileVariants,
  listOpenProductionRequests,
  existingDraftForIdea,
  createDraftForIdea,
  arrayOrEmpty,
  productionProfileDefaultsForParentContentItem,
  buildOutputWorkItemEffective,
  item4StripAssetFilenameCaptionText,
  item4EnsureAiSourceMasters,
  item4StudioSourcePackageForOutput,
  platformOutputSeedFields,
  studioFinishedSeedOverlay,
  fanoutProductionRequestOutputsToContentItems,
  armStudioParentForP3Handoff,
  pulseStudioP2Handoff,
  pulseStudioC2Handoff,
} from "./worker-functions-02.mjs";
import {
  listPipelineSettingsForAdmin,
  pipelineSettingValue,
  chicagoNowParts,
  studioSettingsByName,
  stampPhotoReadyIdeaForAutonomousProduce,
} from "./worker-functions-04.mjs";

export async function findDraftProductionRequestForIdea(env, ideaRecordId) {
  const records = await listOpenProductionRequests(env);
  const matches = records.filter((record) => {
    const ideaLinks = Array.isArray(f(record, "Idea_Candidate")) ? f(record, "Idea_Candidate") : [];
    const status = String(f(record, "Request_Status") || "").trim();
    return ideaLinks.includes(ideaRecordId)
      && ["Draft", "Ready", "Submitted"].includes(status)
      && Boolean(f(record, "Active"));
  }).map((record) => ({
    id: record.id,
    status: String(f(record, "Request_Status") || "").trim(),
    createdAt: f(record, "Created_At") || record.createdTime || "",
    record,
  }));
  const preferred = preferAuthoritativeProductionRequest(matches);
  const chosen = preferred ? (matches.find((row) => row.id === preferred.id)?.record || null) : null;
  if (!chosen?.id) return null;
  return airtableFetch(env, PRODUCTION_REQUEST_TABLE, chosen.id);
}
/*__STUDIO_WORKER_END:findDraftProductionRequestForIdea__*/

export async function rankStillsForIdeaPhotoWait(env, idea) {
  const ideaTokens = ideaLibraryTokens([
    f(idea, "Candidate_Title"),
    f(idea, "Idea_Summary"),
    f(idea, "Primary_Location"),
  ].filter(Boolean).join(" "));
  const strongIdeaTokens = ideaLibraryStrongTokens(ideaTokens);
  const { placeKeys, subjectKeys, scanKeys } = ideaLibraryMatchKeys(idea, "");
  const today = chicagoNowParts().date;
  const filterKeys = placeKeys.length || subjectKeys.some((token) => IDEA_LIBRARY_BRAND_SUBJECTS.has(token))
    ? ideaLibraryFilterKeys(placeKeys, subjectKeys)
    : scanKeys;
  const scanLimit = filterKeys.length ? IDEA_LIBRARY_PLACE_FILTER_LIMIT : IDEA_LIBRARY_SCAN_LIMIT;
  const crossScope = await readLibraryCrossScopeSetting(env);
  const scopeFormula = await mediaAssetProfileScopeForId(
    env,
    firstLinkedRecordId(f(idea, "Content_Profile")),
    { crossScope, includeUnscoped: true },
  );
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID || ITEM4_MEDIA_ASSET_TABLE, {
    limit: scanLimit,
    sortField: "Intake_Date",
    sortDirection: "desc",
    filterFormula: combineAirtableFormulas(ideaLibraryFilterFormula(filterKeys), scopeFormula),
  });
  const ranked = [];
  for (const record of records) {
    if (!ideaLibraryIsEligibleImage(record)) continue;
    const row = ideaLibraryRankAsset(record, {
      placeKeys,
      subjectKeys,
      strongIdeaTokens,
      ideaTokens,
      queryTokens: [],
      today,
    });
    if (!row) continue;
    ranked.push({
      id: record.id,
      record,
      score: row.score,
      confidence: row.confidence,
      match_reasons: row.match_reasons,
      intake_date: ideaLibraryIntakeDate(record) || null,
      intake_batch_id: row.intake_batch_id || String(f(record, "Intake_Batch_ID") || "").trim() || null,
      media_kind: "photo",
      media_type: String(f(record, "MIME_Type") || "image").trim().toLowerCase(),
      duration_seconds: Number(f(record, "Duration_Seconds") || 0) || null,
    });
  }
  return ranked;
}
/*__STUDIO_WORKER_END:rankStillsForIdeaPhotoWait__*/

export async function rankVideosForScriptedShortProposal(env, idea) {
  const ideaTokens = ideaLibraryTokens([
    f(idea, "Candidate_Title"),
    f(idea, "Idea_Summary"),
    f(idea, "Primary_Location"),
  ].filter(Boolean).join(" "));
  const strongIdeaTokens = ideaLibraryStrongTokens(ideaTokens);
  const { placeKeys, subjectKeys, scanKeys } = ideaLibraryMatchKeys(idea, "");
  const today = chicagoNowParts().date;
  const filterKeys = placeKeys.length || subjectKeys.some((token) => IDEA_LIBRARY_BRAND_SUBJECTS.has(token))
    ? ideaLibraryFilterKeys(placeKeys, subjectKeys)
    : scanKeys;
  const scanLimit = filterKeys.length ? IDEA_LIBRARY_PLACE_FILTER_LIMIT : IDEA_LIBRARY_SCAN_LIMIT;
  const crossScope = await readLibraryCrossScopeSetting(env);
  const scopeFormula = await mediaAssetProfileScopeForId(
    env,
    firstLinkedRecordId(f(idea, "Content_Profile")),
    { crossScope, includeUnscoped: true },
  );
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID || ITEM4_MEDIA_ASSET_TABLE, {
    limit: scanLimit,
    sortField: "Intake_Date",
    sortDirection: "desc",
    filterFormula: combineAirtableFormulas(ideaLibraryVideoFilterFormula(filterKeys), scopeFormula),
  });
  const ranked = [];
  for (const record of records) {
    if (!ideaLibraryIsEligibleVideo(record)) continue;
    const row = ideaLibraryRankAsset(record, {
      placeKeys,
      subjectKeys,
      strongIdeaTokens,
      ideaTokens,
      queryTokens: [],
      today,
    });
    if (!row) continue;
    ranked.push({
      id: record.id,
      record,
      score: row.score,
      confidence: row.confidence,
      match_reasons: row.match_reasons,
      intake_date: ideaLibraryIntakeDate(record) || null,
      intake_batch_id: row.intake_batch_id || String(f(record, "Intake_Batch_ID") || "").trim() || null,
      media_kind: "video",
      media_type: String(f(record, "MIME_Type") || "video").trim().toLowerCase(),
      duration_seconds: Number(f(record, "Duration_Seconds") || 0) || null,
    });
  }
  return ranked;
}
/*__STUDIO_WORKER_END:rankVideosForScriptedShortProposal__*/

export async function unfinishedIntakeBatchIds(env, batchIds) {
  const unique = [...new Set((batchIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const pending = [];
  for (const batchId of unique.slice(0, 20)) {
    const rows = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID || ITEM4_MEDIA_ASSET_TABLE, {
      limit: 5,
      filterFormula: `AND({Intake_Batch_ID}="${ideaLibraryAirtableEscape(batchId)}",OR({Classification_Status}='Needs Classification',{Classification_Status}='Processing'))`,
    });
    if (rows.length) pending.push(batchId);
  }
  return pending;
}
/*__STUDIO_WORKER_END:unfinishedIntakeBatchIds__*/

export async function applyLibraryAssetsToProductionRequest(env, requestRecord, mediaIds, { replaceWaitAssets = false, allowManagePaused = false, replaceAll = false, allowVideo = false } = {}) {
  const existingAll = item4AssetManifest(requestRecord);
  const existing = replaceAll
    ? []
    : replaceWaitAssets
    ? existingAll.filter((asset) => String(asset?.source || "") !== "idea_photo_wait")
    : existingAll;
  const already = new Set(existing.map((asset) => String(asset?.media_asset_record_id || "").trim()).filter(Boolean));
  const appended = [];
  for (const mediaId of mediaIds) {
    if (already.has(mediaId)) continue;
    let media = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID || ITEM4_MEDIA_ASSET_TABLE, mediaId);
    media = await ensureChicagoWatermarkedLibraryAsset(env, media, requestRecord);
    const reject = ideaLibraryRejectReason(media, { allowVideo });
    if (reject) continue;
    const driveId = googleDriveFileId(media);
    const driveUrl = String(f(media, "Google Drive URL") || "").trim()
      || (driveId ? `https://drive.google.com/file/d/${driveId}/view` : "");
    const mime = String(f(media, "MIME_Type") || "image/jpeg").trim() || "image/jpeg";
    const name = String(f(media, "Asset Name") || "photo");
    const video = ideaLibraryIsEligibleVideo(media) || mime.toLowerCase().startsWith("video/");
    const durationSeconds = Number(f(media, "Duration_Seconds") || 0);
    appended.push({
      id: crypto.randomUUID().replace(/-/g, "").slice(0, 18),
      order: existing.length + appended.length + 1,
      name,
      mime_type: mime,
      media_kind: video ? "video" : "photo",
      duration_seconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
      in_seconds: 0,
      out_seconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
      source_format: String(f(media, "File_Extension") || item4FileExtension(name) || "").toUpperCase() || null,
      browser_preview_compatible: true,
      size_bytes: ideaLibraryFileBytes(media) || null,
      focal_point: "center",
      google_drive_file_id: driveId,
      source_google_drive_file_id: studioAssetSourceDriveId(media) || null,
      google_drive_url: driveUrl || null,
      media_asset_record_id: media.id,
      preview_url: `/api/media-assets/${media.id}/preview`,
      authoritative_storage: "google_drive",
      staging_deleted: true,
      r2_key: null,
      url: driveUrl || null,
      uploaded_at: new Date().toISOString(),
      source: "idea_photo_wait",
    });
    already.add(media.id);
  }
  // Slow matching/watermark work must not commit over an operator edit.
  const latest = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id);
  const ideaId = firstLinkedRecordId(f(latest, "Idea_Candidate"));
  const latestIdea = ideaId ? await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaId) : null;
  if (!replaceAll && (productionPhotoWaitAutoOff(f(latest, "Production_Notes"))
    || JSON.stringify(item4AssetManifest(latest)) !== JSON.stringify(existingAll)
    || (latestIdea && (String(f(latestIdea, "Studio_Photo_Wait_Status") || "").trim() === "Not Needed"
      || (!allowManagePaused && ideaManagePhotoPauseActive(f(latestIdea, "Production_Config_Notes"))))))) {
    return { record: latest, assets: item4AssetManifest(latest), appended: 0, skipped: true };
  }
  const assets = [...existing, ...appended];
  const allReady = assets.length > 0 && assets.every((asset) =>
    String(asset?.google_drive_file_id || "").trim() && String(asset?.media_asset_record_id || "").trim()
  );
  const mediaAssetIds = [...new Set(assets.map((asset) => String(asset?.media_asset_record_id || "").trim()).filter(Boolean))];
  const updated = await item4UpdateRequestState(env, requestRecord.id, {
    Studio_Master_Assets_JSON: JSON.stringify(assets),
    Studio_Master_Asset_Count: assets.length,
    Studio_Master_Asset_Status: allReady ? "Ready" : (assets.length ? "Uploading" : "None"),
    Studio_Master_Media_Assets: mediaAssetIds,
    Studio_Output_Plan_Status: "Needs Plan",
    Studio_Output_Plan_JSON: null,
    Studio_Variant_Manifest_JSON: null,
    Studio_Variant_Status: "None",
    Studio_Variant_Updated_At: null,
    Studio_Variant_Error: null,
    Studio_Item4_State: allReady ? "Assets Ready" : (assets.length ? "Draft" : "Draft"),
    Carousel_Image_Mode: "Manual Upload",
    Carousel_Slide_Count_Mode: "Target range",
    Carousel_Slide_Count_Min: f(requestRecord, "Carousel_Slide_Count_Min"),
    Carousel_Slide_Count_Max: f(requestRecord, "Carousel_Slide_Count_Max"),
    Carousel_Slide_Count_Exact: assets.length || f(requestRecord, "Carousel_Slide_Count_Exact") || null,
  });
  return { record: updated, assets, appended: appended.length };
}
/*__STUDIO_WORKER_END:applyLibraryAssetsToProductionRequest__*/

export async function evaluateAndMaybeAttachWaitingIdeaPhotos(env, idea, { authorization = null, force = false, productionRequest = null } = {}) {
  // Always refresh before matching. Manage Idea writes a short-lived pause token and
  // entering Production writes a permanent Not Needed/ez-photo-wait=off lock.
  idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id).catch(() => idea);
  const waitStatusNow = String(f(idea, "Studio_Photo_Wait_Status") || "").trim();
  // Manage Idea pauses background matching so deleted/unselected photos stay authoritative.
  // An explicit Find images now request is user-directed and may bypass only this temporary pause.
  if (!force && ideaManagePhotoPauseActive(f(idea, "Production_Config_Notes"))) {
    return { action: "paused", idea, production_request: productionRequest || null, skipped: true };
  }
  if (waitStatusNow === "Not Needed") {
    return { action: "manual", idea, production_request: productionRequest || null, skipped: true };
  }

  let requestRecord = productionRequest
    || (authorization ? await existingDraftForIdea(env, idea.id, authorization) : null)
    || await findDraftProductionRequestForIdea(env, idea.id);
  if (requestRecord && productionPhotoWaitAutoOff(f(requestRecord, "Production_Notes"))) {
    return { action: "manual", idea, production_request: requestRecord, skipped: true };
  }

  const min = Number(f(idea, "Production_Carousel_Slide_Count_Min") || 0);
  const max = Number(f(idea, "Production_Carousel_Slide_Count_Max") || 0);
  const matches = await rankStillsForIdeaPhotoWait(env, idea);
  const pendingBatchIds = await unfinishedIntakeBatchIds(env, matches.map((row) => row.intake_batch_id));
  const decision = selectMatchedPhotos({ matches, min, max, pendingBatchIds, force });
  const evaluatedAt = new Date().toISOString();
  const matchJson = {
    evaluated_at: evaluatedAt,
    action: decision.action,
    reason: decision.reason,
    high_count: decision.high_count,
    min,
    max,
    selected: decision.selected.map((row) => ({
      id: row.id,
      score: row.score,
      confidence: row.confidence,
      match_reasons: row.match_reasons,
      intake_date: row.intake_date,
      intake_batch_id: row.intake_batch_id || null,
    })),
  };

  // Re-check after ranking because the operator may have opened Manage Idea or
  // entered Production while the library scan was running.
  idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id).catch(() => idea);
  if (!force && ideaManagePhotoPauseActive(f(idea, "Production_Config_Notes"))) {
    return { ...decision, action: "paused", idea, production_request: requestRecord, skipped: true };
  }
  if (String(f(idea, "Studio_Photo_Wait_Status") || "").trim() === "Not Needed") {
    return { ...decision, action: "manual", idea, production_request: requestRecord, skipped: true };
  }
  if (requestRecord) {
    requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id).catch(() => requestRecord);
  }
  const requestNotes = requestRecord ? String(f(requestRecord, "Production_Notes") || "").trim() : "";
  const autoOff = productionPhotoWaitAutoOff(requestNotes);
  if (autoOff) {
    return { ...decision, action: "manual", idea, production_request: requestRecord, skipped: true };
  }
  const rejectedIds = new Set(productionPhotoWaitRejectedIds(requestNotes));

  if (decision.action === "ready") {
    if (!requestRecord && authorization) {
      requestRecord = await createDraftForIdea(env, idea, authorization);
    }
    if (!requestRecord) {
      matchJson.action = "wait";
      matchJson.reason = "missing_production_request";
      const ideaOnly = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Studio_Photo_Wait_Status: "Waiting",
            Studio_Photo_Match_JSON: JSON.stringify(matchJson),
          },
          typecast: true,
        }),
      });
      return { ...decision, action: "wait", idea: ideaOnly, production_request: null };
    }
    const attachIds = decision.selected.map((row) => row.id).filter((id) => !rejectedIds.has(id));
    if (shouldAttachPhotoWaitAssets({ action: decision.action, autoOff }) && attachIds.length) {
      const attached = await applyLibraryAssetsToProductionRequest(
        env,
        requestRecord,
        attachIds,
        { replaceWaitAssets: !autoOff, allowManagePaused: force }
      );
      if (attached.skipped) return { action: "manual", idea, production_request: attached.record, skipped: true };
      requestRecord = attached.record;
    }
    const ideaReady = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Studio_Photo_Wait_Status: "Ready",
          Studio_Photo_Match_JSON: JSON.stringify(matchJson),
          Studio_Matched_Media_Assets: decision.selected.map((row) => row.id),
          Production_Carousel_Slide_Count: decision.selected.length,
        },
        typecast: true,
      }),
    });
    // Stamp origin=autonomous so morning resume / Factory Auto High can pick this
    // up — photo Ready alone used to park forever as a blank-notes Draft.
    requestRecord = await stampPhotoReadyIdeaForAutonomousProduce(env, ideaReady, requestRecord);
    return { ...decision, idea: ideaReady, production_request: requestRecord, match: matchJson };
  }

  const keepHighIds = sortHighConfidenceMatches(matches).map((row) => row.id).filter((id) => !rejectedIds.has(id));
  // wait / wait_batch must not rewrite a draft. DuSable Bridge had high_count 63
  // while intake was still running; cron replaced the strip and undeleted photos.
  const ideaWaiting = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Studio_Photo_Wait_Status: "Waiting",
        Studio_Photo_Match_JSON: JSON.stringify(matchJson),
        Studio_Matched_Media_Assets: keepHighIds,
      },
      typecast: true,
    }),
  });
  return { ...decision, idea: ideaWaiting, production_request: requestRecord, match: matchJson };
}
/*__STUDIO_WORKER_END:evaluateAndMaybeAttachWaitingIdeaPhotos__*/

export async function runWaitingIdeaPhotoMatches(env, { limit = 8 } = {}) {
  const records = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
    limit: Math.max(1, Number(limit) || 8),
    filterFormula: "AND({Studio_Photo_Wait_Status}='Waiting',{Promoted_Content_Record_ID}=BLANK(),{Candidate_Status}!='On Hold')",
  });
  const authorization = records.length ? await resolveStudioCronAuthorization(env) : null;
  const results = [];
  for (const idea of records) {
    try {
      results.push(await evaluateAndMaybeAttachWaitingIdeaPhotos(env, idea, {
        authorization,
        force: false,
      }));
    } catch (error) {
      console.warn("idea photo-wait evaluate failed", idea.id, error);
      results.push({ action: "error", idea_id: idea.id, error: error?.message || String(error) });
    }
  }
  return { evaluated: results.length, ready: results.filter((row) => row.action === "ready").length };
}

/*__STUDIO_WORKER_END:runWaitingIdeaPhotoMatches__*/

export async function listContent(request, env, url, authorization) {
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
  const limit = clampLimit(url);
  const payload = await studioReadCoalesce(`content-list:${profile.id}:${limit}`, 25000, async () => {
  const profileFormula = contentProfileFilterFormula(profile);
  const [newest, openPack, recentOutputs] = await Promise.all([
    listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, {
      limit,
      sortField: "Created_At",
      filterFormula: profileFormula,
    }),
    loadOpenPipelineOutputPack(env, profile),
    studioReadCoalesce(`content-recent-outputs:${profile.id}`, 20000, () => listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 200,
      filterFormula: profileFormula,
      sortField: "Output_ID",
      sortDirection: "desc",
      fields: OUTPUT_LIST_FIELDS,
    }).catch(() => [])),
  ]);
  const openContentIds = openPack.openContentIds;
  const missingIds = openContentIds.filter((id) => !newest.some((row) => row.id === id));
  const openContent = missingIds.length ? await listPipelineContentByIds(env, missingIds) : [];
  const byId = new Map();
  for (const row of [...newest, ...openContent]) {
    if (row?.id) byId.set(row.id, row);
  }
  const records = [...byId.values()];
  const outputs = mergePipelineOutputRecords(
    recentOutputs,
    mergePipelineOutputRecords(openPack.open, openPack.siblings),
  );
  const outputsByContent = new Map();
  for (const output of outputs) {
    const contentId = studioFirstLinkedId(f(output, "Content_Item"));
    if (!contentId) continue;
    if (!outputsByContent.has(contentId)) outputsByContent.set(contentId, []);
    outputsByContent.get(contentId).push(output);
  }
  return {
    records: records.map((record) => mapContent(record, outputsByContent.get(record.id) || [])),
    profile: mapStudioContentProfile(profile),
  };
  });
  return respond(request, env, { ok: true, ...payload });
}
/*__STUDIO_WORKER_END:listContent__*/

export async function scheduleGridContentById(env, outputRecords) {
  const ids = [...new Set((outputRecords || [])
    .map((record) => studioFirstLinkedId(f(record, "Content_Item")))
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id || ""))))];
  const byId = new Map();
  for (let index = 0; index < ids.length; index += 40) {
    const batch = ids.slice(index, index + 40);
    const formulaParts = batch.map((id) => `RECORD_ID()="${airtableFormulaEscape(id)}"`);
    const filterFormula = formulaParts.length === 1 ? formulaParts[0] : `OR(${formulaParts.join(",")})`;
    const records = await listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, {
      limit: batch.length,
      filterFormula,
      fields: ["Content_ID", "Content_Title"],
    });
    for (const record of records) byId.set(record.id, record);
  }
  return byId;
}
/*__STUDIO_WORKER_END:scheduleGridContentById__*/

export async function listOutputScheduleGrid(request, env, url, authorization) {
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
  const rawStart = String(url.searchParams.get("start") || "").trim();
  const rawEnd = String(url.searchParams.get("end") || "").trim();
  const startMs = Date.parse(rawStart);
  const endMs = Date.parse(rawEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new HttpError(400, "start and end must be valid ISO date-times");
  }
  if (endMs - startMs > 8 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, "Schedule grid range cannot exceed 8 days");
  }

  const body = await studioReadCoalesce(`schedule-grid:${profile.id}:${startMs}:${endMs}`, 25000, async () => {
  const startFloor = new Date(startMs - 1000).toISOString();
  const endIso = new Date(endMs).toISOString();

  if (studioReadSource(env) === "supabase") {
    try {
      const grid = await listSupabaseScheduleGrid(env, {
        profileAirtableId: profile.id,
        startIso: startFloor,
        endIso,
      });
      if (!grid.profileMissing) {
        return {
          ok: true,
          start: new Date(startMs).toISOString(),
          end: endIso,
          records: grid.records,
          profile: mapStudioContentProfile(profile),
          read_source: "supabase",
        };
      }
    } catch (error) {
      console.warn("supabase schedule-grid read failed; falling back to Airtable", error);
    }
  }

  const profileFormula = contentProfileFilterFormula(profile);
  const formula = `AND(${profileFormula},{Scheduled_Post_Date}!="",IS_AFTER({Scheduled_Post_Date},DATETIME_PARSE("${airtableFormulaEscape(startFloor)}")),IS_BEFORE({Scheduled_Post_Date},DATETIME_PARSE("${airtableFormulaEscape(endIso)}")))`;
  const records = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 500,
    filterFormula: formula,
    fields: [
      "Output_ID",
      "Platform",
      "Output_Title",
      "Scheduled_Post_Date",
      "Publish_Status",
      "Output_Status",
      "Content_Item",
    ],
    sortField: "Scheduled_Post_Date",
    sortDirection: "asc",
  });
  const contentById = await scheduleGridContentById(env, records);

  return {
    ok: true,
    start: new Date(startMs).toISOString(),
    end: endIso,
    records: records.map((record) => {
      const contentItemId = studioFirstLinkedId(f(record, "Content_Item"));
      const content = contentById.get(contentItemId);
      return {
        id: record.id,
        output_id: f(record, "Output_ID"),
        platform: f(record, "Platform"),
        output_title: f(record, "Output_Title"),
        content_item_id: contentItemId || null,
        content_id: content ? f(content, "Content_ID") : null,
        content_title: content ? f(content, "Content_Title") : f(record, "Output_Title"),
        scheduled_post_date: f(record, "Scheduled_Post_Date"),
        publish_status: f(record, "Publish_Status"),
        output_status: f(record, "Output_Status"),
      };
    }),
    profile: mapStudioContentProfile(profile),
    read_source: "airtable",
  };
  });
  return respond(request, env, body);
}
/*__STUDIO_WORKER_END:listOutputScheduleGrid__*/

export function studioMappedListSnapshotFresh(remembered, ttlMs) {
  if (!remembered?.payload || !Array.isArray(remembered.payload.records)) return false;
  if (Number(remembered.writeGen || 0) !== studioListWriteGeneration) return false;
  return Date.now() - Number(remembered.at || 0) < Math.max(1000, Number(ttlMs) || STUDIO_READ_SNAPSHOT_FRESH_MS);
}
/*__STUDIO_WORKER_END:studioMappedListSnapshotFresh__*/

export async function readMappedListSnapshot(env, memoryKey, snapshotKey) {
  const hit = studioHotReadCache.get(memoryKey);
  if (hit?.value && Array.isArray(hit.value.records)) {
    return { payload: hit.value, at: Number(hit.at) || 0, writeGen: Number(hit.writeGen || 0) };
  }
  if (!env?.STUDIO_MEDIA?.get) return null;
  try {
    const object = await env.STUDIO_MEDIA.get(snapshotKey);
    if (!object) return null;
    const body = await object.json();
    if (!body?.payload || !Array.isArray(body.payload.records)) return null;
    const at = Number(body.at) || 0;
    const writeGen = Number(body.writeGen || 0);
    studioHotReadCache.set(memoryKey, { at, value: body.payload, writeGen });
    return { payload: body.payload, at, writeGen };
  } catch (error) {
    console.warn("mapped list snapshot read failed", snapshotKey, error);
    return null;
  }
}
/*__STUDIO_WORKER_END:readMappedListSnapshot__*/

export async function writeMappedListSnapshot(env, memoryKey, snapshotKey, payload) {
  if (!payload || !Array.isArray(payload.records)) return;
  const at = Date.now();
  const writeGen = studioListWriteGeneration;
  studioHotReadCache.set(memoryKey, { at, value: payload, writeGen });
  if (!env?.STUDIO_MEDIA?.put) return;
  try {
    await env.STUDIO_MEDIA.put(snapshotKey, JSON.stringify({ at, writeGen, payload }), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (error) {
    console.warn("mapped list snapshot write failed", snapshotKey, error);
  }
}
/*__STUDIO_WORKER_END:writeMappedListSnapshot__*/

export function scheduleMappedListRefresh(ctx, env, memoryKey, snapshotKey, ttlMs, builder) {
  if (airtableCooldownWaitMs() > AIRTABLE_SLOT_FAIL_FAST_MS) return null;
  const pending = studioReadCoalesce(memoryKey, ttlMs, builder).then(async (payload) => {
    await writeMappedListSnapshot(env, memoryKey, snapshotKey, payload);
    return payload;
  });
  ctx?.waitUntil?.(pending.catch((error) => console.warn("mapped list refresh failed", snapshotKey, error)));
  return pending;
}
/*__STUDIO_WORKER_END:scheduleMappedListRefresh__*/

export function respondStudioMappedList(request, env, ctx, { memoryKey, snapshotKey, profile, ttlMs, builder, allowRefresh = true }) {
  const freshMs = Math.max(1000, Number(ttlMs) || STUDIO_READ_SNAPSHOT_FRESH_MS);
  return readMappedListSnapshot(env, memoryKey, snapshotKey).then((remembered) => {
    const fresh = studioMappedListSnapshotFresh(remembered, freshMs);
    if (allowRefresh && !fresh) scheduleMappedListRefresh(ctx, env, memoryKey, snapshotKey, freshMs, builder);
    return respond(request, env, {
      ok: true,
      snapshot: Boolean(remembered),
      cached: Boolean(fresh),
      stale: Boolean(remembered) && !fresh,
      refreshing: !remembered,
      records: Array.isArray(remembered?.payload?.records) ? remembered.payload.records : [],
      ...(remembered?.payload || {}),
      profile: remembered?.payload?.profile || mapStudioContentProfile(profile),
    });
  });
}
/*__STUDIO_WORKER_END:respondStudioMappedList__*/

export async function loadOpenPipelineOutputPack(env, profile) {
  const listOpts = {
    fields: OUTPUT_LIST_FIELDS,
    sortField: "Output_ID",
    sortDirection: "desc",
  };
  return studioReadCoalesce(`pipeline-open:${profile?.id || "default"}`, PIPELINE_OPEN_PACK_CACHE_MS, async () => {
    const open = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      ...listOpts,
      // Cap used to be max(limit, 250) newest-open only; older unfinished packages
      // (CI 143 / Output 847 Manual Fallback) aged out once >250 Ready-to-Schedule rows existed.
      limit: STUDIO_PIPELINE_OPEN_OUTPUT_LIMIT,
      filterFormula: studioPipelineOpenOutputFormula(profile),
    }).catch((error) => {
      const missingIndex = /UNKNOWN_FIELD_NAME|Studio_Pipeline_Open/i.test(String(error?.message || error || ""));
      if (!missingIndex) {
        console.warn("pipeline open-output scan failed", error);
        return [];
      }
      return listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
        ...listOpts,
        limit: STUDIO_PIPELINE_OPEN_OUTPUT_LIMIT,
        filterFormula: studioPipelineOpenOutputFormula(profile, { legacy: true }),
      }).catch((legacyError) => {
        console.warn("pipeline open-output scan failed", legacyError);
        return [];
      });
    });
    const openContentIds = studioPipelineContentIdsFromOutputs(open);
    // Pull every sibling on unfinished packages (Published FB/YT next to TikTok draft).
    const siblings = openContentIds.length
      ? await listPipelineOutputsForContentIds(env, profile, openContentIds, listOpts)
      : [];
    return { open, siblings, openContentIds };
  });
}
/*__STUDIO_WORKER_END:loadOpenPipelineOutputPack__*/

export async function pipelineContentLabelsById(env, profile, contentIds) {
  const ids = [...new Set((contentIds || []).filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id || ""))))].sort();
  if (!ids.length) return new Map();
  const rows = await studioReadCoalesce(
    `content-labels:${profile?.id || "default"}:${ids.join(",")}`,
    30000,
    () => listPipelineContentByIds(env, ids, ["Content_ID", "Content_Title"]),
  );
  const labels = new Map();
  for (const row of rows || []) {
    if (row?.id) labels.set(row.id, row);
  }
  return labels;
}
/*__STUDIO_WORKER_END:pipelineContentLabelsById__*/

export async function readPipelineOutputsSnapshot(env, memoryKey, snapshotKey) {
  return readMappedListSnapshot(env, memoryKey, snapshotKey);
}
/*__STUDIO_WORKER_END:readPipelineOutputsSnapshot__*/

export async function writePipelineOutputsSnapshot(env, snapshotKey, payload) {
  const memoryKey = String(snapshotKey || "").replace(/^studio\/state\//, "outputs:");
  return writeMappedListSnapshot(env, memoryKey, snapshotKey, payload);
}
/*__STUDIO_WORKER_END:writePipelineOutputsSnapshot__*/

export async function buildPipelineOutputsPayloadFromSupabase(env, profile, { limit, reviewOnly, ctx = null } = {}) {
  const packed = await listSupabasePipelineOutputs(env, {
    profileAirtableId: profile.id,
    limit: reviewOnly ? Math.min(limit, 80) : limit,
    reviewOnly,
  });
  if (packed.profileMissing) {
    throw new Error(`Supabase content profile missing for ${profile.id}; run supabase sync`);
  }
  const records = packed.records;
  if (!reviewOnly) schedulePipelineListHeal(ctx, env, records);
  const [jobs, queueControls, activeHolds] = await Promise.all([
    loadStudioProductionJobsForOutputs(env, records).catch(() => new Map()),
    readOpsQueueControls(env).catch(() => ({})),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 16,
      fields: OUTPUT_LIST_FIELDS,
      filterFormula: STUDIO_RENDER_QUEUE_ACTIVE_FORMULA,
    }).catch(() => []),
  ]);
  const queueCandidates = await studioLoadRenderQueueCandidates(env, {
    limit: 100,
    fields: OUTPUT_LIST_FIELDS,
    controls: queueControls,
  }).catch(() => []);
  const { byId: renderQueueById, total: renderQueueTotal } = assignRenderQueuePositions(
    queueCandidates,
    f,
    { activeHolds, controls: queueControls },
  );
  return {
    records: records.map((record) => mapOutput(
      record,
      jobs.get(record),
      renderQueueById.get(record.id) || null,
      packed.contentByAirtableId.get(studioFirstLinkedId(f(record, "Content_Item"))) || null,
    )),
    profile: mapStudioContentProfile(profile),
    render_queue_total: renderQueueTotal,
    read_source: "supabase",
  };
}
/*__STUDIO_WORKER_END:buildPipelineOutputsPayloadFromSupabase__*/

export async function buildPipelineOutputsPayload(env, profile, { limit, reviewOnly, ctx = null } = {}) {
  if (studioReadSource(env) === "supabase") {
    try {
      return await buildPipelineOutputsPayloadFromSupabase(env, profile, { limit, reviewOnly, ctx });
    } catch (error) {
      console.warn("supabase pipeline list read failed; falling back to Airtable", error);
    }
  }
  const listOpts = {
    fields: OUTPUT_LIST_FIELDS,
    sortField: "Output_ID",
    sortDirection: "desc",
  };
  let records;
  if (reviewOnly) {
    const profileFormula = contentProfileFilterFormula(profile);
    const reviewFormula = 'AND({Test_Run_ID}=BLANK(),NOT({Do_Not_Publish}),OR({Output_Status}="Ready for Review",{Review_Status}="Review Sent"),{Review_Status}!="Approved",{Output_Status}!="Approved for Publishing",{Output_Status}!="Published")';
    records = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      ...listOpts, limit: Math.min(limit, 80),
      filterFormula: profileFormula ? `AND(${profileFormula},${reviewFormula})` : reviewFormula,
    });
  } else {
    const [newest, openPack] = await Promise.all([
      listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
        ...listOpts,
        limit,
        filterFormula: contentProfileFilterFormula(profile),
      }),
      loadOpenPipelineOutputPack(env, profile),
    ]);
    records = mergePipelineOutputRecords(newest, mergePipelineOutputRecords(openPack.open, openPack.siblings));
  }
  if (!reviewOnly) schedulePipelineListHeal(ctx, env, records);
  const [jobs, queueControls, activeHolds, labels] = await Promise.all([
    loadStudioProductionJobsForOutputs(env, records),
    readOpsQueueControls(env),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 16,
      fields: OUTPUT_LIST_FIELDS,
      filterFormula: STUDIO_RENDER_QUEUE_ACTIVE_FORMULA,
    }).catch(() => []),
    reviewOnly ? Promise.resolve(new Map()) : pipelineContentLabelsById(env, profile, studioPipelineContentIdsFromOutputs(records)),
  ]);
  const queueCandidates = await studioLoadRenderQueueCandidates(env, {
    limit: 100,
    fields: OUTPUT_LIST_FIELDS,
    controls: queueControls,
  }).catch(() => []);
  const { byId: renderQueueById, total: renderQueueTotal } = assignRenderQueuePositions(
    queueCandidates,
    f,
    { activeHolds, controls: queueControls },
  );
  return {
    records: records.map((record) => mapOutput(
      record,
      jobs.get(record),
      renderQueueById.get(record.id) || null,
      labels.get(studioFirstLinkedId(f(record, "Content_Item"))) || null,
    )),
    profile: mapStudioContentProfile(profile),
    render_queue_total: renderQueueTotal,
    read_source: "airtable",
  };
}

/*__STUDIO_WORKER_END:buildPipelineOutputsPayload__*/

export async function readStudioSupabaseSyncLast(env) {
  if (!env?.STUDIO_MEDIA?.get) return null;
  try {
    const object = await env.STUDIO_MEDIA.get(STUDIO_SUPABASE_SYNC_LAST_KEY);
    if (!object) return null;
    const body = await object.json();
    return body && typeof body === "object" ? body : null;
  } catch (error) {
    console.warn("supabase sync last read failed", error);
    return null;
  }
}
/*__STUDIO_WORKER_END:readStudioSupabaseSyncLast__*/

export async function writeStudioSupabaseSyncLast(env, payload) {
  if (!env?.STUDIO_MEDIA?.put || !payload) return;
  try {
    await env.STUDIO_MEDIA.put(STUDIO_SUPABASE_SYNC_LAST_KEY, JSON.stringify(payload), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (error) {
    console.warn("supabase sync last write failed", error);
  }
}
/*__STUDIO_WORKER_END:writeStudioSupabaseSyncLast__*/

export async function studioSyncSupabasePipelineReads(env, options = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  const profiles = (await listContentProfileRecords(env).catch(() => [])).filter((row) => Boolean(f(row, "Active")));
  const startedAt = new Date().toISOString();
  const result = await syncAllProfilesPipelineToSupabase(env, profiles, {
    listRecords,
    f,
    contentProfileFilterFormula,
    outputFields: OUTPUT_LIST_FIELDS,
    outputLimit: options.outputLimit,
    contentLimit: options.contentLimit,
    listOpenOutputs: async (profile) => {
      const pack = await loadOpenPipelineOutputPack(env, profile);
      return mergePipelineOutputRecords(pack.open || [], pack.siblings || []);
    },
  });
  const profileResults = Array.isArray(result?.results) ? result.results : [];
  const ok = profileResults.length > 0 && profileResults.every((row) => row?.ok || row?.skipped);
  const stamp = {
    at: Date.now(),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ok,
    profile_count: profileResults.length,
    profiles: profileResults.map((row) => ({
      profile_id: row.profile_id || null,
      ok: Boolean(row.ok),
      skipped: Boolean(row.skipped),
      content_items: row.content_items ?? null,
      platform_outputs: row.platform_outputs ?? null,
      newest_outputs: row.newest_outputs ?? null,
      open_outputs: row.open_outputs ?? null,
      error: row.error || null,
    })),
    read_source: studioReadSource(env),
  };
  await writeStudioSupabaseSyncLast(env, stamp);
  return { ...result, stamp };
}
/*__STUDIO_WORKER_END:studioSyncSupabasePipelineReads__*/

export async function getStudioSupabaseSyncStatus(request, env) {
  const last = await readStudioSupabaseSyncLast(env);
  return respond(request, env, {
    ok: true,
    configured: studioSupabaseConfigured(env),
    read_source: studioReadSource(env),
    read_routes: STUDIO_SUPABASE_PIPELINE_READ_ROUTES,
    last_sync: last,
  });
}
/*__STUDIO_WORKER_END:getStudioSupabaseSyncStatus__*/

export async function postStudioSupabaseSync(request, env) {
  if (!studioSupabaseConfigured(env)) {
    throw new HttpError(503, "Supabase is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  }
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const outputLimit = Number(payload?.output_limit || 500) || 500;
  const contentLimit = Number(payload?.content_limit || 250) || 250;
  const result = await studioSyncSupabasePipelineReads(env, { outputLimit, contentLimit });
  studioMarkMappedListDirty();
  return respond(request, env, {
    ok: true,
    read_source: studioReadSource(env),
    read_routes: STUDIO_SUPABASE_PIPELINE_READ_ROUTES,
    sync: result,
  });
}
/*__STUDIO_WORKER_END:postStudioSupabaseSync__*/

export async function warmOldestStudioReadSnapshot(env) {
  if (airtableCooldownWaitMs() > AIRTABLE_SLOT_FAIL_FAST_MS) return { skipped: "cooling" };
  const profiles = (await listContentProfileRecords(env)).filter((row) => Boolean(f(row, "Active")));
  let pick = null;
  for (const profile of profiles) {
    const memoryKey = `outputs:${profile.id}:250:full`;
    const snapshotKey = `studio/state/pipeline-list-${profile.id}-250-full.json`;
    const remembered = await readMappedListSnapshot(env, memoryKey, snapshotKey);
    const at = Number(remembered?.at) || 0;
    if (!pick || at < pick.at) pick = { profile, at };
  }
  if (!pick?.profile) return { skipped: "no-profile" };
  if (pick.at && Date.now() - pick.at < STUDIO_READ_SNAPSHOT_WARM_MS) {
    return { skipped: "fresh", age_ms: Date.now() - pick.at, profile_id: pick.profile.id };
  }
  const profile = pick.profile;
  const outputs = await buildPipelineOutputsPayload(env, profile, { limit: 250, reviewOnly: false });
  await writeMappedListSnapshot(
    env,
    `outputs:${profile.id}:250:full`,
    `studio/state/pipeline-list-${profile.id}-250-full.json`,
    outputs,
  );
  const ideas = await buildIdeasListPayload(env, profile, 100);
  await writeMappedListSnapshot(
    env,
    `ideas:${profile.id}:100`,
    `studio/state/ideas-list-${profile.id}-100.json`,
    ideas,
  );
  return { warmed: true, profile_id: profile.id };
}
/*__STUDIO_WORKER_END:warmOldestStudioReadSnapshot__*/

export async function listOutputs(request, env, url, authorization, ctx = null) {
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
  // QA-PIPELINE-NEWEST-MISSING: bypass potentially stale heavy snapshots with
  // a one-page live read of recent outputs scoped to this content profile.
  if (url.searchParams.get("mode") === "latest") {
    const key = `pipeline-latest:${profile.id}`;
    if (studioReadSource(env) === "supabase") {
      try {
        const packed = await studioReadCoalesce(key, 7000, () => listSupabasePipelineOutputs(env, {
          profileAirtableId: profile.id,
          limit: 60,
          reviewOnly: false,
        }));
        if (!packed.profileMissing) {
          const recent = (packed.records || []).slice(0, 60);
          return respond(request, env, {
            ok: true,
            fresh: true,
            records: recent.map((record) => mapOutput(
              record,
              null,
              null,
              packed.contentByAirtableId.get(studioFirstLinkedId(f(record, "Content_Item"))) || null,
            )),
            profile: mapStudioContentProfile(profile),
            read_source: "supabase",
          });
        }
      } catch (error) {
        console.warn("supabase pipeline latest read failed; falling back to Airtable", error);
      }
    }
    const recent = await studioReadCoalesce(key, 7000, () => listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      fields: OUTPUT_LIST_FIELDS,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: contentProfileFilterFormula(profile),
      limit: 60,
    }));
    // The lightweight latest path used to skip the Content Item label lookup,
    // so its mapped rows had content_number=null and the Pipeline could not
    // display Content ID even though the full snapshot already knew it.
    const labels = await pipelineContentLabelsById(
      env,
      profile,
      studioPipelineContentIdsFromOutputs(recent),
    );
    return respond(request, env, {
      ok: true,
      fresh: true,
      records: recent.map((record) => mapOutput(
        record,
        null,
        null,
        labels.get(studioFirstLinkedId(f(record, "Content_Item"))) || null,
      )),
      profile: mapStudioContentProfile(profile),
      read_source: "airtable",
    });
  }
  // Newest first, plus unfinished rows that would otherwise age out of the page.
  // CI 206 (Muscle Beach / outputs 887–892) disappeared once Output_ID hit 1133
  // while Pipeline only loaded the newest 100 rows. Fully complete packages stay
  // in Archive (UI partition) when still inside newest-N; aged complete packages
  // are not re-fetched.
  const limit = clampLimit(url, 200, 250);
  const reviewOnly = url.searchParams.get("mode") === "review";
  const memoryKey = `outputs:${profile.id}:${limit}:${reviewOnly ? "review" : "full"}`;
  const snapshotKey = `studio/state/pipeline-list-${profile.id}-${limit}-${reviewOnly ? "review" : "full"}.json`;
  // Return the Pipeline table immediately from R2/memory. Never wait on a live
  // Airtable scan — a miss returns empty + refreshing while waitUntil warms.
  return respondStudioMappedList(request, env, ctx, {
    memoryKey,
    snapshotKey,
    profile,
    ttlMs: PIPELINE_OUTPUT_LIST_CACHE_MS,
    allowRefresh: url.searchParams.get("refresh") !== "0",
    builder: () => buildPipelineOutputsPayload(env, profile, { limit, reviewOnly, ctx }),
  });
}

/*__STUDIO_WORKER_END:listOutputs__*/

export async function listMusic(request, env, url) {
  const limit = clampLimit(url, 100, 100);
  const payload = await studioReadCoalesce(`music:${limit}`, 60000, async () => {
  const [catalog, uploaded] = await Promise.all([
    listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
      limit,
      view: env.AIRTABLE_MUSIC_VIEW_ID || null,
    }),
    listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
      limit,
      filterFormula: "AND({Asset_Role}='Music',OR(FIND('studio/music-library',{Google Drive URL}),FIND('MUSIC-',{Studio_Transfer_ID})))",
    }).catch(() => []),
  ]);

  const seen = new Set();
  const records = [];
  for (const record of [...uploaded, ...catalog]) {
    if (!record?.id || seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }

  return { records: sortMusicRecords(records).map(mapMusic) };
  });
  return respond(request, env, { ok: true, ...payload });
}
/*__STUDIO_WORKER_END:listMusic__*/

export function musicSortName(record) {
  return String(cleanMusicDisplayName(f(record, "Asset Name")) || f(record, "Asset Name") || "").toLowerCase();
}
/*__STUDIO_WORKER_END:musicSortName__*/

export function sortMusicRecords(records) {
  return [...records].sort((left, right) => {
    const favoriteLeft = Boolean(f(left, "Studio_Favorite"));
    const favoriteRight = Boolean(f(right, "Studio_Favorite"));
    if (favoriteLeft !== favoriteRight) return favoriteLeft ? -1 : 1;
    return musicSortName(left).localeCompare(musicSortName(right));
  });
}
/*__STUDIO_WORKER_END:sortMusicRecords__*/

export async function toggleMusicFavorite(request, env, url) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  const recordId = String(url.pathname.split("/")[3] || "");
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) throw new HttpError(400, "Invalid music record");

  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  if (String(f(record, "Asset_Role") || "") !== "Music") {
    throw new HttpError(409, "Only music assets can be favorited");
  }

  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const favorite = Object.prototype.hasOwnProperty.call(payload || {}, "favorite")
    ? Boolean(payload.favorite)
    : !Boolean(f(record, "Studio_Favorite"));

  const updated = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({ fields: { Studio_Favorite: favorite }, typecast: true }),
  });
  return respond(request, env, { ok: true, record: mapMusic(updated) });
}
/*__STUDIO_WORKER_END:toggleMusicFavorite__*/

export async function findMusicLibraryUsages(env, recordId) {
  const needle = ideaLibraryAirtableEscape(recordId);
  const [requests, outputs, content] = await Promise.all([
    listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: 10,
      filterFormula: `FIND("${needle}", ARRAYJOIN({Selected_Music_Asset}))`,
    }).catch(() => []),
    listRecords(env, PRODUCTION_REQUEST_OUTPUT_TABLE, {
      limit: 10,
      filterFormula: `FIND("${needle}", ARRAYJOIN({Selected_Music_Asset_Override}))`,
    }).catch(() => []),
    env.AIRTABLE_CONTENT_TABLE_ID
      ? listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, {
          limit: 10,
          filterFormula: `FIND("${needle}", ARRAYJOIN({Preferred_Music_Asset}))`,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);
  return {
    production_requests: requests,
    production_request_outputs: outputs,
    content_items: content,
  };
}
/*__STUDIO_WORKER_END:findMusicLibraryUsages__*/

export async function trashStudioMusicOnDrive(env, fileId) {
  const driveId = String(fileId || "").trim();
  if (!driveId) return { ok: false, skipped: true, reason: "no_drive_file" };
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) return { ok: false, skipped: true, reason: "no_runner" };
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const response = await fetch(`${runnerUrl}/jobs/studio-music-library-delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify({ google_drive_file_id: driveId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: payload?.error || payload?.message || `Drive trash failed (${response.status})` };
  }
  return { ok: true, trashed: Boolean(payload?.trashed), google_drive_file_id: driveId };
}
/*__STUDIO_WORKER_END:trashStudioMusicOnDrive__*/

export async function deleteMusicLibraryTrack(request, env, url) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  const recordId = String(url.pathname.split("/")[3] || "");
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) throw new HttpError(400, "Invalid music record");

  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  if (String(f(record, "Asset_Role") || "") !== "Music") {
    throw new HttpError(409, "Only music assets can be deleted from Music Manager");
  }

  const usages = await findMusicLibraryUsages(env, recordId);
  const usedBy = [
    usages.production_requests.length ? `${usages.production_requests.length} Production Request${usages.production_requests.length === 1 ? "" : "s"}` : "",
    usages.production_request_outputs.length ? `${usages.production_request_outputs.length} output override${usages.production_request_outputs.length === 1 ? "" : "s"}` : "",
    usages.content_items.length ? `${usages.content_items.length} Content Item${usages.content_items.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  if (usedBy.length) {
    throw new HttpError(
      409,
      `Cannot delete this track. It is still selected on ${usedBy.join(", ")}. Unpick it there first. Marking Do Not Use in Airtable hides it from new picks without breaking remakes.`
    );
  }

  const driveId = googleDriveFileId(record);
  const drive = await trashStudioMusicOnDrive(env, driveId).catch((error) => ({
    ok: false,
    error: error?.message || String(error),
  }));

  const deleted = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId, {
    method: "DELETE",
  });

  return respond(request, env, {
    ok: true,
    deleted: Boolean(deleted?.deleted),
    record_id: recordId,
    name: f(record, "Asset Name"),
    drive,
  });
}
/*__STUDIO_WORKER_END:deleteMusicLibraryTrack__*/

export async function promoteStudioMusicToDrive(env, { filename, bytes, contentType }) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) {
    throw new HttpError(503, "Pipeline runner is required to store music in Google Drive");
  }
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const form = new FormData();
  form.set("filename", filename);
  form.set("file", new Blob([bytes], { type: contentType || "audio/mpeg" }), filename);
  const response = await fetch(`${runnerUrl}/jobs/studio-music-library`, {
    method: "POST",
    headers: {
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  const fileId = String(payload?.google_drive_file_id || "").trim();
  const driveUrl = String(payload?.google_drive_url || "").trim();
  if (!response.ok || !fileId || !driveUrl) {
    throw new HttpError(
      response.status >= 400 ? response.status : 502,
      payload?.error || payload?.message || "Google Drive music upload failed"
    );
  }
  return {
    google_drive_file_id: fileId,
    google_drive_url: driveUrl,
    web_view_link: String(payload.web_view_link || `https://drive.google.com/file/d/${fileId}/view`),
    folder_id: String(payload.folder_id || GDRIVE_MUSIC_FOLDER_ID),
    file_size_bytes: Number(payload.file_size_bytes || 0) || null,
    Leading_Silence_Status: payload.Leading_Silence_Status || payload.leading_silence_status || null,
    Leading_Silence_Removed_Seconds: payload.Leading_Silence_Removed_Seconds ?? payload.leading_silence_removed_seconds ?? null,
    Leading_Silence_Processed_At: payload.Leading_Silence_Processed_At || null,
  };
}
/*__STUDIO_WORKER_END:promoteStudioMusicToDrive__*/

export async function uploadMusicLibraryTracks(request, env, authorization) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  if (!String(env.PIPELINE_RUNNER_URL || "").trim()) {
    throw new HttpError(503, "Pipeline runner is required to store music in Google Drive");
  }

  let form;
  try { form = await request.formData(); } catch { throw new HttpError(400, "Could not read uploaded music"); }
  const files = form.getAll("files").filter((value) => value && typeof value.arrayBuffer === "function");
  if (!files.length) throw new HttpError(400, "Choose at least one MP3 or WAV file");
  if (files.length > MUSIC_LIBRARY_MAX_FILES) {
    throw new HttpError(400, `Upload no more than ${MUSIC_LIBRARY_MAX_FILES} audio files at once`);
  }

  const displayName = String(form.get("display_name") || "").trim();
  const description = String(form.get("description") || "").trim();
  for (const file of files) {
    if (!isMusicLibraryFile(file)) {
      throw new HttpError(415, `${file.name || "A file"} is not an MP3 or WAV. Upload .mp3 or .wav files.`);
    }
    if (Number(file.size || 0) > MUSIC_LIBRARY_MAX_FILE_BYTES) {
      throw new HttpError(413, `${file.name || "A track"} exceeds the 40 MB per-file limit`);
    }
  }

  const uploaded = [];
  for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
      const safeName = item4SafeFileName(file.name || "track.mp3");
      const sourceExt = item4FileExtension(file.name) === "wav" ? "wav" : "mp3";
      const assetName = files.length === 1 && displayName
        ? displayName
        : String(file.name || safeName).replace(/\.(mp3|wav)$/i, "");
      const sourceName = `${assetName || "Studio music track"}.${sourceExt}`;
      const bytes = await file.arrayBuffer();
      const drive = await promoteStudioMusicToDrive(env, {
        filename: sourceName,
        bytes,
        contentType: sourceExt === "wav" ? "audio/wav" : "audio/mpeg",
      });
      const created = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, "", {
        method: "POST",
        body: JSON.stringify({
          records: [{
            fields: {
              "Asset Name": assetName || "Studio music track",
              Media_Class: "Audio",
              "Google Drive URL": drive.google_drive_url,
              "Google Drive File ID": drive.google_drive_file_id,
              MIME_Type: "audio/mpeg",
              File_Extension: "mp3",
              File_Size_Bytes: Number(drive.file_size_bytes || file.size || 0) || null,
              Leading_Silence_Status: drive.Leading_Silence_Status || null,
              Leading_Silence_Removed_Seconds: drive.Leading_Silence_Removed_Seconds,
              Leading_Silence_Processed_At: drive.Leading_Silence_Processed_At || null,
              Intake_Status: "Created",
              Intake_Date: new Date().toISOString(),
              Drive_Access_Status: "Public",
              Classification_Status: "Classified",
              Asset_Status: "Available",
              Active: true,
              Do_Not_Use: false,
              Capture_Source: "Client Provided",
              Rights_Status: "Owned",
              Asset_Role: "Music",
              Raw_Source_Eligibility: "Not Applicable",
              Asset_Description: description || "Studio Music Manager upload stored in Google Drive Assets/Music.",
              Studio_Transfer_ID: `MUSIC-${id}`,
            },
          }],
          typecast: true,
        }),
      });
      const record = Array.isArray(created?.records) ? created.records[0] : null;
      if (!record?.id) throw new HttpError(502, "Music was stored, but the catalog record was not created");
      uploaded.push(mapMusic(record));
  }

  return respond(request, env, {
    ok: true,
    uploaded: uploaded.length,
    records: uploaded,
    message: uploaded.length === 1
      ? "Track added to Music Manager."
      : `${uploaded.length} tracks added to Music Manager.`,
  }, 201);
}
/*__STUDIO_WORKER_END:uploadMusicLibraryTracks__*/

export function coerceLibraryDurationSeconds(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 12 * 60 * 60) return null;
  return rounded;
}
/*__STUDIO_WORKER_END:coerceLibraryDurationSeconds__*/

export function publishedLibraryFilterFormula(query) {
  const parts = [PUBLISHED_LIBRARY_LIST_FORMULA];
  const needle = String(query || "").trim().toLowerCase();
  if (needle) {
    const escaped = ideaLibraryAirtableEscape(needle);
    const hay = "LOWER(CONCATENATE({Output_Title},' ',{Platform},' ',{Platform_Output_Type},' ',{Studio_Output_Type},' ',{Output_Filename}))";
    parts.push(`FIND("${escaped}", ${hay})`);
  }
  return parts.length === 1 ? parts[0] : `AND(${parts.join(",")})`;
}
/*__STUDIO_WORKER_END:publishedLibraryFilterFormula__*/

export function publishedFinalFileId(record) {
  return String(
    f(record, "Final_File_ID")
    || extractGoogleDriveFileId(f(record, "Final_File_URL"))
    || extractGoogleDriveFileId(f(record, "Output_URL"))
    || ""
  ).trim();
}
/*__STUDIO_WORKER_END:publishedFinalFileId__*/

export function publishedDurationSeconds(record) {
  const stored = Number(f(record, "Duration_Seconds") || 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const frames = Number(f(record, "Render_Total_Frames") || 0);
  if (Number.isFinite(frames) && frames > 0) return Math.round(frames / 30);
  return null;
}
/*__STUDIO_WORKER_END:publishedDurationSeconds__*/

export function collectJsonDriveIds(raw, { finishedOnly = false } = {}) {
  const ids = [];
  let parsed = raw;
  if (typeof raw === "string" && raw.trim()) {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
  }
  const walk = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object") return;
    const source = String(value.source || value.authority || "").toLowerCase();
    const transfer = String(value.transfer_id || value.Transfer_ID || "").trim();
    const isMaster = source.includes("finished_passthrough")
      || source.includes("studio_master")
      || transfer.startsWith("ITEM4-MASTER")
      || transfer.startsWith("STUDIO_MASTER");
    if (!finishedOnly || isMaster) {
      const driveId = String(value.google_drive_file_id || value.googleDriveFileId || "").trim();
      if (driveId) ids.push(driveId);
    }
    Object.values(value).forEach((child) => {
      if (child && typeof child === "object") walk(child);
    });
  };
  walk(parsed);
  return [...new Set(ids)];
}
/*__STUDIO_WORKER_END:collectJsonDriveIds__*/

export function publicMediaObjectKey(urlOrKey) {
  let path = String(urlOrKey || "").trim();
  if (!path) return "";
  const host = `${ITEM4_MEDIA_PUBLIC_BASE}/`;
  if (path.startsWith(host)) path = path.slice(host.length);
  path = path.split("?")[0].replace(/^\/+/, "");
  if (!path || /\.(jpe?g|png|webp|gif)$/i.test(path)) return "";
  if (path.startsWith("studio/previews/") || path.startsWith("publish/") || path.startsWith("studio/master-assets/")) return path;
  return "";
}
/*__STUDIO_WORKER_END:publicMediaObjectKey__*/

export function publishedLibraryObjectKey(record) {
  const candidates = [
    f(record, "Studio_Preview_R2_Key"),
    f(record, "Studio_Preview_URL"),
    f(record, "Publish_Asset_URL"),
    f(record, "Final_File_URL"),
  ];
  for (const value of candidates) {
    const key = publicMediaObjectKey(value);
    if (key) return key;
  }
  return "";
}
/*__STUDIO_WORKER_END:publishedLibraryObjectKey__*/

export async function attachPublishedLibraryFileSizes(env, records, mapped) {
  if (!Array.isArray(mapped) || !mapped.length) return mapped;
  await Promise.all(mapped.map(async (row, index) => {
    if (Number(row?.file_size_bytes || 0) > 0) return;
    const key = publishedLibraryObjectKey(records[index]);
    if (!key) return;
    if (env?.STUDIO_MEDIA) {
      const object = await env.STUDIO_MEDIA.head(key).catch(() => null);
      const size = Number(object?.size || 0);
      if (size > 0) {
        row.file_size_bytes = size;
        return;
      }
    }
    const href = `${ITEM4_MEDIA_PUBLIC_BASE}/${key}`;
    const probe = await fetch(href, { method: "HEAD", redirect: "follow" }).catch(() => null);
    const length = Number(probe?.headers?.get("Content-Length") || 0);
    if (length > 0) row.file_size_bytes = length;
  }));
  return mapped;
}
/*__STUDIO_WORKER_END:attachPublishedLibraryFileSizes__*/

export function mapPublishedLibraryFile(record) {
  const platform = String(f(record, "Platform") || "").trim();
  const outputType = String(f(record, "Platform_Output_Type") || f(record, "Studio_Output_Type") || "").trim();
  const title = String(f(record, "Output_Title") || "").trim() || [platform, outputType].filter(Boolean).join(" ") || "Published file";
  const finalFileId = publishedFinalFileId(record);
  const finalFileUrl = String(f(record, "Final_File_URL") || f(record, "Output_URL") || "").trim();
  const fileReleased = !finalFileId && !String(f(record, "Final_File_URL") || "").trim();
  const nativeStill = studioOutputIsNativePhoto(record) && !finalFileId;
  const duration = nativeStill ? null : publishedDurationSeconds(record);
  return {
    record_type: "platform_output",
    id: record.id,
    name: title,
    platform: platform || null,
    platform_output_type: outputType || null,
    aspect_ratio: String(f(record, "Aspect_Ratio") || "").trim() || null,
    published_at: f(record, "Published_At") || null,
    platform_post_url: String(f(record, "Platform_Post_URL") || "").trim() || null,
    platform_post_id: String(f(record, "Platform_Post_ID") || "").trim() || null,
    final_file_id: finalFileId || null,
    final_file_url: fileReleased ? null : (finalFileUrl || null),
    studio_preview_url: String(f(record, "Studio_Preview_URL") || "").trim() || null,
    thumbnail_url: String(f(record, "Thumbnail_URL") || "").trim() || null,
    duration_seconds: duration,
    file_size_bytes: ideaLibraryFileBytes(record) || null,
    file_released: fileReleased,
    media_kind: nativeStill ? "photo" : "video",
    output_status: String(f(record, "Output_Status") || "").trim() || null,
    output_filename: String(f(record, "Output_Filename") || "").trim() || null,
  };
}
/*__STUDIO_WORKER_END:mapPublishedLibraryFile__*/

export function publishedFileReleaseGuard(record, { masterDriveIds = [] } = {}) {
  if (!String(f(record, "Published_At") || "").trim()) {
    return { ok: false, status: 409, error: "Only published Platform Outputs can release a Drive copy." };
  }
  if (!String(f(record, "Platform_Post_URL") || "").trim() && !String(f(record, "Platform_Post_ID") || "").trim()) {
    return { ok: false, status: 409, error: "This output has no live post URL or platform post ID, so the Drive copy cannot be removed yet." };
  }
  const outputStatus = String(f(record, "Output_Status") || "").trim().toLowerCase();
  const renderStatus = String(f(record, "Render_Status") || "").trim().toLowerCase();
  if (outputStatus === "in production" || outputStatus === "rendering" || renderStatus === "rendering") {
    return { ok: false, status: 409, error: "This output is still in production or rendering, so the Drive copy cannot be removed." };
  }
  const finalFileId = publishedFinalFileId(record);
  const finalFileUrl = String(f(record, "Final_File_URL") || "").trim();
  if (!finalFileId && !finalFileUrl) {
    return { ok: true, already_released: true };
  }
  const masters = new Set((masterDriveIds || []).map((id) => String(id || "").trim()).filter(Boolean));
  if (finalFileId && masters.has(finalFileId)) {
    return {
      ok: false,
      status: 409,
      error: "This Drive file is the Production Request master (ITEM4-MASTER / STUDIO_MASTER). Only a dedicated final-output file can be removed.",
    };
  }
  return { ok: true, final_file_id: finalFileId || null, already_released: false };
}
/*__STUDIO_WORKER_END:publishedFileReleaseGuard__*/

export async function collectPublishedMasterDriveIds(env, record) {
  const ids = new Set(collectJsonDriveIds(f(record, "Selected_Assets_JSON"), { finishedOnly: true }));
  collectJsonDriveIds(f(record, "Render_Clip_List_JSON"), { finishedOnly: true }).forEach((id) => ids.add(id));
  const outputRowId = studioFirstLinkedId(f(record, "Production_Request_Output"));
  if (outputRowId) {
    const outputRow = await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, outputRowId).catch(() => null);
    const requestId = studioFirstLinkedId(f(outputRow, "Production_Request"));
    if (requestId) {
      const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId).catch(() => null);
      for (const asset of item4AssetManifest(requestRecord || {})) {
        const driveId = String(asset?.google_drive_file_id || "").trim();
        if (driveId) ids.add(driveId);
      }
    }
  }
  return [...ids];
}
/*__STUDIO_WORKER_END:collectPublishedMasterDriveIds__*/

export async function listPublishedLibraryFiles(request, env, url) {
  if (!env.AIRTABLE_OUTPUT_TABLE_ID) throw new HttpError(503, "Platform Outputs table is not configured");
  const query = String(url.searchParams.get("q") || "").trim();
  const requestedLimit = Number(url.searchParams.get("limit"));
  const limit = Math.max(1, Math.min(ASSET_LIBRARY_MAX_PAGE_SIZE, Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : ASSET_LIBRARY_PAGE_SIZE));
  const offset = String(url.searchParams.get("offset") || "").trim() || null;
  const addedFrom = parseLibraryDateParam(url.searchParams.get("added_from"));
  const addedTo = parseLibraryDateParam(url.searchParams.get("added_to"));
  const sort = resolveLibraryListSort(url.searchParams.get("sort"), { published: true });
  const page = await listRecordsPage(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit,
    offset,
    sortField: sort.sortField,
    sortDirection: sort.sortDirection,
    filterFormula: combineAirtableFormulas(
      publishedLibraryFilterFormula(query),
      libraryAddedDateFilterFormula(addedFrom, addedTo, "Published_At"),
    ),
  });
  const mapped = await attachPublishedLibraryFileSizes(env, page.records, page.records.map(mapPublishedLibraryFile));
  return respond(request, env, {
    ok: true,
    idle: false,
    query: query || null,
    kind: "published",
    sort: sort.sort,
    added_from: addedFrom,
    added_to: addedTo,
    count: mapped.length,
    has_more: Boolean(page.offset),
    offset: page.offset || null,
    limit,
    records: mapped,
  });
}
/*__STUDIO_WORKER_END:listPublishedLibraryFiles__*/

export async function readLibraryCrossScopeSetting(env) {
  const row = await studioSettingsByName(env, LIBRARY_CROSS_SCOPE_SETTING).catch(() => null);
  return libraryCrossScopeEnabled(f(row, "Setting_Value"));
}
/*__STUDIO_WORKER_END:readLibraryCrossScopeSetting__*/

export async function resolveLibraryCrossScope(env, url, { useSetting = true } = {}) {
  if (!useSetting) return resolveAssetManagerCrossScopeFlag(url);
  const settingEnabled = await readLibraryCrossScopeSetting(env);
  return resolveLibraryCrossScopeFlag(url, settingEnabled ? "1" : "0");
}
/*__STUDIO_WORKER_END:resolveLibraryCrossScope__*/

export async function mediaAssetProfileScopeForId(env, profileId, {
  crossScope = false,
  includeUnscoped = true,
} = {}) {
  const id = String(profileId || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(id)) {
    return mediaAssetProfileScopeFormula("", { crossScope, includeUnscoped });
  }
  const profiles = await listContentProfileRecords(env).catch(() => []);
  const profile = profiles.find((row) => row.id === id) || null;
  return mediaAssetProfileScopeFormula(id, {
    crossScope,
    includeUnscoped,
    profileName: f(profile, "Profile_Name") || "",
  });
}
/*__STUDIO_WORKER_END:mediaAssetProfileScopeForId__*/

export async function resolveLibraryScopeProfileId(env, authorization, url, { idea = null, profileId = null } = {}) {
  if (profileId && /^rec[A-Za-z0-9]+$/.test(String(profileId))) return String(profileId);
  if (idea) {
    const fromIdea = firstLinkedRecordId(f(idea, "Content_Profile"));
    if (fromIdea) return fromIdea;
  }
  if (!authorization) return "";
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
  return profile?.id || "";
}
/*__STUDIO_WORKER_END:resolveLibraryScopeProfileId__*/

export async function resolveLibraryScopeProfile(env, authorization, url, options = {}) {
  const profileId = await resolveLibraryScopeProfileId(env, authorization, url, options);
  if (!profileId) return null;
  if (authorization) {
    try {
      const working = await resolveWorkingContentProfile(env, authorization, profileId);
      if (working?.id === profileId) return working;
    } catch {}
  }
  const profiles = await listContentProfileRecords(env).catch(() => []);
  return profiles.find((row) => row.id === profileId) || { id: profileId, fields: {} };
}
/*__STUDIO_WORKER_END:resolveLibraryScopeProfile__*/

export async function libraryProfileScopeFormula(env, authorization, url, options = {}) {
  const crossScope = options.crossScope != null
    ? Boolean(options.crossScope)
    : await resolveLibraryCrossScope(env, url);
  const profile = await resolveLibraryScopeProfile(env, authorization, url, options);
  return mediaAssetProfileScopeFormula(profile?.id || "", {
    crossScope,
    includeUnscoped: options.includeUnscoped !== false,
    profileName: f(profile, "Profile_Name") || "",
  });
}
/*__STUDIO_WORKER_END:libraryProfileScopeFormula__*/

export function assetLibraryFilterFormula(query, kind, needsProfile = false) {
  const parts = [ASSET_LIBRARY_LIST_FORMULA];
  const normalizedKind = String(kind || "").trim().toLowerCase();
  if (normalizedKind === "video") parts.push("{Media_Class}='Video'");
  const needsProfileFlag = needsProfile || normalizedKind === "needs_profile";
  if (normalizedKind === "photo" || normalizedKind === "image") {
    parts.push("OR({Media_Class}='Image',{Media_Class}='Graphic')");
  }
  if (needsProfileFlag) {
    parts.push("{Content_Profile}=BLANK()");
    parts.push("OR({Classification_Status}='Needs Classification',{Classification_Status}='Classification Error')");
  }
  const phrase = libraryQuotedPhrase(query);
  if (phrase) {
    parts.push(libraryAssetNameFindFormula(phrase));
  } else {
    // Token OR — full-string FIND("prospect parked") misses "Prospect Park".
    // Prefer strong tokens so weak words like "parked" do not empty the scan.
    const keys = ideaLibrarySearchFilterKeys(ideaLibraryTokens(query)).slice(0, 10);
    if (keys.length) {
      const hay = "LOWER(CONCATENATE({Search_Keywords},' ',{AI_Tags},' ',{Location},' ',{Asset Name},' ',{Topic},' ',{Subtopic},' ',{Asset_Description}))";
      const clauses = keys.map((key) => `FIND("${ideaLibraryAirtableEscape(String(key).toLowerCase())}", ${hay})`);
      parts.push(clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`);
    }
  }
  return `AND(${parts.join(",")})`;
}
/*__STUDIO_WORKER_END:assetLibraryFilterFormula__*/

export function mapLibraryAsset(record, profilesById = {}) {
  const video = ideaLibraryIsEligibleVideo(record)
    || String(f(record, "Media_Class") || "").trim().toLowerCase() === "video"
    || String(f(record, "MIME_Type") || "").trim().toLowerCase().startsWith("video/");
  const transferId = String(f(record, "Studio_Transfer_ID") || "");
  const doNotUse = Boolean(f(record, "Do_Not_Use"));
  const sizeBytes = ideaLibraryFileBytes(record);
  const profileId = firstLinkedRecordId(f(record, "Content_Profile"));
  const profile = profileId ? profilesById[profileId] : null;
  return {
    record_type: "media_asset",
    id: record.id,
    name: f(record, "Asset Name"),
    media_kind: video ? "video" : "photo",
    mime_type: String(f(record, "MIME_Type") || "").trim() || null,
    duration_seconds: Number(f(record, "Duration_Seconds") || 0) || null,
    file_size_bytes: sizeBytes || null,
    file_size_mb: sizeBytes ? Math.round((sizeBytes / 1048576) * 100) / 100 : null,
    location: f(record, "Location") || null,
    description: f(record, "Asset_Description") || null,
    google_drive_file_id: googleDriveFileId(record),
    google_drive_url: String(f(record, "Google Drive URL") || "").trim() || null,
    preview_path: `/api/media-assets/${record.id}/preview`,
    preview_url: `/api/media-assets/${record.id}/preview`,
    status: f(record, "Asset_Status"),
    rights_status: f(record, "Rights_Status"),
    do_not_use: doNotUse,
    studio_uploaded: transferId.startsWith("LIB-"),
    intake_date: ideaLibraryIntakeDate(record) || null,
    classification_status: String(f(record, "Classification_Status") || "").trim() || null,
    content_profile_id: profileId || null,
    content_profile_name: profile ? String(f(profile, "Profile_Name") || "").trim() || null : null,
  };
}
/*__STUDIO_WORKER_END:mapLibraryAsset__*/

export async function listAssetLibrary(request, env, url, authorization) {
  const kind = String(url.searchParams.get("kind") || "").trim().toLowerCase();
  if (kind === "published") return listPublishedLibraryFiles(request, env, url);
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  const query = String(url.searchParams.get("q") || "").trim();
  const requestedIds = parseLibraryRecordIdsParam(url.searchParams.get("ids"));
  const needsProfile = ["1", "true", "yes"].includes(String(url.searchParams.get("needs_profile") || "").trim().toLowerCase())
    || kind === "needs_profile";
  const requestedLimit = Number(url.searchParams.get("limit"));
  const limit = Math.max(1, Math.min(ASSET_LIBRARY_MAX_PAGE_SIZE, Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : ASSET_LIBRARY_PAGE_SIZE));
  const offset = requestedIds.length ? null : (String(url.searchParams.get("offset") || "").trim() || null);
  const addedFrom = parseLibraryDateParam(url.searchParams.get("added_from"));
  const addedTo = parseLibraryDateParam(url.searchParams.get("added_to"));
  const sort = resolveLibraryListSort(url.searchParams.get("sort"), { published: false });
  const crossScope = await resolveLibraryCrossScope(env, url, { useSetting: false });
  const scopedProfileId = requestedIds.length || needsProfile || crossScope
    ? ""
    : await resolveLibraryScopeProfileId(env, authorization, url);
  const scopeFormula = requestedIds.length || needsProfile
    ? null
    : await libraryProfileScopeFormula(env, authorization, url, { includeUnscoped: false, crossScope });
  const [page, profiles] = await Promise.all([
    listRecordsPage(env, env.AIRTABLE_MEDIA_TABLE_ID, {
      limit: requestedIds.length ? Math.min(ASSET_LIBRARY_MAX_PAGE_SIZE, Math.max(requestedIds.length, 1)) : limit,
      offset,
      sortField: requestedIds.length ? undefined : sort.sortField,
      sortDirection: requestedIds.length ? undefined : sort.sortDirection,
      filterFormula: requestedIds.length
        ? libraryRecordIdsFilterFormula(requestedIds)
        : combineAirtableFormulas(
          assetLibraryFilterFormula(query, needsProfile ? "" : kind, needsProfile),
          libraryAddedDateFilterFormula(addedFrom, addedTo, "Added_At"),
          scopeFormula,
        ),
    }),
    listContentProfileRecords(env).catch(() => []),
  ]);
  const profilesById = Object.fromEntries((profiles || []).map((row) => [row.id, row]));
  const mapped = page.records
    .filter((record) => !/__\d+x\d+__/i.test(String(f(record, "Asset Name") || "")))
    .map((record) => mapLibraryAsset(record, profilesById))
    .filter((row) => !scopedProfileId || row.content_profile_id === scopedProfileId);
  return respond(request, env, {
    ok: true,
    idle: false,
    query: query || null,
    ids: requestedIds.length ? requestedIds : null,
    kind: kind || null,
    needs_profile: needsProfile || null,
    sort: sort.sort,
    added_from: addedFrom,
    added_to: addedTo,
    count: mapped.length,
    has_more: Boolean(page.offset),
    offset: page.offset || null,
    limit,
    cross_scope: crossScope,
    content_profile_id: scopedProfileId || null,
    records: mapped,
  });
}
/*__STUDIO_WORKER_END:listAssetLibrary__*/

export async function promoteStudioAssetToDrive(env, { filename, bytes, contentType, profileName = "" }) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) {
    throw new HttpError(503, "Pipeline runner is required to store assets in Google Drive");
  }
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const form = new FormData();
  form.set("filename", filename);
  form.set("mime_type", contentType || "");
  form.set("profile_name", String(profileName || ""));
  form.set("file", new Blob([bytes], { type: contentType || "application/octet-stream" }), filename);
  let response;
  try {
    response = await fetch(`${runnerUrl}/jobs/studio-asset-library`, {
      method: "POST",
      headers: {
        ...(secret ? { "X-Pipeline-Secret": secret } : {}),
      },
      body: form,
    });
  } catch (error) {
    throw new HttpError(
      503,
      `Pipeline runner unreachable for Google Drive upload (${error instanceof Error ? error.message : "network error"}). Confirm Pipeline Runner is running on Windows.`
    );
  }
  const payload = await response.json().catch(() => ({}));
  const fileId = String(payload?.google_drive_file_id || "").trim();
  const driveUrl = String(payload?.google_drive_url || "").trim();
  if (!response.ok || !fileId || !driveUrl) {
    throw new HttpError(
      response.status >= 400 ? response.status : 502,
      payload?.error || payload?.message || `Google Drive asset upload failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:promoteStudioAssetToDrive__*/

export async function listLibraryBatchExistingNames(env, baseName, scopeFormula = null) {
  const filterFormula = combineAirtableFormulas(libraryBatchNameFilterFormula(baseName), scopeFormula);
  if (!filterFormula) return [];
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
    limit: 500,
    filterFormula,
    fields: ["Asset Name"],
  }).catch(() => []);
  // Strip .jpg/.mp4/etc so the highest stem wins across photo and clip uploads.
  return records
    .map((record) => stripLibraryAssetExtension(f(record, "Asset Name")))
    .filter(Boolean);
}
/*__STUDIO_WORKER_END:listLibraryBatchExistingNames__*/

export async function uploadAssetLibraryItems(request, env, authorization, ctx) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  if (!String(env.PIPELINE_RUNNER_URL || "").trim()) {
    throw new HttpError(503, "Pipeline runner is required to store assets in Google Drive");
  }
  const url = new URL(request.url);
  let form;
  try { form = await request.formData(); } catch { throw new HttpError(400, "Could not read uploaded files"); }
  const requestedUploadProfile = resolveLibraryUploadProfileId({
    formProfileId: form.get("content_profile_id") || form.get("profile"),
    urlProfileId: url.searchParams.get("profile"),
  });
  if (!requestedUploadProfile.ok) throw new HttpError(400, requestedUploadProfile.error);
  const uploadProfile = await resolveWorkingContentProfile(env, authorization, requestedUploadProfile.profileId);
  if (!uploadProfile?.id) throw new HttpError(409, "Choose a Content Profile before uploading assets");
  const files = form.getAll("files").filter((value) => value && typeof value.arrayBuffer === "function");
  if (!files.length) throw new HttpError(400, "Choose at least one photo or video clip");
  if (files.length > ASSET_LIBRARY_MAX_FILES) {
    throw new HttpError(400, `Upload no more than ${ASSET_LIBRARY_MAX_FILES} files at once`);
  }
  const location = String(form.get("location") || "").trim();
  const description = String(form.get("description") || "").trim();
  const formDuration = coerceLibraryDurationSeconds(form.get("duration_seconds"));
  const rawBatchName = String(form.get("batch_name") || form.get("display_name") || "").trim();
  let batchBase = null;
  let batchNames = null;
  if (rawBatchName) {
    const normalized = normalizeLibraryBatchBase(rawBatchName);
    if (!normalized.ok) throw new HttpError(400, normalized.error);
    batchBase = normalized.name;
    const scopeFormula = mediaAssetProfileScopeFormula(uploadProfile.id, {
      crossScope: false,
      includeUnscoped: false,
      profileName: f(uploadProfile, "Profile_Name") || "",
    });
    const existingNames = await listLibraryBatchExistingNames(env, batchBase, scopeFormula);
    batchNames = allocateLibraryBatchNames(batchBase, files.length, existingNames);
    if (batchNames.length !== files.length) {
      throw new HttpError(500, "Could not allocate sequential asset names");
    }
  }
  for (const file of files) {
    const isVideo = item4IsSupportedVideoFile(file);
    const isImage = item4IsSupportedImageFile(file);
    if (!isVideo && !isImage) {
      throw new HttpError(415, `${file.name || "A file"} is not a supported photo or video clip.`);
    }
    const limit = isVideo ? ITEM4_MAX_CLIP_FILE_BYTES : ITEM4_MAX_FILE_BYTES;
    if (Number(file.size || 0) > limit) {
      throw new HttpError(413, isVideo
        ? `${file.name || "A file"} exceeds the 200 MB clip limit`
        : `${file.name || "An image"} exceeds the 25 MB per-image limit`);
    }
  }
  const uploaded = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
    const extension = item4FileExtension(file.name);
    const assetName = batchNames
      ? batchNames[index]
      : (String(file.name || "").replace(/\.[^.]+$/, "") || "Studio library asset");
    const driveFilename = batchNames
      ? libraryDriveFilename(assetName, extension)
      : item4SafeFileName(file.name || "asset");
    const isVideo = item4IsSupportedVideoFile(file);
    const bytes = await file.arrayBuffer();
    const drive = await promoteStudioAssetToDrive(env, {
      filename: driveFilename,
      bytes,
      contentType: item4NormalizedMimeType(file),
      profileName: f(uploadProfile, "Profile_Name") || "",
    });
    if (studioProfileRequiresChicagoWatermark(uploadProfile) && !drive?.watermarked) {
      throw new HttpError(
        503,
        "ChicagoShining watermarking is not active on the Pipeline Runner. The asset was not added to the Studio library."
      );
    }
    const durationSeconds = isVideo
      ? (coerceLibraryDurationSeconds(drive.duration_seconds) || formDuration)
      : null;
    const created = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, "", {
      method: "POST",
      body: JSON.stringify({
        records: [{
          fields: {
            "Asset Name": assetName,
            Media_Class: isVideo ? "Video" : "Image",
            "Google Drive URL": drive.google_drive_url,
            "Google Drive File ID": drive.google_drive_file_id,
            MIME_Type: drive.mime_type || item4NormalizedMimeType(file),
            File_Extension: item4FileExtension(drive.filename || driveFilename) || extension,
            File_Size_Bytes: Number(drive.file_size_bytes || file.size || 0) || null,
            Duration_Seconds: durationSeconds,
            Intake_Status: "Created",
            Intake_Date: new Date().toISOString(),
            Drive_Access_Status: "Public",
            Classification_Status: "Processing",
            Asset_Status: "Available",
            Active: true,
            Do_Not_Use: false,
            Capture_Source: "Self Filmed",
            Rights_Status: "Owned",
            Asset_Role: isVideo ? "Raw Footage" : "Other",
            Raw_Source_Eligibility: isVideo ? "Eligible" : "Not Applicable",
            Location: location || null,
            Asset_Description: [
              description,
              drive.watermarked
                ? `[watermarked:${String(drive.watermark_profile || f(uploadProfile, "Profile_Name") || "ChicagoShining")}] Source master Drive ID: ${String(drive.source_google_drive_file_id || "").trim()}`
                : "",
            ].filter(Boolean).join("\n") || "Studio Asset Manager upload stored in Google Drive.",
            Studio_Transfer_ID: `LIB-${id}`,
            Content_Profile: [uploadProfile.id],
          },
        }],
        typecast: true,
      }),
    });
    let record = Array.isArray(created?.records) ? created.records[0] : null;
    if (!record?.id) throw new HttpError(502, "The file was stored, but the catalog record was not created");
    if (firstLinkedRecordId(f(record, "Content_Profile")) !== uploadProfile.id) {
      const repaired = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, record.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: { Content_Profile: [uploadProfile.id] },
          typecast: true,
        }),
      });
      record = repaired || record;
    }
    if (firstLinkedRecordId(f(record, "Content_Profile")) !== uploadProfile.id) {
      throw new HttpError(502, "The file was stored, but the Content Profile was not stamped");
    }
    uploaded.push(mapLibraryAsset(record));
  }
  const uploadedIds = uploaded.map((row) => row?.id).filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
  if (uploadedIds.length) {
    try {
      await stampLibraryAssetsClassifying(env, uploadedIds);
    } catch (error) {
      console.warn("library upload stamp Processing failed", error?.message || String(error));
    }
    const classify = (async () => {
      try {
        const { response, payload } = await item4PulsePipelineStage(env, "a3", {
          extra: {
            record_ids: uploadedIds,
            trigger_a4: false,
            wait_for_next: false,
            drain: false,
            background: true,
          },
        }, "A3");
        if (!response.ok || payload?.status === "error") {
          console.warn("library upload classify failed", payload?.message || payload?.error || response.status);
        }
      } catch (error) {
        console.warn("library upload classify failed", error?.message || String(error));
      }
    })();
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(classify);
    else await classify.catch(() => {});
  }
  const namedMessage = batchBase && uploaded.length
    ? (uploaded.length === 1
      ? `Added as ${uploaded[0]?.name || batchNames[0]}.`
      : `Added ${uploaded.length} assets as ${batchNames[0]}–${batchNames[batchNames.length - 1]}.`)
    : null;
  const addedMessage = namedMessage || (uploaded.length === 1
    ? "Asset added to the library."
    : `${uploaded.length} assets added to the library.`);
  return respond(request, env, {
    ok: true,
    uploaded: uploaded.length,
    classifying: uploadedIds.length > 0,
    records: uploaded,
    content_profile_id: uploadProfile.id,
    content_profile_name: f(uploadProfile, "Profile_Name") || null,
    batch_base: batchBase,
    batch_names: batchNames,
    record_ids: uploadedIds,
    message: uploadedIds.length
      ? `${addedMessage} Classifying in the background — refresh to see tags.`
      : addedMessage,
  }, 201);
}
/*__STUDIO_WORKER_END:uploadAssetLibraryItems__*/

export async function findAssetLibraryUsages(env, recordId) {
  const needle = ideaLibraryAirtableEscape(recordId);
  const requests = await listRecords(env, PRODUCTION_REQUEST_TABLE, {
    limit: 10,
    filterFormula: `FIND("${needle}", ARRAYJOIN({Studio_Master_Media_Assets}))`,
  }).catch(() => []);
  return { production_requests: requests };
}
/*__STUDIO_WORKER_END:findAssetLibraryUsages__*/

export async function trashStudioAssetOnDrive(env, fileId) {
  const driveId = String(fileId || "").trim();
  if (!driveId) return { ok: false, skipped: true, reason: "no_drive_file" };
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) return { ok: false, skipped: true, reason: "no_runner" };
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const response = await fetch(`${runnerUrl}/jobs/studio-asset-library-delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify({ google_drive_file_id: driveId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: payload?.error || payload?.message || `Drive trash failed (${response.status})` };
  }
  return { ok: true, trashed: Boolean(payload?.trashed), google_drive_file_id: driveId };
}
/*__STUDIO_WORKER_END:trashStudioAssetOnDrive__*/

export async function renameStudioAssetOnDrive(env, fileId, filename) {
  const driveId = String(fileId || "").trim();
  const name = String(filename || "").trim();
  if (!driveId) return { ok: false, skipped: true, reason: "no_drive_file" };
  if (!name) return { ok: false, skipped: true, reason: "no_filename" };
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) return { ok: false, skipped: true, reason: "no_runner" };
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const response = await fetch(`${runnerUrl}/jobs/studio-asset-library-rename`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify({ google_drive_file_id: driveId, filename: name }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: payload?.error || payload?.message || `Drive rename failed (${response.status})` };
  }
  return {
    ok: true,
    google_drive_file_id: driveId,
    filename: String(payload?.filename || name),
  };
}
/*__STUDIO_WORKER_END:renameStudioAssetOnDrive__*/

export async function libraryAssetProfilesById(env) {
  const profiles = await listContentProfileRecords(env).catch(() => []);
  return Object.fromEntries((profiles || []).map((row) => [row.id, row]));
}
/*__STUDIO_WORKER_END:libraryAssetProfilesById__*/

export function assertLibrarySourceAsset(record) {
  const role = String(f(record, "Asset_Role") || "").trim();
  const mediaClass = String(f(record, "Media_Class") || "").trim().toLowerCase();
  if (role === "Music") throw new HttpError(409, "Rename music tracks from the Music Manager tab");
  if (!["image", "graphic", "video"].includes(mediaClass) && role !== "Raw Footage") {
    throw new HttpError(409, "Only photo and video library assets can be updated here");
  }
}
/*__STUDIO_WORKER_END:assertLibrarySourceAsset__*/

export async function assignLibraryAssetProfile(request, env, url, authorization, ctx) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  const recordId = String(url.pathname.split("/")[3] || "");
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) throw new HttpError(400, "Invalid library record");
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const profileId = String(payload?.content_profile_id || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(profileId)) throw new HttpError(400, "Choose a Content Profile");
  // classify=false saves the profile only (dropdown change). "Classify all" runs A3 later.
  const shouldClassify = payload?.classify !== false;
  const profile = await resolveWorkingContentProfile(env, authorization, profileId);
  let record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  assertLibrarySourceAsset(record);
  // Assigning an existing source asset to ChicagoShining is itself a branding
  // boundary. Upgrade it before saving the profile so the catalog never claims
  // a ChicagoShining asset is ready while its canonical file is unwatermarked.
  record = await ensureChicagoWatermarkedLibraryAssetForProfile(env, record, profile);
  const updated = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Content_Profile: [profile.id],
        Classification_Status: shouldClassify ? "Processing" : "Needs Classification",
      },
      typecast: true,
    }),
  });
  if (shouldClassify) {
    const classify = (async () => {
      try {
        await pulseLibraryAssetClassification(env, recordId);
      } catch (error) {
        console.warn("library profile classify failed", error?.message || String(error));
      }
    })();
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(classify);
    else await classify.catch(() => {});
  }
  const profilesById = await libraryAssetProfilesById(env);
  const profileName = String(f(profile, "Profile_Name") || "").trim();
  return respond(request, env, {
    ok: true,
    classifying: shouldClassify,
    id: recordId,
    content_profile_id: profile.id,
    record: mapLibraryAsset(updated || record, profilesById),
    message: shouldClassify
      ? `Assigned ${profileName || "profile"}. Classifying in the background — refresh to see updated tags.`
      : `Saved ${profileName || "profile"}. Use Classify all when you are done assigning profiles.`,
  });
}
/*__STUDIO_WORKER_END:assignLibraryAssetProfile__*/

export async function stampLibraryAssetsClassifying(env, recordIds) {
  const ids = [...new Set((recordIds || []).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, "", {
      method: "PATCH",
      body: JSON.stringify({
        typecast: true,
        records: chunk.map((id) => ({
          id,
          fields: { Classification_Status: "Processing" },
        })),
      }),
    });
  }
  return ids;
}
/*__STUDIO_WORKER_END:stampLibraryAssetsClassifying__*/

export async function classifyAllLibraryAssets(request, env, url, authorization, ctx) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  const rows = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
    limit: LIBRARY_CLASSIFY_ALL_LIMIT,
    sortField: "Added_At",
    sortDirection: "desc",
    filterFormula: LIBRARY_CLASSIFY_PENDING_FORMULA,
    fields: ["Asset Name", "Classification_Status", "Content_Profile"],
  });
  const recordIds = (rows || []).map((row) => row.id).filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
  if (!recordIds.length) {
    return respond(request, env, {
      ok: true,
      classifying: false,
      count: 0,
      message: "Nothing is waiting for classification. Assign a profile to an asset first.",
    });
  }
  try {
    await stampLibraryAssetsClassifying(env, recordIds);
  } catch (error) {
    console.warn("library classify-all stamp Processing failed", error?.message || String(error));
  }
  const { response, payload } = await item4PulsePipelineStage(env, "a3", {
    extra: {
      record_ids: recordIds,
      trigger_a4: false,
      wait_for_next: false,
      drain: false,
      background: true,
    },
  }, "A3");
  if (!response.ok || payload?.status === "error") {
    throw new HttpError(
      response.ok ? 502 : response.status,
      payload?.message || payload?.error || `A3 classify-all failed (${response.status})`,
    );
  }
  const alreadyRunning = Boolean(payload?.details?.already_running);
  const truncated = recordIds.length >= LIBRARY_CLASSIFY_ALL_LIMIT;
  return respond(request, env, {
    ok: true,
    classifying: true,
    already_running: alreadyRunning,
    count: recordIds.length,
    record_ids: recordIds,
    truncated,
    message: alreadyRunning
      ? `A3 is already classifying in the background. ${recordIds.length} assets are still waiting — refresh in a few minutes.`
      : `Classifying ${recordIds.length} assets in the background${truncated ? " (first batch)" : ""}.`,
  });
}
/*__STUDIO_WORKER_END:classifyAllLibraryAssets__*/

export async function pulseLibraryAssetClassification(env, recordId) {
  const { response, payload } = await item4PulsePipelineStage(env, "a3", {
    extra: {
      record_ids: [recordId],
      trigger_a4: false,
      wait_for_next: false,
      drain: false,
    },
  }, "A3");
  if (!response.ok || payload?.status === "error") {
    console.warn("library rename classify failed", payload?.message || payload?.error || response.status);
  }
  return payload;
}
/*__STUDIO_WORKER_END:pulseLibraryAssetClassification__*/

export async function renameAssetLibraryItem(request, env, url, ctx) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  const recordId = String(url.pathname.split("/")[3] || "");
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) throw new HttpError(400, "Invalid library record");
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const sanitized = sanitizeLibraryAssetName(payload?.name);
  if (!sanitized.ok) throw new HttpError(400, sanitized.error);
  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  const role = String(f(record, "Asset_Role") || "").trim();
  const mediaClass = String(f(record, "Media_Class") || "").trim().toLowerCase();
  if (role === "Music") throw new HttpError(409, "Rename music tracks from the Music Manager tab");
  if (!["image", "graphic", "video"].includes(mediaClass) && role !== "Raw Footage") {
    throw new HttpError(409, "Only photo and video library assets can be renamed here");
  }
  const currentName = String(f(record, "Asset Name") || "").trim();
  if (sanitized.name === currentName) {
    throw new HttpError(400, "Choose a different name");
  }
  const extension = String(f(record, "File_Extension") || "").trim() || item4FileExtension(currentName);
  const driveName = libraryDriveFilename(sanitized.name, extension);
  const updated = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        "Asset Name": sanitized.name,
        Classification_Status: "Processing",
      },
      typecast: true,
    }),
  });
  const driveId = googleDriveFileId(record);
  let drive = { ok: false, skipped: true, reason: "no_drive_file" };
  if (driveId) {
    drive = await renameStudioAssetOnDrive(env, driveId, driveName).catch((error) => ({
      ok: false,
      error: error?.message || String(error),
    }));
  }
  const classify = (async () => {
    try {
      await pulseLibraryAssetClassification(env, recordId);
    } catch (error) {
      console.warn("library rename classify failed", error?.message || String(error));
    }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(classify);
  else await classify.catch(() => {});
  const renamedOk = drive.ok || drive.skipped;
  const message = renamedOk
    ? `Renamed to ${sanitized.name}. Reclassifying in the background — refresh to see updated tags.`
    : `Renamed to ${sanitized.name}, but Google Drive rename failed (${drive.error || "unknown error"}). Reclassifying in the background.`;
  return respond(request, env, {
    ok: true,
    classifying: true,
    id: recordId,
    name: sanitized.name,
    drive,
    record: mapLibraryAsset(updated || record),
    message,
  });
}
/*__STUDIO_WORKER_END:renameAssetLibraryItem__*/

export async function deleteAssetLibraryItem(request, env, url) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  const recordId = String(url.pathname.split("/")[3] || "");
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) throw new HttpError(400, "Invalid library record");
  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  const role = String(f(record, "Asset_Role") || "").trim();
  const mediaClass = String(f(record, "Media_Class") || "").trim().toLowerCase();
  if (role === "Music") throw new HttpError(409, "Delete music tracks from the Music Manager tab");
  if (!["image", "graphic", "video"].includes(mediaClass) && role !== "Raw Footage") {
    throw new HttpError(409, "Only photo and video library assets can be deleted here");
  }
  const usages = await findAssetLibraryUsages(env, recordId);
  if (usages.production_requests.length) {
    throw new HttpError(
      409,
      `Cannot delete this asset. It is still attached to ${usages.production_requests.length} Production Request${usages.production_requests.length === 1 ? "" : "s"}. Remove it there first.`
    );
  }
  const drive = await trashStudioAssetOnDrive(env, googleDriveFileId(record)).catch((error) => ({
    ok: false,
    error: error?.message || String(error),
  }));
  const deleted = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId, { method: "DELETE" });
  return respond(request, env, {
    ok: true,
    deleted: Boolean(deleted?.deleted),
    record_id: recordId,
    name: f(record, "Asset Name"),
    drive,
  });
}
/*__STUDIO_WORKER_END:deleteAssetLibraryItem__*/

export async function patchAssetLibraryDuration(request, env, url) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  const recordId = String(url.pathname.split("/")[3] || "");
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) throw new HttpError(400, "Invalid library record");
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const seconds = coerceLibraryDurationSeconds(payload?.duration_seconds);
  if (!seconds) throw new HttpError(400, "duration_seconds must be a positive number of seconds");
  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  const mediaClass = String(f(record, "Media_Class") || "").trim().toLowerCase();
  const mime = String(f(record, "MIME_Type") || "").trim().toLowerCase();
  const video = mediaClass === "video" || mime.startsWith("video/");
  if (!video) throw new HttpError(409, "Duration can only be stored on video clips");
  const existing = coerceLibraryDurationSeconds(f(record, "Duration_Seconds"));
  if (existing) {
    return respond(request, env, { ok: true, id: recordId, duration_seconds: existing, updated: false });
  }
  await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({ fields: { Duration_Seconds: seconds }, typecast: true }),
  });
  return respond(request, env, { ok: true, id: recordId, duration_seconds: seconds, updated: true });
}
/*__STUDIO_WORKER_END:patchAssetLibraryDuration__*/

export function driveTrashLooksGone(result) {
  const error = String(result?.error || result?.reason || "").toLowerCase();
  return /404|410|not found|trashed|already/.test(error);
}
/*__STUDIO_WORKER_END:driveTrashLooksGone__*/

export async function stampPublishedFileReleased(env, recordId, { clearBlobs = false } = {}) {
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: publishedReleaseStampFields({ clearBlobs }),
      typecast: true,
    }),
  });
}
/*__STUDIO_WORKER_END:stampPublishedFileReleased__*/

export async function deletePublishedR2Keys(env, keys, { dryRun = false } = {}) {
  const list = [...new Set((keys || []).map((key) => String(key || "").trim()).filter(Boolean))];
  const deleted = [];
  const missing = [];
  const errors = [];
  for (const key of list) {
    if (key.startsWith("studio/previews/branding/")) continue;
    if (dryRun) {
      deleted.push(key);
      continue;
    }
    if (!env?.STUDIO_MEDIA?.delete) {
      errors.push({ key, error: "STUDIO_MEDIA binding missing" });
      continue;
    }
    try {
      const head = await env.STUDIO_MEDIA.head(key).catch(() => null);
      if (!head) {
        missing.push(key);
        continue;
      }
      await env.STUDIO_MEDIA.delete(key);
      deleted.push(key);
    } catch (error) {
      errors.push({ key, error: error?.message || String(error) });
    }
  }
  return { ok: errors.length === 0, deleted, missing, errors, dry_run: dryRun };
}
/*__STUDIO_WORKER_END:deletePublishedR2Keys__*/

export async function loadContentItemSiblingOutputs(env, contentItemId) {
  const id = String(contentItemId || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(id)) return [];
  return listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 50,
    filterFormula: `AND({Test_Run_ID}=BLANK(),FIND("${id}", ARRAYJOIN({Content_Item})&""))`,
    fields: POST_PUBLISH_RELEASE_LIST_FIELDS,
  }).catch(() => []);
}
/*__STUDIO_WORKER_END:loadContentItemSiblingOutputs__*/

export async function clearParentProductionJobJsonIfFullyReleased(env, siblings) {
  const list = Array.isArray(siblings) ? siblings : [];
  if (!list.length) return { cleared: false };
  const allReleased = list.every((row) => {
    const storage = String(f(row, "Final_File_Storage_Status") || "").trim().toLowerCase();
    return storage === "released" || !outputNeedsMediaReleaseLocal(row);
  });
  if (!allReleased) return { cleared: false };
  const requestIds = new Set();
  for (const row of list) {
    const outputRowId = studioFirstLinkedId(f(row, "Production_Request_Output"));
    if (!outputRowId) continue;
    const outputRow = await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, outputRowId).catch(() => null);
    const requestId = studioFirstLinkedId(f(outputRow, "Production_Request"));
    if (requestId) requestIds.add(requestId);
  }
  let cleared = 0;
  for (const requestId of requestIds) {
    await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Studio_Production_Job_JSON: null },
        typecast: true,
      }),
    }).catch(() => null);
    cleared += 1;
  }
  return { cleared: cleared > 0, request_count: cleared };
}
/*__STUDIO_WORKER_END:clearParentProductionJobJsonIfFullyReleased__*/

export function outputNeedsMediaReleaseLocal(record) {
  const storage = String(f(record, "Final_File_Storage_Status") || "").trim().toLowerCase();
  if (storage === "released") {
    return collectPublishedR2CleanupKeys(record).length > 0
      || Boolean(String(f(record, "Studio_Preview_URL") || "").trim() || String(f(record, "Publish_Asset_URL") || "").trim());
  }
  return Boolean(
    publishedFinalFileId(record)
    || String(f(record, "Final_File_URL") || "").trim()
    || String(f(record, "Output_URL") || "").trim()
    || collectPublishedR2CleanupKeys(record).length
    || String(f(record, "Studio_Preview_URL") || "").trim()
    || String(f(record, "Publish_Asset_URL") || "").trim()
  );
}
/*__STUDIO_WORKER_END:outputNeedsMediaReleaseLocal__*/

export async function releasePublishedOutputMedia(env, record, {
  dryRun = false,
  requireGroupComplete = false,
  siblingRecords = null,
  clearBlobs = true,
  now = Date.now(),
} = {}) {
  const masterDriveIds = await collectPublishedMasterDriveIds(env, record);
  const siblings = siblingRecords || (
    requireGroupComplete
      ? await loadContentItemSiblingOutputs(env, contentItemIdFromOutput(record))
      : [record]
  );
  const decision = evaluatePublishedOutputRelease(record, {
    masterDriveIds,
    siblingRecords: siblings,
    now,
    coolDownMs: POST_PUBLISH_RELEASE_COOLDOWN_MS,
    requireGroupComplete,
  });
  if (!decision.ok) {
    return { ok: false, status: decision.status || 409, error: decision.error, reason: decision.reason };
  }
  if (decision.already_released && !(decision.r2_keys || []).length) {
    return {
      ok: true,
      already_released: true,
      released: true,
      dry_run: dryRun,
      record: mapPublishedLibraryFile(record),
      drive: { ok: true, skipped: true, reason: "already_released" },
      r2: { ok: true, deleted: [], missing: [], errors: [] },
    };
  }

  let drive = { ok: true, skipped: true, reason: "already_released" };
  if (!decision.already_released && decision.final_file_id) {
    if (dryRun) {
      drive = { ok: true, dry_run: true, would_trash: decision.final_file_id };
    } else {
      drive = await trashStudioAssetOnDrive(env, decision.final_file_id).catch((error) => ({
        ok: false,
        error: error?.message || String(error),
      }));
      if (!drive.ok && !driveTrashLooksGone(drive)) {
        return { ok: false, status: 502, error: drive.error || "Could not trash the Google Drive copy", drive };
      }
    }
  }

  const r2 = await deletePublishedR2Keys(env, decision.r2_keys || collectPublishedR2CleanupKeys(record), { dryRun });
  let updated = record;
  if (!dryRun) {
    updated = await stampPublishedFileReleased(env, record.id, { clearBlobs });
    if (requireGroupComplete || contentGroupReadyForMediaRelease(siblings)) {
      const refreshed = siblings.map((row) => (row.id === record.id ? updated : row));
      await clearParentProductionJobJsonIfFullyReleased(env, refreshed);
    }
  }
  return {
    ok: true,
    released: true,
    already_released: Boolean(decision.already_released || driveTrashLooksGone(drive)),
    dry_run: dryRun,
    record: mapPublishedLibraryFile(updated || record),
    drive,
    r2,
  };
}
/*__STUDIO_WORKER_END:releasePublishedOutputMedia__*/

export async function releasePublishedLibraryFile(request, env, url) {
  if (!env.AIRTABLE_OUTPUT_TABLE_ID) throw new HttpError(503, "Platform Outputs table is not configured");
  const outputId = String(url.pathname.split("/")[4] || "");
  if (!/^rec[A-Za-z0-9]+$/.test(outputId)) throw new HttpError(400, "Invalid published file record");
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputId);
  const result = await releasePublishedOutputMedia(env, record, {
    dryRun: false,
    requireGroupComplete: false,
    clearBlobs: true,
  });
  if (!result.ok) throw new HttpError(result.status || 409, result.error || "Release failed");
  return respond(request, env, {
    ok: true,
    released: true,
    already_released: Boolean(result.already_released),
    record: result.record,
    drive: result.drive,
    r2: result.r2,
  });
}
/*__STUDIO_WORKER_END:releasePublishedLibraryFile__*/

export async function studioPostPublishReleaseDryRunEnabled(env) {
  const row = await studioSettingsByName(env, POST_PUBLISH_RELEASE_DRY_RUN_SETTING).catch(() => null);
  // Default dry-run ON for the first production week unless Setting_Value is explicitly off.
  if (!row) return true;
  const raw = String(f(row, "Setting_Value") || "").trim();
  if (!raw) return true;
  return dryRunFlagEnabled(raw);
}
/*__STUDIO_WORKER_END:studioPostPublishReleaseDryRunEnabled__*/

export async function studioSweepPostPublishMediaRelease(env, { limit = POST_PUBLISH_RELEASE_BATCH_LIMIT } = {}) {
  if (!env.AIRTABLE_OUTPUT_TABLE_ID) return { ok: false, skipped: "no_output_table" };
  const dryRun = await studioPostPublishReleaseDryRunEnabled(env);
  const candidates = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: Math.max(limit * 3, 24),
    sortField: "Published_At",
    sortDirection: "asc",
    filterFormula: postPublishReleaseCandidateFormula(),
    fields: POST_PUBLISH_RELEASE_LIST_FIELDS,
  }).catch(() => []);

  const byContent = new Map();
  for (const row of candidates || []) {
    const contentId = contentItemIdFromOutput(row) || `solo:${row.id}`;
    if (!byContent.has(contentId)) byContent.set(contentId, []);
    byContent.get(contentId).push(row);
  }

  const released = [];
  const skipped = [];
  let examined = 0;
  for (const [contentId, seedRows] of byContent) {
    if (released.length >= limit) break;
    examined += 1;
    const siblings = contentId.startsWith("solo:")
      ? seedRows
      : await loadContentItemSiblingOutputs(env, contentId);
    if (!contentGroupReadyForMediaRelease(siblings)) {
      skipped.push({ content_item_id: contentId, reason: "group_incomplete" });
      continue;
    }
    for (const row of siblings) {
      if (released.length >= limit) break;
      if (!outputNeedsMediaReleaseLocal(row)) continue;
      const result = await releasePublishedOutputMedia(env, row, {
        dryRun,
        requireGroupComplete: true,
        siblingRecords: siblings,
        clearBlobs: true,
      });
      if (!result.ok) {
        skipped.push({ id: row.id, reason: result.reason || result.error });
        continue;
      }
      released.push({
        id: row.id,
        dry_run: dryRun,
        already_released: result.already_released,
        r2_deleted: result.r2?.deleted || [],
        drive: result.drive,
      });
      if (!dryRun) {
        // Phase 2 / 2b follow-ons once finals are gone.
        await studioReleaseDerivedFillCropsForOutput(env, row, { dryRun }).catch((error) => {
          console.warn("fill-crop release failed", row.id, error);
        });
        await studioReleaseContentItemVoiceoverThumbnail(env, row, siblings, { dryRun }).catch((error) => {
          console.warn("vo/thumb release failed", row.id, error);
        });
      }
    }
  }
  console.log(JSON.stringify({
    event: "studio_post_publish_media_release",
    dry_run: dryRun,
    examined_groups: examined,
    released: released.length,
    skipped: skipped.length,
  }));
  return { ok: true, dry_run: dryRun, released, skipped, examined_groups: examined };
}
/*__STUDIO_WORKER_END:studioSweepPostPublishMediaRelease__*/

export async function studioReleaseDerivedFillCropsForOutput(env, outputRecord, { dryRun = false } = {}) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) return { ok: false, skipped: "no_media_table" };
  const outputRowId = studioFirstLinkedId(f(outputRecord, "Production_Request_Output"));
  if (!outputRowId) return { ok: true, skipped: "no_production_request_output" };
  const outputRow = await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, outputRowId).catch(() => null);
  const requestId = studioFirstLinkedId(f(outputRow, "Production_Request"));
  if (!requestId) return { ok: true, skipped: "no_production_request" };
  const request = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId).catch(() => null);
  const linkedMedia = []
    .concat(f(request, "Studio_Master_Media_Assets") || [])
    .concat(f(request, "Media_Assets") || [])
    .map((value) => (typeof value === "string" ? value : value?.id))
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id || "")));
  const trashed = [];
  for (const mediaId of [...new Set(linkedMedia)].slice(0, 20)) {
    const media = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, mediaId).catch(() => null);
    if (!media) continue;
    const name = String(f(media, "Asset Name") || f(media, "Name") || "");
    if (!isFillCropAssetName(name)) continue;
    const driveId = String(f(media, "Google Drive File ID") || googleDriveFileId(media) || "").trim();
    const previewKeys = collectPublishedR2CleanupKeys(media).filter(isFillCropPreviewKey);
    if (dryRun) {
      trashed.push({ id: mediaId, dry_run: true, drive_id: driveId || null, r2_keys: previewKeys });
      continue;
    }
    if (driveId) {
      const drive = await trashStudioAssetOnDrive(env, driveId).catch((error) => ({
        ok: false,
        error: error?.message || String(error),
      }));
      if (!drive.ok && !driveTrashLooksGone(drive)) continue;
    }
    await deletePublishedR2Keys(env, previewKeys, { dryRun: false });
    await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, mediaId, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Notes: `${String(f(media, "Notes") || "").trim()}\nPost-publish fill-crop released ${new Date().toISOString()}.`.trim().slice(0, 10000),
        },
        typecast: true,
      }),
    }).catch(() => null);
    trashed.push({ id: mediaId, drive_id: driveId || null, r2_keys: previewKeys });
  }
  return { ok: true, trashed };
}
/*__STUDIO_WORKER_END:studioReleaseDerivedFillCropsForOutput__*/

export async function studioReleaseContentItemVoiceoverThumbnail(env, outputRecord, siblings, { dryRun = false } = {}) {
  const contentId = contentItemIdFromOutput(outputRecord);
  if (!contentId || !env.AIRTABLE_CONTENT_TABLE_ID) return { ok: true, skipped: "no_content" };
  if (!contentGroupReadyForMediaRelease(siblings)) return { ok: true, skipped: "group_incomplete" };
  const allReleased = (siblings || []).every((row) => {
    const storage = String(f(row, "Final_File_Storage_Status") || "").trim().toLowerCase();
    return storage === "released" || row.id === outputRecord.id;
  });
  if (!allReleased) return { ok: true, skipped: "siblings_not_released" };
  const content = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId).catch(() => null);
  if (!content) return { ok: false, skipped: "content_missing" };
  const driveIds = contentItemDerivedDriveIds(content);
  if (!driveIds.length) return { ok: true, skipped: "no_vo_thumb" };
  const trashed = [];
  for (const driveId of driveIds) {
    if (dryRun) {
      trashed.push({ drive_id: driveId, dry_run: true });
      continue;
    }
    const drive = await trashStudioAssetOnDrive(env, driveId).catch((error) => ({
      ok: false,
      error: error?.message || String(error),
    }));
    if (drive.ok || driveTrashLooksGone(drive)) trashed.push({ drive_id: driveId, drive });
  }
  if (!dryRun && trashed.length) {
    await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Voiceover_URL: null, Thumbnail_URL: null },
        typecast: true,
      }),
    }).catch(() => null);
  }
  return { ok: true, trashed };
}
/*__STUDIO_WORKER_END:studioReleaseContentItemVoiceoverThumbnail__*/

export async function fetchGoogleDriveAudio(record, request) {
  const mapped = mapMusic(record);
  const fileId = mapped.google_drive_file_id;
  if (!fileId) throw new HttpError(404, "Google Drive file ID is not available for this music asset");

  const headers = new Headers();
  headers.set("Accept", "audio/mpeg,audio/*;q=0.9,*/*;q=0.8");
  const requestedRange = request.headers.get("Range");
  if (requestedRange) headers.set("Range", requestedRange);

  const urls = [
    googleDriveDownloadUrl(fileId),
    String(mapped.google_drive_url || "").trim(),
  ].filter(Boolean);

  let lastResponse = null;
  for (const sourceUrl of [...new Set(urls)]) {
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers,
      redirect: "follow",
    });
    lastResponse = response;

    const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
    if (response.ok && !contentType.includes("text/html")) return response;

    try { await response.body?.cancel(); } catch {}
  }

  throw new HttpError(lastResponse?.status || 502, `Google Drive preview fetch failed (${lastResponse?.status || "unknown"})`);
}
/*__STUDIO_WORKER_END:fetchGoogleDriveAudio__*/

export function copyDriveAudioHeaders(upstream, mapped) {
  const headers = new Headers();
  const copy = ["Content-Type", "Content-Length", "Content-Range", "ETag", "Last-Modified"];
  for (const name of copy) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Content-Type", headers.get("Content-Type") || mapped.mime_type || "audio/mpeg");
  headers.set("Accept-Ranges", upstream.headers.get("Accept-Ranges") || "bytes");
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Studio-Preview-Source", "google-drive");
  // Do not forward Google Drive's attachment disposition; the browser should
  // treat the proxied response as inline media for the HTML audio element.
  headers.delete("Content-Disposition");
  return headers;
}
/*__STUDIO_WORKER_END:copyDriveAudioHeaders__*/

export async function studioMusicR2Preview(request, env, mapped) {
  const key = String(mapped.r2_preview_key || studioMusicR2KeyFromUrl(mapped.google_drive_url) || "").trim();
  if (!key || !env.STUDIO_MEDIA) throw new HttpError(404, "Studio music preview source is not available");

  const object = await env.STUDIO_MEDIA.get(key);
  if (!object) throw new HttpError(404, "Studio music file was not found in storage");

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || mapped.mime_type || "audio/mpeg");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Studio-Preview-Source", "studio-r2");
  if (object.size) headers.set("Content-Length", String(object.size));

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}
/*__STUDIO_WORKER_END:studioMusicR2Preview__*/

export async function musicPreview(request, env, url) {
  const identity = accessIdentity(request);
  if (!identity.email && !identity.jwt_present) {
    throw new HttpError(401, "Authenticated Studio session required");
  }

  const match = url.pathname.match(/^\/api\/music\/(rec[A-Za-z0-9]+)\/preview$/);
  if (!match) throw new HttpError(400, "Invalid music preview route");
  const recordId = match[1];

  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  const mapped = mapMusic(record);
  if (mapped.do_not_use) throw new HttpError(403, "This music asset is marked Do Not Use");
  if (mapped.preview_source === "studio_r2") {
    return studioMusicR2Preview(request, env, mapped);
  }
  if (!mapped.google_drive_file_id) throw new HttpError(404, "Google Drive preview source is not available");

  if (request.method === "HEAD") {
    // Google Drive does not consistently support HEAD on download URLs. A
    // one-byte ranged GET reliably exposes media metadata without downloading
    // the complete track.
    const probeRequest = new Request(request.url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });
    const upstream = await fetchGoogleDriveAudio(record, probeRequest);
    const headers = copyDriveAudioHeaders(upstream, mapped);

    const contentRange = upstream.headers.get("Content-Range") || "";
    const totalMatch = contentRange.match(/\/(\d+)$/);
    if (totalMatch?.[1]) headers.set("Content-Length", totalMatch[1]);
    else if (mapped.file_size_mb && !headers.get("Content-Length")) {
      headers.set("Content-Length", String(Math.round(Number(mapped.file_size_mb) * 1024 * 1024)));
    }

    headers.delete("Content-Range");
    try { await upstream.body?.cancel(); } catch {}
    return new Response(null, { status: 200, headers });
  }

  const upstream = await fetchGoogleDriveAudio(record, request);
  const headers = copyDriveAudioHeaders(upstream, mapped);

  // Preserve Google's 206 response when the browser asks for a byte range.
  // If Drive returns a normal 200 response, stream it as-is; the audio element
  // can still play it, although seeking behavior depends on Drive honoring range.
  const status = upstream.status === 206 ? 206 : 200;
  return new Response(upstream.body, { status, headers });
}


/*__STUDIO_WORKER_END:musicPreview__*/

export function item4PreviewSettingValueExpr(settingName) {
  return `{{get(map(61.array; "setting_value"; "setting_name"; "${settingName}"); 1)}}`;
}
/*__STUDIO_WORKER_END:item4PreviewSettingValueExpr__*/

export function item4PreviewR2KeyExpr(suffix) {
  return `${item4PreviewSettingValueExpr("STUDIO_PREVIEW_R2_PREFIX")}/item4/{{1.Production_Request_Record_ID}}/{{1.Transfer_ID}}${suffix}`;
}
/*__STUDIO_WORKER_END:item4PreviewR2KeyExpr__*/

export function item4PreviewR2UrlExpr(suffix) {
  return `https://media.chicagoshining.com/${item4PreviewR2KeyExpr(suffix)}`;
}
/*__STUDIO_WORKER_END:item4PreviewR2UrlExpr__*/

export function item4PreviewR2UploadModule(id, x, y, name, dataExpr, contentTypeExpr, suffix, moduleFilter = null) {
  const module = {
    id,
    mapper: {
      ca: "",
      qs: [{ name: "key", value: item4PreviewR2KeyExpr(suffix) }],
      url: item4PreviewSettingValueExpr("R2_UPLOAD_WORKER_URL"),
      data: dataExpr,
      gzip: true,
      method: "put",
      headers: [{
        name: "x-pipeline-secret",
        value: item4PreviewSettingValueExpr("R2_UPLOAD_WORKER_SECRET"),
      }],
      timeout: "300",
      useMtls: false,
      authPass: "",
      authUser: "",
      bodyType: "raw",
      contentType: "custom",
      serializeUrl: false,
      shareCookies: false,
      parseResponse: true,
      followRedirect: true,
      useQuerystring: false,
      customContentType: contentTypeExpr,
      followAllRedirects: false,
      rejectUnauthorized: true,
    },
    module: "http:ActionSendData",
    version: 3,
    metadata: { designer: { x, y, name } },
    parameters: { handleErrors: true, useNewZLibDeCompress: true },
  };
  if (moduleFilter) module.filter = moduleFilter;
  return module;
}
/*__STUDIO_WORKER_END:item4PreviewR2UploadModule__*/

export function item4PreviewQueueReadyModule(id, x, y, name, uploadModuleId, suffix) {
  return {
    id,
    filter: {
      name: "Preview R2 upload succeeded",
      conditions: [[
        { a: `{{${uploadModuleId}.statusCode}}`, b: "200", o: "number:greaterorequal" },
        { a: `{{${uploadModuleId}.statusCode}}`, b: "299", o: "number:lessorequal" },
      ]],
    },
    mapper: {
      id: "{{1.id}}",
      base: "appe33zkZn35yirTL",
      table: "tblBZLXPd1p2NRWRK",
      record: {
        fld2I54gEUz2J3TsR: item4PreviewR2KeyExpr(suffix),
        fldS5ON40ZHaGu8Ar: item4PreviewR2UrlExpr(suffix),
        fldCtpIKdIlfaGvnn: "Ready",
        fld2UVhbThqP0dfus: "",
        fldebrZI7ZxNc9IIH: "{{now}}",
      },
      typecast: true,
      useColumnId: true,
    },
    module: "airtable:ActionUpdateRecords",
    version: 3,
    metadata: { designer: { x, y, name } },
    parameters: { __IMTCONN__: 9293192 },
  };
}
/*__STUDIO_WORKER_END:item4PreviewQueueReadyModule__*/

export function item4PreviewRouteBlueprint() {
  const browserMasterExtensions = ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"];
  return {
    flow: [
      {
        id: 60,
        filter: {
          name: "Ready authority item needs browser preview cache",
          conditions: [
            [
              { a: "{{1.Transfer_Status}}", b: "Ready", o: "text:equal:ci" },
              { a: "{{1.Preview_Status}}", b: "Pending", o: "text:equal:ci" },
              { a: "{{1.Asset_Kind}}", b: "Master Original", o: "text:equal:ci" },
            ],
            [
              { a: "{{1.Transfer_Status}}", b: "Ready", o: "text:equal:ci" },
              { a: "{{1.Preview_Status}}", b: "Pending", o: "text:equal:ci" },
              { a: "{{1.Asset_Kind}}", b: "Platform Variant", o: "text:equal:ci" },
            ],
          ],
        },
        mapper: {
          base: "appe33zkZn35yirTL",
          table: "tblpHPWeEkyJaF7ql",
          formula:
            'AND({Active}=1,OR({Setting_Name}="R2_UPLOAD_WORKER_URL",{Setting_Name}="R2_UPLOAD_WORKER_SECRET",{Setting_Name}="STUDIO_PREVIEW_R2_PREFIX",{Setting_Name}="STUDIO_VARIANT_SERVICE_BASE_URL",{Setting_Name}="STUDIO_VARIANT_SERVICE_TOKEN"))',
          maxRecords: "5",
          useColumnId: false,
        },
        module: "airtable:ActionSearchRecords",
        version: 3,
        metadata: { designer: { x: 600, y: -1350, name: "60 - Load Browser Preview Settings" } },
        parameters: { __IMTCONN__: 9293192 },
      },
      {
        id: 61,
        mapper: {
          setting_name: "{{60.Setting_Name}}",
          setting_value: "{{60.Setting_Value}}",
        },
        module: "builtin:BasicAggregator",
        version: 1,
        metadata: { designer: { x: 900, y: -1350, name: "61 - Aggregate Browser Preview Settings" } },
        parameters: { feeder: 60, target: "custom", groupBy: "{{1.id}}" },
      },
      {
        id: 62,
        mapper: {
          file: "{{1.Drive_File_ID}}",
          select: "map",
          formatDrawings: "image/jpeg",
          formatDocuments: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          formatSpreadsheets: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          formatPresentations: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        },
        module: "google-drive:getAFile",
        version: 4,
        metadata: { designer: { x: 1200, y: -1350, name: "62 - Download Private Drive Authority for Preview" } },
        parameters: { __IMTCONN__: 9306146 },
      },
      {
        id: 63,
        mapper: null,
        module: "builtin:BasicRouter",
        routes: [
          {
            flow: [
              item4PreviewR2UploadModule(
                64, 1800, -1600,
                "64 - Cache Versioned Variant JPEG Preview in R2",
                "{{62.data}}", "image/jpeg", "-{{1.Drive_File_ID}}.jpg",
                {
                  name: "Platform variant preview",
                  conditions: [[
                    { a: "{{1.Asset_Kind}}", b: "Platform Variant", o: "text:equal:ci" },
                  ]],
                }
              ),
              item4PreviewQueueReadyModule(
                65, 2100, -1600,
                "65 - Mark Versioned Variant Browser Preview Ready",
                64, "-{{1.Drive_File_ID}}.jpg"
              ),
            ],
          },
          {
            flow: [
              {
                id: 66,
                filter: {
                  name: "HEIC or HEIF master preview",
                  conditions: [
                    [
                      { a: "{{1.Asset_Kind}}", b: "Master Original", o: "text:equal:ci" },
                      { a: "{{1.Source_Extension}}", b: "heic", o: "text:equal:ci" },
                    ],
                    [
                      { a: "{{1.Asset_Kind}}", b: "Master Original", o: "text:equal:ci" },
                      { a: "{{1.Source_Extension}}", b: "heif", o: "text:equal:ci" },
                    ],
                  ],
                },
                mapper: {
                  ca: "",
                  qs: [
                    { name: "ratio", value: "4:5" },
                    { name: "recipe", value: ITEM4_VARIANT_RECIPE_VERSION },
                  ],
                  url: `${item4PreviewSettingValueExpr("STUDIO_VARIANT_SERVICE_BASE_URL")}/render`,
                  data: "{{62.data}}",
                  gzip: true,
                  method: "post",
                  headers: [{
                    name: "X-Studio-Variant-Token",
                    value: item4PreviewSettingValueExpr("STUDIO_VARIANT_SERVICE_TOKEN"),
                  }],
                  timeout: "300",
                  useMtls: false,
                  authPass: "",
                  authUser: "",
                  bodyType: "raw",
                  contentType: "custom",
                  serializeUrl: false,
                  shareCookies: false,
                  parseResponse: false,
                  followRedirect: true,
                  useQuerystring: false,
                  customContentType: "application/octet-stream",
                  followAllRedirects: false,
                  rejectUnauthorized: true,
                },
                module: "http:ActionSendData",
                version: 3,
                metadata: { designer: { x: 1800, y: -1300, name: "66 - Convert HEIC Master to Browser JPEG Preview" } },
                parameters: { handleErrors: true, useNewZLibDeCompress: true },
              },
              item4PreviewR2UploadModule(
                67, 2100, -1300,
                "67 - Cache HEIC Master JPEG Preview in R2",
                "{{66.data}}", "image/jpeg", ".jpg"
              ),
              item4PreviewQueueReadyModule(
                68, 2400, -1300,
                "68 - Mark HEIC Master Browser Preview Ready",
                67, ".jpg"
              ),
            ],
          },
          {
            flow: [
              item4PreviewR2UploadModule(
                69, 1800, -1000,
                "69 - Cache Browser-Compatible Master Preview in R2",
                "{{62.data}}", "{{1.Source_MIME_Type}}", ".{{1.Source_Extension}}",
                {
                  name: "Browser-compatible master preview",
                  conditions: browserMasterExtensions.map((ext) => [
                    { a: "{{1.Asset_Kind}}", b: "Master Original", o: "text:equal:ci" },
                    { a: "{{1.Source_Extension}}", b: ext, o: "text:equal:ci" },
                  ]),
                }
              ),
              item4PreviewQueueReadyModule(
                70, 2100, -1000,
                "70 - Mark Master Browser Preview Ready",
                69, ".{{1.Source_Extension}}"
              ),
            ],
          },
        ],
        version: 1,
        metadata: { designer: { x: 1500, y: -1350, name: "63 - Route Preview Conversion" } },
        parameters: {},
      },
    ],
  };
}

/*__STUDIO_WORKER_END:item4PreviewRouteBlueprint__*/

export function item4ValidateGeneratedMakeBlueprint(flow, path = "flow") {
  if (!Array.isArray(flow)) {
    throw new HttpError(500, `Generated Make blueprint ${path} is not an array`);
  }

  for (let moduleIndex = 0; moduleIndex < flow.length; moduleIndex += 1) {
    const module = flow[moduleIndex];
    if (!module || typeof module !== "object") {
      throw new HttpError(500, `Generated Make blueprint ${path}[${moduleIndex}] is invalid`);
    }

    if (module.module === "builtin:BasicRouter") {
      const routes = Array.isArray(module.routes) ? module.routes : [];
      for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
        const route = routes[routeIndex];
        const routePath = `${path}[${moduleIndex}].routes[${routeIndex}]`;
        const extraKeys = Object.keys(route || {}).filter((key) => key !== "flow");
        if (extraKeys.length) {
          throw new HttpError(
            500,
            `Generated Make blueprint ${routePath} contains illegal route keys: ${extraKeys.join(",")}`
          );
        }
        item4ValidateGeneratedMakeBlueprint(route?.flow || [], `${routePath}.flow`);
      }
    }
  }
}
/*__STUDIO_WORKER_END:item4ValidateGeneratedMakeBlueprint__*/

export function item4AssertPreviewBranchFilters(blueprint) {
  const required = [
    [64, "Platform variant preview"],
    [66, "HEIC or HEIF master preview"],
    [69, "Browser-compatible master preview"],
  ];

  for (const [moduleId, filterName] of required) {
    const module = phase6FindModule(blueprint?.flow, moduleId);
    if (!module) {
      throw new HttpError(500, `Generated SMV1 preview blueprint is missing module ${moduleId}`);
    }
    if (String(module?.filter?.name || "") !== filterName) {
      throw new HttpError(
        500,
        `Generated SMV1 preview blueprint module ${moduleId} is missing required filter ${filterName}`
      );
    }
  }
}
/*__STUDIO_WORKER_END:item4AssertPreviewBranchFilters__*/

export function item4SourceAuthorityInterfaceRows() {
  return [
    {name:"Studio_Source_Authority_Status",type:"text",label:"Studio_Source_Authority_Status"},
    {name:"Studio_Source_Selected_Assets_JSON",type:"text",label:"Studio_Source_Selected_Assets_JSON",multiline:true},
    {name:"Studio_Source_Selected_Clip_Count",type:"number",label:"Studio_Source_Selected_Clip_Count"},
    {name:"Studio_Source_Composition_ID",type:"text",label:"Studio_Source_Composition_ID"},
  ];
}
/*__STUDIO_WORKER_END:item4SourceAuthorityInterfaceRows__*/

export function item4CollectStringSlots(value, path = [], rows = []) {
  if (typeof value === "string") {
    rows.push({path:[...path], value});
    return rows;
  }
  if (Array.isArray(value)) {
    value.forEach((item,index) => item4CollectStringSlots(item,[...path,index],rows));
    return rows;
  }
  if (value && typeof value === "object") {
    for (const [key,item] of Object.entries(value)) item4CollectStringSlots(item,[...path,key],rows);
  }
  return rows;
}
/*__STUDIO_WORKER_END:item4CollectStringSlots__*/

export function item4SetPath(root, path, value) {
  let cursor = root;
  for (let i=0;i<path.length-1;i++) cursor = cursor[path[i]];
  cursor[path[path.length-1]] = value;
}
/*__STUDIO_WORKER_END:item4SetPath__*/

export function item4R2PromptSlot(module12) {
  const all = item4CollectStringSlots(module12?.mapper || {})
    .map(row => {
      const lower = row.value.toLowerCase();
      let score = row.value.length;
      if (lower.includes("selected_clips")) score += 100000;
      if (lower.includes("selected_music")) score += 80000;
      if (lower.includes("render_prep")) score += 60000;
      if (lower.includes("candidate")) score += 20000;
      if (lower.includes("asset")) score += 10000;
      if (lower.includes("json")) score += 5000;
      return {...row,score};
    })
    .filter(row => row.value.length > 200)
    .sort((a,b) => b.score-a.score);
  const canonical = all.filter(row => {
    const v=row.value.toLowerCase();
    return v.includes("selected_clips") || v.includes("selected_music") || v.includes("render_prep");
  });
  return canonical[0] || all[0] || null;
}
/*__STUDIO_WORKER_END:item4R2PromptSlot__*/

export function item4FlattenMakeModules(flow, rows = []) {
  if (!Array.isArray(flow)) return rows;
  for (const module of flow) {
    if (!module || typeof module !== "object") continue;
    rows.push(module);
    if (module.module === "builtin:BasicRouter" && Array.isArray(module.routes)) {
      for (const route of module.routes) item4FlattenMakeModules(route?.flow, rows);
    }
  }
  return rows;
}
/*__STUDIO_WORKER_END:item4FlattenMakeModules__*/

export function item4FindR2ContextModule(blueprint) {
  const exact = phase6FindModule(blueprint?.flow,3);
  if (exact?.module === "airtable:ActionGetRecord") return exact;
  const modules=item4FlattenMakeModules(blueprint?.flow);
  return modules.find(m => m?.module === "airtable:ActionGetRecord" && JSON.stringify(m).includes("Platform Outputs"))
      || modules.find(m => m?.module === "airtable:ActionGetRecord")
      || null;
}
/*__STUDIO_WORKER_END:item4FindR2ContextModule__*/

export function item4FindR2AiModule(blueprint) {
  const exact = phase6FindModule(blueprint?.flow,12);
  if (exact && String(exact.module||"").toLowerCase().includes("openai")) return exact;
  const modules=item4FlattenMakeModules(blueprint?.flow);
  return modules.find(m => String(m?.module||"").toLowerCase().includes("openai") && item4R2PromptSlot(m)) || null;
}
/*__STUDIO_WORKER_END:item4FindR2AiModule__*/

export function item4FindR2FailfastModule(blueprint) {
  const exact = phase6FindModule(blueprint?.flow,14);
  if (exact?.filter?.conditions) return exact;
  const modules=item4FlattenMakeModules(blueprint?.flow);
  return modules.find(m => {
    const text=JSON.stringify({filter:m?.filter||{},metadata:m?.metadata||{},mapper:m?.mapper||{}}).toLowerCase();
    return m?.filter?.conditions && (text.includes("zero candidate") || text.includes("fail-fast") || text.includes("fail fast") || text.includes("no candidate"));
  }) || null;
}

/*__STUDIO_WORKER_END:item4FindR2FailfastModule__*/

export async function item4RecoverStaleR2BaselineReads(env, staleMs = 180000) {
  // GET_BLUEPRINT queue rows can remain Processing when the R2 blueprint is too
  // large for the bridge's Result_JSON persistence path. They are read/audit
  // commands only; they do not write Make. Recover only stale R2 GET_BLUEPRINT
  // rows and leave UPDATE_BLUEPRINT / RUN / activation commands untouched.
  const formula = 'AND({Scenario_ID}=5569495,{Action}="GET_BLUEPRINT",{Status}="Processing")';
  let payload;
  try {
    payload = await airtableFetch(env, "Make Admin Queue", `?maxRecords=25&filterByFormula=${encodeURIComponent(formula)}`);
  } catch (error) {
    console.warn("Could not inspect stale R2 Make Admin baseline reads", error);
    return { ok: false, recovered: 0, deferred: true };
  }
  const rows = Array.isArray(payload?.records) ? payload.records : [];
  const now = Date.now();
  let recovered = 0;
  for (const row of rows) {
    const fields = row?.fields || {};
    const startedRaw = fields.Started_At || fields.Requested_At || row?.createdTime || null;
    const started = startedRaw ? Date.parse(startedRaw) : NaN;
    if (!Number.isFinite(started) || now - started < staleMs) continue;
    const correlation = String(fields.Correlation_ID || "");
    const commandId = String(fields.Command_ID || "");
    if (!correlation.includes("ITEM4-R2") && !commandId.includes("R2")) continue;
    try {
      await airtableFetch(env, "Make Admin Queue", row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Status: "Failed",
            Completed_At: new Date().toISOString(),
            Error_Message: "Recovered automatically by Studio Worker 0.9.4: stale R2 GET_BLUEPRINT audit/baseline read exceeded the safe processing window. No Make write was associated with this read-only command; direct Worker Make API hardening will continue independently."
          },
          typecast: true
        })
      });
      recovered += 1;
    } catch (error) {
      console.warn("Could not recover stale R2 baseline queue row", row?.id, error);
    }
  }
  return { ok: true, recovered, inspected: rows.length };
}
/*__STUDIO_WORKER_END:item4RecoverStaleR2BaselineReads__*/

export function deferItem4MakeHardening(ctx, env) {
  const work = item4EnsureMakeHardeningFromWorkspaceOpen(env).catch((error) => {
    console.warn("Item 4 Make hardening deferred", error);
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(work);
}
/*__STUDIO_WORKER_END:deferItem4MakeHardening__*/

export async function item4EnsureR2StudioExactSourceGuard(env) {
  if (pipelineStageBackend(env, "R2").mode === "python") {
    return { skipped: "python_backend" };
  }
  const { makeApiBase, headers } = await phase6MakeApiConfig(env);
  const read = await fetch(`${makeApiBase}/scenarios/${ITEM4_R2_SCENARIO_ID}/blueprint?draft=false`,{method:"GET",headers});
  const raw=await read.text(); let body; try { body=raw?JSON.parse(raw):{}; } catch { body={raw}; }
  if (!read.ok) throw new HttpError(read.status,`R2 exact-source guard read failed (${read.status})`);
  const blueprint=body?.response?.blueprint||body?.blueprint||null;
  if (!blueprint || typeof blueprint!=="object") throw new HttpError(502,"R2 did not return a usable live blueprint");
  const context=item4FindR2ContextModule(blueprint);
  const ai=item4FindR2AiModule(blueprint);
  const failfast=item4FindR2FailfastModule(blueprint);
  const claimGate=item4FlattenMakeModules(blueprint.flow).find(m=>m?.id===2 && m?.module==="airtable:ActionUpdateRecords");
  if (!context || !ai || !failfast || !claimGate) {
    const modules=item4FlattenMakeModules(blueprint.flow).map(m=>({id:m?.id,module:m?.module,name:m?.metadata?.designer?.name||null,has_filter:!!m?.filter}));
    throw new HttpError(409,`R2 safe module discovery failed. context=${context?.id||"none"} ai=${ai?.id||"none"} failfast=${failfast?.id||"none"} claimGate=${claimGate?.id||"none"}; modules=${JSON.stringify(modules).slice(0,1600)}`);
  }
  const prompt=item4R2PromptSlot(ai);
  if (!prompt) throw new HttpError(409,"R2 module 12 canonical selection prompt could not be identified safely");
  const marker="STUDIO_EXACT_SOURCE_AUTHORITY_V1";
  const contextInterface=Array.isArray(context?.metadata?.interface)?context.metadata.interface:[];
  // Make Airtable Search Records can emit a wrapper bundle with empty 1.id.
  // Keep a nonempty-id filter and ifempty fallback so module 2 never claims with a blank Record ID.
  const canonicalRecordIdExpr='{{ifempty(1.id; ifempty(1.__IMTKEY__; 1.recordId))}}';
  const claimHasRecordIdFilter={
    name:"Has Airtable record ID",
    conditions:[[{a:canonicalRecordIdExpr,o:"exist"}]]
  };
  const claimSource=item4FlattenMakeModules(blueprint.flow).find(m=>m?.id===1);
  const claimSourceInterface=Array.isArray(claimSource?.metadata?.interface)?claimSource.metadata.interface:[];
  const eligibilityMarker='STUDIO_OR_LEGACY_R2_ELIGIBILITY_V1';
  const explicitEligibilityFormula=`AND(
  NOT({Do_Not_Publish}),
  {Content_Item} != BLANK(),
  {Output_Status} = "Ready for Review",
  OR({Asset_Need_Status} = "Not Needed", {Asset_Need_Status} = "Fulfilled"),
  {Asset_Selection_Status} = BLANK(),
  {Render_Status} = BLANK(),
  {Remotion_Job_ID} = BLANK(),
  {Remotion_Props_JSON} = BLANK(),
  {Final_File_URL} = BLANK(),
  {Final_File_ID} = BLANK(),
  {Output_URL} = BLANK(),
  {Published_At} = BLANK(),
  {Platform_Post_URL} = BLANK(),
  OR(
    AND(
      {Selected_Assets_JSON} = BLANK(),
      {Selected_Clip_Count} = BLANK(),
      {Render_Clip_List_JSON} = BLANK()
    ),
    AND(
      FIND("Studio exact source authority", {Asset_Selection_Notes} & "") > 0,
      {Selected_Assets_JSON} != BLANK(),
      {Selected_Clip_Count} > 0,
      {Render_Clip_List_JSON} != BLANK()
    )
  )
)`;
  const claimIdReady=String(claimGate?.mapper?.id||"")===canonicalRecordIdExpr;
  const claimFilterReady=JSON.stringify(claimGate?.filter||{}).includes("1.id") && JSON.stringify(claimGate?.filter||{}).includes("exist");
  const alreadyReady=prompt.value.includes(marker) && contextInterface.some(row=>row?.label==="Studio_Source_Authority_Status") && claimIdReady && claimFilterReady && claimSourceInterface.some(row=>row?.name==="id") && claimSource?.mapper?.formula===explicitEligibilityFormula && !claimSource?.mapper?.view && claimSource?.metadata?.notes?.includes(eligibilityMarker);
  if (alreadyReady) return {ok:true,already_ready:true,live_name:blueprint.name};

  const patched=JSON.parse(JSON.stringify(blueprint));
  const pContext=item4FindR2ContextModule(patched);
  const pAi=item4FindR2AiModule(patched);
  const pFailfast=item4FindR2FailfastModule(patched);
  const pClaimGate=item4FlattenMakeModules(patched.flow).find(m=>m?.id===2 && m?.module==="airtable:ActionUpdateRecords");
  const pClaimSource=item4FlattenMakeModules(patched.flow).find(m=>m?.id===1);
  if (!pClaimGate || !pClaimSource) throw new HttpError(409,"R2 claim modules 1/2 disappeared during patch generation");
  pClaimGate.filter=claimHasRecordIdFilter;
  pClaimSource.mapper=pClaimSource.mapper||{};
  // The legacy Airtable view excludes Studio exact-source outputs because it requires
  // selected/render-package fields to be blank. R2 now owns an explicit, auditable
  // eligibility formula that preserves the legacy blank-selection path AND admits
  // Studio exact-source packages that P3 intentionally preloads before R2.
  delete pClaimSource.mapper.view;
  pClaimSource.mapper.formula=explicitEligibilityFormula;
  pClaimSource.metadata=pClaimSource.metadata||{};
  pClaimSource.metadata.notes=`${eligibilityMarker}: module 1 no longer depends on the legacy R2 - Needs Asset Selection view. Explicit Airtable eligibility preserves publication/render safety stops and accepts either legacy unselected outputs or Studio exact-source preloaded packages.`;
  pClaimSource.metadata.interface=Array.isArray(pClaimSource.metadata.interface)?pClaimSource.metadata.interface:[];
  if (!pClaimSource.metadata.interface.some(row=>row?.name==="id")) {
    pClaimSource.metadata.interface.unshift({name:"id",type:"text",label:"ID"});
  }
  pClaimGate.mapper=pClaimGate.mapper||{};
  pClaimGate.mapper.id=canonicalRecordIdExpr;
  pContext.metadata.interface=Array.isArray(pContext?.metadata?.interface)?pContext.metadata.interface:[];
  for (const row of item4SourceAuthorityInterfaceRows()) {
    if (!pContext.metadata.interface.some(x=>x?.label===row.label || x?.name===row.name)) pContext.metadata.interface.push(row);
  }
  const pPrompt=item4R2PromptSlot(pAi);
  if (!pPrompt) throw new HttpError(500,"Generated R2 module 12 prompt slot disappeared during patch generation");
  const guardText=`\n\n${marker}\nStudio exact-source status: {{3.Studio_Source_Authority_Status}}\nStudio locked visual package: {{3.Studio_Source_Selected_Assets_JSON}}\nWhen Studio exact-source status is Ready, the user has explicitly supplied the visual source set. Those selected_clips are IMMUTABLE authority. Do NOT choose, substitute, rank, reorder, or replace any video candidate, even if generic video candidates are available. The Studio locked package may be current schema with selected_clips or an earlier schema with clips. If it has selected_clips, copy them exactly. If it has clips, transform each locked clip into the normal selected_clips schema while preserving visual identity, URL, media_asset_record_id, order and duration (duration_frames -> durationFrames); derive startFrame cumulatively without changing order. Preserve any supplied visual render_prep fields. You may complete only the normal canonical validation and music choice. If background music is enabled, choose an eligible music candidate using the normal rules and populate selected_music plus render_prep.music_url/music_volume. If background music is disabled, leave music empty. Return the exact normal R2 canonical JSON schema with selection_status Selected and validation_status Valid. Image/JPEG Studio source URLs are valid for the ChicagoShiningPhotoSequence composition and must not be rejected merely because they are not video files. For non-Studio work, follow all existing R2 rules unchanged.`;
  item4SetPath(pAi.mapper,pPrompt.path,pPrompt.value+guardText);

  // Exact Studio sources must reach the AI/music path even if the generic video-candidate list is empty.
  pAi.filter = pAi.filter || {name:"At least one candidate or Studio exact source",conditions:[]};
  pAi.filter.conditions = Array.isArray(pAi.filter.conditions)?pAi.filter.conditions:[];
  if (!pAi.filter.conditions.some(group => JSON.stringify(group).includes("Studio_Source_Authority_Status"))) {
    pAi.filter.conditions.push([{a:"{{3.Studio_Source_Authority_Status}}",b:"Ready",o:"text:equal"}]);
  }
  // Conversely, the video zero-candidate fail-fast branch must never fire when Studio already supplied exact visuals.
  if (pFailfast.filter?.conditions && Array.isArray(pFailfast.filter.conditions)) {
    for (const group of pFailfast.filter.conditions) {
      if (Array.isArray(group) && !JSON.stringify(group).includes("BLOCK_FAILFAST")) {
        group.push({a:'{{if(3.Studio_Source_Authority_Status = "Ready"; "BLOCK_FAILFAST"; "ALLOW_FAILFAST")}}',b:"ALLOW_FAILFAST",o:"text:equal"});
      }
    }
  } else {
    throw new HttpError(409,"R2 module 14 fail-fast filter is missing; refusing an unsafe automatic patch");
  }
  patched.name=ITEM4_R2_SOURCE_GUARD_NAME;
  delete patched.idSequence;

  const requestedAt=new Date().toISOString(); let auditId=null;
  try {
    const audit=await airtableFetch(env,"Make Admin Queue","",{method:"POST",body:JSON.stringify({records:[{fields:{
      Command_ID:`STUDIO-R2-SOURCE-GUARD-${Date.now()}`,Action:"UPDATE_BLUEPRINT",Scenario_ID:ITEM4_R2_SCENARIO_ID,Scenario_Name:patched.name,
      Proposed_Blueprint_JSON_Original:JSON.stringify(patched),Write_Approved:true,Status:"Processing",Backup_Blueprint_Wrapper_2:JSON.stringify(blueprint),
      Requested_At:requestedAt,Started_At:requestedAt,Requested_By:"chicagoshining-studio-api",Correlation_ID:"ITEM4-R2-EXACT-SOURCE-GUARD",
      Notes:"Worker 0.10.31 R2 hardening. Module 1 keeps the explicit Studio + legacy eligibility formula. Module 2 claims only when a record id exists, using ifempty(1.id; 1.__IMTKEY__; 1.recordId) so empty search wrappers cannot invalidate the scenario. Zero-candidate fail-fast, scheduling and activation are preserved."
    }}],typecast:true})}); auditId=audit?.records?.[0]?.id||null;
  } catch {}
  try {
    const patch=await fetch(`${makeApiBase}/scenarios/${ITEM4_R2_SCENARIO_ID}?confirmed=true`,{method:"PATCH",headers,body:JSON.stringify({blueprint:JSON.stringify(patched)})});
    const patchText=await patch.text(); if(!patch.ok) throw new HttpError(patch.status,`R2 exact-source guard PATCH failed (${patch.status}): ${patchText.slice(0,300)}`);
    const verify=await fetch(`${makeApiBase}/scenarios/${ITEM4_R2_SCENARIO_ID}/blueprint?draft=false`,{method:"GET",headers});
    const verifyRaw=await verify.text(); let verifyBody; try { verifyBody=verifyRaw?JSON.parse(verifyRaw):{}; } catch { verifyBody={raw:verifyRaw}; }
    if(!verify.ok) throw new HttpError(verify.status,`R2 exact-source post-deploy read failed (${verify.status})`);
    const live=verifyBody?.response?.blueprint||verifyBody?.blueprint||null;
    const v3=item4FindR2ContextModule(live),v12=item4FindR2AiModule(live),v14=item4FindR2FailfastModule(live);
    const v2=item4FlattenMakeModules(live?.flow).find(m=>m?.id===2 && m?.module==="airtable:ActionUpdateRecords");
    const v1=item4FlattenMakeModules(live?.flow).find(m=>m?.id===1);
    const livePrompt=item4R2PromptSlot(v12);
    if(!livePrompt?.value?.includes(marker) || !Array.isArray(v3?.metadata?.interface) || !v3.metadata.interface.some(x=>x?.label==="Studio_Source_Authority_Status") || !JSON.stringify(v14?.filter||{}).includes("BLOCK_FAILFAST") || !v2 || !JSON.stringify(v2.filter||{}).includes("1.id") || v2?.mapper?.id!==canonicalRecordIdExpr || !Array.isArray(v1?.metadata?.interface) || !v1.metadata.interface.some(x=>x?.name==="id") || v1?.mapper?.formula!==explicitEligibilityFormula || !!v1?.mapper?.view || !v1?.metadata?.notes?.includes(eligibilityMarker)) {
      throw new HttpError(502,"R2 post-deploy verification did not match the explicit Studio + legacy eligibility contract");
    }
    if(auditId){try{await airtableFetch(env,"Make Admin Queue",auditId,{method:"PATCH",body:JSON.stringify({fields:{Status:"Succeeded",Completed_At:new Date().toISOString(),Result_JSON:JSON.stringify({ok:true,worker_build:"0.10.31",scenario_id:ITEM4_R2_SCENARIO_ID,live_name:live?.name||null})},typecast:true})});}catch{}}
    return {ok:true,already_ready:false,live_name:live?.name||patched.name};
  } catch(error) {
    if(auditId){try{await airtableFetch(env,"Make Admin Queue",auditId,{method:"PATCH",body:JSON.stringify({fields:{Status:"Failed",Completed_At:new Date().toISOString(),Error_Message:error instanceof Error?error.message:String(error)},typecast:true})});}catch{}}
    throw error;
  }
}
/*__STUDIO_WORKER_END:item4EnsureR2StudioExactSourceGuard__*/

export function item4P3SourceFieldInterfaceRows() {
  return [
    {name:"Studio_Source_Authority_Status",type:"text",label:"Studio_Source_Authority_Status"},
    {name:"Studio_Source_Clip_1_URL",type:"text",label:"Studio_Source_Clip_1_URL"},
    {name:"Studio_Source_Clip_2_URL",type:"text",label:"Studio_Source_Clip_2_URL"},
    {name:"Studio_Source_Clip_3_URL",type:"text",label:"Studio_Source_Clip_3_URL"},
    {name:"Studio_Source_Clip_1_Media_Asset_ID",type:"text",label:"Studio_Source_Clip_1_Media_Asset_ID"},
    {name:"Studio_Source_Clip_2_Media_Asset_ID",type:"text",label:"Studio_Source_Clip_2_Media_Asset_ID"},
    {name:"Studio_Source_Clip_3_Media_Asset_ID",type:"text",label:"Studio_Source_Clip_3_Media_Asset_ID"},
    {name:"Studio_Source_Selected_Assets_JSON",type:"text",label:"Studio_Source_Selected_Assets_JSON",multiline:true},
    {name:"Studio_Source_Render_Clip_List_JSON",type:"text",label:"Studio_Source_Render_Clip_List_JSON",multiline:true},
    {name:"Studio_Source_Selected_Clip_Count",type:"number",label:"Studio_Source_Selected_Clip_Count"},
    {name:"Studio_Source_Render_Total_Frames",type:"number",label:"Studio_Source_Render_Total_Frames"},
    {name:"Studio_Source_Composition_ID",type:"text",label:"Studio_Source_Composition_ID"},
  ];
}
/*__STUDIO_WORKER_END:item4P3SourceFieldInterfaceRows__*/

export async function item4EnsureP3StudioSourceAuthority(env) {
  const { makeApiBase, headers } = await phase6MakeApiConfig(env);
  const read = await fetch(`${makeApiBase}/scenarios/${ITEM4_P3_SCENARIO_ID}/blueprint?draft=false`, {method:"GET",headers});
  const raw = await read.text();
  let body; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {raw}; }
  if (!read.ok) throw new HttpError(read.status, `P3 exact-source hardening read failed (${read.status})`);
  const blueprint = body?.response?.blueprint || body?.blueprint || null;
  if (!blueprint || typeof blueprint !== "object") throw new HttpError(502, "P3 did not return a usable live blueprint");

  const search = phase6FindModule(blueprint.flow, 1);
  const create = phase6FindModule(blueprint.flow, 6);
  const markCreate = phase6FindModule(blueprint.flow, 8);
  const markDuplicate = phase6FindModule(blueprint.flow, 52);
  if (!search || search.module !== "airtable:ActionSearchRecords" ||
      !create || create.module !== "airtable:ActionCreateRecord" ||
      !markCreate || markCreate.module !== "airtable:ActionUpdateRecords" ||
      !markDuplicate || markDuplicate.module !== "airtable:ActionUpdateRecords") {
    throw new HttpError(409, "P3 modules 1/6/8/52 no longer match the validated v4.5 baseline");
  }

  const fields = Array.isArray(search?.mapper?.fields) ? search.mapper.fields : [];
  const createRecord = create?.mapper?.record || {};
  const alreadyReady =
    fields.includes("Studio_Source_Authority_Status") &&
    String(createRecord.Asset_Selection_Notes || "").includes("Studio exact source authority") &&
    !Object.prototype.hasOwnProperty.call(createRecord, "Asset_Selection_Status") &&
    String(createRecord.Selected_Clip_1_URL || "").includes("Studio_Source_Clip_1_URL") &&
    String(markCreate?.mapper?.record?.fldtkhVaQzr0oCTB7 || "").includes("Studio_Source_Authority_Status") &&
    String(markDuplicate?.mapper?.record?.fldtkhVaQzr0oCTB7 || "").includes("Studio_Source_Authority_Status");
  if (alreadyReady) return {ok:true,already_ready:true,live_name:blueprint.name};

  const patched = JSON.parse(JSON.stringify(blueprint));
  const pSearch = phase6FindModule(patched.flow,1);
  const pCreate = phase6FindModule(patched.flow,6);
  const pMarkCreate = phase6FindModule(patched.flow,8);
  const pMarkDuplicate = phase6FindModule(patched.flow,52);

  pSearch.mapper.fields = Array.isArray(pSearch.mapper.fields) ? pSearch.mapper.fields : [];
  for (const row of item4P3SourceFieldInterfaceRows()) {
    if (!pSearch.mapper.fields.includes(row.name)) pSearch.mapper.fields.push(row.name);
    if (Array.isArray(pSearch?.metadata?.interface) && !pSearch.metadata.interface.some(x => x?.label === row.label || x?.name === row.name)) {
      pSearch.metadata.interface.push(row);
    }
  }
  if (pSearch?.metadata?.designer) pSearch.metadata.designer.name = "1 - Search P3 Work Item - Studio Exact Source Aware";

  const r = pCreate.mapper.record || (pCreate.mapper.record = {});
  delete r.Asset_Selection_Status; // Blank is the authoritative pre-R2 queue state; Airtable view owns eligibility.
  r.Asset_Selection_Notes = '{{if(1.Studio_Source_Authority_Status = "Ready"; "Studio exact source authority: owner-uploaded platform variants preserved in source order; generic R2 visual substitution is forbidden; R2 may only complete canonicalization/music selection."; "Generic R2 discovery required.")}}';
  r.Selected_Clip_1_URL = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Clip_1_URL; "")}}';
  r.Selected_Clip_2_URL = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Clip_2_URL; "")}}';
  r.Selected_Clip_3_URL = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Clip_3_URL; "")}}';
  r.Selected_Clip_1_Media_Asset_ID = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Clip_1_Media_Asset_ID; "")}}';
  r.Selected_Clip_2_Media_Asset_ID = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Clip_2_Media_Asset_ID; "")}}';
  r.Selected_Clip_3_Media_Asset_ID = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Clip_3_Media_Asset_ID; "")}}';
  r.Selected_Asset_Summary = '{{if(1.Studio_Source_Authority_Status = "Ready"; "Studio exact source authority locked before R2."; "")}}';
  r.Selected_Assets_JSON = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Selected_Assets_JSON; "")}}';
  r.Selected_Clip_Count = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Selected_Clip_Count; 0)}}';
  r.Render_Clip_List_JSON = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Render_Clip_List_JSON; "")}}';
  r.Render_Total_Frames = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Render_Total_Frames; 0)}}';
  r.Composition_ID = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Composition_ID; "")}}';
  r.Clip_1_URL = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Clip_1_URL; "")}}';
  r.Clip_2_URL = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Clip_2_URL; "")}}';
  r.Clip_3_URL = '{{if(1.Studio_Source_Authority_Status = "Ready"; 1.Studio_Source_Clip_3_URL; "")}}';
  r.Clip_1_Duration_Frames = '{{if(1.Studio_Source_Authority_Status = "Ready"; round(1.Studio_Source_Render_Total_Frames / 1.Studio_Source_Selected_Clip_Count); 0)}}';
  r.Clip_2_Duration_Frames = '{{if(1.Studio_Source_Authority_Status = "Ready"; round(1.Studio_Source_Render_Total_Frames / 1.Studio_Source_Selected_Clip_Count); 0)}}';
  r.Clip_3_Duration_Frames = '{{if(1.Studio_Source_Authority_Status = "Ready"; round(1.Studio_Source_Render_Total_Frames / 1.Studio_Source_Selected_Clip_Count); 0)}}';
  r.Output_Notes = `${String(r.Output_Notes || "")}\nStudio source authority: {{1.Studio_Source_Authority_Status}}. When Ready, the exact owner-uploaded prepared source set is visually locked. R2 still runs for canonical validation/music selection but must not replace or reorder the visuals.`;
  if (pCreate?.metadata?.designer) pCreate.metadata.designer.name = "10A - Create Output - Studio Exact Source or Generic R2";

  for (const module of [pMarkCreate,pMarkDuplicate]) {
    const rec = module.mapper.record || (module.mapper.record = {});
    rec.fldtkhVaQzr0oCTB7 = '{{if(1.Studio_Source_Authority_Status = "Ready"; "Assets Matched"; "Needs Assets")}}';
    rec.fldczozdEMhI3OUEV = 'Not Ready';
  }
  if (pMarkCreate?.metadata?.designer) pMarkCreate.metadata.designer.name = "12A - Mark Studio Exact Source Matched or Generic Needs Assets";
  if (pMarkDuplicate?.metadata?.designer) pMarkDuplicate.metadata.designer.name = "12B - Mark Studio Exact Source Matched or Generic Needs Assets";

  patched.name = ITEM4_P3_SOURCE_AUTHORITY_NAME;
  delete patched.idSequence;

  const requestedAt = new Date().toISOString();
  let auditId = null;
  try {
    const audit = await airtableFetch(env,"Make Admin Queue","",{method:"POST",body:JSON.stringify({records:[{fields:{
      Command_ID:`STUDIO-P3-SOURCE-AUTHORITY-${Date.now()}`,
      Action:"UPDATE_BLUEPRINT",Scenario_ID:ITEM4_P3_SCENARIO_ID,Scenario_Name:patched.name,
      Proposed_Blueprint_JSON_Original:JSON.stringify(patched),Write_Approved:true,Status:"Processing",
      Backup_Blueprint_Wrapper_2:JSON.stringify(blueprint),Requested_At:requestedAt,Started_At:requestedAt,
      Requested_By:"chicagoshining-studio-api",Correlation_ID:"ITEM4-STUDIO-EXACT-SOURCE-AUTHORITY",
      Notes:"Worker 0.9.4 automatic P3 hardening with forced /item4 live inspection. Owner-uploaded Studio variants are locked before R2; P3 must leave Asset_Selection_Status blank so the existing R2 - Needs Asset Selection view owns queue eligibility. R2 remains responsible for canonical validation/music selection but may not replace visuals. Non-Studio work retains normal R2-first behavior. Webhook/scheduling/activation preserved."
    }}],typecast:true})});
    auditId=audit?.records?.[0]?.id||null;
  } catch {}

  try {
    const patch = await fetch(`${makeApiBase}/scenarios/${ITEM4_P3_SCENARIO_ID}?confirmed=true`,{method:"PATCH",headers,body:JSON.stringify({blueprint:JSON.stringify(patched)})});
    const patchText = await patch.text();
    if (!patch.ok) throw new HttpError(patch.status,`P3 exact-source hardening failed (${patch.status}): ${patchText.slice(0,300)}`);
    const verify = await fetch(`${makeApiBase}/scenarios/${ITEM4_P3_SCENARIO_ID}/blueprint?draft=false`,{method:"GET",headers});
    const verifyRaw = await verify.text(); let verifyBody; try { verifyBody=verifyRaw?JSON.parse(verifyRaw):{}; } catch { verifyBody={raw:verifyRaw}; }
    if (!verify.ok) throw new HttpError(verify.status,`P3 exact-source post-deploy read failed (${verify.status})`);
    const live = verifyBody?.response?.blueprint || verifyBody?.blueprint || null;
    const v1=phase6FindModule(live?.flow,1), v6=phase6FindModule(live?.flow,6), v8=phase6FindModule(live?.flow,8), v52=phase6FindModule(live?.flow,52);
    if (!v1?.mapper?.fields?.includes("Studio_Source_Authority_Status") ||
        Object.prototype.hasOwnProperty.call(v6?.mapper?.record || {}, "Asset_Selection_Status") ||
        !String(v6?.mapper?.record?.Asset_Selection_Notes||"").includes("Studio exact source authority") ||
        !String(v8?.mapper?.record?.fldtkhVaQzr0oCTB7||"").includes("Assets Matched") ||
        !String(v52?.mapper?.record?.fldtkhVaQzr0oCTB7||"").includes("Assets Matched")) {
      throw new HttpError(502,"P3 exact-source post-deploy verification did not match the required source-authority contract");
    }
    if (auditId) { try { await airtableFetch(env,"Make Admin Queue",auditId,{method:"PATCH",body:JSON.stringify({fields:{Status:"Succeeded",Completed_At:new Date().toISOString(),Result_JSON:JSON.stringify({ok:true,worker_build:"0.9.4",scenario_id:ITEM4_P3_SCENARIO_ID,live_name:live?.name||null})},typecast:true})}); } catch {} }
    return {ok:true,already_ready:false,live_name:live?.name||patched.name};
  } catch (error) {
    if (auditId) { try { await airtableFetch(env,"Make Admin Queue",auditId,{method:"PATCH",body:JSON.stringify({fields:{Status:"Failed",Completed_At:new Date().toISOString(),Error_Message:error instanceof Error?error.message:String(error)},typecast:true})}); } catch {} }
    throw error;
  }
}


/*__STUDIO_WORKER_END:item4EnsureP3StudioSourceAuthority__*/

export function item4P3SingleParentEnrichmentRecord() {
  return {
    Output_Title:'{{if(length(102.Studio_Effective_Requested_Title)>0;102.Studio_Effective_Requested_Title;101.Content_Title)}}',
    Output_Caption:'{{if(length(102.Studio_Effective_Requested_Caption)>0;102.Studio_Effective_Requested_Caption;101.Caption)}}',
    Output_Hashtags:"{{101.Hashtags}}",
    Thumbnail_URL:"{{101.Thumbnail_URL}}",
    Voiceover_URL:'{{if(ifempty(102.Studio_Effective_Voiceover_Mode; "Yes") = "No"; ""; 101.Voiceover_URL)}}',
    Output_Status: STUDIO_P3_NATIVE_PHOTO_STATUS_IF,
    Asset_Selection_Status: STUDIO_P3_NATIVE_PHOTO_SELECTION_IF,
    Output_Notes:`{{102.Output_Notes}}\nP3 v4.8 ${STUDIO_P3_REMOTION_HANDOFF_MARKER}: Multi-Photo / Instagram Carousel / Facebook Multi-Image Post stay Ready for Review; Instagram and Facebook Story plus other Remotion Studio outputs stay In Production with assets Selected so R3/R4 can render the 10-second Story teaser. Enrichment from Content Item {{101.Content_ID}}.`
  };
}
/*__STUDIO_WORKER_END:item4P3SingleParentEnrichmentRecord__*/

export function item4P3Module103HasRemotionHandoff(mod) {
  const rec = mod?.mapper?.record || {};
  const status = String(rec.Output_Status || "");
  const selection = String(rec.Asset_Selection_Status || "");
  return status.includes("|")
    && !/\bor\s*\(/.test(status)
    && !/\bor\s*\(/.test(selection)
    && status.includes("In Production")
    && !status.includes('Studio_Output_Type = "Story"')
    && Object.prototype.hasOwnProperty.call(rec, "Asset_Selection_Status")
    && String(rec.Output_Notes || "").includes(STUDIO_P3_REMOTION_HANDOFF_MARKER);
}
/*__STUDIO_WORKER_END:item4P3Module103HasRemotionHandoff__*/

export function item4ApplyP3RemotionHandoff(mod) {
  if (!mod?.mapper) throw new HttpError(409, "P3 module 103 is missing");
  mod.mapper.record = Object.assign({}, mod.mapper.record || {}, item4P3SingleParentEnrichmentRecord());
}
/*__STUDIO_WORKER_END:item4ApplyP3RemotionHandoff__*/

export function item4PatchP3SingleParentBlueprint(blueprint) {
  if (!blueprint || typeof blueprint !== "object") throw new HttpError(502, "P3 single-parent patch source blueprint is unusable");
  const router=phase6FindModule(blueprint.flow,901);
  if(!router||router.module!=="builtin:BasicRouter") throw new HttpError(409,"P3 module 901 router is missing");
  if(phase6FindModule(blueprint.flow,101)&&phase6FindModule(blueprint.flow,103)) {
    if(item4P3Module103HasRemotionHandoff(phase6FindModule(blueprint.flow,103))) return {patched:blueprint,already_ready:true};
    const patched=JSON.parse(JSON.stringify(blueprint));
    item4ApplyP3RemotionHandoff(phase6FindModule(patched.flow,103));
    item4ValidateGeneratedMakeBlueprint(patched.flow);
    return {patched,already_ready:false,upgraded_handoff:true};
  }
  const legacySearch=phase6FindModule(blueprint.flow,1), existingSearch=phase6FindModule(blueprint.flow,5), existingCreate=phase6FindModule(blueprint.flow,6), existingMark=phase6FindModule(blueprint.flow,8);
  if(!legacySearch||!existingSearch||!existingCreate||!existingMark) throw new HttpError(409,"P3 validated modules 1/5/6/8 are required for single-parent hardening");
  const patched=JSON.parse(JSON.stringify(blueprint));
  const pRouter=phase6FindModule(patched.flow,901), pLegacy=phase6FindModule(patched.flow,1);
  pLegacy.mapper.formula='OR({Production_Request}=BLANK(),{Studio_Is_Output_Work_Item}=TRUE())';
  if(pLegacy?.metadata?.designer) pLegacy.metadata.designer.name="1 - Search Legacy or Historical Studio Child Work Item";
  const s=JSON.parse(JSON.stringify(pLegacy)); s.id=101; s.filter=null;
  s.mapper.formula='AND({Production_Request}!=BLANK(),NOT({Studio_Is_Output_Work_Item}))'; s.mapper.maxRecords="1";
  if(s?.metadata?.designer){s.metadata.designer.x=310;s.metadata.designer.y=420;s.metadata.designer.name="101 - Search Single Parent Studio Content Item";}
  const q=JSON.parse(JSON.stringify(existingSearch)); q.id=102; delete q.filter;
  q.mapper.base="appe33zkZn35yirTL"; q.mapper.table=STUDIO_PLATFORM_OUTPUT_TABLE; q.mapper.maxRecords="25"; delete q.mapper.view; delete q.mapper.sort;
  q.mapper.formula='AND(FIND(",{{101.Content_ID}},", "," & ARRAYJOIN({Content_Item}) & ",") > 0,{Production_Request_Output}!=BLANK(),{Output_Status}="Planned")';
  q.mapper.fields=["Output_ID","Content_Item","Platform","Format","Platform_Output_Type","Aspect_Ratio","Output_Status","Output_Title","Output_Caption","Output_Hashtags","Output_Notes","Production_Request_Output","Studio_Output_Type","Studio_Effective_Title_Mode","Studio_Effective_Requested_Title","Studio_Effective_Caption_Mode","Studio_Effective_Requested_Caption","Studio_Effective_Thumbnail_Mode","Studio_Effective_Voiceover_Mode","Voiceover_Tail_Seconds"];
  q.metadata=q.metadata||{}; q.metadata.designer={x:650,y:420,name:"102 - Search Seeded Studio Platform Outputs for Parent"};
  q.metadata.interface=JSON.parse(JSON.stringify(existingCreate?.metadata?.interface||[]));
  for(const name of ["Production_Request_Output","Studio_Output_Type","Studio_Effective_Title_Mode","Studio_Effective_Requested_Title","Studio_Effective_Caption_Mode","Studio_Effective_Requested_Caption","Studio_Effective_Thumbnail_Mode","Studio_Effective_Voiceover_Mode"]){if(!q.metadata.interface.some(x=>x?.name===name))q.metadata.interface.push({name,type:"text",label:name});}
  const u=JSON.parse(JSON.stringify(existingMark)); u.id=103; delete u.filter; u.module="airtable:ActionUpdateRecords";
  u.mapper={id:"{{102.id}}",base:"appe33zkZn35yirTL",table:STUDIO_PLATFORM_OUTPUT_TABLE,record:item4P3SingleParentEnrichmentRecord(),typecast:true,useColumnId:false};
  u.filter={name:"Studio parent package ready for seeded output",conditions:[[{a:"{{102.id}}",o:"exist"},{a:"{{101.Caption}}",o:"exist"},{a:'{{if(ifempty(102.Studio_Effective_Thumbnail_Mode; "Yes") = "No"; "NOT_REQUIRED"; 101.Thumbnail_URL)}}',o:"exist"},{a:'{{if(ifempty(102.Studio_Effective_Voiceover_Mode; "Yes") = "No"; "NOT_REQUIRED"; 101.Voiceover_URL)}}',o:"exist"}]]};
  u.metadata=u.metadata||{};u.metadata.designer={x:990,y:420,name:"103 - Enrich Existing Studio Platform Output from Parent Package"};
  const m=JSON.parse(JSON.stringify(existingMark)); m.id=104; m.filter={name:"After seeded Studio output enriched",conditions:[[{a:"{{103.id}}",o:"exist"}]]}; m.mapper.id="{{101.id}}";
  m.mapper.record={fldJ1IFKs6fpc3sct:"Ready for Review",fldczozdEMhI3OUEV:"Not Ready",fldtkhVaQzr0oCTB7:"Assets Matched"};
  if(m?.metadata?.designer){m.metadata.designer.x=1330;m.metadata.designer.y=420;m.metadata.designer.name="104 - Mark Single Parent Studio Content Item Assets Matched";}
  pRouter.routes.unshift({flow:[s,q,u,m]});
  patched.name="P3 - Platform Output Generation v4.8 - Single Parent Studio Outputs + Legacy"; delete patched.idSequence;
  item4ValidateGeneratedMakeBlueprint(patched.flow);
  return {patched,already_ready:false};
}
/*__STUDIO_WORKER_END:item4PatchP3SingleParentBlueprint__*/

export async function item4QueueP3SingleParentViaAdminBridge(env, sourceBlueprint, reason="direct-make-unavailable") {
  const built=item4PatchP3SingleParentBlueprint(sourceBlueprint);
  if(built.already_ready) return {ok:true,already_ready:true,via:"admin-queue",live_name:sourceBlueprint?.name||null};
  const patched=built.patched;
  const existingFormula=`AND({Scenario_ID}=${ITEM4_P3_SCENARIO_ID},{Action}="UPDATE_BLUEPRINT",{Correlation_ID}="ITEM4-SINGLE-PARENT-P3",OR({Status}="Pending",{Status}="Queued",{Status}="Processing"))`;
  try {
    const existing=await airtableFetch(env,"Make Admin Queue",`?maxRecords=1&filterByFormula=${encodeURIComponent(existingFormula)}`);
    if(Array.isArray(existing?.records)&&existing.records.length){
      try { await pulseOnDemandMakeAdminBridge(env); } catch (error) {
        console.warn("MAKE-ADMIN-BRIDGE pulse for existing command failed", error);
      }
      return {ok:true,already_ready:false,queued:true,via:"admin-queue",queue_record_id:existing.records[0].id,reason:"existing-command"};
    }
  } catch {}
  const now=new Date().toISOString();
  const created=await airtableFetch(env,"Make Admin Queue","",{method:"POST",body:JSON.stringify({records:[{fields:{
    Command_ID:`STUDIO-P3-SINGLE-PARENT-${Date.now()}`,
    Action:"UPDATE_BLUEPRINT",Scenario_ID:ITEM4_P3_SCENARIO_ID,Scenario_Name:patched.name,
    Proposed_Blueprint_JSON_Original:JSON.stringify(patched),Write_Approved:true,Status:"Pending",
    Backup_Blueprint_Wrapper_2:JSON.stringify(sourceBlueprint),Requested_At:now,Requested_By:"chicagoshining-studio-api",
    Correlation_ID:"ITEM4-SINGLE-PARENT-P3",
    Notes:`Worker 0.10.5 admin-queue fallback (${reason}). Adds Modules 101-104 for single-parent Studio routing while preserving webhook 2567877 and the complete legacy P3 route.`
  }}],typecast:true})});
  const queueRecordId = created?.records?.[0]?.id || null;
  try { await pulseOnDemandMakeAdminBridge(env); } catch (error) {
    console.warn("MAKE-ADMIN-BRIDGE pulse after enqueue failed", error);
  }
  return {ok:true,already_ready:false,queued:true,via:"admin-queue",queue_record_id:queueRecordId,reason};
}
/*__STUDIO_WORKER_END:item4QueueP3SingleParentViaAdminBridge__*/

export async function item4LatestP3BlueprintFromAdminQueue(env) {
  const formula=`AND({Scenario_ID}=${ITEM4_P3_SCENARIO_ID},{Action}="GET_BLUEPRINT",{Status}="Succeeded",{Result_JSON}!=BLANK())`;
  const rows=await airtableFetch(env,"Make Admin Queue",`?maxRecords=10&sort%5B0%5D%5Bfield%5D=Completed_At&sort%5B0%5D%5Bdirection%5D=desc&filterByFormula=${encodeURIComponent(formula)}`);
  for(const row of (rows?.records||[])){
    try{
      const result=JSON.parse(String(row?.fields?.Result_JSON||"{}"));
      const bp=result?.response?.blueprint||result?.blueprint||null;
      if(bp&&phase6FindModule(bp.flow,901)&&phase6FindModule(bp.flow,1)) return bp;
    }catch{}
  }
  throw new HttpError(404,"No successful P3 GET_BLUEPRINT result is available in Make Admin Queue for fallback hardening");
}
/*__STUDIO_WORKER_END:item4LatestP3BlueprintFromAdminQueue__*/

export async function item4EnsureP3SingleParentRouteDirect(env) {
  const {makeApiBase,headers}=await phase6MakeApiConfig(env);
  const read=await fetch(`${makeApiBase}/scenarios/${ITEM4_P3_SCENARIO_ID}/blueprint?draft=false`,{method:"GET",headers});
  const raw=await read.text(); let body; try{body=raw?JSON.parse(raw):{};}catch{body={raw};}
  if(!read.ok) throw new HttpError(read.status,`P3 single-parent read failed (${read.status})`);
  const blueprint=body?.response?.blueprint||body?.blueprint||null;
  if(!blueprint) throw new HttpError(502,"P3 single-parent hardening did not receive a usable blueprint");
  const router=phase6FindModule(blueprint.flow,901);
  if(!router||router.module!=="builtin:BasicRouter") throw new HttpError(409,"P3 module 901 router is missing");
  const built=item4PatchP3SingleParentBlueprint(blueprint);
  if(built.already_ready) return {ok:true,already_ready:true,live_name:blueprint.name};
  const patched=built.patched;
  const now=new Date().toISOString(); let auditId=null;
  try{const audit=await airtableFetch(env,"Make Admin Queue","",{method:"POST",body:JSON.stringify({records:[{fields:{Command_ID:`STUDIO-P3-SINGLE-PARENT-${Date.now()}`,Action:"UPDATE_BLUEPRINT",Scenario_ID:ITEM4_P3_SCENARIO_ID,Scenario_Name:patched.name,Proposed_Blueprint_JSON_Original:JSON.stringify(patched),Write_Approved:true,Status:"Processing",Backup_Blueprint_Wrapper_2:JSON.stringify(blueprint),Requested_At:now,Started_At:now,Requested_By:"chicagoshining-studio-api",Correlation_ID:"ITEM4-SINGLE-PARENT-P3",Notes:"Worker 0.10.20 native photo carousel handoff. Module 103 keeps TikTok Multi-Photo, Instagram Carousel, and Facebook Multi-Image Post Ready for Review and leaves Remotion Studio outputs In Production with Asset_Selection_Status=Selected after VO/caption copy so R3/R4 can render. Legacy P3 route, webhook 2567877, schedule, and activation are preserved."}}],typecast:true})});auditId=audit?.records?.[0]?.id||null;}catch{}
  try{
    const patch=await fetch(`${makeApiBase}/scenarios/${ITEM4_P3_SCENARIO_ID}?confirmed=true`,{method:"PATCH",headers,body:JSON.stringify({blueprint:JSON.stringify(patched)})}); const pt=await patch.text(); if(!patch.ok)throw new HttpError(patch.status,`P3 single-parent patch failed (${patch.status}): ${pt.slice(0,300)}`);
    const vr=await fetch(`${makeApiBase}/scenarios/${ITEM4_P3_SCENARIO_ID}/blueprint?draft=false`,{method:"GET",headers});const vt=await vr.text();let vb;try{vb=vt?JSON.parse(vt):{};}catch{vb={raw:vt};} if(!vr.ok)throw new HttpError(vr.status,`P3 single-parent verify failed (${vr.status})`);const live=vb?.response?.blueprint||vb?.blueprint;
    if(!phase6FindModule(live?.flow,101)||!phase6FindModule(live?.flow,102)||!phase6FindModule(live?.flow,103)||!String(phase6FindModule(live?.flow,1)?.mapper?.formula||"").includes("Production_Request"))throw new HttpError(502,"P3 single-parent verification did not match expected modules 101/102/103");
    if(!item4P3Module103HasRemotionHandoff(phase6FindModule(live?.flow,103)))throw new HttpError(502,`P3 remotion handoff verification did not match ${STUDIO_P3_REMOTION_HANDOFF_MARKER}`);
    if(auditId){try{await airtableFetch(env,"Make Admin Queue",auditId,{method:"PATCH",body:JSON.stringify({fields:{Status:"Succeeded",Completed_At:new Date().toISOString(),Result_JSON:JSON.stringify({ok:true,worker_build:"0.10.20-native-photo-carousel",scenario_id:ITEM4_P3_SCENARIO_ID,live_name:live?.name||null})},typecast:true})});}catch{}}
    return {ok:true,already_ready:false,live_name:live?.name||patched.name};
  }catch(error){if(auditId){try{await airtableFetch(env,"Make Admin Queue",auditId,{method:"PATCH",body:JSON.stringify({fields:{Status:"Failed",Completed_At:new Date().toISOString(),Error_Message:error instanceof Error?error.message:String(error)},typecast:true})});}catch{}}throw error;}
}/*__STUDIO_WORKER_END:item4EnsureP3SingleParentRouteDirect__*/

export async function item4RecordP3DirectDiagnostic(env, directError) {
  const now = new Date().toISOString();
  const message = directError instanceof Error ? directError.message : String(directError);
  try {
    await airtableFetch(env, "Make Admin Queue", "", {
      method: "POST",
      body: JSON.stringify({records:[{fields:{
        Command_ID:`STUDIO-P3-DIRECT-DIAG-${Date.now()}`,
        Action:"GET_BLUEPRINT",
        Scenario_ID:ITEM4_P3_SCENARIO_ID,
        Scenario_Name:"P3 - Platform Output Generation",
        Status:"Failed",
        Requested_At:now,
        Started_At:now,
        Completed_At:now,
        Requested_By:"chicagoshining-studio-api",
        Correlation_ID:"ITEM4-SINGLE-PARENT-P3-DIRECT-DIAG",
        Error_Message:message.slice(0,10000),
        Notes:"Worker 0.10.7 diagnostic only. Captures the exact direct Make API failure before any admin-queue fallback. No Make write is performed by this diagnostic record."
      }}],typecast:true})
    });
  } catch (auditError) {
    console.warn("Could not persist P3 direct diagnostic", auditError);
  }
}
/*__STUDIO_WORKER_END:item4RecordP3DirectDiagnostic__*/

export async function item4EnsureP3SingleParentRoute(env) {
  try {
    return await item4EnsureP3SingleParentRouteDirect(env);
  } catch (directError) {
    await item4RecordP3DirectDiagnostic(env, directError);
    console.warn("P3 single-parent direct Make hardening failed; using Make Admin Queue fallback", directError);
    try {
      const sourceBlueprint=await item4LatestP3BlueprintFromAdminQueue(env);
      return await item4QueueP3SingleParentViaAdminBridge(env,sourceBlueprint,directError instanceof Error?directError.message:String(directError));
    } catch (fallbackError) {
      return {ok:false,deferred:true,direct_error:directError instanceof Error?directError.message:String(directError),fallback_error:fallbackError instanceof Error?fallbackError.message:String(fallbackError)};
    }
  }
}

/*__STUDIO_WORKER_END:item4EnsureP3SingleParentRoute__*/

export async function item4EnsureSmv1PreviewCacheWorker(env) {
  if (pipelineStageBackend(env, "SMV1").mode === "python") {
    return { skipped: "python_backend" };
  }
  const { makeApiBase, headers } = await phase6MakeApiConfig(env);
  const response = await fetch(
    `${makeApiBase}/scenarios/${ITEM4_SMV1_SCENARIO_ID}/blueprint?draft=false`,
    { method: "GET", headers }
  );
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (!response.ok) {
    throw new HttpError(response.status, `SMV1 preview hardening read failed (${response.status})`);
  }

  const blueprint = body?.response?.blueprint || body?.blueprint || null;
  if (!blueprint || typeof blueprint !== "object") {
    throw new HttpError(502, "SMV1 did not return a usable live blueprint");
  }

  const search = phase6FindModule(blueprint.flow, 1);
  const router = phase6FindModule(blueprint.flow, 2);
  if (!search || search.module !== "airtable:ActionSearchRecords" ||
      !router || router.module !== "builtin:BasicRouter") {
    throw new HttpError(409, "SMV1 modules 1/2 no longer match the validated authority-worker baseline");
  }

  const module21 = phase6FindModule(blueprint.flow, 21);
  const module23 = phase6FindModule(blueprint.flow, 23);
  const module33 = phase6FindModule(blueprint.flow, 33);
  const module35 = phase6FindModule(blueprint.flow, 35);
  const module23Record = module23?.mapper?.record || {};
  const module35Record = module35?.mapper?.record || {};
  const legacyLinkMappingsPresent =
    Object.prototype.hasOwnProperty.call(module23Record, "fld6AbvW3iQtXtvWT") ||
    Object.prototype.hasOwnProperty.call(module23Record, "fldWlWPww5PoLrdEO") ||
    Object.prototype.hasOwnProperty.call(module35Record, "fld6AbvW3iQtXtvWT") ||
    Object.prototype.hasOwnProperty.call(module35Record, "fldWlWPww5PoLrdEO");

  const liveModule64 = phase6FindModule(blueprint.flow, 64);
  const liveVariantPreviewKey = String(liveModule64?.mapper?.qs?.find?.((row) => row?.name === "key")?.value || "");
  const previewReady =
    String(search?.mapper?.formula || "").includes("Preview_Status") &&
    Boolean(phase6FindModule(blueprint.flow, 60)) &&
    Boolean(liveModule64) &&
    Boolean(phase6FindModule(blueprint.flow, 70)) &&
    liveVariantPreviewKey.includes("{{1.Drive_File_ID}}");

  const selectorFormula = String(search?.mapper?.formula || "");
  const selectorSafe =
    selectorFormula.includes('AND({Asset_Kind}="Master Original",{Transfer_Status}="Pending")') &&
    !selectorFormula.includes('OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded",AND({Transfer_Status}="Ready"');

  const module21Query = String(module21?.mapper?.qs?.find?.((row) => row?.key === "q")?.value || "");
  const safeVariantReuse = module21Query.includes("__STUDIO_VARIANT_FILENAME_REUSE_DISABLED__");
  const liveVariantRecipe = String(module33?.mapper?.qs?.find?.((row) => row?.name === "recipe")?.value || "");
  const variantRecipeReady = liveVariantRecipe === ITEM4_VARIANT_RECIPE_VERSION;
  const liveGravity = String(module33?.mapper?.qs?.find?.((row) => row?.name === "g")?.value || "");
  const gravityReady = liveGravity.includes("{{1.Variant_Style}}");

  const alreadyReady =
    previewReady &&
    selectorSafe &&
    safeVariantReuse &&
    variantRecipeReady &&
    gravityReady &&
    !legacyLinkMappingsPresent;

  if (alreadyReady) {
    return { ok: true, already_ready: true, live_name: blueprint.name };
  }

  const patched = JSON.parse(JSON.stringify(blueprint));
  const patchedSearch = phase6FindModule(patched.flow, 1);
  const patchedRouter = phase6FindModule(patched.flow, 2);
  const patchedModule21 = phase6FindModule(patched.flow, 21);
  const patchedModule23 = phase6FindModule(patched.flow, 23);
  const patchedModule33 = phase6FindModule(patched.flow, 33);
  const patchedModule35 = phase6FindModule(patched.flow, 35);

  // Module 10 already provides safe idempotency by unique Studio_Transfer_ID.
  // Module 21 historically reused any Drive file with the same target filename,
  // which can cross-contaminate different Production Requests that use common
  // names such as images-1__9x16.jpg. Disable filename-only Drive reuse so a
  // missing transfer-ID asset always regenerates from Source_Drive_File_ID.
  if (!patchedModule21 || patchedModule21.module !== "google-drive:makeApiCall") {
    throw new HttpError(409, "SMV1 module 21 no longer matches the validated Drive-reuse baseline");
  }
  patchedModule21.mapper.qs = Array.isArray(patchedModule21.mapper.qs) ? patchedModule21.mapper.qs : [];
  const qRow = patchedModule21.mapper.qs.find((row) => row?.key === "q");
  if (qRow) qRow.value = "name = '__STUDIO_VARIANT_FILENAME_REUSE_DISABLED__' and trashed = false";
  else patchedModule21.mapper.qs.unshift({ key: "q", value: "name = '__STUDIO_VARIANT_FILENAME_REUSE_DISABLED__' and trashed = false" });
  if (patchedModule21?.metadata?.designer) patchedModule21.metadata.designer.name = "21 - Disable Unsafe Filename-Only Variant Reuse";

  if (!patchedModule33 || patchedModule33.module !== "http:ActionSendData") {
    throw new HttpError(409, "SMV1 module 33 no longer matches the validated variant-render baseline");
  }
  patchedModule33.mapper.qs = Array.isArray(patchedModule33.mapper.qs) ? patchedModule33.mapper.qs : [];
  const recipeRow = patchedModule33.mapper.qs.find((row) => row?.name === "recipe");
  if (recipeRow) recipeRow.value = ITEM4_VARIANT_RECIPE_VERSION;
  else patchedModule33.mapper.qs.push({ name: "recipe", value: ITEM4_VARIANT_RECIPE_VERSION });
  const gravityRow = patchedModule33.mapper.qs.find((row) => row?.name === "g");
  if (gravityRow) gravityRow.value = "{{1.Variant_Style}}";
  else patchedModule33.mapper.qs.push({ name: "g", value: "{{1.Variant_Style}}" });
  if (patchedModule33?.metadata?.designer) {
    patchedModule33.metadata.designer.name = "33 - Render Versioned Fill-Crop Platform Variant";
  }

  for (const module of [patchedModule23, patchedModule35]) {
    if (module?.mapper?.record) {
      delete module.mapper.record.fld6AbvW3iQtXtvWT; // legacy Production Request Outputs -> music override reciprocal
      delete module.mapper.record.fldWlWPww5PoLrdEO; // legacy Production Requests -> music selection reciprocal
    }
  }

  patchedSearch.mapper.formula =
    'OR(AND({Asset_Kind}="Master Original",{Transfer_Status}="Pending"),AND({Asset_Kind}="Platform Variant",OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded")),AND(OR({Asset_Kind}="Master Original",{Asset_Kind}="Platform Variant"),{Transfer_Status}="Ready",{Preview_Status}="Pending"))';
  patchedSearch.mapper.maxRecords = "1";
  if (patchedSearch?.metadata?.designer) {
    patchedSearch.metadata.designer.name = "1 - Get One Authority or Browser Preview Work Item";
  }

  const interfaceRows = patchedSearch?.metadata?.interface;
  if (Array.isArray(interfaceRows)) {
    for (const row of [
      { name: "Preview_Status", type: "text", label: "Preview_Status" },
      { name: "Preview_R2_Key", type: "text", label: "Preview_R2_Key" },
      { name: "Preview_URL", type: "text", label: "Preview_URL" },
      { name: "Preview_Error", type: "text", label: "Preview_Error" },
    ]) {
      if (!interfaceRows.some((candidate) => candidate?.name === row.name)) interfaceRows.push(row);
    }
  }

  patchedRouter.routes = (Array.isArray(patchedRouter.routes) ? patchedRouter.routes : [])
    .filter((route) => !(Array.isArray(route?.flow) && route.flow.some((m) => Number(m?.id) >= 60 && Number(m?.id) <= 70)));
  patchedRouter.routes.unshift(item4PreviewRouteBlueprint());

  patched.name = ITEM4_PREVIEW_SMV1_NAME;
  delete patched.idSequence;

  // Hard stop before Make if the generated router shape is not valid.
  item4ValidateGeneratedMakeBlueprint(patched.flow);
  item4AssertPreviewBranchFilters(patched);
  for (const moduleId of [23, 35]) {
    const module = phase6FindModule(patched.flow, moduleId);
    const record = module?.mapper?.record || {};
    if (Object.prototype.hasOwnProperty.call(record, "fld6AbvW3iQtXtvWT") ||
        Object.prototype.hasOwnProperty.call(record, "fldWlWPww5PoLrdEO")) {
      throw new HttpError(500, `Generated SMV1 module ${moduleId} still contains legacy media-to-music reciprocal link mappings`);
    }
  }

  const requestedAt = new Date().toISOString();
  let auditId = null;
  try {
    const audit = await airtableFetch(env, "Make Admin Queue", "", {
      method: "POST",
      body: JSON.stringify({
        records: [{
          fields: {
            Command_ID: `STUDIO-SMV1-PREVIEW-${Date.now()}`,
            Action: "UPDATE_BLUEPRINT",
            Scenario_ID: ITEM4_SMV1_SCENARIO_ID,
            Scenario_Name: patched.name,
            Proposed_Blueprint_JSON_Original: JSON.stringify(patched),
            Write_Approved: true,
            Status: "Processing",
            Backup_Blueprint_Wrapper_2: JSON.stringify(blueprint),
            Requested_At: requestedAt,
            Started_At: requestedAt,
            Requested_By: "chicagoshining-studio-api",
            Correlation_ID: "ITEM4-R2-BROWSER-PREVIEW-CACHE",
            Notes: `Worker Item 8 ${ITEM4_VARIANT_RECIPE_VERSION}. Automatic Item 4 preview self-drain uses one SMV1 activation pulse per pending preview row when SMV1 is normally inactive. Requires the explicit fill-crop recipe on variant renders, keeps recipe-versioned transfer identities and Drive-file preview keys, preserves safe transfer-ID-only reuse and Google Drive + Media Assets durable authority, and does not alter scheduling/activation state.`,
          },
        }],
        typecast: true,
      }),
    });
    auditId = audit?.records?.[0]?.id || null;
  } catch {}

  let patchStatus = null;
  try {
    const patch = await fetch(`${makeApiBase}/scenarios/${ITEM4_SMV1_SCENARIO_ID}?confirmed=true`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ blueprint: JSON.stringify(patched) }),
    });
    patchStatus = patch.status;
    const patchText = await patch.text();
    if (!patch.ok) {
      throw new HttpError(patch.status, `SMV1 preview hardening failed (${patch.status}): ${patchText.slice(0, 300)}`);
    }

    const verify = await fetch(
      `${makeApiBase}/scenarios/${ITEM4_SMV1_SCENARIO_ID}/blueprint?draft=false`,
      { method: "GET", headers }
    );
    const verifyRaw = await verify.text();
    let verifyBody;
    try { verifyBody = verifyRaw ? JSON.parse(verifyRaw) : {}; } catch { verifyBody = { raw: verifyRaw }; }
    if (!verify.ok) {
      throw new HttpError(verify.status, `SMV1 preview post-deploy read failed (${verify.status})`);
    }
    const verified = verifyBody?.response?.blueprint || verifyBody?.blueprint || null;
    const verifiedSearch = phase6FindModule(verified?.flow, 1);
    const verifiedFormula = String(verifiedSearch?.mapper?.formula || "");
    const verifiedModule21 = phase6FindModule(verified?.flow, 21);
    const verifiedModule21Query = String(verifiedModule21?.mapper?.qs?.find?.((row) => row?.key === "q")?.value || "");
    const verifiedModule33 = phase6FindModule(verified?.flow, 33);
    const verifiedVariantRecipe = String(verifiedModule33?.mapper?.qs?.find?.((row) => row?.name === "recipe")?.value || "");
    const verifiedGravity = String(verifiedModule33?.mapper?.qs?.find?.((row) => row?.name === "g")?.value || "");
    if (!verifiedSearch ||
        !verifiedFormula.includes("Preview_Status") ||
        !verifiedFormula.includes('AND({Asset_Kind}="Master Original",{Transfer_Status}="Pending")') ||
        verifiedFormula.includes('OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded",AND({Transfer_Status}="Ready"') ||
        !phase6FindModule(verified?.flow, 60) ||
        !phase6FindModule(verified?.flow, 70) ||
        !verifiedModule21Query.includes("__STUDIO_VARIANT_FILENAME_REUSE_DISABLED__") ||
        verifiedVariantRecipe !== ITEM4_VARIANT_RECIPE_VERSION ||
        !verifiedGravity.includes("{{1.Variant_Style}}")) {
      throw new HttpError(502, "SMV1 post-deploy verification did not match the safe authority/preview selector contract");
    }

    if (auditId) {
      try {
        await airtableFetch(env, "Make Admin Queue", auditId, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              Status: "Succeeded",
              Completed_At: new Date().toISOString(),
              Result_JSON: JSON.stringify({
                ok: true,
                worker_build: "0.9.8",
                scenario_id: ITEM4_SMV1_SCENARIO_ID,
                deployed_name: verified?.name,
                make_patch_status: patchStatus,
                scheduling_changed: false,
                activation_changed: false,
              }),
            },
            typecast: true,
          }),
        });
      } catch {}
    }
    return { ok: true, already_ready: false, deployed_name: verified?.name };
  } catch (error) {
    if (auditId) {
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
                worker_build: "0.9.8",
                scenario_id: ITEM4_SMV1_SCENARIO_ID,
                make_patch_status: patchStatus,
              }),
            },
            typecast: true,
          }),
        });
      } catch {}
    }
    throw error;
  }
}
/*__STUDIO_WORKER_END:item4EnsureSmv1PreviewCacheWorker__*/

export async function item4PreviewPendingRows(env, recordId) {
  return listRecords(env, ITEM4_VARIANT_QUEUE_TABLE, {
    limit: 100,
    filterFormula:
      `AND({Production_Request_Record_ID}='${String(recordId).replace(/'/g, "\\'")}',{Transfer_Status}='Ready',{Preview_Status}='Pending')`,
  });
}
/*__STUDIO_WORKER_END:item4PreviewPendingRows__*/

export async function item4DrainPreviewCacheWorker(env, recordId, maxRuns = 30) {
  const pending = await item4PreviewPendingRows(env, recordId);
  if (!pending.length) return [];
  return item4PulseSmv1Python(env, recordId, maxRuns);
}
/*__STUDIO_WORKER_END:item4DrainPreviewCacheWorker__*/

export function mediaAssetPreviewRecordIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/media-assets\/(rec[A-Za-z0-9]+)\/(?:preview|stream)$/);
  if (!match) throw new HttpError(400, "Invalid media asset preview route");
  return match[1];
}
/*__STUDIO_WORKER_END:mediaAssetPreviewRecordIdFromPath__*/

export async function fetchGoogleDriveInlineImage(record, request) {
  const fileId = googleDriveFileId(record);
  if (!fileId) throw new HttpError(404, "Google Drive file ID is not available for this media asset");

  const headers = new Headers();
  headers.set("Accept", "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,*/*;q=0.5");
  const requestedRange = request.headers.get("Range");
  if (requestedRange) headers.set("Range", requestedRange);

  const urls = [
    googleDriveDownloadUrl(fileId),
    String(f(record, "Google Drive URL") || "").trim(),
  ].filter(Boolean);

  let lastResponse = null;
  for (const sourceUrl of [...new Set(urls)]) {
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers,
      redirect: "follow",
    });
    lastResponse = response;

    const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
    if (response.ok && contentType.startsWith("image/")) return response;

    try { await response.body?.cancel(); } catch {}
  }

  throw new HttpError(
    lastResponse?.status || 502,
    `Google Drive image preview fetch failed (${lastResponse?.status || "unknown"})`
  );
}
/*__STUDIO_WORKER_END:fetchGoogleDriveInlineImage__*/

export function copyDriveImageHeaders(upstream, record) {
  const headers = new Headers();
  for (const name of ["Content-Type", "Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Content-Type", headers.get("Content-Type") || String(f(record, "MIME_Type") || "image/jpeg"));
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Studio-Preview-Source", "google-drive-media-asset");
  headers.delete("Content-Disposition");
  return headers;
}

/*__STUDIO_WORKER_END:copyDriveImageHeaders__*/

export async function item4PreviewQueueRowForMediaAsset(env, mediaAssetRecordId) {
  const safeId = String(mediaAssetRecordId || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(safeId)) return null;
  const escaped = safeId.replace(/'/g, "\\'");
  const rows = await listRecords(env, ITEM4_VARIANT_QUEUE_TABLE, {
    limit: 10,
    filterFormula: `{Media_Asset_Record_ID}='${escaped}'`,
  });
  if (!rows.length) return null;
  const score = (row) => {
    let value = 0;
    if (String(f(row, "Asset_Kind") || "").trim() === "Master Original") value += 8;
    if (String(f(row, "Preview_Status") || "").trim() === "Ready") value += 4;
    if (String(f(row, "Preview_URL") || "").trim()) value += 2;
    if (String(f(row, "Transfer_Status") || "").trim() === "Ready") value += 1;
    return value;
  };
  return [...rows].sort((a, b) => score(b) - score(a))[0] || null;
}
/*__STUDIO_WORKER_END:item4PreviewQueueRowForMediaAsset__*/

export async function fetchStudioR2Preview(previewUrl, request) {
  const source = String(previewUrl || "").trim();
  if (!source) return null;
  const headers = new Headers();
  headers.set("Accept", "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,*/*;q=0.5");
  const requestedRange = request.headers.get("Range");
  if (requestedRange) headers.set("Range", requestedRange);

  const response = await fetch(source, { method: "GET", headers, redirect: "follow" });
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!response.ok || !contentType.startsWith("image/")) {
    try { await response.body?.cancel(); } catch {}
    return null;
  }
  return response;
}
/*__STUDIO_WORKER_END:fetchStudioR2Preview__*/

export async function mediaAssetDriveThumbnailPreview(record, env, request, source = "drive-photo-thumbnail") {
  const driveId = googleDriveFileId(record);
  if (!driveId) return null;
  const grabbed = await item4FetchDriveThumbnailBytes(driveId, env);
  if (!grabbed) return null;
  const headers = {
    "Content-Type": grabbed.contentType || "image/jpeg",
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "X-Studio-Preview-Source": source,
  };
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(grabbed.bytes, { status: 200, headers });
}
/*__STUDIO_WORKER_END:mediaAssetDriveThumbnailPreview__*/

export async function mediaAssetImagePreview(request, env, url, authorization) {
  if (!authorization?.authenticated || !authorization?.authorized) {
    throw new HttpError(401, "Authenticated Studio session required");
  }

  const recordId = mediaAssetPreviewRecordIdFromPath(url);
  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  if (Boolean(f(record, "Do_Not_Use"))) {
    throw new HttpError(403, "This media asset is marked Do Not Use");
  }
  const previewIsVideo = String(f(record, "Media_Class") || "").toLowerCase() === "video"
    || String(f(record, "MIME_Type") || "").toLowerCase().startsWith("video/");
  if (previewIsVideo) {
    const driveId = googleDriveFileId(record);
    if (driveId && request.method === "GET" && env.STUDIO_MEDIA) {
      try {
        const grabbed = await item4FetchDriveThumbnailBytes(driveId, env);
        if (grabbed) {
          return new Response(grabbed.bytes, {
            status: 200,
            headers: {
              "Content-Type": grabbed.contentType || "image/jpeg",
              "Cache-Control": "private, max-age=300",
              "X-Content-Type-Options": "nosniff",
              "X-Studio-Preview-Source": "drive-clip-poster",
            },
          });
        }
      } catch (error) {
        console.warn("Item 4 clip preview thumbnail fetch failed", error);
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect fill="#012559" width="100%" height="100%"/><circle cx="160" cy="150" r="36" fill="rgba(0,0,0,.35)"/><polygon points="152,132 152,168 180,150" fill="#fff"/><text x="50%" y="78%" fill="#f5c518" text-anchor="middle" font-family="sans-serif" font-size="22">CLIP</text></svg>`;
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  let queueRow = await item4PreviewQueueRowForMediaAsset(env, recordId);
  let previewUrl = String(queueRow ? f(queueRow, "Preview_URL") || "" : "").trim();

  if (!previewUrl && queueRow &&
      String(f(queueRow, "Transfer_Status") || "").trim() === "Ready" &&
      String(f(queueRow, "Preview_Status") || "").trim() === "Pending") {
    try {
      await item4DrainPreviewCacheWorker(
        env,
        String(f(queueRow, "Production_Request_Record_ID") || "").trim(),
        2
      );
      queueRow = await airtableFetch(env, ITEM4_VARIANT_QUEUE_TABLE, queueRow.id);
      previewUrl = String(f(queueRow, "Preview_URL") || "").trim();
    } catch (error) {
      console.warn("Item 4 on-demand browser preview cache generation failed", error);
    }
  }

  if (previewUrl) {
    const cached = await fetchStudioR2Preview(previewUrl, request);
    if (cached) {
      const headers = new Headers();
      for (const name of ["Content-Type", "Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
        const value = cached.headers.get(name);
        if (value) headers.set(name, value);
      }
      headers.set("Cache-Control", "private, max-age=300");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Studio-Preview-Source", "cloudflare-r2-transient-cache");
      headers.delete("Content-Disposition");
      if (request.method === "HEAD") {
        try { await cached.body?.cancel(); } catch {}
        return new Response(null, { status: 200, headers });
      }
      return new Response(cached.body, {
        status: cached.status === 206 ? 206 : 200,
        headers,
      });
    }
  }

  try {
    const thumb = await mediaAssetDriveThumbnailPreview(record, env, request);
    if (thumb) return thumb;
  } catch (error) {
    console.warn("Library photo Drive thumbnail preview failed", error);
  }

  if (mediaAssetIsHeic({
    mimeType: f(record, "MIME_Type"),
    fileExtension: f(record, "File_Extension"),
    name: f(record, "Asset Name"),
  })) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect fill="#eef3f2" width="100%" height="100%"/><text x="50%" y="48%" fill="#0c5b54" text-anchor="middle" font-family="sans-serif" font-size="18">HEIC</text><text x="50%" y="58%" fill="#627b77" text-anchor="middle" font-family="sans-serif" font-size="12">Preview catching up</text></svg>`;
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
        "X-Studio-Preview-Source": "heic-placeholder",
      },
    });
  }

  // Retain Drive fallback for browser-safe originals whose Drive permissions already allow it.
  if (request.method === "HEAD") {
    const upstream = await fetchGoogleDriveInlineImage(
      record,
      new Request(request.url, { method: "GET", headers: { Range: "bytes=0-0" } })
    );
    const headers = copyDriveImageHeaders(upstream, record);
    headers.delete("Content-Range");
    try { await upstream.body?.cancel(); } catch {}
    return new Response(null, { status: 200, headers });
  }

  const upstream = await fetchGoogleDriveInlineImage(record, request);
  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers: copyDriveImageHeaders(upstream, record),
  });
}
/*__STUDIO_WORKER_END:mediaAssetImagePreview__*/

export function outputPreviewRecordIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/outputs\/(rec[A-Za-z0-9]+)\/preview$/);
  if (!match) throw new HttpError(400, "Invalid output preview route");
  return match[1];
}
/*__STUDIO_WORKER_END:outputPreviewRecordIdFromPath__*/

export async function mediaAssetVideoStream(request, env, url, authorization) {
  if (!authorization?.authenticated || !authorization?.authorized) {
    throw new HttpError(401, "Authenticated Studio session required");
  }
  const recordId = mediaAssetPreviewRecordIdFromPath(url);
  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  if (Boolean(f(record, "Do_Not_Use"))) {
    throw new HttpError(403, "This media asset is marked Do Not Use");
  }
  const isVideo = String(f(record, "Media_Class") || "").toLowerCase() === "video"
    || String(f(record, "MIME_Type") || "").toLowerCase().startsWith("video/");
  if (!isVideo) throw new HttpError(415, "This media asset is not a video clip");
  const fileId = googleDriveFileId(record);
  const fileUrl = String(f(record, "Google Drive URL") || "").trim();
  if (!fileId) throw new HttpError(404, "Google Drive file ID is not available for this clip");

  if (request.method === "HEAD") {
    const probeRequest = new Request(request.url, { method: "GET", headers: { Range: "bytes=0-0" } });
    const upstream = await fetchGoogleDriveVideo(fileId, fileUrl, probeRequest, env);
    const headers = copyDriveVideoHeaders(upstream);
    try { await upstream.body?.cancel(); } catch {}
    return new Response(null, { status: 200, headers });
  }

  const upstream = await fetchGoogleDriveVideo(fileId, fileUrl, request, env);
  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers: copyDriveVideoHeaders(upstream),
  });
}
/*__STUDIO_WORKER_END:mediaAssetVideoStream__*/

export async function fetchGoogleDriveVideo(fileId, finalFileUrl, request, env = null) {
  if (!fileId) throw new HttpError(404, "Rendered preview file ID is not available");

  const headers = new Headers();
  headers.set("Accept", "video/mp4,video/*;q=0.9,*/*;q=0.8");
  const requestedRange = request.headers.get("Range");
  if (requestedRange) headers.set("Range", requestedRange);

  const token = env ? await item4GoogleAccessToken(env) : "";
  if (token) {
    const authHeaders = new Headers(headers);
    authHeaders.set("Authorization", `Bearer ${token}`);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { method: "GET", headers: authHeaders, redirect: "follow" }
    );
    const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
    if (response.ok && !contentType.includes("text/html")) return response;
    try { await response.body?.cancel(); } catch {}
  }

  const urls = [
    googleDriveDownloadUrl(fileId),
    String(finalFileUrl || "").trim(),
  ].filter(Boolean);

  let lastResponse = null;
  for (const sourceUrl of [...new Set(urls)]) {
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers,
      redirect: "follow",
    });
    lastResponse = response;

    const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
    if (response.ok && !contentType.includes("text/html")) return response;

    try { await response.body?.cancel(); } catch {}
  }

  throw new HttpError(lastResponse?.status || 502, `Google Drive rendered preview fetch failed (${lastResponse?.status || "unknown"})`);
}
/*__STUDIO_WORKER_END:fetchGoogleDriveVideo__*/

export function copyDriveVideoHeaders(upstream) {
  const headers = new Headers();
  for (const name of ["Content-Type", "Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Content-Type", headers.get("Content-Type") || "video/mp4");
  headers.set("Accept-Ranges", upstream.headers.get("Accept-Ranges") || "bytes");
  headers.set("Cache-Control", "private, max-age=120");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Studio-Preview-Source", "google-drive-render");
  headers.delete("Content-Disposition");
  return headers;
}
/*__STUDIO_WORKER_END:copyDriveVideoHeaders__*/

export async function fetchStudioPreviewVideo(previewUrl, request) {
  const source = String(previewUrl || "").trim();
  if (!source) throw new HttpError(404, "Studio preview URL is not available");

  const headers = new Headers();
  headers.set("Accept", "video/mp4,video/*;q=0.9,*/*;q=0.8");
  const requestedRange = request.headers.get("Range");
  if (requestedRange) headers.set("Range", requestedRange);

  const response = await fetch(source, {
    method: "GET",
    headers,
    redirect: "follow",
  });
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!response.ok || contentType.includes("text/html")) {
    try { await response.body?.cancel(); } catch {}
    throw new HttpError(response.status || 502, `Studio R2 preview fetch failed (${response.status || "unknown"})`);
  }
  return response;
}
/*__STUDIO_WORKER_END:fetchStudioPreviewVideo__*/

export function copyStudioPreviewHeaders(upstream, source = "cloudflare-r2-studio-preview") {
  const headers = new Headers();
  for (const name of ["Content-Type", "Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Content-Type", headers.get("Content-Type") || "video/mp4");
  headers.set("Accept-Ranges", upstream.headers.get("Accept-Ranges") || "bytes");
  headers.set("Cache-Control", "private, max-age=60");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Studio-Preview-Source", source);
  headers.delete("Content-Disposition");
  return headers;
}
/*__STUDIO_WORKER_END:copyStudioPreviewHeaders__*/

export async function outputPreview(request, env, url, authorization) {
  if (!authorization?.authorized) throw new HttpError(403, "Authorized Studio membership required");

  const recordId = outputPreviewRecordIdFromPath(url);
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId);
  const studioPreviewUrl = [
    f(record, "Publish_Asset_URL"),
    f(record, "Final_File_URL"),
    f(record, "Studio_Preview_URL"),
    f(record, "Render_Server_URL"),
  ].map((value) => String(value || "").trim()).find((href) => (
    item4UrlIsPublicPlayableVideo(href)
    || (item4UrlIsPublicPublishCdn(href) && !/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(href))
    || item4UrlIsRenderServerVideo(href)
  )) || "";

  // Preferred Phase 6 path: R5 writes a browser-playable MP4 copy to the existing
  // ChicagoShining R2 media host. When that copy is absent, stream the Remotion
  // render-server /out/*.mp4 (same host R4 stamped on Render_Server_URL). The Studio
  // API remains the authenticated URL the browser sees; Range requests are preserved
  // so the native <video> player can seek.
  if (studioPreviewUrl) {
    const previewSource = item4UrlIsRenderServerVideo(studioPreviewUrl)
      ? "render-server-out"
      : "cloudflare-r2-studio-preview";
    try {
      if (request.method === "HEAD") {
        const probeRequest = new Request(request.url, { method: "GET", headers: { Range: "bytes=0-0" } });
        const upstream = await fetchStudioPreviewVideo(studioPreviewUrl, probeRequest);
        const headers = copyStudioPreviewHeaders(upstream, previewSource);
        const contentRange = upstream.headers.get("Content-Range") || "";
        const totalMatch = contentRange.match(/\/(\d+)$/);
        if (totalMatch?.[1]) headers.set("Content-Length", totalMatch[1]);
        headers.delete("Content-Range");
        try { await upstream.body?.cancel(); } catch {}
        return new Response(null, { status: 200, headers });
      }

      const upstream = await fetchStudioPreviewVideo(studioPreviewUrl, request);
      const headers = copyStudioPreviewHeaders(upstream, previewSource);
      const status = upstream.status === 206 ? 206 : 200;
      return new Response(upstream.body, { status, headers });
    } catch (error) {
      console.warn("Studio public preview unavailable; trying legacy MP4 source", error);
    }
  }

  // Compatibility fallback for older rendered outputs that predate R5 v2.3.
  // Private Drive files generally cannot be fetched server-side without Google OAuth,
  // Return an explicit HTTP error if the MP4 cannot be streamed; never embed Drive.
  const fileId = String(f(record, "Final_File_ID") || extractGoogleDriveFileId(f(record, "Final_File_URL")) || extractGoogleDriveFileId(f(record, "Output_URL")) || "").trim();
  if (!fileId) throw new HttpError(404, "No rendered preview file is available for this output");
  const finalFileUrl = f(record, "Final_File_URL") || f(record, "Output_URL") || null;

  if (request.method === "HEAD") {
    const probeRequest = new Request(request.url, { method: "GET", headers: { Range: "bytes=0-0" } });
    const upstream = await fetchGoogleDriveVideo(fileId, finalFileUrl, probeRequest, env);
    const headers = copyDriveVideoHeaders(upstream);
    const contentRange = upstream.headers.get("Content-Range") || "";
    const totalMatch = contentRange.match(/\/(\d+)$/);
    if (totalMatch?.[1]) headers.set("Content-Length", totalMatch[1]);
    headers.delete("Content-Range");
    try { await upstream.body?.cancel(); } catch {}
    return new Response(null, { status: 200, headers });
  }

  const upstream = await fetchGoogleDriveVideo(fileId, finalFileUrl, request, env);
  const headers = copyDriveVideoHeaders(upstream);
  const status = upstream.status === 206 ? 206 : 200;
  return new Response(upstream.body, { status, headers });
}

/*__STUDIO_WORKER_END:outputPreview__*/

export function phase6NarrationVoiceFallback(voiceId, voiceName) {
  const id = String(voiceId || "").trim();
  const name = String(voiceName || "").trim();
  if (id) return { voice_id: id, voice_name: name || id };
  return { voice_id: PHASE6_DEFAULT_VOICE_ID, voice_name: "Kate" };
}
/*__STUDIO_WORKER_END:phase6NarrationVoiceFallback__*/

export async function phase6ResolveNarrationVoice(env, outputRecord, parentRecord = null) {
  const fromOutput = phase6NarrationVoiceFallback(
    f(outputRecord || {}, "Voice_ID"),
    f(outputRecord || {}, "Voice_Name")
  );
  if (fromOutput.voice_id && fromOutput.voice_id !== PHASE6_DEFAULT_VOICE_ID) return fromOutput;

  let parent = parentRecord;
  const parentId = studioFirstLinkedId(f(outputRecord || {}, "Content_Item"));
  if (!parent && parentId) {
    try {
      parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId);
    } catch (error) {
      console.warn("phase6ResolveNarrationVoice parent load failed", parentId, error);
    }
  }
  if (parent) {
    const fromParent = phase6NarrationVoiceFallback(f(parent, "Voice_ID"), f(parent, "Voice_Name"));
    if (fromParent.voice_id && fromParent.voice_id !== PHASE6_DEFAULT_VOICE_ID) return fromParent;

    const prId = studioFirstLinkedId(f(parent, "Production_Request"))
      || studioFirstLinkedId(f(parent, "Production Requests"));
    if (prId) {
      try {
        const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, prId);
        const fromRequest = phase6NarrationVoiceFallback(
          f(requestRecord, "Voice_ID"),
          f(requestRecord, "Voice_Name")
        );
        if (fromRequest.voice_id && fromRequest.voice_id !== PHASE6_DEFAULT_VOICE_ID) return fromRequest;
      } catch (error) {
        console.warn("phase6ResolveNarrationVoice production request load failed", prId, error);
      }
    }

    const profileId = studioFirstLinkedId(f(parent, "Content_Profile"));
    if (profileId) {
      try {
        const profile = await airtableFetch(env, "Content Profiles", profileId);
        const fromProfile = phase6NarrationVoiceFallback(
          f(profile, "Default_Narration_Voice_ID"),
          f(profile, "Default_Narration_Voice_Name")
        );
        if (fromProfile.voice_id) return fromProfile;
      } catch (error) {
        console.warn("phase6ResolveNarrationVoice profile load failed", profileId, error);
      }
    }

    if (fromParent.voice_id) return fromParent;
  }
  return fromOutput.voice_id ? fromOutput : { voice_id: PHASE6_DEFAULT_VOICE_ID, voice_name: "Kate" };
}
/*__STUDIO_WORKER_END:phase6ResolveNarrationVoice__*/

export function phase6NarrationVoiceFromRequest(requestRecord, parentRecord = null) {
  const fromRequest = phase6NarrationVoiceFallback(
    f(requestRecord || {}, "Voice_ID"),
    f(requestRecord || {}, "Voice_Name")
  );
  if (fromRequest.voice_id && fromRequest.voice_id !== PHASE6_DEFAULT_VOICE_ID) return fromRequest;
  const fromParent = phase6NarrationVoiceFallback(
    f(parentRecord || {}, "Voice_ID"),
    f(parentRecord || {}, "Voice_Name")
  );
  if (fromParent.voice_id && fromParent.voice_id !== PHASE6_DEFAULT_VOICE_ID) return fromParent;
  return fromRequest.voice_id ? fromRequest : (fromParent.voice_id ? fromParent : { voice_id: PHASE6_DEFAULT_VOICE_ID, voice_name: "Kate" });
}/*__STUDIO_WORKER_END:phase6NarrationVoiceFromRequest__*/

export function phase6RecordIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/outputs\/(rec[A-Za-z0-9]+)\/creative(?:\/review)?$/);
  if (!match) throw new HttpError(400, "Invalid Phase 6 creative route");
  return match[1];
}
/*__STUDIO_WORKER_END:phase6RecordIdFromPath__*/

export function phase6ParseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}
/*__STUDIO_WORKER_END:phase6ParseJson__*/

export function phase6Number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
/*__STUDIO_WORKER_END:phase6Number__*/

export function phase6Clamp(value, min, max, fallback) {
  const n = phase6Number(value, fallback);
  if (n === null || n === undefined) return fallback;
  return Math.max(min, Math.min(max, n));
}
/*__STUDIO_WORKER_END:phase6Clamp__*/

export function phase6ResolvedVoiceoverVolume(record, fallback = 1) {
  const primary = f(record, "Voiceover_Volume");
  const render = f(record, "Voiceover_Render_Volume");
  return phase6Clamp(primary == null || primary === "" ? render : primary, 0, 1.25, fallback);
}
/*__STUDIO_WORKER_END:phase6ResolvedVoiceoverVolume__*/

export function phase6AudioMixFieldsFromPayload(payload, current) {
  const audio = payload?.audio && typeof payload.audio === "object" ? payload.audio : {};
  const voiceoverVolume = phase6Clamp(audio.voiceover_volume, 0, 1.25, current?.voiceover?.volume ?? 1);
  const normal = phase6Clamp(audio.normal_volume, 0, 1, current?.music?.normal_volume ?? STUDIO_DEFAULT_MUSIC_VOLUME);
  const ducked = phase6Clamp(
    audio.ducked_volume,
    0,
    1,
    current?.music?.ducked_volume ?? STUDIO_DEFAULT_DUCKED_MUSIC_VOLUME
  );
  const duckEnabled = phase6Bool(audio.ducking_enabled, current?.music?.ducking_enabled !== false);
  const duckFade = Math.round(phase6Clamp(audio.duck_fade_frames, 0, 90, current?.music?.duck_fade_frames ?? 6));
  if (duckEnabled && ducked > normal) {
    throw new HttpError(400, "Ducked music volume cannot be greater than normal music volume while ducking is enabled");
  }
  return {
    Voiceover_Volume: voiceoverVolume,
    Voiceover_Render_Volume: voiceoverVolume,
    Music_Volume: normal,
    Music_Ducked_Volume: ducked,
    Music_Ducking_Enabled: duckEnabled,
    Music_Duck_Fade_Frames: duckFade,
  };
}
/*__STUDIO_WORKER_END:phase6AudioMixFieldsFromPayload__*/

export function phase6ProductionMixAction(action) {
  return ["apply_audio_mix", "apply_mix", "remix", "changes", "changes_requested", "revise", "revision"].includes(String(action || ""));
}
/*__STUDIO_WORKER_END:phase6ProductionMixAction__*/

export function phase6AssertProductionAudioMixAllowed(record) {
  if (Boolean(f(record, "Do_Not_Publish"))) {
    throw new HttpError(409, "Do_Not_Publish outputs use the full creative editor, not production mix revision");
  }
  const outputStatus = String(f(record, "Output_Status") || "").trim();
  const reviewStatus = String(f(record, "Review_Status") || "").trim();
  const publishStatus = String(f(record, "Publish_Status") || "").trim();
  const renderStatus = String(f(record, "Render_Status") || "").trim();
  if (reviewStatus === "Approved" || outputStatus === "Approved for Publishing" || ["Published", "Publishing", "Scheduled"].includes(publishStatus)) {
    throw new HttpError(409, "This output is already in publishing and cannot have its mix changed from review");
  }
  if (renderStatus === "Rendering") {
    throw new HttpError(409, "A render is already in progress. Wait until it finishes before applying a new mix.");
  }
  const composition = String(f(record, "Composition_ID") || "").trim();
  const filename = String(f(record, "Output_Filename") || "").trim();
  const clips = String(f(record, "Render_Clip_List_JSON") || "").trim();
  if (!composition || !filename || !clips) {
    throw new HttpError(409, "This output does not have a render package yet, so the mix cannot be rerendered from review.");
  }
  const statusOk = ["Ready for Review", "In Production"].includes(outputStatus)
    || ["Review Sent", "Changes Requested"].includes(reviewStatus);
  if (!statusOk) {
    throw new HttpError(409, "Audio mix can be changed only while this output is in review");
  }
}
/*__STUDIO_WORKER_END:phase6AssertProductionAudioMixAllowed__*/

export function phase6AllowsProductionMixContinuation(record) {
  const renderStatus = String(f(record, "Render_Status") || "");
  const reviewStatus = String(f(record, "Review_Status") || "");
  const outputStatus = String(f(record, "Output_Status") || "");
  if (reviewStatus === "Changes Requested") return true;
  if (["Ready for Render", "Rendering"].includes(renderStatus)) return true;
  if (renderStatus === "Rendered" && phase6CurrentRenderStartedAfterReview(record)) return true;
  if (outputStatus === "In Production" && !phase6PreviewFulfillsCurrentReview(record)) return true;
  return false;
}
/*__STUDIO_WORKER_END:phase6AllowsProductionMixContinuation__*/

export function phase6Bool(value, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;
  return fallback;
}
/*__STUDIO_WORKER_END:phase6Bool__*/

export function phase6Text(value, max = 10000) {
  return String(value ?? "").trim().slice(0, max);
}
/*__STUDIO_WORKER_END:phase6Text__*/

export function phase6VariantForRatio(slide, ratio) {
  if (ratio === "4:5") return f(slide, "Asset_4x5_Public_URL") || f(slide, "Asset_4x5_File_URL");
  if (ratio === "9:16") return f(slide, "Asset_9x16_Public_URL") || f(slide, "Asset_9x16_File_URL");
  if (ratio === "1:1") return f(slide, "Asset_1x1_Public_URL") || f(slide, "Asset_1x1_File_URL");
  return null;
}
/*__STUDIO_WORKER_END:phase6VariantForRatio__*/

export function phase6SlidePreviewUrl(slide, ratio) {
  return phase6VariantForRatio(slide, ratio) ||
    f(slide, "Final Image URL") || f(slide, "Watermarked Image URL") ||
    f(slide, "Current Image URL") || f(slide, "AI Image URL") || null;
}
/*__STUDIO_WORKER_END:phase6SlidePreviewUrl__*/

export function mapPhase6CreativeSlide(slide, targetRatio = null, defaultVoiceoverVolume = 1, platform = "", preferredVoice = null) {
  const directives = phase6ParseJson(f(slide, "Creative_Directives_JSON"), {}) || {};
  const overlay = directives.overlay && typeof directives.overlay === "object" ? directives.overlay : {};
  const voiceover = directives.voiceover && typeof directives.voiceover === "object" ? directives.voiceover : {};
  const motion = directives.motion && typeof directives.motion === "object" ? directives.motion : {};
  const transition = directives.transition && typeof directives.transition === "object" ? directives.transition : {};
  const preferredId = String(preferredVoice?.voice_id || "").trim();
  const preferredName = String(preferredVoice?.voice_name || "").trim();
  const legacyName = String(f(slide, "Slide_Voice") || phase6Text(voiceover.voice, 80) || "").trim().toLowerCase();
  const slideVoiceId = String(
    f(slide, "Slide_Voice_ID")
    || phase6Text(voiceover.voiceId, 120)
    || ""
  ).trim();
  const resolvedVoiceId = slideVoiceId
    || preferredId
    || (legacyName === "george" ? PHASE6_GEORGE_VOICE_ID : "")
    || PHASE6_DEFAULT_VOICE_ID;
  const resolvedVoiceName = String(
    f(slide, "Slide_Voice_Name")
    || f(slide, "Slide_Voice")
    || phase6Text(voiceover.voice, 120)
    || preferredName
    || (resolvedVoiceId === PHASE6_GEORGE_VOICE_ID ? "George" : resolvedVoiceId === PHASE6_DEFAULT_VOICE_ID ? "Kate" : resolvedVoiceId)
  ).trim() || "Kate";
  const variants = {
    "4:5": phase6VariantForRatio(slide, "4:5"),
    "9:16": phase6VariantForRatio(slide, "9:16"),
    "1:1": phase6VariantForRatio(slide, "1:1"),
    "16:9": null,
  };
  return {
    id: slide.id,
    name: f(slide, "Slide Name"),
    slide_number: f(slide, "Slide Number"),
    order: f(slide, "Current Order") || f(slide, "Slide Number"),
    is_cover: Boolean(f(slide, "Is Cover")),
    review_status: f(slide, "Review Status"),
    include: directives.include !== false && !Boolean(f(slide, "Deleted From Carousel")),
    duration_seconds: phase6Number(directives.durationSeconds, null),
    focal_point: phase6Text(directives.focalPoint || "center", 40) || "center",
    fit_mode: phase6Text(directives.fitMode || "fill_crop", 60) || "fill_crop",
    safe_area_aware: directives.safeAreaAware !== false,
    overlay: {
      enabled: overlay.enabled !== false && phase6Text(overlay.stylePreset, 80) !== "No Text",
      text: phase6Text(overlay.text, 1000),
      style_preset: phase6Text(overlay.stylePreset || "Chicago Editorial", 80),
      role: phase6Text(overlay.role || "overlay", 60),
      position: phase6Text(overlay.position || phase6DefaultOverlayPosition(targetRatio), 60),
      size: phase6Number(overlay.size, 64),
      version: Math.max(1, Math.round(phase6Number(overlay.version, 1))),
      eyebrow: phase6Text(overlay.eyebrow, 250),
      subtitle: phase6Text(overlay.subtitle || overlay.caption, 500),
      caption: phase6Text(overlay.caption || overlay.subtitle, 500),
      accent_text: phase6Text(overlay.accentText, 500),
      brand: phase6Text(overlay.brand, 250),
      background_opacity: phase6Number(overlay.backgroundOpacity, null),
      animation: phase6Text(overlay.animation || "fade", 60),
      start_fraction: phase6Clamp(overlay.startFraction ?? overlay.start_fraction, 0, 1, 0),
      end_fraction: phase6Clamp(overlay.endFraction ?? overlay.end_fraction, 0, 1, 1),
    },
    voice_prep_request_id: f(slide, "Studio_Voice_Prep_Request_ID") || null,
    voiceover: {
      enabled: voiceover.enabled !== false && String(f(slide, "Slide_Voiceover_Status") || "") !== "Not Requested",
      text: f(slide, "Slide_Voiceover_Text") || phase6Text(voiceover.text, 5000),
      voice_id: resolvedVoiceId,
      voice: resolvedVoiceName,
      url: f(slide, "Slide_Voiceover_URL"),
      duration_seconds: f(slide, "Slide_Voiceover_Duration_Seconds"),
      status: f(slide, "Slide_Voiceover_Status"),
      volume_override: phase6Number(voiceover.volumeOverride, null),
      volume: phase6Number(voiceover.volumeOverride, null) ?? phase6Clamp(defaultVoiceoverVolume, 0, 1.25, 1),
    },
    motion: { type: phase6Text(motion.type || "none", 60) || "none" },
    transition: {
      type: phase6Text(transition.type || "fade", 60) || "fade",
      duration_frames: phase6Number(transition.durationFrames, 12),
    },
    preview_url: phase6SlidePreviewUrl(slide, targetRatio),
    current_image_url: f(slide, "Current Image URL"),
    final_image_url: f(slide, "Final Image URL"),
    variants,
    exact_variant_available: Boolean(targetRatio && variants[targetRatio]),
    tiktok_safe_zone_status: f(slide, "TikTok_9x16_Safe_Zone_Status"),
    tiktok_safe_zone_notes: f(slide, "TikTok_9x16_Safe_Zone_Notes"),
    creative_directives_raw: f(slide, "Creative_Directives_JSON"),
  };
}
/*__STUDIO_WORKER_END:mapPhase6CreativeSlide__*/

export function phase6VirtualSlidesFromSelectedAssets(outputRecord, preferredVoice = null) {
  const parsed = phase6ParseJson(f(outputRecord, "Selected_Assets_JSON"), null) || {};
  const clips = selectedVisualClips(outputRecord);
  const ratio = String(f(outputRecord, "Aspect_Ratio") || "").trim() || null;
  const fps = Number(parsed.fps || 30) || 30;
  const narration = preferredVoice?.voice_id
    ? preferredVoice
    : phase6NarrationVoiceFallback(f(outputRecord, "Voice_ID"), f(outputRecord, "Voice_Name"));
  return clips.map((clip, index) => {
    const url = clip.url || clip.src || clip.google_drive_url || null;
    const durationFrames = Number(clip.durationFrames || clip.duration_frames || 0);
    const durationSeconds = durationFrames > 0 ? durationFrames / fps : Number(clip.recommended_duration_seconds || 4);
    const variants = { "4:5": null, "9:16": null, "1:1": null, "16:9": null };
    if (ratio && url) variants[ratio] = url;
    const overlayText = String(clip.overlay?.text || clip.caption || "").trim();
    const overlayEnabled = clip.overlay?.enabled !== false && Boolean(overlayText);
    return {
      id: clip.id || `virtual-source-${index + 1}`,
      name: clip.asset_name || clip.assetName || `Photo ${index + 1}`,
      slide_number: index + 1,
      order: Number(clip.order || index + 1),
      is_cover: index === 0,
      review_status: null,
      include: true,
      duration_seconds: durationSeconds,
      focal_point: "center",
      fit_mode: "fill_crop",
      safe_area_aware: true,
      overlay: {
        enabled: overlayEnabled,
        text: overlayText,
        style_preset: String(clip.overlay?.stylePreset || clip.overlay?.style_preset || "Lower Third / Minimal"),
        role: String(clip.overlay?.role || "caption"),
        position: String(clip.overlay?.position || studioBurnedInOverlayPosition(ratio)),
        size: Number(clip.overlay?.size || 52),
        version: 1,
        eyebrow: "",
        subtitle: "",
        caption: overlayText,
        accent_text: "",
        brand: phase6Text(parsed?.render_prep?.brand_text, 250),
        background_opacity: Number(clip.overlay?.backgroundOpacity ?? 0.4),
        animation: String(clip.overlay?.animation || "fade"),
        start_fraction: 0,
        end_fraction: 1,
      },
      voice_prep_request_id: null,
      voiceover: (() => {
        const itemVoiceoverUrl = String(f(outputRecord, "Voiceover_URL") || "").trim();
        const itemVoiceoverOn = String(f(outputRecord, "Studio_Effective_Voiceover_Mode") || "").trim() === "Yes" || Boolean(itemVoiceoverUrl);
        return {
          enabled: itemVoiceoverOn,
          text: "",
          voice_id: narration.voice_id || PHASE6_DEFAULT_VOICE_ID,
          voice: narration.voice_name || String(f(outputRecord, "Voice_Name") || "Kate"),
          url: itemVoiceoverUrl || null,
          duration_seconds: null,
          status: itemVoiceoverUrl ? "Item voiceover" : (itemVoiceoverOn ? "Requested" : "Not Requested"),
          volume_override: null,
          volume: phase6ResolvedVoiceoverVolume(outputRecord),
        };
      })(),
      motion: { type: "none" },
      transition: { type: "fade", duration_frames: 12 },
      preview_url: url,
      current_image_url: url,
      final_image_url: url,
      variants,
      exact_variant_available: Boolean(ratio && variants[ratio]),
      tiktok_safe_zone_status: null,
      tiktok_safe_zone_notes: null,
      creative_directives_raw: null,
      virtual: true,
    };
  }).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}
/*__STUDIO_WORKER_END:phase6VirtualSlidesFromSelectedAssets__*/

export async function phase6SlidesForOutput(env, outputRecord, preferredVoice = null) {
  const narration = preferredVoice || await phase6ResolveNarrationVoice(env, outputRecord);
  const ids = Array.isArray(f(outputRecord, "Carousel Slides")) ? f(outputRecord, "Carousel Slides") : [];
  if (!ids.length) return phase6VirtualSlidesFromSelectedAssets(outputRecord, narration);
  const records = await Promise.all(ids.map(id => airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, id)));
  const ratio = String(f(outputRecord, "Aspect_Ratio") || "").trim() || null;
  const platform = String(f(outputRecord, "Platform") || "").trim();
  const defaultVoiceoverVolume = phase6ResolvedVoiceoverVolume(outputRecord);
  return records.map(record => mapPhase6CreativeSlide(record, ratio, defaultVoiceoverVolume, platform, narration))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}
/*__STUDIO_WORKER_END:phase6SlidesForOutput__*/

export async function phase6CachedVoiceCatalog(env) {
  let records = [];
  try {
    records = await listRecords(env, PHASE6_VOICE_CATALOG_TABLE, {
      limit: 500,
      sortField: "Voice_Name",
      sortDirection: "asc",
      filterFormula: "{Active}=1",
    });
  } catch (error) {
    console.warn("Phase 6 cached voice catalog unavailable", error);
  }
  const voices = records.map((record) => ({
    id: phase6Text(f(record, "Voice_ID"), 120),
    name: phase6Text(f(record, "Voice_Name"), 120),
    preview_url: phase6Text(f(record, "Preview_URL"), 2000) || null,
    category: phase6Text(f(record, "Category"), 120) || null,
    accent: phase6Text(f(record, "Accent"), 120) || null,
    gender: phase6Text(f(record, "Gender"), 120) || null,
    age: phase6Text(f(record, "Age"), 120) || null,
    use_case: phase6Text(f(record, "Use_Case"), 200) || null,
    description: phase6Text(f(record, "Description"), 1000) || null,
    is_default: Boolean(f(record, "Is_Current_Default")),
    source: "airtable-cache",
  })).filter((voice) => voice.id && voice.name);
  if (!voices.some((voice) => voice.id === PHASE6_DEFAULT_VOICE_ID)) {
    voices.unshift({ id: PHASE6_DEFAULT_VOICE_ID, name: "Kate", preview_url: null, category: null, accent: null, gender: null, age: null, use_case: null, description: null, is_default: true, source: "legacy-fallback" });
  }
  if (!voices.some((voice) => voice.id === PHASE6_GEORGE_VOICE_ID)) {
    voices.push({ id: PHASE6_GEORGE_VOICE_ID, name: "George", preview_url: null, category: null, accent: null, gender: null, age: null, use_case: null, description: null, is_default: false, source: "legacy-fallback" });
  }
  return voices;
}
/*__STUDIO_WORKER_END:phase6CachedVoiceCatalog__*/

export function mapElevenLabsVoice(voice) {
  const labels = voice?.labels && typeof voice.labels === "object" ? voice.labels : {};
  const id = phase6Text(voice?.voice_id, 120);
  const name = phase6Text(voice?.name, 120);
  if (!id || !name) return null;
  return {
    id,
    name,
    preview_url: phase6Text(voice?.preview_url, 2000) || null,
    category: phase6Text(voice?.category, 120) || null,
    accent: phase6Text(labels?.accent, 120) || null,
    gender: phase6Text(labels?.gender, 120) || null,
    age: phase6Text(labels?.age, 120) || null,
    use_case: phase6Text(labels?.use_case, 200) || null,
    description: phase6Text(voice?.description || labels?.description, 1000) || null,
    is_default: id === PHASE6_DEFAULT_VOICE_ID,
    source: "elevenlabs-live",
  };
}
/*__STUDIO_WORKER_END:mapElevenLabsVoice__*/

export function phase6ElevenLabsErrorDetail(status, body) {
  const detail = body?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim().slice(0, 240);
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).trim().slice(0, 240);
  if (detail && typeof detail === "object") {
    const message = detail.message || detail.msg || detail.status;
    if (message) return String(message).trim().slice(0, 240);
  }
  const message = body?.message || body?.error;
  if (typeof message === "string" && message.trim()) return message.trim().slice(0, 240);
  return `ElevenLabs request failed (${status})`;
}
/*__STUDIO_WORKER_END:phase6ElevenLabsErrorDetail__*/

export async function phase6FetchElevenLabsJson(env, path) {
  const apiKey = String(env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) return { configured: false, ok: false, status: 0, body: null, error: null };
  const response = await fetch(`https://api.elevenlabs.io${path}`, {
    method: "GET",
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return {
    configured: true,
    ok: response.ok,
    status: response.status,
    body,
    error: response.ok ? null : phase6ElevenLabsErrorDetail(response.status, body),
  };
}
/*__STUDIO_WORKER_END:phase6FetchElevenLabsJson__*/

export function phase6CollectElevenLabsVoices(body) {
  return (Array.isArray(body?.voices) ? body.voices : []).map(mapElevenLabsVoice).filter(Boolean);
}
/*__STUDIO_WORKER_END:phase6CollectElevenLabsVoices__*/

export async function phase6LiveElevenLabsVoices(env) {
  const apiKey = String(env.ELEVENLABS_API_KEY || "").trim();
  if (!apiKey) return { configured: false, voices: [], error: null, source: null };
  try {
    const voices = [];
    let nextPageToken = null;
    let pages = 0;
    let lastError = null;
    do {
      const query = new URLSearchParams();
      if (pages === 0 && !nextPageToken && lastError) {
        // Retry with ElevenLabs defaults if page_size was rejected.
      } else {
        query.set("page_size", "100");
      }
      if (nextPageToken) query.set("next_page_token", nextPageToken);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const page = await phase6FetchElevenLabsJson(env, `/v2/voices${suffix}`);
      if (!page.ok) {
        lastError = page.error;
        if (pages === 0 && !nextPageToken && query.has("page_size")) continue;
        break;
      }
      lastError = null;
      voices.push(...phase6CollectElevenLabsVoices(page.body));
      nextPageToken = page.body?.has_more ? phase6Text(page.body?.next_page_token, 500) : null;
      pages += 1;
    } while ((nextPageToken && pages < 8 && voices.length < 800) || (pages === 0 && lastError && voices.length === 0));

    if (voices.length) return { configured: true, voices, error: null, source: "elevenlabs-v2" };

    const v1 = await phase6FetchElevenLabsJson(env, "/v1/voices");
    const v1Voices = v1.ok ? phase6CollectElevenLabsVoices(v1.body) : [];
    if (v1Voices.length) return { configured: true, voices: v1Voices, error: null, source: "elevenlabs-v1" };

    return {
      configured: true,
      voices: [],
      error: lastError || v1.error || "ElevenLabs returned no voices",
      source: null,
    };
  } catch (error) {
    console.warn("ElevenLabs live voice catalog unavailable", error);
    return { configured: true, voices: [], error: error instanceof Error ? error.message : "ElevenLabs voice catalog unavailable", source: null };
  }
}
/*__STUDIO_WORKER_END:phase6LiveElevenLabsVoices__*/

export async function phase6VoiceCatalog(env) {
  const cached = await phase6CachedVoiceCatalog(env);
  const live = await phase6LiveElevenLabsVoices(env);
  const source = live.voices.length ? live.voices : cached;
  const byId = new Map();
  for (const voice of source) byId.set(voice.id, voice);
  // Always preserve the proven legacy voices as fallbacks even if the live account list changes.
  for (const voice of cached) {
    const existing = byId.get(voice.id);
    if (!existing) byId.set(voice.id, voice);
    else if (!existing.preview_url && voice.preview_url) byId.set(voice.id, { ...existing, preview_url: voice.preview_url });
  }
  const voices = Array.from(byId.values()).sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
  return {
    voices,
    live_connected: Boolean(live.configured && live.voices.length),
    live_configured: Boolean(live.configured),
    live_error: live.error,
    live_source: live.source || null,
    default_voice_id: PHASE6_DEFAULT_VOICE_ID,
  };
}
/*__STUDIO_WORKER_END:phase6VoiceCatalog__*/

export async function listPhase6Voices(request, env, authorization) {
  const catalog = await phase6VoiceCatalog(env);
  return respond(request, env, {
    ok: true,
    ...catalog,
    generation_authority: "voice_id",
    current_default_preserved: true,
    make_mapping: "finalized-server-side-on-creative-save",
  });
}
/*__STUDIO_WORKER_END:listPhase6Voices__*/

export async function phase6VoicePreviewUrl(env, voiceId) {
  const apiKey = String(env.ELEVENLABS_API_KEY || "").trim();
  if (apiKey) {
    const detail = await phase6FetchElevenLabsJson(env, `/v1/voices/${encodeURIComponent(voiceId)}`);
    const liveUrl = phase6Text(detail.body?.preview_url, 2000) || null;
    if (liveUrl) return liveUrl;
  }
  const catalog = await phase6VoiceCatalog(env);
  return catalog.voices.find((voice) => voice.id === voiceId)?.preview_url || null;
}
/*__STUDIO_WORKER_END:phase6VoicePreviewUrl__*/

export async function phase6VoicePreview(request, env, url) {
  const identity = accessIdentity(request);
  if (!identity.email && !identity.jwt_present) {
    throw new HttpError(401, "Authenticated Studio session required");
  }

  const match = url.pathname.match(/^\/api\/voices\/([A-Za-z0-9_-]+)\/preview$/);
  if (!match) throw new HttpError(400, "Invalid voice preview route");
  const voiceId = match[1];
  const previewUrl = await phase6VoicePreviewUrl(env, voiceId);
  if (!previewUrl) throw new HttpError(404, `No ElevenLabs preview is available for ${voiceId}`);

  const upstream = await fetch(previewUrl, {
    method: "GET",
    headers: { Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8" },
    redirect: "follow",
  });
  if (!upstream.ok) {
    try { await upstream.body?.cancel(); } catch {}
    throw new HttpError(upstream.status === 404 ? 404 : 502, `ElevenLabs preview fetch failed (${upstream.status})`);
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") || "audio/mpeg");
  const length = upstream.headers.get("Content-Length");
  if (length) headers.set("Content-Length", length);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Studio-Preview-Source", "elevenlabs");
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);

  if (request.method === "HEAD") {
    try { await upstream.body?.cancel(); } catch {}
    return new Response(null, { status: 200, headers });
  }
  return new Response(upstream.body, { status: 200, headers });
}
/*__STUDIO_WORKER_END:phase6VoicePreview__*/

export function phase6FindModule(flow, moduleId) {
  for (const item of Array.isArray(flow) ? flow : []) {
    if (Number(item?.id) === Number(moduleId)) return item;
    if (Array.isArray(item?.routes)) {
      for (const route of item.routes) {
        const found = phase6FindModule(route?.flow, moduleId);
        if (found) return found;
      }
    }
  }
  return null;
}
/*__STUDIO_WORKER_END:phase6FindModule__*/

export async function phase6EnsureP0202DynamicVoiceMapping(env, authorization) {
  const settings = await listPipelineSettingsForAdmin(env);
  const makeApiBase = pipelineSettingValue(settings, "MAKE_API_BASE_URL").replace(/\/+$/, "");
  const makeApiToken = pipelineSettingValue(settings, "MAKE_API_TOKEN");
  if (!makeApiBase || !makeApiToken) throw new HttpError(500, "Make API configuration is required to finalize dynamic voice selection");
  const headers = { Authorization: `Token ${makeApiToken}`, Accept: "application/json", "Content-Type": "application/json" };
  const liveResponse = await fetch(`${makeApiBase}/scenarios/${PHASE6_P0202_SCENARIO_ID}/blueprint?draft=false`, { method: "GET", headers });
  const liveText = await liveResponse.text();
  let liveBody;
  try { liveBody = liveText ? JSON.parse(liveText) : {}; } catch { liveBody = { raw: liveText }; }
  if (!liveResponse.ok) throw new HttpError(liveResponse.status, `P020-2 live blueprint read failed (${liveResponse.status})`);
  const liveBlueprint = liveBody?.response?.blueprint || liveBody?.blueprint || null;
  if (!liveBlueprint || typeof liveBlueprint !== "object") throw new HttpError(502, "P020-2 did not return a usable live blueprint");

  const voiceModule = phase6FindModule(liveBlueprint.flow, 2);
  if (!voiceModule || voiceModule.module !== "elevenlabs:createTextToSpeech") {
    throw new HttpError(409, "P020-2 voice generation module no longer matches the validated Phase 6 baseline; no Make write attempted");
  }
  const currentExpression = String(voiceModule?.mapper?.voice_id || "");
  if (currentExpression.includes("Slide_Voice_ID")) {
    return { ok: true, already_ready: true, scenario_id: PHASE6_P0202_SCENARIO_ID, live_name: liveBlueprint.name };
  }

  requirePermission(authorization, "tenant_admin");
  const patched = JSON.parse(JSON.stringify(liveBlueprint));
  const patchedVoice = phase6FindModule(patched.flow, 2);
  patchedVoice.mapper.voice_id = '{{ifempty(1.Slide_Voice_ID; if(lower(trim(ifempty(1.Slide_Voice_Name; 1.Slide_Voice))) = "george"; "JBFqnCBsd6RMkjVDRZzb"; "xVQH621DS3eyBYrseRt5"))}}';
  if (patchedVoice?.metadata?.designer) patchedVoice.metadata.designer.name = "2 - Generate Per-Slide Voiceover by Voice ID";
  const updateModule = phase6FindModule(patched.flow, 7);
  if (!updateModule || updateModule.module !== "airtable:ActionUpdateRecords") {
    throw new HttpError(409, "P020-2 persistence module no longer matches the validated Phase 6 baseline; no Make write attempted");
  }
  updateModule.mapper = updateModule.mapper || {};
  updateModule.mapper.record = updateModule.mapper.record || {};
  updateModule.mapper.record.fldRJ15pQxvvOZqG2 = '{{ifempty(1.Slide_Voice_ID; if(lower(trim(ifempty(1.Slide_Voice_Name; 1.Slide_Voice))) = "george"; "JBFqnCBsd6RMkjVDRZzb"; "xVQH621DS3eyBYrseRt5"))}}';
  updateModule.mapper.record.fldIsKJ9mgaAnyTEZ = '{{ifempty(1.Slide_Voice_Name; 1.Slide_Voice)}}';
  if (updateModule?.metadata?.designer) updateModule.metadata.designer.name = "7 - Mark Voiceover Generated + Persist Voice ID";
  patched.name = "P020-2 - Per-Slide Voiceover Prep v1.7 - Dynamic Voice ID";

  const requestedAt = new Date().toISOString();
  const auditCreate = await airtableFetch(env, "Make Admin Queue", "", {
    method: "POST",
    body: JSON.stringify({
      records: [{ fields: {
        Command_ID: `STUDIO-P0202-VOICE-${Date.now()}`,
        Action: "UPDATE_BLUEPRINT",
        Scenario_ID: PHASE6_P0202_SCENARIO_ID,
        Scenario_Name: patched.name,
        Proposed_Blueprint_JSON_Original: JSON.stringify(patched),
        Write_Approved: true,
        Status: "Processing",
        Backup_Blueprint_Wrapper_2: JSON.stringify(liveBlueprint),
        Requested_At: requestedAt,
        Started_At: requestedAt,
        Requested_By: String(authorization?.email || "studio-admin"),
        Correlation_ID: "P020-PHASE6-DYNAMIC-VOICE-ID",
        Notes: "Phase 6 server-side migration. Removes the fixed two-voice generation authority by using Slide_Voice_ID directly, with Kate/George legacy fallback. Scheduling/activation unchanged.",
      }}], typecast: true,
    }),
  });
  const auditId = auditCreate?.records?.[0]?.id;

  let patchStatus = null;
  try {
    const patchResponse = await fetch(`${makeApiBase}/scenarios/${PHASE6_P0202_SCENARIO_ID}?confirmed=true`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ blueprint: JSON.stringify(patched) }),
    });
    patchStatus = patchResponse.status;
    const patchText = await patchResponse.text();
    if (!patchResponse.ok) throw new Error(`P020-2 Make PATCH failed (${patchResponse.status}): ${patchText.slice(0, 500)}`);

    const verifyResponse = await fetch(`${makeApiBase}/scenarios/${PHASE6_P0202_SCENARIO_ID}/blueprint?draft=false`, { method: "GET", headers });
    const verifyText = await verifyResponse.text();
    let verifyBody;
    try { verifyBody = verifyText ? JSON.parse(verifyText) : {}; } catch { verifyBody = { raw: verifyText }; }
    if (!verifyResponse.ok) throw new Error(`P020-2 post-deploy verification failed (${verifyResponse.status})`);
    const verified = verifyBody?.response?.blueprint || verifyBody?.blueprint || null;
    const verifiedVoice = phase6FindModule(verified?.flow, 2);
    if (!String(verifiedVoice?.mapper?.voice_id || "").includes("Slide_Voice_ID")) {
      throw new Error("P020-2 post-deploy verification did not find Slide_Voice_ID mapping");
    }
    if (auditId) await airtableFetch(env, "Make Admin Queue", auditId, { method: "PATCH", body: JSON.stringify({ fields: {
      Status: "Succeeded", Completed_At: new Date().toISOString(), Error_Message: "",
      Result_JSON: JSON.stringify({ ok: true, scenario_id: PHASE6_P0202_SCENARIO_ID, deployed_name: verified?.name, make_patch_status: patchStatus, scheduling_changed: false }),
    }})});
    return { ok: true, already_ready: false, scenario_id: PHASE6_P0202_SCENARIO_ID, live_name: verified?.name, audit_record_id: auditId };
  } catch (error) {
    if (auditId) {
      try { await airtableFetch(env, "Make Admin Queue", auditId, { method: "PATCH", body: JSON.stringify({ fields: {
        Status: "Failed", Completed_At: new Date().toISOString(), Error_Message: error instanceof Error ? error.message : "P020-2 dynamic voice migration failed",
        Result_JSON: JSON.stringify({ ok: false, scenario_id: PHASE6_P0202_SCENARIO_ID, make_patch_status: patchStatus }),
      }})}); } catch {}
    }
    throw new HttpError(502, error instanceof Error ? error.message : "P020-2 dynamic voice migration failed");
  }
}
/*__STUDIO_WORKER_END:phase6EnsureP0202DynamicVoiceMapping__*/

export function mapPhase6CreativeOutput(record) {
  const manifest = phase6ParseJson(f(record, "Creative_Render_Manifest_JSON"), null);
  const settings = phase6ParseJson(f(record, "Studio_Creative_Settings_JSON"), {}) || {};
  const manifestMusic = manifest?.music && typeof manifest.music === "object" ? manifest.music : {};
  const normal = phase6Number(
    f(record, "Music_Volume"),
    phase6Number(manifestMusic.baseVolume, STUDIO_DEFAULT_MUSIC_VOLUME)
  );
  const ducked = phase6Number(
    f(record, "Music_Ducked_Volume"),
    phase6Number(
      manifestMusic.effectiveDuckedVolume,
      normal * phase6Number(manifestMusic.duckingMultiplier, 0.084)
    )
  );
  const duckEnabled = f(record, "Music_Ducking_Enabled") === null
    ? manifestMusic.duckingEnabled !== false
    : Boolean(f(record, "Music_Ducking_Enabled"));
  const duckFade = phase6Number(f(record, "Music_Duck_Fade_Frames"), phase6Number(manifestMusic.duckFadeFrames, 6));

  return {
    ...mapOutput(record),
    composition_id: f(record, "Composition_ID"),
    final_file_id: f(record, "Final_File_ID"),
    final_file_name: f(record, "Final_File_Name"),
    final_file_storage_status: f(record, "Final_File_Storage_Status"),
    final_file_error_message: f(record, "Final_File_Error_Message"),
    remotion_error_message: f(record, "Remotion_Error_Message"),
    music_url: f(record, "Music_URL") || manifestMusic.url || null,
    voiceover_tail_seconds: f(record, "Voiceover_Tail_Seconds"),
    review_notes: f(record, "Review_Notes"),
    review_decision_at: f(record, "Review_Decision_At"),
    studio_preview_url: studioMappedPreviewUrl(record),
    native_still_url: studioNativeStillPreviewUrl(record) || null,
    preview_kind: studioPreviewKind(record),
    studio_preview_updated_at: f(record, "Studio_Preview_Updated_At"),
    remotion_job_id: f(record, "Remotion_Job_ID"),
    output_caption: f(record, "Output_Caption"),
    output_hashtags: f(record, "Output_Hashtags"),
    voiceover: {
      volume: phase6ResolvedVoiceoverVolume(record),
      url: f(record, "Voiceover_URL") || null,
      mode: f(record, "Studio_Effective_Voiceover_Mode") || null,
      status: f(record, "Voiceover_URL")
        ? "Item voiceover"
        : (String(f(record, "Studio_Effective_Voiceover_Mode") || "").trim() === "Yes" ? "Requested" : "Not Requested"),
    },
    music: {
      normal_volume: normal,
      ducked_volume: ducked,
      ducking_enabled: duckEnabled,
      duck_fade_frames: duckFade,
      effective_multiplier: normal > 0 ? ducked / normal : 0,
    },
    creative_settings: settings,
    creative_manifest: manifest,
  };
}
/*__STUDIO_WORKER_END:mapPhase6CreativeOutput__*/

export async function getOutputCreative(request, env, url, authorization) {
  const id = phase6RecordIdFromPath(url);
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  const output = mapPhase6CreativeOutput(record);
  const narration = await phase6ResolveNarrationVoice(env, record);
  const [slides, voiceCatalog] = await Promise.all([
    phase6SlidesForOutput(env, record, narration),
    phase6VoiceCatalog(env),
  ]);
  const handoff = phase6CreativeHandoffStatus(record, slides);
  const titleLock = phase6TitleLockView(record, slides);
  return respond(request, env, {
    ok: true,
    output,
    slides: phase6SlidesWithTitleRenderInput(record, slides),
    handoff,
    title_lock: titleLock,
    options: {
      style_presets: PHASE6_STYLE_PRESETS,
      text_roles: PHASE6_TEXT_ROLES,
      positions: PHASE6_POSITIONS,
      focal_points: PHASE6_FOCAL_POINTS,
      fit_modes: PHASE6_FIT_MODES,
      motions: PHASE6_MOTIONS,
      transitions: PHASE6_TRANSITIONS,
      voices: voiceCatalog.voices,
      voice_catalog_live: voiceCatalog.live_connected,
      voice_catalog_configured: voiceCatalog.live_configured,
      voice_catalog_error: voiceCatalog.live_error,
      default_voice_id: narration.voice_id || voiceCatalog.default_voice_id,
      default_voice: narration.voice_name || "Kate",
      ratio_canvases: {"9:16":"1080x1920","4:5":"1080x1350","1:1":"1080x1080","16:9":"1920x1080"},
    },
    safety: {
      review_only: true,
      do_not_publish: output.do_not_publish,
      publishing_changed_by_this_api: false,
      title_lock: titleLock,
    },
  });
}
/*__STUDIO_WORKER_END:getOutputCreative__*/

export function phase6Select(value, allowed, fallback) {
  const text = phase6Text(value, 100);
  return allowed.includes(text) ? text : fallback;
}
/*__STUDIO_WORKER_END:phase6Select__*/

export function phase6SlideDirectiveFromPayload(input, existing) {
  const old = phase6ParseJson(f(existing, "Creative_Directives_JSON"), {}) || {};
  const oldOverlay = old.overlay && typeof old.overlay === "object" ? old.overlay : {};
  const oldVoice = old.voiceover && typeof old.voiceover === "object" ? old.voiceover : {};
  const oldMotion = old.motion && typeof old.motion === "object" ? old.motion : {};
  const oldTransition = old.transition && typeof old.transition === "object" ? old.transition : {};

  const overlayInput = input?.overlay && typeof input.overlay === "object" ? input.overlay : {};
  const voiceInput = input?.voiceover && typeof input.voiceover === "object" ? input.voiceover : {};
  const motionInput = input?.motion && typeof input.motion === "object" ? input.motion : {};
  const transitionInput = input?.transition && typeof input.transition === "object" ? input.transition : {};

  const stylePreset = phase6Select(overlayInput.style_preset ?? overlayInput.stylePreset ?? oldOverlay.stylePreset,
    PHASE6_STYLE_PRESETS, phase6Text(oldOverlay.stylePreset || "Chicago Editorial", 80));
  const overlayEnabled = phase6Bool(overlayInput.enabled, oldOverlay.enabled !== false) && stylePreset !== "No Text";
  const voiceEnabled = phase6Bool(voiceInput.enabled, oldVoice.enabled !== false);
  const hasVoiceVolumeOverride = Object.prototype.hasOwnProperty.call(voiceInput, "volume_override") || Object.prototype.hasOwnProperty.call(voiceInput, "volumeOverride");
  const requestedVoiceVolumeOverride = voiceInput.volume_override ?? voiceInput.volumeOverride;
  const voiceVolumeOverride = hasVoiceVolumeOverride
    ? (requestedVoiceVolumeOverride === null || requestedVoiceVolumeOverride === undefined || requestedVoiceVolumeOverride === ""
      ? null
      : phase6Clamp(requestedVoiceVolumeOverride, 0, 1.25, phase6Number(oldVoice.volumeOverride, 1)))
    : phase6Number(oldVoice.volumeOverride, null);

  const durationSeconds = phase6Clamp(input?.duration_seconds ?? input?.durationSeconds, 0.5, 60, phase6Number(old.durationSeconds, 4));
  const startFraction = phase6Clamp(overlayInput.start_fraction ?? overlayInput.startFraction ?? oldOverlay.startFraction, 0, 1, 0);
  const endFraction = phase6Clamp(overlayInput.end_fraction ?? overlayInput.endFraction ?? oldOverlay.endFraction, 0, 1, 1);
  const overlay = {
    ...oldOverlay,
    enabled: overlayEnabled,
    text: phase6Text(overlayInput.text ?? oldOverlay.text, 1000),
    stylePreset,
    role: phase6Select(overlayInput.role ?? oldOverlay.role, PHASE6_TEXT_ROLES, "overlay"),
    position: phase6Select(overlayInput.position ?? oldOverlay.position, PHASE6_POSITIONS, "center"),
    size: Math.round(phase6Clamp(overlayInput.size ?? oldOverlay.size, 20, 140, 64)),
    eyebrow: phase6Text(overlayInput.eyebrow ?? oldOverlay.eyebrow, 250),
    subtitle: phase6Text(overlayInput.caption ?? overlayInput.subtitle ?? oldOverlay.caption ?? oldOverlay.subtitle, 500),
    caption: phase6Text(overlayInput.caption ?? overlayInput.subtitle ?? oldOverlay.caption ?? oldOverlay.subtitle, 500),
    accentText: phase6Text(overlayInput.accent_text ?? overlayInput.accentText ?? oldOverlay.accentText, 500),
    brand: phase6Text(overlayInput.brand ?? oldOverlay.brand, 250),
    backgroundOpacity: phase6Clamp(overlayInput.background_opacity ?? overlayInput.backgroundOpacity ?? oldOverlay.backgroundOpacity, 0, 1, 0.4),
    animation: phase6Text(overlayInput.animation ?? oldOverlay.animation ?? "fade", 60),
    startFraction: Math.min(startFraction, endFraction),
    endFraction: Math.max(startFraction, endFraction),
  };
  overlay.version = phase6NextTitleVersion(oldOverlay, overlay, durationSeconds);

  return {
    ...old,
    schemaVersion: "p020.slide.4-ui-phase6",
    include: phase6Bool(input?.include, old.include !== false),
    durationSeconds,
    focalPoint: phase6Select(input?.focal_point ?? input?.focalPoint ?? old.focalPoint, PHASE6_FOCAL_POINTS, "center"),
    fitMode: phase6Select(input?.fit_mode ?? input?.fitMode ?? old.fitMode, PHASE6_FIT_MODES, "fill_crop"),
    safeAreaAware: phase6Bool(input?.safe_area_aware ?? input?.safeAreaAware, old.safeAreaAware !== false),
    overlay,
    voiceover: {
      ...oldVoice,
      enabled: voiceEnabled,
      voiceId: phase6Text(voiceInput.voice_id ?? voiceInput.voiceId ?? f(existing, "Slide_Voice_ID") ?? oldVoice.voiceId, 120) || (String(voiceInput.voice ?? f(existing, "Slide_Voice_Name") ?? f(existing, "Slide_Voice") ?? oldVoice.voice ?? "Kate").trim().toLowerCase() === "george" ? PHASE6_GEORGE_VOICE_ID : PHASE6_DEFAULT_VOICE_ID),
      voice: phase6Text(voiceInput.voice ?? f(existing, "Slide_Voice_Name") ?? f(existing, "Slide_Voice") ?? oldVoice.voice, 120) || "Kate",
      text: phase6Text(voiceInput.text ?? f(existing, "Slide_Voiceover_Text") ?? oldVoice.text, 5000),
      url: f(existing, "Slide_Voiceover_URL") || oldVoice.url || null,
      measuredDurationSeconds: f(existing, "Slide_Voiceover_Duration_Seconds") ?? oldVoice.measuredDurationSeconds ?? null,
      volumeOverride: voiceVolumeOverride,
    },
    motion: {
      ...oldMotion,
      type: phase6Select(motionInput.type ?? oldMotion.type, PHASE6_MOTIONS, "none"),
    },
    transition: {
      ...oldTransition,
      type: phase6Select(transitionInput.type ?? oldTransition.type, PHASE6_TRANSITIONS, "fade"),
      durationFrames: Math.round(phase6Clamp(transitionInput.duration_frames ?? transitionInput.durationFrames ?? oldTransition.durationFrames, 0, 90, 12)),
    },
  };
}
/*__STUDIO_WORKER_END:phase6SlideDirectiveFromPayload__*/

export async function updateOutputCreative(request, env, url, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const id = phase6RecordIdFromPath(url);
  const existingOutput = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  const current = mapPhase6CreativeOutput(existingOutput);

  // Production review posts can save mix levels only. Slide/title editing stays locked.
  if (!Boolean(f(existingOutput, "Do_Not_Publish"))) {
    phase6AssertProductionAudioMixAllowed(existingOutput);
    if (payload?.unlock_titles === true) {
      throw new HttpError(409, "Title edits stay locked on production review posts. Adjust the audio mix only.");
    }
    const outputFields = phase6AudioMixFieldsFromPayload(payload, current);
    if (typeof payload?.review_notes === "string") {
      outputFields.Review_Notes = phase6Text(payload.review_notes, 10000) || null;
    }
    await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
      method: "PATCH",
      body: JSON.stringify({ fields: outputFields, typecast: false }),
    });
    const refreshedOutput = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
    const sharedSiblings = await studioPatchSiblingVerticalShortOutputs(
      env,
      refreshedOutput,
      studioPickSharedAudioMixFields(outputFields),
      { typecast: false },
    );
    const slides = await phase6SlidesForOutput(env, refreshedOutput);
    return respond(request, env, {
      ok: true,
      saved: true,
      audio_only: true,
      shared_vertical_short_siblings: sharedSiblings.length,
      record: mapPhase6CreativeOutput(refreshedOutput),
      slides: phase6SlidesWithTitleRenderInput(refreshedOutput, slides),
      title_lock: phase6TitleLockView(refreshedOutput, slides),
      message: sharedSiblings.length > 1
        ? "Audio mix saved for all Reels, Shorts, and TikTok on this post. Apply mix & rerender once to refresh every preview."
        : "Audio mix saved. Apply mix & rerender to hear it on a new preview.",
    });
  }

  const outputFields = phase6AudioMixFieldsFromPayload(payload, current);

  const creativeSettings = payload?.creative_settings && typeof payload.creative_settings === "object"
    ? payload.creative_settings : current.creative_settings || {};
  const { title_lock: _clientTitleLock, ...safeCreativeSettings } = creativeSettings;
  const existingTitleLock = current.creative_settings?.title_lock && typeof current.creative_settings.title_lock === "object"
    ? current.creative_settings.title_lock : {};
  const settingsSnapshot = {
    ...safeCreativeSettings,
    schemaVersion: "p020.phase6.ui.2",
    savedAt: new Date().toISOString(),
    savedBy: authorization?.email || null,
    title_lock: existingTitleLock,
  };
  outputFields.Studio_Creative_Settings_JSON = JSON.stringify(settingsSnapshot);
  if (payload?.voiceover_tail_seconds !== undefined) {
    outputFields.Voiceover_Tail_Seconds = phase6Clamp(payload.voiceover_tail_seconds, 0, 10, current.voiceover_tail_seconds ?? 2);
  }
  if (typeof payload?.review_notes === "string") {
    outputFields.Review_Notes = phase6Text(payload.review_notes, 10000) || null;
  }

  const linkedIds = new Set(Array.isArray(f(existingOutput, "Carousel Slides")) ? f(existingOutput, "Carousel Slides") : []);
  const slideInputs = Array.isArray(payload?.slides) ? payload.slides.slice(0, 40) : [];
  const existingSlides = new Map();
  const outputAspectRatio = String(f(existingOutput, "Aspect_Ratio") || "").trim();
  for (const slideInput of slideInputs) {
    const slideId = String(slideInput?.id || "").trim();
    if (!linkedIds.has(slideId)) throw new HttpError(400, `Slide ${slideId || "(blank)"} is not linked to this output`);
    if (!existingSlides.has(slideId)) existingSlides.set(slideId, await airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, slideId));
  }

  // Dynamic voice IDs are generation authority. P020-2 v1.7 was deployed and independently
  // verified before this Worker release. A creative save must never depend on a live Make Admin
  // API read/write, so the formerly blocking first-save migration has been removed from this path.
  // This keeps Studio editing transactional with Airtable while P020-2 consumes Slide_Voice_ID later.
  const dynamicVoiceRequested = slideInputs.some((input) => {
    const voice = input?.voiceover && typeof input.voiceover === "object" ? input.voiceover : {};
    return Boolean(phase6Text(voice.voice_id ?? voice.voiceId, 120));
  });
  const makeVoiceMigration = {
    ok: true,
    already_ready: true,
    skipped: true,
    reason: dynamicVoiceRequested ? "p0202-v1.7-predeployed-verified" : "no-dynamic-voice-requested",
  };

  // All input is validated before writes begin.
  const slideWrites = [];
  let overlayChanged = false;
  for (let index = 0; index < slideInputs.length; index += 1) {
    const input = slideInputs[index];
    const slideId = String(input.id).trim();
    const existing = existingSlides.get(slideId);
    const directive = phase6SlideDirectiveFromPayload(input, existing);
    const previousDirective = phase6ParseJson(f(existing, "Creative_Directives_JSON"), {}) || {};
    const previousOverlay = previousDirective.overlay && typeof previousDirective.overlay === "object" ? previousDirective.overlay : {};
    const oldOverlayForIdentity = {
      ...previousOverlay,
      position: previousOverlay.position || phase6DefaultOverlayPosition(outputAspectRatio),
      caption: previousOverlay.caption || previousOverlay.subtitle,
      subtitle: previousOverlay.subtitle || previousOverlay.caption,
    };
    const newOverlayForIdentity = {
      ...directive.overlay,
      position: directive.overlay?.position || phase6DefaultOverlayPosition(outputAspectRatio),
    };
    if (phase6TitleEditIdentity(oldOverlayForIdentity, previousDirective.durationSeconds) !== phase6TitleEditIdentity(newOverlayForIdentity, directive.durationSeconds)) {
      overlayChanged = true;
    }
    const voiceText = directive.voiceover.enabled ? phase6Text(directive.voiceover.text, 5000) : "";
    const voiceId = directive.voiceover.enabled ? phase6Text(directive.voiceover.voiceId, 120) : (f(existing, "Slide_Voice_ID") || PHASE6_DEFAULT_VOICE_ID);
    const voice = directive.voiceover.enabled ? phase6Text(directive.voiceover.voice, 120) : (f(existing, "Slide_Voice_Name") || f(existing, "Slide_Voice") || "Kate");
    const voiceChanged = voiceText !== String(f(existing, "Slide_Voiceover_Text") || "").trim() ||
      voiceId !== String(f(existing, "Slide_Voice_ID") || "").trim() ||
      voice !== String(f(existing, "Slide_Voice_Name") || f(existing, "Slide_Voice") || "").trim();
    const fields = {
      "Current Order": Math.max(1, Math.min(99, Math.round(phase6Number(input.order, index + 1)))),
      Creative_Directives_JSON: JSON.stringify(directive),
      Slide_Voiceover_Text: voiceText || null,
      Slide_Voice_ID: voiceId,
      Slide_Voice_Name: voice,
    };
    // Keep the legacy select field synchronized only for its historical two choices.
    if (PHASE6_VOICES.includes(voice)) fields.Slide_Voice = voice;
    if (!directive.voiceover.enabled) {
      fields.Slide_Voiceover_Status = "Not Requested";
      fields.Slide_Voiceover_URL = null;
      fields.Slide_Voiceover_Duration_Seconds = null;
    } else if (voiceChanged || !f(existing, "Slide_Voiceover_URL")) {
      fields.Slide_Voiceover_Status = "Ready";
      fields.Slide_Voiceover_URL = null;
      fields.Slide_Voiceover_Duration_Seconds = null;
    }
    slideWrites.push({ slideId, fields });
  }

  const unlockRequested = payload?.unlock_titles === true;
  const titleLockDecision = phase6TitleLockState({
    reviewStatus: f(existingOutput, "Review_Status"),
    lock: existingTitleLock,
    overlayChanged,
    unlockRequested,
  });
  if (!titleLockDecision.allow) {
    throw new HttpError(409, "Per-photo titles are locked after preview approval. Unlock titles to start a new version.");
  }
  if (unlockRequested) {
    settingsSnapshot.title_lock = {
      schema: "studio-title-edit-v1",
      locked: false,
      version: Math.max(1, Math.round(phase6Number(existingTitleLock.version, 1))),
      overlay_identity: existingTitleLock.overlay_identity || null,
      approved_at: existingTitleLock.approved_at || null,
      unlocked_at: new Date().toISOString(),
    };
  } else if (!titleLockDecision.locked && existingTitleLock && Object.keys(existingTitleLock).length) {
    settingsSnapshot.title_lock = {
      ...existingTitleLock,
      schema: "studio-title-edit-v1",
      locked: false,
    };
  }
  outputFields.Studio_Creative_Settings_JSON = JSON.stringify(settingsSnapshot);

  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
    method: "PATCH",
    body: JSON.stringify({ fields: outputFields, typecast: false }),
  });
  for (const write of slideWrites) {
    await airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, write.slideId, {
      method: "PATCH",
      body: JSON.stringify({ fields: write.fields, typecast: false }),
    });
  }

  const refreshedOutput = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  const slides = await phase6SlidesForOutput(env, refreshedOutput);
  const titleLock = phase6TitleLockView(refreshedOutput, slides);
  return respond(request, env, {
    ok: true,
    saved: true,
    record: mapPhase6CreativeOutput(refreshedOutput),
    slides: phase6SlidesWithTitleRenderInput(refreshedOutput, slides),
    title_lock: titleLock,
    make_voice_mapping: makeVoiceMigration,
    message: unlockRequested
      ? "Per-photo titles are unlocked. Save a new preview and approve again before publishing review is complete."
      : "Phase 6 creative settings saved. Publishing state was not changed.",
  });
}

/*__STUDIO_WORKER_END:updateOutputCreative__*/

export function phase6DimensionsForRatio(ratio) {
  if (ratio === "16:9") return { width: 1920, height: 1080 };
  if (ratio === "1:1") return { width: 1080, height: 1080 };
  if (ratio === "4:5") return { width: 1080, height: 1350 };
  return { width: 1080, height: 1920 };
}
/*__STUDIO_WORKER_END:phase6DimensionsForRatio__*/

export function phase6AssetSourceForSlide(slide, ratio) {
  if (slide?.variants?.[ratio]) return `prepared_${String(ratio).replace(":", "x")}`;
  return "fallback_source";
}
/*__STUDIO_WORKER_END:phase6AssetSourceForSlide__*/

export function phase6TitleEditIdentity(overlay, _durationSeconds = 4) {
  const o = overlay && typeof overlay === "object" ? overlay : {};
  const start = phase6Clamp(o.start_fraction ?? o.startFraction, 0, 1, 0);
  const end = phase6Clamp(o.end_fraction ?? o.endFraction, 0, 1, 1);
  return [
    "studio-title-edit-v1",
    o.enabled === false ? "0" : "1",
    phase6Text(o.text, 1000),
    phase6Text(o.caption ?? o.subtitle, 500),
    phase6Text(o.position || "center", 60),
    Math.round(phase6Clamp(o.size, 20, 140, 64)),
    phase6Text(o.style_preset || o.stylePreset || "Chicago Editorial", 80),
    Math.min(start, end),
    Math.max(start, end),
  ].join("|");
}
/*__STUDIO_WORKER_END:phase6TitleEditIdentity__*/

export function phase6NextTitleVersion(oldOverlay, newOverlay, durationSeconds = 4) {
  const previous = oldOverlay && typeof oldOverlay === "object" ? oldOverlay : {};
  const next = newOverlay && typeof newOverlay === "object" ? newOverlay : {};
  const hadVersion = Number.isFinite(Number(previous.version)) && Number(previous.version) >= 1;
  const prevVersion = hadVersion ? Math.round(Number(previous.version)) : 1;
  if (phase6TitleEditIdentity(previous, durationSeconds) === phase6TitleEditIdentity(next, durationSeconds)) {
    return hadVersion ? prevVersion : 1;
  }
  return hadVersion ? prevVersion + 1 : 1;
}
/*__STUDIO_WORKER_END:phase6NextTitleVersion__*/

export function phase6TitleLockState({ reviewStatus = "", lock = null, overlayChanged = false, unlockRequested = false } = {}) {
  const stored = lock && typeof lock === "object" ? lock : {};
  const reviewApproved = String(reviewStatus || "") === "Approved";
  const locked = stored.locked === true || (reviewApproved && stored.locked !== false);
  if (locked && overlayChanged && !unlockRequested) {
    return { schema: "studio-title-edit-v1", locked: true, allow: false, code: "title-lock-conflict" };
  }
  if (unlockRequested) {
    return { schema: "studio-title-edit-v1", locked: false, allow: true, code: "unlocked" };
  }
  return { schema: "studio-title-edit-v1", locked, allow: true, code: locked ? "locked-unchanged" : "unlocked" };
}
/*__STUDIO_WORKER_END:phase6TitleLockState__*/

export function phase6TitleLockView(record, slides = []) {
  const settings = phase6ParseJson(f(record, "Studio_Creative_Settings_JSON"), {}) || {};
  const lock = settings.title_lock && typeof settings.title_lock === "object" ? settings.title_lock : {};
  const reviewApproved = String(f(record, "Review_Status") || "") === "Approved";
  const locked = lock.locked === true || (reviewApproved && lock.locked !== false);
  const currentIdentity = (Array.isArray(slides) ? slides : []).map((slide) => `${slide.id}:${phase6TitleEditIdentity(slide.overlay, slide.duration_seconds)}`).join("||");
  const approvedIdentity = phase6Text(lock.overlay_identity, 20000);
  const versions = (Array.isArray(slides) ? slides : []).map((slide) => Math.max(1, Math.round(phase6Number(slide?.overlay?.version, 1))));
  return {
    schema: "studio-title-edit-v1",
    locked,
    version: versions.length ? Math.max(...versions) : Math.max(1, Math.round(phase6Number(lock.version, 1))),
    overlay_identity: currentIdentity,
    approved_overlay_identity: approvedIdentity || null,
    stale_approval: Boolean(!locked && reviewApproved && approvedIdentity && approvedIdentity !== currentIdentity),
    approved_at: lock.approved_at || (reviewApproved ? f(record, "Review_Decision_At") : null) || null,
    unlocked_at: lock.unlocked_at || null,
  };
}
/*__STUDIO_WORKER_END:phase6TitleLockView__*/

export function phase6TitleRenderInput(slide, options = {}) {
  const overlay = phase6RenderOverlayFromSlide(slide, options);
  const source = slide?.overlay && typeof slide.overlay === "object" ? slide.overlay : {};
  const storedVersion = Number(source.version);
  overlay.schema = "studio-title-edit-v1";
  overlay.version = Number.isFinite(storedVersion) && storedVersion >= 1 ? Math.round(storedVersion) : 1;
  overlay.caption = phase6Text(source.caption || source.subtitle || overlay.subtitle, 500);
  overlay.titleEditKey = [
    "studio-title-edit-v1",
    overlay.version,
    overlay.enabled ? "1" : "0",
    overlay.text,
    overlay.caption,
    overlay.position,
    overlay.size,
    overlay.stylePreset,
    overlay.startFraction,
    overlay.endFraction,
  ].join("|");
  return overlay;
}
/*__STUDIO_WORKER_END:phase6TitleRenderInput__*/

export function phase6SlidesWithTitleRenderInput(outputRecord, slides = []) {
  const platform = String(f(outputRecord, "Platform") || "").trim();
  const ratio = String(f(outputRecord, "Aspect_Ratio") || "").trim();
  return (Array.isArray(slides) ? slides : []).map((slide) => ({
    ...slide,
    title_render_input: phase6TitleRenderInput(slide, {
      platform,
      ratio,
      durationSeconds: slide.duration_seconds,
    }),
  }));
}
/*__STUDIO_WORKER_END:phase6SlidesWithTitleRenderInput__*/

export function phase6RenderOverlayFromSlide(slide, options = {}) {
  const o = slide?.overlay || {};
  const tiktok = String(options.platform || "") === "TikTok" && String(options.ratio || "") === "9:16";
  const startFraction = phase6Clamp(o.start_fraction ?? o.startFraction, 0, 1, 0);
  const endFraction = phase6Clamp(o.end_fraction ?? o.endFraction, 0, 1, 1);
  const text = phase6Text(o.text || (tiktok ? slide?.name : ""), 1000);
  const enabled = o.enabled !== false && Boolean(text);
  const overlay = {
    enabled,
    text,
    position: phase6Text(o.position || phase6DefaultOverlayPosition(options.ratio), 60),
    size: Math.round(phase6Clamp(o.size, 20, 140, 64)),
    stylePreset: phase6Text(o.style_preset || "Chicago Editorial", 80),
    animation: phase6Text(o.animation || "fade", 60),
    role: phase6Text(o.role || "overlay", 60),
    eyebrow: phase6Text(o.eyebrow, 250),
    subtitle: phase6Text(o.subtitle, 500),
    accentText: phase6Text(o.accent_text, 500),
    brand: phase6Text(o.brand, 250),
    backgroundOpacity: phase6Clamp(o.background_opacity, 0, 1, 0.4),
    startFraction: Math.min(startFraction, endFraction),
    endFraction: Math.max(startFraction, endFraction),
  };
  if (tiktok) {
    overlay.recipe = "tiktok-title-overlay-v1";
    overlay.safeArea = "tiktok-9x16";
    overlay.safeAreaInsets = { top: 285, right: 78, bottom: 285, left: 78 };
    overlay.durationSeconds = phase6Clamp(options.durationSeconds, 0.5, 60, 4);
    overlay.idempotencyKey = [
      "tiktok-title-overlay-v1",
      overlay.enabled ? "1" : "0",
      overlay.text,
      overlay.position,
      overlay.size,
      overlay.stylePreset,
      overlay.startFraction,
      overlay.endFraction,
      overlay.durationSeconds,
      "285,78,285,78",
    ].join("|");
  }
  return overlay;
}
/*__STUDIO_WORKER_END:phase6RenderOverlayFromSlide__*/

export async function phase6BuildPreviewRenderPackage(env, outputRecord) {
  const mapped = mapPhase6CreativeOutput(outputRecord);
  const ratio = String(f(outputRecord, "Aspect_Ratio") || "9:16").trim() || "9:16";
  if (!["9:16", "4:5", "1:1", "16:9"].includes(ratio)) {
    throw new HttpError(409, `Phase 6 preview rerender does not support aspect ratio ${ratio || "(blank)"}`);
  }

  const composition = String(f(outputRecord, "Composition_ID") || "").trim() || "ChicagoShiningPhotoSequence";
  if (composition !== "ChicagoShiningPhotoSequence") {
    throw new HttpError(409, `Phase 6 preview rerender requires ChicagoShiningPhotoSequence; found ${composition}`);
  }

  const allSlides = await phase6SlidesForOutput(env, outputRecord);
  const slides = allSlides.filter(slide => slide.include !== false)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  if (!slides.length) throw new HttpError(409, "At least one included slide is required for a Phase 6 preview rerender");

  const settings = mapped.creative_settings || {};
  const globalVoiceoverVolume = phase6Clamp(mapped?.voiceover?.volume, 0, 1.25, 1);
  const defaultDuration = phase6Clamp(settings.default_slide_duration_seconds, 0.5, 60, 4);
  const tailSeconds = 0;
  const missingVoiceovers = [];
  const clips = [];

  for (let i = 0; i < slides.length; i += 1) {
    const slide = slides[i];
    const voiceEnabled = slide?.voiceover?.enabled !== false && Boolean(phase6Text(slide?.voiceover?.text, 5000));
    if (voiceEnabled && (!slide?.voiceover?.url || !phase6Number(slide?.voiceover?.duration_seconds, null))) {
      missingVoiceovers.push({ id: slide.id, name: slide.name, status: slide?.voiceover?.status || "Ready" });
      continue;
    }

    const requestedSeconds = phase6Clamp(slide.duration_seconds, 0.5, 60, defaultDuration);
    const requestedFrames = Math.max(1, Math.round(requestedSeconds * 30));
    const measuredFrames = voiceEnabled
      ? Math.max(1, Math.ceil(phase6Number(slide.voiceover.duration_seconds, 0) * 30))
      : 1;
    let durationFrames = voiceEnabled ? measuredFrames : requestedFrames;

    const url = slide.preview_url;
    if (!url) throw new HttpError(409, `Slide ${slide.name || slide.id} has no usable image URL for preview rerender`);

    clips.push({
      id: `slide-${i + 1}`,
      slideRecordId: slide.id,
      slideNumber: phase6Number(slide.slide_number, i + 1),
      order: i + 1,
      url,
      fitMode: phase6Text(slide.fit_mode || "fill_crop", 60),
      focalPoint: phase6Text(slide.focal_point || "center", 60),
      durationFrames,
      motion: { type: phase6Text(slide?.motion?.type || "none", 60) },
      voiceover: voiceEnabled ? {
        enabled: true,
        url: slide.voiceover.url,
        volume: phase6Clamp(slide.voiceover.volume_override, 0, 1.25, globalVoiceoverVolume),
        measuredDurationSeconds: phase6Number(slide.voiceover.duration_seconds, null),
      } : { enabled: false },
      overlay: phase6TitleRenderInput(slide, {
        platform: f(outputRecord, "Platform"),
        ratio,
        durationSeconds: requestedSeconds,
      }),
      transition: {
        type: phase6Text(slide?.transition?.type || "fade", 60),
        durationFrames: Math.round(phase6Clamp(slide?.transition?.duration_frames, 0, 90, 12)),
      },
      targetAspectRatio: ratio,
      assetSource: phase6AssetSourceForSlide(slide, ratio),
    });
  }

  if (missingVoiceovers.length) {
    throw new HttpError(409,
      `Per-slide voiceover preparation is required before rerender: ${missingVoiceovers.map(x => x.name || x.id).join(", ")}`
    );
  }

  const totalFrames = clips.reduce((sum, clip) => sum + Number(clip.durationFrames || 0), 0);
  if (!totalFrames) throw new HttpError(409, "Phase 6 preview package resolved to zero frames");

  const normal = phase6Clamp(
    mapped?.music?.normal_volume,
    0,
    1,
    STUDIO_DEFAULT_MUSIC_VOLUME
  );
  const ducked = phase6Clamp(
    mapped?.music?.ducked_volume,
    0,
    1,
    STUDIO_DEFAULT_DUCKED_MUSIC_VOLUME
  );
  const duckEnabled = mapped?.music?.ducking_enabled !== false;
  if (duckEnabled && ducked > normal) {
    throw new HttpError(409, "Ducked music volume cannot exceed normal music volume");
  }
  const duckMultiplier = normal > 0 ? ducked / normal : 0;
  const musicUrl = mapped.music_url || null;
  const dimensions = phase6DimensionsForRatio(ratio);
  const priorManifest = mapped.creative_manifest && typeof mapped.creative_manifest === "object" ? mapped.creative_manifest : {};
  const outputId = f(outputRecord, "Output_ID");
  const revision = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const filename = `p020-photo-sequence-output-${outputId || outputRecord.id}-phase6-preview-${revision}.mp4`;

  const manifest = {
    ...priorManifest,
    schemaVersion: "p020.6-phase6-preview",
    titleEditSchema: "studio-title-edit-v1",
    sequenceType: "photo_sequence",
    outputRecordId: outputRecord.id,
    outputId,
    compositionId: composition,
    targetAspectRatio: ratio,
    width: dimensions.width,
    height: dimensions.height,
    defaultFitMode: "fill_crop",
    defaultBackgroundColor: "black",
    music: {
      ...(priorManifest?.music || {}),
      enabled: Boolean(musicUrl),
      url: musicUrl,
      baseVolume: normal,
      duckingEnabled: duckEnabled,
      duckingMultiplier: duckMultiplier,
      effectiveDuckedVolume: ducked,
      duckFadeFrames: Math.round(phase6Clamp(mapped?.music?.duck_fade_frames, 0, 90, 6)),
      fadeInFrames: phase6Number(priorManifest?.music?.fadeInFrames, 15),
      fadeOutFrames: phase6Number(priorManifest?.music?.fadeOutFrames, 15),
      loop: priorManifest?.music?.loop !== false,
    },
    transitionFrames: Math.round(phase6Clamp(settings.default_transition_frames, 0, 90, 12)),
    voiceover: {
      ...(priorManifest?.voiceover || {}),
      globalVolume: globalVoiceoverVolume,
    },
    voiceoverTailSeconds: tailSeconds,
    endHoldFrames: 0,
    totalFrames,
    totalSeconds: totalFrames / 30,
    slides: clips.map(clip => ({
      slideRecordId: clip.slideRecordId,
      order: clip.order,
      targetAspectRatio: ratio,
      overlay: clip.overlay,
      motion: clip.motion,
      transition: clip.transition,
      fitMode: clip.fitMode,
      focalPoint: clip.focalPoint,
      durationFrames: clip.durationFrames,
    })),
    phase6Preview: {
      preparedAt: new Date().toISOString(),
      filename,
      doNotPublish: true,
      source: "Studio Phase 6 creative review",
    },
  };

  return { clips, totalFrames, filename, manifest, composition, musicUrl };
}
/*__STUDIO_WORKER_END:phase6BuildPreviewRenderPackage__*/

export function phase6PendingVoicePrepSlides(slides) {
  return (Array.isArray(slides) ? slides : [])
    .filter((slide) => slide?.include !== false && slide?.virtual !== true)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .filter((slide) => {
      const voiceEnabled = slide?.voiceover?.enabled !== false && Boolean(phase6Text(slide?.voiceover?.text, 5000));
      return voiceEnabled && (!slide?.voiceover?.url || !phase6Number(slide?.voiceover?.duration_seconds, null));
    })
    .map((slide) => ({
      id: slide.id,
      name: slide.name || slide.id,
      order: phase6Number(slide.order, null),
      voice_status: slide?.voiceover?.status || "Ready",
      voice_name: slide?.voiceover?.voice || null,
      voice_prep_request_id: slide?.voice_prep_request_id || null,
      reason: !slide?.voiceover?.url ? "missing_url" : "missing_duration",
    }));
}
/*__STUDIO_WORKER_END:phase6PendingVoicePrepSlides__*/

export async function phase6EnsureP0202ProductionGeneric(env, authorization) {
  const { makeApiBase, headers } = await phase6MakeApiConfig(env);
  const response = await fetch(`${makeApiBase}/scenarios/${PHASE6_P0202_SCENARIO_ID}/blueprint?draft=false`, { method: "GET", headers });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (!response.ok) throw new HttpError(response.status, `P020-2 blueprint read failed (${response.status})`);
  const blueprint = body?.response?.blueprint || body?.blueprint || null;
  if (!blueprint || typeof blueprint !== "object") throw new HttpError(502, "P020-2 did not return a usable live blueprint");
  const search = phase6FindModule(blueprint.flow, 1);
  const voice = phase6FindModule(blueprint.flow, 2);
  const persist = phase6FindModule(blueprint.flow, 7);
  if (!search || search.module !== "airtable:ActionSearchRecords" || !voice || voice.module !== "elevenlabs:createTextToSpeech" || !persist || persist.module !== "airtable:ActionUpdateRecords") {
    throw new HttpError(409, "P020-2 no longer matches the validated modules 1/2/7 baseline; no Make write attempted");
  }
  const desiredFormula = 'AND({Slide_Voiceover_Status}="Ready",{Deleted From Carousel}=0,{Slide_Voiceover_Text}!="",{Slide_Voice_ID}!="",{Studio_Voice_Prep_Request_ID}!="")';
  const currentFormula = String(search?.mapper?.formula || "").trim();
  const voiceExpression = String(voice?.mapper?.voice_id || "");
  if (currentFormula === desiredFormula && voiceExpression.includes("Slide_Voice_ID")) {
    return { ok: true, already_ready: true, scenario_id: PHASE6_P0202_SCENARIO_ID, live_name: blueprint.name };
  }

  requirePermission(authorization, "tenant_admin");
  const patched = JSON.parse(JSON.stringify(blueprint));
  const patchedSearch = phase6FindModule(patched.flow, 1);
  const patchedVoice = phase6FindModule(patched.flow, 2);
  patchedSearch.mapper.formula = desiredFormula;
  patchedSearch.mapper.maxRecords = "1";
  if (patchedSearch?.metadata?.designer) patchedSearch.metadata.designer.name = "1 - Get One Ready Voiceover Slide";
  patchedVoice.mapper.voice_id = '{{1.Slide_Voice_ID}}';
  if (patchedVoice?.metadata?.designer) patchedVoice.metadata.designer.name = "2 - Generate Per-Slide Voiceover by Voice ID";
  patched.name = "P020-2 - Per-Slide Voiceover Prep v1.8 - Studio Request Scoped";
  delete patched.idSequence;

  // Preserve the exact pre-change blueprint in the existing Make Admin Queue before the
  // first automatic production hardening write. This keeps rollback independent of Worker code.
  const requestedAt = new Date().toISOString();
  let auditId = null;
  try {
    const audit = await airtableFetch(env, "Make Admin Queue", "", {
      method: "POST",
      body: JSON.stringify({
        records: [{ fields: {
          Command_ID: `STUDIO-P0202-SCOPED-${Date.now()}`,
          Action: "UPDATE_BLUEPRINT",
          Scenario_ID: PHASE6_P0202_SCENARIO_ID,
          Scenario_Name: patched.name,
          Proposed_Blueprint_JSON_Original: JSON.stringify(patched),
          Write_Approved: true,
          Status: "Processing",
          Backup_Blueprint_Wrapper_2: JSON.stringify(blueprint),
          Requested_At: requestedAt,
          Started_At: requestedAt,
          Requested_By: String(authorization?.email || "studio-admin"),
          Correlation_ID: "P020-PHASE6-P0202-STUDIO-SCOPED-V18",
          Notes: "Phase 6 automatic hardening. Replaces test-record-specific P020-2 admission with an ephemeral Studio request token. Dynamic Slide_Voice_ID remains authoritative. Scheduling is preserved.",
        }}],
        typecast: true,
      }),
    });
    auditId = audit?.records?.[0]?.id || null;
  } catch {}

  try {
    const patch = await fetch(`${makeApiBase}/scenarios/${PHASE6_P0202_SCENARIO_ID}?confirmed=true`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ blueprint: JSON.stringify(patched) }),
    });
    const patchText = await patch.text();
    if (!patch.ok) throw new HttpError(patch.status, `P020-2 request-scoped hardening failed (${patch.status}): ${patchText.slice(0, 300)}`);

    const verify = await fetch(`${makeApiBase}/scenarios/${PHASE6_P0202_SCENARIO_ID}/blueprint?draft=false`, { method: "GET", headers });
    const verifyRaw = await verify.text();
    let verifyBody;
    try { verifyBody = verifyRaw ? JSON.parse(verifyRaw) : {}; } catch { verifyBody = { raw: verifyRaw }; }
    if (!verify.ok) throw new HttpError(verify.status, `P020-2 post-hardening verification failed (${verify.status})`);
    const verified = verifyBody?.response?.blueprint || verifyBody?.blueprint || null;
    const verifiedSearch = phase6FindModule(verified?.flow, 1);
    const verifiedVoice = phase6FindModule(verified?.flow, 2);
    if (String(verifiedSearch?.mapper?.formula || "").trim() !== desiredFormula || !String(verifiedVoice?.mapper?.voice_id || "").includes("Slide_Voice_ID")) {
      throw new HttpError(502, "P020-2 post-hardening verification did not match the Studio request-scoped contract");
    }
    if (auditId) {
      try {
        await airtableFetch(env, "Make Admin Queue", auditId, {
          method: "PATCH",
          body: JSON.stringify({ fields: {
            Status: "Succeeded",
            Completed_At: new Date().toISOString(),
            Error_Message: "",
            Result_JSON: JSON.stringify({ ok: true, scenario_id: PHASE6_P0202_SCENARIO_ID, deployed_name: verified?.name, request_scoped: true, scheduling_changed: false }),
          }}),
        });
      } catch {}
    }
    return { ok: true, already_ready: false, scenario_id: PHASE6_P0202_SCENARIO_ID, live_name: verified?.name, audit_record_id: auditId };
  } catch (error) {
    if (auditId) {
      try {
        await airtableFetch(env, "Make Admin Queue", auditId, {
          method: "PATCH",
          body: JSON.stringify({ fields: {
            Status: "Failed",
            Completed_At: new Date().toISOString(),
            Error_Message: error instanceof Error ? error.message : "P020-2 request-scoped hardening failed",
          }}),
        });
      } catch {}
    }
    throw error;
  }
}
/*__STUDIO_WORKER_END:phase6EnsureP0202ProductionGeneric__*/

export function phase6Mp3DurationSeconds(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) return null;
  let offset = 0;
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    offset = 10 + size;
  }
  const brV1L3 = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
  const brV2L3 = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0];
  const srBase = [44100,48000,32000,0];
  let duration = 0;
  let frames = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) { offset += 1; continue; }
    const versionBits = (bytes[offset + 1] >> 3) & 0x03;
    const layerBits = (bytes[offset + 1] >> 1) & 0x03;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
    const sampleIndex = (bytes[offset + 2] >> 2) & 0x03;
    const padding = (bytes[offset + 2] >> 1) & 0x01;
    if (layerBits !== 0x01 || versionBits === 0x01 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) { offset += 1; continue; }
    const isV1 = versionBits === 0x03;
    const bitrate = (isV1 ? brV1L3 : brV2L3)[bitrateIndex] * 1000;
    let sampleRate = srBase[sampleIndex];
    if (versionBits === 0x02) sampleRate /= 2;
    if (versionBits === 0x00) sampleRate /= 4;
    if (!bitrate || !sampleRate) { offset += 1; continue; }
    const samplesPerFrame = isV1 ? 1152 : 576;
    const frameLength = Math.floor((isV1 ? 144 : 72) * bitrate / sampleRate) + padding;
    if (frameLength <= 4 || offset + frameLength > bytes.length + 1) { offset += 1; continue; }
    duration += samplesPerFrame / sampleRate;
    frames += 1;
    offset += frameLength;
  }
  return frames > 0 && duration > 0 ? duration : null;
}
/*__STUDIO_WORKER_END:phase6Mp3DurationSeconds__*/

export async function phase6MeasureAndPersistMissingVoiceDurations(env, outputRecord) {
  const slides = await phase6SlidesForOutput(env, outputRecord);
  const measured = [];
  for (const slide of slides) {
    const voiceEnabled = slide?.voiceover?.enabled !== false && Boolean(phase6Text(slide?.voiceover?.text, 5000));
    if (!voiceEnabled || !slide?.voiceover?.url || phase6Number(slide?.voiceover?.duration_seconds, null)) continue;
    try {
      const response = await fetch(slide.voiceover.url, { method: "GET", redirect: "follow" });
      if (!response.ok) continue;
      const buffer = new Uint8Array(await response.arrayBuffer());
      let seconds = phase6Mp3DurationSeconds(buffer);
      if (!seconds) {
        const contentLength = Number(response.headers.get("content-length") || buffer.length || 0);
        if (contentLength > 0) seconds = (contentLength * 8) / 128000;
      }
      if (!seconds || !Number.isFinite(seconds) || seconds <= 0) continue;
      seconds = Math.round(seconds * 1000000) / 1000000;
      await airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, slide.id, {
        method: "PATCH",
        body: JSON.stringify({ fields: { Slide_Voiceover_Duration_Seconds: seconds }, typecast: false }),
      });
      measured.push({ id: slide.id, duration_seconds: seconds });
    } catch {}
  }
  return measured;
}
/*__STUDIO_WORKER_END:phase6MeasureAndPersistMissingVoiceDurations__*/

export async function phase6ScenarioState(env, scenarioId) {
  const body = await phase6MakeApiJson(env, `/scenarios/${scenarioId}`, { method: "GET" });
  const scenario = body?.scenario || body?.response?.scenario || body || {};
  return { isActive: scenario?.isActive === true, scenario };
}
/*__STUDIO_WORKER_END:phase6ScenarioState__*/

export async function phase6SetScenarioActive(env, scenarioId, active) {
  await phase6MakeApiJson(env, `/scenarios/${scenarioId}/${active ? "start" : "stop"}`, { method: "POST" });
}
/*__STUDIO_WORKER_END:phase6SetScenarioActive__*/

export function phase6RunAlreadyActiveError(error) {
  return /422|already.*running|currently.*running|active execution/i.test(String(error?.message || error || ""));
}
/*__STUDIO_WORKER_END:phase6RunAlreadyActiveError__*/

export async function phase6PulseOnDemandScenario(env, scenarioId, options = {}) {
  void env;
  void options;
  console.warn("Make on-demand pulse retired", scenarioId);
  return { executionId: null, body: { skipped: "make_retired" } };
  const waitMs = Number(options.waitMs || 15000);
  const before = await phase6ScenarioState(env, scenarioId);
  try {
    if (!before.isActive) await phase6SetScenarioActive(env, scenarioId, true);
    try {
      const run = await phase6RunScenario(env, scenarioId, options.data || null);
      if (run?.executionId && waitMs > 0) {
        await phase6WaitForScenarioExecution(env, scenarioId, run.executionId, waitMs, 2000);
      }
      return run;
    } catch (error) {
      if (!phase6RunAlreadyActiveError(error)) throw error;
      return { executionId: null, body: { skipped: "already-running" } };
    }
  } finally {
    if (!before.isActive) {
      try { await phase6StopScenarioVerified(env, scenarioId, 4); } catch (error) {
        console.error(`Could not restore on-demand scenario ${scenarioId} OFF`, error);
      }
    }
  }
}
/*__STUDIO_WORKER_END:phase6PulseOnDemandScenario__*/

export async function phase6WaitForOutputStatus(env, outputRecordId, predicate, timeoutMs = 90000, pollMs = 2500) {
  const started = Date.now();
  let record = null;
  while (Date.now() - started < timeoutMs) {
    record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId);
    if (predicate(record)) return { matched: true, record };
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { matched: false, record };
}
/*__STUDIO_WORKER_END:phase6WaitForOutputStatus__*/

export async function phase6AutoRunRenderPipeline(env, outputRecordId) {
  const r4State = await phase6ScenarioState(env, PHASE6_R4_SCENARIO_ID);
  const r5State = await phase6ScenarioState(env, PHASE6_R5_SCENARIO_ID);
  let r4Execution = null;
  const r5Executions = [];
  try {
    let admitted = null;
    if (!r4State.isActive) {
      await phase6SetScenarioActive(env, PHASE6_R4_SCENARIO_ID, true);
    }
    try {
      const r4 = await phase6RunScenario(env, PHASE6_R4_SCENARIO_ID);
      r4Execution = r4.executionId;
    } catch (error) {
      if (!phase6RunAlreadyActiveError(error)) throw error;
    }
    if (r4Execution) {
      const r4Done = await phase6WaitForScenarioExecution(env, PHASE6_R4_SCENARIO_ID, r4Execution, 60000, 2000);
      if (r4Done.done && !r4Done.success) throw new HttpError(502, `R4 rerender start failed with status ${r4Done.status}`);
    }
    admitted = await phase6WaitForOutputStatus(env, outputRecordId, (record) => {
      const status = String(f(record, "Render_Status") || "");
      return ["Rendering", "Rendered", "Failed"].includes(status);
    }, 30000, 1500);

    if (!admitted.matched) throw new HttpError(504, "R4 did not move the output into Rendering within the expected window");
    if (String(f(admitted.record, "Render_Status") || "") === "Failed") throw new HttpError(502, "R4 marked the output Failed");
    if (String(f(admitted.record, "Render_Status") || "") === "Rendered") return { completed: true, r4_execution_id: r4Execution, r5_execution_ids: [] };

    if (!r5State.isActive) {
      await phase6SetScenarioActive(env, PHASE6_R5_SCENARIO_ID, true);
    }
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 2500 : 5000));
      const r5 = await phase6RunScenario(env, PHASE6_R5_SCENARIO_ID);
      r5Executions.push(r5.executionId);
      const r5Done = await phase6WaitForScenarioExecution(env, PHASE6_R5_SCENARIO_ID, r5.executionId, 45000, 2000);
      if (r5Done.done && !r5Done.success) throw new HttpError(502, `R5 finalization failed with status ${r5Done.status}`);
      const current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId);
      const renderStatus = String(f(current, "Render_Status") || "");
      if (renderStatus === "Rendered" && f(current, "Studio_Preview_URL")) {
        return {
          completed: true,
          r4_execution_id: r4Execution,
          r5_execution_ids: r5Executions,
          final_file_url: f(current, "Final_File_URL") || null,
          studio_preview_url: f(current, "Studio_Preview_URL") || null,
          preview_updated_at: f(current, "Studio_Preview_Updated_At") || null,
        };
      }
      if (renderStatus === "Failed") throw new HttpError(502, String(f(current, "Final_File_Error_Message") || f(current, "Remotion_Error_Message") || "R5 marked the output Failed"));
    }
    return { completed: false, r4_execution_id: r4Execution, r5_execution_ids: r5Executions };
  } finally {
    try { if (!r4State.isActive) await phase6SetScenarioActive(env, PHASE6_R4_SCENARIO_ID, false); } catch {}
    try { if (!r5State.isActive) await phase6SetScenarioActive(env, PHASE6_R5_SCENARIO_ID, false); } catch {}
  }
}
/*__STUDIO_WORKER_END:phase6AutoRunRenderPipeline__*/

export async function phase6StopScenarioVerified(env, scenarioId, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let before = null;
    try {
      before = await phase6ScenarioState(env, scenarioId);
      if (!before.isActive) return { inactive: true, attempts: attempt, already_inactive: true };
    } catch (error) {
      lastError = error;
    }

    if (before?.isActive) {
      try {
        await phase6SetScenarioActive(env, scenarioId, false);
      } catch (error) {
        // Make can report a stop-side race (for example already stopped) while the
        // durable state is already inactive. Always verify state after the request.
        lastError = error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const after = await phase6ScenarioState(env, scenarioId);
      if (!after.isActive) {
        return {
          inactive: true,
          attempts: attempt + 1,
          already_inactive: false,
          stop_error: lastError instanceof Error ? lastError.message : null,
        };
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return { inactive: false, attempts, error: lastError instanceof Error ? lastError.message : null };
}
/*__STUDIO_WORKER_END:phase6StopScenarioVerified__*/

export async function phase6PulseInactiveScenario(env, scenarioId, outputRecordId, predicate, waitMs = 9000) {
  const before = await phase6ScenarioState(env, scenarioId);
  if (before.isActive) {
    throw new HttpError(409, `Phase 6 refuses to pulse active scenario ${scenarioId}; an unrelated execution may own it`);
  }

  let eligible = [];
  if (Number(scenarioId) === PHASE6_R4_SCENARIO_ID) {
    eligible = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 3,
      filterFormula: 'AND({Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0)',
    });
  } else if (Number(scenarioId) === PHASE6_R5_SCENARIO_ID) {
    eligible = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 6,
      view: 'R5 - Rendering Jobs to Poll',
    });
  }

  if (eligible.length) {
    if (eligible.length !== 1 || eligible[0]?.id !== outputRecordId) {
      throw new HttpError(409, `Phase 6 exact pulse isolation blocked scenario ${scenarioId}; eligible outputs=${eligible.map((row) => row.id).join(',') || 'none'}, requested=${outputRecordId}`);
    }
  } else if ([PHASE6_R4_SCENARIO_ID, PHASE6_R5_SCENARIO_ID].includes(Number(scenarioId))) {
    throw new HttpError(409, `Phase 6 exact pulse isolation found no eligible output for scenario ${scenarioId}; requested=${outputRecordId}`);
  }

  let started = false;
  let observed = { matched: false, record: await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId) };
  let cleanup = null;
  try {
    await phase6SetScenarioActive(env, scenarioId, true);
    started = true;
    try {
      await phase6RunScenario(env, scenarioId);
    } catch (error) {
      if (!phase6RunAlreadyActiveError(error)) throw error;
    }
    observed = await phase6WaitForOutputStatus(env, outputRecordId, predicate, waitMs, 1000);
    return { started, observed, was_active: false, exact_selector_isolation: true, eligible_count: eligible.length };
  } finally {
    cleanup = await phase6StopScenarioVerified(env, scenarioId, 4);
    if (!cleanup.inactive) console.error(`Phase 6 could not restore scenario ${scenarioId} inactive`, cleanup);
  }
}
/*__STUDIO_WORKER_END:phase6PulseInactiveScenario__*/

export function phase6TimeMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : null;
}
/*__STUDIO_WORKER_END:phase6TimeMs__*/

export function phase6CompactTimestampMs(value) {
  const match = String(value || "").match(/(20\d{12})/);
  if (!match) return null;
  const s = match[1];
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`;
  return phase6TimeMs(iso);
}
/*__STUDIO_WORKER_END:phase6CompactTimestampMs__*/

export function phase6CurrentRenderStartedAfterReview(record) {
  const requestedAt = phase6TimeMs(f(record, "Review_Decision_At"));
  if (requestedAt === null) return false;
  const jobAt = phase6CompactTimestampMs(f(record, "Remotion_Job_ID"));
  return jobAt !== null && jobAt >= requestedAt - 5000;
}
/*__STUDIO_WORKER_END:phase6CurrentRenderStartedAfterReview__*/

export function phase6CurrentFinalFileAfterReview(record) {
  const requestedAt = phase6TimeMs(f(record, "Review_Decision_At"));
  if (requestedAt === null) return false;
  const fileAt = phase6CompactTimestampMs(f(record, "Final_File_Name"));
  return fileAt !== null && fileAt >= requestedAt - 5000;
}
/*__STUDIO_WORKER_END:phase6CurrentFinalFileAfterReview__*/

export function phase6PreviewFulfillsCurrentReview(record) {
  const renderStatus = String(f(record, "Render_Status") || "");
  const previewUrl = String(f(record, "Studio_Preview_URL") || "").trim();
  if (renderStatus !== "Rendered" || !previewUrl) return false;

  const reviewStatus = String(f(record, "Review_Status") || "");
  // When no changes request is outstanding, the current rendered preview is valid.
  if (reviewStatus !== "Changes Requested") return true;

  // For an outstanding changes request, completion must be proven by a preview cache write
  // at or after the review request. An older Rendered record/preview must never satisfy a
  // newer Studio handoff.
  const requestedAt = phase6TimeMs(f(record, "Review_Decision_At"));
  const previewAt = phase6TimeMs(f(record, "Studio_Preview_Updated_At"));
  if (requestedAt === null || previewAt === null) return false;
  return previewAt >= requestedAt;
}
/*__STUDIO_WORKER_END:phase6PreviewFulfillsCurrentReview__*/

export async function phase6RestoreProductionReviewReady(env, record) {
  if (Boolean(f(record, "Do_Not_Publish"))) return record;
  const outputStatus = String(f(record, "Output_Status") || "").trim();
  const reviewStatus = String(f(record, "Review_Status") || "").trim();
  const publishStatus = String(f(record, "Publish_Status") || "").trim();
  if (
    reviewStatus === "Approved"
    || outputStatus === "Approved for Publishing"
    || ["Published", "Publishing", "Scheduled"].includes(outputStatus)
    || ["Published", "Publishing", "Scheduled", "Ready to Schedule", "Ready to Publish"].includes(publishStatus)
  ) {
    return record;
  }
  if (!phase6PreviewFulfillsCurrentReview(record)) return record;
  if (outputStatus === "Ready for Review" && (reviewStatus === "Review Sent" || reviewStatus === "Ready for Review")) return record;
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Output_Status: "Ready for Review",
        Review_Status: "Review Sent",
        Publish_Status: "Not Ready",
      },
      typecast: true,
    }),
  });
}
/*__STUDIO_WORKER_END:phase6RestoreProductionReviewReady__*/

export async function inspectRemotionOrCloudConvertStatus(statusUrl) {
  const url = String(statusUrl || "").trim();
  if (!url) return { still_running: false, terminal: false, status: null };
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      ...(typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? { signal: AbortSignal.timeout(5000) } : {}),
    });
    if (!response.ok) return { still_running: false, terminal: false, status: `http-${response.status}` };
    const body = await response.json().catch(() => ({}));
    const status = String(body.status || body.state || body.data?.status || "").toLowerCase();
    const still_running = ["preparing", "rendering", "pending", "queued", "accepted", "waiting", "processing", "running"].includes(status);
    const terminal = ["completed", "complete", "done", "success", "failed", "error", "finished"].includes(status);
    return { still_running, terminal, status: status || null };
  } catch {
    return { still_running: false, terminal: false, status: "unreachable" };
  }
}
/*__STUDIO_WORKER_END:inspectRemotionOrCloudConvertStatus__*/

export function phase6RenderHandoffState(record) {
  const renderStatus = String(f(record, "Render_Status") || "");
  if (phase6PreviewFulfillsCurrentReview(record)) return "rendered_preview_ready";
  if (renderStatus === "Failed") return "render_failed";
  if (renderStatus === "Rendering") return "rendering";
  if (renderStatus === "Ready for Render") return "render_ready";
  // A current Remotion job can finish before R5 uploads the final file / refreshes the Studio preview.
  // Keep that state in finalization instead of rebuilding a new render package and accidentally rerendering.
  if (renderStatus === "Rendered" && phase6CurrentRenderStartedAfterReview(record)) return "finalizing";
  return "render_prep_needed";
}
/*__STUDIO_WORKER_END:phase6RenderHandoffState__*/

export function phase6CreativeMixRevisionInFlight(record) {
  const renderStatus = String(f(record, "Render_Status") || "").trim();
  if (studioOutputIsNativePhoto(record) || renderStatus === "Native Photo Route") return false;
  const reviewStatus = String(f(record, "Review_Status") || "").trim();
  const outputStatus = String(f(record, "Output_Status") || "").trim();
  // Publish Approve stamps Review_Decision_At. That is not a mix rerender.
  if (reviewStatus === "Changes Requested") return true;
  if (outputStatus === "In Production") return true;
  return false;
}
/*__STUDIO_WORKER_END:phase6CreativeMixRevisionInFlight__*/

export function phase6CreativeHandoffStatus(record, slides = []) {
  const reviewStatus = String(f(record, "Review_Status") || "");
  const outputStatus = String(f(record, "Output_Status") || "");
  const renderStatus = String(f(record, "Render_Status") || "");
  const storageStatus = String(f(record, "Final_File_Storage_Status") || "");
  const requestedAt = phase6TimeMs(f(record, "Review_Decision_At"));
  const previewAt = phase6TimeMs(f(record, "Studio_Preview_Updated_At"));
  const previewReady = phase6PreviewFulfillsCurrentReview(record);
  const requestStarted = phase6CreativeMixRevisionInFlight(record);
  const pendingVoice = phase6PendingVoicePrepSlides(slides);
  const voiceFailures = (Array.isArray(slides) ? slides : []).filter((slide) => /fail|error/i.test(String(slide?.voiceover?.status || "")));
  const renderError = renderStatus === "Failed" ? String(f(record, "Remotion_Error_Message") || "Render failed") : null;
  const finalError = String(f(record, "Final_File_Error_Message") || "").trim() || null;
  const currentRender = phase6CurrentRenderStartedAfterReview(record);
  const currentFinal = phase6CurrentFinalFileAfterReview(record);
  const renderComplete = previewReady || (renderStatus === "Rendered" && currentRender);
  const finalComplete = previewReady || (renderComplete && storageStatus === "Uploaded" && Boolean(f(record, "Final_File_URL")) && currentFinal);

  const stages = [
    { key: "saved", label: "Saved", status: requestStarted ? "complete" : "pending", detail: requestStarted ? "Creative changes are persisted." : "No change request is active." },
    { key: "voice_prep", label: "Voice Prep", status: voiceFailures.length ? "error" : (!requestStarted ? "pending" : pendingVoice.length ? "active" : "complete"), detail: voiceFailures.length ? `${voiceFailures.length} slide voiceover(s) failed.` : (pendingVoice.length ? `Preparing ${pendingVoice.length} slide voiceover(s).` : "Voice assets are ready."), error: voiceFailures.length ? `Voice prep failed for: ${voiceFailures.map((s) => s.name || s.id).join(", ")}` : null },
    { key: "rendering", label: "Rendering", status: renderError ? "error" : (!requestStarted || pendingVoice.length ? "pending" : renderComplete ? "complete" : ["Rendering","Ready for Render"].includes(renderStatus) ? "active" : "pending"), detail: renderError ? renderError : (renderComplete ? "The current requested revision has rendered." : renderStatus === "Rendering" ? "Remotion is rendering the requested revision." : renderStatus === "Ready for Render" ? "The render package is ready for R4." : "Waiting for render package/start."), error: renderError },
    // These two must gate on requestStarted like the stages above them. Without it, a finished
    // earlier render satisfies them on its own and an idle output shows a half-ticked revision
    // that never happened.
    { key: "final_upload", label: "Final Upload", status: !requestStarted ? "pending" : (!finalComplete && finalError) ? "error" : (!renderComplete ? "pending" : finalComplete ? "complete" : "active"), detail: !requestStarted ? "No change request is active." : (!finalComplete && finalError) ? finalError : (finalComplete ? "Final Google Drive upload is complete." : renderComplete ? "Render is complete; final upload is being finalized." : "Waiting for render completion."), error: (requestStarted && !finalComplete && finalError) ? finalError : null },
    { key: "preview_ready", label: "Preview Ready", status: !requestStarted ? "pending" : previewReady ? "complete" : (!finalComplete ? "pending" : "active"), detail: !requestStarted ? "No change request is active." : previewReady ? "Studio native preview is refreshed for this revision." : finalComplete ? "Final file is ready; Studio preview refresh is pending." : "Waiting for final upload.", error: null },
  ];

  const failed = stages.find((stage) => stage.status === "error") || null;
  const active = stages.find((stage) => stage.status === "active") || null;
  const pending = stages.find((stage) => stage.status === "pending") || null;
  const completed = stages.every((stage) => stage.status === "complete");
  const current = failed || active || pending || stages[stages.length - 1];
  const state = completed ? "rendered_preview_ready"
    : failed?.key === "voice_prep" ? "voice_prep_failed"
    : failed ? "render_failed"
    : pendingVoice.length ? "voice_prep_running"
    : renderStatus === "Ready for Render" ? "render_ready"
    : renderStatus === "Rendering" ? "rendering"
    : renderStatus === "Rendered" && currentRender ? "finalizing"
    : "render_prep_needed";

  return {
    active: requestStarted,
    completed,
    overall_status: completed ? "complete" : failed ? "error" : requestStarted ? "active" : "idle",
    handoff_state: state,
    current_stage: current?.key || null,
    current_stage_label: current?.label || null,
    error_stage: failed?.key || null,
    error: failed?.error || null,
    stages,
    requested_at: requestedAt ? new Date(requestedAt).toISOString() : null,
    preview_updated_at: previewAt ? new Date(previewAt).toISOString() : null,
    message: completed
      ? (Boolean(f(record, "Do_Not_Publish"))
        ? "Voice prep, rerender, final upload, and Studio preview refresh are complete. Publishing remains blocked."
        : "New preview is ready. Play it, then approve for publishing when the mix sounds right.")
      : failed ? `${failed.label} failed: ${failed.error || failed.detail}`
      : current ? current.detail : "No creative-change handoff is active.",
  };
}
/*__STUDIO_WORKER_END:phase6CreativeHandoffStatus__*/

export async function getOutputCreativeHandoffStatus(request, env, url, authorization) {
  const match = url.pathname.match(/^\/api\/outputs\/(rec[A-Za-z0-9]+)\/creative\/handoff\/status$/);
  if (!match) throw new HttpError(400, "Invalid Phase 6 handoff status route");
  const id = match[1];
  const record = await phase6RestoreProductionReviewReady(
    env,
    await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id)
  );
  const slides = await phase6SlidesForOutput(env, record);
  return respond(request, env, {
    ok: true,
    handoff: phase6CreativeHandoffStatus(record, slides),
    output: mapPhase6CreativeOutput(record),
  });
}
/*__STUDIO_WORKER_END:getOutputCreativeHandoffStatus__*/

export async function phase6AdvanceRenderPipelineShort(env, outputRecordId) {
  let current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId);
  if (!Boolean(f(current, "Do_Not_Publish")) && !phase6AllowsProductionMixContinuation(current)) {
    throw new HttpError(409, "Phase 6 automatic rerender requires Do_Not_Publish or an in-progress mix revision");
  }
  let state = phase6RenderHandoffState(current);
  if (state === "rendered_preview_ready") {
    current = await phase6RestoreProductionReviewReady(env, current);
    return {
      completed: true,
      handoff_state: state,
      record: current,
      studio_preview_url: f(current, "Studio_Preview_URL") || null,
      preview_updated_at: f(current, "Studio_Preview_Updated_At") || null,
      final_file_url: f(current, "Final_File_URL") || null,
    };
  }
  if (state === "render_failed") {
    return { completed: false, handoff_state: state, record: current, error: String(f(current, "Final_File_Error_Message") || f(current, "Remotion_Error_Message") || "Render failed") };
  }

  if (state === "render_ready") {
    const pulse = await phase6PulseInactiveScenario(
      env,
      PHASE6_R4_SCENARIO_ID,
      outputRecordId,
      (record) => ["Rendering", "Rendered", "Failed"].includes(String(f(record, "Render_Status") || "")),
      12000,
    );
    current = pulse.observed?.record || await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId);
    state = phase6RenderHandoffState(current);
    if (state === "render_failed") return { completed: false, handoff_state: state, record: current, error: "R4 marked the output Failed" };
    if (state === "render_ready") {
      return { completed: false, handoff_state: "render_start_pending", record: current, message: "R4 pulse completed but the output has not entered Rendering yet." };
    }
    if (state === "rendered_preview_ready") {
      return { completed: true, handoff_state: state, record: current, studio_preview_url: f(current, "Studio_Preview_URL") || null, preview_updated_at: f(current, "Studio_Preview_Updated_At") || null, final_file_url: f(current, "Final_File_URL") || null };
    }
    if (state === "rendering") {
      return { completed: false, handoff_state: "rendering", record: current, message: "R4 started the preview render. Studio will poll/finalize it on the next automatic handoff check." };
    }
    if (state === "finalizing") {
      return { completed: false, handoff_state: "finalizing", record: current, message: "Render completed; final Google Drive upload and Studio preview refresh are still finalizing." };
    }
  }

  if (state === "finalizing") {
    // R5 can set Render_Status=Rendered before its Drive upload and Studio-preview cache modules finish.
    // Do not start a duplicate R5 execution while that same execution is finishing those downstream modules.
    return { completed: false, handoff_state: "finalizing", record: current, message: "Render completed; final Google Drive upload and Studio preview refresh are still finalizing." };
  }

  if (state === "rendering") {
    const statusUrl = String(f(current, "Remotion_Status_URL") || "").trim();
    const remotion = await inspectRemotionOrCloudConvertStatus(statusUrl);
    if (remotion.still_running) {
      return {
        completed: false,
        handoff_state: "rendering",
        record: current,
        message: "Remotion is still rendering. R5 will run when that job finishes.",
      };
    }
    const pulse = await phase6PulseInactiveScenario(
      env,
      PHASE6_R5_SCENARIO_ID,
      outputRecordId,
      (record) => ["Rendered", "Failed"].includes(String(f(record, "Render_Status") || "")),
      8000,
    );
    current = pulse.observed?.record || await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId);
    state = phase6RenderHandoffState(current);
    if (state === "render_failed") return { completed: false, handoff_state: state, record: current, error: String(f(current, "Final_File_Error_Message") || f(current, "Remotion_Error_Message") || "R5 marked the output Failed") };
    if (state === "rendered_preview_ready") {
      return {
        completed: true,
        handoff_state: state,
        record: current,
        studio_preview_url: f(current, "Studio_Preview_URL") || null,
        preview_updated_at: f(current, "Studio_Preview_Updated_At") || null,
        final_file_url: f(current, "Final_File_URL") || null,
      };
    }
    const nextState = phase6RenderHandoffState(current);
    return { completed: false, handoff_state: nextState === "finalizing" ? "finalizing" : "rendering", record: current, message: nextState === "finalizing" ? "Render completed; final upload and Studio preview refresh are still finalizing." : "Render is still processing; another short R5 poll is required." };
  }

  return { completed: false, handoff_state: state, record: current };
}
/*__STUDIO_WORKER_END:phase6AdvanceRenderPipelineShort__*/

export async function phase6EnsureRenderPackageForContinuation(env, outputRecord) {
  const status = String(f(outputRecord, "Render_Status") || "");
  const outputStatus = String(f(outputRecord, "Output_Status") || "");
  const reviewStatus = String(f(outputRecord, "Review_Status") || "");
  const handoffState = phase6RenderHandoffState(outputRecord);
  const needsFreshPackage =
    handoffState === "render_prep_needed" &&
    !["Ready for Render", "Rendering"].includes(status) &&
    !phase6PreviewFulfillsCurrentReview(outputRecord) &&
    (outputStatus === "In Production" || reviewStatus === "Changes Requested");
  if (!needsFreshPackage) return outputRecord;
  if (!Boolean(f(outputRecord, "Do_Not_Publish"))) return outputRecord;

  const renderPackage = await phase6BuildPreviewRenderPackage(env, outputRecord);
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecord.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
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
        Do_Not_Publish: true,
      },
      typecast: true,
    }),
  });
}
/*__STUDIO_WORKER_END:phase6EnsureRenderPackageForContinuation__*/

export async function continueOutputCreativeHandoff(request, env, url, authorization) {
  const match = url.pathname.match(/^\/api\/outputs\/(rec[A-Za-z0-9]+)\/creative\/render\/continue$/);
  if (!match) throw new HttpError(400, "Invalid Phase 6 continuation route");
  const id = match[1];
  let current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  if (studioOutputIsNativePhoto(current) || String(f(current, "Render_Status") || "").trim() === "Native Photo Route") {
    const slides = await phase6SlidesForOutput(env, current);
    const handoff = phase6CreativeHandoffStatus(current, slides);
    return respond(request, env, {
      ok: true,
      completed: true,
      handoff_state: "idle",
      handoff,
      message: "Native stills do not use a video mix.",
    });
  }
  if (!Boolean(f(current, "Do_Not_Publish")) && !phase6AllowsProductionMixContinuation(current)) {
    throw new HttpError(409, "No mix rerender is in progress for this output");
  }

  const pendingSlides = phase6PendingVoicePrepSlides(await phase6SlidesForOutput(env, current));
  if (pendingSlides.length) {
    const voice = await phase6AdvanceVoicePrepShort(env, current);
    if (!voice.completed) {
      return respond(request, env, {
        ok: true,
        handoff_state: "voice_prep_running",
        voice_prep_pending: true,
        pending_voice_slides: voice.pending_voice_slides || pendingSlides,
        message: "Voice prep is still running. Studio will continue automatically.",
      });
    }
    current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  }

  const stateBeforePackage = phase6RenderHandoffState(current);
  current = await phase6EnsureRenderPackageForContinuation(env, current);
  const stateAfterPackage = phase6RenderHandoffState(current);
  if (stateBeforePackage === "render_prep_needed" && stateAfterPackage === "render_ready") {
    return respond(request, env, {
      ok: true,
      handoff_state: "render_ready",
      completed: false,
      record: mapPhase6CreativeOutput(current),
      message: "Voice prep is complete and the validated preview package is Ready for Render. Studio will start R4 on the next automatic handoff check.",
    });
  }
  const step = await phase6AdvanceRenderPipelineShort(env, id);
  let stepRecord = step.record || current;
  if (step.completed || phase6PreviewFulfillsCurrentReview(stepRecord)) {
    stepRecord = await phase6RestoreProductionReviewReady(env, stepRecord);
  }
  const mapped = mapPhase6CreativeOutput(stepRecord);
  const handoff = phase6CreativeHandoffStatus(stepRecord, await phase6SlidesForOutput(env, stepRecord));
  return respond(request, env, {
    ok: true,
    handoff_state: handoff.handoff_state || step.handoff_state,
    handoff,
    completed: Boolean(handoff.completed || step.completed),
    record: mapped,
    studio_preview_url: step.studio_preview_url || null,
    preview_updated_at: step.preview_updated_at || null,
    final_file_url: step.final_file_url || null,
    error: step.error || null,
    message: handoff.message || (step.completed
      ? "Voice prep, rerender, final upload, and Studio preview refresh are complete. Publishing remains blocked."
      : (step.error || step.message || "Studio is continuing the rerender automatically.")),
  });
}
/*__STUDIO_WORKER_END:continueOutputCreativeHandoff__*/

export async function phase6MakeApiConfig(env) {
  void env;
  throw new HttpError(410, "Make.com is retired. Pipeline stages run on the Python runner.");
}
/*__STUDIO_WORKER_END:phase6MakeApiConfig__*/

export async function phase6MakeApiJson(env, path, init = {}) {
  const { makeApiBase, headers } = await phase6MakeApiConfig(env);
  const timeoutMs = Number(init.timeoutMs);
  const fetchInit = { ...init };
  delete fetchInit.timeoutMs;
  if (!fetchInit.signal && Number.isFinite(timeoutMs) && timeoutMs > 0 && typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    fetchInit.signal = AbortSignal.timeout(timeoutMs);
  }
  const response = await fetch(`${makeApiBase}${path}`, { ...fetchInit, headers: { ...headers, ...(init.headers || {}) } });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (!response.ok) {
    const detail = raw ? `: ${raw.slice(0, 700)}` : "";
    throw new HttpError(response.status, `Make API ${init.method || "GET"} ${path} failed (${response.status})${detail}`);
  }
  return body;
}
/*__STUDIO_WORKER_END:phase6MakeApiJson__*/

export async function phase6EnsureScenarioActive(env, scenarioId) {
  const body = await phase6MakeApiJson(env, `/scenarios/${scenarioId}`, { method: "GET" });
  const scenario = body?.scenario || body?.response?.scenario || body || {};
  if (scenario?.isActive === true) return scenario;
  const started = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/start`, { method: "POST" });
  return started?.scenario || started?.response?.scenario || started || scenario;
}
/*__STUDIO_WORKER_END:phase6EnsureScenarioActive__*/

export function cadenceScheduleSync(ctx, env, options = {}) {
  const run = syncProductionCadence(env, options).catch((error) => {
    console.warn("production cadence sync failed", error);
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(run);
  return run;
}
/*__STUDIO_WORKER_END:cadenceScheduleSync__*/

export async function studioHealPromotedMissingFanout(env, { limit = 8 } = {}) {
  const requests = await listRecords(env, PRODUCTION_REQUEST_TABLE, {
    limit,
    sortField: "Updated_At",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Active}=1,{Request_Status}="Promoted",{Promoted_Content_Item}!=BLANK())',
  }).catch(() => []);
  const healed = [];
  for (const requestRecord of requests || []) {
    try {
      const parentId = studioFirstLinkedId(f(requestRecord, "Promoted_Content_Item"));
      if (!parentId) continue;
      const notesText = studioRequestNotesText(requestRecord);
      // Re-enable horizontal Vibe Cut destinations (Standard + Short) when Short was
      // left unchecked after an earlier 6-destination draft.
      if (studioIsVibeCut(requestRecord) && isHorizontalVibeCutAspect(notesText)) {
        const plan = item4ParseJson(f(requestRecord, "Studio_Output_Plan_JSON"), null);
        const planItems = Array.isArray(plan?.items) ? plan.items : [];
        const capped = capVibeCutPlanItems(planItems.length ? planItems : [
          { platform: "YouTube", output_type: "Standard Video" },
          { platform: "YouTube", output_type: "Short" },
        ], { notes: notesText });
        if (capped.length) {
          await item4SyncPlanOutputs(env, requestRecord, capped);
        }
      }
      const enabled = (await outputRowsForProductionRequest(env, requestRecord.id))
        .filter((row) => Boolean(f(row, "Enabled")));
      if (!enabled.length) continue;
      const missing = enabled.filter((row) =>
        !arrayOrEmpty(f(row, "Platform_Output")).some((id) => /^rec[A-Za-z0-9]+$/.test(String(id || "")))
      );
      const job = parseStudioProductionJob(requestRecord);
      const forceRemount = Boolean(job?.heal?.force_multiclip_remount)
        || (studioIsVibeCut(requestRecord) && /remount/i.test(String(job?.detail || "")));
      if (!missing.length && !forceRemount) continue;
      let fanout = { routed_count: 0, blocked_count: 0, remaining: 0 };
      if (missing.length) {
        fanout = await fanoutProductionRequestOutputsToContentItems(env, requestRecord, parentId);
      }
      if (Number(fanout?.routed_count || 0) > 0 || forceRemount) {
        try { await enqueueStudioProductionJob(env, requestRecord.id, { resume: true }); } catch {}
      }
      healed.push({
        request_id: requestRecord.id,
        content_item_id: parentId,
        missing_before: missing.length,
        force_remount: forceRemount,
        routed: Number(fanout?.routed_count || 0),
        blocked: Number(fanout?.blocked_count || 0),
        remaining: Number(fanout?.remaining || 0),
      });
    } catch (error) {
      healed.push({
        request_id: requestRecord?.id || null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (healed.length) console.log("Studio promoted fanout heal", JSON.stringify({ count: healed.length, healed }));
  return healed;
}
/*__STUDIO_WORKER_END:studioHealPromotedMissingFanout__*/

export function continueParkedProductionAfterPromote(ctx, env, requestId = null) {
  const run = (async () => {
    await syncProductionCadence(env, { startCarousel: true, skipRenderPulse: true }).catch((error) => {
      console.warn("promote cadence start failed", error);
    });
    if (requestId) {
      try { await enqueueStudioProductionJob(env, requestId); } catch (error) {
        console.warn("studio produce enqueue failed", requestId, error);
      }
      try {
        await advanceStudioProductionOutputs(env, { requestRecordId: requestId, waitMs: 0 });
      } catch (error) {
        console.warn("studio continuation after promote failed", requestId, error);
      }
      try {
        const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
        if (studioIsAzFinishedVideo(requestRecord)) await azAutoApproveIfReady(env, requestId);
      } catch (error) {
        console.warn("AZ auto-queue after promote failed", requestId, error);
      }
    }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(run);
  return run;
}
/*__STUDIO_WORKER_END:continueParkedProductionAfterPromote__*/

export async function cadenceQueueHasWork(env, tableId, query) {
  try {
    const rows = await listRecords(env, tableId, {
      limit: 1,
      view: query.view || null,
      filterFormula: query.formula || null,
    });
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    console.warn("production cadence queue probe failed", tableId, query.view || query.formula, error);
    return false;
  }
}
/*__STUDIO_WORKER_END:cadenceQueueHasWork__*/

export async function cadenceRepairInProgress(env) {
  try {
    const rows = await listRecords(env, REPAIR_LEASE_TABLE_ID, {
      limit: 1,
      filterFormula: `AND({Status}="Processing",FIND("${REPAIR_LEASE_NOTE_PREFIX}", {Notes}&"")>0)`,
    });
    return rows.length > 0;
  } catch {
    return false;
  }
}
/*__STUDIO_WORKER_END:cadenceRepairInProgress__*/

export async function pulseStudioP3ForPlannedOutputs(env) {
  const rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 25,
    filterFormula: 'AND({Test_Run_ID}=BLANK(),NOT({Do_Not_Publish}),OR({Output_Status}="Planned",{Output_Status}="In Production"),{Production_Request_Output}!=BLANK(),{Content_Item}!=BLANK())',
  }).catch(() => []);
  const parentIds = [...new Set((rows || []).flatMap((row) => {
    const linked = f(row, "Content_Item");
    return Array.isArray(linked) ? linked.filter(Boolean) : [];
  }))].slice(0, 8);
  if (!parentIds.length) return [{ key: "P3", skipped: "no_work" }];
  const pulses = [];
  for (const contentItemId of parentIds) {
    try {
      const result = await item4PulseP3Python(env, contentItemId);
      pulses.push({ key: "P3", parent: contentItemId, ok: true, backend: "python", result });
    } catch (error) {
      pulses.push({
        key: "P3",
        parent: contentItemId,
        ok: false,
        backend: "python",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return pulses;
}
/*__STUDIO_WORKER_END:pulseStudioP3ForPlannedOutputs__*/

export async function cadenceHasRenderWork(env) {
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const contentTable = env.AIRTABLE_CONTENT_TABLE_ID;
  const checks = await Promise.all([
    cadenceQueueHasWork(env, contentTable, { view: "P1 - Ready for Package Generation", formula: "{Test_Run_ID}=BLANK()" }),
    cadenceQueueHasWork(env, outputTable, { formula: STUDIO_R2_WORK_FORMULA }),
    cadenceQueueHasWork(env, outputTable, { formula: STUDIO_R3_WORK_FORMULA }),
    cadenceQueueHasWork(env, outputTable, { formula: STUDIO_R4_WORK_FORMULA }),
    cadenceQueueHasWork(env, outputTable, { view: "R5 - Rendering Jobs to Poll", formula: "{Test_Run_ID}=BLANK()" }),
  ]);
  return checks.some(Boolean);
}
/*__STUDIO_WORKER_END:cadenceHasRenderWork__*/

export function studioFirstLinkedId(value) {
  const rows = Array.isArray(value) ? value : [value];
  for (const row of rows) {
    if (typeof row === "string" && /^rec[A-Za-z0-9]+$/.test(row)) return row;
    const id = row && typeof row === "object" ? String(row.id || "") : "";
    if (/^rec[A-Za-z0-9]+$/.test(id)) return id;
  }
  return null;
}
/*__STUDIO_WORKER_END:studioFirstLinkedId__*/

export function studioOutputIsPhotoSequenceRoute(record) {
  if (studioOutputIsNativePhotoRoute(
    f(record, "Platform"),
    f(record, "Studio_Output_Type"),
    f(record, "Platform_Output_Type")
  )) return true;
  return String(f(record, "Composition_ID") || "").trim() === "ChicagoShiningPhotoSequence";
}
/*__STUDIO_WORKER_END:studioOutputIsPhotoSequenceRoute__*/

export function studioOutputIsStoryRoute(record) {
  const format = String(f(record, "Format") || "").trim();
  const studioType = String(f(record, "Studio_Output_Type") || "").trim();
  return format === "Story" || studioType === "Story";
}
/*__STUDIO_WORKER_END:studioOutputIsStoryRoute__*/

export function studioClipLooksLikeVideo(clip) {
  const url = String(clip?.src || clip?.url || "");
  const name = String(clip?.asset_name || clip?.file_name || "");
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || /\.(mp4|mov|webm|m4v)$/i.test(name);
}
/*__STUDIO_WORKER_END:studioClipLooksLikeVideo__*/

export function studioPhotoSequenceNeedsContainHeal(po) {
  if (studioOutputIsStoryRoute(po)) return false;
  const renderStatus = String(f(po, "Render_Status") || "");
  if (/native photo/i.test(renderStatus)) return false;
  if (/rendering/i.test(renderStatus) && String(f(po, "Remotion_Job_ID") || "").trim()) return false;
  if (/^ready for review$/i.test(String(f(po, "Output_Status") || "")) && String(f(po, "Final_File_URL") || "").trim()) {
    return false;
  }
  let clips;
  try { clips = JSON.parse(String(f(po, "Render_Clip_List_JSON") || "[]")); } catch { return false; }
  if (!Array.isArray(clips) || !clips.length) return false;
  return clips.some((clip) => {
    if (studioClipLooksLikeVideo(clip)) return false;
    const url = String(clip?.src || clip?.url || "");
    const motion = String(clip?.motionStyle || clip?.motion?.type || "").toLowerCase().replace(/[\s_-]/g, "");
    const fit = String(clip?.fitMode || clip?.fit_mode || "").toLowerCase();
    if (/ITEM4-VARIANT-fill-crop/i.test(url)) return true;
    if (motion === "stillphoto" || motion === "slowzoom") return true;
    if (fit === "fill_crop") return true;
    return false;
  });
}
/*__STUDIO_WORKER_END:studioPhotoSequenceNeedsContainHeal__*/

export async function studioContinuationApplyInspectAction(env, po, result) {
  const action = String(result?.action || "");
  if (action === "start_render" || action === "prep_render") {
    if (action === "start_render" && String(f(po, "Remotion_Job_ID") || "").trim()) return null;
    const timing = String(f(po, "Timing_Status") || "").trim();
    const timeline = String(f(po, "Timing_Timeline_JSON") || "").trim();
    if ((timing === "Pending" || !timing) && timeline) {
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, po.id, {
        method: "PATCH",
        body: JSON.stringify({ fields: { Timing_Status: "Ready" }, typecast: true }),
      }).catch(() => null);
    }
    if ((timing === "Pending" || !timing) && !timeline) {
      return item4PulseT1Python(env, { outputRecordId: po.id, maxRuns: 1 });
    }
    return item4PulseR4Python(env, { outputRecordId: po.id });
  }
  if (action === "poll_render") {
    return item4PulseR5Python(env, { outputRecordId: po.id, maxRuns: 1 });
  }
  return null;
}
/*__STUDIO_WORKER_END:studioContinuationApplyInspectAction__*/

export function studioOutputNeedsRemotionPackage(record) {
  if (studioOutputIsNativePhotoRoute(
    f(record, "Platform"),
    f(record, "Studio_Output_Type"),
    f(record, "Platform_Output_Type")
  )) return false;
  if (studioOutputIsStoryRoute(record)) return false;
  if (!/^ready for review$/i.test(String(f(record, "Output_Status") || ""))) return false;
  return !String(f(record, "Final_File_URL") || "").trim();
}
/*__STUDIO_WORKER_END:studioOutputNeedsRemotionPackage__*/

export function studioOutputIsTerminalForContinuation(record) {
  const status = String(f(record, "Output_Status") || "");
  const publish = String(f(record, "Publish_Status") || "");
  const review = String(f(record, "Review_Status") || "");
  // Review Approved must stop continuation even when Output_Status was raced
  // back to Ready for Review (stale-RFR Stories after Approve All).
  return /published/i.test(status)
    || /published/i.test(publish)
    || /approved for publishing/i.test(status)
    || /^approved$/i.test(review);
}
/*__STUDIO_WORKER_END:studioOutputIsTerminalForContinuation__*/

/**
 * Re-fetch before opening Ready for Review so a concurrent Approve All cannot
 * be stomped back to Needs Eyes (Review Approved + Output_Status RFR).
 */
export async function studioContinuationOpenReadyForReview(env, po, reason) {
  const live = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, po.id).catch(() => po);
  if (studioOutputIsTerminalForContinuation(live)) {
    return { action: "stop", reason: "terminal" };
  }
  const status = String(f(live, "Output_Status") || "");
  if (/^ready for review$/i.test(status)) {
    return { action: "reviewable", reason: reason || "already_ready" };
  }
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, po.id, {
    method: "PATCH",
    body: JSON.stringify({ fields: { Output_Status: "Ready for Review" }, typecast: true }),
  });
  return { action: "opened_review", reason: reason || "opened_review" };
}
/*__STUDIO_WORKER_END:studioContinuationOpenReadyForReview__*/

export function studioOutputWrongVideoSelectorPath(record) {
  const selection = String(f(record, "Asset_Selection_Status") || "");
  return /partial match/i.test(selection)
    || Boolean(f(record, "Asset_Selection_Retry_Eligible"))
    || /partial match/i.test(String(f(record, "Asset_Match_Status") || ""));
}
/*__STUDIO_WORKER_END:studioOutputWrongVideoSelectorPath__*/

export function studioContinuationClearRetryFields() {
  return {
    Asset_Selection_Retry_Eligible: false,
    Remotion_Error_Message: null,
    Final_File_Error_Message: null,
  };
}
/*__STUDIO_WORKER_END:studioContinuationClearRetryFields__*/

export async function resetEmptyP3RemotionHandoffForR2(env) {
  const rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 25,
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Output_Status}="In Production",{Asset_Selection_Status}="Selected",{Selected_Assets_JSON}="",{Production_Request_Output}!=BLANK())',
  }).catch(() => []);
  let reset = 0;
  for (const row of rows || []) {
    if (studioOutputIsNativePhoto(row) || studioOutputIsPhotoSequenceRoute(row)) continue;
    try {
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Output_Status: "Ready for Review",
            Asset_Selection_Status: null,
          },
          typecast: true,
        }),
      });
      reset += 1;
    } catch (error) {
      console.warn("R2 remotion requeue failed", row.id, error);
    }
  }
  return { key: "R2-requeue", reset };
}
/*__STUDIO_WORKER_END:resetEmptyP3RemotionHandoffForR2__*/

export async function studioContinuationLoadContext(env, po, cache) {
  const outputRowId = studioFirstLinkedId(f(po, "Production_Request_Output"));
  if (!outputRowId) return null;
  if (!cache.outputRows.has(outputRowId)) {
    cache.outputRows.set(outputRowId, await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, outputRowId));
  }
  const outputRow = cache.outputRows.get(outputRowId);
  const requestId = studioFirstLinkedId(f(outputRow, "Production_Request"));
  if (!requestId) return null;
  if (!cache.requests.has(requestId)) {
    cache.requests.set(requestId, await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId));
  }
  const requestRecord = cache.requests.get(requestId);
  const parentId = studioFirstLinkedId(f(po, "Content_Item"));
  if (!parentId) return null;
  if (!cache.parents.has(parentId)) {
    cache.parents.set(parentId, await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId));
  }
  const parent = cache.parents.get(parentId);
  if (!cache.profiles.has(parentId)) {
    cache.profiles.set(parentId, await productionProfileDefaultsForParentContentItem(env, parent));
  }
  const effective = await buildOutputWorkItemEffective(env, outputRow, requestRecord, parent, cache.profiles.get(parentId));
  return { outputRow, requestRecord, parent, effective };
}
/*__STUDIO_WORKER_END:studioContinuationLoadContext__*/

export async function studioContinuationStampPackage(env, po, context) {
  const { outputRow, requestRecord, parent, effective } = context;
  const sourcePackage = item4StudioSourcePackageForOutput(requestRecord, outputRow, effective, parent);
  const nativePhoto = studioOutputIsNativePhotoRoute(
    effective.platform,
    effective.output_type,
    effective.route?.proven_mapping || f(po, "Platform_Output_Type")
  );
  const seed = platformOutputSeedFields(parent, requestRecord, outputRow, effective, sourcePackage);
  const fields = {
    ...studioContinuationClearRetryFields(),
    Output_Caption: seed.Output_Caption || String(f(parent, "Caption") || "").trim() || null,
    Thumbnail_URL: studioAiThumbnailUrl(seed.Thumbnail_URL)
      || studioAiThumbnailUrl(f(po, "Thumbnail_URL"))
      || studioAiThumbnailUrl(f(parent, "Thumbnail_URL"))
      || null,
    Aspect_Ratio: seed.Aspect_Ratio || f(po, "Aspect_Ratio") || null,
    Asset_Need_Status: "Not Needed",
    Format: seed.Format || f(po, "Format") || null,
    Platform_Output_Type: seed.Platform_Output_Type || f(po, "Platform_Output_Type") || null,
    Studio_Output_Type: seed.Studio_Output_Type || f(po, "Studio_Output_Type") || null,
    Selected_Clip_1_URL: seed.Selected_Clip_1_URL,
    Selected_Clip_2_URL: seed.Selected_Clip_2_URL,
    Selected_Clip_3_URL: seed.Selected_Clip_3_URL,
    Clip_1_URL: seed.Clip_1_URL,
    Clip_2_URL: seed.Clip_2_URL,
    Clip_3_URL: seed.Clip_3_URL,
    Selected_Clip_1_Media_Asset_ID: seed.Selected_Clip_1_Media_Asset_ID,
    Selected_Clip_2_Media_Asset_ID: seed.Selected_Clip_2_Media_Asset_ID,
    Selected_Clip_3_Media_Asset_ID: seed.Selected_Clip_3_Media_Asset_ID,
    Selected_Clip_Count: seed.Selected_Clip_Count,
    Selected_Assets_JSON: seed.Selected_Assets_JSON,
    Render_Clip_List_JSON: seed.Render_Clip_List_JSON,
    Render_Total_Frames: seed.Render_Total_Frames,
    Composition_ID: seed.Composition_ID,
    Output_Filename: seed.Output_Filename,
    Clip_1_Duration_Frames: seed.Clip_1_Duration_Frames,
    Clip_2_Duration_Frames: seed.Clip_2_Duration_Frames,
    Clip_3_Duration_Frames: seed.Clip_3_Duration_Frames,
    Asset_Selection_Notes: seed.Asset_Selection_Notes,
    Preferred_Music_Media_Asset_ID: seed.Preferred_Music_Media_Asset_ID,
    Preferred_Music_URL: seed.Preferred_Music_URL,
    Music_URL: seed.Music_URL,
    Selected_Music_URL: seed.Selected_Music_URL,
    Selected_Music_Media_Asset_ID: seed.Selected_Music_Media_Asset_ID,
    Music_Volume: seed.Music_Volume,
    Voiceover_URL: item4StudioDirectiveYes(effective.voiceover_mode)
      ? (String(f(parent, "Voiceover_URL") || f(po, "Voiceover_URL") || "").trim() || null)
      : null,
  };
  if ((sourcePackage?.finished || studioIsFinishedVideoFilePassthrough(requestRecord)) && !sourcePackage?.story_teaser) {
    const overlay = studioFinishedSeedOverlay(requestRecord, sourcePackage?.clips || [], nativePhoto && (sourcePackage?.clips || []).length);
    fields.Output_Status = overlay.Output_Status || seed.Output_Status || "In Production";
    fields.Render_Status = overlay.Render_Status || seed.Render_Status || null;
    fields.Final_File_URL = overlay.Final_File_URL || seed.Final_File_URL || null;
    fields.Studio_Preview_URL = overlay.Studio_Preview_URL || seed.Studio_Preview_URL || null;
    fields.Publish_Asset_URL = overlay.Publish_Asset_URL || seed.Publish_Asset_URL || null;
    fields.Asset_Need_Status = overlay.Asset_Need_Status || "Not Needed";
    fields.Asset_Selection_Status = null;
    fields.Composition_ID = null;
    fields.Output_Filename = null;
    fields.Output_Notes = overlay.Output_Notes || seed.Output_Notes || f(po, "Output_Notes") || null;
  } else if (sourcePackage?.story_teaser) {
    const az = studioIsAzFinishedVideo(requestRecord);
    fields.Output_Status = "In Production";
    fields.Render_Status = "Ready for Render";
    fields.Asset_Selection_Status = "Selected";
    fields.Composition_ID = "ChicagoShiningPhotoSequence";
    fields.Output_Filename = sourcePackage.output_filename || seed.Output_Filename || null;
    fields.Render_Total_Frames = sourcePackage.total_frames || seed.Render_Total_Frames || Math.round(FINISHED_STORY_TEASER_SECONDS * 30);
    fields.Render_Clip_List_JSON = sourcePackage.render_clip_list_json || seed.Render_Clip_List_JSON || null;
    fields.Selected_Assets_JSON = sourcePackage.selected_assets_json || seed.Selected_Assets_JSON || null;
    fields.Timing_Status = "Skipped";
    fields.Preferred_Music_URL = null;
    fields.Music_URL = null;
    fields.Selected_Music_URL = null;
    fields.Selected_Music_Media_Asset_ID = null;
    fields.Music_Volume = 0;
    fields.Final_File_URL = null;
    fields.Final_File_ID = null;
    fields.Studio_Preview_URL = null;
    fields.Publish_Asset_URL = null;
    fields.Remotion_Job_ID = null;
    fields.Review_Status = null;
    fields.Review_Email_Sent_At = null;
    fields.Output_Notes = az
      ? `origin=az-finished-video; ez-input=finished-video. Story teaser: first ${FINISHED_STORY_TEASER_SECONDS}s of the finished file, keep original audio (keepSourceAudio). Skip P1/voiceover/library music. az-auto-queue=1.`
      : `origin=ez-wizard; ez-input=finished-video. Story teaser: first ${FINISHED_STORY_TEASER_SECONDS}s of the finished file, keep original audio (keepSourceAudio). Skip P1/voiceover/library music.`;
  } else if (nativePhoto && (sourcePackage?.clips || []).length) {
    fields.Output_Status = "Ready for Review";
    fields.Render_Status = "Native Photo Route";
    fields.Asset_Selection_Status = null;
    fields.Studio_Preview_URL = seed.Studio_Preview_URL;
    fields.Composition_ID = null;
    fields.Output_Filename = null;
  } else if (nativePhoto) {
    fields.Output_Status = "In Production";
    fields.Render_Status = null;
    fields.Asset_Selection_Status = null;
    fields.Asset_Selection_Notes = seed.Asset_Selection_Notes
      || `Missing ${String(seed.Aspect_Ratio || "plan")} crop for this output.`;
  } else if (sourcePackage?.status === "Ready") {
    fields.Output_Status = "In Production";
    fields.Render_Status = "Ready for Render";
    fields.Asset_Selection_Status = "Selected";
    fields.Composition_ID = "ChicagoShiningPhotoSequence";
    // Package rebuild: drop leftover review mail / preview so Pipeline does not
    // keep showing Ready for Review while Remotion is still running.
    fields.Review_Status = null;
    fields.Review_Email_Sent_At = null;
    fields.Studio_Preview_URL = null;
    fields.Final_File_URL = null;
    fields.Final_File_ID = null;
    fields.Remotion_Job_ID = null;
  } else {
    fields.Output_Status = "In Production";
    fields.Render_Status = null;
    fields.Asset_Selection_Status = null;
    fields.Composition_ID = null;
  }
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, po.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:studioContinuationStampPackage__*/

export async function studioContinuationInspectOutput(env, po, cache) {
  if (studioOutputIsTerminalForContinuation(po)) return { action: "stop", reason: "terminal" };
  // Finished-video Stories render a short teaser via Remotion — not full-file passthrough.
  if (studioIsFinishedVideoFilePassthrough(po) || (
    studioIsFinishedPassthrough(po) && !studioAzIsStory(studioOutputTypeLabel(po))
  )) {
    const context = await studioContinuationLoadContext(env, po, cache).catch(() => null);
    if (!context) return { action: "wait_variants", reason: "finished_context_missing" };
    const nativePhoto = studioOutputIsNativePhoto(po)
      || studioOutputIsNativePhotoRoute(
        context.effective.platform,
        context.effective.output_type,
        context.effective.route?.proven_mapping || f(po, "Platform_Output_Type")
      );
    let finalUrl = String(f(po, "Final_File_URL") || "").trim();
    if (!finalUrl && !nativePhoto) {
      await studioContinuationStampPackage(env, po, context);
      const sourcePackage = item4StudioSourcePackageForOutput(
        context.requestRecord,
        context.outputRow,
        context.effective,
        context.parent
      );
      finalUrl = String(sourcePackage?.clips?.[0]?.url || "").trim();
      if (!finalUrl) return { action: "wait_variants", reason: "finished_file_missing" };
    }
    if (!nativePhoto) {
      const publicUrl = await studioEnsureFinishedVideoPublicPreview(env, { ...context, po }, cache);
      if (publicUrl) finalUrl = publicUrl;
      if (!item4UrlIsPublicPublishCdn(finalUrl)) {
        return {
          action: "wait_thumbnail",
          reason: "finished_preview_not_public",
          contentItemId: context.parent?.id || null,
          requestRecordId: context.requestRecord?.id || null,
        };
      }
    }
    if (studioNeedsAiThumbnail(context.parent, context.requestRecord)) {
      return {
        action: "wait_thumbnail",
        reason: "missing_ai_cover",
        contentItemId: context.parent?.id || null,
      };
    }
    if (context.parent) {
      await studioStampParentAiCoverOnOutput(env, po, context.parent).catch(() => null);
    }
    const status = String(f(po, "Output_Status") || "");
    if (!/^ready for review$/i.test(status) && (finalUrl || nativePhoto)) {
      const opened = await studioContinuationOpenReadyForReview(env, po, "finished_passthrough");
      if (opened) return opened;
    }
    return { action: "reviewable", reason: "finished_passthrough" };
  }
  // If a finished-video Story still has full-file passthrough stamped, force teaser restamp.
  if (studioIsFinishedPassthrough(po) && studioAzIsStory(studioOutputTypeLabel(po))) {
    const notes = String(f(po, "Output_Notes") || "");
    const render = String(f(po, "Render_Status") || "").trim();
    const needsTeaser = !item4FinishedStoryTeaserReady(po)
      && !/^rendering$/i.test(render)
      && (
        /Finished passthrough/i.test(notes)
        || /story teaser|finished_story_teaser/i.test(notes)
        || (render === "Rendered" && !/keep original audio|keepSourceAudio|first 10s/i.test(notes))
        || !String(f(po, "Render_Clip_List_JSON") || "").trim()
      );
    if (needsTeaser) {
      const context = await studioContinuationLoadContext(env, po, cache).catch(() => null);
      if (context) {
        await studioContinuationStampPackage(env, po, context);
        return { action: "start_render", reason: "finished_story_teaser" };
      }
    }
  }
  const outputStatus = String(f(po, "Output_Status") || "");
  const renderStatus = String(f(po, "Render_Status") || "");
  const finalUrl = String(f(po, "Final_File_URL") || "").trim();

  // Native stills often land Ready for Review with Asset_Selection_Status=
  // Partial Match. The later reviewable-deliverable gate treats that as a
  // wrong video path and skips the cover stamp. Stamp first whenever the
  // parent already has a designed AI thumbnail.
  if (/^ready for review$/i.test(outputStatus)) {
    const stampContext = await studioContinuationLoadContext(env, po, cache).catch(() => null);
    if (stampContext?.parent && !studioNeedsAiThumbnail(stampContext.parent, stampContext.requestRecord)) {
      await studioStampParentAiCoverOnOutput(env, po, stampContext.parent).catch(() => null);
    }
  }

  if (finalUrl && /rendered/i.test(renderStatus)) {
    const readyContext = await studioContinuationLoadContext(env, po, cache).catch(() => null);
    if (readyContext && studioNeedsAiThumbnail(readyContext.parent, readyContext.requestRecord)) {
      return {
        action: "wait_thumbnail",
        reason: "missing_ai_cover",
        contentItemId: readyContext.parent?.id || null,
      };
    }
    if (readyContext?.parent) {
      await studioStampParentAiCoverOnOutput(env, po, readyContext.parent).catch(() => null);
    }
    if (!/^ready for review$/i.test(outputStatus)) {
      const opened = await studioContinuationOpenReadyForReview(env, po, "rendered_file");
      if (opened) return opened;
    }
    return { action: "reviewable", reason: "rendered_file" };
  }

  if (/rendering/i.test(renderStatus) && String(f(po, "Remotion_Job_ID") || "").trim()) {
    return { action: "poll_render", reason: "rendering" };
  }

  if (studioOutputHasReviewableDeliverable(po) && /^ready for review$/i.test(outputStatus) && !studioOutputWrongVideoSelectorPath(po)) {
    const readyContext = await studioContinuationLoadContext(env, po, cache).catch(() => null);
    if (readyContext && studioNeedsAiThumbnail(readyContext.parent, readyContext.requestRecord)) {
      return {
        action: "wait_thumbnail",
        reason: "missing_ai_cover",
        contentItemId: readyContext.parent?.id || null,
      };
    }
    if (readyContext?.parent) {
      await studioStampParentAiCoverOnOutput(env, po, readyContext.parent).catch(() => null);
    }
    return { action: "reviewable", reason: "deliverable" };
  }

  const context = await studioContinuationLoadContext(env, po, cache).catch((error) => {
    console.warn("Studio continuation context failed", po.id, error);
    return null;
  });
  if (!context) return { action: "skip", reason: "no_context" };

  const isStoryTeaser = String(context.effective.output_type || "").trim() === "Story";
  const wantVoiceover = item4StudioDirectiveYes(context.effective.voiceover_mode) && !isStoryTeaser;
  if (wantVoiceover) {
    const voiceoverUrl = String(f(context.parent, "Voiceover_URL") || f(po, "Voiceover_URL") || "").trim();
    if (!voiceoverUrl) {
      return {
        action: "wait_voiceover",
        reason: "missing_voiceover",
        contentItemId: context.parent?.id || null,
      };
    }
  }

  if (studioNeedsAiThumbnail(context.parent, context.requestRecord)) {
    return {
      action: "wait_thumbnail",
      reason: "missing_ai_cover",
      contentItemId: context.parent?.id || null,
    };
  }
  await studioStampParentAiCoverOnOutput(env, po, context.parent).catch(() => null);

  try {
    const filled = await item4EnsureAiSourceMasters(env, context.requestRecord, context.parent);
    if (filled?.requestRecord) {
      context.requestRecord = filled.requestRecord;
      cache.requests.set(filled.requestRecord.id, filled.requestRecord);
    }
    if (filled?.waiting > 0) {
      return {
        action: "wait_ai",
        reason: "missing_ai_masters",
        contentItemId: context.parent?.id || null,
      };
    }
  } catch (error) {
    console.warn("Studio AI master fill failed", po.id, error);
  }

  // When the last crop row flips Ready, cron drain no longer sees this PR in the
  // pending-queue scan. Reconcile here so Preparing → Ready (plan ratios) without
  // waiting for someone to open the Production workspace.
  try {
    const variantStatus = String(f(context.requestRecord, "Studio_Variant_Status") || "").trim();
    if (variantStatus === "Preparing" || variantStatus === "Error") {
      const reconciled = await item4ReconcileVariants(env, context.requestRecord.id, context.requestRecord, {
        skipSanitize: true,
      });
      if (reconciled?.record) {
        context.requestRecord = reconciled.record;
        cache.requests.set(reconciled.record.id, reconciled.record);
      }
    }
  } catch (error) {
    console.warn("Studio variant reconcile during continuation failed", po.id, error);
  }

  let sourcePackage = item4StudioSourcePackageForOutput(
    context.requestRecord,
    context.outputRow,
    context.effective,
    context.parent
  );
  const nativePhoto = studioOutputIsNativePhotoRoute(
    context.effective.platform,
    context.effective.output_type,
    context.effective.route?.proven_mapping || f(po, "Platform_Output_Type")
  );
  let hasClips = Boolean(sourcePackage?.clips?.length);
  const alreadyExact = /studio_owner_uploaded_exact_source/.test(String(f(po, "Selected_Assets_JSON") || ""))
    && String(f(po, "Asset_Selection_Status") || "") === "Selected"
    && String(f(po, "Composition_ID") || "") === "ChicagoShiningPhotoSequence";
  const readyForRender = /ready for render/i.test(renderStatus)
    && String(f(po, "Composition_ID") || "").trim()
    && String(f(po, "Render_Clip_List_JSON") || "").trim();

  if (readyForRender && hasClips && !studioOutputWrongVideoSelectorPath(po)) {
    if (studioPhotoSequenceNeedsContainHeal(po)) {
      await studioContinuationStampPackage(env, po, context);
      return { action: "prep_render", reason: "contain_stamp_heal" };
    }
    return { action: "start_render", reason: "ready_for_render" };
  }

  if (!nativePhoto && alreadyExact && !studioOutputWrongVideoSelectorPath(po) && String(f(po, "Render_Clip_List_JSON") || "").trim()) {
    return { action: "prep_render", reason: "already_stamped" };
  }

  if (nativePhoto && hasClips && studioOutputIsNativePhoto(po) && /^ready for review$/i.test(outputStatus)) {
    po = await studioRepairLeftoverNativeLettering(env, po, context).catch(() => po);
    const lettering = await item4PulseLetterPython(env, { outputRecordId: po.id }).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    await item4RefreshNativeLetteredSlides(env, po.id).catch((error) => {
      console.warn("native lettered slide refresh failed", po.id, error);
    });
    return { action: "reviewable", reason: "native_package", lettering };
  }

  if (!hasClips) {
    // A manifest snapshotted while previews were still landing can pin a Ready
    // crop that carries no preview URL, and the render package requires that URL.
    // Rebuild from the queue rows before giving up, or the output waits forever on
    // crops that already finished.
    try {
      const refreshed = await item4ReconcileVariants(env, context.requestRecord.id, context.requestRecord, {
        skipSanitize: true,
      });
      if (refreshed?.record) {
        context.requestRecord = refreshed.record;
        cache.requests.set(refreshed.record.id, refreshed.record);
      }
    } catch (error) {
      console.warn("Studio variant manifest refresh failed", po.id, error);
    }
    sourcePackage = item4StudioSourcePackageForOutput(
      context.requestRecord,
      context.outputRow,
      context.effective,
      context.parent
    );
    hasClips = Boolean(sourcePackage?.clips?.length);
    if (!hasClips) return { action: "wait_variants", reason: "incomplete_source_package" };
  }

  if (hasClips || nativePhoto || studioOutputWrongVideoSelectorPath(po) || studioOutputIsPhotoSequenceRoute(po)) {
    await studioContinuationStampPackage(env, po, context);
    if (nativePhoto && hasClips) {
      const lettering = await item4PulseLetterPython(env, { outputRecordId: po.id }).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
      await item4RefreshNativeLetteredSlides(env, po.id).catch((error) => {
        console.warn("native lettered slide refresh failed", po.id, error);
      });
      return { action: "opened_review", reason: "native_stamp", lettering };
    }
    if (!nativePhoto && hasClips) return { action: "prep_render", reason: "photo_sequence_stamp" };
    return { action: "prep_render", reason: "stamped" };
  }

  if (/^ready for review$/i.test(outputStatus) && !String(f(po, "Asset_Selection_Status") || "").trim()) {
    return { action: "asset_select", reason: "blank_selection" };
  }

  return { action: "skip", reason: "no_package" };
}
/*__STUDIO_WORKER_END:studioContinuationInspectOutput__*/

export async function listStudioContinuationCandidates(env, options = {}) {
  const contentItemId = String(options.contentItemId || "").trim();
  const requestRecordId = String(options.requestRecordId || "").trim();
  const limit = Number(options.limit || 20);
  if (contentItemId && /^rec[A-Za-z0-9]+$/.test(contentItemId)) {
    return listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: `AND(${STUDIO_CONTINUATION_CANDIDATE_FORMULA},FIND("${contentItemId}", ARRAYJOIN({Content_Item})))`,
    });
  }
  if (requestRecordId && /^rec[A-Za-z0-9]+$/.test(requestRecordId)) {
    const outputRows = await outputRowsForProductionRequest(env, requestRecordId);
    const ids = outputRows.flatMap((row) => arrayOrEmpty(f(row, "Platform_Output"))).filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id || "")));
    const records = [];
    for (const id of ids.slice(0, limit)) {
      try { records.push(await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id)); } catch {}
    }
    return records;
  }
  const newest = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: STUDIO_CONTINUATION_CANDIDATE_FORMULA,
  });
  const coverGaps = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 20,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: STUDIO_RFR_MISSING_COVER_FORMULA,
  }).catch(() => []);
  // Stories are excluded from the generic R4 queue. Recover older unclaimed
  // Stories explicitly, even when they fall outside the newest 20.
  const stalledStories = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 24,
    sortField: "Output_ID",
    sortDirection: "asc",
    filterFormula: `AND(${STUDIO_CONTINUATION_CANDIDATE_FORMULA},{Output_Status}="In Production",{Studio_Output_Type}="Story",{Remotion_Job_ID}=BLANK(),OR({Render_Status}="Ready for Render",{Render_Status}="Waiting in Render Queue"))`,
  }).catch(() => []);
  const byId = new Map();
  for (const row of [...coverGaps, ...newest, ...stalledStories]) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => {
    const left = opsQueueContinuationCandidatePriority(a, f);
    const right = opsQueueContinuationCandidatePriority(b, f);
    if (left !== right) return left - right;
    const aId = Number(f(a, "Output_ID") || 0);
    const bId = Number(f(b, "Output_ID") || 0);
    return left === 0 ? aId - bId : bId - aId;
  });
}
/*__STUDIO_WORKER_END:listStudioContinuationCandidates__*/

export async function pulseStudioContinuationJobs(env, options = {}) {
  const waitMs = Number(options.waitMs || 15000);
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const contentTable = env.AIRTABLE_CONTENT_TABLE_ID;
  const jobs = [
    { id: PHASE6_R5_SCENARIO_ID, key: "R5", table: outputTable, view: "R5 - Rendering Jobs to Poll", formula: "{Test_Run_ID}=BLANK()" },
    { id: PHASE6_R4_SCENARIO_ID, key: "T1", table: outputTable, formula: STUDIO_T1_WORK_FORMULA, skipStories: true },
    { id: PHASE6_R4_SCENARIO_ID, key: "R4", table: outputTable, formula: STUDIO_R4_WORK_FORMULA, skipStories: true },
    { id: PHASE6_R3_SCENARIO_ID, key: "R3", table: outputTable, formula: STUDIO_R3_WORK_FORMULA, skipStories: true },
    { id: 5528742, key: "P1", table: contentTable, view: "P1 - Ready for Package Generation", formula: "{Test_Run_ID}=BLANK()" },
    { id: PHASE6_R2_SCENARIO_ID, key: "R2", table: outputTable, formula: STUDIO_R2_WORK_FORMULA, skipPhotoSequence: true },
  ];
  const pulses = [];
  try {
    const leftoverNatives = await listRecords(env, outputTable, {
      limit: 8,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Render_Status}="Native Photo Route",OR({Output_Status}="Ready for Review",{Output_Status}="In Production"))',
    }).catch(() => []);
    const leftoverHits = [];
    for (const po of leftoverNatives || []) {
      if (!item4OutputHasLeftoverOverlay(po) && !studioNativeStillsNeedLettering(po)) continue;
      const captionFirst = String(f(po, "Output_Caption") || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
      const repaired = await studioRepairLeftoverNativeLettering(env, po, {
        requestRecord: { fields: {} },
        parent: { fields: {} },
        preferredCaption: captionFirst,
      }).catch(() => po);
      const lettering = await item4PulseLetterPython(env, { outputRecordId: repaired?.id || po.id }).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
      leftoverHits.push({ id: po.id, lettering });
      if (lettering && !lettering.error) {
        await item4RefreshNativeLetteredSlides(env, repaired?.id || po.id).catch((error) => {
          console.warn("native lettered slide refresh failed", po.id, error);
        });
      }
    }
    if (leftoverHits.length) {
      pulses.push({ key: "LETTER_LEFTOVER", pulsed: true, backend: "python", hits: leftoverHits.map((row) => row.id) });
    }
    const lettering = await item4PulseLetterPython(env, { maxRuns: 8 });
    pulses.push({ key: "LETTER", pulsed: true, backend: "python", lettering });
    const runs = Array.isArray(lettering?.details?.runs) ? lettering.details.runs : [];
    for (const run of runs) {
      if (run?.processed && run.output_record_id) {
        await item4RefreshNativeLetteredSlides(env, run.output_record_id).catch((error) => {
          console.warn("native lettered slide refresh failed", run.output_record_id, error);
        });
      }
    }
  } catch (error) {
    pulses.push({ key: "LETTER", error: error instanceof Error ? error.message : String(error) });
  }
  for (const job of jobs) {
    if ((options.skipKeys || []).includes(job.key)) {
      pulses.push({ key: job.key, skipped: "already_applied" });
      continue;
    }
    const rows = await listRecords(env, job.table, {
      limit: 5,
      view: job.view || null,
      filterFormula: job.formula || null,
    }).catch(() => []);
    let eligible = job.skipPhotoSequence
      ? (rows || []).filter((row) => !studioOutputIsPhotoSequenceRoute(row) && !studioOutputIsNativePhotoRoute(f(row, "Platform"), f(row, "Studio_Output_Type"), f(row, "Platform_Output_Type")))
      : (rows || []);
    if (job.skipStories) {
      eligible = eligible.filter((row) => !studioOutputIsStoryRoute(row));
    }
    if (!eligible.length) {
      pulses.push({ key: job.key, skipped: "no_work" });
      continue;
    }
    try {
      if (job.key === "R5" && pipelineStageBackend(env, "R5").mode === "python") {
        await item4PulseR5Python(env, { maxRuns: 5 });
        pulses.push({ key: job.key, pulsed: true, backend: "python", matched: eligible.length });
        continue;
      }
      if (job.key === "T1" && (pipelineStageBackend(env, "T1").mode === "python" || pipelineStageBackend(env, "R4").mode === "python")) {
        await item4PulseT1Python(env, { maxRuns: 1 });
        pulses.push({ key: job.key, pulsed: true, backend: "python", matched: eligible.length });
        continue;
      }
      if (job.key === "R4" && pipelineStageBackend(env, "R4").mode === "python") {
        await item4PulseR4Python(env);
        pulses.push({ key: job.key, pulsed: true, backend: "python", matched: eligible.length });
        continue;
      }
      if (job.key === "R3" && pipelineStageBackend(env, "R3").mode === "python") {
        await item4PulseR3Python(env, { maxRuns: 10 });
        pulses.push({ key: job.key, pulsed: true, backend: "python", matched: eligible.length });
        continue;
      }
      if (job.key === "P1" && pipelineStageBackend(env, "P1").mode === "python") {
        await item4PulseP1Python(env, { maxRuns: 1 });
        pulses.push({ key: job.key, pulsed: true, backend: "python", matched: eligible.length });
        continue;
      }
      if (job.key === "R2" && pipelineStageBackend(env, "R2").mode === "python") {
        await item4PulseR2Python(env, { maxRuns: 1 });
        pulses.push({ key: job.key, pulsed: true, backend: "python", matched: eligible.length });
        continue;
      }
      throw new HttpError(503, `${job.key} is Python-only. Set PIPELINE_RUNNER_URL and keep the runner up.`);
      if (job.key === "R3" || job.key === "R4" || job.key === "T1") break;
    } catch (error) {
      pulses.push({ key: job.key, error: error instanceof Error ? error.message : String(error) });
      break;
    }
  }
  return pulses;
}
/*__STUDIO_WORKER_END:pulseStudioContinuationJobs__*/

export async function studioContinuationMediaGate(env, po, cache) {
  if (studioOutputIsTerminalForContinuation(po)) return { action: "stop", reason: "terminal" };
  const parentId = studioFirstLinkedId(f(po, "Content_Item"));
  if (!parentId) return { action: "skip", reason: "no_parent" };
  if (!cache.parents.has(parentId)) {
    cache.parents.set(parentId, await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId));
  }
  const parent = cache.parents.get(parentId);
  const outputId = Number(f(po, "Output_ID") || 0);
  if (outputId && outputId < 227) {
    return { action: "media_ok", reason: "legacy_skip", contentItemId: parentId };
  }
  const isStory = String(f(po, "Studio_Output_Type") || "").trim() === "Story";
  const wantVoiceover = item4StudioDirectiveYes(f(parent, "Include_Voiceover")) && !isStory;
  if (wantVoiceover && !String(f(parent, "Voiceover_URL") || "").trim()) {
    return { action: "wait_voiceover", reason: "missing_voiceover", contentItemId: parentId };
  }
  const requestId = studioFirstLinkedId(f(parent, "Production_Request"))
    || studioFirstLinkedId(f(parent, "Production Requests"))
    || studioFirstLinkedId(f(parent, "Production_Requests"));
  let requestRecord = null;
  if (requestId) {
    if (!cache.requests.has(requestId)) {
      cache.requests.set(requestId, await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId).catch(() => null));
    }
    requestRecord = cache.requests.get(requestId);
  }
  if (studioNeedsAiThumbnail(parent, requestRecord)) {
    const ensured = await studioEnsurePublicAiCover(env, parent, requestRecord);
    if (ensured.url) {
      const refreshed = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId);
      cache.parents.set(parentId, refreshed);
      const stamped = await studioStampParentAiCoverOnOutput(env, po, refreshed).catch(() => false);
      if (stamped || studioAiThumbnailUrl(f(po, "Thumbnail_URL")) === ensured.url) {
        return { action: "stamped_cover", reason: "staged_public_cover", contentItemId: parentId };
      }
    }
    return { action: "wait_thumbnail", reason: "missing_ai_cover", contentItemId: parentId, requestRecordId: requestId || null };
  }
  const outputStatus = String(f(po, "Output_Status") || "");
  const native = studioOutputIsNativePhotoRoute(
    f(po, "Platform"),
    f(po, "Studio_Output_Type"),
    f(po, "Platform_Output_Type")
  );
  if (/^ready for review$/i.test(outputStatus) || native) {
    const stamped = await studioStampParentAiCoverOnOutput(env, po, parent).catch(() => false);
    if (stamped) return { action: "stamped_cover", reason: "parent_ai_cover", contentItemId: parentId };
  }
  if (requestRecord) {
    const assets = item4AssetManifest(requestRecord);
    const expected = item4EffectivePhotoCount(requestRecord, assets);
    if (expected > assets.length) {
      return { action: "wait_ai", reason: "missing_ai_masters", contentItemId: parentId, requestRecordId: requestId };
    }
  }
  return { action: "media_ok", contentItemId: parentId };
}
/*__STUDIO_WORKER_END:studioContinuationMediaGate__*/

export async function pulseStudioP2ForWaitingParents(env, parentIds, pulses) {
  for (const parentId of parentIds) {
    try {
      const parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId);
      const requestId = studioFirstLinkedId(f(parent, "Production_Request"))
        || studioFirstLinkedId(f(parent, "Production Requests"))
        || studioFirstLinkedId(f(parent, "Production_Requests"));
      const requestRecord = requestId
        ? await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId)
        : { fields: {} };
      const status = String(f(parent, "Content_Status") || "").trim();
      const rearm = ["Idea Approved", "Ready for Script"].includes(status);
      if (rearm) {
        await armStudioParentForP3Handoff(env, parentId, requestRecord);
      }
      await pulseStudioP2Handoff(env, parentId, requestRecord);
      pulses.push({ key: "P2", pulsed: true, content_item: parentId, rearmed: rearm });
      if (requestId) {
          try {
          const produced = await enqueueStudioProductionJob(env, requestId, { resume: true });
          pulses.push({ key: "STUDIO_PRODUCE", request: requestId, produced: produced || true });
        } catch (error) {
          pulses.push({ key: "STUDIO_PRODUCE", request: requestId, error: error instanceof Error ? error.message : String(error) });
        }
      }
    } catch (error) {
      pulses.push({ key: "P2", error: error instanceof Error ? error.message : String(error) });
    }
  }
}
/*__STUDIO_WORKER_END:pulseStudioP2ForWaitingParents__*/

export async function advanceStudioProductionOutputs(env, options = {}) {
  const cache = { outputRows: new Map(), requests: new Map(), parents: new Map(), profiles: new Map() };
  const pulses = [];
  const candidates = await listStudioContinuationCandidates(env, options).catch((error) => {
    console.warn("Studio continuation candidate list failed", error);
    return [];
  });
  const coverMedia = [];
  const missingCover = (candidates || []).filter((po) => {
    const status = String(f(po, "Output_Status") || "");
    if (!/^ready for review$/i.test(status)) return false;
    const thumb = String(f(po, "Thumbnail_URL") || "").trim();
    const caption = String(f(po, "Output_Caption") || "").trim();
    return !studioAiThumbnailUrl(thumb) || !caption;
  });
  const remainder = (candidates || []).filter((po) => !missingCover.some((row) => row.id === po.id));
  const prioritizedMedia = [...missingCover, ...remainder].sort((a, b) =>
    opsQueueContinuationCandidatePriority(a, f) - opsQueueContinuationCandidatePriority(b, f)
  );
  for (const po of prioritizedMedia.slice(0, 12)) {
    try {
      coverMedia.push({ id: po.id, ...await studioContinuationMediaGate(env, po, cache) });
    } catch (error) {
      coverMedia.push({ id: po.id, action: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }
  const media = coverMedia;
  const waitingVoiceover = media.some((row) => row.action === "wait_voiceover");
  const waitingThumbnail = media.some((row) => row.action === "wait_thumbnail");
  if (waitingVoiceover || waitingThumbnail) {
    const mediaParents = [...new Set(
      media.filter((row) => row.action === "wait_voiceover" || row.action === "wait_thumbnail").map((row) => row.contentItemId).filter(Boolean)
    )];
    await pulseStudioP2ForWaitingParents(env, mediaParents, pulses);
  }
  const waitingAiParents = [...new Set(
    media.filter((row) => row.action === "wait_ai").map((row) => row.contentItemId).filter(Boolean)
  )];
  if (waitingAiParents.length) {
    const parentId = waitingAiParents[0];
    try {
      const parent = cache.parents.get(parentId) || await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId);
      cache.parents.set(parentId, parent);
      const requestId = studioFirstLinkedId(f(parent, "Production_Request"))
        || studioFirstLinkedId(f(parent, "Production Requests"));
      if (requestId) {
        const requestRecord = cache.requests.get(requestId)
          || await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
        cache.requests.set(requestId, requestRecord);
        const filled = await item4EnsureAiSourceMasters(env, requestRecord, parent);
        if (filled?.requestRecord) cache.requests.set(requestId, filled.requestRecord);
        pulses.push({
          key: "AI_INGEST",
          parent: parentId,
          waiting: filled?.waiting ?? null,
        });
        if (Number(filled?.waiting || 0) > 0) {
          try { pulses.push(...await pulseOnDemandCarouselChain(env, { contentItemIds: [parentId] })); } catch (error) {
            pulses.push({ key: "C1C2", error: error instanceof Error ? error.message : String(error) });
          }
        }
      }
    } catch (error) {
      pulses.push({ key: "AI_INGEST", parent: parentId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const inspected = media.slice();
  let inspectedRemotion = 0;
  for (const po of candidates || []) {
    const gate = media.find((row) => row.id === po.id);
    const finishedNeedsStamp = studioIsFinishedPassthrough(po)
      && !studioOutputIsNativePhoto(po)
      && !String(f(po, "Final_File_URL") || "").trim();
    if (!gate) continue;
    if (gate.action !== "media_ok" && !finishedNeedsStamp) continue;
    if (inspectedRemotion >= 4) break;
    try {
      const result = await studioContinuationInspectOutput(env, po, cache);
      const idx = inspected.findIndex((row) => row.id === po.id);
      if (idx >= 0) inspected[idx] = { id: po.id, ...result };
      else inspected.push({ id: po.id, ...result });
      // Already-reviewable outputs must not consume the four-item render budget.
      if (result.action !== "reviewable" && result.action !== "stop") inspectedRemotion += 1;
      try {
        const applied = await studioContinuationApplyInspectAction(env, po, result);
        if (applied) pulses.push({ key: "INSPECT_ACTION", id: po.id, action: result.action, reason: result.reason || null });
      } catch (error) {
        pulses.push({
          key: "INSPECT_ACTION",
          id: po.id,
          action: result.action,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      const idx = inspected.findIndex((row) => row.id === po.id);
      const payload = { id: po.id, action: "error", error: error instanceof Error ? error.message : String(error) };
      if (idx >= 0) inspected[idx] = payload;
      else inspected.push(payload);
      inspectedRemotion += 1;
    }
  }
  const appliedRenderStarts = pulses.some((row) =>
    row.key === "INSPECT_ACTION"
    && (row.action === "start_render" || row.action === "prep_render")
    && !row.error
  );
  try {
    pulses.push(...await pulseStudioContinuationJobs(env, {
      ...options,
      skipKeys: appliedRenderStarts ? ["T1", "R4"] : [],
    }));
  } catch (error) {
    pulses.push({ key: "jobs", error: error instanceof Error ? error.message : String(error) });
  }
  const waitingPackage = inspected.some((row) => row.action === "wait_variants" || row.action === "blocked" || row.reason === "no_package" || row.reason === "missing_ratio_crop");
  if (waitingPackage) {
    try { pulses.push(...await pulseOnDemandMediaChain(env)); } catch (error) {
      pulses.push({ key: "SMV1", error: error instanceof Error ? error.message : String(error) });
    }
  }
  console.log("Studio continuation", JSON.stringify({
    count: inspected.length,
    inspected: inspected.map((row) => ({ id: row.id, action: row.action, reason: row.reason || row.error || null })),
    pulses,
  }));
  return { inspected, pulses };
}
/*__STUDIO_WORKER_END:advanceStudioProductionOutputs__*/

export async function pulseOnDemandRenderChain(env, options = {}) {
  const pulses = [];
  try { pulses.push(...await healStuckStudioRenders(env)); } catch (error) {
    pulses.push({ key: "STUDIO_STUCK_RENDER", error: error instanceof Error ? error.message : String(error) });
  }
  try { pulses.push(...await studioHealFailedStatuses(env, { limit: 4 })); } catch (error) {
    pulses.push({ key: "STUDIO_FAILED_STATUS", error: error instanceof Error ? error.message : String(error) });
  }
  try { pulses.push(...await studioHealIgCarouselTooManyChildren(env, { limit: 4 })); } catch (error) {
    pulses.push({ key: "STUDIO_IG_CAROUSEL_CLAMP", error: error instanceof Error ? error.message : String(error) });
  }
  try { pulses.push(...await studioHealIgCarouselChildVerificationRace(env, { limit: 4 })); } catch (error) {
    pulses.push({ key: "STUDIO_IG_AP1C_VERIFY_RACE", error: error instanceof Error ? error.message : String(error) });
  }
  try { pulses.push(...await studioHealIgCarouselChildPollFailure(env, { limit: 4 })); } catch (error) {
    pulses.push({ key: "STUDIO_IG_AP2C_CHILD_POLL", error: error instanceof Error ? error.message : String(error) });
  }
  try { pulses.push(...await studioHealIgCarouselRateLimit(env, { limit: 4 })); } catch (error) {
    pulses.push({ key: "STUDIO_IG_AP1C_RATE_LIMIT", error: error instanceof Error ? error.message : String(error) });
  }
  try { pulses.push(...await resumeStaleStudioProductionJobs(env, options)); } catch (error) {
    pulses.push({ key: "STUDIO_PRODUCE", error: error instanceof Error ? error.message : String(error) });
  }
  try { pulses.push(...await studioHealEscalatedProduce(env, { limit: 4 })); } catch (error) {
    pulses.push({ key: "STUDIO_ESCALATED", error: error instanceof Error ? error.message : String(error) });
  }
  try { pulses.push(...await resumeStalePlatformOutputs(env, options)); } catch (error) {
    pulses.push({ key: "STUDIO_OUTPUTS", error: error instanceof Error ? error.message : String(error) });
  }
  return pulses;
}
/*__STUDIO_WORKER_END:pulseOnDemandRenderChain__*/

export async function pulseOnDemandPublishChain(env) {
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const jobs = [
    { id: STUDIO_IG_ORCH_SCENARIO_ID, key: "IG", formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),OR({Publish_Status}="Ready to Schedule",{Publish_Status}="Ready to Publish",{Publish_Status}="Publishing",{IG_Story_Status}="Publishing"),OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())))' },
    { id: 5813561, key: "FB", formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),{Publish_Status}!="Published",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())))' },
    { id: 5806668, key: "TTD", formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="TikTok",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),{Publish_Status}!="Published",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())))' },
    { id: 5823581, key: "YT", formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="YouTube",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),{Publish_Status}!="Published",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())))' },
    { id: 5791537, key: "APCAR", formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),OR({Studio_Output_Type}="Carousel",{Platform_Output_Type}="Instagram Carousel"),{Output_Status}="Approved for Publishing",{IG_Carousel_Status}!="Published",OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW())))' },
  ];
  const pulses = [];
  for (const job of jobs) {
    const hasWork = await cadenceQueueHasWork(env, outputTable, { formula: job.formula });
    if (!hasWork) {
      pulses.push({ key: job.key, skipped: "no_work" });
      continue;
    }
    try {
      const orch = STUDIO_PUBLISH_ORCH_PYTHON[job.id];
      if (orch && pipelineStageBackend(env, orch.flag).mode === "python") {
        const { response, payload } = await item4PulsePipelineStage(env, orch.stage, { extra: {} }, orch.flag);
        if (!response.ok) {
          throw new HttpError(
            response.status,
            payload?.message || payload?.error || `Python ${job.key} orch failed (${response.status})`
          );
        }
        pulses.push({ key: job.key, pulsed: true, backend: "python", payload });
        continue;
      }
      await phase6PulseOnDemandScenario(env, job.id);
      pulses.push({ key: job.key, pulsed: true });
    } catch (error) {
      pulses.push({ key: job.key, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return pulses;
}
/*__STUDIO_WORKER_END:pulseOnDemandPublishChain__*/

export async function pulseOnDemandMediaChain(env) {
  const pulses = [];
  try {
    const drain = await item4DrainAllPendingWork(env, { maxMs: ITEM4_DRAIN_CRON_BUDGET_MS });
    pulses.push({
      key: "SMV1",
      drained: true,
      requests: drain.request_ids.length,
      completed: drain.drained.length,
    });
  } catch (error) {
    pulses.push({ key: "SMV1", error: error instanceof Error ? error.message : String(error) });
  }
  const jobs = [
    { id: 5893683, key: "P020-2", table: PHASE6_CAROUSEL_SLIDES_TABLE, formula: 'AND({Slide_Voiceover_Status}="Ready",{Deleted From Carousel}=0,{Slide_Voiceover_Text}!="",{Slide_Voice_ID}!="",{Studio_Voice_Prep_Request_ID}!="")' },
  ];
  for (const job of jobs) {
    const hasWork = await cadenceQueueHasWork(env, job.table, { formula: job.formula });
    if (!hasWork) {
      pulses.push({ key: job.key, skipped: "no_work" });
      continue;
    }
    try {
      if (pipelineStageBackend(env, "P0202").mode === "python") {
        const { response, payload } = await item4PulsePipelineStage(env, "p0202", { extra: {} }, "P0202");
        if (!response.ok) {
          throw new HttpError(
            response.status,
            payload?.message || payload?.error || `Python P020-2 failed (${response.status})`
          );
        }
        pulses.push({ key: job.key, pulsed: true, backend: "python", payload });
        continue;
      }
      await phase6PulseOnDemandScenario(env, job.id, { waitMs: 20000 });
      pulses.push({ key: job.key, pulsed: true });
    } catch (error) {
      pulses.push({ key: job.key, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return pulses;
}
/*__STUDIO_WORKER_END:pulseOnDemandMediaChain__*/

export async function pulseOnDemandCarouselChain(env, options = {}) {
  const parentIds = [...new Set((Array.isArray(options.contentItemIds) ? options.contentItemIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  const pulses = [];
  for (const contentItemId of parentIds) {
    try {
      const result = await pulseStudioC2Handoff(env, contentItemId);
      pulses.push({ key: "C2", parent: contentItemId, pulsed: Boolean(result?.ok), status: result?.status || null });
    } catch (error) {
      pulses.push({ key: "C2", parent: contentItemId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  // When continuation already scoped parents for AI fill, do not pulse C1.
  // C1 reseeds empty carousel slides every tick and starves C2.
  if (parentIds.length) return pulses;
  const jobs = [
    { id: 5582062, key: "C1", table: env.AIRTABLE_CONTENT_TABLE_ID, view: STUDIO_C1_VIEW_ID, formula: "{Test_Run_ID}=BLANK()" },
    { id: 5586579, key: "C2M", table: STUDIO_C2M_TABLE_ID, view: STUDIO_C2M_VIEW_ID, formula: "{Test_Run_ID}=BLANK()" },
  ];
  for (const job of jobs) {
    const hasWork = await cadenceQueueHasWork(env, job.table, { view: job.view, formula: job.formula });
    if (!hasWork) {
      pulses.push({ key: job.key, skipped: "no_work" });
      continue;
    }
    pulses.push({ key: job.key, skipped: "make_retired" });
  }
  return pulses;
}
/*__STUDIO_WORKER_END:pulseOnDemandCarouselChain__*/

export async function pulseOnDemandR2B(env) {
  const hasWork = await cadenceQueueHasWork(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    view: STUDIO_R2B_VIEW_NAME,
    formula: "{Test_Run_ID}=BLANK()",
  });
  if (!hasWork) return [{ key: "R2B", skipped: "no_work" }];
  try {
    if (pipelineStageBackend(env, "R2B").mode === "python") {
      const payload = await item4PulseR2BPython(env, { maxRuns: 10 });
      return [{ key: "R2B", pulsed: true, backend: "python", payload }];
    }
    await phase6PulseOnDemandScenario(env, STUDIO_R2B_SCENARIO_ID, { waitMs: 20000 });
    return [{ key: "R2B", pulsed: true }];
  } catch (error) {
    return [{ key: "R2B", error: error instanceof Error ? error.message : String(error) }];
  }
}
/*__STUDIO_WORKER_END:pulseOnDemandR2B__*/

export async function pulseOnDemandM1(env, { force = false } = {}) {
  if (!force) {
    const hasWork = await cadenceQueueHasWork(env, env.AIRTABLE_OUTPUT_TABLE_ID, { formula: STUDIO_M1_STALE_RENDER_FORMULA });
    if (!hasWork) return [{ key: "M1", skipped: "no_work" }];
  }
  try {
    if (pipelineStageBackend(env, "M1").mode === "python") {
      const { response, payload } = await item4PulsePipelineStage(env, "m1", { extra: { force } }, "M1");
      if (!response.ok) {
        throw new HttpError(
          response.status,
          payload?.message || payload?.error || `Python M1 failed (${response.status})`
        );
      }
      return [{ key: "M1", pulsed: true, backend: "python", payload, force }];
    }
    await phase6PulseOnDemandScenario(env, STUDIO_M1_SCENARIO_ID, { waitMs: 20000 });
    return [{ key: "M1", pulsed: true }];
  } catch (error) {
    return [{ key: "M1", error: error instanceof Error ? error.message : String(error) }];
  }
}
/*__STUDIO_WORKER_END:pulseOnDemandM1__*/

export async function pulseOnDemandMakeAdminBridge(env) {
  void env;
  return [{ key: "MAKEADMIN", skipped: "make_retired" }];
}
/*__STUDIO_WORKER_END:pulseOnDemandMakeAdminBridge__*/

export function timingSafeSecretEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (!a || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
/*__STUDIO_WORKER_END:timingSafeSecretEqual__*/

export async function r5DoneCallbackSecret(env) {
  const fromEnv = String(env.R5_CALLBACK_SECRET || "").trim();
  if (fromEnv) return fromEnv;
  const row = await studioSettingsByName(env, "STUDIO_R5_CALLBACK_SECRET").catch(() => null);
  const fromSettings = String(f(row, "Setting_Value") || "").trim();
  return fromSettings || STUDIO_R5_DONE_HOOK_TOKEN;
}
/*__STUDIO_WORKER_END:r5DoneCallbackSecret__*/

export async function handleR5DoneCallback(request, env, ctx) {
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
  const header = String(request.headers.get("Authorization") || "");
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const queryToken = String(new URL(request.url).searchParams.get("k") || "").trim();
  const presented = bearer || queryToken;
  const expected = await r5DoneCallbackSecret(env);
  if (!expected || !timingSafeSecretEqual(presented, expected)) throw new HttpError(401, "Invalid R5 callback secret");
  const body = await request.json().catch(() => ({}));
  const jobId = String(body?.jobId || "").trim().replace(/"/g, "");
  const byJob = jobId
    ? await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 1,
      filterFormula: `AND({Test_Run_ID}=BLANK(),{Remotion_Job_ID}="${jobId}")`,
    }).catch(() => [])
    : [];
  const eligible = byJob.length
    ? byJob
    : await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 1,
      view: "R5 - Rendering Jobs to Poll",
    }).catch(() => []);
  const task = (async () => {
    try {
      if (pipelineStageBackend(env, "R5").mode === "python") {
        await item4PulseR5Python(env, {
          maxRuns: 5,
          ...(eligible[0]?.id ? { outputRecordId: eligible[0].id } : {}),
        });
      } else if (eligible.length) {
        await phase6PulseOnDemandScenario(env, PHASE6_R5_SCENARIO_ID);
      }
    } catch (error) {
      console.error("R5 done callback pulse failed", error);
    }
    try { await pulseOnDemandM1(env); } catch (error) {
      console.error("M1 r5-done pulse failed", error);
    }
    try { await resumeStalePlatformOutputs(env, { staleMinutes: 1 }); } catch (error) {
      console.error("studio output r5-done watchdog failed", error);
    }
    try {
      const requestId = studioFirstLinkedId(f(eligible[0] || {}, "Production_Request"));
      if (requestId) await item4PulseStudioProduceJob(env, requestId, { resume: true });
      else await resumeStaleStudioProductionJobs(env);
    } catch (error) {
      console.error("studio produce r5-done resume failed", error);
    }
  })();
  if (ctx?.waitUntil) ctx.waitUntil(task); else await task;
  return respond(request, env, {
    ok: true,
    triggered: eligible.length ? "r5-on-demand" : "m1-check",
    eligible: eligible.length,
  }, 202);
}
/*__STUDIO_WORKER_END:handleR5DoneCallback__*/

export async function cadenceHasPublishWork(env) {
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const checks = await Promise.all([
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),OR({Publish_Status}="Ready to Schedule",{Publish_Status}="Ready to Publish",{Publish_Status}="Publishing",{IG_Story_Status}="Publishing"))' }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),{Publish_Status}!="Published")' }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="TikTok",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),{Publish_Status}!="Published")' }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="YouTube",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),{Publish_Status}!="Published")' }),
  ]);
  return checks.some(Boolean);
}
/*__STUDIO_WORKER_END:cadenceHasPublishWork__*/

export async function cadenceSetActive(env, scenarioId, active) {
  try {
    const state = await phase6ScenarioState(env, scenarioId);
    if (state?.scenario?.isinvalid === true) {
      console.error("production cadence skipped invalid scenario", scenarioId);
      return { id: scenarioId, skipped: "invalid", ok: false };
    }
    if (Boolean(state.isActive) === Boolean(active)) {
      return { id: scenarioId, active: Boolean(state.isActive), ok: true, unchanged: true };
    }
    if (active) await phase6EnsureScenarioActive(env, scenarioId);
    else await phase6SetScenarioActive(env, scenarioId, false);
    return { id: scenarioId, active, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!active && /not running|already inactive|is not activated/i.test(message)) {
      return { id: scenarioId, active: false, ok: true, already: true };
    }
    if (active && /already running/i.test(message)) {
      return { id: scenarioId, active: true, ok: true, already: true };
    }
    return { id: scenarioId, active, ok: false, error: message };
  }
}
/*__STUDIO_WORKER_END:cadenceSetActive__*/

export async function phase6RunScenario(env, scenarioId, data = null) {
  // Match the proven MAKE-ADMIN-BRIDGE contract: no-input runs send {}.
  // Make documents responsive=false as optional, so omit it unless we actually need inputs.
  const payload = {};
  if (data && typeof data === "object") payload.data = data;
  const body = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const executionId = body?.executionId || body?.response?.executionId || body?.execution?.id || null;
  if (!executionId) throw new HttpError(502, `Make did not return an executionId for scenario ${scenarioId}`);
  return { executionId, body };
}
/*__STUDIO_WORKER_END:phase6RunScenario__*/

export async function phase6StopExactScenarioExecution(env, scenarioId, executionId) {
  if (!executionId) return { attempted: false, stopped: false, reason: "missing-execution-id" };
  try {
    const body = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/executions/${executionId}/stop`, {
      method: "POST",
      body: JSON.stringify({ force: true }),
    });
    return { attempted: true, stopped: true, execution_id: executionId, body };
  } catch (error) {
    return {
      attempted: true,
      stopped: false,
      execution_id: executionId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
/*__STUDIO_WORKER_END:phase6StopExactScenarioExecution__*/

export async function phase6WaitForScenarioExecution(env, scenarioId, executionId, timeoutMs = 90000, pollMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const body = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/executions/${executionId}`, { method: "GET" });
      const details = body?.response || body?.execution || body || {};
      const status = String(details?.status || "").toUpperCase();
      if (["SUCCESS", "WARNING"].includes(status)) return { done: true, success: true, status, details };
      if (["ERROR", "FAILED"].includes(status)) return { done: true, success: false, status, details };
    } catch (error) {
      // In-progress executions often 404 on GET until Make writes the log row.
      const status = Number(error?.status || 0);
      const message = String(error?.message || error || "");
      if (status !== 404 && !/SC404|Resource not found|\(404\)/.test(message)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { done: false, success: false, status: "TIMEOUT", details: null };
}
/*__STUDIO_WORKER_END:phase6WaitForScenarioExecution__*/

export async function phase6WaitForVoicePrepCompletion(env, outputRecord, timeoutMs = 90000, pollMs = 2500) {
  const started = Date.now();
  let slides = await phase6SlidesForOutput(env, outputRecord);
  let pending = phase6PendingVoicePrepSlides(slides);
  while (pending.length && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    slides = await phase6SlidesForOutput(env, outputRecord);
    pending = phase6PendingVoicePrepSlides(slides);
  }
  return { completed: pending.length === 0, pending, slides };
}
/*__STUDIO_WORKER_END:phase6WaitForVoicePrepCompletion__*/

export async function phase6ClearVoicePrepTokens(env, slides) {
  for (const slide of Array.isArray(slides) ? slides : []) {
    if (!slide?.id || !slide?.voice_prep_request_id) continue;
    try {
      await airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, slide.id, {
        method: "PATCH",
        body: JSON.stringify({ fields: { Studio_Voice_Prep_Request_ID: null }, typecast: false }),
      });
    } catch {}
  }
}
/*__STUDIO_WORKER_END:phase6ClearVoicePrepTokens__*/

export async function phase6AdvanceVoicePrepShort(env, outputRecord) {
  let slides = await phase6SlidesForOutput(env, outputRecord);
  let pending = phase6PendingVoicePrepSlides(slides);
  if (!pending.length) {
    await phase6ClearVoicePrepTokens(env, slides);
    return {
      triggered: false,
      completed: true,
      pending_voice_slides: [],
      scenario_id: PHASE6_P0202_SCENARIO_ID,
      execution_status: "NOT_NEEDED",
      request_id: null,
    };
  }

  const python = pipelineStageBackend(env, "P0202").mode === "python";
  if (!python) {
    const scenarioState = await phase6ScenarioState(env, PHASE6_P0202_SCENARIO_ID);
    const scenarioName = String(scenarioState?.scenario?.name || "");
    if (!/v1\.8/i.test(scenarioName) || !/request scoped/i.test(scenarioName)) {
      throw new HttpError(409, `P020-2 request-scoped v1.8 is required before Studio voice prep can run. Live scenario: ${scenarioName || PHASE6_P0202_SCENARIO_ID}`);
    }
  }

  const existingToken = pending.map((x) => x.voice_prep_request_id).find(Boolean) || null;
  const requestId = existingToken || `studio-${outputRecord.id}-${Date.now()}`;
  const scopedSlideIds = [...new Set(pending.map((x) => x.id).filter(Boolean))];
  for (const slideId of scopedSlideIds) {
    await airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, slideId, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Studio_Voice_Prep_Request_ID: requestId }, typecast: false }),
    });
  }

  let started = false;
  try {
    if (python) {
      const { response, payload } = await item4PulsePipelineStage(env, "p0202", { extra: {} }, "P0202");
      if (!response.ok) {
        throw new HttpError(
          response.status,
          payload?.message || payload?.error || `Python P020-2 failed (${response.status})`
        );
      }
    } else {
      await phase6PulseOnDemandScenario(env, PHASE6_P0202_SCENARIO_ID, { waitMs: 20000 });
    }
    started = true;
  } catch (error) {
    console.error("P020-2 on-demand short pulse failed", error);
  }

  await phase6MeasureAndPersistMissingVoiceDurations(env, outputRecord);
  slides = await phase6SlidesForOutput(env, outputRecord);
  pending = phase6PendingVoicePrepSlides(slides);
  if (!pending.length) await phase6ClearVoicePrepTokens(env, slides);

  return {
    triggered: started,
    completed: pending.length === 0,
    pending_voice_slides: pending,
    scenario_id: PHASE6_P0202_SCENARIO_ID,
    execution_status: pending.length ? "IN_PROGRESS" : "SUCCESS",
    request_id: requestId,
  };
}
/*__STUDIO_WORKER_END:phase6AdvanceVoicePrepShort__*/

export async function phase6AutoVoicePrepForOutput(env, outputRecord, authorization) {
  const python = pipelineStageBackend(env, "P0202").mode === "python";
  if (!python) await phase6EnsureP0202ProductionGeneric(env, authorization);
  let slides = await phase6SlidesForOutput(env, outputRecord);
  let pending = phase6PendingVoicePrepSlides(slides);
  if (!pending.length) {
    return { triggered: false, completed: true, pending_voice_slides: [], scenario_id: PHASE6_P0202_SCENARIO_ID, execution_ids: [], execution_status: "NOT_NEEDED", request_id: null };
  }

  // Scope P020-2 to only the slides belonging to this Studio request. This prevents a
  // globally scheduled/manual P020-2 run from consuming unrelated Ready slides.
  const requestId = `studio-${outputRecord.id}-${Date.now()}`;
  const scopedSlideIds = [...new Set(pending.map((x) => x.id).filter(Boolean))];
  for (const slideId of scopedSlideIds) {
    await airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, slideId, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Studio_Voice_Prep_Request_ID: requestId }, typecast: false }),
    });
  }

  const priorState = python ? { isActive: false } : await phase6ScenarioState(env, PHASE6_P0202_SCENARIO_ID);
  const executionIds = [];
  let pythonRuns = 0;
  try {
    const maxRuns = Math.min(40, Math.max(1, scopedSlideIds.length + 5));
    let lastPendingSignature = "";
    for (let runIndex = 0; runIndex < maxRuns; runIndex += 1) {
      await phase6MeasureAndPersistMissingVoiceDurations(env, outputRecord);
      slides = await phase6SlidesForOutput(env, outputRecord);
      pending = phase6PendingVoicePrepSlides(slides);
      if (!pending.length) break;

      const signature = pending.map((x) => `${x.id}:${x.reason}`).join("|");
      if (python) {
        const { response, payload } = await item4PulsePipelineStage(env, "p0202", { extra: {} }, "P0202");
        if (!response.ok) {
          throw new HttpError(
            response.status,
            payload?.message || payload?.error || `Python P020-2 failed (${response.status})`
          );
        }
        pythonRuns += 1;
      } else {
        const run = await phase6PulseOnDemandScenario(env, PHASE6_P0202_SCENARIO_ID, { waitMs: 60000 });
        if (run?.executionId) executionIds.push(run.executionId);
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));

      await phase6MeasureAndPersistMissingVoiceDurations(env, outputRecord);
      slides = await phase6SlidesForOutput(env, outputRecord);
      pending = phase6PendingVoicePrepSlides(slides);
      if (!pending.length) break;
      const nextSignature = pending.map((x) => `${x.id}:${x.reason}`).join("|");
      if (nextSignature === signature && nextSignature === lastPendingSignature) break;
      lastPendingSignature = nextSignature;
    }
    return {
      triggered: python ? pythonRuns > 0 : executionIds.length > 0,
      activation_triggered_run: false,
      completed: pending.length === 0,
      pending_voice_slides: pending,
      scenario_id: PHASE6_P0202_SCENARIO_ID,
      execution_ids: executionIds,
      backend: python ? "python" : "make",
      execution_status: pending.length ? "INCOMPLETE" : "SUCCESS",
      timed_out: false,
      request_id: requestId,
    };
  } finally {
    // Always release the request-scoping token, even when Make/ElevenLabs fails.
    for (const slideId of scopedSlideIds) {
      try {
        await airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, slideId, {
          method: "PATCH",
          body: JSON.stringify({ fields: { Studio_Voice_Prep_Request_ID: null }, typecast: false }),
        });
      } catch {}
    }
    try { if (!python && !priorState.isActive) await phase6SetScenarioActive(env, PHASE6_P0202_SCENARIO_ID, false); } catch {}
  }
}
/*__STUDIO_WORKER_END:phase6AutoVoicePrepForOutput__*/

export function studioOutputReadyForPublishApproval(record) {
  const reviewStatus = String(f(record, "Review_Status") || "").trim();
  const outputStatus = String(f(record, "Output_Status") || "").trim();
  const publishStatus = String(f(record, "Publish_Status") || "").trim();
  if (["Approved"].includes(reviewStatus) || outputStatus === "Approved for Publishing") return false;
  if (["Published", "Publishing"].includes(publishStatus)) return false;
  if (Boolean(f(record, "Do_Not_Publish"))) return false;
  if (outputStatus === "In Production" || ["Ready for Render", "Rendering"].includes(String(f(record, "Render_Status") || "").trim())) return false;
  const rendered = String(f(record, "Render_Status") || "").trim() === "Rendered" && Boolean(String(f(record, "Final_File_URL") || "").trim());
  const finished = studioIsFinishedPassthrough(record);
  if (finished && studioFinishedOriginKind(record) === "finished-video") {
    return Boolean(String(f(record, "Final_File_URL") || "").trim())
      && (outputStatus === "Ready for Review" || reviewStatus === "Review Sent");
  }
  if (!rendered && !studioOutputIsNativePhoto(record) && !finished) return false;
  return outputStatus === "Ready for Review" || reviewStatus === "Review Sent";
}
/*__STUDIO_WORKER_END:studioOutputReadyForPublishApproval__*/

export async function studioPipelineSettingsProfileRecord(env, contextRecord) {
  if (!contextRecord) return null;
  if (
    String(f(contextRecord, "Profile_Name") || "").trim()
      && /^rec[A-Za-z0-9]+$/.test(String(contextRecord.id || ""))
  ) {
    return contextRecord;
  }
  const profileId = await studioContentProfileRecordIdForOutput(env, contextRecord).catch(() => null);
  if (profileId) {
    return airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId).catch(() => null);
  }
  // Synthetic contexts (for example Engagement) carry a city/theme rather than
  // a Content Profile record id. Resolve them back to the actual active profile
  // so they use the same profile-scoped destinations as publishing.
  const theme = studioThemeForProfile(contextRecord);
  if (!theme) return null;
  const profiles = await listContentProfileRecords(env).catch(() => []);
  return profiles.find((record) => Boolean(f(record, "Active")) && studioThemeForProfile(record) === theme) || null;
}
/*__STUDIO_WORKER_END:studioPipelineSettingsProfileRecord__*/

export function studioLegacyDestinationPrefix(theme) {
  if (theme === "la") return "LA_";
  if (theme === "nyc") return "NYC_";
  if (theme === "miami") return "MIAMI_";
  return "";
}
/*__STUDIO_WORKER_END:studioLegacyDestinationPrefix__*/

export function studioProfileDestinationFieldValue(profile, settingName) {
  if (!profile) return "";
  const fields = {
    FACEBOOK_PAGE_ID: "Facebook_Page_ID",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "Instagram_Business_Account_ID",
    YOUTUBE_CHANNEL_ID: "YouTube_Channel_ID",
  };
  const field = fields[settingName];
  return field ? String(f(profile, field) || "").trim() : "";
}
/*__STUDIO_WORKER_END:studioProfileDestinationFieldValue__*/

export async function studioActivePipelineSettings(env, names, contextRecord) {
  const wanted = [...new Set((names || []).map((name) => String(name || "").trim()).filter(Boolean))];
  if (!wanted.length) return {};
  const profile = await studioPipelineSettingsProfileRecord(env, contextRecord);
  const theme = profile
    ? studioThemeForProfile(profile)
    : (contextRecord ? await studioThemeForPublishRecord(env, contextRecord) : "chicago");
  const prefix = studioLegacyDestinationPrefix(theme) || studioSettingsPrefixForTheme(theme);
  const fetchNames = [...wanted];
  if (prefix) {
    for (const name of wanted) fetchNames.push(`${prefix}${name}`);
  }
  if (profile?.id) {
    for (const name of wanted) fetchNames.push(profileDestinationSettingName(profile.id, name));
  }
  const uniqueFetch = [...new Set(fetchNames)];
  const formula = `AND({Active}=1,OR(${uniqueFetch.map((name) => `{Setting_Name}='${name.replace(/'/g, "\\'")}'`).join(",")}))`;
  const rows = await listRecords(env, "Pipeline Settings", { limit: Math.max(40, uniqueFetch.length + 10), filterFormula: formula });
  const map = {};
  for (const row of rows) {
    const name = String(f(row, "Setting_Name") || "").trim();
    if (name) map[name] = String(f(row, "Setting_Value") || "").trim();
  }
  const resolved = {};
  for (const name of wanted) {
    const scoped = profile?.id ? map[profileDestinationSettingName(profile.id, name)] || "" : "";
    const profileField = studioProfileDestinationFieldValue(profile, name);
    if (STUDIO_CITY_DESTINATION_KEYS.has(name)) {
      if (scoped) {
        resolved[name] = scoped;
      } else if (profileField) {
        resolved[name] = profileField;
      } else if (prefix) {
        resolved[name] = map[`${prefix}${name}`] || "";
      } else if (profile && theme !== "chicago") {
        // Never let a newly added city silently inherit Chicago destinations.
        resolved[name] = "";
      } else {
        resolved[name] = map[name] || "";
      }
    } else {
      resolved[name] = scoped || (prefix && map[`${prefix}${name}`]) || map[name] || "";
    }
  }
  return resolved;
}
/*__STUDIO_WORKER_END:studioActivePipelineSettings__*/

export async function studioPulseMakeWebhook(env, url, recordId, target, extra = {}) {
  void env;
  void url;
  void extra;
  console.warn("Make webhook retired; use the pipeline runner", target, recordId);
  return { ok: false, skipped: "make-retired", target };
}
/*__STUDIO_WORKER_END:studioPulseMakeWebhook__*/

export function studioFacebookPublicMakeWebhookUrl(env) {
  return String(env?.FB_PUBLIC_MAKE_WEBHOOK_URL || STUDIO_FB_PUBLIC_WEBHOOK_URL || "").trim();
}
/*__STUDIO_WORKER_END:studioFacebookPublicMakeWebhookUrl__*/

export function studioFacebookPublicCdnUrl(record) {
  const preview = String(f(record, "Studio_Preview_URL") || "").trim();
  const staged = String(f(record, "FB_Slideshow_Public_URL") || "").trim();
  const publish = String(f(record, "Publish_Asset_URL") || "").trim();
  if (staged.startsWith("https://media.chicagoshining.com/")) return staged;
  if (publish.startsWith("https://media.chicagoshining.com/")) return publish;
  if (preview.startsWith("https://media.chicagoshining.com/")) return preview;
  return "";
}
/*__STUDIO_WORKER_END:studioFacebookPublicCdnUrl__*/

export function studioFacebookVideoId(record) {
  const meta = String(f(record, "FB_Slideshow_Meta_Video_ID") || "").trim();
  if (/^\d{6,}$/.test(meta)) return meta;
  const post = String(f(record, "Platform_Post_ID") || "").trim();
  if (/^\d{6,}$/.test(post)) return post;
  const tail = post.split("_").pop() || "";
  return /^\d{6,}$/.test(tail) ? tail : "";
}
/*__STUDIO_WORKER_END:studioFacebookVideoId__*/

export function studioFacebookVideoSurface(record) {
  const mapping = String(f(record, "Platform_Output_Type") || "").trim();
  const outputType = String(f(record, "Studio_Output_Type") || "").trim();
  return mapping === "Facebook Reel"
    || mapping === "Facebook Story"
    || outputType === "Slideshow Reel"
    || outputType === "Story";
}
/*__STUDIO_WORKER_END:studioFacebookVideoSurface__*/

export function studioFacebookNativeCoverRequired(record) {
  const mapping = String(f(record, "Platform_Output_Type") || "").trim();
  const outputType = String(f(record, "Studio_Output_Type") || "").trim();
  if (mapping === "Facebook Story" || outputType === "Story") return false;
  return mapping === "Facebook Reel" || outputType === "Slideshow Reel";
}
/*__STUDIO_WORKER_END:studioFacebookNativeCoverRequired__*/

export function studioFacebookNativeCoverUrl(record) {
  const thumb = studioAiThumbnailUrl(f(record, "Thumbnail_URL"));
  const staged = studioClipPublicCdnUrl(thumb) || (item4UrlIsPublicPublishCdn(thumb) ? thumb : "");
  if (staged) return staged;
  const cover = studioPublicJpegCoverUrl(record);
  return item4UrlIsPublicPublishCdn(cover) ? cover : "";
}
/*__STUDIO_WORKER_END:studioFacebookNativeCoverUrl__*/

export function studioFacebookCoverAlreadyAttached(record) {
  const blob = [
    f(record, "Studio_Publish_Dispatch_Note"),
    f(record, "FB_Slideshow_Response_JSON"),
    f(record, "Platform_Publish_Response_JSON"),
  ].map((value) => String(value || "")).join("\n");
  return blob.includes(STUDIO_FB_COVER_ATTACHED_MARK);
}
/*__STUDIO_WORKER_END:studioFacebookCoverAlreadyAttached__*/

export async function studioAttachFacebookNativeCover(env, record) {
  if (String(f(record, "Platform") || "").trim() !== "Facebook") {
    return { ok: true, skipped: "not-facebook" };
  }
  if (!studioFacebookNativeCoverRequired(record)) return { ok: true, skipped: "not-facebook-reel" };
  if (Boolean(f(record, "Do_Not_Publish"))) return { ok: true, skipped: "do-not-publish" };
  if (studioFacebookCoverAlreadyAttached(record)) return { ok: true, skipped: "already-attached" };
  const videoId = studioFacebookVideoId(record);
  if (!videoId) return { ok: true, skipped: "missing-video-id" };
  const coverUrl = studioFacebookNativeCoverUrl(record);
  if (!coverUrl) return { ok: false, skipped: "missing-public-cover" };
  const settings = await studioActivePipelineSettings(env, [
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_GRAPH_API_VERSION",
  ], record);
  const token = String(settings.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
  const version = String(settings.FACEBOOK_GRAPH_API_VERSION || "v25.0").replace(/^\/+|\/+$/g, "");
  if (!token) return { ok: false, skipped: "missing-facebook-settings" };
  const endpoint = `https://graph.facebook.com/${version}/${videoId}/thumbnails`;
  const image = await fetch(coverUrl);
  if (!image.ok) {
    return { ok: false, video_id: videoId, cover_url: coverUrl, status: image.status, message: `cover download ${image.status}` };
  }
  const bytes = await image.arrayBuffer();
  const rawType = String(image.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const isPng = rawType.includes("png") || /\.png(\?|$)/i.test(coverUrl);
  const mime = isPng ? "image/png" : "image/jpeg";
  const form = new FormData();
  form.append("source", new Blob([bytes], { type: mime }), isPng ? "cover.png" : "cover.jpg");
  const response = await fetch(`${endpoint}?${new URLSearchParams({ is_preferred: "true" }).toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  const last = { status: response.status, payload };
  if (response.ok && !payload?.error) {
      const published = /published/i.test(String(f(record, "Publish_Status") || "")) || Boolean(f(record, "Published_At"));
      const postId = String(f(record, "Platform_Post_ID") || videoId || "").trim();
      const storedPostUrl = String(f(record, "Platform_Post_URL") || "").trim();
      const postUrl = storedPostUrl || (postId ? `https://www.facebook.com/reel/${encodeURIComponent(postId)}/` : "");
      const note = [String(f(record, "Studio_Publish_Dispatch_Note") || "").trim(), STUDIO_FB_COVER_ATTACHED_MARK]
        .filter(Boolean)
        .join("\n")
        .slice(0, 900);
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
        method: "PATCH",
        body: JSON.stringify({
          typecast: true,
          fields: {
            Studio_Publish_Dispatch_Note: note,
            FB_Slideshow_Response_JSON: JSON.stringify({
              facebook_cover: STUDIO_FB_COVER_ATTACHED_MARK,
              video_id: videoId,
              cover_url: coverUrl,
              graph: payload,
            }).slice(0, 90000),
            Publish_Error_Stage: "",
            Publish_Error_Message: "",
            // The cover-heal path may be the first code path to confirm the Reel is live.
            // Always retain enough Facebook identity for Studio's generic Open post link.
            ...(postId ? { Platform_Post_ID: postId } : {}),
            ...(postUrl ? { Platform_Post_URL: postUrl } : {}),
            // Stale FBS2 staging errors must not keep painting Failed after a live Reel exists.
            FB_Slideshow_Error_Message: "",
            Publish_Asset_Error_Message: "",
            ...(published ? {} : {
              Publish_Status: "Published",
              Published_At: new Date().toISOString(),
              FB_Publish_Status: "Published",
              FB_Slideshow_Status: "Published",
            }),
          },
        }),
      });
    return { ok: true, attached: true, video_id: videoId, cover_url: coverUrl, post_url: postUrl || null, status: response.status };
  }
  const message = last.payload?.error?.message || `thumbnail attach ${last.status}`;
  if (!/published/i.test(String(f(record, "Publish_Status") || "")) && !f(record, "Published_At")) {
    await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
      method: "PATCH",
      body: JSON.stringify({
        typecast: true,
        fields: {
          Publish_Status: "Publishing",
          Publish_Error_Stage: "FB_COVER",
          Publish_Error_Message: String(message).slice(0, 900),
        },
      }),
    });
  }
  return { ok: false, video_id: videoId, cover_url: coverUrl, status: last.status, message };
}
/*__STUDIO_WORKER_END:studioAttachFacebookNativeCover__*/

export function studioFacebookPublicMakeRoutable(record) {
  const plan = studioPublishDispatchTarget(record);
  return Boolean(plan && (plan.target === "FB0" || plan.target === "FBS3" || plan.graphStory));
}
/*__STUDIO_WORKER_END:studioFacebookPublicMakeRoutable__*/

export function studioFacebookPublicMakeEligible(record) {
  const plan = studioPublishDispatchTarget(record);
  if (!plan) return false;
  if (plan.target === "FB0") return true;
  if (plan.target === "FBS3" || plan.graphStory) return Boolean(studioFacebookPublicCdnUrl(record));
  return false;
}
/*__STUDIO_WORKER_END:studioFacebookPublicMakeEligible__*/

export async function studioPulseFacebookPublicMake(env, record) {
  const recordId = String(record?.id || "").trim();
  const target = "FB-PUBLIC";
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target };
  const url = studioFacebookPublicMakeWebhookUrl(env);
  if (!url) return { ok: false, skipped: "no-webhook", target };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/plain,application/json" },
    body: JSON.stringify({ output_record_id: recordId }),
  });
  const body = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      target,
      backend: "make",
      status: response.status,
      message: body.slice(0, 400) || `FB-PUBLIC webhook returned HTTP ${response.status}`,
    };
  }
  return {
    ok: true,
    accepted: /accepted/i.test(body) || response.status < 300,
    target,
    backend: "make",
    status: response.status,
    plan: { target },
  };
}
/*__STUDIO_WORKER_END:studioPulseFacebookPublicMake__*/

export function studioPublishDispatchTarget(record) {
  const platform = String(f(record, "Platform") || "").trim();
  const outputType = String(f(record, "Studio_Output_Type") || "").trim();
  const mapping = String(f(record, "Platform_Output_Type") || "").trim();
  const published = /published/i.test(String(f(record, "Publish_Status") || "")) || Boolean(f(record, "Published_At"));
  if (published || Boolean(f(record, "Do_Not_Publish"))) return null;
  if (platform === "Instagram" && (outputType === "Carousel" || mapping === "Instagram Carousel")) {
    return { setting: "AP0C_WEBHOOK_URL", target: "AP0C" };
  }
  if (platform === "Instagram" && (outputType === "Story" || mapping === "Instagram Story")) {
    return { setting: "AP1_IGS_WEBHOOK_URL", poll: "AP1_IGS_POLL_WEBHOOK_URL", target: "AP1-IGS" };
  }
  if (platform === "Instagram" && (outputType === "Single Image" || mapping === "Instagram Feed Post") && outputType !== "Carousel" && mapping !== "Instagram Carousel") {
    return { graphFeedPhoto: true, target: "IG-FEED-GRAPH" };
  }
  if (platform === "Instagram" && (outputType === "Reel" || mapping === "Instagram Reel") && outputType !== "Carousel") {
    return { setting: "AP1_IG_WEBHOOK_URL", target: "AP1-IG" };
  }
  if (platform === "Facebook" && (outputType === "Story" || mapping === "Facebook Story")) {
    return { graphStory: true, target: "FB-STORY-GRAPH" };
  }
  if (platform === "Facebook" && (
    outputType === "Single Image"
    || outputType === "Multi-Image Post"
    || mapping === "Facebook Post"
    || mapping === "Facebook Photo Set"
  ) && outputType !== "Slideshow Reel" && mapping !== "Facebook Reel") {
    return { setting: "FB0_WEBHOOK_URL", target: "FB0" };
  }
  if (platform === "Facebook" && (outputType === "Slideshow Reel" || mapping === "Facebook Reel") && outputType !== "Multi-Image Post") {
    return { setting: "FBS3_WEBHOOK_URL", poll: "FBS4_WEBHOOK_URL", target: "FBS3" };
  }
  if (platform === "TikTok") {
    return { setting: "TTD0_WEBHOOK_URL", target: "TTD0" };
  }
  if (platform === "YouTube") {
    return { setting: "YT0_WEBHOOK_URL", target: "YT0" };
  }
  return null;
}
/*__STUDIO_WORKER_END:studioPublishDispatchTarget__*/

export function studioGraphCaption(record) {
  const caption = String(f(record, "Output_Caption") || "").trim();
  const hashtags = String(f(record, "Output_Hashtags") || "").trim();
  if (!hashtags || caption.includes(hashtags)) return caption;
  return `${caption}\n\n${hashtags}`.trim();
}
/*__STUDIO_WORKER_END:studioGraphCaption__*/

export async function studioFetchImageBytes(source) {
  const url = String(source || "").trim();
  if (!url) return null;
  const fileId = extractGoogleDriveFileId(url);
  const candidates = [];
  if (url.startsWith("https://media.chicagoshining.com/")) candidates.push(url);
  if (fileId) candidates.push(googleDriveDownloadUrl(fileId));
  if (/^https?:\/\//i.test(url) && !candidates.includes(url)) candidates.push(url);
  for (const href of candidates) {
    try {
      const response = await fetch(href, {
        redirect: "follow",
        headers: {
          Accept: "image/jpeg,image/png,image/webp,image/*;q=0.9,*/*;q=0.4",
          "User-Agent": "chicagoshining-studio-api/publish-dispatch",
        },
      });
      const type = String(response.headers.get("Content-Type") || "").toLowerCase();
      if (!response.ok || type.includes("text/html")) {
        try { await response.body?.cancel(); } catch {}
        continue;
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 1000 && buffer.byteLength <= 12 * 1024 * 1024) return buffer;
    } catch (error) {
      console.warn("image fetch failed", href.slice(0, 120), error);
    }
  }
  return null;
}
/*__STUDIO_WORKER_END:studioFetchImageBytes__*/

export async function studioPublicJpegIsReachable(url) {
  const href = String(url || "").trim();
  if (!href.startsWith("https://media.chicagoshining.com/")) return false;
  try {
    const response = await fetch(href, {
      method: "GET",
      headers: { Range: "bytes=0-15", "User-Agent": "chicagoshining-studio-api/publish-dispatch" },
    });
    const type = String(response.headers.get("Content-Type") || "").toLowerCase();
    try { await response.body?.cancel(); } catch {}
    return response.ok && type.startsWith("image/");
  } catch {
    return false;
  }
}
/*__STUDIO_WORKER_END:studioPublicJpegIsReachable__*/

export function studioImageContentType(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57) return "image/webp";
  return "image/jpeg";
}
/*__STUDIO_WORKER_END:studioImageContentType__*/

export async function studioR2UploadWorkerConfig(env) {
  const settings = await studioActivePipelineSettings(env, [
    "R2_UPLOAD_WORKER_URL",
    "R2_UPLOAD_WORKER_SECRET",
  ]);
  const secret = String(settings.R2_UPLOAD_WORKER_SECRET || "").trim();
  const endpoints = [...new Set([
    String(settings.R2_UPLOAD_WORKER_URL || "").trim().replace(/\/+$/, ""),
    R2_UPLOAD_WORKER_PUBLIC,
  ].filter(Boolean))];
  return { secret, endpoints };
}
/*__STUDIO_WORKER_END:studioR2UploadWorkerConfig__*/

export function studioR2UploadWorkerHeaders(secret, input = {}, extra = {}) {
  const headers = {
    "x-pipeline-secret": secret,
    "x-output-id": String(input.outputId || ""),
    "x-final-file-id": String(input.finalFileId || ""),
    "x-retain-class": String(input.retainClass || "preview"),
    "User-Agent": STUDIO_UPLOAD_WORKER_UA,
    ...extra,
  };
  return headers;
}
/*__STUDIO_WORKER_END:studioR2UploadWorkerHeaders__*/

export async function studioPutPublicObjectViaUploadWorker(env, input) {
  const key = String(input?.key || "").trim().replace(/^\/+/, "");
  const body = input?.body;
  if (!key || body == null) return { url: "", skip: "missing-body" };
  const { secret, endpoints } = await studioR2UploadWorkerConfig(env);
  if (!secret) return { url: "", skip: "missing-upload-secret" };
  const contentType = String(input.contentType || "application/octet-stream");
  const headers = studioR2UploadWorkerHeaders(secret, input, { "Content-Type": contentType });
  const length = Number(input.contentLength || input.body?.byteLength || 0);
  if (Number.isFinite(length) && length > 0) headers["Content-Length"] = String(length);
  let lastStatus = 0;
  for (const workerUrl of endpoints) {
    try {
      const response = await fetch(`${workerUrl}?key=${encodeURIComponent(key)}`, {
        method: "PUT",
        headers,
        body: body instanceof ArrayBuffer ? new Uint8Array(body) : body,
      });
      lastStatus = response.status;
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        console.warn("public object upload worker failed", key, response.status);
        continue;
      }
      return { url: String(payload.public_url || `${ITEM4_MEDIA_PUBLIC_BASE}/${key}`).trim(), skip: "" };
    } catch (error) {
      console.warn("public object upload worker threw", key, error);
    }
  }
  return { url: "", skip: lastStatus ? `upload-http-${lastStatus}` : "upload-worker-failed" };
}
/*__STUDIO_WORKER_END:studioPutPublicObjectViaUploadWorker__*/

export async function studioPutPublicObjectMultipartFromDrive(env, input) {
  const key = String(input?.key || "").trim().replace(/^\/+/, "");
  const driveId = String(input?.driveId || "").trim();
  const token = String(input?.token || "").trim();
  const size = Number(input?.size || 0);
  if (!key || !driveId || !token) return { url: "", skip: "missing-multipart-source" };
  if (!Number.isFinite(size) || size <= 0 || size > 250 * 1024 * 1024) {
    return { url: "", skip: "multipart-size-unsupported" };
  }
  const ranges = mpuPartRanges(size);
  if (!ranges.length) return { url: "", skip: "multipart-no-ranges" };
  const { secret, endpoints } = await studioR2UploadWorkerConfig(env);
  if (!secret) return { url: "", skip: "missing-upload-secret" };
  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media&supportsAllDrives=true`;
  let lastSkip = "upload-worker-failed";
  for (const workerUrl of endpoints) {
    let uploadId = "";
    try {
      const created = await fetch(`${workerUrl}?key=${encodeURIComponent(key)}&action=mpu-create`, {
        method: "POST",
        headers: studioR2UploadWorkerHeaders(secret, input, { "Content-Type": "video/mp4" }),
      });
      const createdPayload = await created.json().catch(() => ({}));
      uploadId = String(createdPayload.uploadId || "").trim();
      if (!created.ok || createdPayload.ok === false || !uploadId) {
        lastSkip = `mpu-create-${created.status || "failed"}`;
        continue;
      }
      const parts = [];
      let partFailed = false;
      for (const range of ranges) {
        const chunk = await fetch(mediaUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Range: `bytes=${range.start}-${range.end}`,
          },
          redirect: "follow",
        });
        const got = Number(chunk.headers.get("Content-Length") || 0);
        if (!(chunk.status === 206 || chunk.status === 200) || !chunk.body || (got > 0 && got > range.length)) {
          try { await chunk.body?.cancel(); } catch {}
          lastSkip = `drive-range-${chunk.status || "failed"}`;
          partFailed = true;
          break;
        }
        const uploaded = await fetch(
          `${workerUrl}?key=${encodeURIComponent(key)}&action=mpu-part&uploadId=${encodeURIComponent(uploadId)}&partNumber=${range.partNumber}`,
          {
            method: "PUT",
            headers: studioR2UploadWorkerHeaders(secret, input, {
              "Content-Type": "application/octet-stream",
              "Content-Length": String(range.length),
            }),
            body: chunk.body,
          }
        );
        const partPayload = await uploaded.json().catch(() => ({}));
        const etag = String(partPayload.etag || "").trim();
        if (!uploaded.ok || partPayload.ok === false || !etag) {
          lastSkip = `mpu-part-${uploaded.status || "failed"}`;
          partFailed = true;
          break;
        }
        parts.push({ partNumber: range.partNumber, etag });
      }
      if (partFailed || parts.length !== ranges.length) {
        await fetch(
          `${workerUrl}?key=${encodeURIComponent(key)}&action=mpu-abort&uploadId=${encodeURIComponent(uploadId)}`,
          { method: "POST", headers: studioR2UploadWorkerHeaders(secret, input) }
        ).catch(() => null);
        continue;
      }
      const completed = await fetch(
        `${workerUrl}?key=${encodeURIComponent(key)}&action=mpu-complete&uploadId=${encodeURIComponent(uploadId)}`,
        {
          method: "POST",
          headers: studioR2UploadWorkerHeaders(secret, input, { "Content-Type": "application/json" }),
          body: JSON.stringify({ parts }),
        }
      );
      const done = await completed.json().catch(() => ({}));
      if (!completed.ok || done.ok === false) {
        lastSkip = `mpu-complete-${completed.status || "failed"}`;
        continue;
      }
      return { url: String(done.public_url || `${ITEM4_MEDIA_PUBLIC_BASE}/${key}`).trim(), skip: "" };
    } catch (error) {
      console.warn("public object multipart upload threw", key, error);
      lastSkip = "mpu-threw";
      if (uploadId) {
        await fetch(
          `${workerUrl}?key=${encodeURIComponent(key)}&action=mpu-abort&uploadId=${encodeURIComponent(uploadId)}`,
          { method: "POST", headers: studioR2UploadWorkerHeaders(secret, input) }
        ).catch(() => null);
      }
    }
  }
  return { url: "", skip: lastSkip };
}
/*__STUDIO_WORKER_END:studioPutPublicObjectMultipartFromDrive__*/

export async function studioPublicVideoIsReachable(url) {
  const href = String(url || "").trim();
  if (!item4UrlIsPublicPublishCdn(href)) return false;
  try {
    const response = await fetch(href, {
      method: "GET",
      headers: { Range: "bytes=0-15", "User-Agent": "chicagoshining-studio-api/finished-preview" },
    });
    const type = String(response.headers.get("Content-Type") || "").toLowerCase();
    try { await response.body?.cancel(); } catch {}
    return (response.ok || response.status === 206) && !type.includes("text/html") && !type.startsWith("image/");
  } catch {
    return false;
  }
}
/*__STUDIO_WORKER_END:studioPublicVideoIsReachable__*/

export async function studioEnsureFinishedVideoPublicPreview(env, context, cache) {
  const requestRecord = context?.requestRecord;
  if (!requestRecord?.id) return "";
  const masters = item4AssetManifest(requestRecord);
  const video = masters.find((asset) => item4LooksLikeVideoAsset(asset)) || masters[0];
  if (!video) return "";
  const existing = item4FinishedMasterPlayUrl(video, requestRecord);
  if (existing && await studioPublicVideoIsReachable(existing)) {
    if (context.po?.id && String(f(context.po, "Final_File_URL") || "").trim() !== existing) {
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, context.po.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Final_File_URL: existing,
            Studio_Preview_URL: existing,
            Publish_Asset_URL: existing,
          },
          typecast: true,
        }),
      }).catch(() => null);
    }
    return existing;
  }
  const previewKey = String(video.preview_r2_key || "").trim() || item4FinishedVideoPreviewKey(requestRecord.id, video.id);
  const masterKey = String(video.r2_key || "").trim();
  if (!masterKey || !env.STUDIO_MEDIA) return "";
  const object = await env.STUDIO_MEDIA.get(masterKey);
  if (!object) return "";
  const staged = await studioPutPublicObjectViaUploadWorker(env, {
    key: previewKey,
    body: object.body,
    contentType: object.httpMetadata?.contentType || video.mime_type || "video/mp4",
    contentLength: object.size || Number(video.size_bytes || 0),
    outputId: requestRecord.id,
  });
  if (!staged.url) return "";
  const nextMasters = masters.map((asset) => String(asset?.id) === String(video.id)
    ? { ...asset, preview_r2_key: previewKey, preview_public_url: staged.url, url: staged.url }
    : asset);
  const updatedRequest = await item4UpdateRequestState(env, requestRecord.id, {
    Studio_Master_Assets_JSON: JSON.stringify(nextMasters),
  }).catch(() => null);
  if (updatedRequest && cache?.requests) cache.requests.set(requestRecord.id, updatedRequest);
  if (context.requestRecord) {
    context.requestRecord = updatedRequest || context.requestRecord;
  }
  if (context.po?.id) {
    await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, context.po.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Final_File_URL: staged.url,
          Studio_Preview_URL: staged.url,
          Publish_Asset_URL: staged.url,
        },
        typecast: true,
      }),
    }).catch(() => null);
  }
  return staged.url;
}
/*__STUDIO_WORKER_END:studioEnsureFinishedVideoPublicPreview__*/

export async function studioPutPublicJpegViaUploadWorker(env, record, buffer) {
  const contentType = studioImageContentType(buffer);
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const key = `studio/previews/platform-output/${record.id}/cover.${ext}`;
  return studioPutPublicObjectViaUploadWorker(env, {
    key,
    body: buffer,
    contentType,
    contentLength: buffer.byteLength,
    outputId: record.id,
  });
}
/*__STUDIO_WORKER_END:studioPutPublicJpegViaUploadWorker__*/

export async function studioEnsurePublicJpegForPublish(env, record) {
  const existing = studioClipPublicCdnUrl(f(record, "Publish_Asset_URL"))
    || studioPublicJpegCoverUrl(record)
    || studioClipPublicCdnUrl(f(record, "Studio_Preview_URL"));
  if (existing && await studioPublicJpegIsReachable(existing)) return { record, url: existing };
  const thumbnail = String(f(record, "Thumbnail_URL") || "").trim();
  const source = /^https:\/\/(drive\.google\.com|drive\.usercontent\.google\.com)\//i.test(thumbnail)
    ? thumbnail
    : String(thumbnail || f(record, "Studio_Preview_URL") || f(record, "Publish_Asset_URL") || "").trim();
  const buffer = await studioFetchImageBytes(source);
  if (!buffer) return { record, url: "", skip: "missing-source-bytes" };
  let uploaded = await studioPutPublicJpegViaUploadWorker(env, record, buffer);
  if (!uploaded.url && env.STUDIO_MEDIA) {
    const contentType = studioImageContentType(buffer);
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const key = `studio/previews/platform-output/${record.id}/cover.${ext}`;
    try {
      await env.STUDIO_MEDIA.put(key, buffer, {
        httpMetadata: { contentType, cacheControl: "public, max-age=300" },
        customMetadata: { platformOutputId: String(record.id), purpose: "ig-feed-photo" },
      });
      uploaded = { url: `${ITEM4_MEDIA_PUBLIC_BASE}/${key}`, skip: "" };
      if (!(await studioPublicJpegIsReachable(uploaded.url))) {
        uploaded = { url: "", skip: "studio-media-not-public" };
      }
    } catch (error) {
      console.warn("studio media public jpeg put failed", record.id, error);
    }
  }
  if (!uploaded.url) return { record, url: "", skip: uploaded.skip || "upload-worker-failed" };
  const updated = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
    method: "PATCH",
    body: JSON.stringify({
      typecast: true,
      fields: {
        Publish_Asset_URL: uploaded.url,
        Studio_Preview_URL: uploaded.url,
      },
    }),
  });
  return { record: updated || record, url: uploaded.url };
}
/*__STUDIO_WORKER_END:studioEnsurePublicJpegForPublish__*/

export async function studioPublishInstagramFeedPhoto(env, record) {
  try {
    return await studioPublishInstagramFeedPhotoInner(env, record);
  } catch (error) {
    console.warn("instagram feed photo publish failed", record?.id, error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      target: "IG-FEED-GRAPH",
    };
  }
}
/*__STUDIO_WORKER_END:studioPublishInstagramFeedPhoto__*/

export function studioNormPlaceText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/*__STUDIO_WORKER_END:studioNormPlaceText__*/

export function studioMarketName(record) {
  const raw = f(record, "Market_Name");
  if (Array.isArray(raw)) {
    const first = raw.map((item) => String(item || "").trim()).find(Boolean);
    return first || "";
  }
  return String(raw || "").trim();
}
/*__STUDIO_WORKER_END:studioMarketName__*/

export function studioMatchKnownPlace(text) {
  const hay = ` ${studioNormPlaceText(text)} `;
  const names = Object.keys(STUDIO_CHICAGO_PLACE_PAGE_IDS).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (hay.includes(` ${name} `)) return name;
  }
  return "";
}
/*__STUDIO_WORKER_END:studioMatchKnownPlace__*/

export function studioLookupPlacePageId(name) {
  const key = studioNormPlaceText(name);
  if (!key) return null;
  if (STUDIO_CHICAGO_PLACE_PAGE_IDS[key]) {
    return { page_id: STUDIO_CHICAGO_PLACE_PAGE_IDS[key], source: "chicago_places" };
  }
  for (const placeName of Object.keys(STUDIO_CHICAGO_PLACE_PAGE_IDS).sort((a, b) => b.length - a.length)) {
    if (key.includes(placeName) || placeName.includes(key)) {
      return { page_id: STUDIO_CHICAGO_PLACE_PAGE_IDS[placeName], source: "chicago_places_fuzzy" };
    }
  }
  return null;
}
/*__STUDIO_WORKER_END:studioLookupPlacePageId__*/

export async function studioResolvePublishLocation(env, outputRecord) {
  const contentId = studioFirstLinkedId(f(outputRecord, "Content_Item"));
  let content = null;
  if (contentId && env.AIRTABLE_CONTENT_TABLE_ID) {
    content = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId).catch(() => null);
  }
  const market = studioMarketName(content) || studioMarketName(outputRecord);
  const primary = String(f(content, "Primary_Location") || "").trim();
  const area = String(f(content, "Neighborhood_or_Area") || "").trim();
  let name = "";
  let source = "";
  if (primary) {
    name = primary;
    source = "content.Primary_Location";
  } else if (area) {
    name = area;
    source = "content.Neighborhood_or_Area";
  } else {
    const blob = [
      f(content, "Content_Title"),
      f(content, "Idea_Summary"),
      f(content, "Hook"),
      f(content, "Caption"),
      f(outputRecord, "Output_Title"),
      f(outputRecord, "Title_Text"),
      f(outputRecord, "Output_Caption"),
    ].filter(Boolean).join(" ");
    const matched = studioMatchKnownPlace(blob);
    if (matched) {
      name = matched.split(" ").map((part) => (part === "the" ? "The" : part.charAt(0).toUpperCase() + part.slice(1))).join(" ");
      if (matched === "the loop") name = "The Loop";
      source = "copy_match";
    } else if (market) {
      name = market;
      source = "market_fallback";
    }
  }
  if (!name) return null;
  const looked = studioLookupPlacePageId(name) || (market && studioNormPlaceText(name) !== studioNormPlaceText(market)
    ? studioLookupPlacePageId(market)
    : null);
  const label = market && !name.toLowerCase().includes(market.toLowerCase())
    ? `${name}, ${market}`
    : name;
  return {
    name,
    market,
    label,
    page_id: looked?.page_id || null,
    source: looked ? `${source}|${looked.source}` : source,
    query: market ? `${name}, ${market}` : name,
  };
}
/*__STUDIO_WORKER_END:studioResolvePublishLocation__*/

export async function studioPublishInstagramFeedPhotoInner(env, record) {
  const prepared = await studioEnsurePublicJpegForPublish(env, record);
  record = prepared.record;
  const imageUrl = prepared.url;
  if (!imageUrl.startsWith("https://media.chicagoshining.com/")) {
    return { ok: false, skipped: prepared.skip || "missing-cdn-preview", target: "IG-FEED-GRAPH" };
  }
  const settings = await studioActivePipelineSettings(env, [
    "INSTAGRAM_BUSINESS_ACCOUNT_ID",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_GRAPH_API_VERSION",
  ], record);
  const igUserId = settings.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const token = settings.FACEBOOK_PAGE_ACCESS_TOKEN;
  const version = String(settings.FACEBOOK_GRAPH_API_VERSION || "v25.0").replace(/^\/+|\/+$/g, "");
  if (!igUserId || !token) return { ok: false, skipped: "missing-instagram-settings", target: "IG-FEED-GRAPH" };

  const caption = studioGraphCaption(record);
  const location = await studioResolvePublishLocation(env, record);
  const createParams = {
    image_url: imageUrl,
    caption,
    access_token: token,
  };
  if (location?.page_id) createParams.location_id = String(location.page_id);
  let createResponse = await fetch(`https://graph.facebook.com/${version}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(createParams),
  });
  let created = await createResponse.json().catch(() => ({}));
  if ((!createResponse.ok || !created.id) && createParams.location_id) {
    const msg = String(created?.error?.message || "").toUpperCase();
    if (msg.includes("LOCATION")) {
      delete createParams.location_id;
      createResponse = await fetch(`https://graph.facebook.com/${version}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(createParams),
      });
      created = await createResponse.json().catch(() => ({}));
    }
  }
  const creationId = String(created.id || "").trim();
  if (!createResponse.ok || !creationId) {
    console.warn("instagram feed photo create failed", createResponse.status, created?.error?.message || "");
    return { ok: false, error: created?.error?.message || `create ${createResponse.status}`, target: "IG-FEED-GRAPH" };
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const statusResponse = await fetch(
      `https://graph.facebook.com/${version}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`
    );
    const status = await statusResponse.json().catch(() => ({}));
    const code = String(status.status_code || "").toUpperCase();
    if (code === "ERROR") {
      return { ok: false, error: status.status || "container error", target: "IG-FEED-GRAPH" };
    }
    if (!code || code === "FINISHED") break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const publishResponse = await fetch(`https://graph.facebook.com/${version}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: creationId, access_token: token }),
  });
  const published = await publishResponse.json().catch(() => ({}));
  const mediaId = String(published.id || "").trim();
  if (!publishResponse.ok || !mediaId) {
    console.warn("instagram feed photo publish failed", publishResponse.status, published?.error?.message || "");
    return { ok: false, error: published?.error?.message || `publish ${publishResponse.status}`, target: "IG-FEED-GRAPH" };
  }

  const metaResponse = await fetch(
    `https://graph.facebook.com/${version}/${mediaId}?fields=permalink,shortcode,media_type&access_token=${encodeURIComponent(token)}`
  );
  const meta = await metaResponse.json().catch(() => ({}));
  const permalink = String(meta.permalink || "").trim()
    || (meta.shortcode ? `https://www.instagram.com/p/${meta.shortcode}/` : "");

  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
    method: "PATCH",
    body: JSON.stringify({
      typecast: true,
      fields: {
        Publish_Status: "Published",
        Output_Status: "Published",
        Published_At: new Date().toISOString(),
        Platform_Post_ID: mediaId,
        Platform_Media_ID: mediaId,
        Platform_Post_URL: permalink || null,
        Publish_Asset_URL: imageUrl,
        Publish_Error_Message: "",
        Publish_Error_Stage: "",
        Publish_Retry_Eligible: false,
        Publish_Locked_By: "",
      },
    }),
  });
  return { ok: true, target: "IG-FEED-GRAPH", post_id: mediaId, permalink, location: location || null };
}
/*__STUDIO_WORKER_END:studioPublishInstagramFeedPhotoInner__*/

export async function studioPublishFacebookPageStory(env, record) {
  const preview = String(f(record, "Publish_Asset_URL") || f(record, "Studio_Preview_URL") || "").trim();
  if (!preview.startsWith("https://media.chicagoshining.com/")) {
    return { ok: false, skipped: "missing-cdn-preview" };
  }
  const settings = await studioActivePipelineSettings(env, [
    "FACEBOOK_PAGE_ID",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_GRAPH_API_VERSION",
  ], record);
  const pageId = settings.FACEBOOK_PAGE_ID;
  const token = settings.FACEBOOK_PAGE_ACCESS_TOKEN;
  const version = String(settings.FACEBOOK_GRAPH_API_VERSION || "v25.0").replace(/^\/+|\/+$/g, "");
  if (!pageId || !token) return { ok: false, skipped: "missing-facebook-settings" };

  const location = await studioResolvePublishLocation(env, record);
  const storiesUrl = `https://graph.facebook.com/${version}/${pageId}/video_stories`;
  const startResponse = await fetch(storiesUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ upload_phase: "start", access_token: token }),
  });
  const start = await startResponse.json().catch(() => ({}));
  if (!startResponse.ok || !start.video_id || !start.upload_url) {
    console.warn("facebook story start failed", startResponse.status, start?.error?.message || "");
    return { ok: false, error: start?.error?.message || `start ${startResponse.status}` };
  }

  const mediaResponse = await fetch(preview, { headers: { "User-Agent": "chicagoshining-studio-api/publish-dispatch" } });
  if (!mediaResponse.ok) return { ok: false, error: `cdn ${mediaResponse.status}` };
  const videoBytes = await mediaResponse.arrayBuffer();
  const uploadResponse = await fetch(start.upload_url, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(videoBytes.byteLength),
      "Content-Type": "application/octet-stream",
    },
    body: videoBytes,
  });
  const upload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || upload.success === false) {
    console.warn("facebook story upload failed", uploadResponse.status, upload?.debug_info?.message || upload?.error?.message || "");
    return { ok: false, error: upload?.debug_info?.message || upload?.error?.message || `upload ${uploadResponse.status}` };
  }

  const finishParams = {
    upload_phase: "finish",
    video_id: String(start.video_id),
    access_token: token,
  };
  if (location?.page_id) finishParams.place = String(location.page_id);
  let finishResponse = await fetch(storiesUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(finishParams),
  });
  let finish = await finishResponse.json().catch(() => ({}));
  if ((!finishResponse.ok || finish.success !== true) && finishParams.place) {
    delete finishParams.place;
    finishResponse = await fetch(storiesUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(finishParams),
    });
    finish = await finishResponse.json().catch(() => ({}));
  }
  if (!finishResponse.ok || finish.success !== true) {
    console.warn("facebook story finish failed", finishResponse.status, finish?.error?.message || "");
    return { ok: false, error: finish?.error?.message || `finish ${finishResponse.status}` };
  }

  const postId = String(finish.post_id || start.video_id);
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
    method: "PATCH",
    body: JSON.stringify({
      typecast: true,
      fields: {
        Publish_Status: "Published",
        Output_Status: "Published",
        Published_At: new Date().toISOString(),
        Platform_Post_ID: postId,
        Platform_Media_ID: String(start.video_id),
        Platform_Post_URL: `https://www.facebook.com/stories/${postId}`,
        FB_Publish_Status: "Published",
        Publish_Error_Message: "",
        Publish_Error_Stage: "",
        Publish_Retry_Eligible: false,
        Publish_Locked_By: "",
      },
    }),
  });
  return { ok: true, post_id: postId, location: location || null };
}
/*__STUDIO_WORKER_END:studioPublishFacebookPageStory__*/

export async function studioPulseAp0PublicAsset(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "AP0" };
  if (studioOutputIsNativePhoto(record) || studioOutputIsNativePhotoRoute(
    String(f(record, "Platform") || "").trim(),
    String(f(record, "Studio_Output_Type") || "").trim(),
    String(f(record, "Platform_Output_Type") || "").trim(),
  )) {
    return { ok: true, skipped: "native-photo", target: "AP0" };
  }
  const hasFile = String(f(record, "Final_File_ID") || "").trim() || String(f(record, "Final_File_URL") || "").trim();
  if (!hasFile) return { ok: true, skipped: "no-final-file", target: "AP0" };
  if (pipelineStageBackend(env, "AP0").mode === "python") {
    const { response, payload } = await item4PulsePipelineStage(env, "ap0", {
      output_record_id: recordId,
    }, "AP0");
    if (!response.ok || payload?.status === "error") {
      return {
        ok: false,
        target: "AP0",
        backend: "python",
        status: response.status,
        message: payload?.message || `Python AP0 returned HTTP ${response.status}`,
      };
    }
    const skipped = payload?.status === "skipped";
    return {
      ok: true,
      skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
      target: "AP0",
      backend: "python",
    };
  }
  if (String(f(record, "Publish_Asset_URL") || "").trim()) {
    return { ok: true, skipped: "already-has-asset", target: "AP0" };
  }
  return { ok: false, skipped: "make_retired", target: "AP0" };
}
/*__STUDIO_WORKER_END:studioPulseAp0PublicAsset__*/

export async function studioPulseAp1IgReel(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "AP1-IG" };
  const { response, payload } = await item4PulsePipelineStage(env, "ap1_ig", {
    output_record_id: recordId,
  }, "AP1_IG");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "AP1-IG",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python AP1-IG returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
    target: "AP1-IG",
    backend: "python",
    post_id: payload?.details?.run?.media_id,
    permalink: payload?.details?.run?.permalink,
  };
}
/*__STUDIO_WORKER_END:studioPulseAp1IgReel__*/

export async function studioPulseAp1Igs(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "AP1-IGS" };
  const { response, payload } = await item4PulsePipelineStage(env, "ap1_igs", {
    output_record_id: recordId,
  }, "AP1_IGS");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "AP1-IGS",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python AP1-IGS returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
    target: "AP1-IGS",
    backend: "python",
    needs_poll: Boolean(payload?.details?.run?.needs_poll),
    container_id: payload?.details?.run?.container_id,
  };
}
/*__STUDIO_WORKER_END:studioPulseAp1Igs__*/

export async function studioPulseFbs1(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "FBS1" };
  const { response, payload } = await item4PulsePipelineStage(env, "fbs1", {
    output_record_id: recordId,
  }, "FBS1");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "FBS1",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python FBS1 returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
    target: "FBS1",
    backend: "python",
    needs_poll: Boolean(payload?.details?.run?.needs_poll),
    job_id: payload?.details?.run?.job_id,
  };
}
/*__STUDIO_WORKER_END:studioPulseFbs1__*/

export async function studioPulseFbs2(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "FBS2" };
  const { response, payload } = await item4PulsePipelineStage(env, "fbs2", {
    output_record_id: recordId,
  }, "FBS1");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "FBS2",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python FBS2 returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
    target: "FBS2",
    backend: "python",
    still_processing: Boolean(payload?.details?.run?.still_processing),
    public_url: payload?.details?.run?.public_url,
  };
}
/*__STUDIO_WORKER_END:studioPulseFbs2__*/

export async function studioEnsureFacebookSlideshowAsset(env, record) {
  const status = String(f(record, "FB_Slideshow_Status") || "");
  const publicUrl = String(f(record, "FB_Slideshow_Public_URL") || "").trim();
  if (/^video ready$/i.test(status) && publicUrl) {
    return { ok: true, skipped: "already-ready", target: "FBS1" };
  }
  const created = await studioPulseFbs1(env, record);
  if (!created.ok) return created;
  if (!created.skipped && created.needs_poll) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    return studioPulseFbs2(env, record);
  }
  if (!created.skipped) return created;
  return studioPulseFbs2(env, record);
}
/*__STUDIO_WORKER_END:studioEnsureFacebookSlideshowAsset__*/

export async function studioPublishFacebookReelNative(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "FBS3-NATIVE" };

  const videoUrl = String(
    f(record, "FB_Slideshow_Public_URL")
    || f(record, "Publish_Asset_URL")
    || f(record, "Studio_Preview_URL")
    || ""
  ).trim();
  if (!videoUrl.startsWith("https://media.chicagoshining.com/")) {
    return { ok: false, skipped: "missing-public-mp4", target: "FBS3-NATIVE" };
  }

  const settings = await studioActivePipelineSettings(env, [
    "FACEBOOK_PAGE_ID",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_GRAPH_API_VERSION",
  ], record);
  const pageId = String(settings.FACEBOOK_PAGE_ID || "").trim();
  const token = String(settings.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
  const version = String(settings.FACEBOOK_GRAPH_API_VERSION || "v25.0").replace(/^\/+|\/+$/g, "");
  if (!pageId || !token) return { ok: false, skipped: "missing-facebook-settings", target: "FBS3-NATIVE" };

  const description = (() => {
    const caption = String(f(record, "Output_Caption") || "").trim().slice(0, 4500);
    const hashtags = String(f(record, "Output_Hashtags") || "").trim().slice(0, 450);
    return caption && hashtags ? `${caption}\n\n${hashtags}` : (caption || hashtags);
  })();
  const title = String(
    f(record, "Output_Title")
    || f(record, "Title_Text")
    || f(record, "Output_Caption")
    || "Facebook Reel"
  ).trim().slice(0, 255) || "Facebook Reel";
  const location = await studioResolvePublishLocation(env, record);

  let videoId = String(f(record, "FB_Slideshow_Meta_Video_ID") || f(record, "Platform_Post_ID") || "").trim();
  let uploadUrl = String(f(record, "FB_Slideshow_Meta_Upload_URL") || "").trim();

  if (videoId && !uploadUrl && String(f(record, "FB_Slideshow_Status") || "").toLowerCase().includes("processing")) {
    return { ok: true, skipped: "already-processing", target: "FBS3-NATIVE", needs_poll: true, video_id: videoId };
  }

  if (!videoId) {
    const startUrl = new URL(`https://graph.facebook.com/${version}/${pageId}/video_reels`);
    startUrl.searchParams.set("upload_phase", "start");
    const startResponse = await fetch(startUrl.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const start = await startResponse.json().catch(() => ({}));
    videoId = String(start.video_id || "").trim();
    uploadUrl = String(start.upload_url || "").trim();
    if (!startResponse.ok || !videoId || !uploadUrl) {
      return {
        ok: false,
        target: "FBS3-NATIVE",
        error: start?.error?.message || `start ${startResponse.status}`,
      };
    }
    await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId, {
      method: "PATCH",
      body: JSON.stringify({
        typecast: true,
        fields: {
          Publish_Status: "Publishing",
          FB_Publish_Status: "Publishing",
          FB_Slideshow_Status: "Uploading Reel",
          FB_Slideshow_Meta_Video_ID: videoId,
          FB_Slideshow_Meta_Upload_URL: uploadUrl,
          Publish_Error_Stage: "",
          Publish_Error_Message: "",
          Publish_Retry_Eligible: false,
        },
      }),
    });
  }

  const mediaResponse = await fetch(videoUrl, {
    headers: { "User-Agent": "chicagoshining-studio-api/facebook-reel-native" },
  });
  if (!mediaResponse.ok) {
    return { ok: false, target: "FBS3-NATIVE", error: `cdn ${mediaResponse.status}`, video_id: videoId };
  }
  const payload = await mediaResponse.arrayBuffer();
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(payload.byteLength),
      "Content-Type": "application/octet-stream",
    },
    body: payload,
  });
  const upload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || upload.success === false) {
    return {
      ok: false,
      target: "FBS3-NATIVE",
      error: upload?.error?.message || upload?.debug_info?.message || `upload ${uploadResponse.status}`,
      video_id: videoId,
    };
  }

  const finishBase = `https://graph.facebook.com/${version}/${pageId}/video_reels`;
  const makeFinish = async (includePlace) => {
    const url = new URL(finishBase);
    url.searchParams.set("upload_phase", "finish");
    url.searchParams.set("video_id", videoId);
    url.searchParams.set("video_state", "PUBLISHED");
    if (description) url.searchParams.set("description", description);
    if (title) url.searchParams.set("title", title);
    if (includePlace && location?.page_id) url.searchParams.set("place", String(location.page_id));
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  };

  let finished = await makeFinish(true);
  if (!finished.response.ok && location?.page_id && /place/i.test(String(finished.body?.error?.message || ""))) {
    finished = await makeFinish(false);
  }
  if (!finished.response.ok) {
    const ambiguous = finished.response.status >= 500 || finished.response.status === 0;
    if (ambiguous) {
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId, {
        method: "PATCH",
        body: JSON.stringify({
          typecast: true,
          fields: {
            Publish_Status: "Publishing",
            Platform_Post_ID: videoId,
            FB_Publish_Status: "Publishing",
            FB_Slideshow_Status: "Reel Processing",
            FB_Slideshow_Meta_Video_ID: videoId,
            Publish_Error_Stage: "FBS3_AMBIGUOUS",
            Publish_Error_Message: "Facebook Reel finish outcome was ambiguous; native poll will reconcile.",
            Publish_Retry_Eligible: true,
            Publish_Next_Retry_At: new Date().toISOString(),
          },
        }),
      });
      return { ok: true, target: "FBS3-NATIVE", needs_poll: true, video_id: videoId, ambiguous: true };
    }
    return {
      ok: false,
      target: "FBS3-NATIVE",
      error: finished.body?.error?.message || `finish ${finished.response.status}`,
      video_id: videoId,
    };
  }

  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      typecast: true,
      fields: {
        Publish_Status: "Publishing",
        Platform_Post_ID: videoId,
        FB_Publish_Status: "Publishing",
        FB_Slideshow_Status: "Reel Processing",
        FB_Slideshow_Meta_Video_ID: videoId,
        Publish_Error_Stage: "",
        Publish_Error_Message: "",
        Publish_Retry_Eligible: true,
        Publish_Next_Retry_At: new Date(Date.now() + 60000).toISOString(),
      },
    }),
  });
  return { ok: true, target: "FBS3-NATIVE", backend: "graph", needs_poll: true, video_id: videoId };
}
/*__STUDIO_WORKER_END:studioPublishFacebookReelNative__*/

export async function studioPulseFbs3(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "FBS3" };
  const { response, payload } = await item4PulsePipelineStage(env, "fbs3", {
    output_record_id: recordId,
  }, "FBS3");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "FBS3",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python FBS3 returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  const reason = skipped ? (payload?.details?.run?.reason || "python-skip") : undefined;
  if (reason === "facebook_manual_publish") {
    const refreshed = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId).catch(() => record);
    return studioPublishFacebookReelNative(env, refreshed);
  }
  return {
    ok: true,
    skipped: reason,
    target: "FBS3",
    backend: "python",
    needs_poll: Boolean(payload?.details?.run?.needs_poll),
    video_id: payload?.details?.run?.video_id,
  };
}
/*__STUDIO_WORKER_END:studioPulseFbs3__*/

export async function studioPulseFbs4(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "FBS4" };
  const { response, payload } = await item4PulsePipelineStage(env, "fbs4", {
    output_record_id: recordId,
  }, "FBS3");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "FBS4",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python FBS4 returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
    target: "FBS4",
    backend: "python",
    still_processing: Boolean(payload?.details?.run?.still_processing),
    video_id: payload?.details?.run?.video_id,
    permalink: payload?.details?.run?.permalink,
  };
}
/*__STUDIO_WORKER_END:studioPulseFbs4__*/

export async function studioPulseYtRecord(env, stagePath, target, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target };
  const { response, payload } = await item4PulsePipelineStage(env, stagePath, {
    output_record_id: recordId,
  }, "YT0");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target,
      backend: "python",
      status: response.status,
      message: payload?.message || `Python ${target} returned HTTP ${response.status}`,
    };
  }
  const run = payload?.details?.run || {};
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (run.reason || "python-skip") : undefined,
    target,
    backend: "python",
    still_processing: Boolean(run.still_processing),
    needs_upload: Boolean(run.needs_upload),
    needs_poll: Boolean(run.needs_poll),
    needs_processing_poll: Boolean(run.needs_processing_poll),
    needs_finalize: Boolean(run.needs_finalize),
    terminal: Boolean(run.terminal),
    video_id: run.video_id,
    job_id: run.job_id,
    permalink: run.permalink,
    youtube_stage: run.youtube_stage,
  };
}
/*__STUDIO_WORKER_END:studioPulseYtRecord__*/

export async function studioEnsureYoutubePublish(env, record) {
  const stage = String(f(record, "YouTube_Stage") || "").trim();
  const videoId = String(f(record, "YouTube_Video_ID") || "").trim();
  if (/^complete$/i.test(stage) && videoId) {
    return { ok: true, skipped: "already-complete", target: "YT0", backend: "python", video_id: videoId };
  }
  if (!videoId && studioYoutubeFailedPrivateSource(record)) {
    const healed = await studioHealFailedYoutubeSourceDownloads(env, { limit: 1, recordId: record.id });
    return healed[0] || { ok: false, skipped: "heal-miss", target: "AP0" };
  }
  if (!videoId && !studioYoutubePublicSourceUrl(record)) {
    const staged = await studioPulseAp0PublicAsset(env, record);
    if (!staged?.ok || staged.skipped) return { ...staged, blocked: "missing_public_publish_url" };
  }
  if (/^yt4$/i.test(stage)) return studioPulseYtRecord(env, "yts3", "YTS3", record);
  if (/^yt2$/i.test(stage) && videoId) {
    const processed = await studioPulseYtRecord(env, "yts2", "YTS2", record);
    if (!processed.ok || processed.still_processing || !processed.needs_finalize) return processed;
    return { ...await studioPulseYtRecord(env, "yts3", "YTS3", record), process: processed };
  }
  if (/^yt2$/i.test(stage)) {
    const uploaded = await studioPulseYtRecord(env, "yts1", "YTS1", record);
    if (!uploaded.ok || uploaded.still_processing) return uploaded;
    if (uploaded.needs_finalize && !uploaded.needs_processing_poll) {
      return { ...await studioPulseYtRecord(env, "yts3", "YTS3", record), upload: uploaded };
    }
    if (!uploaded.needs_processing_poll) return uploaded;
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const processed = await studioPulseYtRecord(env, "yts2", "YTS2", record);
    if (!processed.ok || processed.still_processing || !processed.needs_finalize) {
      return { ...processed, upload: uploaded };
    }
    return { ...await studioPulseYtRecord(env, "yts3", "YTS3", record), upload: uploaded, process: processed };
  }
  if (/^yt1$/i.test(stage)) {
    const started = await studioPulseYtRecord(env, "ytp1", "YTP1", record);
    if (!started.ok || started.skipped || !started.needs_poll) return started;
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const uploaded = await studioPulseYtRecord(env, "yts1", "YTS1", record);
    if (!uploaded.ok || uploaded.still_processing) {
      return { ...uploaded, start: started };
    }
    if (uploaded.needs_finalize && !uploaded.needs_processing_poll) {
      return { ...await studioPulseYtRecord(env, "yts3", "YTS3", record), start: started, upload: uploaded };
    }
    return { ...uploaded, start: started };
  }
  const prepared = await studioPulseYtRecord(env, "yt0", "YT0", record);
  if (!prepared.ok || prepared.skipped || prepared.terminal || !prepared.needs_upload) return prepared;
  const started = await studioPulseYtRecord(env, "ytp1", "YTP1", record);
  if (!started.ok || started.skipped || !started.needs_poll) return { ...started, prepare: prepared };
  await new Promise((resolve) => setTimeout(resolve, 8000));
  const uploaded = await studioPulseYtRecord(env, "yts1", "YTS1", record);
  return { ...uploaded, prepare: prepared, start: started };
}
/*__STUDIO_WORKER_END:studioEnsureYoutubePublish__*/

export async function studioPulseTtd0(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "TTD0" };
  const { response, payload } = await item4PulsePipelineStage(env, "ttd0", {
    output_record_id: recordId,
  }, "TTD0");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "TTD0",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python TTD0 returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
    target: "TTD0",
    backend: "python",
    needs_init: Boolean(payload?.details?.run?.needs_init),
  };
}
/*__STUDIO_WORKER_END:studioPulseTtd0__*/

export async function studioPulseTtd1(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "TTD1" };
  const { response, payload } = await item4PulsePipelineStage(env, "ttd1", {
    output_record_id: recordId,
    extra: {
      replace_transaction_id: String(f(record, "Replace_Transaction_ID") || ""),
      replace_fingerprint: String(f(record, "Replace_Fingerprint") || ""),
    },
  }, "TTD0");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "TTD1",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python TTD1 returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
    target: "TTD1",
    backend: "python",
    needs_poll: Boolean(payload?.details?.run?.needs_poll),
    publish_id: payload?.details?.run?.publish_id,
  };
}
/*__STUDIO_WORKER_END:studioPulseTtd1__*/

export async function studioPulseTtd2(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "TTD2" };
  const { response, payload } = await item4PulsePipelineStage(env, "ttd2", {
    output_record_id: recordId,
    extra: {
      replace_transaction_id: String(f(record, "Replace_Transaction_ID") || ""),
      replace_fingerprint: String(f(record, "Replace_Fingerprint") || ""),
    },
  }, "TTD0");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "TTD2",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python TTD2 returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
    target: "TTD2",
    backend: "python",
    still_processing: Boolean(payload?.details?.run?.still_processing),
    needs_email: Boolean(payload?.details?.run?.needs_email),
    publish_id: payload?.details?.run?.publish_id,
  };
}
/*__STUDIO_WORKER_END:studioPulseTtd2__*/

export async function studioPulseTtd3(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "TTD3" };
  const { response, payload } = await item4PulsePipelineStage(env, "ttd3", {
    output_record_id: recordId,
  }, "TTD0");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "TTD3",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python TTD3 returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
    target: "TTD3",
    backend: "python",
    email_sent: Boolean(payload?.details?.run?.email_sent),
  };
}
/*__STUDIO_WORKER_END:studioPulseTtd3__*/

export async function studioEnsureTiktokDraft(env, record) {
  const status = String(f(record, "TikTok_Draft_Status") || "");
  const publishId = String(f(record, "TikTok_Draft_Publish_ID") || "").trim();
  if (/^ready for delivery$/i.test(status) && !publishId) {
    return studioPulseTtd1(env, record);
  }
  if ((/^processing$/i.test(status) || (/retry pending/i.test(status) && /TTD2/i.test(String(f(record, "Publish_Error_Stage") || "")))) && publishId) {
    return studioPulseTtd2(env, record);
  }
  if (!String(f(record, "TikTok_Draft_Email_Sent_At") || "").trim() && String(f(record, "Manual_Completion_Status") || "") === "Required" && (
    /draft delivered/i.test(status) || /manual completion received/i.test(status) || (/retry pending/i.test(status) && /TTD3/i.test(String(f(record, "Publish_Error_Stage") || "")))
  )) {
    return studioPulseTtd3(env, record);
  }
  const prepared = await studioPulseTtd0(env, record);
  if (!prepared.ok) return prepared;
  if (!prepared.skipped && prepared.needs_init) return studioPulseTtd1(env, record);
  if (!prepared.skipped) return prepared;
  return studioPulseTtd1(env, record);
}
/*__STUDIO_WORKER_END:studioEnsureTiktokDraft__*/

export async function studioPulseFbRecord(env, stagePath, target, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target };
  const { response, payload } = await item4PulsePipelineStage(env, stagePath, {
    output_record_id: recordId,
    extra: {
      replace_transaction_id: String(f(record, "Replace_Transaction_ID") || ""),
      replace_fingerprint: String(f(record, "Replace_Fingerprint") || ""),
    },
  }, "FB0");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target,
      backend: "python",
      status: response.status,
      message: payload?.message || `Python ${target} returned HTTP ${response.status}`,
    };
  }
  const run = payload?.details?.run || {};
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (run.reason || "python-skip") : undefined,
    target,
    backend: "python",
    needs_photo_media: Boolean(run.needs_photo_media),
    needs_slideshow: Boolean(run.needs_slideshow),
    needs_more: Boolean(run.needs_more),
    photo_media_ready: Boolean(run.photo_media_ready),
    needs_reconcile: Boolean(run.needs_reconcile),
    needs_finalize: Boolean(run.needs_finalize),
    published: Boolean(run.published),
    platform_post_id: run.platform_post_id,
  };
}
/*__STUDIO_WORKER_END:studioPulseFbRecord__*/

export async function studioPulseFb0(env, record) {
  return studioPulseFbRecord(env, "fb0", "FB0", record);
}
/*__STUDIO_WORKER_END:studioPulseFb0__*/

export async function studioPulseFb1(env, record) {
  return studioPulseFbRecord(env, "fb1", "FB1", record);
}
/*__STUDIO_WORKER_END:studioPulseFb1__*/

export async function studioPulseFb2(env, record) {
  return studioPulseFbRecord(env, "fb2", "FB2", record);
}
/*__STUDIO_WORKER_END:studioPulseFb2__*/

export async function studioPulseFb2r(env, record) {
  return studioPulseFbRecord(env, "fb2r", "FB2R", record);
}
/*__STUDIO_WORKER_END:studioPulseFb2r__*/

export async function studioPulseFb3(env, record) {
  return studioPulseFbRecord(env, "fb3", "FB3", record);
}
/*__STUDIO_WORKER_END:studioPulseFb3__*/

export async function studioEnsureFacebookPhotoPublish(env, record) {
  const status = String(f(record, "FB_Publish_Status") || "");
  const postId = String(f(record, "Platform_Post_ID") || "").trim();
  if (/^ready for photo media$/i.test(status) && !postId) {
    return studioPulseFb1(env, record);
  }
  if (/^photo media ready$/i.test(status) && !postId) {
    return studioPulseFb2(env, record);
  }
  if (/^reconcile pending$/i.test(status) && !postId) {
    return studioPulseFb2r(env, record);
  }
  if (postId && !/^published$/i.test(String(f(record, "Publish_Status") || ""))) {
    return studioPulseFb3(env, record);
  }
  if (/^published pending finalize$/i.test(status) && postId) {
    return studioPulseFb3(env, record);
  }
  const prepared = await studioPulseFb0(env, record);
  if (!prepared.ok || prepared.skipped || prepared.needs_slideshow) return prepared;
  if (prepared.needs_photo_media) {
    const media = await studioPulseFb1(env, record);
    if (!media.ok || media.skipped || media.needs_more || !media.photo_media_ready) return { ...media, prepare: prepared };
    const published = await studioPulseFb2(env, record);
    if (!published.ok || published.skipped || published.needs_reconcile) return { ...published, media, prepare: prepared };
    if (published.needs_finalize) return { ...await studioPulseFb3(env, record), publish: published, media, prepare: prepared };
    return { ...published, media, prepare: prepared };
  }
  return prepared;
}
/*__STUDIO_WORKER_END:studioEnsureFacebookPhotoPublish__*/

export async function studioPulseApcRecord(env, stagePath, target, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target };
  const { response, payload } = await item4PulsePipelineStage(env, stagePath, {
    output_record_id: recordId,
    extra: {
      replace_transaction_id: String(f(record, "Replace_Transaction_ID") || ""),
      replace_fingerprint: String(f(record, "Replace_Fingerprint") || ""),
    },
  }, "AP0C");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target,
      backend: "python",
      status: response.status,
      message: payload?.message || `Python ${target} returned HTTP ${response.status}`,
    };
  }
  const run = payload?.details?.run || {};
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (run.reason || "python-skip") : undefined,
    target,
    backend: "python",
    needs_assets: Boolean(run.needs_assets),
    assets_ready: Boolean(run.assets_ready),
    needs_children: Boolean(run.needs_children),
    needs_child_poll: Boolean(run.needs_child_poll),
    children_ready: Boolean(run.children_ready),
    needs_parent: Boolean(run.needs_parent),
    needs_parent_poll: Boolean(run.needs_parent_poll),
    parent_ready: Boolean(run.parent_ready),
    needs_publish: Boolean(run.needs_publish),
    needs_reconcile: Boolean(run.needs_reconcile),
    needs_finalize: Boolean(run.needs_finalize),
    still_processing: Boolean(run.still_processing),
    published: Boolean(run.published),
    media_id: run.media_id,
    permalink: run.permalink,
  };
}
/*__STUDIO_WORKER_END:studioPulseApcRecord__*/

export async function studioPulseAp0c(env, record) {
  return studioPulseApcRecord(env, "ap0c", "AP0C", record);
}
/*__STUDIO_WORKER_END:studioPulseAp0c__*/

export async function studioPulseAp1c(env, record) {
  return studioPulseApcRecord(env, "ap1c", "AP1C", record);
}
/*__STUDIO_WORKER_END:studioPulseAp1c__*/

export async function studioPulseAp2c(env, record) {
  return studioPulseApcRecord(env, "ap2c", "AP2C", record);
}
/*__STUDIO_WORKER_END:studioPulseAp2c__*/

export async function studioPulseAp3c(env, record) {
  return studioPulseApcRecord(env, "ap3c", "AP3C", record);
}
/*__STUDIO_WORKER_END:studioPulseAp3c__*/

export async function studioPulseAp3p(env, record) {
  return studioPulseApcRecord(env, "ap3p", "AP3P", record);
}
/*__STUDIO_WORKER_END:studioPulseAp3p__*/

export async function studioPulseAp4c(env, record) {
  return studioPulseApcRecord(env, "ap4c", "AP4C", record);
}
/*__STUDIO_WORKER_END:studioPulseAp4c__*/

export async function studioPulseAp4r(env, record) {
  return studioPulseApcRecord(env, "ap4r", "AP4R", record);
}
/*__STUDIO_WORKER_END:studioPulseAp4r__*/

export async function studioPulseAp5c(env, record) {
  return studioPulseApcRecord(env, "ap5c", "AP5C", record);
}
/*__STUDIO_WORKER_END:studioPulseAp5c__*/

export async function studioEnsureInstagramCarouselPublish(env, record) {
  const status = String(f(record, "IG_Carousel_Status") || "");
  const mediaId = String(f(record, "IG_Carousel_Published_Media_ID") || f(record, "Platform_Post_ID") || "").trim();
  const permalink = String(f(record, "Platform_Post_URL") || "").trim();
  if (/^assets ready$/i.test(status) && !mediaId) return studioPulseAp1c(env, record);
  if (/^children processing$/i.test(status) && !mediaId) return studioPulseAp2c(env, record);
  if (/^children ready$/i.test(status) && !mediaId) return studioPulseAp3c(env, record);
  if (/^parent processing$/i.test(status) && !mediaId) return studioPulseAp3p(env, record);
  if (/^parent ready$/i.test(status) && !mediaId) return studioPulseAp4c(env, record);
  if (/^publishing$/i.test(status) && !mediaId && /AP4C Parent Publishing/i.test(String(f(record, "IG_Carousel_Error_Stage") || ""))) {
    return studioPulseAp4r(env, record);
  }
  if (/^publishing$/i.test(status) && mediaId && !permalink) return studioPulseAp5c(env, record);
  const prepared = await studioPulseAp0c(env, record);
  if (!prepared.ok || prepared.skipped || !prepared.assets_ready) return prepared;
  const children = await studioPulseAp1c(env, record);
  if (!children.ok || children.skipped || !children.needs_child_poll) return { ...children, prepare: prepared };
  const polled = await studioPulseAp2c(env, record);
  if (!polled.ok || polled.skipped || polled.still_processing || !polled.children_ready) return { ...polled, children, prepare: prepared };
  const parent = await studioPulseAp3c(env, record);
  if (!parent.ok || parent.skipped || !parent.needs_parent_poll) return { ...parent, poll: polled, children, prepare: prepared };
  const parentPoll = await studioPulseAp3p(env, record);
  if (!parentPoll.ok || parentPoll.skipped || parentPoll.still_processing || !parentPoll.parent_ready) {
    return { ...parentPoll, parent, poll: polled, children, prepare: prepared };
  }
  const published = await studioPulseAp4c(env, record);
  if (!published.ok || published.skipped || published.needs_reconcile) return { ...published, parentPoll, parent, poll: polled, children, prepare: prepared };
  if (published.needs_finalize) {
    return { ...await studioPulseAp5c(env, record), publish: published, parentPoll, parent, poll: polled, children, prepare: prepared };
  }
  return { ...published, parentPoll, parent, poll: polled, children, prepare: prepared };
}
/*__STUDIO_WORKER_END:studioEnsureInstagramCarouselPublish__*/

export async function studioTiktokComplete(request, env) {
  const incoming = new URL(request.url);
  const { runnerUrl } = pipelineStageBackend(env, "TTD0");
  if (!runnerUrl) return new Response("TikTok completion is not configured.", { status: 503, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  const target = new URL(`${runnerUrl}/hooks/ttd4`);
  incoming.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  const headers = { Accept: "text/html" };
  const init = { method: request.method, headers };
  if (request.method === "POST") {
    init.body = await request.text();
    headers["Content-Type"] = request.headers.get("Content-Type") || "application/x-www-form-urlencoded";
  }
  const response = await fetch(target.toString(), init);
  return new Response(await response.text(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "text/html; charset=UTF-8" },
  });
}
/*__STUDIO_WORKER_END:studioTiktokComplete__*/

export async function studioPulseAp1IgsPoll(env, record) {
  const recordId = String(record?.id || "").trim();
  if (!STUDIO_AP0_RECORD_ID.test(recordId)) return { ok: false, skipped: "bad-id", target: "AP1-IGS-POLL" };
  const { response, payload } = await item4PulsePipelineStage(env, "ap1_igs_poll", {
    output_record_id: recordId,
  }, "AP1_IGS");
  if (!response.ok || payload?.status === "error") {
    return {
      ok: false,
      target: "AP1-IGS-POLL",
      backend: "python",
      status: response.status,
      message: payload?.message || `Python AP1-IGS-POLL returned HTTP ${response.status}`,
    };
  }
  const skipped = payload?.status === "skipped";
  return {
    ok: true,
    skipped: skipped ? (payload?.details?.run?.reason || "python-skip") : undefined,
    target: "AP1-IGS-POLL",
    backend: "python",
    still_processing: Boolean(payload?.details?.run?.still_processing),
    post_id: payload?.details?.run?.post_id,
    container_id: payload?.details?.run?.container_id,
  };
}
/*__STUDIO_WORKER_END:studioPulseAp1IgsPoll__*/

export async function studioArmPublishScenarios(env, target) {
  const armed = [];
  for (const scenarioId of STUDIO_PUBLISH_DISPATCH_SCENARIOS[target]?.webhooks || []) {
    try {
      await phase6EnsureScenarioActive(env, scenarioId);
      armed.push({ id: scenarioId, ok: true });
    } catch (error) {
      console.warn("publish webhook scenario could not be armed", target, scenarioId, error);
      armed.push({ id: scenarioId, ok: false });
    }
  }
  return armed;
}
/*__STUDIO_WORKER_END:studioArmPublishScenarios__*/

export async function studioRunPublishOrchestrator(env, target) {
  const scenarioId = STUDIO_PUBLISH_DISPATCH_SCENARIOS[target]?.orchestrator;
  if (!scenarioId) return null;
  const orch = STUDIO_PUBLISH_ORCH_PYTHON[scenarioId];
  try {
    if (orch && pipelineStageBackend(env, orch.flag).mode === "python") {
      const { response, payload } = await item4PulsePipelineStage(env, orch.stage, { extra: {} }, orch.flag);
      if (!response.ok) {
        throw new HttpError(
          response.status,
          payload?.message || payload?.error || `Python ${orch.stage} failed (${response.status})`
        );
      }
      return { ok: true, id: scenarioId, backend: "python", payload };
    }
    throw new HttpError(503, `Publish orchestrator ${target} is Python-only.`);
  } catch (error) {
    console.warn("publish orchestrator pulse failed", target, scenarioId, error);
    return { ok: false, id: scenarioId };
  }
}
/*__STUDIO_WORKER_END:studioRunPublishOrchestrator__*/

export async function studioEnsureOutputCaption(env, record) {
  const existingCaption = String(f(record, "Output_Caption") || "").trim();
  const cleanExistingCaption = item4StripAssetFilenameCaptionText(existingCaption);
  const existingHashtags = String(f(record, "Output_Hashtags") || "").trim();
  if (cleanExistingCaption === existingCaption && existingCaption && existingHashtags) return record;

  const parentId = (f(record, "Content_Item") || [])[0] || null;
  const parent = parentId
    ? await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId).catch(() => null)
    : null;

  const fields = {};
  const parentCaption = item4StripAssetFilenameCaptionText(f(parent || {}, "Caption"));
  if (cleanExistingCaption !== existingCaption) {
    fields.Output_Caption = cleanExistingCaption || parentCaption || null;
  } else if (!cleanExistingCaption && parentCaption) {
    fields.Output_Caption = parentCaption;
  }

  if (!existingHashtags) {
    const hashtags = String(f(parent || {}, "Hashtags") || "").trim();
    if (hashtags) fields.Output_Hashtags = hashtags;
  }

  if (!Object.keys(fields).length) return record;
  try {
    return await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
  } catch (error) {
    console.warn("output caption/hashtag backfill failed", record.id, error);
    return record;
  }
}
/*__STUDIO_WORKER_END:studioEnsureOutputCaption__*/

export async function studioDispatchApprovedPublishNow(env, record) {
  if (!studioPublishCanDispatchNow(record)) {
    return {
      ok: true,
      skipped: "scheduled-hold",
      held_until: studioPublishHeldUntilIso(record),
      record,
    };
  }
  record = await studioPromoteDuePublishStatus(env, record);
  record = await studioEnsureOutputCaption(env, record);
  if (!String(f(record, "Output_Caption") || "").trim()) {
    return { ok: false, skipped: "missing-ai-caption", record };
  }
  const plan = studioPublishDispatchTarget(record);
  if (!plan) return { ok: true, skipped: "no-dispatch", record };
  if (plan.graphStory) return { ...await studioPublishFacebookPageStory(env, record), plan, record };
  if (plan.graphFeedPhoto) return { ...await studioPublishInstagramFeedPhoto(env, record), plan, record };
  let ap0 = null;
  if (plan.target !== "AP0C" && plan.target !== "FB0") {
    const ap0Python = pipelineStageBackend(env, "AP0").mode === "python";
    if (!ap0Python) await studioArmPublishScenarios(env, "AP0");
    ap0 = await studioPulseAp0PublicAsset(env, record);
    if (ap0?.ok && !ap0.skipped && ap0.backend !== "python") {
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }
  }
  if (plan.target === "AP1-IG" && pipelineStageBackend(env, "AP1_IG").mode === "python") {
    const pulsed = await studioPulseAp1IgReel(env, record);
    return { ...pulsed, ap0, armed: [], plan, record };
  }
  if (plan.target === "AP1-IGS" && pipelineStageBackend(env, "AP1_IGS").mode === "python") {
    const created = await studioPulseAp1Igs(env, record);
    if (!created.ok || created.skipped || !created.needs_poll) {
      return { ...created, ap0, armed: [], plan, record };
    }
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const polled = await studioPulseAp1IgsPoll(env, record);
    return { ...polled, create: created, ap0, armed: [], plan, record };
  }
  if (plan.target === "FBS3" && pipelineStageBackend(env, "FBS1").mode === "python") {
    const prepared = await studioEnsureFacebookSlideshowAsset(env, record);
    if (!prepared.ok || prepared.still_processing) {
      return { ...prepared, ap0, armed: [], plan, record };
    }
  }
  if (plan.target === "FBS3" && pipelineStageBackend(env, "FBS3").mode === "python") {
    const created = await studioPulseFbs3(env, record);
    if (!created.ok || created.skipped || !created.needs_poll) {
      return { ...created, ap0, armed: [], plan, record };
    }
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const polled = await studioPulseFbs4(env, record);
    return { ...polled, create: created, ap0, armed: [], plan, record };
  }
  if (plan.target === "YT0" && pipelineStageBackend(env, "YT0").mode === "python") {
    const pulsed = await studioEnsureYoutubePublish(env, record);
    return { ...pulsed, ap0, armed: [], plan, record };
  }
  if (plan.target === "TTD0" && pipelineStageBackend(env, "TTD0").mode === "python") {
    const prepared = await studioPulseTtd0(env, record);
    if (!prepared.ok || prepared.skipped || !prepared.needs_init) {
      if (prepared.ok && prepared.skipped) {
        const next = await studioEnsureTiktokDraft(env, record);
        return { ...next, prepare: prepared, ap0, armed: [], plan, record };
      }
      return { ...prepared, ap0, armed: [], plan, record };
    }
    const inited = await studioPulseTtd1(env, record);
    if (!inited.ok || inited.skipped || !inited.needs_poll) {
      return { ...inited, prepare: prepared, ap0, armed: [], plan, record };
    }
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const polled = await studioPulseTtd2(env, record);
    if (!polled.ok || polled.skipped || !polled.needs_email) {
      return { ...polled, init: inited, prepare: prepared, ap0, armed: [], plan, record };
    }
    const emailed = await studioPulseTtd3(env, record);
    return { ...emailed, poll: polled, init: inited, prepare: prepared, ap0, armed: [], plan, record };
  }
  if (plan.target === "FB0" && pipelineStageBackend(env, "FB0").mode === "python") {
    const pulsed = await studioEnsureFacebookPhotoPublish(env, record);
    return { ...pulsed, ap0, armed: [], plan, record };
  }
  if (plan.target === "AP0C" && pipelineStageBackend(env, "AP0C").mode === "python") {
    const pulsed = await studioEnsureInstagramCarouselPublish(env, record);
    return { ...pulsed, ap0, armed: [], plan, record };
  }
  const armed = await studioArmPublishScenarios(env, plan.target);
  const settings = await studioActivePipelineSettings(env, [plan.setting, plan.poll].filter(Boolean));
  const pulsed = await studioPulseMakeWebhook(env, settings[plan.setting], record.id, plan.target, {
    caption: String(f(record, "Output_Caption") || "").trim(),
    hashtags: String(f(record, "Output_Hashtags") || "").trim(),
  });
  return { ...pulsed, ap0, armed, plan, settings, record };
}
/*__STUDIO_WORKER_END:studioDispatchApprovedPublishNow__*/

export async function studioDispatchApprovedPublishTail(env, record, primary) {
  const plan = primary?.plan;
  if (!plan || plan.graphStory || plan.graphFeedPhoto || primary?.backend === "python") return null;
  if (plan.poll) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const pollTarget = plan.poll.replace(/_WEBHOOK_URL$/, "").replace(/_/g, "-");
    await studioPulseMakeWebhook(env, primary.settings?.[plan.poll], record.id, pollTarget);
  }
  if (!STUDIO_PUBLISH_DISPATCH_SCENARIOS[plan.target]?.orchestrator) return null;
  // Let the webhook scenario finish staging before the orchestrator looks for its work.
  await new Promise((resolve) => setTimeout(resolve, 10000));
  return studioRunPublishOrchestrator(env, plan.target);
}
/*__STUDIO_WORKER_END:studioDispatchApprovedPublishTail__*/

export function studioPublishDispatchNote(result) {
  if (!result) return "no result";
  if (result.accepted) return `accepted: ${result.target || result.plan?.target || "graph"}`;
  if (result.skipped) return `skipped: ${result.skipped}`;
  const armed = (result.armed || []).map((row) => `${row.id}${row.ok ? "" : "!"}`).join(",");
  return [
    `target=${result.target || result.plan?.target || "?"}`,
    result.ok ? `webhook=ok ${result.status || result.permalink || ""}`.trim() : `webhook=FAILED ${result.status || result.error || ""}`.trim(),
    armed ? `armed=${armed}` : "",
    result.ap0 ? `ap0=${result.ap0.skipped || (result.ap0.ok ? "ok" : "failed")}` : "",
  ].filter(Boolean).join(" | ");
}
/*__STUDIO_WORKER_END:studioPublishDispatchNote__*/

export async function studioStampPublishDispatch(env, record, note) {
  const id = String(record?.id || "").trim();
  if (!id) return;
  const count = Number(f(record, "Studio_Publish_Dispatch_Count") || 0) + 1;
  try {
    await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Studio_Publish_Dispatch_At: new Date().toISOString(),
          Studio_Publish_Dispatch_Count: count,
          Studio_Publish_Dispatch_Note: String(note || "").slice(0, 900),
        },
        typecast: true,
      }),
    });
  } catch (error) {
    console.warn("publish dispatch receipt write failed", id, error);
  }
}
/*__STUDIO_WORKER_END:studioStampPublishDispatch__*/

export async function studioDispatchApprovedPublishAndSchedule(ctx, env, record) {
  if (!studioPublishCanDispatchNow(record)) {
    const heldUntil = studioPublishHeldUntilIso(record);
    await studioStampPublishDispatch(env, record, `held until ${heldUntil || "scheduled time"}`);
    return { ok: true, skipped: "scheduled-hold", held_until: heldUntil, record };
  }
  const plan = studioPublishDispatchTarget(record);
  // Graph stills (Drive → R2 → Instagram) can OOM or abort the isolate. Finish
  // the Approve HTTP response first so Studio/E2E are not killed with the publish.
  if (plan?.graphFeedPhoto && ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil((async () => {
      try {
        const primary = await studioDispatchApprovedPublishNow(env, record);
        await studioStampPublishDispatch(env, record, studioPublishDispatchNote(primary));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("studio publish dispatch failed", record?.id, error);
        await studioStampPublishDispatch(env, record, `dispatch failed: ${message}`);
      }
    })());
    return { ok: true, accepted: true, target: plan.target, plan };
  }
  let primary;
  try {
    primary = await studioDispatchApprovedPublishNow(env, record);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("studio publish dispatch failed", record?.id, error);
    await studioStampPublishDispatch(env, record, `dispatch failed: ${message}`);
    return { ok: false, error: message };
  }
  await studioStampPublishDispatch(env, record, studioPublishDispatchNote(primary));
  const tail = studioDispatchApprovedPublishTail(env, record, primary).catch((error) => {
    console.warn("studio publish dispatch tail failed", record?.id, error);
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(tail);
  return primary;
}
/*__STUDIO_WORKER_END:studioDispatchApprovedPublishAndSchedule__*/

export async function studioResetYoutubeUploadForRetry(env, record) {
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        YouTube_Stage: "YT1",
        YouTube_Upload_Job_ID: "",
        YouTube_Upload_Status: "Not Started",
        YouTube_Upload_Progress_Percent: 0,
        YouTube_Error_Message: "",
        YouTube_Response_JSON: "",
        Publish_Status: "Ready to Publish",
        Publish_Error_Stage: "",
        Publish_Error_Message: "",
        Publish_Retry_Eligible: true,
        YouTube_Package_Status: "Ready",
        YouTube_Scheduled_Publish_At: null,
      },
      typecast: true,
    }),
  });
}
/*__STUDIO_WORKER_END:studioResetYoutubeUploadForRetry__*/

export async function studioHealFailedYoutubeSourceDownloads(env, options = {}) {
  const limit = Number(options.limit || 3);
  const recordId = String(options.recordId || "").trim();
  const formula = recordId
    ? `AND(RECORD_ID()="${recordId}",${YOUTUBE_PRIVATE_SOURCE_HEAL_INNER})`
    : `AND({Test_Run_ID}=BLANK(),{Platform}="YouTube",{Do_Not_Publish}=0,${YOUTUBE_PRIVATE_SOURCE_HEAL_INNER})`;
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit, filterFormula: formula });
  } catch (error) {
    console.warn("youtube source-download heal scan failed", error);
    return [];
  }
  const results = [];
  for (const row of rows) {
    if (!studioYoutubeFailedPrivateSource(row)) continue;
    try {
      let publicUrl = studioYoutubePublicSourceUrl(row);
      let stagedVia = publicUrl ? "existing_public_url" : "";
      if (!publicUrl) {
        const staged = await studioStageYoutubePublicMp4FromDrive(env, row);
        if (staged.url) {
          publicUrl = staged.url;
          stagedVia = "worker_drive_mpu";
        } else {
          await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
            method: "PATCH",
            body: JSON.stringify({
              fields: {
                Publish_Status: "Ready to Publish",
                Publish_Retry_Eligible: true,
                YouTube_Upload_Job_ID: "",
              },
              typecast: true,
            }),
          }).catch(() => null);
          const ap0 = await studioPulseAp0PublicAsset(env, row);
          const afterAp0 = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id).catch(() => row);
          publicUrl = studioYoutubePublicSourceUrl(afterAp0);
          stagedVia = "ap0";
          if (!publicUrl) {
            results.push({
              id: row.id,
              stage: "ap0",
              ok: ap0?.ok !== false,
              skipped: ap0?.skipped || staged.skip || false,
              healed: "waiting_public_url",
              worker_skip: staged.skip || "",
            });
            continue;
          }
        }
      }
      await studioResetYoutubeUploadForRetry(env, row);
      const refreshed = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id);
      const pulsed = await studioPulseYtRecord(env, "ytp1", "YTP1", refreshed);
      results.push({
        id: row.id,
        stage: "ytp1",
        ok: pulsed?.ok !== false,
        skipped: pulsed?.skipped || false,
        healed: "source-download-401",
        staged_via: stagedVia,
        public_url: publicUrl,
        ytp1: pulsed,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("youtube source-download heal failed", row.id, error);
      results.push({ id: row.id, stage: "heal", error: message });
    }
  }
  return results;
}

/*__STUDIO_WORKER_END:studioHealFailedYoutubeSourceDownloads__*/

export async function studioParkStaleYoutubeQuotaPolls(env, options = {}) {
  const limit = Number(options.limit || 5);
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: YOUTUBE_STALE_QUOTA_POLL_HEAL_FORMULA,
    });
  } catch (error) {
    console.warn("youtube stale quota-poll park scan failed", error);
    return [];
  }
  const results = [];
  for (const row of rows) {
    try {
      const videoId = String(f(row, "YouTube_Video_ID") || "").trim();
      const stage = String(f(row, "Publish_Error_Stage") || "").trim() || "YTS2_QUOTA";
      const youtubeMessage = String(f(row, "YouTube_Error_Message") || f(row, "Publish_Error_Message") || "").trim();
      const liveQuota = Boolean(videoId)
        && (youtubeLiveQuotaOnly(row.fields || row) || /yts2_quota|yts2_thumbnail|yts2_poll|thumbnail|quota/i.test(stage));
      const errorStage = liveQuota
        ? (/yts2_thumbnail|thumbnail/i.test(stage) ? "YTS2_THUMBNAIL" : "YTS2_QUOTA")
        : /ytp1/i.test(stage) ? "YTP1" : /yts1/i.test(stage) ? "YTS1_QUOTA" : "YTS2_QUOTA";
      const fields = liveQuota
        ? youtubeCoverQuotaParkFields({ errorStage, youtubeMessage })
        : manualPublishRequiredFields({
          errorStage,
          publishMessage: "YouTube API quota exhausted. Manual publish required until the next automatic retry after Pacific midnight.",
          youtubeMessage,
          youtubeStage: videoId ? "YT2" : "YT1",
          uploadStatus: videoId ? "Uploaded" : "Failed",
        });
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
      results.push({
        id: row.id,
        stage: liveQuota ? "cover_quota_park" : "manual_publish_park",
        error_stage: errorStage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("youtube stale quota-poll park failed", row.id, error);
      results.push({ id: row.id, stage: "manual_publish_park", error: message });
    }
  }
  return results;
}

/*__STUDIO_WORKER_END:studioParkStaleYoutubeQuotaPolls__*/
