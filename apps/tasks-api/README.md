# tasks.chicagoshining.com

AI activity logging posts to:

`https://tasks.chicagoshining.com/agent-activity/log-event`

That hostname must return JSON. A Cloudflare Access login page is a misconfiguration for this POST.

## What GitHub Actions can do

`configure-tasks-hostname.yml` already:

- Points the shared tunnel at `http://localhost:3360`
- Deploys `chicagoshining-tasks`
- Tries to create Access **Bypass** apps for `/agent-activity/log-event` and `/health`

The current `CLOUDFLARE_API_TOKEN` can read Access apps and write tunnel/Worker config. It returns **403** when creating Access policies.

## What still has to happen once

In Zero Trust → Access → Applications, add two self-hosted apps (more specific paths win over `*.chicagoshining.com` / Studio):

1. Domain `tasks.chicagoshining.com`, path `/agent-activity/log-event`, policy **Bypass** include **Everyone**
2. Domain `tasks.chicagoshining.com`, path `/health`, policy **Bypass** include **Everyone**

Or add `Access: Apps and Policies Write` to the GitHub `CLOUDFLARE_API_TOKEN` and re-run the workflow.

Optional always-on origin (no Windows FastAPI): repo secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then re-run the workflow so the Worker can insert into `events`.
