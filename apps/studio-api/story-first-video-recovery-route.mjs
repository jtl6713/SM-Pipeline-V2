/**
 * Recovery of an original ElevenLabs video after an interrupted Studio accept.
 * This module cannot call ElevenLabs. All reads/writes are scoped to one
 * authenticated idea/scene/profile and one immutable paid-generation run.
 */
import {
  videoRecoveryIdentity, videoRecoveryFileName, videoRecoveryEligibleForNewDriveIngest,
  selectRecoveredDriveVideo, selectRecoveredMediaAsset, RECOVERY_READ_LEASE_MS,
} from "./story-first-video-recovery.mjs";

const stages = new Set([
  "accepting", "recovering", "recovery_upload_started", "recovery_polling",
  "recovery_registering", "recovery_needs_review",
]);
const safeRun = value => /^[0-9a-f-]{30,45}$/i.test(String(value || ""));
const isoNow = () => new Date().toISOString();
const safeAge = value => Date.now() - Date.parse(String(value || ""));
const pipelineUrl = env => String(env.PIPELINE_RUNNER_URL || "").trim().replace(/\/+$/, "");
const error = (HttpError, status, message) => { throw new HttpError(status, message); };

async function checkCatalog({ lookupCatalog, transferId, profileId, HttpError }) {
  const found = selectRecoveredMediaAsset(await lookupCatalog(transferId), transferId, profileId);
  if (found.kind === "ambiguous" || found.kind === "mismatch" || found.kind === "unverified")
    error(HttpError, 409, "The original video has conflicting Asset Manager records. No duplicate was created; administrator review is required.");
  return found;
}

