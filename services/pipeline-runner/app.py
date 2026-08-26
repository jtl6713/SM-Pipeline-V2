from __future__ import annotations

import logging

from flask import Flask, jsonify, request

from config import StageRequest, load_settings
from stages import a1p, c3b, i3, r2, rr2, smv1, ttd4
from stages.registry import STAGE_NAMES, get_handler, is_implemented
from studio_produce.processor import resume_job, start_job

logger = logging.getLogger("pipeline-runner")
settings = load_settings()

app = Flask(__name__)


def _verify_secret() -> tuple[dict | None, int | None]:
    expected = settings.get("pipeline_runner_shared_secret", "").strip()
    if not expected:
        return None, None
    provided = request.headers.get("X-Pipeline-Secret", "")
    if provided != expected:
        return jsonify({"error": "Invalid pipeline secret"}), 401
    return None, None


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "pipeline-runner",
            "version": settings["service_version"],
            "stages_registered": len(STAGE_NAMES),
            "stages_implemented": sum(1 for name in STAGE_NAMES if is_implemented(name)),
            "public_base_url": settings.get("public_base_url") or None,
        }
    )


@app.get("/stages")
def list_stages():
    return jsonify(
        {
            "stages": [
                {
                    "name": name,
                    "path": f"/stages/{name}",
                    "implemented": is_implemented(name),
                }
                for name in STAGE_NAMES
            ]
        }
    )


@app.post("/stages/<stage_name>")
def run_stage(stage_name: str):
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status

    body = StageRequest.from_dict(request.get_json(silent=True))
    handler = get_handler(stage_name)
    result = handler(body)

    status_code = 200
    if result.status == "not_implemented":
        status_code = 501
    elif result.status == "deferred":
        status_code = 202
    elif result.status == "error":
        status_code = 422
    elif result.status == "skipped":
        status_code = 200

    logger.info("stage=%s status=%s message=%s", result.stage, result.status, result.message)
    return jsonify(result.to_dict()), status_code


@app.post("/stages/r2/drain")
def run_r2_drain():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status

    body = StageRequest.from_dict(request.get_json(silent=True))
    extra = dict(body.extra or {})
    extra.setdefault("max_runs", 1)
    body.extra = extra
    result = r2.run(body)
    status_code = 202 if result.status == "deferred" else (422 if result.status == "error" else 200)
    logger.info("stage=r2-drain status=%s message=%s", result.status, result.message)
    return jsonify(result.to_dict()), status_code


@app.route("/hooks/rr2/<token>", methods=["GET", "POST"])
def rr2_email_hook(token: str):
    expected = str(settings.get("rr2_webhook_token") or "").strip()
    if not expected or token != expected:
        return jsonify({"error": "not found"}), 404

    record_id = (
        request.values.get("record_id")
        or request.values.get("output_record_id")
        or ""
    ).strip()
    decision = (request.values.get("decision") or "").strip()
    body = StageRequest.from_dict(
        {
            "output_record_id": record_id,
            "extra": {"decision": decision},
        }
    )
    result = rr2.run(body)
    status_code = 422 if result.status == "error" else 200
    logger.info("stage=rr2-hook status=%s message=%s", result.status, result.message)
    wants_html = "text/html" in (request.headers.get("Accept") or "") or request.method == "GET"
    if wants_html:
        run = result.details.get("run") or {}
        html = (
            "<!doctype html><html><body style='font-family:Arial,sans-serif;padding:24px;'>"
            f"<h1>Render review decision</h1>"
            f"<p>{result.message}</p>"
            f"<p>Output {run.get('output_id') or record_id}: "
            f"{run.get('decision_label') or decision or 'no decision'}</p>"
            "</body></html>"
        )
        return html, status_code, {"Content-Type": "text/html; charset=utf-8"}
    return jsonify(result.to_dict()), status_code


@app.route("/hooks/c3b/<token>", methods=["GET", "POST"])
def c3b_email_hook(token: str):
    expected = str(settings.get("c3b_webhook_token") or "").strip()
    if not expected or token != expected:
        return jsonify({"error": "not found"}), 404

    action = (request.values.get("action") or "").strip()
    slide_id = (request.values.get("slide_id") or request.values.get("slide_record_id") or "").strip()
    content_item_id = (
        request.values.get("content_item_id") or request.values.get("content_record_id") or ""
    ).strip()
    notes = request.values.get("notes") or ""
    test_run_id = (request.values.get("test_run_id") or "").strip()
    body = StageRequest.from_dict(
        {
            "content_item_record_id": content_item_id or None,
            "test_run_id": test_run_id or None,
            "extra": {
                "action": action,
                "slide_id": slide_id,
                "notes": notes,
            },
        }
    )
    result = c3b.run(body)
    status_code = 400 if result.status == "skipped" and (result.details.get("run") or {}).get("reason") == "unsupported_action" else (
        422 if result.status == "error" else 200
    )
    logger.info("stage=c3b-hook status=%s message=%s", result.status, result.message)
    html = (result.details.get("run") or {}).get("html") or (
        "<!doctype html><html><body style='font-family:Arial,sans-serif;padding:24px;'>"
        f"<h1>Carousel review</h1><p>{result.message}</p></body></html>"
    )
    return html, status_code, {"Content-Type": "text/html; charset=utf-8"}


