/**
 * Conservative conversational Factory bridge. No LLM guesses and no silent
 * media substitution: only explicit exact-text changes can auto-execute.
 */
export function interpretFactoryProducerFeedback(note) {
  const raw = String(note || "").trim();
  if (!raw || raw.length > 3000) return { automatic: false, reason: "Review instructions are required (maximum 3000 characters)." };
  const media = /\b(add|insert|replace|remove|swap|find|use|include|reorder|change)\b[^\n.]{0,110}\b(photo|image|picture|still|clip|shot|scene|slide|transition|video|music|track|timing|duration|pace|opening|closing)\b/i;
  // Keep ambiguous media edits fail-closed; exact overall duration is handled
  // below, after parsing a complete unambiguous instruction.
  if (media.test(raw) && !/^(?:set|change|adjust)\s+(?:the\s+)?(?:video|final video|overall)\s+duration\s+(?:to|at)|^make\s+(?:the\s+)?video\s+\d{1,3}\s*(?:seconds?|secs?)\s*long/i.test(raw)) {
    return { automatic: false, reason: "Media and timeline changes require asset-grounded revision planning." };
  }
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const fields = {};
  const directives = [];
  for (const line of lines) {
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
    return { automatic: false, reason: "This instruction needs Producer interpretation or media selection before it can execute safely." };
  }
  if (!directives.length || Object.values(fields).some(value => !value))
    return { automatic: false, reason: "Provide explicit replacement text after a colon." };
  return { automatic: true, fields, changes: [...new Set(directives)] };
}
