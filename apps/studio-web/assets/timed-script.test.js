import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./timed-script.js", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(source, sandbox);
const timed = sandbox.module.exports;

const NYC_SUBWAY_SCRIPT = `
| Time      | Voiceover                                                                                                                                                                                        | Suggested still                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 0:00–0:07 | "First time on the NYC subway? Here's everything you need to know in 90 seconds."                                                                                                                | Wide shot of a busy subway platform with a train pulling in                 |
| 0:07–0:20 | "Paying is easy. Skip the MetroCard and just tap your phone, smartwatch, or contactless card on the OMNY reader at the turnstile. After 12 rides in 7 days, the rest of the week is free."       | Close-up of a phone tapping an OMNY reader                                  |
| 0:20–0:33 | "Before you go down the stairs, check the sign. Many entrances are only for one direction, Uptown or Downtown, and you can't always cross over inside. Pick the wrong one and you'll pay twice." | Station entrance sign reading "Uptown & The Bronx" or "Downtown & Brooklyn" |
| 0:33–0:46 | "Trains go by letter or number, and the color just tells you which avenue line they run on. Lines that share a color often split up later, so always check the letter, not just the color."      | Close-up of the colored line bullets on a station sign                      |
| 0:46–0:58 | "Know local versus express. Locals stop everywhere, express skips stops. On the map, a white dot means every train stops there, and a black dot means local only."                               | Subway map zoomed in on a section with white and black station dots         |
| 0:58–1:10 | "Use Google Maps, Citymapper, or the MTA app for live times, and always check for service changes, especially nights and weekends when lines get rerouted."                                      | Phone screen showing a transit app route                                    |
| 1:10–1:22 | "A few unwritten rules: let people off before you get on, take your backpack off, don't block the doors, and if a car is weirdly empty on a packed train, there's probably a reason."            | Interior of a subway car with doors open and riders stepping off            |
| 1:22–1:30 | "That's it. You're ready to ride like a local. Save this for your trip and follow for more NYC tips."                                                                                            | Train pulling away down the tunnel, or a skyline shot to close              |
`;

test("nyc subway markdown parses to 90 seconds and eight scenes", () => {
  const parsed = timed.parseTimedScriptMarkdown(NYC_SUBWAY_SCRIPT);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.ok, true);
  assert.deepEqual([...parsed.timeline.segments.map((segment) => segment.duration_seconds)], [7, 13, 13, 13, 12, 12, 12, 8]);
  assert.equal(parsed.timeline.duration_seconds, 90);
  assert.equal(parsed.timeline.segments[6].start_seconds, 70);
  assert.equal(parsed.timeline.segments[6].end_seconds, 82);
  const narration = timed.exactVoiceoverText(parsed.timeline);
  assert.match(narration, /^First time on the NYC subway/);
  assert.equal(narration.includes("Close-up of a phone tapping an OMNY reader"), false);
  assert.equal(narration.includes("skyline shot"), false);
});

test("hyphen timestamps and validation messages", () => {
  const hyphen = timed.parseTimedScriptMarkdown(NYC_SUBWAY_SCRIPT.replaceAll("–", "-"));
  assert.equal(hyphen.ok, true);
  assert.equal(hyphen.timeline.duration_seconds, 90);
  const invalid = timed.parseTimedScriptMarkdown("| Time | Voiceover | Suggested still |\n| --- | --- | --- |\n| noon | Hello | Sign |");
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /invalid timestamp/);
  const gap = timed.validateTimeline([
    { start_seconds: 0, end_seconds: 7, duration_seconds: 7 },
    { start_seconds: 9, end_seconds: 20, duration_seconds: 11 },
  ]);
  assert.match(gap.join(" "), /Gap of/);
  const overlap = timed.validateTimeline([
    { start_seconds: 0, end_seconds: 7, duration_seconds: 7 },
    { start_seconds: 5, end_seconds: 12, duration_seconds: 7 },
  ]);
  assert.match(overlap.join(" "), /Overlap of/);
});

test("eight stills map in order and frames match the timeline", () => {
  const parsed = timed.parseTimedScriptMarkdown(NYC_SUBWAY_SCRIPT);
  const assets = Array.from({ length: 8 }, (_, index) => ({ id: `still-${index + 1}`, order: index + 1 }));
  const timeline = timed.assignStillsInOrder(parsed.timeline, assets);
  assert.deepEqual([...timeline.segments.map((segment) => segment.asset_id)], assets.map((asset) => asset.id));
  assert.deepEqual([...timeline.segments.map((segment) => timed.segmentDurationFrames(segment))], [210, 390, 390, 390, 360, 360, 360, 240]);
});
