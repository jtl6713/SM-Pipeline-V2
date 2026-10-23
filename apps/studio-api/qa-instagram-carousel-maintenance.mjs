/**
 * Quality Agent: recover stale Instagram carousel stages on regular heavy cron.
 * This path NEVER creates children, parents or posts. It only rearms a read-only
 * AP2C verification of ten exact saved child IDs. Unknown identity -> escalate.
 * Test runs / held outputs are deliberately excluded.
 */
export const QA_IG_CAROUSEL_LEDGER = "Quality Agent Recovery Ledger";
const val = (row, key) => row?.fields?.[key];
const str = (row, key) => String(val(row, key) ?? "").trim();
const numericMetaId = (v) => /^\d{6,30}$/.test(String(v || "").trim());
const recordIdValid = (v) => /^rec[A-Za-z0-9]{14}$/.test(String(v || ""));
const escapeFormula = (v) => String(v).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
const stale = (timestamp, nowMs) => {
  const t = Date.parse(String(timestamp || ""));
  return !Number.isFinite(t) || t <= nowMs - 15 * 60000;
};

export function qaCarouselMaintenanceDecision(row, slides, nowMs = Date.now()) {
  const outputId = Number(val(row, "Output_ID") || 0);
  const state = str(row, "IG_Carousel_Status");
  if (val(row,"Do_Not_Publish") === true && str(row,"Test_Run_ID") === ""
      && ["Creating Children","Creating Parent","Assets Ready","Parent Ready"].includes(state))
    return {outcome:"human_review_required",reason:"publishing_hold",output_id:outputId,rearm:false,graph_creates:0};
  const blocked = !recordIdValid(row?.id) || !outputId
    || str(row, "Platform") !== "Instagram"
    || str(row, "Platform_Output_Type") !== "Instagram Carousel"
    || str(row, "Publish_Status") !== "Ready to Publish"
    || str(row, "Output_Status") !== "Approved for Publishing"
    || val(row, "Auto_Publish_Enabled") !== true
    || val(row, "Do_Not_Publish") === true
    || str(row, "Test_Run_ID") !== ""
    || str(row, "Platform_Post_ID") !== ""
    || str(row, "IG_Carousel_Published_Media_ID") !== ""
    || str(row, "IG_Carousel_Parent_Container_ID") !== ""
    || !stale(val(row, "Publish_Locked_At"), nowMs);
  if (blocked || !["Creating Children", "Creating Parent"].includes(state))
    return { outcome: "not_eligible", output_id: outputId, rearm: false, graph_creates: 0 };

  const oversized = state === "Creating Parent";
  if (oversized && !(Number(val(row, "IG_Carousel_Child_Count")) > 10
      && /QA_IG_AP3C_UNSUPPORTED_ATTACHMENTS|Unsupported post type.*attachments/i.test(
        str(row, "Publish_Error_Stage") + " " + str(row, "IG_Carousel_Parent_Response_JSON"))))
    return { outcome: "human_review_required", reason: "ambiguous_parent", output_id: outputId, rearm: false, graph_creates: 0 };

  const ordered = [...(Array.isArray(slides) ? slides : [])]
    .sort((a, b) => Number(val(a, "Current Order")) - Number(val(b, "Current Order")));
  const selected = ordered.slice(0, 10);
  const exactOrder = selected.length === 10 && selected.every((x,i) => Number(val(x, "Current Order")) === i+1);
  const singleCover = selected.filter(x => val(x, "Is Cover") === true).length === 1 && val(selected[0],"Is Cover") === true;
  const allApproved = selected.every(x => val(x, "Approved For Final") === true);
  const childIds = selected.map(x => str(x, "IG_Child_Container_ID"));
  const allExisting = childIds.every(numericMetaId) && new Set(childIds).size === 10;
  const recognized = selected.every(x => ["FINISHED", "IN_PROGRESS", "PUBLISHED"].includes(str(x, "IG_Child_Container_Status").toUpperCase()));
  if (!exactOrder || !singleCover || !allApproved || !allExisting || !recognized)
    return { outcome: "human_review_required", output_id:outputId,
      reason: !exactOrder || !singleCover ? "ambiguous_slide_order" : !allApproved ? "unapproved_slide"
        : !allExisting ? "missing_or_conflicting_child_identity" : "unverified_child_state",
      rearm:false, graph_creates:0 };

  return { outcome:"carousel_child_poll_rearmed", output_id:outputId,
    reason:oversized?"oversized_parent_recheck":"stale_child_stage_recheck",
    rearm:true, child_count:10, graph_creates:0 };
}

