# BUILD_PIPELINE_REVIEW — slot-math-engine-template

**Schema**: `urn:slotmath:build-pipeline-review:v1`
**Reviewer**: BUILD_PIPELINE_REVIEWER (Corti agent)
**Date (UTC)**: 2026-05-27
**Scope**: `tools/slot_build/` (7 modules) + 4 `[project.scripts]` entry points
(`slot-build`, `slot-build-verify`, `slot-build-cert`, `slot-cert-xml`,
`slot-cert-xml-v2`)

---

## Executive summary

The W5.x build pipeline is **architecturally sound and broadly correct**, with
strong cert-bundle integrity (SHA-256 commitments, ed25519 signature,
standalone `verify.sh`, ZIP packaging) and disciplined three-tier MC gating
(`quick` / `standard` / `strict`). It also ships a competent v1 + v2 cert
XML emitter with namespace-tagged sections, structural validation, and
JSON-driven CLI ergonomics. However, the **closed-form RTP estimator inside
the Rust codegen (`codegen_rust.py::closed_form_estimate`) is mathematically
incorrect** — it computes `count / cells_per_reel` against an *average*
strip length instead of each reel's *own* length, producing wrong RTP
whenever reels are uneven, and it ignores symbol position within the combo
(no per-reel-column conditioning). This **must be fixed before pilot** since
operators will read the JSON output of the per-game runner crate as a
sanity figure. Secondary risks: the cert-xml `_build_rtp_report` reads
`meta.target_rtp` while the cert-package manifest reads `meta.rtp_total`
(silent disagreement on the same IR field across two emitters in the same
package), and the ephemeral-key cert mode generates a fresh keypair on
every build — useful for smoke tests but produces an unverifiable trust
chain when the bundle is consumed outside the same machine that built it
(by design, but the README should warn louder). All issues are bounded and
fixable in a single follow-up wave.

---

## Stages audited (8)

| # | Stage | Module | Notes |
|---|---|---|---|
| 1 | Vendor auto-detect | `__main__.detect_vendor` | OK — disjoint signatures, ≥2-hit guard |
| 2 | PAR → vendor IR | `__main__` + `parse_par` | OK — JSON written, size logged |
| 3 | Vendor IR → universal IR | `__main__` + `to_slot_sim` | OK — `NotImplementedError` caught + WARN |
| 4 | MC sanity run | `__main__.run_mc` + `verify.py` | Mostly OK; brittle stdout parsing |
| 5 | Per-game scaffold (W5.2) | `__main__.write_scaffold` | OK |
| 6 | Codegen (TS / Studio / Rust / Svelte) | `__main__` + `codegen_rust.py` | **Closed-form RTP math is wrong** |
| 7 | Cert package ZIP (W5.6) | `cert_package.py` | OK + ed25519 sign + verify.sh |
| 8 | Cert XML v1 + v2 | `cert_xml.py`, `cert_xml_v2.py` | OK + namespace-validated |

---

## CRITICAL findings (must-fix before pilot)

