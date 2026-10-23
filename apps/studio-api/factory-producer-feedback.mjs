import { parseGroundedMediaDirective } from "./factory-producer-media-edits.mjs";
/**
 * Conservative conversational Factory bridge. No LLM guesses and no silent
 * media substitution: only explicit exact-text changes can auto-execute.
 */
export function interpretFactoryProducerFeedback(note) {
  const raw = String(note || "").trim();
  if (!raw || raw.length > 3000) return { automatic: false, reason: "Review instructions are required (maximum 3000 characters)." };
  // Each instruction is parsed independently below. This allows mixed exact
  // narration/timing directives and uniquely grounded named-asset edits without
  // treating a generic media request as executable.
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const fields = {};
  const directives = [];
  const mediaEdits = [];
  const mediaRequests = [];
  for (const originalLine of lines) {
    // Polite, conversational phrasing is acceptable; exact requested text
    // following a colon is preserved, and every media ID is still verified.
    const line = originalLine
      .replace(/^(?:(?:please|kindly)\s+|(?:can|could|would)\s+you\s+|i\s*(?:would|'d)\s+like\s+(?:you\s+)?to\s+)+/i, "")
      .trim();
    // Explicit operator directions are grounded later against exactly one
    // classified, same-profile Media Asset before any Factory state changes.
    const named = line.match(/^(?:add|include|insert|use)\s+(?:(?:the|a|an)\s+)?(?:library\s+)?(photo|still|image|video clip|clip)\s+(?:named|called)\s*:?\s*(.{3,120})$/i)
      || line.match(/^(?:add|include|insert|use)\s+(?:(?:the|a|an)\s+)?(?:library\s+)?(photo|still|image|video clip|clip)\s+["“](.{3,120})["”]$/i);
    const byId = line.match(/^(?:add|include|insert)\s+(?:library\s+)?(photo|still|image|video clip|clip)s?\s*:\s*(rec[A-Za-z0-9]{14})$/i);
    if (named || byId) {
      const kind = /clip/i.test((named || byId)[1]) ? "clip" : "photo";
      const reference = (named || byId)[2].trim();
      if (named) {
        const name = reference.replace(/^["']|["']$/g, "");
        if (!/^[\p{L}\p{N} _().,'&-]{3,120}$/u.test(name))
          return { automatic: false, reason: "Library asset name contains unsupported characters." };
        mediaRequests.push({kind,name});
      } else mediaRequests.push({kind,id:reference});
      directives.push(kind === "clip" ? "add_clip" : "add_photos");
      continue;
    }
    const mediaEdit = parseGroundedMediaDirective(line);
    if (mediaEdit) {
      mediaEdits.push(mediaEdit);
      directives.push(mediaEdit.operation === "reorder" ? "reorder_media" : "trim_clip");
      continue;
    }
    let match = line.match(/^(?:set|change|replace|update)\s+(?:the\s+)?(?:post\s+)?caption\s+(?:to|with)\s*:\s*(.+)$/i);
    if (match) {
      fields.Caption_Mode = "Force exact";
      fields.Requested_Caption = match[1].trim();
      directives.push("metadata_only");
      continue;
    }
    match = line.match(/^(?:set|change|replace|rewrite)\s+(?:the\s+)?(?:voiceover|narration)(?:\s+script)?\s+(?:to|with)\s*:\s*(.+)$/i);
    if (match) {
      fields.Script_Mode = "Force exact";
      fields.Requested_Script = match[1].trim();
      directives.push("rewrite_narration");
      continue;
    }
    // Common conversational timing requests: precise duration only, never
    // interpret "a little shorter" as an arbitrary number.
    match = line.match(/^(?:make|shorten|lengthen|adjust)\s+(?:the|this|it)?\s*(?:video|short|reel|clip)?\s*(?:to|at)\s*(\d{1,3})\s*(?:seconds?|secs?|s)\.?$/i)
      || line.match(/^make\s+(?:this|it|the\s+video)\s+(\d{1,3})\s*(?:seconds?|secs?)\s*(?:long)?\.?$/i);
    if (match) {
      const seconds = Number(match[1]);
      if (seconds < 5 || seconds > 600) return { automatic: false, reason: "Video duration must be between 5 and 600 seconds." };
      fields.Video_Duration_Seconds = seconds;
      directives.push("adjust_timing");
      continue;
    }
    // A precise whole-video duration is safe to send to the existing Studio
    // timing/render pipeline. Vague instructions such as "slow the transitions"
    // still require a real timeline plan and remain manual.
    match = line.match(/^(?:set|change|adjust)\s+(?:the\s+)?(?:video|final video|overall)\s+duration\s+(?:to|at)\s*:?\s*(\d{1,3})\s*(?:seconds?|secs?|s)$/i)
      || line.match(/^make\s+(?:the\s+)?video\s+(\d{1,3})\s*(?:seconds?|secs?)\s*long$/i);
    if (match) {
      const seconds = Number(match[1]);
      if (!Number.isInteger(seconds) || seconds < 5 || seconds > 600)
        return { automatic: false, reason: "Video duration must be between 5 and 600 seconds." };
      fields.Video_Duration_Seconds = seconds;
      directives.push("adjust_timing");
      continue;
    }
    return { automatic: false, reason:
      "Media and creative changes need a unique attached asset name, an explicit asset ID, or guided asset selection before execution." };
  }
  if (!directives.length || Object.values(fields).some(value => !value))
    return { automatic: false, reason: "Provide explicit replacement text after a colon." };
  if (mediaRequests.length > 3) return { automatic: false, reason: "Choose up to three library assets per revision." };
  if (mediaRequests.length && mediaEdits.length) return { automatic: false, reason: "Add library media and reorder/trim existing scenes in separate revisions." };
  return { automatic: true, fields, media_edits: mediaEdits, media_requests: mediaRequests, changes: [...new Set(directives)] };
}
