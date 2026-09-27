import { SITE, cities, publishedStories, storyUrl } from "../data/site.mjs";

export const prerender = true;

export function GET() {
  const paths = [
    "/",
    "/about",
    "/privacy",
    "/terms",
    ...cities.map((city) => `/${city.slug}`),
    ...publishedStories.map((story) => storyUrl(story))
  ];

  const urls = paths
    .map((path) => `  <url><loc>${SITE.url}${path === "/" ? "" : path}</loc></url>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" }
  });
}
