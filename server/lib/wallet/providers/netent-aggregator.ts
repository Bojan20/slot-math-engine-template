/**
 * W210 Faza 600.0 — Vendor D-Aggregator / MGS Quickfire pattern.
 *
 * Distinguishing features:
 *   - Strict idempotency keys: every mutating request carries an
 *     `Idempotency-Key` header that must hash-match the body.
 *   - Currency exchange is a separate sub-resource — the provider
 *     advertises a player's base currency, and the orchestrator must
 *     pass a `currencyHint` matching it.
 *
 * Endpoints:
 *   POST /v2/identify            { jwt }
 *   GET  /v2/balance             ?playerRef=
 *   POST /v2/tx/debit            { playerRef, amount, currency, transactionRef }
 *   POST /v2/tx/credit           { playerRef, amount, currency, transactionRef }
 *   POST /v2/tx/rollback         { originalTransactionRef }
 *   GET  /v2/ping
 */
import { createHash, createHmac } from 'node:crypto';
import type {
  AuthClaims,
  BalanceResult,
  HttpClient,
  HttpRequest,
  HttpResponse,
  ProviderConfig,
  ProviderHealth,
  WalletProvider,
  WalletTx,
} from '../types.js';
import { WalletProviderError } from '../types.js';
import { FetchHttpClient } from '../http.js';

const DEFAULT_TIMEOUT = 5_000;

function idemKey(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 32);
}

function sign(secret: string, body: string, idem: string): string {
  return createHmac('sha256', secret).update(`${idem}.${body}`).digest('hex');
}

export class NetEntAggregatorProvider implements WalletProvider {
  readonly name = 'netent-aggregator';
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly operatorId: string;
  private readonly timeoutMs: number;

  constructor(cfg: ProviderConfig, http?: HttpClient) {
    this.http = http ?? new FetchHttpClient();
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.secret = cfg.apiSecret;
    this.operatorId = cfg.operatorId ?? 'qf-default';
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT;
  }

  private async call(
    method: HttpRequest['method'],
    path: string,
    body?: Record<string, unknown>
  ): Promise<HttpResponse> {
    const bodyJson = body ? JSON.stringify(body) : '';
    const idem = idemKey(bodyJson || `${method}:${path}`);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-operator': this.operatorId,
      'idempotency-key': idem,
      'x-qf-sign': sign(this.secret, bodyJson, idem),
    };
    try {
      const res = await this.http.request({
        method,
        url: this.baseUrl + path,
        headers,
        ...(bodyJson ? { body: bodyJson } : {}),
        timeoutMs: this.timeoutMs,
      });
      if (res.status >= 500) {
        throw new WalletProviderError({
          code: 'provider_unavailable',
          message: `netent_5xx_${res.status}`,
          providerName: this.name,
          httpStatus: res.status,
        });
      }
      return res;
    } catch (e) {
      if (e instanceof WalletProviderError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Abort') || msg.includes('timed out')) {
        throw new WalletProviderError({
          code: 'provider_timeout',
          message: `netent_timeout: ${path}`,
          providerName: this.name,
        });
      }
      throw new WalletProviderError({
        code: 'provider_unavailable',
        message: `netent_network: ${msg}`,
        providerName: this.name,
      });
    }
  }

  private parse<T>(res: HttpResponse): T {
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new WalletProviderError({
        code: 'unknown',
        message: 'netent_parse_failed',
        providerName: this.name,
      });
    }
  }

  private bail(res: HttpResponse): never {
    const data = (() => {
      try {
        return JSON.parse(res.body) as { code?: string; description?: string };
      } catch {
        return {};
      }
    })();
    const map: Record<string, WalletProviderError['code']> = {
      'auth.invalid': 'auth_failed',
      'wallet.insufficient_funds': 'insufficient_funds',
      'tx.duplicate': 'duplicate_ref',
      'tx.not_found': 'unknown_ref',
      'currency.mismatch': 'invalid_currency',
      'signature.invalid': 'invalid_signature',
    };
    throw new WalletProviderError({
      code: map[data.code ?? ''] ?? 'unknown',
      message: data.description ?? data.code ?? 'netent_error',
      providerName: this.name,
      httpStatus: res.status,
    });
  }

  async authenticate(token: string): Promise<AuthClaims> {
    const res = await this.call('POST', '/v2/identify', { jwt: token });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{
      playerRef: string;
      brandId: string;
      jurisdiction: string;
      baseCurrency: string;
    }>(res);
    if (!d.playerRef) {
      throw new WalletProviderError({
        code: 'auth_failed',
        message: 'netent_no_player',
        providerName: this.name,
      });
    }
    return {
      playerId: d.playerRef,
      tenantId: d.brandId,
      jurisdiction: d.jurisdiction,
      currency: d.baseCurrency,
    };
  }

  async getBalance(playerToken: string): Promise<BalanceResult> {
    const res = await this.call(
      'GET',
      `/v2/balance?playerRef=${encodeURIComponent(playerToken)}`
    );
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{ amount: number; currency: string }>(res);
    return { amount: d.amount, currency: d.currency };
  }

  async debit(
    playerToken: string,
    amount: number,
    currency: string,
    ref: string
  ): Promise<WalletTx> {
    const res = await this.call('POST', '/v2/tx/debit', {
      playerRef: playerToken,
      amount,
      currency,
      transactionRef: ref,
    });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{ txId: string; balanceAfter: number; timestamp: string }>(res);
    return {
      providerTxId: d.txId,
      ref,
      kind: 'debit',
      amount,
      currency,
      balanceAfter: d.balanceAfter,
      timestamp: d.timestamp,
    };
  }

  async credit(
    playerToken: string,
    amount: number,
    currency: string,
    ref: string
  ): Promise<WalletTx> {
    const res = await this.call('POST', '/v2/tx/credit', {
      playerRef: playerToken,
      amount,
      currency,
      transactionRef: ref,
    });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{ txId: string; balanceAfter: number; timestamp: string }>(res);
    return {
      providerTxId: d.txId,
      ref,
      kind: 'credit',
      amount,
      currency,
      balanceAfter: d.balanceAfter,
      timestamp: d.timestamp,
    };
  }

  async rollback(originalRef: string): Promise<WalletTx> {
    const res = await this.call('POST', '/v2/tx/rollback', {
      originalTransactionRef: originalRef,
    });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{
      txId: string;
      amount: number;
      currency: string;
      balanceAfter: number;
      timestamp: string;
    }>(res);
    return {
      providerTxId: d.txId,
      ref: originalRef,
      kind: 'rollback',
      amount: d.amount,
      currency: d.currency,
      balanceAfter: d.balanceAfter,
      timestamp: d.timestamp,
    };
  }

  async healthcheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await this.call('GET', '/v2/ping');
      const latencyMs = Date.now() - start;
      return res.status === 200
        ? { ok: true, latencyMs }
        : { ok: false, latencyMs, error: `status_${res.status}` };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

export const netentAggregatorFactory = (
  cfg: ProviderConfig,
  http?: HttpClient
): WalletProvider => new NetEntAggregatorProvider(cfg, http);
