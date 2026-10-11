import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");

function loadHelpers() {
  const start = app.indexOf("function pipelineScheduleIsStory");
  const end = app.indexOf("function pipelineGlobalScheduleMs", start);
  assert.ok(start >= 0 && end > start, "helpers missing");
  // youtubeLiveUrl / tiktokLiveUrl are referenced; stub them for the live-url helper.
  const snippet = `
    function youtubeLiveUrl(record) {
      return String(record?.platform_post_url || "").trim() || (record?.youtube_video_id ? ("https://www.youtube.com/watch?v=" + record.youtube_video_id) : "");
    }
    function tiktokLiveUrl(record) {
      return String(record?.platform_post_url || record?.manual_published_url || "").trim();
    }
    ${app.slice(start, end)}
    ; ({ pipelineScheduleIsStory, pipelineMainOutputScore, pipelinePreferredMainOutput, pipelinePreferredLiveUrl });
  `;
  return vm.runInNewContext(snippet, Object.create(null));
}

test("Pipeline thumb helpers prefer TikTok Video / YouTube Short over Stories", () => {
  const {
    pipelineScheduleIsStory,
    pipelinePreferredMainOutput,
    pipelinePreferredLiveUrl,
  } = loadHelpers();
  const story = {
    id: "story1",
    platform: "Instagram",
    platform_output_type: "Story",
    platform_post_url: "https://instagram.com/stories/x",
    thumbnail_url: "https://example.com/story.jpg",
  };
  const reel = {
    id: "reel1",
    platform: "Instagram",
    platform_output_type: "Reel",
    platform_post_url: "https://instagram.com/reel/abc",
    thumbnail_url: "https://example.com/reel.jpg",
  };
  const short = {
    id: "yt1",
    platform: "YouTube",
    platform_output_type: "Short",
    youtube_video_id: "abc123",
  };
  const tiktok = {
    id: "tt1",
    platform: "TikTok",
    platform_output_type: "Video Draft",
    platform_post_url: "https://www.tiktok.com/@x/video/1",
  };
  assert.equal(pipelineScheduleIsStory(story), true);
  assert.equal(pipelinePreferredMainOutput([story, reel]).id, "reel1");
  assert.equal(pipelinePreferredMainOutput([story, short, tiktok]).id, "tt1");
  assert.equal(pipelinePreferredMainOutput([story, short]).id, "yt1");
  assert.equal(pipelinePreferredLiveUrl(story), "");
  assert.equal(pipelinePreferredLiveUrl(tiktok), "https://www.tiktok.com/@x/video/1");
  assert.match(pipelinePreferredLiveUrl(short), /youtube\.com\/watch\?v=abc123/);
});

test("Pipeline UI wires thumb links away from Stories", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.578-pipeline-publish-immediate"/);
  assert.match(app, /pipelinePreferredMainOutput/);
  assert.match(app, /pipeline-content-thumb-link/);
  assert.match(app, /data-pipeline-thumb-open/);
  assert.match(app, /never a Story companion/);
  assert.match(app, /\.pipeline-content-cell/);
});
