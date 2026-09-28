const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { registerRemotionCleanup } = require('./remotion-cleanup');

const app = express();

const PORT = Number(process.env.PORT || 3333);
const DEFAULT_FPS = 30;
const DEFAULT_VOICEOVER_TAIL_SECONDS = 2;
const DEFAULT_MUSIC_BOOST_DELTA = 0.05;
const DEFAULT_MUSIC_BOOST_FADE_SECONDS = 0.5;
const DEFAULT_MUSIC_END_FADE_SECONDS = 0.5;
const PIPELINE_RUNNER_INTERNAL_URL = String(
    process.env.PIPELINE_RUNNER_INTERNAL_URL || 'http://127.0.0.1:3350'
).replace(/\/$/, '');
const SERVICE_VERSION = '2026-09-28-job-assets-serialize';
const PROJECT_DIR = __dirname;
const PUBLIC_DIR = path.join(PROJECT_DIR, 'public');
const OUT_DIR = path.join(PROJECT_DIR, 'out');
const RENDER_PROPS_DIR = path.join(PROJECT_DIR, 'render-props');
// Keep job media OUT of public/. Remotion copies public/ into every Chrome
// bundle; putting multi-GB render-assets there caused "Copying public dir 5GB"
// and Chrome connect timeouts when Content 239–242 burst concurrent renders.
const RENDER_ASSETS_DIR = path.join(PROJECT_DIR, 'job-assets');
const RENDER_ASSETS_URL_PREFIX = '/job-assets';
const MAX_CONCURRENT_REMOTION_RENDERS = Math.max(
    1,
    Number(process.env.REMOTION_MAX_CONCURRENT || 1) || 1,
);

app.set('trust proxy', true);

app.use(express.json({ limit: '100mb' }));

// Serve rendered output files.
app.use('/out', express.static(OUT_DIR));

// Serve public files.
// This makes URLs like http://localhost:3333/Assets/video1_proxy.mp4 work.
// It is also useful for the controlled V4 remote URL test.
app.use(express.static(PUBLIC_DIR));

// Job-local clips/music/VO/watermarks — outside public/, fetched by Remotion via HTTP.
app.use(RENDER_ASSETS_URL_PREFIX, express.static(RENDER_ASSETS_DIR));

const jobs = new Map();
const remotionCleanup = registerRemotionCleanup({
    app,
    jobs,
    projectDir: PROJECT_DIR,
    outDir: OUT_DIR,
    renderPropsDir: RENDER_PROPS_DIR,
    renderAssetsDir: RENDER_ASSETS_DIR,
});

let activeRemotionRenders = 0;
const remotionRenderWaiters = [];

function acquireRemotionSlot(job) {
    return new Promise((resolve) => {
        const tryAcquire = () => {
            if (activeRemotionRenders < MAX_CONCURRENT_REMOTION_RENDERS) {
                activeRemotionRenders += 1;
                appendLog(
                    job,
                    `Acquired Remotion slot (${activeRemotionRenders}/${MAX_CONCURRENT_REMOTION_RENDERS})`,
                );
                resolve();
                return;
            }
            appendLog(
                job,
                `Waiting for Remotion slot (${activeRemotionRenders}/${MAX_CONCURRENT_REMOTION_RENDERS} busy, queue=${remotionRenderWaiters.length + 1})`,
            );
            remotionRenderWaiters.push(tryAcquire);
        };
        tryAcquire();
    });
}

function releaseRemotionSlot() {
    activeRemotionRenders = Math.max(0, activeRemotionRenders - 1);
    const next = remotionRenderWaiters.shift();
    if (next) next();
}

function nowIso() {
    return new Date().toISOString();
}

function makeJobId() {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, '')
        .slice(0, 14);

    const random = crypto.randomBytes(4).toString('hex');

    return `job-${timestamp}-${random}`;
}

function appendLog(job, message) {
    if (!job.logs) {
        job.logs = [];
    }

    const text = String(message);
    job.logs.push(text);

    // Keep the last 80 log chunks so status responses do not get huge.
    if (job.logs.length > 80) {
        job.logs = job.logs.slice(job.logs.length - 80);
    }
}

const DEFAULT_R5_DONE_CALLBACK_URL = "https://studio.chicagoshining.com/api/hooks/r5-done";
const DEFAULT_R5_DONE_CALLBACK_TOKEN = "r5done_7kqp2nvm4w8x1c9h3z";

