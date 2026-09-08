"""HTTP surface shared by local uvicorn and the Modal deployment."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from backend.simulation import (
    MAX_PAYLOAD_BYTES,
    MODEL_VERSION,
    CalculationError,
    InvalidHousehold,
    build_metadata,
    calculate_household,
)

web_app = FastAPI(
    title="Marriage calculator household API", docs_url=None, redoc_url=None
)
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)


@web_app.get("/health")
def health():
    return {"status": "ok", "model_version": MODEL_VERSION}


@web_app.get("/us/metadata")
def metadata(full: bool = False):
    return build_metadata(full)


@web_app.post("/us/calculate")
async def calculate(request: Request):
    # Enforce the limit while reading, including clients using chunked encoding.
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_PAYLOAD_BYTES:
            return JSONResponse(
                status_code=413,
                content={"status": "error", "message": "Request size limit exceeded."},
            )
    try:
        import json

        params = json.loads(body)
        if not isinstance(params, dict) or set(params) - {
            "household",
            "include_head_start_benefits",
            "ccdf_participation_filter",
        }:
            raise InvalidHousehold("Unknown request fields.")
        return await run_in_threadpool(
            calculate_household,
            params.get("household"),
            params.get("include_head_start_benefits", False),
            params.get("ccdf_participation_filter", False),
        )
    except (ValueError, InvalidHousehold) as error:
        return JSONResponse(
            status_code=422, content={"status": "error", "message": str(error)}
        )
    except CalculationError as error:
        return JSONResponse(
            status_code=500, content={"status": "error", "message": str(error)}
        )
