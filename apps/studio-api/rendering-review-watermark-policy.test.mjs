import test from 'node:test';
import assert from 'node:assert/strict';
import {watermarkVerificationSatisfied,watermarkVerificationRequired}
 from './rendering-review-watermark-policy.mjs';
test('V1 requires independently verified watermark, even on initial render',()=>{
 const attempt={number:1};
 assert.equal(watermarkVerificationRequired(attempt),true);
 for(const value of [false,null,undefined])
   assert.equal(watermarkVerificationSatisfied(attempt,{watermark_verified:value}),false);
 assert.equal(watermarkVerificationSatisfied(attempt,{watermark_verified:true}),true);
});
test('V2/V3 and all later rerenders never gate on watermark status',()=>{
 for(const number of [2,3,4,10,1000]){
   const a={number};
   assert.equal(watermarkVerificationRequired(a),false);
   for(const v of [false,null,undefined,true])
     assert.equal(watermarkVerificationSatisfied(a,{watermark_verified:v}),true);
   assert.equal(watermarkVerificationSatisfied(a,{}),true);
 }
});
test('unknown version fails closed instead of disabling V1 checks',()=>{
 for(const a of [null,{}, {number:0},{number:1.5},{number:-1}]){
   assert.equal(watermarkVerificationSatisfied(a,{}),false);
 }
});
