/**
 * Explicit Script a Short authoring approval, not an ordinary Production
 * editor or publishing approval. Adapters must be canonical and tenant-scoped.
 * The caller holds the existing exact Idea lock and uses the existing durable
 * ready-production queue; this creates no independent producer.
 */
import { productionModeCaptureEnabled } from "./production-mode-capture.mjs";
import { productionModeRoutingEnabled } from "./manual-production-list.mjs";
import { editorGuardEnabled } from "./production-editor-boundary.mjs";
export function storyFirstAutomaticHandoffEnabled(env) {
  return productionModeCaptureEnabled(env)&&productionModeRoutingEnabled(env)&&
    editorGuardEnabled(env)&&env?.STUDIO_STORYBOARD_AUTO_HANDOFF==="true";
}
const val=(row,k)=>row?.fields?.[k];
const rec=id=>/^rec[A-Za-z0-9]{14}$/.test(String(id||""));
const ownerMatches=(request,idea)=>rec(request?.id)&&Array.isArray(val(request,"Idea_Candidate"))&&
  val(request,"Idea_Candidate").length===1&&val(request,"Idea_Candidate")[0]===idea.id;
const marker="[story-first-production.1] ";
const approvedMarker="story-first-auto-approved=1";
export function approvedStoryHandoffNotes(notes) {
  const raw=String(notes||"");
  const lines=raw.split(/\r?\n/);
  const exact=lines.filter(line=>line.startsWith(marker));
  if(exact.length!==1)throw new Error("Exact approved storyboard directive is missing or ambiguous");
  try {const value=JSON.parse(exact[0].slice(marker.length));if(!Array.isArray(value.scenes)||!value.scenes.length)throw Error();}
  catch {throw new Error("Exact approved storyboard directive is invalid");}
  const kept=lines.filter(line=>!["origin=prepare-to-review","ez-photo-wait=off",approvedMarker].includes(line.trim()));
  const next=[...kept.filter(Boolean),"origin=prepare-to-review","ez-photo-wait=off",approvedMarker].join("\n");
  if(next.length>10000)throw new Error("Approved storyboard and routing metadata exceed the saved note limit");
  return next;
}
export function hasStoryHandoffApproval(request) {
  return String(val(request,"Production_Notes")||"").split(/\r?\n/).some(line=>line.trim()===approvedMarker);
}
export async function queueApprovedStoryFirst({idea,verifyStory,listRequests,loadRequest,createDraft,
    verifyDraft,commitRequestApproval,commitIdeaAcceptance,enqueue,readJob}) {
  if(!rec(idea?.id)||val(idea,"Studio_Production_Mode")!=="automatic"||
      val(idea,"Studio_Production_Source")!=="script_a_short")throw new Error("Canonical Automatic Script a Short Idea required");
  const state=String(val(idea,"Candidate_Status")||"");
  if(state==="Promoted"||val(idea,"Promoted_Content_Record_ID")||
      (Array.isArray(val(idea,"Content Items"))&&val(idea,"Content Items").length))
    return {already_promoted:true,queued:false,idea_id:idea.id,publishing:false};
  if(!["Generated","Sent for Review","Approved"].includes(state)||val(idea,"Test_Run_ID"))
    throw new Error("Storyboard Idea is not eligible for automatic handoff");
  // Validate actual selected scenes, profile, rights and canonical source before
  // any create/write. The caller must not supply user-requested media IDs.
  const approved=await verifyStory(idea);
  if(!approved?.story||!Array.isArray(approved.ids)||!approved.ids.length)
    throw new Error("Complete the saved storyboard before starting Production");
  const existing=await listRequests(idea.id);
  if(!Array.isArray(existing)||existing.length>1)
    throw new Error("Existing Production Request identity needs reconciliation");
  let draft=existing.length?await loadRequest(existing[0].id):null;
  if(existing.length&&!ownerMatches(draft,idea))throw new Error("Existing Production Request owner mismatch");
  const prior=await readJob(idea.id);
  if(draft&&(hasStoryHandoffApproval(draft)||String(val(draft,"Request_Status"))==="Submitted"||prior)) {
    // A retry cannot overwrite an active/previously accepted storyboard.
    if(!hasStoryHandoffApproval(draft))throw new Error("Existing Production job must be reconciled before storyboard handoff");
    if(state!=="Approved") {
      const accepted=await commitIdeaAcceptance(idea,approved);
      if(accepted?.id!==idea.id||val(accepted,"Candidate_Status")!=="Approved")
        throw new Error("Storyboard Idea acceptance could not be verified");
    }
    const job=prior||await enqueue(idea.id,approved.story.profile_id);
    return {already_accepted:true,queued:Boolean(job),idea_id:idea.id,production_request_id:draft.id,
      job_status:job?.status||null,publishing:false};
  }
  if(prior)throw new Error("Existing durable job has no verified request; reconcile before retrying");
  if(!draft)draft=await createDraft(idea,approved);
  if(!ownerMatches(draft,idea)||!["Draft","Ready"].includes(String(val(draft,"Request_Status"))))
    throw new Error("Storyboard draft owner or status changed");
  draft=await verifyDraft(draft,approved);
  if(!ownerMatches(draft,idea))throw new Error("Verified storyboard draft owner changed");
  const notes=approvedStoryHandoffNotes(val(draft,"Production_Notes"));
  // Commit exact marker only after all actual selected scene media were saved.
  // Do not approve scheduling or publishing.
  const saved=await commitRequestApproval(draft,notes);
  if(!ownerMatches(saved,idea)||val(saved,"Production_Notes")!==notes||!hasStoryHandoffApproval(saved))
    throw new Error("Storyboard approval receipt could not be verified");
  const accepted=await commitIdeaAcceptance(idea,approved);
  if(accepted?.id!==idea.id||val(accepted,"Candidate_Status")!=="Approved")
    throw new Error("Storyboard Idea acceptance could not be verified");
  const job=await enqueue(idea.id,approved.story.profile_id);
  if(!job)throw new Error("Storyboard handoff saved but durable queue needs reconciliation");
  return {queued:true,idea_id:idea.id,production_request_id:saved.id,
    job_status:job.status||null,publishing:false,requires_factory_approval:true};
}
