/**
 * Factory Producer edits of EXISTING, already-authorized master assets.
 * Never looks up or fabricates library assets, and never changes Drive identity.
 */
const cleanId = v => String(v || "").trim();
const fileStem = value => String(value || "")
  .trim().replace(/\.(?:jpe?g|png|webp|heic|heif|mov|mp4|m4v|webm)$/i, "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const cleanName = value => String(value || "").trim().replace(/^(?:"|'|“)|(?:"|'|”)$/g, "").trim();
function resolveNamedAsset(source, rawName) {
  const name = fileStem(cleanName(rawName));
  if (!name || name.length < 3) throw new Error("A meaningful existing asset name is required");
  const exact = source.filter(asset => fileStem(asset.name || asset.filename || asset.source_name) === name);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error("The named asset is ambiguous. Use its unique asset ID");
  // A distinctive multiword phrase may identify an uploaded filename. Never
  // use fuzzy guesses, one-word partial matches, or other profiles' libraries.
  if (name.split(" ").length < 2) throw new Error("Named asset was not uniquely resolved in this Production Request");
  const matches = source.filter(asset =>
    (` ${fileStem(asset.name || asset.filename || asset.source_name)} `).includes(` ${name} `)
  );
  if (matches.length !== 1) throw new Error("Named asset was not uniquely resolved in this Production Request");
  return matches[0];
}
export function parseGroundedMediaDirective(line) {
  const source = String(line || "").trim().replace(/\.$/, "");
  let m = /^(?:move|reorder)\s+(?:existing\s+)?asset\s+([a-zA-Z0-9_-]{8,64})\s+to\s+(?:scene\s+)?position\s+(\d{1,2})$/i.exec(source);
  if (m) return { operation: "reorder", asset_id: m[1], position: Number(m[2]) };
  m = /^trim\s+(?:existing\s+)?clip\s+([a-zA-Z0-9_-]{8,64})\s+from\s+(\d+(?:\.\d{1,2})?)\s+to\s+(\d+(?:\.\d{1,2})?)\s+seconds?$/i.exec(source);
  if (m) return { operation: "trim_clip", asset_id: m[1], in_seconds: Number(m[2]), out_seconds: Number(m[3]) };
  // Natural-language shortcuts must still resolve against the *attached*
  // authoritative masters; a description alone never authorizes new media.
  m = /^(?:move|put|place|reorder)\s+(?:the\s+)?(?:existing\s+)?(?:asset|photo|image|still|clip)\s+named\s+(.{3,140}?)\s+to\s+(?:scene\s+)?position\s+(\d{1,2})$/i.exec(source);
  if (m) return { operation: "reorder", asset_name: cleanName(m[1]), position: Number(m[2]) };
  m = /^(?:move|put|place)\s+(?:the\s+)?(.{3,120}?)\s+(?:photo|image|still|clip|scene)\s+(?:to\s+)?(?:the\s+)?(first|last)\s*(?:scene|position)?$/i.exec(source);
  if (m) return { operation: "reorder", asset_name: cleanName(m[1]), position: m[2].toLowerCase() };
  m = /^(?:move|put|place|reorder)\s+(?:the\s+)?(.{3,120}?)\s+(?:photo|image|still|clip|scene)\s+to\s+(?:scene\s+)?position\s+(\d{1,2})$/i.exec(source);
  if (m) return { operation: "reorder", asset_name: cleanName(m[1]), position: Number(m[2]) };
  m = /^trim\s+(?:the\s+)?(?:existing\s+)?clip\s+named\s+(.{3,140}?)\s+from\s+(\d+(?:\.\d{1,2})?)\s+to\s+(\d+(?:\.\d{1,2})?)\s+seconds?$/i.exec(source);
  if (m) return { operation: "trim_clip", asset_name: cleanName(m[1]), in_seconds: Number(m[2]), out_seconds: Number(m[3]) };
  m = /^trim\s+(?:the\s+)?(.{3,120}?)\s+clip\s+from\s+(\d+(?:\.\d{1,2})?)\s+to\s+(\d+(?:\.\d{1,2})?)\s+seconds?$/i.exec(source);
  if (m) return { operation: "trim_clip", asset_name: cleanName(m[1]), in_seconds: Number(m[2]), out_seconds: Number(m[3]) };
  return null;
}

export function applyGroundedMediaEdits(manifest, edits) {
  if (!Array.isArray(manifest) || !manifest.length) throw new Error("No authoritative source assets are attached to this request");
  if (!Array.isArray(edits) || !edits.length || edits.length > 12) throw new Error("Between one and twelve explicit media changes are required");
  const source = manifest.map(asset => ({ ...asset })).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const known = new Map();
  for (const asset of source) {
    const id = cleanId(asset.id);
    if (!id || known.has(id)) throw new Error("Master asset identifiers are ambiguous");
    if (!cleanId(asset.google_drive_file_id) || !cleanId(asset.media_asset_record_id)) {
      throw new Error("Asset " + id + " lacks authoritative Google Drive media");
    }
    known.set(id, asset);
  }
  const changedIds = new Set();
  for (const instruction of edits) {
    const asset = instruction?.asset_name
      ? resolveNamedAsset(source, instruction.asset_name)
      : known.get(cleanId(instruction?.asset_id));
    const id = cleanId(asset?.id);
    if (!asset) throw new Error("Requested asset " + cleanId(instruction?.asset_id) + " is not attached to this Production Request");
    if (changedIds.has(id)) throw new Error("Multiple edits to one asset require manual review");
    changedIds.add(id);
    if (instruction.operation === "reorder") {
      const position = instruction.position === "first" ? 1
        : instruction.position === "last" ? source.length : instruction.position;
      if (!Number.isInteger(position) || position < 1 || position > source.length) throw new Error("Scene position is out of range");
      const old = source.findIndex(item => cleanId(item.id) === id);
      source.splice(old, 1);
      source.splice(position - 1, 0, asset);
    } else if (instruction.operation === "trim_clip") {
      const isClip = String(asset.media_kind || "").toLowerCase() === "video" || String(asset.mime_type || "").toLowerCase().startsWith("video/");
      if (!isClip) throw new Error("Only video clips can be trimmed");
      const start = instruction.in_seconds;
      const end = instruction.out_seconds;
      const duration = Number(asset.duration_seconds);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("Clip duration must be verified");
      if (![start, end].every(Number.isFinite) || start < 0 || end <= start || end - start < 0.2 || end > duration) {
        throw new Error("Requested trim falls outside the verified clip duration");
      }
      asset.in_seconds = start;
      asset.out_seconds = end;
    } else throw new Error("Unsupported media edit");
  }
  return {
    assets: source.map((asset, index) => ({ ...asset, order: index + 1 })),
    changed_asset_ids: [...changedIds],
  };
}
