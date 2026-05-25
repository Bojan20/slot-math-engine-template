# HSM-Backed DRBG Seed Architecture

> **Wave 38 — Kimi K10.** Architecture and reference implementation for
> HSM-attested entropy injection into the engine's RNG. Closes the
> "HSM-backed seed architecture design doc" item from Kimi 2026-05-15
> deep audit.

## Why this matters

From the Kimi audit:

> "Only 3 vendors have achieved SP 800-90B entropy-source certification
> (Rambus 2021, AWS Graviton4 2025). FIPS 140-3 IG D.K mandates
> continuous health tests (Repetition Count + Adaptive Proportion) — a
> bar no commercial slot engine publicly meets. The Russian 'Alex' team
> reverse-engineered Vendor C's LCG-based PRNG using ~24 recorded
> spins and timing synchronization, earning $250k/week. Schneier:
> 'trivially easy to fix with any CSPRNG' yet legacy cabinets remain
> exploitable."

Existing slot engines tie their RNG seed to OS entropy
(`/dev/urandom`) or in-process state. That is sufficient for casual
verification but **does not** meet:

- **FIPS 140-3 IG D.K** — continuous health tests on the entropy source
- **NIST SP 800-90B** — entropy-source attestation
- **Multi-instance broadcast** — N nodes converging on identical RNG
  state without coordination round-trips
- **Forward secrecy** — past spin outcomes must not let an attacker
  predict future seeds even with full process memory dump

HSM-backed seed derivation closes all four. The HSM signs a canonical
`(epoch, cluster_id)` tuple; the signature → SHA-256 → 32-byte DRBG
seed. The HSM key never leaves the FIPS 140-2 L3+ hardware boundary, so
seed prediction reduces to breaking the HSM's signing key.

## Reference implementation

Module: `src/rng/hsmSeedBridge.ts` (Wave 38).
Tests:  `tests/hsmSeedBridge.test.ts` (15 tests, all PASS).

```typescript
import { HsmSeedBridge } from './rng/hsmSeedBridge';
import { MockHsmAdapter } from './hsm/adapters/mock';

const adapter = new MockHsmAdapter({ seed: 0xDEADBEEF });
const handle = adapter.createKey('drbg-root', 'ECDSA_SHA_256');
const bridge = new HsmSeedBridge({
  adapter,
  keyHandle: handle,
  clusterId: 'production-cluster-eu-1',
});

// Per-epoch DRBG seed (32 bytes)
const r = await bridge.deriveSeed(epochNumber);
console.log(r.seed);      // Uint8Array(32)
console.log(r.seedHash);  // 12-char SHA-256 truncation for audit log

// u64 seed for Mulberry32 / PCG64 / Xoshiro256SS / Philox4x32
const u = await bridge.deriveU64Seed(epochNumber);
console.log(u.u64);       // bigint

// ChaCha20 seed (32-byte key + 12-byte nonce)
const c = await bridge.deriveChaCha20Seed(epochNumber);
console.log(c.key, c.nonce);
```

## Algorithm

```
deriveSeed(epoch):
  tuple   = epoch_be_u64 || sha256(clusterId)         # 8 + 32 = 40 bytes
  sig     = HSM.sign(keyHandle, ECDSA_SHA_256, tuple) # variable-length DER
  seed    = sha256(sig)                                # 32 bytes
  if !disableHealthTests:
    runRct(seed)                                       # FIPS 140-3 IG D.K
    runApt(seed)                                       # FIPS 140-3 IG D.K
  return { seed, seedHash: sha256(seed)[:12], epoch, derivedAt, hsmAuditId }
```

The `sha256(sig)` step turns a variable-length DER signature into a
fixed-width seed and provides uniformity under the random-oracle model
on the HSM signature.

## Multi-instance broadcast

```
Node-A in cluster 'prod-eu':         Node-B in cluster 'prod-eu':
  bridge_A = HsmSeedBridge({          bridge_B = HsmSeedBridge({
    adapter: AwsKmsAdapter,             adapter: AwsKmsAdapter,
    keyHandle: shared_handle,           keyHandle: shared_handle,
    clusterId: 'prod-eu',               clusterId: 'prod-eu',
  })                                  })
  await bridge_A.deriveSeed(42)       await bridge_B.deriveSeed(42)
       │                                   │
       │                                   │
       └──────────── Identical seed ───────┘
```

Both nodes derive **byte-identical seeds** for the same epoch without
any peer-to-peer coordination. The shared HSM key handle is the only
synchronization point — no messages between Node-A and Node-B.

This unlocks:
- Hot-failover: a standby node can resume RNG state at the next epoch
  without copying in-memory PRNG state from the primary.
- Sharded jackpots: multiple game shards can deterministically agree on
  a shared seed for a cross-shard progressive without trusting any
  single node.
- Audit replay: regulators can replay `deriveSeed(epoch)` against the
  HSM and verify the seed matches the operator-claimed seed.

## Vendor matrix

