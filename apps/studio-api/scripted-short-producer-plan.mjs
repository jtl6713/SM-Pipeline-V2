import { libraryAssetSatisfiesPolicy } from "./scripted-short-asset-policy.mjs";

export const SCRIPTED_SHORT_BRIEF_LIMIT = 5000;
export const SCRIPTED_SHORT_PLAN_SIGNATURE = "QA-SCRIPTED-SHORT-PRODUCER-CONSTRAINTS";

const DEFAULT_PLATFORMS = Object.freeze(["Instagram", "Facebook", "TikTok", "YouTube"]);
const PLATFORM_PATTERNS = Object.freeze([
  ["Instagram", /\b(?:instagram|ig)\b/i],
  ["Facebook", /\b(?:facebook|fb)\b/i],
  ["TikTok", /\btik\s*tok\b/i],
  ["YouTube", /\b(?:youtube|you tube)\b/i],
]);

const text = (value) => String(value || "").trim();
const compact = (value) => text(value).replace(/\s+/g, " ");

export function normalizeScriptedShortBrief(value) {
  const brief = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim();
  if (brief.length > SCRIPTED_SHORT_BRIEF_LIMIT) {
    throw new RangeError(`Creative brief must be ${SCRIPTED_SHORT_BRIEF_LIMIT.toLocaleString("en-US")} characters or fewer`);
  }
  return brief;
}

export function scriptedShortTargetPlatforms(brief, fallback = DEFAULT_PLATFORMS) {
  const source = String(brief || "");
  const requested = PLATFORM_PATTERNS.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
  return requested.length ? requested : [...fallback];
}

export function scriptedShortExclusions(brief) {
  const source = compact(brief);
  const exclusions = [];
  const patterns = [
    /\b(?:do not|don't|never|avoid|exclude)\s+([^.;!?]{2,180})/gi,
    /\bwithout\s+([^.;!?]{2,180})/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) exclusions.push(compact(match[1]).replace(/^(?:use|include|show|feature)\s+/i, ""));
  }
  return [...new Set(exclusions)].slice(0, 12);
}

function narrationDirection(brief) {
  const sentences = String(brief || "").split(/(?<=[.!?])\s+|\n+/).map(compact).filter(Boolean);
  return sentences.filter((sentence) => /\b(?:voiceover|voice over|narrat|spoken|tone|friendly|informative|upbeat)\b/i.test(sentence)).join(" ").slice(0, 800) || null;
}

function sceneAsset(catalog, id) {
  return (catalog || []).find((row) => String(row?.id || "") === String(id || "")) || null;
}

export function buildScriptedShortProducerPlan({ brief, timeline, catalog = [], assetPolicy = {}, profileId = "", profileName = "" }) {
  const original = normalizeScriptedShortBrief(brief);
  if (original.length < 3) throw new TypeError("Original creative brief is required");
  const segments = Array.isArray(timeline?.segments) ? timeline.segments : [];
  const required = new Map();
  const missingAssets = [];
  const sceneOrder = segments.map((scene, index) => {
    const sceneNumber = index + 1;
    const assetId = text(scene?.asset_id || scene?.media_asset_id);
    const asset = sceneAsset(catalog, assetId);
    const status = assetId && asset ? "verified" : "missing";
    if (asset) {
      const prior = required.get(assetId) || {
        media_asset_record_id: assetId,
        name: text(asset.name || asset?.fields?.["Asset Name"] || scene?.suggested_visual),
        media_kind: text(asset.media_kind || asset?.fields?.Media_Class).toLowerCase() || "photo",
        scene_numbers: [],
        requirement: assetPolicy?.subject || assetPolicy?.location || null,
        substitution: "operator_revision_required",
      };
      prior.scene_numbers.push(sceneNumber);
      required.set(assetId, prior);
    } else {
      const requirement = text(scene?.suggested_visual) || assetPolicy?.subject || assetPolicy?.location || "appropriate media";
      missingAssets.push({
        scene: sceneNumber,
        requirement,
        remediation: `Upload and classify ${requirement} for this profile, or choose a verified matching library asset in Production.`,
      });
    }
    return {
      scene: sceneNumber,
      visual_requirement: text(scene?.suggested_visual),
      media_asset_record_id: asset?.id || null,
      status,
    };
  });
  const duration = Math.max(5, Math.round(Number(timeline?.duration_seconds) || 0));
  const subject = assetPolicy?.subject || assetPolicy?.location || null;
  return {
    schema: "studio.producer-plan.1",
    signature: SCRIPTED_SHORT_PLAN_SIGNATURE,
    profile_id: text(profileId),
    profile_name: text(profileName) || null,
    creative_brief_source: "linked_idea.Idea_Summary",
    creative_brief_characters: original.length,
    media_requirements: [{
      source: assetPolicy?.requires_uploaded_assets ? "uploaded_library" : "profile_library",
      subject,
      required: Boolean(assetPolicy?.required || subject),
      must_match_requested_place_or_topic: Boolean(subject),
      silent_substitution_allowed: false,
    }],
    required_uploaded_assets: [...required.values()],
    narration: {
      required: true,
      mode: "exact_scene_voiceover",
      authority_field: "Requested_Script",
      direction: narrationDirection(original),
    },
    scene_order: sceneOrder,
    duration: { target_seconds: duration, authority_field: "Video_Duration_Seconds" },
    exclusions: scriptedShortExclusions(original),
    target_platforms: scriptedShortTargetPlatforms(original),
    missing_assets: missingAssets,
  };
}

