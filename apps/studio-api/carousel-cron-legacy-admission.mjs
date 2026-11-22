/**
 * The old (pre-Supabase) carousel stage can carry unsaved Meta operations.
 * Restoring canonical stage discovery must not replay an unreviewed historic
 * AP1C or AP3C provider CREATE. A documented original gallery audit can
 * authorize a specific historical output; recent due outputs use normal flow.
 */
const HISTORICAL_CUTOFF_MS = Date.parse("2026-11-22T02:00:00Z");
const value = (row, key) => row?.fields?.[key] ?? null;
const str = x => String(x ?? "").trim();

export function carouselCronCandidateAdmission(row, stage, nowMs = Date.now()) {
  const deny = reason => ({ eligible: false, reason });
  if (!Number.isFinite(nowMs)) return deny("invalid_clock");
  if (!/^rec[A-Za-z0-9]{14}$/.test(str(row?.id))) return deny("invalid_output_id");
  if (str(value(row, "Platform")) !== "Instagram" ||
      str(value(row, "Platform_Output_Type")) !== "Instagram Carousel")
    return deny("not_instagram_carousel");
  if (value(row, "Do_Not_Publish") === true ||
      value(row, "Auto_Publish_Enabled") !== true) return deny("held_or_auto_disabled");
  if (str(value(row, "Review_Status")) !== "Approved")
    return deny("not_review_approved");
  const outputStatus = str(value(row, "Output_Status"));
  if (outputStatus !== "Approved for Publishing" &&
      !(stage === "ap5c" && outputStatus === "Published"))
    return deny("not_approved_output");
  if (str(value(row, "Published_At")) || str(value(row, "Platform_Post_URL")))
    return deny("already_published");
  const dueAt = Date.parse(str(value(row, "Scheduled_Post_Date")));
  if (!Number.isFinite(dueAt) || dueAt > nowMs)
    return deny("scheduled_or_missing_due_time");
  if (dueAt < HISTORICAL_CUTOFF_MS) {
    const audit = value(row, "Issue_2340_AP0C_Gallery_Due_Promotion");
    if (!audit || typeof audit !== "object" ||
        audit.source_record_id !== row.id ||
        audit.original_publish_status !== "Ready to Schedule" ||
        !String(audit.reason || "").includes("restored exactly four"))
      return deny("historical_provider_operations_need_audit");
  }
  return { eligible: true, reason: "approved_carousel_continuation" };
}
