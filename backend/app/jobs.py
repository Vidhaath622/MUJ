"""Background batch runs with live progress.

A batch is a few minutes of model calls, so POST /evaluate/batch {"async": true}
returns at once and the work runs on a small thread pool. Progress lives in
memory (it is only interesting while the process that runs the batch is alive);
the finished result goes to the runs table like a synchronous batch.
"""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable

log = logging.getLogger("ragseal.jobs")


@dataclass
class Progress:
    batch_id: str
    user_id: str
    total: int
    started: float = field(default_factory=time.time)
    done: int = 0
    failed: int = 0
    status: str = "running"  # running | done | failed
    error: str | None = None
    finished: float | None = None

    def to_dict(self) -> dict:
        end = self.finished or time.time()
        elapsed_ms = int((end - self.started) * 1000)
        rate = self.done / (elapsed_ms / 60000) if self.done and elapsed_ms else None
        eta_ms = None
        if self.status == "running" and self.done:
            eta_ms = int(elapsed_ms / self.done * (self.total - self.done))
        elif self.status != "running":
            eta_ms = 0
        return {
            "batch_id": self.batch_id,
            "status": self.status,
            "done": self.done,
            "total": self.total,
            "failed": self.failed,
            "elapsed_ms": elapsed_ms,
            "eta_ms": eta_ms,
            "cases_per_min": round(rate, 2) if rate else None,
            "error": self.error,
        }


class BatchJobs:
    def __init__(self, max_parallel_batches: int = 2):
        self._pool = ThreadPoolExecutor(max_workers=max_parallel_batches, thread_name_prefix="batch")
        self._lock = threading.Lock()
        self._jobs: dict[str, Progress] = {}

    def get(self, user_id: str, batch_id: str) -> Progress | None:
        job = self._jobs.get(batch_id)
        return job if job and job.user_id == user_id else None

    def submit(
        self,
        batch_id: str,
        user_id: str,
        total: int,
        work: Callable[[Callable[[int, int, int], None]], dict],
        on_done: Callable[[dict], None],
        on_error: Callable[[str], None],
    ) -> Progress:
        job = Progress(batch_id=batch_id, user_id=user_id, total=total)
        with self._lock:
            self._jobs[batch_id] = job

        def report(done: int, total: int, failed: int) -> None:
            job.done, job.total, job.failed = done, total, failed

        def run() -> None:
            try:
                result = work(report)
                on_done(result)
                job.status = "done"
            except Exception as exc:  # noqa: BLE001 - any failure must end the job, not hang it as "running"
                log.exception("batch %s failed", batch_id)
                job.status, job.error = "failed", str(exc) or type(exc).__name__
                on_error(job.error)
            finally:
                job.finished = time.time()

        self._pool.submit(run)
        return job
