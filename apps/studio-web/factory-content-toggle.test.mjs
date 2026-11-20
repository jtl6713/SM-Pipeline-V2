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
test("NYC platform variants roll up to one row per authoritative Content Item", () => {
  const fixtures = [
    ["recy82plmsPHPmwAg", "Hudson River Park Golden Hour", [8393,8394]],
    ["reczMLPhC7DoAeqUi", "Hudson Sunset Hour Plan", [8366,8367,8368]],
    ["reczG9JrgmvT8ZGRy", "Ferry Deck Skyline Still", [8305,8306,8307]],
    ["recz24MquTRqY1Sul", "Bryant Park Winter Loop", [7950,7951,7952]],
  ];
  const cards = fixtures.flatMap(([content_item_id,title,numbers]) =>
    numbers.map((output_id) => ({id: "recOutput"+output_id, content_item_id, title, output_id, content_id: null})));
  const groups = groupByContent(cards);
  assert.equal(groups.length,4);
  assert.deepEqual(Array.from(groups, group => group.cards.map(card => card.output_id).join(",")),
    ["8393,8394","8366,8367,8368","8305,8306,8307","7950,7951,7952"]);
  assert.equal(cards.length,11,"No legitimate output is lost");
});
test("Legacy projections group by linked ID or numeric Content_ID but never by title", () => {
  const groups = groupByContent([
    {id:"recOld1",content_id:"recLinkedParent",title:"Shared"},
    {id:"recOld2",content_id:"recLinkedParent",title:"Shared"},
    {id:"recNumeric1",content_id:567,title:"Shared"},
    {id:"recNumeric2",content_id:"567",title:"Shared"},
    {id:"recDifferent",content_item_id:"recOtherParent",content_id:"recLinkedParent",title:"Shared"},
    {id:"recOrphan1",title:"Shared"},
    {id:"recOrphan2",title:"Shared"},
  ]);
  assert.deepEqual(Array.from(groups, group=>[group.key, group.cards.length]), [
    ["content:recLinkedParent",2],["legacy-content:567",2],
    ["content:recOtherParent",1],["solo:recOrphan1",1],["solo:recOrphan2",1],
  ]);
});

test("Museum Mile 2212: six rendered safety-held outputs show previews instead of misleading zero-ready status", () => {
  const barStart = source.indexOf("  function renderContentBar(");
  const barEnd = source.indexOf("  function renderLane(", barStart);
  assert.ok(barStart >= 0 && barEnd > barStart);
  const state = { selectedOutputs: new Set() };
  const renderContentBar = vm.runInNewContext(source.slice(barStart,barEnd) + "\nrenderContentBar", {
    readyContentCards: () => [],
    pendingSiblingOutputsForGroup: () => [],
    pendingSiblingMeta: () => "",
    canPreview: card => card.can_preview,
    canSelectBatchOutput: () => false,
    state,
    esc: value => String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;"),
  });
  const group = {
    key: "content:recsEpUkN36Bx6TLP",
    cards: [10827,10828,10829,10830,10831,10832].map((number,i) => ({
      id: "rec" + String(number).padStart(14,"0"),
      kind: "output",
      output_id: number,
      title: "Museum Mile Day Plan",
      content_id: 2212,
      profile_name: "LA - Los Angeles",
      platform: ["Instagram","Instagram","Facebook","Facebook","TikTok","YouTube"][i],
      render_status: "Rendered",
      do_not_publish: true,
      safety_hold_active: true,
      can_preview: true,
    })),
  };
  const html = renderContentBar(group,false);
  assert.match(html,/Content 2212/);
  assert.match(html,/LA - Los Angeles/);
  assert.match(html,/6 rendered for preview/);
  assert.match(html,/0 approvable/);
  assert.match(html,/Publishing safety hold/);
  assert.match(html,/Preview only — approval held/);
  assert.doesNotMatch(html,/0 ready/);
  assert.match(html, /data-factory-select-content="content:recsEpUkN36Bx6TLP"[^>]*disabled/);
  assert.match(html, /data-factory-toggle-content="content:recsEpUkN36Bx6TLP"/);
});
