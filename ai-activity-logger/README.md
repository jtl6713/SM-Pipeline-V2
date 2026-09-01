# ai-activity-logger

Universal logger for Cursor, Claude, ChatGPT, Copilot, GitHub Actions, and terminal activity.

Posts events to:

`https://tasks.chicagoshining.com/agent-activity/log-event`

## Install (sibling clone)

```bash
npm install ../ai-activity-logger
```

In this monorepo the module also lives at `./ai-activity-logger`:

```bash
npm install ./ai-activity-logger
```

## Usage

```js
import { logEvent } from "ai-activity-logger";

await logEvent({
  task_id: 1,
  agent_id: 3,
  type: "cursor_action",
  payload: { message: "example" }
});
```

The host is `tasks.chicagoshining.com`. Cloudflare Access login pages on that hostname are a misconfiguration for this POST — `/agent-activity/log-event` and `/health` must stay public JSON. Optional `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` are sent when set.

## Agent IDs

| Agent | agent_id |
|---|---:|
| Cursor (frontend) | 3 |
| Claude (backend) | 7 |
| ChatGPT (automation) | 9 |
| Copilot (infra) | 11 |
| GitHub Actions | 13 |
