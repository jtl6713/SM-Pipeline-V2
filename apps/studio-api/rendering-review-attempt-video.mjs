/** Authenticated, exact-output, read-only V2+ playback through Studio.
 * Google Drive's embedded /preview page may fail with HTTP 400 on iOS.
 * Stream only an independently verified finished attempt, not an arbitrary
 * Drive file supplied by a caller. The original output is never changed.
 */
const RECORD=/^rec[A-Za-z0-9]{14}$/;
const TOKEN=/^[A-Za-z0-9_-]{8,120}$/;
const FILE=/^[A-Za-z0-9_-]{20,}$/;
const fail=(status,message)=>{const e=new Error(message);e.status=status;throw e;};

export async function serveReviewAttemptVideo({
  request,env,url,authorization,loadWorkspace,listAttempts,readVideo,copyHeaders,
}){
  if(request.method!=="GET"&&request.method!=="HEAD")fail(405,"Read-only review preview");
  if(!authorization?.authenticated||!authorization?.authorized||
     authorization?.permissions?.outputs_review!==true)
    fail(403,"Rendering Review permission required");
  const match=/^\/api\/rendering-review\/outputs\/(rec[A-Za-z0-9]{14})\/attempts\/([A-Za-z0-9_-]{8,120})\/preview$/.exec(url.pathname);
  if(!match)fail(404,"Rendering Review preview not found");
  const [,outputId,attemptId]=match;
  if(!RECORD.test(outputId)||!TOKEN.test(attemptId)||
     outputId!==env?.RENDERING_REVIEW_EXACT_OUTPUT_ID)
    fail(403,"Not the selected Chicago pilot Reel");
  if(typeof loadWorkspace!=="function"||typeof listAttempts!=="function"||
     typeof readVideo!=="function"||typeof copyHeaders!=="function")
    fail(503,"Protected preview integration unavailable");
  const workspace=await loadWorkspace(outputId);
  if(workspace?.ok!==true||workspace?.publication_hold_verified!==true||
     workspace?.session?.review_hold?.active!==true||
     workspace?.session?.output_id!==outputId)
    fail(409,"Review ownership or publication hold not verified");
  const attempts=workspace.session.attempts;
  if(!Array.isArray(attempts))fail(409,"Review attempts unavailable");
  const attempt=attempts.find(a=>a?.id===attemptId);
  if(!attempt||Number(attempt.number)<2||
     attempt.status!=="ready_for_review"||!FILE.test(String(attempt.artifact_id||"")))
    fail(409,"Only completed replacement attempts are playable");
  // A saved session alone is not enough: check the exact durable Attempt row
  // and artifact ID again, even for an earlier completed V2 after V3 exists.
  const rows=await listAttempts(attemptId);
  if(!Array.isArray(rows)||rows.length!==1)fail(409,"Review attempt unavailable");
  const f=rows[0]?.fields||{};
  if(f.Attempt_ID!==attemptId||f.Output_Record_ID!==outputId||
     f.Session_ID!==workspace.session.id||
     Number(f.Attempt_Number)!==Number(attempt.number)||
     f.Attempt_Status!=="ready_for_review"||
     f.Artifact_File_ID!==attempt.artifact_id)
    fail(409,"Review attempt artifact identity changed");
  const fileId=attempt.artifact_id;
  const source="https://drive.google.com/file/d/"+fileId+"/view";
  const probe=request.method==="HEAD"
    ?new Request(request.url,{method:"GET",headers:{"Range":"bytes=0-0"}})
    :request;
  const upstream=await readVideo(fileId,source,probe,env);
  if(!upstream||![200,206].includes(upstream.status))
    fail(502,"Revised video stream unavailable");
  const type=String(upstream.headers.get("Content-Type")||"").toLowerCase();
  if(type&&!type.startsWith("video/")&&!type.startsWith("application/octet-stream")){
    try{await upstream.body?.cancel()}catch{}
    fail(502,"Revised artifact is not a playable video");
  }
  const headers=copyHeaders(upstream);
  headers.set("Cache-Control","private, no-store");
  headers.set("X-Studio-Preview-Source","rendering-review-owned-drive-attempt");
  if(request.method==="HEAD"){
    const range=upstream.headers.get("Content-Range")||"";
    const total=range.match(/\/(\d+)$/);
    if(total)headers.set("Content-Length",total[1]);
    headers.delete("Content-Range");
    try{await upstream.body?.cancel()}catch{}
    return new Response(null,{status:200,headers});
  }
  return new Response(upstream.body,{
    status:upstream.status===206?206:200,headers,
  });
}
