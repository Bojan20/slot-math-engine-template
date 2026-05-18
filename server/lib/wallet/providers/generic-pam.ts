/**
 * W210 Faza 600.0 — Generic PAM/REST wallet provider.
 *
 * This is the lowest-common-denominator pattern: JSON body, HMAC-SHA256
 * signed via `X-Signature: hex(HMAC(secret, METHOD + "\n" + PATH + "\n" + BODY))`.
 *
 * Endpoints:
 *   POST /auth      { token }                       → { playerId, tenantId, jurisdiction, currency }
 *   GET  /balance   ?playerToken=...                → { amount, currency, bonus? }
 *   POST /debit     { playerToken, amount, currency, ref }
 *   POST /credit    { playerToken, amount, currency, ref }
 *   POST /rollback  { originalRef }
 *   GET  /health
 *
 * Used by 200+ aggregators (Pragmatic, Relax, Quickspin, etc. wrap this
 * exact contract). The HMAC scheme is stable across all four built-in
 * adapters but the URL path conventions differ.
 */
import { createHmac } from 'node:crypto';
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

export function hmacSign(method: string, path: string, body: string, secret: string): string {
  const payload = `${method.toUpperCase()}\n${path}\n${body}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export class GenericPamProvider implements WalletProvider {
  readonly name = 'generic-pam';
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;
  private readonly operatorId: string;

  constructor(cfg: ProviderConfig, http?: HttpClient) {
    this.http = http ?? new FetchHttpClient();
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.secret = cfg.apiSecret;
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT;
    this.operatorId = cfg.operatorId ?? 'default';
  }

  private async call(
    method: HttpRequest['method'],
    path: string,
    body?: Record<string, unknown>
  ): Promise<HttpResponse> {
    const bodyJson = body ? JSON.stringify(body) : '';
    const signature = hmacSign(method, path, bodyJson, this.secret);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-operator-id': this.operatorId,
      'x-signature': signature,
      'x-timestamp': Date.now().toString(),
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
          message: `pam_5xx_${res.status}: ${res.body.slice(0, 200)}`,
          providerName: this.name,
          httpStatus: res.status,
        });
      }
      return res;
    } catch (e) {
      if (e instanceof WalletProviderError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('AbortError') || msg.includes('timed out')) {
        throw new WalletProviderError({
          code: 'provider_timeout',
          message: `pam_timeout: ${path}`,
          providerName: this.name,
        });
      }
      throw new WalletProviderError({
        code: 'provider_unavailable',
        message: `pam_network: ${msg}`,
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
        message: `pam_parse_failed: ${res.body.slice(0, 100)}`,
        providerName: this.name,
        httpStatus: res.status,
      });
    }
  }

  private mapError(res: HttpResponse): never {
    const data = (() => {
      try {
        return JSON.parse(res.body) as { error?: string; message?: string };
      } catch {
        return { error: 'unknown', message: res.body };
      }
    })();
    const code = data.error ?? 'unknown';
    const map: Record<string, WalletProviderError['code']> = {
      auth_failed: 'auth_failed',
      invalid_token: 'auth_failed',
      insufficient_funds: 'insufficient_funds',
      duplicate_ref: 'duplicate_ref',
      duplicate: 'duplicate_ref',
      unknown_ref: 'unknown_ref',
      invalid_currency: 'invalid_currency',
      invalid_signature: 'invalid_signature',
    };
    throw new WalletProviderError({
      code: map[code] ?? 'unknown',
      message: data.message ?? code,
      providerName: this.name,
      httpStatus: res.status,
    });
  }

  async authenticate(token: string): Promise<AuthClaims> {
    const res = await this.call('POST', '/auth', { token });
    if (res.status !== 200) this.mapError(res);
    const data = this.parse<{
      playerId: string;
      tenantId: string;
      jurisdiction: string;
      currency?: string;
    }>(res);
    if (!data.playerId || !data.tenantId) {
      throw new WalletProviderError({
        code: 'auth_failed',
        message: 'pam_auth_missing_claims',
        providerName: this.name,
      });
    }
    return data;
  }

  async getBalance(playerToken: string): Promise<BalanceResult> {
    const res = await this.call(
      'GET',
      `/balance?playerToken=${encodeURIComponent(playerToken)}`
    );
    if (res.status !== 200) this.mapError(res);
    const data = this.parse<{ amount: number; currency: string; bonus?: number }>(res);
    return data;
  }

  async debit(
    playerToken: string,
    amount: number,
    currency: string,
    ref: string
  ): Promise<WalletTx> {
    const res = await this.call('POST', '/debit', { playerToken, amount, currency, ref });
    if (res.status !== 200) this.mapError(res);
    const d = this.parse<{ providerTxId: string; balanceAfter: number; timestamp: string }>(res);
    return {
      providerTxId: d.providerTxId,
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
    const res = await this.call('POST', '/credit', { playerToken, amount, currency, ref });
    if (res.status !== 200) this.mapError(res);
    const d = this.parse<{ providerTxId: string; balanceAfter: number; timestamp: string }>(res);
    return {
      providerTxId: d.providerTxId,
      ref,
      kind: 'credit',
      amount,
      currency,
      balanceAfter: d.balanceAfter,
      timestamp: d.timestamp,
    };
  }

  async rollback(originalRef: string): Promise<WalletTx> {
    const res = await this.call('POST', '/rollback', { originalRef });
    if (res.status !== 200) this.mapError(res);
    const d = this.parse<{
      providerTxId: string;
      amount: number;
      currency: string;
      balanceAfter: number;
      timestamp: string;
    }>(res);
    return {
      providerTxId: d.providerTxId,
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
      const res = await this.call('GET', '/health');
      const latencyMs = Date.now() - start;
      if (res.status === 200) return { ok: true, latencyMs };
      return { ok: false, latencyMs, error: `status_${res.status}` };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

export const genericPamFactory = (cfg: ProviderConfig, http?: HttpClient): WalletProvider =>
  new GenericPamProvider(cfg, http);
