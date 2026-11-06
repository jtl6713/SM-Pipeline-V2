/** Read-only, pure non-Vibe source scheduling/dispatch guard.
 * No Airtable client, PATCH, scheduler mutation or MAE authority here.
 * The existing global scheduling transaction remains the sole writer.
 */
const text=x=>String(x??"").trim();
export function nativeGalleryHasScheduledOccupancy(fields){
 if(!fields||typeof fields!=="object")return true;
 return Boolean(
   text(fields.Scheduled_Post_Date)||
   text(fields.Studio_Scheduled_At)||
   text(fields.YouTube_Scheduled_Publish_At)
 );
}
