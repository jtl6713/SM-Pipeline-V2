"use strict";
const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const { spawnSync } = require("child_process");

const SERVICE_VERSION = "2026-09-06-shorts-vertical-required";
const MIN_REFRESH_TOKEN_LENGTH = 40;
const ENV_PATH = path.join(process.cwd(), ".env");

function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  for (const raw of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnv();

const cfg = {
  port: Number(process.env.PORT || 3340),
  secret: process.env.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || "",
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  chunkBytes: Number(process.env.YOUTUBE_UPLOAD_CHUNK_BYTES || 8388608),
  tempDir: path.resolve(process.env.YOUTUBE_TEMP_DIR || "./tmp"),
  jobStore: path.resolve(process.env.YOUTUBE_JOB_STORE || "./data/youtube-jobs.json"),
  retentionHours: Number(process.env.YOUTUBE_JOB_RETENTION_HOURS || 168),
};
if (cfg.chunkBytes < 262144 || cfg.chunkBytes % 262144 !== 0) {
  throw new Error("YOUTUBE_UPLOAD_CHUNK_BYTES must be a multiple of 256 KiB.");
}

const jobs = new Map();
let saveChain = Promise.resolve();
let cachedAccess = { token: "", expiresAt: 0 };

function now() {
  return new Date().toISOString();
}

function refreshTokenLooksTruncated(token) {
  const value = String(token || "").trim();
  return !value || value.length < MIN_REFRESH_TOKEN_LENGTH;
}

async function persistEnvValue(key, value) {
  const current = fs.existsSync(ENV_PATH) ? await fsp.readFile(ENV_PATH, "utf8") : "";
  const lines = current.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (!line.startsWith(key + "=")) return line;
    found = true;
    return key + "=" + value;
  });
  if (!found) next.push(key + "=" + value);
  const text = next.join("\n").replace(/\n*$/, "\n");
  const tmp = ENV_PATH + ".tmp";
  await fsp.writeFile(tmp, text, { encoding: "utf8", mode: 0o600 });
  await fsp.rename(tmp, ENV_PATH);
}

async function init() {
  await fsp.mkdir(cfg.tempDir, { recursive: true });
  await fsp.mkdir(path.dirname(cfg.jobStore), { recursive: true });
  try {
    const rows = JSON.parse(await fsp.readFile(cfg.jobStore, "utf8"));
    for (const job of rows) jobs.set(job.id, job);
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Job store load warning:", error.message);
  }
  cleanupOldJobs();
}

function persist() {
  saveChain = saveChain.then(() => fsp.writeFile(cfg.jobStore, JSON.stringify([...jobs.values()], null, 2)));
  return saveChain;
}

function cleanupOldJobs() {
  const cutoff = Date.now() - cfg.retentionHours * 3600000;
  for (const [id, job] of jobs) {
    if (Date.parse(job.updatedAt || job.createdAt) < cutoff && ["completed", "failed"].includes(job.status)) {
      jobs.delete(id);
    }
  }
  persist().catch(console.error);
}

function json(res, code, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": data.length });
  res.end(data);
}

