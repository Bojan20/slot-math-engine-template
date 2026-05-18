/**
 * @slot-math-engine/sdk — REST client.
 *
 * Wraps the Studio/Server APIs so a third-party developer can write
 * code like:
 *
 *   const client = new SlotMathClient({ apiUrl: 'http://localhost:4000' });
 *   const result = await client.computeRTP(ir);
 */

import type {
  ClientOptions,
  IRDocument,
  RTPResult,
  SpinResult,
  RenderConfig,
  SeamlessHandshake,
  ApiError,
} from './types.js';

export class SlotMathClient {
  private readonly apiUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    if (!opts.apiUrl) throw new Error('SlotMathClient: apiUrl is required');
    this.apiUrl = opts.apiUrl.replace(/\/$/, '');
    if (opts.apiKey !== undefined) this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error('SlotMathClient: no fetch implementation (Node <18? pass opts.fetch)');
    }
  }

  /** Health check. */
  async health(): Promise<{ ok: boolean; name: string; version: string }> {
    return this.request<{ ok: boolean; name: string; version: string }>('GET', '/api/health');
  }

  /** Compute RTP for an IR document. */
  async computeRTP(ir: IRDocument): Promise<RTPResult> {
    return this.request<RTPResult>('POST', '/api/gaas/compute-rtp', ir);
  }

  /** Render a runtime config for an IR. */
  async renderIR(ir: IRDocument): Promise<RenderConfig> {
    return this.request<RenderConfig>('POST', '/api/gaas/render-ir', ir);
  }

  /** Server-authoritative spin. */
  async spin(gameId: string, sessionId: string, betAmount: number): Promise<SpinResult> {
    return this.request<SpinResult>('POST', '/api/gaas/spin', {
      gameId,
      sessionId,
      betAmount,
    });
  }

  /** Operator handshake. */
  async seamlessHandshake(operatorId: string): Promise<SeamlessHandshake> {
    return this.request<SeamlessHandshake>(
      'GET',
      `/api/gaas/seamless?operatorId=${encodeURIComponent(operatorId)}`
    );
  }

  /** Lobby — list registered games. */
  async listGames(jurisdiction?: string): Promise<{ games: Array<{ id: string; title: string; rtp: number }>; count: number }> {
    const q = jurisdiction ? `?jurisdiction=${encodeURIComponent(jurisdiction)}` : '';
    return this.request('GET', `/api/lobby/games${q}`);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (this.apiKey) headers['x-api-key'] = this.apiKey;
      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: unknown = null;
      if (text) {
        try { parsed = JSON.parse(text); } catch { parsed = text; }
      }
      if (!res.ok) {
        const err = new Error(`SlotMathClient: ${method} ${path} → ${res.status}`) as ApiError;
        err.statusCode = res.status;
        err.body = parsed;
        throw err;
      }
      return parsed as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Fluent builder for IR documents.
 *
 *  Example:
 *    const ir = new IRBuilder()
 *      .gameId('my-game')
 *      .topology({ kind: 'rectangular', reels: 5, rows: 3 })
 *      .symbolPool({ HP: 3, MP: 3, LP: 3 })
 *      .feature('free_spins', { trigger: 3, count: 10 })
 *      .build();
 */
export class IRBuilder {
  private doc: Partial<IRDocument> = {
    schemaVersion: '2.0',
    symbols: {},
    features: {},
    jurisdictions: ['GENERIC'],
  };

  gameId(id: string): this { this.doc.gameId = id; return this; }
  topology(t: IRDocument['topology']): this { this.doc.topology = t; return this; }
  symbolPool(pool: IRDocument['symbols']): this { this.doc.symbols = { ...pool }; return this; }
  paytable(p: IRDocument['paytable']): this { this.doc.paytable = p; return this; }

  feature(name: string, cfg: NonNullable<IRDocument['features']>[string]): this {
    if (!this.doc.features) this.doc.features = {};
    this.doc.features[name] = cfg;
    return this;
  }

  rtpTarget(rtp: number): this { this.doc.rtpTarget = rtp; return this; }
  jurisdictions(jur: IRDocument['jurisdictions']): this { this.doc.jurisdictions = jur; return this; }
  metadata(m: IRDocument['metadata']): this { this.doc.metadata = m; return this; }

  build(): IRDocument {
    if (!this.doc.gameId) throw new Error('IRBuilder: gameId is required');
    if (!this.doc.topology) throw new Error('IRBuilder: topology is required');
    if (!this.doc.symbols || Object.keys(this.doc.symbols).length === 0) {
      throw new Error('IRBuilder: symbolPool is required');
    }
    return this.doc as IRDocument;
  }
}
