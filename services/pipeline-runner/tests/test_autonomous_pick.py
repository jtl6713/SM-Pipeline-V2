from app import app


def test_autonomous_pick_uses_i1_generate_ideas(monkeypatch):
    monkeypatch.setattr(
        "app.generate_ideas",
        lambda prompt: {"parsed": {"skip": True, "reason": "no_asset_backed_trend", "prompt": prompt[:12]}},
    )
    client = app.test_client()
    response = client.post("/jobs/autonomous-pick", json={"prompt": "pick one chicago idea"})
    assert response.status_code == 200
    body = response.get_json()
    assert body["ok"] is True
    assert body["parsed"]["skip"] is True
    assert body["parsed"]["reason"] == "no_asset_backed_trend"


def test_autonomous_pick_requires_prompt():
    client = app.test_client()
    response = client.post("/jobs/autonomous-pick", json={})
    assert response.status_code == 422
