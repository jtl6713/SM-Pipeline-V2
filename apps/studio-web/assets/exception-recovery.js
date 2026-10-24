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
    ["held_deferred","Held / deferred"], ["remote_identity_unverified","Remote IDs · no receipt"],
    ["resolved_last_7_days","Resolved · 7 days"],
  ];
  const state = { allowed:false, loading:false, payload:null, selected:"", serial:0, threadSerial:0, threadMessages:new Map(), preflights:new Map(), posting:false, pendingRequest:null, selectedBulk:new Set(), bulkBusy:false };
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
  // UI-only formatting: retain the source minutes for comparison and sorting.
  const formatOverdueAge = minutes => {
    if (minutes == null || minutes === "") return null;
    const total = Number(minutes);
    if (!Number.isFinite(total) || total < 0) return null;
    const rounded = Math.floor(total);
    const hours = Math.floor(rounded / 60);
    const remainder = rounded % 60;
    return (hours ? hours + "h " + remainder + "m" : remainder + "m") + " overdue";
  };
  const nowOpen = () => root.classList.contains("active");
  const msg = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); };
  const tabs=elem("div",null,"erc-toolbar");
  tabs.setAttribute("aria-label","Recovery views");
  const activePanel=elem("div");
  const top=root.querySelector(".erc-top");
  while(top.nextSibling) activePanel.append(top.nextSibling);
  root.append(tabs,activePanel);
  const historyPanel=elem("section",null,"erc-history");historyPanel.hidden=true;root.append(historyPanel);
  state.view="all";state.history=[];state.historyCursor=null;
  const viewButtons=new Map();
  for(const [value,label] of [["all","All active"],["recovering","Automatically Recovering"],
    ["verification","Awaiting Verification"],["decision","Needs Your Decision"],["history","Recovery History"]]) {
    const b=elem("button",label,"secondary-button");b.type="button";
    b.addEventListener("click",()=>{
      state.view=value;activePanel.hidden=value==="history";historyPanel.hidden=value!=="history";
      for(const [key,button] of viewButtons)button.setAttribute("aria-pressed",String(key===value));
      if(value==="history")loadHistory(false);else render();
    });tabs.append(b);viewButtons.set(value,b);
  }
  viewButtons.get("all").setAttribute("aria-pressed","true");
  const historyFilters=elem("div",null,"erc-toolbar");
  const historyInputs={};
  for(const [key,label,type,choices] of [
    ["q","Search output, title or audit","search"],
    ["from","From","date"],["to","Through","date"],
    ["profile","Profile","select"],["platform","Platform","select",["YouTube","Facebook","Instagram","TikTok"]],
    ["outcome","Result","select",["Corrected","Already Reconciled","Awaiting Verification","Blocked","Failed","Needs Decision"]],
    ["actor","Actor","select",["automatic","manual"]]]) {
    const wrap=elem("label",label),input=elem(type==="select"?"select":"input");
    if(type==="select") {
      input.append(new Option("All",""));
      for(const value of choices||[])input.append(new Option(value,value));
    } else input.type=type;
    input.setAttribute("aria-label",label);wrap.append(input);historyFilters.append(wrap);historyInputs[key]=input;
  }
  const historySearch=elem("button","Search history","secondary-button");historySearch.type="button";
  historySearch.addEventListener("click",()=>loadHistory(false));historyFilters.append(historySearch);
  const historyStatus=elem("p",null,"erc-status");historyStatus.setAttribute("role","status");
  const historyResults=elem("div",null,"erc-history-results");
  const historyMore=elem("button","Next history page","secondary-button");historyMore.type="button";
  historyMore.addEventListener("click",()=>loadHistory(true));
  historyPanel.append(historyFilters,historyStatus,historyResults,historyMore);
  function recoveryLane(item) {
    const worker=item.recovery_worker, outcome=worker?.last?.outcome;
    if(item.held || worker?.terminal || outcome==="Needs Decision" || outcome==="Failed")return "decision";
    const runtime=state.payload?.automation;
    const heartbeat=Date.parse(runtime?.runtime?.heartbeat?.completed_at||"");
    const healthy=runtime?.policy?.inspect && Date.now()-heartbeat < 2*runtime.policy.intervalMs;
    if(healthy && worker && (!worker.next_at || worker.next_at<=Date.now() || worker.pending))return "recovering";
    return "verification";
  }
  async function loadHistory(next) {
    if(!state.allowed || state.historyLoading)return;
    state.historyLoading=true;historySearch.disabled=true;historyMore.disabled=true;
    historyStatus.textContent="Reading permanent Airtable audit history…";
    const query=new URLSearchParams();
    for(const [key,input] of Object.entries(historyInputs))if(input.value)
      query.set(key,key==="to"?input.value+"T23:59:59.999":input.value);
    if(next&&state.historyCursor)query.set("cursor",state.historyCursor);
    try {
      const data=await getJson("/api/admin/exception-recovery/history?"+query);
      state.history=data.items||[];state.historyCursor=data.next_cursor;
      historyResults.replaceChildren();
      for(const item of state.history) {
        const card=elem("details",null,"erc-history-entry");
        card.append(elem("summary",(item.output_id?"#"+item.output_id+" · ":"")+
          (item.title||"Saved audit event")+" · "+item.outcome+" · "+date(item.timestamp)));
        const dl=elem("dl");
        for(const [label,value] of [
          ["Profile",item.profile_id],["Platform",item.platform],["Category",item.category],
          ["Detected",date(item.detected_at)],["Original state",JSON.stringify(item.before||{})],
          ["Provider ID",item.receipt?.remote_id],["Verified",date(item.receipt?.checked_at)],
          ["Action / reason",item.reason],["New state",JSON.stringify(item.after||{})],
          ["Corrected",item.corrected_at?date(item.corrected_at):"Not confirmed"],
          ["Duration",item.duration_ms==null?"Unknown":(item.duration_ms/1000).toFixed(1)+"s"],
          ["Actor",item.actor],["Audit ID",item.audit_id||item.event_key]])detailField(dl,label,value);
        card.append(dl);
        const remote=item.receipt?.permalink;
        if(remote && /^https:\/\/(www\.)?(youtube\.com|youtu\.be|facebook\.com|instagram\.com)\//i.test(remote)) {
          const a=elem("a","Open verified provider post");a.href=remote;a.target="_blank";a.rel="noopener noreferrer";card.append(a);
        }
        const open=elem("button","Open exact Studio output","secondary-button");open.type="button";
        open.disabled=!/^rec[A-Za-z0-9]{14}$/.test(item.record_id||"");
        open.addEventListener("click",()=>window.StudioOpenPipelineOutputById?.(item.record_id));
        card.append(open);
        const evidence=elem("pre");evidence.textContent=JSON.stringify(item,null,2);card.append(evidence);
        historyResults.append(card);
      }
      historyStatus.textContent=state.history.length+" matching events on this page. "+
        (data.next_cursor?"More pages remain; continue to search older events.":"End of history.")+
        " Automation: "+(data.automation?.policy?.inspect?"verification enabled":"disabled")+
        "; status corrections "+(data.automation?.policy?.mutate?"gated rollout enabled":"disabled")+".";
      historyMore.hidden=!data.next_cursor;
    } catch(error) {historyStatus.textContent=error.message;historyResults.replaceChildren();}
    finally {state.historyLoading=false;historySearch.disabled=false;historyMore.disabled=false;}
  }
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
      elem("span",label),elem("small", info?.status === "canonical_census" ? "Complete Airtable census" : info?.status === "provisional" ? "Observed · not Home parity" : info?.status === "unavailable" ? "Unavailable" : info?.status === "not_implemented" ? "Not yet connected" : String(info?.status || "Unknown")));
    card.title = info?.note || "Count is not yet available";
    const byKey = {approved_past_due:"approved_past_due",failed:"failed",held_deferred:"held_deferred",remote_identity_unverified:"remote_identity_unverified"};
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
      elem("small",(item.held ? "Held · " : "")+(item.signature || "Quality Agent") + (formatOverdueAge(item.minutes_past_due) ? " · "+formatOverdueAge(item.minutes_past_due) : "")));
    button.addEventListener("click",()=>{state.selected=item.record_id;render();});
    const wrap=elem("div",null,"erc-item-wrap");
    const tick=elem("input");tick.type="checkbox";
    tick.setAttribute("aria-label","Select output "+(item.output_id||item.record_id)+" for safety preview");
    tick.checked=state.selectedBulk.has(item.record_id);
    tick.addEventListener("change",()=>{
      if(tick.checked&&state.selectedBulk.size>=5) {tick.checked=false; $("ercBulkStatus").textContent="At most five outputs per safety preview.";return;}
      if(tick.checked)state.selectedBulk.add(item.record_id);
      else state.selectedBulk.delete(item.record_id);
      updateBulkButton();
    });
    wrap.append(tick,button);
    return wrap;
  }
  function updateBulkButton() {
    const button=$("ercPreviewSelected");
    if(!button)return;
    button.disabled=state.bulkBusy||!state.selectedBulk.size||!state.allowed;
    button.textContent="Preview selected safety gates ("+state.selectedBulk.size+"/5)";
  }
  async function previewSelected() {
    if(state.bulkBusy||!state.allowed||!state.selectedBulk.size)return;
    const ids=[...state.selectedBulk].slice(0,5);
    const host=$("ercBulkResults");const msgHost=$("ercBulkStatus");
    host.replaceChildren();state.bulkBusy=true;updateBulkButton();
    msgHost.textContent="Inspecting "+ids.length+" live outputs; no actions are executed…";
    let unknown=0;
    for(const id of ids) {
      const row=elem("div",null,"erc-bulk-row");
      try{
        const data=await getJson("/api/admin/exception-recovery/"+id+"/preflight");
        row.append(elem("strong",(data.output_id?"#"+data.output_id:"Output")+" · "+(data.category||"Unknown")),
          elem("p",safePreflightText(data)));
      }catch(error) {
        unknown++;
        row.append(elem("strong","Output safety unavailable"),
          elem("p","Preflight failed for "+id+". No action is authorized. "+String(error.message||error)));
      }
      host.append(row);
    }
    state.bulkBusy=false;updateBulkButton();
    msgHost.textContent="Reviewed "+ids.length+" outputs ("+unknown+" unavailable). This is inspection only; publishing and state changes remain disabled.";
  }
  function freshClientRequestId() {
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID().replace(/-/g,"");
    return String(Date.now())+"ec"+String(Math.random()).slice(2).padEnd(16,"0");
  }
  async function readThread(recordId) {
    if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) return;
    const serial=++state.threadSerial;
    const history=$("ercMessages");
    const preflight=$("ercPreflight");
    if (history) history.replaceChildren(elem("p","Loading saved administrator conversation…"));
    if (preflight) preflight.textContent="Checking live output safety gates…";
    const uri="/api/admin/exception-recovery/"+recordId;
    const results=await Promise.allSettled([getJson(uri+"/conversation"),getJson(uri+"/preflight")]);
    if (serial!==state.threadSerial||state.selected!==recordId) return;
    if (results[0].status==="fulfilled") {
      const messages=results[0].value?.messages||[];
      state.threadMessages.set(recordId,messages);
      renderMessages(recordId);
    } else if (history) history.textContent="Conversation currently unavailable. Existing output was not changed.";
    if (results[1].status==="fulfilled") {
      state.preflights.set(recordId,results[1].value);
      if(preflight) preflight.textContent=safePreflightText(results[1].value);
    } else if(preflight) preflight.textContent="Safety preflight unavailable. No recovery commands can run.";
  }
  function safePreflightText(info) {
    if(!info || info.status!=="read_only") return "Recovery actions remain disabled.";
    const statuses=[info.category||"requires_review"];
    if(info.held) statuses.push("Hold retained");
    if(info.remote_identity_exists&&!info.remote_publication_verified) statuses.push("Remote verification required");
    if(info.lock_active) statuses.push("Publisher lock active");
    if(info.attempt_limit_reached) statuses.push("Attempt cap reached");
    return "Safety preflight: "+statuses.join(" · ")+". "+
      (info.administrator_recovery_actions_enabled===true
        ? "Only verified existing-publication corrections may be requested with explicit approval; retries, reschedules, hold releases and deletion are disabled."
        : "All recovery mutations are disabled at the deployment level. Provider inspection remains read-only.");
  }
  function renderMessages(recordId) {
    const host=$("ercMessages");
    if(!host || state.selected!==recordId) return;
    host.replaceChildren();
    const messages=state.threadMessages.get(recordId)||[];
    if(!messages.length)host.append(elem("p","No conversation yet. You can ask Quality Agent about this output or record directions for manual review."));
    for(const message of messages){
      const panel=elem("div",null,"erc-thread-message");
      panel.append(elem("strong",message.role==="quality_agent"?"Quality Agent":"Administrator"),
        elem("small",message.created_at?date(message.created_at):"Saved"),
        elem("p",message.message||""));
      host.append(panel);
    }
    host.scrollTop=host.scrollHeight;
  }
  function appendLiveReceiptPanel(detail,item) {
    const pane=elem("section",null,"erc-receipt");
    pane.append(elem("h4","Live provider receipt"));
    const info=elem("p","No provider readback performed yet. A saved remote ID is not proof of public posting.","erc-note");
    const controls=elem("div",null,"erc-actions");
    const inspect=elem("button","Verify live provider receipt","secondary-button");
    inspect.type="button";
    const finalize=elem("button","Finalize existing Facebook post (FB3)","secondary-button");
    const repair=elem("button","Reconcile saved verified publication status","secondary-button");
    for(const button of [finalize,repair]){button.type="button";button.disabled=true;button.hidden=true;}
    controls.append(inspect,finalize,repair);pane.append(info,controls);detail.append(pane);
    let receipt=null;
    const recordId=item.record_id;
    const hideActions=()=>{for(const button of [finalize,repair]){button.disabled=true;button.hidden=true;}};
    inspect.addEventListener("click",async()=>{
      if(!state.allowed||state.selected!==recordId||inspect.disabled)return;
      receipt=null;inspect.disabled=true;hideActions();
      info.textContent="Reading exact remote post from provider (GET only) and refreshing the action preflight…";
      try{
        const [result,preflight]=await Promise.all([
          getJson("/api/admin/exception-recovery/"+recordId+"/receipt"),
          getJson("/api/admin/exception-recovery/"+recordId+"/preflight"),
        ]);
        if(state.selected!==recordId)return;
        state.preflights.set(recordId,preflight);
        receipt=result;
        info.textContent=result.verified_public
          ? "Verified provider identity "+(result.remote_id||"")+". "+(result.permalink||"")+" (read-only receipt)."
          : "Not verified: "+(result.evidence||"provider unavailable")+". No repost or state change is authorized.";
        const exact=Boolean(result.verified_public&&result.platform===item.platform
          && /^[A-Za-z0-9_-]{6,70}$/.test(String(result.remote_id||""))
          && /^\d+$/.test(String(item.output_id||"")));
        const rolloutOn=preflight?.administrator_recovery_actions_enabled===true;
        if(!rolloutOn) info.textContent+=" Recovery corrections are disabled on this Worker deployment.";
        const fb3=rolloutOn&&exact&&preflight?.fb3_existing_post_eligible===true
          && item.platform==="Facebook"&&/^\d{6,30}(?:_\d{6,30})?$/.test(result.remote_id||"");
        const statusRepair=rolloutOn&&exact&&preflight?.verified_receipt_status_repair_candidate===true;
        finalize.hidden=!fb3;finalize.disabled=!fb3;
        repair.hidden=!statusRepair;repair.disabled=!statusRepair;
      }catch(error){
        info.textContent="Provider readback unavailable: "+String(error.message||error)+". No output action occurred.";
      }finally{inspect.disabled=false;}
    });
    async function submitApproved(action,button) {
      if(!receipt?.verified_public||!state.allowed||state.selected!==recordId||button.disabled
        ||state.preflights.get(recordId)?.administrator_recovery_actions_enabled!==true)return;
      const postId=String(receipt.remote_id||"");
      const outputId=String(item.output_id||"");
      const title=action==="finalize_existing_facebook_post"
        ? "Confirm FB3 finalization ONLY of existing Facebook output"
        : "Confirm QA-PUBLISH-001 status-only reconciliation of already-published output";
      const detail=action==="finalize_existing_facebook_post"
        ? " The existing FB3 engine may finalize this saved post but cannot create a new Facebook post."
        : " This corrects only Studio publication status after fresh verified public evidence; no upload or remote post is made.";
      if(!window.confirm(title+" #"+outputId+" and remote post "+postId+"."+detail))return;
      hideActions();inspect.disabled=true;
      info.textContent="Revalidating current Airtable state and provider evidence under the existing per-output approval lock…";
      try{
        const response=await fetch("/api/admin/exception-recovery/"+recordId+"/actions",{
          method:"POST",credentials:"same-origin",headers:{Accept:"application/json","Content-Type":"application/json"},
          body:JSON.stringify({action,confirm_output_id:outputId,confirm_post_id:postId,client_request_id:freshClientRequestId()}),
        });
        const payload=await response.json().catch(()=>({}));
        info.textContent=response.ok
          ? "Existing-publication reconciliation: "+(payload.status||"unknown")+
            (payload.durable_recovery_recorded===true?" · Verified recovery ledger updated.":" · Check current status and ledger.")
          : "Action blocked: "+String(payload.reason||payload.error||response.status)+". No new post was created.";
        receipt=null;
        if(response.ok&&payload.status==="verified_published")load();
      }catch(error){
        info.textContent="Outcome uncertain: "+String(error.message||error)+". Inspect the live receipt before attempting another action.";
        receipt=null;
      }finally{inspect.disabled=false;hideActions();}
    }
    finalize.addEventListener("click",()=>submitApproved("finalize_existing_facebook_post",finalize));
    repair.addEventListener("click",()=>submitApproved("reconcile_verified_existing_receipt",repair));
  }

  async function reconcileAllCounts() {
    const button=$("ercReconcileCounts"),summary=$("ercReconciliationStatus"),host=$("ercReconciliationResult");
    if(!state.allowed||button.disabled)return;
    button.disabled=true;summary.textContent="Scanning all production Platform Outputs, then comparing the existing Home predicates with Quality Agent results…";
    host.replaceChildren();
    try{
      const data=await getJson("/api/admin/exception-recovery/counts?fresh=1");
      if(data.status!=="complete_census"||!data.read_only)throw new Error("Complete authoritative scan was not proven");
      applyCanonicalCensus(data);
      const t=data.totals;
      const home=data.home_snapshot_comparison||{status:"unavailable"};
      summary.textContent="Full Airtable census completed "+date(data.scan_completed_at)+
        ". "+data.source_row_count+" production outputs. Home comparison: "+
        (home.status||"unavailable")+".";
      host.append(elem("p","Home cache generation: "+(home.snapshot_generation||"unavailable")+
        " · Snapshot: "+(home.snapshot_at?date(home.snapshot_at):"unknown")+
        " · Compared profiles: "+(home.compared_profiles??0)+
        " · "+(home.note||"No verified Home parity evidence"),"erc-note"));
      const differences=Array.isArray(home.differences)?home.differences:[];
      for(const delta of differences.slice(0,20)) {
        host.append(elem("p","Home difference · "+delta.profile_id+" · "+delta.metric+
          " · Airtable "+delta.airtable+" · Home "+delta.home,"erc-note"));
      }
      if(home.missing_in_home?.length||home.missing_in_census?.length)
        host.append(elem("p","Profile scope differs · Missing in Home: "+
          (home.missing_in_home||[]).length+" · Missing in census: "+
          (home.missing_in_census||[]).length,"erc-note"));
      const table=elem("table",null,"erc-count-table");
      const header=elem("tr");
      for(const name of ["Scope","Outputs","Past due","No date","Failed","Manual action","Held"])header.append(elem("th",name));
      const thead=elem("thead");thead.append(header);table.append(thead);
      const tbody=elem("tbody");
      for(const [name,counts] of [["All profiles",t],...Object.entries(data.by_profile||{})]){
        const row=elem("tr");
        for(const val of [name,counts.outputs,counts.approved_past_due,counts.approved_missing_date,
          counts.failed,counts.manual_action_required,counts.held_deferred])row.append(elem("td",val));
        tbody.append(row);
      }
      table.append(tbody);host.append(table);
      const checks=data.comparisons||{};
      for(const [label,key] of [["Failed","failed"],["Past due","approved_past_due"]]){
        const diff=checks[key]||{};
        host.append(elem("p",label+" QA comparison: "+(diff.status||"unknown")+
          " · Home predicate "+(diff.home_count??"unknown")+" · QA scan "+(diff.quality_agent_count??"unknown")+
          " · Missing in QA "+(diff.missing_in_quality_agent??"unknown")+
          " · Extra QA-only "+(diff.extra_quality_agent??"unknown"),"erc-note"));
      }
    }catch(error){
      summary.textContent="Canonical count reconciliation unavailable: "+String(error.message||error)+
        ". Counts remain unknown; no partial scan is treated as zero.";
    }finally{button.disabled=false;}
  }

  function appendConversationPanel(detail,item) {
    const thread=elem("section",null,"erc-conversation");
    thread.append(elem("h4","Exception conversation"),elem("p","Messages are saved in Airtable against this output. The Quality Agent records a safety-aware response, but never executes instructions from this conversation.","erc-note"));
    const preflight=elem("p","Checking live output safety gates…","erc-note");
    preflight.id="ercPreflight";
    const messages=elem("div",null,"erc-messages");messages.id="ercMessages";
    thread.append(preflight,messages);
    const form=elem("form",null,"erc-conversation-form");
    const label=elem("label","Message to Quality Agent");
    label.htmlFor="ercMessageInput";
    const input=elem("textarea");input.id="ercMessageInput";input.name="message";input.maxLength=2000;
    input.rows=3;input.placeholder="Example: This output was already published manually. Please check before retrying.";
    const send=elem("button","Send and save message","secondary-button");send.type="submit";
    const outcome=elem("p","","erc-note");outcome.setAttribute("role","status");
    form.append(label,input,send,outcome);thread.append(form);detail.append(thread);
    form.addEventListener("submit",async(event)=>{
      event.preventDefault();
      if(state.posting||state.selected!==item.record_id)return;
      const message=String(input.value||"").trim();
      if(!message||message.length>2000){outcome.textContent="Enter a message of 1–2000 characters.";return;}
      state.posting=true;send.disabled=true;input.disabled=true;
      const pending=state.pendingRequest?.recordId===item.record_id&&state.pendingRequest?.message===message
        ? state.pendingRequest : {recordId:item.record_id,message,id:freshClientRequestId()};
      state.pendingRequest=pending;
      outcome.textContent="Saving message (no output changes)…";
      try{
        const response=await fetch("/api/admin/exception-recovery/"+item.record_id+"/conversation",{
          method:"POST",credentials:"same-origin",
          headers:{"Content-Type":"application/json",Accept:"application/json"},
          body:JSON.stringify({client_request_id:pending.id,message})
        });
        const body=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(body.error||"Save could not be confirmed ("+response.status+")");
        state.pendingRequest=null;
        state.threadMessages.set(item.record_id,body.messages||[]);
        if(state.selected===item.record_id){
          input.value="";renderMessages(item.record_id);
          outcome.textContent=body.replay?"Previously saved message loaded.":"Saved to Airtable; publishing and output state unchanged.";
        }
      }catch(error) {
        outcome.textContent="Save status uncertain: "+String(error.message||error)+". Check conversation history before sending again.";
      }finally{state.posting=false;send.disabled=false;input.disabled=false;}
    });
    const cached=state.threadMessages.get(item.record_id);
    if(cached)renderMessages(item.record_id);
    readThread(item.record_id).catch(()=>{});
  }
  function detailField(dl,label,value) { dl.append(elem("dt",label),elem("dd",value == null || value === "" ? "Unknown" : value)); }
  function renderDetail(item) {
    ++state.threadSerial;
    detail.replaceChildren();
    if (!item) {detail.append(elem("p","Choose an exception to view its existing Quality Agent diagnosis and recommended next action."));return;}
    detail.append(elem("h3",(item.output_id?"Output #"+item.output_id:"Output")+" — "+(item.title||"Untitled")));
    const dl=elem("dl");
    detailField(dl,"Profile",item.profile_name||item.profile_id);
    detailField(dl,"Platform",[item.platform,item.output_type].filter(Boolean).join(" · "));
    detailField(dl,"Categories",item.categories.join(", "));
    detailField(dl,"Status",[item.output_status,item.publish_status].filter(Boolean).join(" / "));
    detailField(dl,"Due",item.scheduled_at?date(item.scheduled_at):null);
    if(formatOverdueAge(item.minutes_past_due)) detailField(dl,"Overdue",formatOverdueAge(item.minutes_past_due));
    detailField(dl,"Retry",item.retry_at?date(item.retry_at):null);
    detailField(dl,"Attempts",item.attempts);
    detailField(dl,"Signature",item.signature);
    detailField(dl,"Background recovery",recoveryLane(item));
    detailField(dl,"Last checked",item.recovery_worker?.last?.completed_at?date(item.recovery_worker.last.completed_at):"Not yet checked");
    detailField(dl,"Recovery reason",item.recovery_worker?.last?.reason||"Awaiting authenticated provider verification");
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
    detail.append(actions,elem("p","Recovery actions (publish, retry, hold, reschedule, delete) are disabled until verified provider receipts, locks and administrator confirmations are implemented.","erc-note"));
    appendLiveReceiptPanel(detail,item);
    appendConversationPanel(detail,item);
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
    const selectedHistory=historyInputs.profile.value;
    historyInputs.profile.replaceChildren(new Option("All",""));
    for(const [id,name] of list)historyInputs.profile.add(new Option(name,id));
    historyInputs.profile.value=selectedHistory;
    if([...profiles.options].some(o=>o.value===value)) profiles.value=value;
  }
  function applyCanonicalCensus(census) {
    if(census?.status!=="complete_census"||!census.read_only||!Array.isArray(census.exception_items))
      throw new Error("Canonical exception items require a complete read-only census");
    const current=state.payload||{items:[],metrics:{},read_only:true};
    const qaById=new Map((current.items||[]).map(item=>[item.record_id,item]));
    const authoritative=census.exception_items.map(item=>{
      const qa=qaById.get(item.record_id);
      return {...item,
        title:item.title||qa?.title||null,
        profile_name:qa?.profile_name||item.profile_name||null,
        diagnosis:qa?.diagnosis||item.diagnosis,
        recommendation:qa?.recommendation||item.recommendation,
        recovery:qa?.recovery||item.recovery||null,
        recovery_worker:qa?.recovery_worker||null,
        actions_enabled:false,
      };
    });
    const seen=new Set(authoritative.map(item=>item.record_id));
    const qaOnly=(current.items||[]).filter(item=>!seen.has(item.record_id)).map(item=>({
      ...item,categories:[...new Set([...(item.categories||[]),"qa_only_unreconciled"])],
      actions_enabled:false,
    }));
    const metric=(count,note)=>({observed:count,count,status:"canonical_census",source:"complete_airtable_scan",note});
    const total=census.totals||{};
    state.payload={...current,items:[...authoritative,...qaOnly],
      as_of:census.scan_completed_at,
      status:"complete_census",read_only:true,
      metrics:{...current.metrics,
        approved_past_due:metric(total.approved_past_due,"Home canonical predicate, complete Airtable census"),
        failed:metric(total.failed,"Home failure predicate, complete Airtable census"),
        held_deferred:metric(total.held_deferred,"Complete Airtable do-not-publish census"),
        remote_identity_unverified:metric(census.unverified_remote_ids,
          "Saved remote identity without authoritative public publication receipt")},
      warning:census.exception_items_truncated
        ?"Exception item list is truncated. Canonical totals remain complete."
        :"Canonical Airtable exception records loaded; provider publication proof must still be verified."};
    updateProfileOptions(state.payload.items);
    render();
  }
  function render() {
    const data=state.payload;
    metrics.replaceChildren();listing.replaceChildren();
    if(!data){renderDetail(null);return;}
    for(const [key,label] of METRICS) metrics.append(metricCard(key,label,data.metrics?.[key]));
    const items=(data.items||[]).filter(i=>(!profiles.value||i.profile_id===profiles.value)
      &&(state.view==="all"||state.view==="history"||recoveryLane(i)===state.view)
      &&(!platform.value||String(i.platform||"").toLowerCase()===platform.value.toLowerCase())
      &&(!category.value||i.categories.includes(category.value)));
    $("ercVisible").textContent=items.length+" visible · "+(data.as_of?"scanned "+date(data.as_of):"scan unavailable");
    if(items.length&&!items.some(i=>i.record_id===state.selected))state.selected=items[0].record_id;
    if(!items.length)state.selected="";
    if(!items.length)listing.append(elem("p","No results in the observed inventory. Some categories are not yet connected."));
    for(const item of items)listing.append(listItem(item));
    updateBulkButton();
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
      msg("Quality Agent scan loaded; reconciling complete Airtable exception inventory…");
      try {
        const census=await getJson("/api/admin/exception-recovery/counts");
        if(serial!==state.serial)return;
        applyCanonicalCensus(census);
        msg(state.payload.warning);
      } catch(censusError) {
        if(serial===state.serial)msg("Displaying provisional Quality Agent findings. "+
          "For a complete source inventory, select Reconcile all-profile counts (read-only). "+
          String(censusError.message||censusError));
      }
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
  $("ercPreviewSelected")?.addEventListener("click",previewSelected);
  $("ercReconcileCounts")?.addEventListener("click",reconcileAllCounts);
  // Light role check; server-side authorization still gates every data endpoint.
  getJson("/api/session").then(session=>{
    const permissions=session?.permissions;
    const admin=session?.authenticated===true&&session?.authorized===true
      &&(Array.isArray(permissions)?permissions.includes("tenant_admin"):permissions?.tenant_admin===true);
    state.allowed=Boolean(admin);nav.hidden=!state.allowed;
    if(state.allowed&&nowOpen())load();
  }).catch(()=>{nav.hidden=true;state.allowed=false;});
})();

