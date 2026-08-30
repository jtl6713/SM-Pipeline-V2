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
