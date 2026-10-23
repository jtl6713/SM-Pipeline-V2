import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./assets/app-item4-1008.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const start = source.indexOf('  function persistStudioProfilesCache(');
const end = source.indexOf('  window.addEventListener("studio-profile-created"', start);
assert.ok(start > 0 && end > start);

function harness({ records = [], fail = false } = {}) {
  const nodes = {
    studioProfileWrap: { hidden: false, title: '' },
    studioProfileSelect: { innerHTML: '', disabled: true, value: '' },
  };
  const cache = new Map();
  if (records.length) cache.set('profiles', JSON.stringify({ records }));
  const timers = [];
  const requests = [];
  let resolveRequest;
  const response = new Promise(resolve => { resolveRequest = resolve; });
  const context = vm.createContext({
    $: id => nodes[id],
    sessionStorage: { getItem: k => cache.get(k), setItem: (k, v) => cache.set(k, v) },
    localStorage: { getItem: () => 'miami' },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    escapeHtml: value => String(value),
    api: async path => { requests.push(path); if (fail) throw Error('timeout'); return response; },
    ensureProfileNarrationDefaults: async () => {},
  });
  vm.runInContext(`
    const PROFILE_LIST_CACHE_KEY = 'profiles';
    const PROFILE_STORAGE_KEY = 'selected';
    const PROFILE_LIST_RETRY_MS = 15000;
    let studioProfiles = [], selectedProfileId = '';
    let studioProfilesLoadInFlight = null, studioProfileListRetryTimer = null;
    function applyStudioProfile(profile) { selectedProfileId = profile.id; $('studioProfileSelect').value = profile.id; }
    ${source.slice(start, end)}
    globalThis.load = loadStudioProfiles;
  `, context);
  return { nodes, timers, requests, load: context.load, resolveRequest };
}

test('profile control is present before JavaScript and starts before health/session checks', () => {
  const wrap = html.match(/<label[^>]*id="studioProfileWrap"[^>]*>/)?.[0];
  assert.ok(wrap);
  assert.doesNotMatch(wrap, /\bhidden\b/);
  assert.match(html, /id="studioProfileSelect"[^>]*disabled><option value="">Loading profiles/);
  assert.match(source, /loadStudioProfiles\(\{ quiet: true \}\)\.catch\(\(\) => \{\}\);\s*checkHealth\(\)/);
  const health = source.slice(source.indexOf('  async function checkHealth()'), source.indexOf('  let dashboardInflight'));
  assert.doesNotMatch(health, /loadStudioProfiles/);
});

test('cold quiet load shows a loading selector while profile request is pending', async () => {
  const h = harness();
  const pending = h.load({ quiet: true });
  assert.deepEqual(h.requests, ['/api/profiles']);
  assert.equal(h.nodes.studioProfileWrap.hidden, false);
  assert.match(h.nodes.studioProfileSelect.innerHTML, /Loading profiles/);
  h.resolveRequest({ records: [{ id: 'miami', name: 'Miami' }] });
  await pending;
  assert.equal(h.nodes.studioProfileSelect.disabled, false);
  assert.equal(h.nodes.studioProfileSelect.value, 'miami');
});

test('failed profile request with no session keeps selector visible and schedules retry', async () => {
  const h = harness({ fail: true });
  await h.load({ quiet: true });
  assert.equal(h.nodes.studioProfileWrap.hidden, false);
  assert.equal(h.nodes.studioProfileSelect.disabled, true);
  assert.match(h.nodes.studioProfileSelect.innerHTML, /unavailable.*retrying/);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].ms, 15000);
});

test('cached profiles remain usable when network refresh fails', async () => {
  const h = harness({ fail: true, records: [{ id: 'miami', name: 'Miami' }] });
  await h.load({ quiet: true });
  assert.equal(h.nodes.studioProfileWrap.hidden, false);
  assert.equal(h.nodes.studioProfileSelect.disabled, false);
  assert.equal(h.nodes.studioProfileSelect.value, 'miami');
  assert.match(h.nodes.studioProfileSelect.innerHTML, /Miami/);
});

test('concurrent refreshes share one profile request and empty result stays visible', async () => {
  const h = harness();
  const first = h.load();
  const second = h.load();
  assert.equal(h.requests.length, 1);
  h.resolveRequest({ records: [] });
  await Promise.all([first, second]);
  assert.equal(h.nodes.studioProfileWrap.hidden, false);
  assert.equal(h.nodes.studioProfileSelect.disabled, true);
  assert.match(h.nodes.studioProfileSelect.innerHTML, /No profiles/);
});
