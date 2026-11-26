import test from "node:test";
import assert from "node:assert/strict";
import { automaticEzMediaContext, automaticEzUploadAllowed, automaticEzAiTarget } from "./automatic-ez-intake.mjs";
import { dedicatedProductionRoute, verifyDedicatedProductionAccess } from "./dedicated-production-routes.mjs";
const id="recRequest0000001",ideaId="recIdea0000000001",profileId="recProfile0000001",orgId="recOrg00000000001",brandId="recBrand000000001";
const scope={organizationId:orgId,profiles:[{id:profileId,brandIds:[brandId]}]};
const owner={id:"owner",airtable_record_id:ideaId,content_profile_id:"profile",content_profiles:{id:"profile",airtable_record_id:profileId},production_source:"idea",production_mode:"automatic"};
const prefix="/api/automatic-ez/production-requests/"+id;
function fixture(kind) {
 const notes="origin=ez-wizard; ez-input="+kind+(kind==="mixed"?"; ez-ai=2":"");
 const idea={id:ideaId,fields:{Content_Profile:[profileId],Studio_Production_Mode:"automatic",Studio_Production_Source:"idea",Candidate_Status:"Generated",Studio_Photo_Wait_Status:"Not Needed",Production_Config_Notes:"[automatic-ez-intake.1] "+kind}};
 const draft={id,fields:{Request_Status:"Draft",Active:true,Idea_Candidate:[ideaId],Production_Notes:notes,Carousel_Slide_Count_Exact:3}};
 const row={id:"request",airtable_record_id:id,idea_candidate_id:owner.id,idea_candidates:owner,organization_id:"org",organizations:{id:"org",airtable_record_id:orgId},brand_id:"brand",brands:{id:"brand",airtable_record_id:brandId},request_status:"Draft",production_notes:notes,publish_status:{}};
 return {row,idea,draft};
}
test("only snapshot, raw media and bounded AI aliases are admitted",()=>{
 for(const [suffix,method] of [["item4","GET"],["assets","POST"],["generate-ai-masters","POST"]])
   assert.equal(dedicatedProductionRoute(prefix+"/"+suffix,method).allowed,true);
 for(const [suffix,method] of [["item4","POST"],["assets","GET"],["assets","DELETE"],["assets/upload-session","POST"],["plan","POST"],["promote","POST"],["outputs","PUT"],["variants","POST"]])
   assert.equal(dedicatedProductionRoute(prefix+"/"+suffix,method).allowed,false);
});
test("canonical request and Idea must agree with exact generated intake and operation",async()=>{
 const a=fixture("single-photo");
 const verify=(suffix,method,{row,idea,draft}=a)=>verifyDedicatedProductionAccess({route:dedicatedProductionRoute(prefix+"/"+suffix,method),scope,read:async()=>[row],loadIdea:async()=>idea,loadRequest:async()=>draft});
 assert.equal(await verify("assets","POST"),true);
 assert.equal(await verify("item4","GET"),true);
 assert.equal(await verify("generate-ai-masters","POST"),false);
 assert.equal(await verify("generate-ai-masters","POST",fixture("mixed")),true);
 assert.equal(await verify("assets","POST",fixture("single-ai")),false);
 for(const patch of [{Candidate_Status:"Approved"},{Studio_Production_Mode:"manual"},{Production_Config_Notes:""}])
   assert.equal(await verify("assets","POST",{...a,idea:{...a.idea,fields:{...a.idea.fields,...patch}}}),false);
 assert.equal(await verify("assets","POST",{...a,row:{...a.row,request_status:"Promoted"}}),false);
 assert.equal(await verify("assets","POST",{...a,draft:{...a.draft,fields:{...a.draft.fields,Active:false}}}),false);
 assert.equal(await verify("assets","POST",{...a,draft:{...a.draft,fields:{...a.draft.fields,Production_Notes:a.row.production_notes+"; az-auto-queue=1"}}}),false);
 assert.equal(automaticEzMediaContext(a.draft,a.idea).profileId,profileId);
});
test("uploads cannot change selected media kind or add a second single photo",()=>{
 assert.equal(automaticEzUploadAllowed("single-photo","single-photo",{photos:1}),true);
 assert.equal(automaticEzUploadAllowed("single-photo","single-photo",{photos:1,existing:1}),false);
 assert.equal(automaticEzUploadAllowed("multiple-photos","finished-video",{photos:1}),false);
 assert.equal(automaticEzUploadAllowed("multiple-photos","",{videos:1}),false);
 assert.equal(automaticEzUploadAllowed("video-clips","video-clips",{videos:2}),true);
 assert.equal(automaticEzUploadAllowed("video-clips","video-clips",{photos:1}),false);
 assert.equal(automaticEzUploadAllowed("photos-and-clips","photos-and-clips",{photos:1,videos:1}),true);
 assert.equal(automaticEzUploadAllowed("single-ai","",{photos:1}),false);
});
test("AI target and profile come from the saved draft; reset and additive generation are disallowed",()=>{
 const a=fixture("mixed");
 assert.equal(automaticEzAiTarget("mixed",a.draft,{content_profile_id:profileId,target_ai_count:2},profileId),2);
 for(const body of [{reset:true},{add_ai_count:2},{target_ai_count:3},{profile_id:"recOther000000001"},{publish_now:true}])
   assert.equal(automaticEzAiTarget("mixed",a.draft,body,profileId),null);
 assert.equal(automaticEzAiTarget("multiple-ai",fixture("multiple-ai").draft,{},profileId),3);
 assert.equal(automaticEzAiTarget("single-ai",fixture("single-ai").draft,{},profileId),1);
});
