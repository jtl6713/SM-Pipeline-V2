import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readUiReleaseContract } from "./ui-release-contract.mjs";

const dir=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(dir,"assets/exception-recovery.js"),"utf8");
const html=fs.readFileSync(path.join(dir,"index.html"),"utf8");
const app=fs.readFileSync(path.join(dir,"assets/app-item4-1008.js"),"utf8");

const match=source.match(/  const formatOverdueAge = minutes => \{([\s\S]*?)\n  \};/);
assert.ok(match,"Exception Recovery must include shared overdue presentation formatter");
const formatOverdueAge=Function("minutes",match[1]);

test("minutes are shown as elapsed hours and minutes, with exact requested wording",()=>{
 assert.equal(formatOverdueAge(157),"2h 37m overdue");
 assert.equal(formatOverdueAge(1787),"29h 47m overdue");
 assert.equal(formatOverdueAge(60),"1h 0m overdue");
 assert.equal(formatOverdueAge(59),"59m overdue");
 assert.equal(formatOverdueAge(0),"0m overdue");
});
test("malformed or unavailable elapsed times are not represented as overdue",()=>{
 for(const value of [null,undefined,"",NaN,Infinity,-1,-100]) {
   assert.equal(formatOverdueAge(value),null);
 }
 assert.equal(formatOverdueAge(60.9),"1h 0m overdue");
});
test("list and selected output detail use the same formatter",()=>{
 assert.match(source,/elem\("small",\(item\.held[\s\S]{0,250}formatOverdueAge\(item\.minutes_past_due\)/);
 assert.match(source,/detailField\(dl,"Overdue",formatOverdueAge\(item\.minutes_past_due\)\)/);
 assert.doesNotMatch(source,/minutes_past_due\+"m overdue"/);
});
test("Studio Pages UI version, core bundle ID and asset cache keys remain consistent",()=>{
 const release=readUiReleaseContract(html,app);
 assert.equal(release.version,"0.6.758");
 assert.equal(release.cacheKey,"0.6.758-exception-recovery");
 assert.equal(release.expectedBuildId,"item4-0.6.758-exception-recovery");
 assert.match(html,/exception-recovery\.js\?v=0\.6\.758-exception-recovery&age=hm-v1/);
});
