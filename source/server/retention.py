"""Bound transient status results; persisted capture history is never removed."""
import time

STATUS_LIMIT = 100
STATUS_TTL = 3600


def prune_finished(jobs, now=None):
    now = time.monotonic() if now is None else now
    finished = [(key, value.get('finished_at', now)) for key, value in jobs.items()
                if value.get('status') in ('completed', 'failed', 'stopped')]
    finished.sort(key=lambda pair: pair[1])
    overflow = max(0, len(finished) - STATUS_LIMIT)
    for index, (key, timestamp) in enumerate(finished):
        if index < overflow or now - timestamp > STATUS_TTL:
            jobs.pop(key, None)
