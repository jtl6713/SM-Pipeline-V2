from __future__ import annotations

import logging

from flask import Flask, jsonify, request

from config import StageRequest, load_settings
from stages import r2, smv1
from stages.registry import STAGE_NAMES, get_handler, is_implemented

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


def main() -> None:
    logging.basicConfig(level=settings.get("log_level", "info").upper())
    app.run(host=settings["host"], port=settings["port"], debug=False)


if __name__ == "__main__":
    main()
