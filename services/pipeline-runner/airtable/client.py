import logging
from typing import Any

from config import load_settings

logger = logging.getLogger("pipeline-runner.airtable")


class AirtableClient:
    """Minimal Airtable REST client for stage workers."""

    def __init__(self, settings: dict | None = None) -> None:
        settings = settings or load_settings()
        from supabase_pipeline import supabase_configured

        if not supabase_configured(settings):
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for pipeline CRUD")
        self._settings = settings

    def _archive_closed(self) -> bool:
        """Airtable is permanently read-only/offline to this runner."""
        return True

    def _request(self, method: str, url: str, *, table_id: str, **kwargs):
        """Hard-stop any legacy Airtable transport caller."""
        raise RuntimeError(f"Airtable HTTP access retired: {method} {table_id}")

    def _mirror(self, table_id: str, records: list[dict], *, partial: bool = False) -> None:
        from supabase_pipeline import mirror_airtable_records

        result = mirror_airtable_records(self._settings, table_id, records, partial=partial)
        if not isinstance(result, dict) or result.get("ok") is not True or result.get("count") != len(records):
            raise RuntimeError(f"Supabase mutation not confirmed for {table_id}")

    def _legacy_export(self, table_id: str) -> bool:
        from supabase_pipeline import legacy_export_enabled

        return legacy_export_enabled(self._settings, table_id)

    def _phase6_export(self, table_id: str) -> bool:
        from supabase_pipeline import phase6_legacy_export_enabled

        return phase6_legacy_export_enabled(self._settings, table_id)

    def _side_table_export(self, table_id: str) -> bool:
        from supabase_pipeline import side_table_export_enabled

        return side_table_export_enabled(self._settings, table_id)

    def _commit_phase6(self, table_id: str, records: list[dict]) -> bool:
        from supabase_pipeline import mirror_airtable_records

        result = mirror_airtable_records(self._settings, table_id, records, partial=True)
        return bool(result.get("ok")) and result.get("count") == len(records)

    def _commit_side_table(self, table_id: str, records: list[dict]) -> bool:
        from supabase_pipeline import mirror_airtable_records

        result = mirror_airtable_records(self._settings, table_id, records, partial=True)
        return bool(result.get("ok")) and result.get("count") == len(records)

    def get_record(self, table_id: str, record_id: str) -> dict:
        import requests

        from reference_cache import get_reference_record, reference_cache_enabled
        from settings_store import get_setting
        from supabase_reads import SupabaseRecordMiss, try_get_supabase_record

        try:
            setting = get_setting(self._settings, table_id, record_id)
            if setting is not None:
                return setting
            cached = get_reference_record(self._settings, table_id, record_id)
            if cached is not None:
                return cached
            if reference_cache_enabled(self._settings, table_id):
                # Seed miss must not GET the frozen archive for reference tables.
                raise SupabaseRecordMiss(table_id, record_id)
            supabase_row = try_get_supabase_record(self._settings, table_id, record_id)
        except SupabaseRecordMiss:
            # Match Airtable's missing-record shape so stage callers keep their
            # existing 404 / HTTPError handling without archive egress.
            err = requests.HTTPError(
                f"404 Client Error: Not Found for Supabase record {table_id}/{record_id}"
            )
            err.response = type("R", (), {"status_code": 404, "reason": "Not Found", "ok": False})()
            raise err from None
        if supabase_row is not None:
            return supabase_row

        raise RuntimeError(
            f"Supabase record lookup unsupported or unavailable for {table_id}/{record_id}; no Airtable fallback"
        )

    def _patch_record(self, table_id: str, record_id: str, fields: dict, *, typecast: bool = False) -> dict:
        raise RuntimeError(f"Supabase update mapping required for {table_id}; no Airtable fallback")

    def update_record(self, table_id: str, record_id: str, fields: dict, *, typecast: bool = False) -> dict:
        from settings_store import commit_setting

        try:
            committed_setting = commit_setting(self._settings, table_id, record_id, fields)
        except Exception as error:
            logger.warning("supabase settings commit failed for %s; Airtable remains required: %s", record_id, error)
            committed_setting = False
        if committed_setting:
            logger.info(
                "Airtable archive kept the settings commit and did not export %s %s",
                table_id,
                record_id,
            )
            return {"id": record_id, "fields": fields}
        if self._legacy_export(table_id):
            self._mirror(table_id, [{"id": record_id, "fields": fields}], partial=True)
            logger.info(
                "Airtable archive kept the Supabase commit and did not export %s %s",
                table_id,
                record_id,
            )
            return {"id": record_id, "fields": fields}
        if self._phase6_export(table_id):
            pending = {"id": record_id, "fields": fields}
            committed = self._commit_phase6(table_id, [pending])
            if not committed:
                logger.warning(
                    "supabase phase6 update commit failed for %s %s; Airtable remains required",
                    table_id,
                    record_id,
                )
            else:
                logger.info(
                    "Airtable archive kept the Supabase phase6 commit and did not export %s %s",
                    table_id,
                    record_id,
                )
                return pending
        if self._side_table_export(table_id):
            pending = {"id": record_id, "fields": fields}
            committed = self._commit_side_table(table_id, [pending])
            if not committed:
                logger.warning(
                    "supabase side-table update commit failed for %s %s; Airtable remains required",
                    table_id,
                    record_id,
                )
            else:
                logger.info(
                    "Airtable archive kept the Supabase side-table commit and did not export %s %s",
                    table_id,
                    record_id,
                )
                return pending
        if self._archive_closed():
            raise RuntimeError(
                f"Supabase update uncommitted for {table_id}/{record_id}; no Airtable fallback"
            )
        record = self._patch_record(table_id, record_id, fields, typecast=typecast)
        self._mirror(table_id, [record])
        return record

    def list_records(
        self,
        table_id: str,
        *,
        formula: str | None = None,
        view: str | None = None,
        max_records: int = 10,
        fields: list[str] | None = None,
        sort_field: str | None = None,
        sort_direction: str = "asc",
    ) -> list[dict[str, Any]]:
        import requests

        from reference_cache import list_reference_records
        from settings_store import list_settings
        from supabase_reads import try_list_supabase_records

        # Settings live in engagement_settings.payload once Supabase is the SoR.
        # Without this branch the generic read cannot project Pipeline Settings,
        # returns None, and the closed Airtable archive returns an empty list.
        # P2 then blocks every voiceover as missing_voiceover_normalizer_url.
        setting_rows = list_settings(self._settings, table_id, formula, max_records)
        if setting_rows is not None:
            return setting_rows

        cached_rows = list_reference_records(
            self._settings,
            table_id,
            view=view,
            max_records=max_records,
        )
        if cached_rows is not None:
            return cached_rows

        supabase_rows = try_list_supabase_records(
            self._settings,
            table_id,
            formula=formula,
            view=view,
            max_records=max_records,
            fields=fields,
            sort_field=sort_field,
            sort_direction=sort_direction,
        )
        if supabase_rows is not None:
            return supabase_rows

        raise RuntimeError(
            f"Supabase list query unsupported or unavailable for {table_id}; no Airtable fallback"
        )

    def delete_record(self, table_id: str, record_id: str) -> dict[str, Any]:
        """DELETE must be confirmed by exactly one row returned from Supabase."""
        from urllib.parse import quote
        from settings_store import settings_source
        from supabase_pipeline import _rest
        from supabase_reads import _supabase_table

        table = _supabase_table(table_id)
        source = settings_source(table_id)
        if source:
            table = "engagement_settings"
        if not table:
            raise RuntimeError(f"No Supabase delete mapping for {table_id}")
        filters = f"airtable_record_id=eq.{quote(record_id, safe='')}"
        if source:
            filters += f"&payload->>source=eq.{source}"
        rows = _rest(
            self._settings,
            f"{table}?{filters}&select=airtable_record_id",
            "DELETE",
            prefer="return=representation",
        )
        if (
            not isinstance(rows, list)
            or len(rows) != 1
            or str(rows[0].get("airtable_record_id") or "") != record_id
        ):
            raise RuntimeError(f"Supabase delete not confirmed for {table_id}/{record_id}")
        return {"id": record_id, "deleted": True}

    def create_records(self, table_id: str, records: list[dict[str, Any]], *, typecast: bool = True) -> list[dict[str, Any]]:
        import requests

        from supabase_pipeline import (
            commit_minted_creates,
            commit_phase6_creates,
            mint_record_id,
            release_minted_record_ids,
            release_phase6_minted_ids,
        )

        url = f"{self._api_root}/{self._base_id}/{table_id}"
        created: list[dict[str, Any]] = []
        legacy = self._legacy_export(table_id)
        phase6 = self._phase6_export(table_id) and not legacy
        side = self._side_table_export(table_id) and not legacy and not phase6
        for start in range(0, len(records), 10):
            chunk = records[start : start + 10]
            minted = [
                {"id": mint_record_id(), "fields": dict(item)}
                for item in chunk
            ] if (legacy or phase6 or side) else []
            committed = False
            if side and minted:
                committed = self._commit_side_table(table_id, minted)
                if not committed:
                    raise RuntimeError(f"Supabase create failed for {table_id}")
                logger.info("Airtable archive kept the Supabase side-table create and did not export %s", table_id)
                created.extend(minted)
                continue
            if minted and not side:
                try:
                    committed = (
                        commit_minted_creates(self._settings, table_id, minted)
                        if legacy
                        else commit_phase6_creates(self._settings, table_id, minted)
                    )
                except Exception as error:
                    logger.warning(
                        "supabase create commit failed for %s; Airtable remains required: %s",
                        table_id,
                        error,
                    )
            if committed:
                logger.info("Airtable archive kept the Supabase create and did not export %s", table_id)
                created.extend(minted)
                continue
            if self._archive_closed():
                raise RuntimeError(f"Supabase create uncommitted for {table_id}; no Airtable fallback")
        return created

    def update_records(
        self,
        table_id: str,
        records: list[dict[str, Any]],
        *,
        typecast: bool = True,
    ) -> list[dict[str, Any]]:
        """Batch PATCH up to 10 Airtable records per request.

        Each item must be ``{"id": "...", "fields": {...}}``.
        """
        import requests

        url = f"{self._api_root}/{self._base_id}/{table_id}"
        updated: list[dict[str, Any]] = []
        legacy = self._legacy_export(table_id)
        for start in range(0, len(records), 10):
            chunk = [item for item in records[start : start + 10] if item.get("id")]
            body: dict[str, Any] = {
                "records": [
                    {"id": str(item["id"]), "fields": dict(item.get("fields") or {})}
                    for item in chunk
                ]
            }
            if not body["records"]:
                continue
            if legacy:
                self._mirror(table_id, [
                    {"id": str(item["id"]), "fields": dict(item.get("fields") or {})}
                    for item in chunk
                ], partial=True)
                logger.info("Airtable archive kept the Supabase batch and did not export %s", table_id)
                updated.extend(
                    {"id": str(item["id"]), "fields": dict(item.get("fields") or {})}
                    for item in chunk
                )
                continue
            phase6_committed = False
            if not legacy and self._phase6_export(table_id):
                phase6_committed = self._commit_phase6(table_id, [
                    {"id": str(item["id"]), "fields": dict(item.get("fields") or {})}
                    for item in chunk
                ])
                if not phase6_committed:
                    logger.warning(
                        "supabase phase6 batch update commit failed for %s; Airtable remains required",
                        table_id,
                    )
                else:
                    logger.info(
                        "Airtable archive kept the Supabase phase6 batch and did not export %s",
                        table_id,
                    )
                    updated.extend(
                        {"id": str(item["id"]), "fields": dict(item.get("fields") or {})}
                        for item in chunk
                    )
                    continue
            if not legacy and not phase6_committed and self._side_table_export(table_id):
                side_committed = self._commit_side_table(table_id, [
                    {"id": str(item["id"]), "fields": dict(item.get("fields") or {})}
                    for item in chunk
                ])
                if not side_committed:
                    logger.warning(
                        "supabase side-table batch update commit failed for %s; Airtable remains required",
                        table_id,
                    )
                else:
                    logger.info(
                        "Airtable archive kept the Supabase side-table batch and did not export %s",
                        table_id,
                    )
                    updated.extend(
                        {"id": str(item["id"]), "fields": dict(item.get("fields") or {})}
                        for item in chunk
                    )
                    continue
            if self._archive_closed():
                raise RuntimeError(f"Supabase batch update uncommitted for {table_id}; no Airtable fallback")
        return updated

    def upsert_record(
        self,
        table_id: str,
        fields: dict[str, Any],
        *,
        merge_field: str,
        typecast: bool = True,
    ) -> tuple[dict[str, Any], bool]:
        """Atomically create or match one record on an Airtable merge field.

        Airtable's performUpsert resolves simultaneous writers server-side.
        Never fall back to POST after an ambiguous response or 422: that could
        create a duplicate. The bool is True only for a confirmed new record.
        """
        import requests

        key = str(fields.get(merge_field) or "").strip()
        if not key:
            raise ValueError(f"{merge_field} must be set for atomic upsert")
        if self._archive_closed():
            raise RuntimeError(
                f"Atomic Supabase upsert not implemented for {table_id}/{merge_field}; no Airtable fallback"
            )
        raise RuntimeError("Supabase atomic upsert required; no Airtable fallback")