@app.route("/hooks/i3/<token>", methods=["GET", "POST"])
def i3_email_hook(token: str):
    expected = str(settings.get("i3_webhook_token") or "").strip()
    if not expected or token != expected:
        return jsonify({"error": "not found"}), 404

    extra = {key: value for key, value in request.values.items()}
    body = StageRequest.from_dict({"extra": extra})
    result = i3.run(body)
    status_code = 422 if result.status == "error" else 200
    logger.info("stage=i3-hook status=%s message=%s", result.status, result.message)
    html = (result.details.get("run") or {}).get("html") or (
        "<!doctype html><html><body style='font-family:Arial,sans-serif;padding:24px;'>"
        f"<h1>Idea review</h1><p>{result.message}</p></body></html>"
    )
    return html, status_code, {"Content-Type": "text/html; charset=utf-8"}


@app.route("/hooks/a1p/<token>", methods=["GET", "POST"])
def a1p_poll_hook(token: str):
    expected = str(settings.get("a1p_webhook_token") or "").strip()
    if not expected or token != expected:
        return jsonify({"error": "not found"}), 404

    extra = {key: value for key, value in request.values.items()}
    json_body = request.get_json(silent=True) or {}
    if isinstance(json_body, dict):
        extra.update(json_body)
    body = StageRequest.from_dict({"extra": extra})
    result = a1p.run(body)
    status_code = 202 if result.status == "deferred" else (422 if result.status == "error" else 200)
    logger.info("stage=a1p-hook status=%s message=%s", result.status, result.message)
    return jsonify(result.to_dict()), status_code


@app.route("/hooks/ttd4", methods=["GET", "POST"])
def ttd4_completion_hook():
    record_id = (
        request.values.get("record_id")
        or request.values.get("output_record_id")
        or ""
    ).strip()
    action = (request.values.get("action") or "form").strip()
    token = (request.values.get("token") or "").strip()
    platform_post_url = (request.values.get("platform_post_url") or "").strip()
    music_completed = (request.values.get("music_completed") or "").strip()
    form_url = request.url.split("?")[0]
    body = StageRequest.from_dict(
        {
            "output_record_id": record_id or None,
            "extra": {
                "action": action,
                "token": token,
                "platform_post_url": platform_post_url,
                "music_completed": music_completed,
                "form_url": form_url,
            },
        }
    )
    result = ttd4.run(body)
    run = result.details.get("run") or {}
    status_code = int(run.get("http_status") or (422 if result.status == "error" else 200))
    logger.info("stage=ttd4-hook status=%s message=%s", result.status, result.message)
    html = run.get("html") or (
        "<!doctype html><html><body style='font-family:Arial,sans-serif;padding:24px;'>"
        f"<h1>TikTok completion</h1><p>{result.message}</p></body></html>"
    )
    return html, status_code, {"Content-Type": "text/html; charset=utf-8"}


@app.post("/stages/smv1/drain")
def run_smv1_drain():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status

    body = StageRequest.from_dict(request.get_json(silent=True))
    if not body.production_request_record_id:
        return jsonify({"error": "production_request_record_id is required"}), 422
    extra = dict(body.extra or {})
    extra.setdefault("max_runs", 8)
    body.extra = extra
    result = smv1.run(body)
    status_code = 422 if result.status == "error" else 200
    logger.info("stage=smv1-drain status=%s message=%s", result.status, result.message)
    return jsonify(result.to_dict()), status_code


def _studio_produce_body() -> tuple[str, bool]:
    payload = request.get_json(silent=True) or {}
    record_id = str(
        payload.get("production_request_record_id")
        or payload.get("record_id")
        or ""
    ).strip()
    resume = bool(payload.get("resume"))
    return record_id, resume


@app.post("/jobs/studio-produce")
def run_studio_produce():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    record_id, resume = _studio_produce_body()
    if not record_id:
        return jsonify({"error": "production_request_record_id is required"}), 422
    try:
        result = start_job(record_id, resume=resume)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-produce start failed")
        return jsonify({"error": str(exc)}), 500
    logger.info(
        "job=studio-produce accepted=%s request=%s step=%s",
        result.get("accepted"),
        record_id,
        (result.get("job") or {}).get("step"),
    )
    return jsonify({"ok": True, **result}), 202


@app.post("/jobs/studio-produce/resume")
def run_studio_produce_resume():
    error_response, status = _verify_secret()
    if error_response is not None:
        return error_response, status
    record_id, _ = _studio_produce_body()
    if not record_id:
        return jsonify({"error": "production_request_record_id is required"}), 422
    try:
        result = resume_job(record_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:
        logger.exception("studio-produce resume failed")
        return jsonify({"error": str(exc)}), 500
    logger.info(
        "job=studio-produce-resume accepted=%s request=%s step=%s",
        result.get("accepted"),
        record_id,
        (result.get("job") or {}).get("step"),
    )
    return jsonify({"ok": True, **result}), 202


def main() -> None:
    logging.basicConfig(level=settings.get("log_level", "info").upper())
    app.run(host=settings["host"], port=settings["port"], debug=False)


if __name__ == "__main__":
    main()
