// Issue #1716: side-effect-free manual classification domain rules.
// API handlers must authenticate, authorize profile membership, and persist to Airtable first.
export const CLASSIFICATION_FIELDS = Object.freeze([
  "city", "neighborhood", "location", "landmarks", "subjects",
  "objects", "scene_type", "time_of_day", "weather", "keywords",
]);
export const MULTI_VALUE_FIELDS = new Set(["landmarks", "subjects", "objects", "keywords"]);
const MAX_VALUE = 120;
const MAX_ITEMS = 40;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function clean(value) {
  if (typeof value !== "string") throw new TypeError("Classification values must be strings");
  const v = value.trim().replace(/\\s+/g, " ");
  if (v.length > MAX_VALUE || /[\\u0000-\\u001f]/.test(v)) throw new RangeError("Invalid classification value");
  return v;
}
function list(value) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new TypeError("Expected classification array");
  const seen = new Set();
  return value.map(clean).filter(v => {
    const k = v.toLocaleLowerCase();
    if (!v || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
export function validateClassificationPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("Invalid classification patch");
  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!CLASSIFICATION_FIELDS.includes(key)) throw new TypeError(`Unknown classification field: ${key}`);
    result[key] = MULTI_VALUE_FIELDS.has(key) ? list(value) : clean(value);
  }
  if (!Object.keys(result).length) throw new TypeError("Empty classification patch");
  return result;
}
export function effectiveClassification(ai = {}, manual = {}) {
  const result = {};
  for (const key of CLASSIFICATION_FIELDS) {
    if (has(manual, key)) result[key] = manual[key];
    else if (has(ai, key)) result[key] = ai[key];
  }
  return result;
}
// mode=add preserves existing manual tags; mode=override replaces selected fields.
// AI values remain untouched in either mode.
export function applyManualClassification({ ai = {}, manual = {}, patch, mode = "add", actor, at }) {
  if (!["add", "override"].includes(mode)) throw new TypeError("Invalid classification mode");
  if (typeof actor !== "string" || !actor.trim()) throw new TypeError("Actor required");
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) throw new TypeError("UTC timestamp required");
  const changes = validateClassificationPatch(patch);
  const next = { ...manual };
  const before = effectiveClassification(ai, manual);
  for (const [key, value] of Object.entries(changes)) {
    if (mode === "add" && MULTI_VALUE_FIELDS.has(key)) {
      next[key] = list([...(Array.isArray(manual[key]) ? manual[key] : Array.isArray(ai[key]) ? ai[key] : []), ...value]);
    } else next[key] = value;
  }
  return {
    manual: next,
    effective: effectiveClassification(ai, next),
    audit: {
      actor: actor.trim(), at: new Date(at).toISOString(), source: "manual",
      mode, fields: Object.keys(changes), before, after: effectiveClassification(ai, next),
    },
  };
}

// Airtable's existing AI fields remain authoritative for AI classification;
// explicit human overrides are stored separately and never written to A3 fields.
function field(record, name) {
  return record?.fields?.[name] ?? record?.[name] ?? "";
}
function splitTags(raw) {
  return String(raw || "").split(/[,;\n]+/).map(value => value.trim()).filter(Boolean).slice(0, 40);
}
export function airtableAiClassification(record, profileName = "") {
  return {
    city: String(profileName || "").trim(),
    location: String(field(record, "Location") || "").trim(),
    scene_type: String(field(record, "Shot_Type") || "").trim(),
    time_of_day: String(field(record, "Time_Of_Day") || "").trim(),
    weather: String(field(record, "Weather") || "").trim(),
    subjects: splitTags(field(record, "Visible_Subjects")),
    objects: splitTags(field(record, "AI_Tags")),
    keywords: splitTags(field(record, "Search_Keywords")),
  };
}
export function parseManualClassification(raw) {
  if (!raw) return {};
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("Stored manual classification is not an object");
  const result = {};
  for (const key of CLASSIFICATION_FIELDS) {
    if (has(parsed, key)) {
      result[key] = MULTI_VALUE_FIELDS.has(key) ? list(parsed[key]) : clean(parsed[key]);
    }
  }
  return result;
}
export function parseClassificationAudit(raw) {
  if (!raw) return [];
  const events = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(events)) throw new TypeError("Stored classification history is not an array");
  return events;
}
export function appendClassificationAudit(previous, event) {
  // Bounded long-text journal; recent entries are displayed on the asset editor.
  // Protect against Airtable long-text limits.
  const events = [...previous, event].slice(-60);
  while (JSON.stringify(events).length > 48000 && events.length > 1) events.shift();
  return events;
}
