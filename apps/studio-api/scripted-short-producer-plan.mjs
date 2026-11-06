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


/**
 * Strict, human-authored Script a Short requirements. The AI writer is never
 * permitted to silently reduce a named all-clips list, discard exact VO, or
 * shorten an explicitly bounded duration.
 */
export function scriptedShortBriefRequirements(brief) {
  const source = normalizeScriptedShortBrief(brief);
  const footage = source.match(/(?:^|\n)\s*mandatory footage instructions\s*([\s\S]*?)(?=\n\s*exact voiceover script\b|\n\s*video editing instructions\b|$)/i)?.[1] || "";
  const allNamed = /\b(?:use|include|show)\s+(?:all|every)\b/i.test(footage);
  const names = [];
  if (allNamed) {
    for (const line of footage.split("\n")) {
      const match = /^\s*[-*•]\s+(?:\*\*)?([^\n*]+?\s+\d+)(?:\*\*)?\s*$/.exec(line);
      if (!match) continue;
      const name = match[1].trim();
      if (!names.some((previous) => previous.toLowerCase() === name.toLowerCase())) names.push(name);
    }
  }
  const match = source.match(/\b(?:duration\s*:\s*(?:target\s*)?|(?:create|make)\s+(?:a|an)\s+(?:captivating\s+)?)(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*(?:-second|seconds?)\b/i);
  const min = match ? Number(match[1]) : null;
  const max = match ? Number(match[2]) : null;
  const duration = min !== null && min >= 5 && max >= min && max <= 180 ? { min, max } : null;
  const scriptMatch = source.match(/(?:^|\n)\s*(?:exact|verbatim)\s+(?:voiceover|narration)\s+script\s*\n([\s\S]*?)(?=\n\s*(?:video editing instructions|required on-screen text|thumbnail instructions|required caption|production validation)\b|$)/i);
  const exactScript = scriptMatch
    ? scriptMatch[1].trim().replace(/^["“]\s*/, "").replace(/\s*["”]$/, "").replace(/\s+/g, " ").trim()
    : "";
  return { required_clips: names, duration, exact_script: exactScript };
}

const briefWords = (value) => String(value || "").trim().split(/\s+/).filter(Boolean).length;
const compactBrief = (value) => String(value || "").replace(/\s+/g, " ").trim();
const mediaLabel = (row) => String(row?.name || row?.asset_name || row?.filename || "").trim();
const mediaId = (row) => String(row?.id || row?.media_asset_record_id || "").trim();

/** Return exact, correctly ordered scenes; never synthesize or authorize assets. */
export function scriptedShortExactScenes(brief, catalog) {
  const requirements = scriptedShortBriefRequirements(brief);
  if (!requirements.required_clips.length || !requirements.exact_script) return null;
  const rows = Array.isArray(catalog) ? catalog : [];
  const assets = requirements.required_clips.map((name) =>
    rows.find((row) => mediaLabel(row).toLowerCase() === name.toLowerCase() && mediaId(row)));
  const missing = requirements.required_clips.filter((_, index) => !assets[index]);
  if (missing.length) throw new Error("Required uploaded clips missing from eligible profile library: " + missing.join(", "));
  let chunks = String(brief)
    .match(/(?:^|\n)\s*(?:exact|verbatim)\s+(?:voiceover|narration)\s+script\s*\n([\s\S]*?)(?=\n\s*(?:video editing instructions|required on-screen text|thumbnail instructions|required caption|production validation)\b|$)/i)?.[1]
    ?.trim().replace(/^["“]\s*/, "").replace(/\s*["”]$/, "")
    .split(/\n\s*\n/).map(compactBrief).filter(Boolean) || [];
  if (chunks.length < assets.length) {
    chunks = requirements.exact_script.split(/(?<=[.!?])\s+/).map(compactBrief).filter(Boolean);
  }
  if (chunks.length < assets.length) throw new Error("Exact voiceover cannot be allocated across every required clip without rewriting the script.");
  // Merge the shortest adjacent beats until each named source has one scene.
  while (chunks.length > assets.length) {
    let best = 0, least = Infinity;
    for (let i = 0; i < chunks.length - 1; i++) {
      const weight = briefWords(chunks[i]) + briefWords(chunks[i + 1]);
      if (weight < least) { best = i; least = weight; }
    }
    chunks.splice(best, 2, chunks[best] + " " + chunks[best + 1]);
  }
  return assets.map((asset, index) => ({
    voiceover_text: chunks[index],
    suggested_visual: mediaLabel(asset),
    media_asset_id: mediaId(asset),
    asset_id: mediaId(asset),
    shot_status: "owned",
    media_type: asset.media_type || asset.mime_type || "video/mp4",
    source_duration_seconds: Number(asset.duration_seconds || asset.source_duration_seconds || 0) || null,
  }));
}

/** Retiming preserves all narration and assigned sources; it cannot invent media. */
export function scriptedShortHonorDuration(timeline, brief) {
  const requirement = scriptedShortBriefRequirements(brief).duration;
  if (!requirement) return timeline;
  const rows = Array.isArray(timeline?.segments) ? timeline.segments : [];
  if (!rows.length) return timeline;
  const total = Number(timeline?.duration_seconds) || rows.reduce((n, row) => n + Number(row.duration_seconds || 0), 0);
  if (total >= requirement.min && total <= requirement.max) return timeline;
  const target = Math.round((requirement.min + requirement.max) / 2);
  const durationSum = rows.reduce((n, row) => n + Math.max(0.5, Number(row.duration_seconds) || 0), 0);
  let cursor = 0;
  const segments = rows.map((row, index) => {
    const duration = index === rows.length - 1
      ? Math.round((target - cursor) * 1000) / 1000
      : Math.round((Math.max(0.5, Number(row.duration_seconds) || 0) / durationSum * target) * 1000) / 1000;
    const start = Math.round(cursor * 1000) / 1000;
    const end = Math.round((cursor + duration) * 1000) / 1000;
    cursor = end;
    return { ...row, index: index + 1, start_seconds: start, end_seconds: end, duration_seconds: duration };
  });
  return { ...timeline, segments, duration_seconds: target };
}

/** Accept must reject stale or browser-edited proposals before any Airtable writes. */
export function scriptedShortCheckBriefRequirements(brief, timeline, catalog) {
  const req = scriptedShortBriefRequirements(brief);
  const errors = [];
  const scenes = Array.isArray(timeline?.segments) ? timeline.segments : [];
  if (req.required_clips.length) {
    const byId = new Map((catalog || []).map((row) => [mediaId(row), mediaLabel(row).toLowerCase()]));
    const picked = scenes.map((scene) => byId.get(String(scene.asset_id || scene.media_asset_id || "")) || "");
    const expected = req.required_clips.map((name) => name.toLowerCase());
    if (picked.length !== expected.length || picked.some((name, i) => name !== expected[i])) {
      errors.push("The proposal does not contain every required uploaded clip in order.");
    }
  }
  if (req.exact_script && compactBrief(scenes.map((row) => row.voiceover_text || "").join(" ")) !== compactBrief(req.exact_script)) {
    errors.push("The proposal truncated or changed the exact voiceover.");
  }
  if (req.duration) {
    const seconds = Number(timeline?.duration_seconds);
    if (!(seconds >= req.duration.min && seconds <= req.duration.max)) {
      errors.push("The proposal duration violates the requested " + req.duration.min + "–" + req.duration.max + "-second range.");
    }
  }
  return { ok: !errors.length, errors, requirements: req };
}
