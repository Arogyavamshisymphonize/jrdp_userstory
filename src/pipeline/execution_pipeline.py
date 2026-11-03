"""One run: preference -> key -> effective prompt -> provider -> leak check -> audit row."""
import logging
import time

from src import constants as config
from src import logger as logs
from src.components import credential_store, guardrails, model_catalog
from src.components import database as db
from src.components import llm_providers as providers
from src.components import prompt_manager as prompts
from src.entity.artifact_entity import ExecutionArtifact
from src.exceptions import AppError
from src.utils import rate_limit

log = logging.getLogger("llm_agent")

AUDIT_TEXT_CHARS = 20000
_NOT_LOGGED = {"correlation_id", "task_text", "response_text"}  # the id is on every log line; texts stay in the DB


def _for_audit(s):
    """Redacted (keys, tokens) and capped, so the audit never holds a full secret or an unbounded blob."""
    return logs.redact(s)[:AUDIT_TEXT_CHARS]


def run(user, task):
    rate_limit("execute", user, config.EXECUTIONS_PER_MINUTE)
    with db.engine.connect() as conn:  # read phase; no connection is held during the provider call
        pref = model_catalog.preference(conn, user)
        if not pref:
            raise AppError(400, "NO_MODEL_PREFERENCE", "Select a provider and model before running a task.")
        key, ciphertext = credential_store.load_key(conn, user, pref.provider_id)  # no platform-key fallback
        eff = prompts.effective(conn, user)
    pid, model = pref.provider_id, pref.model_id
    window = model_catalog.context_window(user, pid, model)
    if window and prompts.estimate_tokens(eff["prompt"] + task) + providers.MAX_OUTPUT_TOKENS > window:
        raise AppError(400, "CONTEXT_TOO_LONG", "The task is too long for the selected model.")

    row = {"user_id": user, "provider_id": pid, "model_id": model, "base_version": eff["base_version"],
           "patch_version": eff["patch_version"], "correlation_id": logs.correlation_id.get(), "status": "ERROR",
           "task_text": _for_audit(task)}
    start = time.perf_counter()
    try:
        output, tin, tout = credential_store.provider_call(user, pid, ciphertext, "execute", key, model,
                                                           eff["prompt"], task)
        row.update(status="SUCCESS", tokens_in=tin, tokens_out=tout, response_text=_for_audit(output))
        if guardrails.leaks_protected(output, eff["sections"], eff["protected_sections"]):
            row["status"] = "OUTPUT_BLOCKED"
            raise AppError(422, "OUTPUT_BLOCKED",
                           "The response was withheld because it contained protected platform instructions.")
    except AppError as e:
        row["status"] = e.code
        raise
    finally:
        row["latency_ms"] = round((time.perf_counter() - start) * 1000)
        with db.engine.begin() as conn:
            conn.execute(db.audit.insert().values(**row))
        log.info("execution", extra={"fields": {k: v for k, v in row.items() if k not in _NOT_LOGGED}})
    return ExecutionArtifact(
        output=output, provider_id=pid, model_id=model, base_version=eff["base_version"],
        patch_version=eff["patch_version"], prompt_conflict=eff["conflict"], tokens_in=tin, tokens_out=tout,
        correlation_id=row["correlation_id"],
    )
