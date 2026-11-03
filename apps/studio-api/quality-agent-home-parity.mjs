/**
 * Stage 3: independent, bounded Airtable candidate scans for Home-equivalent QA
 * counts. Preserve broader Quality Agent diagnostic findings separately.
 * Candidate formulas MUST be supersets of the shared JS Home predicates;
 * filtering a narrow diagnostics formula cannot prove exact-ID parity.
 */
import { homeApprovedExceptionKind, homeIsUnpublishedFailure } from "./profile-summary-classification.mjs";

// Every raw failure/status source read by normalizedOutputState(). A candidate
// scan can over-include diagnostics: the final classifier decides membership.
const STATUS_FIELDS = Object.freeze([
  "Output_Status", "Render_Status", "Publish_Status", "Asset_Selection_Status",
  "IG_Carousel_Status", "TikTok_Draft_Status", "FB_Publish_Status",
  "FB_Slideshow_Status", "YouTube_Package_Status", "YouTube_Upload_Status",
  "YouTube_Processing_Status",
]);
const ERROR_FIELDS = Object.freeze([
  "Publish_Error_Message", "Remotion_Error_Message", "Final_File_Error_Message",
  "IG_Carousel_Error_Message", "Music_Error_Message", "FB_Slideshow_Error_Message",
  "YouTube_Error_Message", "YouTube_Processing_Failure_Reason", "YouTube_Rejection_Reason",
]);
const failureSignals = [
  ...STATUS_FIELDS.flatMap((field) => [
    'FIND("failed",LOWER({' + field + '}&""))>0',
    'FIND("error",LOWER({' + field + '}&""))>0',
  ]),
  ...ERROR_FIELDS.map((field) => '{' + field + '}!=""'),
];
export const QA_HOME_FAILED_CANDIDATE_FORMULA =
  'AND({Test_Run_ID}=BLANK(),OR(' + failureSignals.join(",") + '))';

// No diagnostic grace period or raw-status exclusions. Home evaluates due <=
// now with derived Studio_State; a 15-minute QA alert grace remains available
// on the separate QA-PUBLISH-001 cron path.
export function qaHomePastDueCandidateFormula(nowMs = Date.now()) {
  if (!Number.isFinite(nowMs)) throw new Error("A valid audit clock is required");
  return 'AND({Test_Run_ID}=BLANK(),{Review_Status}="Approved",{Do_Not_Publish}=0,'
    + '{Scheduled_Post_Date}!="",IS_BEFORE({Scheduled_Post_Date},"'
    + new Date(nowMs + 1).toISOString() + '"))';
}

function validatedMappedRows(rows, mapOutput, label) {
  if (!Array.isArray(rows) || typeof mapOutput !== "function")
    throw new Error(label + "_complete_candidate_scan_required");
  const seen = new Set();
  return rows.map((row) => {
    if (!/^rec[A-Za-z0-9]{14}$/.test(String(row?.id || "")) || seen.has(row.id)
        || row?.fields?.Test_Run_ID) throw new Error(label + "_invalid_or_repeated_record");
    seen.add(row.id);
    const mapped = mapOutput(row);
    if (!mapped || mapped.id !== row.id) throw new Error(label + "_mapping_incomplete");
    return { row, mapped };
  });
}

export function classifyQualityAgentHomeBuckets(failedCandidates, overdueCandidates, mapOutput,
    nowMs = Date.now()) {
  if (!Number.isFinite(nowMs)) throw new Error("A valid audit clock is required");
  const failed = validatedMappedRows(failedCandidates, mapOutput, "failed")
    .filter(({ mapped }) => homeIsUnpublishedFailure(mapped)).map(({ row }) => row);
  const approvedPastDue = validatedMappedRows(overdueCandidates, mapOutput, "past_due")
    .filter(({ mapped }) => homeApprovedExceptionKind(mapped, nowMs) === "approved_past_due")
    .map(({ row }) => row);
  return { failed, approved_past_due: approvedPastDue };
}
