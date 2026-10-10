# SM Pipeline local Windows watchdog

Checks Remotion's HTTP health endpoint every five minutes from Windows Task Scheduler. Restarts at most three times per consecutive outage, with a five-minute cooldown; attempts stop at the configured limit until health recovers.

## Gmail notifications (durable retry)

Set `notificationEmailTo` in your local `watchdog.local.json`. The tracked `send-watchdog-email.ps1` uses the existing DPAPI-encrypted `gmail-credential.local.xml` and the installed `Send-MailKitMessage` PowerShell module, with TLS required on `smtp.gmail.com:465` and Gmail app-password LOGIN authentication. It does not embed passwords or email addresses in committed code.

Events are stored under `_pendingNotifications` inside `watchdog.state.json` *before* sending. A successful email removes its pending Gmail channel; errors keep it pending and it retries on subsequent checks, even if Remotion is healthy. The state and queue are serialized together. Successful multi-channel deliveries are checkpointed separately. Alerts have explicit subjects:

- `[ChicagoShining Watchdog] Remotion renderer DOWN`
- `[ChicagoShining Watchdog] Remotion renderer RESTART ATTEMPT`
- `[ChicagoShining Watchdog] Remotion renderer RESTART FAILED`
- `[ChicagoShining Watchdog] Remotion renderer RESTART LIMIT`
- `[ChicagoShining Watchdog] Remotion renderer RECOVERED`

The retry queue is **at-least-once**, so a PC crash between SMTP acceptance and recording success can cause a duplicate. A permanently failing email remains pending until successfully delivered; do not delete the state file to troubleshoot.

## Updating an already configured Windows PC

Important: Older installs have **local edits** to `watchdog.ps1` and an untracked working `send-watchdog-email.local.ps1`. Back up `watchdog.ps1` and the local JSON/credential file; do not discard those secrets or your start script. Restore only `scripts/production-services/watchdog.ps1` in Git before pulling the new tracked implementation (see operator instructions in the rollout message). Other uncommitted repository changes should be reviewed, not overwritten.

From `scripts/production-services` after pulling:

```powershell
.\configure-watchdog-email.ps1 -To 'your-inbox@example.com'
.\test-watchdog.ps1
.\send-watchdog-email.ps1 -Subject '[ChicagoShining Watchdog] TEST' -Message 'Test alert' -To 'your-inbox@example.com'
.\watchdog.ps1
```

The Gmail credential is scoped to the Windows user that created it. The scheduled task must run as that same user. The `Run only when user is logged on` option continues checking while the session is locked, but not after sign-out or sleep.

Remotion health is `http://127.0.0.1:3333/health` on the known Windows PC. The restart script is intentionally local at `start-remotion.local.ps1`; it must have been tested and must exit. The watchdog's restart invocation quotes that path and checks the script's exit code. HTTP health is re-evaluated on the next check.

## Local diagnostics

```powershell
Get-Content .\watchdog.state.json
Get-ScheduledTaskInfo -TaskName 'SM-Pipeline Local Service Watchdog'
Invoke-RestMethod http://127.0.0.1:3333/health
```

Run `test-watchdog.ps1` to exercise DOWN, retry, recovery, queue cleanup and subject names *in an isolated temp directory*; it does not stop the production renderer, alter Task Scheduler, or send real email.

Use `watchdog.example.json` to create new configurations. Configure either Gmail or an authorized webhook, or both; with no delivery channel, events are recorded but cannot be delivered. Never commit `watchdog.local.json`, `gmail-credential.local.xml`, the private local email script, or runtime state.

The watchdog cannot detect a powered-off PC because it runs on that PC; external monitoring is required for that failure mode.
