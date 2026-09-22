import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");

test("Facebook native photo handoff caps image packages at ten", () => {
  assert.match(worker, /Math\.min\(clipCount \|\| 1, 10\)/);
  assert.match(worker, /facebookImageCount > 1 \? "Multi-Photo Collage" : "Single Photo"/);
  assert.match(worker, /fields\.Image_Count = facebookImageCount/);
});
