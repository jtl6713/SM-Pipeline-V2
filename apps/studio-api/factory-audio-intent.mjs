// #2972: compare generated-video output intent with the exact saved source.
// A final audio stream or a self-consistent render receipt cannot detect a
// dropped instruction when both were derived from the same wrong directive.
const REC = /^rec[A-Za-z0-9]{14}$/;
function object(v) {
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function mode(v) {
  const s=String(v??"").trim().toLowerCase();
  return s==="yes"?"Yes":s==="no"?"No":null;
}
export function generatedAudioSource(row) {
  if (row?.output_status!=="Ready for Review" || row.review_status==="Approved"
      ||row.do_not_publish===true||row.test_run_id||row.published_at||row.platform_post_url) return null;
  const selected=object(row.selected_assets);
  const d=object(object(row.error_messages)?.Studio_Output_Directives_JSON);
  if(selected?.authority!=="studio_owner_uploaded_exact_source"
     || !["Video","Story"].includes(d?.pipeline_family)
     || !REC.test(String(d?.production_request_record_id||""))
     || !REC.test(String(d?.production_request_output_record_id||""))
     || selected.production_request_record_id!==d.production_request_record_id
     || row.platform!==d.platform || row.studio_output_type!==d.output_type) return null;
  return d;
}

export function originalAudioIntentIssue(row, content, link, source=generatedAudioSource(row)) {
  if(!source) return null;
  if(!content || content.id!==row.content_item_id
     || !link || link.airtable_record_id!==source.production_request_output_record_id
     || link.production_request_airtable_id!==source.production_request_record_id
     || link.content_item_id!==row.content_item_id || link.platform_output_id!==row.id
     || link.platform!==row.platform || link.output_type!==row.studio_output_type)
    return "Original generated-video audio instructions could not be reconciled; retry review after verification";
  const override=object(link.effective_resolution)||{};
  const checks=[
    ["voiceover","Voiceover_Mode_Override",content.voiceover_intent,row.studio_effective_voiceover_mode,source.voiceover_mode],
    ["background music","Background_Music_Mode_Override",content.music_intent,row.studio_effective_background_music_mode,source.background_music_mode],
  ];
  for(const [label,key,parent,effective,directive] of checks){
    // Explicit Yes/No override wins. An explicit unresolved AI choice is
    // not reinterpreted as a parent Yes/No or a forced repair.
    const value=Object.hasOwn(override,key)&&String(override[key]??"").trim()!==""?override[key]:parent;
    const expected=mode(value);
    if(!expected) continue;
    if(mode(effective)!==expected||mode(directive)!==expected)
      return "Generated video "+label+" differs from original "+expected+" instruction; regenerate and verify media before approval";
  }
  return null;
}
