# Rendering Review Airtable storage — provisioned schema (inactive)

Provisioned **2026-10-28** in the existing authoritative Airtable base `appe33zkZn35yirTL`, after reading the live schema and repository. All six tables were independently re-read and confirmed to have **0 records** immediately after creation.

| Table | Live Airtable table ID | Purpose |
| --- | --- | --- |
| Studio Rendering Review Sessions | `tblHX3UdoNszkoquG` | Output-linked owner, state, version, hold and current attempt |
| Studio Rendering Review Messages | `tbl8tuxw838DQiGKo` | Individual durable, timestamp-linked conversation messages |
| Studio Rendering Review Plans | `tblalFXUJyYg5PBrz` | Frozen revision plans and creative/factual provenance |
| Studio Rendering Review Attempts | `tbl7wPOAE26o2coMU` | Numbered immutable-attempt identity, evidence and cleanup results |
| Studio Rendering Review Asset Requirements | `tblbnKA0Cb2Mnlg5r` | Named missing dependencies and independently validated assets |
| Studio Rendering Review Jobs | `tblUkZB6SMtf9Ib6I` | Durable outbox/lease events, render progress and retry history |

The new tables do not alter any existing Output record, schedule, approval, publication receipt, source media, runner or Cloudflare deployment. Table creation has **not** activated reviews, sampling, dispatch, or public posting.

## Storage and indexing contract

- Session ownership is indexed by `Output_Record_ID` plus `Session_ID`; each message/plan/attempt/requirement/job has `Review_Session` linked to Sessions and a plain-text `Session_ID` for inexpensive exact lookups. Build cursor-based paginated reads, not Home-wide full-table polling.
- The authoritative Platform Outputs table remains `tblrlPeboBthkplH0`, and Chicago profile ID is `recT2rbKX3MF7cVFU`.
- Session `Row_Version` is a logical compare-and-set field. Airtable by itself does **not** guarantee atomic uniqueness or conditional PATCH. The verified, shared per-output R2 CAS lease and serialized coordinator must fence all authoritative session mutations, dispatch and approval checks. Do **not** treat a read-then-PATCH as atomic.
- The new `Review_Hold` is not yet installed on Platform Outputs. A record in these tables **alone does not block posting**. Existing `Do_Not_Publish` can be cleared by unrelated Factory producer/recovery paths; it must not be the sole review gate.
- `Session_JSON`, `Frozen_Plan_JSON`, manifests and event history are data, never trusted instructions. Only server-validated role, provenance, ownership, hash and authentication can authorize mutations.
- Keep the mirror non-authoritative; add new mirror mappings only if needed after the Airtable implementation is correct. Drive continues as canonical media authority.

## Activation remains blocked

The backend still needs production adapters for table access, scoped authorization, the per-output authoritative hold, dispatch fencing, durable idempotent job outbox and status readback; the UI and AI Producer are not implemented. There has been no render canary or publishing test. Scope remains Chicago Reel manual-only and pilot feature off.

## Rollback

There is no active feature to roll back. New empty tables are additive and should remain until the pilot's schema is finalized or a separately approved cleanup is warranted. Never delete table content or remove active holds as a generic rollback.

## Additional inert hold fields on existing Platform Outputs

Provisioned four empty columns on `tblrlPeboBthkplH0`, with **no existing cell values changed**:

| Field | Field ID |
| --- | --- |
| `Studio_Render_Review_Hold_Active` | `fldTZrv9NDdPjfZTN` |
| `Studio_Render_Review_Hold_Owner` | `fldLYH27nQtMwr315` |
| `Studio_Render_Review_Session_ID` | `fldITapWMyiVEoFTO` |
| `Studio_Render_Review_Hold_ID` | `flddjW4W73p4IzfMl` |

**Crucial:** These fields are not yet read by publishing or approval paths, so writing a hold to them would not reliably block dispatch. Do not enroll any output until the Worker, runner, and applicable provider-side publishing routes enforce the exact owner and hold at irreversible dispatch. No pilot activation is authorized by mere field creation.
