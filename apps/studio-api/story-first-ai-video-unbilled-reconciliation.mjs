// One-off, exact-scope recovery for the November 9, 2026 unbilled
// Chicago River ElevenLabs proof-of-concept. This module never calls a provider.
const IDEA_ID = "recTgiblVhRnCfNuf";
const PROFILE_ID = "recT2rbKX3MF7cVFU";
const RECONCILIATION_ACK = "RECONCILE-UNBILLED-2217-SCENE-1";
const VIDEO_MODEL = "veo-3.1-fast-generate-001";

export function validateUnbilledChicagoVideoAttempt(job, context, evidence) {
  const reject = message => { throw new Error(message); };
  if (context?.ideaId !== IDEA_ID || context?.sceneNumber !== 1 ||
      context?.profileId !== PROFILE_ID) reject("Unbilled reconciliation is restricted to Chicago River Idea 2217, Scene 1");
  if (!job || job.idea_id !== IDEA_ID || job.scene_number !== 1 ||
      job.profile_id !== PROFILE_ID || job.state !== "submission_uncertain" ||
      job.attempt !== 1 || job.generation_id !== null)
    reject("The exact first uncertain video reservation is required; no other job can be unlocked");
  if (!/^[a-f0-9-]{36}$/i.test(String(job.run_id || "")) ||
      !/^2026-11-09T/.test(String(job.approved_at || "")) ||
      !Number.isFinite(Date.parse(job.approved_at)) ||
      job.error !== "Manual provider/reference reconciliation required")
    reject("The recorded POC submission does not match the verified November 9 failure");
  const settings = job.settings || {};
  if (Number(job.estimated_credits) !== 2425 ||
      settings.model_id !== VIDEO_MODEL || settings.duration_secs !== 4 ||
      settings.aspect_ratio !== "9:16" || settings.resolution !== "720p" ||
      settings.generate_audio !== false ||
      !String(settings.prompt || "").includes("Chicago River at golden hour"))
    reject("The request does not match the original approved 2425-credit Veo configuration");
  const references = settings.references || {};
  if (references.start_frame || references.end_frame ||
      ["images","videos","audios"].some(k => !Array.isArray(references[k]) || references[k].length) ||
      (Array.isArray(job.provider_asset_ids) && job.provider_asset_ids.length))
    reject("The proof-of-concept was reference-free; reference assets require separate reconciliation");
  if (evidence?.acknowledgement !== RECONCILIATION_ACK ||
      evidence?.no_charge_confirmed !== true ||
      evidence?.provider_post_absent_confirmed !== true ||
      evidence?.no_provider_generation_confirmed !== true)
    reject("Admin must explicitly attest to no provider POST, no generated video and no credit charge");
  return true;
}

export function reconcileUnbilledChicagoVideoAttempt(job, context, evidence, actor, now) {
  validateUnbilledChicagoVideoAttempt(job, context, evidence);
  const stamp = new Date(now);
  if (!Number.isFinite(stamp.getTime())) throw new Error("Invalid reconciliation timestamp");
  const reconciliation = {
    kind: "operator_verified_unbilled_cloudflare_redirect_error",
    reviewed_at: stamp.toISOString(),
    reviewed_by: String(actor || "authenticated-admin").slice(0,160),
    original_run_id: job.run_id,
    evidence: {
      provider_request_log: "Seven-day ElevenLabs log: only GET /v1/flows/video on November 8; no POST for POC",
      usage: "Account owner verified no video-generation credit deduction on November 9",
      cloudflare_runtime: 'Invalid redirect value "error" prior to Worker 0.10.790',
      provider_post_absent_confirmed: true,
      no_charge_confirmed: true,
      no_provider_generation_confirmed: true,
    },
  };
  return {
    audit: {schema:"studio.story-video-reconciliation.1",original_job:job,reconciliation},
    next: {
      ...job,
      state: "failed",
      error: "Attempt 1 was verified unbilled (Cloudflare redirect error). A fresh quote and explicit approval are required.",
      reconciliation,
    },
  };
}

export const UNBILLED_CHICAGO_VIDEO_ACK = RECONCILIATION_ACK;
