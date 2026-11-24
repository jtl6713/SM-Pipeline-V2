# SMV1 #2965 restart-safety contract

Incident: Morning Riverwalk Beat seven frames stalled following a runner deployment; protected observation showed unchanged SMV1 leases until the 20-minute expiry. Seven canonical crops recovered, six platform outputs produced. #2968 removed the Worker clock-based Processing reset.

This implementation records local owner PID on SMV1 drain/photo-group/transfer leases, waits 120 seconds after positively observed exit, and removes only the exact old token. It never reaps unknown/live/legacy/remote owners. Database circuit and existing limits remain. A durable exact crop claim and reserved Google Drive ID, checksum, destination and media ID are written before upload; a lost create response reuses the same ID and verifies provider metadata. Supabase remains canonical content authority. Local SQLite is execution bookkeeping only.

New planned maintenance admission endpoint is loopback and runner-secret authenticated. It freezes new root drains, producer and Worker heavy admission, allows admitted crop children to finish, and uses exact-token release. The deploy integration and independent restart wake-up must be validated on Windows. No unconditional reset or provider publication is authorized.

Acceptance: actual protected Windows process termination at pre-claim, post-claim/pre-upload, post-upload/pre-media-commit, post-media-commit/pre-queue-ready, restart with queued requests, and live no-duplicate proof. Legacy unjournaled Processing claims are not silently replayed. Unknown, PID-reused or inaccessible owners fail closed. Do not close #2965 until these gates and normal Factory handoff are verified.
