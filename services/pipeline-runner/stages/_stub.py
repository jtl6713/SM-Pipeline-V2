from config import StageRequest, StageResult, load_settings


def run_stub(stage: str, request: StageRequest) -> StageResult:
    settings = load_settings()
    return StageResult(
        stage=stage,
        status="not_implemented",
        message=f"Stage {stage} is scaffolded but not migrated from Make yet.",
        details={
            "make_replacement_status": "pending",
            "request": request.to_dict(),
            "service_version": settings["service_version"],
        },
    )
