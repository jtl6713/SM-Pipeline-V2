import { evaluateReviewPackage, verifyReviewImages, safeReviewPromotion } from "./review-package-readiness.mjs";

export const PRE_FACTORY_READY_FORMULA =
  'AND({Test_Run_ID}=BLANK(),{Published_At}=BLANK(),{Do_Not_Publish}=0,{Output_Status}="In Production",OR(AND({Render_Status}="Native Photo Route",{Selected_Clip_Count}>0,{Studio_Preview_URL}!=""),AND({Render_Status}="Rendered",{Final_File_URL}!="")))';

/**
 * Bounded pre-Factory recovery. Never starts a render, approves a proposal, or
 * touches schedule/publish fields. Caller supplies canonical Airtable I/O.
 *
 * The output approval lease prevents concurrent Factory approval; a second
 * canonical read immediately before mutation guards against newer workflow work.
 */
export async function sweepPreFactoryReady({
  candidates, read, patch, lock, mirror = async () => {}, fetchImpl = fetch,
  limit = 4, now = () => Date.now(), staleMs = 15 * 60_000,
}) {
  const result = { examined: 0, ready: 0, reconciled: 0, in_progress: 0,
    blocked: 0, errors: 0, skipped: 0, items: [] };
  if (!Array.isArray(candidates)) throw new Error("Canonical candidate list unavailable");
  for (const candidate of candidates) {
    if (result.reconciled >= limit) break;
    const id = candidate?.id;
    if (!/^rec[A-Za-z0-9]+$/.test(String(id || ""))) continue;
    const created = Date.parse(candidate.createdTime || "");
    if (!Number.isFinite(created) || now() - created < staleMs) {
      result.skipped++; continue;
    }
    result.examined++;
    try {
      const item = await lock(id, async () => {
        const current = await read(id);
        if (!current || current.id !== id) return { state: "UNKNOWN", reason: "canonical_read_failed" };
        const readiness = evaluateReviewPackage(current);
        if (!safeReviewPromotion(current, readiness)) {
          return { state: readiness.readiness, reason: readiness.reason, missing: readiness.missing_requirements };
        }
        const checked = await verifyReviewImages(readiness, { fetchImpl });
        if (checked.readiness !== "READY") {
          return { state: checked.readiness, reason: checked.reason, missing: checked.missing_requirements };
        }
        // A second read fences stale snapshots and changes made during network
        // probes. Avoid mutating active leases, requested revisions or terminal work.
        const latest = await read(id);
        if (!latest || latest.id !== id) return { state: "UNKNOWN", reason: "readback_missing" };
        const rechecked = evaluateReviewPackage(latest);
        if (!safeReviewPromotion(latest, rechecked)) return { state: rechecked.readiness, reason: "concurrent_change" };
        const stamp = new Date(now()).toISOString();
        const existingNotes = String(latest.fields?.Review_Notes || "").trim();
        const note = "Pre-Factory review package reconciled " + stamp
          + "; validated " + rechecked.evidence.join(", ") + ". No approval or rendering performed.";
        const updated = await patch(id, {
          Output_Status: "Ready for Review",
          Review_Status: "Review Sent",
          Review_Notes: [existingNotes, note].filter(Boolean).join("\n\n"),
        });
        if (!updated || updated.id !== id) throw new Error("Canonical patch confirmation unavailable");
        const after = await read(id);
        if (String(after?.fields?.Output_Status || "") !== "Ready for Review") {
          throw new Error("Canonical Ready for Review readback failed");
        }
        try { await mirror(after); } catch (error) {
          // Never roll back the canonical Airtable transition because its mirror
          // is stale. Report the failure for the existing mirror retry path.
          return { state: "RECONCILED", mirror_error: String(error?.message || error) };
        }
        return { state: "RECONCILED" };
      });
      if (item.state === "RECONCILED") { result.reconciled++; result.ready++; if (item.mirror_error) result.errors++; }
      else if (item.state === "READY") result.ready++;
      else if (item.state === "IN_PROGRESS") result.in_progress++;
      else if (item.state === "BLOCKED" || item.state === "FAILED") result.blocked++;
      else result.skipped++;
      result.items.push({ id, ...item });
    } catch (error) {
      result.errors++;
      result.items.push({ id, state: "ERROR", reason: String(error?.message || error) });
    }
  }
  return result;
}
