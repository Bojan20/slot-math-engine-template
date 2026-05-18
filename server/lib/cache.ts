/**
 * W208 Faza 400.1 — Cache abstraction.
 *
 * Pluggable cache with two adapters:
 *   - InMemoryCacheAdapter — Map-backed, TTL-aware. Default in
 *     NODE_ENV=test and whenever REDIS_URL is not set.
 *   - RedisCacheAdapter    — ioredis-backed. Lazy-loaded so the
 *     dependency is only imported when actually needed in prod.
 *
 * Public surface:
 *   const cache = createCache<MyValue>({ namespace: 'tenant:t1:lobby' });
 *   await cache.set('games', value, { ttlMs: 60_000 });
 *   const v = await cache.get('games');           // → MyValue | null
 *   await cache.incr('hits');
 *   await cache.expire('games', 30_000);
 *   await cache.del('games');
 *   await cache.healthy();                        // → boolean
 *
 * The cache value is generic — callers parameterize `Cache<T>` to keep
 * their stored shape typed end-to-end. Reading a key that was stored
 * with a different `T` is the caller's problem; the adapter does not
 * validate.
 *
 * Counters (incr) share the same key-space and are stored as numbers.
 * On the in-memory adapter they live in a separate Map; on Redis they
 * use INCR semantics. Treat counter keys as a distinct namespace from
 * value keys to avoid surprises.
 */

export interface CacheSetOptions {
  /** Absolute TTL in milliseconds. 0 / undefined → no expiry. */
  ttlMs?: number;
}

export interface Cache<T = unknown> {
  /** Resolve a value or `null` if absent / expired. */
  get(key: string): Promise<T | null>;
  /** Store a value, optionally with TTL. Overwrites if present. */
  set(key: string, value: T, opts?: CacheSetOptions): Promise<void>;
  /** Delete a key. Returns true if it existed, false otherwise. */
  del(key: string): Promise<boolean>;
  /** Atomic counter increment (initialises to 0 if absent). */
  incr(key: string, delta?: number): Promise<number>;
  /** (Re)set TTL on an existing key. No-op if key is absent. */
  expire(key: string, ttlMs: number): Promise<boolean>;
  /** Remove every key that begins with `prefix`. */
  delByPrefix(prefix: string): Promise<number>;
  /** Connection / readiness probe. */
  healthy(): Promise<boolean>;
  /** Release any underlying resources (timers, sockets). */
  close(): Promise<void>;
  /** Aggregate hit/miss counters for diagnostics. */
  stats(): CacheStats;
  /** Reset hit/miss counters (for tests + load drivers). */
  resetStats(): void;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
}

export interface CreateCacheOptions {
  /**
   * Prefix prepended to every key. Example: `tenant:abc:lobby` will
   * cause set('games') → physical key `tenant:abc:lobby:games`.
   */
  namespace?: string;
  /**
   * Force a specific backend. When omitted, the factory uses the
   * `REDIS_URL` env var to decide: present → Redis, absent → memory.
   * Memory is always selected when `NODE_ENV === 'test'`.
   */
  backend?: 'memory' | 'redis';
  /** Override the Redis URL (otherwise read from REDIS_URL). */
  redisUrl?: string;
}

interface MemoryEntry<T> {
  value: T;
  expiresAt: number; // 0 = no expiry
}

/** In-memory cache backend. Used in tests + as the default fallback. */
export class InMemoryCacheAdapter<T = unknown> implements Cache<T> {
  private readonly store = new Map<string, MemoryEntry<T>>();
  private readonly counters = new Map<string, number>();
  private readonly namespace: string;
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private deletes = 0;
  private sweeperHandle: NodeJS.Timeout | null = null;

  constructor(opts: { namespace?: string } = {}) {
    this.namespace = opts.namespace ?? '';
    // Best-effort idle sweeper — runs every 30s, unref'd so it never
    // pins the event loop open in a short-lived process.
    if (typeof setInterval === 'function') {
      this.sweeperHandle = setInterval(() => this.sweepExpired(), 30_000);
      this.sweeperHandle?.unref?.();
    }
  }

