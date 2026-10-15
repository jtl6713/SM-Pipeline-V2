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

// Route handlers and helpers live in smaller source modules.
import {
  studioCronAirtableCadence,
  accessIdentity,
  resolveAuthorization,
  requireConfig,
  corsPreflight,
  respond,
  assertWriteRequest,
  assertOriginWriteRequest,
  assertUploadWriteRequest,
  requirePermission,
  requireAnyPermission,
  sleepMs,
  airtableCooldownWaitMs,
  airtableRetryDelayMs,
  studioInvalidateHotReads,
  f,
  brandLogo,
  listIdeas,
  listStudioContentProfiles,
  studioProfileOnboardingHandlers,
  listStudioProfileSetups,
  createStudioProfileSetup,
  getStudioProfileSetup,
  patchStudioProfileSetup,
  updateStudioProfileSetupPlatform,
  activateStudioProfileSetup,
  createIdea,
  updateIdea,
  holdIdea,
  restoreIdea,
  deleteIdea,
  listProductionRequestOutputs,
  syncProductionRequestOutputs,
  getProductionRequestOutput,
  updateProductionRequestOutput,
  publicChicagoShiningWatermark,
  getItem4MasterAssets,
  createItem4LargeVideoUploadSession,
  uploadItem4LargeVideoPart,
  completeItem4LargeVideoUploadSession,
  abortItem4LargeVideoUploadSession,
  uploadItem4MasterAssets,
  reorderItem4MasterAssets,
  deleteItem4MasterAsset,
  uploadItem4ClipPoster,
  ideaLibraryHasToken,
  getMediaLibraryStills,
  getIdeaLibrarySuggestions,
  attachItem4LibraryAssets,
  studioHealRfrMissingDeliverable,
  buildItem4OutputPlan,
  getItem4OutputPlan,
  studioFacebookGraphPublishHeld,
  syncMiamiTikTokPipelineSecret,
  cadenceScenarioManagedByPython,
  opsForceAzNavyPierTitle,
  resumeAzFinishedVideoRequests,
  enqueueStudioProductionJob,
  studioOutputProductionRequestId,
  startOrphanedStudioProductionJobs,
  resumeStaleStudioProductionJobs,
  healStuckStudioRenders,
  studioHealNativePhotoReviewStrands,
  studioHealAwaitingApprovalStaleRfr,
  studioHealPhantomRerender,
  studioHealFailedStatuses,
  studioHealIgCarouselTooManyChildren,
  studioHealIgCarouselChildVerificationRace,
  studioHealIgCarouselChildPollFailure,
  studioHealIgCarouselRateLimit,
} from "./worker-functions-01.mjs";
import {
  studioHealEscalatedProduce,
  item4PulsePipelineStage,
  handleRr2ReviewDecision,
  item4DrainAllPendingWork,
  prepareItem4Variants,
  getItem4Variants,
  item4HealTimelineAutoPrepare,
  item4HealIncompletePreparingVariants,
  getItem4WorkspaceStatus,
  getOrCreateProductionRequestForIdea,
  createProductionRequestFromBody,
  listProductionRequests,
  getProductionRequest,
  updateProductionRequest,
  productionRequestBridgePreflightRoute,
  productionRequestPromotionRecordIdFromPath,
  applyPromotedTimedScriptRoute,
  syncProductionRequestDirectivesRoute,
  generateItem4PreProductionAiMaster,
  studioRecomputeInsightsLearned,
  getInsightsWatchlist,
  putInsightsWatchlist,
  getInsightsConnections,
  getInsightsPosts,
  postInsightsChat,
  getInsightsBestTimes,
  getInsightsCaptions,
  getInsightsSimilarTimes,
  postInsightsSimilarTimesSweep,
  studioSweepPublishedInsights,
  studioDiscoverYoutubeChicagoCreators,
  postInsightsDiscover,
  engagementDeps,
  getEngagementSettings,
  putEngagementSettings,
  postEngagementDiscover,
  getEngagementRecommendations,
  postEngagementAction,
  getEngagementInsights,
  promoteProductionRequestViaI3I4,
  promoteIdeaViaI3I4,
  ideaPhotoListeningSessionRoute,
  getAuthorizedIdeaRoute,
  autoListenOpenPhotoIdeas,
  watchIdeaPhotosRoute,
  matchIdeaPhotosRoute,
  proposeScriptedShortRoute,
  acceptScriptedShortRoute,
  planVibeCutRoute,
  anotherVibeCutRoute,
  createIdeaTimedScriptRoute,
} from "./worker-functions-02.mjs";
import {
  runWaitingIdeaPhotoMatches,
  listContent,
  listOutputScheduleGrid,
  readStudioSupabaseSyncLast,
  studioSyncSupabasePipelineReads,
  getStudioSupabaseSyncStatus,
  postStudioSupabaseSync,
  warmOldestStudioReadSnapshot,
  listOutputs,
  listMusic,
  toggleMusicFavorite,
  deleteMusicLibraryTrack,
  uploadMusicLibraryTracks,
  listAssetLibrary,
  uploadAssetLibraryItems,
  assignLibraryAssetProfile,
  classifyAllLibraryAssets,
  renameAssetLibraryItem,
  deleteAssetLibraryItem,
  patchAssetLibraryDuration,
  releasePublishedLibraryFile,
  studioSweepPostPublishMediaRelease,
  musicPreview,
  item4RecoverStaleR2BaselineReads,
  deferItem4MakeHardening,
  item4EnsureR2StudioExactSourceGuard,
  item4EnsureP3StudioSourceAuthority,
  item4EnsureP3SingleParentRoute,
  mediaAssetImagePreview,
  mediaAssetVideoStream,
  outputPreview,
  listPhase6Voices,
  phase6VoicePreview,
  getOutputCreative,
  updateOutputCreative,
  phase6RestoreProductionReviewReady,
  getOutputCreativeHandoffStatus,
  continueOutputCreativeHandoff,
  cadenceScheduleSync,
  studioHealPromotedMissingFanout,
  continueParkedProductionAfterPromote,
  cadenceRepairInProgress,
  cadenceHasRenderWork,
  studioFirstLinkedId,
  advanceStudioProductionOutputs,
  pulseOnDemandRenderChain,
  pulseOnDemandPublishChain,
  pulseOnDemandMediaChain,
  pulseOnDemandCarouselChain,
  pulseOnDemandR2B,
  pulseOnDemandMakeAdminBridge,
  handleR5DoneCallback,
  cadenceHasPublishWork,
  cadenceSetActive,
  studioTiktokComplete,
} from "./worker-functions-03.mjs";
import {
  healStaleManualFlagsOnPublishedRecord,
  healYoutubeManualWithLiveVideoRecord,
  studioReconcileYoutubePublishes,
  studioReconcileTiktokDrafts,
  studioReconcileFacebookPhotos,
  studioReconcileInstagramCarousels,
  studioReconcileOverdueScheduledPublishes,
  studioHealApprovedMissingSchedule,
  studioHealStoryCompanionDrift,
  studioReconcileApprovedPublishes,
  studioReconcileFacebookVideoCovers,
  studioReconcilePublishingInstagramStories,
  studioReconcilePublishingInstagramReels,
  studioReconcileFacebookSlideshows,
  studioReconcileFacebookReels,
  startScheduleRegenJob,
  getScheduleRegenJobStatus,
  getStudioScheduleSettings,
  putStudioScheduleSettings,
  getApproveAllJobStatus,
  studioResumeApproveAllJobs,
  approveAllOutputsForPublishing,
  reviewOutputCreative,
  getRecordRoute,
  getOutputRoute,
  readStudioProfilesOverviewSnapshot,
  refreshStudioProfilesOverviewSnapshot,
  profilesOverview,
  dashboard,
  adminRepairControlStatus,
  adminRepairControl,
  adminMakeDeployPage,
  adminMakeDeploy,
  startStudioIdeaGeneration,
  studioIdeaGenerationStatus,
  chicagoNowParts,
  getStudioDeskInventory,
  getStudioDeskActivity,
  getStudioAiApiStatus,
  patchStudioAiApiPreference,
  patchStudioDeskMode,
  patchLibraryCrossScope,
  getStudioCompressionStatus,
  getStudioOperationsQueue,
  getFactoryDesk,
  mutateFactoryDesk,
  pauseStudioOperationsQueueItem,
  reorderStudioOperationsRenderQueue,
  prepareIdeaToReview,
  getStudioOperations,
  getStudioOperationsProfiles,
  patchStudioOperationsProfile,
  studioHealAutonomousRevisionLock,
  runStudioAutonomousProduce,
  runStudioDailyIdeas,
  kickStudioOutputPublish,
  scheduleStudioPublishOutput,
  markStudioYoutubeComplete,
  markStudioTiktokComplete,
  resendStudioTiktokDraft,
  markStudioOutputPublished,
  pulseA1SForDriveFile,
  pulseM1ResetRenderUrls,
  pulseR2BRetryAssetSelection,
  pulseMakeAdminBridgeQueue,
  pulseAudioLeadingSilence,
  pulseStudioLibraryIntake,
  getStudioLibraryIntakeStatus,
} from "./worker-functions-04.mjs";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=UTF-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const STUDIO_DEFAULT_MUSIC_VOLUME = 0.6;
const STUDIO_DEFAULT_DUCKED_MUSIC_VOLUME = 0.0504;

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return corsPreflight(request, env);
      }

      const isMusicPreviewRoute = /^\/api\/music\/rec[A-Za-z0-9]+\/preview$/.test(url.pathname);
      const isVoicePreviewRoute = /^\/api\/voices\/[A-Za-z0-9_-]+\/preview$/.test(url.pathname);
      const isMediaAssetPreviewRoute = /^\/api\/media-assets\/rec[A-Za-z0-9]+\/preview$/.test(url.pathname);
      const isMediaAssetStreamRoute = /^\/api\/media-assets\/rec[A-Za-z0-9]+\/stream$/.test(url.pathname);
      const isPublicBrandWatermarkRoute = url.pathname === "/api/public/branding/watermark.png";
      const isMediaLibraryStillsRoute = url.pathname === "/api/media-assets/library-stills";
      const isIdeaRecordRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isIdeaHoldRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/hold$/.test(url.pathname);
      const isIdeaRestoreRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/restore$/.test(url.pathname);
      const isIdeaPromoteRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/promote$/.test(url.pathname);
      const isIdeaWatchPhotosRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/watch-photos$/.test(url.pathname);
      const isIdeaPhotoListeningSessionRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/photo-listening-session$/.test(url.pathname);
      const isIdeaMatchPhotosRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/match-photos$/.test(url.pathname);
      const isIdeaTimedScriptRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/timed-script$/.test(url.pathname);
      const isVibeCutPlanRoute = url.pathname === "/api/vibe-cut/plan";
      const isVibeCutAnotherRoute = url.pathname === "/api/vibe-cut/another";
      const isIdeaLibrarySuggestionsRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/library-suggestions$/.test(url.pathname);
      const isIdeaProductionRequestRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/production-request$/.test(url.pathname);
      const isIdeaGenerateRoute = url.pathname === "/api/ideas/generate";
      const isScriptedShortProposeRoute = url.pathname === "/api/scripted-short/propose";
      const isScriptedShortAcceptRoute = url.pathname === "/api/scripted-short/accept";
      const isIdeaGenerateStatusRoute = /^\/api\/ideas\/generate\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isProductionRequestRecordRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isProductionRequestPromoteRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/promote$/.test(url.pathname);
      const isProductionRequestBridgePreflightRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/bridge-preflight$/.test(url.pathname);
      const isProductionRequestSyncDirectivesRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/sync-directives$/.test(url.pathname);
      const isProductionRequestTimedScriptRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/timed-script$/.test(url.pathname);
      const isProductionRequestCollectionRoute = url.pathname === "/api/production-requests";
      const isProductionRequestOutputsRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/outputs$/.test(url.pathname);
      const isProductionRequestAiMastersRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/generate-ai-masters$/.test(url.pathname);
      const isItem4AssetsRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets$/.test(url.pathname);
      const isItem4LibraryAssetsRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/library$/.test(url.pathname);
      const isItem4AssetsReorderRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/reorder$/.test(url.pathname);
      const isItem4UploadSessionRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/upload-session$/.test(url.pathname);
      const isItem4UploadSessionPartRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/upload-session\/[A-Za-z0-9_-]+\/parts\/\d+$/.test(url.pathname);
      const isItem4UploadSessionCompleteRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/upload-session\/[A-Za-z0-9_-]+\/complete$/.test(url.pathname);
      const isItem4UploadSessionAbortRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/upload-session\/[A-Za-z0-9_-]+$/.test(url.pathname)
        && !isItem4UploadSessionPartRoute
        && !isItem4UploadSessionCompleteRoute;
      const isItem4AssetPosterRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/[A-Za-z0-9_-]+\/poster$/.test(url.pathname);
      const isItem4AssetRecordRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/[A-Za-z0-9_-]+$/.test(url.pathname)
        && !isItem4LibraryAssetsRoute
        && !isItem4AssetsReorderRoute
        && !isItem4AssetPosterRoute
        && !isItem4UploadSessionRoute
        && !isItem4UploadSessionAbortRoute;
      const isItem4PlanRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/plan$/.test(url.pathname);
      const isItem4StatusRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/item4$/.test(url.pathname);
      const isItem4VariantsRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/variants$/.test(url.pathname);
      const isProductionRequestOutputRecordRoute = /^\/api\/production-request-outputs\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isOutputPreviewRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/preview$/.test(url.pathname);
      const isOutputScheduleGridRoute = url.pathname === "/api/outputs/schedule-grid";
      const isOutputCreativeRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/creative$/.test(url.pathname);
      const isOutputCreativeReviewRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/creative\/review$/.test(url.pathname);
      const isOutputApproveAllRoute = url.pathname === "/api/outputs/approve-all";
      const isScheduleRegenRoute = url.pathname === "/api/outputs/schedule-regen";
      const isScheduleSettingsRoute = url.pathname === "/api/operations/schedule-settings";
      const isOutputTiktokCompleteRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/tiktok-complete$/.test(url.pathname);
      const isOutputTiktokResendRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/tiktok-resend$/.test(url.pathname);
      const isOutputYoutubeCompleteRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/youtube-complete$/.test(url.pathname);
      const isOutputCreativeContinueRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/creative\/render\/continue$/.test(url.pathname);
      const isOutputCreativeHandoffStatusRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/creative\/handoff\/status$/.test(url.pathname);
      const isAdminMakeDeployRoute = url.pathname === "/api/admin/make-deploy";
      const isAdminFbPublicDiagnosticRoute = url.pathname === "/api/admin/fb-public-diagnostic";
      const isAdminRepairControlRoute = url.pathname === "/api/admin/repair/control";
      const isOperationsRoute = url.pathname === "/api/operations";
      const isOperationsProfilesListRoute = url.pathname === "/api/operations/profiles";
      const isOperationsQueueRoute = url.pathname === "/api/operations/queue";
      const isOperationsQueuePauseRoute = url.pathname === "/api/operations/queue/pause";
      const isOperationsQueueReorderRoute = url.pathname === "/api/operations/queue/reorder";
      const isFactoryDeskRoute = url.pathname === "/api/factory/desk";
      const isOperationsProfileRoute = /^\/api\/operations\/profiles\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isIdeaPrepareToReviewRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/prepare-to-review$/.test(url.pathname);
      const isProfileSetupRoute = /^\/api\/profiles\/rec[A-Za-z0-9]+\/setup$/.test(url.pathname);
      const isProfilePlatformValidateRoute = /^\/api\/profiles\/rec[A-Za-z0-9]+\/platforms\/(instagram|tiktok|youtube|facebook)\/validate$/.test(url.pathname);
      const isOperationsDailyIdeasRoute = url.pathname === "/api/operations/ideas/run-daily";
      const isOperationsAutonomousRoute = url.pathname === "/api/operations/ideas/run-autonomous";
      const isOperationsOutputScheduleRoute = /^\/api\/operations\/outputs\/rec[A-Za-z0-9]+\/schedule$/.test(url.pathname);
      const isOperationsOutputPublishedRoute = /^\/api\/operations\/outputs\/rec[A-Za-z0-9]+\/published$/.test(url.pathname);
      const isOperationsOutputPublishKickRoute = /^\/api\/operations\/outputs\/rec[A-Za-z0-9]+\/publish-kick$/.test(url.pathname);
      const isOperationsCompressRoute = url.pathname === "/api/operations/compress";
      const isOperationsCompressionStatusRoute = url.pathname === "/api/operations/compression";
      const isOpsAzNavyPierKickRoute = url.pathname === "/api/ops/az-navy-pier-kick";
      const isOpsMiamiTikTokSecretRoute = url.pathname === "/api/ops/tiktok/miami/pipeline-secret";
      const isOpsDeskInventoryRoute = url.pathname === "/api/ops/desk/inventory";
      const isOpsDeskActivityRoute = url.pathname === "/api/ops/desk/activity";
      const isOpsDeskModeRoute = url.pathname === "/api/ops/desk/mode";
      const isOpsSupabaseSyncRoute = url.pathname === "/api/ops/supabase/sync";
      const isAiApiRoute = url.pathname === "/api/ai-api";
      const isOpsLibraryCrossScopeRoute = url.pathname === "/api/ops/library/cross-scope";
      const isOperationsResetRenderUrlsRoute = url.pathname === "/api/operations/reset-render-urls";
      const isOperationsRetryAssetSelectionRoute = url.pathname === "/api/operations/retry-asset-selection";
      const isOperationsMakeAdminBridgeRoute = url.pathname === "/api/operations/make-admin-bridge";
      const isOperationsIntakeRoute = url.pathname === "/api/operations/intake";
      const isOperationsAudioLeadingSilenceRoute = url.pathname === "/api/operations/audio-leading-silence";
      const isProfileSetupCollectionRoute = url.pathname === "/api/profile-setup";
      const isProfileSetupRecordRoute = /^\/api\/profile-setup\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isProfileSetupPlatformRoute = /^\/api\/profile-setup\/rec[A-Za-z0-9]+\/platform\/(instagram|facebook|youtube|tiktok)$/.test(url.pathname);
      const isProfileSetupActivateRoute = /^\/api\/profile-setup\/rec[A-Za-z0-9]+\/activate$/.test(url.pathname);
      const isInsightsBestTimesRoute = url.pathname === "/api/insights/best-times";
      const isInsightsSimilarTimesRoute = url.pathname === "/api/insights/similar-times";
      const isInsightsCaptionsRoute = url.pathname === "/api/insights/captions";
      const isInsightsDiscoverRoute = url.pathname === "/api/insights/discover";
      const isInsightsWatchlistRoute = url.pathname === "/api/insights/watchlist";
      const isInsightsChatRoute = url.pathname === "/api/insights/chat";
      const isInsightsPostsRoute = url.pathname === "/api/insights/posts";
      const isInsightsConnectionsRoute = url.pathname === "/api/insights/connections";
      const isEngagementCapabilitiesRoute = url.pathname === "/api/engagement/capabilities";
      const isEngagementSettingsRoute = url.pathname === "/api/engagement/settings";
      const isEngagementDiscoverRoute = url.pathname === "/api/engagement/discover";
      const isEngagementRecommendationsRoute = url.pathname === "/api/engagement/recommendations";
      const isEngagementActionsRoute = url.pathname === "/api/engagement/actions";
      const isEngagementInsightsRoute = url.pathname === "/api/engagement/insights";
      const isEngagementHistoryRoute = url.pathname === "/api/engagement/history";
      const isR5DoneHookRoute = url.pathname === "/api/hooks/r5-done";
      const isRr2HookRoute = url.pathname === "/api/hooks/rr2";
      const isVoiceCatalogRoute = url.pathname === "/api/voices";
      const isMusicLibraryRoute = url.pathname === "/api/music";
      const isMusicLibraryUploadWrite = isMusicLibraryRoute && request.method === "POST";
      const isMusicFavoriteRoute = /^\/api\/music\/rec[A-Za-z0-9]+\/favorite$/.test(url.pathname);
      const isMusicFavoriteWrite = isMusicFavoriteRoute && request.method === "PATCH";
      const isMusicRecordRoute = /^\/api\/music\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isMusicDeleteWrite = isMusicRecordRoute && request.method === "DELETE";
      const isAssetLibraryRoute = url.pathname === "/api/library";
      const isAssetLibraryUploadWrite = isAssetLibraryRoute && request.method === "POST";
      const isAssetLibraryRecordRoute = /^\/api\/library\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isAssetLibraryDeleteWrite = isAssetLibraryRecordRoute && request.method === "DELETE";
      const isAssetLibraryRenameWrite = isAssetLibraryRecordRoute && request.method === "PATCH";
      const isAssetLibraryProfileRoute = /^\/api\/library\/rec[A-Za-z0-9]+\/profile$/.test(url.pathname);
      const isAssetLibraryProfileWrite = isAssetLibraryProfileRoute && request.method === "POST";
      const isAssetLibraryClassifyAllWrite = url.pathname === "/api/library/classify-all" && request.method === "POST";
      const isAssetLibraryDurationRoute = /^\/api\/library\/rec[A-Za-z0-9]+\/duration$/.test(url.pathname);
      const isAssetLibraryDurationWrite = isAssetLibraryDurationRoute && request.method === "POST";
      const isPublishedLibraryReleaseRoute = /^\/api\/library\/published\/rec[A-Za-z0-9]+\/release-file$/.test(url.pathname);
      const isPublishedLibraryReleaseWrite = isPublishedLibraryReleaseRoute && request.method === "POST";
      const isIdeaCreateRoute = url.pathname === "/api/ideas" && request.method === "POST";
      const isIdeaGenerateWrite = isIdeaGenerateRoute && request.method === "POST";
      const isScriptedShortProposeWrite = isScriptedShortProposeRoute && request.method === "POST";
      const isScriptedShortAcceptWrite = isScriptedShortAcceptRoute && request.method === "POST";
      const isIdeaEditRoute = isIdeaRecordRoute && request.method === "PATCH";
      const isIdeaDeleteRoute = isIdeaRecordRoute && request.method === "DELETE";
      const isIdeaHoldWrite = (isIdeaHoldRoute || isIdeaRestoreRoute) && request.method === "POST";
      const isIdeaPromoteWrite = isIdeaPromoteRoute && request.method === "POST";
      const isIdeaPrepareToReviewWrite = isIdeaPrepareToReviewRoute && request.method === "POST";
      const isOperationsQueuePauseWrite = isOperationsQueuePauseRoute && request.method === "POST";
      const isOperationsQueueReorderWrite = isOperationsQueueReorderRoute && request.method === "POST";
      const isFactoryDeskWrite = isFactoryDeskRoute && request.method === "POST";
      const isIdeaWatchPhotosWrite = isIdeaWatchPhotosRoute && request.method === "POST";
      const isIdeaPhotoListeningSessionWrite = isIdeaPhotoListeningSessionRoute && request.method === "POST";
      const isIdeaMatchPhotosWrite = isIdeaMatchPhotosRoute && request.method === "POST";
      const isIdeaTimedScriptWrite = isIdeaTimedScriptRoute && request.method === "POST";
      const isProductionRequestCreateWrite =
        (isIdeaProductionRequestRoute || isProductionRequestCollectionRoute) && request.method === "POST";
      const isProductionRequestEditWrite = isProductionRequestRecordRoute && request.method === "PATCH";
      const isProductionRequestPromoteWrite = isProductionRequestPromoteRoute && request.method === "POST";
      const isProductionRequestSyncDirectivesWrite = isProductionRequestSyncDirectivesRoute && request.method === "POST";
      const isProductionRequestTimedScriptWrite = isProductionRequestTimedScriptRoute && request.method === "POST";
      const isProductionRequestOutputsSyncWrite = isProductionRequestOutputsRoute && request.method === "PUT";
      const isItem4AssetsUploadWrite = isItem4AssetsRoute && request.method === "POST";
      const isItem4LibraryAssetsWrite = isItem4LibraryAssetsRoute && request.method === "POST";
      const isItem4AssetsReorderWrite = isItem4AssetsReorderRoute && request.method === "POST";
      const isItem4UploadSessionWrite = isItem4UploadSessionRoute && request.method === "POST";
      const isItem4UploadSessionPartWrite = isItem4UploadSessionPartRoute && request.method === "PUT";
      const isItem4UploadSessionCompleteWrite = isItem4UploadSessionCompleteRoute && request.method === "POST";
      const isItem4UploadSessionAbortWrite = isItem4UploadSessionAbortRoute && request.method === "DELETE";
      const isItem4AssetDeleteWrite = isItem4AssetRecordRoute && request.method === "DELETE";
      const isItem4AssetPosterWrite = isItem4AssetPosterRoute && request.method === "POST";
      const isItem4PlanWrite = isItem4PlanRoute && request.method === "POST";
      const isItem4VariantsWrite = isItem4VariantsRoute && request.method === "POST";
      const isProductionRequestOutputEditWrite = isProductionRequestOutputRecordRoute && request.method === "PATCH";
      const isOutputCreativeEditWrite = isOutputCreativeRoute && request.method === "PATCH";
      const isOutputCreativeReviewWrite = isOutputCreativeReviewRoute && request.method === "POST";
      const isOutputApproveAllWrite = isOutputApproveAllRoute && request.method === "POST";
      const isOutputTiktokCompleteWrite = isOutputTiktokCompleteRoute && request.method === "POST";
      const isOutputTiktokResendWrite = isOutputTiktokResendRoute && request.method === "POST";
      const isOutputYoutubeCompleteWrite = isOutputYoutubeCompleteRoute && request.method === "POST";
      const isOutputCreativeContinueWrite = isOutputCreativeContinueRoute && request.method === "POST";
      const isAdminMakeDeployWrite = isAdminMakeDeployRoute && request.method === "POST";
      const isAdminRepairControlWrite = isAdminRepairControlRoute && request.method === "POST";
      const isOperationsProfileWrite = isOperationsProfileRoute && request.method === "PATCH";
      const isOperationsDailyIdeasWrite = isOperationsDailyIdeasRoute && request.method === "POST";
      const isOperationsAutonomousWrite = isOperationsAutonomousRoute && request.method === "POST";
      const isOperationsOutputScheduleWrite = isOperationsOutputScheduleRoute && request.method === "POST";
      const isOperationsOutputPublishedWrite = isOperationsOutputPublishedRoute && request.method === "POST";
      const isOperationsOutputPublishKickWrite = isOperationsOutputPublishKickRoute && request.method === "POST";
      const isOperationsCompressWrite = isOperationsCompressRoute && request.method === "POST";
      const isOpsAzNavyPierKickWrite = isOpsAzNavyPierKickRoute && request.method === "POST";
      const isOpsMiamiTikTokSecretWrite = isOpsMiamiTikTokSecretRoute && request.method === "POST";
      const isOpsDeskModeWrite = isOpsDeskModeRoute && request.method === "PATCH";
      const isOpsSupabaseSyncWrite = isOpsSupabaseSyncRoute && request.method === "POST";
      const isAiApiWrite = isAiApiRoute && request.method === "PATCH";
      const isOperationsResetRenderUrlsWrite = isOperationsResetRenderUrlsRoute && request.method === "POST";
      const isOperationsRetryAssetSelectionWrite = isOperationsRetryAssetSelectionRoute && request.method === "POST";
      const isOperationsMakeAdminBridgeWrite = isOperationsMakeAdminBridgeRoute && request.method === "POST";
      const isOperationsIntakeWrite = isOperationsIntakeRoute && request.method === "POST";
      const isOperationsAudioLeadingSilenceWrite = isOperationsAudioLeadingSilenceRoute && request.method === "POST";
      const isInsightsWatchlistWrite = isInsightsWatchlistRoute && (request.method === "POST" || request.method === "PATCH");
      const isInsightsSimilarTimesWrite = isInsightsSimilarTimesRoute && request.method === "POST";
      const isInsightsDiscoverWrite = isInsightsDiscoverRoute && request.method === "POST";
      const isInsightsChatWrite = isInsightsChatRoute && request.method === "POST";
      const isEngagementSettingsWrite = isEngagementSettingsRoute && (request.method === "POST" || request.method === "PATCH");
      const isEngagementDiscoverWrite = isEngagementDiscoverRoute && request.method === "POST";
      const isEngagementActionsWrite = isEngagementActionsRoute && request.method === "POST";
      const allowedMethod =
        request.method === "GET" ||
        (request.method === "HEAD" && (isMusicPreviewRoute || isMediaAssetPreviewRoute || isMediaAssetStreamRoute || isPublicBrandWatermarkRoute || isOutputPreviewRoute || isVoicePreviewRoute)) ||
        isIdeaCreateRoute ||
        isIdeaGenerateWrite ||
        isScriptedShortProposeWrite ||
        isScriptedShortAcceptWrite ||
        isIdeaEditRoute ||
        isIdeaDeleteRoute ||
        isIdeaHoldWrite ||
        isIdeaPromoteWrite ||
        isIdeaPrepareToReviewWrite ||
        isIdeaWatchPhotosWrite ||
        isIdeaPhotoListeningSessionWrite ||
        isIdeaMatchPhotosWrite ||
        isIdeaTimedScriptWrite ||
        isProductionRequestCreateWrite ||
        isProductionRequestEditWrite ||
        isProductionRequestPromoteWrite ||
        isProductionRequestSyncDirectivesWrite ||
        isProductionRequestTimedScriptWrite ||
        isProductionRequestOutputsSyncWrite ||
        isItem4AssetsUploadWrite ||
        isItem4LibraryAssetsWrite ||
        isItem4AssetsReorderWrite ||
        isItem4UploadSessionWrite ||
        isItem4UploadSessionPartWrite ||
        isItem4UploadSessionCompleteWrite ||
        isItem4UploadSessionAbortWrite ||
        isMusicLibraryUploadWrite ||
        isMusicFavoriteWrite ||
        isMusicDeleteWrite ||
        isAssetLibraryUploadWrite ||
        isAssetLibraryDeleteWrite ||
        isAssetLibraryRenameWrite ||
        isAssetLibraryProfileWrite ||
        isAssetLibraryClassifyAllWrite ||
        isAssetLibraryDurationWrite ||
        isPublishedLibraryReleaseWrite ||
        (isProductionRequestAiMastersRoute && request.method === "POST") ||
        isItem4AssetDeleteWrite ||
        isItem4AssetPosterWrite ||
        isItem4PlanWrite ||
        isItem4VariantsWrite ||
        isProductionRequestOutputEditWrite ||
        isOutputCreativeEditWrite ||
        isOutputCreativeReviewWrite ||
        isOutputApproveAllWrite ||
        isOutputTiktokCompleteWrite ||
        isOutputTiktokResendWrite ||
        isOutputYoutubeCompleteWrite ||
        isOutputCreativeContinueWrite ||
        (isAdminMakeDeployRoute && request.method === "GET") ||
        (isAdminRepairControlRoute && request.method === "GET") ||
        isVoiceCatalogRoute ||
        isAdminMakeDeployWrite ||
        isAdminRepairControlWrite ||
        isOperationsProfileWrite ||
        isOperationsDailyIdeasWrite ||
        isOperationsAutonomousWrite ||
        isOperationsQueuePauseWrite ||
        isOperationsQueueReorderWrite ||
        isFactoryDeskWrite ||
        isOperationsOutputScheduleWrite ||
        isOperationsOutputPublishedWrite ||
        isOperationsOutputPublishKickWrite ||
        isOperationsCompressWrite ||
        isOpsAzNavyPierKickWrite ||
        isOpsMiamiTikTokSecretWrite ||
        isOpsDeskModeWrite ||
        isOpsSupabaseSyncWrite ||
        isAiApiWrite ||
        isOperationsResetRenderUrlsWrite ||
        isOperationsRetryAssetSelectionWrite ||
        isOperationsMakeAdminBridgeWrite ||
        isOperationsIntakeWrite ||
        isOperationsAudioLeadingSilenceWrite ||
        isInsightsWatchlistWrite ||
        isInsightsSimilarTimesWrite ||
        isInsightsDiscoverWrite ||
        isInsightsChatWrite ||
        (isInsightsPostsRoute && request.method === "GET") ||
        (isInsightsConnectionsRoute && request.method === "GET") ||
        (isInsightsBestTimesRoute && request.method === "GET") ||
        (isInsightsSimilarTimesRoute && request.method === "GET") ||
        (isInsightsCaptionsRoute && request.method === "GET") ||
        (isInsightsWatchlistRoute && request.method === "GET") ||
        isEngagementSettingsWrite ||
        isEngagementDiscoverWrite ||
        isEngagementActionsWrite ||
        (isEngagementCapabilitiesRoute && request.method === "GET") ||
        (isEngagementSettingsRoute && request.method === "GET") ||
        (isEngagementRecommendationsRoute && request.method === "GET") ||
        (isEngagementInsightsRoute && request.method === "GET") ||
        (isEngagementHistoryRoute && request.method === "GET") ||
        (isR5DoneHookRoute && request.method === "POST") ||
        (isRr2HookRoute && (request.method === "GET" || request.method === "POST"));
      if (!allowedMethod) {
        return respond(request, env, { ok: false, error: "Method not allowed in Phase 2A" }, 405);
      }

      if (url.pathname === "/api/hooks/r5-done") {
        requireConfig(env);
        return handleR5DoneCallback(request, env, ctx);
      }

      if (url.pathname === "/api/hooks/rr2") {
        requireConfig(env);
        return handleRr2ReviewDecision(request, env, url);
      }

      if (url.pathname === "/api/hooks/ttd4" || url.pathname === "/studio/tiktok/complete") {
        requireConfig(env);
        return studioTiktokComplete(request, env);
      }

      if (url.pathname === "/health" || url.pathname === "/api/health") {
        const supabaseSyncLast = await readStudioSupabaseSyncLast(env).catch(() => null);
        return respond(request, env, {
          ok: true,
          service: "chicagoshining-studio-api",
          version: "0.10.620-approve-all-fast-stamp",
          studio_supabase_pipeline_reads_v1: true,
          studio_supabase_sync_gate_v1: true,
          studio_supabase_phase3_stable_v1: true,
          studio_supabase_schedule_writethrough_v1: true,
          studio_supabase_approve_writethrough_v1: true,
          studio_read_source: studioReadSource(env),
          studio_supabase_configured: studioSupabaseConfigured(env),
          studio_supabase_read_routes: STUDIO_SUPABASE_PIPELINE_READ_ROUTES,
          studio_supabase_last_sync_at: supabaseSyncLast?.at || null,
          studio_supabase_last_sync_ok: supabaseSyncLast?.ok ?? null,
          studio_voiceover_once_v1: true,
          studio_factory_desk_v1: true,
          studio_factory_inflight_blocked_parent_v1: true,
          studio_factory_desk_actions_v1: true,
          studio_factory_desk_write_v1: true,
          studio_factory_desk_preview_v1: true,
          studio_create_vo_matched_stills_v1: true,
          studio_idea_library_typeahead_v1: true,
          studio_idea_library_search_all_hits_v1: true,
          studio_post_publish_release_v1: true,
          studio_render_server_preview_v1: true,
          studio_render_queue_wait_v1: true,
          studio_shared_render_queue_v1: true,
          studio_approve_all_batch_v1: true,
          studio_approve_all_enqueue_ids_v1: true,
          studio_home_overview_budget_v1: true,
          studio_engagement_v1: true,
          studio_mae_schedule_v1: true,
          studio_mae_horizon_days_v1: true,
          studio_mae_output_type_lanes_v1: true,
          studio_mae_30_day_schedule_v1: true,
          studio_mae_platform_spread_v1: true,
          studio_promotion_reconcile_after_handoff_error_v1: true,
          studio_mae_profile_occupancy_v1: true,
          studio_story_companion_schedule_v1: true,
          studio_schedule_occupancy_fields_v1: true,
          studio_schedule_regen_job_v1: true,
          studio_render_stale_rendering_v1: true,
          studio_phantom_rerender_v1: true,
          studio_desk_inventory_v1: true,
          studio_desk_activity_v1: true,
          studio_tiktok_complete_v1: true,
          studio_tiktok_draft_resend_v1: true,
          studio_pipeline_tiktok_open_fallback_v1: true,
          studio_youtube_complete_v1: true,
          studio_auto_compress_v1: true,
          studio_autonomous_produce_v1: true,
          studio_autonomous_scheduled_target_v1: true,
          studio_autonomous_scheduled_plus_awaiting_v1: true,
          studio_autonomous_open_ideas_cap_v1: true,
          studio_autonomous_hour_asset_drain_v1: true,
          studio_autonomous_ten_per_hour_v1: true,
          studio_autonomous_cron_minute_v1: true,
          studio_autonomous_hour_create_budget_v1: true,
          studio_autonomous_keep_picking_v1: true,
          studio_autonomous_ten_ideas_anyway_v1: true,
          studio_autonomous_music_variety_v1: true,
          studio_az_finished_video_v1: true,
          studio_az_auto_queue_v1: true,
          studio_az_large_video_staging_v1: true,
          studio_ig_carousel_due_publish_v1: true,
          studio_schedule_spacing_v1: true,
          studio_open_review_reschedule_v1: true,
          studio_yt_manual_schedule_lock_v1: true,
          studio_insights_watchlist_v2: true,
          studio_idea_library_pick_v1: true,
          studio_library_browse_v1: true,
          studio_library_rename_v1: true,
          studio_library_heic_preview_v1: true,
          studio_a3_heic_jpeg_v1: true,
          studio_intake_parked_heal_v1: true,
          studio_quality_agent_v1: true,
          studio_airtable_low_burn_cron_v1: true,
          studio_daily_ideas_1am_retry_v1: true,
          studio_idea_generate_stale_lock_v1: true,
          studio_airtable_burn_kill_v1: true,
          studio_airtable_queue_hang_fix_v1: true,
          studio_pipeline_review_filter_v1: true,
          studio_home_overview_lean_v1: true,
          studio_home_overview_cache_v1: true,
          studio_home_overview_snapshot_v1: true,
          studio_keep_last_list_v1: true,
          studio_pipeline_list_snapshot_v1: true,
          studio_list_read_snapshot_v2: true,
          studio_pipeline_open_index_v1: true,
          studio_home_overview_soft_429_v1: true,
          studio_oversized_list_refresh_v1: true,
          studio_library_published_files_v1: true,
          studio_native_grid_cover_v1: true,
          studio_finished_passthrough_v1: true,
          studio_finished_passthrough_resume_v1: true,
          studio_clip_frame_passthrough_v1: true,
          studio_review_schedule_override_v1: true,
          studio_manual_schedule_override_v2: true,
          studio_schedule_spread_v2: true,
          studio_platform_calendar_v1: true,
          studio_insights_best_times_v1: true,
          studio_prefill_suggested_schedules_v1: true,
          studio_factory_recheck_schedule_v1: true,
          studio_insights_similar_times_v1: true,
          studio_insights_learning_db_v1: true,
          studio_prepare_unsaved_guard_v1: true,
          studio_bulk_master_upload_v1: true,
          studio_stage_only_upload_v1: true,
          studio_insights_seasonal_v1: true,
          studio_insights_caption_learning_v1: true,
          studio_insights_overview_stats_v1: true,
          studio_insights_dashboard_v1: true,
          studio_insights_posts_v1: true,
          studio_insights_first_party_snapshots_v2: true,
          studio_insights_connections_v1: true,
          studio_insights_chat_v1: true,
          studio_insights_youtube_discovery_v1: true,
          studio_due_publish_priority_v1: true,
          studio_overdue_scheduled_rescue_v1: true,
          studio_tiktok_photo_route_contract_v1: true,
          studio_facebook_native_publish_v1: true,
          studio_fbs4_cover_unblock_v1: true,
          studio_publish_dispatch_reconcile_v1: true,
          studio_publish_location_v1: true,
          studio_production_location_v1: true,
          studio_production_lifecycle_v1: true,
          studio_render_timeout_resume_v1: true,
          studio_produce_self_heal_v1: true,
          studio_manual_idea_generation_v1: true,
          studio_operations_v1: true,
          studio_a0_daisychain_v1: true,
          studio_intake_progress_v1: true,
          studio_audio_leading_silence_v1: true,
          studio_r5_done_callback_v1: true,
          studio_ondemand_publish_orch_v1: true,
          studio_ondemand_smv1_p0202_v1: true,
          studio_ondemand_a1m_c1_c2m_v1: true,
          studio_ondemand_m1_r2b_v1: true,
          studio_ondemand_make_admin_bridge_v1: true,
          studio_ap0_webhook_live_v1: true,
          studio_manual_idea_progress_v1: true,
          studio_manual_idea_count_range: "1-10",
          studio_companion_stories_v1: true,
          studio_story_variant_relink_v1: true,
          studio_story_still_preview_v1: true,
          studio_story_teaser_15s_v1: true,
          studio_finished_story_teaser_10s_v1: true,
          studio_finished_passthrough_six_v1: true,
          studio_p3_promote_pulse_v1: true,
          studio_platform_output_fanout_dedupe_v1: true,
          studio_single_production_request_owner_v1: true,
          studio_pipeline_schedule_grid_v1: true,
          studio_r3_seed_selected_v1: true,
          production_make_idle_cadence_v1: true,
          production_request_kate_voice_v1: true,
          studio_p3_remotion_handoff_v1: true,
          studio_native_photo_carousel_v1: true,
          studio_publish_handoff_v1: true,
          studio_cdn_publish_handoff_v1: true,
          studio_photo_audio_defaults_v1: true,
          studio_item4_prepare_soft_fail_v1: true,
          studio_item4_subrequest_cap_v1: true,
          studio_variant_drive_ready_v1: true,
          studio_unattended_advance_v1: true,
          studio_continuation_controller_v1: true,
          studio_continuation_cron_v1: true,
          studio_variant_gap_heal_v1: true,
          studio_destination_relink_v1: true,
          studio_ai_master_fill_v1: true,
          studio_audio_default_yes_v1: true,
          studio_item4_calm_bridge_preflight_v1: true,
          studio_ai_thumbnail_v1: true,
          studio_youtube_16x9_all_v1: true,
          studio_item4_queue_owner_v1: true,
          studio_variant_poll_resume_v1: true,
          studio_promote_subrequest_budget_v1: true,
          studio_queued_auto_render_v1: true,
          studio_story_caption_voiceover_gate_v1: true,
          studio_mixed_ai_exact_v1: true,
          studio_stale_review_state_v1: true,
          studio_ai_slide_list_fix_v1: true,
          studio_slide_post_caption_split_v1: true,
          studio_audio_caption_handoff_v1: true,
          studio_variant_plan_ready_v1: true,
          studio_approve_plan_crops_v1: true,
          studio_audio_platform_warning_v1: true,
          studio_approved_progress_v1: true,
          studio_publish_cadence_carousel_youtube_v1: true,
          studio_publish_dispatch_v1: true,
          studio_ap0c_carousel_dispatch_v1: true,
          studio_ig_fb_photo_dispatch_v1: true,
          studio_native_still_no_mix_handoff_v1: true,
          studio_native_photo_brand_on_approve_v1: true,
          studio_all_visual_watermark_v1: true,
          studio_private_drive_watermark_heal_v1: true,
          studio_private_drive_watermark_park_v1: true,
          studio_r4_private_drive_watermark_gate_v1: true,
          studio_public_brand_watermark_v1: true,
          studio_idea_chain_python_gates_v1: true,
          studio_music_catalog_fallback_v1: true,
          studio_music_upload_v1: true,
          studio_music_favorites_v1: true,
          studio_music_delete_v1: true,
          studio_music_drive_authority_v1: true,
          studio_music_item_voiceover_v1: true,
          studio_review_audio_mix_v1: true,
          "0.10.10-elevenlabs-v2-catalog": true,
          binding_contract: "studio-api-10-core-elevenlabs-optional",
          elevenlabs_required: false,
          source_identity: "item20-diagnostics-v1",
          airtable_configured: Boolean(env.AIRTABLE_PAT && env.AIRTABLE_BASE_ID),
          access_identity_present: Boolean(accessIdentity(request).email || accessIdentity(request).jwt_present),
          r2_configured: Boolean(env.STUDIO_MEDIA),
          music_preview_source: "google_drive",
          authorization_model: "studio-users-memberships",
          brand_logo_source: "media-assets-google-drive",
          media_asset_image_preview_proxy: true,
          media_asset_image_preview_source: "google_drive",
          promotion_handoff_configured: Boolean(env.I3_DECISION_WEBHOOK_URL),
          promotion_handoff: "I3-to-I4",
          production_request_model: "airtable-production-requests",
          production_request_promotion: "guarded-I3-to-I4",
          advanced_directive_bridge: "production-request-to-content-item",
          production_request_outputs_model: "single-content-item-platform-output-seeds",
          platform_output_overrides_api: true,
          output_work_item_fanout: "production-request-outputs-to-platform-outputs",
          phase6_creative_editor_api: true,
          phase6_audio_mix_review: true,
          phase6_slide_directives: true,
          phase6_preview_rerender_prep: true,
          server_side_admin_deployer: true,
          repair_activation_leases_v1: true,
          repair_make_admin_module19_v1: true,
          repair_make_module_inspector_v1: true,
          repair_make_execution_inspector_v1: true,
          repair_make_scenario_inventory_v1: true,
          repair_make_start_scenario_probe_v1: true,
          repair_r4_exact_output_entry_v1: true,
          repair_item7_r4_exact_entry_drift_v8: true,
          repair_r4_token_exact_entry_v1: true,
          repair_r4_direct_input_pulse_v1: true,
          repair_r4_scheduled_selector_pulse_v1: true,
          repair_p1_test_selector_pulse_v1: true,
          repair_item7_exact_stage_pulse_v1: true,
          repair_item7_explicit_run_stop_recovery_v2: true,
          repair_item7_exact_execution_stop_v3: true,
          repair_item7_subrequest_reserve_v4: true,
          repair_item7_fresh_invocation_cleanup_v5: true,
          repair_item7_standalone_selector_recovery_v6: true,
          repair_item7_selector_recovery_v6_1: true,
          repair_item7_r3_canonical_maxrecords_v7: true,
          repair_item7_r5_canonical_maxrecords_v8: true,
          repair_item7_rr1_canonical_maxrecords_v9: true,
          repair_exact_output_test_mode_v1: true,
          repair_durable_test_run_identity_v1: true,
          studio_smv1_queue_test_identity_v1: true,
          studio_smv1_exact_test_pulse_v1: true,
          repair_run_disabled_until_stage_addressing_verified: true,
          local_airtable_pat_required_for_admin_deploys: false,
          make_admin_blueprint_string_patch: true,
          phase6_rendered_preview_proxy: true,
          phase6_native_r2_preview: true,
          phase6_voiceover_volume: true,
          phase6_dynamic_voice_catalog: true,
          phase6_voice_catalog_v1_fallback: true,
          phase6_voice_preview_proxy: true,
          phase6_voice_id_authority: true,
          phase6_make_voice_migration: "predeployed-verified-no-save-dependency",
          phase6_save_voiceprep_rerender_handoff: true,
          phase6_auto_voiceprep_rerender_handoff: true,
          phase6_full_auto_rerender: true,
          phase6_activation_run_race_fix: true,
          phase6_resumable_render_handoff: true,
          phase6_resumable_voice_prep: true,
          phase6_handoff_revision_proof: true,
          phase6_creative_change_progress: true,
          phase6_finalization_state_hardened: true,
          phase6_short_lived_make_pulses: true,
          phase6_pipeline_settings_pagination: true,
          phase6_p0202_generic_voice_prep: true,
          phase6_studio_request_scoped_voice_prep: true,
          phase6_auto_voice_duration_probe: true,
          phase6_title_edit_v1: true,
          phase6_title_approval_lock: true,
          phase6_title_render_input: true,
          elevenlabs_voice_catalog_configured: Boolean(env.ELEVENLABS_API_KEY),
          item4_master_media_upload: true,
          item4_heic_heif_upload: true,
          item4_heic_original_preservation: true,
          item4_platform_variant_materialization: true,
          item4_variant_source: "google-drive-authoritative",
          item4_images_binding_required: false,
          item4_variant_service: "make-smv1-cloudflare-images",
          item4_persistent_r2_variants: false,
          item4_heic_to_jpeg_derivatives: true,
          item4_variant_storage: "google-drive",
          item4_master_authority_handoff: "r2-temporary-to-google-drive",
          item4_master_media_asset_reconciliation: true,
          item4_master_r2_cleanup_after_drive_authority: true,
          item4_master_worker: "smv1-combined-drive-authority",
          item4_master_authority_poll_reconcile: true,
          item4_browser_preview_cache: "transient-cloudflare-r2",
          item4_browser_preview_authority: "google-drive-remains-authoritative",
          item4_preview_worker_self_hardening: true,
          item4_preview_make_filter_schema_fix: true,
          item4_preview_blueprint_runtime_validation: true,
          item4_preview_worker_build: "0.9.5",
          item4_master_authority_status_self_heal: true,
          item4_master_authority_status_worker_pulse: true,
          item4_master_failure_preserves_staging: true,
          item4_upload_async_handoff_resilient: true,
          item4_upload_preview_self_heal_v1: true,
          item4_upload_preview_hard_refresh_required: false,
          item4_upload_drain_failure_nonterminal: true,
          item4_smv1_master_drive_uploaded_selector_guard: true,
          item4_smv1_selector_self_repair: true,
          item4_variant_links_follow_plan_ratio_not_platform_name: true,
          item4_studio_exact_source_authority: true,
          item4_p3_exact_source_self_hardening: true,
          item4_r2_exact_source_guard_self_hardening: true,
          item4_make_hardening_workspace_status_trigger: true,
          item4_make_hardening_collection_open_trigger: true,
          item4_r2_stale_baseline_recovery: true,
          item4_r2_hardening_trigger_cache_seconds: 120,
          item4_generic_r2_cannot_replace_owner_uploads: true,
          item4_variant_crop_review: true,
          item4_output_plan: true,
          item4_audio_capability_routing: true,
          item4_instagram_default_output: "Reel",
          item4_facebook_default_output: "Slideshow Reel",
          item4_facebook_photo_object: "reel",
          item4_facebook_slideshow_reel_opt_in: true,
          item4_facebook_slideshow_voiceover_hardening: true,
          facebook_graph_publish_held: studioFacebookGraphPublishHeld(env),
          facebook_public_make_publish: true,
          facebook_native_cover_attach: true,
          item4_ratio_authority: "platform-output-mappings",
          item4_publish_locked_until_bridge_validation: false,
          item4_source_to_production_bridge: "validated-preflight-v1",
          item4_promotion_summary_backfill: true,
        });
      }

      if (isPublicBrandWatermarkRoute) {
        requireConfig(env);
        return publicChicagoShiningWatermark(request, env);
      }

      if (url.pathname === "/api/session") {
        requireConfig(env);
        const authorization = await resolveAuthorization(request, env);
        return respond(request, env, {
          ok: true,
          ...authorization,
        }, authorization.authenticated ? 200 : 401);
      }

      requireConfig(env);

      // All Studio data routes are now authorization-aware. Cloudflare Access
      // remains the perimeter gate; Airtable Studio Users/Memberships determine
      // whether the authenticated identity is allowed to use this tenant.
      const authorization = await resolveAuthorization(request, env);
      if (!authorization.authenticated) {
        throw new HttpError(401, "Authentication required");
      }
      if (!authorization.authorized) {
        throw new HttpError(403, authorization.authorization_error || "Studio membership required");
      }

      if (isMediaLibraryStillsRoute) {
        if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
        requirePermission(authorization, "production_configure");
        return getMediaLibraryStills(request, env, url, authorization);
      }

      if (isMediaAssetPreviewRoute) {
        return mediaAssetImagePreview(request, env, url, authorization);
      }

      if (isMediaAssetStreamRoute) {
        if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Method not allowed");
        return mediaAssetVideoStream(request, env, url, authorization);
      }

      if (isAdminMakeDeployRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method === "GET") {
          return adminMakeDeployPage(request, env, authorization);
        }
        assertWriteRequest(request, env);
        return adminMakeDeploy(request, env, authorization);
      }

      if (isAdminFbPublicDiagnosticRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
        const diagnostic = await studioDiagnoseFacebookPublicMakeOnce(env);
        return respond(request, env, diagnostic);
      }

      if (isAdminRepairControlRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method === "GET") return await adminRepairControlStatus(request, env);
        assertWriteRequest(request, env);
        return await adminRepairControl(request, env, authorization);
      }

      if (isAiApiRoute) {
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        if (request.method === "GET") return getStudioAiApiStatus(request, env);
        if (request.method === "PATCH") {
          requirePermission(authorization, "tenant_admin");
          assertWriteRequest(request, env);
          return patchStudioAiApiPreference(request, env);
        }
        throw new HttpError(405, "Method not allowed");
      }

      if (isOpsDeskInventoryRoute) {
        if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        return getStudioDeskInventory(request, env);
      }

      if (isOpsSupabaseSyncRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method === "GET") return getStudioSupabaseSyncStatus(request, env);
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        return postStudioSupabaseSync(request, env);
      }

      if (isOpsDeskActivityRoute) {
        if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        return getStudioDeskActivity(request, env);
      }

      if (isOpsDeskModeRoute) {
        if (request.method !== "PATCH") throw new HttpError(405, "Method not allowed");
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return patchStudioDeskMode(request, env);
      }

      if (isOpsLibraryCrossScopeRoute) {
        if (request.method !== "PATCH") throw new HttpError(405, "Method not allowed");
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return patchLibraryCrossScope(request, env);
      }

      if (isOperationsRoute) {
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        return getStudioOperations(request, env, authorization);
      }

      if (isOperationsProfilesListRoute) {
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
        return getStudioOperationsProfiles(request, env, authorization);
      }

      if (isOperationsQueueRoute) {
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        return getStudioOperationsQueue(request, env, authorization);
      }

      if (isOperationsQueuePauseRoute) {
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        assertWriteRequest(request, env);
        return pauseStudioOperationsQueueItem(request, env, authorization);
      }

      if (isOperationsQueueReorderRoute) {
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        assertWriteRequest(request, env);
        return reorderStudioOperationsRenderQueue(request, env, authorization);
      }

      if (isFactoryDeskRoute) {
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        if (request.method === "GET") return getFactoryDesk(request, env, authorization);
        if (request.method === "POST") {
          assertWriteRequest(request, env);
          return mutateFactoryDesk(request, env, authorization, ctx);
        }
        throw new HttpError(405, "Method not allowed");
      }

      if (isOperationsProfileRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return patchStudioOperationsProfile(request, env, url, authorization);
      }

      if (isOperationsDailyIdeasRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return runStudioDailyIdeas(request, env, authorization, ctx, { force: true });
      }

      if (isOperationsAutonomousRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return runStudioAutonomousProduce(request, env, authorization, ctx, { force: true });
      }

      if (isOperationsOutputScheduleRoute) {
        requirePermission(authorization, "publishing_control");
        assertWriteRequest(request, env);
        return scheduleStudioPublishOutput(request, env, url, authorization, ctx);
      }

      if (isOperationsOutputPublishedRoute) {
        requirePermission(authorization, "publishing_control");
        assertWriteRequest(request, env);
        return markStudioOutputPublished(request, env, url, authorization);
      }

      if (isOperationsOutputPublishKickRoute) {
        requirePermission(authorization, "publishing_control");
        assertWriteRequest(request, env);
        return kickStudioOutputPublish(request, env, url, authorization, ctx);
      }

      if (isOperationsCompressionStatusRoute) {
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        return getStudioCompressionStatus(request, env);
      }

      if (isOperationsCompressRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return pulseA1SForDriveFile(request, env, authorization, ctx);
      }

      if (isOpsAzNavyPierKickRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        const phase = String(url.searchParams.get("phase") || "auto").trim().toLowerCase() || "auto";
        const result = await opsForceAzNavyPierTitle(env, { phase });
        return respond(request, env, result);
      }

      if (isOpsMiamiTikTokSecretRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return syncMiamiTikTokPipelineSecret(request, env);
      }

      if (isOperationsResetRenderUrlsRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return pulseM1ResetRenderUrls(request, env, ctx);
      }

      if (isOperationsRetryAssetSelectionRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return pulseR2BRetryAssetSelection(request, env, ctx);
      }

      if (isOperationsMakeAdminBridgeRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return pulseMakeAdminBridgeQueue(request, env, ctx);
      }

      if (isOperationsIntakeRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method === "GET") return getStudioLibraryIntakeStatus(request, env, url);
        assertWriteRequest(request, env);
        return pulseStudioLibraryIntake(request, env, authorization, ctx);
      }

      if (isOperationsAudioLeadingSilenceRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return pulseAudioLeadingSilence(request, env);
      }

      if (isInsightsConnectionsRoute) {
        requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
        return getInsightsConnections(request, env, url, authorization);
      }

      if (isInsightsPostsRoute) {
        requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
        return getInsightsPosts(request, env, url, authorization);
      }

      if (isInsightsChatRoute) {
        requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
        return postInsightsChat(request, env, url, authorization);
      }

      if (isInsightsBestTimesRoute) {
        requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
        return getInsightsBestTimes(request, env, url, authorization);
      }

      if (isInsightsCaptionsRoute) {
        requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
        return getInsightsCaptions(request, env, url, authorization);
      }

      if (isInsightsSimilarTimesRoute) {
        requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
        if (request.method === "GET") return getInsightsSimilarTimes(request, env, url, authorization, ctx);
        assertWriteRequest(request, env);
        requirePermission(authorization, "tenant_admin");
        return postInsightsSimilarTimesSweep(request, env, url, authorization);
      }

      if (isInsightsDiscoverRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return postInsightsDiscover(request, env, url, authorization);
      }

      if (isInsightsWatchlistRoute) {
        requireAnyPermission(authorization, ["publishing_control", "tenant_admin"]);
        if (request.method === "GET") return getInsightsWatchlist(request, env);
        assertWriteRequest(request, env);
        requirePermission(authorization, "tenant_admin");
        return putInsightsWatchlist(request, env);
      }

      if (isEngagementCapabilitiesRoute) {
        requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
        return respond(request, env, capabilityMatrixResponse());
      }

      if (isEngagementSettingsRoute) {
        requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
        if (request.method === "GET") return getEngagementSettings(request, env, url, authorization);
        assertWriteRequest(request, env);
        requirePermission(authorization, "tenant_admin");
        return putEngagementSettings(request, env, url, authorization);
      }

      if (isEngagementDiscoverRoute) {
        requirePermission(authorization, "tenant_admin");
        assertWriteRequest(request, env);
        return postEngagementDiscover(request, env, url, authorization);
      }

      if (isEngagementRecommendationsRoute || isEngagementHistoryRoute) {
        requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
        return getEngagementRecommendations(request, env, url, authorization);
      }

      if (isEngagementActionsRoute) {
        requireAnyPermission(authorization, ["publishing_control", "tenant_admin"]);
        assertWriteRequest(request, env);
        return postEngagementAction(request, env, url, authorization);
      }

      if (isEngagementInsightsRoute) {
        requireAnyPermission(authorization, ["outputs_review", "publishing_control", "tenant_admin"]);
        return getEngagementInsights(request, env, url, authorization);
      }

      if (isVoicePreviewRoute) {
        return phase6VoicePreview(request, env, url);
      }

      if (isVoiceCatalogRoute) {
        return listPhase6Voices(request, env, authorization);
      }

      if (url.pathname === "/api/branding/logo") {
        return brandLogo(request, env, authorization);
      }

      if (isProfileSetupRoute) {
        requirePermission(authorization, "tenant_admin");
        const onboarding = studioProfileOnboardingHandlers();
        if (request.method === "GET") return onboarding.getSetup(request, env, url, authorization);
        if (request.method === "PATCH") {
          assertWriteRequest(request, env);
          return onboarding.patchSetup(request, env, url, authorization);
        }
        throw new HttpError(405, "Method not allowed");
      }

      if (isProfileSetupCollectionRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method === "GET") return listStudioProfileSetups(request, env, authorization);
        if (request.method === "POST") {
          assertWriteRequest(request, env);
          return createStudioProfileSetup(request, env, authorization);
        }
        throw new HttpError(405, "Method not allowed");
      }

      if (isProfilePlatformValidateRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        return studioProfileOnboardingHandlers().validatePlatform(request, env, url, authorization);
      }

      if (isProfileSetupPlatformRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        return updateStudioProfileSetupPlatform(request, env, url, authorization);
      }

      if (isProfileSetupActivateRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        return activateStudioProfileSetup(request, env, url, authorization);
      }

      if (isProfileSetupRecordRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method === "GET") return getStudioProfileSetup(request, env, url, authorization);
        if (request.method === "PATCH") {
          assertWriteRequest(request, env);
          return patchStudioProfileSetup(request, env, url, authorization);
        }
        throw new HttpError(405, "Method not allowed");
      }

      if (url.pathname === "/api/profiles") {
        if (request.method === "POST") {
          requirePermission(authorization, "tenant_admin");
          assertWriteRequest(request, env);
          return studioProfileOnboardingHandlers().createProfile(request, env, authorization);
        }
        if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
        return listStudioContentProfiles(request, env, authorization);
      }

      if (url.pathname === "/api/profiles/overview") {
        if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
        return profilesOverview(request, env, authorization, ctx);
      }

      if (url.pathname === "/api/dashboard") {
        return dashboard(request, env, url, authorization);
      }

      if (isIdeaGenerateRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_create");
        return startStudioIdeaGeneration(request, env, authorization, ctx);
      }

      if (isScriptedShortProposeRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_create");
        return proposeScriptedShortRoute(request, env, authorization);
      }

      if (isScriptedShortAcceptRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_create");
        requirePermission(authorization, "production_configure");
        return acceptScriptedShortRoute(request, env, authorization, ctx);
      }

      if (isIdeaGenerateStatusRoute) {
        return studioIdeaGenerationStatus(request, env, url, authorization);
      }

      if (url.pathname === "/api/ideas") {
        if (request.method === "POST") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "ideas_create");
          return createIdea(request, env, authorization);
        }
        return listIdeas(request, env, url, authorization, ctx);
      }

      if (isIdeaHoldRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_edit");
        return holdIdea(request, env, url, authorization);
      }

      if (isIdeaRestoreRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_edit");
        return restoreIdea(request, env, url, authorization);
      }

      if (isIdeaPhotoListeningSessionRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_edit");
        requirePermission(authorization, "production_configure");
        return ideaPhotoListeningSessionRoute(request, env, url, authorization);
      }

      if (isIdeaWatchPhotosRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_promote");
        requirePermission(authorization, "production_configure");
        return watchIdeaPhotosRoute(request, env, url, authorization);
      }

      if (isIdeaMatchPhotosRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return matchIdeaPhotosRoute(request, env, url, authorization);
      }

      if (isIdeaTimedScriptRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return createIdeaTimedScriptRoute(request, env, url, authorization, ctx);
      }

      if (isVibeCutPlanRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return planVibeCutRoute(request, env, authorization);
      }

      if (isVibeCutAnotherRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return anotherVibeCutRoute(request, env, authorization);
      }

      if (isIdeaLibrarySuggestionsRoute) {
        requirePermission(authorization, "production_configure");
        return getIdeaLibrarySuggestions(request, env, url, authorization);
      }

      if (isIdeaProductionRequestRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return getOrCreateProductionRequestForIdea(request, env, url, authorization, ctx);
      }

      if (isProductionRequestCollectionRoute) {
        if (request.method === "POST") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "production_configure");
          return createProductionRequestFromBody(request, env, authorization, url, ctx);
        }
        // Item 4 opens by loading the Production Request collection before a
        // specific request/status route is necessarily selected. Trigger the Make
        // safety hardening here as well so a simple /item4 page open is sufficient.
        // Never block the list UI if Make is temporarily unavailable.
        deferItem4MakeHardening(ctx, env);
        return listProductionRequests(request, env, url, authorization);
      }

      if (isProductionRequestAiMastersRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return generateItem4PreProductionAiMaster(request, env, url, authorization, ctx);
      }

      if (isItem4LibraryAssetsRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return attachItem4LibraryAssets(request, env, url, authorization);
      }

      if (isItem4AssetsReorderRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return reorderItem4MasterAssets(request, env, url, authorization);
      }

      if (isItem4UploadSessionRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return createItem4LargeVideoUploadSession(request, env, url, authorization);
      }

      if (isItem4UploadSessionPartRoute) {
        if (request.method !== "PUT") throw new HttpError(405, "Method not allowed");
        assertOriginWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return uploadItem4LargeVideoPart(request, env, url, authorization);
      }

      if (isItem4UploadSessionCompleteRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return completeItem4LargeVideoUploadSession(request, env, url, authorization, ctx);
      }

      if (isItem4UploadSessionAbortRoute) {
        if (request.method !== "DELETE") throw new HttpError(405, "Method not allowed");
        assertOriginWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return abortItem4LargeVideoUploadSession(request, env, url, authorization);
      }

      if (isItem4AssetsRoute) {
        requirePermission(authorization, "production_configure");
        if (request.method === "POST") {
          assertUploadWriteRequest(request, env);
          return uploadItem4MasterAssets(request, env, url, authorization, ctx);
        }
        return getItem4MasterAssets(request, env, url, authorization);
      }

      if (isItem4AssetPosterRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertUploadWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return uploadItem4ClipPoster(request, env, url, authorization);
      }

      if (isItem4AssetRecordRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return deleteItem4MasterAsset(request, env, url, authorization);
      }

      if (isItem4PlanRoute) {
        requirePermission(authorization, "production_configure");
        if (request.method === "POST") {
          assertWriteRequest(request, env);
          return buildItem4OutputPlan(request, env, url, authorization);
        }
        return getItem4OutputPlan(request, env, url, authorization);
      }

      if (isItem4VariantsRoute) {
        requirePermission(authorization, "production_configure");
        if (request.method === "POST") {
          assertWriteRequest(request, env);
          return prepareItem4Variants(request, env, url, authorization, ctx);
        }
        return getItem4Variants(request, env, url, authorization, ctx);
      }

      if (isItem4StatusRoute) {
        return getItem4WorkspaceStatus(request, env, url, authorization, ctx);
      }

      if (isProductionRequestOutputsRoute) {
        if (request.method === "PUT") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "production_configure");
          return await syncProductionRequestOutputs(request, env, url, authorization);
        }
        return listProductionRequestOutputs(request, env, url, authorization, ctx);
      }

      if (isProductionRequestOutputRecordRoute) {
        if (request.method === "PATCH") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "production_configure");
          return updateProductionRequestOutput(request, env, url, authorization);
        }
        return getProductionRequestOutput(request, env, url, authorization);
      }

      if (isProductionRequestSyncDirectivesRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return await syncProductionRequestDirectivesRoute(request, env, url, authorization);
      }

      if (isProductionRequestTimedScriptRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        return await applyPromotedTimedScriptRoute(request, env, url, authorization);
      }

      if (isProductionRequestBridgePreflightRoute) {
        requirePermission(authorization, "production_configure");
        return productionRequestBridgePreflightRoute(request, env, url, authorization);
      }

      if (isProductionRequestPromoteRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_promote");
        requirePermission(authorization, "production_configure");
        const requestId = productionRequestPromotionRecordIdFromPath(url);
        const response = await promoteProductionRequestViaI3I4(request, env, url, authorization, ctx);
        continueParkedProductionAfterPromote(ctx, env, requestId);
        return response;
      }

      if (isProductionRequestRecordRoute) {
        if (request.method === "PATCH") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "production_configure");
          return await updateProductionRequest(request, env, url, authorization);
        }
        const response = await getProductionRequest(request, env, url, authorization, ctx);
        cadenceScheduleSync(ctx, env);
        return response;
      }

      if (isIdeaPromoteRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_promote");
        const response = await promoteIdeaViaI3I4(request, env, url, authorization);
        let requestId = null;
        try {
          const payload = await response.clone().json();
          requestId = payload?.production_request?.id || payload?.production_request_record_id || null;
        } catch {}
        continueParkedProductionAfterPromote(ctx, env, requestId);
        return response;
      }

      if (isIdeaPrepareToReviewRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_promote");
        return prepareIdeaToReview(request, env, url, authorization, ctx);
      }

      if (isIdeaRecordRoute) {
        if (request.method === "PATCH") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "ideas_edit");
          return updateIdea(request, env, url, authorization);
        }
        if (request.method === "DELETE") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "ideas_delete");
          return deleteIdea(request, env, url, authorization);
        }
        return getAuthorizedIdeaRoute(request, env, url, authorization);
      }

      if (url.pathname === "/api/content") {
        const response = await listContent(request, env, url, authorization);
        cadenceScheduleSync(ctx, env);
        return response;
      }

      if (url.pathname.startsWith("/api/content/")) {
        return getRecordRoute(request, env, url, env.AIRTABLE_CONTENT_TABLE_ID, "content");
      }

      if (url.pathname === "/api/outputs") {
        const response = await listOutputs(request, env, url, authorization, ctx);
        cadenceScheduleSync(ctx, env);
        return response;
      }

      if (isOutputScheduleGridRoute) {
        return listOutputScheduleGrid(request, env, url, authorization);
      }

      if (isOutputPreviewRoute) {
        return outputPreview(request, env, url, authorization);
      }

      if (isOutputCreativeHandoffStatusRoute) {
        return getOutputCreativeHandoffStatus(request, env, url, authorization);
      }

      if (isOutputCreativeContinueRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "outputs_review");
        return continueOutputCreativeHandoff(request, env, url, authorization);
      }

      if (isOutputApproveAllRoute) {
        requirePermission(authorization, "outputs_review");
        if (request.method === "GET") {
          return getApproveAllJobStatus(request, env, authorization);
        }
        assertWriteRequest(request, env);
        return approveAllOutputsForPublishing(request, env, authorization, ctx);
      }

      if (isScheduleRegenRoute) {
        requirePermission(authorization, "outputs_review");
        if (request.method === "GET") {
          return getScheduleRegenJobStatus(request, env, authorization);
        }
        assertWriteRequest(request, env);
        return startScheduleRegenJob(request, env, authorization, ctx);
      }

      if (isScheduleSettingsRoute) {
        requireAnyPermission(authorization, ["tenant_admin", "publishing_control", "production_configure"]);
        if (request.method === "GET") {
          return getStudioScheduleSettings(request, env, authorization);
        }
        assertWriteRequest(request, env);
        requirePermission(authorization, "tenant_admin");
        return putStudioScheduleSettings(request, env, authorization);
      }

      if (isOutputTiktokCompleteWrite) {
        assertWriteRequest(request, env);
        requireAnyPermission(authorization, ["outputs_review", "publishing_control"]);
        return markStudioTiktokComplete(request, env, url);
      }

      if (isOutputTiktokResendWrite) {
        assertWriteRequest(request, env);
        requireAnyPermission(authorization, ["outputs_review", "publishing_control"]);
        return resendStudioTiktokDraft(request, env, url, authorization, ctx);
      }

      if (isOutputYoutubeCompleteWrite) {
        assertWriteRequest(request, env);
        requireAnyPermission(authorization, ["outputs_review", "publishing_control"]);
        return markStudioYoutubeComplete(request, env, url);
      }

      if (isOutputCreativeReviewRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "outputs_review");
        return reviewOutputCreative(request, env, url, authorization, ctx);
      }

      if (isOutputCreativeRoute) {
        if (request.method === "PATCH") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "outputs_review");
          return updateOutputCreative(request, env, url, authorization);
        }
        return getOutputCreative(request, env, url, authorization);
      }

      if (url.pathname.startsWith("/api/outputs/")) {
        return getOutputRoute(request, env, url);
      }

      if (isMusicFavoriteRoute) {
        assertWriteRequest(request, env);
        return toggleMusicFavorite(request, env, url);
      }

      if (isMusicDeleteWrite) {
        assertWriteRequest(request, env);
        return deleteMusicLibraryTrack(request, env, url);
      }

      if (isMusicPreviewRoute) {
        return musicPreview(request, env, url);
      }

      if (url.pathname === "/api/music") {
        if (request.method === "POST") {
          assertUploadWriteRequest(request, env);
          return uploadMusicLibraryTracks(request, env, authorization);
        }
        return listMusic(request, env, url);
      }

      if (isAssetLibraryDurationWrite) {
        assertWriteRequest(request, env);
        return patchAssetLibraryDuration(request, env, url);
      }

      if (isAssetLibraryProfileWrite) {
        assertWriteRequest(request, env);
        return assignLibraryAssetProfile(request, env, url, authorization, ctx);
      }

      if (isAssetLibraryClassifyAllWrite) {
        assertWriteRequest(request, env);
        return classifyAllLibraryAssets(request, env, url, authorization, ctx);
      }

      if (isPublishedLibraryReleaseWrite) {
        assertWriteRequest(request, env);
        return releasePublishedLibraryFile(request, env, url);
      }

      if (isAssetLibraryRenameWrite) {
        assertWriteRequest(request, env);
        return renameAssetLibraryItem(request, env, url, ctx);
      }

      if (isAssetLibraryDeleteWrite) {
        assertWriteRequest(request, env);
        return deleteAssetLibraryItem(request, env, url);
      }

      if (url.pathname === "/api/library") {
        if (request.method === "POST") {
          assertUploadWriteRequest(request, env);
          return uploadAssetLibraryItems(request, env, authorization, ctx);
        }
        return listAssetLibrary(request, env, url, authorization);
      }

      return respond(request, env, { ok: false, error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      return respond(request, env, {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }, error?.status || 500);
    }
  },
  async scheduled(event, env, ctx) {
    // 2026-10-11 burn-kill: light ticks were still running ~25 platform reconciles
    // + heals every 5 minutes, colliding with Studio UI polls and Airtable 429
    // cooldowns (603 Worker hung-cancels in 3h). Light = publish/produce rescue
    // only. Heavy (UTC :00/:30) owns platform polls, heals, insights, ingest,
    // post-publish release. Skip the whole pass while Airtable is cooling down.
    // scheduledTime is the tick Cloudflare owed us. new Date() is whenever this
    // isolate actually started, which can already be past :00.
    const cronInstant = Number(event?.scheduledTime);
    const cadenceNow = Number.isFinite(cronInstant) && cronInstant > 1e12 ? new Date(cronInstant) : new Date();
    const cadence = studioCronAirtableCadence(cadenceNow, event?.cron || "");
    ctx.waitUntil((async () => {
      const coolMs = airtableCooldownWaitMs();
      if (coolMs > AIRTABLE_SLOT_FAIL_FAST_MS) {
        console.warn("cron skipped: Airtable cooling down", { waitMs: coolMs, heavy: cadence.heavy });
        return;
      }

      // Create the hour's ideas before publish heals. Those heals were still
      // running at :12, so the harvest saw a non-zero minute and created nothing.
      if (cadence.heavy && Number(cadence.minute) === 0) {
        try {
          await runStudioAutonomousProduce(null, env, { permissions: { tenant_admin: true } }, ctx, {
            scheduled: true,
            cron: event?.cron || "",
            cronMinute: cadence.minute,
          });
        } catch (error) {
          console.warn("autonomous top-of-hour harvest failed", error);
        }
      }

      // --- LIGHT (every 5 min): due-publish + stuck produce/render only ---
      // Stamp MAE onto approved rows that Factory left blank BEFORE reconcile.
      // A blank Scheduled_Post_Date matches the due-publish formula and goes out now.
      try {
        await studioHealApprovedMissingSchedule(env, { limit: 16 });
      } catch (error) {
        console.warn("approved missing-schedule heal failed", error);
      }
      // A Story stamped on the next empty MAE slot publishes at that slot
      // (often the same afternoon) while its Reel is weeks out. Move it to
      // main + 10 minutes before the due-publish reconcile can send it.
      try {
        await studioHealStoryCompanionDrift(env, { limit: 8 });
      } catch (error) {
        console.warn("story companion drift heal failed", error);
      }
      try {
        await studioReconcileOverdueScheduledPublishes(env, { limit: 12 });
      } catch (error) {
        console.warn("overdue scheduled publish rescue cron failed", error);
      }
      try {
        await studioReconcileApprovedPublishes(env);
      } catch (error) {
        console.warn("publish reconcile cron failed", error);
      }
      try {
        await healStuckStudioRenders(env);
      } catch (error) {
        console.warn("studio stuck-render heal failed", error);
      }
      // Changes Requested + In Production with a finished file and no live render
      // paints Rerendering forever (native stills, stories already out of the queue).
      try {
        await studioHealPhantomRerender(env, { limit: 8 });
      } catch (error) {
        console.warn("phantom rerender heal failed", error);
      }
      try {
        await studioResumeApproveAllJobs(env, ctx);
      } catch (error) {
        console.warn("studio approve-all batch resume failed", error);
      }
      try {
        await resumeStaleStudioProductionJobs(env);
      } catch (error) {
        console.warn("studio produce watchdog failed", error);
      }
      // Light tick: missing Platform Output fanout for Promoted Vibe Cuts (Adler Short).
      // Heavy cron still runs the full heal; this unblocks Short gaps between :00/:30.
      try {
        await studioHealPromotedMissingFanout(env, { limit: 4 });
      } catch (error) {
        console.warn("studio promoted fanout heal (light) failed", error);
      }
      try {
        await startOrphanedStudioProductionJobs(env);
      } catch (error) {
        console.warn("studio produce orphan kick failed", error);
      }
      // A skipped Factory-revision lock retries the same 409 and never reaches
      // the other cities. Release it before resume so this tick can move on.
      try {
        await studioHealAutonomousRevisionLock(env);
      } catch (error) {
        console.warn("autonomous revision lock heal failed", error);
      }
      // Light tick: 30m photo-ready SLA drain. New ideas wait for the top of
      // the hour, so this resume does not run on the same tick as that harvest.
      if (!cadence.heavy) {
        try {
          await runStudioAutonomousProduce(null, env, { permissions: { tenant_admin: true } }, ctx, {
            scheduled: true,
            cron: event?.cron || "",
            resume_only: true,
          });
        } catch (error) {
          console.warn("autonomous FIFO resume (light) failed", error);
        }
      }
      try {
        await resumeAzFinishedVideoRequests(env, ctx);
      } catch (error) {
        console.warn("AZ finished-video resume failed", error);
      }
      try {
        const existing = await readStudioProfilesOverviewSnapshot(env);
        const age = existing?.at ? Date.now() - existing.at : Infinity;
        if (age > 10 * 60 * 1000) await refreshStudioProfilesOverviewSnapshot(env, null);
      } catch (error) {
        console.warn("profiles overview snapshot refresh failed", error);
      }

      if (!cadence.heavy) return;

      // --- HEAVY (UTC :00 / :30): platform polls, heals, ideas, ingest, release ---
      try {
        await warmOldestStudioReadSnapshot(env);
      } catch (error) {
        console.warn("studio list snapshot warm failed", error);
      }
      try {
        await studioSyncSupabasePipelineReads(env, { outputLimit: 400, contentLimit: 200 });
      } catch (error) {
        console.warn("supabase pipeline sync cron failed", error);
      }
      try {
        await opsForceAzNavyPierTitle(env);
      } catch (error) {
        console.warn("ops az navy pier title patch failed", error);
      }
      try {
        await studioHealFailedStatuses(env, { limit: 6 });
      } catch (error) {
        console.warn("studio failed-status heal failed", error);
      }
      try {
        await studioHealIgCarouselTooManyChildren(env, { limit: 4 });
      } catch (error) {
        console.warn("studio IG carousel child-count heal failed", error);
      }
      try {
        await studioHealIgCarouselChildVerificationRace(env, { limit: 4 });
      } catch (error) {
        console.warn("studio IG AP1C verification-race heal failed", error);
      }
      try {
        await studioHealIgCarouselChildPollFailure(env, { limit: 4 });
      } catch (error) {
        console.warn("studio IG AP2C child-poll heal failed", error);
      }
      try {
        await studioHealIgCarouselRateLimit(env, { limit: 4 });
      } catch (error) {
        console.warn("studio IG AP1C rate-limit heal failed", error);
      }
      try {
        await studioHealNativePhotoReviewStrands(env, { limit: 8 });
      } catch (error) {
        console.warn("studio native-photo review-strand heal failed", error);
      }
      try {
        await studioHealAwaitingApprovalStaleRfr(env, { limit: 12 });
      } catch (error) {
        console.warn("studio awaiting-approval stale RFR heal failed", error);
      }
      try {
        await studioHealPromotedMissingFanout(env, { limit: 8 });
      } catch (error) {
        console.warn("studio promoted fanout heal failed", error);
      }
      try {
        await advanceStudioProductionOutputs(env, { waitMs: 0 });
      } catch (error) {
        console.warn("studio continuation listener failed", error);
      }
      try {
        await studioHealRfrMissingDeliverable(env, { limit: 8 });
      } catch (error) {
        console.warn("studio rfr missing-deliverable heal failed", error);
      }
      try {
        await studioReconcileTiktokDrafts(env);
      } catch (error) {
        console.warn("tiktok draft reconcile cron failed", error);
      }
      try {
        await studioReconcileInstagramCarousels(env);
      } catch (error) {
        console.warn("instagram carousel reconcile cron failed", error);
      }
      try {
        await studioReconcilePublishingInstagramStories(env);
      } catch (error) {
        console.warn("instagram story poll reconcile cron failed", error);
      }
      try {
        await studioReconcilePublishingInstagramReels(env);
      } catch (error) {
        console.warn("instagram reel in-progress reconcile cron failed", error);
      }
      try {
        await studioReconcileFacebookSlideshows(env);
      } catch (error) {
        console.warn("facebook slideshow reconcile cron failed", error);
      }
      try {
        await studioReconcileFacebookReels(env, { limit: 4 });
      } catch (error) {
        console.warn("facebook reel priority reconcile cron failed", error);
      }
      try {
        await studioReconcileFacebookReels(env);
      } catch (error) {
        console.warn("facebook reel reconcile cron failed", error);
      }
      try {
        await studioReconcileYoutubePublishes(env);
      } catch (error) {
        console.warn("youtube publish reconcile cron failed", error);
      }
      try {
        await studioReconcileFacebookPhotos(env);
      } catch (error) {
        console.warn("facebook photo reconcile cron failed", error);
      }
      try {
        await studioReconcileFacebookVideoCovers(env);
      } catch (error) {
        console.warn("facebook native cover reconcile cron failed", error);
      }
      try {
        await autoListenOpenPhotoIdeas(env, { limit: 12 });
      } catch (error) {
        console.warn("idea automatic photo listening failed", error);
      }
      try {
        await runWaitingIdeaPhotoMatches(env, { limit: 12 });
      } catch (error) {
        console.warn("idea photo-wait matcher failed", error);
      }
      try {
        await studioHealEscalatedProduce(env, { limit: 4 });
      } catch (error) {
        console.warn("studio escalated-produce heal failed", error);
      }
      let item4Drain = null;
      try {
        item4Drain = await item4DrainAllPendingWork(env, { maxMs: ITEM4_DRAIN_CRON_BUDGET_MS });
      } catch (error) {
        console.warn("item4 pending crop drain cron failed", error);
      }
      // Timeline drafts can sit at Variant Status=None with a Ready plan when the
      // Create Timeline waitUntil prepare never started queue rows. Drain will not
      // see them, so this heal must run even when the media drain was idle.
      try {
        await item4HealTimelineAutoPrepare(env, ctx);
      } catch (error) {
        console.warn("item4 timeline auto-prepare heal failed", error);
      }
      // Always reconcile Preparing/Error parents — once crops finish, the drain
      // scan is empty and gating on request_ids leaves ready_count=0 forever.
      try {
        await item4HealIncompletePreparingVariants(env);
      } catch (error) {
        console.warn("item4 preparing variant-gap heal failed", error);
      }
      // :00 already harvested above. :30 resumes drafts already opened.
      if (Number(cadence.minute) !== 0) {
        try {
          await runStudioAutonomousProduce(null, env, { permissions: { tenant_admin: true } }, ctx, {
            scheduled: true,
            cron: event?.cron || "",
            cronMinute: cadence.minute,
          });
        } catch (error) {
          console.warn("autonomous produce cadence failed", error);
        }
      }
      try {
        await syncProductionCadence(env, { skipRenderPulse: true });
      } catch (error) {
        console.warn("production cadence cron failed", error);
      }
      if (cadence.insights) {
        let firstPartyAnalyticsSweep = null;
        try {
          firstPartyAnalyticsSweep = await studioSweepPublishedInsights(env, { limit: 8 });
        } catch (error) {
          console.warn("insights sweep cron failed", error);
        }
        for (const profile of firstPartyAnalyticsSweep?.profiles || []) {
          try {
            await studioRecomputeInsightsLearned(env, { profile });
          } catch (error) {
            console.warn("insights learned-model recompute failed", profile, error);
          }
        }
        try {
          await studioDiscoverYoutubeChicagoCreators(env, { theme: "chicago", limit: 5, scheduled: true });
        } catch (error) {
          console.warn("insights youtube discovery cron failed", error);
        }
        try {
          await studioEngagementCron(env, engagementDeps());
        } catch (error) {
          console.warn("engagement discovery cron failed", error);
        }
      }
      if (cadence.ingest) {
        try {
          await item4PulsePipelineStage(env, "a1s", { extra: { live_status: true } }, "A1S");
        } catch (error) {
          console.warn("a1s compression watchdog failed", error);
        }
        try {
          await item4PulsePipelineStage(env, "a1s", { extra: {} }, "A1S");
        } catch (error) {
          console.warn("a1s ingestion scan failed", error);
        }
        try {
          await item4PulsePipelineStage(env, "a2", {
            extra: { drain: true, trigger_a2b: true, wait_for_next: false },
          }, "A2");
        } catch (error) {
          console.warn("a2 ingestion drain failed", error);
        }
      }
      try {
        await studioSweepPostPublishMediaRelease(env, { limit: POST_PUBLISH_RELEASE_BATCH_LIMIT });
      } catch (error) {
        console.warn("post-publish media release cron failed", error);
      }
    })());
    // Daily I1 must not depend on heavy (:00/:30) alone. Chicago hour 1 is only
    // ~two heavy ticks; if either is skipped under Airtable cool-down load, the
    // whole day is lost. Retry on every */5 tick while hour===1, plus dedicated
    // 06:00 UTC cron. already_ran_today / per-profile recent-batch guards
    // prevent duplicate slates.
    const chicagoIdeas = chicagoNowParts();
    const dailyIdeasCron = String(event?.cron || "").trim() === "0 6 * * *";
    if (cadence.heavy || dailyIdeasCron || chicagoIdeas.hour === 1) {
      ctx.waitUntil(runStudioDailyIdeas(null, env, { permissions: { tenant_admin: true } }, ctx, {
        scheduled: true,
        cron: event?.cron || "",
      }).catch((error) => {
        console.warn("daily idea cadence failed", error);
      }));
    }
  },
};