async function readJson(req, max = 1024 * 1024) {
  const chunks = [];
  let n = 0;
  for await (const chunk of req) {
    n += chunk.length;
    if (n > max) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  const body = Buffer.allocUnsafe(n);
  let offset = 0;
  for (const chunk of chunks) {
    chunk.copy(body, offset);
    offset += chunk.length;
  }
  return JSON.parse(body.toString("utf8") || "{}");
}

function authorized(req) {
  if (!cfg.secret) return true;
  const supplied = Buffer.from(String(req.headers["x-sm-pipeline-key"] || ""));
  const expected = Buffer.from(cfg.secret);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

async function refreshAccessToken() {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
    throw new Error("Google OAuth environment variables are incomplete.");
  }
  if (refreshTokenLooksTruncated(cfg.refreshToken)) {
    throw new Error("GOOGLE_REFRESH_TOKEN looks truncated. Re-authorize and write the full token to .env.");
  }
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: cfg.refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok) {
    const code = data && data.error ? String(data.error) : "oauth_refresh_failed";
    throw new Error(`OAuth refresh failed ${response.status}: ${code}`);
  }
  if (!data.access_token) throw new Error("OAuth refresh returned no access_token.");
  if (data.refresh_token && data.refresh_token !== cfg.refreshToken) {
    if (refreshTokenLooksTruncated(data.refresh_token)) {
      throw new Error("Google returned a truncated refresh token; refusing to persist it.");
    }
    cfg.refreshToken = data.refresh_token;
    process.env.GOOGLE_REFRESH_TOKEN = data.refresh_token;
    await persistEnvValue("GOOGLE_REFRESH_TOKEN", data.refresh_token);
  }
  const expiresIn = Number(data.expires_in || 3600);
  cachedAccess = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000,
    expiresIn,
  };
  return cachedAccess;
}

async function accessToken() {
  if (cachedAccess.token && Date.now() < cachedAccess.expiresAt) return cachedAccess.token;
  const refreshed = await refreshAccessToken();
  return refreshed.token;
}

async function oauthStatus() {
  const result = {
    ok: false,
    service: "sm-pipeline-youtube-uploader",
    version: SERVICE_VERSION,
    oauthConfigured: Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken),
    refresh_token_length: String(cfg.refreshToken || "").length,
    truncated: refreshTokenLooksTruncated(cfg.refreshToken),
    refresh_ok: false,
    access_token_expires_in: null,
    error: null,
    checked_at: now(),
    google_consent_publishing: "not_visible_from_token_api",
    durable_requirement:
      "Google OAuth consent screen must be In production. Testing-mode refresh tokens expire after 7 days.",
  };
  try {
    const refreshed = await refreshAccessToken();
    result.refresh_ok = true;
    result.ok = true;
    result.access_token_expires_in = refreshed.expiresIn;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

async function downloadToFile(url, file) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Source download failed ${response.status}`);
  const type = (response.headers.get("content-type") || "video/mp4").split(";")[0];
  const out = fs.createWriteStream(file);
  for await (const chunk of response.body) {
    if (!out.write(chunk)) await new Promise((resolve) => out.once("drain", resolve));
  }
  await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())));
  return type;
}

function metadataFrom(payload) {
  let privacy = String(payload.privacyStatus || "public").toLowerCase();
  if (!["private", "unlisted", "public"].includes(privacy)) {
    throw new Error("privacyStatus must be private, unlisted, or public");
  }
  // YouTube Data API requires privacyStatus=private whenever publishAt is set.
  // Scheduled Studio posts keep desired end-state "public"; coerce for upload so
  // YouTube releases the video publicly at publishAt.
  if (payload.publishAt && privacy !== "private") {
    privacy = "private";
  }
  const status = {
    privacyStatus: privacy,
    selfDeclaredMadeForKids: Boolean(payload.madeForKids),
    containsSyntheticMedia: Boolean(payload.containsSyntheticMedia),
  };
  if (payload.publishAt) {
    status.publishAt = payload.publishAt;
  }
  return {
    snippet: {
      title: String(payload.title || "").slice(0, 100),
      description: String(payload.description || "").slice(0, 5000),
      tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 500) : [],
      categoryId: String(payload.categoryId || "22"),
    },
    status,
  };
}

async function initiateSession(token, metadata, size, mime) {
  const url = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(size),
      "X-Upload-Content-Type": mime,
    },
    body: JSON.stringify(metadata),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Session initialization failed ${response.status}: ${text}`);
  const location = response.headers.get("location");
  if (!location) throw new Error("YouTube did not return a resumable Location header.");
  return location;
}