function notifyStudioR5Done(job) {
    const url = String(process.env.STUDIO_R5_CALLBACK_URL || DEFAULT_R5_DONE_CALLBACK_URL).trim();
    const secret = String(process.env.STUDIO_R5_CALLBACK_SECRET || DEFAULT_R5_DONE_CALLBACK_TOKEN).trim();
    const target = `${url}${url.includes("?") ? "&" : "?"}k=${encodeURIComponent(secret)}`;

    const payload = JSON.stringify({
        source: "remotion-render-server",
        jobId: job.jobId,
        status: job.status,
        renderUrl: job.renderUrl || null,
        completedAt: job.completedAt || null,
        error: job.error || null,
    });

    appendLog(job, `Telling Studio the render finished (${job.status})`);
    fetch(target, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: payload,
    }).then((response) => {
        appendLog(job, `Studio R5 ping HTTP ${response.status}`);
    }).catch((error) => {
        appendLog(job, `Studio R5 ping failed: ${error.message}`);
    });
}

function getBaseUrl(req) {
    const protocol = req.protocol || 'http';
    const host = req.get('host');
    return `${protocol}://${host}`;
}

function isHttpUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function sanitizeSimpleName(value, fallback) {
    const raw = String(value || fallback || 'asset');

    return raw
        .replace(/\.[a-zA-Z0-9]+$/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || fallback || 'asset';
}

function sanitizeOutputFilename(value) {
    const raw = String(value || 'render.mp4');

    let cleaned = raw
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (!cleaned) {
        cleaned = 'render.mp4';
    }

    if (!path.extname(cleaned)) {
        cleaned += '.mp4';
    }

    return cleaned;
}

function googleDriveFileIdFromUrl(rawUrl) {
    const text = String(rawUrl || '').trim();
    if (!text) return '';
    try {
        const parsed = new URL(text);
        const host = parsed.hostname.toLowerCase();
        if (!host.includes('drive.google.com') && !host.includes('docs.google.com') && !host.includes('googleusercontent.com')) {
            return '';
        }
        const queryId = String(parsed.searchParams.get('id') || '').trim();
        if (/^[A-Za-z0-9_-]+$/.test(queryId)) return queryId;
        const fileMatch = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/i);
        if (fileMatch) return fileMatch[1];
        const dMatch = parsed.pathname.match(/\/d\/([A-Za-z0-9_-]+)/i);
        if (dMatch) return dMatch[1];
    } catch {}
    return '';
}

function getExtensionFromUrl(rawUrl, fallbackExt) {
    try {
        const parsed = new URL(rawUrl);
        const ext = path.extname(parsed.pathname).toLowerCase();

        if (ext && /^[.][a-z0-9]+$/i.test(ext)) {
            return ext;
        }
    } catch (error) {
        // Ignore and use fallback.
    }

    return fallbackExt;
}

function makeUniqueFilename(filename, usedFilenames) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);

    let candidate = filename;
    let counter = 2;

    while (usedFilenames.has(candidate.toLowerCase())) {
        candidate = `${base}-${counter}${ext}`;
        counter += 1;
    }

    usedFilenames.add(candidate.toLowerCase());
    return candidate;
}

function toPublicSrc(absoluteFilePath) {
    // Prefer absolute HTTP URLs under /job-assets so Remotion never needs these
    // files inside public/ (staticFile + public-dir copy).
    const relativeToJobAssets = path.relative(RENDER_ASSETS_DIR, absoluteFilePath);
    if (relativeToJobAssets && !relativeToJobAssets.startsWith('..') && !path.isAbsolute(relativeToJobAssets)) {
        const posix = relativeToJobAssets.split(path.sep).join('/');
        return `http://127.0.0.1:${PORT}${RENDER_ASSETS_URL_PREFIX}/${posix}`;
    }
    return path
        .relative(PUBLIC_DIR, absoluteFilePath)
        .split(path.sep)
        .join('/');
}

function toProjectRelative(absoluteFilePath) {
    return path
        .relative(PROJECT_DIR, absoluteFilePath)
        .split(path.sep)
        .join('/');
}


function toFiniteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function resolvePublicAssetPath(src) {
    if (!src || typeof src !== 'string') {
        return undefined;
    }

    if (path.isAbsolute(src)) {
        return src;
    }

    const normalized = src.replace(/^[/\\]+/, '');
    if (normalized.startsWith('job-assets/') || normalized.startsWith('render-assets/')) {
        const under = normalized.replace(/^(job-assets|render-assets)\//, '');
        const jobPath = path.join(RENDER_ASSETS_DIR, under);
        if (fs.existsSync(jobPath)) return jobPath;
        const legacy = path.join(PUBLIC_DIR, 'render-assets', under);
        if (fs.existsSync(legacy)) return legacy;
    }
    return path.join(PUBLIC_DIR, normalized);
}

function probeMediaDurationSeconds(filePath, job) {
    return new Promise((resolve, reject) => {
        const args = [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
            filePath,
        ];

        appendLog(job, `Probing media duration with ffprobe: ${toProjectRelative(filePath)}`);

        const child = spawn('ffprobe', args, {
            cwd: PROJECT_DIR,
            windowsHide: true,
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('error', (error) => {
            reject(
                new Error(
                    `Unable to start ffprobe for ${filePath}: ${error.message}`
                )
            );
        });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `ffprobe failed for ${filePath} with exit code ${code}: ${stderr.trim()}`
                    )
                );
                return;
            }

            const duration = Number.parseFloat(stdout.trim());

            if (!Number.isFinite(duration) || duration <= 0) {
                reject(
                    new Error(
                        `ffprobe returned an invalid duration for ${filePath}: ${stdout.trim()}`
                    )
                );
                return;
            }

            appendLog(job, `Measured voiceover duration: ${duration.toFixed(3)} seconds`);
            resolve(duration);
        });
    });
}

function getRequestedDurationFrames(body, clips, fps) {
    const explicit = toFiniteNumber(body.durationInFrames, 0);

    if (explicit > 0) {
        return Math.max(1, Math.round(explicit));
    }

    const clipTotal = Array.isArray(clips)
        ? clips.reduce(
            (sum, clip) =>
                sum + Math.max(1, Math.round(toFiniteNumber(clip.durationFrames, 1))),
            0
        )
        : 0;

    if (clipTotal > 0) {
        return clipTotal;
    }

    const requestedSeconds = toFiniteNumber(body.requestedDurationSeconds, 0);

    if (requestedSeconds > 0) {
        return Math.max(1, Math.ceil(requestedSeconds * fps));
    }

    return fps * 5;
}

function redistributeClipDurations(clips, targetFrames) {
    if (!Array.isArray(clips) || clips.length === 0) {
        throw new Error('Cannot redistribute an empty clips array.');
    }

    const safeTarget = Math.max(clips.length, Math.round(targetFrames));
    const originalDurations = clips.map((clip) =>
        Math.max(1, Math.round(toFiniteNumber(clip.durationFrames, 1)))
    );
    const originalTotal = originalDurations.reduce((sum, value) => sum + value, 0);

    if (originalTotal === safeTarget) {
        return clips.map((clip, index) => ({
            ...clip,
            durationFrames: originalDurations[index],
        }));
    }

    const raw = originalDurations.map(
        (duration) => (duration / originalTotal) * safeTarget
    );
    const allocated = raw.map((value) => Math.max(1, Math.floor(value)));
    let allocatedTotal = allocated.reduce((sum, value) => sum + value, 0);

    if (allocatedTotal < safeTarget) {
        const order = raw
            .map((value, index) => ({
                index,
                remainder: value - Math.floor(value),
            }))
            .sort((a, b) => b.remainder - a.remainder);

        let cursor = 0;

        while (allocatedTotal < safeTarget) {
            allocated[order[cursor % order.length].index] += 1;
            allocatedTotal += 1;
            cursor += 1;
        }
    } else if (allocatedTotal > safeTarget) {
        const order = allocated
            .map((value, index) => ({ index, value }))
            .sort((a, b) => b.value - a.value);

        let cursor = 0;

        while (allocatedTotal > safeTarget) {
            const target = order[cursor % order.length].index;

            if (allocated[target] > 1) {
                allocated[target] -= 1;
                allocatedTotal -= 1;
            }

            cursor += 1;

            if (cursor > safeTarget * clips.length * 2) {
                throw new Error('Unable to redistribute clip durations safely.');
            }
        }
    }

    return clips.map((clip, index) => ({
        ...clip,
        durationFrames: allocated[index],
    }));
}

async function ensureDirectories() {
    await fsp.mkdir(OUT_DIR, { recursive: true });
    await fsp.mkdir(RENDER_PROPS_DIR, { recursive: true });
    await fsp.mkdir(RENDER_ASSETS_DIR, { recursive: true });
}

