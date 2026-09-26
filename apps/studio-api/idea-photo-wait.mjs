/** Photo-wait selection for approved image ideas. Pure helpers used by tests and mirrored in worker.js. */

export const IDEA_LIBRARY_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "into", "over", "onto",
  "your", "their", "about", "then", "than", "when", "what", "where", "there",
  "here", "have", "has", "had", "are", "was", "were", "will", "can", "our",
  "idea", "photo", "photos", "image", "images", "still", "stills",
]);

export const IDEA_LIBRARY_WEAK_TOKENS = new Set([
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

export const IDEA_LIBRARY_SHORT_SUBJECTS = new Set(["cta"]);

export const IDEA_LIBRARY_NAMED_PLACES = [
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
  "venice beach", "rodeo drive", "hollywood sign",
];

export function ideaLibraryTokens(text) {
  return [...new Set(String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !IDEA_LIBRARY_STOPWORDS.has(token)))];
}

export function ideaLibraryStrongTokens(tokens) {
  return tokens.filter((token) => {
    if (IDEA_LIBRARY_WEAK_TOKENS.has(token)) return false;
    if (token.length >= 4) return true;
    return IDEA_LIBRARY_SHORT_SUBJECTS.has(token);
  });
}

export function ideaLibraryHasToken(text, token) {
  const hay = String(text || "").toLowerCase();
  const key = String(token || "").toLowerCase();
  if (!key) return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(hay);
}

export function ideaLibraryTokenForms(token) {
  const value = String(token || "").toLowerCase();
  if (!value) return [];
  const forms = new Set([value]);
  if (value.endsWith("ies") && value.length > 4) forms.add(`${value.slice(0, -3)}y`);
  else if (value.endsWith("s") && !value.endsWith("ss") && value.length >= 4) forms.add(value.slice(0, -1));
  else forms.add(`${value}s`);
  return [...forms];
}

export function ideaLibraryFieldHits(text, keys) {
  return (keys || []).filter((key) =>
    ideaLibraryTokenForms(key).some((form) => ideaLibraryHasToken(text, form))
  );
}

export function ideaLibraryNamedPlaceKeys(text) {
  const hay = String(text || "").toLowerCase();
  const keys = [];
  for (const place of IDEA_LIBRARY_NAMED_PLACES) {
    if (!hay.includes(place)) continue;
    keys.push(...ideaLibraryStrongTokens(ideaLibraryTokens(place)));
  }
  return [...new Set(keys)];
}

export function buildIdeaLibraryKeys({ primaryLocation = "", title = "", summary = "", query = "" } = {}) {
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

export function rankIdeaLibraryFields({
  location = "",
  name = "",
  haystack = "",
  placeKeys = [],
  subjectKeys = [],
  strongIdeaTokens = [],
  ideaTokens = [],
  queryTokens = [],
  today = "",
  intakeDate = "",
} = {}) {
  if (queryTokens.length && !queryTokens.some((token) => ideaLibraryHasToken(haystack, token))) {
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
  const intakeToday = Boolean(today) && String(intakeDate || "") === today;
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
  else if (strongOverlap >= 1 || haySubjectHits.length === 1) confidence = "low";

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
    score,
    confidence,
    match_reasons: reasons,
    preselected: confidence === "high",
  };
}

export const IDEA_PHOTO_WAIT_TYPES = new Set(["Carousel", "Photo Set", "Feed Post"]);

export function ideaPhotoWaitApplies(input = {}) {
  const contentType = String(input.content_type || "").trim();
  const mode = String(input.carousel_slide_count_mode || "").trim();
  const imageMode = String(input.carousel_image_mode || "").trim();
  return IDEA_PHOTO_WAIT_TYPES.has(contentType)
    && mode === "Target range"
    && imageMode !== "Make AI Generated";
}

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

export function selectMatchedPhotos({ matches, min, max, pendingBatchIds, force = false } = {}) {
  const floor = Math.max(1, Number(min) || 0);
  const cap = Math.max(floor, Number(max) || floor);
  const high = sortHighConfidenceMatches(matches);
  const pending = new Set(Array.isArray(pendingBatchIds) ? pendingBatchIds.filter(Boolean) : []);

  if (high.length < floor) {
    return {
      action: "wait",
      high_count: high.length,
      selected: [],
      reason: "below_min",
    };
  }

  if (!force) {
    const blocked = high.some((row) => row.intake_batch_id && pending.has(row.intake_batch_id));
    if (blocked) {
      return {
        action: "wait_batch",
        high_count: high.length,
        selected: [],
        reason: "intake_batch_in_progress",
      };
    }
  }

  return {
    action: "ready",
    high_count: high.length,
    selected: high.slice(0, cap),
    reason: "min_met_take_all_up_to_max",
  };
}

const IDEA_SAVE_CONTENT_TYPES = new Set([
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
const IDEA_SAVE_PLATFORMS = new Set(["Instagram", "Facebook", "TikTok", "YouTube"]);
const IDEA_SAVE_TRISTATE = new Set(["Use Profile Default", "Yes", "No"]);

function ideaSaveInt(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return Math.trunc(number);
}

export const IDEA_MACHINE_NOTE_PREFIX = /^(origin|media_asset_ids|cited_trend|cluster|ez-input)=/i;

export function parseIdeaMachineNotes(notes) {
  const machine = [];
  const user = [];
  for (const line of String(notes || "").split(/\r?\n/)) {
    if (IDEA_MACHINE_NOTE_PREFIX.test(line.trim())) machine.push(line.trim());
    else if (String(line || "").trim()) user.push(line);
  }
  return { machine, user: user.join("\n").trim() };
}

export function parseIdeaNotedMediaIds(notes) {
  const match = String(notes || "").match(/media_asset_ids=([^\n]+)/i);
  if (!match) return [];
  return [...new Set(match[1].split(/[,\s]+/).map((value) => String(value || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
}

export function ideaLibraryAssetIdsFromPayload(payload) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, "library_asset_ids")) return null;
  const raw = Array.isArray(payload.library_asset_ids) ? payload.library_asset_ids : [];
  return [...new Set(raw.map((value) => String(value || "").trim()).filter((id) => /^rec[A-Za-z0-9]+$/.test(id)))];
}

export function mergeIdeaProductionNotes(existingNotes, userNotes, libraryAssetIds) {
  const parsed = parseIdeaMachineNotes(existingNotes);
  const machine = parsed.machine.filter((line) => !/^media_asset_ids=/i.test(line));
  const ids = libraryAssetIds === null || libraryAssetIds === undefined
    ? parseIdeaNotedMediaIds(existingNotes)
    : [...libraryAssetIds];
  if (ids.length) machine.unshift(`media_asset_ids=${ids.join(",")}`);
  const user = userNotes === undefined ? parsed.user : String(userNotes || "").trim();
  return [...machine, user].filter(Boolean).join("\n").slice(0, 3000) || null;
}

/**
 * Airtable fields for the idea drawer production form.
 * Save must persist these. The drawer used to PATCH only title/summary, then
 * reload, which cleared platforms and reset slide count to 5.
 * Absent `save_production_config` keeps title-only patches unchanged.
 * Production notes never wipe origin= / media_asset_ids= machine lines.
 */
export function ideaProductionConfigFields(payload, existingNotes = "") {
  if (!payload || payload.save_production_config !== true) return {};
  const fields = {};

  if (!Array.isArray(payload.platforms)) {
    throw new Error("Target platforms must be a list");
  }
  const platforms = [...new Set(payload.platforms.map((value) => String(value || "").trim()).filter(Boolean))];
  const unsupported = platforms.filter((platform) => !IDEA_SAVE_PLATFORMS.has(platform));
  if (unsupported.length) {
    throw new Error(`Unsupported target platforms: ${unsupported.join(", ")}`);
  }
  fields.Production_Target_Platforms = platforms;

  const contentType = String(payload.content_type || "").trim();
  if (contentType) {
    if (!IDEA_SAVE_CONTENT_TYPES.has(contentType)) {
      throw new Error("Choose a valid production content type");
    }
    fields.Production_Content_Type = contentType;
  }

  const tri = (value, field, label) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    const normalized = String(value).trim();
    if (!IDEA_SAVE_TRISTATE.has(normalized)) {
      throw new Error(`${label} must be Use Profile Default, Yes, or No`);
    }
    fields[field] = normalized;
  };
  tri(payload.include_voiceover, "Production_Include_Voiceover", "Voiceover");
  tri(payload.include_background_music, "Production_Include_Background_Music", "Background music");
  tri(payload.include_thumbnail, "Production_Include_Thumbnail", "Thumbnail");

  if (payload.video_duration !== undefined && payload.video_duration !== null && String(payload.video_duration).trim() !== "") {
    fields.Production_Video_Duration = ideaSaveInt(payload.video_duration, 5, 600, "Video duration");
  }

  const clipRaw = payload.video_clip_count;
  if (clipRaw !== undefined) {
    const clipText = String(clipRaw ?? "").trim();
    if (!clipText || clipText.toLowerCase() === "auto") {
      fields.Production_Video_Clip_Count = null;
    } else {
      fields.Production_Video_Clip_Count = ideaSaveInt(clipText, 1, 60, "Video clip count");
    }
  }

  if (payload.voiceover_tail_seconds !== undefined && payload.voiceover_tail_seconds !== null && String(payload.voiceover_tail_seconds).trim() !== "") {
    const tail = Number(payload.voiceover_tail_seconds);
    if (!Number.isFinite(tail) || tail < 0 || tail > 10) {
      throw new Error("Voiceover tail must be between 0 and 10 seconds");
    }
    fields.Voiceover_Tail_Seconds = Math.round(tail * 2) / 2;
  }

  if (payload.carousel_slide_count !== undefined && payload.carousel_slide_count !== null && String(payload.carousel_slide_count).trim() !== "") {
    fields.Production_Carousel_Slide_Count = ideaSaveInt(payload.carousel_slide_count, 1, 20, "Slide count");
  }

  const slideMode = String(payload.carousel_slide_count_mode || "").trim();
  if (slideMode) {
    if (!["Exact", "Target range"].includes(slideMode)) {
      throw new Error("Slide count mode must be Exact or Target range");
    }
    fields.Production_Carousel_Slide_Count_Mode = slideMode;
  }

  if (payload.carousel_slide_count_min !== undefined && String(payload.carousel_slide_count_min ?? "").trim() !== "") {
    fields.Production_Carousel_Slide_Count_Min = ideaSaveInt(payload.carousel_slide_count_min, 1, 20, "Minimum photos");
  }
  if (payload.carousel_slide_count_max !== undefined && String(payload.carousel_slide_count_max ?? "").trim() !== "") {
    fields.Production_Carousel_Slide_Count_Max = ideaSaveInt(payload.carousel_slide_count_max, 1, 20, "Maximum photos");
  }
  if (
    fields.Production_Carousel_Slide_Count_Mode === "Target range"
    && fields.Production_Carousel_Slide_Count_Min
    && fields.Production_Carousel_Slide_Count_Max
    && fields.Production_Carousel_Slide_Count_Min > fields.Production_Carousel_Slide_Count_Max
  ) {
    throw new Error("Minimum photo count cannot exceed maximum");
  }

  const imageModeRaw = String(payload.carousel_image_mode || "").trim();
  if (imageModeRaw) {
    const imageMode = imageModeRaw === "Wait for matching photos" ? "Manual Upload" : imageModeRaw;
    if (!["Make AI Generated", "Manual Upload"].includes(imageMode)) {
      throw new Error("Image mode must be Make AI Generated, Manual Upload, or Wait for matching photos");
    }
    fields.Production_Carousel_Image_Mode = imageMode;
    if (imageModeRaw === "Wait for matching photos" && !fields.Production_Carousel_Slide_Count_Mode) {
      fields.Production_Carousel_Slide_Count_Mode = "Target range";
    }
    if (imageModeRaw === "Wait for matching photos") {
      fields.Studio_Photo_Wait_Status = "Waiting";
    } else if (imageMode === "Make AI Generated" || fields.Production_Carousel_Slide_Count_Mode === "Exact") {
      // Explicit AI/exact choices take control away from the automatic library listener.
      // AI mode also clears automatically matched library stills so requested AI quantity wins.
      fields.Studio_Photo_Wait_Status = null;
      fields.Studio_Photo_Match_JSON = null;
      if (imageMode === "Make AI Generated") {
        fields.Studio_Matched_Media_Assets = [];
      }
    }
  }

  const libraryIdsRaw = ideaLibraryAssetIdsFromPayload(payload);
  const libraryIds = imageModeRaw === "Make AI Generated" ? [] : libraryIdsRaw;
  if (libraryIds !== null) {
    fields.Studio_Matched_Media_Assets = libraryIds;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "production_notes") || libraryIds !== null) {
    const userNotes = Object.prototype.hasOwnProperty.call(payload, "production_notes")
      ? payload.production_notes
      : undefined;
    const merged = mergeIdeaProductionNotes(existingNotes, userNotes, libraryIds);
    if (merged && merged.length > 3000) throw new Error("Production notes must be 3000 characters or fewer");
    fields.Production_Config_Notes = merged;
  }

  return fields;
}
