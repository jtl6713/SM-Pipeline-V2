// QA governance: pure, fail-closed controls. Persistence adapter must append to Airtable.
const statuses=new Set(["Pass","Fail","Blocked","Error","Needs Review"]);
export function requireQaPermission(actor, permission="qa:write"){
 if(!actor?.id || !Array.isArray(actor.permissions) || !actor.permissions.includes(permission)) throw Error("QA permission denied");
 return actor.id;
}
export function beginQaRun({actor,id,catalogRevision,deployment,environment,now=()=>new Date()}){
 requireQaPermission(actor);
 if(!id || !catalogRevision || !environment || !deployment || !["worker","ui","runner"].every(k=>typeof deployment[k]==="string"&&deployment[k])) throw Error("Missing run identity or deployment");
 return Object.freeze({runId:id,catalogRevision,deployment:{worker:deployment.worker,ui:deployment.ui,runner:deployment.runner},environment,createdBy:actor.id,createdAtUtc:now().toISOString(),status:"Open"});
}
export function appendQaEvent({actor,run,testId,operation,key,payload={},now=()=>new Date()}){
 requireQaPermission(actor);
 if(run?.status!=="Open") throw Error("Run is closed");
 if(typeof testId!=="string"||!testId || typeof key!=="string"||!/^[\w.:-]{8,128}$/.test(key)) throw Error("Invalid event identity");
 if(!["ManualResult","AutomatedObservation","HumanApproval","Waiver","Finalize"].includes(operation)) throw Error("Operation denied");
 if(operation==="Waiver") requireQaPermission(actor,"qa:waive");
 if(operation==="Finalize") requireQaPermission(actor,"qa:release");
 if(operation==="HumanApproval"&&payload.subjectActorId===actor.id) throw Error("Self approval denied");
 return Object.freeze({runId:run.runId,testId,kind:operation,idempotencyKey:key,actorId:actor.id,payload:structuredClone(payload),atUtc:now().toISOString(),writeAuthority:"Airtable",appendOnly:true});
}
export function qaReleaseGate(catalog,events,waivers=[]){
 const latest=new Map(),approvals=new Set(),now=Date.now();
 for(const x of events){
  if(x.kind==="HumanApproval"&&x.payload?.decision==="Approved") approvals.add(x.payload.executionId);
  if(["ManualResult","AutomatedObservation"].includes(x.kind)&&statuses.has(x.payload?.status)&&x.payload?.executionId) latest.set(x.testId,x.payload);
 }
 const failed=[],blocked=[],waived=[],passed=[];
 for(const d of catalog.filter(t=>t.enabled!==false)){
  const e=latest.get(d.id);
  const w=waivers.find(x=>x.testId===d.id&&x.authorized&&x.reason?.trim()&&Date.parse(x.expiresAtUtc)>now);
  if(w){waived.push(d.id);continue;}
  if(!e||["Blocked","Error","Needs Review"].includes(e.status)||(d.requiresHumanApproval&&!approvals.has(e.executionId))) blocked.push(d.id);
  else if(e.status==="Fail") failed.push(d.id);
  else passed.push(d.id);
 }
 return {ready:!failed.length&&!blocked.length&&!waived.length,decision:failed.length?"Reject":blocked.length?"Incomplete":waived.length?"Requires risk acceptance":"Ready",failed,blocked,waived,passed};
}
export function qaRegressions(previous,current){
 const baseline=new Map(previous.map(e=>[e.testId,e]));
 return current.filter(e=>baseline.get(e.testId)?.status==="Pass"&&e.status!=="Pass").map(e=>({testId:e.testId,from:baseline.get(e.testId).executionId,to:e.executionId,status:e.status}));
}
