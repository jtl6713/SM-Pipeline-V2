import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
import { homeOutputContribution, homeOverdueDueAt } from "./profile-summary-classification.mjs";
const worker = fs.readFileSync(path.join(root, "apps/studio-api/worker-functions-04.mjs"), "utf8");
const classifier = fs.readFileSync(path.join(root, "apps/studio-api/profile-summary-classification.mjs"), "utf8");
const ui = fs.readFileSync(path.join(root, "apps/studio-web/assets/all-profiles-overview-1007.js"), "utf8");

test("profile overview includes overdue approved outputs separately from platform dispatch", () => {
  assert.match(worker, /overdue_unpublished: outputCounts.overdue_unpublished/);
  assert.match(worker, /overdue_unpublished: metrics.overdue_unpublished/);
  assert.ok(worker.includes("scheduled: studioOverviewScheduledCounts(mappedOutputs)"));
  const late = {
    id: "rec12345678901234", platform: "Instagram",
    studio_state: "Platform Processing", output_status: "Approved for Publishing",
    review_status: "Approved", scheduled_post_date: "2020-01-01T00:00:00Z",
    studio_publish_dispatch_at: "2020-01-01T00:00:01Z",
  };
  const contribution = homeOutputContribution(late);
  assert.equal(contribution.scheduled.Instagram, 0);
  assert.equal(contribution.overdue_unpublished, 1);
  assert.ok(homeOverdueDueAt(late) > 0);
  assert.equal(homeOutputContribution({ ...late, published_at: "2020-01-01T00:01:00Z" }).overdue_unpublished, 0);
});

test("awaiting approval is review-ready but not approved or rendering", () => {
  assert.match(classifier, /state === "Ready for Review" \|\| state === "Awaiting Approval"/);
  assert.match(classifier, /output === "ready for review"/);
  assert.ok(classifier.includes('["approved", "rejected", "skipped"].includes(review)'));
  assert.ok(classifier.includes("ready for render|waiting in render queue"));
  const ready = { id: "rec12345678901234", studio_state: "Ready for Review",
    output_status: "Ready for Review", render_status: "Rendered", review_status: "" };
  assert.equal(homeOutputContribution(ready).awaiting_approval, 1);
  assert.equal(homeOutputContribution({ ...ready, render_status: "Queued" }).awaiting_approval, 0);
  assert.equal(homeOutputContribution({ ...ready, review_status: "Approved" }).awaiting_approval, 0);
});

test("Home uses explicit approved future and past due columns, not parentheses", () => {
  assert.match(ui, /Approved · Future/);
  assert.match(ui, /Approved · Past Due/);
  assert.doesNotMatch(ui, /approvedUnpublishedTotal/);
});

test("Home parentheses count rises for final approval even when schedule is overdue", () => {
  const base = {
    id:"rec12345678901234", platform:"TikTok",
    studio_state:"Ready for Review", output_status:"Ready for Review",
    render_status:"Rendered", review_status:"",
    scheduled_post_date:"2099-01-01T00:00:00Z",
  };
  const before=homeOutputContribution(base);
  const after=homeOutputContribution({
    ...base,studio_state:"Scheduled",output_status:"Approved for Publishing",
    review_status:"Approved",publish_status:"Ready to Publish",
  });
  assert.equal(before.awaiting_approval,1);
  assert.equal(before.approved_unpublished,0);
  assert.equal(after.awaiting_approval,0);
  assert.equal(after.approved_unpublished,1);
  assert.equal(after.overdue_unpublished,0);
  const overdue = homeOutputContribution({ ...after, ...base, review_status:"Approved",
    studio_state:"Scheduled", output_status:"Approved for Publishing",
    scheduled_post_date:"2020-01-01T00:00:00Z" });
  assert.equal(overdue.approved_unpublished,1);
  assert.equal(overdue.overdue_unpublished,1);
});

test("Home rejects old R2/browser snapshots missing per-output calendar breakdown", () => {
  const valid=worker.slice(worker.indexOf("function studioProfilesOverviewRowsHealthy("),
    worker.indexOf("function profilesOverviewSnapshotView("));
  const verify=worker.slice(worker.indexOf("export function validateStudioProfilesOverviewRows("),
    worker.indexOf("function profilesOverviewRefreshFailureComponents("));
  assert.match(valid, /"approved_unpublished", "overdue_unpublished"/);
  assert.match(verify, /"approved_unpublished", "overdue_unpublished"/);
  assert.match(valid, /typeof n !== "number"/);
  assert.ok(ui.includes('studio.allProfilesOverview.v6'));
  assert.match(valid, /approved_calendar_slots/);
  assert.match(verify, /approved_calendar_slots/);
  const browserValidation=ui.slice(ui.indexOf("function validOverviewRows("),ui.indexOf("function readCache("));
  assert.match(browserValidation, /"approved_unpublished", "overdue_unpublished"/);
  assert.match(browserValidation, /approved_calendar_slots/);
  assert.ok(browserValidation.includes('typeof row?.[kind] !== "number"'));
  const map=ui.slice(ui.indexOf("function mapRows("),ui.indexOf("function adoptOverview("));
  assert.ok(map.includes('overdue_unpublished: Number(row.overdue_unpublished) || 0'));
});

