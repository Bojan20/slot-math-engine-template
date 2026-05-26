"""W66 — Drift Replay Theatre.

Replays a historical NDJSON spin feed through the W62 telemetry
bridge at a configurable speed-up. Operators use it to debug a
past incident step-by-step with throttled timestamps:

  * ``speedup=1.0`` — wall-clock real time replay
  * ``speedup=60.0`` — 1 minute → 1 second
  * ``speedup=0.0`` — no throttling, replay as fast as possible
                     (effectively a deterministic regression run)

Each tick logs the wall-clock delay applied, the delta between
consecutive event timestamps (from ``ts`` field), and the bridge
report after every emitted snapshot.

Output: structured ``DriftReplayReport`` + optional NDJSON tick log
so a UI can scrub the replay forwards/backwards.
"""
from tools.drift_replay.theatre import (
    ReplayTick,
    DriftReplayReport,
    replay,
    replay_file,
)

__all__ = [
    "ReplayTick",
    "DriftReplayReport",
    "replay",
    "replay_file",
]
