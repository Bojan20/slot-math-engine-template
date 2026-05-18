# W212 — Pre-prod Gauntlet

Generated: 2026-05-18T19:44:25.226Z
Mode: synthetic
Total: 574 ms
Verdict: PASS (10/10)

| Gate | Verdict | Duration (ms) | Metric / Note |
| --- | :---: | ---: | --- |
| Smoke suite (W210) | PASS | 128 |  |
| Pilot integration (W211) | PASS | 4 | steps=10 |
| 1B spin benchmark (synthetic) | PASS | 120 | spinsPerSec=9.25e+6 |
| Load test 1k spins/sec | PASS | 1 | p99=10.943 p50=5.818 total=1000 |
| Cert dossier rehearsal | PASS | 1 | available=true |
| Chaos scenarios (W212 Agent B) | SKIP | 0 | dirPresent=false |
| Mutation refresh (no-run) | PASS | 4 | total=342 |
| Perf regression vs baseline | PASS | 3 | regressionCount=0 |
| Latency budget snapshot | PASS | 0 | p99=98.93 |
| Memory-leak quick (synthetic) | PASS | 313 | growthBytes=191112 growthPctPerHour=24688.845 |
