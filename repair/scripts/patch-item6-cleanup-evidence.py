#!/usr/bin/env python3
from pathlib import Path

p=Path('apps/studio-api/worker.js')
s=p.read_text(encoding='utf-8')
old='''  if (action === "complete_replace_cleanup") {
    if (!["Manual Cleanup Required", "Cleanup Pending", "Verified"].includes(state)) throw new HttpError(409, `Cleanup completion is not allowed from ${state || "blank"}`);
    const evidence = input.cleanup_evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new HttpError(400, "cleanup_evidence object is required");
    if (evidence.verified !== true) throw new HttpError(409, "cleanup_evidence.verified must be true before completing replacement cleanup");
    const updated = await item6PatchOutput(env, record.id, { Replace_State: "Complete", Replace_Cleanup_State: "Complete", Replace_Cleanup_Attempt_Count: Number(fields.Replace_Cleanup_Attempt_Count || 0) + 1, Replace_Error: null, Replace_Updated_At: now });
    return { action, idempotent: false, output: { id: record.id, output_id: fields.Output_ID ?? null, platform: item6Platform(fields) }, replace: { transaction_id: transactionId, fingerprint, state: "Complete", cleanup_state: "Complete", cleanup_evidence: evidence }, record: { id: updated.id } };
  }
'''
new='''  if (action === "complete_replace_cleanup") {
    if (state === "Complete") return { action, idempotent: true, output: { id: record.id, output_id: fields.Output_ID ?? null, platform: item6Platform(fields) }, replace: { transaction_id: transactionId, fingerprint, state: "Complete", cleanup_state: fields.Replace_Cleanup_State || "Complete" } };
    if (!["Manual Cleanup Required", "Cleanup Pending", "Verified"].includes(state)) throw new HttpError(409, `Cleanup completion is not allowed from ${state || "blank"}`);
    const evidence = input.cleanup_evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new HttpError(400, "cleanup_evidence object is required");
    if (evidence.verified !== true) throw new HttpError(409, "cleanup_evidence.verified must be true before completing replacement cleanup");
    const platform = item6Platform(fields);
    const currentIdentity = item6Identity(fields);
    const obsolete = item6SafeJson(fields.Replace_Obsolete_JSON, null);
    if (!obsolete || obsolete.schema !== "ITEM6_OBSOLETE_V1") throw new HttpError(409, "Stored obsolete publication inventory is missing or invalid");
    if (!oldIdentity || obsolete.canonical_identity !== oldIdentity) throw new HttpError(409, "Stored obsolete publication identity does not match the last-good snapshot");
    if (!currentIdentity || currentIdentity === oldIdentity) throw new HttpError(409, "Replacement publication identity is not durably distinct from the obsolete publication");
    if (String(evidence.transaction_id || "").trim() !== transactionId) throw new HttpError(409, "cleanup_evidence.transaction_id does not match the active replacement transaction");
    if (String(evidence.replace_fingerprint || "").trim() !== fingerprint) throw new HttpError(409, "cleanup_evidence.replace_fingerprint does not match the active replacement fingerprint");
    if (String(evidence.platform || "").trim() !== platform) throw new HttpError(409, "cleanup_evidence.platform does not match the Platform Output");
    if (String(evidence.obsolete_identity || "").trim() !== oldIdentity) throw new HttpError(409, "cleanup_evidence.obsolete_identity does not match the stored obsolete publication");
    if (String(evidence.current_identity || "").trim() !== currentIdentity) throw new HttpError(409, "cleanup_evidence.current_identity does not match the replacement publication");
    const verification = evidence.verification && typeof evidence.verification === "object" && !Array.isArray(evidence.verification) ? evidence.verification : null;
    if (!verification || verification.obsolete_absent !== true || verification.replacement_present !== true) throw new HttpError(409, "cleanup_evidence.verification must prove obsolete_absent=true and replacement_present=true");
    const method = String(evidence.verification_method || "").trim();
    if (!["platform_api", "platform_ui_manual", "platform_reconciliation"].includes(method)) throw new HttpError(409, "cleanup_evidence.verification_method is not an approved verification method");
    const verifiedAt = Date.parse(String(evidence.verified_at || ""));
    if (!Number.isFinite(verifiedAt)) throw new HttpError(409, "cleanup_evidence.verified_at must be a valid timestamp");
    const updated = await item6PatchOutput(env, record.id, { Replace_State: "Complete", Replace_Cleanup_State: "Complete", Replace_Cleanup_Attempt_Count: Number(fields.Replace_Cleanup_Attempt_Count || 0) + 1, Replace_Error: null, Replace_Updated_At: now });
    return { action, idempotent: false, output: { id: record.id, output_id: fields.Output_ID ?? null, platform }, replace: { transaction_id: transactionId, fingerprint, state: "Complete", cleanup_state: "Complete", old_identity: oldIdentity, new_identity: currentIdentity, cleanup_evidence: evidence }, record: { id: updated.id } };
  }
'''
count=s.count(old)
if count != 1:
    raise SystemExit(f'Expected exactly one cleanup block, found {count}')
s=s.replace(old,new)
p.write_text(s,encoding='utf-8')
print('item6_cleanup_evidence_patch=PASS')
