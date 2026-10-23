/**
 * Script-a-Short / Factory Producer conversation envelope.
 * Airtable Production_Notes remains authoritative. Never silently trim notes,
 * invent a media match, dispatch a render, or treat a suggestion as approval.
 */
export const PRODUCER_THREAD_OPEN = "[studio-producer-thread]";
export const PRODUCER_THREAD_CLOSE = "[/studio-producer-thread]";
const text = value => String(value ?? "").trim();

export function readProducerThread(notes) {
  const source = String(notes ?? "");
  const start = source.indexOf(PRODUCER_THREAD_OPEN);
  if (start < 0) return {schema: "studio.producer-thread.1", revision: 0, messages: []};
  const begin = start + PRODUCER_THREAD_OPEN.length;
  const end = source.indexOf(PRODUCER_THREAD_CLOSE, begin);
  if (end < 0 || source.indexOf(PRODUCER_THREAD_OPEN, begin) !== -1) {
    throw new Error("Producer conversation record is incomplete or duplicated");
  }
  let data;
  try { data = JSON.parse(source.slice(begin, end)); }
  catch { throw new Error("Producer conversation record cannot be decoded"); }
  if (data?.schema !== "studio.producer-thread.1" ||
      !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !Array.isArray(data.messages) || data.messages.length > 100 ||
      data.messages.some(m => !["user", "producer"].includes(m.role) ||
        typeof m.content !== "string" || m.content.length > 3000)) {
    throw new Error("Producer conversation record failed schema validation");
  }
  return data;
}

function sceneNumbers(plan) {
  return (Array.isArray(plan?.scene_order) ? plan.scene_order : [])
    .map(row => Number(row?.scene))
    .filter(n => Number.isInteger(n) && n > 0 && n <= 120);
}

/**
 * Structured but conservative interpretation: scope and creative preferences
 * are suggestions, not permission to modify the Producer Plan or asset manifest.
 * Unsupported nuance is explicitly sent for Producer interpretation.
 */
