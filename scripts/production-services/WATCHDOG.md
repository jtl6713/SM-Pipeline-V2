# Local Windows service watchdog

This is a **local PC** watchdog, not Cloudflare monitoring. It checks every five minutes, alerts on a down transition, attempts at most three consecutive restarts (five-minute cooldown), alerts on exhaustion, and resets the counter only after a healthy check. It sends recovery alerts and avoids repeating DOWN notifications.

## Installation (on the Windows rendering PC)

1. Copy `watchdog.example.json` to `watchdog.local.json` in this folder. **Do not commit local configuration or webhook secrets.**
2. Replace the example Remotion health URL with the **actual local listener URL**. Replace the restart script path with a verified local startup script that exits after launching the service. The sample URL and script are placeholders, **not verified production endpoints**.
3. Set `notificationWebhookUrl` to an authorized JSON webhook accepting `{"text":"..."}` (e.g. a compatible Teams/Slack relay). Leaving it empty only logs messages; it does **not** notify anyone.
4. Run PowerShell as the account authorized to start the services and register tasks: `powershell -ExecutionPolicy Bypass -File .\install-watchdog.ps1`.
5. Test a service stop and confirm DOWN, restart, exhaustion and RECOVERED notifications. Ensure the watchdog task runs even after logout under the correct account.

Windows services can use `{"name":"Runner","type":"windows-service","serviceName":"ActualServiceName"}`. Process checks use `type: process`, `processName`, `restartCommand` and `restartWorkingDirectory`. HTTP checks are preferred for Remotion because a running process can be unresponsive.

The watchdog intentionally **does not kill processes** or endlessly restart them. After reaching the limit, it keeps checking health but stops restarting until a healthy check resets the count or the state file is deliberately cleared by an operator. It requires the PC and Task Scheduler to be running; external monitoring is needed to detect a powered-off PC.
