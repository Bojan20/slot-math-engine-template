# Wrath of Olympus — v12.1.0

**Regulator paper trail** — every artefact in this directory is hash-linked
back to the canonical PAR sheet via a Merkle attestation chain.

## Build identity

| Field | Value |
|---|---|
| Game ID | `wrath-of-olympus` |
| Variant ID | `v12.1.0` |
| Built at (UTC) | `2026-05-31T02:55:00Z` |
| PAR Merkle root | `9a000a38911a4995da617b01d9e6ff8a4349d671d3ccb84443b7df012901a15b` |
| IR SHA-256 | `iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii` |
| MC attestation | `7e443c547c50ba04473d836fccf2951172c5f0c31ca243cabef95f82bb624361` |
| Web bundle | `e8f71d9ec92a1e1453566914e837067762cf5a52e7e6c1206805e4509972d206` |
| RGS bundle | `fa1af488725952998a977438d762e7bd5f9ed5c68dc51ce8a0d2325e212d59c4` |
| **Deploy root** | `c7040d434e64047af983b2035ad889d4de104c00116561b8c2a20645d91e2f98` |
| **Deploy signature** | `3b4ff8f5c3985aae51d92cf0a071ed29d5c9b281a18692da9d8b3166f90c250c` |
| Jurisdiction | `MGA` |

## Verification (regulator)

```bash
# Re-derive every link in the chain:
slot-math attest verify games/wrath-of-olympus/v12.1.0/

# Independently re-run MC convergence at T3 (regulator default):
slot-math mc-sweep games/wrath-of-olympus/v12.1.0/ --tier T3
```

If both commands exit 0, the deployed bundle math is provably identical
to the locked PAR sheet, end-to-end.

## Layout

| Path | Purpose |
|---|---|
| `web/` | Static playable bundle (CDN-ready) |
| `server/` | Fastify RGS backend (Docker-ready) |
| `attestation/` | Merkle chain + signature |
| `build.manifest.json` | Machine-readable summary |

## Math determinism

Engine math is byte-identical to the PAR sheet RTP targets within the
MC tier tolerances (Wilson CI 99.9% at T3). See `attestation/mc_sweep.merkle`
for proof.
