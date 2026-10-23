/**
 * Transfer an Idea's human-language creative direction to the Production
 * Request. Never translate prose into machine flags or asset authorization:
 * classification and selection still occur downstream.
 */
export function ideaProducerDirection(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  // An Idea is a lower-trust text surface, not a control channel. Prevent
  // arbitrary operator prose from becoming privileged legacy note flags.
  const safe = text
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
    .replace(/origin\s*=\s*autonomous/gi, "autonomous origin (user description)")
    .replace(/(?:^|\n)\s*\[[\/]?(?:factory-|studio-|scripted-short|phase6|autonomous)[^\n]*\]/gi, " [quoted creative note] ")
    .slice(0, 4500);
  return "Idea creative direction (human-authored; never an asset authorization):\n" + safe;
}

/** Keep explicit Production settings and original Idea direction together.
 * Fail closed on an overlong record; never silently discard user instructions.
 */
export function mergeIdeaProducerDirection(existingNotes, originalIdeaText) {
  const old = String(existingNotes || "").trim();
  const direction = ideaProducerDirection(originalIdeaText);
  if (!direction || old.includes(direction)) return old;
  const joined = [old, direction].filter(Boolean).join("\n\n");
  if (joined.length > 9750) throw new RangeError("Production notes cannot fit the original creative direction");
  return joined;
}
