/**
 * ElevenLabs Image & Video API — Script a Short's optional paid video provider.
 * One provider/model is deliberately supported in this pilot. Prices are not
 * hardcoded: a recently reviewed, operator-entered credit estimate is REQUIRED
 * before a paid submission can be unlocked.
 */
export const STORY_VIDEO_MODEL = "veo-3.1-fast-generate-001";
export const STORY_VIDEO_RESOLUTION = "720p";
export const STORY_VIDEO_DURATIONS = Object.freeze([4, 6, 8]);
export const STORY_VIDEO_POLL_MIN_MS = 10_000;
export const STORY_VIDEO_MAX_BYTES = 30 * 1024 * 1024;

const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = value => String(value ?? "").trim();
const isoDay = value => /^\d{4}-\d{2}-\d{2}$/.test(clean(value)) ? clean(value) : "";
const bytesHex = bytes => Array.from(new Uint8Array(bytes)).map(n => n.toString(16).padStart(2, "0")).join("");

export function normalizeStoryVideoSettings(input = {}) {
  const prompt = clean(input.prompt).replace(/\s+/g, " ");
  if (prompt.length < 12 || prompt.length > 850) throw fail(400, "Video prompt must contain 12–850 characters");
  const duration_secs = Number(input.duration_secs ?? 8);
  if (!STORY_VIDEO_DURATIONS.includes(duration_secs)) throw fail(400, "Video duration must be 4, 6 or 8 seconds");
  const aspect_ratio = clean(input.aspect_ratio || "9:16");
  if (!["9:16", "16:9"].includes(aspect_ratio)) throw fail(400, "Video ratio must be 9:16 or 16:9");
  if (input.model_id && input.model_id !== STORY_VIDEO_MODEL) throw fail(400, "Model is not approved for the video pilot");
  return { prompt, duration_secs, aspect_ratio, model_id: STORY_VIDEO_MODEL,
    resolution: STORY_VIDEO_RESOLUTION, generate_audio: false };
}

export function videoPriceConfig(env, duration_secs, now = Date.now()) {
  const day = isoDay(env.STUDIO_ELEVENLABS_VIDEO_PRICE_REVIEWED_AT);
  const reviewed = day ? Date.parse(day + "T00:00:00Z") : NaN;
  const credits = Number(env["STUDIO_ELEVENLABS_VIDEO_CREDITS_" + duration_secs + "S_720P"]);
  const active = String(env.STUDIO_ELEVENLABS_VIDEO_ENABLED || "").toLowerCase() === "true";
  if (!active) return { enabled: false, reason: "AI video generation is disabled by administrator" };
  if (!clean(env.ELEVENLABS_API_KEY)) return { enabled: false, reason: "ElevenLabs Image & Video API key is not configured" };
  if (!Number.isFinite(reviewed) || reviewed > now || now - reviewed > 30 * 86400000) {
    return { enabled: false, reason: "AI video credit estimate requires an updated price review" };
  }
  if (!Number.isSafeInteger(credits) || credits <= 0 || credits > 500000) {
    return { enabled: false, reason: "No approved credit estimate for this clip duration" };
  }
  return { enabled: true, estimated_credits: credits, price_reviewed_at: day };
}

export async function storyVideoQuote(env, input, now = Date.now()) {
  const settings = normalizeStoryVideoSettings(input);
  const pricing = videoPriceConfig(env, settings.duration_secs, now);
  if (!pricing.enabled) return { ...settings, ...pricing, quote_id: null };
  const quoteText = [settings.model_id, settings.resolution, settings.aspect_ratio,
    settings.duration_secs, settings.generate_audio, settings.prompt,
    pricing.estimated_credits, pricing.price_reviewed_at].join("|");
  const quote_id = bytesHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(quoteText)));
  return { ...settings, ...pricing, quote_id, currency: "ElevenLabs credits",
    note: "Estimated credits, not a billing guarantee. ElevenLabs may change pricing." };
}

export function requireStoryVideoPaidApproval(quote, payload) {
  if (!quote?.enabled) throw fail(503, quote?.reason || "AI video generation is unavailable");
  if (payload?.approve_paid_generation !== true) throw fail(400, "Explicit paid AI video approval is required");
  if (!quote.quote_id || clean(payload.quote_id) !== quote.quote_id) {
    throw fail(409, "Video prompt, settings or credit quote changed. Review the quote again");
  }
  return true;
}

async function elevenJson(env, path, options = {}, fetcher = fetch) {
  const response = await fetcher("https://api.elevenlabs.io" + path, {
    ...options,
    headers: { "xi-api-key": clean(env.ELEVENLABS_API_KEY),
      ...(options.body ? { "Content-Type": "application/json" } : {}) },
    redirect: "error",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 402 ? "ElevenLabs Pro plan or video credits are required"
      : response.status === 403 ? "ElevenLabs API key lacks Image & Video permission or model access"
      : response.status === 429 ? "ElevenLabs rate limit reached; do not automatically resubmit"
      : "ElevenLabs video API rejected the request (" + response.status + ")";
    throw fail(response.status >= 400 && response.status < 500 ? response.status : 502, message);
  }
  return result;
}

export async function submitStoryVideo(env, settings, fetcher = fetch) {
  const result = await elevenJson(env, "/v1/flows/video", {
    method: "POST", body: JSON.stringify(settings),
  }, fetcher);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(clean(result.id)) || result.status !== "pending") {
    throw fail(502, "ElevenLabs returned an invalid generation receipt; do not resubmit automatically");
  }
  return { id: result.id, status: "pending" };
}

export async function readStoryVideo(env, generationId, fetcher = fetch) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(clean(generationId))) throw fail(400, "Invalid generation identifier");
  const result = await elevenJson(env, "/v1/flows/video/" + encodeURIComponent(generationId), {}, fetcher);
  if (result.id !== generationId || !["pending", "generating", "completed", "failed"].includes(result.status)) {
    throw fail(502, "ElevenLabs returned a mismatched generation status");
  }
  return result;
}

export function isSafeStoryVideoDownloadUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "storage.googleapis.com"
      && url.port === "" && !url.username && !url.password;
  } catch { return false; }
}

export async function downloadStoryVideo(remote, fetcher = fetch) {
  if (remote?.status !== "completed" || remote.content_mime_type !== "video/mp4"
    || !isSafeStoryVideoDownloadUrl(remote.content_url)) {
    throw fail(502, "ElevenLabs returned an unsupported or untrusted video download URL");
  }
  const response = await fetcher(remote.content_url, { redirect: "error" });
  if (!response.ok || String(response.headers.get("Content-Type") || "").split(";")[0] !== "video/mp4") {
    throw fail(502, "ElevenLabs video download failed content validation");
  }
  const size = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(size) && size > STORY_VIDEO_MAX_BYTES) throw fail(413, "AI video exceeds the Studio clip size limit");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 1000 || bytes.byteLength > STORY_VIDEO_MAX_BYTES) throw fail(502, "AI video is empty or exceeds the Studio size limit");
  return bytes;
}

export const storyVideoJobKey = (ideaId, sceneNumber) =>
  "studio/story-first/ai-video/v1/" + ideaId + "/scene-" + sceneNumber + ".json";
export const storyVideoMediaKey = (ideaId, sceneNumber) =>
  "studio/story-first/ai-video/v1/" + ideaId + "/scene-" + sceneNumber + ".mp4";