async function uploadChunks(job, file, mime, token, sessionUrl) {
  const size = (await fsp.stat(file)).size;
  let start = Number(job.bytesUploaded || 0);
  const fd = await fsp.open(file, "r");
  try {
    while (start < size) {
      const len = Math.min(cfg.chunkBytes, size - start);
      const buf = Buffer.allocUnsafe(len);
      const { bytesRead } = await fd.read(buf, 0, len, start);
      const end = start + bytesRead - 1;
      const response = await fetch(sessionUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": mime,
          "Content-Length": String(bytesRead),
          "Content-Range": `bytes ${start}-${end}/${size}`,
        },
        body: buf.subarray(0, bytesRead),
      });
      if (response.status === 308) {
        const range = response.headers.get("range");
        start = range ? Number(range.split("-").pop()) + 1 : end + 1;
      } else {
        const text = await response.text();
        if (!response.ok) throw new Error(`Upload failed ${response.status}: ${text}`);
        const video = JSON.parse(text);
        job.videoId = video.id;
        job.youtubeResponse = video;
        start = size;
      }
      job.bytesUploaded = start;
      job.progressPercent = Math.floor((start * 100) / size);
      job.updatedAt = now();
      await persist();
    }
  } finally {
    await fd.close();
  }
}

async function processUpload(jobId, payload) {
  const job = jobs.get(jobId);
  const file = path.join(cfg.tempDir, `${jobId}.mp4`);
  try {
    job.status = "downloading";
    job.updatedAt = now();
    await persist();
    const mime = await downloadToFile(payload.sourceUrl, file);
    const size = (await fsp.stat(file)).size;
    job.fileSize = size;
    job.mimeType = mime;
    job.status = "initializing";
    await persist();
    const token = await accessToken();
    const metadata = metadataFrom(payload);
    const session = await initiateSession(token, metadata, size, mime);
    job.sessionCreated = true;
    job.status = "uploading";
    await persist();
    await uploadChunks(job, file, mime, token, session);
    job.status = "completed";
    job.completedAt = now();
    job.updatedAt = now();
    await persist();
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.updatedAt = now();
    await persist();
  } finally {
    fsp.unlink(file).catch(() => {});
  }
}

async function videoStatus(videoId) {
  const token = await accessToken();
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "status,processingDetails,snippet");
  url.searchParams.set("id", videoId);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(`videos.list failed ${response.status}`);
  return data;
}

function pngSize(body) {
  if (!Buffer.isBuffer(body) || body.length < 24) return null;
  if (body[0] !== 0x89 || body[1] !== 0x50 || body[2] !== 0x4e || body[3] !== 0x47) return null;
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

function probeImageSize(asset) {
  const png = pngSize(asset.body);
  if (png) return png;
  const tmpIn = path.join(cfg.tempDir, `thumb-probe-${crypto.randomUUID()}`);
  try {
    fs.mkdirSync(cfg.tempDir, { recursive: true });
    fs.writeFileSync(tmpIn, asset.body);
    const result = spawnSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", tmpIn],
      { encoding: "utf8", windowsHide: true }
    );
    const match = String(result.stdout || "").trim().match(/^(\d+)x(\d+)$/);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  } catch {
    return null;
  } finally {
    fsp.unlink(tmpIn).catch(() => {});
  }
}

function ffmpegJpeg(asset, vf, maxBytes) {
  const qualities = [3, 5, 8, 12, 18, 24];
  for (const quality of qualities) {
    const tmpIn = path.join(cfg.tempDir, `thumb-in-${crypto.randomUUID()}`);
    const tmpOut = path.join(cfg.tempDir, `thumb-out-${crypto.randomUUID()}.jpg`);
    try {
      fs.mkdirSync(cfg.tempDir, { recursive: true });
      fs.writeFileSync(tmpIn, asset.body);
      const result = spawnSync(
        "ffmpeg",
        ["-y", "-i", tmpIn, "-vf", vf, "-q:v", String(quality), tmpOut],
        { encoding: "utf8", windowsHide: true }
      );
      if (result.status !== 0 || !fs.existsSync(tmpOut)) continue;
      const body = fs.readFileSync(tmpOut);
      if (body.length && body.length <= maxBytes) return { body, mime: "image/jpeg" };
    } catch {
      // try a lower quality
    } finally {
      fsp.unlink(tmpIn).catch(() => {});
      fsp.unlink(tmpOut).catch(() => {});
    }
  }
  return null;
}

