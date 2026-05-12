# Spin Recall & Replay — Specification

**Status:** Faza 8.5 — Spin recall & replay
**Scope:** Append-only, hash-chained spin journal that lets a regulator
say "rebuild me spin number 4,217,332 from session `s_abc123` from
2024-Q3" and we hand them a bit-identical replay plus a tamper-evident
proof the entry has not been touched since it was written.

This document is normative — any change to the on-disk format or hash
chain semantics is a **breaking** change and requires a `schema_version`
bump.

---

## Why one canonical journal

GLI-19 §3.4 ("Random Number Generator Verification"), UKGC RTS 14 ("Game
information requirements"), MGA Directive 3-2018 §39 all require:

1. **Long-term retention** — typically 5 years rolling, accessible to the
   regulator on demand.
2. **Atomic spin record** — what bet was placed, what RNG state, what
   features triggered, what win paid, when, for whom (or
   pseudonymously).
3. **Determinism / replayability** — given the record, the engine must
   reproduce the same outcome bit-for-bit.
4. **Tamper-evident** — the operator must not be able to silently
   rewrite history (e.g. "edit out" a payout dispute).

The engine handles all four with a single append-only NDJSON file plus a
sidecar **manifest** that pins the last hash of the chain. Anyone who
holds the manifest can verify the journal has not been edited.

---

## File format

### 1. Spin journal — `journal.ndjson`

Newline-delimited JSON, append-only. Each line is one
`SpinJournalEntry` — see schema below.

```
{"schema_version":"1.0.0","seq":0,"session_id":"s_abc","spin_index":0,...,"prev_hash":"0000...","entry_hash":"a3f1..."}
{"schema_version":"1.0.0","seq":1,"session_id":"s_abc","spin_index":1,...,"prev_hash":"a3f1...","entry_hash":"7b2c..."}
...
```

- **One JSON object per line.** No trailing whitespace. UTF-8.
- **`seq`** is the global monotonic counter inside this journal file
  (not a session-scoped counter — sessions interleave).
- **`prev_hash`** = `entry_hash` of the line above. The first line has
  `prev_hash = "00…00"` (64 zero hex chars).
- **`entry_hash`** = `sha256_hex(canonical_json(payload_without_entry_hash))`.
  Canonical JSON = sorted keys + no whitespace. This pins the entire
  payload AND the chain link.

### 2. Manifest — `manifest.json`

```jsonc
{
  "schema_version": "1.0.0",
  "engine_version": "0.5.0",
  "journal_file": "journal.ndjson",
  "first_seq": 0,
  "last_seq": 4321789,
  "first_timestamp_utc": "2024-07-01T00:00:01Z",
  "last_timestamp_utc": "2024-09-30T23:59:58Z",
  "last_entry_hash": "9af3e2c1...",     // pinning final state
  "manifest_hash": "1bd4..."             // sha256 of this object minus manifest_hash
}
```

The manifest is rewritten atomically at chosen checkpoints (every N
spins, every session close, every hour — operator policy). Regulators
hold these manifests; if even one entry in the journal is altered, the
manifest stops matching.

---

## `SpinJournalEntry` schema

```jsonc
{
  // Chain bookkeeping
  "schema_version": "1.0.0",
  "seq": 0,                              // monotonic in this journal file
  "prev_hash": "0000…",                   // 64 hex chars
  "entry_hash": "a3f1…",                  // 64 hex chars (computed last)

  // Identity
  "session_id": "s_abc123",
  "player_pseudonym": "p_anon_42a",       // operator-side hash, never PII
  "spin_index": 17,                       // within the session

  // Time
  "timestamp_utc": "2024-07-15T12:34:56.789Z",

  // Config provenance
  "config_hash": "9af3e2c1…",             // sha256 of the canonical IR
  "engine_version": "0.5.0",
  "engine_build": "g833c040",             // git short sha

  // RNG state — required for byte-identical replay
  "rng_kind": "pcg64",
  "rng_seed_hex": "12345678abcdef00",     // initial seed at session start
  "rng_step": 4218,                       // 0-based stream offset before spin

  // Bet input
  "bet_total_mc": 1000,                   // millicredits (avoid f64 drift)
  "bet_currency": "EUR",
  "bet_meta": {
    "ante": false,
    "buy_feature": null                   // e.g. "buy_fs"
  },

  // Feature state entering the spin (FS counter, H&W respins remaining…)
  "pre_state": {
    "in_free_spins": false,
    "fs_remaining": 0,
    "fs_global_multiplier": 1,
    "in_hold_and_win": false,
    "hnw_respins_remaining": 0,
    "jackpot_pools_mc": { "MINI": 50000, "GRAND": 1234567 }
  },

  // Result — sufficient for audit without holding full PCM
  "result": {
    "total_win_mc": 12500,
    "line_wins_count": 3,
    "scatter_count": 0,
    "bonus_count": 0,
    "triggered_features": [],
    "feature_trace_hash": "7b2c…"          // sha256 of the structured trace
  },

  // Compliance flags surfaced by the validator (not regulator-defined)
  "compliance": {
    "win_cap_applied": false,
    "near_miss_flagged": false
  }
}
```

### Field rules

- **`bet_total_mc`** + **`result.total_win_mc`** are integers in
  millicredits. The engine never serializes f64 — IEEE-754
  representation drift would break byte-identical replay across
  platforms.
- **`feature_trace_hash`** lets a deep audit ask the engine to
  re-emit the full structured trace and compare. The engine MAY keep
  the full trace inline as `feature_trace` but the hash is mandatory
  so summary-only journals still let an auditor request the trace
  later.
- **`compliance`** is engine-derived — never operator-supplied. Editing
  these fields after the fact is a chain-break.

---

## Hash chain semantics

```
H_0 = "00" * 32                                       // genesis
H_i = sha256_hex(canonical_json(entry_i \ entry_hash))
prev_hash_i = H_{i-1}
entry_hash_i = H_i
```

Canonical JSON =
- All keys sorted lexicographically at every level.
- No whitespace, no trailing newline inside the value.
- UTF-8, no BOM.
- Numbers serialized via `Number.toString()` semantics — finite numbers
  only, no `NaN` / `Infinity`. The engine refuses to write a non-finite
  value into the journal.

Verification = recompute `H_i` for every line; compare to stored
`entry_hash_i`; compare consecutive `prev_hash` against the previous
line's `entry_hash`. Any mismatch ⇒ journal is tampered or truncated.

---

## Replay procedure

Inputs: a `SpinJournalEntry`, the original `SlotGameIR` (or any IR with
matching `config_hash`).

1. **Verify `config_hash`** — refuse to replay against a different IR.
2. **Verify `engine_version` compatibility** — same major.minor; replay
   across breaking versions is explicit opt-in.
3. **Construct RNG** from `rng_kind` + `rng_seed_hex`, then **advance
   by `rng_step`** (`Skip` / `Jump` function from FAZA 7).
4. **Construct engine state** from `pre_state`.
5. **Drive the spin** with the engine's normal evaluation path.
6. **Compare**: produced `total_win_mc`, counts, `feature_trace_hash`
   ⇔ journal entry. Mismatch = bug (file an incident).

The implementation in `src/recall/replay.ts` and
`rust-sim/src/recall/replay.rs` returns a `ReplayResult` enum:

```ts
type ReplayResult =
  | { ok: true; entry: SpinJournalEntry; verified_at_utc: string }
  | { ok: false; reason: 'config_hash_mismatch' | 'version_mismatch'
                       | 'result_mismatch' | 'chain_break'
                       | 'invalid_entry' | 'engine_error';
      detail: string };
```

---

## Retention policy

The library does not enforce retention — that's an operator decision
keyed to jurisdiction (UKGC = 5y, MGA = 5y, ADM = 10y, NJ DGE = 7y).
What the library guarantees:

- **Append-only**: nothing in `journal.ndjson` is rewritten.
- **Rotation**: when the file crosses `rotation_max_bytes`, the writer
  closes it, atomically renames to `journal-<UTC>.ndjson`, opens a new
  one whose first line's `prev_hash` = last hash of the rotated file.
- **Manifest** is updated on rotate so retention indexers can walk
  the manifest chain instead of every NDJSON line.
- **Sealing**: a "seal" CLI converts an old `journal-*.ndjson` to a
  compressed `.ndjson.zst` + a signed manifest, optionally with an
  HSM signature (Faza 7.5). The signed seal cannot be regenerated
  without the key, so altering the seal is detectable.

---

## Backward compatibility

`schema_version` is semver:

- **Patch bump** = wording fix in this spec.
- **Minor bump** = additive (new optional fields). Old replayers
  ignore unknown keys.
- **Major bump** = breaking (any rename, any required-field addition,
  any hash chain semantic change). Major bumps require a migration
  tool that re-anchors the chain from the old genesis.

The engine refuses to APPEND to a journal whose `schema_version`'s
major differs from its own. The engine accepts REPLAY of any
`schema_version` whose major it supports.