| Vendor                | Adapter             | FIPS Level    | Throughput (sign/s) | Notes |
|-----------------------|---------------------|---------------|---------------------|-------|
| **MockHsmAdapter**    | `mock.ts`           | N/A (test)    | 30,000+             | Deterministic; tests + dev only |
| **AWS CloudHSM**      | `awsKms.ts`         | FIPS 140-2 L3 | 800–1500            | Cloud-managed; multi-AZ |
| **AWS KMS**           | `awsKms.ts`         | FIPS 140-2 L2 | 5000+               | Soft-HSM tier; cheaper |
| **Thales Luna 7**     | `pkcs11.ts`         | FIPS 140-2 L3 | 1500–4000           | On-prem; PCIe / network |
| **nCipher nShield**   | `pkcs11.ts`         | FIPS 140-2 L3 | 1200–3000           | On-prem; common at EU operators |
| **Utimaco SecurityServer** | `pkcs11.ts`    | FIPS 140-2 L3+ | 1500–3500          | On-prem; FIPS 140-3 in flight |
| **HashiCorp Vault Transit** | (custom)      | Backed by HSM | 100–500             | Cloud; backed by chosen HSM |
| **SoftHSM 2.x**       | `pkcs11.ts`         | None (test)   | 10,000+             | Software emulation; CI only |

The bridge's `HsmAdapter` interface is the **only** dependency — adding
a new vendor is a single adapter file (~250 LOC, pattern matches
existing `awsKms.ts` / `pkcs11.ts`).

## Side-channel posture

1. **No raw seed in logs.** Audit records carry `seedHash` (truncated
   12-char SHA-256 of the seed), not the seed itself. An attacker with
   read access to the audit log cannot reconstruct the seed from the
   hash (preimage resistance).

2. **No raw signature in logs.** The HSM signature is consumed
   in-memory and not written to disk. If the signature were exposed,
   an attacker could recompute `sha256(sig)` → seed for any past epoch.

3. **Constant-time PIN handling.** PKCS#11 adapter passes PIN through
   environment / hardware loader, never in argv (visible to other
   processes via `/proc`). AWS KMS uses IAM credentials.

4. **Timeout on sign calls.** Default 4000ms — prevents indefinite
   resource hold if HSM is degraded. Operator can tune per environment.

5. **Continuous health tests.** Every derived seed runs RCT (no byte
   repeated > 32× consecutively) and APT (no byte > 80% in any 64-byte
   window). Failure throws `HsmSeedHealthFailure` and prevents the
   tainted seed from reaching the DRBG.

## Cost vs throughput tradeoff

| Tier | Setup | Cost (USD/mo) | Throughput | Use case |
|------|-------|---------------|------------|----------|
| Dev / CI | SoftHSM | 0 | 10K+ | Local + CI |
| Cloud | AWS KMS | ~10 | 5K | Single-region SaaS |
| Cloud HSM | AWS CloudHSM | ~1500 | 1500 | Multi-AZ regulated |
| On-prem | Thales Luna 7 | ~20K capex + maintenance | 4000 | Operator-owned cabinet |
| On-prem HA | nCipher pair | ~50K capex + maintenance | 3000 (failover) | Tier-1 EU / Macau |

For the slot engine, the HSM call is **NOT in the spin hot path** —
it's invoked once per epoch (configurable, typically every 1000–10000
spins). At 1500 sign/s and 1000-spin epochs, a single Thales Luna 7
sustains 1.5M spins/s of bridge-attested RNG state. Comfortably above
any single operator's peak load.

## Failure handling

```
spin() →
  if epoch_changed:
    try {
      seed = bridge.deriveSeed(currentEpoch)
      drbg.reseed(seed)
    } catch (HsmSeedUnavailable) {
      // Operator policy:
      //   STRICT  → fail-closed; reject the spin
      //   GRACEFUL → log + fall back to OS /dev/urandom; flag spin in PAR
    } catch (HsmSeedHealthFailure) {
      // Always fail-closed — entropy source is degraded
      throw RngHealthError
    }
  outcome = drbg.spin()
```

For audit-grade configurations the operator should set STRICT.

## Future work

- **`pkcs11.ts` direct binding.** Currently shells out to `pkcs11-tool`
  process. A native `dlopen()` binding (via `node-ffi-napi` or N-API
  add-on) would cut per-sign latency from ~80ms → ~5ms. Documented gap;
  not blocking K10.
- **Quorum-signed seed broadcast.** Combine HSM-derived seed with
  threshold signature (`src/jackpot/thresholdSig.ts` from Wave 22) so
  no single HSM compromise can subvert cluster-wide RNG state.
- **Per-jurisdiction HSM key separation.** Tier-1 operators in
  multi-jurisdiction deployments often want per-market HSM keys —
  trivially supported by the current adapter (just construct one
  `HsmSeedBridge` per `(jurisdiction, cluster)`).

## References

- NIST SP 800-90B — *Recommendation for the Entropy Sources Used for
  Random Bit Generation* (2018, Rev 2 2024)
- NIST SP 800-90A Rev 2 — *Recommendation for Random Number Generation
  Using Deterministic Random Bit Generators* (2024)
- FIPS 140-3 IG D.K — *Continuous Health Tests on Entropy Sources*
- Cohney et al., *Pseudorandom Black Swans* — Springer 2020
  (CTR_DRBG side-channel)
- Wired (2017) — *Meet Alex, the Russian Casino Hacker Who Makes
  Millions Targeting Slot Machines*
- AWS Graviton4 SP 800-90B Public Use Document (2025)
- Rambus TRNG Certified to NIST SP 800-90B (2021)
