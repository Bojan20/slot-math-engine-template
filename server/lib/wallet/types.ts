/**
 * W210 Faza 600.0 — Live Operator Integration. Wallet provider contract.
 *
 * Every connector to a real-money wallet aggregator implements this
 * interface. The orchestrator (`wallet/orchestrator.ts`) is provider-
 * agnostic and only ever talks through `WalletProvider`.
 *
 * Failure modes — implementations MUST throw `WalletProviderError`
 * (with a canonical `code`) so the caller can map cleanly to player-
 * facing reasons and audit events. Successful operations return a
 * `WalletTx` whose `ref` round-trips for idempotency.
 */
export type WalletTxKind = 'debit' | 'credit' | 'rollback';
export type WalletErrorCode =
  | 'auth_failed'
  | 'insufficient_funds'
  | 'duplicate_ref'
  | 'unknown_ref'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'invalid_signature'
  | 'invalid_currency'
  | 'unknown';

export interface WalletTx {
  /** Provider-side transaction id (echoed in audit). */
  providerTxId: string;
  /** Echo of the idempotency reference the caller passed in. */
  ref: string;
  kind: WalletTxKind;
  amount: number;
  currency: string;
  balanceAfter: number;
  /** Round-trip latency in ms — populated by orchestrator. */
  latencyMs?: number;
  /** Wall-clock at the provider side (ISO). */
  timestamp: string;
}

export interface AuthClaims {
  playerId: string;
  tenantId: string;
  jurisdiction: string;
  /** Optional currency hint (provider-specific). */
  currency?: string;
}

export interface ProviderHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface BalanceResult {
  amount: number;
  currency: string;
  /** Some providers split into cash + bonus. */
  bonus?: number;
}

export interface WalletProvider {
  readonly name: string;
  debit(
    playerToken: string,
    amount: number,
    currency: string,
    ref: string
  ): Promise<WalletTx>;
  credit(
    playerToken: string,
    amount: number,
    currency: string,
    ref: string
  ): Promise<WalletTx>;
  rollback(originalRef: string): Promise<WalletTx>;
  getBalance(playerToken: string): Promise<BalanceResult>;
  authenticate(token: string): Promise<AuthClaims>;
  healthcheck(): Promise<ProviderHealth>;
}

export class WalletProviderError extends Error {
  readonly code: WalletErrorCode;
  readonly providerName: string;
  readonly httpStatus?: number;
  constructor(opts: {
    code: WalletErrorCode;
    message: string;
    providerName: string;
    httpStatus?: number;
  }) {
    super(opts.message);
    this.name = 'WalletProviderError';
    this.code = opts.code;
    this.providerName = opts.providerName;
    if (opts.httpStatus !== undefined) this.httpStatus = opts.httpStatus;
  }
}

/**
 * HTTP client surface — providers depend on this rather than `fetch`
 * directly, so tests can inject a deterministic mock. The default
 * impl wraps `globalThis.fetch`.
 */
export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
}

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

/** Provider-specific configuration is a freeform record. */
export type ProviderConfig = Record<string, unknown> & {
  baseUrl: string;
  /** Shared secret for HMAC signing. */
  apiSecret: string;
  /** Per-provider identifier (operatorId, brandId, etc.). */
  operatorId?: string;
  /** Override default 5s timeout. */
  timeoutMs?: number;
};

export type ProviderFactory = (
  cfg: ProviderConfig,
  http?: HttpClient
) => WalletProvider;
