import test from "node:test";
import assert from "node:assert/strict";
import {profileWatermarkPreflight} from "./factory-correction-branding-preflight.mjs";

const id=n=>"rec"+String(n).padStart(14,"0");
const profile=id(1),other=id(2);
const driveId="1WQyd5W1__HkaEkWyC38IMErW8702Rd4u";
const foreign="17z7jHA-GL6nlWICxWJPyne5OrZethcZY";
const url=file=>"https://drive.google.com/uc?export=download&id="+file;
const props=file=>JSON.stringify({watermarkUrl:url(file)});
const asset=(file=driveId,p=profile,name="City_watermark_small.png")=>({
  id:id(10),fields:{
    Content_Profile:[p], "Asset Name":name,
    Asset_Role:"Watermark",Asset_Status:"Available",Rights_Status:"Owned",
    Active:true, Do_Not_Use:false,MIME_Type:"image/png",
    "Google Drive File ID":file,
  },
});
const check=(mod={})=>profileWatermarkPreflight({
  profileId:profile,originalPropsJson:props(driveId),
  assets:[asset()],...mod,
});

test("accept exact owned active and rights-cleared city watermark catalog source",()=>{
  assert.deepEqual(check(),{supported:true,reason:null});
});
test("never accept missing, foreign, inactive, ambiguous or rights-unverified city branding",()=>{
  for(const value of [null,[],[asset(driveId,other)], [asset(foreign,profile)],
    [asset(),{...asset(foreign,profile),id:id(11)}],
    [{...asset(),fields:{...asset().fields,Active:false}}],
    [{...asset(),fields:{...asset().fields,Rights_Status:"Unknown"}}],
    [{...asset(),fields:{...asset().fields,MIME_Type:"image/jpeg"}}],
    Array.from({length:200},(_,i)=>asset(driveId,profile,"wm-"+i)),
  ])assert.equal(check({assets:value}).supported,false);
});
test("reject arbitrary URLs, fragments, duplicate file parameters, and city-swapped PNG IDs",()=>{
  for(const source of [url(foreign),"http://drive.google.com/uc?export=download&id="+driveId,
    url(driveId)+"#fragment",url(driveId)+"&foo=x",
    url(driveId)+"&id="+foreign,
    "https://drive.google.com/file/d/"+driveId+"/view",
    "https://example.com/uc?export=download&id="+driveId,
  ])assert.equal(check({originalPropsJson:JSON.stringify({watermarkUrl:source})}).supported,false);
});
test("never synthesize watermark eligibility when source props are absent",()=>{
  for(const json of ["","{}","not-json",null])
    assert.equal(check({originalPropsJson:json}).supported,false);
});
