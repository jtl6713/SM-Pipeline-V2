import pytest

from p2.processor import _narration_request

PARENT = "recQ12ZNaNvUCFHUZ"
REQUEST = "receMQV008Cgr4d4L"
NOTES = '[timed-script] {"segments":[{"start_seconds":0,"end_seconds":4,"voiceover_text":"Exact narration.","asset_id":"recsfNsowf6DlC2ZJ"}]}'

class Client:
    def __init__(self, notes=NOTES):
        self.notes = notes
        self.calls = []
    def get_record(self, table, record_id):
        self.calls.append(record_id)
        return {"id": record_id, "fields": {"Promoted_Content_Item": [PARENT], "Production_Notes": self.notes}}

@pytest.mark.parametrize("link", ["Production_Request", "Production Requests"])
def test_resolves_canonical_and_legacy_links(link):
    client = Client()
    item = {"id": PARENT, "fields": {link: [REQUEST], "Production_Request_Notes": NOTES}}
    assert _narration_request(client, item)["id"] == REQUEST
    assert client.calls == [REQUEST]

def test_no_continuous_fallback_for_missing_authored_request():
    client = Client()
    with pytest.raises(ValueError, match="requires a linked"):
        _narration_request(client, {"id": PARENT, "fields": {"Production_Request_Notes": NOTES}})
    assert not client.calls

def test_conflicting_links_fail_closed():
    with pytest.raises(ValueError, match="Ambiguous"):
        _narration_request(Client(), {"id": PARENT, "fields": {"Production_Request": [REQUEST], "Production Requests": ["recOTHER123456789"]}})

def test_missing_timeline_in_linked_request_fails_closed():
    with pytest.raises(ValueError, match="missing from linked"):
        _narration_request(Client(""), {"id": PARENT, "fields": {"Production_Request": [REQUEST], "Production_Request_Notes": NOTES}})

def test_ordinary_content_without_request_unchanged():
    assert _narration_request(Client(), {"id": PARENT, "fields": {}}) is None
