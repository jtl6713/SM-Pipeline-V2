import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('./assets/styles-phase7-0621.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
test('iPhone TikTok action panel uses minmax(0,1fr) and wraps long text', () => {
  assert.match(css, /#creativeTiktokComplete \.creative-section-heading p,[\s\S]*?overflow-wrap: anywhere/);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?\.creative-top-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /#creativeTiktokResendWrap \{[\s\S]*?flex-direction: column/);
  assert.match(css, /#creativeTiktokComplete \.form-field select \{ width: 100%/);
  assert.match(html, /styles-phase7-0621\.css\?v=0\.6\.940-meta-republish-safety/);
});
