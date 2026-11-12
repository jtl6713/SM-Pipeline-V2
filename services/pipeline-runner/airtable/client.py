import logging
from typing import Any

from config import load_settings

logger = logging.getLogger("pipeline-runner.airtable")


class AirtableClient:
    """Minimal Airtable REST client for stage workers."""

    def __init__(self, settings: dict | None = None) -> None:
        settings = settings or load_settings()
        pat = settings.get("airtable_pat", "")
        if not pat:
            raise RuntimeError("AIRTABLE_PAT is required for Airtable operations")
        self._settings = settings
        self._base_id = settings["airtable_base_id"]
        self._headers = {
            "Authorization": f"Bearer {pat}",
            "Content-Type": "application/json",
        }
        self._api_root = "https://api.airtable.com/v0"

    def _request(self, method: str, url: str, *, table_id: str, **kwargs):
        """Use the verb-specific requests API; runner-wide Session.send records egress."""
        import requests
        return getattr(requests, method.lower())(url, **kwargs)

    def _mirror(self, table_id: str, records: list[dict], *, partial: bool = False) -> None:
        from supabase_pipeline import mirror_airtable_records

        mirror_airtable_records(self._settings, table_id, records, partial=partial)

    def _legacy_export(self, table_id: str) -> bool:
        from supabase_pipeline import legacy_export_enabled

        return legacy_export_enabled(self._settings, table_id)

    def _phase6_export(self, table_id: str) -> bool:
        from supabase_pipeline import phase6_legacy_export_enabled

        return phase6_legacy_export_enabled(self._settings, table_id)

    def _commit_phase6(self, table_id: str, records: list[dict]) -> bool:
        from supabase_pipeline import mirror_airtable_records

        result = mirror_airtable_records(self._settings, table_id, records, partial=True)
        return bool(result.get("ok")) and result.get("count") == len(records)

    def get_record(self, table_id: str, record_id: str) -> dict:
        import requests

        from supabase_reads import try_get_supabase_record

        supabase_row = try_get_supabase_record(self._settings, table_id, record_id)
        if supabase_row is not None:
            return supabase_row

        url = f"{self._api_root}/{self._base_id}/{table_id}/{record_id}"
        response = self._request("GET", url, table_id=table_id, headers=self._headers, timeout=60)
        response.raise_for_status()
        return response.json()

    def _patch_record(self, table_id: str, record_id: str, fields: dict, *, typecast: bool = False) -> dict:
        import requests

        url = f"{self._api_root}/{self._base_id}/{table_id}/{record_id}"
        body = {"fields": fields}
        if typecast:
            body["typecast"] = True
        response = self._request("PATCH", url, table_id=table_id, headers=self._headers, json=body, timeout=60)
        if not response.ok:
            detail = (response.text or "").strip().replace("\n", " ")[:500]
            message = f"{response.status_code} {response.reason} for url: {url}"
            if detail:
                message = f"{message} {detail}"
            raise requests.HTTPError(message, response=response)
        return response.json()

    def update_record(self, table_id: str, record_id: str, fields: dict, *, typecast: bool = False) -> dict:
        if self._legacy_export(table_id):
            self._mirror(table_id, [{"id": record_id, "fields": fields}], partial=True)
            try:
                record = self._patch_record(table_id, record_id, fields, typecast=typecast)
            except Exception as error:
                logger.warning("Airtable legacy export failed for %s %s: %s", table_id, record_id, error)
                return {"id": record_id, "fields": fields}
            self._mirror(table_id, [record])
            return record
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
                try:
                    record = self._patch_record(table_id, record_id, fields, typecast=typecast)
                except Exception as error:
                    logger.warning(
                        "Airtable phase6 legacy export failed for %s %s: %s",
                        table_id,
                        record_id,
                        error,
                    )
                    return pending
                self._mirror(table_id, [record])
                return record
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

        from supabase_reads import try_list_supabase_records

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

        params: dict = {"maxRecords": max_records}
        if formula:
            params["filterByFormula"] = formula
        if view:
            params["view"] = view
        if fields:
            params["fields[]"] = fields
        if sort_field:
            params["sort[0][field]"] = sort_field
            params["sort[0][direction]"] = sort_direction

        url = f"{self._api_root}/{self._base_id}/{table_id}"
        records: list[dict] = []
        offset = None

        while True:
            if offset:
                params["offset"] = offset
            response = self._request("GET", url, table_id=table_id, headers=self._headers, params=params, timeout=60)
            response.raise_for_status()
            payload = response.json()
            records.extend(payload.get("records", []))
            offset = payload.get("offset")
            if not offset or len(records) >= max_records:
                break

        return records[:max_records]

    def delete_record(self, table_id: str, record_id: str) -> dict[str, Any]:
        import requests

        url = f"{self._api_root}/{self._base_id}/{table_id}/{record_id}"
        response = self._request("DELETE", url, table_id=table_id, headers=self._headers, timeout=60)
        response.raise_for_status()
        return response.json()

    def create_records(self, table_id: str, records: list[dict[str, Any]], *, typecast: bool = True) -> list[dict[str, Any]]:
        import requests

        from supabase_pipeline import commit_minted_creates, mint_record_id, release_minted_record_ids

        url = f"{self._api_root}/{self._base_id}/{table_id}"
        created: list[dict[str, Any]] = []
        legacy = self._legacy_export(table_id)
        for start in range(0, len(records), 10):
            chunk = records[start : start + 10]
            minted = [
                {"id": mint_record_id(), "fields": dict(item)}
                for item in chunk
            ] if legacy else []
            committed = False
            if minted:
                try:
                    committed = commit_minted_creates(self._settings, table_id, minted)
                except Exception as error:
                    logger.warning(
                        "supabase create commit failed for %s; Airtable remains required: %s",
                        table_id,
                        error,
                    )
            body: dict[str, Any] = {"records": [{"fields": item} for item in chunk]}
            if typecast:
                body["typecast"] = True
            response = self._request("POST", url, table_id=table_id, headers=self._headers, json=body, timeout=60)
            if not response.ok and committed:
                logger.warning(
                    "Airtable legacy export create failed for %s: %s %s",
                    table_id,
                    response.status_code,
                    (response.text or "")[:300],
                )
                created.extend(minted)
                continue
            response.raise_for_status()
            batch = response.json().get("records", [])
            if committed:
                try:
                    commit_minted_creates(self._settings, table_id, batch)
                    release_minted_record_ids(
                        self._settings, table_id, [row["id"] for row in minted],
                    )
                except Exception as error:
                    logger.warning(
                        "supabase create id adoption failed for %s: %s",
                        table_id,
                        error,
                    )
            created.extend(batch)
            self._mirror(table_id, batch)
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
            if typecast:
                body["typecast"] = True
            response = self._request("PATCH", url, table_id=table_id, headers=self._headers, json=body, timeout=60)
            if not response.ok and legacy:
                logger.warning(
                    "Airtable legacy export batch failed for %s: %s %s",
                    table_id,
                    response.status_code,
                    (response.text or "")[:300],
                )
                updated.extend({"id": str(item["id"]), "fields": dict(item.get("fields") or {})} for item in chunk)
                continue
            if not response.ok and phase6_committed:
                logger.warning(
                    "Airtable phase6 legacy export batch failed for %s: %s %s",
                    table_id,
                    response.status_code,
                    (response.text or "")[:300],
                )
                updated.extend({"id": str(item["id"]), "fields": dict(item.get("fields") or {})} for item in chunk)
                continue
            response.raise_for_status()
            batch = response.json().get("records", [])
            updated.extend(batch)
            self._mirror(table_id, batch)
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
        url = f"{self._api_root}/{self._base_id}/{table_id}"
        body = {
            "records": [{"fields": fields}],
            "performUpsert": {"fieldsToMergeOn": [merge_field]},
            "typecast": typecast,
        }
        response = self._request("PATCH", url, table_id=table_id, headers=self._headers, json=body, timeout=60)
        if not response.ok:
            detail = (response.text or "").strip().replace("\n", " ")[:500]
            message = f"{response.status_code} {response.reason} for url: {url}"
            if detail:
                message = f"{message} {detail}"
            raise requests.HTTPError(message, response=response)
        payload = response.json()
        records = payload.get("records") or []
        if len(records) != 1 or not records[0].get("id"):
            raise RuntimeError("Airtable upsert returned no unambiguous record; do not retry as create")
        record = records[0]
        record_id = record["id"]
        created_ids = payload.get("createdRecords") or []
        updated_ids = payload.get("updatedRecords") or []
        if record_id in created_ids and record_id not in updated_ids:
            self._mirror(table_id, [record])
            return record, True
        if record_id in updated_ids and record_id not in created_ids:
            self._mirror(table_id, [record])
            return record, False
        raise RuntimeError("Airtable did not confirm whether upsert created or updated; do not retry as create")
