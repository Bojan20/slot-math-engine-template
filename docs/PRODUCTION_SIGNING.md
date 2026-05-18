# Production Signing Chain (W213 Faza 700.1)

Three-level Ed25519 signing tree for pitch tarball MANIFEST.json,
upgrading the W212 "single HSM key" model to a real production-shaped
chain of custody.

## The chain

```
root          (offline, simulated by dist/pitch/keys/root.json)
  │ signs intermediate.publicKey
  ▼
intermediate  (dist/pitch/keys/intermediate.json)
  │ signs leaf.publicKey
  ▼
leaf          (dist/pitch/keys/leaf.json)
  │ signs sha256(MANIFEST.json canonical bytes)
  ▼
MANIFEST.json
  ╲
   ╲ leaf also signs an RFC-3161-style timestamp record
    ╲
     ▼
   timestampAuthority { tsa, ts, digest, payload, signature }
```

All signatures use Ed25519 (`@noble/ed25519` + sha-512). All public keys
are 32-byte / 64-hex. All signatures are 64-byte / 128-hex.

## Roles & lifecycle

| Key           | Lifetime    | Storage             | Rotation  |
|---------------|-------------|---------------------|-----------|
| root          | 5 years     | offline HSM only    | manual    |
| intermediate  | 1 year      | online HSM          | scheduled |
| leaf          | 90 days     | online signer       | automated |
| TSA           | tied to leaf | inline payload     | inherits  |

The **root key never appears online**. In this template we simulate it
with a file `dist/pitch/keys/root.json`; in production the root key
material lives on an air-gapped HSM, and only its public key is shipped
inside the chain envelope.

## Generating a new chain

```sh
npm run pitch:gen-keys -- --dir=dist/pitch/keys
```

Output:

```
production-sign: chain generated at /…/dist/pitch/keys
  root:         root-1f2a3b4c <pub>
  intermediate: intermediate-aabbccdd <pub>
  leaf:         leaf-99887766 <pub>
```

## Signing a MANIFEST

```js
import { loadChain, buildProductionSignature } from 'scripts/pitch/production-sign.mjs';

const chain = await loadChain();
const envelope = await buildProductionSignature({
  chain,
  manifestBytes: Buffer.from(JSON.stringify(manifest, null, 2)),
  generatedAt: new Date().toISOString(),
});
```

The envelope shape:

```json
{
  "schema": "pitch-production-sign-v1",
  "algorithm": "ed25519",
  "digestAlgorithm": "sha256",
  "manifestDigest": "<hex>",
  "signedAt": "ISO-8601",
  "leaf":         { "publicKey": "<hex>", "signature": "<hex>", "keyId": "leaf-xxxx" },
  "intermediate": { "publicKey": "<hex>", "signatureOverLeafPubKey": "<hex>", "keyId": "intermediate-xxxx" },
  "root":         { "publicKey": "<hex>", "signatureOverIntermediatePubKey": "<hex>", "keyId": "root-xxxx" },
  "timestampAuthority": { "tsa": "…", "timestampedAt": "…", "messageDigest": "<hex>", "payload": "…", "signature": "<hex>" }
}
```

## Verification

```sh
npm run pitch:verify-prod-sign -- dist/pitch/envelope.json dist/pitch/manifest.json
```

Programmatic:

```js
import { verifyProductionSignature } from 'scripts/pitch/verify-production-sign.mjs';

const { ok, errors, checks } = await verifyProductionSignature({
  envelope,
  manifestBytes,
  trustedRootPubKey: '<pinned hex>', // optional but recommended
});
```

The verifier runs six independent checks:

1. **root-trust-anchor-present** — the envelope's root public key
   matches the operator's pinned trust anchor.
2. **root-signs-intermediate** — `root.signatureOverIntermediatePubKey`
   is a valid Ed25519 signature by `root.publicKey` over
   `intermediate.publicKey`.
3. **intermediate-signs-leaf** — `intermediate.signatureOverLeafPubKey`
   is a valid signature by `intermediate.publicKey` over
   `leaf.publicKey`.
4. **leaf-signs-manifest-digest** — `leaf.signature` is a valid
   signature by `leaf.publicKey` over `manifestDigest`.
5. **leaf-signs-timestamp-payload** — `timestampAuthority.signature`
   is a valid signature by `leaf.publicKey` over
   `timestampAuthority.payload`.
6. **manifest-digest-matches** — `sha256(manifestBytes)` equals
   `manifestDigest` in the envelope (only checked when the caller
   passes `manifestBytes`).

Any single failure produces `ok: false`. The test suite
(`scripts/tests/production-sign.test.mjs`) exercises every tamper-
detection path (manifest, leaf sig, intermediate sig, trust anchor).

## Recovery from key compromise

| Compromised key  | Action                                                              |
|------------------|---------------------------------------------------------------------|
| leaf             | Generate new leaf, re-sign current MANIFEST, rotate within 24 h.    |
| intermediate     | Generate new intermediate + leaf, root re-signs new intermediate,   |
|                  | revoke old intermediate in CRL.                                     |
| root             | "Catastrophic" — generate new offline root, re-deploy pinned trust  |
|                  | anchor to every operator that received a bundle, re-sign full chain.|

The chain stored on disk under `dist/pitch/keys/` is what test code
exercises. Production deployments swap `loadChain()` for a PKCS#11 or
KMS-backed loader without changing the verifier semantics.
