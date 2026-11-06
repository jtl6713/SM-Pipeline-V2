// QA Test Center: deterministic, side-effect-free policy and assertion engine.
// No network calls, credentials, production mutations, or publishing capabilities.
export const RESULT_STATUSES = Object.freeze(["Pass","Fail","Blocked","Error","Needs Review"]);
export const SEVERITIES = Object.freeze(["Critical","High","Medium","Low"]);
export const SAFE_ASSERTIONS = Object.freeze({
  "QA-DIAG-001": { kind:"worker-health", readOnly:true, maxObservations:1, timeoutMs:5000 },
  "QA-CAT-001": { kind:"catalog-integrity", readOnly:true, maxObservations:1, timeoutMs:2000 },
  "QA-AT-001": { kind:"canonical-qa-run", readOnly:true, maxObservations:1, timeoutMs:5000 },
  "QA-SB-001": { kind:"mirror-parity", readOnly:true, maxObservations:25, timeoutMs:10000 },
  "QA-MAE-001": { kind:"mae-dry-run", readOnly:true, maxObservations:30, timeoutMs:5000 },
});
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const requiredString = (value,label,max=500) => {
  if(typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(label+" is required");
  return value.trim();
};
export function validateManualResult(value) {
  if(!isObject(value)) throw new TypeError("result must be an object");
  const testId=requiredString(value.testId,"testId",80);
  const status=requiredString(value.status,"status",20);
  if(!["Pass","Fail","Blocked"].includes(status)) throw new RangeError("unsupported manual result");
  const notes=typeof value.notes==="string"?value.notes.trim():"";
  if(notes.length>4000) throw new RangeError("notes too long");
  if((status==="Fail"||status==="Blocked")&&!notes) throw new TypeError("failure or block requires notes");
  if(value.evidence!==undefined && (!Array.isArray(value.evidence)||value.evidence.length>10)) throw new TypeError("evidence must be a bounded array");
  const evidence=(value.evidence||[]).map(entry=>{
    if(!isObject(entry)) throw new TypeError("invalid evidence");
    return {kind:requiredString(entry.kind,"evidence.kind",30), reference:requiredString(entry.reference,"evidence.reference",1000)};
  });
  return Object.freeze({testId,status,notes,evidence});
}
export function createExecutionRecord({runId,definition,submitted,identity,clock=()=>new Date(),id}) {
  const payload=validateManualResult(submitted);
  if(!isObject(definition)||definition.id!==payload.testId) throw new Error("test definition mismatch");
  if(!SEVERITIES.includes(definition.severity)) throw new Error("invalid test severity");
  const actor=requiredString(identity,"authenticated tester",200);
  const executionId=requiredString(id,"server execution id",100);
  const timestamp=clock();
  if(!(timestamp instanceof Date)||!Number.isFinite(timestamp.valueOf())) throw new Error("invalid trusted clock");
  return Object.freeze({executionId,runId:requiredString(runId,"run id",100),testId:payload.testId,catalogVersion:definition.version,severity:definition.severity,status:payload.status,notes:payload.notes,evidence:payload.evidence,tester:actor,completedAtUtc:timestamp.toISOString()});
}
export function evaluateAssertion(testId,observation) {
  const definition=SAFE_ASSERTIONS[testId];
  if(!definition) throw new RangeError("assertion not registered");
  if(!isObject(observation)) return {status:"Blocked",reason:"Missing trusted observation",evidence:null};
  if(observation.error || observation.timeout) return {status:"Error",reason:"Diagnostic failed",evidence:observation};
  if(definition.kind==="worker-health") {
    if(typeof observation.httpStatus!=="number"||!observation.workerVersion) return {status:"Blocked",reason:"Incomplete health observation",evidence:observation};
    return {status:observation.httpStatus===200?"Pass":"Fail",reason:"Observed Worker HTTP response and version",evidence:observation};
  }
  if(definition.kind==="catalog-integrity") {
    if(observation.source!=="versioned-catalog" || observation.totalTests<50 ||
       !Number.isInteger(observation.invalidCount) || !Number.isInteger(observation.uniqueIds) ||
       typeof observation.catalogVersion!=="string")
      return {status:"Blocked",reason:"Catalog integrity evidence is incomplete",evidence:observation};
    return {status:observation.invalidCount===0 && observation.uniqueIds===observation.totalTests?"Pass":"Fail",
      reason:"Validated versioned QA case schema and uniqueness",evidence:observation};
  }
  if(definition.kind==="canonical-qa-run") {
    if(observation.source!=="Airtable" || !observation.expectedRunId || !observation.recordId ||
       typeof observation.runId!=="string" || typeof observation.createdAtUtc!=="string")
      return {status:"Blocked",reason:"Canonical QA run evidence missing",evidence:observation};
    return {status:observation.runId===observation.expectedRunId?"Pass":"Fail",
      reason:"Observed exact QA run in canonical Airtable",evidence:observation};
  }
  if(definition.kind==="mirror-parity") {
    if(!Array.isArray(observation.comparisons)||!observation.comparisons.length||observation.comparisons.length>definition.maxObservations) return {status:"Blocked",reason:"Missing or out-of-budget comparisons",evidence:observation};
    if(observation.comparisons.some(x=>!isObject(x)||typeof x.matches!=="boolean")) return {status:"Blocked",reason:"Incomplete comparison evidence",evidence:observation};
    return {status:observation.comparisons.every(x=>x.matches)?"Pass":"Fail",reason:"Airtable canonical to Supabase mirror field parity",evidence:observation};
  }
  if(definition.kind==="mae-dry-run") {
    if(observation.dryRun!==true||observation.mutationCount!==0||typeof observation.ruleViolations!=="number") return {status:"Blocked",reason:"Dry run and zero-mutation proof required",evidence:observation};
    return {status:observation.ruleViolations===0?"Pass":"Fail",reason:"MAE bounded dry-run validation",evidence:observation};
  }
  return {status:"Blocked",reason:"Unimplemented assertion",evidence:observation};
}
export function releaseGate(definitions,executions,approvals=[]) {
  if(!Array.isArray(definitions)||!Array.isArray(executions)||!Array.isArray(approvals)) throw new TypeError("arrays required");
  const latest=new Map();
  for(const e of executions) if(e?.testId && RESULT_STATUSES.includes(e.status)) latest.set(e.testId,e);
  const failures=[],pending=[];
  for(const d of definitions.filter(x=>x.enabled!==false)) {
    const e=latest.get(d.id);
    const approved=approvals.some(a=>a.executionId===e?.executionId&&a.decision==="Approved"&&a.reviewer);
    if(!e||["Blocked","Error","Needs Review"].includes(e.status)||(d.requiresHumanApproval&&!approved)) pending.push(d.id);
    else if(e.status==="Fail") failures.push(d.id);
  }
  return Object.freeze({ready:failures.length===0&&pending.length===0,failures,pending,total:definitions.filter(x=>x.enabled!==false).length});
}
