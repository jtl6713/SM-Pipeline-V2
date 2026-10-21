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

const groupingStart = source.indexOf("  function contentGroupKey(");
const groupingEnd = source.indexOf("  function readyContentCards(", groupingStart);
assert.ok(groupingStart >= 0 && groupingEnd > groupingStart, "Factory grouping functions must exist");
const groupByContent = vm.runInNewContext(
  source.slice(groupingStart, groupingEnd) + "\ngroupByContent",
  {},
);

test("Factory groups multi-platform outputs by authoritative Airtable Content Item link", () => {
  // Live NYC 2026-10-21 regression: numeric Content_ID absent from lean rows.
  const cards = [
    { id:"recOzQ3TpFJrMQRAz", output_id:8393, title:"Hudson River Park Golden Hour", content_item_id:"recy82plmsPHPmwAg", content_id:null },
    { id:"rec5N9GurT1WcBeaD", output_id:8394, title:"Hudson River Park Golden Hour", content_item_id:"recy82plmsPHPmwAg", content_id:null },
    { id:"recDX9XtcmJVDMTek", output_id:8366, title:"Hudson Sunset Hour Plan", content_item_id:"reczMLPhC7DoAeqUi", content_id:null },
    { id:"recYdQlYpP8P61o44", output_id:8367, title:"Hudson Sunset Hour Plan", content_item_id:"reczMLPhC7DoAeqUi", content_id:null },
    { id:"recJQgp99JBRJmg0X", output_id:8368, title:"Hudson Sunset Hour Plan", content_item_id:"reczMLPhC7DoAeqUi", content_id:null },
  ];
  const groups = groupByContent(cards);
  assert.deepEqual(Array.from(groups, group => [group.key, group.cards.map(card => card.output_id).join(",")]), [
    ["content:recy82plmsPHPmwAg", "8393,8394"],
    ["content:reczMLPhC7DoAeqUi", "8366,8367,8368"],
  ]);
});

test("Factory preserves legacy numeric grouping but never groups unrelated same-title orphans", () => {
  const cards = [
    {id:"recOld1",title:"Shared Title",content_id:123},
    {id:"recOld2",title:"Shared Title",content_id:"123"},
    {id:"recOther",title:"Shared Title",content_item_id:"recOtherParent",content_id:123},
    {id:"recOrphan1",title:"Shared Title"},
    {id:"recOrphan2",title:"Shared Title"},
  ];
  const groups = groupByContent(cards);
  assert.deepEqual(Array.from(groups, group => [group.key, group.cards.length]), [
    ["legacy-content:123", 2],
    ["content:recOtherParent", 1],
    ["solo:recOrphan1", 1],
    ["solo:recOrphan2", 1],
  ]);
});
