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
