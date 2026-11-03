"""REST API, plus the built React UI (frontend/dist) on the same origin.
Every /users/me route and every query is scoped to the authenticated caller.
Routes stay thin: they call src/pipeline (multi-step flows) or src/components (single operations)."""
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path

import anyio.to_thread
from fastapi import Depends, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import delete, select, text
from sqlalchemy.sql import func
from starlette.exceptions import HTTPException as StarletteHTTPException

from src import constants as config
from src import logger as logs
from src.components import credential_store, model_catalog
from src.components import database as db
from src.components import key_vault as crypto
from src.components import llm_providers as providers
from src.components import prompt_manager as prompts
from src.components.auth import current_user, require_admin
from src.entity.config_entity import KeyIn, PreferenceIn, SectionsIn, TaskIn
from src.exceptions import AppError
from src.pipeline import execution_pipeline, prompt_pipeline
from src.utils import rate_limit

log = logging.getLogger("llm_agent")

MAX_BODY_BYTES = 1_000_000  # chunked bodies bypass this; cap them at the proxy too


@asynccontextmanager
async def lifespan(app):
    config.validate()
    logs.setup()
    anyio.to_thread.current_default_thread_limiter().total_tokens = config.THREADPOOL_SIZE
    try:
        with db.engine.connect() as conn:
            prompts.current_base(conn)
    except Exception as e:
        log.critical("database not ready: %s", type(e).__name__)
        raise SystemExit("Database unreachable or not migrated. Run: python -m src.manage migrate")
    log.info("started", extra={"fields": {"env": config.ENV, "auth": config.AUTH_MODE}})
    yield


_docs = config.ENV != "production"
app = FastAPI(
    title="Multi-Provider LLM Agent", lifespan=lifespan,
    docs_url="/docs" if _docs else None, redoc_url=None, openapi_url="/openapi.json" if _docs else None,
)


# ---------- cross-cutting ----------

_CID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


@app.middleware("http")
async def correlate(request: Request, call_next):
    incoming = request.headers.get("x-correlation-id", "")
    cid = incoming if _CID.match(incoming) else str(uuid.uuid4())
    token = logs.correlation_id.set(cid)
    if int(request.headers.get("content-length") or 0) > MAX_BODY_BYTES:
        logs.correlation_id.reset(token)
        return JSONResponse(status_code=413, content={
            "code": "PAYLOAD_TOO_LARGE", "message": "Request is too large.", "correlationId": cid})
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as e:  # handled here, while the correlation id is still set
        log.error("unhandled error", exc_info=e)
        response = _error(500, "INTERNAL_ERROR", "Something went wrong.")
    finally:
        logs.correlation_id.reset(token)
    response.headers["X-Correlation-ID"] = cid
    response.headers.setdefault("Cache-Control", "no-store")  # API responses; the UI sets its own
    if request.url.path not in ("/healthz", "/readyz"):
        log.info("request", extra={"fields": {
            "correlationId": cid, "method": request.method, "path": request.url.path,
            "status": response.status_code, "ms": round((time.perf_counter() - start) * 1000),
        }})
    return response


def _error(status, code, message):
    body = {"code": code, "message": message, "correlationId": logs.correlation_id.get()}
    return JSONResponse(status_code=status, content=body)


@app.exception_handler(AppError)
async def _app_error(request, e):
    return _error(e.status, e.code, e.message)


@app.exception_handler(RequestValidationError)
async def _validation_error(request, e):
    # field names only: pydantic's default body echoes the input, which may be an API key
    if any(err["type"] == "json_invalid" for err in e.errors()):
        return _error(400, "VALIDATION_ERROR", "The request body is not valid JSON.")
    fields = ", ".join(".".join(str(p) for p in err["loc"][1:]) for err in e.errors())
    return _error(400, "VALIDATION_ERROR", f"Invalid request: {fields or 'body'}.")


@app.exception_handler(StarletteHTTPException)
async def _http_error(request, e):
    codes = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}
    return _error(e.status_code, codes.get(e.status_code, "HTTP_ERROR"), "Request could not be handled.")


@app.exception_handler(Exception)
async def _unhandled(request, e):
    log.error("unhandled error", exc_info=e)
    return _error(500, "INTERNAL_ERROR", "Something went wrong.")


# ---------- health ----------

@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"status": "ok"}


@app.get("/readyz", include_in_schema=False)
def readyz():
    try:
        with db.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        raise AppError(503, "NOT_READY", "Database unavailable.")
    return {"status": "ready"}


