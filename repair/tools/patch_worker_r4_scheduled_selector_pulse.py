from pathlib import Path

path = Path('apps/studio-api/worker.js')
text = path.read_text()

health_old = '          repair_r4_direct_input_pulse_v1: true,\n          repair_exact_output_test_mode_v1: true,'
health_new = '          repair_r4_direct_input_pulse_v1: true,\n          repair_r4_scheduled_selector_pulse_v1: true,\n          repair_exact_output_test_mode_v1: true,'
if 'repair_r4_scheduled_selector_pulse_v1' not in text:
    if text.count(health_old) != 1:
        raise SystemExit('health insertion marker not found exactly once')
    text = text.replace(health_old, health_new, 1)

marker = '  if (action === "pulse_r4_exact_output") {'
if 'action === "pulse_r4_scheduled_selector"' not in text:
    if text.count(marker) != 1:
        raise SystemExit(f'exact pulse marker count unexpected: {text.count(marker)}')
    branch = r'''  if (action === "pulse_r4_scheduled_selector") {
    if (lease.scenario_id !== 5556716) throw new HttpError(403, "pulse_r4_scheduled_selector is limited to R4 scenario 5556716");
    const recordId = repairString(input.platform_output_record_id, "platform_output_record_id", 32);
    if (!lease.contract.allowed_platform_output_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is outside this test_run_id allowlist`);
    }
    if (lease.contract.deny_fixture_record_ids.includes(recordId)) {
      throw new HttpError(403, `Platform Output ${recordId} is an explicit denial fixture`);
    }
    const output = await repairVerifyOutputRecord(env, recordId, lease.contract.allow_public_publish === true);
    const selectorFormula = 'AND({Render_Status}="Ready for Render",{Composition_ID}!="",{Output_Filename}!="",{Render_Clip_List_JSON}!="",{Render_Total_Frames}>0)';
    const eligible = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, { limit: 3, filterFormula: selectorFormula });
    if (eligible.length !== 1 || eligible[0]?.id !== recordId) {
      throw new HttpError(409, `R4 scheduled-selector pulse requires exactly one eligible Platform Output and it must be ${recordId}`);
    }
    await repairReserveBudget(env, lease, { operationCost: 6, runCost: 1, action });
    const before = await phase6ScenarioState(env, lease.scenario_id);
    const observedScheduling = repairInspectorClone(before?.scenario?.scheduling || {});
    if (before.isActive) throw new HttpError(409, "R4 must be OFF before scheduled-selector pulse");
    if (observedScheduling?.type !== "indefinitely" || Number(observedScheduling?.interval || 0) !== 900) {
      throw new HttpError(409, `R4 canonical 15-minute schedule is not present: ${JSON.stringify(observedScheduling)}`);
    }
    let stop = null;
    let failure = null;
    try {
      await phase6SetScenarioActive(env, lease.scenario_id, true);
      const observed = await phase6WaitForOutputStatus(env, recordId, (record) => {
        const status = String(f(record, "Render_Status") || "");
        return ["Rendering", "Rendered", "Failed"].includes(status);
      }, 45000, 1000);
      if (!observed?.matched) throw new HttpError(502, `R4 scheduled selector did not advance Platform Output ${recordId} within 45 seconds`);
      const afterFields = observed?.record?.fields || {};
      return {
        action,
        lease,
        target_record_id: recordId,
        selector_eligible_count: eligible.length,
        selector_target_only: true,
        observed_status: String(afterFields.Render_Status || ""),
        remotion_job_id_present: Boolean(afterFields.Remotion_Job_ID),
        remotion_status_url_present: Boolean(afterFields.Remotion_Status_URL),
        scenario_was_active: before.isActive,
        schedule_preserved: true,
      };
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      try { stop = await phase6StopScenarioVerified(env, lease.scenario_id, 3); } catch (stopError) {
        if (!failure) failure = stopError instanceof Error ? stopError.message : String(stopError);
      }
      if (stop?.inactive !== true || failure) {
        try { await repairCloseLease(env, lease, "failed", { reason: "r4-scheduled-selector-pulse-failed", scenario_stopped: stop?.inactive === true, error: failure || "R4 did not verify inactive" }); } catch {}
      } else {
        try { await repairCloseLease(env, lease, "released", { reason: "r4-scheduled-selector-one-run-complete", scenario_stopped: true, selector_target_only: true, operations_used: lease.operations_used, runs_used: lease.runs_used }); } catch {}
      }
    }
  }

'''
    text = text.replace(marker, branch + marker, 1)

# Safety assertions: exact pulse remains present; generic run/activate remains blocked.
for required in (
    'if (action === "pulse_r4_scheduled_selector")',
    'if (action === "pulse_r4_exact_output")',
    'Standalone ACTIVATE/RUN is intentionally disabled',
    'selectorFormula',
    'phase6StopScenarioVerified(env, lease.scenario_id, 3)',
):
    if required not in text:
        raise SystemExit(f'missing required contract after patch: {required}')

path.write_text(text)
print('r4_scheduled_selector_pulse_patch=applied')