function downloadUrlToFile(rawUrl, destinationFilePath, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        const client = rawUrl.startsWith('https://') ? https : http;

        const request = client.get(
            rawUrl,
            {
                headers: {
                    'User-Agent': 'SM-Pipeline-V2-Remotion-Render-Server',
                },
            },
            (response) => {
                const statusCode = response.statusCode || 0;

                if (
                    [301, 302, 303, 307, 308].includes(statusCode) &&
                    response.headers.location
                ) {
                    if (redirectsLeft <= 0) {
                        reject(new Error(`Too many redirects while downloading ${rawUrl}`));
                        return;
                    }

                    const redirectedUrl = new URL(response.headers.location, rawUrl).toString();
                    response.resume();

                    downloadUrlToFile(redirectedUrl, destinationFilePath, redirectsLeft - 1)
                        .then(resolve)
                        .catch(reject);

                    return;
                }

                if (statusCode < 200 || statusCode >= 300) {
                    response.resume();
                    reject(new Error(`Download failed ${statusCode}: ${rawUrl}`));
                    return;
                }

                const fileStream = fs.createWriteStream(destinationFilePath);

                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close(() => resolve(destinationFilePath));
                });

                fileStream.on('error', (error) => {
                    reject(error);
                });
            }
        );

        request.setTimeout(5 * 60 * 1000, () => {
            request.destroy(new Error(`Download timed out: ${rawUrl}`));
        });

        request.on('error', (error) => {
            reject(error);
        });
    });
}

async function rewriteClipAssets({ clips, jobId, jobAssetDir, job }) {
    if (!Array.isArray(clips) || clips.length === 0) {
        throw new Error('Request body must include a non-empty clips array.');
    }

    const usedFilenames = new Set();
    const rewrittenClips = [];

    for (let index = 0; index < clips.length; index += 1) {
        const clip = clips[index];
        const clipId = clip.id || `clip-${index + 1}`;
        const mediaKind = String(clip.mediaKind || clip.media_kind || '').trim().toLowerCase();
        const driveFileId = String(
            clip.googleDriveFileId
            || clip.google_drive_file_id
            || googleDriveFileIdFromUrl(clip.url)
            || googleDriveFileIdFromUrl(clip.src)
            || ''
        ).trim();
        const sourceUrl = driveFileId
            ? `${PIPELINE_RUNNER_INTERNAL_URL}/internal/drive-media/${encodeURIComponent(driveFileId)}`
            : clip.url;

        if (isHttpUrl(sourceUrl)) {
            const fallbackExt = mediaKind === 'video' ? '.mp4' : '.jpg';
            const ext = driveFileId
                ? (mediaKind === 'video' ? '.mp4' : getExtensionFromUrl(clip.url || clip.src || '', fallbackExt))
                : getExtensionFromUrl(sourceUrl, fallbackExt);
            const baseName = sanitizeSimpleName(clipId, `clip-${index + 1}`);
            const filename = makeUniqueFilename(`${baseName}${ext}`, usedFilenames);
            const destination = path.join(jobAssetDir, filename);

            appendLog(
                job,
                driveFileId
                    ? `Downloading video clip ${clipId} from private Drive authority`
                    : `Downloading clip ${clipId} from ${sourceUrl}`
            );
            await downloadUrlToFile(sourceUrl, destination);
            appendLog(job, `Downloaded clip ${clipId} to ${toProjectRelative(destination)}`);

            const rewrittenClip = {
                ...clip,
                src: toPublicSrc(destination),
            };

            delete rewrittenClip.url;

            rewrittenClips.push(rewrittenClip);
            continue;
        }

        if (clip.src) {
            const rewrittenClip = {
                ...clip,
            };

            delete rewrittenClip.url;

            rewrittenClips.push(rewrittenClip);
            continue;
        }

        if (clip.url && !isHttpUrl(clip.url)) {
            // Allows a local path accidentally sent as url instead of src.
            const rewrittenClip = {
                ...clip,
                src: clip.url,
            };

            delete rewrittenClip.url;

            rewrittenClips.push(rewrittenClip);
            continue;
        }

        throw new Error(`Clip ${index + 1} must include either src or url.`);
    }

    return rewrittenClips;
}

