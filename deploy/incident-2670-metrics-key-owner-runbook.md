# Issue #2670 — protected Supabase Metrics API credential setup

**Owner-only secure setup. Never commit, paste, print, message, or attach a secret value.**

## Exact target

- Project ref: `vkwvscgisqsbuwagdvtb`, currently named `sm-pipeline-v2-dev` (live Studio).
- Metrics endpoint: `https://vkwvscgisqsbuwagdvtb.supabase.co/customer/v1/privileged/metrics` (GET only).
- On the authorized Windows runner only, local secrets file:
  `D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service\.env`.
- Unique setting name (example only; **do not type literal dots**):
  `SUPABASE_METRICS_SECRET_KEY=sb_secret_...`

## Owner action

1. Sign into [Supabase Dashboard](https://supabase.com/dashboard/project/vkwvscgisqsbuwagdvtb/settings/api-keys), verify the exact project ref, go to **Project Settings → API Keys**. Under **Publishable and secret API keys**, create a **new separate secret key** named for incident #2670 metrics monitoring. Do not create a publishable key. Do not rotate, disable, or replace application keys.
2. On the actual protected Windows computer, while signed in as an authorized operator, locally open the `.env` file above in a secure text editor. Add **exactly one** `SUPABASE_METRICS_SECRET_KEY=` entry with the created `sb_secret_` value. Preserve all existing lines, including `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Avoid duplicate entries, backup files in synchronized/public directories, screen recordings, screenshots, clipboard-history syncing, and commands that echo the value.
3. Ensure the local `.env` file remains restricted to the runner identity and authorized administrators. Do not add this key to GitHub Actions Secrets, PRs, code, issue comments, chat, email, logs, or browser client code. **There is no requirement to restart running production services:** the protected PowerShell probe opens the file afresh on each run. If the owner chooses to rotate/revoke this *dedicated* key later, repeat the setup for that same local file only.
4. The owner replies **“metrics key configured”** without supplying the value. The incident operator then executes the preexisting GitHub Actions workflow `Incident 2670 Supabase Memory And Swap Readonly` (workflow_dispatch or a protected failed-job rerun) and reads only its sanitized classification and memory/swap numbers.

## Important privilege caveat

Despite being used by a **GET-only probe**, Supabase `sb_secret_` keys resolve to `service_role` and bypass RLS. This is **not a metrics-only/read-only credential**. A *separate, server-only, independently revocable key* limits rotation blast radius but does not limit the privileges of a stolen key. Never expose it; use a dedicated key and secure machine.

## Validation / release gate

Expected success receipts:
`incident2670_metrics=PASS_TWO_READONLY_SAMPLES` and `incident2670_metrics_production=PASS_READONLY`, with numeric memory/swap totals, available memory, used %, and delta. `NEEDS_EXISTING_SB_SECRET`, `API_UNAVAILABLE`, or `REQUIRED_SERIES_UNAVAILABLE` means **unverified**, not healthy.

Do not infer RAM recovery from screenshots of an earlier selected timepoint, SQL connection counts, or a successful preflight alone. Do not enable the global coordinator, raise producer concurrency, reenable optional outbox, remove publishing holds, or call publishing providers for this step.

References: [Supabase Metrics API](https://supabase.com/docs/guides/observability/metrics), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [issue #2670](https://github.com/jtl6713/SM-Pipeline-V2/issues/2670).
