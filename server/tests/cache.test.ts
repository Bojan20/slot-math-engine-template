/**
 * W208 Faza 400.1 — cache adapter coverage (in-memory backend).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryCacheAdapter,
  createCache,
  cacheAside,
  type Cache,
} from '../lib/cache.js';

describe('InMemoryCacheAdapter', () => {
  let cache: Cache<unknown>;

  beforeEach(() => {
    cache = new InMemoryCacheAdapter({ namespace: 'tenant:t1' });
  });

  afterEach(async () => {
    await cache.close();
  });

  it('get returns null for missing key', async () => {
    expect(await cache.get('missing')).toBeNull();
    const s = cache.stats();
    expect(s.misses).toBe(1);
    expect(s.hits).toBe(0);
  });

  it('set then get returns the same value', async () => {
    await cache.set('k', { hello: 'world' });
    const v = await cache.get('k');
    expect(v).toEqual({ hello: 'world' });
  });

  it('honours TTL by expiring entries', async () => {
    await cache.set('short', 'v', { ttlMs: 5 });
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.get('short')).toBeNull();
  });

  it('treats ttlMs=0 as no expiry', async () => {
    await cache.set('forever', 'v', { ttlMs: 0 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await cache.get('forever')).toBe('v');
  });

  it('del returns true when key existed, false otherwise', async () => {
    await cache.set('a', 1);
    expect(await cache.del('a')).toBe(true);
    expect(await cache.del('a')).toBe(false);
  });

  it('incr starts at 0 + delta', async () => {
    expect(await cache.incr('counter')).toBe(1);
    expect(await cache.incr('counter')).toBe(2);
    expect(await cache.incr('counter', 5)).toBe(7);
  });

  it('expire updates TTL on existing keys', async () => {
    await cache.set('k', 1, { ttlMs: 10_000 });
    expect(await cache.expire('k', 5)).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.get('k')).toBeNull();
  });

  it('expire returns false for missing keys', async () => {
    expect(await cache.expire('missing', 1000)).toBe(false);
  });

  it('namespacing prevents key collisions across adapters', async () => {
    const a = new InMemoryCacheAdapter<string>({ namespace: 'tenant:A' });
    const b = new InMemoryCacheAdapter<string>({ namespace: 'tenant:B' });
    await a.set('k', 'one');
    await b.set('k', 'two');
    expect(await a.get('k')).toBe('one');
    expect(await b.get('k')).toBe('two');
    await a.close();
    await b.close();
  });

  it('delByPrefix removes every matching key', async () => {
    await cache.set('lobby:games:UKGC', 1);
    await cache.set('lobby:games:MGA', 2);
    await cache.set('license:k1', 3);
    const n = await cache.delByPrefix('lobby:');
    expect(n).toBe(2);
    expect(await cache.get('license:k1')).toBe(3);
  });

  it('reports stats with correct hitRate', async () => {
    cache.resetStats();
    await cache.set('k', 1);
    await cache.get('k'); // hit
    await cache.get('missing'); // miss
    await cache.get('missing2'); // miss
    const s = cache.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(2);
    expect(s.hitRate).toBeCloseTo(1 / 3);
  });

  it('healthy resolves true for in-memory adapter', async () => {
    expect(await cache.healthy()).toBe(true);
  });

  it('factory createCache returns in-memory adapter in test env', async () => {
    const c = createCache({ namespace: 'svc' });
    expect(c).toBeInstanceOf(InMemoryCacheAdapter);
    await c.close();
  });

  it('cacheAside hits loader only once for cold key', async () => {
    let calls = 0;
    const loader = async (): Promise<number> => {
      calls++;
      return 42;
    };
    const c = new InMemoryCacheAdapter<number>();
    const a = await cacheAside<number>(c, 'compute', 1_000, loader);
    const b = await cacheAside<number>(c, 'compute', 1_000, loader);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(calls).toBe(1);
    await c.close();
  });

  it('close clears stored data', async () => {
    await cache.set('a', 1);
    await cache.close();
    expect(await cache.get('a')).toBeNull();
  });
});
