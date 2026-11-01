'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {isDisposableTempDirName, sweepDisposableTempDirs} = require('./remotion-cleanup');

function touch(dir, hoursAgo) {
    fs.mkdirSync(dir, {recursive: true});
    const when = new Date(Date.now() - hoursAgo * 3600000);
    fs.utimesSync(dir, when, when);
}

test('disposable temp names stay exact', () => {
    assert.equal(isDisposableTempDirName('puppeteer_dev_chrome_profile-LSL5Ah'), true);
    assert.equal(isDisposableTempDirName('remotion-webpack-bundle-TY9bKM'), true);
    assert.equal(isDisposableTempDirName('remotion-v4.0.484-assets0dpq9ndulw'), true);
    assert.equal(isDisposableTempDirName('puppeteer_dev_chrome_profile-../Windows'), false);
    assert.equal(isDisposableTempDirName('remotion-renderer'), false);
    assert.equal(isDisposableTempDirName('chrome_url_fetcher_1'), false);
});

test('temp sweep deletes only stale disposable directories', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'remotion-cleanup-test-'));
    try {
        touch(path.join(root, 'puppeteer_dev_chrome_profile-STALE1'), 48);
        touch(path.join(root, 'remotion-webpack-bundle-STALE2'), 30);
        touch(path.join(root, 'remotion-v4.0.484-assetsstale3'), 25);
        touch(path.join(root, 'puppeteer_dev_chrome_profile-FRESH1'), 2);
        touch(path.join(root, 'keep-me'), 100);
        fs.writeFileSync(path.join(root, 'puppeteer_dev_chrome_profile-FILE99'), 'nope');

        const summary = await sweepDisposableTempDirs({root, ttlHours: 24});
        assert.deepEqual(summary, {removed: 3, skippedFresh: 1, errors: 0, skippedUnsafe: 0});
        assert.equal(fs.existsSync(path.join(root, 'puppeteer_dev_chrome_profile-STALE1')), false);
        assert.equal(fs.existsSync(path.join(root, 'remotion-webpack-bundle-STALE2')), false);
        assert.equal(fs.existsSync(path.join(root, 'remotion-v4.0.484-assetsstale3')), false);
        assert.equal(fs.existsSync(path.join(root, 'puppeteer_dev_chrome_profile-FRESH1')), true);
        assert.equal(fs.existsSync(path.join(root, 'keep-me')), true);
        assert.equal(fs.existsSync(path.join(root, 'puppeteer_dev_chrome_profile-FILE99')), true);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
    }
});
