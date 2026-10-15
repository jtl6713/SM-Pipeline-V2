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
  HttpError,
  IDEA_PHOTO_WAIT_TYPES,
  PRODUCTION_REQUEST_OUTPUT_TABLE,
  ITEM4_MEDIA_PUBLIC_BASE,
  ITEM4_RATIO_SPECS,
  ITEM4_MEDIA_ASSET_TABLE,
  STUDIO_OCCUPIED_LIST_LIMIT,
  STUDIO_OCCUPIED_LOOKBACK_MS,
  STUDIO_OCCUPIED_HORIZON_MS,
  ITEM4_VARIANT_QUEUE_TABLE,
  ITEM4_SMV1_SCENARIO_ID,
  ITEM4_VARIANT_RECIPE_VERSION,
  ITEM4_DRAIN_POST_BUDGET_MS,
  ITEM4_DRAIN_STATUS_BUDGET_MS,
  ITEM4_DRAIN_BACKGROUND_BUDGET_MS,
  ITEM4_DRAIN_PROMOTE_BUDGET_MS,
  ITEM4_DRAIN_CRON_BUDGET_MS,
  ITEM4_QUEUE_DRAIN_SCAN_FORMULA,
  PRODUCTION_REQUEST_TABLE,
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
  STUDIO_WATCHLIST_PLATFORMS,
  STUDIO_SIMILAR_TIMED_PLATFORMS,
  STUDIO_SIMILAR_TIMES_SETTING,
  STUDIO_SIMILAR_TIMES_TTL_MS,
  STUDIO_SIMILAR_TIMES_MIN_SAMPLE,
  STUDIO_SIMILAR_ACCOUNT_STATUS_SETTING,
  STUDIO_YOUTUBE_CREATOR_DISCOVERY_LAST_SETTING,
  STUDIO_YOUTUBE_DISCOVERY_CRON_TTL_MS,
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
  PHASE6_DEFAULT_VOICE_ID,
  PHASE6_GEORGE_VOICE_ID,
  STUDIO_T1_WORK_FORMULA,
  STUDIO_R4_WORK_FORMULA,
  STUDIO_RENDER_QUEUE_CANDIDATE_FORMULA,
  STUDIO_RENDER_QUEUE_ACTIVE_FORMULA,
  STUDIO_IDEA_PROFILE_TABLE_ID,
} from "./worker.js";
import {
  resolveStudioCronAuthorization,
  membershipAllowsBrand,
  respond,
  studioReadCoalesce,
  airtableBatchUpdate,
  mapPool,
  clampLimit,
  listRecords,
  f,
  studioOutputIsNativePhotoRoute,
  studioClipPublicCdnUrl,
  item4UrlIsPublicPublishCdn,
  item4FinishedMasterPlayUrl,
  studioEnsureNativePublishSlides,
  mapIdea,
  ideaPhotoWaitApplies,
  sortHighConfidenceMatches,
  selectMatchedPhotos,
  extractGoogleDriveFileId,
  googleDriveFileId,
  googleDriveDownloadUrl,
  airtableFormulaEscape,
  requestedProfileId,
  studioNormalizeProfileKey,
  studioThemeForProfile,
  studioCityLabel,
  studioScheduleTimeZoneFromTheme,
  studioScheduleTimeZoneForProfile,
  mapStudioContentProfile,
  contentProfileFilterFormula,
  listContentProfileRecords,
  resolveAuthorizedContentProfiles,
  resolveWorkingContentProfile,
  ideaRecordIdFromPath,
  loadAuthorizedIdea,
  mapProductionRequestOutput,
  outputRowsForProductionRequest,
  assertEditableProductionRequest,
  item4ParseJson,
  item4RequestIdFromPath,
  item4SafeFileName,
  item4LooksLikeVideoAsset,
  item4AssetsNeedStudioCompress,
  item4HealStaleCompressionAssets,
  item4HasVideoMasters,
  item4LooksLikeImagePreviewUrl,
  item4BuildClipPostersLocally,
  item4PlayableMediaUrl,
  item4VideoStreamPath,
  item4VideoVariantReady,
  item4AssetManifest,
  item4NormalizeSlideCaptions,
  item4ApplySlideCaptions,
  item4RequestedCaptionIsSlideDump,
  item4PreferredOverlayText,
  item4FillAiOverlayFallbacks,
  item4OverlayCaptionBySourceId,
  studioSharedRenderRerenderFields,
  item4PhotoOverlayFromCaption,
  item4MasterQueueRows,
  item4UpsertMasterQueue,
  item4SanitizeStudioImageMediaAsset,
  item4ReconcileMasterAuthority,
  item4UpdateRequestState,
  ideaLibraryIsEligibleVideo,
  item4ProductionProfileRecord,
  item4ParseEzOrigin,
  studioFinishedOriginKind,
  studioIsFinishedPassthrough,
  studioFinishedVariantsSkipped,
  studioScheduleMs,
  studioOccupiedLinkedIds,
  studioLoadOccupiedSchedules,
  item4EffectivePhotoCount,
  item4StudioDirectiveYes,
  item4ThumbnailSource,
  item4UrlIsStudioPhotoCrop,
  studioAiThumbnailUrl,
  studioNeedsAiThumbnail,
  item4StudioThumbnailPrompt,
  item4SlideImageUrl,
  item4ResolvedVideoDurationSeconds,
  item4ReconcileCreatedPlatformOutput,
  item4CollapseDuplicatePlanOutputs,
  item4ReconcileEnabledPlanOutputs,
  buildItem4OutputPlan,
  item4VariantManifest,
  item4CoverStillUrl,
  item4PlanRatios,
  item4RequiredRatios,
  item4CoverHeroAsset,
  item4ExpectedVariantKeys,
  item4VariantTargetFileName,
  item4NormalizedCrop,
  item4CropStyleToken,
  item4MergeAssetCrops,
  item4QueueTransferId,
  item4QueueStatus,
  item4QueueRowHasAuthority,
  item4QueueRowCountsReady,
  item4RequeueTransientVariantFailures,
  item4RequeueFailedVariantsForHeal,
  item4RequeueStaleProcessing,
  item4QueueMediaAssetId,
  item4QueueDriveFileId,
  item4RelinkVariantQueueOutputs,
  item4VariantQueueRows,
  item4UpsertVariantQueue,
  item4QueueRowIsOutstanding,
  pipelineStageBackend,
  parseStudioProductionJob,
  item4PulseClipPosterJob,
  item4PulseStudioCompressJob,
  studioRequestNotesText,
  studioIsAzFinishedVideo,
  studioIsVibeCut,
  skipsProductionApprove,
  studioChicagoWeekdayShort,
  studioAzIsStory,
  advanceAzFinishedVideo,
  enqueueStudioProductionJob,
  studioProduceHealState,
  studioLastModifiedStaleFormula,
  studioChicagoWatermarkOutput,
  studioParkChicagoWatermarkRender,
  studioRemotionPrivateDriveLocalizationReady,
} from "./worker-functions-01.mjs";
import {
  findDraftProductionRequestForIdea,
  rankStillsForIdeaPhotoWait,
  rankVideosForScriptedShortProposal,
  applyLibraryAssetsToProductionRequest,
  evaluateAndMaybeAttachWaitingIdeaPhotos,
  listLibraryBatchExistingNames,
  item4PreviewPendingRows,
  item4DrainPreviewCacheWorker,
  phase6NarrationVoiceFromRequest,
  phase6MakeApiConfig,
  cadenceQueueHasWork,
  studioFirstLinkedId,
  studioActivePipelineSettings,
  studioMarketName,
  studioMatchKnownPlace,
} from "./worker-functions-03.mjs";
import {
  mapOperationsProfile,
  studioSettingsByName,
  studioUpsertSetting,
  firstOpsLinkedId,
  mapOpsQueueProfileName,
  factoryLatestReviewFeedback,
  studioInternalJsonRequest,
  autonomousPlanVariantsReady,
} from "./worker-functions-04.mjs";

export function studioMediaIdsFromSourcePackage(raw) {
  const parsed = item4ParseJson(raw, null);
  const ids = [];
  const push = (value) => {
    const id = String(value || "").trim();
    if (/^rec[A-Za-z0-9]{14}$/.test(id) && !ids.includes(id)) ids.push(id);
  };
  if (Array.isArray(parsed)) {
    for (const row of parsed) {
      if (typeof row === "string") push(row);
      else if (row && typeof row === "object") {
        push(row.media_asset_record_id || row.media_asset_id || row.id);
      }
    }
    return ids;
  }
  if (parsed && typeof parsed === "object") {
    for (const row of parsed.assets || parsed.selected || parsed.items || []) {
      if (typeof row === "string") push(row);
      else if (row && typeof row === "object") {
        push(row.media_asset_record_id || row.media_asset_id || row.id);
      }
    }
  }
  return ids;
}
/*__STUDIO_WORKER_END:studioMediaIdsFromSourcePackage__*/

export function studioIdeaProxyFromProduceRequest(requestRecord, parent) {
  return {
    id: requestRecord.id,
    fields: {
      Candidate_Title: f(requestRecord, "Requested_Title") || f(parent, "Content_Title") || "",
      Primary_Location: f(requestRecord, "Primary_Location") || f(parent, "Primary_Location") || "",
      Idea_Summary: f(parent, "Idea_Summary") || f(requestRecord, "Production_Notes") || "",
      Content_Profile: f(parent, "Content_Profile") || f(requestRecord, "Brand") || [],
      Production_Carousel_Slide_Count_Min: Number(f(requestRecord, "Carousel_Slide_Count_Min") || 5) || 5,
      Production_Carousel_Slide_Count_Max: Number(f(requestRecord, "Carousel_Slide_Count_Max") || 10) || 10,
    },
  };
}
/*__STUDIO_WORKER_END:studioIdeaProxyFromProduceRequest__*/

export async function studioRecoverEscalatedMasters(env, requestRecord) {
  const existing = item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), []);
  if (Array.isArray(existing) && existing.length) {
    return { ok: true, attached: 0, already: existing.length };
  }
  const contentId = studioFirstLinkedId(f(requestRecord, "Promoted_Content_Item"))
    || studioFirstLinkedId(f(requestRecord, "Content Items"));
  let parent = null;
  if (contentId) {
    parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId).catch(() => null);
  }
  const fromParent = studioMediaIdsFromSourcePackage(f(parent, "Studio_Source_Selected_Assets_JSON"));
  if (fromParent.length) {
    const attached = await applyLibraryAssetsToProductionRequest(env, requestRecord, fromParent, { replaceWaitAssets: false });
    return { ok: attached.assets.length > 0, attached: attached.appended, already: attached.assets.length - attached.appended };
  }
  const idea = studioIdeaProxyFromProduceRequest(requestRecord, parent);
  const matches = await rankStillsForIdeaPhotoWait(env, idea);
  const min = Number(idea.fields.Production_Carousel_Slide_Count_Min || 5) || 5;
  const max = Number(idea.fields.Production_Carousel_Slide_Count_Max || 10) || 10;
  const decision = selectMatchedPhotos({ matches, min, max, pendingBatchIds: [], force: true });
  const selected = (decision.action === "ready" ? decision.selected : sortHighConfidenceMatches(matches).slice(0, max))
    .map((row) => row.id)
    .filter(Boolean);
  if (!selected.length) return { ok: false, attached: 0, already: 0 };
  const attached = await applyLibraryAssetsToProductionRequest(env, requestRecord, selected, { replaceWaitAssets: false });
  return { ok: attached.assets.length > 0, attached: attached.appended, already: attached.assets.length - attached.appended };
}
/*__STUDIO_WORKER_END:studioRecoverEscalatedMasters__*/

export async function studioHealEscalatedProduce(env, options = {}) {
  const limit = Math.max(1, Math.min(6, Number(options.limit || 4)));
  const rows = await listRecords(env, PRODUCTION_REQUEST_TABLE, {
    limit,
    sortField: "Updated_At",
    sortDirection: "desc",
    filterFormula: `AND({Test_Run_ID}=BLANK(),{Request_Status}!="Cancelled",{Studio_Production_Job_JSON}!="",OR(FIND('"step":"escalated"',{Studio_Production_Job_JSON}),FIND('"step": "escalated"',{Studio_Production_Job_JSON})))`,
  }).catch(() => []);
  const pulses = [];
  for (const row of rows || []) {
    const job = parseStudioProductionJob(row);
    if (String(job?.step || "").trim() !== "escalated") continue;
    const err = String(job?.error || job?.heal?.last_block_error || "");
    if (/clip count mismatch/i.test(err) || isDriveMusic404Error(err) || isProduceStamp422Error(err) || !deskRecoverableEscalatedError(err || "escalated")) {
      pulses.push({ key: "STUDIO_ESCALATED", id: row.id, skipped: "not_recoverable" });
      continue;
    }
    if (/no studio master photos to crop/i.test(err)) {
      try {
        const recovered = await studioRecoverEscalatedMasters(env, row);
        if (!recovered.ok) {
          pulses.push({ key: "STUDIO_ESCALATED", id: row.id, skipped: "no_masters_to_recover" });
          continue;
        }
      } catch (error) {
        pulses.push({
          key: "STUDIO_ESCALATED",
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }
    if (/no platform outputs found/i.test(err)) {
      const contentId = studioFirstLinkedId(f(row, "Promoted_Content_Item"))
        || studioFirstLinkedId(f(row, "Content Items"));
      const parent = contentId
        ? await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId).catch(() => null)
        : null;
      const outputs = Array.isArray(f(parent, "Platform Outputs")) ? f(parent, "Platform Outputs") : [];
      if (!outputs.length) {
        pulses.push({ key: "STUDIO_ESCALATED", id: row.id, skipped: "no_outputs" });
        continue;
      }
    }
    const heal = studioProduceHealState(job);
    const nextJob = {
      ...job,
      step: "blocked",
      attempt: 1,
      updated_at: new Date().toISOString(),
      error: null,
      detail: "Resuming after escalated heal",
      percent: Math.max(Number(job?.percent) || 0, 12),
      heal: {
        ...heal,
        resume_count: 0,
        last_resume_at: new Date().toISOString(),
        last_block_error: err || heal.last_block_error,
        last_step: "escalated",
        escalated_at: null,
      },
    };
    try {
      await airtableFetch(env, PRODUCTION_REQUEST_TABLE, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: { Studio_Production_Job_JSON: JSON.stringify(nextJob), Updated_At: new Date().toISOString() },
          typecast: false,
        }),
      });
      const pulsed = await enqueueStudioProductionJob(env, row.id, { resume: true });
      pulses.push({ key: "STUDIO_ESCALATED", id: row.id, resumed: true, payload: pulsed?.payload || pulsed || null });
    } catch (error) {
      pulses.push({
        key: "STUDIO_ESCALATED",
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (pulses.length) {
    console.log("Studio escalated-produce heal", JSON.stringify({
      count: pulses.length,
      pulses: pulses.map((row) => ({ key: row.key, id: row.id, skipped: row.skipped || null, error: row.error || null })),
    }));
  }
  return pulses;
}
/*__STUDIO_WORKER_END:studioHealEscalatedProduce__*/

export async function resumeStalePlatformOutputs(env, options = {}) {
  const minutes = Number(
    options.staleMinutes
    || Math.max(1, Math.round(Number(options.staleAfterMs || 120000) / 60000))
  );
  const stale = studioLastModifiedStaleFormula(minutes);
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const pulses = [];
  const jobs = [
    {
      key: "R5",
      formula: `AND({Test_Run_ID}=BLANK(),{Render_Status}="Rendering",{Remotion_Job_ID}!="",{Final_File_URL}="",${stale})`,
      run: () => item4PulseR5Python(env, { maxRuns: 5 }),
    },
    {
      key: "T1",
      formula: `AND(${STUDIO_T1_WORK_FORMULA},${stale})`,
      run: () => item4PulseT1Python(env, { maxRuns: 1 }),
    },
    {
      key: "R4",
      formula: `AND(${STUDIO_R4_WORK_FORMULA},${stale})`,
      run: () => item4PulseR4Python(env),
    },
    {
      key: "LETTER",
      formula: `AND({Test_Run_ID}=BLANK(),{Render_Status}="Native Photo Route",OR({Output_Status}="Ready for Review",{Output_Status}="In Production"),${stale})`,
      run: () => item4PulseLetterPython(env, { maxRuns: 8 }),
    },
  ];
  for (const job of jobs) {
    const hasWork = await cadenceQueueHasWork(env, outputTable, { formula: job.formula }).catch(() => false);
    if (!hasWork) {
      pulses.push({ key: job.key, skipped: "no_stale_work" });
      continue;
    }
    try {
      const payload = await job.run();
      pulses.push({ key: job.key, pulsed: true, backend: "python", stale_minutes: minutes, payload });
    } catch (error) {
      pulses.push({ key: job.key, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (pulses.some((row) => row.pulsed)) {
    console.log("Studio output watchdog", JSON.stringify({ count: pulses.length, pulses: pulses.map((row) => ({ key: row.key, pulsed: row.pulsed || false, skipped: row.skipped || null, error: row.error || null })) }));
  }
  return pulses;
}
/*__STUDIO_WORKER_END:resumeStalePlatformOutputs__*/

export async function item4PulsePipelineStage(env, stagePath, body = {}, stageKey = null) {
  const key = stageKey || String(stagePath || "").split("/")[0].trim().toUpperCase();
  const { runnerUrl } = pipelineStageBackend(env, key);
  if (!runnerUrl) throw new HttpError(503, `Pipeline runner is not configured for stage ${stagePath}`);
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const response = await fetch(`${runnerUrl}/stages/${stagePath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
/*__STUDIO_WORKER_END:item4PulsePipelineStage__*/

export async function item4PulseSmv1Python(env, recordId, maxRuns) {
  const ownerRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const testRunId = String(f(ownerRecord, "Test_Run_ID") || "").trim();
  const { response, payload } = await item4PulsePipelineStage(env, "smv1/drain", {
    production_request_record_id: recordId,
    ...(testRunId ? { test_run_id: testRunId } : {}),
    extra: { max_runs: maxRuns },
  }, "SMV1");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python SMV1 drain failed (${response.status})`
    );
  }
  const processed = Number(payload?.details?.processed_count || 0);
  return processed > 0 ? [`python:smv1:${recordId}`] : [];
}
/*__STUDIO_WORKER_END:item4PulseSmv1Python__*/

export async function item4PulseR2BPython(env, options = {}) {
  const body = {
    extra: { max_runs: Number(options.maxRuns || 10) },
  };
  if (options.outputRecordId) body.output_record_id = options.outputRecordId;
  if (options.testRunId) body.test_run_id = options.testRunId;
  if (options.dryRun) body.extra.dry_run = true;
  const { response, payload } = await item4PulsePipelineStage(env, "r2b", body, "R2B");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python R2B failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseR2BPython__*/

export async function item4PulseR2Python(env, options = {}) {
  const body = {
    extra: { max_runs: Number(options.maxRuns || 1) },
  };
  if (options.outputRecordId) body.output_record_id = options.outputRecordId;
  if (options.testRunId) body.test_run_id = options.testRunId;
  if (options.dryRun) body.extra.dry_run = true;
  const { response, payload } = await item4PulsePipelineStage(env, "r2", body, "R2");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python R2 failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseR2Python__*/

export async function item4PulseR3Python(env, options = {}) {
  const body = {
    extra: { max_runs: Number(options.maxRuns || 10) },
  };
  if (options.outputRecordId) body.output_record_id = options.outputRecordId;
  if (options.testRunId) body.test_run_id = options.testRunId;
  if (options.dryRun) body.extra.dry_run = true;
  const { response, payload } = await item4PulsePipelineStage(env, "r3", body, "R3");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python R3 failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseR3Python__*/

export async function item4PulseT1Python(env, options = {}) {
  const body = {
    extra: { max_runs: Number(options.maxRuns || 5) },
  };
  if (options.outputRecordId) body.output_record_id = options.outputRecordId;
  if (options.testRunId) body.test_run_id = options.testRunId;
  if (options.dryRun) body.extra.dry_run = true;
  const { response, payload } = await item4PulsePipelineStage(env, "t1", body, "T1");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python T1 failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseT1Python__*/

export async function studioGateR4ForPrivateDriveWatermark(env, options = {}) {
  const rendererReady = await studioRemotionPrivateDriveLocalizationReady(env);
  if (rendererReady) return { renderer_ready: true, parked: [] };

  const parked = [];
  const parkOne = async (row) => {
    if (!row || !studioChicagoWatermarkOutput(row)) return false;
    await studioParkChicagoWatermarkRender(env, row);
    parked.push({ id: row.id, output_id: f(row, "Output_ID") || null });
    return true;
  };

  if (options.outputRecordId) {
    const row = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, options.outputRecordId).catch(() => null);
    if (row) await parkOne(row);
    return { renderer_ready: false, parked };
  }

  // Global R4 pulses use the pipeline-runner's own selector. Park every
  // ChicagoShining Ready-for-Render row visible in the newest batch first so
  // that selector cannot accidentally launch one against the old renderer.
  const rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 50,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Render_Status}="Ready for Render",{Remotion_Job_ID}="")',
  }).catch(() => []);
  for (const row of rows || []) {
    try { await parkOne(row); } catch (error) {
      console.warn("R4 private Drive watermark gate park failed", row?.id, error);
    }
  }
  return { renderer_ready: false, parked };
}
/*__STUDIO_WORKER_END:studioGateR4ForPrivateDriveWatermark__*/

export async function studioRemotionRenderBusy(env) {
  const active = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 8,
    filterFormula: STUDIO_RENDER_QUEUE_ACTIVE_FORMULA,
  }).catch(() => []);
  if (active.length) {
    return { busy: true, activeCount: active.length, source: "airtable", activeIds: active.map((row) => row.id) };
  }
  try {
    const response = await fetch("https://render.chicagoshining.com/health", {
      method: "GET",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (remotionHealthLooksBusy(payload)) {
        return {
          busy: true,
          activeCount: Number(payload.remotionActiveRenders || 0),
          source: "health",
          queued: Number(payload.remotionQueuedRenders || 0),
        };
      }
    }
  } catch {}
  return { busy: false, activeCount: 0, source: "none" };
}
/*__STUDIO_WORKER_END:studioRemotionRenderBusy__*/

export async function studioStampRenderQueueWaiting(env, rowOrId) {
  const id = typeof rowOrId === "string" ? rowOrId : rowOrId?.id;
  if (!id) return null;
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Render_Status: RENDER_STATUS_WAITING_QUEUE,
      },
      typecast: true,
    }),
  });
}
/*__STUDIO_WORKER_END:studioStampRenderQueueWaiting__*/

export async function readOpsQueueControls(env) {
  try {
    const object = await env.STUDIO_MEDIA?.get?.(OPS_QUEUE_CONTROLS_KEY);
    if (!object) return emptyOpsQueueControls();
    const text = await object.text();
    return normalizeOpsQueueControls(JSON.parse(text));
  } catch {
    return emptyOpsQueueControls();
  }
}
/*__STUDIO_WORKER_END:readOpsQueueControls__*/

export async function readFactoryDeskControls(env) {
  try {
    const object = await env.STUDIO_MEDIA?.get?.(FACTORY_DESK_KEY);
    if (!object) return emptyFactoryDeskControls();
    const text = await object.text();
    return normalizeFactoryDeskControls(JSON.parse(text));
  } catch {
    return emptyFactoryDeskControls();
  }
}
/*__STUDIO_WORKER_END:readFactoryDeskControls__*/

export async function writeFactoryDeskControls(env, controls, actor = null) {
  const next = normalizeFactoryDeskControls({
    ...controls,
    updated_at: new Date().toISOString(),
    updated_by: actor || null,
  });
  await env.STUDIO_MEDIA.put(FACTORY_DESK_KEY, JSON.stringify(next), {
    httpMetadata: { contentType: "application/json" },
  });
  return next;
}
/*__STUDIO_WORKER_END:writeFactoryDeskControls__*/

export async function loadFactoryIdeaCandidates(env) {
  if (!env.AIRTABLE_IDEA_TABLE_ID) return [];
  const ideas = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
    limit: 40,
    sortField: "Candidate_ID",
    sortDirection: "desc",
    fields: [
      "Candidate_ID",
      "Candidate_Title",
      "Candidate_Status",
      "Content_Profile",
      "Studio_Photo_Wait_Status",
      "Production_Notes",
    ],
    filterFormula: "AND({Studio_Photo_Wait_Status}='Waiting',{Promoted_Content_Record_ID}=BLANK(),{Candidate_Status}!='On Hold')",
  }).catch(() => []);
  const profileIds = [...new Set((ideas || [])
    .map((row) => firstOpsLinkedId(f(row, "Content_Profile")))
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  const profileMap = new Map();
  if (profileIds.length) {
    const profiles = await listRecords(env, STUDIO_IDEA_PROFILE_TABLE_ID, { limit: 50 }).catch(() => []);
    for (const profile of profiles || []) profileMap.set(profile.id, profile);
  }
  return (ideas || []).map((record) => {
    const profile = mapOpsQueueProfileName(profileMap, f(record, "Content_Profile"));
    return {
      kind: "idea",
      id: record.id,
      idea_id: record.id,
      title: String(f(record, "Candidate_Title") || `Idea ${f(record, "Candidate_ID") || ""}`).trim(),
      ...profile,
      studio_state: "Waiting for photos",
      photo_wait_status: f(record, "Studio_Photo_Wait_Status") || "Waiting",
      production_notes: f(record, "Production_Notes") || "",
      request_status: null,
      updated_at: record?.createdTime || null,
    };
  });
}
/*__STUDIO_WORKER_END:loadFactoryIdeaCandidates__*/

export async function writeOpsQueueControls(env, controls, actor = null) {
  const next = normalizeOpsQueueControls({
    ...controls,
    updated_at: new Date().toISOString(),
    updated_by: actor || null,
  });
  await env.STUDIO_MEDIA.put(OPS_QUEUE_CONTROLS_KEY, JSON.stringify(next), {
    httpMetadata: { contentType: "application/json" },
  });
  return next;
}
/*__STUDIO_WORKER_END:writeOpsQueueControls__*/

export async function studioLoadRenderQueueCandidates(env, { limit = 80, fields = null, controls = null } = {}) {
  const fieldList = Array.isArray(fields) ? fields.filter(Boolean) : [];
  const rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit,
    sortField: "Output_ID",
    sortDirection: "asc",
    filterFormula: STUDIO_RENDER_QUEUE_CANDIDATE_FORMULA,
    ...(fieldList.length ? { fields: fieldList } : {}),
  }).catch(() => []);
  return sortRenderQueueCandidates(rows, f, controls);
}
/*__STUDIO_WORKER_END:studioLoadRenderQueueCandidates__*/

export async function studioAdmitRenderQueue(env, options = {}) {
  const controls = options.controls || await readOpsQueueControls(env);
  const candidates = await studioLoadRenderQueueCandidates(env, {
    limit: Number(options.limit || 80),
    controls,
  });
  if (!candidates.length) {
    return { admitted: false, reason: "no_candidates", waiting: 0, started: null, controls };
  }
  const activeHolds = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 16,
    filterFormula: STUDIO_RENDER_QUEUE_ACTIVE_FORMULA,
  }).catch(() => []);
  const busy = await studioRemotionRenderBusy(env);
  // One Remotion admission per shared 9:16 short group — siblings wait for produce
  // to copy Final_File_URL, they do not each claim a render slot.
  const { byId, total, admitCandidates } = assignRenderQueuePositions(candidates, f, {
    activeHolds,
    controls,
  });
  let stampedWaiting = 0;
  for (const row of candidates) {
    if (!isRenderQueueWaitingStatus(f(row, "Render_Status"))) {
      await studioStampRenderQueueWaiting(env, row).catch(() => null);
      stampedWaiting += 1;
    }
  }
  if (busy.busy) {
    return {
      admitted: false,
      reason: "remotion_slot_busy",
      waiting: total,
      stamped_waiting: stampedWaiting,
      busy,
      queue: [...byId.values()],
      shared_siblings_waiting: Math.max(0, candidates.length - total),
      controls,
    };
  }
  const head = admitCandidates[0];
  if (!head) {
    return {
      admitted: false,
      reason: "shared_render_hold",
      waiting: total,
      stamped_waiting: stampedWaiting,
      busy,
      queue: [...byId.values()],
      shared_siblings_waiting: Math.max(0, candidates.length - total),
      controls,
    };
  }
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, head.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: { Render_Status: RENDER_STATUS_READY },
      typecast: true,
    }),
  }).catch(() => null);
  let started = null;
  try {
    started = await item4PulseR4Python(env, {
      outputRecordId: head.id,
      forceSlot: true,
      testRunId: options.testRunId,
    });
  } catch (error) {
    return {
      admitted: false,
      reason: "r4_start_failed",
      waiting: Math.max(0, total - 1),
      head: head.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    admitted: Boolean(started?.processed || started?.details?.processed || started?.ok !== false),
    reason: "started_head",
    waiting: Math.max(0, total - 1),
    stamped_waiting: stampedWaiting,
    head: head.id,
    started,
    shared_siblings_waiting: Math.max(0, candidates.length - total),
  };
}
/*__STUDIO_WORKER_END:studioAdmitRenderQueue__*/

export async function item4PulseR4Python(env, options = {}) {
  const gate = await studioGateR4ForPrivateDriveWatermark(env, options);
  if (options.outputRecordId && gate.parked.length) {
    return {
      status: "skipped",
      message: "R4 parked until Remotion private Drive watermark localization is live",
      details: {
        reason: "private_drive_watermark_renderer_not_updated",
        parked: gate.parked,
      },
    };
  }

  if (!options.outputRecordId && !options.forceSlot && !options.dryRun) {
    // Global cadence pulses must use the single-slot admitter so Ready rows
    // wait in line instead of all being stamped Rendering.
    const admitted = await studioAdmitRenderQueue(env, { testRunId: options.testRunId });
    return {
      status: admitted.admitted ? "ok" : "queued",
      processed: Boolean(admitted.admitted),
      message: admitted.admitted
        ? "Started the next render from the queue"
        : "Remotion slot busy or no queue candidates",
      details: admitted,
    };
  }

  if (options.outputRecordId && !options.forceSlot) {
    const busy = await studioRemotionRenderBusy(env);
    if (busy.busy) {
      await studioStampRenderQueueWaiting(env, options.outputRecordId).catch(() => null);
      return {
        status: "queued",
        processed: false,
        message: "Waiting in render queue — Remotion slot is busy",
        details: {
          reason: "remotion_slot_busy",
          busy,
        },
      };
    }
  }

  const body = { extra: {} };
  if (options.outputRecordId) body.output_record_id = options.outputRecordId;
  if (options.testRunId) body.test_run_id = options.testRunId;
  if (options.dryRun) body.extra.dry_run = true;
  const { response, payload } = await item4PulsePipelineStage(env, "r4", body, "R4");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python R4 failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseR4Python__*/

export async function item4PulseR5Python(env, options = {}) {
  const body = {
    extra: { max_runs: Number(options.maxRuns || 5) },
  };
  if (options.outputRecordId) body.output_record_id = options.outputRecordId;
  if (options.testRunId) body.test_run_id = options.testRunId;
  if (options.dryRun) body.extra.dry_run = true;
  const { response, payload } = await item4PulsePipelineStage(env, "r5", body, "R5");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python R5 failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseR5Python__*/

export async function item4PulseLetterPython(env, options = {}) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) {
    console.warn("native JPEG lettering skipped: PIPELINE_RUNNER_URL is not set");
    return { skipped: "no-runner" };
  }
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const body = {
    extra: { max_runs: Number(options.maxRuns || 8) },
  };
  if (options.outputRecordId) body.output_record_id = options.outputRecordId;
  if (options.testRunId) body.test_run_id = options.testRunId;
  if (options.dryRun) body.extra.dry_run = true;
  const response = await fetch(`${runnerUrl}/stages/letter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn("native JPEG lettering failed", response.status, payload?.message || payload?.error || "");
    return { ok: false, status: response.status, payload };
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseLetterPython__*/

export async function item4RefreshNativeLetteredSlides(env, outputId) {
  const refreshed = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputId);
  await studioEnsureNativePublishSlides(env, refreshed);
  return refreshed;
}
/*__STUDIO_WORKER_END:item4RefreshNativeLetteredSlides__*/

export async function item4PulseRR2Python(env, options = {}) {
  const body = {
    extra: {},
  };
  if (options.outputRecordId) body.output_record_id = options.outputRecordId;
  if (options.decision) body.extra.decision = options.decision;
  if (options.dryRun) body.extra.dry_run = true;
  if (options.skipPublisherStart) body.extra.skip_publisher_start = true;
  const { response, payload } = await item4PulsePipelineStage(env, "rr2", body, "RR2");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python RR2 failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseRR2Python__*/

export async function handleRr2ReviewDecision(request, env, url) {
  let recordId = String(url.searchParams.get("record_id") || url.searchParams.get("output_record_id") || "").trim();
  let decision = String(url.searchParams.get("decision") || "").trim();
  if (request.method === "POST" && (!recordId || !decision)) {
    try {
      const payload = await request.clone().json();
      recordId = recordId || String(payload?.record_id || payload?.output_record_id || "").trim();
      decision = decision || String(payload?.decision || "").trim();
    } catch {}
  }
  try {
    const payload = await item4PulseRR2Python(env, {
      outputRecordId: recordId,
      decision,
    });
    const run = payload?.details?.run || {};
    const message = payload?.message || "Review decision received";
    const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:24px;"><h1>Render review decision</h1><p>${message}</p><p>Output ${run.output_id || recordId}: ${run.decision_label || decision || "no decision"}</p></body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=UTF-8" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`RR2 failed: ${message}`, { status: error instanceof HttpError ? error.status : 500, headers: { "Content-Type": "text/plain; charset=UTF-8" } });
  }
}
/*__STUDIO_WORKER_END:handleRr2ReviewDecision__*/

export async function item4PulseRR1Python(env, options = {}) {
  const body = {
    extra: { max_runs: Number(options.maxRuns || 10) },
  };
  if (options.outputRecordId) body.output_record_id = options.outputRecordId;
  if (options.testRunId) body.test_run_id = options.testRunId;
  if (options.dryRun) body.extra.dry_run = true;
  const { response, payload } = await item4PulsePipelineStage(env, "rr1", body, "RR1");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python RR1 failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseRR1Python__*/

export async function item4PulseP1Python(env, options = {}) {
  const body = {
    content_item_record_id: options.contentItemId || undefined,
    test_run_id: options.testRunId || undefined,
    extra: {
      max_runs: options.maxRuns || 1,
      ...(options.dryRun ? { dry_run: true } : {}),
      ...(options.triggerNext === false ? { trigger_next: false } : {}),
    },
  };
  const { response, payload } = await item4PulsePipelineStage(env, "p1", body, "P1");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python P1 failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseP1Python__*/

export async function item4PulseP2Python(env, contentItemId, requestRecord = {}, options = {}) {
  const testRunId = String(f(requestRecord, "Test_Run_ID") || options.testRunId || "").trim();
  const body = {
    content_item_record_id: contentItemId,
    test_run_id: testRunId || undefined,
  };
  if (options.dryRun) body.extra = { dry_run: true };
  const { response, payload } = await item4PulsePipelineStage(env, "p2", body, "P2");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python P2 failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseP2Python__*/

export async function item4PulseP3Python(env, contentItemId, requestRecord = {}, options = {}) {
  const testRunId = String(f(requestRecord, "Test_Run_ID") || options.testRunId || "").trim();
  const body = {
    content_item_record_id: contentItemId,
    test_run_id: testRunId || undefined,
  };
  if (options.dryRun) body.extra = { dry_run: true };
  const { response, payload } = await item4PulsePipelineStage(env, "p3", body, "P3");
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.message || payload?.error || `Python P3 failed (${response.status})`
    );
  }
  return payload;
}
/*__STUDIO_WORKER_END:item4PulseP3Python__*/

export async function item4SetSmv1SelectorFormula(env, formula) {
  const { makeApiBase, headers } = await phase6MakeApiConfig(env);
  const read = async () => {
    const r=await fetch(`${makeApiBase}/scenarios/${ITEM4_SMV1_SCENARIO_ID}/blueprint?draft=false`,{method:"GET",headers});
    const raw=await r.text(); if(!r.ok) throw new HttpError(r.status,`SMV1 selector read failed (${r.status}): ${raw.slice(0,240)}`);
    const b=raw?JSON.parse(raw):{}; const w=b?.blueprint??b?.response?.blueprint??b; return typeof w==="string"?JSON.parse(w):w;
  };
  const find=(flow,id)=>{for(const n of flow||[]){if(Number(n?.id)===Number(id))return n;for(const route of n?.routes||[]){const x=find(route?.flow||[],id);if(x)return x;}}return null;};
  const bp=await read(); const m=find(bp?.flow||[],1);
  if(!m||m.module!=="airtable:ActionSearchRecords"||String(m?.mapper?.maxRecords||"")!=="1") throw new HttpError(409,"SMV1 Module 1 selector contract drifted");
  if(String(m?.mapper?.formula||"")===formula)return false; m.mapper.formula=formula;
  const patch=await fetch(`${makeApiBase}/scenarios/${ITEM4_SMV1_SCENARIO_ID}?confirmed=true`,{method:"PATCH",headers,body:JSON.stringify({blueprint:JSON.stringify(bp)})});
  const pr=await patch.text();if(!patch.ok)throw new HttpError(patch.status,`SMV1 selector patch failed (${patch.status}): ${pr.slice(0,240)}`);
  const vb=await read();const vm=find(vb?.flow||[],1);if(String(vm?.mapper?.formula||"")!==formula||String(vm?.mapper?.maxRecords||"")!=="1")throw new HttpError(502,"SMV1 selector verification failed");return true;
}
/*__STUDIO_WORKER_END:item4SetSmv1SelectorFormula__*/

export async function item4DrainVariantWorker(env, recordId, maxRuns, options = {}) {
  // Make SMV1 is retired. Crops, Drive authority, and preview cache run on
  // the local Python runner. Do not PATCH or pulse scenario 5894885.
  void options;
  return item4PulseSmv1Python(env, recordId, maxRuns);
}
/*__STUDIO_WORKER_END:item4DrainVariantWorker__*/

export async function item4ListPendingQueueRequestIds(env) {
  const rows = await listRecords(env, ITEM4_VARIANT_QUEUE_TABLE, {
    limit: 100,
    filterFormula: ITEM4_QUEUE_DRAIN_SCAN_FORMULA,
  }).catch((error) => {
    console.warn("Item 4 pending queue scan failed", error);
    return [];
  });
  return [...new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => String(f(row, "Production_Request_Record_ID") || "").trim())
      .filter((id) => /^rec[A-Za-z0-9]+$/.test(id))
  )];
}
/*__STUDIO_WORKER_END:item4ListPendingQueueRequestIds__*/

export async function item4DrainAllPendingWork(env, options = {}) {
  // Worker owns the Item 4 queue. Browser polling and HTTP timeboxes may stop;
  // cron must keep draining until every pending master/variant row is gone.
  const maxMs = Number(options.maxMs || ITEM4_DRAIN_CRON_BUDGET_MS);
  const started = Date.now();
  const requestIds = await item4ListPendingQueueRequestIds(env);
  const drained = [];
  for (const recordId of requestIds) {
    if (Date.now() - started >= maxMs) break;
    const remaining = Math.max(4000, maxMs - (Date.now() - started));
    const rows = await item4VariantQueueRows(env, recordId);
    const outstanding = rows.filter(item4QueueRowIsOutstanding);
    if (!outstanding.length) {
      try { await item4ReconcileMasterAuthority(env, recordId); } catch {}
      try { await item4ReconcileVariants(env, recordId); } catch {}
      continue;
    }
    const executionIds = await item4DrainVariantWorker(
      env,
      recordId,
      Math.min(20, outstanding.length + 2),
      { maxMs: remaining }
    );
    try { await item4ReconcileMasterAuthority(env, recordId); } catch {}
    try { await item4ReconcileVariants(env, recordId); } catch {}
    drained.push({ record_id: recordId, outstanding: outstanding.length, executions: executionIds.length });
  }
  return { request_ids: requestIds, drained };
}
/*__STUDIO_WORKER_END:item4DrainAllPendingWork__*/

export function item4BuildDriveManifest(recordId, assets, ratios, queueRows, planRatios = null) {
  const queueById = new Map(
    queueRows.map((row) => [String(f(row, "Transfer_ID") || "").trim(), row])
  );
  const planSet = new Set(Array.isArray(planRatios) && planRatios.length ? planRatios : ratios);

  const manifest = {
    schema_version: "item4.variant-manifest.2",
    recipe_version: ITEM4_VARIANT_RECIPE_VERSION,
    production_request_record_id: recordId,
    authoritative_storage: "google_drive",
    persistent_cloudflare_storage: false,
    source_asset_count: assets.length,
    required_ratios: ratios,
    plan_ratios: [...planSet],
    target_count: 0,
    plan_target_count: assets.length * planSet.size,
    ready_count: 0,
    plan_ready_count: 0,
    generated_at: new Date().toISOString(),
    assets: [],
  };

  const extras = (ratios || []).filter((ratio) => !planSet.has(ratio));
  const hero = item4CoverHeroAsset(assets);
  for (const asset of assets) {
    const isHero = Boolean(hero?.id) && String(asset?.id || "") === String(hero.id);
    const assetRatios = [...planSet, ...(isHero ? extras : [])];
    manifest.target_count += assetRatios.length;
    const row = {
      id: asset.id,
      order: asset.order,
      name: asset.name,
      google_drive_file_id: asset.google_drive_file_id || null,
      google_drive_url: asset.google_drive_url || null,
      media_asset_record_id: asset.media_asset_record_id || null,
      preview_url: asset.preview_url || null,
      source_format: asset.source_format || null,
      variants: {},
    };

    for (const ratio of assetRatios) {
      if (item4LooksLikeVideoAsset(asset)) {
        if (!item4VideoVariantReady(asset)) continue;
        const mediaId = String(asset.media_asset_record_id || "").trim();
        const driveId = String(asset.google_drive_file_id || "").trim();
        const spec = ITEM4_RATIO_SPECS[ratio];
        row.variants[ratio] = {
          aspect_ratio: ratio,
          recipe_version: "video-passthrough",
          media_kind: "video",
          width: spec.width,
          height: spec.height,
          format: "VIDEO",
          google_drive_file_id: driveId || null,
          google_drive_url: String(asset.google_drive_url || "").trim() || (driveId ? `https://drive.google.com/file/d/${driveId}/view` : null),
          media_asset_record_id: mediaId,
          preview_url: item4VideoStreamPath(asset) || item4PlayableMediaUrl(asset) || null,
          preview_status: "Ready",
          file_name: String(asset.name || "clip.mp4"),
          duration_seconds: Number(asset.duration_seconds || 0) || null,
          in_seconds: Number(asset.in_seconds || 0) || 0,
          out_seconds: Number(asset.out_seconds || 0) || null,
          authoritative_storage: "google_drive",
          persistent_cloudflare_storage: false,
        };
        row.media_kind = "video";
        manifest.ready_count += 1;
        if (planSet.has(ratio)) manifest.plan_ready_count += 1;
        continue;
      }
      const transferId = item4QueueTransferId(recordId, asset.id, ratio, asset);
      const q = queueById.get(transferId);
      if (!q || !item4QueueRowCountsReady(q)) continue;

      const driveId = item4QueueDriveFileId(q);
      const mediaAssetId = item4QueueMediaAssetId(q);
      if (!driveId || !mediaAssetId) continue;

      const previewStatus = String(f(q, "Preview_Status") || "").trim();
      const previewUrl = previewStatus === "Ready"
        ? (String(f(q, "Preview_URL") || "").trim() || null)
        : null;
      const spec = ITEM4_RATIO_SPECS[ratio];
      row.variants[ratio] = {
        aspect_ratio: ratio,
        recipe_version: ITEM4_VARIANT_RECIPE_VERSION,
        width: spec.width,
        height: spec.height,
        format: "JPEG",
        google_drive_file_id: driveId,
        google_drive_url: String(f(q, "Drive_URL") || `https://drive.google.com/file/d/${driveId}/view`),
        media_asset_record_id: mediaAssetId,
        preview_url: previewUrl,
        preview_status: previewStatus || null,
        file_name: String(f(q, "Target_File_Name") || item4VariantTargetFileName(asset, ratio)),
        presentation: item4CropStyleToken(asset, ratio) === "center"
          ? (ratio === "9:16" ? "edge-to-edge center crop" : "center crop")
          : `focal crop ${item4CropStyleToken(asset, ratio)}`,
        crop: item4NormalizedCrop(asset, ratio),
        authoritative_storage: "google_drive",
        persistent_cloudflare_storage: false,
      };
      manifest.ready_count += 1;
      if (planSet.has(ratio)) manifest.plan_ready_count += 1;
    }
    manifest.assets.push(row);
  }

  manifest.plan_complete = manifest.plan_target_count > 0 && manifest.plan_ready_count === manifest.plan_target_count;
  manifest.complete = manifest.target_count > 0 && manifest.ready_count === manifest.target_count;
  return manifest;
}
/*__STUDIO_WORKER_END:item4BuildDriveManifest__*/

export function item4VariantManifestPlanComplete(manifest, plan, masterAssets = null) {
  const planRatios = item4PlanRatios(plan);
  if (!planRatios.length) return false;
  const assets = Array.isArray(masterAssets) && masterAssets.length
    ? masterAssets
    : (Array.isArray(manifest?.assets) ? manifest.assets : []);
  if (!assets.length) return false;
  if (Number(manifest?.plan_target_count || 0) > 0) {
    return Number(manifest.plan_ready_count || 0) === Number(manifest.plan_target_count);
  }
  const rows = Array.isArray(manifest?.assets) ? manifest.assets : [];
  return assets.every((asset) => {
    const row = rows.find((item) => String(item?.id || "") === String(asset?.id || ""));
    return planRatios.every((ratio) => Boolean(row?.variants?.[ratio]));
  });
}
/*__STUDIO_WORKER_END:item4VariantManifestPlanComplete__*/

export async function item4ReconcileVariants(env, recordId, record = null, options = {}) {
  record = record || await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const assets = item4AssetManifest(record).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const plan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  const planRatios = item4PlanRatios(plan || {});
  const ratios = item4RequiredRatios(plan || {});
  let queueRows = await item4VariantQueueRows(env, recordId);
  queueRows = await item4RequeueTransientVariantFailures(
    env,
    await item4RequeueStaleProcessing(env, queueRows)
  );
  const expectedIds = new Set(
    item4ExpectedVariantKeys(recordId, assets, plan || {}).map((row) => row.transfer_id)
  );
  const scoped = queueRows.filter((row) => expectedIds.has(String(f(row, "Transfer_ID") || "").trim()));

  // A saved plan alone must never move Item 4 into "Preparing".
  // Only an explicit Prepare Platform Media action (or an already-existing
  // variant queue for this request) is allowed to transition the workspace into
  // the preparing/ready/error lifecycle.
  if (!scoped.length) {
    const currentStatus = String(f(record, "Studio_Variant_Status") || "").trim();
    const videoOnly = assets.length > 0 && assets.every(item4LooksLikeVideoAsset);
    if (videoOnly && (currentStatus === "Preparing" || currentStatus === "Ready")) {
      const manifest = item4BuildDriveManifest(recordId, assets, ratios, [], planRatios);
      const missing = assets.filter((asset) => !item4VideoVariantReady(asset));
      let status = "Preparing";
      let error = null;
      if (manifest.plan_complete || manifest.complete) status = "Ready";
      else if (missing.length) {
        status = "Error";
        error = missing.length === assets.length
          ? "Those clips are not linked to Google Drive yet. Wait until they appear in the strip, then click Prepare again."
          : `${missing.length} clip${missing.length === 1 ? " is" : "s are"} not linked to Google Drive yet.`;
      }
      const now = new Date().toISOString();
      const updated = await item4UpdateRequestState(env, recordId, {
        Studio_Variant_Manifest_JSON: JSON.stringify(manifest),
        Studio_Variant_Status: status,
        Studio_Variant_Updated_At: status === "Ready" ? now : null,
        Studio_Variant_Error: error,
        Studio_Platform_Variant_Assets: [...new Set(
          assets.map((asset) => String(asset.media_asset_record_id || "").trim()).filter(Boolean)
        )],
        Studio_Item4_State: status === "Error" ? "Error" : "Plan Ready",
      });
      return { record: updated, status, error, manifest, queue_rows: [] };
    }
    if (currentStatus === "Preparing") {
      const missingDrive = assets.filter((asset) =>
        !String(asset?.google_drive_file_id || "").trim() || !String(asset?.media_asset_record_id || "").trim()
      );
      const error = !assets.length
        ? "Those photos and clips are not saved yet. Wait until they finish copying to Google Drive, then click Prepare."
        : (missingDrive.length
          ? `${missingDrive.length} file${missingDrive.length === 1 ? " has" : "s have"} not finished copying to Google Drive yet. Wait until they appear as saved, then click Prepare.`
          : "Prepare could not create platform frames. Click Prepare again after the files show as saved.");
      const updated = await item4UpdateRequestState(env, recordId, {
        Studio_Variant_Status: "Error",
        Studio_Variant_Error: error,
        Studio_Item4_State: "Error",
      });
      return { record: updated, status: "Error", error, manifest: null, queue_rows: [] };
    }
    const updated = await item4UpdateRequestState(env, recordId, {
      Studio_Variant_Manifest_JSON: null,
      Studio_Variant_Status: "None",
      Studio_Variant_Updated_At: null,
      Studio_Variant_Error: null,
      Studio_Platform_Variant_Assets: [],
      Studio_Item4_State: "Plan Ready",
    });
    return { record: updated, status: "None", error: null, manifest: null, queue_rows: [] };
  }

  const planExpectedIds = new Set(
    assets.flatMap((asset) => planRatios.map((ratio) => item4QueueTransferId(recordId, asset.id, ratio, asset)))
  );
  const authorityHeals = scoped
    .filter((row) => item4QueueStatus(row) !== "Ready" && item4QueueRowHasAuthority(row))
    .map((row) => ({
      id: row.id,
      fields: { Transfer_Status: "Ready", Error_Message: null },
      row,
    }));
  if (authorityHeals.length) {
    try {
      const healedRows = await airtableBatchUpdate(
        env,
        ITEM4_VARIANT_QUEUE_TABLE,
        authorityHeals.map(({ id, fields }) => ({ id, fields })),
        { typecast: true }
      );
      const byId = new Map(healedRows.map((row) => [row.id, row]));
      for (const item of authorityHeals) {
        const healed = byId.get(item.id);
        if (healed?.fields) Object.assign(item.row.fields || (item.row.fields = {}), healed.fields);
        else if (item.row.fields) {
          item.row.fields.Transfer_Status = "Ready";
          item.row.fields.Error_Message = null;
        }
      }
    } catch (error) {
      console.warn("Item 4 authority heal batch failed", error);
    }
  }

  const planFailed = scoped.filter((row) =>
    planExpectedIds.has(String(f(row, "Transfer_ID") || "").trim())
    && ["Failed", "Error"].includes(item4QueueStatus(row))
    && !item4QueueRowHasAuthority(row)
  );
  const pending = scoped.filter((row) =>
    ["Pending", "Drive Uploaded", "Processing"].includes(item4QueueStatus(row))
  );
  const planPending = pending.filter((row) => planExpectedIds.has(String(f(row, "Transfer_ID") || "").trim()));

  // A Ready crop with a blank Preview_Status is invisible to the preview drain
  // scan, so it never gets the public CDN copy that Remotion needs. Claim it.
  const previewBackfills = scoped
    .filter((row) => item4QueueStatus(row) === "Ready" && !String(f(row, "Preview_Status") || "").trim())
    .map((row) => ({ id: row.id, fields: { Preview_Status: "Pending" }, row }));
  if (previewBackfills.length) {
    try {
      await airtableBatchUpdate(
        env,
        ITEM4_VARIANT_QUEUE_TABLE,
        previewBackfills.map(({ id, fields }) => ({ id, fields })),
        { typecast: true }
      );
      for (const item of previewBackfills) {
        if (item.row.fields) item.row.fields.Preview_Status = "Pending";
      }
    } catch (error) {
      console.warn("Item 4 preview backfill batch failed", error);
    }
  }

  const manifest = item4BuildDriveManifest(recordId, assets, ratios, scoped, planRatios);
  const mediaAssetIds = [...new Set(
    scoped.filter((row) => item4QueueRowCountsReady(row))
      .map(item4QueueMediaAssetId)
      .filter(Boolean)
  )];

  if (!options.skipSanitize && mediaAssetIds.length) {
    await mapPool(mediaAssetIds, 8, async (mediaAssetId) => {
      try {
        await item4SanitizeStudioImageMediaAsset(env, mediaAssetId);
      } catch (error) {
        console.warn("Item 4 media sanitize deferred", mediaAssetId, error);
      }
    });
  }

  const now = new Date().toISOString();
  let status = "Preparing";
  let error = null;
  if (planFailed.length && !planPending.length) {
    status = "Error";
    error = planFailed
      .map((row) => String(f(row, "Error_Message") || "Variant generation failed"))
      .filter(Boolean)
      .join(" | ")
      .slice(0, 10000);
  } else if (manifest.plan_complete) {
    // Plan ratios (usually 9:16) are enough for packaging / Remotion.
    // Extra cover ratios such as YouTube 16:9, or leftover plan rebuild jobs,
    // may stay Pending in the background. Do not block Ready / Approve on them.
    status = "Ready";
  } else if (manifest.complete) {
    status = "Ready";
  }

  const updated = await item4UpdateRequestState(env, recordId, {
    Studio_Variant_Manifest_JSON: JSON.stringify(manifest),
    Studio_Variant_Status: status,
    Studio_Variant_Updated_At: status === "Ready" ? now : null,
    Studio_Variant_Error: error,
    Studio_Platform_Variant_Assets: mediaAssetIds,
    Studio_Item4_State: status === "Error" ? "Error" : "Plan Ready",
  });

  return { record: updated, status, error, manifest, queue_rows: scoped };
}
/*__STUDIO_WORKER_END:item4ReconcileVariants__*/

export async function runItem4VariantPrepareCore(env, recordId, authorization, options = {}) {
  const {
    cropsPayload = {},
    ctx = null,
    syncBudgetMs = ITEM4_DRAIN_POST_BUDGET_MS,
    syncRunCap = 8,
    allowBackground = true,
    forceRetry = false,
  } = options;

  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  let assets = item4MergeAssetCrops(item4AssetManifest(record), cropsPayload)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  if (!assets.length) {
    throw new HttpError(
      409,
      "Those photos and clips are not saved yet. Wait until they finish copying to Google Drive, then click Prepare."
    );
  }

  if (Object.keys(cropsPayload).length && assets.length) {
    record = await item4UpdateRequestState(env, recordId, {
      Studio_Master_Assets_JSON: JSON.stringify(assets),
    });
    assets = item4AssetManifest(record).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }

  const plan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  if (f(record, "Studio_Output_Plan_Status") !== "Ready" || !plan?.items?.length) {
    throw new HttpError(409, "Build a complete platform output plan before preparing platform media");
  }

  const ratios = item4RequiredRatios(plan);
  if (!ratios.length) throw new HttpError(409, "The platform output plan does not contain any supported image ratios");

  let masterAuthority = await item4ReconcileMasterAuthority(env, recordId, record);
  record = masterAuthority.record;
  let authoritativeAssets = masterAuthority.assets.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  const missingDrive = authoritativeAssets.filter((asset) =>
    !String(asset?.google_drive_file_id || "").trim() || !String(asset?.media_asset_record_id || "").trim()
  );
  if (missingDrive.length) {
    await item4UpsertMasterQueue(env, recordId, authoritativeAssets);
    try {
      await item4DrainVariantWorker(
        env,
        recordId,
        Math.min(syncRunCap, Math.max(2, missingDrive.length + 2)),
        { maxMs: syncBudgetMs }
      );
    } catch (error) {
      console.warn("Item 4 master-media drain deferred during platform prepare", error);
    }
    masterAuthority = await item4ReconcileMasterAuthority(env, recordId);
    record = masterAuthority.record;
    authoritativeAssets = masterAuthority.assets.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }

  const stillMissing = authoritativeAssets.filter((asset) =>
    !String(asset?.google_drive_file_id || "").trim() || !String(asset?.media_asset_record_id || "").trim()
  );
  if (stillMissing.length) {
    const clips = stillMissing.filter(item4LooksLikeVideoAsset).length;
    const noun = clips === stillMissing.length ? "clip" : (clips ? "file" : "photo");
    throw new HttpError(
      409,
      `${stillMissing.length} ${noun}${stillMissing.length === 1 ? " has" : "s have"} not finished copying to Google Drive yet. Wait until ${stillMissing.length === 1 ? "it appears" : "they appear"} in the strip, then click Prepare again.`
    );
  }

  authoritativeAssets = item4MergeAssetCrops(authoritativeAssets, cropsPayload);

  const outputRows = await outputRowsForProductionRequest(env, recordId);
  await item4UpdateRequestState(env, recordId, {
    Studio_Variant_Status: "Preparing",
    Studio_Variant_Error: null,
    Studio_Item4_State: "Plan Ready",
  });

  const expected = await item4UpsertVariantQueue(
    env,
    recordId,
    authoritativeAssets,
    ratios,
    outputRows,
    plan,
    { forceRetry }
  );
  let reconciled = await item4ReconcileVariants(env, recordId);

  // Prefer a short sync pulse, then finish in waitUntil/cron so Prepare returns
  // while crops continue instead of holding the HTTP request for the full budget.
  const backgroundOk = allowBackground && ctx && typeof ctx.waitUntil === "function";
  const effectiveBudgetMs = backgroundOk ? Math.min(Number(syncBudgetMs) || 0, 8000) : syncBudgetMs;
  const effectiveRunCap = backgroundOk ? Math.min(Number(syncRunCap) || 1, 2) : syncRunCap;

  if (reconciled.status === "Preparing") {
    try {
      const executionIds = await item4DrainVariantWorker(
        env,
        recordId,
        Math.min(effectiveRunCap, Math.max(2, expected.length + 2)),
        { maxMs: effectiveBudgetMs }
      );
      reconciled = await item4ReconcileVariants(env, recordId);
      reconciled.execution_ids = executionIds;
    } catch (error) {
      console.warn("Item 4 platform variant drain deferred to background/status polling", error);
    }
  }

  if (backgroundOk && reconciled.status === "Preparing") {
    ctx.waitUntil((async () => {
      try {
        await item4DrainVariantWorker(
          env,
          recordId,
          Math.min(20, Math.max(4, expected.length + 8)),
          { maxMs: ITEM4_DRAIN_BACKGROUND_BUDGET_MS }
        );
        await item4ReconcileVariants(env, recordId);
      } catch (error) {
        console.warn("Item 4 background variant drain deferred", error);
      }
    })());
  }

  if (reconciled.status === "Ready") {
    const previewWork = async () => {
      try {
        await item4DrainPreviewCacheWorker(
          env,
          recordId,
          Math.min(12, Math.max(4, reconciled.manifest.target_count + authoritativeAssets.length + 2))
        );
        await item4ReconcileMasterAuthority(env, recordId);
        await item4ReconcileVariants(env, recordId);
      } catch (error) {
        console.warn("Platform browser preview-cache creation failed without affecting Drive authority", error);
      }
    };
    // Preview CDN copies must not block Ready / Approve.
    if (backgroundOk) ctx.waitUntil(previewWork());
    else await previewWork();
  }

  return { record: reconciled.record || record, reconciled, authoritativeAssets, expected };
}
/*__STUDIO_WORKER_END:runItem4VariantPrepareCore__*/

export async function ensureItem4VariantsReadyForPromotion(env, recordId, record, authorization, ctx = null) {
  if (studioIsFinishedPassthrough(record) || studioFinishedVariantsSkipped(record)) return record;
  if (autonomousPlanVariantsReady(record)) return record;
  const variantStatus = String(f(record, "Studio_Variant_Status") || "").trim();
  if (variantStatus === "Ready" || variantStatus === "Not Needed") return record;
  if (String(f(record, "Studio_Output_Plan_Status") || "").trim() !== "Ready") return record;
  if (!item4AssetManifest(record).length) return record;

  const { reconciled } = await runItem4VariantPrepareCore(env, recordId, authorization, {
    ctx,
    syncBudgetMs: ITEM4_DRAIN_PROMOTE_BUDGET_MS,
    syncRunCap: 20,
    allowBackground: true,
  });

  let current = reconciled.record;
  if (reconciled.status === "Preparing") {
    const resumed = await item4ResumePendingVariants(env, recordId, current);
    current = resumed.record || current;
    const again = await item4ReconcileVariants(env, recordId, current);
    if (again.status === "Ready") return again.record;
    if (again.status === "Error") {
      throw new HttpError(409, again.error || "Platform media preparation failed before promotion.");
    }
    throw new HttpError(409, "Platform media preparation is still running. Wait a moment and Approve again.");
  }
  if (reconciled.status === "Error") {
    throw new HttpError(409, reconciled.error || "Platform media preparation failed before promotion.");
  }
  return reconciled.record;
}
/*__STUDIO_WORKER_END:ensureItem4VariantsReadyForPromotion__*/

export async function prepareItem4Variants(request, env, url, authorization, ctx = null) {
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }

  const recordId = item4RequestIdFromPath(url);
  const record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);

  const cropsPayload = payload?.crops && typeof payload.crops === "object" ? payload.crops : {};
  const { reconciled } = await runItem4VariantPrepareCore(env, recordId, authorization, {
    cropsPayload,
    ctx,
    syncBudgetMs: ITEM4_DRAIN_POST_BUDGET_MS,
    syncRunCap: 8,
    allowBackground: true,
    forceRetry: Boolean(payload?.retry),
  });

  const ready = reconciled.status === "Ready";
  const failed = reconciled.status === "Error";
  return respond(request, env, {
    ok: !failed,
    status: reconciled.status,
    manifest: reconciled.manifest,
    progress: {
      ready: reconciled.manifest?.ready_count || 0,
      target: reconciled.manifest?.target_count || 0,
    },
    error: reconciled.error,
    production_request: mapProductionRequest(reconciled.record),
    message: ready
      ? (item4HasVideoMasters(item4AssetManifest(reconciled.record))
        ? `${reconciled.manifest.ready_count} clip frame${reconciled.manifest.ready_count === 1 ? " is" : "s are"} ready. Clips skip photo crops.`
        : `${reconciled.manifest.ready_count} platform-ready Google Drive variants are ready.`)
      : failed
        ? (reconciled.error || "Platform media preparation failed. See error.")
        : (item4HasVideoMasters(item4AssetManifest(reconciled.record))
          ? `Attaching ${reconciled.manifest?.ready_count || 0} of ${reconciled.manifest?.target_count || 0} clip frames…`
          : "Platform media preparation is still running."),
  }, failed ? 409 : ready ? 200 : 202);
}
/*__STUDIO_WORKER_END:prepareItem4Variants__*/

export async function getItem4Variants(request, env, url, authorization, ctx = null) {
  const recordId = item4RequestIdFromPath(url);
  const record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  const reconciled = await item4ReconcileVariants(env, recordId, record);
  // Same parked-cadence hole as GET /assets: reconcile cannot create Drive
  // checkpoints. Seed and Studio poll this route; without a resume, leftover
  // Pending crops sit forever when cron's media drain loses the subrequest race.
  if (reconciled.status === "Preparing" && ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil((async () => {
      try {
        await item4ResumePendingVariants(env, recordId, reconciled.record);
      } catch (error) {
        console.warn("Item 4 variant poll resume deferred", error);
      }
    })());
  }
  return respond(request, env, {
    ok: true,
    status: reconciled.status,
    updated_at: f(reconciled.record, "Studio_Variant_Updated_At") || null,
    error: reconciled.error,
    manifest: reconciled.manifest,
    progress: {
      ready: reconciled.manifest.ready_count,
      target: reconciled.manifest.target_count,
    },
  });
}
/*__STUDIO_WORKER_END:getItem4Variants__*/

export async function item4ResumePendingMasterAuthority(env, recordId, record = null) {
  let currentRecord = record || await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  let assets = item4AssetManifest(currentRecord).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  if (studioFinishedOriginKind(currentRecord) === "finished-video") {
    return {
      attempted: false,
      reason: "finished-video-passthrough",
      record: currentRecord,
      assets,
      execution_ids: [],
    };
  }

  const incomplete = assets.filter((asset) =>
    !String(asset?.google_drive_file_id || "").trim() ||
    !String(asset?.media_asset_record_id || "").trim()
  );

  if (!incomplete.length) {
    return {
      attempted: false,
      reason: "all-master-authority-ready",
      record: currentRecord,
      assets,
      execution_ids: [],
    };
  }

  // Recreate/re-arm any missing or failed master queue rows idempotently.
  // Existing Ready / Drive Uploaded / Processing checkpoints are preserved.
  await item4UpsertMasterQueue(env, recordId, assets);

  let rows = await item4RequeueStaleProcessing(env, await item4MasterQueueRows(env, recordId));
  const outstanding = rows.filter((row) =>
    ["Pending", "Drive Uploaded", "Processing"].includes(item4QueueStatus(row))
  );

  if (!outstanding.length) {
    const reconciled = await item4ReconcileMasterAuthority(env, recordId, currentRecord);
    return {
      attempted: false,
      reason: "no-runnable-master-queue-items",
      record: reconciled.record,
      assets: reconciled.assets,
      execution_ids: [],
    };
  }

  // Drive Uploaded masters already have the Google Drive file. SMV1's production
  // selector only matches Pending, so pulsing it here is a no-op that can 1101
  // the status request and leave Module 1 pinned to this Production Request.
  // Reconcile those rows in Studio. Only seize SMV1 when a master is still Pending.
  const needsSmv1 = outstanding.filter((row) =>
    ["Pending", "Processing"].includes(item4QueueStatus(row))
  );
  const executionIds = [];
  if (needsSmv1.length) {
    try {
      const maxRuns = Math.min(6, Math.max(1, needsSmv1.length));
      const drained = await item4DrainVariantWorker(env, recordId, maxRuns, { maxMs: ITEM4_DRAIN_STATUS_BUDGET_MS });
      if (Array.isArray(drained)) executionIds.push(...drained);
    } catch (error) {
      console.warn("Item 4 master-media drain deferred during resume", error);
    }
  }
  const reconciled = await item4ReconcileMasterAuthority(env, recordId);

  return {
    attempted: true,
    reason: "pending-master-authority-resumed",
    record: reconciled.record,
    assets: reconciled.assets,
    execution_ids: executionIds,
    authority_status: reconciled.status,
    ready_count: reconciled.ready_count,
    target_count: reconciled.target_count,
  };
}
/*__STUDIO_WORKER_END:item4ResumePendingMasterAuthority__*/

export async function item4ResumePendingVariants(env, recordId, record = null) {
  let currentRecord = record || await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const plan = item4ParseJson(f(currentRecord, "Studio_Output_Plan_JSON"), null);
  const assets = item4AssetManifest(currentRecord).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const ratios = item4RequiredRatios(plan || {});
  if (!assets.length || !ratios.length) {
    return { attempted: false, reason: "no-variant-plan", record: currentRecord, execution_ids: [] };
  }

  // Critical guard: do not auto-create variant work here. A variant row must
  // already exist, which proves the user explicitly invoked Prepare platform
  // media (or a prior prepare run created the work). This preserves the v0.9.6
  // explicit state-transition correction.
  const queueRows = await item4VariantQueueRows(env, recordId);
  const expectedIds = new Set(
    item4ExpectedVariantKeys(recordId, assets, plan || {}).map((row) => row.transfer_id)
  );
  let scoped = queueRows.filter((row) => expectedIds.has(String(f(row, "Transfer_ID") || "").trim()));
  if (!scoped.length) {
    return { attempted: false, reason: "prepare-not-started", record: currentRecord, execution_ids: [] };
  }

  // Photos added after Prepare can sit at 23/27 forever: drain only sees existing
  // queue rows, and this resume path used to refuse to create the missing ones.
  const parentStatus = String(f(currentRecord, "Studio_Variant_Status") || "").trim();
  const missingKeys = [...expectedIds].filter((id) => !scoped.some((row) => String(f(row, "Transfer_ID") || "").trim() === id));
  if (missingKeys.length && (parentStatus === "Preparing" || parentStatus === "Error")) {
    const outputRows = await outputRowsForProductionRequest(env, recordId);
    await item4UpsertVariantQueue(env, recordId, assets, ratios, outputRows, plan);
    const refreshed = await item4VariantQueueRows(env, recordId);
    scoped = refreshed.filter((row) => expectedIds.has(String(f(row, "Transfer_ID") || "").trim()));
  }

  // Match Production "Retry remaining": Failed/Error leftovers and stalled
  // Processing claims become Pending again before we drain SMV1.
  scoped = await item4RequeueFailedVariantsForHeal(env, scoped);
  scoped = await item4RequeueStaleProcessing(env, scoped);

  if (parentStatus === "Error") {
    currentRecord = await item4UpdateRequestState(env, recordId, {
      Studio_Variant_Status: "Preparing",
      Studio_Variant_Error: null,
      Studio_Item4_State: "Plan Ready",
    });
  }

  const outstanding = scoped.filter(item4QueueRowIsOutstanding);
  if (!outstanding.length) {
    const reconciled = await item4ReconcileVariants(env, recordId, currentRecord);
    const ready = reconciled.status === "Ready";
    return {
      attempted: ready,
      reason: ready ? "reconciled-ready" : "no-pending-variants",
      record: reconciled.record,
      execution_ids: [],
      variant_status: reconciled.status,
      ready_count: Number(reconciled.manifest?.ready_count || 0),
      target_count: Number(reconciled.manifest?.target_count || 0),
    };
  }

  // Large prepare batches (many photos × ratios) need more drain slots than the
  // old 20-cap or the browser poll window expires and asks for a manual Retry.
  const maxRuns = Math.min(40, Math.max(4, outstanding.length + 4));
  const executionIds = await item4DrainVariantWorker(env, recordId, maxRuns, { maxMs: ITEM4_DRAIN_CRON_BUDGET_MS });
  const reconciled = await item4ReconcileVariants(env, recordId);
  return {
    attempted: true,
    reason: "pending-variants-resumed",
    record: reconciled.record,
    execution_ids: executionIds,
    variant_status: reconciled.status,
    ready_count: Number(reconciled.manifest?.ready_count || 0),
    target_count: Number(reconciled.manifest?.target_count || 0),
  };
}
/*__STUDIO_WORKER_END:item4ResumePendingVariants__*/

export function item4TimelineAutoPrepareEligible(record) {
  if (!record?.id) return false;
  const notes = String(f(record, "Production_Notes") || "");
  if (!/idea-vo-timeline=/i.test(notes) && !/\[timed-script\]\s*\{/i.test(notes)) return false;
  const requestStatus = String(f(record, "Request_Status") || "").trim();
  if (!["Draft", "Ready"].includes(requestStatus)) return false;
  if (productionRequestRevisionOpen(record)) return false;
  if (String(f(record, "Studio_Output_Plan_Status") || "").trim() !== "Ready") return false;
  const variantStatus = String(f(record, "Studio_Variant_Status") || "").trim() || "None";
  if (variantStatus !== "None") return false;
  const plan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  if (!plan?.items?.length) return false;
  const assets = item4AssetManifest(record);
  return assets.length > 0;
}
/*__STUDIO_WORKER_END:item4TimelineAutoPrepareEligible__*/

export async function item4HealTimelineAutoPrepare(env, ctx = null) {
  const authorization = await resolveStudioCronAuthorization(env).catch((error) => {
    console.warn("timeline auto-prepare auth failed", error);
    return null;
  });
  if (!authorization?.authorized) return [];

  const rows = await listRecords(env, PRODUCTION_REQUEST_TABLE, {
    limit: 8,
    sortField: "Updated_At",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),OR({Request_Status}="Draft",{Request_Status}="Ready"),{Studio_Output_Plan_Status}="Ready",OR({Studio_Variant_Status}="None",{Studio_Variant_Status}=BLANK()),OR(FIND("idea-vo-timeline=",{Production_Notes}),FIND("[timed-script]",{Production_Notes})))',
  }).catch(() => []);

  const pulses = [];
  for (const row of rows || []) {
    if (!item4TimelineAutoPrepareEligible(row)) continue;
    try {
      // Resume refuses to create the first queue rows (prepare-not-started).
      // Explicitly start Prepare the same way Create Timeline's waitUntil does.
      const variantsCall = studioInternalJsonRequest(`/api/production-requests/${row.id}/variants`, {});
      const result = await prepareItem4Variants(
        variantsCall.request,
        env,
        variantsCall.url,
        authorization,
        ctx
      );
      pulses.push({
        id: row.id,
        reason: "timeline-auto-prepare",
        status: result?.status || null,
        ready: result?.progress?.ready ?? null,
        target: result?.progress?.target ?? null,
      });
    } catch (error) {
      pulses.push({
        id: row.id,
        reason: "timeline-auto-prepare",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (pulses.length) {
    console.log("Studio timeline auto-prepare heal", JSON.stringify({ count: pulses.length, pulses }));
  }
  return pulses;
}
/*__STUDIO_WORKER_END:item4HealTimelineAutoPrepare__*/

export async function item4HealIncompletePreparingVariants(env) {
  const [preparing, errored] = await Promise.all([
    listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: 12,
      sortField: "Updated_At",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Studio_Variant_Status}="Preparing")',
    }).catch(() => []),
    listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: 8,
      sortField: "Updated_At",
      sortDirection: "desc",
      filterFormula: 'AND({Test_Run_ID}=BLANK(),{Studio_Variant_Status}="Error")',
    }).catch(() => []),
  ]);
  const seen = new Set();
  const rows = [];
  for (const row of [...(preparing || []), ...(errored || [])]) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  const pulses = [];
  for (const row of rows) {
    try {
      const result = await item4ResumePendingVariants(env, row.id, row);
      if (result?.attempted) {
        pulses.push({
          id: row.id,
          reason: result.reason,
          ready: result.ready_count,
          target: result.target_count,
          status: result.variant_status,
        });
      } else if (result?.reason) {
        pulses.push({ id: row.id, reason: result.reason, attempted: false });
      }
    } catch (error) {
      pulses.push({ id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (pulses.length) console.log("Studio preparing variant-gap heal", JSON.stringify({ count: pulses.length, pulses }));
  return pulses;
}
/*__STUDIO_WORKER_END:item4HealIncompletePreparingVariants__*/

export async function getItem4WorkspaceStatus(request, env, url, authorization, ctx = null) {
  const recordId = item4RequestIdFromPath(url);

  // Workspace GET stays a fast read. If crops are still Preparing, waitUntil
  // resumes SMV1 so leftover Pending rows cannot sit at 14/15 until a human pulses.
  let makeHardening = { skipped: "workspace-read" };
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  let assets = item4AssetManifest(record).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  // Saved-state reopen: completed drafts do not need queue reconciliation,
  // Airtable mutation, preview polling, or crop relinking just to display
  // their already-authoritative frames. This also isolates the editor from
  // transient Make/Drive/queue dependency errors on mobile.
  if (url.searchParams.get("snapshot") === "1") {
    const manifest = item4VariantManifest(record);
    return respond(request, env, {
      ok: true,
      snapshot: true,
      state: f(record, "Studio_Item4_State") || "Draft",
      assets_status: f(record, "Studio_Master_Asset_Status") || "None",
      assets,
      plan_status: f(record, "Studio_Output_Plan_Status") || "Needs Plan",
      plan: item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null),
      variant_status: f(record, "Studio_Variant_Status") || "None",
      variant_updated_at: f(record, "Studio_Variant_Updated_At") || null,
      variant_error: f(record, "Studio_Variant_Error") || null,
      variants: manifest,
      variant_progress: manifest ? {
        ready: Number(manifest.ready_count || 0),
        target: Number(manifest.target_count || 0),
      } : null,
      request_status: f(record, "Request_Status"),
      outputs: [],
      publish_status: item4ParseJson(f(record, "Studio_Publish_Status_JSON"), null),
    });
  }
  let masterAuthorityResume = { attempted: false, reason: "not-needed", execution_ids: [] };

  try {
    const masterAuthority = await item4ReconcileMasterAuthority(env, recordId, record);
    record = masterAuthority.record;
    assets = masterAuthority.assets.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    // Reconciliation can only consume checkpoints that SMV1 already produced.
    // If one or more masters are still missing Google Drive + Media Asset
    // authority, actively resume the queued handoff instead of reporting
    // "Uploading" forever. This is what allows Item 4's lightweight browser
    // polling to self-heal a partially drained upload without a page reload or
    // a user retry.
    if (masterAuthority.status === "Uploading") {
      masterAuthorityResume = await item4ResumePendingMasterAuthority(env, recordId, record);
      record = masterAuthorityResume.record || record;
      assets = (masterAuthorityResume.assets || assets)
        .slice()
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    }
    const needsClipPoster = assets.some((asset) => item4LooksLikeVideoAsset(asset) && !item4LooksLikeImagePreviewUrl(asset?.poster_url));
    if (needsClipPoster && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil((async () => {
        try {
          await item4BuildClipPostersLocally(env, recordId);
        } catch (error) {
          console.warn("Item 4 local clip poster deferred", error);
        }
        try {
          await item4PulseClipPosterJob(env, recordId);
        } catch (error) {
          console.warn("Item 4 clip poster job deferred", error);
        }
        try {
          await item4DrainPreviewCacheWorker(env, recordId, 4);
          await item4ReconcileMasterAuthority(env, recordId);
        } catch (error) {
          console.warn("Item 4 clip poster drain deferred", error);
        }
      })());
    }
    const staleCompression = item4HealStaleCompressionAssets(assets);
    if (staleCompression.changed) {
      assets = staleCompression.assets.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      const masterReady = String(f(record, "Studio_Master_Asset_Status") || "").trim() === "Ready";
      const patchFields = {
        Studio_Master_Assets_JSON: JSON.stringify(assets),
      };
      if (masterReady && !item4AssetsNeedStudioCompress(assets)) {
        patchFields.Studio_Item4_State = "Assets Ready";
      }
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(item4UpdateRequestState(env, recordId, patchFields).catch((error) => {
          console.warn("Item 4 stale compression heal deferred", error);
        }));
      } else {
        try {
          record = await item4UpdateRequestState(env, recordId, patchFields);
        } catch (error) {
          console.warn("Item 4 stale compression heal failed", error);
        }
      }
    }
    if (item4AssetsNeedStudioCompress(assets) && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(item4PulseStudioCompressJob(env, recordId).catch((error) => {
        console.warn("Item 4 studio-compress pulse deferred from workspace status", error);
      }));
    }
    if (studioIsAzFinishedVideo(record) && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(advanceAzFinishedVideo(env, recordId, authorization, ctx).catch((error) => {
        console.warn("AZ finished-video advance deferred from compress workspace", recordId, error);
      }));
    }
  } catch (error) {
    masterAuthorityResume = {
      attempted: false,
      reason: "resume-deferred",
      execution_ids: [],
      error: error instanceof Error ? error.message : String(error),
    };
    console.warn("Item 4 master authority self-heal deferred from workspace status", error);
  }
  const plan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);

  let variantResume = { attempted: false, reason: "not-needed", execution_ids: [] };
  if (plan?.items?.length) {
    try {
      let reconciled = await item4ReconcileVariants(env, recordId, record, { skipSanitize: true });
      record = reconciled.record;
      if (reconciled.status === "Preparing" && ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil((async () => {
          try {
            await item4ResumePendingVariants(env, recordId, reconciled.record);
          } catch (error) {
            console.warn("Item 4 workspace variant resume deferred", error);
          }
        })());
        variantResume = { attempted: true, reason: "preparing-waituntil", execution_ids: [] };
      } else if (reconciled.status === "Ready") {
        try {
          record = await item4RelinkVariantQueueOutputs(env, reconciled.record);
        } catch (error) {
          console.warn("Item 4 destination relink deferred from Ready workspace", error);
        }
      }
    } catch (error) {
      variantResume = {
        attempted: false,
        reason: "resume-deferred",
        execution_ids: [],
        error: error instanceof Error ? error.message : String(error),
      };
      console.warn("Item 4 platform variant self-heal deferred from workspace status", error);
    }
  }

  let previewPendingCount = 0;
  try {
    const pendingPreviews = await item4PreviewPendingRows(env, recordId);
    previewPendingCount = pendingPreviews.length;
  } catch (error) {
    console.warn("Item 4 browser preview pending count failed without affecting production state", error);
  }

  const rows = await outputRowsForProductionRequest(env, recordId);
  const outputs = rows.filter((r) => Boolean(f(r, "Enabled"))).map((row) => ({
    ...mapProductionRequestOutput(row, record),
    platform_output: null,
  }));

  const assetsStatus = f(record, "Studio_Master_Asset_Status") || "None";
  const variantStatus = studioIsFinishedPassthrough(record)
    ? (String(f(record, "Studio_Variant_Status") || "") === "Ready" ? "Ready" : "Not Needed")
    : (f(record, "Studio_Variant_Status") || "None");
  if (
    ctx
    && typeof ctx.waitUntil === "function"
    && assetsStatus === "Ready"
    && (variantStatus === "Ready" || variantStatus === "Not Needed")
    && String(f(record, "Request_Status") || "").trim() === "Promoted"
  ) {
    ctx.waitUntil(enqueueStudioProductionJob(env, recordId).catch((error) => {
      console.warn("Item 4 produce enqueue after variants ready failed", recordId, error);
    }));
  }
  const previewSelfHealState = assetsStatus === "Error" || variantStatus === "Error"
    ? "error"
    : assetsStatus === "Uploading"
      ? "uploading"
      : (variantStatus === "Preparing" || previewPendingCount > 0)
        ? "preview_pending"
        : (masterAuthorityResume?.attempted || variantResume?.attempted)
          ? "retrying"
          : (assetsStatus === "Ready" && (variantStatus === "Ready" || variantStatus === "None" || variantStatus === "Not Needed"))
            ? "ready"
            : "idle";

  const manifest = item4VariantManifest(record);
  return respond(request, env, {
    ok: true,
    state: f(record, "Studio_Item4_State") || "Draft",
    assets_status: assetsStatus,
    assets,
    plan_status: f(record, "Studio_Output_Plan_Status") || "Needs Plan",
    plan,
    variant_status: variantStatus,
    variant_updated_at: f(record, "Studio_Variant_Updated_At") || null,
    variant_error: f(record, "Studio_Variant_Error") || null,
    variants: manifest,
    variant_progress: manifest ? { ready: Number(manifest.ready_count || 0), target: Number(manifest.target_count || 0) } : null,
    variant_resume: variantResume,
    make_hardening: makeHardening,
    make_hardening_worker_build: "0.10.42",
    master_authority_resume: masterAuthorityResume,
    preview_self_heal: {
      schema: "upload-preview-self-heal-v1",
      observable_state: previewSelfHealState,
      preview_pending_count: previewPendingCount,
      master_resume_attempted: Boolean(masterAuthorityResume?.attempted),
      variant_resume_attempted: Boolean(variantResume?.attempted),
      hard_refresh_required: false,
    },
    request_status: f(record, "Request_Status"),
    outputs,
    publish_status: item4ParseJson(f(record, "Studio_Publish_Status_JSON"), null),
  });
}
/*__STUDIO_WORKER_END:getItem4WorkspaceStatus__*/

export function canonicalProductionPlatform(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (PR_PLATFORMS.has(raw)) return raw;
  return PR_PLATFORM_ALIASES.get(raw.toLowerCase()) || raw;
}
/*__STUDIO_WORKER_END:canonicalProductionPlatform__*/

export function canonicalProductionPlatforms(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(canonicalProductionPlatform)
    .filter(Boolean))];
}/*__STUDIO_WORKER_END:canonicalProductionPlatforms__*/

export function ideaRecordIdFromProductionRequest(record) {
  const links = Array.isArray(f(record, "Idea_Candidate")) ? f(record, "Idea_Candidate") : [];
  return String(links[0] || "").trim() || null;
}
/*__STUDIO_WORKER_END:ideaRecordIdFromProductionRequest__*/

export function uniqueIdeaRecordIds(ideaIds) {
  return [...new Set((Array.isArray(ideaIds) ? ideaIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
}
/*__STUDIO_WORKER_END:uniqueIdeaRecordIds__*/

export async function loadIdeaListMetaByRecordId(env, ideaIds) {
  const unique = uniqueIdeaRecordIds(ideaIds);
  const titles = new Map();
  const photoWait = new Map();
  const chunks = [];
  for (let index = 0; index < unique.length; index += 40) chunks.push(unique.slice(index, index + 40));
  await Promise.all(chunks.map(async (chunk) => {
    const formula = `OR(${chunk.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    try {
      const rows = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
        limit: chunk.length,
        filterFormula: formula,
        fields: ["Candidate_Title", "Studio_Photo_Wait_Status"],
      });
      for (const row of rows) {
        const title = String(f(row, "Candidate_Title") || "").trim();
        if (title) titles.set(row.id, title);
        photoWait.set(row.id, String(f(row, "Studio_Photo_Wait_Status") || "").trim());
      }
    } catch (error) {
      console.warn("Idea list meta lookup skipped", error);
    }
  }));
  return { titles, photoWait };
}
/*__STUDIO_WORKER_END:loadIdeaListMetaByRecordId__*/

export async function loadIdeaTitlesByRecordId(env, ideaIds) {
  const { titles } = await loadIdeaListMetaByRecordId(env, ideaIds);
  return titles;
}
/*__STUDIO_WORKER_END:loadIdeaTitlesByRecordId__*/

export async function loadIdeaPhotoWaitStatesByRecordId(env, ideaIds) {
  const { photoWait } = await loadIdeaListMetaByRecordId(env, ideaIds);
  return photoWait;
}
/*__STUDIO_WORKER_END:loadIdeaPhotoWaitStatesByRecordId__*/

export function mapProductionRequest(record, ideaTitle = null) {
  const links = (name) => Array.isArray(f(record, name)) ? f(record, name) : [];
  return {
    id: record.id,
    production_request_id: f(record, "Production_Request_ID"),
    test_run_id: f(record, "Test_Run_ID") || null,
    idea_candidate_links: links("Idea_Candidate"),
    idea_record_id: links("Idea_Candidate")[0] || null,
    idea_title: ideaTitle || String(f(record, "Idea_Title") || "").trim() || null,
    organization_links: links("Organization"),
    brand_links: links("Brand"),
    created_by_links: links("Created_By"),
    status: f(record, "Request_Status"),
    content_type: f(record, "Master_Content_Type"),
    platforms: f(record, "Target_Platforms") || [],
    voiceover_mode: f(record, "Voiceover_Mode"),
    voice_id: f(record, "Voice_ID") || null,
    voice_name: f(record, "Voice_Name") || null,
    background_music_mode: f(record, "Background_Music_Mode"),
    thumbnail_mode: f(record, "Thumbnail_Mode"),
    video_duration_seconds: f(record, "Video_Duration_Seconds"),
    voiceover_duration_seconds: f(record, "Voiceover_Duration_Seconds"),
    music_start_seconds: f(record, "Music_Start_Seconds"),
    video_clip_count_mode: f(record, "Video_Clip_Count_Mode"),
    video_clip_count_exact: f(record, "Video_Clip_Count_Exact"),
    video_clip_count_min: f(record, "Video_Clip_Count_Min"),
    video_clip_count_max: f(record, "Video_Clip_Count_Max"),
    carousel_slide_count_mode: f(record, "Carousel_Slide_Count_Mode"),
    carousel_slide_count_exact: f(record, "Carousel_Slide_Count_Exact"),
    carousel_slide_count_min: f(record, "Carousel_Slide_Count_Min"),
    carousel_slide_count_max: f(record, "Carousel_Slide_Count_Max"),
    carousel_image_mode: f(record, "Carousel_Image_Mode"),
    voiceover_tail_seconds: f(record, "Voiceover_Tail_Seconds"),
    selected_music_asset_links: links("Selected_Music_Asset"),
    title_mode: f(record, "Title_Mode"),
    requested_title: f(record, "Requested_Title"),
    caption_mode: f(record, "Caption_Mode"),
    requested_caption: f(record, "Requested_Caption"),
    script_mode: f(record, "Script_Mode"),
    requested_script: f(record, "Requested_Script"),
    primary_location: String(f(record, "Primary_Location") || "").trim() || null,
    production_notes: stripFactoryRevisionNote(f(record, "Production_Notes")),
    factory_review_feedback: factoryLatestReviewFeedback(f(record, "Production_Notes")),
    revision_open: productionRequestRevisionOpen(record),
    created_at: f(record, "Created_At"),
    updated_at: f(record, "Updated_At"),
    submitted_at: f(record, "Submitted_At"),
    promoted_content_item_links: links("Promoted_Content_Item"),
    active: Boolean(f(record, "Active")),
    studio_master_assets: item4ParseJson(f(record, "Studio_Master_Assets_JSON"), []),
    studio_master_asset_count: Number(f(record, "Studio_Master_Asset_Count") || 0),
    studio_master_asset_status: f(record, "Studio_Master_Asset_Status") || "None",
    studio_output_plan: item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null),
    studio_output_plan_status: f(record, "Studio_Output_Plan_Status") || "Needs Plan",
    studio_variant_manifest: item4ParseJson(f(record, "Studio_Variant_Manifest_JSON"), null),
    studio_variant_status: f(record, "Studio_Variant_Status") || "None",
    studio_variant_updated_at: f(record, "Studio_Variant_Updated_At") || null,
    studio_variant_error: f(record, "Studio_Variant_Error") || null,
    studio_item4_state: f(record, "Studio_Item4_State") || "Draft",
    studio_publish_batch_id: f(record, "Studio_Publish_Batch_ID") || null,
    studio_publish_requested_at: f(record, "Studio_Publish_Requested_At") || null,
    studio_publish_status: item4ParseJson(f(record, "Studio_Publish_Status_JSON"), null),
    studio_production_job: parseStudioProductionJob(record),
  };
}
/*__STUDIO_WORKER_END:mapProductionRequest__*/

export function productionRequestRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/production-requests\/(rec[A-Za-z0-9]+)/);
  if (!match) throw new HttpError(400, "Invalid Production Request record ID");
  return match[1];
}
/*__STUDIO_WORKER_END:productionRequestRecordIdFromPath__*/

export function makeProductionRequestId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PR-${stamp}-${random}`;
}
/*__STUDIO_WORKER_END:makeProductionRequestId__*/

export async function loadAuthorizedProductionRequest(env, recordId, authorization) {
  const record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const orgLinks = Array.isArray(f(record, "Organization")) ? f(record, "Organization") : [];
  const brandLinks = Array.isArray(f(record, "Brand")) ? f(record, "Brand") : [];

  if (!orgLinks.includes(authorization?.organization?.record_id) ||
      !membershipAllowsBrand(authorization, brandLinks)) {
    throw new HttpError(403, "Production Request is not part of the authorized Studio tenant/brand");
  }
  return record;
}
/*__STUDIO_WORKER_END:loadAuthorizedProductionRequest__*/

export function normalizeChoice(value, allowed, fallback, label) {
  const normalized = String(value ?? fallback ?? "").trim() || String(fallback || "");
  if (!allowed.has(normalized)) throw new HttpError(400, `${label} is invalid`);
  return normalized;
}
/*__STUDIO_WORKER_END:normalizeChoice__*/

export function nullableInt(value, min, max, label) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.trunc(n) !== n || n < min || n > max) {
    throw new HttpError(400, `${label} must be a whole number from ${min} to ${max}`);
  }
  return n;
}
/*__STUDIO_WORKER_END:nullableInt__*/

export function nullableWholeSeconds(value, min, max, label) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new HttpError(400, `${label} must be a whole number from ${min} to ${max}`);
  }
  const whole = Math.ceil(n - 1e-9);
  if (whole < min || whole > max) {
    throw new HttpError(400, `${label} must be a whole number from ${min} to ${max}`);
  }
  return whole;
}
/*__STUDIO_WORKER_END:nullableWholeSeconds__*/

export function nullableNumber(value, min, max, label) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${label} must be between ${min} and ${max}`);
  }
  return n;
}
/*__STUDIO_WORKER_END:nullableNumber__*/

export async function validateMusicAsset(env, recordId) {
  if (!recordId) return null;
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) throw new HttpError(400, "Selected music record ID is invalid");
  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  if (Boolean(f(record, "Do_Not_Use"))) throw new HttpError(409, "Selected music asset is marked Do Not Use");
  const assetType = String(f(record, "Asset Type") || "").toLowerCase();
  const assetRole = String(f(record, "Asset_Role") || "").toLowerCase();
  if (!assetType.includes("audio") && assetRole !== "music") {
    throw new HttpError(409, "Selected Media Asset is not a music/audio asset");
  }
  return record;
}
/*__STUDIO_WORKER_END:validateMusicAsset__*/

export function normalizeRequestedVoice(payload, voiceoverMode) {
  if (voiceoverMode !== "Yes") return { voice_id: null, voice_name: null };
  const voiceId = String(payload?.voice_id || payload?.selected_voice_id || "").trim().slice(0, 120) || PHASE6_DEFAULT_VOICE_ID;
  const suppliedName = String(payload?.voice_name || "").trim().slice(0, 80);
  const voiceName = suppliedName
    || (voiceId === PHASE6_GEORGE_VOICE_ID ? "George" : voiceId === PHASE6_DEFAULT_VOICE_ID ? "Kate" : voiceId);
  return { voice_id: voiceId, voice_name: voiceName };
}
/*__STUDIO_WORKER_END:normalizeRequestedVoice__*/

export function requestedVoiceFromProductionRequest(record) {
  const mode = String(f(record, "Voiceover_Mode") || "").trim();
  if (mode !== "Yes") return { voice_id: null, voice_name: null, voice_choice: null };
  const voiceId = String(f(record, "Voice_ID") || "").trim() || PHASE6_DEFAULT_VOICE_ID;
  const voiceName = String(f(record, "Voice_Name") || "").trim()
    || (voiceId === PHASE6_GEORGE_VOICE_ID ? "George" : voiceId === PHASE6_DEFAULT_VOICE_ID ? "Kate" : voiceId);
  const lower = voiceName.toLowerCase();
  const voiceChoice = voiceId === PHASE6_GEORGE_VOICE_ID || lower === "george"
    ? "George"
    : (voiceId === PHASE6_DEFAULT_VOICE_ID || lower === "kate" ? "Kate" : null);
  return { voice_id: voiceId, voice_name: voiceName, voice_choice: voiceChoice };
}
/*__STUDIO_WORKER_END:requestedVoiceFromProductionRequest__*/

export async function cleanProductionRequestPayload(payload, env) {
  const contentTypeRaw = String(payload?.content_type || "").trim();
  const contentType = contentTypeRaw
    ? normalizeChoice(contentTypeRaw, PR_CONTENT_TYPES, "", "Master content type")
    : null;

  const platformsRaw = Array.isArray(payload?.platforms) ? payload.platforms : [];
  const platforms = canonicalProductionPlatforms(platformsRaw);
  const invalidPlatforms = platforms.filter(v => !PR_PLATFORMS.has(v));
  if (invalidPlatforms.length) throw new HttpError(400, `Unsupported platform(s): ${invalidPlatforms.join(", ")}`);

  const voiceoverMode = normalizeChoice(payload?.voiceover_mode, PR_TRISTATE, "Yes", "Voiceover mode");
  const backgroundMusicMode = normalizeChoice(payload?.background_music_mode, PR_TRISTATE, "Yes", "Background music mode");
  const thumbnailMode = normalizeChoice(payload?.thumbnail_mode, PR_THUMBNAIL_MODES, "Yes", "Thumbnail mode");

  const videoClipCountMode = normalizeChoice(payload?.video_clip_count_mode, PR_COUNT_MODES, "AI decides", "Video clip count mode");
  const slideCountApplies = ["Carousel", "Photo Set", "Feed Post"].includes(contentType);
  const carouselSlideCountMode = slideCountApplies
    ? normalizeChoice(payload?.carousel_slide_count_mode, PR_COUNT_MODES, "AI decides", "Carousel slide count mode")
    : "AI decides";

  const videoDurationSeconds = nullableWholeSeconds(payload?.video_duration_seconds, 5, 600, "Video duration");
  let voiceoverDurationSeconds = nullableNumber(payload?.voiceover_duration_seconds, 1, 600, "Voiceover duration");
  if (voiceoverMode === "Yes" && voiceoverDurationSeconds != null && voiceoverDurationSeconds < 4) {
    voiceoverDurationSeconds = 4;
  }
  const musicStartSeconds = nullableNumber(payload?.music_start_seconds, 0, 3600, "Music start");
  const voiceoverTailSeconds = 0;

  let videoClipCountExact = nullableInt(payload?.video_clip_count_exact, 1, 60, "Exact video clip count");
  let videoClipCountMin = nullableInt(payload?.video_clip_count_min, 1, 60, "Minimum video clip count");
  let videoClipCountMax = nullableInt(payload?.video_clip_count_max, 1, 60, "Maximum video clip count");

  if (videoClipCountMode === "AI decides") {
    videoClipCountExact = videoClipCountMin = videoClipCountMax = null;
  } else if (videoClipCountMode === "Exact") {
    if (videoClipCountExact === null) throw new HttpError(400, "Enter the exact video clip count");
    videoClipCountMin = videoClipCountMax = null;
  } else {
    if (videoClipCountMin === null || videoClipCountMax === null) throw new HttpError(400, "Enter both minimum and maximum video clip counts");
    if (videoClipCountMin > videoClipCountMax) throw new HttpError(400, "Minimum video clip count cannot exceed maximum");
    videoClipCountExact = null;
  }

  let carouselSlideCountExact = null;
  let carouselSlideCountMin = null;
  let carouselSlideCountMax = null;

  if (slideCountApplies) {
    const slideExactRaw = payload?.carousel_slide_count_exact;
    const slideExactCoerced = (slideExactRaw === 0 || slideExactRaw === "0") ? 1 : slideExactRaw;
    carouselSlideCountExact = nullableInt(slideExactCoerced, 1, Number.MAX_SAFE_INTEGER, "Exact carousel slide count");
    carouselSlideCountMin = nullableInt(payload?.carousel_slide_count_min, 1, Number.MAX_SAFE_INTEGER, "Minimum carousel slide count");
    carouselSlideCountMax = nullableInt(payload?.carousel_slide_count_max, 1, Number.MAX_SAFE_INTEGER, "Maximum carousel slide count");

    if (carouselSlideCountMode === "AI decides") {
      carouselSlideCountExact = carouselSlideCountMin = carouselSlideCountMax = null;
    } else if (carouselSlideCountMode === "Exact") {
      if (carouselSlideCountExact === null) throw new HttpError(400, "Enter the exact carousel slide count");
      carouselSlideCountMin = carouselSlideCountMax = null;
    } else {
      if (carouselSlideCountMin === null || carouselSlideCountMax === null) throw new HttpError(400, "Enter both minimum and maximum carousel slide counts");
      if (carouselSlideCountMin > carouselSlideCountMax) throw new HttpError(400, "Minimum carousel slide count cannot exceed maximum");
      carouselSlideCountExact = null;
    }
  }

  const carouselImageMode = normalizeChoice(
    payload?.carousel_image_mode,
    PR_CAROUSEL_IMAGE_MODES,
    "Make AI Generated",
    "Carousel image mode"
  );

  let titleMode = normalizeChoice(payload?.title_mode, PR_TEXT_MODES, "AI decides", "Title mode");
  let captionMode = normalizeChoice(payload?.caption_mode, PR_TEXT_MODES, "AI decides", "Caption mode");
  let scriptMode = normalizeChoice(payload?.script_mode, PR_TEXT_MODES, "AI decides", "Script mode");

  let requestedTitle = String(payload?.requested_title || "").trim();
  let requestedCaption = String(payload?.requested_caption || "").trim();
  let requestedScript = String(payload?.requested_script || "").trim();
  const productionNotes = String(payload?.production_notes || "").trim();
  const primaryLocation = String(payload?.primary_location || "").trim();

  if (requestedTitle.length > 500) throw new HttpError(400, "Requested title must be 500 characters or fewer");
  if (requestedCaption.length > 10000) throw new HttpError(400, "Requested caption must be 10000 characters or fewer");
  if (requestedScript.length > 25000) throw new HttpError(400, "Requested script must be 25000 characters or fewer");
  if (productionNotes.length > 10000) throw new HttpError(400, "Production notes must be 10000 characters or fewer");
  if (primaryLocation.length > 200) throw new HttpError(400, "Primary location must be 200 characters or fewer");

  // Pasted copy with mode left on "AI decides" is an operator footgun: P1 only
  // honors forced text when mode is Force exact. Upgrade automatically.
  if (requestedTitle && titleMode === "AI decides") titleMode = "Force exact";
  if (requestedCaption && captionMode === "AI decides") captionMode = "Force exact";
  if (requestedScript && scriptMode === "AI decides") scriptMode = "Force exact";

  if (titleMode === "Force exact" && !requestedTitle) throw new HttpError(400, "Enter a title when Title mode is Force exact");
  if (captionMode === "Force exact" && !requestedCaption) throw new HttpError(400, "Enter a caption when Caption mode is Force exact");
  if (scriptMode === "Force exact" && !requestedScript) throw new HttpError(400, "Enter a script when Script mode is Force exact");
  if (titleMode === "Leave blank") requestedTitle = "";
  if (captionMode === "Leave blank") requestedCaption = "";
  if (scriptMode === "Leave blank") requestedScript = "";

  const selectedMusicAssetId = String(payload?.selected_music_asset_id || "").trim() || null;
  if (selectedMusicAssetId) await validateMusicAsset(env, selectedMusicAssetId);

  const requestedVoice = normalizeRequestedVoice(payload, voiceoverMode);

  return {
    content_type: contentType,
    platforms,
    voiceover_mode: voiceoverMode,
    background_music_mode: backgroundMusicMode,
    thumbnail_mode: thumbnailMode,
    video_duration_seconds: videoDurationSeconds,
    voiceover_duration_seconds: voiceoverDurationSeconds,
    music_start_seconds: musicStartSeconds,
    video_clip_count_mode: videoClipCountMode,
    video_clip_count_exact: videoClipCountExact,
    video_clip_count_min: videoClipCountMin,
    video_clip_count_max: videoClipCountMax,
    carousel_slide_count_mode: carouselSlideCountMode,
    carousel_slide_count_exact: carouselSlideCountExact,
    carousel_slide_count_min: carouselSlideCountMin,
    carousel_slide_count_max: carouselSlideCountMax,
    carousel_image_mode: carouselImageMode,
    voiceover_tail_seconds: voiceoverTailSeconds,
    selected_music_asset_id: selectedMusicAssetId,
    voice_id: requestedVoice.voice_id,
    voice_name: requestedVoice.voice_name,
    title_mode: titleMode,
    requested_title: requestedTitle,
    caption_mode: captionMode,
    requested_caption: requestedCaption,
    script_mode: scriptMode,
    requested_script: requestedScript,
    primary_location: primaryLocation,
    production_notes: productionNotes,
  };
}
/*__STUDIO_WORKER_END:cleanProductionRequestPayload__*/

export function productionRequestFields(input, nowIso, { status = "Draft" } = {}) {
  const notes = String(input.production_notes || "");
  const az = /origin=az-finished-video/i.test(notes);
  const vibeCut = studioIsVibeCut(notes);
  const vibeHorizontal = vibeCut && isHorizontalVibeCutAspect(notes);
  const vibeDirective = vibeCut ? parseVibeCutDirective(notes) : null;
  const vibeTargetSeconds = Number(vibeDirective?.target_seconds || 0);
  return {
    Request_Status: status,
    Master_Content_Type: vibeCut
      ? (vibeHorizontal
        ? (input.content_type || "Longform Video")
        : "Vertical Short Video")
      : (input.content_type || null),
    Target_Platforms: vibeHorizontal
      ? ["YouTube"]
      : (input.platforms || []),
    Voiceover_Mode: (az || vibeCut) ? "No" : input.voiceover_mode,
    Background_Music_Mode: az ? "No" : (vibeCut ? "Yes" : input.background_music_mode),
    Thumbnail_Mode: (/ez-input=finished-(video|stills|carousel)/i.test(notes) || vibeCut)
      ? "Yes"
      : input.thumbnail_mode,
    // Vibe Cut expands one long master into many beat-synced trims in stamp/T1.
    // Never lock Exact=1 (I4/form defaults) — that forces a single head-of-file trim.
    Video_Clip_Count_Mode: vibeCut ? "AI decides" : input.video_clip_count_mode,
    Video_Clip_Count_Exact: vibeCut ? null : input.video_clip_count_exact,
    Video_Clip_Count_Min: vibeCut ? null : input.video_clip_count_min,
    Video_Clip_Count_Max: vibeCut ? null : input.video_clip_count_max,
    Video_Duration_Seconds: (vibeCut && vibeTargetSeconds > 0)
      ? vibeTargetSeconds
      : input.video_duration_seconds,
    Voiceover_Duration_Seconds: input.voiceover_duration_seconds,
    Music_Start_Seconds: input.music_start_seconds,
    Carousel_Slide_Count_Mode: input.carousel_slide_count_mode,
    Carousel_Slide_Count_Exact: input.carousel_slide_count_exact,
    Carousel_Slide_Count_Min: input.carousel_slide_count_min,
    Carousel_Slide_Count_Max: input.carousel_slide_count_max,
    Carousel_Image_Mode: input.carousel_image_mode,
    Voiceover_Tail_Seconds: input.voiceover_tail_seconds,
    Selected_Music_Asset: input.selected_music_asset_id ? [input.selected_music_asset_id] : [],
    Voice_ID: input.voice_id || null,
    Voice_Name: input.voice_name || null,
    Title_Mode: input.title_mode,
    Requested_Title: input.requested_title || null,
    Caption_Mode: input.caption_mode,
    Requested_Caption: input.requested_caption || null,
    Script_Mode: input.script_mode,
    Requested_Script: input.requested_script || null,
    Primary_Location: input.primary_location || null,
    Production_Notes: input.production_notes || null,
    Updated_At: nowIso,
    Active: true,
  };
}
/*__STUDIO_WORKER_END:productionRequestFields__*/

export function productionRequestDefaultsFromIdea(idea) {
  return {
    content_type: String(f(idea, "Production_Content_Type") || "").trim() || null,
    platforms: (() => {
      const productionPlatforms = Array.isArray(f(idea, "Production_Target_Platforms"))
        ? f(idea, "Production_Target_Platforms")
        : [];
      if (productionPlatforms.length) return canonicalProductionPlatforms(productionPlatforms);
      return canonicalProductionPlatforms(
        Array.isArray(f(idea, "Suggested_Platforms")) ? f(idea, "Suggested_Platforms") : []
      );
    })(),
    voiceover_mode: String(f(idea, "Production_Include_Voiceover") || "Yes").trim() || "Yes",
    background_music_mode: String(f(idea, "Production_Include_Background_Music") || "Yes").trim() || "Yes",
    thumbnail_mode: String(f(idea, "Production_Include_Thumbnail") || "Yes").trim() || "Yes",
    video_duration_seconds: ["Photo Set", "Carousel", "Feed Post"].includes(String(f(idea, "Production_Content_Type") || "").trim())
      ? null
      : (f(idea, "Production_Video_Duration") || 30),
    voiceover_duration_seconds: ["Photo Set", "Carousel", "Feed Post"].includes(String(f(idea, "Production_Content_Type") || "").trim())
      ? null
      : (f(idea, "Voiceover_Duration_Seconds")
      ?? autonomousDefaultVoiceoverSeconds(f(idea, "Production_Video_Duration") || 30)),
    music_start_seconds: f(idea, "Music_Start_Seconds") ?? 0,
    video_clip_count_mode: f(idea, "Production_Video_Clip_Count") ? "Exact" : "AI decides",
    video_clip_count_exact: f(idea, "Production_Video_Clip_Count") || null,
    video_clip_count_min: null,
    video_clip_count_max: null,
    carousel_slide_count_mode: f(idea, "Production_Carousel_Slide_Count_Mode")
      || (f(idea, "Production_Carousel_Slide_Count") ? "Exact" : "AI decides"),
    carousel_slide_count_exact: f(idea, "Production_Carousel_Slide_Count") || null,
    carousel_slide_count_min: f(idea, "Production_Carousel_Slide_Count_Min") || null,
    carousel_slide_count_max: f(idea, "Production_Carousel_Slide_Count_Max") || null,
    carousel_image_mode: String(f(idea, "Production_Carousel_Image_Mode") || "Make AI Generated").trim() || "Make AI Generated",
    voiceover_tail_seconds: 0,
    selected_music_asset_id: null,
    voice_id: null,
    voice_name: null,
    title_mode: "AI decides",
    requested_title: "",
    caption_mode: "AI decides",
    requested_caption: "",
    script_mode: "AI decides",
    requested_script: "",
    primary_location: suggestPrimaryLocationFromIdea(idea).name || "",
    production_notes: "",
  };
}
/*__STUDIO_WORKER_END:productionRequestDefaultsFromIdea__*/

export function suggestPrimaryLocationFromIdea(idea) {
  const primary = String(f(idea, "Primary_Location") || "").trim();
  if (primary) return { name: primary, source: "idea.Primary_Location" };
  const area = String(f(idea, "Neighborhood_or_Area") || "").trim();
  if (area) return { name: area, source: "idea.Neighborhood_or_Area" };
  const blob = [
    f(idea, "Candidate_Title"),
    f(idea, "Idea_Summary"),
    f(idea, "Hook"),
  ].filter(Boolean).join(" ");
  const matched = studioMatchKnownPlace(blob);
  if (matched) {
    let name = matched.split(" ").map((part) => (part === "the" ? "The" : part.charAt(0).toUpperCase() + part.slice(1))).join(" ");
    if (matched === "the loop") name = "The Loop";
    return { name, source: "idea_copy_match" };
  }
  const market = studioMarketName(idea);
  if (market) return { name: market, source: "idea.Market_Name" };
  return { name: "", source: "" };
}
/*__STUDIO_WORKER_END:suggestPrimaryLocationFromIdea__*/

export async function listOpenProductionRequests(env, { limit = 100, fields = PRODUCTION_REQUEST_LIST_FIELDS } = {}) {
  return listRecords(env, PRODUCTION_REQUEST_TABLE, {
    limit,
    sortField: "Updated_At",
    sortDirection: "desc",
    filterFormula: OPEN_PRODUCTION_REQUEST_FORMULA,
    fields,
  });
}
/*__STUDIO_WORKER_END:listOpenProductionRequests__*/

export async function existingDraftForIdea(env, ideaRecordId, authorization) {
  const records = await listOpenProductionRequests(env);
  const matches = records.filter((record) => {
    const ideaLinks = Array.isArray(f(record, "Idea_Candidate")) ? f(record, "Idea_Candidate") : [];
    const orgLinks = Array.isArray(f(record, "Organization")) ? f(record, "Organization") : [];
    const brandLinks = Array.isArray(f(record, "Brand")) ? f(record, "Brand") : [];
    const status = String(f(record, "Request_Status") || "").trim();
    return ideaLinks.includes(ideaRecordId) &&
      orgLinks.includes(authorization?.organization?.record_id) &&
      membershipAllowsBrand(authorization, brandLinks) &&
      ["Draft", "Ready", "Submitted"].includes(status) &&
      Boolean(f(record, "Active"));
  }).map((record) => ({
    id: record.id,
    status: String(f(record, "Request_Status") || "").trim(),
    createdAt: f(record, "Created_At") || record.createdTime || "",
    record,
  }));
  const preferred = preferAuthoritativeProductionRequest(matches);
  const chosen = preferred ? (matches.find((row) => row.id === preferred.id)?.record || null) : null;
  if (!chosen?.id) return null;
  // The list omits asset/plan/variant JSON. Callers that continue the draft
  // need the full record, and only this one row is fetched.
  return airtableFetch(env, PRODUCTION_REQUEST_TABLE, chosen.id);
}
/*__STUDIO_WORKER_END:existingDraftForIdea__*/

export async function loadContentProfileRecord(env, authorization, profileId) {
  const id = String(profileId || "").trim();
  if (!id) return null;
  try {
    return await resolveWorkingContentProfile(env, authorization, id);
  } catch {
    try {
      return await airtableFetch(env, "Content Profiles", id);
    } catch {
      return null;
    }
  }
}
/*__STUDIO_WORKER_END:loadContentProfileRecord__*/

export async function resolveDraftNarrationVoice(env, idea, authorization, fallback = {}, preferredProfileId = null) {
  const fallbackId = String(fallback.voice_id || PHASE6_DEFAULT_VOICE_ID).trim() || PHASE6_DEFAULT_VOICE_ID;
  const fallbackName = String(fallback.voice_name || "Kate").trim() || "Kate";
  const ideaProfileId = arrayOrEmpty(f(idea, "Content_Profile"))[0]
    || arrayOrEmpty(f(idea, "Content Profiles"))[0]
    || "";
  const candidateIds = [...new Set([ideaProfileId, preferredProfileId].filter(Boolean))];
  const profiles = [];
  try {
    for (const profileId of candidateIds) {
      const record = await loadContentProfileRecord(env, authorization, profileId);
      if (record) profiles.push(mapOperationsProfile(record));
    }
    const working = await resolveWorkingContentProfile(env, authorization, preferredProfileId || null).catch(() => null);
    if (working && !profiles.some((row) => row.id === working.id)) {
      profiles.push(mapOperationsProfile(working));
    }
    return pickNarrationVoiceFromProfiles(profiles, {
      voice_id: fallbackId,
      voice_name: fallbackName,
    });
  } catch (error) {
    console.warn("draft narration voice profile lookup failed", idea?.id, error);
    return pickNarrationVoiceFromProfiles(profiles, {
      voice_id: fallbackId,
      voice_name: fallbackName,
    });
  }
}
/*__STUDIO_WORKER_END:resolveDraftNarrationVoice__*/

export function isUnsetOrKateDefaultVoice(voiceId, { explicit = false } = {}) {
  if (explicit) return false;
  const id = String(voiceId || "").trim();
  return !id || id === PHASE6_DEFAULT_VOICE_ID;
}
/*__STUDIO_WORKER_END:isUnsetOrKateDefaultVoice__*/

export async function maybeHealDraftNarrationVoice(env, record, idea, authorization, preferredProfileId = null) {
  if (String(f(record, "Voiceover_Mode") || "Yes").trim() !== "Yes") return record;
  const storedId = String(f(record, "Voice_ID") || "").trim();
  if (!isUnsetOrKateDefaultVoice(storedId)) return record;
  const narration = await resolveDraftNarrationVoice(env, idea, authorization, {
    voice_id: PHASE6_DEFAULT_VOICE_ID,
    voice_name: "Kate",
  }, preferredProfileId);
  if (!narration.voice_id || narration.voice_id === storedId) return record;
  try {
    return await item4UpdateRequestState(env, record.id, {
      Voice_ID: narration.voice_id,
      Voice_Name: narration.voice_name || narration.voice_id,
    });
  } catch (error) {
    console.warn("draft narration voice heal failed", record.id, error);
    return record;
  }
}
/*__STUDIO_WORKER_END:maybeHealDraftNarrationVoice__*/

export async function createDraftForIdea(env, idea, authorization, input = null, { preferredProfileId = null } = {}) {
  const now = new Date().toISOString();
  const defaults = productionRequestDefaultsFromIdea(idea);
  // HTML/EZ defaults send Kate. Treat that as unset unless the operator explicitly
  // picked a voice, so Admin profile defaults (Hank, etc.) still win.
  const incomingVoiceId = String(input?.voice_id || defaults.voice_id || "").trim();
  const explicitVoice = Boolean(input?.voice_explicit);
  if (
    String((input || defaults).voiceover_mode || "Yes").trim() === "Yes"
    && isUnsetOrKateDefaultVoice(incomingVoiceId, { explicit: explicitVoice })
  ) {
    const narration = await resolveDraftNarrationVoice(env, idea, authorization, {
      voice_id: PHASE6_DEFAULT_VOICE_ID,
      voice_name: "Kate",
    }, preferredProfileId);
    defaults.voice_id = narration.voice_id || PHASE6_DEFAULT_VOICE_ID;
    defaults.voice_name = narration.voice_name || "Kate";
    if (input && typeof input === "object") {
      input = { ...input, voice_id: defaults.voice_id, voice_name: defaults.voice_name };
    }
  }
  const cleaned = input || await cleanProductionRequestPayload(defaults, env);
  if (!String(cleaned.primary_location || "").trim() && defaults.primary_location) {
    cleaned.primary_location = defaults.primary_location;
  }
  const ideaProfileId = arrayOrEmpty(f(idea, "Content_Profile"))[0];
  let brandId = authorization.brand.record_id;
  if (ideaProfileId) {
    try {
      const ideaProfile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, ideaProfileId);
      brandId = arrayOrEmpty(f(ideaProfile, "Brand"))[0] || brandId;
    } catch {}
  }
  const fields = {
    Production_Request_ID: makeProductionRequestId(),
    Idea_Candidate: [idea.id],
    Test_Run_ID: String(f(idea, "Test_Run_ID") || "").trim() || null,
    Organization: [authorization.organization.record_id],
    Brand: [brandId],
    Created_By: [authorization.user.record_id],
    Created_At: now,
    Studio_Master_Asset_Status: "None",
    Studio_Master_Asset_Count: 0,
    Studio_Output_Plan_Status: "Needs Plan",
    Studio_Item4_State: "Draft",
    ...productionRequestFields(cleaned, now),
  };

  return airtableFetch(env, PRODUCTION_REQUEST_TABLE, "", {
    method: "POST",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:createDraftForIdea__*/

export async function getOrCreateProductionRequestForIdea(request, env, url, authorization, ctx = null) {
  const ideaRecordId = ideaRecordIdFromPath(url);
  const idea = await loadAuthorizedIdea(env, ideaRecordId, authorization);
  if (promotionCompleted(idea)) {
    throw new HttpError(409, "This idea has already been promoted; its production configuration is locked");
  }
  if (String(f(idea, "Candidate_Status") || "").trim() === "On Hold") {
    throw new HttpError(409, "Restore this idea before configuring production");
  }

  let preferredProfileId = null;
  try { preferredProfileId = requestedProfileId(url, await request.clone().json().catch(() => ({}))); } catch { preferredProfileId = requestedProfileId(url); }
  const existing = await existingDraftForIdea(env, ideaRecordId, authorization);
  if (existing) {
    return respond(request, env, {
      ok: true,
      created: false,
      record: mapProductionRequestLight(existing),
    });
  }

  const created = await createDraftForIdea(env, idea, authorization, null, { preferredProfileId });
  return respond(request, env, {
    ok: true,
    created: true,
    record: mapProductionRequestLight(created),
  }, 201);
}
/*__STUDIO_WORKER_END:getOrCreateProductionRequestForIdea__*/

export async function createProductionRequestFromBody(request, env, authorization, url, ctx = null) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const ideaRecordId = String(payload?.idea_record_id || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(ideaRecordId)) throw new HttpError(400, "idea_record_id is required");

  const idea = await loadAuthorizedIdea(env, ideaRecordId, authorization);
  if (promotionCompleted(idea)) throw new HttpError(409, "This idea has already been promoted");
  const preferredProfileId = requestedProfileId(url, payload);
  const existing = await existingDraftForIdea(env, ideaRecordId, authorization);
  if (existing) {
    return respond(request, env, {
      ok: true,
      created: false,
      record: mapProductionRequestLight(existing),
    });
  }

  const explicitVoice = Boolean(payload?.voice_explicit)
    || (String(payload?.voice_id || "").trim() && String(payload.voice_id).trim() !== PHASE6_DEFAULT_VOICE_ID);
  const input = await cleanProductionRequestPayload(payload, env);
  if (!explicitVoice && String(input.voiceover_mode || "Yes").trim() === "Yes") {
    input.voice_id = "";
    input.voice_name = "";
  }
  input.voice_explicit = explicitVoice;
  const created = await createDraftForIdea(env, idea, authorization, input, { preferredProfileId });
  return respond(request, env, {
    ok: true,
    created: true,
    record: mapProductionRequestLight(created),
  }, 201);
}

/*__STUDIO_WORKER_END:createProductionRequestFromBody__*/

export function mapProductionRequestLight(record, ideaTitle = null) {
  // Critical-path mapper for opening/listing Production Requests.
  // Do NOT call mapProductionRequest here: that parses multi-MB asset, plan,
  // variant and publish JSON fields before discarding them, which can exhaust
  // the Worker on large photo ideas such as Wabash Mural Spring.
  const links = (name) => Array.isArray(f(record, name)) ? f(record, name) : [];
  return {
    id: record.id,
    production_request_id: f(record, "Production_Request_ID"),
    test_run_id: f(record, "Test_Run_ID") || null,
    idea_candidate_links: links("Idea_Candidate"),
    idea_record_id: links("Idea_Candidate")[0] || null,
    idea_title: ideaTitle || String(f(record, "Idea_Title") || "").trim() || null,
    organization_links: links("Organization"),
    brand_links: links("Brand"),
    created_by_links: links("Created_By"),
    status: f(record, "Request_Status"),
    content_type: f(record, "Master_Content_Type"),
    platforms: f(record, "Target_Platforms") || [],
    voiceover_mode: f(record, "Voiceover_Mode"),
    voice_id: f(record, "Voice_ID") || null,
    voice_name: f(record, "Voice_Name") || null,
    background_music_mode: f(record, "Background_Music_Mode"),
    thumbnail_mode: f(record, "Thumbnail_Mode"),
    video_duration_seconds: f(record, "Video_Duration_Seconds"),
    voiceover_duration_seconds: f(record, "Voiceover_Duration_Seconds"),
    music_start_seconds: f(record, "Music_Start_Seconds"),
    video_clip_count_mode: f(record, "Video_Clip_Count_Mode"),
    video_clip_count_exact: f(record, "Video_Clip_Count_Exact"),
    video_clip_count_min: f(record, "Video_Clip_Count_Min"),
    video_clip_count_max: f(record, "Video_Clip_Count_Max"),
    carousel_slide_count_mode: f(record, "Carousel_Slide_Count_Mode"),
    carousel_slide_count_exact: f(record, "Carousel_Slide_Count_Exact"),
    carousel_slide_count_min: f(record, "Carousel_Slide_Count_Min"),
    carousel_slide_count_max: f(record, "Carousel_Slide_Count_Max"),
    carousel_image_mode: f(record, "Carousel_Image_Mode"),
    voiceover_tail_seconds: f(record, "Voiceover_Tail_Seconds"),
    selected_music_asset_links: links("Selected_Music_Asset"),
    title_mode: f(record, "Title_Mode"),
    requested_title: f(record, "Requested_Title"),
    caption_mode: f(record, "Caption_Mode"),
    requested_caption: f(record, "Requested_Caption"),
    script_mode: f(record, "Script_Mode"),
    requested_script: f(record, "Requested_Script"),
    primary_location: String(f(record, "Primary_Location") || "").trim() || null,
    production_notes: stripFactoryRevisionNote(f(record, "Production_Notes")),
    revision_open: productionRequestRevisionOpen(record),
    created_at: f(record, "Created_At"),
    updated_at: f(record, "Updated_At"),
    submitted_at: f(record, "Submitted_At"),
    promoted_content_item_links: links("Promoted_Content_Item"),
    active: Boolean(f(record, "Active")),
    studio_master_asset_count: Number(f(record, "Studio_Master_Asset_Count") || 0),
    studio_master_asset_status: f(record, "Studio_Master_Asset_Status") || "None",
    studio_output_plan_status: f(record, "Studio_Output_Plan_Status") || "Needs Plan",
    studio_variant_status: f(record, "Studio_Variant_Status") || "None",
    studio_variant_updated_at: f(record, "Studio_Variant_Updated_At") || null,
    studio_variant_error: f(record, "Studio_Variant_Error") || null,
    studio_item4_state: f(record, "Studio_Item4_State") || "Draft",
    studio_publish_batch_id: f(record, "Studio_Publish_Batch_ID") || null,
    studio_publish_requested_at: f(record, "Studio_Publish_Requested_At") || null,
  };
}
/*__STUDIO_WORKER_END:mapProductionRequestLight__*/

export function mapProductionRequestSummary(record, ideaTitle = null) {
  const mapped = mapProductionRequestLight(record, ideaTitle);
  return {
    id: mapped.id,
    production_request_id: mapped.production_request_id,
    idea_candidate_links: mapped.idea_candidate_links,
    idea_record_id: mapped.idea_record_id,
    idea_title: mapped.idea_title,
    requested_title: mapped.requested_title,
    organization_links: mapped.organization_links,
    brand_links: mapped.brand_links,
    created_by_links: mapped.created_by_links,
    status: mapped.status,
    content_type: mapped.content_type,
    platforms: mapped.platforms,
    voiceover_mode: mapped.voiceover_mode,
    voice_id: mapped.voice_id,
    voice_name: mapped.voice_name,
    background_music_mode: mapped.background_music_mode,
    thumbnail_mode: mapped.thumbnail_mode,
    video_duration_seconds: mapped.video_duration_seconds,
    voiceover_duration_seconds: mapped.voiceover_duration_seconds,
    music_start_seconds: mapped.music_start_seconds,
    video_clip_count_mode: mapped.video_clip_count_mode,
    video_clip_count_exact: mapped.video_clip_count_exact,
    video_clip_count_min: mapped.video_clip_count_min,
    video_clip_count_max: mapped.video_clip_count_max,
    carousel_slide_count_mode: mapped.carousel_slide_count_mode,
    carousel_slide_count_exact: mapped.carousel_slide_count_exact,
    carousel_slide_count_min: mapped.carousel_slide_count_min,
    carousel_slide_count_max: mapped.carousel_slide_count_max,
    carousel_image_mode: mapped.carousel_image_mode,
    voiceover_tail_seconds: mapped.voiceover_tail_seconds,
    selected_music_asset_links: mapped.selected_music_asset_links,
    title_mode: mapped.title_mode,
    requested_title: mapped.requested_title,
    caption_mode: mapped.caption_mode,
    requested_caption: mapped.requested_caption,
    script_mode: mapped.script_mode,
    requested_script: mapped.requested_script,
    primary_location: mapped.primary_location,
    production_notes: mapped.production_notes,
    revision_open: mapped.revision_open,
    created_at: mapped.created_at,
    updated_at: mapped.updated_at,
    submitted_at: mapped.submitted_at,
    promoted_content_item_links: mapped.promoted_content_item_links,
    active: mapped.active,
    studio_master_asset_count: mapped.studio_master_asset_count,
    studio_master_asset_status: mapped.studio_master_asset_status,
    studio_output_plan_status: mapped.studio_output_plan_status,
    studio_variant_status: mapped.studio_variant_status,
    studio_variant_updated_at: mapped.studio_variant_updated_at,
    studio_variant_error: mapped.studio_variant_error,
    studio_item4_state: mapped.studio_item4_state,
  };
}
/*__STUDIO_WORKER_END:mapProductionRequestSummary__*/

export function productionRequestPhotoWaitHidden(record, ideaWait) {
  if (String(ideaWait || "").trim() !== "Waiting") return false;
  const notes = String(f(record, "Production_Notes") || "");
  if (productionPhotoWaitAutoOff(notes)) return false;
  const assetCount = Number(f(record, "Studio_Master_Asset_Count") || 0);
  if (assetCount > 0 && timedScriptFromNotes(notes)?.segments?.some(
    segment => String(segment?.voiceover_text || "").trim()
  )) return false;
  return true;
}
/*__STUDIO_WORKER_END:productionRequestPhotoWaitHidden__*/

export async function listProductionRequests(request, env, url, authorization) {
  const limit = clampLimit(url, 100, 100);
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
  const orgId = String(authorization?.organization?.record_id || "none");
  const payload = await studioReadCoalesce(`production-requests:${orgId}:${profile.id}:${limit}`, 25000, async () => {
  const records = await listOpenProductionRequests(env, { limit });
  const profileBrandIds = new Set(arrayOrEmpty(f(profile, "Brand")));
  const filtered = records.filter(record => {
    const orgLinks = Array.isArray(f(record, "Organization")) ? f(record, "Organization") : [];
    const brandLinks = Array.isArray(f(record, "Brand")) ? f(record, "Brand") : [];
    const status = String(f(record, "Request_Status") || "").trim();
    const title = String(f(record, "Requested_Title") || "").trim();
    const ideaLinks = Array.isArray(f(record, "Idea_Candidate")) ? f(record, "Idea_Candidate") : [];
    const promotedLinks = Array.isArray(f(record, "Promoted_Content_Item")) ? f(record, "Promoted_Content_Item") : [];
    const contentLinks = Array.isArray(f(record, "Content Items")) ? f(record, "Content Items") : [];
    const detachedBlankDraft =
      status === "Draft" &&
      !title &&
      ideaLinks.length === 0 &&
      promotedLinks.length === 0 &&
      contentLinks.length === 0;
    return !detachedBlankDraft &&
      orgLinks.includes(authorization?.organization?.record_id) &&
      membershipAllowsBrand(authorization, brandLinks) &&
      (!profileBrandIds.size || brandLinks.some((id) => profileBrandIds.has(id)));
  });
  const ideaIds = filtered.map(ideaRecordIdFromProductionRequest);
  const { titles: ideaTitles, photoWait: photoWaitStates } = await loadIdeaListMetaByRecordId(env, ideaIds);
  const visible = filtered.filter((record) => {
    const ideaId = ideaRecordIdFromProductionRequest(record);
    return !ideaId || !productionRequestPhotoWaitHidden(record, photoWaitStates.get(ideaId));
  });
  return {
    records: visible.map((record) => mapProductionRequestSummary(
      record,
      ideaTitles.get(ideaRecordIdFromProductionRequest(record)) || null
    )),
    photo_watch_waiting_count: filtered.length - visible.length,
  };
  });
  return respond(request, env, { ok: true, ...payload });
}
/*__STUDIO_WORKER_END:listProductionRequests__*/

export async function getProductionRequest(request, env, url, authorization, ctx = null) {
  void ctx;
  const recordId = productionRequestRecordIdFromPath(url);
  const record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  const ideaId = ideaRecordIdFromProductionRequest(record);
  const ideaTitles = await loadIdeaTitlesByRecordId(env, [ideaId]);
  const light = String(url.searchParams.get("fields") || "").trim().toLowerCase() === "light";
  return respond(request, env, {
    ok: true,
    record: light
      ? mapProductionRequestLight(record, ideaTitles.get(ideaId) || null)
      : mapProductionRequest(record, ideaTitles.get(ideaId) || null),
  });
}
/*__STUDIO_WORKER_END:getProductionRequest__*/

export async function updateProductionRequest(request, env, url, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const recordId = productionRequestRecordIdFromPath(url);
  const existing = await loadAuthorizedProductionRequest(env, recordId, authorization);
  const status = String(f(existing, "Request_Status") || "").trim();
  const revisionOpen = productionRequestRevisionOpen(existing);
  if (!productionRequestEditable(existing)) {
    throw new HttpError(409, `Production Request is ${status || "locked"} and cannot be edited`);
  }

  const input = await cleanProductionRequestPayload({ ...mapProductionRequest(existing), ...payload }, env);
  input.production_notes = mergeProductionRequestNotes(
    stripFactoryRevisionNote(f(existing, "Production_Notes")),
    input.production_notes
  );
  if (revisionOpen) input.production_notes = withFactoryRevisionOpen(input.production_notes);
  const now = new Date().toISOString();
  const editableStatus = revisionOpen ? "Draft" : status;
  const fields = productionRequestFields(input, now, { status: editableStatus });
  const slideCaptions = item4NormalizeSlideCaptions(payload?.slide_captions);
  if (slideCaptions.length) {
    const nextAssets = item4ApplySlideCaptions(
      item4ParseJson(f(existing, "Studio_Master_Assets_JSON"), []),
      slideCaptions
    );
    fields.Studio_Master_Assets_JSON = JSON.stringify(nextAssets);
    if (item4RequestedCaptionIsSlideDump(input.requested_caption, nextAssets)) {
      fields.Caption_Mode = "AI decides";
      fields.Requested_Caption = null;
    }
  }

  const updated = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      fields,
      typecast: true,
    }),
  });

  // Keep the Content Item location in sync when this request already has a parent.
  const contentId = studioFirstLinkedId(f(updated, "Promoted_Content_Item"));
  const location = String(f(updated, "Primary_Location") || "").trim();
  if (contentId && Object.prototype.hasOwnProperty.call(fields, "Primary_Location")) {
    await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Primary_Location: location || null },
        typecast: true,
      }),
    }).catch((error) => console.warn("primary location content sync failed", contentId, error));
  }

  const light = payload?.light === true
    || String(url.searchParams.get("fields") || "").trim().toLowerCase() === "light";

  return respond(request, env, {
    ok: true,
    updated: true,
    record: light ? mapProductionRequestLight(updated) : mapProductionRequest(updated),
  });
}


/*__STUDIO_WORKER_END:updateProductionRequest__*/

export function productionRequestBridgeRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/production-requests\/(rec[A-Za-z0-9]+)\/bridge-preflight$/);
  if (!match) throw new HttpError(400, "Invalid Production Request bridge-preflight route");
  return match[1];
}
/*__STUDIO_WORKER_END:productionRequestBridgeRecordIdFromPath__*/

export function item4DerivedIdeaSummary(ideaRecord, requestRecord) {
  const title = String(f(ideaRecord, "Candidate_Title") || "").trim() || "Untitled production request";
  const contentType = String(f(requestRecord, "Master_Content_Type") || "content").trim() || "content";
  const platforms = arrayOrEmpty(f(requestRecord, "Target_Platforms")).map(value => String(value || "").trim()).filter(Boolean);
  const notes = String(f(requestRecord, "Production_Notes") || "").trim();

  const platformText = platforms.length ? ` for ${platforms.join(", ")}` : "";
  const base = `Studio production request for "${title}": create a ${contentType}${platformText} using the approved uploaded master media, saved platform output plan, and production directives.`;
  const withNotes = notes ? `${base} Production direction: ${notes}` : base;
  return withNotes.slice(0, 5000);
}
/*__STUDIO_WORKER_END:item4DerivedIdeaSummary__*/

export async function ensureProductionRequestIdeaSummary(env, ideaRecord, requestRecord) {
  const existing = String(f(ideaRecord, "Idea_Summary") || "").trim();
  if (existing) {
    return { record: ideaRecord, derived: false, summary: existing };
  }

  const summary = item4DerivedIdeaSummary(ideaRecord, requestRecord);
  if (!summary) {
    throw new HttpError(409, "The linked Idea Candidate requires a summary before I3/I4 promotion");
  }

  const updated = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaRecord.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: { Idea_Summary: summary },
      typecast: false,
    }),
  });

  return { record: updated, derived: true, summary };
}
/*__STUDIO_WORKER_END:ensureProductionRequestIdeaSummary__*/

export function item4BridgePlanKey(platform, outputType) {
  return `${String(platform || "").trim()}::${String(outputType || "").trim()}`;
}
/*__STUDIO_WORKER_END:item4BridgePlanKey__*/

export async function item4SourceToProductionBridgePreflight(env, requestRecord, ideaRecord = null) {
  const variantsAlreadyReady = autonomousPlanVariantsReady(requestRecord);
  // Ready 37-still drafts already have crops. Relink + queue scans here
  // exhaust the Worker and 500 Approve.
  if (!variantsAlreadyReady) {
    try {
      requestRecord = await item4RelinkVariantQueueOutputs(env, requestRecord);
    } catch (error) {
      console.warn("Item 4 destination relink deferred before bridge preflight", error);
    }
  }

  const issues = [];
  const warnings = [];
  const checks = [];

  const addCheck = (name, ok, detail = null) => {
    checks.push({ name, ok: Boolean(ok), detail: detail || null });
    if (!ok && detail) issues.push(detail);
  };

  const masterStatus = String(f(requestRecord, "Studio_Master_Asset_Status") || "").trim();
  const planStatus = String(f(requestRecord, "Studio_Output_Plan_Status") || "").trim();
  const variantStatus = String(f(requestRecord, "Studio_Variant_Status") || "").trim();

  const masterAssets = item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), []);
  const plan = item4ParseJson(f(requestRecord, "Studio_Output_Plan_JSON"), null);
  const variantManifest = item4ParseJson(f(requestRecord, "Studio_Variant_Manifest_JSON"), null);

  const finishedPassthrough = studioIsFinishedPassthrough(requestRecord);
  const finishedPublicMasters = finishedPassthrough && Array.isArray(masterAssets) && masterAssets.length > 0
    && masterAssets.every((asset) => String(asset?.url || "").startsWith("https://media.chicagoshining.com/"));
  addCheck(
    "master_media_ready",
    masterStatus === "Ready" || finishedPublicMasters,
    "Master media must be Ready before source-to-production handoff."
  );
  addCheck("output_plan_ready", planStatus === "Ready", "Platform output plan must be Ready before source-to-production handoff.");
  addCheck(
    "platform_variants_ready",
    finishedPassthrough ? studioFinishedVariantsSkipped(requestRecord) : variantStatus === "Ready",
    finishedPassthrough ? null : "Platform-ready variants must be Ready before source-to-production handoff."
  );

  addCheck(
    "master_manifest_present",
    Array.isArray(masterAssets) && masterAssets.length > 0,
    "The authoritative master-media manifest is missing or empty."
  );

  const proposalNotes = String(f(requestRecord, "Production_Notes") || "");
  if (/scripted-short=proposal/i.test(proposalNotes)) {
    const proposalTimeline = timedScriptFromNotes(proposalNotes);
    addCheck(
      "scripted_short_timeline_present",
      Boolean(proposalTimeline?.segments?.length),
      "The scripted short timeline is missing. Save the scenes before Approve."
    );
    if (proposalTimeline?.segments?.length) {
      const unassigned = scriptedShortUnassignedMessage(proposalTimeline);
      addCheck("scripted_short_scenes_assigned", !unassigned, unassigned || null);
    }
  }

  if (Array.isArray(masterAssets) && masterAssets.length) {
    const incompleteMasters = masterAssets.filter(asset =>
      !String(asset?.google_drive_file_id || "").trim() ||
      !/^rec[A-Za-z0-9]+$/.test(String(asset?.media_asset_record_id || "").trim())
    );
    const publicReady = finishedPassthrough && masterAssets.every((asset) =>
      String(asset?.url || "").startsWith("https://media.chicagoshining.com/")
    );
    addCheck(
      "master_drive_authority_complete",
      incompleteMasters.length === 0 || publicReady,
      incompleteMasters.length && !publicReady ? `${incompleteMasters.length} master asset(s) are missing Google Drive or Media Asset authority.` : null
    );
  }

  const planItems = Array.isArray(plan?.items) ? plan.items : [];
  addCheck("output_plan_items_present", planItems.length > 0, "The saved platform output plan has no items.");

  const outputRows = (await outputRowsForProductionRequest(env, requestRecord.id))
    .filter(row => Boolean(f(row, "Enabled")));

  addCheck("enabled_outputs_present", outputRows.length > 0, "Choose at least one enabled Production Request Output.");

  const routeRows = [];
  for (const outputRow of outputRows) {
    const platform = String(f(outputRow, "Platform") || "").trim();
    const outputType = String(f(outputRow, "Output_Type") || "").trim();
    const route = studioOutputRouteSpec(outputRow);
    const planItem = planItems.find(item => item4BridgePlanKey(item?.platform, item?.output_type) === item4BridgePlanKey(platform, outputType)) || null;

    if (!route) {
      issues.push(`${platform} / ${outputType} does not have a proven production route.`);
    }
    if (!planItem) {
      issues.push(`${platform} / ${outputType} is enabled but missing from the saved output plan.`);
    }

    routeRows.push({
      record_id: outputRow.id,
      production_request_output_id: f(outputRow, "Production_Request_Output_ID"),
      platform,
      output_type: outputType,
      aspect_ratio: planItem?.aspect_ratio || null,
      pipeline_family: route?.pipeline_family || null,
      content_type: route?.content_type || null,
      proven_mapping: route?.proven_mapping || null,
      ready: Boolean(route && planItem),
    });
  }

  addCheck(
    "all_output_routes_proven",
    routeRows.length > 0 && routeRows.every(row => row.ready),
    routeRows.some(row => !row.ready) ? "One or more enabled outputs are not fully mapped from the Studio plan into a proven production route." : null
  );

  const variantAssets = Array.isArray(variantManifest?.assets) ? variantManifest.assets : [];
  const targetCount = Number(variantManifest?.plan_target_count || variantManifest?.target_count || 0);
  const readyCount = Number(variantManifest?.plan_ready_count || variantManifest?.ready_count || 0);
  const manifestComplete = finishedPassthrough || item4VariantManifestPlanComplete(variantManifest, plan, masterAssets);

  addCheck(
    "variant_manifest_complete",
    manifestComplete,
    finishedPassthrough ? null : "The platform-ready variant manifest is not complete."
  );

  if (!finishedPassthrough) {
  for (const routeRow of routeRows.filter(row => row.ready && row.aspect_ratio)) {
    const missing = variantAssets.filter(asset => {
      const variant = asset?.variants?.[routeRow.aspect_ratio];
      return !variant ||
        !String(variant?.google_drive_file_id || "").trim() ||
        !/^rec[A-Za-z0-9]+$/.test(String(variant?.media_asset_record_id || "").trim());
    });
    if (missing.length) {
      issues.push(`${routeRow.platform} / ${routeRow.output_type} is missing ${routeRow.aspect_ratio} authoritative variant coverage for ${missing.length} source asset(s).`);
    }
  }
  }

  const notes = [];
  if (!finishedPassthrough) {
  for (const routeRow of routeRows.filter(row => row.ready && row.aspect_ratio)) {
    const unavailable = variantAssets.filter(asset => {
      const variant = asset?.variants?.[routeRow.aspect_ratio];
      return !String(variant?.preview_url || "").trim();
    });
    if (unavailable.length) {
      notes.push("A preview image is still catching up. The platform crops are already saved.");
    }
  }

  if (!variantsAlreadyReady) {
  const queueRows = await item4VariantQueueRows(env, requestRecord.id);
  const variantQueueRows = queueRows.filter(row =>
    String(f(row, "Asset_Kind") || "").trim() === "Platform Variant" &&
    String(f(row, "Transfer_Status") || "").trim() === "Ready"
  );

  for (const routeRow of routeRows.filter(row => row.ready && row.aspect_ratio)) {
    const videoPassthrough = variantAssets.length > 0 && variantAssets.every((asset) => {
      const variant = asset?.variants?.[routeRow.aspect_ratio];
      return String(variant?.recipe_version || "") === "video-passthrough"
        && String(variant?.google_drive_file_id || "").trim()
        && /^rec[A-Za-z0-9]+$/.test(String(variant?.media_asset_record_id || "").trim());
    });
    if (videoPassthrough) continue;
    const expectedId = routeRow.record_id;
    const matching = variantQueueRows.filter(row => String(f(row, "Aspect_Ratio") || "").trim() === routeRow.aspect_ratio);
    const missingLinks = matching.filter(row => !arrayOrEmpty(f(row, "Target_Production_Request_Outputs")).includes(expectedId));
    if (!matching.length || missingLinks.length) {
      issues.push(`${routeRow.platform} / ${routeRow.output_type} is not fully linked from the ${routeRow.aspect_ratio} source variants to its Production Request Output.`);
    }
  }
  }
  } else {
    notes.push("Finished file passthrough. Crops, Remotion, and lettering are skipped.");
  }

  const ideaLinks = arrayOrEmpty(f(requestRecord, "Idea_Candidate"));
  addCheck(
    "single_idea_source",
    ideaLinks.length === 1,
    "Production Request must be linked to exactly one Idea Candidate before promotion."
  );

  let resolvedIdea = ideaRecord;
  if (!resolvedIdea && ideaLinks.length === 1) {
    resolvedIdea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaLinks[0]);
  }

  if (resolvedIdea) {
    const title = String(f(resolvedIdea, "Candidate_Title") || "").trim();
    addCheck("idea_title_present", Boolean(title), "The linked Idea Candidate requires a title before promotion.");
    const summary = String(f(resolvedIdea, "Idea_Summary") || "").trim();
    if (!summary && title) {
      notes.push("Studio will write a short summary automatically when you approve.");
    }
  }

  const compatibility = productionRequestCompatibilityIssues(requestRecord);
  if (compatibility.length) issues.push(...compatibility);
  warnings.push(...productionRequestAudioPlatformWarnings(requestRecord, routeRows));
  if (routeRows.some((row) => row.output_type === "Story" && (row.platform === "Instagram" || row.platform === "Facebook"))) {
    notes.push("Instagram and Facebook Stories will be a 10-second clip from the first vertical photo, with a slight zoom and your music. They do not inherit the 30-second main-video length.");
  }

  return {
    ready: issues.length === 0,
    request_record_id: requestRecord.id,
    production_request_id: f(requestRecord, "Production_Request_ID"),
    master_asset_count: Array.isArray(masterAssets) ? masterAssets.length : 0,
    enabled_output_count: outputRows.length,
    route_count: routeRows.filter(row => row.ready).length,
    variant_target_count: targetCount,
    variant_ready_count: readyCount,
    routes: routeRows,
    checks,
    warnings,
    notes: [...new Set(notes.filter(Boolean))],
    issues: [...new Set(issues)],
    idea_summary_mode: resolvedIdea && String(f(resolvedIdea, "Idea_Summary") || "").trim() ? "existing" : "derive-on-promotion",
  };
}
/*__STUDIO_WORKER_END:item4SourceToProductionBridgePreflight__*/

export async function productionRequestBridgePreflightRoute(request, env, url, authorization) {
  const recordId = productionRequestBridgeRecordIdFromPath(url);
  const requestRecord = await loadAuthorizedProductionRequest(env, recordId, authorization);
  const preflight = await item4SourceToProductionBridgePreflight(env, requestRecord);

  return respond(request, env, {
    ok: true,
    bridge: "item4-source-to-production-v1",
    ...preflight,
    message: preflight.ready
      ? "Ready to approve."
      : "This request still needs a small fix before approve.",
  });
}
/*__STUDIO_WORKER_END:productionRequestBridgePreflightRoute__*/

export function productionRequestPromotionRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/production-requests\/(rec[A-Za-z0-9]+)\/promote$/);
  if (!match) throw new HttpError(400, "Invalid Production Request promotion route");
  return match[1];
}
/*__STUDIO_WORKER_END:productionRequestPromotionRecordIdFromPath__*/

export function linkedContentItemRecordId(ideaRecord) {
  const links = Array.isArray(f(ideaRecord, "Content Items")) ? f(ideaRecord, "Content Items") : [];
  const promotedId = String(f(ideaRecord, "Promoted_Content_Record_ID") || "").trim();
  const candidate = links.find((id) => /^rec[A-Za-z0-9]+$/.test(String(id || ""))) ||
    (/^rec[A-Za-z0-9]+$/.test(promotedId) ? promotedId : null);
  return candidate || null;
}
/*__STUDIO_WORKER_END:linkedContentItemRecordId__*/

export function studioOutputSupportsStudioAudio(platform, outputType) {
  const spec = STUDIO_OUTPUT_ROUTE_SPECS[`${String(platform || "").trim()}::${String(outputType || "").trim()}`];
  const family = String(spec?.pipeline_family || "").trim();
  return family === "Video" || family === "Slideshow Video" || family === "Story";
}
/*__STUDIO_WORKER_END:studioOutputSupportsStudioAudio__*/

export function productionRequestWantsStudioAudio(record) {
  const musicMode = String(f(record, "Background_Music_Mode") || "").trim();
  const voiceMode = String(f(record, "Voiceover_Mode") || "").trim();
  const musicLinks = Array.isArray(f(record, "Selected_Music_Asset")) ? f(record, "Selected_Music_Asset") : [];
  return musicMode === "Yes" || voiceMode === "Yes" || musicLinks.length > 0;
}
/*__STUDIO_WORKER_END:productionRequestWantsStudioAudio__*/

export function productionRequestAudioPlatformWarnings(record, routeRows = []) {
  if (!productionRequestWantsStudioAudio(record)) return [];
  const rows = Array.isArray(routeRows) && routeRows.length
    ? routeRows
    : ((item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null) || {}).items || []).map((item) => ({
        platform: item?.platform,
        output_type: item?.output_type,
      }));
  const silent = rows.filter((row) => {
    const platform = String(row?.platform || "").trim();
    const outputType = String(row?.output_type || "").trim();
    return platform && outputType && !studioOutputSupportsStudioAudio(platform, outputType);
  });
  if (!silent.length) return [];
  const labels = [...new Set(silent.map((row) => `${String(row.platform).trim()} ${String(row.output_type).trim()}`))];
  return [`Music and voiceover play on video outputs. They are not used on ${labels.join(", ")}.`];
}
/*__STUDIO_WORKER_END:productionRequestAudioPlatformWarnings__*/

export function productionRequestCompatibilityIssues(record) {
  const issues = [];
  const contentType = String(f(record, "Master_Content_Type") || "").trim();
  const platforms = Array.isArray(f(record, "Target_Platforms")) ? f(record, "Target_Platforms") : [];

  if (!contentType) issues.push("Choose a Master content type.");
  if (!platforms.length) issues.push("Choose at least one Target platform.");

  // Keep only genuinely unsupported publishing targets blocked.
  const unsupportedPlatforms = platforms.filter((platform) =>
    !["Instagram", "Facebook", "TikTok", "YouTube"].includes(String(platform || ""))
  );
  if (unsupportedPlatforms.length) {
    issues.push(`Publishing is not yet productionized for: ${unsupportedPlatforms.join(", ")}.`);
  }

  // R2/R2B now consume AI decides, Exact, and Target range clip-count directives.
  if (["Vertical Short Video", "Longform Video", "Story"].includes(contentType)) {
    const mode = String(f(record, "Video_Clip_Count_Mode") || "AI decides").trim();
    const exact = Number(f(record, "Video_Clip_Count_Exact"));
    const min = Number(f(record, "Video_Clip_Count_Min"));
    const max = Number(f(record, "Video_Clip_Count_Max"));

    if (!["AI decides", "Exact", "Target range"].includes(mode)) {
      issues.push("Video clip count mode must be AI decides, Exact, or Target range.");
    }

    if (mode === "Exact") {
      if (!Number.isInteger(exact) || exact < 1 || exact > 60) {
        issues.push("Enter an exact video clip count from 1 through 60.");
      }
    }

    if (mode === "Target range") {
      if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min < 1 ||
        max > 60 ||
        min > max
      ) {
        issues.push("Enter a valid video clip-count range from 1 through 60 with minimum less than or equal to maximum.");
      }
    }
  }

  // C1 v26 consumes AI decides, Exact, and Target range carousel slide-count directives.
  if (contentType === "Carousel") {
    const mode = String(f(record, "Carousel_Slide_Count_Mode") || "AI decides").trim();
    const exact = Number(f(record, "Carousel_Slide_Count_Exact"));
    const min = Number(f(record, "Carousel_Slide_Count_Min"));
    const max = Number(f(record, "Carousel_Slide_Count_Max"));

    if (!["AI decides", "Exact", "Target range"].includes(mode)) {
      issues.push("Carousel slide count mode must be AI decides, Exact, or Target range.");
    }

    if (mode === "Exact") {
      if (!Number.isInteger(exact) || exact < 1) {
        issues.push("Enter a valid exact carousel slide count of 1 or more.");
      }
    }

    if (mode === "Target range") {
      if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min < 1 ||
        min > max
      ) {
        issues.push("Enter a valid carousel slide-count range with minimum at least 1 and minimum less than or equal to maximum.");
      }
    }
  }

  const titleMode = String(f(record, "Title_Mode") || "AI decides").trim();
  const captionMode = String(f(record, "Caption_Mode") || "AI decides").trim();
  const scriptMode = String(f(record, "Script_Mode") || "AI decides").trim();
  const requestedTitle = String(f(record, "Requested_Title") || "").trim();
  const requestedCaption = String(f(record, "Requested_Caption") || "").trim();
  const requestedScript = String(f(record, "Requested_Script") || "").trim();

  for (const [label, mode] of [
    ["Title", titleMode],
    ["Caption", captionMode],
    ["Script", scriptMode],
  ]) {
    if (!["AI decides", "Force exact", "AI improve", "Leave blank"].includes(mode)) {
      issues.push(`${label} control must be AI decides, Force exact, AI improve, or Leave blank.`);
    }
  }

  // P1 v2.2 deterministically consumes Force exact title/caption/script.
  // Caption and Script AI improve are also persisted by P1.
  if (titleMode === "Force exact" && !requestedTitle) {
    issues.push("Enter the exact title text when Title control is Force exact.");
  }
  if (captionMode === "Force exact" && !requestedCaption) {
    issues.push("Enter the exact caption text when Caption control is Force exact.");
  }
  if (scriptMode === "Force exact" && !requestedScript) {
    issues.push("Enter the exact script text when Script control is Force exact.");
  }
  if (captionMode === "AI improve" && !requestedCaption) {
    issues.push("Enter a draft caption when Caption control is AI improve.");
  }
  if (scriptMode === "AI improve" && !requestedScript) {
    issues.push("Enter a draft script when Script control is AI improve.");
  }

  // Keep this one guard until P1 has a persisted AI-improved title output.
  // P1 v2.2 uses an AI-improve title as package direction but leaves Content_Title unchanged.
  if (titleMode === "AI improve") {
    issues.push("AI improve for Title is not fully persisted yet. Use AI decides or Force exact for Title.");
  }

  const notes = String(f(record, "Production_Notes") || "").trim();
  // Timed Script Mode stores the authoritative timeline on this field. The NYC
  // subway table is about 3.6k characters, so the old 3000 cap rejected Approve
  // after a successful Save. Match the save validator.
  if (notes.length > 10000) {
    issues.push("Production notes must be 10000 characters or fewer.");
  }

  return issues;
}
/*__STUDIO_WORKER_END:productionRequestCompatibilityIssues__*/

export function promotionThumbnailTriState(mode) {
  const raw = String(mode || "Use Profile Default").trim() || "Use Profile Default";
  if (raw === "Use Profile Default") return "Use Profile Default";
  if (item4ThumbnailSource(raw) === "none") return "No";
  return "Yes";
}
/*__STUDIO_WORKER_END:promotionThumbnailTriState__*/

export function promotionInputFromProductionRequest(record) {
  const issues = productionRequestCompatibilityIssues(record);
  if (issues.length) {
    throw new HttpError(409, `Production Request is saved, but cannot be promoted through the current I3/I4 contract yet: ${issues.join(" ")}`);
  }

  const contentType = String(f(record, "Master_Content_Type") || "").trim();
  const platforms = Array.isArray(f(record, "Target_Platforms")) ? f(record, "Target_Platforms") : [];
  const videoMode = String(f(record, "Video_Clip_Count_Mode") || "AI decides").trim();
  const carouselMode = String(f(record, "Carousel_Slide_Count_Mode") || "AI decides").trim();

  return cleanPromotionPayload({
    content_type: contentType,
    platforms,
    include_voiceover: String(f(record, "Voiceover_Mode") || "Use Profile Default"),
    include_background_music: String(f(record, "Background_Music_Mode") || "Use Profile Default"),
    include_thumbnail: promotionThumbnailTriState(f(record, "Thumbnail_Mode")),
    video_duration: f(record, "Video_Duration_Seconds") ?? 30,
    video_clip_count: videoMode === "Exact" ? f(record, "Video_Clip_Count_Exact") : "Auto",
    voiceover_tail_seconds: 0,
    carousel_slide_count: carouselMode === "Exact" ? f(record, "Carousel_Slide_Count_Exact") : 5,
    carousel_image_mode: String(f(record, "Carousel_Image_Mode") || "Make AI Generated"),
    production_notes: String(f(record, "Production_Notes") || "").trim(),
  });
}
/*__STUDIO_WORKER_END:promotionInputFromProductionRequest__*/

export async function updateProductionRequestPromotionState(env, recordId, fields) {
  return airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        ...fields,
        Updated_At: new Date().toISOString(),
      },
      typecast: false,
    }),
  });
}
/*__STUDIO_WORKER_END:updateProductionRequestPromotionState__*/

export function stripFactoryRevisionNote(notes) {
  return String(notes || "")
    .split(/\r?\n/)
    .filter((line) => !String(line || "").trim().startsWith(FACTORY_REVISION_NOTE_PREFIX))
    .join("\n")
    .trim();
}
/*__STUDIO_WORKER_END:stripFactoryRevisionNote__*/

export function productionRequestRevisionOpen(record) {
  return String(f(record, "Production_Notes") || "")
    .split(/\r?\n/)
    .some((line) => String(line || "").trim().startsWith(FACTORY_REVISION_NOTE_PREFIX));
}
/*__STUDIO_WORKER_END:productionRequestRevisionOpen__*/

export function withFactoryRevisionOpen(notes, { actor = "", stamp = null } = {}) {
  const clean = stripFactoryRevisionNote(notes);
  const at = String(stamp || new Date().toISOString()).trim();
  const who = String(actor || "").trim().replace(/\s+/g, "_").slice(0, 120);
  const marker = `${FACTORY_REVISION_NOTE_PREFIX} at=${at}${who ? ` by=${who}` : ""}`;
  return [clean, marker].filter(Boolean).join("\n").slice(0, 10000);
}
/*__STUDIO_WORKER_END:withFactoryRevisionOpen__*/

export function productionRequestEditable(record) {
  const status = String(f(record, "Request_Status") || "").trim();
  return ["Draft", "Ready"].includes(status) || productionRequestRevisionOpen(record);
}

/*__STUDIO_WORKER_END:productionRequestEditable__*/

export function productionRequestSyncRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/production-requests\/(rec[A-Za-z0-9]+)\/sync-directives$/);
  if (!match) throw new HttpError(400, "Invalid Production Request directive-sync route");
  return match[1];
}
/*__STUDIO_WORKER_END:productionRequestSyncRecordIdFromPath__*/

export function productionRequestTimedScriptRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/production-requests\/(rec[A-Za-z0-9]+)\/timed-script$/);
  if (!match) throw new HttpError(400, "Invalid timed-script route");
  return match[1];
}
/*__STUDIO_WORKER_END:productionRequestTimedScriptRecordIdFromPath__*/

export async function loadContentPlatformOutputs(env, contentId) {
  const content = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId);
  const links = f(content, "Platform Outputs");
  const ids = [...new Set((Array.isArray(links) ? links : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))].slice(0, 50);
  if (!ids.length) return [];
  return Promise.all(ids.map((id) => airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id)));
}
/*__STUDIO_WORKER_END:loadContentPlatformOutputs__*/

export function outputNeedsTimedScriptRerender(record) {
  if (outputAlreadyApprovedForPublishing(record)) return false;
  const outputStatus = String(f(record, "Output_Status") || "").trim();
  return outputStatus === "Ready for Review"
    || outputStatus === "In Production"
    || Boolean(String(f(record, "Final_File_URL") || "").trim())
    || Boolean(String(f(record, "Studio_Preview_URL") || "").trim());
}
/*__STUDIO_WORKER_END:outputNeedsTimedScriptRerender__*/

export function outputAlreadyApprovedForPublishing(record) {
  const output = String(f(record, "Output_Status") || "").trim().toLowerCase();
  const publish = String(f(record, "Publish_Status") || "").trim().toLowerCase();
  return output === "published"
    || output === "approved for publishing"
    || publish === "published"
    || publish === "publishing";
}
/*__STUDIO_WORKER_END:outputAlreadyApprovedForPublishing__*/

export async function applyPromotedTimedScriptRoute(request, env, url, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const recordId = productionRequestTimedScriptRecordIdFromPath(url);
  const existing = await loadAuthorizedProductionRequest(env, recordId, authorization);
  const status = String(f(existing, "Request_Status") || "").trim();
  if (status !== "Promoted") {
    throw new HttpError(409, "Save this draft, then Approve. A timed script can replace narration only after the request is already in production.");
  }

  const notes = mergeProductionRequestNotes(
    f(existing, "Production_Notes"),
    String(payload?.production_notes || "")
  );
  if (!/\[timed-script\]/i.test(notes)) {
    throw new HttpError(400, "Paste a timed script before applying it.");
  }
  if (notes.length > 10000) throw new HttpError(400, "Production notes must be 10000 characters or fewer");

  const script = String(payload?.requested_script || "").trim();
  if (!script) throw new HttpError(400, "The timed script has no narration.");
  if (script.length > 25000) throw new HttpError(400, "Requested script must be 25000 characters or fewer");
  const videoDurationSeconds = nullableWholeSeconds(payload?.video_duration_seconds, 5, 600, "Video duration");

  const contentId = studioFirstLinkedId(f(existing, "Promoted_Content_Item"));
  if (!contentId) throw new HttpError(409, "This request has no content item to re-render.");

  // ARRAYJOIN on the linked Content Item returns the display name, not the
  // record id, so a FIND(rec...) lookup misses every finished video and the
  // resume job immediately reports done.
  const outputs = await loadContentPlatformOutputs(env, contentId);
  if (!outputs.length) {
    throw new HttpError(409, "This piece has no platform videos to render again.");
  }
  if (outputs.some(outputAlreadyApprovedForPublishing)) {
    throw new HttpError(409, "This piece is already approved for publishing, so the timed script was not changed.");
  }

  const now = new Date().toISOString();
  const updated = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Production_Notes: notes,
        Script_Mode: "Force exact",
        Requested_Script: script,
        Video_Duration_Seconds: videoDurationSeconds,
        Voiceover_Tail_Seconds: 0,
        Voiceover_Mode: "Yes",
        Updated_At: now,
      },
      typecast: true,
    }),
  });

  // Timed-script still windows are VO-driven after P2. Always discard prior audio
  // so Apply cannot restamp import/UI clocks against a shorter existing MP3
  // (NYC Subway Etiquette CI 320: 23.6s notes vs 21.4s Voiceover_URL).
  await syncProductionRequestDirectivesToContentItem(env, updated, contentId, {
    invalidateVoiceover: true,
  });

  const resetRows = outputs
    .filter((output) => outputNeedsTimedScriptRerender(output))
    .map((output) => ({
      id: output.id,
      fields: studioSharedRenderRerenderFields(),
    }));
  if (!resetRows.length) {
    throw new HttpError(409, "This piece is not waiting in review, so the timed script was not sent back to render.");
  }
  await airtableBatchUpdate(env, env.AIRTABLE_OUTPUT_TABLE_ID, resetRows, { typecast: true });

  let rerenderError = "";
  try {
    await enqueueStudioProductionJob(env, recordId, { resume: true });
  } catch (error) {
    rerenderError = error instanceof Error ? error.message : String(error || "render did not restart");
  }

  return respond(request, env, {
    ok: true,
    applied: true,
    rerender_started: !rerenderError,
    production_request: mapProductionRequestLight(updated),
    content_item_record_id: contentId,
    outputs_requeued: resetRows.length,
    message: rerenderError
      ? `Your script is saved. Rendering did not restart: ${rerenderError}`
      : "Your script is saved. This piece left Awaiting Approval and is rendering again. It does not publish.",
  });
}
/*__STUDIO_WORKER_END:applyPromotedTimedScriptRoute__*/

export async function productionRequestPreferredMusic(env, requestRecord) {
  const links = Array.isArray(f(requestRecord, "Selected_Music_Asset"))
    ? f(requestRecord, "Selected_Music_Asset")
    : [];

  if (!links.length) {
    return {
      record_id: null,
      url: null,
      google_drive_file_id: null,
      name: null,
    };
  }

  const recordId = links[0];
  const media = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);

  return {
    record_id: recordId,
    url: String(f(media, "Google Drive URL") || "").trim() || null,
    google_drive_file_id: String(f(media, "Google Drive File ID") || "").trim() || null,
    name: String(f(media, "Asset Name") || "").trim() || null,
  };
}
/*__STUDIO_WORKER_END:productionRequestPreferredMusic__*/

export function productionRequestDirectiveSnapshot(requestRecord, music) {
  return {
    production_request_record_id: requestRecord.id,
    production_request_id: f(requestRecord, "Production_Request_ID"),
    request_status: f(requestRecord, "Request_Status"),
    master_content_type: f(requestRecord, "Master_Content_Type"),
    target_platforms: f(requestRecord, "Target_Platforms") || [],
    voiceover_mode: f(requestRecord, "Voiceover_Mode"),
    voice_id: f(requestRecord, "Voice_ID") || null,
    voice_name: f(requestRecord, "Voice_Name") || null,
    background_music_mode: f(requestRecord, "Background_Music_Mode"),
    thumbnail_mode: f(requestRecord, "Thumbnail_Mode"),
    video_duration_seconds: f(requestRecord, "Video_Duration_Seconds"),
    voiceover_duration_seconds: f(requestRecord, "Voiceover_Duration_Seconds"),
    music_start_seconds: f(requestRecord, "Music_Start_Seconds"),
    video_clip_count_mode: f(requestRecord, "Video_Clip_Count_Mode"),
    video_clip_count_exact: f(requestRecord, "Video_Clip_Count_Exact"),
    video_clip_count_min: f(requestRecord, "Video_Clip_Count_Min"),
    video_clip_count_max: f(requestRecord, "Video_Clip_Count_Max"),
    carousel_slide_count_mode: f(requestRecord, "Carousel_Slide_Count_Mode"),
    carousel_slide_count_exact: f(requestRecord, "Carousel_Slide_Count_Exact"),
    carousel_slide_count_min: f(requestRecord, "Carousel_Slide_Count_Min"),
    carousel_slide_count_max: f(requestRecord, "Carousel_Slide_Count_Max"),
    carousel_image_mode: f(requestRecord, "Carousel_Image_Mode"),
    voiceover_tail_seconds: f(requestRecord, "Voiceover_Tail_Seconds"),
    selected_music: music,
    title_mode: f(requestRecord, "Title_Mode"),
    requested_title: f(requestRecord, "Requested_Title"),
    caption_mode: f(requestRecord, "Caption_Mode"),
    requested_caption: f(requestRecord, "Requested_Caption"),
    script_mode: f(requestRecord, "Script_Mode"),
    requested_script: f(requestRecord, "Requested_Script"),
    production_notes: f(requestRecord, "Production_Notes"),
    submitted_at: f(requestRecord, "Submitted_At"),
    applied_at: new Date().toISOString(),
  };
}
/*__STUDIO_WORKER_END:productionRequestDirectiveSnapshot__*/

export async function syncProductionRequestDirectivesToContentItem(env, requestRecord, contentItemId, options = {}) {
  if (!/^rec[A-Za-z0-9]+$/.test(String(contentItemId || ""))) {
    throw new HttpError(409, "A promoted Content Item is required before advanced directives can be applied");
  }

  const music = await productionRequestPreferredMusic(env, requestRecord);
  const appliedAt = new Date().toISOString();
  const snapshot = productionRequestDirectiveSnapshot(requestRecord, music);
  const existingContentItem = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId);
  const requestedScriptMode = String(f(requestRecord, "Script_Mode") || "AI decides").trim();
  const requestedScript = String(f(requestRecord, "Requested_Script") || "").trim();
  const previousRequestedScriptMode = String(f(existingContentItem, "Requested_Script_Mode") || "").trim();
  const previousRequestedScript = String(f(existingContentItem, "Requested_Script") || "").trim();
  const previousVoiceoverScript = String(f(existingContentItem, "Voiceover_Script") || "").trim();
  const previousNotes = String(f(existingContentItem, "Production_Request_Notes") || "").trim();
  const nextNotes = String(f(requestRecord, "Production_Notes") || "").trim();
  const timedScriptNotesChanged = /\[timed-script\]/i.test(nextNotes) && previousNotes !== nextNotes;
  const exactScriptChanged = requestedScriptMode === "Force exact"
    && Boolean(requestedScript)
    && (
      previousRequestedScriptMode !== "Force exact"
      || previousRequestedScript !== requestedScript
      || previousVoiceoverScript !== requestedScript
    );
  // Timed-script Apply can keep the same words while rewriting scene clocks.
  // Those clocks are only hints until P2 measures speech — keep prior MP3 and
  // stills desync (CI 320). Always drop VO when the timed-script directive moves
  // or when the caller forces invalidation.
  const invalidateVoiceover = Boolean(options.invalidateVoiceover)
    || exactScriptChanged
    || timedScriptNotesChanged;

  const fields = {
    Production_Request: [requestRecord.id],
    Test_Run_ID: String(f(requestRecord, "Test_Run_ID") || "").trim() || null,
    Requested_Title_Mode: String(f(requestRecord, "Title_Mode") || "AI decides"),
    Requested_Title: String(f(requestRecord, "Requested_Title") || "").trim() || null,
    Requested_Caption_Mode: String(f(requestRecord, "Caption_Mode") || "AI decides"),
    Requested_Caption: String(f(requestRecord, "Requested_Caption") || "").trim() || null,
    Include_Voiceover: item4StudioDirectiveYes(f(requestRecord, "Voiceover_Mode")) ? "Yes" : "No",
    Include_Background_Music: item4StudioDirectiveYes(f(requestRecord, "Background_Music_Mode")) ? "Yes" : "No",
    Carousel_Image_Mode: String(f(requestRecord, "Carousel_Image_Mode") || "").trim() || null,
    Content_Duration: f(requestRecord, "Video_Duration_Seconds") ?? null,
    Voiceover_Duration_Seconds: f(requestRecord, "Voiceover_Duration_Seconds") ?? null,
    Music_Start_Seconds: f(requestRecord, "Music_Start_Seconds") ?? 0,
    Voiceover_Tail_Seconds: f(requestRecord, "Voiceover_Tail_Seconds") ?? null,
    Carousel_Slide_Count: f(requestRecord, "Carousel_Slide_Count_Exact") ?? null,
    Requested_Script_Mode: String(f(requestRecord, "Script_Mode") || "AI decides"),
    Requested_Script: String(f(requestRecord, "Requested_Script") || "").trim() || null,
    Production_Request_Notes: String(f(requestRecord, "Production_Notes") || "").trim() || null,
    Primary_Location: String(f(requestRecord, "Primary_Location") || "").trim() || null,
    Requested_Video_Clip_Count_Mode: String(f(requestRecord, "Video_Clip_Count_Mode") || "AI decides"),
    Requested_Video_Clip_Count_Min: f(requestRecord, "Video_Clip_Count_Min") ?? null,
    Requested_Video_Clip_Count_Max: f(requestRecord, "Video_Clip_Count_Max") ?? null,
    Requested_Carousel_Slide_Count_Mode: String(f(requestRecord, "Carousel_Slide_Count_Mode") || "AI decides"),
    Requested_Carousel_Slide_Count_Min: f(requestRecord, "Carousel_Slide_Count_Min") ?? null,
    Requested_Carousel_Slide_Count_Max: f(requestRecord, "Carousel_Slide_Count_Max") ?? null,
    Preferred_Music_Asset: music.record_id ? [music.record_id] : [],
    Preferred_Music_URL: music.url,
    Preferred_Music_Google_Drive_File_ID: music.google_drive_file_id,
    Production_Request_Directives_JSON: JSON.stringify(snapshot),
    Production_Request_Applied_At: appliedAt,
  };

  // Force exact is execution authority, not merely descriptive metadata. If the
  // exact script or timed-script timeline changed after P2 already generated
  // audio, discard that stale audio so P2 remeasures and rewrites scene windows
  // before stamp/R4 can render.
  if (requestedScriptMode === "Force exact" && requestedScript) {
    fields.Voiceover_Script = requestedScript;
    fields.Script_Status = "Generated";
    if (item4StudioDirectiveYes(f(requestRecord, "Voiceover_Mode"))) {
      fields.Voiceover_Status = "Ready";
      fields.Content_Status = "Ready for Voiceover";
    }
    if (invalidateVoiceover && String(f(existingContentItem, "Voiceover_URL") || "").trim()) {
      fields.Voiceover_URL = null;
      fields.Voiceover_Google_Drive_File_ID = null;
      fields.Voiceover_Normalization_Status = null;
      fields.Voiceover_Normalization_Details = null;
      fields.Voiceover_Normalized_At = null;
      fields.Voiceover_Duration_Seconds = null;
    }
  }

  const requestedVoice = requestedVoiceFromProductionRequest(requestRecord);
  if (requestedVoice.voice_id) {
    fields.Voice_ID = requestedVoice.voice_id;
    fields.Voice_Name = requestedVoice.voice_name;
    if (requestedVoice.voice_choice) {
      fields.Voice = requestedVoice.voice_choice;
    } else {
      // Legacy Voice is Kate/George only. Clear the Airtable default Kate when the
      // authoritative voice is Mary/Hank/etc so Pipeline does not display the wrong name.
      fields.Voice = null;
    }
  }

  const contentItem = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: false }),
  });

  return {
    content_item: contentItem,
    applied_at: appliedAt,
    music,
    directive_snapshot: snapshot,
  };
}
/*__STUDIO_WORKER_END:syncProductionRequestDirectivesToContentItem__*/

export async function syncProductionRequestDirectivesRoute(request, env, url, authorization) {
  try { await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const requestRecordId = productionRequestSyncRecordIdFromPath(url);
  const requestRecord = await loadAuthorizedProductionRequest(env, requestRecordId, authorization);
  const requestStatus = String(f(requestRecord, "Request_Status") || "").trim();

  if (requestStatus !== "Promoted") {
    throw new HttpError(409, "Advanced directives can be synchronized only after the Production Request is Promoted");
  }

  const contentLinks = Array.isArray(f(requestRecord, "Promoted_Content_Item"))
    ? f(requestRecord, "Promoted_Content_Item")
    : [];

  const contentItemId = contentLinks.find((id) => /^rec[A-Za-z0-9]+$/.test(String(id || "")));
  if (!contentItemId) {
    throw new HttpError(409, "The Production Request does not have a linked Promoted Content Item");
  }

  const synced = await syncProductionRequestDirectivesToContentItem(env, requestRecord, contentItemId);

  return respond(request, env, {
    ok: true,
    synced: true,
    production_request_record_id: requestRecord.id,
    production_request_id: f(requestRecord, "Production_Request_ID"),
    content_item_record_id: contentItemId,
    applied_at: synced.applied_at,
    preferred_music: synced.music,
    message: "Advanced Production Request directives were synchronized to the promoted Content Item",
  });
}

/*__STUDIO_WORKER_END:syncProductionRequestDirectivesRoute__*/

export function studioOutputRouteSpec(row) {
  return STUDIO_OUTPUT_ROUTE_SPECS[
    `${String(f(row, "Platform") || "").trim()}::${String(f(row, "Output_Type") || "").trim()}`
  ] || null;
}
/*__STUDIO_WORKER_END:studioOutputRouteSpec__*/

export function stringOrNull(value) {
  const s = String(value ?? "").trim();
  return s || null;
}
/*__STUDIO_WORKER_END:stringOrNull__*/

export function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}
/*__STUDIO_WORKER_END:arrayOrEmpty__*/

export function resolvedOutputTriState(outputRow, overrideField, requestRecord, requestField, profileDefault) {
  const override = String(f(outputRow, overrideField) || "Inherit").trim() || "Inherit";

  if (override === "Yes" || override === "No") return override;
  if (override === "Use Profile Default") return profileDefault ? "Yes" : "No";

  const master = String(f(requestRecord, requestField) || "Use Profile Default").trim() || "Use Profile Default";
  if (master === "Yes" || master === "No") return master;
  return profileDefault ? "Yes" : "No";
}
/*__STUDIO_WORKER_END:resolvedOutputTriState__*/

export function resolvedThumbnailMode(outputRow, requestRecord, profileDefault) {
  const override = String(f(outputRow, "Thumbnail_Mode_Override") || "Inherit").trim() || "Inherit";
  if (override === "Yes" || override === "No" || item4ThumbnailSource(override) === "frame") {
    return item4ThumbnailSource(override) === "frame" ? "Use photo frame" : override;
  }
  if (override === "Use Profile Default") return profileDefault ? "Yes" : "No";
  const master = String(f(requestRecord, "Thumbnail_Mode") || "Yes").trim() || "Yes";
  if (item4ThumbnailSource(master) === "frame") return "Use photo frame";
  if (master === "Yes" || master === "No") return master;
  if (master === "Use Profile Default") return profileDefault ? "Yes" : "No";
  return profileDefault === false ? "No" : "Yes";
}
/*__STUDIO_WORKER_END:resolvedThumbnailMode__*/

export async function productionProfileDefaultsForParentContentItem(env, parentContentItem) {
  const profileLinks = arrayOrEmpty(f(parentContentItem, "Content_Profile"));
  if (!profileLinks.length) {
    return {
      include_voiceover: String(f(parentContentItem, "Include_Voiceover") || "No") === "Yes",
      include_background_music: String(f(parentContentItem, "Include_Background_Music") || "No") === "Yes",
      include_thumbnail: String(f(parentContentItem, "Include_Thumbnail") || "No") === "Yes",
      default_duration: Number(f(parentContentItem, "Content_Duration") || 30),
      default_video_clip_count: Number(f(parentContentItem, "Video_Clip_Count") || 7),
      default_carousel_slide_count: Number(f(parentContentItem, "Carousel_Slide_Count") || 5),
      default_carousel_image_mode: String(f(parentContentItem, "Carousel_Image_Mode") || "Make AI Generated"),
    };
  }

  try {
    const profile = await airtableFetch(env, "tblNYg2QB0BmmVACy", profileLinks[0]);
    const productionLinks = arrayOrEmpty(f(profile, "Production_Profile"));
    if (!productionLinks.length) throw new Error("No Production Profile");

    const production = await airtableFetch(env, "tblRT9xwcYJ8A5z4e", productionLinks[0]);
    return {
      include_voiceover: Boolean(f(production, "Include_Voiceover")),
      include_background_music: Boolean(f(production, "Include_Background_Music")),
      include_thumbnail: Boolean(f(production, "Include_Thumbnail")),
      default_duration: Number(f(production, "Default_Duration") || f(parentContentItem, "Content_Duration") || 30),
      default_video_clip_count: Number(f(production, "Default_Video_Clip_Count") || f(parentContentItem, "Video_Clip_Count") || 7),
      default_carousel_slide_count: Number(f(production, "Default_Carousel_Slide_Count") || f(parentContentItem, "Carousel_Slide_Count") || 5),
      default_carousel_image_mode: String(f(production, "Default_Carousel_Image_Mode") || f(parentContentItem, "Carousel_Image_Mode") || "Make AI Generated"),
    };
  } catch {
    return {
      include_voiceover: String(f(parentContentItem, "Include_Voiceover") || "No") === "Yes",
      include_background_music: String(f(parentContentItem, "Include_Background_Music") || "No") === "Yes",
      include_thumbnail: String(f(parentContentItem, "Include_Thumbnail") || "No") === "Yes",
      default_duration: Number(f(parentContentItem, "Content_Duration") || 30),
      default_video_clip_count: Number(f(parentContentItem, "Video_Clip_Count") || 7),
      default_carousel_slide_count: Number(f(parentContentItem, "Carousel_Slide_Count") || 5),
      default_carousel_image_mode: String(f(parentContentItem, "Carousel_Image_Mode") || "Make AI Generated"),
    };
  }
}
/*__STUDIO_WORKER_END:productionProfileDefaultsForParentContentItem__*/

export function emptyStudioMusic() {
  return {
    record_id: null,
    url: null,
    google_drive_file_id: null,
    name: null,
  };
}
/*__STUDIO_WORKER_END:emptyStudioMusic__*/

export function studioMusicFromMediaRecord(record) {
  if (!record?.id) return emptyStudioMusic();
  const fileId = googleDriveFileId(record);
  return {
    record_id: record.id,
    url: stringOrNull(f(record, "Google Drive URL")) || (fileId ? googleDriveDownloadUrl(fileId) : null),
    google_drive_file_id: fileId,
    name: stringOrNull(f(record, "Asset Name")),
  };
}
/*__STUDIO_WORKER_END:studioMusicFromMediaRecord__*/

export async function preferredMusicForProductionRequestOutput(env, outputRow, requestRecord) {
  const overrideLinks = arrayOrEmpty(f(outputRow, "Selected_Music_Asset_Override"));
  const masterLinks = arrayOrEmpty(f(requestRecord, "Selected_Music_Asset"));
  const recordId = overrideLinks[0] || masterLinks[0] || null;

  if (!recordId) return emptyStudioMusic();

  const media = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  return studioMusicFromMediaRecord(media);
}
/*__STUDIO_WORKER_END:preferredMusicForProductionRequestOutput__*/

export function studioCatalogMusicScore(record) {
  const name = String(f(record, "Asset Name") || "").toLowerCase();
  let value = 0;
  if (Boolean(f(record, "Studio_Favorite"))) value += 200;
  if (name.includes("cinematic")) value += 80;
  if (name.includes("drone")) value += 40;
  if (name.includes("epic")) value += 30;
  if (name.includes("night") || name.includes("city")) value += 20;
  if (name.includes("yoga") || name.includes("meditat") || name.includes("harp")) value -= 40;
  return value;
}
/*__STUDIO_WORKER_END:studioCatalogMusicScore__*/

export function pickCatalogFallbackMusicRecord(records, { random = Math.random } = {}) {
  const usable = (Array.isArray(records) ? records : [])
    .filter((record) => Boolean(studioMusicFromMediaRecord(record).url));
  if (!usable.length) return null;
  const ranked = [...usable].sort((a, b) => studioCatalogMusicScore(b) - studioCatalogMusicScore(a));
  const topScore = studioCatalogMusicScore(ranked[0]);
  const topTier = ranked.filter((record) => studioCatalogMusicScore(record) === topScore);
  const pool = topTier.length >= 2 ? topTier : ranked.slice(0, Math.min(8, ranked.length));
  const index = Math.floor(Number(random()) * pool.length) % pool.length;
  return pool[Math.max(0, index)] || ranked[0];
}
/*__STUDIO_WORKER_END:pickCatalogFallbackMusicRecord__*/

export async function catalogFallbackMusic(env) {
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
    limit: 50,
    filterFormula: "AND({Asset_Role}='Music',NOT({Do_Not_Use}))",
  });
  const picked = pickCatalogFallbackMusicRecord(records);
  return picked ? studioMusicFromMediaRecord(picked) : emptyStudioMusic();
}
/*__STUDIO_WORKER_END:catalogFallbackMusic__*/

export async function resolveStudioRenderMusic(env, outputRow, requestRecord, effective) {
  const mode = String(effective?.background_music_mode || "").trim().toLowerCase();
  const overrideLinks = arrayOrEmpty(f(outputRow, "Selected_Music_Asset_Override"));
  const masterLinks = arrayOrEmpty(f(requestRecord, "Selected_Music_Asset"));
  if (mode !== "yes" && !overrideLinks.length && !masterLinks.length) return emptyStudioMusic();
  const preferred = await preferredMusicForProductionRequestOutput(env, outputRow, requestRecord);
  if (preferred.url) return preferred;
  if (mode !== "yes") return preferred;
  return catalogFallbackMusic(env);
}
/*__STUDIO_WORKER_END:resolveStudioRenderMusic__*/

export function outputEffectiveChoice(outputRow, overrideField, requestRecord, requestField, fallback) {
  const override = String(f(outputRow, overrideField) || "Inherit").trim() || "Inherit";
  if (override !== "Inherit") return override;
  return String(f(requestRecord, requestField) || fallback).trim() || fallback;
}
/*__STUDIO_WORKER_END:outputEffectiveChoice__*/

export function outputEffectiveNumber(outputRow, overrideField, requestRecord, requestField, fallback) {
  const override = f(outputRow, overrideField);
  if (override !== null && override !== undefined && override !== "") return Number(override);
  const master = f(requestRecord, requestField);
  if (master !== null && master !== undefined && master !== "") return Number(master);
  return fallback;
}
/*__STUDIO_WORKER_END:outputEffectiveNumber__*/

export function outputEffectiveText(outputRow, overrideField, requestRecord, requestField) {
  const override = String(f(outputRow, overrideField) || "").trim();
  if (override) return override;
  return String(f(requestRecord, requestField) || "").trim();
}
/*__STUDIO_WORKER_END:outputEffectiveText__*/

export function outputWorkItemIssues(outputRow, route, effective) {
  const issues = [];

  if (!route) {
    issues.push("This platform/output pair does not yet have a proven production mapping.");
    return issues;
  }

  if (effective.video_clip_count_mode === "Exact" &&
      (!Number.isInteger(effective.video_clip_count_exact) ||
       effective.video_clip_count_exact < 1 ||
       effective.video_clip_count_exact > 60)) {
    issues.push("Exact video clip count is invalid.");
  }

  if (effective.video_clip_count_mode === "Target range" &&
      (!Number.isInteger(effective.video_clip_count_min) ||
       !Number.isInteger(effective.video_clip_count_max) ||
       effective.video_clip_count_min < 1 ||
       effective.video_clip_count_max > 60 ||
       effective.video_clip_count_min > effective.video_clip_count_max)) {
    issues.push("Video clip-count range is invalid.");
  }

  if (effective.carousel_slide_count_mode === "Exact" &&
      (!Number.isInteger(effective.carousel_slide_count_exact) ||
       effective.carousel_slide_count_exact < 1)) {
    issues.push("Exact carousel slide count is invalid.");
  }

  if (effective.carousel_slide_count_mode === "Target range" &&
      (!Number.isInteger(effective.carousel_slide_count_min) ||
       !Number.isInteger(effective.carousel_slide_count_max) ||
       effective.carousel_slide_count_min < 1 ||
       effective.carousel_slide_count_min > effective.carousel_slide_count_max)) {
    issues.push("Carousel slide-count range is invalid.");
  }

  if (effective.title_mode === "Force exact" && !effective.requested_title) {
    issues.push("Force exact title requires title text.");
  }
  if (effective.caption_mode === "Force exact" && !effective.requested_caption) {
    issues.push("Force exact caption requires caption text.");
  }
  if (effective.script_mode === "Force exact" && !effective.requested_script) {
    issues.push("Force exact script requires script text.");
  }

  return issues;
}
/*__STUDIO_WORKER_END:outputWorkItemIssues__*/

export async function buildOutputWorkItemEffective(env, outputRow, requestRecord, parentContentItem, profileDefaults) {
  const route = studioOutputRouteSpec(outputRow);

  const videoMode = outputEffectiveChoice(
    outputRow,
    "Video_Clip_Count_Mode_Override",
    requestRecord,
    "Video_Clip_Count_Mode",
    "AI decides"
  );
  const carouselMode = outputEffectiveChoice(
    outputRow,
    "Carousel_Slide_Count_Mode_Override",
    requestRecord,
    "Carousel_Slide_Count_Mode",
    "AI decides"
  );

  const effective = {
    platform: String(f(outputRow, "Platform") || "").trim(),
    output_type: String(f(outputRow, "Output_Type") || "").trim(),
    route,

    voiceover_mode: resolvedOutputTriState(
      outputRow,
      "Voiceover_Mode_Override",
      requestRecord,
      "Voiceover_Mode",
      profileDefaults.include_voiceover
    ),
    background_music_mode: resolvedOutputTriState(
      outputRow,
      "Background_Music_Mode_Override",
      requestRecord,
      "Background_Music_Mode",
      profileDefaults.include_background_music
    ),
    thumbnail_mode: studioIsFinishedPassthrough(requestRecord)
      ? "Yes"
      : resolvedThumbnailMode(
      outputRow,
      requestRecord,
      profileDefaults.include_thumbnail
    ),


    video_duration_seconds: item4ResolvedVideoDurationSeconds({
      storyTeaser: String(f(outputRow, "Output_Type") || "").trim() === "Story",
      clipCount: Number(
        outputEffectiveNumber(
          outputRow,
          "Video_Clip_Count_Exact_Override",
          requestRecord,
          "Video_Clip_Count_Exact",
          1
        )
      ) || 1,
      effective: {
        video_duration_seconds: outputEffectiveNumber(
          outputRow,
          "Video_Duration_Seconds_Override",
          requestRecord,
          "Video_Duration_Seconds",
          profileDefaults.default_duration
        ),
      },
      requestRecord,
      outputRow,
    }),
    voiceover_duration_seconds: outputEffectiveNumber(
      outputRow,
      "Voiceover_Duration_Seconds",
      requestRecord,
      "Voiceover_Duration_Seconds",
      Number(f(parentContentItem, "Voiceover_Duration_Seconds") || 0) || 0
    ),
    music_start_seconds: outputEffectiveNumber(
      outputRow,
      "Music_Start_Seconds",
      requestRecord,
      "Music_Start_Seconds",
      Number(f(parentContentItem, "Music_Start_Seconds") || 0)
    ),
    voiceover_tail_seconds: outputEffectiveNumber(
      outputRow,
      "Voiceover_Tail_Seconds_Override",
      requestRecord,
      "Voiceover_Tail_Seconds",
      Number(f(parentContentItem, "Voiceover_Tail_Seconds") || 0)
    ),

    video_clip_count_mode: videoMode,
    video_clip_count_exact: outputEffectiveNumber(
      outputRow,
      "Video_Clip_Count_Exact_Override",
      requestRecord,
      "Video_Clip_Count_Exact",
      profileDefaults.default_video_clip_count
    ),
    video_clip_count_min: outputEffectiveNumber(
      outputRow,
      "Video_Clip_Count_Min_Override",
      requestRecord,
      "Video_Clip_Count_Min",
      null
    ),
    video_clip_count_max: outputEffectiveNumber(
      outputRow,
      "Video_Clip_Count_Max_Override",
      requestRecord,
      "Video_Clip_Count_Max",
      null
    ),

    carousel_slide_count_mode: carouselMode,
    carousel_slide_count_exact: outputEffectiveNumber(
      outputRow,
      "Carousel_Slide_Count_Exact_Override",
      requestRecord,
      "Carousel_Slide_Count_Exact",
      profileDefaults.default_carousel_slide_count
    ),
    carousel_slide_count_min: outputEffectiveNumber(
      outputRow,
      "Carousel_Slide_Count_Min_Override",
      requestRecord,
      "Carousel_Slide_Count_Min",
      null
    ),
    carousel_slide_count_max: outputEffectiveNumber(
      outputRow,
      "Carousel_Slide_Count_Max_Override",
      requestRecord,
      "Carousel_Slide_Count_Max",
      null
    ),
    carousel_image_mode: outputEffectiveChoice(
      outputRow,
      "Carousel_Image_Mode_Override",
      requestRecord,
      "Carousel_Image_Mode",
      profileDefaults.default_carousel_image_mode
    ),

    title_mode: outputEffectiveChoice(outputRow, "Title_Mode_Override", requestRecord, "Title_Mode", "AI decides"),
    requested_title: outputEffectiveText(outputRow, "Requested_Title_Override", requestRecord, "Requested_Title"),
    caption_mode: outputEffectiveChoice(outputRow, "Caption_Mode_Override", requestRecord, "Caption_Mode", "AI decides"),
    requested_caption: outputEffectiveText(outputRow, "Requested_Caption_Override", requestRecord, "Requested_Caption"),
    script_mode: outputEffectiveChoice(outputRow, "Script_Mode_Override", requestRecord, "Script_Mode", "AI decides"),
    requested_script: outputEffectiveText(outputRow, "Requested_Script_Override", requestRecord, "Requested_Script"),

    output_notes: String(f(outputRow, "Output_Notes") || "").trim(),
    publish_mode: String(f(outputRow, "Publish_Mode") || "Inherit").trim() || "Inherit",
    scheduled_at: f(outputRow, "Scheduled_At") || null,
  };

  effective.music = await resolveStudioRenderMusic(env, outputRow, requestRecord, effective);
  const ezOrigin = String(f(requestRecord, "Production_Notes") || "").includes("origin=ez-button");
  if (ezOrigin) {
    const thumbnailOverride = String(f(outputRow, "Thumbnail_Mode_Override") || "Inherit").trim() || "Inherit";
    const thumbnailMaster = String(f(requestRecord, "Thumbnail_Mode") || "Use Profile Default").trim() || "Use Profile Default";
    if (thumbnailOverride === "No" || (thumbnailOverride === "Inherit" && thumbnailMaster === "No")) {
      effective.thumbnail_mode = "No";
    }
  }
  if (studioIsFinishedPassthrough(requestRecord)) effective.thumbnail_mode = "Yes";
  effective.issues = outputWorkItemIssues(outputRow, route, effective);
  return effective;
}
/*__STUDIO_WORKER_END:buildOutputWorkItemEffective__*/

export function copyWritableParentFields(parentContentItem) {
  const fields = {};
  const copy = (name) => {
    const value = f(parentContentItem, name);
    if (value !== null && value !== undefined && value !== "") fields[name] = value;
  };

  for (const name of [
    "Content_Profile",
    "Source_Candidate",
    "Primary_Location",
    "Neighborhood_or_Area",
    "Hook",
    "Idea_Summary",
    "Reviewer_Notes",
    "Required_Assets",
    "Suggested_Visuals",
    "Priority_Score",
    "Content_Themes",
    "Publish_Recommendation",
    "Voice",
    "Voice_ID",
    "Voice_Name",
  ]) {
    copy(name);
  }

  return fields;
}
/*__STUDIO_WORKER_END:copyWritableParentFields__*/

export async function item4ListParentCarouselSlides(env, parentId) {
  if (!/^rec[A-Za-z0-9]+$/.test(String(parentId || ""))) return [];
  // Prefer the parent Content Item's linked Carousel Slides IDs. Formula filters on
  // Deleted From Carousel were unreliable (`=0` matched nothing; concurrent cron
  // ticks also raced), which reseeded empty "Studio AI" slides forever and left
  // hundreds of links for C2 to iterate.
  try {
    const parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId);
    const linkedIds = [...new Set((Array.isArray(f(parent, "Carousel Slides")) ? f(parent, "Carousel Slides") : [])
      .map((id) => String(id || "").trim())
      .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
    if (!linkedIds.length) return [];
    const rows = [];
    for (let i = 0; i < linkedIds.length; i += 40) {
      const chunk = linkedIds.slice(i, i + 40);
      const orFind = chunk.map((id) => `RECORD_ID()="${id}"`).join(",");
      const page = await listRecords(env, "Carousel Slides", {
        limit: Math.min(100, chunk.length),
        filterFormula: `OR(${orFind})`,
      });
      rows.push(...page);
    }
    return rows.filter((row) => !Boolean(f(row, "Deleted From Carousel")));
  } catch (error) {
    console.warn("Studio list parent carousel slides failed", parentId, error);
    // Fail closed: never treat a list failure as "zero slides" or we reseed a storm.
    throw error;
  }
}
/*__STUDIO_WORKER_END:item4ListParentCarouselSlides__*/

export function item4StudioThemeTitle(requestRecord, parent) {
  return String(
    f(requestRecord, "Requested_Title")
    || (parent ? f(parent, "Content_Title") : "")
    || (parent ? f(parent, "Hook") : "")
    || ""
  ).trim();
}
/*__STUDIO_WORKER_END:item4StudioThemeTitle__*/

export function item4CaptionContextKey(value) {
  return String(value || "")
    .trim()
    .replace(/\.(?:jpe?g|png|gif|webp|heic|heif|mp4|mov|m4v|webm)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
/*__STUDIO_WORKER_END:item4CaptionContextKey__*/

export function item4AssetCaptionForAiContext(asset, title = "") {
  const caption = String(asset?.caption || "").trim();
  if (!caption) return "";
  if (/^(?:photo|image|still|slide|clip|video)\s*(?:#|no\.?|number)?\s*\d+$/i.test(caption)) return "";
  const captionKey = item4CaptionContextKey(caption);
  if (!captionKey || captionKey === item4CaptionContextKey(title)) return "";
  const names = [asset?.name, asset?.file_name, asset?.filename, asset?.asset_name, asset?.library_asset_name]
    .map(item4CaptionContextKey)
    .filter(Boolean);
  return names.includes(captionKey) ? "" : caption;
}
/*__STUDIO_WORKER_END:item4AssetCaptionForAiContext__*/

export async function item4RequestAiSlideThemes(env, requestRecord, parent, needed) {
  if (needed < 0) return null;
  const title = item4StudioThemeTitle(requestRecord, parent);
  if (!title) return null;
  const covered = item4AssetManifest(requestRecord)
    .slice()
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((asset) => item4AssetCaptionForAiContext(asset, title))
    .filter(Boolean);
  const marketRaw = parent ? f(parent, "Market_Name") : "";
  const market = (Array.isArray(marketRaw) ? String(marketRaw[0] || "") : String(marketRaw || "")).trim() || "Chicago";
  const sai1Body = {
    source: "studio-ai-slide-themer",
    production_request_record_id: requestRecord.id,
    content_record_id: parent?.id || null,
    title,
    market,
    covered_text: covered.map((text, index) => `${index + 1}. ${text}`).join("\n") || "(none)",
    needed,
    total: covered.length + needed,
  };
  let parsed = null;
  {
    const { response, payload } = await item4PulsePipelineStage(env, "sai1", sai1Body, "SAI1");
    if (!response.ok) throw new Error(payload?.message || `SAI1 slide themer failed (${response.status})`);
    parsed = payload?.details?.themes || payload?.details?.run?.themes || null;
  }
  const slides = (Array.isArray(parsed?.slides) ? parsed.slides : [])
    .map((slide) => ({
      caption: String(slide?.caption || "").trim().slice(0, 120),
      imagePrompt: String(slide?.image_prompt || "").trim(),
    }))
    .filter((slide) => slide.imagePrompt);
  const themes = {
    slides,
    voiceoverScript: String(parsed?.voiceover_script || "").trim(),
    postCaption: String(parsed?.post_caption || "").trim(),
    hashtags: String(parsed?.hashtags || "").trim(),
  };
  if (needed > 0 && !slides.length) return null;
  return themes;
}
/*__STUDIO_WORKER_END:item4RequestAiSlideThemes__*/

export function item4StudioCaptionIsLocked(requestRecord) {
  return /force exact/i.test(String(f(requestRecord, "Caption_Mode") || "").trim());
}
/*__STUDIO_WORKER_END:item4StudioCaptionIsLocked__*/

export function item4StripAssetFilenameCaptionText(value) {
  const lines = String(value || "").split(/\r?\n/).map((line) => line.trim());
  return lines.filter((line) => {
    if (!line) return false;
    if (/^featuring\s*:/i.test(line)) return false;
    if (/\.(?:jpe?g|png|gif|webp|heic|heif|mp4|mov|m4v|webm)\b/i.test(line)) return false;
    if (/\b(?:photo|image|still|slide|clip|video)\s*(?:#|no\.?|number)?\s*\d+\b/i.test(line)) return false;
    return true;
  }).join("\n").trim();
}
/*__STUDIO_WORKER_END:item4StripAssetFilenameCaptionText__*/

export async function item4WriteStudioPostCaption(env, parentId, themes, parentRecord) {
  const caption = item4StripAssetFilenameCaptionText(themes?.postCaption);
  if (!parentId || !caption) return null;
  const existingParentCaption = String(f(parentRecord || {}, "Caption") || "").trim();
  if (existingParentCaption && item4StripAssetFilenameCaptionText(existingParentCaption) === existingParentCaption) return null;
  const fields = { Caption: caption };
  if (themes.hashtags && !String(f(parentRecord || {}, "Hashtags") || "").trim()) {
    fields.Hashtags = themes.hashtags;
  }
  try {
    await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
  } catch (error) {
    console.warn("Studio post caption write failed", parentId, error);
    return null;
  }
  // Outputs are seeded before the caption exists. Backfill blanks and replace
  // any previously leaked inventory with the newly generated AI copy.
  try {
    const outputs = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 50,
      filterFormula: `FIND('${parentId}',ARRAYJOIN({Content_Item}))>0`,
    });
    const updates = outputs.filter((row) => {
      const current = String(f(row, "Output_Caption") || "").trim();
      return !current || item4StripAssetFilenameCaptionText(current) !== current;
    }).map((row) => ({
        id: row.id,
        fields: { Output_Caption: caption, ...(fields.Hashtags ? { Output_Hashtags: fields.Hashtags } : {}) },
      }));
    for (let i = 0; i < updates.length; i += 10) {
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, "", {
        method: "PATCH",
        body: JSON.stringify({ records: updates.slice(i, i + 10), typecast: true }),
      });
    }
  } catch (error) {
    console.warn("Studio post caption output backfill failed", parentId, error);
  }
  return caption;
}
/*__STUDIO_WORKER_END:item4WriteStudioPostCaption__*/

export async function item4EnsureStudioPostCaption(env, requestRecord, parentId) {
  if (!parentId || item4StudioCaptionIsLocked(requestRecord)) return null;
  const parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId).catch(() => null);
  if (!parent) return null;
  const existingCaption = String(f(parent, "Caption") || "").trim();
  if (existingCaption && item4StripAssetFilenameCaptionText(existingCaption) === existingCaption) return null;
  let themes = null;
  try {
    themes = await item4RequestAiSlideThemes(env, requestRecord, parent, 0);
  } catch (error) {
    console.warn("Studio post caption author failed", parentId, error);
    return null;
  }
  return item4WriteStudioPostCaption(env, parentId, themes, parent);
}
/*__STUDIO_WORKER_END:item4EnsureStudioPostCaption__*/

export function item4PreProductionAiRequestedCount(record) {
  const exact = Number(f(record, "Carousel_Slide_Count_Exact") || 0);
  if (Number.isFinite(exact) && exact > 0) return Math.max(1, Math.round(exact));
  const origin = item4ParseEzOrigin(record);
  if (origin.inputKind === "single-ai") return 1;
  if (origin.aiCount) return Math.max(1, Math.round(origin.aiCount));
  return origin.inputKind === "multiple-ai" ? 5 : 1;
}
/*__STUDIO_WORKER_END:item4PreProductionAiRequestedCount__*/

export function item4PreProductionAiRatio(record) {
  const notes = String(f(record, "Production_Notes") || "");
  const contentType = String(f(record, "Master_Content_Type") || "");
  if (/ez-package=video/i.test(notes) || /vertical short video/i.test(contentType)) return "9:16";
  if (/ez-package=slides/i.test(notes) || /carousel|photo set/i.test(contentType)) return "4:5";
  return "9:16";
}
/*__STUDIO_WORKER_END:item4PreProductionAiRatio__*/

export async function item4PreProductionAiContext(env, record) {
  const requested = String(f(record, "Requested_Title") || "").trim();
  let title = requested;
  let market = "";
  const ideaId = studioFirstLinkedId(f(record, "Idea_Candidate"));
  if (ideaId) {
    try {
      const idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaId);
      if (!title) title = String(f(idea, "Candidate_Title") || f(idea, "Hook") || "").trim();
      const raw = f(idea, "Market_Name");
      market = (Array.isArray(raw) ? String(raw[0] || "") : String(raw || "")).trim();
      if (!market) market = String(f(idea, "Primary_Location") || "").trim();
    } catch (error) {
      console.warn("Studio pre-production AI idea context lookup failed", ideaId, error);
    }
  }
  if (!title) title = String(f(record, "Production_Request_ID") || "Social media image set").trim();
  return { title, market: market || "Chicago" };
}
/*__STUDIO_WORKER_END:item4PreProductionAiContext__*/

export async function item4GeneratePreProductionImageBytes(env, prompt, ratio) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) throw new HttpError(503, "PIPELINE_RUNNER_URL is not configured");
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "").trim();
  const response = await fetch(`${runnerUrl}/jobs/studio-ai-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify({ prompt, ratio, platform: "TikTok" }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new HttpError(response.status, detail.slice(0, 500) || `AI image generation failed (${response.status})`);
  }
  const type = String(response.headers.get("content-type") || "image/png").split(";")[0].trim() || "image/png";
  const bytes = await response.arrayBuffer();
  if (!bytes || bytes.byteLength < 100) throw new HttpError(502, "AI image generation returned an empty image");
  return { bytes, contentType: type };
}
/*__STUDIO_WORKER_END:item4GeneratePreProductionImageBytes__*/

export async function generateItem4PreProductionAiMaster(request, env, url, authorization, ctx = null) {
  const recordId = productionRequestRecordIdFromPath(url);
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  const status = String(f(record, "Request_Status") || "Draft").trim();
  if (!productionRequestEditable(record)) {
    throw new HttpError(409, "AI images can only be generated while this request is editable");
  }
  const body = await request.json().catch(() => ({}));
  const requestedTarget = Math.round(Number(body?.target_ai_count || 0));
  const requestedAdd = Math.round(Number(body?.add_ai_count || 0));
  const promptGuidance = String(body?.prompt_guidance || "").trim().slice(0, 2000);
  // Prefer the profile the operator is currently on (UI selectedProfileId). Idea /
  // Content fallbacks only apply when the request body has no profile.
  const preferredProfileId = requestedProfileId(url, body);
  let productionProfile = null;
  if (/^rec[A-Za-z0-9]+$/.test(String(preferredProfileId || "").trim())) {
    productionProfile = await resolveWorkingContentProfile(env, authorization, preferredProfileId).catch(() => null);
  }
  if (!productionProfile?.id) {
    productionProfile = await item4ProductionProfileRecord(env, record, preferredProfileId)
      || await resolveWorkingContentProfile(env, authorization, preferredProfileId || null);
  }
  if (!productionProfile?.id) {
    throw new HttpError(409, "This Production Request does not have a Content Profile");
  }
  const explicitAiAdd = (Number.isFinite(requestedTarget) && requestedTarget > 0)
    || (Number.isFinite(requestedAdd) && requestedAdd > 0);
  if (String(f(record, "Carousel_Image_Mode") || "").trim() !== "Make AI Generated" && !explicitAiAdd) {
    throw new HttpError(409, "This request is not configured for automatic AI image generation");
  }
  if (!env.STUDIO_MEDIA) throw new HttpError(503, "Studio media storage is not configured");

  const reset = Boolean(body?.reset);
  let assets = item4AssetManifest(record);
  if (reset) {
    const keep = [];
    for (const asset of assets) {
      if (/^studio_ai_preproduction$/i.test(String(asset?.source || ""))) {
        const key = String(asset?.r2_key || "").trim();
        if (key) {
          try { await env.STUDIO_MEDIA.delete(key); } catch (error) {
            console.warn("Studio pre-production AI reset R2 cleanup failed", key, error);
          }
        }
      } else {
        keep.push(asset);
      }
    }
    assets = keep.map((asset, index) => ({ ...asset, order: index + 1 }));
    record = await item4UpdateRequestState(env, recordId, {
      Studio_Master_Assets_JSON: JSON.stringify(assets),
      Studio_Master_Asset_Count: assets.length,
      Studio_Master_Asset_Status: assets.length ? "Ready" : "None",
      Studio_Variant_Status: "None",
      Studio_Variant_Manifest_JSON: null,
      Studio_Variant_Updated_At: null,
      Studio_Variant_Error: null,
      Studio_Item4_State: assets.length ? "Assets Ready" : "Draft",
    });
  }

  const origin = item4ParseEzOrigin(record);
  const requestedTotal = item4PreProductionAiRequestedCount(record);
  const manualCount = assets.filter((asset) => !/^studio_ai/i.test(String(asset?.source || ""))).length;
  const generated = assets.filter((asset) => /^studio_ai/i.test(String(asset?.source || "")));
  const desiredAiCount = Number.isFinite(requestedTarget) && requestedTarget > 0
    ? requestedTarget
    : Number.isFinite(requestedAdd) && requestedAdd > 0
      ? generated.length + requestedAdd
      : origin.inputKind === "mixed" && origin.aiCount
        ? origin.aiCount
        : Math.max(0, requestedTotal - manualCount);
  if (generated.length >= desiredAiCount) {
    return respond(request, env, {
      ok: true,
      completed: true,
      requested_count: desiredAiCount,
      generated_count: generated.length,
      assets,
      production_request: mapProductionRequest(record),
    });
  }

  const context = await item4PreProductionAiContext(env, record);
  const requestedAssetBase = String(body?.asset_name_base || "").trim();
  const normalizedAssetBase = normalizeLibraryBatchBase(requestedAssetBase || context.title || "Studio AI");
  if (!normalizedAssetBase.ok) throw new HttpError(400, normalizedAssetBase.error);
  const assetBase = normalizedAssetBase.name;
  const profileScope = mediaAssetProfileScopeFormula(productionProfile.id, {
    crossScope: false,
    includeUnscoped: false,
    profileName: f(productionProfile, "Profile_Name") || "",
  });
  const catalogNames = await listLibraryBatchExistingNames(env, assetBase, profileScope);
  const manifestNames = assets
    .map((asset) => String(asset?.library_asset_name || asset?.name || "").trim())
    .filter(Boolean);
  const allocatedNames = allocateLibraryBatchNames(assetBase, 1, [...catalogNames, ...manifestNames]);
  const assetName = allocatedNames[0];
  if (!assetName) throw new HttpError(500, "Could not allocate the next Asset Manager name for this AI image");

  const pseudoParent = { fields: { Content_Title: context.title, Hook: context.title, Market_Name: context.market } };
  let themes = null;
  try {
    themes = await item4RequestAiSlideThemes(env, record, pseudoParent, 1);
  } catch (error) {
    console.warn("Studio pre-production AI theme generation failed", recordId, error);
  }
  const nextIndex = generated.length + 1;
  const caption = String(themes?.slides?.[0]?.caption || "").trim();
  const themedPrompt = String(themes?.slides?.[0]?.imagePrompt || "").trim();
  const prompt = promptGuidance
    ? [
        `Primary user direction: ${promptGuidance}`,
        `Context: this image supports ${context.market} social content titled "${context.title}".`,
        `Create image ${nextIndex} of ${desiredAiCount}; when generating multiple images, vary the composition while following the same user direction.`,
        themedPrompt ? `Studio suggestion, secondary to the user's direction: ${themedPrompt}` : "",
        "Follow the user's requested subject and style. No logos, watermarks, or UI. Avoid burned-in text unless the user explicitly asks for it.",
      ].filter(Boolean).join(" ")
    : themedPrompt || [
        `Photorealistic ${context.market} travel/social media photograph for "${context.title}".`,
        `Create image ${nextIndex} of ${desiredAiCount} as a distinct complementary scene.`,
        "Natural camera, realistic light and textures. No logos, watermarks, UI, or burned-in text.",
      ].join(" ");
  const ratio = item4PreProductionAiRatio(record);
  const image = await item4GeneratePreProductionImageBytes(env, prompt, ratio);

  // Image generation is slow enough that the operator can delete an AI master
  // while this request is in flight. Re-read the manifest before committing.
  // A delete stamps ez-ai-auto=off; if an asset disappeared since this request
  // started, the delete wins and this generated image is discarded.
  const latestBeforeAiCommit = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId).catch(() => record);
  const latestBeforeAiAssets = item4AssetManifest(latestBeforeAiCommit);
  const originalAssetIds = new Set(assets.map((asset) => String(asset?.id || "")).filter(Boolean));
  const latestAssetIds = new Set(latestBeforeAiAssets.map((asset) => String(asset?.id || "")).filter(Boolean));
  const aiDeleteDuringGeneration = /ez-ai-auto=off/i.test(String(f(latestBeforeAiCommit, "Production_Notes") || ""))
    && [...originalAssetIds].some((id) => !latestAssetIds.has(id));
  if (aiDeleteDuringGeneration) {
    return respond(request, env, {
      ok: true,
      completed: true,
      cancelled: true,
      requested_count: desiredAiCount,
      generated_count: latestBeforeAiAssets.filter((asset) => /^studio_ai/i.test(String(asset?.source || ""))).length,
      assets: latestBeforeAiAssets,
      production_request: mapProductionRequest(latestBeforeAiCommit),
      message: "AI generation stopped because an image was deleted.",
    });
  }

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const id = `aipre${stamp}`;
  const name = `${assetName}.png`;
  const key = `studio/master-assets/${recordId}/${id}-${item4SafeFileName(name)}`;
  await env.STUDIO_MEDIA.put(key, image.bytes, {
    httpMetadata: { contentType: image.contentType },
    customMetadata: { productionRequestId: recordId, assetId: id, source: "studio_ai_preproduction" },
  });
  const nextAssets = [...assets, {
    id,
    order: assets.length + 1,
    name,
    mime_type: image.contentType,
    source_format: "PNG",
    browser_preview_compatible: true,
    size_bytes: Number(image.bytes.byteLength || 0),
    focal_point: "center",
    r2_key: key,
    url: `${ITEM4_MEDIA_PUBLIC_BASE}/${key}`,
    uploaded_at: new Date().toISOString(),
    source: "studio_ai_preproduction",
    library_asset_name: assetName,
    content_profile_id: productionProfile.id,
    caption_mode: "ai",
    caption,
    ai_prompt: prompt,
  }];

  record = await item4UpdateRequestState(env, recordId, {
    Studio_Master_Assets_JSON: JSON.stringify(nextAssets),
    Studio_Master_Asset_Count: nextAssets.length,
    Studio_Master_Asset_Status: "Uploading",
    Studio_Variant_Status: "None",
    Studio_Variant_Manifest_JSON: null,
    Studio_Variant_Updated_At: null,
    Studio_Variant_Error: null,
    Studio_Item4_State: "Assets Ready",
  });

  let queued = [];
  try {
    queued = await item4UpsertMasterQueue(env, recordId, nextAssets);
  } catch (error) {
    console.warn("Studio pre-production AI master queue deferred", recordId, error);
  }
  if (queued.length && ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil((async () => {
      try {
        await item4DrainVariantWorker(
          env,
          recordId,
          Math.min(8, Math.max(2, queued.length + 2)),
          { maxMs: ITEM4_DRAIN_POST_BUDGET_MS }
        );
        await item4ReconcileMasterAuthority(env, recordId);
      } catch (error) {
        console.warn("Studio pre-production AI master preservation continued in background", recordId, error);
      }
    })());
  }

  const generatedNow = nextAssets.filter((asset) => /^studio_ai/i.test(String(asset?.source || ""))).length;
  return respond(request, env, {
    ok: true,
    completed: generatedNow >= desiredAiCount,
    requested_count: desiredAiCount,
    generated_count: generatedNow,
    assets: nextAssets,
    production_request: mapProductionRequest(record),
    content_profile_id: productionProfile.id,
    content_profile_name: String(f(productionProfile, "Profile_Name") || "").trim() || null,
    asset_name: assetName,
    asset_name_base: assetBase,
    message: generatedNow >= desiredAiCount
      ? `${generatedNow} AI image${generatedNow === 1 ? "" : "s"} ready.`
      : `${generatedNow} of ${desiredAiCount} AI images ready.`,
  });
}
/*__STUDIO_WORKER_END:generateItem4PreProductionAiMaster__*/

export async function item4SeedAiCarouselSlides(env, parentId, requestRecord, needed, targetTotal = null) {
  if (!parentId || needed < 1) return [];
  const existing = await item4ListParentCarouselSlides(env, parentId);
  const live = (existing || []).filter((row) => !Boolean(f(row, "Deleted From Carousel")));
  const assets = item4AssetManifest(requestRecord);
  // A live slide covers an AI slot if it is still empty (waiting on C2) OR it has an
  // image that has not been ingested as a master yet. Counting only empties made the
  // Worker reseed a new empty every time C2 wrote the first image URL.
  const coversAiSlot = (row) => {
    const url = item4SlideImageUrl(row);
    if (!url) return true;
    return !assets.some((asset) => String(asset?.carousel_slide_id || "") === String(row.id || ""));
  };
  const covering = live.filter(coversAiSlot);
  const emptyBudget = Math.max(needed, Number.isFinite(targetTotal) && targetTotal > 0
    ? Math.max(0, targetTotal - (live.length - covering.length))
    : needed);
  if (covering.length > emptyBudget) {
    const coveringNewestFirst = covering
      .slice()
      .sort((a, b) => String(b.createdTime || "").localeCompare(String(a.createdTime || "")));
    const surplus = covering.length - emptyBudget;
    for (const row of coveringNewestFirst.slice(0, Math.min(surplus, 100))) {
      try {
        await airtableFetch(env, "Carousel Slides", row.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              "Deleted From Carousel": true,
              "AI Prompt": "",
              "Content Item": [],
            },
            typecast: true,
          }),
        });
      } catch (error) {
        console.warn("Studio AI surplus slide cleanup failed", row.id, error);
      }
    }
    try {
      const keepIds = coveringNewestFirst.slice(surplus).map((row) => row.id)
        .concat(live.filter((row) => !coversAiSlot(row)).map((row) => row.id));
      const uniqueKeep = [...new Set(keepIds.filter(Boolean))];
      await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId, {
        method: "PATCH",
        body: JSON.stringify({ fields: { "Carousel Slides": uniqueKeep }, typecast: true }),
      });
    } catch (error) {
      console.warn("Studio AI parent slide pin failed", parentId, error);
    }
  }
  const afterLive = (await item4ListParentCarouselSlides(env, parentId))
    .filter((row) => !Boolean(f(row, "Deleted From Carousel")));
  const coveringAfter = afterLive.filter(coversAiSlot).length;
  const missing = Math.max(0, needed - coveringAfter);
  if (!missing) return afterLive;
  const parentRecord = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId).catch(() => null);
  let themes = null;
  try {
    themes = await item4RequestAiSlideThemes(env, requestRecord, parentRecord, missing);
  } catch (error) {
    console.warn("Studio AI slide themer failed", parentId, error);
  }
  const title = item4StudioThemeTitle(requestRecord, parentRecord)
    || String(f(requestRecord, "Production_Request_ID") || "Chicago").trim();
  const caption = String(f(requestRecord, "Requested_Caption") || "").trim();
  const narration = phase6NarrationVoiceFromRequest(requestRecord, parentRecord);
  const created = [];
  for (let i = 0; i < missing; i += 1) {
    const n = afterLive.length + created.length + 1;
    const theme = themes?.slides?.[i] || null;
    const prompt = theme?.imagePrompt || [
      `Photorealistic Chicago travel photograph for ChicagoShining, complementary to "${title}".`,
      caption ? `Context: ${caption.slice(0, 400)}` : "",
      "No logos, no watermarks, no burned-in text.",
    ].filter(Boolean).join(" ");
    const fields = {
      "Slide Name": theme?.caption || `Studio AI ${n}`,
      "Slide Number": n,
      "Current Order": n,
      "AI Prompt": prompt,
      "Image Generation Mode": "Make AI Generated",
      "Image Source": "Make AI Generated",
      "Content Item": [parentId],
      Slide_Voice_ID: narration.voice_id || null,
      Slide_Voice_Name: narration.voice_name || null,
    };
    if (theme?.caption) fields.Studio_Slide_Caption = theme.caption;
    const row = await airtableFetch(env, "Carousel Slides", "", {
      method: "POST",
      body: JSON.stringify({ fields, typecast: true }),
    });
    created.push(row);
  }

  // The narration has to name every slide, so it can only be written once the AI
  // slots are themed. Never overwrite a voiceover that has already been spoken.
  if (themes?.voiceoverScript && !String(f(parentRecord || {}, "Voiceover_URL") || "").trim()) {
    try {
      await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId, {
        method: "PATCH",
        body: JSON.stringify({
          fields: { Voiceover_Script: themes.voiceoverScript, Script_Status: "Generated" },
          typecast: true,
        }),
      });
    } catch (error) {
      console.warn("Studio AI narration write failed", parentId, error);
    }
  }
  if (!item4StudioCaptionIsLocked(requestRecord)) {
    await item4WriteStudioPostCaption(env, parentId, themes, parentRecord);
  }
  if (created.length) {
    try {
      const pinIds = [...afterLive, ...created]
        .filter((row) => !Boolean(f(row, "Deleted From Carousel")))
        .map((row) => row.id)
        .filter(Boolean);
      await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId, {
        method: "PATCH",
        body: JSON.stringify({ fields: { "Carousel Slides": pinIds }, typecast: true }),
      });
    } catch (error) {
      console.warn("Studio AI parent slide pin after seed failed", parentId, error);
    }
  }
  return [...afterLive, ...created];
}
/*__STUDIO_WORKER_END:item4SeedAiCarouselSlides__*/

export async function item4IngestAiSlideAsMaster(env, requestRecord, slide) {
  const url = item4SlideImageUrl(slide);
  if (!url || !env.STUDIO_MEDIA) return null;
  const slideId = String(slide.id || "").trim();
  const assets = item4AssetManifest(requestRecord);
  if (assets.some((asset) => String(asset?.carousel_slide_id || "") === slideId)) return requestRecord;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`AI image download failed (${response.status})`);
  const buffer = await response.arrayBuffer();
  const id = `ai${slideId.replace(/^rec/, "").slice(0, 16)}`;
  const name = `studio-ai-${assets.length + 1}.jpg`;
  const key = `studio/master-assets/${requestRecord.id}/${id}-${item4SafeFileName(name)}`;
  const mime = String(response.headers.get("content-type") || "image/jpeg").split(";")[0].trim() || "image/jpeg";
  await env.STUDIO_MEDIA.put(key, buffer, {
    httpMetadata: { contentType: mime },
    customMetadata: { productionRequestId: requestRecord.id, assetId: id, carouselSlideId: slideId },
  });
  const productionProfile = await item4ProductionProfileRecord(env, requestRecord).catch(() => null);
  const profileId = String(productionProfile?.id || "").trim();
  const nextAssets = [...assets, {
    id,
    order: assets.length + 1,
    name,
    mime_type: mime,
    source_format: "JPG",
    browser_preview_compatible: true,
    size_bytes: Number(buffer.byteLength || 0),
    focal_point: "center",
    r2_key: key,
    url: `${ITEM4_MEDIA_PUBLIC_BASE}/${key}`,
    uploaded_at: new Date().toISOString(),
    source: "studio_ai",
    carousel_slide_id: slideId,
    caption_mode: "ai",
    ...(profileId ? { content_profile_id: profileId } : {}),
    // Carry the themed caption across so Remotion burns in the thing this photo
    // actually depicts. Without it the overlay is skipped entirely.
    caption: String(f(slide, "Studio_Slide_Caption") || "").trim(),
  }];
  return item4UpdateRequestState(env, requestRecord.id, {
    Studio_Master_Assets_JSON: JSON.stringify(nextAssets),
    Studio_Master_Asset_Count: nextAssets.length,
    Studio_Master_Asset_Status: "Uploading",
    Studio_Variant_Status: "None",
    Studio_Variant_Manifest_JSON: null,
    Studio_Item4_State: "Assets Ready",
  });
}
/*__STUDIO_WORKER_END:item4IngestAiSlideAsMaster__*/

export async function item4EnsureVariantQueueForReadyMasters(env, record) {
  const plan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  if (!plan) return record;
  const assets = item4AssetManifest(record);
  if (!assets.length) return record;
  const authoritative = assets.filter((asset) =>
    String(asset?.google_drive_file_id || "").trim() && String(asset?.media_asset_record_id || "").trim()
  );
  if (authoritative.length !== assets.length) return record;
  const ratios = item4RequiredRatios(plan);
  const expectedIds = assets.flatMap((asset) =>
    ratios.map((ratio) => item4QueueTransferId(record.id, asset.id, ratio, asset))
  );
  const existing = await item4VariantQueueRows(env, record.id);
  const present = new Set(existing.map((row) => String(f(row, "Transfer_ID") || "").trim()));
  if (expectedIds.every((id) => present.has(id))) return record;
  const outputRows = await outputRowsForProductionRequest(env, record.id);
  await item4UpsertVariantQueue(env, record.id, assets, ratios, outputRows, plan);
  const reconciled = await item4ReconcileVariants(env, record.id);
  return reconciled?.record || record;
}
/*__STUDIO_WORKER_END:item4EnsureVariantQueueForReadyMasters__*/

export async function item4EnsureAiSourceMasters(env, requestRecord, parent) {
  const assets = item4AssetManifest(requestRecord);
  const expected = item4EffectivePhotoCount(requestRecord, assets);
  const needed = Math.max(0, expected - assets.length);
  if (!needed) {
    // Pre-production AI masters are reviewable from R2 before approval. Once production
    // starts, make sure any R2-only masters enter the authoritative Drive/Media Asset path.
    try {
      await item4UpsertMasterQueue(env, requestRecord.id, assets);
    } catch (error) {
      console.warn("Studio pre-production AI master queue deferred", error);
    }
    // Masters are present but may still be Drive Uploaded / not Ready.
    try {
      const reconciled = await item4ReconcileMasterAuthority(env, requestRecord.id, requestRecord);
      let settled = reconciled.record || requestRecord;
      try {
        settled = await item4EnsureVariantQueueForReadyMasters(env, settled);
      } catch (error) {
        console.warn("Studio AI variant queue backfill failed", error);
      }
      return {
        requestRecord: settled,
        needed: 0,
        waiting: Math.max(0, expected - item4AssetManifest(settled).length),
      };
    } catch (error) {
      console.warn("Studio AI master reconcile failed", error);
      return { requestRecord, needed: 0, waiting: 0 };
    }
  }
  const parentId = parent?.id || studioFirstLinkedId(f(requestRecord, "Promoted_Content_Item"));
  let slides = parentId ? await item4ListParentCarouselSlides(env, parentId) : [];
  const imagedCount = slides.filter((slide) => item4SlideImageUrl(slide)).length;
  if (parentId && imagedCount < expected) {
    try {
      await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Carousel_Image_Mode: "Make AI Generated",
            Carousel_Slide_Count: expected,
            Requested_Carousel_Slide_Count_Mode: "Exact",
          },
          typecast: true,
        }),
      });
    } catch (error) {
      console.warn("Studio AI carousel arm failed", error);
    }
    await item4SeedAiCarouselSlides(env, parentId, requestRecord, needed, expected);
    slides = await item4ListParentCarouselSlides(env, parentId);
  }
  let current = requestRecord;
  for (const slide of slides) {
    if (item4AssetManifest(current).length >= expected) break;
    if (!item4SlideImageUrl(slide)) continue;
    if (item4AssetManifest(current).some((asset) => String(asset?.carousel_slide_id || "") === slide.id)) continue;
    try {
      current = await item4IngestAiSlideAsMaster(env, current, slide) || current;
    } catch (error) {
      console.warn("Studio AI master ingest failed", slide.id, error);
    }
  }
  const after = item4AssetManifest(current);
  if (after.length > assets.length) {
    try { await item4UpsertMasterQueue(env, current.id, after); } catch (error) {
      console.warn("Studio AI master queue failed", error);
    }
    try {
      const plan = item4ParseJson(f(current, "Studio_Output_Plan_JSON"), null);
      if (plan) {
        const outputRows = await outputRowsForProductionRequest(env, current.id);
        await item4UpsertVariantQueue(env, current.id, after, item4RequiredRatios(plan), outputRows, plan);
      }
    } catch (error) {
      console.warn("Studio AI variant queue failed", error);
    }
  }
  // Drive Uploaded AI masters need Worker reconciliation even when SMV1 has no
  // Pending rows left — otherwise Master status stays Uploading forever.
  try {
    const reconciled = await item4ReconcileMasterAuthority(env, current.id, current);
    current = reconciled.record || current;
  } catch (error) {
    console.warn("Studio AI master reconcile failed", error);
  }
  try {
    current = await item4EnsureVariantQueueForReadyMasters(env, current);
  } catch (error) {
    console.warn("Studio AI variant queue backfill failed", error);
  }
  return { requestRecord: current, needed, waiting: Math.max(0, expected - item4AssetManifest(current).length) };
}
/*__STUDIO_WORKER_END:item4EnsureAiSourceMasters__*/

export function item4PublicCdnUrl(value) {
  const url = String(value || "").trim();
  return url.startsWith("https://media.chicagoshining.com/") ? url : "";
}
/*__STUDIO_WORKER_END:item4PublicCdnUrl__*/

export function item4MasterForSource(masters, source) {
  const sourceId = String(source?.id || "").trim();
  const mediaId = String(source?.media_asset_record_id || "").trim();
  return (Array.isArray(masters) ? masters : []).find((master) =>
    (sourceId && String(master?.id || "").trim() === sourceId)
    || (mediaId && String(master?.media_asset_record_id || "").trim() === mediaId)
  ) || null;
}
/*__STUDIO_WORKER_END:item4MasterForSource__*/

export function item4NormalizeAspectRatioKey(ratio) {
  return String(ratio || "").trim().toLowerCase().replace(/\s+/g, "").replace(/x/g, ":");
}
/*__STUDIO_WORKER_END:item4NormalizeAspectRatioKey__*/

export function item4VariantLooksRenderable(variant) {
  if (!variant || typeof variant !== "object") return false;
  const url = String(
    variant.preview_url
    || studioClipPublicCdnUrl(variant.google_drive_url || variant.google_drive_file_id)
    || ""
  ).trim();
  const mediaAssetId = String(variant.media_asset_record_id || variant.media_asset_record_id || "").trim();
  return Boolean(url) && /^rec[A-Za-z0-9]+$/.test(mediaAssetId);
}
/*__STUDIO_WORKER_END:item4VariantLooksRenderable__*/

export function item4PickSourceVariantForRatio(source, requestedRatio, options = {}) {
  const allowFallback = options.allowFallback !== false;
  const variants = source?.variants && typeof source.variants === "object" ? source.variants : {};
  const wanted = item4NormalizeAspectRatioKey(requestedRatio);
  const aliases = {
    "9:16": ["9:16", "9x16", "9X16"],
    "16:9": ["16:9", "16x9", "16X9"],
    "4:5": ["4:5", "4x5", "4X5"],
    "1:1": ["1:1", "1x1", "1X1"],
  };
  const tryKeys = (keys) => {
    for (const key of keys || []) {
      if (item4VariantLooksRenderable(variants[key])) {
        return { variant: variants[key], ratio: key, fallback: item4NormalizeAspectRatioKey(key) !== wanted };
      }
      const match = Object.keys(variants).find((existing) => item4NormalizeAspectRatioKey(existing) === item4NormalizeAspectRatioKey(key));
      if (match && item4VariantLooksRenderable(variants[match])) {
        return { variant: variants[match], ratio: match, fallback: item4NormalizeAspectRatioKey(match) !== wanted };
      }
    }
    return null;
  };
  const exact = tryKeys(aliases[wanted] || [requestedRatio, wanted]);
  if (exact) return exact;
  if (!allowFallback) return null;
  const fallbackOrder = wanted === "9:16"
    ? ["4:5", "1:1", "16:9"]
    : wanted === "16:9"
      ? ["1:1", "4:5", "9:16"]
      : ["9:16", "16:9", "1:1", "4:5"];
  for (const next of fallbackOrder) {
    const hit = tryKeys(aliases[next] || [next]);
    if (hit) return { ...hit, fallback: true };
  }
  for (const [key, variant] of Object.entries(variants)) {
    if (item4VariantLooksRenderable(variant)) return { variant, ratio: key, fallback: true };
  }
  return null;
}
/*__STUDIO_WORKER_END:item4PickSourceVariantForRatio__*/

export function item4FinishedSourcePackageForOutput(requestRecord, outputRow, effective, parentContentItem = null) {
  const kind = studioFinishedOriginKind(requestRecord);
  if (!kind) return null;
  const masters = item4AssetManifest(requestRecord);
  if (!masters.length) return null;
  const platform = String(f(outputRow, "Platform") || effective?.platform || "").trim();
  const outputType = String(
    f(outputRow, "Output_Type")
    || f(outputRow, "Studio_Output_Type")
    || effective?.output_type
    || ""
  ).trim();
  const plan = item4ParseJson(f(requestRecord, "Studio_Output_Plan_JSON"), null);
  const planItem = (Array.isArray(plan?.items) ? plan.items : []).find((item) =>
    item4BridgePlanKey(item?.platform, item?.output_type) === item4BridgePlanKey(platform, outputType)
  ) || {};
  let ratio = String(planItem.aspect_ratio || f(outputRow, "Aspect_Ratio") || "").trim();
  let chosen = masters;
  if (kind === "finished-video") {
    ratio = ratio || "9:16";
    const video = masters.find(item4LooksLikeVideoAsset) || masters[0];
    chosen = [video];
  } else {
    ratio = ratio || (masters.length === 1 ? "4:5" : "1:1");
    const photos = masters.filter((asset) => !item4LooksLikeVideoAsset(asset));
    chosen = photos.length ? photos : masters;
  }
  // Finished-video Stories: first ~10s of the master with original audio, not a remixed Remotion cut.
  if (kind === "finished-video" && studioAzIsStory(outputType)) {
    const master = chosen[0];
    const url = item4FinishedMasterPlayUrl(master, requestRecord);
    if (!url) return null;
    const audioFlags = finishedStoryTeaserClipFlags();
    const frames = Math.max(1, Math.round(FINISHED_STORY_TEASER_SECONDS * 30));
    const sourceDuration = Number(master?.duration_seconds || master?.source_duration_seconds || 0) || FINISHED_STORY_TEASER_SECONDS;
    const clip = {
      id: "finished-story-teaser-1",
      order: Number(master?.order || 1),
      media_asset_record_id: String(master?.media_asset_record_id || "").trim(),
      source_asset_id: String(master?.id || "").trim() || null,
      asset_name: String(master?.name || "finished-story.mp4"),
      google_drive_url: String(master?.google_drive_url || "").trim() || null,
      url,
      src: url,
      startFrame: 0,
      durationFrames: frames,
      motionStyle: "none",
      fitMode: null,
      media_kind: "video",
      mediaKind: "video",
      in_seconds: 0,
      out_seconds: FINISHED_STORY_TEASER_SECONDS,
      inSeconds: 0,
      outSeconds: FINISHED_STORY_TEASER_SECONDS,
      startFromSeconds: 0,
      sourceDurationSeconds: sourceDuration,
      source_duration_seconds: sourceDuration,
      sourceInSeconds: 0,
      sourceOutSeconds: Math.min(sourceDuration, FINISHED_STORY_TEASER_SECONDS),
      source: "finished_story_teaser",
      aspect_ratio: ratio,
      google_drive_file_id: String(master?.google_drive_file_id || "").trim() || null,
      overlay: undefined,
      caption: "",
      ...audioFlags,
    };
    const filename = `studio-${String(f(requestRecord, "Production_Request_ID") || requestRecord.id)}-${platform.toLowerCase() || "platform"}-story-teaser.mp4`;
    const clipList = [{
      id: clip.id,
      order: clip.order,
      mediaAssetRecordId: clip.media_asset_record_id || null,
      assetName: clip.asset_name,
      url: clip.url,
      src: clip.src,
      startFrame: 0,
      durationFrames: frames,
      motionStyle: "none",
      fitMode: null,
      mediaKind: "video",
      media_kind: "video",
      googleDriveFileId: clip.google_drive_file_id || null,
      inSeconds: 0,
      outSeconds: FINISHED_STORY_TEASER_SECONDS,
      startFromSeconds: 0,
      sourceDurationSeconds: sourceDuration,
      sourceInSeconds: 0,
      sourceOutSeconds: Math.min(sourceDuration, FINISHED_STORY_TEASER_SECONDS),
      overlay: null,
      caption: "",
      ...audioFlags,
    }];
    const selected = {
      schema_version: "studio.source-selection.2",
      authority: "studio_finished_story_teaser",
      production_request_record_id: requestRecord.id,
      platform,
      output_type: outputType,
      aspect_ratio: ratio,
      selection_status: "Selected",
      selected_clips: [clip],
      fps: 30,
      target_total_frames: frames,
      render_prep: {
        render_status: "Ready for Render",
        composition_id: "ChicagoShiningPhotoSequence",
        output_filename: filename,
        render_total_frames: frames,
        render_clip_list_json: JSON.stringify(clipList),
      },
    };
    return {
      status: "Ready",
      ratio,
      clips: [clip],
      clip_count: 1,
      total_frames: frames,
      composition_id: "ChicagoShiningPhotoSequence",
      output_filename: filename,
      selected_assets_json: JSON.stringify(selected),
      render_clip_list_json: JSON.stringify(clipList),
      native: false,
      finished: false,
      finished_kind: kind,
      story: true,
      story_teaser: true,
    };
  }
  const clips = [];
  for (let index = 0; index < chosen.length; index += 1) {
    const master = chosen[index];
    const url = item4FinishedMasterPlayUrl(master, requestRecord);
    if (!url) return null;
    clips.push({
      id: `finished-source-${index + 1}`,
      order: Number(master?.order || index + 1),
      media_asset_record_id: String(master?.media_asset_record_id || "").trim(),
      source_asset_id: String(master?.id || "").trim() || null,
      asset_name: String(master?.name || `finished-${index + 1}`),
      google_drive_url: String(master?.google_drive_url || "").trim() || null,
      url,
      src: url,
      startFrame: 0,
      durationFrames: 1,
      motionStyle: "none",
      source: "finished_passthrough",
      aspect_ratio: ratio,
      google_drive_file_id: String(master?.google_drive_file_id || "").trim() || null,
      overlay: undefined,
      caption: "",
    });
  }
  if (!clips.length) return null;
  const native = kind !== "finished-video";
  const selected = {
    schema_version: "studio.source-selection.2",
    authority: "studio_finished_passthrough",
    production_request_record_id: requestRecord.id,
    platform,
    output_type: outputType,
    aspect_ratio: ratio,
    selection_status: "Selected",
    selected_clips: clips,
    fps: 30,
    target_total_frames: 1,
    render_prep: {
      render_status: kind === "finished-video" ? "Rendered" : "Native Photo Route",
      composition_id: null,
      output_filename: null,
      render_total_frames: 1,
      render_clip_list_json: "[]",
    },
  };
  return {
    status: "Ready",
    ratio,
    clips,
    clip_count: clips.length,
    total_frames: 1,
    composition_id: null,
    output_filename: null,
    selected_assets_json: JSON.stringify(selected),
    render_clip_list_json: JSON.stringify(clips.map((clip) => ({
      id: clip.id,
      order: clip.order,
      mediaAssetRecordId: clip.media_asset_record_id || null,
      assetName: clip.asset_name,
      url: clip.url,
      src: clip.src,
      startFrame: 0,
      durationFrames: 1,
      motionStyle: "none",
      overlay: null,
      caption: "",
    }))),
    native,
    finished: true,
    finished_kind: kind,
  };
}
/*__STUDIO_WORKER_END:item4FinishedSourcePackageForOutput__*/

export function item4StudioSourcePackageForOutput(requestRecord, outputRow, effective, parentContentItem = null) {
  const finished = item4FinishedSourcePackageForOutput(requestRecord, outputRow, effective, parentContentItem);
  if (finished) return finished;
  if (String(f(requestRecord, "Studio_Variant_Status") || "").trim() !== "Ready") return null;
  const plan = item4ParseJson(f(requestRecord, "Studio_Output_Plan_JSON"), null);
  const manifest = item4VariantManifest(requestRecord);
  const platform = String(f(outputRow, "Platform") || effective?.platform || "").trim();
  const outputType = String(f(outputRow, "Output_Type") || effective?.output_type || "").trim();
  const planItem = (Array.isArray(plan?.items) ? plan.items : []).find(item =>
    item4BridgePlanKey(item?.platform, item?.output_type) === item4BridgePlanKey(platform, outputType)
  );
  const ratio = String(planItem?.aspect_ratio || "").trim();
  if (!ratio) return null;

  const masters = item4AssetManifest(requestRecord);
  const expected = item4EffectivePhotoCount(requestRecord, masters);
  if (masters.length < expected) return null;

  const sourceRowsAll = (Array.isArray(manifest?.assets) ? manifest.assets : [])
    .slice()
    .sort((a,b) => Number(a?.order || 0) - Number(b?.order || 0));
  const storyTeaser = String(outputType || "").trim() === "Story";
  const sourceRows = storyTeaser ? sourceRowsAll.slice(0, 1) : sourceRowsAll;
  if (!storyTeaser && sourceRows.length < expected) return null;
  const omittedSourceIds = [];
  const eligibleSources = [];
  const nativePhotoRouteEarly = studioOutputIsNativePhotoRoute(platform, outputType, null);
  for (const source of sourceRows) {
    const picked = item4PickSourceVariantForRatio(source, ratio, {
      allowFallback: !nativePhotoRouteEarly,
    });
    const variant = picked?.variant;
    const master = item4MasterForSource(masters, source);
    const looksVideo = item4LooksLikeVideoAsset(source) || item4LooksLikeVideoAsset(variant) || item4LooksLikeVideoAsset(master);
    const driveId = String(
      (!looksVideo && !storyTeaser && item4PublicCdnUrl(master?.preview_url)
        ? master?.google_drive_file_id
        : (variant?.google_drive_file_id || extractGoogleDriveFileId(variant?.google_drive_url) || master?.google_drive_file_id)
      )
      || ""
    ).trim();
    // Remotion must fetch real image bytes. Google Drive answers large files with
    // an HTML scan interstitial, so only a public CDN preview may back a clip.
    // Fill-crop 9:16 variants cut square/4:5 flyers, so non-story stills use the original.
    const url = String(
      looksVideo
        ? (variant?.preview_url || studioClipPublicCdnUrl(variant?.google_drive_url || variant?.google_drive_file_id) || "")
        : (
          (!storyTeaser && item4PublicCdnUrl(master?.preview_url))
          || variant?.preview_url
          || studioClipPublicCdnUrl(variant?.google_drive_url || variant?.google_drive_file_id)
          || ""
        )
    ).trim();
    const mediaAssetId = String(variant?.media_asset_record_id || master?.media_asset_record_id || "").trim();
    if (!url || !/^rec[A-Za-z0-9]+$/.test(mediaAssetId)) {
      omittedSourceIds.push(String(source?.id || source?.name || "").trim() || "unknown");
      continue;
    }
    eligibleSources.push({ source, variant, url, mediaAssetId, driveId, looksVideo });
  }
  if (omittedSourceIds.length) {
    console.warn("Studio source package waiting on ratio crops", {
      production_request: requestRecord.id,
      platform,
      output_type: outputType,
      ratio,
      omitted: omittedSourceIds,
    });
    return null;
  }
  if (!eligibleSources.length) return null;

  const durationSeconds = item4ResolvedVideoDurationSeconds({
    storyTeaser,
    clipCount: eligibleSources.length,
    effective,
    requestRecord,
    outputRow,
  });
  const fps = 30;
  const totalFrames = Math.max(eligibleSources.length, Math.round(durationSeconds * fps));
  const baseFrames = Math.floor(totalFrames / eligibleSources.length);
  let remainder = totalFrames - (baseFrames * eligibleSources.length);
  let startFrame = 0;
  const clips = [];

  const captions = item4OverlayCaptionBySourceId(requestRecord);
  for (const { source, variant, url, mediaAssetId, driveId, looksVideo } of eligibleSources) {
    const frames = baseFrames + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    // Stories stay first-photo teasers, but on-image slide captions must still burn in.
    const overlayText = item4PreferredOverlayText(
      requestRecord,
      parentContentItem,
      captions.get(String(source?.id || "").trim())
        || String(source?.caption || variant?.caption || "").trim()
        || String(f(parentContentItem, "Content_Title") || "").trim()
    );
    const overlay = item4PhotoOverlayFromCaption(overlayText, { aspectRatio: ratio });
    clips.push({
      id: `studio-source-${clips.length + 1}`,
      order: Number(source?.order || clips.length + 1),
      media_asset_record_id: mediaAssetId,
      source_asset_id: String(source?.id || "").trim() || null,
      asset_name: String(variant?.file_name || source?.name || `photo-${clips.length + 1}.jpg`),
      google_drive_url: String(variant?.google_drive_url || "").trim() || null,
      url,
      src: url,
      startFrame,
      durationFrames: frames,
      motionStyle: storyTeaser ? "slowZoom" : "none",
      fitMode: looksVideo ? undefined : (storyTeaser ? "fill_crop" : "full_with_solid_background"),
      source: "studio_platform_variant",
      aspect_ratio: ratio,
      google_drive_file_id: driveId || String(variant?.google_drive_file_id || "").trim() || null,
      overlay: overlay || undefined,
      caption: overlay?.text || "",
    });
    startFrame += frames;
  }

  const nativePhotoRoute = studioOutputIsNativePhotoRoute(platform, outputType, null);
  const aiCover = studioAiThumbnailUrl(f(parentContentItem, "Thumbnail_URL"));
  if (aiCover && nativePhotoRoute && clips.length) {
    const already = clips.some((clip) => String(clip.url || clip.src || "").trim() === aiCover);
    if (!already && (outputType === "Single Image" || outputType === "Single Photo")) {
      clips[0] = { ...clips[0], url: aiCover, src: aiCover, asset_name: clips[0].asset_name || "ai-grid-cover.jpg" };
    } else if (!already) {
      clips.unshift({
        id: "studio-ai-cover",
        order: 0,
        url: aiCover,
        src: aiCover,
        asset_name: "ai-grid-cover.jpg",
        motionStyle: "none",
        source: "studio_ai_grid_cover",
      });
    }
  }
  const compositionId = nativePhotoRoute ? null : "ChicagoShiningPhotoSequence";
  const titleText = storyTeaser
    ? ""
    : String(effective?.requested_title || f(parentContentItem, "Content_Title") || "").trim();
  const brandNameRaw = f(parentContentItem, "Brand_Name");
  const brandText = Array.isArray(brandNameRaw) ? String(brandNameRaw[0] || "ChicagoShining") : String(brandNameRaw || "ChicagoShining");
  const safeOutputType = outputType.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "output";
  const outputFilename = `studio-${String(f(requestRecord,"Production_Request_ID") || requestRecord.id)}-${platform.toLowerCase()}-${safeOutputType}.mp4`;
  const clipList = clips.map(c => ({
    id:c.id, order:c.order, mediaAssetRecordId:c.media_asset_record_id,
    assetName:c.asset_name, url:c.url, src:c.src, startFrame:c.startFrame,
    durationFrames:c.durationFrames, motionStyle:c.motionStyle, fitMode:c.fitMode,
    // Preserve video vs photo — Remotion saved Drive MP4 as .jpg when this was stripped (CI 242).
    mediaKind: c.mediaKind || c.media_kind || undefined,
    media_kind: c.media_kind || c.mediaKind || undefined,
    googleDriveFileId: c.google_drive_file_id || c.googleDriveFileId || undefined,
    google_drive_file_id: c.google_drive_file_id || c.googleDriveFileId || undefined,
    startFromSeconds: c.startFromSeconds ?? c.start_from_seconds ?? undefined,
    inSeconds: c.inSeconds ?? c.in_seconds ?? undefined,
    in_seconds: c.in_seconds ?? c.inSeconds ?? undefined,
    overlay: c.overlay || undefined,
    caption: c.caption || "",
  }));
  const renderPrep = {
    render_status: nativePhotoRoute ? "Native Photo Route" : "Ready for Render",
    output_status: "In Production",
    composition_id: compositionId,
    output_filename: outputFilename,
    title_text: titleText,
    brand_text: brandText,
    music_url: String(effective?.music?.url || "").trim(),
    music_volume: String(effective?.music?.url || "").trim() ? STUDIO_DEFAULT_MUSIC_VOLUME : 0,
    voiceover_url: item4StudioDirectiveYes(effective?.voiceover_mode)
      ? String(f(parentContentItem, "Voiceover_URL") || "").trim()
      : "",
    render_total_frames: totalFrames,
    render_clip_count: clips.length,
    compatibility_clip_1_url: clips[0]?.url || "",
    compatibility_clip_1_duration_frames: clips[0]?.durationFrames || 0,
    compatibility_clip_2_url: clips[1]?.url || "",
    compatibility_clip_2_duration_frames: clips[1]?.durationFrames || 0,
    compatibility_clip_3_url: clips[2]?.url || "",
    compatibility_clip_3_duration_frames: clips[2]?.durationFrames || 0,
    render_clip_list_json: JSON.stringify(clipList),
    remotion_props_json: "",
    validation_passed: true,
    validation_errors_text: "",
    prep_notes: String(effective?.music?.url || "").trim()
      ? "Studio exact-source visual package. Owner-uploaded prepared variants are immutable. Music is locked from the selected track or catalog fallback so Remotion handoff can render without waiting on R2."
      : "Studio exact-source visual package. Owner-uploaded prepared variants are immutable; R2 may choose music but must not replace, reorder, or substitute these visuals.",
  };
  const selected = {
    schema_version: "studio.source-selection.2",
    authority: "studio_owner_uploaded_exact_source",
    production_request_record_id: requestRecord.id,
    production_request_output_record_id: outputRow.id,
    platform,
    output_type: outputType,
    aspect_ratio: ratio,
    selection_status: "Selected",
    validation_status: "Valid",
    selected_clip_count: clips.length,
    target_final_length_seconds: durationSeconds,
    target_total_frames: totalFrames,
    selected_duration_frames_total: totalFrames,
    fps,
    selected_clips: clips,
    render_prep: renderPrep,
    selection_summary: `Studio exact source: ${clips.length} owner-uploaded prepared variant(s), preserved in user order.`,
    missing_asset_notes: omittedSourceIds.length
      ? `Omitted ${omittedSourceIds.length} source(s) missing ${ratio}: ${omittedSourceIds.join(", ")}`
      : "",
    confidence_score: 1,
  };
  return {
    status: "Ready",
    ratio,
    clips,
    clip_count: clips.length,
    omitted_source_ids: omittedSourceIds,
    total_frames: totalFrames,
    composition_id: compositionId,
    output_filename: compositionId ? outputFilename : null,
    selected_assets_json: JSON.stringify(selected),
    render_clip_list_json: renderPrep.render_clip_list_json,
  };
}
/*__STUDIO_WORKER_END:item4StudioSourcePackageForOutput__*/

export function outputWorkItemFields(parentContentItem, requestRecord, outputRow, effective, sourcePackage = null) {
  const route = effective.route;
  const platform = effective.platform;
  const isCarouselFamily = route?.pipeline_family === "Carousel / Photo Set" ||
                           route?.pipeline_family === "Slideshow Video";

  const exactVideoCount = effective.video_clip_count_mode === "Exact"
    ? effective.video_clip_count_exact
    : Number(f(parentContentItem, "Video_Clip_Count") || effective.video_clip_count_exact || 7);

  const legacyCarouselCount = effective.carousel_slide_count_mode === "Exact"
    ? effective.carousel_slide_count_exact
    : Number(f(parentContentItem, "Carousel_Slide_Count") || 5);

  const notes = [
    String(f(parentContentItem, "Internal_Notes") || "").trim(),
    `Studio output work item: ${platform} / ${effective.output_type}.`,
    `Pipeline family: ${route?.pipeline_family || "Blocked"}.`,
    `Proven mapping: ${route?.proven_mapping || "None"}.`,
    effective.output_notes ? `Output-specific notes: ${effective.output_notes}` : "",
  ].filter(Boolean).join("\n");

  const productionNotes = [
    String(f(requestRecord, "Production_Notes") || "").trim(),
    effective.output_notes,
  ].filter(Boolean).join("\n\n");

  const snapshot = {
    production_request_record_id: requestRecord.id,
    production_request_id: f(requestRecord, "Production_Request_ID"),
    production_request_output_record_id: outputRow.id,
    production_request_output_id: f(outputRow, "Production_Request_Output_ID"),
    platform,
    output_type: effective.output_type,
    pipeline_family: route?.pipeline_family || null,
    content_type: route?.content_type || null,
    proven_mapping: route?.proven_mapping || null,
    voiceover_mode: effective.voiceover_mode,
    background_music_mode: effective.background_music_mode,
    thumbnail_mode: effective.thumbnail_mode,
    video_duration_seconds: effective.video_duration_seconds,
    voiceover_duration_seconds: effective.voiceover_duration_seconds,
    music_start_seconds: effective.music_start_seconds,
    voiceover_tail_seconds: effective.voiceover_tail_seconds,
    video_clip_count_mode: effective.video_clip_count_mode,
    video_clip_count_exact: effective.video_clip_count_exact,
    video_clip_count_min: effective.video_clip_count_min,
    video_clip_count_max: effective.video_clip_count_max,
    carousel_slide_count_mode: effective.carousel_slide_count_mode,
    carousel_slide_count_exact: effective.carousel_slide_count_exact,
    carousel_slide_count_min: effective.carousel_slide_count_min,
    carousel_slide_count_max: effective.carousel_slide_count_max,
    carousel_image_mode: effective.carousel_image_mode,
    title_mode: effective.title_mode,
    requested_title: effective.requested_title || null,
    caption_mode: effective.caption_mode,
    requested_caption: effective.requested_caption || null,
    script_mode: effective.script_mode,
    requested_script: effective.requested_script || null,
    preferred_music: effective.music,
    publish_mode: effective.publish_mode,
    scheduled_at: effective.scheduled_at,
    output_notes: effective.output_notes || null,
    applied_at: new Date().toISOString(),
  };

  return {
    Test_Run_ID: String(f(requestRecord, "Test_Run_ID") || "").trim() || null,
    ...copyWritableParentFields(parentContentItem),

    Content_Title: String(f(parentContentItem, "Content_Title") || "").trim(),
    Content_Status: "Idea Approved",
    Render_Status: "Not Ready",
    Do_Not_Produce: false,

    Content_Type: route.content_type,
    Content_Duration: effective.video_duration_seconds,
    Include_Voiceover: effective.voiceover_mode,
    Include_Background_Music: effective.background_music_mode,
    Include_Thumbnail: effective.thumbnail_mode,
    Voiceover_Duration_Seconds: effective.voiceover_duration_seconds,
    Music_Start_Seconds: effective.music_start_seconds ?? 0,
    Voiceover_Tail_Seconds: effective.voiceover_tail_seconds,

    Voiceover_Status: effective.voiceover_mode === "Yes" ? "Not Started" : "Not Needed",
    Thumbnail_Status: effective.thumbnail_mode === "Yes" ? "Not Started" : "Not Needed",

    Video_Clip_Count: exactVideoCount,
    Requested_Video_Clip_Count_Mode: effective.video_clip_count_mode,
    Requested_Video_Clip_Count_Min: effective.video_clip_count_min ?? null,
    Requested_Video_Clip_Count_Max: effective.video_clip_count_max ?? null,

    Carousel_Image_Mode: isCarouselFamily ? effective.carousel_image_mode : null,
    Carousel_Slide_Count: isCarouselFamily ? legacyCarouselCount : null,
    Carousel_Target_Platforms: isCarouselFamily ? [platform] : [],
    Requested_Carousel_Slide_Count_Mode: effective.carousel_slide_count_mode,
    Requested_Carousel_Slide_Count_Min: effective.carousel_slide_count_min ?? null,
    Requested_Carousel_Slide_Count_Max: effective.carousel_slide_count_max ?? null,

    Production_Request: [requestRecord.id],
    Production_Request_Output: [outputRow.id],
    Parent_Content_Item: [parentContentItem.id],
    Studio_Output_Type: effective.output_type,
    Studio_Is_Output_Work_Item: true,
    Studio_Target_Platform: platform,

    Studio_Source_Authority_Status: sourcePackage?.status || null,
    Studio_Source_Clip_1_URL: sourcePackage?.clips?.[0]?.url || null,
    Studio_Source_Clip_2_URL: sourcePackage?.clips?.[1]?.url || null,
    Studio_Source_Clip_3_URL: sourcePackage?.clips?.[2]?.url || null,
    Studio_Source_Clip_1_Media_Asset_ID: sourcePackage?.clips?.[0]?.media_asset_record_id || null,
    Studio_Source_Clip_2_Media_Asset_ID: sourcePackage?.clips?.[1]?.media_asset_record_id || null,
    Studio_Source_Clip_3_Media_Asset_ID: sourcePackage?.clips?.[2]?.media_asset_record_id || null,
    Studio_Source_Selected_Assets_JSON: sourcePackage?.selected_assets_json || null,
    Studio_Source_Render_Clip_List_JSON: sourcePackage?.render_clip_list_json || null,
    Studio_Source_Selected_Clip_Count: sourcePackage?.clip_count || null,
    Studio_Source_Render_Total_Frames: sourcePackage?.total_frames || null,
    Studio_Source_Composition_ID: sourcePackage?.composition_id || null,

    Requested_Title_Mode: effective.title_mode,
    Requested_Title: effective.requested_title || null,
    Requested_Caption_Mode: effective.caption_mode,
    Requested_Caption: effective.requested_caption || null,
    Requested_Script_Mode: effective.script_mode,
    Requested_Script: effective.requested_script || null,
    Production_Request_Notes: productionNotes || null,

    Preferred_Music_Asset: effective.music.record_id ? [effective.music.record_id] : [],
    Preferred_Music_URL: effective.music.url,
    Preferred_Music_Google_Drive_File_ID: effective.music.google_drive_file_id,

    Production_Request_Directives_JSON: JSON.stringify(snapshot),
    Production_Request_Applied_At: snapshot.applied_at,

    Internal_Notes: notes,
  };
}

/*__STUDIO_WORKER_END:outputWorkItemFields__*/

export function item4PlanItemForOutput(requestRecord, outputRow) {
  const plan = item4ParseJson(f(requestRecord, "Studio_Output_Plan_JSON"), null);
  const platform = String(f(outputRow, "Platform") || "").trim();
  const outputType = String(f(outputRow, "Output_Type") || "").trim();
  return (Array.isArray(plan?.items) ? plan.items : []).find(item =>
    item4BridgePlanKey(item?.platform, item?.output_type) === item4BridgePlanKey(platform, outputType)
  ) || null;
}
/*__STUDIO_WORKER_END:item4PlanItemForOutput__*/

export function platformOutputSeedFields(parentContentItem, requestRecord, outputRow, effective, sourcePackage) {
  const planItem = item4PlanItemForOutput(requestRecord, outputRow) || {};
  const revisionReset = productionRequestRevisionOpen(requestRecord)
    ? {
        Review_Status: "Pending Review",
        Publish_Status: "Not Ready",
        Do_Not_Publish: false,
        Review_Decision_At: null,
        Final_File_URL: null,
        Final_File_ID: null,
        Output_URL: null,
        Publish_Asset_URL: null,
        Remotion_Job_ID: null,
        Remotion_Status_URL: null,
        Remotion_Props_JSON: null,
        Remotion_Error_Message: null,
        Final_File_Error_Message: null,
        Final_File_Storage_Status: null,
        Studio_Preview_URL: null,
        Studio_Preview_R2_Key: null,
        Studio_Preview_Updated_At: null,
        Timing_Status: null,
        Timing_Timeline_JSON: null,
        Timing_Analysis_JSON: null,
        Music_BPM: null,
        Music_Duration_Seconds: null,
        Scheduled_Post_Date: null,
      }
    : {};
  const route = effective.route || {};
  const clips = sourcePackage?.clips || [];
  const perClipFrames = sourcePackage?.clip_count ? Math.round(sourcePackage.total_frames / sourcePackage.clip_count) : 0;
  const nativePhoto = studioOutputIsNativePhotoRoute(
    effective.platform,
    effective.output_type,
    planItem.mapping_type || route.proven_mapping
  );
  const nativeReady = nativePhoto && clips.length > 0;
  const nativeMissing = nativePhoto && clips.length === 0;
  const remotionReady = !nativePhoto && sourcePackage?.status === "Ready" && Boolean(sourcePackage?.selected_assets_json);
  const snapshot = {
    production_request_record_id: requestRecord.id,
    production_request_output_record_id: outputRow.id,
    platform: effective.platform,
    output_type: effective.output_type,
    pipeline_family: route.pipeline_family || null,
    content_type: route.content_type || null,
    title_mode: effective.title_mode,
    requested_title: effective.requested_title || null,
    caption_mode: effective.caption_mode,
    requested_caption: effective.requested_caption || null,
    script_mode: effective.script_mode,
    requested_script: effective.requested_script || null,
    voiceover_mode: effective.voiceover_mode,
    background_music_mode: effective.background_music_mode,
    thumbnail_mode: effective.thumbnail_mode,
    video_duration_seconds: effective.video_duration_seconds,
    voiceover_duration_seconds: effective.voiceover_duration_seconds,
    music_start_seconds: effective.music_start_seconds,
    voiceover_tail_seconds: effective.voiceover_tail_seconds,
    applied_at: new Date().toISOString(),
  };
  return {
    ...revisionReset,
    Test_Run_ID: String(f(requestRecord, "Test_Run_ID") || "").trim() || null,
    Content_Item: [parentContentItem.id],
    Platform: effective.platform,
    Format: String(planItem.format || route.content_type || "").trim(),
    Platform_Output_Type: String(planItem.mapping_type || route.proven_mapping || effective.output_type || "").trim(),
    Aspect_Ratio: String(planItem.aspect_ratio || sourcePackage?.ratio || "").trim(),
    Output_Status: nativeReady ? "Ready for Review" : "In Production",
    Render_Status: nativeReady ? "Native Photo Route" : null,
    Studio_Preview_URL: nativeReady ? (String(clips[0]?.url || "").trim() || null) : null,
    Thumbnail_URL: (function thumbnailUrl() {
      const parentThumb = studioAiThumbnailUrl(f(parentContentItem, "Thumbnail_URL"));
      const source = item4ThumbnailSource(effective.thumbnail_mode);
      if (parentThumb) return parentThumb;
      if (nativePhoto) {
        return item4CoverStillUrl(requestRecord, outputRow)
          || studioClipPublicCdnUrl(clips[0])
          || String(clips[0]?.url || "").trim()
          || null;
      }
      if (source === "none") return null;
      if (source === "frame") return item4CoverStillUrl(requestRecord, outputRow) || null;
      return null;
    }()),
    Asset_Selection_Status: remotionReady ? "Selected" : null,
    Output_Title: String(f(parentContentItem,"Content_Title") || "").trim(),
    Output_Caption: effective.requested_caption || String(f(parentContentItem, "Caption") || "").trim() || null,
    Output_Hashtags: String(f(parentContentItem,"Hashtags") || "").trim() || null,
    Output_Notes: [
      `Studio single-parent output seed. Production Request Output ${String(f(outputRow,"Production_Request_Output_ID")||outputRow.id)} is the per-platform execution authority.`,
      effective.output_type === "Story"
        ? `Companion 10-second Story teaser from the first photo, slight zoom, music, no voiceover. After the matching ${effective.platform} main post is live, attach that post URL as the Story link.`
        : "",
    ].filter(Boolean).join(" "),
    Asset_Need_Status: "Not Needed",
    Production_Request_Output: [outputRow.id],
    Studio_Output_Type: effective.output_type,
    Voiceover_Tail_Seconds: effective.voiceover_tail_seconds,
    Selected_Clip_1_URL: clips[0]?.url || null,
    Selected_Clip_2_URL: clips[1]?.url || null,
    Selected_Clip_3_URL: clips[2]?.url || null,
    Clip_1_URL: clips[0]?.url || null,
    Clip_2_URL: clips[1]?.url || null,
    Clip_3_URL: clips[2]?.url || null,
    Selected_Clip_1_Media_Asset_ID: clips[0]?.media_asset_record_id || null,
    Selected_Clip_2_Media_Asset_ID: clips[1]?.media_asset_record_id || null,
    Selected_Clip_3_Media_Asset_ID: clips[2]?.media_asset_record_id || null,
    Selected_Clip_Count: sourcePackage?.clip_count || 0,
    Selected_Assets_JSON: sourcePackage?.selected_assets_json || null,
    Render_Clip_List_JSON: sourcePackage?.render_clip_list_json || null,
    Render_Total_Frames: sourcePackage?.total_frames || 0,
    Composition_ID: sourcePackage?.composition_id || null,
    Output_Filename: sourcePackage?.composition_id ? (sourcePackage.output_filename || null) : null,
    Clip_1_Duration_Frames: clips[0] ? perClipFrames : 0,
    Clip_2_Duration_Frames: clips[1] ? perClipFrames : 0,
    Clip_3_Duration_Frames: clips[2] ? perClipFrames : 0,
    Asset_Selection_Notes: sourcePackage?.status === "Ready"
      ? "Studio exact source authority locked before R2; visuals may not be replaced or reordered."
      : (nativeMissing
        ? `Missing ${String(planItem.aspect_ratio || sourcePackage?.ratio || "").trim() || "plan"} crop for this output.`
        : null),
    Studio_Output_Override_Applied: true,
    Studio_Effective_Title_Mode: effective.title_mode,
    Studio_Effective_Requested_Title: effective.requested_title || null,
    Studio_Effective_Caption_Mode: effective.caption_mode,
    Studio_Effective_Requested_Caption: effective.requested_caption || null,
    Studio_Effective_Script_Mode: effective.script_mode,
    Studio_Effective_Requested_Script: effective.requested_script || null,
    Studio_Effective_Thumbnail_Mode: effective.thumbnail_mode,
    Studio_Effective_Voiceover_Mode: effective.voiceover_mode,
    Studio_Effective_Background_Music_Mode: effective.background_music_mode,
    Studio_Effective_Video_Duration_Seconds: effective.video_duration_seconds,
    Studio_Effective_Voiceover_Duration_Seconds: effective.voiceover_duration_seconds,
    Studio_Effective_Music_Start_Seconds: effective.music_start_seconds ?? 0,
    Voiceover_Duration_Seconds: effective.voiceover_duration_seconds,
    Music_Start_Seconds: effective.music_start_seconds ?? 0,
    Studio_Effective_Voiceover_Tail_Seconds: effective.voiceover_tail_seconds,
    Studio_Output_Directives_JSON: JSON.stringify(snapshot),
    Requested_Video_Clip_Count_Mode: effective.video_clip_count_mode,
    Requested_Video_Clip_Count_Exact: effective.video_clip_count_mode === "Exact" ? effective.video_clip_count_exact : null,
    Requested_Video_Clip_Count_Min: effective.video_clip_count_mode === "Target range" ? effective.video_clip_count_min : null,
    Requested_Video_Clip_Count_Max: effective.video_clip_count_mode === "Target range" ? effective.video_clip_count_max : null,
    Requested_Carousel_Slide_Count_Mode: effective.carousel_slide_count_mode,
    Requested_Carousel_Slide_Count_Exact: effective.carousel_slide_count_mode === "Exact" ? effective.carousel_slide_count_exact : null,
    Requested_Carousel_Slide_Count_Min: effective.carousel_slide_count_mode === "Target range" ? effective.carousel_slide_count_min : null,
    Requested_Carousel_Slide_Count_Max: effective.carousel_slide_count_mode === "Target range" ? effective.carousel_slide_count_max : null,
    Studio_Effective_Carousel_Image_Mode: effective.carousel_image_mode,
    Preferred_Music_Media_Asset_ID: effective.music?.record_id || null,
    Preferred_Music_URL: (sourcePackage?.story_teaser || studioIsFinishedPassthrough(requestRecord))
      ? null
      : (effective.music?.url || null),
    Music_URL: (sourcePackage?.story_teaser || studioIsFinishedPassthrough(requestRecord))
      ? null
      : (effective.music?.url || null),
    Selected_Music_URL: (sourcePackage?.story_teaser || studioIsFinishedPassthrough(requestRecord))
      ? null
      : (effective.music?.url || null),
    Selected_Music_Media_Asset_ID: (sourcePackage?.story_teaser || studioIsFinishedPassthrough(requestRecord))
      ? null
      : (effective.music?.record_id || null),
    Music_Volume: (sourcePackage?.story_teaser || studioIsFinishedPassthrough(requestRecord))
      ? 0
      : (effective.music?.url ? STUDIO_DEFAULT_MUSIC_VOLUME : 0),
    Voiceover_URL: item4StudioDirectiveYes(effective.voiceover_mode)
      ? (String(f(parentContentItem, "Voiceover_URL") || "").trim() || null)
      : null,
    ...(sourcePackage?.story_teaser ? {} : studioFinishedSeedOverlay(requestRecord, clips, nativeReady)),
    ...(function scheduledStamp() {
      const raw = String(effective.scheduled_at || "").trim();
      if (!raw || Number.isNaN(Date.parse(raw))) return {};
      return { Scheduled_Post_Date: new Date(raw).toISOString() };
    }()),
  };
}
/*__STUDIO_WORKER_END:platformOutputSeedFields__*/

export function studioFinishedSeedOverlay(requestRecord, clips, nativeReady) {
  const kind = studioFinishedOriginKind(requestRecord);
  if (!kind) return {};
  const firstUrl = String(clips[0]?.url || "").trim() || null;
  const az = studioIsAzFinishedVideo(requestRecord);
  const note = az
    ? `origin=az-finished-video; ez-input=${kind}. Finished passthrough. Skip P1/voiceover/R2-R5. Generate the grid thumbnail (photorealistic scene; restrained gold / black-and-gold lettering ~80%; colorful 3D only occasionally). AI may write the post caption only; do not burn text onto the finished file. az-auto-queue=1.`
    : `origin=ez-wizard; ez-input=${kind}. Finished passthrough. Skip P1/voiceover/R2-R5. Generate the grid thumbnail (photorealistic scene; restrained gold / black-and-gold lettering ~80%; colorful 3D only occasionally). AI may write the post caption only; do not burn text onto the finished file.`;
  if (kind === "finished-video") {
    return {
      Output_Status: firstUrl ? "Ready for Review" : "In Production",
      Render_Status: firstUrl ? "Rendered" : null,
      Final_File_URL: firstUrl,
      Studio_Preview_URL: firstUrl,
      Publish_Asset_URL: firstUrl && item4UrlIsPublicPublishCdn(firstUrl) ? firstUrl : null,
      Asset_Need_Status: "Not Needed",
      Asset_Selection_Status: null,
      Composition_ID: null,
      Output_Notes: note,
    };
  }
  return {
    Output_Status: nativeReady || clips.length ? "Ready for Review" : "In Production",
    Render_Status: clips.length ? "Native Photo Route" : null,
    Asset_Need_Status: "Not Needed",
    Output_Notes: note,
  };
}
/*__STUDIO_WORKER_END:studioFinishedSeedOverlay__*/

export function studioIndustryBestWindows(platform, outputType) {
  const p = String(platform || "").toLowerCase();
  const t = String(outputType || "").toLowerCase();
  if (p.includes("tiktok")) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], windows: ["19:00-21:00"], label: "TikTok weekday evenings" };
  if (p.includes("youtube") && (t.includes("standard") || t.includes("long"))) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], windows: ["10:00-16:00"], label: "YouTube standard weekday daytime" };
  if (p.includes("youtube")) return { days: ["Wed", "Thu", "Fri", "Sat"], windows: ["14:00-16:00", "20:00-22:00"], label: "YouTube Short afternoon/evening" };
  if (t.includes("story")) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], windows: ["16:00-18:00", "19:00-21:00"], label: "Stories late afternoon/evening" };
  if (t.includes("carousel") || t.includes("single") || t.includes("feed") || t.includes("multi-image") || t.includes("photo")) {
    return { days: ["Wed", "Thu"], windows: ["12:00-14:00", "18:00-20:00"], label: "Feed/carousel midday or evening" };
  }
  if (p.includes("facebook")) return { days: ["Tue", "Wed", "Thu"], windows: ["12:00-13:00", "18:00-20:00"], label: "Facebook Reel lunch/evening" };
  return { days: ["Tue", "Wed", "Thu"], windows: ["11:00-13:00", "18:00-21:00"], label: "Reel midday or evening" };
}
/*__STUDIO_WORKER_END:studioIndustryBestWindows__*/

export function studioChicagoDateTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}
/*__STUDIO_WORKER_END:studioChicagoDateTimeParts__*/

export function studioChicagoWallToUtcMs(year, month, day, hour, minute) {
  const want = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ms = want;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 8; i++) {
    const parts = fmt.formatToParts(new Date(ms));
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    const got = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), 0, 0);
    const delta = want - got;
    if (delta === 0) return ms;
    ms += delta;
  }
  return ms;
}
/*__STUDIO_WORKER_END:studioChicagoWallToUtcMs__*/

export function studioAddCivilDays(year, month, day, delta) {
  const utc = Date.UTC(year, month - 1, day) + delta * 86400000;
  const next = new Date(utc);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}
/*__STUDIO_WORKER_END:studioAddCivilDays__*/

export async function studioScheduleHorizonDays(env, fallback = MAE_SUGGEST_HORIZON_DAYS) {
  try {
    const settings = await studioActivePipelineSettings(env, [MAE_SCHEDULE_HORIZON_SETTING]);
    const raw = settings?.[MAE_SCHEDULE_HORIZON_SETTING];
    return maeNormalizeHorizonDays(raw, fallback);
  } catch {
    return maeNormalizeHorizonDays(fallback);
  }
}
/*__STUDIO_WORKER_END:studioScheduleHorizonDays__*/

export function studioSuggestCivilKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/*__STUDIO_WORKER_END:studioSuggestCivilKey__*/

export function studioSuggestParseWindowStart(window) {
  const first = String(window || "12:00-13:00").split("-")[0] || "12:00";
  const [hh, mm] = first.split(":").map((n) => Number(n) || 0);
  return { hour: hh, minute: mm || 0 };
}
/*__STUDIO_WORKER_END:studioSuggestParseWindowStart__*/

export function studioSuggestHorizon(now = new Date(), horizonDays = STUDIO_SUGGEST_HORIZON_DAYS) {
  const chicago = studioChicagoDateTimeParts(now);
  const days = [];
  for (let i = 0; i < horizonDays; i++) {
    const civil = i === 0
      ? { year: chicago.year, month: chicago.month, day: chicago.day }
      : studioAddCivilDays(chicago.year, chicago.month, chicago.day, i);
    const noonMs = studioChicagoWallToUtcMs(civil.year, civil.month, civil.day, 12, 0);
    days.push({
      ...civil,
      index: i,
      weekday: studioChicagoWeekdayShort(new Date(noonMs)),
      key: studioSuggestCivilKey(civil.year, civil.month, civil.day),
    });
  }
  return days;
}
/*__STUDIO_WORKER_END:studioSuggestHorizon__*/

export function studioOccupiedOnCivilDay(occupiedMs, civil) {
  return (occupiedMs || []).filter((ms) => {
    if (!Number.isFinite(ms)) return false;
    const parts = studioChicagoDateTimeParts(new Date(ms));
    return studioSuggestCivilKey(parts.year, parts.month, parts.day) === civil.key;
  });
}
/*__STUDIO_WORKER_END:studioOccupiedOnCivilDay__*/

export function studioFlattenOccupiedByPlatform(occupiedByPlatform) {
  return Object.values(occupiedByPlatform || {}).flat().filter((ms) => Number.isFinite(ms));
}
/*__STUDIO_WORKER_END:studioFlattenOccupiedByPlatform__*/

export function studioOccupiedForPlatform(occupiedByPlatform, platform) {
  const want = String(platform || "").trim().toLowerCase();
  if (!want) return [];
  const exact = occupiedByPlatform?.[platform];
  if (Array.isArray(exact)) return exact;
  const merged = [];
  for (const [key, times] of Object.entries(occupiedByPlatform || {})) {
    const lane = String(key || "").trim().toLowerCase();
    if (lane === want || lane.startsWith(`${want}::`)) {
      for (const ms of times || []) {
        if (Number.isFinite(ms)) merged.push(ms);
      }
    }
  }
  return merged;
}
/*__STUDIO_WORKER_END:studioOccupiedForPlatform__*/

export function studioOccupiedForLane(occupiedByLane, platform, outputType) {
  const lane = maeScheduleLaneKey(platform, outputType);
  if (!lane) return [];
  if (Array.isArray(occupiedByLane?.[lane])) return occupiedByLane[lane];
  for (const [key, times] of Object.entries(occupiedByLane || {})) {
    if (String(key || "").trim().toLowerCase() === lane) return times || [];
  }
  // Legacy callers that still store bare platform keys.
  return studioOccupiedForPlatform(occupiedByLane, platform);
}
/*__STUDIO_WORKER_END:studioOccupiedForLane__*/

export function studioScheduleTimeCrowding(ms, occupiedMs, radiusMinutes = 90) {
  const target = studioChicagoDateTimeParts(new Date(ms));
  const targetMinutes = target.hour * 60 + target.minute;
  let count = 0;
  for (const other of occupiedMs || []) {
    if (!Number.isFinite(other)) continue;
    const parts = studioChicagoDateTimeParts(new Date(other));
    const otherMinutes = parts.hour * 60 + parts.minute;
    const raw = Math.abs(targetMinutes - otherMinutes);
    const distance = Math.min(raw, 1440 - raw);
    if (distance <= radiusMinutes) count += 1;
  }
  return count;
}
/*__STUDIO_WORKER_END:studioScheduleTimeCrowding__*/

export function studioScoreAnalyticsSlot({ preferred, windowIndex, crowding, platformCrowding, timeCrowding, dayIndex }) {
  let score = 100;
  score += preferred ? 18 : 0;
  score += Math.max(0, 12 - windowIndex * 5);
  score += platformCrowding === 0 ? 14 : 0;
  score += crowding === 0 ? 8 : 0;
  score -= Math.min(platformCrowding, 4) * 42;
  score -= Math.min(crowding, 8) * 12;
  score -= Math.min(timeCrowding, 6) * 8;
  score -= dayIndex * 1.5;
  return score;
}
/*__STUDIO_WORKER_END:studioScoreAnalyticsSlot__*/

export function studioPickBalancedSuggestedIso(windows, now = new Date(), options = {}) {
  return maePickBalancedSuggestedIso(windows, now, options);
}
/*__STUDIO_WORKER_END:studioPickBalancedSuggestedIso__*/

export function studioSuggestedLocalDatetime(windows, now = new Date(), options = {}) {
  return studioPickBalancedSuggestedIso(windows, now, options);
}
/*__STUDIO_WORKER_END:studioSuggestedLocalDatetime__*/

export function studioScheduleStoryRank(outputType) {
  return /story/i.test(String(outputType || "")) ? 1 : 0;
}
/*__STUDIO_WORKER_END:studioScheduleStoryRank__*/

export function studioScheduleOverridesFromPayload(payload) {
  const overrides = new Map();
  const schedules = payload?.schedules && typeof payload.schedules === "object" && !Array.isArray(payload.schedules)
    ? payload.schedules
    : {};
  for (const [key, value] of Object.entries(schedules)) {
    const iso = String(value || "").trim();
    if (!key || !iso || Number.isNaN(Date.parse(iso))) continue;
    overrides.set(String(key), new Date(iso).toISOString());
  }
  return overrides;
}
/*__STUDIO_WORKER_END:studioScheduleOverridesFromPayload__*/

export function studioBuildSuggestedScheduleMap(items, occupiedByPlatform = {}, now = new Date(), options = {}) {
  return maeBuildSuggestedScheduleMap(items, occupiedByPlatform, now, options);
}
/*__STUDIO_WORKER_END:studioBuildSuggestedScheduleMap__*/

export async function studioOccupiedSchedulesOrEmpty(env, options = {}) {
  try {
    return await studioLoadOccupiedSchedules(env, options);
  } catch (error) {
    console.warn("suggested schedule occupancy read failed", error);
    return {};
  }
}
/*__STUDIO_WORKER_END:studioOccupiedSchedulesOrEmpty__*/

export function studioDestinationScheduleStamp(current, key, stamps, _overrides) {
  const iso = stamps.get(key);
  if (!iso) return null;
  const currentIso = current ? String(f(current, "Scheduled_At") || "").trim() : "";
  if (!currentIso) return iso;
  const currentMs = Date.parse(currentIso);
  const nextMs = Date.parse(iso);
  const same = Number.isFinite(currentMs) && Number.isFinite(nextMs)
    && new Date(currentMs).toISOString() === new Date(nextMs).toISOString();
  // A stored 5:30 that lost its slot must be written. Matching times stay put.
  if (same) return null;
  return iso;
}
/*__STUDIO_WORKER_END:studioDestinationScheduleStamp__*/

export async function studioLoadPlanScheduleOccupancy(env, { excludeRequestId = "", profile = null } = {}) {
  const occupied = await studioOccupiedSchedulesOrEmpty(env, { profile });
  try {
    const now = Date.now();
    const lookback = airtableFormulaEscape(new Date(now - STUDIO_OCCUPIED_LOOKBACK_MS).toISOString());
    const horizon = airtableFormulaEscape(new Date(now + STUDIO_OCCUPIED_HORIZON_MS).toISOString());
    const brandId = studioFirstLinkedId(f(profile, "Brand"));
    const brandName = String(f(profile, "Brand_Name") || "").trim();
    // ARRAYJOIN of a linked Brand field is the brand name, not the record id.
    // Matching only the id returned zero plan rows, so the next package never
    // saw the previous package and every first post landed on 5:30.
    const brandParts = [];
    if (brandId) {
      const id = airtableFormulaEscape(brandId);
      brandParts.push(`FIND("${id}",ARRAYJOIN({Brand})&"")`);
      brandParts.push(`FIND("${id}",{Brand}&"")`);
    }
    if (brandName) brandParts.push(`FIND("${airtableFormulaEscape(brandName)}",ARRAYJOIN({Brand})&"")`);
    const brandClause = brandParts.length ? `,OR(${brandParts.join(",")})` : "";
    const rows = await listRecords(env, PRODUCTION_REQUEST_OUTPUT_TABLE, {
      limit: STUDIO_OCCUPIED_LIST_LIMIT,
      sortField: "Scheduled_At",
      sortDirection: "asc",
      filterFormula: `AND({Enabled}=1,{Scheduled_At}!="",IS_AFTER({Scheduled_At},DATETIME_PARSE("${lookback}")),IS_BEFORE({Scheduled_At},DATETIME_PARSE("${horizon}"))${brandClause})`,
      fields: ["Platform", "Output_Type", "Scheduled_At", "Production_Request", "Brand"],
    });
    for (const row of rows || []) {
      const requestIds = arrayOrEmpty(f(row, "Production_Request")).map((id) => String(id || "").trim());
      if (excludeRequestId && requestIds.includes(excludeRequestId)) continue;
      if (brandId && !studioOccupiedLinkedIds(f(row, "Brand")).includes(brandId)) continue;
      const outputType = String(f(row, "Output_Type") || "").trim();
      const platform = String(f(row, "Platform") || "").trim();
      const ms = studioScheduleMs(f(row, "Scheduled_At"));
      if (!platform || ms == null) continue;
      const lane = maeScheduleLaneKey(platform, outputType) || platform.toLowerCase();
      (occupied[lane] ||= []).push(ms);
    }
  } catch (error) {
    console.warn("pending plan schedule occupancy read failed", error);
  }
  return occupied;
}
/*__STUDIO_WORKER_END:studioLoadPlanScheduleOccupancy__*/

export function studioInsightsObservationsTable(env) {
  return env.STUDIO_INSIGHTS_OBSERVATIONS_TABLE_ID || STUDIO_INSIGHTS_OBSERVATIONS_TABLE;
}
/*__STUDIO_WORKER_END:studioInsightsObservationsTable__*/

export function studioInsightsLearnedTable(env) {
  return env.STUDIO_INSIGHTS_LEARNED_TABLE_ID || STUDIO_INSIGHTS_LEARNED_TABLE;
}
/*__STUDIO_WORKER_END:studioInsightsLearnedTable__*/

export function studioInsightsDbEnabled(env) {
  return Boolean(env.AIRTABLE_PAT && env.AIRTABLE_BASE_ID);
}
/*__STUDIO_WORKER_END:studioInsightsDbEnabled__*/

export function studioChicagoMonthDay(iso, when = new Date()) {
  const date = new Date(iso || when);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    if (!Number.isFinite(month) || month < 1 || !Number.isFinite(day) || day < 1) return null;
    return { month, day };
  } catch {
    return null;
  }
}
/*__STUDIO_WORKER_END:studioChicagoMonthDay__*/

export function studioChicagoSeason(iso, when = new Date()) {
  const parts = studioChicagoMonthDay(iso, when);
  if (!parts) return "winter";
  const md = parts.month * 100 + parts.day;
  // Astronomical-ish Northern Hemisphere seasons in Chicago local time.
  // Month-only mapping made Sep 1–21 default to Fall while it is still summer.
  if (md >= 1221 || md < 320) return "winter";
  if (md < 621) return "spring";
  if (md < 922) return "summer";
  return "fall";
}
/*__STUDIO_WORKER_END:studioChicagoSeason__*/

export function studioNormalizeInsightsSeason(value, fallback = studioChicagoSeason()) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "all") return "all";
  return STUDIO_INSIGHTS_SEASONS.includes(raw) ? raw : fallback;
}
/*__STUDIO_WORKER_END:studioNormalizeInsightsSeason__*/

export function studioSeasonLabel(season) {
  if (season === "winter") return "Winter";
  if (season === "spring") return "Spring";
  if (season === "summer") return "Summer";
  if (season === "fall") return "Fall";
  return "All seasons";
}
/*__STUDIO_WORKER_END:studioSeasonLabel__*/

export function studioAnalyzeCaption(caption) {
  const raw = String(caption || "").trim();
  const text = raw.slice(0, 500);
  const hashtags = (text.match(/#[\w\u0080-\uFFFF]+/g) || []).length;
  let emoji = 0;
  try {
    emoji = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
  } catch {
    emoji = 0;
  }
  return {
    text: text || null,
    length: raw.length,
    hashtags,
    emoji,
    has_question: /\?/.test(text),
    has_cta: STUDIO_INSIGHTS_CTA_PATTERN.test(text),
  };
}
/*__STUDIO_WORKER_END:studioAnalyzeCaption__*/

export function studioInsightsEngagementScore(post) {
  const engagement = Number(post?.views || 0) + Number(post?.likes || 0) + Number(post?.comments || 0);
  return Math.round((1 + Math.log1p(Math.max(0, engagement)) / 10) * 1000) / 1000;
}
/*__STUDIO_WORKER_END:studioInsightsEngagementScore__*/

export function studioInsightsObservationKey(source, platform, handle, publishedAt, externalPostId) {
  const src = String(source || "similar_account").trim().toLowerCase();
  const plat = String(platform || "").trim().toLowerCase();
  const acct = String(handle || "first_party").trim().toLowerCase();
  const stamp = String(publishedAt || externalPostId || "").trim();
  const external = String(externalPostId || stamp).trim();
  return `${src}:${plat}:${acct}:${external}`.slice(0, 180);
}
/*__STUDIO_WORKER_END:studioInsightsObservationKey__*/

export function studioInsightsLearnedKey(profile, platform, outputType, season, metricType) {
  return [
    studioNormalizeSimilarProfile(profile),
    String(platform || "all").trim().toLowerCase(),
    String(outputType || "all").trim().toLowerCase(),
    studioNormalizeInsightsSeason(season, "all"),
    String(metricType || "post_time").trim().toLowerCase(),
  ].join("|");
}
/*__STUDIO_WORKER_END:studioInsightsLearnedKey__*/

export function studioInsightsNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
/*__STUDIO_WORKER_END:studioInsightsNumberOrNull__*/

export function studioInsightsObservationFields(post, meta = {}) {
  const publishedAt = post?.published_at || null;
  const weekdayHour = publishedAt ? studioChicagoWeekdayHour(publishedAt) : null;
  const caption = studioAnalyzeCaption(post?.caption);
  const platform = String(meta.platform || post?.platform || "").trim();
  const handle = String(meta.handle || post?.handle || "first_party").trim();
  const source = String(meta.source || post?.source || "similar_account").trim().toLowerCase();
  const externalPostId = String(post?.external_post_id || post?.platform_post_id || publishedAt || "").trim();
  const firstParty = source === "first_party";
  return {
    Observation_Key: String(meta.observation_key || "").trim()
      || studioInsightsObservationKey(source, platform, handle, publishedAt, externalPostId),
    Source: firstParty ? "first_party" : "similar_account",
    Profile: studioNormalizeSimilarProfile(meta.profile || post?.profile || "chicago"),
    Platform: platform,
    Account_Handle: handle,
    Platform_Output_Type: String(meta.output_type || post?.output_type || "").trim() || null,
    Published_At: publishedAt,
    Chicago_Weekday: weekdayHour?.day || null,
    Chicago_Hour: Number.isFinite(weekdayHour?.hour) ? weekdayHour.hour : null,
    Chicago_Season: studioChicagoSeason(publishedAt),
    Views: firstParty ? studioInsightsNumberOrNull(post?.views) : (Number(post?.views || 0) || 0),
    Likes: firstParty ? studioInsightsNumberOrNull(post?.likes) : (Number(post?.likes || 0) || 0),
    Comments: firstParty ? studioInsightsNumberOrNull(post?.comments) : (Number(post?.comments || 0) || 0),
    Engagement_Score: studioInsightsEngagementScore(post),
    Caption: caption.text || null,
    Caption_Length: caption.length,
    Hashtag_Count: caption.hashtags,
    Emoji_Count: caption.emoji,
    Caption_Has_CTA: caption.has_cta,
    Caption_Has_Question: caption.has_question,
    External_Post_ID: externalPostId || null,
    Fetched_At: meta.fetched_at || new Date().toISOString(),
    Active: true,
    ...(firstParty ? {
      Platform_Output_Record_ID: meta.platform_output_record_id || null,
      Content_Profile_Record_ID: meta.content_profile_record_id || null,
      Measurement_Bucket: meta.measurement_bucket || post?.measurement_bucket || null,
      Age_Hours: studioInsightsNumberOrNull(meta.age_hours ?? post?.age_hours),
      Shares: studioInsightsNumberOrNull(post?.shares),
      Reach: studioInsightsNumberOrNull(post?.reach),
      Saves: studioInsightsNumberOrNull(post?.saves),
      Total_Interactions: studioInsightsNumberOrNull(post?.total_interactions),
      Engaged_Views: studioInsightsNumberOrNull(post?.engaged_views),
      Watch_Time_Sec: studioInsightsNumberOrNull(post?.watch_time_sec),
      Average_View_Duration_Sec: studioInsightsNumberOrNull(post?.average_view_duration_sec),
      Average_Percentage_Viewed: studioInsightsNumberOrNull(post?.average_percentage_viewed),
      Audience_Gained: studioInsightsNumberOrNull(post?.audience_gained),
      Audience_Lost: studioInsightsNumberOrNull(post?.audience_lost),
      Duration_Sec: studioInsightsNumberOrNull(post?.duration_sec),
      Platform_Metrics_JSON: JSON.stringify(post?.platform_metrics || {}),
    } : {}),
  };
}
/*__STUDIO_WORKER_END:studioInsightsObservationFields__*/

export function studioInsightsObservationToPost(record) {
  const source = String(f(record, "Source") || "similar_account").trim().toLowerCase();
  const firstParty = source === "first_party";
  return {
    platform: String(f(record, "Platform") || "").trim().toLowerCase(),
    handle: String(f(record, "Account_Handle") || "").trim(),
    profile: studioNormalizeSimilarProfile(f(record, "Profile")),
    output_type: String(f(record, "Platform_Output_Type") || "").trim(),
    published_at: f(record, "Published_At"),
    views: firstParty ? studioInsightsNumberOrNull(f(record, "Views")) : (Number(f(record, "Views") || 0) || 0),
    likes: firstParty ? studioInsightsNumberOrNull(f(record, "Likes")) : (Number(f(record, "Likes") || 0) || 0),
    comments: firstParty ? studioInsightsNumberOrNull(f(record, "Comments")) : (Number(f(record, "Comments") || 0) || 0),
    shares: studioInsightsNumberOrNull(f(record, "Shares")),
    reach: studioInsightsNumberOrNull(f(record, "Reach")),
    saves: studioInsightsNumberOrNull(f(record, "Saves")),
    total_interactions: studioInsightsNumberOrNull(f(record, "Total_Interactions")),
    engaged_views: studioInsightsNumberOrNull(f(record, "Engaged_Views")),
    watch_time_sec: studioInsightsNumberOrNull(f(record, "Watch_Time_Sec")),
    average_view_duration_sec: studioInsightsNumberOrNull(f(record, "Average_View_Duration_Sec")),
    average_percentage_viewed: studioInsightsNumberOrNull(f(record, "Average_Percentage_Viewed")),
    audience_gained: studioInsightsNumberOrNull(f(record, "Audience_Gained")),
    audience_lost: studioInsightsNumberOrNull(f(record, "Audience_Lost")),
    duration_sec: studioInsightsNumberOrNull(f(record, "Duration_Sec")),
    age_hours: studioInsightsNumberOrNull(f(record, "Age_Hours")),
    measurement_bucket: String(f(record, "Measurement_Bucket") || "").trim() || null,
    platform_output_record_id: String(f(record, "Platform_Output_Record_ID") || "").trim() || null,
    content_profile_record_id: String(f(record, "Content_Profile_Record_ID") || "").trim() || null,
    external_post_id: String(f(record, "External_Post_ID") || "").trim() || null,
    fetched_at: f(record, "Fetched_At") || null,
    platform_metrics_json: String(f(record, "Platform_Metrics_JSON") || "").trim() || null,
    caption: String(f(record, "Caption") || "").trim(),
    source,
    season: studioNormalizeInsightsSeason(f(record, "Chicago_Season")),
    caption_length: Number(f(record, "Caption_Length") || 0) || 0,
    hashtag_count: Number(f(record, "Hashtag_Count") || 0) || 0,
    emoji_count: Number(f(record, "Emoji_Count") || 0) || 0,
    caption_has_cta: Boolean(f(record, "Caption_Has_CTA")),
    caption_has_question: Boolean(f(record, "Caption_Has_Question")),
    engagement_score: Number(f(record, "Engagement_Score") || 0) || 0,
  };
}
/*__STUDIO_WORKER_END:studioInsightsObservationToPost__*/

export function studioInsightsPlatformMatches(wanted, actual) {
  const target = String(wanted || "").trim().toLowerCase();
  const value = String(actual || "").trim().toLowerCase();
  if (!target) return true;
  if (value === target) return true;
  if (target.includes(value) || value.includes(target)) return true;
  if (target.includes("instagram") && value.includes("instagram")) return true;
  if (target.includes("youtube") && value.includes("youtube")) return true;
  if (target.includes("facebook") && value.includes("facebook")) return true;
  if (target.includes("tiktok") && value.includes("tiktok")) return true;
  return false;
}
/*__STUDIO_WORKER_END:studioInsightsPlatformMatches__*/

export function studioInsightsOutputTypeMatches(wanted, actual) {
  const target = String(wanted || "").trim().toLowerCase();
  const value = String(actual || "").trim().toLowerCase();
  if (!target) return true;
  if (!value) return true;
  if (value === target) return true;
  if (value.includes(target) || target.includes(value)) return true;
  return false;
}
/*__STUDIO_WORKER_END:studioInsightsOutputTypeMatches__*/

export function studioInsightsSeasonFilterFormula(season) {
  const normalized = studioNormalizeInsightsSeason(season, "all");
  if (normalized === "all") return null;
  return `{Chicago_Season}='${normalized}'`;
}
/*__STUDIO_WORKER_END:studioInsightsSeasonFilterFormula__*/

export async function studioInsightsFindObservation(env, observationKey) {
  const rows = await listRecords(env, studioInsightsObservationsTable(env), {
    limit: 1,
    filterFormula: `{Observation_Key}='${String(observationKey || "").replace(/'/g, "\\'")}'`,
  }).catch(() => []);
  return rows[0] || null;
}
/*__STUDIO_WORKER_END:studioInsightsFindObservation__*/

export async function studioInsightsUpsertObservation(env, fields) {
  const key = String(fields?.Observation_Key || "").trim();
  if (!key) return null;
  const existing = await studioInsightsFindObservation(env, key);
  if (existing?.id) {
    return airtableFetch(env, studioInsightsObservationsTable(env), existing.id, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
  }
  const created = await airtableFetch(env, studioInsightsObservationsTable(env), "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return created?.records?.[0] || null;
}
/*__STUDIO_WORKER_END:studioInsightsUpsertObservation__*/

export async function studioInsightsUpsertObservations(env, posts, meta = {}) {
  if (!studioInsightsDbEnabled(env) || !Array.isArray(posts) || !posts.length) return { upserted: 0 };
  const prepared = posts
    .map((post) => studioInsightsObservationFields(post, meta))
    .filter((fields) => String(fields?.Observation_Key || "").trim());
  if (!prepared.length) return { upserted: 0 };
  const keyClauses = prepared.map((fields) => `{Observation_Key}='${String(fields.Observation_Key).replace(/'/g, "\\'")}'`);
  const existingRows = await listRecords(env, studioInsightsObservationsTable(env), {
    limit: prepared.length,
    filterFormula: prepared.length === 1 ? keyClauses[0] : `OR(${keyClauses.join(",")})`,
  }).catch(() => []);
  const byKey = new Map((existingRows || []).map((row) => [String(f(row, "Observation_Key") || ""), row]));
  const toCreate = [];
  const toPatch = [];
  for (const fields of prepared) {
    const found = byKey.get(fields.Observation_Key);
    if (found?.id) toPatch.push({ id: found.id, fields });
    else toCreate.push({ fields });
  }
  let upserted = 0;
  const tableId = studioInsightsObservationsTable(env);
  for (let i = 0; i < toCreate.length; i += 10) {
    const chunk = toCreate.slice(i, i + 10);
    try {
      await airtableFetch(env, tableId, "", {
        method: "POST",
        body: JSON.stringify({ records: chunk, typecast: true }),
      });
      upserted += chunk.length;
    } catch (error) {
      console.warn("insights observation create batch failed", error);
    }
  }
  for (let i = 0; i < toPatch.length; i += 10) {
    const chunk = toPatch.slice(i, i + 10);
    try {
      await airtableFetch(env, tableId, "", {
        method: "PATCH",
        body: JSON.stringify({ records: chunk, typecast: true }),
      });
      upserted += chunk.length;
    } catch (error) {
      console.warn("insights observation patch batch failed", error);
    }
  }
  return { upserted };
}
/*__STUDIO_WORKER_END:studioInsightsUpsertObservations__*/

export async function studioInsightsLoadObservations(env, options = {}) {
  if (!studioInsightsDbEnabled(env)) return [];
  const profile = studioNormalizeSimilarProfile(options.profile || "chicago");
  const parts = [`{Active}=1`, `{Profile}='${profile}'`];
  const seasonFormula = studioInsightsSeasonFilterFormula(options.season);
  if (seasonFormula) parts.push(seasonFormula);
  if (options.source) parts.push(`{Source}='${String(options.source).replace(/'/g, "\\'")}'`);
  const rows = await listRecords(env, studioInsightsObservationsTable(env), {
    limit: Math.max(20, Math.min(500, Number(options.limit) || 250)),
    sortField: "Published_At",
    sortDirection: "desc",
    filterFormula: `AND(${parts.join(",")})`,
  }).catch(() => []);
  const filtered = (rows || [])
    .map(studioInsightsObservationToPost)
    .filter((row) => row.published_at)
    .filter((row) => studioInsightsPlatformMatches(options.platform, row.platform))
    .filter((row) => studioInsightsOutputTypeMatches(options.output_type, row.output_type));
  if (String(options.source || "").toLowerCase() === "first_party" && !options.include_history) {
    return studioInsightsLatestFirstPartyPosts(filtered);
  }
  return filtered;
}
/*__STUDIO_WORKER_END:studioInsightsLoadObservations__*/

export function parseSimilarAccountStatusCache(raw) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    const accounts = parsed?.accounts && typeof parsed.accounts === "object" ? parsed.accounts : {};
    return { as_of: parsed?.as_of || null, accounts };
  } catch {
    return { as_of: null, accounts: {} };
  }
}
/*__STUDIO_WORKER_END:parseSimilarAccountStatusCache__*/

export async function studioLoadSimilarAccountStatusCache(env) {
  const cacheRow = await studioSettingsByName(env, STUDIO_SIMILAR_ACCOUNT_STATUS_SETTING).catch(() => null);
  if (cacheRow) return parseSimilarAccountStatusCache(f(cacheRow, "Setting_Value"));
  const legacyRow = await studioSettingsByName(env, STUDIO_SIMILAR_TIMES_SETTING).catch(() => null);
  return parseSimilarTimesCache(f(legacyRow, "Setting_Value"));
}
/*__STUDIO_WORKER_END:studioLoadSimilarAccountStatusCache__*/

export function studioSlimSimilarStatusCache(cache) {
  const accounts = {};
  for (const [key, entry] of Object.entries(cache?.accounts || {})) {
    const posts = Array.isArray(entry?.posts) ? entry.posts.length : Number(entry?.posts || 0) || 0;
    accounts[key] = {
      platform: entry?.platform || null,
      handle: entry?.handle || null,
      profile: entry?.profile || "chicago",
      status: entry?.status || "pending",
      error: entry?.error ? String(entry.error).slice(0, 160) : null,
      fetched_at: entry?.fetched_at || null,
      posts,
    };
  }
  return { as_of: cache?.as_of || null, accounts };
}
/*__STUDIO_WORKER_END:studioSlimSimilarStatusCache__*/

export async function studioSaveSimilarAccountStatusCache(env, cache) {
  await studioUpsertSetting(
    env,
    STUDIO_SIMILAR_ACCOUNT_STATUS_SETTING,
    JSON.stringify(studioSlimSimilarStatusCache(cache)),
    "Similar-account fetch status metadata. Post observations persist in Studio Insights Observations."
  );
}
/*__STUDIO_WORKER_END:studioSaveSimilarAccountStatusCache__*/

export async function studioInsightsMigrateCacheToDb(env) {
  const legacyRow = await studioSettingsByName(env, STUDIO_SIMILAR_TIMES_SETTING).catch(() => null);
  const cache = parseSimilarTimesCache(f(legacyRow, "Setting_Value"));
  let migrated = 0;
  for (const [key, entry] of Object.entries(cache.accounts || {})) {
    const posts = Array.isArray(entry?.posts) ? entry.posts : [];
    if (!posts.length) continue;
    const result = await studioInsightsUpsertObservations(env, posts.map((post) => ({
      ...post,
      platform: entry.platform,
      handle: entry.handle,
      profile: entry.profile,
      source: "similar_account",
    })), {
      platform: entry.platform,
      handle: entry.handle,
      profile: entry.profile,
      source: "similar_account",
      fetched_at: entry.fetched_at || cache.as_of || new Date().toISOString(),
    });
    migrated += result.upserted || 0;
    cache.accounts[key] = {
      platform: entry.platform,
      handle: entry.handle,
      profile: entry.profile || "chicago",
      status: entry.status,
      error: entry.error || null,
      fetched_at: entry.fetched_at || null,
      posts: posts.length,
    };
  }
  if (migrated) {
    cache.as_of = cache.as_of || new Date().toISOString();
    await studioSaveSimilarAccountStatusCache(env, cache);
  }
  return { migrated };
}
/*__STUDIO_WORKER_END:studioInsightsMigrateCacheToDb__*/

export function studioInsightsBuildCaptionLearned(posts) {
  const scored = (posts || []).filter((post) => String(post.caption || "").trim());
  if (!scored.length) return null;
  const weighted = scored.map((post) => ({
    post,
    weight: studioInsightsEngagementScore(post),
  }));
  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0) || weighted.length;
  const avg = (selector, fallback = 0) => weighted.reduce((sum, row) => sum + selector(row.post) * row.weight, 0) / totalWeight || fallback;
  const ctaRate = weighted.filter((row) => row.post.caption_has_cta).reduce((sum, row) => sum + row.weight, 0) / totalWeight;
  const questionRate = weighted.filter((row) => row.post.caption_has_question).reduce((sum, row) => sum + row.weight, 0) / totalWeight;
  const patterns = {
    avg_caption_length: Math.round(avg((post) => post.caption_length)),
    avg_hashtags: Math.round(avg((post) => post.hashtag_count) * 10) / 10,
    avg_emojis: Math.round(avg((post) => post.emoji_count) * 10) / 10,
    cta_rate: Math.round(ctaRate * 100),
    question_rate: Math.round(questionRate * 100),
    top_captions: weighted
      .sort((a, b) => b.weight - a.weight || b.post.likes - a.post.likes)
      .slice(0, 3)
      .map((row) => ({
        caption: String(row.post.caption || "").slice(0, 220),
        likes: row.post.likes,
        views: row.post.views,
      })),
  };
  const bits = [];
  if (patterns.avg_caption_length) bits.push(`~${patterns.avg_caption_length} chars`);
  if (patterns.avg_hashtags) bits.push(`${patterns.avg_hashtags} hashtags`);
  if (patterns.avg_emojis) bits.push(`${patterns.avg_emojis} emojis`);
  if (patterns.cta_rate >= 35) bits.push("CTA language");
  if (patterns.question_rate >= 25) bits.push("questions");
  return {
    patterns,
    label: bits.length ? `Captions: ${bits.join(" · ")}` : "Captions: keep concise with local detail",
    sample_size: scored.length,
    score: Math.round(totalWeight * 10) / 10,
  };
}
/*__STUDIO_WORKER_END:studioInsightsBuildCaptionLearned__*/

export function studioInsightsLearnedFromHeatmap(heatmap, source, season, platform, outputType) {
  if (!heatmap?.suggested || heatmap.sample_size < STUDIO_SIMILAR_TIMES_MIN_SAMPLE) return null;
  const seasonLabel = studioSeasonLabel(season);
  return {
    days: heatmap.suggested.days,
    windows: heatmap.suggested.windows,
    label: `${seasonLabel} · ${heatmap.suggested.label}`,
    sample_size: heatmap.sample_size,
    score: heatmap.buckets?.[0]?.score || heatmap.sample_size,
    source,
    platform,
    output_type: outputType || "all",
    season,
    metric_type: "post_time",
  };
}
/*__STUDIO_WORKER_END:studioInsightsLearnedFromHeatmap__*/

export async function studioInsightsFindLearned(env, learnedKey) {
  const rows = await listRecords(env, studioInsightsLearnedTable(env), {
    limit: 1,
    filterFormula: `{Learned_Key}='${String(learnedKey || "").replace(/'/g, "\\'")}'`,
  }).catch(() => []);
  return rows[0] || null;
}
/*__STUDIO_WORKER_END:studioInsightsFindLearned__*/

export async function studioInsightsUpsertLearned(env, payload) {
  const key = studioInsightsLearnedKey(payload.profile, payload.platform, payload.output_type, payload.season, payload.metric_type);
  const fields = {
    Learned_Key: key,
    Profile: studioNormalizeSimilarProfile(payload.profile),
    Platform: String(payload.platform || "all").trim() || "all",
    Output_Type: String(payload.output_type || "all").trim() || "all",
    Season: studioNormalizeInsightsSeason(payload.season, "all"),
    Metric_Type: payload.metric_type === "caption" ? "caption" : "post_time",
    Days: Array.isArray(payload.days) ? payload.days.join(",") : null,
    Windows: Array.isArray(payload.windows) ? payload.windows.join(",") : null,
    Label: payload.label || null,
    Caption_Patterns_JSON: payload.caption_patterns ? JSON.stringify(payload.caption_patterns) : null,
    Sample_Size: Number(payload.sample_size || 0) || 0,
    Score: Number(payload.score || 0) || 0,
    Source: payload.source || "blended",
    As_Of: new Date().toISOString(),
  };
  const existing = await studioInsightsFindLearned(env, key);
  if (existing?.id) {
    return airtableFetch(env, studioInsightsLearnedTable(env), existing.id, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
  }
  const created = await airtableFetch(env, studioInsightsLearnedTable(env), "", {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return created?.records?.[0] || null;
}
/*__STUDIO_WORKER_END:studioInsightsUpsertLearned__*/

export async function studioInsightsLoadLearned(env, options = {}) {
  if (!studioInsightsDbEnabled(env)) return null;
  const key = studioInsightsLearnedKey(
    options.profile,
    options.platform,
    options.output_type,
    options.season,
    options.metric_type || "post_time"
  );
  const row = await studioInsightsFindLearned(env, key);
  if (!row) return null;
  let captionPatterns = null;
  try {
    captionPatterns = JSON.parse(String(f(row, "Caption_Patterns_JSON") || ""));
  } catch {
    captionPatterns = null;
  }
  const days = String(f(row, "Days") || "").split(",").map((part) => part.trim()).filter(Boolean);
  const windows = String(f(row, "Windows") || "").split(",").map((part) => part.trim()).filter(Boolean);
  return {
    profile: studioNormalizeSimilarProfile(f(row, "Profile")),
    platform: String(f(row, "Platform") || "").trim(),
    output_type: String(f(row, "Output_Type") || "").trim(),
    season: studioNormalizeInsightsSeason(f(row, "Season"), "all"),
    metric_type: String(f(row, "Metric_Type") || "post_time").trim(),
    days,
    windows,
    label: String(f(row, "Label") || "").trim(),
    caption_patterns: captionPatterns,
    sample_size: Number(f(row, "Sample_Size") || 0) || 0,
    score: Number(f(row, "Score") || 0) || 0,
    source: String(f(row, "Source") || "").trim(),
    as_of: f(row, "As_Of") || null,
  };
}
/*__STUDIO_WORKER_END:studioInsightsLoadLearned__*/

export function studioInsightsLatestFirstPartyPosts(posts) {
  const latest = new Map();
  for (const post of posts || []) {
    const key = post.platform_output_record_id || post.external_post_id || [post.platform, post.published_at, post.caption].join("|");
    const existing = latest.get(key);
    const currentTime = Date.parse(post.fetched_at || "") || 0;
    const existingTime = Date.parse(existing?.fetched_at || "") || 0;
    if (!existing || currentTime >= existingTime) latest.set(key, post);
  }
  return [...latest.values()];
}
/*__STUDIO_WORKER_END:studioInsightsLatestFirstPartyPosts__*/

export async function studioRecomputeInsightsLearned(env, options = {}) {
  if (!studioInsightsDbEnabled(env)) return { updated: 0 };
  const profile = studioNormalizeSimilarProfile(options.profile || "chicago");
  const platform = String(options.platform || "").trim();
  const outputType = String(options.output_type || "").trim();
  const seasons = options.season ? [studioNormalizeInsightsSeason(options.season)] : STUDIO_INSIGHTS_SEASONS;
  let updated = 0;
  for (const season of seasons) {
    const firstParty = await studioInsightsLoadObservations(env, {
      profile,
      platform,
      output_type: outputType,
      season,
      source: "first_party",
      limit: 250,
    });
    const similar = await studioInsightsLoadObservations(env, {
      profile,
      platform,
      season,
      source: "similar_account",
      limit: 250,
    });
    const latestFirstParty = studioInsightsLatestFirstPartyPosts(firstParty);
    const firstHeatmap = studioBuildSimilarHeatmap(latestFirstParty);
    const similarHeatmap = studioBuildSimilarHeatmap(similar);
    const firstLearned = studioInsightsLearnedFromHeatmap(firstHeatmap, "first_party", season, platform, outputType);
    const similarLearned = studioInsightsLearnedFromHeatmap(similarHeatmap, "similar_accounts", season, platform, outputType);
    if (firstLearned) {
      await studioInsightsUpsertLearned(env, { ...firstLearned, profile, metric_type: "post_time" });
      updated += 1;
    }
    if (similarLearned) {
      await studioInsightsUpsertLearned(env, { ...similarLearned, profile, metric_type: "post_time" });
      updated += 1;
    }
    const captionLearned = studioInsightsBuildCaptionLearned([...latestFirstParty, ...similar]);
    if (captionLearned) {
      await studioInsightsUpsertLearned(env, {
        profile,
        platform: platform || "all",
        output_type: outputType || "all",
        season,
        metric_type: "caption",
        label: captionLearned.label,
        caption_patterns: captionLearned.patterns,
        sample_size: captionLearned.sample_size,
        score: captionLearned.score,
        source: latestFirstParty.length && similar.length ? "blended" : latestFirstParty.length ? "first_party" : "similar_accounts",
      });
      updated += 1;
    }
  }
  return { updated, profile };
}
/*__STUDIO_WORKER_END:studioRecomputeInsightsLearned__*/

export async function studioIngestFirstPartyObservations() {
  return { upserted: 0, managed_by: "studioSweepPublishedInsights" };
}
/*__STUDIO_WORKER_END:studioIngestFirstPartyObservations__*/

export function studioInsightsResolveSeason(url) {
  return studioNormalizeInsightsSeason(url?.searchParams?.get("season") || url?.searchParams?.get("seasonal"));
}
/*__STUDIO_WORKER_END:studioInsightsResolveSeason__*/

export async function studioInsightsPostsForView(env, { accounts, theme, platform, season, cache, migrate = false }) {
  let posts = [];
  if (studioInsightsDbEnabled(env)) {
    try {
      // Migration is one-shot/admin work. Never run it on schedule suggestion reads —
      // re-upserting legacy cache posts from every Pipeline row 500s the Worker.
      if (migrate) await studioInsightsMigrateCacheToDb(env);
      posts = await studioInsightsLoadObservations(env, {
        profile: theme,
        platform,
        season,
        source: "similar_account",
        limit: 300,
      });
    } catch (error) {
      console.warn("insights observation read failed", error);
    }
  }
  if (!posts.length) {
    const timed = studioTimedWatchlistAccounts(accounts, theme, platform);
    for (const row of timed) {
      const entry = cache?.accounts?.[studioSimilarAccountKey(row.platform, row.handle)] || {};
      const rowPosts = Array.isArray(entry.posts) ? entry.posts : [];
      for (const post of rowPosts) posts.push({ ...post, platform: row.platform, handle: row.handle, profile: row.profile || theme });
    }
  }
  return posts;
}
/*__STUDIO_WORKER_END:studioInsightsPostsForView__*/

export function studioNormalizeSimilarProfile(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "chicago";
  if (raw === "la" || raw === "los angeles" || raw === "losangeles" || raw === "los-angeles") return "la";
  if (raw === "nyc" || raw === "new york" || raw === "newyork" || raw === "new-york") return "nyc";
  if (raw === "miami" || raw === "miami shining" || raw === "miamishining") return "miami";
  if (raw === "chicago" || raw === "chicago shining" || raw === "chicagoshining") return "chicago";
  return profileSetupSlug(raw) || studioNormalizeProfileKey(raw) || "chicago";
}
/*__STUDIO_WORKER_END:studioNormalizeSimilarProfile__*/

export function studioSimilarProfileLabel(theme) {
  return studioCityLabel(studioNormalizeSimilarProfile(theme), {});
}
/*__STUDIO_WORKER_END:studioSimilarProfileLabel__*/

export function parseSimilarWatchlist(raw) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        platform: String(row?.platform || "").trim().toLowerCase(),
        handle: String(row?.handle || row?.username || row?.url || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?facebook\.com\//i, "").replace(/\/$/, ""),
        source: String(row?.source || "").trim() || null,
        profile: studioNormalizeSimilarProfile(row?.profile || row?.theme || "chicago"),
      }))
      .filter((row) => row.handle && STUDIO_WATCHLIST_PLATFORMS.has(row.platform));
  } catch {
    return [];
  }
}
/*__STUDIO_WORKER_END:parseSimilarWatchlist__*/

export function studioSimilarAccountKey(platform, handle) {
  return `${String(platform || "").toLowerCase()}:${String(handle || "").toLowerCase()}`;
}
/*__STUDIO_WORKER_END:studioSimilarAccountKey__*/

export function parseSimilarTimesCache(raw) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    const accounts = parsed?.accounts && typeof parsed.accounts === "object" ? parsed.accounts : {};
    return { as_of: parsed?.as_of || null, accounts };
  } catch {
    return { as_of: null, accounts: {} };
  }
}
/*__STUDIO_WORKER_END:parseSimilarTimesCache__*/

export function studioChicagoWeekdayHour(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  if (!STUDIO_HEATMAP_DAYS.includes(weekday) || !Number.isFinite(hour)) return null;
  return { day: weekday, hour };
}
/*__STUDIO_WORKER_END:studioChicagoWeekdayHour__*/

export function studioHeatmapWindow(hour) {
  const n = Number(hour);
  if (!Number.isFinite(n)) return "00:00-06:00";
  if (n < 6) return "00:00-06:00";
  const start = n - (n % 2);
  const end = (start + 2) % 24;
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(start)}:00-${pad(end)}:00`;
}
/*__STUDIO_WORKER_END:studioHeatmapWindow__*/

export function studioBuildSimilarHeatmap(posts) {
  const map = new Map();
  for (const post of posts || []) {
    const parts = studioChicagoWeekdayHour(post.published_at);
    if (!parts) continue;
    const window = studioHeatmapWindow(parts.hour);
    const key = `${parts.day}|${window}`;
    const engagement = Number(post.likes || 0) + Number(post.views || 0);
    const weight = 1 + Math.log1p(Math.max(0, engagement)) / 10;
    const current = map.get(key) || { day: parts.day, window, posts: 0, score: 0, platforms: new Set() };
    current.posts += 1;
    current.score += weight;
    if (post.platform) current.platforms.add(post.platform);
    map.set(key, current);
  }
  const buckets = [...map.values()]
    .map((row) => ({
      day: row.day,
      window: row.window,
      posts: row.posts,
      score: Math.round(row.score * 10) / 10,
      platforms: [...row.platforms],
    }))
    .sort((a, b) => b.score - a.score || b.posts - a.posts || STUDIO_HEATMAP_DAYS.indexOf(a.day) - STUDIO_HEATMAP_DAYS.indexOf(b.day));
  const top = buckets.slice(0, 3);
  const suggested = top.length
    ? {
        days: [...new Set(top.map((row) => row.day))],
        windows: [...new Set(top.map((row) => row.window))],
        label: `Similar accounts · ${top[0].day} ${top[0].window}`,
      }
    : null;
  return { buckets, suggested, sample_size: (posts || []).length };
}
/*__STUDIO_WORKER_END:studioBuildSimilarHeatmap__*/

export function studioOwnScheduleHeatmap(byPlatform) {
  const map = new Map();
  let total = 0;
  for (const [platform, times] of Object.entries(byPlatform || {})) {
    for (const ms of times || []) {
      const parts = studioChicagoWeekdayHour(new Date(ms).toISOString());
      if (!parts) continue;
      const window = studioHeatmapWindow(parts.hour);
      const key = `${parts.day}|${window}`;
      const current = map.get(key) || { day: parts.day, window, count: 0, platforms: [] };
      current.count += 1;
      if (!current.platforms.includes(platform)) current.platforms.push(platform);
      map.set(key, current);
      total += 1;
    }
  }
  return { total, buckets: [...map.values()] };
}
/*__STUDIO_WORKER_END:studioOwnScheduleHeatmap__*/

export function studioMergeSeedWatchlist(accounts) {
  const have = new Set((accounts || []).map((row) => studioSimilarAccountKey(row.platform, row.handle)));
  const extra = STUDIO_SIMILAR_SEEDS.filter((row) => !have.has(studioSimilarAccountKey(row.platform, row.handle)));
  return extra.length ? [...accounts, ...extra.map((item) => ({ ...item }))] : accounts;
}
/*__STUDIO_WORKER_END:studioMergeSeedWatchlist__*/

export async function studioReadSimilarWatchlist(env) {
  const row = await studioSettingsByName(env, STUDIO_SIMILAR_WATCHLIST_SETTING).catch(() => null);
  const existing = parseSimilarWatchlist(f(row, "Setting_Value"));
  if (existing.length) return studioMergeSeedWatchlist(existing);
  return STUDIO_SIMILAR_SEEDS.map((item) => ({ ...item }));
}
/*__STUDIO_WORKER_END:studioReadSimilarWatchlist__*/

export async function studioEnsureSimilarWatchlist(env) {
  const row = await studioSettingsByName(env, STUDIO_SIMILAR_WATCHLIST_SETTING);
  const existing = parseSimilarWatchlist(f(row, "Setting_Value"));
  const accounts = existing.length
    ? studioMergeSeedWatchlist(existing)
    : STUDIO_SIMILAR_SEEDS.map((item) => ({ ...item }));
  if (!existing.length || accounts.length !== existing.length) {
    await studioUpsertSetting(
      env,
      STUDIO_SIMILAR_WATCHLIST_SETTING,
      JSON.stringify(accounts),
      "Similar-account watchlist. YouTube is swept for public post times. Instagram timing is paused pending Meta business_discovery permission; TikTok and Facebook stay on the list for operator review."
    );
  }
  return accounts;
}
/*__STUDIO_WORKER_END:studioEnsureSimilarWatchlist__*/

export async function studioResolveSimilarTimesTheme(env, url, authorization) {
  const raw = String(url?.searchParams?.get("profile") || url?.searchParams?.get("theme") || "").trim();
  if (!raw) return "chicago";
  const normalized = studioNormalizeSimilarProfile(raw);
  if (!authorization) return normalized;
  const profiles = await resolveAuthorizedContentProfiles(env, authorization).catch(() => []);
  const found = profiles.find((record) =>
    record.id === raw
      || studioThemeForProfile(record) === normalized
      || String(f(record, "Profile_Name") || "").trim().toLowerCase() === raw.toLowerCase()
      || String(f(record, "Market_Name") || "").trim().toLowerCase() === raw.toLowerCase()
  );
  return found ? studioThemeForProfile(found) : normalized;
}
/*__STUDIO_WORKER_END:studioResolveSimilarTimesTheme__*/

export function studioTimedWatchlistAccounts(accounts, theme, platform) {
  const wantedPlatform = String(platform || "").trim().toLowerCase();
  return (accounts || []).filter((row) => {
    if (!STUDIO_SIMILAR_TIMED_PLATFORMS.has(row.platform)) return false;
    if (theme && (row.profile || "chicago") !== theme) return false;
    if (wantedPlatform && row.platform !== wantedPlatform && !wantedPlatform.includes(row.platform)) return false;
    return true;
  });
}
/*__STUDIO_WORKER_END:studioTimedWatchlistAccounts__*/

export function studioManualSweepWatchlistAccounts(accounts, theme, platform) {
  const wantedPlatform = String(platform || "").trim().toLowerCase();
  return (accounts || []).filter((row) => {
    if (row.platform !== "youtube" && row.platform !== "instagram") return false;
    if (theme && (row.profile || "chicago") !== theme) return false;
    if (wantedPlatform && row.platform !== wantedPlatform && !wantedPlatform.includes(row.platform)) return false;
    return true;
  });
}
/*__STUDIO_WORKER_END:studioManualSweepWatchlistAccounts__*/

export function studioSimilarAccountStale(entry, now = Date.now()) {
  if (!entry?.fetched_at) return true;
  const ts = Date.parse(entry.fetched_at);
  return !Number.isFinite(ts) || now - ts > STUDIO_SIMILAR_TIMES_TTL_MS;
}
/*__STUDIO_WORKER_END:studioSimilarAccountStale__*/

export function studioNormalizeSimilarStatus(entry) {
  const status = String(entry?.status || "").trim();
  const error = String(entry?.error || "");
  if (status === "needs_permission" || status === "needs_key" || status === "unavailable" || status === "ok" || status === "pending") return status;
  if (/permission|#10/i.test(error)) return "needs_permission";
  if (/YouTube API key is missing|YOUTUBE_API_KEY/i.test(error)) return "needs_key";
  return status || (entry?.fetched_at ? "ok" : "pending");
}
/*__STUDIO_WORKER_END:studioNormalizeSimilarStatus__*/

export function studioInsightsBuildOverview({ posts, accounts, timed, reference, cache, heatmap, season }) {
  const rows = Array.isArray(posts) ? posts : [];
  const likes = rows.reduce((sum, post) => sum + (Number(post.likes) || 0), 0);
  const views = rows.reduce((sum, post) => sum + (Number(post.views) || 0), 0);
  const comments = rows.reduce((sum, post) => sum + (Number(post.comments) || 0), 0);
  const withCaption = rows.filter((post) => String(post.caption || "").trim()).length;
  const byPlatform = {};
  for (const post of rows) {
    const key = String(post.platform || "unknown").toLowerCase() || "unknown";
    byPlatform[key] = (byPlatform[key] || 0) + 1;
  }
  const accountStatuses = (timed || []).map((row) => {
    const entry = cache?.accounts?.[studioSimilarAccountKey(row.platform, row.handle)] || {};
    return studioNormalizeSimilarStatus(entry);
  });
  const timedOk = accountStatuses.filter((status) => status === "ok").length;
  const top = Array.isArray(heatmap?.buckets) ? heatmap.buckets[0] : null;
  const earliest = rows
    .map((post) => Date.parse(post.published_at))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b)[0];
  const latest = rows
    .map((post) => Date.parse(post.published_at))
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => b - a)[0];
  return {
    posts: rows.length,
    accounts_timed: (timed || []).length,
    accounts_timed_ok: timedOk,
    accounts_reference: (reference || []).length,
    likes,
    views,
    comments,
    avg_likes: rows.length ? Math.round(likes / rows.length) : 0,
    avg_views: rows.length ? Math.round(views / rows.length) : 0,
    captions: withCaption,
    by_platform: byPlatform,
    top_window: top ? { day: top.day, window: top.window, posts: top.posts, score: top.score } : null,
    season,
    earliest_published_at: Number.isFinite(earliest) ? new Date(earliest).toISOString() : null,
    latest_published_at: Number.isFinite(latest) ? new Date(latest).toISOString() : null,
    as_of: cache?.as_of || null,
  };
}
/*__STUDIO_WORKER_END:studioInsightsBuildOverview__*/

export function studioBuildSimilarTimesView({ accounts, cache, theme, platform, season, posts: providedPosts, own_schedule: providedOwn, occupiedMs = [] }) {
  const timed = studioTimedWatchlistAccounts(accounts, theme, platform);
  const reference = (accounts || []).filter((row) => !STUDIO_SIMILAR_TIMED_PLATFORMS.has(row.platform) && (!theme || (row.profile || "chicago") === theme));
  const posts = Array.isArray(providedPosts) ? providedPosts : [];
  const accountViews = timed.map((row) => {
    const entry = cache?.accounts?.[studioSimilarAccountKey(row.platform, row.handle)] || {};
    const rowPosts = posts.filter((post) => post.platform === row.platform && String(post.handle || "").toLowerCase() === String(row.handle || "").toLowerCase());
    const cachedCount = Number(entry.posts);
    const postCount = rowPosts.length || (Number.isFinite(cachedCount) ? cachedCount : (Array.isArray(entry.posts) ? entry.posts.length : 0));
    return {
      platform: row.platform,
      handle: row.handle,
      source: row.source,
      profile: row.profile || theme,
      status: studioNormalizeSimilarStatus(entry),
      posts: postCount,
      fetched_at: entry.fetched_at || null,
      error: entry.error || null,
    };
  });
  const heatmap = studioBuildSimilarHeatmap(posts);
  const captionLearned = studioInsightsBuildCaptionLearned(posts);
  const overview = studioInsightsBuildOverview({ posts, accounts, timed, reference, cache, heatmap, season });
  const stale = timed.filter((row) => studioSimilarAccountStale(cache?.accounts?.[studioSimilarAccountKey(row.platform, row.handle)]));
  const label = studioSimilarProfileLabel(theme);
  const seasonLabel = studioSeasonLabel(season);
  let message;
  if (!timed.length) {
    message = `No Instagram or YouTube handles for ${label} yet. Add some on Operations. TikTok and Facebook handles stay listed for review; we cannot read their post times.`;
  } else if (!heatmap.sample_size) {
    const needPerm = accountViews.some((row) => row.status === "needs_permission");
    const needKey = accountViews.some((row) => row.status === "needs_key");
    if (needPerm && needKey) {
      message = `${label} watchlist is saved. Instagram needs Meta business_discovery permission. YouTube needs YOUTUBE_API_KEY. TikTok and Facebook handles stay on the list for review; those apps do not give us other accounts' post times.`;
    } else if (needPerm) {
      message = `${label} Instagram lookups are blocked by Meta permission #10 (business_discovery). TikTok and Facebook handles stay listed for review; we cannot read their post times.`;
    } else if (needKey) {
      message = `${label} YouTube timing needs YOUTUBE_API_KEY in Pipeline Settings or the Worker.`;
    } else {
      message = stale.length
        ? `Watchlist saved for ${label}. Public YouTube timing fills in after the next insights sweep; Instagram timing is paused.`
        : `Public YouTube lookup found no dated posts for the ${label} watchlist yet. Instagram timing is paused.`;
    }
  } else if (heatmap.sample_size < STUDIO_SIMILAR_TIMES_MIN_SAMPLE) {
    message = `${heatmap.sample_size} ${seasonLabel.toLowerCase()} posts so far for ${label}. Need ${STUDIO_SIMILAR_TIMES_MIN_SAMPLE} before this beats industry defaults.`;
  } else {
    message = `${seasonLabel} timing for ${label} uses historical similar-account posts stored in Studio Insights. Suggested times never auto-apply.`;
  }
  return {
    timezone: studioScheduleTimeZoneFromTheme(theme),
    profile: theme,
    profile_label: label,
    season,
    season_label: seasonLabel,
    source: heatmap.sample_size >= STUDIO_SIMILAR_TIMES_MIN_SAMPLE ? "similar_accounts" : "insufficient",
    storage: posts.length ? "database" : "cache",
    sample_size: heatmap.sample_size,
    overview,
    accounts: accountViews,
    reference_accounts: reference.map((row) => ({ platform: row.platform, handle: row.handle, source: row.source, profile: row.profile || theme })),
    buckets: heatmap.buckets,
    windows: STUDIO_HEATMAP_WINDOWS,
    own_schedule: providedOwn && typeof providedOwn === "object"
      ? { total: Number(providedOwn.total) || 0, buckets: Array.isArray(providedOwn.buckets) ? providedOwn.buckets : [] }
      : { total: 0, buckets: [] },
    suggested: heatmap.suggested,
    suggested_iso: studioSuggestedLocalDatetime(MAE_PRIORITY_SCHEDULE_WINDOWS, new Date(), {
          occupiedMs: occupiedMs || [],
          timeZone: studioScheduleTimeZoneFromTheme(theme),
        }),
    caption: captionLearned,
    as_of: cache?.as_of || null,
    remaining_to_sweep: stale.length,
    message,
  };
}
/*__STUDIO_WORKER_END:studioBuildSimilarTimesView__*/

export async function getInsightsWatchlist(request, env) {
  const accounts = await studioEnsureSimilarWatchlist(env);
  return respond(request, env, {
    ok: true,
    accounts,
    message: accounts.length
      ? "Similar-account watchlist loaded. YouTube can be timed from public posts. Instagram timing is paused pending Meta permission; TikTok and Facebook are reference only."
      : "Add a YouTube handle to start similar-account timing.",
  });
}
/*__STUDIO_WORKER_END:getInsightsWatchlist__*/

export async function putInsightsWatchlist(request, env) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const accounts = parseSimilarWatchlist(JSON.stringify(payload?.accounts || payload || []));
  await studioUpsertSetting(
    env,
    STUDIO_SIMILAR_WATCHLIST_SETTING,
    JSON.stringify(accounts),
    "Similar-account watchlist. Editable. YouTube is swept for public post times. Instagram timing is paused pending Meta business_discovery permission; TikTok and Facebook stay listed for review."
  );
  return respond(request, env, { ok: true, accounts });
}
/*__STUDIO_WORKER_END:putInsightsWatchlist__*/

export async function studioLoadSimilarTimesView(env, url, authorization) {
  const theme = await studioResolveSimilarTimesTheme(env, url, authorization);
  const platform = String(url?.searchParams?.get("platform") || "").trim().toLowerCase();
  const season = studioInsightsResolveSeason(url);
  const accounts = await studioEnsureSimilarWatchlist(env);
  const cache = await studioLoadSimilarAccountStatusCache(env);
  const [posts, occupiedByPlatform] = await Promise.all([
    studioInsightsPostsForView(env, { accounts, theme, platform, season, cache }),
    studioLoadOccupiedSchedules(env, {
      profile: await (async () => {
        let profileId = null;
        try { profileId = requestedProfileId(url); } catch { profileId = null; }
        return resolveWorkingContentProfile(env, authorization, profileId).catch(() => null);
      })(),
    }).catch((error) => {
      console.warn("similar-times own schedule overlay failed", error);
      return {};
    }),
  ]);
  return studioBuildSimilarTimesView({
    accounts,
    cache,
    theme,
    platform,
    season,
    posts,
    own_schedule: studioOwnScheduleHeatmap(occupiedByPlatform),
    occupiedMs: studioFlattenOccupiedByPlatform(occupiedByPlatform),
  });
}


/*__STUDIO_WORKER_END:studioLoadSimilarTimesView__*/

export async function studioInsightsSafeJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.error || body?.message || ("HTTP " + response.status));
    error.status = response.status;
    throw error;
  }
  return body;
}
/*__STUDIO_WORKER_END:studioInsightsSafeJson__*/

export async function studioInsightsMetaIdentity(id, token, version, fields) {
  if (!id || !token) return null;
  const url = new URL("https://graph.facebook.com/" + version + "/" + encodeURIComponent(id));
  url.searchParams.set("fields", fields);
  return studioInsightsSafeJson(await fetch(url.toString(), {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
  }));
}
/*__STUDIO_WORKER_END:studioInsightsMetaIdentity__*/

export function studioInsightsConnectionStateFromError(error) {
  const status = Number(error?.status || 0);
  const message = sanitizeAnalyticsError(error);
  const auth = status === 400 || status === 401 || status === 403
    || /permission|oauth|token|authoriz|scope|credential/i.test(message);
  return {
    status: auth ? "needs_authorization" : "error",
    error: message,
  };
}
/*__STUDIO_WORKER_END:studioInsightsConnectionStateFromError__*/

export function studioInsightsLatestSyncByPlatform(rows) {
  const result = {};
  for (const row of rows || []) {
    const platform = String(f(row, "Platform") || "").trim();
    if (!platform) continue;
    const current = result[platform] || { last_successful_sync: null, last_attempt: null, last_error: null };
    const success = f(row, "Insights_As_Of");
    const attempt = f(row, "Insights_Last_Attempt_At");
    if (success && (!current.last_successful_sync || Date.parse(success) > Date.parse(current.last_successful_sync))) {
      current.last_successful_sync = success;
    }
    if (attempt && (!current.last_attempt || Date.parse(attempt) > Date.parse(current.last_attempt))) {
      current.last_attempt = attempt;
      current.last_error = String(f(row, "Insights_Last_Error") || "").trim() || null;
    }
    result[platform] = current;
  }
  return result;
}
/*__STUDIO_WORKER_END:studioInsightsLatestSyncByPlatform__*/

export async function getInsightsConnections(request, env, url, authorization) {
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
  const theme = studioThemeForProfile(profile);
  const settings = await studioActivePipelineSettings(env, [
    "FACEBOOK_PAGE_ID",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_PAGE_ID",
    "FACEBOOK_GRAPH_API_VERSION",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID",
    "YOUTUBE_CHANNEL_ID",
    "YOUTUBE_UPLOAD_SERVICE_URL",
    "YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET",
    "TIKTOK_WORKER_BASE_URL",
  ], profile).catch(() => ({}));
  const version = String(settings.FACEBOOK_GRAPH_API_VERSION || "v26.0").replace(/^\/+|\/+$/g, "");
  const token = settings.FACEBOOK_PAGE_ACCESS_TOKEN || env.FACEBOOK_PAGE_ACCESS_TOKEN || "";
  const profileFormula = contentProfileFilterFormula(profile);
  const outputRows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 250,
    filterFormula: "AND(" + profileFormula + ",{Published_At}!=\"\",{Test_Run_ID}=BLANK())",
    fields: [
      "Platform",
      "Platform_Post_ID",
      "Platform_Media_ID",
      "Platform_Post_URL",
      "YouTube_Video_ID",
      "TikTok_Draft_Public_Post_IDs_JSON",
      "IG_Carousel_Published_Media_ID",
      "IG_Story_Post_ID",
      "FB_Slideshow_Meta_Video_ID",
      "Manual_Published_URL",
      "Published_At",
      "Insights_As_Of",
      "Insights_Last_Attempt_At",
      "Insights_Last_Error",
    ],
    sortField: "Published_At",
    sortDirection: "desc",
  }).catch(() => []);
  const sync = studioInsightsLatestSyncByPlatform(outputRows);
  const recentOutputForPlatform = (platform) => (outputRows || []).find((row) => {
    if (String(f(row, "Platform") || "").trim() !== platform) return false;
    return Boolean(nativePlatformId(platform, studioOutputNativeIdFields(row)));
  }) || null;

  const result = {
    instagram: {
      platform: "Instagram", status: "needs_authorization", account_name: null,
      account_id: settings.INSTAGRAM_BUSINESS_ACCOUNT_ID || null, reconnect_url: null, error: null,
    },
    facebook: {
      platform: "Facebook", status: "needs_authorization", account_name: null,
      account_id: settings.FACEBOOK_PAGE_ID || null, reconnect_url: null, error: null,
    },
    youtube: {
      platform: "YouTube", status: "needs_authorization", account_name: null,
      account_id: settings.YOUTUBE_CHANNEL_ID || null, reconnect_url: null, error: null,
    },
    tiktok: {
      platform: "TikTok", status: "needs_authorization", account_name: null,
      account_id: null,
      reconnect_url: settings.TIKTOK_WORKER_BASE_URL ? String(settings.TIKTOK_WORKER_BASE_URL).replace(/\/+$/, "") + "/tiktok/connect" : null,
      error: null,
    },
  };

  await Promise.all([
    (async () => {
      if (!token || !settings.FACEBOOK_PAGE_ID) {
        result.facebook.error = "Page analytics authorization is not configured for this profile.";
        return;
      }
      try {
        const page = await studioInsightsMetaIdentity(settings.FACEBOOK_PAGE_ID, token, version, "id,name");
        result.facebook.account_name = page?.name || null;
        result.facebook.account_id = page?.id || settings.FACEBOOK_PAGE_ID;
        result.facebook.status = "connected";
        // Page identity is the authorization proof. Individual historical posts,
        // Reels, or Stories can age out or use a media-specific object ID without
        // meaning the Page token is unauthorized.
        const sample = recentOutputForPlatform("Facebook");
        if (sample) {
          try {
            await fetchFacebookOwnedPostAnalytics({
              postId: nativePlatformId("Facebook", studioOutputNativeIdFields(sample)),
              pageId: result.facebook.account_id,
              token,
              version,
            });
          } catch (sampleError) {
            result.facebook.sync_warning = sanitizeAnalyticsError(sampleError);
          }
        }
      } catch (error) {
        Object.assign(result.facebook, studioInsightsConnectionStateFromError(error));
      }
    })(),
    (async () => {
      if (!token || !settings.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
        result.instagram.error = "Instagram professional-account analytics authorization is not configured for this profile.";
        return;
      }
      try {
        const ig = await studioInsightsMetaIdentity(settings.INSTAGRAM_BUSINESS_ACCOUNT_ID, token, version, "id,username,name");
        result.instagram.account_name = ig?.username ? "@" + ig.username : (ig?.name || null);
        result.instagram.account_id = ig?.id || settings.INSTAGRAM_BUSINESS_ACCOUNT_ID;
        result.instagram.status = "connected";
        // Account identity is the authorization proof. A single historical output
        // can contain a container/legacy media ID that is no longer queryable; that
        // must not paint the whole account as unauthorized.
        const sample = recentOutputForPlatform("Instagram");
        if (sample) {
          try {
            await fetchInstagramOwnedMediaAnalytics({
              postId: nativePlatformId("Instagram", studioOutputNativeIdFields(sample)),
              token,
              version,
            });
          } catch (sampleError) {
            result.instagram.sync_warning = sanitizeAnalyticsError(sampleError);
          }
        }
      } catch (error) {
        Object.assign(result.instagram, studioInsightsConnectionStateFromError(error));
      }
    })(),
    (async () => {
      const base = String(settings.YOUTUBE_UPLOAD_SERVICE_URL || "").trim().replace(/\/+$/, "");
      const secret = settings.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || env.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || "";
      if (!base) {
        result.youtube.status = "error";
        result.youtube.error = "YouTube uploader service is not configured for this profile.";
        return;
      }
      try {
        const response = await fetch(base + "/youtube/oauth/status", {
          headers: {
            Accept: "application/json",
            ...(secret ? { "X-SM-Pipeline-Key": secret } : {}),
          },
        });
        if (response.status === 404) {
          result.youtube.status = "error";
          result.youtube.error = "YouTube uploader is reachable but is running an older build without /youtube/oauth/status. Sync and restart this profile's uploader service.";
          return;
        }
        const body = await studioInsightsSafeJson(response);
        result.youtube.account_name = body?.channel_title || null;
        result.youtube.account_id = body?.channel_id || result.youtube.account_id;
        result.youtube.status = body?.refresh_ok && body?.analytics_read_ok
          ? "connected"
          : "needs_authorization";
        result.youtube.error = result.youtube.status === "connected"
          ? null
          : (body?.analytics_error || body?.error || "YouTube Analytics authorization is required.");
        if (result.youtube.status === "connected" && body?.data_api_quota_exceeded) {
          result.youtube.sync_warning = "YouTube Data API quota exceeded; analytics remain connected, but channel identity is temporarily unavailable.";
        } else if (result.youtube.status === "connected" && body?.channel_identity_error) {
          result.youtube.sync_warning = "Analytics are connected; channel identity check is temporarily unavailable: "
            + String(body.channel_identity_error).slice(0, 240);
        }
      } catch (error) {
        Object.assign(result.youtube, studioInsightsConnectionStateFromError(error));
      }
    })(),
    (async () => {
      const base = String(settings.TIKTOK_WORKER_BASE_URL || "").trim().replace(/\/+$/, "");
      if (!base) {
        result.tiktok.status = "error";
        result.tiktok.error = "TikTok auth worker is not configured for this profile.";
        return;
      }
      try {
        const body = await studioInsightsSafeJson(await fetch(base + "/tiktok/status", {
          headers: { Accept: "application/json" },
        }));
        result.tiktok.account_name = body?.creator_username ? "@" + body.creator_username : (body?.creator_nickname || null);
        result.tiktok.status = body?.authorized && body?.required_scopes_granted ? "connected" : "needs_authorization";
        result.tiktok.error = result.tiktok.status === "connected"
          ? null
          : "Reconnect TikTok to grant owned-video analytics access.";
      } catch (error) {
        Object.assign(result.tiktok, studioInsightsConnectionStateFromError(error));
      }
    })(),
  ]);

  for (const item of Object.values(result)) {
    const activity = sync[item.platform] || {};
    item.last_successful_sync = activity.last_successful_sync || null;
    item.last_attempt = activity.last_attempt || null;

    // Account Connections is an account-health surface, not a per-post failure log.
    // Once the account itself is connected, historical post/story sync failures stay
    // in output diagnostics and must not appear as an account-level error.
    item.last_error = item.status === "connected"
      ? null
      : (activity.last_error || null);
  }

  return respond(request, env, {
    ok: true,
    profile: mapStudioContentProfile(profile),
    theme,
    connections: result,
  });
}
/*__STUDIO_WORKER_END:getInsightsConnections__*/

export function studioInsightsMilestoneSnapshot(snapshots, targetHours, toleranceHours) {
  const candidates = (snapshots || [])
    .filter((row) => Number.isFinite(Number(row.age_hours)))
    .map((row) => ({ row, delta: Math.abs(Number(row.age_hours) - targetHours) }))
    .filter((entry) => entry.delta <= toleranceHours)
    .sort((a, b) => a.delta - b.delta);
  const row = candidates[0]?.row;
  if (!row) return null;
  return {
    age_hours: row.age_hours,
    fetched_at: row.fetched_at,
    views: row.views,
    reach: row.reach,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
    total_interactions: row.total_interactions,
    engaged_views: row.engaged_views,
    watch_time_sec: row.watch_time_sec,
    average_view_duration_sec: row.average_view_duration_sec,
    average_percentage_viewed: row.average_percentage_viewed,
    audience_gained: row.audience_gained,
    audience_lost: row.audience_lost,
    duration_sec: row.duration_sec,
  };
}
/*__STUDIO_WORKER_END:studioInsightsMilestoneSnapshot__*/

export async function getInsightsPosts(request, env, url, authorization) {
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
  const requested = Number(url.searchParams.get("limit") || 300);
  const limit = Math.max(1, Math.min(500, Number.isFinite(requested) ? Math.trunc(requested) : 300));
  const profileFormula = contentProfileFilterFormula(profile);
  const publishedFormula = "AND(" + profileFormula + ",{Published_At}!=\"\",{Do_Not_Publish}=0,{Test_Run_ID}=BLANK())";
  const theme = studioThemeForProfile(profile);
  const [outputs, contentRows, observations] = await Promise.all([
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit,
      filterFormula: publishedFormula,
      fields: [
        "Output_ID",
        "Platform",
        "Platform_Output_Type",
        "Studio_Output_Type",
        "Output_Title",
        "Output_Caption",
        "Platform_Post_URL",
        "Published_At",
        "Content_Item",
        "Insights_Views",
        "Insights_Likes",
        "Insights_Comments",
        "Insights_Shares",
        "Insights_Reach",
        "Insights_Saves",
        "Insights_Watch_Time_Sec",
        "Insights_Total_Interactions",
        "Insights_Engaged_Views",
        "Insights_Avg_View_Duration_Sec",
        "Insights_Avg_Percentage_Viewed",
        "Insights_Audience_Gained",
        "Insights_Audience_Lost",
        "Insights_Duration_Sec",
        "Insights_Next_Sync_At",
        "Insights_Last_Attempt_At",
        "Insights_Last_Error",
        "Insights_As_Of",
        "Insights_Source",
      ],
      sortField: "Published_At",
      sortDirection: "desc",
    }),
    listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, {
      limit: 500,
      filterFormula: profileFormula,
      fields: [
        "Content_ID",
        "Content_Title",
        "Content_Type",
        "Content_Duration",
        "Primary_Location",
        "Neighborhood_or_Area",
        "Content_Themes",
        "Include_Voiceover",
        "Include_Background_Music",
        "Include_Thumbnail",
        "Video_Clip_Count",
      ],
      sortField: "Created_At",
      sortDirection: "desc",
    }),
    studioInsightsLoadObservations(env, {
      profile: theme,
      source: "first_party",
      include_history: true,
      limit: 500,
    }).catch(() => []),
  ]);
  const contentById = new Map((contentRows || []).map((row) => [row.id, row]));
  const snapshotsByOutput = new Map();
  for (const snapshot of observations || []) {
    const key = String(snapshot.platform_output_record_id || "").trim();
    if (!key) continue;
    if (!snapshotsByOutput.has(key)) snapshotsByOutput.set(key, []);
    snapshotsByOutput.get(key).push(snapshot);
  }
  const records = (outputs || []).map((row) => {
    const contentLinks = Array.isArray(f(row, "Content_Item")) ? f(row, "Content_Item") : [];
    const contentId = contentLinks[0] || null;
    const content = contentId ? contentById.get(contentId) : null;
    return {
      id: row.id,
      output_id: f(row, "Output_ID"),
      platform: f(row, "Platform"),
      platform_output_type: f(row, "Platform_Output_Type"),
      studio_output_type: f(row, "Studio_Output_Type"),
      output_title: f(row, "Output_Title"),
      output_caption: f(row, "Output_Caption"),
      platform_post_url: f(row, "Platform_Post_URL"),
      published_at: f(row, "Published_At"),
      content_item_id: contentId,
      insights_views: f(row, "Insights_Views"),
      insights_likes: f(row, "Insights_Likes"),
      insights_comments: f(row, "Insights_Comments"),
      insights_shares: f(row, "Insights_Shares"),
      insights_reach: f(row, "Insights_Reach"),
      insights_saves: f(row, "Insights_Saves"),
      insights_watch_time_sec: f(row, "Insights_Watch_Time_Sec"),
      insights_total_interactions: f(row, "Insights_Total_Interactions"),
      insights_engaged_views: f(row, "Insights_Engaged_Views"),
      insights_avg_view_duration_sec: f(row, "Insights_Avg_View_Duration_Sec"),
      insights_avg_percentage_viewed: f(row, "Insights_Avg_Percentage_Viewed"),
      insights_audience_gained: f(row, "Insights_Audience_Gained"),
      insights_audience_lost: f(row, "Insights_Audience_Lost"),
      insights_duration_sec: f(row, "Insights_Duration_Sec"),
      insights_next_sync_at: f(row, "Insights_Next_Sync_At"),
      insights_last_attempt_at: f(row, "Insights_Last_Attempt_At"),
      insights_last_error: f(row, "Insights_Last_Error"),
      insights_milestones: {
        h24: studioInsightsMilestoneSnapshot(snapshotsByOutput.get(row.id), 24, 12),
        d7: studioInsightsMilestoneSnapshot(snapshotsByOutput.get(row.id), 168, 48),
        d30: studioInsightsMilestoneSnapshot(snapshotsByOutput.get(row.id), 720, 120),
      },
      insights_as_of: f(row, "Insights_As_Of"),
      insights_source: f(row, "Insights_Source"),
      content: content ? {
        id: content.id,
        content_id: f(content, "Content_ID"),
        title: f(content, "Content_Title"),
        content_type: f(content, "Content_Type"),
        duration: f(content, "Content_Duration"),
        primary_location: String(f(content, "Primary_Location") || "").trim() || null,
        neighborhood_or_area: String(f(content, "Neighborhood_or_Area") || "").trim() || null,
        content_themes: f(content, "Content_Themes") || [],
        include_voiceover: f(content, "Include_Voiceover"),
        include_background_music: f(content, "Include_Background_Music"),
        include_thumbnail: f(content, "Include_Thumbnail"),
        video_clip_count: f(content, "Video_Clip_Count"),
      } : null,
    };
  });
  return respond(request, env, {
    ok: true,
    records,
    count: records.length,
    analytics_count: records.filter((row) => (
      row.insights_as_of || row.insights_source ||
      Number(row.insights_views || 0) || Number(row.insights_likes || 0) ||
      Number(row.insights_comments || 0) || Number(row.insights_shares || 0) ||
      Number(row.insights_reach || 0) || Number(row.insights_saves || 0)
    )).length,
    profile: mapStudioContentProfile(profile),
  });
}
/*__STUDIO_WORKER_END:getInsightsPosts__*/

export async function postInsightsChat(request, env, url, authorization) {
  void url;
  void authorization;
  let payload = {};
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const question = String(payload?.question || "").trim().slice(0, 800);
  if (!question) throw new HttpError(400, "Ask a performance question");
  const context = payload?.context && typeof payload.context === "object" ? payload.context : {};
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) throw new HttpError(503, "AI analyst is not configured");
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const dataText = JSON.stringify(context).slice(0, 32000);
  const prompt = [
    "You are the read-only Performance Analyst inside ChicagoShining Studio.",
    "Answer the operator's question using ONLY the supplied FIRST-PARTY analytics context for the operator's own authenticated accounts. Never invent metrics, posts, platforms, causes, audience traits, or missing values.",
    "Missing analytics are unknown, not zero. Distinguish correlation from causation. Treat groups with fewer than 3 sampled posts as directional only. If platform coverage is uneven, say so before comparing platforms.",
    "Use insights_milestones when present for 24-hour, 7-day, and 30-day growth comparisons; cite the actual measurement age because a milestone may be sampled near rather than exactly at the target.",
    "Be specific and useful. Cite post titles, sample sizes, views, interactions, engagement rates, content types, themes, or locations from the supplied data when relevant.",
    "Return a JSON object with exactly these keys: answer (string), evidence (array of short strings), caveats (array of short strings), follow_ups (array of 2 to 4 useful questions).",
    "Do not propose automatic publishing or make changes. You may recommend experiments or content ideas, but this analyst is read-only.",
    "",
    "Operator question:",
    question,
    "",
    "Analytics context:",
    dataText,
  ].join("\n");
  const response = await fetch(runnerUrl + "/jobs/autonomous-pick", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify({ prompt }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(
      response.status,
      body?.error || body?.message || ("AI analyst failed (" + response.status + ")")
    );
  }
  const parsed = body?.parsed;
  if (!parsed || typeof parsed !== "object") throw new HttpError(502, "AI analyst returned an invalid response");
  return respond(request, env, {
    ok: true,
    answer: String(parsed.answer || "").trim(),
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map((item) => String(item)).slice(0, 8) : [],
    caveats: Array.isArray(parsed.caveats) ? parsed.caveats.map((item) => String(item)).slice(0, 6) : [],
    follow_ups: Array.isArray(parsed.follow_ups) ? parsed.follow_ups.map((item) => String(item)).slice(0, 4) : [],
    source: "openai-grounded-post-insights",
  });
}
/*__STUDIO_WORKER_END:postInsightsChat__*/

export async function getInsightsBestTimes(request, env, url, authorization) {
  const platform = String(url.searchParams.get("platform") || "").trim();
  const outputType = String(url.searchParams.get("output_type") || "").trim();
  const season = studioInsightsResolveSeason(url);
  const industry = studioIndustryBestWindows(platform, outputType);
  const seasonLabel = studioSeasonLabel(season);
  let occupancyProfile = null;
  try {
    occupancyProfile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
  } catch (error) {
    const themeHint = String(url.searchParams.get("profile") || "").trim().toLowerCase();
    const matches = await resolveAuthorizedContentProfiles(env, authorization).catch(() => []);
    occupancyProfile = (themeHint && matches.find((row) => studioThemeForProfile(row) === themeHint))
      || null;
    if (!occupancyProfile && error?.status !== 400) {
      occupancyProfile = await resolveWorkingContentProfile(env, authorization, null).catch(() => null);
    }
  }
  const occupiedByPlatform = await studioOccupiedSchedulesOrEmpty(env, { profile: occupancyProfile });
  const theme = await studioResolveSimilarTimesTheme(env, url, authorization).catch(() => "chicago");
  const timeZone = maeNormalizeTimeZone(
    url.searchParams.get("timezone")
      || (occupancyProfile ? studioScheduleTimeZoneForProfile(occupancyProfile) : studioScheduleTimeZoneFromTheme(theme))
  );
  const occupiedOpts = {
    occupiedMs: studioFlattenOccupiedByPlatform(occupiedByPlatform),
    platformOccupiedMs: studioOccupiedForPlatform(occupiedByPlatform, platform),
    timeZone,
  };
  const occupiedMsForClient = occupiedOpts.platformOccupiedMs;
  const maeIso = () => studioSuggestedLocalDatetime(MAE_PRIORITY_SCHEDULE_WINDOWS, new Date(), occupiedOpts);
  const industryPayload = (themeName = theme, note = null) => ({
    ok: true,
    timezone: timeZone,
    platform,
    output_type: outputType,
    season,
    season_label: seasonLabel,
    source: "mae_rotation",
    sample_size: 0,
    suggested: { days: [], windows: [...MAE_PRIORITY_SCHEDULE_WINDOWS], label: "MAE rotation (morning then afternoon then evening)" },
    suggested_iso: maeIso(),
    occupied_ms: occupiedMsForClient,
    occupied_count: occupiedMsForClient.length,
    similar: null,
    similar_sample_size: 0,
    similar_profile: themeName,
    caption: null,
    note: note || `${seasonLabel} stamps use MAE-first scheduling in ${timeZone}: Morning → Afternoon → Evening on Day 1, then Day 2 through the configured horizon (default 30). Each platform × output type is an independent lane. Once MAE is full, extras use each day's widest gap on the least-populated days. Overnight 8:00 PM–3:30 AM is never used.`,
  });

  try {
    // Keep this route cheap: Pipeline fires one request per Ready row.
    // No Airtable output dump, no legacy-cache migration, no second similar-posts pass for captions.
    const [firstParty, learned, similar, captionLearned] = await Promise.all([
      studioInsightsLoadObservations(env, {
        profile: theme,
        platform,
        output_type: outputType,
        season,
        source: "first_party",
        limit: 120,
      }).catch((error) => {
        console.warn("best-times first-party read failed", error);
        return [];
      }),
      studioInsightsLoadLearned(env, {
        profile: theme,
        platform,
        output_type: outputType,
        season,
        metric_type: "post_time",
      }).catch((error) => {
        console.warn("best-times learned read failed", error);
        return null;
      }),
      studioLoadSimilarTimesView(env, url, authorization).catch((error) => {
        console.warn("best-times similar read failed", error);
        return null;
      }),
      studioInsightsLoadLearned(env, {
        profile: theme,
        platform,
        output_type: outputType,
        season,
        metric_type: "caption",
      }).catch((error) => {
        console.warn("best-times caption learned read failed", error);
        return null;
      }),
    ]);

    const sample = (firstParty || []).filter((row) => row.views > 0 || row.likes > 0);
    const firstHeatmap = studioBuildSimilarHeatmap(sample);
    const firstSuggested = firstHeatmap.sample_size >= STUDIO_SIMILAR_TIMES_MIN_SAMPLE ? firstHeatmap.suggested : null;
    const useFirstParty = Boolean(firstSuggested);
    const useLearned = !useFirstParty && learned?.days?.length && learned?.windows?.length && learned.sample_size >= STUDIO_SIMILAR_TIMES_MIN_SAMPLE;
    const useSimilar = !useFirstParty && !useLearned && similar?.source === "similar_accounts" && similar.suggested;
    const captionFromSample = (!captionLearned?.caption_patterns && !captionLearned?.patterns)
      ? studioInsightsBuildCaptionLearned(sample)
      : null;
    const caption = captionLearned?.caption_patterns
      ? {
          label: captionLearned.label,
          patterns: captionLearned.caption_patterns,
          sample_size: captionLearned.sample_size,
          source: captionLearned.source || "historical",
        }
      : captionLearned?.patterns
        ? {
            label: captionLearned.label,
            patterns: captionLearned.patterns,
            sample_size: captionLearned.sample_size,
            source: "historical",
          }
        : captionFromSample
          ? {
              label: captionFromSample.label,
              patterns: captionFromSample.patterns,
              sample_size: captionFromSample.sample_size,
              source: "historical",
            }
          : null;

    return respond(request, env, {
      ok: true,
      timezone: timeZone,
      platform,
      output_type: outputType,
      season,
      season_label: seasonLabel,
      source: "mae_rotation",
      sample_size: useFirstParty ? firstHeatmap.sample_size : useLearned ? learned.sample_size : useSimilar ? similar.sample_size : sample.length,
      suggested: { days: [], windows: [...MAE_PRIORITY_SCHEDULE_WINDOWS], label: "MAE rotation (morning then afternoon then evening)" },
      suggested_iso: maeIso(),
      occupied_ms: occupiedMsForClient,
      occupied_count: occupiedMsForClient.length,
      similar: similar?.suggested || null,
      similar_sample_size: similar?.sample_size || 0,
      similar_profile: similar?.profile || theme,
      caption,
      note: `${seasonLabel} stamps use MAE-first scheduling in ${timeZone}: Day 1 Morning → Afternoon → Evening through the configured horizon, then balanced overflow on the least-populated days. Overnight 8:00 PM–3:30 AM is never used.`,
    });
  } catch (error) {
    console.warn("best-times failed; MAE fallback", error);
    return respond(request, env, industryPayload(theme, `Suggestion service hiccuped; MAE rotation in ${timeZone} is still applied.`));
  }
}
/*__STUDIO_WORKER_END:getInsightsBestTimes__*/

export async function getInsightsCaptions(request, env, url, authorization) {
  const platform = String(url.searchParams.get("platform") || "").trim();
  const outputType = String(url.searchParams.get("output_type") || "").trim();
  const season = studioInsightsResolveSeason(url);
  const theme = await studioResolveSimilarTimesTheme(env, url, authorization);
  let learned = await studioInsightsLoadLearned(env, {
    profile: theme,
    platform,
    output_type: outputType,
    season,
    metric_type: "caption",
  }).catch(() => null);
  const firstParty = await studioInsightsLoadObservations(env, {
    profile: theme,
    platform,
    output_type: outputType,
    season,
    source: "first_party",
    limit: 120,
  }).catch(() => []);
  const similar = await studioInsightsLoadObservations(env, {
    profile: theme,
    platform,
    season,
    source: "similar_account",
    limit: 200,
  }).catch(() => []);
  const computed = studioInsightsBuildCaptionLearned([...firstParty, ...similar]);
  if (!learned && computed) {
    learned = {
      label: computed.label,
      caption_patterns: computed.patterns,
      sample_size: computed.sample_size,
      source: firstParty.length && similar.length ? "blended" : firstParty.length ? "first_party" : similar.length ? "similar_accounts" : "insufficient",
    };
  }
  return respond(request, env, {
    ok: true,
    profile: theme,
    profile_label: studioSimilarProfileLabel(theme),
    platform,
    output_type: outputType,
    season,
    season_label: studioSeasonLabel(season),
    source: learned?.source || "insufficient",
    sample_size: learned?.sample_size || computed?.sample_size || 0,
    caption: learned?.caption_patterns ? {
      label: learned.label,
      patterns: learned.caption_patterns,
    } : computed ? {
      label: computed.label,
      patterns: computed.patterns,
    } : null,
    note: learned?.sample_size >= STUDIO_SIMILAR_TIMES_MIN_SAMPLE
      ? `${studioSeasonLabel(season)} caption guidance comes from historical posts in Studio Insights Observations.`
      : `Need more ${studioSeasonLabel(season).toLowerCase()} caption examples before learned caption guidance beats defaults.`,
  });
}
/*__STUDIO_WORKER_END:getInsightsCaptions__*/

export async function getInsightsSimilarTimes(request, env, url, authorization, ctx) {
  void ctx;
  const view = await studioLoadSimilarTimesView(env, url, authorization);
  return respond(request, env, { ok: true, ...view });
}
/*__STUDIO_WORKER_END:getInsightsSimilarTimes__*/

export async function postInsightsSimilarTimesSweep(request, env, url, authorization) {
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  // A single-account button click must stay bounded. Migrating every legacy
  // cache observation here can exhaust Worker CPU before the requested sweep.
  // Reloading 300 observations + occupied schedules after the YouTube fetch
  // also 500s the isolate (subrequest/CPU) for handles with ~20 public uploads.
  const theme = payload.profile || payload.theme
    ? studioNormalizeSimilarProfile(payload.profile || payload.theme)
    : await studioResolveSimilarTimesTheme(env, url, authorization);
  const season = payload.season ? studioNormalizeInsightsSeason(payload.season) : studioInsightsResolveSeason(url);
  const platform = String(payload.platform || url.searchParams.get("platform") || "").trim().toLowerCase();
  const result = await studioSweepSimilarAccountTimes(env, {
    limit: 1,
    force: Boolean(payload.force),
    theme,
    platform,
    handle: payload.handle,
    skipRecompute: true,
  });
  const view = studioBuildSimilarTimesView({
    accounts: result.accounts || [],
    cache: result.cache || { as_of: null, accounts: {} },
    theme,
    platform,
    season,
    posts: result.posts || [],
    own_schedule: { total: 0, buckets: [] },
  });
  return respond(request, env, {
    ok: true,
    swept: result.scanned,
    updated: result.updated,
    remaining_to_sweep: result.remaining,
    account: result.account || null,
    ...view,
  });
}
/*__STUDIO_WORKER_END:postInsightsSimilarTimesSweep__*/

export function studioOutputNativeIdFields(row) {
  return {
    Platform: f(row, "Platform"),
    Platform_Post_ID: f(row, "Platform_Post_ID"),
    Platform_Media_ID: f(row, "Platform_Media_ID"),
    Platform_Post_URL: f(row, "Platform_Post_URL"),
    YouTube_Video_ID: f(row, "YouTube_Video_ID"),
    TikTok_Draft_Public_Post_IDs_JSON: f(row, "TikTok_Draft_Public_Post_IDs_JSON"),
    IG_Carousel_Published_Media_ID: f(row, "IG_Carousel_Published_Media_ID"),
    IG_Story_Post_ID: f(row, "IG_Story_Post_ID"),
    FB_Slideshow_Meta_Video_ID: f(row, "FB_Slideshow_Meta_Video_ID"),
    Manual_Published_URL: f(row, "Manual_Published_URL"),
  };
}
/*__STUDIO_WORKER_END:studioOutputNativeIdFields__*/

export function studioFirstPartySnapshotFields(snapshot) {
  return {
    Insights_Views: snapshot.views,
    Insights_Likes: snapshot.likes,
    Insights_Comments: snapshot.comments,
    Insights_Shares: snapshot.shares,
    Insights_Reach: snapshot.reach,
    Insights_Saves: snapshot.saves,
    Insights_Watch_Time_Sec: snapshot.watch_time_sec,
    Insights_Total_Interactions: snapshot.total_interactions,
    Insights_Engaged_Views: snapshot.engaged_views,
    Insights_Avg_View_Duration_Sec: snapshot.average_view_duration_sec,
    Insights_Avg_Percentage_Viewed: snapshot.average_percentage_viewed,
    Insights_Audience_Gained: snapshot.audience_gained,
    Insights_Audience_Lost: snapshot.audience_lost,
    Insights_Duration_Sec: snapshot.duration_sec,
    Insights_Platform_Metrics_JSON: JSON.stringify(snapshot.platform_metrics || {}),
    Insights_As_Of: snapshot.fetched_at,
    Insights_Source: snapshot.source || snapshot.platform,
    Insights_Next_Sync_At: snapshot.next_sync_at,
    Insights_Last_Attempt_At: snapshot.fetched_at,
    Insights_Last_Error: null,
  };
}
/*__STUDIO_WORKER_END:studioFirstPartySnapshotFields__*/

export async function studioPersistFirstPartySnapshot(env, row, snapshot, { profile, profileId, outputType, caption }) {
  if (!studioInsightsDbEnabled(env)) return null;
  const observationKey = analyticsObservationKey({
    platform: snapshot.platform,
    profileId: profileId || profile,
    nativePostId: snapshot.native_post_id || row.id,
    publishedAt: snapshot.published_at,
    measuredAt: snapshot.fetched_at,
  });
  return studioInsightsUpsertObservation(env, studioInsightsObservationFields({
    ...snapshot,
    caption,
    output_type: outputType,
    external_post_id: snapshot.native_post_id || row.id,
    source: "first_party",
  }, {
    observation_key: observationKey,
    source: "first_party",
    platform: snapshot.platform,
    handle: "first_party:" + profile,
    profile,
    output_type: outputType,
    fetched_at: snapshot.fetched_at,
    platform_output_record_id: row.id,
    content_profile_record_id: profileId || null,
    measurement_bucket: snapshot.measurement_bucket,
    age_hours: snapshot.age_hours,
  }));
}
/*__STUDIO_WORKER_END:studioPersistFirstPartySnapshot__*/

export async function studioResolveTikTokOwnedVideoId(env, row, { profile, publishedAt }) {
  const fields = studioOutputNativeIdFields(row);
  const immediate = nativePlatformId("TikTok", fields);
  if (immediate) return immediate;

  // TikTok completion commonly stores a tiktok.com/t/... share URL rather than
  // the numeric video ID. First try resolving that redirect to the canonical
  // /@user/video/<id> URL.
  const urlCandidates = [
    fields.Platform_Post_URL,
    fields.Manual_Published_URL,
    fields.Platform_Post_ID,
  ].map((value) => String(value || "").trim()).filter(Boolean);

  for (const candidate of urlCandidates) {
    const direct = candidate.match(/\/video\/(\d{8,})/);
    if (direct) return direct[1];
    if (!/^https?:\/\/(?:www\.)?tiktok\.com\/t\//i.test(candidate)) continue;
    try {
      const response = await fetch(candidate, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const resolved = String(response.url || "");
      const match = resolved.match(/\/video\/(\d{8,})/);
      if (match) return match[1];
    } catch {}
  }

  // Reliable fallback: video.list can return the creator's latest owned videos
  // without an ID. Match by publish time. This is specifically for completed
  // drafts where the short share URL never exposed the numeric post ID to us.
  try {
    const body = await fetchTikTokOwnedVideoAnalytics({
      pipelineRunnerUrl: env.PIPELINE_RUNNER_URL,
      pipelineRunnerSecret: env.PIPELINE_RUNNER_SHARED_SECRET,
      profile,
      videoIds: [],
    });
    const videos = Array.isArray(body?.videos) ? body.videos : [];
    const target = Date.parse(String(publishedAt || ""));
    if (!Number.isFinite(target)) return null;
    const candidates = videos
      .map((video) => ({
        video,
        delta: Math.abs(Date.parse(String(video?.published_at || "")) - target),
      }))
      .filter((entry) => Number.isFinite(entry.delta) && entry.delta <= 12 * 3600000)
      .sort((left, right) => left.delta - right.delta);
    return String(candidates[0]?.video?.id || "").trim() || null;
  } catch {
    return null;
  }
}
/*__STUDIO_WORKER_END:studioResolveTikTokOwnedVideoId__*/

export async function studioFetchOwnedOutputAnalytics(env, row, { platform, postId, publishedAt, profile }) {
  const settings = await studioActivePipelineSettings(env, [
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_GRAPH_API_VERSION",
    "YOUTUBE_UPLOAD_SERVICE_URL",
    "YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET",
  ], row).catch(() => ({}));
  const version = String(settings.FACEBOOK_GRAPH_API_VERSION || "v26.0").replace(/^\/+|\/+$/g, "");
  if (platform === "Instagram") {
    return fetchInstagramOwnedMediaAnalytics({
      postId,
      token: settings.FACEBOOK_PAGE_ACCESS_TOKEN || env.FACEBOOK_PAGE_ACCESS_TOKEN,
      version,
    });
  }
  if (platform === "Facebook") {
    return fetchFacebookOwnedPostAnalytics({
      postId,
      pageId: settings.FACEBOOK_PAGE_ID,
      token: settings.FACEBOOK_PAGE_ACCESS_TOKEN || env.FACEBOOK_PAGE_ACCESS_TOKEN,
      version,
    });
  }
  if (platform === "YouTube") {
    return fetchYouTubeOwnedVideoAnalytics({
      serviceBaseUrl: settings.YOUTUBE_UPLOAD_SERVICE_URL,
      serviceSecret: settings.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || env.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET,
      videoId: postId,
      publishedAt,
    });
  }
  if (platform === "TikTok") {
    return fetchTikTokOwnedVideoAnalytics({
      pipelineRunnerUrl: env.PIPELINE_RUNNER_URL,
      pipelineRunnerSecret: env.PIPELINE_RUNNER_SHARED_SECRET,
      profile,
      videoIds: [postId],
    }).then((body) => {
      const match = (body?.videos || []).find((video) => String(video?.id || "") === String(postId))
        || (body?.videos || [])[0];
      if (!match) throw new Error("TikTok Display API returned no matching owned video");
      return { ...match, source: body?.source || "tiktok-display-api" };
    });
  }
  return null;
}
/*__STUDIO_WORKER_END:studioFetchOwnedOutputAnalytics__*/

export async function studioSweepPublishedInsights(env, options = {}) {
  const perProfileLimit = Math.max(1, Math.min(25, Number(options.limit) || 8));
  const profileRecords = (await listContentProfileRecords(env).catch(() => []))
    .filter((record) => Boolean(f(record, "Active")));

  let scanned = 0;
  let updated = 0;
  let failed = 0;
  let considered = 0;
  const profiles = new Set();
  const profileStats = {};
  const groups = [];

  for (const profileRecord of profileRecords) {
    const profile = studioThemeForProfile(profileRecord);
    const profileId = profileRecord.id;
    const profileFormula = contentProfileFilterFormula(profileRecord);
    const rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      // Only need enough backlog to pick perProfileLimit due rows. A 250-row
      // scan every cron tick was a top Airtable credit burner (3 pages/profile).
      limit: Math.max(perProfileLimit * 4, 40),
      sortField: "Published_At",
      sortDirection: "desc",
      filterFormula: 'AND(' + profileFormula + ',{Test_Run_ID}=BLANK(),{Published_At}!="",{Do_Not_Publish}=0,OR({Insights_Next_Sync_At}=BLANK(),IS_BEFORE({Insights_Next_Sync_At},NOW())))',
    }).catch(() => []);

    scanned += rows.length;
    const eligible = rows.filter((row) => {
      const platform = String(f(row, "Platform") || "").trim();
      return ["Instagram", "Facebook", "YouTube", "TikTok"].includes(platform) && Boolean(f(row, "Published_At"));
    });

    // Prioritize outputs that have never received a successful analytics snapshot,
    // then continue lifecycle refreshes. This makes backfill converge quickly while
    // retaining the age-based refresh cadence for already sampled posts.
    eligible.sort((a, b) => {
      const aMissing = f(a, "Insights_As_Of") ? 1 : 0;
      const bMissing = f(b, "Insights_As_Of") ? 1 : 0;
      if (aMissing !== bMissing) return aMissing - bMissing;
      const aNext = Date.parse(String(f(a, "Insights_Next_Sync_At") || f(a, "Published_At") || "")) || 0;
      const bNext = Date.parse(String(f(b, "Insights_Next_Sync_At") || f(b, "Published_At") || "")) || 0;
      return aNext - bNext;
    });

    const selected = eligible.slice(0, perProfileLimit);
    profileStats[profile] = {
      profile_id: profileId,
      scanned: rows.length,
      eligible: eligible.length,
      selected: selected.length,
      updated: 0,
      failed: 0,
    };
    groups.push({ profile, profileId, rows: selected });
  }

  // Round-robin execution keeps provider/API work interleaved by profile even when
  // one brand has a much larger backlog.
  const queue = [];
  const maxGroupSize = Math.max(0, ...groups.map((group) => group.rows.length));
  for (let index = 0; index < maxGroupSize; index += 1) {
    for (const group of groups) {
      const row = group.rows[index];
      if (row) queue.push({ row, profile: group.profile, profileId: group.profileId });
    }
  }

  for (const candidate of queue) {
    const { row, profile, profileId } = candidate;
    const platform = String(f(row, "Platform") || "").trim();
    const publishedAt = f(row, "Published_At");
    let postId = nativePlatformId(platform, studioOutputNativeIdFields(row));
    considered += 1;
    const attemptedAt = new Date().toISOString();

    if (!postId && platform === "TikTok") {
      postId = await studioResolveTikTokOwnedVideoId(env, row, { profile, publishedAt });
      if (postId) {
        // Persist the discovered numeric ID so all future analytics pulls are
        // deterministic and do not have to resolve the short share URL again.
        await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              Platform_Post_ID: postId,
              Insights_Last_Error: null,
              Insights_Next_Sync_At: null,
            },
            typecast: true,
          }),
        }).catch(() => null);
      }
    }

    if (!postId) {
      const retryAt = new Date(Date.now() + 24 * 3600000).toISOString();
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Insights_Last_Attempt_At: attemptedAt,
            Insights_Last_Error: "Missing native platform post ID for analytics",
            Insights_Next_Sync_At: retryAt,
          },
          typecast: true,
        }),
      }).catch(() => null);
      failed += 1;
      if (profileStats[profile]) profileStats[profile].failed += 1;
      continue;
    }

    const outputType = String(f(row, "Platform_Output_Type") || f(row, "Studio_Output_Type") || "").trim();
    const caption = String(f(row, "Output_Caption") || "").trim();
    try {
      const raw = await studioFetchOwnedOutputAnalytics(env, row, {
        platform,
        postId,
        publishedAt,
        profile,
      });
      if (!raw) continue;
      const snapshot = normalizeAnalyticsSnapshot(platform, raw, {
        nativePostId: postId,
        publishedAt: raw.published_at || publishedAt,
        measuredAt: attemptedAt,
        source: raw.source || platform.toLowerCase(),
      });
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
        method: "PATCH",
        body: JSON.stringify({ fields: studioFirstPartySnapshotFields(snapshot), typecast: true }),
      });
      await studioPersistFirstPartySnapshot(env, row, snapshot, {
        profile,
        profileId,
        outputType,
        caption,
      });
      profiles.add(profile);
      updated += 1;
      if (profileStats[profile]) profileStats[profile].updated += 1;
    } catch (error) {
      failed += 1;
      if (profileStats[profile]) profileStats[profile].failed += 1;
      const retryAt = new Date(Date.now() + 6 * 3600000).toISOString();
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Insights_Last_Attempt_At: attemptedAt,
            Insights_Last_Error: sanitizeAnalyticsError(error),
            Insights_Next_Sync_At: retryAt,
          },
          typecast: true,
        }),
      }).catch(() => null);
      console.warn("first-party analytics row failed", row.id, sanitizeAnalyticsError(error));
    }
  }

  return {
    scanned,
    considered,
    updated,
    failed,
    profiles: [...profiles],
    active_profiles: profileRecords.length,
    per_profile_limit: perProfileLimit,
    profile_stats: profileStats,
  };
}
/*__STUDIO_WORKER_END:studioSweepPublishedInsights__*/

export async function studioFetchOutputInsights(platform, postId, creds) {
  // Compatibility wrapper retained for older callers; the scheduled first-party
  // sweep above is profile-aware and uses the normalized adapters.
  if (platform === "Instagram") {
    return fetchInstagramOwnedMediaAnalytics({ postId, token: creds?.token, version: creds?.version || "v26.0" });
  }
  if (platform === "Facebook") {
    return fetchFacebookOwnedPostAnalytics({ postId, token: creds?.token, version: creds?.version || "v26.0" });
  }
  return null;
}
/*__STUDIO_WORKER_END:studioFetchOutputInsights__*/

export function studioSanitizeIgHandle(handle) {
  return String(handle || "").trim().replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "").slice(0, 30);
}
/*__STUDIO_WORKER_END:studioSanitizeIgHandle__*/

export function studioSanitizeYtHandle(handle) {
  return String(handle || "").trim().replace(/^@/, "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 50);
}
/*__STUDIO_WORKER_END:studioSanitizeYtHandle__*/

export function studioTruncateInsightError(error) {
  return String(error?.message || error || "Lookup failed").replace(/\s+/g, " ").trim().slice(0, 160);
}
/*__STUDIO_WORKER_END:studioTruncateInsightError__*/

export async function studioFetchInstagramBusinessDiscovery(handle, creds) {
  const username = studioSanitizeIgHandle(handle);
  if (!username) return { status: "error", error: "Instagram handle is empty.", posts: [] };
  if (!creds.token || !creds.igUserId) return { status: "error", error: "Instagram Graph credentials are missing.", posts: [] };
  const fields = `business_discovery.username(${username}){media.limit(20){id,timestamp,like_count,comments_count,media_type,caption}}`;
  const url = `https://graph.facebook.com/${creds.version}/${encodeURIComponent(creds.igUserId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(creds.token)}`;
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.error) {
    const code = Number(body?.error?.code || 0);
    const message = studioTruncateInsightError(body?.error || { message: `Instagram lookup HTTP ${response.status}` });
    const needsPermission = code === 10 || /does not have permission|permission for this action/i.test(message);
    const unavailable = !needsPermission && (code === 110 || code === 100 || /business_discovery|does not exist|not found|not a business/i.test(message));
    return {
      status: needsPermission ? "needs_permission" : unavailable ? "unavailable" : "error",
      error: needsPermission
        ? "Meta app cannot read other Instagram accounts (business_discovery permission #10)."
        : message,
      posts: [],
    };
  }
  const media = body?.business_discovery?.media?.data || [];
  const posts = media
    .map((item) => ({
      published_at: item.timestamp || null,
      likes: Number(item.like_count || 0) || 0,
      comments: Number(item.comments_count || 0) || 0,
      media_type: item.media_type || null,
      caption: String(item.caption || "").trim(),
      external_post_id: String(item.id || item.timestamp || "").trim(),
    }))
    .filter((item) => item.published_at);
  return { status: posts.length ? "ok" : "unavailable", error: posts.length ? null : "No public dated posts.", posts };
}
/*__STUDIO_WORKER_END:studioFetchInstagramBusinessDiscovery__*/

export async function studioFetchYoutubePublicUploads(handle, creds) {
  const forHandle = studioSanitizeYtHandle(handle);
  if (!forHandle) return { status: "error", error: "YouTube handle is empty.", posts: [] };
  if (!creds.youtubeKey) return { status: "needs_key", error: "Add YOUTUBE_API_KEY to Pipeline Settings or the Worker to time public YouTube uploads.", posts: [] };
  const key = encodeURIComponent(creds.youtubeKey);
  const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${encodeURIComponent(forHandle)}&key=${key}`;
  let response = await fetch(channelUrl);
  let body = await response.json().catch(() => ({}));
  if (!body?.items?.length) {
    response = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forUsername=${encodeURIComponent(forHandle)}&key=${key}`);
    body = await response.json().catch(() => ({}));
  }
  const uploads = body?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) {
    return { status: "unavailable", error: studioTruncateInsightError(body?.error || { message: "YouTube channel was not found." }), posts: [] };
  }
  const itemsResponse = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(uploads)}&maxResults=20&key=${key}`);
  const itemsBody = await itemsResponse.json().catch(() => ({}));
  const items = itemsBody?.items || [];
  const ids = items
    .map((item) => item?.snippet?.resourceId?.videoId)
    .filter(Boolean)
    .slice(0, 20);
  if (!ids.length) return { status: "unavailable", error: "No public uploads.", posts: [] };
  const statsResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.map(encodeURIComponent).join(",")}&key=${key}`);
  const statsBody = await statsResponse.json().catch(() => ({}));
  const posts = (statsBody?.items || [])
    .map((item) => ({
      published_at: item?.snippet?.publishedAt || null,
      views: Number(item?.statistics?.viewCount || 0) || 0,
      likes: Number(item?.statistics?.likeCount || 0) || 0,
      comments: Number(item?.statistics?.commentCount || 0) || 0,
      caption: String(item?.snippet?.title || "").trim(),
      external_post_id: String(item?.id || item?.snippet?.publishedAt || "").trim(),
    }))
    .filter((item) => item.published_at);
  return { status: posts.length ? "ok" : "unavailable", error: posts.length ? null : "No dated public uploads.", posts };
}
/*__STUDIO_WORKER_END:studioFetchYoutubePublicUploads__*/

export async function studioStampYoutubeCreatorDiscoveryRun(env, ranAt = new Date().toISOString()) {
  await studioUpsertSetting(
    env,
    STUDIO_YOUTUBE_CREATOR_DISCOVERY_LAST_SETTING,
    ranAt,
    "Last YouTube search.list creator discovery attempt (cron throttled to once per day)."
  ).catch((error) => console.warn("youtube discovery last-run stamp failed", error));
  return ranAt;
}
/*__STUDIO_WORKER_END:studioStampYoutubeCreatorDiscoveryRun__*/

export async function studioDiscoverYoutubeChicagoCreators(env, options = {}) {
  const theme = studioNormalizeSimilarProfile(options.theme || "chicago");
  const limit = Math.max(1, Math.min(12, Number(options.limit) || 8));
  const scheduled = options.scheduled === true;
  const force = options.force === true;
  if (scheduled && !force) {
    const lastRow = await studioSettingsByName(env, STUDIO_YOUTUBE_CREATOR_DISCOVERY_LAST_SETTING).catch(() => null);
    const lastRaw = String(lastRow?.fields?.Setting_Value || lastRow?.fields?.Value || "").trim();
    const lastMs = Date.parse(lastRaw);
    if (Number.isFinite(lastMs) && Date.now() - lastMs < STUDIO_YOUTUBE_DISCOVERY_CRON_TTL_MS) {
      return {
        ok: true,
        status: "throttled",
        added: [],
        discovered: [],
        skipped: true,
        message: `YouTube discovery skipped (cron throttle). Last run ${new Date(lastMs).toISOString()}; next after ${STUDIO_YOUTUBE_DISCOVERY_CRON_TTL_MS / 3600000}h to protect Data API quota.`,
      };
    }
  }
  const settings = await studioActivePipelineSettings(env, ["YOUTUBE_API_KEY"]).catch(() => ({}));
  const youtubeKey = settings.YOUTUBE_API_KEY || env.YOUTUBE_API_KEY;
  if (!youtubeKey) {
    return { ok: false, status: "needs_key", added: [], discovered: [], message: `Add YOUTUBE_API_KEY to discover ${studioSimilarProfileLabel(theme)} creators on YouTube.` };
  }
  const queries = STUDIO_INSIGHTS_DISCOVERY_QUERIES[theme] || STUDIO_INSIGHTS_DISCOVERY_QUERIES.chicago;
  const query = queries[Math.floor(Math.random() * queries.length)];
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=${encodeURIComponent(String(limit))}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(youtubeKey)}`;
  const response = await fetch(searchUrl);
  const body = await response.json().catch(() => ({}));
  // Stamp after every search.list attempt so cron does not retry every 2 minutes on quota/error.
  const ranAt = await studioStampYoutubeCreatorDiscoveryRun(env);
  if (!response.ok || body?.error) {
    return {
      ok: false,
      status: "error",
      added: [],
      discovered: [],
      ran_at: ranAt,
      message: studioTruncateInsightError(body?.error || { message: `YouTube discovery HTTP ${response.status}` }),
    };
  }
  const discovered = [];
  for (const item of body?.items || []) {
    const channelId = String(item?.snippet?.channelId || item?.id?.channelId || "").trim();
    const title = String(item?.snippet?.channelTitle || item?.snippet?.title || "").trim();
    let handle = title.replace(/\s+/g, "");
    if (channelId) {
      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(youtubeKey)}`
      );
      const channelBody = await channelResponse.json().catch(() => ({}));
      const customUrl = String(channelBody?.items?.[0]?.snippet?.customUrl || "").trim().replace(/^@/, "");
      if (customUrl) handle = customUrl;
    }
    handle = studioSanitizeYtHandle(handle);
    if (!handle) continue;
    discovered.push({
      platform: "youtube",
      handle,
      source: "discovery",
      profile: theme,
      title: title || handle,
      query,
    });
  }
  const accounts = await studioEnsureSimilarWatchlist(env);
  const existing = new Set(accounts.map((row) => `${row.profile || "chicago"}:${studioSimilarAccountKey(row.platform, row.handle)}`));
  const added = [];
  for (const row of discovered) {
    const key = `${theme}:${studioSimilarAccountKey(row.platform, row.handle)}`;
    if (existing.has(key)) continue;
    accounts.push({
      platform: row.platform,
      handle: row.handle,
      source: "discovery",
      profile: theme,
    });
    existing.add(key);
    added.push(row);
  }
  if (added.length) {
    await studioUpsertSetting(
      env,
      STUDIO_SIMILAR_WATCHLIST_SETTING,
      JSON.stringify(accounts),
      `${studioSimilarProfileLabel(theme)} similar-account watchlist including YouTube discovery results.`
    );
  }
  const city = studioSimilarProfileLabel(theme);
  return {
    ok: true,
    status: "ok",
    query,
    discovered,
    added,
    ran_at: ranAt,
    message: added.length
      ? `Discovered and added ${added.length} YouTube ${city} creator(s) from “${query}”.`
      : discovered.length
        ? `Found ${discovered.length} YouTube channel(s) for “${query}”; all were already on the ${city} watchlist.`
        : `No YouTube channels found for “${query}”.`,
  };
}
/*__STUDIO_WORKER_END:studioDiscoverYoutubeChicagoCreators__*/

export async function postInsightsDiscover(request, env, url, authorization) {
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const theme = payload.profile || payload.theme
    ? studioNormalizeSimilarProfile(payload.profile || payload.theme)
    : await studioResolveSimilarTimesTheme(env, url, authorization);
  const result = await studioDiscoverYoutubeChicagoCreators(env, {
    theme,
    limit: payload.limit,
    force: payload.force !== false,
  });
  return respond(request, env, { ok: result.ok !== false, ...result, profile: theme });
}
/*__STUDIO_WORKER_END:postInsightsDiscover__*/

export function engagementThemeContextRecord(theme) {
  const city = studioSimilarProfileLabel(theme);
  const label =
    theme === "chicago" ? "ChicagoShining"
      : theme === "la" ? "Los Angeles Shining"
        : theme === "nyc" ? "New York Shining"
          : theme === "miami" ? "Miami Shining"
            : `${city} Shining`;
  return { id: `engagement-theme-${theme}`, fields: { Profile_Name: label, Market_Name: city, Brand_Name: label } };
}
/*__STUDIO_WORKER_END:engagementThemeContextRecord__*/

export function engagementDeps(theme = "chicago") {
  const contextRecord = engagementThemeContextRecord(studioNormalizeSimilarProfile(theme));
  return {
    studioSettingsByName,
    studioUpsertSetting,
    studioActivePipelineSettings: (env, names) => studioActivePipelineSettings(env, names, contextRecord),
    airtableFetch,
    listRecords,
  };
}
/*__STUDIO_WORKER_END:engagementDeps__*/

export async function resolveEngagementProfile(env, url, authorization, payload = {}) {
  const hint = payload.profile || payload.theme || url.searchParams.get("profile") || url.searchParams.get("theme");
  if (hint) return studioNormalizeSimilarProfile(hint);
  try {
    const working = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
    return studioThemeForProfile(working) || "chicago";
  } catch {
    return "chicago";
  }
}
/*__STUDIO_WORKER_END:resolveEngagementProfile__*/

export async function getEngagementSettings(request, env, url, authorization) {
  const profile = await resolveEngagementProfile(env, url, authorization);
  const settings = await studioLoadEngagementSettings(env, profile, engagementDeps(profile));
  return respond(request, env, { ok: true, profile, settings, capabilities: capabilityMatrixResponse().matrix });
}
/*__STUDIO_WORKER_END:getEngagementSettings__*/

export async function putEngagementSettings(request, env, url, authorization) {
  let payload = {};
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const profile = await resolveEngagementProfile(env, url, authorization, payload);
  const settings = await studioSaveEngagementSettings(env, { ...payload, profile }, engagementDeps(profile));
  return respond(request, env, { ok: true, profile, settings });
}
/*__STUDIO_WORKER_END:putEngagementSettings__*/

export async function postEngagementDiscover(request, env, url, authorization) {
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const profile = await resolveEngagementProfile(env, url, authorization, payload);
  const result = await studioRunEngagementDiscovery(env, {
    profile,
    force: payload.force !== false,
    scheduled: false,
  }, engagementDeps(profile));
  return respond(request, env, result);
}
/*__STUDIO_WORKER_END:postEngagementDiscover__*/

export async function getEngagementRecommendations(request, env, url, authorization) {
  const profile = await resolveEngagementProfile(env, url, authorization);
  const result = await studioListEngagementRecommendations(env, {
    profile,
    platform: url.searchParams.get("platform") || "",
    status: url.searchParams.get("status") || "",
  }, engagementDeps(profile));
  return respond(request, env, result);
}
/*__STUDIO_WORKER_END:getEngagementRecommendations__*/

export async function postEngagementAction(request, env, url, authorization) {
  let payload = {};
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const profile = await resolveEngagementProfile(env, url, authorization, payload);
  try {
    const result = await studioApplyEngagementAction(env, { ...payload, profile }, engagementDeps(profile));
    return respond(request, env, result, 200);
  } catch (error) {
    throw new HttpError(400, error?.message || String(error));
  }
}
/*__STUDIO_WORKER_END:postEngagementAction__*/

export async function getEngagementInsights(request, env, url, authorization) {
  const profile = url.searchParams.get("profile")
    ? studioNormalizeSimilarProfile(url.searchParams.get("profile"))
    : await resolveEngagementProfile(env, url, authorization);
  const result = await studioEngagementInsights(env, profile, engagementDeps(profile));
  return respond(request, env, result);
}
/*__STUDIO_WORKER_END:getEngagementInsights__*/

export async function studioSweepSimilarAccountTimes(env, options = {}) {
  const limit = Math.max(1, Math.min(10, Number(options.limit) || 3));
  const force = Boolean(options.force);
  const requestedPlatform = String(options.platform || "").trim().toLowerCase();
  const requestedHandle = String(options.handle || "").trim().replace(/^@/, "").toLowerCase();
  const accounts = await studioEnsureSimilarWatchlist(env);
  const manual = Boolean(options.force || requestedPlatform || requestedHandle);
  const timed = (manual
    ? studioManualSweepWatchlistAccounts(accounts, options.theme || null, requestedPlatform)
    : studioTimedWatchlistAccounts(accounts, options.theme || null)
  ).filter((row) => {
    if (requestedPlatform && row.platform !== requestedPlatform) return false;
    if (requestedHandle && String(row.handle || "").toLowerCase() !== requestedHandle) return false;
    return true;
  });
  const cache = await studioLoadSimilarAccountStatusCache(env);
  const stale = timed.filter((row) => force || studioSimilarAccountStale(cache.accounts[studioSimilarAccountKey(row.platform, row.handle)]));
  const sweepRank = (row) => {
    const entry = cache.accounts[studioSimilarAccountKey(row.platform, row.handle)];
    const status = studioNormalizeSimilarStatus(entry);
    const unseen = !entry?.fetched_at || status === "pending";
    if (row.platform === "youtube" && unseen) return 0;
    if (row.platform === "youtube") return 1;
    if (unseen) return 2;
    if (status === "needs_permission") return 4;
    return 3;
  };
  stale.sort((a, b) => sweepRank(a) - sweepRank(b));
  const batch = stale.slice(0, limit);
  if (!batch.length) {
    const account = timed[0]
      ? cache.accounts[studioSimilarAccountKey(timed[0].platform, timed[0].handle)] || null
      : null;
    return { scanned: 0, updated: 0, remaining: 0, cache, account, accounts, posts: [] };
  }
  const settings = await studioActivePipelineSettings(env, [
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_GRAPH_API_VERSION",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID",
    "YOUTUBE_API_KEY",
  ]).catch(() => ({}));
  const creds = {
    token: settings.FACEBOOK_PAGE_ACCESS_TOKEN || env.FACEBOOK_PAGE_ACCESS_TOKEN,
    version: String(settings.FACEBOOK_GRAPH_API_VERSION || "v25.0").replace(/^\/+|\/+$/g, ""),
    igUserId: settings.INSTAGRAM_BUSINESS_ACCOUNT_ID || env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
    youtubeKey: settings.YOUTUBE_API_KEY || env.YOUTUBE_API_KEY,
  };
  let updated = 0;
  let lastPosts = [];
  for (const account of batch) {
    const key = studioSimilarAccountKey(account.platform, account.handle);
    try {
      const fetched = account.platform === "instagram"
        ? await studioFetchInstagramBusinessDiscovery(account.handle, creds)
        : await studioFetchYoutubePublicUploads(account.handle, creds);
      const fetchedAt = new Date().toISOString();
      if (fetched.status === "ok") {
        lastPosts = fetched.posts || [];
        await studioInsightsUpsertObservations(env, (fetched.posts || []).map((post) => ({
          ...post,
          platform: account.platform,
          handle: account.handle,
          profile: account.profile || "chicago",
          source: "similar_account",
        })), {
          platform: account.platform,
          handle: account.handle,
          profile: account.profile || "chicago",
          source: "similar_account",
          fetched_at: fetchedAt,
        });
        updated += 1;
      }
      cache.accounts[key] = {
        platform: account.platform,
        handle: account.handle,
        profile: account.profile || "chicago",
        status: fetched.status,
        error: fetched.error || null,
        fetched_at: fetchedAt,
        posts: Array.isArray(fetched.posts) ? fetched.posts.length : Number(cache.accounts[key]?.posts || 0) || 0,
      };
    } catch (error) {
      cache.accounts[key] = {
        platform: account.platform,
        handle: account.handle,
        profile: account.profile || "chicago",
        status: "error",
        error: studioTruncateInsightError(error),
        fetched_at: new Date().toISOString(),
        posts: Number(cache.accounts[key]?.posts || 0) || 0,
      };
    }
  }
  cache.as_of = new Date().toISOString();
  try {
    await studioSaveSimilarAccountStatusCache(env, cache);
  } catch (error) {
    console.warn("similar-account status cache save failed", error);
  }
  if (!options.skipRecompute) {
    try {
      await studioRecomputeInsightsLearned(env, { profile: options.theme || "chicago" });
    } catch (error) {
      console.warn("insights learned recompute after similar sweep failed", error);
    }
  }
  const selected = batch.length === 1 ? batch[0] : null;
  const account = selected
    ? cache.accounts[studioSimilarAccountKey(selected.platform, selected.handle)] || null
    : null;
  return {
    scanned: batch.length,
    updated,
    remaining: Math.max(0, stale.length - batch.length),
    cache,
    account,
    accounts,
    posts: batch.length === 1 ? lastPosts : [],
  };
}
/*__STUDIO_WORKER_END:studioSweepSimilarAccountTimes__*/

export async function restoreParentContentItemFromStudioUmbrella(env, parentContentItem) {
  const cleaned = String(f(parentContentItem,"Internal_Notes")||"")
    .split("\n").filter(line => !line.includes("Studio master/umbrella Content Item.")).join("\n").trim();
  return airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentContentItem.id, {
    method:"PATCH", body:JSON.stringify({fields:{Do_Not_Produce:false,Internal_Notes:cleaned||null},typecast:false})
  });
}
/*__STUDIO_WORKER_END:restoreParentContentItemFromStudioUmbrella__*/

export async function markParentContentItemAsStudioUmbrella(env, parentContentItem, outputCount) {
  const currentNotes = String(f(parentContentItem, "Internal_Notes") || "").trim();
  const marker = `Studio master/umbrella Content Item. ${outputCount} output-specific work item(s) own production execution.`;

  return airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentContentItem.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Do_Not_Produce: true,
        Internal_Notes: [currentNotes, marker].filter(Boolean).join("\n"),
      },
      typecast: false,
    }),
  });
}
/*__STUDIO_WORKER_END:markParentContentItemAsStudioUmbrella__*/

export function finishedDestinationKeyFromPlatformOutput(row) {
  return canonicalFinishedDestinationKey(
    f(row, "Platform"),
    f(row, "Studio_Output_Type") || f(row, "Output_Type") || f(row, "Platform_Output_Type")
  );
}
/*__STUDIO_WORKER_END:finishedDestinationKeyFromPlatformOutput__*/

export async function listExistingFinishedPlatformOutputs(env, requestRecord, parent) {
  const requestId = String(requestRecord?.id || "").replace(/'/g, "\\'");
  const contentId = String(parent?.id || "").replace(/"/g, '\\"');
  const contentNumber = String(f(parent || {}, "Content_ID") || "").replace(/'/g, "\\'");
  const clauses = [];
  if (requestId) clauses.push(`FIND('${requestId}', {Studio_Output_Directives_JSON}&"")`);
  if (contentNumber) clauses.push(`FIND(',${contentNumber},', ',' & ARRAYJOIN({Content_Item}) & ',')`);
  if (contentId) clauses.push(`FIND("${contentId}", ARRAYJOIN({Content_Item})&"")`);
  if (!clauses.length) return [];
  return listRecords(env, STUDIO_PLATFORM_OUTPUT_TABLE, {
    limit: 50,
    filterFormula: clauses.length > 1 ? `OR(${clauses.join(",")})` : clauses[0],
  }).catch(() => []);
}
/*__STUDIO_WORKER_END:listExistingFinishedPlatformOutputs__*/

export function keepFinishedOutputRows(rows, record = null) {
  const horizontal = record ? isHorizontalFinishedAspect(studioRequestNotesText(record)) : false;
  const allowedKeys = horizontal ? FINISHED_HORIZONTAL_KEYS : FINISHED_DESTINATION_KEYS;
  const expected = record ? azExpectedOutputCount(studioRequestNotesText(record)) : AZ_EXPECTED_OUTPUT_COUNT;
  const seen = new Set();
  const keepers = [];
  for (const row of rows || []) {
    const key = canonicalFinishedDestinationKey(f(row, "Platform"), f(row, "Output_Type"), { horizontal });
    if (!allowedKeys.includes(key) || seen.has(key)) continue;
    seen.add(key);
    keepers.push(row);
    if (keepers.length >= expected) break;
  }
  return keepers;
}
/*__STUDIO_WORKER_END:keepFinishedOutputRows__*/

export async function fanoutProductionRequestOutputsToContentItems(env, requestRecord, parentContentItemId, options = {}) {
  const onlyMissing = Boolean(options.onlyMissing);
  const limit = Number(options.limit);
  const finishedVideo = studioFinishedOriginKind(requestRecord) === "finished-video";
  if (finishedVideo) {
    await item4CollapseDuplicatePlanOutputs(
      env,
      await outputRowsForProductionRequest(env, requestRecord.id, { includeInactive: true }),
      { finishedVideo: true }
    );
  }
  const batchLimit = Number.isFinite(limit) && limit > 0
    ? Math.floor(limit)
    : (finishedVideo ? azExpectedOutputCount(studioRequestNotesText(requestRecord)) : null);
  let outputRows=(await outputRowsForProductionRequest(env,requestRecord.id)).filter(row=>Boolean(f(row,"Enabled")));
  if (finishedVideo) outputRows = keepFinishedOutputRows(outputRows, requestRecord);
  if(!outputRows.length) return {enabled_output_count:0,routed_count:0,blocked_count:0,remaining:0,work_items:[],single_parent_mode:true};
  const candidates = onlyMissing
    ? outputRows.filter((row) => !arrayOrEmpty(f(row, "Platform_Output")).some((id) => /^rec[A-Za-z0-9]+$/.test(String(id || ""))))
    : outputRows;
  const batch = batchLimit == null ? candidates : candidates.slice(0, batchLimit);
  const remaining = Math.max(0, candidates.length - batch.length);
  if (!batch.length) {
    return {
      enabled_output_count: outputRows.length,
      routed_count: 0,
      blocked_count: 0,
      remaining: 0,
      work_items: [],
      single_parent_mode: true,
      already: true,
    };
  }
  let parent=await airtableFetch(env,env.AIRTABLE_CONTENT_TABLE_ID,parentContentItemId);
  const filledAssets = item4FillAiOverlayFallbacks(item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), []), requestRecord, parent);
  if (JSON.stringify(filledAssets) !== JSON.stringify(item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), []))) {
    requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Studio_Master_Assets_JSON: JSON.stringify(filledAssets) }, typecast: false }),
    });
  }
  parent=await restoreParentContentItemFromStudioUmbrella(env,parent);
  const profileDefaults=await productionProfileDefaultsForParentContentItem(env,parent);
  const workItems=[]; let routed=0,blocked=0;
  for(const outputRow of batch){
    const effective=await buildOutputWorkItemEffective(env,outputRow,requestRecord,parent,profileDefaults);
    const route=effective.route;
    if(effective.issues.length){
      blocked++;
      await airtableFetch(env,PRODUCTION_REQUEST_OUTPUT_TABLE,outputRow.id,{method:"PATCH",body:JSON.stringify({fields:{Content_Item:[parent.id],Pipeline_Family:route?.pipeline_family||null,Pipeline_Route_Status:"Blocked",Pipeline_Route_Notes:effective.issues.join(" "),Routed_At:null,Updated_At:new Date().toISOString()},typecast:false})});
      workItems.push({production_request_output_record_id:outputRow.id,routed:false,issues:effective.issues});
      continue;
    }
    const sourcePackage=item4StudioSourcePackageForOutput(requestRecord,outputRow,effective,parent);
    const seed=platformOutputSeedFields(parent,requestRecord,outputRow,effective,sourcePackage);
    const existingLinks=arrayOrEmpty(f(outputRow,"Platform_Output"));
    let poId=existingLinks.find(id=>/^rec[A-Za-z0-9]+$/.test(String(id||"")))||null;
    if(!poId && !onlyMissing){
      const proId=String(f(outputRow,"Production_Request_Output_ID")||"").replace(/'/g,"\\'");
      if(proId){
        const found=await listRecords(env,STUDIO_PLATFORM_OUTPUT_TABLE,{limit:1,filterFormula:`FIND(',${proId},', ',' & ARRAYJOIN({Production_Request_Output}) & ',') > 0`});
        poId=found?.[0]?.id||null;
      }
    }
    if(!poId && finishedVideo){
      const destKey=canonicalFinishedDestinationKey(f(outputRow,"Platform"), f(outputRow,"Output_Type"));
      const existingPos=await listExistingFinishedPlatformOutputs(env, requestRecord, parent);
      const match=existingPos.find((row) => finishedDestinationKeyFromPlatformOutput(row) === destKey);
      if(match) poId=match.id;
      else {
        const liveKeys=new Set(existingPos.map(finishedDestinationKeyFromPlatformOutput).filter(Boolean));
        if(!shouldCreateFinishedOutput(liveKeys, destKey)){
          blocked++;
          await airtableFetch(env,PRODUCTION_REQUEST_OUTPUT_TABLE,outputRow.id,{method:"PATCH",body:JSON.stringify({fields:{Content_Item:[parent.id],Pipeline_Family:route?.pipeline_family||null,Pipeline_Route_Status:"Blocked",Pipeline_Route_Notes:"Finished-video hard cap: six destinations already exist.",Routed_At:null,Updated_At:new Date().toISOString()},typecast:false})});
          workItems.push({production_request_output_record_id:outputRow.id,routed:false,issues:["finished_video_hardcap"]});
          continue;
        }
      }
    }
    let po;
    let createdNewPlatformOutput=false;
    if(poId) po=await airtableFetch(env,STUDIO_PLATFORM_OUTPUT_TABLE,poId,{method:"PATCH",body:JSON.stringify({fields:seed,typecast:true})});
    else {
      po=await airtableFetch(env,STUDIO_PLATFORM_OUTPUT_TABLE,"",{method:"POST",body:JSON.stringify({fields:seed,typecast:true})});
      createdNewPlatformOutput=true;
    }
    if(createdNewPlatformOutput){
      try {
        const reconciled=await item4ReconcileCreatedPlatformOutput(env,outputRow,po);
        if(reconciled?.keeper?.id) po=reconciled.keeper;
      } catch(error) {
        console.warn("Platform Output fanout post-create reconciliation failed", outputRow.id, error);
      }
    }
    const now=new Date().toISOString();
    await airtableFetch(env,PRODUCTION_REQUEST_OUTPUT_TABLE,outputRow.id,{method:"PATCH",body:JSON.stringify({fields:{Content_Item:[parent.id],Platform_Output:[po.id],Pipeline_Family:route.pipeline_family,Pipeline_Route_Status:"Routed",Pipeline_Route_Notes:`Single-parent route: ${route.pipeline_family}; Platform Output ${po.id}; Content Item ${parent.id}.`,Routed_At:now,Updated_At:now},typecast:false})});
    routed++;
    workItems.push({production_request_output_record_id:outputRow.id,platform:effective.platform,output_type:effective.output_type,content_item_record_id:parent.id,platform_output_record_id:po.id,routed:true});
  }
  if (studioIsFinishedPassthrough(requestRecord) && parent?.id && routed > 0) {
    await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parent.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Include_Thumbnail: "Yes",
          Include_Voiceover: "No",
          Voiceover_Status: "Not Needed",
          Thumbnail_Status: studioAiThumbnailUrl(f(parent, "Thumbnail_URL")) ? "Generated" : "Ready",
          Thumbnail_Prompt: item4StudioThumbnailPrompt(requestRecord, parent),
        },
        typecast: true,
      }),
    }).catch(() => null);
  }
  return {enabled_output_count:outputRows.length,routed_count:routed,blocked_count:blocked,remaining,work_items:workItems,single_parent_mode:true};
}
/*__STUDIO_WORKER_END:fanoutProductionRequestOutputsToContentItems__*/

export async function completeProductionRequestPromotionSideEffects(env, requestRecordId, requestRecord, contentItemId, options = {}) {
  let current = requestRecord;
  let directiveBridge = options.directiveBridge || null;
  let outputFanout = options.outputFanout || null;

  if (!options.skipRouting) {
    directiveBridge = await syncProductionRequestDirectivesToContentItem(
      env,
      current,
      contentItemId
    );

    outputFanout = await fanoutProductionRequestOutputsToContentItems(
      env,
      current,
      contentItemId,
      studioFinishedOriginKind(current) === "finished-video"
        ? { onlyMissing: true, limit: azExpectedOutputCount(studioRequestNotesText(current)) }
        : {}
    );
  }

  if (options.routingOnly) {
    return { requestRecord: current, directiveBridge, outputFanout };
  }

  // Seed and theme the AI slots first. P2 speaks the script that arming stamps,
  // so the themed narration has to exist before either of them runs or the
  // voiceover can only ever describe the creator-supplied photos.
  if (String(f(current, "Master_Content_Type") || "").trim() === "Carousel"
    || item4EffectivePhotoCount(current) > item4AssetManifest(current).length) {
    try {
      const seeded = await item4EnsureAiSourceMasters(env, current, { id: contentItemId });
      if (seeded?.requestRecord) current = seeded.requestRecord;
    } catch (error) {
      console.warn("Studio AI source seed failed", error);
    }
  }

  // Seeding authors the caption whenever it themed AI slots. An all-manual photo set
  // never reaches that path, so it needs its own caption before arming stamps one.
  try {
    await item4EnsureStudioPostCaption(env, current, contentItemId);
  } catch (error) {
    console.warn("Studio post caption ensure failed", error);
  }

  try {
    await armStudioParentForP3Handoff(env, contentItemId, current);
  } catch (error) {
    console.warn("P3 parent arm failed", error);
  }
  const armed = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId).catch(() => null);
  const finished = studioIsFinishedPassthrough(current);
  const needVoiceover = !finished
    && String(f(armed || {}, "Include_Voiceover") || "").trim() === "Yes"
    && !String(f(armed || {}, "Voiceover_URL") || "").trim();
  const needAiThumb = studioNeedsAiThumbnail(armed, current);
  try {
    if (needVoiceover || needAiThumb) await pulseStudioP2Handoff(env, contentItemId, current);
    if (!finished) await pulseStudioP3Handoff(env, contentItemId, current);
  } catch (error) {
    console.warn("Studio promote media pulse failed", error);
  }
  if (Number(outputFanout?.routed_count || 0) > 0) {
    try { await enqueueStudioProductionJob(env, requestRecordId); } catch (error) {
      console.warn("Studio produce enqueue after output fanout failed", requestRecordId, error);
    }
  }
  return { requestRecord: current, directiveBridge, outputFanout };
}
/*__STUDIO_WORKER_END:completeProductionRequestPromotionSideEffects__*/

export function assertProductionRequestFanoutComplete(outputFanout) {
  const enabled = Number(outputFanout?.enabled_output_count || 0);
  const routed = Number(outputFanout?.routed_count || 0);
  const blocked = Number(outputFanout?.blocked_count || 0);
  const remaining = Number(outputFanout?.remaining || 0);
  const already = outputFanout?.already === true;

  if (enabled < 1) {
    throw new HttpError(409, "Promotion created the Content Item, but there are no enabled outputs to route into the Platform Pipeline.");
  }
  if (blocked > 0 || remaining > 0 || (routed < 1 && !already)) {
    throw new HttpError(
      409,
      `Promotion created the Content Item, but Platform Output routing is incomplete (${routed}/${enabled} routed, ${blocked} blocked, ${remaining} remaining). The request is not complete and can be retried safely.`
    );
  }
}
/*__STUDIO_WORKER_END:assertProductionRequestFanoutComplete__*/

export async function cancelSiblingProductionRequestsForIdea(env, ideaRecord, winnerRequestId) {
  const ideaLinks = Array.isArray(f(ideaRecord, "Production Requests"))
    ? f(ideaRecord, "Production Requests")
    : [];
  const siblingIds = [...new Set(
    ideaLinks.map((value) => String(value || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id) && id !== winnerRequestId)
  )];
  if (!siblingIds.length) return [];
  const loaded = await Promise.allSettled(siblingIds.map((id) => airtableFetch(env, PRODUCTION_REQUEST_TABLE, id)));
  const rows = loaded
    .filter((entry) => entry.status === "fulfilled")
    .map((entry) => ({
      id: entry.value.id,
      status: String(f(entry.value, "Request_Status") || "").trim(),
    }));
  const toCancel = siblingProductionRequestsToCancel(winnerRequestId, rows);
  for (const siblingId of toCancel) {
    await updateProductionRequestPromotionState(env, siblingId, {
      Request_Status: "Cancelled",
      Active: false,
    }).catch((error) => {
      console.warn("Studio promote sibling cancel failed", winnerRequestId, siblingId, error);
    });
  }
  return toCancel;
}
/*__STUDIO_WORKER_END:cancelSiblingProductionRequestsForIdea__*/

export async function finalizeProductionRequestPromotion(env, requestRecordId, ideaRecord, ctx = null) {
  const contentItemId = linkedContentItemRecordId(ideaRecord);

  // A promoted Idea has one authoritative Production Request owner. A stale
  // request may finish later, but it must not overwrite directives or fan out
  // another complete set of Platform Outputs for the same Content Item.
  if (contentItemId) {
    const parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId).catch(() => null);
    const incumbentRequestId = promotedContentOwner(
      requestRecordId,
      parent ? f(parent, "Production_Request") : []
    );
    if (incumbentRequestId) {
      let incumbentStatus = "Unknown";
      try {
        const incumbent = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, incumbentRequestId);
        incumbentStatus = String(f(incumbent, "Request_Status") || "").trim() || "Unknown";
      } catch {}

      if (incumbentStatus !== "Cancelled") {
        const staleRows = await outputRowsForProductionRequest(
          env,
          requestRecordId,
          { includeInactive: true }
        ).catch(() => []);
        for (const row of staleRows) {
          await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, row.id, {
            method: "PATCH",
            body: JSON.stringify({
              fields: {
                Enabled: false,
                Active: false,
                Output_Status: "Cancelled",
                Pipeline_Route_Status: "Blocked",
                Pipeline_Route_Notes: `Superseded before fanout by authoritative Production Request ${incumbentRequestId} for Content Item ${contentItemId}.`,
              },
              typecast: true,
            }),
          }).catch(() => null);
        }
        const requestRecord = await updateProductionRequestPromotionState(env, requestRecordId, {
          Request_Status: "Cancelled",
          Active: false,
          Promoted_Content_Item: [],
        });
        return {
          requestRecord,
          contentItemId,
          directiveBridge: null,
          outputFanout: {
            enabled_output_count: staleRows.length,
            routed_count: 0,
            blocked_count: staleRows.length,
            remaining: 0,
            superseded_by_request_id: incumbentRequestId,
          },
          supersededByRequestId: incumbentRequestId,
        };
      }
    }
  }

  let requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecordId);
  let directiveBridge = null;
  let outputFanout = null;

  if (contentItemId) {
    // Platform Pipeline routing is authoritative for a successful promotion.
    // Do it synchronously before stamping Promoted so waitUntil cannot create a
    // false-success state where the Content Item exists but has zero outputs.
    const routing = await completeProductionRequestPromotionSideEffects(
      env,
      requestRecordId,
      requestRecord,
      contentItemId,
      { routingOnly: true }
    );
    requestRecord = routing.requestRecord || requestRecord;
    directiveBridge = routing.directiveBridge;
    outputFanout = routing.outputFanout;
    assertProductionRequestFanoutComplete(outputFanout);
  }

  const revisionOpen = productionRequestRevisionOpen(requestRecord);
  const fields = {
    Request_Status: "Promoted",
    Active: true,
    Submitted_At: null,
  };
  if (revisionOpen) fields.Production_Notes = stripFactoryRevisionNote(f(requestRecord, "Production_Notes")) || null;
  if (contentItemId) fields.Promoted_Content_Item = [contentItemId];
  requestRecord = await updateProductionRequestPromotionState(env, requestRecordId, fields);

  if (contentItemId) {
    const continuation = completeProductionRequestPromotionSideEffects(
      env,
      requestRecordId,
      requestRecord,
      contentItemId,
      {
        skipRouting: true,
        directiveBridge,
        outputFanout,
      }
    ).catch((error) => {
      console.warn("Studio promote post-routing side-effects deferred", requestRecordId, error);
      return null;
    });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(continuation);
    else await continuation;
  }

  // Duplicate Draft/Ready/Submitted PRs for the same Idea must not stay Approvals-ready
  // after one wins (Buckingham Fountain Mist: cancelled duplicate still showed Approve).
  const cancelledSiblings = await cancelSiblingProductionRequestsForIdea(
    env,
    ideaRecord,
    requestRecordId
  ).catch((error) => {
    console.warn("Studio promote sibling sweep failed", requestRecordId, error);
    return [];
  });

  return {
    requestRecord,
    contentItemId,
    directiveBridge,
    outputFanout,
    cancelled_sibling_request_ids: cancelledSiblings,
  };
}
/*__STUDIO_WORKER_END:finalizeProductionRequestPromotion__*/

export function item4StaleMediaRunClears(parent) {
  const clears = {};
  if (String(f(parent, "Thumbnail_Status") || "").trim() === "Ready"
    && !String(f(parent, "Thumbnail_URL") || "").trim()
    && String(f(parent, "Thumbnail_Google_Drive_File_ID") || "").trim()) {
    clears.Thumbnail_Google_Drive_File_ID = null;
  }
  return clears;
}
/*__STUDIO_WORKER_END:item4StaleMediaRunClears__*/

export async function armStudioParentForP3Handoff(env, contentItemId, requestRecord) {
  const parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId);
  const requestedCaption = String(f(requestRecord, "Requested_Caption") || "").trim();
  const caption = requestedCaption
    || String(f(parent, "Caption") || "").trim()
    || String(f(parent, "Hook") || "").trim()
    || String(f(parent, "Content_Title") || "").trim();
  const finished = studioIsFinishedPassthrough(requestRecord);
  const voiceoverMode = String(f(requestRecord, "Voiceover_Mode") || f(parent, "Include_Voiceover") || "Yes").trim();
  const musicMode = String(f(requestRecord, "Background_Music_Mode") || f(parent, "Include_Background_Music") || "Yes").trim();
  const thumbnailMode = String(f(requestRecord, "Thumbnail_Mode") || f(parent, "Include_Thumbnail") || "Yes").trim();
  const voiceoverUrl = String(f(parent, "Voiceover_URL") || "").trim();
  const existingThumb = String(f(parent, "Thumbnail_URL") || "").trim();
  const existingAiThumb = existingThumb && !item4UrlIsStudioPhotoCrop(existingThumb) ? existingThumb : "";
  const frameUrl = item4CoverStillUrl(requestRecord);
  const thumbSource = item4ThumbnailSource(thumbnailMode);
  const wantThumb = thumbSource !== "none";
  const wantAiThumb = thumbSource === "ai" || finished;
  const wantFrameThumb = !finished && thumbSource === "frame";
  const wantVoiceover = !finished && item4StudioDirectiveYes(voiceoverMode);
  const script = String(f(requestRecord, "Requested_Script") || f(parent, "Voiceover_Script") || f(parent, "Requested_Script") || caption || "").trim();
  const waitingForVoiceover = wantVoiceover && !voiceoverUrl;
  const fields = {
    Caption: caption || null,
    Include_Voiceover: wantVoiceover ? "Yes" : "No",
    Include_Background_Music: finished ? "No" : (item4StudioDirectiveYes(musicMode) ? "Yes" : "No"),
    Carousel_Image_Mode: String(f(requestRecord, "Carousel_Image_Mode") || "").trim() || null,
    Carousel_Slide_Count: f(requestRecord, "Carousel_Slide_Count_Exact") ?? null,
    Include_Thumbnail: (finished || wantThumb) ? "Yes" : "No",
  };
  if (wantAiThumb) {
    fields.Thumbnail_Prompt = item4StudioThumbnailPrompt(requestRecord, parent);
    if (existingAiThumb) {
      fields.Thumbnail_URL = existingAiThumb;
      fields.Thumbnail_Status = "Generated";
    } else {
      fields.Thumbnail_URL = null;
      fields.Thumbnail_Status = "Ready";
      fields.Thumbnail_Google_Drive_File_ID = null;
    }
  } else if (wantFrameThumb) {
    fields.Thumbnail_URL = frameUrl || existingThumb || null;
    fields.Thumbnail_Status = (frameUrl || existingThumb) ? "Not Needed" : "Ready";
  } else {
    fields.Thumbnail_URL = null;
    fields.Thumbnail_Status = "Not Needed";
  }
  if (waitingForVoiceover) {
    fields.Content_Status = "Ready for Voiceover";
    fields.Voiceover_Status = "Ready";
    fields.Voiceover_Script = script || null;
    if (script) fields.Script_Status = "Generated";
  } else {
    fields.Voiceover_Status = wantVoiceover
      ? (String(f(parent, "Voiceover_Status") || "").trim() || "Generated")
      : "Not Needed";
    fields.Content_Status = "Thumbnail Ready";
  }
  return airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:armStudioParentForP3Handoff__*/

export async function pulseStudioP2Handoff(env, contentItemId, requestRecord) {
  const testRunId = String(f(requestRecord, "Test_Run_ID") || "").trim();
  // Every P2 pulse funnels through here, including continuation retries that never re-arm the
  // parent, so this is the one place guaranteed to run before P2 does paid work it cannot commit.
  try {
    const parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId);
    const clears = item4StaleMediaRunClears(parent);
    if (Object.keys(clears).length) {
      await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId, {
        method: "PATCH",
        body: JSON.stringify({ fields: clears, typecast: true }),
      });
      console.log("P2 pulse cleared superseded media run", contentItemId, Object.keys(clears).join(","));
    }
  } catch (error) {
    console.warn("P2 pulse could not clear superseded media run", error);
  }
  try {
    const result = await item4PulseP2Python(env, contentItemId, requestRecord);
    return { ok: true, status: 200, backend: "python", result };
  } catch (error) {
    console.warn("P2 python pulse failed", error);
    return { ok: false, status: error instanceof HttpError ? error.status : 500, backend: "python" };
  }
}
/*__STUDIO_WORKER_END:pulseStudioP2Handoff__*/

export async function pulseStudioP3Handoff(env, contentItemId, requestRecord) {
  const testRunId = String(f(requestRecord, "Test_Run_ID") || "").trim();
  try {
    const result = await item4PulseP3Python(env, contentItemId, requestRecord);
    return { ok: true, status: 200, backend: "python", result };
  } catch (error) {
    console.warn("P3 python pulse failed", error);
    return { ok: false, status: error instanceof HttpError ? error.status : 500, backend: "python" };
  }
}
/*__STUDIO_WORKER_END:pulseStudioP3Handoff__*/

export async function pulseStudioC2Handoff(env, contentItemId, requestRecord = null) {
  if (!/^rec[A-Za-z0-9]+$/.test(String(contentItemId || ""))) return { ok: false, skipped: "no_parent" };
  const testRunId = String(f(requestRecord || {}, "Test_Run_ID") || "").trim();
  const body = {
    source: "studio-ai-fill",
    target: "C2",
    content_record_id: contentItemId,
    content_item_record_id: contentItemId,
    test_run_id: testRunId,
    requested_at: new Date().toISOString(),
  };
  const { response, payload } = await item4PulsePipelineStage(env, "c2", {
    ...body,
    extra: { ...(body.extra || {}), background: true, trigger_c3: false },
  }, "C2");
  if (!response.ok) {
    console.warn("C2 studio AI pulse failed", response.status, String(payload?.message || "").slice(0, 300));
    return { ok: false, status: response.status };
  }
  return { ok: true, status: response.status, backend: "python", background: true };
}
/*__STUDIO_WORKER_END:pulseStudioC2Handoff__*/

export async function promoteProductionRequestViaI3I4(request, env, url, authorization, ctx = null) {
  // Keep the write contract consistent even though the saved request itself is
  // the authoritative payload.
  let promotionPayload = {};
  try { promotionPayload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const requestRecordId = productionRequestPromotionRecordIdFromPath(url);
  let requestRecord = await loadAuthorizedProductionRequest(env, requestRecordId, authorization);
  const revisionOpen = productionRequestRevisionOpen(requestRecord);
  const revisionApprove = promotionPayload?.revision_approve === true;
  if (revisionOpen && !revisionApprove) {
    throw new HttpError(409, "This content is open for Factory revision. Make your changes in Production, then click Approve.");
  }
  const requestStatus = revisionOpen ? "Draft" : String(f(requestRecord, "Request_Status") || "").trim();
  const proposalNotes = String(f(requestRecord, "Production_Notes") || "");
  if (/scripted-short=proposal/i.test(proposalNotes)) {
    const proposalTimeline = timedScriptFromNotes(proposalNotes);
    if (!proposalTimeline) {
      throw new HttpError(409, "The scripted short timeline is missing. Save the scenes before Approve.");
    }
    const unassigned = scriptedShortUnassignedMessage(proposalTimeline);
    if (unassigned) throw new HttpError(409, unassigned);
  }

  const ideaLinks = Array.isArray(f(requestRecord, "Idea_Candidate")) ? f(requestRecord, "Idea_Candidate") : [];
  if (ideaLinks.length !== 1) {
    throw new HttpError(409, "Production Request must be linked to exactly one Idea Candidate before promotion");
  }

  const ideaRecordId = ideaLinks[0];
  let ideaRecord = await loadAuthorizedIdea(env, ideaRecordId, authorization);

  const hasItem4Source = Array.isArray(item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), [])) &&
    item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), []).length > 0;

  if (hasItem4Source) {
    // 37-still Bridge drafts already have Ready crops. Re-running plan
    // relink + variant upsert on Approve exhausts the Worker and returns 500.
    if (!autonomousPlanVariantsReady(requestRecord)) {
      try {
        requestRecord = await item4ReconcileEnabledPlanOutputs(env, requestRecord);
        requestRecord = await ensureItem4VariantsReadyForPromotion(
          env,
          requestRecordId,
          requestRecord,
          authorization,
          ctx
        );
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(409, error?.message || "Could not finish platform media before approve. Wait a moment and try again.");
      }
    }
    const bridgePreflight = await item4SourceToProductionBridgePreflight(env, requestRecord, ideaRecord);
    if (!bridgePreflight.ready) {
      throw new HttpError(
        409,
        `Source-to-production bridge validation failed: ${bridgePreflight.issues.join(" ")}`
      );
    }
  }

  if (!String(f(ideaRecord, "Idea_Summary") || "").trim()) {
    const summaryBackfill = await ensureProductionRequestIdeaSummary(env, ideaRecord, requestRecord);
    ideaRecord = summaryBackfill.record;
  }

  if (promotionCompleted(ideaRecord)) {
    const finalized = await finalizeProductionRequestPromotion(env, requestRecordId, ideaRecord, ctx);
    if (finalized.supersededByRequestId) {
      return respond(request, env, {
        ok: true,
        promoted: false,
        superseded: true,
        promotion_state: "cancelled",
        handoff: "I3-to-I4",
        production_request: mapProductionRequest(finalized.requestRecord),
        idea: mapIdea(ideaRecord),
        content_item_record_id: finalized.contentItemId,
        output_fanout: finalized.outputFanout,
        superseded_by_request_id: finalized.supersededByRequestId,
        message: "This Production Request was cancelled because the promoted Content Item already belongs to another active Production Request. Open Pipeline / Open Review for that piece — do not Approve this cancelled duplicate.",
      });
    }
    return respond(request, env, {
      ok: true,
      promoted: true,
      already_promoted: requestStatus === "Promoted",
      promotion_state: "promoted",
      handoff: "I3-to-I4",
      production_request: mapProductionRequest(finalized.requestRecord),
      idea: mapIdea(ideaRecord),
      content_item_record_id: finalized.contentItemId,
      output_fanout: finalized.outputFanout,
      message: "Production Request is linked to I3/I4 and routed to Platform Outputs under the single promoted Content Item",
    });
  }

  if (requestStatus === "Promoted") {
    throw new HttpError(409, "Production Request is marked Promoted but the linked Idea Candidate has no promotion result; reconcile Airtable before retrying");
  }

  if (requestStatus === "Submitted") {
    // Manual path: wait briefly, do not resend I3. Autonomous path: I4 is not a
    // human Production Approve stop — wait long enough to attach the Content Item.
    const autonomous = skipsProductionApprove(f(requestRecord, "Production_Notes"));
    ideaRecord = await waitForPromotionResult(env, ideaRecordId, autonomous ? 24 : 3, autonomous ? 1250 : 750);
    if (promotionCompleted(ideaRecord)) {
      const finalized = await finalizeProductionRequestPromotion(env, requestRecordId, ideaRecord, ctx);
    if (finalized.supersededByRequestId) {
      return respond(request, env, {
        ok: true,
        promoted: false,
        superseded: true,
        promotion_state: "cancelled",
        handoff: "I3-to-I4",
        production_request: mapProductionRequest(finalized.requestRecord),
        idea: mapIdea(ideaRecord),
        content_item_record_id: finalized.contentItemId,
        output_fanout: finalized.outputFanout,
        superseded_by_request_id: finalized.supersededByRequestId,
        message: "This Production Request was cancelled because the promoted Content Item already belongs to another active Production Request. Open Pipeline / Open Review for that piece — do not Approve this cancelled duplicate.",
      });
    }
      return respond(request, env, {
        ok: true,
        promoted: true,
        already_promoted: false,
        promotion_state: "promoted",
        handoff: "I3-to-I4",
        production_request: mapProductionRequest(finalized.requestRecord),
        idea: mapIdea(ideaRecord),
        content_item_record_id: finalized.contentItemId,
        output_fanout: finalized.outputFanout,
        message: "I3/I4 promotion completed and requested outputs were routed to Platform Outputs under the single promoted Content Item",
      });
    }

    return respond(request, env, {
      ok: true,
      promoted: false,
      promotion_state: "processing",
      handoff: "I3-to-I4",
      production_request: mapProductionRequest(requestRecord),
      idea: mapIdea(ideaRecord),
      message: "Promotion is still processing. No duplicate I3 request was sent.",
    }, 202);
  }

  if (!["Draft", "Ready"].includes(requestStatus)) {
    throw new HttpError(409, `Production Request is ${requestStatus || "not ready"} and cannot be submitted`);
  }

  const ideaStatus = String(f(ideaRecord, "Candidate_Status") || "").trim();
  if (ideaStatus === "On Hold") throw new HttpError(409, "Restore the linked Idea Candidate before promotion");
  if (ideaStatus === "Promoted") throw new HttpError(409, "Idea is marked Promoted but its Content Item link is missing; reconcile Airtable before retrying");

  const title = String(f(ideaRecord, "Candidate_Title") || "").trim();
  const summary = String(f(ideaRecord, "Idea_Summary") || "").trim();
  if (!title) throw new HttpError(409, "Idea title is required before promotion");
  if (!summary) throw new HttpError(409, "Idea summary is required by the existing I4 promotion gate");

  const input = promotionInputFromProductionRequest(requestRecord);

  // Mark Submitted before firing I3. This creates an idempotency fence in Studio.
  const submittedAt = new Date().toISOString();
  requestRecord = await updateProductionRequestPromotionState(env, requestRecordId, {
    Request_Status: "Submitted",
    Submitted_At: submittedAt,
  });

  try {
    const webhook = promotionWebhookUrl(env, ideaRecordId, input);
    await fetchPromotionHandoff(env, webhook);
  } catch (error) {
    // The I3 request itself did not complete. Return to Draft so the user can
    // safely correct/retry rather than leaving a false Submitted state.
    try {
      requestRecord = await updateProductionRequestPromotionState(env, requestRecordId, {
        Request_Status: "Draft",
        Submitted_At: null,
      });
    } catch {}
    throw error;
  }

  const autonomousSubmit = skipsProductionApprove(f(requestRecord, "Production_Notes"));
  ideaRecord = await waitForPromotionResult(
    env,
    ideaRecordId,
    autonomousSubmit ? 24 : 3,
    autonomousSubmit ? 1250 : 750
  );
  if (promotionCompleted(ideaRecord)) {
    const finalized = await finalizeProductionRequestPromotion(env, requestRecordId, ideaRecord, ctx);
    if (finalized.supersededByRequestId) {
      return respond(request, env, {
        ok: true,
        promoted: false,
        superseded: true,
        promotion_state: "cancelled",
        handoff: "I3-to-I4",
        production_request: mapProductionRequest(finalized.requestRecord),
        idea: mapIdea(ideaRecord),
        content_item_record_id: finalized.contentItemId,
        output_fanout: finalized.outputFanout,
        superseded_by_request_id: finalized.supersededByRequestId,
        message: "This Production Request was cancelled because the promoted Content Item already belongs to another active Production Request. Open Pipeline / Open Review for that piece — do not Approve this cancelled duplicate.",
      });
    }
    return respond(request, env, {
      ok: true,
      promoted: true,
      already_promoted: false,
      promotion_state: "promoted",
      handoff: "I3-to-I4",
      production_request: mapProductionRequest(finalized.requestRecord),
      idea: mapIdea(ideaRecord),
      content_item_record_id: finalized.contentItemId,
      output_fanout: finalized.outputFanout,
      message: "Production Request approved through I3/I4 and requested outputs were routed to Platform Outputs under the single promoted Content Item",
    });
  }

  return respond(request, env, {
    ok: true,
    promoted: false,
    promotion_state: "processing",
    handoff: "I3-to-I4",
    production_request: mapProductionRequest(requestRecord),
    idea: mapIdea(ideaRecord),
    message: "I3 accepted the Production Request; I4 promotion is still processing",
  }, 202);
}

/*__STUDIO_WORKER_END:promoteProductionRequestViaI3I4__*/

export function cleanPromotionPayload(payload) {
  const contentType = String(payload?.content_type || "").trim();
  if (!STUDIO_PROMOTION_CONTENT_TYPES.has(contentType)) {
    throw new HttpError(400, "Choose a valid production content type before promotion");
  }

  const rawPlatforms = Array.isArray(payload?.platforms) ? payload.platforms : [];
  const platforms = [...new Set(rawPlatforms.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!platforms.length) throw new HttpError(400, "Choose at least one production platform before promotion");
  const unsupported = platforms.filter((platform) => !STUDIO_PROMOTION_PLATFORMS.has(platform));
  if (unsupported.length) {
    throw new HttpError(400, `Phase 2A promotion does not yet support: ${unsupported.join(", ")}`);
  }

  const tri = (value, label) => {
    const normalized = String(value || "Use Profile Default").trim() || "Use Profile Default";
    if (!STUDIO_TRISTATE.has(normalized)) throw new HttpError(400, `${label} must be Use Profile Default, Yes, or No`);
    return normalized;
  };

  const includeVoiceover = tri(payload?.include_voiceover, "Voiceover");
  const includeBackgroundMusic = tri(payload?.include_background_music, "Background music");
  const includeThumbnail = tri(payload?.include_thumbnail, "Thumbnail");
  const productionNotes = String(payload?.production_notes || "").trim();
  if (productionNotes.length > 10000) throw new HttpError(400, "Production notes must be 10000 characters or fewer");

  let videoDuration = Number(payload?.video_duration ?? 30);
  if (!Number.isFinite(videoDuration)) videoDuration = 30;
  videoDuration = Math.trunc(videoDuration);
  if (videoDuration < 5 || videoDuration > 600) throw new HttpError(400, "Video duration must be between 5 and 600 seconds");

  const clipRaw = payload?.video_clip_count;
  let videoClipCount = null;
  if (clipRaw !== null && clipRaw !== undefined && String(clipRaw).trim() !== "" && String(clipRaw).trim().toLowerCase() !== "auto") {
    const clipNumber = Number(clipRaw);
    if (!Number.isFinite(clipNumber) || clipNumber < 1 || clipNumber > 60) {
      throw new HttpError(400, "Video clip count must be Auto or between 1 and 60");
    }
    videoClipCount = Math.trunc(clipNumber);
  }

  let voiceoverTailSeconds = Number(payload?.voiceover_tail_seconds ?? 2);
  if (!Number.isFinite(voiceoverTailSeconds)) voiceoverTailSeconds = 2;
  if (voiceoverTailSeconds < 0 || voiceoverTailSeconds > 10) {
    throw new HttpError(400, "Voiceover tail must be between 0 and 10 seconds");
  }
  voiceoverTailSeconds = Math.round(voiceoverTailSeconds * 2) / 2;

  let carouselSlideCount = Number(payload?.carousel_slide_count ?? 5);
  if (!Number.isFinite(carouselSlideCount)) carouselSlideCount = 5;
  carouselSlideCount = Math.trunc(carouselSlideCount);
  if (carouselSlideCount < 1) {
    throw new HttpError(400, "Carousel slide count must be at least 1");
  }

  const carouselImageModeRaw = String(payload?.carousel_image_mode || "Make AI Generated").trim();
  const carouselImageMode = carouselImageModeRaw === "Wait for matching photos"
    ? "Manual Upload"
    : carouselImageModeRaw;
  if (!["Make AI Generated", "Manual Upload"].includes(carouselImageMode)) {
    throw new HttpError(400, "Carousel image mode must be Make AI Generated, Manual Upload, or Wait for matching photos");
  }

  let carouselSlideCountMode = String(payload?.carousel_slide_count_mode || "").trim();
  if (carouselImageModeRaw === "Wait for matching photos" && !carouselSlideCountMode) {
    carouselSlideCountMode = "Target range";
  }
  if (!carouselSlideCountMode) carouselSlideCountMode = "Exact";
  if (!["Exact", "Target range"].includes(carouselSlideCountMode)) {
    throw new HttpError(400, "Carousel slide count mode must be Exact or Target range");
  }

  let carouselSlideCountMin = nullableInt(payload?.carousel_slide_count_min, 1, Number.MAX_SAFE_INTEGER, "Minimum photo count");
  let carouselSlideCountMax = nullableInt(payload?.carousel_slide_count_max, 1, Number.MAX_SAFE_INTEGER, "Maximum photo count");
  if (carouselSlideCountMode === "Target range") {
    if (carouselSlideCountMin === null || carouselSlideCountMax === null) {
      throw new HttpError(400, "Enter both minimum and maximum photo counts");
    }
    if (carouselSlideCountMin > carouselSlideCountMax) {
      throw new HttpError(400, "Minimum photo count cannot exceed maximum");
    }
  } else {
    carouselSlideCountMin = null;
    carouselSlideCountMax = null;
  }

  return {
    content_type: contentType,
    platforms,
    include_voiceover: includeVoiceover,
    include_background_music: includeBackgroundMusic,
    include_thumbnail: includeThumbnail,
    video_duration: videoDuration,
    video_clip_count: videoClipCount,
    voiceover_tail_seconds: voiceoverTailSeconds,
    carousel_slide_count: carouselSlideCount,
    carousel_slide_count_mode: carouselSlideCountMode,
    carousel_slide_count_min: carouselSlideCountMin,
    carousel_slide_count_max: carouselSlideCountMax,
    carousel_image_mode: carouselImageMode,
    production_notes: productionNotes,
  };
}
/*__STUDIO_WORKER_END:cleanPromotionPayload__*/

export function promotionWebhookUrl(env, recordId, input) {
  const configured = String(env.I3_DECISION_WEBHOOK_URL || "").trim();
  if (!configured) throw new HttpError(503, "I3 promotion handoff is not configured");

  let webhook;
  try { webhook = new URL(configured); } catch { throw new HttpError(500, "I3 promotion handoff URL is invalid"); }
  if (webhook.protocol !== "https:") throw new HttpError(500, "I3 promotion handoff URL must use HTTPS");

  webhook.search = "";
  webhook.searchParams.set("record_id", recordId);
  webhook.searchParams.set("production_content_type", input.content_type);
  webhook.searchParams.set("production_platforms", input.platforms.join(","));
  webhook.searchParams.set("include_voiceover", input.include_voiceover);
  webhook.searchParams.set("include_background_music", input.include_background_music);
  webhook.searchParams.set("include_thumbnail", input.include_thumbnail);
  webhook.searchParams.set("voiceover_tail_seconds", String(input.voiceover_tail_seconds));
  const handoffNotes = productionNotesForPromotionHandoff(input.production_notes);
  if (handoffNotes) webhook.searchParams.set("production_config_notes", handoffNotes);

  if (input.content_type === "Carousel") {
    // Reuse the production I3 carousel-submit branch. I3 owns the Airtable
    // approval/config writes and then daisy-chains to I4.
    webhook.searchParams.set("action", "carousel_submit");
    webhook.searchParams.set("carousel_image_mode", input.carousel_image_mode);
    webhook.searchParams.set("carousel_slide_count", String(input.carousel_slide_count));
  } else if (input.content_type === "Vertical Short Video" || input.content_type === "Longform Video") {
    // Reuse the production I3 video-submit branch so duration, clip count and
    // voiceover tail are written by the same proven scenario used by email review.
    webhook.searchParams.set("action", "video_submit");
    webhook.searchParams.set("video_duration", String(input.video_duration));
    webhook.searchParams.set("video_clip_count", input.video_clip_count === null ? "Auto" : String(input.video_clip_count));
    webhook.searchParams.set("video_asset_mode", "Make/Render");
    webhook.searchParams.set("platform_label", input.platforms.join(","));
  } else {
    // Reuse I3's approved-with-production-params branch. Supplying a canonical
    // content type deliberately avoids the quick-approval branch.
    webhook.searchParams.set("action", "studio_promote");
    webhook.searchParams.set("decision", "approved");
    if (input.content_type === "Carousel") {
      webhook.searchParams.set("carousel_image_mode", input.carousel_image_mode);
      webhook.searchParams.set("carousel_slide_count", String(input.carousel_slide_count));
    }
  }

  return webhook;
}
/*__STUDIO_WORKER_END:promotionWebhookUrl__*/

export async function fetchPromotionHandoff(env, webhook) {
  const extra = Object.fromEntries(webhook.searchParams.entries());
  extra.trigger_i4 = true;
  const { response, payload } = await item4PulsePipelineStage(env, "i3", { extra }, "I3");
  if (!response.ok || payload?.status === "error") {
    throw new HttpError(502, payload?.message || `Python I3 returned HTTP ${response.status}`);
  }
}
/*__STUDIO_WORKER_END:fetchPromotionHandoff__*/

export function promotionCompleted(record) {
  const links = Array.isArray(f(record, "Content Items")) ? f(record, "Content Items") : [];
  const promotedId = String(f(record, "Promoted_Content_Record_ID") || "").trim();
  return Boolean(promotedId || links.length);
}
/*__STUDIO_WORKER_END:promotionCompleted__*/

export async function waitForPromotionResult(env, recordId, attempts = 8, delayMs = 750) {
  let record = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId);
  if (promotionCompleted(record)) return record;

  for (let attempt = 1; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    record = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId);
    if (promotionCompleted(record)) return record;
  }
  return record;
}
/*__STUDIO_WORKER_END:waitForPromotionResult__*/

export async function promoteIdeaViaI3I4(request, env, url, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const recordId = ideaRecordIdFromPath(url);
  const record = await loadAuthorizedIdea(env, recordId, authorization);

  if (promotionCompleted(record)) {
    return respond(request, env, {
      ok: true,
      promoted: true,
      already_promoted: true,
      promotion_state: "promoted",
      handoff: "I3-to-I4",
      record: mapIdea(record),
    });
  }

  const status = String(f(record, "Candidate_Status") || "").trim();
  if (status === "On Hold") throw new HttpError(409, "Restore this idea before approving and promoting it");
  if (status === "Promoted") throw new HttpError(409, "Idea is marked Promoted but its Content Item link is missing; reconcile the Airtable record before retrying");

  const title = String(f(record, "Candidate_Title") || "").trim();
  const summary = String(f(record, "Idea_Summary") || "").trim();
  if (!title) throw new HttpError(409, "Idea title is required before promotion");

  const input = cleanPromotionPayload(payload);
  const waitingAlready = String(f(record, "Studio_Photo_Wait_Status") || "").trim() === "Waiting";
  if (ideaPhotoWaitApplies(input) || waitingAlready || payload?.photo_wait === true) {
    if (!summary) {
      input.production_notes = [input.production_notes, `Summary pending: ${title}`].filter(Boolean).join("\n");
    }
    return approveIdeaAndWaitForPhotos(request, env, record, input, authorization);
  }
  if (!summary) throw new HttpError(409, "Idea summary is required by the existing I4 promotion gate; add a summary before promoting");
  const webhook = promotionWebhookUrl(env, recordId, input);
  try {
    await fetchPromotionHandoff(env, webhook);
  } catch (error) {
    // I3/I4 can complete the side effects even when the interactive bridge returns
    // a transient 5xx. Reconcile against Airtable before surfacing a failure so
    // Studio does not leave a successfully promoted idea looking stuck.
    const reconciled = await waitForPromotionResult(env, recordId);
    if (promotionCompleted(reconciled)) {
      return respond(request, env, {
        ok: true,
        promoted: true,
        already_promoted: false,
        promotion_state: "promoted",
        recovered_after_handoff_error: true,
        handoff: "I3-to-I4-reconciled",
        message: "Promotion completed after a transient I3/I4 handoff error",
        record: mapIdea(reconciled),
      });
    }
    throw error;
  }

  const updated = await waitForPromotionResult(env, recordId);
  const promoted = promotionCompleted(updated);

  return respond(request, env, {
    ok: true,
    promoted,
    already_promoted: false,
    promotion_state: promoted ? "promoted" : "processing",
    handoff: "I3-to-I4",
    message: promoted
      ? "Idea approved through I3 and promoted through I4"
      : "Approval was accepted by I3; I4 promotion is still processing",
    record: mapIdea(updated),
  }, promoted ? 200 : 202);
}
/*__STUDIO_WORKER_END:promoteIdeaViaI3I4__*/

export async function ideaPhotoListeningSessionRoute(request, env, url, authorization) {
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const action = String(payload?.action || "").trim().toLowerCase();
  if (!["pause", "resume", "stop"].includes(action)) throw new HttpError(400, "action must be pause, resume, or stop");
  const recordId = ideaRecordIdFromPath(url);
  let idea = await loadAuthorizedIdea(env, recordId, authorization);
  if (action === "stop") {
    const draft = await existingDraftForIdea(env, recordId, authorization);
    if (draft && !productionPhotoWaitAutoOff(f(draft, "Production_Notes"))) {
      await item4UpdateRequestState(env, draft.id, {
        Production_Notes: withProductionPhotoWaitManual(f(draft, "Production_Notes")),
      });
    }
  }
  const waitStatus = String(f(idea, "Studio_Photo_Wait_Status") || "").trim();
  const notes = String(f(idea, "Production_Config_Notes") || "");
  if (promotionCompleted(idea) || waitStatus === "Not Needed") {
    return respond(request, env, {
      ok: true,
      paused: false,
      permanent: true,
      record: mapIdea(idea),
    });
  }

  const nextNotes = action === "pause"
    ? withIdeaManagePhotoPause(notes, { ttlMinutes: 30 })
    : withoutIdeaManagePhotoPause(notes);
  const stopping = action === "stop";
  if (stopping || nextNotes !== (notes || null)) {
    idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          ...(stopping ? { Studio_Photo_Wait_Status: "Not Needed" } : {}),
          Production_Config_Notes: nextNotes,
        },
        typecast: true,
      }),
    });
  }
  return respond(request, env, {
    ok: true,
    paused: action === "pause" && ideaManagePhotoPauseActive(f(idea, "Production_Config_Notes")),
    permanent: stopping || String(f(idea, "Studio_Photo_Wait_Status") || "").trim() === "Not Needed",
    record: mapIdea(idea),
  });
}
/*__STUDIO_WORKER_END:ideaPhotoListeningSessionRoute__*/

export async function lockIdeaPhotoListeningForProduction(env, idea, requestRecord) {
  // Critical path for Open Production: one small Idea update only.
  // The exact selected-photo transfer can involve watermarking, Drive and Airtable
  // calls, so it must never hold the browser request open.
  const configNotes = withoutIdeaManagePhotoPause(f(idea, "Production_Config_Notes"));
  const currentWaitStatus = String(f(idea, "Studio_Photo_Wait_Status") || "").trim();
  let updatedIdea = idea;
  if (currentWaitStatus !== "Not Needed" || configNotes !== (f(idea, "Production_Config_Notes") || null)) {
    try {
      updatedIdea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Studio_Photo_Wait_Status: "Not Needed",
            Production_Config_Notes: configNotes,
          },
          typecast: true,
        }),
      });
    } catch (error) {
      // Opening the Production workspace is more important than this bookkeeping
      // write. Background hydration retries the lock and records the permanent
      // request-side ez-photo-wait=off guard.
      console.warn("idea photo-listener lock deferred after Production open", idea.id, error);
    }
  }
  return { idea: updatedIdea, request: requestRecord };
}
/*__STUDIO_WORKER_END:lockIdeaPhotoListeningForProduction__*/

export function ideaSelectedPhotoIds(idea) {
  return Array.isArray(f(idea, "Studio_Matched_Media_Assets"))
    ? [...new Set(f(idea, "Studio_Matched_Media_Assets")
      .map((id) => String(id || "").trim())
      .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))]
    : [];
}
/*__STUDIO_WORKER_END:ideaSelectedPhotoIds__*/

export function sameIdeaPhotoWaitSelection(requestRecord, selectedIds) {
  const existingWaitIds = item4AssetManifest(requestRecord)
    .filter((asset) => String(asset?.source || "") === "idea_photo_wait")
    .map((asset) => String(asset?.media_asset_record_id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
  const expected = new Set(selectedIds || []);
  return existingWaitIds.length === expected.size && existingWaitIds.every((id) => expected.has(id));
}
/*__STUDIO_WORKER_END:sameIdeaPhotoWaitSelection__*/

export async function hydrateIdeaProductionAfterOpen(env, idea, requestRecord, authorization, preferredProfileId = null) {
  let currentIdea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id).catch(() => idea);
  let record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id).catch(() => requestRecord);

  // Retry the lightweight lock if the foreground request could not persist it.
  const locked = await lockIdeaPhotoListeningForProduction(env, currentIdea, record);
  currentIdea = locked.idea;
  record = locked.request;

  // Permanent request-side guard prevents any photo-wait cron from restoring or
  // reshuffling the operator's chosen set after Production has opened.
  const requestNotes = String(f(record, "Production_Notes") || "").trim();
  const lockedNotes = withProductionPhotoWaitManual(requestNotes);
  if (lockedNotes !== requestNotes) {
    try {
      record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, record.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: { Production_Notes: lockedNotes },
          typecast: true,
        }),
      });
    } catch (error) {
      console.warn("production photo-wait request lock deferred", record.id, error);
    }
  }

  // Transfer the exact set the operator sees in Manage Idea, but do it after the
  // workspace is already open. The comparison makes this safe to repeat.
  const selectedIds = ideaSelectedPhotoIds(currentIdea);
  if (!sameIdeaPhotoWaitSelection(record, selectedIds)) {
    try {
      const attached = await applyLibraryAssetsToProductionRequest(
        env,
        record,
        selectedIds,
        { replaceWaitAssets: true }
      );
      record = attached.record;
    } catch (error) {
      console.warn("background selected-photo handoff to Production failed", currentIdea.id, error);
    }
  }

  // Voice/profile healing is also nonessential to the initial screen open.
  try {
    record = await maybeHealDraftNarrationVoice(
      env,
      record,
      currentIdea,
      authorization,
      preferredProfileId
    );
  } catch (error) {
    console.warn("background production narration voice heal failed", record.id, error);
  }
  return record;
}
/*__STUDIO_WORKER_END:hydrateIdeaProductionAfterOpen__*/

export function queueIdeaProductionAfterOpen(ctx, env, idea, requestRecord, authorization, preferredProfileId = null) {
  const task = hydrateIdeaProductionAfterOpen(
    env,
    idea,
    requestRecord,
    authorization,
    preferredProfileId
  ).catch((error) => {
    console.warn("background Production-open hydration failed", requestRecord?.id || idea?.id, error);
  });
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(task);
  } else {
    // All HTTP entry points pass ctx; keep a nonblocking fallback for direct tests
    // and internal callers rather than regressing Open Production into a wait.
    void task;
  }
}
/*__STUDIO_WORKER_END:queueIdeaProductionAfterOpen__*/

export async function getAuthorizedIdeaRoute(request, env, url, authorization) {
  const recordId = ideaRecordIdFromPath(url);
  const record = await loadAuthorizedIdea(env, recordId, authorization);
  return respond(request, env, { ok: true, record: mapIdea(record) });
}
/*__STUDIO_WORKER_END:getAuthorizedIdeaRoute__*/

export async function approveIdeaAndWaitForPhotos(request, env, record, input, authorization) {
  const waitingAlready = String(f(record, "Studio_Photo_Wait_Status") || "").trim() === "Waiting";
  const rangeWait = String(input.carousel_slide_count_mode || "").trim() === "Target range"
    && String(input.carousel_image_mode || "").trim() !== "Make AI Generated";
  if (!ideaPhotoWaitApplies(input) && !waitingAlready && !rangeWait) {
    throw new HttpError(400, "Photo wait requires a target range and real photos, not AI-generated slides");
  }
  const now = new Date().toISOString();
  const fields = {
    Candidate_Status: "Approved",
    Approved_At: f(record, "Approved_At") || now,
    Production_Content_Type: input.content_type,
    Production_Target_Platforms: input.platforms,
    Production_Include_Voiceover: input.include_voiceover,
    Production_Include_Background_Music: input.include_background_music,
    Production_Include_Thumbnail: input.include_thumbnail,
    Production_Carousel_Image_Mode: "Manual Upload",
    Production_Carousel_Slide_Count_Mode: "Target range",
    Production_Carousel_Slide_Count_Min: input.carousel_slide_count_min,
    Production_Carousel_Slide_Count_Max: input.carousel_slide_count_max,
    Production_Carousel_Slide_Count: input.carousel_slide_count_max,
    Production_Config_Notes: input.production_notes || null,
    Voiceover_Tail_Seconds: input.voiceover_tail_seconds,
    Studio_Photo_Wait_Status: String(f(record, "Studio_Photo_Wait_Status") || "").trim() === "Ready"
      ? "Ready"
      : "Waiting",
  };
  if (!String(f(record, "Idea_Summary") || "").trim()) {
    fields.Idea_Summary = String(f(record, "Candidate_Title") || "Photo wait").trim();
  }
  const updatedIdea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, record.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
  const draft = await existingDraftForIdea(env, record.id, authorization)
    || await createDraftForIdea(env, updatedIdea, authorization);
  // Do not scan the full library on this request. Matching runs from cron / Match photos now.
  return respond(request, env, {
    ok: true,
    promoted: false,
    waiting: true,
    photo_wait: {
      action: "wait",
      reason: "deferred_scan",
      high_count: 0,
      selected: [],
    },
    promotion_state: "waiting_for_photos",
    handoff: "photo-wait",
    message: `Approved. Listening for at least ${input.carousel_slide_count_min} high-confidence photos in the Studio media library (will take up to ${input.carousel_slide_count_max}).`,
    record: mapIdea(updatedIdea),
    production_request: mapProductionRequest(draft),
  }, 202);
}
/*__STUDIO_WORKER_END:approveIdeaAndWaitForPhotos__*/

export function ideaPhotoWatchContentType(idea) {
  const configured = String(f(idea, "Production_Content_Type") || "").trim();
  if (IDEA_PHOTO_WAIT_TYPES.has(configured)) return configured;
  const suggested = arrayOrEmpty(f(idea, "Suggested_Format"))
    .map((value) => String(value || "").trim())
    .find((value) => IDEA_PHOTO_WAIT_TYPES.has(value));
  return suggested || "Carousel";
}
/*__STUDIO_WORKER_END:ideaPhotoWatchContentType__*/

export function ideaPhotoWatchRange(idea, contentType) {
  const storedMin = Number(f(idea, "Production_Carousel_Slide_Count_Min") || 0);
  const storedMax = Number(f(idea, "Production_Carousel_Slide_Count_Max") || 0);
  if (storedMin > 0 && storedMax >= storedMin) return { min: storedMin, max: storedMax };
  if (contentType === "Feed Post") return { min: 1, max: 4 };
  if (contentType === "Carousel") return { min: 5, max: 8 };
  return { min: 5, max: 10 };
}
/*__STUDIO_WORKER_END:ideaPhotoWatchRange__*/

export function ideaPhotoAutoListenContentType(idea) {
  // Generated media ideas listen only to Studio Media Assets already uploaded
  // by the user; this never accesses a device photo library or camera roll.
  // Story / Thread / Text / Flyer / Thumbnail map to Feed Post so I1 variety
  // still starts Listening for photos instead of staying Ready to produce.
  return ideaAutoListenContentType({
    productionContentType: f(idea, "Production_Content_Type"),
    suggestedFormats: arrayOrEmpty(f(idea, "Suggested_Format")),
  });
}
/*__STUDIO_WORKER_END:ideaPhotoAutoListenContentType__*/

export function ideaHasExplicitPhotoProductionConfig(idea) {
  return Boolean(
    String(f(idea, "Production_Content_Type") || "").trim()
    || String(f(idea, "Production_Carousel_Image_Mode") || "").trim()
    || String(f(idea, "Production_Carousel_Slide_Count_Mode") || "").trim()
    || Number(f(idea, "Production_Carousel_Slide_Count") || 0)
    || Number(f(idea, "Production_Carousel_Slide_Count_Min") || 0)
    || Number(f(idea, "Production_Carousel_Slide_Count_Max") || 0)
  );
}
/*__STUDIO_WORKER_END:ideaHasExplicitPhotoProductionConfig__*/

export async function autoListenOpenPhotoIdeas(env, { limit = 12 } = {}) {
  const candidates = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
    limit: Math.max(1, Number(limit) || 12),
    sortField: "Create_Date",
    sortDirection: "desc",
    filterFormula: "AND({Studio_Photo_Wait_Status}=BLANK(),{Promoted_Content_Record_ID}=BLANK(),OR({Candidate_Status}='Generated',{Candidate_Status}='Sent for Review'))",
  });

  const eligible = candidates.filter((idea) => !ideaHasExplicitPhotoProductionConfig(idea));
  if (!eligible.length) return { evaluated: candidates.length, started: 0, ready: 0 };

  const authorization = await resolveStudioCronAuthorization(env);
  const results = [];
  for (const idea of eligible) {
    try {
      const contentType = ideaPhotoAutoListenContentType(idea);
      const range = ideaPhotoWatchRange(idea, contentType);
      const updatedIdea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id, {
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
      const draft = await findDraftProductionRequestForIdea(env, idea.id)
        || await createDraftForIdea(env, updatedIdea, authorization);
      results.push(await evaluateAndMaybeAttachWaitingIdeaPhotos(env, updatedIdea, {
        authorization,
        force: false,
        productionRequest: draft,
      }));
    } catch (error) {
      console.warn("idea automatic photo listening failed", idea.id, error);
      results.push({ action: "error", idea_id: idea.id, error: error?.message || String(error) });
    }
  }
  return {
    evaluated: candidates.length,
    started: results.length,
    ready: results.filter((row) => row.action === "ready").length,
  };
}
/*__STUDIO_WORKER_END:autoListenOpenPhotoIdeas__*/

export async function watchIdeaPhotosRoute(request, env, url, authorization) {
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const recordId = ideaRecordIdFromPath(url);
  const idea = await loadAuthorizedIdea(env, recordId, authorization);
  if (promotionCompleted(idea)) throw new HttpError(409, "This idea is already in production");
  if (String(f(idea, "Candidate_Status") || "").trim() === "On Hold") {
    throw new HttpError(409, "Restore this idea before listening for photos");
  }

  const contentType = IDEA_PHOTO_WAIT_TYPES.has(String(payload?.content_type || "").trim())
    ? String(payload.content_type).trim()
    : ideaPhotoWatchContentType(idea);
  const defaults = ideaPhotoWatchRange(idea, contentType);
  const requestedMin = Number(payload?.min);
  const requestedMax = Number(payload?.max);
  const min = Number.isFinite(requestedMin) && requestedMin >= 1
    ? Math.trunc(requestedMin)
    : defaults.min;
  const maxCandidate = Number.isFinite(requestedMax) && requestedMax >= min
    ? Math.trunc(requestedMax)
    : defaults.max;
  const max = Math.max(min, maxCandidate);

  const fields = {
    Production_Content_Type: contentType,
    Production_Carousel_Image_Mode: "Manual Upload",
    Production_Carousel_Slide_Count_Mode: "Target range",
    Production_Carousel_Slide_Count_Min: min,
    Production_Carousel_Slide_Count_Max: max,
    Production_Carousel_Slide_Count: max,
    Studio_Photo_Wait_Status: "Waiting",
  };
  if (!String(f(idea, "Idea_Summary") || "").trim()) {
    fields.Idea_Summary = String(f(idea, "Candidate_Title") || "Photo-based idea").trim();
  }

  const updatedIdea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
  const draft = await existingDraftForIdea(env, updatedIdea.id, authorization)
    || await createDraftForIdea(env, updatedIdea, authorization);
  const result = await evaluateAndMaybeAttachWaitingIdeaPhotos(env, updatedIdea, {
    authorization,
    force: false,
    productionRequest: draft,
  });
  return respond(request, env, {
    ok: true,
    watching: result.action !== "ready",
    photo_wait: { ...result, min, max },
    record: mapIdea(result.idea || updatedIdea),
    production_request: result.action === "ready" && result.production_request
      ? mapProductionRequest(result.production_request)
      : null,
    message: result.action === "ready"
      ? "Matching photos are ready. Open Production to set rules and approve."
      : `Studio is listening for ${min}–${max} matching photos already in the Studio media library.`,
  }, result.action === "ready" ? 200 : 202);
}
/*__STUDIO_WORKER_END:watchIdeaPhotosRoute__*/

export async function matchIdeaPhotosRoute(request, env, url, authorization) {
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }
  const recordId = ideaRecordIdFromPath(url);
  const idea = await loadAuthorizedIdea(env, recordId, authorization);
  const waitStatus = String(f(idea, "Studio_Photo_Wait_Status") || "").trim();
  if (waitStatus !== "Waiting" && waitStatus !== "Ready") {
    throw new HttpError(409, "This idea is not listening for matching photos");
  }
  const result = await evaluateAndMaybeAttachWaitingIdeaPhotos(env, idea, {
    authorization,
    force: Boolean(payload?.force),
  });
  return respond(request, env, {
    ok: true,
    photo_wait: result,
    record: mapIdea(result.idea || idea),
    production_request: result.production_request ? mapProductionRequest(result.production_request) : null,
  });
}
/*__STUDIO_WORKER_END:matchIdeaPhotosRoute__*/

export function ideaTimedScriptCatalogRow(row) {
  const record = row?.record || row;
  const mimeType = String(f(record, "MIME_Type") || row?.media_type || row?.mime_type || "").trim().toLowerCase();
  const video = row?.media_kind === "video" || ideaLibraryIsEligibleVideo(record) || mimeType.startsWith("video/");
  return {
    id: row?.id || record?.id,
    name: String(f(record, "Asset Name") || row?.name || "").trim(),
    location: String(f(record, "Location") || row?.location || "").trim(),
    topic: String(f(record, "Topic") || row?.topic || "").trim(),
    description: String(f(record, "Asset_Description") || row?.description || "").trim().slice(0, 180),
    score: Number(row?.score || 0) || 0,
    confidence: String(row?.confidence || "none"),
    media_kind: video ? "video" : "photo",
    media_type: mimeType || (video ? "video" : "image"),
    duration_seconds: Number(f(record, "Duration_Seconds") || row?.duration_seconds || 0) || null,
  };
}
/*__STUDIO_WORKER_END:ideaTimedScriptCatalogRow__*/

export async function pulseIdeaTimedScriptWriter(env, idea, catalog) {
  const title = String(f(idea, "Candidate_Title") || "").trim();
  const summary = String(f(idea, "Idea_Summary") || "").trim();
  const location = String(f(idea, "Primary_Location") || f(idea, "Neighborhood_or_Area") || "").trim();
  const marketRaw = f(idea, "Market_Name");
  const market = (Array.isArray(marketRaw) ? String(marketRaw[0] || "") : String(marketRaw || "")).trim() || "Chicago";
  const compact = (catalog || []).map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location || "",
    topic: row.topic || "",
    description: row.description || "",
    media_kind: row.media_kind || "photo",
    media_type: row.media_type || null,
    duration_seconds: Number(row.duration_seconds || 0) || null,
  }));
  try {
    const { response, payload } = await item4PulsePipelineStage(env, "its1", {
      source: "studio-idea-timed-script",
      title,
      summary,
      location,
      market,
      catalog: compact,
    }, "ITS1");
    if (response.ok && payload?.status === "ok") {
      const scenes = payload?.details?.run?.scenes || payload?.details?.themes?.scenes;
      const parsed = scenesFromModelPayload({ scenes }, catalog);
      if (parsed.length >= 2) return { source: "its1", scenes: parsed };
    }
  } catch (error) {
    console.warn("ITS1 idea timed script pulse failed", idea?.id, error);
  }
  try {
    const covered = compact.map((row, index) => `${index + 1}. ${row.name}${row.location ? ` — ${row.location}` : ""}`).join("\n");
    const { response, payload } = await item4PulsePipelineStage(env, "sai1", {
      source: "studio-idea-timed-script",
      title,
      market,
      covered_text: covered || "(none)",
      needed: 0,
      total: compact.length,
    }, "SAI1");
    if (response.ok) {
      const themes = payload?.details?.themes || payload?.details?.run?.themes || {};
      const parsed = scenesFromModelPayload(themes, catalog);
      if (parsed.length >= 2) return { source: "sai1", scenes: parsed };
    }
  } catch (error) {
    console.warn("SAI1 idea timed script fallback failed", idea?.id, error);
  }
  return {
    source: "fallback",
    scenes: fallbackScenesFromStills({ title, summary, location }, catalog),
  };
}
/*__STUDIO_WORKER_END:pulseIdeaTimedScriptWriter__*/

export function scriptedShortUnassignedMessage(timeline) {
  const count = unassignedSuggestionCount(timeline);
  if (!count) return "";
  const sceneNumbers = (timeline?.segments || [])
    .map((segment, index) => !String(segment?.asset_id || segment?.media_asset_id || "").trim() ? index + 1 : null)
    .filter(Boolean);
  const sceneLabel = sceneNumbers.length === 1 ? `scene ${sceneNumbers[0]}` : `scenes ${sceneNumbers.join(", ")}`;
  return `Assign media to ${sceneLabel} in Rendering before Approve, or use “Match stills in order.” Relevant media may be reused when there are more scenes than assets. This does not publish.`;
}
/*__STUDIO_WORKER_END:scriptedShortUnassignedMessage__*/

export async function proposeScriptedShortRoute(request, env, authorization) {
  let payload = {};
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const prompt = String(payload?.prompt || "").replace(/\s+/g, " ").trim();
  if (prompt.length < 3) throw new HttpError(400, "Describe the short in a sentence.");
  const synthetic = {
    id: "scripted-short-proposal",
    fields: {
      Candidate_Title: prompt.slice(0, 160),
      Idea_Summary: prompt.slice(0, 2000),
    },
  };
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(null, payload));
  if (profile?.id) synthetic.fields.Content_Profile = [profile.id];
  let catalog = [];
  try {
    catalog.push(...(await rankStillsForIdeaPhotoWait(env, synthetic)).map(ideaTimedScriptCatalogRow));
  } catch (error) {
    console.warn("scripted short library rank failed", error);
  }
  try {
    catalog.push(...(await rankVideosForScriptedShortProposal(env, synthetic)).map(ideaTimedScriptCatalogRow));
  } catch (error) {
    console.warn("scripted short video discovery failed", error);
  }
  const seen = new Set();
  catalog = catalog.filter((row) => {
    if (!row.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  const picked = pickTimelineCatalog(catalog);
  const selectedIds = new Set(picked.selected.map((row) => row.id));
  const pool = [
    ...picked.selected,
    ...picked.catalog.filter((row) => !selectedIds.has(row.id) && (row.media_kind !== "video" || timelineCatalogIsRelevantVideo(row))),
  ];
  let source = "fallback";
  let scenes = [];
  try {
    const writer = await pulseIdeaTimedScriptWriter(env, synthetic, pool);
    source = writer.source && writer.source !== "fallback" ? writer.source : "fallback";
    scenes = assignOwnedScenes((writer.scenes || []).map((scene) => ({
      voiceover_text: scene.voiceover_text,
      suggested_visual: scene.suggested_visual,
    })), pool);
    scenes = ensureRelevantVideoScene(scenes, pool);
  } catch (error) {
    console.warn("scripted short writer failed", error);
  }
  if (!scriptedShortProposalReady(buildTimelineFromScenes(scenes))) {
    source = "fallback";
    scenes = assignOwnedScenes(fallbackProposalScenes(prompt, pool), pool);
    scenes = ensureRelevantVideoScene(scenes, pool);
  }
  const timeline = buildTimelineFromScenes(scenes);
  if (!scriptedShortProposalReady(timeline)) {
    throw new HttpError(502, "Studio could not write a scripted short from that prompt.");
  }
  const owned = timeline.segments.length - unassignedSuggestionCount(timeline);
  const suggestions = unassignedSuggestionCount(timeline);
  return respond(request, env, {
    ok: true,
    source,
    prompt,
    markdown: formatTimedScriptMarkdown(timeline),
    timeline,
    duration_seconds: timeline.duration_seconds,
    scene_count: timeline.segments.length,
    owned_count: owned,
    suggestion_count: suggestions,
    message: suggestions
      ? `${timeline.segments.length} scenes. ${owned} use a library file. ${suggestions} still need a photo you create. Estimated times are hints. The recorded voiceover sets the real length.`
      : `${timeline.segments.length} scenes, all matched to library files. Estimated times are hints. The recorded voiceover sets the real length.`,
  });
}
/*__STUDIO_WORKER_END:proposeScriptedShortRoute__*/

export async function acceptScriptedShortRoute(request, env, authorization, ctx = null) {
  let payload = {};
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const prompt = String(payload?.prompt || "").replace(/\s+/g, " ").trim();
  if (prompt.length < 3) throw new HttpError(400, "Describe the short in a sentence.");
  const incoming = payload?.timeline;
  if (!scriptedShortProposalReady(incoming)) {
    throw new HttpError(400, "Accept needs the proposal timeline.");
  }
  const timeline = buildTimelineFromScenes(incoming.segments);
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(null, payload));
  const title = prompt.slice(0, 160);
  const idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, "", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Candidate_Title: title,
        Idea_Summary: prompt.slice(0, 2000),
        Candidate_Status: "Approved",
        Batch_Date: new Date().toISOString().slice(0, 10),
        Content_Profile: [profile.id],
        Production_Content_Type: "Vertical Short Video",
        Production_Include_Voiceover: "Yes",
        Production_Include_Background_Music: "Yes",
        Production_Include_Thumbnail: "Yes",
        Production_Video_Clip_Count: timeline.segments.length,
      },
      typecast: true,
    }),
  });
  let requestRecord = await createDraftForIdea(env, idea, authorization, null, { preferredProfileId: profile.id });
  const mediaIds = [...new Set(timeline.segments
    .map((segment) => String(segment.asset_id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  if (mediaIds.length) {
    const attached = await applyLibraryAssetsToProductionRequest(env, requestRecord, mediaIds, {
      replaceWaitAssets: true,
      allowManagePaused: true,
      replaceAll: true,
      allowVideo: true,
    });
    requestRecord = attached.record;
    const orderedAssets = item4AssetManifest(requestRecord)
      .slice()
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const byMedia = new Map(orderedAssets.map((asset) => [String(asset?.media_asset_record_id || "").trim(), asset]));
    timeline.segments.forEach((segment) => {
      const matched = byMedia.get(String(segment.asset_id || "").trim());
      if (matched?.id) {
        segment.asset_id = String(matched.id);
        segment.shot_status = "owned";
      } else {
        segment.asset_id = "";
        segment.shot_status = "suggestion";
      }
    });
  } else {
    timeline.segments.forEach((segment) => {
      segment.asset_id = "";
      segment.shot_status = "suggestion";
    });
  }
  const script = exactVoiceoverText(timeline);
  const notes = withProductionPhotoWaitManual(mergeTimedScriptNotes("", timeline));
  const stampedNotes = `${notes}\nidea-vo-timeline=1\nscripted-short=proposal`.trim();
  const duration = Math.max(5, Math.round(Number(timeline.duration_seconds) || 0));
  const missing = unassignedSuggestionCount(timeline);
  const scriptedMusicId = pickAutonomousMusicAssetId(
    mapOperationsProfile(profile).autonomous_music_asset_ids,
    AUTONOMOUS_DEFAULT_MUSIC_ASSET_ID,
  );
  requestRecord = await item4UpdateRequestState(env, requestRecord.id, {
    Master_Content_Type: "Vertical Short Video",
    Voiceover_Mode: "Yes",
    Background_Music_Mode: "Yes",
    Thumbnail_Mode: "Yes",
    Selected_Music_Asset: [scriptedMusicId],
    Script_Mode: "Force exact",
    Requested_Script: script,
    Requested_Title: title,
    Video_Duration_Seconds: duration,
    Voiceover_Tail_Seconds: 0,
    Video_Clip_Count_Mode: "Exact",
    Video_Clip_Count_Exact: timeline.segments.length,
    Carousel_Image_Mode: "Manual Upload",
    Production_Notes: stampedNotes.slice(0, 10000),
    Request_Status: "Draft",
    Studio_Item4_State: "Draft",
  });
  try {
    const planCall = studioInternalJsonRequest(`/api/production-requests/${requestRecord.id}/plan`, {
      platforms: [...AUTONOMOUS_STANDARD_PLATFORMS],
      overrides: autonomousPlanOverrides("Vertical Short Video"),
      extras: autonomousPlanExtras(),
      package: "video",
      skip_fbs1_guard: true,
    });
    await buildItem4OutputPlan(planCall.request, env, planCall.url, authorization);
    requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id);
  } catch (error) {
    console.warn("scripted short plan failed", requestRecord.id, error);
  }
  if (!missing && String(f(requestRecord, "Studio_Output_Plan_Status") || "").trim() === "Ready") {
    try {
      const variantsCall = studioInternalJsonRequest(`/api/production-requests/${requestRecord.id}/variants`, {});
      await prepareItem4Variants(variantsCall.request, env, variantsCall.url, authorization, ctx);
      requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id);
    } catch (error) {
      console.warn("scripted short variant prepare failed", requestRecord.id, error);
    }
  }
  requestRecord = await item4UpdateRequestState(env, requestRecord.id, {
    Request_Status: "Draft",
    Studio_Item4_State: String(f(requestRecord, "Studio_Output_Plan_Status") || "").trim() === "Ready" ? "Plan Ready" : "Draft",
  });
  return respond(request, env, {
    ok: true,
    suggestion_count: missing,
    scene_count: timeline.segments.length,
    record: mapIdea(idea),
    production_request: mapProductionRequest(requestRecord),
    message: missing
      ? `Draft saved. ${missing} scene${missing === 1 ? "" : "s"} still need a photo. Attach those stills, then Approve. Estimated times are hints. This does not publish.`
      : "Draft saved with the six short outputs, default voice, and default music. Approve on Production when you are ready. This does not publish.",
  }, 201);
}
/*__STUDIO_WORKER_END:acceptScriptedShortRoute__*/

export function feedPostNotesWithoutTimeline(notes) {
  return String(notes || "")
    .replace(/(?:^|\n)\[timed-script\]\s*[^\n]*/g, "")
    .replace(/\n?idea-vo-timeline=\S+/g, "")
    .trim();
}
/*__STUDIO_WORKER_END:feedPostNotesWithoutTimeline__*/

export async function acceptSingleImageFeedPost(request, env, idea, mediaId, authorization, ctx) {
  return acceptStillsIdeaPackage(request, env, idea, [mediaId], authorization, ctx);
}
/*__STUDIO_WORKER_END:acceptSingleImageFeedPost__*/

export async function acceptStillsIdeaPackage(request, env, idea, mediaIds, authorization, ctx) {
  const ids = normalizeIdeaLibraryAssetIds(mediaIds);
  if (!ids.length) {
    throw new HttpError(409, "Attach at least one library photo before accepting this stills idea.");
  }
  const single = ids.length === 1;
  const masterType = single ? "Feed Post" : "Photo Set";
  let requestRecord = await existingDraftForIdea(env, idea.id, authorization)
    || await findDraftProductionRequestForIdea(env, idea.id)
    || await createDraftForIdea(env, idea, authorization);
  const attached = await applyLibraryAssetsToProductionRequest(env, requestRecord, ids, {
    replaceWaitAssets: true,
    allowManagePaused: true,
    replaceAll: true,
  });
  requestRecord = attached.record;
  const notes = feedPostNotesWithoutTimeline(f(requestRecord, "Production_Notes"));
  const stampedNotes = /ez-package=slides/i.test(notes) ? notes : `${notes}\nez-package=slides`.trim();
  requestRecord = await item4UpdateRequestState(env, requestRecord.id, {
    Master_Content_Type: masterType,
    Voiceover_Mode: "No",
    Background_Music_Mode: "No",
    Thumbnail_Mode: "No",
    Script_Mode: "AI decides",
    Requested_Script: null,
    Voiceover_Tail_Seconds: 0,
    Video_Clip_Count_Mode: "Exact",
    Video_Clip_Count_Exact: single ? 1 : null,
    Carousel_Image_Mode: "Manual Upload",
    Carousel_Slide_Count_Mode: "Exact",
    Carousel_Slide_Count_Exact: ids.length,
    Production_Notes: stampedNotes.slice(0, 10000),
  });

  if (String(f(requestRecord, "Studio_Output_Plan_Status") || "").trim() !== "Ready") {
    try {
      const planCall = studioInternalJsonRequest(`/api/production-requests/${requestRecord.id}/plan`, {
        platforms: ["Instagram", "Facebook", "TikTok"],
        package: "slides",
        skip_fbs1_guard: true,
      });
      await buildItem4OutputPlan(planCall.request, env, planCall.url, authorization);
      requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id);
    } catch (error) {
      console.warn("stills idea package plan failed", requestRecord.id, error);
    }
  }

  let variantStatus = String(f(requestRecord, "Studio_Variant_Status") || "").trim();
  if (variantStatus !== "Ready" && variantStatus !== "Not Needed" && ctx?.waitUntil) {
    ctx.waitUntil((async () => {
      try {
        let current = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id);
        let reconciled = await item4ReconcileVariants(env, current.id, current).catch(() => null);
        if (reconciled?.record) current = reconciled.record;
        const queued = Array.isArray(reconciled?.queue_rows) && reconciled.queue_rows.length;
        if (!autonomousPlanVariantsReady(current, reconciled) && !queued) {
          const variantsCall = studioInternalJsonRequest(`/api/production-requests/${current.id}/variants`, {});
          await prepareItem4Variants(variantsCall.request, env, variantsCall.url, authorization, ctx);
        }
      } catch (error) {
        console.warn("stills idea package variant prepare failed", requestRecord.id, error);
      }
    })());
  }

  const assetsCount = item4AssetManifest(requestRecord).length;
  const planReady = String(f(requestRecord, "Studio_Output_Plan_Status") || "").trim() === "Ready";
  variantStatus = String(f(requestRecord, "Studio_Variant_Status") || "").trim();
  const variantsReady = variantStatus === "Ready"
    || variantStatus === "Not Needed"
    || autonomousPlanVariantsReady(requestRecord);
  const readyForApproval = assetsCount >= 1 && planReady && variantsReady;
  requestRecord = await item4UpdateRequestState(env, requestRecord.id, {
    Request_Status: "Ready",
    Studio_Master_Asset_Status: assetsCount >= 1 ? "Ready" : (f(requestRecord, "Studio_Master_Asset_Status") || "None"),
    Studio_Item4_State: planReady ? "Plan Ready" : "Assets Ready",
  });

  const ideaNotes = mergeIdeaProductionNotes(f(idea, "Production_Config_Notes"), undefined, ids);
  idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Production_Content_Type: masterType,
        Production_Include_Voiceover: "No",
        Production_Include_Background_Music: "No",
        Production_Include_Thumbnail: "No",
        Production_Carousel_Image_Mode: "Manual Upload",
        Production_Carousel_Slide_Count: ids.length,
        Studio_Matched_Media_Assets: ids,
        Studio_Photo_Wait_Status: "Not Needed",
        Production_Config_Notes: ideaNotes,
        Candidate_Status: String(f(idea, "Candidate_Status") || "").trim() === "On Hold"
          ? "On Hold"
          : "Approved",
      },
      typecast: true,
    }),
  });

  const message = readyForApproval
    ? (single
      ? "The one photo is on a feed post and ready for Production Approve. No voiceover. This does not publish."
      : `${ids.length} photos are on a stills package and ready for Production Approve. No voiceover. This does not publish.`)
    : (single
      ? "The one photo is on a feed post. Platform crops may still be finishing. Approve when Ready. No voiceover. This does not publish."
      : `${ids.length} photos are attached. Platform crops may still be finishing. Approve when Ready. No voiceover. This does not publish.`);
  return respond(request, env, {
    ok: true,
    single_image_feed_post: single,
    stills_package: !single,
    source: single ? "single-image-feed-post" : "multi-image-stills-package",
    scene_count: ids.length,
    ready_for_approval: readyForApproval,
    waiting_variants: planReady && !variantsReady,
    stills: ids.map((id) => ({
      id,
      name: "",
      preview_path: `/api/media-assets/${id}/preview`,
    })),
    record: mapIdea(idea),
    production_request: mapProductionRequest(requestRecord),
    message,
  }, readyForApproval ? 200 : 202);
}
/*__STUDIO_WORKER_END:acceptStillsIdeaPackage__*/

export function vibeCutPlanFromBody(body = {}) {
  const config = defaultVibeCutConfig(body.config || body);
  let selects = Array.isArray(body.selects) ? body.selects : [];
  if (!selects.length) {
    const sceneSeconds = Array.isArray(body.scene_seconds)
      ? body.scene_seconds
      : (Array.isArray(body.sceneSeconds) ? body.sceneSeconds : []);
    const duration = Number(body.source_duration_seconds ?? body.sourceDurationSeconds ?? 0);
    if (sceneSeconds.length && duration > 0) {
      selects = selectsFromSceneTimestamps(sceneSeconds, duration);
    } else if (duration > 0) {
      selects = provisionalSelectsFromDuration(duration);
    }
  }
  if (!selects.length) {
    throw new HttpError(400, "Provide selects, scene_seconds + source_duration_seconds, or source_duration_seconds.");
  }
  const beats = Array.isArray(body.beats) ? body.beats : (Array.isArray(body.beat_map) ? body.beat_map : []);
  const beatStrengths = Array.isArray(body.beat_strengths)
    ? body.beat_strengths
    : (Array.isArray(body.beatStrengths) ? body.beatStrengths : []);
  const sections = Array.isArray(body.sections) ? body.sections : [];
  const proposal = proposeVibeCuts({
    selects,
    beats,
    beatStrengths,
    sections,
    config,
  });
  const productionDefaults = vibeCutProductionDefaults(config);
  const renderSettings = vibeCutRenderSettings(config);
  let notes = String(body.production_notes || body.notes || "").trim();
  notes = mergeVibeCutIntoNotes(notes, {
    ...config,
    cuts: proposal.cuts.map((cut) => ({
      version_index: cut.version_index,
      label: cut.label,
      theme: cut.theme,
      duration_seconds: cut.duration_seconds,
      clip_count: cut.clip_count,
      used_ranges: cut.used_ranges,
    })),
    used_ranges: proposal.used_ranges,
  });
  return {
    ok: true,
    mode: "vibe_cut",
    ...proposal,
    production_defaults: productionDefaults,
    render_settings: renderSettings,
    production_notes: notes,
    message: proposal.cut_count > 1
      ? `Proposed ${proposal.cut_count} Vibe Cuts. Preview each, then Keep, Regenerate, or Create Another from unused footage.`
      : `Proposed a ${proposal.cuts[0]?.duration_seconds || config.target_seconds}s Vibe Cut. Music drives the timeline; there is no voiceover.`,
  };
}
/*__STUDIO_WORKER_END:vibeCutPlanFromBody__*/

export async function planVibeCutRoute(request, env, authorization) {
  void env;
  void authorization;
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  return respond(request, env, vibeCutPlanFromBody(body || {}));
}
/*__STUDIO_WORKER_END:planVibeCutRoute__*/

export async function anotherVibeCutRoute(request, env, authorization) {
  void env;
  void authorization;
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const config = defaultVibeCutConfig(body?.config || body || {});
  let selects = Array.isArray(body?.selects) ? body.selects : [];
  if (!selects.length) {
    const duration = Number(body?.source_duration_seconds ?? body?.sourceDurationSeconds ?? 0);
    const sceneSeconds = Array.isArray(body?.scene_seconds) ? body.scene_seconds : [];
    if (sceneSeconds.length && duration > 0) selects = selectsFromSceneTimestamps(sceneSeconds, duration);
    else if (duration > 0) selects = provisionalSelectsFromDuration(duration);
  }
  if (!selects.length) {
    throw new HttpError(400, "Provide selects or source_duration_seconds to create another cut.");
  }
  const usedRanges = Array.isArray(body?.used_ranges)
    ? body.used_ranges
    : (parseVibeCutDirective(body?.production_notes)?.used_ranges || []);
  const cut = anotherCutFromUnused({
    selects,
    beats: Array.isArray(body?.beats) ? body.beats : [],
    beatStrengths: Array.isArray(body?.beat_strengths) ? body.beat_strengths : [],
    sections: Array.isArray(body?.sections) ? body.sections : [],
    config,
    usedRanges,
  });
  return respond(request, env, {
    ok: true,
    mode: "vibe_cut",
    action: "create_another_from_unused",
    cut,
    used_ranges: [...usedRanges, ...(cut.used_ranges || [])],
    message: `Another cut from unused footage · ${cut.duration_seconds}s · ${cut.theme}`,
  });
}
/*__STUDIO_WORKER_END:anotherVibeCutRoute__*/

export async function createIdeaTimedScriptRoute(request, env, url, authorization, ctx = null) {
  const recordId = ideaRecordIdFromPath(url);
  let idea = await loadAuthorizedIdea(env, recordId, authorization);
  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
  // Create VO timeline is distinct from silently accepting a Photo Set.
  const requireVoiceoverTimeline = body.create_voiceover_timeline === true;
  let convertPromotedSilent = null;
  if (String(f(idea, "Candidate_Status") || "").trim() === "On Hold") {
    throw new HttpError(409, "Restore this idea before creating a timeline.");
  }
  // QA-IDEA-TIMELINE-ORPHAN: this POST must be idempotent once a timed
  // script has been saved. Repeated Ideas clicks must never rewrite approved
  // narration, scene timing, asset assignments, or create another draft.
  const linkedProductionRequestIds = [...new Set(
    (Array.isArray(f(idea, "Production Requests")) ? f(idea, "Production Requests") : [])
      .map((value) => String(value || "").trim())
      .filter((value) => /^rec[A-Za-z0-9]+$/.test(value))
  )];
  if (linkedProductionRequestIds.length) {
    const linked = await Promise.allSettled(linkedProductionRequestIds.map((id) =>
      airtableFetch(env, PRODUCTION_REQUEST_TABLE, id)
    ));
    if (linked.some((entry) => entry.status === "rejected")) {
      throw new HttpError(503, "An existing Production Request could not be checked. Retry safely; no new timeline was created.");
    }
    const linkedRows = linked.map((entry) => entry.value);
    const preferred = preferAuthoritativeProductionRequest(linkedRows.map((record) => ({
      id: record.id,
      status: String(f(record, "Request_Status") || "").trim(),
      createdAt: f(record, "Created_At") || record.createdTime || "",
    })));
    if (preferred?.status === "Promoted") {
      const promoted = linkedRows.find((record) => record.id === preferred.id);
      const promotedNotes = String(f(promoted, "Production_Notes") || "");
      const promotedTimeline = timedScriptFromNotes(promotedNotes);
      const silentPhotoPackage = !promotedTimeline?.segments?.length && !studioIsVibeCut(promoted) && (
        isStillsIdeaContentType(String(f(promoted, "Master_Content_Type") || ""))
        || /ez-package=slides/i.test(promotedNotes)
        || String(f(promoted, "Voiceover_Mode") || "").trim() === "No"
      );
      // Create VO timeline on an unapproved silent photo package rewrites that
      // request. A package that already has narration stays put.
      if (!(requireVoiceoverTimeline && silentPhotoPackage)) {
        throw new HttpError(
          409,
          `This idea already has Production Request ${f(promoted, "Production_Request_ID") || preferred.id} in production. Open Pipeline / Open Review instead of creating another timeline.`
        );
      }
      convertPromotedSilent = promoted;
    }
    const saved = linkedRows
      .map((record) => ({ record, timeline: timedScriptFromNotes(f(record, "Production_Notes")) }))
      .filter(({ record, timeline }) => timeline?.segments?.length >= 2
        && ["Draft", "Ready", "Submitted"].includes(String(f(record, "Request_Status") || "").trim()))
      .sort((a, b) => {
        const rank = { Submitted: 0, Ready: 1, Draft: 2 };
        const aStatus = String(f(a.record, "Request_Status") || "").trim();
        const bStatus = String(f(b.record, "Request_Status") || "").trim();
        const byStatus = (rank[aStatus] ?? 9) - (rank[bStatus] ?? 9);
        if (byStatus !== 0) return byStatus;
        return (Date.parse(f(a.record, "Created_At") || "") || 0)
          - (Date.parse(f(b.record, "Created_At") || "") || 0);
      })[0];
    if (saved) {
      const { record: savedRequest, timeline } = saved;
      return respond(request, env, {
        ok: true,
        reused_existing: true,
        timeline,
        markdown: formatTimedScriptMarkdown(timeline),
        requested_script: exactVoiceoverText(timeline),
        duration_seconds: timeline.duration_seconds,
        scene_count: timeline.segments.length,
        ready_for_approval: false,
        record: mapIdea(idea),
        production_request: mapProductionRequest(savedRequest),
        message: "The existing voiceover timeline was reopened without changing its scenes or stills. Review it in Production / Rendering.",
      });
    }
  }
  if (promotionCompleted(idea) && !convertPromotedSilent) {
    throw new HttpError(409, "This idea is already in production, so a new timeline was not written.");
  }
  // Operator-chosen stills (Manage Idea picker) win over place-name library ranking.
  const preferredMediaIds = preferredIdeaLibraryAssetIds({
    bodyIds: body.library_asset_ids,
    matchedIds: f(idea, "Studio_Matched_Media_Assets") || [],
  });
  const contentType = String(f(idea, "Production_Content_Type") || "").trim();
  if (!requireVoiceoverTimeline && isStillsIdeaContentType(contentType)) {
    if (!preferredMediaIds.length) {
      throw new HttpError(409, "Attach at least one library photo in Manage Idea, then try again.");
    }
    return acceptStillsIdeaPackage(request, env, idea, preferredMediaIds, authorization, ctx);
  }
  const feedPhotoIds = singleImageFeedPostIds({
    contentType,
    matchedIds: preferredMediaIds,
  });
  if (!requireVoiceoverTimeline && Array.isArray(feedPhotoIds) && feedPhotoIds.length === 1) {
    return acceptSingleImageFeedPost(request, env, idea, feedPhotoIds[0], authorization, ctx);
  }
  const title = String(f(idea, "Candidate_Title") || "").trim();
  if (!title) throw new HttpError(400, "Give this idea a title before creating a timeline.");
  let summary = String(f(idea, "Idea_Summary") || "").trim();
  const location = String(f(idea, "Primary_Location") || f(idea, "Neighborhood_or_Area") || "").trim();
  if (!summary && !location && preferredMediaIds.length < 2) {
    throw new HttpError(400, "Add a short summary or place name so Studio can describe the idea, pick stills, and write the voiceover.");
  }
  if (!summary) {
    summary = location
      ? `${title}. Shot around ${location}.`
      : title;
    idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Idea_Summary: summary.slice(0, 2000) }, typecast: true }),
    });
  }

  const ranked = [];
  const seenRanked = new Set();
  if (preferredMediaIds.length) {
    const preferredRows = await Promise.all(preferredMediaIds.map((id) =>
      airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID || ITEM4_MEDIA_ASSET_TABLE, id).catch(() => null)
    ));
    for (const record of preferredRows) {
      if (!record?.id || seenRanked.has(record.id)) continue;
      seenRanked.add(record.id);
      ranked.push(ideaTimedScriptCatalogRow({
        id: record.id,
        record,
        score: 100,
        confidence: "high",
      }));
    }
  }
  if (ranked.length < 2) {
    for (const row of (await rankStillsForIdeaPhotoWait(env, idea)).map(ideaTimedScriptCatalogRow)) {
      if (!row?.id || seenRanked.has(row.id)) continue;
      seenRanked.add(row.id);
      ranked.push(row);
    }
  }
  const picked = pickTimelineCatalog(ranked);
  if (picked.selected.length < 2) {
    throw new HttpError(
      409,
      preferredMediaIds.length
        ? "Those selected photos could not be used for a voiceover timeline. Keep at least two stills selected, or switch this idea to Feed Post / Photo Set."
        : "No matching library stills yet. Add a place name to the idea or attach photos, then try again.",
    );
  }

  // Timeline creation must remain available even when the preferred AI provider is
  // unavailable/misconfigured. The selected library stills are already authoritative,
  // so fall back to deterministic scene writing instead of surfacing a provider 500.
  let writer;
  try {
    writer = await pulseIdeaTimedScriptWriter(env, idea, picked.catalog.length >= 4 ? picked.catalog : picked.selected);
  } catch (error) {
    console.warn("idea timeline writer failed; using deterministic fallback", idea.id, error);
    writer = { source: "deterministic-fallback", scenes: [] };
  }
  const assigned = assignScenesToStills(writer.scenes, picked.catalog.length ? picked.catalog : picked.selected)
    .filter((scene) => String(scene.voiceover_text || "").trim() && String(scene.media_asset_id || scene.asset_id || "").trim());
  const scenes = assigned.length >= 2 ? assigned : fallbackScenesFromStills({
    title,
    summary,
    location,
  }, picked.selected);
  const timeline = buildTimelineFromScenes(scenes);
  if (!ideaTimedScriptReady(timeline)) {
    throw new HttpError(502, "Studio could not build a voiceover timeline from the matching stills.");
  }

  const mediaIds = [...new Set(timeline.segments.map((segment) => String(segment.asset_id || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  if (mediaIds.length < 2) {
    throw new HttpError(409, "The timeline did not resolve to library stills. Try again after more photos are classified.");
  }

  let requestRecord = convertPromotedSilent
    || await existingDraftForIdea(env, idea.id, authorization)
    || await findDraftProductionRequestForIdea(env, idea.id)
    || await createDraftForIdea(env, idea, authorization);
  const priorContentType = String(f(requestRecord, "Master_Content_Type") || "").trim();
  const previouslyPhotoOnly = isStillsIdeaContentType(priorContentType)
    || /(?:^|\n)ez-package=slides(?:\n|$)/i.test(String(f(requestRecord, "Production_Notes") || ""));
  // An explicit VO conversion must never reset a live/approved destination.
  if (requireVoiceoverTimeline && previouslyPhotoOnly) {
    const existingOutputs = await outputRowsForProductionRequest(env, requestRecord.id, { includeInactive: false });
    const lockedOutput = new Set(["Approved for Publishing", "Published", "Scheduled", "Publishing"]);
    const unsafe = existingOutputs.filter((row) => {
      const status = String(f(row, "Output_Status") || "").trim();
      const review = String(f(row, "Review_Status") || "").trim();
      return lockedOutput.has(status) || review === "Approved" || Boolean(f(row, "Published_At"));
    });
    if (unsafe.length) {
      throw new HttpError(409, "This photo package has already advanced beyond Draft. Open Production and review its outputs before converting to a voiceover timeline.");
    }
  }
  const attached = await applyLibraryAssetsToProductionRequest(env, requestRecord, mediaIds, {
    replaceWaitAssets: true,
    allowManagePaused: true,
    replaceAll: true,
  });
  requestRecord = attached.record;
  const orderedAssets = item4AssetManifest(requestRecord)
    .slice()
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const byMedia = new Map(orderedAssets.map((asset) => [String(asset?.media_asset_record_id || "").trim(), asset]));
  timeline.segments.forEach((segment, index) => {
    const matched = byMedia.get(String(segment.asset_id || "").trim()) || orderedAssets[index];
    if (matched?.id) segment.asset_id = String(matched.id);
  });

  const script = exactVoiceoverText(timeline);
  const markdown = formatTimedScriptMarkdown(timeline);
  // A former silent Photo Set must not retain the slides route marker once
  // the operator explicitly requests a narrated short.
  const priorNotes = String(f(requestRecord, "Production_Notes") || "")
    .split(/\r?\n/).filter((line) => !/^\s*ez-package=slides\s*$/i.test(line)).join("\n");
  const notes = withProductionPhotoWaitManual(mergeTimedScriptNotes(priorNotes, timeline));
  const stampedNotes = /idea-vo-timeline=/i.test(notes)
    ? notes
    : `${notes}\nidea-vo-timeline=1`.trim();
  const duration = Math.max(5, Math.round(Number(timeline.duration_seconds) || 0));
  requestRecord = await item4UpdateRequestState(env, requestRecord.id, {
    Master_Content_Type: "Vertical Short Video",
    Voiceover_Mode: "Yes",
    Background_Music_Mode: "Yes",
    Thumbnail_Mode: "Yes",
    Script_Mode: "Force exact",
    Requested_Script: script,
    Video_Duration_Seconds: duration,
    Voiceover_Tail_Seconds: 0,
    Video_Clip_Count_Mode: "Exact",
    Video_Clip_Count_Exact: timeline.segments.length,
    Carousel_Image_Mode: "Manual Upload",
    Production_Notes: stampedNotes.slice(0, 10000),
  });

  // Accept the idea all the way to Production Approve: plan + crops, stills already attached.
  // Do not I3/I4 promote — Joseph still taps Approve on Production.
  // Plan failures must not 500 after the timeline/stills are already saved.
  // A prior Photo Set plan can say Ready while containing only native still
  // destinations. Rebuild that plan for VO shorts and deactivate old draft
  // photo outputs rather than opening a timed script with a silent plan.
  if (previouslyPhotoOnly || String(f(requestRecord, "Studio_Output_Plan_Status") || "").trim() !== "Ready") {
    try {
      const planCall = studioInternalJsonRequest(`/api/production-requests/${requestRecord.id}/plan`, {
        platforms: [...AUTONOMOUS_STANDARD_PLATFORMS],
        overrides: autonomousPlanOverrides("Vertical Short Video"),
        extras: autonomousPlanExtras(),
        package: "video",
        skip_fbs1_guard: true,
      });
      await buildItem4OutputPlan(planCall.request, env, planCall.url, authorization);
      requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id);
    } catch (error) {
      console.warn("idea timeline plan failed after stills saved", requestRecord.id, error);
      requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id).catch(() => requestRecord);
      // Do not leave an old photo-only plan labelled Ready after VO conversion.
      if (previouslyPhotoOnly) requestRecord = await item4UpdateRequestState(env, requestRecord.id, {
        Studio_Output_Plan_Status: "Needs Review",
        Studio_Item4_State: "Assets Ready",
      });
    }
  }

  let variantStatus = String(f(requestRecord, "Studio_Variant_Status") || "").trim();
  if (variantStatus !== "Ready" && variantStatus !== "Not Needed") {
    // Create Timeline is an interactive request. Variant preparation can be expensive
    // (Drive reads + crop queue writes) and must not make this request fail after the
    // timeline/stills have already been saved. Leave variants queued for the normal
    // continuation/cron path and return the production draft immediately.
    if (ctx?.waitUntil) {
      ctx.waitUntil((async () => {
        try {
          let current = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id);
          let reconciled = await item4ReconcileVariants(env, current.id, current).catch(() => null);
          if (reconciled?.record) current = reconciled.record;
          const queued = Array.isArray(reconciled?.queue_rows) && reconciled.queue_rows.length;
          if (!autonomousPlanVariantsReady(current, reconciled) && !queued) {
            const variantsCall = studioInternalJsonRequest(`/api/production-requests/${current.id}/variants`, {});
            await prepareItem4Variants(variantsCall.request, env, variantsCall.url, authorization, ctx);
          }
        } catch (error) {
          console.warn("idea timeline async variant prepare failed", requestRecord.id, error);
        }
      })());
    }
  }

  const assetsCount = item4AssetManifest(requestRecord).length;
  const planReady = String(f(requestRecord, "Studio_Output_Plan_Status") || "").trim() === "Ready";
  variantStatus = String(f(requestRecord, "Studio_Variant_Status") || "").trim();
  const variantsReady = variantStatus === "Ready"
    || variantStatus === "Not Needed"
    || autonomousPlanVariantsReady(requestRecord);
  const readyForApproval = assetsCount >= 2 && planReady && variantsReady;
  requestRecord = await item4UpdateRequestState(env, requestRecord.id, {
    Request_Status: convertPromotedSilent ? "Promoted" : "Ready",
    Studio_Master_Asset_Status: assetsCount >= 2 ? "Ready" : (f(requestRecord, "Studio_Master_Asset_Status") || "None"),
    Studio_Item4_State: readyForApproval ? "Plan Ready" : (planReady ? "Plan Ready" : "Assets Ready"),
  });
  if (convertPromotedSilent) {
    try {
      const contentId = studioFirstLinkedId(f(requestRecord, "Promoted_Content_Item"))
        || studioFirstLinkedId(f(idea, "Content Items"))
        || String(f(idea, "Promoted_Content_Record_ID") || "").trim();
      if (contentId) {
        await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId, {
          method: "PATCH",
          body: JSON.stringify({
            fields: { Content_Type: "Vertical Short Video" },
            typecast: true,
          }),
        });
        await syncProductionRequestDirectivesToContentItem(env, requestRecord, contentId, { invalidateVoiceover: true });
        const content = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId);
        const outputIds = (Array.isArray(f(content, "Platform Outputs")) ? f(content, "Platform Outputs") : [])
          .map((id) => String(id || "").trim())
          .filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
        for (const outputId of outputIds) {
          const output = await airtableFetch(env, STUDIO_PLATFORM_OUTPUT_TABLE, outputId).catch(() => null);
          const renderStatus = String(f(output, "Render_Status") || "");
          const outputStatus = String(f(output, "Output_Status") || "");
          const review = String(f(output, "Review_Status") || "");
          const locked = ["Approved for Publishing", "Published", "Scheduled", "Publishing"].includes(outputStatus)
            || review === "Approved"
            || Boolean(f(output, "Published_At"));
          if (!output || locked || !/native photo/i.test(renderStatus)) continue;
          await airtableFetch(env, STUDIO_PLATFORM_OUTPUT_TABLE, outputId, {
            method: "PATCH",
            body: JSON.stringify({ fields: { Do_Not_Publish: true }, typecast: false }),
          }).catch((error) => console.warn("silent photo output retire failed", outputId, error));
        }
      }
      await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id, {
        method: "PATCH",
        body: JSON.stringify({ fields: { Studio_Production_Job_JSON: null }, typecast: false }),
      });
      const resume = enqueueStudioProductionJob(env, requestRecord.id).catch((error) => {
        console.warn("voiceover conversion produce enqueue failed", requestRecord.id, error);
      });
      if (ctx?.waitUntil) ctx.waitUntil(resume);
      else await resume;
    } catch (error) {
      console.warn("promoted silent package voiceover handoff failed", requestRecord.id, error);
    }
  }

  const ideaNotes = mergeIdeaProductionNotes(f(idea, "Production_Config_Notes"), undefined, mediaIds);
  idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, idea.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Production_Content_Type: "Vertical Short Video",
        Production_Include_Voiceover: "Yes",
        Production_Video_Clip_Count: timeline.segments.length,
        Production_Carousel_Image_Mode: "Manual Upload",
        Studio_Matched_Media_Assets: mediaIds,
        Studio_Photo_Wait_Status: "Not Needed",
        Production_Config_Notes: ideaNotes,
        Candidate_Status: convertPromotedSilent
          ? "Promoted"
          : (String(f(idea, "Candidate_Status") || "").trim() === "On Hold" ? "On Hold" : "Approved"),
      },
      typecast: true,
    }),
  });

  return respond(request, env, {
    ok: true,
    source: writer.source,
    markdown,
    requested_script: script,
    duration_seconds: timeline.duration_seconds,
    scene_count: timeline.segments.length,
    ready_for_approval: readyForApproval,
    waiting_variants: planReady && !variantsReady,
    stills: mediaIds.map((id) => {
      const row = (picked.catalog.find((item) => item.id === id) || picked.selected.find((item) => item.id === id) || {});
      return {
        id,
        name: row.name || "",
        location: row.location || "",
        preview_path: `/api/media-assets/${id}/preview`,
      };
    }),
    timeline,
    record: mapIdea(idea),
    production_request: mapProductionRequest(requestRecord),
    message: readyForApproval
      ? `Ready for Production Approve: ${timeline.segments.length} scenes, ${Number(timeline.duration_seconds).toFixed(0)} seconds, named stills attached. Open Production and tap Approve. This does not publish.`
      : `Timeline and stills are on Production (${timeline.segments.length} scenes). Platform crops are still finishing — open Production and Approve when crops say Ready. This does not publish.`,
  }, readyForApproval ? 200 : 202);
}
/*__STUDIO_WORKER_END:createIdeaTimedScriptRoute__*/
