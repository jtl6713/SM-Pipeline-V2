import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const here = path.dirname(new URL(import.meta.url).pathname);
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/topbar-banner-0618.css"), "utf8");

test("Studio topbar loads skyline banner after existing styles", () => {
  const sticky = html.indexOf("/assets/sticky-footer-scroll.css");
  const banner = html.indexOf("/assets/topbar-banner-0618.css");
  assert.ok(sticky >= 0);
  assert.ok(banner > sticky);
  assert.match(html, /topbar-banner-0618\.css\?v=0\.6\.587-approve-enqueue-fast/);
  assert.match(css, /STUDIO_TOPBAR_CITY_BANNER_20261007/);
  assert.match(css, /data:image\/webp;base64,/);
});

test("topbar banner preserves readable controls", () => {
  assert.match(css, /\.topbar \.brand-name/);
  assert.match(css, /\.topbar \.studio-nav-toggle/);
  assert.match(css, /\.topbar \.topbar-help/);
  assert.match(css, /\.topbar \.topbar-profile/);
  assert.match(css, /\.topbar \.topbar-profile select/);
  assert.match(css, /color:#fff/);
  assert.match(css, /rgba\(3,12,36,/);
});

test("topbar banner keeps a mobile-specific contrast treatment", () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /background-position:center,center,50% 44%/);
});
