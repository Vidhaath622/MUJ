"""Sample results: every user sees the showcase account's latest baseline run of each pack, read-only.

Nothing is copied. Samples are the showcase account's own rows (the demo account by default),
read on demand and marked sample=true. In a user's run list, their own finished run of a pack
replaces that pack's sample, so the samples only fill what is empty.
"""

from __future__ import annotations

import threading
import time

from .db import Database, User

REFRESH_S = 30.0  # a new demo run becomes the sample within this long


class Showcase:
    def __init__(self, db: Database, email: str | None):
        self.db = db
        self.email = email
        self._lock = threading.Lock()
        self._loaded_at = float("-inf")
        self._owner: str | None = None
        self._runs: list[dict] = []

    def _load(self) -> tuple[str | None, list[dict]]:
        if not self.email:
            return None, []
        with self._lock:
            if time.monotonic() - self._loaded_at > REFRESH_S:
                found = self.db.user_by_email(self.email)
                self._owner = found[0].id if found else None
                self._runs = [{**run, "sample": True, "read_only": True} for run in self.db.baseline_runs(self._owner)] if self._owner else []
                self._loaded_at = time.monotonic()
            return self._owner, [dict(run) for run in self._runs]

    def samples(self, user: User) -> list[dict]:
        """Every sample run (list_runs items); none for the showcase account itself."""
        owner, runs = self._load()
        return [] if user.id == owner else runs

    def runs_for(self, user: User, own: list[dict]) -> list[dict]:
        """The user's runs, plus a sample for each pack they have no finished run of. Newest first."""
        mine = [{**run, "sample": False} for run in own]
        covered = {run["pack_id"] for run in own if run.get("status", "done") == "done"}
        extra = [run for run in self.samples(user) if run["pack_id"] not in covered]
        return sorted(mine + extra, key=lambda run: run["created_at"], reverse=True) if extra else mine

    def run(self, user: User, batch_id: str) -> dict | None:
        """A sample run's full result, or None when batch_id is not a current sample for this user."""
        owner, runs = self._load()
        if user.id == owner or not any(run["batch_id"] == batch_id for run in runs):
            return None
        result = self.db.get_run(owner, batch_id)
        return {**result, "status": "done", "sample": True, "read_only": True} if result else None
