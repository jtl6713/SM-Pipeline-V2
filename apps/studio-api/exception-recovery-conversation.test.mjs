import test from "node:test";
import assert from "node:assert/strict";
import {prepareRecoveryConversationMessage,recoveryIntent,recoveryAgentResponse,normalizeRecoveryConversation} from "./exception-recovery-conversation.mjs";
const rid="recAAAAAAAAAAAAAA";
test("natural-language requests are captured, never executed",()=>{
 const msg=prepareRecoveryConversationMessage({recordId:rid,clientId:"0123456789abcdefghij",message:"Delete the second duplicate including renders",actor:"admin@example.com",diagnosis:"Existing post ID needs verification"});
 assert.equal(msg.intent.intent,"duplicate_removal");
 assert.equal(msg.intent.requires_approval,true);
 assert.equal(msg.records.length,2);
 assert.equal(JSON.parse(msg.records[1].fields.Intent_JSON).executed,false);
 assert.match(msg.records[1].fields.Message_Text,/explicit confirmation/);
 assert.equal(msg.records[1].fields.Reply_To_Event_Key,msg.records[0].fields.Event_Key);
});
test("claims of publication never trigger a second post or false verification",()=>{
 const reply=recoveryAgentResponse(recoveryIntent("I already posted this on TikTok"),"Check existing provider receipt");
 assert.match(reply,/provider readback/);
 assert.match(reply,/No second upload/);
});
test("invalid ids, missing actor, excessively long notes reject before mutation",()=>{
 const f={recordId:rid,clientId:"0123456789abcdefghij",message:"Retry",actor:"admin"};
 assert.throws(()=>prepareRecoveryConversationMessage({...f,recordId:"wrong"}));
 assert.throws(()=>prepareRecoveryConversationMessage({...f,clientId:"same"}));
 assert.throws(()=>prepareRecoveryConversationMessage({...f,actor:""}));
 assert.throws(()=>prepareRecoveryConversationMessage({...f,message:"x".repeat(2001)}));
});
test("concurrent duplicate records are deduplicated by stable event identity",()=>{
 const m=prepareRecoveryConversationMessage({recordId:rid,clientId:"0123456789abcdefghij",message:"Can you verify publication?",actor:"admin"});
 const rows=[...m.records,...m.records].map(x=>x.fields);
 const items=normalizeRecoveryConversation(rows);
 assert.equal(items.length,2);
 assert.deepEqual(items.map(x=>x.role),["administrator","quality_agent"]);
 assert.equal(m.intent.requires_approval,false);
});
