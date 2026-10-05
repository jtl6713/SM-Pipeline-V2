/** Quoted library search: "Staten Island Ferry" matches that name only. */

export function libraryQuotedPhrase(query) {
  const text = String(query || "").trim();
  const wrapped = text.match(/^(?:"|“|”)([\s\S]+)(?:"|“|”)$/) || text.match(/^'([\s\S]+)'$/);
  if (!wrapped) return "";
  return String(wrapped[1] || "").replace(/\s+/g, " ").trim();
}

export function libraryNameHasPhrase(name, phrase) {
  const needle = String(phrase || "").trim().toLowerCase();
  if (!needle) return false;
  return String(name || "").toLowerCase().includes(needle);
}

export function libraryNameSort(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function libraryAssetNameFindFormula(phrase) {
  const needle = String(phrase || "").trim().toLowerCase()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  return `FIND("${needle}", LOWER({Asset Name}))`;
}
