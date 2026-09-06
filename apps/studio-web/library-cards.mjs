// Keep these helpers aligned with apps/studio-web/assets/app-item4-0619.js
// (Asset Library card date, duration, and published-file labels).

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
  return formatLibraryClipDuration(record?.duration_seconds);
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
    };
  }
  return {
    added: libraryAddedLine(record?.intake_date, formatDate),
    duration: libraryDurationLine(record),
    published: "",
  };
}
