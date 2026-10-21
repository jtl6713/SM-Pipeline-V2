'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {verifyFirstFrame, pixelError, averageRgb} = require('./first-frame-verify');

const haveFFmpeg = ['ffmpeg', 'ffprobe'].every((bin) => spawnSync(bin, ['-version'], {stdio: 'ignore'}).status === 0);
function run(bin, args) {
  const r = spawnSync(bin, args, {encoding: 'utf8', timeout: 90000});
  assert.equal(r.status, 0, `${bin}: ${r.stderr?.slice(-900)}`);
}
function fixture(dir, shape) {
  const dim = shape === 'vertical' ? '180x320' : '320x180';
  const cover = path.join(dir, shape + '.jpg');
  const video = path.join(dir, shape + '.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${dim}:rate=30`,
    '-frames:v', '1', '-q:v', '2', cover]);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', '30', '-i', cover,
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-movflags', '+faststart', video]);
  return {cover, video, preview: path.join(dir, shape + '-opening.jpg')};
}

test('raw frame scoring rejects visual differences', () => {
  const a = Buffer.alloc(160 * 160 * 3, 150);
  const b = Buffer.alloc(a.length, 149);
  assert.equal(pixelError(a, b), 1);
  assert.equal(averageRgb(a), 150);
  assert.throws(() => pixelError(Buffer.alloc(1), a), /sizes do not match/);
});

test('decodes matching YouTube Short 9:16 and 16:9 MP4 first frames and hold samples', {skip: !haveFFmpeg}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-youtube-cover-'));
  try {
    for (const shape of ['vertical', 'landscape']) {
      const {cover, video, preview} = fixture(dir, shape);
      const result = await verifyFirstFrame({videoPath: video, coverPath: cover, previewPath: preview});
      assert.equal(result.passed, true);
      assert.equal(result.samples.length, 3);
      assert.ok(fs.statSync(preview).size > 100);
      assert.equal(result.width > result.height, shape === 'landscape');
    }
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('rejects a different intended cover without replacing or modifying the MP4', {skip: !haveFFmpeg}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-youtube-cover-fail-'));
  try {
    const {cover, video, preview} = fixture(dir, 'vertical');
    const bad = path.join(dir, 'different.jpg');
    run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=180x320',
      '-frames:v', '1', bad]);
    const originalSize = fs.statSync(video).size;
    await assert.rejects(
      verifyFirstFrame({videoPath: video, coverPath: bad, previewPath: preview}),
      /cover differs/,
    );
    assert.equal(fs.statSync(video).size, originalSize);
    fs.unlinkSync(cover);
    await assert.rejects(
      verifyFirstFrame({videoPath: video, coverPath: cover, previewPath: preview}),
      /Missing completed MP4 or Studio cover/,
    );
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});


test('rejects a thumbnail with the wrong aspect before silently cropping', {skip: !haveFFmpeg}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-youtube-cover-ratio-'));
  try {
    const {video, preview} = fixture(dir, 'vertical');
    const wrong = path.join(dir, 'wide.jpg');
    run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
      '-i', 'color=c=white:s=320x180', '-frames:v', '1', wrong]);
    await assert.rejects(
      verifyFirstFrame({videoPath: video, coverPath: wrong, previewPath: preview}),
      /cover aspect mismatch/,
    );
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
