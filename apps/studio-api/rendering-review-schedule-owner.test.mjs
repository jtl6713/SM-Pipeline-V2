import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRenderingReviewAtomicScheduleHooks} from './rendering-review-schedule-owner.mjs';
import {CHICAGO_PROFILE_ID} from './rendering-review-policy.mjs';

const id='recA1B2C3D4E5F6G7';
const item='recC1B2C3D4E5F6G7';
const owner='session-12345678';
const hold='rrhold-12345678';
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=(fn,code)=>assert.rejects(fn,e=>e.code===code);
function fixture({enabled=true,gate=true}={}){
  const output={id,fields:{
    Content_Item:[item],Platform:'Instagram',Platform_Output_Type:'Instagram Reel',
    Content_Profile:['Chicago (display only)'],Render_Status:'Rendered',
    Final_File_ID:'file-12345678',Do_Not_Publish:true,
    Studio_Render_Review_Hold_Active:true,
    Studio_Render_Review_Hold_ID:hold,
    Studio_Render_Review_Hold_Owner:owner,
    Studio_Render_Review_Session_ID:owner,
    Scheduled_Post_Date:'2026-12-16T17:30:00.000Z',
    Output_Status:'Approved for Publishing',Review_Status:'Approved',
    Publish_Status:'Ready to Schedule',
  }};
  const content={id:item,fields:{Content_Profile:[CHICAGO_PROFILE_ID]}};
  const env={AIRTABLE_OUTPUT_TABLE_ID:'outputs',STUDIO_SCHEDULE_RESERVATIONS:{},
    STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED:enabled?'true':'false',
    STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST:CHICAGO_PROFILE_ID+'::instagram'};
  const calls=[];
  let patches=0,mirror=0;
  const readOutput=async record=>{assert.equal(record,id);return clone(output);};
  const readContentItem=async record=>{assert.equal(record,item);return clone(content);};
  const writeVacateUnderLane=async({output_id,fields,review_hold_id,review_owner})=>{
    assert.equal(output_id,id);
    assert.equal(review_hold_id,hold);
    assert.equal(review_owner,owner);
    calls.push('patch');patches++;
    Object.assign(output.fields,fields);
    return clone(output);
  };
  const scheduleTransaction=async(_env,args,cb)=>{
    calls.push('atomic-lane');
    assert.equal(args.platform_output_record_id,id);
    assert.equal(args.content_profile_id,CHICAGO_PROFILE_ID);
    assert.equal(args.platform,'Instagram');
    const plan=await cb.plan();
    assert.equal(plan.action,'vacate');
    assert.equal(plan.previousIso,'2026-12-16T17:30:00.000Z');
    calls.push('write');
    await cb.write(plan,{signal:new AbortController().signal});
    calls.push('verify');
    assert.equal(await cb.verify(),'');
    calls.push('after-commit');
    await cb.afterCommit();
    return {atomic_schedule:true,value:{ok:true}};
  };
  const hooks=makeRenderingReviewAtomicScheduleHooks({
    env,readOutput,readContentItem,writeVacateUnderLane,mutationGate:gate,scheduleTransaction,
    postCommit:async({reason,output:row})=>{
      assert.equal(reason,'rendering-review-vacate');
      assert.equal(row.id,id);mirror++;
    },
  });
  return {output,content,env,hooks,calls,get patches(){return patches},get mirror(){return mirror}};
}
const scope=()=>({output_id:id,profile_id:CHICAGO_PROFILE_ID,
  platform:'Instagram',output_type:'Instagram Reel',review_owner:owner});
const owned=()=>({output_id:id,review_hold_id:hold,review_owner:owner});

