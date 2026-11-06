/**
 * Fail-closed Factory pre-hold check for a non-Chicago photo-sequence V2.
 * This is NOT a replacement for Runner's independent Drive byte/rights
 * verification: its sole purpose is to reject missing/foreign branding BEFORE
 * any correction-batch receipt, scheduling vacate, or review hold is written.
 */
const REC=/^rec[A-Za-z0-9]{14}$/;
const DRIVE=/^[A-Za-z0-9_-]{20,}$/;
const asText=v=>String(v??"").trim();
const selected=v=>typeof v==="object"&&v!==null?asText(v.name):asText(v);
const owned=v=>Array.isArray(v)&&v.length===1?
  (typeof v[0]==="object"&&v[0]!==null?asText(v[0].id):asText(v[0])):"";

export function profileWatermarkPreflight({profileId,originalPropsJson,assets,field=(r,k)=>r?.fields?.[k]}={}){
  const unsupported=reason=>({supported:false,reason});
  if(!REC.test(asText(profileId))||!Array.isArray(assets)||assets.length>=200)
    return unsupported("PROFILE_WATERMARK_CATALOG_UNAVAILABLE");
  let props;
  try {props=JSON.parse(originalPropsJson);}
  catch {return unsupported("PROFILE_WATERMARK_SOURCE_MISSING");}
  const source=asText(props?.watermarkUrl);
  if(!source)return unsupported("PROFILE_WATERMARK_SOURCE_MISSING");
  const candidates=assets.filter(row=>
    REC.test(asText(row?.id)) &&
    owned(field(row,"Content_Profile"))===profileId &&
    selected(field(row,"Asset_Role"))==="Watermark" &&
    selected(field(row,"Asset_Status"))==="Available" &&
    selected(field(row,"Rights_Status"))==="Owned" &&
    field(row,"Active")===true && field(row,"Do_Not_Use")!==true &&
    asText(field(row,"MIME_Type"))==="image/png" &&
    DRIVE.test(asText(field(row,"Google Drive File ID"))));
  const small=candidates.filter(row=>asText(field(row,"Asset Name"))
    .toLowerCase().includes("_watermark_small."));
  const authorized=small.length===1?small[0]:candidates.length===1?candidates[0]:null;
  if(!authorized)return unsupported("PROFILE_WATERMARK_MISSING_OR_AMBIGUOUS");
  let url;
  try {url=new URL(source);}catch{return unsupported("PROFILE_WATERMARK_SOURCE_MISMATCH");}
  const entries=[...url.searchParams.entries()];
  if(url.protocol!=="https:"||url.hostname!=="drive.google.com"||
     url.port||url.username||url.password||url.pathname!=="/uc"||url.hash||
     entries.length!==2||!url.searchParams.has("export")||!url.searchParams.has("id")||
     url.searchParams.get("export")!=="download"||
     url.searchParams.get("id")!==asText(field(authorized,"Google Drive File ID")))
    return unsupported("PROFILE_WATERMARK_SOURCE_MISMATCH");
  return {supported:true,reason:null};
}
