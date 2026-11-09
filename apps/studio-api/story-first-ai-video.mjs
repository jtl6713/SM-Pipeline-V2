/**
 * ElevenLabs video model contract, quote and cost gates.
 * The provider workspace UI is not evidence of API access. Seedance is
 * separately gated by a positive, operator-confirmed model entitlement.
 */
import { normalizeStoryVideoReferences } from "./story-first-ai-video-references.mjs";

export const STORY_VIDEO_MODEL = "veo-3.1-fast-generate-001";
export const STORY_VIDEO_RESOLUTION = "720p";
export const STORY_VIDEO_DURATIONS = Object.freeze([4, 6, 8]);
export const STORY_VIDEO_POLL_MIN_MS = 10_000;
export const STORY_VIDEO_MAX_BYTES = 30 * 1024 * 1024;
export const STORY_VIDEO_MODELS = Object.freeze({
  "veo-3.1-fast-generate-001": Object.freeze({
    label:"Veo 3.1 Fast",durations:[4,6,8],ratios:["9:16","16:9"],
    resolutions:["720p","1080p"], frames:true,imageRefs:3,videoRefs:0,audioRefs:0,
  }),
  "veo-3.1-generate-001": Object.freeze({
    label:"Veo 3.1",durations:[4,6,8],ratios:["9:16","16:9"],
    resolutions:["720p","1080p"],frames:true,imageRefs:3,videoRefs:0,audioRefs:0,
  }),
  "bytedance-seedance-v2.5": Object.freeze({
    label:"Seedance 2.5 (API approval required)",
    durations:Array.from({length:27},(_,i)=>i+4),
    ratios:["9:16","16:9","4:3","3:4","1:1","21:9"],
    resolutions:["480p","720p"],frames:true,imageRefs:3,videoRefs:2,audioRefs:1,
  }),
});
const fail = (status,message)=>Object.assign(new Error(message),{status});
const clean = value => String(value ?? "").trim();
const isoDay = value=>/^\d{4}-\d{2}-\d{2}$/.test(clean(value))?clean(value):"";
const bytesHex = bytes=>Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("");

export function availableStoryVideoModels(env={}) {
  return Object.entries(STORY_VIDEO_MODELS).map(([id,model])=>({
    id,label:model.label,durations:model.durations,ratios:model.ratios,resolutions:model.resolutions,
    frames:model.frames,image_references:model.imageRefs,video_references:model.videoRefs,
    audio_references:model.audioRefs,
    enabled:id!=="bytedance-seedance-v2.5"
      || String(env.STUDIO_ELEVENLABS_SEEDANCE_API_APPROVED||"").toLowerCase()==="true",
  }));
}

export function normalizeStoryVideoSettings(input={}) {
  const prompt=clean(input.prompt).replace(/\s+/g," ");
  if(prompt.length<12||prompt.length>850)throw fail(400,"Video prompt must contain 12–850 characters");
  const model_id=clean(input.model_id||STORY_VIDEO_MODEL);
  const model=STORY_VIDEO_MODELS[model_id];
  if(!model)throw fail(400,"Model is not approved for the video pilot");
  const duration_secs=Number(input.duration_secs??8);
  if(!model.durations.includes(duration_secs))throw fail(400,"Video duration is not supported by the selected model");
  const aspect_ratio=clean(input.aspect_ratio||"9:16");
  if(!model.ratios.includes(aspect_ratio))throw fail(400,"Video ratio is not supported by the selected model");
  const resolution=clean(input.resolution||"720p");
  if(!model.resolutions.includes(resolution))throw fail(400,"Video resolution is not supported by the selected model");
  const generate_audio=input.generate_audio===true;
  const references=normalizeStoryVideoReferences(input.references||{});
  if(references.images.length>model.imageRefs||references.videos.length>model.videoRefs
    || references.audios.length>model.audioRefs)
    throw fail(400,"Reference types or count are not supported by the selected model");
  if(model_id.startsWith("veo-")){
    if(references.images.length&&duration_secs!==8)
      throw fail(400,"Veo image references require an 8-second generation");
    if(references.images.some(x=>!["subject","style"].includes(x.role)))
      throw fail(400,"Veo image references require subject or style roles");
  }
  const negative_prompt=clean(input.negative_prompt).replace(/\s+/g," ");
  if(negative_prompt&&(!model_id.startsWith("veo-")||negative_prompt.length>280))
    throw fail(400,"Negative prompt is available on Veo only, up to 280 characters");
  return {
    prompt,duration_secs,aspect_ratio,model_id,resolution,generate_audio,references,
    ...(negative_prompt?{negative_prompt}:{}),
  };
}

/** Signature isolates all parameters that affect estimate, including reference counts. */
export function storyVideoPriceKey(input) {
  const s=normalizeStoryVideoSettings(input);
  const r=s.references;
  return [s.model_id,s.duration_secs,s.resolution,s.aspect_ratio,
    s.generate_audio?"audio":"silent",r.start_frame?"start":"no-start",
    r.end_frame?"end":"no-end",r.images.length+"images",
    r.videos.length+"videos",r.audios.length+"audios"].join("|");
}

