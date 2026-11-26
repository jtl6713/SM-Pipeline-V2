// #3094: atomically persist the existing EZ photo-wait approval and settings.
// This is Idea-level acceptance, never Factory approval or publishing authority.
import { productionModeCaptureEnabled } from "./production-mode-capture.mjs";
import { productionModeRoutingEnabled } from "./manual-production-list.mjs";
import { editorGuardEnabled, assertEditorGuardReady } from "./production-editor-boundary.mjs";
import { ideaProductionConfigFields } from "./idea-photo-wait.mjs";

export function automaticPhotoWaitCreateEnabled(env, authorization) {
  const p = authorization?.permissions;
  return productionModeCaptureEnabled(env) && productionModeRoutingEnabled(env) &&
    editorGuardEnabled(env) && p?.ideas_create === true &&
    p?.ideas_promote === true && p?.production_configure === true;
}

// Existing Ideas need promotion/configuration authority, not create authority.
export function automaticPhotoWaitExistingEnabled(env, authorization) {
  const p = authorization?.permissions;
  return productionModeCaptureEnabled(env) && productionModeRoutingEnabled(env) &&
    editorGuardEnabled(env) && p?.ideas_promote === true && p?.production_configure === true;
}

export function assertAutomaticPhotoWaitExisting(env, authorization, record, marker, payload) {
  if (!automaticPhotoWaitExistingEnabled(env, authorization))
    throw new Error("Automatic existing-Idea photo wait is unavailable");
  assertEditorGuardReady(env);
  const fields = record?.fields || {};
  const profile = marker?.profile_id;
  if (!marker || Object.keys(marker).length !== 1 || !/^rec[A-Za-z0-9]{14}$/.test(profile || "") ||
      !/^rec[A-Za-z0-9]{14}$/.test(record?.id || "") ||
      !Array.isArray(fields.Content_Profile) || fields.Content_Profile.length !== 1 ||
      fields.Content_Profile[0] !== profile || fields.Studio_Production_Mode !== "automatic" ||
      fields.Studio_Production_Source !== "idea" || String(fields.Test_Run_ID || "").trim() ||
      !["Generated","Approved"].includes(fields.Candidate_Status) ||
      fields.Promoted_Content_Record_ID || (fields["Content Items"] || []).length)
    throw new Error("Exact existing automatic Idea and profile could not be verified");
  if (payload?.photo_wait !== true || payload.carousel_slide_count_mode !== "Target range" ||
      payload.carousel_image_mode !== "Wait for matching photos" ||
      !Number.isInteger(payload.carousel_slide_count_min) || !Number.isInteger(payload.carousel_slide_count_max) ||
      payload.carousel_slide_count_min < 1 || payload.carousel_slide_count_max > 20 ||
      payload.carousel_slide_count_min > payload.carousel_slide_count_max ||
      !photoTypes.has(payload.content_type) || !Array.isArray(payload.platforms) || !payload.platforms.length)
    throw new Error("Valid explicit photo-wait settings required");
}

const allowedKeys = new Set(["approve_idea","content_type","platforms",
  "include_voiceover","include_background_music","include_thumbnail",
  "carousel_slide_count_min","carousel_slide_count_max"]);
const photoTypes = new Set(["Vertical Short Video","Photo Set","Carousel","Feed Post"]);
export function automaticPhotoWaitCreateFields(env, authorization, config, {
  source, mode, inputKind, now = new Date().toISOString(),
} = {}) {
  if (!automaticPhotoWaitCreateEnabled(env, authorization))
    throw new Error("Automatic photo-wait Idea creation is not available");
  assertEditorGuardReady(env);
  if (source !== "idea" || mode !== "automatic" || inputKind !== "multiple-photos")
    throw new Error("Photo-wait creation requires an ordinary automatic photo Idea");
  if (!config || typeof config !== "object" || Array.isArray(config) ||
      Object.keys(config).some(key => !allowedKeys.has(key)) || config.approve_idea !== true)
    throw new Error("Explicit Idea-level photo-wait approval and valid settings are required");
  if (!photoTypes.has(config.content_type) || !Array.isArray(config.platforms) || !config.platforms.length)
    throw new Error("Choose a supported photo-wait content type and platforms");
  const min = config.carousel_slide_count_min, max = config.carousel_slide_count_max;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 20 || min > max)
    throw new Error("Invalid photo-wait range");
  const fields = ideaProductionConfigFields({
    ...config, save_production_config: true,
    carousel_slide_count: max, carousel_slide_count_mode: "Target range",
    carousel_image_mode: "Wait for matching photos",
  });
  if (!fields.Production_Target_Platforms?.length) throw new Error("Choose target platforms");
  return {
    ...fields, Candidate_Status: "Approved", Approved_At: now,
    Studio_Photo_Wait_Status: "Waiting",
  };
}
