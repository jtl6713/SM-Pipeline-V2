# Handoffs: log agent work to tasks.chicagoshining.com

Copy one block below into Claude Code, ChatGPT (Codex / Custom GPT), or GitHub Copilot.
Cursor is already wired via `.cursor/hooks.json`. Do not change Cursor hooks unless asked.

Shared contract:

- `POST https://tasks.chicagoshining.com/agent-activity/log-event`
- Header: `Content-Type: application/json`
- Body: `{ "task_id": 1, "agent_id": <id>, "type": "cursor_action"|"cursor_diff", "payload": { ... } }`
- Success is HTTP 200 JSON with an `id`
- Do not follow Access login redirects. If you get HTML or 302, stop and report it.
- Never block the agent loop. Hooks must always succeed from the editor’s point of view (Claude: exit 0, no `decision: block`; Copilot: non-blocking postToolUse; ChatGPT Action: return the API JSON).
- Clip text to ~4000 chars. Do not log secrets, `.env`, tokens, or file contents of credential files.
- Default `task_id` is `1` unless `AI_ACTIVITY_TASK_ID` is set.

Agent IDs:

| Agent | agent_id |
|---|---:|
| Cursor (website / frontend) | 3 |
| Claude | 7 |
| ChatGPT | 9 |
| Copilot | 11 |
| GitHub Actions | 13 |

Reference implementation: `.cursor/hooks/log-cursor-activity.mjs` and `.cursor/hooks.json` on branch `cursor/ai-activity-logging-fd02`.

---

## Paste this to Claude

```text
You are setting up Chicago Shining AI activity logging for Claude Code, matching the Cursor hooks already in this repo.

Goal
After Claude replies, edits files, or finishes a turn, POST a JSON event to:
https://tasks.chicagoshining.com/agent-activity/log-event
Use agent_id 7 and task_id 1 (or AI_ACTIVITY_TASK_ID if set).

Do this
1. Read .cursor/hooks/log-cursor-activity.mjs and .cursor/hooks.json. Reuse the same payload shape and clipping rules.
2. Add a Node script at .claude/hooks/log-claude-activity.mjs (Node 18+ built-in fetch, no extra npm deps). It must:
   - Read one JSON object from stdin (Claude Code hook payload).
   - Map Stop / PostToolUse Edit|Write / UserPromptSubmit into type cursor_action or cursor_diff.
   - POST to the URL above with agent_id 7.
   - Always exit 0. Never print decision:block. Never continue the Claude turn.
   - On HTTP failure, print a short error to stderr only.
3. Register project hooks in .claude/settings.json (create if missing, merge if present):
   {
     "hooks": {
       "PostToolUse": [
         {
           "matcher": "Edit|Write",
           "hooks": [
             { "type": "command", "command": "node .claude/hooks/log-claude-activity.mjs" }
           ]
         }
       ],
       "Stop": [
         {
           "hooks": [
             { "type": "command", "command": "node .claude/hooks/log-claude-activity.mjs" }
           ]
         }
       ]
     }
   }
4. Smoke-test by piping a fake Stop JSON into the script, then confirm HTTP 200 from the live URL.
5. Commit on the current branch if you have write access. Do not put secrets in git.
6. Tell Joseph: reload Claude Code / reopen the folder. ChatGPT.com and Copilot are separate handoffs.

Do not modify .cursor/hooks.json. Do not add Bypass on ChicagoShining Studio Access.
```

---

## Paste this to ChatGPT

