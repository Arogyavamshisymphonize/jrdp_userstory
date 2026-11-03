"""Small shared helpers."""
import threading
import time
from collections import deque

from src.exceptions import AppError

MAX_CACHE_ENTRIES = 10000
# ponytail: per-process rate limits; move to Redis if one instance's view isn't enough
_hits = {}  # (bucket, user_id) -> deque of timestamps
_hits_lock = threading.Lock()
_last_sweep = 0.0


def rate_limit(bucket, user, per_minute):
    global _last_sweep
    now = time.monotonic()
    with _hits_lock:
        if len(_hits) > MAX_CACHE_ENTRIES and now - _last_sweep > 10:
            _last_sweep = now
            for k in [k for k, q in _hits.items() if not q or q[-1] < now - 60]:
                del _hits[k]
        q = _hits.setdefault((bucket, user), deque())
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= per_minute:
            raise AppError(429, "RATE_LIMITED", "Too many requests. Try again in a minute.")
        q.append(now)
