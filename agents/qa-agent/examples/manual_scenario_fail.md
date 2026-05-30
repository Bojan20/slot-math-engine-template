# Example: manual scenario fails one shell step

**Invocation**

```bash
python -m tools.qa_agent manual --scenario base-smoke --seed 42
```

**Failure mode**

Step `agent-paths-importable` runs `python3 -c "from tools.agent_paths import
agents_root; print(agents_root())"`. If `tools/agent_paths.py` is missing or
moved, the step exits non-zero with the expected ImportError surface.

**Agent verdict**

```
verdict: FAIL  exit_code: 1
  L0       PASS   selftest      SCN=PASS; CLI=PASS; AB=PASS; RPT=PASS; SUB=PASS
  L9       FAIL   manual        1 run · 1 fail · 0 error
```

**Findings extract from `report.json`**

```json
{
  "layer": "L9",
  "severity": "CRITICAL",
  "location": "scenario:base-smoke",
  "symptom": "FAIL at step agent-paths-importable: exit 1 != expected 0; stderr=\"ImportError: …\"",
  "repro_cmd": "python -m tools.qa_agent manual --scenario base-smoke"
}
```

**Key surface**

| Field | Source | Why required |
|---|---|---|
| severity | scenario YAML `severity` (mapped) | Triage priority |
| location | `scenario:<id>` | One reproducer per scenario |
| symptom | last failing step's `detail` | Includes captured stderr tail |
| repro_cmd | canonical CLI invocation | Regulator-replayable |
