/**
 * Exception Recovery Center rollout policy.
 *
 * Read-only inspection is deployable independently of any recovery mutation.
 * No request, user input, or saved Airtable setting may enable mutations.
 * An operator must explicitly configure the Worker environment variable.
 */
export function exceptionRecoveryMutationsEnabled(env) {
  return env?.EXCEPTION_RECOVERY_ACTIONS_ENABLED === "true";
}
