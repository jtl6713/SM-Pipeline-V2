/* Admin-only read-only exception inventory: existing Quality Agent scan. */
(() => {
  const $ = (id) => document.getElementById(id);
  const root = $("page-exception-recovery");
  const nav = $("navExceptionRecovery");
  if (!root || !nav) return;
  const metrics = $("ercMetrics"), listing = $("ercList"), detail = $("ercDetail");
  const status = $("ercStatus"), profiles = $("ercProfile"), platform = $("ercPlatform");
  const category = $("ercCategory"), refresh = $("ercRefresh");
  const METRICS = [
    ["needs_decision","Needs my decision"], ["automatically_recovering","Automatically recovering"],
    ["awaiting_verification","Awaiting verification"], ["approved_past_due","Approved past due"],
    ["failed","Failed"], ["suspected_duplicates","Suspected duplicates"],
    ["held_deferred","Held / deferred"], ["resolved_last_7_days","Resolved · 7 days"],
  ];
  const state = { allowed:false, loading:false, payload:null, selected:"", serial:0 };
  const elem = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (cls) node.className = cls;
    return node;
  };
  const date = x => {
    const ms = Date.parse(String(x || ""));
    return Number.isFinite(ms) ? new Date(ms).toLocaleString() : "Unknown";
  };
  const nowOpen = () => root.classList.contains("active");
  const msg = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); };
  async function getJson(url) {
    const response = await fetch(url, {credentials:"same-origin",headers:{Accept:"application/json"},cache:"no-store"});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || "Exception Recovery request failed (" + response.status + ")");
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function metricCard(key, label, info) {
    const card = elem("button",null,"erc-metric");
    card.type="button";
    const observed = info?.observed;
    card.append(elem("strong", observed == null ? "—" : observed),
      elem("span",label),elem("small", info?.status === "provisional" ? "Observed · not Home parity" : info?.status === "unavailable" ? "Unavailable" : info?.status === "not_implemented" ? "Not yet connected" : String(info?.status || "Unknown")));
    card.title = info?.note || "Count is not yet available";
    const byKey = {approved_past_due:"approved_past_due",failed:"failed",held_deferred:"held_deferred"};
    if (byKey[key]) card.addEventListener("click",() => {
      category.value = category.value === byKey[key] ? "" : byKey[key];
      render();
    });
    else card.disabled = true;
    return card;
  }
  function listItem(item) {
    const button=elem("button",null,"erc-item");
    button.type="button";button.dataset.recordId=item.record_id;
    button.setAttribute("aria-pressed",String(item.record_id===state.selected));
    button.append(elem("strong",(item.output_id ? "#" + item.output_id + " · " : "") + (item.title || "Untitled output")),
      elem("small", [item.profile_name || item.profile_id || "Unknown city",item.platform,item.output_type].filter(Boolean).join(" · ")),
      elem("small",(item.held ? "Held · " : "")+(item.signature || "Quality Agent") + (item.minutes_past_due != null ? " · "+item.minutes_past_due+"m overdue" : "")));
    button.addEventListener("click",()=>{state.selected=item.record_id;render();});
    return button;
  }
  function detailField(dl,label,value) { dl.append(elem("dt",label),elem("dd",value == null || value === "" ? "Unknown" : value)); }
  function renderDetail(item) {
    detail.replaceChildren();
    if (!item) {detail.append(elem("p","Choose an exception to view its existing Quality Agent diagnosis and recommended next action."));return;}
    detail.append(elem("h3",(item.output_id?"Output #"+item.output_id:"Output")+" — "+(item.title||"Untitled")));
    const dl=elem("dl");
    detailField(dl,"Profile",item.profile_name||item.profile_id);
    detailField(dl,"Platform",[item.platform,item.output_type].filter(Boolean).join(" · "));
    detailField(dl,"Categories",item.categories.join(", "));
    detailField(dl,"Status",[item.output_status,item.publish_status].filter(Boolean).join(" / "));
    detailField(dl,"Due",item.scheduled_at?date(item.scheduled_at):null);
    detailField(dl,"Retry",item.retry_at?date(item.retry_at):null);
    detailField(dl,"Attempts",item.attempts);
    detailField(dl,"Signature",item.signature);
    detail.append(dl,elem("h4","Diagnosis"),elem("p",item.diagnosis||"A full provider-level diagnosis is not yet available."),
      elem("h4","Quality Agent recommendation"),elem("p",item.recommendation||"Review existing pipeline evidence before acting."));
    const actions=elem("div",null,"erc-actions");
    const open=elem("button","Open exact output in Pipeline","secondary-button");
    open.type="button";open.disabled=!/^rec[A-Za-z0-9]{14}$/.test(item.record_id);
    open.addEventListener("click",async()=>{
      const profile=$("studioProfileSelect");
      if(profile&&item.profile_id&&[...profile.options].some(o=>o.value===item.profile_id)){
        profile.value=item.profile_id;profile.dispatchEvent(new Event("change",{bubbles:true}));
      }
      if(typeof window.StudioOpenPipelineOutputById==="function"){
        try{await window.StudioOpenPipelineOutputById(item.record_id);}catch{document.querySelector('[data-page="outputs"]')?.click();}
      }else document.querySelector('[data-page="outputs"]')?.click();
    });
    actions.append(open);
    detail.append(actions,elem("p","This view is read-only. Publication, retries, holds, deletions, and conversation actions remain disabled until their audited authorization, remote-verification, and persistence paths are complete.","erc-note"));
    const evidence=elem("details");
    evidence.append(elem("summary","Technical details and recovery state"));
    const pre=elem("pre");pre.textContent=JSON.stringify({record_id:item.record_id,signature:item.signature,recovery:item.recovery,categories:item.categories},null,2);
    evidence.append(pre);detail.append(evidence);
  }
  function updateProfileOptions(items) {
    const value=profiles.value;
    const fromGlobal=[...($("studioProfileSelect")?.options || [])].filter(o=>/^rec[A-Za-z0-9]{14}$/.test(o.value)).map(o=>({id:o.value,name:o.textContent.trim()}));
    const fromItems=items.filter(i=>i.profile_id).map(i=>({id:i.profile_id,name:i.profile_name||i.profile_id}));
    const list=new Map([...fromItems,...fromGlobal].map(i=>[i.id,i.name]));
    profiles.replaceChildren(new Option("All profiles",""));
    for(const [id,name] of list) profiles.add(new Option(name,id));
    if([...profiles.options].some(o=>o.value===value)) profiles.value=value;
  }
  function render() {
    const data=state.payload;
    metrics.replaceChildren();listing.replaceChildren();
    if(!data){renderDetail(null);return;}
    for(const [key,label] of METRICS) metrics.append(metricCard(key,label,data.metrics?.[key]));
    const items=(data.items||[]).filter(i=>(!profiles.value||i.profile_id===profiles.value)
      &&(!platform.value||String(i.platform||"").toLowerCase()===platform.value.toLowerCase())
      &&(!category.value||i.categories.includes(category.value)));
    $("ercVisible").textContent=items.length+" visible · "+(data.as_of?"scanned "+date(data.as_of):"scan unavailable");
    if(items.length&&!items.some(i=>i.record_id===state.selected))state.selected=items[0].record_id;
    if(!items.length)state.selected="";
    if(!items.length)listing.append(elem("p","No results in the observed inventory. Some categories are not yet connected."));
    for(const item of items)listing.append(listItem(item));
    renderDetail(items.find(i=>i.record_id===state.selected)||null);
  }
  async function load() {
    if(state.loading || !state.allowed)return;
    state.loading=true;refresh.disabled=true;const serial=++state.serial;
    msg("Reading existing Quality Agent census...");
    try{
      const data=await getJson("/api/admin/exception-recovery");
      if(serial!==state.serial)return;
      if(!data.read_only)throw new Error("Unexpected API mode: only read-only inventory is supported.");
      state.payload=data;updateProfileOptions(data.items||[]);render();
      msg(data.warning||"Observed figures are provisional.");
    }catch(e){
      if(serial!==state.serial)return;
      state.payload=null;render();
      msg(e.status===403?"Administrator access required.":(e.message||"Inventory unavailable.")+" Counts cannot be trusted until an authoritative scan succeeds.",true);
      if(e.status===401||e.status===403){state.allowed=false;nav.hidden=true;root.classList.remove("active");}
    }finally{state.loading=false;refresh.disabled=false;}
  }
  function activate() {
    document.querySelectorAll("main .page").forEach(page=>page.classList.toggle("active",page===root));
    document.querySelectorAll(".sidebar .nav-item").forEach(button=>button.classList.toggle("active",button===nav));
    if(!state.payload)load();
    root.scrollIntoView({block:"start"});
  }
  nav.addEventListener("click",(event)=>{event.preventDefault();event.stopImmediatePropagation();if(state.allowed)activate();},true);
  document.querySelectorAll(".sidebar .nav-item").forEach(button=>{
    if(button!==nav)button.addEventListener("click",()=>{root.classList.remove("active");},true);
  });
  for(const select of [profiles,platform,category])select.addEventListener("change",render);
  refresh.addEventListener("click",load);
  // Light role check; server-side authorization still gates every data endpoint.
  getJson("/api/session").then(session=>{
    const permissions=session?.permissions;
    const admin=session?.authenticated===true&&session?.authorized===true
      &&(Array.isArray(permissions)?permissions.includes("tenant_admin"):permissions?.tenant_admin===true);
    state.allowed=Boolean(admin);nav.hidden=!state.allowed;
    if(state.allowed&&nowOpen())load();
  }).catch(()=>{nav.hidden=true;state.allowed=false;});
})();
