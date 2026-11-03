"""Personal patch lifecycle: preview, apply, history, diff, revert, reset. Admins see protected text, users don't."""
import logging

from sqlalchemy import select

from src.components import database as db
from src.components import model_catalog
from src.components import prompt_manager as prompts
from src.components.auth import is_admin
from src.exceptions import AppError

log = logging.getLogger("llm_agent")


def _visible(eff, user):
    admin = is_admin(user)
    return {**(eff if admin else prompts.user_view(eff)), "is_admin": admin}


def current(user):
    with db.engine.connect() as conn:
        return _visible(prompts.effective(conn, user), user)


def preview(user, sections):
    with db.engine.connect() as conn:
        base = prompts.current_base(conn)
        eff = prompts.effective(conn, user)
        window = model_catalog.user_window(conn, user)
    patched = prompts.apply_patch(base, prompts.build_patch(base, sections, window))
    if is_admin(user):
        cur, resolved = eff["prompt"], prompts.render(patched, base["protected"])
    else:  # protected text stays out of the response
        cur = prompts.user_view(eff)["prompt"]
        resolved = prompts.render({k: v for k, v in patched.items() if k not in base["protected"]})
    return {"current": cur, "resolved": resolved, "diff": prompts.diff(cur, resolved)}


def apply(user, sections):
    with db.engine.begin() as conn:
        base = prompts.current_base(conn)
        patch = prompts.build_patch(base, sections, model_catalog.user_window(conn, user))
        version = prompts.save_patch(conn, user, base["version"], patch)
        result = prompts.effective(conn, user)
    log.info("prompt patch applied", extra={"fields": {"user": user, "version": version}})
    return _visible(result, user)


def history(user):
    p = db.patches.c
    with db.engine.connect() as conn:
        rows = conn.execute(
            select(p.version, p.base_version, p.patch_content, p.is_active, p.created_at)
            .where(p.user_id == user).order_by(p.version.desc()).limit(200)
        ).all()
    return [
        {
            "version": r.version,
            "base_version": r.base_version,
            "is_active": r.is_active,
            "created_at": r.created_at,
            "sections": {k: v["to"] for k, v in r.patch_content.items()},
        }
        for r in rows
    ]


def diff(user, a, b):
    """Unified diff of the editable sections between two of the caller's saved versions."""
    p = db.patches.c
    with db.engine.connect() as conn:
        base = prompts.current_base(conn)
        rows = {r.version: r.patch_content for r in conn.execute(
            select(p.version, p.patch_content).where(p.user_id == user, p.version.in_([a, b])))}
    if a not in rows or b not in rows:
        raise AppError(404, "NOT_FOUND", "That prompt version does not exist.")
    text = lambda v: prompts.render({  # noqa: E731
        k: rows[v][k]["to"] if k in rows[v] else s for k, s in base["sections"].items() if k not in base["protected"]})
    return {"diff": prompts.diff(text(a), text(b), f"v{a}", f"v{b}")}


def revert(user, version):
    p = db.patches.c
    with db.engine.begin() as conn:
        r = conn.execute(
            select(p.base_version, p.patch_content).where(p.user_id == user, p.version == version)
        ).one_or_none()
        if not r:
            raise AppError(404, "NOT_FOUND", "That prompt version does not exist.")
        base = prompts.current_base(conn)
        if prompts.apply_patch(base, r.patch_content) is None:
            raise AppError(409, "PATCH_CONFLICT",
                           "That version no longer fits the current base prompt. Edit and apply it again.")
        # re-check under today's rules: an old version must not bring back text that is now disallowed
        patch = prompts.build_patch(base, {k: v["to"] for k, v in r.patch_content.items()},
                                    model_catalog.user_window(conn, user))
        new_version = prompts.save_patch(conn, user, base["version"], patch)
        result = prompts.effective(conn, user)
    log.info("prompt patch reverted", extra={"fields": {"user": user, "from": version, "version": new_version}})
    return _visible(result, user)


def reset(user):
    with db.engine.begin() as conn:
        prompts.reset(conn, user)
        result = prompts.effective(conn, user)
    log.info("prompt reset to base", extra={"fields": {"user": user}})
    return _visible(result, user)
