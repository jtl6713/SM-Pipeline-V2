import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("./assets/new-profile.js",import.meta.url),"utf8");

test("Studio exposes New Profile onboarding",()=>{
 assert.match(html,/data-page="new-profile"/);
 assert.match(html,/id="page-new-profile"/);
 assert.match(html,/Create profile/);
 assert.match(html,/I already have it/);
 assert.match(html,/Create a new account|Create a new channel|Create a new Page/);
 assert.match(html,/Skip for now/);
 assert.match(html,/assets\/new-profile\.js/);
});
test("wizard supports resume validation and activation",()=>{
 assert.match(js,/\/api\/profiles/);
 assert.match(js,/setup/);
 assert.match(js,/validate/);
 assert.match(js,/action="activate"|action:"activate"|body\.action="activate"/);
 assert.match(js,/Resume|resume/i);
});
