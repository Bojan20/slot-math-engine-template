import { describe, it, expect, vi } from 'vitest';
import { AwsKmsRngProvider } from '../src/crypto/awsKmsRngProvider.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function mockFetch(behavior: (body: string) => Promise<Response> | Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : String(init?.body ?? '');
    void input;
    return behavior(body);
  }) as typeof fetch;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/x-amz-json-1.1' },
  });
}

// ─── construction guards ──────────────────────────────────────────────────────

describe('AwsKmsRngProvider — construction', () => {
  it('rejects missing region', () => {
    expect(() => new AwsKmsRngProvider({ region: '' as string })).toThrow(/region required/);
  });

  it('open() throws when AWS credentials are not present', async () => {
    // Wipe env credentials for this test to force the failure path.
    const origId = process.env['AWS_ACCESS_KEY_ID'];
    const origSec = process.env['AWS_SECRET_ACCESS_KEY'];
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['AWS_SECRET_ACCESS_KEY'];
    try {
      const p = new AwsKmsRngProvider({ region: 'eu-west-1' });
      await expect(p.open({})).rejects.toThrow(/no AWS credentials/);
    } finally {
      if (origId !== undefined) process.env['AWS_ACCESS_KEY_ID'] = origId;
      if (origSec !== undefined) process.env['AWS_SECRET_ACCESS_KEY'] = origSec;
    }
  });

  it('open() succeeds with explicit credentials and returns a session', async () => {
    const p = new AwsKmsRngProvider({
      region: 'eu-west-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch((body) => {
        const req = JSON.parse(body);
        expect(req.NumberOfBytes).toBeGreaterThan(0);
        return jsonResponse({ Plaintext: Buffer.alloc(req.NumberOfBytes).toString('base64') });
      }),
    });
    const sess = await p.open({});
    expect(sess).toBeDefined();
    await sess.close();
  });
});

// ─── generateRandomBytes ──────────────────────────────────────────────────────

describe('AwsKmsRngProvider — generateRandomBytes', () => {
  it('returns the requested number of bytes', async () => {
    const calls: number[] = [];
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch((body) => {
        const n = JSON.parse(body).NumberOfBytes as number;
        calls.push(n);
        return jsonResponse({ Plaintext: Buffer.alloc(n, 0xab).toString('base64') });
      }),
    });
    const sess = await p.open({});
    const bytes = await sess.generateRandomBytes(64);
    expect(bytes.length).toBe(64);
    expect(bytes.every((b) => b === 0xab)).toBe(true);
    expect(calls).toEqual([64]);
    await sess.close();
  });

  it('chunks requests > 1024 bytes (AWS-imposed cap)', async () => {
    const calls: number[] = [];
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch((body) => {
        const n = JSON.parse(body).NumberOfBytes as number;
        calls.push(n);
        return jsonResponse({ Plaintext: Buffer.alloc(n).toString('base64') });
      }),
    });
    const sess = await p.open({});
    const bytes = await sess.generateRandomBytes(2500); // → 1024 + 1024 + 452
    expect(bytes.length).toBe(2500);
    expect(calls).toEqual([1024, 1024, 452]);
    await sess.close();
  });

  it('zero-byte request returns empty array without calling KMS', async () => {
    const fetchImpl = vi.fn(mockFetch(() => jsonResponse({ Plaintext: '' })));
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl,
    });
    const sess = await p.open({});
    const bytes = await sess.generateRandomBytes(0);
    expect(bytes.length).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    await sess.close();
  });

  it('throws on negative / non-integer byte counts', async () => {
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch(() => jsonResponse({ Plaintext: '' })),
    });
    const sess = await p.open({});
    await expect(sess.generateRandomBytes(-1)).rejects.toThrow(/non-negative integer/);
    await expect(sess.generateRandomBytes(1.5)).rejects.toThrow(/non-negative integer/);
    await sess.close();
  });

  it('throws after session is closed', async () => {
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch(() => jsonResponse({ Plaintext: 'AA==' })),
    });
    const sess = await p.open({});
    await sess.close();
    await expect(sess.generateRandomBytes(1)).rejects.toThrow(/after close/);
  });

  it('propagates KMS HTTP errors with transient flag for 429 / 5xx', async () => {
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch(() => new Response('Rate exceeded', { status: 429 })),
    });
    const sess = await p.open({});
    await expect(sess.generateRandomBytes(16)).rejects.toMatchObject({
      message: expect.stringContaining('HTTP 429'),
      transient: true,
    });
    await sess.close();
  });

  it('propagates KMS HTTP 400 as non-transient', async () => {
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch(() => new Response('Bad', { status: 400 })),
    });
    const sess = await p.open({});
    await expect(sess.generateRandomBytes(16)).rejects.toMatchObject({
      transient: false,
    });
    await sess.close();
  });

  it('throws when KMS payload is missing Plaintext', async () => {
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch(() => jsonResponse({ NotPlaintext: 'oops' })),
    });
    const sess = await p.open({});
    await expect(sess.generateRandomBytes(16)).rejects.toThrow(/missing Plaintext/);
    await sess.close();
  });
});

