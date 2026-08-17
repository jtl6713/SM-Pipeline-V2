'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DEFAULT_STALE_HOURS = 72;
const ACTIVE_STATUSES = new Set(['preparing', 'rendering', 'queued', 'processing', 'started']);

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

    async function runStartupSweep() {
        const threshold = Number.isFinite(staleHours) && staleHours >= 24 ? staleHours : DEFAULT_STALE_HOURS;
        const result = {
            ok: true,
            staleHours: threshold,
            removed: [],
            skippedActive: [],
            errors: [],
            sweptAt: isoNow(),
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

        result.ok = result.errors.length === 0;
        await log('Startup stale sweep completed', result);
        return result;
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
        staleHours,
        logFile,
    };
}

module.exports = { registerRemotionCleanup };
