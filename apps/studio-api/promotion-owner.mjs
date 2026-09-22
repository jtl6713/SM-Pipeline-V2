export function promotedContentOwner(currentRequestId, value) {
  const current = String(currentRequestId || "").trim();
  const rows = Array.isArray(value) ? value : (value ? [value] : []);
  const owner = rows
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") return String(item.id || item.record_id || "").trim();
      return "";
    })
    .find((id) => /^rec[A-Za-z0-9]+$/.test(id));
  return owner && owner !== current ? owner : null;
}
