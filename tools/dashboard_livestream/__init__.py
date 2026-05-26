"""W60 — Operator Dashboard Live-stream.

Extends W57 (`operator_dashboard`) with a long-running ``--watch``
mode: every ``interval_seconds`` seconds the wizard re-aggregates
the games root and re-emits the HTML + JSON dashboard atomically.

Designed for regulator/ops monitors that stay open on a wall display.
Pure stdlib — no async runtime, no background server. The watcher
runs synchronously in the main process and writes new files via
``os.replace()`` so a browser's auto-refresh always sees a coherent
HTML.

Two stop modes:
  * ``max_iterations`` — after N refreshes, exit.
  * SIGINT / KeyboardInterrupt — gracefully stop after the current
    iteration completes.
"""
from tools.dashboard_livestream.livestream import (
    LivestreamConfig,
    LivestreamReport,
    LivestreamIteration,
    run_livestream,
)

__all__ = [
    "LivestreamConfig",
    "LivestreamReport",
    "LivestreamIteration",
    "run_livestream",
]
