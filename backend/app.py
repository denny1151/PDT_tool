import json
import math
import os
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request as GithubRequest, urlopen

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

ALLOWED_ORIGIN = "https://denny1151.github.io"
WORKFLOW = (
    "https://api.github.com/repos/denny1151/PDT_tool"
    "/actions/workflows/request-refresh.yml"
)
COOLDOWN_SECONDS = 600

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware, allow_origins=[ALLOWED_ORIGIN], allow_methods=["POST"]
)


def github(path, token, body=None):
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2026-03-10",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    with urlopen(GithubRequest(f"{WORKFLOW}/{path}", data=data, headers=headers), timeout=8) as response:
        return json.load(response) if response.status != 204 else {}


@app.post("/api/refresh")
def refresh(request: Request):
    if request.headers.get("origin") != ALLOWED_ORIGIN:
        return JSONResponse({"status": "invalid_origin"}, status_code=403)
    token = os.environ.get("PDT_GITHUB_TOKEN")
    if not token:
        return JSONResponse({"status": "unavailable"}, status_code=503)

    try:
        runs = github("runs?branch=main&event=workflow_dispatch&per_page=1", token)
        if runs["workflow_runs"]:
            run = runs["workflow_runs"][0]
            run_id = run["id"]
            if run["status"] != "completed":
                return {"status": "pending", "runId": run_id}
            created = datetime.fromisoformat(run["created_at"])
            elapsed = (datetime.now(timezone.utc) - created).total_seconds()
            remaining = math.ceil(COOLDOWN_SECONDS - elapsed)
            if remaining > 0:
                return JSONResponse(
                    {"status": "cooldown", "retryAfter": remaining, "runId": run_id},
                    status_code=429,
                    headers={"Retry-After": str(remaining)},
                )

        run = github("dispatches", token, {"ref": "main"})
    except (URLError, TimeoutError, ValueError, KeyError):
        return JSONResponse({"status": "upstream_unavailable"}, status_code=502)

    return JSONResponse(
        {"status": "queued", "runId": run.get("workflow_run_id")},
        status_code=202,
    )