test('default-off gate denies readiness and every write',async()=>{
  const f=fixture({gate:false});
  assert.equal(await f.hooks.scheduleRevocationReady(scope()),false);
  await fail(()=>f.hooks.revokeScheduleUnderHold(owned()),'REVIEW_SCHEDULE_DISABLED');
  assert.equal(f.patches,0);
});
test('missing atomic Chicago lane denies readiness and every write',async()=>{
  const f=fixture({enabled:false});
  assert.equal(await f.hooks.scheduleRevocationReady(scope()),false);
  await fail(()=>f.hooks.revokeScheduleUnderHold(owned()),'REVIEW_SCHEDULE_DISABLED');
  assert.equal(f.patches,0);
});
test('only exact trusted Chicago Reel identity passes schedule readiness',async()=>{
  const f=fixture();
  assert.equal(await f.hooks.scheduleRevocationReady(scope()),true);
  for(const patch of [{profile_id:'recZ1B2C3D4E5F6G7'},
      {platform:'Facebook'},{output_type:'Instagram Story'},
      {review_owner:''},{output_id:'not-a-record'}]){
    assert.equal(await f.hooks.scheduleRevocationReady({...scope(),...patch}),false);
  }
  assert.equal(f.patches,0);
});
test('atomic vacate rechecks hold, clears schedule and stale approval, then mirrors',async()=>{
  const f=fixture();
  const result=await f.hooks.revokeScheduleUnderHold(owned());
  assert.equal(result.atomic_schedule,true);
  assert.equal(f.patches,1);
  assert.equal(f.mirror,1);
  assert.deepEqual(f.calls,['atomic-lane','write','patch','verify','after-commit']);
  assert.equal(f.output.fields.Scheduled_Post_Date,null);
  assert.equal(f.output.fields.Studio_Scheduled_At,null);
  assert.equal(f.output.fields.YouTube_Scheduled_Publish_At,null);
  assert.equal(f.output.fields.Review_Status,'Review Sent');
  assert.equal(f.output.fields.Output_Status,'Ready for Review');
  assert.equal(f.output.fields.Publish_Status,'Not Ready');
  assert.equal(f.output.fields.Studio_Render_Review_Hold_ID,hold);
  assert.equal(f.output.fields.Do_Not_Publish,true);
});
test('retained review hold checkbox alone is not enough: exact owner required',async()=>{
  for(const change of [{Studio_Render_Review_Hold_ID:'old-hold'},
    {Studio_Render_Review_Hold_Owner:'somebody-else'},
    {Studio_Render_Review_Session_ID:'somebody-else'},
    {Studio_Render_Review_Hold_Active:false},{Do_Not_Publish:false}]){
    const f=fixture();Object.assign(f.output.fields,change);
    await fail(()=>f.hooks.revokeScheduleUnderHold(owned()),'REVIEW_SCHEDULE_HOLD_LOST');
    assert.equal(f.patches,0);
  }
});
test('linked Content Item authoritative profile excludes other cities despite spoofed output lookup',async()=>{
  const f=fixture();
  f.output.fields.Content_Profile=[CHICAGO_PROFILE_ID];
  f.content.fields.Content_Profile=['recZ1B2C3D4E5F6G7'];
  await fail(()=>f.hooks.revokeScheduleUnderHold(owned()),'REVIEW_SCHEDULE_PROFILE_MISMATCH');
  assert.equal(f.patches,0);
});
test('existing remote media container or dispatch start prevents vacate',async()=>{
  for(const patch of [{Platform_Post_ID:'ig-post-123'},
      {Platform_Media_ID:'ig-container-123'}, {Publish_Started_At:'2026-10-28T11:00:00Z'},
      {Publish_Locked_At:'2026-10-28T11:00:00Z'},
      {Publish_Locked_By:'AP1-IG-owner'},
      {Publish_Status:'Publishing'}]){
    const f=fixture();Object.assign(f.output.fields,patch);
    await fail(()=>f.hooks.revokeScheduleUnderHold(owned()),'REVIEW_SCHEDULE_DISPATCH_STARTED');
    assert.equal(f.patches,0);
  }
});
test('changed original schedule under the lane refuses PATCH and preserves hold',async()=>{
  const f=fixture();
  // Transport mutation is independent from the scheduled owner; re-reads
  // inside write must catch it even if the outer output snapshot passed.
  const build=makeRenderingReviewAtomicScheduleHooks({
    env:f.env,mutationGate:true,
    readOutput:async()=>clone(f.output),
    readContentItem:async()=>clone(f.content),
    writeVacateUnderLane:async()=>{throw Error('should not write');},
    postCommit:async()=>{},
    scheduleTransaction:async(_env,args,cb)=>{
      const plan=await cb.plan();
      f.output.fields.Scheduled_Post_Date='changed';
      return cb.write(plan,{});
    },
  });
  await fail(()=>build.revokeScheduleUnderHold(owned()),'REVIEW_SCHEDULE_CHANGED');
});
test('legacy fallback cannot vacate a review schedule',async()=>{
  const f=fixture();
  const hooks=makeRenderingReviewAtomicScheduleHooks({
    env:f.env,mutationGate:true,
    readOutput:async()=>clone(f.output),
    readContentItem:async()=>clone(f.content),
    writeVacateUnderLane:async()=>{throw Error('legacy writer must never run');},
    postCommit:async()=>{},
    scheduleTransaction:async(_env,_args,cb)=>cb.legacy(),
  });
  await fail(()=>hooks.revokeScheduleUnderHold(owned()),'REVIEW_SCHEDULE_LEGACY_DENIED');
  assert.equal(f.patches,0);
});

