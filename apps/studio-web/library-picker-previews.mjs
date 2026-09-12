// Keep these helpers aligned with apps/studio-web/assets/app-item4-0621.js

export function driveThumbnailPreviewUrl(fileId) {
  const id = String(fileId || "").trim();
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w640` : "";
}

export function libraryPickerApiPreviewUrl(item, apiBase = "") {
  const path = String(item?.preview_path || item?.preview_url || "").trim();
  if (path.startsWith("http")) return path;
  if (path) return `${apiBase}${path}`;
  const id = String(item?.id || "").trim();
  return id ? `${apiBase}/api/media-assets/${encodeURIComponent(id)}/preview` : "";
}

export function libraryPickerPreviewCandidates(item, apiBase = "") {
  const apiPreview = libraryPickerApiPreviewUrl(item, apiBase);
  const thumb = driveThumbnailPreviewUrl(item?.google_drive_file_id);
  return [...new Set([apiPreview, thumb].filter(Boolean))];
}

export function previewImageLooksReady(img) {
  return Boolean(img && Number(img.naturalWidth) > 0);
}
