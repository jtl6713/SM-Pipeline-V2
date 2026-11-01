import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const start = source.indexOf("  function renderLane(");
const end = source.indexOf("  function setCount(", start);
assert.ok(start >= 0 && end > start);
const renderer = source.slice(start, end);

test("Needs eyes shows a bounded iPad page and can reach all review groups", () => {
  const cards = Array.from({ length: 31 }, (_, i) => ({ id: "output"+i, key:"content:"+i }));
  const state = { needsEyesPage: 0, expandedReviewGroup: null, selectedOutputs:new Set(["recSELECTED"]), desk:{} };
  const node = {
    innerHTML: "",
    scrollTop: 5,
    bound: {},
    querySelectorAll(selector) {
      if (this.bound[selector]) return this.bound[selector];
      const attr = selector === "[data-factory-review-page]" ? "data-factory-review-page" :
        selector === "[data-factory-toggle-content]" ? "data-factory-toggle-content" : null;
      if (!attr) return [];
      this.bound[selector] = [...this.innerHTML.matchAll(new RegExp(attr + '="([^"]+)"', "g"))]
        .map(match => ({
          dataset: selector.includes("review-page") ? {factoryReviewPage:match[1]} : {factoryToggleContent:match[1]},
          addEventListener(event, fn) { if(event === "click") this.click = fn; }
        }));
      return this.bound[selector];
    }
  };
  const ctx = {
    state, $:() => node, esc:value=>String(value??""),
    groupByContent:items=>items.map(item=>({key:item.key,cards:[item]})),
    renderContentBar:(g,e)=>'<button data-factory-toggle-content="'+g.key+'" aria-expanded="'+e+'">'+g.key+'</button>',
    renderCard:c=>'<article>'+c.id+'</article>',
  };
  const renderLane = vm.runInNewContext(renderer+"\nrenderLane",ctx);
  const render=()=>{node.bound={};renderLane("needsEyes",cards,"Empty",{groupContent:true});};
  ctx.renderDesk=render;
  render();
  // The optional search-result qualifier can vary; pagination counts must remain exact.
  assert.match(node.innerHTML,/Showing 1–12 of 31\\s+content items · 31 outputs in queue/);
  assert.match(node.innerHTML,/output0/);
  assert.doesNotMatch(node.innerHTML,/output12/);
  const next=()=>node.querySelectorAll("[data-factory-review-page]").find(b=>b.dataset.factoryReviewPage==="next").click();
  next();
  assert.equal(state.needsEyesPage,1);
  assert.match(node.innerHTML,/Showing 13–24 of 31\\s+content items/);
  assert.match(node.innerHTML,/output12/);
  assert.doesNotMatch(node.innerHTML,/output0/);
  next();
  assert.equal(state.needsEyesPage,2);
  assert.match(node.innerHTML,/Showing 25–31 of 31\\s+content items/);
  assert.match(node.innerHTML,/output30/);
  assert.equal(state.selectedOutputs.has("recSELECTED"),true,"review paging must not discard saved batch selection");
});

test("Factory iPad list uses normal page scrolling with compact pagination", () => {
  const css=fs.readFileSync(new URL("./assets/factory-layout-0680.css",import.meta.url),"utf8");
  assert.match(css,/max-width:1366px/);
  assert.match(css,/\.factory-band-eyes \.factory-lane-list\{\s*max-height:none;overflow:visible/);
  assert.match(css,/\.factory-review-pagination/);
});
