// #2915: recover only original, authenticated Factory consent, never mint it.
const actor = /^rec[A-Za-z0-9]{14}$/;
const request = /^[A-Za-z0-9_-]{8,128}$/;
const stamp = value => Date.parse(String(value || ""));
export const FACTORY_ORIGINAL_INTENT_SIGNATURE = "QA-FACTORY-ORIGINAL-INTENT-2915";
export const isOriginalIntentFailure = error =>
  String(error || "").includes("Native gallery final approval requires a new authenticated Factory submitter and request AFTER the owner hold release");

// Parent acceptance is the authentic event. A resumed child may be created
// much later; its creation time must NEVER turn a pre-release click into
// post-release consent. A legacy child may lack the actor; the authenticated
// parent is sufficient only with exact, ordered child membership.
export function originalFactoryIntent(job, parent = null) {
  if (!job || !request.test(String(job.request_id || ""))) return null;
  let origin = job;
  if (job.group_request_id) {
    if (!parent || parent.request_id !== job.group_request_id ||
        !request.test(String(parent.request_id || "")) ||
        !Array.isArray(parent.children) || !Array.isArray(parent.records) ||
        !Array.isArray(job.items) || !job.items.length) return null;
    const matches = parent.children.filter(c =>
      c.request_id === job.request_id && c.profile_id === job.profile_id);
    if (matches.length !== 1) return null;
    const child = matches[0];
    if (!Array.isArray(child.records) || child.records.length !== job.items.length ||
        new Set(job.items.map(i=>i.id)).size !== job.items.length ||
        child.records.some((r,i) => r.id !== job.items[i].id ||
          Number(r.output_id) !== Number(job.items[i].output_id) ||
          !parent.records.some(p=>p.id===r.id && p.profile_id===job.profile_id &&
            Number(p.output_id)===Number(r.output_id)))) return null;
    if (job.submitted_by && job.submitted_by !== parent.submitted_by) return null;
    origin = parent;
  }
  if (!actor.test(String(origin.submitted_by || "")) ||
      !Number.isFinite(stamp(origin.created_at))) return null;
  return {requestId:origin.request_id, approvedByUserRecordId:origin.submitted_by,
    submittedAt:origin.created_at};
}

// Conservative historical recovery: no inferred revision from counts or URL.
// Any subsequent output/slide write requires a fresh human decision, unless
// a future revision-fingerprint ledger independently proves unchanged media.
export function originalIntentCoversGallery(intent, output, proof) {
  if (!intent || !output || !proof || !Array.isArray(proof.slides) ||
      !proof.slides.length || proof.pending !== proof.slides.length ||
      !actor.test(String(intent.approvedByUserRecordId || "")) ||
      !request.test(String(intent.requestId || ""))) return false;
  const submitted = stamp(intent.submittedAt);
  const released = stamp(output.publish_hold_released_at);
  const updated = stamp(output.updated_at);
  return Number.isFinite(submitted) && Number.isFinite(released) &&
    Number.isFinite(updated) && submitted >= released && submitted >= updated &&
    output.do_not_publish === false && output.auto_publish_enabled === false &&
    output.output_status === "Ready for Review" && output.review_status === "Review Sent" &&
    output.publish_status === "Not Ready" && !output.published_at &&
    !output.platform_post_url && !output.scheduled_post_date && !output.studio_scheduled_at &&
    proof.slides.every(s => Number.isFinite(stamp(s.updated_at)) &&
      stamp(s.updated_at) <= submitted);
}
