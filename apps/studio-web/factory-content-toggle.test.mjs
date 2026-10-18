/**
 * Factory Needs Eyes content groups must behave as true expand/collapse toggles.
 * A second click must not be undone by renderLane's default-group selection,
 * including when the desk refreshes while every group is intentionally closed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "assets/factory-desk.js"), "utf8");
const start = source.indexOf("  function renderLane(");
const end = source.indexOf("  function setCount(", start);
assert.ok(start >= 0 && end > start, "Factory grouped-lane renderer must exist");
const renderer = source.slice(start, end);

function harness() {
  const state = { expandedReviewGroup: null, desk: {} };
  const cards = [{ id: "outputA", key: "content:A" }, { id: "outputB", key: "content:B" }];
  const node = {
    innerHTML: "",
    buttons: [],
    querySelectorAll(selector) {
      if (selector !== "[data-factory-toggle-content]") return [];
      this.buttons = [...this.innerHTML.matchAll(/data-factory-toggle-content="([^"]+)"/g)]
        .map(match => ({
          key: match[1],
          addEventListener(event, fn) { if (event === "click") this.click = fn; },
          get dataset() { return { factoryToggleContent: this.key }; },
        }));
      return this.buttons;
    },
  };
  const ctx = {
    state,
    $: () => node,
    esc: value => String(value ?? ""),
    groupByContent: items => items.map(item => ({ key: item.key, cards: [item] })),
    renderContentBar: (group, expanded) =>
      `<button data-factory-toggle-content="${group.key}" aria-expanded="${expanded}">${group.key}</button>`,
    renderCard: card => `<span>${card.id}</span>`,
  };
  const renderLane = vm.runInNewContext(renderer + "\nrenderLane", ctx);
  const render = () => renderLane("needsEyes", cards, "No items", { groupContent: true });
  ctx.renderDesk = render;
  return { state, node, cards, render };
}

test("second click collapses a content item and refresh does not reopen it", () => {
  const { state, node, render } = harness();
  render();
  assert.equal(state.expandedReviewGroup, "content:A");
  assert.match(node.innerHTML, /data-factory-toggle-content="content:A" aria-expanded="true"/);

  node.buttons[0].click();
  assert.equal(state.expandedReviewGroup, "");
  assert.match(node.innerHTML, /data-factory-toggle-content="content:A" aria-expanded="false"/);
  assert.match(node.innerHTML, /data-factory-toggle-content="content:B" aria-expanded="false"/);

  render(); // Automatic 45-second Factory refresh must preserve explicit collapse.
  assert.equal(state.expandedReviewGroup, "");
  assert.match(node.innerHTML, /factory-content-rows" hidden/);

  node.buttons[0].click();
  assert.equal(state.expandedReviewGroup, "content:A");
  assert.match(node.innerHTML, /data-factory-toggle-content="content:A" aria-expanded="true"/);
});

test("switching between content items expands only the clicked item and can collapse all", () => {
  const { state, node, render } = harness();
  render();
  node.buttons[1].click();
  assert.equal(state.expandedReviewGroup, "content:B");
  assert.match(node.innerHTML, /data-factory-toggle-content="content:A" aria-expanded="false"/);
  assert.match(node.innerHTML, /data-factory-toggle-content="content:B" aria-expanded="true"/);

  node.buttons[1].click();
  assert.equal(state.expandedReviewGroup, "");
  assert.match(node.innerHTML, /data-factory-toggle-content="content:B" aria-expanded="false"/);
});