function prepareYoutubeThumbnail(asset, { vertical = false, maxBytes = 2097152 } = {}) {
  const size = probeImageSize(asset) || {};
  const portrait = Boolean(vertical) || Number(size.height) > Number(size.width);
  const box = portrait ? { width: 1080, height: 1920 } : { width: 1280, height: 720 };
  const vf = `scale=${box.width}:${box.height}:force_original_aspect_ratio=decrease,pad=${box.width}:${box.height}:(ow-iw)/2:(oh-ih)/2:black`;
  return ffmpegJpeg(asset, vf, maxBytes) || asset;
}

async function setStudioVerticalStill(videoId, asset, token) {
  const response = await fetch(
    "https://studio.youtube.com/youtubei/v1/video_manager/metadata_update?alt=json",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: "https://studio.youtube.com",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB_CREATOR",
            clientVersion: "1.20260903.00.00",
          },
        },
        encryptedVideoId: videoId,
        videoStill: {
          operation: 3,
          image: {
            rawBytes: asset.body.toString("base64"),
            isVertical: true,
          },
        },
      }),
    }
  );
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`studio vertical still failed ${response.status}: ${text.slice(0, 500)}`);
  }
  return payload;
}

async function setThumbnail(videoId, sourceUrl, fallbackSourceUrl = null, { vertical = false } = {}) {
  const token = await accessToken();
  const tryDownload = async (url) => {
    if (!url) return null;
    const downloaded = await fetch(url);
    if (!downloaded.ok) throw new Error(`Thumbnail download failed ${downloaded.status}`);
    const body = Buffer.from(await downloaded.arrayBuffer());
    const mime = (downloaded.headers.get("content-type") || "image/jpeg").split(";")[0];
    return { body, mime };
  };
  let asset = null;
  let lastError = null;
  for (const url of [sourceUrl, fallbackSourceUrl].filter(Boolean)) {
    try {
      const downloaded = await tryDownload(url);
      const next = prepareYoutubeThumbnail(downloaded, { vertical });
      if (next.body.length > 2097152) {
        lastError = new Error(`Thumbnail exceeds 2 MB (${next.body.length} bytes)`);
        continue;
      }
      asset = next;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (!asset) throw lastError || new Error("Thumbnail download failed");
  const url = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": asset.mime,
      "Content-Length": String(asset.body.length),
    },
    body: asset.body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`thumbnails.set failed ${response.status}: ${text}`);
  const data = JSON.parse(text);
  if (vertical) {
    data.studioVerticalStill = await setStudioVerticalStill(videoId, asset, token);
  }
  return data;
}

