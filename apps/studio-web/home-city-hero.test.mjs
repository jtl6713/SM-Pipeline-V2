import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./assets/home-city-hero-0724.css", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("all four city profiles receive the same scenic launcher with unique imagery", () => {
  assert.match(html, /home-city-hero-0724\.css\?v=0\.6\.727-approved-unpublished-home/);
  assert.match(css, /:root\s*\{[\s\S]*--launcher-photo:/);
  for (const city of ["nyc", "la", "miami"]) {
    assert.ok(css.includes(`html[data-studio-theme="${city}"]`), city);
  }
  const photos = [...css.matchAll(/--launcher-photo:url\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.equal(photos.length, 4);
  assert.equal(new Set(photos).size, 4);
  assert.ok(photos.every((url) => url.startsWith("https://unsplash.com/photos/")));
  assert.match(html, /id="ezPathBrandCity"/);
});
test("three existing publishing paths retain their event delegation hooks", () => {
  assert.match(html, /id="ezPortal"/);
  for (const mode of ["vibe", "completed", "wizard"]) {
    assert.equal([...html.matchAll(new RegExp(`data-ez-portal-path="${mode}"`, "g"))].length, 1);
  }
  assert.match(app, /function bindEzPortal/);
  assert.match(html, /id="azFinishedDrop"/);
  assert.match(html, /id="ezWizard"/);
  assert.match(css, /\.ez-portal\[hidden\]\{display:none!important\}/);
});
test("launcher retains accessible button labels and responsive layout", () => {
  assert.match(html, /<nav class="ez-portal" id="ezPortal" aria-label="Start a post">/);
  assert.match(html, /Start Upload/);
  assert.match(html, /Publish Video/);
  assert.match(html, /Open Guide/);
  assert.match(css, /@media\(max-width:860px\)/);
  assert.match(css, /@media\(max-width:590px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /:focus-visible/);
});
