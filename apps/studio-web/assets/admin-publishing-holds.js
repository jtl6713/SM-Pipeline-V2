/* #2735 Administration: human-readable Supabase publishing-hold inventory. */
(() => {
  const el=id=>document.getElementById(id);
  const panel=el("adminPublishHoldsPanel");
  if (!panel) return;
  const body=el("adminPublishHoldsRows"),status=el("adminPublishHoldsStatus");
  const profile=el("adminPublishHoldsProfile"),lookup=el("adminPublishHoldsLookup");
  const more=el("adminPublishHoldsMore"),refresh=el("adminPublishHoldsRefresh");
  let offset=0,hasMore=false,pending=false,revision=0,loaded=false,shown=0,releasable=0;
  const showStatus=(message,isError=false)=>{
    status.textContent=message;
    status.classList.toggle("error-text",Boolean(isError));
  };
  async function request(path,init={}) {
    const r=await fetch(path,{
      credentials:"same-origin",
      headers:{Accept:"application/json",...(init.body?{"Content-Type":"application/json"}:{})},
      ...init
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data.ok)throw Error(data.error||"Publishing hold request failed ("+r.status+")");
    return data;
  }
  const label=(parent,tag,text,className)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=text||"";
    parent.append(node);
    return node;
  };
  const formatTime=value=>{
    if(!value)return "Not recorded (legacy)";
    const d=new Date(value);
    return Number.isNaN(d.getTime())?"Not recorded":d.toLocaleString();
  };
  async function showHistory(record,detailRow,button) {
    // The prior history widget was below 100 held outputs, often multiple
    // screens away. Expand inline with the requested output instead.
    const opening=detailRow.hidden;
    detailRow.hidden=!opening;
    button.textContent=opening?"Hide history":"History";
    button.setAttribute("aria-expanded",String(opening));
    if(!opening)return;
    const container=detailRow.querySelector(".admin-hold-history-content");
    container.replaceChildren();
    label(container,"strong","Hold history for #"+(record.number||record.id));
    label(container,"p","Current hold: "+record.reason+" (source: "+record.source+").");
    label(container,"p","Loading audit history…");
    try{
      const result=await request("/api/operations/publishing-holds?history_for="+encodeURIComponent(record.id));
      container.replaceChildren();
      label(container,"strong","Hold history for #"+(record.number||record.id));
      label(container,"p","Current hold: "+record.reason+" (source: "+record.source+").");
      if(!result.events?.length){
        label(container,"p","No recorded hold or release events. This legacy hold predates audit tracking; its original reason and date may be unavailable.");
        return;
      }
      const list=document.createElement("ul");
      for(const event of result.events) {
        const li=document.createElement("li");
        li.textContent=formatTime(event.occurred_at)+" • "+event.operation+" • "+
          (event.reason||"Reason not recorded")+" • "+(event.source||"unknown source")+
          " • "+(event.actor||"unknown actor");
        list.append(li);
      }
      container.append(list);
    }catch(error){
      const message="Unable to load audit history for #"+(record.number||record.id)+": "+error.message;
      label(container,"p",message,"error-text");
      showStatus(message,true);
    }
  }
  async function releaseHold(record,check) {
    // Keep the hold visually checked until the server confirms the actual release.
    check.checked=true;
    const feedback=check.closest("td")?.querySelector(".admin-hold-release-feedback");
    const showInline=(message,isError=false)=>{
      if(!feedback)return;
      feedback.textContent=message;
      feedback.classList.toggle("error-text",Boolean(isError));
    };
    showInline("");
    const note=prompt("Reason for releasing the publishing hold on #"+
      (record.number||record.id)+" ("+record.profile_name+"):\n\n"+
      "This does NOT approve, schedule, publish, retry, or enable automatic publishing.");
    if(note===null)return;
    if(note.trim().length<12||note.trim().length>500){
      showStatus("Release requires a reason of 12–500 characters. No hold changed.",true);
      showInline("Hold unchanged: please enter a 12–500 character release reason.",true);
      return;
    }
    if(!confirm("Release publishing hold on output #"+(record.number||record.id)+
      " only?\n\n"+(record.release_warning?record.release_warning+"\n\n":"")+
      "Automatic publishing will remain disabled. You must explicitly approve/schedule/publish later."))return;
    check.disabled=true;
    showStatus("Rechecking and releasing output #"+(record.number||record.id)+"…");
    showInline("Checking current hold protection and revision…");
    try{
      await request("/api/operations/publishing-holds/"+record.id+"/release",{
        method:"POST",body:JSON.stringify({
          confirm_output_id:record.id,release_note:note.trim(),
          revision:record.revision,hold_set_at:record.hold_set_at
        })
      });
      showStatus("Released #"+(record.number||record.id)+". Automatic publishing remains OFF. No post was dispatched.");
      showInline("Hold release verified; refreshing. Automatic publishing remains OFF.");
      await load(false);
    }catch(error){
      check.checked=true;
      showStatus("Hold NOT confirmed released: "+error.message,true);
      showInline("Hold remains active: "+error.message,true);
    }finally{check.disabled=false;}
  }
  function renderRow(record){
    const tr=document.createElement("tr");
    const output=document.createElement("td");
    label(output,"strong","#"+(record.number||record.id));
    label(output,"div",record.title||"Untitled","subtle");
    label(output,"div",record.platform||"Unknown platform","subtle");
    tr.append(output);
    const p=document.createElement("td");
    label(p,"strong",record.profile_name||"Profile");
    label(p,"div",record.output_status||record.publish_status||"Status not recorded","subtle");
    tr.append(p);
    const reason=document.createElement("td");
    label(reason,"strong",record.reason);
    label(reason,"div","Source: "+record.source,"subtle");
    label(reason,"div","Since: "+formatTime(record.held_at),"subtle");
    tr.append(reason);
    const action=document.createElement("td");
    const control=document.createElement("label");
    control.className="admin-publish-hold-toggle";
    const checkbox=document.createElement("input");
    checkbox.type="checkbox";checkbox.checked=true;
    checkbox.disabled=!record.releasable;
    checkbox.setAttribute("aria-label","Hold for publishing on output #"+(record.number||record.id));
    checkbox.addEventListener("change",()=>releaseHold(record,checkbox));
    control.append(checkbox,document.createTextNode(" Hold for publishing"));
    action.append(control);
    const feedback=label(action,"p","","admin-hold-release-feedback");
    feedback.setAttribute("role","status");
    feedback.setAttribute("aria-live","polite");
    if(!record.releasable)label(action,"p",record.block_reason||"Protected hold","admin-hold-blocked");
    else {
      label(action,"p","Uncheck to release this publishing hold only","subtle");
      if(record.release_warning)label(action,"p",record.release_warning,"admin-hold-pending");
    }
    const btn=document.createElement("button");
    btn.type="button";btn.className="secondary-button";btn.textContent="History";
    const detailRow=document.createElement("tr");
    detailRow.className="admin-hold-history-row";
    detailRow.hidden=true;
    detailRow.id="admin-hold-history-"+record.id;
    const detailCell=document.createElement("td");
    detailCell.colSpan=4;
    const detailContent=document.createElement("div");
    detailContent.className="admin-hold-history-content";
    detailContent.setAttribute("aria-live","polite");
    detailCell.append(detailContent);
    detailRow.append(detailCell);
    btn.setAttribute("aria-controls",detailRow.id);
    btn.setAttribute("aria-expanded","false");
    btn.addEventListener("click",()=>showHistory(record,detailRow,btn));
    action.append(btn);tr.append(action);
    body.append(tr,detailRow);
  }
  async function load(append=false){
    if(pending)return;
    const serial=++revision;pending=true;refresh.disabled=true;more.disabled=true;
    if(!append){offset=0;body.replaceChildren();shown=0;releasable=0;}
    showStatus("Loading publishing holds…");
    try{
      const params=new URLSearchParams({offset:String(offset)});
      if(profile.value)params.set("profile_id",profile.value);
      if(lookup.value.trim())params.set("output_id",lookup.value.trim());
      const data=await request("/api/operations/publishing-holds?"+params);
      if(serial!==revision)return;
      if(!loaded){
        const selected=profile.value;
        profile.replaceChildren(new Option("All authorized profiles",""));
        for(const item of data.profiles||[])profile.add(new Option(item.name,item.id));
        profile.value=selected;
      }
      loaded=true;
      for(const record of data.records||[]){
        renderRow(record);
        shown++;
        if(record.releasable)releasable++;
      }
      hasMore=Boolean(data.has_more);
      offset=data.next_offset||offset+100;
      more.hidden=!hasMore;
      showStatus(shown+" held output(s) shown; "+releasable+
        " eligible for hold release. Protected holds remain locked. Releasing does not publish a post.");
      if(!shown) {
        const tr=document.createElement("tr"),td=document.createElement("td");
        td.colSpan=4;td.textContent="No publishing holds match this filter.";tr.append(td);body.append(tr);
      }
    }catch(error){showStatus(error.message,true);}
    finally{pending=false;refresh.disabled=false;more.disabled=!hasMore;}
  }
  refresh.addEventListener("click",()=>{loaded=false;load(false);});
  more.addEventListener("click",()=>load(true));
  profile.addEventListener("change",()=>{loaded=true;load(false);});
  lookup.addEventListener("change",()=>load(false));
  el("operationsTabGlobal")?.addEventListener("click",()=>{if(!loaded)load(false);});
  if(document.getElementById("operationsTabGlobal")?.classList.contains("active"))load(false);
})();
