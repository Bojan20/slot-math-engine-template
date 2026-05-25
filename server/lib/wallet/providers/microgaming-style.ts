/**
 * W210 Faza 600.0 — Vendor G-style wallet provider.
 *
 * Legacy MGS (Vendor G Software) pattern: sessionId-based, splits
 * the player's purse into `cashBalance` + `bonusBalance`. Modern
 * implementations sit behind a JSON gateway but the field shape and
 * the cashBalance/bonusBalance split are preserved for compatibility
 * with hundreds of integrators.
 *
 * Endpoints:
 *   POST /session/validate { sessionId }   → claims
 *   POST /purse/get        { sessionId }   → { cashBalance, bonusBalance, currency }
 *   POST /purse/debit      { sessionId, amount, currency, txRef }
 *   POST /purse/credit     { sessionId, amount, currency, txRef }
 *   POST /purse/rollback   { originalTxRef }
 *   GET  /health
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

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export class MicrogamingStyleProvider implements WalletProvider {
  readonly name = 'microgaming-style';
  private readonly http: HttpClient;
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly operatorId: string;
  private readonly timeoutMs: number;

  constructor(cfg: ProviderConfig, http?: HttpClient) {
    this.http = http ?? new FetchHttpClient();
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.secret = cfg.apiSecret;
    this.operatorId = cfg.operatorId ?? 'mgs-default';
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT;
  }

  private async call(
    method: HttpRequest['method'],
    path: string,
    body?: Record<string, unknown>
  ): Promise<HttpResponse> {
    const bodyJson = body ? JSON.stringify(body) : '';
    const nonce = Math.random().toString(36).slice(2, 14);
    const ts = Date.now().toString();
    const sig = sign(this.secret, `${this.operatorId}|${nonce}|${ts}|${bodyJson}`);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-mgs-operator': this.operatorId,
      'x-mgs-nonce': nonce,
      'x-mgs-timestamp': ts,
      'x-mgs-sign': sig,
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
          message: `mgs_5xx_${res.status}`,
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
          message: `mgs_timeout: ${path}`,
          providerName: this.name,
        });
      }
      throw new WalletProviderError({
        code: 'provider_unavailable',
        message: `mgs_network: ${msg}`,
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
        message: 'mgs_parse_failed',
        providerName: this.name,
      });
    }
  }

  private bail(res: HttpResponse): never {
    const data = (() => {
      try {
        return JSON.parse(res.body) as { errorCode?: string; description?: string };
      } catch {
        return {};
      }
    })();
    const map: Record<string, WalletProviderError['code']> = {
      SESSION_INVALID: 'auth_failed',
      INSUFFICIENT_CASH: 'insufficient_funds',
      DUP_TX: 'duplicate_ref',
      UNKNOWN_TX: 'unknown_ref',
      BAD_SIGN: 'invalid_signature',
      CCY_MISMATCH: 'invalid_currency',
    };
    const code = data.errorCode ?? 'UNKNOWN';
    throw new WalletProviderError({
      code: map[code] ?? 'unknown',
      message: data.description ?? code,
      providerName: this.name,
      httpStatus: res.status,
    });
  }

  async authenticate(token: string): Promise<AuthClaims> {
    const res = await this.call('POST', '/session/validate', { sessionId: token });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{
      playerId: string;
      brandId: string;
      jurisdiction: string;
      currency: string;
    }>(res);
    if (!d.playerId) {
      throw new WalletProviderError({
        code: 'auth_failed',
        message: 'mgs_no_player',
        providerName: this.name,
      });
    }
    return {
      playerId: d.playerId,
      tenantId: d.brandId,
      jurisdiction: d.jurisdiction,
      currency: d.currency,
    };
  }

  async getBalance(playerToken: string): Promise<BalanceResult> {
    const res = await this.call('POST', '/purse/get', { sessionId: playerToken });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{ cashBalance: number; bonusBalance: number; currency: string }>(res);
    return { amount: d.cashBalance, currency: d.currency, bonus: d.bonusBalance };
  }

  async debit(
    playerToken: string,
    amount: number,
    currency: string,
    ref: string
  ): Promise<WalletTx> {
    const res = await this.call('POST', '/purse/debit', {
      sessionId: playerToken,
      amount,
      currency,
      txRef: ref,
    });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{
      txId: string;
      cashBalance: number;
      bonusBalance: number;
      timestamp: string;
    }>(res);
    return {
      providerTxId: d.txId,
      ref,
      kind: 'debit',
      amount,
      currency,
      balanceAfter: d.cashBalance + d.bonusBalance,
      timestamp: d.timestamp,
    };
  }

  async credit(
    playerToken: string,
    amount: number,
    currency: string,
    ref: string
  ): Promise<WalletTx> {
    const res = await this.call('POST', '/purse/credit', {
      sessionId: playerToken,
      amount,
      currency,
      txRef: ref,
    });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{
      txId: string;
      cashBalance: number;
      bonusBalance: number;
      timestamp: string;
    }>(res);
    return {
      providerTxId: d.txId,
      ref,
      kind: 'credit',
      amount,
      currency,
      balanceAfter: d.cashBalance + d.bonusBalance,
      timestamp: d.timestamp,
    };
  }

  async rollback(originalRef: string): Promise<WalletTx> {
    const res = await this.call('POST', '/purse/rollback', { originalTxRef: originalRef });
    if (res.status !== 200) this.bail(res);
    const d = this.parse<{
      txId: string;
      amount: number;
      currency: string;
      cashBalance: number;
      bonusBalance: number;
      timestamp: string;
    }>(res);
    return {
      providerTxId: d.txId,
      ref: originalRef,
      kind: 'rollback',
      amount: d.amount,
      currency: d.currency,
      balanceAfter: d.cashBalance + d.bonusBalance,
      timestamp: d.timestamp,
    };
  }

  async healthcheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await this.call('GET', '/health');
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

export const microgamingStyleFactory = (
  cfg: ProviderConfig,
  http?: HttpClient
): WalletProvider => new MicrogamingStyleProvider(cfg, http);
