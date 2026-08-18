const SERVICE = "chicagoshining-r2-upload";
const VERSION = "1.1.0-lifecycle";
const LEGACY_SECRET_SHA256 = "206163e803094104e8de49871a138636b2978653a9935feea94f85e2454d666e";
const ALLOWED_PREFIXES = ["publish/", "studio/previews/"];
const CLEANUP_PREFIXES = ["publish/platform-output-157/", "publish/item12-lifecycle-proof/"];
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const MAX_LIST = 100;
const MAX_DELETE = 20;
const PUBLISH_TTL_POLICY =
  "Publish objects are retained until explicit allowlisted cleanup. Incomplete multipart uploads abort after 7 days by R2 default. studio/previews are TTL candidates and are not auto-deleted by this worker.";

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return corsResponse(null, 204);
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return json({
          ok: true,
          service: SERVICE,
          version: VERSION,
          bucket_configured: Boolean(resolveBucket(env)),
          accepted_methods: ["GET", "PUT", "DELETE"],
          cleanup_prefixes: CLEANUP_PREFIXES,
          ttl_policy: PUBLISH_TTL_POLICY,
        });
      }

      const authorized = await isAuthorized(request, env);
      if (!authorized) return json({ ok: false, error: "Forbidden" }, 403);

      const bucket = resolveBucket(env);
      if (!bucket) return json({ ok: false, error: "R2 bucket binding missing" }, 500);

      if (request.method === "GET" && url.pathname === "/lifecycle/report") {
        return json(await reportPrefix(bucket, url.searchParams.get("prefix") || ""));
      }

      if (request.method === "GET" && url.pathname === "/lifecycle/object") {
        return json(await headObject(bucket, url.searchParams.get("key") || ""));
      }

      if (request.method === "DELETE" && url.pathname === "/lifecycle/object") {
        return json(
          await deleteObjects(bucket, request, [url.searchParams.get("key") || ""].filter(Boolean), url.searchParams)
        );
      }

      if (request.method === "DELETE" && url.pathname === "/lifecycle/objects") {
        const body = await readJson(request);
        const keys = Array.isArray(body.keys) ? body.keys.map((value) => String(value || "")) : [];
        return json(await deleteObjects(bucket, request, keys, url.searchParams));
      }

      if (request.method === "PUT") {
        const result = await putObject(bucket, request, url);
        const status = result.ok ? 200 : result.error === "Upload too large" ? 413 : 400;
        return json(result, status);
      }

      return json({ ok: false, error: "Method not allowed" }, 405);
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
  const configured = [env.R2_UPLOAD_WORKER_SECRET, env.PIPELINE_SECRET, env.UPLOAD_SECRET]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (configured.some((value) => safeEqual(supplied, value))) return true;
  return safeEqual(await sha256Hex(supplied), LEGACY_SECRET_SHA256);
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");
}

function prefixAllowed(key, prefixes) {
  return prefixes.some((prefix) => key === prefix.slice(0, -1) || key.startsWith(prefix));
}

function inferContentType(key) {
  const lower = key.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".txt") || lower.endsWith(".json")) return "text/plain; charset=UTF-8";
  return "application/octet-stream";
}

