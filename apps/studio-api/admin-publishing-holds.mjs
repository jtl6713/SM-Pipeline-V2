/** #2735 Supabase-only, exact-output Administration publishing hold controls. */
const REC = /^rec[A-Za-z0-9]{14}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const str = value => String(value ?? "").trim();
const yes = value => value === true || value === 1 || str(value).toLowerCase() === "true";
const outSelect = [
  "id","airtable_record_id","output_number","content_profile_id","platform","output_title",
  "output_status","review_status","publish_status","render_status","do_not_publish",
  "auto_publish_enabled","test_run_id","platform_post_url","published_at","updated_at",
  "platform_publish_response",
  "publish_hold_reason","publish_hold_source","publish_hold_actor","publish_hold_set_at",
  "publish_hold_released_at","publish_hold_release_note","error_messages"
].join(",");
const safetyKeys = [
  "Studio_Render_Review_Hold_ID","Studio_Review_Hold_ID",
  "Studio_Render_Review_Hold_Owner","Studio_Render_Review_Session_ID",
  "Studio_Review_Hold_Owner","Factory_Review_Handoff_Safety_Hold_At",
  "Legal_Hold","Copyright_Hold","SM_Factory_Held_Review_Receipt",
  "SM_False_Changes_Requested_Recovery_2563"
];
const dispatchKeys = [
  "Publish_Started_At","Publish_Locked_At","Publish_Locked_By","Platform_Post_ID",
  "Platform_Media_ID","Studio_Publish_Dispatch_At","TikTok_Draft_Publish_ID",
  "YouTube_Video_ID","Instagram_Reel_Container_ID","IG_Carousel_Parent_Container_ID"
];
export function classifyAdminPublishingHold(row) {
  const extras = row?.error_messages && typeof row.error_messages === "object" && !Array.isArray(row.error_messages)
    ? row.error_messages : {};
  const reason = str(row?.publish_hold_reason) || "Reason not recorded — historical hold";
  const block = note => ({ releasable:false, block_reason:note, reason });
  if (!yes(row?.do_not_publish)) return block("This output is not on hold");
  if (str(row?.test_run_id)) return block("Test output: this is a permanent publishing restriction");
  if (yes(extras.Studio_Render_Review_Hold_Active) ||
      safetyKeys.some(key => Boolean(extras[key]) && str(extras[key]) !== "false")) {
    return block("Protected creative, recovery, copyright, or Factory hold. Resolve it in the owning review workflow");
  }
  if (row?.published_at || row?.platform_post_url ||
      ["published","publishing","cancelled","skipped"].includes(str(row?.output_status).toLowerCase()) ||
      ["published","publishing"].includes(str(row?.publish_status).toLowerCase())) {
    return block("Published, publishing, cancelled, or skipped output: reconcile status first");
  }
  if (dispatchKeys.some(key => str(extras[key])) ||
      Number(extras.Studio_Publish_Dispatch_Count || 0)>0 ||
      Number(extras.Publish_Attempt_Count || 0)>0 ||
      (row?.platform_publish_response && Object.keys(row.platform_publish_response).length>0)) {
    return block("Prior dispatch or provider identity: reconcile the publisher before releasing this hold");
  }
  return { releasable:true, block_reason:null, reason };
}
function json(data,status=200) {
  return new Response(JSON.stringify(data),{status,headers:{
    "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff"
  }});
}
function err(status,error) { return json({ok:false,error},status); }
function asRow(row,profiles) {
  const state=classifyAdminPublishingHold(row);
  const profile=profiles.find(item=>item.id===row.content_profile_id);
  return {
    id:row.airtable_record_id,number:row.output_number,title:row.output_title,
    platform:row.platform,profile_id:profile?.airtable_record_id || null,
    profile_name:profile?.profile_name || profile?.market_name || "Profile",
    output_status:row.output_status,review_status:row.review_status,
    publish_status:row.publish_status,reason:state.reason,
    source:row.publish_hold_source || "Historical / unrecorded",
    actor:row.publish_hold_actor || null,held_at:row.publish_hold_set_at || null,
    held:true,releasable:state.releasable,block_reason:state.block_reason,
    revision:row.updated_at,hold_set_at:row.publish_hold_set_at,
    automatic_publishing_enabled:yes(row.auto_publish_enabled)
  };
}
async function allowedProfiles(env,authorization,ops) {
  // Fail closed on the actual organization's canonical Supabase UUID; never
  // fall back to a legacy Airtable profile listing or cross-tenant scan.
  const orgRecordId=str(authorization?.organization?.record_id);
  if (!REC.test(orgRecordId)) return [];
  const orgs=await ops.supabaseRest(env,
    "organizations?airtable_record_id=eq."+encodeURIComponent(orgRecordId)+
    "&select=id&limit=1");
  const orgId=Array.isArray(orgs)?orgs[0]?.id:null;
  if (!UUID.test(str(orgId))) return [];
  const profiles=await ops.supabaseRest(env,
    "content_profiles?organization_id=eq."+encodeURIComponent(orgId)+
    "&select=id,airtable_record_id,profile_name,market_name&limit=101");
  if (!Array.isArray(profiles) || profiles.length>100)
    throw Error("Authorized profile inventory incomplete; refusing to list or mutate holds");
  return profiles.filter(row=>UUID.test(str(row.id))&&REC.test(str(row.airtable_record_id)));
}
async function readOne(env,id,ops) {
  const rows=await ops.supabaseRest(env,
    "platform_outputs?airtable_record_id=eq."+encodeURIComponent(id)+"&select="+outSelect+"&limit=1");
  return Array.isArray(rows)?rows[0]||null:null;
}
export async function handleAdminPublishingHolds({request,url,env,authorization,ops}) {
  if (!authorization?.permissions?.tenant_admin) return err(403,"Studio administrator permission required");
  if (typeof ops?.supabaseRest!=="function" ||
      typeof ops?.withOutputLock!=="function") return err(503,"Publishing hold service unavailable");
  const profiles=await allowedProfiles(env,authorization,ops);
  const allowed=new Set(profiles.map(row=>row.id));
  const match=/^\/api\/operations\/publishing-holds\/(rec[A-Za-z0-9]{14})\/release$/.exec(url.pathname);
  if (request.method==="GET" && !match) {
    const historyId=str(url.searchParams.get("history_for"));
    if (historyId) {
      if (!REC.test(historyId)) return err(400,"Invalid output identifier");
      const row=await readOne(env,historyId,ops);
      if (!row || !allowed.has(row.content_profile_id)) return err(404,"Output not available");
      const history=await ops.supabaseRest(env,
        "platform_output_hold_events?output_record_id=eq."+historyId+
        "&select=operation,reason,source,actor,occurred_at&order=occurred_at.desc&limit=50");
      return json({ok:true,output_id:historyId,events:history||[]});
    }
    if (!allowed.size) return err(409,"No authorized Content Profiles could be resolved in Supabase; not reporting an empty hold list");
    const page=Math.min(1000,Math.max(0,Number.parseInt(url.searchParams.get("offset")||"0",10)||0));
    const chosen=str(url.searchParams.get("profile_id"));
    if (chosen && !profiles.some(row=>row.airtable_record_id===chosen)) return err(403,"Profile not authorized");
    const subset=chosen?profiles.filter(row=>row.airtable_record_id===chosen):profiles;
    const outputId=str(url.searchParams.get("output_id"));
    if (outputId && !REC.test(outputId) && !/^\d{1,10}$/.test(outputId)) return err(400,"Invalid output identifier");
    const filters="&content_profile_id=in.("+subset.map(p=>p.id).join(",")+")&do_not_publish=eq.true"+
      (outputId?(REC.test(outputId)?"&airtable_record_id=eq."+outputId:"&output_number=eq."+outputId):"");
    const rows=await ops.supabaseRest(env,"platform_outputs?select="+outSelect+
      filters+"&order=created_at.desc&limit=101&offset="+page);
    if (!Array.isArray(rows)) return err(503,"Hold inventory unavailable");
    return json({ok:true,records:rows.slice(0,100).map(row=>asRow(row,profiles)),
      profiles:profiles.map(p=>({id:p.airtable_record_id,name:p.profile_name||p.market_name||p.airtable_record_id})),
      has_more:rows.length>100,next_offset:page+100});
  }
  if (!match || request.method!=="POST") return err(405,"Method not allowed");
  const id=match[1];
  if (!/^application\/json(?:\s*;|$)/i.test(str(request.headers.get("Content-Type"))))
    return err(415,"JSON body required");
  const raw=await request.text();
  if (raw.length>1500) return err(413,"Release request too large");
  let body;try{body=JSON.parse(raw);}catch{return err(400,"Invalid JSON");}
  if (!body||typeof body!=="object"||Array.isArray(body)||
      Object.keys(body).some(k=>!["confirm_output_id","release_note","revision","hold_set_at"].includes(k)) ||
      body.confirm_output_id!==id || !str(body.release_note) ||
      str(body.release_note).length<12 || str(body.release_note).length>500 ||
      !str(body.revision)) return err(400,"Exact output confirmation, revision and a release note (12–500 characters) required");
  return ops.withOutputLock(id,async()=>{
    const before=await readOne(env,id,ops);
    if (!before || !allowed.has(before.content_profile_id)) return err(404,"Output not available");
    if (!yes(before.do_not_publish)) return err(409,"Hold already released. Refresh this page");
    if (str(before.updated_at)!==str(body.revision) ||
        str(before.publish_hold_set_at)!==str(body.hold_set_at))
      return err(409,"Hold changed since it was loaded. Refresh before releasing");
    const decision=classifyAdminPublishingHold(before);
    if (!decision.releasable) return err(409,decision.block_reason);
    const actor=str(authorization?.user?.record_id)||"studio-administrator";
    // Both the exact source state and the hold generation are optimistic CAS guards.
    const query="platform_outputs?airtable_record_id=eq."+id+
      "&do_not_publish=eq.true&updated_at=eq."+encodeURIComponent(str(body.revision))+
      "&publish_hold_set_at="+(before.publish_hold_set_at
        ?"eq."+encodeURIComponent(str(before.publish_hold_set_at)):"is.null")+
      "&select=airtable_record_id,do_not_publish,auto_publish_enabled";
    const changed=await ops.supabaseRest(env,query,{
      method:"PATCH",
      headers:{Prefer:"return=representation"},
      body:{do_not_publish:false,auto_publish_enabled:false,
        publish_hold_release_note:str(body.release_note),
        publish_hold_release_actor:actor}
    });
    if (!Array.isArray(changed)||changed.length!==1||changed[0].airtable_record_id!==id||
        changed[0].do_not_publish!==false||changed[0].auto_publish_enabled!==false)
      return err(409,"Hold release not confirmed; refresh and check its current state");
    const after=await readOne(env,id,ops);
    if (!after||after.do_not_publish!==false||after.auto_publish_enabled!==false)
      return err(503,"Unable to verify saved release; refresh before any further action");
    const events=await ops.supabaseRest(env,
      "platform_output_hold_events?output_record_id=eq."+id+
      "&operation=eq.released&select=operation,reason,actor,occurred_at&order=occurred_at.desc&limit=1");
    if (!Array.isArray(events)||events[0]?.actor!==actor)
      return err(503,"Hold state saved but audit verification unavailable; refresh");
    return json({ok:true,id,released:true,automatic_publishing_enabled:false,
      publication_triggered:false,scheduled:false,approved:false,
      audit:events[0]});
  });
}
