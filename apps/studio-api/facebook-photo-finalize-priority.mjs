/** Evidence-first selection for FB3 read-only Page-post permalink finalization.
 * This module never sends a new Facebook Graph create or modifies a schedule.
 */
export const FACEBOOK_PENDING_FINALIZE_FORMULA =
  'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Do_Not_Publish}=0,' +
  '{FB_Publish_Status}="Published Pending Finalize",{Platform_Post_ID}!="",' +
  '{Published_At}=BLANK(),{Publish_Status}!="Published")';

const field = (row, key) => row?.fields?.[key] ?? row?.[key];
const txt = (row, key) => String(field(row, key) ?? "").trim();

export function fb3FinalizeEligible(row, nowMs = Date.now()) {
  if (!/^rec[A-Za-z0-9]+$/.test(String(row?.id || ""))) return false;
  if (txt(row, "Platform") !== "Facebook" ||
      txt(row, "FB_Publish_Status") !== "Published Pending Finalize" ||
      txt(row, "Publish_Status") === "Published" ||
      txt(row, "Output_Status") === "Published" ||
      txt(row, "Published_At") ||
      txt(row, "Test_Run_ID") ||
      field(row, "Do_Not_Publish") === true) return false;
  if (!/^\d{6,30}(?:_\d{6,30})?$/.test(txt(row, "Platform_Post_ID"))) return false;
  // Do not race a live publisher. Stale lock recovery is owned by the
  // existing reservation/lock healer, never this finalization function.
  // Any extant lock is authoritative; never clear or override it here.
  // The independent lock-recovery routine must release it first.
  if (txt(row, "Publish_Locked_By") || txt(row, "Publish_Locked_At")) return false;
  return true;
}

export function selectFb3FinalizeBatch(rows, { limit = 4, nowMs = Date.now() } = {}) {
  const bounded = Math.max(1, Math.min(4, Math.trunc(Number(limit) || 4)));
  const candidates = (Array.isArray(rows) ? rows : [])
    .filter((row) => fb3FinalizeEligible(row, nowMs))
    .sort((a, b) => {
      const stamp = (row) => Date.parse(txt(row, "FB_Last_Checked_At")) || 0;
      return stamp(a) - stamp(b) || String(a.id).localeCompare(String(b.id));
    });
  if (!candidates.length) return [];
  // Round-robin prevents an inaccessible historic post from starving all
  // later IDs even if the remote finalize API fails before updating checked_at.
  const windows = Math.ceil(candidates.length / bounded);
  const index = Math.floor(nowMs / (5 * 60_000)) % windows;
  return candidates.slice(index * bounded, (index + 1) * bounded);
}
