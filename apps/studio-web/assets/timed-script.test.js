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

test("spreadsheet paste of the Staten Island Ferry script is 13 voiceovers", () => {
  const rows = [
    ["Time", "Voiceover", "9:16 asset suggestion"],
    ["0:00–0:07", "“Want one of New York City’s best views for absolutely nothing? Take the Staten Island Ferry—but know these tricks first.”", "Vertical clip preferred: orange ferry moving through harbor."],
    ["0:07–0:15", "“Start at Whitehall Terminal at the southern tip of Manhattan. The ride to Staten Island takes about twenty-five minutes.”", "9:16 still or clip: Whitehall Terminal entrance/signage."],
    ["0:15–0:23", "“And don’t buy a ticket. There is no ticket, no OMNY tap and no fare. The Staten Island Ferry is completely free.”", "9:16 clip: passengers walking into/through terminal."],
    ["0:23–0:32", "“Leaving Manhattan, head for the right side of the ferry. That’s your best side for the Statue of Liberty.”", "9:16 still/clip: Statue of Liberty viewed from ferry railing."],
    ["0:32–0:37", "“You’ll pass Lady Liberty…”", "9:16 close vertical still: Statue of Liberty with harbor below and sky above."],
    ["0:37–0:42", "“…and Ellis Island, while Lower Manhattan starts shrinking behind you.”", "9:16 still/clip: Ellis Island, then quick vertical skyline view looking back toward Manhattan."],
    ["0:42–0:50", "“For the skyline, look behind you as you leave Manhattan. Outdoor deck space gives you the best photos when it’s open.”", "Vertical clip preferred: camera looking back from ferry toward Lower Manhattan."],
    ["0:50–0:58", "“If you’re sightseeing, avoid commuter rush hour. Staten Island to Manhattan is busiest in the morning…”", "9:16 terminal crowd clip: commuters boarding/waiting."],
    ["0:58–1:05", "“…and the reverse is busiest after work. Midday is usually much easier.”", "9:16 calmer ferry/deck shot: sparse passengers, open seating or outdoor deck."],
    ["1:05–1:13", "“At St. George, follow the signs for the return ferry.”", "9:16 still/clip: St. George Terminal signage, ideally including arrows/directional signs."],
    ["1:13–1:20", "“Coming back to Manhattan, switch sides: the Statue is now on your left.”", "9:16 Statue clip/still: Liberty from return direction."],
    ["1:20–1:27", "“And save the best view for last—the Manhattan skyline gets bigger and bigger straight ahead.”", "Vertical clip strongly preferred: approaching Lower Manhattan from the harbor."],
    ["1:27–1:32", "“Twenty-five minutes each way, zero dollars, and one of the best harbor rides in New York.”", "9:16 hero still/clip: orange ferry + Manhattan skyline."],
  ];
  const parsed = timed.parseTimedScriptMarkdown(rows.map((row) => row.join("\t")).join("\n"));
  assert.equal(parsed.errors.join(" "), "");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.timeline.segments.length, 13);
  assert.equal(parsed.timeline.duration_seconds, 92);
  assert.match(parsed.timeline.segments[0].voiceover_text, /^Want one of New York City/);
  assert.match(parsed.timeline.segments[4].voiceover_text, /^You’ll pass Lady Liberty/);
  assert.match(parsed.timeline.segments[12].voiceover_text, /^Twenty-five minutes each way/);
  assert.equal(parsed.timeline.segments[9].start_seconds, 65);
  assert.equal(parsed.timeline.segments[9].end_seconds, 73);
});

test("markdown bold around a time range still parses", () => {
  const parsed = timed.parseTimedScriptMarkdown(`
| Time | Voiceover | Suggested still |
| --- | --- | --- |
| **0:00-0:07** | "At St. George, follow the signs." | **9:16 still:** ferry terminal |
| **0:07-0:15** | "Coming back to Manhattan, switch sides." | Liberty from the return direction |
`);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.timeline.segments.length, 2);
  assert.equal(parsed.timeline.segments[0].start_seconds, 0);
  assert.equal(parsed.timeline.segments[0].end_seconds, 7);
  assert.equal(parsed.timeline.segments[1].start_seconds, 7);
  assert.equal(parsed.timeline.segments[1].end_seconds, 15);
  assert.match(parsed.timeline.segments[0].voiceover_text, /At St\. George/);
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

test("normalizeTimeline tolerates trailing ez-photo-wait tokens after JSON", () => {
  const parsed = timed.parseTimedScriptMarkdown(NYC_SUBWAY_SCRIPT);
  const payload = timed.directiveLine(parsed.timeline).replace(/^\[timed-script\]\s*/i, "");
  const dirty = `${payload}; ez-photo-wait=off; ez-photo-reject=recW7moQtdrPbNXg1`;
  const timeline = timed.normalizeTimeline(dirty);
  assert.equal(timeline.duration_seconds, 90);
  assert.equal(timeline.segments.length, 8);
  assert.equal(timed.segmentDurationFrames(timeline.segments[0]), 210);
});

test("assignStillsInOrder overwrites stale asset ids", () => {
  const parsed = timed.parseTimedScriptMarkdown(NYC_SUBWAY_SCRIPT);
  parsed.timeline.segments[0].asset_id = "stale-wrong";
  const assets = Array.from({ length: 8 }, (_, index) => ({ id: `still-${index + 1}`, order: index + 1 }));
  const timeline = timed.assignStillsInOrder(parsed.timeline, assets);
  assert.equal(timeline.segments[0].asset_id, "still-1");
});

test("suggested filenames bind stills even when pool order differs", () => {
  const parsed = timed.parseTimedScriptMarkdown(`
| Time | Voiceover | Suggested still |
| --- | --- | --- |
| 0:00–0:05 | Start at 72nd Street. | UpperWestSide_72nd_platform.jpg |
| 0:05–0:12 | Tap OMNY and walk through. | OMNY_reader_closeup.jpg |
`);
  const assets = [
    { id: "recOmny2", order: 1, name: "OMNY_reader_closeup.jpg" },
    { id: "recWide1", order: 2, name: "UpperWestSide_72nd_platform.jpg" },
  ];
  const timeline = timed.assignStillsInOrder(parsed.timeline, assets);
  assert.equal(timeline.segments[0].asset_id, "recWide1");
  assert.equal(timeline.segments[1].asset_id, "recOmny2");
});
