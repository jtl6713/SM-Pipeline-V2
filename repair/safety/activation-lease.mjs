const MAKE_COMMANDS = new Set(['ACTIVATE', 'RUN', 'DEACTIVATE']);
const EFFECT_TYPES = new Set(['WRITE', 'EMAIL', 'R2', 'RENDER', 'PLATFORM']);

export class SafetyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SafetyError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function requiredText(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw new SafetyError('LEASE_FIELD_MISSING', `Missing required lease field: ${name}`, { field: name });
  return text;
}

function requiredPositiveInt(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new SafetyError('LEASE_FIELD_INVALID', `${name} must be a positive integer`, { field: name, value });
  }
  return number;
}

function isoTime(value, name) {
  const text = requiredText(value, name);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new SafetyError('LEASE_FIELD_INVALID', `${name} must be an ISO datetime`, { field: name, value });
  return { text, ms };
}

function uniqueStrings(values, name) {
  if (!Array.isArray(values)) throw new SafetyError('TEST_SCOPE_MISSING', `${name} must be an array`, { field: name });
  const result = [...new Set(values.map((v) => String(v ?? '').trim()).filter(Boolean))];
  if (!result.length) throw new SafetyError('TEST_SCOPE_EMPTY', `${name} must contain at least one exact ID`, { field: name });
  return Object.freeze(result);
}

export function normalizeLease(raw, nowMs = Date.now()) {
  const expires = isoTime(raw?.expires_at, 'expires_at');
  const lease = {
    lease_id: requiredText(raw?.lease_id, 'lease_id'),
    test_run_id: requiredText(raw?.test_run_id, 'test_run_id'),
    expires_at: expires.text,
    expires_at_ms: expires.ms,
    max_runs: requiredPositiveInt(raw?.max_runs, 'max_runs'),
    max_operations: requiredPositiveInt(raw?.max_operations, 'max_operations'),
    scenario_ids: Object.freeze((raw?.scenario_ids ?? []).map(Number).filter(Number.isFinite)),
    airtable_record_ids: uniqueStrings(raw?.airtable_record_ids, 'airtable_record_ids'),
    platform_output_ids: uniqueStrings(raw?.platform_output_ids, 'platform_output_ids'),
    public_publish_allowlist: Object.freeze((raw?.public_publish_allowlist ?? []).map((entry) => Object.freeze({
      platform: requiredText(entry?.platform, 'public_publish_allowlist.platform'),
      output_record_id: requiredText(entry?.output_record_id, 'public_publish_allowlist.output_record_id'),
    }))),
  };
  if (lease.expires_at_ms <= nowMs) throw new SafetyError('LEASE_EXPIRED', 'Lease expiry must be in the future', { expires_at: lease.expires_at });
  if (!lease.scenario_ids.length) throw new SafetyError('TEST_SCOPE_EMPTY', 'scenario_ids must contain at least one exact scenario ID');
  return Object.freeze(lease);
}

export function assertNoOverlappingLease(candidate, activeLeases, nowMs = Date.now()) {
  const activeScenarioIds = new Set(candidate.scenario_ids);
  for (const lease of activeLeases ?? []) {
    if (!lease || lease.lease_id === candidate.lease_id) continue;
    const expiresMs = Date.parse(lease.expires_at);
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) continue;
    const overlap = (lease.scenario_ids ?? []).find((id) => activeScenarioIds.has(Number(id)));
    if (overlap != null) {
      throw new SafetyError('LEASE_OVERLAP', `Scenario ${overlap} already has an active lease`, {
        scenario_id: Number(overlap), active_lease_id: lease.lease_id, requested_lease_id: candidate.lease_id,
      });
    }
  }
}

