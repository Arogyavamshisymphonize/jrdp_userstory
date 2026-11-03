"""Prompt guardrails: reject unsafe patch edits, catch model output that copies protected text."""
import re

# ponytail: keyword denylist, swap for a moderation/classifier call if people find bypasses
# (reason shown to the user, pattern). Together these are the whole rule set; order only picks the reason.
UNSAFE_RULES = [
    ("tries to override earlier or protected instructions", re.compile(
        r"ignore (all |any )?(of )?(the )?(previous|prior|above|earlier|system|safety) (instructions|rules|prompt)"
        r"|disregard (the |all |any )?(previous |prior |above )?(safety|guardrails?|compliance|rules|instructions)"
        # instructions about the prompt itself rather than the task (seen bypassing the rest in QA)
        r"|no longer appl(y|ies)|(everything|text|anything) (above|before) this|above this line", re.I)),
    ("tries to switch off the safety rules", re.compile(
        r"(disable|bypass|override|remove|turn off) (the |all |any )?(safety|guardrails?|compliance|content (filter|policy))"
        r"|you (are|have) no (restrictions|rules|guardrails)|developer mode|jailbreak", re.I)),
    ("asks the model to reveal secrets or its own instructions", re.compile(
        r"(reveal|print|show|output|leak|repeat|share) (the |your |my |any )?(api[ _-]?keys?|secrets?|credentials|"
        r"passwords?|system prompt|(system |hidden )?instructions)"
        r"|(full|entire) text of|(system|hidden|these|your) (prompt|instructions)|verbatim", re.I)),
]


def check_edit(text, protected):
    """None if an editable section's new text is allowed, else why not (quoting the offending phrase)."""
    for why, rule in UNSAFE_RULES:
        m = rule.search(text)
        if m:
            return f'"{m.group(0)}" {why}'
    for name in protected:
        if name.lower() in text.lower():
            return f'it refers to the protected "{name}" section'
    return None


LEAK_SHINGLE_WORDS = 6  # this many consecutive protected words in an answer counts as a leak


def _words(s):
    return re.findall(r"[a-z0-9']+", s.lower())


def leaks_protected(output, sections, protected):
    """True if the model output copies protected platform text (6+ consecutive words of a protected section).
    Deterministic backstop for jailbreaks that get past input validation; a loose paraphrase can still pass."""
    out = " " + " ".join(_words(output)) + " "
    for name in protected:
        w = _words(sections[name])
        for i in range(max(1, len(w) - LEAK_SHINGLE_WORDS + 1)):
            if " " + " ".join(w[i:i + LEAK_SHINGLE_WORDS]) + " " in out:
                return True
    return False
