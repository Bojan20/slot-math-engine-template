/**
 * CORTI W204-PROTOCOLS — HSM (Hardware Security Module) emulation.
 *
 * Production deployments wire this to a real HSM (Thales Luna, AWS
 * CloudHSM, etc.) over PKCS#11 or KMS. For the template engine we
 * emulate the same interface using a software ed25519 keypair backed
 * by `@noble/ed25519`. The keypair is generated once on first boot
 * and persisted to `server/data/hsm-keys.json` (gitignored).
 *
 *  - signCanonical(payload: object) → { publicKey, signature, signedAt, signer }
 *  - verify(signatureHex, publicKeyHex, payload) → boolean
 *  - getPublicKeyHex() → string
 *
 * The HSM store guarantees:
 *   - Keypair is generated lazily and only once.
 *   - On subsequent boots the keypair is read from disk.
 *   - Public key is stable across restarts.
 *   - Signatures cover the *canonical* JSON of the payload (sorted keys).
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { sha512 } from '@noble/hashes/sha2.js';
import * as ed from '@noble/ed25519';
import { canonicalize } from '../lib/hashChain.js';

// Wire the sync sha512 hook so `ed.sign` / `ed.verify` work without await.
// We wrap to normalize the typed-array generic parameter so noble's
// stricter declarations accept the sha2 helper across TS versions.
(ed.hashes as { sha512: (msg: Uint8Array) => Uint8Array }).sha512 = (
  msg: Uint8Array
): Uint8Array => sha512(msg);

export interface HsmSignature {
  publicKey: string;   // hex (32 bytes / 64 chars)
  signature: string;   // hex (64 bytes / 128 chars)
  signedAt: string;    // ISO timestamp
  signer: string;      // logical signer name (e.g. "slot-math-engine-hsm")
}

export interface HsmKeypair {
  privateKeyHex: string;
  publicKeyHex: string;
  createdAt: string;
  signer: string;
}

const DEFAULT_KEY_FILE = path.resolve(process.cwd(), 'server/data/hsm-keys.json');
const SIGNER_NAME = 'slot-math-engine-hsm';

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}
function hexToBytes(h: string): Uint8Array {
  if (h.length % 2 !== 0) throw new Error('hsm: hex must have even length');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export class HsmStore {
  private kp: HsmKeypair | null = null;
  private readonly keyFile: string;

  constructor(opts: { keyFile?: string | null } = {}) {
    this.keyFile = opts.keyFile ?? DEFAULT_KEY_FILE;
  }

  /** Initialize: load keypair from disk, or generate + persist a new one. */
  async init(): Promise<HsmKeypair> {
    if (this.kp) return this.kp;
    try {
      const raw = await fs.readFile(this.keyFile, 'utf8');
      const parsed = JSON.parse(raw) as HsmKeypair;
      if (
        typeof parsed.privateKeyHex === 'string' &&
        typeof parsed.publicKeyHex === 'string' &&
        parsed.privateKeyHex.length === 64 &&
        parsed.publicKeyHex.length === 64
      ) {
        this.kp = parsed;
        return parsed;
      }
    } catch {
      // file missing or unreadable — fall through and generate
    }
    const privBytes = ed.utils.randomSecretKey();
    const pubBytes = ed.getPublicKey(privBytes);
    const kp: HsmKeypair = {
      privateKeyHex: bytesToHex(privBytes),
      publicKeyHex: bytesToHex(pubBytes),
      createdAt: new Date().toISOString(),
      signer: SIGNER_NAME,
    };
    await this.persist(kp);
    this.kp = kp;
    return kp;
  }

  private async persist(kp: HsmKeypair): Promise<void> {
    await fs.mkdir(path.dirname(this.keyFile), { recursive: true });
    await fs.writeFile(this.keyFile, JSON.stringify(kp, null, 2) + '\n', { mode: 0o600 });
  }

  /** Public key as hex (32 bytes / 64 chars). */
  getPublicKeyHex(): string {
    if (!this.kp) throw new Error('hsm: not initialized — call init() first');
    return this.kp.publicKeyHex;
  }

  /** Signer identity label embedded in every signature record. */
  getSigner(): string {
    return SIGNER_NAME;
  }

  /** Sign the canonical-JSON serialization of `payload`. */
  signCanonical(payload: unknown): HsmSignature {
    if (!this.kp) throw new Error('hsm: not initialized — call init() first');
    const json = canonicalize(payload);
    const msg = new TextEncoder().encode(json);
    const sig = ed.sign(msg, hexToBytes(this.kp.privateKeyHex));
    return {
      publicKey: this.kp.publicKeyHex,
      signature: bytesToHex(sig),
      signedAt: new Date().toISOString(),
      signer: SIGNER_NAME,
    };
  }

  /** Sign an arbitrary string (used for Merkle root, hashes, etc). */
  signString(s: string): HsmSignature {
    if (!this.kp) throw new Error('hsm: not initialized — call init() first');
    const msg = new TextEncoder().encode(s);
    const sig = ed.sign(msg, hexToBytes(this.kp.privateKeyHex));
    return {
      publicKey: this.kp.publicKeyHex,
      signature: bytesToHex(sig),
      signedAt: new Date().toISOString(),
      signer: SIGNER_NAME,
    };
  }

  /** Verify a signature against the canonical JSON of `payload`. */
  static verifyCanonical(
    signatureHex: string,
    publicKeyHex: string,
    payload: unknown
  ): boolean {
    try {
      const msg = new TextEncoder().encode(canonicalize(payload));
      return ed.verify(hexToBytes(signatureHex), msg, hexToBytes(publicKeyHex));
    } catch {
      return false;
    }
  }

  /** Verify a signature against a raw string. */
  static verifyString(
    signatureHex: string,
    publicKeyHex: string,
    s: string
  ): boolean {
    try {
      const msg = new TextEncoder().encode(s);
      return ed.verify(hexToBytes(signatureHex), msg, hexToBytes(publicKeyHex));
    } catch {
      return false;
    }
  }

  /** Test-only: clear in-memory state and remove the persisted file. */
  async reset(): Promise<void> {
    this.kp = null;
    try { await fs.unlink(this.keyFile); } catch { /* ignore */ }
  }
}
