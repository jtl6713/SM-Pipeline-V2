const SERVICE = "chicagoshining-r2-upload";
const LEGACY_SECRET_SHA256 = "206163e803094104e8de49871a138636b2978653a9935feea94f85e2454d666e";
const ALLOWED_PREFIXES = ["publish/", "studio/previews/"];
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return corsResponse(null, 204);
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return json({
          ok: true,
          service: SERVICE,
          version: "1.0.0-managed-github",
          bucket_configured: Boolean(resolveBucket(env)),
          accepted_methods: ["PUT"],
        });
      }

      if (request.method !== "PUT") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }

      const authorized = await isAuthorized(request, env);
      if (!authorized) return json({ ok: false, error: "Forbidden" }, 403);

      const key = normalizeKey(url.searchParams.get("key") || "");
      if (!key) return json({ ok: false, error: "Missing key" }, 400);
      if (!ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        return json({ ok: false, error: "Key prefix not allowed" }, 400);
      }

      const contentLength = Number(request.headers.get("content-length") || "0");
      if (contentLength > MAX_UPLOAD_BYTES) {
        return json({ ok: false, error: "Upload too large" }, 413);
      }

      const bucket = resolveBucket(env);
      if (!bucket) return json({ ok: false, error: "R2 bucket binding missing" }, 500);

      const contentType = request.headers.get("content-type") || inferContentType(key);
      await bucket.put(key, request.body, {
        httpMetadata: {
          contentType,
          cacheControl: key.startsWith("publish/") ? "public, max-age=31536000, immutable" : "public, max-age=300",
        },
        customMetadata: {
          uploadedBy: SERVICE,
          uploadedAt: new Date().toISOString(),
        },
      });

      return json({
        ok: true,
        key,
        public_url: `https://media.chicagoshining.com/${key}`,
        content_type: contentType,
      });
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Unexpected error" }, 500);
    }
  },
};

function resolveBucket(env) {
  return env.PUBLISH_BUCKET || env.STUDIO_MEDIA || env.MEDIA_BUCKET || env.BUCKET || null;
}

async function isAuthorized(request, env) {
  const supplied = String(request.headers.get("x-pipeline-secret") || "").trim();
  if (!supplied) return false;
  const configured = [
    env.R2_UPLOAD_WORKER_SECRET,
    env.PIPELINE_SECRET,
    env.UPLOAD_SECRET,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  if (configured.some((value) => safeEqual(supplied, value))) return true;
  return safeEqual(await sha256Hex(supplied), LEGACY_SECRET_SHA256);
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");
}

function inferContentType(key) {
  const lower = key.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function json(body, status = 200) {
  return corsResponse(JSON.stringify(body), status, {
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
}

function corsResponse(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "PUT, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-pipeline-secret",
      ...headers,
    },
  });
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let out = 0;
  for (let i = 0; i < left.length; i += 1) out |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return out === 0;
}
