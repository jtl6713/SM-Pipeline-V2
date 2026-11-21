/** Recovery of an existing, already-paid ElevenLabs clip.
 * Pure validation helpers. Never request new provider generation here.
 */
const rec = value => /^rec[A-Za-z0-9]{14}$/.test(String(value || ""));
const run = value => /^[0-9a-f-]{30,45}$/i.test(String(value || ""));
export const RECOVERY_MIN_ORIGINAL_AGE_MS = 30 * 60 * 1000;
export const RECOVERY_READ_LEASE_MS = 90 * 1000;

export function videoRecoveryIdentity(job, { ideaId, sceneNumber, profileId }) {
  return !!(job && rec(ideaId) && rec(profileId) && run(job.run_id)
    && job.idea_id === ideaId && job.profile_id === profileId
    && Number(job.scene_number) === Number(sceneNumber) && Number(job.attempt) >= 1);
}

export function videoRecoveryFileName(job, title, sceneNumber) {
  if (!run(job?.run_id) || !Number.isInteger(Number(sceneNumber)) || Number(sceneNumber) <= 0)
    throw new Error("Cannot derive an exact generated-video filename");
  const base = String(title || "Script a Short").replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 65)
    .trim().replace(/\s+/g, "-");
  return `${base}-Scene-${sceneNumber}-${job.run_id.slice(0, 8)}.mp4`;
}

export function videoRecoveryEligibleForNewDriveIngest(job, now=Date.now()) {
  const approved = Date.parse(String(job?.approved_at || ""));
  return job?.state === "recovering" && job.recovery_stage === "search" && Number.isFinite(approved)
    && now - approved >= RECOVERY_MIN_ORIGINAL_AGE_MS
    && !job.runner_job_id && !job.recovery_upload_started_at;
}

/** Refuse ambiguous names, MIME, or byte sizes instead of registering the wrong file. */
export function selectRecoveredDriveVideo(files, expectedName, expectedBytes, allowSizeDifference=false) {
  if (!Array.isArray(files)) return { kind: "unverified" };
  const exact = files.filter(x => x?.name === expectedName && x?.trashed !== true);
  if (!exact.length) return { kind: "missing" };
  if (exact.length !== 1) return { kind: "ambiguous" };
  const file = exact[0];
  const byteSize = Number(file.size);
  const expected = Number(expectedBytes);
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(String(file.id || ""))
    || file.mimeType !== "video/mp4" || !(byteSize >= 1000)
    || (!allowSizeDifference && (!(expected >= 1000) || byteSize !== expected))) {
    return { kind: "mismatch" };
  }
  return { kind: "found", file: { id: file.id, size: byteSize } };
}

/** Supabase catalog must match the exact deterministic transfer and profile. */
export function selectRecoveredMediaAsset(rows, transferId, profileId) {
  if (!Array.isArray(rows)) return { kind: "unverified" };
  if (!rows.length) return { kind: "missing" };
  if (rows.length !== 1) return { kind: "ambiguous" };
  const row = rows[0];
  if (row?.metadata?.studio_transfer_id !== transferId
      || row?.metadata?.content_profile_airtable_id !== profileId
      || row?.media_class !== "Video"
      || !/^rec[A-Za-z0-9]{14}$/.test(String(row.airtable_record_id || ""))
      || !String(row.google_drive_file_id || "").trim()
      || row?.do_not_use === true || row?.active === false) {
    return { kind: "mismatch" };
  }
  return { kind: "found", id: row.airtable_record_id, fileId: row.google_drive_file_id };
}
