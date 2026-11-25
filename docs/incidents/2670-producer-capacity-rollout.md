# Incident 2670 — Producer capacity restoration

Owner direction, November 24 Chicago time: target three concurrent producers. Do not restore the pre-incident unbounded producer model.

## Baseline
- Protected run 45555537162, 05:43:54 UTC Nov 25: 29 current eligible requests; 28 durable queue identities, 27 queued and available, 1 running, 1 absent; cap 1, circuit closed, no maintenance/admission pause, no expired running lease, max yield streak 6. Exact REST read 285 ms.
- Last protected memory probe 45111872934 attempt 2: dedicated metrics credential absent. New marker reruns the current read-only probe. Missing memory evidence is a blocker, not a passing result.
- Runner deployments 45553517529 and 45554851013 verified. Independent watchdog source #3037 merged a9ddc362ac0ed7677a18b05a01aad3f459ed7052; production release/readback separate.

## Stage progression
1. Confirm healthy canonical authority, closed circuit, durable queues and leases, no maintenance, optional outbox disabled; prove cross-host admission/expiry/recovery using real clients and verify actual runtime configuration. Record representative cap-1 work, current memory/swap, latency/error rate, throughput and queue aging. Do not interpret idle or two point samples alone as representative load.
2. Stage cap 2 using the existing protected Windows Ops deployment path, modifying only STUDIO_MAX_PRODUCER_JOBS; keep DB read/write, ratio/photo/transfer limits, I1 and publishing settings unchanged. Use safe drain, exact prior config backup, and live readback. No force stop, lease edits or raw DB queue manipulation. Sample representative active jobs and compare against baseline; prove no duplicate claims/lost work and actual Factory-ready results.
3. Only after stage 2 passes, repeat for cap 3. If stage 2 cannot pass, cap 3 is not approved for activation. The requested target is not a claim of achieved live capacity.

## Trial stop conditions (conservative proposed acceptance thresholds, not measured system limits)
- Any new database 522/5xx, open/half-open circuit, admission failure storm, unexpected provider/approval effect, duplicate active identity, lost durable work, or sustained increasing swap usage: stop expansion and use normal guarded drain/rollback to the last accepted cap.
- Compare p95 origin latency, completed jobs per unit time by stage, queue dwell time, memory available, swap, I/O and REST calls per completed job against comparable baseline. Sustained degradation or insufficient evidence means no further increase.
- Record at least one representative busy interval and successful end-to-end outputs at each stage. Preserve final human Factory approval. No automatic publication or hold release.
- No key fallback or secrets in logs/chat/repository. If monitoring credentials are missing, report the specific failed gate and preserve cap 1 until an acceptable baseline can be established.

Do not mark #2670 or #2853 complete on merge, deployment, or a changed limit alone.
