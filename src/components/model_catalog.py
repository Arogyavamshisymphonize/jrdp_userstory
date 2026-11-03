"""Models available to a user's key (cached), and the user's saved provider/model preference."""
import time

from sqlalchemy import select

from src.components import credential_store  # circular, module-level only: names are used at call time
from src.components import database as db
from src.components import llm_providers as providers
from src.utils import MAX_CACHE_ENTRIES

MODEL_CACHE_TTL = 15 * 60
# ponytail: per-process cache; move to Redis if one instance's view isn't enough
_model_cache = {}  # (user_id, provider_id) -> (expires_at, models)


def forget(user_id, provider_id):
    _model_cache.pop((user_id, provider_id), None)


def list_models(user_id, provider_id, key, ciphertext=None):
    """Cached catalogue. Without a ciphertext, `key` is a candidate being validated: a rejection marks nothing."""
    ck = (user_id, provider_id)
    hit = _model_cache.get(ck)
    if hit and hit[0] > time.time() and ciphertext is not None:
        return hit[1]
    if ciphertext is None:
        models = providers.call(provider_id, "list_models", key)
    else:
        models = credential_store.provider_call(user_id, provider_id, ciphertext, "list_models", key)
    providers.tag_free_tier(provider_id, models)
    if len(_model_cache) >= MAX_CACHE_ENTRIES:
        _model_cache.pop(next(iter(_model_cache)), None)
    _model_cache[ck] = (time.time() + MODEL_CACHE_TTL, models)
    return models


def context_window(user_id, provider_id, model_id):
    """From the cached catalogue only, never a provider call; None if unknown."""
    hit = _model_cache.get((user_id, provider_id))
    if hit:
        return next((m["context_window"] for m in hit[1] if m["id"] == model_id), None)
    return None


def preference(conn, user_id):
    p = db.preferences.c
    return conn.execute(select(p.provider_id, p.model_id, p.updated_at).where(p.user_id == user_id)).one_or_none()


def user_window(conn, user_id):
    pref = preference(conn, user_id)
    return context_window(user_id, pref.provider_id, pref.model_id) if pref else None
