/** Synthetic cross-host admission. No actual Studio/R2/production job is read or claimed. */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { globalWorkloadKey, globalWorkloadRpc } from "../../apps/studio-api/global-workload-coordinator.mjs";

const mode = String(process.argv[2] || "");
const path = "/tmp/incident2670-crosshost-node-lease.json";
const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STUDIO_GLOBAL_WORKLOAD_COORDINATOR_ENABLED: "true",
};
if (String(env.SUPABASE_URL || "").replace(new RegExp("/+$"), "") !==
    "https://vkwvscgisqsbuwagdvtb.supabase.co" ||
    !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("crosshost_javascript_wrong_authority");
}
if (!["acquire", "probe", "release"].includes(mode)) {
  throw new Error("crosshost_javascript_mode_invalid");
}
const scope = "producer";
const identity = mode === "probe"
  ? "incident2670-crosshost-node-probe-20261123-r2"
  : "incident2670-crosshost-node-owner-20261123-r2";
const key = await globalWorkloadKey(identity);
if (mode === "acquire") {
  if (existsSync(path)) throw new Error("crosshost_node_stale_local_receipt");
  const claim = { scope, key, fence: crypto.randomUUID(), ttlSeconds: 180 };
  const receipt = await globalWorkloadRpc(env, "acquire", claim);
  if (!receipt.accepted || receipt.replay) {
    throw new Error("crosshost_node_admission_unverified");
  }
  writeFileSync(path, JSON.stringify(claim), {mode: 0o600,flag:"wx"});
  console.log("incident2670_crosshost_node_OWNER_ACQUIRED");
} else if (mode === "release") {
  if (!existsSync(path)) {
    console.log("incident2670_crosshost_node_NO_LOCAL_CLAIM");
    process.exit(0);
  }
  const claim = JSON.parse(readFileSync(path, "utf8"));
  const receipt = await globalWorkloadRpc(env, "release", claim);
  if (!receipt.accepted) throw new Error("crosshost_node_release_unconfirmed");
  unlinkSync(path);
  console.log("incident2670_crosshost_node_OWNER_RELEASED");
} else {
  const probe = {scope,key,fence:crypto.randomUUID(),ttlSeconds:90};
  const result = await globalWorkloadRpc(env,"acquire",probe);
  if (result.accepted) {
    await globalWorkloadRpc(env, "release", probe).catch(()=>{});
    throw new Error("crosshost_node_accepted_while_python_held");
  }
  if (result.reason !== "database_capacity") {
    throw new Error("crosshost_node_wrong_denial_reason");
  }
  console.log("incident2670_crosshost_node_DENIED_WHILE_PYTHON_HELD");
}
