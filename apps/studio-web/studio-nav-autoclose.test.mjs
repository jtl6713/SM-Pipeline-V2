import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const nav = readFileSync(new URL("./assets/studio-nav-autoclose.js", import.meta.url), "utf8");
const css = readFileSync(new URL("./assets/factory-layout-0680.css", import.meta.url), "utf8");
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("Factory selected-output toolbar stays below nav overlay and drawer", () => {
  assert.match(css, /#page-factory \.factory-batch-toolbar\{z-index:10\}/);
  assert.match(html, /studio-nav-autoclose\.js\?v=0\.6\.\d+-[a-z0-9-]+/);
});

test("navigation selection closes an open drawer using the original toggle", () => {
  let listener = null;
  let toggleClicks = 0;
  const queued = [];
  const current = new Set(["nav-open"]);
  const item = {};
  const sidebar = {
    addEventListener(event, cb, capture) {
      assert.equal(event, "click");
      assert.equal(capture, true);
      listener = cb;
    },
    contains(element) { return element === item; },
  };
  const toggle = {
    click() {
      toggleClicks += 1;
      current.delete("nav-open");
    },
  };
  const document = {
    getElementById(id) {
      return id === "studioSidebar" ? sidebar : id === "studioNavToggle" ? toggle : null;
    },
    body: { classList: { contains(value) { return current.has(value); } } },
  };
  vm.runInNewContext(nav, { document, queueMicrotask(cb) { queued.push(cb); } });
  assert.equal(typeof listener, "function");
  listener({ target: { closest(selector) {
    assert.equal(selector, "button.nav-item[data-page]");
    return item;
  } } });
  assert.equal(toggleClicks, 0, "leave page handler to run before collapsing");
  assert.equal(queued.length, 1);
  queued.shift()();
  assert.equal(toggleClicks, 1);
  assert.equal(current.has("nav-open"), false);

  listener({ target: { closest() { return item; } } });
  queued.shift()();
  assert.equal(toggleClicks, 1, "never reopen an already closed drawer");

  listener({ target: { closest() { return null; } } });
  assert.equal(queued.length, 0, "other sidebar clicks do not collapse");
});
