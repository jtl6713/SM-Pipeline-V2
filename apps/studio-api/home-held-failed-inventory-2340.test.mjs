import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  homeApprovedUnpublished,
  homeIsUnpublishedFailure,
  homeOutputContribution,
} from "./profile-summary-classification.mjs";

const source = fs.readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
const overview = source.slice(
  source.indexOf("export async function listSupabaseOverviewPack("),
  source.indexOf("function matchesOpsQueueOutputFormula(", source.indexOf("export async function listSupabaseOverviewPack(")),
);

test("Supabase Home census includes held terminal failures but not held normal outputs", () => {
  assert.match(overview, /or=\(do_not_publish\.eq\.false,publish_status\.eq\.Failed,output_status\.eq\.Failed,render_status\.eq\.Failed\)/);
  assert.doesNotMatch(overview, /"do_not_publish=eq\.false"/);
  assert.match(overview, /output_status\.neq\.Published/);
  assert.match(overview, /publish_status\.neq\.Published/);
  assert.match(overview, /stripDeletedDuplicateOutputRecords/);
});

test("Do Not Publish remains a hard dispatch hold while Failed stays visible in Home", () => {
  const story = {
    platform: "Instagram",
    format: "Story",
    review_status: "Approved",
    output_status: "Approved for Publishing",
    publish_status: "Failed",
    do_not_publish: true,
    auto_publish_enabled: false,
    published_at: null,
    platform_post_url: null,
  };
  assert.equal(homeIsUnpublishedFailure(story), true);
  assert.equal(homeOutputContribution(story).failed_outputs, 1);
  assert.equal(homeApprovedUnpublished(story), false);
  assert.equal(homeOutputContribution(story).approved_unpublished, 0);
  const safelyParked = { ...story, publish_status: "Ready to Publish" };
  assert.equal(homeIsUnpublishedFailure(safelyParked), false);
  assert.equal(homeApprovedUnpublished(safelyParked), false);
  const actuallyPublished = { ...story, published_at: "2026-11-21T04:00:00Z", publish_status: "Published" };
  assert.equal(homeIsUnpublishedFailure(actuallyPublished), false);
});
