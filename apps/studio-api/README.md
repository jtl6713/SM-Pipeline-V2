# Studio API

Cloudflare Worker: `chicagoshining-studio-api`.

Migration state: source recovery in progress.

Latest recovered Worker source reports version `0.9.4-item4-r2-explicit-eligibility`.

Before production deployment is connected to GitHub:

- compare recovered source to the live Cloudflare Worker;
- add Wrangler configuration without secrets;
- document bindings and environment-variable names;
- validate `/api/health` in a preview deployment.
