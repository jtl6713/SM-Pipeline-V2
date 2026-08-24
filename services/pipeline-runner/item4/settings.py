from __future__ import annotations

from functools import lru_cache
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PIPELINE_SETTINGS_TABLE
from config import load_settings


class PipelineSettings:
    def __init__(self, client: AirtableClient) -> None:
        self._client = client
        self._cache: dict[str, str] = {}

    def get(self, name: str) -> str:
        if name in self._cache:
            return self._cache[name]
        formula = f"AND({{Active}}=1,{{Setting_Name}}='{name.replace(chr(39), chr(92)+chr(39))}')"
        rows = self._client.list_records(PIPELINE_SETTINGS_TABLE, formula=formula, max_records=1)
        value = ""
        if rows:
            value = str(rows[0].get("fields", {}).get("Setting_Value") or "").strip()
        self._cache[name] = value
        return value


def field(record: dict[str, Any], name: str) -> Any:
    return record.get("fields", {}).get(name)


@lru_cache
def _settings_client_key() -> str:
    settings = load_settings()
    return settings.get("airtable_pat") or ""


def pipeline_settings(client: AirtableClient | None = None) -> PipelineSettings:
    if client is None:
        client = AirtableClient()
    return PipelineSettings(client)