async function updatePrivacy(videoId, privacyStatus) {
  const privacy = String(privacyStatus || "public").toLowerCase();
  if (!["private", "unlisted", "public"].includes(privacy)) {
    throw new Error("privacyStatus must be private, unlisted, or public");
  }
  const current = await videoStatus(videoId);
  const item = (current.items || [])[0];
  if (!item) throw new Error("YouTube video not found");
  const token = await accessToken();
  const response = await fetch("https://www.googleapis.com/youtube/v3/videos?part=status", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: videoId,
      status: {
        ...(item.status || {}),
        privacyStatus: privacy,
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`videos.update failed ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function updateSnippet(videoId, { title, description, categoryId, tags } = {}) {
  const token = await accessToken();
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", String(videoId || "").trim());
  const current = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const currentData = await current.json();
  if (!current.ok) throw new Error(`videos.list failed ${current.status}: ${JSON.stringify(currentData)}`);
  const item = (currentData.items || [])[0];
  if (!item) throw new Error("YouTube video not found");
  const snippet = { ...(item.snippet || {}) };
  if (title !== undefined) snippet.title = String(title || "").slice(0, 100);
  if (description !== undefined) snippet.description = String(description || "").slice(0, 5000);
  if (categoryId !== undefined) snippet.categoryId = String(categoryId || snippet.categoryId || "22");
  if (tags !== undefined) snippet.tags = Array.isArray(tags) ? tags.slice(0, 500) : [];
  const response = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: videoId, snippet }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`videos.update snippet failed ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "sm-pipeline-youtube-uploader",
        version: SERVICE_VERSION,
        time: now(),
        oauthConfigured: Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken),
      });
    }
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized" });
    if (req.method === "GET" && url.pathname === "/youtube/oauth/status") {
      return json(res, 200, await oauthStatus());
    }
    if (req.method === "POST" && url.pathname === "/youtube/upload") {
      const payload = await readJson(req);
      if (!payload.sourceUrl || !payload.title) {
        return json(res, 400, { error: "sourceUrl and title are required" });
      }
      const idem = String(payload.idempotencyKey || "");
      if (idem) {
        const existing = [...jobs.values()].find((job) => job.idempotencyKey === idem && job.status !== "failed");
        if (existing) return json(res, 200, existing);
      }
      const id = crypto.randomUUID();
      const job = {
        id,
        idempotencyKey: idem,
        status: "queued",
        progressPercent: 0,
        bytesUploaded: 0,
        createdAt: now(),
        updatedAt: now(),
        videoId: null,
        error: null,
      };
      jobs.set(id, job);
      await persist();
      setImmediate(() => processUpload(id, payload));
      return json(res, 202, job);
    }
    const jobMatch = url.pathname.match(/^\/youtube\/jobs\/([^/]+)$/);
    if (req.method === "GET" && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      return job ? json(res, 200, job) : json(res, 404, { error: "Job not found" });
    }
    const videoMatch = url.pathname.match(/^\/youtube\/videos\/([^/]+)$/);
    if (req.method === "GET" && videoMatch) return json(res, 200, await videoStatus(videoMatch[1]));
    if (req.method === "POST" && url.pathname === "/youtube/thumbnail") {
      const payload = await readJson(req);
      if (!payload.videoId || !payload.sourceUrl) {
        return json(res, 400, { error: "videoId and sourceUrl are required" });
      }
      return json(res, 200, await setThumbnail(
        payload.videoId,
        payload.sourceUrl,
        payload.fallbackSourceUrl || payload.fallback_source_url || null,
        { vertical: Boolean(payload.vertical) }
      ));
    }
    if (req.method === "POST" && url.pathname === "/youtube/privacy") {
      const payload = await readJson(req);
      if (!payload.videoId || !payload.privacyStatus) {
        return json(res, 400, { error: "videoId and privacyStatus are required" });
      }
      return json(res, 200, await updatePrivacy(payload.videoId, payload.privacyStatus));
    }
    if (req.method === "POST" && url.pathname === "/youtube/snippet") {
      const payload = await readJson(req);
      if (!payload.videoId) {
        return json(res, 400, { error: "videoId is required" });
      }
      if (payload.title === undefined && payload.description === undefined && payload.categoryId === undefined && payload.tags === undefined) {
        return json(res, 400, { error: "at least one of title, description, categoryId, tags is required" });
      }
      return json(res, 200, await updateSnippet(payload.videoId, payload));
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

init()
  .then(() =>
    http.createServer(handler).listen(cfg.port, "0.0.0.0", () => {
      console.log(`YouTube uploader listening on ${cfg.port}`);
    })
  )
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
