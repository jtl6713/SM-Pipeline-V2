// #2873: status polling may request background recovery, but it must not
// launch a new recovery fan-out every two seconds across Worker isolates.
// This is a cooldown, not a transfer claim. SQLite and Supabase CAS still
// own actual media execution. Explicit Prepare/Retry and durable cron do
// not depend on this optional polling fast path.
export const ITEM4_POLL_RESUME_COOLDOWN_MS = 60_000;

export async function claimItem4PollResume(bucket, recordId, { now = Date.now() } = {}) {
  if (!bucket?.get || !bucket?.put || !/^rec[A-Za-z0-9]+$/.test(String(recordId))) return false;
  const key = `studio/state/item4-poll-resume/${recordId}.json`;
  try {
    const current = await bucket.get(key);
    if (current) {
      const value = await current.json();
      const expires = Number(value?.expires_at);
      if (!current.etag || !Number.isFinite(expires) || expires > now) return false;
    }
    const written = await bucket.put(key, JSON.stringify({
      expires_at: now + ITEM4_POLL_RESUME_COOLDOWN_MS,
    }), {
      onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" },
    });
    return Boolean(written);
  } catch {
    // Background recovery is optional; the bounded scheduled drain remains
    // authoritative if the R2 admission service is unavailable.
    return false;
  }
}
