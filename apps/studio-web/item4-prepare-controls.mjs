// Keep these helpers aligned with apps/studio-web/assets/app-item4-0621.js
// (item4PrepareButtonView, productionPillState, item4IsRetryablePrepareFailure).

export function item4ProductionPillState(text) {
  const t = String(text || "").toLowerCase();
  if (/attention|error|need/.test(t)) return "attention";
  if (/process|prepar|upload|building/.test(t)) return "busy";
  if (/ready|complete/.test(t)) return "ready";
  return "idle";
}

export function item4PrepareButtonView({
  planStatus = "",
  variantStatus = "None",
  readyCount = 0,
  targetCount = 0,
  inFlight = false,
} = {}) {
  const planReady = String(planStatus || "") === "Ready";
  const count = `${Number(readyCount || 0)}/${targetCount || "?"}`;
  if (!planReady) {
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
  if (String(error?.bodyStatus || "") === "Error" || variantStatus === "Error") return false;
  if (variantStatus === "Preparing") return true;
  const message = String(error?.message || error || "");
  return /request failed \(5\d{2}\)/i.test(message)
    || /timed?\s*out|timeout|aborterror/i.test(message)
    || /platform media preparation is still running/i.test(message)
    || /attaching .* clip frames/i.test(message);
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