/** Light vs heavy Airtable spend for Worker cron (UTC minute buckets on five-minute ticks). */
/*__STUDIO_WORKER_EXTRACT:studioCronAirtableCadence__*/
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/*__STUDIO_WORKER_EXTRACT:accessIdentity__*/
const STUDIO_TABLES = {
  users: "Studio Users",
  memberships: "Studio Memberships",
  organizations: "Organizations",
  brands: "Brands",
};

const ROLE_PERMISSIONS = {
  Owner: {
    ideas_create: true,
    ideas_edit: true,
    ideas_delete: true,
    ideas_promote: true,
    production_configure: true,
    outputs_review: true,
    publishing_control: true,
    tenant_admin: true,
  },
  Admin: {
    ideas_create: true,
    ideas_edit: true,
    ideas_delete: true,
    ideas_promote: true,
    production_configure: true,
    outputs_review: true,
    publishing_control: true,
    tenant_admin: true,
  },
  Editor: {
    ideas_create: true,
    ideas_edit: true,
    ideas_delete: false,
    ideas_promote: true,
    production_configure: true,
    outputs_review: true,
    publishing_control: false,
    tenant_admin: false,
  },
  Reviewer: {
    ideas_create: false,
    ideas_edit: false,
    ideas_delete: false,
    ideas_promote: false,
    production_configure: false,
    outputs_review: true,
    publishing_control: false,
    tenant_admin: false,
  },
  Viewer: {
    ideas_create: false,
    ideas_edit: false,
    ideas_delete: false,
    ideas_promote: false,
    production_configure: false,
    outputs_review: false,
    publishing_control: false,
    tenant_admin: false,
  },
};

