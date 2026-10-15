import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readStudioWorkerSource();

function loadHelpers() {
  const contextStart = worker.indexOf("function item4CaptionContextKey");
  const contextEnd = worker.indexOf("async function item4RequestAiSlideThemes", contextStart);
  const sanitizeStart = worker.indexOf("function item4StripAssetFilenameCaptionText");
  const sanitizeEnd = worker.indexOf("async function item4WriteStudioPostCaption", sanitizeStart);
  assert.ok(contextStart >= 0 && contextEnd > contextStart, "caption context helpers missing");
  assert.ok(sanitizeStart >= 0 && sanitizeEnd > sanitizeStart, "caption sanitizer missing");
  const snippet = [
    worker.slice(contextStart, contextEnd),
    worker.slice(sanitizeStart, sanitizeEnd),
    ";({ item4AssetCaptionForAiContext, item4StripAssetFilenameCaptionText });",
  ].join("\n");
  return vm.runInNewContext(snippet, Object.create(null));
}

test("AI caption context excludes exact asset and filename labels", () => {
  const { item4AssetCaptionForAiContext } = loadHelpers();
  const leaked = item4AssetCaptionForAiContext({
    name: "Chicago Italian Beef 6.jpg",
    library_asset_name: "Chicago Italian Beef 6",
    caption: "Chicago Italian Beef 6",
  }, "Italian Beef Dip Closeup");
  const semantic = item4AssetCaptionForAiContext({
    name: "Chicago Italian Beef 8.jpg",
    caption: "Hot giardiniera over a dipped Italian beef sandwich",
  }, "Italian Beef Dip Closeup");

  assert.equal(leaked, "");
  assert.equal(semantic, "Hot giardiniera over a dipped Italian beef sandwich");
});

test("final caption guard removes the reported Italian Beef asset inventory", () => {
  const { item4StripAssetFilenameCaptionText } = loadHelpers();
  const caption = [
    "Italian Beef Dip Closeup 🍖",
    "Featuring: Chicago Italian Beef 6, Chicago Italian Beef 8, Chicago Italian Beef 1, Chicago Italian Beef 4, Chicago Italian Beef 3, Chicago Italian Beef 5, Chicago Italian Beef 7.",
    "Save this for your next beef run or tag a friend who’d demolish one.",
  ].join("\n");

  assert.equal(
    item4StripAssetFilenameCaptionText(caption),
    "Italian Beef Dip Closeup 🍖\nSave this for your next beef run or tag a friend who’d demolish one.",
  );
});

test("publish dispatch never falls back from a missing AI caption to Output_Title", () => {
  const start = worker.indexOf("async function studioEnsureOutputCaption");
  const end = worker.indexOf("async function studioDispatchApprovedPublishNow", start);
  const ensureCaption = worker.slice(start, end);
  assert.ok(start >= 0 && end > start, "studioEnsureOutputCaption missing");
  assert.doesNotMatch(ensureCaption, /Output_Title/);
  assert.match(worker, /skipped: "missing-ai-caption"/);
});