export function videoPriceConfig(env, settingsOrDuration, now=Date.now(), ratio="9:16") {
  const settings=typeof settingsOrDuration==="number"
    ? normalizeStoryVideoSettings({prompt:"Preview a cinematic city scene",duration_secs:settingsOrDuration,aspect_ratio:ratio})
    : normalizeStoryVideoSettings(settingsOrDuration);
  const day=isoDay(env.STUDIO_ELEVENLABS_VIDEO_PRICE_REVIEWED_AT);
  const reviewed=day?Date.parse(day+"T00:00:00Z"):NaN;
  const active=String(env.STUDIO_ELEVENLABS_VIDEO_ENABLED||"").toLowerCase()==="true";
  if(!active)return {enabled:false,reason:"AI video generation is disabled by administrator"};
  if(!clean(env.ELEVENLABS_VIDEO_API_KEY))return {enabled:false,reason:"ElevenLabs Image & Video API key is not configured"};
  if(settings.model_id==="bytedance-seedance-v2.5"&&
    String(env.STUDIO_ELEVENLABS_SEEDANCE_API_APPROVED||"").toLowerCase()!=="true")
    return {enabled:false,reason:"Seedance 2.5 API access has not been explicitly approved"};
  if(settings.duration_secs>12&&
    String(env.STUDIO_ELEVENLABS_LONG_VIDEO_VERIFIED||"").toLowerCase()!=="true")
    return {enabled:false,reason:"Long AI video transfer has not been verified for this Studio Runner"};
  if(settings.generate_audio&&
    String(env.STUDIO_ELEVENLABS_VIDEO_AUDIO_ENABLED||"").toLowerCase()!=="true")
    return {enabled:false,reason:"Generated audio has not been authorized for Studio"};
  if(!Number.isFinite(reviewed)||reviewed>now||now-reviewed>30*86400000)
    return {enabled:false,reason:"AI video credit estimate requires an updated price review"};
  let credits=null;
  const priceKey=storyVideoPriceKey(settings);
  try {
    const map=JSON.parse(clean(env.STUDIO_ELEVENLABS_VIDEO_CREDIT_ESTIMATES_JSON)||"{}");
    if(map&&typeof map==="object"&&!Array.isArray(map)&&Object.prototype.hasOwnProperty.call(map,priceKey))
      credits=Number(map[priceKey]);
  }catch{return {enabled:false,reason:"AI video pricing configuration is invalid"};}
  // Backward-compatible legacy price is allowed ONLY for unchanged 720p,
  // silent, no-reference Veo Fast jobs. No image, audio or reference pricing
  // may accidentally inherit a cheaper text-to-video estimate.
  const refs=settings.references;
  if(credits===null&&settings.model_id===STORY_VIDEO_MODEL&&settings.resolution==="720p"
    &&!settings.generate_audio&&!refs.start_frame&&!refs.end_frame
    &&!refs.images.length&&!refs.videos.length&&!refs.audios.length){
    credits=Number(env["STUDIO_ELEVENLABS_VIDEO_CREDITS_"+settings.duration_secs+"S_720P_"+
      settings.aspect_ratio.replace(":","X")]);
  }
  if(!Number.isSafeInteger(credits)||credits<=0||credits>500000)
    return {enabled:false,reason:"No reviewed credit estimate for this exact model, duration, resolution, audio and reference configuration"};
  return {enabled:true,estimated_credits:credits,price_reviewed_at:day,price_key:priceKey};
}

export async function storyVideoQuote(env,input,now=Date.now()) {
  const settings=normalizeStoryVideoSettings(input);
  const pricing=videoPriceConfig(env,settings,now);
  if(!pricing.enabled)return {...settings,...pricing,quote_id:null};
  const quoteText=JSON.stringify([clean(input.idea_id),clean(input.scene_number),
    clean(input.content_profile_id),settings,pricing.estimated_credits,pricing.price_reviewed_at]);
  const quote_id=bytesHex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(quoteText)));
  return {...settings,...pricing,quote_id,currency:"ElevenLabs credits",
    note:"Estimated credits, not a billing guarantee. ElevenLabs may change pricing."};
}

export function requireStoryVideoPaidApproval(quote,payload) {
  if(!quote?.enabled)throw fail(503,quote?.reason||"AI video generation is unavailable");
  if(payload?.approve_paid_generation!==true)
    throw fail(400,"Explicit paid AI video approval is required");
  if(!quote.quote_id||clean(payload.quote_id)!==quote.quote_id)
    throw fail(409,"Video prompt, model, media references or credit quote changed. Review the quote again");
  return true;
}

export function buildStoryVideoProviderSettings(settings,uploaded={}) {
  const s=normalizeStoryVideoSettings(settings);
  const {references:_,...payload}=s;
  const provider={...(uploaded.provider_references||{})};
  if(s.model_id==="bytedance-seedance-v2.5"&&Array.isArray(provider.images)) {
    provider.images=provider.images.map(item=>item?.image||item);
  }
  const hasRefs=Boolean(s.references.start_frame||s.references.end_frame||
    s.references.images.length||s.references.videos.length||s.references.audios.length);
  if(hasRefs&&!Object.keys(provider).length)
    throw fail(409,"Video reference upload must complete before sending a paid generation");
  return {...payload,...provider};
}

async function elevenJson(env, path, options = {}, fetcher = fetch) {
  if (!clean(env.ELEVENLABS_VIDEO_API_KEY)) throw fail(503, "Dedicated ElevenLabs video key is not configured");
  const response = await fetcher("https://api.elevenlabs.io" + path, {
    ...options,
    headers: { "xi-api-key": clean(env.ELEVENLABS_VIDEO_API_KEY),
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
  if (settings?.references) throw fail(400, "Upload and translate canonical Media Asset references before provider submission");
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
