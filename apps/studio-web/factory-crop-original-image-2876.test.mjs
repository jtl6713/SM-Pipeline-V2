import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const factory = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const from = factory.indexOf("  function restoreFactoryCloseupImage() {");
const to = factory.indexOf("  function closeFactoryPreview() {", from);
assert.ok(from > 0 && to > from, "Factory inspector functions remain accessible for actual DOM behavior regression");
const inspectorFunctions = factory.slice(from, to);

function makeFixture() {
  const lookup = {};
  let setSourceCount = 0;
  const style = () => ({ aspectRatio: "", removeProperty(property) { if(property === "aspect-ratio") this.aspectRatio = ""; } });
  const dialog = {
    children: [],
    insertBefore(node, sibling) {
      if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node),1);
      const index=this.children.indexOf(sibling);
      this.children.splice(index >= 0 ? index : this.children.length,0,node);
      node.parentElement=this;
    },
  };
  const cropVisual = {
    children: [],
    style:style(),
    appendChild(node) {
      if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node),1);
      this.children.push(node);
      node.parentElement=this;
    },
  };
  const image = {
    hidden:false,complete:true,naturalWidth:1080,naturalHeight:1350,
    onload:null,srcValue:"https://media.chicagoshining.com/studio/previews/verified-slide.jpg",
    get src() { return this.srcValue; },
    set src(next) { this.srcValue=next; setSourceCount++; },
  };
  const empty = { parentElement:dialog };
  dialog.children.push(image,empty);
  image.parentElement=dialog;
  const panel={hidden:true}, crop={hidden:true}, toggle={hidden:true,onclick:null,attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
  const select={value:"",onchange:null};
  const summary={textContent:""};
  const quality={
    normalizedRatio: v => ["9:16","4:5","1:1","16:9"].includes(v) ? v : "",
    frameReport({width,height,ratio}) {
      if (!ratio) return {status:"unavailable",issues:[],ratio:""};
      return {status:"geometry_ok",width,height,ratio,cropLossPct:0,issues:[]};
    },
  };
  Object.assign(lookup,{
    factoryPreviewBackdrop:{querySelector:()=>dialog},
    factoryPreviewImage:image,
    factoryCloseupCropVisual:cropVisual,
    factoryPreviewEmpty:empty,
    factoryCloseupInspector:panel,
    factoryCloseupCropFrame:crop,
    factoryCloseupToggle:toggle,
    factoryCloseupRatio:select,
    factoryCloseupSummary:summary,
  });
  const context={$:id=>lookup[id],window:{StudioFactoryCloseupQuality:quality}};
  vm.runInNewContext(`let factoryGalleryPreviewEpoch=1;\n${inspectorFunctions}\nthis.inspector={attachFactoryCloseupInspector,resetFactoryCloseupInspector,restoreFactoryCloseupImage};`,context);
  return { ...lookup,dialog,image,cropVisual,panel,crop,toggle,select,summary,
    inspector:context.inspector,get setSourceCount(){return setSourceCount;} };
}
test("#11129: Show estimated center crop reuses SAME already-loaded Factory image; no second image HTTP request",()=>{
  const f=makeFixture();
  f.inspector.attachFactoryCloseupInspector({aspect_ratio:"4:5"},f.image,1);
  f.image.onload();
  assert.equal(f.panel.hidden,false);
  assert.equal(f.select.value,"4:5");
  const initial=f.setSourceCount;
  f.toggle.onclick();
  assert.equal(f.crop.hidden,false);
  assert.equal(f.cropVisual.children[0],f.image);
  assert.equal(f.image.parentElement,f.cropVisual);
  assert.equal(f.cropVisual.style.aspectRatio,"4 / 5");
  assert.equal(f.setSourceCount,initial,"Moving a verified img is not a duplicate image download");
  f.toggle.onclick();
  assert.equal(f.image.parentElement,f.dialog);
  assert.equal(f.crop.hidden,true);
  assert.equal(f.setSourceCount,initial);
});
test("#11129: ratio changes while cropped keep the original loaded image identity",()=>{
  const f=makeFixture();
  f.inspector.attachFactoryCloseupInspector({aspect_ratio:"9:16"},f.image,1);
  f.image.onload(); f.toggle.onclick();
  f.select.value="1:1"; f.select.onchange();
  assert.equal(f.cropVisual.style.aspectRatio,"1 / 1");
  assert.equal(f.image.parentElement,f.cropVisual);
  assert.equal(f.crop.hidden,false);
  assert.equal(f.setSourceCount,0);
  f.inspector.resetFactoryCloseupInspector();
  assert.equal(f.image.parentElement,f.dialog);
  assert.equal(f.panel.hidden,true);
});
test("gallery slide reset restores original image parent and removes stale crop before next slide",()=>{
  const f=makeFixture();
  f.inspector.attachFactoryCloseupInspector({aspect_ratio:"4:5"},f.image,1);
  f.image.onload();f.toggle.onclick();
  f.inspector.resetFactoryCloseupInspector();
  assert.equal(f.image.parentElement,f.dialog);
  assert.equal(f.crop.hidden,true);
  f.image.src="https://media.chicagoshining.com/studio/previews/second-slide.jpg";
  f.image.onload();
  assert.equal(f.panel.hidden,false);
  assert.equal(f.crop.hidden,true);
  assert.equal(f.setSourceCount,1,"Only slide navigation fetches the next verified slide");
});
