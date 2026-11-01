import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "assets/factory-desk.js"), "utf8");

function createSelect(options) {
  return {
    options,
    value: options[0]?.value || "",
    addEventListener() {},
    set innerHTML(markup) {
      this.html = markup;
      this.options = [...markup.matchAll(/<option value="([^"]*)">([^<]*)/g)]
        .map((match) => ({ value: match[1], textContent: match[2] }));
      this.value = this.options[0]?.value || "";
    },
  };
}

test("Factory profile filter hydrates without waiting for Factory Desk", () => {
  const navbar = createSelect([
    { value: "recNYC123", textContent: "NYC - New York City" },
    { value: "recCHI123", textContent: "Chicago" },
  ]);
  const factory = createSelect([{ value: "", textContent: "All Profiles" }]);
  let observer = null;
  let observed = null;
  const elements = { studioProfileSelect: navbar, factoryProfileFilter: factory };
  const context = {
    document: {
      getElementById: (id) => elements[id] || null,
      addEventListener() {},
    },
    window: {},
    localStorage: { getItem() { return null; } },
    setInterval() { return 1; },
    MutationObserver: class {
      constructor(onChange) { observer = onChange; }
      observe(target, config) { observed = { target, config }; }
    },
  };
  vm.runInNewContext(source, context);
  assert.equal(typeof context.window.StudioFactoryDesk?.load, "function");
  assert.equal(factory.options.length, 3, "All Profiles plus both city profiles render before loading Desk");
  assert.equal(factory.options[0].value, "", "Factory stays global by default");
  assert.equal(factory.options[1].textContent, "Chicago");
  assert.equal(factory.options[2].textContent, "NYC - New York City");
  assert.equal(observed?.target, navbar, "only navbar profile list is watched");

  factory.value = "recCHI123";
  navbar.options.push({ value: "recMIA123", textContent: "Miami" });
  observer();
  assert.equal(factory.options.length, 4, "late profile hydration refreshes selector automatically");
  assert.equal(factory.value, "recCHI123", "user's Factory filter is preserved");
  assert.equal(navbar.value, "recNYC123", "Factory selection never changes navbar profile");

  // A loading failure must not be needed to populate choices.
  const pending = context.window.StudioFactoryDesk.load();
  assert.equal(factory.options.length, 4, "list remains interactive during Desk fetch");
  assert.equal(typeof pending?.then, "function");
});

test("Factory profile selector is independent of Factory Desk network completion", () => {
  assert.match(source, /syncFactoryFilterOptions\(\);\s*\/\/ The topbar may hydrate/);
  assert.match(source, /new MutationObserver\(\(\) => syncFactoryFilterOptions\(\)\)/);
  const init = source.indexOf('// Populate the Factory filter as soon');
  const change = source.indexOf('$(\"factoryProfileFilter\")?.addEventListener("change"');
  assert.ok(init > 0 && change > init);
});

test("Factory shows and clears explicit profile scope without changing Studio profile", () => {
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(here, "assets/factory-layout-0680.css"), "utf8");
  assert.match(html, /id="factoryActiveProfileFilter"[^>]*hidden/);
  assert.match(html, /id="factoryClearProfileFilter"/);
  assert.match(css, /\.factory-active-filter\[hidden\]\{display:none!important\}/);

  const node = (values = {}) => ({
    hidden: false, textContent: "", listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    ...values,
  });
  const navbar = createSelect([
    { value: "recNYC123", textContent: "NYC - New York City" },
    { value: "recCHI123", textContent: "Chicago" },
  ]);
  const factory = Object.assign(createSelect([{ value: "", textContent: "All Profiles" }]), {
    listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; }, focus() {},
  });
  const notice = node({ hidden: true });
  const scope = node();
  const detail = node();
  const clear = node();
  const search = node({ value: "" });
  const elements = {
    studioProfileSelect: navbar, factoryProfileFilter: factory,
    factoryActiveProfileFilter: notice, factoryActiveProfileScope: scope,
    factoryActiveProfileContext: detail, factoryClearProfileFilter: clear,
    factoryNeedsEyesSearch: search,
  };
  const ctx = {
    document: { getElementById(id) { return elements[id] || null; }, addEventListener() {} },
    window: {}, localStorage: { getItem() { return null; } },
    setInterval() { return 1; },
  };
  vm.runInNewContext(source, ctx);
  assert.equal(notice.hidden, true, "All Profiles hides the notice");
  factory.value = "recCHI123";
  factory.listeners.change();
  assert.equal(notice.hidden, false);
  assert.equal(scope.textContent, "Showing Chicago only");
  assert.match(detail.textContent, /Other profiles are hidden/);
  assert.equal(navbar.value, "recNYC123", "Factory never changes the topbar city");
  search.listeners.input({ target: { value: "1894" } });
  assert.match(scope.textContent, /Searching all profiles/);
  assert.match(detail.textContent, /Search temporarily includes all profiles/);
  clear.listeners.click();
  assert.equal(factory.value, "");
  assert.equal(notice.hidden, true);
  assert.equal(navbar.value, "recNYC123");
});
