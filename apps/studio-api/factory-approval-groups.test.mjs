import test from "node:test";
import assert from "node:assert/strict";
import {
  FACTORY_GROUP_PREFIX, factoryApprovalGroupPlan, factoryApprovalGroupBuild,
  factoryApprovalGroupEnqueue, factoryApprovalGroupRead, factoryApprovalGroupResume,
  factoryApprovalGroupStatus, factoryApprovalGroupRetryFailures,
} from "./factory-approval-groups.mjs";
import {factoryBatchRead, factoryBatchDrain, factoryBatchCounts} from "./factory-approval-queue.mjs";

class FakeR2 {
  constructor() {this.objects=new Map();this.version=0;this.rejectOnce=false;}
  async get(key) {
    const value=this.objects.get(key);
    return value?{etag:value.etag,text:async()=>JSON.stringify(value.data)}:null;
  }
  async put(key,body,{onlyIf}={}) {
    if (this.rejectOnce&&key.includes("/jobs/")) {
      this.rejectOnce=false;throw Error("controlled R2 interruption");
    }
    const prior=this.objects.get(key);
    if (onlyIf instanceof Headers&&onlyIf.get("If-None-Match")==="*"&&prior) return null;
    if (onlyIf?.etagMatches&&prior?.etag!==onlyIf.etagMatches) return null;
    const record={etag:String(++this.version),data:JSON.parse(body)};
    this.objects.set(key,record);return {etag:record.etag};
  }
  async list({prefix,limit=1000,cursor}) {
    const keys=[...this.objects.keys()].filter(x=>x.startsWith(prefix)).sort();
    const n=cursor?keys.findIndex(x=>x>cursor):0;
    const from=n<0?keys.length:n;
    const page=keys.slice(from,from+limit);
    return {objects:page.map(key=>({key})),truncated:from+limit<keys.length,
      cursor:from+limit<keys.length?page.at(-1):undefined};
  }
}
const chi="recT2rbKX3MF7cVFU";
const nyc="recgtK8Z7eNADNtVy";
const mia="recpNlNn6U6eq0M9r";
const outputs=[
  {id:"recTestA111111111",profile_id:chi,output_id:7001,platform:"Instagram",format:"Reel"},
  {id:"recTestB222222222",profile_id:nyc,output_id:7002,platform:"TikTok",format:"Video Draft"},
  {id:"recTestC333333333",profile_id:chi,output_id:7003,platform:"Instagram",format:"Story"},
  {id:"recTestD444444444",profile_id:mia,output_id:7004,platform:"YouTube",format:"Short"},
];
const opts={requestId:"global_group_integration_001",records:outputs,note:"synthetic only"};
const count=(store,prefix)=>[...store.objects.keys()].filter(k=>k.startsWith(prefix)).length;

