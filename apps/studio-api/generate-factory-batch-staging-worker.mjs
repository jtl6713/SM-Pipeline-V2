/**
 * Extract the *actual* eight Worker handlers at build time and inline them in
 * the isolated staging template. This is build-time source generation, not eval.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const here=path.dirname(fileURLToPath(import.meta.url));
const functions=[
  "studioOutputReadyForPublishApproval",
  "studioPublishScheduleFields",
  "approveOutputRecordForPublishing",
  "factoryApproveOutput",
  "studioContentProfileRecordIdForOutput",
  "factoryBatchProcess",
  "factoryBatchSubmitRoute",
  "factoryBatchStatusRoute",
];
const modules=["01","02","03","04"].map(n=>
  fs.readFileSync(path.join(here,"worker-functions-"+n+".mjs"),"utf8"));
function extract(name) {
  for (const src of modules) {
    const match=new RegExp("(?:^|\\n)export (?:async )?function "+name+"\\(").exec(src);
    if(!match)continue;
    const start=match.index+(match[0].startsWith("\n")?1:0)+7;
    const end=src.indexOf("/*__STUDIO_WORKER_END:"+name+"__*/",start);
    if(end<=start)throw Error("Unterminated canonical Worker function: "+name);
    return src.slice(start,end);
  }
  throw Error("Missing canonical Worker function: "+name);
}
const template=fs.readFileSync(path.join(here,"factory-batch-staging-worker.template.mjs"),"utf8");
const marker="/*__STAGING_CANONICAL_FACTORY_HANDLERS__*/";
if(template.split(marker).length!==2)throw Error("Staging template marker missing/duplicated");
const handlers=functions.map(extract);
if(handlers.some(body=>body.includes("eval(")||body.includes("export default")))
  throw Error("Staging generated source contains unsupported dynamic transport");
const source=template.replace(marker,handlers.join("\n\n"));
const output=path.join(here,"factory-batch-staging-worker.generated.mjs");
fs.writeFileSync(output,source);
const hash=crypto.createHash("sha256").update(handlers.join("\n\n")).digest("hex").slice(0,16);
console.log("FACTORY_STAGING_BUILD_PASS handlers="+handlers.length+" canonical_fingerprint="+hash+" bytes="+Buffer.byteLength(source));