test('authoritative NYC Facebook lane vacates without touching the Chicago reservation lane',async()=>{
  const f=fixture();
  const nyc='recNYC12345678901';
  f.content.fields.Content_Profile=[nyc];
  f.output.fields.Platform='Facebook';
  f.output.fields.Platform_Output_Type='Facebook Reel';
  f.env.STUDIO_SCHEDULE_RESERVATION_LANE_ALLOWLIST=nyc+'::facebook';
  const argsSeen=[];
  const hooks=makeRenderingReviewAtomicScheduleHooks({
    env:f.env,mutationGate:true,
    readOutput:async()=>clone(f.output),readContentItem:async()=>clone(f.content),
    writeVacateUnderLane:async({fields})=>{Object.assign(f.output.fields,fields);},
    postCommit:async()=>{},
    scheduleTransaction:async(_env,args,ops)=>{
      argsSeen.push(args);
      const p=await ops.plan();
      await ops.write(p,{signal:new AbortController().signal});
      await ops.verify();
      await ops.afterCommit();
      return {atomic_schedule:true};
    },
  });
  const requested={...scope(),profile_id:nyc,platform:'Facebook',output_type:'Facebook Reel'};
  assert.equal(await hooks.scheduleRevocationReady(requested),true);
  assert.equal(await hooks.scheduleRevocationReady({...requested,profile_id:CHICAGO_PROFILE_ID}),false);
  assert.equal(await hooks.scheduleRevocationReady({...requested,output_type:'Facebook Story'}),false);
  const result=await hooks.revokeScheduleUnderHold(owned());
  assert.equal(result.atomic_schedule,true);
  assert.deepEqual(argsSeen.map(x=>[x.content_profile_id,x.platform,x.output_type]),
    [[nyc,'Facebook','Facebook Reel']]);
  assert.equal(f.output.fields.Scheduled_Post_Date,null);
  assert.equal(f.output.fields.Studio_Render_Review_Hold_Active,true);
});
test('unconfigured profile-platform lane never vacates a selected output',async()=>{
  const f=fixture();
  f.output.fields.Platform='TikTok';
  f.output.fields.Platform_Output_Type='TikTok Video';
  assert.equal(await f.hooks.scheduleRevocationReady({...scope(),platform:'TikTok',output_type:'TikTok Video'}),false);
  await fail(()=>f.hooks.revokeScheduleUnderHold(owned()),'REVIEW_SCHEDULE_PROFILE_MISMATCH');
  assert.equal(f.patches,0);
});
