/**
 * Accepts ONLY resolved, profile-owned Airtable Media Asset records whose
 * Google Drive originals have already passed independent classification.
 * This pure transformation does not select by similarity or touch cloud data.
 */
export function appendVerifiedLibraryAssets(existing, candidates, profileId, makeId) {
  if (!Array.isArray(existing) || !existing.length) throw new Error("Existing Production Request has no master media");
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > 3)
    throw new Error("Producer supports one to three verified library additions per request");
  if (!/^rec[A-Za-z0-9]+$/.test(String(profileId || ""))) throw new Error("Content profile is unresolved");
  if (typeof makeId !== "function") throw new Error("Asset identity generator is required");
  const source = existing.map(a=>({...a})).sort((a,b)=>Number(a.order||0)-Number(b.order||0));
  const ids = new Set(source.map(a=>String(a.id||"")));
  const mediaIds = new Set(source.map(a=>String(a.media_asset_record_id||"")).filter(Boolean));
  const added = [];
  for (const media of candidates) {
    const id = String(media?.media_asset_record_id || "");
    const driveId = String(media?.google_drive_file_id || "");
    const mime = String(media?.mime_type || "").toLowerCase();
    const kind = String(media?.media_kind || "");
    const title = String(media?.name || "").trim();
    if (!/^rec[A-Za-z0-9]+$/.test(id) || mediaIds.has(id)) throw new Error("Duplicate or invalid library Media Asset");
    if (media.profile_id !== profileId) throw new Error("Library asset belongs to another content profile");
    if (!driveId || !title || !["photo","video"].includes(kind)) throw new Error("Library media lacks verified Drive authority or media type");
    if (kind === "video" !== mime.startsWith("video/")) throw new Error("Library MIME and media type disagree");
    const duration = Number(media.duration_seconds || 0);
    if (kind === "video" && (!Number.isFinite(duration) || duration <= 0))
      throw new Error("Library video clip requires a verified duration");
    const assetId = String(makeId());
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(assetId) || ids.has(assetId)) throw new Error("Generated source asset identity is invalid");
    ids.add(assetId);mediaIds.add(id);
    added.push({
      id:assetId,order:source.length+added.length+1,name:title,
      mime_type:mime,media_kind:kind,
      duration_seconds:kind==="video"?duration:null,
      in_seconds:0,out_seconds:kind==="video"?duration:null,
      source_format:String(media.source_format||"").toUpperCase()||null,
      google_drive_file_id:driveId,
      source_google_drive_file_id:String(media.source_google_drive_file_id||"")||null,
      google_drive_url:String(media.google_drive_url||"")||null,
      media_asset_record_id:id,
      preview_url:`/api/media-assets/${id}/preview`,
      authoritative_storage:"google_drive",staging_deleted:true,
      r2_key:null,url:String(media.google_drive_url||"")||null,
      source:"library",focal_point:"center",browser_preview_compatible:true,
    });
  }
  return {assets:[...source,...added],added_asset_ids:added.map(x=>x.id),media_asset_ids:[...mediaIds]};
}
