/** Fail-closed 365-day idea/title deduplication shared by Studio writers.
 * Numbered copies and minor punctuation/stop-word variations aren't new ideas.
 * Airtable is authoritative. This is a guard, not an atomic unique index.
 */
export const IDEA_TITLE_UNIQUENESS_DAYS = 365;

/** Vibe Cut is a source-video ingest, not a new editorial idea.
 * Repeated subjects, re-edits and even retries of the same MOV must be
 * allowed through the upload preflight. Dedup remains enforced for ordinary
 * manual/autonomous idea proposals; this exception is explicit-input-only.
 */
export function studioRequiresUniqueIdeaTitleForCreate(inputKind) {
  return String(inputKind || "").trim() !== "vibe-cut";
}
const TITLE_STOP = new Set(["a","an","and","the","at","in","on","of","for","to","with","from"]);
function titleWithoutAutoNumber(title) {
  let text = String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-").trim();
  // Keep meaningful names such as Route 66 and 2026. Drop generated 2, (3), #4, - 5, Part 2.
  text = text.replace(/\s*(?:\(\s*\d{1,3}\s*\)|[\-#]\s*\d{1,3}|(?:part|take|version)\s+\d{1,3})\s*$/i, "").trim();
  const naked = text.match(/^(.*\S)\s+(\d{1,3})$/);
  if (naked && Number(naked[2]) >= 2 && Number(naked[2]) <= 30 &&
      (naked[1].split(/\s+/).length >= 2 || !/^(?:route|highway|area|studio)$/i.test(naked[1]))) {
    text = naked[1];
  }
  return text;
}
export function studioIdeaTitleKey(title) {
  return titleWithoutAutoNumber(title).toLowerCase().replace(/[^a-z0-9]/g, "");
}
function significantTitleTokens(title) {
  return [...new Set(titleWithoutAutoNumber(title).toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter(word => word.length > 1 && !TITLE_STOP.has(word)))].sort();
}
function editDistanceAtMostTwo(a,b) {
  if (Math.abs(a.length-b.length)>2) return false;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const curr=[i];
    for(let j=1;j<=b.length;j++) curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=curr;
    if(Math.min(...curr)>2) return false;
  }
  return prev[b.length]<=2;
}
export function studioIdeaTitlesEquivalent(left,right) {
  const a=studioIdeaTitleKey(left),b=studioIdeaTitleKey(right);
  if(!a||!b) return false;
  if(a===b) return true;
  const aWords=significantTitleTokens(left),bWords=significantTitleTokens(right);
  if(aWords.length>=2&&aWords.join("|")===bWords.join("|")) return true;
  if(Math.min(a.length,b.length)>=16 && editDistanceAtMostTwo(a,b)) return true;
  const common=aWords.filter(word=>bWords.includes(word)).length;
  return common>=4 && common/Math.max(aWords.length,bWords.length)>=0.85;
}
/** Build a bounded-prefix query; fully paginate its entire match set, then
 * compare candidates locally. Prefixing avoids scanning unrelated yearly rows
 * on every manual/autonomous creation. A truncated query MUST fail closed.
 */
export function studioIdeaTitleYearFormula(title,titleField) {
  if(!["Candidate_Title","Content_Title"].includes(titleField)) throw new Error("Invalid title field");
  const key=studioIdeaTitleKey(title);
  if(!key) throw new Error("A nonempty idea title is required");
  const prefix=key.slice(0,Math.min(8,key.length));
  const candidateOnly = titleField === "Candidate_Title" ? "{Test_Run_ID}=BLANK()," : "";
  return `AND(${candidateOnly}IS_AFTER(CREATED_TIME(),DATEADD(TODAY(),-${IDEA_TITLE_UNIQUENESS_DAYS},"days")),REGEX_MATCH(REGEX_REPLACE(LOWER({${titleField}}&""),"[^a-z0-9]",""),"^${prefix}"))`;
}
export async function studioFindRecentDuplicateTitle(title,query,{excludeIdeaId="",excludeContentId=""}={}) {
  for(const [kind,field,excluded] of [["idea","Candidate_Title",excludeIdeaId],["content","Content_Title",excludeContentId]]) {
    const rows=await query(kind,studioIdeaTitleYearFormula(title,field),field);
    if(!Array.isArray(rows)) throw new Error("Incomplete title history");
    if(rows.length>=1001) throw new Error("Title history query reached safety cap; refusing ambiguous create");
    const duplicate=rows.find(row=>row?.id && row.id!==excluded &&
      studioIdeaTitlesEquivalent(title,String(row?.fields?.[field]||row?.[field]||"")));
    if(duplicate) return {source:kind,record_id:duplicate.id};
  }
  return null;
}
