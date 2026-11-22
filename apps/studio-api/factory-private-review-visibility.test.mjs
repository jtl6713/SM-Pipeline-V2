import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { OPS_QUEUE_REVIEW_FORMULA } from "./ops-queue.mjs";
import { evaluateReviewPackage, factoryReviewVisibility, factoryApprovalHoldReleaseEligibility, formalFactoryApprovalReady, safeReviewPromotion } from "./review-package-readiness.mjs";
import { partitionFactoryLanes } from "./factory-desk.mjs";
import { matchesOpsQueueReviewFormula, listSupabaseFactoryDeskPack } from "./supabase-pipeline-reads.mjs";

const media = "https://media.chicagoshining.com/";
const publishedMedia = "https://drive.google.com/file/d/factory-private-test/view";
function privateReviewRecord(id) {
  return { id, fields: {
    Output_Status: "Ready for Review",
    Review_Status: "Review Sent",
    Render_Status: "Rendered",
    Publish_Status: "Not Ready",
    Do_Not_Publish: true,
    Studio_Render_Review_Hold_Active: false,
    Platform: "Instagram",
    Studio_Output_Type: "Reel",
    Output_Caption: "Ready for a private visual review",
    Final_File_URL: publishedMedia,
    Thumbnail_URL: media + "studio/previews/thumbnails/private-review/cover-9x16.png",
  }};
}

