// Owner/tenant-scoped generation guidance. Never use an unscoped global setting.
export const OWNER_GENERATION_MAX_CHARS = 4000;

export function ownerGenerationSettingName(organizationRecordId) {
  const id = String(organizationRecordId || "").trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) throw new Error("An authorized Studio organization is required");
  return `Studio_Owner_Generation_${id}`;
}

export function parseOwnerGenerationGuidance(raw) {
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { value = {}; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
  return {
    prompt: typeof value.prompt === "string" ? value.prompt.slice(0, OWNER_GENERATION_MAX_CHARS) : "",
    revision: String(value.revision || "0"),
    updated_at: typeof value.updated_at === "string" ? value.updated_at : null,
    updated_by: typeof value.updated_by === "string" ? value.updated_by : null,
  };
}

export function validateOwnerGenerationPrompt(value) {
  if (typeof value !== "string" || value.length > OWNER_GENERATION_MAX_CHARS) {
    throw new Error(`Global generation prompt must be text of at most ${OWNER_GENERATION_MAX_CHARS} characters`);
  }
  return value.trim();
}

// Order is intentional: higher-priority platform safety rules are outside user text.
// The more specific prompt layers refine the previous layers, never override safety.
export function effectiveGenerationLayers({ ownerGlobal = "", profileWide = "", generationType = "", itemSpecific = "" } = {}) {
  return [
    { source: "owner-global", label: "All owned profiles", text: ownerGlobal },
    { source: "profile-every-generation", label: "Selected profile / every generation", text: profileWide },
    { source: "generation-type", label: "Generation type", text: generationType },
    { source: "item-specific", label: "Current item", text: itemSpecific },
  ].filter((layer) => typeof layer.text === "string" && layer.text.trim())
    .map((layer) => ({ ...layer, text: layer.text.trim() }));
}

export function effectiveGenerationPrompt(options = {}) {
  return effectiveGenerationLayers(options)
    .map((layer) => `[${layer.label}]\n${layer.text}`)
    .join("\n\n");
}
