/**
 * Watermark verification policy:
 * V1 (initial render) requires a positive watermark verification.
 * V2 and subsequent revisions DO NOT require watermark verification.
 * No inferred PASS: retain the original evidence unchanged. Independent
 * byte, Drive, audio, media identity and publication authorization remain.
 */
export function watermarkVerificationSatisfied(attempt, evidence) {
  const number=Number(attempt?.number);
  if(!Number.isSafeInteger(number)||number<1)return false;
  if(number===1)return evidence?.watermark_verified===true;
  return true;
}
export function watermarkVerificationRequired(attempt) {
  const number=Number(attempt?.number);
  return Number.isSafeInteger(number)&&number===1;
}
