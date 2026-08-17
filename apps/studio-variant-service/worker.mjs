const SERVICE = "chicagoshining-studio-variant-service";
const VERSION = "2.0.0";

export const RECIPE = Object.freeze({
  version: "fill-crop-v2",
  outputFormat: "image/jpeg",
  quality: 90,
  ratios: Object.freeze({
    "4:5": Object.freeze({ width: 1080, height: 1350, style: "center_crop" }),
    "9:16": Object.freeze({ width: 1080, height: 1920, style: "center_crop" }),
  }),
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function sha256(value) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))),
  );
}

async function authorized(request, env) {
  const expected = String(env.STUDIO_VARIANT_SERVICE_TOKEN || "");
  const provided = String(request.headers.get("X-Studio-Variant-Token") || "");
  if (!expected || !provided) return false;

  const [expectedHash, providedHash] = await Promise.all([
    sha256(expected),
    sha256(provided),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= expectedHash[index] ^ providedHash[index];
  }
  return difference === 0;
}

function normalizeRatio(value) {
  const ratio = String(value || "").trim().toLowerCase();
  if (ratio === "4:5" || ratio === "4x5" || ratio === "4-5") return "4:5";
  if (ratio === "9:16" || ratio === "9x16" || ratio === "9-16") return "9:16";
  return null;
}

export function resolveRecipe(url) {
  const ratio = normalizeRatio(url.searchParams.get("ratio"));
  if (!ratio) return { error: "ratio must be 4:5 or 9:16", status: 400 };

  const requestedRecipe = String(url.searchParams.get("recipe") || RECIPE.version);
  if (requestedRecipe !== RECIPE.version) {
    return {
      error: `recipe must be ${RECIPE.version}`,
      status: 409,
      requested_recipe: requestedRecipe,
    };
  }

  return {
    ratio,
    recipe: RECIPE.version,
    ...RECIPE.ratios[ratio],
  };
}

async function renderFillCrop(request, env, spec) {
  const output = await env.IMAGES
    .input(request.body)
    .transform({
      width: spec.width,
      height: spec.height,
      fit: "cover",
      gravity: "center",
    })
    .output({
      format: RECIPE.outputFormat,
      quality: RECIPE.quality,
      anim: false,
    });
  return output.response();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: Boolean(env.IMAGES) && Boolean(env.STUDIO_VARIANT_SERVICE_TOKEN),
        service: SERVICE,
        version: VERSION,
        recipe_version: RECIPE.version,
        images_configured: Boolean(env.IMAGES),
        token_configured: Boolean(env.STUDIO_VARIANT_SERVICE_TOKEN),
        authoritative_storage: "google_drive",
        persistent_cloudflare_storage: false,
        supported_inputs: ["HEIC", "JPEG", "PNG", "WebP"],
        outputs: Object.fromEntries(
          Object.entries(RECIPE.ratios).map(([ratio, spec]) => [
            ratio,
            { ...spec, format: "jpeg" },
          ]),
        ),
      });
    }

    if (url.pathname !== "/render") return json({ ok: false, error: "Not found" }, 404);
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    if (!(await authorized(request, env))) return json({ ok: false, error: "Unauthorized" }, 401);
    if (!env.IMAGES) return json({ ok: false, error: "Images binding is not configured" }, 503);
    if (!request.body) return json({ ok: false, error: "Raw image request body is required" }, 400);

    const spec = resolveRecipe(url);
    if (spec.error) return json({ ok: false, ...spec }, spec.status);

    try {
      const result = await renderFillCrop(request, env, spec);
      const headers = new Headers(result.headers);
      headers.set("content-type", RECIPE.outputFormat);
      headers.set("cache-control", "no-store");
      headers.set("x-studio-variant-service", SERVICE);
      headers.set("x-studio-variant-version", VERSION);
      headers.set("x-studio-variant-recipe", RECIPE.version);
      headers.set("x-studio-variant-ratio", spec.ratio);
      headers.set("x-studio-variant-width", String(spec.width));
      headers.set("x-studio-variant-height", String(spec.height));
      headers.set("x-studio-variant-style", spec.style);

      return new Response(result.body, { status: 200, headers });
    } catch (error) {
      return json({
        ok: false,
        error: "Image transformation failed",
        detail: error instanceof Error ? error.message : String(error),
        ratio: spec.ratio,
        recipe_version: RECIPE.version,
      }, 500);
    }
  },
};
