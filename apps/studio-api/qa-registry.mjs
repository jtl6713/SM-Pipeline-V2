// QA registry: a closed set of read-only assertions with trusted, injected observers.
// Callers MUST enforce server-side Admin permissions and pass only server-created observers.
import { evaluateAssertion, SAFE_ASSERTIONS } from "./qa-test-core.mjs";
const allowed = new Set(Object.keys(SAFE_ASSERTIONS));
const OBSERVER_NAMES = Object.freeze({
  "QA-DIAG-001":"workerHealth",
  "QA-CAT-001":"catalogIntegrity",
  "QA-AT-001":"canonicalRun",
  "QA-SB-001":"mirrorParity",
  "QA-MAE-001":"maeDryRun"
});
export function planQaAssertion(testId,scope) {
  if(!allowed.has(testId)) throw Error("QA test is not registered");
  if(!scope || typeof scope !== "object" || scope.productionWrite===true || scope.publish===true)
    throw Error("Unsafe QA scope");
  if(testId==="QA-SB-001" && (!Array.isArray(scope.recordIds) || !scope.recordIds.length ||
      scope.recordIds.length>SAFE_ASSERTIONS[testId].maxObservations ||
      scope.recordIds.some(x=>typeof x!=="string" || !/^rec[A-Za-z0-9]{14}$/.test(x))))
    throw Error("Exact Airtable record allowlist required");
  if(testId==="QA-MAE-001" && scope.dryRun!==true) throw Error("MAE must be dry-run");
  return Object.freeze({testId,observer:OBSERVER_NAMES[testId],
    timeoutMs:SAFE_ASSERTIONS[testId].timeoutMs,
    maxObservations:SAFE_ASSERTIONS[testId].maxObservations,
    recordIds:testId==="QA-SB-001"?Object.freeze([...scope.recordIds]):Object.freeze([]),
    dryRun:testId==="QA-MAE-001"});
}
export async function executeQaAssertion({testId,scope,observers,now=()=>new Date()}) {
  const plan=planQaAssertion(testId,scope);
  const startedAtUtc=now().toISOString();
  if(!observers || typeof observers[plan.observer]!=="function")
    return {testId,status:"Blocked",reason:"Trusted diagnostic observer unavailable",startedAtUtc,finishedAtUtc:now().toISOString(),evidence:null};
  // AbortSignal timeout is passed to observers. Caller must also configure network timeouts
  // and ensure no observer has production-write credentials or publication capabilities.
  const controller=new AbortController();
  let timer;
  try {
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("QA diagnostic timeout"));},plan.timeoutMs);});
    const observation=await Promise.race([Promise.resolve().then(()=>observers[plan.observer]({plan,signal:controller.signal})),timeout]);
    const result=evaluateAssertion(testId,observation);
    return {testId,...result,startedAtUtc,finishedAtUtc:now().toISOString()};
  } catch (error) {
    return {testId,status:"Error",reason:"Trusted diagnostic failed: "+String(error?.message||"unknown").slice(0,120),
      startedAtUtc,finishedAtUtc:now().toISOString(),evidence:null};
  } finally {clearTimeout(timer);}
}
