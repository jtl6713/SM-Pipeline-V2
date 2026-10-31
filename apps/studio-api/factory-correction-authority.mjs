/**
 * Airtable-authoritative profile/output matching for Factory corrections.
 * The UI preview and the eventual write path must use the SAME snapshot
 * builder. No mirror/cache/desk-row can authorize an output mutation.
 */
import { factoryCorrectionMatches } from "./factory-correction-selection.mjs";

const text=v=>String(v??"").trim();
const rec=v=>/^rec[A-Za-z0-9]{14}$/.test(text(v));
const linked=v=>Array.isArray(v)&&v.length===1&&rec(v[0])?v[0]:null;
const select=v=>typeof v==="string"?v:text(v?.name);
function fail(message,status=409) {
  const err=new Error(message);err.status=status;err.code="CORRECTION_AUTHORITY_INVALID";throw err;
}
function normalize(row,{requestId,contentId,profileId,mapping,field}) {
  const get=name=>field(row,name);
  return {
    id:row.id,production_request_id:requestId,
    content_item_id:contentId,profile_id:profileId,
    enabled:mapping.enabled===true,
    render_format:mapping.render_format,
    platform:text(mapping.platform),output_type:text(mapping.output_type),
    render_status:select(get("Render_Status")),
    output_status:select(get("Output_Status")),
    publish_status:select(get("Publish_Status")),
    final_file_id:text(get("Final_File_ID")),
    final_file_url:text(get("Final_File_URL")),
    published_at:text(get("Published_At")),
    platform_post_url:text(get("Platform_Post_URL")),
    platform_post_id:text(get("Platform_Post_ID")),
    platform_media_id:text(get("Platform_Media_ID")),
    publish_started_at:text(get("Publish_Started_At")),
    publish_locked_at:text(get("Publish_Locked_At")),
    publish_locked_by:text(get("Publish_Locked_By")),
    review_hold_active:get("Studio_Render_Review_Hold_Active")===true,
    review_session_id:text(get("Studio_Render_Review_Session_ID")),
    do_not_publish:get("Do_Not_Publish")===true,
    scheduled_at:text(get("Scheduled_Post_Date")||get("Studio_Scheduled_At")||
      get("YouTube_Scheduled_Publish_At")),
  };
}

export async function loadAuthoritativeFactoryCorrection({
  outputId,productionRequestId,authorizedProfileIds,readOutput,readContent,readMappings,
  field=(record,key)=>record?.fields?.[key],
}) {
  if(!rec(outputId)||!rec(productionRequestId)||typeof readOutput!=="function"||
     typeof readContent!=="function"||typeof readMappings!=="function"||
     !Array.isArray(authorizedProfileIds))
    fail("Exact Factory correction identity and trusted readers required",400);
  const source=await readOutput(outputId);
  if(source?.id!==outputId||!source.fields)fail("Source output is not authoritative",503);
  const contentId=linked(field(source,"Content_Item"));
  const sourceRequest=linked(field(source,"Production_Request"));
  if(!contentId||(sourceRequest&&sourceRequest!==productionRequestId))
    fail("Source output does not belong to the requested content");
  const content=await readContent(contentId);
  const profileId=linked(field(content,"Content_Profile"));
  const contentRequest=linked(field(content,"Production_Request"));
  if(content?.id!==contentId||!profileId||
     !authorizedProfileIds.includes(profileId)||
     (contentRequest&&contentRequest!==productionRequestId))
    fail("The Content Item belongs to another request or unauthorized profile",403);
  const list=await readMappings(productionRequestId);
  const rows=Array.isArray(list)?list:Array.isArray(list?.records)?list.records:null;
  if(!rows||rows.length>100)fail("Authoritative output mapping is unavailable",503);
  const originals=rows.filter(row=>row?.enabled===true&&
    Array.isArray(row.platform_output_links)&&
    row.platform_output_links.includes(outputId));
  if(originals.length!==1||!text(originals[0].render_format?.key))
    fail("Exactly one enabled source rendering format is required");
  const signature=originals[0].render_format.key;
  const matches=rows.filter(row=>row?.enabled===true&&
    row.render_format?.key===signature);
  const candidates=matches.flatMap(mapping=>
    mapping.platform_output_links?.map(id=>({id,mapping}))||[]);
  if(candidates.length>40||candidates.some(({id})=>!rec(id)))
    fail("Compatible output mapping exceeds the verified bound");
  const seen=new Set(),authoritative=[];
  for(const {id,mapping} of candidates){
    if(seen.has(id))continue;
    seen.add(id);
    const row=id===outputId?source:await readOutput(id);
    if(row?.id!==id||!row.fields)fail("Mapped output readback unavailable",503);
    const ownContent=linked(field(row,"Content_Item"));
    const ownRequest=linked(field(row,"Production_Request"));
    if(ownContent!==contentId||(ownRequest&&ownRequest!==productionRequestId))
      fail("A mapped sibling belongs to another content/request");
    authoritative.push(normalize(row,{
      requestId:productionRequestId,contentId,profileId,mapping,field,
    }));
  }
  const authoritativeSource=authoritative.find(row=>row.id===outputId);
  const eligible=factoryCorrectionMatches(authoritativeSource,authoritative,{
    authorized_profile_ids:authorizedProfileIds,
  });
  return {source:authoritativeSource,outputs:authoritative,
    matches:eligible,production_request_id:productionRequestId,
    content_item_id:contentId,profile_id:profileId,
    authorized_profile_ids:authorizedProfileIds};
}