```text
You are setting up Chicago Shining AI activity logging for ChatGPT / Codex, matching the Cursor hooks already in SM-Pipeline-V2 and chicagoshining-website.

Goal
When ChatGPT or Codex works in a repo, POST JSON to:
https://tasks.chicagoshining.com/agent-activity/log-event
Use agent_id 9 and task_id 1 (or AI_ACTIVITY_TASK_ID if set).

Important
chatgpt.com chat cannot run repo hooks by itself. Implement the project/Codex path first. Only add a Custom GPT Action if Joseph also wants logging from the ChatGPT website.

Do this
1. Read .cursor/hooks/log-cursor-activity.mjs and .cursor/hooks.json as the contract.
2. Add scripts/log_activity.js if missing, with AI_ACTIVITY_AGENT_ID default 9, posting the same JSON body.
3. Codex / CLI (preferred):
   - Add a small Node script at .codex/hooks/log-chatgpt-activity.mjs (or the current Codex hook path if the product renamed it). Read stdin JSON, clip text, POST agent_id 9, always exit 0.
   - Register it on the equivalent of after-response, after-edit, and stop events. If Codex only supports AGENTS.md instructions, add a mandatory instruction to run:
     node scripts/log_activity.js "<one-line summary of this turn>"
     at the end of every turn, and also implement a git post-commit hook that runs the same script with the commit subject.
4. Custom GPT Action (only if asked for chatgpt.com):
   - OpenAPI 3 action: POST /agent-activity/log-event on https://tasks.chicagoshining.com
   - Request body: task_id integer, agent_id integer default 9, type string, payload object
   - Instruct the GPT to call it after each completed user task. No auth header is required for this path (Access Bypass is already live). Do not send cookies.
5. Smoke-test:
   curl -sS -X POST https://tasks.chicagoshining.com/agent-activity/log-event \
     -H "Content-Type: application/json" \
     -d '{"task_id":1,"agent_id":9,"type":"cursor_action","payload":{"message":"chatgpt handoff smoke"}}'
   Expect HTTP 200 JSON with an id.
6. Do not change Cursor hooks. Do not commit .env or API keys.

Tell Joseph which of Codex hooks vs Custom GPT Action you actually installed.
```

---

## Paste this to Copilot

```text
You are setting up Chicago Shining AI activity logging for GitHub Copilot, matching the Cursor hooks already in this repo.

Goal
When Copilot Agent / Copilot CLI / Copilot coding agent works in this repository, POST JSON to:
https://tasks.chicagoshining.com/agent-activity/log-event
Use agent_id 11 and task_id 1 (or AI_ACTIVITY_TASK_ID if set).

Do this
1. Read .cursor/hooks/log-cursor-activity.mjs and .cursor/hooks.json. Same payload shape and clipping rules.
2. Add .github/hooks/scripts/log-copilot-activity.mjs (Node 18+ fetch, no extra deps). It must:
   - Read stdin JSON from the Copilot hook (sessionStart, postToolUse, agentStop, etc.).
   - Map file edits to type cursor_diff and other events to cursor_action.
   - POST agent_id 11.
   - Always exit 0. Do not deny tools. Do not block the agent.
3. Add .github/hooks/ai-activity.json (Copilot loads *.json from .github/hooks/):
   {
     "version": 1,
     "hooks": {
       "postToolUse": [
         {
           "type": "command",
           "bash": "node .github/hooks/scripts/log-copilot-activity.mjs",
           "powershell": "node .github/hooks/scripts/log-copilot-activity.mjs",
           "cwd": ".",
           "timeoutSec": 15
         }
       ],
       "agentStop": [
         {
           "type": "command",
           "bash": "node .github/hooks/scripts/log-copilot-activity.mjs",
           "powershell": "node .github/hooks/scripts/log-copilot-activity.mjs",
           "cwd": ".",
           "timeoutSec": 15
         }
       ]
     }
   }
   If this repo’s Copilot version uses sessionEnd instead of agentStop, register both.
4. For Copilot cloud agent, the hook JSON must land on the default branch. If you cannot merge, commit on the current branch and say that in the summary.
5. Also add one line to .github/copilot-instructions.md (create or append): after each completed turn, if hooks did not run, execute node scripts/log_activity.js with AI_ACTIVITY_AGENT_ID=11.
6. Smoke-test by piping fake postToolUse JSON into the script. Confirm HTTP 200 from the live URL.
7. Do not modify .cursor/hooks.json. Do not commit secrets.

Copilot Chat inline completions without Agent/CLI will not fire these hooks. Say that plainly to Joseph.
```
