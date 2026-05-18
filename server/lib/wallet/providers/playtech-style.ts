/**
 * W210 Faza 600.0 — Playtech IMS-style wallet provider.
 *
 * Identifying features:
 *   - Signature is verified server-side using a JSON-sorted body +
 *     `brand_id` + `cashier_session_id` triplet hashed under HMAC-SHA256.
 *   - Endpoints prefixed `/ims/v1`. All payload fields are snake_case.
 *   - `cashier_session_id` carries the player session, not a JWT.
 *
 * Endpoints:
 *   POST /ims/v1/session/auth         { cashier_session_id }
 *   POST /ims/v1/player/balance       { player_id }
 *   POST /ims/v1/wallet/debit         { player_id, amount, currency, txn_id }
 *   POST /ims/v1/wallet/credit        { player_id, amount, currency, txn_id }
 *   POST /ims/v1/wallet/reverse       { original_txn_id }
 *   GET  /ims/v1/system/health
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

function sortedBody(body: Record<string, unknown> | undefined): string {
  if (!body) return '';
  const keys = Object.keys(body).sort();
  const obj: Record<string, unknown> = {};
  for (const k of keys) obj[k] = body[k];
  return JSON.stringify(obj);
}

function ptSign(secret: string, brandId: string, sessionId: string, body: string): string {
  return createHmac('sha256', secret)
    .update(`${brandId}:${sessionId}:${body}`)
    .digest('hex');
}

export class PlaytechStyleProvider implements WalletProvider {
  readonly name = 'playtech-style';
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly brandId: string;
  private sessionId: string | null = null;
  private readonly timeoutMs: number;

  constructor(cfg: ProviderConfig, http?: HttpClient) {
    this.http = http ?? new FetchHttpClient();
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.secret = cfg.apiSecret;
    this.brandId = cfg.operatorId ?? 'pt-brand-default';
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT;
  }

  /** Capture the session ID set during authenticate() so subsequent calls can sign. */
  setSession(sessionId: string): void {
    this.sessionId = sessionId;
  }

  private async call(
    method: HttpRequest['method'],
    path: string,
    body?: Record<string, unknown>,
    sessionOverride?: string
  ): Promise<HttpResponse> {
    const session = sessionOverride ?? this.sessionId ?? 'no-session';
    const bodyJson = sortedBody(body);
    const sig = ptSign(this.secret, this.brandId, session, bodyJson);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-brand-id': this.brandId,
      'x-cashier-session': session,
      'x-pt-signature': sig,
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
          message: `pt_5xx_${res.status}`,
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
          message: `pt_timeout: ${path}`,
          providerName: this.name,
        });
      }
      throw new WalletProviderError({
        code: 'provider_unavailable',
        message: `pt_network: ${msg}`,
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
        message: 'pt_parse_failed',
        providerName: this.name,
      });
    }
  }

  private bail(res: HttpResponse): never {
    const data = (() => {
      try {
        return JSON.parse(res.body) as { error_code?: string; message?: string };
      } catch {
        return {};
      }
    })();
    const map: Record<string, WalletProviderError['code']> = {
      AUTH_INVALID: 'auth_failed',
      SESSION_EXPIRED: 'auth_failed',
      LOW_BALANCE: 'insufficient_funds',
      TXN_DUPLICATE: 'duplicate_ref',
      TXN_NOT_FOUND: 'unknown_ref',
      CURRENCY_DENIED: 'invalid_currency',
      SIG_INVALID: 'invalid_signature',
    };
    throw new WalletProviderError({
      code: map[data.error_code ?? ''] ?? 'unknown',
      message: data.message ?? data.error_code ?? 'pt_error',
      providerName: this.name,
      httpStatus: res.status,
    });
  }

  async authenticate(token: string): Promise<AuthClaims> {
    const res = await this.call(
      'POST',
      '/ims/v1/session/auth',
      { cashier_session_id: token },
      token
    );
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{
      player_id: string;
      brand_id: string;
      jurisdiction: string;
      currency: string;
    }>(res);
    if (!d.player_id) {
      throw new WalletProviderError({
        code: 'auth_failed',
        message: 'pt_no_player',
        providerName: this.name,
      });
    }
    this.sessionId = token;
    return {
      playerId: d.player_id,
      tenantId: d.brand_id,
      jurisdiction: d.jurisdiction,
      currency: d.currency,
    };
  }

  async getBalance(playerToken: string): Promise<BalanceResult> {
    const res = await this.call('POST', '/ims/v1/player/balance', { player_id: playerToken });
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
    const res = await this.call('POST', '/ims/v1/wallet/debit', {
      player_id: playerToken,
      amount,
      currency,
      txn_id: ref,
    });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{ provider_txn_id: string; balance_after: number; timestamp: string }>(
      res
    );
    return {
      providerTxId: d.provider_txn_id,
      ref,
      kind: 'debit',
      amount,
      currency,
      balanceAfter: d.balance_after,
      timestamp: d.timestamp,
    };
  }

  async credit(
    playerToken: string,
    amount: number,
    currency: string,
    ref: string
  ): Promise<WalletTx> {
    const res = await this.call('POST', '/ims/v1/wallet/credit', {
      player_id: playerToken,
      amount,
      currency,
      txn_id: ref,
    });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{ provider_txn_id: string; balance_after: number; timestamp: string }>(
      res
    );
    return {
      providerTxId: d.provider_txn_id,
      ref,
      kind: 'credit',
      amount,
      currency,
      balanceAfter: d.balance_after,
      timestamp: d.timestamp,
    };
  }

  async rollback(originalRef: string): Promise<WalletTx> {
    const res = await this.call('POST', '/ims/v1/wallet/reverse', {
      original_txn_id: originalRef,
    });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{
      provider_txn_id: string;
      amount: number;
      currency: string;
      balance_after: number;
      timestamp: string;
    }>(res);
    return {
      providerTxId: d.provider_txn_id,
      ref: originalRef,
      kind: 'rollback',
      amount: d.amount,
      currency: d.currency,
      balanceAfter: d.balance_after,
      timestamp: d.timestamp,
    };
  }

  async healthcheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await this.call('GET', '/ims/v1/system/health');
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

export const playtechStyleFactory = (
  cfg: ProviderConfig,
  http?: HttpClient
): WalletProvider => new PlaytechStyleProvider(cfg, http);
