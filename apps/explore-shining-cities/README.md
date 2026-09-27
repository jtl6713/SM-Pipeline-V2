# Explore Shining Cities public web

Public, customer-facing site for **ExploreShiningCities.com**.

This app is intentionally isolated from Studio and the production pipeline. It is a sibling under `apps/`, uses static Astro output, and does not call production workflow endpoints at request time.

## Architecture

- Framework: Astro 7 static generation
- Hosting target: Cloudflare Pages
- Production URL: https://exploreshoiningcities.com
- Build output: `dist/`
- Public routes are generated from `src/data/site.mjs`
- Google Drive / Media Assets remain the source authority for launch media
- Only curated `websiteStatus: "published"` records become public routes
- No Airtable token, Studio API, pipeline state, OAuth secret, or production-only field is exposed to the browser

## Local commands

```bash
npm install
npm run validate
npm run build
npm run dev
```

Astro 7 requires Node 22.12+; Node 24 is recommended for CI/Pages.

## Cloudflare Pages configuration

Create a **new Pages project** for this app. Do not repoint or rename the existing ChicagoShining Studio project.

| Setting | Value |
| --- | --- |
| Git repository | `jtl6713/SM-Pipeline-V2` |
| Production branch | `main` |
| Root directory | `apps/explore-shining-cities` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node | `24` |

Optional environment variable:

- `PUBLIC_CF_BEACON_TOKEN` — enables Cloudflare Web Analytics. If unset, no analytics beacon is emitted.

After the first successful Pages deployment:

1. Attach `exploreshoiningcities.com` as the production custom domain.
2. Attach `www.exploreshoiningcities.com`; `_redirects` canonicalizes it to the apex.
3. Keep all `chicagoshining.com` routes, tunnels and Worker routes unchanged.
4. Use Cloudflare-managed TLS.
5. Confirm `/robots.txt`, `/sitemap.xml`, the four city routes and representative detail pages.
6. Run a mobile check before announcing the site.

## Publishing boundary

Phase one uses a checked-in publication projection. That is deliberate: the public frontend never reads fragile production states directly.

The next Studio integration should write a **public website projection** with fields such as:

- stable public content id
- city slug
- content slug
- website publication status
- title / summary / editorial body
- public media derivatives
- categories / tags
- location / neighborhood
- social / YouTube links
- published / updated timestamps
- SEO metadata

Studio can then offer three publishing destinations: social, website, or both. A small publisher can generate the same projection shape consumed here, allowing the frontend to stay unchanged.

## Media evolution

Launch pages use approved active Media Assets through their durable Google Drive file IDs. For production scale, create web-optimized derivatives in the existing Cloudflare media layer/R2 and swap the public projection's media URL. Do not turn R2 into a second source-of-truth DAM; Google Drive + Media Assets remain authoritative.