async function rewriteMusicAsset({ music, jobAssetDir, job }) {
    if (!music) {
        return undefined;
    }

    if (isHttpUrl(music.url)) {
        const ext = getExtensionFromUrl(music.url, '.mp3');
        const filename = `music${ext}`;
        const destination = path.join(jobAssetDir, filename);

        appendLog(job, `Downloading music from ${music.url}`);
        await downloadUrlToFile(music.url, destination);
        appendLog(job, `Downloaded music to ${toProjectRelative(destination)}`);

        const rewrittenMusic = {
            ...music,
            src: toPublicSrc(destination),
        };

        delete rewrittenMusic.url;

        return rewrittenMusic;
    }

    if (music.src) {
        const rewrittenMusic = {
            ...music,
        };

        delete rewrittenMusic.url;

        return rewrittenMusic;
    }

    if (music.url && !isHttpUrl(music.url)) {
        const rewrittenMusic = {
            ...music,
            src: music.url,
        };

        delete rewrittenMusic.url;

        return rewrittenMusic;
    }

    return undefined;
}


function normalizeVoiceover(body) {
    if (!body || typeof body !== 'object') {
        return undefined;
    }

    if (body.voiceover && typeof body.voiceover === 'object') {
        return body.voiceover;
    }

    // Backward-compatible alias for callers that send voiceoverUrl directly.
    if (typeof body.voiceoverUrl === 'string' && body.voiceoverUrl.trim()) {
        return {
            url: body.voiceoverUrl.trim(),
            volume:
                typeof body.voiceoverVolume === 'number'
                    ? body.voiceoverVolume
                    : 1,
        };
    }

    return undefined;
}

async function rewriteVoiceoverAsset({ voiceover, jobAssetDir, job }) {
    if (!voiceover) {
        return undefined;
    }

    if (isHttpUrl(voiceover.url)) {
        const ext = getExtensionFromUrl(voiceover.url, '.mp3');
        const filename = `voiceover${ext}`;
        const destination = path.join(jobAssetDir, filename);

        appendLog(job, `Downloading voiceover from ${voiceover.url}`);
        await downloadUrlToFile(voiceover.url, destination);
        appendLog(
            job,
            `Downloaded voiceover to ${toProjectRelative(destination)}`
        );

        const rewrittenVoiceover = {
            ...voiceover,
            src: toPublicSrc(destination),
        };

        delete rewrittenVoiceover.url;

        return rewrittenVoiceover;
    }

    if (voiceover.src) {
        const rewrittenVoiceover = {
            ...voiceover,
        };

        delete rewrittenVoiceover.url;

        return rewrittenVoiceover;
    }

    if (voiceover.url && !isHttpUrl(voiceover.url)) {
        const rewrittenVoiceover = {
            ...voiceover,
            src: voiceover.url,
        };

        delete rewrittenVoiceover.url;

        return rewrittenVoiceover;
    }

    throw new Error('Voiceover must include either src or url.');
}

async function rewriteWatermarkAsset({ watermarkUrl, jobAssetDir, job }) {
    const raw = String(watermarkUrl || '').trim();
    if (!raw) return '';

    const driveFileId = googleDriveFileIdFromUrl(raw);
    const sourceUrl = driveFileId
        ? `${PIPELINE_RUNNER_INTERNAL_URL}/internal/drive-media/${encodeURIComponent(driveFileId)}`
        : raw;

    if (!isHttpUrl(sourceUrl)) return raw;

    const ext = getExtensionFromUrl(raw, '.png');
    const safeExt = /\.(png|jpe?g|webp)$/i.test(ext) ? ext : '.png';
    const destination = path.join(jobAssetDir, `watermark${safeExt}`);

    appendLog(
        job,
        driveFileId
            ? 'Downloading watermark from private Drive authority'
            : `Downloading watermark from ${sourceUrl}`
    );
    await downloadUrlToFile(sourceUrl, destination);
    appendLog(job, `Downloaded watermark to ${toProjectRelative(destination)}`);
    return toPublicSrc(destination);
}

function compactRemotionFailure(job, exitCode) {
    const chunks = Array.isArray(job?.logs) ? job.logs : [];
    const clean = (value) => String(value || '')
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const candidates = [];
    for (const chunk of chunks.slice(-24)) {
        for (const line of String(chunk || '').split(/\r?\n/)) {
            const text = clean(line);
            if (!text) continue;
            if (/Error loading image with src:|ERR_BLOCKED_BY_ORB|Download failed 403|HTTP status code: 403/i.test(text)) {
                candidates.push(text);
            }
        }
    }
    const detail = candidates[candidates.length - 1] || '';
    const base = `Remotion render failed with exit code ${exitCode}`;
    return detail ? `${base}: ${detail}`.slice(0, 2000) : base;
}