export function planConversationalSceneRevision(note, plan) {
  const message = text(note);
  if (!message || message.length > 3000) throw new RangeError("Producer message must contain 1–3000 characters");
  const available = sceneNumbers(plan);
  const lower = message.toLowerCase();
  let targets = [];
  let scope = "unspecified";
  const range = /\bscenes?\s+(\d{1,3})\s*(?:through|to|-|–)\s*(\d{1,3})\b/i.exec(message);
  const single = /\bscenes?\s*(?:number\s*)?#?\s*(\d{1,3})\b/i.exec(message);
  if (range) {
    const low = Number(range[1]), high = Number(range[2]);
    if (low > high || high - low > 24 || !available.length ||
        !Array.from({length: high - low + 1}, (_, i) => low + i).every(n => available.includes(n))) {
      throw new RangeError("Requested scenes are outside the current Producer Plan");
    }
    targets = available.filter(n => n >= low && n <= high);
    scope = "explicit_range";
  } else if (single) {
    const n = Number(single[1]);
    if (!available.includes(n)) throw new RangeError("Requested scene is outside the current Producer Plan");
    targets = [n];
    scope = "explicit_scene";
  } else if (/\b(?:second|latter|last)\s+half\b|\blater\s+scenes\b/i.test(message) && available.length) {
    targets = available.slice(Math.floor(available.length / 2));
    scope = "second_half";
  } else if (/\b(?:opening|beginning|first\s+(?:few\s+)?seconds)\b/i.test(message) && available.length) {
    targets = [available[0]];
    scope = "opening";
  } else if (/\b(?:ending|closing|final\s+scene)\b/i.test(message) && available.length) {
    targets = [available[available.length - 1]];
    scope = "ending";
  }
  const preferences = {};
  if (/\b(?:sunny|sunshine|sunlit|daylight|daytime|brighter|too dark)\b/i.test(message))
    preferences.lighting = "brighter_daylight";
  if (/\b(?:nighttime|night shots|night footage|after dark)\b/i.test(message))
    preferences.lighting = "nighttime";
  if (/\b(?:more\s+(?:photos|stills|images)|additional\s+(?:photos|stills|images))\b/i.test(message))
    preferences.media_mix = "more_stills";
  if (/\b(?:more\s+(?:clips|video|motion)|add\s+(?:a\s+)?clip)\b/i.test(message))
    preferences.media_mix = "more_clips";
  if (/\b(?:faster|quicker|speed up|too slow)\b/i.test(message)) preferences.pacing = "faster";
  if (/\b(?:slower|slow down|too fast)\b/i.test(message)) preferences.pacing = "slower";
  const narration = /\b(?:voiceover|narration|script)\b/i.test(message);
  const preserveNarration = /\b(?:keep|retain|preserve|do not change|don't change)\b.{0,28}\b(?:voiceover|narration|script)\b/i.test(message);
  const requiredAssetRisk = /\b(?:remove|replace|exclude|delete)\b.{0,80}\b(?:mandatory|required|uploaded|original)\b/i.test(message);
  const changes = [
    ...(preferences.lighting ? ["visual_lighting"] : []),
    ...(preferences.media_mix ? ["media_mix"] : []),
    ...(preferences.pacing ? ["pacing"] : []),
    ...(narration && !preserveNarration ? ["narration_review"] : []),
  ];
  if (!changes.length) changes.push("creative_review");
  return {
    schema: "studio.scene-revision-proposal.1",
    target_scenes: targets,
    scene_scope: scope,
    changes,
    preferences,
    preserve: ["original_creative_brief", "profile", "required_uploaded_assets", "platform_safeguards",
      ...(preserveNarration || !narration ? ["narration"] : [])],
    requires_asset_discovery: Boolean(preferences.lighting || preferences.media_mix),
    requires_interpretation: scope === "unspecified" || changes.includes("creative_review") || requiredAssetRisk,
    required_asset_override_blocked: requiredAssetRisk,
    status: "proposed_not_executed",
    requires_quality_agent_validation: true,
    requires_human_approval: true,
    auto_publish: false,
  };
}

export function appendProducerThreadMessage(notes, input, options = {}) {
  const source = String(notes ?? "");
  const current = readProducerThread(source);
  const expectedRevision = Number(input?.expected_revision);
  const id = text(input?.message_id);
  if (!/^[a-zA-Z0-9_-]{12,96}$/.test(id)) throw new Error("A unique message id is required");
  const body = text(input?.message);
  if (!body || body.length > 3000) throw new RangeError("Producer message must contain 1–3000 characters");
  const duplicate = current.messages.find(m => m.id === id);
  if (duplicate) {
    if (duplicate.content !== body) throw new Error("Duplicate message id has different content");
    return {notes: source, thread: current, replay: true};
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision)
    throw new Error("Producer conversation has changed; reload before submitting");
  const proposal = planConversationalSceneRevision(body, options.producer_plan);
  const next = {schema: "studio.producer-thread.1", revision: current.revision + 1,
    messages: [...current.messages, {id, role: "user", content: body,
      at: text(input?.at) || new Date().toISOString(), proposal}]};
  const block = PRODUCER_THREAD_OPEN + JSON.stringify(next).replaceAll(PRODUCER_THREAD_OPEN, "\\u005bstudio-producer-thread\\u005d").replaceAll(PRODUCER_THREAD_CLOSE, "\\u005b/studio-producer-thread\\u005d") + PRODUCER_THREAD_CLOSE;
  const start = source.indexOf(PRODUCER_THREAD_OPEN);
  const end = start < 0 ? -1 : source.indexOf(PRODUCER_THREAD_CLOSE, start);
  const output = start < 0 ? [source, block].filter(Boolean).join("\n") :
    source.slice(0, start) + block + source.slice(end + PRODUCER_THREAD_CLOSE.length);
  if (output.length > 9750) throw new RangeError(
    "Production notes have reached the Airtable conversation limit; no message was discarded or saved");
  return {notes: output, thread: next, replay: false};
}

/**
 * Factory already persists its review turns in the same Airtable notes field.
 * Surface those existing immutable feedback blocks in the ongoing transcript;
 * do not copy them or alter Factory execution and approval semantics.
 */
export function producerConversationHistory(notes) {
  const source = String(notes || "");
  const thread = readProducerThread(source);
  const factory = [];
  const pattern = /\[factory-review-feedback at=([^\s\]]+) scope=([^\s\]]+) actor=([^\]]+)\]\r?\n([\s\S]*?)\r?\n\[\/factory-review-feedback\]/g;
  for (const match of source.matchAll(pattern)) {
    factory.push({
      id: "factory-feedback-" + factory.length,
      role: "user",
      at: match[1],
      source: "factory",
      content: String(match[4] || "").trim(),
    });
  }
  const messages = [...thread.messages, ...factory]
    .sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  const state = [...source.matchAll(/\[factory-producer-revision id=(fpr-[a-f0-9]+) state=([a-z_]+)\]/g)]
    .at(-1);
  return {
    ...thread,
    messages,
    factory_revision_status: state ? {id: state[1], status: state[2]} : null,
  };
}


/**
 * A Production Save may submit stale notes from an already-open form. Preserve
 * the latest durable thread from the authoritative record under the same
 * request-level lease used for POST conversation writes. No blind truncation.
 */
export function preserveProducerThreadOnEdit(authoritativeNotes, submittedNotes) {
  const current = String(authoritativeNotes ?? "");
  const submitted = String(submittedNotes ?? "");
  const start = current.indexOf(PRODUCER_THREAD_OPEN);
  if (start < 0) return submitted;
  readProducerThread(current);
  const end = current.indexOf(PRODUCER_THREAD_CLOSE, start);
  if (end < 0) throw new Error("Cannot preserve an incomplete Producer thread");
  const block = current.slice(start, end + PRODUCER_THREAD_CLOSE.length);
  const pattern = /\[studio-producer-thread\][\s\S]*?\[\/studio-producer-thread\]/g;
  const cleaned = submitted.replace(pattern, "").trim();
  if (cleaned.includes(PRODUCER_THREAD_OPEN) || cleaned.includes(PRODUCER_THREAD_CLOSE))
    throw new Error("Submitted Producer thread is incomplete or malformed");
  const combined = [cleaned, block].filter(Boolean).join("\n");
  if (combined.length > 9750)
    throw new RangeError("Production notes limit reached; changes were not saved and the Producer thread is intact");
  return combined;
}
