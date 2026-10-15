# Studio API Worker source refactor

The 2.14 MB `worker.js` was split into ESM modules to make individual files readable through GitHub's normal Contents API (< 1 MB/file).

- `worker.js` remains the Cloudflare Worker entry point and owns the route/scheduled handlers and stateful globals.
- `worker-functions-01.mjs` through `worker-functions-04.mjs` contain **verbatim** function bodies moved from the entry point; named imports/exports reconnect the original references.
- Functions assigning to module-global `let` state remain in `worker.js` to preserve assignment semantics. Other functions read live bindings from the entry point.
- No Make.com cleanup, behavior change, datastore migration, or Cloudflare production deployment is included.
- All modules must be present together in Wrangler's source directory. Do not deploy only `worker.js`.
- Cyclic ESM imports are intentional, and safe only while the function modules contain declarations without top-level side effects. Future refactors should progressively replace cycles with domain-local services and dependency injection.

Validate: `node --check apps/studio-api/worker.js`, `node --check apps/studio-api/worker-functions-*.mjs`, `node --test apps/studio-api/*.test.mjs`, and a Wrangler dry run before production.
