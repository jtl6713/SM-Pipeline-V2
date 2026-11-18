// Keep these helpers aligned with apps/studio-web/assets/app-item4-1008.js
// (item4PrepareButtonView, productionPillState, item4IsRetryablePrepareFailure).

export function item4ProductionPillState(text) {
  const t = String(text || "").toLowerCase();
  if (/attention|error|need/.test(t)) return "attention";
  if (/process|prepar|upload|building/.test(t)) return "busy";
  if (/ready|complete/.test(t)) return "ready";
  return "idle";
}

export function item4VariantProgressCounts(status) {
  const manifest = status?.variants || {};
  const progress = status?.variant_progress || {};
  const manifestTarget = Number(manifest.target_count || 0);
  const progressTarget = Number(progress.target || 0);
  const usePlan = !(manifestTarget > 0 || progressTarget > 0) && Number(manifest.plan_target_count || 0) > 0;
  const targetCount = usePlan ? Number(manifest.plan_target_count) : (manifestTarget || progressTarget);
  const readyCount = usePlan
    ? Number(manifest.plan_ready_count || 0)
    : Math.max(Number(manifest.ready_count || 0), Number(progress.ready || 0));
  return {
    readyCount: Math.max(0, Number.isFinite(readyCount) ? readyCount : 0),
    targetCount: Math.max(0, Number.isFinite(targetCount) ? targetCount : 0),
  };
}

export function item4VariantCountLabel(readyCount, targetCount) {
  const ready = Math.max(0, Number(readyCount) || 0);
  const target = Number(targetCount);
  return Number.isFinite(target) && target > 0
    ? `${ready}/${target}`
    : `${ready} ready`;
}

export function item4PrepareButtonView({
  planStatus = "",
  variantStatus = "None",
  readyCount = 0,
  targetCount = 0,
  inFlight = false,
  canAutoPlan = false,
} = {}) {
  const planReady = String(planStatus || "") === "Ready";
  const count = item4VariantCountLabel(readyCount, targetCount);
  if (!planReady && !canAutoPlan) {
    return { disabled: true, label: "Prepare", retry: false };
  }
  if (inFlight) {
    return { disabled: true, label: `Preparing… ${count}`, retry: false };
  }
  if (variantStatus === "Ready") {
    return { disabled: false, label: "Rebuild", retry: false };
  }
  if (variantStatus === "Preparing") {
    return { disabled: false, label: `Retry remaining (${count})`, retry: true };
  }
  if (variantStatus === "Error") {
    return { disabled: false, label: "Retry", retry: true };
  }
  return { disabled: false, label: "Prepare", retry: false };
}

export function item4IsRetryablePrepareFailure(error, status) {
  const variantStatus = String(status?.variant_status || "");
  // Only an authoritative Preparing readback proves an actual job exists.
  // In particular, a 5xx/timeout with status None must surface the original
  // server error instead of polling None and replacing it with "try again".
  if (String(error?.bodyStatus || "") === "Error" || variantStatus === "Error") return false;
  return variantStatus === "Preparing";
}

export function item4BridgeIssuesAreDestinationLinks(issues) {
  const lines = (Array.isArray(issues) ? issues : [issues])
    .map((issue) => String(issue || "").trim())
    .filter(Boolean);
  return lines.length > 0 && lines.every((issue) =>
    /proven production route|not fully mapped|not fully linked/i.test(issue)
  );
}

export function item4PrepareHttpStatus(variantStatus) {
  if (variantStatus === "Error") return 409;
  if (variantStatus === "Ready") return 200;
  return 202;
}