async function buildRewrittenProps({ body, jobId, job }) {
    if (String(body.compositionId || '') === 'ARM-SMOKE') {
        const filename = sanitizeOutputFilename(body.filename || 'arm-smoke.mp4');
        return {
            filename,
            props: { filename },
        };
    }

    const jobAssetDir = path.join(RENDER_ASSETS_DIR, jobId);

    await fsp.mkdir(jobAssetDir, { recursive: true });

    const expectedClipCount = Math.max(
        0,
        Math.round(toFiniteNumber(body.expectedClipCount, 0))
    );
    const receivedClipCount = Array.isArray(body.clips) ? body.clips.length : 0;

    if (expectedClipCount > 0 && receivedClipCount !== expectedClipCount) {
        throw new Error(
            `Render clip count mismatch before asset download: expected ` +
            `${expectedClipCount}, received ${receivedClipCount}.`
        );
    }

    const rewrittenClips = await rewriteClipAssets({
        clips: body.clips,
        jobId,
        jobAssetDir,
        job,
    });

    if (
        expectedClipCount > 0 &&
        rewrittenClips.length !== expectedClipCount
    ) {
        throw new Error(
            `Render clip count mismatch after asset download: expected ` +
            `${expectedClipCount}, retained ${rewrittenClips.length}.`
        );
    }

    const rewrittenMusic = await rewriteMusicAsset({
        music: body.music,
        jobAssetDir,
        job,
    });

    const rewrittenVoiceover = await rewriteVoiceoverAsset({
        voiceover: normalizeVoiceover(body),
        jobAssetDir,
        job,
    });

    const rewrittenWatermarkUrl = await rewriteWatermarkAsset({
        watermarkUrl: body.watermarkUrl,
        jobAssetDir,
        job,
    });

    const filename = sanitizeOutputFilename(body.filename || `${jobId}.mp4`);
    const fps = Math.max(
        1,
        Math.round(toFiniteNumber(body.fps, DEFAULT_FPS))
    );
    const requestedDurationFrames = getRequestedDurationFrames(
        body,
        rewrittenClips,
        fps
    );

    let voiceoverDurationSeconds;
    let voiceoverEndFrame;
    let effectiveTailSeconds = 0;
    let finalDurationFrames = requestedDurationFrames;

    if (rewrittenVoiceover) {
        const voiceoverPath = resolvePublicAssetPath(rewrittenVoiceover.src);

        if (!voiceoverPath) {
            throw new Error(
                'Voiceover was provided, but its local file path could not be resolved.'
            );
        }

        voiceoverDurationSeconds = await probeMediaDurationSeconds(
            voiceoverPath,
            job
        );

        effectiveTailSeconds = clamp(
            toFiniteNumber(
                body.voiceoverTailSeconds,
                DEFAULT_VOICEOVER_TAIL_SECONDS
            ),
            0,
            30
        );

        voiceoverEndFrame = Math.ceil(voiceoverDurationSeconds * fps);
        const voiceoverRequiredFrames = Math.ceil(
            (voiceoverDurationSeconds + effectiveTailSeconds) * fps
        );

        const durationIsExplicit = body.durationIsExplicit === true || body.durationIsExplicit === true;
        finalDurationFrames = durationIsExplicit
            ? Math.max(requestedDurationFrames, voiceoverRequiredFrames)
            : voiceoverRequiredFrames;

        appendLog(
            job,
            `Voiceover-aware duration: requested=${requestedDurationFrames} frames, ` +
            `voiceover=${voiceoverEndFrame} frames, tail=${effectiveTailSeconds}s, ` +
            `explicit=${durationIsExplicit}, final=${finalDurationFrames} frames`
        );
    } else {
        appendLog(
            job,
            `No voiceover supplied. Ignoring voiceoverTailSeconds and keeping ` +
            `${requestedDurationFrames} requested frames.`
        );
    }

    const hasTimingPlan = Boolean(body.timingPlan && typeof body.timingPlan === 'object');
    const adjustedClips = hasTimingPlan
        ? rewrittenClips.map((clip) => ({
            ...clip,
            durationFrames: Math.max(1, Math.round(toFiniteNumber(clip.durationFrames, 1))),
        }))
        : redistributeClipDurations(
            rewrittenClips,
            finalDurationFrames
        );
    if (hasTimingPlan) {
        const timedTotal = adjustedClips.reduce(
            (sum, clip) => sum + Math.max(1, Math.round(toFiniteNumber(clip.durationFrames, 1))),
            0
        );
        if (finalDurationFrames > timedTotal) {
            appendLog(
                job,
                `Timing plan present; keeping authored clip durations ` +
                `(not holding last clip; plan=${timedTotal} final=${finalDurationFrames}).`
            );
        } else {
            appendLog(job, 'Timing plan present; keeping authored clip durations.');
            finalDurationFrames = timedTotal;
        }
    }

    const baseMusicVolume = rewrittenMusic
        ? clamp(
            toFiniteNumber(
                rewrittenMusic.volume,
                toFiniteNumber(body.musicVolume, 0.072)
            ),
            0,
            1
        )
        : 0;

    const defaultBoostedMusicVolume = clamp(
        baseMusicVolume + DEFAULT_MUSIC_BOOST_DELTA,
        baseMusicVolume,
        1
    );

    const postVoiceoverMusicVolume = rewrittenVoiceover
        ? clamp(
            toFiniteNumber(
                body.postVoiceoverMusicVolume,
                defaultBoostedMusicVolume
            ),
            baseMusicVolume,
            1
        )
        : baseMusicVolume;

    const musicBoostFadeSeconds = clamp(
        toFiniteNumber(
            body.musicBoostFadeSeconds,
            DEFAULT_MUSIC_BOOST_FADE_SECONDS
        ),
        0,
        5
    );

    const musicEndFadeSeconds = clamp(
        toFiniteNumber(
            body.musicEndFadeSeconds,
            DEFAULT_MUSIC_END_FADE_SECONDS
        ),
        0,
        5
    );

    const props = {
        ...body,
        filename,
        fps,
        durationInFrames: finalDurationFrames,
        requestedDurationFrames,
        voiceoverTailSeconds: effectiveTailSeconds,
        voiceoverDurationSeconds,
        voiceoverEndFrame,
        postVoiceoverMusicVolume,
        musicBoostFadeFrames: Math.round(musicBoostFadeSeconds * fps),
        musicEndFadeFrames: Math.round(musicEndFadeSeconds * fps),
        sourceClipCount: rewrittenClips.length,
        clips: adjustedClips,
    };

    if (rewrittenMusic) {
        props.music = {
            ...rewrittenMusic,
            volume: baseMusicVolume,
        };
        props.musicVolume = baseMusicVolume;
    }

    if (rewrittenVoiceover) {
        props.voiceover = rewrittenVoiceover;
    }

    if (rewrittenWatermarkUrl) {
        props.watermarkUrl = rewrittenWatermarkUrl;
    } else {
        delete props.watermarkUrl;
    }

    if (
        rewrittenVoiceover &&
        typeof rewrittenVoiceover.volume === 'number'
    ) {
        props.voiceoverVolume = rewrittenVoiceover.volume;
    }

    // Remove the top-level compatibility alias after normalizing it.
    delete props.voiceoverUrl;

    // These are server-only controls and should not be passed into Remotion props.
    delete props.compositionId;
    delete props.requestedDurationSeconds;

    return {
        filename,
        props,
    };
}

