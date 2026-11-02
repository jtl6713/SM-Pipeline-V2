import test from "node:test";
import assert from "node:assert/strict";
import {requestedStillNames,prepareReviewLibraryStills}
  from "./rendering-review-library-prepare.mjs";

const OUT="rec4tZQSOVESkrSLc",ITEM="recAidgQoqMfsVnhc";
const REQ="recl2L1QNplRua3jm",CHI="recT2rbKX3MF7cVFU";
const A="recvW12bHmiJZQcqY",B="rec2l3fgUwYuY4GxD";
const DA="1uHk_-3H76ecXJapN_pop4nH0Mngq4fZG";
const DB="11cmeaZ5-7Fg6BB_AQjZ9mzhjn4laWemp";
const FOLDER="1UXVnEeky9FghOO-tYV5VkuJUk-Mkpaud";
const SESSION="rrsession_c18589a941c731f3785e70e3caef409527f72ef5";
const ATTEMPT="rrattempt_cb18c41001cc21c8d4c823f65d556936fe12e562b2599883";
const HOLD="held-correct-123456789";
function fixture(){
  const session={id:SESSION,output_id:OUT,version:13,
    current_attempt_id:ATTEMPT,profile_id:CHI,review_hold:{id:HOLD,active:true},
    state:"ready_for_review",active_job:null,
    attempts:[{id:ATTEMPT,status:"ready_for_review",number:2}],
    messages:[{role:"user",attempt_id:ATTEMPT,
      content:"Keep skyline\n- Adler Planetarium 3\n- Adler Planetarium 5"}]};
  const rows={
    [OUT]:{id:OUT,fields:{
      "Studio_Render_Review_Hold_Active":true,"Do_Not_Publish":true,
      "Studio_Render_Review_Session_ID":SESSION,
      "Studio_Render_Review_Hold_ID":HOLD,"Studio_Render_Review_Hold_Owner":SESSION,
      "Platform":"Instagram","Platform_Output_Type":"Instagram Reel",
      "Content_Item":[ITEM]}},
    [ITEM]:{id:ITEM,fields:{"Content_Profile":[CHI],"Production_Request":[REQ]}},
    [REQ]:{id:REQ,fields:{"Studio_Master_Assets_JSON":"[{}]"}},
    [A]:{id:A,fields:{"Asset Name":"Adler Planetarium 3",
      "Media_Class":"Image","Asset_Status":"Available",
      "Rights_Status":"Owned","Active":true,"Content_Profile":[CHI],
      "Google Drive File ID":DA,"MIME_Type":"image/jpeg","File_Size_Bytes":2945867}},
    [B]:{id:B,fields:{"Asset Name":"Adler Planetarium 5",
      "Media_Class":"Graphic","Asset_Status":"Available",
      "Rights_Status":"Owned","Active":true,"Content_Profile":[CHI],
      "Google Drive File ID":DB,"MIME_Type":"image/jpeg","File_Size_Bytes":752149}},
  };
  const queue=[],writes=[];
  const sample={id:"rec88888888888888",fields:{
    "Asset_Kind":"Platform Variant","Transfer_Status":"Ready",
    "Production_Request_Record_ID":REQ,"Target_Drive_Folder_ID":FOLDER,
    "Source_Drive_File_ID":"1sample_master123456789012345"}};
  const run=(override={})=>prepareReviewLibraryStills({
    output_id:OUT,expected_version:13,
    operations:{loadSession:async()=>session,
      readHold:async()=>({verified:true,active:true,id:HOLD,owner:SESSION})},
    readRecord:async(_,id)=>rows[id],
    readField:(row,key)=>row?.fields?.[key],
    listRecords:async(table,params)=>{
      if(table==="tblSITCujCsJTNcDe"){
        const hit=Object.values(rows).filter(x=>
          x.fields?.["Asset Name"]&&params.filterFormula.includes(
            x.fields["Asset Name"].toLowerCase()));
        return hit;
      }
      if(params.filterFormula.includes("Transfer_ID"))
        return queue.filter(x=>params.filterFormula.includes(x.fields.Transfer_ID));
      if(params.filterFormula.includes('Source_Drive_File_ID'))
        return [];
      return [sample];
    },
    createQueue:async fields=>{
      writes.push({table:"queue",fields});
      const row={id:"rec"+String(queue.length+1).padStart(14,"0"),fields};
      queue.push(row);return [row];
    },
    withLock:async(_,fn)=>fn(),
    ...override,
  });
  return {session,rows,queue,writes,run};
}
test("extract latest explicit user asset batch, not Producer guesses",()=>{
  assert.deepEqual(requestedStillNames([
    {role:"producer",attempt_id:ATTEMPT,content:"Adler Planetarium 99"},
    {role:"user",attempt_id:ATTEMPT,
      content:"- Adler Planetarium 3\n- Adler Planetarium 5"},
    {role:"producer",attempt_id:ATTEMPT,content:"Needs links"}
  ],ATTEMPT),["Adler Planetarium 3","Adler Planetarium 5"]);
});
test("explicit prep creates only unique versioned image and Graphic crop rows",async()=>{
  const f=fixture(),result=await f.run();
  assert.equal(result.created,2);
  assert.equal(result.render_queued,false);
  assert.equal(result.published,false);
  assert.deepEqual(f.writes.map(x=>x.table),["queue","queue"]);
  assert.deepEqual(f.writes.map(x=>x.fields.Source_Media_Asset),[[A],[B]]);
  assert.ok(f.writes.every(x=>x.fields.Target_Drive_Folder_ID===FOLDER));
  assert.ok(f.writes.every(x=>x.fields.Preview_Status==="Pending"));
  assert.deepEqual(f.rows[B].fields["Media_Class"],"Graphic");
  const second=await f.run();
  assert.equal(second.created,0);
  assert.equal(second.reused,2);
  assert.equal(f.writes.length,2);
});
test("hold or session version drift cannot stage anything",async()=>{
  for(const change of [{version:14},{state:"rendering"},
    {review_hold:{id:HOLD,active:false}},{active_job:{id:"active-job"}}]){
    const f=fixture();Object.assign(f.session,change);
    await assert.rejects(f.run(),/REVIEW_PREPARE_HOLD_OR_VERSION_CHANGED/);
    assert.equal(f.writes.length,0);
  }
});
test("wrong-profile Graphic, rights loss and unowned JPEG are not staged",async()=>{
  for(const patch of [{"Content_Profile":["rec99999999999999"]},
    {"Rights_Status":"Unknown"},{"MIME_Type":"application/pdf"},
    {"Do_Not_Use":true},{"Media_Class":"Video"}]){
    const f=fixture();Object.assign(f.rows[B].fields,patch);
    const result=await f.run();
    assert.equal(result.ok,false);
    assert.equal(result.created,1);
    assert.equal(result.blocked[0].name,"Adler Planetarium 5");
  }
});
test("preparation does not write when active hold was released",async()=>{
  const f=fixture();
  await assert.rejects(f.run({operations:{
    loadSession:async()=>f.session,
    readHold:async()=>({verified:true,active:false,id:HOLD,owner:SESSION})}
  }),/REVIEW_PREPARE_HOLD_OR_VERSION_CHANGED/);
  assert.equal(f.writes.length,0);
});
