import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  verifySelfBinary,
  assertSelfBinary,
  hashFileSha256Hex,
  resolveSelfBinaryPath,
  SelfVerifyError,
} from '../src/integrity/binarySelfVerify.js';

const SANDBOX = join(tmpdir(), `binary-self-verify-${process.pid}`);

const FIX_GOOD = join(SANDBOX, 'good.js');
const FIX_TAMPERED = join(SANDBOX, 'tampered.js');
const FIX_MISSING = join(SANDBOX, 'this-does-not-exist.js');

const SCRIPT_GOOD = '// production module v1.0\nconsole.log("hello");\n';
const SCRIPT_TAMPERED = '// production module v1.0\nconsole.log("hello");\n// attacker-added line\n';

const SHA256_GOOD =
  // Re-computed via `node -e "require(\"crypto\").createHash(\"sha256\").update(\"\\u002F\\u002F production module v1.0\\nconsole.log(\\\"hello\\\");\\n\").digest(\"hex\")"`
  '';

beforeAll(() => {
  mkdirSync(SANDBOX, { recursive: true });
  writeFileSync(FIX_GOOD, SCRIPT_GOOD, 'utf8');
  writeFileSync(FIX_TAMPERED, SCRIPT_TAMPERED, 'utf8');
});

// ─── hashFileSha256Hex ────────────────────────────────────────────────────────

describe('hashFileSha256Hex', () => {
  it('returns a 64-char lowercase hex digest for a readable file', () => {
    const d = hashFileSha256Hex(FIX_GOOD);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns null for a missing file', () => {
    expect(hashFileSha256Hex(FIX_MISSING)).toBeNull();
  });

  it('two different files have different digests', () => {
    expect(hashFileSha256Hex(FIX_GOOD)).not.toBe(hashFileSha256Hex(FIX_TAMPERED));
  });

  it('same file hashed twice returns identical digest', () => {
    expect(hashFileSha256Hex(FIX_GOOD)).toBe(hashFileSha256Hex(FIX_GOOD));
  });
});

// ─── resolveSelfBinaryPath ────────────────────────────────────────────────────

describe('resolveSelfBinaryPath', () => {
  it('returns null for a .ts meta.url (dev loop)', () => {
    expect(resolveSelfBinaryPath('file:///repo/src/index.ts')).toBeNull();
  });

  it('returns the path for a .js meta.url', () => {
    expect(resolveSelfBinaryPath('file:///repo/dist/index.js')).toBe('/repo/dist/index.js');
  });

  it('returns the path for a .mjs meta.url', () => {
    expect(resolveSelfBinaryPath('file:///repo/dist/index.mjs')).toBe('/repo/dist/index.mjs');
  });

  it('returns null for unknown extensions', () => {
    expect(resolveSelfBinaryPath('file:///repo/dist/index.wasm')).toBeNull();
  });

  it('returns null for invalid URLs', () => {
    expect(resolveSelfBinaryPath('not-a-url')).toBeNull();
  });
});

// ─── verifySelfBinary ─────────────────────────────────────────────────────────

describe('verifySelfBinary', () => {
  it('returns ok when expected digest matches', () => {
    const actual = hashFileSha256Hex(FIX_GOOD);
    expect(actual).not.toBeNull();
    const r = verifySelfBinary({ binaryPath: FIX_GOOD, expectedDigestHex: actual });
    expect(r.status).toBe('ok');
    expect(r.actualDigestHex).toBe(actual);
    expect(r.expectedDigestHex).toBe(actual);
    expect(r.reason).toBe('');
  });

  it('returns mismatch when binary differs from expected digest', () => {
    const wrong = hashFileSha256Hex(FIX_TAMPERED);
    const r = verifySelfBinary({ binaryPath: FIX_GOOD, expectedDigestHex: wrong });
    expect(r.status).toBe('mismatch');
    expect(r.reason).toContain('digest mismatch');
  });

  it('returns missing when binary does not exist', () => {
    const r = verifySelfBinary({
      binaryPath: FIX_MISSING,
      expectedDigestHex: 'a'.repeat(64),
    });
    expect(r.status).toBe('missing');
    expect(r.actualDigestHex).toBeNull();
  });

  it('returns missing (strict) when no expected digest provided', () => {
    const r = verifySelfBinary({ binaryPath: FIX_GOOD, expectedDigestHex: null });
    expect(r.status).toBe('missing');
  });

  it('returns unknown (permissive) when no expected digest provided', () => {
    const r = verifySelfBinary({
      binaryPath: FIX_GOOD,
      expectedDigestHex: null,
      mode: 'permissive',
    });
    expect(r.status).toBe('unknown');
    expect(r.actualDigestHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('digest comparison is case-insensitive', () => {
    const actual = hashFileSha256Hex(FIX_GOOD)!;
    const r = verifySelfBinary({
      binaryPath: FIX_GOOD,
      expectedDigestHex: actual.toUpperCase(),
    });
    expect(r.status).toBe('ok');
  });

  it('reports size_bytes for ok / mismatch paths', () => {
    const actual = hashFileSha256Hex(FIX_GOOD)!;
    const r = verifySelfBinary({ binaryPath: FIX_GOOD, expectedDigestHex: actual });
    expect(r.sizeBytes).toBe(SCRIPT_GOOD.length);
  });
});

// ─── assertSelfBinary ────────────────────────────────────────────────────────

describe('assertSelfBinary', () => {
  it('returns SelfVerifyResult on ok', () => {
    const actual = hashFileSha256Hex(FIX_GOOD)!;
    const r = assertSelfBinary({ binaryPath: FIX_GOOD, expectedDigestHex: actual });
    expect(r.status).toBe('ok');
  });

  it('throws SelfVerifyError on mismatch', () => {
    const wrong = hashFileSha256Hex(FIX_TAMPERED)!;
    expect(() =>
      assertSelfBinary({ binaryPath: FIX_GOOD, expectedDigestHex: wrong })
    ).toThrow(SelfVerifyError);
  });

  it('throws SelfVerifyError on missing binary', () => {
    expect(() =>
      assertSelfBinary({
        binaryPath: FIX_MISSING,
        expectedDigestHex: 'a'.repeat(64),
      })
    ).toThrow(SelfVerifyError);
  });

  it('throws SelfVerifyError in strict mode when expected is null', () => {
    expect(() =>
      assertSelfBinary({ binaryPath: FIX_GOOD, expectedDigestHex: null })
    ).toThrow(SelfVerifyError);
  });

  it('returns unknown in permissive mode when expected is null (no throw)', () => {
    const r = assertSelfBinary({
      binaryPath: FIX_GOOD,
      expectedDigestHex: null,
      mode: 'permissive',
    });
    expect(r.status).toBe('unknown');
  });

  it('SelfVerifyError carries the SelfVerifyResult for diagnostics', () => {
    const wrong = hashFileSha256Hex(FIX_TAMPERED)!;
    try {
      assertSelfBinary({ binaryPath: FIX_GOOD, expectedDigestHex: wrong });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SelfVerifyError);
      const err = e as SelfVerifyError;
      expect(err.result.status).toBe('mismatch');
      expect(err.result.checkedPath).toBe(FIX_GOOD);
      expect(err.result.actualDigestHex).toBeTruthy();
    }
  });
});

// ─── cleanup ──────────────────────────────────────────────────────────────────

import { afterAll } from 'vitest';
afterAll(() => {
  try {
    rmSync(SANDBOX, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

// Eliminate unused-var warning on SHA256_GOOD (kept in source for
// future regeneration when the fixtures change shape).
void SHA256_GOOD;
