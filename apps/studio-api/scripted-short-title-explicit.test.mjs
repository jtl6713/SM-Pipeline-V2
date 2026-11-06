import test from "node:test";
import assert from "node:assert/strict";
import { scriptedShortPublishableTitle, scriptedShortExplicitTitle } from "./scripted-short-title.mjs";

const timeline = { segments: [{ voiceover_text: "Discover Miami's waterfront and its history." }] };
test("exact title instruction wins over narration-generated title", () => {
  assert.equal(scriptedShortPublishableTitle('Create a reel about Miami. Title: "Miami After Dark"', timeline, "Miami"), "Miami After Dark");
  assert.equal(scriptedShortPublishableTitle('Title it "The Real Little Havana"', timeline, "Miami"), "The Real Little Havana");
  assert.equal(scriptedShortPublishableTitle('Use the exact title: Miami Magic', timeline, "Miami"), "Miami Magic");
  assert.equal(scriptedShortPublishableTitle('The title should be "Brickell at Sunrise"', timeline, "Miami"), "Brickell at Sunrise");
});
test("a prompt without naming instructions keeps automatic title behavior", () => {
  assert.equal(scriptedShortExplicitTitle("Create a short about Miami waterfront."), "");
  assert.match(scriptedShortPublishableTitle("Create a short about Miami waterfront.", timeline, "Miami"), /Miami|Waterfront/i);
});

test("preserves exact user-authored LA Sixth Street Viaduct title from multiline brief", () => {
  const exact = "Sixth Street Viaduct — “Architecture in the Light”";
  const brief = [
    "Please use this exact title: " + exact,
    "Location: Sixth Street Viaduct (mid-span or east side looking toward the downtown towers)",
    "Shot list:",
    "Still: Strong architectural lines of the viaduct catching hard golden light",
    "Clip: Slow tracking shot along the curves of the bridge",
  ].join("\n");
  assert.equal(scriptedShortExplicitTitle(brief), exact);
  assert.equal(scriptedShortPublishableTitle(brief.replace(/\n/g, " "), timeline, "Los Angeles"), exact);
  assert.equal(scriptedShortPublishableTitle(brief, timeline, "Los Angeles"), exact);
});
test("other exact-title instructions preserve surrounding typography", () => {
  assert.equal(scriptedShortExplicitTitle('Please use the exact title: "LA Bridge After Dark"'), "LA Bridge After Dark");
  assert.equal(scriptedShortExplicitTitle("Set this exact title to: Sixth Street Viaduct — “Blue Hour”"), "Sixth Street Viaduct — “Blue Hour”");
});

test("Drifter structured exact-title brief wins over stale Chicago waterfront defaults", () => {
  const exact = "How to Find The Drifter | Chicago’s Hidden Speakeasy";
  const brief = [
    "ChicagoShining — New Short Video Production",
    "",
    "REQUIRED EXACT TITLE",
    "",
    exact,
    "",
    "Use this exact title for the Content Item, every platform output, the video title, and the thumbnail.",
    "Do not rewrite, shorten, or substitute another title.",
    "",
    "Creative direction",
    "Create a short about The Drifter speakeasy beneath Green Door Tavern.",
    "",
    "Exact voiceover script",
    "Chicago has a secret hiding beneath an old tavern.",
  ].join("\n");
  const waterfront = { segments: [{ voiceover_text: "Chicago's waterfront tells a long history." }] };
  assert.equal(scriptedShortExplicitTitle(brief), exact);
  assert.equal(scriptedShortPublishableTitle(brief, waterfront, "Chicago"), exact);
  assert.notEqual(scriptedShortExplicitTitle("Use this exact title for every platform output."), "for every platform output.");
});

test("supports Markdown heading and bold required title", () => {
  const exact = "How to Find The Drifter | Chicago’s Hidden Speakeasy";
  const brief = `## REQUIRED EXACT TITLE\n\n**${exact}**\n\nUse this exact title for every platform.\n`;
  assert.equal(scriptedShortExplicitTitle(brief), exact);
});
