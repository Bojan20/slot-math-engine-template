/**
 * W210 Faza 600.0 — tenant wallet config store tests.
 *
 *   - encryption-at-rest (AES-256-GCM round-trip)
 *   - tenant isolation (one config per tenant)
 *   - CRUD: set, get, list, deactivate, updateHealth, reset
 *   - corrupt blob handling
 *   - encryption surface helpers exposed
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TenantWalletConfigStore } from '../state/tenant-wallet-config.js';
import {
  encryptConfig,
  decryptConfig,
  encryptConfigBase64,
  decryptConfigBase64,
} from '../lib/wallet/crypto.js';

const CFG = {
  baseUrl: 'https://wallet.example.test',
  apiSecret: 'super-secret',
  operatorId: 'op-1',
  extra: { foo: 'bar' },
};

describe('wallet/crypto', () => {
  it('encrypt → decrypt round-trips JSON', () => {
    const blob = encryptConfig(CFG);
    const back = decryptConfig(blob);
    expect(back).toEqual(CFG);
  });

  it('produces a different ciphertext on each call (random IV)', () => {
    const a = encryptConfig(CFG).toString('base64');
    const b = encryptConfig(CFG).toString('base64');
    expect(a).not.toBe(b);
  });

  it('base64 helpers round-trip', () => {
    const b64 = encryptConfigBase64(CFG);
    expect(decryptConfigBase64(b64)).toEqual(CFG);
  });

  it('rejects a blob shorter than the header', () => {
    expect(() => decryptConfig(Buffer.from([1, 2, 3]))).toThrow();
  });

  it('throws on a tampered auth tag', () => {
    const blob = encryptConfig(CFG);
    // Tamper somewhere inside the GCM auth tag (offset 1+12=13).
    blob[14] ^= 0xff;
    expect(() => decryptConfig(blob)).toThrow();
  });
});

describe('TenantWalletConfigStore', () => {
  let s: TenantWalletConfigStore;
  beforeEach(() => {
    s = new TenantWalletConfigStore();
  });

  it('set + get returns decrypted plaintext config', () => {
    s.setTenantWalletConfig('t1', 'generic-pam', CFG);
    const got = s.getTenantWalletConfig('t1');
    expect(got).not.toBeNull();
    expect(got!.config).toEqual(CFG);
    expect(got!.providerName).toBe('generic-pam');
    expect(got!.active).toBe(true);
  });

  it('stores ciphertext at rest — apiSecret not visible in raw blob', () => {
    s.setTenantWalletConfig('t1', 'generic-pam', CFG);
    const raw = s.rawEncrypted('t1');
    expect(raw).toBeTruthy();
    const decoded = Buffer.from(raw!, 'base64').toString('binary');
    expect(decoded).not.toContain('super-secret');
    expect(decoded).not.toContain('apiSecret');
  });

  it('update replaces config but keeps id', () => {
    s.setTenantWalletConfig('t1', 'generic-pam', CFG);
    const first = s.getTenantWalletConfig('t1')!;
    s.setTenantWalletConfig('t1', 'microgaming-style', { ...CFG, baseUrl: 'https://mgs.example' });
    const second = s.getTenantWalletConfig('t1')!;
    expect(second.id).toBe(first.id);
    expect(second.providerName).toBe('microgaming-style');
    expect(second.config.baseUrl).toBe('https://mgs.example');
  });

  it('tenants are isolated — t1 config never leaks to t2', () => {
    s.setTenantWalletConfig('t1', 'generic-pam', { ...CFG, apiSecret: 'A' });
    s.setTenantWalletConfig('t2', 'generic-pam', { ...CFG, apiSecret: 'B' });
    expect(s.getTenantWalletConfig('t1')!.config.apiSecret).toBe('A');
    expect(s.getTenantWalletConfig('t2')!.config.apiSecret).toBe('B');
  });

  it('listConfigs returns all tenants', () => {
    s.setTenantWalletConfig('t1', 'generic-pam', CFG);
    s.setTenantWalletConfig('t2', 'playtech-style', CFG);
    expect(s.listConfigs().length).toBe(2);
  });

  it('updateHealth flips status + stamps lastCheckAt', () => {
    s.setTenantWalletConfig('t1', 'generic-pam', CFG);
    s.updateHealth('t1', 'healthy');
    const c = s.getTenantWalletConfig('t1')!;
    expect(c.healthStatus).toBe('healthy');
    expect(c.lastCheckAt).not.toBeNull();
  });

  it('updateHealth is a no-op for unknown tenant', () => {
    expect(() => s.updateHealth('nope', 'down')).not.toThrow();
  });

  it('deactivate clears the active flag', () => {
    s.setTenantWalletConfig('t1', 'generic-pam', CFG);
    s.deactivate('t1');
    expect(s.getTenantWalletConfig('t1')!.active).toBe(false);
  });

  it('reset clears all configs', () => {
    s.setTenantWalletConfig('t1', 'generic-pam', CFG);
    s.reset();
    expect(s.getTenantWalletConfig('t1')).toBeNull();
    expect(s.listConfigs()).toEqual([]);
  });

  it('handles all 4 built-in provider names', () => {
    const names = [
      'generic-pam',
      'microgaming-style',
      'netent-aggregator',
      'playtech-style',
    ];
    for (let i = 0; i < names.length; i++) {
      s.setTenantWalletConfig(`t${i}`, names[i], CFG);
      expect(s.getTenantWalletConfig(`t${i}`)!.providerName).toBe(names[i]);
    }
  });
});
