'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {spawn} = require('child_process');

const PORT = Number(process.env.PORT || 3012);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const MAX_INPUT_BYTES = Number(process.env.MAX_INPUT_BYTES || 25 * 1024 * 1024);
const FILE_TTL_MS = Number(process.env.FILE_TTL_MS || 15 * 60 * 1000);
const TEMP_ROOT = path.join(os.tmpdir(), 'chicagoshining-voiceover-normalizer');
const files = new Map();

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function safeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, {windowsHide: true});
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

function parseLoudnormJson(stderr) {
  const matches = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/g);
  if (!matches || !matches.length) {
    throw new Error('Unable to parse ffmpeg loudnorm measurements.');
  }
  return JSON.parse(matches[matches.length - 1]);
}

async function measure(inputPath, targetI, targetTp, targetLra) {
  const filter = `loudnorm=I=${targetI}:TP=${targetTp}:LRA=${targetLra}:print_format=json`;
  const stderr = await runFfmpeg([
    '-hide_banner', '-nostats', '-i', inputPath,
    '-vn', '-af', filter, '-f', 'null', '-'
  ]);
  return parseLoudnormJson(stderr);
}

async function normalize(inputPath, outputPath, config, firstPass) {
  const measuredI = safeNumber(firstPass.input_i, -70);
  const measuredTp = safeNumber(firstPass.input_tp, -70);
  const measuredLra = safeNumber(firstPass.input_lra, 0);
  const measuredThresh = safeNumber(firstPass.input_thresh, -70);
  const offset = safeNumber(firstPass.target_offset, 0);
  const filter = [
    `loudnorm=I=${config.targetI}`,
    `TP=${config.targetTp}`,
    `LRA=${config.targetLra}`,
    `measured_I=${measuredI}`,
    `measured_TP=${measuredTp}`,
    `measured_LRA=${measuredLra}`,
    `measured_thresh=${measuredThresh}`,
    `offset=${offset}`,
    'linear=true',
    'print_format=summary'
  ].join(':');

  await runFfmpeg([
    '-hide_banner', '-nostats', '-y', '-i', inputPath,
    '-vn', '-af', filter,
    '-ar', '44100', '-b:a', `${config.bitrateKbps}k`,
    outputPath
  ]);
}

