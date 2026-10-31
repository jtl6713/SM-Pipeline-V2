/**
 * Server-side scope for protected Runner claim, launch-ledger and completion.
 * This helper is never a browser authorization. The route separately requires
 * the protected job credential, the exact held Output and the lease/receipt.
 *
 * The Chicago pilot remains available under its original flags. Any other
 * authenticated Content Profile requires both independently controlled global
 * integration flags and the existing manual enrollment/publish-fence gates.
 */
import {globalReviewEnrollmentEnabled} from "./rendering-review-enrollment-http.mjs";
import {CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";

const record=/^rec[A-Za-z0-9]{14}$/;
const nonempty=x=>typeof x==="string"&&x.trim().length>0;

export function protectedReviewRunnerScope(view,outputId,env) {
  if(!record.test(outputId)||view?.id!==outputId||
     !record.test(view.profile_id)||!nonempty(view.platform)||
     !nonempty(view.output_type))
    return false;
  const chicagoPilot=view.profile_id===CHICAGO_PROFILE_ID &&
    view.platform==="Instagram"&&view.output_type==="Instagram Reel";
  return chicagoPilot||globalReviewEnrollmentEnabled(env);
}
