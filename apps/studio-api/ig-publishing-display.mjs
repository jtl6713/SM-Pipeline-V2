/**
 * Read-only display classification for historical Instagram Reel attempts.
 *
 * Airtable Publish_Status stays authoritative. A stranded attempt with no saved
 * Meta identity is NEVER evidence that Graph did not create remote content.
 * This helper must not authorize retries, releases, writes, or new containers.
 */
export function staleInstagramPublishingDisplay(record, {
  nowMs = Date.now(),
  staleMs = 30 * 60 * 1000,
} = {}) {
  const f = record?.fields || {};
  const s = (key) => String(f[key] ?? "").trim();
  if (s("Platform") !== "Instagram" || s("Platform_Output_Type") !== "Instagram Reel"
    || s("Output_Status") !== "Approved for Publishing"
    || s("Publish_Status") !== "Publishing"
    || s("Review_Status") !== "Approved") return null;
  // Saved Meta identity, a public URL or a completed receipt may require an
  // entirely different GET-only status reconciliation. Never relabel those.
  if (s("Platform_Post_ID") || s("Platform_Media_ID") || s("Platform_Post_URL")
    || s("Manual_Published_URL") || s("Published_At")) return null;
  if (f.Do_Not_Publish === true || f.Studio_Render_Review_Hold_Active === true
    || s("Studio_Render_Review_Hold_ID") || s("Studio_Render_Review_Hold_Owner")
    || s("Test_Run_ID") || s("Replace_Transaction_ID")) return null;
  const attempted = Date.parse(s("Last_Publish_Attempt_At"));
  if (!Number.isFinite(attempted) || !Number.isFinite(nowMs)
    || nowMs - attempted < Math.max(staleMs, 60000)) return null;

  const owner = s("Publish_Locked_By");
  const lockAt = s("Publish_Locked_At");
  const startedAt = s("Publish_Started_At");
  const exactRefusal = s("Output_Notes").includes(
    "QA-IG-STALE-UPLOAD: AP1-IG review guard refused continuation (publication_lock_changed)");
  let lockState;
  if (owner === "AP1-IG") {
    const lockedAtMs = Date.parse(lockAt);
    if (!Number.isFinite(lockedAtMs)
      || nowMs - Math.max(lockedAtMs, attempted) < Math.max(staleMs, 60000)) return null;
    lockState = "ap1_ig_held";
  } else if (!owner && !lockAt && !startedAt && exactRefusal) {
    lockState = "released_legacy";
  } else {
    return null; // Unknown owner, active transition, or ambiguous history.
  }
  return {
    label: "Needs Verification",
    reason: lockState === "released_legacy"
      ? "Previous Instagram lock released; remote publication unverified"
      : "Instagram publication lock stale; remote publication unverified",
    lock_state: lockState,
    provider_progress_verified: false,
    remote_create_authorized: false,
  };
}
