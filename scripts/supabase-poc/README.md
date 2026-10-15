# Supabase Phase 2 POC scripts

Dev-only helpers for `sm-pipeline-v2-dev`. **Never commit secrets.**

## Setup

```bash
# local only
cat >/tmp/sm-pipeline-v2-dev.supabase.env <<'EOF'
SUPABASE_URL=https://vkwvscgisqsbuwagdvtb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_DB_PASSWORD=...
EOF
source /tmp/sm-pipeline-v2-dev.supabase.env
```

1. Apply `docs/supabase-migration/phase1/001_core_schema.sql` (SQL Editor → Run without RLS for POC).
2. Apply `grant-service-role.sql` if REST returns `42501 permission denied`.
3. Place Airtable export JSON under `/tmp/supabase-poc-export/` (`content_profiles.json`, `content_items_chicago.json`, `platform_outputs_chicago.json`).
4. Import + benchmark:

```bash
node scripts/supabase-poc/import-chicago.mjs
node scripts/supabase-poc/benchmark-rest.mjs
```

Report: `docs/supabase-migration/phase2/SM_Pipeline_V2_Supabase_Phase_2_POC_Report.md`
