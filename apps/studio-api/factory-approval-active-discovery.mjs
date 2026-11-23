/**
 * #1013 / #2847 — bounded READ-ONLY Factory active discovery.
 *
 * A single Factory GET must never dereference 2,000 parent/child R2 ledgers.
 * The browser supplies independent opaque continuation cursors. Canonical job
 * and group rows are still read and checked; a partial scan is NEVER "all clear".
 * Existing exact-request-ID GETs and explicit Completed history are unchanged.
 */
import {
  FACTORY_BATCH_PREFIX, factoryBatchRead, factoryBatchSummary,
  factoryBatchNeedsAttention, factoryBatchQualitySignals,
} from "./factory-approval-queue.mjs";
import {
  FACTORY_GROUP_PREFIX, factoryApprovalGroupStatus,
} from "./factory-approval-groups.mjs";

const REC = /^rec[A-Za-z0-9]+$/;
const RID = /^[A-Za-z0-9_-]{12,128}$/;
const CHILD_KEY = /^studio\/state\/factory-approvals\/v2\/jobs\/(rec[A-Za-z0-9]+)\/([A-Za-z0-9_-]{12,128})\.json$/;
const PARENT_KEY = /^studio\/state\/factory-approvals\/v2\/groups\/([A-Za-z0-9_-]{12,128})\.json$/;

export function factoryActivityCursor(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  // R2 cursor is opaque; never treat it as an object key or send it to SQL.
  if (raw.length > 1024 || !/^[A-Za-z0-9+/_=.-]+$/.test(raw)) {
    throw Error("Invalid Factory activity discovery cursor");
  }
  return raw;
}

export async function factoryBoundedActiveDiscovery(bucket, {
  profileId = "", childCursor = "", groupCursor = "",
  childPageSize = 64, groupPageSize = 12,
} = {}) {
  if (!bucket?.list || !bucket?.get) throw Error("Factory R2 bucket unavailable");
  if (profileId && !REC.test(profileId)) throw Error("Invalid Factory profile filter");
  const childLimit = Math.max(1, Math.min(100, Math.trunc(childPageSize) || 64));
  const groupLimit = Math.max(1, Math.min(24, Math.trunc(groupPageSize) || 12));
  const childStart = factoryActivityCursor(childCursor);
  const groupStart = factoryActivityCursor(groupCursor);

  const [childPage, groupPage] = await Promise.all([
    bucket.list({
      prefix: FACTORY_BATCH_PREFIX + "/jobs/", limit: childLimit,
      include: ["customMetadata"], ...(childStart ? { cursor: childStart } : {}),
    }),
    bucket.list({
      prefix: FACTORY_GROUP_PREFIX + "/", limit: groupLimit,
      ...(groupStart ? { cursor: groupStart } : {}),
    }),
  ]);
  if (!Array.isArray(childPage?.objects) || !Array.isArray(groupPage?.objects))
    throw Error("Factory R2 active discovery returned incomplete storage listing");
  const children = [];
  childPage.objects.forEach(object => {
    const match = String(object.key || "").match(CHILD_KEY);
    if (!match || (profileId && match[1] !== profileId)) return;
    const meta = object.customMetadata || {};
    if (meta.factory_group) return; // Global children are represented by their parent.
    if (meta.factory_active === "false") return;
    children.push({ profileId: match[1], requestId: match[2] });
  });
  // Read exact canonical ledgers, never trust the storage listing as approval.
  const jobRows = await Promise.all(children.map(async child => {
    const job = await factoryBatchRead(bucket, child.profileId, child.requestId);
    if (!job || job.group_request_id || !factoryBatchNeedsAttention(job)) return null;
    return { ...factoryBatchSummary(job), quality_signals: factoryBatchQualitySignals(job) };
  }));
  const groupRequests = groupPage.objects.map(object =>
    String(object.key || "").match(PARENT_KEY)?.[1] || null).filter(Boolean);
  const groupRows = [];
  // Keep group+child dereferencing bounded even when R2 is slow.
  for (let i = 0; i < groupRequests.length; i += 4) {
    const chunk = await Promise.all(groupRequests.slice(i, i + 4).map(requestId =>
      factoryApprovalGroupStatus(bucket, requestId)));
    for (const group of chunk) {
      if (!group || (profileId && !(group.profile_ids || []).includes(profileId)) ||
          !factoryBatchNeedsAttention(group)) continue;
      groupRows.push(group);
    }
  }
  const batches = [...jobRows.filter(Boolean), ...groupRows]
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
  // Cloudflare only promises forward progress when 'truncated' includes a
  // nonempty cursor. Fail rather than restarting the same page and claiming 0.
  if ((childPage.truncated && !childPage.cursor) ||
      (groupPage.truncated && !groupPage.cursor))
    throw Error("Factory R2 activity discovery cursor did not advance");
  if ((childPage.truncated && childPage.cursor === childStart) ||
      (groupPage.truncated && groupPage.cursor === groupStart))
    throw Error("Factory R2 activity discovery cursor stalled");
  return {
    batches,
    discovery: {
      mode: "bounded-r2-cursor",
      child_cursor: childPage.truncated ? childPage.cursor : null,
      group_cursor: groupPage.truncated ? groupPage.cursor : null,
      complete: !childPage.truncated && !groupPage.truncated,
      child_scanned: childPage.objects.length,
      group_scanned: groupPage.objects.length,
    },
  };
}
