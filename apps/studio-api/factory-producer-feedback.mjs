/**
 * Conservative conversational Factory bridge. No LLM guesses and no silent
 * media substitution: only explicit exact-text changes can auto-execute.
 */
export function interpretFactoryProducerFeedback(note) {
  const raw = String(note || "").trim();
  if (!raw || raw.length > 3000) return { automatic: false, reason: "Review instructions are required (maximum 3000 characters)." };
  const media = /\b(add|insert|replace|remove|swap|find|use|include|reorder|change)\b[^\n.]{0,110}\b(photo|image|picture|still|clip|shot|scene|slide|transition|video|music|track|timing|duration|pace|opening|closing)\b/i;
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const fields = {};
  const directives = [];
  const media_asset_ids = [];
  let allow_video = false;
  for (const line of lines) {
    // Explicit, classified Airtable library references are executable without
    // hallucinating filenames or searching another city's collection.
    const addPhoto = line.match(/^(?:add|include|insert)\s+(?:library\s+)?(?:photo|still|image)s?\s*:\s*(rec[A-Za-z0-9]{14}(?:\s*[,;]\s*rec[A-Za-z0-9]{14})*)$/i);
    const addClip = line.match(/^(?:add|include|insert)\s+(?:library\s+)?(?:video\s+)?clips?\s*:\s*(rec[A-Za-z0-9]{14}(?:\s*[,;]\s*rec[A-Za-z0-9]{14})*)$/i);
    if (addPhoto || addClip) {
      for (const id of (addPhoto || addClip)[1].split(/\s*[,;]\s*/)) media_asset_ids.push(id);
      if (addClip) allow_video = true;
      directives.push(addClip ? "add_clip" : "add_photos");
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
    return { automatic: false, reason: media.test(line)
      ? "Unresolved media or timeline direction requires a grounded Producer Plan."
      : "This instruction needs Producer interpretation before it can execute safely." };
  }
  if (!directives.length || Object.values(fields).some(value => !value))
    return { automatic: false, reason: "Provide explicit replacement text after a colon." };
  return { automatic: true, fields, changes: [...new Set(directives)], media_asset_ids: [...new Set(media_asset_ids)], allow_video };
}