| ID | Location | Severity | Issue |
|---|---|---|---|
| C-1 | `codegen_rust.py::closed_form_estimate` lines 152-214 | **CRITICAL** | `cells_per_reel = total_cells / n_reels` averages over reels — gives wrong RTP for uneven strip lengths. Math should compute `count_on_reel_c / len(reels[c])` per column and multiply across the combo *positionally*; current implementation treats `combo` as a multi-set and uses an averaged divisor. **RTP estimate will be silently off** for any IR where reel strip lengths differ (common in IGT/L&W). |
| C-2 | `codegen_rust.py::closed_form_estimate` lines 200-209 | **CRITICAL** | Combo `["A","A","A","A","A"]` is treated identically regardless of column position — the estimator multiplies `(c_a/cells_per_reel)^5` instead of `Π_c P(A on reel c)`. This is the same root cause as C-1 but presents independently: even when reels have identical lengths, symbol distributions across reels are usually NOT uniform (that's the whole point of per-reel strips). The estimator is essentially `(global_freq)^len(combo) * pays` — does not reflect any real slot-math model. |
| C-3 | `cert_xml.py::_build_rtp_report` line 128 vs `cert_package.py::build_manifest` line 147 | **CRITICAL** | Cert XML reads `meta.target_rtp`; cert manifest reads `meta.rtp_total`. Same IR, same cert bundle, **two different keys for the canonical RTP target**. If only one is populated by the upstream parser, the regulator-facing XML will show "target=None" while the manifest shows a valid number, or vice versa. Needs a single source-of-truth helper + fallback chain. |
| C-4 | `__main__.run_mc` lines 117-138 | **CRITICAL** | `slot-sim` stdout parsing is positional+whitespace-fragile (`line.split()[1]`, `line.split()[2]`). Any change to the Rust binary's print format silently breaks RTP/hit-freq capture and feeds garbage into `compare_drift`. There is no schema/JSON output negotiation — the build pipeline trusts free-text. Should switch to `slot-sim --json` (if available) or pin a regex. |

## WARN findings (should-fix)

| ID | Location | Severity | Issue |
|---|---|---|---|
| W-1 | `cert_package.py::build_cert_package` lines 259-275 | WARN | Ephemeral keypair generation produces a fresh ed25519 key for every build; the bundle verifies against its own embedded pubkey but offers **no chain to a trust root**. README mentions HSM only in passing. Regulators expect the pubkey to be vouched for elsewhere (W72 trust anchor). |
| W-2 | `cert_package.py::_build_verify_script` lines 363-437 | WARN | `verify.sh` re-embeds two HEREDOC python scripts inline — they're self-contained, but the only path validation is `f"ir/{label}.ir.json"` (string interpolation inside a HEREDOC). A maliciously-crafted `label` in `ir_commitments` could in principle steer the path; today the labels are hard-coded so it's safe, but it's brittle to future extension. |
| W-3 | `__main__` lines 1463-1471 | WARN | Summary print uses a Python conditional expression as an f-string default — if `rtp_d is None or hf_d is None` the printed line drops the `Δrtp`/`Δhit` columns silently. CI consumers parsing this stdout will see misaligned columns. |
| W-4 | `verify.py::verify_one` lines 88-122 | WARN | When `run_mc` raises, the result dict misses `rtp`, `drift`, `failed_metrics` keys but downstream callers (e.g. CLI print at line 213) reference `r["failed_metrics"]` unconditionally. The exit path is shielded by `if r["ok"]` so today no crash; one accidental refactor breaks the gate. |
| W-5 | `cert_xml_v2.py::emit_cert_xml_v2` lines 197-211 | WARN | Re-tagging v1 elements to v2 namespace via `el.iter()` mutates the v1-namespaced tree IN PLACE. Today no caller reuses the returned subtrees, but `_build_meta`/`_build_topology` are imported by other modules (`cert_xml_v2` line 55) — if any of them cache an Element across calls, mutation would leak. Pure-functional `deepcopy` is safer. |
| W-6 | `cert_package.py::compute_par_commitments` lines 119-127 | WARN | `_sha256_file` over every file `rglob("*")` will silently include `.DS_Store`, hidden directories, OS junk. Should skip dot-files + `__pycache__`. |
| W-7 | `cert_xml.py::_build_rtp_report` line 134 | WARN | Float coercion `float(measured) - float(target)` will raise if either is a string sentinel like `"n/a"`. No `try/except` — the whole XML emit fails. |
| W-8 | `__main__.run_mc` line 111 | WARN | `subprocess.run(..., timeout=600)` — hard-coded 10-min timeout. For `strict`-tier 1B-spin runs this is **fundamentally insufficient**. Should be `None` (no timeout) or proportional to `spins`. |
| W-9 | `verify.py::CI_TIERS` lines 36-40 | WARN | `quick` tier threshold `0.05` (5 %) is a *very* loose gate — a known-bad IR with 4 % drift passes. Acceptable as PR pre-gate; should be documented in the README that strict-tier is the only true regulatory gate. |
| W-10 | `gdd_mode.py::main` line 141 | WARN | `except Exception` swallows every error from the GDD pipeline (PDF parse, DSL convert, SMT solve) and emits a single line to stderr. No tracebacks even in non-quiet mode. Hard to debug regulator-mode rejections. |
| W-11 | `__main__.py::_iter_sheets` line 70 | WARN | Imports `re` inside the function — minor (cold-path), but inconsistent with the module-level imports elsewhere. |
| W-12 | `cert_package.py::build_cert_package` line 275 | WARN | `private_pem = b"\x00" * len(private_pem)` zeroes the LOCAL reference; the original bytes object survives in CPython until GC. True secure-erase requires `ctypes.memset` on a `bytearray`. For pilot OK; production HSM signing avoids this entirely. |

## INFO observations

| ID | Location | Note |
|---|---|---|
| I-1 | `__main__` lines 198-647 | The Studio HTML/JS/CSS template is embedded as a >300-line Python f-string. It works but is hostile to maintenance and grep. Consider externalizing to `tools/slot_build/templates/studio/`. |
| I-2 | `codegen_rust.py` | Cargo dependency `slot-sim = { path = "$slot_sim_path" }` is emitted into the Cargo.toml but `closed_form_estimate` doesn't actually use the `slot_sim` crate — it parses JSON via `serde_json::Value` only. The dep is dead weight (and a build-break vector if `slot_sim` evolves). |
| I-3 | `cert_xml_v2.py::ir_digest` line 116-119 | Canonical JSON with `sort_keys=True, separators=(",", ":")` — good. But uses `json.dumps` not `json.JSONEncoder(sort_keys=True).iterencode` — minor efficiency note. |
| I-4 | `verify.py` line 196 | The "drift exceeds threshold" message uses Python `:+.4f` on the threshold which adds a `+` sign for a positive number — `drift>threshold` reads correctly but `drift>{+0.0500}` is mildly confusing. |
| I-5 | `cert_xml.py::emit_cert_xml` line 281 | `ET.register_namespace("", NS_URI)` is a module-global side-effect; concurrent emitters in the same process would collide. Today there's only one. |
| I-6 | `__main__` lines 1310-1316 | `--codegen-all-runtimes` fan-out mutates `args` (`args.codegen_rust = args.codegen_all_runtimes`) — works, but argparse Namespaces aren't conventionally mutated after parsing. |
| I-7 | `cert_package.py` line 211 | `os.uname()` is unavailable on Windows; the `hasattr` guard catches it, but the build_metadata then claims `host="unknown"` for every Windows build. Could fall back to `socket.gethostname()`. |
| I-8 | `__main__.run_mc` lines 122/127/132 | Three nearly-identical parser blocks for RTP/HitFreq/WinFreq. Ripe for a tiny helper. |
| I-9 | All CLIs | Consistent `--help` (via argparse default), `--quiet`, exit codes 0/1/2 — good. Only `cert_xml_v2` lacks `--quiet`. |

---

## Test coverage gaps (vs `tools/tests/test_w5_*`)

| Module | Existing test | Gap |
|---|---|---|
| `__main__.py` | `test_w5_1_slot_build.py` | ✅ vendor detect / scaffold / unknown-vendor; ❌ no test for `run_mc` stdout-format drift (C-4); ❌ no test for `--codegen-all-runtimes` fan-out mutating args; ❌ summary-print column-drop case (W-3). |
| `cert_package.py` | `test_w5_6_cert_package.py` | ✅ bundle entries / signature / SHA / tamper / verify.sh; ❌ no test for `compute_par_commitments` filtering `.DS_Store` / dotfiles (W-6); ❌ no test for ephemeral-key warning surfacing (W-1); ❌ no test exercising `mc_report_path` IR-matching loop branch (cert_package.py line 159 — `str(universal_ir_path) in ir_str or universal_ir_path.name in ir_str` has substring-match false-positive risk for similarly-named IRs in a multi-game MC report). |
| `cert_xml.py` | `test_w5_6_cert_xml.py` | ✅ sections / delta / jurisdictions / CLI exits; ❌ no test for `target_rtp` vs `rtp_total` field disagreement (C-3); ❌ no test for non-numeric `measured`/`target` (W-7); ❌ no test exercising `features = dict` branch (line 156-158). |
| `cert_xml_v2.py` | `test_w51_cert_xml_v2.py` | ✅ v2 namespace / multi-jurisdiction / digest determinism / CLI; ❌ no test for in-place mutation of imported v1 builders (W-5); ❌ no test exercising `--juris-entry` malformed JSON (parser raises but exit code is uncaught argparse error, not 2). |
| `codegen_rust.py` | `test_p3_2_rust_codegen.py` | ✅ layout / Cargo / determinism / slug; ❌ **no test on `closed_form_estimate` correctness** (C-1/C-2) — the test suite only verifies the crate *compiles & generates*, never that the numbers are right. Critical gap. |
| `gdd_mode.py` | `test_w6_5_slot_build_gdd.py` | ✅ pipeline / CLI / Studio scaffold; ❌ no test for SMT-failure path; ❌ no test for `except Exception` swallowing tracebacks (W-10). |
| `verify.py` | `test_w5_5_mc_verify.py` | ✅ tier matrix / threshold gate / exit codes / report shape / per-IR tolerance; ❌ no test for missing-binary case returning exit 2; ❌ no test for `subprocess timeout=600` insufficient on strict tier (W-8). |

**Coverage score**: 7/8 stages have ≥1 dedicated test file (only stage 1 "vendor auto-detect" shares its file with the rest of `__main__`). **Math-correctness of the Rust codegen RTP estimator is entirely untested.**

---

## CLI contract summary

| Entry point | --help | --quiet | --json/--report | Exit 0 | Exit 1 | Exit 2 | Exit 3 |
|---|---|---|---|---|---|---|---|
| `slot-build` | ✓ | ✓ | ✗ (--scaffold writes files) | ✓ | ✗ (uses warns) | ✓ (bad dir / unknown vendor) | — |
| `slot-build-verify` | ✓ | ✓ | ✓ `--report` | ✓ | ✓ (drift) | ✓ (no IRs / no binary) | — |
| `slot-build-cert` | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ (missing IR) | — |
| `slot-cert-xml` | ✓ | ✓ | (XML out) | ✓ | ✓ (validate fail) | ✓ (missing files) | — |
| `slot-cert-xml-v2` | ✓ | ✗ | (XML out, --validate prints JSON) | ✓ | ✓ (validate fail) | ✗ | — |

**Contract gap**: no `exit 3` reserved for any tier — the audit task asks
about 0/1/2/3 but the pipeline only uses 0/1/2. Either rename the contract
to "0/1/2 only" in the operator manual, or wire `exit 3` for explicit
"infrastructure unavailable" (e.g. slot-sim binary missing) distinct from
"bad input" (exit 2). Today the binary-missing case in `verify.py` returns
2, conflated with "no input files".

---

## Cert pipeline integrity matrix

| Check | Status | Evidence |
|---|---|---|
| Manifest SHA-256 over every IR file | ✓ | `cert_package.py` lines 178-182, `_sha256_file` streaming-hash |
| ed25519 signature over canonical manifest bytes | ✓ | line 272 `_sign_with_pem(private_pem, manifest_json)`, manifest serialized with `sort_keys=True` (deterministic) |
| `verify.sh` re-validates without dependencies | ✓ | only `python3` + `openssl` required, runs both hash recompute + signature verify |
| Tamper-detection (positive test) | ✓ | `test_w5_6_cert_package::test_signature_fails_on_tamper` + `::test_verify_fails_on_tampered_ir` |
| Cert XML v1 namespace `urn:slotmath:cert:v1` | ✓ | constant at module level + `register_namespace` |
| Cert XML v2 namespace `urn:slotmath:cert:v2` | ✓ | `cert_xml_v2.py` line 66 |
| All required v1 sections (Meta/Topology/Limits/RtpReport/FeatureBreakdown/Jurisdictions/Provenance/AuditTrail) | ✓ | `validate_cert_xml` enforces |
| All required v2 sections (+ MultiJurisdiction) | ✓ | `REQUIRED_V2_TAGS` at line 243 |
| PAR-row Merkle commitment + inclusion proofs | ✓ | `cert_package.py` lines 310-355 invoke `tools.provenance.par_provenance` |
| Public key chain to a trust anchor | ✗ | ephemeral-key mode produces self-signed-only bundles (W-1) |

---

## Mathematical precision audit (per stage)

| Stage | Method | Verdict |
|---|---|---|
| Vendor IR reel weights | Pulled from `parse_par` (out of scope here) | Trust upstream |
| Universal IR conversion | Pulled from `to_slot_sim` (out of scope here) | Trust upstream |
| MC RTP comparison | `compare_drift` = `abs(stats[k] - stats[target_k])` — exact float subtraction, no accumulation, no tolerance pinning beyond CLI `--threshold` | ✓ |
| `verify.py` per-IR tolerance override | `max(threshold, per_ir)` — correctly widens never tightens | ✓ |
| `codegen_rust.py::closed_form_estimate` | Per-symbol cell-count divided by **averaged** cells-per-reel (`total_cells / n_reels`) then power-multiplied across combo length | ✗ Wrong — see C-1/C-2 |
| `cert_xml.py::_build_rtp_report` delta | `abs(float(measured) - float(target))` after isinstance checks — exact float, no tolerance | ✓ (math), ✗ (silent on None — W-7) |
| `ir_digest` (cert_xml_v2) | SHA-256 over `json.dumps(ir, sort_keys=True, separators=(",", ":"))` — canonical bytes | ✓ |
| `_sha256_file` | Streaming 1 MiB chunks, deterministic | ✓ |

**Closed-form vs MC labelling**: the cert manifest carries `rtp_target` (from IR meta, closed-form) and `rtp_measured` (from MC) as distinct keys — good. The cert XML uses `target` + `measured` attributes — also good. The **Rust codegen output** labels its number `rtp_estimate` (sim.rs line 130) — the README correctly calls it an "engine-free closed-form RTP estimator", but because the estimator is mathematically wrong (C-1/C-2), the label is misleading regardless.

**Tolerances pinned**: `CI_TIERS` constant pins three threshold tiers explicitly. `compare_drift` returns raw absolute deltas — no implicit tolerance. ✓

---

## Recommended fix order (single follow-up wave)

| Order | Fix | Effort | Impact |
|---|---|---|---|
| 1 | Replace `codegen_rust.py::closed_form_estimate` with per-reel positional probability product (C-1 + C-2). Add a numeric correctness test against a hand-computed example. | ~30 min | Unblocks pilot |
| 2 | Unify `target_rtp` / `rtp_total` field lookup into a single helper (e.g. `tools/_ir_meta.py::get_target_rtp(meta)`) used by both `cert_xml.py` and `cert_package.py` (C-3). | ~15 min | Cert consistency |
| 3 | Switch `__main__.run_mc` to JSON output from `slot-sim --json` (if available) or pin a regex with explicit failure on mismatch (C-4). | ~20 min | Defensive |
| 4 | Add try/except around `cert_xml.py::_build_rtp_report` numeric coercion (W-7). | ~5 min | Robustness |
| 5 | Document `exit 3` semantics or remove from the contract spec. | ~5 min | Contract clarity |
| 6 | Replace `subprocess.run(..., timeout=600)` with `timeout=None` and warn at start of strict-tier runs (W-8). | ~5 min | Strict-tier bug |
| 7 | Filter dot-files in `compute_par_commitments` (W-6). | ~5 min | Reproducibility |
| 8 | Add the missing test cases enumerated in "Test coverage gaps" above. | ~60 min | Long-term safety |

Total: ~2-3 hours of focused work plus a wave run + commit + pin.

---

## Verdict

**STATUS**: Conditional GREEN — pipeline architecture is solid, cert chain
is auditable, but the Rust codegen RTP estimator must be repaired before
any operator or regulator consumes its output. Fixes C-1 through C-4 are
short, mechanical, and well-covered by the existing test scaffolding once
the new assertions are added. The pipeline is otherwise ready for pilot.
