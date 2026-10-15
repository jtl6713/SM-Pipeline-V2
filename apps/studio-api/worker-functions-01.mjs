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
  studioMarkMappedListDirty,
  JSON_HEADERS,
  HttpError,
  STUDIO_TABLES,
  ROLE_PERMISSIONS,
  airtableNextRequestAt,
  studioHotReadCache,
  AIRTABLE_BATCH_LIMIT,
  CONTENT_OUTPUT_TERMINAL_STATES,
  IDEA_PHOTO_WAIT_TYPES,
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
  STUDIO_SCHEDULE_GAP_MS,
  STUDIO_OCCUPIED_CACHE_MS,
  STUDIO_OCCUPIED_LIST_LIMIT,
  STUDIO_OCCUPIED_LOOKBACK_MS,
  STUDIO_OCCUPIED_HORIZON_MS,
  studioOccupiedScheduleCaches,
  ITEM4_STORY_TEASER_SECONDS,
  ITEM4_SINGLE_STILL_SECONDS,
  ITEM4_VARIANT_QUEUE_TABLE,
  ITEM4_VARIANT_RECIPE_VERSION,
  ITEM4_DRAIN_POST_BUDGET_MS,
  IDEA_LIBRARY_SCAN_LIMIT,
  IDEA_LIBRARY_PLACE_FILTER_LIMIT,
  ITEM4_SMV1_BASE_ELIGIBILITY_FORMULA,
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
  STUDIO_PLATFORM_OUTPUT_TABLE,
  STUDIO_SIMILAR_TIMES_MIN_SAMPLE,
  STUDIO_READ_SNAPSHOT_FRESH_MS,
  PHASE6_CAROUSEL_SLIDES_TABLE,
  STUDIO_RENDER_QUEUE_CANDIDATE_FORMULA,
  STUDIO_RFR_MISSING_COVER_FORMULA,
  STUDIO_IDEA_PROFILE_TABLE_ID,
} from "./worker.js";
import {
  item4PulsePipelineStage,
  item4PulseT1Python,
  readOpsQueueControls,
  studioAdmitRenderQueue,
  item4PulseR4Python,
  item4PulseR5Python,
  item4PulseLetterPython,
  item4DrainVariantWorker,
  item4ResumePendingMasterAuthority,
  mapProductionRequest,
  loadAuthorizedProductionRequest,
  normalizeChoice,
  nullableInt,
  nullableNumber,
  validateMusicAsset,
  suggestPrimaryLocationFromIdea,
  item4BridgePlanKey,
  productionRequestRevisionOpen,
  productionRequestEditable,
  loadContentPlatformOutputs,
  arrayOrEmpty,
  studioIndustryBestWindows,
  studioChicagoDateTimeParts,
  studioChicagoWallToUtcMs,
  studioAddCivilDays,
  studioFlattenOccupiedByPlatform,
  studioOccupiedForPlatform,
  studioSuggestedLocalDatetime,
  studioScheduleOverridesFromPayload,
  studioBuildSuggestedScheduleMap,
  studioOccupiedSchedulesOrEmpty,
  studioDestinationScheduleStamp,
  studioLoadPlanScheduleOccupancy,
  studioInsightsLoadObservations,
  studioInsightsLoadLearned,
  studioInsightsResolveSeason,
  studioBuildSimilarHeatmap,
  studioInsightsSafeJson,
  studioInsightsMetaIdentity,
  studioInsightsConnectionStateFromError,
  keepFinishedOutputRows,
  fanoutProductionRequestOutputsToContentItems,
  finalizeProductionRequestPromotion,
  pulseStudioP2Handoff,
  promoteProductionRequestViaI3I4,
  promotionCompleted,
  waitForPromotionResult,
} from "./worker-functions-02.mjs";
import {
  respondStudioMappedList,
  libraryProfileScopeFormula,
  assetLibraryFilterFormula,
  deferItem4MakeHardening,
  item4EnsureR2StudioExactSourceGuard,
  item4EnsureP3StudioSourceAuthority,
  item4EnsureP3SingleParentRoute,
  item4DrainPreviewCacheWorker,
  phase6ParseJson,
  studioFirstLinkedId,
  studioContinuationLoadContext,
  studioContinuationStampPackage,
  studioOutputReadyForPublishApproval,
  studioActivePipelineSettings,
  studioFetchImageBytes,
  studioPublicJpegIsReachable,
  studioImageContentType,
  studioPutPublicObjectViaUploadWorker,
  studioPutPublicObjectMultipartFromDrive,
  studioPulseAp1c,
  studioPulseAp2c,
  studioPulseAp3c,
  studioDispatchApprovedPublishNow,
} from "./worker-functions-03.mjs";
import {
  approveOutputRecordForPublishing,
  chicagoNowParts,
  studioSettingsByName,
  studioUpsertSetting,
  mapDeskInventoryOutput,
  studioInternalJsonRequest,
} from "./worker-functions-04.mjs";

export function studioCronAirtableCadence(now = new Date(), cronExpr = "") {
  const date = now && typeof now.getUTCMinutes === "function" ? now : new Date(now);
  const minute = Number(date.getUTCMinutes()) || 0;
  const cron = String(cronExpr || "").trim();
  // Dedicated heavy cron expressions always run the full pass.
  if (cron === "0 * * * *" || cron === "30 * * * *") {
    return { heavy: true, insights: true, ingest: true, minute, cron };
  }
  const heavy = minute === 0 || minute === 30;
  return { heavy, insights: heavy, ingest: heavy, minute, cron };
}
/*__STUDIO_WORKER_END:studioCronAirtableCadence__*/

export function accessIdentity(request) {
  const directEmail = String(request.headers.get("Cf-Access-Authenticated-User-Email") || "").trim();
  const jwt = String(request.headers.get("Cf-Access-Jwt-Assertion") || "").trim();
  if (directEmail) return { email: directEmail, source: "access-email-header", jwt_present: Boolean(jwt) };

  // Access gates the protected Studio hostname before requests reach this Worker.
  // The direct authenticated-user email header is preferred. JWT payload decoding
  // remains a fallback identity display mechanism if that header is unavailable.
  if (jwt) {
    try {
      const payload = jwt.split(".")[1] || "";
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      const decoded = JSON.parse(atob(padded));
      const email = String(decoded.email || decoded.sub || "").trim();
      return { email: email || null, source: "access-jwt-payload", jwt_present: true };
    } catch {}
  }
  return { email: null, source: null, jwt_present: false };
}

/*__STUDIO_WORKER_END:accessIdentity__*/

export async function resolveAuthorization(request, env) {
  const identity = accessIdentity(request);
  const email = String(identity.email || "").trim().toLowerCase();

  const base = {
    authenticated: Boolean(identity.email || identity.jwt_present),
    authorized: false,
    email: identity.email,
    identity_source: identity.source,
    jwt_present: identity.jwt_present,
    user: null,
    membership: null,
    organization: null,
    brand: null,
    allowed_brands: [],
    role: null,
    permissions: ROLE_PERMISSIONS.Viewer,
    authorization_error: null,
  };

  if (!base.authenticated) {
    base.authorization_error = "No Cloudflare Access identity was present";
    return base;
  }

  if (!email) {
    base.authorization_error = "Authenticated identity did not contain an email address";
    return base;
  }

  const users = await listRecords(env, STUDIO_TABLES.users, { limit: 100 });
  const userRecord = users.find((record) =>
    String(f(record, "Email") || "").trim().toLowerCase() === email
  );

  if (!userRecord) {
    base.authorization_error = "Authenticated user is not registered in Studio Users";
    return base;
  }

  const userStatus = String(f(userRecord, "User_Status") || "").trim();
  const userActive = Boolean(f(userRecord, "Active"));
  if (!userActive || userStatus.toLowerCase() !== "active") {
    base.authorization_error = "Studio user is inactive";
    return base;
  }

  base.user = {
    record_id: userRecord.id,
    user_id: f(userRecord, "User_ID"),
    display_name: f(userRecord, "Display_Name"),
    email: f(userRecord, "Email"),
    status: userStatus,
  };

  const memberships = await listRecords(env, STUDIO_TABLES.memberships, { limit: 100 });
  const userMemberships = memberships.filter((record) => {
    const linkedUsers = Array.isArray(f(record, "User")) ? f(record, "User") : [];
    const active = Boolean(f(record, "Active"));
    const status = String(f(record, "Membership_Status") || "").trim().toLowerCase();
    return linkedUsers.includes(userRecord.id) && active && status === "active";
  });

  if (!userMemberships.length) {
    base.authorization_error = "No active Studio Membership was found for this user";
    return base;
  }

  const membershipRecord =
    userMemberships.find((record) => Boolean(f(record, "Is_Default"))) ||
    userMemberships[0];

  const role = String(f(membershipRecord, "Role") || "Viewer").trim();
  const organizationLinks = Array.isArray(f(membershipRecord, "Organization"))
    ? f(membershipRecord, "Organization")
    : [];
  const allowedBrandLinks = Array.isArray(f(membershipRecord, "Allowed_Brands"))
    ? f(membershipRecord, "Allowed_Brands")
    : [];
  const defaultBrandLinks = Array.isArray(f(membershipRecord, "Default_Brand"))
    ? f(membershipRecord, "Default_Brand")
    : [];

  if (!organizationLinks.length) {
    base.authorization_error = "Membership is not linked to an Organization";
    return base;
  }

  const [organizationRecord, allBrands] = await Promise.all([
    airtableFetch(env, STUDIO_TABLES.organizations, organizationLinks[0]),
    listRecords(env, STUDIO_TABLES.brands, { limit: 100 }),
  ]);

  const allowedBrandRecords = allBrands.filter((record) => allowedBrandLinks.includes(record.id));
  const defaultBrandRecord =
    allBrands.find((record) => defaultBrandLinks.includes(record.id)) ||
    allowedBrandRecords[0] ||
    null;

  base.membership = {
    record_id: membershipRecord.id,
    membership_id: f(membershipRecord, "Membership_ID"),
    is_default: Boolean(f(membershipRecord, "Is_Default")),
    status: f(membershipRecord, "Membership_Status"),
  };

  base.organization = {
    record_id: organizationRecord.id,
    organization_id: f(organizationRecord, "Organization_ID"),
    name: f(organizationRecord, "Organization_Name"),
  };

  base.allowed_brands = allowedBrandRecords.map((record) => ({
    record_id: record.id,
    brand_id: f(record, "Brand_ID"),
    name: f(record, "Brand_Name"),
  }));

  base.brand = defaultBrandRecord
    ? {
        record_id: defaultBrandRecord.id,
        brand_id: f(defaultBrandRecord, "Brand_ID"),
        name: f(defaultBrandRecord, "Brand_Name"),
      }
    : null;

  base.role = role;
  base.permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.Viewer;
  base.authorized = true;
  base.authorization_error = null;

  return base;
}
/*__STUDIO_WORKER_END:resolveAuthorization__*/

export async function resolveStudioCronAuthorization(env) {
  const preferred = String(env.STUDIO_CRON_USER_EMAIL || "chicagoshining@gmail.com").trim().toLowerCase();
  const tryEmail = async (email) => {
    const request = {
      headers: {
        get(name) {
          if (String(name || "").toLowerCase() === "cf-access-authenticated-user-email") return email;
          return "";
        },
      },
    };
    return resolveAuthorization(request, env);
  };
  let authorization = await tryEmail(preferred);
  if (authorization?.authorized && authorization.user?.record_id && authorization.organization?.record_id && authorization.brand?.record_id) {
    return authorization;
  }
  const users = await listRecords(env, STUDIO_TABLES.users, { limit: 100 }).catch(() => []);
  for (const user of users || []) {
    if (!Boolean(f(user, "Active"))) continue;
    const email = String(f(user, "Email") || "").trim().toLowerCase();
    if (!email || email === preferred) continue;
    authorization = await tryEmail(email);
    if (authorization?.authorized && authorization.user?.record_id && authorization.organization?.record_id && authorization.brand?.record_id) {
      return authorization;
    }
  }
  throw new HttpError(503, "Autonomous produce needs an active Studio user with organization and brand membership");
}
/*__STUDIO_WORKER_END:resolveStudioCronAuthorization__*/

export function membershipAllowsBrand(authorization, brandLinks) {
  if (!authorization?.authorized || !authorization?.organization?.record_id) return false;
  if (authorization?.permissions?.tenant_admin) return true;
  const links = Array.isArray(brandLinks) ? brandLinks : [];
  const allowed = new Set([
    authorization?.brand?.record_id,
    ...((authorization?.allowed_brands || []).map((brand) => brand.record_id)),
  ].filter(Boolean));
  if (links.some((id) => allowed.has(id))) return true;
  // City brands under the same Studio organization are selectable from the profile switcher.
  return true;
}
/*__STUDIO_WORKER_END:membershipAllowsBrand__*/

export function requireConfig(env) {
  const required = [
    "AIRTABLE_PAT",
    "AIRTABLE_BASE_ID",
    "AIRTABLE_IDEA_TABLE_ID",
    "AIRTABLE_CONTENT_TABLE_ID",
    "AIRTABLE_OUTPUT_TABLE_ID",
    "AIRTABLE_MEDIA_TABLE_ID",
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new HttpError(500, `Missing Worker configuration: ${missing.join(", ")}`);
}
/*__STUDIO_WORKER_END:requireConfig__*/

export function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean));
}
/*__STUDIO_WORKER_END:allowedOrigins__*/

export function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = allowedOrigins(env);
  if (!origin || !allowed.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}
/*__STUDIO_WORKER_END:corsHeaders__*/

export function corsPreflight(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigins(env).has(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}
/*__STUDIO_WORKER_END:corsPreflight__*/

export function respond(request, env, data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) },
  });
}
/*__STUDIO_WORKER_END:respond__*/

export function assertWriteRequest(request, env) {
  const origin = String(request.headers.get("Origin") || "").trim();
  const allowed = allowedOrigins(env);
  if (!origin || !allowed.has(origin)) {
    throw new HttpError(403, "Studio write request origin is not allowed");
  }

  const contentType = String(request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "Studio write requests must use application/json");
  }
}
/*__STUDIO_WORKER_END:assertWriteRequest__*/

export function assertOriginWriteRequest(request, env) {
  const origin = String(request.headers.get("Origin") || "").trim();
  const allowed = allowedOrigins(env);
  if (!origin || !allowed.has(origin)) {
    throw new HttpError(403, "Studio write request origin is not allowed");
  }
}
/*__STUDIO_WORKER_END:assertOriginWriteRequest__*/

export function assertUploadWriteRequest(request, env) {
  assertOriginWriteRequest(request, env);
  const contentType = String(request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    throw new HttpError(415, "Master media uploads must use multipart/form-data");
  }
}
/*__STUDIO_WORKER_END:assertUploadWriteRequest__*/

export async function readJsonBody(request, { required = true } = {}) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    if (required) throw new HttpError(400, "Request body must be valid JSON");
    return {};
  }
  if (required && (payload === null || typeof payload !== "object" || Array.isArray(payload))) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  return payload || {};
}
/*__STUDIO_WORKER_END:readJsonBody__*/

export function requirePermission(authorization, permission) {
  if (!authorization?.permissions?.[permission]) {
    throw new HttpError(403, `Permission required: ${permission}`);
  }
}
/*__STUDIO_WORKER_END:requirePermission__*/

export function requireAnyPermission(authorization, permissions) {
  const ok = (permissions || []).some((permission) => authorization?.permissions?.[permission]);
  if (!ok) throw new HttpError(403, `Permission required: ${(permissions || []).join(" or ")}`);
}
/*__STUDIO_WORKER_END:requireAnyPermission__*/

export function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
/*__STUDIO_WORKER_END:sleepMs__*/

export function airtableCooldownWaitMs() {
  return Math.max(0, airtableNextRequestAt - Date.now());
}/*__STUDIO_WORKER_END:airtableCooldownWaitMs__*/

export function airtableRetryDelayMs(response, attempt) {
  const raw = String(response?.headers?.get("Retry-After") || "").trim();
  const seconds = Number(raw);
  const parsedDate = Date.parse(raw);
  const headerMs = Number.isFinite(seconds) && raw !== "" ? seconds * 1000
    : Number.isFinite(parsedDate) ? Math.max(0, parsedDate - Date.now()) : 0;
  // Airtable's 429 cooldown is commonly 30 seconds; short 200ms retries
  // only increase load and keep the base rate-limited.
  return Math.max(30000, headerMs, Math.min(120000, 30000 * 2 ** (attempt - 1)))
    + Math.floor(Math.random() * 750);
}
/*__STUDIO_WORKER_END:airtableRetryDelayMs__*/

export function studioReadCachePrune() {
  if (studioHotReadCache.size < 48) return;
  const now = Date.now();
  for (const [key, hit] of studioHotReadCache) {
    if (!hit?.promise && now - Number(hit?.at || 0) > 120000) studioHotReadCache.delete(key);
  }
}
/*__STUDIO_WORKER_END:studioReadCachePrune__*/

export function studioReadCacheDropPrefix(prefix) {
  for (const key of studioHotReadCache.keys()) {
    if (String(key).startsWith(prefix)) studioHotReadCache.delete(key);
  }
}
/*__STUDIO_WORKER_END:studioReadCacheDropPrefix__*/

export async function studioSupabaseWriteThroughOutput(env, record, label = "output") {
  if (!studioSupabaseConfigured(env) || !record?.id) return { skipped: true };
  try {
    const result = await syncAirtableOutputRowToSupabase(env, record);
    studioMarkMappedListDirty();
    studioReadCacheDropPrefix("outputs:");
    studioReadCacheDropPrefix("schedule-grid:");
    return result;
  } catch (error) {
    console.warn(`supabase ${label} write-through failed`, record.id, error);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
/*__STUDIO_WORKER_END:studioSupabaseWriteThroughOutput__*/

export function studioInvalidateHotReads(env, tableId, method) {
  const verb = String(method || "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD") return;
  const id = String(tableId || "");
  if (env?.AIRTABLE_OUTPUT_TABLE_ID && id === env.AIRTABLE_OUTPUT_TABLE_ID) {
    studioMarkMappedListDirty();
    studioReadCacheDropPrefix("outputs:");
    studioReadCacheDropPrefix("schedule-grid:");
    studioReadCacheDropPrefix("content-recent-outputs:");
    studioReadCacheDropPrefix("content-list:");
  } else if (env?.AIRTABLE_IDEA_TABLE_ID && id === env.AIRTABLE_IDEA_TABLE_ID) {
    studioMarkMappedListDirty();
    studioReadCacheDropPrefix("ideas:");
  } else if (env?.AIRTABLE_CONTENT_TABLE_ID && id === env.AIRTABLE_CONTENT_TABLE_ID) {
    studioReadCacheDropPrefix("content-labels:");
    studioReadCacheDropPrefix("content-list:");
  } else if (id === "Production Requests") {
    studioReadCacheDropPrefix("production-requests:");
    studioReadCacheDropPrefix("produce-jobs:");
  } else if (env?.AIRTABLE_MEDIA_TABLE_ID && id === env.AIRTABLE_MEDIA_TABLE_ID) {
    studioReadCacheDropPrefix("music:");
  }
}
/*__STUDIO_WORKER_END:studioInvalidateHotReads__*/

export function studioReadCoalesce(key, ttlMs, loader) {
  studioReadCachePrune();
  const now = Date.now();
  const hit = studioHotReadCache.get(key);
  if (hit && hit.value !== undefined && now - hit.at < ttlMs) return Promise.resolve(hit.value);
  if (hit?.promise) return hit.promise;
  const promise = Promise.resolve().then(loader).then((value) => {
    const current = studioHotReadCache.get(key);
    // A write that dropped this key while the read was in flight must not
    // put the pre-write snapshot back into the cache.
    if (current?.promise === promise) studioHotReadCache.set(key, { at: Date.now(), value });
    return value;
  }).catch((error) => {
    const current = studioHotReadCache.get(key);
    if (current?.promise === promise) {
      const cooling = Number(error?.status) === 429 || /cooling down|rate.?limit|too many requests/i.test(String(error?.message || error || ""));
      if (cooling && current.value !== undefined) {
        studioHotReadCache.set(key, { at: current.at, value: current.value });
        return current.value;
      }
      if (current.value !== undefined) studioHotReadCache.set(key, { at: current.at, value: current.value });
      else studioHotReadCache.delete(key);
    }
    throw error;
  });
  studioHotReadCache.set(key, { at: hit?.at || 0, value: hit?.value, promise });
  return promise;
}
/*__STUDIO_WORKER_END:studioReadCoalesce__*/

export async function airtableBatchCreate(env, tableId, fieldRows, { typecast = true } = {}) {
  const rows = Array.isArray(fieldRows) ? fieldRows : [];
  const created = [];
  for (let i = 0; i < rows.length; i += AIRTABLE_BATCH_LIMIT) {
    const chunk = rows.slice(i, i + AIRTABLE_BATCH_LIMIT).map((fields) => ({ fields }));
    const body = await airtableFetch(env, tableId, "", {
      method: "POST",
      body: JSON.stringify({ records: chunk, typecast }),
    });
    created.push(...(Array.isArray(body?.records) ? body.records : []));
  }
  return created;
}
/*__STUDIO_WORKER_END:airtableBatchCreate__*/

export async function airtableBatchUpdate(env, tableId, updates, { typecast = true } = {}) {
  const rows = Array.isArray(updates) ? updates.filter((row) => row?.id && row?.fields) : [];
  const updated = [];
  for (let i = 0; i < rows.length; i += AIRTABLE_BATCH_LIMIT) {
    const chunk = rows.slice(i, i + AIRTABLE_BATCH_LIMIT).map((row) => ({
      id: row.id,
      fields: row.fields,
    }));
    const body = await airtableFetch(env, tableId, "", {
      method: "PATCH",
      body: JSON.stringify({ records: chunk, typecast }),
    });
    updated.push(...(Array.isArray(body?.records) ? body.records : []));
  }
  return updated;
}
/*__STUDIO_WORKER_END:airtableBatchUpdate__*/

export async function mapPool(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const results = new Array(list.length);
  let next = 0;
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  await Promise.all(Array.from({ length: limit }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= list.length) return;
      results[index] = await worker(list[index], index);
    }
  }));
  return results;
}
/*__STUDIO_WORKER_END:mapPool__*/

export function clampLimit(url, fallback = 50, max = 100) {
  const value = Number(url.searchParams.get("limit") || fallback);
  return Math.max(1, Math.min(max, Number.isFinite(value) ? Math.trunc(value) : fallback));
}
/*__STUDIO_WORKER_END:clampLimit__*/

export async function listRecords(env, tableId, options = {}) {
  const {
    limit = 50,
    view = null,
    sortDirection = "desc",
    filterFormula = null,
    fields = [],
  } = options;
  const sortField = options.sortField || null;
  const records = [];
  let offset = null;
  while (records.length < limit) {
    const params = new URLSearchParams();
    params.set("pageSize", String(Math.min(100, limit - records.length)));
    params.set("maxRecords", String(limit));
    if (view) params.set("view", view);
    if (filterFormula) params.set("filterByFormula", filterFormula);
    if (sortField) {
      params.set("sort[0][field]", sortField);
      params.set("sort[0][direction]", sortDirection);
    }
    for (const field of fields) {
      if (field) params.append("fields[]", String(field));
    }
    if (offset) params.set("offset", offset);
    const result = await airtableFetch(env, tableId, `?${params.toString()}`);
    const page = Array.isArray(result.records) ? result.records : [];
    records.push(...page);
    offset = result.offset || null;
    if (!offset || !page.length) break;
  }
  return records.slice(0, limit);
}
/*__STUDIO_WORKER_END:listRecords__*/

export async function listRecordsPage(env, tableId, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 12));
  const params = new URLSearchParams();
  params.set("pageSize", String(limit));
  if (options.view) params.set("view", options.view);
  if (options.filterFormula) params.set("filterByFormula", options.filterFormula);
  if (options.sortField) {
    params.set("sort[0][field]", options.sortField);
    params.set("sort[0][direction]", options.sortDirection || "desc");
  }
  if (options.offset) params.set("offset", String(options.offset));
  const result = await airtableFetch(env, tableId, `?${params.toString()}`);
  return {
    records: Array.isArray(result?.records) ? result.records : [],
    offset: result?.offset || null,
  };
}
/*__STUDIO_WORKER_END:listRecordsPage__*/

export function f(record, field) {
  return record?.fields?.[field] ?? null;
}
/*__STUDIO_WORKER_END:f__*/

export function studioOutputIsNativePhotoRoute(platform, outputType, mapping) {
  const p = String(platform || "").trim();
  const type = String(outputType || "").trim();
  const map = String(mapping || "").trim();
  if (p === "TikTok" && (type === "Multi-Photo" || type === "Single Photo" || map === "TikTok Slideshow")) return true;
  if (p === "Instagram" && (
    type === "Carousel" || type === "Single Image" || type === "Instagram Feed Post"
    || map === "Instagram Carousel" || map === "Instagram Feed Post"
  )) return true;
  if (p === "Facebook" && (
    type === "Multi-Image Post" || type === "Single Image" || type === "Facebook Post"
    || map === "Facebook Photo Set" || map === "Facebook Post"
  )) return true;
  return false;
}
/*__STUDIO_WORKER_END:studioOutputIsNativePhotoRoute__*/

export function studioOutputIsNativePhoto(record) {
  const platform = String(f(record, "Platform") || "").trim();
  const outputType = String(f(record, "Studio_Output_Type") || "").trim();
  const mapping = String(f(record, "Platform_Output_Type") || "").trim();
  const composition = String(f(record, "Composition_ID") || "").trim();
  const clips = String(f(record, "Render_Clip_List_JSON") || f(record, "Selected_Assets_JSON") || "").trim();
  const renderStatus = String(f(record, "Render_Status") || "").trim();
  const stillUrl = String(
    f(record, "Thumbnail_URL") || f(record, "Studio_Preview_URL") || f(record, "Publish_Asset_URL") || ""
  ).trim();
  if (!studioOutputIsNativePhotoRoute(platform, outputType, mapping)) return false;
  // TikTok Multi-Photo is composition-free by contract. IG/FB native packages may
  // still carry a stale Composition_ID from older promote paths; treat them as
  // reviewable when the photo package JSON is present.
  if (platform === "TikTok" && composition) return false;
  if (renderStatus === "Native Photo Route") return true;
  if (stillUrl) return true;
  if (!clips) return false;
  return true;
}
/*__STUDIO_WORKER_END:studioOutputIsNativePhoto__*/

export function studioNativeStillsNeedLettering(record) {
  const renderStatus = String(f(record, "Render_Status") || "").trim();
  if (renderStatus !== "Native Photo Route" && !studioOutputIsNativePhoto(record)) return false;
  const clips = selectedVisualClips(record);
  if (!clips.length) return false;
  return clips.some((clip) => {
    const url = String(clip?.url || clip?.src || "").trim();
    if (!url || /\/lettered\//i.test(url)) return false;
    const source = String(clip?.source || "").toLowerCase();
    const id = String(clip?.id || "");
    if (source.includes("ai_grid_cover") || id === "studio-ai-cover") return false;
    return true;
  });
}
/*__STUDIO_WORKER_END:studioNativeStillsNeedLettering__*/

export function studioOutputNeedsGridCoverForReview(record) {
  const platform = String(f(record, "Platform") || "").trim();
  const type = String(f(record, "Studio_Output_Type") || f(record, "Platform_Output_Type") || "").trim();
  if (/story/i.test(type)) return false;
  if (platform === "Instagram" && /single image|instagram feed post/i.test(type) && !/carousel|reel/i.test(type)) return false;
  if (platform === "Facebook" && /single image|facebook post/i.test(type) && !/reel|multi-image|photo set/i.test(type)) return false;
  return true;
}
/*__STUDIO_WORKER_END:studioOutputNeedsGridCoverForReview__*/

export function studioOutputHasReviewCover(record) {
  if (!studioOutputNeedsGridCoverForReview(record)) return true;
  return Boolean(studioAiThumbnailUrl(f(record, "Thumbnail_URL")));
}
/*__STUDIO_WORKER_END:studioOutputHasReviewCover__*/

export function studioOutputHasReviewableDeliverable(record) {
  if (studioOutputIsNativePhoto(record)) {
    const slides = (f(record, "Carousel Slides") || []).length;
    const clips = selectedVisualClips(record);
    // The Pipeline list intentionally omits Selected_Assets_JSON for performance.
    // Do not turn a completed native photo package into Preparing Assets / 0-of-3
    // merely because the list projection has no selected_clips array.
    // The detail/approve routes still read the complete record.
    const compactNativeReady = !clips.length
      && Number(f(record, "Selected_Clip_Count") || 0) > 0
      && String(f(record, "Output_Status") || "").trim() === "Ready for Review"
      && String(f(record, "Render_Status") || "").trim() === "Native Photo Route"
      && Boolean(studioClipPublicCdnUrl(f(record, "Studio_Preview_URL")));
    if (!slides && !clips.length && !compactNativeReady) return false;
    // Facebook/TikTok native photos do not require Instagram-style lettering
    // when all selected CDN images are present and production marked review-ready.
    const nativePhotoSetReady = clips.length > 0
      && ["Facebook", "TikTok"].includes(String(f(record, "Platform") || "").trim())
      && String(f(record, "Output_Status") || "").trim() === "Ready for Review"
      && studioNativeClipsArePublicCdn(record);
    if (studioNativeStillsNeedLettering(record) && !nativePhotoSetReady) return false;
    if (!studioOutputHasReviewCover(record)) return false;
    const preview = String(f(record, "Studio_Preview_URL") || "").trim();
    const firstClip = studioClipPublicCdnUrl(clips[0]);
    if (!slides && !preview && !firstClip && !studioNativeClipsArePublicCdn(record)) return false;
    return true;
  }
  if (!String(f(record, "Final_File_URL") || "").trim() && !String(f(record, "Final_File_ID") || "").trim()) return false;
  if (!studioOutputHasReviewCover(record)) return false;
  return true;
}
/*__STUDIO_WORKER_END:studioOutputHasReviewableDeliverable__*/

export function studioClipPublicCdnUrl(clipOrUrl) {
  const url = String(clipOrUrl?.url || clipOrUrl?.src || clipOrUrl || "").trim();
  return url.startsWith("https://media.chicagoshining.com/") ? url : "";
}
/*__STUDIO_WORKER_END:studioClipPublicCdnUrl__*/

export function item4UrlIsPublicPublishCdn(url) {
  const href = String(url || "").trim();
  if (!href.startsWith("https://media.chicagoshining.com/")) return false;
  if (studioUrlLooksLikeImage(href)) return false;
  const path = href.slice("https://media.chicagoshining.com/".length);
  return path.startsWith("studio/previews/") || path.startsWith("publish/");
}
/*__STUDIO_WORKER_END:item4UrlIsPublicPublishCdn__*/

export function studioYoutubePublicSourceUrl(record) {
  return ["Publish_Asset_URL", "Studio_Preview_URL"]
    .map((name) => String(f(record, name) || "").trim())
    .find((href) => item4UrlIsPublicPublishCdn(href)) || "";
}
/*__STUDIO_WORKER_END:studioYoutubePublicSourceUrl__*/

export function mapYoutubePrivateSourceDeskRow(record) {
  return {
    id: record?.id,
    output_id: f(record, "Output_ID"),
    output_title: f(record, "Output_Title"),
    content_item_id: studioFirstLinkedId(f(record, "Content_Item")),
    platform: f(record, "Platform"),
    platform_output_type: f(record, "Platform_Output_Type") || f(record, "Studio_Output_Type"),
    output_status: f(record, "Output_Status"),
    publish_status: f(record, "Publish_Status"),
    youtube_stage: f(record, "YouTube_Stage"),
    youtube_video_id: f(record, "YouTube_Video_ID"),
    final_file_url: f(record, "Final_File_URL"),
    publish_asset_url: f(record, "Publish_Asset_URL"),
    studio_preview_url: f(record, "Studio_Preview_URL"),
    youtube_error: f(record, "YouTube_Error_Message"),
    publish_error: f(record, "Publish_Error_Message"),
    publish_error_stage: f(record, "Publish_Error_Stage"),
    publish_asset_error: f(record, "Publish_Asset_Error_Message"),
    youtube_upload_job_id: f(record, "YouTube_Upload_Job_ID"),
  };
}
/*__STUDIO_WORKER_END:mapYoutubePrivateSourceDeskRow__*/

export function studioYoutubeFailedPrivateSource(record) {
  return Boolean(classifyYoutubePrivateSourceFail(mapYoutubePrivateSourceDeskRow(record)));
}
/*__STUDIO_WORKER_END:studioYoutubeFailedPrivateSource__*/

export function studioYoutubePublishAssetKey(record) {
  return youtubePublishAssetKey(f(record, "Output_ID"), f(record, "Final_File_ID"));
}
/*__STUDIO_WORKER_END:studioYoutubePublishAssetKey__*/

export async function studioStageYoutubePublicMp4FromDrive(env, record) {
  const existing = studioYoutubePublicSourceUrl(record);
  if (existing) return { url: existing, skip: "already-public" };
  const driveId = String(f(record, "Final_File_ID") || extractGoogleDriveFileId(f(record, "Final_File_URL")) || "").trim();
  if (!driveId) return { url: "", skip: "missing-drive-id" };
  const token = await item4GoogleAccessToken(env);
  if (!token) return { url: "", skip: "missing-google-token" };
  const auth = { Authorization: `Bearer ${token}` };
  const metaResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?fields=size,mimeType,name&supportsAllDrives=true`,
    { method: "GET", headers: auth }
  );
  const meta = await metaResponse.json().catch(() => ({}));
  if (!metaResponse.ok) return { url: "", skip: `drive-meta-${metaResponse.status}` };
  const size = Number(meta.size || 0);
  const key = studioYoutubePublishAssetKey(record);
  const outputId = String(f(record, "Output_ID") || record.id || "");
  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media&supportsAllDrives=true`;
  let staged = { url: "", skip: "not-attempted" };
  if (!shouldUseMultipart(size)) {
    const response = await fetch(mediaUrl, { method: "GET", headers: auth, redirect: "follow" });
    const type = String(response.headers.get("Content-Type") || "").toLowerCase();
    if (!response.ok || type.includes("text/html") || !response.body) {
      try { await response.body?.cancel(); } catch {}
      staged = { url: "", skip: `drive-http-${response.status}` };
    } else {
      staged = await studioPutPublicObjectViaUploadWorker(env, {
        key,
        body: response.body,
        contentType: "video/mp4",
        contentLength: size,
        outputId,
        finalFileId: driveId,
        retainClass: "publish",
      });
    }
  } else {
    staged = await studioPutPublicObjectMultipartFromDrive(env, {
      key,
      driveId,
      token,
      size,
      outputId,
      finalFileId: driveId,
      retainClass: "publish",
    });
  }
  if (!staged.url) return { url: "", skip: staged.skip || "upload-failed" };
  const fileName = `platform-output-${outputId || "output"}-${driveId}.mp4`;
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Publish_Asset_URL: staged.url,
        Publish_Asset_Host: "Cloudflare R2",
        Publish_Asset_File_Name: fileName,
        Publish_Asset_Error_Message: "",
        Publish_Error_Message: "",
        Studio_Preview_URL: staged.url,
      },
      typecast: true,
    }),
  });
  return { url: staged.url, skip: "" };
}
/*__STUDIO_WORKER_END:studioStageYoutubePublicMp4FromDrive__*/

export function item4FinishedVideoPreviewKey(requestId, assetId) {
  const req = String(requestId || "").trim();
  const id = String(assetId || "file").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "file";
  return `studio/previews/finished-video/${req}/${id}.mp4`;
}
/*__STUDIO_WORKER_END:item4FinishedVideoPreviewKey__*/

export function item4FinishedMasterPlayUrl(master, requestRecord) {
  const preview = String(master?.preview_public_url || "").trim();
  if (item4UrlIsPublicPublishCdn(preview)) return preview;
  const url = String(master?.url || master?.preview_url || "").trim();
  if (item4UrlIsPublicPublishCdn(url) && !/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url)) return url;
  const key = String(master?.preview_r2_key || "").trim().replace(/^\/+/, "");
  if (key.startsWith("studio/previews/")) return `${ITEM4_MEDIA_PUBLIC_BASE}/${key}`;
  return url;
}
/*__STUDIO_WORKER_END:item4FinishedMasterPlayUrl__*/

export function item4UrlIsPublicPlayableVideo(url) {
  const href = String(url || "").trim();
  if (!href.startsWith("https://media.chicagoshining.com/")) return false;
  if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(href)) return false;
  const path = href.slice("https://media.chicagoshining.com/".length);
  if (!(path.startsWith("studio/previews/") || path.startsWith("publish/") || path.startsWith("studio/master-assets/"))) return false;
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(href) || path.startsWith("studio/master-assets/");
}
/*__STUDIO_WORKER_END:item4UrlIsPublicPlayableVideo__*/

export function studioNativeClipsArePublicCdn(record) {
  const clips = selectedVisualClips(record);
  return clips.length > 0 && clips.every((clip) => studioClipPublicCdnUrl(clip));
}
/*__STUDIO_WORKER_END:studioNativeClipsArePublicCdn__*/

export function studioNativeSlidePublicFields(clip, platform) {
  const url = studioClipPublicCdnUrl(clip);
  if (!url) {
    return {
      Asset_4x5_Public_Status: "Needs Preparation",
      Shared_Asset_Approved: true,
    };
  }
  const fields = {
    Asset_4x5_Public_URL: url,
    Asset_4x5_Public_Status: "Ready",
    Shared_Asset_Approved: true,
  };
  if (platform === "Instagram") {
    fields.IG_Public_Asset_URL = url;
    fields.IG_Public_Asset_Status = "Ready";
  }
  if (platform === "TikTok") {
    fields.Asset_9x16_Public_URL = url;
    fields.Asset_9x16_Public_Status = "Ready";
  }
  return fields;
}
/*__STUDIO_WORKER_END:studioNativeSlidePublicFields__*/

export function studioUrlLooksLikeImage(url) {
  return /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(String(url || ""));
}
/*__STUDIO_WORKER_END:studioUrlLooksLikeImage__*/

export function studioUrlLooksLikeVideo(url) {
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(url || ""))
    || /\/current\.mp4/i.test(String(url || ""));
}
/*__STUDIO_WORKER_END:studioUrlLooksLikeVideo__*/

export function studioUrlLooksLikeDriveFile(url) {
  return /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?)/i.test(String(url || ""));
}
/*__STUDIO_WORKER_END:studioUrlLooksLikeDriveFile__*/

export function outputHasVideoFinal(record) {
  if (String(f(record, "Final_File_ID") || "").trim()) return true;
  return [
    f(record, "Final_File_URL"),
    f(record, "Output_URL"),
    f(record, "Publish_Asset_URL"),
    f(record, "Studio_Preview_URL"),
  ].some((value) => {
    const href = String(value || "").trim();
    return href && (studioUrlLooksLikeVideo(href) || studioUrlLooksLikeDriveFile(href));
  });
}
/*__STUDIO_WORKER_END:outputHasVideoFinal__*/

export function studioMappedPreviewUrl(record) {
  const stored = String(f(record, "Studio_Preview_URL") || "").trim();
  if (stored && studioUrlLooksLikeVideo(stored)) return stored;
  if (outputHasVideoFinal(record)) {
    return stored && !studioUrlLooksLikeImage(stored) ? stored : null;
  }
  return stored || studioNativeStillPreviewUrl(record) || null;
}
/*__STUDIO_WORKER_END:studioMappedPreviewUrl__*/

export function studioPublicJpegCoverUrl(record) {
  const candidates = [
    f(record, "Clip_1_URL"),
    f(record, "Selected_Clip_1_URL"),
    ...selectedVisualClips(record).map((clip) => clip?.url || clip?.src || clip),
    f(record, "Thumbnail_URL"),
  ];
  const urls = candidates.map((value) => studioClipPublicCdnUrl(value)).filter(Boolean);
  const jpeg = urls.find((url) => /\.(jpe?g)(\?|$)/i.test(url));
  return jpeg || urls[0] || "";
}
/*__STUDIO_WORKER_END:studioPublicJpegCoverUrl__*/

export function studioNativeStillPreviewUrl(record) {
  const stored = String(f(record, "Studio_Preview_URL") || "").trim();
  if (stored && studioUrlLooksLikeImage(stored)) return stored;
  return studioPublicJpegCoverUrl(record);
}
/*__STUDIO_WORKER_END:studioNativeStillPreviewUrl__*/

export function studioPreviewKind(record) {
  const stored = String(f(record, "Studio_Preview_URL") || "").trim();
  const finalUrl = String(f(record, "Final_File_URL") || "").trim();
  const still = studioNativeStillPreviewUrl(record);
  const nativePhoto = studioOutputIsNativePhoto(record) || studioOutputIsNativePhotoRoute(
    f(record, "Platform"),
    f(record, "Studio_Output_Type"),
    f(record, "Platform_Output_Type")
  );
  if (!nativePhoto && outputHasVideoFinal(record)) return "video";
  if (stored && studioUrlLooksLikeVideo(stored)) return "video";
  if (finalUrl && studioUrlLooksLikeVideo(finalUrl)) return "video";
  if (nativePhoto && (still || (stored && studioUrlLooksLikeImage(stored)))) return "still";
  if (stored && studioUrlLooksLikeImage(stored) && !outputHasVideoFinal(record)) return "still";
  if (stored || finalUrl) return "video";
  return still ? "still" : "none";
}
/*__STUDIO_WORKER_END:studioPreviewKind__*/

export function studioArmedPublishStatus(record, scheduledPostDate = null) {
  const raw = String(scheduledPostDate || f(record, "Scheduled_Post_Date") || "").trim();
  if (!raw) return "Ready to Publish";
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return "Ready to Publish";
  return ms <= Date.now() + 120000 ? "Ready to Publish" : "Ready to Schedule";
}
/*__STUDIO_WORKER_END:studioArmedPublishStatus__*/

export function studioPublishHandoffFields(record, options = {}) {
  const platform = String(f(record, "Platform") || "").trim();
  const outputType = String(f(record, "Studio_Output_Type") || "").trim();
  const mapping = String(f(record, "Platform_Output_Type") || "").trim();
  const preview = String(f(record, "Studio_Preview_URL") || "").trim();
  const clipCount = selectedVisualClips(record).length || Number(f(record, "Selected_Clip_Count") || 0) || 0;
  const current = (name) => String(f(record, name) || "").trim();
  const scheduledPostDate = options.scheduledPostDate != null
    ? options.scheduledPostDate
    : current("Scheduled_Post_Date");
  const armedPublish = studioArmedPublishStatus(record, scheduledPostDate);
  const cdnReady = studioNativeClipsArePublicCdn(record);
  const cover = studioPublicJpegCoverUrl(record);
  const existingThumb = current("Thumbnail_URL");
  const aiThumb = studioAiThumbnailUrl(existingThumb);
  const fields = {};
  if (!aiThumb && cover && (!existingThumb || item4UrlIsStudioPhotoCrop(existingThumb))) {
    fields.Thumbnail_URL = cover;
  }
  if (platform === "YouTube") {
    // Scheduled YouTube posts always target a public release. Immediate posts
    // default to public when unset. Upload uses private+publishAt when scheduled.
    if (current("YouTube_Scheduled_Publish_At") || scheduledPostDate || current("Scheduled_Post_Date")) {
      fields.YouTube_Privacy_Status = "public";
    } else if (!current("YouTube_Privacy_Status")) {
      fields.YouTube_Privacy_Status = "public";
    }
  }
  if (!current("Asset_Aspect_Family") && (
    /9:16/.test(String(f(record, "Aspect_Ratio") || ""))
    || outputType === "Story"
    || /Story|Reel|Short|Video Draft/.test(`${outputType} ${mapping}`)
  )) {
    fields.Asset_Aspect_Family = "9:16";
  }
  if (platform === "Instagram" && (outputType === "Reel" || mapping === "Instagram Reel") && outputType !== "Carousel" && mapping !== "Instagram Carousel") {
    if (preview.startsWith("https://media.chicagoshining.com/")) {
      fields.Publish_Asset_URL = preview;
      fields.Publish_Status = armedPublish;
    }
  }
  if (platform === "Instagram" && (outputType === "Story" || mapping === "Instagram Story")) {
    if (preview.startsWith("https://media.chicagoshining.com/")) {
      fields.Publish_Asset_URL = preview;
      fields.Publish_Status = armedPublish;
    }
  }
  if (platform === "Facebook" && (outputType === "Story" || mapping === "Facebook Story")) {
    if (preview.startsWith("https://media.chicagoshining.com/")) {
      fields.Publish_Asset_URL = preview;
      fields.Publish_Status = armedPublish;
    }
  }
  if (platform === "Instagram" && (outputType === "Carousel" || mapping === "Instagram Carousel")) {
    if (cdnReady) fields.IG_Carousel_Status = "Assets Ready";
    else if (!current("IG_Carousel_Status")) fields.IG_Carousel_Status = "Ready for Asset Prep";
    fields.Publish_Status = armedPublish;
    fields.Image_Output_Selected = true;
    if (clipCount) {
      // Instagram Graph carousel parent allows 2–10 children (#100 too many attachments).
      const igCarouselCount = Math.max(1, Math.min(Number(clipCount) || 1, 10));
      fields.Image_Count = igCarouselCount;
      fields.IG_Carousel_Child_Count = igCarouselCount;
    }
  }
  if (platform === "Instagram" && (outputType === "Single Image" || mapping === "Instagram Feed Post") && outputType !== "Carousel" && mapping !== "Instagram Carousel") {
    const cover = studioPublicJpegCoverUrl(record) || (preview.startsWith("https://media.chicagoshining.com/") ? preview : "");
    if (cover) {
      fields.Publish_Asset_URL = cover;
      if (!preview.startsWith("https://media.chicagoshining.com/")) fields.Studio_Preview_URL = cover;
    }
    fields.Publish_Status = armedPublish;
    fields.Image_Output_Selected = true;
    fields.Image_Count = clipCount || 1;
  }
  if (platform === "Facebook" && (outputType === "Single Image" || mapping === "Facebook Post") && outputType !== "Multi-Image Post" && mapping !== "Facebook Photo Set" && outputType !== "Slideshow Reel" && mapping !== "Facebook Reel") {
    fields.Image_Output_Selected = true;
    if (!current("FB_Publish_Status") || current("FB_Publish_Status") === "Retry Pending") {
      fields.FB_Publish_Status = "Ready for Assets";
    }
    const facebookImageCount = Math.max(1, Math.min(clipCount || 1, 10));
    fields.FB_Image_Publish_Mode = facebookImageCount > 1 ? "Multi-Photo Collage" : "Single Photo";
    fields.Publish_Status = armedPublish;
    fields.Image_Count = facebookImageCount;
  }
  if (platform === "Facebook" && (outputType === "Multi-Image Post" || mapping === "Facebook Photo Set")) {
    fields.Image_Output_Selected = true;
    if (!current("FB_Publish_Status") || current("FB_Publish_Status") === "Retry Pending") {
      fields.FB_Publish_Status = "Ready for Assets";
    }
    const facebookImageCount = Math.max(1, Math.min(clipCount || 1, 10));
    fields.FB_Image_Publish_Mode = facebookImageCount > 1 ? "Multi-Photo Collage" : "Single Photo";
    fields.Publish_Status = armedPublish;
    fields.Image_Count = facebookImageCount;
  }
  if (platform === "Facebook" && (outputType === "Slideshow Reel" || mapping === "Facebook Reel") && outputType !== "Multi-Image Post" && mapping !== "Facebook Photo Set") {
    if (preview.startsWith("https://media.chicagoshining.com/")) {
      if (!current("FB_Slideshow_Status") || current("FB_Slideshow_Status") === "Retry Pending") {
        fields.FB_Slideshow_Status = "Video Ready";
      }
      fields.FB_Slideshow_Public_URL = preview;
      fields.Publish_Status = armedPublish;
    }
  }
  if (platform === "YouTube") {
    if (preview.startsWith("https://media.chicagoshining.com/")) {
      fields.Publish_Asset_URL = preview;
    }
    fields.Publish_Status = armedPublish;
  }
  if (platform === "TikTok") {
    const draft = current("TikTok_Draft_Status");
    if (!draft || draft === "Ready for Assets" || draft === "Waiting for Schedule" || draft === "Not Selected") {
      fields.TikTok_Draft_Status = studioTikTokArmedDraftStatus(record, scheduledPostDate);
    }
    if (outputType === "Video Draft" || mapping === "TikTok Video") {
      fields.TikTok_Draft_Type = "Video";
      if (preview.startsWith("https://media.chicagoshining.com/")) fields.Publish_Asset_URL = preview;
      if (!current("Asset_Aspect_Family") && String(f(record, "Aspect_Ratio") || "").includes("9:16")) {
        fields.Asset_Aspect_Family = "9:16";
      }
    } else {
      const photoType = clipCount > 1 ? "Photo Carousel" : "Single Photo";
      fields.TikTok_Draft_Type = photoType;
      fields.Image_Output_Type = photoType;
      fields.Image_Output_Selected = true;
      fields.Image_Publish_Mode = "TikTok Draft";
      fields.Asset_Aspect_Family = "9:16";
      if (clipCount) fields.Image_Count = clipCount;
    }
    fields.Publish_Status = armedPublish;
  }
  return fields;
}
/*__STUDIO_WORKER_END:studioPublishHandoffFields__*/

export async function studioPatchExistingNativeSlides(env, record, slideIds, clips) {
  const platform = String(f(record, "Platform") || "").trim();
  const contentItemId = studioFirstLinkedId(f(record, "Content_Item"));
  if (!slideIds.length) return;
  const params = new URLSearchParams({
    filterByFormula: `OR(${slideIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`,
  });
  for (const field of ["Slide Number", "Current Order", "Current Image URL", "Asset_4x5_Public_Status", "IG_Public_Asset_Status"]) {
    params.append("fields[]", field);
  }
  const listed = await airtableFetch(env, "tblcnQDBvUngpjDED", `?${params.toString()}`);
  const rows = [...(listed.records || [])].sort((a, b) => {
    const order = (row) => Number(row?.fields?.["Current Order"] || row?.fields?.["Slide Number"] || 0);
    return order(a) - order(b);
  });
  const updates = rows.map((row, index) => {
    const clip = clips[index] || {};
    const url = studioClipPublicCdnUrl(clip) || studioClipPublicCdnUrl(row?.fields?.["Current Image URL"]);
    if (!url) return null;
    return {
      id: row.id,
      fields: {
        ...studioNativeSlidePublicFields({ url }, platform),
        "Current Image URL": url,
        "Final Image URL": url,
        "Watermarked Image URL": url,
        "Review Status": "Final Approved",
        "Approved For Final": true,
        ...(contentItemId ? { "Content Item": [contentItemId] } : {}),
      },
    };
  }).filter(Boolean);
  if (!updates.length) return;
  await airtableFetch(env, "tblcnQDBvUngpjDED", "", {
    method: "PATCH",
    body: JSON.stringify({ records: updates, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:studioPatchExistingNativeSlides__*/

export async function studioEnsureNativePublishSlides(env, record) {
  if (!studioOutputIsNativePhoto(record)) return record;
  const clips = selectedVisualClips(record);
  if (!clips.length) return record;
  const existing = f(record, "Carousel Slides") || [];
  if (existing.length) {
    await studioPatchExistingNativeSlides(env, record, existing, clips);
    return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id);
  }
  const platform = String(f(record, "Platform") || "").trim();
  const outputId = f(record, "Output_ID");
  const records = clips.map((clip, index) => {
    const url = String(clip.url || clip.src || "").trim();
    const driveId = String(clip.google_drive_file_id || "").trim();
    const driveUrl = String(clip.google_drive_url || "").trim();
    const order = Number(clip.order || index + 1);
    return {
      fields: {
        "Slide Name": `${platform} ${outputId} slide ${order}`,
        "Slide Number": order,
        "Current Order": order,
        "Is Cover": index === 0,
        "Current Image URL": url || null,
        "Final Image URL": url || null,
        "Watermarked Image URL": url || null,
        "Google Drive File ID": driveId || null,
        "Final Google Drive File ID": driveId || null,
        "Platform Output": [record.id],
        ...(studioFirstLinkedId(f(record, "Content_Item"))
          ? { "Content Item": [studioFirstLinkedId(f(record, "Content_Item"))] }
          : {}),
        "Platform": platform,
        "Aspect Ratio": String(clip.aspect_ratio || f(record, "Aspect_Ratio") || "").trim() || null,
        "Asset_4x5_File_ID": driveId || null,
        "Asset_4x5_File_URL": driveUrl || url || null,
        "Asset_Family_Key": String(clip.media_asset_record_id || clip.id || `${record.id}-${order}`).trim(),
        "Approved For Final": true,
        "Review Status": "Final Approved",
        ...studioNativeSlidePublicFields(clip, platform),
      },
    };
  });
  await airtableFetch(env, "tblcnQDBvUngpjDED", "", {
    method: "POST",
    body: JSON.stringify({ records, typecast: true }),
  });
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, record.id);
}
/*__STUDIO_WORKER_END:studioEnsureNativePublishSlides__*/

export function studioMixRerenderInProgress(record) {
  const fields = record?.fields || {};
  const text = (name) => String(fields[name] || "").trim();
  const review = text("Review_Status");
  const output = text("Output_Status").toLowerCase();
  const render = text("Render_Status").toLowerCase();
  // Only intentional creative re-renders. First-time Ready/Waiting/Rendering is
  // normal produce — do not paint those as "Rerendering".
  if (review !== "Changes Requested") return false;
  if (output.includes("in production")) return true;
  if (
    render.includes("ready for render")
    || render.includes("waiting in render queue")
    || render.includes("rendering")
  ) {
    return true;
  }
  return false;
}
/*__STUDIO_WORKER_END:studioMixRerenderInProgress__*/

export function normalizedOutputState(record) {
  const fields = record?.fields || {};
  const text = (name) => String(fields[name] || "").trim();
  const has = (name, value) => text(name).toLowerCase().includes(value.toLowerCase());

  if (studioMixRerenderInProgress(record)) return "Rerendering";

  const retryablePublish = Boolean(fields.Publish_Retry_Eligible);
  const youtubeVideoReady = Boolean(text("YouTube_Video_ID"))
    && (has("YouTube_Upload_Status", "uploaded") || has("YouTube_Processing_Status", "succeeded"));
  const thumbnailOnlyError = /thumb/i.test(text("Publish_Error_Stage") + " " + text("YouTube_Error_Message") + " " + text("Publish_Error_Message"));
  const igCarouselRateLimited = retryablePublish
    && /user is performing too many actions|rate limit|request limit/i.test(text("IG_Carousel_Error_Message"));

  const errors = [
    "Publish_Error_Message", "Remotion_Error_Message", "Final_File_Error_Message",
    "IG_Carousel_Error_Message", "Music_Error_Message", "FB_Slideshow_Error_Message",
    "YouTube_Error_Message", "YouTube_Processing_Failure_Reason", "YouTube_Rejection_Reason",
  ].some((name) => {
    if (!text(name)) return false;
    if ((name === "YouTube_Error_Message" || name === "Publish_Error_Message") && thumbnailOnlyError && (retryablePublish || youtubeVideoReady)) return false;
    return true;
  });

  const explicitFailed = [
    "Output_Status", "Render_Status", "Publish_Status", "Asset_Selection_Status",
    "IG_Carousel_Status", "TikTok_Draft_Status", "FB_Publish_Status", "FB_Slideshow_Status",
    "YouTube_Package_Status", "YouTube_Upload_Status", "YouTube_Processing_Status",
  ].some((name) => has(name, "failed") || has(name, "error") || has(name, "terminal error"));

  const outputStatusLc = text("Output_Status").toLowerCase();
  const publishStatusLc = text("Publish_Status").toLowerCase();
  const outputDeadEarly = outputStatusLc.includes("failed")
    || outputStatusLc.includes("terminal error")
    || outputStatusLc.includes("skipped");
  const publishDeadEarly = (publishStatusLc.includes("failed") || publishStatusLc.includes("error"))
    && !publishStatusLc.includes("manual publish required");
  const readyForReviewIntent = has("Output_Status", "ready for review")
    || has("Review_Status", "pending")
    || has("Review_Status", "review sent");
  const inProductionEarly = has("Output_Status", "in production");
  const hasFinishedFileEarly = Boolean(String(f(record, "Final_File_URL") || "").trim());
  // Final_File_URL means Remotion/Drive already finished even when Render_Status
  // was left on Rendering (Output 1807 YouTube Short / Content 374).
  const remotionFinishedEarly = hasFinishedFileEarly
    || (has("Render_Status", "rendered") && Boolean(String(f(record, "Studio_Preview_URL") || "").trim()));
  // Review-ready native stills / finished files beat leftover retry flags and stale error text.
  // Stale Review Sent must not win while Remotion is still In Production, or while
  // lettering / the 3D cover is still missing.
  // A pre-filled Publish_Status of "Ready to Schedule" must NOT beat Ready for Review
  // before Approve (Output 1795). Only approved / in-flight / published publish states
  // suppress the review badge. "Ready to Schedule" still maps to Scheduled later when
  // the row is already approved.
  const approvedOrScheduledEarly =
    has("Review_Status", "approved")
    || has("Output_Status", "approved for publishing")
    || has("Publish_Status", "scheduled")
    || has("Publish_Status", "publishing")
    || has("Publish_Status", "published")
    || has("TikTok_Draft_Status", "waiting for schedule")
    || has("TikTok_Draft_Status", "draft delivered");
  if (
    readyForReviewIntent
    && !approvedOrScheduledEarly
    && studioOutputHasReviewableDeliverable(record)
    && !outputDeadEarly
    && !publishDeadEarly
    && (!inProductionEarly || remotionFinishedEarly || studioOutputIsNativePhoto(record))
  ) {
    return "Ready for Review";
  }

  // Terminal success must win over stale manual flags and leftover error text.
  // Output 550 was Published while Manual_Fallback_Required stayed true — manual
  // must not beat Published. Output 372 had the same pattern with FB error text.
  if (has("Publish_Status", "published") || has("Output_Status", "published") || has("FB_Publish_Status", "published") || has("FB_Slideshow_Status", "published") || has("TikTok_Draft_Status", "publish complete") || text("YouTube_Stage") === "Complete") return "Published";

  // Live Short + daily quota is an automatic midnight retry. Do not paint
  // Manual Action Required even when YTS2 left Publish_Status=Manual Publish Required.
  if (youtubeLiveQuotaOnly(fields) && youtubeVideoReady) {
    return "Platform Processing";
  }

  // YouTube Manual Publish Required must win over leftover YouTube_Error_Message,
  // otherwise Studio keeps painting a red Failed badge after we park the row.
  // Also catch undeployed YTS2_POLL + quota/403 rows that never set Manual Publish Required.
  if (youtubeManualActionRequired(fields)) {
    return "Manual Action Required";
  }

  // Meta action throttling is a timed automatic retry, not a terminal failure.
  if (igCarouselRateLimited) return "Retry Pending";

  if ((errors || explicitFailed) && !(retryablePublish && thumbnailOnlyError && youtubeVideoReady)) {
    const output = text("Output_Status").toLowerCase();
    const render = text("Render_Status").toLowerCase();
    const publish = text("Publish_Status").toLowerCase();
    const outputDead = output.includes("failed") || output.includes("terminal error") || output.includes("skipped");
    const publishDead = publish.includes("failed") || publish.includes("error");
    // Queue wait / ready package must never show as Trying Again — only real
    // Remotion failures (delayRender, exit code, Chrome) while still in produce.
    const stillInProduce = output.includes("in production") || output.includes("rendering");
    const queuedOrReady = render.includes("ready for render") || render.includes("waiting in render queue");
    if (!outputDead && !publishDead && stillInProduce && isRealRemotionRetryFailure(record, f)) {
      return "Trying Again";
    }
    if (!outputDead && !publishDead && queuedOrReady) {
      // Fall through to Waiting in Render Queue / ready labels below.
    } else {
      return "Failed";
    }
  }

  if (
    has("Publish_Status", "manual publish required")
    || has("TikTok_Draft_Status", "manual action")
    || has("TikTok_Draft_Status", "manual fallback")
    || has("Manual_Completion_Status", "required")
    || has("Music_Status", "manual action")
    || fields.Manual_Fallback_Required
  ) return "Manual Action Required";
  if (has("FB_Slideshow_Status", "reel processing") || has("IG_Story_Status", "publishing")) return "Platform Processing";
  if (youtubeVideoReady && !has("Publish_Status", "published") && text("YouTube_Stage") !== "Complete") return "Platform Processing";
  if (has("TikTok_Draft_Status", "draft delivered")) return "Draft Delivered";
  if (has("YouTube_Upload_Status", "uploading") || has("FB_Slideshow_Status", "uploading") || has("Publish_Status", "publishing")) return "Uploading";
  if (has("YouTube_Processing_Status", "processing") || has("FB_Slideshow_Status", "processing") || has("TikTok_Draft_Status", "processing") || has("IG_Carousel_Status", "processing")) return "Platform Processing";
  // "Ready to Schedule" must win over stale Publish_Retry_Eligible and Approved — future-dated posts are armed, not waiting on retry.
  if (has("Publish_Status", "ready to schedule") || text("Publish_Status").toLowerCase() === "scheduled" || has("TikTok_Draft_Status", "waiting for schedule")) return "Scheduled";
  if (has("Publish_Status", "scheduled")) return "Scheduled";
  // A leftover retry flag must not hide a YouTube video that is already on the platform.
  if (!youtubeVideoReady && (fields.Publish_Retry_Eligible || fields.Asset_Selection_Retry_Eligible || has("FB_Slideshow_Status", "retry") || has("TikTok_Draft_Status", "retry"))) return "Retry Pending";
  // Publisher "Ready for Assets" is the start of upload, not a rewind to Studio
  // asset selection. Approved/reviewable work must win or Approve drops 65% → 30%.
  if (has("Review_Status", "approved") || has("Output_Status", "approved")) return "Approved";
  // Stale Review Sent / leftover preview URLs must not win while the output is
  // still In Production without a finished Remotion file (package rebuild).
  const inProduction = has("Output_Status", "in production");
  const hasFinishedFile = Boolean(String(f(record, "Final_File_URL") || "").trim());
  const remotionFinished = has("Render_Status", "rendered") && (hasFinishedFile || Boolean(String(f(record, "Studio_Preview_URL") || "").trim()));
  if (!inProduction || remotionFinished || studioOutputIsNativePhoto(record)) {
    if ((has("Review_Status", "pending") || has("Review_Status", "review sent") || has("Output_Status", "ready for review")) && studioOutputHasReviewableDeliverable(record)) return "Ready for Review";
    if (has("Render_Status", "rendered") && studioOutputHasReviewableDeliverable(record)) return "Ready for Review";
  }
  if (has("Render_Status", "waiting in render queue")) return "Waiting in Render Queue";
  if (isActiveRemotionHold(record, f) || has("FB_Slideshow_Status", "rendering") || has("FB_Slideshow_Status", "starting render")) {
    return "Rendering";
  }
  if (studioNativeStillsNeedLettering(record)) return "Rendering";
  if ((readyForReviewIntent || has("Render_Status", "rendered") || has("Render_Status", "native photo route")) && !studioOutputHasReviewableDeliverable(record)) {
    return "Preparing Assets";
  }
  if (inProduction && !remotionFinished && !studioOutputIsNativePhoto(record)) {
    const remotionStarted = Boolean(String(f(record, "Remotion_Job_ID") || "").trim());
    if (has("Render_Status", "ready for render") && !remotionStarted) return "Waiting in Render Queue";
    if (remotionStarted && has("Render_Status", "rendering")) return "Rendering";
    if (hasFinishedFile || Boolean(String(f(record, "Studio_Preview_URL") || "").trim())) return "Rendering";
  }
  const studioAssetPrep = has("Asset_Selection_Status", "needs selection") || has("Asset_Selection_Status", "selecting");
  const publisherAssetPrep = has("TikTok_Draft_Status", "ready for assets") || has("TikTok_Draft_Status", "preparing assets") || has("FB_Publish_Status", "ready for assets") || has("FB_Publish_Status", "preparing assets");
  if (studioAssetPrep || (!studioOutputHasReviewableDeliverable(record) && publisherAssetPrep)) return "Preparing Assets";
  if (has("Output_Status", "skipped")) return "Skipped";
  if (inProduction) return "Preparing Assets";
  return "Queued";
}
/*__STUDIO_WORKER_END:normalizedOutputState__*/

export function contentLifecycleFromOutputs(outputRecords = []) {
  const list = Array.isArray(outputRecords) ? outputRecords.filter(Boolean) : [];
  if (!list.length) return null;
  const states = list.map((record) => normalizedOutputState(record));
  const counts = {};
  for (const state of states) counts[state] = (counts[state] || 0) + 1;
  const allTerminal = states.every((state) => CONTENT_OUTPUT_TERMINAL_STATES.has(state));

  let studioStage = "In Pipeline";
  if (allTerminal) {
    if (states.every((state) => state === "Published" || state === "Skipped")) studioStage = "Published";
    else if (states.some((state) => state === "Scheduled")) studioStage = "Scheduled";
    else if (states.some((state) => state === "Draft Delivered")) studioStage = "Draft Delivered";
    else studioStage = "Complete";
  } else if (states.some((state) => ["Failed", "Manual Action Required", "Retry Pending"].includes(state))) {
    studioStage = "Needs Attention";
  } else if (states.some((state) => state === "Ready for Review")) {
    studioStage = "Review";
  } else if (states.some((state) => state === "Rendering" || state === "Rerendering" || String(state || "").startsWith("Waiting in render queue") || state === "Waiting in Render Queue")) {
    studioStage = "Rendering";
  } else if (states.some((state) => ["Uploading", "Platform Processing", "Approved"].includes(state))) {
    studioStage = states.some((state) => state === "Uploading" || state === "Platform Processing")
      ? "Publishing"
      : "Approved";
  } else if (states.some((state) => state === "Preparing Assets")) {
    studioStage = "Preparing Assets";
  }

  const earlyRender = new Set(["Queued", "Preparing Assets", "Rendering", "Waiting in Render Queue"]);
  const incompleteRender = new Set(["Queued", "Preparing Assets", "Rendering", "Rerendering", "Trying Again", "Waiting in Render Queue"]);
  const total = states.length;
  const renderedCount = states.filter((state) => {
    const label = String(state || "");
    return !incompleteRender.has(label) && !label.startsWith("Waiting in render queue");
  }).length;
  let renderStatus = null;
  if (states.some((state) => {
    const label = String(state || "");
    return state === "Rendering" || state === "Trying Again" || state === "Waiting in Render Queue" || label.startsWith("Waiting in render queue");
  })) {
    renderStatus = `Rendering ${renderedCount}/${total}`;
  } else if (states.every((state) => !earlyRender.has(state) && !String(state || "").startsWith("Waiting in render queue"))) {
    renderStatus = "Ready";
  }

  let reviewStatus = null;
  if (states.some((state) => state === "Ready for Review")) reviewStatus = "Ready for Review";
  else if (allTerminal) reviewStatus = "Complete";
  else if (states.some((state) => ["Approved", "Scheduled", "Published", "Uploading", "Platform Processing", "Draft Delivered"].includes(state))) {
    reviewStatus = "Approved";
  }

  return {
    studio_stage: studioStage,
    render_status: renderStatus,
    review_status: reviewStatus,
    lifecycle_complete: allTerminal,
    output_state_counts: counts,
  };
}
/*__STUDIO_WORKER_END:contentLifecycleFromOutputs__*/

export function normalizedContentStage(record, outputRecords = null) {
  const rollup = contentLifecycleFromOutputs(outputRecords);
  if (rollup?.studio_stage) return rollup.studio_stage;

  const fields = record?.fields || {};
  const value = (name) => String(fields[name] || "").toLowerCase();
  if (value("Content_Status").includes("archived")) return "Archived";
  if (value("Review_Status").includes("ready for review") || value("Carousel_Review_Status").includes("ready for review") || value("Carousel_Review_Status").includes("review sent")) return "Review";
  if (value("Render_Status").includes("render")) return value("Render_Status").includes("rendered") ? "Review" : "Rendering";
  if (["needs assets", "partial match"].some((s) => value("Asset_Match_Status").includes(s))) return "Assets Needed";

  // Platform Outputs are the live lifecycle. Leftover Content_Status / Generated
  // flags on the parent must not freeze the Production table on "Generating".
  const outputLinks = Array.isArray(fields["Platform Outputs"]) ? fields["Platform Outputs"] : [];
  if (outputLinks.length) return "In Pipeline";

  if (value("Content_Status").includes("ready for") || value("Content_Status").includes("generated") || value("Script_Status").includes("generated") || value("Voiceover_Status").includes("generated") || value("Thumbnail_Status").includes("generated")) return "Generating";
  return "Configuring";
}
/*__STUDIO_WORKER_END:normalizedContentStage__*/

export function mapIdea(record) {
  return {
    id: record.id,
    candidate_id: f(record, "Candidate_ID"),
    title: f(record, "Candidate_Title"),
    summary: f(record, "Idea_Summary"),
    status: f(record, "Candidate_Status"),
    priority_score: f(record, "Priority_Score"),
    content_type: f(record, "Production_Content_Type"),
    platforms: f(record, "Production_Target_Platforms") || [],
    carousel_slide_count: f(record, "Production_Carousel_Slide_Count"),
    carousel_slide_count_mode: f(record, "Production_Carousel_Slide_Count_Mode") || null,
    carousel_slide_count_min: f(record, "Production_Carousel_Slide_Count_Min"),
    carousel_slide_count_max: f(record, "Production_Carousel_Slide_Count_Max"),
    carousel_image_mode: f(record, "Production_Carousel_Image_Mode"),
    photo_wait_status: f(record, "Studio_Photo_Wait_Status") || null,
    photo_listening_paused: ideaManagePhotoPauseActive(f(record, "Production_Config_Notes")),
    photo_match: parseIdeaPhotoMatchJson(f(record, "Studio_Photo_Match_JSON")),
    matched_media_asset_links: f(record, "Studio_Matched_Media_Assets") || [],
    library_asset_ids: [...new Set([
      ...(Array.isArray(f(record, "Studio_Matched_Media_Assets")) ? f(record, "Studio_Matched_Media_Assets") : []),
      ...parseIdeaNotedMediaIds(f(record, "Production_Config_Notes")),
    ].map((id) => String(id || "").trim()).filter(Boolean))],
    production_notes_user: parseIdeaMachineNotes(f(record, "Production_Config_Notes")).user,
    production_request_links: f(record, "Production Requests") || f(record, "Production_Request") || [],
    video_clip_count: f(record, "Production_Video_Clip_Count"),
    include_voiceover: f(record, "Production_Include_Voiceover"),
    include_background_music: f(record, "Production_Include_Background_Music"),
    include_thumbnail: f(record, "Production_Include_Thumbnail"),
    video_duration: f(record, "Production_Video_Duration"),
    voiceover_tail_seconds: f(record, "Voiceover_Tail_Seconds"),
    production_notes: String(f(record, "Production_Config_Notes") || "").trim(),
    created_at: f(record, "Create_Date"),
    content_item_links: f(record, "Content Items") || [],
    promoted_content_record_id: f(record, "Promoted_Content_Record_ID"),
    content_profile_links: f(record, "Content_Profile") || [],
    brand_name: f(record, "Brand_Name") || [],
    market_name: f(record, "Market_Name") || [],
    primary_location: String(f(record, "Primary_Location") || "").trim() || null,
    neighborhood_or_area: String(f(record, "Neighborhood_or_Area") || "").trim() || null,
    studio_pre_hold_status: f(record, "Studio_PreHold_Status"),
    studio_hold_at: f(record, "Studio_Hold_At"),
    studio_hold_by: f(record, "Studio_Hold_By"),
    is_on_hold: String(f(record, "Candidate_Status") || "").trim() === "On Hold",
    production_request_id: firstIdeaProductionRequestId(record),
  };
}
/*__STUDIO_WORKER_END:mapIdea__*/

export function parseIdeaPhotoMatchJson(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
/*__STUDIO_WORKER_END:parseIdeaPhotoMatchJson__*/

export function firstIdeaProductionRequestId(record) {
  const links = Array.isArray(f(record, "Production Requests"))
    ? f(record, "Production Requests")
    : (Array.isArray(f(record, "Production_Request")) ? f(record, "Production_Request") : []);
  return String(links[0] || "").trim() || null;
}
/*__STUDIO_WORKER_END:firstIdeaProductionRequestId__*/

export function ideaPhotoWaitApplies(input = {}) {
  const contentType = String(input.content_type || "").trim();
  const mode = String(input.carousel_slide_count_mode || "").trim();
  const imageMode = String(input.carousel_image_mode || "").trim();
  return IDEA_PHOTO_WAIT_TYPES.has(contentType)
    && mode === "Target range"
    && imageMode !== "Make AI Generated";
}
/*__STUDIO_WORKER_END:ideaPhotoWaitApplies__*/

export function sortHighConfidenceMatches(matches) {
  return [...(matches || [])]
    .filter((row) => String(row?.confidence || "") === "high" && row?.id)
    .sort((a, b) => {
      const dateA = String(a.intake_date || "");
      const dateB = String(b.intake_date || "");
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDiff) return scoreDiff;
      return String(a.id).localeCompare(String(b.id));
    });
}
/*__STUDIO_WORKER_END:sortHighConfidenceMatches__*/

export function selectMatchedPhotos({ matches, min, max, pendingBatchIds, force = false } = {}) {
  const floor = Math.max(1, Number(min) || 0);
  const cap = Math.max(floor, Number(max) || floor);
  const high = sortHighConfidenceMatches(matches);
  const pending = new Set(Array.isArray(pendingBatchIds) ? pendingBatchIds.filter(Boolean) : []);
  if (high.length < floor) {
    return { action: "wait", high_count: high.length, selected: [], reason: "below_min" };
  }
  if (!force) {
    const blocked = high.some((row) => row.intake_batch_id && pending.has(row.intake_batch_id));
    if (blocked) {
      return { action: "wait_batch", high_count: high.length, selected: [], reason: "intake_batch_in_progress" };
    }
  }
  return {
    action: "ready",
    high_count: high.length,
    selected: high.slice(0, cap),
    reason: "min_met_take_all_up_to_max",
  };
}
/*__STUDIO_WORKER_END:selectMatchedPhotos__*/

export function mapContent(record, outputRecords = null) {
  const linkedOutputs = Array.isArray(outputRecords) ? outputRecords : null;
  const rollup = contentLifecycleFromOutputs(linkedOutputs);
  const rawRender = f(record, "Render_Status");
  const rawReview = f(record, "Review_Status");
  return {
    id: record.id,
    content_id: f(record, "Content_ID"),
    title: f(record, "Content_Title"),
    content_type: f(record, "Content_Type"),
    content_status: f(record, "Content_Status"),
    studio_stage: normalizedContentStage(record, linkedOutputs),
    asset_match_status: f(record, "Asset_Match_Status"),
    script_status: f(record, "Script_Status"),
    voiceover_status: f(record, "Voiceover_Status"),
    thumbnail_status: f(record, "Thumbnail_Status"),
    render_status: rollup?.render_status || rawRender,
    review_status: rollup?.review_status || rawReview,
    carousel_review_status: f(record, "Carousel_Review_Status"),
    duration: f(record, "Content_Duration"),
    primary_location: String(f(record, "Primary_Location") || "").trim() || null,
    neighborhood_or_area: String(f(record, "Neighborhood_or_Area") || "").trim() || null,
    content_themes: f(record, "Content_Themes") || [],
    include_voiceover: f(record, "Include_Voiceover"),
    include_background_music: f(record, "Include_Background_Music"),
    include_thumbnail: f(record, "Include_Thumbnail"),
    video_clip_count: f(record, "Video_Clip_Count"),
    music_url: f(record, "Music_URL"),
    voiceover_url: f(record, "Voiceover_URL"),
    thumbnail_url: f(record, "Thumbnail_URL"),
    output_links: f(record, "Platform Outputs") || [],
    production_request_links: f(record, "Production Requests") || f(record, "Production_Request") || [],
    created_at: f(record, "Created_At"),
    content_profile_links: f(record, "Content_Profile") || [],
    brand_name: f(record, "Brand_Name") || [],
    market_name: f(record, "Market_Name") || [],
    lifecycle_complete: normalizedContentStage(record, linkedOutputs) === "Archived" || Boolean(rollup?.lifecycle_complete),
    output_state_counts: rollup?.output_state_counts || null,
  };
}
/*__STUDIO_WORKER_END:mapContent__*/

export function outputProgressMilestoneFloor(record) {
  if (studioMixRerenderInProgress(record)) return 50;
  const review = String(f(record, "Review_Status") || "").toLowerCase();
  const output = String(f(record, "Output_Status") || "").toLowerCase();
  const render = String(f(record, "Render_Status") || "").toLowerCase();
  const publish = String(f(record, "Publish_Status") || "").toLowerCase();
  if (publish.includes("published") || output === "published") return 100;
  if (review === "approved" || output.includes("approved")) return 75;
  if (
    render === "rendered"
    || ((output.includes("ready for review") || review.includes("review sent") || review === "pending")
      && studioOutputHasReviewableDeliverable(record))
  ) return 65;
  if (render.includes("waiting in render queue")) return 45;
  if (render.includes("rendering") || render.includes("ready for render")) return 50;
  return 0;
}
/*__STUDIO_WORKER_END:outputProgressMilestoneFloor__*/

export function outputProgressPercent(record, state, job = null) {
  const processingRaw = f(record, "YouTube_Processing_Progress_Percent");
  const uploadRaw = f(record, "YouTube_Upload_Progress_Percent");
  const processing = processingRaw === null || processingRaw === "" ? null : Number(processingRaw);
  const upload = uploadRaw === null || uploadRaw === "" ? null : Number(uploadRaw);
  if (state === "Published") return 100;
  if (state === "Failed") return 0;

  const defaults = {
    Queued: 5,
    "Preparing Assets": 30,
    "Waiting in Render Queue": 45,
    Rendering: 50,
    Rerendering: 50,
    "Ready for Review": 65,
    Approved: 75,
    Scheduled: 80,
    Uploading: 85,
    "Platform Processing": 88,
    "Draft Delivered": 92,
    "Manual Action Required": 85,
    "Retry Pending": 60,
    Failed: 0,
    Skipped: 100,
  };
  let computed = defaults[state] ?? null;
  if (computed == null && String(state || "").startsWith("Waiting in render queue")) {
    computed = 45;
  }
  const jobPercent = Number(job?.percent);
  if (
    Number.isFinite(jobPercent)
    && ["Queued", "In Production", "Preparing Assets", "Rendering"].includes(state)
  ) {
    computed = Math.max(0, Math.min(100, jobPercent));
  }
  // A stored 0% YouTube upload percent is "job accepted, no bytes yet" — do not
  // collapse Uploading/Processing to 0% on the Pipeline bar. Do not let a completed
  // upload percent paint Retry Pending as 100%.
  if ((state === "Uploading" || state === "Platform Processing") && Number.isFinite(processing) && processing > 0) {
    computed = Math.max(0, Math.min(100, processing));
  } else if ((state === "Uploading" || state === "Platform Processing") && Number.isFinite(upload) && upload > 0) {
    computed = Math.max(0, Math.min(100, upload));
  }
  const floor = outputProgressMilestoneFloor(record);
  if (computed == null && !floor) return null;
  return Math.max(floor, computed == null ? 0 : computed);
}
/*__STUDIO_WORKER_END:outputProgressPercent__*/

export function platformPublishStatus(record) {
  const platform = String(f(record, "Platform") || "").toLowerCase();
  if (platform === "facebook") return f(record, "FB_Publish_Status") || f(record, "FB_Slideshow_Status") || f(record, "Publish_Status");
  if (platform === "tiktok") {
    const draft = String(f(record, "TikTok_Draft_Status") || "").trim();
    const publish = String(f(record, "Publish_Status") || "").trim();
    // Future-dated TikTok drafts keep an internal arming status, but the Pipeline
    // publish column should say the post is waiting on schedule — not asset work.
    if (/waiting for schedule/i.test(draft)) return draft;
    if (/ready to schedule/i.test(publish) || (!studioTikTokInboxIsDue(record) && /ready for assets/i.test(draft))) {
      return "Waiting for Schedule";
    }
    return draft || publish;
  }
  if (platform === "youtube") return f(record, "Publish_Status") || f(record, "YouTube_Processing_Status") || f(record, "YouTube_Upload_Status");
  return f(record, "Publish_Status");
}
/*__STUDIO_WORKER_END:platformPublishStatus__*/

export function cleanMusicDisplayName(name) {
  let value = String(name || "").trim();
  value = value.replace(/^[-–—\s]+/, "");
  value = value.replace(/\.(mp3|wav|m4a|aac|flac)$/i, "");
  value = value.replace(/_AdobeStock_?\d+/gi, "");
  value = value.replace(/AdobeStock_?\d+/gi, "");
  value = value.replace(/[_]+/g, " ");
  value = value.replace(/\s*-\s*$/g, "");
  value = value.replace(/\s{2,}/g, " ").trim();
  return value || String(name || "Untitled track");
}
/*__STUDIO_WORKER_END:cleanMusicDisplayName__*/

export function selectedVisualClips(record) {
  const parsed = phase6ParseJson(f(record, "Selected_Assets_JSON"), null);
  if (!parsed || typeof parsed !== "object") return [];
  if (Array.isArray(parsed.selected_clips) && parsed.selected_clips.length) return parsed.selected_clips;
  if (Array.isArray(parsed.clips) && parsed.clips.length) return parsed.clips;
  return [];
}
/*__STUDIO_WORKER_END:selectedVisualClips__*/

export function outputCreativeAvailable(record) {
  // Creative review opens for native packages with slides, or whenever a
  // finished/preview file exists. Linked carousel slides alone do not unlock
  // Remotion video review while the MP4 is still being rebuilt.
  if (studioOutputIsNativePhoto(record) && (f(record, "Carousel Slides") || []).length) return true;
  if (f(record, "Creative_Render_Manifest_JSON")) return true;
  return studioOutputHasReviewableDeliverable(record);
}
/*__STUDIO_WORKER_END:outputCreativeAvailable__*/

export function mapOutput(record, job = null, queueMeta = null, contentRecord = null) {
  let studioState = normalizedOutputState(record);
  const renderStatus = String(f(record, "Render_Status") || "").trim();
  const hasJob = Boolean(String(f(record, "Remotion_Job_ID") || "").trim());
  if (queueMeta?.label && isRenderQueueCandidateStatus(renderStatus) && !hasJob) {
    studioState = queueMeta.label;
  } else if (studioState === "Waiting in Render Queue") {
    studioState = queueMeta?.label || "Waiting in render queue";
  }
  const studioJob = job && typeof job === "object" ? job : null;
  return {
    id: record.id,
    output_id: f(record, "Output_ID"),
    platform: f(record, "Platform"),
    format: f(record, "Format"),
    platform_output_type: f(record, "Platform_Output_Type"),
    studio_output_type: f(record, "Studio_Output_Type"),
    aspect_ratio: f(record, "Aspect_Ratio"),
    output_status: f(record, "Output_Status"),
    studio_state: studioState,
    render_status: f(record, "Render_Status"),
    remotion_job_id: f(record, "Remotion_Job_ID"),
    remotion_error_message: f(record, "Remotion_Error_Message"),
    final_file_error_message: f(record, "Final_File_Error_Message"),
    render_queue_position: queueMeta?.position || null,
    render_queue_total: queueMeta?.total || null,
    render_queue_label: queueMeta?.label || null,
    review_status: f(record, "Review_Status"),
    publish_status: f(record, "Publish_Status"),
    platform_publish_status: platformPublishStatus(record),
    studio_progress_percent: outputProgressPercent(record, studioState, studioJob),
    studio_production_job: studioJob,
    studio_job_label: studioProductionJobLabel(studioJob),
    studio_job_error: studioJob?.error || null,
    publish_method: f(record, "Publish_Method"),
    auto_publish_enabled: Boolean(f(record, "Auto_Publish_Enabled")),
    do_not_publish: Boolean(f(record, "Do_Not_Publish")),
    final_file_url: f(record, "Final_File_URL"),
    final_file_id: f(record, "Final_File_ID"),
    publish_asset_url: f(record, "Publish_Asset_URL"),
    output_title: f(record, "Output_Title"),
    output_caption: f(record, "Output_Caption"),
    output_notes: f(record, "Output_Notes"),
    output_hashtags: f(record, "Output_Hashtags"),
    thumbnail_url: f(record, "Thumbnail_URL"),
    scheduled_post_date: f(record, "Scheduled_Post_Date"),
    scheduled_at: f(record, "Studio_Scheduled_At"),
    youtube_scheduled_publish_at: f(record, "YouTube_Scheduled_Publish_At"),
    studio_preview_url: studioMappedPreviewUrl(record),
    native_still_url: studioNativeStillPreviewUrl(record) || null,
    preview_kind: studioPreviewKind(record),
    output_url: f(record, "Output_URL"),
    platform_post_url: f(record, "Platform_Post_URL"),
    platform_post_id: f(record, "Platform_Post_ID"),
    published_at: f(record, "Published_At"),
    insights_views: f(record, "Insights_Views"),
    insights_likes: f(record, "Insights_Likes"),
    insights_comments: f(record, "Insights_Comments"),
    insights_shares: f(record, "Insights_Shares"),
    insights_reach: f(record, "Insights_Reach"),
    insights_saves: f(record, "Insights_Saves"),
    insights_watch_time_sec: f(record, "Insights_Watch_Time_Sec"),
    insights_total_interactions: f(record, "Insights_Total_Interactions"),
    insights_engaged_views: f(record, "Insights_Engaged_Views"),
    insights_avg_view_duration_sec: f(record, "Insights_Avg_View_Duration_Sec"),
    insights_avg_percentage_viewed: f(record, "Insights_Avg_Percentage_Viewed"),
    insights_audience_gained: f(record, "Insights_Audience_Gained"),
    insights_audience_lost: f(record, "Insights_Audience_Lost"),
    insights_duration_sec: f(record, "Insights_Duration_Sec"),
    insights_platform_metrics_json: f(record, "Insights_Platform_Metrics_JSON"),
    insights_next_sync_at: f(record, "Insights_Next_Sync_At"),
    insights_last_attempt_at: f(record, "Insights_Last_Attempt_At"),
    insights_last_error: f(record, "Insights_Last_Error"),
    insights_as_of: f(record, "Insights_As_Of"),
    insights_source: f(record, "Insights_Source"),
    youtube_video_id: f(record, "YouTube_Video_ID"),
    youtube_privacy_status: f(record, "YouTube_Privacy_Status"),
    youtube_error_message: f(record, "YouTube_Error_Message"),
    publish_error_stage: f(record, "Publish_Error_Stage"),
    publish_error_message: f(record, "Publish_Error_Message"),
    manual_fallback_required: Boolean(f(record, "Manual_Fallback_Required")),
    tiktok_draft_status: f(record, "TikTok_Draft_Status"),
    manual_completion_status: f(record, "Manual_Completion_Status"),
    manual_published_url: f(record, "Manual_Published_URL"),
    instagram_carousel_status: f(record, "IG_Carousel_Status"),
    instagram_story_status: f(record, "IG_Story_Status"),
    music_status: f(record, "Music_Status"),
    facebook_publish_status: f(record, "FB_Publish_Status"),
    facebook_slideshow_status: f(record, "FB_Slideshow_Status"),
    youtube_stage: f(record, "YouTube_Stage"),
    youtube_upload_status: f(record, "YouTube_Upload_Status"),
    youtube_processing_status: f(record, "YouTube_Processing_Status"),
    youtube_upload_progress_percent: f(record, "YouTube_Upload_Progress_Percent"),
    youtube_processing_progress_percent: f(record, "YouTube_Processing_Progress_Percent"),
    content_item_links: f(record, "Content_Item") || [],
    content_item_id: Array.isArray(f(record, "Content_Item")) ? (f(record, "Content_Item")[0] || null) : null,
    content_title: (contentRecord && f(contentRecord, "Content_Title")) || f(record, "Output_Title") || null,
    content_number: contentRecord ? (f(contentRecord, "Content_ID") || null) : null,
    content_profile_links: f(record, "Content_Profile") || [],
    carousel_slide_links: f(record, "Carousel Slides") || [],
    creative_manifest_present: Boolean(f(record, "Creative_Render_Manifest_JSON")),
    creative_available: outputCreativeAvailable(record),
  };
}
/*__STUDIO_WORKER_END:mapOutput__*/

export function safeMusicExtension(record) {
  const ext = String(f(record, "File_Extension") || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "mp3";
}
/*__STUDIO_WORKER_END:safeMusicExtension__*/

export function musicPreviewKey(record) {
  return `music/previews/${record.id}.${safeMusicExtension(record)}`;
}
/*__STUDIO_WORKER_END:musicPreviewKey__*/

export function extractGoogleDriveFileId(urlValue) {
  const value = String(urlValue || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const queryId = String(url.searchParams.get("id") || "").trim();
    if (queryId) return queryId;
    const match = url.pathname.match(/\/d\/([^/]+)/);
    if (match?.[1]) return match[1];
  } catch {}
  return null;
}
/*__STUDIO_WORKER_END:extractGoogleDriveFileId__*/

export function googleDriveFileId(record) {
  return String(f(record, "Google Drive File ID") || extractGoogleDriveFileId(f(record, "Google Drive URL")) || "").trim() || null;
}
/*__STUDIO_WORKER_END:googleDriveFileId__*/

export function googleDriveDownloadUrl(fileId) {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}
/*__STUDIO_WORKER_END:googleDriveDownloadUrl__*/

export function studioMusicLibraryUrlPrefix() {
  return `${ITEM4_MEDIA_PUBLIC_BASE}/studio/music-library/`;
}
/*__STUDIO_WORKER_END:studioMusicLibraryUrlPrefix__*/

export function isStudioLibraryMusicUrl(urlValue) {
  return String(urlValue || "").trim().startsWith(studioMusicLibraryUrlPrefix());
}
/*__STUDIO_WORKER_END:isStudioLibraryMusicUrl__*/

export function studioMusicR2KeyFromUrl(urlValue) {
  const value = String(urlValue || "").trim();
  const prefix = `${ITEM4_MEDIA_PUBLIC_BASE}/`;
  if (!value.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(value.slice(prefix.length));
  } catch {
    return value.slice(prefix.length);
  }
}
/*__STUDIO_WORKER_END:studioMusicR2KeyFromUrl__*/

export function isMusicLibraryFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  const ext = item4FileExtension(file?.name);
  return (
    mime === "audio/mpeg" ||
    mime === "audio/mp3" ||
    mime === "audio/wav" ||
    mime === "audio/x-wav" ||
    mime === "audio/wave" ||
    ext === "mp3" ||
    ext === "wav"
  );
}
/*__STUDIO_WORKER_END:isMusicLibraryFile__*/

export function isStudioLibraryMusicRecord(record, sourceUrl = "") {
  const transferId = String(f(record, "Studio_Transfer_ID") || "");
  return transferId.startsWith("MUSIC-") || isStudioLibraryMusicUrl(sourceUrl);
}
/*__STUDIO_WORKER_END:isStudioLibraryMusicRecord__*/

export function mapMusic(record) {
  const driveFileId = googleDriveFileId(record);
  const sourceUrl = String(f(record, "Google Drive URL") || "").trim();
  const studioLibrary = isStudioLibraryMusicRecord(record, sourceUrl);
  const doNotUse = Boolean(f(record, "Do_Not_Use"));
  const previewAvailable = !doNotUse && Boolean(driveFileId || isStudioLibraryMusicUrl(sourceUrl));
  return {
    id: record.id,
    name: f(record, "Asset Name"),
    display_name: cleanMusicDisplayName(f(record, "Asset Name")),
    google_drive_url: sourceUrl || f(record, "Google Drive URL"),
    google_drive_file_id: driveFileId,
    preview_url: previewAvailable ? `/api/music/${record.id}/preview` : null,
    preview_available: previewAvailable,
    preview_source: previewAvailable ? (driveFileId ? "google_drive" : "studio_r2") : null,
    r2_preview_key: isStudioLibraryMusicUrl(sourceUrl) ? studioMusicR2KeyFromUrl(sourceUrl) : musicPreviewKey(record),
    mime_type: f(record, "MIME_Type"),
    file_extension: f(record, "File_Extension"),
    file_size_mb: f(record, "File_Size_MB"),
    status: f(record, "Asset_Status"),
    rights_status: f(record, "Rights_Status"),
    description: f(record, "Asset_Description"),
    do_not_use: doNotUse,
    studio_uploaded: studioLibrary,
    favorite: Boolean(f(record, "Studio_Favorite")),
  };
}


/*__STUDIO_WORKER_END:mapMusic__*/

export async function findOfficialLogoRecord(env) {
  // Media Assets is the current operational brand-asset source. Select a usable
  // Logo record and prefer the explicitly "Official" / "Full" ChicagoShining asset.
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
    limit: 25,
    filterFormula: "AND({Asset_Role}='Logo',NOT({Do_Not_Use}))",
  });

  const usable = records.filter((record) => Boolean(googleDriveFileId(record)));
  if (!usable.length) {
    throw new HttpError(404, "No usable Studio logo asset was found in Media Assets");
  }

  const score = (record) => {
    const name = String(f(record, "Asset Name") || "").toLowerCase();
    let value = 0;
    if (name.includes("official")) value += 100;
    if (name.includes("full")) value += 50;
    if (name.includes("chicagoshining")) value += 25;
    if (String(f(record, "Asset_Status") || "").toLowerCase() === "available") value += 10;
    if (String(f(record, "Drive_Access_Status") || "").toLowerCase() === "public") value += 5;
    return value;
  };

  return usable.sort((a, b) => score(b) - score(a))[0];
}
/*__STUDIO_WORKER_END:findOfficialLogoRecord__*/

export async function fetchGoogleDriveImage(record) {
  const fileId = googleDriveFileId(record);
  if (!fileId) throw new HttpError(404, "Google Drive file ID is not available for the Studio logo");

  const headers = new Headers();
  headers.set("Accept", "image/png,image/webp,image/jpeg,image/*;q=0.9,*/*;q=0.5");

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

  throw new HttpError(lastResponse?.status || 502, `Google Drive logo fetch failed (${lastResponse?.status || "unknown"})`);
}
/*__STUDIO_WORKER_END:fetchGoogleDriveImage__*/

export async function brandLogo(request, env, authorization) {
  if (!authorization?.authorized) {
    throw new HttpError(403, "Authorized Studio membership required");
  }

  const record = await findOfficialLogoRecord(env);
  const upstream = await fetchGoogleDriveImage(record);

  const headers = new Headers();
  for (const name of ["Content-Type", "Content-Length", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Content-Type", headers.get("Content-Type") || f(record, "MIME_Type") || "image/png");
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Studio-Branding-Source", "media-assets-google-drive");
  headers.set("X-Studio-Branding-Record", record.id);
  headers.delete("Content-Disposition");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

/*__STUDIO_WORKER_END:brandLogo__*/

export async function buildIdeasListPayload(env, profile, limit) {
  const records = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, {
    limit,
    sortField: "Create_Date",
    filterFormula: contentProfileFilterFormula(profile),
  });
  return { records: records.map(mapIdea), profile: mapStudioContentProfile(profile) };
}
/*__STUDIO_WORKER_END:buildIdeasListPayload__*/

export async function listIdeas(request, env, url, authorization, ctx = null) {
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(url));
  const limit = clampLimit(url);
  const memoryKey = `ideas:${profile.id}:${limit}`;
  const snapshotKey = `studio/state/ideas-list-${profile.id}-${limit}.json`;
  return respondStudioMappedList(request, env, ctx, {
    memoryKey,
    snapshotKey,
    profile,
    ttlMs: STUDIO_READ_SNAPSHOT_FRESH_MS,
    allowRefresh: url.searchParams.get("refresh") !== "0",
    builder: () => buildIdeasListPayload(env, profile, limit),
  });
}
/*__STUDIO_WORKER_END:listIdeas__*/

export function airtableFormulaEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
/*__STUDIO_WORKER_END:airtableFormulaEscape__*/

export function requestedProfileId(url, payload) {
  const raw = String(payload?.content_profile_id || payload?.profile_id || url?.searchParams?.get("content_profile_id") || url?.searchParams?.get("profile") || "").trim();
  if (!raw) return null;
  if (!/^rec[A-Za-z0-9]+$/.test(raw)) throw new HttpError(400, "Invalid Content Profile id");
  return raw;
}
/*__STUDIO_WORKER_END:requestedProfileId__*/

export function studioNormalizeProfileKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
/*__STUDIO_WORKER_END:studioNormalizeProfileKey__*/

export function studioThemeForProfile(record) {
  const explicit = studioNormalizeProfileKey(f(record, "Profile_Key"));
  if (explicit) return explicit;
  const hay = [
    f(record, "Profile_Name"),
    f(record, "Market_Name"),
    f(record, "Brand_Name"),
    f(record, "State_Region"),
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (hay.includes("los angeles") || hay.includes("la shining") || hay.includes("la -") || /\bla\b/.test(hay) || hay.includes("hollywood")) return "la";
  if (hay.includes("new york") || hay.includes("nyc") || hay.includes("manhattan")) return "nyc";
  if (hay.includes("miami") || hay.includes("miami shining")) return "miami";
  if (hay.includes("chicago") || hay.includes("chicagoshining")) return "chicago";
  const market = String(f(record, "Market_Name") || "").trim();
  const marketSlug = profileSetupSlug(market);
  if (marketSlug) return marketSlug;
  return studioNormalizeProfileKey(f(record, "Market_Name") || f(record, "Brand_Name") || f(record, "Profile_Name")) || "chicago";
}
/*__STUDIO_WORKER_END:studioThemeForProfile__*/

export function studioSettingsPrefixForTheme(theme) {
  const normalized = studioNormalizeProfileKey(theme);
  if (!normalized || normalized === "chicago") return "";
  if (normalized === "la") return "LA_";
  if (normalized === "nyc") return "NYC_";
  if (normalized === "miami") return "MIAMI_";
  return normalized.toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_";
}
/*__STUDIO_WORKER_END:studioSettingsPrefixForTheme__*/

export async function studioContentProfileRecordIdForOutput(env, record) {
  if (!record) return null;
  const direct = studioFirstLinkedId(f(record, "Content_Profile"));
  if (direct && /^rec[A-Za-z0-9]+$/.test(direct)) return direct;
  const contentId = studioFirstLinkedId(f(record, "Content_Item"));
  if (!contentId || !env.AIRTABLE_CONTENT_TABLE_ID) return null;
  try {
    const item = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId);
    const linked = studioFirstLinkedId(f(item, "Content_Profile"));
    return linked && /^rec[A-Za-z0-9]+$/.test(linked) ? linked : null;
  } catch {
    return null;
  }
}
/*__STUDIO_WORKER_END:studioContentProfileRecordIdForOutput__*/

export async function studioThemeForPublishRecord(env, record) {
  if (!record) return "chicago";
  const direct = studioThemeForProfile(record);
  if (direct !== "chicago") return direct;

  // Publish/output records often do not copy city fields. Resolve their linked
  // Content Profile before falling back so a new city can never inherit the
  // unprefixed Chicago destination credentials by accident.
  const profileId = await studioContentProfileRecordIdForOutput(env, record).catch(() => null);
  if (profileId) {
    try {
      const profile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId);
      return studioThemeForProfile(profile);
    } catch {}
  }

  const contentId = studioFirstLinkedId(f(record, "Content_Item"));
  if (!contentId || !env.AIRTABLE_CONTENT_TABLE_ID) return direct;
  try {
    const item = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId);
    const itemTheme = studioThemeForProfile(item);
    if (itemTheme !== "chicago") return itemTheme;
    const linkedProfileId = studioFirstLinkedId(f(item, "Content_Profile"));
    if (linkedProfileId) {
      const profile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, linkedProfileId);
      return studioThemeForProfile(profile);
    }
    return itemTheme;
  } catch {
    return direct;
  }
}
/*__STUDIO_WORKER_END:studioThemeForPublishRecord__*/

export function studioCityLabel(theme, record) {
  if (theme === "la") return "Los Angeles";
  if (theme === "nyc") return "New York";
  if (theme === "miami") return "Miami";
  if (theme === "las-vegas") return "Las Vegas";
  if (theme === "san-francisco") return "San Francisco";
  if (theme === "new-orleans") return "New Orleans";
  if (theme === "washington-dc") return "Washington DC";
  if (theme === "boston") return "Boston";
  const market = String(f(record, "Market_Name") || "").trim();
  if (market) return market;
  return theme && theme !== "chicago"
    ? String(theme).split("-").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
    : "Chicago";
}
/*__STUDIO_WORKER_END:studioCityLabel__*/

export function studioScheduleTimeZoneFromTheme(theme) {
  const normalized = studioNormalizeProfileKey(theme);
  if (normalized === "las-vegas" || normalized === "san-francisco") return "America/Los_Angeles";
  if (normalized === "new-orleans") return "America/Chicago";
  if (normalized === "washington-dc" || normalized === "boston") return "America/New_York";
  return maeTimeZoneFromTheme(theme);
}
/*__STUDIO_WORKER_END:studioScheduleTimeZoneFromTheme__*/

export function studioScheduleTimeZoneForProfile(profile, fallback = MAE_DEFAULT_TIME_ZONE) {
  const explicit = String(f(profile, "Timezone") || "").trim();
  if (explicit) return maeNormalizeTimeZone(explicit);
  const themed = studioScheduleTimeZoneFromTheme(studioThemeForProfile(profile));
  return maeNormalizeTimeZone(themed || fallback);
}
/*__STUDIO_WORKER_END:studioScheduleTimeZoneForProfile__*/

export function studioScheduleTimeZoneFromPayload(payload, fallback = MAE_DEFAULT_TIME_ZONE) {
  const raw = String(payload?.timezone || payload?.time_zone || "").trim();
  return maeNormalizeTimeZone(raw || fallback);
}
/*__STUDIO_WORKER_END:studioScheduleTimeZoneFromPayload__*/

export async function studioScheduleTimeZoneForRecord(env, record, payload = null) {
  if (payload?.timezone || payload?.time_zone) return studioScheduleTimeZoneFromPayload(payload);
  try {
    const profile = await item4ProductionProfileRecord(env, record);
    if (profile) return studioScheduleTimeZoneForProfile(profile);
  } catch {}
  const direct = String(f(record, "Timezone") || "").trim();
  if (direct) return maeNormalizeTimeZone(direct);
  const theme = await studioThemeForPublishRecord(env, record).catch(() => studioThemeForProfile(record));
  return studioScheduleTimeZoneFromTheme(theme);
}

/*__STUDIO_WORKER_END:studioScheduleTimeZoneForRecord__*/

export function normalizeStudioBackgroundColor(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = /^#?([0-9a-fA-F]{6})$/.exec(raw);
  if (!match) return null;
  return `#${match[1].toLowerCase()}`;
}
/*__STUDIO_WORKER_END:normalizeStudioBackgroundColor__*/

export function studioBackgroundColorForRecord(record) {
  const normalized = normalizeStudioBackgroundColor(f(record, "Studio_Background_Color"));
  return normalized || "";
}
/*__STUDIO_WORKER_END:studioBackgroundColorForRecord__*/

export function mapStudioContentProfile(record) {
  const theme = studioThemeForProfile(record);
  return {
    id: record.id,
    name: String(f(record, "Profile_Name") || ""),
    brand_name: String(f(record, "Brand_Name") || ""),
    market_name: String(f(record, "Market_Name") || ""),
    timezone: String(f(record, "Timezone") || ""),
    brand_links: arrayOrEmpty(f(record, "Brand")),
    active: Boolean(f(record, "Active")),
    theme,
    city_label: studioCityLabel(theme, record),
    background_color: studioBackgroundColorForRecord(record),
    default_narration_voice_id: String(f(record, "Default_Narration_Voice_ID") || "").trim(),
    default_narration_voice_name: String(f(record, "Default_Narration_Voice_Name") || "").trim(),
    profile_key: String(f(record, "Profile_Key") || "").trim(),
    short_code: String(f(record, "Profile_Short_Code") || "").trim(),
    state_region: String(f(record, "State_Region") || "").trim(),
    country: String(f(record, "Country") || "").trim(),
    website_url: String(f(record, "Website_URL") || "").trim(),
    launch_date: String(f(record, "Launch_Date") || "").trim(),
    setup_status: String(f(record, "Profile_Setup_Status") || "").trim(),
    facebook_page_id: String(f(record, "Facebook_Page_ID") || "").trim(),
    instagram_business_account_id: String(f(record, "Instagram_Business_Account_ID") || "").trim(),
    youtube_channel_id: String(f(record, "YouTube_Channel_ID") || "").trim(),
    tiktok_handle: String(f(record, "TikTok_Handle") || "").trim(),
  };
}
/*__STUDIO_WORKER_END:mapStudioContentProfile__*/

export function contentProfileFilterFormula(profile) {
  if (!profile?.id) return null;
  const id = airtableFormulaEscape(profile.id);
  const name = airtableFormulaEscape(f(profile, "Profile_Name") || "");
  const parts = [`FIND("${id}", ARRAYJOIN({Content_Profile})&"")`];
  if (name) parts.push(`FIND("${name}", ARRAYJOIN({Content_Profile})&"")`);
  return parts.length === 1 ? parts[0] : `OR(${parts.join(",")})`;
}
/*__STUDIO_WORKER_END:contentProfileFilterFormula__*/

export function studioPipelineOpenOutputFormula(profile, { legacy = false } = {}) {
  const open = legacy ? STUDIO_PIPELINE_OPEN_LEGACY_FORMULA : STUDIO_PIPELINE_OPEN_FIELD_FORMULA;
  const profileFormula = contentProfileFilterFormula(profile);
  return profileFormula ? `AND(${profileFormula},${open})` : open;
}
/*__STUDIO_WORKER_END:studioPipelineOpenOutputFormula__*/

export function mergePipelineOutputRecords(newest = [], open = []) {
  const byId = new Map();
  for (const row of [...open, ...newest]) {
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()].sort(
    (a, b) => Number(f(b, "Output_ID") || 0) - Number(f(a, "Output_ID") || 0)
  );
}
/*__STUDIO_WORKER_END:mergePipelineOutputRecords__*/

export function studioPipelineContentIdsFromOutputs(records = []) {
  return [...new Set(
    (records || [])
      .map((record) => studioFirstLinkedId(f(record, "Content_Item")))
      .filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id || "")))
  )];
}
/*__STUDIO_WORKER_END:studioPipelineContentIdsFromOutputs__*/

export async function listPipelineOutputsForContentIds(env, profile, contentIds, listOpts = {}) {
  const ids = [...new Set((contentIds || []).filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id || ""))))];
  if (!ids.length) return [];
  const profileFormula = contentProfileFilterFormula(profile);
  const batches = [];
  for (let index = 0; index < ids.length; index += 40) batches.push(ids.slice(index, index + 40));
  const pages = await mapPool(batches, 2, async (batch) => {
    const contentOr = batch
      .map((id) => `FIND("${airtableFormulaEscape(id)}", ARRAYJOIN({Content_Item})&"")`)
      .join(",");
    const contentClause = batch.length === 1 ? contentOr : `OR(${contentOr})`;
    const filterFormula = profileFormula
      ? `AND({Test_Run_ID}=BLANK(),${profileFormula},${contentClause})`
      : `AND({Test_Run_ID}=BLANK(),${contentClause})`;
    const batchRows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      ...listOpts,
      limit: Math.max(40, batch.length * 12),
      filterFormula,
    }).catch((error) => {
      console.warn("pipeline sibling-output scan failed", error);
      return [];
    });
    return batchRows;
  });
  return pages.flat();
}
/*__STUDIO_WORKER_END:listPipelineOutputsForContentIds__*/

export async function listPipelineContentByIds(env, contentIds = [], fields = null) {
  const ids = [...new Set((contentIds || []).filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id || ""))))];
  if (!ids.length) return [];
  const fieldList = Array.isArray(fields) ? fields.filter(Boolean) : [];
  const rows = [];
  for (let index = 0; index < ids.length; index += 40) {
    const batch = ids.slice(index, index + 40);
    const formulaParts = batch.map((id) => `RECORD_ID()="${airtableFormulaEscape(id)}"`);
    const filterFormula = formulaParts.length === 1 ? formulaParts[0] : `OR(${formulaParts.join(",")})`;
    const batchRows = await listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, {
      limit: batch.length,
      filterFormula,
      ...(fieldList.length ? { fields: fieldList } : {}),
    }).catch((error) => {
      console.warn("pipeline open-content scan failed", error);
      return [];
    });
    rows.push(...batchRows);
  }
  return rows;
}
/*__STUDIO_WORKER_END:listPipelineContentByIds__*/

export function studioApproveAllCandidateFormula(profile) {
  const ready = 'AND({Test_Run_ID}=BLANK(),NOT({Do_Not_Publish}),OR({Output_Status}="Ready for Review",{Review_Status}="Review Sent"),{Review_Status}!="Approved",{Output_Status}!="Approved for Publishing",{Output_Status}!="Published")';
  const profileFormula = contentProfileFilterFormula(profile);
  return profileFormula ? `AND(${profileFormula},${ready})` : ready;
}
/*__STUDIO_WORKER_END:studioApproveAllCandidateFormula__*/

export async function listContentProfileRecords(env) {
  if (Array.isArray(env.__contentProfilesCache) && env.__contentProfilesCache.length) {
    return env.__contentProfilesCache;
  }
  // Do not cache an unsettled/rejected Promise on env — a canceled in-flight
  // listRecords would hang every profile-scoped route until isolate recycle.
  const rows = await listRecords(env, "Content Profiles", { limit: 100 });
  env.__contentProfilesCache = rows;
  return rows;
}
/*__STUDIO_WORKER_END:listContentProfileRecords__*/

export async function resolveAuthorizedContentProfiles(env, authorization) {
  const profiles = await listContentProfileRecords(env);
  const organizationRecordId = authorization?.organization?.record_id;

  return profiles.filter((record) => {
    const active = Boolean(f(record, "Active"));
    const brands = Array.isArray(f(record, "Brand")) ? f(record, "Brand") : [];
    const organizations = Array.isArray(f(record, "Organization")) ? f(record, "Organization") : [];
    const orgMatch = !organizationRecordId || !organizations.length || organizations.includes(organizationRecordId);
    return active && orgMatch && membershipAllowsBrand(authorization, brands);
  });
}
/*__STUDIO_WORKER_END:resolveAuthorizedContentProfiles__*/

export async function resolveWorkingContentProfile(env, authorization, profileId) {
  const matches = await resolveAuthorizedContentProfiles(env, authorization);
  if (!matches.length) {
    throw new HttpError(409, "No active Content Profile is linked to the authorized Studio brand");
  }
  if (profileId) {
    const found = matches.find((record) => record.id === profileId);
    if (!found) throw new HttpError(403, "Content Profile is not available for this Studio membership");
    return found;
  }
  if (matches.length === 1) return matches[0];
  const exactName = matches.filter((record) =>
    String(f(record, "Brand_Name") || "").trim().toLowerCase() ===
    String(authorization?.brand?.name || "").trim().toLowerCase()
  );
  if (exactName.length === 1) return exactName[0];
  const chicago = matches.filter((record) => studioThemeForProfile(record) === "chicago");
  if (chicago.length === 1) return chicago[0];
  return matches[0];
}
/*__STUDIO_WORKER_END:resolveWorkingContentProfile__*/

export async function resolveDefaultContentProfile(env, authorization) {
  return resolveWorkingContentProfile(env, authorization, null);
}
/*__STUDIO_WORKER_END:resolveDefaultContentProfile__*/

export async function listStudioContentProfiles(request, env, authorization) {
  const profiles = await resolveAuthorizedContentProfiles(env, authorization);
  const selected = await resolveWorkingContentProfile(env, authorization, null);
  return respond(request, env, {
    ok: true,
    records: profiles.map(mapStudioContentProfile),
    default_profile_id: selected.id,
    can_create_profile: Boolean(authorization?.permissions?.tenant_admin),
  });
}
/*__STUDIO_WORKER_END:listStudioContentProfiles__*/

export function studioProfileOnboardingHandlers() {
  return createProfileOnboarding({
    HttpError,
    f,
    arrayOrEmpty,
    listRecords,
    airtableFetch,
    studioUpsertSetting,
    studioActivePipelineSettings,
    mapStudioContentProfile,
    studioThemeForProfile,
    studioCityLabel,
    studioSettingsPrefixForTheme,
    STUDIO_IDEA_PROFILE_TABLE_ID,
    respond,
    readJsonBody,
  });
}

/*__STUDIO_WORKER_END:studioProfileOnboardingHandlers__*/

export function studioProfileSetupRecordIdFromPath(url) {
  const match = /^\/api\/profile-setup\/(rec[A-Za-z0-9]+)/.exec(url.pathname);
  return match?.[1] || null;
}
/*__STUDIO_WORKER_END:studioProfileSetupRecordIdFromPath__*/

export function studioProfileSetupPlatformFromPath(url) {
  const match = /^\/api\/profile-setup\/rec[A-Za-z0-9]+\/platform\/(instagram|facebook|youtube|tiktok)$/.exec(url.pathname);
  return profileSetupPlatformKey(match?.[1] || "");
}
/*__STUDIO_WORKER_END:studioProfileSetupPlatformFromPath__*/

export function studioProfileSetupBelongsToAuthorization(profile, authorization) {
  if (!profile?.id || !authorization?.organization?.record_id) return false;
  const organizations = arrayOrEmpty(f(profile, "Organization"));
  const orgMatch = !organizations.length || organizations.includes(authorization.organization.record_id);
  return orgMatch && membershipAllowsBrand(authorization, arrayOrEmpty(f(profile, "Brand")));
}
/*__STUDIO_WORKER_END:studioProfileSetupBelongsToAuthorization__*/

export async function loadAuthorizedStudioProfileSetupRecord(env, authorization, profileId) {
  if (!/^rec[A-Za-z0-9]+$/.test(String(profileId || ""))) {
    throw new HttpError(400, "Invalid Content Profile id");
  }
  const profile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId);
  if (!studioProfileSetupBelongsToAuthorization(profile, authorization)) {
    throw new HttpError(403, "Content Profile is not available for this Studio organization");
  }
  return profile;
}
/*__STUDIO_WORKER_END:loadAuthorizedStudioProfileSetupRecord__*/

export function studioProfileSetupStateFromRecord(profile, saved = null) {
  const defaults = arrayOrEmpty(f(profile, "Default_Platforms")).map((value) => String(value || ""));
  const byLabel = new Set(defaults.map((value) => value.toLowerCase()));
  const recordState = {
    profile_id: profile.id,
    brand_record_id: arrayOrEmpty(f(profile, "Brand"))[0] || null,
    lifecycle: Boolean(f(profile, "Active")) ? "active" : "setup",
    city: String(f(profile, "Market_Name") || ""),
    state_region: String(f(profile, "State_Region") || ""),
    country: String(f(profile, "Country") || "United States"),
    timezone: String(f(profile, "Timezone") || ""),
    profile_name: String(f(profile, "Profile_Name") || ""),
    brand_name: String(f(profile, "Brand_Name") || ""),
    default_formats: arrayOrEmpty(f(profile, "Default_Formats")),
    content_themes: arrayOrEmpty(f(profile, "Allowed_Content_Themes")),
    primary_audience: String(f(profile, "Primary_Audience") || ""),
    brand_voice: String(f(profile, "Brand_Voice") || ""),
    local_context: String(f(profile, "Local_Context") || ""),
    priority_locations: String(f(profile, "Priority_Locations") || ""),
    avoid_topics: String(f(profile, "Avoid_Topics") || ""),
    default_hashtags: String(f(profile, "Default_Hashtags") || ""),
    asset_filter_tag: String(f(profile, "Asset_Filter_Tag") || ""),
    background_color: studioBackgroundColorForRecord(profile),
    platforms: {
      instagram: {
        enabled: byLabel.has("instagram"),
        desired_handle: "",
        last_status: f(profile, "Instagram_Business_Account_ID") ? "configured" : "not_configured",
      },
      tiktok: {
        enabled: byLabel.has("tiktok"),
        desired_handle: String(f(profile, "TikTok_Handle") || "").replace(/^@/, ""),
        last_status: f(profile, "TikTok_Handle") ? "configured" : "not_configured",
      },
      youtube: {
        enabled: byLabel.has("youtube"),
        desired_handle: "",
        last_status: f(profile, "YouTube_Channel_ID") ? "configured" : "not_configured",
      },
      facebook: {
        enabled: byLabel.has("facebook"),
        desired_handle: "",
        last_status: f(profile, "Facebook_Page_ID") ? "configured" : "not_configured",
      },
    },
  };
  return normalizeProfileSetupState({ ...recordState, ...(saved || {}), profile_id: profile.id }, saved || recordState);
}
/*__STUDIO_WORKER_END:studioProfileSetupStateFromRecord__*/

export async function loadStudioProfileSetupState(env, profile) {
  const setting = await studioSettingsByName(env, profileSetupSettingName(profile.id)).catch(() => null);
  let saved = null;
  try {
    saved = setting ? JSON.parse(String(f(setting, "Setting_Value") || "{}")) : null;
  } catch {
    saved = null;
  }
  return studioProfileSetupStateFromRecord(profile, saved);
}
/*__STUDIO_WORKER_END:loadStudioProfileSetupState__*/

export async function saveStudioProfileSetupState(env, state) {
  const normalized = normalizeProfileSetupState(state, state);
  await studioUpsertSetting(
    env,
    profileSetupSettingName(normalized.profile_id),
    JSON.stringify(normalized),
    "Resumable New Profile / City Setup wizard state. Secrets are stored separately in profile-scoped destination settings.",
  );
  return normalized;
}
/*__STUDIO_WORKER_END:saveStudioProfileSetupState__*/

export function studioProfileSetupBrandId(state) {
  const seed = String(state.short_code || state.slug || state.city || "CITY")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `BRD-${seed || "CITY"}`;
}
/*__STUDIO_WORKER_END:studioProfileSetupBrandId__*/

export function studioProfileSetupProfileFields(state, brandRecordId, organizationRecordId) {
  const fields = {
    Profile_Name: state.profile_name,
    Brand_Name: state.brand_name,
    Active: false,
    Organization: [organizationRecordId],
    Brand: [brandRecordId],
    Default_Formats: state.default_formats?.length ? state.default_formats : PROFILE_SETUP_DEFAULT_FORMATS,
    Market_Name: state.city,
    State_Region: state.state_region,
    Country: state.country || "United States",
    Timezone: state.timezone,
    Primary_Audience: state.primary_audience || "Travelers, locals, photographers, and people discovering the city.",
    Brand_Voice: state.brand_voice || "Bright, polished, curious, practical, visually driven, and locally informed.",
    Default_Platforms: profileSetupSelectedPlatformLabels(state),
    Allowed_Content_Themes: state.content_themes?.length ? state.content_themes : PROFILE_SETUP_DEFAULT_THEMES,
    Priority_Locations: state.priority_locations || null,
    Avoid_Topics: state.avoid_topics || null,
    Local_Context: state.local_context || null,
    Default_Hashtags: state.default_hashtags || null,
    Asset_Filter_Tag: state.asset_filter_tag || state.slug || null,
    Idea_Generation_Enabled: false,
    Daily_Idea_Limit: 5,
    Autonomous_Produce_Enabled: false,
  };
  const bg = normalizeStudioBackgroundColor(state.background_color);
  if (bg) fields.Studio_Background_Color = bg;
  return fields;
}
/*__STUDIO_WORKER_END:studioProfileSetupProfileFields__*/

export async function studioProfileSetupConnectionSnapshot(env, profile) {
  const settings = await studioActivePipelineSettings(env, [
    "FACEBOOK_PAGE_ID",
    "FACEBOOK_PAGE_ACCESS_TOKEN",
    "FACEBOOK_GRAPH_API_VERSION",
    "INSTAGRAM_BUSINESS_ACCOUNT_ID",
    "YOUTUBE_CHANNEL_ID",
    "YOUTUBE_UPLOAD_SERVICE_URL",
    "YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET",
    "TIKTOK_WORKER_BASE_URL",
  ], profile).catch(() => ({}));
  const version = String(settings.FACEBOOK_GRAPH_API_VERSION || "v26.0").replace(/^\/+|\/+$/g, "");
  const token = String(settings.FACEBOOK_PAGE_ACCESS_TOKEN || env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
  const connectionState = {
    instagram: { platform: "Instagram", status: "not_configured", account_name: null, account_id: settings.INSTAGRAM_BUSINESS_ACCOUNT_ID || null, error: null },
    tiktok: {
      platform: "TikTok",
      status: "not_configured",
      account_name: f(profile, "TikTok_Handle") || null,
      account_id: null,
      worker_configured: Boolean(String(settings.TIKTOK_WORKER_BASE_URL || "").trim()),
      connect_url: String(settings.TIKTOK_WORKER_BASE_URL || "").trim()
        ? String(settings.TIKTOK_WORKER_BASE_URL).trim().replace(/\/+$/, "") + "/tiktok/connect"
        : null,
      error: null,
    },
    youtube: {
      platform: "YouTube",
      status: "not_configured",
      account_name: null,
      account_id: settings.YOUTUBE_CHANNEL_ID || null,
      service_configured: Boolean(String(settings.YOUTUBE_UPLOAD_SERVICE_URL || "").trim()),
      error: null,
    },
    facebook: { platform: "Facebook", status: "not_configured", account_name: null, account_id: settings.FACEBOOK_PAGE_ID || null, error: null },
  };

  await Promise.all([
    (async () => {
      if (!token || !settings.FACEBOOK_PAGE_ID) return;
      try {
        const setupFacebookPageId = String(settings.FACEBOOK_PAGE_ID || "").trim();
        const page = await studioInsightsMetaIdentity(setupFacebookPageId, token, version, "id,name");
        connectionState.facebook.status = "connected";
        connectionState.facebook.account_name = page?.name || null;
        connectionState.facebook.account_id = page?.id || setupFacebookPageId;
      } catch (error) {
        Object.assign(connectionState.facebook, studioInsightsConnectionStateFromError(error));
      }
    })(),
    (async () => {
      if (!token || !settings.INSTAGRAM_BUSINESS_ACCOUNT_ID) return;
      try {
        const ig = await studioInsightsMetaIdentity(settings.INSTAGRAM_BUSINESS_ACCOUNT_ID, token, version, "id,username,name");
        connectionState.instagram.status = "connected";
        connectionState.instagram.account_name = ig?.username ? "@" + ig.username : (ig?.name || null);
        connectionState.instagram.account_id = ig?.id || settings.INSTAGRAM_BUSINESS_ACCOUNT_ID;
      } catch (error) {
        Object.assign(connectionState.instagram, studioInsightsConnectionStateFromError(error));
      }
    })(),
    (async () => {
      const base = String(settings.YOUTUBE_UPLOAD_SERVICE_URL || "").trim().replace(/\/+$/, "");
      if (!base) return;
      try {
        const secret = settings.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || env.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || "";
        const response = await fetch(base + "/youtube/oauth/status", {
          headers: { Accept: "application/json", ...(secret ? { "X-SM-Pipeline-Key": secret } : {}) },
        });
        const body = await studioInsightsSafeJson(response);
        connectionState.youtube.account_name = body?.channel_title || null;
        connectionState.youtube.account_id = body?.channel_id || settings.YOUTUBE_CHANNEL_ID || null;
        connectionState.youtube.status = body?.refresh_ok && body?.analytics_read_ok ? "connected" : "needs_authorization";
        connectionState.youtube.error = connectionState.youtube.status === "connected"
          ? null
          : (body?.analytics_error || body?.error || "YouTube authorization is required.");
      } catch (error) {
        Object.assign(connectionState.youtube, studioInsightsConnectionStateFromError(error));
      }
    })(),
    (async () => {
      const base = String(settings.TIKTOK_WORKER_BASE_URL || "").trim().replace(/\/+$/, "");
      if (!base) return;
      try {
        const body = await studioInsightsSafeJson(await fetch(base + "/tiktok/status", { headers: { Accept: "application/json" } }));
        connectionState.tiktok.account_name = body?.creator_username ? "@" + body.creator_username : (body?.creator_nickname || connectionState.tiktok.account_name);
        connectionState.tiktok.status = body?.authorized && body?.required_scopes_granted ? "connected" : "needs_authorization";
        connectionState.tiktok.error = connectionState.tiktok.status === "connected" ? null : "TikTok authorization is required.";
      } catch (error) {
        Object.assign(connectionState.tiktok, studioInsightsConnectionStateFromError(error));
      }
    })(),
  ]);

  return connectionState;
}
/*__STUDIO_WORKER_END:studioProfileSetupConnectionSnapshot__*/

export async function studioProfileSetupSummary(env, profile) {
  const [state, connections] = await Promise.all([
    loadStudioProfileSetupState(env, profile),
    studioProfileSetupConnectionSnapshot(env, profile),
  ]);
  const checklist = profileSetupChecklist(state, connections);
  return {
    profile: mapStudioContentProfile(profile),
    state,
    connections,
    checklist,
  };
}
/*__STUDIO_WORKER_END:studioProfileSetupSummary__*/

export async function listStudioProfileSetups(request, env, authorization) {
  const profiles = (await listContentProfileRecords(env)).filter((profile) =>
    studioProfileSetupBelongsToAuthorization(profile, authorization)
  );
  // This page is an onboarding surface. Do not probe every already-active city's
  // external APIs each time it opens; only setup drafts need live connection checks.
  const setupProfiles = profiles.filter((profile) => !Boolean(f(profile, "Active")));
  const records = await Promise.all(setupProfiles.map((profile) =>
    studioProfileSetupSummary(env, profile)
  ));
  return respond(request, env, {
    ok: true,
    can_create: Boolean(authorization?.permissions?.tenant_admin),
    organization: authorization.organization,
    platforms: profileSetupPublicPlatformDescriptors(),
    records,
    active_profiles: profiles
      .filter((profile) => Boolean(f(profile, "Active")))
      .map(mapStudioContentProfile),
  });
}
/*__STUDIO_WORKER_END:listStudioProfileSetups__*/

export async function createStudioProfileSetup(request, env, authorization) {
  const payload = await readJsonBody(request);
  const platformSeed = payload.platforms && typeof payload.platforms === "object"
    ? payload.platforms
    : Object.fromEntries(Object.keys(PROFILE_SETUP_PLATFORMS).map((key) => [key, { enabled: true }]));
  let state = normalizeProfileSetupState({ ...payload, platforms: platformSeed });
  if (!state.city || !state.state_region || !state.timezone) {
    throw new HttpError(400, "City, state/region, and timezone are required");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: state.timezone }).format(new Date());
  } catch {
    throw new HttpError(400, "Timezone must be a valid IANA timezone");
  }

  const allProfiles = await listContentProfileRecords(env);
  const duplicate = allProfiles.find((profile) =>
    String(f(profile, "Market_Name") || "").trim().toLowerCase() === state.city.toLowerCase()
    && studioProfileSetupBelongsToAuthorization(profile, authorization)
  );
  if (duplicate) throw new HttpError(409, `${state.city} already has a Content Profile`);

  const organizationId = authorization.organization.record_id;
  const allBrands = await listRecords(env, STUDIO_TABLES.brands, { limit: 100 });
  let brand = allBrands.find((record) =>
    String(f(record, "Brand_Name") || "").trim().toLowerCase() === state.brand_name.toLowerCase()
    && arrayOrEmpty(f(record, "Organization")).includes(organizationId)
  );
  if (!brand) {
    const brandFields = {
      Brand_ID: studioProfileSetupBrandId(state),
      Brand_Name: state.brand_name,
      Organization: [organizationId],
      Active: true,
      Brand_Description: state.local_context
        || `${state.brand_name} is a visual city-discovery brand focused on ${state.city}.`,
      Brand_Voice: state.brand_voice
        || "Bright, polished, curious, practical, visually driven, and locally informed.",
      Default_Language: "English",
    };
    if (state.website_url) brandFields.Website_URL = state.website_url;
    brand = await airtableFetch(env, STUDIO_TABLES.brands, "", {
      method: "POST",
      body: JSON.stringify({ fields: brandFields, typecast: true }),
    });
  }

  const profile = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, "", {
    method: "POST",
    body: JSON.stringify({
      fields: studioProfileSetupProfileFields(state, brand.id, organizationId),
      typecast: true,
    }),
  });
  env.__contentProfilesPromise = null;
  state = normalizeProfileSetupState({
    ...state,
    profile_id: profile.id,
    brand_record_id: brand.id,
    lifecycle: "setup",
  }, state);
  await saveStudioProfileSetupState(env, state);
  return respond(request, env, {
    ok: true,
    created: true,
    ...(await studioProfileSetupSummary(env, profile)),
  }, 201);
}
/*__STUDIO_WORKER_END:createStudioProfileSetup__*/

export async function getStudioProfileSetup(request, env, url, authorization) {
  const profile = await loadAuthorizedStudioProfileSetupRecord(
    env,
    authorization,
    studioProfileSetupRecordIdFromPath(url),
  );
  return respond(request, env, { ok: true, ...(await studioProfileSetupSummary(env, profile)) });
}
/*__STUDIO_WORKER_END:getStudioProfileSetup__*/

export async function patchStudioProfileSetup(request, env, url, authorization) {
  const profileId = studioProfileSetupRecordIdFromPath(url);
  const profile = await loadAuthorizedStudioProfileSetupRecord(env, authorization, profileId);
  const prior = await loadStudioProfileSetupState(env, profile);
  const payload = await readJsonBody(request);
  let state = normalizeProfileSetupState({ ...prior, ...payload, profile_id: profileId }, prior);
  if (!state.city || !state.state_region || !state.timezone) {
    throw new HttpError(400, "City, state/region, and timezone are required");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: state.timezone }).format(new Date());
  } catch {
    throw new HttpError(400, "Timezone must be a valid IANA timezone");
  }

  const fields = studioProfileSetupProfileFields(
    state,
    state.brand_record_id || arrayOrEmpty(f(profile, "Brand"))[0],
    authorization.organization.record_id,
  );
  fields.Active = Boolean(f(profile, "Active"));
  await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });

  const brandId = state.brand_record_id || arrayOrEmpty(f(profile, "Brand"))[0];
  if (brandId) {
    const brandFields = {
      Brand_Name: state.brand_name,
      Brand_Description: state.local_context || `${state.brand_name} is a visual city-discovery brand focused on ${state.city}.`,
      Brand_Voice: state.brand_voice || "Bright, polished, curious, practical, visually driven, and locally informed.",
    };
    if (state.website_url) brandFields.Website_URL = state.website_url;
    await airtableFetch(env, STUDIO_TABLES.brands, brandId, {
      method: "PATCH",
      body: JSON.stringify({ fields: brandFields, typecast: true }),
    }).catch(() => null);
  }

  state = await saveStudioProfileSetupState(env, state);
  env.__contentProfilesPromise = null;
  const refreshed = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId);
  return respond(request, env, { ok: true, ...(await studioProfileSetupSummary(env, refreshed)) });
}
/*__STUDIO_WORKER_END:patchStudioProfileSetup__*/

export async function updateStudioProfileSetupPlatform(request, env, url, authorization) {
  const profileId = studioProfileSetupRecordIdFromPath(url);
  const platformKey = studioProfileSetupPlatformFromPath(url);
  if (!platformKey) throw new HttpError(400, "Unsupported platform");
  const profile = await loadAuthorizedStudioProfileSetupRecord(env, authorization, profileId);
  const prior = await loadStudioProfileSetupState(env, profile);
  const payload = await readJsonBody(request);
  const nextPlatform = {
    ...(prior.platforms?.[platformKey] || {}),
    ...(payload.enabled === undefined ? {} : { enabled: Boolean(payload.enabled) }),
    ...(payload.setup_mode === undefined ? {} : { setup_mode: payload.setup_mode }),
    ...(payload.deferred === undefined ? {} : { deferred: Boolean(payload.deferred) }),
    ...(payload.desired_handle === undefined ? {} : { desired_handle: payload.desired_handle }),
  };
  if (payload.action === "mark_creation_opened") {
    nextPlatform.account_creation_opened_at = new Date().toISOString();
  }

  const profileFields = {};
  const settingsToWrite = [];
  const saveSetting = (name, value, note) => {
    const clean = String(value || "").trim();
    if (clean) settingsToWrite.push([profileDestinationSettingName(profileId, name), clean, note]);
  };

  if (platformKey === "facebook") {
    const pageId = String(payload.page_id || "").trim();
    if (pageId) profileFields.Facebook_Page_ID = pageId;
    saveSetting("FACEBOOK_PAGE_ID", pageId, "Profile-scoped Facebook Page ID from New Profile setup.");
    saveSetting("FACEBOOK_PAGE_ACCESS_TOKEN", payload.page_access_token, "Profile-scoped Facebook Page access token from New Profile setup.");
    saveSetting("FACEBOOK_GRAPH_API_VERSION", payload.graph_api_version, "Profile-scoped Meta Graph API version.");
  }
  if (platformKey === "instagram") {
    const accountId = String(payload.instagram_business_account_id || payload.account_id || "").trim();
    if (accountId) profileFields.Instagram_Business_Account_ID = accountId;
    saveSetting("INSTAGRAM_BUSINESS_ACCOUNT_ID", accountId, "Profile-scoped Instagram professional account ID from New Profile setup.");
    saveSetting("FACEBOOK_PAGE_ACCESS_TOKEN", payload.page_access_token, "Profile-scoped Meta access token shared by Instagram/Facebook.");
    saveSetting("META_GRAPH_API_ACCESS_TOKEN", payload.meta_graph_api_access_token, "Profile-scoped Meta Graph API access token.");
  }
  if (platformKey === "youtube") {
    const channelId = String(payload.youtube_channel_id || payload.channel_id || "").trim();
    if (channelId) profileFields.YouTube_Channel_ID = channelId;
    saveSetting("YOUTUBE_CHANNEL_ID", channelId, "Profile-scoped YouTube channel ID from New Profile setup.");
    saveSetting("YOUTUBE_UPLOAD_SERVICE_URL", payload.upload_service_url, "Profile-scoped YouTube uploader service URL.");
    saveSetting("YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET", payload.upload_service_shared_secret, "Profile-scoped YouTube uploader service shared secret.");
  }
  if (platformKey === "tiktok") {
    const handle = String(payload.tiktok_handle || payload.desired_handle || "").trim().replace(/^@/, "");
    if (handle) profileFields.TikTok_Handle = handle;
    saveSetting("TIKTOK_WORKER_BASE_URL", payload.worker_base_url, "Profile-scoped TikTok auth/publish worker URL.");
  }

  if (Object.keys(profileFields).length) {
    await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId, {
      method: "PATCH",
      body: JSON.stringify({ fields: profileFields, typecast: true }),
    });
  }
  for (const [name, value, note] of settingsToWrite) {
    await studioUpsertSetting(env, name, value, note);
  }
  if (settingsToWrite.length) nextPlatform.credentials_saved = true;

  let state = normalizeProfileSetupState({
    ...prior,
    platforms: { ...prior.platforms, [platformKey]: nextPlatform },
  }, prior);
  await saveStudioProfileSetupState(env, state);

  const refreshed = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId);
  const connections = await studioProfileSetupConnectionSnapshot(env, refreshed);
  const platformConnection = connections[platformKey] || { status: "not_configured" };
  const verifiedPlatform = {
    ...state.platforms[platformKey],
    last_verified_at: new Date().toISOString(),
    last_status: platformConnection.status || "not_configured",
    last_error: platformConnection.error || null,
  };
  state = normalizeProfileSetupState({
    ...state,
    platforms: { ...state.platforms, [platformKey]: verifiedPlatform },
  }, state);
  await saveStudioProfileSetupState(env, state);

  const checklist = profileSetupChecklist(state, connections);
  return respond(request, env, {
    ok: true,
    platform: platformKey,
    descriptor: PROFILE_SETUP_PLATFORMS[platformKey],
    connection: platformConnection,
    state,
    connections,
    checklist,
  });
}
/*__STUDIO_WORKER_END:updateStudioProfileSetupPlatform__*/

export async function activateStudioProfileSetup(request, env, url, authorization) {
  const profileId = studioProfileSetupRecordIdFromPath(url);
  const profile = await loadAuthorizedStudioProfileSetupRecord(env, authorization, profileId);
  let state = await loadStudioProfileSetupState(env, profile);
  const connections = await studioProfileSetupConnectionSnapshot(env, profile);
  const checklist = profileSetupChecklist(state, connections);
  if (!checklist.can_activate) {
    return respond(request, env, {
      ok: false,
      error: "Complete or defer every selected platform and finish the city strategy before activation.",
      state,
      connections,
      checklist,
    }, 409);
  }
  await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId, {
    method: "PATCH",
    body: JSON.stringify({ fields: { Active: true }, typecast: true }),
  });
  state = normalizeProfileSetupState({
    ...state,
    lifecycle: "active",
    activated_at: new Date().toISOString(),
  }, state);
  await saveStudioProfileSetupState(env, state);
  env.__contentProfilesPromise = null;
  const refreshed = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, profileId);
  return respond(request, env, {
    ok: true,
    activated: true,
    ...(await studioProfileSetupSummary(env, refreshed)),
  });
}

/*__STUDIO_WORKER_END:activateStudioProfileSetup__*/

export function cleanIdeaCreatePayload(payload) {
  const title = String(payload?.title || "").trim();
  const summary = String(payload?.summary || "").trim();
  const primaryLocation = String(payload?.primary_location || "").trim();

  if (!title) throw new HttpError(400, "Idea title is required");
  if (title.length > 160) throw new HttpError(400, "Idea title must be 160 characters or fewer");
  if (summary.length > 5000) throw new HttpError(400, "Idea summary must be 5000 characters or fewer");
  if (primaryLocation.length > 200) throw new HttpError(400, "Primary location must be 200 characters or fewer");

  return { title, summary, primary_location: primaryLocation };
}
/*__STUDIO_WORKER_END:cleanIdeaCreatePayload__*/

export async function createIdea(request, env, authorization) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }

  const input = cleanIdeaCreatePayload(payload);
  const profile = await resolveWorkingContentProfile(env, authorization, requestedProfileId(null, payload));
  const fields = {
    Candidate_Title: input.title,
    Candidate_Status: "Generated",
    Batch_Date: new Date().toISOString().slice(0, 10),
    Content_Profile: [profile.id],
    Production_Include_Voiceover: "Yes",
    Production_Include_Background_Music: "Yes",
    Production_Include_Thumbnail: "Yes",
  };
  if (input.summary) fields.Idea_Summary = input.summary;
  const inferredLocation = suggestPrimaryLocationFromIdea({
    fields: {
      Candidate_Title: input.title,
      Idea_Summary: input.summary || "",
      Primary_Location: input.primary_location || "",
    },
  });
  if (input.primary_location) fields.Primary_Location = input.primary_location;
  else if (inferredLocation.name) fields.Primary_Location = inferredLocation.name;

  const created = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, "", {
    method: "POST",
    body: JSON.stringify({ fields, typecast: false }),
  });

  return respond(request, env, {
    ok: true,
    created: true,
    record: mapIdea(created),
    context: {
      organization: authorization.organization,
      brand: authorization.brand,
      content_profile: {
        record_id: profile.id,
        name: f(profile, "Profile_Name"),
      },
      created_by: authorization.user,
      role: authorization.role,
    },
  }, 201);
}
/*__STUDIO_WORKER_END:createIdea__*/

export function ideaRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/ideas\/(rec[A-Za-z0-9]+)/);
  if (!match) throw new HttpError(400, "Invalid Airtable record ID");
  return match[1];
}
/*__STUDIO_WORKER_END:ideaRecordIdFromPath__*/

export async function loadAuthorizedIdea(env, recordId, authorization) {
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) {
    throw new HttpError(400, "Invalid Airtable record ID");
  }

  const record = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId);
  const profileLinks = Array.isArray(f(record, "Content_Profile")) ? f(record, "Content_Profile") : [];
  const authorizedProfiles = await resolveAuthorizedContentProfiles(env, authorization);
  const authorizedProfileIds = new Set(authorizedProfiles.map((profile) => profile.id));

  if (!profileLinks.some((id) => authorizedProfileIds.has(id))) {
    throw new HttpError(403, "Idea Candidate is not part of the authorized Studio brand");
  }

  return record;
}
/*__STUDIO_WORKER_END:loadAuthorizedIdea__*/

export function assertIdeaUnpromoted(record, actionLabel) {
  const contentLinks = Array.isArray(f(record, "Content Items")) ? f(record, "Content Items") : [];
  const promotedId = String(f(record, "Promoted_Content_Record_ID") || "").trim();
  if (contentLinks.length || promotedId) {
    throw new HttpError(409, `${actionLabel} is not allowed after an Idea Candidate has been promoted`);
  }
}
/*__STUDIO_WORKER_END:assertIdeaUnpromoted__*/

export function assertIdeaNotApproved(record, actionLabel) {
  const status = String(f(record, "Candidate_Status") || "").trim();
  if (status === "Approved") {
    throw new HttpError(
      409,
      `${actionLabel} is not allowed while Candidate_Status is Approved; promotion handling is managed separately`
    );
  }
}
/*__STUDIO_WORKER_END:assertIdeaNotApproved__*/

export function cleanIdeaUpdatePayload(payload) {
  const title = String(payload?.title ?? "").trim();
  const summary = String(payload?.summary ?? "").trim();
  const primaryLocation = String(payload?.primary_location ?? "").trim();

  if (!title) throw new HttpError(400, "Idea title is required");
  if (title.length > 160) throw new HttpError(400, "Idea title must be 160 characters or fewer");
  if (summary.length > 5000) throw new HttpError(400, "Idea summary must be 5000 characters or fewer");
  if (primaryLocation.length > 200) throw new HttpError(400, "Primary location must be 200 characters or fewer");

  return { title, summary, primary_location: primaryLocation };
}
/*__STUDIO_WORKER_END:cleanIdeaUpdatePayload__*/

export async function updateIdea(request, env, url, authorization) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }

  const recordId = ideaRecordIdFromPath(url);
  const record = await loadAuthorizedIdea(env, recordId, authorization);
  assertIdeaUnpromoted(record, "Editing");
  assertIdeaNotApproved(record, "Editing");

  const input = cleanIdeaUpdatePayload(payload);
  let productionFields = {};
  try {
    productionFields = ideaProductionConfigFields(payload, String(f(record, "Production_Config_Notes") || ""));
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Invalid production options");
  }
  const fields = {
    Candidate_Title: input.title,
    Idea_Summary: input.summary || null,
    ...productionFields,
  };
  if (Object.prototype.hasOwnProperty.call(payload || {}, "primary_location")) {
    fields.Primary_Location = input.primary_location || null;
  } else if (!String(f(record, "Primary_Location") || "").trim()) {
    const inferredLocation = suggestPrimaryLocationFromIdea({
      fields: {
        Candidate_Title: input.title,
        Idea_Summary: input.summary || "",
        Primary_Location: "",
        Neighborhood_or_Area: f(record, "Neighborhood_or_Area"),
      },
    });
    if (inferredLocation.name) fields.Primary_Location = inferredLocation.name;
  }
  const updated = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      fields,
      // Select fields (platforms, content type) need typecast. Text-only saves stay strict.
      typecast: Object.keys(productionFields).length > 0,
    }),
  });

  return respond(request, env, {
    ok: true,
    updated: true,
    record: mapIdea(updated),
  });
}
/*__STUDIO_WORKER_END:updateIdea__*/

export async function holdIdea(request, env, url, authorization) {
  // Parse the JSON body even though this action currently has no user fields.
  // This keeps all Studio writes on the same JSON-only contract.
  try { await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const recordId = ideaRecordIdFromPath(url);
  const record = await loadAuthorizedIdea(env, recordId, authorization);
  assertIdeaUnpromoted(record, "Hold");
  assertIdeaNotApproved(record, "Hold");

  const status = String(f(record, "Candidate_Status") || "Generated").trim() || "Generated";
  if (status === "On Hold") {
    return respond(request, env, { ok: true, held: true, record: mapIdea(record) });
  }

  const updated = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Candidate_Status: "On Hold",
        Studio_PreHold_Status: status,
        Studio_Hold_At: new Date().toISOString(),
        Studio_Hold_By: authorization?.user?.email || authorization?.email || null,
      },
      typecast: false,
    }),
  });

  return respond(request, env, {
    ok: true,
    held: true,
    record: mapIdea(updated),
  });
}
/*__STUDIO_WORKER_END:holdIdea__*/

export async function restoreIdea(request, env, url, authorization) {
  try { await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const recordId = ideaRecordIdFromPath(url);
  const record = await loadAuthorizedIdea(env, recordId, authorization);
  assertIdeaUnpromoted(record, "Restore");

  const currentStatus = String(f(record, "Candidate_Status") || "").trim();
  if (currentStatus !== "On Hold") {
    return respond(request, env, { ok: true, restored: true, record: mapIdea(record) });
  }

  const prior = String(f(record, "Studio_PreHold_Status") || "Generated").trim();
  const safeRestoreStatuses = new Set(["Generated", "Tune Requested", "Rejected"]);
  const restoredStatus = safeRestoreStatuses.has(prior) ? prior : "Generated";

  const updated = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Candidate_Status: restoredStatus,
        Studio_PreHold_Status: null,
        Studio_Hold_At: null,
        Studio_Hold_By: null,
      },
      typecast: false,
    }),
  });

  return respond(request, env, {
    ok: true,
    restored: true,
    record: mapIdea(updated),
  });
}
/*__STUDIO_WORKER_END:restoreIdea__*/

export async function deleteIdea(request, env, url, authorization) {
  try { await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const recordId = ideaRecordIdFromPath(url);
  const record = await loadAuthorizedIdea(env, recordId, authorization);
  assertIdeaUnpromoted(record, "Delete");
  assertIdeaNotApproved(record, "Delete");

  const deleted = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId, {
    method: "DELETE",
  });

  return respond(request, env, {
    ok: true,
    deleted: Boolean(deleted?.deleted),
    record_id: recordId,
    candidate_id: f(record, "Candidate_ID"),
    title: f(record, "Candidate_Title"),
  });
}


/*__STUDIO_WORKER_END:deleteIdea__*/

export function productionRequestIdFromOutputsPath(url) {
  const match = url.pathname.match(/^\/api\/production-requests\/(rec[A-Za-z0-9]+)\/outputs$/);
  if (!match) throw new HttpError(400, "Invalid Production Request outputs route");
  return match[1];
}
/*__STUDIO_WORKER_END:productionRequestIdFromOutputsPath__*/

export function productionRequestOutputIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/production-request-outputs\/(rec[A-Za-z0-9]+)$/);
  if (!match) throw new HttpError(400, "Invalid Production Request Output route");
  return match[1];
}
/*__STUDIO_WORKER_END:productionRequestOutputIdFromPath__*/

export function makeProductionRequestOutputId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PRO-${stamp}-${random}`;
}
/*__STUDIO_WORKER_END:makeProductionRequestOutputId__*/

export function normalizeOutputType(platform, outputType) {
  const p = String(platform || "").trim();
  const o = String(outputType || "").trim();
  if (!PRO_OUTPUT_TYPES_BY_PLATFORM[p]) throw new HttpError(400, `Unsupported output platform: ${p || "(blank)"}`);
  if (!PRO_OUTPUT_TYPES_BY_PLATFORM[p].has(o)) {
    throw new HttpError(400, `${o || "(blank)"} is not a supported ${p} output type`);
  }
  return { platform: p, output_type: o };
}
/*__STUDIO_WORKER_END:normalizeOutputType__*/

export function mapProductionRequestOutput(record, master = null) {
  const links = (name) => Array.isArray(f(record, name)) ? f(record, name) : [];
  const choice = (field, masterValue) => {
    const value = String(f(record, field) || "Inherit").trim() || "Inherit";
    return value === "Inherit" ? masterValue : value;
  };
  const number = (field, masterValue) => {
    const value = f(record, field);
    return value === null || value === undefined || value === "" ? masterValue : value;
  };
  const text = (field, masterValue) => {
    const value = String(f(record, field) || "").trim();
    return value || masterValue || "";
  };

  const selectedMusicLinks = links("Selected_Music_Asset_Override");
  const masterMusicLinks = master && Array.isArray(f(master, "Selected_Music_Asset"))
    ? f(master, "Selected_Music_Asset")
    : [];

  const mapped = {
    id: record.id,
    production_request_output_id: f(record, "Production_Request_Output_ID"),
    production_request_links: links("Production_Request"),
    organization_links: links("Organization"),
    brand_links: links("Brand"),
    created_by_links: links("Created_By"),
    platform: f(record, "Platform"),
    output_type: f(record, "Output_Type"),
    status: f(record, "Output_Status"),
    output_order: f(record, "Output_Order"),
    enabled: Boolean(f(record, "Enabled")),
    active: Boolean(f(record, "Active")),
    voiceover_mode_override: f(record, "Voiceover_Mode_Override") || "Inherit",
    background_music_mode_override: f(record, "Background_Music_Mode_Override") || "Inherit",
    thumbnail_mode_override: f(record, "Thumbnail_Mode_Override") || "Inherit",
    video_duration_seconds_override: f(record, "Video_Duration_Seconds_Override"),
    video_clip_count_mode_override: f(record, "Video_Clip_Count_Mode_Override") || "Inherit",
    video_clip_count_exact_override: f(record, "Video_Clip_Count_Exact_Override"),
    video_clip_count_min_override: f(record, "Video_Clip_Count_Min_Override"),
    video_clip_count_max_override: f(record, "Video_Clip_Count_Max_Override"),
    carousel_slide_count_mode_override: f(record, "Carousel_Slide_Count_Mode_Override") || "Inherit",
    carousel_slide_count_exact_override: f(record, "Carousel_Slide_Count_Exact_Override"),
    carousel_slide_count_min_override: f(record, "Carousel_Slide_Count_Min_Override"),
    carousel_slide_count_max_override: f(record, "Carousel_Slide_Count_Max_Override"),
    carousel_image_mode_override: f(record, "Carousel_Image_Mode_Override") || "Inherit",
    voiceover_tail_seconds_override: f(record, "Voiceover_Tail_Seconds_Override"),
    selected_music_asset_override_links: selectedMusicLinks,
    title_mode_override: f(record, "Title_Mode_Override") || "Inherit",
    requested_title_override: f(record, "Requested_Title_Override"),
    caption_mode_override: f(record, "Caption_Mode_Override") || "Inherit",
    requested_caption_override: f(record, "Requested_Caption_Override"),
    script_mode_override: f(record, "Script_Mode_Override") || "Inherit",
    requested_script_override: f(record, "Requested_Script_Override"),
    output_notes: f(record, "Output_Notes"),
    publish_mode: f(record, "Publish_Mode") || "Inherit",
    scheduled_at: f(record, "Scheduled_At"),
    created_at: f(record, "Created_At"),
    updated_at: f(record, "Updated_At"),
    platform_output_links: links("Platform_Output"),
  };

  if (master) {
    mapped.effective = {
      voiceover_mode: choice("Voiceover_Mode_Override", f(master, "Voiceover_Mode")),
      background_music_mode: choice("Background_Music_Mode_Override", f(master, "Background_Music_Mode")),
      thumbnail_mode: choice("Thumbnail_Mode_Override", f(master, "Thumbnail_Mode")),
      video_duration_seconds: number(
        "Video_Duration_Seconds_Override",
        item4IsCompanionOutputType(f(record, "Output_Type"))
          ? ITEM4_STORY_TEASER_SECONDS
          : f(master, "Video_Duration_Seconds")
      ),
      video_clip_count_mode: choice("Video_Clip_Count_Mode_Override", f(master, "Video_Clip_Count_Mode")),
      video_clip_count_exact: number("Video_Clip_Count_Exact_Override", f(master, "Video_Clip_Count_Exact")),
      video_clip_count_min: number("Video_Clip_Count_Min_Override", f(master, "Video_Clip_Count_Min")),
      video_clip_count_max: number("Video_Clip_Count_Max_Override", f(master, "Video_Clip_Count_Max")),
      carousel_slide_count_mode: choice("Carousel_Slide_Count_Mode_Override", f(master, "Carousel_Slide_Count_Mode")),
      carousel_slide_count_exact: number("Carousel_Slide_Count_Exact_Override", f(master, "Carousel_Slide_Count_Exact")),
      carousel_slide_count_min: number("Carousel_Slide_Count_Min_Override", f(master, "Carousel_Slide_Count_Min")),
      carousel_slide_count_max: number("Carousel_Slide_Count_Max_Override", f(master, "Carousel_Slide_Count_Max")),
      carousel_image_mode: choice("Carousel_Image_Mode_Override", f(master, "Carousel_Image_Mode")),
      voiceover_tail_seconds: number("Voiceover_Tail_Seconds_Override", f(master, "Voiceover_Tail_Seconds")),
      selected_music_asset_links: selectedMusicLinks.length ? selectedMusicLinks : masterMusicLinks,
      title_mode: choice("Title_Mode_Override", f(master, "Title_Mode")),
      requested_title: text("Requested_Title_Override", f(master, "Requested_Title")),
      caption_mode: choice("Caption_Mode_Override", f(master, "Caption_Mode")),
      requested_caption: text("Requested_Caption_Override", f(master, "Requested_Caption")),
      script_mode: choice("Script_Mode_Override", f(master, "Script_Mode")),
      requested_script: text("Requested_Script_Override", f(master, "Requested_Script")),
      production_notes: [String(f(master, "Production_Notes") || "").trim(), String(f(record, "Output_Notes") || "").trim()]
        .filter(Boolean).join("\n\n"),
      publish_mode: String(f(record, "Publish_Mode") || "Inherit").trim() || "Inherit",
      scheduled_at: f(record, "Scheduled_At"),
    };
  }

  return mapped;
}
/*__STUDIO_WORKER_END:mapProductionRequestOutput__*/

export async function outputRowsForProductionRequest(env, productionRequestId, options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const requestId = String(productionRequestId || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(requestId)) return [];

  // Reverse links lag during concurrent POSTs, so also scan by the request
  // name/id. Include inactive rows when collapsing so extras cannot hide.
  const byId = new Map();
  let parent = null;
  try {
    parent = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
    const linkedIds = arrayOrEmpty(f(parent, "Production Request Outputs"))
      .map((id) => String(id || "").trim())
      .filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
    for (let i = 0; i < linkedIds.length; i += 40) {
      const slice = linkedIds.slice(i, i + 40);
      const formula = `OR(${slice.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
      const page = await listRecords(env, PRODUCTION_REQUEST_OUTPUT_TABLE, {
        limit: slice.length,
        filterFormula: formula,
      });
      for (const row of page) if (row?.id) byId.set(row.id, row);
    }
  } catch (error) {
    console.warn("outputRowsForProductionRequest parent lookup failed", requestId, error);
  }

  const prName = String(f(parent || {}, "Production_Request_ID") || "").replace(/'/g, "\\'");
  const clauses = [`FIND('${requestId}', ARRAYJOIN({Production_Request})&"")`];
  if (prName) clauses.push(`FIND('${prName}', ARRAYJOIN({Production_Request})&"")`);
  let offset = null;
  let pages = 0;
  do {
    const page = await listRecordsPage(env, PRODUCTION_REQUEST_OUTPUT_TABLE, {
      limit: 100,
      offset,
      filterFormula: clauses.length > 1 ? `OR(${clauses.join(",")})` : clauses[0],
    });
    for (const row of page.records || []) if (row?.id) byId.set(row.id, row);
    offset = page.offset || null;
    pages += 1;
  } while (offset && pages < 10);

  const rows = [...byId.values()];
  const filtered = includeInactive ? rows : rows.filter((row) => Boolean(f(row, "Active")));
  return filtered.sort((a, b) => Number(f(a, "Output_Order") || 0) - Number(f(b, "Output_Order") || 0));
}
/*__STUDIO_WORKER_END:outputRowsForProductionRequest__*/

export async function loadAuthorizedProductionRequestOutput(env, outputRecordId, authorization) {
  const row = await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, outputRecordId);
  const requestLinks = Array.isArray(f(row, "Production_Request")) ? f(row, "Production_Request") : [];
  if (requestLinks.length !== 1) throw new HttpError(409, "Production Request Output has an invalid parent link");
  const parent = await loadAuthorizedProductionRequest(env, requestLinks[0], authorization);

  const orgLinks = Array.isArray(f(row, "Organization")) ? f(row, "Organization") : [];
  const brandLinks = Array.isArray(f(row, "Brand")) ? f(row, "Brand") : [];
  if (!orgLinks.includes(authorization?.organization?.record_id) ||
      !membershipAllowsBrand(authorization, brandLinks)) {
    throw new HttpError(403, "Production Request Output is not part of the authorized Studio tenant/brand");
  }
  return { row, parent };
}
/*__STUDIO_WORKER_END:loadAuthorizedProductionRequestOutput__*/

export function assertEditableProductionRequest(parent) {
  const status = String(f(parent, "Request_Status") || "").trim();
  if (!productionRequestEditable(parent)) {
    throw new HttpError(409, `Production Request is ${status || "locked"} and its requested outputs cannot be edited`);
  }
}
/*__STUDIO_WORKER_END:assertEditableProductionRequest__*/

export async function listProductionRequestOutputs(request, env, url, authorization, ctx) {
  // v0.10.6: this endpoint is part of every Production workspace data refresh.
  // Run the P3 hardener after the response so the outputs list is not waiting on Make.
  deferItem4MakeHardening(ctx, env);
  const productionRequestId = productionRequestIdFromOutputsPath(url);
  const parent = await loadAuthorizedProductionRequest(env, productionRequestId, authorization);
  const rows = await outputRowsForProductionRequest(env, productionRequestId);
  return respond(request, env, {
    ok: true,
    production_request: mapProductionRequest(parent),
    records: rows.map(row => mapProductionRequestOutput(row, parent)),
    supported_outputs: Object.fromEntries(
      Object.entries(PRO_OUTPUT_TYPES_BY_PLATFORM).map(([platform, values]) => [platform, [...values]])
    ),
  });
}
/*__STUDIO_WORKER_END:listProductionRequestOutputs__*/

export async function syncProductionRequestOutputs(request, env, url, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const productionRequestId = productionRequestIdFromOutputsPath(url);
  let parent = await loadAuthorizedProductionRequest(env, productionRequestId, authorization);
  assertEditableProductionRequest(parent);

  const requested = Array.isArray(payload?.outputs) ? payload.outputs : [];
  const normalized = [];
  const seen = new Set();
  const scheduleOverrides = studioScheduleOverridesFromPayload(payload);

  for (const item of requested) {
    if (item?.enabled === false) continue;
    const pair = normalizeOutputType(item?.platform, item4CanonicalOutputType(item?.platform, item?.output_type) || item?.output_type);
    if (item4IsUnsupportedCompanion(pair.platform, pair.output_type)) continue;
    const key = `${pair.platform}::${pair.output_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(pair);
    const iso = String(item?.scheduled_at || "").trim();
    if (iso && !Number.isNaN(Date.parse(iso))) scheduleOverrides.set(key, new Date(iso).toISOString());
  }

  if (!normalized.length) throw new HttpError(400, "Choose at least one platform output");

  const finishedVideo = studioFinishedOriginKind(parent) === "finished-video";
  const planItems = finishedVideo
    ? capFinishedPlanItems(normalized, { notes: studioRequestNotesText(parent) })
    : uniquePlanItems(normalized);
  let azLock = null;
  if (finishedVideo) {
    azLock = await acquireAzOutputLock(env, parent);
    parent = azLock.record;
    if (!azLock.acquired) {
      await item4CollapseDuplicatePlanOutputs(
        env,
        await outputRowsForProductionRequest(env, productionRequestId, { includeInactive: true }),
        { finishedVideo: true }
      );
      const rows = await outputRowsForProductionRequest(env, productionRequestId);
      return respond(request, env, {
        ok: true,
        synchronized: true,
        locked: true,
        production_request: mapProductionRequest(parent),
        records: rows.map(row => mapProductionRequestOutput(row, parent)),
      });
    }
  }
  let existing = await outputRowsForProductionRequest(env, productionRequestId, { includeInactive: true });
  await item4CollapseDuplicatePlanOutputs(env, existing, { finishedVideo });
  existing = await outputRowsForProductionRequest(env, productionRequestId, { includeInactive: true });
  const rowKey = (row) => finishedVideo
    ? canonicalFinishedDestinationKey(f(row, "Platform"), f(row, "Output_Type"))
    : `${String(f(row, "Platform") || "").trim()}::${String(f(row, "Output_Type") || "").trim()}`;
  const byKey = new Map(existing.map(row => [rowKey(row), row]));

  const now = new Date().toISOString();
  const occupancyProfile = await item4ProductionProfileRecord(env, parent).catch(() => null);
  const occupied = await studioLoadPlanScheduleOccupancy(env, { excludeRequestId: productionRequestId, profile: occupancyProfile });
  const timeZone = await studioScheduleTimeZoneForRecord(env, parent, payload);
  const stamps = studioBuildSuggestedScheduleMap(planItems.map((item) => {
    const key = `${item.platform}::${item.output_type}`;
    const current = byKey.get(finishedVideo ? canonicalFinishedDestinationKey(item.platform, item.output_type) : key);
    return {
      platform: item.platform,
      output_type: item.output_type,
      scheduled_at: scheduleOverrides.get(key) || (current ? f(current, "Scheduled_At") : "") || "",
    };
  }), occupied, new Date(), { timeZone });

  const patchRows = [];
  const createFields = [];
  let destinationsChanged = false;
  const selectedKeys = new Set(planItems.map((item) => (
    finishedVideo
      ? canonicalFinishedDestinationKey(item.platform, item.output_type)
      : `${item.platform}::${item.output_type}`
  )));

  for (let i = 0; i < planItems.length; i++) {
    const item = planItems[i];
    const key = `${item.platform}::${item.output_type}`;
    const destKey = finishedVideo ? canonicalFinishedDestinationKey(item.platform, item.output_type) : key;
    const current = byKey.get(destKey);
    const storyFields = item4CompanionStoryFields(item.output_type, { finishedVideo });
    const scheduledAt = studioDestinationScheduleStamp(current, key, stamps, scheduleOverrides);

    if (current) {
      const wasEnabled = Boolean(f(current, "Enabled"));
      const wasActive = Boolean(f(current, "Active"));
      const prevOrder = Number(f(current, "Output_Order") || 0);
      const prevScheduled = String(f(current, "Scheduled_At") || "").trim();
      const nextScheduled = String(scheduledAt || "").trim();
      if (!wasEnabled || !wasActive || prevOrder !== (i + 1) || (nextScheduled && nextScheduled !== prevScheduled)) {
        destinationsChanged = true;
      }
      patchRows.push({
        id: current.id,
        fields: {
          Enabled: true,
          Active: true,
          Output_Order: i + 1,
          Output_Status: "Draft",
          Updated_At: now,
          ...(scheduledAt ? { Scheduled_At: scheduledAt } : {}),
          ...storyFields,
        },
      });
      continue;
    }
    if (finishedVideo) {
      // Lock ownership is decided once at function entry. Do not re-check the
      // note token here: overlapping workspace + cron calls can overwrite that
      // token after acquisition and otherwise starve all writers at zero rows.
      if (!azLock?.acquired) continue;
      if (!shouldCreateFinishedOutput(finishedEnabledKeysFromRows(existing), destKey)) continue;
    }
    destinationsChanged = true;
    createFields.push({
      Production_Request_Output_ID: makeProductionRequestOutputId(),
      Production_Request: [parent.id],
      Test_Run_ID: String(f(parent, "Test_Run_ID") || "").trim() || null,
      Organization: [authorization.organization.record_id],
      Brand: [arrayOrEmpty(f(parent, "Brand"))[0] || authorization.brand.record_id],
      Created_By: [authorization.user.record_id],
      Platform: item.platform,
      Output_Type: item.output_type,
      Output_Status: "Draft",
      Output_Order: i + 1,
      Enabled: true,
      Voiceover_Mode_Override: storyFields.Voiceover_Mode_Override || "Inherit",
      Background_Music_Mode_Override: storyFields.Background_Music_Mode_Override || "Inherit",
      Thumbnail_Mode_Override: "Inherit",
      Video_Duration_Seconds_Override: storyFields.Video_Duration_Seconds_Override ?? null,
      Video_Clip_Count_Mode_Override: storyFields.Video_Clip_Count_Mode_Override || "Inherit",
      Video_Clip_Count_Exact_Override: storyFields.Video_Clip_Count_Exact_Override ?? null,
      Carousel_Slide_Count_Mode_Override: "Inherit",
      Carousel_Image_Mode_Override: "Inherit",
      Title_Mode_Override: "Inherit",
      Caption_Mode_Override: "Inherit",
      Script_Mode_Override: "Inherit",
      Publish_Mode: "Inherit",
      Scheduled_At: scheduledAt || stamps.get(key) || null,
      Created_At: now,
      Updated_At: now,
      Active: true,
    });
  }

  for (const row of existing) {
    const key = rowKey(row);
    if (selectedKeys.has(key)) continue;
    if (!Boolean(f(row, "Enabled")) && !(finishedVideo && Boolean(f(row, "Active")))) continue;
    destinationsChanged = true;
    patchRows.push({
      id: row.id,
      fields: {
        Enabled: false,
        Active: finishedVideo ? false : f(row, "Active"),
        Updated_At: now,
      },
    });
  }

  if (patchRows.length) {
    await airtableBatchUpdate(env, PRODUCTION_REQUEST_OUTPUT_TABLE, patchRows, { typecast: false });
  }
  if (createFields.length) {
    const createdRows = await airtableBatchCreate(env, PRODUCTION_REQUEST_OUTPUT_TABLE, createFields, { typecast: false });
    for (const created of createdRows) {
      if (!created?.id) continue;
      byKey.set(rowKey(created), created);
    }
  }

  const targetPlatforms = [...new Set(planItems.map(item => item.platform))];
  const prevPlatforms = [...new Set(arrayOrEmpty(f(parent, "Target_Platforms")).map((value) => String(value || "").trim()).filter(Boolean))].sort();
  const nextPlatforms = [...targetPlatforms].sort();
  const platformsChanged = prevPlatforms.length !== nextPlatforms.length
    || prevPlatforms.some((value, index) => value !== nextPlatforms[index]);
  let updatedParent = parent;
  if (platformsChanged || destinationsChanged) {
    updatedParent = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, parent.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Target_Platforms: targetPlatforms, Updated_At: now },
        typecast: false,
      }),
    });
  }
  updatedParent = await item4ReconcilePlanWithEnabledOutputs(env, updatedParent, planItems);
  if (destinationsChanged) {
    updatedParent = await item4RelinkVariantQueueOutputs(env, updatedParent);
  }
  await item4CollapseDuplicatePlanOutputs(
    env,
    await outputRowsForProductionRequest(env, productionRequestId, { includeInactive: true }),
    { finishedVideo }
  );

  const rows = await outputRowsForProductionRequest(env, productionRequestId);
  return respond(request, env, {
    ok: true,
    synchronized: true,
    production_request: mapProductionRequest(updatedParent),
    records: rows.map(row => mapProductionRequestOutput(row, updatedParent)),
  });
}
/*__STUDIO_WORKER_END:syncProductionRequestOutputs__*/

export function cleanProductionRequestOutputPatch(payload) {
  const fields = {};
  const choiceField = (key, field, allowed, fallback = "Inherit") => {
    if (payload?.[key] !== undefined) fields[field] = normalizeChoice(payload[key], allowed, fallback, field);
  };
  const intField = (key, field, min, max, label) => {
    if (payload?.[key] !== undefined) fields[field] = nullableInt(payload[key], min, max, label);
  };
  const numField = (key, field, min, max, label) => {
    if (payload?.[key] !== undefined) fields[field] = nullableNumber(payload[key], min, max, label);
  };

  if (payload?.enabled !== undefined) fields.Enabled = Boolean(payload.enabled);
  choiceField("voiceover_mode_override", "Voiceover_Mode_Override", PRO_OUTPUT_OVERRIDE_TRISTATE);
  choiceField("background_music_mode_override", "Background_Music_Mode_Override", PRO_OUTPUT_OVERRIDE_TRISTATE);
  choiceField("thumbnail_mode_override", "Thumbnail_Mode_Override", PRO_OUTPUT_THUMBNAIL_OVERRIDE);
  intField("video_duration_seconds_override", "Video_Duration_Seconds_Override", 5, 600, "Video duration override");
  choiceField("video_clip_count_mode_override", "Video_Clip_Count_Mode_Override", PRO_OUTPUT_COUNT_MODES);
  intField("video_clip_count_exact_override", "Video_Clip_Count_Exact_Override", 1, 60, "Exact video clip count override");
  intField("video_clip_count_min_override", "Video_Clip_Count_Min_Override", 1, 60, "Minimum video clip count override");
  intField("video_clip_count_max_override", "Video_Clip_Count_Max_Override", 1, 60, "Maximum video clip count override");
  choiceField("carousel_slide_count_mode_override", "Carousel_Slide_Count_Mode_Override", PRO_OUTPUT_COUNT_MODES);
  intField("carousel_slide_count_exact_override", "Carousel_Slide_Count_Exact_Override", 1, Number.MAX_SAFE_INTEGER, "Exact carousel slide count override");
  intField("carousel_slide_count_min_override", "Carousel_Slide_Count_Min_Override", 1, Number.MAX_SAFE_INTEGER, "Minimum carousel slide count override");
  intField("carousel_slide_count_max_override", "Carousel_Slide_Count_Max_Override", 1, Number.MAX_SAFE_INTEGER, "Maximum carousel slide count override");
  choiceField("carousel_image_mode_override", "Carousel_Image_Mode_Override", PRO_OUTPUT_CAROUSEL_IMAGE_MODES);
  numField("voiceover_tail_seconds_override", "Voiceover_Tail_Seconds_Override", 0, 10, "Voiceover tail override");
  choiceField("title_mode_override", "Title_Mode_Override", PRO_OUTPUT_TEXT_MODES);
  choiceField("caption_mode_override", "Caption_Mode_Override", PRO_OUTPUT_TEXT_MODES);
  choiceField("script_mode_override", "Script_Mode_Override", PRO_OUTPUT_TEXT_MODES);
  choiceField("publish_mode", "Publish_Mode", PRO_OUTPUT_PUBLISH_MODES);

  for (const [key, field, max, label] of [
    ["requested_title_override", "Requested_Title_Override", 500, "Requested title override"],
    ["requested_caption_override", "Requested_Caption_Override", 10000, "Requested caption override"],
    ["requested_script_override", "Requested_Script_Override", 25000, "Requested script override"],
    ["output_notes", "Output_Notes", 10000, "Output notes"],
  ]) {
    if (payload?.[key] === undefined) continue;
    const value = String(payload[key] || "").trim();
    if (value.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer`);
    fields[field] = value || null;
  }

  if (payload?.scheduled_at !== undefined) {
    const value = String(payload.scheduled_at || "").trim();
    if (value && Number.isNaN(Date.parse(value))) throw new HttpError(400, "Scheduled date/time is invalid");
    fields.Scheduled_At = value ? new Date(value).toISOString() : null;
  }
  return fields;
}
/*__STUDIO_WORKER_END:cleanProductionRequestOutputPatch__*/

export async function getProductionRequestOutput(request, env, url, authorization) {
  const outputRecordId = productionRequestOutputIdFromPath(url);
  const { row, parent } = await loadAuthorizedProductionRequestOutput(env, outputRecordId, authorization);
  return respond(request, env, {
    ok: true,
    record: mapProductionRequestOutput(row, parent),
    production_request: mapProductionRequest(parent),
  });
}
/*__STUDIO_WORKER_END:getProductionRequestOutput__*/

export async function updateProductionRequestOutput(request, env, url, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const outputRecordId = productionRequestOutputIdFromPath(url);
  const { row, parent } = await loadAuthorizedProductionRequestOutput(env, outputRecordId, authorization);
  assertEditableProductionRequest(parent);

  const fields = cleanProductionRequestOutputPatch(payload);
  if (payload?.selected_music_asset_override_id !== undefined) {
    const id = String(payload.selected_music_asset_override_id || "").trim();
    if (id) await validateMusicAsset(env, id);
    fields.Selected_Music_Asset_Override = id ? [id] : [];
  }
  fields.Updated_At = new Date().toISOString();

  const updated = await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, row.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: false }),
  });

  return respond(request, env, {
    ok: true,
    updated: true,
    record: mapProductionRequestOutput(updated, parent),
  });
}

/*__STUDIO_WORKER_END:updateProductionRequestOutput__*/

export function item4ParseJson(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}
/*__STUDIO_WORKER_END:item4ParseJson__*/

export function item4RequestIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/production-requests\/(rec[A-Za-z0-9]+)/);
  if (!match) throw new HttpError(400, "Invalid Production Request Item 4 route");
  return match[1];
}
/*__STUDIO_WORKER_END:item4RequestIdFromPath__*/

export function item4AssetIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/([A-Za-z0-9_-]+)(?:\/poster)?$/);
  return match ? match[1] : null;
}
/*__STUDIO_WORKER_END:item4AssetIdFromPath__*/

export function item4SafeFileName(name) {
  const clean = String(name || "photo").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return clean || "photo";
}
/*__STUDIO_WORKER_END:item4SafeFileName__*/

export function item4FileExtension(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}
/*__STUDIO_WORKER_END:item4FileExtension__*/

export function item4IsHeicFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  const ext = item4FileExtension(file?.name);
  return mime.includes("heic") || mime.includes("heif") || ext === "heic" || ext === "heif";
}
/*__STUDIO_WORKER_END:item4IsHeicFile__*/

export function item4IsSupportedImageFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  return mime.startsWith("image/") || item4IsHeicFile(file);
}
/*__STUDIO_WORKER_END:item4IsSupportedImageFile__*/

export function item4IsSupportedVideoFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  const ext = item4FileExtension(file?.name);
  return mime.startsWith("video/") || ["mp4", "mov", "m4v", "webm"].includes(ext);
}
/*__STUDIO_WORKER_END:item4IsSupportedVideoFile__*/

export function item4IsClipInputKind(kind) {
  return ITEM4_CLIP_INPUTS.includes(String(kind || "").trim().toLowerCase());
}
/*__STUDIO_WORKER_END:item4IsClipInputKind__*/

export function item4LooksLikeVideoAsset(asset) {
  const kind = String(asset?.media_kind || "").trim().toLowerCase();
  if (kind === "video") return true;
  if (kind === "photo" || kind === "image") return false;
  const mime = String(asset?.mime_type || "").toLowerCase();
  const name = String(asset?.name || "").toLowerCase();
  return mime.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(name);
}
/*__STUDIO_WORKER_END:item4LooksLikeVideoAsset__*/

export function item4AssetCompressionPending(asset) {
  const status = String(asset?.compression_status || "").trim().toLowerCase();
  if (status === "ready" || status === "skipped") return false;
  if (["pending", "queued", "compressing", "downloading", "failed"].includes(status)) return true;
  if (asset?.compression_needed === true) return true;
  return item4LooksLikeVideoAsset(asset)
    && Number(asset?.size_bytes || 0) > ITEM4_COMPRESS_THRESHOLD_BYTES
    && !item4UrlIsPublicPublishCdn(asset?.preview_public_url || asset?.url);
}
/*__STUDIO_WORKER_END:item4AssetCompressionPending__*/

export function item4AssetsNeedStudioCompress(assets) {
  return (Array.isArray(assets) ? assets : []).some(item4AssetCompressionPending);
}
/*__STUDIO_WORKER_END:item4AssetsNeedStudioCompress__*/

export function item4HealStaleCompressionAssets(assets) {
  let changed = false;
  const next = (Array.isArray(assets) ? assets : []).map((asset) => {
    if (!item4LooksLikeVideoAsset(asset)) return asset;
    const state = String(asset?.compression_status || "").trim().toLowerCase();
    if (!["pending", "queued", "compressing", "downloading"].includes(state)) return asset;
    const driveId = String(asset?.google_drive_file_id || "").trim();
    const mediaId = String(asset?.media_asset_record_id || "").trim();
    const progress = Number(asset?.compression_progress || 0);
    const preview = String(asset?.preview_public_url || asset?.url || "").trim();
    const previewReady = preview && item4UrlIsPublicPublishCdn(preview);
    if (!driveId || !mediaId) return asset;
    if (!(progress >= 95 || previewReady)) return asset;
    changed = true;
    return {
      ...asset,
      compression_status: "ready",
      compression_needed: false,
      compression_progress: 100,
      compression_error: null,
    };
  });
  return { assets: next, changed };
}
/*__STUDIO_WORKER_END:item4HealStaleCompressionAssets__*/

export function item4HasVideoMasters(assets) {
  return (Array.isArray(assets) ? assets : []).some(item4LooksLikeVideoAsset);
}
/*__STUDIO_WORKER_END:item4HasVideoMasters__*/

export function item4AssetMediaKind(asset) {
  return item4LooksLikeVideoAsset(asset) ? "video" : "photo";
}
/*__STUDIO_WORKER_END:item4AssetMediaKind__*/

export function item4LooksLikeImagePreviewUrl(url) {
  const raw = String(url || "").trim();
  if (!raw || /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(raw)) return false;
  return /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(raw)
    || raw.includes("/studio/previews/clip-posters/")
    || /\/api\/media-assets\/rec[^/]+\/preview/i.test(raw);
}
/*__STUDIO_WORKER_END:item4LooksLikeImagePreviewUrl__*/

export function item4IsClipPosterFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  return mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png" || mime === "image/webp";
}
/*__STUDIO_WORKER_END:item4IsClipPosterFile__*/

export async function item4PutClipPoster(env, recordId, assetId, bytes, contentType = "image/jpeg") {
  const key = `studio/previews/clip-posters/${recordId}/${assetId}.jpg`;
  await env.STUDIO_MEDIA.put(key, bytes, {
    httpMetadata: { contentType: String(contentType || "").startsWith("image/") ? contentType : "image/jpeg" },
    customMetadata: { productionRequestId: String(recordId), assetId: String(assetId), role: "clip-poster" },
  });
  return { key, url: `${ITEM4_MEDIA_PUBLIC_BASE}/${key}` };
}
/*__STUDIO_WORKER_END:item4PutClipPoster__*/

export async function item4GoogleAccessToken(env) {
  const clientId = String(env?.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(env?.GOOGLE_CLIENT_SECRET || "").trim();
  const refresh = String(env?.GOOGLE_REFRESH_TOKEN || "").trim();
  if (!clientId || !clientSecret || !refresh) return "";
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) {
      console.warn("Item 4 Google token refresh failed", response.status);
      return "";
    }
    const payload = await response.json().catch(() => ({}));
    return String(payload.access_token || "").trim();
  } catch (error) {
    console.warn("Item 4 Google token refresh failed", error);
    return "";
  }
}
/*__STUDIO_WORKER_END:item4GoogleAccessToken__*/

export async function studioFetchAuthenticatedDriveImageBytes(driveId, env) {
  const id = String(driveId || "").trim();
  if (!id) throw new HttpError(404, "Brand watermark Drive file ID is missing");
  const token = await item4GoogleAccessToken(env);
  if (!token) throw new HttpError(503, "Google Drive authentication is not configured for the brand watermark");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "image/png,image/webp,image/jpeg,image/*;q=0.9",
      },
      redirect: "follow",
    }
  );
  const contentType = String(response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!response.ok || !contentType.startsWith("image/")) {
    try { await response.body?.cancel(); } catch {}
    throw new HttpError(response.status || 502, `Brand watermark Drive fetch failed (${response.status || "unknown"})`);
  }
  const bytes = await response.arrayBuffer();
  if (!bytes || bytes.byteLength < 80) throw new HttpError(502, "Brand watermark Drive file was empty");
  return { bytes, contentType: contentType || "image/png" };
}
/*__STUDIO_WORKER_END:studioFetchAuthenticatedDriveImageBytes__*/

export async function studioEnsurePublicChicagoWatermark(env) {
  if (!env?.STUDIO_MEDIA) throw new HttpError(503, "Studio media storage is not configured");
  let object = await env.STUDIO_MEDIA.get(STUDIO_CHICAGO_WATERMARK_R2_KEY);
  if (object) return object;

  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, STUDIO_CHICAGO_WATERMARK_MEDIA_ASSET_ID);
  const driveId = String(f(record, "Google Drive File ID") || "").trim();
  const grabbed = await studioFetchAuthenticatedDriveImageBytes(driveId, env);
  await env.STUDIO_MEDIA.put(STUDIO_CHICAGO_WATERMARK_R2_KEY, grabbed.bytes, {
    httpMetadata: {
      contentType: grabbed.contentType || "image/png",
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      role: "chicagoshining-brand-watermark",
      sourceMediaAssetId: STUDIO_CHICAGO_WATERMARK_MEDIA_ASSET_ID,
      sourceDriveFileId: driveId,
    },
  });
  object = await env.STUDIO_MEDIA.get(STUDIO_CHICAGO_WATERMARK_R2_KEY);
  if (!object) throw new HttpError(502, "Brand watermark public cache write did not persist");
  return object;
}
/*__STUDIO_WORKER_END:studioEnsurePublicChicagoWatermark__*/

export async function publicChicagoShiningWatermark(request, env) {
  const object = await studioEnsurePublicChicagoWatermark(env);
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", headers.get("Content-Type") || "image/png");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Studio-Branding-Source", "authenticated-drive-r2-cache");
  headers.set("X-Studio-Branding-Record", STUDIO_CHICAGO_WATERMARK_MEDIA_ASSET_ID);
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  if (request.method === "HEAD") {
    try { await object.body?.cancel(); } catch {}
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}
/*__STUDIO_WORKER_END:publicChicagoShiningWatermark__*/

export async function item4FetchDriveThumbnailBytes(driveId, env = null) {
  const id = String(driveId || "").trim();
  if (!id) return null;
  const token = env ? await item4GoogleAccessToken(env) : "";
  if (token) {
    try {
      const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=thumbnailLink,hasThumbnail&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (meta.ok) {
        const body = await meta.json().catch(() => ({}));
        let link = String(body.thumbnailLink || "").trim();
        if (link) {
          if (/[?&]sz=/.test(link)) link = link.replace(/sz=[^&]+/, "sz=w720");
          else link += `${link.includes("?") ? "&" : "?"}sz=w720`;
          const thumb = await fetch(link, {
            headers: { Authorization: `Bearer ${token}`, Accept: "image/jpeg,image/png,image/*;q=0.8" },
            redirect: "follow",
          });
          const type = String(thumb.headers.get("Content-Type") || "").toLowerCase();
          if (thumb.ok && type.startsWith("image/") && !type.includes("svg")) {
            const bytes = await thumb.arrayBuffer();
            if (bytes && bytes.byteLength >= 80) {
              return { bytes, contentType: type.split(";")[0] || "image/jpeg" };
            }
          }
        }
      }
    } catch (error) {
      console.warn("Item 4 authenticated Drive thumbnail failed", error);
    }
  }
  const urls = [
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w640`,
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w640`,
  ];
  for (const source of urls) {
    try {
      const response = await fetch(source, {
        method: "GET",
        redirect: "follow",
        headers: { Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8" },
      });
      const type = String(response.headers.get("Content-Type") || "").toLowerCase();
      if (!response.ok || !type.startsWith("image/") || type.includes("svg")) {
        try { await response.body?.cancel(); } catch {}
        continue;
      }
      const bytes = await response.arrayBuffer();
      if (!bytes || bytes.byteLength < 80) continue;
      return { bytes, contentType: type.split(";")[0] || "image/jpeg" };
    } catch {}
  }
  return null;
}
/*__STUDIO_WORKER_END:item4FetchDriveThumbnailBytes__*/

export async function item4StampAssetPoster(env, recordId, assetId, stored) {
  const record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const assets = item4AssetManifest(record);
  const nextAssets = assets.map((asset) => String(asset?.id || "") === String(assetId)
    ? { ...asset, poster_url: stored.url, poster_r2_key: stored.key }
    : asset);
  const updated = await item4UpdateRequestState(env, recordId, {
    Studio_Master_Assets_JSON: JSON.stringify(nextAssets),
  });
  return { record: updated, assets: nextAssets, poster_url: stored.url };
}
/*__STUDIO_WORKER_END:item4StampAssetPoster__*/

export async function item4BuildClipPostersLocally(env, recordId, { assetId = "" } = {}) {
  if (!env?.STUDIO_MEDIA) return { ok: false, posters: [] };
  const record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const assets = item4AssetManifest(record);
  const posters = [];
  for (const asset of assets) {
    if (!item4LooksLikeVideoAsset(asset)) continue;
    if (assetId && String(asset.id || "") !== String(assetId)) continue;
    if (item4LooksLikeImagePreviewUrl(asset?.poster_url)) continue;
    const driveId = String(asset.google_drive_file_id || "").trim();
    if (!driveId || !asset.id) continue;
    const grabbed = await item4FetchDriveThumbnailBytes(driveId, env);
    if (!grabbed) continue;
    const stored = await item4PutClipPoster(env, recordId, asset.id, grabbed.bytes, grabbed.contentType);
    await item4StampAssetPoster(env, recordId, asset.id, stored);
    posters.push({ source_asset_id: asset.id, poster_url: stored.url, poster_r2_key: stored.key });
  }
  return { ok: Boolean(posters.length), posters };
}
/*__STUDIO_WORKER_END:item4BuildClipPostersLocally__*/

export function item4PlayableMediaUrl(asset) {
  const urls = [
    asset?.preview_url,
    asset?.url,
    asset?.google_drive_url,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const publicHttp = urls.find((value) => /^https?:\/\//i.test(value) && !value.startsWith("/") && !item4LooksLikeImagePreviewUrl(value));
  return publicHttp || "";
}
/*__STUDIO_WORKER_END:item4PlayableMediaUrl__*/

export function item4VideoStreamPath(asset) {
  const recordId = String(asset?.media_asset_record_id || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(recordId)) return "";
  return `/api/media-assets/${recordId}/stream`;
}
/*__STUDIO_WORKER_END:item4VideoStreamPath__*/

export function item4VideoVariantReady(asset) {
  return Boolean(
    String(asset?.media_asset_record_id || "").trim().startsWith("rec")
    && String(asset?.google_drive_file_id || "").trim()
  );
}
/*__STUDIO_WORKER_END:item4VideoVariantReady__*/

export function item4IsNativeStillOutput(platform, outputType) {
  const types = ITEM4_NATIVE_STILL_OUTPUTS[String(platform || "").trim()] || [];
  return types.includes(String(outputType || "").trim());
}
/*__STUDIO_WORKER_END:item4IsNativeStillOutput__*/

export function item4NormalizedMimeType(file) {
  const mime = String(file?.type || "").toLowerCase();
  if (mime.startsWith("image/") || mime.startsWith("video/")) return mime;
  const ext = item4FileExtension(file?.name);
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return "application/octet-stream";
}

/*__STUDIO_WORKER_END:item4NormalizedMimeType__*/

export function item4AssetManifest(record) {
  const parsed = item4ParseJson(f(record, "Studio_Master_Assets_JSON"), []);
  return Array.isArray(parsed)
    ? parsed.filter((x) => x && x.id && (x.google_drive_file_id || x.r2_key || x.url))
    : [];
}
/*__STUDIO_WORKER_END:item4AssetManifest__*/

export function item4NormalizeSlideCaptions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const mode = String(row?.mode || row?.caption_mode || "ai").trim().toLowerCase();
    return {
      id: String(row?.id || "").trim(),
      mode: mode === "manual" || mode === "none" ? mode : "ai",
      text: String(row?.text || row?.caption || "").trim().slice(0, 2000),
    };
  }).filter((row) => row.id);
}
/*__STUDIO_WORKER_END:item4NormalizeSlideCaptions__*/

export function item4ApplySlideCaptions(assets, captions) {
  const byId = new Map(item4NormalizeSlideCaptions(captions).map((row) => [row.id, row]));
  if (!byId.size) return Array.isArray(assets) ? assets : [];
  return (Array.isArray(assets) ? assets : []).map((asset) => {
    const hit = byId.get(String(asset?.id || ""));
    if (!hit) return asset;
    if (hit.mode === "none") {
      return { ...asset, caption_mode: "none", caption: "" };
    }
    if (hit.mode === "manual") {
      return { ...asset, caption_mode: "manual", caption: hit.text };
    }
    return {
      ...asset,
      caption_mode: "ai",
      caption: hit.text || String(asset?.caption || "").trim(),
    };
  });
}
/*__STUDIO_WORKER_END:item4ApplySlideCaptions__*/

export function item4JoinedSlideCaptions(assets) {
  return (Array.isArray(assets) ? assets : [])
    .slice()
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
    .map((asset) => String(asset?.caption || "").trim())
    .filter(Boolean);
}
/*__STUDIO_WORKER_END:item4JoinedSlideCaptions__*/

export function item4RequestedCaptionIsSlideDump(caption, assets) {
  const manuals = item4JoinedSlideCaptions(assets);
  if (manuals.length < 2) return false;
  const text = String(caption || "").trim();
  return Boolean(text) && (text === manuals.join("\n\n") || text === manuals.join("\n"));
}
/*__STUDIO_WORKER_END:item4RequestedCaptionIsSlideDump__*/

export function item4IsLeftoverOverlayText(text) {
  return ITEM4_LEFTOVER_OVERLAYS.has(String(text || "").trim().toLowerCase());
}
/*__STUDIO_WORKER_END:item4IsLeftoverOverlayText__*/

export function item4OutputHasLeftoverOverlay(po) {
  const blobs = [f(po, "Selected_Assets_JSON"), f(po, "Render_Clip_List_JSON")];
  return blobs.some((raw) => {
    const text = String(raw || "").toLowerCase();
    return [...ITEM4_LEFTOVER_OVERLAYS].some((phrase) => text.includes(phrase));
  });
}
/*__STUDIO_WORKER_END:item4OutputHasLeftoverOverlay__*/

export function item4PreferredOverlayText(requestRecord, parentContentItem, sourceText) {
  const raw = String(sourceText || "").trim();
  if (raw && !item4IsLeftoverOverlayText(raw)) return raw;
  const caption = String(
    f(parentContentItem, "Caption")
    || f(requestRecord, "Requested_Caption")
    || ""
  ).trim();
  const first = caption.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
  const title = String(
    f(parentContentItem, "Content_Title")
    || f(requestRecord, "Requested_Title")
    || ""
  ).trim().replace(/[👇^\s]+$/g, "").trim();
  if (first && first.length <= 80 && !item4IsLeftoverOverlayText(first)) return first;
  if (title && title.length <= 80 && !item4IsLeftoverOverlayText(title)) return title;
  return "";
}
/*__STUDIO_WORKER_END:item4PreferredOverlayText__*/

export function item4UnletteredClipUrl(packageJson, index, clip) {
  const prep = packageJson && typeof packageJson === "object" ? (packageJson.render_prep || {}) : {};
  const list = item4ParseJson(prep.render_clip_list_json, []);
  const fromList = String(list?.[index]?.url || list?.[index]?.src || "").trim();
  if (fromList && !/\/lettered\//i.test(fromList)) return fromList;
  const compat = String(prep[`compatibility_clip_${index + 1}_url`] || "").trim();
  if (compat && !/\/lettered\//i.test(compat)) return compat;
  const current = String(clip?.url || clip?.src || "").trim();
  if (current && !/\/lettered\//i.test(current)) return current;
  return fromList || current;
}
/*__STUDIO_WORKER_END:item4UnletteredClipUrl__*/

export function item4FillAiOverlayFallbacks(assets, requestRecord, parentContentItem) {
  const rows = Array.isArray(assets) ? assets.slice() : [];
  const used = new Set(rows.map((asset) => String(asset?.caption || "").trim().toLowerCase()).filter(Boolean));
  const pool = [item4PreferredOverlayText(requestRecord, parentContentItem, "")].filter(Boolean);
  let cursor = 0;
  return rows.map((asset) => {
    const mode = String(asset?.caption_mode || "ai").trim().toLowerCase();
    const existing = String(asset?.caption || "").trim();
    if (mode !== "ai") return asset;
    if (existing && !item4IsLeftoverOverlayText(existing)) return asset;
    let text = "";
    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[(cursor + i) % pool.length];
      if (!used.has(candidate.toLowerCase())) {
        text = candidate;
        cursor = cursor + i + 1;
        break;
      }
    }
    if (!text) return existing && item4IsLeftoverOverlayText(existing) ? { ...asset, caption: "" } : asset;
    used.add(text.toLowerCase());
    return { ...asset, caption: text };
  });
}
/*__STUDIO_WORKER_END:item4FillAiOverlayFallbacks__*/

export function item4OverlayCaptionBySourceId(requestRecord) {
  const assets = item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), []);
  const map = new Map();
  for (const asset of Array.isArray(assets) ? assets : []) {
    const id = String(asset?.id || "").trim();
    const mode = String(asset?.caption_mode || "ai").trim().toLowerCase();
    const text = String(asset?.caption || "").trim();
    if (!id || mode === "none" || !text) continue;
    map.set(id, text);
  }
  return map;
}
/*__STUDIO_WORKER_END:item4OverlayCaptionBySourceId__*/

export async function studioRepairLeftoverNativeLettering(env, po, context) {
  const parsed = item4ParseJson(f(po, "Selected_Assets_JSON"), {});
  if (!parsed || typeof parsed !== "object") return po;
  const clips = Array.isArray(parsed.selected_clips)
    ? parsed.selected_clips
    : (Array.isArray(parsed.clips) ? parsed.clips : []);
  if (!clips.length) return po;
  const preferred = item4PreferredOverlayText(
    context?.requestRecord,
    context?.parent,
    String(f(po, "Output_Caption") || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || ""
  );
  let changed = false;
  const nextClips = clips.map((clip, index) => {
    const text = String(clip?.overlay?.text || clip?.caption || "").trim();
    if (!item4IsLeftoverOverlayText(text)) return clip;
    changed = true;
    const rawUrl = item4UnletteredClipUrl(parsed, index, clip);
    const overlay = item4PhotoOverlayFromCaption(preferred);
    return {
      ...clip,
      url: rawUrl || clip.url,
      src: rawUrl || clip.src,
      lettered: false,
      overlay: overlay || undefined,
      caption: overlay?.text || "",
    };
  });
  if (!changed) return po;
  const next = {
    ...parsed,
    selected_clips: Array.isArray(parsed.selected_clips) ? nextClips : parsed.selected_clips,
  };
  if (Array.isArray(parsed.clips)) next.clips = nextClips;
  if (next.render_prep && typeof next.render_prep === "object") {
    const first = String(nextClips[0]?.url || "").trim();
    if (first) next.render_prep.compatibility_clip_1_url = first;
  }
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, po.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: { Selected_Assets_JSON: JSON.stringify(next) },
      typecast: false,
    }),
  });
}
/*__STUDIO_WORKER_END:studioRepairLeftoverNativeLettering__*/

export function studioBurnedInOverlayPosition(aspectRatio = "9:16") {
  return String(aspectRatio || "").replace("x", ":") === "9:16" ? "lower-third" : "bottom";
}
/*__STUDIO_WORKER_END:studioBurnedInOverlayPosition__*/

export function phase6DefaultOverlayPosition(aspectRatio = "") {
  return String(aspectRatio || "").replace("x", ":") === "9:16" ? "lower-third" : "center";
}
/*__STUDIO_WORKER_END:phase6DefaultOverlayPosition__*/

export function studioSharedVerticalShortOutput(record) {
  const ratio = String(f(record, "Aspect_Ratio") || "").replace("x", ":");
  const outputType = String(f(record, "Studio_Output_Type") || f(record, "Output_Type") || "").trim();
  return ratio === "9:16" && STUDIO_SHARED_VERTICAL_SHORT_TYPES.has(outputType);
}
/*__STUDIO_WORKER_END:studioSharedVerticalShortOutput__*/

export async function studioSiblingVerticalShortOutputs(env, record) {
  const contentId = studioFirstLinkedId(f(record, "Content_Item"));
  if (!contentId) return studioSharedVerticalShortOutput(record) ? [record] : [];
  let rows = [];
  try {
    rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: 20,
      filterFormula: `AND({Test_Run_ID}=BLANK(),FIND("${String(contentId).replace(/"/g, '\\"')}", ARRAYJOIN({Content_Item})))`,
    });
  } catch (error) {
    console.warn("shared vertical short sibling lookup failed", record?.id, error);
    return studioSharedVerticalShortOutput(record) ? [record] : [];
  }
  return rows.filter(studioSharedVerticalShortOutput);
}
/*__STUDIO_WORKER_END:studioSiblingVerticalShortOutputs__*/

export function studioSharedAudioMixFieldNames() {
  return [
    "Voiceover_Volume",
    "Voiceover_Render_Volume",
    "Music_Volume",
    "Music_Ducked_Volume",
    "Music_Ducking_Enabled",
    "Music_Duck_Fade_Frames",
  ];
}
/*__STUDIO_WORKER_END:studioSharedAudioMixFieldNames__*/

export function studioPickSharedAudioMixFields(fields = {}) {
  const picked = {};
  for (const name of studioSharedAudioMixFieldNames()) {
    if (fields[name] !== undefined) picked[name] = fields[name];
  }
  return picked;
}
/*__STUDIO_WORKER_END:studioPickSharedAudioMixFields__*/

export function studioSharedRenderRerenderFields() {
  return {
    Render_Status: "Ready for Render",
    Output_Status: "In Production",
    Publish_Status: "Not Ready",
    Remotion_Job_ID: "",
    Remotion_Status_URL: "",
    Remotion_Props_JSON: "",
    Remotion_Error_Message: "",
    Final_File_URL: "",
    Final_File_ID: "",
    Output_URL: "",
    Final_File_Error_Message: "",
    Final_File_Storage_Status: "",
    Studio_Preview_URL: "",
    Studio_Preview_R2_Key: "",
    Studio_Preview_Updated_At: "",
  };
}
/*__STUDIO_WORKER_END:studioSharedRenderRerenderFields__*/

export async function studioPatchSiblingVerticalShortOutputs(env, sourceRecord, fields, options = {}) {
  const siblings = await studioSiblingVerticalShortOutputs(env, sourceRecord);
  if (siblings.length <= 1) return siblings;
  const sourceId = String(sourceRecord?.id || "").trim();
  const patch = { ...fields };
  await Promise.all(siblings.map(async (row) => {
    if (String(row?.id || "").trim() === sourceId) return row;
    try {
      return await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
        method: "PATCH",
        body: JSON.stringify({ fields: patch, typecast: options.typecast !== false }),
      });
    } catch (error) {
      console.warn("shared vertical short sibling patch failed", row.id, error);
      return row;
    }
  }));
  return siblings;
}
/*__STUDIO_WORKER_END:studioPatchSiblingVerticalShortOutputs__*/

export function item4PhotoOverlayFromCaption(text, { aspectRatio = "9:16" } = {}) {
  const overlayText = String(text || "").trim();
  if (!overlayText) return null;
  return {
    enabled: true,
    text: overlayText,
    role: "caption",
    position: studioBurnedInOverlayPosition(aspectRatio),
    size: 52,
    stylePreset: "Lower Third / Minimal",
    animation: "fade",
    startFraction: 0,
    endFraction: 1,
    backgroundOpacity: 0.4,
  };
}
/*__STUDIO_WORKER_END:item4PhotoOverlayFromCaption__*/

export function item4MasterTransferId(recordId, assetId) {
  return `ITEM4-MASTER-${recordId}-${assetId}`;
}
/*__STUDIO_WORKER_END:item4MasterTransferId__*/

export async function item4MasterQueueRows(env, recordId) {
  const rows = await item4VariantQueueRows(env, recordId);
  return rows.filter((row) => String(f(row, "Asset_Kind") || "").trim() === "Master Original");
}
/*__STUDIO_WORKER_END:item4MasterQueueRows__*/

export async function item4UpsertMasterQueue(env, recordId, assets) {
  const ownerRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const testRunId = String(f(ownerRecord, "Test_Run_ID") || "").trim();
  const driveFolderId = await item4PipelineSetting(env, "STUDIO_MASTER_DRIVE_FOLDER_ID");
  if (!driveFolderId) throw new HttpError(500, "STUDIO_MASTER_DRIVE_FOLDER_ID is not configured");

  const existingRows = await item4MasterQueueRows(env, recordId);
  const byTransferId = new Map(
    existingRows.map((row) => [String(f(row, "Transfer_ID") || "").trim(), row])
  );
  const expected = [];

  for (const asset of assets) {
    if (String(asset?.google_drive_file_id || "").trim() && String(asset?.media_asset_record_id || "").trim()) continue;
    const r2Key = String(asset?.r2_key || "").trim();
    if (!r2Key) throw new HttpError(409, `${asset?.name || "Master photo"} is missing its temporary staging object`);

    const transferId = item4MasterTransferId(recordId, asset.id);
    const current = byTransferId.get(transferId) || null;
    const currentStatus = current ? item4QueueStatus(current) : "";
    const currentPreviewStatus = current ? String(f(current, "Preview_Status") || "").trim() : "";
    const preserveStatus = ["Ready", "Drive Uploaded", "Processing"].includes(currentStatus);
    const fields = {
      Transfer_ID: transferId,
      Production_Request_Record_ID: recordId,
      Test_Run_ID: testRunId || null,
      Asset_Kind: "Master Original",
      Source_Asset_ID: String(asset.id),
      Source_Name: String(asset.name || "photo"),
      Source_R2_Key: r2Key,
      Source_URL: String(asset.url || ""),
      Source_MIME_Type: String(asset.mime_type || "application/octet-stream"),
      Source_Extension: String(asset.source_format || item4FileExtension(asset.name) || "").toLowerCase(),
      Source_Size_Bytes: Number(asset.size_bytes || 0) || null,
      Source_Order: Number(asset.order || 0) || null,
      Target_Drive_Folder_ID: driveFolderId,
      Target_File_Name: String(asset.name || item4SafeFileName(asset.name || "photo")),
      Staging_Delete_Ready: false,
    };
    if (!preserveStatus) {
      fields.Transfer_Status = currentStatus === "Failed" ? "Pending" : (currentStatus || "Pending");
      fields.Error_Message = null;
    }
    if (item4LooksLikeVideoAsset(asset) && item4LooksLikeImagePreviewUrl(asset?.poster_url || asset?.preview_url)) {
      fields.Preview_Status = "Ready";
      fields.Preview_URL = String(asset.poster_url || asset.preview_url || "").trim();
      fields.Preview_Error = null;
    } else if (item4LooksLikeVideoAsset(asset)) {
      if (currentPreviewStatus !== "Pending" && currentPreviewStatus !== "Ready") {
        fields.Preview_Status = "Pending";
        fields.Preview_Error = null;
        fields.Preview_R2_Key = null;
        fields.Preview_URL = null;
        fields.Preview_Ready_At = null;
      }
    } else if (!["Ready", "Pending"].includes(currentPreviewStatus)) {
      fields.Preview_Status = "Pending";
      fields.Preview_Error = null;
      fields.Preview_R2_Key = null;
      fields.Preview_URL = null;
      fields.Preview_Ready_At = null;
    }

    let row;
    if (current) {
      row = await airtableFetch(env, ITEM4_VARIANT_QUEUE_TABLE, current.id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
    } else {
      const body = await airtableFetch(env, ITEM4_VARIANT_QUEUE_TABLE, "", {
        method: "POST",
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      });
      row = Array.isArray(body?.records) ? body.records[0] : null;
    }
    expected.push({ transfer_id: transferId, asset_id: String(asset.id), queue_record_id: row?.id || current?.id || null });
  }
  return expected;
}
/*__STUDIO_WORKER_END:item4UpsertMasterQueue__*/

export async function item4FindMasterMediaAsset(env, transferId) {
  const rows = await listRecords(env, ITEM4_MEDIA_ASSET_TABLE, {
    limit: 2,
    filterFormula: `{Studio_Transfer_ID}='${String(transferId).replace(/'/g, "\\'")}'`,
  });
  return rows[0] || null;
}
/*__STUDIO_WORKER_END:item4FindMasterMediaAsset__*/

export async function item4CreateMasterMediaAsset(env, recordId, asset, driveId, driveUrl, transferId, requestRecord = null) {
  let profileId = String(asset?.content_profile_id || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(profileId)) {
    const owner = requestRecord || await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
    const profile = await item4ProductionProfileRecord(env, owner);
    profileId = String(profile?.id || "").trim();
  }
  const assetName = String(asset?.library_asset_name || asset?.name || "photo").trim() || "photo";
  const body = await airtableFetch(env, ITEM4_MEDIA_ASSET_TABLE, "", {
    method: "POST",
    body: JSON.stringify({
      records: [{
        fields: {
          "Asset Name": assetName,
          Media_Class: item4LooksLikeVideoAsset(asset) ? "Video" : "Image",
          "Google Drive URL": driveUrl,
          "Google Drive File ID": driveId,
          MIME_Type: String(asset.mime_type || "application/octet-stream"),
          File_Extension: String(asset.source_format || item4FileExtension(asset.name) || "").toLowerCase(),
          File_Size_Bytes: Number(asset.size_bytes || 0) || null,
          Intake_Status: "Created",
          Intake_Date: new Date().toISOString(),
          Drive_Access_Status: "Private",
          Asset_Status: "Available",
          Active: true,
          Do_Not_Use: false,
          Capture_Source: "Self Filmed",
          Rights_Status: "Owned",
          Orientation: Number(asset.height || 0) >= Number(asset.width || 0) ? "Portrait" : "Landscape",
          Asset_Role: "Other",
          Raw_Source_Eligibility: "Not Applicable",
          Asset_Description: "Studio Item 4 authoritative master original preserved in Google Drive.",
          Studio_Transfer_ID: transferId,
          ...(profileId ? { Content_Profile: [profileId] } : {}),
        },
      }],
      typecast: true,
    }),
  });
  return Array.isArray(body?.records) ? body.records[0] : null;
}
/*__STUDIO_WORKER_END:item4CreateMasterMediaAsset__*/

export async function item4EnsureMediaAssetContentProfile(env, mediaAssetId, profileId) {
  const assetId = String(mediaAssetId || "").trim();
  const wanted = String(profileId || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(assetId) || !/^rec[A-Za-z0-9]+$/.test(wanted)) return null;
  try {
    const existing = await airtableFetch(env, ITEM4_MEDIA_ASSET_TABLE, assetId);
    const current = studioFirstLinkedId(f(existing, "Content_Profile"));
    if (current) return existing;
    return await airtableFetch(env, ITEM4_MEDIA_ASSET_TABLE, assetId, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Content_Profile: [wanted] }, typecast: true }),
    });
  } catch (error) {
    console.warn("Item 4 media-asset profile backfill failed", assetId, error?.message || error);
    return null;
  }
}

/*__STUDIO_WORKER_END:item4EnsureMediaAssetContentProfile__*/

export async function item4SanitizeStudioImageMediaAsset(env, mediaAssetId) {
  if (!mediaAssetId || !/^rec[A-Za-z0-9]+$/.test(String(mediaAssetId))) return null;
  try {
    const existing = await airtableFetch(env, ITEM4_MEDIA_ASSET_TABLE, mediaAssetId);
    const transferId = String(f(existing, "Studio_Transfer_ID") || "").trim();
    if (!transferId.startsWith("ITEM4-")) return existing;

    const fields = {};
    const legacyRequests = arrayOrEmpty(f(existing, "Production Requests"));
    const legacyOutputs = arrayOrEmpty(f(existing, "Production Request Outputs"));
    if (legacyRequests.length) fields["Production Requests"] = [];
    if (legacyOutputs.length) fields["Production Request Outputs"] = [];

    if (!Object.keys(fields).length) return existing;

    return await airtableFetch(env, ITEM4_MEDIA_ASSET_TABLE, mediaAssetId, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: false }),
    });
  } catch (error) {
    console.warn("Item 4 media-link sanitizer failed", mediaAssetId, error?.message || error);
    return null;
  }
}
/*__STUDIO_WORKER_END:item4SanitizeStudioImageMediaAsset__*/

export async function item4ReconcileMasterAuthority(env, recordId, record = null) {
  let currentRecord = record || await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const assets = item4AssetManifest(currentRecord).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  if (!assets.length) return { record: currentRecord, assets, status: "None", ready_count: 0, target_count: 0 };
  if (item4FinishedVideoMastersReady(currentRecord, assets)) {
    if (String(f(currentRecord, "Studio_Master_Asset_Status") || "").trim() !== "Ready") {
      currentRecord = await item4UpdateRequestState(env, recordId, {
        Studio_Master_Asset_Status: "Ready",
        Studio_Variant_Status: "None",
        Studio_Item4_State: "Assets Ready",
      });
    }
    return { record: currentRecord, assets, status: "Ready", ready_count: assets.length, target_count: assets.length, error: null };
  }

  const rows = await item4MasterQueueRows(env, recordId);
  const byTransferId = new Map(rows.map((row) => [String(f(row, "Transfer_ID") || "").trim(), row]));
  const nextAssets = [];
  const mediaAssetIds = [];
  let readyCount = 0;
  const failedErrorsByAsset = new Map();

  for (const rawAsset of assets) {
    let asset = rawAsset;
    const transferId = item4MasterTransferId(recordId, asset.id);
    const q = byTransferId.get(transferId) || null;
    let driveId = String(asset?.google_drive_file_id || "").trim();
    let sourceDriveId = String(asset?.source_google_drive_file_id || "").trim();
    let driveUrl = String(asset?.google_drive_url || "").trim();
    let mediaAssetId = String(asset?.media_asset_record_id || "").trim();
    let previewUrl = String(asset?.preview_url || "").trim();
    let posterUrl = String(asset?.poster_url || "").trim();
    let posterKey = String(asset?.poster_r2_key || "").trim();
    if (q) {
      sourceDriveId = sourceDriveId || String(f(q, "Source_Drive_File_ID") || "").trim();
      const queuedPreview = String(f(q, "Preview_URL") || "").trim();
      if (item4LooksLikeVideoAsset(asset)) {
        if (item4LooksLikeImagePreviewUrl(queuedPreview)) posterUrl = posterUrl || queuedPreview;
      } else {
        previewUrl = queuedPreview || previewUrl;
      }
    }
    if (item4LooksLikeVideoAsset(asset) && item4LooksLikeImagePreviewUrl(previewUrl)) {
      posterUrl = posterUrl || previewUrl;
      previewUrl = "";
    }

    if (q && item4QueueStatus(q) === "Failed") {
      failedErrorsByAsset.set(
        String(asset?.id || ""),
        String(f(q, "Error_Message") || `${asset.name || "Master photo"} failed Google Drive authority handoff`)
      );
    }

    if (q && ["Drive Uploaded", "Ready"].includes(item4QueueStatus(q))) {
      driveId = driveId || item4QueueDriveFileId(q) || "";
      driveUrl = driveUrl || String(f(q, "Drive_URL") || "").trim();
      if (driveId && !driveUrl) driveUrl = `https://drive.google.com/file/d/${driveId}/view`;

      if (driveId && !mediaAssetId) {
        let mediaAsset = await item4FindMasterMediaAsset(env, transferId);
        if (!mediaAsset) {
          mediaAsset = await item4CreateMasterMediaAsset(env, recordId, asset, driveId, driveUrl, transferId, currentRecord);
        }
        mediaAssetId = mediaAsset?.id || "";
      }

      // AI masters often get a Drive/Media Asset row from SMV1 before profile was
      // resolved. Backfill blank Content_Profile from the manifest stamp or Idea.
      if (mediaAssetId) {
        let profileId = String(asset?.content_profile_id || "").trim();
        if (!/^rec[A-Za-z0-9]+$/.test(profileId)) {
          const profile = await item4ProductionProfileRecord(env, currentRecord).catch(() => null);
          profileId = String(profile?.id || "").trim();
        }
        if (profileId) {
          await item4EnsureMediaAssetContentProfile(env, mediaAssetId, profileId);
          if (!String(asset?.content_profile_id || "").trim()) {
            asset = { ...asset, content_profile_id: profileId };
          }
        }
      }

      if (driveId && mediaAssetId) {
        const stagingKey = String(asset?.r2_key || f(q, "Source_R2_Key") || "").trim();
        const keepStagingForCompress = item4AssetCompressionPending(asset);
        if (stagingKey && env.STUDIO_MEDIA && !keepStagingForCompress) {
          try { await env.STUDIO_MEDIA.delete(stagingKey); } catch {}
        }
        if (q && item4QueueStatus(q) !== "Ready") {
          await airtableFetch(env, ITEM4_VARIANT_QUEUE_TABLE, q.id, {
            method: "PATCH",
            body: JSON.stringify({
              fields: {
                Transfer_Status: "Ready",
                Drive_File_ID: driveId,
                Drive_URL: driveUrl,
                Media_Asset_Record_ID: mediaAssetId,
                Generated_Media_Asset: [mediaAssetId],
                Staging_Delete_Ready: false,
                Completed_At: new Date().toISOString(),
                Error_Message: null,
              },
              typecast: true,
            }),
          });
        }
      }
    }

    const authoritative = Boolean(driveId && mediaAssetId);
    if (authoritative) {
      await item4SanitizeStudioImageMediaAsset(env, mediaAssetId);
      readyCount += 1;
      mediaAssetIds.push(mediaAssetId);
    }
    if (item4LooksLikeVideoAsset(asset) && driveId && !item4LooksLikeImagePreviewUrl(posterUrl) && q) {
      const previewStatus = String(f(q, "Preview_Status") || "").trim();
      if (previewStatus !== "Pending" && previewStatus !== "Processing") {
        try {
          await airtableFetch(env, ITEM4_VARIANT_QUEUE_TABLE, q.id, {
            method: "PATCH",
            body: JSON.stringify({
              fields: {
                Preview_Status: "Pending",
                Preview_Error: null,
                Preview_URL: null,
                Preview_R2_Key: null,
                Preview_Ready_At: null,
              },
              typecast: true,
            }),
          });
        } catch (error) {
          console.warn("Item 4 clip poster preview requeue failed", error);
        }
      }
    }
    nextAssets.push({
      ...asset,
      google_drive_file_id: driveId || null,
      source_google_drive_file_id: sourceDriveId || null,
      google_drive_url: driveUrl || null,
      media_asset_record_id: mediaAssetId || null,
      preview_url: previewUrl || null,
      poster_url: posterUrl || null,
      poster_r2_key: posterKey || null,
      authoritative_storage: authoritative ? "google_drive" : (asset.authoritative_storage || null),
      staging_deleted: authoritative && !item4AssetCompressionPending(asset) ? true : Boolean(asset.staging_deleted),
      r2_key: authoritative && !item4AssetCompressionPending(asset) ? null : (asset.r2_key || f(q, "Source_R2_Key") || null),
      url: authoritative ? (driveUrl || null) : (asset.url || null),
    });
  }

  // Re-read the operator's current manifest before committing reconciliation.
  // Drive preservation runs in the background; without this guard, a stale
  // reconcile that started before DELETE can write a removed image back into
  // Production moments after the operator deletes it.
  const latestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const latestAssets = item4AssetManifest(latestRecord)
    .slice()
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const processedById = new Map(nextAssets.map((asset) => [String(asset?.id || ""), asset]));
  const reconciledAssets = latestAssets.map((asset, index) => {
    const processed = processedById.get(String(asset?.id || ""));
    return { ...(processed || asset), order: index + 1 };
  });
  const reconciledMediaAssetIds = [...new Set(
    reconciledAssets.map((asset) => String(asset?.media_asset_record_id || "").trim()).filter(Boolean)
  )];
  const reconciledReadyCount = reconciledAssets.filter((asset) =>
    String(asset?.google_drive_file_id || "").trim() && String(asset?.media_asset_record_id || "").trim()
  ).length;
  const failedError = reconciledAssets
    .map((asset) => failedErrorsByAsset.get(String(asset?.id || "")) || "")
    .find(Boolean) || null;
  const status = !reconciledAssets.length
    ? "None"
    : failedError
      ? "Error"
      : reconciledReadyCount === reconciledAssets.length
        ? "Ready"
        : "Uploading";
  currentRecord = latestRecord;
  if (JSON.stringify(reconciledAssets) !== JSON.stringify(latestAssets)
    || String(f(latestRecord, "Studio_Master_Asset_Status") || "") !== status) {
    currentRecord = await item4UpdateRequestState(env, recordId, {
    Studio_Master_Assets_JSON: JSON.stringify(reconciledAssets),
    Studio_Master_Asset_Count: reconciledAssets.length,
    Studio_Master_Asset_Status: status,
    Studio_Master_Media_Assets: reconciledMediaAssetIds,
    Studio_Item4_State: failedError
      ? "Error"
      : reconciledAssets.length && reconciledReadyCount === reconciledAssets.length
        ? "Assets Ready"
        : "Draft",
  });
  }
  return {
    record: currentRecord,
    assets: reconciledAssets,
    status,
    ready_count: reconciledReadyCount,
    target_count: reconciledAssets.length,
    error: failedError,
  };
}
/*__STUDIO_WORKER_END:item4ReconcileMasterAuthority__*/

export async function item4UpdateRequestState(env, recordId, fields) {
  return airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId, {
    method: "PATCH",
    body: JSON.stringify({ fields: { ...fields, Updated_At: new Date().toISOString() }, typecast: false }),
  });
}
/*__STUDIO_WORKER_END:item4UpdateRequestState__*/

export async function getItem4MasterAssets(request, env, url, authorization) {
  const recordId = item4RequestIdFromPath(url);
  try { await item4EnsureP3SingleParentRoute(env); } catch (error) { console.warn("P3 single-parent hardening deferred", error); }
  try { await item4EnsureP3StudioSourceAuthority(env); } catch (error) { console.warn("P3 Studio exact-source hardening deferred", error); }
  try { await item4EnsureR2StudioExactSourceGuard(env); } catch (error) { console.warn("R2 Studio exact-source guard hardening deferred", error); }
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  let assets = item4AssetManifest(record).sort((a,b) => Number(a.order||0)-Number(b.order||0));
  const currentStatus = String(f(record, "Studio_Master_Asset_Status") || "").trim();

  // Polling this endpoint is also the resumable authority path. Reconciliation
  // only consumes Drive checkpoints SMV1 already wrote. If cadence is parked,
  // a Pending master stays Pending forever unless this GET resumes the drain
  // the same way the Item 4 workspace poller does.
  if (assets.length && currentStatus !== "Ready") {
    try {
      const reconciled = await item4ReconcileMasterAuthority(env, recordId, record);
      record = reconciled.record;
      assets = reconciled.assets.sort((a,b) => Number(a.order||0)-Number(b.order||0));
      if (String(f(record, "Studio_Master_Asset_Status") || reconciled.status || "") === "Uploading") {
        const resumed = await item4ResumePendingMasterAuthority(env, recordId, record);
        record = resumed.record || record;
        assets = (resumed.assets || assets).slice().sort((a,b) => Number(a.order||0)-Number(b.order||0));
      }
    } catch (error) {
      console.warn("Item 4 master authority poll reconciliation failed", error);
    }
  }

  return respond(request, env, {
    ok: String(f(record, "Studio_Master_Asset_Status") || "") !== "Error",
    production_request_id: recordId,
    status: f(record, "Studio_Master_Asset_Status") || (assets.length ? "Uploading" : "None"),
    count: assets.length,
    authoritative_count: assets.filter((asset) => Boolean(asset?.google_drive_file_id && asset?.media_asset_record_id)).length,
    assets,
  });
}
/*__STUDIO_WORKER_END:getItem4MasterAssets__*/

export function item4LargeUploadSessionIdFromPath(url) {
  const match = String(url?.pathname || "").match(/\/assets\/upload-session\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : "";
}
/*__STUDIO_WORKER_END:item4LargeUploadSessionIdFromPath__*/

export function item4LargeUploadPartNumberFromPath(url) {
  const match = String(url?.pathname || "").match(/\/parts\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}
/*__STUDIO_WORKER_END:item4LargeUploadPartNumberFromPath__*/

export function item4FindLargeUploadDraft(assets, assetId) {
  const id = String(assetId || "").trim();
  return (Array.isArray(assets) ? assets : []).find((row) => (
    String(row?.id || "") === id
    && String(row?.upload_status || "") === "multipart_pending"
    && String(row?.multipart_upload_id || "").trim()
    && String(row?.r2_key || "").trim()
  )) || null;
}
/*__STUDIO_WORKER_END:item4FindLargeUploadDraft__*/

export async function createItem4LargeVideoUploadSession(request, env, url, authorization) {
  if (!env.STUDIO_MEDIA) throw new HttpError(503, "Studio media storage is not configured");
  if (typeof env.STUDIO_MEDIA.createMultipartUpload !== "function") {
    throw new HttpError(503, "Large video staging is not available on this Worker yet");
  }
  const recordId = item4RequestIdFromPath(url);
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);
  const body = await readJsonBody(request);
  const filename = item4SafeFileName(body?.filename || body?.name || "finished-video.mp4");
  const sizeBytes = Number(body?.size_bytes || body?.size || 0);
  const mimeType = String(body?.mime_type || body?.content_type || "video/mp4").trim() || "video/mp4";
  const originKind = String(body?.origin_kind || "finished-video").trim().toLowerCase();
  const vibeCut = originKind === "vibe-cut";
  if (!sizeBytes || sizeBytes < 1) throw new HttpError(400, "size_bytes is required");
  if (sizeBytes > ITEM4_FINISHED_VIDEO_HARD_MAX_BYTES) {
    throw new HttpError(413, "Finished videos must be 1.5 GB or smaller. Compress longer masters before uploading.");
  }
  if (!(mimeType.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(filename))) {
    throw new HttpError(415, "Large upload sessions are only for finished videos");
  }
  const existing = item4AssetManifest(record);
  if (existing.some(item4LooksLikeVideoAsset)) {
    throw new HttpError(409, "This piece already has a video. Remove it first to replace it.");
  }
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
  const key = `studio/master-assets/${recordId}/${id}-${filename}`;
  const multipart = await env.STUDIO_MEDIA.createMultipartUpload(key, {
    httpMetadata: { contentType: mimeType },
    customMetadata: {
      productionRequestId: recordId,
      originalName: filename,
      assetId: id,
      role: vibeCut ? "vibe-cut-source" : "large-finished-video",
    },
  });
  const draft = {
    id,
    order: existing.length + 1,
    name: filename,
    mime_type: mimeType,
    media_kind: "video",
    size_bytes: sizeBytes,
    r2_key: key,
    url: "",
    upload_status: "multipart_pending",
    multipart_upload_id: String(multipart.uploadId || ""),
    origin_kind: originKind || "finished-video",
    uploaded_at: null,
  };
  if (!draft.multipart_upload_id) throw new HttpError(502, "Could not start staged upload");
  const notes = String(f(record, "Production_Notes") || "").trim();
  const stamped = vibeCut ? notes : studioRewriteFinishedOriginNotes(notes, "finished-video");
  const fields = {
    Studio_Master_Assets_JSON: JSON.stringify([...existing, draft]),
    Studio_Master_Asset_Count: existing.length + 1,
    Studio_Master_Asset_Status: "Uploading",
    Studio_Item4_State: "Draft",
  };
  if (stamped !== notes) fields.Production_Notes = stamped;
  record = await item4UpdateRequestState(env, recordId, fields);
  const partSize = ITEM4_LARGE_UPLOAD_PART_BYTES;
  return respond(request, env, {
    ok: true,
    asset_id: id,
    r2_key: key,
    upload_id: draft.multipart_upload_id,
    part_size: partSize,
    parts_expected: Math.max(1, Math.ceil(sizeBytes / partSize)),
    max_bytes: ITEM4_FINISHED_VIDEO_HARD_MAX_BYTES,
    record: mapProductionRequest(record),
    message: "Upload session ready. Send the file in parts — Studio will compress after it lands.",
  }, 201);
}
/*__STUDIO_WORKER_END:createItem4LargeVideoUploadSession__*/

export async function uploadItem4LargeVideoPart(request, env, url, authorization) {
  if (!env.STUDIO_MEDIA) throw new HttpError(503, "Studio media storage is not configured");
  const recordId = item4RequestIdFromPath(url);
  const assetId = item4LargeUploadSessionIdFromPath(url);
  const partNumber = item4LargeUploadPartNumberFromPath(url);
  if (!assetId || !Number.isFinite(partNumber) || partNumber < 1) {
    throw new HttpError(400, "Invalid upload part route");
  }
  const record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);
  const draft = item4FindLargeUploadDraft(item4AssetManifest(record), assetId);
  if (!draft) throw new HttpError(404, "Upload session not found");
  if (!request.body) throw new HttpError(400, "Missing part body");
  const multipart = env.STUDIO_MEDIA.resumeMultipartUpload(draft.r2_key, draft.multipart_upload_id);
  const uploaded = await multipart.uploadPart(partNumber, request.body);
  return respond(request, env, {
    ok: true,
    asset_id: assetId,
    part_number: partNumber,
    etag: String(uploaded?.etag || ""),
  });
}
/*__STUDIO_WORKER_END:uploadItem4LargeVideoPart__*/

export async function completeItem4LargeVideoUploadSession(request, env, url, authorization, ctx) {
  if (!env.STUDIO_MEDIA) throw new HttpError(503, "Studio media storage is not configured");
  const recordId = item4RequestIdFromPath(url);
  const assetId = item4LargeUploadSessionIdFromPath(url);
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);
  const body = await readJsonBody(request);
  const parts = Array.isArray(body?.parts) ? body.parts : [];
  if (!parts.length) throw new HttpError(400, "parts are required");
  const assets = item4AssetManifest(record);
  const draft = item4FindLargeUploadDraft(assets, assetId);
  if (!draft) throw new HttpError(404, "Upload session not found");
  const multipart = env.STUDIO_MEDIA.resumeMultipartUpload(draft.r2_key, draft.multipart_upload_id);
  const normalizedParts = parts
    .map((row) => ({
      partNumber: Number(row?.partNumber || row?.part_number || 0),
      etag: String(row?.etag || "").trim(),
    }))
    .filter((row) => row.partNumber > 0 && row.etag)
    .sort((a, b) => a.partNumber - b.partNumber);
  if (!normalizedParts.length) throw new HttpError(400, "No valid upload parts were provided");
  await multipart.complete(normalizedParts);
  const object = await env.STUDIO_MEDIA.head(draft.r2_key).catch(() => null);
  const sizeBytes = Number(object?.size || draft.size_bytes || 0);
  const durationSeconds = Number(body?.duration_seconds || body?.durationSeconds || 0);
  const width = Number(body?.width || 0) || null;
  const height = Number(body?.height || 0) || null;
  const needsCompress = sizeBytes > ITEM4_COMPRESS_THRESHOLD_BYTES;
  const finalized = {
    id: draft.id,
    order: draft.order || 1,
    name: draft.name,
    mime_type: draft.mime_type || "video/mp4",
    media_kind: "video",
    duration_seconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    in_seconds: 0,
    out_seconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    size_bytes: sizeBytes,
    width,
    height,
    source_ratio: width && height ? `${width}:${height}` : null,
    focal_point: "center",
    r2_key: draft.r2_key,
    origin_kind: draft.origin_kind || "finished-video",
    url: needsCompress ? "" : `${ITEM4_MEDIA_PUBLIC_BASE}/${draft.r2_key}`,
    uploaded_at: new Date().toISOString(),
    upload_status: "complete",
  };
  if (needsCompress) {
    finalized.compression_needed = true;
    finalized.compression_status = "pending";
    finalized.original_size_bytes = sizeBytes;
  } else {
    const previewKey = item4FinishedVideoPreviewKey(recordId, draft.id);
    const source = await env.STUDIO_MEDIA.get(draft.r2_key);
    if (!source?.body) throw new HttpError(502, "Staged video missing after upload completed");
    const staged = await studioPutPublicObjectViaUploadWorker(env, {
      key: previewKey,
      body: source.body,
      contentType: finalized.mime_type,
      contentLength: sizeBytes,
      outputId: recordId,
    });
    if (!staged.url) throw new HttpError(502, "Finished video could not be copied to the public preview host");
    finalized.preview_r2_key = previewKey;
    finalized.preview_public_url = staged.url;
    finalized.url = staged.url;
    finalized.compression_status = "skipped";
  }
  const nextAssets = assets.map((row) => (String(row?.id || "") === String(draft.id) ? finalized : row));
  record = await item4UpdateRequestState(env, recordId, {
    Studio_Master_Assets_JSON: JSON.stringify(nextAssets),
    Studio_Master_Asset_Count: nextAssets.length,
    Studio_Master_Asset_Status: needsCompress ? "Uploading" : "Ready",
    Studio_Output_Plan_Status: "Needs Plan",
    Studio_Output_Plan_JSON: null,
    Studio_Variant_Manifest_JSON: null,
    Studio_Variant_Status: "None",
    Studio_Variant_Updated_At: null,
    Studio_Variant_Error: null,
    Studio_Item4_State: needsCompress ? "Draft" : "Assets Ready",
  });
  if (needsCompress && ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(item4PulseStudioCompressJob(env, recordId).catch((error) => {
      console.warn("Item 4 studio-compress pulse deferred after large upload", error);
    }));
  }
  if (studioIsAzFinishedVideo(record) && ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(advanceAzFinishedVideo(env, recordId, authorization, ctx).catch((error) => {
      console.warn("AZ finished-video advance deferred after large upload", recordId, error);
    }));
  }
  return respond(request, env, {
    ok: true,
    uploaded: 1,
    authority_status: needsCompress ? "Uploading" : "Ready",
    authority_progress: { ready: needsCompress ? 0 : nextAssets.length, target: nextAssets.length },
    assets: nextAssets,
    execution_ids: [],
    record: mapProductionRequest(record),
    compression_pending: needsCompress,
    message: needsCompress
      ? "Video is staged. Studio is compressing it automatically — you can close this tab."
      : "Finished video is stored. Studio will thumbnail, schedule, and queue the platforms.",
  }, 201);
}
/*__STUDIO_WORKER_END:completeItem4LargeVideoUploadSession__*/

export async function abortItem4LargeVideoUploadSession(request, env, url, authorization) {
  if (!env.STUDIO_MEDIA) throw new HttpError(503, "Studio media storage is not configured");
  const recordId = item4RequestIdFromPath(url);
  const assetId = item4LargeUploadSessionIdFromPath(url);
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);
  const assets = item4AssetManifest(record);
  const draft = item4FindLargeUploadDraft(assets, assetId);
  if (!draft) {
    return respond(request, env, { ok: true, aborted: false, message: "Upload session already gone." });
  }
  try {
    const multipart = env.STUDIO_MEDIA.resumeMultipartUpload(draft.r2_key, draft.multipart_upload_id);
    await multipart.abort();
  } catch (error) {
    console.warn("Large video multipart abort failed", draft.r2_key, error);
  }
  try { await env.STUDIO_MEDIA.delete(draft.r2_key); } catch {}
  const nextAssets = assets.filter((row) => String(row?.id || "") !== String(draft.id));
  record = await item4UpdateRequestState(env, recordId, {
    Studio_Master_Assets_JSON: JSON.stringify(nextAssets),
    Studio_Master_Asset_Count: nextAssets.length,
    Studio_Master_Asset_Status: nextAssets.length ? "Uploading" : "None",
  });
  return respond(request, env, {
    ok: true,
    aborted: true,
    record: mapProductionRequest(record),
  });
}
/*__STUDIO_WORKER_END:abortItem4LargeVideoUploadSession__*/

export async function uploadItem4MasterAssets(request, env, url, authorization, ctx) {
  if (!env.STUDIO_MEDIA) throw new HttpError(503, "Studio media storage is not configured");
  const recordId = item4RequestIdFromPath(url);
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);

  let form;
  try { form = await request.formData(); } catch { throw new HttpError(400, "Could not read uploaded media"); }
  const files = form.getAll("files").filter(value => value && typeof value.arrayBuffer === "function");
  if (!files.length) throw new HttpError(400, "Choose at least one file");
  if (files.length > ITEM4_MAX_FILES_PER_UPLOAD_REQUEST) {
    throw new HttpError(400, `Send no more than ${ITEM4_MAX_FILES_PER_UPLOAD_REQUEST} files in one upload request`);
  }

  const existing = item4AssetManifest(record);
  const meta = item4ParseJson(form.get("metadata"), []);
  const metadata = Array.isArray(meta) ? meta : [];
  const requestedKind = String(form.get("origin_kind") || "").trim().toLowerCase();
  const videoFiles = files.filter((file) => item4IsSupportedVideoFile(file));
  const photoFiles = files.filter((file) => item4IsSupportedImageFile(file) && !item4IsSupportedVideoFile(file));
  const existingVideos = existing.filter(item4LooksLikeVideoAsset).length + videoFiles.length;
  const existingPhotos = existing.filter((asset) => !item4LooksLikeVideoAsset(asset)).length + photoFiles.length;
  const notesText = [
    f(record, "Production_Notes"),
    f(record, "Output_Notes"),
    f(record, "Internal_Notes"),
    f(record, "Production_Request_Notes"),
  ].map((value) => String(value || "")).join("\n");
  const clipOrigin = item4IsClipInputKind(requestedKind)
    || item4IsClipInputKind(item4ParseEzOrigin(record).inputKind)
    || /ez-input=photos-and-clips|ez-input=video-clips|ez-clips=\d+/i.test(notesText)
    || existingVideos > 1
    || (videoFiles.length > 0 && existing.filter((asset) => !item4LooksLikeVideoAsset(asset)).length > 0)
    || (existingVideos > 0 && existingPhotos > 0);
  const finishedKind = !clipOrigin && (
    studioNormalizeFinishedOriginKind(requestedKind)
    || studioFinishedOriginKind(record)
  );
  const finishedVideo = finishedKind === "finished-video";
  const mixedClips = clipOrigin && !finishedVideo;
  let total = 0;
  for (const file of files) {
    total += Number(file.size || 0);
    const isVideo = item4IsSupportedVideoFile(file);
    const isImage = item4IsSupportedImageFile(file);
    const allowed = finishedVideo || mixedClips
      ? (isVideo || isImage)
      : isImage;
    if (!allowed) {
      throw new HttpError(415, finishedVideo
        ? `${file.name || "A file"} is not a supported video or cover image.`
        : mixedClips
          ? `${file.name || "A file"} is not a supported photo or video clip.`
          : `${file.name || "A file"} is not a supported photo. HEIC and HEIF are supported.`);
    }
    const limit = isVideo ? ITEM4_MAX_CLIP_FILE_BYTES : ITEM4_MAX_FILE_BYTES;
    if (Number(file.size || 0) > limit) {
      throw new HttpError(413, isVideo
        ? `${file.name || "A file"} exceeds the 200 MB clip limit`
        : `${file.name || "An image"} exceeds the 25 MB per-image limit`);
    }
  }
  if (finishedVideo && total > ITEM4_MAX_CLIP_FILE_BYTES) {
    throw new HttpError(
      413,
      "This finished video exceeds the 200 MB direct-upload limit. Studio will stage larger files in parts automatically from the browser — refresh and try again, or compress first."
    );
  }
  if (!finishedVideo && mixedClips && total > ITEM4_MAX_MIXED_TOTAL_BYTES) throw new HttpError(413, "The selected photos and clips exceed the upload limit");
  if (!finishedVideo && !mixedClips && total > ITEM4_MAX_TOTAL_BYTES) throw new HttpError(413, "The selected images exceed the 150 MB upload limit");

  const originNotes = String(f(record, "Production_Notes") || "").trim();
  const originStamp = mixedClips
    ? studioRewriteClipOriginNotes(originNotes, requestedKind || "photos-and-clips")
    : (finishedKind ? studioRewriteFinishedOriginNotes(originNotes, finishedKind) : originNotes);
  if (originStamp !== originNotes) {
    record = await item4UpdateRequestState(env, recordId, { Production_Notes: originStamp });
  }
  const existingReady = existing.filter((asset) => String(asset?.google_drive_file_id || "").trim() && String(asset?.media_asset_record_id || "").trim());
  const posters = form.getAll("posters");
  const uploaded = [];
  let authorityQueueStarted = false;
  try {
    for (let i=0; i<files.length; i++) {
      const file = files[i];
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
      const safeName = item4SafeFileName(file.name);
      const key = `studio/master-assets/${recordId}/${id}-${safeName}`;
      const mime = item4NormalizedMimeType(file);
      const body = finishedVideo || typeof file.stream !== "function"
        ? await file.arrayBuffer()
        : file.stream();
      await env.STUDIO_MEDIA.put(key, body, {
        httpMetadata: { contentType: mime },
        customMetadata: { productionRequestId: recordId, originalName: String(file.name || safeName), assetId: id },
      });
      const m = metadata[i] || {};
      const width = Number(m.width || 0) || null;
      const height = Number(m.height || 0) || null;
      const isVideo = item4IsSupportedVideoFile(file);
      const durationSeconds = Number(m.duration_seconds || m.durationSeconds || 0);
      const row = {
        id,
        order: existing.length + i + 1,
        name: String(file.name || safeName),
        mime_type: item4NormalizedMimeType(file),
        media_kind: isVideo ? "video" : "photo",
        duration_seconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
        in_seconds: 0,
        out_seconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
        source_format: item4IsHeicFile(file) ? item4FileExtension(file.name).toUpperCase() : (item4FileExtension(file.name).toUpperCase() || null),
        browser_preview_compatible: !item4IsHeicFile(file),
        size_bytes: Number(file.size || 0),
        width,
        height,
        source_ratio: width && height ? `${width}:${height}` : null,
        focal_point: "center",
        r2_key: key,
        url: `${ITEM4_MEDIA_PUBLIC_BASE}/${key}`,
        uploaded_at: new Date().toISOString(),
      };
      if (finishedVideo && isVideo) {
        const needsCompress = Number(file.size || 0) > ITEM4_COMPRESS_THRESHOLD_BYTES;
        if (needsCompress) {
          row.compression_needed = true;
          row.compression_status = "pending";
          row.original_size_bytes = Number(file.size || 0);
          row.url = "";
        } else {
          const previewKey = item4FinishedVideoPreviewKey(recordId, id);
          const staged = await studioPutPublicObjectViaUploadWorker(env, {
            key: previewKey,
            body,
            contentType: mime,
            contentLength: Number(file.size || (body && body.byteLength) || 0),
            outputId: recordId,
          });
          if (!staged.url) {
            throw new HttpError(502, "Finished video could not be copied to the public preview host. Preview needs studio/previews/, not studio/master-assets.");
          }
          row.preview_r2_key = previewKey;
          row.preview_public_url = staged.url;
          row.url = staged.url;
          row.compression_status = "skipped";
        }
      } else if (isVideo && Number(file.size || 0) > ITEM4_COMPRESS_THRESHOLD_BYTES) {
        row.compression_needed = true;
        row.compression_status = "pending";
        row.original_size_bytes = Number(file.size || 0);
        row.url = "";
      }
      const poster = posters[i];
      if (isVideo && poster && typeof poster.arrayBuffer === "function" && Number(poster.size || 0) > 80 && item4IsClipPosterFile(poster)) {
        try {
          const stored = await item4PutClipPoster(env, recordId, id, await poster.arrayBuffer(), poster.type || "image/jpeg");
          row.poster_url = stored.url;
          row.poster_r2_key = stored.key;
        } catch (error) {
          console.warn("Item 4 clip poster staging failed", error);
        }
      }
      uploaded.push(row);
    }
    const assets = [...existing, ...uploaded];
    const needsCompress = item4AssetsNeedStudioCompress(assets);
    record = await item4UpdateRequestState(env, recordId, {
      Studio_Master_Assets_JSON: JSON.stringify(assets),
      Studio_Master_Asset_Count: assets.length,
      Studio_Master_Asset_Status: finishedVideo && !needsCompress ? "Ready" : "Uploading",
      Studio_Output_Plan_Status: "Needs Plan",
      Studio_Output_Plan_JSON: null,
      Studio_Variant_Manifest_JSON: null,
      Studio_Variant_Status: "None",
      Studio_Variant_Updated_At: null,
      Studio_Variant_Error: null,
      Studio_Item4_State: finishedVideo && !needsCompress ? "Assets Ready" : "Draft",
    });

    if (needsCompress && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(item4PulseStudioCompressJob(env, recordId).catch((error) => {
        console.warn("Item 4 studio-compress pulse deferred after upload", error);
      }));
    }
    if (studioIsAzFinishedVideo(record) && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(advanceAzFinishedVideo(env, recordId, authorization, ctx).catch((error) => {
        console.warn("AZ finished-video advance deferred after upload", recordId, error);
      }));
    }

    if (finishedVideo) {
      return respond(request, env, {
        ok: true,
        uploaded: uploaded.length,
        authority_status: needsCompress ? "Uploading" : "Ready",
        authority_progress: { ready: needsCompress ? 0 : assets.length, target: assets.length },
        assets,
        execution_ids: [],
        record: mapProductionRequest(record),
        compression_pending: needsCompress,
        message: needsCompress
          ? (studioIsAzFinishedVideo(record)
            ? "Studio is compressing this video automatically. You can close this tab."
            : "Studio is compressing this video automatically. Keep this tab open.")
          : (studioIsAzFinishedVideo(record)
            ? "Finished video is stored. Studio will thumbnail, schedule, and queue all four platforms. You can close this tab."
            : "Finished video is stored and ready. Crops, Remotion, and Drive copies are skipped."),
      }, 201);
    }

    authorityQueueStarted = true;
    const expected = await item4UpsertMasterQueue(env, recordId, assets);

    // Stage + queue only. Drive copies and SMV1 drain stay off the POST so a
    // large still cannot 500 the browser after smaller photos already saved.
    if (expected.length && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil((async () => {
        try {
          await item4DrainVariantWorker(
            env,
            recordId,
            Math.min(8, Math.max(2, expected.length + 2)),
            { maxMs: ITEM4_DRAIN_POST_BUDGET_MS }
          );
          await item4ReconcileMasterAuthority(env, recordId);
        } catch (error) {
          console.warn("Item 4 master-media drain continued in background", error);
        }
      })());
    }

    return respond(request, env, {
      ok: true,
      uploaded: uploaded.length,
      authority_status: "Uploading",
      authority_progress: { ready: existingReady.length, target: assets.length },
      assets,
      execution_ids: [],
      record: mapProductionRequest(record),
      message: "Master files were accepted. Google Drive preservation is continuing in the restartable background handoff.",
    }, 202);
  } catch (error) {
    // Before queue handoff begins, an upload failure can be rolled back completely.
    // After queue handoff begins, preserve staging and a resumable state unless
    // reconciliation has proven a terminal handoff failure.
    if (!authorityQueueStarted && !finishedVideo) {
      for (const asset of uploaded) { try { await env.STUDIO_MEDIA.delete(asset.r2_key); } catch {} }
      try {
        await item4UpdateRequestState(env, recordId, existingReady.length
          ? { Studio_Master_Asset_Status: "Ready", Studio_Item4_State: "Assets Ready" }
          : { Studio_Master_Asset_Status: "Error", Studio_Item4_State: "Error" });
      } catch {}
    } else {
      try {
        const terminal = error instanceof HttpError && error.status === 502;
        await item4UpdateRequestState(env, recordId, {
          Studio_Master_Asset_Status: terminal ? "Error" : "Uploading",
          Studio_Item4_State: terminal ? "Error" : "Draft",
        });
      } catch {}
    }
    throw error;
  }
}
/*__STUDIO_WORKER_END:uploadItem4MasterAssets__*/

export async function reorderItem4MasterAssets(request, env, url, authorization) {
  let payload = {};
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const recordId = item4RequestIdFromPath(url);
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);
  record = await item4UpdateRequestState(env, recordId, {
    Production_Notes: withProductionPhotoWaitManual(f(record, "Production_Notes")),
  });
  const assets = item4AssetManifest(record).slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const requested = Array.isArray(payload?.asset_ids)
    ? payload.asset_ids.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (!requested.length) throw new HttpError(400, "asset_ids is required");
  if (requested.length !== assets.length) {
    throw new HttpError(400, `asset_ids must include every master photo exactly once (expected ${assets.length})`);
  }
  const byId = new Map(assets.map((asset) => [String(asset.id || "").trim(), asset]));
  if (requested.some((id) => !byId.has(id))) throw new HttpError(400, "asset_ids includes an unknown master photo");
  if (new Set(requested).size !== requested.length) throw new HttpError(400, "asset_ids must not contain duplicates");
  const reordered = requested.map((id, index) => ({ ...byId.get(id), order: index + 1 }));
  const unchanged = reordered.every((asset, index) => String(assets[index]?.id || "") === String(asset.id || ""));
  if (unchanged) {
    return respond(request, env, {
      ok: true,
      reordered: false,
      assets: reordered,
      record: mapProductionRequest(record),
      production_request: mapProductionRequest(record),
    });
  }
  const updated = await item4UpdateRequestState(env, recordId, {
    Studio_Master_Assets_JSON: JSON.stringify(reordered),
    Studio_Master_Asset_Count: reordered.length,
    Studio_Master_Asset_Status: reordered.length ? "Ready" : "None",
    Studio_Output_Plan_Status: "Needs Plan",
    Studio_Output_Plan_JSON: null,
    Studio_Variant_Manifest_JSON: null,
    Studio_Variant_Status: "None",
    Studio_Variant_Updated_At: null,
    Studio_Variant_Error: null,
    Studio_Item4_State: reordered.length ? "Assets Ready" : "Draft",
  });
  return respond(request, env, {
    ok: true,
    reordered: true,
    assets: reordered,
    record: mapProductionRequest(updated),
    production_request: mapProductionRequest(updated),
  });
}
/*__STUDIO_WORKER_END:reorderItem4MasterAssets__*/

export async function deleteItem4MasterAsset(request, env, url, authorization) {
  try { await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const recordId = item4RequestIdFromPath(url);
  const assetId = item4AssetIdFromPath(url);
  if (!assetId) throw new HttpError(400, "Invalid master asset ID");
  const record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);
  const assets = item4AssetManifest(record);
  const target = assets.find(x => x.id === assetId);
  if (!target) throw new HttpError(404, "Master asset not found");
  if (env.STUDIO_MEDIA) {
    try { await env.STUDIO_MEDIA.delete(target.r2_key); } catch {}
    if (target.poster_r2_key) {
      try { await env.STUDIO_MEDIA.delete(target.poster_r2_key); } catch {}
    }
  }
  const remaining = assets.filter(x => x.id !== assetId).map((x,i) => ({...x, order:i+1}));
  const remainingMediaAssetIds = [...new Set(
    remaining.map((asset) => String(asset?.media_asset_record_id || "").trim()).filter(Boolean)
  )];
  const deletedAiAsset = /^studio_ai/i.test(String(target?.source || ""));
  const deletedMediaId = String(target?.media_asset_record_id || "").trim();
  const updateFields = {
    Studio_Master_Assets_JSON: JSON.stringify(remaining),
    Studio_Master_Asset_Count: remaining.length,
    Studio_Master_Asset_Status: remaining.length ? "Ready" : "None",
    Studio_Master_Media_Assets: remainingMediaAssetIds,
    Studio_Output_Plan_Status: "Needs Plan",
    Studio_Output_Plan_JSON: null,
    Studio_Variant_Manifest_JSON: null,
    Studio_Variant_Status: "None",
    Studio_Variant_Updated_At: null,
    Studio_Variant_Error: null,
    Studio_Platform_Variant_Assets: [],
    Studio_Item4_State: remaining.length ? "Assets Ready" : "Draft",
  };
  if (deletedAiAsset) {
    // An explicit delete is stronger than the original AI quantity recommendation.
    // Persist an auto-off marker so opening/refocusing Production cannot regenerate it.
    updateFields.Carousel_Image_Mode = "Manual Upload";
  }
  const notes = String(f(record, "Production_Notes") || "").trim();
  const nextNotes = withProductionPhotoWaitManual(
    deletedAiAsset && !/ez-ai-auto=off/i.test(notes)
      ? `${notes}${notes ? "; " : ""}ez-ai-auto=off`
      : notes,
    deletedMediaId ? [deletedMediaId] : []
  );
  if (nextNotes !== notes) updateFields.Production_Notes = nextNotes;
  const ideaId = firstLinkedRecordId(f(record, "Idea_Candidate"));
  if (ideaId) {
    try {
      await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaId, {
        method: "PATCH",
        body: JSON.stringify({
          fields: { Studio_Photo_Wait_Status: "Not Needed" },
          typecast: true,
        }),
      });
    } catch (error) {
      console.warn("photo-wait lock idea status failed", ideaId, error);
    }
  }
  const updated = await item4UpdateRequestState(env, recordId, updateFields);
  return respond(request, env, {
    ok: true,
    deleted: true,
    ai_auto_generation_disabled: deletedAiAsset,
    assets: remaining,
    record: mapProductionRequest(updated),
    production_request: mapProductionRequest(updated),
  });
}
/*__STUDIO_WORKER_END:deleteItem4MasterAsset__*/

export async function uploadItem4ClipPoster(request, env, url, authorization) {
  if (!env.STUDIO_MEDIA) throw new HttpError(503, "Studio media storage is not configured");
  const recordId = item4RequestIdFromPath(url);
  const assetId = item4AssetIdFromPath(url);
  if (!assetId) throw new HttpError(400, "Invalid master asset ID");
  const record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);
  const assets = item4AssetManifest(record);
  const target = assets.find((asset) => String(asset?.id || "") === String(assetId));
  if (!target) throw new HttpError(404, "Master asset not found");
  if (!item4LooksLikeVideoAsset(target)) throw new HttpError(415, "A clip poster can only be saved on a video clip");

  let poster = null;
  try {
    const form = await request.formData();
    poster = form.get("poster") || form.get("posters") || form.get("file");
  } catch {}
  const hasFile = poster && typeof poster.arrayBuffer === "function" && Number(poster.size || 0) >= 80 && item4IsClipPosterFile(poster);
  if (hasFile) {
    const stored = await item4PutClipPoster(env, recordId, assetId, await poster.arrayBuffer(), poster.type || "image/jpeg");
    const nextAssets = assets.map((asset) => String(asset?.id || "") === String(assetId)
      ? { ...asset, poster_url: stored.url, poster_r2_key: stored.key }
      : asset);
    const updated = await item4UpdateRequestState(env, recordId, {
      Studio_Master_Assets_JSON: JSON.stringify(nextAssets),
    });
    return respond(request, env, {
      ok: true,
      poster_url: stored.url,
      assets: nextAssets,
      record: mapProductionRequest(updated),
    });
  }

  const local = await item4BuildClipPostersLocally(env, recordId, { assetId });
  if (local.posters[0]?.poster_url) {
    const refreshed = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
    return respond(request, env, {
      ok: true,
      poster_url: local.posters[0].poster_url,
      assets: item4AssetManifest(refreshed),
      record: mapProductionRequest(refreshed),
    });
  }

  let pulsed = null;
  try {
    pulsed = await item4PulseClipPosterJob(env, recordId, { assetId });
  } catch (error) {
    console.warn("Item 4 clip poster job deferred", error);
    try {
      await item4DrainPreviewCacheWorker(env, recordId, 4);
      await item4ReconcileMasterAuthority(env, recordId);
    } catch (drainError) {
      console.warn("Item 4 clip poster SMV1 fallback deferred", drainError);
    }
  }
  const refreshed = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const nextAssets = item4AssetManifest(refreshed);
  const updatedAsset = nextAssets.find((asset) => String(asset?.id || "") === String(assetId));
  const posterUrl = String(updatedAsset?.poster_url || pulsed?.posters?.[0]?.poster_url || "").trim();
  if (!item4LooksLikeImagePreviewUrl(posterUrl)) {
    throw new HttpError(502, pulsed?.errors?.[0] || "Could not pull a movie frame from Google Drive yet");
  }
  return respond(request, env, {
    ok: true,
    poster_url: posterUrl,
    assets: nextAssets,
    record: mapProductionRequest(refreshed),
  });
}
/*__STUDIO_WORKER_END:uploadItem4ClipPoster__*/

export function ideaLibraryTokens(text) {
  return [...new Set(String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !IDEA_LIBRARY_STOPWORDS.has(token)))];
}
/*__STUDIO_WORKER_END:ideaLibraryTokens__*/

export function ideaLibraryStrongTokens(tokens) {
  return tokens.filter((token) => {
    if (IDEA_LIBRARY_WEAK_TOKENS.has(token)) return false;
    if (token.length >= 4) return true;
    return IDEA_LIBRARY_SHORT_SUBJECTS.has(token);
  });
}
/*__STUDIO_WORKER_END:ideaLibraryStrongTokens__*/

export function ideaLibraryHasToken(text, token) {
  const hay = String(text || "").toLowerCase();
  const key = String(token || "").toLowerCase();
  if (!key) return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(hay);
}
/*__STUDIO_WORKER_END:ideaLibraryHasToken__*/

export function ideaLibrarySearchHit(text, token) {
  const hay = String(text || "").toLowerCase();
  const key = String(token || "").toLowerCase();
  if (!key) return false;
  if (ideaLibraryHasToken(hay, key)) return true;
  if (key.length < 3) return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}[a-z0-9]`).test(hay);
}
/*__STUDIO_WORKER_END:ideaLibrarySearchHit__*/

export function ideaLibrarySearchFilterKeys(queryTokens = []) {
  const tokens = (queryTokens || []).map((token) => String(token || "").toLowerCase()).filter(Boolean);
  if (!tokens.length) return [];
  const strong = ideaLibraryStrongTokens(tokens);
  return strong.length ? strong : [...new Set(tokens.filter((token) => token.length >= 3))];
}
/*__STUDIO_WORKER_END:ideaLibrarySearchFilterKeys__*/

export function ideaLibraryTokenForms(token) {
  const value = String(token || "").toLowerCase();
  if (!value) return [];
  const forms = new Set([value]);
  if (value.endsWith("ies") && value.length > 4) forms.add(`${value.slice(0, -3)}y`);
  else if (value.endsWith("s") && !value.endsWith("ss") && value.length >= 4) forms.add(value.slice(0, -1));
  else forms.add(`${value}s`);
  return [...forms];
}
/*__STUDIO_WORKER_END:ideaLibraryTokenForms__*/

export function ideaLibraryFieldHits(text, keys) {
  return (keys || []).filter((key) =>
    ideaLibraryTokenForms(key).some((form) => ideaLibraryHasToken(text, form))
  );
}
/*__STUDIO_WORKER_END:ideaLibraryFieldHits__*/

export function ideaLibraryNamedPlaceKeys(text) {
  const hay = String(text || "").toLowerCase();
  const keys = [];
  for (const place of IDEA_LIBRARY_NAMED_PLACES) {
    if (!hay.includes(place)) continue;
    keys.push(...ideaLibraryStrongTokens(ideaLibraryTokens(place)));
  }
  return [...new Set(keys)];
}
/*__STUDIO_WORKER_END:ideaLibraryNamedPlaceKeys__*/

export function ideaLibraryMatchKeys(idea, query = "") {
  const primaryLocation = f(idea, "Primary_Location");
  const title = f(idea, "Candidate_Title");
  const summary = f(idea, "Idea_Summary");
  const fromLocation = ideaLibraryStrongTokens(ideaLibraryTokens(primaryLocation));
  const fromNamed = ideaLibraryNamedPlaceKeys(`${primaryLocation} ${title} ${summary}`);
  const fromQuery = ideaLibraryStrongTokens(ideaLibraryTokens(query));
  const placeKeys = [...new Set([...fromLocation, ...fromNamed, ...fromQuery])];
  const subjectKeys = ideaLibraryStrongTokens(ideaLibraryTokens(`${title} ${summary}`))
    .filter((token) => !placeKeys.includes(token));
  return {
    placeKeys,
    subjectKeys,
    scanKeys: [...new Set([...placeKeys, ...subjectKeys])],
  };
}
/*__STUDIO_WORKER_END:ideaLibraryMatchKeys__*/

export function ideaLibraryFilterKeys(placeKeys = [], subjectKeys = []) {
  const brands = (subjectKeys || []).filter((token) => IDEA_LIBRARY_BRAND_SUBJECTS.has(token));
  const distinctive = (subjectKeys || []).filter((token) => IDEA_LIBRARY_DISTINCTIVE_SUBJECTS.has(token));
  if ((placeKeys || []).length || brands.length) {
    return [...new Set([...(placeKeys || []), ...brands, ...distinctive])];
  }
  return [...new Set(subjectKeys || [])];
}
/*__STUDIO_WORKER_END:ideaLibraryFilterKeys__*/

export function ideaLibraryPlaceKeys(idea, query = "") {
  return ideaLibraryMatchKeys(idea, query).placeKeys;
}
/*__STUDIO_WORKER_END:ideaLibraryPlaceKeys__*/

export function ideaLibraryAirtableEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
/*__STUDIO_WORKER_END:ideaLibraryAirtableEscape__*/

export function ideaLibraryNamePhraseFormula(phrase, { includeVideo = false } = {}) {
  const media = includeVideo
    ? "OR({Media_Class}='Image',{Media_Class}='Graphic',{Media_Class}='Video')"
    : "OR({Media_Class}='Image',{Media_Class}='Graphic')";
  const notDerived = ideaLibraryExcludeDerivedStillFormula();
  const base = `AND(${media},{Classification_Status}='Classified',{Active},NOT({Do_Not_Use}),${notDerived})`;
  return `AND(${base},${libraryAssetNameFindFormula(phrase)})`;
}
/*__STUDIO_WORKER_END:ideaLibraryNamePhraseFormula__*/

export function ideaLibraryFilterFormula(placeKeys, { includeVideo = false } = {}) {
  const media = includeVideo
    ? "OR({Media_Class}='Image',{Media_Class}='Graphic',{Media_Class}='Video')"
    : "OR({Media_Class}='Image',{Media_Class}='Graphic')";
  // Exclude Item 4 fill-crop / aspect variants from the Airtable scan. Those rows
  // share place names (e.g. Streeterville__9x16__fill-crop), sort newest-first,
  // and used to exhaust IDEA_LIBRARY_PLACE_FILTER_LIMIT so every candidate was
  // rejected in JS and photo-wait reported high_count=0.
  const notDerived = ideaLibraryExcludeDerivedStillFormula();
  const base = `AND(${media},{Classification_Status}='Classified',{Active},NOT({Do_Not_Use}),${notDerived})`;
  const keys = (placeKeys || []).filter(Boolean).slice(0, 10);
  if (!keys.length) return base;
  const hay = "LOWER(CONCATENATE({Search_Keywords},' ',{AI_Tags},' ',{Location},' ',{Asset Name},' ',{Topic},' ',{Subtopic}))";
  const clauses = keys.map((key) => `FIND("${ideaLibraryAirtableEscape(String(key).toLowerCase())}", ${hay})`);
  return `AND(${base},OR(${clauses.join(",")}))`;
}
/*__STUDIO_WORKER_END:ideaLibraryFilterFormula__*/

export function ideaLibraryVideoFilterFormula(placeKeys) {
  const media = "OR({Media_Class}='Video',LEFT(LOWER({MIME_Type}),6)='video/')";
  const notDerived = ideaLibraryExcludeDerivedStillFormula();
  const base = `AND(${media},{Classification_Status}='Classified',{Active},NOT({Do_Not_Use}),${notDerived})`;
  const keys = (placeKeys || []).filter(Boolean).slice(0, 10);
  if (!keys.length) return base;
  const hay = "LOWER(CONCATENATE({Search_Keywords},' ',{AI_Tags},' ',{Location},' ',{Asset Name},' ',{Topic},' ',{Subtopic}))";
  const clauses = keys.map((key) => `FIND("${ideaLibraryAirtableEscape(String(key).toLowerCase())}", ${hay})`);
  return `AND(${base},OR(${clauses.join(",")}))`;
}
/*__STUDIO_WORKER_END:ideaLibraryVideoFilterFormula__*/

export function ideaLibraryHaystack(record) {
  const tags = f(record, "AI_Tags");
  const keywords = f(record, "Search_Keywords");
  return [
    f(record, "Asset Name"),
    f(record, "Topic"),
    f(record, "Subtopic"),
    f(record, "Location"),
    f(record, "Asset_Description"),
    Array.isArray(tags) ? tags.join(" ") : tags,
    Array.isArray(keywords) ? keywords.join(" ") : keywords,
  ].filter(Boolean).join(" ").toLowerCase();
}
/*__STUDIO_WORKER_END:ideaLibraryHaystack__*/

export function ideaLibraryIntakeDate(record) {
  return libraryAssetAddedAt(record);
}
/*__STUDIO_WORKER_END:ideaLibraryIntakeDate__*/

export function ideaLibraryFileBytes(record) {
  const rawBytes = f(record, "File_Size_Bytes");
  const bytes = Number(Array.isArray(rawBytes) ? rawBytes[0] : rawBytes || 0);
  if (Number.isFinite(bytes) && bytes > 0) return Math.round(bytes);
  const rawMb = f(record, "File_Size_MB");
  const mb = Number(Array.isArray(rawMb) ? rawMb[0] : rawMb || 0);
  if (Number.isFinite(mb) && mb > 0) return Math.round(mb * 1024 * 1024);
  return 0;
}
/*__STUDIO_WORKER_END:ideaLibraryFileBytes__*/

export function ideaLibraryIsEligibleVideo(record) {
  const mediaClass = String(f(record, "Media_Class") || "").trim().toLowerCase();
  const mime = String(f(record, "MIME_Type") || "").trim().toLowerCase();
  const role = String(f(record, "Asset_Role") || "").trim().toLowerCase();
  const classification = String(f(record, "Classification_Status") || "").trim().toLowerCase();
  const eligibility = String(f(record, "Raw_Source_Eligibility") || "").trim().toLowerCase();
  const status = String(f(record, "Asset_Status") || "").trim().toLowerCase();
  const access = String(f(record, "Drive_Access_Status") || "").trim().toLowerCase();
  const name = String(f(record, "Asset Name") || "");
  if (/__\d+x\d+__/i.test(name) || /fill-crop-v\d+/i.test(name)) return false;
  if (mediaClass !== "video" && !mime.startsWith("video/")) return false;
  if (role && role !== "raw footage") return false;
  if (classification && classification !== "classified") return false;
  if (Boolean(f(record, "Do_Not_Use"))) return false;
  if (f(record, "Active") === false) return false;
  if (eligibility === "ineligible") return false;
  if (status && status !== "available") return false;
  if (access && access !== "public") return false;
  if (String(f(record, "Exclusion_Reasons") || "").trim()) return false;
  return Boolean(googleDriveFileId(record) || String(f(record, "Google Drive URL") || "").trim());
}
/*__STUDIO_WORKER_END:ideaLibraryIsEligibleVideo__*/

export function ideaLibraryIsEligibleImage(record) {
  const mediaClass = String(f(record, "Media_Class") || "").trim().toLowerCase();
  const mime = String(f(record, "MIME_Type") || "").trim().toLowerCase();
  const classification = String(f(record, "Classification_Status") || "").trim().toLowerCase();
  const eligibility = String(f(record, "Raw_Source_Eligibility") || "").trim().toLowerCase();
  const status = String(f(record, "Asset_Status") || "").trim().toLowerCase();
  const name = String(f(record, "Asset Name") || "");
  if (/__\d+x\d+__/i.test(name) || /fill-crop-v\d+/i.test(name)) return false;
  if (mediaClass && mediaClass !== "image" && mediaClass !== "graphic") return false;
  if (mime.startsWith("video/")) return false;
  if (classification && classification !== "classified") return false;
  if (Boolean(f(record, "Do_Not_Use"))) return false;
  if (f(record, "Active") === false) return false;
  if (eligibility === "ineligible") return false;
  if (status && status !== "available") return false;
  return Boolean(googleDriveFileId(record));
}
/*__STUDIO_WORKER_END:ideaLibraryIsEligibleImage__*/

export function ideaLibraryRankAsset(record, { placeKeys, subjectKeys, strongIdeaTokens, ideaTokens, queryTokens, today }) {
  const location = String(f(record, "Location") || "").toLowerCase();
  const name = String(f(record, "Asset Name") || "").toLowerCase();
  const batchId = String(f(record, "Intake_Batch_ID") || "").trim();
  const haystack = ideaLibraryHaystack(record);
  if (queryTokens.length && !queryTokens.some((token) => ideaLibrarySearchHit(haystack, token))) {
    return null;
  }
  const locationPlaceHits = ideaLibraryFieldHits(location, placeKeys);
  const namePlaceHits = ideaLibraryFieldHits(name, placeKeys);
  const locationSubjectHits = ideaLibraryFieldHits(location, subjectKeys);
  const nameSubjectHits = ideaLibraryFieldHits(name, subjectKeys);
  const haySubjectHits = ideaLibraryFieldHits(haystack, subjectKeys);
  const placeAnchor = locationPlaceHits.length > 0 || namePlaceHits.length > 0;
  const subjectAnchor = locationSubjectHits.length > 0 || nameSubjectHits.length > 0;
  const subjectTopic = haySubjectHits.length >= 2;
  const strongOverlap = strongIdeaTokens.filter((token) =>
    ideaLibraryTokenForms(token).some((form) => ideaLibraryHasToken(haystack, form))
  ).length;
  const weakOverlap = ideaTokens.filter((token) => ideaLibraryHasToken(haystack, token)).length;
  const intakeToday = ideaLibraryIntakeDate(record) === today;
  const reasons = [];
  if (locationPlaceHits.length) reasons.push(`location:${locationPlaceHits[0]}`);
  if (namePlaceHits.length) reasons.push(`asset_name:${namePlaceHits[0]}`);
  if (locationSubjectHits.length) reasons.push(`location_subject:${locationSubjectHits[0]}`);
  if (nameSubjectHits.length) reasons.push(`asset_name:${nameSubjectHits[0]}`);
  if (subjectTopic) reasons.push(`subject:${haySubjectHits.slice(0, 2).join("+")}`);
  if (intakeToday && (placeAnchor || subjectAnchor || subjectTopic)) reasons.push("intake_today");

  let confidence = "none";
  if (placeAnchor || subjectAnchor || subjectTopic) confidence = "high";
  else if (haySubjectHits.length === 1 || strongOverlap >= 2) confidence = "medium";
  else if (strongOverlap >= 1) confidence = "low";

  if (!queryTokens.length && confidence !== "high") return null;
  if (queryTokens.length && confidence === "none") {
    confidence = "low";
    reasons.push("search_hit");
  }

  const score = (locationPlaceHits.length ? 40 : 0)
    + (namePlaceHits.length ? 30 : 0)
    + (subjectAnchor ? 30 : 0)
    + (subjectTopic ? 25 : 0)
    + (haySubjectHits.length === 1 && !subjectAnchor ? 8 : 0)
    + strongOverlap * 4
    + weakOverlap
    + (intakeToday && confidence === "high" ? 2 : 0);

  return {
    record,
    score,
    confidence,
    match_reasons: reasons,
    intake_batch_id: batchId || null,
    preselected: confidence === "high",
  };
}
/*__STUDIO_WORKER_END:ideaLibraryRankAsset__*/

export function mapIdeaLibraryAsset(record, row = {}) {
  const video = ideaLibraryIsEligibleVideo(record);
  return {
    id: record.id,
    name: f(record, "Asset Name"),
    media_kind: video ? "video" : "photo",
    mime_type: String(f(record, "MIME_Type") || "").trim() || null,
    duration_seconds: Number(f(record, "Duration_Seconds") || 0) || null,
    google_drive_file_id: googleDriveFileId(record),
    preview_path: `/api/media-assets/${record.id}/preview`,
    location: f(record, "Location") || null,
    score: row.score || 0,
    confidence: row.confidence || "none",
    match_reasons: Array.isArray(row.match_reasons) ? row.match_reasons : [],
    preselected: Boolean(row.preselected),
    intake_date: ideaLibraryIntakeDate(record) || null,
    intake_batch_id: row.intake_batch_id || String(f(record, "Intake_Batch_ID") || "").trim() || null,
  };
}
/*__STUDIO_WORKER_END:mapIdeaLibraryAsset__*/

export async function getMediaLibraryStills(request, env, url, authorization) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  const query = String(url.searchParams.get("q") || "").trim();
  const phrase = libraryQuotedPhrase(query);
  const includeVideo = ["1", "true", "video", "all", "clips"].includes(String(url.searchParams.get("include") || "").trim().toLowerCase());
  const ideaId = String(url.searchParams.get("idea_id") || "").trim();
  const queryTokens = phrase ? [] : ideaLibraryTokens(query);
  let idea = null;
  if (/^rec[A-Za-z0-9]+$/.test(ideaId)) {
    try { idea = await loadAuthorizedIdea(env, ideaId, authorization); } catch {}
  }
  const scopeFormula = await libraryProfileScopeFormula(env, authorization, url, { idea, includeUnscoped: false });
  // Operator browse/search uses the Asset Manager name FIND (already excludes fill-crop),
  // not the idea photo-wait subject-token OR which flooded scans with luxury/glamorous hits.
  const browseFormula = assetLibraryFilterFormula(query, includeVideo ? "" : "photo");
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
    limit: IDEA_LIBRARY_SCAN_LIMIT,
    sortField: "Intake_Date",
    sortDirection: "desc",
    filterFormula: combineAirtableFormulas(browseFormula, scopeFormula),
  });
  const items = [];
  for (const record of records) {
    const eligible = ideaLibraryIsEligibleImage(record) || (includeVideo && ideaLibraryIsEligibleVideo(record));
    if (!eligible) continue;
    const name = f(record, "Asset Name");
    if (phrase) {
      if (!libraryNameHasPhrase(name, phrase)) continue;
    } else if (queryTokens.length) {
      const haystack = ideaLibraryHaystack(record);
      if (!queryTokens.some((token) => ideaLibrarySearchHit(haystack, token))) continue;
    }
    items.push(mapIdeaLibraryAsset(record, {
      score: 0,
      confidence: "browse",
      match_reasons: phrase ? ["name_phrase"] : (queryTokens.length ? ["search_hit"] : ["library_browse"]),
      preselected: false,
    }));
  }
  items.sort((a, b) => libraryNameSort(a.name, b.name));
  // Empty browse stays small; typed/quoted search returns every match we scanned.
  const capped = items.slice(0, (phrase || queryTokens.length) ? 200 : 60);
  return respond(request, env, {
    ok: true,
    query: query || null,
    phrase: phrase || null,
    count: capped.length,
    records: capped,
  });
}
/*__STUDIO_WORKER_END:getMediaLibraryStills__*/

export async function getIdeaLibrarySuggestions(request, env, url, authorization) {
  if (!env.AIRTABLE_MEDIA_TABLE_ID) throw new HttpError(503, "Media Assets table is not configured");
  const ideaId = ideaRecordIdFromPath(url);
  const idea = await loadAuthorizedIdea(env, ideaId, authorization);
  const query = String(url.searchParams.get("q") || "").trim();
  const phrase = libraryQuotedPhrase(query);
  const includeVideo = ["1", "true", "video", "all", "clips"].includes(
    String(url.searchParams.get("include") || "").trim().toLowerCase()
  );
  const ideaTokens = ideaLibraryTokens([
    f(idea, "Candidate_Title"),
    f(idea, "Idea_Summary"),
    f(idea, "Primary_Location"),
  ].filter(Boolean).join(" "));
  const queryTokens = phrase ? [] : ideaLibraryTokens(query);
  const strongIdeaTokens = ideaLibraryStrongTokens(ideaTokens);
  const { placeKeys, subjectKeys, scanKeys } = ideaLibraryMatchKeys(idea, phrase ? "" : query);
  const today = chicagoNowParts().date;
  const operatorSearch = Boolean(phrase || queryTokens.length);
  // Typed search is operator choice only: every library hit for the query, no idea
  // place/subject ranking. Empty-q suggestions still rank against the idea brief.
  const filterKeys = operatorSearch
    ? ideaLibrarySearchFilterKeys(queryTokens)
    : (placeKeys.length || subjectKeys.some((token) => IDEA_LIBRARY_BRAND_SUBJECTS.has(token))
      ? ideaLibraryFilterKeys(placeKeys, subjectKeys)
      : scanKeys);
  const scanLimit = operatorSearch
    ? IDEA_LIBRARY_SCAN_LIMIT
    : (filterKeys.length ? IDEA_LIBRARY_PLACE_FILTER_LIMIT : IDEA_LIBRARY_SCAN_LIMIT);
  const scopeFormula = await libraryProfileScopeFormula(env, authorization, url, { idea });
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
    limit: scanLimit,
    sortField: "Intake_Date",
    sortDirection: "desc",
    filterFormula: combineAirtableFormulas(
      phrase
        ? ideaLibraryNamePhraseFormula(phrase, { includeVideo })
        : (operatorSearch
          ? assetLibraryFilterFormula(query, includeVideo ? "" : "photo")
          : ideaLibraryFilterFormula(filterKeys, { includeVideo })),
      scopeFormula
    ),
  });
  const ranked = [];
  for (const record of records) {
    const eligible = ideaLibraryIsEligibleImage(record)
      || (includeVideo && ideaLibraryIsEligibleVideo(record));
    if (!eligible) continue;
    if (phrase) {
      const name = f(record, "Asset Name");
      if (!libraryNameHasPhrase(name, phrase)) continue;
      ranked.push({
        record,
        score: 1,
        confidence: "low",
        match_reasons: ["name_phrase"],
        intake_batch_id: String(f(record, "Intake_Batch_ID") || "").trim() || null,
        preselected: false,
      });
      continue;
    }
    if (operatorSearch) {
      const haystack = ideaLibraryHaystack(record);
      if (!queryTokens.some((token) => ideaLibrarySearchHit(haystack, token))) continue;
      ranked.push({
        record,
        score: 1,
        confidence: "low",
        match_reasons: ["search_hit"],
        intake_batch_id: String(f(record, "Intake_Batch_ID") || "").trim() || null,
        preselected: false,
      });
      continue;
    }
    const row = ideaLibraryRankAsset(record, {
      placeKeys,
      subjectKeys,
      strongIdeaTokens,
      ideaTokens,
      queryTokens,
      today,
    });
    if (row) ranked.push(row);
  }
  ranked.sort((a, b) => {
    if (operatorSearch || phrase) {
      return libraryNameSort(f(a.record, "Asset Name"), f(b.record, "Asset Name"));
    }
    const confidenceRank = { high: 3, medium: 2, low: 1, none: 0 };
    const confDiff = (confidenceRank[b.confidence] || 0) - (confidenceRank[a.confidence] || 0);
    if (confDiff) return confDiff;
    if (b.score !== a.score) return b.score - a.score;
    if (a.preselected !== b.preselected) return a.preselected ? -1 : 1;
    return String(f(a.record, "Asset Name") || "").localeCompare(String(f(b.record, "Asset Name") || ""));
  });
  const capped = ranked.slice(0, operatorSearch || phrase ? 200 : 40).map((row) => mapIdeaLibraryAsset(row.record, row));
  return respond(request, env, {
    ok: true,
    idea_id: ideaId,
    query: query || null,
    phrase: phrase || null,
    place_keys: operatorSearch ? [] : placeKeys,
    subject_keys: operatorSearch ? [] : subjectKeys,
    match_policy: {
      auto_attach_confidence: "high",
      operator_search: operatorSearch,
      high: "Location or Asset Name shares a named place, or a subject word on name/location, or two subject words in metadata",
      medium: "one subject/topic overlap only — show, do not auto-attach",
      low: "weak/search hit — operator choice only",
      scan_limit: scanLimit,
      place_filter_active: !operatorSearch && filterKeys.length > 0,
    },
    // Typed search never auto-suggests — every hit is an unchecked match for the operator.
    suggested: operatorSearch ? [] : capped.filter((row) => row.preselected),
    matches: operatorSearch ? capped : capped.filter((row) => !row.preselected),
  });
}
/*__STUDIO_WORKER_END:getIdeaLibrarySuggestions__*/

export function ideaLibraryRejectReason(record, { allowVideo = false } = {}) {
  const mediaClass = String(f(record, "Media_Class") || "").trim().toLowerCase();
  const mime = String(f(record, "MIME_Type") || "").trim().toLowerCase();
  const name = String(f(record, "Asset Name") || record.id);
  const isVideo = mediaClass === "video" || mime.startsWith("video/");
  if (Boolean(f(record, "Do_Not_Use"))) return `${name} is marked Do Not Use`;
  if (isVideo && !allowVideo) return `${name} is a video; this picker attaches stills only`;
  if (isVideo && allowVideo && !ideaLibraryIsEligibleVideo(record)) return `${name} is not eligible Raw Footage`;
  if (!isVideo && !ideaLibraryIsEligibleImage(record)) return `${name} is not a classified eligible library image`;
  if (!isVideo && ideaLibraryFileBytes(record) > ITEM4_MAX_FILE_BYTES) return `${name} exceeds the 25 MB per-image limit`;
  if (isVideo && ideaLibraryFileBytes(record) > ITEM4_MAX_CLIP_FILE_BYTES) return `${name} exceeds the 200 MB clip limit`;
  return null;
}
/*__STUDIO_WORKER_END:ideaLibraryRejectReason__*/

export function studioProfileRequiresChicagoWatermark(profile) {
  const normalized = String(f(profile || {}, "Profile_Name") || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return normalized.startsWith("chicagoshining");
}
/*__STUDIO_WORKER_END:studioProfileRequiresChicagoWatermark__*/

export async function item4ProductionProfileRecord(env, requestRecord, preferredProfileId = "") {
  let profileId = studioFirstLinkedId(f(requestRecord || {}, "Content_Profile"));

  // Production Requests do not currently carry a Content_Profile field in Airtable.
  // The linked Idea is the authoritative profile owner while the request is in Production.
  if (!profileId) {
    const ideaId = firstLinkedRecordId(f(requestRecord || {}, "Idea_Candidate"));
    if (ideaId) {
      try {
        const idea = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, ideaId);
        profileId = firstLinkedRecordId(f(idea, "Content_Profile"));
      } catch (error) {
        console.warn("Production profile lookup from Idea skipped", ideaId, error?.message || error);
      }
    }
  }

  // Promoted/legacy requests can fall back to their Content Item.
  if (!profileId) {
    const contentId = firstLinkedRecordId(f(requestRecord || {}, "Promoted_Content_Item"))
      || firstLinkedRecordId(f(requestRecord || {}, "Content Items"));
    if (contentId && env.AIRTABLE_CONTENT_TABLE_ID) {
      try {
        const content = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId);
        profileId = firstLinkedRecordId(f(content, "Content_Profile"));
      } catch (error) {
        console.warn("Production profile lookup from Content Item skipped", contentId, error?.message || error);
      }
    }
  }

  const preferred = String(preferredProfileId || "").trim();
  if (!profileId && /^rec[A-Za-z0-9]+$/.test(preferred)) profileId = preferred;
  if (!profileId) return null;

  const profiles = await listContentProfileRecords(env).catch(() => []);
  const cached = profiles.find((row) => row.id === profileId);
  if (cached) return cached;
  try {
    return await airtableFetch(env, "Content Profiles", profileId);
  } catch {
    return null;
  }
}
/*__STUDIO_WORKER_END:item4ProductionProfileRecord__*/

export function studioAssetHasChicagoWatermark(record) {
  return /\[watermarked:chicagoshining[^\]]*\]/i.test(String(f(record || {}, "Asset_Description") || ""));
}
/*__STUDIO_WORKER_END:studioAssetHasChicagoWatermark__*/

export function studioAssetSourceDriveId(record) {
  const description = String(f(record || {}, "Asset_Description") || "");
  return String(/Source master Drive ID:\s*([A-Za-z0-9_-]+)/i.exec(description)?.[1] || "").trim();
}
/*__STUDIO_WORKER_END:studioAssetSourceDriveId__*/

export async function ensureChicagoWatermarkedLibraryAssetForProfile(env, media, profile) {
  if (!studioProfileRequiresChicagoWatermark(profile)) return media;
  if (studioAssetHasChicagoWatermark(media)) return media;

  const driveId = googleDriveFileId(media);
  if (!driveId) throw new HttpError(409, "ChicagoShining assets must have a Google Drive master before they can be watermarked");
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) throw new HttpError(503, "Pipeline runner is required to watermark ChicagoShining assets");
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const profileName = String(f(profile, "Profile_Name") || "ChicagoShining").trim();
  const filename = String(f(media, "Asset Name") || "asset").trim();
  const mimeType = String(f(media, "MIME_Type") || "").trim();
  let response;
  try {
    response = await fetch(`${runnerUrl}/jobs/studio-asset-watermark`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Pipeline-Secret": secret } : {}),
      },
      body: JSON.stringify({
        google_drive_file_id: driveId,
        filename,
        mime_type: mimeType,
        profile_name: profileName,
      }),
    });
  } catch (error) {
    throw new HttpError(503, `Pipeline runner unreachable for ChicagoShining watermarking (${error instanceof Error ? error.message : "network error"})`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.watermarked || !payload?.google_drive_file_id) {
    throw new HttpError(
      response.status >= 400 ? response.status : 502,
      payload?.error || payload?.message || "ChicagoShining watermarking did not produce a branded derivative",
    );
  }
  const priorDescription = String(f(media, "Asset_Description") || "").trim();
  const marker = `[watermarked:${profileName}] Source master Drive ID: ${driveId}`;
  const fields = {
    "Google Drive File ID": String(payload.google_drive_file_id),
    "Google Drive URL": String(payload.google_drive_url || "").trim()
      || `https://drive.google.com/file/d/${String(payload.google_drive_file_id)}/view`,
    MIME_Type: String(payload.mime_type || mimeType || "application/octet-stream"),
    File_Extension: item4FileExtension(payload.filename || filename) || f(media, "File_Extension") || null,
    File_Size_Bytes: Number(payload.file_size_bytes || 0) || f(media, "File_Size_Bytes") || null,
    Asset_Description: [priorDescription, marker].filter(Boolean).join("\n"),
  };
  return airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID || ITEM4_MEDIA_ASSET_TABLE, media.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:ensureChicagoWatermarkedLibraryAssetForProfile__*/

export async function ensureChicagoWatermarkedLibraryAsset(env, media, requestRecord) {
  const profile = await item4ProductionProfileRecord(env, requestRecord);
  return ensureChicagoWatermarkedLibraryAssetForProfile(env, media, profile);
}
/*__STUDIO_WORKER_END:ensureChicagoWatermarkedLibraryAsset__*/

export async function attachItem4LibraryAssets(request, env, url, authorization) {
  const recordId = item4RequestIdFromPath(url);
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);
  record = await item4UpdateRequestState(env, recordId, {
    Production_Notes: withProductionPhotoWaitManual(f(record, "Production_Notes")),
  });
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const ids = [...new Set((Array.isArray(payload?.media_asset_ids) ? payload.media_asset_ids : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
  if (!ids.length) throw new HttpError(400, "Choose at least one library item");
  const existing = item4AssetManifest(record);
  const allowVideo = Boolean(payload?.allow_video)
    || item4IsClipInputKind(item4ParseEzOrigin(record).inputKind)
    || item4HasVideoMasters(existing)
    || item4IsClipInputKind(payload?.origin_kind);
  const already = new Set(existing.map((asset) => String(asset?.media_asset_record_id || "").trim()).filter(Boolean));
  const incoming = ids.filter((id) => !already.has(id));
  if (!incoming.length) {
    return respond(request, env, {
      ok: true,
      attached: 0,
      status: existing.length ? "Ready" : "None",
      count: existing.length,
      assets: existing,
      record: mapProductionRequest(record),
      message: "Selected library stills were already attached.",
    });
  }
  const appended = [];
  for (const mediaId of incoming) {
    let media = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID || ITEM4_MEDIA_ASSET_TABLE, mediaId);
    media = await ensureChicagoWatermarkedLibraryAsset(env, media, record);
    const reject = ideaLibraryRejectReason(media, { allowVideo });
    if (reject) throw new HttpError(409, reject);
    const driveId = googleDriveFileId(media);
    const driveUrl = String(f(media, "Google Drive URL") || "").trim()
      || (driveId ? `https://drive.google.com/file/d/${driveId}/view` : "");
    const mime = String(f(media, "MIME_Type") || "image/jpeg").trim() || "image/jpeg";
    const name = String(f(media, "Asset Name") || "photo");
    const video = ideaLibraryIsEligibleVideo(media) || mime.startsWith("video/");
    if (/__\d+x\d+__/i.test(name) || /fill-crop-v\d+/i.test(name)) continue;
    const durationSeconds = Number(f(media, "Duration_Seconds") || 0);
    const assetId = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
    appended.push({
      id: assetId,
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
      source: "library",
    });
    already.add(media.id);
  }
  if (!appended.length) {
    return respond(request, env, {
      ok: true,
      attached: 0,
      status: existing.length ? "Ready" : "None",
      count: existing.length,
      assets: existing,
      record: mapProductionRequest(record),
      message: "Selected library stills were already attached.",
    });
  }
  const assets = [...existing, ...appended];
  const allReady = assets.length > 0 && assets.every((asset) =>
    String(asset?.google_drive_file_id || "").trim() && String(asset?.media_asset_record_id || "").trim()
  );
  const mediaAssetIds = [...new Set(assets.map((asset) => String(asset?.media_asset_record_id || "").trim()).filter(Boolean))];
  const clipNotes = item4HasVideoMasters(assets)
    ? studioRewriteClipOriginNotes(f(record, "Production_Notes"), "photos-and-clips")
    : "";
  const updated = await item4UpdateRequestState(env, recordId, {
    Studio_Master_Assets_JSON: JSON.stringify(assets),
    Studio_Master_Asset_Count: assets.length,
    ...(clipNotes ? { Production_Notes: clipNotes } : {}),
    Studio_Master_Asset_Status: allReady ? "Ready" : (assets.length ? "Uploading" : "None"),
    Studio_Master_Media_Assets: mediaAssetIds,
    Studio_Output_Plan_Status: "Needs Plan",
    Studio_Output_Plan_JSON: null,
    Studio_Variant_Manifest_JSON: null,
    Studio_Variant_Status: "None",
    Studio_Variant_Updated_At: null,
    Studio_Variant_Error: null,
    Studio_Item4_State: allReady ? "Assets Ready" : (assets.length ? "Draft" : "Draft"),
  });
  return respond(request, env, {
    ok: true,
    attached: appended.length,
    status: allReady ? "Ready" : "Uploading",
    count: assets.length,
    assets,
    record: mapProductionRequest(updated),
    message: appended.length
      ? `${appended.length} library item${appended.length === 1 ? "" : "s"} attached from Google Drive.`
      : "Selected library items were already attached.",
  }, 201);
}
/*__STUDIO_WORKER_END:attachItem4LibraryAssets__*/

export async function attachItem4LibraryAssetIds(env, recordId, mediaAssetIds, authorization) {
  const url = new URL(`https://studio.chicagoshining.com/api/production-requests/${recordId}/assets/library`);
  const request = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ media_asset_ids: mediaAssetIds }),
  });
  return attachItem4LibraryAssets(request, env, url, authorization);
}
/*__STUDIO_WORKER_END:attachItem4LibraryAssetIds__*/

export async function item4EnsureFacebookSlideshowVoiceoverPayload(env, authorization) {
  void env;
  void authorization;
  // Facebook slideshow voiceover is assembled by Python FBS1. Do not PATCH Make.
  return { ok: true, skipped: "make_retired" };
}
/*__STUDIO_WORKER_END:item4EnsureFacebookSlideshowVoiceoverPayload__*/

export function item4DynamicRationale(text, count) {
  const n = Math.max(0, Number(count || 0));
  const phrase = `${n} photo${n === 1 ? "" : "s"}`;
  return String(text || "").replace(/five photos/gi, phrase);
}
/*__STUDIO_WORKER_END:item4DynamicRationale__*/

export async function item4MappingIndex(env) {
  const records = await listRecords(env, ITEM4_MAPPING_TABLE, { limit: 100 });
  const index = new Map();
  for (const row of records) {
    if (!Boolean(f(row, "Active"))) continue;
    const platform = String(f(row, "Platform") || "").trim();
    const outputType = String(f(row, "Platform_Output_Type") || "").trim();
    if (platform && outputType) index.set(`${platform}::${outputType}`, row);
  }
  return index;
}
/*__STUDIO_WORKER_END:item4MappingIndex__*/

export function item4PhotoCountKind(count) {
  return Math.max(0, Number(count) || 0) <= 1 ? "single-photo" : "multiple-photos";
}
/*__STUDIO_WORKER_END:item4PhotoCountKind__*/

export function item4ParseEzOrigin(record) {
  const text = [
    f(record, "Production_Notes"),
    f(record, "Output_Notes"),
    f(record, "Internal_Notes"),
    f(record, "Production_Request_Notes"),
  ].map((value) => String(value || "")).join("\n");
  const manual = Number(/ez-manual=(\d+)/i.exec(text)?.[1] || "");
  const ai = Number(/ez-ai=(\d+)/i.exec(text)?.[1] || "");
  return {
    inputKind: (/ez-input=([a-z0-9-]+)/i.exec(text)?.[1] || "").toLowerCase(),
    manualCount: Number.isFinite(manual) && manual > 0 ? Math.round(manual) : null,
    aiCount: Number.isFinite(ai) && ai > 0 ? Math.round(ai) : null,
  };
}
/*__STUDIO_WORKER_END:item4ParseEzOrigin__*/

export function item4MasterLooksLikeVideo(asset) {
  return item4LooksLikeVideoAsset(asset);
}
/*__STUDIO_WORKER_END:item4MasterLooksLikeVideo__*/

export function studioRewriteFinishedOriginNotes(existing, kind) {
  const nextKind = studioNormalizeFinishedOriginKind(kind);
  if (!nextKind) return String(existing || "");
  const az = /origin=az-finished-video/i.test(String(existing || "")) || /az-auto-queue=1/i.test(String(existing || ""));
  const stamp = az
    ? `origin=az-finished-video; ez-input=${nextKind}; ez-caption=ai; az-auto-queue=1`
    : `origin=ez-wizard; ez-input=${nextKind}; ez-caption=ai`;
  const text = String(existing || "").trim();
  if (!text) return stamp;
  if (new RegExp(`ez-input=${nextKind}(?:;|\\s|$)`, "i").test(text)) {
    if (az && !/origin=az-finished-video/i.test(text)) {
      return text.replace(/origin=ez-wizard/i, "origin=az-finished-video");
    }
    return text;
  }
  const replaced = text.replace(/ez-input=[a-z0-9-]+/i, `ez-input=${nextKind}`);
  if (replaced !== text) return replaced;
  return `${stamp}\n\n${text}`;
}
/*__STUDIO_WORKER_END:studioRewriteFinishedOriginNotes__*/

export function studioRewriteClipOriginNotes(existing, kind) {
  const nextKind = item4IsClipInputKind(kind) ? String(kind).trim().toLowerCase() : "photos-and-clips";
  const stamp = `origin=ez-wizard; ez-input=${nextKind}; ez-caption=ai`;
  const text = String(existing || "").trim();
  if (!text) return stamp;
  if (new RegExp(`ez-input=${nextKind}(?:;|\\s|$)`, "i").test(text)) return text;
  const replaced = text.replace(/ez-input=[a-z0-9-]+/i, `ez-input=${nextKind}`);
  if (replaced !== text) return replaced;
  return `${stamp}\n\n${text}`;
}
/*__STUDIO_WORKER_END:studioRewriteClipOriginNotes__*/

export function studioFinishedOriginKind(record) {
  // Vibe Cut is a music montage of one long source — never finished-file passthrough.
  if (studioIsVibeCut(record)) return "";
  const kind = item4ParseEzOrigin(record).inputKind;
  if (kind === "vibe-cut") return "";
  if (item4IsClipInputKind(kind)) return "";
  if (kind === "finished-stills" || kind === "finished-carousel") return kind;
  const assets = item4AssetManifest(record);
  const videos = assets.filter(item4MasterLooksLikeVideo);
  const photos = assets.filter((asset) => !item4MasterLooksLikeVideo(asset));
  if (videos.length > 1 || (videos.length && photos.length)) return "";
  if (kind === "finished-video") return kind;
  if (videos.length === 1 && photos.length === 0 && assets.length === 1) return "finished-video";
  return "";
}
/*__STUDIO_WORKER_END:studioFinishedOriginKind__*/

export function item4PlanHasVideo(record, assets) {
  if (item4HasVideoMasters(assets)) return true;
  if (item4IsClipInputKind(item4ParseEzOrigin(record).inputKind)) return true;
  const notes = [
    f(record, "Production_Notes"),
    f(record, "Output_Notes"),
    f(record, "Internal_Notes"),
    f(record, "Production_Request_Notes"),
  ].map((value) => String(value || "")).join("\n");
  if (/ez-input=photos-and-clips|ez-input=video-clips|ez-clips=\d+/i.test(notes)) return true;
  return studioFinishedOriginKind(record) === "finished-video";
}
/*__STUDIO_WORKER_END:item4PlanHasVideo__*/

export function studioNormalizeFinishedOriginKind(value) {
  const kind = String(value || "").trim().toLowerCase();
  if (kind === "finished-video" || kind === "finished-stills" || kind === "finished-carousel") return kind;
  return "";
}
/*__STUDIO_WORKER_END:studioNormalizeFinishedOriginKind__*/

export function studioIsFinishedPassthrough(record) {
  return Boolean(studioFinishedOriginKind(record));
}
/*__STUDIO_WORKER_END:studioIsFinishedPassthrough__*/

export function studioOutputTypeLabel(record) {
  return String(
    f(record, "Studio_Output_Type")
    || f(record, "Output_Type")
    || f(record, "Format")
    || f(record, "Platform_Output_Type")
    || ""
  ).trim();
}
/*__STUDIO_WORKER_END:studioOutputTypeLabel__*/

export function studioIsFinishedVideoFilePassthrough(record) {
  if (studioFinishedOriginKind(record) !== "finished-video") return false;
  return !studioAzIsStory(studioOutputTypeLabel(record));
}
/*__STUDIO_WORKER_END:studioIsFinishedVideoFilePassthrough__*/

export function item4FinishedStoryTeaserReady(record) {
  const notes = String(f(record, "Output_Notes") || "");
  const frames = Number(f(record, "Render_Total_Frames") || 0);
  const clips = item4ParseJson(f(record, "Render_Clip_List_JSON"), []);
  const keepAudio = Array.isArray(clips) && clips.some((clip) => clip?.keepSourceAudio || clip?.muted === false);
  return /story teaser|finished_story_teaser/i.test(notes)
    && /keep original audio|keepSourceAudio|first 10s/i.test(notes)
    && frames >= Math.round(FINISHED_STORY_TEASER_SECONDS * 30)
    && keepAudio
    && String(f(record, "Composition_ID") || "").trim() === "ChicagoShiningPhotoSequence";
}
/*__STUDIO_WORKER_END:item4FinishedStoryTeaserReady__*/

export function item4FinishedPublicUrl(asset) {
  return String(asset?.url || "").startsWith("https://media.chicagoshining.com/");
}
/*__STUDIO_WORKER_END:item4FinishedPublicUrl__*/

export function item4FinishedMasterReady(asset) {
  if (item4AssetCompressionPending(asset)) return false;
  if (item4FinishedPublicUrl(asset)) return true;
  return Boolean(String(asset?.google_drive_file_id || "").trim())
    && /^rec[A-Za-z0-9]+$/.test(String(asset?.media_asset_record_id || "").trim());
}
/*__STUDIO_WORKER_END:item4FinishedMasterReady__*/

export function item4FinishedVideoMastersReady(record, assets) {
  if (studioFinishedOriginKind(record) !== "finished-video") return false;
  return Array.isArray(assets) && assets.length > 0 && assets.every((asset) => item4FinishedMasterReady(asset));
}
/*__STUDIO_WORKER_END:item4FinishedVideoMastersReady__*/

export function studioFinishedVariantsSkipped(record) {
  if (!studioIsFinishedPassthrough(record)) return false;
  const status = String(f(record, "Studio_Variant_Status") || "").trim();
  return status === "Ready" || status === "Not Needed" || status === "None";
}
/*__STUDIO_WORKER_END:studioFinishedVariantsSkipped__*/

export function studioScheduleMs(value) {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
/*__STUDIO_WORKER_END:studioScheduleMs__*/

export function studioScheduleConflicts(ms, occupiedMs, gapMs = STUDIO_SCHEDULE_GAP_MS) {
  if (!Number.isFinite(ms)) return false;
  return (occupiedMs || []).some((other) => Number.isFinite(other) && Math.abs(other - ms) < gapMs);
}
/*__STUDIO_WORKER_END:studioScheduleConflicts__*/

export function studioNextOpenScheduleIso(candidateIso, occupiedMs, gapMs = STUDIO_SCHEDULE_GAP_MS, options = {}) {
  if (gapMs && typeof gapMs === "object") {
    options = gapMs;
    gapMs = STUDIO_SCHEDULE_GAP_MS;
  }
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  return maeNextOpenScheduleIso(candidateIso, occupiedMs, gapMs, {
    timeZone,
    now: options.now,
    occupiedMs: options.occupiedMs,
    platformOccupiedMs: options.platformOccupiedMs || occupiedMs,
    keepAnyNonClashing: options.keepAnyNonClashing === true,
  });
}
/*__STUDIO_WORKER_END:studioNextOpenScheduleIso__*/

export function studioOccupiedDateInWindowFormula(field, lookback, horizon) {
  return `AND({${field}}!="",IS_AFTER({${field}},DATETIME_PARSE("${lookback}")),IS_BEFORE({${field}},DATETIME_PARSE("${horizon}")))`;
}
/*__STUDIO_WORKER_END:studioOccupiedDateInWindowFormula__*/

export function studioOccupiedLinkedIds(value) {
  return arrayOrEmpty(value).map((item) => {
    if (typeof item === "string") return item.trim();
    return String(item?.id || "").trim();
  }).filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
}
/*__STUDIO_WORKER_END:studioOccupiedLinkedIds__*/

export function studioOccupiedCacheKey(profile) {
  return String(profile?.id || "").trim() || "_all";
}
/*__STUDIO_WORKER_END:studioOccupiedCacheKey__*/

export function studioOccupiedRowMatchesProfile(row, profile) {
  if (!profile?.id) return true;
  const profileIds = studioOccupiedLinkedIds(f(row, "Content_Profile"));
  if (profileIds.includes(profile.id)) return true;
  const brandId = studioFirstLinkedId(f(profile, "Brand"));
  if (brandId && studioOccupiedLinkedIds(f(row, "Brand")).includes(brandId)) return true;
  return false;
}
/*__STUDIO_WORKER_END:studioOccupiedRowMatchesProfile__*/

export function studioOccupiedFilterFormula(now = Date.now(), profile = null) {
  const lookback = airtableFormulaEscape(new Date(now - STUDIO_OCCUPIED_LOOKBACK_MS - 1000).toISOString());
  const horizon = airtableFormulaEscape(new Date(now + STUDIO_OCCUPIED_HORIZON_MS).toISOString());
  const dates = ["Scheduled_Post_Date", "YouTube_Scheduled_Publish_At", "Studio_Scheduled_At"]
    .map((field) => studioOccupiedDateInWindowFormula(field, lookback, horizon))
    .join(",");
  // Every clause must be inside the 12h lookback → horizon. Undated
  // ready-to-publish and publishing rows used to sort oldest-first and fill the
  // row cap. Those fell outside the window, today's MAE slots looked empty, and
  // every new stamp piled onto the next morning.
  // Published rows stay in the window: a morning that already went out is still a post.
  // Occupancy is per profile × platform × output type (Stories have their own lane).
  const base = `AND({Test_Run_ID}=BLANK(),{Do_Not_Publish}=0,OR(${dates}))`;
  const profileFormula = contentProfileFilterFormula(profile);
  return profileFormula ? `AND(${profileFormula},${base})` : base;
}
/*__STUDIO_WORKER_END:studioOccupiedFilterFormula__*/

export function studioOccupiedCacheSlot(profile) {
  const key = studioOccupiedCacheKey(profile);
  if (!studioOccupiedScheduleCaches.has(key)) {
    studioOccupiedScheduleCaches.set(key, { at: 0, rows: null, inflight: null });
  }
  return studioOccupiedScheduleCaches.get(key);
}
/*__STUDIO_WORKER_END:studioOccupiedCacheSlot__*/

export function studioInvalidateOccupiedScheduleCache() {
  studioOccupiedScheduleCaches.clear();
}
/*__STUDIO_WORKER_END:studioInvalidateOccupiedScheduleCache__*/

export function studioOccupiedMsFromRow(row, now = Date.now()) {
  const raw = f(row, "Scheduled_Post_Date") || f(row, "YouTube_Scheduled_Publish_At") || f(row, "Studio_Scheduled_At");
  const ms = raw ? studioScheduleMs(raw) : null;
  // An old Ready to Publish row is not "right now". Mapping it to Date.now()
  // blocked whatever MAE slot was within 3 hours and left 5:30 AM looking free.
  if (ms == null) return null;
  if (ms >= now - STUDIO_OCCUPIED_LOOKBACK_MS && ms <= now + STUDIO_OCCUPIED_HORIZON_MS) return ms;
  return null;
}
/*__STUDIO_WORKER_END:studioOccupiedMsFromRow__*/

export async function studioLoadOccupiedScheduleRows(env, { profile = null } = {}) {
  const now = Date.now();
  const cache = studioOccupiedCacheSlot(profile);
  if (cache.rows && now - cache.at < STUDIO_OCCUPIED_CACHE_MS) {
    return cache.rows;
  }
  if (cache.inflight) return cache.inflight;
  cache.inflight = listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: STUDIO_OCCUPIED_LIST_LIMIT,
    sortField: "Scheduled_Post_Date",
    sortDirection: "asc",
    filterFormula: studioOccupiedFilterFormula(now, profile),
    // Platform Outputs has Content_Profile (lookup) but no Brand field.
    // Requesting Brand 422s Airtable and 500s calendar Save Schedule.
    fields: ["Platform", "Scheduled_Post_Date", "YouTube_Scheduled_Publish_At", "Studio_Scheduled_At", "Publish_Status", "Studio_Output_Type", "Format", "Content_Profile"],
  }).then((rows) => {
    cache.at = Date.now();
    cache.rows = rows || [];
    cache.inflight = null;
    return cache.rows;
  }).catch((error) => {
    cache.inflight = null;
    console.warn("occupied schedule occupancy read failed", error);
    if (Array.isArray(cache.rows)) return cache.rows;
    return [];
  });
  return cache.inflight;
}
/*__STUDIO_WORKER_END:studioLoadOccupiedScheduleRows__*/

export async function studioLoadOccupiedSchedules(env, { excludeIds = [], profile = null } = {}) {
  const skip = new Set((excludeIds || []).filter(Boolean));
  const rows = await studioLoadOccupiedScheduleRows(env, { profile });
  const now = Date.now();
  const byLane = {};
  for (const row of rows || []) {
    if (skip.has(row.id)) continue;
    if (!studioOccupiedRowMatchesProfile(row, profile)) continue;
    const platform = String(f(row, "Platform") || "").trim();
    if (!platform) continue;
    const outputType = String(f(row, "Studio_Output_Type") || f(row, "Format") || "").trim();
    const lane = maeScheduleLaneKey(platform, outputType) || platform.toLowerCase();
    const ms = studioOccupiedMsFromRow(row, now);
    if (ms == null) continue;
    (byLane[lane] ||= []).push(ms);
  }
  return byLane;
}
/*__STUDIO_WORKER_END:studioLoadOccupiedSchedules__*/

export function studioPublishScheduleFields(payload = {}, record = null, options = {}) {
  const occupiedMs = Array.isArray(options.occupiedMs) ? options.occupiedMs : null;
  const timeZone = maeNormalizeTimeZone(options.timeZone || payload?.timezone || payload?.time_zone);
  const raw = payload?.scheduled_post_date;
  const immediate = raw === undefined || raw === null || String(raw).trim() === "" || String(raw).trim().toLowerCase() === "immediate";
  const exactOverride = options.exactOverride === true && !immediate;
  // A Story companion is main + 10 minutes. That clock time is not an MAE
  // slot, and it sits inside the 3-hour gap of its Reel. Snapping it back to
  // the next open MAE slot is what published every Story at the same 11:30.
  const storyCompanion = options.storyCompanion === true && !immediate;
  let requestedIso = "";
  if (immediate) {
    requestedIso = new Date().toISOString();
  } else {
    const value = String(raw).trim();
    if (Number.isNaN(Date.parse(value))) throw new HttpError(400, "Scheduled date/time is invalid");
    requestedIso = new Date(value).toISOString();
  }
  const requestedMs = Date.parse(requestedIso);
  const blackout = maeIsBlackoutLocalTime(requestedMs, timeZone);
  const offMae = !immediate && !maeIsPriorityLocalTime(requestedMs, timeZone);
  const conflict = Boolean(occupiedMs) && maeScheduleConflicts(requestedMs, occupiedMs);
  let resolvedIso = requestedIso;
  if (storyCompanion) {
    const advanced = maeAdvancePastBlackout(requestedMs, timeZone);
    resolvedIso = new Date(advanced).toISOString();
  } else if (!immediate && !(exactOverride && !blackout) && (blackout || offMae || conflict)) {
    resolvedIso = studioNextOpenScheduleIso(requestedIso, occupiedMs || [], STUDIO_SCHEDULE_GAP_MS, { timeZone }) || requestedIso;
    if (maeIsBlackoutLocalTime(Date.parse(resolvedIso), timeZone)) {
      resolvedIso = maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, new Date(), {
        occupiedMs: occupiedMs || [],
        platformOccupiedMs: occupiedMs || [],
        timeZone,
      }) || resolvedIso;
    }
  }
  const bumped = Date.parse(resolvedIso) - Date.parse(requestedIso) >= 60 * 1000;
  if (immediate && !bumped && !options.forceWrite) return {};
  const iso = resolvedIso;
  const due = Date.parse(iso) <= Date.now() + 120000;
  const fields = {
    Scheduled_Post_Date: iso,
    Publish_Status: due ? "Ready to Publish" : "Ready to Schedule",
  };
  if (exactOverride) fields.Studio_Scheduled_At = iso;
  const platform = String(f(record, "Platform") || "").trim();
  if (platform === "YouTube") {
    fields.YouTube_Scheduled_Publish_At = iso;
    // Desired end-state is public. Upload path coerces to private+publishAt for
    // the YouTube API; the channel releases publicly at the scheduled time.
    fields.YouTube_Privacy_Status = "public";
  }
  if (platform === "TikTok") {
    const draft = String(f(record, "TikTok_Draft_Status") || "").trim();
    if (!draft || draft === "Ready for Assets" || draft === "Waiting for Schedule" || draft === "Not Selected") {
      fields.TikTok_Draft_Status = studioTikTokArmedDraftStatus(
        { fields: { ...(record?.fields || {}), Scheduled_Post_Date: iso } },
        iso,
      );
    }
  }
  return fields;
}
/*__STUDIO_WORKER_END:studioPublishScheduleFields__*/

export function studioStorySiblingStamp(row) {
  if (!row) return null;
  const platform = String(row.platform || f(row, "Platform") || "").trim();
  const outputType = String(row.output_type || f(row, "Studio_Output_Type") || f(row, "Format") || "").trim();
  const scheduled = String(
    row.scheduled_at
    || f(row, "Scheduled_Post_Date")
    || f(row, "YouTube_Scheduled_Publish_At")
    || ""
  ).trim();
  if (!platform || !outputType) return null;
  return { platform, output_type: outputType, scheduled_at: scheduled };
}
/*__STUDIO_WORKER_END:studioStorySiblingStamp__*/

export async function studioResolveStoryPublishIso(env, record, options = {}) {
  const platform = String(f(record, "Platform") || "").trim();
  const timeZone = maeNormalizeTimeZone(options.timeZone);
  const notBeforeMs = Date.now() + (options.leadMs ?? MAE_SUGGEST_LEAD_MS);
  let siblingRows = options.siblingRows;
  if (!siblingRows) {
    const contentId = studioFirstLinkedId(f(record, "Content_Item"));
    siblingRows = contentId
      ? await loadContentPlatformOutputs(env, contentId).catch((error) => {
        console.warn("story companion sibling read failed", record?.id, error);
        return [];
      })
      : [];
  }
  const siblings = [];
  for (const extra of options.extraSiblings || []) {
    const stamp = studioStorySiblingStamp(extra);
    if (stamp) siblings.push(stamp);
  }
  for (const row of siblingRows || []) {
    if (row?.id && row.id === record?.id) continue;
    const stamp = studioStorySiblingStamp(row);
    if (stamp) siblings.push(stamp);
  }
  const lane = Array.isArray(options.occupiedMs) ? options.occupiedMs : [];
  const occupiedMaeIso = options.allowMaeFallback === false
    ? ""
    : (maePickBalancedSuggestedIso(MAE_PRIORITY_SCHEDULE_WINDOWS, new Date(), {
      occupiedMs: lane,
      platformOccupiedMs: lane,
      timeZone,
    }) || "");
  return maeResolveStorySchedule({
    platform,
    siblings,
    requestedIso: options.requestedIso || "",
    existingIso: options.existingIso || "",
    notBeforeMs,
    occupiedMaeIso,
    timeZone,
    allowMaeFallback: options.allowMaeFallback !== false,
  });
}
/*__STUDIO_WORKER_END:studioResolveStoryPublishIso__*/

export function studioPublishScheduledMs(record) {
  const raw = String(f(record, "Scheduled_Post_Date") || "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}
/*__STUDIO_WORKER_END:studioPublishScheduledMs__*/

export function studioPublishIsDue(record, graceMs = 120000) {
  const ms = studioPublishScheduledMs(record);
  if (ms == null) return true;
  return ms <= Date.now() + graceMs;
}
/*__STUDIO_WORKER_END:studioPublishIsDue__*/

export function studioPublishCanDispatchNow(record) {
  const platform = String(f(record, "Platform") || "").trim();
  if (platform === "TikTok") return studioTikTokInboxIsDue(record);
  if (studioPublishIsDue(record)) return true;
  // YouTube can upload now and let the channel release at publishAt.
  return platform === "YouTube" && Boolean(String(f(record, "YouTube_Scheduled_Publish_At") || "").trim());
}
/*__STUDIO_WORKER_END:studioPublishCanDispatchNow__*/

export async function studioPromoteDuePublishStatus(env, record) {
  const id = String(record?.id || "").trim();
  if (!id) return record;
  const platform = String(f(record, "Platform") || "").trim();
  const tiktok = String(f(record, "TikTok_Draft_Status") || "").trim();
  const fields = {};
  if (
    String(f(record, "Review_Status") || "").trim() === "Approved"
    && String(f(record, "Output_Status") || "").trim() !== "Approved for Publishing"
    && String(f(record, "Output_Status") || "").trim() !== "Published"
  ) {
    fields.Output_Status = "Approved for Publishing";
  }
  if (platform === "TikTok" && tiktok === "Waiting for Schedule" && studioTikTokInboxIsDue(record)) {
    fields.TikTok_Draft_Status = "Ready for Assets";
  }
  const status = String(f(record, "Publish_Status") || "").trim();
  if (status !== "Ready to Publish" && status !== "Publishing" && status !== "Published"
    && studioArmedPublishStatus(record) === "Ready to Publish") {
    fields.Publish_Status = "Ready to Publish";
    if (tiktok === "Waiting for Schedule") fields.TikTok_Draft_Status = "Ready for Assets";
  } else if (!Object.keys(fields).length) {
    return record;
  }
  const outputType = String(f(record, "Platform_Output_Type") || "").trim();
  const storyStatus = String(f(record, "IG_Story_Status") || "").trim();
  if (outputType === "Instagram Story" && (!storyStatus || storyStatus === "Not Needed")) {
    fields.IG_Story_Status = "Ready";
  }
  try {
    return await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
  } catch (error) {
    console.warn("due publish-status promote failed", id, error);
    return record;
  }
}
/*__STUDIO_WORKER_END:studioPromoteDuePublishStatus__*/

export function studioPublishHeldUntilIso(record) {
  const ms = studioPublishScheduledMs(record);
  return ms == null ? "" : new Date(ms).toISOString();
}
/*__STUDIO_WORKER_END:studioPublishHeldUntilIso__*/

export function item4EffectivePhotoCount(record, assets) {
  const n = Array.isArray(assets) ? assets.length : 0;
  const origin = item4ParseEzOrigin(record);
  if (origin.manualCount && origin.aiCount) return origin.manualCount + origin.aiCount;
  if (origin.inputKind === "mixed" && (origin.manualCount || origin.aiCount)) {
    return Math.max(n, (origin.manualCount || 0) + (origin.aiCount || 0));
  }
  const mode = String(f(record, "Carousel_Image_Mode") || "").trim();
  const exact = Number(f(record, "Carousel_Slide_Count_Exact") || 0);
  const plan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  const planCount = Number(plan?.source_asset_count || 0);
  // Mixed / AI plans keep Make AI Generated with an exact total. Wait for that
  // total even after some masters are uploaded — otherwise 3+3 collapses to 3.
  if (mode === "Make AI Generated" && Number.isFinite(exact) && exact > n) return exact;
  if (mode === "Make AI Generated" && Number.isFinite(planCount) && planCount > n) return planCount;
  if (!n && mode === "Make AI Generated" && Number.isFinite(exact) && exact >= 1) return exact;
  return n;
}
/*__STUDIO_WORKER_END:item4EffectivePhotoCount__*/

export function item4StudioDirectiveYes(value) {
  return String(value || "").trim() !== "No";
}
/*__STUDIO_WORKER_END:item4StudioDirectiveYes__*/

export function item4ThumbnailSource(value) {
  const v = String(value || "").trim();
  if (v === "No") return "none";
  if (/^use photo frame$/i.test(v) || /^photo frame$/i.test(v)) return "frame";
  return "ai";
}
/*__STUDIO_WORKER_END:item4ThumbnailSource__*/

export function item4UrlIsStudioPhotoCrop(url) {
  return /ITEM4-VARIANT-fill-crop/i.test(String(url || ""));
}
/*__STUDIO_WORKER_END:item4UrlIsStudioPhotoCrop__*/

export function studioUrlLooksLikeVideoFile(url) {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(String(url || "").trim());
}
/*__STUDIO_WORKER_END:studioUrlLooksLikeVideoFile__*/

export function studioUrlLooksLikeDriveFetch(url) {
  const href = String(url || "").trim();
  if (!href) return false;
  return /drive\.google\.com/i.test(href)
    || /\/uc\?id=/i.test(href)
    || /googleusercontent\.com/i.test(href);
}
/*__STUDIO_WORKER_END:studioUrlLooksLikeDriveFetch__*/

export function studioAiThumbnailUrl(value) {
  const url = String(value || "").trim();
  if (!url || item4UrlIsStudioPhotoCrop(url)) return "";
  if (studioUrlLooksLikeVideoFile(url) || studioUrlLooksLikeDriveFetch(url)) return "";
  if (/\/studio\/previews\/clip-posters\//i.test(url)) return "";
  if (!/^https:\/\/media\.chicagoshining\.com\/(publish|studio\/previews)\//i.test(url)) return "";
  return url;
}
/*__STUDIO_WORKER_END:studioAiThumbnailUrl__*/

export function studioNeedsAiThumbnail(parent, requestRecord) {
  const mode = String(f(requestRecord || {}, "Thumbnail_Mode") || f(parent || {}, "Include_Thumbnail") || "Yes").trim();
  if (item4ThumbnailSource(mode) !== "ai") return false;
  if (String(f(parent || {}, "Include_Thumbnail") || "").trim() === "No") return false;
  return !studioAiThumbnailUrl(f(parent || {}, "Thumbnail_URL"));
}
/*__STUDIO_WORKER_END:studioNeedsAiThumbnail__*/

export async function studioStampParentAiCoverOnOutput(env, po, parent) {
  const ai = studioAiThumbnailUrl(f(parent || {}, "Thumbnail_URL"));
  const caption = String(f(parent || {}, "Caption") || "").trim();
  const currentCaption = String(f(po, "Output_Caption") || "").trim();
  const needsCaption = Boolean(caption && !currentCaption);
  if (!po?.id) return false;
  const current = String(f(po, "Thumbnail_URL") || "").trim();
  const currentDesigned = studioAiThumbnailUrl(current);
  if (ai && currentDesigned === ai) {
    const native = studioOutputIsNativePhotoRoute(
      f(po, "Platform"),
      f(po, "Studio_Output_Type"),
      f(po, "Platform_Output_Type")
    );
    const isStory = String(f(po, "Studio_Output_Type") || "").trim() === "Story";
    if (!(native && !isStory && !/^ready for review$/i.test(String(f(po, "Output_Status") || ""))) && !needsCaption) return false;
  }
  if (!ai && !needsCaption) return false;
  const native = studioOutputIsNativePhotoRoute(
    f(po, "Platform"),
    f(po, "Studio_Output_Type"),
    f(po, "Platform_Output_Type")
  );
  const isStory = String(f(po, "Studio_Output_Type") || "").trim() === "Story";
  const coverMismatch = Boolean(ai && current !== ai);
  if (ai && currentDesigned && currentDesigned !== ai && !native && coverMismatch && !needsCaption
      && !/^ready for review$/i.test(String(f(po, "Output_Status") || ""))) return false;
  const fields = {};
  if (coverMismatch && (native || !current || !currentDesigned || item4UrlIsStudioPhotoCrop(current) || /^ready for review$/i.test(String(f(po, "Output_Status") || "")))) {
    fields.Thumbnail_URL = ai;
  }
  if (needsCaption) fields.Output_Caption = caption;
  if (native && !isStory && !/^ready for review$/i.test(String(f(po, "Output_Status") || ""))) {
    fields.Output_Status = "Ready for Review";
  }
  if (!Object.keys(fields).length) return false;
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, po.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
  return true;
}
/*__STUDIO_WORKER_END:studioStampParentAiCoverOnOutput__*/

export function studioCoverContentStatusFields(parent) {
  const status = String(f(parent, "Content_Status") || "").trim();
  const vo = String(f(parent, "Voiceover_URL") || "").trim();
  if (/^ready for voiceover$/i.test(status) && !vo) return {};
  return { Content_Status: "Thumbnail Ready" };
}
/*__STUDIO_WORKER_END:studioCoverContentStatusFields__*/

export async function studioEnsurePublicAiCover(env, parent, requestRecord = null) {
  if (!parent?.id) return { url: "", skip: "missing_parent" };
  const existing = studioAiThumbnailUrl(f(parent, "Thumbnail_URL"));
  if (existing) return { url: existing, staged: false };
  const source = String(f(parent, "Thumbnail_URL") || "").trim();
  const driveId = String(f(parent, "Thumbnail_Google_Drive_File_ID") || "").trim();
  if (!source && !driveId && !studioNeedsAiThumbnail(parent, requestRecord)) {
    return { url: "", skip: "thumbnail_not_required" };
  }
  if (!source && !driveId) return { url: "", skip: "no_thumbnail_source" };
  const staged = await azStagePublicCoverFromSource(env, parent, source, driveId);
  if (!staged.url) return { url: "", skip: staged.skip || "stage_failed" };
  await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parent.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Thumbnail_URL: staged.url,
        Thumbnail_Status: "Generated",
        Include_Thumbnail: "Yes",
        ...studioCoverContentStatusFields(parent),
      },
      typecast: true,
    }),
  });
  return { url: staged.url, staged: true };
}
/*__STUDIO_WORKER_END:studioEnsurePublicAiCover__*/

export async function studioStampPackageReviewCovers(env, parent, outputs) {
  let stamped = 0;
  for (const row of outputs || []) {
    const changed = await studioStampParentAiCoverOnOutput(env, row, parent).catch(() => false);
    if (changed) stamped += 1;
  }
  return stamped;
}
/*__STUDIO_WORKER_END:studioStampPackageReviewCovers__*/

export async function studioHealRfrMissingDeliverable(env, options = {}) {
  const limit = Math.max(1, Math.min(12, Number(options.limit) || 8));
  const rows = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: STUDIO_RFR_MISSING_COVER_FORMULA,
  }).catch((error) => {
    console.warn("rfr missing-deliverable heal scan failed", error);
    return [];
  });
  const results = [];
  const cache = { parents: new Map(), requests: new Map(), packages: new Map() };
  for (const po of rows || []) {
    const parentId = studioFirstLinkedId(f(po, "Content_Item"));
    if (!parentId) continue;
    try {
      if (!cache.parents.has(parentId)) {
        cache.parents.set(parentId, await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId));
      }
      let parent = cache.parents.get(parentId);
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
      const ensured = await studioEnsurePublicAiCover(env, parent, requestRecord);
      if (ensured.url) {
        parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId);
        cache.parents.set(parentId, parent);
      }
      if (!cache.packages.has(parentId)) {
        cache.packages.set(parentId, await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
          limit: 12,
          filterFormula: `AND({Test_Run_ID}=BLANK(),FIND("${parentId}", ARRAYJOIN({Content_Item})))`,
        }).catch(() => [po]));
      }
      const siblings = cache.packages.get(parentId) || [po];
      const stamped = await studioStampPackageReviewCovers(env, parent, siblings);
      const stillMissing = studioNeedsAiThumbnail(parent, requestRecord)
        || siblings.some((row) => studioOutputNeedsGridCoverForReview(row) && !studioAiThumbnailUrl(f(row, "Thumbnail_URL")));
      if (stillMissing && requestId) {
        await enqueueStudioProductionJob(env, requestId, { resume: true }).catch(() => null);
        await pulseStudioP2Handoff(env, parentId, requestRecord).catch(() => null);
      }
      results.push({
        id: po.id,
        output_id: f(po, "Output_ID"),
        cover: ensured.url || null,
        staged: Boolean(ensured.staged),
        stamped,
        skip: ensured.skip || null,
        resumed: Boolean(stillMissing && requestId),
      });
    } catch (error) {
      results.push({
        id: po.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (results.length) console.log("Studio rfr missing-deliverable heal", JSON.stringify({ count: results.length, results }));
  return results;
}
/*__STUDIO_WORKER_END:studioHealRfrMissingDeliverable__*/

export function item4StudioThumbnailPrompt(requestRecord, parent) {
  const existing = String(f(parent, "Thumbnail_Prompt") || "").trim();
  if (existing) return existing;
  const title = String(
    f(requestRecord, "Requested_Title")
    || f(parent, "Content_Title")
    || f(parent, "Hook")
    || "Chicago"
  ).trim();
  const caption = String(
    f(requestRecord, "Requested_Caption")
    || f(parent, "Caption")
    || f(parent, "Idea_Summary")
    || ""
  ).trim();
  const concept = String(f(parent, "Thumbnail_Concept") || "").trim();
  return [
    `Create a ChicagoShining social thumbnail / promo still for: ${title}.`,
    caption ? `Post context: ${caption.slice(0, 500)}` : "",
    concept ? `Thumbnail concept: ${concept}` : "",
    "Photorealism: the scene must look like a real photograph (natural camera, real light, real textures). Do not make it illustrated, CGI, painterly, plastic, or luxury-ad composite. Lettering mix: for at least ~80% of covers use restrained gold or black-and-gold block lettering — soft brushed or matte gold, or black letters with a thin gold edge. Quiet and sophisticated; keep lettering secondary to the photo. Do not use chrome, mirror-foil, glow, sparkle, giant arched 3D slabs, or gold-on-everything. Use colorful glossy 3D block lettering for at most ~20% of covers, and only when the subject clearly calls for high-energy playful treatment. Do not default to bright multicolor candy 3D letters.",
    "Text must be large and readable on a phone, near the center or slightly below center, inside safe margins, and not in the top or bottom 10%. Do not let lettering dominate the frame.",
    "Photorealistic and readable. Do not invent logos, watermarks, platform UI, or distorted letters.",
  ].filter(Boolean).join("\n");
}
/*__STUDIO_WORKER_END:item4StudioThumbnailPrompt__*/

export function item4SlideImageUrl(row) {
  return String(f(row, "Final Image URL") || f(row, "AI Image URL") || f(row, "Current Image URL") || "").trim();
}
/*__STUDIO_WORKER_END:item4SlideImageUrl__*/

export function item4PackageOverrides(packageId, photoCount, { hasVideo = false } = {}) {
  const pkg = String(packageId || "").trim().toLowerCase();
  if (pkg === "video") {
    return { ...ITEM4_VIDEO_DEFAULTS };
  }
  if (pkg === "slides") {
    if (hasVideo) return { ...ITEM4_VIDEO_DEFAULTS };
    if (Math.max(0, Number(photoCount) || 0) <= 1) {
      return { Instagram: "Single Image", Facebook: "Single Image", TikTok: "Single Photo" };
    }
    return { Instagram: "Carousel", Facebook: "Multi-Image Post", TikTok: "Multi-Photo", YouTube: "Slideshow Video" };
  }
  return null;
}
/*__STUDIO_WORKER_END:item4PackageOverrides__*/

export function item4ResolvePackageId(record, payloadPackage = "") {
  const fromPayload = String(payloadPackage || "").trim().toLowerCase();
  if (fromPayload === "video" || fromPayload === "slides" || fromPayload === "custom") return fromPayload;
  const notes = String(f(record, "Production_Notes") || "");
  const fromNotes = /ez-package=(video|slides|custom)/i.exec(notes)?.[1];
  if (fromNotes) return String(fromNotes).toLowerCase();
  const contentType = String(f(record, "Master_Content_Type") || "").trim();
  if (contentType === "Carousel" || contentType === "Feed Post") return "slides";
  if (contentType === "Vertical Short Video" || contentType === "Longform Video" || contentType === "Photo Set" || contentType === "Story") {
    return "video";
  }
  return "";
}
/*__STUDIO_WORKER_END:item4ResolvePackageId__*/

export function item4DefaultOutputType(platform, photoCount, { hasVideo = false, packageId = "" } = {}) {
  const packaged = item4PackageOverrides(packageId, photoCount, { hasVideo });
  if (packaged) return packaged[platform] || null;
  if (hasVideo) return ITEM4_VIDEO_DEFAULTS[platform] || null;
  const n = Math.max(0, Number(photoCount) || 0);
  const single = Object.freeze({ Instagram: "Single Image", Facebook: "Single Image", TikTok: "Single Photo" });
  const multiple = Object.freeze({ Instagram: "Reel", Facebook: "Reel", TikTok: "Video Draft", YouTube: "Short" });
  const map = n <= 1 ? single : multiple;
  return map[platform] || null;
}
/*__STUDIO_WORKER_END:item4DefaultOutputType__*/

export function item4CanonicalOutputType(platform, outputType) {
  return String(outputType || "").trim();
}
/*__STUDIO_WORKER_END:item4CanonicalOutputType__*/

export function item4IsCompanionOutputType(outputType) {
  return String(outputType || "").trim() === "Story";
}
/*__STUDIO_WORKER_END:item4IsCompanionOutputType__*/

export function item4IsUnsupportedCompanion(platform, outputType) {
  return String(platform || "").trim() === "TikTok" && item4IsCompanionOutputType(outputType);
}
/*__STUDIO_WORKER_END:item4IsUnsupportedCompanion__*/

export function item4ResolvedVideoDurationSeconds({ storyTeaser, clipCount, effective, requestRecord, outputRow }) {
  const outputOverride = Number(f(outputRow || {}, "Video_Duration_Seconds_Override") || 0);
  if (Number.isFinite(outputOverride) && outputOverride > 0) {
    return storyTeaser ? Math.min(15, outputOverride) : outputOverride;
  }
  if (storyTeaser) {
    return ITEM4_STORY_TEASER_SECONDS;
  }
  const stored = Number(effective?.video_duration_seconds || f(requestRecord, "Video_Duration_Seconds") || 0);
  // Owner-set duration on the Production Request (including 30) is authoritative for the main video.
  if (Number.isFinite(stored) && stored > 0) return stored;
  if (clipCount <= 1) return ITEM4_SINGLE_STILL_SECONDS;
  return Math.min(30, Math.max(clipCount * 3, 9));
}
/*__STUDIO_WORKER_END:item4ResolvedVideoDurationSeconds__*/

export function item4CompanionStoryFields(outputType, { finishedVideo = false } = {}) {
  if (!item4IsCompanionOutputType(outputType)) return {};
  if (finishedVideo) return finishedCompanionStoryFields();
  return {
    Voiceover_Mode_Override: "No",
    Background_Music_Mode_Override: "Yes",
    Video_Duration_Seconds_Override: ITEM4_STORY_TEASER_SECONDS,
    Video_Clip_Count_Mode_Override: "Exact",
    Video_Clip_Count_Exact_Override: 1,
  };
}
/*__STUDIO_WORKER_END:item4CompanionStoryFields__*/

export function item4RowHasPlatformOutput(row) {
  return arrayOrEmpty(f(row, "Platform_Output")).some((id) => /^rec[A-Za-z0-9]+$/.test(String(id || "")));
}
/*__STUDIO_WORKER_END:item4RowHasPlatformOutput__*/

export function item4PlatformOutputHasPublishedIdentity(row) {
  const outputStatus = String(f(row, "Output_Status") || "").trim().toLowerCase();
  const publishStatus = String(f(row, "Publish_Status") || "").trim().toLowerCase();
  if (outputStatus === "published" || publishStatus.includes("published") || publishStatus.includes("success")) return true;
  return [
    "Platform_Post_URL",
    "Platform_Post_ID",
    "Instagram_Media_ID",
    "Facebook_Post_ID",
    "TikTok_Post_ID",
    "TikTok_Video_ID",
    "YouTube_Video_ID",
    "Published_At",
  ].some((name) => Boolean(String(f(row, name) || "").trim()));
}
/*__STUDIO_WORKER_END:item4PlatformOutputHasPublishedIdentity__*/

export async function item4ReconcileCreatedPlatformOutput(env, outputRow, createdPo) {
  const rawProId = String(f(outputRow, "Production_Request_Output_ID") || "").trim();
  if (!rawProId || !createdPo?.id) return { keeper: createdPo, deleted_ids: [], unsafe_extra_ids: [] };
  const proId = rawProId.replace(/'/g, "\\'");
  const rows = await listRecords(env, STUDIO_PLATFORM_OUTPUT_TABLE, {
    limit: 10,
    filterFormula: `FIND(',${proId},', ',' & ARRAYJOIN({Production_Request_Output}) & ',') > 0`,
  });
  if (!rows || rows.length <= 1) return { keeper: rows?.[0] || createdPo, deleted_ids: [], unsafe_extra_ids: [] };

  const ranked = rows.map((row) => ({
    ...row,
    output_id: Number(f(row, "Output_ID") || 0),
    published: item4PlatformOutputHasPublishedIdentity(row),
    created_at: String(row?.createdTime || ""),
  }));
  const { keeper, extras } = pickPlatformOutputSeedKeeper(ranked);
  if (!keeper?.id) return { keeper: createdPo, deleted_ids: [], unsafe_extra_ids: [] };

  const deletedIds = [];
  const unsafeExtraIds = [];
  for (const extra of extras) {
    if (!extra?.id || extra.id === keeper.id) continue;
    if (item4PlatformOutputHasPublishedIdentity(extra)) {
      unsafeExtraIds.push(extra.id);
      continue;
    }
    await airtableFetch(env, STUDIO_PLATFORM_OUTPUT_TABLE, extra.id, { method: "DELETE" });
    deletedIds.push(extra.id);
  }
  if (deletedIds.length || unsafeExtraIds.length) {
    console.warn(`Platform Output fanout dedupe ${JSON.stringify({
      production_request_output_id: rawProId,
      keeper: keeper.id,
      deleted: deletedIds,
      preserved_published: unsafeExtraIds,
    })}`);
  }
  return { keeper, deleted_ids: deletedIds, unsafe_extra_ids: unsafeExtraIds };
}
/*__STUDIO_WORKER_END:item4ReconcileCreatedPlatformOutput__*/

export async function item4CollapseDuplicatePlanOutputs(env, rows, { finishedVideo = false } = {}) {
  const mapped = (rows || []).map((row) => ({
    id: row.id,
    row,
    platform: String(f(row, "Platform") || "").trim(),
    output_type: String(f(row, "Output_Type") || "").trim(),
    has_platform_output: item4RowHasPlatformOutput(row),
    output_order: Number(f(row, "Output_Order") || 0),
    created_at: String(f(row, "Created_At") || ""),
  }));
  const { extras } = pickDuplicateOutputKeepers(mapped, finishedVideo
    ? { keyOf: (row) => canonicalFinishedDestinationKey(row.platform, row.output_type) }
    : {});
  const now = new Date().toISOString();
  let collapsed = 0;
  for (const extra of extras) {
    const poIds = arrayOrEmpty(f(extra.row, "Platform_Output"));
    await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, extra.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Enabled: false, Active: false, Updated_At: now },
        typecast: false,
      }),
    });
    for (const poId of poIds) {
      if (!/^rec[A-Za-z0-9]+$/.test(String(poId || ""))) continue;
      await airtableFetch(env, STUDIO_PLATFORM_OUTPUT_TABLE, poId, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Output_Status: "Cancelled",
            Do_Not_Publish: true,
            Output_Notes: [
              String(f(extra.row, "Output_Notes") || "").trim(),
              "Cancelled duplicate platform kit row.",
            ].filter(Boolean).join("\n"),
          },
          typecast: true,
        }),
      }).catch(() => null);
    }
    collapsed += 1;
  }
  return { collapsed, extra_ids: extras.map((item) => item.id) };
}
/*__STUDIO_WORKER_END:item4CollapseDuplicatePlanOutputs__*/

export function item4NormalizePlanExtras(payloadExtras, platforms, existingItems = []) {
  const allowed = new Set((Array.isArray(platforms) ? platforms : []).map((platform) => String(platform || "").trim()).filter(Boolean));
  const extras = [];
  const seen = new Set((Array.isArray(existingItems) ? existingItems : []).map((item) => item4BridgePlanKey(item?.platform, item?.output_type)));
  for (const pair of Array.isArray(payloadExtras) ? payloadExtras : []) {
    let platform = "";
    let outputType = "";
    if (typeof pair === "string" && pair.includes("::")) {
      const [left, right] = pair.split("::", 2);
      platform = String(left || "").trim();
      outputType = item4CanonicalOutputType(platform, right);
    } else if (pair && typeof pair === "object") {
      platform = String(pair.platform || "").trim();
      outputType = item4CanonicalOutputType(platform, pair.output_type);
    }
    if (!platform || !ITEM4_PLAN_SPECS[platform]?.options?.[outputType] || item4IsUnsupportedCompanion(platform, outputType)) continue;
    if (allowed.size && !allowed.has(platform)) continue;
    const key = item4BridgePlanKey(platform, outputType);
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push({
      platform,
      output_type: outputType,
      companion: item4IsCompanionOutputType(outputType),
    });
  }
  return extras;
}
/*__STUDIO_WORKER_END:item4NormalizePlanExtras__*/

export function item4PlanChoice(platform, requestedOutputType, photoCount, { hasVideo = false, packageId = "" } = {}) {
  const spec = ITEM4_PLAN_SPECS[platform];
  if (!spec) throw new HttpError(400, `Item 4 does not support ${platform}`);
  let requested = item4CanonicalOutputType(platform, String(requestedOutputType || "").trim());
  if (hasVideo && platform === "Facebook" && requested === "Slideshow Reel") requested = "Reel";
  if (hasVideo && item4IsNativeStillOutput(platform, requested)) requested = "";
  const fallback = item4DefaultOutputType(platform, photoCount, { hasVideo, packageId }) || spec.default_output_type;
  const outputType = requested || fallback;
  const selected = spec.options[outputType];
  if (!selected) throw new HttpError(400, `${platform} output type ${outputType} is not supported by the Item 4 planner`);
  const available = hasVideo
    ? Object.keys(spec.options).filter((type) => !item4IsNativeStillOutput(platform, type))
    : Object.keys(spec.options);
  return { output_type: outputType, ...selected, available_output_types: available };
}
/*__STUDIO_WORKER_END:item4PlanChoice__*/

export function item4PlanItemFromChoice(platform, chosen, photoCount, mappingIndex, { companion = false } = {}) {
  const mapping = mappingIndex.get(`${platform}::${chosen.mapping_type}`) || null;
  let aspectRatio = mapping ? String(f(mapping, "Aspect_Ratio") || "").trim() : null;
  let ratioSource = mapping ? "Platform Output Mappings" : "Missing mapping";
  if (!aspectRatio && chosen.output_type === "Story") {
    aspectRatio = "9:16";
    ratioSource = "Story default 9:16";
  }
  const available = companion || chosen.output_type === "Story"
    ? [chosen.output_type]
    : (chosen.available_output_types || []).filter((type) => type !== "Story");
  return {
    platform,
    output_type: chosen.output_type,
    mapping_type: chosen.mapping_type,
    format: chosen.format,
    aspect_ratio: aspectRatio,
    ratio_source: ratioSource,
    rationale: item4DynamicRationale(chosen.rationale, photoCount),
    available_output_types: available,
    source_asset_count: photoCount,
    requires_variant_review: !aspectRatio,
    companion: Boolean(companion || chosen.output_type === "Story"),
  };
}
/*__STUDIO_WORKER_END:item4PlanItemFromChoice__*/

export async function item4ReconcilePlanWithEnabledOutputs(env, record, enabledPairs) {
  // The selected Production Request Outputs are the sole authority for output
  // destinations. Rebuild the plan from that exact set: the previous add-only
  // reconciliation retained deleted formats and left Platforms/Frames misleading.
  const assets = item4AssetManifest(record);
  const photoCount = item4EffectivePhotoCount(record, assets) || Math.max(assets.length, 1);
  const hasVideo = item4PlanHasVideo(record, assets);
  const mappingIndex = await item4MappingIndex(env);
  const existingPlan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  const previousItems = Array.isArray(existingPlan?.items) ? existingPlan.items : [];
  const items = [];
  const seen = new Set();

  for (const pair of enabledPairs || []) {
    const outputType = item4CanonicalOutputType(pair.platform, pair.output_type)
      || item4DefaultOutputType(pair.platform, photoCount, { hasVideo });
    if (!outputType || !ITEM4_PLAN_SPECS[pair.platform]) continue;
    if (item4IsUnsupportedCompanion(pair.platform, outputType)) continue;
    if (hasVideo && item4IsNativeStillOutput(pair.platform, outputType)) {
      throw new HttpError(409, `${pair.platform} ${outputType} needs still-image source assets; the current video/mixed-source planner cannot prepare that native still format.`);
    }
    const key = item4BridgePlanKey(pair.platform, outputType);
    if (seen.has(key)) continue;
    seen.add(key);
    const chosen = item4PlanChoice(pair.platform, outputType, photoCount, { hasVideo });
    items.push(item4PlanItemFromChoice(pair.platform, chosen, photoCount, mappingIndex, {
      companion: item4IsCompanionOutputType(outputType),
    }));
  }
  if (!items.length) throw new HttpError(409, "Choose at least one supported platform output");

  const priorKeys = previousItems.map((item) => item4BridgePlanKey(item.platform, item.output_type));
  const selectedKeys = items.map((item) => item4BridgePlanKey(item.platform, item.output_type));
  const sameKeys = priorKeys.length === selectedKeys.length
    && priorKeys.every((key, index) => key === selectedKeys[index]);
  const needsReview = items.some((item) => !item.aspect_ratio);
  const expectedStatus = needsReview ? "Needs Review" : "Ready";
  const storedStatus = String(f(record, "Studio_Output_Plan_Status") || "");
  if (sameKeys && storedStatus === expectedStatus) return record;

  const previousRatios = item4RequiredRatios(existingPlan).join("|");
  const plan = {
    ...(existingPlan && typeof existingPlan === "object" ? existingPlan : {}),
    schema_version: "item4.output-plan.1",
    generated_at: new Date().toISOString(),
    production_request_record_id: record.id,
    source_asset_count: photoCount,
    photo_count_kind: item4PhotoCountKind(photoCount),
    items,
  };
  const nextRatios = item4RequiredRatios(plan).join("|");
  const fields = {
    Target_Platforms: [...new Set(items.map((item) => item.platform))],
    Studio_Output_Plan_JSON: JSON.stringify(plan),
    Studio_Output_Plan_Status: expectedStatus,
  };
  if (previousRatios && previousRatios !== nextRatios) {
    fields.Studio_Variant_Status = "None";
    fields.Studio_Variant_Manifest_JSON = null;
    fields.Studio_Variant_Updated_At = null;
    fields.Studio_Variant_Error = null;
  }
  return item4UpdateRequestState(env, record.id, fields);
}
/*__STUDIO_WORKER_END:item4ReconcilePlanWithEnabledOutputs__*/

export async function item4DisableUnsupportedCompanions(env, requestRecord) {
  const rows = await outputRowsForProductionRequest(env, requestRecord.id);
  const now = new Date().toISOString();
  let changed = false;
  for (const row of rows) {
    const platform = String(f(row, "Platform") || "").trim();
    const outputType = String(f(row, "Output_Type") || "").trim();
    if (!item4IsUnsupportedCompanion(platform, outputType) || !f(row, "Enabled")) continue;
    await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, row.id, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Enabled: false, Active: false, Updated_At: now }, typecast: false }),
    });
    changed = true;
  }
  return changed;
}
/*__STUDIO_WORKER_END:item4DisableUnsupportedCompanions__*/

export async function item4ReconcileEnabledPlanOutputs(env, requestRecord) {
  await item4DisableUnsupportedCompanions(env, requestRecord);
  let rows = await outputRowsForProductionRequest(env, requestRecord.id);
  let enabledRows = rows.filter((row) => Boolean(f(row, "Enabled")));

  // The saved Item 4 plan is authoritative. If a plan-sync race/interruption left
  // no destination rows, rebuild them before bridge validation instead of
  // deadlocking promotion on "Choose at least one enabled Production Request Output."
  if (!enabledRows.length) {
    const plan = item4ParseJson(f(requestRecord, "Studio_Output_Plan_JSON"), null);
    const planItems = Array.isArray(plan?.items) ? plan.items : [];
    if (planItems.length) {
      await item4SyncPlanOutputs(env, requestRecord, planItems);
      requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestRecord.id).catch(() => requestRecord);
      rows = await outputRowsForProductionRequest(env, requestRecord.id);
      enabledRows = rows.filter((row) => Boolean(f(row, "Enabled")));
    }
  }

  const enabled = enabledRows.map((row) => ({
    platform: String(f(row, "Platform") || "").trim(),
    output_type: String(f(row, "Output_Type") || "").trim(),
  }));
  const updated = await item4ReconcilePlanWithEnabledOutputs(env, requestRecord, enabled);
  return item4RelinkVariantQueueOutputs(env, updated);
}

/*__STUDIO_WORKER_END:item4ReconcileEnabledPlanOutputs__*/

export async function acquireAzOutputLock(env, requestRecord) {
  const notes = String(f(requestRecord, "Production_Notes") || "");
  if (azOutputLockIsFresh(notes)) return { acquired: false, record: requestRecord };
  const token = azOutputLockToken();
  const record = await item4UpdateRequestState(env, requestRecord.id, {
    Production_Notes: mergeAzOutputLock(notes, token),
  });
  const held = azOutputLockHeld(String(f(record, "Production_Notes") || ""), token);
  return { acquired: held, record, token };
}
/*__STUDIO_WORKER_END:acquireAzOutputLock__*/

export function finishedEnabledKeysFromRows(rows, record = null) {
  const horizontal = record ? isHorizontalFinishedAspect(studioRequestNotesText(record)) : false;
  const keys = new Set();
  for (const row of rows || []) {
    if (!f(row, "Enabled") && !f(row, "Active")) continue;
    const key = canonicalFinishedDestinationKey(f(row, "Platform"), f(row, "Output_Type"), { horizontal });
    if (key) keys.add(key);
  }
  return keys;
}
/*__STUDIO_WORKER_END:finishedEnabledKeysFromRows__*/

export async function item4SyncPlanOutputs(env, requestRecord, items, { schedules = null } = {}) {
  const productionRequestId = requestRecord.id;
  const finishedVideo = studioFinishedOriginKind(requestRecord) === "finished-video";
  const notesText = studioRequestNotesText(requestRecord);
  const vibeCut = studioIsVibeCut(requestRecord);
  let uniqueItems = finishedVideo
    ? capFinishedPlanItems(items, { notes: notesText })
    : uniquePlanItems(items);
  // Horizontal Vibe Cut must keep YouTube Standard + Short enabled even when a
  // prior 6-destination draft left Short unchecked / Reels still Enabled.
  if (vibeCut) {
    uniqueItems = capVibeCutPlanItems(uniqueItems, { notes: notesText });
  }
  let azLock = null;
  if (finishedVideo) {
    azLock = await acquireAzOutputLock(env, requestRecord);
    requestRecord = azLock.record;
    if (!azLock.acquired) {
      await item4CollapseDuplicatePlanOutputs(
        env,
        await outputRowsForProductionRequest(env, productionRequestId, { includeInactive: true }),
        { finishedVideo: true }
      );
      return;
    }
  }
  let existing = await outputRowsForProductionRequest(env, productionRequestId, { includeInactive: true });
  await item4CollapseDuplicatePlanOutputs(env, existing, { finishedVideo });
  existing = await outputRowsForProductionRequest(env, productionRequestId, { includeInactive: true });
  const rowKey = (row) => finishedVideo
    ? canonicalFinishedDestinationKey(f(row, "Platform"), f(row, "Output_Type"))
    : `${String(f(row,"Platform")||"").trim()}::${String(f(row,"Output_Type")||"").trim()}`;
  const byKey = new Map(existing.map(row => [rowKey(row), row]));
  const wanted = new Set();
  const now = new Date().toISOString();
  const scheduleOverrides = studioScheduleOverridesFromPayload({ schedules });
  // Finished-file passthrough must materialize its six destination rows before
  // doing any broad schedule-occupancy reads. The final AZ approval path performs
  // its own conflict-aware scheduling, so an empty local occupancy map is safe here
  // and avoids exhausting the Worker subrequest budget while the output lock is held.
  const occupied = finishedVideo ? {} : await studioLoadPlanScheduleOccupancy(env, {
    excludeRequestId: productionRequestId,
    profile: await item4ProductionProfileRecord(env, requestRecord).catch(() => null),
  });
  const timeZone = await studioScheduleTimeZoneForRecord(env, requestRecord);
  const stamps = studioBuildSuggestedScheduleMap(uniqueItems.map((item) => {
    const key = `${item.platform}::${item.output_type}`;
    const current = byKey.get(finishedVideo ? canonicalFinishedDestinationKey(item.platform, item.output_type) : key);
    return {
      platform: item.platform,
      output_type: item.output_type,
      scheduled_at: scheduleOverrides.get(key) || (current ? f(current, "Scheduled_At") : "") || "",
    };
  }), occupied, new Date(), { timeZone });
  const patchRows = [];
  const createFields = [];
  for (let i=0; i<uniqueItems.length; i++) {
    const item = uniqueItems[i];
    const key = `${item.platform}::${item.output_type}`;
    const destKey = finishedVideo ? canonicalFinishedDestinationKey(item.platform, item.output_type) : key;
    wanted.add(destKey);
    const current = byKey.get(destKey);
    const storyFields = item4CompanionStoryFields(item.output_type, { finishedVideo });
    const scheduledAt = studioDestinationScheduleStamp(current, key, stamps, scheduleOverrides);
    if (current) {
      patchRows.push({
        id: current.id,
        fields: {
          Enabled: true,
          Active: true,
          Output_Order: i + 1,
          Output_Status: "Draft",
          Carousel_Image_Mode_Override: "Manual Upload",
          ...(scheduledAt ? { Scheduled_At: scheduledAt } : {}),
          ...storyFields,
          Updated_At: now,
        },
      });
      continue;
    }
    if (finishedVideo) {
      // Lock ownership is decided once at function entry. Do not re-check the
      // note token here: overlapping workspace + cron calls can overwrite that
      // token after acquisition and otherwise starve all writers at zero rows.
      if (!azLock?.acquired) continue;
      if (!shouldCreateFinishedOutput(finishedEnabledKeysFromRows(existing), destKey)) continue;
    }
    createFields.push({
      Production_Request_Output_ID: makeProductionRequestOutputId(),
      Production_Request: [productionRequestId],
      Test_Run_ID: String(f(requestRecord, "Test_Run_ID") || "").trim() || null,
      Organization: arrayOrEmpty(f(requestRecord, "Organization")),
      Brand: arrayOrEmpty(f(requestRecord, "Brand")),
      Created_By: arrayOrEmpty(f(requestRecord, "Created_By")),
      Platform: item.platform,
      Output_Type: item.output_type,
      Output_Status: "Draft",
      Output_Order: i + 1,
      Enabled: true,
      Active: true,
      Carousel_Image_Mode_Override: "Manual Upload",
      Scheduled_At: scheduledAt || stamps.get(key) || null,
      ...storyFields,
      Created_At: now,
      Updated_At: now,
    });
  }
  for (const row of existing) {
    const key = rowKey(row);
    if (wanted.has(key)) continue;
    patchRows.push({
      id: row.id,
      fields: { Enabled: false, Active: false, Updated_At: now },
    });
  }
  if (patchRows.length) {
    await airtableBatchUpdate(env, PRODUCTION_REQUEST_OUTPUT_TABLE, patchRows, { typecast: false });
  }
  if (createFields.length) {
    const createdRows = await airtableBatchCreate(env, PRODUCTION_REQUEST_OUTPUT_TABLE, createFields, { typecast: false });
    for (const created of createdRows) {
      if (created?.id) byKey.set(rowKey(created), created);
    }
  }
  await item4CollapseDuplicatePlanOutputs(
    env,
    await outputRowsForProductionRequest(env, productionRequestId, { includeInactive: true }),
    { finishedVideo }
  );
}
/*__STUDIO_WORKER_END:item4SyncPlanOutputs__*/

export async function buildItem4OutputPlan(request, env, url, authorization) {
  let payload={};
  try { payload=await request.json(); } catch { throw new HttpError(400,"Request body must be valid JSON"); }
  const recordId=item4RequestIdFromPath(url);
  let record=await loadAuthorizedProductionRequest(env,recordId,authorization);
  assertEditableProductionRequest(record);
  const assets=item4AssetManifest(record).sort((a,b)=>Number(a.order||0)-Number(b.order||0));
  const photoCount=item4EffectivePhotoCount(record, assets);
  const hasVideo=item4PlanHasVideo(record, assets);
  if (!photoCount) throw new HttpError(409,"Upload at least one master photo or clip before building the platform plan, or set an exact AI slide count with Make AI Generated.");
  const requestedPlatforms=Array.isArray(payload.platforms)&&payload.platforms.length?payload.platforms:["Instagram","Facebook","TikTok","YouTube"];
  const platforms=[...new Set(requestedPlatforms.map(x=>String(x||"").trim()).filter(Boolean))];
  const overrides=payload.overrides&&typeof payload.overrides==="object"?payload.overrides:{};
  const packageId=item4ResolvePackageId(record, payload.package || payload.package_id || "");
  const mappingIndex=await item4MappingIndex(env);
  const items=[];
  let needsReview=false;
  for (const platform of platforms) {
    const requestedRaw = item4CanonicalOutputType(platform, overrides[platform] || "");
    const requested = item4IsCompanionOutputType(requestedRaw) ? "" : requestedRaw;
    const fallback = item4DefaultOutputType(platform, photoCount, { hasVideo, packageId });
    if (!requested && !fallback) continue;
    // When the request is a Carousel/slides idea, ignore stale video overrides from an
    // older Recommend pass so native stills win.
    let effectiveRequested = requested;
    if (packageId === "slides" && !hasVideo && requested && !item4IsNativeStillOutput(platform, requested) && requested !== "Slideshow Video") {
      effectiveRequested = "";
    }
    const chosen = item4PlanChoice(platform, effectiveRequested || fallback, photoCount, { hasVideo, packageId });
    items.push(item4PlanItemFromChoice(platform, chosen, photoCount, mappingIndex));
    if (!items[items.length - 1].aspect_ratio) needsReview = true;
  }
  const extrasPayload = Array.isArray(payload.extras) ? [...payload.extras] : [];
  if (packageId === "video" || (!packageId && (hasVideo || photoCount > 1))) {
    extrasPayload.push("Instagram::Story", "Facebook::Story");
  }
  const extras = item4NormalizePlanExtras(extrasPayload, platforms, items)
    .filter((extra) => !hasVideo || extra.companion || !item4IsNativeStillOutput(extra.platform, extra.output_type))
    // Carousel / slides recommend must not keep leftover IG/FB Story companions from a
    // prior video-default Recommend pass.
    .filter((extra) => packageId !== "slides" || !item4IsCompanionOutputType(extra.output_type));
  for (const extra of extras) {
    try {
      const chosen = item4PlanChoice(extra.platform, extra.output_type, photoCount, { hasVideo });
      items.push(item4PlanItemFromChoice(extra.platform, chosen, photoCount, mappingIndex, { companion: extra.companion }));
      if (!items[items.length - 1].aspect_ratio) needsReview = true;
    } catch {
      continue;
    }
  }
  const finishedVideo = studioFinishedOriginKind(record) === "finished-video";
  const vibeCut = studioIsVibeCut(record);
  const notesText = studioRequestNotesText(record);
  let plannedItems = items;
  if (finishedVideo) {
    plannedItems = capFinishedPlanItems(items, { notes: notesText });
  } else if (vibeCut) {
    plannedItems = capVibeCutPlanItems(items, { notes: notesText });
  }
  const plan={schema_version:"item4.output-plan.1",generated_at:new Date().toISOString(),production_request_record_id:recordId,source_asset_count:photoCount,photo_count_kind:item4PhotoCountKind(photoCount),items:plannedItems};
  needsReview = plannedItems.some((item) => !item.aspect_ratio);

  if (payload.check_fbs1 === true && !payload.skip_fbs1_guard && plannedItems.some(item =>
    item.platform === "Facebook" &&
    item.output_type === "Slideshow Reel"
  )) {
    await item4EnsureFacebookSlideshowVoiceoverPayload(env, authorization);
  }

  await item4SyncPlanOutputs(env,record,plannedItems,{ schedules: payload.schedules });
  const keepAiMode = String(f(record, "Carousel_Image_Mode") || "").trim() === "Make AI Generated";
  const keepExact = keepAiMode && Number(f(record, "Carousel_Slide_Count_Exact") || 0) >= photoCount;
  const maxCount=Math.min(15,Math.max(1,photoCount));
  const requestedMasterContentType = String(f(record, "Master_Content_Type") || "").trim();
  let masterContentType = requestedMasterContentType;
  if (packageId === "slides") {
    const slidesType = photoCount <= 1 ? "Feed Post" : "Carousel";
    if (!masterContentType || masterContentType === "Photo Set") masterContentType = slidesType;
  } else if (!masterContentType) {
    masterContentType = photoCount <= 1 ? "Feed Post" : "Photo Set";
  }
  record=await item4UpdateRequestState(env,recordId,{
    Master_Content_Type:masterContentType, Target_Platforms:plannedItems.map(item=>item.platform),
    Carousel_Image_Mode: keepAiMode ? "Make AI Generated" : "Manual Upload",
    Carousel_Slide_Count_Mode:"Exact",
    Carousel_Slide_Count_Exact: keepExact ? Number(f(record, "Carousel_Slide_Count_Exact") || photoCount) : photoCount,
    Carousel_Slide_Count_Min:null, Carousel_Slide_Count_Max:null,
    Video_Clip_Count_Mode:"Exact", Video_Clip_Count_Exact:maxCount, Video_Clip_Count_Min:null, Video_Clip_Count_Max:null,
    Studio_Output_Plan_JSON:JSON.stringify(plan), Studio_Output_Plan_Status:needsReview?"Needs Review":"Ready",
    Studio_Variant_Manifest_JSON:null, Studio_Variant_Status:finishedVideo?"Not Needed":"None", Studio_Variant_Updated_At:null, Studio_Variant_Error:null,
    Studio_Item4_State:needsReview?"Assets Ready":"Plan Ready",
  });
  const rows=await outputRowsForProductionRequest(env,recordId);
  return respond(request,env,{ok:true,plan,production_request:mapProductionRequest(record),outputs:rows.map(row=>mapProductionRequestOutput(row,record)),message:needsReview?"Platform plan created; one or more ratio mappings need review.":"Platform plan created from the current master photos and ratio authority."});
}
/*__STUDIO_WORKER_END:buildItem4OutputPlan__*/

export async function getItem4OutputPlan(request, env, url, authorization) {
  const recordId=item4RequestIdFromPath(url);
  const record=await loadAuthorizedProductionRequest(env,recordId,authorization);
  return respond(request,env,{ok:true,status:f(record,"Studio_Output_Plan_Status")||"Needs Plan",plan:item4ParseJson(f(record,"Studio_Output_Plan_JSON"),null)});
}
/*__STUDIO_WORKER_END:getItem4OutputPlan__*/

export function studioFacebookGraphPublishHeld(env) {
  void env;
  // Make.com is retired. Approved Facebook outputs publish through the native
  // Graph/Python path; do not reinterpret a missing legacy flag as a publish hold.
  return false;
}/*__STUDIO_WORKER_END:studioFacebookGraphPublishHeld__*/

export function item4VariantManifest(record) {
  const parsed = item4ParseJson(f(record, "Studio_Variant_Manifest_JSON"), null);
  return parsed && typeof parsed === "object" ? parsed : null;
}
/*__STUDIO_WORKER_END:item4VariantManifest__*/

export function item4CoverStillUrl(requestRecord, outputRow = null) {
  const manifest = item4VariantManifest(requestRecord);
  const assets = Array.isArray(manifest?.assets)
    ? manifest.assets.slice().sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
    : [];
  const first = assets[0];
  if (!first?.variants || typeof first.variants !== "object") return "";

  const platform = String(f(outputRow, "Platform") || "").trim();
  const outputType = String(f(outputRow, "Output_Type") || "").trim();
  const plan = item4ParseJson(f(requestRecord, "Studio_Output_Plan_JSON"), null);
  const planItem = (Array.isArray(plan?.items) ? plan.items : []).find((item) =>
    item4BridgePlanKey(item?.platform, item?.output_type) === item4BridgePlanKey(platform, outputType)
  );
  const planRatio = String(planItem?.aspect_ratio || "").trim();
  const preferred = platform === "YouTube"
    ? ["16:9", "9:16", "4:5", "1:1"]
    : [planRatio, "9:16", "4:5", "1:1", "16:9"].filter(Boolean);

  for (const ratio of [...new Set(preferred)]) {
    const variant = first.variants[ratio];
    const preview = String(variant?.preview_url || "").trim();
    const drive = String(variant?.google_drive_url || "").trim();
    const cdn = studioClipPublicCdnUrl(preview);
    if (cdn) return cdn;
    if (preview) return preview;
    if (drive) return drive;
  }
  return "";
}
/*__STUDIO_WORKER_END:item4CoverStillUrl__*/

export function item4PlanRatios(plan) {
  const ratios = [];
  const items = Array.isArray(plan?.items) ? plan.items : [];
  for (const item of items) {
    const ratio = String(item?.aspect_ratio || "").trim();
    if (ITEM4_RATIO_SPECS[ratio] && !ratios.includes(ratio)) ratios.push(ratio);
  }
  return ratios;
}
/*__STUDIO_WORKER_END:item4PlanRatios__*/

export function item4CoverExtraRatios(plan) {
  const extras = [];
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const needsYoutubeCover = items.some((item) => String(item?.platform || "").trim() === "YouTube");
  if (needsYoutubeCover && !item4PlanRatios(plan).includes("16:9")) extras.push("16:9");
  return extras;
}
/*__STUDIO_WORKER_END:item4CoverExtraRatios__*/

export function item4RequiredRatios(plan) {
  return [...item4PlanRatios(plan), ...item4CoverExtraRatios(plan)];
}
/*__STUDIO_WORKER_END:item4RequiredRatios__*/

export function item4CoverHeroAsset(assets) {
  return [...(assets || [])]
    .sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0))[0] || null;
}
/*__STUDIO_WORKER_END:item4CoverHeroAsset__*/

export function item4RatiosForAsset(plan, asset, assets) {
  const planRatios = item4PlanRatios(plan || {});
  const extras = item4CoverExtraRatios(plan || {});
  const hero = item4CoverHeroAsset(assets);
  const isHero = Boolean(hero?.id) && String(asset?.id || "") === String(hero.id);
  if (!isHero) return planRatios;
  return [...planRatios, ...extras.filter((ratio) => !planRatios.includes(ratio))];
}
/*__STUDIO_WORKER_END:item4RatiosForAsset__*/

export function item4ExpectedVariantKeys(recordId, assets, plan) {
  return (assets || [])
    .filter((asset) => !item4LooksLikeVideoAsset(asset))
    .flatMap((asset) =>
      item4RatiosForAsset(plan, asset, assets).map((ratio) => ({
        asset,
        ratio,
        transfer_id: item4QueueTransferId(recordId, asset.id, ratio, asset),
      }))
    );
}
/*__STUDIO_WORKER_END:item4ExpectedVariantKeys__*/

export function item4VariantRatioKey(ratio) {
  return String(ratio || "").replace(":", "x");
}
/*__STUDIO_WORKER_END:item4VariantRatioKey__*/

export function item4VariantTargetFileName(asset, ratio) {
  const original = String(asset?.name || "photo").trim() || "photo";
  const base = original.replace(/\.[^.]+$/, "") || "photo";
  const filename = `${item4SafeFileName(base)}__${item4VariantRatioKey(ratio)}__${ITEM4_VARIANT_RECIPE_VERSION}.jpg`;
  const suffix = item4CropTransferSuffix(asset, ratio);
  return suffix ? filename.replace(/\.jpg$/i, `${suffix}.jpg`) : filename;
}
/*__STUDIO_WORKER_END:item4VariantTargetFileName__*/

export function item4NormalizedCrop(asset, ratio) {
  const raw = asset?.crops?.[ratio] || asset?.crops?.[String(ratio)] || null;
  const x = Number(raw?.x);
  const y = Number(raw?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0.5, y: 0.5 };
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}
/*__STUDIO_WORKER_END:item4NormalizedCrop__*/

export function item4CropStyleToken(asset, ratio) {
  const crop = item4NormalizedCrop(asset, ratio);
  if (Math.abs(crop.x - 0.5) < 0.005 && Math.abs(crop.y - 0.5) < 0.005) return "center";
  return `${crop.x.toFixed(2)}x${crop.y.toFixed(2)}`;
}
/*__STUDIO_WORKER_END:item4CropStyleToken__*/

export function item4CropTransferSuffix(asset, ratio) {
  const token = item4CropStyleToken(asset, ratio);
  return token === "center" ? "" : `-g${token}`;
}
/*__STUDIO_WORKER_END:item4CropTransferSuffix__*/

export function item4MergeAssetCrops(assets, cropsPayload) {
  if (!cropsPayload || typeof cropsPayload !== "object") return assets;
  return (Array.isArray(assets) ? assets : []).map((asset) => {
    const incoming = cropsPayload[asset.id] || cropsPayload[String(asset.id)];
    if (!incoming || typeof incoming !== "object") return asset;
    const crops = { ...(asset.crops || {}) };
    for (const [ratio, point] of Object.entries(incoming)) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      crops[String(ratio)] = {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      };
    }
    return { ...asset, crops };
  });
}
/*__STUDIO_WORKER_END:item4MergeAssetCrops__*/

export function item4QueueTransferId(recordId, assetId, ratio, asset = null) {
  return `ITEM4-VARIANT-${ITEM4_VARIANT_RECIPE_VERSION}-${recordId}-${assetId}-${item4VariantRatioKey(ratio)}${item4CropTransferSuffix(asset, ratio)}`;
}
/*__STUDIO_WORKER_END:item4QueueTransferId__*/

export function item4QueueStatus(row) {
  return String(f(row, "Transfer_Status") || "").trim();
}
/*__STUDIO_WORKER_END:item4QueueStatus__*/

export function item4QueueRowHasAuthority(row) {
  return Boolean(item4QueueDriveFileId(row) && item4QueueMediaAssetId(row));
}
/*__STUDIO_WORKER_END:item4QueueRowHasAuthority__*/

export function item4QueueRowCountsReady(row) {
  if (item4QueueStatus(row) === "Ready") return true;
  return item4QueueRowHasAuthority(row);
}
/*__STUDIO_WORKER_END:item4QueueRowCountsReady__*/

export function item4QueueErrorIsTransient(message) {
  return /(network connection lost|timed?\s*out|timeout|502|503|504|image transformation failed|stalled processing|connection reset|connection aborted)/i.test(
    String(message || "")
  );
}
/*__STUDIO_WORKER_END:item4QueueErrorIsTransient__*/

export async function item4RequeueTransientVariantFailures(env, rows) {
  const next = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const status = item4QueueStatus(row);
    if (!["Failed", "Error"].includes(status) || item4QueueRowHasAuthority(row) || !item4QueueErrorIsTransient(f(row, "Error_Message"))) {
      next.push(row);
      continue;
    }
    try {
      const updated = await airtableFetch(env, ITEM4_VARIANT_QUEUE_TABLE, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Transfer_Status: "Pending",
            Attempt_Count: 0,
            Error_Message: "Requeued after a transient crop failure so SMV1 can retry.",
          },
          typecast: true,
        }),
      });
      next.push(updated || row);
    } catch (error) {
      console.warn("Item 4 transient variant requeue failed", row.id, error);
      next.push(row);
    }
  }
  return next;
}
/*__STUDIO_WORKER_END:item4RequeueTransientVariantFailures__*/

export async function item4RequeueFailedVariantsForHeal(env, rows) {
  const next = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const status = item4QueueStatus(row);
    if (!["Failed", "Error"].includes(status) || item4QueueRowHasAuthority(row)) {
      next.push(row);
      continue;
    }
    try {
      const updated = await airtableFetch(env, ITEM4_VARIANT_QUEUE_TABLE, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Transfer_Status: "Pending",
            Attempt_Count: 0,
            Error_Message: "Requeued by Quality Agent prepare heal so leftover frames can finish without a manual Retry.",
          },
          typecast: true,
        }),
      });
      next.push(updated || row);
    } catch (error) {
      console.warn("Item 4 heal variant requeue failed", row.id, error);
      next.push(row);
    }
  }
  return next;
}
/*__STUDIO_WORKER_END:item4RequeueFailedVariantsForHeal__*/

export async function item4RequeueStaleProcessing(env, rows) {
  const now = Date.now();
  const next = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (item4QueueStatus(row) !== "Processing") {
      next.push(row);
      continue;
    }
    const stamp = Date.parse(String(f(row, "Updated_At") || f(row, "Started_At") || f(row, "Created_At") || "")) || 0;
    if (stamp && (now - stamp) < 90000) {
      next.push(row);
      continue;
    }
    try {
      const attempts = Number(f(row, "Attempt_Count") || 0);
      const skipStalled = Number.isFinite(attempts) && attempts >= 6;
      const updated = await airtableFetch(env, ITEM4_VARIANT_QUEUE_TABLE, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: skipStalled
            ? {
                Transfer_Status: "Error",
                Error_Message: `Parked after ${attempts} stalled Processing claims so SMV1 can drain other crops. Click Prepare platform media to retry this one.`,
              }
            : {
                Transfer_Status: "Pending",
                Error_Message: "Requeued after a stalled Processing claim so SMV1 can pick the row up again.",
              },
          typecast: true,
        }),
      });
      next.push(updated || row);
    } catch (error) {
      console.warn("Item 4 stale Processing requeue failed", error);
      next.push(row);
    }
  }
  return next;
}
/*__STUDIO_WORKER_END:item4RequeueStaleProcessing__*/

export function item4QueueMediaAssetId(row) {
  const generated = arrayOrEmpty(f(row, "Generated_Media_Asset"));
  if (generated.length) return generated[0];
  return String(f(row, "Media_Asset_Record_ID") || "").trim() || null;
}
/*__STUDIO_WORKER_END:item4QueueMediaAssetId__*/

export function item4QueueDriveFileId(row) {
  return String(f(row, "Drive_File_ID") || "").trim() || null;
}
/*__STUDIO_WORKER_END:item4QueueDriveFileId__*/

export function item4OutputIdsForRatio(outputRows, plan, ratio) {
  // Link each physical variant to the outputs that actually request that ratio.
  // Do not infer aspect ratio from platform name: Reel/Slideshow routes on
  // Instagram/Facebook can be 9:16, while photo/post routes can be 4:5.
  const wanted = new Set(
    (Array.isArray(plan?.items) ? plan.items : [])
      .filter((item) => String(item?.aspect_ratio || "").trim() === ratio)
      .map((item) => `${String(item?.platform || "").trim()}|${String(item?.output_type || "").trim()}`)
  );

  return outputRows
    .filter((row) => {
      if (!Boolean(f(row, "Enabled"))) return false;
      const key = `${String(f(row, "Platform") || "").trim()}|${String(f(row, "Output_Type") || "").trim()}`;
      return wanted.has(key);
    })
    .map((row) => row.id);
}
/*__STUDIO_WORKER_END:item4OutputIdsForRatio__*/

export function item4SameRecordIds(left, right) {
  const a = [...new Set((Array.isArray(left) ? left : []).filter(Boolean))].sort();
  const b = [...new Set((Array.isArray(right) ? right : []).filter(Boolean))].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
/*__STUDIO_WORKER_END:item4SameRecordIds__*/

export async function item4RelinkVariantQueueOutputs(env, record, { maxPatches = 12 } = {}) {
  const plan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  if (!plan?.items?.length) return record;
  const outputRows = await outputRowsForProductionRequest(env, record.id);
  const queueRows = await item4VariantQueueRows(env, record.id);
  let patched = 0;
  for (const row of queueRows) {
    if (String(f(row, "Asset_Kind") || "").trim() !== "Platform Variant") continue;
    const ratio = String(f(row, "Aspect_Ratio") || "").trim();
    if (!ratio) continue;
    const wanted = item4OutputIdsForRatio(outputRows, plan, ratio);
    const current = arrayOrEmpty(f(row, "Target_Production_Request_Outputs"));
    if (item4SameRecordIds(current, wanted)) continue;
    await airtableFetch(env, ITEM4_VARIANT_QUEUE_TABLE, row.id, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Target_Production_Request_Outputs: wanted }, typecast: true }),
    });
    patched += 1;
    if (patched >= maxPatches) break;
  }
  return record;
}
/*__STUDIO_WORKER_END:item4RelinkVariantQueueOutputs__*/

export async function item4VariantQueueRows(env, recordId) {
  return listRecords(env, ITEM4_VARIANT_QUEUE_TABLE, {
    limit: 500,
    filterFormula: `{Production_Request_Record_ID}='${String(recordId).replace(/'/g, "\\'")}'`,
  });
}
/*__STUDIO_WORKER_END:item4VariantQueueRows__*/

export async function syncMiamiTikTokPipelineSecret(request, env) {
  const payload = await readJsonBody(request);
  const secret = String(payload?.secret || "").trim();
  if (secret.length < 32) throw new HttpError(400, "Miami TikTok pipeline secret is missing or too short");

  const settingName = "MIAMI_TIKTOK_PIPELINE_SECRET";
  const rows = await listRecords(env, "Pipeline Settings", {
    limit: 2,
    filterFormula: `{Setting_Name}='${settingName}'`,
  });
  const fields = {
    Setting_Name: settingName,
    Setting_Value: secret,
    Active: true,
    Notes: "Miami TikTok Worker shared pipeline secret. Synchronized by owner-only Studio repair operation; value is never returned.",
  };

  if (rows[0]?.id) {
    await airtableFetch(env, "Pipeline Settings", rows[0].id, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
  } else {
    await airtableFetch(env, "Pipeline Settings", "", {
      method: "POST",
      body: JSON.stringify({ fields, typecast: true }),
    });
  }

  return respond(request, env, {
    ok: true,
    setting_name: settingName,
    synchronized: true,
  });
}
/*__STUDIO_WORKER_END:syncMiamiTikTokPipelineSecret__*/

export async function item4PipelineSetting(env, name) {
  const rows = await listRecords(env, "Pipeline Settings", {
    limit: 5,
    filterFormula: `AND({Active}=1,{Setting_Name}='${String(name).replace(/'/g, "\\'")}')`,
  });
  return String(rows[0] ? f(rows[0], "Setting_Value") || "" : "").trim();
}
/*__STUDIO_WORKER_END:item4PipelineSetting__*/

export async function item4UpsertVariantQueue(env, recordId, assets, ratios, outputRows, plan, options = {}) {
  const forceRetry = Boolean(options.forceRetry);
  const ownerRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const testRunId = String(f(ownerRecord, "Test_Run_ID") || "").trim();
  const driveFolderId = await item4PipelineSetting(env, "STUDIO_VARIANT_DRIVE_FOLDER_ID");
  if (!driveFolderId) throw new HttpError(500, "STUDIO_VARIANT_DRIVE_FOLDER_ID is not configured");

  const existingRows = await item4VariantQueueRows(env, recordId);
  const byTransferId = new Map(
    existingRows.map((row) => [String(f(row, "Transfer_ID") || "").trim(), row])
  );

  const expected = [];
  const creates = [];
  const updates = [];
  const createMeta = [];
  for (const asset of assets) {
    if (item4LooksLikeVideoAsset(asset)) continue;
    const sourceDriveId = String(asset?.source_google_drive_file_id || asset?.google_drive_file_id || "").trim();
    const sourceMediaAssetId = String(asset?.media_asset_record_id || "").trim();

    if (!sourceDriveId) {
      throw new HttpError(409, `${asset?.name || "Master photo"} has not reached Google Drive authority yet`);
    }
    if (!sourceMediaAssetId) {
      throw new HttpError(409, `${asset?.name || "Master photo"} is missing its authoritative Media Asset link`);
    }

    const assetRatios = plan ? item4RatiosForAsset(plan, asset, assets) : (ratios || []);
    for (const ratio of assetRatios) {
      const spec = ITEM4_RATIO_SPECS[ratio];
      if (!spec) throw new HttpError(400, `Unsupported platform ratio ${ratio}`);

      const transferId = item4QueueTransferId(recordId, asset.id, ratio, asset);
      const targetOutputs = item4OutputIdsForRatio(outputRows, plan, ratio);
      const targetFileName = item4VariantTargetFileName(asset, ratio);
      const current = byTransferId.get(transferId) || null;
      const currentStatus = current ? item4QueueStatus(current) : "";
      const currentPreviewStatus = current ? String(f(current, "Preview_Status") || "").trim() : "";
      const hasAuthority = current ? item4QueueRowHasAuthority(current) : false;
      const preserveStatus = hasAuthority
        || ["Ready", "Drive Uploaded"].includes(currentStatus)
        || (currentStatus === "Processing" && !forceRetry);

      const fields = {
        Transfer_ID: transferId,
        Production_Request_Record_ID: recordId,
        Test_Run_ID: testRunId || null,
        Asset_Kind: "Platform Variant",
        Source_Asset_ID: String(asset.id),
        Source_Name: String(asset.name || "photo"),
        Source_MIME_Type: String(asset.mime_type || "application/octet-stream"),
        Source_Extension: String(asset.source_format || item4FileExtension(asset.name) || "").toLowerCase(),
        Source_Size_Bytes: Number(asset.size_bytes || 0) || null,
        Source_Order: Number(asset.order || 0) || null,
        Aspect_Ratio: ratio,
        Width: spec.width,
        Height: spec.height,
        Target_Drive_Folder_ID: driveFolderId,
        Target_File_Name: targetFileName,
        Source_Drive_File_ID: sourceDriveId,
        Source_Media_Asset: [sourceMediaAssetId],
        Target_Production_Request_Outputs: targetOutputs,
        Variant_Style: item4CropStyleToken(asset, ratio),
      };

      if (hasAuthority && currentStatus !== "Ready") {
        fields.Transfer_Status = "Ready";
        fields.Error_Message = null;
      } else if (!preserveStatus) {
        fields.Transfer_Status = "Pending";
        fields.Error_Message = null;
        if (forceRetry) fields.Attempt_Count = 0;
      }
      if (!["Ready", "Pending"].includes(currentPreviewStatus)) {
        fields.Preview_Status = "Pending";
        fields.Preview_Error = null;
        fields.Preview_R2_Key = null;
        fields.Preview_URL = null;
        fields.Preview_Ready_At = null;
      }

      const meta = {
        transfer_id: transferId,
        asset_id: String(asset.id),
        ratio,
        recipe_version: ITEM4_VARIANT_RECIPE_VERSION,
        target_file_name: targetFileName,
        queue_record_id: current?.id || null,
      };
      if (current) {
        updates.push({ id: current.id, fields });
      } else {
        creates.push(fields);
        createMeta.push(meta);
      }
      expected.push(meta);
    }
  }

  if (updates.length) await airtableBatchUpdate(env, ITEM4_VARIANT_QUEUE_TABLE, updates, { typecast: true });
  if (creates.length) {
    const createdRows = await airtableBatchCreate(env, ITEM4_VARIANT_QUEUE_TABLE, creates, { typecast: true });
    for (let i = 0; i < createMeta.length; i += 1) {
      createMeta[i].queue_record_id = createdRows[i]?.id || null;
    }
  }

  const keep = new Set(expected.map((row) => row.transfer_id));
  const dropUpdates = [];
  for (const row of existingRows) {
    const transferId = String(f(row, "Transfer_ID") || "").trim();
    const status = item4QueueStatus(row);
    if (!transferId || keep.has(transferId)) continue;
    if (!["Pending", "Processing"].includes(status)) continue;
    dropUpdates.push({
      id: row.id,
      fields: {
        Transfer_Status: "Error",
        Error_Message: "Dropped — this ratio is not required for the current plan or cover.",
      },
    });
  }
  if (dropUpdates.length) {
    try {
      await airtableBatchUpdate(env, ITEM4_VARIANT_QUEUE_TABLE, dropUpdates, { typecast: true });
    } catch (error) {
      console.warn("Item 4 unused variant row drop failed", error);
    }
  }
  return expected;
}

/*__STUDIO_WORKER_END:item4UpsertVariantQueue__*/

export function item4Smv1FormulaQuoted(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}/*__STUDIO_WORKER_END:item4Smv1FormulaQuoted__*/

export function item4Smv1ExactTestFormula(recordId, testRunId) {
  return item4Smv1ExactRequestFormula(recordId, testRunId);
}
/*__STUDIO_WORKER_END:item4Smv1ExactTestFormula__*/

export function item4Smv1ExactRequestFormula(recordId, testRunId = "") {
  const testClause = testRunId
    ? `{Test_Run_ID}="${item4Smv1FormulaQuoted(testRunId)}"`
    : `{Test_Run_ID}=BLANK()`;
  return `AND({Production_Request_Record_ID}="${item4Smv1FormulaQuoted(recordId)}",${testClause},${ITEM4_SMV1_BASE_ELIGIBILITY_FORMULA})`;
}
/*__STUDIO_WORKER_END:item4Smv1ExactRequestFormula__*/

export function item4QueueRowIsOutstanding(row) {
  const status = item4QueueStatus(row);
  if (["Pending", "Drive Uploaded", "Processing"].includes(status)) return true;
  return status === "Ready" && String(f(row, "Preview_Status") || "").trim() === "Pending";
}
/*__STUDIO_WORKER_END:item4QueueRowIsOutstanding__*/

export function pipelineStageBackend(env, stageKey) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  // Make is retired. Unset flags, explicit "make", and a missing runner URL
  // must not POST hook.us2.make.com. Pulse Python or fail with 503.
  void stageKey;
  return { mode: "python", runnerUrl };
}
/*__STUDIO_WORKER_END:pipelineStageBackend__*/

export function cadenceScenarioManagedByPython(env, scenarioId) {
  void env;
  void scenarioId;
  return true;
}
/*__STUDIO_WORKER_END:cadenceScenarioManagedByPython__*/

export function parseStudioProductionJob(recordOrRaw) {
  if (recordOrRaw && typeof recordOrRaw === "object" && recordOrRaw.fields) {
    return item4ParseJson(f(recordOrRaw, "Studio_Production_Job_JSON"), null);
  }
  return item4ParseJson(recordOrRaw, null);
}
/*__STUDIO_WORKER_END:parseStudioProductionJob__*/

export function studioProductionJobLabel(job) {
  if (!job || typeof job !== "object") return null;
  if (String(job.step || "") === "blocked") return String(job.error || job.detail || "Blocked").trim() || "Blocked";
  if (String(job.step || "") === "escalated") {
    return String(job.error || job.detail || "Escalated — needs investigation").trim() || "Escalated — needs investigation";
  }
  const detail = String(job.detail || STUDIO_PRODUCTION_JOB_LABELS[job.step] || job.step || "").trim();
  // Collapse PR-level counters so Pipeline rows never show "Rendering 2/6".
  if (/^Rendering(\s+\d+\/\d+)?$/i.test(detail) || String(job.step || "") === "render") return "Rendering";
  return detail || null;
}
/*__STUDIO_WORKER_END:studioProductionJobLabel__*/

export async function item4RunnerClipPosterRoutes(env) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) return { runnerUrl: "", hasStage: false, hasJob: false, version: "" };
  try {
    const [healthResponse, stagesResponse] = await Promise.all([
      fetch(`${runnerUrl}/health`),
      fetch(`${runnerUrl}/stages`),
    ]);
    const health = await healthResponse.json().catch(() => ({}));
    const stages = await stagesResponse.json().catch(() => ({}));
    const jobs = Array.isArray(health?.jobs) ? health.jobs : [];
    const hasJob = jobs.some((job) => String(job?.path || job?.name || "").includes("studio-clip-poster"));
    const hasStage = (Array.isArray(stages?.stages) ? stages.stages : []).some((stage) => (
      String(stage?.name || "") === "clip_poster" && stage?.implemented !== false
    ));
    return {
      runnerUrl,
      hasStage,
      hasJob,
      version: String(health?.version || "").trim(),
    };
  } catch (error) {
    console.warn("Item 4 runner clip-poster discovery failed", error);
    return { runnerUrl, hasStage: false, hasJob: false, version: "" };
  }
}
/*__STUDIO_WORKER_END:item4RunnerClipPosterRoutes__*/

export async function item4PulseClipPosterJob(env, recordId, { assetId = "" } = {}) {
  const advertised = await item4RunnerClipPosterRoutes(env);
  if (!advertised.runnerUrl) throw new HttpError(503, "Pipeline runner is not configured");
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const body = {
    production_request_record_id: recordId,
    ...(assetId ? { source_asset_id: assetId, extra: { source_asset_id: assetId } } : {}),
  };

  if (advertised.hasStage) {
    const { response, payload } = await item4PulsePipelineStage(env, "clip_poster", body, "CLIP_POSTER");
    if (!response.ok) {
      throw new HttpError(
        response.status,
        payload?.error || payload?.message || `Clip poster stage failed (${response.status})`
      );
    }
    return payload?.details || payload;
  }

  if (advertised.hasJob) {
    const response = await fetch(`${advertised.runnerUrl}/jobs/studio-clip-poster`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Pipeline-Secret": secret } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new HttpError(
        response.status,
        payload?.error || payload?.message || `Clip poster job failed (${response.status})`
      );
    }
    return payload;
  }

  console.warn(
    "Item 4 clip poster skipped: live runner does not advertise clip_poster",
    advertised.version || "unknown-version"
  );
  return { ok: false, skipped: "runner-missing-clip-poster", runner_version: advertised.version || null };
}
/*__STUDIO_WORKER_END:item4PulseClipPosterJob__*/

export async function item4RunnerStudioCompressRoutes(env) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) return { runnerUrl: "", hasStage: false, hasJob: false, version: "" };
  try {
    const [healthResponse, stagesResponse] = await Promise.all([
      fetch(`${runnerUrl}/health`),
      fetch(`${runnerUrl}/stages`),
    ]);
    const health = await healthResponse.json().catch(() => ({}));
    const stages = await stagesResponse.json().catch(() => ({}));
    const jobs = Array.isArray(health?.jobs) ? health.jobs : [];
    const hasJob = jobs.some((job) => String(job?.path || job?.name || "").includes("studio-compress"));
    const hasStage = (Array.isArray(stages?.stages) ? stages.stages : []).some((stage) => (
      String(stage?.name || "") === "studio_compress" && stage?.implemented !== false
    ));
    return {
      runnerUrl,
      hasStage,
      hasJob,
      version: String(health?.version || "").trim(),
    };
  } catch (error) {
    console.warn("Item 4 runner studio-compress discovery failed", error);
    return { runnerUrl, hasStage: false, hasJob: false, version: "" };
  }
}
/*__STUDIO_WORKER_END:item4RunnerStudioCompressRoutes__*/

export async function item4PulseStudioCompressJob(env, recordId, { assetId = "" } = {}) {
  const advertised = await item4RunnerStudioCompressRoutes(env);
  if (!advertised.runnerUrl) throw new HttpError(503, "Pipeline runner is not configured");
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const body = {
    production_request_record_id: recordId,
    ...(assetId ? { source_asset_id: assetId, extra: { source_asset_id: assetId } } : {}),
  };

  if (advertised.hasStage) {
    const { response, payload } = await item4PulsePipelineStage(env, "studio_compress", body, "STUDIO_COMPRESS");
    if (!response.ok && response.status !== 202) {
      throw new HttpError(
        response.status,
        payload?.error || payload?.message || `Studio compress stage failed (${response.status})`
      );
    }
    return payload?.details || payload;
  }

  if (advertised.hasJob) {
    const response = await fetch(`${advertised.runnerUrl}/jobs/studio-compress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Pipeline-Secret": secret } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 202) {
      throw new HttpError(
        response.status,
        payload?.error || payload?.message || `Studio compress job failed (${response.status})`
      );
    }
    return payload;
  }

  console.warn(
    "Item 4 studio compress skipped: live runner does not advertise studio_compress",
    advertised.version || "unknown-version"
  );
  return { ok: false, skipped: "runner-missing-studio-compress", runner_version: advertised.version || null };
}
/*__STUDIO_WORKER_END:item4PulseStudioCompressJob__*/

export async function item4PulseStudioProduceJob(env, recordId, { resume = false } = {}) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) throw new HttpError(503, "Pipeline runner is not configured");
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const path = resume ? "/jobs/studio-produce/resume" : "/jobs/studio-produce";
  const response = await fetch(`${runnerUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify({ production_request_record_id: recordId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(
      response.status,
      payload?.error || payload?.message || `Studio produce job failed (${response.status})`
    );
  }
  return { response, payload };
}
/*__STUDIO_WORKER_END:item4PulseStudioProduceJob__*/

export function studioRequestNotesText(record) {
  return [
    f(record, "Production_Notes"),
    f(record, "Output_Notes"),
    f(record, "Internal_Notes"),
    f(record, "Production_Request_Notes"),
  ].map((value) => String(value || "")).join("\n");
}
/*__STUDIO_WORKER_END:studioRequestNotesText__*/

export function studioIsAzFinishedVideo(record) {
  const text = studioRequestNotesText(record);
  return /origin=az-finished-video/i.test(text)
    || (/az-auto-queue=1/i.test(text) && /ez-input=finished-video/i.test(text));
}
/*__STUDIO_WORKER_END:studioIsAzFinishedVideo__*/

export function studioIsVibeCut(recordOrNotes) {
  if (recordOrNotes && typeof recordOrNotes === "object" && !Array.isArray(recordOrNotes)) {
    return isVibeCutNotes(studioRequestNotesText(recordOrNotes));
  }
  return isVibeCutNotes(recordOrNotes);
}
/*__STUDIO_WORKER_END:studioIsVibeCut__*/

export function skipsProductionApprove(text) {
  return String(text || "").includes("origin=autonomous") || /origin=az-finished-video/i.test(String(text || ""));
}
/*__STUDIO_WORKER_END:skipsProductionApprove__*/

export function studioChicagoWeekdayShort(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(date);
}
/*__STUDIO_WORKER_END:studioChicagoWeekdayShort__*/

export function studioAzCivilKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/*__STUDIO_WORKER_END:studioAzCivilKey__*/

export function studioAzParseWindowStart(window) {
  const first = String(window || "12:00-13:00").split("-")[0] || "12:00";
  const [hh, mm] = first.split(":").map((n) => Number(n) || 0);
  return { hour: hh, minute: mm || 0 };
}
/*__STUDIO_WORKER_END:studioAzParseWindowStart__*/

export function studioAzCivilFromMs(ms) {
  const parts = studioChicagoDateTimeParts(new Date(ms));
  return { ...parts, weekday: studioChicagoWeekdayShort(new Date(ms)), key: studioAzCivilKey(parts.year, parts.month, parts.day) };
}
/*__STUDIO_WORKER_END:studioAzCivilFromMs__*/

export function studioAzIsStory(outputType) {
  return /story/i.test(String(outputType || ""));
}
/*__STUDIO_WORKER_END:studioAzIsStory__*/

export function studioAzScheduleKey(platform, outputType) {
  return `${String(platform || "").trim()}::${String(outputType || "").trim()}`;
}
/*__STUDIO_WORKER_END:studioAzScheduleKey__*/

export function studioAzTooClose(ms, occupiedMs, gapMs = AZ_OTHER_CLUSTER_MS) {
  return (occupiedMs || []).some((other) => Number.isFinite(other) && Math.abs(other - ms) < gapMs);
}
/*__STUDIO_WORKER_END:studioAzTooClose__*/

export function studioAzNearPenalty(ms, occupiedMs) {
  let penalty = 0;
  for (const other of occupiedMs || []) {
    if (!Number.isFinite(other)) continue;
    const gap = Math.abs(other - ms);
    if (gap < AZ_OTHER_CLUSTER_MS) penalty += 80;
    else if (gap < AZ_OTHER_NEAR_MS) penalty += 40;
  }
  return penalty;
}
/*__STUDIO_WORKER_END:studioAzNearPenalty__*/

export function studioAzOccupiedOnDay(occupiedMs, civil) {
  return (occupiedMs || []).filter((ms) => Number.isFinite(ms) && studioAzCivilFromMs(ms).key === civil.key);
}
/*__STUDIO_WORKER_END:studioAzOccupiedOnDay__*/

export function studioAzHorizon(now = new Date()) {
  const chicago = studioChicagoDateTimeParts(now);
  const days = [];
  for (let i = 0; i < AZ_HORIZON_DAYS; i++) {
    const civil = i === 0
      ? { year: chicago.year, month: chicago.month, day: chicago.day }
      : studioAddCivilDays(chicago.year, chicago.month, chicago.day, i);
    const noonMs = studioChicagoWallToUtcMs(civil.year, civil.month, civil.day, 12, 0);
    days.push({
      ...civil,
      index: i,
      weekday: studioChicagoWeekdayShort(new Date(noonMs)),
      key: studioAzCivilKey(civil.year, civil.month, civil.day),
    });
  }
  return days;
}
/*__STUDIO_WORKER_END:studioAzHorizon__*/

export function studioAzWindowSlots(civil, windows, now, occupiedMs) {
  const nowMs = now.getTime() + AZ_SCHEDULE_LEAD_MS;
  const slots = [];
  for (let index = 0; index < (windows || []).length; index++) {
    const { hour, minute } = studioAzParseWindowStart(windows[index]);
    const ms = studioChicagoWallToUtcMs(civil.year, civil.month, civil.day, hour, minute);
    if (ms <= nowMs) continue;
    if (studioAzTooClose(ms, occupiedMs)) continue;
    slots.push({ ms, iso: new Date(ms).toISOString(), windowIndex: index, window: windows[index] });
  }
  return slots;
}
/*__STUDIO_WORKER_END:studioAzWindowSlots__*/

export function studioAzScoreMain(civil, suggested, occupiedMs, now) {
  const days = Array.isArray(suggested?.days) ? suggested.days : [];
  const windows = Array.isArray(suggested?.windows) && suggested.windows.length ? suggested.windows : ["12:00-13:00"];
  const preferred = !days.length || days.includes(civil.weekday);
  const slots = studioAzWindowSlots(civil, windows, now, occupiedMs);
  if (!slots.length) return { score: -1000, slot: null, preferred };
  const slot = slots[0];
  const crowding = studioAzOccupiedOnDay(occupiedMs, civil).length;
  let score = 80 + (preferred ? 18 : 0) + Math.max(0, 24 - slot.windowIndex * 8);
  score -= crowding * 22;
  score -= studioAzNearPenalty(slot.ms, occupiedMs);
  score -= civil.index * 3;
  if (crowding === 0 && civil.index > 0) score += 8;
  return { score, slot, preferred, crowding };
}
/*__STUDIO_WORKER_END:studioAzScoreMain__*/

export function studioBuildAzCampaignSchedule(items, { occupiedMs = [], bestTimesByKey = {}, now = new Date() } = {}) {
  const list = Array.isArray(items) ? items : [];
  const mains = list.filter((item) => !studioAzIsStory(item.output_type));
  const stories = list.filter((item) => studioAzIsStory(item.output_type));
  const days = studioAzHorizon(now);
  const platformOrder = [];
  for (const item of mains) {
    const platform = String(item.platform || "").trim();
    if (platform && !platformOrder.includes(platform)) platformOrder.push(platform);
  }
  const stamps = new Map();
  const reserved = [...occupiedMs];
  const usedDays = new Set();
  for (const item of mains) {
    const key = studioAzScheduleKey(item.platform, item.output_type);
    const suggested = bestTimesByKey[key] || studioIndustryBestWindows(item.platform, item.output_type);
    const platform = String(item.platform || "").trim();
    const start = platformOrder.length > 1
      ? Math.floor(Math.max(0, platformOrder.indexOf(platform)) * days.length / platformOrder.length)
      : 0;
    const walk = [...days.slice(start), ...days.slice(0, start)];
    let chosen = null;
    for (const civil of walk) {
      if (usedDays.has(civil.key) && platformOrder.length > 1) continue;
      const scored = studioAzScoreMain(civil, suggested, reserved, now);
      if (!scored.slot || scored.score < -200) continue;
      if (!chosen || scored.score > chosen.score) chosen = { civil, ...scored };
    }
    const slot = chosen?.slot;
    if (!slot) continue;
    stamps.set(key, slot.iso);
    reserved.push(slot.ms);
    usedDays.add(chosen.civil.key);
  }
  for (const story of stories) {
    const reel = mains.find((item) => String(item.platform) === String(story.platform));
    const reelIso = reel ? stamps.get(studioAzScheduleKey(reel.platform, reel.output_type)) : null;
    const base = reelIso ? Date.parse(reelIso) : null;
    if (!Number.isFinite(base)) continue;
    stamps.set(studioAzScheduleKey(story.platform, story.output_type), new Date(base + AZ_STORY_OFFSET_MS).toISOString());
  }
  const scheduledDays = [...usedDays];
  return {
    stamps,
    campaign: scheduledDays.length ? { key: scheduledDays[0] } : null,
    rationale: scheduledDays.length
      ? `spread across ${scheduledDays.length} day${scheduledDays.length === 1 ? "" : "s"} in the next ${AZ_HORIZON_DAYS} days`
      : "no open schedule in the scheduling horizon",
  };
}
/*__STUDIO_WORKER_END:studioBuildAzCampaignSchedule__*/

export async function studioLoadAzOccupiedTimes(env, { excludeIds = [] } = {}) {
  const skip = new Set((excludeIds || []).filter(Boolean));
  const unpublished = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: STUDIO_OCCUPIED_LIST_LIMIT,
    sortField: "Scheduled_Post_Date",
    sortDirection: "asc",
    filterFormula: studioOccupiedFilterFormula(Date.now(), null),
  }).catch(() => []);
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const published = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 200,
    sortField: "Published_At",
    sortDirection: "desc",
    filterFormula: `AND({Test_Run_ID}=BLANK(),{Published_At}>="${since}")`,
  }).catch(() => []);
  const allMs = [];
  for (const row of [...unpublished, ...published]) {
    if (skip.has(row.id)) continue;
    const raw = f(row, "Scheduled_Post_Date") || f(row, "YouTube_Scheduled_Publish_At") || f(row, "Published_At");
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) allMs.push(ms);
  }
  return { allMs };
}
/*__STUDIO_WORKER_END:studioLoadAzOccupiedTimes__*/

export async function studioResolveAzBestTimes(env, platform, outputType) {
  const industry = studioIndustryBestWindows(platform, outputType);
  try {
    const season = studioInsightsResolveSeason({ searchParams: new URLSearchParams() });
    const [firstParty, learned] = await Promise.all([
      studioInsightsLoadObservations(env, {
        profile: "chicago",
        platform,
        output_type: outputType,
        season,
        source: "first_party",
        limit: 120,
      }).catch(() => []),
      studioInsightsLoadLearned(env, {
        profile: "chicago",
        platform,
        output_type: outputType,
        season,
        metric_type: "post_time",
      }).catch(() => null),
    ]);
    const sample = (firstParty || []).filter((row) => row.views > 0 || row.likes > 0);
    const heatmap = studioBuildSimilarHeatmap(sample);
    if (heatmap.suggested && heatmap.sample_size >= STUDIO_SIMILAR_TIMES_MIN_SAMPLE) {
      return { ...heatmap.suggested, source: "first_party" };
    }
    if (learned?.days?.length && learned?.windows?.length && learned.sample_size >= STUDIO_SIMILAR_TIMES_MIN_SAMPLE) {
      return { days: learned.days, windows: learned.windows, label: learned.label || "learned model", source: "learned_model" };
    }
  } catch (error) {
    console.warn("AZ best-times lookup failed", platform, outputType, error);
  }
  return { ...industry, source: "industry_default" };
}
/*__STUDIO_WORKER_END:studioResolveAzBestTimes__*/

export async function azPlatformOutputsForRequest(env, requestId) {
  const outputRows = await outputRowsForProductionRequest(env, requestId);
  const ids = outputRows.flatMap((row) => arrayOrEmpty(f(row, "Platform_Output"))).filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id || "")));
  const records = [];
  for (const id of ids) {
    try { records.push(await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id)); } catch {}
  }
  if (records.length) return records;
  const parent = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  const contentId = studioFirstLinkedId(f(parent, "Promoted_Content_Item"));
  if (!contentId) return [];
  return listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 20,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: `AND({Test_Run_ID}=BLANK(),FIND("${contentId}", ARRAYJOIN({Content_Item})))`,
  }).catch(() => []);
}
/*__STUDIO_WORKER_END:azPlatformOutputsForRequest__*/

export function azOutputReadyToQueue(record) {
  if (Boolean(f(record, "Do_Not_Publish"))) return false;
  const publish = String(f(record, "Publish_Status") || "").trim();
  if (["Published", "Publishing"].includes(publish)) return false;
  const url = String(f(record, "Final_File_URL") || "").trim();
  const caption = String(f(record, "Output_Caption") || "").trim();
  const story = studioAzIsStory(f(record, "Studio_Output_Type") || f(record, "Format"));
  const thumb = studioAiThumbnailUrl(f(record, "Thumbnail_URL"));
  return Boolean(url && caption && (story || thumb));
}
/*__STUDIO_WORKER_END:azOutputReadyToQueue__*/

export function azOutputQueueBlockers(record) {
  const blockers = [];
  if (Boolean(f(record, "Do_Not_Publish"))) blockers.push("do_not_publish");
  if (["Published", "Publishing"].includes(String(f(record, "Publish_Status") || "").trim())) blockers.push("already_publishing");
  if (!String(f(record, "Final_File_URL") || "").trim()) blockers.push("final_file");
  if (!String(f(record, "Output_Caption") || "").trim()) blockers.push("caption");
  const story = studioAzIsStory(f(record, "Studio_Output_Type") || f(record, "Format"));
  if (!story && !studioAiThumbnailUrl(f(record, "Thumbnail_URL"))) blockers.push("cover");
  return blockers;
}
/*__STUDIO_WORKER_END:azOutputQueueBlockers__*/

export async function azStagePublicCoverFromSource(env, parent, sourceUrl, driveFileId = "") {
  const parentId = String(parent?.id || "").trim();
  if (!parentId) return { url: "", skip: "missing_parent" };
  let buffer = null;
  const driveId = String(driveFileId || extractGoogleDriveFileId(sourceUrl) || "").trim();
  if (driveId) {
    const token = await item4GoogleAccessToken(env);
    if (token) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?alt=media&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" }
        );
        const type = String(response.headers.get("Content-Type") || "").toLowerCase();
        if (response.ok && type.startsWith("image/") && !type.includes("svg")) {
          const bytes = await response.arrayBuffer();
          if (bytes && bytes.byteLength >= 80) buffer = bytes;
        } else {
          try { await response.body?.cancel(); } catch {}
        }
      } catch (error) {
        console.warn("AZ Drive cover download failed", driveId, error);
      }
    }
    if (!buffer) {
      const fetched = await item4FetchDriveThumbnailBytes(driveId, env).catch(() => null);
      if (fetched?.bytes) buffer = fetched.bytes;
    }
  }
  if (!buffer) buffer = await studioFetchImageBytes(sourceUrl);
  if (!buffer) return { url: "", skip: "missing_source_bytes" };
  const contentType = studioImageContentType(buffer);
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const key = `studio/previews/thumbnails/${parentId}/cover-9x16.${ext}`;
  let uploaded = await studioPutPublicObjectViaUploadWorker(env, {
    key,
    body: buffer,
    contentType,
    contentLength: buffer.byteLength,
    outputId: parentId,
    retainClass: "preview",
  });
  if (!uploaded.url && env.STUDIO_MEDIA) {
    try {
      await env.STUDIO_MEDIA.put(key, buffer, {
        httpMetadata: { contentType, cacheControl: "public, max-age=300" },
        customMetadata: { contentItemId: parentId, purpose: "az-grid-cover" },
      });
      uploaded = { url: `${ITEM4_MEDIA_PUBLIC_BASE}/${key}`, skip: "" };
    } catch (error) {
      console.warn("AZ cover STUDIO_MEDIA put failed", parentId, error);
    }
  }
  if (!uploaded.url) return { url: "", skip: uploaded.skip || "upload_failed" };
  if (!(await studioPublicJpegIsReachable(uploaded.url))) {
    return { url: "", skip: "cover_not_public" };
  }
  return { url: uploaded.url, skip: "" };
}
/*__STUDIO_WORKER_END:azStagePublicCoverFromSource__*/

export async function azEnsurePublicCovers(env, requestId, options = {}) {
  const stampLimit = Math.max(1, Math.min(6, Number(options.stampLimit) || 3));
  const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  if (!studioIsAzFinishedVideo(requestRecord)) return { skipped: "not_az" };
  const contentId = studioFirstLinkedId(f(requestRecord, "Promoted_Content_Item"));
  if (!contentId) return { waiting: "content" };
  let parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId);
  const outputs = await azPlatformOutputsForRequest(env, requestId);
  const parentAi = studioAiThumbnailUrl(f(parent, "Thumbnail_URL"));
  const mains = outputs.filter((row) => !studioAzIsStory(f(row, "Studio_Output_Type") || f(row, "Format")));
  const missing = mains.filter((row) => !studioAiThumbnailUrl(f(row, "Thumbnail_URL")));
  if (parentAi && !missing.length) return { ok: true, already: true, url: parentAi, stamped: 0 };

  let publicUrl = parentAi;
  if (!publicUrl) {
    const source = String(f(parent, "Thumbnail_URL") || "").trim();
    const driveId = String(f(parent, "Thumbnail_Google_Drive_File_ID") || "").trim();
    if (!source && !driveId) {
      try { await enqueueStudioProductionJob(env, requestId); } catch {}
      return { waiting: "generate", reason: "no_thumbnail_source" };
    }
    const staged = await azStagePublicCoverFromSource(env, parent, source, driveId);
    if (!staged.url) {
      try { await enqueueStudioProductionJob(env, requestId); } catch {}
      return { waiting: "stage", reason: staged.skip || "stage_failed" };
    }
    publicUrl = staged.url;
    parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentId, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Thumbnail_URL: publicUrl,
          Thumbnail_Status: "Generated",
          Include_Thumbnail: "Yes",
          ...studioCoverContentStatusFields(parent),
        },
        typecast: true,
      }),
    });
  }

  let stamped = 0;
  let remaining = 0;
  for (const row of outputs) {
    const current = studioAiThumbnailUrl(f(row, "Thumbnail_URL"));
    if (current === publicUrl) continue;
    if (stamped >= stampLimit) {
      remaining += 1;
      continue;
    }
    await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Thumbnail_URL: publicUrl }, typecast: true }),
    });
    stamped += 1;
  }
  return { ok: true, url: publicUrl, stamped, remaining, parent_id: contentId };
}
/*__STUDIO_WORKER_END:azEnsurePublicCovers__*/

export async function azEnsurePublicFinalFiles(env, requestId, options = {}) {
  const stampLimit = Math.max(1, Math.min(6, Number(options.stampLimit) || 3));
  const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  if (!studioIsAzFinishedVideo(requestRecord)) return { skipped: "not_az" };
  const masters = item4AssetManifest(requestRecord);
  const video = masters.find((asset) => item4LooksLikeVideoAsset(asset)) || masters[0];
  if (!video) return { waiting: "assets", reason: "no_master" };
  let publicUrl = item4FinishedMasterPlayUrl(video, requestRecord);
  if (!item4UrlIsPublicPublishCdn(publicUrl)) {
    // Avoid staging a huge master inside the kick path — produce job / continuation owns that.
    try { await enqueueStudioProductionJob(env, requestId); } catch {}
    return { waiting: "preview", reason: "finished_preview_not_public", current: publicUrl || null };
  }
  const outputs = await azPlatformOutputsForRequest(env, requestId);
  const mains = outputs.filter((row) => studioIsFinishedVideoFilePassthrough(row) || (
    !studioAzIsStory(studioOutputTypeLabel(row)) && studioFinishedOriginKind(requestRecord) === "finished-video"
  ));
  let stamped = 0;
  let remaining = 0;
  for (const row of mains) {
    const finalUrl = String(f(row, "Final_File_URL") || "").trim();
    const preview = String(f(row, "Studio_Preview_URL") || "").trim();
    const publish = String(f(row, "Publish_Asset_URL") || "").trim();
    if (
      item4UrlIsPublicPublishCdn(finalUrl)
      && finalUrl === publicUrl
      && (!preview || preview === publicUrl)
      && (!publish || publish === publicUrl)
    ) continue;
    if (stamped >= stampLimit) {
      remaining += 1;
      continue;
    }
    await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          Final_File_URL: publicUrl,
          Studio_Preview_URL: publicUrl,
          Publish_Asset_URL: publicUrl,
          Render_Status: String(f(row, "Render_Status") || "").trim() || "Rendered",
          Output_Status: /^ready for review$/i.test(String(f(row, "Output_Status") || ""))
            ? f(row, "Output_Status")
            : "Ready for Review",
        },
        typecast: true,
      }),
    });
    stamped += 1;
  }
  return { ok: true, url: publicUrl, stamped, remaining, mains: mains.length };
}
/*__STUDIO_WORKER_END:azEnsurePublicFinalFiles__*/

export async function azRestampFinishedStories(env, requestId, options = {}) {
  const limit = Math.max(1, Math.min(4, Number(options.limit) || 2));
  const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  if (!studioIsAzFinishedVideo(requestRecord) && studioFinishedOriginKind(requestRecord) !== "finished-video") {
    return { skipped: "not_finished_video" };
  }
  const outputs = await azPlatformOutputsForRequest(env, requestId);
  const stories = outputs.filter((row) => studioAzIsStory(studioOutputTypeLabel(row)));
  let restamped = 0;
  let remaining = 0;
  const ids = [];
  const cache = {
    requests: new Map([[requestId, requestRecord]]),
    outputRows: new Map(),
    parents: new Map(),
    profiles: new Map(),
  };
  for (const row of stories) {
    const notes = String(f(row, "Output_Notes") || "");
    const render = String(f(row, "Render_Status") || "").trim();
    const alreadyTeaser = item4FinishedStoryTeaserReady(row)
      && /ready for render|rendering|rendered/i.test(render);
    const needsTeaser = !alreadyTeaser && !/^rendering$/i.test(render) && (
      /Finished passthrough|story teaser|finished_story_teaser/i.test(notes)
      || (render === "Rendered" && Boolean(String(f(row, "Final_File_URL") || "").trim()))
      || !String(f(row, "Render_Clip_List_JSON") || "").trim()
    );
    if (!needsTeaser) continue;
    if (restamped >= limit) {
      remaining += 1;
      continue;
    }
    const context = await studioContinuationLoadContext(env, row, cache).catch(() => null);
    if (!context) {
      remaining += 1;
      continue;
    }
    await studioContinuationStampPackage(env, row, context);
    restamped += 1;
    ids.push(row.id);
  }
  if (restamped) {
    try { await enqueueStudioProductionJob(env, requestId); } catch {}
  }
  return { ok: true, restamped, remaining, ids };
}
/*__STUDIO_WORKER_END:azRestampFinishedStories__*/

export async function azAutoApproveIfReady(env, requestId, options = {}) {
  const requestRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  if (!studioIsAzFinishedVideo(requestRecord)) return { skipped: "not_az" };
  let cover = options.cover || null;
  if (!options.skipCover) {
    try {
      cover = await azEnsurePublicCovers(env, requestId, { stampLimit: options.coverStampLimit || 3 });
    } catch (error) {
      cover = { error: error instanceof Error ? error.message : String(error) };
      console.warn("AZ ensure public covers failed", requestId, error);
    }
  }
  let finals = options.finals || null;
  if (!options.skipFinals) {
    try {
      finals = await azEnsurePublicFinalFiles(env, requestId, { stampLimit: options.finalStampLimit || 3 });
    } catch (error) {
      finals = { error: error instanceof Error ? error.message : String(error) };
      console.warn("AZ ensure public finals failed", requestId, error);
    }
  }
  const outputs = await azPlatformOutputsForRequest(env, requestId);
  if (!outputs.length) return { waiting: "outputs", cover, finals };
  const pending = outputs.filter((row) => {
    const review = String(f(row, "Review_Status") || "").trim();
    const status = String(f(row, "Output_Status") || "").trim();
    if (review === "Approved" || status === "Approved for Publishing") return false;
    return true;
  });
  if (!pending.length) return { skipped: "already_queued", count: outputs.length, cover, finals };

  // Approve whichever destinations are ready now. Stories still rendering must not
  // hold Reels/Shorts/TikTok at Ready for Review (no human Approve gate on AZ).
  const assessed = pending.map((row) => ({
    row,
    id: row.id,
    platform: f(row, "Platform"),
    output_type: studioOutputTypeLabel(row),
    story: studioAzIsStory(studioOutputTypeLabel(row)),
    blockers: azOutputQueueBlockers(row),
    ready: studioOutputReadyForPublishApproval(row) && !azOutputQueueBlockers(row).length,
  }));
  const notReady = assessed.filter((item) => !item.ready);
  const approveLimit = Math.max(1, Math.min(2, Number(options.approveLimit) || 1));
  const toApprove = assessed.filter((item) => item.ready)
    .sort((a, b) => Number(a.story) - Number(b.story))
    .slice(0, approveLimit)
    .map((item) => item.row);
  if (!toApprove.length) {
    if (notReady.some((item) => !item.story && (item.blockers.includes("cover") || item.blockers.includes("caption") || item.blockers.includes("final_file")))) {
      try { await enqueueStudioProductionJob(env, requestId); } catch {}
    }
    const onlyStoriesRendering = notReady.length > 0 && notReady.every((item) => item.story);
    const pendingMains = pending.filter((row) => !studioAzIsStory(studioOutputTypeLabel(row)));
    // Mains already approved/queued — Stories still remotioning is success for AZ.
    if (onlyStoriesRendering && !pendingMains.length) {
      return {
        ok: true,
        skipped: "mains_queued",
        waiting: "story_render",
        approved_count: 0,
        cover,
        finals,
        not_ready: notReady.slice(0, 8).map((item) => ({
          id: item.id,
          platform: item.platform,
          blockers: item.blockers,
          story: item.story,
        })),
      };
    }
    return {
      waiting: onlyStoriesRendering ? "story_render" : "cover",
      cover,
      finals,
      pending_count: pending.length,
      ready_count: 0,
      not_ready: notReady.slice(0, 8).map((item) => ({
        id: item.id,
        platform: item.platform,
        blockers: item.blockers,
        story: item.story,
      })),
    };
  }
  const remainingApprove = Math.max(0, assessed.filter((item) => item.ready).length - toApprove.length);
  // One occupancy scan for the batch (cached). MAE rotation in the profile
  // timezone fills M1 then A1 then E1 then M2. Industry evening windows and
  // +3h occupancy bumps are what used to land NYC at 12:00 AM / 1:00 AM.
  const occupancyProfile = await item4ProductionProfileRecord(env, requestRecord).catch(() => null);
  const occupiedByPlatform = await studioOccupiedSchedulesOrEmpty(env, { profile: occupancyProfile });
  const reservedAll = studioFlattenOccupiedByPlatform(occupiedByPlatform);
  const timeZone = await studioScheduleTimeZoneForRecord(env, requestRecord);
  const stamp = new Date().toISOString();
  const approved = [];
  const scheduled = {};
  for (const row of toApprove) {
    const platform = String(f(row, "Platform") || "").trim();
    const outputType = String(f(row, "Studio_Output_Type") || f(row, "Format") || "").trim();
    const isStory = /story/i.test(outputType);
    // Stories may share a wall-clock slot; only non-stories occupy the platform lane.
    // The lane passed into approve is the real calendar. Stories use it only as a
    // fallback when no sibling time exists yet, then sit 10 minutes after that slot.
    const occupiedMs = studioOccupiedForPlatform(occupiedByPlatform, platform);
    const key = studioAzScheduleKey(platform, outputType);
    let iso = "";
    if (!isStory) {
      const existingIso = String(f(row, "Scheduled_Post_Date") || f(row, "Studio_Scheduled_At") || "").trim();
      iso = existingIso && !Number.isNaN(Date.parse(existingIso))
        ? new Date(existingIso).toISOString()
        : "";
      const existingMs = iso ? Date.parse(iso) : NaN;
      if (
        !iso
        || maeIsBlackoutLocalTime(existingMs, timeZone)
        || !maeIsPriorityLocalTime(existingMs, timeZone)
      ) {
        iso = studioSuggestedLocalDatetime(MAE_PRIORITY_SCHEDULE_WINDOWS, new Date(), {
          occupiedMs: reservedAll,
          platformOccupiedMs: occupiedMs,
          timeZone,
        });
      } else {
        iso = studioNextOpenScheduleIso(iso, occupiedMs, STUDIO_SCHEDULE_GAP_MS, { timeZone });
      }
    }
    const extraSiblings = Object.entries(scheduled).map(([scheduleKey, scheduleIso]) => {
      const splitAt = scheduleKey.indexOf("::");
      return {
        platform: splitAt >= 0 ? scheduleKey.slice(0, splitAt) : scheduleKey,
        output_type: splitAt >= 0 ? scheduleKey.slice(splitAt + 2) : "",
        scheduled_at: scheduleIso,
      };
    });
    const updated = await approveOutputRecordForPublishing(env, row, "AZ finished-video auto-queue", stamp, {
      ...(iso ? { scheduled_post_date: iso } : {}),
      timezone: timeZone,
    }, { occupiedMs, timeZone, extraSiblings });
    const bookedRaw = String(f(updated, "Scheduled_Post_Date") || iso || "").trim();
    const booked = studioScheduleMs(bookedRaw) ?? Date.parse(bookedRaw);
    if (Number.isFinite(booked) && !isStory) {
      (occupiedByPlatform[platform] ||= []).push(booked);
      reservedAll.push(booked);
    }
    approved.push(row.id);
    if (Number.isFinite(Date.parse(bookedRaw))) scheduled[key] = new Date(Date.parse(bookedRaw)).toISOString();
  }
  const notes = String(f(requestRecord, "Production_Notes") || "");
  if (!/az-schedule=/i.test(notes)) {
    await item4UpdateRequestState(env, requestId, {
      Production_Notes: `${notes}\n\naz-schedule=ready-now; auto-queued without Approve gate`.slice(0, 10000),
    }).catch(() => null);
  }
  const stillPendingStories = notReady.filter((item) => item.story).length;
  return {
    ok: true,
    approved_count: approved.length,
    remaining_approve: remainingApprove,
    waiting: stillPendingStories || remainingApprove ? (stillPendingStories ? "story_render" : "approve") : undefined,
    cover,
    finals,
    scheduled,
    not_ready: notReady.slice(0, 8).map((item) => ({
      id: item.id,
      platform: item.platform,
      blockers: item.blockers,
      story: item.story,
    })),
  };
}
/*__STUDIO_WORKER_END:azAutoApproveIfReady__*/

export async function azBuildPlanItems(env, record) {
  const notes = studioRequestNotesText(record);
  const horizontal = isHorizontalFinishedAspect(notes);
  const assets = item4AssetManifest(record);
  const photoCount = Math.max(1, item4EffectivePhotoCount(record, assets) || assets.length || 1);
  const hasVideo = true;
  const mappingIndex = await item4MappingIndex(env);
  const existingPlan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  const existingItems = Array.isArray(existingPlan?.items) ? existingPlan.items : [];
  if (existingItems.length) {
    return capFinishedPlanItems(existingItems
      .map((item) => ({
        platform: String(item?.platform || "").trim(),
        output_type: String(item?.output_type || "").trim(),
        aspect_ratio: String(item?.aspect_ratio || "").trim() || null,
        companion: Boolean(item?.companion) || item4IsCompanionOutputType(item?.output_type),
      }))
      .filter((item) => item.platform && item.output_type), { notes, horizontal });
  }
  const items = [];
  if (horizontal) {
    try {
      const chosen = item4PlanChoice("YouTube", "Standard Video", photoCount, { hasVideo, packageId: "video" });
      items.push(item4PlanItemFromChoice("YouTube", chosen, photoCount, mappingIndex));
    } catch (error) {
      console.warn("AZ horizontal default plan item failed", error);
    }
    return capFinishedPlanItems(items, { notes, horizontal });
  }
  for (const platform of AZ_DEFAULT_PLATFORMS) {
    const requested = AZ_DEFAULT_OVERRIDES[platform] || "";
    try {
      const chosen = item4PlanChoice(platform, requested, photoCount, { hasVideo, packageId: "video" });
      items.push(item4PlanItemFromChoice(platform, chosen, photoCount, mappingIndex));
    } catch (error) {
      console.warn("AZ default plan item failed", platform, error);
    }
  }
  const extras = item4NormalizePlanExtras([...AZ_DEFAULT_EXTRAS], [...AZ_DEFAULT_PLATFORMS], uniquePlanItems(items));
  for (const extra of extras) {
    try {
      const chosen = item4PlanChoice(extra.platform, extra.output_type, photoCount, { hasVideo, packageId: "video" });
      items.push(item4PlanItemFromChoice(extra.platform, chosen, photoCount, mappingIndex, { companion: extra.companion }));
    } catch {
      continue;
    }
  }
  return capFinishedPlanItems(items, { notes, horizontal: false });
}
/*__STUDIO_WORKER_END:azBuildPlanItems__*/

export async function azEnsurePlatformOutputs(env, requestRecord, options = {}) {
  if (!requestRecord?.id) return { skipped: "missing_request" };
  const contentId = studioFirstLinkedId(f(requestRecord, "Promoted_Content_Item"));
  if (!contentId) return { waiting: "content", production_request_id: requestRecord.id };
  // Video packages need up to 6 destinations (4 mains + IG/FB Stories). A
  // limit of 2 left mains stranded when the PRO lookup window was incomplete.
  const finishedVideo = studioFinishedOriginKind(requestRecord) === "finished-video";
  const expectedOutputs = finishedVideo ? azExpectedOutputCount(studioRequestNotesText(requestRecord)) : 6;
  const batchLimit = Math.max(1, Math.min(10, Number(options.limit) || expectedOutputs));
  let proRows = await outputRowsForProductionRequest(env, requestRecord.id, { includeInactive: true });
  const collapsed = await item4CollapseDuplicatePlanOutputs(env, proRows, { finishedVideo });
  if (collapsed.collapsed) {
    proRows = await outputRowsForProductionRequest(env, requestRecord.id, { includeInactive: true });
  }
  let enabled = proRows.filter((row) => Boolean(f(row, "Enabled")));
  if (finishedVideo) enabled = keepFinishedOutputRows(enabled, requestRecord);
  let synced = false;
  if (!enabled.length) {
    const items = await azBuildPlanItems(env, requestRecord);
    if (!items.length) return { error: "no_plan_items", production_request_id: requestRecord.id };
    const planItems = finishedVideo
      ? capFinishedPlanItems(items, { notes: studioRequestNotesText(requestRecord) })
      : items;
    await item4SyncPlanOutputs(env, requestRecord, planItems);
    const needsReview = planItems.some((item) => !item.aspect_ratio);
    const plan = {
      schema_version: "item4.output-plan.1",
      generated_at: new Date().toISOString(),
      production_request_record_id: requestRecord.id,
      source_asset_count: Math.max(1, item4AssetManifest(requestRecord).length),
      photo_count_kind: "exact",
      items: planItems,
      recovered_by: "az-ensure-outputs",
    };
    requestRecord = await item4UpdateRequestState(env, requestRecord.id, {
      Studio_Output_Plan_JSON: JSON.stringify(plan),
      Studio_Output_Plan_Status: needsReview ? "Needs Review" : "Ready",
      Target_Platforms: [...new Set(planItems.map((item) => item.platform))],
    });
    proRows = await outputRowsForProductionRequest(env, requestRecord.id);
    enabled = proRows.filter((row) => Boolean(f(row, "Enabled")));
    if (finishedVideo) enabled = keepFinishedOutputRows(enabled, requestRecord);
    synced = true;
  }

  const missingPo = enabled.filter((row) => !arrayOrEmpty(f(row, "Platform_Output")).some((id) => /^rec[A-Za-z0-9]+$/.test(String(id || ""))));
  if (!missingPo.length) {
    return {
      ok: true,
      already: true,
      synced,
      remaining: 0,
      enabled_output_count: enabled.length,
      platform_output_count: enabled.length,
      production_request_id: requestRecord.id,
      content_item_id: contentId,
    };
  }

  const fanout = await fanoutProductionRequestOutputsToContentItems(env, requestRecord, contentId, {
    onlyMissing: true,
    limit: batchLimit,
  });
  const remaining = Number(fanout?.remaining || 0);
  const linkedAfter = (await outputRowsForProductionRequest(env, requestRecord.id))
    .filter((row) => Boolean(f(row, "Enabled")))
    .filter((row) => arrayOrEmpty(f(row, "Platform_Output")).some((id) => /^rec[A-Za-z0-9]+$/.test(String(id || "")))).length;
  console.log(`AZ ensure platform outputs ${JSON.stringify({
    requestId: requestRecord.id,
    synced,
    enabled: enabled.length,
    missing_before: missingPo.length,
    fanout,
    linked_after: linkedAfter,
    remaining,
  })}`);
  return {
    ok: true,
    synced,
    fanout,
    remaining,
    enabled_output_count: enabled.length,
    platform_output_count: linkedAfter,
    production_request_id: requestRecord.id,
    content_item_id: contentId,
  };
}
/*__STUDIO_WORKER_END:azEnsurePlatformOutputs__*/

export async function advanceAzFinishedVideo(env, requestId, authorization, ctx = null, options = {}) {
  if (!requestId) return { skipped: "missing_request" };
  const phase = String(options.phase || "auto").trim().toLowerCase() || "auto";
  let record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  if (!studioIsAzFinishedVideo(record)) return { skipped: "not_az" };
  let auth = authorization;
  if (!auth?.organization?.record_id) {
    auth = await resolveStudioCronAuthorization(env);
  }
  const assets = item4AssetManifest(record);
  if (item4AssetsNeedStudioCompress(assets)) {
    await item4PulseStudioCompressJob(env, requestId).catch((error) => {
      console.warn("AZ compress pulse failed", requestId, error);
    });
    return { waiting: "compress", production_request_id: requestId, phase };
  }
  if (!item4FinishedVideoMastersReady(record, assets)) {
    return { waiting: "assets", production_request_id: requestId, phase };
  }
  const planStatus = String(f(record, "Studio_Output_Plan_Status") || "").trim();
  const existingPros = await outputRowsForProductionRequest(env, requestId, { includeInactive: true }).catch(() => []);
  const existingKeys = finishedEnabledKeysFromRows(existingPros, record);
  const expectedOutputCount = azExpectedOutputCount(studioRequestNotesText(record));
  if (existingKeys.size < expectedOutputCount && planStatus !== "Ready" && (phase === "auto" || phase === "plan" || phase === "outputs")) {
    const editable = ["Draft", "Ready"].includes(String(f(record, "Request_Status") || "").trim());
    if (editable) {
      const horizontal = isHorizontalFinishedAspect(studioRequestNotesText(record));
      const planCall = studioInternalJsonRequest(`/api/production-requests/${requestId}/plan`, {
        platforms: horizontal ? ["YouTube"] : [...AZ_DEFAULT_PLATFORMS],
        overrides: horizontal ? { YouTube: "Standard Video" } : { ...AZ_DEFAULT_OVERRIDES },
        extras: horizontal ? [] : [...AZ_DEFAULT_EXTRAS],
        package: "video",
      });
      await buildItem4OutputPlan(planCall.request, env, planCall.url, auth);
      record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
    }
  }
  if (studioIsFinishedPassthrough(record)) {
    const variantStatus = String(f(record, "Studio_Variant_Status") || "").trim();
    if (variantStatus !== "Ready" && variantStatus !== "Not Needed") {
      record = await item4UpdateRequestState(env, requestId, { Studio_Variant_Status: "Not Needed" });
    }
  }
  let status = String(f(record, "Request_Status") || "").trim();
  if (["Draft", "Ready"].includes(status) && !productionRequestRevisionOpen(record) && (phase === "auto" || phase === "promote")) {
    const promoteCall = studioInternalJsonRequest(`/api/production-requests/${requestId}/promote`, {});
    await promoteProductionRequestViaI3I4(promoteCall.request, env, promoteCall.url, auth, ctx);
    record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
    status = String(f(record, "Request_Status") || "").trim();
  }
  if (status === "Submitted" && (phase === "auto" || phase === "promote")) {
    const ideaId = studioFirstLinkedId(f(record, "Idea_Candidate"));
    if (ideaId) {
      const ideaNow = await waitForPromotionResult(env, ideaId, 24, 1250);
      if (promotionCompleted(ideaNow)) {
        await finalizeProductionRequestPromotion(env, requestId, ideaNow);
        record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
        status = String(f(record, "Request_Status") || "").trim();
      }
    }
    if (status === "Submitted") return { waiting: "awaiting_i4", production_request_id: requestId, phase };
  }
  let ensureOutputs = null;
  if (status === "Promoted" && (phase === "auto" || phase === "outputs")) {
    const proRows = await outputRowsForProductionRequest(env, requestId).catch(() => []);
    const enabled = proRows.filter((row) => Boolean(f(row, "Enabled")));
    const linked = enabled.filter((row) => arrayOrEmpty(f(row, "Platform_Output")).some((id) => /^rec[A-Za-z0-9]+$/.test(String(id || ""))));
    if (!enabled.length || linked.length < enabled.length) {
      try {
        ensureOutputs = await azEnsurePlatformOutputs(env, record, { limit: expectedOutputCount });
        record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
      } catch (error) {
        ensureOutputs = { error: error instanceof Error ? error.message : String(error) };
        console.warn("AZ ensure platform outputs failed", requestId, error);
      }
      if (Number(ensureOutputs?.remaining || 0) > 0 || ensureOutputs?.error) {
        return {
          waiting: "outputs",
          production_request_id: requestId,
          ensure_outputs: ensureOutputs,
          phase,
        };
      }
    }
  }

  if (phase === "cover") {
    const cover = await azEnsurePublicCovers(env, requestId, { stampLimit: 3 });
    return { ok: Boolean(cover?.ok), waiting: cover?.waiting || (cover?.remaining ? "cover_stamp" : undefined), cover, phase };
  }
  if (phase === "final" || phase === "finals") {
    const finals = await azEnsurePublicFinalFiles(env, requestId, { stampLimit: 3 });
    return { ok: Boolean(finals?.ok), waiting: finals?.waiting || (finals?.remaining ? "final_stamp" : undefined), finals, phase };
  }
  if (phase === "stories") {
    const stories = await azRestampFinishedStories(env, requestId, { limit: 2 });
    return {
      ok: Boolean(stories?.ok),
      waiting: stories?.restamped || stories?.remaining ? "story_render" : undefined,
      stories,
      phase,
    };
  }
  if (phase === "approve") {
    const approve = await azAutoApproveIfReady(env, requestId, {
      skipCover: true,
      skipFinals: true,
      approveLimit: 1,
    });
    return { ...approve, phase };
  }

  // auto: one light step per invoke — never cover+final+approve+continuation together.
  // Ready mains must auto-schedule even while Story teasers are still rendering.
  if (status === "Promoted") {
    const cover = await azEnsurePublicCovers(env, requestId, { stampLimit: 2 });
    if (cover?.waiting || Number(cover?.remaining || 0) > 0 || Number(cover?.stamped || 0) > 0) {
      return {
        waiting: cover?.waiting || "cover_stamp",
        cover,
        ensure_outputs: ensureOutputs,
        phase,
      };
    }
    const finals = await azEnsurePublicFinalFiles(env, requestId, { stampLimit: 2 });
    if (finals?.waiting || Number(finals?.remaining || 0) > 0 || Number(finals?.stamped || 0) > 0) {
      return {
        waiting: finals?.waiting || "final_stamp",
        cover,
        finals,
        ensure_outputs: ensureOutputs,
        phase,
      };
    }
    // Prefer scheduling ready destinations before (or without waiting on) Story remotion.
    // One approval per invoke — approveOutputRecordForPublishing is subrequest-heavy.
    const approveFirst = await azAutoApproveIfReady(env, requestId, {
      skipCover: true,
      skipFinals: true,
      cover,
      finals,
      approveLimit: 1,
    });
    if (
      Number(approveFirst?.approved_count || 0) > 0
      || approveFirst?.skipped === "already_queued"
      || approveFirst?.skipped === "mains_queued"
    ) {
      return ensureOutputs
        ? { ...approveFirst, ensure_outputs: ensureOutputs, phase }
        : { ...approveFirst, phase };
    }
    const stories = await azRestampFinishedStories(env, requestId, { limit: 1 });
    if (Number(stories?.restamped || 0) > 0 || Number(stories?.remaining || 0) > 0) {
      // Do not mask a real main-destination blocker (cover/final) as story_render success.
      if (approveFirst?.waiting && approveFirst.waiting !== "story_render") {
        return {
          ...approveFirst,
          stories,
          ensure_outputs: ensureOutputs,
          phase,
        };
      }
      return {
        ok: Boolean(approveFirst?.ok),
        skipped: approveFirst?.skipped,
        waiting: "story_render",
        cover,
        finals,
        stories,
        not_ready: approveFirst?.not_ready,
        ensure_outputs: ensureOutputs,
        phase,
      };
    }
    return ensureOutputs
      ? { ...approveFirst, ensure_outputs: ensureOutputs, phase }
      : { ...approveFirst, phase };
  }
  return { waiting: status || "unknown", production_request_id: requestId, phase };
}
/*__STUDIO_WORKER_END:advanceAzFinishedVideo__*/

export async function opsForceAzNavyPierTitle(env, options = {}) {
  const requestId = "reca7v6zi1b9QNanJ";
  const title = "Final Navy Pier Fireworks - Full Video";
  const phase = String(options.phase || "auto").trim().toLowerCase() || "auto";
  if (!env?.AIRTABLE_PAT) return { skipped: true, reason: "no_pat" };

  let record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  const notes = String(f(record, "Production_Notes") || "");
  if (!/origin=az-finished-video/i.test(notes) && !/az-auto-queue=1/i.test(notes)) {
    return { skipped: true, reason: "not_az", requestId };
  }

  const currentTitle = String(f(record, "Requested_Title") || "").trim();
  const currentMode = String(f(record, "Title_Mode") || "").trim();
  const already = currentMode === "Force exact" && currentTitle === title;
  if (!already && phase !== "approve") {
    record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Title_Mode: "Force exact", Requested_Title: title },
        typecast: true,
      }),
    });
  }

  let compress = null;
  if (phase === "auto" || phase === "compress") {
    const assets = item4AssetManifest(record);
    if (item4AssetsNeedStudioCompress(assets)) {
      try {
        compress = await item4PulseStudioCompressJob(env, requestId);
      } catch (error) {
        compress = { error: error instanceof Error ? error.message : String(error) };
      }
    }
  }

  let advance = null;
  try {
    const auth = await resolveStudioCronAuthorization(env).catch(() => null);
    advance = await advanceAzFinishedVideo(env, requestId, auth, null, { phase });
  } catch (error) {
    advance = { error: error instanceof Error ? error.message : String(error) };
    console.warn("ops az navy pier advance failed", requestId, error);
  }

  // Minimal diagnostic — never list PRO rows after approve (subrequest budget).
  const diagnostic = {
    requestId,
    title,
    already,
    phase,
    request_status: f(record, "Request_Status") || null,
    approved_count: Number(advance?.approved_count || 0) || 0,
    waiting: advance?.waiting || null,
    skipped: advance?.skipped || null,
    advance_ok: Boolean(advance?.ok),
  };
  console.log(`ops az navy pier diagnostic ${JSON.stringify({ diagnostic, advance })}`);
  return {
    ok: !advance?.error,
    diagnostic,
    compress,
    advance,
  };
}
/*__STUDIO_WORKER_END:opsForceAzNavyPierTitle__*/

export async function resumeAzFinishedVideoRequests(env, ctx = null) {
  const rows = await listRecords(env, PRODUCTION_REQUEST_TABLE, {
    limit: 20,
    sortField: "Created_At",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),FIND("origin=az-finished-video",{Production_Notes}&""),{Request_Status}!="Cancelled")',
  }).catch(() => []);
  if (!rows.length) return { resumed: 0 };
  const auth = await resolveStudioCronAuthorization(env).catch(() => null);
  const results = [];
  for (const row of rows.slice(0, 4)) {
    try {
      results.push(await advanceAzFinishedVideo(env, row.id, auth, ctx));
    } catch (error) {
      results.push({ id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { resumed: results.length, results };
}
/*__STUDIO_WORKER_END:resumeAzFinishedVideoRequests__*/

export function studioVibeCutOutputNeedsRemount(row, vibeTarget = 0) {
  const count = Number(f(row, "Selected_Clip_Count") || 0) || 0;
  const frames = Number(f(row, "Render_Total_Frames") || 0) || 0;
  const clipJson = String(f(row, "Render_Clip_List_JSON") || "").trim();
  const story = studioAzIsStory(studioOutputTypeLabel(row));
  if (story) return false;
  let parsedClipCount = 0;
  if (clipJson) {
    try {
      const parsed = JSON.parse(clipJson);
      parsedClipCount = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      parsedClipCount = 0;
    }
  }
  // Multi-clip montages still include id studio-source-1 as the first trim —
  // only treat as single-head when the list/count is actually one clip.
  const effectiveCount = Math.max(count, parsedClipCount);
  // Count/list of 1 = head-of-file trim. Ignore empty (0) rows still waiting on stamp.
  const singleHead = effectiveCount === 1;
  // Short-frame remount only for true single-head trims while produce is mid
  // flight. Multi-clip stamps can briefly show low Render_Total_Frames while
  // T1 expands duration — those must not remount until they finish wrong.
  const shortSingle = singleHead
    && vibeTarget > 0
    && frames > 0
    && frames < Math.round(vibeTarget * 30) - 15;
  const stampedDur = Number(f(row, "Studio_Effective_Video_Duration_Seconds") || 0) || 0;
  const durationMismatch = vibeTarget > 0
    && stampedDur > 0
    && Math.abs(stampedDur - vibeTarget) >= 2;
  const musicDur = Number(f(row, "Music_Duration_Seconds") || 0) || 0;
  const outputStatus = String(f(row, "Output_Status") || "").trim();
  const renderStatus = String(f(row, "Render_Status") || "").trim();
  const finishedWrong = (outputStatus === "Ready for Review" || renderStatus === "Rendered")
    && vibeTarget > 0
    && (
      (frames > 0 && frames < Math.round(vibeTarget * 30) - 15)
      || (musicDur > 0 && musicDur < vibeTarget - 2)
    );
  return singleHead || shortSingle || durationMismatch || finishedWrong;
}
/*__STUDIO_WORKER_END:studioVibeCutOutputNeedsRemount__*/

export async function studioClearVibeCutPassthroughOutputs(env, requestId, { vibeTarget = 0 } = {}) {
  const outputs = await azPlatformOutputsForRequest(env, requestId).catch(() => []);
  for (const row of outputs || []) {
    const notes = String(f(row, "Output_Notes") || "");
    const finalUrl = String(f(row, "Final_File_URL") || "").trim();
    const clipCount = Number(f(row, "Selected_Clip_Count") || 0) || 0;
    const singleHeadTrim = clipCount <= 1
      && Boolean(String(f(row, "Render_Clip_List_JSON") || "").trim())
      && /studio-source-1/.test(String(f(row, "Render_Clip_List_JSON") || ""));
    const passthroughStamp = /Finished passthrough/i.test(notes)
      || /finished-video:passthrough|ez-input=finished-video/i.test(notes)
      || Boolean(finalUrl && !String(f(row, "Composition_ID") || "").trim()
        && String(f(row, "Render_Status") || "") === "Rendered");
    // Only clear outputs that actually need remount. Do not wipe a correct
    // Ready for Review sibling (Adler Short 45s) when Standard finished short.
    if (!passthroughStamp && !singleHeadTrim && !studioVibeCutOutputNeedsRemount(row, vibeTarget)) continue;
    try {
      await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Output_Status: "In Production",
            Render_Status: "Ready for Render",
            Final_File_URL: null,
            Studio_Preview_URL: null,
            Publish_Asset_URL: null,
            Remotion_Job_ID: null,
            Composition_ID: null,
            Output_Filename: null,
            Render_Clip_List_JSON: null,
            Render_Total_Frames: null,
            Selected_Clip_Count: null,
            Studio_Effective_Video_Duration_Seconds: null,
            Video_Duration_Seconds_Override: null,
            Music_Duration_Seconds: null,
            // Drop Exact=1 (I4 defaults) so stamp/T1 can expand many beat trims.
            Requested_Video_Clip_Count_Mode: "AI decides",
            Requested_Video_Clip_Count_Exact: null,
            Requested_Video_Clip_Count_Min: null,
            Requested_Video_Clip_Count_Max: null,
            Timing_Status: "Pending",
            Timing_Timeline_JSON: null,
            Timing_Error_Message: null,
            Review_Status: null,
            Output_Notes: notes
              .replace(/Finished passthrough[^\n]*/gi, "Vibe Cut — remounting music montage.")
              .trim() || "Vibe Cut — remounting music montage.",
          },
          typecast: true,
        }),
      });
    } catch (error) {
      console.warn("vibe-cut passthrough output clear failed", row.id, error);
    }
  }
}
/*__STUDIO_WORKER_END:studioClearVibeCutPassthroughOutputs__*/

export async function enqueueStudioProductionJob(env, requestId, options = {}) {
  if (!requestId) return null;
  const record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
  const existing = parseStudioProductionJob(record);
  if (!options.force && (jobIsOpsPaused(existing) || isProducePaused(await readOpsQueueControls(env), requestId))) {
    return { skipped: "ops_paused", request_id: requestId, job: existing };
  }
  const step = String(existing?.step || "").trim();
  // Heal: single-master Vibe Cuts used to inherit finished-video:passthrough from the
  // one-video heuristic. Clear that route so produce stamps + T1 cut the source.
  // Also remount when a prior stamp left Selected_Clip_Count=1 (head-of-file trim).
  const vibeCut = studioIsVibeCut(record);
  const vibeCutPassthrough = vibeCut && /passthrough/i.test(String(existing?.route || ""));
  const vibeDirective = vibeCut ? parseVibeCutDirective(studioRequestNotesText(record)) : null;
  const vibeTarget = Number(vibeDirective?.target_seconds || 0) || 0;
  let vibeCutNeedsRemount = vibeCutPassthrough || Boolean(existing?.heal?.force_multiclip_remount);
  // Always inspect outputs for Vibe Cut remount needs (single-head trim, wrong
  // stamped duration, or finished multi-clip that rendered short of target —
  // Adler Standard kept Music_Duration_Seconds=30 / 900 frames after a 45s notes
  // rewrite). Do not wait for resume/blocked.
  if (vibeCut && !vibeCutNeedsRemount) {
    const outputs = await azPlatformOutputsForRequest(env, requestId).catch(() => []);
    vibeCutNeedsRemount = (outputs || []).some((row) => studioVibeCutOutputNeedsRemount(row, vibeTarget));
  }
  if (!existing?.job_id || vibeCutPassthrough || vibeCutNeedsRemount) {
    const finishedKind = studioFinishedOriginKind(record);
    const job = {
      schema_version: "studio.production-job.1",
      job_id: existing?.job_id || `spj-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      route: finishedKind ? `${finishedKind}:passthrough` : (vibeCut ? "uploaded:photo_sequence" : null),
      step: "themes",
      attempt: Number(existing?.attempt || 1) || 1,
      updated_at: new Date().toISOString(),
      error: null,
      detail: (vibeCutPassthrough || vibeCutNeedsRemount)
        ? "Rebuilding Vibe Cut multi-clip montage"
        : (finishedKind ? "Writing post caption" : STUDIO_PRODUCTION_JOB_LABELS.themes),
      percent: finishedKind ? 20 : 12,
    };
    if (vibeCutPassthrough || vibeCutNeedsRemount) {
      const priorHeal = (typeof existing?.heal === "object" && existing.heal) ? { ...existing.heal } : {};
      delete priorHeal.force_multiclip_remount;
      job.heal = {
        ...priorHeal,
        schema: "studio.produce-heal.1",
        vibe_cut_passthrough_cleared_at: new Date().toISOString(),
        vibe_cut_multiclip_remount_at: new Date().toISOString(),
        force_multiclip_remount: false,
        resume_count: 0,
        max_resumes: Number(existing?.heal?.max_resumes || 5) || 5,
      };
      await studioClearVibeCutPassthroughOutputs(env, requestId, { vibeTarget });
    } else if (existing?.heal) {
      job.heal = existing.heal;
    }
    const patchFields = {
      Studio_Production_Job_JSON: JSON.stringify(job),
      Updated_At: new Date().toISOString(),
    };
    if (vibeCut && vibeTarget > 0) {
      patchFields.Video_Duration_Seconds = vibeTarget;
    }
    await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId, {
      method: "PATCH",
      body: JSON.stringify({
        fields: patchFields,
        typecast: false,
      }),
    });
  }
  // Horizontal Vibe Cut: remount alone does not create a missing YouTube Short PO.
  // Fanout heal only runs on heavy cron (:00/:30), so Adler-style Short gaps sat
  // for up to 30 minutes. Fan out missing enabled PROs here on every enqueue.
  if (vibeCut) {
    try {
      const live = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
      const notesText = studioRequestNotesText(live);
      const parentId = studioFirstLinkedId(f(live, "Promoted_Content_Item"));
      if (parentId && isHorizontalVibeCutAspect(notesText)) {
        const plan = item4ParseJson(f(live, "Studio_Output_Plan_JSON"), null);
        const planItems = Array.isArray(plan?.items) ? plan.items : [];
        const capped = capVibeCutPlanItems(planItems.length ? planItems : [
          { platform: "YouTube", output_type: "Standard Video" },
          { platform: "YouTube", output_type: "Short" },
        ], { notes: notesText });
        if (capped.length) await item4SyncPlanOutputs(env, live, capped);
        const enabled = (await outputRowsForProductionRequest(env, requestId))
          .filter((row) => Boolean(f(row, "Enabled")));
        const missing = enabled.filter((row) =>
          !arrayOrEmpty(f(row, "Platform_Output")).some((id) => /^rec[A-Za-z0-9]+$/.test(String(id || "")))
        );
        if (missing.length) {
          await fanoutProductionRequestOutputsToContentItems(env, live, parentId, { onlyMissing: true });
        }
      }
    } catch (error) {
      console.warn("vibe-cut missing Short fanout failed", requestId, error);
    }
  }
  if (Boolean(options.resume) || vibeCutPassthrough || vibeCutNeedsRemount || step === "blocked" || step === "escalated") {
    return item4PulseStudioProduceJob(env, requestId, { resume: true });
  }
  return item4PulseStudioProduceJob(env, requestId);
}
/*__STUDIO_WORKER_END:enqueueStudioProductionJob__*/

export function studioOutputProductionRequestId(record, contentToRequest = new Map()) {
  return studioFirstLinkedId(f(record, "Production_Request"))
    || contentToRequest.get(studioFirstLinkedId(f(record, "Content_Item")))
    || null;
}
/*__STUDIO_WORKER_END:studioOutputProductionRequestId__*/

export async function loadStudioProductionJobsForOutputs(env, records) {
  const directIds = [];
  const contentIds = new Set();
  for (const record of records || []) {
    const direct = studioFirstLinkedId(f(record, "Production_Request"));
    if (direct && !directIds.includes(direct)) directIds.push(direct);
    const contentId = studioFirstLinkedId(f(record, "Content_Item"));
    if (contentId) contentIds.add(contentId);
  }
  const unresolvedContent = (records || []).some((record) => (
    !studioFirstLinkedId(f(record, "Production_Request"))
    && studioFirstLinkedId(f(record, "Content_Item"))
  ));
  const jobFields = ["Studio_Production_Job_JSON", "Promoted_Content_Item"];
  const recent = unresolvedContent
    ? await studioReadCoalesce("produce-jobs:recent", 20000, () => listRecords(env, PRODUCTION_REQUEST_TABLE, {
        limit: 50,
        sortField: "Created_At",
        sortDirection: "desc",
        filterFormula: 'AND({Test_Run_ID}=BLANK(),{Studio_Production_Job_JSON}!="")',
        fields: jobFields,
      }).catch(() => []))
    : [];
  const jobs = new Map();
  const contentToRequest = new Map();
  for (const row of recent || []) {
    const job = parseStudioProductionJob(row);
    if (job) jobs.set(row.id, job);
    const parentId = studioFirstLinkedId(f(row, "Promoted_Content_Item"));
    if (parentId && contentIds.has(parentId) && !contentToRequest.has(parentId)) {
      contentToRequest.set(parentId, row.id);
    }
  }
  const missingJobIds = directIds.filter((id) => !jobs.has(id)).slice(0, 25);
  if (missingJobIds.length) {
    const formula = missingJobIds.length === 1
      ? `RECORD_ID()="${airtableFormulaEscape(missingJobIds[0])}"`
      : `OR(${missingJobIds.map((id) => `RECORD_ID()="${airtableFormulaEscape(id)}"`).join(",")})`;
    const fetched = await listRecords(env, PRODUCTION_REQUEST_TABLE, {
      limit: missingJobIds.length,
      filterFormula: formula,
      fields: jobFields,
    }).catch(() => []);
    for (const requestRecord of fetched || []) {
      if (requestRecord?.id) jobs.set(requestRecord.id, parseStudioProductionJob(requestRecord));
    }
  }
  return {
    get(record) {
      const id = studioOutputProductionRequestId(record, contentToRequest);
      return id ? jobs.get(id) || null : null;
    },
  };
}
/*__STUDIO_WORKER_END:loadStudioProductionJobsForOutputs__*/

export async function startOrphanedStudioProductionJobs(env) {
  const orphans = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: 25,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Output_Status}="In Production",{Remotion_Job_ID}="",{Published_At}=BLANK())',
  }).catch(() => []);
  const requestIds = [];
  for (const po of orphans || []) {
    let requestId = studioOutputProductionRequestId(po);
    if (!requestId) {
      const contentId = studioFirstLinkedId(f(po, "Content_Item"));
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
  const pulses = [];
  for (const requestId of requestIds.slice(0, 6)) {
    try {
      await enqueueStudioProductionJob(env, requestId);
      pulses.push({ key: "STUDIO_PRODUCE_ORPHAN", request: requestId, started: true });
    } catch (error) {
      pulses.push({
        key: "STUDIO_PRODUCE_ORPHAN",
        request: requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (pulses.length) console.log("Studio produce orphan kick", JSON.stringify({ count: pulses.length, pulses }));
  return pulses;
}
/*__STUDIO_WORKER_END:startOrphanedStudioProductionJobs__*/

export async function pulseStudioProduceOpsAlert(env, requestId, job) {
  const runnerUrl = String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
  if (!runnerUrl) {
    console.warn("studio produce ops-alert skipped: PIPELINE_RUNNER_URL is not set", requestId);
    return { skipped: "no-runner" };
  }
  const secret = String(env.PIPELINE_RUNNER_SHARED_SECRET || "");
  const response = await fetch(`${runnerUrl}/jobs/studio-produce/ops-alert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Pipeline-Secret": secret } : {}),
    },
    body: JSON.stringify({ production_request_record_id: requestId, job }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn("studio produce ops-alert failed", requestId, response.status, payload);
  }
  const webhook = String(env.PRODUCE_HEAL_WEBHOOK_URL || "").trim();
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "studio_produce_escalated",
          schema: "studio.produce-heal.1",
          request_id: requestId,
          error: job?.error || null,
          heal: job?.heal || null,
          route: job?.route || null,
          studio_url: "https://studio.chicagoshining.com/",
          instruction:
            "Investigate this Production Request produce failure, apply a live fix if safe, then resume studio-produce.",
        }),
      });
    } catch (error) {
      console.warn("studio produce heal webhook failed", requestId, error);
    }
  }
  return { response, payload };
}
/*__STUDIO_WORKER_END:pulseStudioProduceOpsAlert__*/

export function studioProduceHealState(job) {
  const raw = job && typeof job.heal === "object" && job.heal ? job.heal : {};
  const maxResumes = Math.max(1, Math.min(20, Number(raw.max_resumes) || 5));
  return {
    schema: "studio.produce-heal.1",
    resume_count: Math.max(0, Number(raw.resume_count) || 0),
    max_resumes: maxResumes,
    last_resume_at: raw.last_resume_at || null,
    last_block_error: raw.last_block_error || null,
    last_step: raw.last_step || null,
    escalated_at: raw.escalated_at || null,
    notified_at: raw.notified_at || null,
  };
}
/*__STUDIO_WORKER_END:studioProduceHealState__*/

export function isTransientRenderBlockError(blockError) {
  return /(timed?\s*out|timeout|connectionpool|connection reset|502|503|504)/i.test(String(blockError || ""));
}
/*__STUDIO_WORKER_END:isTransientRenderBlockError__*/

export async function resumeStaleStudioProductionJobs(env, options = {}) {
  // Prefer Updated_At so an older active Vibe Cut (Chicago Walk with me) is not
  // starved by newer Draft/Ready rows that sort higher on Created_At.
  const rows = await listRecords(env, PRODUCTION_REQUEST_TABLE, {
    limit: 40,
    sortField: "Updated_At",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Studio_Production_Job_JSON}!="")',
  }).catch(() => []);
  const ids = [...new Set((rows || []).map((row) => String(row?.id || "").trim()).filter((id) => id.startsWith("rec")))];
  const pulses = [];
  const now = Date.now();
  const staleAfter = Number(options.staleAfterMs || 180000);
  const queueControls = await readOpsQueueControls(env);
  for (const requestId of ids.slice(0, 16)) {
    try {
      const record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId);
      const job = parseStudioProductionJob(record);
      const step = String(job?.step || "").trim();
      if (step === "done" || step === "escalated") continue;
      if (jobIsOpsPaused(job) || isProducePaused(queueControls, requestId)) {
        pulses.push({
          key: "STUDIO_PRODUCE",
          request: requestId,
          skipped: "ops_paused",
        });
        continue;
      }

      const blockError = String(job?.error || "");
      const heal = studioProduceHealState(job);
      const isBlocked = step === "blocked";
      const transientRenderBlock = isBlocked && isTransientRenderBlockError(blockError);
      const skippableBlock = isBlocked && /no_eligible_p2_route/i.test(blockError);
      const music404Block = isBlocked && isDriveMusic404Error(blockError);
      // Deleted library music is data_repair. Resume cannot restore the Drive file.
      if (music404Block) {
        pulses.push({
          key: "STUDIO_PRODUCE",
          request: requestId,
          skipped: "drive_music_404",
        });
        continue;
      }
      // Airtable 422 on Selected_Assets_JSON. Resume restamps the same oversized payload.
      if (isBlocked && isProduceStamp422Error(blockError)) {
        pulses.push({
          key: "STUDIO_PRODUCE",
          request: requestId,
          skipped: "produce_stamp_422",
        });
        continue;
      }
      // Always retry blocked jobs (any other failure class) until the heal budget is exhausted.
      const updated = Date.parse(String(job?.updated_at || ""));
      const stale =
        isBlocked ||
        skippableBlock ||
        transientRenderBlock ||
        !job?.job_id ||
        !Number.isFinite(updated) ||
        (now - updated) >= staleAfter;
      if (!stale) continue;

      if (isBlocked && heal.resume_count >= heal.max_resumes) {
        const escalatedJob = {
          ...job,
          step: "escalated",
          attempt: 1,
          updated_at: new Date().toISOString(),
          error: blockError || "Produce retries exhausted",
          detail: "Escalated — needs investigation",
          percent: 5,
          heal: {
            ...heal,
            last_block_error: blockError || heal.last_block_error,
            last_step: heal.last_step || step,
            escalated_at: new Date().toISOString(),
            notified_at: new Date().toISOString(),
          },
        };
        await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId, {
          method: "PATCH",
          body: JSON.stringify({
            fields: { Studio_Production_Job_JSON: JSON.stringify(escalatedJob), Updated_At: new Date().toISOString() },
            typecast: false,
          }),
        });
        const alert = await pulseStudioProduceOpsAlert(env, requestId, escalatedJob);
        pulses.push({
          key: "STUDIO_PRODUCE",
          request: requestId,
          escalated: true,
          resume_count: heal.resume_count,
          alert_ok: Boolean(alert?.payload?.ok || alert?.skipped),
        });
        continue;
      }

      const nextHeal = isBlocked
        ? {
            ...heal,
            resume_count: heal.resume_count + 1,
            last_resume_at: new Date().toISOString(),
            last_block_error: blockError || heal.last_block_error,
            last_step: step,
            escalated_at: null,
          }
        : heal;

      let resumedJob = {
        ...job,
        heal: nextHeal,
        updated_at: new Date().toISOString(),
      };
      if (isBlocked) {
        if (transientRenderBlock) {
          resumedJob = {
            ...resumedJob,
            step: "render",
            attempt: 1,
            error: null,
            detail: "Rendering",
            percent: Math.max(Number(job?.percent) || 0, 70),
          };
        } else {
          // Keep step=blocked so the runner resume path runs pick_resume_step.
          resumedJob = {
            ...resumedJob,
            attempt: 1,
            error: null,
            detail: "Self-heal resume",
          };
        }
        await airtableFetch(env, PRODUCTION_REQUEST_TABLE, requestId, {
          method: "PATCH",
          body: JSON.stringify({
            fields: { Studio_Production_Job_JSON: JSON.stringify(resumedJob), Updated_At: new Date().toISOString() },
            typecast: false,
          }),
        });
      }

      // Must go through enqueueStudioProductionJob so Vibe Cut single-clip /
      // passthrough remounts run before the runner resume pulse. Direct
      // item4PulseStudioProduceJob skipped that gate (Walk with me Chicago).
      const payload = await enqueueStudioProductionJob(env, requestId, { resume: true });
      pulses.push({
        key: "STUDIO_PRODUCE",
        request: requestId,
        resumed: true,
        self_heal: isBlocked,
        resume_count: nextHeal.resume_count,
        step: payload?.payload?.job?.step || payload?.job?.step || resumedJob.step || step || "themes",
      });
    } catch (error) {
      pulses.push({
        key: "STUDIO_PRODUCE",
        request: requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (pulses.length) console.log("Studio produce watchdog", JSON.stringify({ count: pulses.length, pulses }));
  return pulses;
}
/*__STUDIO_WORKER_END:resumeStaleStudioProductionJobs__*/

export function studioLastModifiedStaleFormula(minutes) {
  const n = Math.max(1, Math.round(Number(minutes) || 2));
  return `IS_BEFORE(LAST_MODIFIED_TIME(), DATEADD(NOW(), -${n}, "minutes"))`;
}
/*__STUDIO_WORKER_END:studioLastModifiedStaleFormula__*/

export function studioFreshTtsLease(parent, maxMs = 20 * 60 * 1000) {
  const raw = String(f(parent, "Voiceover_Normalization_Details") || "").trim();
  if (!raw.startsWith("tts-lease:")) return false;
  const epoch = Number(raw.slice("tts-lease:".length).split(":")[0]);
  if (!Number.isFinite(epoch) || epoch <= 0) return false;
  return Date.now() - epoch <= maxMs;
}
/*__STUDIO_WORKER_END:studioFreshTtsLease__*/

export function studioOutputVoiceoverRequired(row, parent = null) {
  const mode = String(
    f(row, "Studio_Effective_Voiceover_Mode")
    || f(parent || {}, "Include_Voiceover")
    || "",
  ).trim().toLowerCase();
  return mode === "yes" || mode === "true" || mode === "1";
}
/*__STUDIO_WORKER_END:studioOutputVoiceoverRequired__*/

export async function studioHealReadyNoJobVoiceover(env, row, cache = { parents: new Map(), requests: new Map() }) {
  if (String(f(row, "Voiceover_URL") || "").trim()) return null;
  const parentId = studioFirstLinkedId(f(row, "Content_Item"));
  if (!parentId) return null;
  if (!cache.parents.has(parentId)) {
    cache.parents.set(parentId, await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId).catch(() => null));
  }
  const parent = cache.parents.get(parentId);
  if (!parent) return null;
  if (!studioOutputVoiceoverRequired(row, parent)) return null;
  const voStatus = String(f(parent, "Voiceover_Status") || "").trim();
  if (/^(not needed|skipped)$/i.test(voStatus)) return null;

  if (!cache.pulsedParents) cache.pulsedParents = new Set();
  if (cache.pulsedParents.has(parentId)) {
    return { action: "voiceover_already_requested", parent_id: parentId };
  }

  const parentVo = String(f(parent, "Voiceover_URL") || "").trim();
  if (parentVo) {
    await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
      method: "PATCH",
      body: JSON.stringify({ fields: { Voiceover_URL: parentVo }, typecast: true }),
    });
    return { action: "copied_parent_voiceover", parent_id: parentId };
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

  const fields = {};
  if (!/^ready for voiceover$/i.test(String(f(parent, "Content_Status") || "").trim())) {
    fields.Content_Status = "Ready for Voiceover";
  }
  if (!/^(ready|generated)$/i.test(voStatus)) fields.Voiceover_Status = "Ready";
  if (String(f(parent, "Voiceover_Script") || "").trim() && String(f(parent, "Script_Status") || "").trim() !== "Generated") {
    fields.Script_Status = "Generated";
  }
  if (Object.keys(fields).length) {
    await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentId, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
    cache.parents.delete(parentId);
  }
  // A fresh tts-lease means ElevenLabs was already called for this sentence.
  // Pulsing again spends the character quota on the same line (Getty 608).
  if (studioFreshTtsLease(parent)) {
    cache.pulsedParents.add(parentId);
    return { action: "voiceover_already_requested", parent_id: parentId, reason: "tts_lease" };
  }
  cache.pulsedParents.add(parentId);
  const p2 = String(f(parent, "Voiceover_Script") || "").trim()
    ? await pulseStudioP2Handoff(env, parentId, requestRecord || {}).catch(() => ({ ok: false }))
    : { ok: false, skipped: "no_script" };
  let resumed = false;
  if (requestId) {
    // Produce owns script generation; resuming lands on the audio step (pick_resume_step).
    await enqueueStudioProductionJob(env, requestId, { resume: true }).then(() => { resumed = true; }).catch(() => null);
  }
  return {
    action: "rearmed_voiceover",
    parent_id: parentId,
    request_id: requestId || null,
    rearmed: Object.keys(fields),
    p2_ok: Boolean(p2?.ok),
    resumed,
  };
}
/*__STUDIO_WORKER_END:studioHealReadyNoJobVoiceover__*/

export function studioStreamMediaAssetId(value) {
  const text = String(value || "").trim();
  const match = text.match(/^\/api\/media-assets\/(rec[A-Za-z0-9]+)\/stream(?:\?|$)/);
  return match ? match[1] : "";
}
/*__STUDIO_WORKER_END:studioStreamMediaAssetId__*/

export async function studioRepairUnfetchableRenderSources(env, row) {
  const raw = String(f(row, "Render_Clip_List_JSON") || "").trim();
  if (!raw || !raw.includes("/api/media-assets/")) return { repaired: 0, unresolved: [] };
  let clips;
  try { clips = JSON.parse(raw); } catch { return { repaired: 0, unresolved: ["invalid-json"] }; }
  if (!Array.isArray(clips)) return { repaired: 0, unresolved: ["not-an-array"] };

  const cache = new Map();
  const unresolved = [];
  let repaired = 0;
  for (const clip of clips) {
    if (!clip || typeof clip !== "object") continue;
    const url = String(clip.url || "").trim();
    const src = String(clip.src || "").trim();
    if (!url.startsWith("/api/media-assets/") && !src.startsWith("/api/media-assets/")) continue;
    const mediaId = String(
      clip.mediaAssetRecordId
      || clip.media_asset_record_id
      || studioStreamMediaAssetId(url)
      || studioStreamMediaAssetId(src)
      || ""
    ).trim();
    if (!/^rec[A-Za-z0-9]+$/.test(mediaId)) {
      unresolved.push(mediaId || url || src || "unknown");
      continue;
    }
    let asset = cache.get(mediaId);
    if (!asset) {
      asset = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, mediaId).catch(() => null);
      cache.set(mediaId, asset || {});
    }
    const driveId = String(f(asset, "Google Drive File ID") || "").trim();
    const driveUrl = String(f(asset, "Google Drive URL") || "").trim()
      || (driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : "");
    if (!/^https?:\/\//i.test(driveUrl)) {
      unresolved.push(mediaId);
      continue;
    }
    clip.url = driveUrl;
    clip.src = driveUrl;
    if (driveId && !String(clip.googleDriveFileId || "").trim()) clip.googleDriveFileId = driveId;
    repaired += 1;
  }

  if (!repaired || unresolved.length) return { repaired, unresolved };
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Render_Clip_List_JSON: JSON.stringify(clips),
        Render_Status: "Ready for Render",
        Output_Status: "In Production",
        Remotion_Job_ID: "",
        Remotion_Status_URL: "",
        Remotion_Props_JSON: "",
        Remotion_Error_Message: "",
        Final_File_Error_Message: "",
        Final_File_URL: "",
        Final_File_ID: "",
        Output_URL: "",
        Final_File_Storage_Status: null,
      },
      typecast: true,
    }),
  });
  return { repaired, unresolved: [] };
}
/*__STUDIO_WORKER_END:studioRepairUnfetchableRenderSources__*/

export function studioPrivateDriveWatermarkSignature(row) {
  const props = String(f(row, "Remotion_Props_JSON") || "");
  const err = String(f(row, "Remotion_Error_Message") || f(row, "Final_File_Error_Message") || "");
  const propsMatch = /"watermarkUrl"\s*:\s*"https?:\/\/(?:drive|docs)\.google\.com/i.test(props);
  const errorMatch = /PRIVATE_DRIVE_WATERMARK/i.test(err)
    || (/watermark/i.test(err)
      && /drive\.google\.com|ERR_BLOCKED_BY_ORB|HTTP status code:\s*403|Error loading image with src/i.test(err));
  return propsMatch || errorMatch;
}
/*__STUDIO_WORKER_END:studioPrivateDriveWatermarkSignature__*/

export function studioChicagoWatermarkOutput(row) {
  const brand = String(f(row, "Brand_Text") || "");
  const profile = JSON.stringify(f(row, "Content_Profile") || "");
  return /chicagoshining/i.test(`${brand} ${profile}`);
}
/*__STUDIO_WORKER_END:studioChicagoWatermarkOutput__*/

export async function studioParkChicagoWatermarkRender(env, row) {
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Render_Status: "Blocked",
        Output_Status: "In Production",
        Remotion_Job_ID: "",
        Remotion_Status_URL: "",
        Remotion_Props_JSON: "",
        Remotion_Error_Message: "PRIVATE_DRIVE_WATERMARK: waiting for Remotion watermark localization; old renderer cannot fetch drive.google.com watermark safely.",
        Final_File_Error_Message: "",
      },
      typecast: true,
    }),
  });
}
/*__STUDIO_WORKER_END:studioParkChicagoWatermarkRender__*/

export async function studioRemotionPrivateDriveLocalizationReady(env = null) {
  // Remotion must localize Drive watermarks via pipeline-runner. Do NOT treat the
  // Studio Access-gated /api/public/branding/watermark.png URL as ready — that
  // path saved Cloudflare HTML as watermark.png and parked CI 239–243.
  try {
    const response = await fetch("https://render.chicagoshining.com/health", {
      method: "GET",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    });
    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (payload?.privateDriveImageLocalization === true && payload?.watermarkLocalization === true) {
        return true;
      }
    }
  } catch {}
  return false;
}
/*__STUDIO_WORKER_END:studioRemotionPrivateDriveLocalizationReady__*/

export async function studioResetPrivateDriveWatermarkRender(env, row) {
  await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, row.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Render_Status: "Ready for Render",
        Output_Status: "In Production",
        Remotion_Job_ID: "",
        Remotion_Status_URL: "",
        Remotion_Props_JSON: "",
        Remotion_Error_Message: "",
        Final_File_Error_Message: "",
        Final_File_URL: "",
        Final_File_ID: "",
        Output_URL: "",
        Final_File_Storage_Status: null,
      },
      typecast: true,
    }),
  });
}
/*__STUDIO_WORKER_END:studioResetPrivateDriveWatermarkRender__*/

export function studioExtendClipsToCoverVoiceover(row) {
  // Output 2156: spoken VO slightly longer than stamped render duration after
  // round(VO×fps). Extend the last clip to ceil(VO×fps) and requeue R4.
  const err = String(f(row, "Remotion_Error_Message") || "").trim();
  if (!/Spoken audio must never run past the video end/i.test(err)) return null;
  let clips;
  try {
    clips = JSON.parse(String(f(row, "Render_Clip_List_JSON") || ""));
  } catch {
    return null;
  }
  if (!Array.isArray(clips) || !clips.length) return null;
  let total = 0;
  for (const clip of clips) {
    if (!clip || typeof clip !== "object") continue;
    total += Math.max(0, Math.round(Number(clip.durationFrames) || 0));
  }
  if (total <= 0) return null;
  let voiceSeconds = Number(f(row, "Voiceover_Duration_Seconds") || 0);
  const match = err.match(/Voiceover is\s+([0-9.]+)s/i);
  if ((!Number.isFinite(voiceSeconds) || voiceSeconds <= 0) && match) {
    voiceSeconds = Number(match[1]);
  }
  if (!Number.isFinite(voiceSeconds) || voiceSeconds <= 0) return null;
  const required = Math.max(1, Math.ceil(voiceSeconds * 30));
  if (required <= total) return null;
  const last = [...clips].reverse().find((clip) => clip && typeof clip === "object");
  if (!last) return null;
  const lastFrames = Math.max(1, Math.round(Number(last.durationFrames) || 0));
  last.durationFrames = lastFrames + (required - total);
  let cursor = 0;
  for (const clip of clips) {
    if (!clip || typeof clip !== "object") continue;
    clip.startFrame = cursor;
    cursor += Math.max(0, Math.round(Number(clip.durationFrames) || 0));
  }
  const fields = {
    Render_Clip_List_JSON: JSON.stringify(clips),
    Render_Total_Frames: required,
    Remotion_Error_Message: "",
    Remotion_Job_ID: "",
    Render_Status: "Ready for Render",
  };
  const rawTimeline = String(f(row, "Timing_Timeline_JSON") || "").trim();
  if (rawTimeline) {
    try {
      const timeline = JSON.parse(rawTimeline);
      if (timeline && typeof timeline === "object") {
        timeline.duration_frames = required;
        timeline.duration_seconds = required / 30;
        fields.Timing_Timeline_JSON = JSON.stringify(timeline);
      }
    } catch {
      // keep clip+frame patch even when timeline JSON is stale
    }
  }
  return fields;
}
/*__STUDIO_WORKER_END:studioExtendClipsToCoverVoiceover__*/

export async function studioHealVoiceoverExceedsRender(env, options = {}) {
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const limit = Math.max(1, Math.min(8, Number(options.limit) || 4));
  const rows = await listRecords(env, outputTable, {
    limit: Math.max(limit, 12),
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Render_Status}="Blocked",FIND("Spoken audio must never run past the video end",{Remotion_Error_Message}&"")>0)',
  }).catch(() => []);
  const pulses = [];
  let healed = 0;
  for (const row of rows || []) {
    if (healed >= limit) break;
    const fields = studioExtendClipsToCoverVoiceover(row);
    if (!fields) {
      pulses.push({ key: "R4_VO_EXCEEDS_RENDER", id: row.id, skipped: "cannot_extend" });
      continue;
    }
    try {
      await airtableFetch(env, outputTable, row.id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
      const payload = await item4PulseR4Python(env, { outputRecordId: row.id });
      healed += 1;
      pulses.push({ key: "R4_VO_EXCEEDS_RENDER", id: row.id, payload, repaired: true, frames: fields.Render_Total_Frames });
    } catch (error) {
      pulses.push({
        key: "R4_VO_EXCEEDS_RENDER",
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { healed, pulses };
}
/*__STUDIO_WORKER_END:studioHealVoiceoverExceedsRender__*/

export async function healStuckStudioRenders(env) {
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const pulses = [];
  const voCache = { parents: new Map(), requests: new Map() };
  const rendererSupportsPrivateDrive = await studioRemotionPrivateDriveLocalizationReady(env);

  try {
    const voExceeds = await studioHealVoiceoverExceedsRender(env, { limit: 4 });
    for (const pulse of voExceeds?.pulses || []) pulses.push(pulse);
  } catch (error) {
    pulses.push({
      key: "R4_VO_EXCEEDS_RENDER",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Exact regression signature: ChicagoShining watermark was embedded in
  // Remotion_Props_JSON as a private Drive URL. Chromium then fails it with
  // Google 403 / ERR_BLOCKED_BY_ORB. Do not blindly loop R4 while the old
  // renderer is still live. Once health advertises localization support, clear
  // the stale job and requeue a small batch each tick.
  const privateDriveWatermarkRows = await listRecords(env, outputTable, {
    limit: 12,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),OR(FIND("drive.google.com",{Remotion_Props_JSON}&"")>0,FIND("PRIVATE_DRIVE_WATERMARK",{Remotion_Error_Message}&"")>0),OR({Render_Status}="Blocked",{Render_Status}="Failed",{Render_Status}="Rendering",{Render_Status}="Ready for Render"))',
  }).catch(() => []);
  let privateDriveRequeues = 0;
  for (const row of privateDriveWatermarkRows || []) {
    if (!studioPrivateDriveWatermarkSignature(row)) continue;
    if (!rendererSupportsPrivateDrive) {
      pulses.push({ key: "R4_PRIVATE_DRIVE_WATERMARK", id: row.id, skipped: "renderer_not_updated" });
      continue;
    }
    if (privateDriveRequeues >= 3) {
      pulses.push({ key: "R4_PRIVATE_DRIVE_WATERMARK", id: row.id, skipped: "staggered_to_next_tick" });
      continue;
    }
    try {
      await studioResetPrivateDriveWatermarkRender(env, row);
      const payload = await item4PulseR4Python(env, { outputRecordId: row.id });
      privateDriveRequeues += 1;
      pulses.push({ key: "R4_PRIVATE_DRIVE_WATERMARK", id: row.id, payload, repaired: true });
    } catch (error) {
      pulses.push({ key: "R4_PRIVATE_DRIVE_WATERMARK", id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const invalidSourceRows = await listRecords(env, outputTable, {
    limit: 12,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),FIND("/api/media-assets/",{Render_Clip_List_JSON}&"")>0,OR({Render_Status}="Ready for Render",{Render_Status}="Rendering",{Render_Status}="Failed"))',
  }).catch(() => []);
  for (const row of invalidSourceRows || []) {
    try {
      const repair = await studioRepairUnfetchableRenderSources(env, row);
      if (repair.unresolved.length) {
        pulses.push({ key: "R4_UNFETCHABLE_SOURCE_REPAIR", id: row.id, error: `unresolved: ${repair.unresolved.join(", ")}` });
        continue;
      }
      if (!repair.repaired) continue;
      const payload = await item4PulseR4Python(env, { outputRecordId: row.id });
      pulses.push({ key: "R4_UNFETCHABLE_SOURCE_REPAIR", id: row.id, payload, repaired: repair.repaired });
    } catch (error) {
      pulses.push({ key: "R4_UNFETCHABLE_SOURCE_REPAIR", id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  // Orphan Airtable choice "Ready to Render" (FB slideshow wording) is not
  // matched by R4/T1 selectors which require "Ready for Render". Outputs
  // 1702–1705 Upper West Side parked for days with a complete package.
  const readyToTypo = await listRecords(env, outputTable, {
    limit: 8,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Render_Status}="Ready to Render",{Remotion_Job_ID}="",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0,{Format}!="Story",{Studio_Output_Type}!="Story")',
  }).catch(() => []);
  for (const row of readyToTypo || []) {
    try {
      await airtableFetch(env, outputTable, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Render_Status: "Ready for Render",
            Remotion_Error_Message: "",
            Final_File_Error_Message: "",
          },
          typecast: true,
        }),
      });
      pulses.push({ key: "R4_READY_TO_RENDER_TYPO", id: row.id, repaired: true });
    } catch (error) {
      pulses.push({
        key: "R4_READY_TO_RENDER_TYPO",
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Prep VO/timing for queue candidates, then admit at most one Remotion start.
  // Do not pulse R4 for every Ready row — that stamped many "Rendering" / Trying Again
  // labels while Remotion can only run one job.
  const readyNoJob = await listRecords(env, outputTable, {
    limit: 24,
    sortField: "Output_ID",
    sortDirection: "asc",
    filterFormula: STUDIO_RENDER_QUEUE_CANDIDATE_FORMULA,
  }).catch(() => []);
  for (const row of readyNoJob || []) {
    if (!rendererSupportsPrivateDrive && studioChicagoWatermarkOutput(row)) {
      try {
        await studioParkChicagoWatermarkRender(env, row);
        pulses.push({ key: "R4_PRIVATE_DRIVE_WATERMARK", id: row.id, skipped: "parked_until_renderer_updated" });
      } catch (error) {
        pulses.push({ key: "R4_PRIVATE_DRIVE_WATERMARK", id: row.id, error: error instanceof Error ? error.message : String(error) });
      }
      continue;
    }
    try {
      const vo = await studioHealReadyNoJobVoiceover(env, row, voCache);
      if (vo) {
        pulses.push({ key: "VO_STUCK_READY", id: row.id, payload: vo });
        if (vo.action !== "copied_parent_voiceover") continue;
      }
    } catch (error) {
      pulses.push({ key: "VO_STUCK_READY", id: row.id, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const timing = String(f(row, "Timing_Status") || "").trim();
    const timeline = String(f(row, "Timing_Timeline_JSON") || "").trim();
    if ((timing === "Pending" || !timing) && timeline) {
      await airtableFetch(env, outputTable, row.id, {
        method: "PATCH",
        body: JSON.stringify({ fields: { Timing_Status: "Ready" }, typecast: true }),
      }).catch(() => null);
    }
    if ((timing === "Pending" || !timing) && !timeline) {
      try {
        const payload = await item4PulseT1Python(env, { outputRecordId: row.id, maxRuns: 1 });
        pulses.push({ key: "T1_STUCK_READY", id: row.id, payload });
      } catch (error) {
        pulses.push({ key: "T1_STUCK_READY", id: row.id, error: error instanceof Error ? error.message : String(error) });
      }
      continue;
    }
  }
  try {
    const admitted = await studioAdmitRenderQueue(env, { limit: 80 });
    pulses.push({ key: "R4_QUEUE_ADMIT", ...admitted });
  } catch (error) {
    pulses.push({ key: "R4_QUEUE_ADMIT", error: error instanceof Error ? error.message : String(error) });
  }
  // Completed MP4 left on Render_Status=Rendering / Output_Status=In Production
  // (Output 1807 YouTube Short). longRendering below requires a Remotion job and
  // blank Final_File_URL, so it never heals this. Promote to Ready for Review.
  const staleRenderingDone = await listRecords(env, outputTable, {
    limit: 12,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Published_At}=BLANK(),{Do_Not_Publish}=0,{Render_Status}="Rendering",{Final_File_URL}!="",OR({Output_Status}="In Production",{Output_Status}="Rendering",AND({Review_Status}="Review Sent",{Output_Status}!="Ready for Review",{Output_Status}!="Approved for Publishing",{Output_Status}!="Published")))',
  }).catch(() => []);
  for (const row of staleRenderingDone || []) {
    try {
      const review = String(f(row, "Review_Status") || "").trim();
      const fields = {
        Render_Status: "Rendered",
        Output_Status: "Ready for Review",
        Remotion_Error_Message: "",
        Final_File_Error_Message: "",
      };
      if (!review || review === "Pending" || review === "Ready for Review") {
        fields.Review_Status = "Review Sent";
      }
      await airtableFetch(env, outputTable, row.id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
      pulses.push({ key: "R5_STALE_RENDERING_FINALIZED", id: row.id, repaired: true });
    } catch (error) {
      pulses.push({ key: "R5_STALE_RENDERING_FINALIZED", id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const longRendering = await listRecords(env, outputTable, {
    limit: 8,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: `AND({Test_Run_ID}=BLANK(),{Render_Status}="Rendering",{Remotion_Job_ID}!="",{Final_File_URL}="",${studioLastModifiedStaleFormula(15)})`,
  }).catch(() => []);
  for (const row of longRendering || []) {
    try {
      const payload = await item4PulseR5Python(env, { outputRecordId: row.id, maxRuns: 1 });
      const stillRendering = String(payload?.details?.run?.reason || payload?.details?.runs?.[0]?.reason || "") === "still_rendering";
      pulses.push({ key: "R5_LONG_RENDER", id: row.id, payload, still_rendering: stillRendering });
    } catch (error) {
      pulses.push({ key: "R5_LONG_RENDER", id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const failedRenders = await listRecords(env, outputTable, {
    limit: 6,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Render_Status}="Failed")',
  }).catch(() => []);
  for (const row of failedRenders || []) {
    if (studioPrivateDriveWatermarkSignature(row)) {
      if (!rendererSupportsPrivateDrive) {
        pulses.push({ key: "R4_FAILED_REQUEUE", id: row.id, skipped: "private_drive_watermark_renderer_not_updated" });
      }
      continue;
    }
    const err = String(f(row, "Remotion_Error_Message") || f(row, "Final_File_Error_Message") || "");
    if (isDriveMusic404Error(err)) {
      pulses.push({ key: "R4_FAILED_REQUEUE", id: row.id, skipped: "drive_music_404" });
      continue;
    }
    if (!deskFailedNeedsHeal({
      render_error: err,
      last_modified: f(row, "Last_Modified") || f(row, "Updated_At") || f(row, "Last_Render_Attempt_At"),
    })) continue;
    try {
      await airtableFetch(env, outputTable, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Render_Status: "Ready for Render",
            Remotion_Job_ID: "",
            Remotion_Error_Message: "",
            Final_File_Error_Message: "",
          },
          typecast: true,
        }),
      });
      const payload = await item4PulseR4Python(env, { outputRecordId: row.id });
      pulses.push({ key: "R4_FAILED_REQUEUE", id: row.id, payload });
    } catch (error) {
      pulses.push({ key: "R4_FAILED_REQUEUE", id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (pulses.length) {
    console.log("Studio stuck-render heal", JSON.stringify({
      count: pulses.length,
      pulses: pulses.map((row) => ({ key: row.key, id: row.id, error: row.error || null })),
    }));
  }
  return pulses;
}
/*__STUDIO_WORKER_END:healStuckStudioRenders__*/

export async function studioCompleteNativePhotoPublishArming(env, record, note = "Native photo approve-incomplete heal") {
  const stamp = new Date().toISOString();
  let current = record;
  if (studioOutputIsNativePhoto(current)) {
    await item4PulseLetterPython(env, { outputRecordId: current.id }).catch((error) => {
      console.warn("native photo branding before incomplete-approve heal failed", current.id, error);
    });
    current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, current.id).catch(() => current);
  }
  const prepared = await studioEnsureNativePublishSlides(env, current);
  const scheduledIso = String(f(prepared, "Scheduled_Post_Date") || f(current, "Scheduled_Post_Date") || "").trim();
  const existingNotes = String(f(prepared, "Review_Notes") || f(current, "Review_Notes") || "").trim();
  const handoff = studioPublishHandoffFields(prepared, { scheduledPostDate: scheduledIso });
  const fields = {
    Review_Status: "Approved",
    Output_Status: "Approved for Publishing",
    Publish_Status: studioArmedPublishStatus(prepared, scheduledIso),
    Publish_Method: "Automated",
    Auto_Publish_Enabled: true,
    Do_Not_Publish: false,
    Review_Decision_At: stamp,
    Review_Notes: [existingNotes, note, `Studio Pipeline completed native-photo approve arming at ${stamp}.`].filter(Boolean).join("\n\n"),
    ...handoff,
  };
  // Prefer schedule-aware Publish_Status from handoff when present.
  if (handoff.Publish_Status) fields.Publish_Status = handoff.Publish_Status;
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, prepared.id || current.id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}
/*__STUDIO_WORKER_END:studioCompleteNativePhotoPublishArming__*/

export async function studioHealNativePhotoReviewStrands(env, options = {}) {
  const limit = Math.max(1, Math.min(12, Number(options.limit || 8)));
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const rows = await listRecords(env, outputTable, {
    limit: Math.max(limit * 4, 20),
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Published_At}=BLANK(),{Do_Not_Publish}=0,{Render_Status}="Native Photo Route",OR({Output_Status}="Ready for Review",{Output_Status}="Approved for Publishing",{Output_Status}="Published"))',
  }).catch(() => []);
  const mapped = (rows || []).map((record) => mapDeskInventoryOutput(record));
  const byContent = new Map();
  for (const row of mapped) {
    const key = String(row.content_item_id || "").trim();
    if (!key) continue;
    if (!byContent.has(key)) byContent.set(key, []);
    byContent.get(key).push(row);
  }
  const healed = [];
  const stamp = new Date().toISOString();
  for (const row of mapped) {
    if (healed.length >= limit) break;
    const siblings = byContent.get(String(row.content_item_id || "").trim()) || [];
    const strand = classifyNativePhotoReviewStrand(row, siblings);
    const incomplete = classifyNativePhotoApproveIncomplete(row);
    if (!strand && !incomplete) continue;
    const live = (rows || []).find((record) => record.id === row.id) || row;
    try {
      if (strand && String(row.output_status || "").trim() === "Ready for Review") {
        await approveOutputRecordForPublishing(
          env,
          live,
          "Native photo review-strand heal (full approve)",
          stamp,
          {},
        );
        healed.push({
          key: "NATIVE_PHOTO_REVIEW_STRAND",
          id: row.id,
          output_id: row.output_id || null,
          fingerprint: strand.fingerprint,
          mode: "full_approve",
        });
        continue;
      }
      if (incomplete) {
        await studioCompleteNativePhotoPublishArming(
          env,
          live,
          "Native photo approve-incomplete heal (finish arming)",
        );
        healed.push({
          key: "NATIVE_PHOTO_APPROVE_INCOMPLETE",
          id: row.id,
          output_id: row.output_id || null,
          fingerprint: incomplete.fingerprint,
          mode: "complete_arming",
        });
      }
    } catch (error) {
      healed.push({
        key: strand ? "NATIVE_PHOTO_REVIEW_STRAND" : "NATIVE_PHOTO_APPROVE_INCOMPLETE",
        id: row.id,
        output_id: row.output_id || null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (healed.length) console.log("Studio native-photo review/approve heal", JSON.stringify({ count: healed.length, healed }));
  return healed;
}
/*__STUDIO_WORKER_END:studioHealNativePhotoReviewStrands__*/

export async function studioHealAwaitingApprovalStaleRfr(env, options = {}) {
  const limit = Math.max(1, Math.min(20, Number(options.limit || 12)));
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const rows = await listRecords(env, outputTable, {
    limit: Math.max(limit * 3, 30),
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Published_At}=BLANK(),{Do_Not_Publish}=0,{Output_Status}="Ready for Review",{Review_Status}="Approved",OR({Publish_Status}="Ready to Schedule",{Publish_Status}="Ready to Publish",{Publish_Status}="Scheduled",{Publish_Status}="Publishing"))',
  }).catch(() => []);
  const healed = [];
  for (const record of rows || []) {
    if (healed.length >= limit) break;
    const row = mapDeskInventoryOutput(record);
    const finding = classifyAwaitingApprovalStaleRfr(row);
    if (!finding) continue;
    try {
      const updated = await airtableFetch(env, outputTable, record.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: { Output_Status: "Approved for Publishing" },
          typecast: true,
        }),
      });
      await studioSupabaseWriteThroughOutput(env, updated, "stale-rfr-heal");
      healed.push({
        key: "AWAITING_APPROVAL_STALE_RFR",
        id: record.id,
        output_id: row.output_id || null,
        fingerprint: finding.fingerprint,
      });
    } catch (error) {
      healed.push({
        key: "AWAITING_APPROVAL_STALE_RFR",
        id: record.id,
        output_id: row.output_id || null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (healed.length) console.log("Studio awaiting-approval stale RFR heal", JSON.stringify({ count: healed.length, healed }));
  return healed;
}
/*__STUDIO_WORKER_END:studioHealAwaitingApprovalStaleRfr__*/

export async function studioHealPhantomRerender(env, options = {}) {
  const limit = Math.max(1, Math.min(16, Number(options.limit || 8)));
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const rows = await listRecords(env, outputTable, {
    limit: Math.max(limit * 3, 24),
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Published_At}=BLANK(),{Do_Not_Publish}=0,{Output_Status}="In Production",{Review_Status}="Changes Requested",OR({Render_Status}="Native Photo Route",AND({Final_File_URL}!="",OR({Render_Status}="Waiting in Render Queue",{Render_Status}="Rendered",{Render_Status}="Ready to Render",{Render_Status}=BLANK()))))',
  }).catch(() => []);
  const healed = [];
  const nowMs = Date.now();
  for (const record of rows || []) {
    if (healed.length >= limit) break;
    const row = mapDeskInventoryOutput(record);
    const finding = classifyPhantomRerender(row, nowMs);
    if (!finding) continue;
    const renderStatus = String(row.render_status || "").trim();
    const existingNotes = String(f(record, "Review_Notes") || "").trim();
    const line = `Cleared phantom rerender (${finding.fingerprint}). The finished file was already present and no render was running. Returned to Ready for Review without approving.`;
    const fields = {
      Output_Status: "Ready for Review",
      Review_Status: "Review Sent",
      Publish_Status: "Not Ready",
      Review_Notes: [existingNotes, line].filter(Boolean).join("\n\n"),
    };
    if (renderStatus !== "Native Photo Route") fields.Render_Status = "Rendered";
    try {
      await airtableFetch(env, outputTable, record.id, {
        method: "PATCH",
        body: JSON.stringify({ fields, typecast: true }),
      });
      healed.push({
        key: "PHANTOM_RERENDER",
        id: record.id,
        output_id: row.output_id || null,
        fingerprint: finding.fingerprint,
      });
    } catch (error) {
      healed.push({
        key: "PHANTOM_RERENDER",
        id: record.id,
        output_id: row.output_id || null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (healed.length) console.log("Studio phantom rerender heal", JSON.stringify({ count: healed.length, healed }));
  return healed;
}
/*__STUDIO_WORKER_END:studioHealPhantomRerender__*/

export async function studioHealFailedStatuses(env, options = {}) {
  const limit = Math.max(1, Math.min(8, Number(options.limit || 6)));
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const pulses = [];
  const failedPublish = await listRecords(env, outputTable, {
    limit,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Published_At}=BLANK(),{Do_Not_Publish}=0,{Auto_Publish_Enabled}=1,OR({Publish_Status}="Failed",AND({Publish_Error_Message}!="",OR({Publish_Status}="Ready to Publish",{Publish_Status}="Publishing"))))',
  }).catch(() => []);
  for (const row of failedPublish || []) {
    const err = String(f(row, "Publish_Error_Message") || "");
    const status = String(f(row, "Publish_Status") || "").trim();
    const tiktokTerminalAuthFailure = String(f(row, "Platform") || "") === "TikTok"
      && (
        /unauthorized|authentication failure|(^|[^0-9])401([^0-9]|$)|(^|[^0-9])403([^0-9]|$)/i.test(err)
        || String(f(row, "TikTok_Draft_Status") || "") === "Manual Fallback"
      );
    // TTD1 deliberately parks repeated 401/403 failures after five attempts.
    // Quality recovery must never undo that terminal fence or it creates an
    // unbounded auth retry storm (output 927 reached hundreds of attempts).
    // Desk inventory classifies these as tiktok_auth_signature (code_bug) so
    // Quality Agent aligns PIPELINE_SECRET_SHA256 on the city auth Worker,
    // then rearms Ready for Delivery once and republishes.
    if (tiktokTerminalAuthFailure) {
      pulses.push({ key: "TIKTOK_AUTH_PARKED", id: row.id, skipped: "terminal_auth_failure" });
      continue;
    }
    const needsHeal = deskFailedNeedsHeal({
      publish_error: err,
      last_publish_attempt_at: f(row, "Last_Publish_Attempt_At"),
      last_modified: f(row, "Last_Modified") || f(row, "Updated_At"),
    });
    if (status !== "Failed" && !deskTransientPublishError(err) && !needsHeal) continue;
    if (status === "Failed" && !needsHeal) continue;
    const corruptUpload = /2207082|media upload has failed/i.test(err);
    const alreadyRetried = Number(f(row, "Publish_Attempt_Count") || 0) >= 2
      || Number(f(row, "Studio_Publish_Dispatch_Count") || 0) >= 2;
    if (corruptUpload && alreadyRetried && String(f(row, "Render_Status") || "") !== "Rendering") {
      try {
        await airtableFetch(env, outputTable, row.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              Render_Status: "Ready for Render",
              Remotion_Job_ID: "",
              Remotion_Error_Message: "",
              Platform_Media_ID: "",
              Publish_Status: "Ready to Publish",
              Publish_Error_Message: "",
              Publish_Locked_By: "",
              Publish_Locked_At: null,
              Studio_Publish_Dispatch_Count: 0,
            },
            typecast: true,
          }),
        });
        const payload = await item4PulseR4Python(env, { outputRecordId: row.id });
        pulses.push({ key: "R4_CORRUPT_PUBLISH_MP4", id: row.id, payload });
      } catch (error) {
        pulses.push({
          key: "R4_CORRUPT_PUBLISH_MP4",
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }
    try {
      await airtableFetch(env, outputTable, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Publish_Status: "Ready to Publish",
            Publish_Error_Message: "",
            Publish_Locked_By: "",
            Publish_Locked_At: null,
            Publish_Started_At: null,
            Publish_Retry_Eligible: true,
            Publish_Next_Retry_At: null,
            Studio_Publish_Dispatch_Count: 0,
            Platform_Media_ID: /in_progress|still being processed/i.test(err)
              ? (f(row, "Platform_Media_ID") || "")
              : "",
          },
          typecast: true,
        }),
      });
      const refreshed = await airtableFetch(env, outputTable, row.id).catch(() => row);
      const dispatched = await studioDispatchApprovedPublishNow(env, refreshed);
      pulses.push({
        key: "PUBLISH_FAILED_REQUEUE",
        id: row.id,
        ok: dispatched?.ok !== false,
        target: dispatched?.target || dispatched?.skipped || null,
        message: dispatched?.message || null,
      });
    } catch (error) {
      pulses.push({
        key: "PUBLISH_FAILED_REQUEUE",
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (pulses.length) {
    console.log("Studio failed-status heal", JSON.stringify({
      count: pulses.length,
      pulses: pulses.map((row) => ({ key: row.key, id: row.id, error: row.error || null })),
    }));
  }
  return pulses;
}
/*__STUDIO_WORKER_END:studioHealFailedStatuses__*/

export async function studioHealIgCarouselTooManyChildren(env, options = {}) {
  const limit = Math.max(1, Math.min(6, Number(options.limit || 4)));
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const pulses = [];
  const rows = await listRecords(env, outputTable, {
    limit,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Published_At}=BLANK(),{Do_Not_Publish}=0,{IG_Carousel_Parent_Container_ID}="",OR({Studio_Output_Type}="Carousel",{Platform_Output_Type}="Instagram Carousel"),OR(FIND("too little or too many attachments",{IG_Carousel_Error_Message}&"")>0,AND({IG_Carousel_Child_Count}>10,{IG_Carousel_Status}="Children Ready")))',
  }).catch(() => []);
  for (const row of rows || []) {
    const mapped = {
      id: row.id,
      platform: f(row, "Platform"),
      studio_output_type: f(row, "Studio_Output_Type"),
      platform_output_type: f(row, "Platform_Output_Type"),
      ig_carousel_status: f(row, "IG_Carousel_Status"),
      ig_carousel_error: f(row, "IG_Carousel_Error_Message"),
      ig_carousel_error_stage: f(row, "IG_Carousel_Error_Stage"),
      ig_carousel_child_count: f(row, "IG_Carousel_Child_Count"),
      image_count: f(row, "Image_Count"),
      published_at: f(row, "Published_At"),
    };
    if (!classifyIgCarouselTooManyChildren(mapped)) continue;
    const prior = Number(f(row, "IG_Carousel_Child_Count") || f(row, "Image_Count") || 0) || 0;
    const capped = Math.min(10, Math.max(2, prior > 10 ? 10 : prior || 10));
    try {
      await airtableFetch(env, outputTable, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            IG_Carousel_Child_Count: capped,
            Image_Count: capped,
            IG_Carousel_Status: "Children Ready",
            IG_Carousel_Error_Stage: "",
            IG_Carousel_Error_Message: "",
            IG_Carousel_Next_Retry_At: null,
            Publish_Retry_Eligible: true,
            Publish_Next_Retry_At: null,
            Publish_Locked_By: "",
            Publish_Locked_At: null,
            Publish_Started_At: null,
          },
          typecast: true,
        }),
      });
      const refreshed = await airtableFetch(env, outputTable, row.id).catch(() => row);
      const payload = await studioPulseAp3c(env, refreshed);
      pulses.push({
        key: "IG_CAROUSEL_CLAMP_AP3C",
        id: row.id,
        prior_child_count: prior,
        capped_child_count: capped,
        ok: payload?.ok !== false,
        payload,
      });
    } catch (error) {
      pulses.push({
        key: "IG_CAROUSEL_CLAMP_AP3C",
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (pulses.length) {
    console.log("Studio IG carousel child-count heal", JSON.stringify({
      count: pulses.length,
      pulses: pulses.map((row) => ({ key: row.key, id: row.id, error: row.error || null })),
    }));
  }
  return pulses;
}

/*__STUDIO_WORKER_END:studioHealIgCarouselTooManyChildren__*/

export async function studioHealIgCarouselChildVerificationRace(env, options = {}) {
  const limit = Math.max(1, Math.min(6, Number(options.limit || 4)));
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const pulses = [];
  const rows = await listRecords(env, outputTable, {
    limit,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Published_At}=BLANK(),{Do_Not_Publish}=0,FIND("AP1C child-ID verification mismatch",{IG_Carousel_Error_Message}&"")>0)',
  }).catch(() => []);

  for (const row of rows || []) {
    const mapped = {
      id: row.id,
      platform: f(row, "Platform"),
      studio_output_type: f(row, "Studio_Output_Type"),
      platform_output_type: f(row, "Platform_Output_Type"),
      ig_carousel_status: f(row, "IG_Carousel_Status"),
      ig_carousel_error: f(row, "IG_Carousel_Error_Message"),
      ig_carousel_error_stage: f(row, "IG_Carousel_Error_Stage"),
      ig_carousel_child_count: f(row, "IG_Carousel_Child_Count"),
      image_count: f(row, "Image_Count"),
      published_at: f(row, "Published_At"),
    };
    const incident = classifyIgCarouselChildVerificationRace(mapped);
    if (!incident) continue;

    const expected = Math.min(10, Math.max(2, Number(
      incident.expected_child_count
      || f(row, "IG_Carousel_Child_Count")
      || f(row, "Image_Count")
      || 0
    ) || 0));
    const linked = arrayOrEmpty(f(row, "Carousel Slides"));
    let slides = [];
    try {
      slides = await Promise.all(linked.map((id) => airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, id)));
    } catch (error) {
      pulses.push({
        key: "IG_AP1C_VERIFY_RACE",
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const required = slides
      .filter((slide) => !Boolean(f(slide, "Deleted From Carousel")))
      .sort((a, b) => Number(f(a, "Current Order") || f(a, "Slide Number") || 0) - Number(f(b, "Current Order") || f(b, "Slide Number") || 0))
      .slice(0, expected);
    const childIds = required
      .map((slide) => String(f(slide, "IG_Child_Container_ID") || "").trim())
      .filter(Boolean);

    try {
      if (required.length === expected && childIds.length === expected) {
        await airtableFetch(env, outputTable, row.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              IG_Carousel_Status: "Children Processing",
              Publish_Next_Retry_At: null,
              Publish_Retry_Eligible: false,
              IG_Carousel_Error_Stage: "",
              IG_Carousel_Children_JSON: JSON.stringify({
                created_count: expected,
                verified_at: new Date().toISOString(),
                repair: "quality-agent-ap1c-verification-race",
              }),
              IG_Carousel_Error_Message: "",
              IG_Carousel_Next_Retry_At: null,
              IG_Carousel_Children_Ready_Count: 0,
              IG_Carousel_Last_Completed_Stage: "AP1C",
              Publish_Locked_By: "",
              Publish_Locked_At: null,
              Publish_Started_At: null,
            },
            typecast: true,
          }),
        });
        const refreshed = await airtableFetch(env, outputTable, row.id).catch(() => row);
        const payload = await studioPulseAp2c(env, refreshed);
        pulses.push({
          key: "IG_AP1C_VERIFY_RACE",
          id: row.id,
          verified_children: childIds.length,
          expected_children: expected,
          action: "preserve_children_and_advance_ap2c",
          ok: payload?.ok !== false,
          payload,
        });
        continue;
      }

      // A required child really is missing. AP1C owns child creation, so return
      // the parent to its eligible state and rerun AP1C once instead of
      // inventing/reusing a partial container set.
      await airtableFetch(env, outputTable, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            IG_Carousel_Status: "Assets Ready",
            Publish_Next_Retry_At: null,
            Publish_Retry_Eligible: true,
            IG_Carousel_Next_Retry_At: null,
            Publish_Locked_By: "",
            Publish_Locked_At: null,
            Publish_Started_At: null,
          },
          typecast: true,
        }),
      });
      const refreshed = await airtableFetch(env, outputTable, row.id).catch(() => row);
      const payload = await studioPulseAp1c(env, refreshed);
      pulses.push({
        key: "IG_AP1C_VERIFY_RACE",
        id: row.id,
        verified_children: childIds.length,
        expected_children: expected,
        action: "rerun_ap1c_once_missing_child",
        ok: payload?.ok !== false,
        payload,
      });
    } catch (error) {
      pulses.push({
        key: "IG_AP1C_VERIFY_RACE",
        id: row.id,
        verified_children: childIds.length,
        expected_children: expected,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (pulses.length) {
    console.log("Studio IG AP1C verification-race heal", JSON.stringify({
      count: pulses.length,
      pulses: pulses.map((row) => ({
        id: row.id,
        action: row.action || null,
        verified_children: row.verified_children ?? null,
        expected_children: row.expected_children ?? null,
        error: row.error || null,
      })),
    }));
  }
  return pulses;
}

/*__STUDIO_WORKER_END:studioHealIgCarouselChildVerificationRace__*/

export async function studioHealIgCarouselChildPollFailure(env, options = {}) {
  const limit = Math.max(1, Math.min(6, Number(options.limit || 4)));
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const pulses = [];
  const rows = await listRecords(env, outputTable, {
    limit,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Published_At}=BLANK(),{Do_Not_Publish}=0,OR(FIND("AP2C verified terminal child failure or poll timeout",{IG_Carousel_Error_Message}&"")>0,FIND("AP2C verified child-count mismatch",{IG_Carousel_Error_Message}&"")>0))',
  }).catch(() => []);

  for (const row of rows || []) {
    const mapped = {
      id: row.id,
      platform: f(row, "Platform"),
      studio_output_type: f(row, "Studio_Output_Type"),
      platform_output_type: f(row, "Platform_Output_Type"),
      ig_carousel_status: f(row, "IG_Carousel_Status"),
      ig_carousel_error: f(row, "IG_Carousel_Error_Message"),
      ig_carousel_error_stage: f(row, "IG_Carousel_Error_Stage"),
      ig_carousel_child_count: f(row, "IG_Carousel_Child_Count"),
      image_count: f(row, "Image_Count"),
      published_at: f(row, "Published_At"),
    };
    const incident = classifyIgCarouselChildPollFailure(mapped);
    if (!incident) continue;

    const expected = Math.min(10, Math.max(2, Number(
      f(row, "IG_Carousel_Child_Count")
      || f(row, "Image_Count")
      || incident.finished_child_count
      || 0
    ) || 0));
    const linked = arrayOrEmpty(f(row, "Carousel Slides"));
    let slides = [];
    try {
      slides = await Promise.all(linked.map((id) => airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, id)));
    } catch (error) {
      pulses.push({
        key: "IG_AP2C_CHILD_POLL",
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const ordered = slides
      .filter((slide) => !Boolean(f(slide, "Deleted From Carousel")))
      .sort((a, b) => Number(f(a, "Current Order") || f(a, "Slide Number") || 0) - Number(f(b, "Current Order") || f(b, "Slide Number") || 0));
    const required = ordered.slice(0, expected);
    const overflow = ordered.slice(expected);
    const missing = required.filter((slide) => !String(f(slide, "IG_Child_Container_ID") || "").trim());
    const terminal = required.filter((slide) => /^(ERROR|EXPIRED)$/i.test(String(f(slide, "IG_Child_Container_Status") || "").trim()));

    try {
      // Make the recovery self-contained even when the local runner has not yet
      // been redeployed: remove overflow rows from the active Instagram carousel
      // and reset historical poll attempts so old AP2C code cannot immediately
      // trip its max-attempt guard again.
      for (const slide of overflow) {
        await airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, slide.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              "Deleted From Carousel": true,
              IG_Child_Container_ID: "",
              IG_Child_Container_Status: "Not Created",
              IG_Child_Container_Attempt_Count: 0,
              IG_Child_Container_Error: "",
              IG_Carousel_Item_Ready: false,
            },
            typecast: true,
          }),
        });
      }
      for (const slide of required) {
        await airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, slide.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              IG_Child_Container_Attempt_Count: 0,
            },
            typecast: true,
          }),
        });
      }

      if (required.length === expected && !missing.length && !terminal.length) {
        await airtableFetch(env, outputTable, row.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              IG_Carousel_Status: "Children Processing",
              Publish_Next_Retry_At: null,
              Publish_Retry_Eligible: true,
              IG_Carousel_Error_Stage: "",
              IG_Carousel_Error_Message: "",
              IG_Carousel_Next_Retry_At: null,
              Publish_Locked_By: "",
              Publish_Locked_At: null,
              Publish_Started_At: null,
            },
            typecast: true,
          }),
        });
        const refreshed = await airtableFetch(env, outputTable, row.id).catch(() => row);
        const payload = await studioPulseAp2c(env, refreshed);
        pulses.push({
          key: "IG_AP2C_CHILD_POLL",
          id: row.id,
          expected_children: expected,
          action: "preserve_required_children_and_continue_ap2c",
          ok: payload?.ok !== false,
          payload,
        });
        continue;
      }

      await airtableFetch(env, outputTable, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            IG_Carousel_Status: "Assets Ready",
            Publish_Next_Retry_At: null,
            Publish_Retry_Eligible: true,
            IG_Carousel_Error_Stage: "",
            IG_Carousel_Error_Message: "",
            IG_Carousel_Next_Retry_At: null,
            Publish_Locked_By: "",
            Publish_Locked_At: null,
            Publish_Started_At: null,
          },
          typecast: true,
        }),
      });
      const refreshed = await airtableFetch(env, outputTable, row.id).catch(() => row);
      const payload = await studioPulseAp1c(env, refreshed);
      pulses.push({
        key: "IG_AP2C_CHILD_POLL",
        id: row.id,
        expected_children: expected,
        overflow_children_removed: overflow.length,
        missing_children: missing.length,
        terminal_children: terminal.length,
        action: "recreate_required_children_once_ap1c",
        ok: payload?.ok !== false,
        payload,
      });
    } catch (error) {
      pulses.push({
        key: "IG_AP2C_CHILD_POLL",
        id: row.id,
        expected_children: expected,
        missing_children: missing.length,
        terminal_children: terminal.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (pulses.length) {
    console.log("Studio IG AP2C child-poll heal", JSON.stringify({
      count: pulses.length,
      pulses: pulses.map((row) => ({
        id: row.id,
        action: row.action || null,
        expected_children: row.expected_children ?? null,
        overflow_children_removed: row.overflow_children_removed ?? null,
        missing_children: row.missing_children ?? null,
        terminal_children: row.terminal_children ?? null,
        error: row.error || null,
      })),
    }));
  }
  return pulses;
}

/*__STUDIO_WORKER_END:studioHealIgCarouselChildPollFailure__*/

export async function studioHealIgCarouselRateLimit(env, options = {}) {
  const limit = Math.max(1, Math.min(6, Number(options.limit || 4)));
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const pulses = [];
  const rows = await listRecords(env, outputTable, {
    limit,
    sortField: "Output_ID",
    sortDirection: "desc",
    filterFormula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Published_At}=BLANK(),{Do_Not_Publish}=0,FIND("User is performing too many actions",{IG_Carousel_Error_Message}&"")>0)',
  }).catch(() => []);

  const minimumBackoffMs = 30 * 60 * 1000;
  for (const row of rows || []) {
    const mapped = {
      id: row.id,
      platform: f(row, "Platform"),
      studio_output_type: f(row, "Studio_Output_Type"),
      platform_output_type: f(row, "Platform_Output_Type"),
      ig_carousel_status: f(row, "IG_Carousel_Status"),
      ig_carousel_error: f(row, "IG_Carousel_Error_Message"),
      ig_carousel_error_stage: f(row, "IG_Carousel_Error_Stage"),
      published_at: f(row, "Published_At"),
    };
    if (!classifyIgCarouselRateLimited(mapped)) continue;

    const lastAttemptMs = Date.parse(String(f(row, "Last_Publish_Attempt_At") || ""));
    const currentRetryMs = Date.parse(String(
      f(row, "IG_Carousel_Next_Retry_At")
      || f(row, "Publish_Next_Retry_At")
      || ""
    ));
    const hasSafeBackoff = Number.isFinite(lastAttemptMs)
      && Number.isFinite(currentRetryMs)
      && (currentRetryMs - lastAttemptMs) >= (minimumBackoffMs - 60000);

    if (hasSafeBackoff && currentRetryMs > Date.now()) {
      // Park the parent in a state old AP1C versions cannot consume. This
      // prevents a pre-fix local runner from ignoring the retry timestamp and
      // hammering Meta during the cooldown.
      if (String(f(row, "IG_Carousel_Status") || "").trim() !== "Retry Pending") {
        await airtableFetch(env, outputTable, row.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              IG_Carousel_Status: "Retry Pending",
              Publish_Retry_Eligible: true,
              Publish_Locked_By: "",
              Publish_Locked_At: null,
              Publish_Started_At: null,
            },
            typecast: true,
          }),
        });
      }
      pulses.push({
        key: "IG_AP1C_RATE_LIMIT",
        id: row.id,
        action: "wait_existing_backoff",
        retry_at: new Date(currentRetryMs).toISOString(),
      });
      continue;
    }

    if (hasSafeBackoff && currentRetryMs <= Date.now()) {
      try {
        await airtableFetch(env, outputTable, row.id, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              IG_Carousel_Status: "Assets Ready",
              Publish_Next_Retry_At: null,
              Publish_Retry_Eligible: true,
              IG_Carousel_Next_Retry_At: null,
              Publish_Locked_By: "",
              Publish_Locked_At: null,
              Publish_Started_At: null,
            },
            typecast: true,
          }),
        });
        pulses.push({
          key: "IG_AP1C_RATE_LIMIT",
          id: row.id,
          action: "release_backoff_for_single_retry",
        });
      } catch (error) {
        pulses.push({
          key: "IG_AP1C_RATE_LIMIT",
          id: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      continue;
    }

    const baseMs = Number.isFinite(lastAttemptMs)
      ? Math.max(Date.now(), lastAttemptMs)
      : Date.now();
    const retryAt = new Date(baseMs + minimumBackoffMs).toISOString();
    try {
      await airtableFetch(env, outputTable, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            IG_Carousel_Status: "Retry Pending",
            Publish_Next_Retry_At: retryAt,
            Publish_Retry_Eligible: true,
            IG_Carousel_Next_Retry_At: retryAt,
            Publish_Locked_By: "",
            Publish_Locked_At: null,
            Publish_Started_At: null,
          },
          typecast: true,
        }),
      });
      pulses.push({
        key: "IG_AP1C_RATE_LIMIT",
        id: row.id,
        action: "backoff_30m_preserve_children",
        retry_at: retryAt,
      });
    } catch (error) {
      pulses.push({
        key: "IG_AP1C_RATE_LIMIT",
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (pulses.length) {
    console.log("Studio IG AP1C rate-limit heal", JSON.stringify({
      count: pulses.length,
      pulses,
    }));
  }
  return pulses;
}
/*__STUDIO_WORKER_END:studioHealIgCarouselRateLimit__*/