async function checkDrive({ env, filename, originalSize, watermarkRequired, googleAccessToken, HttpError }) {
  const token = await googleAccessToken();
  if (!token) error(HttpError, 503, "Google Drive identity is unavailable. No asset was changed.");
  const query = new URLSearchParams({
    q: "name = '" + filename.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "' and trashed = false",
    fields: "nextPageToken,files(id,name,mimeType,size,trashed,parents)",
    pageSize: "100", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
  });
  let response;
  try {
    response = await fetch("https://www.googleapis.com/drive/v3/files?" + query.toString(), {
      method: "GET", headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    error(HttpError, 503, "Could not verify existing Drive files. No recovery upload attempted.");
  }
  if (!response.ok) error(HttpError, 503, "Google Drive verification failed (" + response.status + "). No new upload attempted.");
  const json = await response.json().catch(() => null);
  if (!json || !Array.isArray(json.files) || json.nextPageToken)
    error(HttpError, 503, "Existing Drive files could not be checked exhaustively. No upload attempted.");
  const selected = selectRecoveredDriveVideo(json.files, filename, originalSize, watermarkRequired);
  if (!["missing", "found"].includes(selected.kind))
    error(HttpError, 409, "The original Drive file has ambiguous or mismatched metadata. Recovery stopped to prevent duplicates.");
  return selected;
}

async function runnerStatus({ env, runnerJobId, HttpError }) {
  const base = pipelineUrl(env);
  if (!base) error(HttpError, 503, "Pipeline Runner is unavailable.");
  let response;
  try {
    response = await fetch(base + "/jobs/studio-asset-library/" + encodeURIComponent(runnerJobId), {
      method: "GET",
      headers: { "X-Pipeline-Secret": String(env.PIPELINE_RUNNER_SHARED_SECRET || "") },
      signal: AbortSignal.timeout(15000),
    });
  } catch { error(HttpError, 503, "Runner status temporarily unavailable; retry Recover Existing Video. No upload was resubmitted."); }
  const body = await response.json().catch(() => ({}));
  if (response.status === 404) return { status: "lost" };
  if (!response.ok) error(HttpError, 503, "Runner status unavailable (" + response.status + "). No upload was resubmitted.");
  return body;
}

async function startOnce({ env, job, filename, mediaKey, head, writeJob, etag, HttpError }) {
  if (!pipelineUrl(env)) error(HttpError, 503, "Pipeline Runner is unavailable.");
  // Durable intent MUST precede the external Drive job POST. In case an HTTP
  // reply is lost, a second click MUST NOT send this upload again.
  const next = {
    ...job, state: "recovery_upload_started", recovery_stage: "upload",
    recovery_upload_started_at: isoNow(), recovery_error: null,
  };
  const claimedEtag = await writeJob(next, etag);
  const object = await env.STUDIO_MEDIA.get(mediaKey);
  if (!object || object.size !== head.size) {
    error(HttpError, 409, "Original R2 video changed or is missing. No additional Drive request was submitted.");
  }
  const bytes = await object.arrayBuffer();
  const form = new FormData();
  form.set("filename", filename);
  form.set("mime_type", "video/mp4");
  form.set("profile_name", String(job.recovery_profile_name || ""));
  form.set("async", "1");
  form.set("skip_source_master", "1");
  form.set("file", new Blob([bytes], {type:"video/mp4"}), filename);
  let response;
  try {
    response = await fetch(pipelineUrl(env) + "/jobs/studio-asset-library", {
      method: "POST",
      headers: { "X-Pipeline-Secret": String(env.PIPELINE_RUNNER_SHARED_SECRET || "") },
      body: form, signal: AbortSignal.timeout(30000),
    });
  } catch {
    error(HttpError, 503, "Original video ingest response was lost. Do not retry the upload; Recover Existing Video will check Drive again.");
  }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 202 && /^[0-9a-f]{32}$/i.test(String(payload.job_id || ""))) {
    const processing = { ...next, state: "recovery_polling", recovery_stage: "poll",
      runner_job_id: payload.job_id, recovery_started_at: isoNow() };
    await writeJob(processing, claimedEtag);
    return { ...processing, message: "Original MP4 submitted to Drive ingest once. Registration continues without ElevenLabs generation." };
  }
  // An old synchronous runner could commit Drive without returning a receipt.
  // Leave the durable intent for a fresh exact-name Drive search.
  error(HttpError, 503, "Runner did not return an async ingest receipt (" + response.status + "). No second ingest will be attempted.");
}

export async function recoverOriginalStoryVideo({
  env, ideaId, sceneNumber, profileId, profileName, title, scene, expectedRunId,
  audioMixAcknowledged, mediaOverride, jobKey, mediaKey,
  readJob, writeJob, lookupCatalog, createMedia, saveSelectedScene,
  googleAccessToken, watermarkRequired, rightsVerified, HttpError,
}) {
  if (!rightsVerified) error(HttpError, 503, "Commercial usage rights are not verified for the original video.");
  const found = await readJob();
  let job = found.job, etag = found.etag;
  if (!videoRecoveryIdentity(job, { ideaId, sceneNumber, profileId })
      || !safeRun(expectedRunId) || expectedRunId !== job.run_id) {
    error(HttpError, 409, "Original video job changed or belongs to another scene. Refresh status before recovery.");
  }
  if (!stages.has(job.state)) error(HttpError, 409, "This original video does not need interrupted-registration recovery.");
  if (scene.generated_master_id || (scene.assigned_asset_id && !scene.selected_approved)
      || String(scene.visual || "") !== String(job.scene_visual || "")) {
    error(HttpError, 409, "Scene changed after original video generation. No media was modified.");
  }
  if (job.settings?.generate_audio === true && audioMixAcknowledged !== true)
    error(HttpError, 409, "Generated soundtrack requires explicit acknowledgment.");
  if (scene.media === "still" && mediaOverride !== true)
    error(HttpError, 409, "Moving footage in a still-only scene requires explicit approval.");
  const head = await env.STUDIO_MEDIA.head(mediaKey);
  if (!head || head.size < 1000 || head.size > 30 * 1024 * 1024
      || String(head.customMetadata?.run_id || "") !== job.run_id
      || String(head.customMetadata?.ideaId || "") !== ideaId
      || String(head.customMetadata?.profileId || "") !== profileId
      || String(head.customMetadata?.sceneNumber || "") !== String(sceneNumber)) {
    error(HttpError, 409, "The original paid MP4 could not be verified in Studio R2. Nothing was replaced.");
  }
  const transferId = "LIB-AIV-" + job.run_id;
  const filename = videoRecoveryFileName(job, title, sceneNumber);

  // Catalog evidence takes priority over all possible Drive writes.
  const registered = await checkCatalog({lookupCatalog, transferId, profileId, HttpError});
  if (registered.kind === "found") {
    await saveSelectedScene(registered.id, mediaOverride === true, job);
    const current = await readJob();
    await writeJob({ ...current.job, state: "accepted", asset_id: registered.id, recovery_completed_at: isoNow() }, current.etag);
    return { ok: true, state: "accepted", asset_id: registered.id, recovered_existing: true,
      paid_generation_submitted: false, drive_upload_submitted: false };
  }

  // Never create a duplicate when an earlier registration/ingest may be active.
  if (job.state === "recovering" && safeAge(job.recovery_started_at) < RECOVERY_READ_LEASE_MS)
    return { ok:true, state:job.state, message:"Checking the existing video registration. No new upload was submitted.", paid_generation_submitted:false };

  if (job.state === "accepting" ||
      (job.state === "recovering" && safeAge(job.recovery_started_at) >= RECOVERY_READ_LEASE_MS) ||
      (job.state === "recovery_needs_review" && !job.recovery_upload_started_at)) {
    const next = { ...job, state:"recovering", recovery_stage:"search",
      recovery_started_at:isoNow(), recovery_profile_name:profileName };
    etag = await writeJob(next, etag); job = next;
  }
  const drive = await checkDrive({
    env,filename,originalSize:head.size,watermarkRequired,googleAccessToken,HttpError,
  });

  if (drive.kind === "found") {
    // The original request already reached Drive. Do not upload again.
    if (watermarkRequired && !job.recovery_runner_result) {
      error(HttpError, 409, "The existing Drive file needs verified brand-watermark evidence. No duplicate was created.");
    }
    const registration = { ...job, state:"recovery_registering", recovery_stage:"register",
      recovery_drive_file_id: drive.file.id, recovery_started_at: isoNow() };
    if (job.state !== "recovery_registering") {
      etag = await writeJob(registration, etag); job = registration;
    }
    // If an earlier create succeeded but the response was lost, recover it first.
    const latest = await checkCatalog({lookupCatalog,transferId,profileId,HttpError});
    let assetId = latest.kind === "found" ? latest.id : "";
    if (!assetId) {
      const base = String(title || "Script a Short").replace(/[^a-zA-Z0-9 ]/g, "").slice(0,65) + " Scene " + sceneNumber;
      const created = await createMedia({
        "Asset Name": base.trim() + " " + job.run_id.slice(0,6),
        Media_Class:"Video",
        "Google Drive URL":"https://drive.google.com/uc?export=download&id=" + drive.file.id,
        "Google Drive File ID":drive.file.id,
        MIME_Type:"video/mp4",File_Extension:"mp4",
        File_Size_Bytes: drive.file.size,
        Intake_Status:"Created",Intake_Date:isoNow(),
        Drive_Access_Status:"Public",Classification_Status:"Processing",
        Asset_Status:"Available",Active:true,Do_Not_Use:false,
        Capture_Source:"AI Generated",Rights_Status:"Licensed",Asset_Role:"Other",
        Raw_Source_Eligibility:"Not Applicable",
        Asset_Description: "Recovered already-paid ElevenLabs video for Idea " + ideaId
          + " scene " + sceneNumber + ", original run " + job.run_id + ".",
        Studio_Transfer_ID: transferId, Content_Profile:[profileId],
      });
      assetId = created?.records?.[0]?.id || "";
      if (!assetId) error(HttpError, 503, "Original Drive file exists but Asset Manager create was not confirmed. Refresh recovery; no reupload needed.");
    }
    const proven = await checkCatalog({ lookupCatalog, transferId, profileId, HttpError });
    if (proven.kind !== "found" || proven.id !== assetId || proven.fileId !== drive.file.id)
      error(HttpError, 409, "Asset Manager readback differs from original Drive file. Recovery stopped.");
    await saveSelectedScene(assetId, mediaOverride === true, job);
    const current = await readJob();
    await writeJob({ ...current.job, state:"accepted", asset_id:assetId, recovery_completed_at:isoNow() }, current.etag);
    return { ok:true, state:"accepted", asset_id:assetId, recovered_existing:true,
      paid_generation_submitted:false, drive_upload_submitted:false };
  }

  if (job.state === "recovery_polling" && job.runner_job_id) {
    const status = await runnerStatus({env,runnerJobId:job.runner_job_id,HttpError});
    if (["processing","queued","running"].includes(status.status))
      return {ok:true,state:"recovery_polling",message:"Original MP4 is being registered with Drive. No additional charge or upload.",paid_generation_submitted:false};
    if (status.status === "ok" && status.result?.google_drive_file_id) {
      const next = { ...job, state:"recovery_registering", recovery_stage:"register",
        recovery_drive_file_id:status.result.google_drive_file_id,
        recovery_runner_result: {
          provenance_clean: status.result?.provenance_screen?.decision === "clean",
          watermarked: status.result?.watermarked === true,
        } };
      // If Drive listing is eventually consistent, this persisted receipt
      // lets a subsequent button click perform a fresh verification.
      await writeJob(next, etag);
      return {ok:true,state:"recovery_registering",
        message:"Drive ingest completed. Recover Existing Video again to verify and select the original file.",
        paid_generation_submitted:false};
    }
    await writeJob({ ...job, state:"recovery_needs_review", recovery_stage:"review",
      recovery_error:"Runner receipt unavailable or failed; inspect existing Drive file, do not resubmit." }, etag);
    return {ok:true,state:"recovery_needs_review",message:"Runner receipt needs review. The original video is preserved; no upload was repeated.",paid_generation_submitted:false};
  }
  if (job.recovery_upload_started_at) {
    return {ok:true,state:job.state,message:
      "An earlier original-MP4 Drive ingest may have succeeded. Its result is uncertain; no second upload will be sent. Recovery can recheck Drive.",
      paid_generation_submitted:false};
  }
  if (job.state === "recovering" && videoRecoveryEligibleForNewDriveIngest(job)) {
    return await startOnce({env,job,filename,mediaKey,head,writeJob,etag,HttpError});
  }
  return {ok:true,state:job.state,message:
    "The original Drive registration may still be running. No duplicate upload was attempted. Use Recover Existing Video again after the safety window.",
    paid_generation_submitted:false};
}
