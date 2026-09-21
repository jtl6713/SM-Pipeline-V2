# Ops Dashboard

Local operator site for the Chicago Shining START / STOP / VERIFY / SYNC / PLAN / DEPLOY shortcuts. It shows listener status, explains each action, and runs only the allowlisted scripts in `deploy/local-services/Invoke-OpsDashboardAction.ps1`.

- Local: `http://127.0.0.1:3361`
- Optional public hostname: `https://ops.chicagoshining.com` (Cloudflare Tunnel + Access + token)

## What it is not

It does not run arbitrary commands. It does not replace Studio, Task Organizer, or Quality Agent. STOP ALL from the stock shortcut still leaves this dashboard up so you can start services again.

## Start on this PC

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\deploy\local-services\Install-OpsDashboard.ps1"
```

That writes `D:\Content Creation\ChicagoShining Pipeline\Services\ops-dashboard\.env` (token + paths), starts the listener hidden, and opens the local URL. After the first copy, `Deploy-SMService.ps1 -Service ops-dashboard` ships later Git changes the same way as the other managed services.

Hidden start is also on `Start-ChicagoShiningHidden.ps1 -Service ops-dashboard` and the all-services hidden starter.

## Callable API (ChatGPT / scripts)

- **OpenAPI:** `GET /api/openapi.json` (public) — import into ChatGPT Custom Actions
- **CLI:** `deploy/local-services/Invoke-OpsApi.ps1` — JSON stdout, `-Wait` for deploy jobs
- **Handoff:** `docs/handoffs/ops-dashboard-api.md`

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File "..\..\deploy\local-services\Invoke-OpsApi.ps1" status

powershell -NoProfile -ExecutionPolicy Bypass `
  -File "..\..\deploy\local-services\Invoke-OpsApi.ps1" `
  run -Action deploy-pipeline-runner -Confirm -Wait
```

## Auth

`/health` and `/api/openapi.json` are public. All other `/api/*` routes require a token when `DASHBOARD_TOKEN` is set.

Everything else:

- Empty `DASHBOARD_TOKEN`: only loopback is accepted.
- Set token: send `Authorization: Bearer`, `X-Ops-Token`, or `?token=`.

Do not publish the hostname until a long token exists **and** a Cloudflare Access application allows only your email.

## Cloudflare (access from anywhere)

The named tunnel is remotely managed. Add a Public Hostname in Zero Trust:

1. Open [the named tunnel](https://one.dash.cloudflare.com/cbb5651c94e9bd2efc4594dc87229acb/networks/tunnels/f7a22f0f-f760-4e16-a085-3538d22981f1).
2. Public Hostname: subdomain `ops`, domain `chicagoshining.com`, service `http://localhost:3361`.
3. Cloudflare Access application on `ops.chicagoshining.com` — include only `joseph.t.logan@gmail.com`.
4. Confirm `DASHBOARD_TOKEN` is set in the live `.env`.
5. Check `https://ops.chicagoshining.com/health` then open the site and paste the token.

Or run `deploy/local-services/Open-OpsDashboardTunnel.ps1` to open that tunnel page.

This dashboard stays on the Windows PC. Do not add it to the Oracle VM compose cutover.