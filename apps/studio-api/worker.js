const JSON_HEADERS = {
  "Content-Type": "application/json; charset=UTF-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

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
      const isIdeaRecordRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isIdeaHoldRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/hold$/.test(url.pathname);
      const isIdeaRestoreRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/restore$/.test(url.pathname);
      const isIdeaPromoteRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/promote$/.test(url.pathname);
      const isIdeaProductionRequestRoute = /^\/api\/ideas\/rec[A-Za-z0-9]+\/production-request$/.test(url.pathname);
      const isIdeaGenerateRoute = url.pathname === "/api/ideas/generate";
      const isIdeaGenerateStatusRoute = /^\/api\/ideas\/generate\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isProductionRequestRecordRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isProductionRequestPromoteRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/promote$/.test(url.pathname);
      const isProductionRequestBridgePreflightRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/bridge-preflight$/.test(url.pathname);
      const isProductionRequestSyncDirectivesRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/sync-directives$/.test(url.pathname);
      const isProductionRequestCollectionRoute = url.pathname === "/api/production-requests";
      const isProductionRequestOutputsRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/outputs$/.test(url.pathname);
      const isItem4AssetsRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets$/.test(url.pathname);
      const isItem4AssetRecordRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/[A-Za-z0-9_-]+$/.test(url.pathname);
      const isItem4PlanRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/plan$/.test(url.pathname);
      const isItem4StatusRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/item4$/.test(url.pathname);
      const isItem4VariantsRoute = /^\/api\/production-requests\/rec[A-Za-z0-9]+\/variants$/.test(url.pathname);
      const isProductionRequestOutputRecordRoute = /^\/api\/production-request-outputs\/rec[A-Za-z0-9]+$/.test(url.pathname);
      const isOutputPreviewRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/preview$/.test(url.pathname);
      const isOutputCreativeRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/creative$/.test(url.pathname);
      const isOutputCreativeReviewRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/creative\/review$/.test(url.pathname);
      const isOutputCreativeContinueRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/creative\/render\/continue$/.test(url.pathname);
      const isOutputCreativeHandoffStatusRoute = /^\/api\/outputs\/rec[A-Za-z0-9]+\/creative\/handoff\/status$/.test(url.pathname);
      const isAdminMakeDeployRoute = url.pathname === "/api/admin/make-deploy";
      const isAdminRepairControlRoute = url.pathname === "/api/admin/repair/control";
      const isVoiceCatalogRoute = url.pathname === "/api/voices";
      const isIdeaCreateRoute = url.pathname === "/api/ideas" && request.method === "POST";
      const isIdeaGenerateWrite = isIdeaGenerateRoute && request.method === "POST";
      const isIdeaEditRoute = isIdeaRecordRoute && request.method === "PATCH";
      const isIdeaDeleteRoute = isIdeaRecordRoute && request.method === "DELETE";
      const isIdeaHoldWrite = (isIdeaHoldRoute || isIdeaRestoreRoute) && request.method === "POST";
      const isIdeaPromoteWrite = isIdeaPromoteRoute && request.method === "POST";
      const isProductionRequestCreateWrite =
        (isIdeaProductionRequestRoute || isProductionRequestCollectionRoute) && request.method === "POST";
      const isProductionRequestEditWrite = isProductionRequestRecordRoute && request.method === "PATCH";
      const isProductionRequestPromoteWrite = isProductionRequestPromoteRoute && request.method === "POST";
      const isProductionRequestSyncDirectivesWrite = isProductionRequestSyncDirectivesRoute && request.method === "POST";
      const isProductionRequestOutputsSyncWrite = isProductionRequestOutputsRoute && request.method === "PUT";
      const isItem4AssetsUploadWrite = isItem4AssetsRoute && request.method === "POST";
      const isItem4AssetDeleteWrite = isItem4AssetRecordRoute && request.method === "DELETE";
      const isItem4PlanWrite = isItem4PlanRoute && request.method === "POST";
      const isItem4VariantsWrite = isItem4VariantsRoute && request.method === "POST";
      const isProductionRequestOutputEditWrite = isProductionRequestOutputRecordRoute && request.method === "PATCH";
      const isOutputCreativeEditWrite = isOutputCreativeRoute && request.method === "PATCH";
      const isOutputCreativeReviewWrite = isOutputCreativeReviewRoute && request.method === "POST";
      const isOutputCreativeContinueWrite = isOutputCreativeContinueRoute && request.method === "POST";
      const isAdminMakeDeployWrite = isAdminMakeDeployRoute && request.method === "POST";
      const isAdminRepairControlWrite = isAdminRepairControlRoute && request.method === "POST";
      const allowedMethod =
        request.method === "GET" ||
        (request.method === "HEAD" && (isMusicPreviewRoute || isMediaAssetPreviewRoute || isOutputPreviewRoute || isVoicePreviewRoute)) ||
        isIdeaCreateRoute ||
        isIdeaGenerateWrite ||
        isIdeaEditRoute ||
        isIdeaDeleteRoute ||
        isIdeaHoldWrite ||
        isIdeaPromoteWrite ||
        isProductionRequestCreateWrite ||
        isProductionRequestEditWrite ||
        isProductionRequestPromoteWrite ||
        isProductionRequestSyncDirectivesWrite ||
        isProductionRequestOutputsSyncWrite ||
        isItem4AssetsUploadWrite ||
        isItem4AssetDeleteWrite ||
        isItem4PlanWrite ||
        isItem4VariantsWrite ||
        isProductionRequestOutputEditWrite ||
        isOutputCreativeEditWrite ||
        isOutputCreativeReviewWrite ||
        isOutputCreativeContinueWrite ||
        (isAdminMakeDeployRoute && request.method === "GET") ||
        (isAdminRepairControlRoute && request.method === "GET") ||
        isVoiceCatalogRoute ||
        isAdminMakeDeployWrite ||
        isAdminRepairControlWrite;
      if (!allowedMethod) {
        return respond(request, env, { ok: false, error: "Method not allowed in Phase 2A" }, 405);
      }

      if (url.pathname === "/health" || url.pathname === "/api/health") {
        return respond(request, env, {
          ok: true,
          service: "chicagoshining-studio-api",
          version: "0.10.46-variant-plan-ready",
          studio_manual_idea_generation_v1: true,
          studio_manual_idea_progress_v1: true,
          studio_manual_idea_count_range: "1-10",
          studio_companion_stories_v1: true,
          studio_story_variant_relink_v1: true,
          studio_story_still_preview_v1: true,
          studio_story_teaser_15s_v1: true,
          studio_p3_promote_pulse_v1: true,
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
          studio_item4_calm_bridge_preflight_v1: true,
          studio_photo_cover_thumbs_v1: true,
          studio_slide_post_caption_split_v1: true,
          studio_variant_plan_ready_v1: true,
          studio_audio_platform_warning_v1: true,
          studio_approved_progress_v1: true,
          studio_publish_cadence_carousel_youtube_v1: true,
          studio_music_catalog_fallback_v1: true,
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
          item4_ratio_authority: "platform-output-mappings",
          item4_publish_locked_until_bridge_validation: false,
          item4_source_to_production_bridge: "validated-preflight-v1",
          item4_promotion_summary_backfill: true,
        });
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

      if (isMediaAssetPreviewRoute) {
        return mediaAssetImagePreview(request, env, url, authorization);
      }

      if (isAdminMakeDeployRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method === "GET") {
          return adminMakeDeployPage(request, env, authorization);
        }
        assertWriteRequest(request, env);
        return adminMakeDeploy(request, env, authorization);
      }

      if (isAdminRepairControlRoute) {
        requirePermission(authorization, "tenant_admin");
        if (request.method === "GET") return await adminRepairControlStatus(request, env);
        assertWriteRequest(request, env);
        return await adminRepairControl(request, env, authorization);
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

      if (url.pathname === "/api/dashboard") {
        return dashboard(request, env);
      }

      if (isIdeaGenerateRoute) {
        if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_create");
        return startStudioIdeaGeneration(request, env, authorization, ctx);
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
        return listIdeas(request, env, url);
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

      if (isIdeaProductionRequestRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "production_configure");
        return getOrCreateProductionRequestForIdea(request, env, url, authorization);
      }

      if (isProductionRequestCollectionRoute) {
        if (request.method === "POST") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "production_configure");
          return createProductionRequestFromBody(request, env, authorization);
        }
        // Item 4 opens by loading the Production Request collection before a
        // specific request/status route is necessarily selected. Trigger the Make
        // safety hardening here as well so a simple /item4 page open is sufficient.
        // Never block the list UI if Make is temporarily unavailable.
        try { await item4EnsureMakeHardeningFromWorkspaceOpen(env); } catch (error) {
          console.warn("Item 4 Make hardening deferred from Production Request collection open", error);
        }
        return listProductionRequests(request, env, url, authorization);
      }

      if (isItem4AssetsRoute) {
        requirePermission(authorization, "production_configure");
        if (request.method === "POST") {
          assertUploadWriteRequest(request, env);
          return uploadItem4MasterAssets(request, env, url, authorization);
        }
        return getItem4MasterAssets(request, env, url, authorization);
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
        return getItem4Variants(request, env, url, authorization);
      }

      if (isItem4StatusRoute) {
        return getItem4WorkspaceStatus(request, env, url, authorization);
      }

      if (isProductionRequestOutputsRoute) {
        if (request.method === "PUT") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "production_configure");
          return syncProductionRequestOutputs(request, env, url, authorization);
        }
        return listProductionRequestOutputs(request, env, url, authorization);
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
        return syncProductionRequestDirectivesRoute(request, env, url, authorization);
      }

      if (isProductionRequestBridgePreflightRoute) {
        requirePermission(authorization, "production_configure");
        return productionRequestBridgePreflightRoute(request, env, url, authorization);
      }

      if (isProductionRequestPromoteRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_promote");
        requirePermission(authorization, "production_configure");
        const response = await promoteProductionRequestViaI3I4(request, env, url, authorization);
        cadenceScheduleSync(ctx, env, { startRender: true });
        return response;
      }

      if (isProductionRequestRecordRoute) {
        if (request.method === "PATCH") {
          assertWriteRequest(request, env);
          requirePermission(authorization, "production_configure");
          return updateProductionRequest(request, env, url, authorization);
        }
        const response = await getProductionRequest(request, env, url, authorization);
        cadenceScheduleSync(ctx, env);
        return response;
      }

      if (isIdeaPromoteRoute) {
        assertWriteRequest(request, env);
        requirePermission(authorization, "ideas_promote");
        const response = await promoteIdeaViaI3I4(request, env, url, authorization);
        cadenceScheduleSync(ctx, env, { startRender: true });
        return response;
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
        const response = await listContent(request, env, url);
        cadenceScheduleSync(ctx, env);
        return response;
      }

      if (url.pathname.startsWith("/api/content/")) {
        return getRecordRoute(request, env, url, env.AIRTABLE_CONTENT_TABLE_ID, "content");
      }

      if (url.pathname === "/api/outputs") {
        const response = await listOutputs(request, env, url);
        cadenceScheduleSync(ctx, env);
        return response;
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

      if (isMusicPreviewRoute) {
        return musicPreview(request, env, url);
      }

      if (url.pathname === "/api/music") {
        return listMusic(request, env, url);
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
    ctx.waitUntil(syncProductionCadence(env, { force: true }).catch((error) => {
      console.warn("production cadence cron failed", error);
    }));
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function accessIdentity(request) {
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

async function resolveAuthorization(request, env) {
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

function requireConfig(env) {
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

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean));
}

function corsHeaders(request, env) {
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

function corsPreflight(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigins(env).has(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function respond(request, env, data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) },
  });
}

function assertWriteRequest(request, env) {
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

function assertUploadWriteRequest(request, env) {
  const origin = String(request.headers.get("Origin") || "").trim();
  const allowed = allowedOrigins(env);
  if (!origin || !allowed.has(origin)) {
    throw new HttpError(403, "Studio write request origin is not allowed");
  }
  const contentType = String(request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    throw new HttpError(415, "Master media uploads must use multipart/form-data");
  }
}

function requirePermission(authorization, permission) {
  if (!authorization?.permissions?.[permission]) {
    throw new HttpError(403, `Permission required: ${permission}`);
  }
}

async function airtableFetch(env, tableId, pathOrParams = "", options = {}) {
  const suffix = pathOrParams ? (pathOrParams.startsWith("?") || pathOrParams.startsWith("/") ? pathOrParams : `/${pathOrParams}`) : "";
  const tableRef = encodeURIComponent(String(tableId));
  const endpoint = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableRef}${suffix}`;
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_PAT}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const airtableType = body?.error?.type ? String(body.error.type) : "";
    const airtableMessage = body?.error?.message ? String(body.error.message) : "";
    const detail = [airtableType, airtableMessage].filter(Boolean).join(": ");
    throw new HttpError(
      response.status,
      detail ? `Airtable: ${detail}` : `Airtable request failed (${response.status})`
    );
  }
  return body;
}

function clampLimit(url, fallback = 50, max = 100) {
  const value = Number(url.searchParams.get("limit") || fallback);
  return Math.max(1, Math.min(max, Number.isFinite(value) ? Math.trunc(value) : fallback));
}

async function listRecords(env, tableId, { limit = 50, view = null, sortField = null, sortDirection = "desc", filterFormula = null } = {}) {
  const params = new URLSearchParams();
  params.set("pageSize", String(Math.min(100, limit)));
  params.set("maxRecords", String(limit));
  if (view) params.set("view", view);
  if (filterFormula) params.set("filterByFormula", filterFormula);
  if (sortField) {
    params.set("sort[0][field]", sortField);
    params.set("sort[0][direction]", sortDirection);
  }
  const result = await airtableFetch(env, tableId, `?${params.toString()}`);
  return Array.isArray(result.records) ? result.records : [];
}

function f(record, field) {
  return record?.fields?.[field] ?? null;
}

function studioOutputIsNativePhotoRoute(platform, outputType, mapping) {
  const p = String(platform || "").trim();
  const type = String(outputType || "").trim();
  const map = String(mapping || "").trim();
  if (p === "TikTok" && (type === "Multi-Photo" || map === "TikTok Slideshow")) return true;
  if (p === "Instagram" && type === "Carousel") return true;
  if (p === "Facebook" && type === "Multi-Image Post") return true;
  return false;
}

function studioOutputIsNativePhoto(record) {
  const platform = String(f(record, "Platform") || "").trim();
  const outputType = String(f(record, "Studio_Output_Type") || "").trim();
  const mapping = String(f(record, "Platform_Output_Type") || "").trim();
  const composition = String(f(record, "Composition_ID") || "").trim();
  const clips = String(f(record, "Render_Clip_List_JSON") || f(record, "Selected_Assets_JSON") || "").trim();
  if (!clips || !studioOutputIsNativePhotoRoute(platform, outputType, mapping)) return false;
  // TikTok Multi-Photo is composition-free by contract. IG/FB native packages may
  // still carry a stale Composition_ID from older promote paths; treat them as
  // reviewable when the photo package JSON is present.
  if (platform === "TikTok" && composition) return false;
  return true;
}

function studioOutputHasReviewableDeliverable(record) {
  if (String(f(record, "Final_File_URL") || "").trim()) return true;
  if (String(f(record, "Studio_Preview_URL") || "").trim()) return true;
  if ((f(record, "Carousel Slides") || []).length) return true;
  return studioOutputIsNativePhoto(record);
}

function studioClipPublicCdnUrl(clipOrUrl) {
  const url = String(clipOrUrl?.url || clipOrUrl?.src || clipOrUrl || "").trim();
  return url.startsWith("https://media.chicagoshining.com/") ? url : "";
}

function studioNativeClipsArePublicCdn(record) {
  const clips = selectedVisualClips(record);
  return clips.length > 0 && clips.every((clip) => studioClipPublicCdnUrl(clip));
}

function studioNativeSlidePublicFields(clip, platform) {
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
  return fields;
}

function studioUrlLooksLikeImage(url) {
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(String(url || ""));
}

function studioUrlLooksLikeVideo(url) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(url || ""));
}

function studioPublicJpegCoverUrl(record) {
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

function studioNativeStillPreviewUrl(record) {
  const stored = String(f(record, "Studio_Preview_URL") || "").trim();
  if (stored && studioUrlLooksLikeImage(stored)) return stored;
  return studioPublicJpegCoverUrl(record);
}

function studioPreviewKind(record) {
  const stored = String(f(record, "Studio_Preview_URL") || "").trim();
  const finalUrl = String(f(record, "Final_File_URL") || "").trim();
  if (stored && studioUrlLooksLikeVideo(stored)) return "video";
  if (finalUrl && studioUrlLooksLikeVideo(finalUrl)) return "video";
  const still = studioNativeStillPreviewUrl(record);
  const nativePhoto = studioOutputIsNativePhoto(record) || studioOutputIsNativePhotoRoute(
    f(record, "Platform"),
    f(record, "Studio_Output_Type"),
    f(record, "Platform_Output_Type")
  );
  if (nativePhoto && (still || (stored && studioUrlLooksLikeImage(stored)))) return "still";
  if (stored && studioUrlLooksLikeImage(stored)) return "still";
  if (stored || finalUrl) return "video";
  return still ? "still" : "none";
}

function studioPublishHandoffFields(record) {
  const platform = String(f(record, "Platform") || "").trim();
  const outputType = String(f(record, "Studio_Output_Type") || "").trim();
  const mapping = String(f(record, "Platform_Output_Type") || "").trim();
  const preview = String(f(record, "Studio_Preview_URL") || "").trim();
  const clipCount = selectedVisualClips(record).length || Number(f(record, "Selected_Clip_Count") || 0) || 0;
  const current = (name) => String(f(record, name) || "").trim();
  const cdnReady = studioNativeClipsArePublicCdn(record);
  const cover = studioPublicJpegCoverUrl(record);
  const fields = {};
  if (cover && (/drive\.google\.com/i.test(current("Thumbnail_URL")) || !current("Thumbnail_URL") || /\.png(\?|$)/i.test(current("Thumbnail_URL")))) {
    fields.Thumbnail_URL = cover;
  }
  if (platform === "YouTube" && !current("YouTube_Privacy_Status")) {
    fields.YouTube_Privacy_Status = "public";
  }
  if (platform === "Instagram" && (outputType === "Reel" || mapping === "Instagram Reel") && outputType !== "Carousel" && mapping !== "Instagram Carousel") {
    if (preview.startsWith("https://media.chicagoshining.com/")) {
      fields.Publish_Asset_URL = preview;
      fields.Publish_Status = "Ready to Publish";
    }
  }
  if (platform === "Instagram" && (outputType === "Carousel" || mapping === "Instagram Carousel")) {
    if (cdnReady) fields.IG_Carousel_Status = "Assets Ready";
    else if (!current("IG_Carousel_Status")) fields.IG_Carousel_Status = "Ready for Asset Prep";
    fields.Publish_Status = "Ready to Publish";
    fields.Image_Output_Selected = true;
    if (clipCount) {
      fields.Image_Count = clipCount;
      fields.IG_Carousel_Child_Count = clipCount;
    }
  }
  if (platform === "Facebook" && (outputType === "Multi-Image Post" || mapping === "Facebook Photo Set")) {
    fields.Image_Output_Selected = true;
    if (!current("FB_Publish_Status") || current("FB_Publish_Status") === "Retry Pending") {
      fields.FB_Publish_Status = "Ready for Assets";
    }
    fields.FB_Image_Publish_Mode = "Multi-Photo Collage";
    fields.Publish_Status = "Ready to Publish";
    if (clipCount) fields.Image_Count = clipCount;
  }
  if (platform === "Facebook" && (outputType === "Slideshow Reel" || mapping === "Facebook Reel") && outputType !== "Multi-Image Post" && mapping !== "Facebook Photo Set") {
    if (preview.startsWith("https://media.chicagoshining.com/")) {
      if (!current("FB_Slideshow_Status") || current("FB_Slideshow_Status") === "Retry Pending") {
        fields.FB_Slideshow_Status = "Video Ready";
      }
      fields.FB_Slideshow_Public_URL = preview;
      fields.Publish_Status = "Ready to Publish";
    }
  }
  if (platform === "TikTok") {
    if (!current("TikTok_Draft_Status")) fields.TikTok_Draft_Status = "Ready for Assets";
    if (outputType === "Video Draft" || mapping === "TikTok Video") {
      fields.TikTok_Draft_Type = "Video";
      if (preview.startsWith("https://media.chicagoshining.com/")) fields.Publish_Asset_URL = preview;
      if (!current("Asset_Aspect_Family") && String(f(record, "Aspect_Ratio") || "").includes("9:16")) {
        fields.Asset_Aspect_Family = "9:16";
      }
    } else {
      fields.TikTok_Draft_Type = clipCount > 1 ? "Photo Carousel" : "Single Photo";
      fields.Image_Output_Selected = true;
      fields.Image_Publish_Mode = "TikTok Draft";
    }
    fields.Publish_Status = "Ready to Publish";
  }
  return fields;
}

async function studioPatchExistingNativeSlides(env, record, slideIds, clips) {
  const platform = String(f(record, "Platform") || "").trim();
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
      fields: studioNativeSlidePublicFields({ url }, platform),
    };
  }).filter(Boolean);
  if (!updates.length) return;
  await airtableFetch(env, "tblcnQDBvUngpjDED", "", {
    method: "PATCH",
    body: JSON.stringify({ records: updates, typecast: true }),
  });
}

async function studioEnsureNativePublishSlides(env, record) {
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
        "Google Drive File ID": driveId || null,
        "Final Google Drive File ID": driveId || null,
        "Platform Output": [record.id],
        "Platform": platform,
        "Aspect Ratio": String(clip.aspect_ratio || f(record, "Aspect_Ratio") || "").trim() || null,
        "Asset_4x5_File_ID": driveId || null,
        "Asset_4x5_File_URL": driveUrl || url || null,
        "Asset_Family_Key": String(clip.media_asset_record_id || clip.id || `${record.id}-${order}`).trim(),
        "Approved For Final": true,
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

function normalizedOutputState(record) {
  const fields = record?.fields || {};
  const text = (name) => String(fields[name] || "").trim();
  const has = (name, value) => text(name).toLowerCase().includes(value.toLowerCase());

  const retryablePublish = Boolean(fields.Publish_Retry_Eligible);
  const youtubeVideoReady = Boolean(text("YouTube_Video_ID"))
    && (has("YouTube_Upload_Status", "uploaded") || has("YouTube_Processing_Status", "succeeded"));
  const thumbnailOnlyError = /thumb/i.test(text("Publish_Error_Stage") + " " + text("YouTube_Error_Message") + " " + text("Publish_Error_Message"));

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

  if ((errors || explicitFailed) && !(retryablePublish && thumbnailOnlyError && youtubeVideoReady)) return "Failed";

  // Terminal success must win over stale/manual helper flags left behind by
  // earlier workflow stages. This is especially important for Facebook, where
  // a record can be fully published while a legacy manual-completion flag is
  // still populated.
  if (has("Publish_Status", "published") || has("Output_Status", "published") || has("FB_Publish_Status", "published") || has("FB_Slideshow_Status", "published") || has("TikTok_Draft_Status", "publish complete") || text("YouTube_Stage") === "Complete") return "Published";

  if (has("TikTok_Draft_Status", "manual action") || has("Manual_Completion_Status", "required") || has("Music_Status", "manual action")) return "Manual Action Required";
  // A leftover retry flag must not hide a YouTube video that is already on the platform.
  if (!youtubeVideoReady && (fields.Publish_Retry_Eligible || fields.Asset_Selection_Retry_Eligible || has("FB_Slideshow_Status", "retry") || has("TikTok_Draft_Status", "retry"))) return "Retry Pending";
  if (youtubeVideoReady && !has("Publish_Status", "published") && text("YouTube_Stage") !== "Complete") return "Platform Processing";
  if (has("TikTok_Draft_Status", "draft delivered")) return "Draft Delivered";
  if (has("YouTube_Upload_Status", "uploading") || has("FB_Slideshow_Status", "uploading") || has("Publish_Status", "publishing")) return "Uploading";
  if (has("YouTube_Processing_Status", "processing") || has("FB_Slideshow_Status", "processing") || has("TikTok_Draft_Status", "processing") || has("IG_Carousel_Status", "processing")) return "Platform Processing";
  if (has("Publish_Status", "scheduled")) return "Scheduled";
  // Publisher "Ready for Assets" is the start of upload, not a rewind to Studio
  // asset selection. Approved/reviewable work must win or Approve drops 65% → 30%.
  if (has("Review_Status", "approved") || has("Output_Status", "approved")) return "Approved";
  if ((has("Review_Status", "pending") || has("Review_Status", "review sent") || has("Output_Status", "ready for review")) && studioOutputHasReviewableDeliverable(record)) return "Ready for Review";
  if (has("Render_Status", "rendered") && studioOutputHasReviewableDeliverable(record)) return "Ready for Review";
  if (has("Render_Status", "rendering") || has("Render_Status", "ready for render") || has("FB_Slideshow_Status", "rendering") || has("FB_Slideshow_Status", "starting render")) return "Rendering";
  const studioAssetPrep = has("Asset_Selection_Status", "needs selection") || has("Asset_Selection_Status", "selecting");
  const publisherAssetPrep = has("TikTok_Draft_Status", "ready for assets") || has("TikTok_Draft_Status", "preparing assets") || has("FB_Publish_Status", "ready for assets") || has("FB_Publish_Status", "preparing assets");
  if (studioAssetPrep || (!studioOutputHasReviewableDeliverable(record) && publisherAssetPrep)) return "Preparing Assets";
  if (has("Output_Status", "skipped")) return "Skipped";
  return "Queued";
}

function normalizedContentStage(record) {
  const fields = record?.fields || {};
  const value = (name) => String(fields[name] || "").toLowerCase();
  if (value("Review_Status").includes("ready for review") || value("Carousel_Review_Status").includes("ready for review") || value("Carousel_Review_Status").includes("review sent")) return "Review";
  if (value("Render_Status").includes("render")) return value("Render_Status").includes("rendered") ? "Review" : "Rendering";
  if (["needs assets", "partial match"].some((s) => value("Asset_Match_Status").includes(s))) return "Assets Needed";
  if (value("Content_Status").includes("ready for") || value("Content_Status").includes("generated") || value("Script_Status").includes("generated") || value("Voiceover_Status").includes("generated") || value("Thumbnail_Status").includes("generated")) return "Generating";
  return "Configuring";
}

function mapIdea(record) {
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
    carousel_image_mode: f(record, "Production_Carousel_Image_Mode"),
    video_clip_count: f(record, "Production_Video_Clip_Count"),
    include_voiceover: f(record, "Production_Include_Voiceover"),
    include_background_music: f(record, "Production_Include_Background_Music"),
    include_thumbnail: f(record, "Production_Include_Thumbnail"),
    video_duration: f(record, "Production_Video_Duration"),
    voiceover_tail_seconds: f(record, "Voiceover_Tail_Seconds"),
    created_at: f(record, "Create_Date"),
    content_item_links: f(record, "Content Items") || [],
    promoted_content_record_id: f(record, "Promoted_Content_Record_ID"),
    content_profile_links: f(record, "Content_Profile") || [],
    brand_name: f(record, "Brand_Name") || [],
    market_name: f(record, "Market_Name") || [],
    studio_pre_hold_status: f(record, "Studio_PreHold_Status"),
    studio_hold_at: f(record, "Studio_Hold_At"),
    studio_hold_by: f(record, "Studio_Hold_By"),
    is_on_hold: String(f(record, "Candidate_Status") || "").trim() === "On Hold",
  };
}

function mapContent(record) {
  return {
    id: record.id,
    content_id: f(record, "Content_ID"),
    title: f(record, "Content_Title"),
    content_type: f(record, "Content_Type"),
    content_status: f(record, "Content_Status"),
    studio_stage: normalizedContentStage(record),
    asset_match_status: f(record, "Asset_Match_Status"),
    script_status: f(record, "Script_Status"),
    voiceover_status: f(record, "Voiceover_Status"),
    thumbnail_status: f(record, "Thumbnail_Status"),
    render_status: f(record, "Render_Status"),
    review_status: f(record, "Review_Status"),
    carousel_review_status: f(record, "Carousel_Review_Status"),
    duration: f(record, "Content_Duration"),
    music_url: f(record, "Music_URL"),
    voiceover_url: f(record, "Voiceover_URL"),
    thumbnail_url: f(record, "Thumbnail_URL"),
    output_links: f(record, "Platform Outputs") || [],
    created_at: f(record, "Created_At"),
  };
}

function outputProgressMilestoneFloor(record) {
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
  if (render.includes("rendering") || render.includes("ready for render")) return 50;
  return 0;
}

function outputProgressPercent(record, state) {
  const processingRaw = f(record, "YouTube_Processing_Progress_Percent");
  const uploadRaw = f(record, "YouTube_Upload_Progress_Percent");
  const processing = processingRaw === null || processingRaw === "" ? null : Number(processingRaw);
  const upload = uploadRaw === null || uploadRaw === "" ? null : Number(uploadRaw);
  if (state === "Published") return 100;
  if (state === "Failed") return 0;

  const defaults = {
    Queued: 5,
    "Preparing Assets": 30,
    Rendering: 50,
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

function platformPublishStatus(record) {
  const platform = String(f(record, "Platform") || "").toLowerCase();
  if (platform === "facebook") return f(record, "FB_Publish_Status") || f(record, "FB_Slideshow_Status") || f(record, "Publish_Status");
  if (platform === "tiktok") return f(record, "TikTok_Draft_Status") || f(record, "Publish_Status");
  if (platform === "youtube") return f(record, "Publish_Status") || f(record, "YouTube_Processing_Status") || f(record, "YouTube_Upload_Status");
  return f(record, "Publish_Status");
}

function cleanMusicDisplayName(name) {
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

function selectedVisualClips(record) {
  const parsed = phase6ParseJson(f(record, "Selected_Assets_JSON"), null);
  if (!parsed || typeof parsed !== "object") return [];
  if (Array.isArray(parsed.selected_clips) && parsed.selected_clips.length) return parsed.selected_clips;
  if (Array.isArray(parsed.clips) && parsed.clips.length) return parsed.clips;
  return [];
}

function outputCreativeAvailable(record) {
  return Boolean(
    (f(record, "Carousel Slides") || []).length ||
    f(record, "Creative_Render_Manifest_JSON") ||
    studioOutputHasReviewableDeliverable(record)
  );
}

function mapOutput(record) {
  const studioState = normalizedOutputState(record);
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
    review_status: f(record, "Review_Status"),
    publish_status: f(record, "Publish_Status"),
    platform_publish_status: platformPublishStatus(record),
    studio_progress_percent: outputProgressPercent(record, studioState),
    publish_method: f(record, "Publish_Method"),
    auto_publish_enabled: Boolean(f(record, "Auto_Publish_Enabled")),
    do_not_publish: Boolean(f(record, "Do_Not_Publish")),
    final_file_url: f(record, "Final_File_URL"),
    studio_preview_url: f(record, "Studio_Preview_URL") || studioNativeStillPreviewUrl(record) || null,
    native_still_url: studioNativeStillPreviewUrl(record) || null,
    preview_kind: studioPreviewKind(record),
    output_url: f(record, "Output_URL"),
    platform_post_url: f(record, "Platform_Post_URL"),
    published_at: f(record, "Published_At"),
    tiktok_draft_status: f(record, "TikTok_Draft_Status"),
    facebook_publish_status: f(record, "FB_Publish_Status"),
    facebook_slideshow_status: f(record, "FB_Slideshow_Status"),
    youtube_stage: f(record, "YouTube_Stage"),
    youtube_upload_status: f(record, "YouTube_Upload_Status"),
    youtube_processing_status: f(record, "YouTube_Processing_Status"),
    youtube_upload_progress_percent: f(record, "YouTube_Upload_Progress_Percent"),
    youtube_processing_progress_percent: f(record, "YouTube_Processing_Progress_Percent"),
    content_item_links: f(record, "Content_Item") || [],
    carousel_slide_links: f(record, "Carousel Slides") || [],
    creative_manifest_present: Boolean(f(record, "Creative_Render_Manifest_JSON")),
    creative_available: outputCreativeAvailable(record),
  };
}

function safeMusicExtension(record) {
  const ext = String(f(record, "File_Extension") || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "mp3";
}

function musicPreviewKey(record) {
  return `music/previews/${record.id}.${safeMusicExtension(record)}`;
}

function extractGoogleDriveFileId(urlValue) {
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

function googleDriveFileId(record) {
  return String(f(record, "Google Drive File ID") || extractGoogleDriveFileId(f(record, "Google Drive URL")) || "").trim() || null;
}

function googleDriveDownloadUrl(fileId) {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}

function mapMusic(record) {
  const driveFileId = googleDriveFileId(record);
  const doNotUse = Boolean(f(record, "Do_Not_Use"));
  const previewAvailable = Boolean(driveFileId) && !doNotUse;
  return {
    id: record.id,
    name: f(record, "Asset Name"),
    display_name: cleanMusicDisplayName(f(record, "Asset Name")),
    google_drive_url: f(record, "Google Drive URL"),
    google_drive_file_id: driveFileId,
    preview_url: previewAvailable ? `/api/music/${record.id}/preview` : null,
    preview_available: previewAvailable,
    preview_source: previewAvailable ? "google_drive" : null,
    r2_preview_key: musicPreviewKey(record),
    mime_type: f(record, "MIME_Type"),
    file_extension: f(record, "File_Extension"),
    file_size_mb: f(record, "File_Size_MB"),
    status: f(record, "Asset_Status"),
    rights_status: f(record, "Rights_Status"),
    description: f(record, "Asset_Description"),
    do_not_use: doNotUse,
  };
}



async function findOfficialLogoRecord(env) {
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

async function fetchGoogleDriveImage(record) {
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

async function brandLogo(request, env, authorization) {
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


async function listIdeas(request, env, url) {
  const records = await listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, { limit: clampLimit(url), sortField: "Create_Date" });
  return respond(request, env, { ok: true, records: records.map(mapIdea) });
}

async function resolveAuthorizedContentProfiles(env, authorization) {
  const profiles = await listRecords(env, "Content Profiles", { limit: 100 });
  const brandRecordId = authorization?.brand?.record_id;
  const organizationRecordId = authorization?.organization?.record_id;

  return profiles.filter((record) => {
    const active = Boolean(f(record, "Active"));
    const brands = Array.isArray(f(record, "Brand")) ? f(record, "Brand") : [];
    const organizations = Array.isArray(f(record, "Organization")) ? f(record, "Organization") : [];
    const brandMatch = brandRecordId ? brands.includes(brandRecordId) : false;
    const orgMatch = !organizationRecordId || !organizations.length || organizations.includes(organizationRecordId);
    return active && brandMatch && orgMatch;
  });
}

async function resolveDefaultContentProfile(env, authorization) {
  const matches = await resolveAuthorizedContentProfiles(env, authorization);

  if (!matches.length) {
    throw new HttpError(409, "No active Content Profile is linked to the authorized Studio brand");
  }

  if (matches.length > 1) {
    const exactName = matches.filter((record) =>
      String(f(record, "Brand_Name") || "").trim().toLowerCase() ===
      String(authorization?.brand?.name || "").trim().toLowerCase()
    );
    if (exactName.length === 1) return exactName[0];
    throw new HttpError(409, "Multiple active Content Profiles are linked to this brand; an explicit profile selector is required");
  }

  return matches[0];
}


function cleanIdeaCreatePayload(payload) {
  const title = String(payload?.title || "").trim();
  const summary = String(payload?.summary || "").trim();

  if (!title) throw new HttpError(400, "Idea title is required");
  if (title.length > 160) throw new HttpError(400, "Idea title must be 160 characters or fewer");
  if (summary.length > 5000) throw new HttpError(400, "Idea summary must be 5000 characters or fewer");

  return { title, summary };
}

async function createIdea(request, env, authorization) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }

  const input = cleanIdeaCreatePayload(payload);
  const profile = await resolveDefaultContentProfile(env, authorization);
  const fields = {
    Candidate_Title: input.title,
    Candidate_Status: "Generated",
    Batch_Date: new Date().toISOString().slice(0, 10),
    Content_Profile: [profile.id],
  };
  if (input.summary) fields.Idea_Summary = input.summary;

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

function ideaRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/ideas\/(rec[A-Za-z0-9]+)/);
  if (!match) throw new HttpError(400, "Invalid Airtable record ID");
  return match[1];
}

async function loadAuthorizedIdea(env, recordId, authorization) {
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

function assertIdeaUnpromoted(record, actionLabel) {
  const contentLinks = Array.isArray(f(record, "Content Items")) ? f(record, "Content Items") : [];
  const promotedId = String(f(record, "Promoted_Content_Record_ID") || "").trim();
  if (contentLinks.length || promotedId) {
    throw new HttpError(409, `${actionLabel} is not allowed after an Idea Candidate has been promoted`);
  }
}

function assertIdeaNotApproved(record, actionLabel) {
  const status = String(f(record, "Candidate_Status") || "").trim();
  if (status === "Approved") {
    throw new HttpError(
      409,
      `${actionLabel} is not allowed while Candidate_Status is Approved; promotion handling is managed separately`
    );
  }
}

function cleanIdeaUpdatePayload(payload) {
  const title = String(payload?.title ?? "").trim();
  const summary = String(payload?.summary ?? "").trim();

  if (!title) throw new HttpError(400, "Idea title is required");
  if (title.length > 160) throw new HttpError(400, "Idea title must be 160 characters or fewer");
  if (summary.length > 5000) throw new HttpError(400, "Idea summary must be 5000 characters or fewer");

  return { title, summary };
}

async function updateIdea(request, env, url, authorization) {
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
  const updated = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Candidate_Title: input.title,
        Idea_Summary: input.summary || null,
      },
      typecast: false,
    }),
  });

  return respond(request, env, {
    ok: true,
    updated: true,
    record: mapIdea(updated),
  });
}

async function holdIdea(request, env, url, authorization) {
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

async function restoreIdea(request, env, url, authorization) {
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

async function deleteIdea(request, env, url, authorization) {
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



const PRODUCTION_REQUEST_OUTPUT_TABLE = "Production Request Outputs";

const PRO_OUTPUT_TYPES_BY_PLATFORM = Object.freeze({
  Instagram: new Set(["Reel", "Story", "Single Image", "Carousel"]),
  Facebook: new Set(["Reel", "Story", "Single Image", "Multi-Image Post", "Slideshow Reel"]),
  TikTok: new Set(["Video Draft", "Story", "Single Photo", "Multi-Photo"]),
  YouTube: new Set(["Short", "Standard Video", "Slideshow Video"]),
});

const PRO_OUTPUT_OVERRIDE_TRISTATE = new Set(["Inherit", "Use Profile Default", "Yes", "No"]);
const PRO_OUTPUT_COUNT_MODES = new Set(["Inherit", "AI decides", "Exact", "Target range"]);
const PRO_OUTPUT_CAROUSEL_IMAGE_MODES = new Set(["Inherit", "Make AI Generated", "Manual Upload"]);
const PRO_OUTPUT_TEXT_MODES = new Set(["Inherit", "AI decides", "Force exact", "AI improve", "Leave blank"]);
const PRO_OUTPUT_PUBLISH_MODES = new Set(["Inherit", "Auto Publish", "Manual Review", "Do Not Publish"]);

function productionRequestIdFromOutputsPath(url) {
  const match = url.pathname.match(/^\/api\/production-requests\/(rec[A-Za-z0-9]+)\/outputs$/);
  if (!match) throw new HttpError(400, "Invalid Production Request outputs route");
  return match[1];
}

function productionRequestOutputIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/production-request-outputs\/(rec[A-Za-z0-9]+)$/);
  if (!match) throw new HttpError(400, "Invalid Production Request Output route");
  return match[1];
}

function makeProductionRequestOutputId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PRO-${stamp}-${random}`;
}

function normalizeOutputType(platform, outputType) {
  const p = String(platform || "").trim();
  const o = String(outputType || "").trim();
  if (!PRO_OUTPUT_TYPES_BY_PLATFORM[p]) throw new HttpError(400, `Unsupported output platform: ${p || "(blank)"}`);
  if (!PRO_OUTPUT_TYPES_BY_PLATFORM[p].has(o)) {
    throw new HttpError(400, `${o || "(blank)"} is not a supported ${p} output type`);
  }
  return { platform: p, output_type: o };
}

function mapProductionRequestOutput(record, master = null) {
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
      video_duration_seconds: number("Video_Duration_Seconds_Override", f(master, "Video_Duration_Seconds")),
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

async function outputRowsForProductionRequest(env, productionRequestId) {
  const rows = await listRecords(env, PRODUCTION_REQUEST_OUTPUT_TABLE, { limit: 100 });
  return rows
    .filter(row => {
      const links = Array.isArray(f(row, "Production_Request")) ? f(row, "Production_Request") : [];
      return links.includes(productionRequestId) && Boolean(f(row, "Active"));
    })
    .sort((a, b) => Number(f(a, "Output_Order") || 0) - Number(f(b, "Output_Order") || 0));
}

async function loadAuthorizedProductionRequestOutput(env, outputRecordId, authorization) {
  const row = await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, outputRecordId);
  const requestLinks = Array.isArray(f(row, "Production_Request")) ? f(row, "Production_Request") : [];
  if (requestLinks.length !== 1) throw new HttpError(409, "Production Request Output has an invalid parent link");
  const parent = await loadAuthorizedProductionRequest(env, requestLinks[0], authorization);

  const orgLinks = Array.isArray(f(row, "Organization")) ? f(row, "Organization") : [];
  const brandLinks = Array.isArray(f(row, "Brand")) ? f(row, "Brand") : [];
  if (!orgLinks.includes(authorization?.organization?.record_id) ||
      !brandLinks.includes(authorization?.brand?.record_id)) {
    throw new HttpError(403, "Production Request Output is not part of the authorized Studio tenant/brand");
  }
  return { row, parent };
}

function assertEditableProductionRequest(parent) {
  const status = String(f(parent, "Request_Status") || "").trim();
  if (!["Draft", "Ready"].includes(status)) {
    throw new HttpError(409, `Production Request is ${status || "locked"} and its requested outputs cannot be edited`);
  }
}

async function listProductionRequestOutputs(request, env, url, authorization) {
  // v0.10.6: this endpoint is part of every Production workspace data refresh.
  // Force the P3 single-parent hardener here so UI refresh semantics cannot bypass it.
  try { await item4EnsureMakeHardeningFromWorkspaceOpen(env); } catch (error) {
    console.warn("Item 4 Make hardening deferred from Production Request Outputs list", error);
  }
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

async function syncProductionRequestOutputs(request, env, url, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const productionRequestId = productionRequestIdFromOutputsPath(url);
  const parent = await loadAuthorizedProductionRequest(env, productionRequestId, authorization);
  assertEditableProductionRequest(parent);

  const requested = Array.isArray(payload?.outputs) ? payload.outputs : [];
  const normalized = [];
  const seen = new Set();

  for (const item of requested) {
    if (item?.enabled === false) continue;
    const pair = normalizeOutputType(item?.platform, item4CanonicalOutputType(item?.platform, item?.output_type) || item?.output_type);
    if (item4IsUnsupportedCompanion(pair.platform, pair.output_type)) continue;
    const key = `${pair.platform}::${pair.output_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(pair);
  }

  if (!normalized.length) throw new HttpError(400, "Choose at least one platform output");

  const existing = await outputRowsForProductionRequest(env, productionRequestId);
  const byKey = new Map(existing.map(row => [
    `${String(f(row, "Platform") || "").trim()}::${String(f(row, "Output_Type") || "").trim()}`,
    row
  ]));

  const now = new Date().toISOString();

  for (let i = 0; i < normalized.length; i++) {
    const item = normalized[i];
    const key = `${item.platform}::${item.output_type}`;
    const current = byKey.get(key);
    const storyFields = item4CompanionStoryFields(item.output_type);

    if (current) {
      await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, current.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Enabled: true,
            Active: true,
            Output_Order: i + 1,
            Output_Status: "Draft",
            Updated_At: now,
            ...storyFields,
          },
          typecast: false,
        }),
      });
    } else {
      await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, "", {
        method: "POST",
        body: JSON.stringify({
          fields: {
            Production_Request_Output_ID: makeProductionRequestOutputId(),
            Production_Request: [parent.id],
            Test_Run_ID: String(f(parent, "Test_Run_ID") || "").trim() || null,
            Organization: [authorization.organization.record_id],
            Brand: [authorization.brand.record_id],
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
            Created_At: now,
            Updated_At: now,
            Active: true,
          },
          typecast: false,
        }),
      });
    }
  }

  const selectedKeys = new Set(normalized.map(item => `${item.platform}::${item.output_type}`));
  for (const row of existing) {
    const key = `${String(f(row, "Platform") || "").trim()}::${String(f(row, "Output_Type") || "").trim()}`;
    if (selectedKeys.has(key)) continue;
    await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, row.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Enabled: false, Updated_At: now },
        typecast: false,
      }),
    });
  }

  const targetPlatforms = [...new Set(normalized.map(item => item.platform))];
  let updatedParent = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, parent.id, {
    method: "PATCH",
    body: JSON.stringify({
      fields: { Target_Platforms: targetPlatforms, Updated_At: now },
      typecast: false,
    }),
  });
  updatedParent = await item4ReconcilePlanWithEnabledOutputs(env, updatedParent, normalized);
  updatedParent = await item4RelinkVariantQueueOutputs(env, updatedParent);

  const rows = await outputRowsForProductionRequest(env, productionRequestId);
  return respond(request, env, {
    ok: true,
    synchronized: true,
    production_request: mapProductionRequest(updatedParent),
    records: rows.map(row => mapProductionRequestOutput(row, updatedParent)),
  });
}

function cleanProductionRequestOutputPatch(payload) {
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
  choiceField("thumbnail_mode_override", "Thumbnail_Mode_Override", PRO_OUTPUT_OVERRIDE_TRISTATE);
  intField("video_duration_seconds_override", "Video_Duration_Seconds_Override", 5, 600, "Video duration override");
  choiceField("video_clip_count_mode_override", "Video_Clip_Count_Mode_Override", PRO_OUTPUT_COUNT_MODES);
  intField("video_clip_count_exact_override", "Video_Clip_Count_Exact_Override", 1, 15, "Exact video clip count override");
  intField("video_clip_count_min_override", "Video_Clip_Count_Min_Override", 1, 15, "Minimum video clip count override");
  intField("video_clip_count_max_override", "Video_Clip_Count_Max_Override", 1, 15, "Maximum video clip count override");
  choiceField("carousel_slide_count_mode_override", "Carousel_Slide_Count_Mode_Override", PRO_OUTPUT_COUNT_MODES);
  intField("carousel_slide_count_exact_override", "Carousel_Slide_Count_Exact_Override", 1, 20, "Exact carousel slide count override");
  intField("carousel_slide_count_min_override", "Carousel_Slide_Count_Min_Override", 1, 20, "Minimum carousel slide count override");
  intField("carousel_slide_count_max_override", "Carousel_Slide_Count_Max_Override", 1, 20, "Maximum carousel slide count override");
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

async function getProductionRequestOutput(request, env, url, authorization) {
  const outputRecordId = productionRequestOutputIdFromPath(url);
  const { row, parent } = await loadAuthorizedProductionRequestOutput(env, outputRecordId, authorization);
  return respond(request, env, {
    ok: true,
    record: mapProductionRequestOutput(row, parent),
    production_request: mapProductionRequest(parent),
  });
}

async function updateProductionRequestOutput(request, env, url, authorization) {
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


const ITEM4_MEDIA_PUBLIC_BASE = "https://media.chicagoshining.com";
const ITEM4_MAPPING_TABLE = "Platform Output Mappings";
const ITEM4_MAX_FILES = 20;
const ITEM4_MAX_FILE_BYTES = 25 * 1024 * 1024;
const ITEM4_MAX_TOTAL_BYTES = 150 * 1024 * 1024;

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
      "Story": { mapping_type: "Instagram Story", format: "Story", rationale: "Companion 15-second 9:16 Story from the first photo, with a slight zoom and the same music. After the main post is live, the Story can link through to that Reel or feed post." },
    }),
  }),
  Facebook: Object.freeze({
    default_output_type: "Slideshow Reel",
    options: Object.freeze({
      "Multi-Image Post": { mapping_type: "Facebook Photo Set", format: "Photo Set", rationale: "Optional. Publishes a silent native Facebook multi-photo so people can swipe each still. No music or voiceover." },
      "Slideshow Reel": { mapping_type: "Facebook Reel", format: "Vertical Short Video", rationale: "Default. Renders the same photos as a 9:16 Facebook Reel with music and voiceover." },
      "Reel": { mapping_type: "Facebook Reel", format: "Vertical Short Video", rationale: "Creates a 9:16 Facebook Reel from shot video, not from a photo set." },
      "Single Image": { mapping_type: "Facebook Post", format: "Feed Post", rationale: "Use one hero photo as a Facebook post." },
      "Story": { mapping_type: "Facebook Story", format: "Story", rationale: "Companion 15-second 9:16 Story from the first photo, with a slight zoom and the same music. After the main post is live, the Story can link through to that Reel or photo post." },
    }),
  }),
  TikTok: Object.freeze({
    default_output_type: "Multi-Photo",
    options: Object.freeze({
      "Multi-Photo": { mapping_type: "TikTok Slideshow", format: "Photo Set", rationale: "Uses TikTok's photo/slideshow experience with a 9:16 safe presentation." },
      "Video Draft": { mapping_type: "TikTok Video", format: "Vertical Short Video", rationale: "Renders the source photos as a 9:16 TikTok video draft." },
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

function item4ParseJson(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function item4RequestIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/production-requests\/(rec[A-Za-z0-9]+)/);
  if (!match) throw new HttpError(400, "Invalid Production Request Item 4 route");
  return match[1];
}

function item4AssetIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/production-requests\/rec[A-Za-z0-9]+\/assets\/([A-Za-z0-9_-]+)$/);
  return match ? match[1] : null;
}

function item4SafeFileName(name) {
  const clean = String(name || "photo").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return clean || "photo";
}

function item4FileExtension(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function item4IsHeicFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  const ext = item4FileExtension(file?.name);
  return mime.includes("heic") || mime.includes("heif") || ext === "heic" || ext === "heif";
}

function item4IsSupportedImageFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  return mime.startsWith("image/") || item4IsHeicFile(file);
}

function item4NormalizedMimeType(file) {
  const mime = String(file?.type || "").toLowerCase();
  if (mime.startsWith("image/")) return mime;
  const ext = item4FileExtension(file?.name);
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  return "application/octet-stream";
}


function item4AssetManifest(record) {
  const parsed = item4ParseJson(f(record, "Studio_Master_Assets_JSON"), []);
  return Array.isArray(parsed)
    ? parsed.filter((x) => x && x.id && (x.google_drive_file_id || x.r2_key || x.url))
    : [];
}

function item4NormalizeSlideCaptions(raw) {
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

function item4ApplySlideCaptions(assets, captions) {
  const byId = new Map(item4NormalizeSlideCaptions(captions).map((row) => [row.id, row]));
  if (!byId.size) return Array.isArray(assets) ? assets : [];
  return (Array.isArray(assets) ? assets : []).map((asset) => {
    const hit = byId.get(String(asset?.id || ""));
    if (!hit) return asset;
    return {
      ...asset,
      caption_mode: hit.mode,
      caption: hit.mode === "manual" ? hit.text : "",
    };
  });
}

function item4JoinedSlideCaptions(assets) {
  return (Array.isArray(assets) ? assets : [])
    .slice()
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
    .map((asset) => String(asset?.caption || "").trim())
    .filter(Boolean);
}

function item4RequestedCaptionIsSlideDump(caption, assets) {
  const manuals = item4JoinedSlideCaptions(assets);
  if (manuals.length < 2) return false;
  const text = String(caption || "").trim();
  return Boolean(text) && (text === manuals.join("\n\n") || text === manuals.join("\n"));
}

const ITEM4_MEDIA_ASSET_TABLE = "tblSITCujCsJTNcDe";

function item4MasterTransferId(recordId, assetId) {
  return `ITEM4-MASTER-${recordId}-${assetId}`;
}

async function item4MasterQueueRows(env, recordId) {
  const rows = await item4VariantQueueRows(env, recordId);
  return rows.filter((row) => String(f(row, "Asset_Kind") || "").trim() === "Master Original");
}

async function item4UpsertMasterQueue(env, recordId, assets) {
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
    if (!["Ready", "Pending"].includes(currentPreviewStatus)) {
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

async function item4FindMasterMediaAsset(env, transferId) {
  const rows = await listRecords(env, ITEM4_MEDIA_ASSET_TABLE, {
    limit: 2,
    filterFormula: `{Studio_Transfer_ID}='${String(transferId).replace(/'/g, "\\'")}'`,
  });
  return rows[0] || null;
}

