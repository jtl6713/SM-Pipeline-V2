# SM Pipeline V2 Project Rules

## Chat continuity / transition safeguard

- Treat chat continuity as an operational safety concern.
- Before a long SM Pipeline V2 work session is at meaningful risk of filling or truncating, create a **transition ZIP** proactively; do not wait for the chat to fail.
- The transition ZIP must be self-contained enough for a new ChatGPT project chat to resume without re-learning the system.
- Include at minimum: current objective, exact completed checkpoint, active blockers, next actions in priority order, production/test record IDs, scenario IDs and module names involved, current GitHub branch/commit references, deployment/Worker state, safety leases/allowlists/budgets, evidence locations, and any files needed for the immediate next work.
- Do **not** place plaintext secrets/tokens/API keys in the transition ZIP. Reference the approved encrypted/managed credential source and connection method instead.
- Verify live state at the beginning of the new chat before making changes.

## Operating style

- Keep progress updates concise so the chat does not fill unnecessarily.
- Continue working autonomously when safe instead of stopping for routine approvals.
- Prefer exact, bounded, reversible changes over broad scenario activation or broad end-to-end reruns.
- When referring to Make, include scenario name plus module number/name.
- Preserve the exact source images/order and Google Drive media authority.

## Repair-test safety

- Production repairs require activation leases, operation/run budgets, exact allowlists, negative fixtures, deterministic cleanup, and an independent watchdog where scenario activation is involved.
- Public publishing is denied by default during repair tests unless explicitly authorized for that test.
- Never use a broad selector when an exact Platform Output / record address is available or can be added safely.

## Quality Agent signature catalog

- The Quality Agent must consult `docs/handoffs/Quality-Agent-Signatures.md` on every health/recovery scan.
- Treat signature IDs in that catalog as durable operational contracts: check them proactively, not only after a row reaches Failed.
- When a signature marks an automatic repair as safe, use the bounded repair described there and preserve authoritative media/order. If any safety precondition is missing, escalate rather than guessing.
- Current signature: `QA-TT-DUPLICATE-SLIDES` detects the TikTok native-photo 2× linked-slide duplication pattern first observed on Platform Output 997.
