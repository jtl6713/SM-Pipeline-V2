import assert from "node:assert/strict";
import test from "node:test";

import {
  opsActivityDetailFields,
  opsActivityEventKey,
  opsActivityGroupEvents,
  opsActivityHeadline,
  opsActivityIsTest,
  opsActivityLinks,
  opsActivityPartTone,
  opsActivityPartsFromEvent,
  opsActivitySubhead,
  opsActivitySummary,
} from "./ops-activity-detail.mjs";

const desk = {
  id: 2670,
  type: "desk_incident",
  agent_id: 3,
  task_id: 1,
  created_at: "2026-09-07T15:27:17.381706+00:00",
  payload: {
    status: "open",
    fingerprint: "lincoln-park-zoo-370-375",
    class: "code_bug",
    kind: "produce",
    record_id: "recN5gK7L7ToiF7Uw",
    diagnosis: "Lincoln Park Zoo outputs 370-375 Blocked. Parent produce job remotion clip count mismatch expected 20 received 28.",
    suggested_next: "Inspect Remotion clip count vs source selection.",
  },
};

const testRun = {
  id: 2677,
  type: "github_actions",
  created_at: "2026-09-07T21:16:46.000Z",
  payload: {
    suite: "configure-tasks-hostname",
    conclusion: "success",
    job: "Validate Cloudflare Sources",
    run_url: "https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/34162554211",
    message: "configure-tasks-hostname",
  },
};

test("desk cards keep the class as the title and fingerprint as the subtitle", () => {
  assert.equal(opsActivityIsTest(desk), false);
  assert.equal(opsActivityHeadline(desk), "code_bug");
  assert.equal(opsActivitySubhead(desk), "lincoln-park-zoo-370-375");
  assert.match(opsActivitySummary(desk), /clip count mismatch/);
  assert.equal(opsActivityEventKey(desk), "id:2670");
});

test("test cards keep the conclusion as the title and expose the Actions URL", () => {
  assert.equal(opsActivityIsTest(testRun), true);
  assert.equal(opsActivityHeadline(testRun), "success");
  assert.equal(opsActivitySubhead(testRun), "configure-tasks-hostname");
  assert.deepEqual(opsActivityLinks(testRun), [{
    label: "Open Actions run",
    href: "https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/34162554211",
  }]);
});

test("detail fields include the full diagnosis and leftover payload keys", () => {
  const fields = opsActivityDetailFields(desk);
  const byLabel = Object.fromEntries(fields.map((field) => [field.label, field.value]));
  assert.equal(byLabel.Event, "#2670");
  assert.equal(byLabel.Record, "recN5gK7L7ToiF7Uw");
  assert.match(byLabel.Diagnosis, /expected 20 received 28/);
  assert.equal(byLabel["suggested next"], "Inspect Remotion clip count vs source selection.");
  assert.equal(opsActivityLinks(desk).length, 0);
});

test("javascript: and missing URLs are not turned into links", () => {
  assert.deepEqual(opsActivityLinks({
    payload: { run_url: "javascript:alert(1)", html_url: "not-a-url" },
  }), []);
});

test("test events with the same run group into one card with each job", () => {
  const groups = opsActivityGroupEvents([
    {
      type: "github_actions",
      title: "hermetic — success",
      created_at: "2026-09-07T21:00:00Z",
      payload: {
        run_id: "34162554211",
        suite: "Regression suite",
        parts: [{ name: "hermetic", conclusion: "success" }],
      },
    },
    {
      type: "github_actions",
      title: "health — failure",
      created_at: "2026-09-07T21:01:00Z",
      payload: {
        run_id: "34162554211",
        suite: "Regression suite",
        parts: [{ name: "health", conclusion: "failure" }],
      },
    },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].events.length, 2);
  assert.equal(groups[0].title, "failure");
  assert.equal(groups[0].subhead, "Regression suite");
  assert.equal(groups[0].parts[0].name, "hermetic");
  assert.equal(groups[0].parts[1].name, "health");
  assert.equal(groups[0].counts.passed, 1);
  assert.equal(groups[0].counts.failed, 1);
  assert.equal(groups[0].summary, "1 passed · 1 failed");
});

test("parts from a single github_actions payload become per-job rows", () => {
  const parts = opsActivityPartsFromEvent({
    type: "github_actions",
    payload: {
      parts: [
        { name: "hermetic", conclusion: "success" },
        { name: "health", conclusion: "failure" },
        { name: "live", conclusion: "skipped" },
      ],
    },
  });
  assert.deepEqual(parts.map((part) => [part.name, part.conclusion, opsActivityPartTone(part.conclusion)]), [
    ["hermetic", "success", "ok"],
    ["health", "failure", "fail"],
    ["live", "skipped", "skip"],
  ]);
});

test("unrelated test runs stay on separate cards", () => {
  const groups = opsActivityGroupEvents([
    {
      type: "github_actions",
      payload: { suite: "configure-tasks-hostname", conclusion: "success", message: "configure-tasks-hostname" },
    },
    {
      type: "github_actions",
      payload: { suite: "configure-tasks-hostname", conclusion: "failure", message: "configure-tasks-hostname" },
    },
  ]);
  assert.equal(groups.length, 2);
});

test("completed GitHub job status is not treated as the result", () => {
  const parts = opsActivityPartsFromEvent({
    payload: {
      parts: [{ name: "hermetic", conclusion: "success", status: "completed" }],
    },
  });
  assert.equal(parts[0].conclusion, "success");
  assert.equal(opsActivityPartTone(parts[0].conclusion), "ok");
});

test("detail fields skip the parts array that already has its own rows", () => {
  const fields = opsActivityDetailFields({
    type: "github_actions",
    payload: {
      suite: "Regression suite",
      parts: [{ name: "hermetic", conclusion: "success" }],
    },
  });
  assert.equal(fields.some((field) => field.label === "parts"), false);
});
