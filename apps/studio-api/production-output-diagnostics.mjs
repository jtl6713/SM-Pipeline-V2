// Production display only. Use the same eligibility predicate as Home before
// calling this helper. Never expose raw provider exceptions, paths or URLs.
const text = value => String(value ?? "").trim();
const lower = value => text(value).toLowerCase();
const knownPlatforms = new Set(["Facebook","Instagram","TikTok","YouTube"]);
const knownTypes = new Set(["Story","Reel","Short","Video Draft","Photo Set","Carousel","Feed Post","Multi-Image Post","Single Image","Video"]);
function item(row, state, reason, next_action, owner = "system") {
  return {
    output_number: /^\d{1,12}$/.test(text(row.output_id)) ? Number(row.output_id) : null,
    platform: knownPlatforms.has(row.platform) ? row.platform : "Platform",
    output_type: knownTypes.has(row.studio_output_type) ? row.studio_output_type : "Output",
    state, reason, next_action, owner,
  };
}
export function productionOutputDiagnostic(row) {
  const render = lower(row.render_status);
  const output = lower(row.output_status);
  const state = lower(row.studio_state);
  const review = lower(row.review_status);
  const error = lower(row.remotion_error_message) + " " + lower(row.final_file_error_message);
  const job = Boolean(text(row.remotion_job_id));
  const file = Boolean(text(row.final_file_url) || text(row.final_file_id));
  const blocked = /^(blocked|failed|needs changes|changes requested)$/.test(render)
    || /^(blocked|needs changes|changes requested)$/.test(output)
    || /^(blocked|needs attention|needs asset repair|changes requested)$/.test(state);
  if (blocked || (!job && !file && /studio story narration integrity guard:/.test(error))) {
    if (/attempt already recorded on a sibling/.test(error)) {
      return item(row,"blocked","Related Story narration attempt must be reconciled","Quality Agent / Operations: verify the sibling audio attempt and reuse the verified audio. Do not generate narration again.");
    }
    if (/narration preparation failed; reconcile its exact attempt/.test(error)) {
      return item(row,"blocked","Story narration attempt failed","Quality Agent / Operations: reconcile the original attempt and reuse any verified audio before retrying.");
    }
    if (/narration storage existence not safely resolved/.test(error)) {
      return item(row,"blocked","Narration storage verification failed","Quality Agent / Operations: verify the original audio in storage and its integrity before rendering.");
    }
    if (/complete concise narration sentence/.test(error)) {
      return item(row,"blocked","Story needs a complete narration sentence","Quality Agent / Operations: repair and validate the Story narration text before rendering.");
    }
    if (/narration integrity guard:/.test(error)) {
      return item(row,"blocked","Story narration integrity check failed","Quality Agent / Operations: inspect the existing audio attempt and verify media integrity before retrying.");
    }
    if (/^(changes requested|needs changes)$/.test(review) || /^(changes requested|needs changes)$/.test(render)) {
      return item(row,"blocked","Revision requested","Open the request and review the requested changes before resubmitting the revision.","user");
    }
    return item(row,"blocked","Production validation failed","Quality Agent / Operations: investigate the output and repair the underlying failure before resuming.");
  }
  // A persisted job ID alone does not prove a live renderer or current progress.
  if (job && /^(rendering|rerendering)$/.test(render) && !file) {
    return item(row,"submitted","Render job recorded","No user action. Studio must confirm renderer progress and completion.");
  }
  if (job && !file) {
    return item(row,"reconcile","Render job exists but status is not confirmed","Quality Agent / Operations: reconcile the existing job; do not submit another render.");
  }
  if (file) {
    return item(row,"reconcile","Media exists but Production has not completed","Quality Agent / Operations: verify the media and reconcile its review readiness.");
  }
  if (/rendering|rerendering/.test(render) || /^(rendering|rerendering)$/.test(state)) {
    return item(row,"reconcile","Rendering status without a recorded renderer job","Quality Agent / Operations: verify render ownership and repair the stale status.");
  }
  if (/waiting in render queue|ready for render|queued/.test(render) || /waiting in render queue|ready for render|queued/.test(state)) {
    return item(row,"queued","Waiting for render admission","No user action. Studio must claim and prepare the output through the normal queue.");
  }
  if (/^(changes requested|needs changes)$/.test(review)) {
    return item(row,"blocked","Revision requested","Open the request and review the requested changes before resubmitting the revision.","user");
  }
  return item(row,"preparing","Preparation or review-readiness checks remain","No immediate user action. Open the request to inspect its inputs; Operations must investigate if progress stops.");
}
export function productionDiagnosticsSummary(activeRows, total) {
  const outputs = activeRows.map(productionOutputDiagnostic);
  const counts = { queued:0, submitted:0, blocked:0, reconcile:0, preparing:0 };
  for (const row of outputs) counts[row.state]++;
  return { total, remaining:outputs.length, outside_production:Math.max(0,total-outputs.length), counts, outputs };
}
