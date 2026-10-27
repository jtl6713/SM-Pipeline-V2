import test from "node:test";
import assert from "node:assert/strict";
import {isTikTokEmailedManualHandoff,TIKTOK_NOT_EMAILED_HANDOFF_AIRTABLE_FORMULA} from "./tiktok-emailed-handoff.mjs";

test("email-confirmed delivery is a TikTok manual handoff, not a published receipt",()=>{
 const base={platform:"TikTok",tiktok_draft_status:"Draft Delivered — Manual Action Required"};
 assert.equal(isTikTokEmailedManualHandoff({...base,tiktok_draft_email_sent_at:"2026-10-27T01:00:00Z"}),true);
 assert.equal(isTikTokEmailedManualHandoff({...base,tiktok_draft_email_sent_at:""}),false);
 assert.equal(isTikTokEmailedManualHandoff({...base,tiktok_draft_status:"Processing",tiktok_draft_email_sent_at:"2026-10-27T01:00:00Z"}),false);
 assert.equal(isTikTokEmailedManualHandoff({...base,platform:"Instagram",tiktok_draft_email_sent_at:"2026-10-27T01:00:00Z"}),false);
 assert.equal(isTikTokEmailedManualHandoff({...base,tiktok_draft_status:"Manual Completion Received",tiktok_draft_email_sent_at:"2026-10-27T01:00:00Z"}),true);
});
test("the Airtable Quality Agent exclusion uses the same exact email and delivered state gates",()=>{
 const query=TIKTOK_NOT_EMAILED_HANDOFF_AIRTABLE_FORMULA;
 assert.match(query,/TikTok_Draft_Email_Sent_At/);
 assert.match(query,/Draft Delivered — Manual Action Required/);
 assert.match(query,/Manual Completion Received/);
 assert.match(query,/NOT\(AND\(/);
 assert.doesNotMatch(query,/Manual_Published_URL=BLANK\(\)/);
});
