"""Reference cache serves seeded orgs/brands/prompts without Airtable."""
import unittest
from unittest.mock import patch

from airtable.constants import BRANDS_TABLE, ORGANIZATIONS_TABLE, PROMPTS_TABLE
from p1.constants import P1_PROMPT_VIEW
from reference_cache import get_reference_record, list_reference_records, reference_cache_enabled


def _settings(**extra):
    base = {
        "airtable_pat": "pat_test",
        "airtable_base_id": "appe33zkZn35yirTL",
        "studio_write_source": "supabase",
        "supabase_url": "https://example.supabase.co",
        "supabase_service_role_key": "secret",
    }
    base.update(extra)
    return base


class ReferenceCacheTests(unittest.TestCase):
    def test_supabase_reference_cache_ignores_retired_write_source_flag(self):
        self.assertTrue(reference_cache_enabled(_settings(), BRANDS_TABLE))
        self.assertTrue(
            reference_cache_enabled(
                {"studio_write_source": "airtable", "supabase_url": "https://x", "supabase_service_role_key": "k"},
                BRANDS_TABLE,
            )
        )

    def test_get_org_and_brand(self):
        org = get_reference_record(_settings(), ORGANIZATIONS_TABLE, "recLwmq0WzpG3MHQj")
        self.assertIsNotNone(org)
        self.assertEqual(org["fields"]["Organization_Name"], "Joseph Logan Digital")
        self.assertTrue(org["fields"]["Active"])

        brand = get_reference_record(_settings(), BRANDS_TABLE, "recjLbnpXhVnqHBgG")
        self.assertIsNotNone(brand)
        self.assertEqual(brand["fields"]["Brand_Name"], "ChicagoShining")

    def test_seed_miss_returns_none(self):
        self.assertIsNone(get_reference_record(_settings(), BRANDS_TABLE, "recDoesNotExist000"))

    def test_p1_prompt_view(self):
        rows = list_reference_records(
            _settings(),
            PROMPTS_TABLE,
            view=P1_PROMPT_VIEW,
            max_records=1,
        )
        self.assertIsNotNone(rows)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["fields"]["Prompt_Key"], "P1_CONTENT_PACKAGE")

    def test_client_get_uses_cache_without_airtable(self):
        from airtable.client import AirtableClient

        client = AirtableClient(_settings())
        with patch.object(client, "_request") as request:
            brand = client.get_record(BRANDS_TABLE, "rec4QeMB0vpY656CY")
        self.assertEqual(brand["fields"]["Brand_Name"], "LA Shining")
        request.assert_not_called()

    def test_client_list_p1_prompt_view_without_airtable(self):
        from airtable.client import AirtableClient

        client = AirtableClient(_settings())
        with patch.object(client, "_request") as request:
            rows = client.list_records(PROMPTS_TABLE, view=P1_PROMPT_VIEW, max_records=1)
        self.assertEqual(rows[0]["fields"]["Prompt_Key"], "P1_CONTENT_PACKAGE")
        request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
