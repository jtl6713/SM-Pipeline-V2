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
