import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
const begin=source.indexOf("export async function item4PipelineSetting(");
const end=source.indexOf("/*__STUDIO_WORKER_END:item4PipelineSetting__*/",begin);
assert.ok(begin>=0 && end>begin,"settings guard and Worker split marker must exist");

function readSetting({primary=null,secondary=null,studioSource="supabase",phase6Source="supabase"}={}){
  let archived=0,secondaryReads=0;
  const context={
    studioWriteSource:()=> studioSource,
    studioPhase6WriteSource:()=> phase6Source,
    studioSupabaseConfigured:()=>true,
    readSupabasePipelineSetting:async()=> primary,
    listSupabasePipelineSettingsByNames:async()=>{secondaryReads++;return secondary;},
    f:(record,key)=>record?.fields?.[key],
    listRecords:async()=>{archived++; throw Error("Airtable archive must not be touched");},
    HttpError:class HttpError extends Error{constructor(status,message){super(message);this.status=status;}},
  };
  const expression="("+source.slice(begin,end).trim().replace(/^export /,"")+")";
  return {fn:vm.runInNewContext(expression,context),stats:()=>({archived,secondaryReads})};
}
const setting=(value,name="STUDIO_VARIANT_DRIVE_FOLDER_ID")=>({
 id:"recTestSetting123",fields:{Setting_Name:name,Setting_Value:value}
});
test("variant Drive folder lookup uses primary Supabase setting without legacy reads",async()=>{
  const x=readSetting({primary:setting("driveFolder123")});
  assert.equal(await x.fn({},"STUDIO_VARIANT_DRIVE_FOLDER_ID"),"driveFolder123");
  assert.equal(x.stats().archived,0);
  assert.equal(x.stats().secondaryReads,0);
});
test("transient missing primary lookup uses bounded Supabase-only secondary read",async()=>{
  const x=readSetting({secondary:[setting("driveFolderRecovered")]});
  assert.equal(await x.fn({},"STUDIO_VARIANT_DRIVE_FOLDER_ID"),"driveFolderRecovered");
  assert.equal(x.stats().archived,0);
  assert.equal(x.stats().secondaryReads,1);
});
test("unverified folder fails closed as 503 instead of generic 500 or Airtable fallback",async()=>{
  const x=readSetting({secondary:[]});
  await assert.rejects(()=>x.fn({},"STUDIO_VARIANT_DRIVE_FOLDER_ID"),
    error=>error.status===503 && /Supabase/.test(error.message) && /No new frame jobs/.test(error.message));
  assert.equal(x.stats().archived,0);
  assert.equal(x.stats().secondaryReads,1);
});

test("Phase6-only Supabase authority still resolves the verified folder without Airtable",async()=>{
  const x=readSetting({primary:setting("driveFolderConfirmed"),
    studioSource:"airtable",phase6Source:"supabase"});
  assert.equal(await x.fn({},"STUDIO_VARIANT_DRIVE_FOLDER_ID"),"driveFolderConfirmed");
  assert.equal(x.stats().archived,0);
});
test("Phase6-only missing folder fails closed without returning to retired Airtable",async()=>{
  const x=readSetting({secondary:[],studioSource:"airtable",phase6Source:"supabase"});
  await assert.rejects(()=>x.fn({},"STUDIO_VARIANT_DRIVE_FOLDER_ID"),
    error=>error.status===503 && /Supabase/.test(error.message));
  assert.equal(x.stats().archived,0);
});
