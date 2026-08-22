import assert from "node:assert/strict";
import test from "node:test";

import worker, { RECIPE, resolveRecipe } from "./worker.mjs";

class FakeImage {
  constructor(trace) {
    this.trace = trace;
  }

  transform(options) {
    this.trace.push(["transform", options]);
    return this;
  }

  draw() {
    this.trace.push(["draw"]);
    return this;
  }

  async output(options) {
    this.trace.push(["output", options]);
    return {
      response() {
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          headers: { "content-type": "image/jpeg" },
        });
      },
    };
  }
}

function environment(trace = []) {
  return {
    STUDIO_VARIANT_SERVICE_TOKEN: "test-secret",
    IMAGES: {
      input() {
        trace.push(["input"]);
        return new FakeImage(trace);
      },
    },
  };
}

function renderRequest(query, token = "test-secret") {
  return new Request(`https://variant.example/render?${query}`, {
    method: "POST",
    headers: { "X-Studio-Variant-Token": token },
    body: new Uint8Array([1, 2, 3]),
  });
}

test("recipe version is explicit and all four plan ratios use center crop", () => {
  assert.equal(RECIPE.version, "fill-crop-v2");
  assert.equal(RECIPE.ratios["4:5"].style, "center_crop");
  assert.equal(RECIPE.ratios["9:16"].style, "center_crop");
  assert.equal(RECIPE.ratios["1:1"].width, 1080);
  assert.equal(RECIPE.ratios["1:1"].height, 1080);
  assert.equal(RECIPE.ratios["16:9"].width, 1920);
  assert.equal(RECIPE.ratios["16:9"].height, 1080);
});

test("9:16 rendering uses one cover transform without blur compositing", async () => {
  const trace = [];
  const response = await worker.fetch(
    renderRequest("ratio=9%3A16&recipe=fill-crop-v2"),
    environment(trace),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-studio-variant-recipe"), "fill-crop-v2");
  assert.equal(response.headers.get("x-studio-variant-style"), "center_crop");
  assert.deepEqual(trace, [
    ["input"],
    ["transform", {
      width: 1080,
      height: 1920,
      fit: "cover",
      gravity: "center",
    }],
    ["output", {
      format: "image/jpeg",
      quality: 90,
      anim: false,
    }],
  ]);
});

test("stale or unknown recipes fail closed", async () => {
  const response = await worker.fetch(
    renderRequest("ratio=9%3A16&recipe=blur-fill-v1"),
    environment(),
  );
  assert.equal(response.status, 409);
  assert.match(await response.text(), /recipe must be fill-crop-v2/);
});

test("missing or incorrect credentials are rejected", async () => {
  const response = await worker.fetch(
    renderRequest("ratio=4%3A5&recipe=fill-crop-v2", "wrong-secret"),
    environment(),
  );
  assert.equal(response.status, 401);
});

test("ratio aliases resolve to the canonical recipe", () => {
  const spec = resolveRecipe(new URL("https://variant.example/render?ratio=9x16"));
  assert.equal(spec.ratio, "9:16");
  assert.equal(spec.recipe, "fill-crop-v2");
  assert.equal(spec.gravity, "center");
});

test("Facebook 1:1 and YouTube 16:9 fill-crop the same recipe as 4:5 and 9:16", async () => {
  const square = resolveRecipe(new URL("https://variant.example/render?ratio=1x1&recipe=fill-crop-v2"));
  assert.equal(square.ratio, "1:1");
  assert.equal(square.width, 1080);
  assert.equal(square.height, 1080);

  const landscape = resolveRecipe(new URL("https://variant.example/render?ratio=16:9&recipe=fill-crop-v2"));
  assert.equal(landscape.ratio, "16:9");
  assert.equal(landscape.width, 1920);
  assert.equal(landscape.height, 1080);

  const trace = [];
  const response = await worker.fetch(
    renderRequest("ratio=1%3A1&recipe=fill-crop-v2"),
    environment(trace),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-studio-variant-ratio"), "1:1");
  assert.deepEqual(trace[1], ["transform", {
    width: 1080,
    height: 1080,
    fit: "cover",
    gravity: "center",
  }]);
});

test("optional gravity keeps the fill-crop-v2 recipe and defaults to center", async () => {
  const spec = resolveRecipe(new URL("https://variant.example/render?ratio=4:5&recipe=fill-crop-v2&g=0.20x0.80"));
  assert.equal(spec.recipe, "fill-crop-v2");
  assert.equal(spec.style, "focal_crop");
  assert.deepEqual(spec.gravity, { x: 0.2, y: 0.8 });

  const trace = [];
  const response = await worker.fetch(
    renderRequest("ratio=4%3A5&recipe=fill-crop-v2&g=0.20x0.80"),
    environment(trace),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-studio-variant-recipe"), "fill-crop-v2");
  assert.equal(response.headers.get("x-studio-variant-gravity"), "0.20x0.80");
  assert.deepEqual(trace[1], ["transform", {
    width: 1080,
    height: 1350,
    fit: "cover",
    gravity: { x: 0.2, y: 0.8 },
  }]);
});
