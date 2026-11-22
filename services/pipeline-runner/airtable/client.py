import logging
from typing import Any

from config import load_settings

logger = logging.getLogger("pipeline-runner.airtable")


class AirtableClient:
    """Compatibility interface for Supabase-only pipeline stage CRUD."""

    def __init__(self, settings: dict | None = None) -> None:
        settings = settings or load_settings()
        from supabase_pipeline import supabase_configured

        if not supabase_configured(settings):
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for pipeline CRUD")
        self._settings = settings
        # Local to one I1 process/client; fresh Supabase deltas are queried for
        # every subsequent originality check, never an unverified cached pass.
        self._i1_title_history_cache = {}

    def _archive_closed(self) -> bool:
        """Airtable is permanently read-only/offline to this runner."""
        return True

    def _request(self, method: str, url: str, *, table_id: str, **kwargs):
        """Hard-stop any legacy Airtable transport caller."""
        raise RuntimeError(f"Airtable HTTP access retired: {method} {table_id}")

    def _mirror(self, table_id: str, records: list[dict], *, partial: bool = False) -> dict:
        from supabase_pipeline import mirror_airtable_records

        result = mirror_airtable_records(self._settings, table_id, records, partial=partial)
        if not isinstance(result, dict) or result.get("ok") is not True or result.get("count") != len(records):
            raise RuntimeError(f"Supabase mutation not confirmed for {table_id}")
        return result

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

    def update_record(self, table_id: str, record_id: str, fields: dict, *, typecast: bool = False) -> dict:
        from settings_store import commit_setting

        try:
            committed_setting = commit_setting(self._settings, table_id, record_id, fields)
        except Exception as error:
            logger.warning("supabase settings commit failed for %s; no Airtable fallback permitted: %s", record_id, error)
            committed_setting = False
        if committed_setting:
            logger.info(
                "Airtable archive kept the settings commit and did not export %s %s",
                table_id,
                record_id,
            )
            return {"id": record_id, "fields": fields}
        if self._legacy_export(table_id):
            result = self._mirror(table_id, [{"id": record_id, "fields": fields}], partial=True)
            if not isinstance(result, dict) or not result.get("ok") or result.get("count") != 1:
                raise RuntimeError(f"Supabase update failed for {table_id} {record_id}; refusing success echo")
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
                    "supabase phase6 update commit failed for %s %s; no Airtable fallback permitted",
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
                    "supabase side-table update commit failed for %s %s; no Airtable fallback permitted",
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
        from supabase_reads import try_list_supabase_records, try_list_i1_title_history

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

        i1_history = try_list_i1_title_history(
            self._settings, table_id, formula,
            max_records=max_records, fields=fields,
            cache=self._i1_title_history_cache,
        )
        if i1_history is not None:
            return i1_history

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
                        "supabase create commit failed for %s; no Airtable fallback permitted: %s",
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
                mirrored = self._mirror(table_id, [
                    {"id": str(item["id"]), "fields": dict(item.get("fields") or {})}
                    for item in chunk
                ], partial=True)
                if not isinstance(mirrored, dict) or not mirrored.get("ok") or mirrored.get("count") != len(chunk):
                    raise RuntimeError(f"Supabase batch update failed for {table_id}; refusing success echo")
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
                        "supabase phase6 batch update commit failed for %s; no Airtable fallback permitted",
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
                        "supabase side-table batch update commit failed for %s; no Airtable fallback permitted",
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
        """Atomic Supabase media claim by Drive file ID or native-gallery key.

        The database owns the concurrency/unique constraints; no GET-then-POST
        race, no Airtable fallback, and no success without an independent read.
        """
        import re

        from airtable.constants import MEDIA_ASSETS_TABLE
        from supabase_pipeline import _media_row, _rest, mint_record_id

        if table_id != MEDIA_ASSETS_TABLE:
            raise RuntimeError(f"No Supabase atomic upsert for {table_id}")
        if merge_field not in {"Google Drive File ID", "Studio_Transfer_ID"}:
            raise ValueError(f"Unsupported media merge field: {merge_field}")
        key = str(fields.get(merge_field) or "").strip()
        if not key:
            raise ValueError(f"{merge_field} must be set for atomic upsert")
        if merge_field == "Studio_Transfer_ID" and not key.startswith("ngv2_"):
            raise ValueError("Only native-gallery ngv2_ transfer identities can be atomically upserted")

        candidate = mint_record_id()
        asset = _media_row({"id": candidate, "fields": fields})
        if not asset.get("asset_name"):
            raise ValueError("Asset Name is required for Supabase media upsert")
        expected_key = (
            asset.get("google_drive_file_id")
            if merge_field == "Google Drive File ID"
            else (asset.get("metadata") or {}).get("studio_transfer_id")
        )
        if expected_key != key:
            raise RuntimeError("Media identity projection mismatch; no write attempted")

        response = _rest(
            self._settings,
            "rpc/sm_pipeline_upsert_media_asset",
            "POST",
            {
                "p_merge_field": merge_field,
                "p_merge_value": key,
                "p_record_id": candidate,
                "p_asset": asset,
            },
            prefer="return=representation",
        )
        record_id = response.get("id") if isinstance(response, dict) else None
        created = response.get("created") if isinstance(response, dict) else None
        if (
            not isinstance(record_id, str)
            or not re.fullmatch(r"rec[A-Za-z0-9]{14}", record_id)
            or type(created) is not bool
        ):
            raise RuntimeError("Supabase media claim returned no unambiguous persisted identity")
        response_key = (
            response.get("google_drive_file_id")
            if merge_field == "Google Drive File ID"
            else response.get("studio_transfer_id")
        )
        if response_key != key:
            raise RuntimeError("Supabase media claim returned a mismatched merge key")

        # Independent authoritative read confirms the row has landed before
        # A2B/native gallery stages can mark the claim successful.
        stored = self.get_record(table_id, record_id)
        if (
            not isinstance(stored, dict)
            or stored.get("id") != record_id
            or not isinstance(stored.get("fields"), dict)
            or stored["fields"].get(merge_field) != key
        ):
            raise RuntimeError("Supabase media claim readback failed; reconcile before retry")
        return stored, created
