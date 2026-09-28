"""Runtime preferred AI API setting stored in Airtable Pipeline Settings."""

from __future__ import annotations

import logging
from typing import Any

from airtable.client import AirtableClient
from airtable.constants import PIPELINE_SETTINGS_TABLE

SETTING_NAME = "AI_API_PREFERRED_PROVIDER"
FAILOVER_SETTING_NAME = "AI_API_CROSS_PROVIDER_FAILOVER"
_LOG = logging.getLogger(__name__)


def account_to_provider(account: str) -> str:
    return "Azure" if str(account).strip().upper() == "SECONDARY" else "OpenAI"


def provider_to_account(provider: str) -> str:
    value = str(provider or "").strip().lower()
    if value in {"azure", "secondary"}:
        return "SECONDARY"
    if value in {"openai", "primary"}:
        return "PRIMARY"
    raise ValueError("provider must be OpenAI or Azure")


def get_preferred_account(settings: dict[str, Any], override: str | None = None) -> str:
    if override:
        return provider_to_account(override)
    fallback = str(settings.get("openai_account") or "PRIMARY").strip().upper()
    try:
        rows = AirtableClient(settings).list_records(
            PIPELINE_SETTINGS_TABLE,
            formula=f'AND({{Active}}=1,{{Setting_Name}}="{SETTING_NAME}")',
            max_records=1,
            fields=["Setting_Name", "Setting_Value", "Active"],
        )
        if rows:
            value = str((rows[0].get("fields") or {}).get("Setting_Value") or "").strip()
            if value:
                return provider_to_account(value)
    except Exception as exc:
        _LOG.warning("Could not read Studio AI API preference; using startup default: %s", type(exc).__name__)
    return fallback if fallback in {"PRIMARY", "SECONDARY"} else "PRIMARY"


def cross_provider_failover_enabled(settings: dict[str, Any]) -> bool:
    """Cross-provider spend is opt-in. Missing/unreadable setting means disabled."""
    try:
        rows = AirtableClient(settings).list_records(
            PIPELINE_SETTINGS_TABLE,
            formula=f'AND({{Active}}=1,{{Setting_Name}}="{FAILOVER_SETTING_NAME}")',
            max_records=1,
            fields=["Setting_Name", "Setting_Value", "Active"],
        )
        if rows:
            value = str((rows[0].get("fields") or {}).get("Setting_Value") or "").strip().lower()
            return value in {"1", "true", "yes", "on", "enabled"}
    except Exception as exc:
        _LOG.warning("Could not read cross-provider failover preference; failover stays disabled: %s", type(exc).__name__)
    return False
