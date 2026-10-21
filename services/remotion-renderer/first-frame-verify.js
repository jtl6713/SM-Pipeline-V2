'use strict';
const fs = require('fs');
const {spawn} = require('child_process');

function execute(binary, args, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {windowsHide: true});
    const chunks = [];
    let size = 0;
    let errorText = '';
    child.stdout.on('data', (data) => {
      size += data.length;
      if (size > maxBytes) {
        child.kill();
        return;
      }
      chunks.push(data);
    });
    child.stderr.on('data', (data) => { errorText += data.toString().slice(0, 4000); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 || size > maxBytes) {
        reject(new Error(`${binary} exited ${code}: ${errorText.slice(-500)}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const SAMPLE_DIM = 160;
const SAMPLE_BYTES = SAMPLE_DIM * SAMPLE_DIM * 3;

function averageRgb(raw) {
  if (raw.length !== SAMPLE_BYTES) throw new Error('Decoded first-frame sample is incomplete.');
  let sum = 0;
  for (const value of raw) sum += value;
  return sum / raw.length;
}

function pixelError(a, b) {
  if (a.length !== SAMPLE_BYTES || b.length !== SAMPLE_BYTES) {
    throw new Error('Cover and MP4 decoded frame sizes do not match.');
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

async function sampleVideo(file, seconds) {
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (seconds > 0) args.push('-ss', String(seconds));
  args.push('-i', file, '-vf', `scale=${SAMPLE_DIM}:${SAMPLE_DIM}:flags=lanczos,format=rgb24`,
    '-frames:v', '1', '-f', 'rawvideo', 'pipe:1');
  return execute(FFMPEG, args);
}

async function sampleCover(file, width, height) {
  return execute(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-i', file,
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},scale=${SAMPLE_DIM}:${SAMPLE_DIM}:flags=lanczos,format=rgb24`,
    '-frames:v', '1', '-f', 'rawvideo', 'pipe:1',
  ]);
}

async function verifyFirstFrame({videoPath, coverPath, previewPath, threshold = 24}) {
  if (!fs.existsSync(videoPath) || !fs.existsSync(coverPath)) {
    throw new Error('Missing completed MP4 or Studio cover for first-frame verification.');
  }
  const dimensions = JSON.parse((await execute(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
    '-of', 'json', videoPath,
  ])).toString('utf8'));
  const {width, height} = dimensions.streams?.[0] || {};
  if (!width || !height) throw new Error('Finished MP4 has no readable video dimensions.');
  const reference = await sampleCover(coverPath, width, height);
  if (averageRgb(reference) < 5) throw new Error('Intended cover is nearly blank/black.');

  const errors = [];
  for (const seconds of [0, 0.25, 0.5]) {
    const frame = await sampleVideo(videoPath, seconds);
    if (averageRgb(frame) < 5) throw new Error(`MP4 frame at ${seconds}s is blank/black.`);
    const mae = pixelError(reference, frame);
    errors.push({seconds, mae: Number(mae.toFixed(2))});
    if (mae > threshold) {
      throw new Error(`YouTube cover differs from encoded MP4 at ${seconds}s (MAE ${mae.toFixed(2)} > ${threshold}).`);
    }
  }
  const endHold = await sampleVideo(videoPath, 0.75);
  if (averageRgb(endHold) < 5) throw new Error('MP4 opening transition has a blank/black frame at 0.75s.');
  await execute(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath,
    '-frames:v', '1', '-q:v', '2', previewPath], 2 * 1024 * 1024);
  return {passed: true, samples: errors, width, height, previewPath};
}

module.exports = {verifyFirstFrame, averageRgb, pixelError};