/*__STUDIO_WORKER_EXTRACT:resolveAuthorization__*/
/*__STUDIO_WORKER_EXTRACT:resolveStudioCronAuthorization__*/
/*__STUDIO_WORKER_EXTRACT:membershipAllowsBrand__*/
/*__STUDIO_WORKER_EXTRACT:requireConfig__*/
/*__STUDIO_WORKER_EXTRACT:allowedOrigins__*/
/*__STUDIO_WORKER_EXTRACT:corsHeaders__*/
/*__STUDIO_WORKER_EXTRACT:corsPreflight__*/
/*__STUDIO_WORKER_EXTRACT:respond__*/
/*__STUDIO_WORKER_EXTRACT:assertWriteRequest__*/
/*__STUDIO_WORKER_EXTRACT:assertOriginWriteRequest__*/
/*__STUDIO_WORKER_EXTRACT:assertUploadWriteRequest__*/
/*__STUDIO_WORKER_EXTRACT:readJsonBody__*/
/*__STUDIO_WORKER_EXTRACT:requirePermission__*/
/*__STUDIO_WORKER_EXTRACT:requireAnyPermission__*/
/*__STUDIO_WORKER_EXTRACT:sleepMs__*/
// Pace Airtable calls per isolate without a shared Promise chain.
// A module-level `airtableQueue.then(...)` wedged the isolate when a request
// was canceled mid-slot (CF hung / "will never generate a response" / UI 500):
// 203 exceptions + 213 hung cancels after 0.10.524. Each call sleeps locally
// for short gaps only; long cooldowns fail fast as HTTP 429.
const AIRTABLE_MIN_GAP_MS = 250;
// A 2s gap is normal when Pipeline and Home share the slot. Waiting it out
// returns the list. Only a real Airtable penalty (30s) fails fast.
const AIRTABLE_SLOT_FAIL_FAST_MS = 8000;
let airtableNextRequestAt = 0;
/*__STUDIO_WORKER_EXTRACT:airtableCooldownWaitMs__*/
async function airtableRequestSlot() {
  const now = Date.now();
  const wait = Math.max(0, airtableNextRequestAt - now);
  if (wait > AIRTABLE_SLOT_FAIL_FAST_MS) {
    throw new HttpError(429, `Airtable cooling down (${Math.ceil(wait / 1000)}s); try again shortly`);
  }
  airtableNextRequestAt = Math.max(now, airtableNextRequestAt) + AIRTABLE_MIN_GAP_MS;
  if (wait) await sleepMs(wait);
}

/*__STUDIO_WORKER_EXTRACT:airtableRetryDelayMs__*/
const studioHotReadCache = new Map();

/*__STUDIO_WORKER_EXTRACT:studioReadCachePrune__*/
/*__STUDIO_WORKER_EXTRACT:studioReadCacheDropPrefix__*/
let studioListWriteGeneration = 0;
function studioMarkMappedListDirty() {
  studioListWriteGeneration += 1;
}

