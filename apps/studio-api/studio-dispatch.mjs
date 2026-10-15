// Extracted Cloudflare request and cron dispatcher. Dependencies supplied at initialization.
export function createStudioWorker(deps) {
  const { studioCronAirtableCadence, HttpError, accessIdentity, resolveAuthorization, requireConfig, corsPreflight, respond, assertWriteRequest, assertOriginWriteRequest, assertUploadWriteRequest, requirePermission, requireAnyPermission, AIRTABLE_SLOT_FAIL_FAST_MS, airtableCooldownWaitMs, brandLogo, listIdeas, listStudioContentProfiles, studioProfileOnboardingHandlers, listStudioProfileSetups, createStudioProfileSetup, getStudioProfileSetup, patchStudioProfileSetup, updateStudioProfileSetupPlatform, activateStudioProfileSetup, createIdea, updateIdea, holdIdea, restoreIdea, deleteIdea, listProductionRequestOutputs, syncProductionRequestOutputs, getProductionRequestOutput, updateProductionRequestOutput, publicChicagoShiningWatermark, getItem4MasterAssets, createItem4LargeVideoUploadSession, uploadItem4LargeVideoPart, completeItem4LargeVideoUploadSession, abortItem4LargeVideoUploadSession, uploadItem4MasterAssets, reorderItem4MasterAssets, deleteItem4MasterAsset, uploadItem4ClipPoster, getMediaLibraryStills, getIdeaLibrarySuggestions, attachItem4LibraryAssets, studioHealRfrMissingDeliverable, buildItem4OutputPlan, getItem4OutputPlan, ITEM4_DRAIN_CRON_BUDGET_MS, studioFacebookGraphPublishHeld, syncMiamiTikTokPipelineSecret, opsForceAzNavyPierTitle, resumeAzFinishedVideoRequests, startOrphanedStudioProductionJobs, resumeStaleStudioProductionJobs, healStuckStudioRenders, studioHealNativePhotoReviewStrands, studioHealAwaitingApprovalStaleRfr, studioHealPhantomRerender, studioHealFailedStatuses, studioHealIgCarouselTooManyChildren, studioHealIgCarouselChildVerificationRace, studioHealIgCarouselChildPollFailure, studioHealIgCarouselRateLimit, studioHealEscalatedProduce, item4PulsePipelineStage, handleRr2ReviewDecision, item4DrainAllPendingWork, prepareItem4Variants, getItem4Variants, item4HealTimelineAutoPrepare, item4HealIncompletePreparingVariants, getItem4WorkspaceStatus, getOrCreateProductionRequestForIdea, createProductionRequestFromBody, listProductionRequests, getProductionRequest, updateProductionRequest, productionRequestBridgePreflightRoute, productionRequestPromotionRecordIdFromPath, applyPromotedTimedScriptRoute, syncProductionRequestDirectivesRoute, generateItem4PreProductionAiMaster, studioRecomputeInsightsLearned, getInsightsWatchlist, putInsightsWatchlist, getInsightsConnections, getInsightsPosts, postInsightsChat, getInsightsBestTimes, getInsightsCaptions, getInsightsSimilarTimes, postInsightsSimilarTimesSweep, studioSweepPublishedInsights, studioDiscoverYoutubeChicagoCreators, postInsightsDiscover, engagementDeps, getEngagementSettings, putEngagementSettings, postEngagementDiscover, getEngagementRecommendations, postEngagementAction, getEngagementInsights, promoteProductionRequestViaI3I4, promoteIdeaViaI3I4, ideaPhotoListeningSessionRoute, getAuthorizedIdeaRoute, autoListenOpenPhotoIdeas, watchIdeaPhotosRoute, matchIdeaPhotosRoute, proposeScriptedShortRoute, acceptScriptedShortRoute, planVibeCutRoute, anotherVibeCutRoute, createIdeaTimedScriptRoute, runWaitingIdeaPhotoMatches, listContent, listOutputScheduleGrid, readStudioSupabaseSyncLast, studioSyncSupabasePipelineReads, getStudioSupabaseSyncStatus, postStudioSupabaseSync, warmOldestStudioReadSnapshot, listOutputs, listMusic, toggleMusicFavorite, deleteMusicLibraryTrack, uploadMusicLibraryTracks, listAssetLibrary, uploadAssetLibraryItems, assignLibraryAssetProfile, classifyAllLibraryAssets, renameAssetLibraryItem, deleteAssetLibraryItem, patchAssetLibraryDuration, releasePublishedLibraryFile, studioSweepPostPublishMediaRelease, musicPreview, deferItem4MakeHardening, mediaAssetImagePreview, mediaAssetVideoStream, outputPreview, listPhase6Voices, phase6VoicePreview, getOutputCreative, updateOutputCreative, getOutputCreativeHandoffStatus, continueOutputCreativeHandoff, cadenceScheduleSync, studioHealPromotedMissingFanout, continueParkedProductionAfterPromote, advanceStudioProductionOutputs, handleR5DoneCallback, syncProductionCadence, studioTiktokComplete, studioReconcileYoutubePublishes, studioReconcileTiktokDrafts, studioReconcileFacebookPhotos, studioReconcileInstagramCarousels, studioReconcileOverdueScheduledPublishes, studioHealApprovedMissingSchedule, studioHealStoryCompanionDrift, studioReconcileApprovedPublishes, studioReconcileFacebookVideoCovers, studioReconcilePublishingInstagramStories, studioReconcilePublishingInstagramReels, studioReconcileFacebookSlideshows, studioReconcileFacebookReels, startScheduleRegenJob, getScheduleRegenJobStatus, getStudioScheduleSettings, putStudioScheduleSettings, getApproveAllJobStatus, studioResumeApproveAllJobs, approveAllOutputsForPublishing, reviewOutputCreative, getRecordRoute, getOutputRoute, readStudioProfilesOverviewSnapshot, refreshStudioProfilesOverviewSnapshot, profilesOverview, dashboard, adminRepairControlStatus, adminRepairControl, adminMakeDeployPage, out, adminMakeDeploy, startStudioIdeaGeneration, studioIdeaGenerationStatus, chicagoNowParts, getStudioDeskInventory, getStudioDeskActivity, getStudioAiApiStatus, patchStudioAiApiPreference, patchStudioDeskMode, patchLibraryCrossScope, getStudioCompressionStatus, getStudioOperationsQueue, getFactoryDesk, mutateFactoryDesk, pauseStudioOperationsQueueItem, reorderStudioOperationsRenderQueue, prepareIdeaToReview, getStudioOperations, getStudioOperationsProfiles, patchStudioOperationsProfile, studioHealAutonomousRevisionLock, runStudioAutonomousProduce, runStudioDailyIdeas, kickStudioOutputPublish, scheduleStudioPublishOutput, markStudioYoutubeComplete, markStudioTiktokComplete, resendStudioTiktokDraft, markStudioOutputPublished, pulseA1SForDriveFile, pulseM1ResetRenderUrls, pulseR2BRetryAssetSelection, pulseMakeAdminBridgeQueue, pulseAudioLeadingSilence, pulseStudioLibraryIntake, getStudioLibraryIntakeStatus, studioReadSource, studioSupabaseConfigured, STUDIO_SUPABASE_PIPELINE_READ_ROUTES, POST_PUBLISH_RELEASE_BATCH_LIMIT, capabilityMatrixResponse, studioEngagementCron } = deps;
  return {
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
          version: "0.10.618-mae-horizon-overflow",
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
};;
}
