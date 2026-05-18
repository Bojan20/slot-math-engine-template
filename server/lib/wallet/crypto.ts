/**
 * W210 Faza 600.0 — AES-256-GCM at-rest encryption for tenant wallet
 * provider credentials.
 *
 * Format of the encrypted blob (returned as a Buffer for Postgres BYTEA
 * or as base64 for the in-memory store):
 *
 *   [ 1 byte  version (=1) ]
 *   [ 12 bytes IV          ]
 *   [ 16 bytes auth tag    ]
 *   [ N bytes ciphertext   ]
 *
 * The key comes from `WALLET_CONFIG_KEY` (32 raw bytes, hex-encoded).
 * In tests / dev a deterministic fallback key is used so unit specs
 * don't need to set the env. Production must override.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

const DEV_FALLBACK_KEY_HEX =
  'a3f1c9d0e2b78f0612345678abcdef0011223344556677889900aabbccddeeff';

function loadKey(): Buffer {
  const env = process.env.WALLET_CONFIG_KEY;
  if (env) {
    const buf = Buffer.from(env, 'hex');
    if (buf.length !== KEY_LEN) {
      throw new Error(
        `WALLET_CONFIG_KEY must be ${KEY_LEN * 2} hex chars (got ${env.length})`
      );
    }
    return buf;
  }
  // Tests + dev: stable fallback. Production code MUST set env.
  return Buffer.from(DEV_FALLBACK_KEY_HEX, 'hex');
}

export function encryptConfig(plain: Record<string, unknown>): Buffer {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const json = Buffer.from(JSON.stringify(plain), 'utf8');
  const ct = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ct]);
}

export function decryptConfig<T = Record<string, unknown>>(blob: Buffer): T {
  if (blob.length < 1 + IV_LEN + TAG_LEN + 1) {
    throw new Error('wallet_config_blob_too_short');
  }
  const version = blob[0];
  if (version !== VERSION) {
    throw new Error(`wallet_config_unsupported_version: ${version}`);
  }
  const iv = blob.subarray(1, 1 + IV_LEN);
  const tag = blob.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const ct = blob.subarray(1 + IV_LEN + TAG_LEN);
  const key = loadKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8')) as T;
}

/** Convenience for tests / in-memory store that prefer base64 strings. */
export function encryptConfigBase64(plain: Record<string, unknown>): string {
  return encryptConfig(plain).toString('base64');
}

export function decryptConfigBase64<T = Record<string, unknown>>(b64: string): T {
  return decryptConfig<T>(Buffer.from(b64, 'base64'));
}
