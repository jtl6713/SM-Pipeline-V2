import fs from "node:fs";
import path from "node:path";
const dir = "apps/studio-web";
const appFile = path.join(dir,"assets","app-item4-1008.js");
const htmlFile = path.join(dir,"index.html");
let app=fs.readFileSync(appFile,"utf8");
let html=fs.readFileSync(htmlFile,"utf8");
function replaceOnce(text,oldValue,newValue,label) {
  const count=text.split(oldValue).length-1;
  if(count!==1) throw new Error(label+" expected one match, saw "+count);
  return text.replace(oldValue,newValue);
}
app=replaceOnce(app,
  'const scoped = pathname === "/api/ideas"',
  'const scoped = pathname === "/api/scripted-short/propose"\n      || pathname === "/api/scripted-short/accept"\n      || pathname === "/api/ideas"',
  "browser URL route scope");
app=replaceOnce(app,
  'body: JSON.stringify({ prompt }),\n        timeoutMs: 150000,',
  'body: JSON.stringify({ prompt, content_profile_id: selectedProfileId }),\n        timeoutMs: 150000,',
  "scripted-short proposal payload");
app=replaceOnce(app,
  '          prompt: scriptedShortProposal.prompt || $("scriptedShortPrompt")?.value || "",\n          timeline: scriptedShortProposal.timeline,',
  '          prompt: scriptedShortProposal.prompt || $("scriptedShortPrompt")?.value || "",\n          content_profile_id: selectedProfileId,\n          timeline: scriptedShortProposal.timeline,',
  "scripted-short acceptance payload");
app=replaceOnce(app,
  '    if (button) {\n      button.disabled = true;\n      button.textContent = "Writing…";',
  '    if (!selectedProfileId) {\n      setScriptedShortMessage("Select a Shining Cities profile before proposing a short.", "error-text");\n      return;\n    }\n    if (button) {\n      button.disabled = true;\n      button.textContent = "Writing…";',
  "fail closed on absent selected profile");
app=replaceOnce(app,'item4-0.6.742-approved-exception-scope','item4-0.6.743-scripted-short-profile-scope',"application build");
if(!html.includes("0.6.742-approved-exception-scope")) throw Error("stale index version assumption");
html=html.replaceAll("0.6.742-approved-exception-scope","0.6.743-scripted-short-profile-scope");
html=replaceOnce(html,"UI build 0.6.742","UI build 0.6.743","UI build label");
fs.writeFileSync(appFile,app);
fs.writeFileSync(htmlFile,html);
console.log("patched script short profile propagation; UI 0.6.743");
