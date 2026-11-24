"""Unit tests for the fail-closed, opt-in weekly issue closure process."""
import unittest
from scripts.weekly_issue_closure_review import (
    GitHubError, MARKER, checkbox_counts, evaluate, parse_receipt, run,
)


REPO = "jtl6713/SM-Pipeline-V2"


def issue(number=101, *, body="- [x] Verified production QA", labels=("closure:auto",)):
    return {"number": number, "title": f"Issue {number}",
            "state": "open", "body": body,
            "labels": [{"name": x} for x in labels]}


def receipt(number=101, *, author="jtl6713", result="PASS",
            manual="PASS", run_id=111, pr_num=222):
    return {"user": {"login": author},
            "html_url": f"https://github.com/{REPO}/issues/{number}#issuecomment-999",
            "body": "\n".join([
                MARKER, f"Issue: #{number}", f"Acceptance: {result}",
                f"Manual QA: {manual}",
                f"Evidence: https://github.com/{REPO}/actions/runs/{run_id}",
                f"PR: https://github.com/{REPO}/pull/{pr_num}",
                "Notes: Factory verified using real output IDs, screenshots, safe areas and publishing status.",
            ])}


class FakeGitHub:
    repo = REPO

    def __init__(self, issues=None, comments=None, *, success=True, merged=True):
        self.issues = {x["number"]: x for x in (issues or [])}
        self.comments = comments or {}
        self.success = success
        self.merged = merged
        self.posts = []
        self.patches = []

    def pages(self, path):
        if "/issues?state=open" in path:
            return list(self.issues.values())
        if "/comments" in path:
            number = int(path.split("/issues/")[1].split("/")[0])
            return self.comments.get(number, [])
        raise AssertionError(path)

    def get(self, path):
        if "/actions/runs/" in path:
            return {"status": "completed", "conclusion": "success" if self.success else "failure",
                    "repository": {"full_name": REPO}}
        if "/pulls/" in path:
            return {"merged_at": "2026-11-23T00:00:00Z" if self.merged else None,
                    "base": {"ref": "main", "repo": {"full_name": REPO}}}
        if "/issues/" in path:
            return self.issues[int(path.rsplit("/", 1)[-1])].copy()
        raise AssertionError(path)

    def post(self, path, data):
        self.posts.append((path, data))

    def patch(self, path, data):
        self.patches.append((path, data))
        self.issues[int(path.rsplit("/", 1)[-1])]["state"] = data["state"]


