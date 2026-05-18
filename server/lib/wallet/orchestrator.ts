/**
 * W210 Faza 600.0 — Wallet orchestrator.
 *
 * Bridges per-spin game flow to a tenant's configured wallet provider:
 *
 *   1) Look up provider config for tenant
 *   2) Instantiate provider via registry
 *   3) Debit before spin (idempotent via `ref`)
 *   4) Credit win after spin
 *   5) If game/credit fails, issue rollback for the original debit ref
 *
 * Cross-cutting:
 *   - Health cached for 30s via W208 cache
 *   - Every call logs `provider`, `op`, `tenantId`, `latencyMs`
 *   - Errors classified into WalletErrorCode for the audit chain
 */
import type {
  HttpClient,
  WalletProvider,
  WalletProviderError as WPE,
  WalletTx,
} from './types.js';
import { WalletProviderError } from './types.js';
import { instantiateProvider } from './registry.js';
import { logger } from '../observability.js';
import { createCache, type Cache } from '../cache.js';
import type {
  HealthStatus,
  TenantWalletConfigStore,
} from '../../state/tenant-wallet-config.js';

export interface OrchestratorDeps {
  configStore: TenantWalletConfigStore;
  /** Optional injection point for tests. */
  http?: HttpClient;
  /** Optional injection point for the health cache. */
  healthCache?: Cache<HealthCacheValue>;
}

export interface HealthCacheValue {
  ok: boolean;
  latencyMs: number;
  checkedAt: string;
}

export interface SpinDebitInput {
  tenantId: string;
  playerToken: string;
  amount: number;
  currency: string;
  /** Idempotency key — same value across retries to keep wallet single-charge. */
  ref: string;
}

export interface SpinCreditInput {
  tenantId: string;
  playerToken: string;
  amount: number;
  currency: string;
  ref: string;
}

export interface SpinFlowResult {
  debit: WalletTx;
  credit?: WalletTx;
  rollback?: WalletTx;
  /** True when the entire flow committed (or no payout was due). */
  committed: boolean;
  /** Provider name used (for audit). */
  provider: string;
  errorCode?: string;
}

const HEALTH_TTL_MS = 30_000;

export class WalletOrchestrator {
  private readonly configStore: TenantWalletConfigStore;
  private readonly http: HttpClient | undefined;
  private readonly healthCache: Cache<HealthCacheValue>;
  /** Provider instances cached per tenant — they're cheap to rebuild but
   *  re-using lets sticky session state (Playtech) carry across calls. */
  private readonly instances = new Map<string, WalletProvider>();

  constructor(deps: OrchestratorDeps) {
    this.configStore = deps.configStore;
    this.http = deps.http;
    this.healthCache =
      deps.healthCache ?? createCache<HealthCacheValue>({ namespace: 'wallet:health' });
  }

  resolveProvider(tenantId: string): WalletProvider {
    const cached = this.instances.get(tenantId);
    if (cached) return cached;
    const cfg = this.configStore.getTenantWalletConfig(tenantId);
    if (!cfg) {
      throw new WalletProviderError({
        code: 'auth_failed',
        message: `no_wallet_config_for_tenant: ${tenantId}`,
        providerName: 'orchestrator',
      });
    }
    if (!cfg.active) {
      throw new WalletProviderError({
        code: 'provider_unavailable',
        message: `wallet_config_inactive: ${tenantId}`,
        providerName: cfg.providerName,
      });
    }
    const instance = instantiateProvider(cfg.providerName, cfg.config, this.http);
    this.instances.set(tenantId, instance);
    return instance;
  }

  /** Drop cached instances (used after config update + in tests). */
  invalidate(tenantId?: string): void {
    if (tenantId) {
      this.instances.delete(tenantId);
    } else {
      this.instances.clear();
    }
  }

  async debit(input: SpinDebitInput): Promise<WalletTx> {
    const provider = this.resolveProvider(input.tenantId);
    const start = Date.now();
    try {
      const tx = await provider.debit(
        input.playerToken,
        input.amount,
        input.currency,
        input.ref
      );
      const latencyMs = Date.now() - start;
      tx.latencyMs = latencyMs;
      logger.info('wallet.debit.ok', {
        provider: provider.name,
        tenantId: input.tenantId,
        ref: input.ref,
        latencyMs,
      });
      return tx;
    } catch (e) {
      const latencyMs = Date.now() - start;
      const code = e instanceof WalletProviderError ? e.code : 'unknown';
      logger.warn('wallet.debit.fail', {
        provider: provider.name,
        tenantId: input.tenantId,
        ref: input.ref,
        latencyMs,
        code,
      });
      throw e;
    }
  }

  async credit(input: SpinCreditInput): Promise<WalletTx> {
    const provider = this.resolveProvider(input.tenantId);
    const start = Date.now();
    try {
      const tx = await provider.credit(
        input.playerToken,
        input.amount,
        input.currency,
        input.ref
      );
      const latencyMs = Date.now() - start;
      tx.latencyMs = latencyMs;
      logger.info('wallet.credit.ok', {
        provider: provider.name,
        tenantId: input.tenantId,
        ref: input.ref,
        latencyMs,
      });
      return tx;
    } catch (e) {
      const latencyMs = Date.now() - start;
      const code = e instanceof WalletProviderError ? e.code : 'unknown';
      logger.warn('wallet.credit.fail', {
        provider: provider.name,
        tenantId: input.tenantId,
        ref: input.ref,
        latencyMs,
        code,
      });
      throw e;
    }
  }

