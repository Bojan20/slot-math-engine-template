/**
 * W210 Faza 600.0 — minimal HTTP client + test mock.
 *
 * Production uses `globalThis.fetch`; tests inject `MockHttpClient`
 * which queues responses by URL+method. No external dep (no nock).
 */
import type { HttpClient, HttpRequest, HttpResponse } from './types.js';

export class FetchHttpClient implements HttpClient {
  async request(req: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const t = req.timeoutMs
      ? setTimeout(() => controller.abort(), req.timeoutMs)
      : null;
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });
      const body = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return { status: res.status, body, headers };
    } finally {
      if (t) clearTimeout(t);
    }
  }
}

export interface MockResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  /** When true, the response simulates a slow request (rejects with abort). */
  timeout?: boolean;
  /** When true, the next-only handler (auto pop after one match). */
  oneShot?: boolean;
}

interface QueuedHandler {
  match: (req: HttpRequest) => boolean;
  resp: MockResponse;
  hits: number;
}

/**
 * Deterministic HTTP mock used in tests. Register handlers via
 * `onRequest()` and they consume in FIFO order. Unmatched requests
 * raise to surface bugs.
 */
export class MockHttpClient implements HttpClient {
  private handlers: QueuedHandler[] = [];
  readonly calls: HttpRequest[] = [];

  onRequest(match: (req: HttpRequest) => boolean, resp: MockResponse): this {
    this.handlers.push({ match, resp, hits: 0 });
    return this;
  }

  onPath(method: HttpRequest['method'], pathOrUrl: string, resp: MockResponse): this {
    return this.onRequest(
      (r) => r.method === method && r.url.includes(pathOrUrl),
      resp
    );
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    this.calls.push(req);
    for (const h of this.handlers) {
      if (!h.match(req)) continue;
      h.hits++;
      if (h.resp.timeout) {
        throw new Error('AbortError: request timed out');
      }
      const r: HttpResponse = {
        status: h.resp.status,
        body:
          typeof h.resp.body === 'string'
            ? h.resp.body
            : JSON.stringify(h.resp.body),
        headers: h.resp.headers ?? { 'content-type': 'application/json' },
      };
      if (h.resp.oneShot) {
        this.handlers = this.handlers.filter((x) => x !== h);
      }
      return r;
    }
    throw new Error(`MockHttpClient: no handler for ${req.method} ${req.url}`);
  }

  reset(): void {
    this.handlers = [];
    this.calls.length = 0;
  }
}
