"""Issue #2593: renderer config must not query a retired Airtable-only view."""

from airtable.constants import PIPELINE_SETTINGS_TABLE
from render import settings as render_settings
from settings_store import settings_filter


class _SupabaseSettingsClient:
    def __init__(self, value: str) -> None:
        self.value = value
        self.queries = []

    def list_records(self, table_id: str, *, formula=None, view=None, max_records=10, **kwargs):
        assert table_id == PIPELINE_SETTINGS_TABLE
        # A retired Airtable view cannot be translated and previously blocked
        # C2146 and C2174 before the fallback ever ran.
        assert view is None, "No Airtable-only view is permitted"
        expected = 'AND({Active}=1,{Setting_Name}=\'RENDER_SERVER_BASE_URL\')'
        assert formula == expected
        parsed = settings_filter(formula)
        assert parsed == {
            "name": "RENDER_SERVER_BASE_URL",
            "active": True,
            "prefix": "",
            "names": [],
        }
        self.queries.append((table_id, formula, max_records))
        return (
            [{"id": "recRendererSetting1", "fields": {"Setting_Value": self.value, "Active": True}}]
            if self.value
            else []
        )


def test_render_server_uses_active_supabase_setting_not_legacy_view():
    client = _SupabaseSettingsClient("https://render.example.test/")
    assert render_settings.get_render_server_url(client) == "https://render.example.test"
    assert len(client.queries) == 1


def test_render_server_fallback_when_named_setting_absent(monkeypatch):
    client = _SupabaseSettingsClient("")
    monkeypatch.setattr(
        render_settings,
        "load_settings",
        lambda: {"remotion_renderer_url": "https://fallback.example.test/"},
    )
    assert render_settings.get_render_server_url(client) == "https://fallback.example.test"
    assert len(client.queries) == 1
