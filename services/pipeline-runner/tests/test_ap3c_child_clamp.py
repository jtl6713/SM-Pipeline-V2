from apc.common import clamp_ig_graph_children, expected_child_count
from apc.constants import IG_GRAPH_MAX_CHILDREN
from apc import ap3c


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def _finished_children(count):
    return [
        {
            "id": f"recSLIDE{i:02d}ABCDEFG",
            "fields": {
                "Current Order": i,
                "Slide Number": i,
                "IG_Child_Container_ID": f"child{i}",
                "IG_Child_Container_Status": "FINISHED",
            },
        }
        for i in range(1, count + 1)
    ]


class FakeClient:
    def __init__(self, output):
        self.output = output
        self.updates = []

    def get_record(self, table, record_id):
        return self.output

    def update_record(self, table, record_id, fields, typecast=False):
        self.updates.append(dict(fields))
        self.output.setdefault("fields", {}).update(fields)
        return self.output


class FakeGraph:
    def __init__(self):
        self.parents = []

    def create_parent(self, *, children, caption):
        self.parents.append({"children": list(children), "caption": caption})
        return 200, {"id": "parent123"}


def test_clamp_ig_graph_children_keeps_first_ten():
    rows = _finished_children(12)
    clamped, capped = clamp_ig_graph_children(rows)
    assert capped is True
    assert len(clamped) == IG_GRAPH_MAX_CHILDREN
    assert clamped[0]["fields"]["Current Order"] == 1
    assert clamped[-1]["fields"]["Current Order"] == 10


def test_clamp_ig_graph_children_noop_under_max():
    rows = _finished_children(8)
    clamped, capped = clamp_ig_graph_children(rows)
    assert capped is False
    assert len(clamped) == 8


def test_ap3c_caps_twelve_finished_children_before_graph(monkeypatch):
    output = _record(
        Platform="Instagram",
        Platform_Output_Type="Instagram Carousel",
        Output_ID="1235",
        IG_Carousel_Status="Children Ready",
        IG_Carousel_Child_Count=12,
        Image_Count=12,
        Selected_Clip_Count=12,
        IG_Carousel_All_Children_Ready=1,
        Output_Caption="See the park",
        Output_Notes="",
        Auto_Publish_Enabled=True,
        Do_Not_Publish=0,
    )
    client = FakeClient(output)
    graph = FakeGraph()

    monkeypatch.setattr(ap3c, "AirtableClient", lambda: client)
    monkeypatch.setattr(ap3c, "ap3c_eligibility_reason", lambda _output: None)
    monkeypatch.setattr(ap3c, "list_finished_children", lambda *_a, **_k: _finished_children(12))
    monkeypatch.setattr(ap3c, "load_instagram_settings", lambda *_a, **_k: {})
    monkeypatch.setattr(ap3c, "InstagramCarouselClient", lambda **_kwargs: graph)
    monkeypatch.setattr(ap3c, "PipelineSettings", lambda _client: object())

    result = ap3c.process_request(output_record_id=output["id"])

    assert result["processed"] is True
    assert result.get("children_capped") is True
    assert result.get("requested_child_count") == 12
    assert result.get("expected_child_count") == 10
    assert graph.parents
    assert graph.parents[0]["children"] == [f"child{i}" for i in range(1, 11)]
    assert any(update.get("IG_Carousel_Child_Count") == 10 for update in client.updates)
    assert any(update.get("Image_Count") == 10 for update in client.updates)
    assert any(update.get("IG_Carousel_Parent_Container_ID") == "parent123" for update in client.updates)


def test_expected_child_count_still_reads_raw_fields():
    assert expected_child_count(_record(IG_Carousel_Child_Count=12), 12) == 12
