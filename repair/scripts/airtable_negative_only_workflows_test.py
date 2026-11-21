import tempfile
import unittest
from pathlib import Path

from airtable_negative_only_workflows import (
    permitted_negative_reference_locations, unexpected_references
)

PYTHON = "" \
    "          for bad in [\"-Method Post\",\"-Method Patch\",\"-Method Put\",\"-Method Delete\",\n" \
    "                      \"Write-Output $key\",\"AIRTABLE_PAT\",\"api.airtable.com\"]:\n" \
    "              assert bad not in s, \"unsafe provider/database or credential behavior\"\n"
POWERSHELL = "" \
    "          foreach($bad in @('-Method Post','-Method Patch','-Method Put','-Method Delete','AIRTABLE_PAT','https://api.airtable.com','Write-Output $key','Write-Host $key')){\n" \
    "            if($source.Contains($bad)){throw 'unsafe_la_inventory_script'}\n"


class NegativeOnlyWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / ".github/workflows").mkdir(parents=True)

    def write(self, name, content):
        file = self.root / ".github/workflows" / name
        file.write_text(content, encoding="utf-8")
        return file

    def test_python_forbidden_token_assertion_only_is_permitted(self):
        self.write("issue2374-exact-provider-ids-audit.yml", PYTHON)
        self.assertEqual(len(permitted_negative_reference_locations(self.root)), 1)
        self.assertEqual(unexpected_references(self.root, ("api.airtable.com", "AIRTABLE_PAT")), [])

    def test_python_real_url_is_rejected_even_when_negative_check_is_valid(self):
        self.write("issue2374-exact-provider-ids-audit.yml",
                   PYTHON + "          curl https://api.airtable.com/v0/base/table\n")
        issues = unexpected_references(self.root, ("api.airtable.com",))
        self.assertEqual(len(issues), 1)
        self.assertIn(":4", issues[0])

    def test_python_removed_assertion_is_not_an_exemption(self):
        self.write("issue2374-exact-provider-ids-audit.yml", PYTHON.replace(
            "assert bad not in s,", "pass # disabled assert"))
        self.assertEqual(len(unexpected_references(self.root, ("AIRTABLE_PAT",))), 1)

    def test_powershell_two_matching_blocks_only(self):
        self.write("p1-2340-la-youtube-inventory-readonly.yml", POWERSHELL + POWERSHELL)
        self.assertEqual(len(permitted_negative_reference_locations(self.root)), 2)
        self.assertEqual(unexpected_references(self.root, ("api.airtable.com","AIRTABLE_PAT")), [])

    def test_powershell_extra_token_or_missing_second_guard_fails(self):
        self.write("p1-2340-la-youtube-inventory-readonly.yml", POWERSHELL)
        self.assertEqual(len(unexpected_references(self.root, ("AIRTABLE_PAT",))), 1)
        self.write("p1-2340-la-youtube-inventory-readonly.yml",
                   POWERSHELL + POWERSHELL.replace(
                       "if($source.Contains($bad)){throw 'unsafe_la_inventory_script'}",
                       "Write-Output 'skip'"))
        self.assertEqual(len(unexpected_references(self.root, ("AIRTABLE_PAT",))), 2)

    def test_new_fb_photo_audit_token_guard_only(self):
        text = (
            "foreach($bad in @('-Method Post','-Method Patch','-Method Put',"
            "'-Method Delete','-X POST','AIRTABLE_PAT','api.airtable.com',"
            "'Write-Output $key','Write-Host $token')){\n"
            "if($code.Contains($bad)){throw 'mutation_or_secret_output_prohibited'}\n"
        )
        self.write("p1-2340-fb-9777-original-photos.yml", text)
        self.assertEqual(
            unexpected_references(self.root, ("AIRTABLE_PAT","api.airtable.com")),
            []
        )
        self.write("p1-2340-fb-9777-original-photos.yml", text + "curl https://api.airtable.com/v0/\n")
        self.assertEqual(len(unexpected_references(self.root, ("api.airtable.com",))), 1)

    def test_production_identity_audit_only_reports_pat_binding_presence(self):
        expected = (
            "    'legacy_airtable_pat_binding_present':any("
            "b.get('name')=='AIRTABLE_PAT' for b in bindings),\n"
            "    'only_read_operations':True,\n"
        )
        name = "audit-studio-supabase-target-readonly.yml"
        self.write(name, expected)
        self.assertEqual(
            unexpected_references(self.root, ("AIRTABLE_PAT",)), []
        )
        self.write(name, expected + "curl https://api.airtable.com/v0/\n")
        self.assertEqual(
            len(unexpected_references(self.root, ("api.airtable.com",))), 1
        )

    def test_unknown_workflow_is_never_exempt(self):
        self.write("new-provider-hook.yml", "curl https://api.airtable.com/v0/foo\n")
        self.assertEqual(len(unexpected_references(self.root, ("api.airtable.com",))), 1)


if __name__ == "__main__":
    unittest.main()