// ─── healthCheck ──────────────────────────────────────────────────────────────

describe('AwsKmsRngProvider — healthCheck', () => {
  it('returns ok=true when KMS responds', async () => {
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch(() => jsonResponse({ Plaintext: 'AA==' })),
    });
    const sess = await p.open({});
    const h = await sess.healthCheck();
    expect(h.ok).toBe(true);
    expect(h.vendor).toBe('aws-kms');
    expect(h.serialNo).toBe('kms-us-east-1');
    await sess.close();
  });

  it('returns ok=false when KMS errors', async () => {
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch(() => new Response('Internal Server Error', { status: 500 })),
    });
    const sess = await p.open({});
    const h = await sess.healthCheck();
    expect(h.ok).toBe(false);
    await sess.close();
  });

  it('returns ok=false after close', async () => {
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: mockFetch(() => jsonResponse({ Plaintext: 'AA==' })),
    });
    const sess = await p.open({});
    await sess.close();
    const h = await sess.healthCheck();
    expect(h.ok).toBe(false);
  });

  it('honours custom vendor label', async () => {
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      vendor: 'aws-kms-cloudhsm-fips140-3',
      fetchImpl: mockFetch(() => jsonResponse({ Plaintext: 'AA==' })),
    });
    const sess = await p.open({});
    const h = await sess.healthCheck();
    expect(h.vendor).toBe('aws-kms-cloudhsm-fips140-3');
    await sess.close();
  });
});

// ─── SigV4 wire-format ────────────────────────────────────────────────────────

describe('AwsKmsRngProvider — wire format', () => {
  it('sends SigV4-signed POST with X-Amz-Target = TrentService.GenerateRandom', async () => {
    let captured: Record<string, string> | null = null;
    const p = new AwsKmsRngProvider({
      region: 'eu-west-1',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: (async (_url: unknown, init?: RequestInit) => {
        captured = Object.fromEntries(
          Object.entries((init?.headers ?? {}) as Record<string, string>)
        );
        return jsonResponse({ Plaintext: Buffer.alloc(1).toString('base64') });
      }) as typeof fetch,
    });
    const sess = await p.open({});
    await sess.generateRandomBytes(1);
    expect(captured).not.toBeNull();
    expect(captured!['X-Amz-Target']).toBe('TrentService.GenerateRandom');
    expect(captured!['Content-Type']).toBe('application/x-amz-json-1.1');
    expect(captured!['Authorization']).toMatch(/^AWS4-HMAC-SHA256 /);
    await sess.close();
  });

  it('uses custom endpoint when provided', async () => {
    let capturedUrl: string | null = null;
    const p = new AwsKmsRngProvider({
      region: 'eu-west-1',
      endpoint: 'kms.local',
      credentials: { accessKeyId: 'AKID', secretAccessKey: 'SK' },
      fetchImpl: (async (url: unknown) => {
        capturedUrl = String(url);
        return jsonResponse({ Plaintext: 'AA==' });
      }) as typeof fetch,
    });
    const sess = await p.open({});
    await sess.generateRandomBytes(1);
    expect(capturedUrl).toBe('https://kms.local/');
    await sess.close();
  });

  it('includes X-Amz-Security-Token when sessionToken is set', async () => {
    let captured: Record<string, string> | null = null;
    const p = new AwsKmsRngProvider({
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'AKID',
        secretAccessKey: 'SK',
        sessionToken: 'sess-token',
      },
      fetchImpl: (async (_url: unknown, init?: RequestInit) => {
        captured = Object.fromEntries(
          Object.entries((init?.headers ?? {}) as Record<string, string>)
        );
        return jsonResponse({ Plaintext: 'AA==' });
      }) as typeof fetch,
    });
    const sess = await p.open({});
    await sess.generateRandomBytes(1);
    expect(captured).not.toBeNull();
    expect(captured!['X-Amz-Security-Token']).toBe('sess-token');
    await sess.close();
  });
});

// ─── Credentials resolution ───────────────────────────────────────────────────

describe('AwsKmsRngProvider — credentials resolution', () => {
  it('falls back to AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY env', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'ENV_AKID';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'ENV_SK';
    try {
      const p = new AwsKmsRngProvider({
        region: 'us-east-1',
        fetchImpl: mockFetch(() => jsonResponse({ Plaintext: 'AA==' })),
      });
      const sess = await p.open({});
      const b = await sess.generateRandomBytes(1);
      expect(b.length).toBe(1);
      await sess.close();
    } finally {
      delete process.env['AWS_ACCESS_KEY_ID'];
      delete process.env['AWS_SECRET_ACCESS_KEY'];
    }
  });
});
