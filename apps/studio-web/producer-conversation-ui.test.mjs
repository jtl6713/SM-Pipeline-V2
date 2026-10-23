import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = p => fs.readFileSync(new URL(p, import.meta.url), "utf8");
test("Production conversation is linked to actual Production Request identity", () => {
 const app=read("./assets/app-item4-1008.js");
 assert.match(app,/StudioProducerConversation\?\.open\(record\.id\)/);
 const ui=read("./assets/producer-conversation-ui.js");
 assert.match(ui,/producer-conversation/);
 assert.match(ui,/expected_revision/);
 assert.match(ui,/credentials:"same-origin"/);
 assert.match(ui,/document\.createTextNode/);
});
test("Factory history and existing review submissions remain intact",()=>{
 const factory=read("./assets/factory-desk.js");
 const html=read("./index.html");
 assert.match(factory,/showFactoryHistory\(payload\.production_request_id\)/);
 assert.match(factory,/await mutateDesk\(\{ \.\.\.pending\.payload, note: notes \}\)/);
 assert.match(html,/id="factoryProducerTranscript"/);
 assert.match(html,/producer-conversation-ui\.js/);
});
test("Authenticated Worker path remains only proposed, never publish",()=>{
 const worker=read("../studio-api/worker.js");
 assert.match(worker,/isProducerConversationRoute/);
 assert.match(worker,/withOutputApprovalLock\(env\.STUDIO_MEDIA, requestId/);
 assert.match(worker,/requirePermission\(authorization, "production_configure"\)/);
 assert.match(worker,/Production_Notes: updated\.notes/);
 assert.doesNotMatch(read("./assets/producer-conversation-ui.js"),/Publish_Status\s*:/);
});
