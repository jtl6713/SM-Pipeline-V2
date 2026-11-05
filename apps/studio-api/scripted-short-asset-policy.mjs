/**
 * QA-ASSET-LOCATION-MISMATCH: strict, location-aware media selection for scripted shorts.
 *
 * Pure functions shared by the Proposal Engine and its independent Quality Agent
 * preflight. Never silently cross a place/profile boundary to fill a scene.
 * Drive remains the media authority; these helpers do not mutate media records.
 */
export const ASSET_LOCATION_SIGNATURE = "QA-ASSET-LOCATION-MISMATCH";

const clean = (value) => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[_/\\-]+/g, " ")
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function extractPlace(value) {
  return clean(value)
    .replace(/^(?:the|my|our|those|these|existing|uploaded|available|library|local|all|only)\s+/g, "")
    .replace(/\s+(?:area|neighborhood|district)$/g, "")
    .trim();
}

/**
 * "Utilize the battery park images that are uploaded into the system" is a
 * requirement, not a generic suggestion. Deliberately require an asset-use
 * verb and asset noun to avoid treating any place merely mentioned as a lock.
 */
export function parseScriptedShortAssetPolicy(prompt) {
  const source = String(prompt || "").replace(/\s+/g, " ").trim();
  const commands = [
    // Parse coordinated media nouns before the named-place form. Otherwise
    // "clips and stills from ..." can be mistaken for a place called "clips and".
    /(?<![\w-])(?:use|utilize|feature|select|include|using|draw from)\s+(?:(?:only|exclusively|the|my|our|those|these|existing|uploaded|available|library|all)\s+)*(?:images?|photographs?|photos?|pictures?|assets?|videos?|footage|clips?|stills?)(?:\s*(?:,|and|&)\s*(?:images?|photographs?|photos?|pictures?|assets?|videos?|footage|clips?|stills?))*\s+(?:of|from|showing|depicting)\s+([a-z0-9][a-z0-9 '’&/-]{1,80}?)(?=[.,;!?]|$|\s+(?:in|that|which|already|uploaded)\b)/i,
    /(?<![\w-])(?:use|utilize|feature|select|include|using|draw from)\s+(?:(?:only|exclusively|the|my|our|those|these|existing|uploaded|available|library|all)\s+)*([a-z0-9][a-z0-9 '’&.,/-]{1,90}?)\s+(?:images?|photographs?|photos?|pictures?|assets?|videos?|footage|clips?|stills?)\b/i,
    /(?<![\w-])(?:use|utilize|feature|select|include|using)\s+(?:(?:only|exclusively|the|my|our|uploaded|library)\s+)*(?:images?|photos?|assets?|videos?|footage|clips?|stills?)\s+(?:of|from|showing|depicting)\s+([a-z0-9][a-z0-9 '’&/-]{1,80}?)(?=[.,;]|$|\s+(?:that|which|already|uploaded|in the library))/i,
  ];
  let location = "";
  for (const expression of commands) {
    const match = expression.exec(source);
    if (!match) continue;
    location = extractPlace(match[1]);
    if (location) break;
  }
  // A creative direction like "use a wide variety of relevant library assets" is
  // not a named-place upload requirement. Reject descriptive quantities and
  // quality adjectives before treating a parsed phrase as an asset location.
  if (/^(?:(?:a|an|the)\s+)?(?:wide|broad|good|great|large|diverse|varied|rich|relevant|available|variety|selection|mix|range|number|collection|assortment)\b/i.test(location) ||
      /\b(?:variety|selection|mix|range|assortment|number|relevant|library|uploaded|available)\b/i.test(location)) {
    location = "";
  }
  // Non-geographic "use uploaded images" must not become a bogus place lock.
  const generic = new Set(["uploaded", "existing", "library", "available", "stock", "own", "same", "selected", "these", "those", "all", "more", "new"]);
  const words = location.split(" ");
  if (words.length > 8 || words.every((word) => generic.has(word)) || location.length < 3) location = "";
  // Prefer a clearly named title subject before inferring a broad "story of..."
  // phrase, which may describe a whole sentence rather than an asset label.
  let topic = location;
  if (!topic) {
    const titled = source.match(/\btitled\s+(?:\*\*|["'“])?([a-z][a-z0-9 '&/-]{2,60}?)(?=\s*:|["'”]|\*\*|[.,;]|$)/i);
    if (titled) topic = extractPlace(titled[1]);
  }
  if (!topic) {
    const topicMatch = source.match(/\b(?:about|featuring|covering|guide to|history of|story of)\s+(?:the\s+)?([a-z0-9][a-z0-9 '’&/-]{2,80}?)(?=[.,;!?]|$|\s+(?:using|use|start|include|show|explain|narrat|produce|for\s+(?:instagram|facebook|tiktok|youtube))\b)/i);
    topic = extractPlace(topicMatch?.[1] || "");
    const topicWords = topic.split(" ");
    if (topicWords.length > 10 || topicWords.every((word) => generic.has(word)) || topic.length < 3) topic = "";
  }
  return {
    required: Boolean(location),
    location: location || null,
    subject: topic || null,
    requires_uploaded_assets: Boolean(location),
    signature: ASSET_LOCATION_SIGNATURE,
    mode: location ? "required_library_location" : (topic ? "required_topic_match" : "prefer_relevant_library"),
  };
}

function placeAliases(location) {
  const canonical = clean(location);
  if (!canonical) return [];
  const values = [canonical];
  // Battery Park and Battery Park City commonly share uploaded-media labels.
  if (canonical === "battery park city") values.push("battery park");
  if (canonical === "battery park") values.push("battery park city");
  return [...new Set(values)];
}

function containsPlace(value, place) {
  const padded = " " + clean(value) + " ";
  return placeAliases(place).some((candidate) => padded.includes(" " + candidate + " "));
}

function linkedProfile(row) {
  const raw = row?.profile_id ?? row?.fields?.Content_Profile ?? row?.Content_Profile;
  if (Array.isArray(raw)) return String(raw[0]?.id || raw[0] || "").trim();
  return String(raw?.id || raw || "").trim();
}

export function libraryAssetSatisfiesPolicy(row, policy, profileId = "") {
  if (!row || !String(row.id || "").trim()) return false;
  const owner = linkedProfile(row);
  if (profileId && owner && owner !== String(profileId)) return false;
  const target = policy?.subject || policy?.location || "";
  if (!target) return true;
  return Boolean(target && [
    row.name, row.location, row.topic, row.description,
    row?.fields?.["Asset Name"], row?.fields?.Location,
    row?.fields?.Topic, row?.fields?.Asset_Description,
  ].some((value) => containsPlace(value, target)));
}

/**
 * An independent Quality Agent guard. A model-selected ID alone never proves
 * that a scene satisfies an explicit media constraint.
 */
export function validateScriptedShortAssets(timeline, catalog, policy, profileId = "") {
  const byId = new Map((catalog || []).map((row) => [String(row?.id || ""), row]));
  const mismatches = [];
  const segments = Array.isArray(timeline?.segments) ? timeline.segments : [];
  let verified = 0;
  let unassigned = 0;
  segments.forEach((scene, index) => {
    const id = String(scene?.asset_id || scene?.media_asset_id || "").trim();
    if (!id) { unassigned++; return; }
    const asset = byId.get(id);
    if (!asset || !libraryAssetSatisfiesPolicy(asset, policy, profileId)) {
      mismatches.push({ scene: index + 1, asset_id: id, signature: ASSET_LOCATION_SIGNATURE });
    } else {
      verified++;
    }
  });
  return {
    signature: ASSET_LOCATION_SIGNATURE,
    ok: mismatches.length === 0,
    verified,
    unassigned,
    mismatches,
    required_location: policy?.required ? policy.location : null,
    required_subject: policy?.subject || policy?.location || null,
  };
}

/**
 * Bounded and deterministic auto-repair: replace an invalid scene with an
 * unused, validated library file; otherwise unassign it, never fabricate a
 * match. Keep narration and scene order. No write, publish, or profile change.
 */
export function recoverScriptedShortAssets(timeline, catalog, policy, profileId = "") {
  const eligible = (catalog || []).filter((row) =>
    libraryAssetSatisfiesPolicy(row, policy, profileId));
  const byId = new Map(eligible.map((row) => [String(row.id), row]));
  const segments = Array.isArray(timeline?.segments) ? timeline.segments : [];
  // Preserve all already-valid scene assignments before choosing repairs.
  // Otherwise an earlier mismatch could steal the asset of a later scene.
  const used = new Set(segments.map((scene) => String(scene?.asset_id || scene?.media_asset_id || "").trim())
    .filter((id) => byId.has(id)));
  let recovered = 0;
  let unresolved = 0;
  const fixed = segments.map((scene) => {
    const id = String(scene?.asset_id || scene?.media_asset_id || "").trim();
    if (id && byId.has(id)) { used.add(id); return { ...scene }; }
    if (!id) return { ...scene };
    recovered++;
    const replacement = eligible.find((row) => !used.has(String(row.id)));
    if (replacement) {
      used.add(String(replacement.id));
      return {
        ...scene, asset_id: String(replacement.id), media_asset_id: String(replacement.id),
        suggested_visual: String(replacement.name || scene.suggested_visual || ""),
        shot_status: "owned",
      };
    }
    unresolved++;
    return {
      ...scene, asset_id: "", media_asset_id: "",
      shot_status: "suggestion",
      // Never leave an incorrect asset label presented as a valid library match.
      suggested_visual: policy?.required
        ? "New photo needed: " + policy.location
        : String(scene.suggested_visual || "New photo needed"),
    };
  });
  const output = { ...(timeline || {}), segments: fixed };
  return {
    timeline: output,
    recovered,
    unresolved,
    validation: validateScriptedShortAssets(output, eligible, policy, profileId),
  };
}
