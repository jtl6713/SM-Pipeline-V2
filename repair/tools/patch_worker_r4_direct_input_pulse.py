from pathlib import Path

path = Path('apps/studio-api/worker.js')
text = path.read_text()

health_anchor = '          repair_r4_token_exact_entry_v1: true,\n'
health_line = '          repair_r4_direct_input_pulse_v1: true,\n'
if health_line not in text:
    if health_anchor not in text:
        raise SystemExit('R4 health anchor not found')
    text = text.replace(health_anchor, health_anchor + health_line, 1)

start = '  if (action === "pulse_r4_exact_output") {\n'
end = '  if (action === "pulse_admin_bridge") {\n'
si = text.find(start)
ei = text.find(end, si + 1) if si >= 0 else -1
if si < 0 or ei < 0:
    raise SystemExit('R4 pulse block anchors not found')

replacement = r'''  if (action === "pulse_r4_exact_output") {
    if (lease.scenario_id !== 5556716) throw new HttpError(403, "pulse_r4_exact_output is limited to R4 scenario 5556716");
    const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
    if (!lease.contract.allowed_platform_output_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is outside this test_run_id allowlist`);
    }
    if (lease.contract.deny_fixture_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is an explicit denial fixture`);
    }

    const target = await airtableFetch(env, "Platform Outputs", recordId);
    const fields = target?.fields || {};
    if (lease.contract.allow_public_publish !== true && fields.Do_Not_Publish !== true) {
      throw new HttpError(403, "R4 repair pulse requires Do_Not_Publish=true unless the lease explicitly allows publishing");
    }
    if (String(fields.Render_Status || "") !== "Ready for Render") throw new HttpError(409, "Target output is not Ready for Render");
    for (const required of ["Composition_ID", "Output_Filename", "Render_Clip_List_JSON", "Render_Total_Frames"]) {
      if (fields[required] === null || fields[required] === undefined || fields[required] === "" || fields[required] === 0) {
        throw new HttpError(409, `Target output is missing required R4 field ${required}`);
      }
    }
    const platformOutputId = String(fields.Output_ID ?? "").trim();
    if (!platformOutputId) throw new HttpError(409, "Target output is missing Output_ID");
    const attemptNumber = Number.isInteger(Number(input?.attempt_number)) && Number(input.attempt_number) > 0 ? Number(input.attempt_number) : 1;
    const intendedStage = repairString(input?.intended_stage || "R4", "intended_stage", 20).toUpperCase();
    if (intendedStage !== "R4") throw new HttpError(409, "R4 exact pulse requires intended_stage=R4");
    const idempotencyKey = repairString(
      input?.idempotency_key || `${lease.test_run_id}:R4:${recordId}:${attemptNumber}`,
      "idempotency_key",
      180,
    );
    const runInput = {
      test_run_id: lease.test_run_id,
      output_record_id: recordId,
      platform_output_id: platformOutputId,
      intended_stage: "R4",
      attempt_number: attemptNumber,
      idempotency_key: idempotencyKey,
    };

    await repairReserveBudget(env, lease, { operationCost: 8, runCost: 1, action });
    const before = await phase6ScenarioState(env, lease.scenario_id);
    const beforeJobId = String(fields.Remotion_Job_ID || "");
    let failure = null;
    let stop = null;
    let exactTargetConsumed = false;
    let finalTarget = target;
    try {
      if (!before.isActive) await phase6SetScenarioActive(env, lease.scenario_id, true);
      const execution = await phase6RunScenario(env, lease.scenario_id, runInput);
      for (let i = 0; i < 30; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        finalTarget = await airtableFetch(env, "Platform Outputs", recordId);
        const currentFields = finalTarget?.fields || {};
        const status = String(currentFields.Render_Status || "");
        const currentJobId = String(currentFields.Remotion_Job_ID || "");
        if (status !== "Ready for Render" || (currentJobId && currentJobId !== beforeJobId)) {
          exactTargetConsumed = true;
          break;
        }
      }
      if (!exactTargetConsumed) throw new HttpError(504, "R4 exact input did not advance the targeted output within 30 seconds");
      return {
        action,
        lease,
        platform_output_record_id: recordId,
        platform_output_id: platformOutputId,
        intended_stage: "R4",
        attempt_number: attemptNumber,
        idempotency_key: idempotencyKey,
        execution_id: execution.executionId,
        exact_input_dispatched: true,
        exact_target_consumed: true,
        final_render_status: String(finalTarget?.fields?.Render_Status || ""),
        final_remotion_job_id_present: Boolean(finalTarget?.fields?.Remotion_Job_ID),
      };
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      try { stop = await phase6StopScenarioVerified(env, lease.scenario_id, 2); } catch (stopError) {
        if (!failure) failure = stopError instanceof Error ? stopError.message : String(stopError);
      }
      try { await repairClearR4LeaseToken(env, lease); } catch (cleanupError) {
        if (!failure) failure = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      }
      if (stop?.inactive !== true || failure) {
        try { await repairCloseLease(env, lease, "failed", { reason: "r4-exact-pulse-failed", scenario_stopped: stop?.inactive === true, error: failure || "R4 did not verify inactive" }); } catch {}
      } else {
        try { await repairCloseLease(env, lease, "released", { reason: "r4-exact-one-run-complete", scenario_stopped: true, exact_input_dispatched: true, exact_target_consumed: exactTargetConsumed, operations_used: lease.operations_used, runs_used: lease.runs_used }); } catch {}
      }
    }
  }

'''

text = text[:si] + replacement + text[ei:]
path.write_text(text)
