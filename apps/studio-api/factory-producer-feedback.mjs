/**
 * Conservative conversational Factory bridge. No LLM guesses and no silent
 * media substitution: only explicit exact-text changes can auto-execute.
 */
export function interpretFactoryProducerFeedback(note) {
  const raw = String(note || "").trim();
  if (!raw || raw.length > 3000) return { automatic: false, reason: "Review instructions are required (maximum 3000 characters)." };
  const media = /\b(add|insert|replace|remove|swap|find|use|include|reorder|change)\b[^\n.]{0,110}\b(photo|image|picture|still|clip|shot|scene|slide|transition|video|music|track|timing|duration|pace|opening|closing)\b/i;
  if (media.test(raw)) return { automatic: false, reason: "Media and timeline changes require asset-grounded revision planning." };
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
    return { automatic: false, reason: "This instruction needs Producer interpretation or media selection before it can execute safely." };
  }
  if (!directives.length || Object.values(fields).some(value => !value))
    return { automatic: false, reason: "Provide explicit replacement text after a colon." };
  return { automatic: true, fields, changes: [...new Set(directives)] };
}