test("review-only Airtable selector includes eligible held Ready for Review without a completed review", () => {
  assert.match(OPS_QUEUE_REVIEW_FORMULA, /AND\(\{Do_Not_Publish\},\{Output_Status\}="Ready for Review",OR\(\{Review_Status\}=BLANK\(\)/);
  assert.doesNotMatch(OPS_QUEUE_REVIEW_FORMULA, /Studio_Render_Review_Hold_Active/);
  assert.match(OPS_QUEUE_REVIEW_FORMULA, /\{Test_Run_ID\}=BLANK\(\)/);
});

test("Chicago #9831 and #9832 remain in Needs Eyes for inspection while publication is blocked", () => {
  const ids = ["recFF3lX5lJlzSTiw", "reci9Wv5saieGBhsw"];
  const rows = ids.map((id, index) => {
    const record = privateReviewRecord(id);
    const readiness = evaluateReviewPackage(record);
    assert.equal(readiness.readiness, "READY", id);
    const visibility = factoryReviewVisibility(record, readiness, "Ready for Review", true);
    assert.equal(visibility.visible, true);
    assert.equal(visibility.held_preview_only, false);
    return {
      id, kind: "output", output_id: 9831 + index,
      profile_id: "recT2rbKX3MF7cVFU",
      output_status: "Ready for Review", review_status: "Review Sent",
      render_status: "Rendered", publish_status: "Not Ready",
      studio_state: "Ready for Review", review_package_ready: visibility.visible,
      do_not_publish: true, review_hold_active: false,
      final_file_url: record.fields.Final_File_URL,
      thumbnail_url: record.fields.Thumbnail_URL,
    };
  });
  const desk = partitionFactoryLanes(rows);
  assert.equal(desk.summary.needs_eyes, 2);
  assert.deepEqual(desk.lanes.needs_eyes.map(row => row.output_id), [9831, 9832]);
  assert.ok(desk.lanes.needs_eyes.every(row => row.do_not_publish && row.can_preview));
  // An eligible review is NOT a publishing authorization. Do_Not_Publish
  // continues to deny even an otherwise complete in-production promotion.
  const promote = privateReviewRecord("recFF3lX5lJlzSTiw");
  promote.fields.Output_Status = "In Production";
  assert.equal(safeReviewPromotion(promote, evaluateReviewPackage(promote)), false);
  const ui = readFileSync(new URL("../studio-web/assets/factory-desk.js", import.meta.url), "utf8");
  assert.ok(ui.includes("card?.safety_hold_active === true"));
});

test("private but unfinished or changes-requested rows do not inflate actionable review counts", () => {
  const pending = privateReviewRecord("recPrivateQueue0001");
  pending.fields.Render_Status = "Waiting in Render Queue";
  assert.equal(evaluateReviewPackage(pending).readiness, "IN_PROGRESS");
  const changes = privateReviewRecord("recPrivateChanges01");
  changes.fields.Review_Status = "Changes Requested";
  assert.equal(evaluateReviewPackage(changes).readiness, "IN_PROGRESS");
  const approved = privateReviewRecord("recPrivateApproved1");
  approved.fields.Review_Status = "Approved";
  assert.equal(evaluateReviewPackage(approved).readiness, "BLOCKED");
});

test("Factory's Supabase review scan includes complete held outputs, independent of the main publishing queue", () => {
  const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  const start = source.indexOf("export async function listSupabaseFactoryDeskPack");
  const end = source.indexOf("// Merge by authoritative output identity", start);
  assert.ok(start > 0 && end > start, "authoritative Factory Supabase pack exists");
  const pack = source.slice(start, end);
  assert.ok(pack.includes("platform_outputs?do_not_publish=eq.false&output_status=neq.Published"));
  assert.ok(pack.includes("platform_outputs?or=(output_status.eq.Ready%20for%20Review,review_status.eq.Review%20Sent)"));
  assert.ok(!pack.includes("`platform_outputs?do_not_publish=eq.false`\n        + `&or=(output_status"));
});

test("Museum Mile #2212: all six complete held outputs are visible for inspection but neither approvable nor releaseable", () => {
  const numbers = [10827, 10828, 10829, 10830, 10831, 10832];
  const rows = numbers.map((number, index) => {
    const record = privateReviewRecord("recMuseumHeld" + String(number).padStart(5, "0"));
    record.fields.Review_Status = "";
    record.fields.Publish_Status = index === 5 ? "Publishing" : index > 2 ? "Ready to Publish" : "Not Ready";
    record.fields.Factory_Review_Handoff_Safety_Hold_At = "2026-11-19T17:03:00Z";
    const readiness = evaluateReviewPackage(record);
    assert.equal(readiness.readiness, "READY", number);
    const visibility = factoryReviewVisibility(record, readiness, "Review Held", true);
    assert.equal(visibility.visible, true, number);
    assert.equal(visibility.held_preview_only, true, number);
    assert.equal(formalFactoryApprovalReady(record, readiness), false, number);
    assert.equal(factoryApprovalHoldReleaseEligibility(record, readiness).eligible, false, number);
    return {
      kind: "output", id: record.id, output_id: number, studio_state: "Review Held",
      output_status: "Ready for Review", review_status: "",
      render_status: "Rendered", publish_status: record.fields.Publish_Status,
      do_not_publish: true, safety_hold_active: true, review_package_ready: visibility.visible,
      final_file_url: record.fields.Final_File_URL,
      thumbnail_url: record.fields.Thumbnail_URL,
    };
  });
  const desk = partitionFactoryLanes(rows);
  assert.equal(desk.summary.needs_eyes, 6);
  assert.deepEqual(desk.lanes.needs_eyes.map((row) => row.output_id), numbers);
  assert.ok(desk.lanes.needs_eyes.every((row) => row.do_not_publish && row.safety_hold_active && row.can_preview));

  const ui = readFileSync(new URL("../studio-web/assets/factory-desk.js", import.meta.url), "utf8");
  assert.ok(ui.includes("card?.safety_hold_active === true"));
  assert.ok(ui.includes("card.safety_hold_active !== true"));
});

test("Supabase Factory second review filter keeps all six completed safety-held Museum Mile outputs", () => {
  for (const [number, publish] of [
    [10827, "Not Ready"],
    [10828, "Not Ready"],
    [10829, "Not Ready"],
    [10830, "Ready to Publish"],
    [10831, "Ready to Publish"],
    [10832, "Publishing"],
  ]) {
    assert.equal(matchesOpsQueueReviewFormula({
      Output_ID: number, Output_Status: "Ready for Review",
      Review_Status: null, Publish_Status: publish,
      Do_Not_Publish: true,
      Final_File_URL: "https://drive.google.com/file/d/existing/view",
      Thumbnail_URL: "https://media.chicagoshining.com/studio/previews/cover.png",
    }), true, "Rendered #"+number+" must remain visible in Factory despite its hold");
  }
});

test("Supabase Factory second review filter refuses held outputs that are not pending fresh human review", () => {
  const base = {
    Output_Status: "Ready for Review", Review_Status: null,
    Publish_Status: "Not Ready", Do_Not_Publish: true,
  };
  const excluded = [
    { Test_Run_ID: "test-synthetic" },
    { Output_Status: "Approved for Publishing" },
    { Output_Status: "Published" },
    { Output_Status: "In Production" },
    { Review_Status: "Approved" },
    { Review_Status: "Rejected" },
    { Review_Status: "Changes Requested" },
    { Review_Status: "Skipped" },
    { Publish_Status: "Published" },
    { Publish_Status: "Scheduled" },
    { Published_At: "2026-11-19T16:40:00Z" },
    { Platform_Post_URL: "https://www.youtube.com/shorts/already-posted" },
    { Platform_Post_ID: "video-already-created" },
  ];
  for (const change of excluded) {
    assert.equal(matchesOpsQueueReviewFormula({ ...base, ...change }), false,
      "must not resurrect "+JSON.stringify(change));
  }
  // The published/nonheld operations lane still follows its original behavior.
  assert.equal(matchesOpsQueueReviewFormula({
    Output_Status: "Ready for Review", Do_Not_Publish: false,
  }), true);
});

test("Supabase Factory pack retains held output through BOTH the query and post-query review predicate", () => {
  const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  const marker = "export async function listSupabaseFactoryDeskPack";
  const start = source.indexOf(marker);
  const end = source.indexOf("/**\n * PostgREST rejects batch POST bodies", start);
  assert.ok(start >= 0 && end > start, "Factory pack source exists");
  const pack = source.slice(start,end);
  assert.ok(pack.includes("platform_outputs?or=(output_status.eq.Ready%20for%20Review,review_status.eq.Review%20Sent)"));
  assert.ok(pack.includes("matchesOpsQueueReviewFormula(row.fields)"),
    "second held-safe filter must govern the actual independently scanned review outputs");
  assert.equal(matchesOpsQueueReviewFormula({
    Output_Status: "Ready for Review", Review_Status: "",
    Publish_Status: "Publishing", Do_Not_Publish: true,
  }), true);
});


test("NYC #2371: eight held review outputs remain visible even after older Factory approval or recovery fences", () => {
  const ui = readFileSync(new URL("../studio-web/assets/factory-desk.js", import.meta.url), "utf8");
  const extract = (name) => {
    const start = ui.indexOf(`  function ${name}(`);
    assert.ok(start >= 0, `Missing client function ${name}`);
    const end = ui.indexOf("\n  }", start);
    assert.ok(end > start, `Unterminated client function ${name}`);
    return ui.slice(start, end + 4);
  };
  const code = [
    extract("canReviewHeldOutput"),
    extract("canRejectHeldOutput"),
    extract("factoryHasHumanReviewAction"),
    extract("factoryVisibleNeedsEyes"),
    "factoryVisibleNeedsEyes(cards)",
  ].join("\n");
  const ids = [
    ["recO494MDnQ1Tk51b", 10855],
    ["recWIWOrdflmqyxKW", 10856],
    ["recVoFLCOAGHNIkD3", 10863],
    ["rechOtaxHOwY18A8F", 10864],
    ["rec61JeXiA6Aai1Kk", 10867],
    ["recttY0sPY2RGkcaq", 10869],
    ["recUIDBjcY6RgSy0n", 10870],
    ["recWq5HIxBT8BCtme", 10875],
  ];
  const cards = ids.map(([id, output_id]) => ({
    id, output_id, kind: "output", profile_id: "recgtK8Z7eNADNtVy",
    studio_output_type: "Carousel", output_status: "Ready for Review",
    review_status: "Review Sent", render_status: "Native Photo Route",
    publish_status: "Not Ready", do_not_publish: true, auto_publish_enabled: false,
    review_package_ready: true, thumbnail_url: media + "studio/previews/example/slide-01.jpg",
    scheduled_post_date: null, studio_scheduled_at: null, published_at: null,
    platform_post_url: null,
  }));
  // Simulate the real regression: IDs remain in 48-hour accepted store and
  // completed Activity after a previous batch, but the server has restored
  // a held Ready-for-Review state. They must remain inspectable, not published.
  const submitted = new Set(ids.map(([id]) => id));
  const run = (input, accepted) => runInNewContext(code, {
    cards: input,
    factorySubmittedApprovalIds: () => accepted,
    canReviewActions: () => false,
  });
  const visible = run(cards, submitted);
  assert.deepEqual(Array.from(visible, row => row.output_id), ids.map(([, number]) => number));
  assert.ok(visible.every(row => row.do_not_publish === true && row.auto_publish_enabled === false));
  const posted = { ...cards[0], publish_status: "Published", published_at: "2026-11-22T06:00:00Z" };
  assert.equal(run([posted], submitted).length, 0, "published work must never reopen");
  const scheduled = { ...cards[1], studio_scheduled_at: "2026-12-01T12:00:00Z" };
  assert.equal(run([scheduled], submitted).length, 0, "scheduled output must not appear for held approval");
  const unheldAccepted = { ...cards[2], do_not_publish: false };
  assert.equal(run([unheldAccepted], submitted).length, 0, "historical accepted unheld work remains suppressed");
  assert.equal(run([cards[0]], new Set()).length, 1, "no accepted fence does not hide pending held review");
});


test("#2294: six protected draft galleries enter Needs Eyes for human inspection without any approval eligibility", () => {
  const outputs = [
    [10853, "rectw2pvgnBzK3wCN", 4],
    [10854, "recJ8jTynJDxsN0hl", 4],
    [10992, "rec1p9SOjrpxtpQkV", 8],
    [10993, "recX9tOrTfQldqs32", 8],
    [11033, "recBlShZbe7cqtGAG", 8],
    [11034, "recHmu20eEQmX4JLq", 8],
  ];
  const rows = outputs.map(([number,id,slides]) => ({
    kind: "output", id, output_id: number, selected_clip_count: slides,
    studio_output_type: "Carousel", studio_state: "Unverified gallery candidates · Visual review only · Publishing held",
    candidate_gallery_review: true, review_package_ready: false,
    output_status: "Ready for Review", review_status: null,
    render_status: "Native Photo Route", publish_status: "Not Ready",
    do_not_publish: true, auto_publish_enabled: false,
    thumbnail_url: media + "studio/previews/cover.jpg",
  }));
  const desk = partitionFactoryLanes(rows);
  assert.equal(desk.summary.needs_eyes, 6);
  assert.deepEqual(desk.lanes.needs_eyes.map(r=>r.output_id), outputs.map(x=>x[0]));
  assert.ok(desk.lanes.needs_eyes.every(r =>
    r.do_not_publish && !r.auto_publish_enabled && r.review_package_ready === false
    && r.candidate_gallery_review && r.can_approve === false));
  for (const patch of [
    {do_not_publish:false}, {auto_publish_enabled:true},
    {render_status:"Waiting in Render Queue"}, {scheduled_post_date:"2026-12-01T00:00:00Z"},
    {review_status:"Approved"}, {published_at:"2026-11-22T12:00:00Z"},
    {output_status:"Published"}, {candidate_gallery_review:false},
  ]) {
    const actual = partitionFactoryLanes([{...rows[0],...patch}]);
    assert.equal(actual.summary.needs_eyes, 0, JSON.stringify(patch));
  }
});


test("#2294: actual Supabase Factory pack discovers all six exact unapproved draft inventories", async () => {
  const pairs = [
    [10853, "rectw2pvgnBzK3wCN",4], [10854, "recJ8jTynJDxsN0hl",4],
    [10992, "rec1p9SOjrpxtpQkV",8], [10993, "recX9tOrTfQldqs32",8],
    [11033, "recBlShZbe7cqtGAG",8], [11034, "recHmu20eEQmX4JLq",8],
  ];
  const parents=pairs.map(([num,id,count]) => ({
    airtable_record_id:id,output_number:num,selected_clip_count:count,
    output_status:"Ready for Review",render_status:"Native Photo Route",
    review_status:null,publish_status:"Not Ready",do_not_publish:true,
    auto_publish_enabled:false,test_run_id:null,
    studio_output_type:"Carousel",platform_output_type:"Instagram Carousel",
    platform:num===10853||num===10993||num===11034?"Facebook":"Instagram",
    thumbnail_url:media+"studio/previews/cover.jpg",
    studio_preview_url:media+"studio/previews/example.jpg",error_messages:{},
  }));
  const slides=pairs.flatMap(([num,id,count])=>Array.from({length:count},(_,i)=>({
    airtable_record_id:"sb-native:2294:"+num+":"+String(i+1).padStart(2,"0"),
    current_order:i+1,deleted_from_carousel:false,
    fields:{
      PO_Output_ID:[num],"Platform Output":[id],
      "Review Status":"Pending Review",
      "Approved For Final":false,Shared_Asset_Approved:false,
      "Final Image URL":media+"studio/previews/lettered/"+id+"/"+i+".jpg",
      "Asset_4x5_Public_URL":media+"studio/previews/lettered/"+id+"/"+i+".jpg",
      SM_Native_Gallery_Draft_Repair_2294:{
        output_number:num,slide_order:i+1,
        publishing_authorized:false,final_creative_approved:false,
      },
    },
  })));
  const original=globalThis.fetch;
  const paths=[];
  globalThis.fetch=async url=>{
    const href=String(url), u=new URL(href);
    paths.push(u.pathname+u.search);
    const result=u.pathname.endsWith("/carousel_slides")?slides:
      u.pathname.endsWith("/platform_outputs")&&
        String(u.searchParams.get("or")||"").includes("output_status.eq.Ready for Review")
      ?parents:[];
    return {ok:true,text:async()=>JSON.stringify(result)};
  };
  try {
    const pack=await listSupabaseFactoryDeskPack({
      SUPABASE_URL:"https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY:"unit-test-only",
    });
    assert.ok(paths.some(p=>p.includes("carousel_slides?airtable_record_id=like.sb-native%3A2294%3A*")),
      "Factory must query its own exact protected Supabase draft slides");
    const review=pack.reviewOutputs.filter(row=>pairs.some(([num])=>row.fields.Output_ID===num));
    assert.equal(review.length,6,"every complete held gallery reaches independent review lane");
    for(const row of review){
      assert.equal(row.fields.SM_Factory_Native_Gallery_Candidate_Review_2294,true,row.id);
      assert.equal(row.fields["Carousel Slides"].length,row.fields.Selected_Clip_Count,row.id);
      assert.equal(row.fields.Do_Not_Publish,true,row.id);
      assert.equal(row.fields.Auto_Publish_Enabled,false,row.id);
    }
  }finally{
    globalThis.fetch=original;
  }
});