test("Home parentheses depend on final-approved-unpublished state, not scheduled-time passage", () => {
  const durable=fs.readFileSync(path.join(root, "apps/studio-api/profile-summary-do.mjs"), "utf8");
  assert.match(classifier, /export function homeApprovedUnpublished/);
  assert.doesNotMatch(classifier.slice(classifier.indexOf("export function homeApprovedUnpublished("),
    classifier.indexOf("export function homeApprovedExceptionKind(")), /scheduled >= now|Date\.parse/);
  assert.match(worker, /approved_unpublished: metrics\.approved_unpublished/);
  assert.doesNotMatch(worker, /approved_unpublished: approvedFutureTimes\.filter/);
  assert.match(durable, /buildProfileSummaryV6Row\(p, counters, approvedByProfile\.get\(p\.id\), now\)/);
  const v6=fs.readFileSync(path.join(root, "apps/studio-api/profile-summary-v6.mjs"), "utf8");
  assert.match(v6, /approved_unpublished: Number\(c\.approved_unpublished \|\| 0\)/);
  assert.doesNotMatch(durable, /approved_unpublished: futureByProfile/);
  assert.match(durable, /approved_unpublished_definition/);
  assert.match(durable, /future_count_reconcile_required/);
});


test("Home V6 force refresh verifies the schema it actually writes and rejects V5 cache", () => {
  const writer = worker.slice(worker.indexOf("export async function writeStudioProfilesOverviewSnapshot("),
    worker.indexOf("/*__STUDIO_WORKER_END:writeStudioProfilesOverviewSnapshot__*/"));
  const verifier = worker.slice(worker.indexOf("export async function verifyStudioProfilesOverviewSnapshot("),
    worker.indexOf("/*__STUDIO_WORKER_END:verifyStudioProfilesOverviewSnapshot__*/"));
  const remember = worker.slice(worker.indexOf("export function rememberProfilesOverviewSnapshot("),
    worker.indexOf("/*__STUDIO_WORKER_END:rememberProfilesOverviewSnapshot__*/"));
  const reader = worker.slice(worker.indexOf("export async function readStudioProfilesOverviewSnapshot(env,"),
    worker.indexOf("/*__STUDIO_WORKER_END:readStudioProfilesOverviewSnapshot__*/"));
  assert.match(writer, /schemaVersion: 6/);
  assert.match(verifier, /snapshot\.schemaVersion !== 6/);
  assert.doesNotMatch(verifier, /schemaVersion !== 5/);
  assert.match(remember, /snapshot\?\.schemaVersion \|\| 0\) !== 6/);
  assert.match(reader, /cache\.schemaVersion !== 6/);
});



test("overdue rescue advances past capped and cooling outputs instead of retrying oldest twelve forever", () => {
  const main = fs.readFileSync(path.join(root, "apps/studio-api/worker.js"), "utf8");
  const rescue = main.slice(main.indexOf("const STUDIO_OVERDUE_SCHEDULED_FORMULA ="),
    main.indexOf("/*__STUDIO_WORKER_EXTRACT:studioPublishLockIsStale__*/"));
  const ordinary = main.slice(main.indexOf("const STUDIO_PUBLISH_RECONCILE_FORMULA ="),
    main.indexOf("/*__STUDIO_WORKER_EXTRACT:studioResetYoutubeUploadForRetry__*/"));
  assert.ok(rescue.length > 0 && ordinary.length > 0);
  for (const formula of [rescue, ordinary]) {
    assert.ok(formula.includes('{Studio_Publish_Dispatch_Count}<8'));
    assert.ok(formula.includes('DATETIME_DIFF(NOW(),{Studio_Publish_Dispatch_At},"minutes")>=6'));
  }
  assert.ok(rescue.includes('{Do_Not_Publish}=0'));
  assert.ok(rescue.includes('{Published_At}=BLANK()'));
  assert.ok(rescue.includes('{Publish_Status}="Ready to Schedule"'));
  assert.doesNotMatch(rescue, /Published_At:\s*new Date|Do_Not_Publish:\s*false/);
});