  async rollback(tenantId: string, originalRef: string): Promise<WalletTx> {
    const provider = this.resolveProvider(tenantId);
    const start = Date.now();
    try {
      const tx = await provider.rollback(originalRef);
      const latencyMs = Date.now() - start;
      tx.latencyMs = latencyMs;
      logger.info('wallet.rollback.ok', {
        provider: provider.name,
        tenantId,
        ref: originalRef,
        latencyMs,
      });
      return tx;
    } catch (e) {
      const latencyMs = Date.now() - start;
      const code = e instanceof WalletProviderError ? e.code : 'unknown';
      logger.error('wallet.rollback.fail', {
        provider: provider.name,
        tenantId,
        ref: originalRef,
        latencyMs,
        code,
      });
      throw e;
    }
  }

  /**
   * Execute a spin's wallet legs atomically: debit before, credit after,
   * rollback if the game function `playSpin` throws.
   */
  async runSpinFlow(opts: {
    tenantId: string;
    playerToken: string;
    bet: number;
    currency: string;
    ref: string;
    playSpin: () => Promise<{ winAmount: number }>;
  }): Promise<SpinFlowResult> {
    const provider = this.resolveProvider(opts.tenantId);
    let debit: WalletTx | undefined;
    try {
      debit = await this.debit({
        tenantId: opts.tenantId,
        playerToken: opts.playerToken,
        amount: opts.bet,
        currency: opts.currency,
        ref: opts.ref,
      });
    } catch (e) {
      const code = e instanceof WalletProviderError ? e.code : 'unknown';
      return {
        debit: {
          providerTxId: '',
          ref: opts.ref,
          kind: 'debit',
          amount: opts.bet,
          currency: opts.currency,
          balanceAfter: 0,
          timestamp: new Date().toISOString(),
        },
        committed: false,
        provider: provider.name,
        errorCode: code,
      };
    }

    let win: { winAmount: number };
    try {
      win = await opts.playSpin();
    } catch (gameErr) {
      logger.warn('wallet.spin.game_failed', {
        provider: provider.name,
        tenantId: opts.tenantId,
        ref: opts.ref,
        err: gameErr instanceof Error ? gameErr.message : String(gameErr),
      });
      let rollback: WalletTx | undefined;
      try {
        rollback = await this.rollback(opts.tenantId, opts.ref);
      } catch {
        /* rollback failure already logged */
      }
      return {
        debit,
        ...(rollback ? { rollback } : {}),
        committed: false,
        provider: provider.name,
        errorCode: 'game_failed',
      };
    }

    if (win.winAmount > 0) {
      try {
        const credit = await this.credit({
          tenantId: opts.tenantId,
          playerToken: opts.playerToken,
          amount: win.winAmount,
          currency: opts.currency,
          ref: `${opts.ref}-win`,
        });
        return { debit, credit, committed: true, provider: provider.name };
      } catch (creditErr) {
        const code = creditErr instanceof WalletProviderError ? creditErr.code : 'unknown';
        let rollback: WalletTx | undefined;
        try {
          rollback = await this.rollback(opts.tenantId, opts.ref);
        } catch {
          /* logged elsewhere */
        }
        return {
          debit,
          ...(rollback ? { rollback } : {}),
          committed: false,
          provider: provider.name,
          errorCode: code,
        };
      }
    }
    return { debit, committed: true, provider: provider.name };
  }

  /**
   * Healthcheck — cached for 30s per tenant. Returns aggregated
   * { tenantId → { ok, latencyMs, provider } }.
   */
  async runHealthChecks(): Promise<
    Array<{
      tenantId: string;
      provider: string;
      ok: boolean;
      latencyMs: number;
      cached: boolean;
    }>
  > {
    const configs = this.configStore.listConfigs();
    const results: Array<{
      tenantId: string;
      provider: string;
      ok: boolean;
      latencyMs: number;
      cached: boolean;
    }> = [];
    for (const cfg of configs) {
      const cacheKey = cfg.tenantId;
      const cached = await this.healthCache.get(cacheKey);
      if (cached) {
        results.push({
          tenantId: cfg.tenantId,
          provider: cfg.providerName,
          ok: cached.ok,
          latencyMs: cached.latencyMs,
          cached: true,
        });
        continue;
      }
      const provider = this.resolveProvider(cfg.tenantId);
      const h = await provider.healthcheck();
      const status: HealthStatus = h.ok ? 'healthy' : 'down';
      this.configStore.updateHealth(cfg.tenantId, status);
      await this.healthCache.set(
        cacheKey,
        { ok: h.ok, latencyMs: h.latencyMs, checkedAt: new Date().toISOString() },
        { ttlMs: HEALTH_TTL_MS }
      );
      results.push({
        tenantId: cfg.tenantId,
        provider: cfg.providerName,
        ok: h.ok,
        latencyMs: h.latencyMs,
        cached: false,
      });
    }
    return results;
  }
}

export type { WPE };