function outputIdFromKey(key) {
  const nested = key.match(/^publish\/platform-output-(\d+)\//);
  if (nested) return nested[1];
  const flat = key.match(/^publish\/platform-output-(\d+)\.[A-Za-z0-9]+$/);
  return flat ? flat[1] : "";
}

function finalFileIdFromKey(key) {
  const nested = key.match(/^publish\/platform-output-\d+\/([^/]+)\.[A-Za-z0-9]+$/);
  return nested ? nested[1] : "";
}

function objectRecord(object) {
  const uploaded = object.uploaded ? new Date(object.uploaded).toISOString() : "";
  const ageMs = object.uploaded ? Date.now() - new Date(object.uploaded).getTime() : 0;
  return {
    key: object.key,
    size: object.size,
    uploaded,
    age_days: Number((ageMs / 86400000).toFixed(2)),
    etag: object.httpEtag || object.etag || "",
    custom_metadata: object.customMetadata || {},
    output_id: (object.customMetadata || {}).outputId || outputIdFromKey(object.key),
    final_file_id: (object.customMetadata || {}).finalFileId || finalFileIdFromKey(object.key),
    retain_class: (object.customMetadata || {}).retainClass || (object.key.startsWith("studio/previews/") ? "preview" : "publish"),
    cleanup_allowed: prefixAllowed(object.key, CLEANUP_PREFIXES),
  };
}

async function reportPrefix(bucket, rawPrefix) {
  const prefix = normalizeKey(rawPrefix);
  if (!prefix) return { ok: false, error: "Missing prefix" };
  if (!prefixAllowed(prefix, ALLOWED_PREFIXES)) return { ok: false, error: "Prefix not allowed" };
  const listed = await bucket.list({
    prefix,
    limit: MAX_LIST,
    include: ["customMetadata", "httpMetadata"],
  });
  const objects = (listed.objects || []).map(objectRecord);
  return {
    ok: true,
    service: SERVICE,
    version: VERSION,
    prefix,
    truncated: Boolean(listed.truncated),
    count: objects.length,
    ttl_policy: PUBLISH_TTL_POLICY,
    objects,
  };
}

async function headObject(bucket, rawKey) {
  const key = normalizeKey(rawKey);
  if (!key) return { ok: false, error: "Missing key" };
  if (!prefixAllowed(key, ALLOWED_PREFIXES)) return { ok: false, error: "Key prefix not allowed" };
  const object = await bucket.head(key);
  if (!object) return { ok: false, error: "Not found", key };
  return { ok: true, object: objectRecord(object) };
}

async function deleteObjects(bucket, request, rawKeys, searchParams) {
  const dryRun = String(searchParams.get("dry_run") || "") === "true";
  const confirm = String(request.headers.get("x-lifecycle-confirm") || "");
  if (!dryRun && confirm !== "DELETE") {
    return { ok: false, error: "Missing x-lifecycle-confirm: DELETE" };
  }
  const keys = [...new Set(rawKeys.map(normalizeKey).filter(Boolean))];
  if (!keys.length) return { ok: false, error: "Missing keys" };
  if (keys.length > MAX_DELETE) return { ok: false, error: `Refusing more than ${MAX_DELETE} keys` };
  const denied = keys.filter((key) => !prefixAllowed(key, CLEANUP_PREFIXES));
  if (denied.length) {
    return { ok: false, error: "Key not in cleanup allowlist", denied, deleted: [] };
  }
  const deleted = [];
  if (!dryRun) {
    for (const key of keys) {
      await bucket.delete(key);
      deleted.push(key);
    }
  }
  return {
    ok: true,
    dry_run: dryRun,
    requested: keys,
    deleted,
    would_delete: dryRun ? keys : [],
  };
}

async function putObject(bucket, request, url) {
  const key = normalizeKey(url.searchParams.get("key") || "");
  if (!key) return { ok: false, error: "Missing key" };
  if (!prefixAllowed(key, ALLOWED_PREFIXES)) return { ok: false, error: "Key prefix not allowed" };
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_UPLOAD_BYTES) return { ok: false, error: "Upload too large" };
  const contentType = request.headers.get("content-type") || inferContentType(key);
  const outputId = String(request.headers.get("x-output-id") || outputIdFromKey(key) || "");
  const finalFileId = String(request.headers.get("x-final-file-id") || finalFileIdFromKey(key) || "");
  const retainClass = String(request.headers.get("x-retain-class") || (key.startsWith("studio/previews/") ? "preview" : "publish"));
  await bucket.put(key, request.body, {
    httpMetadata: {
      contentType,
      cacheControl: key.startsWith("publish/") ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
    customMetadata: {
      uploadedBy: SERVICE,
      uploadedAt: new Date().toISOString(),
      outputId,
      finalFileId,
      retainClass,
    },
  });
  return {
    ok: true,
    key,
    public_url: `https://media.chicagoshining.com/${key}`,
    content_type: contentType,
    custom_metadata: { outputId, finalFileId, retainClass },
  };
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

function json(body, status = 200) {
  if (body && body.ok === false && status === 200) {
    if (body.error === "Not found") status = 404;
    else if (body.error === "Forbidden" || String(body.error || "").includes("allowlist")) status = 403;
    else if (String(body.error || "").includes("Missing")) status = 400;
    else status = 400;
  }
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
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "content-type, x-pipeline-secret, x-lifecycle-confirm, x-output-id, x-final-file-id, x-retain-class",
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