async function item4CreateMasterMediaAsset(env, recordId, asset, driveId, driveUrl, transferId) {
  const body = await airtableFetch(env, ITEM4_MEDIA_ASSET_TABLE, "", {
    method: "POST",
    body: JSON.stringify({
      records: [{
        fields: {
          "Asset Name": String(asset.name || "photo"),
          Media_Class: "Image",
          "Google Drive URL": driveUrl,
          "Google Drive File ID": driveId,
          MIME_Type: String(asset.mime_type || "application/octet-stream"),
          File_Extension: String(asset.source_format || item4FileExtension(asset.name) || "").toLowerCase(),
          File_Size_Bytes: Number(asset.size_bytes || 0) || null,
          Intake_Status: "Created",
          Intake_Date: new Date().toISOString().slice(0, 10),
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
        },
      }],
      typecast: true,
    }),
  });
  return Array.isArray(body?.records) ? body.records[0] : null;
}


async function item4SanitizeStudioImageMediaAsset(env, mediaAssetId) {
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

async function item4ReconcileMasterAuthority(env, recordId, record = null) {
  let currentRecord = record || await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const assets = item4AssetManifest(currentRecord).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  if (!assets.length) return { record: currentRecord, assets, status: "None", ready_count: 0, target_count: 0 };

  const rows = await item4MasterQueueRows(env, recordId);
  const byTransferId = new Map(rows.map((row) => [String(f(row, "Transfer_ID") || "").trim(), row]));
  const nextAssets = [];
  const mediaAssetIds = [];
  let readyCount = 0;
  let failedError = null;

  for (const asset of assets) {
    const transferId = item4MasterTransferId(recordId, asset.id);
    const q = byTransferId.get(transferId) || null;
    let driveId = String(asset?.google_drive_file_id || "").trim();
    let driveUrl = String(asset?.google_drive_url || "").trim();
    let mediaAssetId = String(asset?.media_asset_record_id || "").trim();
    let previewUrl = String(asset?.preview_url || "").trim();
    if (q) previewUrl = String(f(q, "Preview_URL") || previewUrl || "").trim();

    if (q && item4QueueStatus(q) === "Failed" && !failedError) {
      failedError = String(f(q, "Error_Message") || `${asset.name || "Master photo"} failed Google Drive authority handoff`);
    }

    if (q && ["Drive Uploaded", "Ready"].includes(item4QueueStatus(q))) {
      driveId = driveId || item4QueueDriveFileId(q) || "";
      driveUrl = driveUrl || String(f(q, "Drive_URL") || "").trim();
      if (driveId && !driveUrl) driveUrl = `https://drive.google.com/file/d/${driveId}/view`;

      if (driveId && !mediaAssetId) {
        let mediaAsset = await item4FindMasterMediaAsset(env, transferId);
        if (!mediaAsset) {
          mediaAsset = await item4CreateMasterMediaAsset(env, recordId, asset, driveId, driveUrl, transferId);
        }
        mediaAssetId = mediaAsset?.id || "";
      }

      if (driveId && mediaAssetId) {
        const stagingKey = String(asset?.r2_key || f(q, "Source_R2_Key") || "").trim();
        if (stagingKey && env.STUDIO_MEDIA) {
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
    nextAssets.push({
      ...asset,
      google_drive_file_id: driveId || null,
      google_drive_url: driveUrl || null,
      media_asset_record_id: mediaAssetId || null,
      preview_url: previewUrl || null,
      authoritative_storage: authoritative ? "google_drive" : (asset.authoritative_storage || null),
      staging_deleted: authoritative ? true : Boolean(asset.staging_deleted),
      r2_key: authoritative ? null : (asset.r2_key || null),
      url: authoritative ? (driveUrl || null) : (asset.url || null),
    });
  }

  const status = failedError ? "Error" : readyCount === assets.length ? "Ready" : "Uploading";
  currentRecord = await item4UpdateRequestState(env, recordId, {
    Studio_Master_Assets_JSON: JSON.stringify(nextAssets),
    Studio_Master_Asset_Count: nextAssets.length,
    Studio_Master_Asset_Status: status,
    Studio_Master_Media_Assets: [...new Set(mediaAssetIds)],
    Studio_Item4_State: failedError ? "Error" : readyCount === assets.length ? "Assets Ready" : "Draft",
  });
  return { record: currentRecord, assets: nextAssets, status, ready_count: readyCount, target_count: assets.length, error: failedError };
}

async function item4UpdateRequestState(env, recordId, fields) {
  return airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId, {
    method: "PATCH",
    body: JSON.stringify({ fields: { ...fields, Updated_At: new Date().toISOString() }, typecast: false }),
  });
}

async function getItem4MasterAssets(request, env, url, authorization) {
  const recordId = item4RequestIdFromPath(url);
  try { await item4EnsureP3SingleParentRoute(env); } catch (error) { console.warn("P3 single-parent hardening deferred", error); }
  try { await item4EnsureP3StudioSourceAuthority(env); } catch (error) { console.warn("P3 Studio exact-source hardening deferred", error); }
  try { await item4EnsureR2StudioExactSourceGuard(env); } catch (error) { console.warn("R2 Studio exact-source guard hardening deferred", error); }
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  let assets = item4AssetManifest(record).sort((a,b) => Number(a.order||0)-Number(b.order||0));
  const currentStatus = String(f(record, "Studio_Master_Asset_Status") || "").trim();

  // Polling this endpoint is also the resumable reconciliation path.  If Make has
  // already moved a staged master into Drive, promote that checkpoint into the
  // Production Request manifest / Media Assets and remove the temporary R2 copy.
  if (assets.length && currentStatus !== "Ready") {
    try {
      const reconciled = await item4ReconcileMasterAuthority(env, recordId, record);
      record = reconciled.record;
      assets = reconciled.assets.sort((a,b) => Number(a.order||0)-Number(b.order||0));
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

async function uploadItem4MasterAssets(request, env, url, authorization) {
  if (!env.STUDIO_MEDIA) throw new HttpError(503, "Studio media storage is not configured");
  const recordId = item4RequestIdFromPath(url);
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);

  let form;
  try { form = await request.formData(); } catch { throw new HttpError(400, "Could not read uploaded media"); }
  const files = form.getAll("files").filter(value => value && typeof value.arrayBuffer === "function");
  if (!files.length) throw new HttpError(400, "Choose at least one image");
  if (files.length > ITEM4_MAX_FILES) throw new HttpError(400, `Upload no more than ${ITEM4_MAX_FILES} files at once`);

  const existing = item4AssetManifest(record);
  if (existing.length + files.length > ITEM4_MAX_FILES) throw new HttpError(400, `A Production Request can contain at most ${ITEM4_MAX_FILES} master assets`);
  const meta = item4ParseJson(form.get("metadata"), []);
  const metadata = Array.isArray(meta) ? meta : [];
  let total = 0;
  for (const file of files) {
    total += Number(file.size || 0);
    if (!item4IsSupportedImageFile(file)) throw new HttpError(415, `${file.name || "A file"} is not a supported photo. HEIC and HEIF are supported.`);
    if (Number(file.size || 0) > ITEM4_MAX_FILE_BYTES) throw new HttpError(413, `${file.name || "An image"} exceeds the 25 MB per-image limit`);
  }
  if (total > ITEM4_MAX_TOTAL_BYTES) throw new HttpError(413, "The selected images exceed the 150 MB upload limit");

  await item4UpdateRequestState(env, recordId, { Studio_Master_Asset_Status: "Uploading" });
  const uploaded = [];
  let authorityQueueStarted = false;
  try {
    for (let i=0; i<files.length; i++) {
      const file = files[i];
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 18);
      const safeName = item4SafeFileName(file.name);
      const key = `studio/master-assets/${recordId}/${id}-${safeName}`;
      const buffer = await file.arrayBuffer();
      await env.STUDIO_MEDIA.put(key, buffer, {
        httpMetadata: { contentType: item4NormalizedMimeType(file) },
        customMetadata: { productionRequestId: recordId, originalName: String(file.name || safeName), assetId: id },
      });
      const m = metadata[i] || {};
      const width = Number(m.width || 0) || null;
      const height = Number(m.height || 0) || null;
      uploaded.push({
        id,
        order: existing.length + i + 1,
        name: String(file.name || safeName),
        mime_type: item4NormalizedMimeType(file),
        source_format: item4IsHeicFile(file) ? item4FileExtension(file.name).toUpperCase() : (item4FileExtension(file.name).toUpperCase() || null),
        browser_preview_compatible: !item4IsHeicFile(file),
        size_bytes: Number(file.size || buffer.byteLength || 0),
        width,
        height,
        source_ratio: width && height ? `${width}:${height}` : null,
        focal_point: "center",
        r2_key: key,
        url: `${ITEM4_MEDIA_PUBLIC_BASE}/${key}`,
        uploaded_at: new Date().toISOString(),
      });
    }
    const assets = [...existing, ...uploaded];
    record = await item4UpdateRequestState(env, recordId, {
      Studio_Master_Assets_JSON: JSON.stringify(assets),
      Studio_Master_Asset_Count: assets.length,
      Studio_Master_Asset_Status: "Uploading",
      Studio_Output_Plan_Status: "Needs Plan",
      Studio_Output_Plan_JSON: null,
      Studio_Variant_Manifest_JSON: null,
      Studio_Variant_Status: "None",
      Studio_Variant_Updated_At: null,
      Studio_Variant_Error: null,
      Studio_Item4_State: "Draft",
    });

    authorityQueueStarted = true;
    const expected = await item4UpsertMasterQueue(env, recordId, assets);

    // The Google Drive authority handoff is restartable. A transient synchronous
    // Make drain failure must not turn a successful browser/R2 upload into HTTP 500
    // after staging and queue rows already exist.
    let reconciled = await item4ReconcileMasterAuthority(env, recordId, record);
    const executionIds = [];
    let drainWarning = null;

    if (reconciled.status === "Uploading" && expected.length) {
      try {
        const drained = await item4DrainVariantWorker(
          env,
          recordId,
          Math.min(8, Math.max(2, expected.length + 2)),
          { maxMs: ITEM4_DRAIN_POST_BUDGET_MS }
        );
        if (Array.isArray(drained)) executionIds.push(...drained);
      } catch (error) {
        drainWarning = error instanceof Error ? error.message : String(error || "Master-media worker drain failed");
        console.warn("Item 4 master-media drain deferred to scheduled worker", error);
      }

      try {
        reconciled = await item4ReconcileMasterAuthority(env, recordId);
      } catch (error) {
        console.warn("Item 4 post-drain reconciliation deferred", error);
      }
    }

    if (reconciled.status === "Error") {
      throw new HttpError(502, reconciled.error || "Master-media Google Drive authority handoff failed");
    }

    if (reconciled.status !== "Ready") {
      try {
        const safeRecord = await item4UpdateRequestState(env, recordId, {
          Studio_Master_Asset_Status: "Uploading",
          Studio_Item4_State: "Draft",
        });
        reconciled.record = safeRecord;
      } catch {}
    }

    return respond(request, env, {
      ok: true,
      uploaded: uploaded.length,
      authority_status: reconciled.status,
      authority_progress: { ready: reconciled.ready_count, target: reconciled.target_count },
      assets: reconciled.assets,
      execution_ids: executionIds,
      handoff_warning: drainWarning,
      record: mapProductionRequest(reconciled.record),
      message: reconciled.status === "Ready"
        ? `${reconciled.ready_count} master photo${reconciled.ready_count === 1 ? "" : "s"} preserved in Google Drive and registered as Media Assets; temporary R2 staging removed.`
        : "Master photos were accepted. Google Drive preservation is continuing in the restartable background handoff.",
    }, reconciled.status === "Ready" ? 201 : 202);
  } catch (error) {
    // Before queue handoff begins, an upload failure can be rolled back completely.
    // After queue handoff begins, preserve staging and a resumable state unless
    // reconciliation has proven a terminal handoff failure.
    if (!authorityQueueStarted) {
      for (const asset of uploaded) { try { await env.STUDIO_MEDIA.delete(asset.r2_key); } catch {} }
      try {
        await item4UpdateRequestState(env, recordId, {
          Studio_Master_Asset_Status: "Error",
          Studio_Item4_State: "Error",
        });
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

async function deleteItem4MasterAsset(request, env, url, authorization) {
  try { await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const recordId = item4RequestIdFromPath(url);
  const assetId = item4AssetIdFromPath(url);
  if (!assetId) throw new HttpError(400, "Invalid master asset ID");
  const record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);
  const assets = item4AssetManifest(record);
  const target = assets.find(x => x.id === assetId);
  if (!target) throw new HttpError(404, "Master asset not found");
  if (env.STUDIO_MEDIA) { try { await env.STUDIO_MEDIA.delete(target.r2_key); } catch {} }
  const remaining = assets.filter(x => x.id !== assetId).map((x,i) => ({...x, order:i+1}));
  const updated = await item4UpdateRequestState(env, recordId, {
    Studio_Master_Assets_JSON: JSON.stringify(remaining),
    Studio_Master_Asset_Count: remaining.length,
    Studio_Master_Asset_Status: remaining.length ? "Ready" : "None",
    Studio_Output_Plan_Status: "Needs Plan",
    Studio_Output_Plan_JSON: null,
    Studio_Variant_Manifest_JSON: null,
    Studio_Variant_Status: "None",
    Studio_Variant_Updated_At: null,
    Studio_Variant_Error: null,
    Studio_Item4_State: remaining.length ? "Assets Ready" : "Draft",
  });
  return respond(request, env, { ok: true, deleted: true, assets: remaining, record: mapProductionRequest(updated) });
}


const ITEM4_FBS1_SCENARIO_ID = 5816409;
const ITEM4_FBS1_EXPECTED_WEBHOOK_ID = 2639647;

async function item4EnsureFacebookSlideshowVoiceoverPayload(env, authorization) {
  const { makeApiBase, headers } = await phase6MakeApiConfig(env);

  const readBlueprint = async () => {
    const response = await fetch(
      `${makeApiBase}/scenarios/${ITEM4_FBS1_SCENARIO_ID}/blueprint?draft=false`,
      { method: "GET", headers }
    );
    const raw = await response.text();
    let body;
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
    if (!response.ok) {
      throw new HttpError(
        response.status,
        `FBS1 blueprint read failed (${response.status}): ${raw.slice(0, 500)}`
      );
    }
    const blueprint = body?.response?.blueprint || body?.blueprint || null;
    if (!blueprint || typeof blueprint !== "object") {
      throw new HttpError(502, "FBS1 did not return a usable live blueprint");
    }
    return blueprint;
  };

  const live = await readBlueprint();
  const webhookModule = phase6FindModule(live.flow, 900);
  if (
    !webhookModule ||
    webhookModule.module !== "gateway:CustomWebHook" ||
    Number(webhookModule?.parameters?.hook) !== ITEM4_FBS1_EXPECTED_WEBHOOK_ID
  ) {
    throw new HttpError(
      409,
      "FBS1 webhook no longer matches the validated production baseline; no Make write attempted"
    );
  }

  const renderRequest = phase6FindModule(live.flow, 13);
  if (!renderRequest || renderRequest.module !== "util:SetVariable2") {
    throw new HttpError(
      409,
      "FBS1 module 13 no longer matches the validated slideshow-render baseline; no Make write attempted"
    );
  }

  const currentValue = String(renderRequest?.mapper?.value || "");
  if (!currentValue.includes("FacebookImageSlideshow9x16")) {
    throw new HttpError(
      409,
      "FBS1 module 13 is no longer the validated FacebookImageSlideshow9x16 request; no Make write attempted"
    );
  }

  if (currentValue.includes("Voiceover_URL") && currentValue.includes('"voiceover"')) {
    return {
      ok: true,
      already_ready: true,
      scenario_id: ITEM4_FBS1_SCENARIO_ID,
      live_name: live.name,
      webhook_id: ITEM4_FBS1_EXPECTED_WEBHOOK_ID,
    };
  }

  requirePermission(authorization, "tenant_admin");

  const patched = JSON.parse(JSON.stringify(live));
  const patchedRequest = phase6FindModule(patched.flow, 13);
  const patchedValue = String(patchedRequest?.mapper?.value || "");
  const clipsToken = '  "clips":';

  if (!patchedValue.includes(clipsToken)) {
    throw new HttpError(
      409,
      "FBS1 render JSON no longer contains the expected clips token; no Make write attempted"
    );
  }

  patchedRequest.mapper.value = patchedValue.replace(
    clipsToken,
    [
      '  "voiceover": {',
      '    "url": "{{escapeJSON(ifempty(1.Voiceover_URL; \\"\\"))}}",',
      '    "volume": 1',
      '  },',
      '  "clips":'
    ].join("\n")
  );

  if (patchedRequest?.metadata?.designer) {
    patchedRequest.metadata.designer.name =
      "13 - Build Slideshow Render Request with Title Cover Music Voiceover";
  }

  patched.name =
    "FBS1 - Start Facebook Slideshow Render v1.0.7 - Voiceover Payload";
  delete patched.idSequence;

  const requestedAt = new Date().toISOString();
  let auditId = null;

  try {
    const auditCreate = await airtableFetch(env, "Make Admin Queue", "", {
      method: "POST",
      body: JSON.stringify({
        records: [{
          fields: {
            Command_ID: `STUDIO-FBS1-VOICEOVER-${Date.now()}`,
            Action: "UPDATE_BLUEPRINT",
            Scenario_ID: ITEM4_FBS1_SCENARIO_ID,
            Scenario_Name: patched.name,
            Proposed_Blueprint_JSON_Original: JSON.stringify(patched),
            Write_Approved: true,
            Status: "Processing",
            Backup_Blueprint_Wrapper_2: JSON.stringify(live),
            Requested_At: requestedAt,
            Started_At: requestedAt,
            Requested_By: String(
              authorization?.user?.email ||
              authorization?.email ||
              "studio-admin"
            ),
            Correlation_ID: "ITEM4-FBS1-VOICEOVER-HARDENING",
            Notes:
              "Studio automatic hardening. Adds Platform Output Voiceover_URL to FBS1 render payload. Existing webhook, schedule and layout are preserved."
          }
        }],
        typecast: true
      })
    });
    auditId = auditCreate?.records?.[0]?.id || null;
  } catch (error) {
    console.warn("FBS1 audit row creation failed; Make write will not proceed", error);
    throw new HttpError(502, "Could not create the required FBS1 rollback/audit checkpoint");
  }

  let patchStatus = null;

  try {
    // Match the already-proven direct Worker -> Make blueprint contract used by
    // Phase 6 migrations: the Make API receives blueprint as a JSON string.
    const patchResponse = await fetch(
      `${makeApiBase}/scenarios/${ITEM4_FBS1_SCENARIO_ID}?confirmed=true`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ blueprint: JSON.stringify(patched) })
      }
    );
    patchStatus = patchResponse.status;
    const patchText = await patchResponse.text();

    if (!patchResponse.ok) {
      throw new Error(
        `FBS1 Make PATCH failed (${patchResponse.status}): ${patchText.slice(0, 500)}`
      );
    }

    const verified = await readBlueprint();
    const verifiedWebhook = phase6FindModule(verified.flow, 900);
    const verifiedRequest = phase6FindModule(verified.flow, 13);
    const verifiedValue = String(verifiedRequest?.mapper?.value || "");

    if (Number(verifiedWebhook?.parameters?.hook) !== ITEM4_FBS1_EXPECTED_WEBHOOK_ID) {
      throw new Error("FBS1 post-write verification found a changed webhook ID");
    }
    if (!verifiedValue.includes("Voiceover_URL") || !verifiedValue.includes('"voiceover"')) {
      throw new Error(
        "FBS1 post-write verification did not contain the required voiceover payload"
      );
    }

    if (auditId) {
      await airtableFetch(env, "Make Admin Queue", auditId, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
            Status: "Succeeded",
            Completed_At: new Date().toISOString(),
            Error_Message: "",
            Result_JSON: JSON.stringify({
              ok: true,
              scenario_id: ITEM4_FBS1_SCENARIO_ID,
              deployed_name: verified.name,
              make_patch_status: patchStatus,
              webhook_preserved: true,
              webhook_id: ITEM4_FBS1_EXPECTED_WEBHOOK_ID,
              scheduling_changed: false,
              voiceover_payload: true,
            })
          }
        })
      });
    }

    return {
      ok: true,
      already_ready: false,
      scenario_id: ITEM4_FBS1_SCENARIO_ID,
      live_name: verified.name,
      audit_record_id: auditId,
      webhook_id: ITEM4_FBS1_EXPECTED_WEBHOOK_ID,
    };
  } catch (error) {
    if (auditId) {
      try {
        await airtableFetch(env, "Make Admin Queue", auditId, {
          method: "PATCH",
          body: JSON.stringify({
            fields: {
              Status: "Failed",
              Completed_At: new Date().toISOString(),
              Error_Message:
                error instanceof Error
                  ? error.message
                  : "FBS1 voiceover hardening failed",
              Result_JSON: JSON.stringify({
                ok: false,
                scenario_id: ITEM4_FBS1_SCENARIO_ID,
                make_patch_status: patchStatus,
              })
            }
          })
        });
      } catch {}
    }
    throw new HttpError(
      502,
      error instanceof Error
        ? error.message
        : "FBS1 voiceover hardening failed"
    );
  }
}

function item4DynamicRationale(text, count) {
  const n = Math.max(0, Number(count || 0));
  const phrase = `${n} photo${n === 1 ? "" : "s"}`;
  return String(text || "").replace(/five photos/gi, phrase);
}

async function item4MappingIndex(env) {
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

function item4PhotoCountKind(count) {
  return Math.max(0, Number(count) || 0) <= 1 ? "single-photo" : "multiple-photos";
}

function item4DefaultOutputType(platform, photoCount) {
  const n = Math.max(0, Number(photoCount) || 0);
  const single = Object.freeze({ Instagram: "Single Image", Facebook: "Single Image", TikTok: "Video Draft" });
  const multiple = Object.freeze({ Instagram: "Reel", Facebook: "Slideshow Reel", TikTok: "Video Draft", YouTube: "Short" });
  const map = n <= 1 ? single : multiple;
  return map[platform] || null;
}

function item4CanonicalOutputType(platform, outputType) {
  const p = String(platform || "").trim();
  const o = String(outputType || "").trim();
  if (p === "TikTok" && o === "Single Photo") return "Video Draft";
  return o;
}

function item4IsCompanionOutputType(outputType) {
  return String(outputType || "").trim() === "Story";
}

function item4IsUnsupportedCompanion(platform, outputType) {
  return String(platform || "").trim() === "TikTok" && item4IsCompanionOutputType(outputType);
}

const ITEM4_STORY_TEASER_SECONDS = 15;

function item4CompanionStoryFields(outputType) {
  if (!item4IsCompanionOutputType(outputType)) return {};
  return {
    Voiceover_Mode_Override: "No",
    Background_Music_Mode_Override: "Yes",
    Video_Duration_Seconds_Override: ITEM4_STORY_TEASER_SECONDS,
    Video_Clip_Count_Mode_Override: "Exact",
    Video_Clip_Count_Exact_Override: 1,
  };
}

function item4NormalizePlanExtras(payloadExtras, platforms, existingItems = []) {
  const allowed = new Set((Array.isArray(platforms) ? platforms : []).map((platform) => String(platform || "").trim()).filter(Boolean));
  const extras = [];
  const seen = new Set((Array.isArray(existingItems) ? existingItems : []).map((item) => item4BridgePlanKey(item?.platform, item?.output_type)));
  for (const pair of Array.isArray(payloadExtras) ? payloadExtras : []) {
    const platform = String(pair?.platform || "").trim();
    const outputType = item4CanonicalOutputType(platform, pair?.output_type);
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

function item4PlanChoice(platform, requestedOutputType, photoCount) {
  const spec = ITEM4_PLAN_SPECS[platform];
  if (!spec) throw new HttpError(400, `Item 4 does not support ${platform}`);
  const fallback = item4DefaultOutputType(platform, photoCount) || spec.default_output_type;
  const outputType = item4CanonicalOutputType(platform, String(requestedOutputType || fallback).trim());
  const selected = spec.options[outputType];
  if (!selected) throw new HttpError(400, `${platform} output type ${outputType} is not supported by the Item 4 planner`);
  return { output_type: outputType, ...selected, available_output_types: Object.keys(spec.options) };
}

function item4PlanItemFromChoice(platform, chosen, photoCount, mappingIndex, { companion = false } = {}) {
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

async function item4ReconcilePlanWithEnabledOutputs(env, record, enabledPairs) {
  const assets = item4AssetManifest(record);
  const photoCount = Math.max(assets.length, 1);
  const mappingIndex = await item4MappingIndex(env);
  const existingPlan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  const items = Array.isArray(existingPlan?.items) ? [...existingPlan.items] : [];
  const previousRatios = item4RequiredRatios(existingPlan).join("|");
  let changed = false;

  for (const pair of enabledPairs || []) {
    const outputType = item4CanonicalOutputType(pair.platform, pair.output_type)
      || item4DefaultOutputType(pair.platform, photoCount);
    if (!outputType || !ITEM4_PLAN_SPECS[pair.platform]) continue;
    if (item4IsUnsupportedCompanion(pair.platform, outputType)) continue;
    const key = item4BridgePlanKey(pair.platform, outputType);
    if (items.some((item) => item4BridgePlanKey(item.platform, item.output_type) === key)) continue;
    try {
      const chosen = item4PlanChoice(pair.platform, outputType, photoCount);
      items.push(item4PlanItemFromChoice(pair.platform, chosen, photoCount, mappingIndex, {
        companion: item4IsCompanionOutputType(outputType),
      }));
      changed = true;
    } catch {
      continue;
    }
  }
  if (!changed) return record;

  const plan = {
    schema_version: "item4.output-plan.1",
    generated_at: new Date().toISOString(),
    production_request_record_id: record.id,
    source_asset_count: assets.length,
    photo_count_kind: item4PhotoCountKind(assets.length),
    items,
  };
  const needsReview = items.some((item) => !item.aspect_ratio);
  const nextRatios = item4RequiredRatios(plan).join("|");
  const fields = {
    Target_Platforms: [...new Set(items.map((item) => item.platform))],
    Studio_Output_Plan_JSON: JSON.stringify(plan),
    Studio_Output_Plan_Status: needsReview ? "Needs Review" : "Ready",
  };
  if (previousRatios && previousRatios !== nextRatios) {
    fields.Studio_Variant_Status = "None";
    fields.Studio_Variant_Manifest_JSON = null;
    fields.Studio_Variant_Updated_At = null;
    fields.Studio_Variant_Error = null;
  }
  return item4UpdateRequestState(env, record.id, fields);
}

async function item4DisableUnsupportedCompanions(env, requestRecord) {
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

async function item4ReconcileEnabledPlanOutputs(env, requestRecord) {
  await item4DisableUnsupportedCompanions(env, requestRecord);
  const rows = await outputRowsForProductionRequest(env, requestRecord.id);
  const enabled = rows
    .filter((row) => Boolean(f(row, "Enabled")))
    .map((row) => ({
      platform: String(f(row, "Platform") || "").trim(),
      output_type: String(f(row, "Output_Type") || "").trim(),
    }));
  const updated = await item4ReconcilePlanWithEnabledOutputs(env, requestRecord, enabled);
  return item4RelinkVariantQueueOutputs(env, updated);
}

async function item4SyncPlanOutputs(env, requestRecord, items) {
  const productionRequestId = requestRecord.id;
  const existing = await outputRowsForProductionRequest(env, productionRequestId);
  const byKey = new Map(existing.map(row => [`${String(f(row,"Platform")||"").trim()}::${String(f(row,"Output_Type")||"").trim()}`, row]));
  const wanted = new Set();
  const now = new Date().toISOString();
  for (let i=0; i<items.length; i++) {
    const item = items[i];
    const key = `${item.platform}::${item.output_type}`;
    wanted.add(key);
    const current = byKey.get(key);
    const storyFields = item4CompanionStoryFields(item.output_type);
    if (current) {
      await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, current.id, {
        method:"PATCH",
        body:JSON.stringify({fields:{Enabled:true,Active:true,Output_Order:i+1,Output_Status:"Draft",Carousel_Image_Mode_Override:"Manual Upload",...storyFields,Updated_At:now},typecast:false}),
      });
    } else {
      await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, "", {
        method:"POST",
        body:JSON.stringify({fields:{
          Production_Request_Output_ID:makeProductionRequestOutputId(), Production_Request:[productionRequestId],
          Test_Run_ID:String(f(requestRecord,"Test_Run_ID")||"").trim()||null,
          Organization:arrayOrEmpty(f(requestRecord,"Organization")), Brand:arrayOrEmpty(f(requestRecord,"Brand")), Created_By:arrayOrEmpty(f(requestRecord,"Created_By")),
          Platform:item.platform, Output_Type:item.output_type, Output_Status:"Draft", Output_Order:i+1, Enabled:true, Active:true,
          Carousel_Image_Mode_Override:"Manual Upload", ...storyFields, Created_At:now, Updated_At:now,
        },typecast:false}),
      });
    }
  }
  for (const row of existing) {
    const key=`${String(f(row,"Platform")||"").trim()}::${String(f(row,"Output_Type")||"").trim()}`;
    if (!wanted.has(key)) {
      await airtableFetch(env, PRODUCTION_REQUEST_OUTPUT_TABLE, row.id, {method:"PATCH",body:JSON.stringify({fields:{Enabled:false,Active:false,Updated_At:now},typecast:false})});
    }
  }
}

async function buildItem4OutputPlan(request, env, url, authorization) {
  let payload={};
  try { payload=await request.json(); } catch { throw new HttpError(400,"Request body must be valid JSON"); }
  const recordId=item4RequestIdFromPath(url);
  let record=await loadAuthorizedProductionRequest(env,recordId,authorization);
  assertEditableProductionRequest(record);
  const assets=item4AssetManifest(record).sort((a,b)=>Number(a.order||0)-Number(b.order||0));
  if (!assets.length) throw new HttpError(409,"Upload at least one master photo before building the platform plan");
  const requestedPlatforms=Array.isArray(payload.platforms)&&payload.platforms.length?payload.platforms:["Instagram","Facebook","TikTok","YouTube"];
  const platforms=[...new Set(requestedPlatforms.map(x=>String(x||"").trim()).filter(Boolean))];
  const overrides=payload.overrides&&typeof payload.overrides==="object"?payload.overrides:{};
  const mappingIndex=await item4MappingIndex(env);
  const items=[];
  let needsReview=false;
  for (const platform of platforms) {
    const requestedRaw = item4CanonicalOutputType(platform, overrides[platform] || "");
    const requested = item4IsCompanionOutputType(requestedRaw) ? "" : requestedRaw;
    const fallback = item4DefaultOutputType(platform, assets.length);
    if (!requested && !fallback) continue;
    const chosen = item4PlanChoice(platform, requested || fallback, assets.length);
    items.push(item4PlanItemFromChoice(platform, chosen, assets.length, mappingIndex));
    if (!items[items.length - 1].aspect_ratio) needsReview = true;
  }
  const extras = item4NormalizePlanExtras(payload.extras, platforms, items);
  for (const extra of extras) {
    try {
      const chosen = item4PlanChoice(extra.platform, extra.output_type, assets.length);
      items.push(item4PlanItemFromChoice(extra.platform, chosen, assets.length, mappingIndex, { companion: extra.companion }));
      if (!items[items.length - 1].aspect_ratio) needsReview = true;
    } catch {
      continue;
    }
  }
  const plan={schema_version:"item4.output-plan.1",generated_at:new Date().toISOString(),production_request_record_id:recordId,source_asset_count:assets.length,photo_count_kind:item4PhotoCountKind(assets.length),items};

  if (items.some(item =>
    item.platform === "Facebook" &&
    item.output_type === "Slideshow Reel"
  )) {
    await item4EnsureFacebookSlideshowVoiceoverPayload(env, authorization);
  }

  await item4SyncPlanOutputs(env,record,items);
  const maxCount=Math.min(15,Math.max(1,assets.length));
  record=await item4UpdateRequestState(env,recordId,{
    Master_Content_Type:assets.length<=1?"Feed Post":"Photo Set", Target_Platforms:items.map(item=>item.platform),
    Carousel_Image_Mode:"Manual Upload", Carousel_Slide_Count_Mode:"Exact", Carousel_Slide_Count_Exact:assets.length,
    Carousel_Slide_Count_Min:null, Carousel_Slide_Count_Max:null,
    Video_Clip_Count_Mode:"Exact", Video_Clip_Count_Exact:maxCount, Video_Clip_Count_Min:null, Video_Clip_Count_Max:null,
    Studio_Output_Plan_JSON:JSON.stringify(plan), Studio_Output_Plan_Status:needsReview?"Needs Review":"Ready",
    Studio_Variant_Manifest_JSON:null, Studio_Variant_Status:"None", Studio_Variant_Updated_At:null, Studio_Variant_Error:null,
    Studio_Item4_State:needsReview?"Assets Ready":"Plan Ready",
  });
  const rows=await outputRowsForProductionRequest(env,recordId);
  return respond(request,env,{ok:true,plan,production_request:mapProductionRequest(record),outputs:rows.map(row=>mapProductionRequestOutput(row,record)),message:needsReview?"Platform plan created; one or more ratio mappings need review.":"Platform plan created from the current master photos and ratio authority."});
}

async function getItem4OutputPlan(request, env, url, authorization) {
  const recordId=item4RequestIdFromPath(url);
  const record=await loadAuthorizedProductionRequest(env,recordId,authorization);
  return respond(request,env,{ok:true,status:f(record,"Studio_Output_Plan_Status")||"Needs Plan",plan:item4ParseJson(f(record,"Studio_Output_Plan_JSON"),null)});
}

const ITEM4_VARIANT_QUEUE_TABLE = "tblBZLXPd1p2NRWRK";
const ITEM4_SMV1_SCENARIO_ID = 5894885;
const ITEM4_VARIANT_RECIPE_VERSION = "fill-crop-v2";
const ITEM4_DRAIN_POST_BUDGET_MS = 12000;
const ITEM4_DRAIN_STATUS_BUDGET_MS = 8000;
const ITEM4_DRAIN_BACKGROUND_BUDGET_MS = 20000;
const ITEM4_SMV1_BASE_ELIGIBILITY_FORMULA = 'OR(AND({Asset_Kind}="Master Original",{Transfer_Status}="Pending"),AND({Asset_Kind}="Platform Variant",OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded")),AND(OR({Asset_Kind}="Master Original",{Asset_Kind}="Platform Variant"),{Transfer_Status}="Ready",{Preview_Status}="Pending"))';
const ITEM4_SMV1_PRODUCTION_FORMULA = `AND({Test_Run_ID}=BLANK(),${ITEM4_SMV1_BASE_ELIGIBILITY_FORMULA})`;
const ITEM4_P3_SCENARIO_ID = 5531703;
const ITEM4_P3_WEBHOOK_URL = "https://hook.us2.make.com/66wq22tanm43b7w9b4m8beukmv7z8a65";
const ITEM4_R2_SCENARIO_ID = 5569495;
const ITEM4_R2_SOURCE_GUARD_NAME = "R2 - Auto Asset Selection v6.2 - Studio + Legacy Explicit Eligibility";
const ITEM4_P3_SOURCE_AUTHORITY_NAME = "P3 - Platform Output Generation v4.7 - Studio Exact Source Lock + Correct R2 Queue State";



function item4VariantManifest(record) {
  const parsed = item4ParseJson(f(record, "Studio_Variant_Manifest_JSON"), null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function item4CoverStillUrl(requestRecord, outputRow = null) {
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

function item4PlanRatios(plan) {
  const ratios = [];
  const items = Array.isArray(plan?.items) ? plan.items : [];
  for (const item of items) {
    const ratio = String(item?.aspect_ratio || "").trim();
    if (ITEM4_RATIO_SPECS[ratio] && !ratios.includes(ratio)) ratios.push(ratio);
  }
  return ratios;
}

function item4CoverExtraRatios(plan) {
  const extras = [];
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const needsYoutubeCover = items.some((item) => String(item?.platform || "").trim() === "YouTube");
  if (needsYoutubeCover && !item4PlanRatios(plan).includes("16:9")) extras.push("16:9");
  return extras;
}

function item4RequiredRatios(plan) {
  return [...item4PlanRatios(plan), ...item4CoverExtraRatios(plan)];
}

function item4VariantRatioKey(ratio) {
  return String(ratio || "").replace(":", "x");
}

function item4VariantTargetFileName(asset, ratio) {
  const original = String(asset?.name || "photo").trim() || "photo";
  const base = original.replace(/\.[^.]+$/, "") || "photo";
  const filename = `${item4SafeFileName(base)}__${item4VariantRatioKey(ratio)}__${ITEM4_VARIANT_RECIPE_VERSION}.jpg`;
  const suffix = item4CropTransferSuffix(asset, ratio);
  return suffix ? filename.replace(/\.jpg$/i, `${suffix}.jpg`) : filename;
}

function item4NormalizedCrop(asset, ratio) {
  const raw = asset?.crops?.[ratio] || asset?.crops?.[String(ratio)] || null;
  const x = Number(raw?.x);
  const y = Number(raw?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0.5, y: 0.5 };
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

function item4CropStyleToken(asset, ratio) {
  const crop = item4NormalizedCrop(asset, ratio);
  if (Math.abs(crop.x - 0.5) < 0.005 && Math.abs(crop.y - 0.5) < 0.005) return "center";
  return `${crop.x.toFixed(2)}x${crop.y.toFixed(2)}`;
}

function item4CropTransferSuffix(asset, ratio) {
  const token = item4CropStyleToken(asset, ratio);
  return token === "center" ? "" : `-g${token}`;
}

function item4MergeAssetCrops(assets, cropsPayload) {
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

function item4QueueTransferId(recordId, assetId, ratio, asset = null) {
  return `ITEM4-VARIANT-${ITEM4_VARIANT_RECIPE_VERSION}-${recordId}-${assetId}-${item4VariantRatioKey(ratio)}${item4CropTransferSuffix(asset, ratio)}`;
}

function item4QueueStatus(row) {
  return String(f(row, "Transfer_Status") || "").trim();
}

async function item4RequeueStaleProcessing(env, rows) {
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
      const updated = await airtableFetch(env, ITEM4_VARIANT_QUEUE_TABLE, row.id, {
        method: "PATCH",
        body: JSON.stringify({
          fields: {
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

function item4QueueMediaAssetId(row) {
  const generated = arrayOrEmpty(f(row, "Generated_Media_Asset"));
  if (generated.length) return generated[0];
  return String(f(row, "Media_Asset_Record_ID") || "").trim() || null;
}

function item4QueueDriveFileId(row) {
  return String(f(row, "Drive_File_ID") || "").trim() || null;
}

function item4OutputIdsForRatio(outputRows, plan, ratio) {
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

function item4SameRecordIds(left, right) {
  const a = [...new Set((Array.isArray(left) ? left : []).filter(Boolean))].sort();
  const b = [...new Set((Array.isArray(right) ? right : []).filter(Boolean))].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

async function item4RelinkVariantQueueOutputs(env, record) {
  const plan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  if (!plan?.items?.length) return record;
  const outputRows = await outputRowsForProductionRequest(env, record.id);
  const queueRows = await item4VariantQueueRows(env, record.id);
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
  }
  return record;
}

async function item4VariantQueueRows(env, recordId) {
  return listRecords(env, ITEM4_VARIANT_QUEUE_TABLE, {
    limit: 100,
    filterFormula: `{Production_Request_Record_ID}='${String(recordId).replace(/'/g, "\\'")}'`,
  });
}

async function item4PipelineSetting(env, name) {
  const rows = await listRecords(env, "Pipeline Settings", {
    limit: 5,
    filterFormula: `AND({Active}=1,{Setting_Name}='${String(name).replace(/'/g, "\\'")}')`,
  });
  return String(rows[0] ? f(rows[0], "Setting_Value") || "" : "").trim();
}

async function item4UpsertVariantQueue(env, recordId, assets, ratios, outputRows, plan) {
  const ownerRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const testRunId = String(f(ownerRecord, "Test_Run_ID") || "").trim();
  const driveFolderId = await item4PipelineSetting(env, "STUDIO_VARIANT_DRIVE_FOLDER_ID");
  if (!driveFolderId) throw new HttpError(500, "STUDIO_VARIANT_DRIVE_FOLDER_ID is not configured");

  const existingRows = await item4VariantQueueRows(env, recordId);
  const byTransferId = new Map(
    existingRows.map((row) => [String(f(row, "Transfer_ID") || "").trim(), row])
  );

  const expected = [];
  for (const asset of assets) {
    const sourceDriveId = String(asset?.google_drive_file_id || "").trim();
    const sourceMediaAssetId = String(asset?.media_asset_record_id || "").trim();

    if (!sourceDriveId) {
      throw new HttpError(409, `${asset?.name || "Master photo"} has not reached Google Drive authority yet`);
    }
    if (!sourceMediaAssetId) {
      throw new HttpError(409, `${asset?.name || "Master photo"} is missing its authoritative Media Asset link`);
    }

    for (const ratio of ratios) {
      const spec = ITEM4_RATIO_SPECS[ratio];
      if (!spec) throw new HttpError(400, `Unsupported platform ratio ${ratio}`);

      const transferId = item4QueueTransferId(recordId, asset.id, ratio, asset);
      const targetOutputs = item4OutputIdsForRatio(outputRows, plan, ratio);
      const targetFileName = item4VariantTargetFileName(asset, ratio);
      const current = byTransferId.get(transferId) || null;
      const currentStatus = current ? item4QueueStatus(current) : "";
      const currentPreviewStatus = current ? String(f(current, "Preview_Status") || "").trim() : "";
      const preserveStatus = ["Ready", "Drive Uploaded", "Processing"].includes(currentStatus);

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

      if (!preserveStatus) {
        fields.Transfer_Status = currentStatus === "Failed" ? "Pending" : (currentStatus || "Pending");
        fields.Error_Message = null;
      }
      if (!["Ready", "Pending"].includes(currentPreviewStatus)) {
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

      expected.push({
        transfer_id: transferId,
        asset_id: String(asset.id),
        ratio,
        recipe_version: ITEM4_VARIANT_RECIPE_VERSION,
        target_file_name: targetFileName,
        queue_record_id: row?.id || current?.id || null,
      });
    }
  }
  return expected;
}


function item4Smv1FormulaQuoted(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function item4Smv1ExactTestFormula(recordId, testRunId) {
  return `AND({Production_Request_Record_ID}="${item4Smv1FormulaQuoted(recordId)}",{Test_Run_ID}="${item4Smv1FormulaQuoted(testRunId)}",${ITEM4_SMV1_BASE_ELIGIBILITY_FORMULA})`;
}
async function item4SetSmv1SelectorFormula(env, formula) {
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

async function item4DrainVariantWorker(env, recordId, maxRuns, options = {}) {
  // Hard guarantee: before any pending platform variant is allowed to run,
  // verify the live SMV1 blueprint has filename-only Drive reuse disabled.
  // This keeps variant generation source-locked even when generic filenames
  // (for example images 1.jpg) are reused across different Production Requests.
  await item4EnsureSmv1PreviewCacheWorker(env);

  const maxMs = Number(options.maxMs || 0);
  const started = Date.now();
  const ownerRecord = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const testRunId = String(f(ownerRecord, "Test_Run_ID") || "").trim();
  const originalState = await phase6ScenarioState(env, ITEM4_SMV1_SCENARIO_ID);
  if (testRunId && originalState.isActive) throw new HttpError(409, "Test Mode refuses to seize an already-active SMV1 scenario");
  const executionIds = [];

  try {
    for (let attempt = 0; attempt < maxRuns; attempt += 1) {
      if (maxMs > 0 && (Date.now() - started) >= maxMs) break;
      const current = await item4VariantQueueRows(env, recordId);
      const outstanding = current.filter((row) =>
        ["Pending", "Drive Uploaded", "Processing"].includes(item4QueueStatus(row))
      );
      if (!outstanding.length) break;
      if (testRunId) {
        const crossBoundary=current.filter((row)=>String(f(row,"Test_Run_ID")||"").trim()!==testRunId);
        if(crossBoundary.length) throw new HttpError(409,"SMV1 Test Mode queue contains a blank or mismatched Test_Run_ID");
      }

      if (!originalState.isActive) {
        // SMV1 Module 1 intentionally reads maxRecords=1. In the production
        // operating model SMV1 is normally OFF, and starting it has proven to
        // execute one queue cycle reliably. Pulse ON -> one cycle -> OFF for
        // each outstanding row instead of depending on repeated /run calls
        // against a temporarily active interval scenario.
        let exactTestSelectorInstalled=false;
        try {
          if(testRunId){await item4SetSmv1SelectorFormula(env,item4Smv1ExactTestFormula(recordId,testRunId));exactTestSelectorInstalled=true;}
          await phase6SetScenarioActive(env, ITEM4_SMV1_SCENARIO_ID, true);
          await new Promise((resolve) => setTimeout(resolve, 2500));
        } finally {
          try { await phase6SetScenarioActive(env, ITEM4_SMV1_SCENARIO_ID, false); } catch {}
          if(exactTestSelectorInstalled) await item4SetSmv1SelectorFormula(env,ITEM4_SMV1_PRODUCTION_FORMULA);
        }

        // Give Make/Airtable a short reconciliation window before deciding
        // whether another pulse is needed.
        const beforeIds = new Set(outstanding.map((row) => row.id));
        for (let wait = 0; wait < 6; wait += 1) {
          if (maxMs > 0 && (Date.now() - started) >= maxMs) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const after = await item4VariantQueueRows(env, recordId);
          const stillOutstanding = after.filter((row) =>
            beforeIds.has(row.id) && ["Pending", "Drive Uploaded", "Processing"].includes(item4QueueStatus(row))
          );
          if (stillOutstanding.length < outstanding.length) break;
        }
        continue;
      }

      // If SMV1 was already active before Item 4 touched it, preserve that
      // operating state and use Make's explicit run endpoint instead.
      const run = await phase6RunScenario(env, ITEM4_SMV1_SCENARIO_ID);
      executionIds.push(run.executionId);
      const remaining = maxMs > 0 ? Math.max(1500, maxMs - (Date.now() - started)) : 60000;
      const done = await phase6WaitForScenarioExecution(
        env,
        ITEM4_SMV1_SCENARIO_ID,
        run.executionId,
        Math.min(60000, remaining),
        1500
      );
      if (done.done && !done.success) {
        throw new HttpError(502, `SMV1 variant worker failed with status ${done.status}`);
      }
    }
  } finally {
    if (!originalState.isActive) {
      try { await phase6SetScenarioActive(env, ITEM4_SMV1_SCENARIO_ID, false); } catch {}
    }
    if(testRunId){try{await item4SetSmv1SelectorFormula(env,ITEM4_SMV1_PRODUCTION_FORMULA);}catch{}}
  }

  return executionIds;
}

function item4BuildDriveManifest(recordId, assets, ratios, queueRows) {
  const queueById = new Map(
    queueRows.map((row) => [String(f(row, "Transfer_ID") || "").trim(), row])
  );

  const manifest = {
    schema_version: "item4.variant-manifest.2",
    recipe_version: ITEM4_VARIANT_RECIPE_VERSION,
    production_request_record_id: recordId,
    authoritative_storage: "google_drive",
    persistent_cloudflare_storage: false,
    source_asset_count: assets.length,
    required_ratios: ratios,
    target_count: assets.length * ratios.length,
    ready_count: 0,
    generated_at: new Date().toISOString(),
    assets: [],
  };

  for (const asset of assets) {
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

    for (const ratio of ratios) {
      const transferId = item4QueueTransferId(recordId, asset.id, ratio, asset);
      const q = queueById.get(transferId);
      if (!q || item4QueueStatus(q) !== "Ready") continue;

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
      if (previewStatus === "Ready") manifest.ready_count += 1;
    }
    manifest.assets.push(row);
  }

  manifest.complete = manifest.ready_count === manifest.target_count;
  return manifest;
}

async function item4ReconcileVariants(env, recordId, record = null, options = {}) {
  record = record || await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const assets = item4AssetManifest(record).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const plan = item4ParseJson(f(record, "Studio_Output_Plan_JSON"), null);
  const planRatios = item4PlanRatios(plan || {});
  const ratios = item4RequiredRatios(plan || {});
  let queueRows = await item4VariantQueueRows(env, recordId);
  queueRows = await item4RequeueStaleProcessing(env, queueRows);
  const expectedIds = new Set(
    assets.flatMap((asset) => ratios.map((ratio) => item4QueueTransferId(recordId, asset.id, ratio, asset)))
  );
  const scoped = queueRows.filter((row) => expectedIds.has(String(f(row, "Transfer_ID") || "").trim()));

  // A saved plan alone must never move Item 4 into "Preparing".
  // Only an explicit Prepare Platform Media action (or an already-existing
  // variant queue for this request) is allowed to transition the workspace into
  // the preparing/ready/error lifecycle.
  if (!scoped.length) {
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
  const planFailed = scoped.filter((row) =>
    planExpectedIds.has(String(f(row, "Transfer_ID") || "").trim()) && item4QueueStatus(row) === "Failed"
  );
  const pending = scoped.filter((row) =>
    ["Pending", "Drive Uploaded", "Processing"].includes(item4QueueStatus(row))
  );
  const planPending = pending.filter((row) => planExpectedIds.has(String(f(row, "Transfer_ID") || "").trim()));
  const manifest = item4BuildDriveManifest(recordId, assets, ratios, scoped);
  const planManifest = item4BuildDriveManifest(recordId, assets, planRatios, scoped);
  const mediaAssetIds = [...new Set(
    scoped.filter((row) => item4QueueStatus(row) === "Ready")
      .map(item4QueueMediaAssetId)
      .filter(Boolean)
  )];

  if (!options.skipSanitize) {
    for (const mediaAssetId of mediaAssetIds) {
      await item4SanitizeStudioImageMediaAsset(env, mediaAssetId);
    }
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
  } else if (planManifest.complete) {
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

async function prepareItem4Variants(request, env, url, authorization, ctx = null) {
  let payload = {};
  try { payload = await request.json(); } catch { payload = {}; }

  const recordId = item4RequestIdFromPath(url);
  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  assertEditableProductionRequest(record);

  const cropsPayload = payload?.crops && typeof payload.crops === "object" ? payload.crops : {};
  let assets = item4MergeAssetCrops(item4AssetManifest(record), cropsPayload)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  if (!assets.length) throw new HttpError(409, "Upload master photos before preparing platform media");

  if (Object.keys(cropsPayload).length) {
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
        Math.min(8, Math.max(2, missingDrive.length + 2)),
        { maxMs: ITEM4_DRAIN_POST_BUDGET_MS }
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
    throw new HttpError(
      409,
      `${stillMissing.length} master photo${stillMissing.length === 1 ? " has" : "s have"} not reached complete Google Drive + Media Asset authority yet`
    );
  }

  authoritativeAssets = item4MergeAssetCrops(authoritativeAssets, cropsPayload);

  const outputRows = await outputRowsForProductionRequest(env, recordId);
  await item4UpdateRequestState(env, recordId, {
    Studio_Variant_Status: "Preparing",
    Studio_Variant_Error: null,
    Studio_Item4_State: "Plan Ready",
  });

  const expected = await item4UpsertVariantQueue(env, recordId, authoritativeAssets, ratios, outputRows, plan);
  let reconciled = await item4ReconcileVariants(env, recordId);

  if (reconciled.status === "Preparing") {
    try {
      const executionIds = await item4DrainVariantWorker(
        env,
        recordId,
        Math.min(8, Math.max(2, expected.length + 2)),
        { maxMs: ITEM4_DRAIN_POST_BUDGET_MS }
      );
      reconciled = await item4ReconcileVariants(env, recordId);
      reconciled.execution_ids = executionIds;
    } catch (error) {
      console.warn("Item 4 platform variant drain deferred to background/status polling", error);
    }
  }

  if (reconciled.status === "Preparing" && ctx && typeof ctx.waitUntil === "function") {
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
    try {
      await item4DrainPreviewCacheWorker(
        env,
        recordId,
        Math.min(12, Math.max(4, reconciled.manifest.target_count + authoritativeAssets.length + 2))
      );
      const masterPreviewReconcile = await item4ReconcileMasterAuthority(env, recordId);
      record = masterPreviewReconcile.record;
      reconciled = await item4ReconcileVariants(env, recordId, record);
    } catch (error) {
      console.warn("Platform browser preview-cache creation failed without affecting Drive authority", error);
    }
  }

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
      ? `${reconciled.manifest.ready_count} platform-ready Google Drive variants are ready.`
      : failed
        ? (reconciled.error || "Platform media preparation failed. See error.")
        : "Platform media preparation is still running.",
  }, failed ? 500 : ready ? 200 : 202);
}

async function getItem4Variants(request, env, url, authorization) {
  const recordId = item4RequestIdFromPath(url);
  const record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  const reconciled = await item4ReconcileVariants(env, recordId, record);
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

async function item4ResumePendingMasterAuthority(env, recordId, record = null) {
  let currentRecord = record || await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  let assets = item4AssetManifest(currentRecord).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

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

  let rows = await item4MasterQueueRows(env, recordId);
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

  // SMV1 Module 1 intentionally processes maxRecords=1. Pulse it enough times
  // to drain this request's unfinished masters, while keeping a hard bound so a
  // 3-second browser status poll cannot create an unbounded worker loop.
  const maxRuns = Math.min(6, Math.max(1, outstanding.length));
  const executionIds = await item4DrainVariantWorker(env, recordId, maxRuns, { maxMs: ITEM4_DRAIN_STATUS_BUDGET_MS });
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

async function item4ResumePendingVariants(env, recordId, record = null) {
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
    assets.flatMap((asset) => ratios.map((ratio) => item4QueueTransferId(recordId, asset.id, ratio, asset)))
  );
  const scoped = queueRows.filter((row) => expectedIds.has(String(f(row, "Transfer_ID") || "").trim()));
  if (!scoped.length) {
    return { attempted: false, reason: "prepare-not-started", record: currentRecord, execution_ids: [] };
  }

  const failed = scoped.filter((row) => item4QueueStatus(row) === "Failed");
  const outstanding = scoped.filter((row) =>
    ["Pending", "Drive Uploaded", "Processing"].includes(item4QueueStatus(row))
  );
  if (failed.length && !outstanding.length) {
    const reconciled = await item4ReconcileVariants(env, recordId, currentRecord);
    return { attempted: false, reason: "variant-failure-present", record: reconciled.record, execution_ids: [] };
  }

  if (!outstanding.length) {
    const reconciled = await item4ReconcileVariants(env, recordId, currentRecord);
    return { attempted: false, reason: "no-pending-variants", record: reconciled.record, execution_ids: [] };
  }

  const maxRuns = Math.min(6, Math.max(1, outstanding.length));
  const executionIds = await item4DrainVariantWorker(env, recordId, maxRuns, { maxMs: ITEM4_DRAIN_STATUS_BUDGET_MS });
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

async function getItem4WorkspaceStatus(request, env, url, authorization) {
  const recordId = item4RequestIdFromPath(url);

  // A normal Production workspace refresh lands on this status route. Keep the
  // source-to-production bridge self-healing here so deployment + one refresh
  // is sufficient to harden the live P3/R2 scenarios before any new outputs run.
  // Hardening failures are surfaced diagnostically but do not make status polling
  // itself destructive or unavailable.
  let makeHardening;
  try {
    makeHardening = await item4EnsureMakeHardeningFromWorkspaceOpen(env);
  } catch (error) {
    makeHardening = { p3: null, r2: { ok: false, deferred: true, error: error instanceof Error ? error.message : String(error) }, stale_recovery: null };
    console.warn("Item 4 Make hardening deferred from workspace status", error);
  }

  let record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  let assets = item4AssetManifest(record).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
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
      if (reconciled.status === "Preparing" && Array.isArray(reconciled.queue_rows) && reconciled.queue_rows.length) {
        variantResume = await item4ResumePendingVariants(env, recordId, record);
        record = variantResume.record || record;
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
  const variantStatus = f(record, "Studio_Variant_Status") || "None";
  const previewSelfHealState = assetsStatus === "Error" || variantStatus === "Error"
    ? "error"
    : assetsStatus === "Uploading"
      ? "uploading"
      : (variantStatus === "Preparing" || previewPendingCount > 0)
        ? "preview_pending"
        : (masterAuthorityResume?.attempted || variantResume?.attempted)
          ? "retrying"
          : (assetsStatus === "Ready" && (variantStatus === "Ready" || variantStatus === "None"))
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

const PRODUCTION_REQUEST_TABLE = "Production Requests";
const PR_STATUSES = new Set(["Draft", "Ready", "Submitted", "Promoted", "Cancelled"]);
const PR_CONTENT_TYPES = new Set([
  "Vertical Short Video","Story","Carousel","Feed Post","Text Post","Thread",
  "Longform Video","Thumbnail / Promo Still","Event / Flyer Post","Photo Set"
]);
const PR_PLATFORMS = new Set(["Instagram","Facebook","TikTok","YouTube","Threads","X","Lemon8"]);
const PR_TRISTATE = new Set(["Use Profile Default","Yes","No"]);
const PR_COUNT_MODES = new Set(["AI decides","Exact","Target range"]);
const PR_TEXT_MODES = new Set(["AI decides","Force exact","AI improve","Leave blank"]);
const PR_CAROUSEL_IMAGE_MODES = new Set(["Make AI Generated","Manual Upload"]);

function mapProductionRequest(record) {
  const links = (name) => Array.isArray(f(record, name)) ? f(record, name) : [];
  return {
    id: record.id,
    production_request_id: f(record, "Production_Request_ID"),
    test_run_id: f(record, "Test_Run_ID") || null,
    idea_candidate_links: links("Idea_Candidate"),
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
    production_notes: f(record, "Production_Notes"),
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
  };
}

function productionRequestRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/production-requests\/(rec[A-Za-z0-9]+)/);
  if (!match) throw new HttpError(400, "Invalid Production Request record ID");
  return match[1];
}

function makeProductionRequestId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PR-${stamp}-${random}`;
}

async function loadAuthorizedProductionRequest(env, recordId, authorization) {
  const record = await airtableFetch(env, PRODUCTION_REQUEST_TABLE, recordId);
  const orgLinks = Array.isArray(f(record, "Organization")) ? f(record, "Organization") : [];
  const brandLinks = Array.isArray(f(record, "Brand")) ? f(record, "Brand") : [];

  if (!orgLinks.includes(authorization?.organization?.record_id) ||
      !brandLinks.includes(authorization?.brand?.record_id)) {
    throw new HttpError(403, "Production Request is not part of the authorized Studio tenant/brand");
  }
  return record;
}

function normalizeChoice(value, allowed, fallback, label) {
  const normalized = String(value ?? fallback ?? "").trim() || String(fallback || "");
  if (!allowed.has(normalized)) throw new HttpError(400, `${label} is invalid`);
  return normalized;
}

function nullableInt(value, min, max, label) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.trunc(n) !== n || n < min || n > max) {
    throw new HttpError(400, `${label} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

function nullableNumber(value, min, max, label) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${label} must be between ${min} and ${max}`);
  }
  return n;
}

async function validateMusicAsset(env, recordId) {
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

function normalizeRequestedVoice(payload, voiceoverMode) {
  if (voiceoverMode !== "Yes") return { voice_id: null, voice_name: null };
  const voiceId = String(payload?.voice_id || payload?.selected_voice_id || "").trim().slice(0, 120) || PHASE6_DEFAULT_VOICE_ID;
  const suppliedName = String(payload?.voice_name || "").trim().slice(0, 80);
  const voiceName = suppliedName
    || (voiceId === PHASE6_GEORGE_VOICE_ID ? "George" : voiceId === PHASE6_DEFAULT_VOICE_ID ? "Kate" : voiceId);
  return { voice_id: voiceId, voice_name: voiceName };
}

function requestedVoiceFromProductionRequest(record) {
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

async function cleanProductionRequestPayload(payload, env) {
  const contentTypeRaw = String(payload?.content_type || "").trim();
  const contentType = contentTypeRaw
    ? normalizeChoice(contentTypeRaw, PR_CONTENT_TYPES, "", "Master content type")
    : null;

  const platformsRaw = Array.isArray(payload?.platforms) ? payload.platforms : [];
  const platforms = [...new Set(platformsRaw.map(v => String(v || "").trim()).filter(Boolean))];
  const invalidPlatforms = platforms.filter(v => !PR_PLATFORMS.has(v));
  if (invalidPlatforms.length) throw new HttpError(400, `Unsupported platform(s): ${invalidPlatforms.join(", ")}`);

  const voiceoverMode = normalizeChoice(payload?.voiceover_mode, PR_TRISTATE, "Use Profile Default", "Voiceover mode");
  const backgroundMusicMode = normalizeChoice(payload?.background_music_mode, PR_TRISTATE, "Use Profile Default", "Background music mode");
  const thumbnailMode = normalizeChoice(payload?.thumbnail_mode, PR_TRISTATE, "Use Profile Default", "Thumbnail mode");

  const videoClipCountMode = normalizeChoice(payload?.video_clip_count_mode, PR_COUNT_MODES, "AI decides", "Video clip count mode");
  const carouselSlideCountMode = normalizeChoice(payload?.carousel_slide_count_mode, PR_COUNT_MODES, "AI decides", "Carousel slide count mode");

  const videoDurationSeconds = nullableInt(payload?.video_duration_seconds, 5, 600, "Video duration");
  const voiceoverTailSeconds = nullableNumber(payload?.voiceover_tail_seconds, 0, 10, "Voiceover tail");

  let videoClipCountExact = nullableInt(payload?.video_clip_count_exact, 1, 30, "Exact video clip count");
  let videoClipCountMin = nullableInt(payload?.video_clip_count_min, 1, 30, "Minimum video clip count");
  let videoClipCountMax = nullableInt(payload?.video_clip_count_max, 1, 30, "Maximum video clip count");

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

  let carouselSlideCountExact = nullableInt(payload?.carousel_slide_count_exact, 1, 20, "Exact carousel slide count");
  let carouselSlideCountMin = nullableInt(payload?.carousel_slide_count_min, 1, 20, "Minimum carousel slide count");
  let carouselSlideCountMax = nullableInt(payload?.carousel_slide_count_max, 1, 20, "Maximum carousel slide count");

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

  const carouselImageMode = normalizeChoice(
    payload?.carousel_image_mode,
    PR_CAROUSEL_IMAGE_MODES,
    "Make AI Generated",
    "Carousel image mode"
  );

  const titleMode = normalizeChoice(payload?.title_mode, PR_TEXT_MODES, "AI decides", "Title mode");
  const captionMode = normalizeChoice(payload?.caption_mode, PR_TEXT_MODES, "AI decides", "Caption mode");
  const scriptMode = normalizeChoice(payload?.script_mode, PR_TEXT_MODES, "AI decides", "Script mode");

  let requestedTitle = String(payload?.requested_title || "").trim();
  let requestedCaption = String(payload?.requested_caption || "").trim();
  let requestedScript = String(payload?.requested_script || "").trim();
  const productionNotes = String(payload?.production_notes || "").trim();

  if (requestedTitle.length > 500) throw new HttpError(400, "Requested title must be 500 characters or fewer");
  if (requestedCaption.length > 10000) throw new HttpError(400, "Requested caption must be 10000 characters or fewer");
  if (requestedScript.length > 25000) throw new HttpError(400, "Requested script must be 25000 characters or fewer");
  if (productionNotes.length > 10000) throw new HttpError(400, "Production notes must be 10000 characters or fewer");

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
    production_notes: productionNotes,
  };
}

function productionRequestFields(input, nowIso) {
  return {
    Request_Status: "Draft",
    Master_Content_Type: input.content_type || null,
    Target_Platforms: input.platforms || [],
    Voiceover_Mode: input.voiceover_mode,
    Background_Music_Mode: input.background_music_mode,
    Thumbnail_Mode: input.thumbnail_mode,
    Video_Duration_Seconds: input.video_duration_seconds,
    Video_Clip_Count_Mode: input.video_clip_count_mode,
    Video_Clip_Count_Exact: input.video_clip_count_exact,
    Video_Clip_Count_Min: input.video_clip_count_min,
    Video_Clip_Count_Max: input.video_clip_count_max,
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
    Production_Notes: input.production_notes || null,
    Updated_At: nowIso,
    Active: true,
  };
}

function productionRequestDefaultsFromIdea(idea) {
  return {
    content_type: String(f(idea, "Production_Content_Type") || "").trim() || null,
    platforms: Array.isArray(f(idea, "Production_Target_Platforms")) ? f(idea, "Production_Target_Platforms") : [],
    voiceover_mode: String(f(idea, "Production_Include_Voiceover") || "Use Profile Default").trim() || "Use Profile Default",
    background_music_mode: String(f(idea, "Production_Include_Background_Music") || "Use Profile Default").trim() || "Use Profile Default",
    thumbnail_mode: String(f(idea, "Production_Include_Thumbnail") || "Use Profile Default").trim() || "Use Profile Default",
    video_duration_seconds: f(idea, "Production_Video_Duration") || 30,
    video_clip_count_mode: f(idea, "Production_Video_Clip_Count") ? "Exact" : "AI decides",
    video_clip_count_exact: f(idea, "Production_Video_Clip_Count") || null,
    video_clip_count_min: null,
    video_clip_count_max: null,
    carousel_slide_count_mode: f(idea, "Production_Carousel_Slide_Count") ? "Exact" : "AI decides",
    carousel_slide_count_exact: f(idea, "Production_Carousel_Slide_Count") || null,
    carousel_slide_count_min: null,
    carousel_slide_count_max: null,
    carousel_image_mode: String(f(idea, "Production_Carousel_Image_Mode") || "Make AI Generated").trim() || "Make AI Generated",
    voiceover_tail_seconds: f(idea, "Voiceover_Tail_Seconds") ?? 2,
    selected_music_asset_id: null,
    voice_id: null,
    voice_name: null,
    title_mode: "AI decides",
    requested_title: "",
    caption_mode: "AI decides",
    requested_caption: "",
    script_mode: "AI decides",
    requested_script: "",
    production_notes: "",
  };
}

async function existingDraftForIdea(env, ideaRecordId, authorization) {
  const records = await listRecords(env, PRODUCTION_REQUEST_TABLE, { limit: 100 });
  return records.find(record => {
    const ideaLinks = Array.isArray(f(record, "Idea_Candidate")) ? f(record, "Idea_Candidate") : [];
    const orgLinks = Array.isArray(f(record, "Organization")) ? f(record, "Organization") : [];
    const brandLinks = Array.isArray(f(record, "Brand")) ? f(record, "Brand") : [];
    const status = String(f(record, "Request_Status") || "").trim();
    return ideaLinks.includes(ideaRecordId) &&
      orgLinks.includes(authorization?.organization?.record_id) &&
      brandLinks.includes(authorization?.brand?.record_id) &&
      ["Draft","Ready"].includes(status) &&
      Boolean(f(record, "Active"));
  }) || null;
}

async function createDraftForIdea(env, idea, authorization, input = null) {
  const now = new Date().toISOString();
  const cleaned = input || await cleanProductionRequestPayload(productionRequestDefaultsFromIdea(idea), env);
  const fields = {
    Production_Request_ID: makeProductionRequestId(),
    Idea_Candidate: [idea.id],
    Test_Run_ID: String(f(idea, "Test_Run_ID") || "").trim() || null,
    Organization: [authorization.organization.record_id],
    Brand: [authorization.brand.record_id],
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
    body: JSON.stringify({ fields, typecast: false }),
  });
}

async function getOrCreateProductionRequestForIdea(request, env, url, authorization) {
  const ideaRecordId = ideaRecordIdFromPath(url);
  const idea = await loadAuthorizedIdea(env, ideaRecordId, authorization);
  if (promotionCompleted(idea)) {
    throw new HttpError(409, "This idea has already been promoted; its production configuration is locked");
  }
  if (String(f(idea, "Candidate_Status") || "").trim() === "On Hold") {
    throw new HttpError(409, "Restore this idea before configuring production");
  }

  const existing = await existingDraftForIdea(env, ideaRecordId, authorization);
  if (existing) {
    return respond(request, env, { ok: true, created: false, record: mapProductionRequest(existing) });
  }

  const created = await createDraftForIdea(env, idea, authorization);
  return respond(request, env, { ok: true, created: true, record: mapProductionRequest(created) }, 201);
}

async function createProductionRequestFromBody(request, env, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const ideaRecordId = String(payload?.idea_record_id || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(ideaRecordId)) throw new HttpError(400, "idea_record_id is required");

  const idea = await loadAuthorizedIdea(env, ideaRecordId, authorization);
  if (promotionCompleted(idea)) throw new HttpError(409, "This idea has already been promoted");
  const existing = await existingDraftForIdea(env, ideaRecordId, authorization);
  if (existing) return respond(request, env, { ok: true, created: false, record: mapProductionRequest(existing) });

  const input = await cleanProductionRequestPayload(payload, env);
  const created = await createDraftForIdea(env, idea, authorization, input);
  return respond(request, env, { ok: true, created: true, record: mapProductionRequest(created) }, 201);
}


function mapProductionRequestSummary(record) {
  const mapped = mapProductionRequest(record);
  return {
    id: mapped.id,
    production_request_id: mapped.production_request_id,
    idea_candidate_links: mapped.idea_candidate_links,
    organization_links: mapped.organization_links,
    brand_links: mapped.brand_links,
    created_by_links: mapped.created_by_links,
    status: mapped.status,
    content_type: mapped.content_type,
    platforms: mapped.platforms,
    video_duration_seconds: mapped.video_duration_seconds,
    carousel_slide_count_mode: mapped.carousel_slide_count_mode,
    carousel_slide_count_exact: mapped.carousel_slide_count_exact,
    created_at: mapped.created_at,
    updated_at: mapped.updated_at,
    submitted_at: mapped.submitted_at,
    promoted_content_item_links: mapped.promoted_content_item_links,
    active: mapped.active,
    studio_master_asset_count: mapped.studio_master_asset_count,
    studio_master_asset_status: mapped.studio_master_asset_status,
    studio_output_plan_status: mapped.studio_output_plan_status,
    studio_variant_status: mapped.studio_variant_status,
    studio_item4_state: mapped.studio_item4_state,
  };
}

async function listProductionRequests(request, env, url, authorization) {
  // v0.10.6: collection refresh is a guaranteed hardening entry point.
  try { await item4EnsureMakeHardeningFromWorkspaceOpen(env); } catch (error) {
    console.warn("Item 4 Make hardening deferred from Production Request list", error);
  }
  const records = await listRecords(env, PRODUCTION_REQUEST_TABLE, { limit: clampLimit(url, 100, 100) });
  const filtered = records.filter(record => {
    const orgLinks = Array.isArray(f(record, "Organization")) ? f(record, "Organization") : [];
    const brandLinks = Array.isArray(f(record, "Brand")) ? f(record, "Brand") : [];
    return orgLinks.includes(authorization?.organization?.record_id) &&
      brandLinks.includes(authorization?.brand?.record_id);
  });
  return respond(request, env, { ok: true, records: filtered.map(mapProductionRequestSummary) });
}

async function getProductionRequest(request, env, url, authorization) {
  const recordId = productionRequestRecordIdFromPath(url);
  const record = await loadAuthorizedProductionRequest(env, recordId, authorization);
  return respond(request, env, { ok: true, record: mapProductionRequest(record) });
}

async function updateProductionRequest(request, env, url, authorization) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const recordId = productionRequestRecordIdFromPath(url);
  const existing = await loadAuthorizedProductionRequest(env, recordId, authorization);
  const status = String(f(existing, "Request_Status") || "").trim();
  if (!["Draft","Ready"].includes(status)) {
    throw new HttpError(409, `Production Request is ${status || "locked"} and cannot be edited`);
  }

  const input = await cleanProductionRequestPayload(payload, env);
  const now = new Date().toISOString();
  const fields = productionRequestFields(input, now);
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
      typecast: false,
    }),
  });

  return respond(request, env, {
    ok: true,
    updated: true,
    record: mapProductionRequest(updated),
  });
}



function productionRequestBridgeRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/production-requests\/(rec[A-Za-z0-9]+)\/bridge-preflight$/);
  if (!match) throw new HttpError(400, "Invalid Production Request bridge-preflight route");
  return match[1];
}

function item4DerivedIdeaSummary(ideaRecord, requestRecord) {
  const title = String(f(ideaRecord, "Candidate_Title") || "").trim() || "Untitled production request";
  const contentType = String(f(requestRecord, "Master_Content_Type") || "content").trim() || "content";
  const platforms = arrayOrEmpty(f(requestRecord, "Target_Platforms")).map(value => String(value || "").trim()).filter(Boolean);
  const notes = String(f(requestRecord, "Production_Notes") || "").trim();

  const platformText = platforms.length ? ` for ${platforms.join(", ")}` : "";
  const base = `Studio production request for "${title}": create a ${contentType}${platformText} using the approved uploaded master media, saved platform output plan, and production directives.`;
  const withNotes = notes ? `${base} Production direction: ${notes}` : base;
  return withNotes.slice(0, 5000);
}

async function ensureProductionRequestIdeaSummary(env, ideaRecord, requestRecord) {
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

function item4BridgePlanKey(platform, outputType) {
  return `${String(platform || "").trim()}::${String(outputType || "").trim()}`;
}

async function item4SourceToProductionBridgePreflight(env, requestRecord, ideaRecord = null) {
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

  addCheck("master_media_ready", masterStatus === "Ready", "Master media must be Ready before source-to-production handoff.");
  addCheck("output_plan_ready", planStatus === "Ready", "Platform output plan must be Ready before source-to-production handoff.");
  addCheck("platform_variants_ready", variantStatus === "Ready", "Platform-ready variants must be Ready before source-to-production handoff.");

  addCheck(
    "master_manifest_present",
    Array.isArray(masterAssets) && masterAssets.length > 0,
    "The authoritative master-media manifest is missing or empty."
  );

  if (Array.isArray(masterAssets) && masterAssets.length) {
    const incompleteMasters = masterAssets.filter(asset =>
      !String(asset?.google_drive_file_id || "").trim() ||
      !/^rec[A-Za-z0-9]+$/.test(String(asset?.media_asset_record_id || "").trim())
    );
    addCheck(
      "master_drive_authority_complete",
      incompleteMasters.length === 0,
      incompleteMasters.length ? `${incompleteMasters.length} master asset(s) are missing Google Drive or Media Asset authority.` : null
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
  const targetCount = Number(variantManifest?.target_count || 0);
  const readyCount = Number(variantManifest?.ready_count || 0);
  const manifestComplete = Boolean(variantManifest?.complete) && targetCount > 0 && readyCount === targetCount;

  addCheck(
    "variant_manifest_complete",
    manifestComplete,
    "The platform-ready variant manifest is not complete."
  );

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

  const notes = [];
  for (const routeRow of routeRows.filter(row => row.ready && row.aspect_ratio)) {
    const unavailable = variantAssets.filter(asset => {
      const variant = asset?.variants?.[routeRow.aspect_ratio];
      return !String(variant?.preview_url || "").trim();
    });
    if (unavailable.length) {
      notes.push("A preview image is still catching up. The platform crops are already saved.");
    }
  }

  const queueRows = await listRecords(env, ITEM4_VARIANT_QUEUE_TABLE, {
    limit: 100,
    filterFormula: `{Production_Request_Record_ID}='${String(requestRecord.id).replace(/'/g, "\\'")}'`,
  });
  const variantQueueRows = queueRows.filter(row =>
    String(f(row, "Asset_Kind") || "").trim() === "Platform Variant" &&
    String(f(row, "Transfer_Status") || "").trim() === "Ready"
  );

  for (const routeRow of routeRows.filter(row => row.ready && row.aspect_ratio)) {
    const expectedId = routeRow.record_id;
    const matching = variantQueueRows.filter(row => String(f(row, "Aspect_Ratio") || "").trim() === routeRow.aspect_ratio);
    const missingLinks = matching.filter(row => !arrayOrEmpty(f(row, "Target_Production_Request_Outputs")).includes(expectedId));
    if (!matching.length || missingLinks.length) {
      issues.push(`${routeRow.platform} / ${routeRow.output_type} is not fully linked from the ${routeRow.aspect_ratio} source variants to its Production Request Output.`);
    }
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
    notes.push("Instagram and Facebook Stories will be a 15-second clip from the first vertical photo, with a slight zoom and your music.");
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

async function productionRequestBridgePreflightRoute(request, env, url, authorization) {
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

function productionRequestPromotionRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/production-requests\/(rec[A-Za-z0-9]+)\/promote$/);
  if (!match) throw new HttpError(400, "Invalid Production Request promotion route");
  return match[1];
}

function linkedContentItemRecordId(ideaRecord) {
  const links = Array.isArray(f(ideaRecord, "Content Items")) ? f(ideaRecord, "Content Items") : [];
  const promotedId = String(f(ideaRecord, "Promoted_Content_Record_ID") || "").trim();
  const candidate = links.find((id) => /^rec[A-Za-z0-9]+$/.test(String(id || ""))) ||
    (/^rec[A-Za-z0-9]+$/.test(promotedId) ? promotedId : null);
  return candidate || null;
}

function studioOutputSupportsStudioAudio(platform, outputType) {
  const spec = STUDIO_OUTPUT_ROUTE_SPECS[`${String(platform || "").trim()}::${String(outputType || "").trim()}`];
  const family = String(spec?.pipeline_family || "").trim();
  return family === "Video" || family === "Slideshow Video" || family === "Story";
}

function productionRequestWantsStudioAudio(record) {
  const musicMode = String(f(record, "Background_Music_Mode") || "").trim();
  const voiceMode = String(f(record, "Voiceover_Mode") || "").trim();
  const musicLinks = Array.isArray(f(record, "Selected_Music_Asset")) ? f(record, "Selected_Music_Asset") : [];
  return musicMode === "Yes" || voiceMode === "Yes" || musicLinks.length > 0;
}

function productionRequestAudioPlatformWarnings(record, routeRows = []) {
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

function productionRequestCompatibilityIssues(record) {
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
      if (!Number.isInteger(exact) || exact < 1 || exact > 15) {
        issues.push("Enter an exact video clip count from 1 through 15.");
      }
    }

    if (mode === "Target range") {
      if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min < 1 ||
        max > 15 ||
        min > max
      ) {
        issues.push("Enter a valid video clip-count range from 1 through 15 with minimum less than or equal to maximum.");
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
      if (!Number.isInteger(exact) || exact < 1 || exact > 20) {
        issues.push("Enter an exact carousel slide count from 1 through 20.");
      }
    }

    if (mode === "Target range") {
      if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min < 1 ||
        max > 20 ||
        min > max
      ) {
        issues.push("Enter a valid carousel slide-count range from 1 through 20 with minimum less than or equal to maximum.");
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
  if (notes.length > 3000) {
    issues.push("Production notes must be 3000 characters or fewer.");
  }

  return issues;
}

function promotionInputFromProductionRequest(record) {
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
    include_thumbnail: String(f(record, "Thumbnail_Mode") || "Use Profile Default"),
    video_duration: f(record, "Video_Duration_Seconds") ?? 30,
    video_clip_count: videoMode === "Exact" ? f(record, "Video_Clip_Count_Exact") : "Auto",
    voiceover_tail_seconds: f(record, "Voiceover_Tail_Seconds") ?? 2,
    carousel_slide_count: carouselMode === "Exact" ? f(record, "Carousel_Slide_Count_Exact") : 5,
    carousel_image_mode: String(f(record, "Carousel_Image_Mode") || "Make AI Generated"),
    production_notes: String(f(record, "Production_Notes") || "").trim(),
  });
}

async function updateProductionRequestPromotionState(env, recordId, fields) {
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


function productionRequestSyncRecordIdFromPath(url) {
  const match = url.pathname.match(/\/api\/production-requests\/(rec[A-Za-z0-9]+)\/sync-directives$/);
  if (!match) throw new HttpError(400, "Invalid Production Request directive-sync route");
  return match[1];
}

async function productionRequestPreferredMusic(env, requestRecord) {
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

function productionRequestDirectiveSnapshot(requestRecord, music) {
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

async function syncProductionRequestDirectivesToContentItem(env, requestRecord, contentItemId) {
  if (!/^rec[A-Za-z0-9]+$/.test(String(contentItemId || ""))) {
    throw new HttpError(409, "A promoted Content Item is required before advanced directives can be applied");
  }

  const music = await productionRequestPreferredMusic(env, requestRecord);
  const appliedAt = new Date().toISOString();
  const snapshot = productionRequestDirectiveSnapshot(requestRecord, music);

  const fields = {
    Production_Request: [requestRecord.id],
    Test_Run_ID: String(f(requestRecord, "Test_Run_ID") || "").trim() || null,
    Requested_Title_Mode: String(f(requestRecord, "Title_Mode") || "AI decides"),
    Requested_Title: String(f(requestRecord, "Requested_Title") || "").trim() || null,
    Requested_Caption_Mode: String(f(requestRecord, "Caption_Mode") || "AI decides"),
    Requested_Caption: String(f(requestRecord, "Requested_Caption") || "").trim() || null,
    Requested_Script_Mode: String(f(requestRecord, "Script_Mode") || "AI decides"),
    Requested_Script: String(f(requestRecord, "Requested_Script") || "").trim() || null,
    Production_Request_Notes: String(f(requestRecord, "Production_Notes") || "").trim() || null,
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

  const requestedVoice = requestedVoiceFromProductionRequest(requestRecord);
  if (requestedVoice.voice_id) {
    fields.Voice_ID = requestedVoice.voice_id;
    fields.Voice_Name = requestedVoice.voice_name;
    if (requestedVoice.voice_choice) fields.Voice = requestedVoice.voice_choice;
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

async function syncProductionRequestDirectivesRoute(request, env, url, authorization) {
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

function studioOutputRouteSpec(row) {
  return STUDIO_OUTPUT_ROUTE_SPECS[
    `${String(f(row, "Platform") || "").trim()}::${String(f(row, "Output_Type") || "").trim()}`
  ] || null;
}

function stringOrNull(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function resolvedOutputTriState(outputRow, overrideField, requestRecord, requestField, profileDefault) {
  const override = String(f(outputRow, overrideField) || "Inherit").trim() || "Inherit";

  if (override === "Yes" || override === "No") return override;
  if (override === "Use Profile Default") return profileDefault ? "Yes" : "No";

  const master = String(f(requestRecord, requestField) || "Use Profile Default").trim() || "Use Profile Default";
  if (master === "Yes" || master === "No") return master;
  return profileDefault ? "Yes" : "No";
}

async function productionProfileDefaultsForParentContentItem(env, parentContentItem) {
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

function emptyStudioMusic() {
  return {
    record_id: null,
    url: null,
    google_drive_file_id: null,
    name: null,
  };
}

function studioMusicFromMediaRecord(record) {
  if (!record?.id) return emptyStudioMusic();
  const fileId = googleDriveFileId(record);
  return {
    record_id: record.id,
    url: stringOrNull(f(record, "Google Drive URL")) || (fileId ? googleDriveDownloadUrl(fileId) : null),
    google_drive_file_id: fileId,
    name: stringOrNull(f(record, "Asset Name")),
  };
}

async function preferredMusicForProductionRequestOutput(env, outputRow, requestRecord) {
  const overrideLinks = arrayOrEmpty(f(outputRow, "Selected_Music_Asset_Override"));
  const masterLinks = arrayOrEmpty(f(requestRecord, "Selected_Music_Asset"));
  const recordId = overrideLinks[0] || masterLinks[0] || null;

  if (!recordId) return emptyStudioMusic();

  const media = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  return studioMusicFromMediaRecord(media);
}

async function catalogFallbackMusic(env) {
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
    limit: 50,
    filterFormula: "AND({Asset_Role}='Music',NOT({Do_Not_Use}))",
  });
  const usable = records.filter((record) => Boolean(studioMusicFromMediaRecord(record).url));
  if (!usable.length) return emptyStudioMusic();

  const score = (record) => {
    const name = String(f(record, "Asset Name") || "").toLowerCase();
    let value = 0;
    if (name.includes("cinematic")) value += 80;
    if (name.includes("drone")) value += 40;
    if (name.includes("epic")) value += 30;
    if (name.includes("night") || name.includes("city")) value += 20;
    if (name.includes("yoga") || name.includes("meditat") || name.includes("harp")) value -= 40;
    return value;
  };

  return studioMusicFromMediaRecord(usable.sort((a, b) => score(b) - score(a))[0]);
}

async function resolveStudioRenderMusic(env, outputRow, requestRecord, effective) {
  const preferred = await preferredMusicForProductionRequestOutput(env, outputRow, requestRecord);
  if (preferred.url) return preferred;
  const mode = String(effective?.background_music_mode || "").trim().toLowerCase();
  if (mode !== "yes") return preferred;
  return catalogFallbackMusic(env);
}

function outputEffectiveChoice(outputRow, overrideField, requestRecord, requestField, fallback) {
  const override = String(f(outputRow, overrideField) || "Inherit").trim() || "Inherit";
  if (override !== "Inherit") return override;
  return String(f(requestRecord, requestField) || fallback).trim() || fallback;
}

function outputEffectiveNumber(outputRow, overrideField, requestRecord, requestField, fallback) {
  const override = f(outputRow, overrideField);
  if (override !== null && override !== undefined && override !== "") return Number(override);
  const master = f(requestRecord, requestField);
  if (master !== null && master !== undefined && master !== "") return Number(master);
  return fallback;
}

function outputEffectiveText(outputRow, overrideField, requestRecord, requestField) {
  const override = String(f(outputRow, overrideField) || "").trim();
  if (override) return override;
  return String(f(requestRecord, requestField) || "").trim();
}

function outputWorkItemIssues(outputRow, route, effective) {
  const issues = [];

  if (!route) {
    issues.push("This platform/output pair does not yet have a proven production mapping.");
    return issues;
  }

  if (effective.video_clip_count_mode === "Exact" &&
      (!Number.isInteger(effective.video_clip_count_exact) ||
       effective.video_clip_count_exact < 1 ||
       effective.video_clip_count_exact > 15)) {
    issues.push("Exact video clip count is invalid.");
  }

  if (effective.video_clip_count_mode === "Target range" &&
      (!Number.isInteger(effective.video_clip_count_min) ||
       !Number.isInteger(effective.video_clip_count_max) ||
       effective.video_clip_count_min < 1 ||
       effective.video_clip_count_max > 15 ||
       effective.video_clip_count_min > effective.video_clip_count_max)) {
    issues.push("Video clip-count range is invalid.");
  }

  if (effective.carousel_slide_count_mode === "Exact" &&
      (!Number.isInteger(effective.carousel_slide_count_exact) ||
       effective.carousel_slide_count_exact < 1 ||
       effective.carousel_slide_count_exact > 20)) {
    issues.push("Exact carousel slide count is invalid.");
  }

  if (effective.carousel_slide_count_mode === "Target range" &&
      (!Number.isInteger(effective.carousel_slide_count_min) ||
       !Number.isInteger(effective.carousel_slide_count_max) ||
       effective.carousel_slide_count_min < 1 ||
       effective.carousel_slide_count_max > 20 ||
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

async function buildOutputWorkItemEffective(env, outputRow, requestRecord, parentContentItem, profileDefaults) {
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
    thumbnail_mode: resolvedOutputTriState(
      outputRow,
      "Thumbnail_Mode_Override",
      requestRecord,
      "Thumbnail_Mode",
      profileDefaults.include_thumbnail
    ),


    video_duration_seconds: outputEffectiveNumber(
      outputRow,
      "Video_Duration_Seconds_Override",
      requestRecord,
      "Video_Duration_Seconds",
      profileDefaults.default_duration
    ),
    voiceover_tail_seconds: outputEffectiveNumber(
      outputRow,
      "Voiceover_Tail_Seconds_Override",
      requestRecord,
      "Voiceover_Tail_Seconds",
      Number(f(parentContentItem, "Voiceover_Tail_Seconds") || 2)
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
  effective.issues = outputWorkItemIssues(outputRow, route, effective);
  return effective;
}

function copyWritableParentFields(parentContentItem) {
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

function item4StudioSourcePackageForOutput(requestRecord, outputRow, effective, parentContentItem = null) {
  if (String(f(requestRecord, "Studio_Variant_Status") || "").trim() !== "Ready") return null;
  const plan = item4ParseJson(f(requestRecord, "Studio_Output_Plan_JSON"), null);
  const manifest = item4VariantManifest(requestRecord);
  const platform = String(f(outputRow, "Platform") || effective?.platform || "").trim();
  const outputType = String(f(outputRow, "Output_Type") || effective?.output_type || "").trim();
  const planItem = (Array.isArray(plan?.items) ? plan.items : []).find(item =>
    item4BridgePlanKey(item?.platform, item?.output_type) === item4BridgePlanKey(platform, outputType)
  );
  const ratio = String(planItem?.aspect_ratio || "").trim();
  if (!ratio || !manifest?.complete) return null;

  const sourceRowsAll = (Array.isArray(manifest?.assets) ? manifest.assets : [])
    .slice()
    .sort((a,b) => Number(a?.order || 0) - Number(b?.order || 0));
  const storyTeaser = String(outputType || "").trim() === "Story";
  const sourceRows = storyTeaser ? sourceRowsAll.slice(0, 1) : sourceRowsAll;
  const durationSeconds = storyTeaser
    ? ITEM4_STORY_TEASER_SECONDS
    : Math.max(1, Number(effective?.video_duration_seconds || f(requestRecord, "Video_Duration_Seconds") || 30));
  const fps = 30;
  const totalFrames = Math.max(sourceRows.length, Math.round(durationSeconds * fps));
  const baseFrames = sourceRows.length ? Math.floor(totalFrames / sourceRows.length) : 0;
  let remainder = sourceRows.length ? totalFrames - (baseFrames * sourceRows.length) : 0;
  let startFrame = 0;
  const clips = [];

  for (const source of sourceRows) {
    const variant = source?.variants?.[ratio];
    const url = String(variant?.preview_url || "").trim();
    const mediaAssetId = String(variant?.media_asset_record_id || "").trim();
    if (!url || !/^rec[A-Za-z0-9]+$/.test(mediaAssetId)) return null;
    const frames = baseFrames + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    clips.push({
      id: `studio-source-${clips.length + 1}`,
      order: Number(source?.order || clips.length + 1),
      media_asset_record_id: mediaAssetId,
      asset_name: String(variant?.file_name || source?.name || `photo-${clips.length + 1}.jpg`),
      google_drive_url: String(variant?.google_drive_url || "").trim() || null,
      url,
      src: url,
      startFrame,
      durationFrames: frames,
      motionStyle: storyTeaser ? "slowZoom" : "stillPhoto",
      source: "studio_platform_variant",
      aspect_ratio: ratio,
      google_drive_file_id: String(variant?.google_drive_file_id || "").trim() || null,
    });
    startFrame += frames;
  }
  if (!clips.length) return null;

  const nativePhotoRoute = studioOutputIsNativePhotoRoute(platform, outputType, null);
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
    durationFrames:c.durationFrames, motionStyle:c.motionStyle
  }));
  const renderPrep = {
    render_status: nativePhotoRoute ? "Native Photo Route" : "Ready for Render",
    output_status: "In Production",
    composition_id: compositionId,
    output_filename: outputFilename,
    title_text: titleText,
    brand_text: brandText,
    music_url: String(effective?.music?.url || "").trim(),
    music_volume: String(effective?.music?.url || "").trim() ? 0.24 : 0,
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
    missing_asset_notes: "",
    confidence_score: 1,
  };
  return {
    status: "Ready",
    ratio,
    clips,
    clip_count: clips.length,
    total_frames: totalFrames,
    composition_id: compositionId,
    output_filename: compositionId ? outputFilename : null,
    selected_assets_json: JSON.stringify(selected),
    render_clip_list_json: renderPrep.render_clip_list_json,
  };
}

function outputWorkItemFields(parentContentItem, requestRecord, outputRow, effective, sourcePackage = null) {
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


const STUDIO_PLATFORM_OUTPUT_TABLE = "tblrlPeboBthkplH0";

function item4PlanItemForOutput(requestRecord, outputRow) {
  const plan = item4ParseJson(f(requestRecord, "Studio_Output_Plan_JSON"), null);
  const platform = String(f(outputRow, "Platform") || "").trim();
  const outputType = String(f(outputRow, "Output_Type") || "").trim();
  return (Array.isArray(plan?.items) ? plan.items : []).find(item =>
    item4BridgePlanKey(item?.platform, item?.output_type) === item4BridgePlanKey(platform, outputType)
  ) || null;
}

function platformOutputSeedFields(parentContentItem, requestRecord, outputRow, effective, sourcePackage) {
  const planItem = item4PlanItemForOutput(requestRecord, outputRow) || {};
  const route = effective.route || {};
  const clips = sourcePackage?.clips || [];
  const perClipFrames = sourcePackage?.clip_count ? Math.round(sourcePackage.total_frames / sourcePackage.clip_count) : 0;
  const nativePhoto = studioOutputIsNativePhotoRoute(
    effective.platform,
    effective.output_type,
    planItem.mapping_type || route.proven_mapping
  );
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
    voiceover_tail_seconds: effective.voiceover_tail_seconds,
    applied_at: new Date().toISOString(),
  };
  return {
    Test_Run_ID: String(f(requestRecord, "Test_Run_ID") || "").trim() || null,
    Content_Item: [parentContentItem.id],
    Platform: effective.platform,
    Format: String(planItem.format || route.content_type || "").trim(),
    Platform_Output_Type: String(planItem.mapping_type || route.proven_mapping || effective.output_type || "").trim(),
    Aspect_Ratio: String(planItem.aspect_ratio || sourcePackage?.ratio || "").trim(),
    Output_Status: nativePhoto ? "Ready for Review" : "Planned",
    Render_Status: nativePhoto ? "Native Photo Route" : null,
    Studio_Preview_URL: nativePhoto ? (String(clips[0]?.url || "").trim() || null) : null,
    Thumbnail_URL: (nativePhoto || effective.thumbnail_mode === "Yes")
      ? (item4CoverStillUrl(requestRecord, outputRow) || (nativePhoto ? (studioClipPublicCdnUrl(clips[0]) || String(clips[0]?.url || "").trim() || null) : null))
      : null,
    Asset_Selection_Status: remotionReady ? "Selected" : null,
    Output_Title: String(f(parentContentItem,"Content_Title") || "").trim(),
    Output_Caption: effective.requested_caption || null,
    Output_Hashtags: String(f(parentContentItem,"Hashtags") || "").trim() || null,
    Output_Notes: [
      `Studio single-parent output seed. Production Request Output ${String(f(outputRow,"Production_Request_Output_ID")||outputRow.id)} is the per-platform execution authority.`,
      effective.output_type === "Story"
        ? `Companion 15-second Story teaser from the first photo, slight zoom, music, no voiceover. After the matching ${effective.platform} main post is live, attach that post URL as the Story link.`
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
    Asset_Selection_Notes: sourcePackage?.status === "Ready" ? "Studio exact source authority locked before R2; visuals may not be replaced or reordered." : null,
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
    Preferred_Music_URL: effective.music?.url || null,
    Music_URL: effective.music?.url || null,
    Selected_Music_URL: effective.music?.url || null,
    Selected_Music_Media_Asset_ID: effective.music?.record_id || null,
    Music_Volume: effective.music?.url ? 0.24 : 0,
  };
}

async function restoreParentContentItemFromStudioUmbrella(env, parentContentItem) {
  const cleaned = String(f(parentContentItem,"Internal_Notes")||"")
    .split("\n").filter(line => !line.includes("Studio master/umbrella Content Item.")).join("\n").trim();
  return airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, parentContentItem.id, {
    method:"PATCH", body:JSON.stringify({fields:{Do_Not_Produce:false,Internal_Notes:cleaned||null},typecast:false})
  });
}

async function markParentContentItemAsStudioUmbrella(env, parentContentItem, outputCount) {
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

async function fanoutProductionRequestOutputsToContentItems(env, requestRecord, parentContentItemId) {
  const outputRows=(await outputRowsForProductionRequest(env,requestRecord.id)).filter(row=>Boolean(f(row,"Enabled")));
  if(!outputRows.length) return {enabled_output_count:0,routed_count:0,blocked_count:0,work_items:[],single_parent_mode:true};
  let parent=await airtableFetch(env,env.AIRTABLE_CONTENT_TABLE_ID,parentContentItemId);
  parent=await restoreParentContentItemFromStudioUmbrella(env,parent);
  const profileDefaults=await productionProfileDefaultsForParentContentItem(env,parent);
  const workItems=[]; let routed=0,blocked=0;
  for(const outputRow of outputRows){
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
    if(!poId){
      const proId=String(f(outputRow,"Production_Request_Output_ID")||"").replace(/'/g,"\\'");
      if(proId){
        const found=await listRecords(env,STUDIO_PLATFORM_OUTPUT_TABLE,{limit:1,filterFormula:`FIND(',${proId},', ',' & ARRAYJOIN({Production_Request_Output}) & ',') > 0`});
        poId=found?.[0]?.id||null;
      }
    }
    let po;
    if(poId) po=await airtableFetch(env,STUDIO_PLATFORM_OUTPUT_TABLE,poId,{method:"PATCH",body:JSON.stringify({fields:seed,typecast:true})});
    else po=await airtableFetch(env,STUDIO_PLATFORM_OUTPUT_TABLE,"",{method:"POST",body:JSON.stringify({fields:seed,typecast:true})});
    const now=new Date().toISOString();
    await airtableFetch(env,PRODUCTION_REQUEST_OUTPUT_TABLE,outputRow.id,{method:"PATCH",body:JSON.stringify({fields:{Content_Item:[parent.id],Platform_Output:[po.id],Pipeline_Family:route.pipeline_family,Pipeline_Route_Status:"Routed",Pipeline_Route_Notes:`Single-parent route: ${route.pipeline_family}; Platform Output ${po.id}; Content Item ${parent.id}.`,Routed_At:now,Updated_At:now},typecast:false})});
    routed++;
    workItems.push({production_request_output_record_id:outputRow.id,platform:effective.platform,output_type:effective.output_type,content_item_record_id:parent.id,platform_output_record_id:po.id,routed:true});
  }
  return {enabled_output_count:outputRows.length,routed_count:routed,blocked_count:blocked,work_items:workItems,single_parent_mode:true};
}

async function finalizeProductionRequestPromotion(env, requestRecordId, ideaRecord) {
  const contentItemId = linkedContentItemRecordId(ideaRecord);
  const fields = {
    Request_Status: "Promoted",
    Active: true,
  };
  if (contentItemId) fields.Promoted_Content_Item = [contentItemId];

  const requestRecord = await updateProductionRequestPromotionState(env, requestRecordId, fields);

  let directiveBridge = null;
  let outputFanout = null;

  if (contentItemId) {
    directiveBridge = await syncProductionRequestDirectivesToContentItem(
      env,
      requestRecord,
      contentItemId
    );

    outputFanout = await fanoutProductionRequestOutputsToContentItems(
      env,
      requestRecord,
      contentItemId
    );

    try {
      await armStudioParentForP3Handoff(env, contentItemId, requestRecord);
    } catch (error) {
      console.warn("P3 parent arm failed", error);
    }
    try {
      await pulseStudioP3Handoff(env, contentItemId, requestRecord);
    } catch (error) {
      console.warn("P3 promote pulse failed", error);
    }
  }

  return { requestRecord, contentItemId, directiveBridge, outputFanout };
}

async function armStudioParentForP3Handoff(env, contentItemId, requestRecord) {
  const parent = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId);
  const requestedCaption = String(f(requestRecord, "Requested_Caption") || "").trim();
  const caption = requestedCaption
    || String(f(parent, "Caption") || "").trim()
    || String(f(parent, "Hook") || "").trim()
    || String(f(parent, "Content_Title") || "").trim();
  const voiceoverMode = String(f(requestRecord, "Voiceover_Mode") || f(parent, "Include_Voiceover") || "No").trim();
  const thumbnailMode = String(f(requestRecord, "Thumbnail_Mode") || f(parent, "Include_Thumbnail") || "Yes").trim();
  const voiceoverUrl = String(f(parent, "Voiceover_URL") || "").trim();
  const coverUrl = String(f(parent, "Thumbnail_URL") || "").trim() || item4CoverStillUrl(requestRecord);
  const wantThumb = thumbnailMode !== "No";
  return airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        Caption: caption || null,
        Include_Voiceover: voiceoverMode === "Yes" && voiceoverUrl ? "Yes" : "No",
        Include_Thumbnail: wantThumb ? "Yes" : "No",
        Thumbnail_URL: wantThumb ? (coverUrl || null) : null,
        Thumbnail_Status: wantThumb ? (coverUrl ? "Generated" : "Not Started") : "Not Needed",
        Content_Status: "Thumbnail Ready",
      },
      typecast: true,
    }),
  });
}

async function pulseStudioP3Handoff(env, contentItemId, requestRecord) {
  const testRunId = String(f(requestRecord, "Test_Run_ID") || "").trim();
  const response = await fetch(ITEM4_P3_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/plain, application/json" },
    body: JSON.stringify({
      source: "studio-promote",
      target: "P3",
      content_record_id: contentItemId,
      test_run_id: testRunId,
      requested_at: new Date().toISOString(),
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    console.warn("P3 studio promote pulse failed", response.status, String(body || "").slice(0, 300));
    return { ok: false, status: response.status };
  }
  return { ok: true, status: response.status };
}

async function promoteProductionRequestViaI3I4(request, env, url, authorization) {
  // Keep the write contract consistent even though the saved request itself is
  // the authoritative payload.
  try { await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }

  const requestRecordId = productionRequestPromotionRecordIdFromPath(url);
  let requestRecord = await loadAuthorizedProductionRequest(env, requestRecordId, authorization);
  const requestStatus = String(f(requestRecord, "Request_Status") || "").trim();

  const ideaLinks = Array.isArray(f(requestRecord, "Idea_Candidate")) ? f(requestRecord, "Idea_Candidate") : [];
  if (ideaLinks.length !== 1) {
    throw new HttpError(409, "Production Request must be linked to exactly one Idea Candidate before promotion");
  }

  const ideaRecordId = ideaLinks[0];
  let ideaRecord = await loadAuthorizedIdea(env, ideaRecordId, authorization);

  const hasItem4Source = Array.isArray(item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), [])) &&
    item4ParseJson(f(requestRecord, "Studio_Master_Assets_JSON"), []).length > 0;

  if (hasItem4Source) {
    requestRecord = await item4ReconcileEnabledPlanOutputs(env, requestRecord);
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
    const finalized = await finalizeProductionRequestPromotion(env, requestRecordId, ideaRecord);
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
    // Do not resend I3 automatically. This avoids duplicate workflow triggers.
    ideaRecord = await waitForPromotionResult(env, ideaRecordId, 4, 750);
    if (promotionCompleted(ideaRecord)) {
      const finalized = await finalizeProductionRequestPromotion(env, requestRecordId, ideaRecord);
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

  ideaRecord = await waitForPromotionResult(env, ideaRecordId);
  if (promotionCompleted(ideaRecord)) {
    const finalized = await finalizeProductionRequestPromotion(env, requestRecordId, ideaRecord);
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

function cleanPromotionPayload(payload) {
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
  if (productionNotes.length > 3000) throw new HttpError(400, "Production notes must be 3000 characters or fewer");

  let videoDuration = Number(payload?.video_duration ?? 30);
  if (!Number.isFinite(videoDuration)) videoDuration = 30;
  videoDuration = Math.trunc(videoDuration);
  if (videoDuration < 5 || videoDuration > 600) throw new HttpError(400, "Video duration must be between 5 and 600 seconds");

  const clipRaw = payload?.video_clip_count;
  let videoClipCount = null;
  if (clipRaw !== null && clipRaw !== undefined && String(clipRaw).trim() !== "" && String(clipRaw).trim().toLowerCase() !== "auto") {
    const clipNumber = Number(clipRaw);
    if (!Number.isFinite(clipNumber) || clipNumber < 1 || clipNumber > 30) {
      throw new HttpError(400, "Video clip count must be Auto or between 1 and 30");
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
  if (carouselSlideCount < 1 || carouselSlideCount > 20) {
    throw new HttpError(400, "Carousel slide count must be between 1 and 20");
  }

  const carouselImageMode = String(payload?.carousel_image_mode || "Make AI Generated").trim();
  if (!["Make AI Generated", "Manual Upload"].includes(carouselImageMode)) {
    throw new HttpError(400, "Carousel image mode must be Make AI Generated or Manual Upload");
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
    carousel_image_mode: carouselImageMode,
    production_notes: productionNotes,
  };
}

function promotionWebhookUrl(env, recordId, input) {
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
  if (input.production_notes) webhook.searchParams.set("production_config_notes", input.production_notes);

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

async function fetchPromotionHandoff(env, webhook) {
  let response;
  try {
    response = await fetch(webhook.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "ChicagoShining-Studio/Phase2A" },
    });
  } catch {
    throw new HttpError(502, "The existing I3 approval workflow could not be reached");
  }

  // Consume the response so the Make request completes cleanly, but never
  // expose webhook URLs or Make response HTML to the browser.
  try { await response.text(); } catch {}
  if (!response.ok) {
    throw new HttpError(502, `The existing I3 approval workflow returned HTTP ${response.status}`);
  }
}

function promotionCompleted(record) {
  const links = Array.isArray(f(record, "Content Items")) ? f(record, "Content Items") : [];
  const promotedId = String(f(record, "Promoted_Content_Record_ID") || "").trim();
  return Boolean(promotedId || links.length);
}

async function waitForPromotionResult(env, recordId, attempts = 8, delayMs = 750) {
  let record = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId);
  if (promotionCompleted(record)) return record;

  for (let attempt = 1; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    record = await airtableFetch(env, env.AIRTABLE_IDEA_TABLE_ID, recordId);
    if (promotionCompleted(record)) return record;
  }
  return record;
}

async function promoteIdeaViaI3I4(request, env, url, authorization) {
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
  if (!summary) throw new HttpError(409, "Idea summary is required by the existing I4 promotion gate; add a summary before promoting");

  const input = cleanPromotionPayload(payload);
  const webhook = promotionWebhookUrl(env, recordId, input);
  await fetchPromotionHandoff(env, webhook);

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

async function getAuthorizedIdeaRoute(request, env, url, authorization) {
  const recordId = ideaRecordIdFromPath(url);
  const record = await loadAuthorizedIdea(env, recordId, authorization);
  return respond(request, env, { ok: true, record: mapIdea(record) });
}


async function listContent(request, env, url) {
  const records = await listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, { limit: clampLimit(url), sortField: "Created_At" });
  return respond(request, env, { ok: true, records: records.map(mapContent) });
}

async function listOutputs(request, env, url) {
  const records = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit: clampLimit(url, 100, 100) });
  return respond(request, env, { ok: true, records: records.map(mapOutput) });
}

async function listMusic(request, env, url) {
  const records = await listRecords(env, env.AIRTABLE_MEDIA_TABLE_ID, {
    limit: clampLimit(url, 100, 100),
    view: env.AIRTABLE_MUSIC_VIEW_ID || null,
  });

  return respond(request, env, { ok: true, records: records.map(mapMusic) });
}

async function fetchGoogleDriveAudio(record, request) {
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

function copyDriveAudioHeaders(upstream, mapped) {
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

async function musicPreview(request, env, url) {
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



const ITEM4_PREVIEW_SMV1_NAME =
  "SMV1 - Studio Media Authority + Platform Variant Worker v0.6.3 - Media Link Isolation";

function item4PreviewSettingValueExpr(settingName) {
  return `{{get(map(61.array; "setting_value"; "setting_name"; "${settingName}"); 1)}}`;
}

function item4PreviewR2KeyExpr(suffix) {
  return `${item4PreviewSettingValueExpr("STUDIO_PREVIEW_R2_PREFIX")}/item4/{{1.Production_Request_Record_ID}}/{{1.Transfer_ID}}${suffix}`;
}

function item4PreviewR2UrlExpr(suffix) {
  return `https://media.chicagoshining.com/${item4PreviewR2KeyExpr(suffix)}`;
}

function item4PreviewR2UploadModule(id, x, y, name, dataExpr, contentTypeExpr, suffix, moduleFilter = null) {
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

function item4PreviewQueueReadyModule(id, x, y, name, uploadModuleId, suffix) {
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

function item4PreviewRouteBlueprint() {
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


function item4ValidateGeneratedMakeBlueprint(flow, path = "flow") {
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

function item4AssertPreviewBranchFilters(blueprint) {
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

function item4SourceAuthorityInterfaceRows() {
  return [
    {name:"Studio_Source_Authority_Status",type:"text",label:"Studio_Source_Authority_Status"},
    {name:"Studio_Source_Selected_Assets_JSON",type:"text",label:"Studio_Source_Selected_Assets_JSON",multiline:true},
    {name:"Studio_Source_Selected_Clip_Count",type:"number",label:"Studio_Source_Selected_Clip_Count"},
    {name:"Studio_Source_Composition_ID",type:"text",label:"Studio_Source_Composition_ID"},
  ];
}

function item4CollectStringSlots(value, path = [], rows = []) {
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

function item4SetPath(root, path, value) {
  let cursor = root;
  for (let i=0;i<path.length-1;i++) cursor = cursor[path[i]];
  cursor[path[path.length-1]] = value;
}

function item4R2PromptSlot(module12) {
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

function item4FlattenMakeModules(flow, rows = []) {
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

function item4FindR2ContextModule(blueprint) {
  const exact = phase6FindModule(blueprint?.flow,3);
  if (exact?.module === "airtable:ActionGetRecord") return exact;
  const modules=item4FlattenMakeModules(blueprint?.flow);
  return modules.find(m => m?.module === "airtable:ActionGetRecord" && JSON.stringify(m).includes("Platform Outputs"))
      || modules.find(m => m?.module === "airtable:ActionGetRecord")
      || null;
}

function item4FindR2AiModule(blueprint) {
  const exact = phase6FindModule(blueprint?.flow,12);
  if (exact && String(exact.module||"").toLowerCase().includes("openai")) return exact;
  const modules=item4FlattenMakeModules(blueprint?.flow);
  return modules.find(m => String(m?.module||"").toLowerCase().includes("openai") && item4R2PromptSlot(m)) || null;
}

function item4FindR2FailfastModule(blueprint) {
  const exact = phase6FindModule(blueprint?.flow,14);
  if (exact?.filter?.conditions) return exact;
  const modules=item4FlattenMakeModules(blueprint?.flow);
  return modules.find(m => {
    const text=JSON.stringify({filter:m?.filter||{},metadata:m?.metadata||{},mapper:m?.mapper||{}}).toLowerCase();
    return m?.filter?.conditions && (text.includes("zero candidate") || text.includes("fail-fast") || text.includes("fail fast") || text.includes("no candidate"));
  }) || null;
}


let item4MakeHardeningOpenCache = { at: 0, promise: null, result: null };

async function item4RecoverStaleR2BaselineReads(env, staleMs = 180000) {
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

async function item4EnsureR2StudioExactSourceGuard(env) {
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

function item4P3SourceFieldInterfaceRows() {
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

async function item4EnsureP3StudioSourceAuthority(env) {
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



const STUDIO_P3_REMOTION_HANDOFF_MARKER = "STUDIO_P3_REMOTION_HANDOFF_V4";
// Make IML has no or() function. Use | inside if(), matching Make's own repair hint.
const STUDIO_P3_NATIVE_PHOTO_STATUS_IF =
  '{{if(102.Studio_Output_Type = "Multi-Photo" | 102.Studio_Output_Type = "Carousel" | 102.Studio_Output_Type = "Multi-Image Post"; "Ready for Review"; "In Production")}}';
const STUDIO_P3_NATIVE_PHOTO_SELECTION_IF =
  '{{if(102.Studio_Output_Type = "Multi-Photo" | 102.Studio_Output_Type = "Carousel" | 102.Studio_Output_Type = "Multi-Image Post"; ""; "Selected")}}';

function item4P3SingleParentEnrichmentRecord() {
  return {
    Output_Title:'{{if(length(102.Studio_Effective_Requested_Title)>0;102.Studio_Effective_Requested_Title;101.Content_Title)}}',
    Output_Caption:'{{if(length(102.Studio_Effective_Requested_Caption)>0;102.Studio_Effective_Requested_Caption;101.Caption)}}',
    Output_Hashtags:"{{101.Hashtags}}",
    Thumbnail_URL:'{{if(ifempty(102.Studio_Effective_Thumbnail_Mode; "Yes") = "No"; ""; 101.Thumbnail_URL)}}',
    Voiceover_URL:'{{if(ifempty(102.Studio_Effective_Voiceover_Mode; "Yes") = "No"; ""; 101.Voiceover_URL)}}',
    Output_Status: STUDIO_P3_NATIVE_PHOTO_STATUS_IF,
    Asset_Selection_Status: STUDIO_P3_NATIVE_PHOTO_SELECTION_IF,
    Output_Notes:`{{102.Output_Notes}}\nP3 v4.8 ${STUDIO_P3_REMOTION_HANDOFF_MARKER}: Multi-Photo / Instagram Carousel / Facebook Multi-Image Post stay Ready for Review; Instagram and Facebook Story plus other Remotion Studio outputs stay In Production with assets Selected so R3/R4 can render the 15-second Story teaser. Enrichment from Content Item {{101.Content_ID}}.`
  };
}

function item4P3Module103HasRemotionHandoff(mod) {
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

function item4ApplyP3RemotionHandoff(mod) {
  if (!mod?.mapper) throw new HttpError(409, "P3 module 103 is missing");
  mod.mapper.record = Object.assign({}, mod.mapper.record || {}, item4P3SingleParentEnrichmentRecord());
}

function item4PatchP3SingleParentBlueprint(blueprint) {
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

async function item4QueueP3SingleParentViaAdminBridge(env, sourceBlueprint, reason="direct-make-unavailable") {
  const built=item4PatchP3SingleParentBlueprint(sourceBlueprint);
  if(built.already_ready) return {ok:true,already_ready:true,via:"admin-queue",live_name:sourceBlueprint?.name||null};
  const patched=built.patched;
  const existingFormula=`AND({Scenario_ID}=${ITEM4_P3_SCENARIO_ID},{Action}="UPDATE_BLUEPRINT",{Correlation_ID}="ITEM4-SINGLE-PARENT-P3",OR({Status}="Pending",{Status}="Queued",{Status}="Processing"))`;
  try {
    const existing=await airtableFetch(env,"Make Admin Queue",`?maxRecords=1&filterByFormula=${encodeURIComponent(existingFormula)}`);
    if(Array.isArray(existing?.records)&&existing.records.length){return {ok:true,already_ready:false,queued:true,via:"admin-queue",queue_record_id:existing.records[0].id,reason:"existing-command"};}
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
  return {ok:true,already_ready:false,queued:true,via:"admin-queue",queue_record_id:created?.records?.[0]?.id||null,reason};
}

async function item4LatestP3BlueprintFromAdminQueue(env) {
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

async function item4EnsureP3SingleParentRouteDirect(env) {
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
}
async function item4RecordP3DirectDiagnostic(env, directError) {
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

async function item4EnsureP3SingleParentRoute(env) {
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


async function item4EnsureSmv1PreviewCacheWorker(env) {
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

async function item4PreviewPendingRows(env, recordId) {
  return listRecords(env, ITEM4_VARIANT_QUEUE_TABLE, {
    limit: 100,
    filterFormula:
      `AND({Production_Request_Record_ID}='${String(recordId).replace(/'/g, "\\'")}',{Transfer_Status}='Ready',{Preview_Status}='Pending')`,
  });
}

async function item4DrainPreviewCacheWorker(env, recordId, maxRuns = 30) {
  let pending = await item4PreviewPendingRows(env, recordId);
  if (!pending.length) return [];

  await item4EnsureSmv1PreviewCacheWorker(env);

  const originalState = await phase6ScenarioState(env, ITEM4_SMV1_SCENARIO_ID);
  const executionIds = [];
  try {
    for (let attempt = 0; attempt < maxRuns; attempt += 1) {
      pending = await item4PreviewPendingRows(env, recordId);
      if (!pending.length) break;

      if (!originalState.isActive) {
        // SMV1 Module 1 intentionally consumes only one queue row per cycle.
        // The reliable production pattern is therefore one activation pulse per
        // pending preview row, not one activation followed by repeated /run calls.
        const beforeIds = new Set(pending.map((row) => row.id));
        const beforeCount = pending.length;

        await phase6SetScenarioActive(env, ITEM4_SMV1_SCENARIO_ID, true);
        await new Promise((resolve) => setTimeout(resolve, 2500));
        try { await phase6SetScenarioActive(env, ITEM4_SMV1_SCENARIO_ID, false); } catch {}

        // Allow Make + Airtable to checkpoint Preview_Status/Preview_URL before
        // the next pulse. Continue even if this specific wait window sees no
        // progress; the outer loop is bounded by maxRuns.
        for (let wait = 0; wait < 6; wait += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const after = await item4PreviewPendingRows(env, recordId);
          const sameRowsStillPending = after.filter((row) => beforeIds.has(row.id));
          if (after.length < beforeCount || sameRowsStillPending.length < beforeCount) break;
        }
        continue;
      }

      // Preserve an already-active SMV1 and use explicit runs only in that case.
      const run = await phase6RunScenario(env, ITEM4_SMV1_SCENARIO_ID);
      executionIds.push(run.executionId);
      const done = await phase6WaitForScenarioExecution(
        env,
        ITEM4_SMV1_SCENARIO_ID,
        run.executionId,
        60000,
        1200
      );
      if (done.done && !done.success) {
        throw new HttpError(502, `SMV1 browser-preview cache run failed with status ${done.status}`);
      }
    }
  } finally {
    if (!originalState.isActive) {
      try { await phase6SetScenarioActive(env, ITEM4_SMV1_SCENARIO_ID, false); } catch {}
    }
  }

  return executionIds;
}

function mediaAssetPreviewRecordIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/media-assets\/(rec[A-Za-z0-9]+)\/preview$/);
  if (!match) throw new HttpError(400, "Invalid media asset preview route");
  return match[1];
}

async function fetchGoogleDriveInlineImage(record, request) {
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

function copyDriveImageHeaders(upstream, record) {
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


async function item4PreviewQueueRowForMediaAsset(env, mediaAssetRecordId) {
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

async function fetchStudioR2Preview(previewUrl, request) {
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

async function mediaAssetImagePreview(request, env, url, authorization) {
  if (!authorization?.authenticated || !authorization?.authorized) {
    throw new HttpError(401, "Authenticated Studio session required");
  }

  const recordId = mediaAssetPreviewRecordIdFromPath(url);
  const record = await airtableFetch(env, env.AIRTABLE_MEDIA_TABLE_ID, recordId);
  if (Boolean(f(record, "Do_Not_Use"))) {
    throw new HttpError(403, "This media asset is marked Do Not Use");
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

  // Retain Drive fallback for any file whose Drive permissions already allow it.
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

function outputPreviewRecordIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/outputs\/(rec[A-Za-z0-9]+)\/preview$/);
  if (!match) throw new HttpError(400, "Invalid output preview route");
  return match[1];
}

async function fetchGoogleDriveVideo(fileId, finalFileUrl, request) {
  if (!fileId) throw new HttpError(404, "Rendered preview file ID is not available");

  const headers = new Headers();
  headers.set("Accept", "video/mp4,video/*;q=0.9,*/*;q=0.8");
  const requestedRange = request.headers.get("Range");
  if (requestedRange) headers.set("Range", requestedRange);

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

function copyDriveVideoHeaders(upstream) {
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

async function fetchStudioPreviewVideo(previewUrl, request) {
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

function copyStudioPreviewHeaders(upstream) {
  const headers = new Headers();
  for (const name of ["Content-Type", "Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Content-Type", headers.get("Content-Type") || "video/mp4");
  headers.set("Accept-Ranges", upstream.headers.get("Accept-Ranges") || "bytes");
  headers.set("Cache-Control", "private, max-age=60");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Studio-Preview-Source", "cloudflare-r2-studio-preview");
  headers.delete("Content-Disposition");
  return headers;
}

async function outputPreview(request, env, url, authorization) {
  if (!authorization?.authorized) throw new HttpError(403, "Authorized Studio membership required");

  const recordId = outputPreviewRecordIdFromPath(url);
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId);
  const studioPreviewUrl = String(f(record, "Studio_Preview_URL") || "").trim();

  // Preferred Phase 6 path: R5 writes a browser-playable MP4 copy to the existing
  // ChicagoShining R2 media host. The Studio API remains the authenticated URL the
  // browser sees; Range requests are preserved so the native <video> player can seek.
  if (studioPreviewUrl) {
    try {
      if (request.method === "HEAD") {
        const probeRequest = new Request(request.url, { method: "GET", headers: { Range: "bytes=0-0" } });
        const upstream = await fetchStudioPreviewVideo(studioPreviewUrl, probeRequest);
        const headers = copyStudioPreviewHeaders(upstream);
        const contentRange = upstream.headers.get("Content-Range") || "";
        const totalMatch = contentRange.match(/\/(\d+)$/);
        if (totalMatch?.[1]) headers.set("Content-Length", totalMatch[1]);
        headers.delete("Content-Range");
        try { await upstream.body?.cancel(); } catch {}
        return new Response(null, { status: 200, headers });
      }

      const upstream = await fetchStudioPreviewVideo(studioPreviewUrl, request);
      const headers = copyStudioPreviewHeaders(upstream);
      const status = upstream.status === 206 ? 206 : 200;
      return new Response(upstream.body, { status, headers });
    } catch (error) {
      console.warn("Studio R2 preview unavailable; falling back to Drive", error);
    }
  }

  // Compatibility fallback for older rendered outputs that predate R5 v2.3.
  // Private Drive files generally cannot be fetched server-side without Google OAuth,
  // so the UI may still fall back to its Drive iframe until that output is rerendered.
  const fileId = String(f(record, "Final_File_ID") || extractGoogleDriveFileId(f(record, "Final_File_URL")) || extractGoogleDriveFileId(f(record, "Output_URL")) || "").trim();
  if (!fileId) throw new HttpError(404, "No rendered preview file is available for this output");
  const finalFileUrl = f(record, "Final_File_URL") || f(record, "Output_URL") || null;

  if (request.method === "HEAD") {
    const probeRequest = new Request(request.url, { method: "GET", headers: { Range: "bytes=0-0" } });
    const upstream = await fetchGoogleDriveVideo(fileId, finalFileUrl, probeRequest);
    const headers = copyDriveVideoHeaders(upstream);
    const contentRange = upstream.headers.get("Content-Range") || "";
    const totalMatch = contentRange.match(/\/(\d+)$/);
    if (totalMatch?.[1]) headers.set("Content-Length", totalMatch[1]);
    headers.delete("Content-Range");
    try { await upstream.body?.cancel(); } catch {}
    return new Response(null, { status: 200, headers });
  }

  const upstream = await fetchGoogleDriveVideo(fileId, finalFileUrl, request);
  const headers = copyDriveVideoHeaders(upstream);
  const status = upstream.status === 206 ? 206 : 200;
  return new Response(upstream.body, { status, headers });
}


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
const PHASE6_P0202_SCENARIO_ID = 5893683;
const PHASE6_R4_SCENARIO_ID = 5556716;
const PHASE6_R5_SCENARIO_ID = 5565333;

function phase6RecordIdFromPath(url) {
  const match = url.pathname.match(/^\/api\/outputs\/(rec[A-Za-z0-9]+)\/creative(?:\/review)?$/);
  if (!match) throw new HttpError(400, "Invalid Phase 6 creative route");
  return match[1];
}

function phase6ParseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function phase6Number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function phase6Clamp(value, min, max, fallback) {
  const n = phase6Number(value, fallback);
  if (n === null || n === undefined) return fallback;
  return Math.max(min, Math.min(max, n));
}

function phase6ResolvedVoiceoverVolume(record, fallback = 1) {
  const primary = f(record, "Voiceover_Volume");
  const render = f(record, "Voiceover_Render_Volume");
  return phase6Clamp(primary == null || primary === "" ? render : primary, 0, 1.25, fallback);
}

function phase6AudioMixFieldsFromPayload(payload, current) {
  const audio = payload?.audio && typeof payload.audio === "object" ? payload.audio : {};
  const voiceoverVolume = phase6Clamp(audio.voiceover_volume, 0, 1.25, current?.voiceover?.volume ?? 1);
  const normal = phase6Clamp(audio.normal_volume, 0, 1, current?.music?.normal_volume ?? 0.24);
  const ducked = phase6Clamp(audio.ducked_volume, 0, 1, current?.music?.ducked_volume ?? 0.084);
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

function phase6ProductionMixAction(action) {
  return ["apply_audio_mix", "apply_mix", "remix", "changes", "changes_requested", "revise", "revision"].includes(String(action || ""));
}

function phase6AssertProductionAudioMixAllowed(record) {
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

function phase6AllowsProductionMixContinuation(record) {
  const renderStatus = String(f(record, "Render_Status") || "");
  const reviewStatus = String(f(record, "Review_Status") || "");
  const outputStatus = String(f(record, "Output_Status") || "");
  if (reviewStatus === "Changes Requested") return true;
  if (["Ready for Render", "Rendering"].includes(renderStatus)) return true;
  if (renderStatus === "Rendered" && phase6CurrentRenderStartedAfterReview(record)) return true;
  if (outputStatus === "In Production" && !phase6PreviewFulfillsCurrentReview(record)) return true;
  return false;
}

function phase6Bool(value, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;
  return fallback;
}

function phase6Text(value, max = 10000) {
  return String(value ?? "").trim().slice(0, max);
}

function phase6VariantForRatio(slide, ratio) {
  if (ratio === "4:5") return f(slide, "Asset_4x5_Public_URL") || f(slide, "Asset_4x5_File_URL");
  if (ratio === "9:16") return f(slide, "Asset_9x16_Public_URL") || f(slide, "Asset_9x16_File_URL");
  if (ratio === "1:1") return f(slide, "Asset_1x1_Public_URL") || f(slide, "Asset_1x1_File_URL");
  return null;
}

function phase6SlidePreviewUrl(slide, ratio) {
  return phase6VariantForRatio(slide, ratio) ||
    f(slide, "Final Image URL") || f(slide, "Watermarked Image URL") ||
    f(slide, "Current Image URL") || f(slide, "AI Image URL") || null;
}

function mapPhase6CreativeSlide(slide, targetRatio = null, defaultVoiceoverVolume = 1, platform = "") {
  const directives = phase6ParseJson(f(slide, "Creative_Directives_JSON"), {}) || {};
  const overlay = directives.overlay && typeof directives.overlay === "object" ? directives.overlay : {};
  const voiceover = directives.voiceover && typeof directives.voiceover === "object" ? directives.voiceover : {};
  const motion = directives.motion && typeof directives.motion === "object" ? directives.motion : {};
  const transition = directives.transition && typeof directives.transition === "object" ? directives.transition : {};
  const variants = {
    "4:5": phase6VariantForRatio(slide, "4:5"),
    "9:16": phase6VariantForRatio(slide, "9:16"),
    "1:1": phase6VariantForRatio(slide, "1:1"),
    "16:9": null,
  };
  const tiktok916 = String(platform || "") === "TikTok" && String(targetRatio || "") === "9:16";
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
      position: phase6Text(overlay.position || (tiktok916 ? "lower-third" : "center"), 60),
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
      voice_id: f(slide, "Slide_Voice_ID") || phase6Text(voiceover.voiceId, 120) || (String(f(slide, "Slide_Voice") || phase6Text(voiceover.voice, 80)).toLowerCase() === "george" ? PHASE6_GEORGE_VOICE_ID : PHASE6_DEFAULT_VOICE_ID),
      voice: f(slide, "Slide_Voice_Name") || f(slide, "Slide_Voice") || phase6Text(voiceover.voice, 120) || "Kate",
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

function phase6VirtualSlidesFromSelectedAssets(outputRecord) {
  const parsed = phase6ParseJson(f(outputRecord, "Selected_Assets_JSON"), null) || {};
  const clips = selectedVisualClips(outputRecord);
  const ratio = String(f(outputRecord, "Aspect_Ratio") || "").trim() || null;
  const fps = Number(parsed.fps || 30) || 30;
  const title = phase6Text(parsed?.render_prep?.title_text || f(outputRecord, "Output_Title"), 1000);
  return clips.map((clip, index) => {
    const url = clip.url || clip.src || clip.google_drive_url || null;
    const durationFrames = Number(clip.durationFrames || clip.duration_frames || 0);
    const durationSeconds = durationFrames > 0 ? durationFrames / fps : Number(clip.recommended_duration_seconds || 4);
    const variants = { "4:5": null, "9:16": null, "1:1": null, "16:9": null };
    if (ratio && url) variants[ratio] = url;
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
        enabled: Boolean(title),
        text: title,
        style_preset: "Chicago Editorial",
        role: "overlay",
        position: String(f(outputRecord, "Platform") || "") === "TikTok" && ratio === "9:16" ? "lower-third" : "center",
        size: 64,
        version: 1,
        eyebrow: "",
        subtitle: "",
        caption: "",
        accent_text: "",
        brand: phase6Text(parsed?.render_prep?.brand_text, 250),
        background_opacity: 0.4,
        animation: "fade",
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
          voice_id: PHASE6_DEFAULT_VOICE_ID,
          voice: String(f(outputRecord, "Voice_Name") || "Kate"),
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

async function phase6SlidesForOutput(env, outputRecord) {
  const ids = Array.isArray(f(outputRecord, "Carousel Slides")) ? f(outputRecord, "Carousel Slides") : [];
  if (!ids.length) return phase6VirtualSlidesFromSelectedAssets(outputRecord);
  const records = await Promise.all(ids.map(id => airtableFetch(env, PHASE6_CAROUSEL_SLIDES_TABLE, id)));
  const ratio = String(f(outputRecord, "Aspect_Ratio") || "").trim() || null;
  const platform = String(f(outputRecord, "Platform") || "").trim();
  const defaultVoiceoverVolume = phase6ResolvedVoiceoverVolume(outputRecord);
  return records.map(record => mapPhase6CreativeSlide(record, ratio, defaultVoiceoverVolume, platform))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

async function phase6CachedVoiceCatalog(env) {
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

function mapElevenLabsVoice(voice) {
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

function phase6ElevenLabsErrorDetail(status, body) {
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

async function phase6FetchElevenLabsJson(env, path) {
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

function phase6CollectElevenLabsVoices(body) {
  return (Array.isArray(body?.voices) ? body.voices : []).map(mapElevenLabsVoice).filter(Boolean);
}

async function phase6LiveElevenLabsVoices(env) {
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

async function phase6VoiceCatalog(env) {
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

async function listPhase6Voices(request, env, authorization) {
  const catalog = await phase6VoiceCatalog(env);
  return respond(request, env, {
    ok: true,
    ...catalog,
    generation_authority: "voice_id",
    current_default_preserved: true,
    make_mapping: "finalized-server-side-on-creative-save",
  });
}

async function phase6VoicePreviewUrl(env, voiceId) {
  const apiKey = String(env.ELEVENLABS_API_KEY || "").trim();
  if (apiKey) {
    const detail = await phase6FetchElevenLabsJson(env, `/v1/voices/${encodeURIComponent(voiceId)}`);
    const liveUrl = phase6Text(detail.body?.preview_url, 2000) || null;
    if (liveUrl) return liveUrl;
  }
  const catalog = await phase6VoiceCatalog(env);
  return catalog.voices.find((voice) => voice.id === voiceId)?.preview_url || null;
}

async function phase6VoicePreview(request, env, url) {
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

function phase6FindModule(flow, moduleId) {
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

async function phase6EnsureP0202DynamicVoiceMapping(env, authorization) {
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

function mapPhase6CreativeOutput(record) {
  const manifest = phase6ParseJson(f(record, "Creative_Render_Manifest_JSON"), null);
  const settings = phase6ParseJson(f(record, "Studio_Creative_Settings_JSON"), {}) || {};
  const manifestMusic = manifest?.music && typeof manifest.music === "object" ? manifest.music : {};
  const normal = phase6Number(f(record, "Music_Volume"), phase6Number(manifestMusic.baseVolume, 0.24));
  const ducked = phase6Number(
    f(record, "Music_Ducked_Volume"),
    phase6Number(manifestMusic.effectiveDuckedVolume,
      normal * phase6Number(manifestMusic.duckingMultiplier, 0.35))
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
    studio_preview_url: f(record, "Studio_Preview_URL") || studioNativeStillPreviewUrl(record) || null,
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

async function getOutputCreative(request, env, url, authorization) {
  const id = phase6RecordIdFromPath(url);
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  const output = mapPhase6CreativeOutput(record);
  const [slides, voiceCatalog] = await Promise.all([
    phase6SlidesForOutput(env, record),
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
      default_voice_id: voiceCatalog.default_voice_id,
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

function phase6Select(value, allowed, fallback) {
  const text = phase6Text(value, 100);
  return allowed.includes(text) ? text : fallback;
}

function phase6SlideDirectiveFromPayload(input, existing) {
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

async function updateOutputCreative(request, env, url, authorization) {
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
    const slides = await phase6SlidesForOutput(env, refreshedOutput);
    return respond(request, env, {
      ok: true,
      saved: true,
      audio_only: true,
      record: mapPhase6CreativeOutput(refreshedOutput),
      slides: phase6SlidesWithTitleRenderInput(refreshedOutput, slides),
      title_lock: phase6TitleLockView(refreshedOutput, slides),
      message: "Audio mix saved. Apply mix & rerender to hear it on a new preview.",
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
  const tiktok916 = String(f(existingOutput, "Platform") || "") === "TikTok" && String(f(existingOutput, "Aspect_Ratio") || "") === "9:16";
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
      position: previousOverlay.position || (tiktok916 ? "lower-third" : "center"),
      caption: previousOverlay.caption || previousOverlay.subtitle,
      subtitle: previousOverlay.subtitle || previousOverlay.caption,
    };
    const newOverlayForIdentity = {
      ...directive.overlay,
      position: directive.overlay?.position || (tiktok916 ? "lower-third" : "center"),
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


function phase6DimensionsForRatio(ratio) {
  if (ratio === "16:9") return { width: 1920, height: 1080 };
  if (ratio === "1:1") return { width: 1080, height: 1080 };
  if (ratio === "4:5") return { width: 1080, height: 1350 };
  return { width: 1080, height: 1920 };
}

function phase6AssetSourceForSlide(slide, ratio) {
  if (slide?.variants?.[ratio]) return `prepared_${String(ratio).replace(":", "x")}`;
  return "fallback_source";
}

function phase6TitleEditIdentity(overlay, _durationSeconds = 4) {
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

function phase6NextTitleVersion(oldOverlay, newOverlay, durationSeconds = 4) {
  const previous = oldOverlay && typeof oldOverlay === "object" ? oldOverlay : {};
  const next = newOverlay && typeof newOverlay === "object" ? newOverlay : {};
  const hadVersion = Number.isFinite(Number(previous.version)) && Number(previous.version) >= 1;
  const prevVersion = hadVersion ? Math.round(Number(previous.version)) : 1;
  if (phase6TitleEditIdentity(previous, durationSeconds) === phase6TitleEditIdentity(next, durationSeconds)) {
    return hadVersion ? prevVersion : 1;
  }
  return hadVersion ? prevVersion + 1 : 1;
}

function phase6TitleLockState({ reviewStatus = "", lock = null, overlayChanged = false, unlockRequested = false } = {}) {
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

function phase6TitleLockView(record, slides = []) {
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

function phase6TitleRenderInput(slide, options = {}) {
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

function phase6SlidesWithTitleRenderInput(outputRecord, slides = []) {
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

function phase6RenderOverlayFromSlide(slide, options = {}) {
  const o = slide?.overlay || {};
  const tiktok = String(options.platform || "") === "TikTok" && String(options.ratio || "") === "9:16";
  const startFraction = phase6Clamp(o.start_fraction ?? o.startFraction, 0, 1, 0);
  const endFraction = phase6Clamp(o.end_fraction ?? o.endFraction, 0, 1, 1);
  const text = phase6Text(o.text || (tiktok ? slide?.name : ""), 1000);
  const enabled = o.enabled !== false && Boolean(text);
  const overlay = {
    enabled,
    text,
    position: phase6Text(o.position || (tiktok ? "lower-third" : "center"), 60),
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

async function phase6BuildPreviewRenderPackage(env, outputRecord) {
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
  const tailSeconds = phase6Clamp(mapped.voiceover_tail_seconds, 0, 10, 2);
  const anyVoiceover = slides.some(slide => slide?.voiceover?.enabled !== false && phase6Text(slide?.voiceover?.text, 5000));
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
    let durationFrames = Math.max(requestedFrames, measuredFrames);
    if (i === slides.length - 1 && anyVoiceover) durationFrames += Math.round(tailSeconds * 30);

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

  const normal = phase6Clamp(mapped?.music?.normal_volume, 0, 1, 0.24);
  const ducked = phase6Clamp(mapped?.music?.ducked_volume, 0, 1, 0.084);
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

function phase6PendingVoicePrepSlides(slides) {
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

async function phase6EnsureP0202ProductionGeneric(env, authorization) {
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

function phase6Mp3DurationSeconds(bytes) {
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

async function phase6MeasureAndPersistMissingVoiceDurations(env, outputRecord) {
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

async function phase6ScenarioState(env, scenarioId) {
  const body = await phase6MakeApiJson(env, `/scenarios/${scenarioId}`, { method: "GET" });
  const scenario = body?.scenario || body?.response?.scenario || body || {};
  return { isActive: scenario?.isActive === true, scenario };
}

async function phase6SetScenarioActive(env, scenarioId, active) {
  await phase6MakeApiJson(env, `/scenarios/${scenarioId}/${active ? "start" : "stop"}`, { method: "POST" });
}

async function phase6WaitForOutputStatus(env, outputRecordId, predicate, timeoutMs = 90000, pollMs = 2500) {
  const started = Date.now();
  let record = null;
  while (Date.now() - started < timeoutMs) {
    record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId);
    if (predicate(record)) return { matched: true, record };
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { matched: false, record };
}

async function phase6AutoRunRenderPipeline(env, outputRecordId) {
  const r4State = await phase6ScenarioState(env, PHASE6_R4_SCENARIO_ID);
  const r5State = await phase6ScenarioState(env, PHASE6_R5_SCENARIO_ID);
  let r4Execution = null;
  const r5Executions = [];
  try {
    let admitted = null;
    if (!r4State.isActive) {
      // R4 is interval-scheduled while inactive; /start itself launches one run.
      await phase6SetScenarioActive(env, PHASE6_R4_SCENARIO_ID, true);
      admitted = await phase6WaitForOutputStatus(env, outputRecordId, (record) => {
        const status = String(f(record, "Render_Status") || "");
        return ["Rendering", "Rendered", "Failed"].includes(status);
      }, 30000, 1500);
    }
    if (!admitted?.matched) {
      const r4 = await phase6RunScenario(env, PHASE6_R4_SCENARIO_ID);
      r4Execution = r4.executionId;
      const r4Done = await phase6WaitForScenarioExecution(env, PHASE6_R4_SCENARIO_ID, r4Execution, 60000, 2000);
      if (r4Done.done && !r4Done.success) throw new HttpError(502, `R4 rerender start failed with status ${r4Done.status}`);
      admitted = await phase6WaitForOutputStatus(env, outputRecordId, (record) => {
        const status = String(f(record, "Render_Status") || "");
        return ["Rendering", "Rendered", "Failed"].includes(status);
      }, 30000, 1500);
    }

    if (!admitted.matched) throw new HttpError(504, "R4 did not move the output into Rendering within the expected window");
    if (String(f(admitted.record, "Render_Status") || "") === "Failed") throw new HttpError(502, "R4 marked the output Failed");
    if (String(f(admitted.record, "Render_Status") || "") === "Rendered") return { completed: true, r4_execution_id: r4Execution, r5_execution_ids: [] };

    if (!r5State.isActive) {
      // As with R4/P020-2, activation of an interval scenario launches one run.
      await phase6SetScenarioActive(env, PHASE6_R5_SCENARIO_ID, true);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const afterActivation = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId);
      if (String(f(afterActivation, "Render_Status") || "") === "Rendered" && f(afterActivation, "Studio_Preview_URL")) {
        return {
          completed: true,
          r4_execution_id: r4Execution,
          r5_execution_ids: r5Executions,
          final_file_url: f(afterActivation, "Final_File_URL") || null,
          studio_preview_url: f(afterActivation, "Studio_Preview_URL") || null,
          preview_updated_at: f(afterActivation, "Studio_Preview_Updated_At") || null,
        };
      }
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

async function phase6StopScenarioVerified(env, scenarioId, attempts = 3) {
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

async function phase6PulseInactiveScenario(env, scenarioId, outputRecordId, predicate, waitMs = 9000) {
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
    observed = await phase6WaitForOutputStatus(env, outputRecordId, predicate, waitMs, 1000);
    return { started, observed, was_active: false, exact_selector_isolation: true, eligible_count: eligible.length };
  } finally {
    cleanup = await phase6StopScenarioVerified(env, scenarioId, 4);
    if (!cleanup.inactive) console.error(`Phase 6 could not restore scenario ${scenarioId} inactive`, cleanup);
  }
}

function phase6TimeMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : null;
}

function phase6CompactTimestampMs(value) {
  const match = String(value || "").match(/(20\d{12})/);
  if (!match) return null;
  const s = match[1];
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`;
  return phase6TimeMs(iso);
}

function phase6CurrentRenderStartedAfterReview(record) {
  const requestedAt = phase6TimeMs(f(record, "Review_Decision_At"));
  if (requestedAt === null) return false;
  const jobAt = phase6CompactTimestampMs(f(record, "Remotion_Job_ID"));
  return jobAt !== null && jobAt >= requestedAt - 5000;
}

function phase6CurrentFinalFileAfterReview(record) {
  const requestedAt = phase6TimeMs(f(record, "Review_Decision_At"));
  if (requestedAt === null) return false;
  const fileAt = phase6CompactTimestampMs(f(record, "Final_File_Name"));
  return fileAt !== null && fileAt >= requestedAt - 5000;
}

function phase6PreviewFulfillsCurrentReview(record) {
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

async function phase6RestoreProductionReviewReady(env, record) {
  if (Boolean(f(record, "Do_Not_Publish"))) return record;
  if (!phase6PreviewFulfillsCurrentReview(record)) return record;
  const outputStatus = String(f(record, "Output_Status") || "").trim();
  const reviewStatus = String(f(record, "Review_Status") || "").trim();
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

function phase6RenderHandoffState(record) {
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

function phase6CreativeHandoffStatus(record, slides = []) {
  const reviewStatus = String(f(record, "Review_Status") || "");
  const outputStatus = String(f(record, "Output_Status") || "");
  const renderStatus = String(f(record, "Render_Status") || "");
  const storageStatus = String(f(record, "Final_File_Storage_Status") || "");
  const requestedAt = phase6TimeMs(f(record, "Review_Decision_At"));
  const previewAt = phase6TimeMs(f(record, "Studio_Preview_Updated_At"));
  const previewReady = phase6PreviewFulfillsCurrentReview(record);
  const requestStarted = reviewStatus === "Changes Requested" || outputStatus === "In Production" || requestedAt !== null;
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
    { key: "final_upload", label: "Final Upload", status: (!finalComplete && finalError) ? "error" : (!renderComplete ? "pending" : finalComplete ? "complete" : "active"), detail: (!finalComplete && finalError) ? finalError : (finalComplete ? "Final Google Drive upload is complete." : renderComplete ? "Render is complete; final upload is being finalized." : "Waiting for render completion."), error: (!finalComplete && finalError) ? finalError : null },
    { key: "preview_ready", label: "Preview Ready", status: previewReady ? "complete" : (!finalComplete ? "pending" : "active"), detail: previewReady ? "Studio native preview is refreshed for this revision." : finalComplete ? "Final file is ready; Studio preview refresh is pending." : "Waiting for final upload.", error: null },
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

async function getOutputCreativeHandoffStatus(request, env, url, authorization) {
  const match = url.pathname.match(/^\/api\/outputs\/(rec[A-Za-z0-9]+)\/creative\/handoff\/status$/);
  if (!match) throw new HttpError(400, "Invalid Phase 6 handoff status route");
  const id = match[1];
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  const slides = await phase6SlidesForOutput(env, record);
  return respond(request, env, {
    ok: true,
    handoff: phase6CreativeHandoffStatus(record, slides),
    output: mapPhase6CreativeOutput(record),
  });
}

async function phase6AdvanceRenderPipelineShort(env, outputRecordId) {
  let current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, outputRecordId);
  if (!Boolean(f(current, "Do_Not_Publish")) && !phase6AllowsProductionMixContinuation(current)) {
    throw new HttpError(409, "Phase 6 automatic rerender requires Do_Not_Publish or an in-progress mix revision");
  }
  let state = phase6RenderHandoffState(current);
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

async function phase6EnsureRenderPackageForContinuation(env, outputRecord) {
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

async function continueOutputCreativeHandoff(request, env, url, authorization) {
  const match = url.pathname.match(/^\/api\/outputs\/(rec[A-Za-z0-9]+)\/creative\/render\/continue$/);
  if (!match) throw new HttpError(400, "Invalid Phase 6 continuation route");
  const id = match[1];
  let current = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
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

async function phase6MakeApiConfig(env) {
  const settings = await listPipelineSettingsForAdmin(env);
  const makeApiBase = pipelineSettingValue(settings, "MAKE_API_BASE_URL").replace(/\/+$/, "");
  const makeApiToken = pipelineSettingValue(settings, "MAKE_API_TOKEN");
  if (!makeApiBase || !makeApiToken) throw new HttpError(500, "Make API configuration is required for automatic voice prep");
  return {
    makeApiBase,
    headers: { Authorization: `Token ${makeApiToken}`, Accept: "application/json", "Content-Type": "application/json" },
  };
}

async function phase6MakeApiJson(env, path, init = {}) {
  const { makeApiBase, headers } = await phase6MakeApiConfig(env);
  const response = await fetch(`${makeApiBase}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (!response.ok) {
    const detail = raw ? `: ${raw.slice(0, 700)}` : "";
    throw new HttpError(response.status, `Make API ${init.method || "GET"} ${path} failed (${response.status})${detail}`);
  }
  return body;
}

async function phase6EnsureScenarioActive(env, scenarioId) {
  const body = await phase6MakeApiJson(env, `/scenarios/${scenarioId}`, { method: "GET" });
  const scenario = body?.scenario || body?.response?.scenario || body || {};
  if (scenario?.isActive === true) return scenario;
  const started = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/start`, { method: "POST" });
  return started?.scenario || started?.response?.scenario || started || scenario;
}

const PRODUCTION_CADENCE_RENDER = Object.freeze([
  { id: 5528742, key: "P1" },
  { id: 5569495, key: "R2" },
  { id: 5557966, key: "R3" },
  { id: 5556716, key: "R4" },
  { id: 5565333, key: "R5" },
  { id: 5576363, key: "RR1" },
]);
const PRODUCTION_CADENCE_PUBLISH = Object.freeze([
  { id: 5864632, key: "IG" },
  { id: 5791537, key: "APCAR" },
  { id: 5813561, key: "FB" },
  { id: 5806668, key: "TTD" },
  { id: 5823581, key: "YT" },
]);
const PRODUCTION_CADENCE_ALWAYS_ON = Object.freeze([
  { id: 5531703, key: "P3" },
]);
const PRODUCTION_CADENCE_HOLD_MS = 12 * 60 * 1000;
const PRODUCTION_CADENCE_THROTTLE_MS = 20000;
let productionCadenceLastSyncAt = 0;
let productionCadenceRenderHoldUntil = 0;
let productionCadencePublishHoldUntil = 0;

function cadenceScheduleSync(ctx, env, options = {}) {
  const run = syncProductionCadence(env, options).catch((error) => {
    console.warn("production cadence sync failed", error);
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(run);
  return run;
}

async function cadenceQueueHasWork(env, tableId, query) {
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

async function cadenceRepairInProgress(env) {
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

async function cadenceHasRenderWork(env) {
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const contentTable = env.AIRTABLE_CONTENT_TABLE_ID;
  const checks = await Promise.all([
    cadenceQueueHasWork(env, contentTable, { view: "P1 - Ready for Package Generation", formula: "{Test_Run_ID}=BLANK()" }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),NOT({Do_Not_Publish}),{Content_Item}!=BLANK(),{Output_Status}="Planned",{Production_Request_Output}!=BLANK())' }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),NOT({Do_Not_Publish}),{Content_Item}!=BLANK(),{Output_Status}="Ready for Review",OR({Asset_Need_Status}="Not Needed",{Asset_Need_Status}="Fulfilled"),{Asset_Selection_Status}=BLANK(),{Render_Status}=BLANK())' }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),AND({Asset_Selection_Status}="Selected",{Selected_Assets_JSON}!="",{Render_Status}=BLANK(),OR({Format}="Vertical Short Video",{Format}="Longform Video",{Format}="Feed Post",{Format}="Story")))' }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),AND({Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0))' }),
    cadenceQueueHasWork(env, outputTable, { view: "R5 - Rendering Jobs to Poll", formula: "{Test_Run_ID}=BLANK()" }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),{Output_Status}="Ready for Review",{Review_Email_Sent_At}=BLANK(),OR({Review_Status}=BLANK(),{Review_Status}=""),OR(AND({Render_Status}="Rendered",{Final_File_URL}!=""),AND({Platform}="TikTok",{Studio_Output_Type}="Multi-Photo",{Composition_ID}="",{Render_Clip_List_JSON}!=""),AND({Platform}="Instagram",{Studio_Output_Type}="Carousel",{Composition_ID}="",{Selected_Assets_JSON}!=""),AND({Platform}="Facebook",{Studio_Output_Type}="Multi-Image Post",{Composition_ID}="",{Selected_Assets_JSON}!="")))' }),
  ]);
  return checks.some(Boolean);
}

async function cadenceHasPublishWork(env) {
  const outputTable = env.AIRTABLE_OUTPUT_TABLE_ID;
  const checks = await Promise.all([
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),OR({Publish_Status}="Ready to Schedule",{Publish_Status}="Ready to Publish",{Publish_Status}="Publishing",{IG_Story_Status}="Publishing"))' }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),{Publish_Status}!="Published")' }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="TikTok",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),{Publish_Status}!="Published")' }),
    cadenceQueueHasWork(env, outputTable, { formula: 'AND({Test_Run_ID}=BLANK(),{Platform}="YouTube",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,{Published_At}=BLANK(),{Publish_Status}!="Published")' }),
  ]);
  return checks.some(Boolean);
}

async function cadenceSetActive(env, scenarioId, active) {
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

async function syncProductionCadence(env, { force = false, startRender = false, startPublish = false } = {}) {
  const now = Date.now();
  if (!force && !startRender && !startPublish && now - productionCadenceLastSyncAt < PRODUCTION_CADENCE_THROTTLE_MS) {
    return { skipped: "throttled" };
  }
  productionCadenceLastSyncAt = now;
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
    ...PRODUCTION_CADENCE_RENDER.map((item) => cadenceSetActive(env, item.id, wantRender)),
    ...PRODUCTION_CADENCE_PUBLISH.map((item) => cadenceSetActive(env, item.id, wantPublish)),
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

async function phase6RunScenario(env, scenarioId, data = null) {
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

async function phase6StopExactScenarioExecution(env, scenarioId, executionId) {
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

async function phase6WaitForScenarioExecution(env, scenarioId, executionId, timeoutMs = 90000, pollMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const body = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/executions/${executionId}`, { method: "GET" });
    const details = body?.response || body?.execution || body || {};
    const status = String(details?.status || "").toUpperCase();
    if (["SUCCESS", "WARNING"].includes(status)) return { done: true, success: true, status, details };
    if (["ERROR", "FAILED"].includes(status)) return { done: true, success: false, status, details };
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { done: false, success: false, status: "TIMEOUT", details: null };
}

async function phase6WaitForVoicePrepCompletion(env, outputRecord, timeoutMs = 90000, pollMs = 2500) {
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

async function phase6ClearVoicePrepTokens(env, slides) {
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

async function phase6AdvanceVoicePrepShort(env, outputRecord) {
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

  const scenarioState = await phase6ScenarioState(env, PHASE6_P0202_SCENARIO_ID);
  const scenarioName = String(scenarioState?.scenario?.name || "");
  if (!/v1\.8/i.test(scenarioName) || !/request scoped/i.test(scenarioName)) {
    throw new HttpError(409, `P020-2 request-scoped v1.8 is required before Studio voice prep can run. Live scenario: ${scenarioName || PHASE6_P0202_SCENARIO_ID}`);
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
  let cleanup = null;
  try {
    if (scenarioState.isActive) await phase6StopScenarioVerified(env, PHASE6_P0202_SCENARIO_ID, 3);
    await phase6SetScenarioActive(env, PHASE6_P0202_SCENARIO_ID, true);
    started = true;
    // Keep this pulse bounded so browser/Worker requests remain resumable. Activation itself
    // launches the interval scenario once; no overlapping /run call is issued.
    await new Promise((resolve) => setTimeout(resolve, 6500));
  } finally {
    cleanup = await phase6StopScenarioVerified(env, PHASE6_P0202_SCENARIO_ID, 4);
    if (!cleanup.inactive) console.error("Phase 6 could not restore P020-2 inactive", cleanup);
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

async function phase6AutoVoicePrepForOutput(env, outputRecord, authorization) {
  await phase6EnsureP0202ProductionGeneric(env, authorization);
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

  const priorState = await phase6ScenarioState(env, PHASE6_P0202_SCENARIO_ID);
  const executionIds = [];
  let activationTriggeredRun = false;
  try {
    if (!priorState.isActive) {
      // Make's /start endpoint immediately runs scenarios that use interval scheduling.
      // Do not POST /run on top of that execution: doing so races the just-started run and returns 422.
      await phase6SetScenarioActive(env, PHASE6_P0202_SCENARIO_ID, true);
      activationTriggeredRun = true;
      const activationWaitStarted = Date.now();
      while (Date.now() - activationWaitStarted < 45000) {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        await phase6MeasureAndPersistMissingVoiceDurations(env, outputRecord);
        slides = await phase6SlidesForOutput(env, outputRecord);
        pending = phase6PendingVoicePrepSlides(slides);
        if (!pending.length) break;
      }
    }
    const maxRuns = Math.min(40, Math.max(1, scopedSlideIds.length + 5));
    let lastPendingSignature = "";
    for (let runIndex = 0; runIndex < maxRuns; runIndex += 1) {
      // P020-2 historically did not persist duration. Probe any already-generated MP3 first;
      // this can resolve a duration-only pending slide without regenerating its narration.
      await phase6MeasureAndPersistMissingVoiceDurations(env, outputRecord);
      slides = await phase6SlidesForOutput(env, outputRecord);
      pending = phase6PendingVoicePrepSlides(slides);
      if (!pending.length) break;

      const signature = pending.map((x) => `${x.id}:${x.reason}`).join("|");
      const { executionId } = await phase6RunScenario(env, PHASE6_P0202_SCENARIO_ID);
      executionIds.push(executionId);
      const execution = await phase6WaitForScenarioExecution(env, PHASE6_P0202_SCENARIO_ID, executionId, 60000, 2000);
      if (execution.done && !execution.success) throw new HttpError(502, `P020-2 automatic voice prep failed with status ${execution.status}`);
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
      triggered: activationTriggeredRun || executionIds.length > 0,
      activation_triggered_run: activationTriggeredRun,
      completed: pending.length === 0,
      pending_voice_slides: pending,
      scenario_id: PHASE6_P0202_SCENARIO_ID,
      execution_ids: executionIds,
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
    try { if (!priorState.isActive) await phase6SetScenarioActive(env, PHASE6_P0202_SCENARIO_ID, false); } catch {}
  }
}

function studioOutputReadyForPublishApproval(record) {
  const reviewStatus = String(f(record, "Review_Status") || "").trim();
  const outputStatus = String(f(record, "Output_Status") || "").trim();
  const publishStatus = String(f(record, "Publish_Status") || "").trim();
  if (["Approved"].includes(reviewStatus) || outputStatus === "Approved for Publishing") return false;
  if (["Published", "Publishing"].includes(publishStatus)) return false;
  if (outputStatus === "In Production" || ["Ready for Render", "Rendering"].includes(String(f(record, "Render_Status") || "").trim())) return false;
  const rendered = String(f(record, "Render_Status") || "").trim() === "Rendered" && Boolean(String(f(record, "Final_File_URL") || "").trim());
  if (!rendered && !studioOutputIsNativePhoto(record)) return false;
  return outputStatus === "Ready for Review" || reviewStatus === "Review Sent";
}

async function reviewOutputCreative(request, env, url, authorization, ctx = null) {
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
    if (doNotPublish) throw new HttpError(409, "Do_Not_Publish outputs cannot be approved for live publishing");
    if (!studioOutputReadyForPublishApproval(existing)) {
      throw new HttpError(409, "This output is not ready for publishing approval");
    }
    const fields = {
      Review_Status: "Approved",
      Output_Status: "Approved for Publishing",
      Publish_Status: "Ready to Schedule",
      Publish_Method: "Automated",
      Auto_Publish_Enabled: true,
      Review_Decision_At: stamp,
      Do_Not_Publish: false,
      Review_Notes: [existingNotes, note, `Studio Pipeline approved for publishing at ${stamp}.`].filter(Boolean).join("\n\n"),
      ...studioPublishHandoffFields(existing),
    };
    const prepared = await studioEnsureNativePublishSlides(env, existing);
    const updated = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, prepared.id || id, {
      method: "PATCH",
      body: JSON.stringify({ fields: { ...fields, ...studioPublishHandoffFields(prepared) }, typecast: true }),
    });
    cadenceScheduleSync(ctx, env, { startPublish: true });
    return respond(request, env, {
      ok: true,
      action: "approve_for_publishing",
      record: mapPhase6CreativeOutput(updated),
      handoff_state: "approved_for_publishing",
      message: "Approved for publishing. Instagram and Facebook will auto-publish; TikTok will be created as a draft.",
    });
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
    const slides = await phase6SlidesForOutput(env, updated);
    return respond(request, env, {
      ok: true,
      action: "apply_audio_mix",
      preview_rerender_prepared: true,
      record: mapPhase6CreativeOutput(updated),
      slides: phase6SlidesWithTitleRenderInput(updated, slides),
      handoff: phase6CreativeHandoffStatus(updated, slides),
      handoff_state: "render_ready",
      message: "Mix saved. Studio is rendering a new preview. Approve stays locked until that preview is ready.",
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

async function getRecordRoute(request, env, url, tableId, kind) {
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!/^rec[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, "Invalid Airtable record ID");
  const record = await airtableFetch(env, tableId, id);
  const mapped = kind === "idea" ? mapIdea(record) : mapContent(record);
  return respond(request, env, { ok: true, record: mapped });
}

async function getOutputRoute(request, env, url) {
  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!/^rec[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, "Invalid Airtable record ID");
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, id);
  return respond(request, env, { ok: true, record: mapOutput(record) });
}

async function dashboard(request, env) {
  const [ideas, content, outputs] = await Promise.all([
    listRecords(env, env.AIRTABLE_IDEA_TABLE_ID, { limit: 100, sortField: "Create_Date" }),
    listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, { limit: 100, sortField: "Created_At" }),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit: 100 }),
  ]);

  const mappedOutputs = outputs.map(mapOutput);
  const attentionStates = new Set(["Failed", "Retry Pending", "Manual Action Required"]);
  const published = mappedOutputs.filter((o) => o.studio_state === "Published").length;
  const attention = mappedOutputs.filter((o) => attentionStates.has(o.studio_state)).length;
  const active = mappedOutputs.filter((o) => !["Published", "Skipped", "Failed"].includes(o.studio_state)).length;

  return respond(request, env, {
    ok: true,
    metrics: {
      ideas: ideas.length,
      content_items: content.length,
      platform_outputs: mappedOutputs.length,
      active_outputs: active,
      attention_outputs: attention,
      published_outputs: published,
    },
    recent_outputs: mappedOutputs.slice(0, 12),
  });
}


function respondHtml(request, env, html, status = 200) {
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

async function listPipelineSettingsForAdmin(env) {
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

function pipelineSettingValue(records, name) {
  const match = records.find((record) =>
    String(record?.fields?.Setting_Name || "").trim() === name &&
    Boolean(record?.fields?.Active)
  );
  return match ? String(match.fields.Setting_Value || "").trim() : "";
}


const REPAIR_LEASE_NOTE_PREFIX = "REPAIR_LEASE_V1";
const REPAIR_LEASE_TABLE_ID = "tbltuSt9UibYzxpah";
const REPAIR_CONTROL_SCENARIOS = new Set([
  5893243, // MAKE-ADMIN-BRIDGE
  5813561, // FB-ORCH
  5864632, // IG-PUB-ORCH
  5556716, // R4 renderer handoff
  5528742, // P1 content package scheduled root (Test Mode exact selector pulse only)
  5569495, // R2 exact Test Mode selector pulse only
  5557966, // R3 exact Test Mode selector pulse only
  5565333, // R5 exact Test Mode selector pulse only
  5576363, // RR1 exact Test Mode selector pulse only
  5612096, // AP0 public asset preparation
]);
const REPAIR_LEASE_MAX_MS = 30 * 60 * 1000;
const REPAIR_LEASE_MIN_MS = 60 * 1000;

function repairJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function repairIsoMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : NaN;
}

function repairString(value, name, max = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new HttpError(400, `${name} is required and must be <= ${max} characters`);
  return text;
}

function repairRecordIds(value, name) {
  const ids = Array.isArray(value) ? value.map((v) => String(v || "").trim()).filter(Boolean) : [];
  if (!ids.length) throw new HttpError(400, `${name} must contain at least one exact Airtable record ID`);
  if (ids.length > 20 || ids.some((id) => !/^rec[A-Za-z0-9]{14}$/.test(id))) {
    throw new HttpError(400, `${name} contains an invalid Airtable record ID`);
  }
  return [...new Set(ids)];
}

function repairLeaseState(record) {
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

async function repairLeaseRecords(env, scenarioId = null) {
  const formulas = ['{Status}="Processing"', `FIND("${REPAIR_LEASE_NOTE_PREFIX}", {Notes}&"")>0`];
  if (Number.isInteger(Number(scenarioId)) && Number(scenarioId) > 0) formulas.push(`{Scenario_ID}=${Number(scenarioId)}`);
  return listRecords(env, REPAIR_LEASE_TABLE_ID, {
    limit: 50,
    sortField: "Requested_At",
    sortDirection: "desc",
    filterFormula: `AND(${formulas.join(",")})`,
  });
}

async function repairClearR4LeaseToken(env, lease) {
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

async function repairCloseLease(env, lease, status, resultPatch = {}) {
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

async function repairVerifyOutputRecord(env, recordId, allowPublicPublish = false, expectedTestRunId = null) {
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

async function repairSweepExpiredLeases(env, scenarioId = null) {
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


async function repairVerifyContentItemRecord(env, recordId, expectedTestRunId) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(recordId || ""))) throw new HttpError(400, "Invalid Content Item record ID");
  const record = await airtableFetch(env, "Content Items", recordId);
  const fields = record?.fields || {};
  const durableTestRunId = String(fields.Test_Run_ID || "").trim();
  if (!durableTestRunId || durableTestRunId !== String(expectedTestRunId || "").trim()) {
    throw new HttpError(403, `Content Item ${recordId} Test_Run_ID does not exactly match the repair lease`);
  }
  return record;
}

async function repairAcquireLease(env, input, authorization) {
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

async function repairFindLease(env, input) {
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

async function repairReserveBudget(env, lease, { operationCost = 1, runCost = 0, action = "operation" } = {}) {
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


function repairScenarioModuleById(flow, moduleId) {
  for (const node of flow || []) {
    if (Number(node?.id) === Number(moduleId)) return node;
    for (const route of node?.routes || []) {
      const found = repairScenarioModuleById(route?.flow || [], moduleId);
      if (found) return found;
    }
  }
  return null;
}

function repairScenarioModuleIds(flow, out = []) {
  for (const node of flow || []) {
    out.push(Number(node?.id));
    for (const route of node?.routes || []) repairScenarioModuleIds(route?.flow || [], out);
  }
  return out;
}

async function repairReadMakeBlueprint(env, scenarioId) {
  const raw = await phase6MakeApiJson(env, `/scenarios/${scenarioId}/blueprint?draft=false`, { method: "GET" });
  const wrapped = raw?.blueprint ?? raw?.response?.blueprint ?? raw;
  const blueprint = typeof wrapped === "string" ? repairJson(wrapped, null) : wrapped;
  if (!blueprint || typeof blueprint !== "object" || Array.isArray(blueprint)) throw new HttpError(502, `Make scenario ${scenarioId} returned an invalid blueprint`);
  return { blueprint, original_payload: typeof wrapped === "string" ? wrapped : JSON.stringify(blueprint) };
}

function repairP1Eligibility(fields) {
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

async function repairWaitForP1Package(env, recordId, expectedTestRunId, timeoutMs = 90000) {
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

async function repairPulseP1TestSelector(env, lease, input, action) {
  const P1_SCENARIO_ID = 5528742;
  if (lease.scenario_id !== P1_SCENARIO_ID) throw new HttpError(403, `pulse_p1_test_selector is limited to P1 scenario ${P1_SCENARIO_ID}`);
  const recordId = repairString(input.content_item_record_id, "content_item_record_id", 32);
  const allowlist = Array.isArray(lease.contract.allowed_content_item_record_ids) ? lease.contract.allowed_content_item_record_ids : [];
  if (!allowlist.includes(recordId)) throw new HttpError(403, `Content Item ${recordId} is outside this test_run_id allowlist`);
  if ((lease.contract.deny_fixture_record_ids || []).includes(recordId)) throw new HttpError(403, `Content Item ${recordId} is an explicit denial fixture`);

  const target = await repairVerifyContentItemRecord(env, recordId, lease.test_run_id);
  if (!repairP1Eligibility(target?.fields || {})) throw new HttpError(409, `Content Item ${recordId} does not satisfy the P1 package eligibility contract`);

  const beforeState = await phase6ScenarioState(env, P1_SCENARIO_ID);
  if (beforeState.isActive) throw new HttpError(409, "P1 must be OFF before Test Mode selector pulse");
  const originalScheduling = JSON.stringify(beforeState?.scenario?.scheduling || {});
  const scheduling = beforeState?.scenario?.scheduling || {};
  if (String(scheduling.type || "") !== "indefinitely" || Number(scheduling.interval || 0) !== 900) {
    throw new HttpError(409, `P1 canonical 15-minute schedule is not present: ${originalScheduling}`);
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


function repairItem7CanonicalMaxRecords(scenarioId) {
  const sid = Number(scenarioId);
  if (sid === 5557966) return "10";
  if (sid === 5565333) return "5";
  if (sid === 5576363) return "10";
  return "1";
}

// ITEM7_EXACT_STAGE_TEST_MODE_V1_BEGIN
const ITEM7_EXACT_STAGE_CONFIG = Object.freeze({
  5569495: Object.freeze({ stage: "R2", max_cycles: 1, wait_ms_per_cycle: 90000 }),
  5557966: Object.freeze({ stage: "R3", max_cycles: 1, wait_ms_per_cycle: 90000 }),
  5565333: Object.freeze({ stage: "R5", max_cycles: 5, wait_ms_per_cycle: 18000 }),
  5576363: Object.freeze({ stage: "RR1", max_cycles: 1, wait_ms_per_cycle: 90000 }),
});

function repairItem7StageCheckpoint(scenarioId, fields = {}) {
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

async function repairReadItem7Output(env, recordId, testRunId) {
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId);
  if (!record?.id) throw new HttpError(404, `Platform Output ${recordId} not found`);
  const fields = record.fields || {};
  if (String(fields.Test_Run_ID || "").trim() !== testRunId) throw new HttpError(409, `Platform Output ${recordId} escaped Item 7 Test_Run_ID isolation`);
  if (fields.Do_Not_Publish !== true) throw new HttpError(409, `Platform Output ${recordId} must remain Do_Not_Publish=true during Item 7`);
  return record;
}

async function repairWaitItem7Checkpoint(env, scenarioId, recordId, testRunId, timeoutMs) {
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

async function repairPulseItem7ExactStage(env, lease, input, action) {
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

// ITEM7_FRESH_INVOCATION_CLEANUP_V5: cleanup is intentionally a separate request so
// a long stage pulse cannot consume the subrequest capacity needed to stop, restore,
// verify, and terminalize its own exact lease.
async function repairCleanupItem7ExactStage(env, lease, input) {
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

function item6Choice(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value.name || value.id || null;
  return value ?? null;
}

function item6Platform(fields) {
  return String(item6Choice(fields?.Platform) || "").trim();
}

function item6SnapshotFieldNames(fields) {
  const platform = item6Platform(fields);
  return [...ITEM6_REPLACE_COMMON_FIELDS, ...(ITEM6_REPLACE_PLATFORM_FIELDS[platform] || [])];
}

function item6PublicationSnapshot(record) {
  const fields = record?.fields || {};
  const names = item6SnapshotFieldNames(fields);
  const values = {};
  for (const name of names) values[name] = Object.prototype.hasOwnProperty.call(fields, name) ? fields[name] : null;
  return { schema: "ITEM6_LAST_GOOD_V1", record_id: record.id, platform: item6Platform(fields), captured_at: new Date().toISOString(), fields: values };
}

function item6ParseSnapshot(value, recordId) {
  let snapshot;
  try { snapshot = typeof value === "string" ? JSON.parse(value) : value; } catch { snapshot = null; }
  if (!snapshot || snapshot.schema !== "ITEM6_LAST_GOOD_V1" || snapshot.record_id !== recordId || !snapshot.fields || typeof snapshot.fields !== "object") {
    throw new HttpError(409, `Platform Output ${recordId} does not have a valid Item 6 last-good snapshot`);
  }
  return snapshot;
}

function item6Identity(fields) {
  const platform = item6Platform(fields);
  const first = (...values) => values.map(v => String(v || "").trim()).find(Boolean) || null;
  if (platform === "Instagram") return first(fields.Platform_Post_ID, fields.IG_Carousel_Published_Media_ID, fields.IG_Story_Post_ID, fields.Platform_Post_URL);
  if (platform === "Facebook") return first(fields.Platform_Post_ID, fields.FB_Slideshow_Meta_Video_ID, fields.Platform_Post_URL);
  if (platform === "TikTok") return first(fields.Platform_Post_ID, fields.Manual_Published_URL, fields.TikTok_Draft_Public_Post_IDs_JSON, fields.Platform_Post_URL);
  if (platform === "YouTube") return first(fields.YouTube_Video_ID, fields.Platform_Post_ID, fields.Platform_Post_URL);
  return first(fields.Platform_Post_ID, fields.Platform_Post_URL);
}

function item6IdentityFromSnapshot(snapshot) {
  return item6Identity({ Platform: snapshot.platform, ...(snapshot.fields || {}) });
}

function item6SafeJson(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

async function item6LoadAllowedOutput(env, lease, input) {
  const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
  if (!lease.contract.allowed_platform_output_record_ids.includes(recordId)) throw new HttpError(403, `Platform Output ${recordId} is outside this test_run_id allowlist`);
  await repairVerifyOutputRecord(env, recordId, lease.contract.allow_public_publish === true, lease.contract.test_run_id);
  const record = await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId);
  if (!record?.id) throw new HttpError(404, `Platform Output ${recordId} not found`);
  return record;
}

async function item6PatchOutput(env, recordId, fields) {
  return airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID, recordId, { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) });
}

function item6PrepareResetPatch(record, transactionId, fingerprint) {
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

function item6ObsoleteInventory(snapshot) {
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

async function item6ReplaceControlAction(env, action, lease, input) {
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
}
// ITEM6_REPLACE_TRANSACTION_V1_END

// ITEM7_STANDALONE_SELECTOR_RECOVERY_V6: safety-only recovery for an exact selector
// stranded by a failed Item 7 pulse. This path intentionally does not load or consume
// a lease and can never activate/run a Make scenario.
async function repairRecoverItem7ExactSelector(env, input) {
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

async function repairControlAction(env, input) {
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
    if (observedScheduling?.type !== "indefinitely" || Number(observedScheduling?.interval || 0) !== 900) {
      throw new HttpError(409, `R4 canonical 15-minute schedule is not present: ${JSON.stringify(observedScheduling)}`);
    }
    let stop = null;
    let failure = null;
    try {
      await phase6SetScenarioActive(env, lease.scenario_id, true);
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


async function repairSha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function repairMakeAdminFindModule19(blueprint) {
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

async function repairMakeAdminModule19(env) {
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


function repairInspectorClone(value, depth = 0) {
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



function repairProbeModuleIndex(blueprint) {
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

async function repairProbeMakeStartScenarioSchema(env) {
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

async function repairListMakeScenariosCompact(env) {
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

async function repairInspectMakeScenarioModules(env, scenarioId, requestedIds) {
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


function repairR4FindModule(blueprint, moduleId) {
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

function repairR4ModuleMap(blueprint) {
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

async function repairR4TokenSelector(env) {
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

async function repairR4ExactOutputEntry(env) {
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


async function repairInspectMakeBlueprintHistory(env, scenarioId, moduleId) {
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


async function repairInspectMakeExecution(env, scenarioId, executionId) {
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

async function adminRepairControlStatus(request, env) {
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

async function adminRepairControl(request, env, authorization) {
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

async function adminMakeDeployPage(request, env, authorization) {
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function adminMakeDeploy(request, env, authorization) {
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

// STUDIO_MANUAL_IDEA_GENERATOR_V1
// Manual/on-demand Idea generation reuses canonical I1, but temporarily scopes
// Module 2 to exactly one Content Profile while I1 is inactive. The original
// blueprint and OFF state are restored after admission so scheduled operation
// remains unchanged and unrelated profiles cannot be consumed by a manual run.
const STUDIO_IDEA_I1_SCENARIO_ID = 5514334;
const STUDIO_IDEA_PROFILE_TABLE_ID = "tblNYg2QB0BmmVACy";
const STUDIO_IDEA_BATCH_TABLE_ID = "tblpCKSqcTpDtyst3";
const STUDIO_IDEA_MIN_COUNT = 1;
const STUDIO_IDEA_MAX_COUNT = 10;
const STUDIO_IDEA_ALLOWED_QUALITIES = new Set(["Highest Quality", "Balanced", "Quantity"]);

function studioIdeaBatchRecordIdFromPath(url) {
  const match = /^\/api\/ideas\/generate\/(rec[A-Za-z0-9]+)$/.exec(url.pathname);
  if (!match) throw new HttpError(400, "Invalid idea-generation batch path");
  return match[1];
}

function studioIdeaBatchView(record) {
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

async function studioIdeaEnabledProfile(env) {
  const formula = 'AND({Active}=1,{Idea_Generation_Enabled}=1)';
  const query = `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=2`;
  const body = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, query);
  const records = Array.isArray(body?.records) ? body.records : [];
  if (!records.length) throw new HttpError(409, "No active idea-generation profile is configured");
  if (records.length > 1) {
    throw new HttpError(409, "More than one idea-generation profile is active. Selectable profiles must be added before manual generation can run safely.");
  }
  const profile = records[0];
  const existingBatch = Array.isArray(f(profile, "Manual_Idea_Batch")) ? f(profile, "Manual_Idea_Batch") : [];
  if (existingBatch.length) throw new HttpError(409, "Another manual idea batch is already starting. Try again after it finishes.");
  return profile;
}

async function studioIdeaCreateBatch(env, profile, count, quality, authorization) {
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

async function studioIdeaUpdateBatch(env, recordId, fields) {
  return airtableFetch(env, STUDIO_IDEA_BATCH_TABLE_ID, recordId, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}

async function studioIdeaSetProfileOverrides(env, profileId, batchRecordId, count, quality) {
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

async function studioIdeaClearProfileOverrides(env, profileId) {
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

function studioIdeaUnwrapBlueprint(body) {
  const value = body?.blueprint ?? body?.response?.blueprint ?? body;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === "object" ? value : null;
}

async function studioIdeaReadI1Blueprint(env) {
  const body = await phase6MakeApiJson(env, `/scenarios/${STUDIO_IDEA_I1_SCENARIO_ID}/blueprint?draft=false`, { method: "GET" });
  const blueprint = studioIdeaUnwrapBlueprint(body);
  if (!blueprint?.flow) throw new HttpError(502, "I1 did not return a usable live blueprint");
  return blueprint;
}

async function studioIdeaWriteI1Blueprint(env, blueprint) {
  await phase6MakeApiJson(env, `/scenarios/${STUDIO_IDEA_I1_SCENARIO_ID}?confirmed=true`, {
    method: "PATCH",
    body: JSON.stringify({ blueprint: JSON.stringify(blueprint) }),
  });
}

async function studioIdeaInstallExactProfileSelector(env, profileId) {
  const original = await studioIdeaReadI1Blueprint(env);
  const patched = JSON.parse(JSON.stringify(original));
  const module2 = phase6FindModule(patched.flow, 2);
  if (!module2 || module2.module !== "airtable:ActionSearchRecords") {
    throw new HttpError(409, "I1 Module 2 profile selector contract has drifted");
  }
  module2.mapper = module2.mapper || {};
  module2.mapper.formula = `AND(RECORD_ID()="${String(profileId).replace(/"/g, "")}",{Active}=1,{Idea_Generation_Enabled}=1)`;
  module2.mapper.maxRecords = "1";
  await studioIdeaWriteI1Blueprint(env, patched);
  const verified = await studioIdeaReadI1Blueprint(env);
  const verified2 = phase6FindModule(verified.flow, 2);
  if (String(verified2?.mapper?.formula || "") !== module2.mapper.formula || String(verified2?.mapper?.maxRecords || "") !== "1") {
    throw new HttpError(502, "I1 exact-profile selector verification failed");
  }
  return original;
}

async function studioIdeaExecuteBatch(env, profile, batchRecord) {
  let originalBlueprint = null;
  let started = false;
  const startedAt = new Date().toISOString();
  try {
    await studioIdeaUpdateBatch(env, batchRecord.id, { Status: "Running", Started_At: startedAt, Error: null });
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

    // Leave the exact selector and manual overrides in place long enough for the
    // Make execution to consume Module 2, then restore the production blueprint
    // and OFF state in finally.
    await new Promise((resolve) => setTimeout(resolve, 6500));
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

async function startStudioIdeaGeneration(request, env, authorization, ctx = null) {
  let payload;
  try { payload = await request.json(); } catch { throw new HttpError(400, "Request body must be valid JSON"); }
  const count = Number(payload?.count);
  const quality = String(payload?.quality || "Highest Quality").trim();
  if (!Number.isInteger(count) || count < STUDIO_IDEA_MIN_COUNT || count > STUDIO_IDEA_MAX_COUNT) throw new HttpError(400, "Idea count must be a whole number from 1 to 10");
  if (!STUDIO_IDEA_ALLOWED_QUALITIES.has(quality)) throw new HttpError(400, "Quality must be Highest Quality, Balanced, or Quantity");

  const scenario = await phase6ScenarioState(env, STUDIO_IDEA_I1_SCENARIO_ID);
  if (scenario?.isActive) {
    throw new HttpError(409, "The scheduled idea generator is currently active. Try manual generation after that run finishes.");
  }
  const profile = await studioIdeaEnabledProfile(env);
  const batch = await studioIdeaCreateBatch(env, profile, count, quality, authorization);
  try {
    await studioIdeaSetProfileOverrides(env, profile.id, batch.id, count, quality);
  } catch (error) {
    await studioIdeaUpdateBatch(env, batch.id, { Status: "Failed", Completed_At: new Date().toISOString(), Error: String(error?.message || error).slice(0, 10000) });
    throw error;
  }

  const task = studioIdeaExecuteBatch(env, profile, batch).catch((error) => console.error("Manual idea generation background task failed", error));
  if (ctx?.waitUntil) ctx.waitUntil(task); else await task;

  return respond(request, env, {
    ok: true,
    accepted: true,
    batch_record_id: batch.id,
    batch_id: String(f(batch, "Batch_ID") || ""),
    requested_count: count,
    quality,
    status: "Pending",
    message: "Idea generation started.",
  }, 202);
}

async function studioIdeaGenerationStatus(request, env, url) {
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
}
// STUDIO_MANUAL_IDEA_GENERATOR_V1_END

