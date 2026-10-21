import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.join(root, "assets/factory-batch-quality-0710.js"), "utf8");
const css = fs.readFileSync(path.join(root, "assets/factory-batch-quality-0710.css"), "utf8");
const idA = "recQualityDemoAlpha";
const idB = "recQualityDemoBeta";
const item = (id, outputId) => ({
  record_id: id, output_id: outputId, platform: "Facebook", output_type: "Reel",
  profile_name: "Los Angeles", profile_id: "recQualityProfile",
  can_return_to_approved: true, error: "Facebook posting frequency 368/1390008",
  recovery: "eligible", action: "Return to Approved",
});
const approved = iso => ({
  ok: true, record: {
    review_status: "Approved", output_status: "Approved for Publishing",
    scheduled_post_date: iso,
  }, dispatch: null,
});
const nextMonth = new Date(Date.now() + 42 * 86400000).toISOString();
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(initial = [item(idA, 2366)], handlePost = async () => approved(nextMonth)) {
  const elements = new Map();
  function el(id) {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: "", textContent: "", value: "",
      hidden: false, classList: { contains: name => id === "page-factory" && name === "active" },
      addEventListener() {},
    });
    return elements.get(id);
  }
  const handlers = {};
  const calls = [];
  let failures = initial;
  const document = {
    hidden: false,
    getElementById: el,
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    querySelector() { return null; },
  };
  const window = {
    addEventListener() {}, setInterval() {},
    setTimeout() {}, confirm: () => true,
  };
  el("factoryProfileFilter").value = "";
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body && JSON.parse(options.body) });
    if (options.method === "GET") {
      return {
        ok: true, json: async () => ({
          ok: true, scope: "all", quality_status: "ok", quality_signals: [],
          output_failures: { status: "ok", count: failures.length, items: failures },
        }),
      };
    }
    const body = await handlePost(url, JSON.parse(options.body));
    return {
      ok: body.httpStatus ? false : true,
      status: body.httpStatus || 200,
      text: async () => JSON.stringify(body),
    };
  };
  vm.runInNewContext(script, { document, window, fetch, URLSearchParams, Intl, Date, console });
  const fire = (selector, dataset = {}) => {
    for (const listener of handlers.click || []) listener({
      preventDefault() {},
      target: { closest: queried => queried === selector ? { dataset } : null },
    });
  };
  return {
    el, fire, calls, window,
    setFailures(value) { failures = value; },
    async load() { await window.StudioFactoryBatchQuality.refresh(true); },
  };
}

test("one shared progress component supports both output and bulk recovery", () => {
  assert.match(script, /function recoveryProgressMarkup\(\)/);
  assert.match(script, /function progressForItem\(item\)/);
  assert.match(script, /confirmRecoveryResponse\(body\)/);
  assert.match(script, /data-qa-dismiss-recovery/);
  assert.match(css, /\.factory-quality-progress progress/);
  assert.match(css, /\.factory-quality-success/);
});

test("single recovery visibly waits, then retains approved output and actual future schedule", async () => {
  let finishPost;
  const h = harness([item(idA, 2366)], async (url, body) => {
    if (body.quality_rate_limit_preview) return { ok: true, scheduled_at: nextMonth };
    return new Promise(resolve => { finishPost = resolve; });
  });
  await h.load();
  h.fire("[data-qa-reapprove]", { qaReapprove: idA });
  await tick();
  const waiting = h.el("factoryBatchQualitySignals").innerHTML;
  assert.match(waiting, /Return to Approved/);
  assert.match(waiting, /0 of 1 completed/);
  assert.match(waiting, /Processing/);
  assert.match(waiting, /data-qa-reapprove=.*disabled aria-disabled="true"/);
  h.setFailures([]);
  finishPost(approved(nextMonth));
  await tick(); await tick();
  const done = h.el("factoryBatchQualitySignals").innerHTML;
  assert.match(done, /1 of 1 completed/);
  assert.match(done, /Approved and scheduled/);
  assert.match(done, /Future schedule:/);
  assert.match(done, /Output 2366/); // card retained after successful census refresh
  assert.match(done, /Dismiss results/);
  assert.equal(h.calls.filter(c => c.method === "POST" && !c.body.quality_rate_limit_preview).length, 1);
  h.fire("[data-qa-dismiss-recovery]");
  await tick();
  assert.doesNotMatch(h.el("factoryBatchQualitySignals").innerHTML, /Output 2366/);
});

test("bulk recovery updates completed counts and skips unsafe continuation after 500", async () => {
  const a = item(idA, 2366), b = item(idB, 2367);
  const h = harness([a, b], async (url, body) => {
    if (body.quality_rate_limit_preview) return { ok: true };
    return { ok: false, error: "Worker unavailable", httpStatus: 500 };
  });
  await h.load();
  h.fire("[data-qa-reapprove-all]");
  await tick(); await tick();
  const html = h.el("factoryBatchQualitySignals").innerHTML;
  assert.match(html, /2 of 2 completed/);
  assert.match(html, /Needs verification/);
  assert.match(html, /Not attempted/);
  assert.match(html, /1 needs verification before retry/);
  assert.equal(h.calls.filter(c => c.method === "POST" && !c.body.quality_rate_limit_preview).length, 1);
});

test("a failed read-only preflight keeps all cards and issues no mutation", async () => {
  const h = harness([item(idA, 2366)], async () =>
    ({ ok: false, httpStatus: 503, error: "Occupancy temporarily unavailable" }));
  await h.load();
  h.fire("[data-qa-reapprove]", { qaReapprove: idA });
  await tick(); await tick();
  const html = h.el("factoryBatchQualitySignals").innerHTML;
  assert.match(html, /Preflight failed. No outputs changed/);
  assert.match(html, /Output 2366/);
  assert.equal(h.calls.filter(c => c.method === "POST").length, 1);
  assert.equal(h.calls.filter(c => c.method === "POST" && !c.body.quality_rate_limit_preview).length, 0);
});

test("a 200 without persisted approval or future date is never presented as success", async () => {
  const h = harness([item(idA, 2366)], async (url, body) => body.quality_rate_limit_preview
    ? { ok: true } : ({ ok: true, record: { review_status: "Failed", scheduled_post_date: nextMonth } }));
  await h.load();
  h.fire("[data-qa-reapprove]", { qaReapprove: idA });
  await tick(); await tick();
  const html = h.el("factoryBatchQualitySignals").innerHTML;
  assert.match(html, /Needs verification/);
  assert.doesNotMatch(html, /Approved and scheduled/);
  assert.match(html, /disabled aria-disabled="true"/);
});
