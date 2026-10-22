/**
 * Bounded, authenticated read-only global Factory deployment health.
 * Never enumerate all groups/children here: that is a separate UI history
 * operation and can exceed the Worker/service-binding request budget.
 */
export async function readFactoryGlobalRolloutHealth(bucket, { rollout, globalRollout } = {}) {
  if (typeof bucket?.list !== "function") {
    throw new Error("Global Factory health requires authoritative R2 binding");
  }
  // One R2 LIST request, at most one object, no object-body GETs or mutations.
  // Readability of durable group storage remains a hard deployment gate.
  const storage = await bucket.list({
    prefix: "studio/state/factory-approvals/v2/groups/",
    limit: 1,
  });
  if (!Array.isArray(storage?.objects) || storage.objects.length > 1) {
    throw new Error("Global Factory R2 health probe returned invalid data");
  }
  return {
    ok: true,
    scope: "all",
    status_only: true,
    read_only: true,
    history_checked: false,
    approvals_enabled: Boolean(rollout?.enabled || globalRollout?.enabled),
    rollout,
    global_rollout: globalRollout,
    storage_probe: {
      ok: true,
      bounded: true,
      listed: storage.objects.length,
    },
  };
}