/*__STUDIO_WORKER_EXTRACT:studioSupabaseWriteThroughOutput__*/
/*__STUDIO_WORKER_EXTRACT:studioInvalidateHotReads__*/
/*__STUDIO_WORKER_EXTRACT:studioReadCoalesce__*/
async function airtableFetch(env, tableId, pathOrParams = "", options = {}) {
  studioInvalidateHotReads(env, tableId, options?.method);
  const suffix = pathOrParams ? (pathOrParams.startsWith("?") || pathOrParams.startsWith("/") ? pathOrParams : `/${pathOrParams}`) : "";
  const tableRef = encodeURIComponent(String(tableId));
  const endpoint = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableRef}${suffix}`;
  await airtableRequestSlot();
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_PAT}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const responseText = await response.text();
  let body = {};
  try { body = responseText ? JSON.parse(responseText) : {}; } catch { body = { raw: responseText }; }
  if (response.status === 429) {
    const cooldown = airtableRetryDelayMs(response, 1);
    airtableNextRequestAt = Math.max(airtableNextRequestAt, Date.now() + cooldown);
    console.warn("Airtable rate limited; failing fast", { attempt: 1, cooldownMs: cooldown });
  }
  if (!response.ok) {
    const airtableType = body?.error?.type ? String(body.error.type) : "";
    const airtableMessage = body?.error?.message ? String(body.error.message) : "";
    const detail = [airtableType, airtableMessage].filter(Boolean).join(": ");
    throw new HttpError(response.status, detail ? `Airtable: ${detail}` : `Airtable request failed (${response.status})`);
  }
  return body;
}

const AIRTABLE_BATCH_LIMIT = 10;

/*__STUDIO_WORKER_EXTRACT:airtableBatchCreate__*/
/*__STUDIO_WORKER_EXTRACT:airtableBatchUpdate__*/
/*__STUDIO_WORKER_EXTRACT:mapPool__*/
/*__STUDIO_WORKER_EXTRACT:clampLimit__*/
/*__STUDIO_WORKER_EXTRACT:listRecords__*/
/*__STUDIO_WORKER_EXTRACT:listRecordsPage__*/
/*__STUDIO_WORKER_EXTRACT:f__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputIsNativePhotoRoute__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputIsNativePhoto__*/
/*__STUDIO_WORKER_EXTRACT:studioNativeStillsNeedLettering__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputNeedsGridCoverForReview__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputHasReviewCover__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputHasReviewableDeliverable__*/
/*__STUDIO_WORKER_EXTRACT:studioClipPublicCdnUrl__*/
/*__STUDIO_WORKER_EXTRACT:item4UrlIsPublicPublishCdn__*/
/*__STUDIO_WORKER_EXTRACT:studioYoutubePublicSourceUrl__*/
/*__STUDIO_WORKER_EXTRACT:mapYoutubePrivateSourceDeskRow__*/
/*__STUDIO_WORKER_EXTRACT:studioYoutubeFailedPrivateSource__*/
/*__STUDIO_WORKER_EXTRACT:studioYoutubePublishAssetKey__*/
/*__STUDIO_WORKER_EXTRACT:studioStageYoutubePublicMp4FromDrive__*/
/*__STUDIO_WORKER_EXTRACT:item4FinishedVideoPreviewKey__*/
/*__STUDIO_WORKER_EXTRACT:item4FinishedMasterPlayUrl__*/
/*__STUDIO_WORKER_EXTRACT:item4UrlIsPublicPlayableVideo__*/
/*__STUDIO_WORKER_EXTRACT:studioNativeClipsArePublicCdn__*/
/*__STUDIO_WORKER_EXTRACT:studioNativeSlidePublicFields__*/
/*__STUDIO_WORKER_EXTRACT:studioUrlLooksLikeImage__*/
/*__STUDIO_WORKER_EXTRACT:studioUrlLooksLikeVideo__*/
/*__STUDIO_WORKER_EXTRACT:studioUrlLooksLikeDriveFile__*/
/*__STUDIO_WORKER_EXTRACT:outputHasVideoFinal__*/
/*__STUDIO_WORKER_EXTRACT:studioMappedPreviewUrl__*/
/*__STUDIO_WORKER_EXTRACT:studioPublicJpegCoverUrl__*/
/*__STUDIO_WORKER_EXTRACT:studioNativeStillPreviewUrl__*/
/*__STUDIO_WORKER_EXTRACT:studioPreviewKind__*/
// Approve used to stamp every platform "Ready to Publish" / TikTok "Ready for Assets"
// even when Scheduled_Post_Date is still in the future. That reads like unfinished
 // asset work when the render is already done and the only wait is the schedule window.
/*__STUDIO_WORKER_EXTRACT:studioArmedPublishStatus__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishHandoffFields__*/
/*__STUDIO_WORKER_EXTRACT:studioPatchExistingNativeSlides__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsureNativePublishSlides__*/
/*__STUDIO_WORKER_EXTRACT:studioMixRerenderInProgress__*/
/*__STUDIO_WORKER_EXTRACT:normalizedOutputState__*/
const CONTENT_OUTPUT_TERMINAL_STATES = new Set([
  "Published",
  "Scheduled",
  "Draft Delivered",
  "Skipped",
]);

/*__STUDIO_WORKER_EXTRACT:contentLifecycleFromOutputs__*/
/*__STUDIO_WORKER_EXTRACT:normalizedContentStage__*/
/*__STUDIO_WORKER_EXTRACT:mapIdea__*/
/*__STUDIO_WORKER_EXTRACT:parseIdeaPhotoMatchJson__*/
/*__STUDIO_WORKER_EXTRACT:firstIdeaProductionRequestId__*/
const IDEA_PHOTO_WAIT_TYPES = new Set(["Carousel", "Photo Set", "Feed Post", "Vertical Short Video"]);

/*__STUDIO_WORKER_EXTRACT:ideaPhotoWaitApplies__*/
/*__STUDIO_WORKER_EXTRACT:sortHighConfidenceMatches__*/
/*__STUDIO_WORKER_EXTRACT:selectMatchedPhotos__*/
/*__STUDIO_WORKER_EXTRACT:mapContent__*/
/*__STUDIO_WORKER_EXTRACT:outputProgressMilestoneFloor__*/
/*__STUDIO_WORKER_EXTRACT:outputProgressPercent__*/
/*__STUDIO_WORKER_EXTRACT:platformPublishStatus__*/
/*__STUDIO_WORKER_EXTRACT:cleanMusicDisplayName__*/
/*__STUDIO_WORKER_EXTRACT:selectedVisualClips__*/
/*__STUDIO_WORKER_EXTRACT:outputCreativeAvailable__*/
/*__STUDIO_WORKER_EXTRACT:mapOutput__*/
/*__STUDIO_WORKER_EXTRACT:safeMusicExtension__*/
/*__STUDIO_WORKER_EXTRACT:musicPreviewKey__*/
/*__STUDIO_WORKER_EXTRACT:extractGoogleDriveFileId__*/
/*__STUDIO_WORKER_EXTRACT:googleDriveFileId__*/
/*__STUDIO_WORKER_EXTRACT:googleDriveDownloadUrl__*/
/*__STUDIO_WORKER_EXTRACT:studioMusicLibraryUrlPrefix__*/
/*__STUDIO_WORKER_EXTRACT:isStudioLibraryMusicUrl__*/
/*__STUDIO_WORKER_EXTRACT:studioMusicR2KeyFromUrl__*/
/*__STUDIO_WORKER_EXTRACT:isMusicLibraryFile__*/
/*__STUDIO_WORKER_EXTRACT:isStudioLibraryMusicRecord__*/
/*__STUDIO_WORKER_EXTRACT:mapMusic__*/
/*__STUDIO_WORKER_EXTRACT:findOfficialLogoRecord__*/
/*__STUDIO_WORKER_EXTRACT:fetchGoogleDriveImage__*/
/*__STUDIO_WORKER_EXTRACT:brandLogo__*/
/*__STUDIO_WORKER_EXTRACT:buildIdeasListPayload__*/
/*__STUDIO_WORKER_EXTRACT:listIdeas__*/
/*__STUDIO_WORKER_EXTRACT:airtableFormulaEscape__*/
/*__STUDIO_WORKER_EXTRACT:requestedProfileId__*/
/*__STUDIO_WORKER_EXTRACT:studioNormalizeProfileKey__*/
/*__STUDIO_WORKER_EXTRACT:studioThemeForProfile__*/
/*__STUDIO_WORKER_EXTRACT:studioSettingsPrefixForTheme__*/
const STUDIO_CITY_DESTINATION_KEYS = new Set([
  "FACEBOOK_PAGE_ID",
  "FACEBOOK_PAGE_ACCESS_TOKEN",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
  "META_GRAPH_API_ACCESS_TOKEN",
  "YOUTUBE_CHANNEL_ID",
  "YOUTUBE_UPLOAD_SERVICE_URL",
  "YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET",
  "TIKTOK_WORKER_BASE_URL",
]);

/*__STUDIO_WORKER_EXTRACT:studioContentProfileRecordIdForOutput__*/
/*__STUDIO_WORKER_EXTRACT:studioThemeForPublishRecord__*/
/*__STUDIO_WORKER_EXTRACT:studioCityLabel__*/
/*__STUDIO_WORKER_EXTRACT:studioScheduleTimeZoneFromTheme__*/
/*__STUDIO_WORKER_EXTRACT:studioScheduleTimeZoneForProfile__*/
/*__STUDIO_WORKER_EXTRACT:studioScheduleTimeZoneFromPayload__*/
/*__STUDIO_WORKER_EXTRACT:studioScheduleTimeZoneForRecord__*/
/*__STUDIO_WORKER_EXTRACT:normalizeStudioBackgroundColor__*/
/*__STUDIO_WORKER_EXTRACT:studioBackgroundColorForRecord__*/
/*__STUDIO_WORKER_EXTRACT:mapStudioContentProfile__*/
/*__STUDIO_WORKER_EXTRACT:contentProfileFilterFormula__*/
// Keep unfinished / scheduled / draft-delivered rows on Pipeline even after newer
// packages push them past the newest-N window (CI 206 / outputs 887–892 fell off
// when Output_ID crossed ~1034 while the UI only fetched newest 100).
// Fully Published packages stay off this scan so they only appear in Archive when
// they are still inside the newest-N window.
// TikTok Manual Fallback (auth-signature 401 park) must stay open — FIND("Manual Action")
// does not match "Manual Fallback", which is why CI 143 / Output 847 vanished.
const STUDIO_PIPELINE_OPEN_OUTPUT_LIMIT = 1000;
const STUDIO_PIPELINE_OPEN_FIELD_FORMULA = "{Studio_Pipeline_Open}=1";
const STUDIO_PIPELINE_OPEN_LEGACY_FORMULA = 'AND({Test_Run_ID}=BLANK(),{Output_Status}!="Skipped",OR('
  + '{Published_At}=BLANK(),'
  + '{Output_Status}!="Published",'
  + '{Publish_Status}!="Published",'
  + '{Publish_Status}="Failed",'
  + '{Manual_Fallback_Required}=1,'
  + 'FIND("Manual Action",{TikTok_Draft_Status}&""),'
  + 'FIND("Manual Fallback",{TikTok_Draft_Status}&""),'
  + 'FIND("Draft Delivered",{TikTok_Draft_Status}&""),'
  + '{TikTok_Draft_Status}="Ready for Delivery",'
  + '{TikTok_Draft_Status}="Retry Pending"'
  + '))';

/*__STUDIO_WORKER_EXTRACT:studioPipelineOpenOutputFormula__*/
/*__STUDIO_WORKER_EXTRACT:mergePipelineOutputRecords__*/
/*__STUDIO_WORKER_EXTRACT:studioPipelineContentIdsFromOutputs__*/
/*__STUDIO_WORKER_EXTRACT:listPipelineOutputsForContentIds__*/
/*__STUDIO_WORKER_EXTRACT:listPipelineContentByIds__*/
/*__STUDIO_WORKER_EXTRACT:studioApproveAllCandidateFormula__*/
/*__STUDIO_WORKER_EXTRACT:listContentProfileRecords__*/
/*__STUDIO_WORKER_EXTRACT:resolveAuthorizedContentProfiles__*/
/*__STUDIO_WORKER_EXTRACT:resolveWorkingContentProfile__*/
/*__STUDIO_WORKER_EXTRACT:resolveDefaultContentProfile__*/
/*__STUDIO_WORKER_EXTRACT:listStudioContentProfiles__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileOnboardingHandlers__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileSetupRecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileSetupPlatformFromPath__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileSetupBelongsToAuthorization__*/
/*__STUDIO_WORKER_EXTRACT:loadAuthorizedStudioProfileSetupRecord__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileSetupStateFromRecord__*/
/*__STUDIO_WORKER_EXTRACT:loadStudioProfileSetupState__*/
/*__STUDIO_WORKER_EXTRACT:saveStudioProfileSetupState__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileSetupBrandId__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileSetupProfileFields__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileSetupConnectionSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileSetupSummary__*/
/*__STUDIO_WORKER_EXTRACT:listStudioProfileSetups__*/
/*__STUDIO_WORKER_EXTRACT:createStudioProfileSetup__*/
/*__STUDIO_WORKER_EXTRACT:getStudioProfileSetup__*/
/*__STUDIO_WORKER_EXTRACT:patchStudioProfileSetup__*/
/*__STUDIO_WORKER_EXTRACT:updateStudioProfileSetupPlatform__*/
/*__STUDIO_WORKER_EXTRACT:activateStudioProfileSetup__*/
/*__STUDIO_WORKER_EXTRACT:cleanIdeaCreatePayload__*/
/*__STUDIO_WORKER_EXTRACT:createIdea__*/
/*__STUDIO_WORKER_EXTRACT:ideaRecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:loadAuthorizedIdea__*/
/*__STUDIO_WORKER_EXTRACT:assertIdeaUnpromoted__*/
/*__STUDIO_WORKER_EXTRACT:assertIdeaNotApproved__*/
/*__STUDIO_WORKER_EXTRACT:cleanIdeaUpdatePayload__*/
/*__STUDIO_WORKER_EXTRACT:updateIdea__*/
/*__STUDIO_WORKER_EXTRACT:holdIdea__*/
/*__STUDIO_WORKER_EXTRACT:restoreIdea__*/
/*__STUDIO_WORKER_EXTRACT:deleteIdea__*/
const PRODUCTION_REQUEST_OUTPUT_TABLE = "Production Request Outputs";

const PRO_OUTPUT_TYPES_BY_PLATFORM = Object.freeze({
  Instagram: new Set(["Reel", "Story", "Single Image", "Carousel"]),
  Facebook: new Set(["Reel", "Story", "Single Image", "Multi-Image Post", "Slideshow Reel"]),
  TikTok: new Set(["Video Draft", "Story", "Single Photo", "Multi-Photo"]),
  YouTube: new Set(["Short", "Standard Video", "Slideshow Video"]),
});

const PRO_OUTPUT_OVERRIDE_TRISTATE = new Set(["Inherit", "Use Profile Default", "Yes", "No"]);
const PRO_OUTPUT_THUMBNAIL_OVERRIDE = new Set(["Inherit", "Use Profile Default", "Yes", "No", "Use photo frame"]);
const PRO_OUTPUT_COUNT_MODES = new Set(["Inherit", "AI decides", "Exact", "Target range"]);
const PRO_OUTPUT_CAROUSEL_IMAGE_MODES = new Set(["Inherit", "Make AI Generated", "Manual Upload"]);
const PRO_OUTPUT_TEXT_MODES = new Set(["Inherit", "AI decides", "Force exact", "AI improve", "Leave blank"]);
const PRO_OUTPUT_PUBLISH_MODES = new Set(["Inherit", "Auto Publish", "Manual Review", "Do Not Publish"]);

/*__STUDIO_WORKER_EXTRACT:productionRequestIdFromOutputsPath__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestOutputIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:makeProductionRequestOutputId__*/
/*__STUDIO_WORKER_EXTRACT:normalizeOutputType__*/
/*__STUDIO_WORKER_EXTRACT:mapProductionRequestOutput__*/
/*__STUDIO_WORKER_EXTRACT:outputRowsForProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:loadAuthorizedProductionRequestOutput__*/
/*__STUDIO_WORKER_EXTRACT:assertEditableProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:listProductionRequestOutputs__*/
/*__STUDIO_WORKER_EXTRACT:syncProductionRequestOutputs__*/
/*__STUDIO_WORKER_EXTRACT:cleanProductionRequestOutputPatch__*/
/*__STUDIO_WORKER_EXTRACT:getProductionRequestOutput__*/
/*__STUDIO_WORKER_EXTRACT:updateProductionRequestOutput__*/
const ITEM4_MEDIA_PUBLIC_BASE = "https://media.chicagoshining.com";
const STUDIO_CHICAGO_WATERMARK_MEDIA_ASSET_ID = "recTnq3abS2rcsTzK";
const STUDIO_CHICAGO_WATERMARK_R2_KEY = "studio/previews/branding/chicagoshining-watermark.png";
const STUDIO_CHICAGO_WATERMARK_PUBLIC_URL = "https://studio.chicagoshining.com/api/public/branding/watermark.png";
const ITEM4_MAPPING_TABLE = "Platform Output Mappings";
const ITEM4_MAX_FILES_PER_UPLOAD_REQUEST = 60;
const ITEM4_MAX_FILE_BYTES = 25 * 1024 * 1024;
const ITEM4_MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const ITEM4_MAX_CLIP_FILE_BYTES = 200 * 1024 * 1024;
const ITEM4_FINISHED_VIDEO_HARD_MAX_BYTES = Math.round(1.5 * 1024 * 1024 * 1024);
const ITEM4_LARGE_UPLOAD_PART_BYTES = 16 * 1024 * 1024;
const ITEM4_COMPRESS_THRESHOLD_BYTES = 100 * 1024 * 1024;
const ITEM4_MAX_MIXED_TOTAL_BYTES = 1500 * 1024 * 1024;
const ITEM4_CLIP_INPUTS = Object.freeze(["photos-and-clips", "video-clips"]);
const ITEM4_NATIVE_STILL_OUTPUTS = Object.freeze({
  Instagram: Object.freeze(["Single Image", "Carousel"]),
  Facebook: Object.freeze(["Single Image", "Multi-Image Post"]),
  TikTok: Object.freeze(["Single Photo", "Multi-Photo"]),
});
const ITEM4_VIDEO_DEFAULTS = Object.freeze({
  Instagram: "Reel",
  Facebook: "Reel",
  TikTok: "Video Draft",
  YouTube: "Short",
});

const ITEM4_RATIO_SPECS = Object.freeze({
  "4:5": Object.freeze({ width: 1080, height: 1350 }),
  "9:16": Object.freeze({ width: 1080, height: 1920 }),
  "1:1": Object.freeze({ width: 1080, height: 1080 }),
  "16:9": Object.freeze({ width: 1920, height: 1080 }),
});

const ITEM4_PLAN_SPECS = Object.freeze({
  Instagram: Object.freeze({
    default_output_type: "Reel",
    options: Object.freeze({
      "Carousel": { mapping_type: "Instagram Carousel", format: "Carousel", rationale: "Optional. Publishes a silent swipeable 4:5 Instagram carousel with no music or voiceover." },
      "Reel": { mapping_type: "Instagram Reel", format: "Vertical Short Video", rationale: "Default. Renders the photos as a 9:16 Instagram Reel with music and voiceover." },
      "Single Image": { mapping_type: "Instagram Feed Post", format: "Feed Post", rationale: "Use one hero photo as a feed post." },
      "Story": { mapping_type: "Instagram Story", format: "Story", rationale: "Companion 10-second 9:16 Story from the first photo, with a slight zoom and the same music. After the main post is live, the Story can link through to that Reel or feed post." },
    }),
  }),
  Facebook: Object.freeze({
    default_output_type: "Slideshow Reel",
    options: Object.freeze({
      "Multi-Image Post": { mapping_type: "Facebook Photo Set", format: "Photo Set", rationale: "Optional. Publishes a silent native Facebook multi-photo so people can swipe each still. No music or voiceover." },
      "Slideshow Reel": { mapping_type: "Facebook Reel", format: "Vertical Short Video", rationale: "Default. Renders the same photos as a 9:16 Facebook Reel with music and voiceover." },
      "Reel": { mapping_type: "Facebook Reel", format: "Vertical Short Video", rationale: "Creates a 9:16 Facebook Reel from shot video, not from a photo set." },
      "Single Image": { mapping_type: "Facebook Post", format: "Feed Post", rationale: "Use one hero photo as a Facebook post." },
      "Story": { mapping_type: "Facebook Story", format: "Story", rationale: "Companion 10-second 9:16 Story from the first photo, with a slight zoom and the same music. After the main post is live, the Story can link through to that Reel or photo post." },
    }),
  }),
  TikTok: Object.freeze({
    default_output_type: "Multi-Photo",
    options: Object.freeze({
      "Multi-Photo": { mapping_type: "TikTok Slideshow", format: "Photo Set", rationale: "Uses TikTok's photo/slideshow experience with a 9:16 safe presentation." },
      "Video Draft": { mapping_type: "TikTok Video", format: "Vertical Short Video", rationale: "Renders the source photos as a 9:16 TikTok video draft." },
      "Single Photo": { mapping_type: "TikTok Slideshow", format: "Feed Post", rationale: "Use one hero photo as a TikTok photo post." },
    }),
  }),
  YouTube: Object.freeze({
    default_output_type: "Slideshow Video",
    options: Object.freeze({
      "Slideshow Video": { mapping_type: "YouTube Short", format: "Vertical Short Video", rationale: "Renders the five photos into a 9:16 YouTube Short." },
      "Short": { mapping_type: "YouTube Short", format: "Vertical Short Video", rationale: "Creates a 9:16 YouTube Short from the photo sequence." },
      "Standard Video": { mapping_type: "YouTube Longform", format: "Longform Video", rationale: "Creates a 16:9 standard YouTube video." },
    }),
  }),
});

/*__STUDIO_WORKER_EXTRACT:item4ParseJson__*/
/*__STUDIO_WORKER_EXTRACT:item4RequestIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:item4AssetIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:item4SafeFileName__*/
/*__STUDIO_WORKER_EXTRACT:item4FileExtension__*/
/*__STUDIO_WORKER_EXTRACT:item4IsHeicFile__*/
/*__STUDIO_WORKER_EXTRACT:item4IsSupportedImageFile__*/
/*__STUDIO_WORKER_EXTRACT:item4IsSupportedVideoFile__*/
/*__STUDIO_WORKER_EXTRACT:item4IsClipInputKind__*/
/*__STUDIO_WORKER_EXTRACT:item4LooksLikeVideoAsset__*/
/*__STUDIO_WORKER_EXTRACT:item4AssetCompressionPending__*/
/*__STUDIO_WORKER_EXTRACT:item4AssetsNeedStudioCompress__*/
/*__STUDIO_WORKER_EXTRACT:item4HealStaleCompressionAssets__*/
/*__STUDIO_WORKER_EXTRACT:item4HasVideoMasters__*/
/*__STUDIO_WORKER_EXTRACT:item4AssetMediaKind__*/
/*__STUDIO_WORKER_EXTRACT:item4LooksLikeImagePreviewUrl__*/
/*__STUDIO_WORKER_EXTRACT:item4IsClipPosterFile__*/
/*__STUDIO_WORKER_EXTRACT:item4PutClipPoster__*/
/*__STUDIO_WORKER_EXTRACT:item4GoogleAccessToken__*/
/*__STUDIO_WORKER_EXTRACT:studioFetchAuthenticatedDriveImageBytes__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsurePublicChicagoWatermark__*/
/*__STUDIO_WORKER_EXTRACT:publicChicagoShiningWatermark__*/
/*__STUDIO_WORKER_EXTRACT:item4FetchDriveThumbnailBytes__*/
/*__STUDIO_WORKER_EXTRACT:item4StampAssetPoster__*/
/*__STUDIO_WORKER_EXTRACT:item4BuildClipPostersLocally__*/
/*__STUDIO_WORKER_EXTRACT:item4PlayableMediaUrl__*/
/*__STUDIO_WORKER_EXTRACT:item4VideoStreamPath__*/
/*__STUDIO_WORKER_EXTRACT:item4VideoVariantReady__*/
/*__STUDIO_WORKER_EXTRACT:item4IsNativeStillOutput__*/
/*__STUDIO_WORKER_EXTRACT:item4NormalizedMimeType__*/
/*__STUDIO_WORKER_EXTRACT:item4AssetManifest__*/
/*__STUDIO_WORKER_EXTRACT:item4NormalizeSlideCaptions__*/
/*__STUDIO_WORKER_EXTRACT:item4ApplySlideCaptions__*/
/*__STUDIO_WORKER_EXTRACT:item4JoinedSlideCaptions__*/
/*__STUDIO_WORKER_EXTRACT:item4RequestedCaptionIsSlideDump__*/
const ITEM4_LEFTOVER_OVERLAYS = new Set([
  "rainy downtown chicago",
  "chicago loop",
  "michigan avenue in the rain",
  "the chicago riverwalk",
]);

/*__STUDIO_WORKER_EXTRACT:item4IsLeftoverOverlayText__*/
/*__STUDIO_WORKER_EXTRACT:item4OutputHasLeftoverOverlay__*/
/*__STUDIO_WORKER_EXTRACT:item4PreferredOverlayText__*/
/*__STUDIO_WORKER_EXTRACT:item4UnletteredClipUrl__*/
/*__STUDIO_WORKER_EXTRACT:item4FillAiOverlayFallbacks__*/
/*__STUDIO_WORKER_EXTRACT:item4OverlayCaptionBySourceId__*/
/*__STUDIO_WORKER_EXTRACT:studioRepairLeftoverNativeLettering__*/
/*__STUDIO_WORKER_EXTRACT:studioBurnedInOverlayPosition__*/
/*__STUDIO_WORKER_EXTRACT:phase6DefaultOverlayPosition__*/
const STUDIO_SHARED_VERTICAL_SHORT_TYPES = new Set(["Reel", "Short", "Video Draft"]);

/*__STUDIO_WORKER_EXTRACT:studioSharedVerticalShortOutput__*/
/*__STUDIO_WORKER_EXTRACT:studioSiblingVerticalShortOutputs__*/
/*__STUDIO_WORKER_EXTRACT:studioSharedAudioMixFieldNames__*/
/*__STUDIO_WORKER_EXTRACT:studioPickSharedAudioMixFields__*/
/*__STUDIO_WORKER_EXTRACT:studioSharedRenderRerenderFields__*/
/*__STUDIO_WORKER_EXTRACT:studioPatchSiblingVerticalShortOutputs__*/
/*__STUDIO_WORKER_EXTRACT:item4PhotoOverlayFromCaption__*/
const ITEM4_MEDIA_ASSET_TABLE = "tblSITCujCsJTNcDe";

/*__STUDIO_WORKER_EXTRACT:item4MasterTransferId__*/
/*__STUDIO_WORKER_EXTRACT:item4MasterQueueRows__*/
/*__STUDIO_WORKER_EXTRACT:item4UpsertMasterQueue__*/
/*__STUDIO_WORKER_EXTRACT:item4FindMasterMediaAsset__*/
/*__STUDIO_WORKER_EXTRACT:item4CreateMasterMediaAsset__*/
/** Stamp Content_Profile on a Media Asset that was created without one (AI masters). */
/*__STUDIO_WORKER_EXTRACT:item4EnsureMediaAssetContentProfile__*/
/*__STUDIO_WORKER_EXTRACT:item4SanitizeStudioImageMediaAsset__*/
/*__STUDIO_WORKER_EXTRACT:item4ReconcileMasterAuthority__*/
/*__STUDIO_WORKER_EXTRACT:item4UpdateRequestState__*/
/*__STUDIO_WORKER_EXTRACT:getItem4MasterAssets__*/
/*__STUDIO_WORKER_EXTRACT:item4LargeUploadSessionIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:item4LargeUploadPartNumberFromPath__*/
/*__STUDIO_WORKER_EXTRACT:item4FindLargeUploadDraft__*/
/*__STUDIO_WORKER_EXTRACT:createItem4LargeVideoUploadSession__*/
/*__STUDIO_WORKER_EXTRACT:uploadItem4LargeVideoPart__*/
/*__STUDIO_WORKER_EXTRACT:completeItem4LargeVideoUploadSession__*/
/*__STUDIO_WORKER_EXTRACT:abortItem4LargeVideoUploadSession__*/
/*__STUDIO_WORKER_EXTRACT:uploadItem4MasterAssets__*/
/*__STUDIO_WORKER_EXTRACT:reorderItem4MasterAssets__*/
/*__STUDIO_WORKER_EXTRACT:deleteItem4MasterAsset__*/
/*__STUDIO_WORKER_EXTRACT:uploadItem4ClipPoster__*/
/**
 * Idea ↔ library still matching.
 *
 * Contract for future automation (auto-ideas from new photos):
 * - high  → safe to auto-attach: named place on Location/Asset Name, or a
 *   subject word on Location/Asset Name, or two subject words in metadata
 * - medium → show in picker unchecked; do not auto-attach
 * - low/none → omit unless the operator searched
 *
 * Same-day intake alone is never enough — that mixed Andersonville with Pilsen.
 * One generic summary noun (cars, ride) is never enough — that mixed CTA with Andersonville.
 */
const IDEA_LIBRARY_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "over", "onto",
  "your", "their", "about", "then", "than", "when", "what", "where", "there",
  "here", "have", "has", "had", "are", "was", "were", "will", "can", "our",
  "idea", "photo", "photos", "image", "images", "still", "stills",
]);

const IDEA_LIBRARY_WEAK_TOKENS = new Set([
  "chicago", "street", "streets", "neighborhood", "urban", "city", "town",
  "north", "south", "east", "west", "side", "stroll", "walk", "walking",
  "scene", "scenes", "local", "color", "colorful", "building", "buildings",
  "brick", "sidewalk", "tables", "patio", "storefront", "storefronts",
  "museum", "american", "commercial", "outdoor", "dining", "public",
  "car", "cars", "ride", "rides", "riding", "look", "looks", "looking",
  "visitor", "visitors", "actually", "crush", "picture", "pictures",
  "show", "they", "tap", "before", "first", "timer", "station", "stations",
  "people", "person", "parked", "traffic",
]);

const IDEA_LIBRARY_SHORT_SUBJECTS = new Set(["cta"]);

/** Mirrored from idea-photo-wait.mjs — transit brands stay in the scan with place keys. */
const IDEA_LIBRARY_BRAND_SUBJECTS = new Set([
  "cta", "metra", "amtrak", "pace", "divvy", "uber", "lyft",
]);
// A neighborhood label must not hide images about a distinctive named subject.
// Keep this conservative: generic words such as "walk", "night", "street"
// still cannot broaden a Greenwich Village scan to unrelated NYC pictures.
const IDEA_LIBRARY_DISTINCTIVE_SUBJECTS = new Set([
  "jazz", "blues", "comedy", "opera", "theater", "theatre",
  "sushi", "ramen", "pizza", "speakeasy",
]);


const IDEA_LIBRARY_NAMED_PLACES = [
  "andersonville", "bridgeport", "bronzeville", "bucktown", "chinatown",
  "edgewater", "fulton market", "garfield park", "gold coast", "grant park",
  "humboldt park", "hyde park", "lakeview", "lincoln park", "lincoln square",
  "logan square", "the loop", "magnificent mile", "millennium park",
  "museum campus", "navy pier", "near north side", "old town", "pilsen",
  "printers row", "ravenswood", "river north", "rogers park", "south loop",
  "streeterville", "ukrainian village", "uptown", "west loop", "wicker park",
  "central park", "times square", "brooklyn bridge", "statue of liberty",
  "high line", "washington square", "bryant park", "grand central",
  "one world trade", "santa monica pier", "griffith observatory",
  "venice beach", "venice canals", "rodeo drive", "hollywood sign",
];

/*__STUDIO_WORKER_EXTRACT:ideaLibraryTokens__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryStrongTokens__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryHasToken__*/
/**
 * Operator typeahead / library search: whole-word or word-start prefix so
 * "museu" and "Museum" both find "museum". Place/auto-match still uses
 * whole-word `ideaLibraryHasToken`.
 */
/*__STUDIO_WORKER_EXTRACT:ideaLibrarySearchHit__*/
/** Airtable FIND keys for operator-typed search (keep weak tokens like museum). */
/*__STUDIO_WORKER_EXTRACT:ideaLibrarySearchFilterKeys__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryTokenForms__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryFieldHits__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryNamedPlaceKeys__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryMatchKeys__*/
/** Place anchors plus brand/transit subjects (Metra/CTA) so station locations do not hide title brands. */
/*__STUDIO_WORKER_EXTRACT:ideaLibraryFilterKeys__*/
/** Named places plus operator search. Title nouns like cars/ride are subjects, not places. */
/*__STUDIO_WORKER_EXTRACT:ideaLibraryPlaceKeys__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryAirtableEscape__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryNamePhraseFormula__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryFilterFormula__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryVideoFilterFormula__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryHaystack__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryIntakeDate__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryFileBytes__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryIsEligibleVideo__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryIsEligibleImage__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryRankAsset__*/
/*__STUDIO_WORKER_EXTRACT:mapIdeaLibraryAsset__*/
/*__STUDIO_WORKER_EXTRACT:getMediaLibraryStills__*/
/*__STUDIO_WORKER_EXTRACT:getIdeaLibrarySuggestions__*/
/*__STUDIO_WORKER_EXTRACT:ideaLibraryRejectReason__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileRequiresChicagoWatermark__*/
/*__STUDIO_WORKER_EXTRACT:item4ProductionProfileRecord__*/
/*__STUDIO_WORKER_EXTRACT:studioAssetHasChicagoWatermark__*/
/*__STUDIO_WORKER_EXTRACT:studioAssetSourceDriveId__*/
/*__STUDIO_WORKER_EXTRACT:ensureChicagoWatermarkedLibraryAssetForProfile__*/
/*__STUDIO_WORKER_EXTRACT:ensureChicagoWatermarkedLibraryAsset__*/
/*__STUDIO_WORKER_EXTRACT:attachItem4LibraryAssets__*/
/*__STUDIO_WORKER_EXTRACT:attachItem4LibraryAssetIds__*/
const ITEM4_FBS1_SCENARIO_ID = 5816409;
const ITEM4_FBS1_EXPECTED_WEBHOOK_ID = 2639647;

/*__STUDIO_WORKER_EXTRACT:item4EnsureFacebookSlideshowVoiceoverPayload__*/
/*__STUDIO_WORKER_EXTRACT:item4DynamicRationale__*/
/*__STUDIO_WORKER_EXTRACT:item4MappingIndex__*/
/*__STUDIO_WORKER_EXTRACT:item4PhotoCountKind__*/
/*__STUDIO_WORKER_EXTRACT:item4ParseEzOrigin__*/
/*__STUDIO_WORKER_EXTRACT:item4MasterLooksLikeVideo__*/
/*__STUDIO_WORKER_EXTRACT:studioRewriteFinishedOriginNotes__*/
/*__STUDIO_WORKER_EXTRACT:studioRewriteClipOriginNotes__*/
/*__STUDIO_WORKER_EXTRACT:studioFinishedOriginKind__*/
/*__STUDIO_WORKER_EXTRACT:item4PlanHasVideo__*/
/*__STUDIO_WORKER_EXTRACT:studioNormalizeFinishedOriginKind__*/
/*__STUDIO_WORKER_EXTRACT:studioIsFinishedPassthrough__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputTypeLabel__*/
/** Full finished-video file passthrough (Reels/Shorts/TikTok). Stories use a short Remotion teaser instead. */
/*__STUDIO_WORKER_EXTRACT:studioIsFinishedVideoFilePassthrough__*/
/*__STUDIO_WORKER_EXTRACT:item4FinishedStoryTeaserReady__*/
/*__STUDIO_WORKER_EXTRACT:item4FinishedPublicUrl__*/
/*__STUDIO_WORKER_EXTRACT:item4FinishedMasterReady__*/
/*__STUDIO_WORKER_EXTRACT:item4FinishedVideoMastersReady__*/
/*__STUDIO_WORKER_EXTRACT:studioFinishedVariantsSkipped__*/
const STUDIO_SCHEDULE_GAP_MS = 3 * 60 * 60 * 1000;

/*__STUDIO_WORKER_EXTRACT:studioScheduleMs__*/
/*__STUDIO_WORKER_EXTRACT:studioScheduleConflicts__*/
/*__STUDIO_WORKER_EXTRACT:studioNextOpenScheduleIso__*/
const STUDIO_OCCUPIED_CACHE_MS = 45 * 1000;
// Profile × platform × output-type lanes × (3 MAE + overflow) × up to 30 days.
// Headroom stays under a full horizon calendar so the nearest sort cannot
// drop day-1 mornings while ancient rows still fit in the page.
const STUDIO_OCCUPIED_LIST_LIMIT = 1200;
const STUDIO_OCCUPIED_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const STUDIO_OCCUPIED_HORIZON_MS = MAE_SUGGEST_HORIZON_DAYS * 24 * 60 * 60 * 1000;

/*__STUDIO_WORKER_EXTRACT:studioOccupiedDateInWindowFormula__*/
/*__STUDIO_WORKER_EXTRACT:studioOccupiedLinkedIds__*/
/*__STUDIO_WORKER_EXTRACT:studioOccupiedCacheKey__*/
/*__STUDIO_WORKER_EXTRACT:studioOccupiedRowMatchesProfile__*/
/*__STUDIO_WORKER_EXTRACT:studioOccupiedFilterFormula__*/
const studioOccupiedScheduleCaches = new Map();

/*__STUDIO_WORKER_EXTRACT:studioOccupiedCacheSlot__*/
/*__STUDIO_WORKER_EXTRACT:studioInvalidateOccupiedScheduleCache__*/
/*__STUDIO_WORKER_EXTRACT:studioOccupiedMsFromRow__*/
/*__STUDIO_WORKER_EXTRACT:studioLoadOccupiedScheduleRows__*/
/*__STUDIO_WORKER_EXTRACT:studioLoadOccupiedSchedules__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishScheduleFields__*/
/*__STUDIO_WORKER_EXTRACT:studioStorySiblingStamp__*/
/*__STUDIO_WORKER_EXTRACT:studioResolveStoryPublishIso__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishScheduledMs__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishIsDue__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishCanDispatchNow__*/
/*__STUDIO_WORKER_EXTRACT:studioPromoteDuePublishStatus__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishHeldUntilIso__*/
/*__STUDIO_WORKER_EXTRACT:item4EffectivePhotoCount__*/
/*__STUDIO_WORKER_EXTRACT:item4StudioDirectiveYes__*/
/*__STUDIO_WORKER_EXTRACT:item4ThumbnailSource__*/
/*__STUDIO_WORKER_EXTRACT:item4UrlIsStudioPhotoCrop__*/
/*__STUDIO_WORKER_EXTRACT:studioUrlLooksLikeVideoFile__*/
/*__STUDIO_WORKER_EXTRACT:studioUrlLooksLikeDriveFetch__*/
/*__STUDIO_WORKER_EXTRACT:studioAiThumbnailUrl__*/
/*__STUDIO_WORKER_EXTRACT:studioNeedsAiThumbnail__*/
/*__STUDIO_WORKER_EXTRACT:studioStampParentAiCoverOnOutput__*/
// "Ready for Voiceover" is the P2 selector. A cover write that overwrites it with
// "Thumbnail Ready" while Voiceover_URL is blank turns narration off and leaves R4
// returning waiting_for_voiceover forever (Output 432 / CI 137). Keep the
// selector until the voiceover exists.
/*__STUDIO_WORKER_EXTRACT:studioCoverContentStatusFields__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsurePublicAiCover__*/
/*__STUDIO_WORKER_EXTRACT:studioStampPackageReviewCovers__*/
/*__STUDIO_WORKER_EXTRACT:studioHealRfrMissingDeliverable__*/
/*__STUDIO_WORKER_EXTRACT:item4StudioThumbnailPrompt__*/
/*__STUDIO_WORKER_EXTRACT:item4SlideImageUrl__*/
/*__STUDIO_WORKER_EXTRACT:item4PackageOverrides__*/
/** Infer video vs slides package when /plan omits package and notes lack ez-package=. */
/*__STUDIO_WORKER_EXTRACT:item4ResolvePackageId__*/
/*__STUDIO_WORKER_EXTRACT:item4DefaultOutputType__*/
/*__STUDIO_WORKER_EXTRACT:item4CanonicalOutputType__*/
/*__STUDIO_WORKER_EXTRACT:item4IsCompanionOutputType__*/
/*__STUDIO_WORKER_EXTRACT:item4IsUnsupportedCompanion__*/
const ITEM4_STORY_TEASER_SECONDS = 10;
const ITEM4_SINGLE_STILL_SECONDS = 5;

/*__STUDIO_WORKER_EXTRACT:item4ResolvedVideoDurationSeconds__*/
/*__STUDIO_WORKER_EXTRACT:item4CompanionStoryFields__*/
/*__STUDIO_WORKER_EXTRACT:item4RowHasPlatformOutput__*/
/*__STUDIO_WORKER_EXTRACT:item4PlatformOutputHasPublishedIdentity__*/
/*__STUDIO_WORKER_EXTRACT:item4ReconcileCreatedPlatformOutput__*/
/*__STUDIO_WORKER_EXTRACT:item4CollapseDuplicatePlanOutputs__*/
/*__STUDIO_WORKER_EXTRACT:item4NormalizePlanExtras__*/
/*__STUDIO_WORKER_EXTRACT:item4PlanChoice__*/
/*__STUDIO_WORKER_EXTRACT:item4PlanItemFromChoice__*/
/*__STUDIO_WORKER_EXTRACT:item4ReconcilePlanWithEnabledOutputs__*/
/*__STUDIO_WORKER_EXTRACT:item4DisableUnsupportedCompanions__*/
/*__STUDIO_WORKER_EXTRACT:item4ReconcileEnabledPlanOutputs__*/
/*__STUDIO_WORKER_EXTRACT:acquireAzOutputLock__*/
/*__STUDIO_WORKER_EXTRACT:finishedEnabledKeysFromRows__*/
/*__STUDIO_WORKER_EXTRACT:item4SyncPlanOutputs__*/
/*__STUDIO_WORKER_EXTRACT:buildItem4OutputPlan__*/
/*__STUDIO_WORKER_EXTRACT:getItem4OutputPlan__*/
const ITEM4_VARIANT_QUEUE_TABLE = "tblBZLXPd1p2NRWRK";
const ITEM4_SMV1_SCENARIO_ID = 5894885;
const ITEM4_VARIANT_RECIPE_VERSION = "fill-crop-v2";
const ITEM4_DRAIN_POST_BUDGET_MS = 20000;
const ITEM4_DRAIN_STATUS_BUDGET_MS = 12000;
const ITEM4_DRAIN_BACKGROUND_BUDGET_MS = 90000;
const ITEM4_DRAIN_PROMOTE_BUDGET_MS = 180000;
const IDEA_LIBRARY_SCAN_LIMIT = 500;
const IDEA_LIBRARY_PLACE_FILTER_LIMIT = 250;
const ITEM4_DRAIN_CRON_BUDGET_MS = 90000;
const ITEM4_SMV1_BASE_ELIGIBILITY_FORMULA = 'OR(AND({Asset_Kind}="Master Original",{Transfer_Status}="Pending"),AND({Asset_Kind}="Platform Variant",OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded")),AND(OR({Asset_Kind}="Master Original",{Asset_Kind}="Platform Variant"),{Transfer_Status}="Ready",{Preview_Status}="Pending"))';
const ITEM4_SMV1_PRODUCTION_FORMULA = `AND({Test_Run_ID}=BLANK(),${ITEM4_SMV1_BASE_ELIGIBILITY_FORMULA})`;
// Cron must also see Master Original rows stuck at Drive Uploaded — those need
// Studio API reconciliation, not another SMV1 upload. SMV1's own selector stays
// on Pending-only masters so it does not re-upload.
const ITEM4_QUEUE_DRAIN_SCAN_FORMULA = 'AND({Test_Run_ID}=BLANK(),OR(AND({Asset_Kind}="Master Original",OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded",{Transfer_Status}="Processing")),AND({Asset_Kind}="Platform Variant",OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded",{Transfer_Status}="Processing")),AND(OR({Asset_Kind}="Master Original",{Asset_Kind}="Platform Variant"),{Transfer_Status}="Ready",{Preview_Status}="Pending")))';
const ITEM4_P3_SCENARIO_ID = 5531703;
const ITEM4_P3_WEBHOOK_URL = ""; // Make.com retired
const ITEM4_P2_SCENARIO_ID = 5530955;
const ITEM4_P2_WEBHOOK_URL = ""; // Make.com retired
const STUDIO_P1_SCENARIO_ID = 5528742;
const ITEM4_C2_SCENARIO_ID = 5582071;
const ITEM4_C2_WEBHOOK_URL = ""; // Make.com retired
const ITEM4_SAI1_SCENARIO_ID = 6023816;
const ITEM4_SAI1_WEBHOOK_URL = ""; // Make.com retired
const ITEM4_R2_SCENARIO_ID = 5569495;
const ITEM4_R2_SOURCE_GUARD_NAME = "R2 - Auto Asset Selection v6.2 - Studio + Legacy Explicit Eligibility";
const ITEM4_P3_SOURCE_AUTHORITY_NAME = "P3 - Platform Output Generation v4.7 - Studio Exact Source Lock + Correct R2 Queue State";
const STUDIO_AP0_SCENARIO_ID = 5612096;
const STUDIO_AP1_IG_SCENARIO_ID = 5862882;
const STUDIO_AP1_IGS_SCENARIO_ID = 5612664;
const STUDIO_AP1_IGS_POLL_SCENARIO_ID = 5845193;
const STUDIO_FBS1_SCENARIO_ID = 5816409;
const STUDIO_FBS2_SCENARIO_ID = 5816495;
const STUDIO_FBS3_SCENARIO_ID = 5816502;
const STUDIO_FBS4_SCENARIO_ID = 5816520;
const STUDIO_YT0_SCENARIO_ID = 5823572;
const STUDIO_YTP1_SCENARIO_ID = 5830810;
const STUDIO_YTS1_SCENARIO_ID = 5830609;
const STUDIO_YTS2_SCENARIO_ID = 5830616;
const STUDIO_YTS3_SCENARIO_ID = 5830623;
const STUDIO_YT_ORCH_SCENARIO_ID = 5823581;
const STUDIO_TTD0_SCENARIO_ID = 5806658;
const STUDIO_TTD1_SCENARIO_ID = 5806644;
const STUDIO_TTD2_SCENARIO_ID = 5806597;
const STUDIO_TTD3_SCENARIO_ID = 5806570;
const STUDIO_TTD4_SCENARIO_ID = 5806518;
const STUDIO_TTD_ORCH_SCENARIO_ID = 5806668;
const STUDIO_FB0_SCENARIO_ID = 5813436;
const STUDIO_FB1_SCENARIO_ID = 5813463;
const STUDIO_FB2_SCENARIO_ID = 5813487;
const STUDIO_FB2R_SCENARIO_ID = 5813511;
const STUDIO_FB3_SCENARIO_ID = 5813534;
const STUDIO_FB_ORCH_SCENARIO_ID = 5813561;
/*__STUDIO_WORKER_EXTRACT:studioFacebookGraphPublishHeld__*/
const STUDIO_AP0C_SCENARIO_ID = 5786899;
const STUDIO_AP1C_SCENARIO_ID = 5790745;
const STUDIO_AP2C_SCENARIO_ID = 5791231;
const STUDIO_AP3C_SCENARIO_ID = 5791273;
const STUDIO_AP3P_SCENARIO_ID = 5791336;
const STUDIO_AP4C_SCENARIO_ID = 5791356;
const STUDIO_AP4R_SCENARIO_ID = 5791396;
const STUDIO_AP5C_SCENARIO_ID = 5791424;
const STUDIO_AP_CAR_ORCH_SCENARIO_ID = 5791537;
const STUDIO_IG_ORCH_SCENARIO_ID = 5864632;



/*__STUDIO_WORKER_EXTRACT:item4VariantManifest__*/
/*__STUDIO_WORKER_EXTRACT:item4CoverStillUrl__*/
/*__STUDIO_WORKER_EXTRACT:item4PlanRatios__*/
/*__STUDIO_WORKER_EXTRACT:item4CoverExtraRatios__*/
/*__STUDIO_WORKER_EXTRACT:item4RequiredRatios__*/
/*__STUDIO_WORKER_EXTRACT:item4CoverHeroAsset__*/
/*__STUDIO_WORKER_EXTRACT:item4RatiosForAsset__*/
/*__STUDIO_WORKER_EXTRACT:item4ExpectedVariantKeys__*/
/*__STUDIO_WORKER_EXTRACT:item4VariantRatioKey__*/
/*__STUDIO_WORKER_EXTRACT:item4VariantTargetFileName__*/
/*__STUDIO_WORKER_EXTRACT:item4NormalizedCrop__*/
/*__STUDIO_WORKER_EXTRACT:item4CropStyleToken__*/
/*__STUDIO_WORKER_EXTRACT:item4CropTransferSuffix__*/
/*__STUDIO_WORKER_EXTRACT:item4MergeAssetCrops__*/
/*__STUDIO_WORKER_EXTRACT:item4QueueTransferId__*/
/*__STUDIO_WORKER_EXTRACT:item4QueueStatus__*/
/*__STUDIO_WORKER_EXTRACT:item4QueueRowHasAuthority__*/
/*__STUDIO_WORKER_EXTRACT:item4QueueRowCountsReady__*/
/*__STUDIO_WORKER_EXTRACT:item4QueueErrorIsTransient__*/
/*__STUDIO_WORKER_EXTRACT:item4RequeueTransientVariantFailures__*/
// Quality Agent / Worker heal: same effect as Production "Retry remaining" —
// requeue every Failed/Error crop that still lacks Drive authority so large
// frame batches do not park until a human clicks the button.
/*__STUDIO_WORKER_EXTRACT:item4RequeueFailedVariantsForHeal__*/
/*__STUDIO_WORKER_EXTRACT:item4RequeueStaleProcessing__*/
/*__STUDIO_WORKER_EXTRACT:item4QueueMediaAssetId__*/
/*__STUDIO_WORKER_EXTRACT:item4QueueDriveFileId__*/
/*__STUDIO_WORKER_EXTRACT:item4OutputIdsForRatio__*/
/*__STUDIO_WORKER_EXTRACT:item4SameRecordIds__*/
/*__STUDIO_WORKER_EXTRACT:item4RelinkVariantQueueOutputs__*/
/*__STUDIO_WORKER_EXTRACT:item4VariantQueueRows__*/
/*__STUDIO_WORKER_EXTRACT:syncMiamiTikTokPipelineSecret__*/
/*__STUDIO_WORKER_EXTRACT:item4PipelineSetting__*/
/*__STUDIO_WORKER_EXTRACT:item4UpsertVariantQueue__*/
/*__STUDIO_WORKER_EXTRACT:item4Smv1FormulaQuoted__*/
/*__STUDIO_WORKER_EXTRACT:item4Smv1ExactTestFormula__*/
/*__STUDIO_WORKER_EXTRACT:item4Smv1ExactRequestFormula__*/
/*__STUDIO_WORKER_EXTRACT:item4QueueRowIsOutstanding__*/
/*__STUDIO_WORKER_EXTRACT:pipelineStageBackend__*/
/*__STUDIO_WORKER_EXTRACT:cadenceScenarioManagedByPython__*/
const STUDIO_PRODUCTION_JOB_LABELS = {
  themes: "Writing slide themes",
  audio: "Generating voiceover and cover",
  images: "Generating AI images",
  ingest: "Ingesting source photos",
  queue_crops: "Queuing platform crops",
  crops: "Cropping platform variants",
  stamp: "Packaging outputs",
  render: "Rendering previews",
  done: "Ready for Review",
  blocked: "Blocked",
};

/*__STUDIO_WORKER_EXTRACT:parseStudioProductionJob__*/
/*__STUDIO_WORKER_EXTRACT:studioProductionJobLabel__*/
/*__STUDIO_WORKER_EXTRACT:item4RunnerClipPosterRoutes__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseClipPosterJob__*/
/*__STUDIO_WORKER_EXTRACT:item4RunnerStudioCompressRoutes__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseStudioCompressJob__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseStudioProduceJob__*/
const AZ_DEFAULT_PLATFORMS = Object.freeze(["Instagram", "Facebook", "TikTok", "YouTube"]);
const AZ_DEFAULT_OVERRIDES = Object.freeze({
  Instagram: "Reel",
  Facebook: "Reel",
  TikTok: "Video Draft",
  YouTube: "Short",
});
const AZ_DEFAULT_EXTRAS = Object.freeze(["Instagram::Story", "Facebook::Story"]);
const AZ_HORIZON_DAYS = 28;
const AZ_OTHER_CLUSTER_MS = 30 * 60 * 1000;
const AZ_OTHER_NEAR_MS = 3 * 60 * 60 * 1000;
const AZ_STORY_OFFSET_MS = 10 * 60 * 1000;
const AZ_SCHEDULE_LEAD_MS = 10 * 60 * 1000;

/*__STUDIO_WORKER_EXTRACT:studioRequestNotesText__*/
/*__STUDIO_WORKER_EXTRACT:studioIsAzFinishedVideo__*/
/*__STUDIO_WORKER_EXTRACT:studioIsVibeCut__*/
/*__STUDIO_WORKER_EXTRACT:skipsProductionApprove__*/
/*__STUDIO_WORKER_EXTRACT:studioChicagoWeekdayShort__*/
/*__STUDIO_WORKER_EXTRACT:studioAzCivilKey__*/
/*__STUDIO_WORKER_EXTRACT:studioAzParseWindowStart__*/
/*__STUDIO_WORKER_EXTRACT:studioAzCivilFromMs__*/
/*__STUDIO_WORKER_EXTRACT:studioAzIsStory__*/
/*__STUDIO_WORKER_EXTRACT:studioAzScheduleKey__*/
/*__STUDIO_WORKER_EXTRACT:studioAzTooClose__*/
/*__STUDIO_WORKER_EXTRACT:studioAzNearPenalty__*/
/*__STUDIO_WORKER_EXTRACT:studioAzOccupiedOnDay__*/
/*__STUDIO_WORKER_EXTRACT:studioAzHorizon__*/
/*__STUDIO_WORKER_EXTRACT:studioAzWindowSlots__*/
/*__STUDIO_WORKER_EXTRACT:studioAzScoreMain__*/
/*__STUDIO_WORKER_EXTRACT:studioBuildAzCampaignSchedule__*/
/*__STUDIO_WORKER_EXTRACT:studioLoadAzOccupiedTimes__*/
/*__STUDIO_WORKER_EXTRACT:studioResolveAzBestTimes__*/
/*__STUDIO_WORKER_EXTRACT:azPlatformOutputsForRequest__*/
/*__STUDIO_WORKER_EXTRACT:azOutputReadyToQueue__*/
/*__STUDIO_WORKER_EXTRACT:azOutputQueueBlockers__*/
/*__STUDIO_WORKER_EXTRACT:azStagePublicCoverFromSource__*/
/*__STUDIO_WORKER_EXTRACT:azEnsurePublicCovers__*/
/*__STUDIO_WORKER_EXTRACT:azEnsurePublicFinalFiles__*/
/*__STUDIO_WORKER_EXTRACT:azRestampFinishedStories__*/
/*__STUDIO_WORKER_EXTRACT:azAutoApproveIfReady__*/
/*__STUDIO_WORKER_EXTRACT:azBuildPlanItems__*/
/*__STUDIO_WORKER_EXTRACT:azEnsurePlatformOutputs__*/
/*__STUDIO_WORKER_EXTRACT:advanceAzFinishedVideo__*/
/*__STUDIO_WORKER_EXTRACT:opsForceAzNavyPierTitle__*/
/*__STUDIO_WORKER_EXTRACT:resumeAzFinishedVideoRequests__*/
/*__STUDIO_WORKER_EXTRACT:studioVibeCutOutputNeedsRemount__*/
/*__STUDIO_WORKER_EXTRACT:studioClearVibeCutPassthroughOutputs__*/
/*__STUDIO_WORKER_EXTRACT:enqueueStudioProductionJob__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputProductionRequestId__*/
/*__STUDIO_WORKER_EXTRACT:loadStudioProductionJobsForOutputs__*/
/*__STUDIO_WORKER_EXTRACT:startOrphanedStudioProductionJobs__*/
/*__STUDIO_WORKER_EXTRACT:pulseStudioProduceOpsAlert__*/
/*__STUDIO_WORKER_EXTRACT:studioProduceHealState__*/
/*__STUDIO_WORKER_EXTRACT:isTransientRenderBlockError__*/
/*__STUDIO_WORKER_EXTRACT:resumeStaleStudioProductionJobs__*/
/*__STUDIO_WORKER_EXTRACT:studioLastModifiedStaleFormula__*/
/*__STUDIO_WORKER_EXTRACT:studioFreshTtsLease__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputVoiceoverRequired__*/
// Ready for Render with no Remotion job while the output wants narration but has no
// Voiceover_URL. R4 returns waiting_for_voiceover on every pulse, so pulsing R4 again is
// useless. Either copy the parent's voiceover down or put the parent back on the P2
// selector (Content_Status "Ready for Voiceover") and resume produce at audio.
/*__STUDIO_WORKER_EXTRACT:studioHealReadyNoJobVoiceover__*/
/*__STUDIO_WORKER_EXTRACT:studioStreamMediaAssetId__*/
/*__STUDIO_WORKER_EXTRACT:studioRepairUnfetchableRenderSources__*/
/*__STUDIO_WORKER_EXTRACT:studioPrivateDriveWatermarkSignature__*/
/*__STUDIO_WORKER_EXTRACT:studioChicagoWatermarkOutput__*/
/*__STUDIO_WORKER_EXTRACT:studioParkChicagoWatermarkRender__*/
/*__STUDIO_WORKER_EXTRACT:studioRemotionPrivateDriveLocalizationReady__*/
/*__STUDIO_WORKER_EXTRACT:studioResetPrivateDriveWatermarkRender__*/
/*__STUDIO_WORKER_EXTRACT:studioExtendClipsToCoverVoiceover__*/
/*__STUDIO_WORKER_EXTRACT:studioHealVoiceoverExceedsRender__*/
/*__STUDIO_WORKER_EXTRACT:healStuckStudioRenders__*/
/*__STUDIO_WORKER_EXTRACT:studioCompleteNativePhotoPublishArming__*/
/*__STUDIO_WORKER_EXTRACT:studioHealNativePhotoReviewStrands__*/
/** Output_Status stuck Ready for Review after Approve → phantom All-Profiles Awaiting Approval. */
/*__STUDIO_WORKER_EXTRACT:studioHealAwaitingApprovalStaleRfr__*/
/** Rerendering badge with a finished file and no render running → back to Ready for Review. */
/*__STUDIO_WORKER_EXTRACT:studioHealPhantomRerender__*/
/*__STUDIO_WORKER_EXTRACT:studioHealFailedStatuses__*/
/*__STUDIO_WORKER_EXTRACT:studioHealIgCarouselTooManyChildren__*/
/*__STUDIO_WORKER_EXTRACT:studioHealIgCarouselChildVerificationRace__*/
/*__STUDIO_WORKER_EXTRACT:studioHealIgCarouselChildPollFailure__*/
/*__STUDIO_WORKER_EXTRACT:studioHealIgCarouselRateLimit__*/
/*__STUDIO_WORKER_EXTRACT:studioMediaIdsFromSourcePackage__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaProxyFromProduceRequest__*/
/*__STUDIO_WORKER_EXTRACT:studioRecoverEscalatedMasters__*/
/*__STUDIO_WORKER_EXTRACT:studioHealEscalatedProduce__*/
/*__STUDIO_WORKER_EXTRACT:resumeStalePlatformOutputs__*/
/*__STUDIO_WORKER_EXTRACT:item4PulsePipelineStage__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseSmv1Python__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseR2BPython__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseR2Python__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseR3Python__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseT1Python__*/
/*__STUDIO_WORKER_EXTRACT:studioGateR4ForPrivateDriveWatermark__*/
/*__STUDIO_WORKER_EXTRACT:studioRemotionRenderBusy__*/
/*__STUDIO_WORKER_EXTRACT:studioStampRenderQueueWaiting__*/
/*__STUDIO_WORKER_EXTRACT:readOpsQueueControls__*/
/*__STUDIO_WORKER_EXTRACT:readFactoryDeskControls__*/
/*__STUDIO_WORKER_EXTRACT:writeFactoryDeskControls__*/
/*__STUDIO_WORKER_EXTRACT:loadFactoryIdeaCandidates__*/
/*__STUDIO_WORKER_EXTRACT:writeOpsQueueControls__*/
/*__STUDIO_WORKER_EXTRACT:studioLoadRenderQueueCandidates__*/
/*__STUDIO_WORKER_EXTRACT:studioAdmitRenderQueue__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseR4Python__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseR5Python__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseLetterPython__*/
/*__STUDIO_WORKER_EXTRACT:item4RefreshNativeLetteredSlides__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseRR2Python__*/
/*__STUDIO_WORKER_EXTRACT:handleRr2ReviewDecision__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseRR1Python__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseP1Python__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseP2Python__*/
/*__STUDIO_WORKER_EXTRACT:item4PulseP3Python__*/
/*__STUDIO_WORKER_EXTRACT:item4SetSmv1SelectorFormula__*/
/*__STUDIO_WORKER_EXTRACT:item4DrainVariantWorker__*/
/*__STUDIO_WORKER_EXTRACT:item4ListPendingQueueRequestIds__*/
/*__STUDIO_WORKER_EXTRACT:item4DrainAllPendingWork__*/
/*__STUDIO_WORKER_EXTRACT:item4BuildDriveManifest__*/
/*__STUDIO_WORKER_EXTRACT:item4VariantManifestPlanComplete__*/
/*__STUDIO_WORKER_EXTRACT:item4ReconcileVariants__*/
/*__STUDIO_WORKER_EXTRACT:runItem4VariantPrepareCore__*/
/*__STUDIO_WORKER_EXTRACT:ensureItem4VariantsReadyForPromotion__*/
/*__STUDIO_WORKER_EXTRACT:prepareItem4Variants__*/
/*__STUDIO_WORKER_EXTRACT:getItem4Variants__*/
/*__STUDIO_WORKER_EXTRACT:item4ResumePendingMasterAuthority__*/
/*__STUDIO_WORKER_EXTRACT:item4ResumePendingVariants__*/
/*__STUDIO_WORKER_EXTRACT:item4TimelineAutoPrepareEligible__*/
/*__STUDIO_WORKER_EXTRACT:item4HealTimelineAutoPrepare__*/
/*__STUDIO_WORKER_EXTRACT:item4HealIncompletePreparingVariants__*/
/*__STUDIO_WORKER_EXTRACT:getItem4WorkspaceStatus__*/
const PRODUCTION_REQUEST_TABLE = "Production Requests";
const PR_STATUSES = new Set(["Draft", "Ready", "Submitted", "Promoted", "Cancelled"]);
const PR_CONTENT_TYPES = new Set([
  "Vertical Short Video","Story","Carousel","Feed Post","Text Post","Thread",
  "Longform Video","Thumbnail / Promo Still","Event / Flyer Post","Photo Set"
]);
const PR_PLATFORMS = new Set(["Instagram","Facebook","TikTok","YouTube","Threads","X","Lemon8"]);
const PR_PLATFORM_ALIASES = new Map([
  ["instagram reel", "Instagram"],
  ["instagram reels", "Instagram"],
  ["instagram story", "Instagram"],
  ["instagram stories", "Instagram"],
  ["facebook reel", "Facebook"],
  ["facebook reels", "Facebook"],
  ["facebook story", "Facebook"],
  ["facebook stories", "Facebook"],
  ["tiktok video", "TikTok"],
  ["tiktok videos", "TikTok"],
  ["youtube short", "YouTube"],
  ["youtube shorts", "YouTube"],
  ["youtube video", "YouTube"],
  ["youtube videos", "YouTube"],
  ["twitter", "X"],
]);

/*__STUDIO_WORKER_EXTRACT:canonicalProductionPlatform__*/
/*__STUDIO_WORKER_EXTRACT:canonicalProductionPlatforms__*/
const PR_TRISTATE = new Set(["Use Profile Default","Yes","No"]);
const PR_THUMBNAIL_MODES = new Set(["Use Profile Default","Yes","No","Use photo frame"]);
const PR_COUNT_MODES = new Set(["AI decides","Exact","Target range"]);
const PR_TEXT_MODES = new Set(["AI decides","Force exact","AI improve","Leave blank"]);
const PR_CAROUSEL_IMAGE_MODES = new Set(["Make AI Generated","Manual Upload"]);

/*__STUDIO_WORKER_EXTRACT:ideaRecordIdFromProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:uniqueIdeaRecordIds__*/
// One formula page per chunk. Per-idea GETs blow the Worker subrequest cap
// once Production has more than a handful of open drafts, and the list 500s.
/*__STUDIO_WORKER_EXTRACT:loadIdeaListMetaByRecordId__*/
/*__STUDIO_WORKER_EXTRACT:loadIdeaTitlesByRecordId__*/
/*__STUDIO_WORKER_EXTRACT:loadIdeaPhotoWaitStatesByRecordId__*/
/*__STUDIO_WORKER_EXTRACT:mapProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestRecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:makeProductionRequestId__*/
/*__STUDIO_WORKER_EXTRACT:loadAuthorizedProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:normalizeChoice__*/
/*__STUDIO_WORKER_EXTRACT:nullableInt__*/
// Timed-script lengths can be fractional seconds (90.4). The Airtable duration
// field is a whole-number cap, so store the ceiling. 90 stays 90.
/*__STUDIO_WORKER_EXTRACT:nullableWholeSeconds__*/
/*__STUDIO_WORKER_EXTRACT:nullableNumber__*/
/*__STUDIO_WORKER_EXTRACT:validateMusicAsset__*/
/*__STUDIO_WORKER_EXTRACT:normalizeRequestedVoice__*/
/*__STUDIO_WORKER_EXTRACT:requestedVoiceFromProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:cleanProductionRequestPayload__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestFields__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestDefaultsFromIdea__*/
/*__STUDIO_WORKER_EXTRACT:suggestPrimaryLocationFromIdea__*/
const PRODUCTION_REQUEST_LIST_FIELDS = [
  "Production_Request_ID",
  "Test_Run_ID",
  "Idea_Candidate",
  "Organization",
  "Brand",
  "Created_By",
  "Request_Status",
  "Master_Content_Type",
  "Target_Platforms",
  "Voiceover_Mode",
  "Voice_ID",
  "Voice_Name",
  "Background_Music_Mode",
  "Thumbnail_Mode",
  "Video_Duration_Seconds",
  "Voiceover_Duration_Seconds",
  "Music_Start_Seconds",
  "Video_Clip_Count_Mode",
  "Video_Clip_Count_Exact",
  "Video_Clip_Count_Min",
  "Video_Clip_Count_Max",
  "Carousel_Slide_Count_Mode",
  "Carousel_Slide_Count_Exact",
  "Carousel_Slide_Count_Min",
  "Carousel_Slide_Count_Max",
  "Carousel_Image_Mode",
  "Voiceover_Tail_Seconds",
  "Selected_Music_Asset",
  "Title_Mode",
  "Requested_Title",
  "Caption_Mode",
  "Requested_Caption",
  "Script_Mode",
  "Requested_Script",
  "Primary_Location",
  "Production_Notes",
  "Created_At",
  "Updated_At",
  "Submitted_At",
  "Promoted_Content_Item",
  "Content Items",
  "Active",
  "Studio_Master_Asset_Count",
  "Studio_Master_Asset_Status",
  "Studio_Output_Plan_Status",
  "Studio_Variant_Status",
  "Studio_Variant_Updated_At",
  "Studio_Variant_Error",
  "Studio_Item4_State",
  "Studio_Publish_Batch_ID",
  "Studio_Publish_Requested_At",
];

const OPEN_PRODUCTION_REQUEST_FORMULA = 'OR({Request_Status}="Draft",{Request_Status}="Ready",{Request_Status}="Submitted")';

/*__STUDIO_WORKER_EXTRACT:listOpenProductionRequests__*/
/*__STUDIO_WORKER_EXTRACT:existingDraftForIdea__*/
/*__STUDIO_WORKER_EXTRACT:loadContentProfileRecord__*/
/*__STUDIO_WORKER_EXTRACT:resolveDraftNarrationVoice__*/
/*__STUDIO_WORKER_EXTRACT:isUnsetOrKateDefaultVoice__*/
/*__STUDIO_WORKER_EXTRACT:maybeHealDraftNarrationVoice__*/
/*__STUDIO_WORKER_EXTRACT:createDraftForIdea__*/
/*__STUDIO_WORKER_EXTRACT:getOrCreateProductionRequestForIdea__*/
/*__STUDIO_WORKER_EXTRACT:createProductionRequestFromBody__*/
/*__STUDIO_WORKER_EXTRACT:mapProductionRequestLight__*/
/*__STUDIO_WORKER_EXTRACT:mapProductionRequestSummary__*/
// QA-PRODUCTION-PHOTO-WAIT: a stale Idea 'Waiting' flag must not hide an
// operator-owned draft with exact narration and attached photos. Untouched
// photo-listening shells remain hidden until they actually enter Production.
/*__STUDIO_WORKER_EXTRACT:productionRequestPhotoWaitHidden__*/
/*__STUDIO_WORKER_EXTRACT:listProductionRequests__*/
/*__STUDIO_WORKER_EXTRACT:getProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:updateProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestBridgeRecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:item4DerivedIdeaSummary__*/
/*__STUDIO_WORKER_EXTRACT:ensureProductionRequestIdeaSummary__*/
/*__STUDIO_WORKER_EXTRACT:item4BridgePlanKey__*/
/*__STUDIO_WORKER_EXTRACT:item4SourceToProductionBridgePreflight__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestBridgePreflightRoute__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestPromotionRecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:linkedContentItemRecordId__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputSupportsStudioAudio__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestWantsStudioAudio__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestAudioPlatformWarnings__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestCompatibilityIssues__*/
/*__STUDIO_WORKER_EXTRACT:promotionThumbnailTriState__*/
/*__STUDIO_WORKER_EXTRACT:promotionInputFromProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:updateProductionRequestPromotionState__*/
const FACTORY_REVISION_NOTE_PREFIX = "[factory-revision-open]";

/*__STUDIO_WORKER_EXTRACT:stripFactoryRevisionNote__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestRevisionOpen__*/
/*__STUDIO_WORKER_EXTRACT:withFactoryRevisionOpen__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestEditable__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestSyncRecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestTimedScriptRecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:loadContentPlatformOutputs__*/
/*__STUDIO_WORKER_EXTRACT:outputNeedsTimedScriptRerender__*/
/*__STUDIO_WORKER_EXTRACT:outputAlreadyApprovedForPublishing__*/
/*__STUDIO_WORKER_EXTRACT:applyPromotedTimedScriptRoute__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestPreferredMusic__*/
/*__STUDIO_WORKER_EXTRACT:productionRequestDirectiveSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:syncProductionRequestDirectivesToContentItem__*/
/*__STUDIO_WORKER_EXTRACT:syncProductionRequestDirectivesRoute__*/
const STUDIO_OUTPUT_ROUTE_SPECS = Object.freeze({
  "Instagram::Reel": {
    pipeline_family: "Video",
    content_type: "Vertical Short Video",
    proven_mapping: "Instagram Reel",
  },
  "Instagram::Story": {
    pipeline_family: "Story",
    content_type: "Story",
    proven_mapping: "Instagram Story",
  },
  "Instagram::Single Image": {
    pipeline_family: "Single Image",
    content_type: "Feed Post",
    proven_mapping: "Instagram Feed Post",
  },
  "Instagram::Carousel": {
    pipeline_family: "Carousel / Photo Set",
    content_type: "Carousel",
    proven_mapping: "Instagram Carousel",
  },

  "Facebook::Reel": {
    pipeline_family: "Video",
    content_type: "Vertical Short Video",
    proven_mapping: "Facebook Reel",
    facebook_object: "reel",
  },
  "Facebook::Story": {
    pipeline_family: "Story",
    content_type: "Story",
    proven_mapping: "Facebook Story",
  },
  "Facebook::Single Image": {
    pipeline_family: "Single Image",
    content_type: "Feed Post",
    proven_mapping: "Facebook Post",
  },
  "Facebook::Multi-Image Post": {
    pipeline_family: "Carousel / Photo Set",
    content_type: "Photo Set",
    proven_mapping: "Facebook Photo Set",
    facebook_object: "native_multi_photo",
  },
  "Facebook::Slideshow Reel": {
    pipeline_family: "Slideshow Video",
    content_type: "Vertical Short Video",
    proven_mapping: "Facebook Reel",
    facebook_object: "reel",
  },

  "TikTok::Video Draft": {
    pipeline_family: "Video",
    content_type: "Vertical Short Video",
    proven_mapping: "TikTok Video",
  },
  "TikTok::Multi-Photo": {
    pipeline_family: "Carousel / Photo Set",
    content_type: "Photo Set",
    proven_mapping: "TikTok Slideshow",
  },
  "TikTok::Single Photo": {
    pipeline_family: "Carousel / Photo Set",
    content_type: "Photo Set",
    proven_mapping: "TikTok Slideshow",
  },

  "YouTube::Short": {
    pipeline_family: "Video",
    content_type: "Vertical Short Video",
    proven_mapping: "YouTube Short",
  },
  "YouTube::Standard Video": {
    pipeline_family: "Video",
    content_type: "Longform Video",
    proven_mapping: "YouTube Longform",
  },
  "YouTube::Slideshow Video": {
    pipeline_family: "Slideshow Video",
    content_type: "Vertical Short Video",
    proven_mapping: "YouTube Short",
  },
});

/*__STUDIO_WORKER_EXTRACT:studioOutputRouteSpec__*/
/*__STUDIO_WORKER_EXTRACT:stringOrNull__*/
/*__STUDIO_WORKER_EXTRACT:arrayOrEmpty__*/
/*__STUDIO_WORKER_EXTRACT:resolvedOutputTriState__*/
/*__STUDIO_WORKER_EXTRACT:resolvedThumbnailMode__*/
/*__STUDIO_WORKER_EXTRACT:productionProfileDefaultsForParentContentItem__*/
/*__STUDIO_WORKER_EXTRACT:emptyStudioMusic__*/
/*__STUDIO_WORKER_EXTRACT:studioMusicFromMediaRecord__*/
/*__STUDIO_WORKER_EXTRACT:preferredMusicForProductionRequestOutput__*/
/*__STUDIO_WORKER_EXTRACT:studioCatalogMusicScore__*/
/** Prefer a random track among the top-scoring tier so blank Selected_Music_Asset does not lock one favorite forever. */
/*__STUDIO_WORKER_EXTRACT:pickCatalogFallbackMusicRecord__*/
/*__STUDIO_WORKER_EXTRACT:catalogFallbackMusic__*/
/*__STUDIO_WORKER_EXTRACT:resolveStudioRenderMusic__*/
/*__STUDIO_WORKER_EXTRACT:outputEffectiveChoice__*/
/*__STUDIO_WORKER_EXTRACT:outputEffectiveNumber__*/
/*__STUDIO_WORKER_EXTRACT:outputEffectiveText__*/
/*__STUDIO_WORKER_EXTRACT:outputWorkItemIssues__*/
/*__STUDIO_WORKER_EXTRACT:buildOutputWorkItemEffective__*/
/*__STUDIO_WORKER_EXTRACT:copyWritableParentFields__*/
/*__STUDIO_WORKER_EXTRACT:item4ListParentCarouselSlides__*/
// The production request only carries a title when the creator forced one, so the
// theme normally lives on the promoted Content Item.
/*__STUDIO_WORKER_EXTRACT:item4StudioThemeTitle__*/
// SAI1 decides what each AI slot depicts and writes the narration for the whole
// video, so a slot's photo, its burned-in caption, and the voiceover all name the
// same thing to do instead of drifting apart.
// needed may be 0: SAI1 also authors the post caption, which is required even for an
// all-manual photo set that has no AI slots to theme.
/*__STUDIO_WORKER_EXTRACT:item4CaptionContextKey__*/
/*__STUDIO_WORKER_EXTRACT:item4AssetCaptionForAiContext__*/
/*__STUDIO_WORKER_EXTRACT:item4RequestAiSlideThemes__*/
// The post caption is what gets published with the video and what the platform handoff
// emails ask you to copy. Under "AI decides" nothing else in the Studio path authors it:
// the output seed copies a caption that does not exist yet, so it stays blank all the way
// to publish unless the caption is written here.
/*__STUDIO_WORKER_EXTRACT:item4StudioCaptionIsLocked__*/
// Asset filenames are production metadata, never publishable copy. SAI1 can see captions
// attached to masters for visual context, but generic labels such as "Photo 2" must not
// leak into a social caption (for example "Featuring: Photo 2, Photo 3...").
/*__STUDIO_WORKER_EXTRACT:item4StripAssetFilenameCaptionText__*/
/*__STUDIO_WORKER_EXTRACT:item4WriteStudioPostCaption__*/
/*__STUDIO_WORKER_EXTRACT:item4EnsureStudioPostCaption__*/
/*__STUDIO_WORKER_EXTRACT:item4PreProductionAiRequestedCount__*/
/*__STUDIO_WORKER_EXTRACT:item4PreProductionAiRatio__*/
/*__STUDIO_WORKER_EXTRACT:item4PreProductionAiContext__*/
/*__STUDIO_WORKER_EXTRACT:item4GeneratePreProductionImageBytes__*/
/*__STUDIO_WORKER_EXTRACT:generateItem4PreProductionAiMaster__*/
/*__STUDIO_WORKER_EXTRACT:item4SeedAiCarouselSlides__*/
/*__STUDIO_WORKER_EXTRACT:item4IngestAiSlideAsMaster__*/
// An AI master is ingested straight from the carousel slide, before SMV1 has given
// it a Drive file and Media Asset record, so the variant upsert that runs at ingest
// time cannot queue its crops yet. Without a re-queue once the master turns Ready
// the request waits forever on crops nobody ever asked for.
/*__STUDIO_WORKER_EXTRACT:item4EnsureVariantQueueForReadyMasters__*/
/*__STUDIO_WORKER_EXTRACT:item4EnsureAiSourceMasters__*/
/*__STUDIO_WORKER_EXTRACT:item4PublicCdnUrl__*/
/*__STUDIO_WORKER_EXTRACT:item4MasterForSource__*/
/*__STUDIO_WORKER_EXTRACT:item4NormalizeAspectRatioKey__*/
/*__STUDIO_WORKER_EXTRACT:item4VariantLooksRenderable__*/
/*__STUDIO_WORKER_EXTRACT:item4PickSourceVariantForRatio__*/
/*__STUDIO_WORKER_EXTRACT:item4FinishedSourcePackageForOutput__*/
/*__STUDIO_WORKER_EXTRACT:item4StudioSourcePackageForOutput__*/
/*__STUDIO_WORKER_EXTRACT:outputWorkItemFields__*/
const STUDIO_PLATFORM_OUTPUT_TABLE = "tblrlPeboBthkplH0";

/*__STUDIO_WORKER_EXTRACT:item4PlanItemForOutput__*/
/*__STUDIO_WORKER_EXTRACT:platformOutputSeedFields__*/
/*__STUDIO_WORKER_EXTRACT:studioFinishedSeedOverlay__*/
const STUDIO_SIMILAR_WATCHLIST_SETTING = "SIMILAR_ACCOUNT_WATCHLIST";

/*__STUDIO_WORKER_EXTRACT:studioIndustryBestWindows__*/
/*__STUDIO_WORKER_EXTRACT:studioChicagoDateTimeParts__*/
/*__STUDIO_WORKER_EXTRACT:studioChicagoWallToUtcMs__*/
/*__STUDIO_WORKER_EXTRACT:studioAddCivilDays__*/
const STUDIO_SUGGEST_HORIZON_DAYS = MAE_SUGGEST_HORIZON_DAYS;
const STUDIO_SUGGEST_LEAD_MS = 10 * 60 * 1000;

/*__STUDIO_WORKER_EXTRACT:studioScheduleHorizonDays__*/
/*__STUDIO_WORKER_EXTRACT:studioSuggestCivilKey__*/
/*__STUDIO_WORKER_EXTRACT:studioSuggestParseWindowStart__*/
/*__STUDIO_WORKER_EXTRACT:studioSuggestHorizon__*/
/*__STUDIO_WORKER_EXTRACT:studioOccupiedOnCivilDay__*/
/*__STUDIO_WORKER_EXTRACT:studioFlattenOccupiedByPlatform__*/
/*__STUDIO_WORKER_EXTRACT:studioOccupiedForPlatform__*/
/*__STUDIO_WORKER_EXTRACT:studioOccupiedForLane__*/
/*__STUDIO_WORKER_EXTRACT:studioScheduleTimeCrowding__*/
/*__STUDIO_WORKER_EXTRACT:studioScoreAnalyticsSlot__*/
/*__STUDIO_WORKER_EXTRACT:studioPickBalancedSuggestedIso__*/
/*__STUDIO_WORKER_EXTRACT:studioSuggestedLocalDatetime__*/
/*__STUDIO_WORKER_EXTRACT:studioScheduleStoryRank__*/
/*__STUDIO_WORKER_EXTRACT:studioScheduleOverridesFromPayload__*/
/*__STUDIO_WORKER_EXTRACT:studioBuildSuggestedScheduleMap__*/
/*__STUDIO_WORKER_EXTRACT:studioOccupiedSchedulesOrEmpty__*/
/*__STUDIO_WORKER_EXTRACT:studioDestinationScheduleStamp__*/
/*__STUDIO_WORKER_EXTRACT:studioLoadPlanScheduleOccupancy__*/
const STUDIO_WATCHLIST_PLATFORMS = new Set(["instagram", "youtube", "tiktok", "facebook"]);
// Competitor Instagram timing is paused until Meta business_discovery permission #10 is fixed.
const STUDIO_SIMILAR_TIMED_PLATFORMS = new Set(["youtube"]);
const STUDIO_SIMILAR_TIMES_SETTING = "SIMILAR_ACCOUNT_TIMES_CACHE";
const STUDIO_SIMILAR_TIMES_TTL_MS = 24 * 60 * 60 * 1000;
const STUDIO_SIMILAR_TIMES_MIN_SAMPLE = 8;
const STUDIO_SIMILAR_ACCOUNT_STATUS_SETTING = "SIMILAR_ACCOUNT_STATUS_CACHE";
// search.list costs ~100 quota units. Cron discovery must not run every 2 minutes.
const STUDIO_YOUTUBE_CREATOR_DISCOVERY_LAST_SETTING = "YOUTUBE_CREATOR_DISCOVERY_LAST_RUN";
const STUDIO_YOUTUBE_DISCOVERY_CRON_TTL_MS = 24 * 60 * 60 * 1000;
const STUDIO_YOUTUBE_AUTONOMOUS_HARVEST_SETTING = "YOUTUBE_AUTONOMOUS_HARVEST_CACHE";
const STUDIO_YOUTUBE_AUTONOMOUS_HARVEST_TTL_MS = 12 * 60 * 60 * 1000;
const STUDIO_INSIGHTS_OBSERVATIONS_TABLE = "tblcDNIZs125iVi2B";
const STUDIO_INSIGHTS_LEARNED_TABLE = "tblb6LfRv7CemHHN6";
const STUDIO_INSIGHTS_SEASONS = Object.freeze(["winter", "spring", "summer", "fall"]);
const STUDIO_INSIGHTS_CTA_PATTERN = /\b(follow|save|link in bio|link|tap|comment|share|visit|book|dm|click|learn more|tag a friend)\b/i;

/*__STUDIO_WORKER_EXTRACT:studioInsightsObservationsTable__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsLearnedTable__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsDbEnabled__*/
/*__STUDIO_WORKER_EXTRACT:studioChicagoMonthDay__*/
/*__STUDIO_WORKER_EXTRACT:studioChicagoSeason__*/
/*__STUDIO_WORKER_EXTRACT:studioNormalizeInsightsSeason__*/
/*__STUDIO_WORKER_EXTRACT:studioSeasonLabel__*/
/*__STUDIO_WORKER_EXTRACT:studioAnalyzeCaption__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsEngagementScore__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsObservationKey__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsLearnedKey__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsNumberOrNull__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsObservationFields__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsObservationToPost__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsPlatformMatches__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsOutputTypeMatches__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsSeasonFilterFormula__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsFindObservation__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsUpsertObservation__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsUpsertObservations__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsLoadObservations__*/
/*__STUDIO_WORKER_EXTRACT:parseSimilarAccountStatusCache__*/
/*__STUDIO_WORKER_EXTRACT:studioLoadSimilarAccountStatusCache__*/
/*__STUDIO_WORKER_EXTRACT:studioSlimSimilarStatusCache__*/
/*__STUDIO_WORKER_EXTRACT:studioSaveSimilarAccountStatusCache__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsMigrateCacheToDb__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsBuildCaptionLearned__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsLearnedFromHeatmap__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsFindLearned__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsUpsertLearned__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsLoadLearned__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsLatestFirstPartyPosts__*/
/*__STUDIO_WORKER_EXTRACT:studioRecomputeInsightsLearned__*/
/*__STUDIO_WORKER_EXTRACT:studioIngestFirstPartyObservations__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsResolveSeason__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsPostsForView__*/
const STUDIO_HEATMAP_DAYS = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const STUDIO_HEATMAP_WINDOWS = Object.freeze([
  "00:00-06:00",
  "06:00-08:00",
  "08:00-10:00",
  "10:00-12:00",
  "12:00-14:00",
  "14:00-16:00",
  "16:00-18:00",
  "18:00-20:00",
  "20:00-22:00",
  "22:00-00:00",
]);
const STUDIO_SIMILAR_SEEDS = Object.freeze([
  { platform: "instagram", handle: "tatiana.pesotskaya", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "charmaine.sky", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "layne_ferd", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "chicagobydesi", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "chicago.explore", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "dronevixen", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "choosechicago", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "chicago", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "allfortheloveofchicago", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "the312watch", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "chictown_matt", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "bywellcarvalho", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "windy_citychicago", source: "joseph", profile: "chicago" },
  { platform: "instagram", handle: "doorwaysofchicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "alanainwanderland", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "timeoutchicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "chicagoarchitecturecenter", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "secretlychicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "thisischicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "artinstitutechi", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "mcachicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "navypierchicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "lincolnparkzoo", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "shedd_aquarium", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "fieldmuseum", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "blockclubchi", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "chicagomag", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "eaterchicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "wttwchicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "hiddenchicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "enjoyillinois", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "thesecondcity", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "officialwrigleyfield", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "adlerplanet", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "msichicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "chicago_riverwalk", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "millennium_park", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "360chicago", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "cubs", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "ChicagoShining", source: "joseph", profile: "chicago" },
  { platform: "youtube", handle: "ChooseChicago", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "TimeOutChicago", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "ChicagoArchitectureCenter", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "WTTW", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "NBCChicago", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "TheArtInstituteofChicago", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "FieldMuseum", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "SheddAquarium", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "Fox32Chicago", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "ABC7Chicago", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "CBSChicago", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "WGNTV", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "NavyPier", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "EnjoyIllinois", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "LincolnParkZoo", source: "research", profile: "chicago" },
  { platform: "youtube", handle: "AdlerPlanetarium", source: "research", profile: "chicago" },
  { platform: "tiktok", handle: "chicago.mp4", source: "joseph", profile: "chicago" },
  { platform: "tiktok", handle: "ChooseChicago", source: "joseph", profile: "chicago" },
  { platform: "tiktok", handle: "Chicago.by.desi", source: "joseph", profile: "chicago" },
  { platform: "tiktok", handle: "explorechicago", source: "joseph", profile: "chicago" },
  { platform: "tiktok", handle: "anuchicago", source: "joseph", profile: "chicago" },
  { platform: "tiktok", handle: "chibucketlist", source: "joseph", profile: "chicago" },
  { platform: "tiktok", handle: "only_chicago", source: "joseph", profile: "chicago" },
  { platform: "tiktok", handle: "timeoutchicago", source: "research", profile: "chicago" },
  { platform: "tiktok", handle: "lincolnparkzoo", source: "research", profile: "chicago" },
  { platform: "tiktok", handle: "sheddaquarium", source: "research", profile: "chicago" },
  { platform: "tiktok", handle: "fieldmuseum", source: "research", profile: "chicago" },
  { platform: "tiktok", handle: "navypierchicago", source: "research", profile: "chicago" },
  { platform: "tiktok", handle: "artinstitutechi", source: "research", profile: "chicago" },
  { platform: "tiktok", handle: "blockclubchi", source: "research", profile: "chicago" },
  { platform: "tiktok", handle: "secretlychicago", source: "research", profile: "chicago" },
  { platform: "tiktok", handle: "thisischicago", source: "research", profile: "chicago" },
  { platform: "facebook", handle: "groups/1589897138463791", source: "joseph", profile: "chicago" },
  { platform: "facebook", handle: "groups/951998221479788", source: "joseph", profile: "chicago" },
  { platform: "facebook", handle: "chicagoepic", source: "joseph", profile: "chicago" },
  { platform: "facebook", handle: "ChooseChicago", source: "research", profile: "chicago" },
  { platform: "facebook", handle: "TimeOutChicago", source: "research", profile: "chicago" },
  { platform: "facebook", handle: "ChicagoArchitectureCenter", source: "research", profile: "chicago" },
  { platform: "facebook", handle: "LincolnParkZoo", source: "research", profile: "chicago" },
  { platform: "facebook", handle: "SheddAquarium", source: "research", profile: "chicago" },
  { platform: "facebook", handle: "FieldMuseum", source: "research", profile: "chicago" },
  { platform: "facebook", handle: "NavyPierChicago", source: "research", profile: "chicago" },
  { platform: "facebook", handle: "artinstituteofchicago", source: "research", profile: "chicago" },
  { platform: "facebook", handle: "BlockClubChicago", source: "research", profile: "chicago" },
  { platform: "facebook", handle: "ChicagoMagazine", source: "research", profile: "chicago" },
  { platform: "instagram", handle: "discoverla", source: "research", profile: "la" },
  { platform: "instagram", handle: "timeoutla", source: "research", profile: "la" },
  { platform: "instagram", handle: "visitcalifornia", source: "research", profile: "la" },
  { platform: "instagram", handle: "lacma", source: "research", profile: "la" },
  { platform: "instagram", handle: "thegetty", source: "research", profile: "la" },
  { platform: "instagram", handle: "griffithobservatory", source: "research", profile: "la" },
  { platform: "instagram", handle: "dtla", source: "research", profile: "la" },
  { platform: "instagram", handle: "laist", source: "research", profile: "la" },
  { platform: "instagram", handle: "eater_la", source: "research", profile: "la" },
  { platform: "instagram", handle: "hollywoodbowl", source: "research", profile: "la" },
  { platform: "instagram", handle: "nbcla", source: "research", profile: "la" },
  { platform: "youtube", handle: "DiscoverLA", source: "research", profile: "la" },
  { platform: "youtube", handle: "LACMA", source: "research", profile: "la" },
  { platform: "youtube", handle: "VisitCalifornia", source: "research", profile: "la" },
  { platform: "youtube", handle: "KTLA", source: "research", profile: "la" },
  { platform: "youtube", handle: "NBCLA", source: "research", profile: "la" },
  { platform: "tiktok", handle: "discoverla", source: "research", profile: "la" },
  { platform: "tiktok", handle: "timeoutla", source: "research", profile: "la" },
  { platform: "tiktok", handle: "lacma", source: "research", profile: "la" },
  { platform: "facebook", handle: "DiscoverLosAngeles", source: "research", profile: "la" },
  { platform: "facebook", handle: "LACMA", source: "research", profile: "la" },
  { platform: "facebook", handle: "VisitCalifornia", source: "research", profile: "la" },
  { platform: "instagram", handle: "nycgo", source: "research", profile: "nyc" },
  { platform: "instagram", handle: "timeoutnewyork", source: "research", profile: "nyc" },
  { platform: "instagram", handle: "moma", source: "research", profile: "nyc" },
  { platform: "instagram", handle: "metmuseum", source: "research", profile: "nyc" },
  { platform: "instagram", handle: "centralparknyc", source: "research", profile: "nyc" },
  { platform: "instagram", handle: "nypl", source: "research", profile: "nyc" },
  { platform: "instagram", handle: "eater_ny", source: "research", profile: "nyc" },
  { platform: "instagram", handle: "nyctourism", source: "research", profile: "nyc" },
  { platform: "instagram", handle: "bryantparknyc", source: "research", profile: "nyc" },
  { platform: "youtube", handle: "NYCGo", source: "research", profile: "nyc" },
  { platform: "youtube", handle: "TheMet", source: "research", profile: "nyc" },
  { platform: "youtube", handle: "MoMAvideos", source: "research", profile: "nyc" },
  { platform: "youtube", handle: "NYCTourism", source: "research", profile: "nyc" },
  { platform: "tiktok", handle: "nycgo", source: "research", profile: "nyc" },
  { platform: "tiktok", handle: "timeoutnewyork", source: "research", profile: "nyc" },
  { platform: "tiktok", handle: "metmuseum", source: "research", profile: "nyc" },
  { platform: "facebook", handle: "nycgo", source: "research", profile: "nyc" },
  { platform: "facebook", handle: "metmuseum", source: "research", profile: "nyc" },
  { platform: "facebook", handle: "MoMATheMuseumofModernArt", source: "research", profile: "nyc" },
  { platform: "instagram", handle: "miamiandbeaches", source: "research", profile: "miami" },
  { platform: "instagram", handle: "timeoutmiami", source: "research", profile: "miami" },
  { platform: "instagram", handle: "wynwoodmiami", source: "research", profile: "miami" },
  { platform: "instagram", handle: "vizcayamuseum", source: "research", profile: "miami" },
  { platform: "instagram", handle: "pamm", source: "research", profile: "miami" },
  { platform: "instagram", handle: "eater_miami", source: "research", profile: "miami" },
  { platform: "instagram", handle: "southbeach", source: "research", profile: "miami" },
  { platform: "instagram", handle: "brickell", source: "research", profile: "miami" },
  { platform: "youtube", handle: "MiamiandBeaches", source: "research", profile: "miami" },
  { platform: "youtube", handle: "TimeOutMiami", source: "research", profile: "miami" },
  { platform: "youtube", handle: "VisitFlorida", source: "research", profile: "miami" },
  { platform: "tiktok", handle: "miamiandbeaches", source: "research", profile: "miami" },
  { platform: "tiktok", handle: "timeoutmiami", source: "research", profile: "miami" },
  { platform: "tiktok", handle: "wynwoodmiami", source: "research", profile: "miami" },
  { platform: "facebook", handle: "MiamiandBeaches", source: "research", profile: "miami" },
  { platform: "facebook", handle: "VizcayaMuseum", source: "research", profile: "miami" },
  { platform: "facebook", handle: "PAMM", source: "research", profile: "miami" },
]);

/*__STUDIO_WORKER_EXTRACT:studioNormalizeSimilarProfile__*/
/*__STUDIO_WORKER_EXTRACT:studioSimilarProfileLabel__*/
/*__STUDIO_WORKER_EXTRACT:parseSimilarWatchlist__*/
/*__STUDIO_WORKER_EXTRACT:studioSimilarAccountKey__*/
/*__STUDIO_WORKER_EXTRACT:parseSimilarTimesCache__*/
/*__STUDIO_WORKER_EXTRACT:studioChicagoWeekdayHour__*/
/*__STUDIO_WORKER_EXTRACT:studioHeatmapWindow__*/
/*__STUDIO_WORKER_EXTRACT:studioBuildSimilarHeatmap__*/
/*__STUDIO_WORKER_EXTRACT:studioOwnScheduleHeatmap__*/
/*__STUDIO_WORKER_EXTRACT:studioMergeSeedWatchlist__*/
/*__STUDIO_WORKER_EXTRACT:studioReadSimilarWatchlist__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsureSimilarWatchlist__*/
/*__STUDIO_WORKER_EXTRACT:studioResolveSimilarTimesTheme__*/
/*__STUDIO_WORKER_EXTRACT:studioTimedWatchlistAccounts__*/
/*__STUDIO_WORKER_EXTRACT:studioManualSweepWatchlistAccounts__*/
/*__STUDIO_WORKER_EXTRACT:studioSimilarAccountStale__*/
/*__STUDIO_WORKER_EXTRACT:studioNormalizeSimilarStatus__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsBuildOverview__*/
/*__STUDIO_WORKER_EXTRACT:studioBuildSimilarTimesView__*/
/*__STUDIO_WORKER_EXTRACT:getInsightsWatchlist__*/
/*__STUDIO_WORKER_EXTRACT:putInsightsWatchlist__*/
/*__STUDIO_WORKER_EXTRACT:studioLoadSimilarTimesView__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsSafeJson__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsMetaIdentity__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsConnectionStateFromError__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsLatestSyncByPlatform__*/
/*__STUDIO_WORKER_EXTRACT:getInsightsConnections__*/
/*__STUDIO_WORKER_EXTRACT:studioInsightsMilestoneSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:getInsightsPosts__*/
/*__STUDIO_WORKER_EXTRACT:postInsightsChat__*/
/*__STUDIO_WORKER_EXTRACT:getInsightsBestTimes__*/
/*__STUDIO_WORKER_EXTRACT:getInsightsCaptions__*/
/*__STUDIO_WORKER_EXTRACT:getInsightsSimilarTimes__*/
/*__STUDIO_WORKER_EXTRACT:postInsightsSimilarTimesSweep__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputNativeIdFields__*/
/*__STUDIO_WORKER_EXTRACT:studioFirstPartySnapshotFields__*/
/*__STUDIO_WORKER_EXTRACT:studioPersistFirstPartySnapshot__*/
/*__STUDIO_WORKER_EXTRACT:studioResolveTikTokOwnedVideoId__*/
/*__STUDIO_WORKER_EXTRACT:studioFetchOwnedOutputAnalytics__*/
/*__STUDIO_WORKER_EXTRACT:studioSweepPublishedInsights__*/
/*__STUDIO_WORKER_EXTRACT:studioFetchOutputInsights__*/
/*__STUDIO_WORKER_EXTRACT:studioSanitizeIgHandle__*/
/*__STUDIO_WORKER_EXTRACT:studioSanitizeYtHandle__*/
/*__STUDIO_WORKER_EXTRACT:studioTruncateInsightError__*/
/*__STUDIO_WORKER_EXTRACT:studioFetchInstagramBusinessDiscovery__*/
/*__STUDIO_WORKER_EXTRACT:studioFetchYoutubePublicUploads__*/
const STUDIO_INSIGHTS_DISCOVERY_QUERIES = Object.freeze({
  chicago: [
    "Chicago travel vlog",
    "Chicago city guide",
    "things to do in Chicago",
    "Chicago food tour",
    "Explore Chicago",
  ],
  la: [
    "Los Angeles travel vlog",
    "things to do in Los Angeles",
    "LA city guide",
  ],
  nyc: [
    "New York City travel vlog",
    "things to do in New York",
    "NYC city guide",
  ],
  miami: [
    "Miami travel vlog",
    "things to do in Miami",
    "Miami city guide",
    "Miami Beach food tour",
  ],
});

/*__STUDIO_WORKER_EXTRACT:studioStampYoutubeCreatorDiscoveryRun__*/
/*__STUDIO_WORKER_EXTRACT:studioDiscoverYoutubeChicagoCreators__*/
/*__STUDIO_WORKER_EXTRACT:postInsightsDiscover__*/
/*__STUDIO_WORKER_EXTRACT:engagementThemeContextRecord__*/
/*__STUDIO_WORKER_EXTRACT:engagementDeps__*/
/*__STUDIO_WORKER_EXTRACT:resolveEngagementProfile__*/
/*__STUDIO_WORKER_EXTRACT:getEngagementSettings__*/
/*__STUDIO_WORKER_EXTRACT:putEngagementSettings__*/
/*__STUDIO_WORKER_EXTRACT:postEngagementDiscover__*/
/*__STUDIO_WORKER_EXTRACT:getEngagementRecommendations__*/
/*__STUDIO_WORKER_EXTRACT:postEngagementAction__*/
/*__STUDIO_WORKER_EXTRACT:getEngagementInsights__*/
/*__STUDIO_WORKER_EXTRACT:studioSweepSimilarAccountTimes__*/
/*__STUDIO_WORKER_EXTRACT:restoreParentContentItemFromStudioUmbrella__*/
/*__STUDIO_WORKER_EXTRACT:markParentContentItemAsStudioUmbrella__*/
/*__STUDIO_WORKER_EXTRACT:finishedDestinationKeyFromPlatformOutput__*/
/*__STUDIO_WORKER_EXTRACT:listExistingFinishedPlatformOutputs__*/
/*__STUDIO_WORKER_EXTRACT:keepFinishedOutputRows__*/
/*__STUDIO_WORKER_EXTRACT:fanoutProductionRequestOutputsToContentItems__*/
/*__STUDIO_WORKER_EXTRACT:completeProductionRequestPromotionSideEffects__*/
/*__STUDIO_WORKER_EXTRACT:assertProductionRequestFanoutComplete__*/
/*__STUDIO_WORKER_EXTRACT:cancelSiblingProductionRequestsForIdea__*/
/*__STUDIO_WORKER_EXTRACT:finalizeProductionRequestPromotion__*/
// A blank Voiceover_URL with a Drive file id is a read we already paid for.
// Clearing that id made the next P2 pulse buy the same sentence again
// (Getty Sunset Frame, Content 608, repeated Briony history). Keep it.
// Thumbnail residue can still be cleared; that path does not call ElevenLabs.
/*__STUDIO_WORKER_EXTRACT:item4StaleMediaRunClears__*/
/*__STUDIO_WORKER_EXTRACT:armStudioParentForP3Handoff__*/
/*__STUDIO_WORKER_EXTRACT:pulseStudioP2Handoff__*/
/*__STUDIO_WORKER_EXTRACT:pulseStudioP3Handoff__*/
/*__STUDIO_WORKER_EXTRACT:pulseStudioC2Handoff__*/
/*__STUDIO_WORKER_EXTRACT:promoteProductionRequestViaI3I4__*/
const STUDIO_PROMOTION_CONTENT_TYPES = new Set([
  "Vertical Short Video",
  "Story",
  "Carousel",
  "Feed Post",
  "Text Post",
  "Thread",
  "Longform Video",
  "Thumbnail / Promo Still",
  "Event / Flyer Post",
  "Photo Set",
]);

// Phase 2A promotion intentionally limits selection to platforms with an
// already-established ChicagoShining execution path. Threads/X/Lemon8 can be
// added when their publishing chains are productionized.
const STUDIO_PROMOTION_PLATFORMS = new Set(["Instagram", "Facebook", "TikTok", "YouTube"]);
const STUDIO_TRISTATE = new Set(["Use Profile Default", "Yes", "No"]);

/*__STUDIO_WORKER_EXTRACT:cleanPromotionPayload__*/
/*__STUDIO_WORKER_EXTRACT:promotionWebhookUrl__*/
/*__STUDIO_WORKER_EXTRACT:fetchPromotionHandoff__*/
/*__STUDIO_WORKER_EXTRACT:promotionCompleted__*/
/*__STUDIO_WORKER_EXTRACT:waitForPromotionResult__*/
/*__STUDIO_WORKER_EXTRACT:promoteIdeaViaI3I4__*/
/*__STUDIO_WORKER_EXTRACT:ideaPhotoListeningSessionRoute__*/
/*__STUDIO_WORKER_EXTRACT:lockIdeaPhotoListeningForProduction__*/
/*__STUDIO_WORKER_EXTRACT:ideaSelectedPhotoIds__*/
/*__STUDIO_WORKER_EXTRACT:sameIdeaPhotoWaitSelection__*/
/*__STUDIO_WORKER_EXTRACT:hydrateIdeaProductionAfterOpen__*/
/*__STUDIO_WORKER_EXTRACT:queueIdeaProductionAfterOpen__*/
/*__STUDIO_WORKER_EXTRACT:getAuthorizedIdeaRoute__*/
/*__STUDIO_WORKER_EXTRACT:approveIdeaAndWaitForPhotos__*/
/*__STUDIO_WORKER_EXTRACT:ideaPhotoWatchContentType__*/
/*__STUDIO_WORKER_EXTRACT:ideaPhotoWatchRange__*/
/*__STUDIO_WORKER_EXTRACT:ideaPhotoAutoListenContentType__*/
/*__STUDIO_WORKER_EXTRACT:ideaHasExplicitPhotoProductionConfig__*/
/*__STUDIO_WORKER_EXTRACT:autoListenOpenPhotoIdeas__*/
/*__STUDIO_WORKER_EXTRACT:watchIdeaPhotosRoute__*/
/*__STUDIO_WORKER_EXTRACT:matchIdeaPhotosRoute__*/
/*__STUDIO_WORKER_EXTRACT:ideaTimedScriptCatalogRow__*/
/*__STUDIO_WORKER_EXTRACT:pulseIdeaTimedScriptWriter__*/
/*__STUDIO_WORKER_EXTRACT:scriptedShortUnassignedMessage__*/
/*__STUDIO_WORKER_EXTRACT:proposeScriptedShortRoute__*/
/*__STUDIO_WORKER_EXTRACT:acceptScriptedShortRoute__*/
/*__STUDIO_WORKER_EXTRACT:feedPostNotesWithoutTimeline__*/
/*__STUDIO_WORKER_EXTRACT:acceptSingleImageFeedPost__*/
/** Feed Post / Carousel / Photo Set: attach chosen stills with no voiceover timeline. */
/*__STUDIO_WORKER_EXTRACT:acceptStillsIdeaPackage__*/
/*__STUDIO_WORKER_EXTRACT:vibeCutPlanFromBody__*/
/*__STUDIO_WORKER_EXTRACT:planVibeCutRoute__*/
/*__STUDIO_WORKER_EXTRACT:anotherVibeCutRoute__*/
/*__STUDIO_WORKER_EXTRACT:createIdeaTimedScriptRoute__*/
/*__STUDIO_WORKER_EXTRACT:findDraftProductionRequestForIdea__*/
/*__STUDIO_WORKER_EXTRACT:rankStillsForIdeaPhotoWait__*/
/*__STUDIO_WORKER_EXTRACT:rankVideosForScriptedShortProposal__*/
/*__STUDIO_WORKER_EXTRACT:unfinishedIntakeBatchIds__*/
/*__STUDIO_WORKER_EXTRACT:applyLibraryAssetsToProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:evaluateAndMaybeAttachWaitingIdeaPhotos__*/
/*__STUDIO_WORKER_EXTRACT:runWaitingIdeaPhotoMatches__*/
/*__STUDIO_WORKER_EXTRACT:listContent__*/
const OUTPUT_LIST_FIELDS = [
  "Output_ID",
  "Platform",
  "Format",
  "Platform_Output_Type",
  "Studio_Output_Type",
  "Aspect_Ratio",
  "Output_Status",
  "Render_Status",
  "Review_Status",
  "Publish_Status",
  "Publish_Method",
  "Auto_Publish_Enabled",
  "Do_Not_Publish",
  "Final_File_URL",
  "Final_File_Name",
  "Publish_Asset_URL",
  "Output_Title",
  "Output_Caption",
  "Output_Notes",
  "Output_Hashtags",
  "Thumbnail_URL",
  "Clip_1_URL",
  "Selected_Clip_1_URL",
  "Scheduled_Post_Date",
  "Studio_Scheduled_At",
  "YouTube_Scheduled_Publish_At",
  "Studio_Preview_URL",
  "Studio_Preview_Updated_At",
  "Output_URL",
  "Platform_Post_URL",
  "Published_At",
  "TikTok_Draft_Status",
  "Manual_Published_URL",
  "FB_Publish_Status",
  "FB_Slideshow_Status",
  "IG_Carousel_Status",
  "IG_Story_Status",
  "YouTube_Stage",
  "YouTube_Video_ID",
  "YouTube_Package_Status",
  "YouTube_Upload_Status",
  "YouTube_Processing_Status",
  "YouTube_Upload_Progress_Percent",
  "YouTube_Processing_Progress_Percent",
  "Content_Item",
  // Production request is resolved from Content_Item; no Production_Request column exists here.
  "Content_Profile",
  "Carousel Slides",
  "Composition_ID",
  // Scalar proof of selected media for the lean Pipeline list (not multi-KB JSON).
  "Selected_Clip_Count",
  // Keep Pipeline list lean: Selected_Assets_JSON / Creative_Render_Manifest_JSON
  // are multi‑KB per row and stall mobile /api/outputs (Connecting… / Loading outputs…).
  // Creative detail routes still fetch the full record when opened.
  "Publish_Retry_Eligible",
  "Asset_Selection_Retry_Eligible",
  "Asset_Selection_Status",
  "Manual_Completion_Status",
  "Manual_Fallback_Required",
  "Music_Status",
  "Publish_Error_Stage",
  "Publish_Error_Message",
  "Remotion_Error_Message",
  "Final_File_Error_Message",
  "IG_Carousel_Error_Message",
  "Music_Error_Message",
  "FB_Slideshow_Error_Message",
  "YouTube_Error_Message",
  "YouTube_Processing_Failure_Reason",
  "YouTube_Rejection_Reason",
  "Remotion_Job_ID",
  "Review_Decision_At",
  "YouTube_Privacy_Status",
];

/*__STUDIO_WORKER_EXTRACT:scheduleGridContentById__*/
/*__STUDIO_WORKER_EXTRACT:listOutputScheduleGrid__*/
const STUDIO_READ_SNAPSHOT_FRESH_MS = 25000;
const PIPELINE_OUTPUT_LIST_CACHE_MS = STUDIO_READ_SNAPSHOT_FRESH_MS;
const PIPELINE_OPEN_PACK_CACHE_MS = 30000;
const STUDIO_READ_SNAPSHOT_WARM_MS = 2 * 60 * 1000;
let pipelineListHealAt = 0;

/*__STUDIO_WORKER_EXTRACT:studioMappedListSnapshotFresh__*/
/*__STUDIO_WORKER_EXTRACT:readMappedListSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:writeMappedListSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:scheduleMappedListRefresh__*/
/*__STUDIO_WORKER_EXTRACT:respondStudioMappedList__*/
/*__STUDIO_WORKER_EXTRACT:loadOpenPipelineOutputPack__*/
/*__STUDIO_WORKER_EXTRACT:pipelineContentLabelsById__*/
function schedulePipelineListHeal(ctx, env, records) {
  if (!ctx || typeof ctx.waitUntil !== "function") return;
  const now = Date.now();
  if (now - pipelineListHealAt < 60000) return;
  pipelineListHealAt = now;
  ctx.waitUntil((async () => {
    let manualLiveHealBudget = 5;
    let staleManualHealBudget = 8;
    for (const record of (records || []).slice(0, 40)) {
      let current = record;
      try {
        current = await phase6RestoreProductionReviewReady(env, current);
        if (staleManualHealBudget > 0 && staleManualFlagsOnPublishedFields(current?.fields || current)) {
          staleManualHealBudget -= 1;
          current = await healStaleManualFlagsOnPublishedRecord(env, current);
        }
        if (manualLiveHealBudget > 0 && youtubeManualLiveVideoHealCandidate(current?.fields || current)) {
          manualLiveHealBudget -= 1;
          current = await healYoutubeManualWithLiveVideoRecord(env, current, { autoHealed: true });
        }
      } catch (error) {
        console.warn("pipeline list heal skipped", record?.id, error);
      }
    }
    const stalled = (records || []).filter((record) => {
      const output = String(f(record, "Output_Status") || "");
      const render = String(f(record, "Render_Status") || "");
      if (isRenderQueueCandidateStatus(render)) return false;
      return /^in production$/i.test(output)
        && !String(f(record, "Remotion_Job_ID") || "").trim();
    });
    if (!stalled.length) return;
    const requestIds = [];
    for (const record of stalled) {
      let requestId = studioOutputProductionRequestId(record);
      if (!requestId) {
        const contentId = studioFirstLinkedId(f(record, "Content_Item"));
        if (!contentId) continue;
        try {
          const parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId);
          requestId = studioFirstLinkedId(f(parent, "Production_Request"))
            || studioFirstLinkedId(f(parent, "Production Requests"));
        } catch {
          continue;
        }
      }
      if (requestId && !requestIds.includes(requestId)) requestIds.push(requestId);
    }
    for (const requestId of requestIds.slice(0, 4)) {
      try { await enqueueStudioProductionJob(env, requestId); } catch (error) {
        console.warn("Pipeline produce enqueue failed", requestId, error);
      }
    }
  })());
}

/*__STUDIO_WORKER_EXTRACT:readPipelineOutputsSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:writePipelineOutputsSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:buildPipelineOutputsPayloadFromSupabase__*/
/*__STUDIO_WORKER_EXTRACT:buildPipelineOutputsPayload__*/
const STUDIO_SUPABASE_SYNC_LAST_KEY = "studio/state/supabase-pipeline-sync-last.json";

/*__STUDIO_WORKER_EXTRACT:readStudioSupabaseSyncLast__*/
/*__STUDIO_WORKER_EXTRACT:writeStudioSupabaseSyncLast__*/
/*__STUDIO_WORKER_EXTRACT:studioSyncSupabasePipelineReads__*/
/*__STUDIO_WORKER_EXTRACT:getStudioSupabaseSyncStatus__*/
/*__STUDIO_WORKER_EXTRACT:postStudioSupabaseSync__*/
/*__STUDIO_WORKER_EXTRACT:warmOldestStudioReadSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:listOutputs__*/
/*__STUDIO_WORKER_EXTRACT:listMusic__*/
/*__STUDIO_WORKER_EXTRACT:musicSortName__*/
/*__STUDIO_WORKER_EXTRACT:sortMusicRecords__*/
/*__STUDIO_WORKER_EXTRACT:toggleMusicFavorite__*/
/*__STUDIO_WORKER_EXTRACT:findMusicLibraryUsages__*/
/*__STUDIO_WORKER_EXTRACT:trashStudioMusicOnDrive__*/
/*__STUDIO_WORKER_EXTRACT:deleteMusicLibraryTrack__*/
const MUSIC_LIBRARY_MAX_FILES = 8;
const MUSIC_LIBRARY_MAX_FILE_BYTES = 40 * 1024 * 1024;
const GDRIVE_MUSIC_FOLDER_ID = "1mzNHcVmeXb6I2WybJD5iOTrJUDRQJIN3";

/*__STUDIO_WORKER_EXTRACT:promoteStudioMusicToDrive__*/
/*__STUDIO_WORKER_EXTRACT:uploadMusicLibraryTracks__*/
const ASSET_LIBRARY_MAX_FILES = 8;
const ASSET_LIBRARY_LIST_FORMULA = "AND(OR({Media_Class}='Image',{Media_Class}='Graphic',{Media_Class}='Video'),OR({Asset_Role}!='Music',{Asset_Role}=BLANK()),NOT(FIND('fill-crop',LOWER({Asset Name}&''))))";
const ASSET_LIBRARY_PAGE_SIZE = 5;
const ASSET_LIBRARY_MAX_PAGE_SIZE = 50;
const PUBLISHED_LIBRARY_LIST_FORMULA = 'AND({Test_Run_ID}=BLANK(),{Published_At}!="")';

/*__STUDIO_WORKER_EXTRACT:coerceLibraryDurationSeconds__*/
/*__STUDIO_WORKER_EXTRACT:publishedLibraryFilterFormula__*/
/*__STUDIO_WORKER_EXTRACT:publishedFinalFileId__*/
/*__STUDIO_WORKER_EXTRACT:publishedDurationSeconds__*/
/*__STUDIO_WORKER_EXTRACT:collectJsonDriveIds__*/
/*__STUDIO_WORKER_EXTRACT:publicMediaObjectKey__*/
/*__STUDIO_WORKER_EXTRACT:publishedLibraryObjectKey__*/
/*__STUDIO_WORKER_EXTRACT:attachPublishedLibraryFileSizes__*/
/*__STUDIO_WORKER_EXTRACT:mapPublishedLibraryFile__*/
/*__STUDIO_WORKER_EXTRACT:publishedFileReleaseGuard__*/
/*__STUDIO_WORKER_EXTRACT:collectPublishedMasterDriveIds__*/
/*__STUDIO_WORKER_EXTRACT:listPublishedLibraryFiles__*/
/*__STUDIO_WORKER_EXTRACT:readLibraryCrossScopeSetting__*/
/*__STUDIO_WORKER_EXTRACT:resolveLibraryCrossScope__*/
/*__STUDIO_WORKER_EXTRACT:mediaAssetProfileScopeForId__*/
/*__STUDIO_WORKER_EXTRACT:resolveLibraryScopeProfileId__*/
/*__STUDIO_WORKER_EXTRACT:resolveLibraryScopeProfile__*/
/*__STUDIO_WORKER_EXTRACT:libraryProfileScopeFormula__*/
/*__STUDIO_WORKER_EXTRACT:assetLibraryFilterFormula__*/
/*__STUDIO_WORKER_EXTRACT:mapLibraryAsset__*/
/*__STUDIO_WORKER_EXTRACT:listAssetLibrary__*/
/*__STUDIO_WORKER_EXTRACT:promoteStudioAssetToDrive__*/
/*__STUDIO_WORKER_EXTRACT:listLibraryBatchExistingNames__*/
/*__STUDIO_WORKER_EXTRACT:uploadAssetLibraryItems__*/
/*__STUDIO_WORKER_EXTRACT:findAssetLibraryUsages__*/
/*__STUDIO_WORKER_EXTRACT:trashStudioAssetOnDrive__*/
/*__STUDIO_WORKER_EXTRACT:renameStudioAssetOnDrive__*/
/*__STUDIO_WORKER_EXTRACT:libraryAssetProfilesById__*/
/*__STUDIO_WORKER_EXTRACT:assertLibrarySourceAsset__*/
/*__STUDIO_WORKER_EXTRACT:assignLibraryAssetProfile__*/
const LIBRARY_CLASSIFY_ALL_LIMIT = 200;
const LIBRARY_CLASSIFY_PENDING_FORMULA = libraryClassifyPendingFormula(ASSET_LIBRARY_LIST_FORMULA);

/*__STUDIO_WORKER_EXTRACT:stampLibraryAssetsClassifying__*/
// Studio "Classify all": every photo/clip that already has a Content Profile and is still
// Needs Classification / Classification Error goes to A3 in one background run.
/*__STUDIO_WORKER_EXTRACT:classifyAllLibraryAssets__*/
/*__STUDIO_WORKER_EXTRACT:pulseLibraryAssetClassification__*/
/*__STUDIO_WORKER_EXTRACT:renameAssetLibraryItem__*/
/*__STUDIO_WORKER_EXTRACT:deleteAssetLibraryItem__*/
/*__STUDIO_WORKER_EXTRACT:patchAssetLibraryDuration__*/
/*__STUDIO_WORKER_EXTRACT:driveTrashLooksGone__*/
/*__STUDIO_WORKER_EXTRACT:stampPublishedFileReleased__*/
/*__STUDIO_WORKER_EXTRACT:deletePublishedR2Keys__*/
/*__STUDIO_WORKER_EXTRACT:loadContentItemSiblingOutputs__*/
/*__STUDIO_WORKER_EXTRACT:clearParentProductionJobJsonIfFullyReleased__*/
/*__STUDIO_WORKER_EXTRACT:outputNeedsMediaReleaseLocal__*/
/*__STUDIO_WORKER_EXTRACT:releasePublishedOutputMedia__*/
/*__STUDIO_WORKER_EXTRACT:releasePublishedLibraryFile__*/
/*__STUDIO_WORKER_EXTRACT:studioPostPublishReleaseDryRunEnabled__*/
/*__STUDIO_WORKER_EXTRACT:studioSweepPostPublishMediaRelease__*/
/*__STUDIO_WORKER_EXTRACT:studioReleaseDerivedFillCropsForOutput__*/
/*__STUDIO_WORKER_EXTRACT:studioReleaseContentItemVoiceoverThumbnail__*/
/*__STUDIO_WORKER_EXTRACT:fetchGoogleDriveAudio__*/
/*__STUDIO_WORKER_EXTRACT:copyDriveAudioHeaders__*/
/*__STUDIO_WORKER_EXTRACT:studioMusicR2Preview__*/
/*__STUDIO_WORKER_EXTRACT:musicPreview__*/
const ITEM4_PREVIEW_SMV1_NAME =
  "SMV1 - Studio Media Authority + Platform Variant Worker v0.6.3 - Media Link Isolation";

/*__STUDIO_WORKER_EXTRACT:item4PreviewSettingValueExpr__*/
/*__STUDIO_WORKER_EXTRACT:item4PreviewR2KeyExpr__*/
/*__STUDIO_WORKER_EXTRACT:item4PreviewR2UrlExpr__*/
/*__STUDIO_WORKER_EXTRACT:item4PreviewR2UploadModule__*/
/*__STUDIO_WORKER_EXTRACT:item4PreviewQueueReadyModule__*/
/*__STUDIO_WORKER_EXTRACT:item4PreviewRouteBlueprint__*/
/*__STUDIO_WORKER_EXTRACT:item4ValidateGeneratedMakeBlueprint__*/
/*__STUDIO_WORKER_EXTRACT:item4AssertPreviewBranchFilters__*/
/*__STUDIO_WORKER_EXTRACT:item4SourceAuthorityInterfaceRows__*/
/*__STUDIO_WORKER_EXTRACT:item4CollectStringSlots__*/
/*__STUDIO_WORKER_EXTRACT:item4SetPath__*/
/*__STUDIO_WORKER_EXTRACT:item4R2PromptSlot__*/
/*__STUDIO_WORKER_EXTRACT:item4FlattenMakeModules__*/
/*__STUDIO_WORKER_EXTRACT:item4FindR2ContextModule__*/
/*__STUDIO_WORKER_EXTRACT:item4FindR2AiModule__*/
/*__STUDIO_WORKER_EXTRACT:item4FindR2FailfastModule__*/
let item4MakeHardeningOpenCache = { at: 0, promise: null, result: null };

/*__STUDIO_WORKER_EXTRACT:item4RecoverStaleR2BaselineReads__*/
/*__STUDIO_WORKER_EXTRACT:deferItem4MakeHardening__*/
async function item4EnsureMakeHardeningFromWorkspaceOpen(env, options = {}) {
  // Ordinary Item 4 polling may reuse a short-lived result, but an explicit
  // /item4 status GET MUST be able to force a fresh live Make inspection after
  // a Worker deployment. This prevents an older in-memory result from suppressing
  // a newly deployed repair contract.
  const force = options?.force === true;
  const buildKey = "0.10.42";
  const now = Date.now();
  if (!force && item4MakeHardeningOpenCache.promise) return item4MakeHardeningOpenCache.promise;
  if (!force && item4MakeHardeningOpenCache.result && item4MakeHardeningOpenCache.buildKey === buildKey && now - item4MakeHardeningOpenCache.at < 120000) {
    return item4MakeHardeningOpenCache.result;
  }
  const promise = (async () => {
    const stale = await item4RecoverStaleR2BaselineReads(env);
    const result = { stale_recovery: stale, p3_single_parent: null, p3_source_authority: null, r2: null };
    // v0.10.4: the single-parent route is a separate contract and MUST NOT be
    // blocked by an older exact-source hardener. Run it first and isolate errors.
    try { result.p3_single_parent = await item4EnsureP3SingleParentRoute(env); }
    catch (error) { result.p3_single_parent = { ok: false, deferred: true, error: error instanceof Error ? error.message : String(error) }; }
    try { result.p3_source_authority = await item4EnsureP3StudioSourceAuthority(env); }
    catch (error) { result.p3_source_authority = { ok: false, deferred: true, error: error instanceof Error ? error.message : String(error) }; }
    try { result.r2 = await item4EnsureR2StudioExactSourceGuard(env); }
    catch (error) { result.r2 = { ok: false, deferred: true, error: error instanceof Error ? error.message : String(error) }; }
    item4MakeHardeningOpenCache = { at: Date.now(), promise: null, result, buildKey };
    return result;
  })();
  item4MakeHardeningOpenCache = { ...item4MakeHardeningOpenCache, promise, buildKey };
  try { return await promise; }
  finally {
    if (item4MakeHardeningOpenCache.promise === promise) item4MakeHardeningOpenCache.promise = null;
  }
}

/*__STUDIO_WORKER_EXTRACT:item4EnsureR2StudioExactSourceGuard__*/
/*__STUDIO_WORKER_EXTRACT:item4P3SourceFieldInterfaceRows__*/
/*__STUDIO_WORKER_EXTRACT:item4EnsureP3StudioSourceAuthority__*/
const STUDIO_P3_REMOTION_HANDOFF_MARKER = "STUDIO_P3_REMOTION_HANDOFF_V4";
// Make IML has no or() function. Use | inside if(), matching Make's own repair hint.
const STUDIO_P3_NATIVE_PHOTO_STATUS_IF =
  '{{if(102.Studio_Output_Type = "Multi-Photo" | 102.Studio_Output_Type = "Carousel" | 102.Studio_Output_Type = "Multi-Image Post"; "Ready for Review"; "In Production")}}';
const STUDIO_P3_NATIVE_PHOTO_SELECTION_IF =
  '{{if(102.Studio_Output_Type = "Multi-Photo" | 102.Studio_Output_Type = "Carousel" | 102.Studio_Output_Type = "Multi-Image Post"; ""; "Selected")}}';

/*__STUDIO_WORKER_EXTRACT:item4P3SingleParentEnrichmentRecord__*/
/*__STUDIO_WORKER_EXTRACT:item4P3Module103HasRemotionHandoff__*/
/*__STUDIO_WORKER_EXTRACT:item4ApplyP3RemotionHandoff__*/
/*__STUDIO_WORKER_EXTRACT:item4PatchP3SingleParentBlueprint__*/
/*__STUDIO_WORKER_EXTRACT:item4QueueP3SingleParentViaAdminBridge__*/
/*__STUDIO_WORKER_EXTRACT:item4LatestP3BlueprintFromAdminQueue__*/
/*__STUDIO_WORKER_EXTRACT:item4EnsureP3SingleParentRouteDirect__*/
/*__STUDIO_WORKER_EXTRACT:item4RecordP3DirectDiagnostic__*/
/*__STUDIO_WORKER_EXTRACT:item4EnsureP3SingleParentRoute__*/
/*__STUDIO_WORKER_EXTRACT:item4EnsureSmv1PreviewCacheWorker__*/
/*__STUDIO_WORKER_EXTRACT:item4PreviewPendingRows__*/
/*__STUDIO_WORKER_EXTRACT:item4DrainPreviewCacheWorker__*/
/*__STUDIO_WORKER_EXTRACT:mediaAssetPreviewRecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:fetchGoogleDriveInlineImage__*/
/*__STUDIO_WORKER_EXTRACT:copyDriveImageHeaders__*/
/*__STUDIO_WORKER_EXTRACT:item4PreviewQueueRowForMediaAsset__*/
/*__STUDIO_WORKER_EXTRACT:fetchStudioR2Preview__*/
/*__STUDIO_WORKER_EXTRACT:mediaAssetDriveThumbnailPreview__*/
/*__STUDIO_WORKER_EXTRACT:mediaAssetImagePreview__*/
/*__STUDIO_WORKER_EXTRACT:outputPreviewRecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:mediaAssetVideoStream__*/
/*__STUDIO_WORKER_EXTRACT:fetchGoogleDriveVideo__*/
/*__STUDIO_WORKER_EXTRACT:copyDriveVideoHeaders__*/
/*__STUDIO_WORKER_EXTRACT:fetchStudioPreviewVideo__*/
/*__STUDIO_WORKER_EXTRACT:copyStudioPreviewHeaders__*/
/*__STUDIO_WORKER_EXTRACT:outputPreview__*/
const PHASE6_CAROUSEL_SLIDES_TABLE = "Carousel Slides";
const PHASE6_STYLE_PRESETS = [
  "Chicago Editorial", "Glass Card", "Black Gold Arched", "Plain / Minimal", "No Text",
  "Clean Documentary", "3D Colorful"
];
const PHASE6_TEXT_ROLES = ["overlay", "title-card", "callout-card", "end-card"];
const PHASE6_POSITIONS = ["top", "upper-third", "center", "lower-third", "bottom", "left", "right"];
const PHASE6_FOCAL_POINTS = ["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"];
const PHASE6_FIT_MODES = ["fill_crop", "full_with_blur", "full_with_solid_background"];
const PHASE6_MOTIONS = ["none", "slowZoom", "slowZoomOut", "panLeft", "panRight", "panUp", "panDown", "kenBurnsLeft", "kenBurnsRight"];
const PHASE6_TRANSITIONS = ["none", "fade", "slideLeft", "slideRight", "zoom"];
const PHASE6_VOICES = ["Kate", "George"]; // legacy display fallback only
const PHASE6_VOICE_CATALOG_TABLE = "ElevenLabs Voices";
const PHASE6_DEFAULT_VOICE_ID = "xVQH621DS3eyBYrseRt5";
const PHASE6_GEORGE_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

/*__STUDIO_WORKER_EXTRACT:phase6NarrationVoiceFallback__*/
/**
 * Prefer Production Request / Content Item Voice_ID, then the Content Profile
 * default narration voice (Miami=Mary). Do not fall through to Kate while those
 * are present — Pipeline Open Review used to ignore them and show Kate.
 */
/*__STUDIO_WORKER_EXTRACT:phase6ResolveNarrationVoice__*/
/*__STUDIO_WORKER_EXTRACT:phase6NarrationVoiceFromRequest__*/
const PHASE6_P0202_SCENARIO_ID = 5893683;
const PHASE6_R2_SCENARIO_ID = 5569495;
const PHASE6_R3_SCENARIO_ID = 5557966;
const PHASE6_R4_SCENARIO_ID = 5556716;
const PHASE6_R5_SCENARIO_ID = 5565333;
const PHASE6_RR1_SCENARIO_ID = 5576363;
const PHASE6_RR2_SCENARIO_ID = 5576353;
const STUDIO_R5_DONE_HOOK_TOKEN = "r5done_7kqp2nvm4w8x1c9h3z";

/*__STUDIO_WORKER_EXTRACT:phase6RecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:phase6ParseJson__*/
/*__STUDIO_WORKER_EXTRACT:phase6Number__*/
/*__STUDIO_WORKER_EXTRACT:phase6Clamp__*/
/*__STUDIO_WORKER_EXTRACT:phase6ResolvedVoiceoverVolume__*/
/*__STUDIO_WORKER_EXTRACT:phase6AudioMixFieldsFromPayload__*/
/*__STUDIO_WORKER_EXTRACT:phase6ProductionMixAction__*/
/*__STUDIO_WORKER_EXTRACT:phase6AssertProductionAudioMixAllowed__*/
/*__STUDIO_WORKER_EXTRACT:phase6AllowsProductionMixContinuation__*/
/*__STUDIO_WORKER_EXTRACT:phase6Bool__*/
/*__STUDIO_WORKER_EXTRACT:phase6Text__*/
/*__STUDIO_WORKER_EXTRACT:phase6VariantForRatio__*/
/*__STUDIO_WORKER_EXTRACT:phase6SlidePreviewUrl__*/
/*__STUDIO_WORKER_EXTRACT:mapPhase6CreativeSlide__*/
/*__STUDIO_WORKER_EXTRACT:phase6VirtualSlidesFromSelectedAssets__*/
/*__STUDIO_WORKER_EXTRACT:phase6SlidesForOutput__*/
/*__STUDIO_WORKER_EXTRACT:phase6CachedVoiceCatalog__*/
/*__STUDIO_WORKER_EXTRACT:mapElevenLabsVoice__*/
/*__STUDIO_WORKER_EXTRACT:phase6ElevenLabsErrorDetail__*/
/*__STUDIO_WORKER_EXTRACT:phase6FetchElevenLabsJson__*/
/*__STUDIO_WORKER_EXTRACT:phase6CollectElevenLabsVoices__*/
/*__STUDIO_WORKER_EXTRACT:phase6LiveElevenLabsVoices__*/
/*__STUDIO_WORKER_EXTRACT:phase6VoiceCatalog__*/
/*__STUDIO_WORKER_EXTRACT:listPhase6Voices__*/
/*__STUDIO_WORKER_EXTRACT:phase6VoicePreviewUrl__*/
/*__STUDIO_WORKER_EXTRACT:phase6VoicePreview__*/
/*__STUDIO_WORKER_EXTRACT:phase6FindModule__*/
/*__STUDIO_WORKER_EXTRACT:phase6EnsureP0202DynamicVoiceMapping__*/
/*__STUDIO_WORKER_EXTRACT:mapPhase6CreativeOutput__*/
/*__STUDIO_WORKER_EXTRACT:getOutputCreative__*/
/*__STUDIO_WORKER_EXTRACT:phase6Select__*/
/*__STUDIO_WORKER_EXTRACT:phase6SlideDirectiveFromPayload__*/
/*__STUDIO_WORKER_EXTRACT:updateOutputCreative__*/
/*__STUDIO_WORKER_EXTRACT:phase6DimensionsForRatio__*/
/*__STUDIO_WORKER_EXTRACT:phase6AssetSourceForSlide__*/
/*__STUDIO_WORKER_EXTRACT:phase6TitleEditIdentity__*/
/*__STUDIO_WORKER_EXTRACT:phase6NextTitleVersion__*/
/*__STUDIO_WORKER_EXTRACT:phase6TitleLockState__*/
/*__STUDIO_WORKER_EXTRACT:phase6TitleLockView__*/
/*__STUDIO_WORKER_EXTRACT:phase6TitleRenderInput__*/
/*__STUDIO_WORKER_EXTRACT:phase6SlidesWithTitleRenderInput__*/
/*__STUDIO_WORKER_EXTRACT:phase6RenderOverlayFromSlide__*/
/*__STUDIO_WORKER_EXTRACT:phase6BuildPreviewRenderPackage__*/
/*__STUDIO_WORKER_EXTRACT:phase6PendingVoicePrepSlides__*/
/*__STUDIO_WORKER_EXTRACT:phase6EnsureP0202ProductionGeneric__*/
/*__STUDIO_WORKER_EXTRACT:phase6Mp3DurationSeconds__*/
/*__STUDIO_WORKER_EXTRACT:phase6MeasureAndPersistMissingVoiceDurations__*/
/*__STUDIO_WORKER_EXTRACT:phase6ScenarioState__*/
/*__STUDIO_WORKER_EXTRACT:phase6SetScenarioActive__*/
/*__STUDIO_WORKER_EXTRACT:phase6RunAlreadyActiveError__*/
/*__STUDIO_WORKER_EXTRACT:phase6PulseOnDemandScenario__*/
/*__STUDIO_WORKER_EXTRACT:phase6WaitForOutputStatus__*/
/*__STUDIO_WORKER_EXTRACT:phase6AutoRunRenderPipeline__*/
/*__STUDIO_WORKER_EXTRACT:phase6StopScenarioVerified__*/
/*__STUDIO_WORKER_EXTRACT:phase6PulseInactiveScenario__*/
/*__STUDIO_WORKER_EXTRACT:phase6TimeMs__*/
/*__STUDIO_WORKER_EXTRACT:phase6CompactTimestampMs__*/
/*__STUDIO_WORKER_EXTRACT:phase6CurrentRenderStartedAfterReview__*/
/*__STUDIO_WORKER_EXTRACT:phase6CurrentFinalFileAfterReview__*/
/*__STUDIO_WORKER_EXTRACT:phase6PreviewFulfillsCurrentReview__*/
/*__STUDIO_WORKER_EXTRACT:phase6RestoreProductionReviewReady__*/
/*__STUDIO_WORKER_EXTRACT:inspectRemotionOrCloudConvertStatus__*/
/*__STUDIO_WORKER_EXTRACT:phase6RenderHandoffState__*/
/*__STUDIO_WORKER_EXTRACT:phase6CreativeMixRevisionInFlight__*/
/*__STUDIO_WORKER_EXTRACT:phase6CreativeHandoffStatus__*/
/*__STUDIO_WORKER_EXTRACT:getOutputCreativeHandoffStatus__*/
/*__STUDIO_WORKER_EXTRACT:phase6AdvanceRenderPipelineShort__*/
/*__STUDIO_WORKER_EXTRACT:phase6EnsureRenderPackageForContinuation__*/
/*__STUDIO_WORKER_EXTRACT:continueOutputCreativeHandoff__*/
/*__STUDIO_WORKER_EXTRACT:phase6MakeApiConfig__*/
/*__STUDIO_WORKER_EXTRACT:phase6MakeApiJson__*/
/*__STUDIO_WORKER_EXTRACT:phase6EnsureScenarioActive__*/
const STUDIO_R2_WORK_FORMULA = 'AND({Test_Run_ID}=BLANK(),NOT({Do_Not_Publish}),{Content_Item}!=BLANK(),{Output_Status}="Ready for Review",OR({Asset_Need_Status}="Not Needed",{Asset_Need_Status}="Fulfilled"),{Asset_Selection_Status}=BLANK(),{Render_Status}=BLANK(),{Remotion_Job_ID}=BLANK(),{Final_File_URL}="")';
const STUDIO_R3_WORK_FORMULA = 'AND({Test_Run_ID}=BLANK(),AND({Asset_Selection_Status}="Selected",{Selected_Assets_JSON}!="",{Render_Status}=BLANK(),{Format}!="Story",{Studio_Output_Type}!="Story",OR({Format}="Vertical Short Video",{Format}="Longform Video",{Format}="Feed Post",{Format}="Reel",{Format}="Slideshow Reel",{Format}="Video Draft",{Format}="Short",{Format}="Standard Video",{Format}="Slideshow Video")))';
const STUDIO_T1_WORK_FORMULA = 'AND({Test_Run_ID}=BLANK(),OR({Render_Status}="Ready for Render",{Render_Status}="Waiting in Render Queue"),{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0,{Format}!="Story",{Studio_Output_Type}!="Story",OR({Timing_Status}=BLANK(),{Timing_Status}="Pending"),OR({Music_URL}!="",{Selected_Music_URL}!=""))';
const STUDIO_R4_WORK_FORMULA = 'AND({Test_Run_ID}=BLANK(),AND({Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0,{Format}!="Story",{Studio_Output_Type}!="Story"))';
const STUDIO_RENDER_QUEUE_CANDIDATE_FORMULA = 'AND({Test_Run_ID}=BLANK(),OR({Render_Status}="Ready for Render",{Render_Status}="Waiting in Render Queue"),{Remotion_Job_ID}="",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0,{Format}!="Story",{Studio_Output_Type}!="Story")';
const STUDIO_RENDER_QUEUE_ACTIVE_FORMULA = 'AND({Test_Run_ID}=BLANK(),{Render_Status}="Rendering",{Remotion_Job_ID}!="",{Final_File_URL}="")';
const STUDIO_RR1_WORK_FORMULA = 'AND({Test_Run_ID}=BLANK(),{Output_Status}="Ready for Review",{Review_Email_Sent_At}=BLANK(),OR({Review_Status}=BLANK(),{Review_Status}=""),OR(AND({Render_Status}="Rendered",{Final_File_URL}!=""),AND({Render_Status}="Native Photo Route",OR({Studio_Preview_URL}!="",{Thumbnail_URL}!="",{Selected_Assets_JSON}!="")),AND({Platform}="TikTok",{Studio_Output_Type}="Multi-Photo",{Composition_ID}="",{Render_Clip_List_JSON}!=""),AND({Platform}="Instagram",{Studio_Output_Type}="Carousel",{Composition_ID}="",{Selected_Assets_JSON}!=""),AND({Platform}="Facebook",{Studio_Output_Type}="Multi-Image Post",{Composition_ID}="",{Selected_Assets_JSON}!="")))';
const STUDIO_CONTINUATION_CANDIDATE_FORMULA = 'AND({Test_Run_ID}=BLANK(),{Production_Request_Output}!=BLANK(),{Published_At}=BLANK(),NOT({Output_Status}="Published"),NOT({Output_Status}="Approved for Publishing"))';
const STUDIO_RFR_MISSING_COVER_FORMULA = `AND(${STUDIO_CONTINUATION_CANDIDATE_FORMULA},{Output_Status}="Ready for Review",{Output_ID}>=227,OR({Thumbnail_URL}="",FIND("ITEM4-VARIANT-fill-crop",{Thumbnail_URL}&""),{Output_Caption}=""))`;
const PRODUCTION_CADENCE_RENDER = Object.freeze([
  { id: 5528742, key: "P1" },
  { id: 5569495, key: "R2" },
  { id: 5557966, key: "R3" },
  { id: 5556716, key: "R4" },
  { id: 5565333, key: "R5" },
  { id: 5576363, key: "RR1" },
]);
const PRODUCTION_CADENCE_PUBLISH = Object.freeze([
  { id: STUDIO_IG_ORCH_SCENARIO_ID, key: "IG" },
  { id: 5791537, key: "APCAR" },
  { id: 5813561, key: "FB" },
  { id: 5806668, key: "TTD" },
  { id: 5823581, key: "YT" },
]);
// AP-CAR-ORCH 5791537 is Python when STAGE_BACKEND_APCAR_ORCH=python.
// IG-PUB-ORCH 5864632 is Python when STAGE_BACKEND_IG_ORCH=python. These
// webhook workers are the carousel chain Studio Approve starts (AP0C).
const STUDIO_AP0C_CHAIN_WEBHOOKS = Object.freeze([
  { id: 5786899, key: "AP0C" },
  { id: 5790745, key: "AP1C" },
  { id: 5791231, key: "AP2C" },
  { id: 5791273, key: "AP3C" },
  { id: 5791336, key: "AP3P" },
  { id: 5791356, key: "AP4C" },
  { id: 5791396, key: "AP4R" },
  { id: 5791424, key: "AP5C" },
]);
// FB-ORCH 5813561 stays parked. These webhook workers are the photo chain
// Studio Approve starts (FB0) and each stage then pulses the next.
const STUDIO_FB0_CHAIN_WEBHOOKS = Object.freeze([
  { id: 5813436, key: "FB0" },
  { id: 5813463, key: "FB1" },
  { id: 5813487, key: "FB2" },
  { id: 5813511, key: "FB2R" },
  { id: 5813534, key: "FB3" },
]);
const PRODUCTION_CADENCE_WEBHOOK_LIVE = Object.freeze([
  { id: STUDIO_AP0_SCENARIO_ID, key: "AP0" },
  { id: STUDIO_AP1_IG_SCENARIO_ID, key: "AP1-IG" },
  { id: 5612664, key: "IGS" },
  { id: 5845193, key: "IGSPOLL" },
  { id: STUDIO_FBS1_SCENARIO_ID, key: "FBS1" },
  { id: STUDIO_FBS2_SCENARIO_ID, key: "FBS2" },
  { id: STUDIO_FBS3_SCENARIO_ID, key: "FBS3" },
  { id: STUDIO_FBS4_SCENARIO_ID, key: "FBS4" },
  { id: STUDIO_YT0_SCENARIO_ID, key: "YT0" },
  { id: STUDIO_YTP1_SCENARIO_ID, key: "YTP1" },
  { id: STUDIO_YTS1_SCENARIO_ID, key: "YTS1" },
  { id: STUDIO_YTS2_SCENARIO_ID, key: "YTS2" },
  { id: STUDIO_YTS3_SCENARIO_ID, key: "YTS3" },
  { id: STUDIO_TTD0_SCENARIO_ID, key: "TTD0" },
  { id: STUDIO_TTD1_SCENARIO_ID, key: "TTD1" },
  { id: STUDIO_TTD2_SCENARIO_ID, key: "TTD2" },
  { id: STUDIO_TTD3_SCENARIO_ID, key: "TTD3" },
  { id: STUDIO_TTD4_SCENARIO_ID, key: "TTD4" },
  ...STUDIO_AP0C_CHAIN_WEBHOOKS,
  ...STUDIO_FB0_CHAIN_WEBHOOKS,
  { id: ITEM4_P2_SCENARIO_ID, key: "P2" },
  { id: ITEM4_P3_SCENARIO_ID, key: "P3" },
  { id: ITEM4_C2_SCENARIO_ID, key: "C2" },
]);
const STUDIO_AP0_WEBHOOK_URL = ""; // Make.com retired
// Live FB-PUBLIC scenario 6107230 (Make connection 9988775). Not unpublished Graph / FB-ORCH.
const STUDIO_FB_PUBLIC_WEBHOOK_URL = ""; // Make.com retired; Facebook publishes through native Graph/Python stages.
const STUDIO_FB_PUBLIC_SCENARIO_ID = 6107230;
const STUDIO_FB_PUBLIC_DIAG_CORRELATION = "FB-PUBLIC-LIVE-DIAG-20260921-V3";
const STUDIO_AP0_RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const PRODUCTION_CADENCE_PUBLISH_ORCH = Object.freeze([
  { id: STUDIO_IG_ORCH_SCENARIO_ID, key: "IG" },
  { id: 5813561, key: "FB" },
  { id: 5823581, key: "YT" },
  { id: 5806668, key: "TTD" },
  { id: 5791537, key: "APCAR" },
]);
const PRODUCTION_CADENCE_ALWAYS_ON = Object.freeze([]);
const PRODUCTION_CADENCE_MEDIA = Object.freeze([
  { id: 5894885, key: "SMV1" },
  { id: 5893683, key: "P020-2" },
  { id: 5764543, key: "A1M" },
]);
const PRODUCTION_CADENCE_CAROUSEL = Object.freeze([
  { id: 5582062, key: "C1" },
  { id: 5582071, key: "C2" },
  { id: 5586579, key: "C2M" },
]);
const PRODUCTION_CADENCE_REPAIR = Object.freeze([
  { id: 5569896, key: "M1" },
  { id: 5576620, key: "R2B" },
  { id: 5893243, key: "MAKEADMIN" },
]);
const STUDIO_M1_SCENARIO_ID = 5569896;
const STUDIO_R2B_SCENARIO_ID = 5576620;
const STUDIO_MAKE_ADMIN_BRIDGE_SCENARIO_ID = 5893243;
const STUDIO_MAKE_ADMIN_PENDING_FORMULA = '{Status}="Pending"';
const STUDIO_R2B_VIEW_NAME = "R2B - Retry Asset Selection";
const STUDIO_M1_STALE_RENDER_FORMULA = 'AND({Test_Run_ID}=BLANK(),{Render_Status}="Rendering",{Remotion_Job_ID}!="",{Remotion_Status_URL}!="",{Render_Server_URL}!="",{Final_File_URL}="")';
const STUDIO_C1_VIEW_ID = "viwT0B4SmJLL1qPlp";
const STUDIO_C2_VIEW_ID = "viwehZYNL17SAt7Pt";
const STUDIO_C2M_VIEW_ID = "viwPm4Pyk0BEzLvyE";
const STUDIO_C2M_TABLE_ID = "tblcnQDBvUngpjDED";
const PRODUCTION_CADENCE_HOLD_MS = 12 * 60 * 1000;
const PRODUCTION_CADENCE_THROTTLE_MS = 20000;
const PRODUCTION_CADENCE_PARKED = true;
const PRODUCTION_CADENCE_PARK_ASSERT_MS = 10 * 60 * 1000;
let productionCadenceLastSyncAt = 0;
let productionCadenceParkAssertedAt = 0;
let productionCadenceRenderHoldUntil = 0;
let productionCadencePublishHoldUntil = 0;

/*__STUDIO_WORKER_EXTRACT:cadenceScheduleSync__*/
/*__STUDIO_WORKER_EXTRACT:studioHealPromotedMissingFanout__*/
/*__STUDIO_WORKER_EXTRACT:continueParkedProductionAfterPromote__*/
/*__STUDIO_WORKER_EXTRACT:cadenceQueueHasWork__*/
/*__STUDIO_WORKER_EXTRACT:cadenceRepairInProgress__*/
/*__STUDIO_WORKER_EXTRACT:pulseStudioP3ForPlannedOutputs__*/
/*__STUDIO_WORKER_EXTRACT:cadenceHasRenderWork__*/
/*__STUDIO_WORKER_EXTRACT:studioFirstLinkedId__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputIsPhotoSequenceRoute__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputIsStoryRoute__*/
/*__STUDIO_WORKER_EXTRACT:studioClipLooksLikeVideo__*/
/*__STUDIO_WORKER_EXTRACT:studioPhotoSequenceNeedsContainHeal__*/
/*__STUDIO_WORKER_EXTRACT:studioContinuationApplyInspectAction__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputNeedsRemotionPackage__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputIsTerminalForContinuation__*/
/*__STUDIO_WORKER_EXTRACT:studioContinuationOpenReadyForReview__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputWrongVideoSelectorPath__*/
/*__STUDIO_WORKER_EXTRACT:studioContinuationClearRetryFields__*/
/*__STUDIO_WORKER_EXTRACT:resetEmptyP3RemotionHandoffForR2__*/
/*__STUDIO_WORKER_EXTRACT:studioContinuationLoadContext__*/
/*__STUDIO_WORKER_EXTRACT:studioContinuationStampPackage__*/
/*__STUDIO_WORKER_EXTRACT:studioContinuationInspectOutput__*/
/*__STUDIO_WORKER_EXTRACT:listStudioContinuationCandidates__*/
/*__STUDIO_WORKER_EXTRACT:pulseStudioContinuationJobs__*/
/*__STUDIO_WORKER_EXTRACT:studioContinuationMediaGate__*/
/*__STUDIO_WORKER_EXTRACT:pulseStudioP2ForWaitingParents__*/
/*__STUDIO_WORKER_EXTRACT:advanceStudioProductionOutputs__*/
/*__STUDIO_WORKER_EXTRACT:pulseOnDemandRenderChain__*/
/*__STUDIO_WORKER_EXTRACT:pulseOnDemandPublishChain__*/
/*__STUDIO_WORKER_EXTRACT:pulseOnDemandMediaChain__*/
/*__STUDIO_WORKER_EXTRACT:pulseOnDemandCarouselChain__*/
/*__STUDIO_WORKER_EXTRACT:pulseOnDemandR2B__*/
/*__STUDIO_WORKER_EXTRACT:pulseOnDemandM1__*/
/*__STUDIO_WORKER_EXTRACT:pulseOnDemandMakeAdminBridge__*/
/*__STUDIO_WORKER_EXTRACT:timingSafeSecretEqual__*/
/*__STUDIO_WORKER_EXTRACT:r5DoneCallbackSecret__*/
/*__STUDIO_WORKER_EXTRACT:handleR5DoneCallback__*/
/*__STUDIO_WORKER_EXTRACT:cadenceHasPublishWork__*/
/*__STUDIO_WORKER_EXTRACT:cadenceSetActive__*/
async function syncProductionCadence(env, { force = false, startRender = false, startPublish = false, startCarousel = false, skipRenderPulse = false } = {}) {
  const now = Date.now();
  if (!force && !startRender && !startPublish && !startCarousel && now - productionCadenceLastSyncAt < PRODUCTION_CADENCE_THROTTLE_MS) {
    return { skipped: "throttled" };
  }
  productionCadenceLastSyncAt = now;
  if (PRODUCTION_CADENCE_PARKED) {
    const pulses = [];
    if (!skipRenderPulse && (startRender || force)) {
      pulses.push(...await pulseOnDemandRenderChain(env, { waitMs: 0 }));
    }
    // Asserting the parked state costs at least one Make call per scenario, and on a two-minute
    // cron that burst was enough to exhaust the invocation's subrequest budget, after which every
    // remaining call failed instantly -- including the publish probes below, which is why the
    // publish orchestrators went unpulsed for a day. The target state here is a constant, so
    // re-assert it on a slow interval and let on-demand arming cover anything that drifts between.
    let results = [{ skipped: "park_assert_throttled" }];
    if (now - productionCadenceParkAssertedAt >= PRODUCTION_CADENCE_PARK_ASSERT_MS) {
      productionCadenceParkAssertedAt = now;
      const parked = [
        ...PRODUCTION_CADENCE_ALWAYS_ON,
        ...PRODUCTION_CADENCE_RENDER,
        ...PRODUCTION_CADENCE_PUBLISH,
        ...PRODUCTION_CADENCE_MEDIA,
        ...PRODUCTION_CADENCE_CAROUSEL.filter((item) => item.key !== "C2"),
        ...PRODUCTION_CADENCE_REPAIR,
      ];
      results = await Promise.all([
        ...parked.map((item) => cadenceSetActive(env, item.id, false)),
        ...PRODUCTION_CADENCE_WEBHOOK_LIVE.map((item) => cadenceSetActive(env, item.id, !cadenceScenarioManagedByPython(env, item.id))),
      ]);
    }
    if (startPublish || force) pulses.push(...await pulseOnDemandPublishChain(env));
    if (force) pulses.push(...await pulseOnDemandMediaChain(env));
    if (force) pulses.push(...await pulseOnDemandCarouselChain(env));
    if (startRender || force) pulses.push(...await pulseOnDemandR2B(env));
    if (force) pulses.push(...await pulseOnDemandMakeAdminBridge(env));
    return { ok: true, parked: true, results, pulses };
  }
  if (await cadenceRepairInProgress(env)) {
    return { skipped: "repair_lease" };
  }
  if (startRender) productionCadenceRenderHoldUntil = now + PRODUCTION_CADENCE_HOLD_MS;
  if (startPublish) productionCadencePublishHoldUntil = now + PRODUCTION_CADENCE_HOLD_MS;

  const [renderWork, publishWork] = await Promise.all([
    cadenceHasRenderWork(env),
    cadenceHasPublishWork(env),
  ]);
  const wantRender = startRender || renderWork || now < productionCadenceRenderHoldUntil;
  const wantPublish = startPublish || publishWork || now < productionCadencePublishHoldUntil;
  const actions = [
    ...PRODUCTION_CADENCE_ALWAYS_ON.map((item) => cadenceSetActive(env, item.id, true)),
    ...PRODUCTION_CADENCE_WEBHOOK_LIVE.map((item) => cadenceSetActive(env, item.id, !cadenceScenarioManagedByPython(env, item.id))),
    ...PRODUCTION_CADENCE_RENDER.map((item) => cadenceSetActive(env, item.id, wantRender && !cadenceScenarioManagedByPython(env, item.id))),
    ...PRODUCTION_CADENCE_PUBLISH.map((item) => cadenceSetActive(env, item.id, wantPublish && !cadenceScenarioManagedByPython(env, item.id))),
  ];
  const results = await Promise.all(actions);
  return {
    ok: true,
    render: wantRender,
    publish: wantPublish,
    render_work: renderWork,
    publish_work: publishWork,
    results,
  };
}

/*__STUDIO_WORKER_EXTRACT:phase6RunScenario__*/
/*__STUDIO_WORKER_EXTRACT:phase6StopExactScenarioExecution__*/
/*__STUDIO_WORKER_EXTRACT:phase6WaitForScenarioExecution__*/
/*__STUDIO_WORKER_EXTRACT:phase6WaitForVoicePrepCompletion__*/
/*__STUDIO_WORKER_EXTRACT:phase6ClearVoicePrepTokens__*/
/*__STUDIO_WORKER_EXTRACT:phase6AdvanceVoicePrepShort__*/
/*__STUDIO_WORKER_EXTRACT:phase6AutoVoicePrepForOutput__*/
/*__STUDIO_WORKER_EXTRACT:studioOutputReadyForPublishApproval__*/
/*__STUDIO_WORKER_EXTRACT:studioPipelineSettingsProfileRecord__*/
/*__STUDIO_WORKER_EXTRACT:studioLegacyDestinationPrefix__*/
/*__STUDIO_WORKER_EXTRACT:studioProfileDestinationFieldValue__*/
/*__STUDIO_WORKER_EXTRACT:studioActivePipelineSettings__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseMakeWebhook__*/
/*__STUDIO_WORKER_EXTRACT:studioFacebookPublicMakeWebhookUrl__*/
/*__STUDIO_WORKER_EXTRACT:studioFacebookPublicCdnUrl__*/
const STUDIO_FB_COVER_ATTACHED_MARK = "facebook-cover=attached";

/*__STUDIO_WORKER_EXTRACT:studioFacebookVideoId__*/
/*__STUDIO_WORKER_EXTRACT:studioFacebookVideoSurface__*/
/*__STUDIO_WORKER_EXTRACT:studioFacebookNativeCoverRequired__*/
/*__STUDIO_WORKER_EXTRACT:studioFacebookNativeCoverUrl__*/
/*__STUDIO_WORKER_EXTRACT:studioFacebookCoverAlreadyAttached__*/
/*__STUDIO_WORKER_EXTRACT:studioAttachFacebookNativeCover__*/
/*__STUDIO_WORKER_EXTRACT:studioFacebookPublicMakeRoutable__*/
/*__STUDIO_WORKER_EXTRACT:studioFacebookPublicMakeEligible__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFacebookPublicMake__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishDispatchTarget__*/
/*__STUDIO_WORKER_EXTRACT:studioGraphCaption__*/
/*__STUDIO_WORKER_EXTRACT:studioFetchImageBytes__*/
/*__STUDIO_WORKER_EXTRACT:studioPublicJpegIsReachable__*/
/*__STUDIO_WORKER_EXTRACT:studioImageContentType__*/
const R2_UPLOAD_WORKER_PUBLIC = "https://chicagoshining-r2-upload.joseph-t-logan.workers.dev";
const STUDIO_UPLOAD_WORKER_UA = "chicagoshining-studio-api/publish-dispatch";

/*__STUDIO_WORKER_EXTRACT:studioR2UploadWorkerConfig__*/
/*__STUDIO_WORKER_EXTRACT:studioR2UploadWorkerHeaders__*/
/*__STUDIO_WORKER_EXTRACT:studioPutPublicObjectViaUploadWorker__*/
/*__STUDIO_WORKER_EXTRACT:studioPutPublicObjectMultipartFromDrive__*/
/*__STUDIO_WORKER_EXTRACT:studioPublicVideoIsReachable__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsureFinishedVideoPublicPreview__*/
/*__STUDIO_WORKER_EXTRACT:studioPutPublicJpegViaUploadWorker__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsurePublicJpegForPublish__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishInstagramFeedPhoto__*/
const STUDIO_CHICAGO_PLACE_PAGE_IDS = {
  andersonville: "213085162",
  bridgeport: "215445468",
  bronzeville: "215445484",
  bucktown: "215445475",
  chicago: "212988662",
  chinatown: "212926558",
  "clark street": "240095110",
  edgewater: "215331155",
  "fulton market": "1022618899",
  "garfield park": "215331179",
  "gold coast": "215331191",
  "grant park": "213370358",
  "humboldt park": "215331208",
  "hyde park": "220153895",
  lakeview: "215331247",
  "lincoln park": "213116558",
  "lincoln square": "215331278",
  "logan square": "215331288",
  loop: "219126758",
  "the loop": "219126758",
  "magnificent mile": "213370385",
  "millennium park": "213370402",
  "museum campus": "1022620361",
  "navy pier": "215331224",
  "near north side": "1022620545",
  "old town": "215331371",
  pilsen: "214844790",
  "printers row": "1022619648",
  ravenswood: "215445547",
  "river north": "215445508",
  "rogers park": "215445556",
  "south loop": "215445599",
  streeterville: "215445616",
  "ukrainian village": "220153978",
  uptown: "220153990",
  "west loop": "215445650",
  "wicker park": "212926625",
};

/*__STUDIO_WORKER_EXTRACT:studioNormPlaceText__*/
/*__STUDIO_WORKER_EXTRACT:studioMarketName__*/
/*__STUDIO_WORKER_EXTRACT:studioMatchKnownPlace__*/
/*__STUDIO_WORKER_EXTRACT:studioLookupPlacePageId__*/
/*__STUDIO_WORKER_EXTRACT:studioResolvePublishLocation__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishInstagramFeedPhotoInner__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishFacebookPageStory__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp0PublicAsset__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp1IgReel__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp1Igs__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFbs1__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFbs2__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsureFacebookSlideshowAsset__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishFacebookReelNative__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFbs3__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFbs4__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseYtRecord__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsureYoutubePublish__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseTtd0__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseTtd1__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseTtd2__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseTtd3__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsureTiktokDraft__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFbRecord__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFb0__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFb1__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFb2__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFb2r__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseFb3__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsureFacebookPhotoPublish__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseApcRecord__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp0c__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp1c__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp2c__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp3c__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp3p__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp4c__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp4r__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp5c__*/
/*__STUDIO_WORKER_EXTRACT:studioEnsureInstagramCarouselPublish__*/
/*__STUDIO_WORKER_EXTRACT:studioTiktokComplete__*/
/*__STUDIO_WORKER_EXTRACT:studioPulseAp1IgsPoll__*/
// Approve pulses these publisher webhooks directly, and a Make webhook aimed at a stopped
// scenario answers 200 and goes nowhere. Background cadence is supposed to keep the webhook
// scenarios live and run the on-demand orchestrators, but it parks aggressively and cannot be
// relied on at the moment a human clicks Approve, which strands the output mid-handoff with a
// status like "Ready for Assets" and no publisher listening. Approval arms its own chain.
const STUDIO_PUBLISH_DISPATCH_SCENARIOS = Object.freeze({
  "AP0": { webhooks: [5612096] },
  "AP0C": { webhooks: STUDIO_AP0C_CHAIN_WEBHOOKS.map((item) => item.id) },
  "FB0": { webhooks: STUDIO_FB0_CHAIN_WEBHOOKS.map((item) => item.id) },
  "AP1-IGS": { webhooks: [5612664, 5845193], orchestrator: STUDIO_IG_ORCH_SCENARIO_ID },
  "AP1-IG": { webhooks: [5862882], orchestrator: STUDIO_IG_ORCH_SCENARIO_ID },
  "FBS3": { webhooks: [STUDIO_FBS3_SCENARIO_ID, STUDIO_FBS4_SCENARIO_ID], orchestrator: 5813561 },
  "YT0": { webhooks: [STUDIO_YT0_SCENARIO_ID, STUDIO_YTP1_SCENARIO_ID, STUDIO_YTS1_SCENARIO_ID, STUDIO_YTS2_SCENARIO_ID, STUDIO_YTS3_SCENARIO_ID] },
  "TTD0": { webhooks: [STUDIO_TTD0_SCENARIO_ID, STUDIO_TTD1_SCENARIO_ID, STUDIO_TTD2_SCENARIO_ID, STUDIO_TTD3_SCENARIO_ID, STUDIO_TTD4_SCENARIO_ID], orchestrator: STUDIO_TTD_ORCH_SCENARIO_ID },
});

/*__STUDIO_WORKER_EXTRACT:studioArmPublishScenarios__*/
// The webhook scenario only stages the platform payload; an on-demand orchestrator carries the
// record the rest of the way, so approval has to run it too or the output stops at the staging step.
const STUDIO_PUBLISH_ORCH_PYTHON = Object.freeze({
  [STUDIO_TTD_ORCH_SCENARIO_ID]: Object.freeze({ stage: "publish_tt", flag: "TTD_ORCH" }),
  [STUDIO_YT_ORCH_SCENARIO_ID]: Object.freeze({ stage: "publish_yt", flag: "YT_ORCH" }),
  [STUDIO_FB_ORCH_SCENARIO_ID]: Object.freeze({ stage: "publish_fb", flag: "FB_ORCH" }),
  [STUDIO_AP_CAR_ORCH_SCENARIO_ID]: Object.freeze({ stage: "publish_ig", flag: "APCAR_ORCH" }),
  [STUDIO_IG_ORCH_SCENARIO_ID]: Object.freeze({ stage: "publish_igrs", flag: "IG_ORCH" }),
});

/*__STUDIO_WORKER_EXTRACT:studioRunPublishOrchestrator__*/
// Only SAI1 or an explicitly locked user caption may author publishable copy. This
// gate can copy the parent's caption and remove leaked asset inventory, but it must
// never invent a caption from an output title or another production field.
/*__STUDIO_WORKER_EXTRACT:studioEnsureOutputCaption__*/
// The webhook POST is the only step that actually hands an output to a publisher. Everything
// after it is recoverable on a later pass, so it is split off: this half runs on the request
// path where it cannot be dropped by a cancelled background task or an exhausted invocation.
/*__STUDIO_WORKER_EXTRACT:studioDispatchApprovedPublishNow__*/
/*__STUDIO_WORKER_EXTRACT:studioDispatchApprovedPublishTail__*/
/*__STUDIO_WORKER_EXTRACT:studioPublishDispatchNote__*/
// Without a receipt every dispatch failure is invisible: the output looks approved, no publisher
// ran, and nothing on the record says an attempt was ever made. The stamp is also the retry clock
// the reconcile sweep reads, so it has to be written on success and failure alike.
/*__STUDIO_WORKER_EXTRACT:studioStampPublishDispatch__*/
/*__STUDIO_WORKER_EXTRACT:studioDispatchApprovedPublishAndSchedule__*/
// Redispatching an output whose publisher already started can post it to the platform twice, so
 // most platform statuses are matched against an allowlist of states that mean "no publisher has
 // begun". Instagram carousels are the exception: EnsureInstagramCarouselPublish is stage-gated and
 // safe to re-enter through Parent Ready / Publishing, and parked cadence does not run APCAR orch
 // unless force/startPublish — so due Parent Ready rows must be eligible on this first sweep or
 // they sit past schedule until a later pass still has subrequest budget (304 sat ~3h).
const STUDIO_PUBLISH_RECONCILE_FORMULA = 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{Auto_Publish_Enabled}=1,{Published_At}=BLANK(),'
  + '{Output_Status}="Approved for Publishing",'
  + 'OR({Publish_Status}=BLANK(),{Publish_Status}="Not Ready",{Publish_Status}="Ready",{Publish_Status}="Ready to Schedule",{Publish_Status}="Ready to Publish"),'
  + 'OR({IG_Story_Status}=BLANK(),{IG_Story_Status}="Not Needed",{IG_Story_Status}="Ready"),'
  + 'OR({IG_Carousel_Status}=BLANK(),{IG_Carousel_Status}="Not Selected",{IG_Carousel_Status}="Ready for Asset Prep",{IG_Carousel_Status}="Assets Ready",{IG_Carousel_Status}="Children Processing",{IG_Carousel_Status}="Children Ready",{IG_Carousel_Status}="Parent Processing",{IG_Carousel_Status}="Parent Ready",{IG_Carousel_Status}="Publishing"),'
  + 'OR({TikTok_Draft_Status}=BLANK(),{TikTok_Draft_Status}="Not Selected",{TikTok_Draft_Status}="Ready for Assets",{TikTok_Draft_Status}="Waiting for Schedule"),'
  + 'OR({FB_Slideshow_Status}=BLANK(),{FB_Slideshow_Status}="Not Required",{FB_Slideshow_Status}="Ready to Render"),'
  + 'OR({FB_Publish_Status}=BLANK(),{FB_Publish_Status}="Ready for Assets"),'
  + `${STUDIO_PUBLISH_RECONCILE_SCHEDULE_FORMULA},`
  + 'OR({Studio_Publish_Dispatch_Count}=BLANK(),{Studio_Publish_Dispatch_Count}<8),'
  + 'OR({Studio_Publish_Dispatch_At}=BLANK(),DATETIME_DIFF(NOW(),{Studio_Publish_Dispatch_At},"minutes")>=6))';

/*__STUDIO_WORKER_EXTRACT:studioResetYoutubeUploadForRetry__*/
/*__STUDIO_WORKER_EXTRACT:studioHealFailedYoutubeSourceDownloads__*/
/*__STUDIO_WORKER_EXTRACT:studioParkStaleYoutubeQuotaPolls__*/
/*__STUDIO_WORKER_EXTRACT:healStaleManualFlagsOnPublishedRecord__*/
/*__STUDIO_WORKER_EXTRACT:healYoutubeManualWithLiveVideoRecord__*/
/*__STUDIO_WORKER_EXTRACT:studioCloseYoutubeManualWithLiveVideo__*/
/*__STUDIO_WORKER_EXTRACT:studioRearmDueYoutubeManualPublishes__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcileYoutubePublishes__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcileTiktokDrafts__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcileFacebookPhotos__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcileInstagramCarousels__*/
// Scheduled posts are a hard deadline. This rescue deliberately ignores the normal
// publisher-stage allowlist and looks only for already-approved rows whose scheduled time
// has passed. That catches downstream-but-not-started states such as Facebook Reel
// "Video Ready", plus stale TikTok TTD0 "Preparing Assets" locks.
const STUDIO_OVERDUE_SCHEDULED_FORMULA = 'AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,{Auto_Publish_Enabled}=1,{Published_At}=BLANK(),'
  + '{Output_Status}="Approved for Publishing",{Review_Status}="Approved",{Publish_Status}="Ready to Schedule",'
  + '{Scheduled_Post_Date}!="",IS_BEFORE({Scheduled_Post_Date},NOW()))';

/*__STUDIO_WORKER_EXTRACT:studioPublishLockIsStale__*/
/*__STUDIO_WORKER_EXTRACT:studioHealOverdueTikTokPrep__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcileOverdueScheduledPublishes__*/
// Approval is one click, and it has to survive a publisher scenario that drifted off, a Make API
// hiccup, and a Worker invocation that ran out of budget before reaching the webhook. Nothing else
// guarantees an approved output reaches a publisher, so this sweep runs first on every cron tick.
/*__STUDIO_WORKER_EXTRACT:studioHealApprovedMissingSchedule__*/
// Approved Stories that already carry today's next MAE instant (11:30 / 5:30 /
// 16:30) still publish at that instant. Once the same-content main has a later
// time, move the Story to main + 10 minutes before reconcile sends it.
/*__STUDIO_WORKER_EXTRACT:studioHealStoryCompanionDrift__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcileApprovedPublishes__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcileFacebookPublicMake__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcileFacebookVideoCovers__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcilePublishingInstagramStories__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcilePublishingInstagramReels__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcileFacebookSlideshows__*/
/*__STUDIO_WORKER_EXTRACT:studioReconcileFacebookReels__*/
/*__STUDIO_WORKER_EXTRACT:approveOutputRecordForPublishing__*/
/*__STUDIO_WORKER_EXTRACT:mapApprovedOutputSummary__*/
/*__STUDIO_WORKER_EXTRACT:studioLoadApproveAllJobStore__*/
/*__STUDIO_WORKER_EXTRACT:studioSaveApproveAllJobStore__*/
/*__STUDIO_WORKER_EXTRACT:studioGetApproveAllJob__*/
/*__STUDIO_WORKER_EXTRACT:studioPutApproveAllJob__*/
/*__STUDIO_WORKER_EXTRACT:mapApproveAllEligibleSummary__*/
/*__STUDIO_WORKER_EXTRACT:studioLoadScheduleRegenJobStore__*/
/*__STUDIO_WORKER_EXTRACT:studioPutScheduleRegenJobStore__*/
/*__STUDIO_WORKER_EXTRACT:studioGetScheduleRegenJob__*/
/*__STUDIO_WORKER_EXTRACT:studioPutScheduleRegenJob__*/
/*__STUDIO_WORKER_EXTRACT:studioNormalizeRegenFilters__*/
/*__STUDIO_WORKER_EXTRACT:studioProcessScheduleRegenJobSlice__*/
/*__STUDIO_WORKER_EXTRACT:startScheduleRegenJob__*/
/*__STUDIO_WORKER_EXTRACT:getScheduleRegenJobStatus__*/
/*__STUDIO_WORKER_EXTRACT:getStudioScheduleSettings__*/
/*__STUDIO_WORKER_EXTRACT:putStudioScheduleSettings__*/
/*__STUDIO_WORKER_EXTRACT:getApproveAllJobStatus__*/
/*__STUDIO_WORKER_EXTRACT:studioFetchApproveAllRecordsByIds__*/
/*__STUDIO_WORKER_EXTRACT:studioProcessApproveAllJobSlice__*/
/*__STUDIO_WORKER_EXTRACT:studioRunApproveAllJob__*/
/*__STUDIO_WORKER_EXTRACT:studioResumeApproveAllJobs__*/
/*__STUDIO_WORKER_EXTRACT:approveAllOutputsForPublishing__*/
/*__STUDIO_WORKER_EXTRACT:reviewOutputCreative__*/
/*__STUDIO_WORKER_EXTRACT:getRecordRoute__*/
/*__STUDIO_WORKER_EXTRACT:getOutputRoute__*/
/*__STUDIO_WORKER_EXTRACT:studioOverviewScheduledCounts__*/
/*__STUDIO_WORKER_EXTRACT:studioOverviewOperationalMetrics__*/
// Last-good counts. Home reads the snapshot and does not scan Airtable on open.
// Isolate memory is only a hot copy; R2 keeps it across cold Workers.
const STUDIO_PROFILES_OVERVIEW_CACHE_MS = 3 * 60 * 1000;
const STUDIO_PROFILES_OVERVIEW_SNAPSHOT_KEY = "studio/state/profiles-overview.json";
/** Hard wall for overview Airtable work so home never waits on a 60s browser abort. */
const STUDIO_PROFILES_OVERVIEW_BUILD_BUDGET_MS = 4000;
const STUDIO_PROFILES_OVERVIEW_RESOLVE_BUDGET_MS = 2500;
const STUDIO_PROFILES_OVERVIEW_OUTPUT_LIMIT = 800;
const STUDIO_PROFILES_OVERVIEW_IDEA_LIMIT = 300;
const studioProfilesOverviewCache = { at: 0, authKey: "", rows: null, inflight: null };

/*__STUDIO_WORKER_EXTRACT:studioOverviewBudgetError__*/
/*__STUDIO_WORKER_EXTRACT:raceStudioOverviewBudget__*/
/*__STUDIO_WORKER_EXTRACT:studioProfilesOverviewAuthKey__*/
/*__STUDIO_WORKER_EXTRACT:studioProfilesOverviewCombinedFormula__*/
/*__STUDIO_WORKER_EXTRACT:studioOverviewRowMatchesProfile__*/
/*__STUDIO_WORKER_EXTRACT:buildStudioProfilesOverviewRows__*/
/*__STUDIO_WORKER_EXTRACT:isAirtableCoolingError__*/
/*__STUDIO_WORKER_EXTRACT:respondProfilesOverviewSoft__*/
/*__STUDIO_WORKER_EXTRACT:rememberProfilesOverviewSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:readStudioProfilesOverviewSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:writeStudioProfilesOverviewSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:refreshStudioProfilesOverviewSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:scheduleStudioProfilesOverviewRefresh__*/
/** One Worker request for All Profiles home table — no N× /api/dashboard fan-out. */
/*__STUDIO_WORKER_EXTRACT:profilesOverview__*/
/*__STUDIO_WORKER_EXTRACT:dashboard__*/
/*__STUDIO_WORKER_EXTRACT:respondHtml__*/
/*__STUDIO_WORKER_EXTRACT:listPipelineSettingsForAdmin__*/
/*__STUDIO_WORKER_EXTRACT:pipelineSettingValue__*/
const REPAIR_LEASE_NOTE_PREFIX = "REPAIR_LEASE_V1";
const REPAIR_LEASE_TABLE_ID = "tbltuSt9UibYzxpah";
const REPAIR_CONTROL_SCENARIOS = new Set([
  5893243, // MAKE-ADMIN-BRIDGE
  5813561, // FB-ORCH
  STUDIO_IG_ORCH_SCENARIO_ID, // IG-PUB-ORCH
  5556716, // R4 renderer handoff
  5528742, // P1 content package scheduled root (Test Mode exact selector pulse only)
  5569495, // R2 exact Test Mode selector pulse only
  5557966, // R3 exact Test Mode selector pulse only
  5565333, // R5 exact Test Mode selector pulse only
  5576363, // RR1 exact Test Mode selector pulse only
  STUDIO_AP0_SCENARIO_ID, // AP0 public asset preparation
]);
const REPAIR_LEASE_MAX_MS = 30 * 60 * 1000;
const REPAIR_LEASE_MIN_MS = 60 * 1000;

/*__STUDIO_WORKER_EXTRACT:repairJson__*/
/*__STUDIO_WORKER_EXTRACT:repairIsoMs__*/
/*__STUDIO_WORKER_EXTRACT:repairString__*/
/*__STUDIO_WORKER_EXTRACT:repairRecordIds__*/
/*__STUDIO_WORKER_EXTRACT:repairLeaseState__*/
/*__STUDIO_WORKER_EXTRACT:repairLeaseRecords__*/
/*__STUDIO_WORKER_EXTRACT:repairClearR4LeaseToken__*/
/*__STUDIO_WORKER_EXTRACT:repairCloseLease__*/
/*__STUDIO_WORKER_EXTRACT:repairVerifyOutputRecord__*/
/*__STUDIO_WORKER_EXTRACT:repairSweepExpiredLeases__*/
/*__STUDIO_WORKER_EXTRACT:repairVerifyContentItemRecord__*/
/*__STUDIO_WORKER_EXTRACT:repairAcquireLease__*/
/*__STUDIO_WORKER_EXTRACT:repairFindLease__*/
/*__STUDIO_WORKER_EXTRACT:repairReserveBudget__*/
/*__STUDIO_WORKER_EXTRACT:repairScenarioModuleById__*/
/*__STUDIO_WORKER_EXTRACT:repairScenarioModuleIds__*/
/*__STUDIO_WORKER_EXTRACT:repairReadMakeBlueprint__*/
/*__STUDIO_WORKER_EXTRACT:repairP1Eligibility__*/
/*__STUDIO_WORKER_EXTRACT:repairWaitForP1Package__*/
/*__STUDIO_WORKER_EXTRACT:repairPulseP1TestSelector__*/
/*__STUDIO_WORKER_EXTRACT:repairItem7CanonicalMaxRecords__*/
// ITEM7_EXACT_STAGE_TEST_MODE_V1_BEGIN
const ITEM7_EXACT_STAGE_CONFIG = Object.freeze({
  5569495: Object.freeze({ stage: "R2", max_cycles: 1, wait_ms_per_cycle: 90000 }),
  5557966: Object.freeze({ stage: "R3", max_cycles: 1, wait_ms_per_cycle: 90000 }),
  5565333: Object.freeze({ stage: "R5", max_cycles: 5, wait_ms_per_cycle: 18000 }),
  5576363: Object.freeze({ stage: "RR1", max_cycles: 1, wait_ms_per_cycle: 90000 }),
});

/*__STUDIO_WORKER_EXTRACT:repairItem7StageCheckpoint__*/
/*__STUDIO_WORKER_EXTRACT:repairReadItem7Output__*/
/*__STUDIO_WORKER_EXTRACT:repairWaitItem7Checkpoint__*/
/*__STUDIO_WORKER_EXTRACT:repairPulseItem7ExactStage__*/
// ITEM7_FRESH_INVOCATION_CLEANUP_V5: cleanup is intentionally a separate request so
// a long stage pulse cannot consume the subrequest capacity needed to stop, restore,
// verify, and terminalize its own exact lease.
/*__STUDIO_WORKER_EXTRACT:repairCleanupItem7ExactStage__*/
// ITEM7_EXACT_STAGE_TEST_MODE_V1_END

// ITEM6_REPLACE_TRANSACTION_V1_BEGIN
const ITEM6_REPLACE_ACTIVE_STATES = new Set(["Prepared", "Publishing", "Verified", "Cleanup Pending", "Manual Cleanup Required"]);
const ITEM6_REPLACE_COMMON_FIELDS = Object.freeze([
  "Publish_Status", "Published_At", "Platform_Post_URL", "Publish_Error_Message",
  "Publish_Attempt_Count", "Last_Publish_Attempt_At", "Publish_Locked_At", "Publish_Locked_By",
  "Publish_Started_At", "Platform_Post_ID", "Platform_Media_ID", "Platform_Publish_Response_JSON",
  "Platform_Publish_Status_URL", "Publish_Retry_Eligible", "Publish_Next_Retry_At", "Manual_Fallback_Required"
]);
const ITEM6_REPLACE_PLATFORM_FIELDS = Object.freeze({
  Instagram: Object.freeze([
    "IG_Story_Status", "IG_Story_Published_At", "IG_Story_Post_ID", "IG_Story_Container_ID",
    "IG_Story_Error_Message", "IG_Story_Attempt_Count", "IG_Story_Last_Attempt_At", "IG_Story_Locked_At",
    "IG_Story_Locked_By", "IG_Story_Response_JSON", "IG_Carousel_Status", "IG_Carousel_Child_Count",
    "IG_Carousel_Children_Ready_Count", "IG_Carousel_Children_JSON", "IG_Carousel_Parent_Container_ID",
    "IG_Carousel_Parent_Status", "IG_Carousel_Parent_Created_At", "IG_Carousel_Parent_Last_Checked_At",
    "IG_Carousel_Published_Media_ID", "IG_Carousel_Published_At", "IG_Carousel_Error_Stage",
    "IG_Carousel_Error_Message", "IG_Carousel_Retry_Count", "IG_Carousel_Next_Retry_At",
    "IG_Carousel_Last_Completed_Stage", "IG_Carousel_Parent_Poll_Attempt_Count", "IG_Carousel_Parent_Response_JSON",
    "IG_Carousel_Publish_Attempt_Count", "IG_Carousel_Publish_Response_JSON", "IG_Carousel_Reconcile_Attempt_Count",
    "IG_Carousel_Reconcile_Response_JSON", "IG_Carousel_Finalize_Attempt_Count", "IG_Carousel_Finalize_Response_JSON"
  ]),
  Facebook: Object.freeze([
    "FB_Photo_IDs_JSON", "FB_Photo_Count", "FB_Last_Checked_At", "FB_Publish_Status", "FB_Post_Fingerprint",
    "FB_Reconcile_Attempt_Count", "FB_Reconcile_Response_JSON", "FB_Slideshow_Status", "FB_Slideshow_Render_Job_ID",
    "FB_Slideshow_Render_Status_URL", "FB_Slideshow_Render_URL", "FB_Slideshow_Public_URL", "FB_Slideshow_Drive_File_ID",
    "FB_Slideshow_Drive_File_Name", "FB_Slideshow_Meta_Video_ID", "FB_Slideshow_Meta_Upload_URL",
    "FB_Slideshow_Response_JSON", "FB_Slideshow_Attempt_Count", "FB_Slideshow_Last_Checked_At", "FB_Slideshow_Error_Message"
  ]),
  TikTok: Object.freeze([
    "TikTok_Private_Posted_At", "TikTok_Privacy_Status", "Recommended_Publication_At", "TikTok_Public_Confirmation_At",
    "TikTok_Review_Token", "TikTok_Review_URL", "TikTok_Review_Status", "TikTok_Review_Expires_At", "TikTok_Review_Submitted_At",
    "Manual_Completion_Status", "Manual_Completion_At", "Manual_Published_URL", "TikTok_Draft_Status", "TikTok_Draft_Publish_ID",
    "TikTok_Draft_Delivered_At", "TikTok_Draft_Last_Checked_At", "TikTok_Draft_Email_Sent_At", "TikTok_Manual_Posted_At",
    "TikTok_Draft_Poll_Attempt_Count", "TikTok_Draft_Response_JSON", "TikTok_Draft_Public_Post_IDs_JSON",
    "TikTok_Manual_Completion_Token", "TikTok_Manual_Completion_URL"
  ]),
  YouTube: Object.freeze([
    "YouTube_Package_Status", "YouTube_Package_Email_Sent_At", "YouTube_Video_ID", "YouTube_Upload_Status",
    "YouTube_Processing_Status", "YouTube_Last_Checked_At", "YouTube_Stage", "YouTube_Upload_Job_ID",
    "YouTube_Upload_Started_At", "YouTube_Upload_Completed_At", "YouTube_Upload_Progress_Percent",
    "YouTube_Processing_Progress_Percent", "YouTube_Thumbnail_Status", "YouTube_Processing_Failure_Reason",
    "YouTube_Rejection_Reason", "YouTube_Error_Message", "YouTube_Response_JSON", "YouTube_Idempotency_Key", "YouTube_Published_At"
  ])
});

/*__STUDIO_WORKER_EXTRACT:item6Choice__*/
/*__STUDIO_WORKER_EXTRACT:item6Platform__*/
/*__STUDIO_WORKER_EXTRACT:item6SnapshotFieldNames__*/
/*__STUDIO_WORKER_EXTRACT:item6PublicationSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:item6ParseSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:item6Identity__*/
/*__STUDIO_WORKER_EXTRACT:item6IdentityFromSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:item6SafeJson__*/
/*__STUDIO_WORKER_EXTRACT:item6LoadAllowedOutput__*/
/*__STUDIO_WORKER_EXTRACT:item6PatchOutput__*/
/*__STUDIO_WORKER_EXTRACT:item6PrepareResetPatch__*/
/*__STUDIO_WORKER_EXTRACT:item6ObsoleteInventory__*/
/*__STUDIO_WORKER_EXTRACT:item6ReplaceControlAction__*/
// ITEM6_REPLACE_TRANSACTION_V1_END

// ITEM7_STANDALONE_SELECTOR_RECOVERY_V6: safety-only recovery for an exact selector
// stranded by a failed Item 7 pulse. This path intentionally does not load or consume
// a lease and can never activate/run a Make scenario.
/*__STUDIO_WORKER_EXTRACT:repairRecoverItem7ExactSelector__*/
/*__STUDIO_WORKER_EXTRACT:repairControlAction__*/
/*__STUDIO_WORKER_EXTRACT:repairSha256Hex__*/
/*__STUDIO_WORKER_EXTRACT:repairMakeAdminFindModule19__*/
/*__STUDIO_WORKER_EXTRACT:repairMakeAdminModule19__*/
/*__STUDIO_WORKER_EXTRACT:repairInspectorClone__*/
/*__STUDIO_WORKER_EXTRACT:repairProbeModuleIndex__*/
/*__STUDIO_WORKER_EXTRACT:repairProbeMakeStartScenarioSchema__*/
/*__STUDIO_WORKER_EXTRACT:repairListMakeScenariosCompact__*/
/*__STUDIO_WORKER_EXTRACT:repairInspectMakeScenarioModules__*/
/*__STUDIO_WORKER_EXTRACT:repairR4FindModule__*/
/*__STUDIO_WORKER_EXTRACT:repairR4ModuleMap__*/
/*__STUDIO_WORKER_EXTRACT:repairR4TokenSelector__*/
/*__STUDIO_WORKER_EXTRACT:repairR4ExactOutputEntry__*/
/*__STUDIO_WORKER_EXTRACT:repairInspectMakeBlueprintHistory__*/
/*__STUDIO_WORKER_EXTRACT:repairInspectMakeExecution__*/
/*__STUDIO_WORKER_EXTRACT:adminRepairControlStatus__*/
/*__STUDIO_WORKER_EXTRACT:adminRepairControl__*/
/*__STUDIO_WORKER_EXTRACT:adminMakeDeployPage__*/
/*__STUDIO_WORKER_EXTRACT:escapeHtml__*/
/*__STUDIO_WORKER_EXTRACT:adminMakeDeploy__*/
// STUDIO_MANUAL_IDEA_GENERATOR_V1
// Manual/on-demand Idea generation reuses canonical I1, but temporarily scopes
// Module 2 to exactly one Content Profile while I1 is inactive. The original
// blueprint and OFF state are restored after admission so scheduled operation
// remains unchanged and unrelated profiles cannot be consumed by a manual run.
const STUDIO_IDEA_I1_SCENARIO_ID = 5514334;
const STUDIO_A1S_SCENARIO_ID = 5715530;
const STUDIO_A1M_SCENARIO_ID = 5764543;
const STUDIO_A2_SCENARIO_ID = 5531974;
const STUDIO_A2B_SCENARIO_ID = 5568863;
const STUDIO_A3_SCENARIO_ID = 5569035;
const STUDIO_A4_SCENARIO_ID = 5578180;
const STUDIO_A2_WEBHOOK_URL = ""; // Make.com retired
const STUDIO_A3_CLASSIFY_VIEW_ID = "viwf6dxUJrMx2yNoe";
const STUDIO_A2_EMPTY_MAX_OPERATIONS = 4;
const STUDIO_PIPELINE_SETTINGS_TABLE_ID = "tblpHPWeEkyJaF7ql";
const STUDIO_PUB1_VIEW_ID = "viwtrn8YmGacQWVzU";
const STUDIO_PUB2_VIEW_ID = "viwf0hxXl8oYUClim";
const STUDIO_PUB3_VIEW_ID = "viwz6CxyEBzvMEJU6";
const STUDIO_A1S_OVERSIZE_BYTES = 100000000;
const STUDIO_I1_LAST_DAILY_SETTING = "STUDIO_I1_LAST_DAILY_DATE";
const STUDIO_AUTONOMOUS_LAST_SETTING = "STUDIO_AUTONOMOUS_LAST_RUN";
const STUDIO_IDEA_PROFILE_TABLE_ID = "tblNYg2QB0BmmVACy";
const STUDIO_IDEA_BATCH_TABLE_ID = "tblpCKSqcTpDtyst3";
const STUDIO_IDEA_MIN_COUNT = 1;
const STUDIO_IDEA_MAX_COUNT = 10;
const STUDIO_IDEA_ALLOWED_QUALITIES = new Set(["Highest Quality", "Balanced", "Quantity"]);

/*__STUDIO_WORKER_EXTRACT:studioIdeaBatchRecordIdFromPath__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaBatchView__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaManualBatchStillRunning__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaEnabledProfile__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaCreateBatch__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaUpdateBatch__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaSetProfileOverrides__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaClearProfileOverrides__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaUnwrapBlueprint__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaReadI1Blueprint__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaWriteI1Blueprint__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaInstallExactProfileSelector__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaExecuteBatch__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaStartPhotoListening__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaRunPythonBatch__*/
/*__STUDIO_WORKER_EXTRACT:startStudioIdeaGeneration__*/
/*__STUDIO_WORKER_EXTRACT:studioIdeaGenerationStatus__*/
// STUDIO_MANUAL_IDEA_GENERATOR_V1_END

/*__STUDIO_WORKER_EXTRACT:chicagoNowParts__*/
/*__STUDIO_WORKER_EXTRACT:mapOperationsOutput__*/
/*__STUDIO_WORKER_EXTRACT:linkedRecordIds__*/
/*__STUDIO_WORKER_EXTRACT:mapOperationsProfile__*/
/*__STUDIO_WORKER_EXTRACT:studioSettingsByName__*/
/*__STUDIO_WORKER_EXTRACT:studioUpsertSetting__*/
/*__STUDIO_WORKER_EXTRACT:probeDeskHealthTarget__*/
/*__STUDIO_WORKER_EXTRACT:deskContentRecIdsFromRecords__*/
/*__STUDIO_WORKER_EXTRACT:loadDeskContentById__*/
/*__STUDIO_WORKER_EXTRACT:deskRequestWorkIdentity__*/
/*__STUDIO_WORKER_EXTRACT:deskEventRecordId__*/
const DESK_OUTPUT_IDENTITY_KINDS = new Set([
  "publish_failed_transient",
  "tiktok_auth_signature",
  "publish_never_dispatch",
  "render_failed",
  "drive_music_404",
  "render_unfetchable_source",
  "render_ready_no_job",
  "render_ready_waiting_voiceover",
  "render_stale_rendering",
  "phantom_rerender",
  "render_long",
  "produce_orphan",
  "rfr_locked_missing_deliverable",
  "native_cover_missing",
  "youtube_private_source_fail",
  "youtube_cover_quota",
]);

/*__STUDIO_WORKER_EXTRACT:enrichDeskActivityIdentity__*/
/*__STUDIO_WORKER_EXTRACT:mapDeskInventoryOutput__*/
/*__STUDIO_WORKER_EXTRACT:deskOutputsForRequest__*/
/*__STUDIO_WORKER_EXTRACT:gatherStudioDeskInventory__*/
/*__STUDIO_WORKER_EXTRACT:getStudioDeskInventory__*/
/*__STUDIO_WORKER_EXTRACT:isStudioTestActivityEvent__*/
/*__STUDIO_WORKER_EXTRACT:sortStudioActivityEvents__*/
/*__STUDIO_WORKER_EXTRACT:fetchTaskActivityEvents__*/
/*__STUDIO_WORKER_EXTRACT:getStudioDeskActivity__*/
/*__STUDIO_WORKER_EXTRACT:studioAiApiRunnerStatus__*/
let studioAiApiPreferenceCache = { preferred: "OpenAI", failoverEnabled: true, at: 0 };

/*__STUDIO_WORKER_EXTRACT:getStudioAiApiStatus__*/
/*__STUDIO_WORKER_EXTRACT:patchStudioAiApiPreference__*/
/*__STUDIO_WORKER_EXTRACT:patchStudioDeskMode__*/
/*__STUDIO_WORKER_EXTRACT:patchLibraryCrossScope__*/
/*__STUDIO_WORKER_EXTRACT:parseA1JobValue__*/
/*__STUDIO_WORKER_EXTRACT:compressionPhaseLabel__*/
/*__STUDIO_WORKER_EXTRACT:compressionPhaseTone__*/
/*__STUDIO_WORKER_EXTRACT:parseProgressPercent__*/
/*__STUDIO_WORKER_EXTRACT:mapA1CompressionJob__*/
/*__STUDIO_WORKER_EXTRACT:enrichCompressionJobsLive__*/
/*__STUDIO_WORKER_EXTRACT:listActiveA1CompressionJobs__*/
/*__STUDIO_WORKER_EXTRACT:getStudioCompressionStatus__*/
/*__STUDIO_WORKER_EXTRACT:mapOversizedIntakeDriveFile__*/
/*__STUDIO_WORKER_EXTRACT:listOversizedIntakeVideos__*/
/*__STUDIO_WORKER_EXTRACT:listOversizedMediaFromAirtable__*/
/*__STUDIO_WORKER_EXTRACT:listOversizedMedia__*/
/*__STUDIO_WORKER_EXTRACT:firstOpsLinkedId__*/
/*__STUDIO_WORKER_EXTRACT:mapOpsQueueProfileName__*/
/*__STUDIO_WORKER_EXTRACT:getStudioOperationsQueue__*/
/*__STUDIO_WORKER_EXTRACT:getFactoryDesk__*/
/*__STUDIO_WORKER_EXTRACT:factoryDeskRefreshPayload__*/
/*__STUDIO_WORKER_EXTRACT:factoryApproveOutput__*/
// Factory revision feedback stays human-readable in Production_Notes and
// machine-parsable for a future opt-in revision agent. It is never executed here.
/*__STUDIO_WORKER_EXTRACT:factoryFeedbackBlock__*/
/*__STUDIO_WORKER_EXTRACT:factoryAppendFeedback__*/
/*__STUDIO_WORKER_EXTRACT:factoryLatestReviewFeedback__*/
/*__STUDIO_WORKER_EXTRACT:factorySendBackOutput__*/
/*__STUDIO_WORKER_EXTRACT:factorySendBackContent__*/
/*__STUDIO_WORKER_EXTRACT:factoryDeleteDeskItem__*/
/*__STUDIO_WORKER_EXTRACT:mutateFactoryDesk__*/
/*__STUDIO_WORKER_EXTRACT:pauseStudioOperationsQueueItem__*/
/*__STUDIO_WORKER_EXTRACT:reorderStudioOperationsRenderQueue__*/
/*__STUDIO_WORKER_EXTRACT:stampPrepareToReviewNotes__*/
/*__STUDIO_WORKER_EXTRACT:prepareIdeaToReview__*/
/*__STUDIO_WORKER_EXTRACT:getStudioOperations__*/
/** Lean Profiles tab payload — Content Profiles only (voice/music settings). */
/*__STUDIO_WORKER_EXTRACT:getStudioOperationsProfiles__*/
/*__STUDIO_WORKER_EXTRACT:patchStudioOperationsProfile__*/
/*__STUDIO_WORKER_EXTRACT:studioInternalJsonRequest__*/
/*__STUDIO_WORKER_EXTRACT:studioSaveAutonomousLastRun__*/
/*__STUDIO_WORKER_EXTRACT:studioLoadAutonomousLastRun__*/
/**
 * All-Profiles Scheduled totals (parenthesis) + awaiting-approval for refill.
 * Prefer the overview snapshot so hourly autonomous does not add a full scan.
 */
/*__STUDIO_WORKER_EXTRACT:studioLoadAutonomousRefillScores__*/
/*__STUDIO_WORKER_EXTRACT:harvestAutonomousNewsHeadlines__*/
/*__STUDIO_WORKER_EXTRACT:harvestAutonomousYoutube__*/
/*__STUDIO_WORKER_EXTRACT:harvestAutonomousLibraryCatalog__*/
/*__STUDIO_WORKER_EXTRACT:harvestAutonomousRecentTitles__*/
/*__STUDIO_WORKER_EXTRACT:harvestAutonomousOccupiedTopics__*/
/*__STUDIO_WORKER_EXTRACT:studioAutonomousOpenAiPick__*/
/*__STUDIO_WORKER_EXTRACT:createAutonomousIdea__*/
/*__STUDIO_WORKER_EXTRACT:autonomousPlanVariantsReady__*/
/*__STUDIO_WORKER_EXTRACT:waitAutonomousVariantsReady__*/
/*__STUDIO_WORKER_EXTRACT:finishAutonomousProductionRequest__*/
/*__STUDIO_WORKER_EXTRACT:ideaMatchedMediaIds__*/
/**
 * Stamp a random Autonomous_Music_Pool track when Selected_Music_Asset is blank.
 * Photo-ready daily ideas used to skip this and every Remotion job fell through to
 * the same catalog favorite (Clocking In).
 */
/*__STUDIO_WORKER_EXTRACT:ensureAutonomousSelectedMusic__*/
/** Stamp photo-ready daily ideas so one-at-a-time resume can produce them into Factory Needs eyes. */
/*__STUDIO_WORKER_EXTRACT:stampPhotoReadyIdeaForAutonomousProduce__*/
/** Stamp photo-ready 1 a.m. ideas (up to a small batch) so resume can produce them. */
/*__STUDIO_WORKER_EXTRACT:adoptNextReadyDailyIdea__*/
/*__STUDIO_WORKER_EXTRACT:listAutonomousDraftRequests__*/
/*__STUDIO_WORKER_EXTRACT:annotateAutonomousResumeDrafts__*/
/*__STUDIO_WORKER_EXTRACT:selectAutonomousResumeDraft__*/
/*__STUDIO_WORKER_EXTRACT:selectAutonomousResumeDraftBatch__*/
/*__STUDIO_WORKER_EXTRACT:alignAutonomousDraftContentType__*/
/*__STUDIO_WORKER_EXTRACT:resumeAutonomousDrafts__*/
/*__STUDIO_WORKER_EXTRACT:studioHealAutonomousRevisionLock__*/
/*__STUDIO_WORKER_EXTRACT:releaseAutonomousRevisionLock__*/
/*__STUDIO_WORKER_EXTRACT:parkAutonomousResumeDraft__*/
/**
 * Unpromoted Idea Candidates that still clog Factory / Ideas.
 * Rejected and On Hold do not count toward the open-ideas cap.
 */
const AUTONOMOUS_OPEN_IDEAS_FORMULA =
  "AND({Promoted_Content_Record_ID}=BLANK(),{Test_Run_ID}=BLANK(),{Candidate_Status}!='Rejected',{Candidate_Status}!='On Hold')";

/** Count open ideas up to cap+1 so we can tell at-cap without paging the whole table. */
/*__STUDIO_WORKER_EXTRACT:countAutonomousOpenIdeas__*/
/**
 * Create AUTONOMOUS_IDEAS_PER_HOUR ideas for one city under 200 Scheduled+Awaiting Approval.
 * Subjects already in flight do not reduce the count. A library photo group
 * is attached when one exists so resume can take that draft to final approval.
 * An idea with no stills is stamped Waiting for Factory Needs Assets.
 * Variants and produce stay on the resume path.
 * `createBudget` is the remaining global open-ideas room for this pass.
 */
/*__STUDIO_WORKER_EXTRACT:fillAutonomousCityIdeas__*/
/*__STUDIO_WORKER_EXTRACT:fillAutonomousScheduledHour__*/
/*__STUDIO_WORKER_EXTRACT:executeStudioAutonomousProduce__*/
/*__STUDIO_WORKER_EXTRACT:runStudioAutonomousProduce__*/
/*__STUDIO_WORKER_EXTRACT:studioDailyCadenceRecentBatchForProfile__*/
/*__STUDIO_WORKER_EXTRACT:executeStudioDailyIdeas__*/
/*__STUDIO_WORKER_EXTRACT:runStudioDailyIdeas__*/
/*__STUDIO_WORKER_EXTRACT:kickStudioOutputPublish__*/
/*__STUDIO_WORKER_EXTRACT:scheduleStudioPublishOutput__*/
/*__STUDIO_WORKER_EXTRACT:isTikTokPostUrl__*/
/*__STUDIO_WORKER_EXTRACT:tiktokCompleteEligibility__*/
/*__STUDIO_WORKER_EXTRACT:tiktokMusicStatusFromChoice__*/
/*__STUDIO_WORKER_EXTRACT:tiktokManualPublishFields__*/
/*__STUDIO_WORKER_EXTRACT:tiktokCompleteViewFromRecord__*/
const TIKTOK_COMPLETE_ERRORS = {
  not_tiktok: "This output is not a TikTok draft.",
  do_not_publish: "Publishing is blocked on this output.",
  already_published: "This TikTok output is already marked Published.",
  manual_completion_not_required: "This TikTok output is not waiting for a live post URL yet.",
};

/*__STUDIO_WORKER_EXTRACT:patchTiktokManualPublish__*/
/*__STUDIO_WORKER_EXTRACT:youtubeCompleteViewFromRecord__*/
const YOUTUBE_COMPLETE_ERRORS = {
  not_youtube: "This output is not a YouTube row.",
  do_not_publish: "Publishing is blocked on this output.",
  already_published: "This YouTube output is already marked Published.",
};

/*__STUDIO_WORKER_EXTRACT:patchYoutubeManualClose__*/
/*__STUDIO_WORKER_EXTRACT:markStudioYoutubeComplete__*/
/*__STUDIO_WORKER_EXTRACT:markStudioTiktokComplete__*/
/*__STUDIO_WORKER_EXTRACT:resendStudioTiktokDraft__*/
/*__STUDIO_WORKER_EXTRACT:markStudioOutputPublished__*/
/*__STUDIO_WORKER_EXTRACT:pulseA1SCompression__*/
/*__STUDIO_WORKER_EXTRACT:pulseA1SForDriveFile__*/
/*__STUDIO_WORKER_EXTRACT:pulseM1ResetRenderUrls__*/
/*__STUDIO_WORKER_EXTRACT:pulseR2BRetryAssetSelection__*/
/*__STUDIO_WORKER_EXTRACT:pulseMakeAdminBridgeQueue__*/
/*__STUDIO_WORKER_EXTRACT:pulseAudioLeadingSilence__*/
/*__STUDIO_WORKER_EXTRACT:pulseStudioLibraryIntake__*/
/*__STUDIO_WORKER_EXTRACT:mapLibraryIntakeAsset__*/
/*__STUDIO_WORKER_EXTRACT:mapLibraryIntakeSnapshot__*/
/*__STUDIO_WORKER_EXTRACT:mapMakeIntakeRun__*/
/*__STUDIO_WORKER_EXTRACT:makeExecutionList__*/
/*__STUDIO_WORKER_EXTRACT:listMakeIntakeExecutions__*/
/*__STUDIO_WORKER_EXTRACT:pythonIntakeRun__*/
/*__STUDIO_WORKER_EXTRACT:pythonA2RunSince__*/
/*__STUDIO_WORKER_EXTRACT:firstRunSince__*/
/*__STUDIO_WORKER_EXTRACT:describeA2Run__*/
/*__STUDIO_WORKER_EXTRACT:buildLibraryIntakeStatus__*/
/*__STUDIO_WORKER_EXTRACT:getStudioLibraryIntakeStatus__*/
// Shared bindings for the extracted function modules (live ESM references).
export {
  JSON_HEADERS,
  STUDIO_DEFAULT_MUSIC_VOLUME,
  STUDIO_DEFAULT_DUCKED_MUSIC_VOLUME,
  HttpError,
  STUDIO_TABLES,
  ROLE_PERMISSIONS,
  AIRTABLE_MIN_GAP_MS,
  AIRTABLE_SLOT_FAIL_FAST_MS,
  airtableNextRequestAt,
  studioHotReadCache,
  studioListWriteGeneration,
  AIRTABLE_BATCH_LIMIT,
  CONTENT_OUTPUT_TERMINAL_STATES,
  IDEA_PHOTO_WAIT_TYPES,
  STUDIO_CITY_DESTINATION_KEYS,
  STUDIO_PIPELINE_OPEN_OUTPUT_LIMIT,
  STUDIO_PIPELINE_OPEN_FIELD_FORMULA,
  STUDIO_PIPELINE_OPEN_LEGACY_FORMULA,
  PRODUCTION_REQUEST_OUTPUT_TABLE,
  PRO_OUTPUT_TYPES_BY_PLATFORM,
  PRO_OUTPUT_OVERRIDE_TRISTATE,
  PRO_OUTPUT_THUMBNAIL_OVERRIDE,
  PRO_OUTPUT_COUNT_MODES,
  PRO_OUTPUT_CAROUSEL_IMAGE_MODES,
  PRO_OUTPUT_TEXT_MODES,
  PRO_OUTPUT_PUBLISH_MODES,
  ITEM4_MEDIA_PUBLIC_BASE,
  STUDIO_CHICAGO_WATERMARK_MEDIA_ASSET_ID,
  STUDIO_CHICAGO_WATERMARK_R2_KEY,
  STUDIO_CHICAGO_WATERMARK_PUBLIC_URL,
  ITEM4_MAPPING_TABLE,
  ITEM4_MAX_FILES_PER_UPLOAD_REQUEST,
  ITEM4_MAX_FILE_BYTES,
  ITEM4_MAX_TOTAL_BYTES,
  ITEM4_MAX_CLIP_FILE_BYTES,
  ITEM4_FINISHED_VIDEO_HARD_MAX_BYTES,
  ITEM4_LARGE_UPLOAD_PART_BYTES,
  ITEM4_COMPRESS_THRESHOLD_BYTES,
  ITEM4_MAX_MIXED_TOTAL_BYTES,
  ITEM4_CLIP_INPUTS,
  ITEM4_NATIVE_STILL_OUTPUTS,
  ITEM4_VIDEO_DEFAULTS,
  ITEM4_RATIO_SPECS,
  ITEM4_PLAN_SPECS,
  ITEM4_LEFTOVER_OVERLAYS,
  STUDIO_SHARED_VERTICAL_SHORT_TYPES,
  ITEM4_MEDIA_ASSET_TABLE,
  IDEA_LIBRARY_STOPWORDS,
  IDEA_LIBRARY_WEAK_TOKENS,
  IDEA_LIBRARY_SHORT_SUBJECTS,
  IDEA_LIBRARY_BRAND_SUBJECTS,
  IDEA_LIBRARY_DISTINCTIVE_SUBJECTS,
  IDEA_LIBRARY_NAMED_PLACES,
  ITEM4_FBS1_SCENARIO_ID,
  ITEM4_FBS1_EXPECTED_WEBHOOK_ID,
  STUDIO_SCHEDULE_GAP_MS,
  STUDIO_OCCUPIED_CACHE_MS,
  STUDIO_OCCUPIED_LIST_LIMIT,
  STUDIO_OCCUPIED_LOOKBACK_MS,
  STUDIO_OCCUPIED_HORIZON_MS,
  studioOccupiedScheduleCaches,
  ITEM4_STORY_TEASER_SECONDS,
  ITEM4_SINGLE_STILL_SECONDS,
  ITEM4_VARIANT_QUEUE_TABLE,
  ITEM4_SMV1_SCENARIO_ID,
  ITEM4_VARIANT_RECIPE_VERSION,
  ITEM4_DRAIN_POST_BUDGET_MS,
  ITEM4_DRAIN_STATUS_BUDGET_MS,
  ITEM4_DRAIN_BACKGROUND_BUDGET_MS,
  ITEM4_DRAIN_PROMOTE_BUDGET_MS,
  IDEA_LIBRARY_SCAN_LIMIT,
  IDEA_LIBRARY_PLACE_FILTER_LIMIT,
  ITEM4_DRAIN_CRON_BUDGET_MS,
  ITEM4_SMV1_BASE_ELIGIBILITY_FORMULA,
  ITEM4_SMV1_PRODUCTION_FORMULA,
  ITEM4_QUEUE_DRAIN_SCAN_FORMULA,
  ITEM4_P3_SCENARIO_ID,
  ITEM4_P3_WEBHOOK_URL,
  ITEM4_P2_SCENARIO_ID,
  ITEM4_P2_WEBHOOK_URL,
  STUDIO_P1_SCENARIO_ID,
  ITEM4_C2_SCENARIO_ID,
  ITEM4_C2_WEBHOOK_URL,
  ITEM4_SAI1_SCENARIO_ID,
  ITEM4_SAI1_WEBHOOK_URL,
  ITEM4_R2_SCENARIO_ID,
  ITEM4_R2_SOURCE_GUARD_NAME,
  ITEM4_P3_SOURCE_AUTHORITY_NAME,
  STUDIO_AP0_SCENARIO_ID,
  STUDIO_AP1_IG_SCENARIO_ID,
  STUDIO_AP1_IGS_SCENARIO_ID,
  STUDIO_AP1_IGS_POLL_SCENARIO_ID,
  STUDIO_FBS1_SCENARIO_ID,
  STUDIO_FBS2_SCENARIO_ID,
  STUDIO_FBS3_SCENARIO_ID,
  STUDIO_FBS4_SCENARIO_ID,
  STUDIO_YT0_SCENARIO_ID,
  STUDIO_YTP1_SCENARIO_ID,
  STUDIO_YTS1_SCENARIO_ID,
  STUDIO_YTS2_SCENARIO_ID,
  STUDIO_YTS3_SCENARIO_ID,
  STUDIO_YT_ORCH_SCENARIO_ID,
  STUDIO_TTD0_SCENARIO_ID,
  STUDIO_TTD1_SCENARIO_ID,
  STUDIO_TTD2_SCENARIO_ID,
  STUDIO_TTD3_SCENARIO_ID,
  STUDIO_TTD4_SCENARIO_ID,
  STUDIO_TTD_ORCH_SCENARIO_ID,
  STUDIO_FB0_SCENARIO_ID,
  STUDIO_FB1_SCENARIO_ID,
  STUDIO_FB2_SCENARIO_ID,
  STUDIO_FB2R_SCENARIO_ID,
  STUDIO_FB3_SCENARIO_ID,
  STUDIO_FB_ORCH_SCENARIO_ID,
  STUDIO_AP0C_SCENARIO_ID,
  STUDIO_AP1C_SCENARIO_ID,
  STUDIO_AP2C_SCENARIO_ID,
  STUDIO_AP3C_SCENARIO_ID,
  STUDIO_AP3P_SCENARIO_ID,
  STUDIO_AP4C_SCENARIO_ID,
  STUDIO_AP4R_SCENARIO_ID,
  STUDIO_AP5C_SCENARIO_ID,
  STUDIO_AP_CAR_ORCH_SCENARIO_ID,
  STUDIO_IG_ORCH_SCENARIO_ID,
  STUDIO_PRODUCTION_JOB_LABELS,
  AZ_DEFAULT_PLATFORMS,
  AZ_DEFAULT_OVERRIDES,
  AZ_DEFAULT_EXTRAS,
  AZ_HORIZON_DAYS,
  AZ_OTHER_CLUSTER_MS,
  AZ_OTHER_NEAR_MS,
  AZ_STORY_OFFSET_MS,
  AZ_SCHEDULE_LEAD_MS,
  PRODUCTION_REQUEST_TABLE,
  PR_STATUSES,
  PR_CONTENT_TYPES,
  PR_PLATFORMS,
  PR_PLATFORM_ALIASES,
  PR_TRISTATE,
  PR_THUMBNAIL_MODES,
  PR_COUNT_MODES,
  PR_TEXT_MODES,
  PR_CAROUSEL_IMAGE_MODES,
  PRODUCTION_REQUEST_LIST_FIELDS,
  OPEN_PRODUCTION_REQUEST_FORMULA,
  FACTORY_REVISION_NOTE_PREFIX,
  STUDIO_OUTPUT_ROUTE_SPECS,
  STUDIO_PLATFORM_OUTPUT_TABLE,
  STUDIO_SIMILAR_WATCHLIST_SETTING,
  STUDIO_SUGGEST_HORIZON_DAYS,
  STUDIO_SUGGEST_LEAD_MS,
  STUDIO_WATCHLIST_PLATFORMS,
  STUDIO_SIMILAR_TIMED_PLATFORMS,
  STUDIO_SIMILAR_TIMES_SETTING,
  STUDIO_SIMILAR_TIMES_TTL_MS,
  STUDIO_SIMILAR_TIMES_MIN_SAMPLE,
  STUDIO_SIMILAR_ACCOUNT_STATUS_SETTING,
  STUDIO_YOUTUBE_CREATOR_DISCOVERY_LAST_SETTING,
  STUDIO_YOUTUBE_DISCOVERY_CRON_TTL_MS,
  STUDIO_YOUTUBE_AUTONOMOUS_HARVEST_SETTING,
  STUDIO_YOUTUBE_AUTONOMOUS_HARVEST_TTL_MS,
  STUDIO_INSIGHTS_OBSERVATIONS_TABLE,
  STUDIO_INSIGHTS_LEARNED_TABLE,
  STUDIO_INSIGHTS_SEASONS,
  STUDIO_INSIGHTS_CTA_PATTERN,
  STUDIO_HEATMAP_DAYS,
  STUDIO_HEATMAP_WINDOWS,
  STUDIO_SIMILAR_SEEDS,
  STUDIO_INSIGHTS_DISCOVERY_QUERIES,
  STUDIO_PROMOTION_CONTENT_TYPES,
  STUDIO_PROMOTION_PLATFORMS,
  STUDIO_TRISTATE,
  OUTPUT_LIST_FIELDS,
  STUDIO_READ_SNAPSHOT_FRESH_MS,
  PIPELINE_OUTPUT_LIST_CACHE_MS,
  PIPELINE_OPEN_PACK_CACHE_MS,
  STUDIO_READ_SNAPSHOT_WARM_MS,
  pipelineListHealAt,
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
  item4MakeHardeningOpenCache,
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
  PHASE6_RR1_SCENARIO_ID,
  PHASE6_RR2_SCENARIO_ID,
  STUDIO_R5_DONE_HOOK_TOKEN,
  STUDIO_R2_WORK_FORMULA,
  STUDIO_R3_WORK_FORMULA,
  STUDIO_T1_WORK_FORMULA,
  STUDIO_R4_WORK_FORMULA,
  STUDIO_RENDER_QUEUE_CANDIDATE_FORMULA,
  STUDIO_RENDER_QUEUE_ACTIVE_FORMULA,
  STUDIO_RR1_WORK_FORMULA,
  STUDIO_CONTINUATION_CANDIDATE_FORMULA,
  STUDIO_RFR_MISSING_COVER_FORMULA,
  PRODUCTION_CADENCE_RENDER,
  PRODUCTION_CADENCE_PUBLISH,
  STUDIO_AP0C_CHAIN_WEBHOOKS,
  STUDIO_FB0_CHAIN_WEBHOOKS,
  PRODUCTION_CADENCE_WEBHOOK_LIVE,
  STUDIO_AP0_WEBHOOK_URL,
  STUDIO_FB_PUBLIC_WEBHOOK_URL,
  STUDIO_FB_PUBLIC_SCENARIO_ID,
  STUDIO_FB_PUBLIC_DIAG_CORRELATION,
  STUDIO_AP0_RECORD_ID,
  PRODUCTION_CADENCE_PUBLISH_ORCH,
  PRODUCTION_CADENCE_ALWAYS_ON,
  PRODUCTION_CADENCE_MEDIA,
  PRODUCTION_CADENCE_CAROUSEL,
  PRODUCTION_CADENCE_REPAIR,
  STUDIO_M1_SCENARIO_ID,
  STUDIO_R2B_SCENARIO_ID,
  STUDIO_MAKE_ADMIN_BRIDGE_SCENARIO_ID,
  STUDIO_MAKE_ADMIN_PENDING_FORMULA,
  STUDIO_R2B_VIEW_NAME,
  STUDIO_M1_STALE_RENDER_FORMULA,
  STUDIO_C1_VIEW_ID,
  STUDIO_C2_VIEW_ID,
  STUDIO_C2M_VIEW_ID,
  STUDIO_C2M_TABLE_ID,
  PRODUCTION_CADENCE_HOLD_MS,
  PRODUCTION_CADENCE_THROTTLE_MS,
  PRODUCTION_CADENCE_PARKED,
  PRODUCTION_CADENCE_PARK_ASSERT_MS,
  productionCadenceLastSyncAt,
  productionCadenceParkAssertedAt,
  productionCadenceRenderHoldUntil,
  productionCadencePublishHoldUntil,
  STUDIO_FB_COVER_ATTACHED_MARK,
  R2_UPLOAD_WORKER_PUBLIC,
  STUDIO_UPLOAD_WORKER_UA,
  STUDIO_CHICAGO_PLACE_PAGE_IDS,
  STUDIO_PUBLISH_DISPATCH_SCENARIOS,
  STUDIO_PUBLISH_ORCH_PYTHON,
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
  STUDIO_A2_WEBHOOK_URL,
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
};
