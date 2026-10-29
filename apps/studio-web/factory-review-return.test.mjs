import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("./assets/factory-desk.js",import.meta.url),"utf8");
const review=readFileSync(new URL("./assets/rendering-review-queue.js",import.meta.url),"utf8");
const worker=readFileSync(new URL("../studio-api/worker.js",import.meta.url),"utf8");
test("Factory probes authoritative session and never starts old Production rework for reviewed V2",()=>{
 const probe=ui.indexOf('review = await fetchJson("/api/rendering-review/outputs/"');
 const factoryReturn=ui.indexOf('+"/factory-return"');
 const legacy=ui.indexOf('const desk = await mutateDesk({ ...pending.payload, note: notes });');
 assert.ok(probe>0 && factoryReturn>probe && legacy>factoryReturn);
 assert.match(ui,/if\(review\?\.session\)/);
 assert.match(ui,/if\(error\.status!==404\)throw error/);
});
test("Factory confirms saved note and opens exact Producer conversation",()=>{
 assert.match(ui,/Your request has been received\. Continue the conversation with the Producer in Rendering Review\./);
 assert.match(ui,/StudioRenderingReview\?\.openOutput/);
 assert.match(review,/async function openOutput\(outputId,notice\)/);
 assert.match(review,/state\.lastReplyNotice=\{outputId,message/);
 assert.match(review,/window\.StudioRenderingReview=\{load,openOutput\}/);
});
test("Worker independently enforces the review return POST boundary and correct V2 stream",()=>{
 assert.match(worker,/factoryReturnMatch && request\.method==="POST"/);
 assert.match(worker,/assertWriteRequest\(request,env\)/);
 assert.match(worker,/returnFactoryRevisionToProducer\(/);
 assert.match(worker,/previewAcceptedFactoryRevision\(/);
 assert.match(worker,/fetchTrustedRunnerReviewMedia\(identity\)/);
});
