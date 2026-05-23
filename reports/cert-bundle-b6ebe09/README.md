# RNG Certification Bundle — W152 P0-4

* **Git SHA**: `b6ebe090ea073f46816c415b389149995cac8380`
* **Generated**: 2026-05-23T10:04:27Z
* **Bytes per backend**: 12582912
* **Backends**: mulberry32, pcg64, xoshiro256ss, philox4x32, **chacha20** (CSPRNG)

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Per-backend metadata: seed, byte count, sha256, throughput, hardware |
| `manifest.sha256` | Tamper-evident digest of `manifest.json` |
| `hardware.json` | Host OS / arch / CPU / rustc version |
| `*-12582912-byte dumps` | Raw entropy streams (one per backend) |
| `source-b6ebe09.tar.gz` | Full repo snapshot at HEAD (sha256: `ee916d00cf83e0ae4124efb4f7d741a61c5c87c875e7afa8bf1a8a6a4953c957`) |

## How the lab consumes this

```bash
# 1. Verify the manifest hasn't been tampered with.
shasum -a 256 -c manifest.sha256

# 2. Spot-check each backend's bytes.
shasum -a 256 pcg64-*.bin
# Compare against the value in manifest.json[].sha256

# 3. Run BigCrush / PractRand / NIST STS on each .bin
RNG_test stdin64 < pcg64-12MiB.bin           # PractRand
testu01 BigCrush pcg64-12MiB.bin             # TestU01 (custom wrapper)
assess 1000000 < pcg64-12MiB.bin             # NIST STS

# 4. Verify deterministic replay from source.
tar xzf source-b6ebe09.tar.gz
cd slot-math-b6ebe09
cargo run --release --bin rng_submission -- --out replica --bytes-per 12582912
diff <(sha256sum replica/*.bin) <(sha256sum ../*.bin)  # must match
```

## Jurisdiction mapping

| Backend | UK | MGA | ADM | AGCO | PGCB | NJ DGE |
|---|---|---|---|---|---|---|
| `chacha20` | ✅ primary (RTS 7) | ✅ primary (Art. 11) | ✅ secondary | ✅ | ✅ | ✅ |
| `pcg64` | ⚠️ non-crypto | ⚠️ non-crypto | ✅ | ⚠️ | ✅ | ✅ |
| `xoshiro256ss` | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ |
| `philox4x32` | ⚠️ | ⚠️ | ✅ GPU only | ⚠️ | ✅ | ✅ |
| `mulberry32` | ❌ legacy | ❌ legacy | ❌ | ❌ | ❌ | ❌ |

`chacha20` MUST be used when the jurisdiction profile demands a CSPRNG
(see `rust-sim/src/jurisdiction/profiles.rs` for the canonical list).

## Re-run / verify locally

```bash
git checkout b6ebe090ea073f46816c415b389149995cac8380
scripts/cert-bundle.sh --bytes-per 12582912 --out /tmp/replica
diff -r /tmp/replica /Users/vanvinklstudio/Projects/slot-math-engine-template/reports/cert-bundle-b6ebe09  # only README + tarball name differ (timestamps)
```