export class OperationLedger {
  #entries = [];
  append(entry) {
    const frozen = Object.freeze({ ...entry });
    this.#entries = Object.freeze([...this.#entries, frozen]);
    return frozen;
  }
  entries() { return this.#entries; }
  count(type = null) { return type ? this.#entries.filter((e) => e.type === type).length : this.#entries.length; }
}

export class SerialExecutor {
  #tail = Promise.resolve();
  enqueue(fn) {
    const next = this.#tail.then(fn, fn);
    this.#tail = next.catch(() => undefined);
    return next;
  }
}

export class LeaseSession {
  constructor({ lease, controller, ledger = new OperationLedger(), clock = () => Date.now() }) {
    this.lease = lease;
    this.controller = controller;
    this.ledger = ledger;
    this.clock = clock;
    this.runCount = 0;
    this.operationCount = 0;
    this.touchedScenarios = new Set();
    this.serial = new SerialExecutor();
  }

  assertLive() {
    if (this.clock() >= this.lease.expires_at_ms) {
      throw new SafetyError('LEASE_EXPIRED', 'Lease has expired', { lease_id: this.lease.lease_id });
    }
    if (this.operationCount >= this.lease.max_operations) {
      throw new SafetyError('OPERATION_BUDGET_EXHAUSTED', 'Operation budget exhausted', {
        lease_id: this.lease.lease_id, max_operations: this.lease.max_operations,
      });
    }
  }

  assertScenario(scenarioId) {
    const id = Number(scenarioId);
    if (!this.lease.scenario_ids.includes(id)) {
      throw new SafetyError('SCENARIO_NOT_ALLOWLISTED', `Scenario ${id} is outside this lease`, { scenario_id: id });
    }
    return id;
  }

  assertTarget({ airtable_record_id, output_record_id }) {
    const recordId = String(airtable_record_id ?? '').trim();
    const outputId = String(output_record_id ?? '').trim();
    if (!recordId || !this.lease.airtable_record_ids.includes(recordId)) {
      throw new SafetyError('RECORD_NOT_ALLOWLISTED', 'Airtable record is outside this test run', { airtable_record_id: recordId || null });
    }
    if (!outputId || !this.lease.platform_output_ids.includes(outputId)) {
      throw new SafetyError('OUTPUT_NOT_ALLOWLISTED', 'Platform Output is outside this test run', { output_record_id: outputId || null });
    }
    return { airtable_record_id: recordId, output_record_id: outputId };
  }

  assertPublicPublish({ platform, output_record_id }) {
    const match = this.lease.public_publish_allowlist.some((entry) =>
      entry.platform === String(platform ?? '').trim() && entry.output_record_id === String(output_record_id ?? '').trim()
    );
    if (!match) {
      throw new SafetyError('PUBLIC_PUBLISH_DENIED', 'Public publishing is denied by the test lease', {
        platform: platform ?? null, output_record_id: output_record_id ?? null,
      });
    }
  }

  reserveOperation(type, details = {}) {
    this.assertLive();
    const normalizedType = String(type ?? '').trim().toUpperCase();
    if (!MAKE_COMMANDS.has(normalizedType) && !EFFECT_TYPES.has(normalizedType)) {
      throw new SafetyError('OPERATION_TYPE_INVALID', `Unsupported operation type ${normalizedType}`);
    }
    if (normalizedType === 'RUN' && this.runCount >= this.lease.max_runs) {
      throw new SafetyError('RUN_BUDGET_EXHAUSTED', 'Run budget exhausted', {
        lease_id: this.lease.lease_id, max_runs: this.lease.max_runs,
      });
    }
    this.operationCount += 1;
    if (normalizedType === 'RUN') this.runCount += 1;
    return this.ledger.append({
      sequence: this.operationCount,
      type: normalizedType,
      lease_id: this.lease.lease_id,
      test_run_id: this.lease.test_run_id,
      at: new Date(this.clock()).toISOString(),
      ...details,
    });
  }

  command(action, scenarioId, data = null) {
    return this.serial.enqueue(async () => {
      const normalized = String(action ?? '').trim().toUpperCase();
      if (!MAKE_COMMANDS.has(normalized)) throw new SafetyError('COMMAND_INVALID', `Unsupported Make command ${normalized}`);
      const id = this.assertScenario(scenarioId);
      this.reserveOperation(normalized, { scenario_id: id });
      if (normalized === 'ACTIVATE') {
        const before = await this.controller.state(id);
        if (before.active) throw new SafetyError('SCENARIO_ALREADY_ACTIVE', `Scenario ${id} must be OFF before lease activation`, { scenario_id: id });
        await this.controller.activate(id);
        const after = await this.controller.state(id);
        if (!after.active) throw new SafetyError('STATE_VERIFICATION_FAILED', `Scenario ${id} did not become active`, { scenario_id: id });
        this.touchedScenarios.add(id);
        return after;
      }
      if (normalized === 'RUN') {
        const before = await this.controller.state(id);
        if (!before.active) throw new SafetyError('SCENARIO_NOT_ACTIVE', `Scenario ${id} must be active before RUN`, { scenario_id: id });
        const result = await this.controller.run(id, data);
        const after = await this.controller.state(id);
        if (!after.active) throw new SafetyError('STATE_VERIFICATION_FAILED', `Scenario ${id} unexpectedly became inactive during RUN`, { scenario_id: id });
        this.touchedScenarios.add(id);
        return result;
      }
      const before = await this.controller.state(id);
      if (before.active) await this.controller.deactivate(id);
      const after = await this.controller.state(id);
      if (after.active) throw new SafetyError('STATE_VERIFICATION_FAILED', `Scenario ${id} did not deactivate`, { scenario_id: id });
      this.touchedScenarios.add(id);
      return after;
    });
  }

  async cleanup(reason = 'finally') {
    const results = [];
    for (const scenarioId of this.touchedScenarios) {
      try {
        const before = await this.controller.state(scenarioId);
        if (before.active) await this.controller.deactivate(scenarioId);
        const after = await this.controller.state(scenarioId);
        const ok = !after.active;
        this.ledger.append({
          sequence: this.operationCount,
          type: 'CLEANUP', lease_id: this.lease.lease_id, test_run_id: this.lease.test_run_id,
          scenario_id: scenarioId, reason, verified_off: ok, at: new Date(this.clock()).toISOString(),
        });
        results.push({ scenario_id: scenarioId, verified_off: ok });
      } catch (error) {
        results.push({ scenario_id: scenarioId, verified_off: false, error: error?.message || String(error) });
      }
    }
    return results;
  }
}

export async function runWithLease({ lease, controller, body, clock = () => Date.now(), ledger = new OperationLedger() }) {
  const session = new LeaseSession({ lease, controller, clock, ledger });
  try {
    return await body(session);
  } finally {
    await session.cleanup('finally');
  }
}

export async function watchdogTick({ leases, controller, nowMs = Date.now(), ledger = new OperationLedger() }) {
  const results = [];
  for (const lease of leases ?? []) {
    const expired = Date.parse(lease.expires_at) <= nowMs;
    const operationsExhausted = Number(lease.operation_count ?? 0) >= Number(lease.max_operations ?? Infinity);
    const runsExhausted = Number(lease.run_count ?? 0) >= Number(lease.max_runs ?? Infinity);
    if (!expired && !operationsExhausted && !runsExhausted) continue;
    for (const rawId of lease.scenario_ids ?? []) {
      const scenarioId = Number(rawId);
      try {
        const before = await controller.state(scenarioId);
        if (before.active) await controller.deactivate(scenarioId);
        const after = await controller.state(scenarioId);
        const entry = ledger.append({
          type: 'WATCHDOG', lease_id: lease.lease_id, test_run_id: lease.test_run_id,
          scenario_id: scenarioId, expired, operations_exhausted: operationsExhausted,
          runs_exhausted: runsExhausted, verified_off: !after.active, at: new Date(nowMs).toISOString(),
        });
        results.push(entry);
      } catch (error) {
        results.push(Object.freeze({ scenario_id: scenarioId, verified_off: false, error: error?.message || String(error) }));
      }
    }
  }
  return results;
}
