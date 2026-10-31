/**
 * Fail-closed post-render revision capability for the CURRENT proven
 * Remotion contract. Format identity comes from the active Airtable mapping;
 * render composition comes from this exact output's saved R4 props.
 *
 * This is deliberately NOT a platform allowlist. Any profile/platform using
 * the same verified 9:16 PhotoSequence MP4 contract can be reviewed.
 * Carousels, photo sets, native image outputs, and alternate Vibe Cut
 * compositions must receive a certified image/multi-artifact runner first.
 */
const value = x => String(x ?? "").trim();
export function correctionRenderCapability(format, originalPropsJson) {
  if (value(format?.aspect_ratio).replace(/\s/g,"") !== "9:16")
    return {supported:false,reason:"OUTPUT_ASPECT_NOT_CERTIFIED"};
  if (value(format?.key) === "")
    return {supported:false,reason:"RENDER_MAPPING_UNAVAILABLE"};
  if (typeof originalPropsJson !== "string" ||
      !originalPropsJson.trim() || originalPropsJson.length > 250000)
    return {supported:false,reason:"ORIGINAL_RENDER_PROPS_UNAVAILABLE"};
  let props;
  try { props=JSON.parse(originalPropsJson); }
  catch { return {supported:false,reason:"ORIGINAL_RENDER_PROPS_INVALID"}; }
  if (!props || Array.isArray(props) ||
      props.compositionId !== "ChicagoShiningPhotoSequence")
    return {supported:false,reason:"COMPOSITION_NOT_CERTIFIED"};
  if (!Array.isArray(props.clips) || props.clips.length<1 ||
      props.clips.length>80 || props.clips.some(clip=>
        !clip || typeof clip !== "object" || Array.isArray(clip)))
    return {supported:false,reason:"ORIGINAL_SCENES_UNVERIFIED"};
  if ((props.width != null && Number(props.width)!==1080) ||
      (props.height != null && Number(props.height)!==1920) ||
      (props.fps != null && Number(props.fps)!==30))
    return {supported:false,reason:"COMPOSITION_DIMENSIONS_NOT_CERTIFIED"};
  return {supported:true,reason:null,contract:"photo-sequence-9x16-mp4-v1"};
}
