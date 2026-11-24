import test from "node:test";
import assert from "node:assert/strict";
import {inspectFactoryNativeSlideInventory, readFactoryNativeSlideInventory} from "./supabase-pipeline-reads.mjs";
const p={airtable_record_id:"recg1e2fiwy8wnPpG",output_number:11137,selected_clip_count:2,render_status:"Native Photo Route",output_status:"Ready for Review",studio_output_type:"Multi-Image Post",do_not_publish:false};
const slide=i=>({current_order:i,deleted_from_carousel:false,fields:{"Platform Output":[p.airtable_record_id],PO_Output_ID:[p.output_number],"Final Image URL":"https://media.chicagoshining.com/studio/previews/test/slide"+i+".jpg"}});
test("gallery readiness fails closed for missing, partial, unavailable and wrong-owner inventory",()=>{
 assert.equal(inspectFactoryNativeSlideInventory(p,[]).verified,false);
 assert.equal(inspectFactoryNativeSlideInventory(p,[slide(1)]).verified,false);
 assert.equal(inspectFactoryNativeSlideInventory(p,null).verified,false);
 const foreign=slide(2);foreign.fields["Platform Output"]=["recForeignOutput00"];
 assert.equal(inspectFactoryNativeSlideInventory(p,[slide(1),foreign]).verified,false);
 const duplicate=slide(2);duplicate.fields["Final Image URL"]=slide(1).fields["Final Image URL"];
 assert.equal(inspectFactoryNativeSlideInventory(p,[slide(1),duplicate]).verified,false);
 assert.equal(inspectFactoryNativeSlideInventory(p,[slide(2),slide(1)]).verified,true);
});
test("bounded inventory read excludes video and held candidates, returns exact output status",async()=>{
 const calls=[];
 const result=await readFactoryNativeSlideInventory({},[p,{...p,airtable_record_id:"recOtherOutput001",studio_output_type:"Reel"},{...p,airtable_record_id:"recHeldOutput0001",do_not_publish:true}],{read:async path=>{calls.push(path);return [slide(1),slide(2)];}});
 assert.equal(calls.length,1);assert.match(calls[0],/carousel_slides/);
 assert.equal(result.size,1);assert.equal(result.get(p.airtable_record_id).verified,true);
 const unavailable=await readFactoryNativeSlideInventory({},[p],{read:async()=>{throw Error("timeout")}});
 assert.equal(unavailable.get(p.airtable_record_id).verified,false);
});