function publicBase(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || 'http';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

async function cleanupToken(token) {
  const entry = files.get(token);
  if (!entry) return;
  files.delete(token);
  await fsp.rm(entry.dir, {recursive: true, force: true}).catch(() => {});
}

async function handleNormalize(req, res) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('audio/') && !contentType.includes('application/octet-stream')) {
    return json(res, 415, {ok: false, error: 'Send the MP3 as the raw request body with Content-Type audio/mpeg.'});
  }

  const targetI = safeNumber(req.headers['x-target-lufs'], -16);
  const targetTp = safeNumber(req.headers['x-true-peak-dbtp'], -1.5);
  const targetLra = safeNumber(req.headers['x-target-lra'], 7);
  const bitrateKbps = Math.max(64, Math.min(320, safeNumber(req.headers['x-output-bitrate-kbps'], 128)));
  const originalName = String(req.headers['x-filename'] || 'voiceover.mp3').replace(/[^a-zA-Z0-9._-]/g, '_');
  const token = crypto.randomUUID();
  const dir = path.join(TEMP_ROOT, token);
  const inputPath = path.join(dir, 'input.mp3');
  const outputPath = path.join(dir, 'normalized.mp3');

  await fsp.mkdir(dir, {recursive: true});
  const out = fs.createWriteStream(inputPath, {flags: 'wx'});
  let bytes = 0;
  let aborted = false;

  req.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > MAX_INPUT_BYTES && !aborted) {
      aborted = true;
      req.destroy(new Error('Input exceeds maximum allowed size.'));
    }
  });

  try {
    await new Promise((resolve, reject) => {
      req.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
      req.on('error', reject);
    });
    if (!bytes) throw new Error('Empty audio body.');

    const config = {targetI, targetTp, targetLra, bitrateKbps};
    const inputMetrics = await measure(inputPath, targetI, targetTp, targetLra);
    await normalize(inputPath, outputPath, config, inputMetrics);
    const outputMetrics = await measure(outputPath, targetI, targetTp, targetLra);
    const stat = await fsp.stat(outputPath);

    const entry = {
      token,
      dir,
      outputPath,
      originalName,
      createdAt: Date.now(),
      expiresAt: Date.now() + FILE_TTL_MS,
    };
    files.set(token, entry);

    const inputI = safeNumber(inputMetrics.input_i, null);
    const outputI = safeNumber(outputMetrics.input_i, null);
    const outputTp = safeNumber(outputMetrics.input_tp, null);
    const estimatedGain = inputI !== null && outputI !== null ? Number((outputI - inputI).toFixed(2)) : null;

    return json(res, 200, {
      ok: true,
      normalized: true,
      service: 'ChicagoShining Voiceover Normalizer',
      service_version: '1.0.0',
      filename: originalName.replace(/\.mp3$/i, '') + '_normalized.mp3',
      download_url: `${publicBase(req)}/files/${token}`,
      expires_in_seconds: Math.floor(FILE_TTL_MS / 1000),
      output_size_bytes: stat.size,
      target: {
        integrated_lufs: targetI,
        true_peak_dbtp: targetTp,
        loudness_range_lu: targetLra,
        bitrate_kbps: bitrateKbps,
      },
      metrics: {
        input_integrated_lufs: inputI,
        input_true_peak_dbtp: safeNumber(inputMetrics.input_tp, null),
        input_loudness_range_lu: safeNumber(inputMetrics.input_lra, null),
        output_integrated_lufs: outputI,
        output_true_peak_dbtp: outputTp,
        output_loudness_range_lu: safeNumber(outputMetrics.input_lra, null),
        estimated_gain_db: estimatedGain,
      }
    });
  } catch (err) {
    await fsp.rm(dir, {recursive: true, force: true}).catch(() => {});
    if (!res.headersSent) {
      return json(res, bytes > MAX_INPUT_BYTES ? 413 : 500, {ok: false, error: err.message});
    }
  }
}

async function handleFile(req, res, token) {
  const entry = files.get(token);
  if (!entry) return json(res, 404, {ok: false, error: 'File is missing or expired.'});
  try {
    const stat = await fsp.stat(entry.outputPath);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${entry.originalName.replace(/\.mp3$/i, '')}_normalized.mp3"`,
      'Cache-Control': 'no-store',
    });
    const stream = fs.createReadStream(entry.outputPath);
    stream.pipe(res);
    stream.on('error', err => {
      if (!res.headersSent) json(res, 500, {ok: false, error: err.message});
      else res.destroy(err);
    });
    res.on('finish', () => cleanupToken(token));
  } catch (err) {
    await cleanupToken(token);
    return json(res, 404, {ok: false, error: 'File is missing or expired.'});
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'ChicagoShining Voiceover Normalizer',
        version: '1.0.0',
        port: PORT,
        ffmpeg: FFMPEG,
        active_files: files.size,
      });
    }
    if (req.method === 'POST' && url.pathname === '/normalize-audio') {
      return await handleNormalize(req, res);
    }
    const match = url.pathname.match(/^\/files\/([0-9a-f-]+)$/i);
    if (req.method === 'GET' && match) {
      return await handleFile(req, res, match[1]);
    }
    return json(res, 404, {ok: false, error: 'Not found.'});
  } catch (err) {
    if (!res.headersSent) json(res, 500, {ok: false, error: err.message});
  }
});

fsp.mkdir(TEMP_ROOT, {recursive: true}).then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ChicagoShining Voiceover Normalizer listening on http://localhost:${PORT}`);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of files.entries()) {
    if (entry.expiresAt <= now) cleanupToken(token);
  }
}, 60_000).unref();

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
