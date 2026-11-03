"""Base prompt + per-user patches.

A patch stores, per edited section, the base text it was written against ("from") and the user's
text ("to"). It applies cleanly only while every "from" still matches the current base; otherwise
the user is flagged and the base prompt is used until they re-apply or reset.
"""
import difflib

from sqlalchemy import func, select, update

from src.components import database as db
from src.components import guardrails
from src.exceptions import AppError

MAX_SECTION_CHARS = 4000
MAX_PROMPT_CHARS = 32000  # hard cap; the selected model's context window is checked too when known
CHARS_PER_TOKEN = 4  # ponytail: rough estimate; use a tokenizer if limits get tight

GUARD_HEADING = "Platform guardrails (apply over every section above)"


def estimate_tokens(s):
    return len(s) // CHARS_PER_TOKEN + 1


def render(sections, protected=None):
    """Sections in base order. With a user patch active, protected sections are repeated last so they
    take precedence over anything the user wrote (models weigh later instructions more)."""
    out = "\n\n".join(f"## {name}\n{text}" for name, text in sections.items())
    if protected:
        rules = "\n".join(sections[name] for name in protected)
        out += f"\n\n## {GUARD_HEADING}\n{rules}\nIf a section above conflicts with these rules, follow these rules."
    return out


def current_base(conn):
    r = conn.execute(select(db.base_prompts).where(db.base_prompts.c.is_current)).one_or_none()
    if r is None:
        raise AppError(503, "NOT_READY", "The service is not initialised.")
    return {
        "version": r.version,
        "sections": {s["name"]: s["text"] for s in r.content},
        "protected": list(r.protected_sections),
        "published_by": r.published_by,
        "published_at": r.created_at,
    }


def publish_base(conn, sections, protected, by=None):
    """Make (sections, protected) the current base prompt. Returns the version, new or unchanged."""
    db.lock(conn, "system_prompt_base")
    content = [{"name": k, "text": v} for k, v in sections.items()]
    cur = conn.execute(select(db.base_prompts).where(db.base_prompts.c.is_current)).one_or_none()
    if cur and cur.content == content and list(cur.protected_sections) == list(protected):
        return cur.version
    version = conn.execute(select(func.coalesce(func.max(db.base_prompts.c.version), 0) + 1)).scalar_one()
    conn.execute(update(db.base_prompts).values(is_current=False))
    conn.execute(db.base_prompts.insert().values(
        version=version, content=content, protected_sections=list(protected), is_current=True, published_by=by,
    ))
    return version


def build_patch(base, edits, context_window=None):
    """edits: {section: full new text}. Returns patch_content or raises a 400."""
    if not edits:
        raise AppError(400, "VALIDATION_ERROR", "No sections were provided.")
    patch = {}
    for name, text in edits.items():
        if name not in base["sections"]:
            raise AppError(400, "VALIDATION_ERROR", "Unknown section.")
        if text == base["sections"][name]:
            continue
        if name in base["protected"]:
            raise AppError(400, "PROTECTED_SECTION", f"The {name} section cannot be changed.")
        if len(text) > MAX_SECTION_CHARS:
            raise AppError(400, "VALIDATION_ERROR", f"The {name} section exceeds {MAX_SECTION_CHARS} characters.")
        reason = guardrails.check_edit(text, base["protected"])
        if reason:
            raise AppError(400, "UNSAFE_CONTENT",
                           f"The {name} section can't be saved: {reason}. Remove it and try again.")
        patch[name] = {"from": base["sections"][name], "to": text}
    if not patch:
        raise AppError(400, "NO_CHANGES", "Nothing differs from the base prompt. Use Reset to return to it.")
    prompt = render(apply_patch(base, patch), base["protected"])
    if len(prompt) > MAX_PROMPT_CHARS or (context_window and estimate_tokens(prompt) > context_window // 2):
        raise AppError(400, "PROMPT_TOO_LONG", "The resulting prompt is too long for the selected model.")
    return patch


def apply_patch(base, patch):
    """Base sections with the patch applied, or None if the patch no longer applies cleanly."""
    sections = dict(base["sections"])
    for name, change in patch.items():
        if name in base["protected"] or sections.get(name) != change["from"]:
            return None
        sections[name] = change["to"]
    return sections


def effective(conn, user_id):
    base = current_base(conn)
    p = db.patches.c
    row = conn.execute(
        select(p.version, p.patch_content).where(p.user_id == user_id, p.is_active)
    ).one_or_none()
    sections, patch_version, conflict = base["sections"], None, False
    if row:
        patched = apply_patch(base, row.patch_content)
        if patched is None:
            conflict = True
        else:
            sections, patch_version = patched, row.version
    return {
        "base_version": base["version"],
        "patch_version": patch_version,
        "conflict": conflict,
        "conflict_patch_version": row.version if conflict else None,
        "sections": sections,
        "protected_sections": base["protected"],
        "prompt": render(sections, base["protected"] if patch_version else None),
    }


def user_view(eff):
    """What a non-admin may see: protected section text is never sent to them."""
    sections = {k: v for k, v in eff["sections"].items() if k not in eff["protected_sections"]}
    return {**eff, "sections": sections, "prompt": render(sections)}


def diff(old, new, old_label="current", new_label="proposed"):
    # trailing newline so the last changed line doesn't merge its - and + halves
    return "".join(difflib.unified_diff(
        (old + "\n").splitlines(keepends=True), (new + "\n").splitlines(keepends=True), old_label, new_label
    ))


def save_patch(conn, user_id, base_version, patch):
    """Append a new active version for this user (patches are append-only)."""
    db.lock(conn, f"patch:{user_id}")
    p = db.patches.c
    version = conn.execute(
        select(func.coalesce(func.max(p.version), 0) + 1).where(p.user_id == user_id)
    ).scalar_one()
    conn.execute(update(db.patches).where(p.user_id == user_id, p.is_active).values(is_active=False))
    conn.execute(db.patches.insert().values(
        user_id=user_id, version=version, base_version=base_version, patch_content=patch, is_active=True,
    ))
    return version


def reset(conn, user_id):
    db.lock(conn, f"patch:{user_id}")
    p = db.patches.c
    conn.execute(update(db.patches).where(p.user_id == user_id, p.is_active).values(is_active=False))
