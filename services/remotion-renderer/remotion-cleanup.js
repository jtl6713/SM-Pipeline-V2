'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const DEFAULT_STALE_HOURS = 72;
const DEFAULT_TEMP_PROFILE_TTL_HOURS = 24;
const ACTIVE_STATUSES = new Set(['preparing', 'rendering', 'queued', 'processing', 'started']);

// Remotion's Chrome leaves one folder per launch in os.tmpdir() and does not
// remove it. Only these exact disposable names, and only as direct children.
const DISPOSABLE_TEMP_DIR = /^(?:puppeteer_dev_chrome_profile-[A-Za-z0-9]+|remotion-webpack-bundle-[A-Za-z0-9]+|remotion-v\d+\.\d+\.\d+-assets[A-Za-z0-9]+)$/;

function isDisposableTempDirName(name) {
    return typeof name === 'string' && DISPOSABLE_TEMP_DIR.test(name);
}

function positiveHours(value, fallback) {
    const hours = Number(value);
    return Number.isFinite(hours) && hours > 0 ? hours : fallback;
}

async function sweepDisposableTempDirs(options) {
    const root = options.root;
    const ttlMs = positiveHours(options.ttlHours, DEFAULT_TEMP_PROFILE_TTL_HOURS) * 3600000;
    const now = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const summary = { removed: 0, skippedFresh: 0, errors: 0, skippedUnsafe: 0 };
    let entries;
    try {
        entries = await fsp.readdir(root, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') return summary;
        summary.errors += 1;
        return summary;
    }
    const resolvedRoot = path.resolve(root);
    for (const entry of entries) {
        if (!entry.isDirectory() || !isDisposableTempDirName(entry.name)) continue;
        const target = path.resolve(resolvedRoot, entry.name);
        if (path.dirname(target) !== resolvedRoot) {
            summary.skippedUnsafe += 1;
            continue;
        }
        let mtimeMs;
        try {
            mtimeMs = (await fsp.stat(target)).mtimeMs;
        } catch {
            summary.errors += 1;
            continue;
        }
        if (now - mtimeMs < ttlMs) {
            summary.skippedFresh += 1;
            continue;
        }
        try {
            await fsp.rm(target, { recursive: true, force: true });
            summary.removed += 1;
        } catch {
            summary.errors += 1;
        }
    }
    return summary;
}

function isSafeJobId(value) {
    return typeof value === 'string' && /^job-[A-Za-z0-9_-]+$/.test(value);
}

function safeOutputFilename(value) {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const name = path.basename(value.trim());
    if (name !== value.trim()) return undefined;
    if (!/^[A-Za-z0-9._-]+\.mp4$/i.test(name)) return undefined;
    return name;
}

function isoNow() {
    return new Date().toISOString();
}

function registerRemotionCleanup(options) {
    const {
        app,
        jobs,
        projectDir,
        outDir,
        renderPropsDir,
        renderAssetsDir,
        staleHours = Number(process.env.REMOTION_STALE_CLEANUP_HOURS || DEFAULT_STALE_HOURS),
        sweepIntervalMs = Number(process.env.REMOTION_STALE_SWEEP_INTERVAL_MS || 60 * 60 * 1000),
        tempRoot = process.env.REMOTION_TEMP_PROFILE_ROOT || os.tmpdir(),
        tempProfileTtlHours = Number(process.env.REMOTION_TEMP_PROFILE_TTL_HOURS || DEFAULT_TEMP_PROFILE_TTL_HOURS),
    } = options;

    if (!app || !jobs || !projectDir || !outDir || !renderPropsDir || !renderAssetsDir) {
        throw new Error('registerRemotionCleanup requires app, jobs, projectDir, outDir, renderPropsDir, and renderAssetsDir.');
    }

    const logDir = path.join(projectDir, 'logs');
    const logFile = path.join(logDir, 'remotion-cleanup.log');

    async function log(message, details) {
        await fsp.mkdir(logDir, { recursive: true });
        const suffix = details === undefined ? '' : ` ${JSON.stringify(details)}`;
        const line = `[${isoNow()}] ${message}${suffix}\n`;
        await fsp.appendFile(logFile, line, 'utf8').catch(() => {});
        console.log(`[cleanup] ${message}${suffix}`);
    }

    async function removePath(target, label, result) {
        try {
            await fsp.rm(target, { recursive: true, force: true });
            result.removed.push({ label, path: target });
        } catch (error) {
            result.errors.push({ label, path: target, error: error.message });
        }
    }

    function resolveJobFilename(jobId, requestedFilename) {
        const job = jobs.get(jobId);
        const fromJob = safeOutputFilename(job && job.filename);
        return fromJob || safeOutputFilename(requestedFilename);
    }

    async function cleanupJob(jobId, requestedFilename) {
        const result = {
            ok: true,
            duplicateSafe: true,
            jobId,
            removed: [],
            errors: [],
            cleanedAt: isoNow(),
        };

        if (!isSafeJobId(jobId)) {
            result.ok = false;
            result.errors.push({ error: 'Unsafe or invalid jobId.' });
            return result;
        }

        const job = jobs.get(jobId);
        if (job && ACTIVE_STATUSES.has(String(job.status || '').toLowerCase())) {
            result.ok = false;
            result.errors.push({ error: `Refusing cleanup while job status is ${job.status}.` });
            await log('Refused cleanup for active job', { jobId, status: job.status });
            return result;
        }

        await removePath(path.join(renderAssetsDir, jobId), 'render-assets', result);
        await removePath(path.join(renderPropsDir, `${jobId}.json`), 'props-json', result);

        const filename = resolveJobFilename(jobId, requestedFilename);
        if (filename) {
            await removePath(path.join(outDir, filename), 'rendered-mp4', result);
        } else {
            result.errors.push({ error: 'No safe output filename was available; MP4 was left untouched.' });
        }

        result.ok = result.errors.length === 0;

        if (job) {
            job.cleanup = {
                ok: result.ok,
                cleanedAt: result.cleanedAt,
                removed: result.removed,
                errors: result.errors,
            };
            job.updatedAt = isoNow();
        }

        await log('Per-job cleanup completed', result);
        return result;
    }

    async function ageHours(target) {
        try {
            const stat = await fsp.stat(target);
            return (Date.now() - stat.mtimeMs) / 3600000;
        } catch {
            return undefined;
        }
    }

    async function listEntries(dir) {
        try {
            return await fsp.readdir(dir, { withFileTypes: true });
        } catch (error) {
            if (error.code === 'ENOENT') return [];
            throw error;
        }
    }

    function activeJobIds() {
        const ids = new Set();
        for (const [jobId, job] of jobs.entries()) {
            if (ACTIVE_STATUSES.has(String(job.status || '').toLowerCase())) ids.add(jobId);
        }
        return ids;
    }

    function activeFilenames() {
        const names = new Set();
        for (const job of jobs.values()) {
            if (ACTIVE_STATUSES.has(String(job.status || '').toLowerCase())) {
                const name = safeOutputFilename(job.filename);
                if (name) names.add(name.toLowerCase());
            }
        }
        return names;
    }

    let lastSweep = null;
    let sweepTimer = null;

    async function runStartupSweep() {
        const threshold = Number.isFinite(staleHours) && staleHours >= 24 ? staleHours : DEFAULT_STALE_HOURS;
        const result = {
            ok: true,
            staleHours: threshold,
            removed: [],
            skippedActive: [],
            errors: [],
            sweptAt: isoNow(),
            tempProfiles: null,
            legacyPublicRenderAssets: { removed: 0, errors: 0 },
        };
        const activeIds = activeJobIds();
        const activeNames = activeFilenames();

        await fsp.mkdir(outDir, { recursive: true });
        await fsp.mkdir(renderPropsDir, { recursive: true });
        await fsp.mkdir(renderAssetsDir, { recursive: true });

        for (const entry of await listEntries(renderAssetsDir)) {
            if (!entry.isDirectory()) continue;
            const jobId = entry.name;
            if (activeIds.has(jobId)) {
                result.skippedActive.push({ type: 'render-assets', jobId });
                continue;
            }
            const target = path.join(renderAssetsDir, entry.name);
            const age = await ageHours(target);
            if (age !== undefined && age >= threshold) {
                await removePath(target, 'stale-render-assets', result);
            }
        }

        for (const entry of await listEntries(renderPropsDir)) {
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
            const jobId = entry.name.slice(0, -5);
            if (activeIds.has(jobId)) {
                result.skippedActive.push({ type: 'props-json', jobId });
                continue;
            }
            const target = path.join(renderPropsDir, entry.name);
            const age = await ageHours(target);
            if (age !== undefined && age >= threshold) {
                await removePath(target, 'stale-props-json', result);
            }
        }

        for (const entry of await listEntries(outDir)) {
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.mp4')) continue;
            if (activeNames.has(entry.name.toLowerCase())) {
                result.skippedActive.push({ type: 'rendered-mp4', filename: entry.name });
                continue;
            }
            const target = path.join(outDir, entry.name);
            const age = await ageHours(target);
            if (age !== undefined && age >= threshold) {
                await removePath(target, 'stale-rendered-mp4', result);
            }
        }

        const legacyRoot = path.join(projectDir, 'public', 'render-assets');
        const resolvedProject = path.resolve(projectDir);
        const resolvedLegacy = path.resolve(legacyRoot);
        if (resolvedLegacy.startsWith(resolvedProject + path.sep)) {
            for (const entry of await listEntries(legacyRoot)) {
                if (!entry.isDirectory() || !isSafeJobId(entry.name)) continue;
                if (activeIds.has(entry.name)) {
                    result.skippedActive.push({ type: 'legacy-public-render-assets', jobId: entry.name });
                    continue;
                }
                const target = path.join(legacyRoot, entry.name);
                const age = await ageHours(target);
                if (age !== undefined && age >= threshold) {
                    const before = result.removed.length;
                    await removePath(target, 'stale-legacy-public-render-assets', result);
                    if (result.removed.length > before) result.legacyPublicRenderAssets.removed += 1;
                    else result.legacyPublicRenderAssets.errors += 1;
                }
            }
        }

        result.tempProfiles = await sweepDisposableTempDirs({
            root: tempRoot,
            ttlHours: tempProfileTtlHours,
        });

        result.ok = result.errors.length === 0 && result.tempProfiles.errors === 0 && result.legacyPublicRenderAssets.errors === 0;
        lastSweep = result;
        await log('Stale sweep completed', {
            ok: result.ok,
            staleHours: result.staleHours,
            removed: result.removed.length,
            skippedActive: result.skippedActive.length,
            errors: result.errors.length,
            tempProfiles: result.tempProfiles,
            legacyPublicRenderAssets: result.legacyPublicRenderAssets,
            sweptAt: result.sweptAt,
        });
        return result;
    }

    function startStaleSweepTimer() {
        if (sweepTimer) return sweepTimer;
        const interval = Number.isFinite(sweepIntervalMs) && sweepIntervalMs >= 60 * 1000
            ? sweepIntervalMs
            : 60 * 60 * 1000;
        sweepTimer = setInterval(() => {
            runStartupSweep().catch((error) => {
                log('Stale sweep failed', { error: error.message }).catch(() => {});
            });
        }, interval);
        if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
        return sweepTimer;
    }

    app.post('/cleanup/:jobId', async (req, res) => {
        try {
            const result = await cleanupJob(req.params.jobId, req.body && req.body.filename);
            // Always return HTTP 200. Cleanup is post-commit housekeeping and must not reverse a durable render success.
            res.status(200).json(result);
        } catch (error) {
            await log('Unexpected cleanup endpoint error', { jobId: req.params.jobId, error: error.message });
            res.status(200).json({
                ok: false,
                duplicateSafe: true,
                jobId: req.params.jobId,
                error: error.message,
                cleanedAt: isoNow(),
            });
        }
    });

    return {
        cleanupJob,
        runStartupSweep,
        startStaleSweepTimer,
        staleHours,
        sweepIntervalMs,
        getLastSweep: () => lastSweep,
        logFile,
    };
}

module.exports = {
    registerRemotionCleanup,
    isDisposableTempDirName,
    sweepDisposableTempDirs,
};