test("mixed profile plan deduplicates overlapping selections and preserves profile scopes",()=>{
  const plan=factoryApprovalGroupPlan({...opts,records:[...outputs,outputs[0],outputs[2]]});
  assert.equal(plan.records.length,4);
  assert.equal(plan.children.length,3);
  assert.deepEqual(plan.children.map(x=>x.profile_id),[chi,nyc,mia].sort((a,b)=>a.localeCompare(b)));
  assert.deepEqual(plan.children.find(x=>x.profile_id===chi).items.map(x=>x.id),
    [outputs[0].id,outputs[2].id]);
  const builder=factoryApprovalGroupBuild({...opts,records:outputs});
  return builder.then(group=>{
    assert.equal(group.schema,"studio.factory-approval-group.1");
    assert.equal(group.children.length,3);
    assert.equal(new Set(group.children.map(x=>x.request_id)).size,3);
    assert.ok(group.children.every(x=>x.request_id.length<=128));
  });
});
test("rejects wrong identities, scope drift, and backend count overflow",()=>{
  for(const value of [
    {...opts,requestId:"bad"},
    {...opts,records:[]},
    {...opts,records:[{id:"not-record",profile_id:chi}]},
    {...opts,records:[{id:outputs[0].id,profile_id:"Chicago"}]},
    {...opts,records:[outputs[0],{...outputs[0],profile_id:nyc}]},
    {...opts,maxTotal:3},
    {...opts,maxPerProfile:1},
    {...opts,maxTotal:101},
  ]) assert.throws(()=>factoryApprovalGroupPlan(value));
});
test("one global submission creates exactly one durable parent and three children",async()=>{
  const bucket=new FakeR2();
  const first=await factoryApprovalGroupEnqueue(bucket,opts);
  assert.equal(first.already_submitted,false);
  assert.equal(first.total,4);
  assert.equal(first.children.length,3);
  assert.equal(first.pending_count,4);
  assert.equal(count(bucket,FACTORY_GROUP_PREFIX+"/"),1);
  assert.equal(count(bucket,"studio/state/factory-approvals/v2/jobs/"),3);
  const second=await factoryApprovalGroupEnqueue(bucket,{
    ...opts,records:[outputs[3],outputs[0],outputs[2],outputs[1],outputs[0]],
  });
  assert.equal(second.already_submitted,true);
  assert.equal(count(bucket,"studio/state/factory-approvals/v2/jobs/"),3);
  assert.equal(second.children.find(x=>x.profile_id===chi).total,2);
  await assert.rejects(()=>factoryApprovalGroupEnqueue(bucket,{
    ...opts,records:outputs.slice(0,3),
  }),/already bound/);
});
test("crash after persisting parent is safely recoverable without browser payload",async()=>{
  const bucket=new FakeR2();
  bucket.rejectOnce=true;
  await assert.rejects(()=>factoryApprovalGroupEnqueue(bucket,opts),/controlled R2 interruption/);
  const stored=await factoryApprovalGroupRead(bucket,opts.requestId);
  assert.ok(stored);
  assert.equal(stored.status,"enqueuing");
  assert.equal(count(bucket,"studio/state/factory-approvals/v2/jobs/"),0);
  const recovered=await factoryApprovalGroupResume(bucket,opts.requestId);
  assert.equal(recovered.total,4);
  assert.equal(recovered.children.length,3);
  assert.equal(count(bucket,"studio/state/factory-approvals/v2/jobs/"),3);
  await factoryApprovalGroupResume(bucket,opts.requestId);
  assert.equal(count(bucket,"studio/state/factory-approvals/v2/jobs/"),3);
});
test("independent profile child drains roll up partial success then only retry failures",async()=>{
  const bucket=new FakeR2();
  await factoryApprovalGroupEnqueue(bucket,opts);
  const group=await factoryApprovalGroupRead(bucket,opts.requestId);
  let commits=0;
  const seen=new Set();
  for(const child of group.children) {
    await factoryBatchDrain(bucket,{
      profileId:child.profile_id,requestId:child.request_id,maxItems:10,
      approve:async id=>{
        if(id===outputs[3].id) throw Object.assign(Error("Invalid synthetic media"),{status:409});
        if(seen.has(id)) return {already_approved:true};
        seen.add(id);commits++;return {id};
      },
    });
  }
  const status=await factoryApprovalGroupStatus(bucket,opts.requestId);
  assert.equal(status.total,4);
  assert.equal(status.approved_count,3);
  assert.equal(status.failed_count,1);
  assert.equal(status.pending_count,0);
  assert.equal(status.status,"completed");
  assert.equal(status.can_retry,true);
  const retried=await factoryApprovalGroupRetryFailures(bucket,opts.requestId);
  assert.equal(retried.failed_count,0);
  assert.equal(retried.pending_count,1);
  assert.equal(retried.approved_count,3);
  for(const child of group.children) {
    const job=await factoryBatchRead(bucket,child.profile_id,child.request_id);
    if(child.profile_id===mia) {
      assert.equal(factoryBatchCounts(job).pending_count,1);
      await factoryBatchDrain(bucket,{
        profileId:child.profile_id,requestId:child.request_id,
        approve:async()=>{commits++;return {id:outputs[3].id};},
      });
    } else assert.equal(factoryBatchCounts(job).approved_count,child.records.length);
  }
  const final=await factoryApprovalGroupStatus(bucket,opts.requestId);
  assert.equal(final.approved_count,4);
  assert.equal(final.pending_count,0);
  assert.equal(final.failed_count,0);
  assert.equal(final.can_retry,false);
  assert.equal(commits,4);
  await assert.rejects(()=>factoryApprovalGroupRetryFailures(bucket,opts.requestId),/No terminal failed/);
});
test("parent grouping module is dormant: production route does not call it",async()=>{
  const {readStudioWorkerSource}=await import("./worker-source-reader.mjs");
  const worker=readStudioWorkerSource();
  assert.doesNotMatch(worker,/factoryApprovalGroupEnqueue|factoryApprovalGroupResume/);
});
