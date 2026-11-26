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
