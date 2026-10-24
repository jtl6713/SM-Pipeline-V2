/**
 * Airtable Platform Outputs.Content_Profile is a LOOKUP, not a linked
 * Content Profiles record. Resolve the ownership chain from the real links:
 * Platform Outputs.Content_Item -> Content Items.Content_Profile.
 * Missing/multiple/mismatched identities fail closed; never infer an account
 * from the lookup's display text.
 */
const rec = /^rec[A-Za-z0-9]{14}$/;
const one = (row,field) => {
  const values=row?.fields?.[field];
  return Array.isArray(values) && values.length===1 && rec.test(String(values[0]||""))
    ? values[0] : null;
};
export function contentIdForRecoveryOutput(row) {
  if(!rec.test(String(row?.id||"")))return null;
  return one(row,"Content_Item");
}
export function verifyRecoveryProfileChain(output,content,profile) {
  const contentId=contentIdForRecoveryOutput(output);
  const profileId=one(content,"Content_Profile");
  if(!contentId || content?.id!==contentId || !profileId || profile?.id!==profileId)
    return {ok:false,reason:"authoritative_profile_link_unverified"};
  if(String(profile?.fields?.Active||"").toLowerCase()==="false")
    return {ok:false,reason:"inactive_content_profile"};
  return {ok:true,profile_id:profileId,content_id:contentId};
}
export function withVerifiedRecoveryProfile(output, chain) {
  if(!chain?.ok || !rec.test(String(chain.profile_id||"")))
    throw new Error("authoritative_profile_link_unverified");
  return {...output,fields:{...output.fields,Content_Profile:[chain.profile_id]}};
}

/**
 * A profile may inherit a city-scoped YOUTUBE_CHANNEL_ID when the linked
 * Content Profiles.YouTube_Channel_ID field is blank. Two different configured
 * IDs are never arbitrarily preferred: require an explicit administrator fix.
 */
export function verifiedRecoveryChannelId(profile, settings = {}) {
  const direct=String(profile?.fields?.YouTube_Channel_ID||"").trim();
  const scoped=String(settings?.YOUTUBE_CHANNEL_ID||"").trim();
  if(direct&&scoped&&direct!==scoped)
    return {ok:false,reason:"profile_channel_setting_conflict"};
  const channel_id=direct||scoped;
  if(!/^UC[A-Za-z0-9_-]{22}$/.test(channel_id))
    return {ok:false,reason:"expected_profile_channel_not_configured"};
  return {ok:true,channel_id};
}
