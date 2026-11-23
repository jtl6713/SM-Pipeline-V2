# Incident #2670 — Supabase load evidence (read-only)

**Purpose:** Prove stable operation without confusing a quieter system with higher throughput.
This is a nonpublishing audit; it does not mutate production, approve content, release DNP
holds, trigger provider calls, restart Airtable/Make, or activate disabled consumers.

## Verified samples

- Incident ramp **2026-11-22 12:20–12:40 UTC**: 18,465 edge_logs gateway requests across four complete 5-minute buckets; 1,080 failed optional-outbox 404 responses; 696 writes to studio_media_transfer_queue.
- Recovery observation **2026-11-23 00:00–01:00 UTC**: 11,351 gateway requests across twelve complete 5-minute buckets; **0** observed HTTP 5xx, 522 or optional-outbox 404; 14 writes to studio_media_transfer_queue.
- Incident average: **4,616.25 requests per five minutes**; recovery average: **945.92**. This is an **observed 79.5% decrease in gateway traffic**, not a throughput-normalized workload benchmark. The windows differ in duration, content processing, source/API mix, Studio read activity, and publishing workload.
- Read-only pg_stat_activity at **2026-11-23 01:07:27 UTC**: 22 connections, 1 active, 0 lock waiters, 0 idle in transaction. One snapshot does not prove sustained health.

Source: live Supabase project's read-only edge-log query and canonical read-only SQL, project ref vkwvscgisqsbuwagdvtb. The sanitized *per-five-minute aggregates*, not credentials, request URLs, headers or user identities, are checked into [2670-load-observation-20261123.json](./2670-load-observation-20261123.json).

## Reproduce offline from sanitized evidence

Run:

    python repair/scripts/incident2670_load_evidence.py --input docs/incidents/2670-load-observation-20261123.json

Run tests:

    python -m unittest discover -s repair/scripts -p incident2670_load_evidence_test.py -v

The report has independent gates:

1. **outbox_404:** zero optional-outbox 404s **in the supplied complete window**.
2. **http_5xx:** zero gateway 5xx **in the supplied complete window**.
3. **target_70pct:** **INCONCLUSIVE until validated workload counts are supplied** for baseline and recovery. If counts of production jobs, media transfers, render jobs, and Studio reads are complete and similar in mix, report workload-normalized requests per completed work unit and compare to the target. A lower overall gateway traffic rate without workload evidence is insufficient.
4. **duplicate_claims:** **INCONCLUSIVE** unless a complete multi-process claim/attempt audit is provided. Do not mark zero duplicate claims from code tests alone.

## Read-only Supabase logs query for future samples

Run separately for exact bounded UTC windows, with at least four complete 5-minute buckets. **Use the precise log interval** in the Supabase log query interface; do not include an in-progress bucket. Do not query unbounded logs.

~~~sql
SELECT
  toStartOfFiveMinutes(timestamp) AS bucket,
  count() AS requests,
  countIf(toInt32OrZero(log_attributes['response.status_code']) BETWEEN 500 AND 599) AS errors_5xx,
  countIf(toInt32OrZero(log_attributes['response.status_code']) = 522) AS errors_522,
  countIf(
    toInt32OrZero(log_attributes['response.status_code']) = 404
    AND position(log_attributes['request.path'], 'studio_side_effect_outbox') > 0
  ) AS optional_outbox_404,
  countIf(log_attributes['request.method'] IN ('POST','PATCH','PUT','DELETE')) AS mutations
FROM logs
WHERE source = 'edge_logs'
GROUP BY bucket
ORDER BY bucket;
~~~

Supabase log query parameters must separately enforce iso_timestamp_start and
iso_timestamp_end. The result is **all Supabase edge gateway traffic**, not
runner-only Supabase REST. For a workload-normalized analysis also capture per-lane
completed production/media/render work and Studio read counts (without request IDs,
credentials, user data, media URL, or potentially sensitive headers), and verify
cross-process claim audit completeness. If cohorts or mix cannot be validated,
the 70% engineering acceptance criterion stays **INCONCLUSIVE**.

## Incident hardening acceptance remains separate from outage recovery

The four main fixes (#2671–#2674), Worker 522/5xx recognition (#2750),
and protected Worker deployment (#45092104906) are distinct milestones.
Deployment does **not** prove global coordination: the Runner SQLite governor
spans one Windows host and the Worker circuit is currently isolate-local.
A cross-host/shared overload coordinator requires independently designed
shared state, failure-mode tests, authentication and a protected rollout.
Do not repurpose the scheduling Durable Object namespace or use the Supabase
database as a mandatory overload-coordination dependency during DB failure.

Admin → QA Test Center should ultimately display authoritative bounded
workload counts, request rate/errors, retries, current circuit state and
confidence/evidence for each release. Do not fabricate a passing QA result.
