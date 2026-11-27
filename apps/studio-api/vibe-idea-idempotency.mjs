/** #3094: idempotency is identity, never approval or mode authority. */
const rec=/^rec[A-Za-z0-9]{14}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const hash=async value=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))));
export async function vibeIdeaIntakeIdentity({token,organizationId,actorId,profileId,input,aspect,width,height,seconds}) {
  if(!uuid.test(String(token||""))||![organizationId,actorId,profileId].every(id=>rec.test(String(id||"")))||
    !["horizontal","vertical"].includes(aspect)||!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0||
    aspect!==(width>height?"horizontal":"vertical")||!Number.isFinite(seconds)||seconds<8||seconds>90)
    throw new Error("Vibe intake identity or source orientation is invalid");
  // The actor is deliberately NOT in the record-ID derivation. A different
  // authorized user reusing a token must conflict, not create a second Idea.
  const key=await hash(["vibe-intake-3094",organizationId,profileId,token.toLowerCase()]);
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const recordId="rec"+Array.from(key.slice(0,14),byte=>alphabet[byte%alphabet.length]).join("");
  const fingerprint=hex(await hash([hex(key),actorId,String(input.title),String(input.summary||""),String(input.primary_location||""),aspect,width,height,seconds]));
  return {recordId,profileId,receipt:{version:1,key:hex(key),fingerprint,organizationId,actorId,profileId}};
}
export function vibeIdeaIntakeMatches(row,identity,profileUuid) {
  const stored=row?.payload?.Studio_Vibe_Intake_Receipt, expected=identity?.receipt;
  return Boolean(row?.airtable_record_id===identity?.recordId&&row.content_profile_id===profileUuid&&
    row.production_mode==="automatic"&&row.production_source==="vibe_cut"&&
    stored&&expected&&["version","key","fingerprint","organizationId","actorId","profileId"].every(k=>stored[k]===expected[k]));
}