class IssueReviewTests(unittest.TestCase):
    def setUp(self):
        self.approvers = {"jtl6713"}

    def test_count_markdown_checkboxes(self):
        self.assertEqual(checkbox_counts(issue(body="- [x] Good\n- [X] Good\n* [ ] Needs QA\n")), (2, 1))

    def test_valid_receipt(self):
        parsed = parse_receipt(receipt(), 101, REPO, self.approvers)
        self.assertEqual(parsed["run_id"], 111)
        self.assertEqual(parsed["pr_number"], 222)
        self.assertEqual(parsed["manual_qa"], "PASS")

    def test_cross_issue_or_untrusted_receipt_does_not_close(self):
        self.assertIn("error", parse_receipt(receipt(number=99), 101, REPO, self.approvers))
        self.assertIsNone(parse_receipt(receipt(author="random-user"), 101, REPO, self.approvers))

    def test_manual_qa_required(self):
        x = parse_receipt(receipt(manual="PENDING"), 101, REPO, self.approvers)
        self.assertIn("error", x)
        self.assertNotIn("error", parse_receipt(receipt(manual="NOT_REQUIRED"), 101, REPO, self.approvers))

    def test_open_issue_with_checkboxes_left_is_always_blocked(self):
        x = issue(body="- [x] CI passed\n- [ ] New cover visual QA")
        api = FakeGitHub([x], {101: [receipt()]})
        self.assertEqual(evaluate(x, api, self.approvers)[0], "pending_checklist")

    def test_no_opt_in_prevents_auto_close_even_with_signoff(self):
        x = issue(labels=())
        api = FakeGitHub([x], {101: [receipt()]})
        self.assertEqual(evaluate(x, api, self.approvers)[0], "not_opted_in")

    def test_hold_prevents_auto_close(self):
        x = issue(labels=("closure:auto", "closure:hold"))
        api = FakeGitHub([x], {101: [receipt()]})
        self.assertEqual(evaluate(x, api, self.approvers)[0], "held")

    def test_only_latest_owner_receipt_controls_eligibility(self):
        x = issue()
        api = FakeGitHub([x], {101: [receipt(), receipt(result="REVOKED")]})
        self.assertEqual(evaluate(x, api, self.approvers)[0], "invalid_receipt")

    def test_absent_receipt_blocks(self):
        x = issue()
        self.assertEqual(evaluate(x, FakeGitHub([x]), self.approvers)[0], "missing_receipt")

    def test_unsuccessful_workflow_or_unmerged_pr_blocks(self):
        x = issue()
        for api in (FakeGitHub([x], {101: [receipt()]}, success=False),
                    FakeGitHub([x], {101: [receipt()]}, merged=False)):
            self.assertEqual(evaluate(x, api, self.approvers)[0], "unverified_evidence")

    def test_dry_run_never_posts_or_closes(self):
        x = issue()
        api = FakeGitHub([x], {101: [receipt()]})
        report, closed, errors = run(api, report_issue=2885, apply=False,
                                     approvers=self.approvers, run_id="999")
        self.assertEqual(closed, [])
        self.assertEqual(errors, 0)
        self.assertEqual(api.patches, [])
        self.assertIn("DRY RUN", report)
        self.assertIn("#101", report)

    def test_applies_only_verified_opt_in_and_skips_report_issue(self):
        ready = issue(101)
        pending = issue(2876, body="- [x] Runner deployed\n- [ ] New real-image QA")
        held = issue(2670, body="- [x] Initial recovery\n- [ ] Cross-host proof")
        tracker = issue(2885, body="- [x] This is the report", labels=("closure:auto",))
        api = FakeGitHub([ready, pending, held, tracker], {101: [receipt()]})
        report, closed, errors = run(api, report_issue=2885, apply=True,
                                     approvers=self.approvers, run_id="999")
        self.assertEqual(closed, [101])
        self.assertEqual(errors, 0)
        self.assertEqual(api.issues[101]["state"], "closed")
        self.assertEqual(api.issues[2876]["state"], "open")
        self.assertEqual(api.issues[2670]["state"], "open")
        self.assertEqual(api.issues[2885]["state"], "open")
        self.assertEqual(len(api.patches), 1)
        self.assertIn("2876", report)
        self.assertIn("2670", report)

    def test_fail_closed_on_network_error_does_not_approve(self):
        class BrokenAPI(FakeGitHub):
            def get(self, path):
                if "/actions/runs/" in path:
                    raise GitHubError("Unavailable")
                return super().get(path)
        x = issue()
        api = BrokenAPI([x], {101: [receipt()]})
        report, closed, errors = run(api, report_issue=2885, apply=True,
                                     approvers=self.approvers, run_id="999")
        self.assertEqual(errors, 1)
        self.assertEqual(closed, [])
        self.assertFalse(api.patches)
        self.assertIn("Verification unavailable", report)

    def test_report_contains_opt_in_and_completion_guidance(self):
        x = issue(2876, body="- [x] deployed\n- [ ] visual QA", labels=())
        api = FakeGitHub([x])
        report, _, _ = run(api, report_issue=2885, apply=False,
                            approvers=self.approvers, run_id="abc")
        self.assertIn("closure:auto", report)
        self.assertIn("2876", report)


if __name__ == "__main__":
    unittest.main()