async function savePropsFile({ jobId, props }) {
    const propsFilePath = path.join(RENDER_PROPS_DIR, `${jobId}.json`);

    // Node writes UTF-8 without BOM by default.
    await fsp.writeFile(propsFilePath, JSON.stringify(props, null, 2), 'utf8');

    return propsFilePath;
}

function runRemotionRender({ jobId, compositionId, filename, propsFilePath }) {
    const job = jobs.get(jobId);

    return (async () => {
        await acquireRemotionSlot(job);
        try {
            await new Promise((resolve, reject) => {
                const outputRelative = `out/${filename}`;
                const propsRelative = `./${toProjectRelative(propsFilePath)}`;

                const browser = String(process.env.REMOTION_BROWSER_EXECUTABLE || '').trim();
                const browserFlag = browser ? ` --browser-executable="${browser}"` : '';
                // Empty public-dir keeps Remotion from copying multi-GB job assets.
                // Clips/music/VO/watermark are absolute http://127.0.0.1:PORT/job-assets/... URLs.
                const emptyPublicDir = path.join(PROJECT_DIR, 'public-empty');
                fs.mkdirSync(emptyPublicDir, { recursive: true });
                const command =
                    `npx remotion render src/index.ts ${compositionId} ` +
                    `"${outputRelative}" ` +
                    `"--props=${propsRelative}" ` +
                    `--public-dir="${emptyPublicDir}" ` +
                    `--overwrite${browserFlag}`;

                job.status = 'rendering';
                job.renderCommand = command;
                job.updatedAt = nowIso();

                appendLog(job, `Starting Remotion render: ${command}`);

                const child = spawn(command, {
                    cwd: PROJECT_DIR,
                    shell: true,
                    windowsHide: true,
                });
                job.childPid = child.pid || null;

                child.stdout.on('data', (data) => {
                    appendLog(job, data.toString());
                });

                child.stderr.on('data', (data) => {
                    appendLog(job, data.toString());
                });

                child.on('error', (error) => {
                    job.status = 'failed';
                    job.error = error.message;
                    job.updatedAt = nowIso();

                    appendLog(job, `Render process error: ${error.message}`);
                    notifyStudioR5Done(job);
                    reject(error);
                });

                child.on('close', (code) => {
                    job.exitCode = code;
                    job.updatedAt = nowIso();
                    job.childPid = null;

                    if (code === 0) {
                        job.status = 'completed';
                        job.completedAt = nowIso();
                        appendLog(job, `Render completed: ${outputRelative}`);
                        notifyStudioR5Done(job);
                        resolve();
                    } else {
                        job.status = 'failed';
                        job.error = compactRemotionFailure(job, code);
                        appendLog(job, job.error);
                        notifyStudioR5Done(job);
                        reject(new Error(job.error));
                    }
                });
            });
        } finally {
            releaseRemotionSlot();
        }
    })();
}

