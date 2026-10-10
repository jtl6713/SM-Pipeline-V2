# Helpdesk signature: QA-IDEA-TIMELINE-ORPHAN

**Scope:** ChicagoShining Studio > Ideas > Create timeline / Create VO timeline. Applies to all content profiles, not only Pilsen. Reproduced October 10, 2026.

## Recognize this issue

- An Idea Candidate is **Approved** but not promoted and already has one or more linked **Production Requests**.
- Its row still offers **Create timeline**, or clicking the action leaves the user on Ideas with a green message similar to "is in the Production list and ready to open. This does not publish."
- Studio never opens Production / Rendering, and users understandably click again.
- Repeated attempts can regenerate narration/scene assignments or leave multiple Production Requests linked to one Idea.
- Cross-check the Idea's Production Requests relation and the requests' Production_Notes [timed-script] directive. Candidate_Status=Approved does NOT mean published.

**Signature ID:** QA-IDEA-TIMELINE-ORPHAN  
**Severity:** User workflow blocked; repeated clicks risk content rewrite.  
**Predicate:** The Idea is not promoted, has an existing linked Production Request, and the timeline action does not navigate to that request or submits a new timed-script creation instead.

## Recovery playbook (non-destructive)

1. Retrieve the Idea Candidate and ALL linked Production Requests; do not trust the latest request or Idea approval status alone.
2. Prefer editable Draft, Ready, or Submitted requests with a valid [timed-script] directive; choose the earliest-created timed script to preserve first scene/music/still choices. If none has a timed script, prefer an existing Ready request, then an editable Draft.
3. Open the selected Production Request directly; set Rendering as the active tab for timed scripts. Show a visible error if navigation or a lookup fails.
4. Never POST another /api/ideas/:id/timed-script just because an existing linked request was not recognized. Fail closed on unavailable lookups. The server must reuse existing saved timelines idempotently.
5. Do not delete duplicate linked requests, overwrite original scripts, change publication status, or alter media without explicit review. Duplicates are candidates for later operator-authorized cleanup.
6. Verify Production opens and original segment count/timings survive. Verify UI and Worker deployment footer versions. Exercise Approved Ideas across all profiles, especially multiple-linked-request cases.

## Example: Pilsen Mural Micro-Guide

Idea recPqg9C4VxPTTDhf links a blank Draft rechO7NRk8EIAEPCT, an original 41.2-second seven-scene timeline recxOlvNQyjnrKUSg (PR-20261009064520-0ETEX9), and a later 53.2-second eight-scene timeline rec5INzycCsRtBsM5. Prefer the original seven-scene version; preserve all data.

## Implemented code contract

- apps/studio-web/assets/app-item4-1008.js: centralized openOrCreateIdeaTimeline and selectIdeaProductionRequest, navigation, error handling and **Open production** for existing requests.
- apps/studio-api/worker.js: createIdeaTimedScriptRoute checks linked saved timelines before AI and writes.
- Tests: apps/studio-web/idea-timeline-reopen.test.mjs and apps/studio-api/idea-timeline-idempotency.test.mjs.

This document records the Helpdesk/Quality Agent signature and regression protocol. It does not itself restart local pipeline-runner services.
