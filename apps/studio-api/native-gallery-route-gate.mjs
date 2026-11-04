/** Phase 1 native gallery POST admission only.
 *
 * A match bypasses the historical Phase 2A method-denial prefilter; it DOES
 * NOT authenticate a caller, enable a feature flag, bypass the held-output
 * lease, authorize generation, release a hold or grant publication.
 * Every matching route is separately authorized by its actual Worker handler.
 */
const OUTPUT="rec[A-Za-z0-9]{14}";
const JOB="[A-Za-z0-9_-]{8,120}";
const NATIVE_FACTORY_POST=[
  new RegExp("^/api/factory/outputs/"+OUTPUT+"/gallery-selection-preview$"),
  new RegExp("^/api/factory/outputs/"+OUTPUT+"/gallery-enroll$"),
  new RegExp("^/api/factory/outputs/"+OUTPUT+"/gallery-generate$"),
  new RegExp("^/api/factory/outputs/"+OUTPUT+"/gallery/jobs/"+JOB+"/creative-decision$"),
  new RegExp("^/api/factory/outputs/"+OUTPUT+"/gallery/jobs/"+JOB+"/factory-handoff$"),
];
const NATIVE_INTERNAL_POST=new Set([
  "claim-job", "reserve-launch", "commit-manifest",
]);

export function isNativeGalleryControlledPostPath(path,method){
 if(method!=="POST"||typeof path!=="string")return false;
 if(NATIVE_FACTORY_POST.some(re=>re.test(path)))return true;
 const internal=/^\/(?:api\/)?internal\/native-gallery\/([a-z-]+)$/.exec(path);
 return Boolean(internal&&NATIVE_INTERNAL_POST.has(internal[1]));
}