  private k(key: string): string {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }

  async get(key: string): Promise<T | null> {
    const phys = this.k(key);
    const e = this.store.get(phys);
    if (!e) {
      this.misses++;
      return null;
    }
    if (e.expiresAt > 0 && e.expiresAt <= Date.now()) {
      this.store.delete(phys);
      this.misses++;
      return null;
    }
    this.hits++;
    return e.value;
  }

  async set(key: string, value: T, opts: CacheSetOptions = {}): Promise<void> {
    const phys = this.k(key);
    const expiresAt = opts.ttlMs && opts.ttlMs > 0 ? Date.now() + opts.ttlMs : 0;
    this.store.set(phys, { value, expiresAt });
    this.sets++;
  }

  async del(key: string): Promise<boolean> {
    const phys = this.k(key);
    const existed = this.store.delete(phys);
    if (existed) this.deletes++;
    return existed;
  }

  async incr(key: string, delta: number = 1): Promise<number> {
    const phys = this.k(key);
    const next = (this.counters.get(phys) ?? 0) + delta;
    this.counters.set(phys, next);
    return next;
  }

  async expire(key: string, ttlMs: number): Promise<boolean> {
    const phys = this.k(key);
    const e = this.store.get(phys);
    if (!e) return false;
    e.expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
    return true;
  }

  async delByPrefix(prefix: string): Promise<number> {
    const phys = this.k(prefix);
    let n = 0;
    for (const k of Array.from(this.store.keys())) {
      if (k.startsWith(phys)) {
        this.store.delete(k);
        n++;
      }
    }
    if (n > 0) this.deletes += n;
    return n;
  }

  async healthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    if (this.sweeperHandle) {
      clearInterval(this.sweeperHandle);
      this.sweeperHandle = null;
    }
    this.store.clear();
    this.counters.clear();
  }

  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.deletes = 0;
  }

  /** Internal — sweep any expired entries. */
  private sweepExpired(): void {
    const now = Date.now();
    for (const [k, e] of this.store) {
      if (e.expiresAt > 0 && e.expiresAt <= now) {
        this.store.delete(k);
      }
    }
  }
}

/**
 * Redis adapter. ioredis is imported lazily so that test environments
 * don't need the dependency at all. If the import fails the constructor
 * throws and the factory falls back to memory.
 */
export class RedisCacheAdapter<T = unknown> implements Cache<T> {
  private readonly namespace: string;
  // ioredis instance — typed loose to avoid forcing the dep on every
  // build target.
  private client: unknown = null;
  private connected = false;
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private deletes = 0;

  constructor(_opts: { namespace?: string; redisUrl: string }) {
    this.namespace = _opts.namespace ?? '';
    // Connect synchronously-but-async via a fire-and-forget. The first
    // operation awaits the connection promise.
    this.ensureClient(_opts.redisUrl);
  }

  private connectPromise: Promise<void> | null = null;

