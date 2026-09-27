# Explore Shining Cities public-site architecture

## Decision

Add `apps/explore-shining-cities` as a sibling application in SM-Pipeline-V2.

This avoids coupling the public site to `apps/studio-web` or `apps/studio-api` while keeping source control, review, Cloudflare deployment practices and future pipeline integration in the same ecosystem.

## Runtime boundary

The public site is statically generated. It has no runtime dependency on Airtable, Studio API, pipeline-runner, uploader services, OAuth callbacks, tunnels, Remotion or publishing workers.

That boundary is intentional:

```
Production system
Airtable / Studio / pipeline workflow
          |
          | explicit website-publish action (future)
          v
Public publication projection
          |
          | build / cache invalidation
          v
Explore Shining Cities static site
```

The publication projection is the contract. Production-only fields never cross it.

## City model

A city is configuration, not an application:

- route slug
- display name
- existing Shining brand identity
- visual accent
- hero media
- editorial intro
- featured categories
- neighborhoods / areas
- verified social links

Shared templates generate city and content-detail routes. Adding a future city such as Boston should require a city config plus public content, not copied pages.

## Launch projection

Phase one stores curated public records in `src/data/site.mjs`. Each record references an existing active Media Asset by internal source identifiers for traceability, but those identifiers are not rendered in public HTML.

This is not intended to become the permanent CMS. It establishes the public schema before Studio gets a website-publish destination.

## Media

Google Drive + Media Assets remain durable authority in line with existing repo rules. Launch content uses Drive-backed image delivery.

Recommended next step after launch:

1. Add a website derivative job for approved assets.
2. Produce web sizes/formats into the existing Cloudflare media delivery layer.
3. Put only the public derivative URL in the publication projection.
4. Keep Drive file ID as internal lineage.
5. Cache immutable derivatives aggressively.

## Cloudflare

Use a new Cloudflare Pages project with root directory `apps/explore-shining-cities`. No Worker route is needed for phase one.

Production custom domains:

- `exploreshoiningcities.com`
- `www.exploreshoiningcities.com` -> canonical apex redirect

Do not change current `chicagoshining.com` routes or technical hostnames.

A future `studio.exploreshoiningcities.com`, `api.exploreshoiningcities.com`, or `media.exploreshoiningcities.com` migration is explicitly separate work.

## SEO and analytics

Built in:

- canonical URLs
- unique city/detail titles and descriptions
- Open Graph / social metadata
- JSON-LD
- semantic headings
- breadcrumbs
- sitemap.xml
- robots.txt
- strong internal linking
- optional Cloudflare Web Analytics beacon

## Safety

The public site has no credentials and no write access. It cannot mutate Airtable, publish social content, call uploader endpoints, change pipeline state or affect Studio behavior.
