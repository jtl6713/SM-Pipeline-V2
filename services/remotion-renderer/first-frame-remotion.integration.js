'use strict';

/** CI-only end-to-end Remotion render: thumbnail encoded into actual H264 MP4. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');
const {verifyFirstFrame} = require('./first-frame-verify');

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: __dirname, encoding: 'utf8', timeout: 240000,
    maxBuffer: 16 * 1024 * 1024, ...opts,
  });
  assert.equal(result.status, 0,
    `${command} ${args.join(' ')} failed: ${result.error?.message || result.stderr?.slice(-2500)}`);
  return String(result.stdout || '');
}

function ffmpeg(args) {
  run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
}

function makeSources(dir) {
  const suffixes = [{name: 'vertical', size: '180x320'}, {name: 'landscape', size: '320x180'}];
  for (const {name, size} of suffixes) {
    ffmpeg(['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`,
      '-frames:v', '1', '-q:v', '2', path.join(dir, name + '-cover.jpg')]);
    ffmpeg(['-f', 'lavfi', '-i', `color=c=blue:s=${size}:rate=30`,
      '-frames:v', '1', '-q:v', '2', path.join(dir, name + '-scene.jpg')]);
    ffmpeg(['-f', 'lavfi', '-i', `color=c=red:s=${size}:r=30`,
      '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, name + '-clip.mp4')]);
  }
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '4', path.join(dir, 'voice.wav')]);
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100',
    '-t', '4', path.join(dir, 'music.wav')]);
}

async function renderCase(dir, {label, compositionId, landscape = false, mixed = false}) {
  const name = landscape ? 'landscape' : 'vertical';
  const width = landscape ? 320 : 180;
  const height = landscape ? 180 : 320;
  const clips = [{
    id: 'scene-photo',
    mediaKind: 'photo',
    src: name + '-scene.jpg',
    durationFrames: mixed ? 60 : 90,
    overlay: {enabled: true, text: 'Animated first scene', animation: 'fade'},
    transition: {type: 'fade', durationFrames: 6},
  }];
  if (mixed) {
    clips.push({id: 'scene-video', mediaKind: 'video', src: name + '-clip.mp4',
      durationFrames: 60, transition: {type: 'fade', durationFrames: 6}});
  }
  const durationFrames = clips.reduce((n, clip) => n + clip.durationFrames, 0);
  const props = {
    clips, width, height, fps: 30, durationInFrames: durationFrames,
    targetAspectRatio: landscape ? '16:9' : '9:16',
    titleText: 'Subtitle and transition test',
    brandText: 'CHICAGO SHINING',
    voiceover: {enabled: true, src: 'voice.wav', volume: 1},
    music: {enabled: true, src: 'music.wav', volume: 0.15},
    youtubeFirstFrame: {enabled: true, src: name + '-cover.jpg', holdFrames: 21, fadeFrames: 4},
  };
  const propsPath = path.join(dir, label + '.json');
  const video = path.join(dir, label + '.mp4');
  fs.writeFileSync(propsPath, JSON.stringify(props));
  run('npx', ['remotion', 'render', 'src/index.ts', compositionId, video,
    '--overwrite', '--concurrency=2', `--props=${propsPath}`,
    `--public-dir=${dir}`], {timeout: 300000});
  const verification = await verifyFirstFrame({
    videoPath: video, coverPath: path.join(dir, name + '-cover.jpg'),
    previewPath: path.join(dir, label + '-opening.jpg'),
  });
  assert.equal(verification.passed, true);
  const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries',
    'stream=codec_type:format=duration', '-of', 'json', video]));
  const types = new Set((probe.streams || []).map(s => s.codec_type));
  assert.equal(types.has('video'), true, 'MP4 video stream must exist');
  assert.equal(types.has('audio'), true, 'MP4 must retain narration/music');
  const duration = Number(probe.format?.duration);
  assert.ok(Math.abs(duration - durationFrames / 30) < 0.3,
    `Video duration drifted: ${duration} vs ${durationFrames / 30}`);
  return {label, verification, duration};
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-remotion-integration-'));
  try {
    makeSources(dir);
    const results = [];
    results.push(await renderCase(dir, {
      label: 'short-photo', compositionId: 'ChicagoShiningPhotoSequence',
    }));
    results.push(await renderCase(dir, {
      label: 'short-mixed', compositionId: 'ChicagoShiningPhotoSequence', mixed: true,
    }));
    results.push(await renderCase(dir, {
      label: 'standard-16x9', compositionId: 'ChicagoShiningPhotoSequence', landscape: true,
    }));
    console.log(JSON.stringify({passed: true, cases: results}, null, 2));
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}
main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
