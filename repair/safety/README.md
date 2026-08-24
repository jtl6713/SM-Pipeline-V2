# Repair safety contract — Items 1 and 5

This directory is the branch-only safety infrastructure for the SM Pipeline V2 repair program. It has no credentials and performs no network calls.

## Contract

Every live repair activation must carry a lease with: `lease_id`, `test_run_id`, `expires_at`, `max_runs`, `max_operations`, exact `scenario_ids`, exact Airtable record IDs, and exact Platform Output record IDs. Missing/expired/overlapping leases are rejected before activation. RUN and external-effect reservations are budgeted before the effect. Public publishing is denied unless one exact platform/output pair is explicitly allowlisted.

Make state-changing commands are serialized and state-verified. A `finally` cleanup deactivates every scenario touched by the lease even after normal budget exhaustion. An independent watchdog contract deactivates expired or exhausted leases, covering abandoned-chat/process cases.

## First bounded fixture

- `test_run_id`: `REPAIR-TOP5-SAFETY-20260816-A`
- positive Output/Airtable fixture: Output 125, `recrSWeLpsA5TtpX5` (`Do_Not_Publish=true`)
- negative fixture that must remain untouched: Output 130, `recpiwWGrph3lsTn6`
- only scenario eligible for the first live safety proof: `MAKE-ADMIN-BRIDGE` `5893243`
- lease duration: 10 minutes from acquisition
- `max_runs=1`
- `max_operations=8`
- public publish allowlist: empty

The first live proof is not permitted until this contract is integrated into the controller and its dry-run tests pass.
