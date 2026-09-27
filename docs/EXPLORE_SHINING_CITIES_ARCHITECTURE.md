# Explore Shining Cities website integration boundary

## Canonical source

The customer-facing Explore Shining Cities frontend no longer lives in this repository.

Canonical website source:

- Repository: `jtl6713/chicagoshining-website`
- Application: `apps/explore-shining-cities/`
- Production: https://exploreshiningcities.com
- Website CI/deployment workflows are owned by the website repository.

`SM-Pipeline-V2` remains the system of record for Studio, pipeline orchestration, asset/media processing, social publishing, and the future website-publication workflow.

## Integration contract

The public website must not read pipeline runtime state, Airtable credentials, uploader endpoints, OAuth secrets, tunnel services, or other production-only data directly.

The intended flow is:

```
SM-Pipeline-V2
Studio / Airtable / pipeline
        |
        | explicit website publish action
        v
Public website projection
        |
        | stable public contract
        v
jtl6713/chicagoshining-website
apps/explore-shining-cities
        |
        v
Cloudflare Pages
```

The publication projection should contain only public-safe data such as:

- stable public content id
- city slug
- content slug
- website publication status
- title, summary, and editorial body
- public media derivative URLs
- categories and tags
- location / neighborhood metadata
- social / YouTube links
- published and updated timestamps
- SEO metadata

## Ownership rule

Website presentation, routing, SEO, static generation, and Cloudflare Pages deployment belong in `chicagoshining-website`.

Pipeline logic that decides *what* should be published and prepares the public projection belongs in `SM-Pipeline-V2`.

Do not reintroduce the frontend application or website deployment workflow into this repository.
