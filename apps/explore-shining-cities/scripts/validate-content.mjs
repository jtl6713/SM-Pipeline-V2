import { cities, stories } from "../src/data/site.mjs";

const errors = [];

function driveFileIdFromUrl(url) {
  const match = String(url || "").match(/[?&]id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function assertPublicDriveImage(url, label) {
  const fileId = driveFileIdFromUrl(url);
  if (!fileId) {
    errors.push(`${label} is not a Drive image URL`);
    return;
  }
  try {
    const response = await fetch(`https://lh3.googleusercontent.com/d/${fileId}=w200`, {
      method: "HEAD",
      redirect: "follow",
    });
    const type = String(response.headers.get("content-type") || "");
    if (!response.ok || !type.startsWith("image/")) {
      errors.push(`${label} is not publicly readable (${response.status} ${type || "no type"}). Use an anyone-with-link library original, not a private fill-crop.`);
    }
  } catch (error) {
    errors.push(`${label} could not be checked: ${error.message}`);
  }
}
const citySlugs = new Set(cities.map((city) => city.slug));
const routes = new Set();

for (const city of cities) {
  if (!city.slug || !city.name || !city.brand || !city.hero || !city.description) {
    errors.push(`City config is incomplete: ${city.slug || city.name || "unknown"}`);
  }
}

for (const story of stories) {
  const route = `/${story.city}/${story.slug}`;
  if (!citySlugs.has(story.city)) errors.push(`Unknown city for ${route}`);
  if (routes.has(route)) errors.push(`Duplicate route: ${route}`);
  routes.add(route);

  const required = ["title", "summary", "description", "location", "image", "imageAlt", "published", "updated"];
  for (const field of required) {
    if (!story[field]) errors.push(`${route} is missing ${field}`);
  }

  if (!["published", "draft"].includes(story.websiteStatus)) {
    errors.push(`${route} has invalid websiteStatus ${story.websiteStatus}`);
  }

  if (story.websiteStatus === "published" && (!story.source?.mediaAssetId || !story.source?.driveFileId)) {
    errors.push(`${route} is published without a traceable source media asset`);
  }
}

for (const city of cities) {
  await assertPublicDriveImage(city.hero, `/${city.slug} hero`);
}

if (errors.length) {
  console.error("Explore Shining Cities content validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${cities.length} cities and ${stories.length} public content records.`);
