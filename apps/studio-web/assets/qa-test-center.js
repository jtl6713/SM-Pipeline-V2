(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const nav=$("navQaTestCenter"),root=$("page-qa-test-center");
  if(!nav||!root)return;
  const state={tests:[],runs:[],run:null,events:[],gate:null,loading:false,pendingRunId:null};
  const MAX_NOTES=4000;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const status=$("qaStatus"),runs=$("qaRunSelect"),cases=$("qaCases"),gate=$("qaGate"),history=$("qaHistory");
  function message(text,kind=""){status.textContent=text;status.dataset.kind=kind;}
  async function call(path,options={}){
    const response=await fetch("/api/admin/qa/"+path,{
      credentials:"same-origin",cache:"no-store",
      headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},
      ...options
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"QA request failed ("+response.status+")");
    return data;
  }
  function freshId(){return crypto.randomUUID();}
  async function refreshRuns(){
    const data=await call("runs?limit=30");
    state.runs=data.runs||[];
    runs.replaceChildren(el("option","Select a saved test run"));
    runs.firstChild.value="";
    for(const run of state.runs){
      const option=el("option",(run.createdAtUtc||"Unknown time")+" — "+run.environment+" — "+run.runId.slice(0,13));
      option.value=run.runId;runs.append(option);
    }
    if(state.run)runs.value=state.run.runId;
  }
  function lastEvent(testId){
    return [...state.events].reverse().find(e=>e.testId===testId&&
      (e.kind==="ManualResult"||e.kind==="AutomatedObservation"));
  }
  function renderGate(){
    gate.replaceChildren();
    if(!state.run){gate.append(el("p","Start or select a run to record test results."));return;}
    const g=state.gate;
    if(!g){gate.append(el("p","Loading release gate…"));return;}
    gate.append(el("h3","Release gate: "+g.decision));
    gate.append(el("p",g.passed.length+" passed of "+g.total+" tests · "+
      g.failed.length+" failed · "+g.blocked.length+" blocked / not run · "+
      g.pendingHuman.length+" awaiting independent approval"));
    if(g.failed.length)gate.append(el("p","Failing: "+g.failed.join(", "),"qa-alert"));
    if(g.pendingHuman.length)gate.append(el("p","Human signoff needed: "+g.pendingHuman.join(", "),"qa-alert"));
    if(g.deploymentBlockers?.length)gate.append(el("p","Deployment verification required: "+g.deploymentBlockers.join("; "),"qa-alert"));
    if(g.waivers?.length)gate.append(el("p",g.waivers.length+" risk waivers recorded. They do not silently clear release gates."));
  }
  function renderHistory(){
    history.replaceChildren();
    if(!state.run)return;
    const table=el("div",null,"qa-event-list");
    for(const e of [...state.events].reverse()){
      const row=el("div",null,"qa-event-row");
      const label=(e.kind==="HumanApproval"?"Human review":e.kind==="AutomatedObservation"?"AI check":
        e.kind==="ManualResult"?"Manual":"Waiver");
      row.append(el("strong",e.testId+" · "+label+" · "+(e.payload.status||e.payload.decision||"Recorded")),
        el("span",e.atUtc+" · "+e.actorId),
        el("p",e.payload.notes||e.payload.reason||""));
      table.append(row);
    }
    history.append(table);
  }
  async function loadRun(runId){
    const data=await call("runs/"+encodeURIComponent(runId));
    state.run=data.run;state.events=data.events||[];
    runs.value=runId;
    const next=await call("runs/"+encodeURIComponent(runId)+"/gate");
    state.gate=next.gate;renderGate();renderCases();renderHistory();
    message("Saved QA run selected. All result submissions create new immutable records.");
  }
  async function submitManual(testId,statusValue,notes,evidence){
    if(!state.run)throw new Error("Start or select a QA run first");
    if((statusValue==="Fail"||statusValue==="Blocked")&&!notes.trim())
      throw new Error("Failure and Blocked results require explanatory notes");
    const body={testId,status:statusValue,notes:notes.slice(0,MAX_NOTES),
      evidence:evidence.trim()?[{kind:"reference",reference:evidence.trim()}]:[],
      client_request_id:freshId()};
    const data=await call("runs/"+encodeURIComponent(state.run.runId)+"/results",
      {method:"POST",body:JSON.stringify(body)});
    await loadRun(state.run.runId);
    message("Saved "+statusValue+" for "+testId+" at "+data.event.atUtc+".");
  }
  async function runAutomated(testId){
    if(!state.run)throw new Error("Start or select a QA run first");
    message("Running bounded, read-only Worker health check…");
    const data=await call("runs/"+encodeURIComponent(state.run.runId)+"/execute/"+testId,
      {method:"POST",body:JSON.stringify({client_request_id:freshId()})});
    await loadRun(state.run.runId);
    message("Check recorded: "+data.event.payload.status+". An independent human must approve AI Pass results.");
  }
  async function approve(testId,executionId,decision){
    if(!state.run)throw new Error("Select a run first");
    const body={testId,executionId,decision,notes:"Reviewed the recorded check evidence.",
      client_request_id:freshId()};
    await call("runs/"+encodeURIComponent(state.run.runId)+"/approvals",
      {method:"POST",body:JSON.stringify(body)});
    await loadRun(state.run.runId);
    message("Independent review recorded.");
  }
  function renderCases(){
    cases.replaceChildren();
    if(!state.tests.length)return;
    const byCategory=new Map();
    for(const t of state.tests){
      if(!byCategory.has(t.category))byCategory.set(t.category,[]);
      byCategory.get(t.category).push(t);
    }
    for(const [group,tests] of byCategory){
      const section=el("section",null,"qa-case-group"),h=el("h3",group+" · "+tests.length+" tests");
      section.append(h);
      for(const t of tests){
        const card=el("details",null,"qa-case");
        const latest=lastEvent(t.id),summary=el("summary",t.id+" · "+t.title+" · "+t.severity+
          (latest?" · "+latest.payload.status:""));
        card.append(summary);
        const body=el("div",null,"qa-case-body");
        const prereq=el("p","Prerequisites: "+(t.prerequisites||[]).join("; "));
        const steps=el("ol");
        for(const step of t.steps||[])steps.append(el("li",step.instruction));
        const expected=el("p","Expected: "+(t.expectedResults||[]).join(" "));
        body.append(prereq,el("strong","Execution steps"),steps,expected);
        const label=el("label","Tester notes");const notes=el("textarea");
        notes.rows=3;notes.maxLength=MAX_NOTES;notes.placeholder="What happened? What did you observe?";
        label.append(notes);body.append(label);
        const evidenceLabel=el("label","Evidence link or reference (optional)");
        const evidence=el("input");evidence.maxLength=1000;evidence.placeholder="GitHub run, output ID or evidence URL";
        evidenceLabel.append(evidence);body.append(evidenceLabel);
        const actions=el("div",null,"qa-case-actions");
        for(const action of ["Pass","Fail","Blocked"]){
          const button=el("button",action,action==="Pass"?"qa-positive":"");
          button.type="button";button.disabled=!state.run;
          button.addEventListener("click",async()=>{
            button.disabled=true;
            try{await submitManual(t.id,action,notes.value,evidence.value)}
            catch(err){message(err.message,"error");button.disabled=false;}
          });
          actions.append(button);
        }
        if(t.id==="QA-DIAG-001"){
          const run=el("button","Run safe health check");
          run.type="button";run.disabled=!state.run;
          run.addEventListener("click",async()=>{
            run.disabled=true;
            try{await runAutomated(t.id);}catch(err){message(err.message,"error");run.disabled=false;}
          });
          actions.append(run);
          if(latest?.kind==="AutomatedObservation"&&latest.payload.status==="Pass"){
            const review=el("button","Independent approve");
            review.type="button";review.disabled=!state.run;
            review.addEventListener("click",async()=>{
              review.disabled=true;
              try{await approve(t.id,latest.payload.executionId,"Approved");}
              catch(err){message(err.message,"error");review.disabled=false;}
            });
            actions.append(review);
          }
        }
        body.append(actions);card.append(body);section.append(card);
      }
      cases.append(section);
    }
  }
  async function startRun(){
    const button=$("qaStartRun");button.disabled=true;
    try{
      const env=$("qaEnvironment").value;
      const data=await call("runs",{method:"POST",body:JSON.stringify({
        environment:env,client_request_id:state.pendingRunId||(state.pendingRunId=freshId())
      })});
      state.pendingRunId=null;state.run=data.run;state.events=[];await refreshRuns();await loadRun(data.run.runId);
    }catch(e){message(e.message,"error");}finally{button.disabled=false;}
  }
  async function initialize(){
    if(state.loading)return;state.loading=true;
    try{
      const catalogData=await call("catalog");
      state.tests=catalogData.tests||[];
      if(state.tests.length===0)throw new Error("No QA definitions available");
      nav.hidden=false;
      message(state.tests.length+" versioned QA cases loaded. Start a run to record evidence.");
      await refreshRuns();renderCases();renderGate();
    }catch(e){message(e.message,"error");}finally{state.loading=false;}
  }
  $("qaStartRun")?.addEventListener("click",startRun);
  $("qaRefresh")?.addEventListener("click",()=>initialize());
  runs?.addEventListener("change",async()=>{
    if(!runs.value)return;
    try{await loadRun(runs.value)}catch(e){message(e.message,"error");}
  });
  nav.addEventListener("click",()=>initialize());
  // Only expose the navigation after an authenticated admin catalog response.
  call("catalog").then(data=>{
    if(Array.isArray(data.tests)){nav.hidden=false;state.tests=data.tests;}
  }).catch(()=>{nav.hidden=true;});
})();