  private ensureClient(url: string): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = (async () => {
      try {
        // Dynamic import → ioredis is optional. If it's not installed
        // we treat the adapter as permanently unhealthy and the caller
        // should fall back via `createCache`. The string concat avoids
        // a static-resolution error when ioredis is not in node_modules.
        const ioredisModuleId = 'ioredis';
        const mod = (await import(/* @vite-ignore */ ioredisModuleId).catch(
          () => null
        )) as { default: new (url: string) => unknown } | null;
        if (!mod) {
          this.connected = false;
          return;
        }
        const RedisCtor = mod.default;
        this.client = new RedisCtor(url);
        this.connected = true;
      } catch {
        this.connected = false;
      }
    })();
    return this.connectPromise;
  }

  private k(key: string): string {
    return this.namespace ? `${this.namespace}:${key}` : key;
  }

  private async call<R>(op: (c: any) => Promise<R>, fallback: R): Promise<R> {
    await this.connectPromise;
    if (!this.connected || !this.client) return fallback;
    try {
      return await op(this.client as any);
    } catch {
      return fallback;
    }
  }

  async get(key: string): Promise<T | null> {
    const phys = this.k(key);
    const raw = await this.call<string | null>((c) => c.get(phys), null);
    if (raw == null) {
      this.misses++;
      return null;
    }
    this.hits++;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: T, opts: CacheSetOptions = {}): Promise<void> {
    const phys = this.k(key);
    const json = JSON.stringify(value);
    if (opts.ttlMs && opts.ttlMs > 0) {
      await this.call((c) => c.set(phys, json, 'PX', opts.ttlMs!), undefined);
    } else {
      await this.call((c) => c.set(phys, json), undefined);
    }
    this.sets++;
  }

  async del(key: string): Promise<boolean> {
    const phys = this.k(key);
    const n = await this.call<number>((c) => c.del(phys), 0);
    if (n > 0) this.deletes++;
    return n > 0;
  }

  async incr(key: string, delta: number = 1): Promise<number> {
    const phys = this.k(key);
    if (delta === 1) {
      return await this.call<number>((c) => c.incr(phys), 0);
    }
    return await this.call<number>((c) => c.incrby(phys, delta), 0);
  }

  async expire(key: string, ttlMs: number): Promise<boolean> {
    const phys = this.k(key);
    const n = await this.call<number>((c) => c.pexpire(phys, ttlMs), 0);
    return n === 1;
  }

  async delByPrefix(prefix: string): Promise<number> {
    const phys = this.k(prefix);
    const keys = await this.call<string[]>(
      async (c) => {
        const out: string[] = [];
        let cursor = '0';
        do {
          const r = await c.scan(cursor, 'MATCH', `${phys}*`, 'COUNT', 200);
          cursor = r[0];
          out.push(...r[1]);
        } while (cursor !== '0');
        return out;
      },
      []
    );
    if (keys.length === 0) return 0;
    const n = await this.call<number>((c) => c.del(...keys), 0);
    if (n > 0) this.deletes += n;
    return n;
  }

  async healthy(): Promise<boolean> {
    await this.connectPromise;
    if (!this.connected || !this.client) return false;
    try {
      const pong = await (this.client as any).ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.client && this.connected) {
      try {
        await (this.client as any).quit();
      } catch {
        // ignore
      }
    }
    this.connected = false;
    this.client = null;
  }

  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.deletes = 0;
  }
}

/** Decide which backend to instantiate. */
function pickBackend(opts: CreateCacheOptions): 'memory' | 'redis' {
  if (opts.backend) return opts.backend;
  if (process.env.NODE_ENV === 'test') return 'memory';
  if (opts.redisUrl || process.env.REDIS_URL) return 'redis';
  return 'memory';
}

/**
 * Build a cache instance using the appropriate backend.
 *
 * In tests this always returns an in-memory cache so that the vitest
 * suite has zero external dependencies.
 */
export function createCache<T = unknown>(opts: CreateCacheOptions = {}): Cache<T> {
  const backend = pickBackend(opts);
  if (backend === 'redis') {
    const url = opts.redisUrl ?? process.env.REDIS_URL!;
    return new RedisCacheAdapter<T>({
      namespace: opts.namespace ?? '',
      redisUrl: url,
    });
  }
  return new InMemoryCacheAdapter<T>({ namespace: opts.namespace ?? '' });
}

/**
 * Convenience helper: cache-aside pattern.
 *
 *   const games = await cacheAside(cache, 'games', 60_000, () => loadGames());
 *
 * Returns the cached value when fresh; otherwise calls the loader,
 * caches the result with the given TTL, and returns it.
 */
export async function cacheAside<T>(
  cache: Cache<T>,
  key: string,
  ttlMs: number,
  loader: () => Promise<T> | T
): Promise<T> {
  const hit = await cache.get(key);
  if (hit !== null) return hit;
  const fresh = await loader();
  await cache.set(key, fresh, { ttlMs });
  return fresh;
}
