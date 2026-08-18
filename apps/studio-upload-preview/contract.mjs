export const UPLOAD_PREVIEW_SELF_HEAL = Object.freeze({
  schema: "upload-preview-self-heal-v1",
  poll_ms: 3000,
  master_window_ms: 180000,
  variant_window_ms: 900000,
  image_retry_max: 3,
  image_retry_ms: 1200,
  extra_windows: 2,
  extra_window_ms: 15000,
  hard_refresh_required: false,
});

export const OBSERVABLE_UPLOAD_PREVIEW_STATES = Object.freeze([
  "idle",
  "uploading",
  "preview_pending",
  "retrying",
  "ready",
  "error",
  "revalidating",
]);

export function observableUploadPreviewState({
  assets_status = "",
  variant_status = "",
  preview_pending_count = 0,
  image_retrying = false,
  poll_mode = "observe",
} = {}) {
  const assets = String(assets_status || "");
  const variants = String(variant_status || "");
  if (assets === "Error" || variants === "Error") return "error";
  if (image_retrying || poll_mode === "revalidate") return "retrying";
  if (assets === "Uploading") return "uploading";
  if (variants === "Preparing" || Number(preview_pending_count) > 0) return "preview_pending";
  if (poll_mode === "await-visibility") return "revalidating";
  if (assets === "Ready" && (variants === "Ready" || variants === "None" || variants === "")) return "ready";
  return "idle";
}

export function nextPreviewRetry({ attempt = 0, max = UPLOAD_PREVIEW_SELF_HEAL.image_retry_max } = {}) {
  const current = Math.max(0, Number(attempt) || 0);
  const limit = Math.max(1, Number(max) || UPLOAD_PREVIEW_SELF_HEAL.image_retry_max);
  if (current >= limit) {
    return Object.freeze({
      retry: false,
      attempt: current,
      max: limit,
      wait_ms: null,
      cache_bust: false,
      hard_refresh_required: false,
    });
  }
  return Object.freeze({
    retry: true,
    attempt: current + 1,
    max: limit,
    wait_ms: UPLOAD_PREVIEW_SELF_HEAL.image_retry_ms,
    cache_bust: true,
    hard_refresh_required: false,
  });
}

export function cacheBustedPreviewUrl(url, attempt) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const [withoutHash, hash = ""] = raw.split("#");
  const [path, query = ""] = withoutHash.split("?");
  const params = new URLSearchParams(query);
  params.set("heal", String(attempt));
  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

export function nextStatusPoll({
  elapsed_ms = 0,
  window_ms = UPLOAD_PREVIEW_SELF_HEAL.master_window_ms,
  extra_windows_used = 0,
  extra_windows = UPLOAD_PREVIEW_SELF_HEAL.extra_windows,
  extra_window_ms = UPLOAD_PREVIEW_SELF_HEAL.extra_window_ms,
  poll_ms = UPLOAD_PREVIEW_SELF_HEAL.poll_ms,
} = {}) {
  if (Number(elapsed_ms) < Number(window_ms)) {
    return Object.freeze({
      continue: true,
      delay_ms: poll_ms,
      mode: "observe",
      extra_windows_used,
      hard_refresh_required: false,
    });
  }
  if (Number(extra_windows_used) < Number(extra_windows)) {
    return Object.freeze({
      continue: true,
      delay_ms: extra_window_ms,
      mode: "revalidate",
      extra_windows_used: Number(extra_windows_used) + 1,
      hard_refresh_required: false,
    });
  }
  return Object.freeze({
    continue: false,
    delay_ms: null,
    mode: "await-visibility",
    extra_windows_used,
    hard_refresh_required: false,
  });
}
