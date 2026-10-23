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
  for (const line of lines) {
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
  return { automatic: true, fields, media_edits: mediaEdits, changes: [...new Set(directives)] };
}
