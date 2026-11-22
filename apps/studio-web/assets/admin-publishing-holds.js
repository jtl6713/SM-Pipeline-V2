/* #2735 Administration: human-readable Supabase publishing-hold inventory. */
(() => {
  const el=id=>document.getElementById(id);
  const panel=el("adminPublishHoldsPanel");
  if (!panel) return;
  const body=el("adminPublishHoldsRows"),status=el("adminPublishHoldsStatus");
  const profile=el("adminPublishHoldsProfile"),lookup=el("adminPublishHoldsLookup");
  const more=el("adminPublishHoldsMore"),refresh=el("adminPublishHoldsRefresh");
  const history=el("adminPublishHoldsHistory");
  let offset=0,hasMore=false,pending=false,revision=0,loaded=false;
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
  async function showHistory(id) {
    history.hidden=false;
    history.replaceChildren();
    label(history,"strong","Hold and release history for "+id);
    label(history,"p","Loading audit history…");
    try{
      const result=await request("/api/operations/publishing-holds?history_for="+encodeURIComponent(id));
      history.replaceChildren();
      label(history,"strong","Hold and release history for "+id);
      if(!result.events?.length){
        label(history,"p","No event history recorded. This may be a historical hold created before tracking began.");
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
      history.append(list);
    }catch(error){showStatus("Unable to load audit history: "+error.message,true);}
  }
  async function releaseHold(record,check) {
    // Keep the hold visually checked until the server confirms the actual release.
    check.checked=true;
    const note=prompt("Reason for releasing the publishing hold on #"+
      (record.number||record.id)+" ("+record.profile_name+"):\n\n"+
      "This does NOT approve, schedule, publish, retry, or enable automatic publishing.");
    if(note===null)return;
    if(note.trim().length<12||note.trim().length>500){
      showStatus("Release requires a reason of 12–500 characters. No hold changed.",true);
      return;
    }
    if(!confirm("Release publishing hold on output #"+(record.number||record.id)+
      " only?\n\nAutomatic publishing will remain disabled. You must explicitly approve/schedule/publish later."))return;
    check.disabled=true;
    showStatus("Rechecking and releasing output #"+(record.number||record.id)+"…");
    try{
      await request("/api/operations/publishing-holds/"+record.id+"/release",{
        method:"POST",body:JSON.stringify({
          confirm_output_id:record.id,release_note:note.trim(),
          revision:record.revision,hold_set_at:record.hold_set_at
        })
      });
      showStatus("Released #"+(record.number||record.id)+". Automatic publishing remains OFF. No post was dispatched.");
      await load(false);
    }catch(error){
      check.checked=true;showStatus("Hold NOT confirmed released: "+error.message,true);
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
    if(!record.releasable)label(action,"p",record.block_reason||"Protected hold","admin-hold-blocked");
    else label(action,"p","Uncheck to release this hold only","subtle");
    const btn=document.createElement("button");
    btn.type="button";btn.className="secondary-button";btn.textContent="History";
    btn.addEventListener("click",()=>showHistory(record.id));
    action.append(btn);tr.append(action);
    body.append(tr);
  }
  async function load(append=false){
    if(pending)return;
    const serial=++revision;pending=true;refresh.disabled=true;more.disabled=true;
    if(!append){offset=0;body.replaceChildren();history.hidden=true;}
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
      for(const record of data.records||[])renderRow(record);
      hasMore=Boolean(data.has_more);
      offset=data.next_offset||offset+100;
      more.hidden=!hasMore;
      showStatus(body.children.length+" held output(s) shown. "+
        "Historical holds may lack a recorded reason. Releasing a hold never publishes a post.");
      if(!body.children.length) {
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
