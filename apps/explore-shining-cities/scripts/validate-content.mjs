import { cities, stories } from "../src/data/site.mjs";

const errors = [];
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

if (errors.length) {
  console.error("Explore Shining Cities content validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${cities.length} cities and ${stories.length} public content records.`);
