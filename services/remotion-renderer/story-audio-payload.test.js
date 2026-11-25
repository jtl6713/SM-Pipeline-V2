const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {decodeStoryAudio} = require('./story-audio-payload');
const data=Buffer.from('verified narration fixture');
const good={base64:data.toString('base64'),sha256:crypto.createHash('sha256').update(data).digest('hex')};
test('exact audio bytes survive transport',()=>assert.deepEqual(decodeStoryAudio(good),data));
test('fail closed on altered bytes, malformed and oversize data',()=>{
 for(const bad of [{...good,sha256:'0'.repeat(64)},{...good,base64:'a!'},{...good,base64:''},{...good,base64:'A'.repeat(12*1024*1024)},{...good,base64:good.base64+'='},null]) assert.throws(()=>decodeStoryAudio(bad));
});
