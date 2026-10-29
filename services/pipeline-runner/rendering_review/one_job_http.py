"""Protected exact one-Reel Runner entrypoint. No generalized poller."""
from __future__ import annotations
import hmac
import os
import re
import threading
from flask import Blueprint, jsonify, request
from rendering_review.one_job import render_exact_attempt, ExactReviewRenderDenied
from rendering_review.recovery import require_unlaunched_authority, ReviewRecoveryDenied

RECORD=re.compile(r"rec[A-Za-z0-9]{14}\Z")
TOKEN=re.compile(r"[A-Za-z0-9_-]{8,120}\Z")
_ACTIVE:set[str]=set()
_RESULTS:dict[str,dict]={}
_LOCK=threading.RLock()

def create_exact_review_render_blueprint(settings,runner=render_exact_attempt,
                                         recovery_guard=require_unlaunched_authority):
    blueprint=Blueprint("review_one_reel",__name__)
    def authorized():
        configured=str(settings.get("pipeline_runner_shared_secret") or "").strip()
        supplied=request.headers.get("X-Pipeline-Secret","")
        return bool(configured) and hmac.compare_digest(configured,supplied)

    def worker(job_id,output_id):
        try:
            response=runner(output_id,job_id)
            result={"state":"ready_for_review" if response.get("ok") else "needs_reconciliation",
                    "attempt_id":response.get("attempt_id"),
                    "drive_file_id":response.get("drive_file_id")}
        except Exception as exc:
            # Do not auto-retry: a remote render may have started already.
            # Status is private/shared-secret-gated; expose only our own
            # bounded, allowlisted denial code, never provider bodies/URLs.
            reason_code = ""
            if isinstance(exc, ExactReviewRenderDenied):
                code = str(exc).split(":", 1)[0]
                if re.fullmatch(r"[a-z][a-z0-9_]{0,95}", code):
                    reason_code = code
            result={"state":"needs_reconciliation",
                    "reason":reason_code or type(exc).__name__,
                    "reason_code":reason_code}
        with _LOCK:
            _RESULTS[job_id]=result
            _ACTIVE.discard(job_id)

    @blueprint.post("/jobs/rendering-review/run-exact")
    def start_exact():
        if os.environ.get("RENDERING_REVIEW_EXACT_RENDER_ENABLED")!="true":
            return jsonify(ok=False,error="exact_render_disabled"),405
        if not authorized():
            return jsonify(ok=False,error="runner_auth_required"),401
        if not request.is_json or (request.content_length or 0)>900:
            return jsonify(ok=False,error="invalid_request"),400
        body=request.get_json(silent=True)
        if not isinstance(body,dict) or set(body)!={"output_id","job_id"}:
            return jsonify(ok=False,error="invalid_request"),400
        output_id=body.get("output_id")
        job_id=body.get("job_id")
        if not isinstance(output_id,str) or not RECORD.fullmatch(output_id) or (
            output_id!=os.environ.get("RENDERING_REVIEW_EXACT_OUTPUT_ID")) or (
            not isinstance(job_id,str) or not TOKEN.fullmatch(job_id)):
            return jsonify(ok=False,error="exact_output_not_allowlisted"),403
        with _LOCK:
            if job_id in _ACTIVE:
                return jsonify(ok=True,accepted=True,already_running=True,
                               output_id=output_id,job_id=job_id),202
            if job_id in _RESULTS:
                return jsonify(ok=True,accepted=False,already_finished=True,
                               state=_RESULTS[job_id]["state"],
                               output_id=output_id,job_id=job_id),200
            _ACTIVE.add(job_id)
            _RESULTS[job_id]={"state":"accepted"}
        thread=threading.Thread(target=worker,args=(job_id,output_id),
                                name="render-review-"+job_id[:24],daemon=True)
        thread.start()
        return jsonify(ok=True,accepted=True,output_id=output_id,job_id=job_id,
                       public_post_created=False),202

    @blueprint.post("/jobs/rendering-review/reconcile-exact")
    def reconcile_exact():
        """Resume the SAME saved job only after durable no-launch proof.

        The prior process may remember an error even though the authoritative
        Airtable job was never claimed. Never erase a launch receipt or start a
        new attempt. The Worker independently fences claim and Remotion intent.
        """
        if os.environ.get("RENDERING_REVIEW_EXACT_RENDER_ENABLED") != "true":
            return jsonify(ok=False, error="exact_render_disabled"), 405
        if not authorized():
            return jsonify(ok=False, error="runner_auth_required"), 401
        if not request.is_json or (request.content_length or 0) > 900:
            return jsonify(ok=False, error="invalid_request"), 400
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or set(data) != {"output_id", "job_id"}:
            return jsonify(ok=False, error="invalid_request"), 400
        output_id = data.get("output_id")
        job_id = data.get("job_id")
        if (not isinstance(output_id, str) or not RECORD.fullmatch(output_id)
            or output_id != os.environ.get("RENDERING_REVIEW_EXACT_OUTPUT_ID")
            or not isinstance(job_id, str) or not TOKEN.fullmatch(job_id)):
            return jsonify(ok=False, error="exact_output_not_allowlisted"), 403
        with _LOCK:
            # No restart for any known live/completed job. Unknown means
            # a process was restarted after a failed preclaim execution.
            old = _RESULTS.get(job_id, {})
            previous = str(old.get("state") or "unknown")
            if job_id in _ACTIVE or previous not in ("unknown", "needs_reconciliation"):
                return jsonify(ok=False, error="existing_job_not_recoverable",
                               state=previous), 409
            try:
                if recovery_guard(output_id, job_id) is not True:
                    raise ReviewRecoveryDenied("unlaunched_authority_not_verified")
            except Exception:
                # Never reveal Airtable response bodies or perform a retry
                # when authority is missing or reads are ambiguous.
                return jsonify(ok=False, error="unlaunched_authority_unverified"), 409
            _ACTIVE.add(job_id)
            _RESULTS[job_id] = {"state": "accepted", "reconciled_unlaunched": True}
            thread = threading.Thread(
                target=worker, args=(job_id, output_id),
                name="review-reconcile-" + job_id[:24], daemon=True)
            thread.start()
        return jsonify(ok=True, accepted=True, existing_job_only=True,
                       job_id=job_id, output_id=output_id,
                       public_post_created=False), 202

    @blueprint.get("/jobs/rendering-review/private-audio-qa/rec0uVrVeiUM6shp9")
    def exact_audio_qa_proof():
        # Read-only, exact artifact proof for the already completed V2.
        # No image generation, Remotion calls, uploads or publication.
        if not authorized():
            return jsonify(ok=False,error="runner_auth_required"),401
        if os.environ.get("RENDERING_REVIEW_EXACT_OUTPUT_ID") != "rec0uVrVeiUM6shp9":
            return jsonify(ok=False,error="exact_output_not_allowlisted"),403
        try:
            from rendering_review.audio_qa_proof import verify_8447_audio_repair
            proof=verify_8447_audio_repair()
            return jsonify(ok=True,**proof),200
        except Exception:
            # Never expose file paths, provider errors or credentials.
            return jsonify(ok=False,error="private_media_proof_unverified"),409

    @blueprint.get("/jobs/rendering-review/run-exact/<job_id>")
    def exact_status(job_id):
        if not authorized():
            return jsonify(ok=False,error="runner_auth_required"),401
        if not TOKEN.fullmatch(job_id):
            return jsonify(ok=False,error="invalid_job"),400
        with _LOCK:
            status={"state":"running" if job_id in _ACTIVE else "unknown"}
            status.update(_RESULTS.get(job_id,{}))
        return jsonify(ok=True,job_id=job_id,**status),200

    return blueprint
