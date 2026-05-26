"""W50 — Live RGS Connector tests."""
from __future__ import annotations
import json
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path

from tools.rgs_connector.connector import (
    ConnectorReport,
    client_send,
    extract_spin,
    feed_event,
    pick_free_port,
    serve_tcp,
    tail_jsonl_stream,
)
from tools.rtp_monitor.monitor import MonitorState, RtpSnapshot


def _spin_event(bet: float, pay: float, seq: int = 1) -> dict:
    return {
        "event_id": f"ev-{seq:08d}",
        "session_id": "00000000-0000-0000-0000-000000000000",
        "seq": seq,
        "ts_utc": "2026-05-26T16:00:00Z",
        "event_type": "slot.spin_completed",
        "payload": {"bet": bet, "pay": pay, "rng_state": "deadbeef"},
    }


class ExtractSpinTest(unittest.TestCase):
    def test_extracts_bet_pay_from_spin_event(self):
        ev = _spin_event(1.0, 2.5)
        result = extract_spin(ev)
        self.assertEqual(result, (1.0, 2.5, 1))

    def test_returns_none_for_non_spin_event(self):
        ev = {"event_type": "slot.heartbeat", "payload": {"uptime_ms": 100}}
        self.assertIsNone(extract_spin(ev))

    def test_returns_none_for_missing_payload(self):
        self.assertIsNone(extract_spin({"event_type": "slot.spin_completed"}))

    def test_returns_none_for_non_dict_input(self):
        self.assertIsNone(extract_spin("not a dict"))
        self.assertIsNone(extract_spin(None))

    def test_handles_bad_numeric_values(self):
        ev = {
            "event_type": "slot.spin_completed",
            "payload": {"bet": "abc", "pay": 1.0},
        }
        self.assertIsNone(extract_spin(ev))

    def test_explicit_win_count_override(self):
        ev = _spin_event(1.0, 0.0)
        ev["payload"]["win_count"] = 3
        bet, pay, wc = extract_spin(ev)
        self.assertEqual((bet, pay, wc), (1.0, 0.0, 3))


class FeedEventTest(unittest.TestCase):
    def test_feed_updates_state_and_returns_snapshot(self):
        state = MonitorState(target_rtp=0.95)
        snap = feed_event(state, _spin_event(1.0, 0.5))
        self.assertIsNotNone(snap)
        self.assertEqual(snap.spins, 1)
        self.assertAlmostEqual(snap.cumulative_rtp, 0.5)

    def test_feed_skips_non_spin_events(self):
        state = MonitorState()
        snap = feed_event(state, {"event_type": "slot.heartbeat"})
        self.assertIsNone(snap)
        self.assertEqual(state.spins, 0)


class TailJsonlTest(unittest.TestCase):
    def test_tail_file_basic(self):
        with tempfile.TemporaryDirectory() as td:
            log = Path(td) / "events.ndjson"
            events = [
                _spin_event(1.0, 0.0, seq=1),
                _spin_event(1.0, 2.0, seq=2),
                {"event_type": "slot.heartbeat", "payload": {"uptime_ms": 10}},
                _spin_event(1.0, 1.5, seq=3),
            ]
            log.write_text(
                "\n".join(json.dumps(e) for e in events) + "\n"
            )
            state = MonitorState(target_rtp=0.95)
            report = ConnectorReport()
            snaps_yielded = []
            for ev, snap in tail_jsonl_stream(
                log, state=state, follow=False, report=report
            ):
                snaps_yielded.append((ev, snap))
            self.assertEqual(report.events_received, 4)
            self.assertEqual(report.spins_consumed, 3)
            self.assertEqual(report.non_spin_skipped, 1)
            self.assertEqual(report.decode_errors, 0)
            self.assertEqual(state.spins, 3)
            self.assertAlmostEqual(state.total_pay, 3.5)

    def test_tail_handles_malformed_lines(self):
        with tempfile.TemporaryDirectory() as td:
            log = Path(td) / "events.ndjson"
            log.write_text(
                json.dumps(_spin_event(1.0, 1.0, 1)) + "\n"
                + "{not json\n"
                + json.dumps(_spin_event(1.0, 0.0, 2)) + "\n"
            )
            state = MonitorState()
            report = ConnectorReport()
            list(tail_jsonl_stream(log, state=state, report=report))
            self.assertEqual(report.decode_errors, 1)
            self.assertEqual(report.spins_consumed, 2)

    def test_tail_max_events_cap(self):
        with tempfile.TemporaryDirectory() as td:
            log = Path(td) / "events.ndjson"
            log.write_text(
                "\n".join(
                    json.dumps(_spin_event(1.0, 1.0, i + 1)) for i in range(10)
                )
                + "\n"
            )
            state = MonitorState()
            report = ConnectorReport()
            consumed = list(
                tail_jsonl_stream(log, state=state, max_events=3, report=report)
            )
            self.assertEqual(len(consumed), 3)
            self.assertEqual(report.events_received, 3)

    def test_tail_on_snapshot_callback(self):
        with tempfile.TemporaryDirectory() as td:
            log = Path(td) / "events.ndjson"
            log.write_text(
                json.dumps(_spin_event(1.0, 1.0, 1)) + "\n"
                + json.dumps(_spin_event(1.0, 0.5, 2)) + "\n"
            )
            state = MonitorState()
            captured: list[RtpSnapshot] = []

            def sink(_ev, snap):
                captured.append(snap)

            list(
                tail_jsonl_stream(
                    log, state=state, on_snapshot=sink, follow=False
                )
            )
            self.assertEqual(len(captured), 2)
            self.assertEqual(captured[-1].spins, 2)


