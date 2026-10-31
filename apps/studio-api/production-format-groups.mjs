/**
 * Data-driven edit compatibility. A source Production Request is already
 * common to its child outputs, so compare only the rendered media contract.
 * Publishing metadata, dates and platform names are deliberately excluded.
 * Missing metadata cannot be treated as equivalent.
 */
const normalized = value => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function productionFormatSignature({ pipeline_family, format, aspect_ratio } = {}) {
  const parts = [pipeline_family, format, aspect_ratio].map(normalized);
  if (parts.some(part => !part || part === "unknown" || part === "none")) return "";
  return parts.join("|");
}

export function matchingProductionRenderOutputs(selected, outputs = []) {
  const signature = String(selected?.render_format?.key || "");
  if (!signature) return [];
  return (Array.isArray(outputs) ? outputs : []).filter(row =>
    row?.enabled !== false && row?.render_format?.key === signature
  );
}
