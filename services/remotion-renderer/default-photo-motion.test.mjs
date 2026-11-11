import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./src/ChicagoShiningPhotoSequence.tsx", import.meta.url), "utf8");
const resolver = source.slice(source.indexOf("const resolveMotionType ="), source.indexOf("const focalPointToObjectPosition"));

test("photographs default to gentle Ken Burns motion", () => {
  assert.match(resolver, /default:\s*return "slowZoom";/);
  assert.doesNotMatch(resolver, /case "stillphoto":|case "still_photo":/);
});

test("explicit static instructions and video clips remain stationary", () => {
  assert.match(resolver, /if \(isVideoClip\(clip\)\) return "none";/);
  for (const name of ["none", "still", "photo_sequence_hold", "photo_sequence_static"]) {
    assert.ok(resolver.includes(`case "${name}":`));
  }
});
