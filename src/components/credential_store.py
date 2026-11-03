"""Stored provider keys: load + decrypt, and mark a key Invalid when the provider rejects it."""
from sqlalchemy import select, update

from src.components import database as db
from src.components import key_vault as crypto
from src.components import llm_providers as providers
from src.components import model_catalog
from src.exceptions import AppError


def load_key(conn, user_id, provider_id):
    c = db.credentials.c
    row = conn.execute(
        select(c.encrypted_key, c.wrapped_dek, c.kek_id, c.status)
        .where(c.user_id == user_id, c.provider_id == provider_id)
    ).one_or_none()
    if not row:
        raise AppError(400, "NO_API_KEY", "Add an API key for this provider first.")
    if row.status != "Valid":
        raise AppError(400, "NO_VALID_KEY", "Your API key for this provider is invalid. Replace it to continue.")
    key = crypto.decrypt(row.encrypted_key, row.wrapped_dek, row.kek_id, user_id, provider_id)
    return key, row.encrypted_key


def get_key(user_id, provider_id):
    """(plaintext key, its stored ciphertext). The ciphertext identifies which saved key a call used."""
    with db.engine.connect() as conn:
        return load_key(conn, user_id, provider_id)


def mark_invalid(user_id, provider_id, ciphertext):
    """Mark the key Invalid only if it is still the one that failed; a key saved meanwhile stays Valid."""
    c = db.credentials.c
    with db.engine.begin() as conn:
        n = conn.execute(update(db.credentials).where(
            c.user_id == user_id, c.provider_id == provider_id, c.encrypted_key == ciphertext,
        ).values(status="Invalid")).rowcount
    if n:
        model_catalog.forget(user_id, provider_id)


def provider_call(user_id, provider_id, ciphertext, op, *args):
    try:
        return providers.call(provider_id, op, *args)
    except AppError as e:
        if e.code == "INVALID_KEY":
            mark_invalid(user_id, provider_id, ciphertext)
        raise
