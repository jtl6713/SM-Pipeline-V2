import test from "node:test";
import assert from "node:assert/strict";
import { translateProductionRequestFormula } from "./supabase-pipeline-reads.mjs";

test("#2574 Vibe backfill query is a valid PostgREST name=value filter", () => {
  const formula = "AND({Test_Run_ID}=BLANK(),{Active}=1,OR({Request_Status}='Draft',{Request_Status}='Ready',{Request_Status}='Submitted'),{Studio_Master_Asset_Status}='Ready',{Studio_Master_Asset_Count}=1,FIND('ez-input=vibe-cut',{Production_Notes})>0)";
  const filter = translateProductionRequestFormula(formula);
  assert.ok(filter);
  const url = new URL("https://test.invalid/production_requests?" + filter);
  assert.equal(url.searchParams.get("production_notes"), "ilike.*ez-input=vibe-cut*");
  assert.equal(url.searchParams.has("production_notes.ilike.*ez-input"), false);
  assert.equal(url.searchParams.get("request_status"), "in.(Draft,Ready,Submitted)");
});
