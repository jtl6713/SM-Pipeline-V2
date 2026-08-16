import assert from 'node:assert/strict';
import { normalizeLease, assertNoOverlappingLease, OperationLedger, runWithLease, watchdogTick, SafetyError } from './activation-lease.mjs';

class FakeController {
  constructor(active = []) { this.active = new Set(active); this.runs = []; }
  async state(id) { return { active: this.active.has(id) }; }
  async activate(id) { this.active.add(id); }
  async deactivate(id) { this.active.delete(id); }
  async run(id, data) { this.runs.push({ id, data }); return { execution_id: `fake-${this.runs.length}` }; }
}

const NOW = Date.parse('2026-08-16T12:00:00Z');
function leaseRaw(overrides = {}) {
  return {
    lease_id: 'lease-A', test_run_id: 'REPAIR-TOP5-SAFETY-20260816-A',
    expires_at: '2026-08-16T12:10:00Z', max_runs: 1, max_operations: 8,
    scenario_ids: [5893243],
    airtable_record_ids: ['recrSWeLpsA5TtpX5'],
    platform_output_ids: ['recrSWeLpsA5TtpX5'],
    public_publish_allowlist: [],
    ...overrides,
  };
}

async function expectCode(fn, code) {
  let caught = null;
  try { await fn(); } catch (error) { caught = error; }
  assert(caught instanceof SafetyError, `Expected SafetyError ${code}`);
  assert.equal(caught.code, code);
}

for (const field of ['lease_id', 'test_run_id', 'expires_at', 'max_runs', 'max_operations']) {
  const raw = leaseRaw(); delete raw[field];
  assert.throws(() => normalizeLease(raw, NOW), SafetyError, field);
}
const lease = normalizeLease(leaseRaw(), NOW);
assert.throws(() => assertNoOverlappingLease(lease, [{ ...leaseRaw({ lease_id: 'lease-B' }) }], NOW), /active lease/);

{
  const controller = new FakeController();
  const ledger = new OperationLedger();
  await runWithLease({ lease, controller, ledger, clock: () => NOW, body: async (session) => {
    session.assertTarget({ airtable_record_id: 'recrSWeLpsA5TtpX5', output_record_id: 'recrSWeLpsA5TtpX5' });
    await expectCode(() => Promise.resolve(session.assertTarget({
      airtable_record_id: 'recpiwWGrph3lsTn6', output_record_id: 'recpiwWGrph3lsTn6',
    })), 'RECORD_NOT_ALLOWLISTED');
    await expectCode(() => Promise.resolve(session.assertPublicPublish({ platform: 'Facebook', output_record_id: 'recrSWeLpsA5TtpX5' })), 'PUBLIC_PUBLISH_DENIED');
    await session.command('ACTIVATE', 5893243);
    await session.command('RUN', 5893243, { output_record_id: 'recrSWeLpsA5TtpX5' });
  }});
  assert.equal((await controller.state(5893243)).active, false, 'success cleanup must leave bridge OFF');
  assert.equal(controller.runs.length, 1);
  assert(ledger.entries().every(Object.isFrozen), 'ledger entries must be immutable');
  await expectCode(async () => runWithLease({ lease, controller, clock: () => NOW, body: async (session) => {
    await session.command('ACTIVATE', 5893243);
    await session.command('RUN', 5893243);
    await session.command('RUN', 5893243);
  }}), 'RUN_BUDGET_EXHAUSTED');
  assert.equal((await controller.state(5893243)).active, false, 'budget rejection cleanup must leave bridge OFF');
}

{
  const controller = new FakeController();
  await assert.rejects(() => runWithLease({ lease, controller, clock: () => NOW, body: async (session) => {
    await session.command('ACTIVATE', 5893243);
    throw new Error('simulated failure');
  }}), /simulated failure/);
  assert.equal((await controller.state(5893243)).active, false);
}

{
  let now = NOW;
  const controller = new FakeController();
  await expectCode(() => runWithLease({ lease, controller, clock: () => now, body: async (session) => {
    await session.command('ACTIVATE', 5893243);
    now = lease.expires_at_ms + 1;
    await session.command('RUN', 5893243);
  }}), 'LEASE_EXPIRED');
  assert.equal((await controller.state(5893243)).active, false);
}

{
  const controller = new FakeController([5893243]);
  const ledger = new OperationLedger();
  const result = await watchdogTick({
    controller, ledger, nowMs: Date.parse('2026-08-16T12:11:00Z'),
    leases: [{ ...leaseRaw(), operation_count: 1, run_count: 0 }],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].verified_off, true);
  assert.equal((await controller.state(5893243)).active, false);
}

{
  const tight = normalizeLease(leaseRaw({ max_operations: 1, max_runs: 1 }), NOW);
  const controller = new FakeController();
  await expectCode(() => runWithLease({ lease: tight, controller, clock: () => NOW, body: async (session) => {
    await session.command('ACTIVATE', 5893243);
    session.reserveOperation('EMAIL', { output_record_id: 'recrSWeLpsA5TtpX5' });
  }}), 'OPERATION_BUDGET_EXHAUSTED');
  assert.equal((await controller.state(5893243)).active, false);
}

console.log('activation-lease safety contract: PASS');