export function bindScriptedShortPlanToProductionAssets(plan, assets = []) {
  const byMediaId = new Map((assets || []).map((asset) => [text(asset?.media_asset_record_id), asset]));
  return {
    ...plan,
    required_uploaded_assets: (plan?.required_uploaded_assets || []).map((required) => ({
      ...required,
      production_asset_id: text(byMediaId.get(text(required?.media_asset_record_id))?.id) || null,
    })),
    scene_order: (plan?.scene_order || []).map((scene) => ({
      ...scene,
      production_asset_id: text(byMediaId.get(text(scene?.media_asset_record_id))?.id) || null,
    })),
  };
}

export function serializeScriptedShortProducerPlan(plan) {
  return `[producer-plan]${JSON.stringify(plan)}[/producer-plan]`;
}

export function scriptedShortProducerPlanFromNotes(notes) {
  const source = String(notes || "");
  const open = source.indexOf("[producer-plan]");
  const close = source.lastIndexOf("[/producer-plan]");
  if (open < 0 || close <= open) return null;
  try { return JSON.parse(source.slice(open + 15, close)); } catch { return null; }
}

export function validateScriptedShortProductionConstraints({ plan, timeline, assets = [], profileId = "" }) {
  const errors = [];
  if (!plan || plan.schema !== "studio.producer-plan.1") {
    return { ok: false, signature: SCRIPTED_SHORT_PLAN_SIGNATURE, errors: [{ code: "PRODUCER_PLAN_MISSING" }] };
  }
  if (profileId && plan.profile_id && plan.profile_id !== profileId) errors.push({ code: "PRODUCER_PLAN_PROFILE_MISMATCH" });
  const byId = new Map((assets || []).map((asset) => [text(asset?.id), asset]));
  const byMedia = new Map((assets || []).map((asset) => [text(asset?.media_asset_record_id), asset]));
  for (const required of plan.required_uploaded_assets || []) {
    const asset = byMedia.get(text(required?.media_asset_record_id));
    if (!asset) errors.push({ code: "REQUIRED_ASSET_MISSING", asset_id: required?.media_asset_record_id, remediation: `Restore ${required?.name || "the required upload"} or revise the Producer Plan explicitly.` });
  }
  const policy = plan.media_requirements?.[0] || {};
  for (const [index, scene] of (Array.isArray(timeline?.segments) ? timeline.segments : []).entries()) {
    const asset = byId.get(text(scene?.asset_id || scene?.media_asset_id));
    if (!asset) {
      errors.push({ code: "SCENE_MEDIA_MISSING", scene: index + 1, remediation: plan.missing_assets?.find((row) => row.scene === index + 1)?.remediation || "Choose verified matching media in Production." });
      continue;
    }
    const expected = plan.scene_order?.find((row) => row.scene === index + 1)?.media_asset_record_id;
    if (expected && text(asset.media_asset_record_id) !== text(expected)) {
      errors.push({ code: "REQUIRED_ASSET_REPLACED", scene: index + 1, expected_asset_id: expected, actual_asset_id: asset.media_asset_record_id, remediation: "Restore the required upload or make an explicit Producer/Factory revision." });
    }
    if (policy.must_match_requested_place_or_topic && !libraryAssetSatisfiesPolicy({ ...asset, id: asset.media_asset_record_id || asset.id, profile_id: profileId || plan.profile_id }, { required: true, subject: policy.subject, location: policy.subject }, profileId || plan.profile_id)) {
      errors.push({ code: "MEDIA_SUBJECT_MISMATCH", scene: index + 1, remediation: `Choose media visibly labeled for ${policy.subject}.` });
    }
  }
  return { ok: errors.length === 0, signature: SCRIPTED_SHORT_PLAN_SIGNATURE, errors };
}