export async function qaInstagramCarouselMaintenance(env, { airtableFetch, nowMs=Date.now(), limit=4 }={}) {
  if (typeof airtableFetch !== "function") throw new Error("Quality Agent needs authoritative Airtable access");
  const filter='AND({Platform_Output_Type}="Instagram Carousel",OR({IG_Carousel_Status}="Creating Children",{IG_Carousel_Status}="Creating Parent",AND({Do_Not_Publish}=1,OR({IG_Carousel_Status}="Assets Ready",{IG_Carousel_Status}="Parent Ready"))),{Test_Run_ID}=BLANK())';
  const source=await airtableFetch(env, env.AIRTABLE_OUTPUT_TABLE_ID || "Platform Outputs",
    "?filterByFormula="+encodeURIComponent(filter)+"&maxRecords="+Math.min(60,Math.max(12,limit*8)));
  if (!Array.isArray(source?.records)) throw new Error("Quality Agent carousel scan incomplete");
  const bucket=new Date(Math.floor(nowMs / 1800000)*1800000).toISOString();
  const out=[];
  // Rotate the bounded review window so a persistent human-hold at the front
  // cannot starve other profiles for every future half-hour tick.
  const n = Math.max(1, Math.min(12, limit));
  const groups = Math.max(1, Math.ceil(source.records.length / n));
  const selectedGroup = Math.floor(nowMs / 1800000) % groups;
  const selectedRows = source.records.slice(selectedGroup * n, (selectedGroup + 1) * n);
  for (const row of selectedRows) {
    const id = String(row?.id||"");
    if (!recordIdValid(id)) continue;
    const outputId=Number(val(row,"Output_ID")||0);
    const slidesResult=await airtableFetch(env,"Carousel Slides",
      "?filterByFormula="+encodeURIComponent('ARRAYJOIN({PO_Output_ID})="'+escapeFormula(String(outputId))+'"')+"&maxRecords=40");
    if (!Array.isArray(slidesResult?.records)) throw new Error("Quality Agent slide scan incomplete");
    let decision=qaCarouselMaintenanceDecision(row,slidesResult.records,nowMs);
    if (decision.outcome === "not_eligible") continue;
    if (decision.rearm) {
      const latest=await airtableFetch(env,env.AIRTABLE_OUTPUT_TABLE_ID || "Platform Outputs",id);
      const again=qaCarouselMaintenanceDecision(latest,slidesResult.records,nowMs);
      if (!again.rearm || latest?.id!==id)
        decision={outcome:"human_review_required",reason:"state_changed_during_recheck",rearm:false,output_id:outputId,graph_creates:0};
      else {
        await airtableFetch(env,env.AIRTABLE_OUTPUT_TABLE_ID || "Platform Outputs",id,{
          method:"PATCH",body:JSON.stringify({fields:{
            IG_Carousel_Status:"Children Processing",
            IG_Carousel_Child_Count:10,Image_Count:10,
            Publish_Locked_At:null,Publish_Locked_By:"",
            Publish_Retry_Eligible:false,
          },typecast:true}),
        });
        const verified=await airtableFetch(env,env.AIRTABLE_OUTPUT_TABLE_ID || "Platform Outputs",id);
        if (str(verified,"IG_Carousel_Status")!=="Children Processing"
            || Number(val(verified,"IG_Carousel_Child_Count"))!==10
            || str(verified,"Platform_Post_ID") || verified?.id!==id)
          throw new Error("Quality Agent carousel rearm readback incomplete; no recovery counted");
      }
    }
    const eventKey="QA-IG-STALLED:"+id+":"+bucket;
    const evidence={...decision,output_record_id:id,observed_at:new Date(nowMs).toISOString(),
      no_meta_graph_create:true,auto_publish_triggered:false,
      next_action:decision.rearm?"AP2C existing-child Graph GET in standard heavy cron":"operator_review"};
    const payload={performUpsert:{fieldsToMergeOn:["Event_Key"]},typecast:true,records:[{fields:{
      Event_Key:eventKey, Output_Record_ID:id,Output_ID:outputId,
      Platform:"Instagram", Output_Type:"Instagram Carousel",
      Outcome:decision.outcome, Evidence_Source:"airtable_saved_ig_child_ids",
      Verified_At:new Date(nowMs).toISOString(),Actor:"studio-quality-agent",
      Details_JSON:JSON.stringify(evidence),
    }}]};
    const saved=await airtableFetch(env,QA_IG_CAROUSEL_LEDGER,"",{method:"PATCH",body:JSON.stringify(payload)});
    if (!Array.isArray(saved?.records) || saved.records.length===0) throw new Error("QA carousel evidence write not confirmed");
    out.push(evidence);
  }
  return out;
}
