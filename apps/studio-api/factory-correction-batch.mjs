/**
 * Durable Factory correction fanout coordinator.
 *
 * No implicit publish, approval or render authorization. The integration must
 * inject a strongly consistent Airtable/R2 receipt store and use the SAME
 * request-level lease for retries. Each enrollment must use the protected
 * per-output Rendering Review coordinator (hold, schedule vacate, readback,
 * original V1 version preservation and separate session).
 *
 * IMPORTANT: this is an unmounted integration boundary until Renderer, Producer
 * and approval routes support every selected format/profile.
 */
import { validateFactoryCorrectionSelection } from "./factory-correction-selection.mjs";

const fail = (message, code = "FACTORY_CORRECTION_BLOCKED") =>
  Object.assign(new Error(message), { code, status: 409 });

const stable = value => String(value || "").trim();
const required = [
  "withRequestLock", "readAuthoritativeSnapshot", "readBatchReceipt",
  "createBatchReceiptIfAbsent", "updateBatchReceiptIfVersion",
  "enrollHeldOutput", "verifyHeldSession",
];
const canonical = input => JSON.stringify([
  input.client_request_id, input.production_request_id,
  input.source_output_id, input.render_format_key,
  input.profile_id, input.note, [...input.output_ids].sort(),
]);
async function fingerprint(input) {
  const hash = await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(canonical(input)));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function checkOps(ops) {
  for (const op of required) if (typeof ops?.[op] !== "function")
    throw fail("Durable correction integration missing " + op, "CORRECTION_ADAPTER_MISSING");
}
function completed(rows, ids) {
  return ids.every(id => rows[id]?.status === "held" && rows[id]?.verified === true);
}

/**
 * Never acknowledge a single 'accepted' request until EVERY selected output
 * is verified held. Partial failures are recoverable and remain visible.
 *
 * Callers MUST:
 *  - check authenticated outputs_review and profile membership;
 *  - use a durable request-level lease;
 *  - read authoritative PR mapping + platform output records from Airtable;
 *  - supply profile_ids from trusted memberships, not the client body;
 *  - assign idempotent per-output session keys derived from batch key + ID;
 *  - make enrollHeldOutput lock, verify and vacate one output atomically;
 *  - persist batch receipts with CAS and no destructive overwrites;
 *  - never enqueue a render until a separate explicit human authorization.
 */
