// Keep these helpers aligned with apps/studio-web/assets/app-item4-0620.js
// (Asset Manager card date, duration, file size, and published-file labels).

export function formatLibraryClipDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  const total = Math.round(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function libraryDurationLine(record) {
  if (String(record?.media_kind || "").toLowerCase() !== "video") return "";
  const formatted = formatLibraryClipDuration(record?.duration_seconds);
  return formatted ? `Length ${formatted}` : "";
}

export function libraryFileBytes(record) {
  const bytes = Number(record?.file_size_bytes || 0);
  if (Number.isFinite(bytes) && bytes > 0) return Math.round(bytes);
  const mb = Number(record?.file_size_mb || 0);
  if (Number.isFinite(mb) && mb > 0) return Math.round(mb * 1024 * 1024);
  return 0;
}

export function formatLibraryFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  const trim = (n) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
  if (value < kb) return `${Math.round(value)} B`;
  if (value < mb) return `${trim(value / kb)} KB`;
  if (value < gb) return `${trim(value / mb)} MB`;
  return `${trim(value / gb)} GB`;
}

export function librarySizeLine(record) {
  return formatLibraryFileSize(libraryFileBytes(record));
}

export function libraryListClassName(mode) {
  if (mode === "list") return "library-list library-list--text";
  if (mode === "thumbs") return "library-list library-list--thumbs";
  return "library-grid";
}

export function isBrowserSafeLibraryImageUrl(url) {
  const href = String(url || "").trim();
  if (!href) return false;
  if (/drive\.google\.com|googleapis\.com\/drive|\/uc\?id=/i.test(href)) return false;
  if (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(href)) return false;
  if (href.startsWith("/api/")) return true;
  if (!/^https?:\/\//i.test(href)) return false;
  if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(href)) return true;
  return href.startsWith("https://media.chicagoshining.com/");
}

export function publishedLibraryPosterUrl(record) {
  const candidates = [record?.poster_url, record?.thumbnail_url, record?.studio_preview_url];
  return candidates.map((value) => String(value || "").trim()).find(isBrowserSafeLibraryImageUrl) || "";
}

export function publishedLibraryStreamPath(record) {
  if (String(record?.media_kind || "").toLowerCase() !== "video") return "";
  const explicit = String(record?.preview_stream_url || "").trim();
  if (explicit.startsWith("/api/")) return explicit;
  const id = String(record?.id || "").trim();
  if (!/^rec[A-Za-z0-9]+$/.test(id)) return "";
  return `/api/outputs/${id}/preview`;
}

export function libraryAddedLine(intakeDate, formatDate) {
  const raw = String(intakeDate || "").trim();
  if (!raw) return "";
  const label = typeof formatDate === "function" ? formatDate(raw) : raw;
  if (!label || label === "—") return "";
  return `Added ${label}`;
}

export function libraryPublishedLine(publishedAt, formatDate) {
  const raw = String(publishedAt || "").trim();
  if (!raw) return "";
  const label = typeof formatDate === "function" ? formatDate(raw) : raw;
  if (!label || label === "—") return "";
  return `Published ${label}`;
}

export function libraryCardKindLabel(record) {
  if (record?.record_type === "platform_output") {
    return record.file_released ? "File removed" : "Published";
  }
  return String(record?.media_kind || "").toLowerCase() === "video" ? "Clip" : "Photo";
}

export function publishedLibraryConfirmCopy({ platform = "this", outputType = "output" } = {}) {
  return `Remove the Google Drive copy of this published ${platform} ${outputType}? The Platform Output record, publish date, and live post link stay for reporting. Source library stills and clips are not affected.`;
}

export function libraryCardMetaParts(record, { formatDate } = {}) {
  if (record?.record_type === "platform_output") {
    return {
      added: "",
      duration: libraryDurationLine(record),
      published: libraryPublishedLine(record.published_at, formatDate),
      size: librarySizeLine(record),
    };
  }
  return {
    added: libraryAddedLine(record?.intake_date, formatDate),
    duration: libraryDurationLine(record),
    published: "",
    size: librarySizeLine(record),
  };
}
