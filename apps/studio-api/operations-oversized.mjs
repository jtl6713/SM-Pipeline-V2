export function attachCompressionJobs(oversized, jobs) {
  const byId = new Map();
  for (const row of oversized || []) {
    const id = String(row?.google_drive_file_id || "").trim();
    if (!id) continue;
    byId.set(id, { ...row, compression: null });
  }
  for (const job of jobs || []) {
    const id = String(job?.google_drive_file_id || "").trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, { ...existing, compression: job });
      continue;
    }
    byId.set(id, {
      id: null,
      name: String(job.name || id).trim() || id,
      file_size_mb: job.file_size_mb ?? null,
      mime_type: "video/*",
      google_drive_file_id: id,
      google_drive_url: `https://drive.google.com/file/d/${id}/view`,
      source: "intake_folder",
      compression: job,
    });
  }
  return [...byId.values()].sort((a, b) => (Number(b.file_size_mb) || 0) - (Number(a.file_size_mb) || 0));
}

export function dropFinishedCompressionRows(cache, previousJobs, nextJobs) {
  const nextIds = new Set((nextJobs || []).map((job) => String(job?.google_drive_file_id || "").trim()).filter(Boolean));
  const finishedIds = new Set(
    (previousJobs || [])
      .map((job) => String(job?.google_drive_file_id || "").trim())
      .filter((id) => id && !nextIds.has(id))
  );
  if (!finishedIds.size) return Array.isArray(cache) ? cache : [];
  return (cache || []).filter((row) => !finishedIds.has(String(row?.google_drive_file_id || "").trim()));
}