export async function submitFactoryCorrectionBatch({
  source_output_id, selected_output_ids, note, client_request_id, operations,
}) {
  checkOps(operations);
  const key = stable(client_request_id);
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(key))
    throw fail("Stable correction ID required", "INVALID_REQUEST");
  if (!Array.isArray(selected_output_ids) || !selected_output_ids.length ||
      selected_output_ids.length > 40)
    throw fail("Select between 1 and 40 outputs", "INVALID_SELECTION");
  if (!/^rec[A-Za-z0-9]{14}$/.test(stable(source_output_id)))
    throw fail("Exact Factory source output required", "INVALID_SOURCE");

  const first = await operations.readAuthoritativeSnapshot(source_output_id);
  const requestId = stable(first?.source?.production_request_id);
  if (!/^rec[A-Za-z0-9]{14}$/.test(requestId)) throw fail('Missing Production Request', 'PREFLIGHT_UNAVAILABLE');
  return operations.withRequestLock(requestId, async () => {
    // Re-read live records under the batch lease. Never trust a stale
    // browser preview, the Supabase mirror or selected format strings.
    const snapshot = await operations.readAuthoritativeSnapshot(source_output_id);
    if (!snapshot?.source || !Array.isArray(snapshot?.outputs) ||
        !Array.isArray(snapshot?.authorized_profile_ids))
      throw fail("Authoritative correction snapshot unavailable", "PREFLIGHT_UNAVAILABLE");
    const existingReceipt = await operations.readBatchReceipt(key);
    if (!snapshot.authorized_profile_ids.includes(snapshot.source?.profile_id))
      throw fail('Profile membership revoked', 'NOT_AUTHORIZED');
    const plan = existingReceipt ? {
      production_request_id: snapshot.source.production_request_id,
      content_item_id: snapshot.source.content_item_id,
      profile_id: snapshot.source.profile_id,
      source_output_id: source_output_id,
      render_format_key: existingReceipt.render_format_key,
      client_request_id: key, note: stable(note), output_ids: selected_output_ids,
    } : validateFactoryCorrectionSelection({
      source: snapshot.source, outputs: snapshot.outputs,
      authorized_profile_ids: snapshot.authorized_profile_ids,
      selected_output_ids, note, client_request_id: key,
    });
    const hash = await fingerprint(plan);
    let receipt = existingReceipt;
    if (receipt && (receipt.source_output_id !== source_output_id ||
        receipt.profile_id !== snapshot.source.profile_id ||
        receipt.production_request_id !== requestId ||
        receipt.content_item_id !== snapshot.source.content_item_id))
      throw fail('Correction identity mismatch', 'IDENTITY_CONFLICT');
    if (receipt && (receipt.fingerprint !== hash ||
        receipt.production_request_id !== plan.production_request_id))
      throw fail("Correction ID reused with different selection or feedback", "IDEMPOTENCY_CONFLICT");
    if (!receipt) {
      const created = {
        version: 1, schema: "studio.factory-correction-batch.1",
        client_request_id: key, fingerprint: hash,
        production_request_id: plan.production_request_id,
        content_item_id: plan.content_item_id, source_output_id: plan.source_output_id,
        profile_id: plan.profile_id, render_format_key: plan.render_format_key,
        selected_output_ids: plan.output_ids,
        status: "holding", outputs: Object.fromEntries(
          plan.output_ids.map(id => [id, { status: "pending", verified: false }])
        ),
      };
      // Requires atomic unique-key create; never use last-write-wins.
      await operations.createBatchReceiptIfAbsent(key, created);
      receipt = await operations.readBatchReceipt(key);
      if (!receipt || receipt.fingerprint !== hash)
        throw fail("Batch receipt was not verified", "RECEIPT_UNVERIFIED");
    }
    if (receipt.status === "accepted" &&
        completed(receipt.outputs, plan.output_ids))
      return { ok: true, replay: true, status: "accepted",
        client_request_id: key, outputs: receipt.outputs };
    if (!receipt.outputs || !plan.output_ids.every(id => receipt.outputs[id]))
      throw fail("Stored correction selection does not match the request", "RECEIPT_CONFLICT");

    // On a retry, a held output is independently reverified: R2 receipt
    // alone never establishes publication safety.
    for (const id of plan.output_ids) {
      let row = receipt.outputs[id];
      if (row.status !== "held" || row.verified !== true) {
        try {
          await operations.enrollHeldOutput({
            output_id: id, note: plan.note,
            client_request_id: key + "_" + id,
            profile_id: plan.profile_id, render_format_key: plan.render_format_key,
          });
          const held = await operations.verifyHeldSession(id, key + "_" + id);
          if (held?.hold_active !== true || held?.original_preserved !== true ||
              held?.published_or_dispatching === true)
            throw fail("Publication hold or V1 preservation not verified for " + id,
              "HOLD_UNVERIFIED");
          row = { status: "held", verified: true,
            session_id: stable(held.session_id) };
        } catch (error) {
          row = { status: "failed", verified: false,
            reason: stable(error.code || error.message).slice(0, 120) };
        }
      } else {
        const held = await operations.verifyHeldSession(id, key + "_" + id);
        if (held?.hold_active !== true || held?.original_preserved !== true ||
            held?.published_or_dispatching === true)
          row = { status: "failed", verified: false, reason: "HOLD_LOST" };
      }
      const next = { ...receipt, version: receipt.version + 1,
        outputs: { ...receipt.outputs, [id]: row }, status: "holding" };
      await operations.updateBatchReceiptIfVersion(key, receipt.version, next);
      receipt = await operations.readBatchReceipt(key);
      if (!receipt || receipt.version !== next.version)
        throw fail("Could not verify correction receipt update", "RECEIPT_UNVERIFIED");
      // A fail-closed partial batch remains visible; later retries use same
      // key and never rerender an already-held sibling.
    }
    if (!completed(receipt.outputs, plan.output_ids)) return {
      ok: false, replay: false, status: "partial_hold",
      client_request_id: key, outputs: receipt.outputs,
      message: "Some selected outputs were not held. Nothing is approved or rendered.",
    };
    const accepted = { ...receipt, version: receipt.version + 1,
      status: "accepted" };
    await operations.updateBatchReceiptIfVersion(key, receipt.version, accepted);
    const readback = await operations.readBatchReceipt(key);
    if (readback?.status !== "accepted" || readback.version !== accepted.version ||
        !completed(readback.outputs, plan.output_ids))
      throw fail("Batch acceptance could not be verified", "ACCEPTANCE_UNVERIFIED");
    return {
      ok: true, replay: false, status: "accepted",
      client_request_id: key, outputs: readback.outputs,
      message: "All selected outputs are on independent Rendering Review holds. No render or publication was authorized.",
    };
  });
}
