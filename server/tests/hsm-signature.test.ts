/**
 * CORTI W204-PROTOCOLS — HSM ed25519 signature tests (@noble/ed25519).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { HsmStore } from '../state/hsm.js';
import { buildTestApp } from './helpers.js';
import type { FastifyInstance } from 'fastify';

const SAMPLE_IR = {
  meta: { id: 'hsm-test', version: '1.0.0' },
  game: { id: 'hsm-test', topology: 'rectangular' },
};

async function tmpKeyFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hsm-test-'));
  return path.join(dir, 'hsm-keys.json');
}

describe('HSM ed25519 signature', () => {
  it('generates a keypair lazily on init', async () => {
    const file = await tmpKeyFile();
    const hsm = new HsmStore({ keyFile: file });
    const kp = await hsm.init();
    expect(kp.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(kp.signer).toBe('slot-math-engine-hsm');
  });

  it('persists the keypair to disk so it survives restarts', async () => {
    const file = await tmpKeyFile();
    const h1 = new HsmStore({ keyFile: file });
    const k1 = await h1.init();
    const h2 = new HsmStore({ keyFile: file });
    const k2 = await h2.init();
    expect(k2.publicKeyHex).toBe(k1.publicKeyHex);
    expect(k2.privateKeyHex).toBe(k1.privateKeyHex);
  });

  it('sign + verify roundtrip on canonical JSON payload', async () => {
    const file = await tmpKeyFile();
    const hsm = new HsmStore({ keyFile: file });
    await hsm.init();
    const payload = { gameId: 'x', jurisdiction: 'UKGC', rtp: 0.955 };
    const sig = hsm.signCanonical(payload);
    expect(sig.signature).toMatch(/^[0-9a-f]{128}$/);
    const ok = HsmStore.verifyCanonical(sig.signature, sig.publicKey, payload);
    expect(ok).toBe(true);
  });

  it('verify returns false when the payload is tampered', async () => {
    const file = await tmpKeyFile();
    const hsm = new HsmStore({ keyFile: file });
    await hsm.init();
    const payload = { gameId: 'a', rtp: 0.96 };
    const sig = hsm.signCanonical(payload);
    const tampered = { gameId: 'a', rtp: 0.97 };
    expect(HsmStore.verifyCanonical(sig.signature, sig.publicKey, tampered)).toBe(false);
  });

  it('verify returns false on bad signature hex', async () => {
    const file = await tmpKeyFile();
    const hsm = new HsmStore({ keyFile: file });
    await hsm.init();
    const payload = { x: 1 };
    const sig = hsm.signCanonical(payload);
    expect(HsmStore.verifyCanonical('00'.repeat(64), sig.publicKey, payload)).toBe(false);
  });

  it('signString is independent of canonicalize order', async () => {
    const file = await tmpKeyFile();
    const hsm = new HsmStore({ keyFile: file });
    await hsm.init();
    const sig = hsm.signString('hello-world');
    expect(HsmStore.verifyString(sig.signature, sig.publicKey, 'hello-world')).toBe(true);
    expect(HsmStore.verifyString(sig.signature, sig.publicKey, 'hello-world!')).toBe(false);
  });

  it('canonicalize: same payload with different key order yields same signature verification', async () => {
    const file = await tmpKeyFile();
    const hsm = new HsmStore({ keyFile: file });
    await hsm.init();
    const sig = hsm.signCanonical({ a: 1, b: 2 });
    expect(HsmStore.verifyCanonical(sig.signature, sig.publicKey, { b: 2, a: 1 })).toBe(true);
  });

  it('reports stable publicKeyHex via getPublicKeyHex()', async () => {
    const file = await tmpKeyFile();
    const hsm = new HsmStore({ keyFile: file });
    const kp = await hsm.init();
    expect(hsm.getPublicKeyHex()).toBe(kp.publicKeyHex);
  });

  it('getPublicKeyHex throws if init() was not called', () => {
    const hsm = new HsmStore({ keyFile: '/nonexistent-never/path.json' });
    expect(() => hsm.getPublicKeyHex()).toThrow();
  });

  describe('via HTTP /api/cert/:id/verify-signature', () => {
    let app: FastifyInstance;
    beforeEach(async () => {
      app = await buildTestApp();
    });
    afterEach(async () => {
      await app.close();
    });

    it('returns { valid: true } for a freshly signed submission', async () => {
      const submit = await app.inject({
        method: 'POST',
        url: '/api/cert/submit',
        payload: { ir: SAMPLE_IR, jurisdiction: 'UKGC' },
      });
      const { submissionId } = submit.json();
      const res = await app.inject({
        method: 'GET',
        url: `/api/cert/${submissionId}/verify-signature`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.valid).toBe(true);
      expect(body.signer).toBe('slot-math-engine-hsm');
      expect(body.publicKey).toMatch(/^[0-9a-f]{64}$/);
      expect(body.parSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns 404 when submissionId is unknown', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/cert/cert-bogus/verify-signature`,
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
