/**
 * A Studio Story that already has a complete, authoritative source/render plan
 * should enter R4 without an unrelated R2/R3 sweep.
 * This is render admission only, NEVER publishing or review approval.
 */
export function storySeedRenderStatus({ nativeReady, outputType, remotionReady }) {
  if (nativeReady === true) return "Native Photo Route";
  if (String(outputType || "").trim().toLowerCase() === "story" && remotionReady === true) {
    return "Ready for Render";
  }
  return null;
}
