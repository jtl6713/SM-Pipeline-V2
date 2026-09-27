import { SITE } from "../data/site.mjs";

export const prerender = true;

export function GET() {
  return new Response(
    `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
}
