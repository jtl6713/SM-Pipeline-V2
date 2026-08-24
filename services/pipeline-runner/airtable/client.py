from typing import Any

from config import load_settings


class AirtableClient:
    """Minimal Airtable REST client for stage workers."""

    def __init__(self, settings: dict | None = None) -> None:
        settings = settings or load_settings()
        pat = settings.get("airtable_pat", "")
        if not pat:
            raise RuntimeError("AIRTABLE_PAT is required for Airtable operations")
        self._base_id = settings["airtable_base_id"]
        self._headers = {
            "Authorization": f"Bearer {pat}",
            "Content-Type": "application/json",
        }
        self._api_root = "https://api.airtable.com/v0"

    def get_record(self, table_id: str, record_id: str) -> dict:
        import requests

        url = f"{self._api_root}/{self._base_id}/{table_id}/{record_id}"
        response = requests.get(url, headers=self._headers, timeout=60)
        response.raise_for_status()
        return response.json()

    def update_record(self, table_id: str, record_id: str, fields: dict, *, typecast: bool = False) -> dict:
        import requests

        url = f"{self._api_root}/{self._base_id}/{table_id}/{record_id}"
        body = {"fields": fields}
        if typecast:
            body["typecast"] = True
        response = requests.patch(url, headers=self._headers, json=body, timeout=60)
        response.raise_for_status()
        return response.json()

    def list_records(
        self,
        table_id: str,
        *,
        formula: str | None = None,
        view: str | None = None,
        max_records: int = 10,
        fields: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        import requests

        params: dict = {"maxRecords": max_records}
        if formula:
            params["filterByFormula"] = formula
        if view:
            params["view"] = view
        if fields:
            params["fields[]"] = fields

        url = f"{self._api_root}/{self._base_id}/{table_id}"
        records: list[dict] = []
        offset = None

        while True:
            if offset:
                params["offset"] = offset
            response = requests.get(url, headers=self._headers, params=params, timeout=60)
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
        response = requests.delete(url, headers=self._headers, timeout=60)
        response.raise_for_status()
        return response.json()

    def create_records(self, table_id: str, records: list[dict[str, Any]], *, typecast: bool = True) -> list[dict[str, Any]]:
        import requests

        url = f"{self._api_root}/{self._base_id}/{table_id}"
        body: dict[str, Any] = {"records": [{"fields": item} for item in records]}
        if typecast:
            body["typecast"] = True
        response = requests.post(url, headers=self._headers, json=body, timeout=60)
        response.raise_for_status()
        return response.json().get("records", [])