# ---------- Phase 1: providers, keys, models ----------

@app.get("/api/v1/providers")
def list_providers(user=Depends(current_user)):
    c, p = db.credentials.c, db.providers.c
    with db.engine.connect() as conn:
        creds = {r.provider_id: r for r in conn.execute(
            select(c.provider_id, c.key_last4, c.status).where(c.user_id == user))}
        rows = conn.execute(select(p.id, p.name).where(p.is_active).order_by(p.name)).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "key_status": creds[r.id].status if r.id in creds else "Not Set",
            "key_last4": creds[r.id].key_last4 if r.id in creds else None,
        }
        for r in rows
    ]


@app.get("/api/v1/providers/{provider_id}/models")
def list_models(provider_id: str, user=Depends(current_user)):
    providers.get(provider_id)
    return model_catalog.list_models(user, provider_id, *credential_store.get_key(user, provider_id))


@app.put("/api/v1/users/me/credentials/{provider_id}")
def save_key(provider_id: str, body: KeyIn, user=Depends(current_user)):
    key = body.api_key.get_secret_value().strip()
    providers.check_key_format(provider_id, key)
    rate_limit("key", user, config.KEY_SAVES_PER_MINUTE)  # stops use as a key-checking oracle
    model_catalog.list_models(user, provider_id, key)  # live validation; INVALID_KEY (422) if rejected
    ciphertext, wrapped, kek_id = crypto.encrypt(key, user, provider_id)
    with db.engine.begin() as conn:
        db.upsert(conn, db.credentials, {
            "user_id": user, "provider_id": provider_id, "encrypted_key": ciphertext, "wrapped_dek": wrapped,
            "kek_id": kek_id, "key_last4": key[-4:], "status": "Valid", "validated_at": func.now(),
        }, ["user_id", "provider_id"])
    log.info("api key saved", extra={"fields": {"user": user, "provider": provider_id}})
    return {"provider_id": provider_id, "key_status": "Valid", "key_last4": key[-4:]}


@app.delete("/api/v1/users/me/credentials/{provider_id}")
def delete_key(provider_id: str, user=Depends(current_user)):
    providers.get(provider_id)
    c = db.credentials.c
    with db.engine.begin() as conn:
        n = conn.execute(delete(db.credentials).where(c.user_id == user, c.provider_id == provider_id)).rowcount
    model_catalog.forget(user, provider_id)
    if not n:
        raise AppError(404, "NOT_FOUND", "No API key is saved for this provider.")
    log.info("api key deleted", extra={"fields": {"user": user, "provider": provider_id}})
    return {"provider_id": provider_id, "key_status": "Not Set"}


@app.get("/api/v1/users/me/model-preference")
def get_preference(user=Depends(current_user)):
    with db.engine.connect() as conn:
        r = model_catalog.preference(conn, user)
    return r._asdict() if r else {"provider_id": None, "model_id": None, "updated_at": None}


@app.put("/api/v1/users/me/model-preference")
def save_preference(body: PreferenceIn, user=Depends(current_user)):
    providers.get(body.provider_id)
    models = model_catalog.list_models(user, body.provider_id, *credential_store.get_key(user, body.provider_id))
    if body.model_id not in {m["id"] for m in models}:
        raise AppError(400, "MODEL_UNAVAILABLE", "The selected model is not available for this provider.")
    with db.engine.begin() as conn:
        db.upsert(conn, db.preferences, {
            "user_id": user, "provider_id": body.provider_id, "model_id": body.model_id, "updated_at": func.now(),
        }, ["user_id"])
    return {"provider_id": body.provider_id, "model_id": body.model_id}


# ---------- Phase 2: system prompt ----------

@app.get("/api/v1/users/me/system-prompt")
def get_system_prompt(user=Depends(current_user)):
    return prompt_pipeline.current(user)


@app.post("/api/v1/users/me/system-prompt/preview")
def preview(body: SectionsIn, user=Depends(current_user)):
    return prompt_pipeline.preview(user, body.sections)


@app.post("/api/v1/users/me/system-prompt/patches", status_code=201)
def apply_patch(body: SectionsIn, user=Depends(current_user)):
    return prompt_pipeline.apply(user, body.sections)


@app.get("/api/v1/users/me/system-prompt/patches")
def patch_history(user=Depends(current_user)):
    return prompt_pipeline.history(user)


