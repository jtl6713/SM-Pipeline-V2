/**
 * User-initiated, zero-render staging of already-owned Asset Manager stills.
 * Creates at most twelve idempotent Item4 9:16 crop requests; never changes
 * V1/V2 manifests, a review attempt, an output, or publishing status.
 *
 * Source names come exclusively from the HELD session's saved human message,
 * never model prose or a client-supplied Drive URL.
 */
import {CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";
import {resolveReviewCatalogAssets,catalogToken} from "./rendering-review-catalog-assets.mjs";

const REC=/^rec[A-Za-z0-9]{14}$/;
const DRIVE=/^[A-Za-z0-9_-]{16,}$/;
const str=x=>String(x??"").trim();
const choice=x=>typeof x==="string"?x:str(x?.name);
const only=x=>Array.isArray(x)&&x.length===1?
  (typeof x[0]==="string"?x[0]:x[0]?.id):null;
const error=(code)=>{const e=new Error(code);e.code=code;e.status=409;throw e;};
const TABLE={items:"tblwzN9AXWvmKVKPs",requests:"tbl75nxNi6PMUjBQE",
  media:"tblSITCujCsJTNcDe",queue:"tblBZLXPd1p2NRWRK"};

export function requestedStillNames(messages,sourceAttempt){
  if(!Array.isArray(messages)||!sourceAttempt)return [];
  for(const m of [...messages].reverse().slice(0,32)){
    if(m?.role!=="user"||m.attempt_id!==sourceAttempt)continue;
    const text=str(m.content).slice(0,3000);
    const names=[],seen=new Set();
    for(const line of text.split(/\r?\n/)){
      const raw=line.replace(/^\s*[-*•]\s*/,"").trim();
      if(!/^[A-Za-z][A-Za-z0-9 &'().-]{3,100} \d{1,3}$/.test(raw))continue;
      if(/^(Please|Remove|Replace|Keep|Then|Include|Use) /i.test(raw))continue;
      const key=raw.toLowerCase();
      if(!seen.has(key)){seen.add(key);names.push(raw);}
    }
    if(names.length>=2&&names.length<=12)return names;
  }
  return [];
}
function sameQueue(row,fields,read){
  return Object.entries(fields).filter(([k])=>[
    "Transfer_ID","Production_Request_Record_ID","Source_Asset_ID",
    "Source_Drive_File_ID","Source_Size_Bytes","Source_Media_Asset",
    "Target_Drive_Folder_ID","Target_File_Name","Asset_Kind",
    "Aspect_Ratio","Variant_Style"
  ].includes(k)).every(([k,v])=>
    JSON.stringify(k==="Source_Media_Asset"?only(read(row,k)):choice(read(row,k)))===
    JSON.stringify(k==="Source_Media_Asset"?only(v):choice(v)));
}
async function sourceToken(requestId,mediaId,fileId){
  const bytes=await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode("review-crop-v1|"+requestId+"|"+mediaId+"|"+fileId));
  return Array.from(new Uint8Array(bytes)).slice(0,10)
    .map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function prepareReviewLibraryStills({
  output_id,expected_version,operations,readRecord,readField,listRecords,
  createQueue,withLock,now=()=>new Date(),
}={}){
  if(!REC.test(str(output_id))||!Number.isSafeInteger(expected_version)||
     expected_version<1||!operations?.loadSession||!operations?.readHold||
     ![readRecord,readField,listRecords,createQueue,withLock].every(x=>typeof x==="function"))
    error("REVIEW_PREPARE_ADAPTER_REQUIRED");
  return withLock(output_id,async()=>{
    const session=await operations.loadSession(output_id);
    const hold=await operations.readHold(output_id);
    if(!session||session.output_id!==output_id||
       session.version!==expected_version||
       session.profile_id!==CHICAGO_PROFILE_ID||
       !session.review_hold?.active||!hold?.verified||!hold?.active||
       hold.id!==session.review_hold.id||hold.owner!==session.id||
       session.active_job||
       !["ready_for_review","discussing","awaiting_assets","plan_ready","revision_failed"]
         .includes(session.state))
      error("REVIEW_PREPARE_HOLD_OR_VERSION_CHANGED");
    const current=(session.attempts||[]).find(x=>x.id===session.current_attempt_id);
    if(!current||current.status!=="ready_for_review")error("REVIEW_PREPARE_SOURCE_NOT_READY");
    const output=await readRecord("tblrlPeboBthkplH0",output_id);
    const f=(row,key)=>readField(row,key);
    if(output?.id!==output_id||
       f(output,"Studio_Render_Review_Hold_Active")!==true||
       f(output,"Do_Not_Publish")!==true||
       str(f(output,"Studio_Render_Review_Session_ID"))!==session.id||
       str(f(output,"Studio_Render_Review_Hold_ID"))!==hold.id||
       str(f(output,"Studio_Render_Review_Hold_Owner"))!==session.id||
       choice(f(output,"Platform"))!=="Instagram"||
       choice(f(output,"Platform_Output_Type"))!=="Instagram Reel"||
       f(output,"Published_At")||f(output,"Platform_Post_ID"))
      error("REVIEW_PREPARE_OUTPUT_INELIGIBLE");
    const itemId=only(f(output,"Content_Item"));
    if(!REC.test(str(itemId)))error("REVIEW_PREPARE_CONTENT_LINK");
    const item=await readRecord(TABLE.items,itemId);
    if(item?.id!==itemId||only(f(item,"Content_Profile"))!==CHICAGO_PROFILE_ID)
      error("REVIEW_PREPARE_CROSS_PROFILE");
    const requestId=only(f(item,"Production_Request"));
    if(!REC.test(str(requestId)))error("REVIEW_PREPARE_SOURCE_REQUEST");
    const request=await readRecord(TABLE.requests,requestId);
    if(request?.id!==requestId||!str(f(request,"Studio_Master_Assets_JSON")))
      error("REVIEW_PREPARE_REQUEST_UNAVAILABLE");
    const names=requestedStillNames(session.messages,session.current_attempt_id);
    if(names.length<2)error("REVIEW_PREPARE_NO_SAVED_PHOTO_SELECTION");

    // A folder from completed, canonical 9:16 variants for THIS request is
    // required; never use a user-selected folder or arbitrary Drive output.
    const anchors=await listRecords(TABLE.queue,{
      limit:80,filterFormula:'AND({Production_Request_Record_ID}="'+requestId+
        '",{Asset_Kind}="Platform Variant",{Transfer_Status}="Ready")',
      fields:["Production_Request_Record_ID","Asset_Kind","Transfer_Status",
        "Target_Drive_Folder_ID"],
    });
    const folders=[...new Set(anchors.filter(x=>
      str(f(x,"Production_Request_Record_ID"))===requestId&&
      choice(f(x,"Asset_Kind"))==="Platform Variant"&&
      choice(f(x,"Transfer_Status"))==="Ready")
      .map(x=>str(f(x,"Target_Drive_Folder_ID"))).filter(x=>DRIVE.test(x)))];
    if(folders.length!==1)error("REVIEW_PREPARE_AMBIGUOUS_DRIVE_DESTINATION");
    const folder=folders[0];

    let created=0,reused=0;
    const blocked=[],results=[];
    for(const name of names){
      const safe=name.replace(/\\/g,"\\\\").replace(/"/g,'\\"');
      const rows=await listRecords(TABLE.media,{limit:10,
        filterFormula:'LOWER({Asset Name}&"")="'+safe.toLowerCase()+'"',
        fields:["Asset Name","Media_Class","Content_Profile","Rights_Status",
          "Asset_Status","Active","Do_Not_Use","Google Drive File ID",
          "MIME_Type","File_Size_Bytes","File_Extension"],
      });
      // Exact, unambiguous Chicago match only. A Graphic is still a graphic,
      // not silently reclassified; its JPEG must decode during crop processing.
      const eligible=rows.filter(x=>str(f(x,"Asset Name"))===name&&
        only(f(x,"Content_Profile"))===CHICAGO_PROFILE_ID&&
        ["Image","Graphic"].includes(choice(f(x,"Media_Class")))&&
        choice(f(x,"Asset_Status"))==="Available"&&
        choice(f(x,"Rights_Status"))==="Owned"&&f(x,"Active")===true&&
        f(x,"Do_Not_Use")!==true&&
        choice(f(x,"MIME_Type"))==="image/jpeg"&&
        DRIVE.test(str(f(x,"Google Drive File ID")))&&
        Number.isSafeInteger(Number(f(x,"File_Size_Bytes")))&&
        Number(f(x,"File_Size_Bytes"))>=1024);
      if(rows.length!==1||eligible.length!==1){
        blocked.push({name,reason:"missing_ambiguous_or_ineligible"});continue;
      }
      const media=eligible[0],mediaId=media.id;
      const driveId=str(f(media,"Google Drive File ID"));
      const sourceSize=Number(f(media,"File_Size_Bytes"));
      const existingProof=await resolveReviewCatalogAssets({
        tokens:[catalogToken(mediaId)],mediaTable:TABLE.media,
        readRecord,readField,
        readVariants:ids=>listRecords(TABLE.queue,{
          limit:100,filterFormula:'{Source_Drive_File_ID}="'+ids[0]+'"',
          fields:["Source_Media_Asset","Source_Drive_File_ID","Source_Size_Bytes",
            "Source_Asset_ID","Production_Request_Record_ID","Aspect_Ratio",
            "Asset_Kind","Variant_Style","Transfer_Status","Preview_Status",
            "Drive_File_ID","Generated_Media_Asset","Preview_URL","Target_File_Name",
            "Completed_At"],
        }),
      });
      if(existingProof.receipts.length){
        reused++;results.push({name,kind:choice(f(media,"Media_Class")),
          state:"crop_ready",source_media_id:mediaId});continue;
      }
      const assetId=await sourceToken(requestId,mediaId,driveId);
      const transferId="ITEM4-VARIANT-fill-crop-v2-"+requestId+"-"+assetId+"-9x16";
      const filename=name.replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"")+
        "__9x16__fill-crop-v2.jpg";
      const fields={
        "Transfer_ID":transferId,"Production_Request_Record_ID":requestId,
        "Asset_Kind":"Platform Variant","Source_Asset_ID":assetId,
        "Source_Name":name,"Source_MIME_Type":"image/jpeg",
        "Source_Extension":"jpg","Source_Size_Bytes":sourceSize,
        "Source_Drive_File_ID":driveId,"Source_Media_Asset":[mediaId],
        "Aspect_Ratio":"9:16","Variant_Style":"center",
        "Target_Drive_Folder_ID":folder,"Target_File_Name":filename,
        "Transfer_Status":"Pending","Preview_Status":"Pending",
      };
      const previous=await listRecords(TABLE.queue,{
        limit:3,filterFormula:'{Transfer_ID}="'+transferId+'"',
        fields:Object.keys(fields),
      });
      if(previous.length){
        if(previous.length!==1||!sameQueue(previous[0],fields,f)){
          blocked.push({name,reason:"transfer_identity_conflict"});continue;
        }
        reused++;results.push({name,kind:choice(f(media,"Media_Class")),
          state:choice(f(previous[0],"Transfer_Status"))==="Ready"&&
            choice(f(previous[0],"Preview_Status"))==="Ready"?
            "verify_ready_crop":"crop_in_progress",
          source_media_id:mediaId});continue;
      }
      const createdRows=await createQueue(fields);
      if(!Array.isArray(createdRows)||createdRows.length!==1||
         !REC.test(str(createdRows[0].id)))
        error("REVIEW_PREPARE_CREATE_NOT_CONFIRMED");
      created++;
      results.push({name,kind:choice(f(media,"Media_Class")),
        state:"crop_queued",source_media_id:mediaId});
    }
    return {ok:blocked.length===0,render_queued:false,published:false,
      output_id,session_version:expected_version,
      request_id:requestId,created,reused,blocked,assets:results,
      prepared_at:now().toISOString(),all_crops_ready:blocked.length===0&&
        results.length===names.length&&results.every(x=>x.state==="crop_ready")};
  });
}
