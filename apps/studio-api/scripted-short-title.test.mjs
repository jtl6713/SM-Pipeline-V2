import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { scriptedShortPublishableTitle } from "./scripted-short-title.mjs";

const batteryPrompt = "Educate on the history of Battery Park City area of lower Manhattan. You don't have to be brief. Utilize the battery park images that are uploaded into the system.";
const batteryScenes = {
  segments: [
    { voiceover_text: "Welcome to Battery Park and Battery Park City—where New York's shoreline tells four centuries of change." },
    { voiceover_text: "Start at Castle Clinton, a nineteenth-century harbor fort guarding the tip of Manhattan." },
    { voiceover_text: "By the 1970s, landfill from downtown projects shaped Battery Park City's new waterfront neighborhood." },
  ],
};

test("original Battery Park instructions become a short accurate title, never prompt text", () => {
  const title = scriptedShortPublishableTitle(batteryPrompt, batteryScenes, "New York City");
  assert.equal(title, "Battery Park & Battery Park City: Manhattan's Waterfront Story");
  assert.ok(title.length <= 90);
  assert.doesNotMatch(title, /educate|utilize|uploaded|system|you don't/i);
});

test("safe four-market fallback uses story and city, not instructions", () => {
  const prompts = [
    ["Chicago", "Educate on the history of the Chicago River bridges.", "Chicago River bridges"],
    ["New York City", "Make a guide to the Staten Island Ferry.", "Staten Island Ferry"],
    ["Los Angeles", "Explore the Getty Center in Los Angeles.", "Getty Center"],
    ["Miami", "Showcase the history of South Beach Art Deco architecture.", "South Beach Art Deco architecture"],
  ];
  for (const [market, prompt, place] of prompts) {
    const title = scriptedShortPublishableTitle(prompt, {segments:[]}, market);
    assert.ok(title.includes(place), title);
    assert.ok(title.length <= 90);
    assert.doesNotMatch(title, /educate|showcase|make a|explore the/i);
  }
});

test("voiceover actual subject wins over generic command prompt", () => {
  const title = scriptedShortPublishableTitle("Please use the uploaded images.", {
    segments: [{ voiceover_text: "Welcome to Chicago's riverfront—where history meets modern design." }]
  }, "Chicago");
  assert.match(title, /^Chicago's riverfront:/);
  assert.doesNotMatch(title, /uploaded/i);
});

test("empty and command-heavy prompts still produce a real safe headline", () => {
  const title = scriptedShortPublishableTitle("Create a video. Use all images that are uploaded into the system.", {segments:[]}, "Miami");
  assert.equal(title, "Miami: A Closer Look");
});

test("Accept persists suggested headline, not truncated prompt; original instructions remain summary", async () => {
  const source = await readFile(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const accept = source.split("export async function acceptScriptedShortRoute(")[1].split("/*__STUDIO_WORKER_END:acceptScriptedShortRoute__*/")[0];
  const propose = source.split("export async function proposeScriptedShortRoute(")[1].split("/*__STUDIO_WORKER_END:proposeScriptedShortRoute__*/")[0];
  assert.match(accept, /const title = scriptedShortPublishableTitle\(creativeBrief, timeline,/);
  assert.doesNotMatch(accept, /const title = prompt\.slice\(0, 160\)/);
  assert.match(accept, /Candidate_Title: title/);
  assert.match(accept, /Title_Mode: "Force exact"/);
  assert.match(accept, /Requested_Title: title/);
  assert.match(accept, /Exact short title was not saved/);
  assert.match(accept, /Idea_Summary: creativeBrief/);
  assert.match(propose, /suggested_title: scriptedShortPublishableTitle\(creativeBrief, timeline,/);
});