test("TTD2 existing draft polling is independently scheduled, fair and bounded", () => {
  const cron = fs.readFileSync(path.join(root, "apps/studio-api/worker.js"), "utf8");
  const impl = fs.readFileSync(path.join(root, "apps/studio-api/worker-functions-04.mjs"), "utf8");
  const functionStart = impl.indexOf("export async function studioReconcileTiktokProcessing(");
  const functionEnd = impl.indexOf("/*__STUDIO_WORKER_END:studioReconcileTiktokProcessing__*/", functionStart);
  assert.ok(functionStart > 0 && functionEnd > functionStart);
  const stage = impl.slice(functionStart, functionEnd);
  assert.match(stage, /sortField: "TikTok_Draft_Last_Checked_At", sortDirection: "asc"/);
  assert.match(stage, /limit = Math.max\(1, Math.min\(4,/);
  assert.match(stage, /TikTok_Draft_Publish_ID/);
  assert.match(stage, /Publish_Next_Retry_At/);
  assert.match(stage, /TikTok_Draft_Last_Checked_At/);
  assert.match(stage, /studioPulseTtd2\(env, row\)/);
  assert.match(stage, /studioListTiktokReconcileOutputs\(env, "ttd2_processing"/);
  assert.match(stage, /studioReadTiktokReconcileOutput\(env, candidate\.id\)/);
  assert.doesNotMatch(stage, /studioPulseTtd0|studioPulseTtd1|studioDispatchApprovedPublishNow|studioPublishFacebookPageStory/);
  assert.match(stage, /Do_Not_Publish/);
  assert.match(stage, /previousId && previousId !== currentId/);
  const scheduled = cron.slice(cron.indexOf("async scheduled(event, env, ctx)"), cron.indexOf("class HttpError"));
  const independent = scheduled.indexOf("ctx.waitUntil(studioReconcileTiktokProcessing");
  const mainWaitUntil = scheduled.indexOf("ctx.waitUntil((async () => {", scheduled.indexOf("// Existing TikTok draft status GETs"));
  const heavy = scheduled.indexOf("if (!cadence.heavy) return;");
  assert.ok(independent > 0 && independent < mainWaitUntil && independent < heavy);
  assert.doesNotMatch(
    scheduled.slice(Math.max(0, independent - 80), independent + 40),
    /if \(airtableDataWaitMs\(\) <= AIRTABLE_SLOT_FAIL_FAST_MS\) \{\s*ctx\.waitUntil\(studioReconcileTiktokProcessing/,
  );
  assert.doesNotMatch(scheduled.slice(independent - 120, independent), /!cadence\.heavy && airtableCooldownWaitMs/);
  assert.match(cron, /STUDIO_WORKER_EXTRACT:studioReconcileTiktokProcessing/);
});

test("TTD draft reconcile runs on independent light cron and overdue lists Supabase", () => {
  const cron = fs.readFileSync(path.join(root, "apps/studio-api/worker.js"), "utf8");
  const impl = fs.readFileSync(path.join(root, "apps/studio-api/worker-functions-04.mjs"), "utf8");
  const scheduled = cron.slice(cron.indexOf("async scheduled(event, env, ctx)"), cron.indexOf("class HttpError"));
  const draftLight = scheduled.indexOf("ctx.waitUntil(studioReconcileTiktokDrafts");
  const mainWaitUntil = scheduled.indexOf("ctx.waitUntil((async () => {", scheduled.indexOf("// Existing TikTok draft status GETs"));
  const heavy = scheduled.indexOf("if (!cadence.heavy) return;");
  assert.ok(draftLight > 0 && draftLight < mainWaitUntil && draftLight < heavy);
  assert.doesNotMatch(
    scheduled.slice(Math.max(0, draftLight - 80), draftLight + 40),
    /if \(airtableDataWaitMs\(\) <= AIRTABLE_SLOT_FAIL_FAST_MS\) \{\s*ctx\.waitUntil\(studioReconcileTiktokDrafts/,
  );
  assert.doesNotMatch(scheduled.slice(draftLight - 120, draftLight), /!cadence\.heavy && airtableCooldownWaitMs/);
  assert.match(cron, /0\.10\.886-closeout-cadence-r2/);
  const overdueStart = impl.indexOf("export async function studioReconcileOverdueScheduledPublishes(");
  const overdueEnd = impl.indexOf("/*__STUDIO_WORKER_END:studioReconcileOverdueScheduledPublishes__*/", overdueStart);
  assert.ok(overdueStart > 0 && overdueEnd > overdueStart);
  const overdue = impl.slice(overdueStart, overdueEnd);
  assert.match(overdue, /kind: "overdue_scheduled"/);
  assert.match(overdue, /studioOverdueDispatchBudgetOpen/);
  assert.match(overdue, /studioWriteSource\(env\) === "supabase"/);
});


test("YTS1 stale jobs receive independent bounded status polling without duplicate upload", () => {
  const cron = fs.readFileSync(path.join(root, "apps/studio-api/worker.js"), "utf8");
  const impl = fs.readFileSync(path.join(root, "apps/studio-api/worker-functions-04.mjs"), "utf8");
  const start = impl.indexOf("export async function studioReconcileYoutubeUploadProcessing(");
  const end = impl.indexOf("/*__STUDIO_WORKER_END:studioReconcileYoutubeUploadProcessing__*/", start);
  assert.ok(start > 0 && end > start);
  const stage = impl.slice(start, end);
  assert.match(stage, /sortField: "YouTube_Last_Checked_At", sortDirection: "asc"/);
  assert.match(stage, /Math.min\(3, Number\(options.limit/);
  assert.ok(stage.includes('{YouTube_Upload_Job_ID}!=""'));
  assert.ok(stage.includes('{YouTube_Video_ID}=""'));
  assert.ok(stage.includes('{Do_Not_Publish}=0'));
  assert.ok(stage.includes('{Published_At}=BLANK()'));
  assert.ok(stage.includes("Publish_Next_Retry_At"));
  assert.ok(stage.includes("YouTube_Last_Checked_At"));
  assert.match(stage, /expected !== job/);
  assert.match(stage, /studioPulseYtRecord\(env, "yts1", "YTS1", row\)/);
  assert.doesNotMatch(stage, /ytp1|studioDispatchApprovedPublishNow|studioEnsureYoutubePublish/);
  assert.match(cron, /STUDIO_WORKER_EXTRACT:studioReconcileYoutubeUploadProcessing/);
  const scheduled = cron.slice(cron.indexOf("async scheduled(event, env, ctx)"), cron.indexOf("class HttpError"));
  const independent = scheduled.indexOf("ctx.waitUntil(studioReconcileYoutubeUploadProcessing");
  const heavy = scheduled.indexOf("if (!cadence.heavy) return;");
  assert.ok(independent > 0 && independent < heavy);
  assert.match(scheduled.slice(independent - 180, independent), /!cadence.heavy/);
});


test("Instagram saved Story continuation is fair, bounded, and never re-creates a container", () => {
  const main = fs.readFileSync(path.join(root, "apps/studio-api/worker.js"), "utf8");
  const workerImpl = fs.readFileSync(path.join(root, "apps/studio-api/worker-functions-04.mjs"), "utf8");
  const start = workerImpl.indexOf("export async function studioReconcilePublishingInstagramStories(");
  const end = workerImpl.indexOf("/*__STUDIO_WORKER_END:studioReconcilePublishingInstagramStories__*/", start);
  assert.ok(start > 0 && end > start);
  const stage = workerImpl.slice(start, end);
  assert.ok(stage.includes('sortField: "IG_Story_Last_Attempt_At"'));
  assert.ok(stage.includes('limit = Math.max(1, Math.min(2,'));
  assert.ok(stage.includes('container !== expected'));
  assert.ok(stage.includes('container created and queued|container still processing'));
  assert.ok(stage.includes('IG_Story_Post_ID'));
  assert.ok(stage.includes('Platform_Post_ID'));
  assert.ok(stage.includes('Do_Not_Publish'));
  assert.ok(stage.includes('Review_Status'));
  assert.ok(stage.includes('IG_Story_Last_Attempt_At'));
  assert.ok(stage.includes('studioPulseAp1IgsPoll(env, row)'));
  assert.doesNotMatch(stage, /studioPulseAp1Igs\(|studioDispatchApprovedPublishNow\(/);
  const scheduled = main.slice(main.indexOf("async scheduled(event, env, ctx)"), main.indexOf("class HttpError"));
  const light = scheduled.indexOf('ctx.waitUntil(studioReconcilePublishingInstagramStories(env, { limit: 1 })');
  const heavy = scheduled.indexOf('if (!cadence.heavy) return;');
  assert.ok(light > 0 && light < heavy);
  assert.equal((scheduled.match(/studioReconcilePublishingInstagramStories\(env/g) || []).length, 1);
  assert.ok(scheduled.slice(light - 130, light).includes("!cadence.heavy"));
});
