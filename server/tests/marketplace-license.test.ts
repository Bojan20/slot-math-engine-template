/**
 * CORTI W209 Faza 500.0 — license JWT issuance + HSM signing tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { HsmStore } from '../state/hsm.js';
import {
  issueLicenseJwt,
  verifyLicenseJwt,
  type MarketplaceLicenseClaims,
} from '../lib/marketplace-auth.js';

describe('marketplace license JWT', () => {
  let hsm: HsmStore;
  let keyFile: string;
  beforeEach(async () => {
    keyFile = path.resolve(
      process.cwd(),
      `server/data/hsm-lic-${Date.now()}-${Math.random()}.json`
    );
    hsm = new HsmStore({ keyFile });
    await hsm.init();
  });
  afterEach(async () => {
    await hsm.reset();
  });

  it('issueLicenseJwt returns a 3-part dotted token', () => {
    const jwt = issueLicenseJwt(hsm, {
      tenantId: 'op-1',
      itemId: 'k1',
      itemType: 'kernel',
      purchaseId: 'p1',
    });
    const parts = jwt.split('.');
    expect(parts.length).toBe(3);
  });

  it('payload decodes to expected claims', () => {
    const jwt = issueLicenseJwt(hsm, {
      tenantId: 'op-7',
      itemId: 'k7',
      itemType: 'kernel',
      purchaseId: 'p7',
      licenseType: 'subscription',
      ttlSeconds: 30 * 24 * 3600,
    });
    const claims = decodePayload(jwt);
    expect(claims.sub).toBe('op-7');
    expect(claims.itemId).toBe('k7');
    expect(claims.aud).toBe('marketplace.kernel');
    expect(claims.licenseType).toBe('subscription');
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it('verifyLicenseJwt returns valid:true with the HSM public key', () => {
    const jwt = issueLicenseJwt(hsm, {
      tenantId: 'op-1',
      itemId: 'k1',
      itemType: 'kernel',
      purchaseId: 'p1',
    });
    const v = verifyLicenseJwt(jwt, hsm.getPublicKeyHex());
    expect(v.valid).toBe(true);
    expect(v.claims?.sub).toBe('op-1');
  });

  it('verifyLicenseJwt rejects when signature is tampered', () => {
    const jwt = issueLicenseJwt(hsm, {
      tenantId: 'op-1',
      itemId: 'k1',
      itemType: 'kernel',
      purchaseId: 'p1',
    });
    const parts = jwt.split('.');
    const tampered = `${parts[0]}.${parts[1]}.AAAA${parts[2].slice(4)}`;
    const v = verifyLicenseJwt(tampered, hsm.getPublicKeyHex());
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('signature_invalid');
  });

  it('verifyLicenseJwt rejects when payload is mutated', () => {
    const jwt = issueLicenseJwt(hsm, {
      tenantId: 'op-1',
      itemId: 'k1',
      itemType: 'kernel',
      purchaseId: 'p1',
    });
    const parts = jwt.split('.');
    // Re-encode payload with a different tenant id while keeping sig.
    const evilPayload = Buffer.from(
      JSON.stringify({ ...decodePayload(jwt), sub: 'op-EVIL' })
    )
      .toString('base64')
      .replace(/=+$/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const tampered = `${parts[0]}.${evilPayload}.${parts[2]}`;
    const v = verifyLicenseJwt(tampered, hsm.getPublicKeyHex());
    expect(v.valid).toBe(false);
  });

  it('verifyLicenseJwt rejects when expired', () => {
    const jwt = issueLicenseJwt(hsm, {
      tenantId: 'op-1',
      itemId: 'k1',
      itemType: 'kernel',
      purchaseId: 'p1',
      licenseType: 'subscription',
      ttlSeconds: 60,
    });
    // Look 1 day in the future.
    const future = Math.floor(Date.now() / 1000) + 86_400;
    const v = verifyLicenseJwt(jwt, hsm.getPublicKeyHex(), { now: future });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('expired');
  });

  it('perpetual licenses (exp=0) never expire', () => {
    const jwt = issueLicenseJwt(hsm, {
      tenantId: 'op-1',
      itemId: 'k1',
      itemType: 'kernel',
      purchaseId: 'p1',
      licenseType: 'perpetual',
    });
    const future = Math.floor(Date.now() / 1000) + 100 * 365 * 86_400;
    const v = verifyLicenseJwt(jwt, hsm.getPublicKeyHex(), { now: future });
    expect(v.valid).toBe(true);
  });

  it('malformed JWT returns valid:false / reason malformed', () => {
    const v = verifyLicenseJwt('not.a.jwt!!extra', hsm.getPublicKeyHex());
    expect(v.valid).toBe(false);
  });

  it('signer kid is embedded in the header', () => {
    const jwt = issueLicenseJwt(hsm, {
      tenantId: 'op-1',
      itemId: 'k1',
      itemType: 'kernel',
      purchaseId: 'p1',
    });
    const headerB64 = jwt.split('.')[0];
    const header = JSON.parse(
      Buffer.from(headerB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
        'utf8'
      )
    );
    expect(header.alg).toBe('Ed25519');
    expect(header.kid).toBe(hsm.getPublicKeyHex().slice(0, 16));
  });

  it('different invocations produce different jti (anti-replay)', () => {
    const a = issueLicenseJwt(hsm, {
      tenantId: 'op-1',
      itemId: 'k1',
      itemType: 'kernel',
      purchaseId: 'p1',
    });
    const b = issueLicenseJwt(hsm, {
      tenantId: 'op-1',
      itemId: 'k1',
      itemType: 'kernel',
      purchaseId: 'p1',
    });
    expect(decodePayload(a).jti).not.toBe(decodePayload(b).jti);
  });
});

function decodePayload(jwt: string): MarketplaceLicenseClaims {
  const part = jwt.split('.')[1];
  const std = part.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(std, 'base64').toString('utf8'));
}
