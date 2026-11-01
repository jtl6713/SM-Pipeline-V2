import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const script=fs.readFileSync(new URL("./assets/factory-desk.js",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../studio-api/worker.js",import.meta.url),"utf8");
const layout=fs.readFileSync(new URL("./assets/factory-layout-0680.css",import.meta.url),"utf8");

test("Factory separates held creative acceptance from publishing Approve",()=>{
  assert.match(script,/data-factory-accept-held/);
  assert.match(script,/Accept V2 \(QA hold\)/);
  assert.match(script,/data-factory-approve=/);
  assert.match(script,/publishing approval is held|Publishing approval is held/i);
  assert.match(script,/action:"accept_held_creative"/);
  assert.match(script,/result\.publishing_authorized!==false/);
  assert.match(script,/result\.review_hold_active!==true/);
  assert.match(script,/result\.public_post_created!==false/);
  assert.match(worker,/acceptFactoryHeldCreative/);
  assert.match(worker,/requirePermission\(authorization,"outputs_review"\)/);
  assert.doesNotMatch(worker,/if\s*\(input\?\.action === "accept_held_creative"\)[\s\S]{0,800}mutateFactoryDesk\(/);
});
test("held V2 Request Changes reopens existing Producer session, never enrolls again",()=>{
  assert.match(script,/data-factory-send-back/);
  assert.match(script,/action:"return_to_review_held"/);
  assert.match(script,/\/request-redo/);
  assert.match(script,/receipt\?\.redo_requested!==true/);
  assert.match(script,/receipt\.review_hold_active!==true/);
  assert.match(script,/receipt\.render_queued!==false/);
  assert.match(script,/payload\?\.action==="return_to_review_held"/);
});

test("held V2 QA action occupies its own full-width row without text overlap",()=>{
  // The factory grid has three columns. The extra action MUST NOT take one
  // narrow column and overflow into adjacent metadata or action buttons.
  assert.match(script,/class="secondary-button factory-held-creative-action" data-factory-accept-held=/);
  assert.match(script,/class="secondary-button factory-held-creative-action" disabled/);
  assert.match(layout,/\.factory-line-actions:has\(> \.factory-held-creative-action\)/);
  assert.match(layout,/\.factory-line-actions > \.factory-held-creative-action\{[^}]*grid-column:1 \/ -1;[^}]*grid-row:3;[^}]*white-space:normal;[^}]*overflow-wrap:anywhere;/s);
  assert.match(layout,/\.factory-line-actions:has\(> \.factory-held-creative-action\) > \[data-factory-send-back\]\{[^}]*grid-row:2;/s);
  assert.match(layout,/\.factory-line-actions:has\(> \.factory-held-creative-action\) > \[data-factory-delete\]\{[^}]*grid-row:2;/s);
});