class TcpServerTest(unittest.TestCase):
    def test_tcp_round_trip(self):
        port = pick_free_port()
        state = MonitorState(target_rtp=0.95)
        report = ConnectorReport()
        ready = threading.Event()

        events = [_spin_event(1.0, 0.5, seq=i + 1) for i in range(5)]

        def _runner():
            serve_tcp(
                "127.0.0.1",
                port,
                state,
                max_events=len(events),
                report=report,
                ready_event=ready,
            )

        t = threading.Thread(target=_runner, daemon=True)
        t.start()
        ready.wait(timeout=3.0)
        # Server is bound. Briefly retry the client send because
        # serve_forever may not have entered the accept loop yet on
        # some kernels even though the bind has happened.
        last_err = None
        for _ in range(20):
            try:
                bytes_sent = client_send("127.0.0.1", port, events)
                last_err = None
                break
            except (ConnectionRefusedError, OSError) as e:  # pragma: no cover
                last_err = e
                time.sleep(0.05)
        if last_err is not None:  # pragma: no cover
            raise last_err
        self.assertGreater(bytes_sent, 0)
        t.join(timeout=3.0)
        self.assertFalse(t.is_alive())
        self.assertEqual(report.events_received, 5)
        self.assertEqual(report.spins_consumed, 5)
        self.assertEqual(state.spins, 5)
        self.assertAlmostEqual(state.total_pay, 2.5)

    def test_tcp_skips_non_spin_events(self):
        port = pick_free_port()
        state = MonitorState()
        report = ConnectorReport()
        ready = threading.Event()
        events = [
            {"event_type": "slot.heartbeat", "payload": {"uptime_ms": 1}},
            _spin_event(1.0, 1.0, seq=1),
            {"event_type": "slot.heartbeat", "payload": {"uptime_ms": 2}},
        ]

        def _runner():
            serve_tcp(
                "127.0.0.1",
                port,
                state,
                max_events=len(events),
                report=report,
                ready_event=ready,
            )

        t = threading.Thread(target=_runner, daemon=True)
        t.start()
        ready.wait(timeout=3.0)
        for _ in range(20):
            try:
                client_send("127.0.0.1", port, events)
                break
            except (ConnectionRefusedError, OSError):  # pragma: no cover
                time.sleep(0.05)
        t.join(timeout=3.0)
        self.assertEqual(report.non_spin_skipped, 2)
        self.assertEqual(report.spins_consumed, 1)

    def test_tcp_decode_error_does_not_crash(self):
        port = pick_free_port()
        state = MonitorState()
        report = ConnectorReport()
        ready = threading.Event()

        def _runner():
            serve_tcp(
                "127.0.0.1",
                port,
                state,
                max_events=3,
                report=report,
                ready_event=ready,
            )

        t = threading.Thread(target=_runner, daemon=True)
        t.start()
        ready.wait(timeout=3.0)
        # Mix one bad line with two good spins; the bad line is
        # counted as decode_error but does not poison the stream.
        bad_payload = (
            "{not json\n"
            + json.dumps(_spin_event(1.0, 0.5, 1)) + "\n"
            + json.dumps(_spin_event(1.0, 0.5, 2)) + "\n"
        )
        last_err = None
        for _ in range(20):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=2.0) as s:
                    s.sendall(bad_payload.encode())
                last_err = None
                break
            except (ConnectionRefusedError, OSError) as e:  # pragma: no cover
                last_err = e
                time.sleep(0.05)
        if last_err is not None:  # pragma: no cover
            raise last_err
        t.join(timeout=3.0)
        self.assertGreaterEqual(report.decode_errors, 1)
        self.assertEqual(report.spins_consumed, 2)


class CliTest(unittest.TestCase):
    def test_cli_tail_smoke(self):
        from tools.rgs_connector.__main__ import main

        with tempfile.TemporaryDirectory() as td:
            log = Path(td) / "events.ndjson"
            summary = Path(td) / "summary.json"
            log.write_text(
                json.dumps(_spin_event(1.0, 1.5, 1)) + "\n"
                + json.dumps(_spin_event(1.0, 0.0, 2)) + "\n"
            )
            rc = main(
                [
                    "tail",
                    str(log),
                    "--target-rtp",
                    "0.95",
                    "--summary-json",
                    str(summary),
                    "--quiet",
                ]
            )
            self.assertEqual(rc, 0)
            data = json.loads(summary.read_text())
            self.assertEqual(data["spins_consumed"], 2)
            self.assertEqual(data["non_spin_skipped"], 0)


if __name__ == "__main__":
    unittest.main()