@app.get("/api/v1/users/me/system-prompt/patches/diff")
def patch_diff(a: int, b: int, user=Depends(current_user)):
    return prompt_pipeline.diff(user, a, b)


@app.post("/api/v1/users/me/system-prompt/patches/{version}/revert", status_code=201)
def revert(version: int, user=Depends(current_user)):
    return prompt_pipeline.revert(user, version)


@app.delete("/api/v1/users/me/system-prompt/patches")
def reset(user=Depends(current_user)):
    return prompt_pipeline.reset(user)


# ---------- Admin ----------

@app.get("/api/v1/admin/base-prompt")
def admin_base_prompt(admin=Depends(require_admin)):
    with db.engine.connect() as conn:
        return prompts.current_base(conn)


@app.put("/api/v1/admin/base-prompt")
def admin_publish_base(body: SectionsIn, admin=Depends(require_admin)):
    """Publish a new base version with the given sections replaced. Users whose patch no longer fits are flagged."""
    with db.engine.begin() as conn:
        base = prompts.current_base(conn)
        if any(k not in base["sections"] for k in body.sections) or not all(v.strip() for v in body.sections.values()):
            raise AppError(400, "VALIDATION_ERROR", "Unknown section or empty text.")
        version = prompts.publish_base(conn, {**base["sections"], **body.sections}, base["protected"], by=admin)
    log.info("base prompt published", extra={"fields": {"admin": admin, "version": version}})
    return {"base_version": version}


def _run_columns():
    a = db.audit.c
    return [a.created_at, a.correlation_id, a.user_id, a.provider_id, a.model_id, a.base_version, a.patch_version,
            a.status, a.tokens_in, a.tokens_out, a.latency_ms]


@app.get("/api/v1/admin/audit")
def admin_audit_list(user_id: str | None = None, status: str | None = None, limit: int = Query(100, ge=1, le=500),
                     admin=Depends(require_admin)):
    """Most recent runs, newest first, optionally for one user and/or one status (texts: use the trace)."""
    a = db.audit.c
    q = select(*_run_columns()).order_by(a.id.desc()).limit(limit)
    if user_id:
        q = q.where(a.user_id == user_id)
    if status:
        q = q.where(a.status == status)
    with db.engine.connect() as conn:
        return [dict(r) for r in conn.execute(q).mappings()]


@app.get("/api/v1/admin/audit/{correlation_id}")
def admin_audit(correlation_id: str, admin=Depends(require_admin)):
    """Trace one run by the correlationId its response carried: who, prompt versions, task, response, outcome."""
    with db.engine.connect() as conn:
        rows = conn.execute(
            select(db.audit).where(db.audit.c.correlation_id == correlation_id).order_by(db.audit.c.id)
        ).mappings().all()
    if not rows:
        raise AppError(404, "NOT_FOUND", "No run has that correlation ID.")
    return [dict(r) for r in rows]


# ---------- Execution ----------

@app.post("/api/v1/agent/execute")
def execute(body: TaskIn, user=Depends(current_user)):
    return asdict(execution_pipeline.run(user, body.task))


@app.get("/api/v1/users/me/runs")
def my_runs(limit: int = Query(50, ge=1, le=200), user=Depends(current_user)):
    """The caller's own runs, newest first, with their task. The answer is included only when it was delivered:
    a withheld answer (OUTPUT_BLOCKED) contains protected text the user must not see."""
    a = db.audit.c
    with db.engine.connect() as conn:
        rows = conn.execute(
            select(*_run_columns(), a.task_text, a.response_text).where(a.user_id == user).order_by(a.id.desc()).limit(limit)
        ).mappings().all()
    return [{**r, "response_text": r["response_text"] if r["status"] == "SUCCESS" else None} for r in rows]


# ---------- UI (registered last: it catches every other GET) ----------

UI_DIR = Path(__file__).resolve().parent / "frontend" / "dist"  # built by the Dockerfile or `npm run build`

if UI_DIR.is_dir():
    @app.get("/{path:path}", include_in_schema=False)
    def ui(path: str):
        """Files from the build; index.html for client-side routes (/run, /keys, /admin/audit, ...)."""
        if path.startswith("api/"):
            raise StarletteHTTPException(404)
        f = (UI_DIR / path).resolve()
        if path and f.is_file() and f.is_relative_to(UI_DIR):
            cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
            return FileResponse(f, headers={"Cache-Control": cache})
        return FileResponse(UI_DIR / "index.html", headers={"Cache-Control": "no-cache"})