app.get('/health', async (req, res) => {
    res.json({
        ok: true,
        service: 'SM Pipeline V2 Remotion Render Server',
        version: SERVICE_VERSION,
        voiceoverSupport: true,
        voiceoverAwareDuration: true,
        defaultVoiceoverTailSeconds: DEFAULT_VOICEOVER_TAIL_SECONDS,
        postVoiceoverMusicBoost: true,
        privateDriveImageLocalization: true,
        watermarkLocalization: true,
        jobAssetsOutsidePublic: true,
        remotionMaxConcurrent: MAX_CONCURRENT_REMOTION_RENDERS,
        remotionActiveRenders: activeRemotionRenders,
        remotionQueuedRenders: remotionRenderWaiters.length,
        cleanup: {
            enabled: true,
            staleHours: remotionCleanup.staleHours,
            sweepIntervalMs: remotionCleanup.sweepIntervalMs,
            lastSweep: remotionCleanup.getLastSweep(),
        },
        port: PORT,
        time: nowIso(),
    });
});

app.get('/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);

    if (!job) {
        res.status(404).json({
            found: false,
            error: 'Job not found.',
        });
        return;
    }

    res.json({
        found: true,
        ...job,
    });
});

app.post('/render', async (req, res) => {
    await ensureDirectories();

    const body = req.body || {};
    const jobId = body.jobId || makeJobId();
    const compositionId = body.compositionId || 'TEST-REMOTION-V4';
    const baseUrl = getBaseUrl(req);

    const job = {
        jobId,
        compositionId,
        status: 'preparing',
        accepted: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        logs: [],
    };

    jobs.set(jobId, job);

    try {
        const { filename, props } = await buildRewrittenProps({
            body,
            jobId,
            job,
        });

        const propsFilePath = await savePropsFile({
            jobId,
            props,
        });

        const renderUrl = `${baseUrl}/out/${filename}`;
        const statusUrl = `${baseUrl}/status/${jobId}`;

        job.accepted = true;
        job.filename = filename;
        job.propsFile = toProjectRelative(propsFilePath);
        job.renderUrl = renderUrl;
        job.statusUrl = statusUrl;
        job.props = props;
        job.updatedAt = nowIso();

        // Start the render in the background.
        runRemotionRender({
            jobId,
            compositionId,
            filename,
            propsFilePath,
        }).catch((error) => {
            const failedJob = jobs.get(jobId);
            if (failedJob) {
                failedJob.status = 'failed';
                failedJob.error = error.message;
                failedJob.updatedAt = nowIso();
            }
        });

        res.json({
            accepted: true,
            jobId,
            status: job.status,
            statusUrl,
            renderUrl,
            props,
        });
    } catch (error) {
        job.status = 'failed';
        job.error = error.message;
        job.updatedAt = nowIso();

        res.status(500).json({
            accepted: false,
            jobId,
            status: 'failed',
            error: error.message,
        });
    }
});

app.listen(PORT, '0.0.0.0', async () => {
    await ensureDirectories();
    await remotionCleanup.runStartupSweep();
    remotionCleanup.startStaleSweepTimer();

    console.log(`SM Pipeline V2 Remotion render server running on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`Render: http://localhost:${PORT}/render`);
    console.log(`Cleanup: http://localhost:${PORT}/cleanup/<jobId>`);
});
