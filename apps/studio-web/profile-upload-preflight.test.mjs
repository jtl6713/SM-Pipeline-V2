import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const script = fs.readFileSync(new URL("./assets/profile-upload-preflight.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

function setup(profileName = "Chicago Shining", location = "Miami Beach") {
  const listeners = {};
  const dialogNodes = new Map();
  let dialog;
  let replayCount = 0;
  let nativeUploads = 0;
  const nodes = new Map([
    ["studioProfileSelect", { value: "profile-chicago", selectedOptions: [{ textContent: profileName }], focus() {} }],
    ["libraryLocation", { value: location }],
    ["libraryBatchName", { value: "" }],
    ["libraryUploadMessage", { textContent: "", classList: { add() {} } }],
  ]);
  const document = {
    addEventListener(name, listener, capture) {
      assert.equal(capture, true);
      listeners[name] = listener;
    },
    getElementById(id) { return nodes.get(id) || null; },
    body: { appendChild(value) { dialog = value; } },
    createElement(tag) {
      assert.equal(tag, "dialog");
      return {
        open: false,
        setAttribute() {},
        querySelector(selector) {
          if (!dialogNodes.has(selector)) {
            dialogNodes.set(selector, {
              textContent: "",
              addEventListener(name, cb) { this[name] = cb; },
              focus() {},
            });
          }
          return dialogNodes.get(selector);
        },
        addEventListener() {},
        showModal() { this.open = true; },
        close() { this.open = false; },
        remove() {},
      };
    },
  };
  const window = { confirm() { throw Error("Should use accessible dialog"); } };
  vm.runInNewContext(script, { window, document, Event, Object, Promise, WeakSet, Set, String, Array });
  const input = {
    id: "libraryZoneInput", type: "file", tagName: "INPUT", value: "selected",
    files: [{ name: "IMG_123.jpg" }],
    dispatchEvent(event) {
      replayCount++;
      Object.defineProperty(event, "target", { value: input });
      listeners.change(event);
      nativeUploads++;
    },
  };
  function select() {
    let intercepted = false;
    listeners.change({
      target: input,
      preventDefault() { intercepted = true; },
      stopImmediatePropagation() {},
    });
    return intercepted;
  }
  return {
    api: window.StudioProfileUploadPreflight,
    select,
    nodes,
    get dialog() { return dialog; },
    get buttonCancel() { return dialogNodes.get("[data-upload-cancel]"); },
    get buttonContinue() { return dialogNodes.get("[data-upload-continue]"); },
    get replayCount() { return replayCount; },
    get nativeUploads() { return nativeUploads; },
    input,
  };
}

test("obvious city location conflicts show the selected and likely intended profile", () => {
  const { api } = setup();
  const found = api.inspect({ profileName: "Chicago Shining", location: "Vizcaya Museum, Miami" });
  assert.equal(found.selected, "Chicago");
  assert.equal(found.suggested, "Miami");
  assert.equal(found.source, "Location");
  assert.equal(api.inspect({ profileName: "New York Shining", location: "Hollywood Boulevard" }).suggested, "Los Angeles");
});

test("known foreign landmark in a filename triggers without location text", () => {
  const { api } = setup();
  assert.equal(api.inspect({
    profileName: "LA Shining", files: [{ name: "Brooklyn Bridge Night.mov" }],
  }).suggested, "New York");
  assert.equal(api.inspect({
    profileName: "Miami Shining", batchName: "Navy Pier",
  }).suggested, "Chicago");
});

test("generic filenames, correct profile, mixed-city and unrecognized places do not warn", () => {
  const { api } = setup();
  assert.equal(api.inspect({ profileName: "Chicago Shining", files: [{ name: "DJI_0843.MOV" }] }), null);
  assert.equal(api.inspect({ profileName: "New York Shining", location: "Central Park, NYC" }), null);
  assert.equal(api.inspect({ profileName: "Miami Shining", location: "Chinatown" }), null);
  assert.equal(api.inspect({ profileName: "Chicago Shining", location: "Chicago to New York" }), null);
  assert.equal(api.inspect({ profileName: "Custom Shining", location: "Miami Beach" }), null);
});

test("Cancel stops file selection before native upload and clears selected files", async () => {
  const state = setup();
  assert.equal(state.select(), true);
  assert.ok(state.dialog.open);
  assert.match(state.dialog.innerHTML, /It appears you may be uploading to the wrong profile/);
  assert.equal(state.buttonCancel.textContent, "");
  state.buttonCancel.click();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(state.input.value, "");
  assert.equal(state.nativeUploads, 0);
  assert.match(state.nodes.get("libraryUploadMessage").textContent, /Upload cancelled/);
});

test("Continue replays one approved event for the original selected files", async () => {
  const state = setup();
  assert.equal(state.select(), true);
  state.buttonContinue.click();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(state.replayCount, 1);
  assert.equal(state.nativeUploads, 1);
});

test("same-city selection never consumes the normal upload change event", () => {
  const state = setup("Miami Shining", "Miami Beach");
  assert.equal(state.select(), false);
  assert.equal(state.dialog, undefined);
});

test("guard is loaded on every Studio page, before the lazy runtime boots", () => {
  const guard = html.indexOf("/assets/profile-upload-preflight.js");
  const boot = html.indexOf("window.StudioLazyLoad.boot()");
  assert.ok(guard !== -1 && boot > guard);
  assert.match(html, /\/assets\/profile-upload-preflight\.css\?v=/);
  assert.match(script, /azFinishedInput/);
  assert.match(script, /item4ClipInput/);
  assert.match(script, /libraryZoneInput/);
  assert.match(script, /addEventListener\("drop"/);
});
