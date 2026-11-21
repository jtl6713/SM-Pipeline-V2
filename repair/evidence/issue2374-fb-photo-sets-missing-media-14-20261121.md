# Issue #2374 — Facebook Photo Set missing-media recovery (already applied)

**Production project:** `vkwvscgisqsbuwagdvtb` (Supabase SoR).  
**Date:** 2026-11-21 UTC.  
**Operation:** guarded, atomic, source-only status transition. **Do not replay this mutation.**  
**Publication:** 0 provider/media writes, 0 publish calls, 0 retries, 0 Airtable operations.

## Why these are NOT ready to publish

The following original overdue/approved Facebook Photo Sets were incorrectly left in `Ready to Publish` + `FB_Publish_Status = Ready for Assets`, with **zero** gallery images, **zero** ready assets, no final/publish file, no selected media array/text, no Facebook photo child IDs, no stored provider response and no active publisher owner lock:

`9822, 9883, 9896, 9900, 9906, 9909, 9913, 9914, 9920, 9935, 9944, 10022, 10032, 10034`.

Every row retained the original `Studio_Overdue_Evidence_Audit_20261120` marker. Its previously stamped dispatch count was 2 and last error was `RESCUE_SKIP: overdue-rescue: skipped: facebook_not_ready_for_assets`. A skipped rescue is **not remote no-publication proof**.

## The one-time source-only correction

A single guarded SQL CTE first locked all fourteen candidate rows (`FOR UPDATE`) and admitted the write **only if exactly all fourteen still matched** the complete live preflight (approved/overdue, same platform/type/stage, no test ID, zero image or selected-media state, no final asset, no provider receipt, no active lock, no existing rework marker). Admission returned `true`; the same statement updated **14 of 14**, and returned all exact IDs.

For those fourteen, the only changes were:
- `review_status = Changes Requested`
- `output_status = Changes Requested`
- `publish_status = Not Ready`
- `fb_publish_status = NULL` (unprepared package, never inferred ready)
- `do_not_publish = true`, `auto_publish_enabled = false`, `publish_retry_eligible = false`
- `scheduled_post_date = NULL`, `studio_scheduled_at = NULL`, `publish_next_retry_at = NULL`
- Append `error_messages.Studio_Overdue_Preflight_Repair_20261120`, preserving the previous review/output/publish/stage status, previous scheduled date, auto/retry flags, recorded dispatch count, UTC audit time, reason and fresh approval requirement.

No content was deleted; source video/images were not modified. No external post-status or negative-publication conclusion was fabricated.

## Independent readback

After the transaction, a separate Supabase query returned:

| Check | Observed |
|---|---:|
| Approved/overdue/unverified records remaining | **221** (previously 235) |
| Protected media reworks | **33** (previously 19) |
| Expected exact rework outputs | **14** |
| Rows with **all** guarded review/status/lock/schedule flags and archived recovery marker | **14** |
| Public posts claimed or remote media created | **0** |

This removes fourteen **defective Ready states**, not fourteen verified posts. The unresolved workload is now **221 provider cases plus 33 creative reworks**.

## Rebuild and release gate

Before any of these records can return to scheduling:
1. Prepare the actual approved **1:1 Facebook gallery** with selected image assets and nonzero correct image/ready counts.
2. Verify media location, branding and preview; require fresh **human Factory approval**.
3. Reconcile provider owner/account history to independently rule out a duplicate delivery. No saved response/ID is **not** evidence of absence.
4. Use the regular **MAE scheduling** path, not a direct/forced publish. Preserve idempotency, cooling, and publishing protections.

This ledger is the source of record for the **already-applied** protected rework. It is not an instruction to reapply a status reset or to automatically republish. Issue #2374 must stay open.
